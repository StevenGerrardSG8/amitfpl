// CORS-enabled read-only proxy to the public FPL API.
//
// The hosted site is static (GitHub Pages) and the FPL API doesn't send
// CORS headers, so a browser can't fetch another manager's team data
// directly (see js/myteam.js) - only the one team pre-baked into
// data/myteam.json every 30 min by the GitHub Action. This worker lets
// the site look up ANY team, live, on demand: deploy it once (see
// README.md), then paste its https://*.workers.dev URL into
// config.json's "proxyUrl".
//
// Only forwards a fixed allowlist of read-only, already-public endpoints
// - never a catch-all - so this can't become a general open proxy.

const ALLOWED_ORIGINS = new Set([
  'https://stevengerrardsg8.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
]);

const ALLOWED_PATHS = [
  /^\/entry\/\d+\/$/,
  /^\/entry\/\d+\/event\/\d+\/picks\/$/,
  /^\/entry\/\d+\/history\/$/,
  /^\/leagues-classic\/\d+\/standings\/$/,
];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const corsOrigin = ALLOWED_ORIGINS.has(origin) ? origin : '';

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          Vary: 'Origin',
        },
      });
    }
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(request.url);
    if (!ALLOWED_PATHS.some((re) => re.test(url.pathname))) {
      return new Response('Not found', { status: 404 });
    }

    const cache = caches.default;
    let res = await cache.match(request);
    if (!res) {
      const upstream = await fetch(`https://fantasy.premierleague.com/api${url.pathname}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (amitfpl proxy)' },
      });
      res = new Response(upstream.body, {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
      });
      if (upstream.ok) ctx.waitUntil(cache.put(request, res.clone()));
    }

    const out = new Response(res.body, res);
    out.headers.set('Access-Control-Allow-Origin', corsOrigin);
    out.headers.set('Vary', 'Origin');
    return out;
  },
};
