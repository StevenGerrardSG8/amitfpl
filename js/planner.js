// Planner tab: xP predictions, auto-built optimal squad, and a
// gameweek-by-gameweek best-XI plan. All client-side.
import { state, fmtPrice, num, escapeHtml } from './state.js';
import { posBadge, playerCell } from './ui.js';
import { loadBaseline, buildModel } from './model.js';

const STORAGE_KEY = 'amitfpl:planner';
const QUOTA = { 1: 2, 2: 5, 3: 5, 4: 3 };
const BUDGET = 1000; // £100.0M in API units
const MAX_PER_CLUB = 3;

const view = { horizon: 5, squad: [], building: false };

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved) {
      view.horizon = saved.horizon || 5;
      view.squad = (saved.squad || []).filter((id) => state.playersById[id]);
    }
  } catch { /* fresh start */ }
}

const save = () =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ horizon: view.horizon, squad: view.squad }));

/* ---------------- optimizer ---------------- */

function clubCounts(ids) {
  const counts = {};
  for (const id of ids) {
    const t = state.playersById[id].team;
    counts[t] = (counts[t] || 0) + 1;
  }
  return counts;
}

function buildOptimalSquad(model) {
  const score = {};
  const pools = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of state.bootstrap.elements) {
    if (p.status === 'u' || p.status === 'n') continue;
    score[p.id] = model.horizonTotal(p.id);
    pools[p.element_type].push(p);
  }
  // Per position: strongest candidates plus cheap enablers.
  for (const pos of [1, 2, 3, 4]) {
    const byScore = [...pools[pos]].sort((a, b) => score[b.id] - score[a.id]).slice(0, 80);
    const byPrice = [...pools[pos]].sort((a, b) => a.now_cost - b.now_cost).slice(0, 10);
    pools[pos] = [...new Set([...byScore, ...byPrice])];
  }

  // Start from the cheapest legal squad, then hill-climb one swap at a time.
  let squad = [];
  for (const pos of [1, 2, 3, 4]) {
    const cheap = [...pools[pos]].sort((a, b) => a.now_cost - b.now_cost);
    let taken = 0;
    for (const p of cheap) {
      if (taken >= QUOTA[pos]) break;
      const counts = clubCounts(squad);
      if ((counts[p.team] || 0) >= MAX_PER_CLUB) continue;
      squad.push(p.id);
      taken++;
    }
  }

  const cost = (ids) => ids.reduce((s, id) => s + state.playersById[id].now_cost, 0);

  for (let iter = 0; iter < 300; iter++) {
    let best = null;
    for (let i = 0; i < squad.length; i++) {
      const cur = state.playersById[squad[i]];
      for (const cand of pools[cur.element_type]) {
        if (squad.includes(cand.id)) continue;
        const newCost = cost(squad) - cur.now_cost + cand.now_cost;
        if (newCost > BUDGET) continue;
        const counts = clubCounts(squad.filter((id) => id !== cur.id));
        if ((counts[cand.team] || 0) >= MAX_PER_CLUB) continue;
        const delta = score[cand.id] - score[cur.id];
        if (delta > 0.001 && (!best || delta > best.delta)) {
          best = { i, cand: cand.id, delta };
        }
      }
    }
    if (!best) break;
    squad[best.i] = best.cand;
  }
  return squad;
}

/* ---------------- best XI per GW ---------------- */

const FORMATIONS = [];
for (let d = 3; d <= 5; d++)
  for (let m = 2; m <= 5; m++)
    for (let f = 1; f <= 3; f++)
      if (d + m + f === 10) FORMATIONS.push([d, m, f]);

function bestXI(model, squadIds, eventId) {
  const byPos = { 1: [], 2: [], 3: [], 4: [] };
  for (const id of squadIds) {
    const p = state.playersById[id];
    byPos[p.element_type].push({ p, xp: model.xp(id, eventId) });
  }
  for (const pos of [1, 2, 3, 4]) byPos[pos].sort((a, b) => b.xp - a.xp);

  let best = null;
  for (const [d, m, f] of FORMATIONS) {
    if (byPos[2].length < d || byPos[3].length < m || byPos[4].length < f || !byPos[1].length) continue;
    const xi = [byPos[1][0], ...byPos[2].slice(0, d), ...byPos[3].slice(0, m), ...byPos[4].slice(0, f)];
    const total = xi.reduce((s, e) => s + e.xp, 0);
    if (!best || total > best.total) best = { xi, total, formation: `${d}-${m}-${f}` };
  }
  if (!best) return null;

  const captain = best.xi.reduce((a, b) => (b.xp > a.xp ? b : a));
  const inXI = new Set(best.xi.map((e) => e.p.id));
  const bench = squadIds
    .filter((id) => !inXI.has(id))
    .map((id) => ({ p: state.playersById[id], xp: model.xp(id, eventId) }))
    .sort((a, b) => (a.p.element_type === 1 ? -1 : b.p.element_type === 1 ? 1 : b.xp - a.xp));

  return { ...best, captain, bench, totalWithCaptain: best.total + captain.xp };
}

/* ---------------- rendering ---------------- */

function squadTable(model) {
  const gwHead = model.gws.map((e) => `<th class="num no-sort">GW${e}</th>`).join('');
  const rows = [1, 2, 3, 4]
    .flatMap((pos) => view.squad.filter((id) => state.playersById[id].element_type === pos))
    .map((id) => {
      const p = state.playersById[id];
      const cells = model.gws
        .map((e) => {
          const v = model.xp(id, e);
          return `<td class="num ${v >= 5 ? 'hi' : ''}">${v.toFixed(1)}</td>`;
        })
        .join('');
      return `<tr>
        <td>${playerCell(p)}</td>
        <td>${posBadge(p)}</td>
        <td class="num">${fmtPrice(p.now_cost)}</td>
        ${cells}
        <td class="num" style="font-weight:700">${model.horizonTotal(id).toFixed(1)}</td>
        <td><button class="link-btn pl-remove" data-id="${id}" title="Remove">✕</button></td>
      </tr>`;
    })
    .join('');

  return `<table class="data">
    <thead><tr>
      <th class="no-sort">Player</th><th class="no-sort">Pos</th><th class="num no-sort">Price</th>
      ${gwHead}<th class="num no-sort">Total xP</th><th class="no-sort"></th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function planCards(model) {
  return model.gws
    .map((e) => {
      const plan = bestXI(model, view.squad, e);
      if (!plan) return '';
      const lines = [1, 2, 3, 4]
        .map((pos) => {
          const names = plan.xi
            .filter((x) => x.p.element_type === pos)
            .map((x) => {
              const cap = x.p.id === plan.captain.p.id ? '<span class="captain-badge" title="Captain">C</span>' : '';
              return `${escapeHtml(x.p.web_name)}${cap} <span class="muted">${x.xp.toFixed(1)}</span>`;
            })
            .join(' · ');
          return names ? `<div class="plan-line"><span class="plan-pos">${state.positionsById[pos].singular_name_short}</span>${names}</div>` : '';
        })
        .join('');
      const bench = plan.bench
        .map((x) => `${escapeHtml(x.p.web_name)} <span class="muted">${x.xp.toFixed(1)}</span>`)
        .join(' · ');
      return `<div class="plan-card">
        <div class="plan-head">
          <strong>GW${e}</strong>
          <span class="muted">${plan.formation}</span>
          <span class="spacer"></span>
          <span title="Expected points incl. captain">xP <strong>${plan.totalWithCaptain.toFixed(1)}</strong></span>
        </div>
        ${lines}
        <div class="plan-line plan-bench"><span class="plan-pos">Bench</span>${bench}</div>
      </div>`;
    })
    .join('');
}

export async function renderPlanner(root) {
  load();
  root.innerHTML = '<div class="loading"><div class="spinner"></div><p>Crunching predictions…</p></div>';
  await loadBaseline();
  const model = buildModel(view.horizon);

  const totalCost = view.squad.reduce((s, id) => s + state.playersById[id].now_cost, 0);
  const itb = BUDGET - totalCost;
  const counts = {};
  for (const id of view.squad) counts[state.playersById[id].element_type] = (counts[state.playersById[id].element_type] || 0) + 1;
  const quotaOk = [1, 2, 3, 4].every((pos) => (counts[pos] || 0) === QUOTA[pos]);

  const datalist = `<datalist id="plan-players">${state.bootstrap.elements
    .map((p) => `<option value="${escapeHtml(p.web_name)} (${state.teamsById[p.team].short_name})"></option>`)
    .join('')}</datalist>`;

  const empty = view.squad.length === 0;

  root.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <label>Plan horizon</label>
        <select id="pl-horizon">
          ${[3, 5, 8].map((n) => `<option value="${n}" ${view.horizon === n ? 'selected' : ''}>${n} GWs</option>`).join('')}
        </select>
        <button class="btn" id="pl-build">${empty ? '⚡ Auto-build optimal squad' : '⚡ Re-optimize squad'}</button>
        <span class="spacer"></span>
        ${empty ? '' : `
          <span class="result-count">Squad: <strong>${fmtPrice(totalCost)}</strong> · In the bank:
            <strong class="${itb < 0 ? 'lo' : ''}">${fmtPrice(itb)}</strong>
            ${quotaOk ? '' : ' · <span class="lo">squad incomplete</span>'}</span>`}
      </div>
      ${empty
        ? `<div class="myteam-setup">
            <h2>Squad planner</h2>
            <p>Builds a full £100M squad (2 GK · 5 DEF · 5 MID · 3 FWD, max 3 per club) that maximizes
            predicted points over the horizon you pick — then shows the best XI and captain for every gameweek.</p>
            <p class="muted">Predictions: amitfpl model v1 — last season's per-90 rates + fixture strength + availability,
            anchored to FPL's own projection for the next GW.</p>
          </div>`
        : `<div class="table-wrap" style="max-height:60vh;overflow-y:auto">${squadTable(model)}</div>
           <div class="toolbar" style="border-top:1px solid var(--border);border-bottom:none">
             <input type="text" list="plan-players" id="pl-add" placeholder="Add player…" style="flex:1;min-width:160px;font:inherit;padding:8px 10px;border:1px solid var(--border);border-radius:8px" />
             <button class="link-btn" id="pl-clear">Clear squad</button>
           </div>`}
    </div>
    ${empty ? '' : `<div class="plan-grid">${planCards(model)}</div>`}
    ${datalist}`;

  root.querySelector('#pl-horizon').addEventListener('change', (e) => {
    view.horizon = +e.target.value;
    save();
    renderPlanner(root);
  });

  root.querySelector('#pl-build').addEventListener('click', () => {
    if (view.building) return;
    view.building = true;
    const btn = root.querySelector('#pl-build');
    btn.textContent = 'Optimizing…';
    btn.disabled = true;
    setTimeout(() => {
      view.squad = buildOptimalSquad(model);
      view.building = false;
      save();
      renderPlanner(root);
    }, 30);
  });

  root.querySelectorAll('.pl-remove').forEach((b) =>
    b.addEventListener('click', () => {
      view.squad = view.squad.filter((id) => id !== +b.dataset.id);
      save();
      renderPlanner(root);
    })
  );

  root.querySelector('#pl-clear')?.addEventListener('click', () => {
    view.squad = [];
    save();
    renderPlanner(root);
  });

  root.querySelector('#pl-add')?.addEventListener('change', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const p = state.bootstrap.elements.find(
      (x) => `${x.web_name} (${state.teamsById[x.team].short_name})`.toLowerCase() === q
    ) || state.bootstrap.elements.find((x) => x.web_name.toLowerCase() === q);
    if (p && !view.squad.includes(p.id)) {
      view.squad.push(p.id);
      save();
      renderPlanner(root);
    }
  });
}
