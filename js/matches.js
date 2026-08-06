// Matches: every gameweek's games with scores and FPL point events
// (goals, assists, bonus) once played. Pre-season it doubles as the
// full season schedule browser.
import { state, escapeHtml } from './state.js';
import { teamBadge } from './ui.js';
import { t, locale, gwName, isHe, playerName, teamName } from './i18n.js';

const view = { gw: null };

function eventLine(stat, fixture, label, icon) {
  const entry = fixture.stats?.find((s) => s.identifier === stat);
  if (!entry) return '';
  const names = (side) =>
    (entry[side] || [])
      .map((e) => {
        const p = state.playersById[e.element];
        return p ? `${escapeHtml(playerName(p))}${e.value > 1 ? ` ×${e.value}` : ''}` : '';
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
    ? new Date(f.kickoff_time).toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : t('mt.tbc');
  const played = f.started || f.finished;
  const score = played ? `${f.team_h_score ?? 0} - ${f.team_a_score ?? 0}` : t('common.vs');
  const status = f.finished ? t('mt.ft') : f.started ? t('mt.live') : ko;
  const events = played
    ? [
        eventLine('goals_scored', f, t('mt.goals'), ''),
        eventLine('assists', f, t('mt.assists'), ''),
        eventLine('bonus', f, t('mt.bonus'), ''),
      ].join('')
    : '';
  return `<div class="mt-match">
    <div class="mt-score-row">
      <div class="mt-side">${teamBadge(h.id)} <strong>${escapeHtml(teamName(h))}</strong></div>
      <div class="mt-score ${f.started && !f.finished ? 'mt-live' : ''}">
        <div class="mt-score-num">${score}</div>
        <div class="mt-status">${status}</div>
      </div>
      <div class="mt-side mt-side-a"><strong>${escapeHtml(teamName(a))}</strong> ${teamBadge(a.id)}</div>
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

  const evtName = state.bootstrap.events.find((e) => e.id === gw)?.name || '';

  root.innerHTML = `
    <div class="card">
      <div class="widget-head">
        <span class="section-title" style="padding:0">
          <button class="link-btn" id="mt-prev" ${gw <= 1 ? 'disabled' : ''}>${isHe() ? '›' : '‹'}</button>
          ${escapeHtml(gwName(evtName))}
          <button class="link-btn" id="mt-next" ${gw >= 38 ? 'disabled' : ''}>${isHe() ? '‹' : '›'}</button>
        </span>
        <span class="result-count">${t('mt.blurb')}</span>
      </div>
      <div class="mt-list">
        ${fixtures.map(matchRow).join('') || `<div class="note">${t('mt.noFixtures')}</div>`}
      </div>
    </div>`;

  root.querySelector('#mt-prev')?.addEventListener('click', () => { view.gw = gw - 1; renderMatches(root); });
  root.querySelector('#mt-next')?.addEventListener('click', () => { view.gw = gw + 1; renderMatches(root); });
}
