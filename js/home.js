// Home dashboard: one CTA, a deadline strip, then a grid of small
// glanceable preview cards (scoring chances, goals/clean-sheet
// forecast, fixture difficulty, set-piece takers, top picks,
// watchlist) - each links to its full page for the deep view.
import { state, fmtPrice, escapeHtml } from './state.js';
import { teamBadge, playerCell, infoNote, fixtureDifficulty, inlinePhoto } from './ui.js';
import { loadBaseline, buildModel, teamForecast } from './model.js';
import { watchlist } from './drawer.js';
import { hasConnectedSquad } from './myteam.js';
import { takers } from './setpieces.js';
import { t, locale, gwName, isHe, teamShort, haMark, playerName } from './i18n.js';

// Hebrew needs the singular noun for exactly 1 ("יום אחד"/"שעה אחת"/
// "דקה אחת"), not "1 ימים"/"1 שעות"/"1 דקות" - English's bare "d"/"h"/"m"
// abbreviations don't have this problem, so only Hebrew branches here.
const HE_UNIT_ONE = { d: 'יום אחד', h: 'שעה אחת', m: 'דקה אחת' };
const HE_UNIT_MANY = { d: 'ימים', h: 'שעות', m: 'דקות' };
function heCount(n, unit) {
  return n === 1 ? HE_UNIT_ONE[unit] : `${n} ${HE_UNIT_MANY[unit]}`;
}

// The one-tap path Itay asked for: upload your squad, get the AI read.
// One friendly strip, one button - no wall of tools.
function analyzeCta() {
  let ready = false;
  try {
    ready = hasConnectedSquad();
  } catch { /* private mode */ }
  const k = ready ? 'Ready' : '';
  return `<div class="analyze-cta">
    <span class="ac-icon">🧠</span>
    <div class="ac-text">
      <strong>${t(`home.ac${k}Title`)}</strong>
      <span>${t(`home.ac${k}Sub`)}</span>
    </div>
    <button class="btn" data-goto="myteam">${t(`home.ac${k}Btn`)}</button>
  </div>`;
}

// A one-line deadline strip replaces the old fixture-schedule hero
// card - the raw schedule already lives one tap away on Matches, so
// this only needs to say when the deadline is and how urgent it is.
function deadlineStrip() {
  const nxt = state.nextEvent;
  if (!nxt) return '';
  const dl = new Date(nxt.deadline_time);
  const left = dl - Date.now();
  const d = Math.floor(left / 86400000);
  const h = Math.floor((left % 86400000) / 3600000);
  const deadlineDay = left > 0 && left < 86400000;
  const count = left > 0
    ? (deadlineDay
        ? t('home.hoursLeft', isHe()
            ? { h: heCount(Math.floor(left / 3600000), 'h'), m: heCount(Math.floor((left % 3600000) / 60000), 'm') }
            : { h: Math.floor(left / 3600000), m: Math.floor((left % 3600000) / 60000) })
        : t('home.toGo', isHe() ? { d: heCount(d, 'd'), h: heCount(h, 'h') } : { d, h }))
    : t('chrome.locked');
  const when = dl.toLocaleString(locale(), { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return `
    <div class="card hero-card ${deadlineDay ? 'hero-urgent' : ''}" style="margin-bottom:16px">
      <div class="hero-top">
        <div class="hero-main">
          <span class="hero-gw">${escapeHtml(gwName(nxt.name))}</span>
          <span class="hero-count">${deadlineDay ? `🔥 ${count}` : count}</span>
        </div>
        <div class="hero-sub">${t('home.deadline', { when })}</div>
        ${deadlineDay ? `<button class="hero-cta" data-goto="planner">${t('home.toPlanner')}</button>` : ''}
      </div>
    </div>`;
}

// Scoring chances: who's most likely to find the net this gameweek.
function scoringRows(model, gw) {
  const top = state.bootstrap.elements
    .filter((p) => p.status === 'a' || p.status === 'd')
    .map((p) => ({ p, prob: model.goalChance(p.id, gw) }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 4);
  return widgetList(top.map(({ p, prob }) => wRow(playerCell(p), `${Math.round(prob * 100)}%`)));
}

// Goals + clean sheet forecast: same model, same compact row style as
// the equivalent card on Fixtures.
function goalsCsRows(model, gw) {
  const top = [...teamForecast(gw)].sort((a, b) => b.xg - a.xg).slice(0, 4);
  return widgetList(top.map(({ team, opp, isHome, xg, cs }) => {
    const csPct = Math.round(cs * 100);
    return wRow(
      `<div class="w-left"><span class="team-cell">${teamBadge(team.id)} ${escapeHtml(teamShort(team))}</span><span class="muted">${t('common.vs')} ${escapeHtml(teamShort(opp))} (${haMark(isHome)})</span></div>`,
      `<span class="xg-pill">${xg.toFixed(2)}</span> <span class="cs-pill ${csPct >= 40 ? 'cs-hi' : csPct <= 20 ? 'cs-lo' : ''}">${csPct}%</span>`
    );
  }));
}

// Fixture difficulty: the 6 teams with the easiest run over their
// next 3 games, same colour-coded chips as the full Fixtures grid.
// Rows here are a single line, shorter than the player-photo rows in
// the other cards, so it takes more of them to fill the same card
// height - hence 6 here vs 4 elsewhere.
function fdrRows() {
  const top = state.bootstrap.teams
    .map((team) => {
      const fx = (state.upcomingByTeam[team.id] || []).slice(0, 3);
      const avg = fx.length ? fx.reduce((s, f) => s + fixtureDifficulty(f), 0) / fx.length : 5;
      return { team, fx, avg };
    })
    .sort((a, b) => a.avg - b.avg)
    .slice(0, 6);
  return widgetList(top.map(({ team, fx }) => wRow(
    `<span class="team-cell">${teamBadge(team.id)} ${escapeHtml(teamShort(team))}</span>`,
    fx.length
      ? `<div class="fdr-cell" style="flex-direction:row">${fx.map((f) => `<span class="fdr-chip fdr-${fixtureDifficulty(f)}">${escapeHtml(teamShort(state.teamsById[f.opponent]))}</span>`).join('')}</div>`
      : '-'
  )));
}

// Set-piece takers: the 6 teams playing soonest this gameweek, each
// with their first-choice (currently available) penalty taker - same
// single-line-row reasoning as fdrRows() above.
function takersRows() {
  const nxt = state.nextEvent;
  const fx = nxt
    ? state.fixtures.filter((f) => f.event === nxt.id && f.kickoff_time).sort((a, b) => a.kickoff_time.localeCompare(b.kickoff_time))
    : [];
  const teamIds = [];
  for (const f of fx) {
    if (!teamIds.includes(f.team_h)) teamIds.push(f.team_h);
    if (!teamIds.includes(f.team_a)) teamIds.push(f.team_a);
    if (teamIds.length >= 6) break;
  }
  const byTeam = {};
  for (const p of state.bootstrap.elements) (byTeam[p.team] = byTeam[p.team] || []).push(p);
  return widgetList(teamIds.map((tid) => {
    const pens = takers(byTeam[tid] || [], 'penalties_order');
    const primary = pens.find((p) => !['i', 's', 'u', 'n'].includes(p.status)) || pens[0];
    return wRow(
      `<span class="team-cell">${teamBadge(tid)} ${escapeHtml(teamShort(state.teamsById[tid]))}</span>`,
      primary
        ? `<span class="clickable" data-pid="${primary.id}">${inlinePhoto(primary)} ${escapeHtml(playerName(primary))}</span>`
        : '<span class="muted">-</span>'
    );
  }));
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
    wRow(`<div class="w-left"><span class="rank-badge rank-${i + 1}">${i + 1}</span>${playerCell(p)}</div>`, `${xp.toFixed(1)} <small>${t('pl.pts')}</small>`)));

  const watched = watchlist().map((id) => state.playersById[id]).filter(Boolean);
  const watchRows = watched.length
    ? widgetList(watched.slice(0, 6).map((p) =>
        wRow(playerCell(p), `${fmtPrice(p.now_cost)} · ${model.xp(p.id, gw).toFixed(1)}`)))
    : `<div class="note">${t('home.watchEmpty')}</div>`;

  root.innerHTML = `
    ${analyzeCta()}
    ${deadlineStrip()}
    <div class="widget-grid">
      ${widget(t('home.scoringTitle'), scoringRows(model, gw), 'scout', t('tab.scout'), 'info.goalChance')}
      ${widget(t('fx.forecastTitle'), goalsCsRows(model, gw), 'fixtures', t('tab.fixtures'), 'info.forecast')}
      ${widget(t('home.fdrTitle'), fdrRows(), 'fixtures', t('tab.fixtures'), 'info.fdr')}
      ${widget(t('home.takersTitle'), takersRows(), 'setpieces', t('tab.setpieces'))}
      ${widget(t('home.capTitle'), capRows, 'scout', t('home.gotoScout'), 'info.model')}
      ${widget(t('home.watchTitle'), watchRows, 'players', t('home.gotoPlayers'))}
    </div>`;

  root.querySelectorAll('[data-goto]').forEach((b) =>
    b.addEventListener('click', () => {
      document.querySelector(`.tab[data-tab="${b.dataset.goto}"]`)?.click();
    })
  );
}
