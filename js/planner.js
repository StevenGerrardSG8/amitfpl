// Planner v2: interactive squad builder.
// Pitch with drag & drop (+ click-to-swap fallback), side player browser,
// captain picking, per-GW chip planning, optimizer, and xP forecasts.
import { state, fmtPrice, num, escapeHtml } from './state.js';
import { playerPhoto } from './ui.js';
import { loadBaseline, buildModel } from './model.js';

const STORAGE_KEY = 'amitfpl:planner:v2';
const QUOTA = { 1: 2, 2: 5, 3: 5, 4: 3 };
const BUDGET = 1000; // £100.0M in API units
const MAX_PER_CLUB = 3;

const CHIPS = [
  { key: 'WC', label: 'Wildcard', boost: false },
  { key: 'FH', label: 'Free Hit', boost: false },
  { key: 'BB', label: 'Bench Boost', boost: true },
  { key: 'TC', label: 'Triple Captain', boost: true },
];

const view = {
  horizon: 5,
  planGw: null,
  squad: [],      // up to 15 player ids
  starters: [],   // up to 11 ids ⊆ squad
  captain: null,
  chips: {},      // eventId -> 'WC' | 'FH' | 'BB' | 'TC'
  filterPos: 'all',
  search: '',
  sortKey: 'xp',
  swapId: null,   // click-to-swap source
  building: false,
};

let sideScroll = 0;

/* ---------------- persistence ---------------- */

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      Object.assign(view, {
        horizon: saved.horizon || 5,
        squad: (saved.squad || []).filter((id) => state.playersById[id]),
        starters: (saved.starters || []).filter((id) => state.playersById[id]),
        captain: saved.captain || null,
        chips: saved.chips || {},
      });
      return;
    }
  } catch { /* fresh start */ }
  try {
    // Migrate the v1 planner (squad list only).
    const v1 = JSON.parse(localStorage.getItem('amitfpl:planner'));
    if (v1?.squad) view.squad = v1.squad.filter((id) => state.playersById[id]);
  } catch { /* nothing to migrate */ }
}

const save = () =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    horizon: view.horizon,
    squad: view.squad,
    starters: view.starters,
    captain: view.captain,
    chips: view.chips,
  }));

/* ---------------- squad rules ---------------- */

const posOf = (id) => state.playersById[id].element_type;

function posCounts(ids) {
  const c = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const id of ids) c[posOf(id)]++;
  return c;
}

function clubCounts(ids) {
  const counts = {};
  for (const id of ids) {
    const t = state.playersById[id].team;
    counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

function formationValid(starterIds) {
  if (starterIds.length !== 11) return false;
  const c = posCounts(starterIds);
  return c[1] === 1 && c[2] >= 3 && c[2] <= 5 && c[3] >= 2 && c[3] <= 5 && c[4] >= 1 && c[4] <= 3;
}

const swapLegal = (starterId, benchId) =>
  formationValid([...view.starters.filter((id) => id !== starterId), benchId]);

const cost = (ids) => ids.reduce((s, id) => s + state.playersById[id].now_cost, 0);

/* ---------------- optimizer (unchanged core) ---------------- */

function buildOptimalSquad(model) {
  const score = {};
  const pools = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of state.bootstrap.elements) {
    if (p.status === 'u' || p.status === 'n') continue;
    score[p.id] = model.horizonTotal(p.id);
    pools[p.element_type].push(p);
  }
  for (const pos of [1, 2, 3, 4]) {
    const byScore = [...pools[pos]].sort((a, b) => score[b.id] - score[a.id]).slice(0, 80);
    const byPrice = [...pools[pos]].sort((a, b) => a.now_cost - b.now_cost).slice(0, 10);
    pools[pos] = [...new Set([...byScore, ...byPrice])];
  }
  let squad = [];
  for (const pos of [1, 2, 3, 4]) {
    const cheap = [...pools[pos]].sort((a, b) => a.now_cost - b.now_cost);
    let taken = 0;
    for (const p of cheap) {
      if (taken >= QUOTA[pos]) break;
      if ((clubCounts(squad)[p.team] || 0) >= MAX_PER_CLUB) continue;
      squad.push(p.id);
      taken++;
    }
  }
  for (let iter = 0; iter < 300; iter++) {
    let best = null;
    for (let i = 0; i < squad.length; i++) {
      const cur = state.playersById[squad[i]];
      for (const cand of pools[cur.element_type]) {
        if (squad.includes(cand.id)) continue;
        if (cost(squad) - cur.now_cost + cand.now_cost > BUDGET) continue;
        const counts = clubCounts(squad.filter((id) => id !== cur.id));
        if ((counts[cand.team] || 0) >= MAX_PER_CLUB) continue;
        const delta = score[cand.id] - score[cur.id];
        if (delta > 0.001 && (!best || delta > best.delta)) best = { i, cand: cand.id, delta };
      }
    }
    if (!best) break;
    squad[best.i] = best.cand;
  }
  return squad;
}

const FORMATIONS = [];
for (let d = 3; d <= 5; d++)
  for (let m = 2; m <= 5; m++)
    for (let f = 1; f <= 3; f++)
      if (d + m + f === 10) FORMATIONS.push([d, m, f]);

function bestXI(model, squadIds, eventId) {
  const byPos = { 1: [], 2: [], 3: [], 4: [] };
  for (const id of squadIds) byPos[posOf(id)].push({ id, xp: model.xp(id, eventId) });
  for (const pos of [1, 2, 3, 4]) byPos[pos].sort((a, b) => b.xp - a.xp);
  let best = null;
  for (const [d, m, f] of FORMATIONS) {
    if (byPos[2].length < d || byPos[3].length < m || byPos[4].length < f || !byPos[1].length) continue;
    const xi = [byPos[1][0], ...byPos[2].slice(0, d), ...byPos[3].slice(0, m), ...byPos[4].slice(0, f)];
    const total = xi.reduce((s, e) => s + e.xp, 0);
    if (!best || total > best.total) best = { xi, total };
  }
  return best;
}

/* ---------------- state upkeep ---------------- */

function selectedGw(model) {
  return view.planGw && model.gws.includes(view.planGw) ? view.planGw : model.gws[0];
}

function ensureConsistency(model) {
  view.squad = [...new Set(view.squad)].filter((id) => state.playersById[id]);
  view.starters = view.starters.filter((id) => view.squad.includes(id));
  if (view.squad.length === 15 && !formationValid(view.starters)) {
    const xi = bestXI(model, view.squad, selectedGw(model));
    if (xi) view.starters = xi.xi.map((e) => e.id);
  }
  if (view.captain && !view.starters.includes(view.captain)) view.captain = null;
  if (!view.captain && view.starters.length) {
    const gw = selectedGw(model);
    view.captain = [...view.starters].sort((a, b) => model.xp(b, gw) - model.xp(a, gw))[0];
  }
}

/* ---------------- mutations ---------------- */

function addPlayer(id) {
  const p = state.playersById[id];
  if (!p || view.squad.includes(id)) return;
  if (posCounts(view.squad)[p.element_type] >= QUOTA[p.element_type]) return;
  if ((clubCounts(view.squad)[p.team] || 0) >= MAX_PER_CLUB) return;
  view.squad.push(id);
  // Slot into the XI while it's still filling up and the shape allows it.
  if (view.starters.length < 11) {
    const c = posCounts(view.starters);
    const max = { 1: 1, 2: 5, 3: 5, 4: 3 };
    if (c[p.element_type] < max[p.element_type]) view.starters.push(id);
  }
}

function removePlayer(id) {
  view.squad = view.squad.filter((x) => x !== id);
  view.starters = view.starters.filter((x) => x !== id);
  if (view.captain === id) view.captain = null;
  if (view.swapId === id) view.swapId = null;
}

function trySwap(aId, bId) {
  // One of the two must be a starter, the other on the bench.
  const starter = view.starters.includes(aId) ? aId : view.starters.includes(bId) ? bId : null;
  const bench = starter === aId ? bId : aId;
  if (!starter || view.starters.includes(bench)) return false;
  if (!swapLegal(starter, bench)) return false;
  view.starters = view.starters.map((id) => (id === starter ? bench : id));
  if (view.captain === starter) view.captain = bench;
  return true;
}

/* ---------------- xP summary ---------------- */

function gwForecast(model, gw) {
  const xi = view.starters.reduce((s, id) => s + model.xp(id, gw), 0);
  const cap = view.captain ? model.xp(view.captain, gw) : 0;
  const bench = view.squad.filter((id) => !view.starters.includes(id))
    .reduce((s, id) => s + model.xp(id, gw), 0);
  const chip = view.chips[gw];
  let total = xi + cap; // captain counts double
  if (chip === 'TC') total += cap;
  if (chip === 'BB') total += bench;
  return total;
}

/* ---------------- rendering ---------------- */

function cardButtons(id, isStarter) {
  const capCls = view.captain === id ? 'on' : '';
  return `<div class="pc-actions">
    ${isStarter ? `<button class="pc-btn pc-cap ${capCls}" data-id="${id}" title="Make captain">C</button>` : ''}
    <button class="pc-btn pc-swap" data-id="${id}" title="Swap with bench/pitch">⇄</button>
    <button class="pc-btn pc-remove" data-id="${id}" title="Remove from squad">✕</button>
  </div>`;
}

function playerCard(model, id, gw, isStarter) {
  const p = state.playersById[id];
  const xp = model.xp(id, gw);
  const isSwapSource = view.swapId === id;
  let swapTarget = false;
  if (view.swapId && view.swapId !== id) {
    const srcStarter = view.starters.includes(view.swapId);
    if (srcStarter !== isStarter) {
      swapTarget = srcStarter ? swapLegal(view.swapId, id) : swapLegal(id, view.swapId);
    }
  }
  return `<div class="pp-card pc-card ${isSwapSource ? 'swap-source' : ''} ${swapTarget ? 'swap-target' : ''}"
       draggable="true" data-id="${id}" data-starter="${isStarter ? 1 : 0}">
    <div class="pp-photo-wrap">
      ${playerPhoto(p, isStarter ? 'pp-photo' : 'pp-photo pp-photo-sm')}
      ${view.captain === id && isStarter ? '<span class="pp-cap" title="Captain">C</span>' : ''}
      <span class="pp-sel">${fmtPrice(p.now_cost)}</span>
    </div>
    <div class="pp-name">${escapeHtml(p.web_name)}</div>
    <span class="pp-xp ${isStarter ? '' : 'pp-xp-sm'}">${xp.toFixed(1)}</span>
    ${cardButtons(id, isStarter)}
  </div>`;
}

function emptySlot(pos) {
  return `<div class="pp-card slot-empty" data-pos="${pos}" title="Pick a ${state.positionsById[pos].singular_name} from the list">
    <div class="slot-circle">+</div>
    <div class="pp-name muted">${state.positionsById[pos].singular_name_short}</div>
  </div>`;
}

function pitchHtml(model, gw) {
  const c = posCounts(view.starters);
  // Show empty XI slots down to the minimum shape while building.
  const XI_MIN = { 1: 1, 2: 3, 3: 2, 4: 1 };
  const rows = [4, 3, 2, 1].map((pos) => {
    const cards = view.starters.filter((id) => posOf(id) === pos)
      .sort((a, b) => model.xp(b, gw) - model.xp(a, gw))
      .map((id) => playerCard(model, id, gw, true));
    const missing = Math.max(0, XI_MIN[pos] - c[pos]);
    for (let i = 0; i < missing; i++) cards.push(emptySlot(pos));
    return cards.length ? `<div class="pitch-row" data-pos="${pos}">${cards.join('')}</div>` : '';
  }).join('');

  const benchIds = view.squad.filter((id) => !view.starters.includes(id))
    .sort((a, b) => (posOf(a) === 1 ? -1 : posOf(b) === 1 ? 1 : model.xp(b, gw) - model.xp(a, gw)));
  const benchCards = benchIds.map((id) => playerCard(model, id, gw, false));
  const squadCounts = posCounts(view.squad);
  for (const pos of [1, 2, 3, 4]) {
    for (let i = squadCounts[pos]; i < QUOTA[pos]; i++) benchCards.push(emptySlot(pos));
  }

  return `
    <div class="pitch">${rows}</div>
    <div class="bench-strip" data-bench="1"><span class="bench-label">Bench</span>${benchCards.join('')}</div>`;
}

function chipsBar(model, gw) {
  const active = view.chips[gw];
  const plannedElsewhere = (key) =>
    Object.entries(view.chips).filter(([e, k]) => +e !== gw && k === key).map(([e]) => `GW${e}`);
  return `<div class="chips-bar">
    <span class="chips-label">Chips · GW${gw}</span>
    ${CHIPS.map(({ key, label }) => {
      const elsewhere = plannedElsewhere(key);
      return `<button class="chip-btn ${active === key ? 'on' : ''}" data-chip="${key}"
        title="${elsewhere.length ? `Also planned: ${elsewhere.join(', ')}` : label}">${label}${elsewhere.length ? ' ·' + elsewhere.join(',') : ''}</button>`;
    }).join('')}
    ${active === 'WC' || active === 'FH' ? '<span class="muted chips-note">marker only — transfers aren\'t simulated yet</span>' : ''}
  </div>`;
}

function sideList(model) {
  const q = view.search.trim().toLowerCase();
  const inSquad = new Set(view.squad);
  const clubs = clubCounts(view.squad);
  const squadPos = posCounts(view.squad);
  let list = state.bootstrap.elements.filter((p) => {
    if (inSquad.has(p.id)) return false;
    if (p.status === 'u' || p.status === 'n') return false;
    if (view.filterPos !== 'all' && p.element_type !== +view.filterPos) return false;
    if (q && !`${p.first_name} ${p.second_name} ${p.web_name}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const sorters = {
    xp: (a, b) => model.horizonTotal(b.id) - model.horizonTotal(a.id),
    priceDesc: (a, b) => b.now_cost - a.now_cost,
    priceAsc: (a, b) => a.now_cost - b.now_cost,
    owned: (a, b) => num(b.selected_by_percent) - num(a.selected_by_percent),
  };
  list.sort(sorters[view.sortKey] || sorters.xp);

  const rows = list.slice(0, 60).map((p) => {
    const posFull = squadPos[p.element_type] >= QUOTA[p.element_type];
    const clubFull = (clubs[p.team] || 0) >= MAX_PER_CLUB;
    const blocked = posFull || clubFull;
    const reason = posFull ? 'Position quota full' : clubFull ? 'Max 3 per club' : 'Add to squad';
    return `<div class="side-row">
      ${playerPhoto(p, 'row-photo')}
      <div class="side-info">
        <span class="player-name">${escapeHtml(p.web_name)}</span>
        <span class="player-meta">${state.positionsById[p.element_type].singular_name_short} · ${state.teamsById[p.team].short_name} · ${fmtPrice(p.now_cost)}</span>
      </div>
      <span class="side-xp" title="Expected points over the plan horizon">${model.horizonTotal(p.id).toFixed(1)}</span>
      <button class="side-add" data-id="${p.id}" ${blocked ? 'disabled' : ''} title="${reason}">+</button>
    </div>`;
  }).join('');

  return `
    <div class="side-controls">
      <input type="search" id="sd-search" placeholder="Search player…" value="${escapeHtml(view.search)}" />
      <div class="side-filters">
        <select id="sd-pos">
          <option value="all">All</option>
          ${state.bootstrap.element_types.map((et) => `<option value="${et.id}" ${view.filterPos == et.id ? 'selected' : ''}>${et.plural_name_short}</option>`).join('')}
        </select>
        <select id="sd-sort">
          <option value="xp" ${view.sortKey === 'xp' ? 'selected' : ''}>Sort: xP</option>
          <option value="priceDesc" ${view.sortKey === 'priceDesc' ? 'selected' : ''}>Price ↓</option>
          <option value="priceAsc" ${view.sortKey === 'priceAsc' ? 'selected' : ''}>Price ↑</option>
          <option value="owned" ${view.sortKey === 'owned' ? 'selected' : ''}>Owned %</option>
        </select>
      </div>
    </div>
    <div class="side-list" id="side-list">${rows || '<div class="note">No players match.</div>'}</div>`;
}

export async function renderPlanner(root) {
  if (!root.dataset.booted) {
    root.innerHTML = '<div class="loading"><div class="spinner"></div><p>Crunching predictions…</p></div>';
  }
  load();
  await loadBaseline();
  const model = buildModel(view.horizon);
  ensureConsistency(model);
  const gw = selectedGw(model);

  const totalCost = cost(view.squad);
  const itb = BUDGET - totalCost;
  const gwChips = model.gws
    .map((e) => `<button class="gw-chip ${e === gw ? 'active' : ''}" data-gw="${e}">GW${e}${view.chips[e] ? ` · ${view.chips[e]}` : ''}</button>`)
    .join('');
  const horizonTotal = model.gws.reduce((s, e) => s + gwForecast(model, e), 0);
  const formationLabel = formationValid(view.starters)
    ? [2, 3, 4].map((pos) => posCounts(view.starters)[pos]).join('-')
    : `${view.starters.length}/11 picked`;

  root.dataset.booted = '1';
  root.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <label>Horizon</label>
        <select id="pl-horizon">
          ${[3, 5, 8].map((n) => `<option value="${n}" ${view.horizon === n ? 'selected' : ''}>${n} GWs</option>`).join('')}
        </select>
        <button class="btn" id="pl-build">${view.squad.length ? '⚡ Re-optimize' : '⚡ Auto-build squad'}</button>
        <button class="btn ghost" id="pl-bestxi" ${view.squad.length === 15 ? '' : 'disabled'}>Best XI for GW${gw}</button>
        <span class="spacer"></span>
        <span class="result-count">
          ${view.squad.length}/15 · <strong>${fmtPrice(totalCost)}</strong> · Bank
          <strong class="${itb < 0 ? 'lo' : ''}">${fmtPrice(itb)}</strong> ·
          Plan xP <strong>${horizonTotal.toFixed(0)}</strong>
        </span>
        <button class="link-btn" id="pl-copy" ${view.squad.length ? '' : 'disabled'}>📋 Copy</button>
        <button class="link-btn" id="pl-clear" ${view.squad.length ? '' : 'disabled'}>Clear</button>
      </div>
      <div class="toolbar" style="border-bottom:none;padding-top:10px">
        <div class="gw-chips">${gwChips}</div>
        <span class="spacer"></span>
        <span class="result-count">${formationLabel} · GW${gw} forecast <strong>${gwForecast(model, gw).toFixed(1)} pts</strong></span>
      </div>
      ${chipsBar(model, gw)}
      <div class="planner-layout">
        <div class="planner-main">${pitchHtml(model, gw)}</div>
        <aside class="planner-side">${sideList(model)}</aside>
      </div>
      ${view.swapId ? '<div class="note">Swap mode: pick a highlighted player to swap with, or click ⇄ again to cancel.</div>' : ''}
    </div>`;

  const rerender = () => { save(); renderPlanner(root); };
  const sideEl = root.querySelector('#side-list');
  if (sideEl) sideEl.scrollTop = sideScroll;

  root.querySelector('#pl-horizon').addEventListener('change', (e) => {
    view.horizon = +e.target.value;
    view.planGw = null;
    rerender();
  });

  root.querySelector('#pl-build').addEventListener('click', () => {
    if (view.building) return;
    view.building = true;
    const btn = root.querySelector('#pl-build');
    btn.textContent = 'Optimizing…';
    btn.disabled = true;
    setTimeout(() => {
      view.squad = buildOptimalSquad(model);
      view.starters = [];
      view.captain = null;
      ensureConsistency(model);
      view.building = false;
      rerender();
    }, 30);
  });

  root.querySelector('#pl-bestxi')?.addEventListener('click', () => {
    const xi = bestXI(model, view.squad, gw);
    if (xi) {
      view.starters = xi.xi.map((e) => e.id);
      view.captain = null;
      ensureConsistency(model);
      rerender();
    }
  });

  root.querySelector('#pl-copy')?.addEventListener('click', async (e) => {
    const label = (id) => {
      const p = state.playersById[id];
      return `${state.positionsById[p.element_type].singular_name_short}  ${p.web_name} (${state.teamsById[p.team].short_name}) ${fmtPrice(p.now_cost)}${view.captain === id ? ' (C)' : ''}`;
    };
    const bench = view.squad.filter((id) => !view.starters.includes(id));
    const text = `amitfpl squad · ${fmtPrice(totalCost)}\nXI:\n${view.starters.map(label).join('\n')}\nBench:\n${bench.map(label).join('\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      e.target.textContent = '✓ Copied';
      setTimeout(() => { e.target.textContent = '📋 Copy'; }, 1500);
    } catch { /* clipboard unavailable */ }
  });

  root.querySelector('#pl-clear')?.addEventListener('click', () => {
    view.squad = [];
    view.starters = [];
    view.captain = null;
    view.swapId = null;
    rerender();
  });

  root.querySelectorAll('.gw-chip').forEach((b) =>
    b.addEventListener('click', () => { view.planGw = +b.dataset.gw; rerender(); })
  );

  root.querySelectorAll('.chip-btn').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.chip;
      view.chips[gw] = view.chips[gw] === key ? undefined : key;
      if (!view.chips[gw]) delete view.chips[gw];
      rerender();
    })
  );

  // Side browser
  root.querySelector('#sd-search').addEventListener('input', (e) => {
    view.search = e.target.value;
    sideScroll = 0;
    save();
    renderPlanner(root).then(() => {
      const inp = root.querySelector('#sd-search');
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
    });
  });
  root.querySelector('#sd-pos').addEventListener('change', (e) => { view.filterPos = e.target.value; sideScroll = 0; rerender(); });
  root.querySelector('#sd-sort').addEventListener('change', (e) => { view.sortKey = e.target.value; sideScroll = 0; rerender(); });
  sideEl?.addEventListener('scroll', () => { sideScroll = sideEl.scrollTop; });

  root.querySelectorAll('.side-add').forEach((b) =>
    b.addEventListener('click', () => { addPlayer(+b.dataset.id); ensureConsistency(model); rerender(); })
  );

  // Card actions
  root.querySelectorAll('.pc-remove').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); removePlayer(+b.dataset.id); rerender(); })
  );
  root.querySelectorAll('.pc-cap').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); view.captain = +b.dataset.id; rerender(); })
  );
  root.querySelectorAll('.pc-swap').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = +b.dataset.id;
      view.swapId = view.swapId === id ? null : id;
      rerender();
    })
  );
  root.querySelectorAll('.pc-card.swap-target').forEach((card) =>
    card.addEventListener('click', () => {
      if (view.swapId && trySwap(view.swapId, +card.dataset.id)) {
        view.swapId = null;
        rerender();
      }
    })
  );
  root.querySelectorAll('.slot-empty').forEach((slot) =>
    slot.addEventListener('click', () => {
      view.filterPos = slot.dataset.pos;
      rerender();
    })
  );

  // Drag & drop: squad card ↔ squad card (starter/bench swap).
  root.querySelectorAll('.pc-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('drop-hover');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drop-hover'));
    card.addEventListener('drop', (e) => {
      e.preventDefault();
      card.classList.remove('drop-hover');
      const dragged = +e.dataTransfer.getData('text/plain');
      const target = +card.dataset.id;
      if (dragged && target && dragged !== target && trySwap(dragged, target)) {
        view.swapId = null;
        rerender();
      }
    });
  });
  return Promise.resolve();
}
