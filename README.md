# amitfpl — personal FPL toolkit

A private Fantasy Premier League dashboard. Static site, no build step, no dependencies.

## How it works

- **Hosting:** GitHub Pages serves the site straight from this repo.
- **Data:** a GitHub Action ([refresh-data.yml](.github/workflows/refresh-data.yml))
  fetches the official FPL API every 30 minutes and commits snapshots to `data/`.
  The site reads those files — same origin, no CORS, no proxy to get blocked.
- **My Team:** set `"teamId": <your id>` in [config.json](config.json) and the
  Action snapshots your team too (`data/myteam.json`).

The site itself renders instantly from a localStorage copy and revalidates in
the background (stale-while-revalidate) — no loading spinner after first visit.

## Run locally

```bash
python3 dev-server.py
```

Then open http://localhost:8787 — the dev server serves `data/` snapshots and
also proxies `/api/fpl/*` to the live API as a fallback.

To refresh local snapshots manually:

```bash
python3 scripts/fetch_data.py
```

## Structure

- `index.html` / `styles.css` — shell and design
- `js/api.js` — data access: snapshots first, live API fallback, SWR cache
- `js/state.js` — shared derived data (teams, players, upcoming fixtures)
- `js/players.js` — sortable/filterable player dashboard (xP, price, ownership, xG/xA)
- `js/scout.js` — captaincy shortlist, differentials finder, best value (pts/£M)
- `js/market.js` — price changes and transfer momentum
- `js/status.js` — injuries & doubts (official flags + news), suspension watch
- `js/compare.js` — 2–3 players side by side with best-value highlighting
- `js/fixtures.js` — fixture difficulty (FDR) planner grid
- `js/setpieces.js` — penalty / free-kick / corner takers per team
- `js/myteam.js` — your team via Team ID
- `scripts/fetch_data.py` — snapshot fetcher (used by the Action and locally)
- `.github/workflows/refresh-data.yml` — the 30-min refresh schedule
- `dev-server.py` — local static server + live API proxy

## Roadmap

- Phase 2: optimal transfer solver + multi-gameweek planner
- Phase 3: live in-match points + mini-league comparisons
- Phase 4: predicted lineups + goal-scoring odds (external sources)
