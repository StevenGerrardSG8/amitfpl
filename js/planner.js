// Planner v3: interactive squad builder + season transfer simulation.
// The first GW in the horizon is your editable base squad (pitch drag &
// drop, captain, chips). Later GWs simulate a rolling plan: record
// transfers per GW, free transfers bank up (max 5), extra moves cost
// -4, Wildcard/Free Hit make a GW's moves free (FH reverts after).
import { state, fmtPrice, num, escapeHtml } from './state.js';
import { playerPhoto, teamBadge, inlinePhoto, fixtureChips } from './ui.js';
import { loadBaseline, buildModel } from './model.js';
import { openDrawer } from './drawer.js';
import { t, haMark, gwLabel, posShort, posPlural, playerName, teamShort } from './i18n.js';

// On phones the per-card action buttons become a bottom action sheet.
const isMobile = () => window.matchMedia('(max-width: 640px)').matches;

const SLOT_KEY = 'amitfpl:planner:slot';
const DRAFTS = ['A', 'B', 'C'];
let slot = 'A';
try { slot = localStorage.getItem(SLOT_KEY) || 'A'; } catch { /* private mode */ }
const slotKey = (s) => `amitfpl:planner:v3:${s}`;
const LEGACY_KEY = 'amitfpl:planner:v3';

function draftMeta(s) {
  try {
    const d = JSON.parse(localStorage.getItem(slotKey(s)));
    if (!d) return null;
    return { n: (d.baseSquad || []).length, xp: d.planXp };
  } catch {
    return null;
  }
}
const QUOTA = { 1: 2, 2: 5, 3: 5, 4: 3 };
const BUDGET = 1000; // £100.0M in API units
const MAX_PER_CLUB = 3;
const MAX_FT = 5;

const CHIPS = [
  { key: 'WC', label: () => t('pl.chipWC') },
  { key: 'FH', label: () => t('pl.chipFH') },
  { key: 'BB', label: () => t('pl.chipBB') },
  { key: 'TC', label: () => t('pl.chipTC') },
];

const view = {
  horizon: 5,
  planGw: null,
  baseSquad: [],   // 15 ids at the start of the plan
  starters: [],    // manual XI for the first GW
  captain: null,
  chips: {},       // eventId -> 'WC' | 'FH' | 'BB' | 'TC'
  transfers: {},   // eventId -> [{out, in}] for GWs after the first
  filterPos: 'all',
  search: '',
  maxPrice: '',
  sortKey: 'xp',
  swapId: null,
  pending: null,   // {type:'in'|'out', id} - half-made transfer
  showAssistant: false,
  building: false,
};

let sideScroll = 0;

/* ---------------- persistence ---------------- */

// Cross-device plan sharing: the whole plan travels in the URL hash.
const encodePlan = () => {
  const payload = JSON.stringify({
    h: view.horizon, s: view.baseSquad, x: view.starters,
    c: view.captain, ch: view.chips, t: view.transfers,
  });
  return btoa(unescape(encodeURIComponent(payload))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

function importPlanFromHash() {
  const m = location.hash.match(/^#plan=([A-Za-z0-9_-]+)/);
  if (!m) return false;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const d = JSON.parse(decodeURIComponent(escape(atob(b64))));
    Object.assign(view, {
      horizon: d.h || 5,
      baseSquad: (d.s || []).filter((id) => state.playersById[id]),
      starters: (d.x || []).filter((id) => state.playersById[id]),
      captain: d.c || null,
      chips: d.ch || {},
      transfers: d.t || {},
    });
    save();
    history.replaceState(null, '', '#planner');
    return true;
  } catch {
    return false;
  }
}

function load() {
  if (importPlanFromHash()) return;
  try {
    // One-time migration of the pre-drafts plan into slot A.
    if (!localStorage.getItem(slotKey('A')) && localStorage.getItem(LEGACY_KEY)) {
      localStorage.setItem(slotKey('A'), localStorage.getItem(LEGACY_KEY));
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch { /* fine */ }
  try {
    const saved = JSON.parse(localStorage.getItem(slotKey(slot)));
    if (saved) {
      Object.assign(view, {
        horizon: saved.horizon || 5,
        baseSquad: (saved.baseSquad || []).filter((id) => state.playersById[id]),
        starters: (saved.starters || []).filter((id) => state.playersById[id]),
        captain: saved.captain || null,
        chips: saved.chips || {},
        transfers: saved.transfers || {},
      });
      return;
    }
    Object.assign(view, { baseSquad: [], starters: [], captain: null, chips: {}, transfers: {} });
    if (slot !== 'A') return; // only slot A inherits the old v2 squad
  } catch { /* fresh start */ }
  try {
    // Migrate planner v2 (single squad, no transfers).
    const v2 = JSON.parse(localStorage.getItem('amitfpl:planner:v2'));
    if (v2?.squad) {
      view.baseSquad = v2.squad.filter((id) => state.playersById[id]);
      view.starters = (v2.starters || []).filter((id) => state.playersById[id]);
      view.captain = v2.captain || null;
      view.chips = v2.chips || {};
    }
  } catch { /* nothing to migrate */ }
}

const save = () =>
  localStorage.setItem(slotKey(slot), JSON.stringify({
    horizon: view.horizon,
    baseSquad: view.baseSquad,
    starters: view.starters,
    captain: view.captain,
    chips: view.chips,
    transfers: view.transfers,
    planXp: view._planXp ?? null,
  }));

// Import a real FPL squad (from the My Team tab) into the active draft
// slot, replacing whatever plan is there.
export function importSquad({ squad, starters, captain }) {
  Object.assign(view, {
    baseSquad: (squad || []).filter((id) => state.playersById[id]),
    starters: (starters || []).filter((id) => state.playersById[id]),
    captain: captain && state.playersById[captain] ? captain : null,
    transfers: {},
    chips: {},
    planGw: null,
    pending: null,
    swapId: null,
  });
  save();
}

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

/* ---------------- transfer simulation ---------------- */

const firstGw = (model) => model.gws[0];

// Squad after applying the plan up to (and including) `gw`.
// Free Hit transfers apply only in their own GW.
function squadAt(model, gw) {
  let squad = [...view.baseSquad];
  for (const e of model.gws) {
    if (e > gw) break;
    if (view.chips[e] === 'FH' && e !== gw) continue;
    for (const t of view.transfers[e] || []) {
      squad = squad.map((id) => (id === t.out ? t.in : id));
    }
  }
  return squad;
}

// Free-transfer bookkeeping across the horizon.
function ftInfo(model) {
  const info = {};
  let carry = 1; // FTs available entering the first planned GW
  for (const e of model.gws) {
    const avail = Math.min(MAX_FT, carry);
    const moves = (view.transfers[e] || []).length;
    const chip = view.chips[e];
    const free = chip === 'WC' || chip === 'FH';
    const counted = free ? 0 : moves;
    const hits = Math.max(0, counted - avail) * 4;
    info[e] = { avail, moves, hits, free };
    const leftover = free ? avail : Math.max(0, avail - counted);
    carry = Math.min(MAX_FT, leftover + 1);
  }
  return info;
}

function recordTransfer(model, gw, outId, inId) {
  if (posOf(outId) !== posOf(inId)) return false;
  const squad = squadAt(model, gw);
  if (!squad.includes(outId) || squad.includes(inId)) return false;
  const next = squad.map((id) => (id === outId ? inId : id));
  if ((clubCounts(next)[state.playersById[inId].team] || 0) > MAX_PER_CLUB) return false;
  if (cost(next) > BUDGET) return false; // can't spend money you don't have
  (view.transfers[gw] = view.transfers[gw] || []).push({ out: outId, in: inId });
  return true;
}

function dropTransfer(gw, idx) {
  const list = view.transfers[gw] || [];
  list.splice(idx, 1);
  if (!list.length) delete view.transfers[gw];
}

/* ---------------- optimizer ---------------- */

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
    if (!best || total > best.total) best = { xi: xi.map((e) => e.id), total, formation: `${d}-${m}-${f}` };
  }
  return best;
}

/* ---------------- state upkeep ---------------- */

function selectedGw(model) {
  return view.planGw && model.gws.includes(view.planGw) ? view.planGw : firstGw(model);
}

function ensureConsistency(model) {
  view.baseSquad = [...new Set(view.baseSquad)].filter((id) => state.playersById[id]);
  view.starters = view.starters.filter((id) => view.baseSquad.includes(id));
  for (const e of Object.keys(view.transfers)) {
    view.transfers[e] = view.transfers[e].filter(
      (t) => state.playersById[t.out] && state.playersById[t.in]
    );
    if (!view.transfers[e].length) delete view.transfers[e];
  }
  if (view.baseSquad.length === 15 && !formationValid(view.starters)) {
    const xi = bestXI(model, view.baseSquad, firstGw(model));
    if (xi) view.starters = xi.xi;
  }
  if (view.captain && !view.starters.includes(view.captain)) view.captain = null;
  if (!view.captain && view.starters.length) {
    const gw = firstGw(model);
    view.captain = [...view.starters].sort((a, b) => model.xp(b, gw) - model.xp(a, gw))[0];
  }
}

/* ---------------- base-squad mutations (first GW only) ---------------- */

function addPlayer(id) {
  const p = state.playersById[id];
  if (!p || view.baseSquad.includes(id)) return;
  if (posCounts(view.baseSquad)[p.element_type] >= QUOTA[p.element_type]) return;
  if ((clubCounts(view.baseSquad)[p.team] || 0) >= MAX_PER_CLUB) return;
  view.baseSquad.push(id);
  if (view.starters.length < 11) {
    const c = posCounts(view.starters);
    const max = { 1: 1, 2: 5, 3: 5, 4: 3 };
    if (c[p.element_type] < max[p.element_type]) view.starters.push(id);
  }
}

function removePlayer(id) {
  view.baseSquad = view.baseSquad.filter((x) => x !== id);
  view.starters = view.starters.filter((x) => x !== id);
  if (view.captain === id) view.captain = null;
  if (view.swapId === id) view.swapId = null;
}

function trySwap(aId, bId) {
  const starter = view.starters.includes(aId) ? aId : view.starters.includes(bId) ? bId : null;
  const bench = starter === aId ? bId : aId;
  if (!starter || view.starters.includes(bench)) return false;
  if (!swapLegal(starter, bench)) return false;
  view.starters = view.starters.map((id) => (id === starter ? bench : id));
  if (view.captain === starter) view.captain = bench;
  return true;
}

/* ---------------- forecasts ---------------- */

// Lineup used for a GW's forecast: manual for the first GW, auto later.
function lineupFor(model, gw) {
  const squad = squadAt(model, gw);
  if (gw === firstGw(model) && formationValid(view.starters)) {
    const cap = view.captain;
    return { squad, starters: view.starters, captain: cap, formation: null, manual: true };
  }
  const xi = bestXI(model, squad, gw);
  if (!xi) return { squad, starters: [], captain: null, formation: null, manual: false };
  const captain = [...xi.xi].sort((a, b) => model.xp(b, gw) - model.xp(a, gw))[0];
  return { squad, starters: xi.xi, captain, formation: xi.formation, manual: false };
}

function gwForecast(model, gw, ft) {
  const { squad, starters, captain } = lineupFor(model, gw);
  const xiPts = starters.reduce((s, id) => s + model.xp(id, gw), 0);
  const capPts = captain ? model.xp(captain, gw) : 0;
  const benchPts = squad.filter((id) => !starters.includes(id))
    .reduce((s, id) => s + model.xp(id, gw), 0);
  const chip = view.chips[gw];
  let pts = xiPts + capPts;
  if (chip === 'TC') pts += capPts;
  if (chip === 'BB') pts += benchPts;
  return pts - (ft[gw]?.hits || 0);
}

/* ---------------- assistant ---------------- */

function upgradeSuggestions(model, gw) {
  const squad = squadAt(model, gw);
  const itb = BUDGET - cost(squad);
  const clubs = clubCounts(squad);
  const out = [];
  for (const id of squad) {
    const cur = state.playersById[id];
    const curScore = model.horizonTotal(id);
    let best = null;
    for (const cand of state.bootstrap.elements) {
      if (cand.element_type !== cur.element_type || squad.includes(cand.id)) continue;
      if (cand.status !== 'a' && cand.status !== 'd') continue;
      if (cand.now_cost > cur.now_cost + itb) continue;
      const clubCount = (clubs[cand.team] || 0) - (cand.team === cur.team ? 1 : 0);
      if (clubCount >= MAX_PER_CLUB) continue;
      const gain = model.horizonTotal(cand.id) - curScore;
      if (gain > 0.5 && (!best || gain > best.gain)) best = { cand, gain };
    }
    if (best) out.push({ outId: id, inId: best.cand.id, gain: best.gain });
  }
  const seen = new Set();
  return out
    .sort((a, b) => b.gain - a.gain)
    .filter((s) => (seen.has(s.inId) ? false : seen.add(s.inId)))
    .slice(0, 4);
}

function chipAdvice(model) {
  let tc = null;
  let bb = null;
  for (const e of model.gws) {
    const { squad, starters, captain } = lineupFor(model, e);
    const capXp = captain ? model.xp(captain, e) : 0;
    const benchXp = squad.filter((id) => !starters.includes(id))
      .reduce((s, id) => s + model.xp(id, e), 0);
    if (!tc || capXp > tc.v) tc = { e, v: capXp };
    if (!bb || benchXp > bb.v) bb = { e, v: benchXp };
  }
  return { tc, bb };
}

function assistantPanel(model, gw) {
  if (view.baseSquad.length < 15) {
    return `<div class="assistant-card">
      <div class="assistant-head">${t('pl.assistant')}</div>
      <div class="note" style="padding:0">${t('pl.asIncomplete', { n: view.baseSquad.length })}</div>
    </div>`;
  }
  const name = (id) => `<span class="clickable" data-pid="${id}">${inlinePhoto(state.playersById[id])} ${escapeHtml(playerName(state.playersById[id]))}</span>`;
  const isFirst = gw === firstGw(model);
  const items = [];

  const upgrades = upgradeSuggestions(model, gw);
  for (const { outId, inId, gain } of upgrades) {
    items.push(`<div class="as-item">
      <span>${t('pl.asInFor', { in: name(inId), out: name(outId) })}
      <span class="hi">+${gain.toFixed(1)} ${t('stat.xp')}</span>
      <span class="muted">${isFirst ? t('pl.asBaseChange') : t('pl.asGwTransfer', { gw: gwLabel(gw) })} · ${fmtPrice(state.playersById[inId].now_cost)}</span></span>
      <button class="as-apply" data-act="transfer" data-out="${outId}" data-in="${inId}">${t('pl.asApply')}</button>
    </div>`);
  }
  if (!upgrades.length) {
    items.push(`<div class="as-item"><span>${t('pl.asNoUpgrades')}</span></div>`);
  }

  if (isFirst && view.starters.length) {
    const xi = bestXI(model, view.baseSquad, gw);
    const curXi = view.starters.reduce((s, id) => s + model.xp(id, gw), 0);
    if (xi && xi.total > curXi + 0.3) {
      items.push(`<div class="as-item">
        <span>${t('pl.asBetterXi', { n: (xi.total - curXi).toFixed(1), gw: gwLabel(gw) })}</span>
        <button class="as-apply" data-act="bestxi">${t('pl.asApply')}</button>
      </div>`);
    }
    const top = [...view.starters].sort((a, b) => model.xp(b, gw) - model.xp(a, gw))[0];
    if (top !== view.captain) {
      items.push(`<div class="as-item">
        <span>${t('pl.asBestArmband', { gw: gwLabel(gw), name: name(top) })}</span>
        <button class="as-apply" data-act="captain" data-id="${top}">${t('pl.asSetCaptain')}</button>
      </div>`);
    }
  }

  const { tc, bb } = chipAdvice(model);
  if (tc && view.chips[tc.e] !== 'TC') {
    items.push(`<div class="as-item">
      <span>${t('pl.asTcWindow', { gw: gwLabel(tc.e), n: tc.v.toFixed(1) })}</span>
      <button class="as-apply" data-act="chip" data-gw="${tc.e}" data-chip="TC">${t('pl.asPlanTc')}</button>
    </div>`);
  }
  if (bb && view.chips[bb.e] !== 'BB') {
    items.push(`<div class="as-item">
      <span>${t('pl.asBbWindow', { gw: gwLabel(bb.e), n: bb.v.toFixed(1) })}</span>
      <button class="as-apply" data-act="chip" data-gw="${bb.e}" data-chip="BB">${t('pl.asPlanBb')}</button>
    </div>`);
  }

  return `<div class="assistant-card">
    <div class="assistant-head">${t('pl.assistant')} <span class="muted" style="font-weight:500">${t('pl.asSubtitle', { n: view.horizon })}</span></div>
    ${items.join('')}
  </div>`;
}

/* ---------------- draft comparison ---------------- */

// Side-by-side view of the three draft slots: value, plan xP, chips,
// and the player differences of each draft vs the active one.
function openDraftCompare(model, root) {
  const drafts = DRAFTS.map((s) => {
    let d = null;
    if (s === slot) {
      d = { baseSquad: view.baseSquad, chips: view.chips, planXp: view._planXp };
    } else {
      try { d = JSON.parse(localStorage.getItem(slotKey(s))); } catch { /* empty */ }
    }
    const sq = (d?.baseSquad || []).filter((id) => state.playersById[id]);
    return { s, sq, chips: d?.chips || {}, xp: d?.planXp ?? null };
  });
  const active = drafts.find((d) => d.s === slot);
  const activeSet = new Set(active.sq);
  const names = (ids) => ids.map((id) => escapeHtml(playerName(state.playersById[id]))).join(', ');

  const rows = drafts.map(({ s, sq, chips, xp }) => {
    const letter = t(`draft.${s}`);
    if (!sq.length) {
      return `<tr><td class="team-cell">${letter}${s === slot ? ' ●' : ''}</td>
        <td colspan="4" class="muted">${t('pl.cmpEmpty')}</td></tr>`;
    }
    const chipStr = Object.entries(chips)
      .map(([e, k]) => `${t(`chipShort.${k}`)}·${gwLabel(e)}`).join(', ') || '-';
    let diff = '';
    if (s === slot) diff = `<span class="muted">${t('pl.cmpActive')}</span>`;
    else {
      const din = sq.filter((id) => !activeSet.has(id));
      const sqSet = new Set(sq);
      const dout = active.sq.filter((id) => !sqSet.has(id));
      diff = din.length || dout.length
        ? `${din.length ? `<span class="hi">+ ${names(din)}</span>` : ''}${din.length && dout.length ? '<br>' : ''}${dout.length ? `<span class="lo">− ${names(dout)}</span>` : ''}`
        : `<span class="muted">${t('pl.cmpSame')}</span>`;
    }
    return `<tr>
      <td class="team-cell">${letter}${s === slot ? ' ●' : ''}</td>
      <td class="num">${fmtPrice(cost(sq))}</td>
      <td class="num"><strong>${xp ?? '-'}</strong></td>
      <td>${chipStr}</td>
      <td style="white-space:normal;max-width:340px">${diff}</td>
    </tr>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'drawer-overlay onboard-overlay';
  overlay.innerHTML = `
    <div class="onboard-card" style="max-width:640px">
      <h2 style="margin:0 0 12px">${t('pl.cmpTitle')}</h2>
      <div class="table-wrap"><table class="data">
        <thead><tr>
          <th class="no-sort">${t('pl.cmpDraft')}</th><th class="num no-sort">${t('pl.cmpValue')}</th>
          <th class="num no-sort">${t('pl.planXp')}</th><th class="no-sort">${t('pl.cmpChips')}</th>
          <th class="no-sort">${t('pl.cmpDiff')}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <div class="note" style="padding:10px 0 0">${t('pl.cmpNote')}</div>
      <button class="btn" id="cmp-close" style="margin-top:8px">${t('common.close')}</button>
    </div>`;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('#cmp-close')) overlay.remove();
  });
  document.body.appendChild(overlay);
}

/* ---------------- mobile action sheet ---------------- */

function openSheet(model, root, id, gw) {
  const p = state.playersById[id];
  if (!p) return;
  const isFirst = gw === firstGw(model);
  const isStarter = isFirst && view.starters.includes(id);
  const rerender = () => { save(); renderPlanner(root); };
  const actions = [];
  if (isFirst && isStarter && view.captain !== id) {
    actions.push([t('pl.makeCaptain'), () => { view.captain = id; rerender(); }]);
  }
  if (isFirst) {
    actions.push([t('pl.sheetSwap'), () => { view.swapId = id; rerender(); }]);
    actions.push([t('pl.sheetRemove'), () => { removePlayer(id); rerender(); }]);
  } else {
    actions.push([t('pl.transferOutGw', { gw: gwLabel(gw) }), () => {
      view.pending = { type: 'out', id };
      view.filterPos = String(posOf(id));
      rerender();
    }]);
  }
  actions.push([t('common.playerProfile'), () => openDrawer(id)]);

  const sheet = document.createElement('div');
  sheet.className = 'sheet-overlay';
  sheet.innerHTML = `<div class="sheet">
    <div class="sheet-head">${escapeHtml(playerName(p))} <span class="muted">· ${teamShort(state.teamsById[p.team])} · ${fmtPrice(p.now_cost)}</span></div>
    ${actions.map(([label], i) => `<button class="sheet-btn" data-i="${i}">${label}</button>`).join('')}
    <button class="sheet-btn sheet-cancel">${t('common.cancel')}</button>
  </div>`;
  const closeSheet = () => sheet.remove();
  sheet.addEventListener('click', (e) => {
    if (e.target === sheet || e.target.closest('.sheet-cancel')) return closeSheet();
    const btn = e.target.closest('.sheet-btn[data-i]');
    if (btn) {
      closeSheet();
      actions[+btn.dataset.i][1]();
    }
  });
  document.body.appendChild(sheet);
}

/* ---------------- rendering ---------------- */

function playerCard(model, id, gw, isStarter, opts) {
  const p = state.playersById[id];
  const xp = model.xp(id, gw);
  const opp = (state.upcomingByTeam[p.team] || [])
    .filter((f) => f.event === gw)
    .map((f) => `${teamShort(state.teamsById[f.opponent])} (${haMark(f.isHome)})`)
    .join(', ');
  const isSwapSource = view.swapId === id;
  let swapTarget = false;
  if (opts.editable && view.swapId && view.swapId !== id) {
    const srcStarter = view.starters.includes(view.swapId);
    if (srcStarter !== isStarter) {
      swapTarget = srcStarter ? swapLegal(view.swapId, id) : swapLegal(id, view.swapId);
    }
  }
  const transferTarget = view.pending?.type === 'in' && posOf(view.pending.id) === p.element_type;
  const isIn = opts.gwIns.has(id);
  const buttons = isMobile()
    ? '' // phones: tap the card for a bottom action sheet instead
    : opts.editable
      ? `<div class="pc-actions">
          ${isStarter ? `<button class="pc-btn pc-cap ${view.captain === id ? 'on' : ''}" data-id="${id}" title="${t('pl.makeCaptain')}">${t('badge.c')}</button>` : ''}
          <button class="pc-btn pc-swap" data-id="${id}" title="${t('pl.swapTitle')}">⇄</button>
          <button class="pc-btn pc-remove" data-id="${id}" title="${t('pl.removeTitle')}">✕</button>
        </div>`
      : `<div class="pc-actions">
          <button class="pc-btn pc-out" data-id="${id}" title="${t('pl.transferOutGw', { gw: gwLabel(gw) })}">${t('badge.out')}</button>
        </div>`;
  // When no swap/transfer is in progress: desktop click on photo/name
  // opens the profile; on phones the whole card opens the action sheet.
  const calm = !view.swapId && !view.pending;
  const mobileSheet = calm && isMobile();
  const pid = calm && !mobileSheet ? `class="clickable" data-pid="${id}"` : '';
  return `<div class="pp-card pc-card ${isSwapSource ? 'swap-source' : ''} ${swapTarget || transferTarget ? 'swap-target' : ''}"
       ${opts.editable ? 'draggable="true"' : ''} data-id="${id}" data-starter="${isStarter ? 1 : 0}" ${mobileSheet ? `data-sheet="${id}"` : ''}>
    <div class="pp-photo-wrap" ${calm && !mobileSheet ? `data-pid="${id}"` : ''} style="${calm ? 'cursor:pointer' : ''}">
      ${playerPhoto(p, isStarter ? 'pp-photo' : 'pp-photo pp-photo-sm')}
      <span class="pp-club">${teamBadge(p.team, 'chip-badge')}</span>
      ${opts.captain === id && isStarter
        ? (opts.chip === 'TC'
          ? `<span class="pp-cap tc" title="${t('pl.chipTC')}">×3</span>`
          : `<span class="pp-cap" title="${t('common.captain')}">${t('badge.c')}</span>`)
        : ''}
      ${opts.vice === id && isStarter ? `<span class="pp-cap pp-vice" title="${t('common.viceCaptain')}">${t('badge.v')}</span>` : ''}
      ${isIn ? `<span class="pp-in" title="${t('pl.transferredIn')}">${t('badge.in')}</span>` : ''}
      ${opts.benchOrd ? `<span class="bench-ord">${opts.benchOrd}</span>` : ''}
      <span class="pp-sel">${fmtPrice(p.now_cost)}</span>
    </div>
    <div class="pp-name" ${pid}>${escapeHtml(playerName(p))}</div>
    ${isStarter ? `<div class="pp-fix">${opp || t('common.noFixture')}</div>` : ''}
    <span class="pp-xp ${isStarter ? '' : 'pp-xp-sm'}">${xp.toFixed(1)}</span>
    ${buttons}
  </div>`;
}

function emptySlot(pos) {
  const short = state.positionsById[pos].singular_name_short;
  return `<div class="pp-card slot-empty" data-pos="${pos}" title="${t('pl.pickPos', { pos: posShort(short) })}">
    <div class="slot-circle">+</div>
    <div class="pp-name muted">${posShort(short)}</div>
  </div>`;
}

// FPL-style squad picker: all 15 slots on the pitch by position,
// filling up as you add players. Shown until the squad is complete.
function buildModeHtml(model, gw) {
  const rows = [4, 3, 2, 1].map((pos) => {
    const ids = view.baseSquad.filter((id) => posOf(id) === pos);
    const cards = ids.map((id) => {
      const p = state.playersById[id];
      const mob = isMobile();
      return `<div class="pp-card pc-card" data-id="${id}" ${mob ? `data-sheet="${id}"` : ''}>
        <div class="pp-photo-wrap ${mob ? '' : 'clickable'}" ${mob ? '' : `data-pid="${id}"`}>
          ${playerPhoto(p, 'pp-photo')}
          <span class="pp-club">${teamBadge(p.team, 'chip-badge')}</span>
          <span class="pp-sel">${fmtPrice(p.now_cost)}</span>
        </div>
        <div class="pp-name ${mob ? '' : 'clickable'}" ${mob ? '' : `data-pid="${id}"`}>${escapeHtml(playerName(p))}</div>
        <span class="pp-xp">${model.horizonTotal(id).toFixed(1)}</span>
        ${mob ? '' : `<div class="pc-actions"><button class="pc-btn pc-remove" data-id="${id}" title="${t('pl.removeTitle')}">✕</button></div>`}
      </div>`;
    });
    for (let i = ids.length; i < QUOTA[pos]; i++) cards.push(emptySlot(pos));
    return `<div class="pitch-row" data-pos="${pos}">${cards.join('')}</div>`;
  }).join('');
  return `
    <div class="build-hint">
      <span>${t('pl.buildHint')}</span>
      <span class="muted">${t('pl.pickedCount', { n: view.baseSquad.length })}</span>
    </div>
    <div class="pitch pitch-build">${rows}</div>`;
}

function pitchHtml(model, gw) {
  const isFirst = gw === firstGw(model);
  if (isFirst && view.baseSquad.length < 15) {
    return buildModeHtml(model, gw);
  }
  const lineup = lineupFor(model, gw);
  const gwIns = new Set((view.transfers[gw] || []).map((t) => t.in));
  const vice = [...lineup.starters]
    .filter((id) => id !== lineup.captain)
    .sort((a, b) => model.xp(b, gw) - model.xp(a, gw))[0] || null;
  const opts = { editable: isFirst, captain: lineup.captain, vice, gwIns, chip: view.chips[gw] };

  const starters = lineup.starters;
  const squad = lineup.squad;
  const c = posCounts(starters);
  const XI_MIN = { 1: 1, 2: 3, 3: 2, 4: 1 };
  // Attack at the top, keeper at the bottom.
  const rows = [4, 3, 2, 1].map((pos) => {
    const cards = starters.filter((id) => posOf(id) === pos)
      .sort((a, b) => model.xp(b, gw) - model.xp(a, gw))
      .map((id) => playerCard(model, id, gw, true, opts));
    if (isFirst) {
      for (let i = 0; i < Math.max(0, XI_MIN[pos] - c[pos]); i++) cards.push(emptySlot(pos));
    }
    return cards.length ? `<div class="pitch-row" data-pos="${pos}">${cards.join('')}</div>` : '';
  }).join('');

  const benchIds = squad.filter((id) => !starters.includes(id))
    .sort((a, b) => (posOf(a) === 1 ? -1 : posOf(b) === 1 ? 1 : model.xp(b, gw) - model.xp(a, gw)));
  let subN = 0;
  const benchCards = benchIds.map((id) => {
    const ord = posOf(id) === 1 ? t('badge.gk') : `${t('badge.sub')}${++subN}`;
    return playerCard(model, id, gw, false, { ...opts, benchOrd: ord });
  });
  // The bench is always exactly 4 spots - pad with generic slots while
  // the squad is still being built.
  if (isFirst) {
    while (benchCards.length < 4) {
      benchCards.push(`<div class="pp-card slot-empty" data-pos="all" title="${t('pl.addTitle')}">
        <div class="slot-circle">+</div>
        <div class="pp-name muted">${t('pl.add')}</div>
      </div>`);
    }
  }

  const bbOn = view.chips[gw] === 'BB';
  return `
    <div class="pitch">${rows}</div>
    <div class="bench-strip ${bbOn ? 'bb-on' : ''}" data-bench="1"><span class="bench-label">${t('common.bench')}${bbOn ? ` · ${t('pl.benchCounts')}` : ''}</span>${benchCards.join('')}</div>`;
}

function transfersBar(model, gw, ft) {
  const isFirst = gw === firstGw(model);
  if (isFirst) return '';
  const info = ft[gw];
  const list = view.transfers[gw] || [];
  const chips = list.map((tr, i) => `<span class="tr-chip">
      ${inlinePhoto(state.playersById[tr.out])} ${escapeHtml(playerName(state.playersById[tr.out]))}
      <span class="tr-arrow">➜</span>
      ${inlinePhoto(state.playersById[tr.in])} ${escapeHtml(playerName(state.playersById[tr.in]))}
      <button class="tr-x" data-gw="${gw}" data-idx="${i}" title="${t('common.cancel')}">✕</button>
    </span>`).join('');
  const pendingNote = view.pending
    ? `<span class="muted">${view.pending.type === 'in'
        ? t('pl.pendingIn', { name: escapeHtml(playerName(state.playersById[view.pending.id])) })
        : t('pl.pendingOut', { name: escapeHtml(playerName(state.playersById[view.pending.id])) })}
      <button class="link-btn" id="tr-cancel">${t('pl.cancelLower')}</button></span>`
    : '';
  return `<div class="transfers-bar">
    <span class="chips-label">${t('pl.gwTransfers', { gw: gwLabel(gw) })}</span>
    <span class="ft-pill" title="${t('pl.ftTitle')}">${t('badge.ft')}: ${info.avail}</span>
    ${info.hits ? `<span class="ft-pill ft-hit">${t('pl.hit', { n: info.hits })}</span>` : ''}
    ${info.free ? `<span class="ft-pill ft-free">${t('pl.movesFree', { chip: t(`chipShort.${view.chips[gw]}`) })}</span>` : ''}
    ${chips || `<span class="muted">${t('pl.noMoves')}</span>`}
    ${pendingNote}
  </div>`;
}

// A yellow banner spelling out what the active chip changes right now,
// with live numbers - so toggling a chip has visible consequences.
function chipEffectNote(model, gw) {
  const chip = view.chips[gw];
  if (!chip) return '';
  const { squad, starters, captain } = lineupFor(model, gw);
  let text = '';
  if (chip === 'TC') {
    const capPts = captain ? model.xp(captain, gw) : 0;
    text = t('pl.chipNoteTC', {
      name: captain ? escapeHtml(playerName(state.playersById[captain])) : '-',
      n: capPts.toFixed(1),
    });
  } else if (chip === 'BB') {
    const benchPts = squad.filter((id) => !starters.includes(id))
      .reduce((s, id) => s + model.xp(id, gw), 0);
    text = t('pl.chipNoteBB', { n: benchPts.toFixed(1) });
  } else if (chip === 'WC') {
    text = t('pl.chipNoteWC');
  } else if (chip === 'FH') {
    text = t('pl.chipNoteFH');
  }
  return `<div class="chip-note">⚡ ${text}</div>`;
}

function chipsBar(model, gw) {
  const active = view.chips[gw];
  const plannedElsewhere = (key) =>
    Object.entries(view.chips).filter(([e, k]) => +e !== gw && k === key).map(([e]) => gwLabel(e));
  return `<div class="chips-bar">
    <span class="chips-label">${t('pl.chipsBar', { gw: gwLabel(gw) })}</span>
    ${CHIPS.map(({ key, label }) => {
      const elsewhere = plannedElsewhere(key);
      return `<button class="chip-btn ${active === key ? 'on' : ''}" data-chip="${key}"
        title="${elsewhere.length ? t('pl.alsoPlanned', { gws: elsewhere.join(', ') }) : label()}">${label()}${elsewhere.length ? ' ·' + elsewhere.join(',') : ''}</button>`;
    }).join('')}
    ${chipEffectNote(model, gw)}
  </div>`;
}

function sideList(model, gw) {
  const q = view.search.trim().toLowerCase();
  const squad = squadAt(model, gw);
  const inSquad = new Set(squad);
  const clubs = clubCounts(squad);
  const squadPos = posCounts(squad);
  const isFirst = gw === firstGw(model);
  const pendingOut = view.pending?.type === 'out' ? state.playersById[view.pending.id] : null;

  let list = state.bootstrap.elements.filter((p) => {
    if (inSquad.has(p.id)) return false;
    if (p.status === 'u' || p.status === 'n') return false;
    if (pendingOut && p.element_type !== pendingOut.element_type) return false;
    if (view.filterPos !== 'all' && p.element_type !== +view.filterPos) return false;
    if (view.maxPrice && p.now_cost / 10 > +view.maxPrice) return false;
    if (q && !`${p.first_name} ${p.second_name} ${p.web_name} ${playerName(p)}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const sorters = {
    xp: (a, b) => model.horizonTotal(b.id) - model.horizonTotal(a.id),
    priceDesc: (a, b) => b.now_cost - a.now_cost,
    priceAsc: (a, b) => a.now_cost - b.now_cost,
    owned: (a, b) => num(b.selected_by_percent) - num(a.selected_by_percent),
  };
  list.sort(sorters[view.sortKey] || sorters.xp);

  const squadCost = cost(squad);
  const rows = list.slice(0, 60).map((p) => {
    const posFull = isFirst && squadPos[p.element_type] >= QUOTA[p.element_type];
    const clubFull = (clubs[p.team] || 0) >= MAX_PER_CLUB;
    const tooDear = !!pendingOut && squadCost - pendingOut.now_cost + p.now_cost > BUDGET;
    const blocked = (isFirst && posFull && view.baseSquad.length >= 15) || clubFull || tooDear;
    const title = clubFull ? t('pl.max3')
      : tooDear ? t('pl.overBudget')
      : isFirst ? t('pl.addToSquad')
      : pendingOut ? t('pl.transferInFor', { name: playerName(pendingOut) }) : t('pl.transferInto', { gw: gwLabel(gw) });
    return `<div class="side-row">
      <span class="clickable" data-pid="${p.id}" title="${t('common.playerProfile')}">${playerPhoto(p, 'row-photo')}</span>
      <div class="side-info clickable" data-pid="${p.id}">
        <span class="player-name">${escapeHtml(playerName(p))}</span>
        <span class="player-meta">${posShort(state.positionsById[p.element_type].singular_name_short)} · ${teamBadge(p.team, 'meta-badge')} ${teamShort(state.teamsById[p.team])} · ${fmtPrice(p.now_cost)}</span>
        <span class="side-fx">${fixtureChips(p.team, 3)}</span>
      </div>
      <span class="side-xp" title="${t('pl.sideXpTitle')}">${model.horizonTotal(p.id).toFixed(1)}</span>
      <button class="side-add" data-id="${p.id}" ${blocked ? 'disabled' : ''} title="${title}">+</button>
    </div>`;
  }).join('');

  return `
    <div class="side-controls">
      <input type="search" id="sd-search" placeholder="${t('common.searchPlayer')}" value="${escapeHtml(view.search)}" />
      <div class="side-filters">
        <input type="number" id="sd-price" placeholder="${t('common.maxPrice')}" step="0.5" min="3.5" max="16" value="${view.maxPrice}" style="width:74px;font:inherit;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text)" />
        <select id="sd-pos">
          <option value="all">${t('common.all')}</option>
          ${state.bootstrap.element_types.map((et) => `<option value="${et.id}" ${view.filterPos == et.id ? 'selected' : ''}>${posPlural(et.plural_name_short)}</option>`).join('')}
        </select>
        <select id="sd-sort">
          <option value="xp" ${view.sortKey === 'xp' ? 'selected' : ''}>${t('pl.sortXp')}</option>
          <option value="priceDesc" ${view.sortKey === 'priceDesc' ? 'selected' : ''}>${t('pl.priceDesc')}</option>
          <option value="priceAsc" ${view.sortKey === 'priceAsc' ? 'selected' : ''}>${t('pl.priceAsc')}</option>
          <option value="owned" ${view.sortKey === 'owned' ? 'selected' : ''}>${t('pl.ownedPct')}</option>
        </select>
      </div>
    </div>
    <div class="side-list" id="side-list">${rows || `<div class="note">${t('pl.noMatch')}</div>`}</div>`;
}

export async function renderPlanner(root) {
  if (!root.dataset.booted) {
    root.innerHTML = '<div class="skel-page"><div class="skel skel-row"></div><div class="skel skel-block" style="height:420px"></div></div>';
  }
  load();
  await loadBaseline();
  const model = buildModel(view.horizon);
  ensureConsistency(model);
  const gw = selectedGw(model);
  const isFirst = gw === firstGw(model);
  const ft = ftInfo(model);

  const squad = squadAt(model, gw);
  const totalCost = cost(squad);
  const itb = BUDGET - totalCost;
  const totalHits = model.gws.reduce((s, e) => s + (ft[e]?.hits || 0), 0);
  const horizonTotal = model.gws.reduce((s, e) => s + gwForecast(model, e, ft), 0);
  view._planXp = Math.round(horizonTotal);
  save();
  const lineup = lineupFor(model, gw);
  const formationLabel = lineup.formation
    || (formationValid(lineup.starters)
      ? [2, 3, 4].map((pos) => posCounts(lineup.starters)[pos]).join('-')
      : t('pl.picked', { n: lineup.starters.length }));

  const gwChips = model.gws
    .map((e) => {
      const marks = [view.chips[e] ? t(`chipShort.${view.chips[e]}`) : null, (view.transfers[e] || []).length ? `${view.transfers[e].length}↔` : null]
        .filter(Boolean).join(' ');
      return `<button class="gw-chip ${e === gw ? 'active' : ''}" data-gw="${e}">${gwLabel(e)}${marks ? ` · ${marks}` : ''}</button>`;
    })
    .join('');

  root.dataset.booted = '1';
  root.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <label>${t('common.horizon')}</label>
        <select id="pl-horizon">
          ${[3, 5, 8].map((n) => `<option value="${n}" ${view.horizon === n ? 'selected' : ''}>${t('common.nGws', { n })}</option>`).join('')}
        </select>
        <button class="btn" id="pl-build">${view.baseSquad.length ? t('pl.reOptimize') : t('pl.autoBuild')}</button>
        <button class="btn ghost ${view.showAssistant ? 'on' : ''}" id="pl-assist">${t('pl.assistant')}</button>
        <span class="spacer"></span>
        <span class="result-count">
          ${squad.length}/15 · <strong>${fmtPrice(totalCost)}</strong> · ${t('pl.bank')}
          <strong class="${itb < 0 ? 'lo' : ''}">${fmtPrice(itb)}</strong> ·
          ${t('pl.planXp')} <strong>${horizonTotal.toFixed(0)}</strong>${totalHits ? ` <span class="lo">${t('pl.hits', { n: totalHits })}</span>` : ''}
        </span>
        <button class="link-btn" id="pl-share" ${view.baseSquad.length ? '' : 'disabled'} title="${t('pl.shareTitle')}">${t('pl.share')}</button>
        <button class="link-btn" id="pl-copy" ${view.baseSquad.length ? '' : 'disabled'}>${t('pl.copy')}</button>
        <button class="link-btn" id="pl-clear" ${view.baseSquad.length ? '' : 'disabled'}>${t('common.clear')}</button>
        <button class="link-btn" id="pl-drafts-cmp" title="${t('pl.cmpTitle')}">⚖</button>
        <div class="gw-chips" id="pl-drafts" title="${t('pl.draftsTitle')}">
          ${DRAFTS.map((s) => {
            const meta = s === slot ? { n: view.baseSquad.length, xp: Math.round(horizonTotal) } : draftMeta(s);
            const letter = t(`draft.${s}`);
            const label = meta && meta.n ? `${letter} · ${meta.xp ?? meta.n}` : letter;
            return `<button class="gw-chip ${s === slot ? 'active' : ''}" data-draft="${s}">${label}</button>`;
          }).join('')}
        </div>
      </div>
      <div class="toolbar" style="border-bottom:none;padding-top:10px">
        <div class="gw-chips">${gwChips}</div>
        <span class="spacer"></span>
        <span class="result-count">${formationLabel}${lineup.captain ? ` · ${t('pl.capLabel')}: <strong>${escapeHtml(playerName(state.playersById[lineup.captain]))}</strong>` : ''} · ${t('pl.gwForecast', { gw: gwLabel(gw) })} <strong>${gwForecast(model, gw, ft).toFixed(1)} ${t('pl.pts')}</strong>${isFirst ? '' : ` ${t('pl.autoLineup')}`}</span>
      </div>
      ${chipsBar(model, gw)}
      ${transfersBar(model, gw, ft)}
      ${view.showAssistant ? assistantPanel(model, gw) : ''}
      <div class="planner-layout">
        <div class="planner-main">${pitchHtml(model, gw)}</div>
        <aside class="planner-side">${sideList(model, gw)}</aside>
      </div>
      ${view.swapId ? `<div class="note">${t('pl.swapMode')}</div>` : ''}
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
    btn.textContent = t('pl.optimizing');
    btn.disabled = true;
    setTimeout(() => {
      view.baseSquad = buildOptimalSquad(model);
      view.starters = [];
      view.captain = null;
      view.transfers = {};
      ensureConsistency(model);
      view.building = false;
      rerender();
    }, 30);
  });

  root.querySelector('#pl-assist').addEventListener('click', () => {
    view.showAssistant = !view.showAssistant;
    rerender();
  });

  root.querySelectorAll('.as-apply').forEach((b) =>
    b.addEventListener('click', () => {
      const act = b.dataset.act;
      if (act === 'transfer') {
        const outId = +b.dataset.out;
        const inId = +b.dataset.in;
        if (isFirst) {
          view.baseSquad = view.baseSquad.map((id) => (id === outId ? inId : id));
          view.starters = view.starters.map((id) => (id === outId ? inId : id));
          if (view.captain === outId) view.captain = inId;
        } else {
          recordTransfer(model, gw, outId, inId);
        }
      }
      if (act === 'bestxi') {
        const xi = bestXI(model, view.baseSquad, gw);
        if (xi) { view.starters = xi.xi; view.captain = null; }
      }
      if (act === 'captain') view.captain = +b.dataset.id;
      if (act === 'chip') view.chips[+b.dataset.gw] = b.dataset.chip;
      ensureConsistency(model);
      rerender();
    })
  );

  root.querySelector('#pl-share')?.addEventListener('click', async (e) => {
    const url = `${location.origin}${location.pathname}#plan=${encodePlan()}`;
    try {
      await navigator.clipboard.writeText(url);
      e.target.textContent = t('pl.linkCopied');
      setTimeout(() => { e.target.textContent = t('pl.share'); }, 1800);
    } catch { /* clipboard unavailable */ }
  });

  root.querySelector('#pl-copy')?.addEventListener('click', async (e) => {
    const label = (id) => {
      const p = state.playersById[id];
      return `${posShort(state.positionsById[p.element_type].singular_name_short)}  ${playerName(p)} (${teamShort(state.teamsById[p.team])}) ${fmtPrice(p.now_cost)}${lineup.captain === id ? ` (${t('badge.c')})` : ''}`;
    };
    const bench = squad.filter((id) => !lineup.starters.includes(id));
    const moves = Object.entries(view.transfers)
      .map(([e, list]) => `${gwLabel(e)}: ${list.map((tr) => `${playerName(state.playersById[tr.out])} ➜ ${playerName(state.playersById[tr.in])}`).join(', ')}`)
      .join('\n');
    const text = `${t('pl.copyHead', { gw: gwLabel(gw), cost: fmtPrice(totalCost) })}\n${t('pl.copyXi')}\n${lineup.starters.map(label).join('\n')}\n${t('common.bench')}:\n${bench.map(label).join('\n')}${moves ? `\n${t('pl.copyTransfers')}\n${moves}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      e.target.textContent = t('pl.copied');
      setTimeout(() => { e.target.textContent = t('pl.copy'); }, 1500);
    } catch { /* clipboard unavailable */ }
  });

  root.querySelector('#pl-clear')?.addEventListener('click', () => {
    Object.assign(view, { baseSquad: [], starters: [], captain: null, transfers: {}, swapId: null, pending: null });
    rerender();
  });

  root.querySelectorAll('.gw-chip[data-gw]').forEach((b) =>
    b.addEventListener('click', () => { view.planGw = +b.dataset.gw; view.pending = null; view.swapId = null; rerender(); })
  );

  root.querySelector('#pl-drafts-cmp')?.addEventListener('click', () => openDraftCompare(model, root));

  root.querySelectorAll('#pl-drafts .gw-chip').forEach((b) =>
    b.addEventListener('click', () => {
      if (b.dataset.draft === slot) return;
      slot = b.dataset.draft;
      try { localStorage.setItem(SLOT_KEY, slot); } catch { /* private mode */ }
      Object.assign(view, { planGw: null, swapId: null, pending: null });
      renderPlanner(root);
    })
  );

  root.querySelectorAll('.chip-btn').forEach((b) =>
    b.addEventListener('click', () => {
      const key = b.dataset.chip;
      view.chips[gw] = view.chips[gw] === key ? undefined : key;
      if (!view.chips[gw]) delete view.chips[gw];
      rerender();
    })
  );

  root.querySelectorAll('.tr-x').forEach((b) =>
    b.addEventListener('click', () => { dropTransfer(+b.dataset.gw, +b.dataset.idx); rerender(); })
  );
  root.querySelector('#tr-cancel')?.addEventListener('click', () => { view.pending = null; rerender(); });

  // Side browser
  root.querySelector('#sd-search').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      root.querySelector('.side-add:not([disabled])')?.click();
    }
  });
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
  root.querySelector('#sd-price').addEventListener('change', (e) => { view.maxPrice = e.target.value; sideScroll = 0; rerender(); });
  root.querySelector('#sd-sort').addEventListener('change', (e) => { view.sortKey = e.target.value; sideScroll = 0; rerender(); });
  sideEl?.addEventListener('scroll', () => { sideScroll = sideEl.scrollTop; });

  root.querySelectorAll('.side-add').forEach((b) =>
    b.addEventListener('click', () => {
      const id = +b.dataset.id;
      if (isFirst) {
        addPlayer(id);
      } else if (view.pending?.type === 'out') {
        if (recordTransfer(model, gw, view.pending.id, id)) view.pending = null;
      } else {
        view.pending = { type: 'in', id };
      }
      ensureConsistency(model);
      rerender();
    })
  );

  // Card actions
  root.querySelectorAll('.pc-remove').forEach((b) =>
    b.addEventListener('click', (e) => { e.stopPropagation(); removePlayer(+b.dataset.id); rerender(); })
  );
  root.querySelectorAll('.pc-out').forEach((b) =>
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      view.pending = { type: 'out', id: +b.dataset.id };
      view.filterPos = String(posOf(+b.dataset.id));
      rerender();
    })
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
      const targetId = +card.dataset.id;
      if (view.pending?.type === 'in') {
        if (recordTransfer(model, gw, targetId, view.pending.id)) {
          view.pending = null;
          rerender();
        }
      } else if (view.swapId && trySwap(view.swapId, targetId)) {
        view.swapId = null;
        rerender();
      }
    })
  );
  root.querySelectorAll('.slot-empty').forEach((slot) =>
    slot.addEventListener('click', () => {
      view.filterPos = slot.dataset.pos;
      rerender();
      if (isMobile()) {
        setTimeout(() => root.querySelector('.planner-side')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
      }
    })
  );

  // Phones: tapping a card opens the action sheet.
  root.querySelectorAll('.pc-card[data-sheet]').forEach((card) =>
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      openSheet(model, root, +card.dataset.sheet, gw);
    })
  );

  // Drag & drop starter<->bench swaps (first GW only).
  if (isFirst) {
    root.querySelectorAll('.pc-card[draggable]').forEach((card) => {
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
  }
  return Promise.resolve();
}
