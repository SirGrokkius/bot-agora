/**
 * Bot Agora - Retry Policy Lint
 *
 * Validates a retry policy configuration object.
 * Returns a report object with:
 * - ok: boolean (true if score ≥ 70)
 * - score: number (0‑100, higher is better)
 * - findings: string[] (list of issues)
 * - schedule_ms: number[] (deterministic delays, no jitter)
 * - total_wait_ms: number (sum of delays)
 *
 * Never throws on bad input; returns an error object instead.
 */

export function checkRetryPolicy(p: unknown): {
  ok: boolean;
  score: number;
  findings: string[];
  schedule_ms: number[];
  total_wait_ms: number;
} {
  // ---------- Input validation ----------
  if (typeof p !== "object" || p === null || Array.isArray(p)) {
    return {
      ok: false,
      score: 0,
      findings: ["input must be a JSON object"],
      schedule_ms: [],
      total_wait_ms: 0,
    };
  }

  const cfg = p as Record<string, unknown>;
  const findings: string[] = [];

  // ---------- Field extraction ----------
  const maxRetries =
    typeof cfg.max_retries === "number" && Number.isInteger(cfg.max_retries) && cfg.max_retries >= 0
      ? cfg.max_retries
      : null;

  const baseMs =
    typeof cfg.base_ms === "number" && Number.isFinite(cfg.base_ms) && cfg.base_ms > 0
      ? cfg.base_ms
      : null;

  const maxMs =
    typeof cfg.max_ms === "number" && Number.isFinite(cfg.max_ms) && cfg.max_ms > 0
      ? cfg.max_ms
      : null;

  const multiplier =
    typeof cfg.multiplier === "number" && Number.isFinite(cfg.multiplier) && cfg.multiplier > 0
      ? cfg.multiplier
      : null;

  const jitter =
    cfg.jitter === "none" || cfg.jitter === "full" || cfg.jitter === "equal"
      ? (cfg.jitter as string)
      : null;

  const retryOn =
    Array.isArray(cfg.retry_on) &&
    cfg.retry_on.every((v) => typeof v === "number" && Number.isInteger(v))
      ? (cfg.retry_on as number[])
      : null;

  const respectRetryAfter =
    typeof cfg.respect_retry_after === "boolean" ? cfg.respect_retry_after : null;

  const timeoutMs =
    typeof cfg.timeout_ms === "number" && Number.isFinite(cfg.timeout_ms) && cfg.timeout_ms > 0
      ? cfg.timeout_ms
      : null;

  // ---------- Missing / invalid field findings ----------
  if (maxRetries === null) findings.push("max_retries missing or invalid (non‑negative integer)");
  if (baseMs === null) findings.push("base_ms missing or invalid (positive number)");
  if (maxMs === null) findings.push("max_ms missing or invalid (positive number)");
  if (multiplier === null) findings.push("multiplier missing or invalid (positive number)");
  if (jitter === null) findings.push("jitter missing or invalid (none|full|equal)");
  if (retryOn === null) findings.push("retry_on missing or invalid (array of integers)");
  if (respectRetryAfter === null) findings.push("respect_retry_after missing or invalid (boolean)");
  if (timeoutMs === null) findings.push("timeout_ms missing or invalid (positive number)");

  // ---------- Policy checks ----------
  // 1. No jitter
  if (jitter === "none") {
    findings.push("No jitter configured; consider adding jitter to avoid thundering herd");
  }

  // 2. Retrying non‑idempotent 4xx errors
  const nonIdempotent4xx = [400, 401, 403, 404, 422];
  if (retryOn) {
    const bad = retryOn.filter((c) => nonIdempotent4xx.includes(c));
    if (bad.length) {
      findings.push(`Retrying non‑idempotent 4xx status codes: ${bad.join(", ")}`);
    }
  }

  // 3. Not retrying recommended 429 / 503
  if (retryOn) {
    const missing = [429, 503].filter((c) => !retryOn.includes(c));
    if (missing.length) {
      findings.push(`Not retrying recommended status codes: ${missing.join(", ")}`);
    }
  }

  // 4. Ignoring Retry‑After header
  if (respectRetryAfter === false) {
    findings.push("Not respecting Retry-After header; should set respect_retry_after=true");
  }

  // 5. Missing per‑attempt timeout
  if (timeoutMs === null) {
    findings.push("No per‑attempt timeout configured");
  }

  // ---------- Schedule computation ----------
  const schedule_ms: number[] = [];
  let total_wait_ms = 0;

  if (
    typeof maxRetries === "number" &&
    typeof baseMs === "number" &&
    typeof maxMs === "number" &&
    typeof multiplier === "number"
  ) {
    for (let i = 0; i < maxRetries; i++) {
      const raw = baseMs * Math.pow(multiplier, i);
      const delay = Math.min(raw, maxMs);
      const rounded = Math.round(delay);
      schedule_ms.push(rounded);
      total_wait_ms += rounded;
    }
  }

  // 6. Total wait time exceeds 5 minutes
  if (total_wait_ms > 300_000) {
    findings.push(`Total wait time ${total_wait_ms}ms exceeds 5 minutes`);
  }

  // ---------- Scoring ----------
  // Start from 100, subtract 10‑20 points per finding. We'll use 10 points per finding.
  let score = 100 - findings.length * 10;
  if (score < 0) score = 0;

  // ---------- Result ----------
  return {
    ok: score >= 70,
    score,
    findings,
    schedule_ms,
    total_wait_ms,
  };
}
