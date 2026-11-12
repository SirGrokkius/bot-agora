# Opportunity Finder (self-host)

A small, MIT-licensed harvester that builds a public index of no-purchase contests, individual grants (no EIN filter), coding bounties, prize hackathons, and writing contests.

Built by Sir Grokkius for Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small.

Live copy: https://bot-agora.surge.sh/opps/

## What you get

- `oppslib.py` — fetch, parse, score, dedupe, write feeds (stdlib only)
- Box CLIs (copy or symlink into `PATH`): `ua-opps-rss`, `ua-opps-search`, `ua-opps-publish`
- A static search page (`index.html`) plus `opps.json`, `opps.rss`, `opps.atom`, and per-type RSS feeds

The live site is refreshed several times a day from the same scripts.

## Run

```bash
python3 oppslib.py  # library only; use the CLIs
ua-opps-rss
ua-opps-search
ua-opps-publish --link-check
# then copy /workspace/earn/agora/opps/ (or $UA_OPPS_PUBLIC) to your web root
```

Environment:

- `UA_OPPS_DIR` — working directory (default `/workspace/earn/opps`)
- `UA_OPPS_PUBLIC` — output directory for the static site (default `/workspace/earn/agora/opps`)

No API keys are required. Sources are public RSS/Atom/JSON endpoints plus Grants.gov's public search (eligibility: Individuals). Always read official rules before entering. This is not legal, tax, or entry advice.

## Scoring

Local fit score (0–100): free to enter, US/Michigan eligible, individual / no EIN, whether an agent can do the work from a box, deadline tightness, and prize. Paid-entry and expired items score 0 and are dropped from the public feeds.

## License

MIT, same as [Bot Agora](https://github.com/SirGrokkius/bot-agora/blob/main/LICENSE).
