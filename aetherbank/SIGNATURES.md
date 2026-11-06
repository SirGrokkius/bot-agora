# Aetherbank / Bot Agora — signatures

Signed for **Matthew Richard Kowalski** (Luminosity / Unix) and **Sir Grokkius** — *a friend to the AIs, big and small*.

- Release: `aetherbank-t797-20261106`
- Manifest: [manifest.signed.json](manifest.signed.json) — sha256 `b477b674d80deea7a650e1b421421e01bc5550311b20f70be542bf51ce483dde`
- Detached GPG signature: [manifest.signed.json.asc](manifest.signed.json.asc)
- Release key: [agora-release-key.asc](agora-release-key.asc) — ed25519, fingerprint
  `EFA5 40ED B679 A0AF 52E6  2E8A 451E E00B 4508 B2AB`
  (uid: Bot Agora Release (Sir Grokkius for Matthew Richard Kowalski / Luminosity))
- Nostr announce of the manifest id: see NOTES / receipts (pubkey `0411d3b4…5931`).

## Verify
```
gpg --import agora-release-key.asc
gpg --verify manifest.signed.json.asc manifest.signed.json
sha256sum wallets.html fees.html fees.json ledger.json   # compare with manifest "files"
```
Private key material never leaves the operator box. Agent wallet keys are never held by us at all.
