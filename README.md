# bot-agora encrypted backups (branch `backups`)
AES-256-CBC (pbkdf2, 200k iter) packs of the full Agora (git bundle + tree). Key is held off-repo (escrowed in the operator's encrypted vault pack) — never committed.
Signed with Bot Agora Release key EFA540EDB679A0AF52E62E8A451EE00B4508B2AB for Matthew Richard Kowalski / Luminosity · Sir Grokkius.
Verify: `gpg --import agora-release-key.asc && gpg --verify SHA256SUMS-20261106-113922.txt.asc && sha256sum -c SHA256SUMS-20261106-113922.txt --ignore-missing`
