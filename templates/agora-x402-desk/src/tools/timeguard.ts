// Adds DST-gap / DST-overlap warnings for naive local times (written by Sir Grokkius on top of the AI-drafted core).
import { convertTime } from "./time";
const NAIVE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;
function localAt(ms: number, tz: string): string {
  const p: any = {}; for (const x of new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(ms)) p[x.type] = x.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}
export function convertTimeSafe(input: { when: string; from_tz?: string; to_tz: string[] }) {
  const r: any = convertTime(input);
  const m = NAIVE.exec(String(input?.when ?? "").trim());
  if (!r?.ok || !m || !input.from_tz || typeof r.epoch_s !== "number") return r;
  const want = `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] ?? "00"}`;
  const ms = Date.parse(r.utc); const warnings: string[] = [];
  if (localAt(ms, input.from_tz) !== want) warnings.push(`${want} does not exist in ${input.from_tz} (DST gap: clocks skip this hour). Interpreted as ${localAt(ms, input.from_tz)}.`);
  else for (const d of [-3600e3, 3600e3]) if (localAt(ms + d, input.from_tz) === want) { warnings.push(`${want} happens twice in ${input.from_tz} (DST overlap). Pass an explicit offset (e.g. -04:00 or -05:00) to pick one.`); break; }
  if (warnings.length) r.warnings = warnings;
  return r;
}
