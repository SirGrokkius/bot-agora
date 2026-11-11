#!/usr/bin/env python3
"""ua-aibtc-new — cheap diff of AIBTC bounties (open + scheduled) vs a seen-list.
Prints only NEW bounties: id, reward, deadline (ET), subs, title, url. No AI, one-ish HTTP call.
  ua-aibtc-new                 print new ones, mark them seen (exit 3 if any new, 0 if none, 1 on fetch error)
  ua-aibtc-new --peek          print new ones, don't mark seen
  ua-aibtc-new --all           print all current (no state change)
  ua-aibtc-new --json          machine output (with --peek/--all ok)
  ua-aibtc-new --file F.json   read API JSON from file (tests) instead of network
Env: UA_AIBTC_SEEN (default /workspace/earn/state/aibtc-seen.json)
"""
import json, os, sys, urllib.request, datetime
from zoneinfo import ZoneInfo
SEEN = os.environ.get("UA_AIBTC_SEEN", "/workspace/earn/state/aibtc-seen.json")
API = "https://aibtc.com/api/bounties?status={st}&limit=100"
ET = ZoneInfo("America/New_York")

def fetch(st):
    req = urllib.request.Request(API.format(st=st), headers={"User-Agent": "ua-aibtc-new/1"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r).get("bounties", [])

def et(iso):
    try:
        return datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone(ET).strftime("%a %b %d %I:%M %p ET")
    except Exception:
        return iso or "?"

def main(a):
    peek = "--peek" in a; allm = "--all" in a; js = "--json" in a
    rows = []
    try:
        if "--file" in a:
            rows = json.load(open(a[a.index("--file") + 1])).get("bounties", [])
        else:
            for st in ("open", "scheduled"):
                rows += fetch(st)
    except Exception as e:
        print(f"ua-aibtc-new: fetch error: {e}", file=sys.stderr); return 1
    seen = {}
    if os.path.exists(SEEN):
        try: seen = json.load(open(SEEN))
        except Exception: seen = {}
    first_run = not os.path.exists(SEEN)
    out = rows if allm else [b for b in rows if b.get("id") not in seen]
    if js:
        print(json.dumps([{k: b.get(k) for k in ("id","title","rewardSats","expiresAt","opensAt","submissionCount","status")} for b in out], indent=1))
    else:
        for b in out:
            print(f"NEW {b.get('rewardSats')} sats | due {et(b.get('expiresAt'))} | subs {b.get('submissionCount')} | {b.get('status','')} | {b.get('title','')[:100]}\n    https://aibtc.com/bounty/{b.get('id')}")
        if not out: print("ua-aibtc-new: no new bounties" + (" (first run seeds seen-list)" if first_run else ""))
    if not peek and not allm:
        now = datetime.datetime.now(ET).isoformat(timespec="minutes")
        for b in rows: seen.setdefault(b.get("id"), now)
        os.makedirs(os.path.dirname(SEEN), exist_ok=True)
        tmp = SEEN + ".tmp"; json.dump(seen, open(tmp, "w"), indent=0); os.replace(tmp, SEEN)
    return 3 if (out and not allm) else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
