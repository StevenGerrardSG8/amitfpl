// Squad analysis: turns a loaded squad into a handful of plain-language
// verdicts - an outlook grade, injury flags, the captain call, the best
// transfers the bank allows and lineup fixes. This is the "upload your
// squad and let it analyze" flow: every line comes from the xP model,
// no manual digging through tables.
import { state, fmtPrice, statusInfo, escapeHtml } from './state.js';
import { loadBaseline, buildModel } from './model.js';
import { bestXI } from './planner.js';
import { t, playerName, gwLabel, posShort } from './i18n.js';

const MAX_PER_CLUB = 3;

const nameOf = (id) => escapeHtml(playerName(state.playersById[id]));

// Grade the XI by where each starter ranks among same-position players
// (5-GW expected points). Percentiles, not raw points, so the verdict
// stays meaningful in blank/double GWs and across seasons.
function positionPercentiles() {
  const byPos = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of state.bootstrap.elements) {
    if (p.status === 'u' || p.status === 'n') continue;
    byPos[p.element_type].push(p.id);
  }
  return byPos;
}

export async function analyzeSquad({ squad, starters = [], captain = null, bank = 0 }) {
  await loadBaseline();
  const model = buildModel(5);
  // The whole-squad outlook needs one shared, genuinely-upcoming
  // gameweek - not model.gws[0], which mid-gameweek is the "current"
  // event and could already be finished for some/most of the squad's
  // teams, cratering the whole analysis to near-zero. state.nextEvent
  // is always the next gameweek nothing has kicked off in yet.
  const gw = state.nextEvent?.id ?? model.gws[0];
  const horizon = {};
  for (const id of squad) horizon[id] = model.horizonTotal(id);

  const xi = bestXI(model, squad, gw);
  const lineup = starters.length === 11 ? starters : xi ? xi.xi : squad.slice(0, 11);

  // --- outlook grade (starting XI only - every squad has bench fodder)
  const byPos = positionPercentiles();
  const pctOf = (id) => {
    const p = state.playersById[id];
    const mine = model.horizonTotal(id);
    const pool = byPos[p.element_type];
    let below = 0;
    for (const other of pool) if (model.horizonTotal(other) <= mine) below++;
    return below / pool.length;
  };
  const avgPct = lineup.reduce((s, id) => s + pctOf(id), 0) / lineup.length;
  const grade = avgPct >= 0.88 ? 'top' : avgPct >= 0.78 ? 'good' : avgPct >= 0.62 ? 'ok' : 'work';

  // --- next-GW forecast for the current XI (captain counts double)
  const capId = captain && lineup.includes(captain) ? captain : null;
  const xiXp = lineup.reduce((s, id) => s + model.xp(id, gw), 0) + (capId ? model.xp(capId, gw) : 0);

  // --- availability flags
  const flags = squad
    .map((id) => ({ id, st: statusInfo(state.playersById[id]) }))
    .filter((x) => x.st)
    .map(({ id, st }) => ({ id, label: st.label, flag: st.flag }));

  // --- captain call
  const recCap = [...lineup].sort((a, b) => model.xp(b, gw) - model.xp(a, gw))[0] ?? null;
  const capXp = recCap ? model.xp(recCap, gw) : 0;

  // --- best transfers the bank actually allows (5-GW gain, like-for-like)
  const clubs = {};
  for (const id of squad) {
    const tm = state.playersById[id].team;
    clubs[tm] = (clubs[tm] || 0) + 1;
  }
  const suggestions = [];
  for (const id of squad) {
    const cur = state.playersById[id];
    let best = null;
    for (const cand of state.bootstrap.elements) {
      if (cand.element_type !== cur.element_type || squad.includes(cand.id)) continue;
      if (cand.status !== 'a') continue;
      if (cand.now_cost > cur.now_cost + bank) continue;
      const sameClub = cand.team === cur.team;
      if ((clubs[cand.team] || 0) - (sameClub ? 1 : 0) >= MAX_PER_CLUB) continue;
      const gain = model.horizonTotal(cand.id) - horizon[id];
      if (gain > 3 && (!best || gain > best.gain)) best = { inId: cand.id, gain };
    }
    if (best) suggestions.push({ outId: id, ...best });
  }
  const seen = new Set();
  const transfers = suggestions
    .sort((a, b) => b.gain - a.gain)
    .filter((s) => (seen.has(s.inId) ? false : seen.add(s.inId)))
    .slice(0, 2);

  // --- lineup check: does the model's best XI beat the picked one?
  // Presented as who-for-who swaps plus the full recommended XI, so the
  // advice reads as an actual lineup rather than one merged sentence.
  let lineupFix = null;
  if (starters.length === 11 && xi) {
    const curPts = lineup.reduce((s, id) => s + model.xp(id, gw), 0);
    const gain = xi.total - curPts;
    if (gain > 0.4) {
      const posType = (id) => state.playersById[id].element_type;
      const outs = lineup.filter((id) => !xi.xi.includes(id));
      const remIns = xi.xi.filter((id) => !lineup.includes(id));
      const pairs = [];
      for (const out of outs) {
        // Same-position swap when there is one; formation changes pair up
        // whatever is left (e.g. a defender makes way for a midfielder).
        let idx = remIns.findIndex((id) => posType(id) === posType(out));
        if (idx === -1) idx = 0;
        const inId = remIns.splice(idx, 1)[0];
        if (inId == null) break;
        pairs.push({ out, in: inId, gain: model.xp(inId, gw) - model.xp(out, gw) });
      }
      lineupFix = { pairs, gain, xi: xi.xi, formation: xi.formation };
    }
  }

  return { gw, grade, xiXp, flags, captain: capId, recCap, capXp, transfers, lineupFix, bank };
}

export function analysisHtml(a) {
  const li = (icon, html) => `<li><span class="an-ic">${icon}</span><span>${html}</span></li>`;
  const items = [];

  for (const f of a.flags.slice(0, 3)) {
    items.push(li(f.flag, t('an.flagged', { name: nameOf(f.id), label: escapeHtml(f.label) })));
  }

  if (a.recCap) {
    const xp = a.capXp.toFixed(1);
    items.push(li('🎯', !a.captain || a.captain === a.recCap
      ? t('an.capGood', { name: nameOf(a.recCap), xp })
      : t('an.capSwap', { rec: nameOf(a.recCap), xp, cur: nameOf(a.captain) })));
  }

  if (a.transfers.length) {
    for (const s of a.transfers) {
      items.push(li('🔁', t('an.transfer', { out: nameOf(s.outId), in: nameOf(s.inId), gain: s.gain.toFixed(1) })));
    }
  } else {
    items.push(li('💰', t('an.noTransfer', { bank: fmtPrice(a.bank) })));
  }

  let xiHtml = '';
  if (a.lineupFix) {
    for (const p of a.lineupFix.pairs) {
      items.push(li('🪑', t('an.lineupSwap', {
        in: nameOf(p.in),
        out: nameOf(p.out),
        gain: p.gain.toFixed(1),
      })));
    }
    // The recommended XI itself, row per position, incoming players lit up.
    const ins = new Set(a.lineupFix.pairs.map((p) => p.in));
    const rows = [1, 2, 3, 4].map((pos) => {
      const chips = a.lineupFix.xi
        .filter((id) => state.playersById[id].element_type === pos)
        .map((id) => `<span class="an-xi-p ${ins.has(id) ? 'in' : ''}">${nameOf(id)}</span>`)
        .join('');
      const label = posShort(state.positionsById[pos].singular_name_short);
      return `<div class="an-xi-row"><span class="an-xi-pos">${label}</span>${chips}</div>`;
    }).join('');
    xiHtml = `<div class="an-xi">
      <div class="an-xi-head">${t('an.xiTitle', { formation: a.lineupFix.formation, gain: a.lineupFix.gain.toFixed(1) })}</div>
      ${rows}
    </div>`;
  } else {
    items.push(li('✅', t('an.lineupOk')));
  }

  return `
    <div class="an-head">
      <span class="section-title" style="padding:0">${t('an.title')}</span>
      <span class="an-grade an-grade-${a.grade}">${t(`an.grade.${a.grade}`)}</span>
    </div>
    <p class="an-outlook">${t('an.outlook', { pts: a.xiXp.toFixed(0), gw: gwLabel(a.gw) })}</p>
    <ul class="an-list">${items.join('')}</ul>
    ${xiHtml}`;
}
