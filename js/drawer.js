// Player drawer: click any player name/row (elements carrying data-pid)
// to open a full profile - key stats, upcoming fixtures with model xP,
// this season's gameweek log, and past-season history.
import { state, fmtPrice, num, statusInfo, escapeHtml } from './state.js';
import { playerPhoto, teamBadge, spBadges, fixtureDifficulty, infoNote } from './ui.js';
import { loadBaseline, buildModel } from './model.js';
import { t, haMark, gwLabel, posShort, playerName, teamName, teamShort, isHe } from './i18n.js';

let overlay = null;
const summaryCache = new Map();

async function fetchSummary(id) {
  if (summaryCache.has(id)) return summaryCache.get(id);
  // Live proxy first (local dev), then the Action's snapshot (hosted,
  // covers the ~150 most relevant players).
  for (const url of [`/api/fpl/element-summary/${id}/`, `data/summaries/${id}.json`]) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      summaryCache.set(id, data);
      return data;
    } catch { /* try next source */ }
  }
  return null;
}

let trendsCache;
async function fetchTrends() {
  if (trendsCache !== undefined) return trendsCache;
  try {
    const res = await fetch('data/trends.json');
    trendsCache = res.ok ? await res.json() : null;
  } catch {
    trendsCache = null;
  }
  return trendsCache;
}

// Tiny single-series sparkline: 2px accent line, no axes, values as
// muted text. Handles a single sample (history starts accumulating
// the day the tracker went live).
function sparkline(points, fmt) {
  if (!points.length) return `<span class="muted">${t('dw.noData')}</span>`;
  const w = 150;
  const h = 34;
  const pad = 3;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i) => points.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (v) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const path = points.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return `<div class="spark">
    <svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true">
      ${points.length > 1 ? `<polyline points="${path}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
      <circle cx="${x(points.length - 1)}" cy="${y(last)}" r="3" fill="var(--accent)"/>
    </svg>
    <span class="spark-val">${fmt(last)}</span>
    ${points.length > 1 ? `<span class="muted spark-range">${fmt(min)} – ${fmt(max)}</span>` : `<span class="muted spark-range">${t('dw.trackingToday')}</span>`}
  </div>`;
}

async function trendSection(id) {
  const trends = await fetchTrends();
  if (!trends) return '';
  const days = Object.keys(trends).sort();
  const price = [];
  const own = [];
  for (const d of days) {
    const row = trends[d]?.[String(id)];
    if (row) {
      price.push(row[0] / 10);
      own.push(parseFloat(row[1]) || 0);
    }
  }
  if (!price.length) return '';
  return `
    <div class="section-title" style="padding-inline-start:0">${t('dw.trends')} <span class="muted" style="font-weight:500">${t('dw.trendsSince')}</span></div>
    <div class="trend-grid">
      <div><div class="k-label">${t('dw.price')}</div>${sparkline(price, (v) => '£' + v.toFixed(1))}</div>
      <div><div class="k-label">${t('dw.ownership')}</div>${sparkline(own, (v) => v.toFixed(1) + '%')}</div>
    </div>`;
}

function close() {
  if (overlay) {
    overlay.hidden = true;
    overlay.innerHTML = '';
  }
}

/* ---- watchlist (local, per device) ---- */
const WATCH_KEY = 'amitfpl:watchlist';
export function watchlist() {
  try { return JSON.parse(localStorage.getItem(WATCH_KEY)) || []; } catch { return []; }
}
const isWatched = (id) => watchlist().includes(id);
function toggleWatch(id) {
  const list = watchlist();
  const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  localStorage.setItem(WATCH_KEY, JSON.stringify(next));
}

function statTile(k, v) {
  return `<div class="stat-tile"><div class="k">${k}</div><div class="v">${v}</div></div>`;
}

function upcomingRows(model, p) {
  return model.gws
    .map((e) => {
      const fx = (state.upcomingByTeam[p.team] || []).filter((f) => f.event === e);
      const opp = fx.length
        ? fx.map((f) => `<span class="fdr-chip fdr-${fixtureDifficulty(f)}">${teamBadge(f.opponent, 'chip-badge')}${teamShort(state.teamsById[f.opponent])} (${haMark(f.isHome)})</span>`).join(' ')
        : `<span class="fdr-chip fdr-blank">${t('common.blank')}</span>`;
      const xp = model.xp(p.id, e);
      return `<tr>
        <td>${gwLabel(e)}</td>
        <td><div class="fdr-cell" style="flex-direction:row">${opp}</div></td>
        <td class="num ${xp >= 5 ? 'hi' : ''}">${xp.toFixed(1)}</td>
      </tr>`;
    })
    .join('');
}

function gwLogRows(history) {
  return [...history]
    .slice(-10)
    .reverse()
    .map((h) => {
      const opp = state.teamsById[h.opponent_team];
      return `<tr>
        <td>${gwLabel(h.round)}</td>
        <td>${opp ? `${teamBadge(opp.id, 'meta-badge')} ${teamShort(opp)}` : '-'} (${haMark(h.was_home)})</td>
        <td class="num" style="font-weight:700">${h.total_points}</td>
        <td class="num">${h.minutes}'</td>
        <td class="num">${h.goals_scored}</td>
        <td class="num">${h.assists}</td>
        <td class="num">${h.bonus}</td>
        <td class="num">${num(h.expected_goal_involvements).toFixed(2)}</td>
      </tr>`;
    })
    .join('');
}

function pastSeasonRows(past) {
  return [...past]
    .reverse()
    .slice(0, 6)
    .map((s) => `<tr>
      <td style="font-weight:600">${escapeHtml(s.season_name)}</td>
      <td class="num" style="font-weight:700">${s.total_points}</td>
      <td class="num">${s.minutes}</td>
      <td class="num">${s.goals_scored}</td>
      <td class="num">${s.assists}</td>
      <td class="num">${s.clean_sheets}</td>
      <td class="num">${s.bonus}</td>
      <td class="num">${fmtPrice(s.start_cost)} → ${fmtPrice(s.end_cost)}</td>
    </tr>`)
    .join('');
}

export async function openDrawer(id) {
  const p = state.playersById[id];
  if (!p || !overlay) return;
  const team = state.teamsById[p.team];
  const pos = state.positionsById[p.element_type];
  const st = statusInfo(p);

  overlay.hidden = false;
  overlay.innerHTML = `
    <div class="drawer" role="dialog">
      <button class="drawer-close" title="${t('common.close')}">✕</button>
      <div class="drawer-head">
        ${playerPhoto(p, 'drawer-photo')}
        <div>
          <div class="drawer-name">${isHe() ? `<strong>${escapeHtml(playerName(p))}</strong>` : `${escapeHtml(p.first_name)} <strong>${escapeHtml(p.second_name)}</strong>`}${spBadges(p)}</div>
          <div class="drawer-meta">
            ${teamBadge(p.team)} ${escapeHtml(teamName(team))} · <span class="pos-badge pos-${pos.singular_name_short}">${posShort(pos.singular_name_short)}</span>
            · ${fmtPrice(p.now_cost)} · ${t('dw.owned', { pct: p.selected_by_percent })}
          </div>
          ${st ? `<div class="drawer-news ${st.cls}">${escapeHtml(st.label)}</div>` : ''}
          <div class="drawer-actions">
            <button class="chip-btn ${isWatched(id) ? 'on' : ''}" id="dw-watch">${isWatched(id) ? t('dw.watching') : t('dw.watch')}</button>
            <button class="chip-btn" id="dw-compare">${t('dw.compare')}</button>
          </div>
        </div>
      </div>
      <div class="summary-grid" style="padding:12px 0">
        ${statTile(t('dw.ptsLastSzn'), p.total_points)}
        ${statTile(t('stat.ppg'), p.points_per_game)}
        ${statTile(t('stat.xg'), p.expected_goals)}
        ${statTile(t('stat.xa'), p.expected_assists)}
        ${statTile(t('dw.minutes'), p.minutes)}
        ${statTile(t('dw.bonus'), p.bonus)}
        ${statTile(t('dw.defcon'), p.defensive_contribution)}
        ${statTile(t('dw.yellows'), p.yellow_cards)}
        ${statTile(t('dw.starts'), p.starts)}
      </div>
      <div id="drawer-body"><div class="loading" style="padding:20px 0"><div class="spinner"></div></div></div>
    </div>`;

  overlay.querySelector('.drawer-close').addEventListener('click', close);
  overlay.querySelector('#dw-watch').addEventListener('click', (e) => {
    toggleWatch(id);
    e.target.classList.toggle('on', isWatched(id));
    e.target.textContent = isWatched(id) ? t('dw.watching') : t('dw.watch');
  });
  overlay.querySelector('#dw-compare').addEventListener('click', () => {
    let slots;
    try { slots = JSON.parse(localStorage.getItem('amitfpl:compare')) || []; } catch { slots = []; }
    if (!slots.includes(id)) {
      const free = [0, 1, 2].find((i) => !slots[i]);
      slots[free ?? 2] = id;
      localStorage.setItem('amitfpl:compare', JSON.stringify(slots));
    }
    close();
    document.querySelector('.tab[data-tab="compare"]')?.click();
  });

  await loadBaseline();
  const model = buildModel(5);
  const summary = await fetchSummary(id);
  const body = overlay.querySelector('#drawer-body');
  if (!body) return; // drawer closed meanwhile

  const sections = [];
  sections.push(await trendSection(id));
  sections.push(`
    <div class="section-title" style="padding-inline-start:0">${t('dw.upcoming')} ${infoNote('info.model')}
      <span class="muted" style="font-weight:600">${t('dw.nextN', { n: model.gws.length, xp: model.gws.reduce((s, e) => s + model.xp(p.id, e), 0).toFixed(1) })}</span></div>
    <div class="table-wrap"><table class="data">
      <thead><tr><th class="no-sort">${t('common.gw')}</th><th class="no-sort">${t('common.fixture')}</th><th class="num no-sort">${t('stat.xp')}</th></tr></thead>
      <tbody>${upcomingRows(model, p)}</tbody>
    </table></div>`);

  if (summary?.history?.length) {
    sections.push(`
      <div class="section-title" style="padding-inline-start:0">${t('dw.thisSeason', { n: Math.min(10, summary.history.length) })}</div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th class="no-sort">${t('common.gw')}</th><th class="no-sort">${t('dw.opp')}</th><th class="num no-sort">${t('common.pts')}</th>
        <th class="num no-sort">${t('common.min')}</th><th class="num no-sort">${t('dw.g')}</th><th class="num no-sort">${t('dw.a')}</th>
        <th class="num no-sort">${t('dw.bonus')}</th><th class="num no-sort">${t('stat.xgi')}</th></tr></thead>
        <tbody>${gwLogRows(summary.history)}</tbody>
      </table></div>`);
  }

  if (summary?.history_past?.length) {
    sections.push(`
      <div class="section-title" style="padding-inline-start:0">${t('dw.pastSeasons')}</div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th class="no-sort">${t('dw.season')}</th><th class="num no-sort">${t('common.pts')}</th><th class="num no-sort">${t('common.min')}</th>
        <th class="num no-sort">${t('dw.g')}</th><th class="num no-sort">${t('dw.a')}</th><th class="num no-sort">${t('dw.cs')}</th>
        <th class="num no-sort">${t('dw.bonus')}</th><th class="num no-sort">${t('common.price')}</th></tr></thead>
        <tbody>${pastSeasonRows(summary.history_past)}</tbody>
      </table></div>`);
  } else if (!summary) {
    sections.push(`<div class="note" style="padding-inline-start:0">${t('dw.historyNote')}</div>`);
  }

  body.innerHTML = sections.join('');
}

export function initDrawer() {
  overlay = document.createElement('div');
  overlay.className = 'drawer-overlay';
  overlay.hidden = true;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  // Any element with data-pid opens the drawer (buttons/inputs excluded).
  document.addEventListener('click', (e) => {
    if (e.target.closest('button, input, select, a, .drawer')) return;
    const el = e.target.closest('[data-pid]');
    if (el) openDrawer(+el.dataset.pid);
  });
}
