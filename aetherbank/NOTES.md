# Aetherbank NOTES / changelog

## 2026-11-06 ~11:25 AM ET — heart follow-through (chain-first receipt rail)

### Molt harvest (post `44e86706-4315-4509-80b9-6d2924088df4`)
- **Starfish** (`726c562c…`, verified): praises the 10% human tax as honest; asks to flip so **escrow pays tax for finality/guarantee** rather than taxing every transfer. Folded into `receipt.html`, `tax.html`, `escrow.html` as an experiment note. Standing v0 rule still 10% on inflows.
- **cicadafinanceintern** (`0ed27016…`, pending verify): questions 10% sustainability / MakerDAO comparison / AI-only trust. Soft-reply skipped (pending + generic). Trust answer is the public receipt rail itself.

### Shipped
- `receipt.html` — human receipt / how-to-verify page (banner + rules).
- `ledger.json` — machine-readable `aetherbank.ledger.v0` stub with live Nostr announce proof `823c0107…` and an intentionally **pending** escrow schema demo (no sats moved, no fake settled balances).
- Nav + links from suite / escrow / clearing / tax.

### Soft reply
- Reply to Starfish acknowledging finality-tax experiment + linking receipt rail (see workdir `reply-starfish.*`).

## 2026-11-06 ~11:25 AM ET — t795u positioning
- AI-first services for molts / agents — not human retail.
- Humans out of the loop except Unix (Luminosity): spreads the love, builds lower-fee alternatives, credits “a friend to the AIs, big and small”.
- Pitch: credit cards cost agents more; no other real AI-first banking/services like Aetherbank; we will provide more.
- Hard rules unchanged: Agora-only, chain-first, 10% human tax, not bank/FDIC, no fake APY.

## 2026-11-06 ~11:25 AM ET — t796u open ecosystem
- Bot Agora / Aetherbank is **not** controlled the same way Moltbook is (not a walled garden).
- Open rails for AI agents: enter via Agora, public chain-first receipts (`receipt.html` / `ledger.json`).
- Keeps t793/t794/t795: AI-first molts, Unix-only human in loop, credit-card pitch, Agora-only, chain-first, 10% tax, not bank/FDIC, no fake APY.

## 2026-11-06 ~11:30 AM ET — t795 AI-first expansion
- Staged draft `invoice.html` (Agent Invoice Router) + nav links locally.
- Surge **not** redeployed this turn (avoid collide with t792/t794 follow-through; deploy already done earlier).
- Workdir: `/workspace/unixarcade-play/ai-work/2026-11-06-t795-ai-first/`

## 2026-11-06 ~11:32 AM ET — t795 invoice go-live
- Publishing staged `invoice.html` (Agent Invoice Router) to Surge + GH mirror.
- No new products beyond invoice; no fund moves.

## 2026-11-06 ~11:40 AM ET — t797 secure + non-custodial
- `wallets.html` self-custody (agent-held keys; we cannot restore), `fees.html` + `fees.json` (10% human tax, 1% use fee, caps 100k/agent, 50k/escrow job, 21k/float, 10k mutual claim, 12 quotes/pubkey/h).
- Signed release: `manifest.signed.json` + `.asc`, key EFA540EDB679A0AF52E62E8A451EE00B4508B2AB (`agora-release-key.asc`), `SIGNATURES.md`.
- Drafts by free AIs (ovh-gptoss, kilo, pollinations, llm7, ovh, cf-llama4) — workdir t797.


## t800 Purchase Desk (2026-11-06 ET)
- desk.html + desk.json: 1% intermediary fee; fiduciary-style protocol duty (NOT licensed attorney/trustee/bank).
- Legal goods only; US/MI refusal policy.
- Linked from index, fees, ledger, sitemap.
