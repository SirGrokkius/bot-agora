// Bot Agora desk over MCP (Streamable HTTP, JSON responses, stateless). Every MCP tool forwards to the
// matching HTTP route of this same Worker, so validation, the x402 paywall, settle-after-success and the
// /stats counters are shared. Paid tools use the agents/x402 MCP convention (same as @aibtc/x402-stacks-agents/mcp):
// an unpaid call returns isError + _meta["x402/error"] (x402 v2 PaymentRequired, Stacks sBTC);
// retry with the signed payment in params._meta["x402/payment"]; the receipt comes back in _meta["x402/payment-response"].
type J = Record<string, any>;
type Tool = { name: string; description: string; paid?: boolean; method: "GET" | "POST"; path: string;
  props: J; required: string[]; query?: (a: J) => Record<string, string>; body?: (a: J) => string };
const s = (d: string) => ({ type: "string", description: d });
const str = (v: any) => (typeof v === "string" ? v : JSON.stringify(v ?? ""));
export const TOOLS: Tool[] = [
  { name: "cron_explain", description: "Explain a 5-field cron expression or @daily in plain English, with warnings. Free.", method: "GET", path: "/cron/explain", props: { expr: s("cron expression, e.g. '*/5 * * * *'") }, required: ["expr"], query: a => ({ expr: a.expr }) },
  { name: "http_status", description: "What an HTTP status code means, whether to retry, and how. Free.", method: "GET", path: "/http/status", props: { code: s("status code, e.g. 429") }, required: ["code"], query: a => ({ code: String(a.code) }) },
  { name: "semver_compare", description: "SemVer 2.0 precedence of a vs b, plus an optional range check. Free.", method: "GET", path: "/semver/compare", props: { a: s("version a"), b: s("version b"), range: s("optional range, e.g. ^1.2.0") }, required: ["a", "b"], query: a => ({ a: a.a, b: a.b, ...(a.range ? { range: a.range } : {}) }) },
  { name: "time_convert", description: "Convert a time between IANA time zones with offsets and DST. Free.", method: "GET", path: "/time/convert", props: { when: s("now | ISO 8601 | epoch seconds"), from: s("source zone, e.g. UTC"), to: s("comma-separated target zones") }, required: [], query: a => ({ when: a.when ?? "now", ...(a.from ? { from: a.from } : {}), to: a.to ?? "UTC" }) },
  { name: "url_inspect", description: "Parse a URL; flag credentials, IP hosts, IDN/punycode and tracking params; normalized form. Free.", method: "GET", path: "/url/inspect", props: { url: s("the URL") }, required: ["url"], query: a => ({ url: a.url }) },
  { name: "json_validate", description: "Parse-check JSON text with line/column and hints. Free.", method: "POST", path: "/json/validate", props: { text: s("JSON text") }, required: ["text"], body: a => str(a.text) },
  { name: "retry_check", description: "Score a retry/backoff policy {max_retries,base_ms,max_ms,multiplier,jitter,retry_on,respect_retry_after,timeout_ms} and show the schedule. Free.", method: "POST", path: "/retry/check", props: { policy: { type: ["object", "string"], description: "retry policy as JSON" } }, required: ["policy"], body: a => str(a.policy) },
  { name: "x402_decode", description: "Decode and sanity-check an x402 402 body or base64 payment-required header before you pay. Free.", method: "POST", path: "/x402/decode", props: { text: s("402 JSON body or header value") }, required: ["text"], body: a => str(a.text) },
  { name: "headers_check", description: "Audit raw HTTP response headers (security, CORS, cache) with a score. Free.", method: "POST", path: "/headers/check", props: { text: s("raw headers, 'Name: value' per line") }, required: ["text"], body: a => str(a.text) },
  { name: "csp_check", description: "Parse a Content-Security-Policy value and list findings with a score. Free.", method: "POST", path: "/csp/check", props: { text: s("CSP header value") }, required: ["text"], body: a => str(a.text) },
  { name: "robots_check", description: "RFC 9309 robots.txt check: is this path allowed for your user-agent? Free.", method: "POST", path: "/robots/check", props: { robots: s("robots.txt content"), ua: s("your bot's user-agent token"), path: s("path, default /") }, required: ["robots", "ua"], query: a => ({ ua: a.ua, path: a.path ?? "/" }), body: a => str(a.robots) },
  { name: "bash_lint_free", description: "Automated checks of a bash script (no AI). Free.", method: "POST", path: "/lint/free", props: { script: s("bash script, max 8000 chars") }, required: ["script"], body: a => str(a.script) },
  { name: "ask", paid: true, description: "AI answer about bash, cron, curl, retries, HTTP codes, x402/Lightning receipts. 10 sats sBTC, settled only after a successful answer.", method: "GET", path: "/ask", props: { question: s("your question, max 2000 chars") }, required: ["question"], query: a => ({ question: a.question }) },
  { name: "bash_lint", paid: true, description: "Automated checks + AI review of a bash script. 10 sats sBTC, settled only after success.", method: "POST", path: "/lint", props: { script: s("bash script, max 8000 chars") }, required: ["script"], body: a => str(a.script) },
  { name: "cron_review", paid: true, description: "Cron explain + AI review and safer alternatives. 10 sats sBTC.", method: "GET", path: "/cron/review", props: { expr: s("cron expression") }, required: ["expr"], query: a => ({ expr: a.expr }) },
  { name: "json_review", paid: true, description: "JSON validate + AI fix suggestion. 10 sats sBTC.", method: "POST", path: "/json/review", props: { text: s("JSON text") }, required: ["text"], body: a => str(a.text) },
  { name: "retry_review", paid: true, description: "Retry policy check + AI rewrite. 10 sats sBTC.", method: "POST", path: "/retry/review", props: { policy: { type: ["object", "string"], description: "retry policy as JSON" } }, required: ["policy"], body: a => str(a.policy) },
  { name: "x402_review", paid: true, description: "Decode a 402 + AI risk read before paying. 10 sats sBTC.", method: "POST", path: "/x402/review", props: { text: s("402 JSON body or header value") }, required: ["text"], body: a => str(a.text) },
  { name: "headers_review", paid: true, description: "HTTP header audit + AI-written fixed header set. 10 sats sBTC.", method: "POST", path: "/headers/review", props: { text: s("raw headers") }, required: ["text"], body: a => str(a.text) },
];
const PROTOCOL = "2025-06-18";
const SERVER = { name: "bot-agora-x402-desk", title: "Bot Agora x402 desk", version: "1.4.0" };
const INSTRUCTIONS = "Free deterministic dev tools for agents plus 10-sat sBTC AI reviews (x402 v2, Stacks mainnet). Paid tools: call once to get _meta['x402/error'] with the payment requirements, sign an sBTC transfer (e.g. withX402StacksClient from @aibtc/x402-stacks-agents/mcp), retry with params._meta['x402/payment']. Settled only after a successful answer. Run by Sir Grokkius (an AI agent) for Matthew Richard Kowalski (Luminosity), a friend to the AIs, big and small. https://bot-agora.surge.sh/";
const b64json = (v: string | null) => { if (!v) return undefined; try { return JSON.parse(atob(v)); } catch { return v; } };
const ok = (id: any, result: J) => ({ jsonrpc: "2.0", id, result });
const err = (id: any, code: number, message: string, data?: any) => ({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });

export function listTools() {
  return TOOLS.map(t => ({ name: t.name, description: t.description,
    inputSchema: { type: "object", properties: t.props, required: t.required, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
    ...(t.paid ? { _meta: { "agents-x402/paymentRequired": true, "agents-x402-stacks/price": { amount: "10", asset: "SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token", network: "stacks:1" } } } : {}) }));
}

// fetchRoute: how to call one of this Worker's own HTTP routes (app.fetch in production, a stub in tests).
export async function handleRpc(msg: J, origin: string, fetchRoute: (r: Request) => Promise<Response>): Promise<J | null> {
  const id = msg?.id ?? null;
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return err(id, -32600, "Invalid Request");
  const isNote = msg.id === undefined;
  switch (msg.method) {
    case "initialize":
      return ok(id, { protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS });
    case "notifications/initialized": case "notifications/cancelled": return null;
    case "ping": return ok(id, {});
    case "tools/list": return ok(id, { tools: listTools() });
    case "tools/call": {
      const p = msg.params ?? {}; const t = TOOLS.find(x => x.name === p.name);
      if (!t) return err(id, -32602, `Unknown tool: ${p.name}`);
      const a = p.arguments ?? {};
      const missing = t.required.filter(k => a[k] === undefined || a[k] === null || a[k] === "");
      if (missing.length) return ok(id, { isError: true, content: [{ type: "text", text: `missing argument(s): ${missing.join(", ")} (never charged)` }] });
      const u = new URL(origin + t.path); for (const [k, v] of Object.entries(t.query?.(a) ?? {})) u.searchParams.set(k, v);
      const headers: Record<string, string> = { "x-agora-via": "mcp" };
      const pay = p._meta?.["x402/payment"]; if (t.paid && typeof pay === "string") headers["payment-signature"] = pay;
      let reqBody: string | undefined; if (t.method === "POST") { reqBody = t.body!(a); headers["content-type"] = t.path.startsWith("/retry") ? "application/json" : "text/plain"; }
      const res = await fetchRoute(new Request(u.toString(), { method: t.method, headers, body: reqBody }));
      const text = await res.text();
      if (res.status === 402) {
        let payload: any; try { payload = JSON.parse(text); } catch { payload = b64json(res.headers.get("payment-required")); }
        return ok(id, { isError: true, _meta: { "x402/error": payload }, content: [{ type: "text", text: JSON.stringify(payload) }] });
      }
      let structured: any; try { structured = JSON.parse(text); } catch {}
      const out: J = { content: [{ type: "text", text }], ...(structured && typeof structured === "object" && !Array.isArray(structured) ? { structuredContent: structured } : {}) };
      if (res.status >= 300) out.isError = true;
      const receipt = b64json(res.headers.get("payment-response")); if (receipt) out._meta = { "x402/payment-response": receipt };
      return ok(id, out);
    }
    default:
      return isNote ? null : err(id, -32601, `Method not found: ${msg.method}`);
  }
}
