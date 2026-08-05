// Home dashboard: the at-a-glance landing view - next gameweek's
// fixtures with kickoff times, plus quick summaries that deep-link
// into the full tools.
import { state, fmtPrice, num, escapeHtml } from './state.js';
import { teamBadge, playerCell } from './ui.js';
import { loadBaseline, buildModel, teamForecast } from './model.js';
import { watchlist } from './drawer.js';
import { t, locale, haMark, gwName, gwLabel, isHe } from './i18n.js';

function fixtureCards() {
  const nxt = state.nextEvent;
  if (!nxt) return '';
  const fx = state.fixtures
    .filter((f) => f.event === nxt.id && f.kickoff_time)
    .sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time));
  const cards = fx.map((f) => {
    const h = state.teamsById[f.team_h];
    const a = state.teamsById[f.team_a];
    const ko = new Date(f.kickoff_time);
    const when = ko.toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `<div class="fx-card">
      <div class="fx-team">${teamBadge(h.id)}<span>${escapeHtml(h.short_name)}</span></div>
      <div class="fx-mid"><span class="fx-vs">${t('common.vs')}</span><span class="fx-time">${when}</span></div>
      <div class="fx-team">${teamBadge(a.id)}<span>${escapeHtml(a.short_name)}</span></div>
    </div>`;
  }).join('');
  const dl = new Date(nxt.deadline_time);
  const left = dl - Date.now();
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  return `
    <div class="hero-strip">
      <span class="hero-gw">${escapeHtml(gwName(nxt.name))}</span>
      <span>${t('home.fixtures', { n: fx.length })}</span>
      <span>${t('home.deadline', { when: dl.toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' }) })}</span>
      <span class="hero-count">${left > 0 ? t('home.toGo', { d, h }) : t('chrome.locked')}</span>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="section-title">${t('home.fixturesTitle', { gw: escapeHtml(gwName(nxt.name)) })}</div>
      <div class="fx-grid">${cards}</div>
    </div>`;
}

function widget(title, rowsHtml, gotoTab, gotoLabel) {
  return `<div class="card widget">
    <div class="widget-head">
      <span class="section-title" style="padding:0">${title}</span>
      <button class="link-btn" data-goto="${gotoTab}">${gotoLabel} ${isHe() ? '←' : '→'}</button>
    </div>
    ${rowsHtml}
  </div>`;
}

const mini = (rows) => `<table class="data">${rows}</table>`;

export async function renderHome(root) {
  root.innerHTML = '<div class="skel-page"><div class="skel skel-block"></div><div class="skel skel-block"></div></div>';
  await loadBaseline();
  const model = buildModel(5);
  const gw = model.gws[0];
  const forecast = teamForecast(gw);

  const goalsRows = mini(forecast.slice(0, 4).map(({ team, opp, isHome, xg }) => `<tr>
      <td class="team-cell">${teamBadge(team.id)} ${escapeHtml(team.short_name)}</td>
      <td class="muted">${t('common.vs')} ${escapeHtml(opp.short_name)} (${haMark(isHome)})</td>
      <td class="num"><span class="xg-pill">${xg.toFixed(2)}</span></td>
    </tr>`).join(''));

  const csRows = mini([...forecast].sort((a, b) => b.cs - a.cs).slice(0, 4).map(({ team, opp, isHome, cs }) => `<tr>
      <td class="team-cell">${teamBadge(team.id)} ${escapeHtml(team.short_name)}</td>
      <td class="muted">${t('common.vs')} ${escapeHtml(opp.short_name)} (${haMark(isHome)})</td>
      <td class="num"><span class="cs-pill ${cs >= 0.4 ? 'cs-hi' : ''}">${Math.round(cs * 100)}%</span></td>
    </tr>`).join(''));

  const captains = state.bootstrap.elements
    .filter((p) => p.status === 'a')
    .map((p) => ({ p, xp: model.xp(p.id, gw) }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 4);
  const capRows = mini(captains.map(({ p, xp }) => `<tr>
      <td>${playerCell(p)}</td>
      <td class="num"><span class="pp-xp" style="margin:0">${xp.toFixed(1)}</span></td>
    </tr>`).join(''));

  const scorers = state.bootstrap.elements
    .filter((p) => p.status === 'a')
    .map((p) => ({ p, prob: model.goalChance(p.id, gw) }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 4);
  const scorerRows = mini(scorers.map(({ p, prob }) => `<tr>
      <td>${playerCell(p)}</td>
      <td class="num"><span class="cs-pill cs-hi">${Math.round(prob * 100)}%</span></td>
    </tr>`).join(''));

  const watched = watchlist().map((id) => state.playersById[id]).filter(Boolean);
  const watchRows = watched.length
    ? mini(watched.slice(0, 6).map((p) => `<tr>
        <td>${playerCell(p)}</td>
        <td class="num">${fmtPrice(p.now_cost)}</td>
        <td class="num"><span class="pp-xp" style="margin:0">${model.xp(p.id, gw).toFixed(1)}</span></td>
      </tr>`).join(''))
    : `<div class="note">${t('home.watchEmpty')}</div>`;

  root.innerHTML = `
    ${fixtureCards()}
    <div class="widget-grid">
      ${widget(t('home.xgTitle', { gw: gwLabel(gw) }), goalsRows, 'fixtures', t('home.fullForecast'))}
      ${widget(t('home.csTitle'), csRows, 'fixtures', t('home.fullForecast'))}
      ${widget(t('home.capTitle'), capRows, 'scout', t('home.gotoScout'))}
      ${widget(t('home.scorersTitle'), scorerRows, 'scout', t('home.gotoScout'))}
      ${widget(t('home.watchTitle'), watchRows, 'players', t('home.gotoPlayers'))}
    </div>`;

  root.querySelectorAll('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelector(`.tab[data-tab="${b.dataset.goto}"]`)?.click();
    })
  );
}
