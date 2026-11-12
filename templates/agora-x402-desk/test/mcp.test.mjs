// MCP endpoint tests: bundles the whole Worker and drives app.fetch with a stub env (no network, no AI, no payment).
import { test } from "node:test"; import assert from "node:assert/strict";
import { buildSync } from "esbuild"; import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const out = new URL("./.build/server.mjs", import.meta.url).pathname; // inside the project so node_modules resolve
buildSync({ entryPoints: [new URL("../src/server.ts", import.meta.url).pathname], bundle: true, format: "esm", platform: "node", external: ["x402-stacks", "@stacks/*"], outfile: out, logLevel: "error" });
globalThis.caches ??= { default: { match: async () => undefined, put: async () => {} } };
const app = (await import(out)).default;
const env = { AI: { run: async () => ({ response: "stub answer" }) }, AI_MODEL: "stub", PRICE: "10", PAY_TO: "SP3V8GHRCG9N7TN3QB9RZD7V31PQ2CPQY8Q2DGFY0", STACKS_NETWORK: "mainnet", TOKEN: "sBTC" };
const ctx = { waitUntil() {}, passThroughOnException() {} };
const B = "https://desk.test";
const rpc = async (m) => { const r = await app.fetch(new Request(B + "/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify(m) }), env, ctx); return { status: r.status, json: r.status === 202 ? null : await r.json() }; };

test("initialize + notifications", async () => {
  const r = await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "0" } } });
  assert.equal(r.status, 200); assert.equal(r.json.result.serverInfo.name, "bot-agora-x402-desk"); assert.ok(r.json.result.capabilities.tools);
  assert.equal((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status, 202);
});
test("tools/list has free and paid tools with schemas", async () => {
  const t = (await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json.result.tools;
  assert.ok(t.length >= 19); const ask = t.find((x) => x.name === "ask");
  assert.equal(ask._meta["agents-x402/paymentRequired"], true); assert.deepEqual(ask.inputSchema.required, ["question"]);
  assert.ok(!t.find((x) => x.name === "cron_explain")._meta);
});
test("free tool runs", async () => {
  const r = (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "cron_explain", arguments: { expr: "*/15 9-17 * * MON-FRI" } } })).json.result;
  assert.ok(!r.isError); assert.match(r.structuredContent.english, /Monday through Friday/);
  const h = (await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "http_status", arguments: { code: 429 } } })).json.result;
  assert.ok(!h.isError); assert.equal(h.structuredContent.retryable, true);
  const j = (await rpc({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "json_validate", arguments: { text: "{\"a\":1," } } })).json.result;
  assert.equal(j.structuredContent.ok, false);
});
test("paid tool without payment returns x402/error with Stacks sBTC terms", async () => {
  const r = (await rpc({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "ask", arguments: { question: "hello" } } })).json.result;
  assert.equal(r.isError, true); const e = r._meta["x402/error"];
  assert.equal(e.x402Version, 2); assert.equal(e.accepts[0].network, "stacks:1"); assert.equal(e.accepts[0].amount, "10");
  assert.equal(e.accepts[0].payTo, "SP3V8GHRCG9N7TN3QB9RZD7V31PQ2CPQY8Q2DGFY0");
});
test("bad payment is refused, never answered", async () => {
  const r = (await rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "ask", arguments: { question: "hello" }, _meta: { "x402/payment": "bm90LWEtcGF5bWVudA==" } } })).json.result;
  assert.equal(r.isError, true); assert.ok(!/stub answer/.test(JSON.stringify(r)));
});
test("missing args are not charged; unknown tool/method are errors; parse error", async () => {
  const r = (await rpc({ jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "ask", arguments: {} } })).json.result;
  assert.equal(r.isError, true); assert.match(r.content[0].text, /never charged/); assert.ok(!r._meta);
  assert.equal((await rpc({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "nope" } })).json.error.code, -32602);
  assert.equal((await rpc({ jsonrpc: "2.0", id: 10, method: "nope" })).json.error.code, -32601);
  const p = await app.fetch(new Request(B + "/mcp", { method: "POST", body: "{" }), env, ctx); assert.equal(p.status, 400);
});
test("batch", async () => {
  const r = await rpc([{ jsonrpc: "2.0", id: 1, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }, { jsonrpc: "2.0", id: 2, method: "tools/list" }]);
  assert.equal(r.json.length, 2);
});
