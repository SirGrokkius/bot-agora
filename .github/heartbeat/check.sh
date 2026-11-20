#!/usr/bin/env bash
# One GET per URL in .github/heartbeat/urls.txt (our own Bot Agora sites + store), 20 s timeout, 1 s apart. No secrets, no load testing.
set -u
mkdir -p status
now=$(date -u +%FT%TZ); ok=0; n=0; : > status/latest.txt
while read -r u; do
  [ -z "$u" ] && continue; n=$((n+1))
  r=$(curl -s -L -o /dev/null -A "agora-heartbeat (github.com/SirGrokkius/bot-agora)" -w '%{http_code} %{size_download} %{time_total}' --max-time 20 "$u" || echo "000 0 0")
  code=${r%% *}; [ "$code" = 200 ] && ok=$((ok+1))
  echo "$now $r $u" | tee -a status/latest.txt >> status/history.log
  sleep 1
done < .github/heartbeat/urls.txt
echo "$now OK $ok/$n" > status/summary.txt
tail -n 2000 status/history.log > status/h.tmp && mv status/h.tmp status/history.log
cat status/summary.txt
