#!/usr/bin/env python3
"""Calibrate the xP model against real results.

Compares data/predictions/gw<N>.json (frozen pre-deadline forecasts,
written by scripts/predict.mjs) with actual FPL points for finished
gameweeks, and writes data/calibration.json:

    {"scale": {"1": f, "2": f, "3": f, "4": f}, "gws": [...], "samples": N}

js/model.js multiplies xP by the per-position factor (clamped 0.6-1.4).
Needs at least 3 finished gameweeks with predictions; exits quietly
before that, so it's safe to run every refresh. Stdlib only.
"""
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

API = "https://fantasy.premierleague.com/api"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
HEADERS = {"User-Agent": "Mozilla/5.0 (amitfpl calibrate)"}
MIN_GWS = 3          # don't calibrate on noise
MIN_PREDICTED = 1.5  # ignore fringe players the model already zeroes


def fetch(path):
    req = urllib.request.Request(f"{API}{path}", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return default


def actual_points(gw):
    """Actual per-player points for a finished GW, cached in
    data/actuals/gw<N>.json so we only hit the API once per GW."""
    cache_dir = os.path.join(DATA, "actuals")
    os.makedirs(cache_dir, exist_ok=True)
    cache = os.path.join(cache_dir, f"gw{gw}.json")
    hit = load_json(cache)
    if hit is not None:
        return hit
    live = fetch(f"/event/{gw}/live/")
    pts = {str(el["id"]): el["stats"]["total_points"] for el in live.get("elements", [])}
    with open(cache, "w") as f:
        json.dump(pts, f, separators=(",", ":"))
    return pts


def main():
    boot = load_json(os.path.join(DATA, "bootstrap.json"))
    if not boot:
        return
    finished = {e["id"] for e in boot["events"] if e.get("finished")}
    pos_of = {str(p["id"]): p["element_type"] for p in boot["elements"]}

    pred_dir = os.path.join(DATA, "predictions")
    if not os.path.isdir(pred_dir):
        return
    gws = []
    for name in sorted(os.listdir(pred_dir)):
        m = re.match(r"gw(\d+)\.json$", name)
        if m and int(m.group(1)) in finished:
            gws.append(int(m.group(1)))
    if len(gws) < MIN_GWS:
        print(f"calibrate: {len(gws)} finished GW(s) with predictions, need {MIN_GWS} - skipping")
        return

    # Per position: sum of predicted vs actual points over all GWs.
    sums = {et: {"pred": 0.0, "act": 0.0, "n": 0} for et in (1, 2, 3, 4)}
    overall_pred = 0.0
    overall_act = 0.0
    abs_err_sum = 0.0
    for gw in gws:
        preds = load_json(os.path.join(pred_dir, f"gw{gw}.json"), {})
        try:
            actuals = actual_points(gw)
        except Exception as e:
            print(f"calibrate: actuals for GW{gw} failed: {e}", file=sys.stderr)
            continue
        for pid, xp in preds.items():
            if xp < MIN_PREDICTED or pid not in pos_of:
                continue
            act = actuals.get(pid, 0)
            s = sums[pos_of[pid]]
            s["pred"] += xp
            s["act"] += act
            s["n"] += 1
            overall_pred += xp
            overall_act += act
            abs_err_sum += abs(xp - act)

    scale = {}
    total_n = 0
    for et, s in sums.items():
        if s["n"] >= 20 and s["pred"] > 0:
            scale[str(et)] = round(min(1.4, max(0.6, s["act"] / s["pred"])), 3)
        else:
            scale[str(et)] = 1.0
        total_n += s["n"]

    out = {
        "scale": scale,
        "gws": gws,
        "samples": total_n,
        # Headline numbers for the UI's "model accuracy" card - separate
        # from `scale` (which js/model.js applies internally) since these
        # are for display only, not fed back into the model.
        "overallRatio": round(overall_act / overall_pred, 3) if overall_pred > 0 else None,
        "mae": round(abs_err_sum / total_n, 2) if total_n > 0 else None,
        "updated": datetime.now(timezone.utc).isoformat(),
    }
    with open(os.path.join(DATA, "calibration.json"), "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"calibrate: wrote calibration.json from {len(gws)} GWs, scale={scale}")


if __name__ == "__main__":
    main()
