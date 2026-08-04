// amitfpl xP model v1.
//
// Predicts expected FPL points per player per future gameweek from:
//  - baseline per-90 rates (data/baseline.json - last season's stats,
//    frozen pre-season because the live API resets them at GW1)
//  - current-season rates, blended in as minutes accumulate
//  - fixture difficulty via the API's team strength ratings
//  - availability flags (injuries/suspensions)
//
// It's deliberately simple and transparent - every number is explainable.
import { state, num } from './state.js';

const GOAL_PTS = { 1: 10, 2: 6, 3: 5, 4: 4 };
const CS_PTS = { 1: 4, 2: 4, 3: 1, 4: 0 };
const AVG_TEAM_XG = 1.4; // league-average goals per team per match
const STRENGTH_EXP = 1.5; // amplifies strength ratios into goal expectation

let baselineById = null;

// Frozen pre-season stats for a player (null if unknown).
export function baselinePlayer(id) {
  return baselineById?.[id] || null;
}

export async function loadBaseline() {
  if (baselineById) return;
  baselineById = {};
  try {
    const res = await fetch('data/baseline.json', { cache: 'force-cache' });
    const data = await res.json();
    for (const p of data.elements) baselineById[p.id] = p;
  } catch { /* model degrades to current-season stats only */ }
}

// FDR fallbacks, used while the API's team strength ratings are
// unpublished (they're all 0 until early season). Keyed by the fixture
// difficulty (1 easiest … 5 hardest) from the attacking side's view.
const FDR_ATTACK_SCALE = { 1: 1.35, 2: 1.18, 3: 1.0, 4: 0.8, 5: 0.62 };
const FDR_OPP_XG = { 1: 0.8, 2: 1.0, 3: 1.35, 4: 1.7, 5: 2.05 };

// Primary team-strength source: ClubElo ratings (data/elo.json,
// refreshed daily). Goal expectation from the Elo gap with home
// advantage; calibrated so two equal sides produce ~2.55 total goals.
const ELO_HOME_ADV = 60;
const ELO_GOAL_B = 0.0022;

function teamXGElo(teamId, oppId, isHome) {
  const eh = state.elo?.[teamId];
  const ea = state.elo?.[oppId];
  if (!eh || !ea) return null;
  const diff = (eh + (isHome ? ELO_HOME_ADV : 0)) - (ea + (isHome ? 0 : ELO_HOME_ADV));
  const base = isHome ? 1.35 : 1.15;
  return Math.min(4, base * Math.exp(ELO_GOAL_B * diff));
}

function teamXG(team, opp, isHome) {
  const elo = teamXGElo(team.id, opp.id, isHome);
  if (elo != null) return elo;
  const att = isHome ? team.strength_attack_home : team.strength_attack_away;
  const def = isHome ? opp.strength_defence_away : opp.strength_defence_home;
  if (!att || !def) return null; // strengths not published yet -> FDR fallback
  const base = isHome ? 1.55 : 1.25;
  const ratio = Math.min(2, Math.max(0.5, att / def));
  return base * Math.pow(ratio, STRENGTH_EXP);
}

// P(X >= k) for a Poisson(lambda) - used for defensive-contribution
// threshold points.
function poissonAtLeast(lambda, k) {
  if (lambda <= 0) return 0;
  let term = Math.exp(-lambda);
  let cdf = term;
  for (let i = 1; i < k; i++) {
    term *= lambda / i;
    cdf += term;
  }
  return Math.max(0, Math.min(1, 1 - cdf));
}

function per90(baseline, current, field) {
  const b = baseline || current;
  const bMins = b?.minutes || 0;
  const cMins = current.minutes || 0;
  // Weight current season in as minutes accumulate (fully by ~900 mins).
  // Pre-season current === baseline, so the blend is a no-op.
  const w = Math.min(1, cMins / 900);
  const bRate = bMins > 0 ? (num(b[field]) / bMins) * 90 : 0;
  const cRate = cMins > 0 ? (num(current[field]) / cMins) * 90 : 0;
  return w * cRate + (1 - w) * bRate;
}

function availability(p) {
  if (p.status === 'a') return 1;
  if (p.status === 'd') return (p.chance_of_playing_next_round ?? 75) / 100;
  return 0;
}

// Returns {xp: (playerId, eventId) => number, gws: [eventIds]} for the
// next `horizon` gameweeks.
export function buildModel(horizon) {
  const fromEvent = (state.currentEvent || state.nextEvent)?.id ?? 1;
  const gws = [];
  for (let e = fromEvent; e < fromEvent + horizon && e <= 38; e++) gws.push(e);

  // team id -> event id -> [{opp, isHome}]
  const fixturesByTeam = {};
  for (const t of state.bootstrap.teams) {
    const byEvent = {};
    for (const f of state.upcomingByTeam[t.id] || []) {
      if (f.event >= fromEvent && f.event < fromEvent + horizon) {
        (byEvent[f.event] = byEvent[f.event] || []).push(f);
      }
    }
    fixturesByTeam[t.id] = byEvent;
  }

  const cache = new Map();

  function xp(playerId, eventId) {
    const key = `${playerId}:${eventId}`;
    if (cache.has(key)) return cache.get(key);

    const p = state.playersById[playerId];
    if (!p) return 0;
    const b = baselineById?.[playerId] || null;
    const ref = b?.minutes ? b : p; // whichever has minutes history
    const avail = availability(p);
    const fixtures = fixturesByTeam[p.team]?.[eventId] || [];

    if (!fixtures.length || avail === 0) { cache.set(key, 0); return 0; }

    let total = 0;

    if (!ref.minutes) {
      // New signing with no history - lean on FPL's own estimate,
      // scaled by fixture count (handles doubles/blanks).
      total = num(p.ep_next) * fixtures.length * avail;
    } else {
      const starts = ref.starts || 0;
      const startRate = Math.min(1, starts / 38);
      const minsPerStart = starts > 0 ? Math.min(90, ref.minutes / starts) : 0;
      const expMins = startRate * minsPerStart * avail;
      const minFactor = expMins / 90;
      const p60 = Math.max(0, Math.min(1, (expMins - 30) / 45));
      const playProb = Math.max(p60, Math.min(1, expMins / 45));

      // First-choice penalty takers get a small xG bump - half of a
      // typical penalty share, since returning takers' history already
      // includes spot kicks.
      const xg90 = per90(b, p, 'expected_goals') + (p.penalties_order === 1 ? 0.05 : 0);
      const xa90 = per90(b, p, 'expected_assists');
      const saves90 = per90(b, p, 'saves');
      const bonus90 = per90(b, p, 'bonus');
      const dc90 = per90(b, p, 'defensive_contribution');
      const yc90 = per90(b, p, 'yellow_cards');
      const dcThreshold = p.element_type === 2 ? 10 : 12;

      const team = state.teamsById[p.team];
      for (const f of fixtures) {
        const opp = state.teamsById[f.opponent];
        const ourXG = teamXG(team, opp, f.isHome);
        const theirXG = teamXG(opp, team, !f.isHome) ?? FDR_OPP_XG[f.difficulty] ?? AVG_TEAM_XG;
        const homeNudge = f.isHome ? 1.07 : 0.93;
        const attackScale = ourXG != null
          ? ourXG / AVG_TEAM_XG
          : (FDR_ATTACK_SCALE[f.difficulty] ?? 1) * homeNudge;
        const pCS = Math.exp(-theirXG);

        let pts = 0;
        pts += playProb * 1 + p60 * 1; // appearance
        pts += xg90 * minFactor * attackScale * GOAL_PTS[p.element_type];
        pts += xa90 * minFactor * attackScale * 3;
        pts += CS_PTS[p.element_type] * pCS * p60;
        if (p.element_type === 1) {
          pts += (saves90 * minFactor * (theirXG / AVG_TEAM_XG)) / 3;
        }
        pts += bonus90 * minFactor;
        // Defensive contribution: 2 pts when the per-match count clears
        // the positional threshold (10 for DEF, 12 for MID/FWD).
        if (p.element_type >= 2 && dc90 > 0) {
          pts += 2 * poissonAtLeast(dc90 * minFactor, dcThreshold);
        }
        pts -= yc90 * minFactor; // yellow cards cost a point
        total += pts;
      }

      // Anchor the immediate GW to FPL's own projection (half-half) -
      // but only once the season is running. Pre-season their ep_next
      // is form-based noise (it ranked goalkeepers as captain picks).
      if (state.currentEvent && eventId === gws[0] && num(p.ep_next) > 0) {
        total = 0.5 * total + 0.5 * num(p.ep_next) * fixtures.length;
      }
    }

    total = Math.max(0, total);
    cache.set(key, total);
    return total;
  }

  const horizonTotal = (playerId) => gws.reduce((s, e) => s + xp(playerId, e), 0);

  // Probability the player scores at least one goal in the GW (Poisson
  // on his expected goals across that GW's fixtures).
  function goalChance(playerId, eventId) {
    const p = state.playersById[playerId];
    if (!p) return 0;
    const b = baselineById?.[playerId] || null;
    const ref = b?.minutes ? b : p;
    const avail = availability(p);
    const fixtures = fixturesByTeam[p.team]?.[eventId] || [];
    if (!fixtures.length || !avail || !ref.minutes) return 0;
    const starts = ref.starts || 0;
    const startRate = Math.min(1, starts / 38);
    const minsPerStart = starts > 0 ? Math.min(90, ref.minutes / starts) : 0;
    const minFactor = (startRate * minsPerStart * avail) / 90;
    const xg90 = per90(b, p, 'expected_goals') + (p.penalties_order === 1 ? 0.05 : 0);
    const team = state.teamsById[p.team];
    let xg = 0;
    for (const f of fixtures) {
      const opp = state.teamsById[f.opponent];
      const ourXG = teamXG(team, opp, f.isHome);
      const homeNudge = f.isHome ? 1.07 : 0.93;
      const attackScale = ourXG != null
        ? ourXG / AVG_TEAM_XG
        : (FDR_ATTACK_SCALE[f.difficulty] ?? 1) * homeNudge;
      xg += xg90 * minFactor * attackScale;
    }
    return 1 - Math.exp(-xg);
  }

  return { xp, gws, horizonTotal, goalChance };
}

// Per-fixture team forecast for one gameweek: expected goals scored and
// clean sheet probability, for every team playing that GW. Uses strength
// ratings when published, FDR tables otherwise (same logic as player xP).
export function teamForecast(eventId) {
  const rows = [];
  for (const t of state.bootstrap.teams) {
    for (const f of state.upcomingByTeam[t.id] || []) {
      if (f.event !== eventId) continue;
      const opp = state.teamsById[f.opponent];
      const homeNudge = f.isHome ? 1.07 : 0.93;
      const ourXG =
        teamXG(t, opp, f.isHome) ??
        AVG_TEAM_XG * (FDR_ATTACK_SCALE[f.difficulty] ?? 1) * homeNudge;
      const theirXG = teamXG(opp, t, !f.isHome) ?? FDR_OPP_XG[f.difficulty] ?? AVG_TEAM_XG;
      rows.push({
        team: t,
        opp,
        isHome: f.isHome,
        xg: ourXG,
        cs: Math.exp(-theirXG),
      });
    }
  }
  rows.sort((a, b) => b.xg - a.xg);
  return rows;
}
