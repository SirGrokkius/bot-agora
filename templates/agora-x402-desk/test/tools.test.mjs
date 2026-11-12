// Regression tests for the deterministic desk tools. Run: npm test  (bundles src/tools with esbuild, then node:test)
import { test } from "node:test"; import assert from "node:assert/strict";
import { buildSync } from "esbuild"; import { mkdtempSync } from "node:fs"; import { tmpdir } from "node:os"; import { join } from "node:path";
const dir = mkdtempSync(join(tmpdir(), "desk-tools-"));
const load = async (n) => { const out = join(dir, n + ".mjs"); buildSync({ entryPoints: [new URL(`../src/tools/${n}.ts`, import.meta.url).pathname], bundle: true, format: "esm", outfile: out, logLevel: "error" }); return import(out); };
const { explainCron } = await load("cron"); const { validateJson } = await load("json"); const { checkRetryPolicy } = await load("retry");
const { decodeX402 } = await load("x402"); const { explainStatus } = await load("http"); const { compareSemver } = await load("semver");
const { convertTime } = await load("time"); const { checkHeaders } = await load("headers");
test("cron", () => {
  assert.match(explainCron("*/15 9-17 * * MON-FRI").english, /Monday through Friday/);
  assert.equal(explainCron("@weekly").expanded, "0 0 * * 0");
  assert.equal(explainCron("61 * * * *").ok, false);
  assert.ok(explainCron("0 0 31 2 *").warnings.some((w) => /February/.test(w)));
  assert.equal(explainCron("garbage").ok, false);
});
test("json", () => { const r = validateJson('{"a":1,}'); assert.equal(r.ok, false); assert.equal(r.column, 8); assert.equal(validateJson('{"a":[1]}').ok, true); });
test("retry", () => {
  assert.equal(checkRetryPolicy({ max_retries: 1000, base_ms: 1000, max_ms: 10000, multiplier: 2, jitter: "full", retry_on: [429, 503], respect_retry_after: true, timeout_ms: 5000 }).ok, false);
  const bad = checkRetryPolicy({ max_retries: 5, base_ms: 200, max_ms: 10000, multiplier: 2, jitter: "none", retry_on: [400, 500], respect_retry_after: false });
  assert.equal(bad.ok, false); assert.deepEqual(bad.schedule_ms, [200, 400, 800, 1600, 3200]);
  assert.equal(checkRetryPolicy({ max_retries: 3, base_ms: 500, max_ms: 8000, multiplier: 2, jitter: "full", retry_on: [429, 503], respect_retry_after: true, timeout_ms: 5000 }).ok, true);
  assert.equal(checkRetryPolicy("x").ok, false);
});
test("x402", () => {
  const pr = JSON.stringify({ x402Version: 2, accepts: [{ scheme: "exact", network: "stacks:1", amount: "10", asset: "sbtc", payTo: "SP3V8GHRCG9N7TN3QB9RZD7V31PQ2CPQY8Q2DGFY0", maxTimeoutSeconds: 300 }] });
  assert.equal(decodeX402(pr).ok, true); assert.equal(decodeX402(Buffer.from(pr).toString("base64")).ok, true);
  assert.equal(decodeX402('{"x402Version":2,"accepts":[{"network":"bad","amount":"0"}]}').ok, false); assert.equal(decodeX402("%%%").ok, false);
});
test("http", () => { assert.equal(explainStatus(429).retryable, true); assert.equal(explainStatus("404").retryable, false); assert.equal(explainStatus(999).ok, false); });
test("semver", () => {
  assert.equal(compareSemver("1.2.3-beta.2", "1.2.3-beta.10").cmp, -1); assert.equal(compareSemver("1.0.0", "1.0.0+build").cmp, 0);
  assert.equal(compareSemver("1.3.0", "1.0.0", "~1.2.0").satisfies, false); assert.equal(compareSemver("0.2.5", "1.0.0", "^0.2.3").satisfies, true);
});
test("time", () => {
  const r = convertTime({ when: "2026-11-11T19:00:00", from_tz: "America/New_York", to_tz: ["UTC", "Asia/Tokyo"] });
  assert.equal(r.utc, "2026-11-12T00:00:00.000Z"); assert.equal(r.results[1].local, "2026-11-12 09:00:00");
  assert.equal(convertTime({ when: "now", to_tz: ["Bad/Zone"] }).ok, false);
});
test("headers", () => {
  const r = checkHeaders("Access-Control-Allow-Origin: *\nAccess-Control-Allow-Credentials: true\nServer: nginx/1.18.0");
  assert.ok(r.findings.some((f) => /CORS/.test(f))); assert.ok(r.findings.some((f) => /nginx/.test(f)));
  assert.equal(checkHeaders("strict-transport-security: max-age=31536000\ncontent-security-policy: default-src 'self'; frame-ancestors 'none'\nx-content-type-options: nosniff\nreferrer-policy: no-referrer").score, 100);
});
test("time DST guard", async () => {
  const { convertTimeSafe } = await load("timeguard");
  assert.match(convertTimeSafe({ when: "2026-03-08T02:30:00", from_tz: "America/New_York", to_tz: ["UTC"] }).warnings[0], /does not exist/);
  assert.match(convertTimeSafe({ when: "2026-11-01T01:30:00", from_tz: "America/New_York", to_tz: ["UTC"] }).warnings[0], /twice/);
  assert.equal(convertTimeSafe({ when: "2026-11-11T19:00:00", from_tz: "America/New_York", to_tz: ["UTC"] }).warnings, undefined);
});
test("csp/robots/url", async () => {
  const { parseCsp } = await load("csp"); const { checkRobots } = await load("robots"); const { inspectUrl } = await load("url");
  assert.ok(parseCsp("script-src * 'unsafe-inline'").findings.length >= 3);
  assert.equal(parseCsp("default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'").score, 100);
  const txt = "User-agent: *\nDisallow: /private\nAllow: /private/ok$\n\nUser-agent: GPTBot\nDisallow: /";
  assert.equal(checkRobots(txt, "Mozilla", "/private/x").allowed, false); assert.equal(checkRobots(txt, "Mozilla", "/private/ok").allowed, true);
  assert.equal(checkRobots(txt, "GPTBot/1.0", "/a").allowed, false);
  const u = inspectUrl("http://user:pw@127.0.0.1/a?utm_source=x&id=1"); assert.ok(!u.normalized.includes("pw")); assert.ok(u.findings.includes("Credentials in URL"));
});
test("semver node prerelease rule", async () => {
  const { compareSemver } = await load("semver");
  const r = compareSemver("27.0.0-alpha.0", "26.0.0", ">=26.0.0"); assert.equal(r.satisfies, true); assert.equal(r.satisfies_node_semver, false);
  assert.equal(compareSemver("27.0.0-beta.3", "0.0.0", ">=27.0.0-alpha.0").satisfies_node_semver, true);
  assert.equal(compareSemver("26.1.0", "0.0.0", ">=26.0.0").satisfies_node_semver, true);
});
test("semver x-ranges", async () => {
  const { compareSemver } = await load("semver");
  assert.equal(compareSemver("2.5.1", "3.0.0", "2.x").satisfies, true); assert.equal(compareSemver("3.0.0", "2.5.1", "2.x").satisfies, false);
  assert.equal(compareSemver("1.2.9", "0.0.0", "1.2.x").satisfies, true); assert.equal(compareSemver("1.3.0", "0.0.0", "1.2.x").satisfies, false);
  assert.equal(compareSemver("1.9.0", "0.0.0", "1.x.x").satisfies, true);
});
test("bolt11 amount", async () => {
  const { bolt11Sats } = await load("../ln");
  assert.equal(bolt11Sats("lnbc100n1pxyz"), 10); assert.equal(bolt11Sats("lnbc210n1p40t"), 21); assert.equal(bolt11Sats("lnbc1u1pq"), 100); assert.equal(bolt11Sats("lnbc1pq"), null);
});
