import { readCache, fetchFresh, fetchMeta } from './api.js';
import { initState, state } from './state.js';
import { renderPlayers } from './players.js';
import { renderPlanner } from './planner.js';
import { renderScout } from './scout.js';
import { renderMarket } from './market.js';
import { renderStatus } from './status.js';
import { renderCompare } from './compare.js';
import { renderFixtures } from './fixtures.js';
import { renderSetPieces } from './setpieces.js';
import { renderMyTeam } from './myteam.js';

const CORE = ['bootstrap', 'fixtures'];
// Refresh in the background whenever the cached copy is older than this.
const REFRESH_AFTER_MS = 2 * 60 * 1000;

const views = {
  players: { el: document.getElementById('view-players'), render: renderPlayers, done: false },
  planner: { el: document.getElementById('view-planner'), render: renderPlanner, done: false },
  scout: { el: document.getElementById('view-scout'), render: renderScout, done: false },
  market: { el: document.getElementById('view-market'), render: renderMarket, done: false },
  status: { el: document.getElementById('view-status'), render: renderStatus, done: false },
  compare: { el: document.getElementById('view-compare'), render: renderCompare, done: false },
  fixtures: { el: document.getElementById('view-fixtures'), render: renderFixtures, done: false },
  setpieces: { el: document.getElementById('view-setpieces'), render: renderSetPieces, done: false },
  myteam: { el: document.getElementById('view-myteam'), render: renderMyTeam, done: false },
};

let activeTab = 'players';
let refreshing = false;

function showTab(name) {
  activeTab = name;
  for (const [key, v] of Object.entries(views)) {
    v.el.hidden = key !== name;
  }
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
  });
  const v = views[name];
  // My Team re-renders on every visit (live data); others render once.
  if (!v.done || name === 'myteam') {
    v.render(v.el);
    v.done = true;
  }
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}

function renderDeadline() {
  const ev = state.nextEvent;
  if (!ev) return;
  const chip = document.getElementById('deadline-chip');
  const dl = new Date(ev.deadline_time);
  const days = Math.max(0, Math.round((dl - Date.now()) / 86400000));
  document.getElementById('deadline-gw').textContent = `${ev.name} deadline`;
  document.getElementById('deadline-time').textContent =
    dl.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) +
    (days > 0 ? ` · in ${days}d` : ' · today');
  chip.hidden = false;
}

// The freshest honest timestamp: snapshot generation time when known,
// otherwise the time we fetched. Oldest of the two sources wins.
function dataTimestamp() {
  const hits = CORE.map(readCache);
  if (hits.some((h) => !h)) return null;
  return Math.min(...hits.map((h) => h.gen ?? h.t));
}

function renderUpdatedChip(failed = false) {
  const chip = document.getElementById('updated-chip');
  const text = document.getElementById('updated-text');
  const t = dataTimestamp();
  if (!t) { chip.hidden = true; return; }
  chip.hidden = false;
  if (failed) {
    text.textContent = 'refresh failed';
    return;
  }
  const mins = Math.floor((Date.now() - t) / 60000);
  text.textContent =
    mins < 1 ? 'Updated just now'
    : mins < 60 ? `Updated ${mins}m ago`
    : `Updated ${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function rerenderAll() {
  for (const v of Object.values(views)) v.done = false;
  showTab(activeTab);
}

async function fetchCore() {
  const meta = await fetchMeta();
  const [bootstrap, fixtures] = await Promise.all(CORE.map((n) => fetchFresh(n, meta)));
  initState(bootstrap, fixtures);
}

async function refresh(manual = false) {
  if (refreshing) return;
  refreshing = true;
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  try {
    if (manual) {
      // On the local server this pulls brand-new data from FPL before we
      // refetch; elsewhere (e.g. GitHub Pages) it 404s and we move on.
      await fetch('/api/refresh-now', { method: 'POST' }).catch(() => {});
    }
    await fetchCore();
    renderDeadline();
    rerenderAll();
    renderUpdatedChip();
  } catch {
    renderUpdatedChip(true);
  } finally {
    refreshing = false;
    btn.classList.remove('spinning');
  }
}

async function main() {
  window.__appStarted = true; // disarms the stuck-spinner guard in index.html
  const loading = document.getElementById('loading');
  const errorBox = document.getElementById('error');

  const cached = CORE.map(readCache);
  const haveCache = cached.every(Boolean);

  if (haveCache) {
    // Instant render from cache, however old it is.
    initState(cached[0].d, cached[1].d);
  } else {
    // First visit ever on this device — nothing to show yet.
    try {
      await fetchCore();
    } catch (e) {
      loading.hidden = true;
      errorBox.hidden = false;
      errorBox.textContent = `Couldn't load FPL data (${e.message}). Refresh to retry.`;
      return;
    }
  }

  loading.hidden = true;
  renderDeadline();
  renderUpdatedChip();

  document.getElementById('tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (tab) showTab(tab.dataset.tab);
  });
  document.getElementById('refresh-btn').addEventListener('click', () => refresh(true));

  const themeBtn = document.getElementById('theme-btn');
  const syncThemeIcon = () => {
    themeBtn.textContent = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙';
  };
  syncThemeIcon();
  themeBtn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    if (dark) delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = 'dark';
    try { localStorage.setItem('amitfpl:theme', dark ? 'light' : 'dark'); } catch { /* private mode */ }
    syncThemeIcon();
  });

  const initial = location.hash.slice(1);
  showTab(views[initial] ? initial : 'players');

  // Keep the "updated Xm ago" label honest.
  setInterval(() => { if (!refreshing) renderUpdatedChip(); }, 30000);

  // Background revalidation: on load if stale, and whenever the tab
  // comes back into focus after sitting idle.
  const isStale = () => {
    const hits = CORE.map(readCache);
    if (hits.some((h) => !h)) return true;
    return Date.now() - Math.min(...hits.map((h) => h.t)) > REFRESH_AFTER_MS;
  };
  if (haveCache && isStale()) refresh();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isStale()) refresh();
  });
}

main();
