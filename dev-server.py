#!/usr/bin/env python3
"""Local dev server for amitfpl.

Serves the static site and keeps data fresh, mirroring production:
 - proxies /api/fpl/* to the official FPL API (like Netlify/_redirects would)
 - refreshes data/*.json snapshots on startup and every 30 minutes
   (like the GitHub Action does in the cloud)
 - POST/GET /api/refresh-now triggers an immediate snapshot refresh
   (the site's refresh button calls this when available)

Usage: python3 dev-server.py  →  http://localhost:8787
"""
import http.server
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

PORT = 8787
FPL_BASE = "https://fantasy.premierleague.com/api"
ROOT = Path(__file__).resolve().parent
REFRESH_EVERY_S = 30 * 60

_refresh_lock = threading.Lock()


def refresh_snapshots():
    """Run scripts/fetch_data.py; returns True on success."""
    with _refresh_lock:
        try:
            subprocess.run(
                [sys.executable, str(ROOT / "scripts" / "fetch_data.py")],
                check=True, capture_output=True, timeout=120,
            )
            return True
        except Exception as e:
            print(f"snapshot refresh failed: {e}", file=sys.stderr)
            return False


def run_alerts():
    """Telegram alerts (no-op unless config.local.json is set up)."""
    try:
        subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "alerts.py")],
            capture_output=True, timeout=60,
        )
    except Exception:
        pass


def refresh_loop():
    while True:
        refresh_snapshots()
        run_alerts()
        time.sleep(REFRESH_EVERY_S)


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Force revalidation so edits show up on refresh (the browser's
        # heuristic caching otherwise serves stale JS/data).
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith("/api/fpl/"):
            self.proxy_fpl(self.path[len("/api/fpl"):])
        elif self.path == "/api/refresh-now":
            self.refresh_now()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == "/api/refresh-now":
            self.refresh_now()
        else:
            self.send_response(404)
            self.end_headers()

    def refresh_now(self):
        ok = refresh_snapshots()
        body = b'{"ok": true}' if ok else b'{"ok": false}'
        self.send_response(200 if ok else 502)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def proxy_fpl(self, path):
        url = FPL_BASE + path
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (amitfpl dev)"})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                body = resp.read()
                self.send_response(resp.status)
                self.send_header("Content-Type", resp.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.end_headers()
        except Exception:
            self.send_response(502)
            self.end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the console quiet


if __name__ == "__main__":
    threading.Thread(target=refresh_loop, daemon=True).start()
    # Bind to all interfaces so phones/tablets on the same Wi-Fi can
    # open the app at http://<this-mac's-ip>:8787
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"amitfpl dev server → http://localhost:{PORT} (data auto-refreshes every 30 min)")
    server.serve_forever()
