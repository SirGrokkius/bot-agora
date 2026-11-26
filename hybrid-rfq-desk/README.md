# Hybrid RFQ Desk (#BuildHybridAI 2026)

A Chrome web app that turns a pasted RFQ, purchase order or supplier email into a clean quote-intake record
(part numbers, quantities, materials, due dates, contact). It uses the **Firebase AI Logic hybrid inference SDK**:
the prompt runs **on-device with Gemini Nano** when Chrome has it, so customer drawings and prices never leave the
machine, and it **falls back to the cloud** model when no local model is available or the document is too long.

Built for small Metro Detroit job shops and distributors that still re-key RFQs by hand.

By Sir Grokkius for Matthew Richard Kowalski (Luminosity). MIT license.

## What is wired

- Firebase AI Logic (`getGenerativeModel`) with `InferenceMode.PREFER_ON_DEVICE` and `InferenceMode.ONLY_IN_CLOUD`.
- Documents over 12,000 characters go straight to the cloud model.
- `initializeAppCheck` runs before `getAI`. On localhost, a debug token is read from gitignored `firebase-config.js`. A hosted app should set a reCAPTCHA Enterprise site key in that same file.
- On Extract, the app calls `initializeDeviceModel()` when the SDK provides it (required for on-device inference after a user gesture).
- A "ran on-device / ran cloud" badge, local history (this browser only, last 50), and a Load sample button.

## Run

1. Copy `firebase-config.example.js` to `firebase-config.js` and paste your Firebase web config (AI Logic enabled) plus App Check settings. Do not commit `firebase-config.js` or any debug token.
2. Register an App Check debug token (Chrome DevTools will print one when `debugToken` is `true`) at Firebase Console > App Check > Manage debug tokens, then put that string in `appCheckConfig.debugToken`.
3. Serve the folder and open it in Chrome (v139+ recommended; enable `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` for on-device inference):

```bash
cd hybrid-rfq-desk
python3 -m http.server 8765 --bind 127.0.0.1
# then open http://127.0.0.1:8765/
```

Stay on the Firebase Spark plan. Do not add a billing account or a card.

## Verified

The cloud path was checked end to end on 2026-11-26 with the project config: App Check debug-token exchange (HTTP 200), then a Firebase AI Logic `generateContent` call with `gemini-3.5-flash-lite` returned correct JSON for `sample-rfq.txt` (BRK-220 x 500, BRK-221 x 250, Dec 4, J. Doe). The SDK's default cloud model, `gemini-2.0-flash-lite`, is retired, so the app names its cloud model explicitly. On-device (Gemini Nano) depends on the visitor's Chrome and is not claimed unless the badge says so.

## Status

Started 2026-11-20 during the #BuildHybridAI submission period. A live Firebase project and a demo video are set up separately; this repository never contains those secrets.
