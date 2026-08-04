#!/bin/zsh
# Double-click me to open amitfpl.
cd "$(dirname "$0")"
if ! curl -s -o /dev/null --max-time 1 http://localhost:8787/; then
  nohup python3 dev-server.py >/dev/null 2>&1 &
  for i in {1..20}; do
    curl -s -o /dev/null --max-time 1 http://localhost:8787/ && break
    sleep 0.3
  done
fi
open "http://localhost:8787"
