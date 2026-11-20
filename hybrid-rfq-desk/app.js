import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-ai.js";
import { firebaseConfig } from "./firebase-config.js";

const LONG_DOC_CHARS = 12000; // above this, go straight to the cloud model
const app = initializeApp(firebaseConfig);
const ai = getAI(app, { backend: new GoogleAIBackend() });
const hybrid = getGenerativeModel(ai, { mode: InferenceMode.PREFER_ON_DEVICE });
const cloud = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD });

const PROMPT = `Extract a quote-intake record from the document below. Reply with JSON only:
{"customer":"","contact":{"name":"","email":"","phone":""},"due_date":"","lines":[{"part_no":"","description":"","material":"","qty":0,"unit":""}],"notes":""}
Use "" for anything not stated. Do not invent values.
DOCUMENT:
`;

async function localAvailable() {
  try { return typeof LanguageModel !== "undefined" && (await LanguageModel.availability()) === "available"; }
  catch { return false; }
}

async function extract(text) {
  const useCloud = text.length > LONG_DOC_CHARS;
  const onDevice = !useCloud && await localAvailable();
  const model = useCloud ? cloud : hybrid;
  const res = await model.generateContent(PROMPT + text);
  const raw = res.response.text().replace(/^\`\`\`json|\`\`\`$/g, "").trim();
  let data; try { data = JSON.parse(raw); } catch { data = { parse_error: true, raw }; }
  return { data, ranOn: onDevice ? "on-device (Gemini Nano)" : "cloud" };
}

const $ = (id) => document.getElementById(id);
function renderHistory() {
  const h = JSON.parse(localStorage.getItem("rfq-history") || "[]");
  $("hist").innerHTML = h.map(r => `<li>${new Date(r.at).toLocaleString()} - ${r.data.customer || "(no customer)"} - ${(r.data.lines||[]).length} lines - ${r.ranOn}</li>`).join("");
}
$("go").onclick = async () => {
  const text = $("doc").value.trim(); if (!text) return;
  $("where").textContent = "working..."; $("out").textContent = "";
  try {
    const r = await extract(text);
    $("where").textContent = "ran " + r.ranOn;
    $("out").textContent = JSON.stringify(r.data, null, 2);
    const h = JSON.parse(localStorage.getItem("rfq-history") || "[]");
    h.unshift({ at: Date.now(), ...r }); localStorage.setItem("rfq-history", JSON.stringify(h.slice(0, 50)));
    renderHistory();
  } catch (e) { $("where").textContent = "error"; $("out").textContent = String(e); }
};
renderHistory();
