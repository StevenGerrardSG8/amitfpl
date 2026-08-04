#!/usr/bin/env python3
"""Fetch FPL data snapshots into data/*.json.

Runs in GitHub Actions on a schedule (see .github/workflows/refresh-data.yml)
and can be run locally too. Only stdlib — no dependencies.
"""
import json
import os
import sys
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


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    write("bootstrap.json", fetch("/bootstrap-static/"))
    write("fixtures.json", fetch("/fixtures/"))

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
