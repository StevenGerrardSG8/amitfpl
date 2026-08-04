// Data access. Primary source: static snapshots in data/*.json, kept
// fresh by a GitHub Action every 30 min (works anywhere, no CORS).
// Fallback: the live FPL API through a proxy at /api/fpl/* - available
// locally via dev-server.py.
//
// Rendering is stale-while-revalidate: cached data (any age) renders
// instantly from localStorage, and app.js refreshes it in the background.

const SOURCES = {
  bootstrap: { snapshot: 'data/bootstrap.json', api: '/api/fpl/bootstrap-static/' },
  fixtures: { snapshot: 'data/fixtures.json', api: '/api/fpl/fixtures/' },
};

async function tryFetch(url) {
  // Hard timeout so a hung request surfaces as an error instead of an
  // endless spinner. Generous: first load on slow cellular pulls ~300KB.
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 45000);
  try {
    const res = await fetch(url, { cache: 'no-cache', signal: ctl.signal });
    if (!res.ok) {
      const err = new Error(`${res.status} for ${url}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

const cacheKey = (name) => `amitfpl:v2:${name}`;

// Returns {t, gen, d} or null. Never rejects - corrupt cache reads as a miss.
// t = when we fetched; gen = when the snapshot was generated (if known).
export function readCache(name) {
  try {
    const hit = JSON.parse(localStorage.getItem(cacheKey(name)));
    if (hit && hit.d && typeof hit.t === 'number') return hit;
  } catch { /* corrupt cache */ }
  return null;
}

// Fetches fresh data for 'bootstrap' or 'fixtures': snapshot first,
// live API as fallback. Returns the data; timestamps go to localStorage.
export async function fetchFresh(name, meta) {
  const src = SOURCES[name];
  let data;
  let gen = null;
  try {
    data = await tryFetch(src.snapshot);
    gen = meta?.generated_at ? Date.parse(meta.generated_at) : null;
  } catch {
    data = await tryFetch(src.api);
  }
  try {
    localStorage.setItem(cacheKey(name), JSON.stringify({ t: Date.now(), gen, d: data }));
  } catch { /* quota exceeded - serve uncached */ }
  return data;
}

// Snapshot metadata ({generated_at}) - null when snapshots don't exist.
export async function fetchMeta() {
  try {
    return await tryFetch('data/meta.json');
  } catch {
    return null;
  }
}

// data/myteam.json - {entry, picks} for the team configured in
// config.json, or null when not configured / file missing.
export async function fetchTeamSnapshot() {
  try {
    return await tryFetch('data/myteam.json');
  } catch {
    return null;
  }
}

export async function fetchConfig() {
  try {
    return await tryFetch('config.json');
  } catch {
    return {};
  }
}

// Live team endpoints (work where an /api/fpl proxy exists, e.g. local dev).
export const getEntry = (id) => tryFetch(`/api/fpl/entry/${id}/`);
export const getPicks = (id, gw) => tryFetch(`/api/fpl/entry/${id}/event/${gw}/picks/`);
