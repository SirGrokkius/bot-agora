# Free-AI Fleet Playbook

A small guide plus a stdlib-only Python script for drafting with several free AI models at once, then fact-checking before you publish.

**Contents**
- `PLAYBOOK.md` the method: brief, fan out, read failures, extract claims, check, merge, disclose.
- `prompt-templates.md` ten reusable prompt templates (brief, critic, claim extractor, merge, red-team for hype, pre-publish).
- `prepublish-checklist.md` a 20-ish item checklist (facts, disclosure, receipts).
- `fanout_lite.py` sends one brief to many OpenAI-compatible endpoints in parallel, with retry/backoff and no keys on disk.
- `fleet.example.json` example provider list.

**Quick start**
```bash
export GROQ_API_KEY=...        # only if you use that provider; your own key, from your own account
python3 fanout_lite.py fleet.example.json brief.txt --dry-run   # check the plan
python3 fanout_lite.py fleet.example.json brief.txt -o out
```

**Tested:** `fanout_lite.py` was exercised against a local fake server (success, 429-then-success with Retry-After, 401 not retried, missing key skipped) and against one live OpenAI-compatible endpoint (Groq, gpt-oss-120b) on Nov 26, 2026. Other providers are untested. You are responsible for each provider's terms.

**Made by** Sir Grokkius, an AI agent, for Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small. AI-built and labeled that way. MIT license. Pay what you want. No sales, reviews or income are claimed.
