// Predicted lineups: our own likely-XI projection for every club.
// Start likelihood blends last season's starts share with squad price
// (price encodes expectations for new signings who have no minutes yet)
// and availability flags. Percent chip on each player = FPL ownership.
import { state, fmtPrice, num, escapeHtml } from './state.js';
import { playerPhoto, teamBadge } from './ui.js';
import { loadBaseline, baselinePlayer } from './model.js';
import { t, locale, haMark } from './i18n.js';

const FORMATIONS = [];
for (let d = 3; d <= 5; d++)
  for (let m = 2; m <= 5; m++)
    for (let f = 1; f <= 3; f++)
      if (d + m + f === 10) FORMATIONS.push([d, m, f]);

function availability(p) {
  if (p.status === 'a') return 1;
  if (p.status === 'd') return (p.chance_of_playing_next_round ?? 75) / 100;
  return 0;
}

// 0..1 likelihood that the player starts, within his team.
function startScores(squad) {
  const byPos = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of squad) byPos[p.element_type].push(p);
  const scores = new Map();
  for (const pos of [1, 2, 3, 4]) {
    const group = byPos[pos];
    const costs = group.map((p) => p.now_cost);
    const lo = Math.min(...costs);
    const hi = Math.max(...costs);
    for (const p of group) {
      const b = baselinePlayer(p.id) || p;
      const startRate = Math.min(1, (b.starts || 0) / 38);
      const priceNorm = hi > lo ? (p.now_cost - lo) / (hi - lo) : 0.5;
      const own = num(p.selected_by_percent) / 1000; // gentle tiebreak
      scores.set(p.id, availability(p) * (0.55 * startRate + 0.45 * priceNorm) + own);
    }
  }
  return scores;
}

function predictXI(squad) {
  const scores = startScores(squad);
  const byPos = { 1: [], 2: [], 3: [], 4: [] };
  for (const p of squad) byPos[p.element_type].push(p);
  for (const pos of [1, 2, 3, 4]) byPos[pos].sort((a, b) => scores.get(b.id) - scores.get(a.id));
  let best = null;
  for (const [d, m, f] of FORMATIONS) {
    if (byPos[2].length < d || byPos[3].length < m || byPos[4].length < f || !byPos[1].length) continue;
    const xi = [byPos[1][0], ...byPos[2].slice(0, d), ...byPos[3].slice(0, m), ...byPos[4].slice(0, f)];
    const total = xi.reduce((s, p) => s + scores.get(p.id), 0);
    if (!best || total > best.total) best = { xi, total, formation: `${d}-${m}-${f}` };
  }
  return best;
}

function playerChip(p) {
  const doubt = p.status === 'd'
    ? `<span class="lu-doubt-dot" title="${escapeHtml(p.news || t('lu.doubtful'))}">${p.chance_of_playing_next_round ?? 75}%</span>`
    : '';
  return `<div class="lu-p clickable" data-pid="${p.id}">
    <div class="lu-photo-wrap">
      ${playerPhoto(p, 'lu-photo')}
      ${doubt}
      <span class="lu-own">${p.selected_by_percent}%</span>
    </div>
    <div class="lu-name">${escapeHtml(p.web_name)}</div>
    <div class="lu-meta">${fmtPrice(p.now_cost)}</div>
  </div>`;
}

function teamCard(team, squad) {
  const pred = predictXI(squad);
  if (!pred) return '';
  const nextFx = (state.upcomingByTeam[team.id] || [])[0];
  let fxLine = t('lu.noFixture');
  if (nextFx) {
    const opp = state.teamsById[nextFx.opponent];
    const raw = state.fixtures.find(
      (f) => f.event === nextFx.event && (nextFx.isHome ? f.team_h === team.id : f.team_a === team.id)
    );
    const ko = raw?.kickoff_time
      ? new Date(raw.kickoff_time).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    fxLine = `${t('common.vs')} ${escapeHtml(opp.short_name)} (${haMark(nextFx.isHome)}) · ${ko}`;
  }

  const rows = [4, 3, 2, 1].map((pos) => {
    const chips = pred.xi.filter((p) => p.element_type === pos).map(playerChip).join('');
    return chips ? `<div class="lu-row">${chips}</div>` : '';
  }).join('');

  const inXI = new Set(pred.xi.map((p) => p.id));
  const doubtful = squad
    .filter((p) => p.status === 'd')
    .sort((a, b) => b.now_cost - a.now_cost)
    .slice(0, 3)
    .map((p) => `<span class="lu-flag lu-doubt clickable" data-pid="${p.id}" title="${escapeHtml(p.news || '')}">${escapeHtml(p.web_name)} ${p.chance_of_playing_next_round ?? 75}%</span>`);
  const out = squad
    .filter((p) => ['i', 's', 'u'].includes(p.status) && !inXI.has(p.id))
    .sort((a, b) => b.now_cost - a.now_cost)
    .slice(0, 3)
    .map((p) => `<span class="lu-flag lu-out clickable" data-pid="${p.id}" title="${escapeHtml(p.news || '')}">${escapeHtml(p.web_name)}</span>`);

  return `<div class="lu-card">
    <div class="lu-head">
      <div class="lu-team">${teamBadge(team.id)} <strong>${escapeHtml(team.name)}</strong>
        ${state.elo?.[team.id] ? `<span class="muted" style="font-size:10px" title="${t('lu.eloTitle')}">${Math.round(state.elo[team.id])}</span>` : ''}</div>
      <span class="lu-formation">${pred.formation}</span>
    </div>
    <div class="lu-fx muted">${fxLine}</div>
    <div class="lu-pitch">${rows}</div>
    ${doubtful.length || out.length
      ? `<div class="lu-flags">${doubtful.join('')}${out.length ? `<span class="lu-flag-label">${t('lu.out')}</span>${out.join('')}` : ''}</div>`
      : ''}
  </div>`;
}

export async function renderLineups(root) {
  root.innerHTML = '<div class="skel-page"><div class="skel skel-block"></div><div class="skel skel-block"></div><div class="skel skel-block"></div></div>';
  await loadBaseline();
  const byTeam = {};
  for (const p of state.bootstrap.elements) (byTeam[p.team] = byTeam[p.team] || []).push(p);
  // Cards in kickoff order - the games you need first come first.
  const nextKo = (t) => {
    const nf = (state.upcomingByTeam[t.id] || [])[0];
    if (!nf) return '9999';
    const raw = state.fixtures.find(
      (f) => f.event === nf.event && (nf.isHome ? f.team_h === t.id : f.team_a === t.id)
    );
    return raw?.kickoff_time || '9999';
  };
  const teams = [...state.bootstrap.teams].sort((a, b) => nextKo(a).localeCompare(nextKo(b)));
  const cards = teams.map((t) => teamCard(t, byTeam[t.id] || [])).join('');
  root.innerHTML = `
    <div class="note" style="padding:0 4px 12px">${t('lu.note')}</div>
    <div class="lu-grid">${cards}</div>`;
}
