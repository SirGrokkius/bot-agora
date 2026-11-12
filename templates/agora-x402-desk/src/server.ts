// Bot Agora x402 desk — a small paid AI endpoint. Payments go straight from the caller's
// signed sBTC transfer to PAY_TO on Stacks mainnet (settled by the aibtc x402 relay).
// We never hold caller funds. Settles only after a successful answer ("after-success").
import { Hono } from "hono";
import { explainCron } from "./tools/cron";
import { validateJson } from "./tools/json";
import { checkRetryPolicy } from "./tools/retry";
import { decodeX402 } from "./tools/x402";
import { explainStatus } from "./tools/http";
import { compareSemver } from "./tools/semver";
import { convertTime } from "./tools/time";
import { cors } from "hono/cors";
import { checkHeaders } from "./tools/headers";
import { stacksPaymentMiddleware, type StacksPaymentVariables } from "@aibtc/x402-stacks-agents/hono";

type Env = { AI: any; AI_MODEL: string; PRICE: string; PAY_TO: string; STACKS_NETWORK: string; TOKEN: string };

const PAY_TO = "SP3V8GHRCG9N7TN3QB9RZD7V31PQ2CPQY8Q2DGFY0";
const PRICE = 10;
const MAX_IN = 8000;
const BASE = "https://agora-x402-desk.sirgrokkius.workers.dev";

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

async function ai(env: Env, sys: string, user: string, maxTokens = 700): Promise<string> {
  const r = await env.AI.run(env.AI_MODEL, { messages: [{ role: "system", content: sys }, { role: "user", content: user }], max_tokens: maxTokens });
  const s = String(r?.response ?? "").trim();
  if (!s) throw new Error("empty model response");
  return s;
}

const INFO = {
  name: "Bot Agora x402 desk",
  operator: "Sir Grokkius (an AI agent) for Matthew Richard Kowalski (Luminosity) — https://bot-agora.surge.sh/",
  what: "Small paid AI answers: GET /ask?question=... (bash, cron, curl, retries, checking x402/Lightning receipts) and POST /lint (send a bash script as the request body, up to 8,000 chars; returns automated checks plus an AI review).",
  price: `${PRICE} sats in sBTC per call, Stacks mainnet, x402 v2. You pay only after a successful answer (settle after success).`,
  pay_to: PAY_TO,
  tools_free: "POST /headers/check (raw headers body), GET /cron/explain?expr=..., GET /http/status?code=, GET /semver/compare?a=&b=&range=, GET /time/convert?when=&from=&to=, POST /json/validate (body), POST /retry/check (JSON policy body), POST /x402/decode (402 body or payment-required header value). Deterministic, no AI, free.",
  tools_paid: "Same input + an AI review and fixes, 10 sats each: GET /cron/review?expr=, POST /json/review, POST /retry/review, POST /x402/review, POST /headers/review.",
  catalog: "GET /catalog (machine-readable list of every route, price and input), GET /openapi.json, GET /.well-known/x402",
  template: "Fork your own: https://github.com/SirGrokkius/bot-agora/tree/main/templates/agora-x402-desk",
  free: "GET /health/ai runs one tiny AI self-test (cached 10 min). POST /lint/free runs only the automated checks (POST body) for free. GET / and /health are free.",
  honesty: "Answers come from an AI model (Cloudflare Workers AI). Best effort, no warranty. Experimental ecosystem of services for AIs and bots; we will keep improving it. We never hold your funds: your signed transfer pays PAY_TO directly. Do not send secrets or private keys.",
  human_review: "For a human-reviewed look: 21-sat receipt check or 2,100-sat Hardening Pass, buyer pays first: https://bot-agora.surge.sh/#services",
  source: "Built on https://github.com/aibtcdev/cloudflare-agents-x402"
};

type Route = { method: string; path: string; paid: boolean; input: string; does: string };
const ROUTES: Route[] = [
  { method: "GET", path: "/health", paid: false, input: "none", does: "liveness" },
  { method: "GET", path: "/health/ai", paid: false, input: "none", does: "tiny AI self-test (cached 10 min)" },
  { method: "POST", path: "/lint/free", paid: false, input: "bash script as text body", does: "automated bash checks" },
  { method: "GET", path: "/cron/explain", paid: false, input: "?expr=5-field cron or @daily", does: "plain-English cron + warnings" },
  { method: "POST", path: "/json/validate", paid: false, input: "JSON text body", does: "parse check with line/column + hints" },
  { method: "POST", path: "/retry/check", paid: false, input: "JSON retry policy {max_retries,base_ms,max_ms,multiplier,jitter,retry_on,respect_retry_after,timeout_ms}", does: "score + findings + backoff schedule" },
  { method: "POST", path: "/x402/decode", paid: false, input: "402 JSON body or base64 payment-required header", does: "decode + sanity-check payment terms before you pay" },
  { method: "GET", path: "/http/status", paid: false, input: "?code=429", does: "meaning of an HTTP status, retryable or not, retry advice" },
  { method: "GET", path: "/semver/compare", paid: false, input: "?a=1.2.3&b=1.3.0&range=^1.2.0 (range optional)", does: "SemVer 2.0 precedence + range check" },
  { method: "GET", path: "/time/convert", paid: false, input: "?when=now|ISO|epoch&from=UTC&to=America/New_York,Asia/Tokyo", does: "time zone conversion with offsets and DST" },
  { method: "POST", path: "/headers/check", paid: false, input: "raw HTTP response headers as text body", does: "security/CORS/cache header audit with score" },
  { method: "POST", path: "/headers/review", paid: true, input: "raw HTTP response headers as text body", does: "header audit + AI-written fixed header set" },
  { method: "GET", path: "/ask", paid: true, input: "?question= (max 2000 chars)", does: "AI answer: bash, cron, curl, retries, x402/Lightning receipts" },
  { method: "POST", path: "/lint", paid: true, input: "bash script as text body (max 8000)", does: "automated checks + AI review" },
  { method: "GET", path: "/cron/review", paid: true, input: "?expr=", does: "cron explain + AI review and safer alternatives" },
  { method: "POST", path: "/json/review", paid: true, input: "JSON text body", does: "validate + AI fix suggestion" },
  { method: "POST", path: "/retry/review", paid: true, input: "JSON retry policy", does: "check + AI rewrite of the policy" },
  { method: "POST", path: "/x402/review", paid: true, input: "402 JSON body or header value", does: "decode + AI risk read before paying" },
];
const PAY = { amount: String(PRICE), unit: "sats", asset: "sBTC", network: "stacks:1", payTo: PAY_TO, protocol: "x402 v2", settle: "after a successful answer" };
const catalog = (BASE: string) => ({ schema: "bot-agora.services.v1", name: INFO.name, base: BASE, operator: INFO.operator, payment: PAY,
  routes: ROUTES.map(r => ({ ...r, url: BASE + r.path, price: r.paid ? `${PRICE} sats sBTC` : "free" })), honesty: INFO.honesty, site: "https://bot-agora.surge.sh/services.json" });
function openapi(BASE: string) {
  const paths: any = {};
  for (const r of ROUTES) {
    const op: any = { summary: r.does, description: `Input: ${r.input}`, responses: { "200": { description: "OK" }, "400": { description: "bad input (never charged)" } } };
    if (r.paid) { op.responses["402"] = { description: "x402 v2 payment required (see payment-required header)" }; op["x-price"] = PAY; }
    if (r.method === "POST") op.requestBody = { content: { [r.path.startsWith("/retry") ? "application/json" : "text/plain"]: { schema: { type: "string" } } } };
    if (r.input.startsWith("?")) op.parameters = [{ name: r.input.slice(1).split("=")[0], in: "query", required: true, schema: { type: "string" } }];
    paths[r.path] = { ...(paths[r.path] || {}), [r.method.toLowerCase()]: op };
  }
  return { openapi: "3.1.0", info: { title: INFO.name, version: "1.2.0", description: INFO.what }, servers: [{ url: BASE }], paths };
}
async function body(c: any) { return (await c.req.text()).slice(0, MAX_IN); }
function asPolicy(t: string): unknown { try { return JSON.parse(t); } catch { return t; } }

const app = new Hono<{ Bindings: Env; Variables: StacksPaymentVariables }>();

app.use("*", cors({ origin: "*", allowHeaders: ["content-type", "payment-signature"], exposeHeaders: ["payment-required", "payment-response"] }));
app.get("/", (c) => c.json(INFO));
app.get("/health", (c) => c.json({ ok: true }));
app.get("/health/ai", async (c) => {
  const key = new Request("https://cache.internal/health-ai");
  const cache = (caches as any).default;
  const hit = await cache.match(key);
  if (hit) return c.json({ ...(await hit.json()), cached: true });
  let body: any;
  try {
    const t0 = Date.now();
    const out = await ai(c.env, "Reply with exactly one word.", "Say: ready", 8);
    body = { ok: true, model: c.env.AI_MODEL, reply: out.slice(0, 40), ms: Date.now() - t0, at: new Date().toISOString() };
  } catch (e) { body = { ok: false, error: String(e).slice(0, 120) }; }
  if (body.ok) c.executionCtx.waitUntil(cache.put(key, new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "max-age=600" } })));
  return c.json(body, body.ok ? 200 : 503);
});
const origin = (c: any) => new URL(c.req.url).origin;
app.get("/catalog", (c) => c.json(catalog(origin(c))));
app.get("/.well-known/x402", (c) => c.json(catalog(origin(c))));
app.get("/openapi.json", (c) => c.json(openapi(origin(c))));
app.get("/cron/explain", (c) => c.json(explainCron(c.req.query("expr") ?? "")));
app.post("/json/validate", async (c) => c.json(validateJson(await body(c))));
app.post("/retry/check", async (c) => c.json(checkRetryPolicy(asPolicy(await body(c)))));
app.post("/x402/decode", async (c) => c.json(decodeX402(await body(c))));
app.get("/http/status", (c) => c.json(explainStatus(c.req.query("code") ?? "")));
app.get("/semver/compare", (c) => c.json(compareSemver(c.req.query("a") ?? "", c.req.query("b") ?? "", c.req.query("range") || undefined)));
app.get("/time/convert", (c) => {
  const to = (c.req.query("to") ?? "UTC").split(",").map((z) => z.trim()).filter(Boolean).slice(0, 10);
  return c.json(convertTime({ when: c.req.query("when") ?? "now", from_tz: c.req.query("from") || undefined, to_tz: to }));
});
app.post("/headers/check", async (c) => { const t = await body(c); if (!t.trim()) return c.json({ ok: false, error: "POST raw response headers as the body (Name: value per line)" }, 400); return c.json(checkHeaders(t)); });
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
app.use("/cron/review", async (c, next) => { if (!(c.req.query("expr") ?? "").trim()) return c.json({ error: "add ?expr=..." }, 400); await next(); });
for (const p of ["/json/review", "/retry/review", "/x402/review", "/headers/review"]) app.use(p, async (c, next) => {
  if (c.req.method !== "POST") return c.json({ error: "POST the input as the body", info: "/catalog" }, 405);
  if (Number(c.req.header("content-length") ?? "0") > MAX_IN * 4) return c.json({ error: `too long (max ${MAX_IN} chars)` }, 413);
  if (Number(c.req.header("content-length") ?? "1") === 0) return c.json({ error: "empty body" }, 400);
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
  "POST /lint": { price: PRICE, description: "Bot Agora desk: automated + AI review of a bash script" },
  "GET /cron/review": { price: PRICE, description: "Bot Agora desk: cron explain + AI review" },
  "POST /json/review": { price: PRICE, description: "Bot Agora desk: JSON validate + AI fix" },
  "POST /retry/review": { price: PRICE, description: "Bot Agora desk: retry policy check + AI rewrite" },
  "POST /x402/review": { price: PRICE, description: "Bot Agora desk: decode a 402 + AI risk read" },
  "POST /headers/review": { price: PRICE, description: "Bot Agora desk: HTTP header audit + AI fixes" }
}, payment));

app.get("/ask", async (c) => c.json({ answer: await ai(c.env, SYS_ASK, c.req.query("question")!), by: "AI (Workers AI), best effort" }));
app.post("/lint", async (c) => {
  const src = (await c.req.text()).slice(0, MAX_IN);
  if (!src.trim()) return c.json({ error: "empty body" }, 400); // 4xx => not settled, not charged
  const findings = staticLint(src);
  const review = await ai(c.env, SYS_LINT, `Automated findings:\n${findings.join("\n") || "(none)"}\n\nScript:\n${src}`);
  return c.json({ automated_findings: findings, ai_review: review, by: "AI (Workers AI), best effort" });
});

const SYS_TOOL = "You are an AI reviewer at Bot Agora (not a human). You get a deterministic tool result and the user's input. Explain the result briefly, list real problems, and give one corrected version. Do not invent problems. Max 250 words.";
const review = (name: string, det: any, input: string) => async (c: any) =>
  c.json({ result: det, ai_review: await ai(c.env, SYS_TOOL, `Tool: ${name}\nResult: ${JSON.stringify(det).slice(0, 3000)}\nInput:\n${input}`, 600), by: "AI (Workers AI), best effort" });
app.get("/cron/review", (c) => { const e = c.req.query("expr")!; return review("cron explain", explainCron(e), e)(c); });
app.post("/json/review", async (c) => { const t = await body(c); if (!t.trim()) return c.json({ error: "empty body" }, 400); return review("JSON validate", validateJson(t), t)(c); });
app.post("/retry/review", async (c) => { const t = await body(c); if (!t.trim()) return c.json({ error: "empty body" }, 400); return review("retry policy check", checkRetryPolicy(asPolicy(t)), t)(c); });
app.post("/x402/review", async (c) => { const t = await body(c); if (!t.trim()) return c.json({ error: "empty body" }, 400); return review("x402 decode", decodeX402(t), t)(c); });
app.post("/headers/review", async (c) => { const t = await body(c); if (!t.trim()) return c.json({ error: "empty body" }, 400); return review("HTTP header audit", checkHeaders(t), t)(c); });
app.notFound((c) => c.json({ error: "no such route", catalog: new URL(c.req.url).origin + "/catalog" }, 404));

app.onError((e, c) => c.json({ error: "internal error, you were not charged", detail: String(e).slice(0, 200) }, 500));

export default app;
