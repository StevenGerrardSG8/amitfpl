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

## Telegram alerts (optional)

Deadline reminders + injury/price alerts for players on your watchlist,
checked on every data refresh while the local server runs.

1. In Telegram, talk to **@BotFather** → `/newbot` → copy the token.
2. Message your new bot once (any text), then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in the browser and
   copy your `chat.id` from the response.
3. `cp config.local.example.json config.local.json` and paste both
   values in (the file is gitignored — your token stays local).
4. Test: `python3 scripts/alerts.py --test`

## Install as an app (PWA)

Chrome/Edge: the install icon appears in the address bar — one click
adds amitfpl as a desktop app. Works offline with the last-loaded data.

## Structure

- `index.html` / `styles.css` — shell and design
- `js/api.js` — data access: snapshots first, live API fallback, SWR cache
- `js/state.js` — shared derived data (teams, players, upcoming fixtures)
- `js/players.js` — sortable/filterable player dashboard (xP, price, ownership, xG/xA)
- `js/model.js` — amitfpl xP model v1: per-player per-GW predictions from frozen
  baseline rates (`data/baseline.json`) + fixture difficulty + availability
- `js/planner.js` — squad planner: auto-builds an optimal £100M squad
  (hill-climbing optimizer) and picks the best XI, formation and captain per GW
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

- Phase 2 (rest): transfer solver for an existing team (suggest 1-2 swaps/GW)
- Phase 3: live in-match points + mini-league comparisons
- Phase 4: predicted lineups + goal-scoring odds (external sources)
- Model v2: calibrate with per-GW history from
  [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League)
  once 2026/27 gameweek data starts flowing; re-check the API's team
  strength ratings (all zeros pre-season — model falls back to FDR)
