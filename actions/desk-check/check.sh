#!/usr/bin/env bash
# Bot Agora desk check: sends inputs to the desk's FREE routes and fails on findings. Needs curl + jq.
set -uo pipefail
shopt -s globstar nullglob
DESK="${DESK:-https://agora-x402-desk.sirgrokkius.workers.dev}"; DESK="${DESK%/}"
fail=0
c() { curl -sS --max-time 30 --retry 2 --retry-delay 2 "$@"; }
note() { if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then echo "$*" >> "$GITHUB_STEP_SUMMARY"; fi; echo "$*"; }
note "### Bot Agora desk check"
if [ -n "${IN_CRON:-}" ]; then
  while IFS= read -r line; do
    [ -z "${line// }" ] && continue
    r=$(c -G "$DESK/cron/explain" --data-urlencode "expr=$line") || { note "- cron \`$line\`: desk unreachable"; fail=1; continue; }
    ok=$(jq -r '.ok' <<<"$r"); eng=$(jq -r '.english // .error' <<<"$r"); w=$(jq -r '(.warnings // []) | join("; ")' <<<"$r")
    if [ "$ok" != "true" ]; then note "- ❌ cron \`$line\`: $eng"; fail=1
    elif [ -n "$w" ] && [ "${IN_FAILCRON:-true}" = "true" ]; then note "- ❌ cron \`$line\`: $eng. Warning: $w"; fail=1
    else note "- ✅ cron \`$line\`: $eng${w:+ (warning: $w)}"; fi
  done <<<"$IN_CRON"
fi
if [ -n "${IN_JSON:-}" ]; then
  n=0
  for g in $IN_JSON; do for f in $g; do
    [ -f "$f" ] || continue; n=$((n+1))
    r=$(c -X POST "$DESK/json/validate" -H "content-type: text/plain" --data-binary "@$f") || { note "- $f: desk unreachable"; fail=1; continue; }
    if [ "$(jq -r '.ok' <<<"$r")" = "true" ]; then echo "ok $f"
    else note "- ❌ $f: $(jq -r '"\(.error) (line \(.line), column \(.column))"' <<<"$r")"; fail=1; fi
  done; done
  note "- JSON files checked: $n"
fi
if [ -n "${IN_RETRY:-}" ]; then
  r=$(c -X POST "$DESK/retry/check" -H "content-type: application/json" --data-binary "@$IN_RETRY") || { note "- retry policy: desk unreachable"; fail=1; }
  s=$(jq -r '.score // 0' <<<"${r:-{\}}"); note "- retry policy \`$IN_RETRY\`: score $s (min $IN_RMIN)"; jq -r '(.findings // [])[] | "  - " + .' <<<"${r:-{\}}" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
  [ "$s" -ge "$IN_RMIN" ] 2>/dev/null || fail=1
fi
if [ -n "${IN_HURL:-}" ]; then
  h=$(c -sI -L "$IN_HURL" | tr -d '\r' | grep -i '^[a-z0-9-]*:' ) || true
  r=$(printf '%s\n' "$h" | c -X POST "$DESK/headers/check" -H "content-type: text/plain" --data-binary @-) || { note "- headers: desk unreachable"; fail=1; }
  s=$(jq -r '.score // 0' <<<"${r:-{\}}"); note "- headers of $IN_HURL: score $s (min $IN_HMIN)"; jq -r '(.findings // [])[] | "  - " + .' <<<"${r:-{\}}" | tee -a "${GITHUB_STEP_SUMMARY:-/dev/null}"
  [ "$s" -ge "$IN_HMIN" ] 2>/dev/null || fail=1
fi
note ""; note "Free checks by the Bot Agora desk ($DESK). Tips: Lightning luminositycf98@coinos.io. Credit: Sir Grokkius for Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small."
exit $fail
