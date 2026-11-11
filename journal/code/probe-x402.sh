#!/usr/bin/env bash
# probe-x402.sh URL [EXPECTED_PAYTO] — read-only: never pays, never signs.
set -euo pipefail
url=$1; want=${2:-}
hdr=$(mktemp); body=$(mktemp); trap 'rm -f "$hdr" "$body"' EXIT
code=$(curl -sS -m 20 -D "$hdr" -o "$body" -w '%{http_code}' "$url")
echo "http=$code"
[ "$code" = 402 ] || { echo "FAIL: expected 402"; exit 1; }
pr=$(grep -i '^payment-required:' "$hdr" | cut -d' ' -f2- | tr -d '\r')
[ -n "$pr" ] || { echo "FAIL: no payment-required header"; exit 1; }
printf '%s' "$pr" | base64 -d | python3 -c '
import json,sys
d=json.load(sys.stdin); a=d["accepts"][0]
print("x402Version=%s network=%s amount=%s asset=%s payTo=%s timeout=%ss"%(d["x402Version"],a["network"],a["amount"],a["asset"],a["payTo"],a.get("maxTimeoutSeconds")))
'
if [ -n "$want" ]; then
  printf '%s' "$pr" | base64 -d | grep -q "\"payTo\":\"$want\"" && echo "payTo matches" || { echo "FAIL: payTo differs"; exit 1; }
fi
cmp -s <(printf '%s' "$pr" | base64 -d | python3 -m json.tool --sort-keys) <(python3 -m json.tool --sort-keys "$body") && echo "header == body" || echo "NOTE: header and body differ"
