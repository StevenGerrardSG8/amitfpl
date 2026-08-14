#!/usr/bin/env python3
"""Fetch FPL data snapshots into data/*.json.

Runs in GitHub Actions on a schedule (see .github/workflows/refresh-data.yml)
and can be run locally too. Only stdlib — no dependencies.
"""
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API = "https://fantasy.premierleague.com/api"
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
FOOTBALLER_QID = "Q937857"  # Wikidata: "association football player"
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


# FPL team name -> ClubElo club name
ELO_NAMES = {
    "Arsenal": "Arsenal", "Aston Villa": "Aston Villa", "Bournemouth": "Bournemouth",
    "Brentford": "Brentford", "Brighton": "Brighton", "Chelsea": "Chelsea",
    "Coventry City": "Coventry", "Crystal Palace": "Crystal Palace", "Everton": "Everton",
    "Fulham": "Fulham", "Hull City": "Hull", "Ipswich Town": "Ipswich",
    "Leeds": "Leeds", "Liverpool": "Liverpool", "Man City": "Man City",
    "Man Utd": "Man United", "Newcastle": "Newcastle", "Nott'm Forest": "Forest",
    "Spurs": "Tottenham", "Sunderland": "Sunderland",
}


def fetch_elo(teams):
    """Daily ClubElo ratings -> data/elo.json {fpl_team_id: elo}."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    req = urllib.request.Request(f"http://api.clubelo.com/{today}", headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            lines = r.read().decode().splitlines()
    except Exception as e:
        print(f"elo fetch failed: {e}", file=sys.stderr)
        return
    ratings = {}
    for line in lines[1:]:
        parts = line.split(",")
        if len(parts) >= 5 and parts[2] == "ENG":
            ratings[parts[1]] = float(parts[4])
    out = {}
    for t in teams:
        name = ELO_NAMES.get(t["name"])
        if name and name in ratings:
            out[str(t["id"])] = round(ratings[name], 1)
    if len(out) >= 15:  # sanity - don't overwrite with a broken pull
        write("elo.json", out)
    else:
        print(f"elo: only matched {len(out)} teams, keeping previous file", file=sys.stderr)


def snapshot_live(bootstrap):
    """Live per-player points for the current GW -> data/live.json
    {"gw": N, "e": {playerId: [minutes, total_points]}} (trimmed to keep
    the repo light). Skipped when no GW is running."""
    current = next((e for e in bootstrap["events"] if e.get("is_current")), None)
    if not current or current.get("finished"):
        return
    try:
        live = fetch(f"/event/{current['id']}/live/")
    except Exception as e:
        print(f"live fetch failed: {e}", file=sys.stderr)
        return
    trimmed = {}
    for el in live.get("elements", []):
        s = el.get("stats") or {}
        if s.get("minutes") or s.get("total_points"):
            trimmed[str(el["id"])] = [s.get("minutes", 0), s.get("total_points", 0)]
    write("live.json", {"gw": current["id"], "e": trimmed})


def snapshot_leagues(entry, team_id):
    """Standings for the team's private classic leagues -> data/leagues.json.
    Top 20 rows per league, up to 5 leagues (skips the giant global ones)."""
    classic = (entry.get("leagues") or {}).get("classic") or []
    private = [l for l in classic if l.get("league_type") == "x"][:5]
    out = []
    for lg in private:
        try:
            data = fetch(f"/leagues-classic/{lg['id']}/standings/")
        except Exception as e:
            print(f"league {lg['id']} fetch failed: {e}", file=sys.stderr)
            continue
        rows = (data.get("standings") or {}).get("results") or []
        out.append({
            "id": lg["id"],
            "name": data.get("league", {}).get("name") or lg.get("name"),
            "standings": [
                {"entry": r["entry"], "player_name": r["player_name"],
                 "entry_name": r["entry_name"], "rank": r["rank"],
                 "last_rank": r["last_rank"], "total": r["total"],
                 "event_total": r.get("event_total")}
                for r in rows[:20]
            ],
        })
    if out:
        # Tag the snapshot with the team it belongs to - the site only
        # ever fetches one team's leagues here, but if a different team
        # ID is connected in a browser it must NOT show this team's
        # private league standings under that other team's "My leagues".
        write("leagues.json", {"teamId": str(team_id), "leagues": out})


def wikidata_get(params):
    url = f"{WIKIDATA_API}?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.load(resp)


def hebrew_name_from_wikidata(full_name):
    """A footballer's Hebrew Wikipedia title, via Wikidata - free, no
    key. Full names are common enough (many "John Smith"s exist) that
    a bare name search can't be trusted on its own, so every candidate
    is checked for occupation = "association football player" (P106)
    before its hewiki sitelink is used - silently borrowing some
    unrelated same-named person's spelling would be worse than leaving
    the name for the Telegram alert to flag instead."""
    try:
        search = wikidata_get({
            "action": "wbsearchentities", "search": full_name, "language": "en",
            "type": "item", "limit": 5, "format": "json",
        })
    except Exception as e:
        print(f"wikidata search failed for {full_name!r}: {e}", file=sys.stderr)
        return None
    for hit in search.get("search", []):
        qid = hit["id"]
        try:
            ent = wikidata_get({
                "action": "wbgetentities", "ids": qid,
                "props": "claims|sitelinks", "format": "json",
            })
        except Exception:
            continue
        time.sleep(0.2)
        entity = ent.get("entities", {}).get(qid, {})
        occupations = entity.get("claims", {}).get("P106", [])
        is_footballer = any(
            c.get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id") == FOOTBALLER_QID
            for c in occupations
        )
        if not is_footballer:
            continue
        hewiki = entity.get("sitelinks", {}).get("hewiki")
        if not hewiki:
            continue
        # Hebrew Wikipedia adds a "(...)" disambiguator only when two
        # people would otherwise share a title - strip it for display.
        title = re.sub(r"\s*\([^)]*\)\s*$", "", hewiki["title"]).strip()
        # Every existing entry uses the Hebrew geresh (׳) for the "tz/ch"
        # sound, not a straight quote - some Wikipedia editors use the
        # ASCII one instead, so normalize for visual consistency.
        title = title.replace("'", "׳")
        if title:
            return title
    return None


def _ascii_fold(s):
    """'Sánchez' -> 'sanchez': decompose accents (NFKD splits 'á' into
    'a' + a combining mark) before dropping non-ASCII-letter chars, so
    the base letter survives instead of vanishing with its accent."""
    decomposed = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"[^a-zA-Z]", "", decomposed).lower()


def display_slice(hebrew_title, web_name, first_name, second_name):
    """Wikidata's title is the player's full name, but every other
    entry in names-he.js is just the web_name-equivalent part - usually
    the surname, occasionally the first name for players who go by it
    (web_name itself already made that call, and FPL's first/second
    name fields sometimes carry an extra middle name web_name drops,
    e.g. web_name "Florentino" for first_name "Florentino Ibrain"). Match
    web_name against a single word of either side rather than the whole
    field, and take the corresponding single word of the Hebrew title;
    if nothing lines up cleanly, keep the whole title rather than guess
    which word(s) to drop."""
    words = hebrew_title.split()
    if not words:
        return hebrew_title
    wn = _ascii_fold(web_name)
    second_words = (second_name or "").split()
    if second_words and wn == _ascii_fold(second_words[-1]):
        return words[-1]
    first_words = (first_name or "").split()
    if first_words and wn == _ascii_fold(first_words[0]):
        return words[0]
    return hebrew_title


def resolve_hebrew_names(missing, elements):
    """For each web_name missing from names-he.js, try Wikidata before
    giving up on it entirely. Returns {web_name: hebrew} for whatever
    it could confidently resolve; everything else is left for the
    Telegram alert, same as before this existed."""
    by_web_name = {}
    for p in elements:
        by_web_name.setdefault(p["web_name"], p)
    resolved = {}
    for name in missing:
        p = by_web_name.get(name)
        if not p:
            continue
        full_name = f"{p['first_name']} {p['second_name']}".strip()
        if not full_name:
            continue
        hebrew = hebrew_name_from_wikidata(full_name)
        if hebrew:
            hebrew = display_slice(hebrew, name, p["first_name"], p["second_name"])
            resolved[name] = hebrew
            print(f"names-he: resolved {name} -> {hebrew} via Wikidata")
    return resolved


def update_names_he(resolved):
    """Insert newly-resolved {web_name: hebrew} pairs into
    js/names-he.js, in the same 'PLAYER_NAMES_HE[key] = value' line
    format as every existing entry, keeping alphabetical order where
    the comparison is unambiguous (falls back to appending at the end
    otherwise - harmless, since object key order has no runtime
    effect, only readability)."""
    path = os.path.join(ROOT, "js", "names-he.js")
    with open(path, encoding="utf-8") as f:
        lines = f.readlines()

    def js_string(s):
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"

    for name, hebrew in resolved.items():
        entry_line = f"  {js_string(name)}: {js_string(hebrew)},\n"
        inserted = False
        for i, line in enumerate(lines):
            m = re.match(r"^  '((?:[^'\\]|\\.)*)':", line)
            if m and m.group(1) > name:
                lines.insert(i, entry_line)
                inserted = True
                break
        if not inserted:
            for i in range(len(lines) - 1, -1, -1):
                if lines[i].strip() == "};":
                    lines.insert(i, entry_line)
                    break

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"names-he.js: added {len(resolved)} auto-resolved name(s)")


def report_missing_names(elements):
    """Players whose web_name has no Hebrew mapping in js/names-he.js.
    Tries Wikidata first (see resolve_hebrew_names) and commits
    whatever that resolves straight into names-he.js; only genuine
    misses end up in data/names-missing.json (new signings after
    transfer windows) for the Telegram alert to flag for a manual
    look."""
    try:
        with open(os.path.join(ROOT, "js", "names-he.js"), encoding="utf-8") as f:
            src = f.read()
        keys = set(re.findall(r"^  '((?:[^'\\]|\\.)*)':", src, re.M))
        keys |= set(re.findall(r'^  "([^"]*)":', src, re.M))
    except Exception as e:
        print(f"names-he.js parse failed: {e}", file=sys.stderr)
        return
    missing = sorted({p["web_name"] for p in elements} - keys)
    if missing:
        resolved = resolve_hebrew_names(missing, elements)
        if resolved:
            update_names_he(resolved)
            missing = sorted(set(missing) - set(resolved))
    write("names-missing.json", {"count": len(missing), "names": missing})
    if missing:
        print(f"names-he: {len(missing)} unmapped: {', '.join(missing[:10])}")


def main():
    os.makedirs(DATA_DIR, exist_ok=True)

    bootstrap = fetch("/bootstrap-static/")
    write("bootstrap.json", bootstrap)
    write("fixtures.json", fetch("/fixtures/"))
    snapshot_summaries(bootstrap["elements"])
    append_trends(bootstrap["elements"])
    fetch_elo(bootstrap["teams"])
    snapshot_live(bootstrap)
    report_missing_names(bootstrap["elements"])

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
            snapshot_leagues(entry, team_id)
    except FileNotFoundError:
        pass
    write("myteam.json", team)

    write("meta.json", {"generated_at": datetime.now(timezone.utc).isoformat()})


if __name__ == "__main__":
    main()
