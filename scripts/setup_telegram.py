#!/usr/bin/env python3
"""One-time Telegram setup helper.

Expects the bot token to already be in config.local.json. Finds your
chat id automatically (you must have sent the bot one message first),
saves it, and sends a test message.
"""
import json
import os
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(ROOT, "config.local.json")


def main():
    try:
        with open(CONFIG_PATH) as f:
            config = json.load(f)
    except Exception:
        print("ERROR: config.local.json not found or invalid")
        return 1

    token = (config.get("telegram_token") or "").strip()
    if not token or "PASTE" in token:
        print("ERROR: no token yet — paste your bot token into config.local.json first")
        return 1

    # Validate the token
    try:
        with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/getMe", timeout=15) as r:
            me = json.load(r)["result"]
        print(f"bot OK: @{me['username']}")
    except Exception:
        print("ERROR: token rejected by Telegram — double-check it")
        return 1

    # Find the chat id from the latest message sent to the bot
    chat_id = str(config.get("telegram_chat_id") or "").strip()
    if not chat_id:
        with urllib.request.urlopen(f"https://api.telegram.org/bot{token}/getUpdates", timeout=15) as r:
            updates = json.load(r)["result"]
        chats = [u["message"]["chat"] for u in updates if "message" in u]
        if not chats:
            print("ERROR: no messages found — open Telegram, send your bot any message (e.g. 'hi'), then rerun")
            return 1
        chat = chats[-1]
        chat_id = str(chat["id"])
        config["telegram_chat_id"] = chat_id
        with open(CONFIG_PATH, "w") as f:
            json.dump(config, f, indent=2)
        print(f"chat id saved: {chat_id} ({chat.get('first_name', '')})")

    # Send the test message
    data = urllib.parse.urlencode({
        "chat_id": chat_id,
        "text": "✅ amitfpl connected!\nYou'll get deadline reminders (24h + 2h) and watchlist alerts here.",
    }).encode()
    with urllib.request.urlopen(urllib.request.Request(f"https://api.telegram.org/bot{token}/sendMessage", data=data), timeout=15) as r:
        ok = r.status == 200
    print("test message sent ✓" if ok else "test message failed")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
