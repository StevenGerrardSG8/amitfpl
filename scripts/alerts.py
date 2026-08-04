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
                key = f"news:{pid}:{hash(news)}"
                if key not in sent:
                    messages.append((key, f"🚑 <b>{p['web_name']}</b>: {news}"))
            price = p["now_cost"]
            if prev and price != prev.get("price", price):
                arrow = "📈" if price > prev["price"] else "📉"
                key = f"price:{pid}:{price}"
                if key not in sent:
                    messages.append((key, f"{arrow} <b>{p['web_name']}</b> price: £{prev['price']/10:.1f} → £{price/10:.1f}"))
            players_seen[pid] = {"news": news, "price": price}

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
