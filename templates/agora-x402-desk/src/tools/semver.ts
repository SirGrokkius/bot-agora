// Wrapper over the AI-drafted core (Qwen via OVH, picked by tests): normalize cmp to -1/0/1.
import { compareSemver as core } from "./semver-core";
export function compareSemver(a: string, b: string, range?: string) {
  const r: any = core(String(a ?? "").slice(0, 100), String(b ?? "").slice(0, 100), range ? String(range).slice(0, 200) : undefined);
  if (typeof r.cmp === "number") r.cmp = Math.sign(r.cmp);
  return r;
}
