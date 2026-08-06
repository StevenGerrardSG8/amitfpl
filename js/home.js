// Home dashboard: as clean as possible. One CTA, next GW at a glance,
// and just the two most personal/actionable widgets - everything else
// (full xG/clean-sheet forecasts, scorer odds) already lives one tap
// away in Fixtures/Scout, so it doesn't need to be repeated here too.
import { state, fmtPrice, escapeHtml } from './state.js';
import { teamBadge, playerCell, infoNote } from './ui.js';
import { loadBaseline, buildModel } from './model.js';
import { watchlist } from './drawer.js';
import { t, locale, gwName, isHe, teamShort } from './i18n.js';

// The one-tap path Itay asked for: upload your squad, get the AI read.
// One friendly strip, one button - no wall of tools.
function analyzeCta() {
  let connected = null;
  try {
    connected = localStorage.getItem('amitfpl:teamId') || localStorage.getItem('amitfpl:manualSquad');
  } catch { /* private mode */ }
  const k = connected ? 'Ready' : '';
  return `<div class="analyze-cta">
    <span class="ac-icon">🧠</span>
    <div class="ac-text">
      <strong>${t(`home.ac${k}Title`)}</strong>
      <span>${t(`home.ac${k}Sub`)}</span>
    </div>
    <button class="btn" data-goto="myteam">${t(`home.ac${k}Btn`)}</button>
  </div>`;
}

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
      <div class="fx-row">
        <div class="fx-team">${teamBadge(h.id)}<span>${escapeHtml(teamShort(h))}</span></div>
        <span class="fx-vs">${t('common.vs')}</span>
        <div class="fx-team">${teamBadge(a.id)}<span>${escapeHtml(teamShort(a))}</span></div>
      </div>
      <div class="fx-time">${when}</div>
    </div>`;
  }).join('');
  const dl = new Date(nxt.deadline_time);
  const left = dl - Date.now();
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  // Deadline day (under 24h to go): the whole card turns urgent.
  const deadlineDay = left > 0 && left < 86400000;
  const count = left > 0
    ? (deadlineDay ? t('home.hoursLeft', { h: Math.floor(left / 3600000), m: Math.floor((left % 3600000) / 60000) }) : t('home.toGo', { d, h }))
    : t('chrome.locked');
  const when = dl.toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  // One card, not two: a calm headline (GW + countdown) and a lighter
  // subline (deadline + fixture count), then the fixtures grid right
  // underneath - a hairline divider separates the two instead of a
  // second stacked card with its own repeated "Gameweek N" title.
  return `
    <div class="card hero-card ${deadlineDay ? 'hero-urgent' : ''}" style="margin-bottom:16px">
      <div class="hero-top">
        <div class="hero-main">
          <span class="hero-gw">${escapeHtml(gwName(nxt.name))}</span>
          <span class="hero-count">${deadlineDay ? `🔥 ${count}` : count}</span>
        </div>
        <div class="hero-sub">${t('home.deadline', { when })} · ${t('home.fixtures', { n: fx.length })}</div>
        ${deadlineDay ? `<button class="hero-cta" data-goto="planner">${t('home.toPlanner')}</button>` : ''}
      </div>
      <div class="fx-grid">${cards}</div>
    </div>`;
}

function widget(title, rowsHtml, gotoTab, gotoLabel, infoKey) {
  return `<div class="card widget">
    <div class="widget-head">
      <span class="section-title" style="padding:0">${title}${infoKey ? ` ${infoNote(infoKey)}` : ''}</span>
      <button class="link-btn" data-goto="${gotoTab}">${gotoLabel} ${isHe() ? '←' : '→'}</button>
    </div>
    ${rowsHtml}
  </div>`;
}

// A calm list, not a data table: no header row, no cell borders - just
// a name and a value per line. Home is the at-a-glance page; the full
// sortable/filterable table for each of these lives one tap away.
const widgetList = (rows) => `<div class="w-list">${rows.join('')}</div>`;
const wRow = (left, right) => `<div class="w-row">${left}<span class="w-val">${right}</span></div>`;

export async function renderHome(root) {
  root.innerHTML = '<div class="skel-page"><div class="skel skel-block"></div><div class="skel skel-block"></div></div>';
  await loadBaseline();
  const model = buildModel(5);
  const gw = model.gws[0];

  const captains = state.bootstrap.elements
    .filter((p) => p.status === 'a')
    .map((p) => ({ p, xp: model.xp(p.id, gw) }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 4);
  const capRows = widgetList(captains.map(({ p, xp }, i) =>
    wRow(`<span class="rank-badge rank-${i + 1}">${i + 1}</span>${playerCell(p)}`, `${xp.toFixed(1)} <small>${t('pl.pts')}</small>`)));

  const watched = watchlist().map((id) => state.playersById[id]).filter(Boolean);
  const watchRows = watched.length
    ? widgetList(watched.slice(0, 6).map((p) =>
        wRow(playerCell(p), `${fmtPrice(p.now_cost)} · ${model.xp(p.id, gw).toFixed(1)}`)))
    : `<div class="note">${t('home.watchEmpty')}</div>`;

  root.innerHTML = `
    ${analyzeCta()}
    ${fixtureCards()}
    <div class="widget-grid">
      ${widget(t('home.capTitle'), capRows, 'scout', t('home.gotoScout'), 'info.model')}
      ${widget(t('home.watchTitle'), watchRows, 'players', t('home.gotoPlayers'))}
    </div>`;

  root.querySelectorAll('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelector(`.tab[data-tab="${b.dataset.goto}"]`)?.click();
    })
  );
}
