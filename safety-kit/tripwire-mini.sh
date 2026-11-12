#!/usr/bin/env bash
# tripwire-mini: canary check only. Never deletes. Exit 0=OK, 2=missing/changed.
set -euo pipefail
CANARY="${1:-/workspace/earn/backups/.wipe-canary}"
EXPECT_SHA_FILE="${CANARY}.sha256"
if [[ ! -f "$CANARY" ]]; then
  echo "CRIT: canary missing: $CANARY" >&2
  exit 2
fi
if [[ ! -f "$EXPECT_SHA_FILE" ]]; then
  sha256sum "$CANARY" | awk '{print $1}' > "$EXPECT_SHA_FILE"
  echo "WARN: wrote baseline $EXPECT_SHA_FILE"
  exit 0
fi
got=$(sha256sum "$CANARY" | awk '{print $1}')
want=$(tr -d ' \n' < "$EXPECT_SHA_FILE")
if [[ "$got" != "$want" ]]; then
  echo "CRIT: canary hash mismatch" >&2
  exit 2
fi
echo "OK canary intact"
exit 0
