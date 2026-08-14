#!/usr/bin/env python3
"""Map FPL players to FotMob face images.

For every player in data/bootstrap.json, looks up the FotMob player id
by name (validated against the club) and writes data/faces.json:
{ fpl_element_id: fotmob_id }. The app then uses FotMob's face-cropped
headshots (transparent background) instead of kit portraits.

Rerun occasionally (new signings). Polite rate limiting built in.
"""
import json
import os
import sys
import time
import unicodedata
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {"User-Agent": "Mozilla/5.0 (amitfpl faces mapper; personal project)"}

# FPL team name -> substring expected in FotMob teamName
TEAM_HINTS = {
    "Arsenal": "arsenal", "Aston Villa": "aston villa", "Bournemouth": "bournemouth",
    "Brentford": "brentford", "Brighton": "brighton", "Chelsea": "chelsea",
    "Coventry City": "coventry", "Crystal Palace": "crystal palace", "Everton": "everton",
    "Fulham": "fulham", "Hull City": "hull", "Ipswich Town": "ipswich",
    "Leeds": "leeds", "Liverpool": "liverpool", "Man City": "manchester city",
    "Man Utd": "manchester united", "Newcastle": "newcastle",
    "Nott'm Forest": "nottingham", "Spurs": "tottenham", "Sunderland": "sunderland",
}


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower().strip()


def suggest(term):
    url = f"https://apigw.fotmob.com/searchapi/suggest?term={urllib.parse.quote(term)}&lang=en"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15) as r:
            d = json.load(r)
    except Exception:
        return []
    out = []
    for group in d.get("squadMemberSuggest", []):
        for o in group.get("options", []):
            p = o.get("payload", {})
            if p.get("isCoach"):
                continue
            out.append({
                "id": p.get("id"),
                "team": norm(p.get("teamName", "")),
                "name": norm(o.get("text", "").split("|")[0]),
                "score": o.get("score", 0),
            })
    return out


def pick(options, team_hint):
    if not options:
        return None
    hinted = [o for o in options if team_hint and team_hint in o["team"]]
    if hinted:
        return hinted[0]["id"]
    return None


def main():
    # Re-matching all ~600 players costs ~600 rate-limited FotMob calls
    # (a couple of minutes) every run, for players that were already
    # matched last time and haven't changed. Default to only chasing
    # what's actually missing (new signings) so this is cheap enough to
    # run on a schedule instead of "occasionally" by hand; --full still
    # does the complete rebuild for when the matching logic itself changes.
    full = "--full" in sys.argv
    faces_path = os.path.join(ROOT, "data", "faces.json")
    boot = json.load(open(os.path.join(ROOT, "data", "bootstrap.json")))
    teams = {t["id"]: t["name"] for t in boot["teams"]}
    try:
        with open(faces_path) as f:
            faces = {int(k): v for k, v in json.load(f).items()}
    except Exception:
        faces = {}

    all_ids = {p["id"] for p in boot["elements"]}
    faces = {pid: fid for pid, fid in faces.items() if pid in all_ids}  # drop departed players
    players = boot["elements"] if full else [p for p in boot["elements"] if p["id"] not in faces]
    if not players:
        with open(faces_path, "w") as f:
            json.dump(faces, f)
        print("faces.json: nothing new to match")
        return 0

    unmatched = []
    for i, p in enumerate(players):
        hint = TEAM_HINTS.get(teams[p["team"]], norm(teams[p["team"]]))
        full_name = norm(f"{p['first_name']} {p['second_name']}")
        fid = pick(suggest(full_name), hint)
        if not fid:
            time.sleep(0.1)
            web = norm(p["web_name"])
            if web and web != full_name:
                fid = pick(suggest(web), hint)
        if not fid:
            time.sleep(0.1)
            last = norm(p["second_name"]).split(" ")[-1]
            if len(last) >= 4:
                fid = pick(suggest(last), hint)
        if fid:
            faces[p["id"]] = int(fid)
        else:
            unmatched.append(p["web_name"])
        time.sleep(0.12)
        if (i + 1) % 50 == 0:
            print(f"{i + 1}/{len(players)} … matched {len(players) - len(unmatched)}")
    with open(faces_path, "w") as f:
        json.dump(faces, f)
    print(f"\nmatched {len(players) - len(unmatched)}/{len(players)} ({'full rebuild' if full else 'new/missing'})")
    if unmatched:
        print("still unmatched:", ", ".join(unmatched[:25]), "…" if len(unmatched) > 25 else "")
    return 0


if __name__ == "__main__":
    sys.exit(main())
