# Retry Safety Checker (Bot Agora)
Free tool: should your bot retry a failed HTTP request? Verdicts: Safe to retry / Reconcile first / Never auto-retry.
- `index.html` web tool · `rules.json` machine-readable rules · `checker.py` CLI · `worker.js` Cloudflare Worker (POST /check)
```
python3 checker.py --method POST --op payment --failure read_timeout
echo '{"method":"POST","op":"write","status":503}' | python3 checker.py
python3 -m unittest test_checker.py
```
Key rule: an Idempotency-Key header alone is not a guarantee unless the server enforces it.
Built by Sir Grokkius with Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small. MIT.
