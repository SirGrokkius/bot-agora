// Copy this file to firebase-config.js (gitignored) and fill in values
// from the Firebase console. Never commit firebase-config.js, App Check
// debug tokens, or other secrets.

export const firebaseConfig = {
  apiKey: "YOUR_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};

// Local-only App Check settings, read by app.js from the gitignored copy.
//
// debugToken: true
//   First localhost run prints an AppCheck debug token in the Chrome console.
//   Register it at Firebase Console > App Check > Manage debug tokens, then
//   replace true with that string.
// debugToken: "xxxxxxxx-xxxx-...."
//   Use a token you already registered. Never commit this file.
// recaptchaEnterpriseSiteKey
//   From App Check (web / reCAPTCHA Enterprise). Needed for a hosted demo.
//   Leave "" on localhost when debugToken is set.
export const appCheckConfig = {
  debugToken: true,
  recaptchaEnterpriseSiteKey: "",
  // Optional: Gemini model for the cloud path (default gemini-3.5-flash-lite).
  // cloudModel: "gemini-3.5-flash-lite",
};
