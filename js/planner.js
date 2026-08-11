// Planner v3: interactive squad builder + season transfer simulation.
// The first GW in the horizon is your editable base squad (pitch drag &
// drop, captain, chips). Later GWs simulate a rolling plan: record
// transfers per GW, free transfers bank up (max 5), extra moves cost
// -4, Wildcard/Free Hit make a GW's moves free (FH reverts after).
import { state, fmtPrice, num, escapeHtml, statusInfo } from './state.js';
import { playerPhoto, teamBadge, inlinePhoto, fixtureChips, infoNote } from './ui.js';
import { loadBaseline, buildModel } from './model.js';
import { openDrawer } from './drawer.js';
import { getPredictedXI } from './lineups.js';
import { t, haMark, gwLabel, posShort, posPlural, playerName, teamShort, teamName } from './i18n.js';

// Does this player actually start for his real club right now, per
// the same model behind the Lineups tab? A fantasy squad slot scoring
// 0 because its owner is on the bench is exactly the kind of thing
// this planner should surface, not just fixtures and price. The ring
// around the photo alone read as decoration, not information - so it
// pairs with an explicit "Starts"/"Bench" pill, same words the Lineups
// tab itself and the rest of the app already use for this.
function lineupStatus(p) {
  const starting = getPredictedXI(p.team).has(p.id);
  return {
    cls: starting ? 'lu-start' : 'lu-bench',
    label: starting ? t('common.starts') : t('common.bench'),
    title: starting ? t('pl.predictedStart') : t('pl.predictedBench'),
  };
}

// On phones the per-card action buttons become a bottom action sheet.
const isMobile = () => window.matchMedia('(max-width: 640px)').matches;

const SLOT_KEY = 'amitfpl:planner:slot';
const DRAFTS = ['A', 'B', 'C'];
let slot = 'A';
try { slot = localStorage.getItem(SLOT_KEY) || 'A'; } catch { /* private mode */ }
const slotKey = (s) => `amitfpl:planner:v3:${s}`;
const LEGACY_KEY = 'amitfpl:planner:v3';

// Custom draft names live in their own key, not inside each slot's own
// saved plan - naming slot B shouldn't require ever loading B as the
// active slot, and a name shouldn't vanish just because that slot's
// plan gets cleared.
const DRAFT_NAMES_KEY = 'amitfpl:planner:draftNames';
let draftNames = {};
try { draftNames = JSON.parse(localStorage.getItem(DRAFT_NAMES_KEY)) || {}; } catch { /* private mode */ }
const draftLabel = (s) => (draftNames[s] || '').trim() || t(`draft.${s}`);
function setDraftName(s, name) {
  const trimmed = name.trim().slice(0, 24);
  if (trimmed) draftNames[s] = trimmed; else delete draftNames[s];
  try { localStorage.setItem(DRAFT_NAMES_KEY, JSON.stringify(draftNames)); } catch { /* private mode */ }
}

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
  formationLock: null, // null = auto; otherwise '3-4-3' etc, one of FORMATIONS
  buildMode: 'xp', // 'xp' | 'owned' | 'differential' - what auto-build optimizes for
  planGw: null,
  baseSquad: [],   // 15 ids at the start of the plan
  starters: [],    // manual XI for the first GW
  captain: null,
  chips: {},       // eventId -> 'WC' | 'FH' | 'BB' | 'TC'
  transfers: {},   // eventId -> [{out, in}] for GWs after the first
  filterPos: 'all',
  filterTeam: 'all',
  filterStart: 'all', // 'all' | 'start' | 'bench' - real-life predicted lineup status
  search: '',
  maxPrice: '',
  sortKey: 'xp',
  swapId: null,
  pending: null,   // {type:'in'|'out', id} - half-made transfer
  showAssistant: false,
  building: false,
  buildOptions: null, // [{squad, xp}] - the auto-build's three takes
  showPlanTools: false, // Share/Copy/Compare-drafts tucked behind "⋯"
};

let sideScroll = 0;
let plannerRootEl = null;

// The "⋯" plan-tools menu closes on any click outside it. Bound once at
// module load (not per-render, since renderPlanner replaces the whole
// subtree on every state change) - a no-op until the menu is actually open.
document.addEventListener('click', (e) => {
  if (!view.showPlanTools || e.target.closest('.pl-tools-wrap') || !plannerRootEl) return;
  view.showPlanTools = false;
  renderPlanner(plannerRootEl);
});
// The menu is fixed-positioned (computed on render) since `.card` clips
// overflow - a stale position after scrolling would look broken, so just
// close it instead of tracking scroll.
window.addEventListener('scroll', () => {
  if (!view.showPlanTools || !plannerRootEl) return;
  view.showPlanTools = false;
  renderPlanner(plannerRootEl);
}, { capture: true, passive: true });

/* ---------------- persistence ---------------- */

// Cross-device plan sharing: the whole plan travels in the URL hash.
const encodePlan = () => {
  const payload = JSON.stringify({
    h: view.horizon, s: view.baseSquad, x: view.starters,
    c: view.captain, ch: view.chips, t: view.transfers, fl: view.formationLock,
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
      formationLock: FORMATION_STRINGS.includes(d.fl) ? d.fl : null,
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
        formationLock: FORMATION_STRINGS.includes(saved.formationLock) ? saved.formationLock : null,
        baseSquad: (saved.baseSquad || []).filter((id) => state.playersById[id]),
        starters: (saved.starters || []).filter((id) => state.playersById[id]),
        captain: saved.captain || null,
        chips: saved.chips || {},
        transfers: saved.transfers || {},
        buildOptions: (saved.buildOptions || []).filter(
          (o) => (o?.squad || []).every((id) => state.playersById[id])
        ) || null,
      });
      if (!view.buildOptions?.length) view.buildOptions = null;
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
    formationLock: view.formationLock,
    baseSquad: view.baseSquad,
    starters: view.starters,
    captain: view.captain,
    chips: view.chips,
    transfers: view.transfers,
    planXp: view._planXp ?? null,
    buildOptions: view.buildOptions,
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
    buildOptions: null,
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
  // Editing the base squad (model.gws[0]) is free/unlimited and never
  // calls recordTransfer, so it must contribute nothing to the count -
  // otherwise every real GW after it shows one FT too many.
  let carry = 0;
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

// How much each squad slot is worth, best player in the position group
// first. Roughly the chance that slot's player starts a given week: the
// XI slots count in full, bench slots barely. Optimizing this - instead
// of the raw sum of all 15 - keeps the budget in the starting lineup,
// so near-zero "enabler" picks sit on the bench instead of up front.
// The default assumes a squad has to cover whatever formation it ends
// up needing, so it guarantees real weight to a 4th DEF/MID and treats
// a 3rd FWD as a pure cheap enabler - which is why an un-targeted build
// almost always suits 4-4-2 best. slotWeightsFor([d,m,f]) derives the
// same shape of table but targeted at one specific formation: full
// weight for exactly the starters that formation needs, tapering off
// for whatever's left over as bench depth.
const TAIL_DM = [0.7, 0.25, 0.1];
const TAIL_FWD = [0.8, 0.35, 0.15];
function slotWeightsFor(formation) {
  // Default parameter destructuring only kicks in for `undefined`, but
  // `null` is this file's own convention for "no formation" everywhere
  // else (parseFormationLock, view.formationLock) - callers legitimately
  // pass it here too, so it has to fall back the same way `undefined`
  // does instead of crashing on `[d, m, f] = null`.
  const [d, m, f] = formation || [3, 3, 1];
  const tail = (req, total, taper) =>
    Array.from({ length: total }, (_, i) => (i < req ? 1 : taper[i - req] ?? 0.05));
  return {
    1: [1, 0.1],
    2: tail(d, 5, TAIL_DM),
    3: tail(m, 5, TAIL_DM),
    4: tail(f, 3, TAIL_FWD),
  };
}
const SLOT_WEIGHTS = slotWeightsFor();

// "Most owned" and "most differential" builds aren't optimizing a
// starting XI's shape at all - they want the best sum across the
// whole 15, bench included, so every slot counts the same instead of
// tapering off after the depth a formation would need.
const UNIFORM_WEIGHTS = { 1: [1, 1], 2: [1, 1, 1, 1, 1], 3: [1, 1, 1, 1, 1], 4: [1, 1, 1] };

function weightedSquadScore(squad, score, weights = SLOT_WEIGHTS) {
  let total = 0;
  for (const pos of [1, 2, 3, 4]) {
    const vals = squad.filter((id) => posOf(id) === pos).map((id) => score[id]).sort((a, b) => b - a);
    for (let i = 0; i < vals.length; i++) total += vals[i] * (weights[pos][i] ?? 0);
  }
  return total;
}

// A fantasy pick who's really benched by his own club is a
// near-guaranteed blank whatever his underlying quality, so real
// life's own starting XI gets a soft say here too - not just once the
// squad is picked and the XI gets chosen from it, but already at
// build time, so auto-build stops proposing real-bench players in the
// first place instead of relying on bestXI to work around them later.
const REAL_BENCH_DISCOUNT = 0.6;
const isRealStarter = (id) => getPredictedXI(state.playersById[id].team).has(id);
const xiWeight = (id) => (isRealStarter(id) ? 1 : REAL_BENCH_DISCOUNT);

// Single-slot upgrades (below) only ever accept a swap that improves
// the score on its own, so once the budget is fully committed they
// stall: freeing money to afford a badly-needed upgrade in one
// position means accepting a worse player in another, which no single
// swap will ever do by itself. This pairs a downgrade with the
// upgrade it funds and judges the two together, so a squad that's
// paid for three premium picks and left, say, its forward line with
// nothing but minimum-price fillers can still trade a little of that
// premium away for a real second forward. Candidate shortlists are
// capped (cheapest few to free money, best-scoring few to spend it) to
// keep the search - one pair of nested position pools per candidate
// pair - fast enough to run inside the existing iteration budget.
const COMPOUND_SHORTLIST = 15;
function bestCompoundSwap(squad, score, pools, weights) {
  const curScore = weightedSquadScore(squad, score, weights);
  let best = null;
  for (let i = 0; i < squad.length; i++) {
    const curI = state.playersById[squad[i]];
    const donors = pools[curI.element_type]
      .filter((p) => p.now_cost < curI.now_cost && !squad.includes(p.id))
      .sort((a, b) => a.now_cost - b.now_cost)
      .slice(0, COMPOUND_SHORTLIST);
    for (const donor of donors) {
      const trial1 = squad.map((id, k) => (k === i ? donor.id : id));
      const trial1Cost = cost(trial1);
      for (let j = 0; j < squad.length; j++) {
        if (j === i) continue;
        const curJ = state.playersById[squad[j]];
        // Filter to what's actually affordable with the money this
        // donor swap freed *before* ranking by score - otherwise the
        // top-15-by-score shortlist can be entirely out of reach and
        // the search finds nothing, even when an affordable recipient
        // further down the ranking would have been a real upgrade.
        const maxAffordable = BUDGET - trial1Cost + curJ.now_cost;
        const recipients = pools[curJ.element_type]
          .filter((p) => !trial1.includes(p.id) && p.now_cost <= maxAffordable)
          .sort((a, b) => score[b.id] - score[a.id])
          .slice(0, COMPOUND_SHORTLIST);
        for (const rec of recipients) {
          const trial2 = trial1.map((id, k) => (k === j ? rec.id : id));
          if (Object.values(clubCounts(trial2)).some((c) => c > MAX_PER_CLUB)) continue;
          const s = weightedSquadScore(trial2, score, weights);
          if (s > curScore + 0.001 && (!best || s > best.s)) best = { i, donorId: donor.id, j, recId: rec.id, s };
        }
      }
    }
  }
  return best;
}

// avoid: ids from earlier build options, mildly penalized so the next
// option lands on a genuinely different squad - not the same 15 again.
// jitter: random per-player noise so every click of the build button
// reshuffles the marginal picks instead of repeating the same answer.
// mode: 'xp' (default) maximizes expected points; 'owned' maximizes
// total ownership %, for a safe/template squad; 'differential' picks
// only real-life starters under DIFFERENTIAL_OWNERSHIP_CAP, then
// maximizes spend + xP within that pool. A soft ownership penalty in
// the score (rather than a hard cutoff) would let a couple of extra
// points of xP or price buy back several points of ownership one
// swap at a time, drifting the "differential" squad toward the same
// popular picks "most owned" would choose - the cap keeps every slot
// genuinely low-owned, and once that's guaranteed, nothing left in
// the score should be pulling away from using the full budget.
const DIFFERENTIAL_OWNERSHIP_CAP = 10;
function buildOptimalSquad(model, avoid = null, jitter = 0, formation = null, mode = 'xp') {
  const weights = mode === 'xp' ? slotWeightsFor(formation) : UNIFORM_WEIGHTS;
  const score = {};
  const pools = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of state.bootstrap.elements) {
    if (p.status === 'u' || p.status === 'n') continue;
    if (mode === 'differential' && (!isRealStarter(p.id) || num(p.selected_by_percent) > DIFFERENTIAL_OWNERSHIP_CAP)) continue;
    if (mode === 'owned') {
      score[p.id] = num(p.selected_by_percent);
    } else if (mode === 'differential') {
      score[p.id] = p.now_cost * 10 + model.horizonTotal(p.id);
    } else {
      score[p.id] = model.horizonTotal(p.id)
        * xiWeight(p.id)
        * (avoid?.has(p.id) ? 0.9 : 1)
        * (jitter ? 1 + (Math.random() - 0.5) * jitter : 1);
    }
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
  let curScore = weightedSquadScore(squad, score, weights);
  for (let iter = 0; iter < 300; iter++) {
    let best = null;
    for (let i = 0; i < squad.length; i++) {
      const cur = state.playersById[squad[i]];
      for (const cand of pools[cur.element_type]) {
        if (squad.includes(cand.id)) continue;
        if (cost(squad) - cur.now_cost + cand.now_cost > BUDGET) continue;
        const counts = clubCounts(squad.filter((id) => id !== cur.id));
        if ((counts[cand.team] || 0) >= MAX_PER_CLUB) continue;
        const trial = squad.map((id, j) => (j === i ? cand.id : id));
        const s = weightedSquadScore(trial, score, weights);
        if (s > curScore + 0.001 && (!best || s > best.s)) best = { i, cand: cand.id, s };
      }
    }
    if (best) {
      squad[best.i] = best.cand;
      curScore = best.s;
      continue;
    }
    const compound = bestCompoundSwap(squad, score, pools, weights);
    if (!compound) break;
    squad[compound.i] = compound.donorId;
    squad[compound.j] = compound.recId;
    curScore = compound.s;
  }
  return squad;
}

const FORMATIONS = [];
for (let d = 3; d <= 5; d++)
  for (let m = 2; m <= 5; m++)
    for (let f = 1; f <= 3; f++)
      if (d + m + f === 10) FORMATIONS.push([d, m, f]);

// Every squad always has the standard 2/5/5/3 split, so all 8 of
// these are reachable from any complete squad - no feasibility check
// needed when a user locks one in.
const FORMATION_STRINGS = FORMATIONS.map(([d, m, f]) => `${d}-${m}-${f}`);
const parseFormationLock = (s) => (FORMATION_STRINGS.includes(s) ? FORMATIONS.find(([d, m, f]) => `${d}-${m}-${f}` === s) : null);

// buildModel(horizon) walks forward from the current gw and stops at
// gw 38 regardless of how large `horizon` is, so any value at least
// that large means "every remaining gameweek" - this sentinel just
// documents the intent at call sites instead of a bare magic number.
const SEASON_HORIZON = 99;

// When nothing's locked, auto-build compares one squad genuinely built
// for each of these horizons - a short-term push, a medium-term
// balance, a season-long hold - each with its own true forecast and
// its own simulated transfer/chip plan, so the choice is a real
// short-vs-long-term tradeoff instead of near-duplicates.
const COMPARE_HORIZONS = [3, 5, 8, SEASON_HORIZON];

const horizonLabel = (h) => (h === SEASON_HORIZON ? t('pl.seasonHorizon') : t('common.nGws', { n: h }));

// If picking purely for total xp left the bench with zero real-club
// starters, FPL's auto-substitution has nothing useful to bring on if
// an XI player doesn't play. Swap in whichever bench player restores
// that safety net for the least xp given up - skipped entirely if the
// bench already has one, so this never fires on a normal squad.
function ensureBenchHasRealStarter(model, eventId, squadIds, xi) {
  const bench = squadIds.filter((id) => !xi.includes(id));
  if (!bench.length || bench.some(isRealStarter)) return xi;
  let swap = null;
  for (const outId of xi) {
    if (!isRealStarter(outId)) continue;
    for (const inId of bench) {
      if (posOf(inId) !== posOf(outId)) continue;
      const cost = model.xp(outId, eventId) - model.xp(inId, eventId);
      if (!swap || cost < swap.cost) swap = { outId, inId, cost };
    }
  }
  return swap ? xi.map((id) => (id === swap.outId ? swap.inId : id)) : xi;
}

// formationLock: '4-4-2' etc to restrict the search to just that
// formation, or omit/null to auto-pick whichever formation scores
// highest (the normal behavior).
export function bestXI(model, squadIds, eventId, formationLock) {
  const byPos = { 1: [], 2: [], 3: [], 4: [] };
  for (const id of squadIds) byPos[posOf(id)].push({ id, xp: model.xp(id, eventId) });
  for (const pos of [1, 2, 3, 4]) byPos[pos].sort((a, b) => b.xp * xiWeight(b.id) - a.xp * xiWeight(a.id));
  const lock = parseFormationLock(formationLock);
  let best = null;
  for (const [d, m, f] of lock ? [lock] : FORMATIONS) {
    if (byPos[2].length < d || byPos[3].length < m || byPos[4].length < f || !byPos[1].length) continue;
    const xi = [byPos[1][0], ...byPos[2].slice(0, d), ...byPos[3].slice(0, m), ...byPos[4].slice(0, f)];
    // Formations are compared on the discounted total, not raw xp - a
    // 4-5-1 that forces in a confirmed real-life bench-warmer as its
    // 5th mid should lose to a 3-4-3 that plays an actual starter up
    // front instead, even if the bench-warmer's raw xp edges it out.
    // The reported total below is still true xp, so the discount never
    // inflates the displayed forecast.
    const weighted = xi.reduce((s, e) => s + e.xp * xiWeight(e.id), 0);
    if (!best || weighted > best.weighted) best = { xi: xi.map((e) => e.id), weighted, formation: `${d}-${m}-${f}` };
  }
  if (!best) return best;
  best.xi = ensureBenchHasRealStarter(model, eventId, squadIds, best.xi);
  best.total = best.xi.reduce((s, id) => s + model.xp(id, eventId), 0);
  delete best.weighted;
  return best;
}

// Comparable forecast for an arbitrary squad: best XI + captain, summed
// over the horizon. Labels the auto-build options so picking between
// them is a number, not a guess.
function squadForecast(model, squad, formationLock = view.formationLock) {
  return model.gws.reduce((s, gw) => {
    const xi = bestXI(model, squad, gw, formationLock);
    if (!xi) return s;
    return s + xi.total + Math.max(...xi.xi.map((id) => model.xp(id, gw)));
  }, 0);
}

// Same as squadForecast, but the squad is allowed to change gw to gw
// (for a squad plus the transfer plan simulated for it below, where the
// whole point is that the squad on gw 5 isn't the squad on gw 1
// anymore), and it matches gwForecast's own accounting - captain
// double, chip bonus, hit cost - instead of a bare XI sum, so the
// number shown for an option is the same number "Plan xP" would show
// once you actually pick it, not a smaller one that omits chips.
function planForecast(model, squadTimeline, chips = {}, plan = []) {
  const hitsByGw = {};
  for (const tr of plan) if (tr.hit) hitsByGw[tr.gw] = (hitsByGw[tr.gw] || 0) + 4;
  return model.gws.reduce((s, gw, i) => {
    const squad = squadTimeline[i];
    const xi = bestXI(model, squad, gw, null);
    if (!xi) return s;
    const capPts = Math.max(...xi.xi.map((id) => model.xp(id, gw)));
    const benchPts = squad.filter((id) => !xi.xi.includes(id)).reduce((a, id) => a + model.xp(id, gw), 0);
    let pts = xi.total + capPts;
    if (chips.tc?.gw === gw) pts += capPts;
    if (chips.bb?.gw === gw) pts += benchPts;
    return s + pts - (hitsByGw[gw] || 0);
  }, 0);
}

// A greedy week-by-week transfer plan for one horizon-built squad: at
// each gw after the first, look for the single swap worth the most
// xp over the rest of the horizon (not just that one week - a transfer
// made in gw 2 pays for itself over gws 2..N, so it's judged on that
// full remaining value, same logic a human would use to decide "is
// this transfer worth it"). Takes it only if the gain clears a bar
// that's higher when it would cost a hit (no free transfer banked) -
// this is a real, if simplified, single-transfer-per-week planner, not
// a globally optimal one; like the squad builder itself, a good greedy
// heuristic beats no plan at all.
function simulateTransferPlan(model, squad) {
  const plan = [];
  let cur = [...squad];
  let ft = 1;
  for (let i = 1; i < model.gws.length; i++) {
    const gw = model.gws[i];
    const itb = BUDGET - cost(cur);
    const clubs = clubCounts(cur);
    let best = null;
    for (const outId of cur) {
      const outP = state.playersById[outId];
      for (const cand of state.bootstrap.elements) {
        if (cand.element_type !== outP.element_type || cur.includes(cand.id)) continue;
        if (cand.status !== 'a' && cand.status !== 'd') continue;
        if (cand.now_cost > outP.now_cost + itb) continue;
        const clubCount = (clubs[cand.team] || 0) - (cand.team === outP.team ? 1 : 0);
        if (clubCount >= MAX_PER_CLUB) continue;
        let gain = 0;
        for (let j = i; j < model.gws.length; j++) {
          gain += model.xp(cand.id, model.gws[j]) * xiWeight(cand.id) - model.xp(outId, model.gws[j]) * xiWeight(outId);
        }
        if (gain > 0 && (!best || gain > best.gain)) best = { outId, inId: cand.id, gain };
      }
    }
    const bar = ft > 0 ? 1.5 : 4.5; // clearing a hit needs a bigger payoff
    if (best && best.gain > bar) {
      plan.push({ gw, outId: best.outId, inId: best.inId, gain: best.gain, hit: ft === 0 });
      cur = cur.map((id) => (id === best.outId ? best.inId : id));
      ft = Math.max(0, ft - 1);
    }
    ft = Math.min(MAX_FT, ft + 1);
  }
  return plan;
}

// FPL's own `form` (avg points over their last 30 days) is 0.0 for
// every player before a ball's been kicked this season - so this nudge
// is a genuine no-op right now, same as the Free Hit blank-gameweek
// detection above. The moment real matches start feeding real form
// numbers into the normal data refresh, a Wildcard/Free Hit rebuild
// (and the weekly single-swap search below) starts actually favouring
// whoever's hot, the way a real manager would, with no code change.
const FORM_WEIGHT = 4;
const formNudge = (id) => FORM_WEIGHT * num(state.playersById[id].form);

// A model whose horizonTotal only sums a sub-window of gws instead of
// the full remaining season - buildOptimalSquad only ever reads
// model.xp/model.horizonTotal, so this is enough to make it rebuild
// "the best squad for just this window" without touching it at all.
const windowedModel = (model, gws) => ({
  xp: model.xp,
  gws,
  horizonTotal: (id) => gws.reduce((s, e) => s + model.xp(id, e), 0) + formNudge(id),
});

// Pairs the players two same-quota squads don't share, position by
// position (both squads satisfy the same GK/DEF/MID/FWD quota, so the
// outs and ins for a given position always come out the same length).
function squadDiff(fromSquad, toSquad) {
  const moves = [];
  for (const pos of [1, 2, 3, 4]) {
    const outs = fromSquad.filter((id) => posOf(id) === pos && !toSquad.includes(id));
    const ins = toSquad.filter((id) => posOf(id) === pos && !fromSquad.includes(id));
    outs.forEach((outId, i) => moves.push({ outId, inId: ins[i] }));
  }
  return moves;
}

const SEASON_WC_COUNT = 2;
const SEASON_WC_WINDOW = 8; // gws a Wildcard rebuild is aimed at, not the whole rest of the season
const SEASON_WC_MIN_GAIN = 1; // over that window - low bar, since a free full rebuild has no real downside
const SEASON_FH_MIN_BLANKS = 4; // squad players with no fixture that gw before Free Hit is even considered
const SEASON_FH_MIN_GAIN = 2;
// Lower than simulateTransferPlan's 1.5/4.5 - a season is 38 chances
// to improve, not 3-8, and a squad built with full-season foresight
// only clears a high bar rarely, which read as "no strategy at all"
// rather than the deliberately conservative plan it actually was.
const SEASON_SWAP_BAR_FREE = 0.5;
const SEASON_SWAP_BAR_HIT = 3;

// Rest-of-season plan: the same week-by-week single swap as
// simulateTransferPlan, but with FPL's bigger season-shaping tools
// folded in too, since a real manager wouldn't hold the same 15 all
// year:
//  - two Wildcards (free full-squad rebuilds), placed a quarter and
//    three-quarters of the way through so each targets a fresh
//    SEASON_WC_WINDOW-gw fixture swing instead of the literal rest of
//    the season - and only taken if the rebuild clears a real bar,
//    since it's a resource you only get twice.
//  - one Free Hit, reserved for the squad's single blankest gameweek
//    (a one-week-only rebuild that reverts after, same semantics as
//    the manual FH chip already has via squadAt/ftInfo). FPL doesn't
//    confirm blank/double gameweeks until cup replays force
//    reschedules well into the season, so against today's fixture
//    list this never finds a candidate - the moment fixtures.json
//    picks up a real blank via the normal data refresh, this starts
//    suggesting Free Hit for it with no further code changes.
function simulateSeasonPlan(model, baseSquad) {
  const gws = model.gws;
  const wcPoints = new Set([gws[Math.floor(gws.length / 4)], gws[Math.floor((gws.length * 3) / 4)]].filter(Boolean));

  let fhGw = null;
  let fhBlanks = SEASON_FH_MIN_BLANKS - 1;
  for (const gw of gws.slice(1)) {
    const blanks = baseSquad.filter((id) =>
      !(state.upcomingByTeam[state.playersById[id].team] || []).some((f) => f.event === gw)).length;
    if (blanks > fhBlanks) { fhBlanks = blanks; fhGw = gw; }
  }

  const plan = [];
  let cur = [...baseSquad];
  let ft = 1;
  let wcUsed = 0;
  for (let i = 1; i < gws.length; i++) {
    const gw = gws[i];

    if (wcPoints.has(gw) && wcUsed < SEASON_WC_COUNT) {
      wcUsed++;
      const window = gws.slice(i, i + SEASON_WC_WINDOW);
      const wModel = windowedModel(model, window);
      const rebuilt = buildOptimalSquad(wModel, null, 0, null, 'xp');
      // squadForecast is the same real-XI-plus-captain yardstick every
      // other comparison in this file uses - a flat sum of raw per-
      // player xp would rate buildOptimalSquad's own output as *worse*
      // than the squad it's replacing, since the builder optimizes for
      // slot-weighted XI value (bench barely counts), not a flat total.
      if (squadForecast(wModel, rebuilt, null) - squadForecast(wModel, cur, null) > SEASON_WC_MIN_GAIN) {
        plan.push({ gw, wc: true, moves: squadDiff(cur, rebuilt) });
        cur = rebuilt;
      }
      // Neither chip spends or grants a free transfer, but banking still
      // proceeds as normal - same real-FT semantics ftInfo already
      // applies to the applied plan, kept in sync here so the sim's own
      // hit/no-hit calls for the following weeks match what actually
      // shows up once this plan is applied.
      ft = Math.min(MAX_FT, ft + 1);
      continue; // a Wildcard week already moved the squad - skip the single-swap check below
    }

    if (gw === fhGw) {
      const wModel = windowedModel(model, [gw]);
      const fhSquad = buildOptimalSquad(wModel, null, 0, null, 'xp');
      if (squadForecast(wModel, fhSquad, null) - squadForecast(wModel, cur, null) > SEASON_FH_MIN_GAIN) {
        plan.push({ gw, fh: true, moves: squadDiff(cur, fhSquad) });
      }
      ft = Math.min(MAX_FT, ft + 1);
      continue; // Free Hit reverts after its own gw - `cur` carries on unchanged
    }

    const itb = BUDGET - cost(cur);
    const clubs = clubCounts(cur);
    let best = null;
    for (const outId of cur) {
      const outP = state.playersById[outId];
      for (const cand of state.bootstrap.elements) {
        if (cand.element_type !== outP.element_type || cur.includes(cand.id)) continue;
        if (cand.status !== 'a' && cand.status !== 'd') continue;
        if (cand.now_cost > outP.now_cost + itb) continue;
        const clubCount = (clubs[cand.team] || 0) - (cand.team === outP.team ? 1 : 0);
        if (clubCount >= MAX_PER_CLUB) continue;
        let gain = formNudge(cand.id) - formNudge(outId);
        for (let j = i; j < gws.length; j++) {
          gain += model.xp(cand.id, gws[j]) * xiWeight(cand.id) - model.xp(outId, gws[j]) * xiWeight(outId);
        }
        if (gain > 0 && (!best || gain > best.gain)) best = { outId, inId: cand.id, gain };
      }
    }
    const bar = ft > 0 ? SEASON_SWAP_BAR_FREE : SEASON_SWAP_BAR_HIT;
    if (best && best.gain > bar) {
      plan.push({ gw, outId: best.outId, inId: best.inId, gain: best.gain, hit: ft === 0 });
      cur = cur.map((id) => (id === best.outId ? best.inId : id));
      ft = Math.max(0, ft - 1);
    }
    ft = Math.min(MAX_FT, ft + 1);
  }
  return plan;
}

// The squad at each gw in model.gws, after applying a plan from
// simulateTransferPlan/simulateSeasonPlan in order. Free Hit entries
// deliberately don't update `cur` - they revert after their own gw,
// same as the manual FH chip.
function squadTimelineFromPlan(model, baseSquad, plan) {
  let cur = [...baseSquad];
  let planIdx = 0;
  return model.gws.map((gw) => {
    let fhSquad = null;
    while (planIdx < plan.length && plan[planIdx].gw === gw) {
      const t = plan[planIdx];
      if (t.wc) {
        for (const m of t.moves) cur = cur.map((id) => (id === m.outId ? m.inId : id));
      } else if (t.fh) {
        fhSquad = cur.map((id) => t.moves.find((m) => m.outId === id)?.inId ?? id);
      } else {
        cur = cur.map((id) => (id === t.outId ? t.inId : id));
      }
      planIdx++;
    }
    return fhSquad || cur;
  });
}

// Best Triple Captain / Bench Boost weeks for a simulated timeline -
// same idea as the Assistant's chipAdvice, but off a squad that's
// allowed to evolve with the plan instead of the live view state.
function simulateChipAdvice(model, timeline) {
  let tc = null;
  let bb = null;
  let bbWeighted = -Infinity;
  model.gws.forEach((gw, i) => {
    const squad = timeline[i];
    const xi = bestXI(model, squad, gw, null);
    if (!xi) return;
    const capXp = Math.max(...xi.xi.map((id) => model.xp(id, gw)));
    const bench = squad.filter((id) => !xi.xi.includes(id));
    const benchXp = bench.reduce((s, id) => s + model.xp(id, gw), 0);
    // Same xiWeight ranking as chipAdvice - pick the gw where the bench
    // is actually made of real starters squeezed out by the XI, not
    // one propped up by a fringe player's raw (unrealistic) xp.
    const benchWeighted = bench.reduce((s, id) => s + model.xp(id, gw) * xiWeight(id), 0);
    if (!tc || capXp > tc.v) tc = { gw, v: capXp };
    if (benchWeighted > bbWeighted) { bbWeighted = benchWeighted; bb = { gw, v: benchXp }; }
  });
  return { tc, bb };
}

const sameSquad = (a, b) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

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
    const xi = bestXI(model, view.baseSquad, firstGw(model), view.formationLock);
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
  const xi = bestXI(model, squad, gw, view.formationLock);
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

// Weighted by xiWeight for ranking/threshold, same as the auto-build
// score and bestXI's formation choice - a transfer target who's
// really benched by his own club shouldn't outrank a smaller raw
// upgrade into a confirmed starter. The gain shown to the user is
// still true (unweighted) xp, so the discount never inflates it.
const wscore = (model, id) => model.horizonTotal(id) * xiWeight(id);

function upgradeSuggestions(model, gw) {
  const squad = squadAt(model, gw);
  const itb = BUDGET - cost(squad);
  const clubs = clubCounts(squad);
  const out = [];
  for (const id of squad) {
    const cur = state.playersById[id];
    const curScore = model.horizonTotal(id);
    const curWeighted = wscore(model, id);
    let best = null;
    for (const cand of state.bootstrap.elements) {
      if (cand.element_type !== cur.element_type || squad.includes(cand.id)) continue;
      if (cand.status !== 'a' && cand.status !== 'd') continue;
      if (cand.now_cost > cur.now_cost + itb) continue;
      const clubCount = (clubs[cand.team] || 0) - (cand.team === cur.team ? 1 : 0);
      if (clubCount >= MAX_PER_CLUB) continue;
      const weightedGain = wscore(model, cand.id) - curWeighted;
      if (weightedGain > 0.5 && (!best || weightedGain > best.weightedGain)) {
        best = { cand, weightedGain, gain: model.horizonTotal(cand.id) - curScore };
      }
    }
    if (best) out.push({ outId: id, inId: best.cand.id, gain: best.gain });
  }
  const seen = new Set();
  return out
    .sort((a, b) => b.gain - a.gain)
    .filter((s) => (seen.has(s.inId) ? false : seen.add(s.inId)))
    .slice(0, 4);
}

// A single transfer can only ever upgrade one slot, so a squad that's
// spent its budget on premium picks elsewhere and left one position
// threadbare has no single move that fixes it - selling that one weak
// player never frees enough on its own to buy a real replacement. This
// mirrors bestCompoundSwap: pair a sell-down in a well-stocked position
// with the buy it funds, and suggest the pair only when the combined
// true xp gain clears a higher bar than a single transfer would (two
// moves - and the FT/hit cost that can come with them - want a bigger
// payoff than one).
const DOUBLE_SWAP_MIN_GAIN = 3;
function compoundUpgradeSuggestion(model, gw) {
  const squad = squadAt(model, gw);
  const curScore = squad.reduce((s, id) => s + wscore(model, id), 0);
  const byPos = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of state.bootstrap.elements) {
    if ((p.status !== 'a' && p.status !== 'd') || squad.includes(p.id)) continue;
    byPos[p.element_type].push(p);
  }
  let best = null;
  for (let i = 0; i < squad.length; i++) {
    const curI = state.playersById[squad[i]];
    const donors = byPos[curI.element_type]
      .filter((p) => p.now_cost < curI.now_cost)
      .sort((a, b) => a.now_cost - b.now_cost)
      .slice(0, COMPOUND_SHORTLIST);
    for (const donor of donors) {
      const trial1 = squad.map((id, k) => (k === i ? donor.id : id));
      const trial1Cost = cost(trial1);
      for (let j = 0; j < squad.length; j++) {
        if (j === i) continue;
        const curJ = state.playersById[squad[j]];
        // Same fix as bestCompoundSwap: rank only what's actually
        // affordable with the money this donor swap freed, so the
        // shortlist isn't wasted on recipients the freed cash can't
        // reach.
        const maxAffordable = BUDGET - trial1Cost + curJ.now_cost;
        const recipients = byPos[curJ.element_type]
          .filter((p) => !trial1.includes(p.id) && p.now_cost <= maxAffordable)
          .sort((a, b) => wscore(model, b.id) - wscore(model, a.id))
          .slice(0, COMPOUND_SHORTLIST);
        for (const rec of recipients) {
          const trial2 = trial1.map((id, k) => (k === j ? rec.id : id));
          if (Object.values(clubCounts(trial2)).some((c) => c > MAX_PER_CLUB)) continue;
          const s = trial2.reduce((sum, id) => sum + wscore(model, id), 0);
          if (s > curScore + 0.001 && (!best || s > best.s)) {
            best = { outId1: squad[i], inId1: donor.id, outId2: squad[j], inId2: rec.id, s };
          }
        }
      }
    }
  }
  if (!best) return null;
  const gain = (model.horizonTotal(best.inId1) - model.horizonTotal(best.outId1))
    + (model.horizonTotal(best.inId2) - model.horizonTotal(best.outId2));
  return gain > DOUBLE_SWAP_MIN_GAIN ? { ...best, gain } : null;
}

function chipAdvice(model) {
  let tc = null;
  let bb = null;
  let bbWeighted = -Infinity;
  for (const e of model.gws) {
    const { squad, starters, captain } = lineupFor(model, e);
    const capXp = captain ? model.xp(captain, e) : 0;
    const bench = squad.filter((id) => !starters.includes(id));
    const benchXp = bench.reduce((s, id) => s + model.xp(id, e), 0);
    // Ranked by xiWeight, same reasoning as wscore: a bench full of
    // real starters who are just squeezed out by the XI beats a bench
    // with a higher raw total propped up by players their own club
    // benches, since those are the ones actually likely to return it.
    const benchWeighted = bench.reduce((s, id) => s + model.xp(id, e) * xiWeight(id), 0);
    if (!tc || capXp > tc.v) tc = { e, v: capXp };
    if (benchWeighted > bbWeighted) { bbWeighted = benchWeighted; bb = { e, v: benchXp }; }
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

  const doubleSwap = compoundUpgradeSuggestion(model, gw);
  if (doubleSwap) {
    items.push(`<div class="as-item">
      <span>${t('pl.asDoubleSwap', { in1: name(doubleSwap.inId1), out1: name(doubleSwap.outId1), in2: name(doubleSwap.inId2), out2: name(doubleSwap.outId2) })}
      <span class="hi">+${doubleSwap.gain.toFixed(1)} ${t('stat.xp')}</span>
      <span class="muted">${t('pl.asDoubleNote')}</span></span>
      <button class="as-apply" data-act="doubletransfer"
        data-out1="${doubleSwap.outId1}" data-in1="${doubleSwap.inId1}"
        data-out2="${doubleSwap.outId2}" data-in2="${doubleSwap.inId2}">${t('pl.asApply')}</button>
    </div>`);
  }

  if (isFirst && view.starters.length) {
    const xi = bestXI(model, view.baseSquad, gw, view.formationLock);
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
    <div class="assistant-head">${t('pl.assistant')} <span class="muted" style="font-weight:500">${view.horizon === SEASON_HORIZON ? t('pl.asSubtitleSeason') : t('pl.asSubtitle', { n: view.horizon })}</span></div>
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

  // Editable right in the comparison table - this is the "manage all
  // three drafts" view, so it's the natural place to name one without
  // first having to switch to it.
  const nameCell = (s) => `<input class="draft-name-input" data-draft="${s}"
    value="${escapeHtml(draftNames[s] || '')}" placeholder="${escapeHtml(t(`draft.${s}`))}"
    maxlength="24" />${s === slot ? ' ●' : ''}`;

  const rows = drafts.map(({ s, sq, chips, xp }) => {
    if (!sq.length) {
      return `<tr><td class="team-cell">${nameCell(s)}</td>
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
      <td class="team-cell">${nameCell(s)}</td>
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
  overlay.querySelectorAll('.draft-name-input').forEach((input) => {
    input.addEventListener('change', () => {
      setDraftName(input.dataset.draft, input.value);
      renderPlanner(root); // toolbar chips show the new name right away
    });
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
  const st = statusInfo(p);
  const flag = st ? `<span class="status-flag ${st.cls}" title="${escapeHtml(st.label)}">${st.flag}</span>` : '';
  const ls = lineupStatus(p);
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
    <div class="pp-photo-wrap" ${calm && !mobileSheet ? `data-pid="${id}"` : ''} style="${calm ? 'cursor:pointer' : ''}" title="${ls.title}">
      ${playerPhoto(p, `${isStarter ? 'pp-photo' : 'pp-photo pp-photo-sm'} ${ls.cls}`)}
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
    <div class="pp-name" ${pid}>${escapeHtml(playerName(p))}${flag}</div>
    <span class="lineup-pill ${ls.cls}" title="${ls.title}">${ls.label}</span>
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
    if (view.filterTeam !== 'all' && p.team !== +view.filterTeam) return false;
    if (view.filterStart !== 'all') {
      const starting = getPredictedXI(p.team).has(p.id);
      if (view.filterStart === 'start' && !starting) return false;
      if (view.filterStart === 'bench' && starting) return false;
    }
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
    const st = statusInfo(p);
    const flag = st ? `<span class="status-flag ${st.cls}" title="${escapeHtml(st.label)}">${st.flag}</span>` : '';
    const ls = lineupStatus(p);
    return `<div class="side-row">
      <span class="clickable" data-pid="${p.id}" title="${t('common.playerProfile')} · ${ls.title}">${playerPhoto(p, `row-photo ${ls.cls}`)}</span>
      <div class="side-info clickable" data-pid="${p.id}">
        <span class="player-name">${escapeHtml(playerName(p))}${flag} <span class="lineup-pill ${ls.cls}" title="${ls.title}">${ls.label}</span></span>
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
        <select id="sd-team">
          <option value="all">${t('common.allClubs')}</option>
          ${[...state.bootstrap.teams].sort((a, b) => teamName(a).localeCompare(teamName(b))).map((tm) => `<option value="${tm.id}" ${view.filterTeam == tm.id ? 'selected' : ''}>${escapeHtml(teamName(tm))}</option>`).join('')}
        </select>
        <select id="sd-lineup">
          <option value="all" ${view.filterStart === 'all' ? 'selected' : ''}>${t('pl.lineupAll')}</option>
          <option value="start" ${view.filterStart === 'start' ? 'selected' : ''}>${t('common.starts')}</option>
          <option value="bench" ${view.filterStart === 'bench' ? 'selected' : ''}>${t('common.bench')}</option>
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
  plannerRootEl = root;
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
          ${[3, 5, 8, SEASON_HORIZON].map((n) => `<option value="${n}" ${view.horizon === n ? 'selected' : ''}>${horizonLabel(n)}</option>`).join('')}
        </select>
        <label>${t('pl.formation')}</label>
        <select id="pl-formation" title="${t('pl.formationTitle')}">
          <option value="" ${view.formationLock ? '' : 'selected'}>${t('pl.formationAuto')}</option>
          ${FORMATION_STRINGS.map((f) => `<option value="${f}" ${view.formationLock === f ? 'selected' : ''}>${f}</option>`).join('')}
        </select>
        <label>${t('pl.buildMode')}</label>
        <select id="pl-buildmode" title="${t('pl.buildModeTitle')}">
          <option value="xp" ${view.buildMode === 'xp' ? 'selected' : ''}>${t('pl.buildModeXp')}</option>
          <option value="owned" ${view.buildMode === 'owned' ? 'selected' : ''}>${t('pl.buildModeOwned')}</option>
          <option value="differential" ${view.buildMode === 'differential' ? 'selected' : ''}>${t('pl.buildModeDiff')}</option>
        </select>
        <button class="btn" id="pl-build">${view.baseSquad.length ? t('pl.reOptimize') : t('pl.autoBuild')}</button>
        <button class="btn ghost ${view.showAssistant ? 'on' : ''}" id="pl-assist">${t('pl.assistant')}</button>
        <span class="spacer"></span>
        <span class="result-count">
          ${squad.length}/15 · <strong>${fmtPrice(totalCost)}</strong> · ${t('pl.bank')}
          <strong class="${itb < 0 ? 'lo' : ''}">${fmtPrice(itb)}</strong> ·
          ${t('pl.planXp')} <strong>${horizonTotal.toFixed(0)}</strong> ${infoNote('info.model')}${totalHits ? ` <span class="lo">${t('pl.hits', { n: totalHits })}</span>` : ''}
        </span>
        <button class="link-btn" id="pl-clear" ${view.baseSquad.length ? '' : 'disabled'}>${t('common.clear')}</button>
        <div class="pl-tools-wrap">
          <button class="link-btn" id="pl-tools-btn" aria-haspopup="true" aria-expanded="${view.showPlanTools ? 'true' : 'false'}">${t('pl.moreTools')} ⋯</button>
          <div class="pl-tools-menu" id="pl-tools-menu" ${view.showPlanTools ? '' : 'hidden'}>
            <button class="link-btn" id="pl-share" ${view.baseSquad.length ? '' : 'disabled'} title="${t('pl.shareTitle')}">${t('pl.share')}</button>
            <button class="link-btn" id="pl-copy" ${view.baseSquad.length ? '' : 'disabled'}>${t('pl.copy')}</button>
            <button class="link-btn" id="pl-drafts-cmp" title="${t('pl.cmpTitle')}">${t('pl.compareDrafts')}</button>
          </div>
        </div>
        <div class="gw-chips" id="pl-drafts" title="${t('pl.draftsTitle')}">
          ${DRAFTS.map((s) => {
            const meta = s === slot ? { n: view.baseSquad.length, xp: Math.round(horizonTotal) } : draftMeta(s);
            const letter = draftLabel(s);
            const label = meta && meta.n ? `${letter} · ${meta.xp ?? meta.n}` : letter;
            return `<button class="gw-chip ${s === slot ? 'active' : ''}" data-draft="${s}" title="${escapeHtml(letter)}">${escapeHtml(label)}</button>`;
          }).join('')}
        </div>
      </div>
      <div class="toolbar" style="border-bottom:none;padding-top:10px">
        <div class="gw-chips">${gwChips}</div>
        <span class="spacer"></span>
        <span class="result-count">${formationLabel}${lineup.captain ? ` · ${t('pl.capLabel')}: <strong>${escapeHtml(playerName(state.playersById[lineup.captain]))}</strong>` : ''} · ${t('pl.gwForecast', { gw: gwLabel(gw) })} <strong>${gwForecast(model, gw, ft).toFixed(1)} ${t('pl.pts')}</strong>${isFirst ? '' : ` ${t('pl.autoLineup')}`}</span>
      </div>
      ${view.buildOptions?.length ? `<div class="toolbar build-opts">
        <span class="build-opts-label">${t('pl.buildOpts')}</span>
        ${view.buildOptions.map((o, i) => `<button class="gw-chip ${sameSquad(o.squad, view.baseSquad) ? 'active' : ''}" data-build-opt="${i}">${o.label ?? t('pl.buildOptN', { n: i + 1 })} · ${o.xp}</button>`).join('')}
        ${infoNote('info.buildOpts')}
        <button class="link-btn" id="pl-build-opts-x" title="${t('common.close')}">✕</button>
      </div>` : ''}
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

  // `.card` clips overflow, so the "⋯" menu is fixed-positioned under its
  // button (mirrors the tab bar's More menu) instead of plain CSS absolute.
  if (view.showPlanTools) {
    const menu = root.querySelector('#pl-tools-menu');
    const btn = root.querySelector('#pl-tools-btn');
    if (menu && btn) {
      const margin = 8;
      const r = btn.getBoundingClientRect();
      const w = menu.offsetWidth;
      const start = document.documentElement.dir === 'rtl' ? r.right - w : r.left;
      menu.style.left = `${Math.max(margin, Math.min(start, window.innerWidth - w - margin))}px`;
      menu.style.top = `${r.bottom + 6}px`;
    }
  }

  root.querySelector('#pl-horizon').addEventListener('change', (e) => {
    view.horizon = +e.target.value;
    view.planGw = null;
    rerender();
  });

  root.querySelector('#pl-formation').addEventListener('change', (e) => {
    view.formationLock = e.target.value || null;
    // Re-run the auto XI for the base squad right away so locking a
    // formation is felt immediately on the pitch, not just on the
    // next re-optimize or future GW.
    if (view.baseSquad.length === 15) {
      const xi = bestXI(model, view.baseSquad, firstGw(model), view.formationLock);
      if (xi) { view.starters = xi.xi; view.captain = null; }
    }
    ensureConsistency(model);
    save();
    rerender();
  });

  root.querySelector('#pl-buildmode').addEventListener('change', (e) => {
    view.buildMode = e.target.value;
    rerender();
  });

  const applyBuildOption = (i) => {
    const opt = view.buildOptions?.[i];
    if (!opt) return;
    view.baseSquad = [...opt.squad];
    view.starters = [];
    view.captain = null;
    view.transfers = {};
    view.chips = {};
    // Picking a squad that was built for a specific shape should keep
    // that shape - otherwise bestXI's own auto-pick could immediately
    // reformat it into whatever formation happens to score highest for
    // these particular 15 players, silently contradicting the label the
    // user just chose.
    if (opt.formation) view.formationLock = opt.formation;
    // Horizon options come with their own simulated transfer/chip plan -
    // apply it through the same recordTransfer used everywhere else, so
    // it shows up exactly like a hand-built plan would (GW-tab badges,
    // chip bar, Assistant panel), not a separate display to maintain.
    if (opt.horizon) {
      view.horizon = opt.horizon;
      const hModel = buildModel(opt.horizon);
      for (const tr of opt.plan || []) {
        if (tr.wc || tr.fh) {
          // A batch chip move (Wildcard/Free Hit) is already validated as
          // a whole by buildOptimalSquad (budget, club limits) - pushing
          // it straight into view.transfers skips recordTransfer's
          // per-swap budget check, which only makes sense for one move
          // applied to a stable squad, not an interim step of a full
          // rebuild that could overshoot mid-sequence before landing back
          // on a valid total.
          (view.transfers[tr.gw] = view.transfers[tr.gw] || []).push(...tr.moves.map((m) => ({ out: m.outId, in: m.inId })));
          view.chips[tr.gw] = tr.wc ? 'WC' : 'FH';
        } else {
          recordTransfer(hModel, tr.gw, tr.outId, tr.inId);
        }
      }
      const tcGw = opt.chips?.tc?.gw;
      const bbGw = opt.chips?.bb?.gw;
      if (tcGw && !view.chips[tcGw]) view.chips[tcGw] = 'TC';
      if (bbGw && bbGw !== tcGw && !view.chips[bbGw]) view.chips[bbGw] = 'BB';
    }
    ensureConsistency(model);
  };

  // The build makes three different strong squads, so "auto build"
  // offers a choice instead of the same single answer every time.
  // Locked to one formation: three jittered takes on that shape (each
  // pass mildly penalizes players the previous ones used, for variety).
  // Unlocked: one real squad per horizon in COMPARE_HORIZONS - a
  // genuine short/medium/long-term tradeoff, each with its own
  // simulated transfer-and-chip plan for that horizon (see
  // simulateTransferPlan/simulateChipAdvice), instead of three
  // near-duplicate single-GW snapshots.
  root.querySelector('#pl-build').addEventListener('click', () => {
    if (view.building) return;
    view.building = true;
    const btn = root.querySelector('#pl-build');
    btn.textContent = t('pl.optimizing');
    btn.disabled = true;
    setTimeout(() => {
      // "Most owned"/"most differential" aren't a formation tradeoff -
      // there's exactly one squad that best fits the metric, so build
      // and apply it directly instead of offering 3 options to compare.
      if (view.buildMode !== 'xp') {
        const target = parseFormationLock(view.formationLock);
        const squad = buildOptimalSquad(model, null, 0, target, view.buildMode);
        view.buildOptions = null;
        view.baseSquad = [...squad];
        view.starters = [];
        view.captain = null;
        view.transfers = {};
        ensureConsistency(model);
        view.building = false;
        rerender();
        return;
      }
      const options = [];
      if (view.formationLock) {
        const used = new Set();
        const again = !!view.buildOptions;
        const target = parseFormationLock(view.formationLock);
        for (let k = 0; k < 3; k++) {
          const squad = buildOptimalSquad(model, k ? used : null, k || again ? 0.06 : 0, target);
          options.push({
            squad,
            formation: view.formationLock,
            label: t('pl.buildOptN', { n: k + 1 }),
            xp: Math.round(squadForecast(model, squad, view.formationLock)),
          });
          squad.forEach((id) => used.add(id));
        }
      } else {
        for (const h of COMPARE_HORIZONS) {
          const hModel = buildModel(h);
          const squad = buildOptimalSquad(hModel, null, 0, null, 'xp');
          const plan = h === SEASON_HORIZON ? simulateSeasonPlan(hModel, squad) : simulateTransferPlan(hModel, squad);
          const timeline = squadTimelineFromPlan(hModel, squad, plan);
          const chips = simulateChipAdvice(hModel, timeline);
          options.push({
            squad,
            horizon: h,
            label: horizonLabel(h),
            xp: Math.round(planForecast(hModel, timeline, chips, plan)),
            plan,
            chips,
          });
        }
        options.sort((a, b) => b.xp - a.xp);
      }
      view.buildOptions = options;
      // Sorted by total xp for display, but total xp isn't a fair pick
      // for which one to auto-apply - it structurally favours whichever
      // horizon sums the most gameweeks, so "highest score wins" would
      // always land on the Season option regardless of what's actually
      // best, making the comparison pointless. Auto-apply whichever
      // option matches the Horizon dropdown's current value instead
      // (falls back to the top-scoring one only for the formation-
      // locked jittered squads, which don't have a horizon to match).
      const defaultIdx = Math.max(0, options.findIndex((o) => o.horizon === view.horizon));
      applyBuildOption(defaultIdx);
      view.building = false;
      rerender();
    }, 30);
  });

  root.querySelectorAll('[data-build-opt]').forEach((b) =>
    b.addEventListener('click', () => {
      applyBuildOption(+b.dataset.buildOpt);
      rerender();
    })
  );

  root.querySelector('#pl-build-opts-x')?.addEventListener('click', () => {
    view.buildOptions = null;
    rerender();
  });

  root.querySelector('#pl-assist').addEventListener('click', () => {
    view.showAssistant = !view.showAssistant;
    rerender();
  });

  root.querySelector('#pl-tools-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    view.showPlanTools = !view.showPlanTools;
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
      if (act === 'doubletransfer') {
        const out1 = +b.dataset.out1;
        const in1 = +b.dataset.in1;
        const out2 = +b.dataset.out2;
        const in2 = +b.dataset.in2;
        if (isFirst) {
          const swap = (id) => (id === out1 ? in1 : id === out2 ? in2 : id);
          view.baseSquad = view.baseSquad.map(swap);
          view.starters = view.starters.map(swap);
          if (view.captain === out1) view.captain = in1;
          if (view.captain === out2) view.captain = in2;
        } else {
          recordTransfer(model, gw, out1, in1);
          recordTransfer(model, gw, out2, in2);
        }
      }
      if (act === 'bestxi') {
        const xi = bestXI(model, view.baseSquad, gw, view.formationLock);
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
    Object.assign(view, { baseSquad: [], starters: [], captain: null, transfers: {}, swapId: null, pending: null, buildOptions: null });
    rerender();
  });

  root.querySelectorAll('.gw-chip[data-gw]').forEach((b) =>
    b.addEventListener('click', () => { view.planGw = +b.dataset.gw; view.pending = null; view.swapId = null; rerender(); })
  );

  root.querySelector('#pl-drafts-cmp')?.addEventListener('click', () => {
    view.showPlanTools = false;
    openDraftCompare(model, root);
  });

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
  root.querySelector('#sd-team').addEventListener('change', (e) => { view.filterTeam = e.target.value; sideScroll = 0; rerender(); });
  root.querySelector('#sd-lineup').addEventListener('change', (e) => { view.filterStart = e.target.value; sideScroll = 0; rerender(); });
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
