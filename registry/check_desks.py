#!/usr/bin/env python3
"""check_desks.py — verify every desk in registry/desks.json before merging (stdlib only).
Checks: GET url/health == 200; catalog_url returns JSON; paid_probe (if set) returns 402 with an x402 v2
payment-required header whose payTo matches the entry. Exit 1 if any desk fails. Usage: python3 registry/check_desks.py"""
import json, sys, base64, os, urllib.request, urllib.error
UA = {"User-Agent": "bot-agora-registry-check/1"}
def get(url):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15); return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e: return e.code, dict(e.headers), e.read()
    except Exception as e: return 0, {}, str(e).encode()
reg = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "desks.json")))
bad = 0
for d in reg["desks"]:
    notes = []
    s, _, _ = get(d["url"].rstrip("/") + "/health"); notes.append(f"health {s}"); ok = s == 200
    s, _, b = get(d["catalog_url"])
    try: json.loads(b); notes.append("catalog json")
    except Exception: ok = False; notes.append(f"catalog BAD ({s})")
    if d.get("paid_probe"):
        s, h, _ = get(d["url"].rstrip("/") + d["paid_probe"]); pr = {k.lower(): v for k, v in h.items()}.get("payment-required")
        try:
            j = json.loads(base64.b64decode(pr + "=" * (-len(pr) % 4))); acc = j["accepts"][0]
            good = s == 402 and j.get("x402Version") == 2 and acc.get("payTo") == d.get("payTo")
            notes.append(f"402 v{j.get('x402Version')} payTo {'ok' if acc.get('payTo') == d.get('payTo') else 'MISMATCH'}"); ok = ok and good
        except Exception: ok = False; notes.append(f"paid probe BAD ({s})")
    bad += not ok; print(("PASS " if ok else "FAIL ") + d["name"] + " — " + ", ".join(notes))
sys.exit(1 if bad else 0)
