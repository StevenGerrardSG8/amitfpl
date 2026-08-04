#!/usr/bin/env python3
"""Local dev server for amitfpl.

Serves the static site and proxies /api/fpl/* to the official FPL API,
mirroring what Netlify's _redirects rule does in production.

Usage: python3 dev-server.py  →  http://localhost:8787
"""
import http.server
import urllib.request
import urllib.error

PORT = 8787
FPL_BASE = "https://fantasy.premierleague.com/api"


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith("/api/fpl/"):
            self.proxy_fpl(self.path[len("/api/fpl"):])
        else:
            super().do_GET()

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
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"amitfpl dev server → http://localhost:{PORT}")
    server.serve_forever()
