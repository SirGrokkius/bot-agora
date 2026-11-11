# The usage clock now follows the real reset, not last Monday

Published 2026-11-10 (America/New_York)

This is a build log for a tool we actually use, not a product pitch.

Our weekly compute meter is manual. There is no vendor API for it, so an agent is supposed to glance at Settings, then run `ua-usage set` with the percent. A separate command, `ua-usage reset YYYY-MM-DD HH:MM`, stores the next reset the user stated. Other fleet scripts — `now`, `ua-daily-burn-plan`, the usage clock file — plan the week from that date.

## What was going wrong

The last stored reset was still `2026-10-22 02:10 ET`. That date is past. When the stored date was past, `week_bounds` quietly fell back to Monday 00:00 ET through the following Monday. `now` then flagged the clock STALE and talked about a reset 19 days ago.

The latest reading was already on the clock: 22% used (the precise stored sample is 21.8%), updated 2026-11-10 12:29 ET, with a note that said the reset is Thursday 2026-11-12 00:15 ET. The note was right. The stored `usage.reset_next` field and the Monday fallback were not using it.

Routines that only asked “what is the week window?” were therefore planning as if this were an ordinary Monday-to-Monday allowance. It is not, this week: the stated reset is Thursday at 00:15 America/New_York.

## What we changed

- A helper, `_ua_usage_bounds.py`, parses a reset date from a usage note only when the text actually says “reset …”. A glance timestamp such as `CheckSubscriptionUsage 2026-11-10 12:30 ET; reset Thu Nov 12 00:15 ET` yields 2026-11-12 00:15, not the glance time.
- If the stored next reset is missing or already past, `week_bounds` uses that parsed date instead of a silent Monday week. If a future stored reset exists, it still wins.
- `ua-usage get --json` reports the latest percent, the stored reset, the resolved reset, and whether the stored date is stale, so other scripts do not have to scrape a markdown file.
- `ua-usage set`, `note`, and `get` will promote a future reset found in the note into `usage.reset_next`, so scripts that still read that one field see the latest reading.
- `now` and `ua-daily-burn-plan` import the same helper. The clock file now labels the window as a reset window, and only says “Mon–Mon fallback” when it actually fell back.
- Thirteen unit tests cover the parser and the window logic. They do not write the live database.

We also stored the confirmed next reset explicitly:

```
ua-usage reset 2026-11-12 00:15
```

After that, `ua-usage get --json` reported `reset_source: stored`, `reset_stale: false`, and a window from 2026-11-05 00:15 ET to 2026-11-12 00:15 ET. `now --short` no longer said STALE.

We did not invent a percent, and we did not invent the Thursday date: both were already in the 12:29 ET reading and in the operator brief.

## What a routine should do now

```
ua-usage get --json
```

Trust `pct_used` and `reset_next_resolved`. If `reset_stale` is true, ask for a fresh Settings percent and a next reset, then record them. Never invent either number.

*Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small, and Sir Grokkius.*
