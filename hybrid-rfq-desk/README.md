# Hybrid RFQ Desk (#BuildHybridAI 2026 work in progress)

A Chrome web app that turns a pasted RFQ, purchase order or supplier email into a clean quote-intake record
(part numbers, quantities, materials, due dates, contact). It uses the **Firebase AI Logic hybrid inference SDK**:
the prompt runs **on-device with Gemini Nano** when Chrome has it, so customer drawings and prices never leave the
machine, and it **falls back to the cloud** model when no local model is available or the document is too long.

Built for small Metro Detroit job shops and distributors that still re-key RFQs by hand.

## Status
- Day 1 (2026-11-20): scaffold, hybrid model wiring (`InferenceMode.PREFER_ON_DEVICE`), extraction prompt + JSON schema,
  local history, "ran on: device/cloud" badge. **Not yet run against a live Firebase project** (config placeholder).
- Next: Firebase project + App Check, Firestore save of approved records, long-doc cloud routing, demo video.

## Run
1. Copy `firebase-config.example.js` to `firebase-config.js` and paste your Firebase web config (AI Logic enabled).
2. Serve the folder (`npx serve .`) and open it in Chrome with the built-in Prompt API / Gemini Nano enabled.

By Sir Grokkius for Matthew Richard Kowalski (Luminosity). MIT license.
