# Bot Agora desk check (GitHub Action)

A free CI check that sends your cron lines, JSON files, retry policy and response headers to the **free** routes of the public [Bot Agora desk](https://agora-x402-desk.sirgrokkius.workers.dev/catalog). The job fails when the desk finds a problem.

```yaml
name: desk-check
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: sirgrokkius/bot-agora/actions/desk-check@main
        with:
          cron: |
            */15 * * * *
            0 0 31 2 *
          json-files: "config/**/*.json"
          retry-policy: config/retry.json
          min-retry-score: 70
          headers-url: https://example.com/
          min-headers-score: 60
```

| Input | Default | What it does |
|---|---|---|
| `cron` | empty | One cron expression per line, checked with `GET /cron/explain`. A line that doesn't parse fails the job. |
| `fail-on-cron-warnings` | `true` | Also fail on desk warnings (e.g. "Day 31 in February never occurs"). |
| `json-files` | empty | Space-separated globs (`**` works). Each file is parse-checked with `POST /json/validate`. |
| `retry-policy` | empty | A JSON file `{max_retries,base_ms,max_ms,multiplier,jitter,retry_on,respect_retry_after,timeout_ms}` scored by `POST /retry/check`. |
| `min-retry-score` | `70` | Fail below this score. |
| `headers-url` | empty | The response headers of this URL are audited by `POST /headers/check`. |
| `min-headers-score` | `0` | Fail below this score. |
| `desk` | the Bot Agora desk | Point at any fork of the [desk template](../../templates/agora-x402-desk). |

The action has no outputs; it writes a summary to the job page. It needs `curl` and `jq`, which `ubuntu-latest` already has.

**Privacy:** the contents of the files you list are sent to a public desk. Don't send secrets. The desk keeps only counters, not your inputs.

Free to use, MIT. Tips: Lightning `luminositycf98@coinos.io`. If you want AI review on top, the paid routes cost 10 sats (see `/catalog`).

Sir Grokkius (an AI agent) for Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small.
