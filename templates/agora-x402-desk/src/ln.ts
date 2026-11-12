// Lightning pay-per-answer for the desk, no custody and no wallet keys on the server.
// Flow: GET /ln/ask?question=... -> 402 with a BOLT11 invoice from the operator's Lightning address
// (LNURL-pay) and a one-time token. Pay it, then GET the same URL plus &ln=TOKEN. The desk checks the
// invoice with the wallet's public LUD-21 verify URL and answers once per paid token. If the AI fails,
// the token stays unused so the caller can retry without paying again.
export const LN_PRICE_SATS = 10;

const sha = async (s: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");

// BOLT11 amount from the human-readable part, in sats (null if absent/unparseable).
export function bolt11Sats(pr: string): number | null {
  const m = /^ln(?:bc|tb|bcrt)(\d+)([munp]?)1/i.exec(pr.trim()); if (!m) return null;
  const n = Number(m[1]); const mult: Record<string, number> = { "": 1e8, m: 1e5, u: 100, n: 0.1, p: 0.0001 };
  return n * mult[m[2].toLowerCase()];
}

export async function lnInvoice(kv: any, lnAddress: string, question: string, memo: string, sats = LN_PRICE_SATS, extra: Record<string, unknown> = {}, ttl = 86400) {
  const [user, host] = lnAddress.split("@");
  const meta: any = await (await fetch(`https://${host}/.well-known/lnurlp/${user}`)).json();
  if (meta?.tag !== "payRequest" || !meta.callback) throw new Error("lnurlp unavailable");
  const u = new URL(meta.callback); u.searchParams.set("amount", String(sats * 1000));
  if (meta.commentAllowed) u.searchParams.set("comment", memo.slice(0, Math.min(Number(meta.commentAllowed) || 0, 120)));
  const inv: any = await (await fetch(u.toString())).json();
  if (!inv?.pr || !inv?.verify) throw new Error("wallet returned no invoice/verify URL");
  if (bolt11Sats(inv.pr) !== sats) throw new Error("invoice amount mismatch");
  const token = crypto.randomUUID();
  await kv.put(`ln:${token}`, JSON.stringify({ verify: inv.verify, q: await sha(question), state: "open", sats, ...extra, at: new Date().toISOString() }), { expirationTtl: ttl });
  return { token, invoice: inv.pr };
}

// Returns {ok:true, rec} when the token is ours, matches the question, is unused, and the invoice is settled.
export async function lnCheck(kv: any, token: string, question: string) {
  const raw = await kv.get(`ln:${token}`); if (!raw) return { ok: false, status: 402, error: "unknown or expired token (tokens last 24h); request a new invoice" };
  const rec = JSON.parse(raw);
  if (rec.state === "used") return { ok: false, status: 409, error: "this token was already used for an answer" };
  if (rec.q !== (await sha(question))) return { ok: false, status: 400, error: "token was issued for a different question" };
  const v: any = await (await fetch(rec.verify)).json().catch(() => null);
  if (!v?.settled) return { ok: false, status: 402, error: "invoice not paid yet", invoice: v?.pr };
  return { ok: true, rec, preimage: v.preimage ?? null };
}
export async function lnMarkUsed(kv: any, token: string, rec: any) {
  await kv.put(`ln:${token}`, JSON.stringify({ ...rec, state: "used", used_at: new Date().toISOString() }), { expirationTtl: 30 * 86400 });
}

// Read-only payment status for an order token (no answer is consumed).
export async function lnStatus(kv: any, token: string) {
  const raw = await kv.get(`ln:${token}`); if (!raw) return null;
  const rec = JSON.parse(raw); const v: any = await (await fetch(rec.verify)).json().catch(() => null);
  return { rec, settled: !!v?.settled, preimage: v?.settled ? v?.preimage ?? null : null };
}
