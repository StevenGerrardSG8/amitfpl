#!/usr/bin/env python3
"""Fetch FPL data snapshots into data/*.json.

Runs in GitHub Actions on a schedule (see .github/workflows/refresh-data.yml)
and can be run locally too. Only stdlib — no dependencies.
"""
import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone

API = "https://fantasy.premierleague.com/api"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
HEADERS = {"User-Agent": "Mozilla/5.0 (amitfpl data refresh)"}


def fetch(path):
    req = urllib.request.Request(f"{API}{path}", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def write(name, obj):
    with open(os.path.join(DATA_DIR, name), "w") as f:
        json.dump(obj, f, separators=(",", ":"))
    print(f"wrote data/{name}")


def snapshot_summaries(elements):
    """Detailed per-player data (GW logs, season history) for the ~150
    most relevant players, so player profiles work on the hosted site."""
    out_dir = os.path.join(DATA_DIR, "summaries")
    os.makedirs(out_dir, exist_ok=True)
    by_own = sorted(elements, key=lambda p: -float(p["selected_by_percent"] or 0))[:120]
    by_pts = sorted(elements, key=lambda p: -(p["total_points"] or 0))[:80]
    ids = list(dict.fromkeys([p["id"] for p in by_own + by_pts]))[:150]
    ok = 0
    for pid in ids:
        try:
            data = fetch(f"/element-summary/{pid}/")
            with open(os.path.join(out_dir, f"{pid}.json"), "w") as f:
                json.dump(data, f, separators=(",", ":"))
            ok += 1
        except Exception:
            pass
        time.sleep(0.05)
    print(f"wrote {ok} player summaries")


def append_trends(elements):
    """One price+ownership sample per player per day -> data/trends.json.
    Fuel for price/ownership charts and, later, a price predictor."""
    path = os.path.join(DATA_DIR, "trends.json")
    try:
        with open(path) as f:
            trends = json.load(f)
    except Exception:
        trends = {}
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if today not in trends:
        trends[today] = {str(p["id"]): [p["now_cost"], p["selected_by_percent"]] for p in elements}
        for day in sorted(trends)[:-90]:  # keep ~3 months
            del trends[day]
        with open(path, "w") as f:
            json.dump(trends, f, separators=(",", ":"))
        print(f"trends: recorded {today}")


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    bootstrap = fetch("/bootstrap-static/")
    write("bootstrap.json", bootstrap)
    write("fixtures.json", fetch("/fixtures/"))
    snapshot_summaries(bootstrap["elements"])
    append_trends(bootstrap["elements"])

    # Personal team snapshot — set teamId in config.json (repo root) to enable.
    team = None
    try:
        with open(os.path.join(ROOT, "config.json")) as f:
            team_id = json.load(f).get("teamId")
        if team_id:
            entry = fetch(f"/entry/{team_id}/")
            picks = None
            gw = entry.get("current_event")
            if gw:
                try:
                    picks = fetch(f"/entry/{team_id}/event/{gw}/picks/")
                except Exception as e:
                    print(f"picks unavailable: {e}", file=sys.stderr)
            team = {"entry": entry, "picks": picks}
    except FileNotFoundError:
        pass
    write("myteam.json", team)

    write("meta.json", {"generated_at": datetime.now(timezone.utc).isoformat()})


if __name__ == "__main__":
    main()
