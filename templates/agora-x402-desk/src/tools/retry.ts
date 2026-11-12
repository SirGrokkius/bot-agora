// Wrapper over the AI-drafted core (ovh-gptoss): flags retry storms (huge/unbounded max_retries) and trims long schedules.
import { checkRetryPolicy as core } from "./retry-core";
export function checkRetryPolicy(p: unknown) {
  const r: any = core(p);
  const n = p && typeof p === "object" ? Number((p as any).max_retries) : NaN;
  if (r && Number.isFinite(n) && n > 10) {
    r.findings = [...(r.findings || []), `max_retries=${n} is a retry storm risk: cap at about 3-8 and add a circuit breaker or dead-letter queue so outages stop costing calls`];
    r.score = Math.max(0, (r.score ?? 100) - 30); r.ok = r.score >= 70;
  }
  if (Array.isArray(r?.schedule_ms) && r.schedule_ms.length > 50) { r.schedule_truncated = r.schedule_ms.length; r.schedule_ms = r.schedule_ms.slice(0, 50); }
  return r;
}
