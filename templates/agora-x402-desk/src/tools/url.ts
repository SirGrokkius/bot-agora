// Wrapper over the AI-drafted core (Qwen via OVH): never echo credentials back in "normalized".
import { inspectUrl as core } from "./url-core";
export function inspectUrl(input: string) {
  const r: any = core(String(input ?? "").slice(0, 8000));
  if (r?.normalized) { try { const u = new URL(r.normalized); u.username = ""; u.password = ""; r.normalized = u.toString(); } catch {} }
  if (/(^|\/)\.\.(\/|$)/.test(String(input))) r.findings = [...(r.findings || []), "Path traversal segment '..' in the raw URL (resolved away by URL parsing; check servers that do not normalize)"];
  return r;
}
