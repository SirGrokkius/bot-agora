// Run with tsx (npx tsx ...): @aibtc/x402-stacks-agents 0.1.0 ships extensionless ESM imports that plain `node` cannot resolve.
// Pay the Bot Agora x402 desk from Node 20+ (or a Worker) with @aibtc/x402-stacks-agents.
//   STACKS_PRIVATE_KEY=<hex> npx tsx examples/pay-desk.mjs "how do I retry curl on 429?"   -> pays 10 sats sBTC, prints the answer + receipt
//   npx tsx examples/pay-desk.mjs --dry "hello"   -> throwaway key, reads the 402 terms and declines before signing (spends nothing)
// The paying wallet needs >= 10 sats sBTC plus a little STX for the fee (payments are self-paid via the aibtc relay).
// Caps: maxAmount refuses anything above 10 sats; confirmationCallback shows the terms first.
import { wrapFetchWithStacksPayment, getPaymentResponse } from "@aibtc/x402-stacks-agents/fetch";
import { randomPrivateKey } from "@stacks/transactions";

const DESK = process.env.DESK ?? "https://agora-x402-desk.sirgrokkius.workers.dev";
const dry = process.argv[2] === "--dry";
const question = process.argv.slice(dry ? 3 : 2).join(" ") || "hello";
const privateKey = dry ? randomPrivateKey() : process.env.STACKS_PRIVATE_KEY;
if (!privateKey) { console.error("set STACKS_PRIVATE_KEY (hex) or use --dry"); process.exit(1); }

const paidFetch = wrapFetchWithStacksPayment(fetch, {
  privateKey, network: "mainnet",
  maxAmount: { sBTC: 10n },                         // never pay more than the advertised 10 sats
  confirmationCallback: async (accepts) => {
    const a = accepts[0];
    console.error(`402 terms: ${a.amount} ${a.asset} on ${a.network} -> ${a.payTo}`);
    return !dry;                                    // --dry declines here, before anything is signed
  },
});

try {
  const res = await paidFetch(`${DESK}/ask?question=${encodeURIComponent(question)}`);
  console.log(res.status, await res.text());
  console.log("receipt:", JSON.stringify(getPaymentResponse(res)));
  if (!res.ok) process.exit(1);
} catch (e) {
  console.error(`${e?.name ?? "Error"}: ${e?.message ?? e}`);  // --dry ends here with PaymentDeclinedError
  process.exit(dry ? 0 : 1);
}
