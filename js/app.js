import { readCache, fetchFresh, fetchMeta } from './api.js';
import { initState, state } from './state.js';
import { renderHome } from './home.js';
import { renderPlayers } from './players.js';
import { renderPlanner } from './planner.js';
import { renderScout } from './scout.js';
import { renderMarket } from './market.js';
import { renderStatus } from './status.js';
import { renderCompare } from './compare.js';
import { renderFixtures } from './fixtures.js';
import { renderLineups } from './lineups.js';
import { renderMatches } from './matches.js';
import { renderSetPieces } from './setpieces.js';
import { renderMyTeam } from './myteam.js';
import { initDrawer } from './drawer.js';
import { t, getLang, setLang, applyDir, applyStaticI18n, locale, gwName } from './i18n.js';
import { initAuth } from './auth.js';

const CORE = ['bootstrap', 'fixtures'];
// Refresh in the background whenever the cached copy is older than this.
const REFRESH_AFTER_MS = 2 * 60 * 1000;

const views = {
  home: { el: document.getElementById('view-home'), render: renderHome, done: false },
  players: { el: document.getElementById('view-players'), render: renderPlayers, done: false },
  planner: { el: document.getElementById('view-planner'), render: renderPlanner, done: false },
  scout: { el: document.getElementById('view-scout'), render: renderScout, done: false },
  market: { el: document.getElementById('view-market'), render: renderMarket, done: false },
  status: { el: document.getElementById('view-status'), render: renderStatus, done: false },
  compare: { el: document.getElementById('view-compare'), render: renderCompare, done: false },
  fixtures: { el: document.getElementById('view-fixtures'), render: renderFixtures, done: false },
  lineups: { el: document.getElementById('view-lineups'), render: renderLineups, done: false },
  matches: { el: document.getElementById('view-matches'), render: renderMatches, done: false },
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
  // My Team re-renders every visit (live data); the planner too (its
  // layout depends on viewport size); others render once.
  if (!v.done || name === 'myteam' || name === 'planner') {
    v.render(v.el);
    v.done = true;
  }
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
  try { localStorage.setItem('amitfpl:lastTab', name); } catch { /* private mode */ }
}

function renderDeadline() {
  const ev = state.nextEvent;
  if (!ev) return;
  const chip = document.getElementById('deadline-chip');
  const dl = new Date(ev.deadline_time);
  const left = dl - Date.now();
  let count;
  if (left <= 0) count = t('chrome.locked');
  else {
    const d = Math.floor(left / 86400000);
    const h = Math.floor((left % 86400000) / 3600000);
    const m = Math.floor((left % 3600000) / 60000);
    count = d > 0 ? t('time.dh', { d, h }) : h > 0 ? t('time.hm', { h, m }) : t('time.m', { m });
  }
  document.getElementById('deadline-gw').textContent = t('chrome.deadline', { gw: gwName(ev.name) });
  document.getElementById('deadline-time').textContent =
    dl.toLocaleString(locale(), { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) +
    ` · ${left <= 0 ? count : t('chrome.inTime', { count })}`;
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
  const ts = dataTimestamp();
  if (!ts) { chip.hidden = true; return; }
  chip.hidden = false;
  if (failed) {
    text.textContent = t('chrome.refreshFailed');
    return;
  }
  const mins = Math.floor((Date.now() - ts) / 60000);
  text.textContent =
    mins < 1 ? t('chrome.updatedNow')
    : mins < 60 ? t('chrome.updatedMin', { m: mins })
    : t('chrome.updatedHr', { h: Math.floor(mins / 60), m: mins % 60 });
}

function rerenderAll() {
  for (const v of Object.values(views)) v.done = false;
  showTab(activeTab);
}

async function fetchCore() {
  const meta = await fetchMeta();
  const [bootstrap, fixtures] = await Promise.all(CORE.map((n) => fetchFresh(n, meta)));
  initState(bootstrap, fixtures);
  await loadFaces();
}

// Optional enrichment data - the app works without either file.
async function loadFaces() {
  if (!Object.keys(state.faces).length) {
    try {
      const res = await fetch('data/faces.json');
      if (res.ok) state.faces = await res.json();
    } catch { /* fine - portrait crop fallback */ }
  }
  if (!Object.keys(state.elo).length) {
    try {
      const res = await fetch('data/elo.json');
      if (res.ok) state.elo = await res.json();
    } catch { /* fine - FDR fallback in the model */ }
  }
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
  applyDir();
  applyStaticI18n();
  const loading = document.getElementById('loading');
  const errorBox = document.getElementById('error');

  const cached = CORE.map(readCache);
  const haveCache = cached.every(Boolean);

  if (haveCache) {
    // Instant render from cache, however old it is.
    initState(cached[0].d, cached[1].d);
    await loadFaces();
  } else {
    // First visit ever on this device - nothing to show yet.
    try {
      await fetchCore();
    } catch (e) {
      loading.hidden = true;
      errorBox.hidden = false;
      errorBox.textContent = t('chrome.loadError', { msg: e.message });
      return;
    }
  }

  loading.hidden = true;
  renderDeadline();
  renderUpdatedChip();
  initDrawer();
  initAuth(); // optional accounts - no-op until Firebase is configured

  const tabsNav = document.getElementById('tabs');
  tabsNav.addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    showTab(tab.dataset.tab);
    tab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  });

  // The tab bar scrolls sideways on phones; fade the cut-off edge so it's
  // clear there are more tabs. fade-l/fade-r are physical sides.
  const updateTabFades = () => {
    const max = tabsNav.scrollWidth - tabsNav.clientWidth;
    const rtl = document.documentElement.dir === 'rtl';
    const pos = Math.abs(tabsNav.scrollLeft); // distance scrolled from the start edge
    const moreAtStart = max > 1 && pos > 1;
    const moreAtEnd = max > 1 && pos < max - 1;
    tabsNav.classList.toggle(rtl ? 'fade-r' : 'fade-l', moreAtStart);
    tabsNav.classList.toggle(rtl ? 'fade-l' : 'fade-r', moreAtEnd);
  };
  updateTabFades();
  tabsNav.addEventListener('scroll', updateTabFades, { passive: true });
  window.addEventListener('resize', updateTabFades);
  document.getElementById('refresh-btn').addEventListener('click', () => refresh(true));

  // Help modal
  const helpOverlay = document.getElementById('help-overlay');
  document.getElementById('help-btn').addEventListener('click', () => {
    helpOverlay.hidden = !helpOverlay.hidden;
  });
  helpOverlay.addEventListener('click', (e) => {
    if (e.target === helpOverlay || e.target.closest('.drawer-close')) helpOverlay.hidden = true;
  });

  // Language toggle: swap EN <-> HE, flip direction, re-translate the
  // static chrome and re-render every view in place.
  document.getElementById('lang-btn').addEventListener('click', () => {
    setLang(getLang() === 'he' ? 'en' : 'he');
    applyStaticI18n();
    renderDeadline();
    renderUpdatedChip();
    rerenderAll();
  });

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
  // Until the user picks a theme explicitly, follow the system setting
  // live (the head script already applied it before first paint).
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    let stored = null;
    try { stored = localStorage.getItem('amitfpl:theme'); } catch { /* private mode */ }
    if (stored) return;
    if (e.matches) document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    syncThemeIcon();
  });

  // First visit: a short welcome card explaining the main tools.
  // Shown only after the sign-in prompt has settled (signed in, guest
  // chosen, or accounts not configured), so new visitors see the
  // sign-in screen first. Skipped for shared-plan links.
  const maybeOnboard = () => {
    const ob = document.createElement('div');
    ob.className = 'drawer-overlay onboard-overlay';
    ob.innerHTML = `
      <div class="onboard-card">
        <h2>${t('ob.title')}</h2>
        <p class="ob-sub">${t('ob.sub')}</p>
        <ul class="ob-list">
          <li>${t('ob.item1')}</li>
          <li>${t('ob.item2')}</li>
          <li>${t('ob.item3')}</li>
          <li>${t('ob.item4')}</li>
          <li>${t('ob.item5')}</li>
        </ul>
        <button class="btn" id="ob-go">${t('ob.go')}</button>
      </div>`;
    const dismiss = () => {
      ob.remove();
      try { localStorage.setItem('amitfpl:onboarded', '1'); } catch { /* private mode */ }
    };
    ob.addEventListener('click', (e) => {
      if (e.target === ob || e.target.closest('#ob-go')) dismiss();
    });
    document.body.appendChild(ob);
  };
  let onboarded = '1';
  try { onboarded = localStorage.getItem('amitfpl:onboarded') || ''; } catch { /* private mode */ }
  if (!onboarded && !location.hash.startsWith('#plan=')) {
    addEventListener('amitfpl:auth-settled', maybeOnboard, { once: true });
  }

  const initial = location.hash.slice(1);
  let lastTab = null;
  try { lastTab = localStorage.getItem('amitfpl:lastTab'); } catch { /* private mode */ }
  // Shared plan links (#plan=...) land straight in the planner; otherwise
  // the hash wins, then the tab you were on last visit.
  showTab(initial.startsWith('plan=') ? 'planner'
    : views[initial] ? initial
    : views[lastTab] ? lastTab
    : 'home');

  // Keep the "updated Xm ago" label and the deadline countdown honest.
  setInterval(() => {
    if (!refreshing) renderUpdatedChip();
    renderDeadline();
  }, 30000);

  // ⓘ method explainers: one delegated handler for every card's popover.
  // The pop is fixed-positioned and clamped to the viewport so it never gets
  // clipped by card overflow or the screen edge (flips above when needed).
  const closeInfoPops = (except) => {
    document.querySelectorAll('.info-wrap.open').forEach((w) => {
      if (w === except) return;
      w.classList.remove('open');
      const p = w.querySelector('.info-pop');
      if (p) p.removeAttribute('style');
    });
  };
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.info-btn');
    closeInfoPops(btn ? btn.parentElement : null);
    if (!btn) return;
    const wrap = btn.parentElement;
    const pop = wrap.querySelector('.info-pop');
    if (wrap.classList.toggle('open') && pop) {
      const margin = 8;
      const r = btn.getBoundingClientRect();
      const width = Math.min(340, window.innerWidth - margin * 2);
      const start = document.documentElement.dir === 'rtl' ? r.right - width : r.left;
      const left = Math.max(margin, Math.min(start, window.innerWidth - width - margin));
      pop.style.position = 'fixed';
      pop.style.width = `${width}px`;
      pop.style.left = `${left}px`;
      pop.style.top = `${r.bottom + 6}px`;
      const h = pop.offsetHeight;
      if (r.bottom + 6 + h > window.innerHeight - margin) {
        pop.style.top = `${Math.max(margin, r.top - 6 - h)}px`;
      }
    } else if (pop) {
      pop.removeAttribute('style');
    }
  });
  window.addEventListener('scroll', () => closeInfoPops(null), { capture: true, passive: true });

  // Phones: the brand/chips rows scroll away with the page so only the tab
  // bar stays stuck (the 640px media query sticks .topbar at minus this
  // height). Observed, not hardcoded - the rows wrap and the deadline chip
  // appears async.
  const topbarInner = document.querySelector('.topbar-inner');
  const setTopbarCollapse = () =>
    document.documentElement.style.setProperty('--topbar-collapse', `${topbarInner.offsetHeight}px`);
  setTopbarCollapse();
  new ResizeObserver(setTopbarCollapse).observe(topbarInner);

  // Power-user shortcut: "/" jumps to the Players search from anywhere.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/') return;
    if (e.target instanceof Element && e.target.closest('input, select, textarea')) return;
    e.preventDefault();
    showTab('players');
    setTimeout(() => document.querySelector('#pl-search')?.focus(), 50);
  });

  // Phones: a floating back-to-top button once you're a screen down.
  const toTop = document.createElement('button');
  toTop.className = 'to-top';
  toTop.textContent = '↑';
  toTop.title = t('chrome.toTop');
  toTop.setAttribute('aria-label', t('chrome.toTop'));
  toTop.hidden = true;
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  document.body.appendChild(toTop);
  window.addEventListener('scroll', () => {
    toTop.hidden = window.scrollY < window.innerHeight;
  }, { passive: true });

  // Offline awareness: a slim banner while disconnected (cached data
  // keeps working thanks to the service worker).
  const offlineBar = document.createElement('div');
  offlineBar.className = 'offline-bar';
  offlineBar.textContent = t('chrome.offline');
  offlineBar.hidden = navigator.onLine;
  document.querySelector('.topbar').appendChild(offlineBar);
  addEventListener('online', () => { offlineBar.hidden = true; refresh(); });
  addEventListener('offline', () => { offlineBar.hidden = false; });

  // The planner's markup differs across the mobile breakpoint - refresh
  // it when the viewport crosses over (rotation, window resize).
  matchMedia('(max-width: 640px)').addEventListener('change', () => {
    views.planner.done = false;
    if (activeTab === 'planner') showTab('planner');
  });

  // Photo watchdog: ~190 players have no headshot on the PL CDN yet
  // (new signings pre-season), and some requests hang without firing
  // onerror. Fallback goes straight to an initials circle (inline SVG,
  // can never fail) - faces only, no kit/body images. Runs on visible
  // images only so lazy loading isn't mistaken for a hang.
  const initialsUri = (ch) =>
    'data:image/svg+xml,' + encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="20" fill="#6473a8"/>
        <text x="20" y="27" font-size="18" font-family="sans-serif" font-weight="700" fill="#fff" text-anchor="middle">${ch}</text>
      </svg>`);
  const inView = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > -200 && r.top < innerHeight + 200;
  };
  setInterval(() => {
    const now = Date.now();
    document.querySelectorAll('img[data-shirt]').forEach((img) => {
      if (img.dataset.f === '2' || !inView(img)) return;
      if (!img.dataset.t) { img.dataset.t = now; return; }
      const failed = img.complete && img.naturalWidth === 0;
      const hung = !img.complete && now - +img.dataset.t > 4000;
      if (!failed && !hung) return;
      img.dataset.f = '2';
      img.classList.remove('shirt-img');
      img.src = initialsUri(img.dataset.init || '?');
    });
  }, 1000);

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

// PWA: installable app + offline fallback (network-first, never stale).
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* http or unsupported */ });
}
