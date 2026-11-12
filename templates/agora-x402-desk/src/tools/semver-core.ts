/**
 * Cloudflare Workers compatible SemVer 2.0.0 comparison and range checking module.
 * No external dependencies. Strict input validation.
 */

export interface SemVerObj {
  major: number;
  minor: number;
  patch: number;
  prerelease: (string | number)[];
  build: string | null;
  raw: string;
}

export interface CompareResult {
  ok: boolean;
  cmp?: -1 | 0 | 1;
  a?: SemVerObj;
  b?: SemVerObj;
  satisfies?: boolean;
  error?: string;
}

const SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function parseSemVer(v: string): SemVerObj | null {
  if (typeof v !== 'string' || v.length > 256) return null;
  const m = v.match(SEMVER_REGEX);
  if (!m) return null;
  return {
    major: +m[1],
    minor: +m[2],
    patch: +m[3],
    prerelease: m[4] ? m[4].split('.').map(id => (/^\d+$/.test(id) ? +id : id)) : [],
    build: m[5] || null,
    raw: v
  };
}

function compareIdentifiers(a: string | number, b: string | number): number {
  const aIsNum = typeof a === 'number';
  const bIsNum = typeof b === 'number';
  if (aIsNum && bIsNum) return a - b;
  if (aIsNum) return -1; // Numbers have lower precedence than strings
  if (bIsNum) return 1;
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function compareSemVerObjects(a: SemVerObj, b: SemVerObj): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  
  // Prerelease logic
  const aPre = a.prerelease;
  const bPre = b.prerelease;
  
  if (aPre.length === 0 && bPre.length === 0) return 0;
  if (aPre.length === 0) return 1; // No prerelease > prerelease
  if (bPre.length === 0) return -1;

  const len = Math.min(aPre.length, bPre.length);
  for (let i = 0; i < len; i++) {
    const cmp = compareIdentifiers(aPre[i], bPre[i]);
    if (cmp !== 0) return cmp as -1 | 0 | 1;
  }
  return aPre.length > bPre.length ? 1 : -1;
}

interface Comparator {
  op: string;
  ver: SemVerObj;
}

function expandRangeToComparators(rangePart: string): Comparator[] | null {
  const r = rangePart.trim();
  if (!r) return [];
  
  // Handle X-Ranges (1.2.x, 1.x, *)
  if (r === '*' || r === 'x' || r === 'X') return []; // Matches everything
  
  const xParts = r.split('.');
  const isXRange = xParts.some(p => p.toLowerCase() === 'x' || p === '*');
  
  if (isXRange) {
    const isX = (p?: string) => p === undefined || p.toLowerCase() === 'x' || p === '*';
    const major = parseInt(xParts[0]);
    if (isNaN(major)) return null;
    if (isX(xParts[1])) { // 1.x, 1.x.x, 1.* -> >=1.0.0 <2.0.0
      return [
        { op: '>=', ver: { major, minor: 0, patch: 0, prerelease: [], build: null, raw: '' } },
        { op: '<', ver: { major: major + 1, minor: 0, patch: 0, prerelease: [], build: null, raw: '' } }
      ];
    }
    const minor = parseInt(xParts[1]);
    if (isNaN(minor)) return null;
    return [ // 1.2.x -> >=1.2.0 <1.3.0
      { op: '>=', ver: { major, minor, patch: 0, prerelease: [], build: null, raw: '' } },
      { op: '<', ver: { major, minor: minor + 1, patch: 0, prerelease: [], build: null, raw: '' } }
    ];
  }

  // Handle Hyphen Range (1.2.3 - 2.0.0)
  const hyphenMatch = r.match(/^(\d+\.\d+\.\d+(?:-[\w.]+)?)\s*-\s*(\d+\.\d+\.\d+(?:-[\w.]+)?)$/);
  if (hyphenMatch) {
    const v1 = parseSemVer(hyphenMatch[1]);
    const v2 = parseSemVer(hyphenMatch[2]);
    if (!v1 || !v2) return null;
    return [{ op: '>=', ver: v1 }, { op: '<=', ver: v2 }];
  }

  // Handle Operators (^, ~, >=, etc.)
  let op = '=';
  let verStr = r;
  
  if (/^(\^|~|>=|<=|>|<|=)/.test(r)) {
    op = r.match(/^(\^|~|>=|<=|>|<|=)/)![1];
    verStr = r.slice(op.length).trim();
  }

  const ver = parseSemVer(verStr);
  if (!ver) return null;

  if (op === '^') {
    // ^1.2.3 -> >=1.2.3 <2.0.0
    // ^0.2.3 -> >=0.2.3 <0.3.0
    // ^0.0.3 -> >=0.0.3 <0.0.4
    if (ver.major === 0) {
      if (ver.minor === 0) {
        return [{ op: '>=', ver }, { op: '<', ver: { ...ver, patch: ver.patch + 1, prerelease: [] } }];
      }
      return [{ op: '>=', ver }, { op: '<', ver: { ...ver, minor: ver.minor + 1, patch: 0, prerelease: [] } }];
    }
    return [{ op: '>=', ver }, { op: '<', ver: { major: ver.major + 1, minor: 0, patch: 0, prerelease: [], build: null, raw: '' } }];
  }

  if (op === '~') {
    // ~1.2.3 -> >=1.2.3 <1.3.0
    // ~1.2 -> >=1.2.0 <1.3.0
    return [{ op: '>=', ver }, { op: '<', ver: { ...ver, minor: ver.minor + 1, patch: 0, prerelease: [] } }];
  }

  return [{ op, ver }];
}

function satisfiesComparators(ver: SemVerObj, comps: Comparator[]): boolean {
  for (const c of comps) {
    const cmp = compareSemVerObjects(ver, c.ver);
    if (c.op === '=') { if (cmp !== 0) return false; }
    else if (c.op === '>') { if (cmp <= 0) return false; }
    else if (c.op === '<') { if (cmp >= 0) return false; }
    else if (c.op === '>=') { if (cmp < 0) return false; }
    else if (c.op === '<=') { if (cmp > 0) return false; }
    else if (c.op === '!=') { if (cmp === 0) return false; }
  }
  return true;
}

export function compareSemver(a: string, b: string, range?: string): CompareResult {
  const va = parseSemVer(a);
  const vb = parseSemVer(b);

  if (!va) return { ok: false, error: `Invalid SemVer: ${a}` };
  if (!vb) return { ok: false, error: `Invalid SemVer: ${b}` };

  const cmp = compareSemVerObjects(va, vb);
  const res: CompareResult = { ok: true, cmp, a: va, b: vb };

  if (range) {
    // Split by || for OR sets
    const orSets = range.split(/\s*\|\|\s*/);
    let satisfied = false;

    for (const setStr of orSets) {
      // Split by space for AND constraints
      const andParts = setStr.trim().split(/\s+/);
      const allComparators: Comparator[] = [];
      let validSet = true;

      for (const part of andParts) {
        if (!part) continue;
        const comps = expandRangeToComparators(part);
        if (comps === null) {
          return { ok: false, error: `Invalid range part: ${part}` };
        }
        allComparators.push(...comps);
      }

      if (satisfiesComparators(va, allComparators)) {
        satisfied = true;
        break;
      }
    }
    res.satisfies = satisfied;
  }

  return res;
}
