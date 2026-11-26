import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaEnterpriseProvider, CustomProvider } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app-check.js";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-ai.js";
import { firebaseConfig, appCheckConfig } from "./firebase-config.js";

const LONG_DOC_CHARS = 12000;
const DEVICE_INIT_MS = 15000;

const app = initializeApp(firebaseConfig);
initAppCheck(app);
const ai = getAI(app, { backend: new GoogleAIBackend() });
// The SDK default cloud model (gemini-2.0-flash-lite) has been retired, so name one explicitly.
// Override with appCheckConfig.cloudModel in firebase-config.js if Google retires this one too.
const CLOUD_MODEL = (appCheckConfig && appCheckConfig.cloudModel) || "gemini-3.5-flash-lite";
const inCloudParams = { model: CLOUD_MODEL };
const hybrid = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE, inCloudParams });
const cloud = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD, inCloudParams });

// App Check must be initialized before getAI. The debug token and reCAPTCHA
// site key are read only from gitignored firebase-config.js.
function initAppCheck(firebaseApp) {
  const cfg = appCheckConfig || {};
  const debugToken = cfg.debugToken;
  const siteKey = (cfg.recaptchaEnterpriseSiteKey || "").trim();
  if (!debugToken && !siteKey) {
    throw new Error("firebase-config.js must set appCheckConfig.debugToken (localhost) or recaptchaEnterpriseSiteKey (hosted).");
  }
  if (debugToken) {
    // Official Web debug provider: must be set BEFORE initializeAppCheck.
    // true = print a fresh token in the console; a string = a token already
    // registered in Firebase Console > App Check > Manage debug tokens.
    // In debug mode the SDK exchanges this token itself and never calls the provider.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
  const provider = siteKey
    ? new ReCaptchaEnterpriseProvider(siteKey)
    : new CustomProvider({
        // Debug-only path (localhost). Never reached while a debug token is set.
        getToken: async () => {
          throw new Error("No reCAPTCHA Enterprise site key and no debug token: App Check cannot mint a token.");
        },
      });
  return initializeAppCheck(firebaseApp, { provider, isTokenAutoRefreshEnabled: true });
}

const PROMPT = `Extract a quote-intake record from the document below. Reply with JSON only:
{"customer":"","contact":{"name":"","email":"","phone":""},"due_date":"","lines":[{"part_no":"","description":"","material":"","qty":0,"unit":""}],"notes":""}
Use "" for anything not stated. Do not invent values.
DOCUMENT:
`;

const $ = (id) => document.getElementById(id);

function setBadge(kind, text) {
  const el = $("where");
  el.className = "badge badge-" + kind;
  el.textContent = text;
}

async function localAvailable() {
  try {
    return typeof LanguageModel !== "undefined" && (await LanguageModel.availability()) === "available";
  } catch {
    return false;
  }
}

async function maybeInitOnDevice(model) {
  if (typeof model.initializeDeviceModel !== "function") return;
  try {
    const init = model.initializeDeviceModel((val) => {
      setBadge("working", "loading on-device model " + Math.round((val || 0) * 100) + "%");
    });
    await Promise.race([
      Promise.resolve(init),
      new Promise((_, reject) => setTimeout(() => reject(new Error("on-device model init timed out; continuing with hybrid fallback")), DEVICE_INIT_MS)),
    ]);
  } catch (err) {
    console.warn("initializeDeviceModel:", err);
  }
}

async function extract(text) {
  const useCloud = text.length > LONG_DOC_CHARS;
  const onDevice = !useCloud && await localAvailable();
  const model = useCloud ? cloud : hybrid;
  if (!useCloud) await maybeInitOnDevice(model);
  const res = await model.generateContent(PROMPT + text);
  const raw = res.response.text().replace(/^```json|```$/g, "").trim();
  let data;
  try { data = JSON.parse(raw); } catch { data = { parse_error: true, raw }; }
  return { data, ranOn: onDevice ? "on-device (Gemini Nano)" : "cloud (" + CLOUD_MODEL + ")" };
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderTable(data) {
  const el = $("table");
  if (!data || data.parse_error) { el.innerHTML = ""; return; }
  const c = data.contact || {};
  const rows = (data.lines || []).map((l) =>
    `<tr><td>${esc(l.part_no)}</td><td>${esc(l.description)}</td><td>${esc(l.material)}</td><td class="num">${esc(l.qty)} ${esc(l.unit)}</td></tr>`).join("");
  el.innerHTML = `<dl class="summary"><dt>Customer</dt><dd>${esc(data.customer) || "—"}</dd>` +
    `<dt>Contact</dt><dd>${esc([c.name, c.email, c.phone].filter(Boolean).join(" · ")) || "—"}</dd>` +
    `<dt>Quote due</dt><dd>${esc(data.due_date) || "—"}</dd></dl>` +
    `<table><thead><tr><th>Part</th><th>Description</th><th>Material</th><th>Qty</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderHistory() {
  const h = JSON.parse(localStorage.getItem("rfq-history") || "[]");
  $("hist").innerHTML = h.map((r) => {
    const lines = (r.data && r.data.lines) ? r.data.lines.length : 0;
    const customer = (r.data && r.data.customer) || "(no customer)";
    return `<li>${new Date(r.at).toLocaleString()} — ${customer} — ${lines} lines — ${r.ranOn}</li>`;
  }).join("");
}

$("go").onclick = async () => {
  const text = $("doc").value.trim();
  if (!text) return;
  $("go").disabled = true;
  setBadge("working", "working…");
  $("out").textContent = "";
  renderTable(null);
  try {
    const r = await extract(text);
    const kind = r.ranOn.startsWith("on-device") ? "device" : "cloud";
    setBadge(kind, "ran " + r.ranOn);
    $("out").textContent = JSON.stringify(r.data, null, 2);
    renderTable(r.data);
    const h = JSON.parse(localStorage.getItem("rfq-history") || "[]");
    h.unshift({ at: Date.now(), ...r });
    localStorage.setItem("rfq-history", JSON.stringify(h.slice(0, 50)));
    renderHistory();
  } catch (e) {
    setBadge("error", "error");
    $("out").textContent = String(e);
  } finally {
    $("go").disabled = false;
  }
};

$("sample").onclick = async () => {
  try {
    const res = await fetch("./sample-rfq.txt");
    if (!res.ok) throw new Error("could not load sample-rfq.txt");
    $("doc").value = await res.text();
    setBadge("idle", "sample loaded");
  } catch (e) {
    setBadge("error", "error");
    $("out").textContent = String(e);
  }
};

renderHistory();
