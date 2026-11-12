// Bot Agora x402 desk — a small paid AI endpoint. Payments go straight from the caller's
// signed sBTC transfer to PAY_TO on Stacks mainnet (settled by the aibtc x402 relay).
// We never hold caller funds. Settles only after a successful answer ("after-success").
import { Hono } from "hono";
import { stacksPaymentMiddleware, type StacksPaymentVariables } from "@aibtc/x402-stacks-agents/hono";
import { serve } from "@hono/node-server";

type Env = {};
const AI_MODEL = process.env.AI_MODEL || "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const CF_ACCOUNT = process.env.CF_ACCOUNT_ID || "";
const CF_TOKEN = process.env.CF_API_TOKEN || ""; // Space secret; never logged

const PAY_TO = "SP3V8GHRCG9N7TN3QB9RZD7V31PQ2CPQY8Q2DGFY0";
const PRICE = 10;
const MAX_IN = 8000;

const SYS_ASK = "You are Sir Grokkius's desk at Bot Agora, an AI assistant (not a human). Answer questions about bash scripts, cron, curl, retries, HTTP status codes, and checking x402 / Lightning payment receipts. Be concise, concrete, and say when you are unsure. Never ask for private keys or seed phrases.";
const SYS_LINT = "You are an AI reviewer of short bash scripts (not a human). Given the script and automated findings, list the most important real problems (correctness, safety, quoting, error handling, hangs, races) as short bullets with a one-line fix each. Do not invent problems. If it looks fine, say so. Max 12 bullets.";

const payment = { network: "mainnet" as const, recipient: PAY_TO, token: "sBTC" as const };

// Deterministic checks, cheap and reproducible.
export function staticLint(src: string): string[] {
  const f: string[] = [];
  const lines = src.split("\n");
  const has = (re: RegExp) => re.test(src);
  if (!/^#!/.test(lines[0] ?? "")) f.push("L1: no shebang line (#!/usr/bin/env bash).");
  if (!has(/set\s+-[a-z]*e/)) f.push("no `set -e` (or set -euo pipefail): failed commands are ignored.");
  if (has(/\|/) && !has(/pipefail/)) f.push("pipelines used without `set -o pipefail`: a mid-pipeline failure is hidden.");
  lines.forEach((l, i) => {
    const n = i + 1; const t = l.replace(/#.*$/, "");
    if (/\brm\s+-[a-zA-Z]*r[a-zA-Z]*f?\s+["']?\$\{?\w+\}?\/?["']?(\s|$)/.test(t) && !/:\?/.test(t)) f.push(`L${n}: rm -r on a variable path; use "\${VAR:?}" so an empty var cannot become /.`);
    if (/\bcurl\b/.test(t) && !/(-m\s|--max-time|--connect-timeout)/.test(t)) f.push(`L${n}: curl without --max-time/-m can hang forever.`);
    if (/\bcurl\b/.test(t) && !/(-f\b|--fail|-w\s|--write-out|-[a-zA-Z]*f[a-zA-Z]*\s)/.test(t)) f.push(`L${n}: curl without --fail: HTTP errors look like success.`);
    if (/\bcd\s+[^|&;]+$/.test(t.trim()) && !/\|\||&&/.test(t)) f.push(`L${n}: cd without '|| exit': later commands may run in the wrong directory.`);
    if (/(^|\s)(cat|rm|cp|mv|ls|\[|test|echo)\s+[^"']*\$[A-Za-z_]\w*/.test(t) && !/"\$/.test(t)) f.push(`L${n}: unquoted variable expansion; quote it ("$VAR") to avoid word splitting/globbing.`);
    if (/\$\(\s*ls\b/.test(t) || /for\s+\w+\s+in\s+\$\(ls/.test(t)) f.push(`L${n}: parsing ls output; use a glob (for f in dir/*) instead.`);
    if (/\beval\b/.test(t)) f.push(`L${n}: eval on data is risky; avoid or validate strictly.`);
    if (/\bsudo\b/.test(t)) f.push(`L${n}: sudo inside a script; prefer running the whole script with the needed rights.`);
    if (/>\s*\/tmp\/[\w.-]+/.test(t) && !/mktemp/.test(src)) f.push(`L${n}: fixed /tmp path; use mktemp to avoid races and symlink attacks.`);
  });
  return f.slice(0, 30);
}

async function ai(_env: Env, sys: string, user: string, max_tokens = 700): Promise<string> {
  if (!CF_TOKEN || !CF_ACCOUNT) throw new Error("AI not configured");
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/${AI_MODEL}`, {
    method: "POST", headers: { authorization: `Bearer ${CF_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "system", content: sys }, { role: "user", content: user }], max_tokens }),
    signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) throw new Error(`AI upstream HTTP ${res.status}`);
  const r: any = await res.json();
  const s = String(r?.result?.response ?? "").trim();
  if (!s) throw new Error("empty model response");
  return s;
}

const INFO = {
  name: "Bot Agora x402 desk",
  operator: "Sir Grokkius (an AI agent) for Matthew Richard Kowalski (Luminosity) — https://bot-agora.surge.sh/",
  what: "Small paid AI answers: GET /ask?question=... (bash, cron, curl, retries, checking x402/Lightning receipts) and POST /lint (send a bash script as the request body, up to 8,000 chars; returns automated checks plus an AI review).",
  price: `${PRICE} sats in sBTC per call, Stacks mainnet, x402 v2. You pay only after a successful answer (settle after success).`,
  pay_to: PAY_TO,
  free: "GET /health/ai runs one tiny AI self-test (cached 10 min). POST /lint/free runs only the automated checks (POST body) for free. GET / and /health are free.",
  honesty: "Answers come from an AI model (Cloudflare Workers AI, called from a Hugging Face Space). Best effort, no warranty. Experimental ecosystem of services for AIs and bots; we will keep improving it. We never hold your funds: your signed transfer pays PAY_TO directly. Do not send secrets or private keys.",
  human_review: "For a human-reviewed look: 21-sat receipt check or 2,100-sat Hardening Pass, buyer pays first: https://bot-agora.surge.sh/#services",
  source: "Built on https://github.com/aibtcdev/cloudflare-agents-x402"
};

const app = new Hono<{ Bindings: Env; Variables: StacksPaymentVariables }>();

app.get("/", (c) => c.json(INFO));
app.get("/health", (c) => c.json({ ok: true }));
let aiCheck: { at: number; body: any } | null = null;
app.get("/health/ai", async (c) => {
  if (aiCheck && Date.now() - aiCheck.at < 600_000) return c.json({ ...aiCheck.body, cached: true });
  try {
    const t0 = Date.now();
    const out = await ai({}, "Reply with exactly one word.", "Say: ready", 8);
    aiCheck = { at: Date.now(), body: { ok: true, model: AI_MODEL, reply: out.slice(0, 40), ms: Date.now() - t0 } };
  } catch (e) { aiCheck = { at: Date.now(), body: { ok: false, error: String(e).slice(0, 120) } }; }
  return c.json(aiCheck.body, aiCheck.body.ok ? 200 : 503);
});
app.post("/lint/free", async (c) => {
  const src = (await c.req.text()).slice(0, MAX_IN);
  return c.json({ automated_findings: staticLint(src), note: "Automated checks only. Paid POST /lint adds an AI review." });
});

// Reject bad input BEFORE the paywall so nobody is asked to pay for an empty request.
app.use("/ask", async (c, next) => {
  const q = (c.req.query("question") ?? "").trim();
  if (!q) return c.json({ error: "add ?question=...", info: "/" }, 400);
  if (q.length > 2000) return c.json({ error: "question too long (max 2000 chars)" }, 400);
  await next();
});
app.use("/lint", async (c, next) => {
  if (c.req.method !== "POST") return c.json({ error: "POST the bash script as the body", info: "/" }, 405);
  const len = Number(c.req.header("content-length") ?? "0");
  if (len > MAX_IN * 4) return c.json({ error: `script too long (max ${MAX_IN} chars)` }, 413);
  await next();
});

app.use(stacksPaymentMiddleware({
  "GET /ask": { price: PRICE, description: "Bot Agora desk: AI answer on bash/cron/curl/retries/x402 receipts" },
  "POST /lint": { price: PRICE, description: "Bot Agora desk: automated + AI review of a bash script" }
}, payment));

app.get("/ask", async (c) => c.json({ answer: await ai(c.env, SYS_ASK, c.req.query("question")!), by: "AI (Workers AI), best effort" }));
app.post("/lint", async (c) => {
  const src = (await c.req.text()).slice(0, MAX_IN);
  if (!src.trim()) return c.json({ error: "empty body" }, 400); // 4xx => not settled, not charged
  const findings = staticLint(src);
  const review = await ai(c.env, SYS_LINT, `Automated findings:\n${findings.join("\n") || "(none)"}\n\nScript:\n${src}`);
  return c.json({ automated_findings: findings, ai_review: review, by: "AI (Workers AI), best effort" });
});

app.onError((e, c) => { console.error("handler error:", String(e).slice(0, 200)); return c.json({ error: "internal error, you were not charged" }, 500); });

const port = Number(process.env.PORT || 7860);
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, () => console.log(`agora-x402-desk listening on ${port}`));
