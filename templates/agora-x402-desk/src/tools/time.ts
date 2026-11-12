/**
 * convertTime — timezone conversion for Cloudflare Workers (no external deps).
 *
 * Parses `when` (ISO 8601, epoch seconds/ms, or 'now'), resolves it to a UTC
 * instant, then renders it in up to 10 target zones using Intl.DateTimeFormat.
 * Naive local times (no zone designator) are interpreted in `from_tz`
 * (default 'UTC'). Never throws on bad input: returns { ok:false, error }.
 */

type Target = { tz: string; local: string; offset: string; dst?: boolean };

type Result =
  | { ok: true; utc: string; epoch_s: number; results: Target[] }
  | { ok: false; error: string };

const MAX_MS = 8.64e15;            // ECMAScript max Date range (±100,000,000 days)
const EPOCH_MS_THRESHOLD = 1e11;   // |value| >= this ⇒ treat as epoch ms, else seconds
const MAX_WHEN_LEN = 64;
const MAX_TZ_LEN = 64;
const MAX_ZONES = 10;

const pad2 = (n: number): string => String(n).padStart(2, '0');

// One cached DateTimeFormat per zone (construction throws on invalid names).
const dtfCache = new Map<string, Intl.DateTimeFormat>();
function getDTF(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    dtfCache.set(tz, f);
  }
  return f;
}

/** Validate a zone name via try/catch on Intl (no throw escapes). */
function isValidZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > MAX_TZ_LEN) return false;
  try {
    getDTF(tz); // RangeError on unknown zone
    return true;
  } catch {
    return false;
  }
}

/** Build a UTC epoch (ms) from parts without Date.UTC's 0–99 ⇒ 1900s quirk. */
function makeUTC(y: number, mo: number, d: number, h = 0, mi = 0, s = 0, ms = 0): number {
  const dt = new Date(0);
  dt.setUTCFullYear(y, mo - 1, d);
  dt.setUTCHours(h, mi, s, ms);
  return dt.getTime();
}

/** Numeric wall-clock parts of UTC instant `ms` as observed in `tz`. */
function partsAt(ms: number, tz: string): Record<string, number> {
  const p: Record<string, number> = {};
  for (const part of getDTF(tz).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
  }
  return p;
}

/** Offset (ms) added to UTC to get local wall-clock in `tz` at instant `ms`. */
function offsetMsAt(ms: number, tz: string): number {
  const p = partsAt(ms, tz);
  const asUTC = makeUTC(p.year, p.month, p.day, p.hour, p.minute, p.second);
  return asUTC - Math.floor(ms / 1000) * 1000;
}

/** Resolve a naive wall-clock (ms-as-if-UTC) in `tz` to a real UTC instant. */
function localToUtcMs(localMs: number, tz: string): number {
  let utcMs = localMs;
  for (let i = 0; i < 3; i++) {
    const next = localMs - offsetMsAt(utcMs, tz);
    if (next === utcMs) break;
    utcMs = next;
  }
  return utcMs;
}

/** Format instant `ms` as 'YYYY-MM-DD HH:mm:ss' in `tz`. */
function formatLocal(ms: number, tz: string): string {
  const p = partsAt(ms, tz);
  return (
    `${String(p.year).padStart(4, '0')}-${pad2(p.month)}-${pad2(p.day)}` +
    ` ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`
  );
}

/** Offset string like '+05:30' / '-08:00' / '+00:00' for `tz` at instant `ms`. */
function formatOffset(ms: number, tz: string): string {
  const total = Math.round(offsetMsAt(ms, tz) / 60000);
  const sign = total < 0 ? '-' : '+';
  const abs = Math.abs(total);
  return `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`;
}

/** DST flag: current offset exceeds the zone's standard (minimum) offset for the year. */
function isDst(ms: number, tz: string): boolean {
  const year = new Date(ms).getUTCFullYear();
  const jan = offsetMsAt(makeUTC(year, 1, 1), tz);
  const jul = offsetMsAt(makeUTC(year, 7, 1), tz);
  return jan !== jul && offsetMsAt(ms, tz) > Math.min(jan, jul);
}

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?(Z|z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/** Parse '+05:30' / '-0800' / '+05' into signed milliseconds. */
function parseOffsetMs(tok: string): number {
  const sign = tok[0] === '-' ? -1 : 1;
  const body = tok.slice(1).replace(':', '');
  const hh = parseInt(body.slice(0, 2), 10);
  const mm = body.length > 2 ? parseInt(body.slice(2, 4), 10) : 0;
  return sign * (hh * 60 + mm) * 60000;
}

/** Resolve `when` to a UTC epoch (ms), or throw Error on invalid input. */
function parseWhenMs(when: string, fromTz: string): number {
  const s = when.trim();
  if (s.length === 0) throw new Error('empty when');
  if (s.length > MAX_WHEN_LEN) throw new Error('when too long');
  if (s.toLowerCase() === 'now') return Date.now();

  // Pure numeric ⇒ epoch. Large magnitude is ms, otherwise seconds.
  if (/^[+-]?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) throw new Error('invalid epoch');
    const ms = Math.round(Math.abs(n) >= EPOCH_MS_THRESHOLD ? n : n * 1000);
    if (Math.abs(ms) > MAX_MS) throw new Error('epoch out of range');
    return ms;
  }

  // ISO 8601 (extended) — parsed deterministically without relying on Date.parse.
  const m = ISO_RE.exec(s);
  if (m) {
    const year = +m[1];
    const month = +m[2];
    const day = +m[3];
    const hasTime = m[4] !== undefined;
    const hour = hasTime ? +m[4] : 0;
    const minute = hasTime ? +m[5] : 0;
    const second = m[6] !== undefined ? +m[6] : 0;
    const millis = m[7] ? +((m[7] + '000').slice(0, 3)) : 0;

    if (month < 1 || month > 12) throw new Error('month out of range');
    if (day < 1 || day > 31) throw new Error('day out of range');
    if (hour > 23 || minute > 59 || second > 59) throw new Error('time out of range');

    const localMs = makeUTC(year, month, day, hour, minute, second, millis);
    // Reject impossible calendar dates (e.g. Feb 30) via round-trip check.
    const back = new Date(localMs);
    if (back.getUTCFullYear() !== year || back.getUTCMonth() + 1 !== month || back.getUTCDate() !== day) {
      throw new Error('invalid calendar date');
    }
    if (Math.abs(localMs) > MAX_MS) throw new Error('date out of range');

    if (m[8] === undefined) return localToUtcMs(localMs, fromTz); // naive ⇒ from_tz
    if (m[8] === 'Z' || m[8] === 'z') return localMs;             // UTC
    return localMs - parseOffsetMs(m[8]);                          // explicit offset
  }

  // Last resort: let the engine try (e.g. RFC 2822); result must land in range.
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed) && Math.abs(parsed) <= MAX_MS) return parsed;
  throw new Error('unrecognized when');
}

export function convertTime(input: {
  when: string;
  from_tz?: string;
  to_tz: string[];
}): Result {
  try {
    if (input === null || typeof input !== 'object') {
      return { ok: false, error: 'input must be an object' };
    }
    const { when, from_tz, to_tz } = input;

    if (typeof when !== 'string') return { ok: false, error: 'when must be a string' };

    // from_tz defaults to UTC when missing/empty.
    const fromTz = from_tz == null || from_tz === '' ? 'UTC' : from_tz;
    if (!isValidZone(fromTz)) return { ok: false, error: 'invalid from_tz' };

    if (!Array.isArray(to_tz)) return { ok: false, error: 'to_tz must be an array' };
    if (to_tz.length === 0) return { ok: false, error: 'to_tz must not be empty' };
    if (to_tz.length > MAX_ZONES) return { ok: false, error: `to_tz max ${MAX_ZONES} zones` };
    for (const z of to_tz) {
      if (!isValidZone(z)) return { ok: false, error: `invalid time zone: ${String(z)}` };
    }

    let ms: number;
    try {
      ms = parseWhenMs(when, fromTz);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'invalid when' };
    }
    if (!Number.isFinite(ms) || Math.abs(ms) > MAX_MS) {
      return { ok: false, error: 'when out of range' };
    }

    const results: Target[] = to_tz.map((tz) => ({
      tz,
      local: formatLocal(ms, tz),
      offset: formatOffset(ms, tz),
      dst: isDst(ms, tz),
    }));

    return {
      ok: true,
      utc: new Date(ms).toISOString(),
      epoch_s: Math.floor(ms / 1000),
      results,
    };
  } catch {
    return { ok: false, error: 'internal error' };
  }
}
