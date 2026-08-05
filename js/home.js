// Home dashboard: the at-a-glance landing view - next gameweek's
// fixtures with kickoff times, plus quick summaries that deep-link
// into the full tools.
import { state, fmtPrice, num, escapeHtml } from './state.js';
import { teamBadge, playerCell, infoNote } from './ui.js';
import { loadBaseline, buildModel, teamForecast } from './model.js';
import { watchlist } from './drawer.js';
import { t, locale, haMark, gwName, gwLabel, isHe, teamShort } from './i18n.js';

// One-time intro strip: what the product is, right on the page (people
// reflexively close popups). Dismissed state persists per device.
function introStrip() {
  let dismissed = null;
  try { dismissed = localStorage.getItem('amitfpl:introDismissed'); } catch { /* private mode */ }
  if (dismissed) return '';
  return `<div class="intro-strip" id="intro-strip">
    <button class="intro-x" id="intro-x" title="${t('common.close')}" aria-label="${t('common.close')}">✕</button>
    <div class="intro-name">amit<strong>fpl</strong></div>
    <div class="intro-slogan">${t('intro.slogan')}</div>
    <p class="intro-lines">${t('intro.line1')}</p>
    <p class="intro-lines">${t('intro.line2')}</p>
  </div>`;
}

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
  // Deadline day (under 24h to go): the hero strip turns urgent.
  const deadlineDay = left > 0 && left < 86400000;
  return `
    <div class="hero-strip ${deadlineDay ? 'hero-urgent' : ''}">
      ${deadlineDay ? `<span class="hero-alarm">🔥 ${t('home.deadlineDay')}</span>` : ''}
      <span class="hero-gw">${escapeHtml(gwName(nxt.name))}</span>
      <span>${t('home.fixtures', { n: fx.length })}</span>
      <span>${t('home.deadline', { when: dl.toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' }) })}</span>
      <span class="hero-count">${left > 0 ? (deadlineDay ? t('home.hoursLeft', { h: Math.floor(left / 3600000), m: Math.floor((left % 3600000) / 60000) }) : t('home.toGo', { d, h })) : t('chrome.locked')}</span>
      ${deadlineDay ? `<button class="hero-cta" data-goto="planner">${t('home.toPlanner')}</button>` : ''}
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="section-title">${t('home.fixturesTitle', { gw: escapeHtml(gwName(nxt.name)) })}</div>
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

const mini = (rows) => `<table class="data">${rows}</table>`;

export async function renderHome(root) {
  root.innerHTML = '<div class="skel-page"><div class="skel skel-block"></div><div class="skel skel-block"></div></div>';
  await loadBaseline();
  const model = buildModel(5);
  const gw = model.gws[0];
  const forecast = teamForecast(gw);

  const goalsRows = mini(forecast.slice(0, 4).map(({ team, opp, isHome, xg }) => `<tr>
      <td class="team-cell">${teamBadge(team.id)} ${escapeHtml(teamShort(team))}</td>
      <td class="muted">${t('common.vs')} ${escapeHtml(teamShort(opp))} (${haMark(isHome)})</td>
      <td class="num"><span class="xg-pill">${xg.toFixed(2)}</span></td>
    </tr>`).join(''));

  const csRows = mini([...forecast].sort((a, b) => b.cs - a.cs).slice(0, 4).map(({ team, opp, isHome, cs }) => `<tr>
      <td class="team-cell">${teamBadge(team.id)} ${escapeHtml(teamShort(team))}</td>
      <td class="muted">${t('common.vs')} ${escapeHtml(teamShort(opp))} (${haMark(isHome)})</td>
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
    ${introStrip()}
    ${analyzeCta()}
    ${fixtureCards()}
    <div class="widget-grid">
      ${widget(t('home.xgTitle', { gw: gwLabel(gw) }), goalsRows, 'fixtures', t('home.fullForecast'), 'info.forecast')}
      ${widget(t('home.csTitle'), csRows, 'fixtures', t('home.fullForecast'), 'info.forecast')}
      ${widget(t('home.capTitle'), capRows, 'scout', t('home.gotoScout'), 'info.model')}
      ${widget(t('home.scorersTitle'), scorerRows, 'scout', t('home.gotoScout'), 'info.goalChance')}
      ${widget(t('home.watchTitle'), watchRows, 'players', t('home.gotoPlayers'))}
    </div>`;

  root.querySelectorAll('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelector(`.tab[data-tab="${b.dataset.goto}"]`)?.click();
    })
  );

  root.querySelector('#intro-x')?.addEventListener('click', () => {
    try { localStorage.setItem('amitfpl:introDismissed', '1'); } catch { /* private mode */ }
    root.querySelector('#intro-strip')?.remove();
  });
}
