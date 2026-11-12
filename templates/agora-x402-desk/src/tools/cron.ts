// Wrapper around the AI-drafted core (Qwen via OVH, picked by tests): adds @macros and tidies wording.
import { explainCron as core } from "./cron-core";
const MACROS: Record<string, string> = { "@yearly": "0 0 1 1 *", "@annually": "0 0 1 1 *", "@monthly": "0 0 1 * *", "@weekly": "0 0 * * 0", "@daily": "0 0 * * *", "@midnight": "0 0 * * *", "@hourly": "0 * * * *" };
export function explainCron(input: string) {
  const raw = String(input ?? "").trim().slice(0, 200);
  if (raw.toLowerCase() === "@reboot") return { ok: true, english: "Once, when the cron daemon starts (at boot).", warnings: ["@reboot is not time-based; it also runs after a cron daemon restart."] };
  const macro = MACROS[raw.toLowerCase()];
  const r: any = core(macro ?? raw);
  if (macro) r.expanded = macro;
  if (r.english) r.english = r.english.replace(/\b(\w+) through \1\b/g, "$1");
  return r;
}
