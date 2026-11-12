#!/usr/bin/env bash
# deploy.sh SP...  — set YOUR Stacks address as pay-to, name the worker, deploy, smoke-test.
# Usage: ./deploy.sh SPXXXXXXXX [worker-name]     (run `npx wrangler login` once first)
set -euo pipefail
ADDR="${1:?usage: ./deploy.sh SP...yourStacksMainnetAddress [worker-name]}"
NAME="${2:-my-x402-desk}"
[[ "$ADDR" =~ ^SP[0-9A-Z]{38,40}$ ]] || { echo "not a Stacks mainnet SP address: $ADDR" >&2; exit 2; }
[[ "$NAME" =~ ^[a-z0-9-]{3,60}$ ]] || { echo "worker name: lowercase letters, digits, dashes" >&2; exit 2; }
cd "$(dirname "$0")"
[[ -d node_modules ]] || npm install --no-audit --no-fund
OLD=SP3V8GHRCG9N7TN3QB9RZD7V31PQ2CPQY8Q2DGFY0   # reference desk's address; replaced with yours
sed -i.bak "s/$OLD/$ADDR/g" wrangler.jsonc src/server.ts && rm -f wrangler.jsonc.bak src/server.ts.bak
sed -i.bak "s/\"name\": \"[^\"]*\"/\"name\": \"$NAME\"/" wrangler.jsonc && rm -f wrangler.jsonc.bak
grep -q "$ADDR" src/server.ts || { echo "pay-to replace failed" >&2; exit 3; }
OUT=$(npx wrangler deploy 2>&1 | tee /dev/stderr)
URL=$(grep -oE 'https://[a-z0-9.-]+\.workers\.dev' <<<"$OUT" | head -1)
[[ -n "$URL" ]] || { echo "deployed? no workers.dev URL found (pick a subdomain once in the dashboard: Workers & Pages > Overview)" >&2; exit 4; }
echo "health: $(curl -s -m 20 "$URL/health")"
echo "paywall: HTTP $(curl -s -m 20 -o /dev/null -w '%{http_code}' "$URL/ask?question=ping") (402 = good)"
echo "Live: $URL   catalog: $URL/catalog"
echo "Edit BASE / INFO in src/server.ts to describe your desk, then redeploy with: npx wrangler deploy"
