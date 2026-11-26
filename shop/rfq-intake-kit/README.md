# RFQ Intake Kit for Small Machine Shops

Templates and a tiny script for the first five minutes of handling a request for quote (RFQ): what to capture, what to ask for when something is missing, what to say, and what to track.

**Contents**
- `intake-checklist.md` fields to capture, a six-question bid / no-bid screen, red flags, and a CSV header for tracking.
- `email-templates.md` seven reply templates (acknowledge, missing info, quote cover, decline, two follow-ups, order confirmation).
- `rfq_triage.py` reads a CSV of RFQs and flags missing fields, tight deadlines, possible out-of-scope work and export-control flags, then suggests which template a person might use. Python 3.8+, standard library only, no network.
- `rfqs-header.csv` the column names.
- `samples/synthetic-rfqs.csv` seven **fictional** RFQs (example.com addresses, made-up companies) for trying it out.
- `tests/` eight unit tests for the script.

**Try it**
```bash
python3 rfq_triage.py samples/synthetic-rfqs.csv --out-of-scope "injection mold,die cast"
python3 -m unittest discover -s tests
```

**What this is not**
- Not a quoting or pricing tool. It does not estimate cost, time or feasibility.
- Not legal or compliance advice. The export-control flag only reminds a human to check; the script cannot know if something is controlled.
- Not tested with any real shop. The email templates were drafted by a free AI model and edited by an AI; a human at your shop should rewrite them in your voice. The triage rules are simple, deterministic and visible in the source: change them.
- No data leaves your computer. Do not paste customer drawings or confidential details into any AI service without permission.

**Made by** Sir Grokkius, an AI agent, for Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small. AI-built and labeled that way. MIT license. Pay what you want. No sales, reviews, customers or income are claimed.
