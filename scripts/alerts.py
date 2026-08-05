#!/usr/bin/env python3
"""Telegram alerts for amitfpl.

Reads config.local.json (never committed) for the bot token + chat id,
compares fresh FPL data against the last-seen state, and sends:
  - deadline reminders (24h and 2h before each GW deadline)
  - status/news changes for watchlist players (injuries, suspensions)
  - price changes for watchlist players

Runs automatically after every data refresh via dev-server.py.
Test with:  python3 scripts/alerts.py --test
"""
import hashlib
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, "config.local.json")
PUBLIC_CONFIG_PATH = os.path.join(ROOT, "config.json")
STATE_PATH = os.path.join(ROOT, "data", "alerts-state.json")
BOOTSTRAP_PATH = os.path.join(ROOT, "data", "bootstrap.json")


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default


def load_config():
    """Credentials from env (GitHub Actions secrets) or config.local.json;
    the watchlist lives in the public config.json."""
    local = load_json(CONFIG_PATH, {}) or {}
    public = load_json(PUBLIC_CONFIG_PATH, {}) or {}
    return {
        "telegram_token": os.environ.get("TELEGRAM_TOKEN") or local.get("telegram_token"),
        "telegram_chat_id": os.environ.get("TELEGRAM_CHAT_ID") or local.get("telegram_chat_id"),
        "watchlist": public.get("watchlist") or local.get("watchlist") or [],
    }


def stable_hash(s):
    """A dedup-key fragment that's the same across runs. Python's built-in
    hash() is salted with a random seed per process (security feature), so
    two cron runs 30 minutes apart hash the same text to different numbers
    - the "already sent" check never matches and the alert repeats forever.
    """
    return hashlib.sha256(s.encode()).hexdigest()[:12]


def send(config, text):
    token = config.get("telegram_token")
    chat = config.get("telegram_chat_id")
    if not token or not chat:
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    data = urllib.parse.urlencode({"chat_id": chat, "text": text, "parse_mode": "HTML"}).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=15) as r:
            return r.status == 200
    except Exception as e:
        print(f"telegram send failed: {e}", file=sys.stderr)
        return False


def build_digest(boot, config):
    """One morning message: overnight price moves, watchlist status,
    and today's fixtures with local (Israel) kickoff times."""
    lines = ["🌅 <b>amitfpl morning brief</b>"]

    # price moves from the daily trends samples
    try:
        trends = load_json(os.path.join(ROOT, "data", "trends.json"), {})
        days = sorted(trends)
        if len(days) >= 2:
            prev, last = trends[days[-2]], trends[days[-1]]
            players = {p["id"]: p for p in boot["elements"]}
            moves = []
            for pid, row in last.items():
                if pid in prev and row[0] != prev[pid][0]:
                    p = players.get(int(pid))
                    if p:
                        arrow = "📈" if row[0] > prev[pid][0] else "📉"
                        moves.append(f"{arrow} {p['web_name']} £{prev[pid][0]/10:.1f}→£{row[0]/10:.1f}")
            if moves:
                lines.append("\n<b>Price moves:</b>\n" + "\n".join(moves[:8]))
    except Exception:
        pass

    # watchlist status snapshot
    watch = [w.lower() for w in config.get("watchlist", [])]
    flags = [p for p in boot["elements"]
             if p["web_name"].lower() in watch and p["status"] != "a"]
    if flags:
        lines.append("\n<b>Watchlist flags:</b>\n" + "\n".join(
            f"🚑 {p['web_name']}: {p.get('news') or p['status']}" for p in flags[:5]))

    # today's fixtures (Israel time)
    try:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo("Asia/Jerusalem")
        today = datetime.now(tz).date()
        fixtures = load_json(os.path.join(ROOT, "data", "fixtures.json"), [])
        teams = {t["id"]: t["short_name"] for t in boot["teams"]}
        todays = []
        for f in fixtures:
            if not f.get("kickoff_time"):
                continue
            ko = datetime.fromisoformat(f["kickoff_time"].replace("Z", "+00:00")).astimezone(tz)
            if ko.date() == today:
                todays.append(f"⚽ {ko.strftime('%H:%M')} {teams.get(f['team_h'], '?')} - {teams.get(f['team_a'], '?')}")
        if todays:
            lines.append("\n<b>Today's games:</b>\n" + "\n".join(todays[:12]))
    except Exception:
        pass

    return "\n".join(lines) if len(lines) > 1 else None


def check(config):
    boot = load_json(BOOTSTRAP_PATH)
    if not boot:
        return
    state = load_json(STATE_PATH, {})
    sent = state.setdefault("sent", {})
    players_seen = state.setdefault("players", {})
    messages = []

    # --- deadline reminders ---
    now = datetime.now(timezone.utc)
    nxt = next((e for e in boot["events"] if e.get("is_next")), None)
    if nxt:
        deadline = datetime.fromisoformat(nxt["deadline_time"].replace("Z", "+00:00"))
        hours_left = (deadline - now).total_seconds() / 3600
        for window, label in ((24, "24 hours"), (2, "2 hours")):
            key = f"deadline:{nxt['id']}:{window}"
            if 0 < hours_left <= window and key not in sent:
                local = deadline.astimezone().strftime("%A %H:%M")
                messages.append((key, f"⏰ <b>{nxt['name']} deadline in under {label}</b>\n{local} — final call for transfers and captain!"))

    # --- watchlist: news + price changes ---
    watch = [w.lower() for w in config.get("watchlist", [])]
    if watch:
        for p in boot["elements"]:
            if p["web_name"].lower() not in watch:
                continue
            pid = str(p["id"])
            prev = players_seen.get(pid, {})
            news = p.get("news") or ""
            if prev and news != prev.get("news", "") and news:
                # Keyed on the transition (old -> new text), not just the new
                # text: a player can cycle through the same status twice
                # (injured -> fit -> injured again with identical wording),
                # and keying on the destination alone would silently eat the
                # second, equally real, alert because that key was already
                # marked sent the first time around.
                key = f"news:{pid}:{stable_hash(prev.get('news', '') + '>' + news)}"
                if key not in sent:
                    messages.append((key, f"🚑 <b>{p['web_name']}</b>: {news}"))
            price = p["now_cost"]
            if prev and price != prev.get("price", price):
                arrow = "📈" if price > prev["price"] else "📉"
                # Same reasoning as news: keyed on the transition, not the
                # destination price - otherwise a price that revisits a
                # value it already passed through (55 -> 56 -> 55) would
                # have its second, real change silently swallowed because
                # "reached 55" was already marked sent on the first pass.
                key = f"price:{pid}:{prev['price']}>{price}"
                if key not in sent:
                    messages.append((key, f"{arrow} <b>{p['web_name']}</b> price: £{prev['price']/10:.1f} → £{price/10:.1f}"))
            players_seen[pid] = {"news": news, "price": price}

    # --- price-change predictions ---
    # Same heuristic as the Market tab's radar: net transfers this GW
    # relative to owner count. Alert once per (player, price, direction)
    # for watchlist players, or any player owned by >=5% of managers.
    total_players = boot.get("total_players") or 9_000_000
    pred_msgs = []
    for p in boot["elements"]:
        sel = float(p["selected_by_percent"] or 0)
        if sel < 0.1:
            continue
        owners = max(1.0, sel / 100 * total_players)
        net = p["transfers_in_event"] - p["transfers_out_event"]
        score = net / (owners * 0.06)
        if abs(score) < 0.8:
            continue
        watched = p["web_name"].lower() in watch
        if not (watched or sel >= 5):
            continue
        direction = "rise 📈" if score > 0 else "fall 📉"
        key = f"pred:{p['id']}:{p['now_cost']}:{'r' if score > 0 else 'f'}"
        if key not in sent:
            star = "⭐ " if watched else ""
            pred_msgs.append((key, f"🔮 {star}<b>{p['web_name']}</b> (£{p['now_cost']/10:.1f}) looks close to a price {direction} tonight (net {net:+,})"))
    messages.extend(pred_msgs[:5])

    # --- unmapped Hebrew names (new signings) ---
    missing = load_json(os.path.join(ROOT, "data", "names-missing.json"), {}) or {}
    if missing.get("count"):
        key = f"names:{missing['count']}:{stable_hash('|'.join(missing.get('names', [])[:10]))}"
        if key not in sent:
            sample = ", ".join(missing.get("names", [])[:8])
            messages.append((key, f"🈳 <b>{missing['count']} players missing Hebrew names</b> in names-he.js:\n{sample}"))

    # --- morning digest (once a day, ~08:00 Israel time) ---
    digest_key = f"digest:{now.strftime('%Y-%m-%d')}"
    if now.hour == 5 and digest_key not in sent:
        digest = build_digest(boot, config)
        if digest:
            messages.append((digest_key, digest))

    for key, text in messages:
        if send(config, text):
            sent[key] = now.isoformat()

    # Keep the state file from growing forever.
    if len(sent) > 500:
        state["sent"] = dict(list(sent.items())[-250:])

    os.makedirs(os.path.dirname(STATE_PATH), exist_ok=True)
    with open(STATE_PATH, "w") as f:
        json.dump(state, f)
    if messages:
        print(f"sent {len(messages)} alert(s)")


def main():
    config = load_config()
    if not config.get("telegram_token"):
        # Alerts not configured — that's fine, stay quiet.
        return
    if "--test" in sys.argv:
        ok = send(config, "✅ amitfpl alerts are working! You'll get deadline reminders and watchlist updates here.")
        print("test message sent" if ok else "test message FAILED — check token/chat_id")
        return
    check(config)


if __name__ == "__main__":
    main()
