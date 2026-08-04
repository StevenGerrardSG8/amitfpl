// Matches: every gameweek's games with scores and FPL point events
// (goals, assists, bonus) once played. Pre-season it doubles as the
// full season schedule browser.
import { state, escapeHtml } from './state.js';
import { teamBadge } from './ui.js';

const view = { gw: null };

function eventLine(stat, fixture, label, icon) {
  const entry = fixture.stats?.find((s) => s.identifier === stat);
  if (!entry) return '';
  const names = (side) =>
    (entry[side] || [])
      .map((e) => {
        const p = state.playersById[e.element];
        return p ? `${escapeHtml(p.web_name)}${e.value > 1 ? ` ×${e.value}` : ''}` : '';
      })
      .filter(Boolean)
      .join(', ');
  const h = names('h');
  const a = names('a');
  if (!h && !a) return '';
  return `<div class="mt-event"><span class="mt-event-label">${icon} ${label}</span>
    <span class="mt-event-side">${h || '-'}</span>
    <span class="mt-event-side">${a || '-'}</span>
  </div>`;
}

function matchRow(f) {
  const h = state.teamsById[f.team_h];
  const a = state.teamsById[f.team_a];
  if (!h || !a) return '';
  const ko = f.kickoff_time
    ? new Date(f.kickoff_time).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : 'TBC';
  const played = f.started || f.finished;
  const score = played ? `${f.team_h_score ?? 0} - ${f.team_a_score ?? 0}` : 'vs';
  const status = f.finished ? 'FT' : f.started ? 'LIVE' : ko;
  const events = played
    ? [
        eventLine('goals_scored', f, 'Goals', '⚽'),
        eventLine('assists', f, 'Assists', '🅰️'),
        eventLine('bonus', f, 'Bonus', '⭐'),
      ].join('')
    : '';
  return `<div class="mt-match">
    <div class="mt-score-row">
      <div class="mt-side">${teamBadge(h.id)} <strong>${escapeHtml(h.name)}</strong></div>
      <div class="mt-score ${f.started && !f.finished ? 'mt-live' : ''}">
        <div class="mt-score-num">${score}</div>
        <div class="mt-status">${status}</div>
      </div>
      <div class="mt-side mt-side-a"><strong>${escapeHtml(a.name)}</strong> ${teamBadge(a.id)}</div>
    </div>
    ${events ? `<div class="mt-events">${events}</div>` : ''}
  </div>`;
}

export function renderMatches(root) {
  const current = (state.currentEvent || state.nextEvent)?.id ?? 1;
  const gw = view.gw ?? current;
  const fixtures = state.fixtures
    .filter((f) => f.event === gw)
    .sort((x, y) => (x.kickoff_time || '').localeCompare(y.kickoff_time || ''));

  const gwOptions = state.bootstrap.events
    .map((e) => `<option value="${e.id}" ${e.id === gw ? 'selected' : ''}>${e.name}</option>`)
    .join('');

  root.innerHTML = `
    <div class="card">
      <div class="toolbar">
        <label>Gameweek</label>
        <select id="mt-gw">${gwOptions}</select>
        <span class="spacer"></span>
        <span class="result-count">Scores and FPL events (goals, assists, bonus) appear as games are played - data refreshes every 30 min.</span>
      </div>
      <div class="mt-list">
        ${fixtures.map(matchRow).join('') || '<div class="note">No fixtures scheduled for this gameweek yet.</div>'}
      </div>
    </div>`;

  root.querySelector('#mt-gw').addEventListener('change', (e) => {
    view.gw = +e.target.value;
    renderMatches(root);
  });
}
