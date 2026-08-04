// Shared derived data, built once after bootstrap + fixtures load.
export const state = {
  bootstrap: null,
  fixtures: null,
  teamsById: {},
  playersById: {},
  positionsById: {},
  nextEvent: null,
  currentEvent: null,
  faces: {}, // fpl player id -> FotMob face-image id (data/faces.json)
  // team id -> [{event, opponent, isHome, difficulty}] for upcoming fixtures
  upcomingByTeam: {},
};

export function initState(bootstrap, fixtures) {
  state.bootstrap = bootstrap;
  state.fixtures = fixtures;

  for (const t of bootstrap.teams) state.teamsById[t.id] = t;
  for (const p of bootstrap.elements) state.playersById[p.id] = p;
  for (const et of bootstrap.element_types) state.positionsById[et.id] = et;

  state.nextEvent = bootstrap.events.find((e) => e.is_next) || null;
  state.currentEvent = bootstrap.events.find((e) => e.is_current) || null;

  const fromEvent = (state.currentEvent || state.nextEvent)?.id ?? 1;
  for (const t of bootstrap.teams) state.upcomingByTeam[t.id] = [];
  for (const f of fixtures) {
    if (f.event == null || f.event < fromEvent || f.finished) continue;
    state.upcomingByTeam[f.team_h].push({
      event: f.event,
      opponent: f.team_a,
      isHome: true,
      difficulty: f.team_h_difficulty,
    });
    state.upcomingByTeam[f.team_a].push({
      event: f.event,
      opponent: f.team_h,
      isHome: false,
      difficulty: f.team_a_difficulty,
    });
  }
  for (const id in state.upcomingByTeam) {
    state.upcomingByTeam[id].sort((a, b) => a.event - b.event);
  }
}

export const fmtPrice = (nowCost) => `£${(nowCost / 10).toFixed(1)}`;
export const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export function statusInfo(p) {
  // a=available, d=doubtful, i=injured, s=suspended, u=unavailable, n=not in squad
  if (p.status === 'a') return null;
  const flags = { d: '?', i: '✚', s: '■', u: '✕', n: '✕' };
  const chance = p.chance_of_playing_next_round;
  const label = p.news || (chance != null ? `${chance}% chance of playing` : 'Unavailable');
  return { flag: flags[p.status] || '!', cls: `status-${p.status}`, label };
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
