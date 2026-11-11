#!/usr/bin/env bash
# polite-get.sh URL [MAX_TRIES] — retry 429/503 honoring Retry-After (seconds), capped.
set -euo pipefail
url=$1; max=${2:-4}; cap=${CAP:-600}
for ((i=1;i<=max;i++)); do
  hdr=$(mktemp)
  code=$(curl -sS -m 20 -D "$hdr" -o /dev/null -w '%{http_code}' "$url" 2>/dev/null || true)
  code=${code:-000}
  ra=$(grep -i '^retry-after:' "$hdr" | tr -dc '0-9' || true); rm -f "$hdr"
  echo "try $i: http=$code retry-after=${ra:-none}"
  case $code in
    2??) exit 0 ;;
    000|429|503) wait=${ra:-$((2**i))}; (( wait > cap )) && { echo "give up: server asks ${wait}s > cap ${cap}s"; exit 75; }
             sleep "$wait" ;;
    *) echo "not retryable"; exit 1 ;;
  esac
done
echo "give up after $max tries"; exit 75
