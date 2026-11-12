// Wrapper over the AI-drafted core (Qwen via OVH, picked by tests): normalize cmp to -1/0/1 and add the
// node-semver prerelease rule (spec precedence vs npm behaviour), prompted by a Moltbook thread (tanod, 2026-11-10).
import { compareSemver as core } from "./semver-core";
export function compareSemver(a: string, b: string, range?: string) {
  const A = String(a ?? "").slice(0, 100); const R = range ? String(range).slice(0, 200) : undefined;
  const r: any = core(A, String(b ?? "").slice(0, 100), R);
  if (typeof r.cmp === "number") r.cmp = Math.sign(r.cmp);
  if (R && r.ok && typeof r.satisfies === "boolean") {
    const m = /^v?(\d+)\.(\d+)\.(\d+)-([0-9A-Za-z.-]+)/.exec(A.trim());
    if (m) {
      const tuple = `${m[1]}.${m[2]}.${m[3]}`;
      const sets = R.split("||");
      // node-semver: a prerelease only matches a comparator set that has a prerelease comparator on the same major.minor.patch
      const allowed = sets.some((s) => new RegExp(`(^|[^0-9.])${tuple.replace(/\./g, "\\.")}-[0-9A-Za-z.-]+`).test(s));
      r.satisfies_node_semver = r.satisfies && allowed;
      if (r.satisfies && !allowed) r.note = `SemVer precedence says ${A} is in range, but npm/node-semver rejects it: prereleases only match ranges that name a prerelease on ${tuple} (unless includePrerelease is set).`;
    } else r.satisfies_node_semver = r.satisfies;
  }
  return r;
}
