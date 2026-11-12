/**
 * Decodes X402 v2 payment-required header.
 * Accepts raw JSON or base64 (standard / url-safe).
 * Never throws on bad input.
 */
export function decodeX402(headerOrJson: string): {
    ok: boolean;
    version?: number;
    accepts?: Array<{
        scheme: string;
        network: string;
        amount: string;
        asset: string;
        payTo: string;
        maxTimeoutSeconds?: number;
        resource?: string;
        description?: string;
    }>;
    summary: string[];
    findings: string[];
    error?: string;
} {
    const findings: string[] = [];
    const summary: string[] = [];
    let parsed: any = null;

    if (!headerOrJson) {
        return { ok: false, findings: ['empty input'], summary: [] };
    }

    // 1) try raw JSON
    try {
        parsed = JSON.parse(headerOrJson);
    } catch {
        // 2) try base64 (std or url-safe)
        let b64 = headerOrJson.trim().replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4;
        if (pad) b64 += '='.repeat(4 - pad);
        try {
            const bin = atob(b64);
            parsed = JSON.parse(bin);
        } catch {
            return { ok: false, findings: ['invalid json and not decodable base64'], summary: [] };
        }
    }

    if (!parsed || typeof parsed !== 'object') {
        return { ok: false, findings: ['decoded payload is not an object'], summary: [] };
    }

    // version
    const version = parsed.x402Version;
    if (version !== 2) {
        findings.push(`x402Version ${version ?? 'missing'} != 2`);
    }

    // accepts array
    const accepts = Array.isArray(parsed.accepts) ? parsed.accepts : [];
    if (!accepts.length) findings.push('accepts array missing or empty');

    const outAccepts: typeof accepts = [];

    for (const a of accepts) {
        if (!a || typeof a !== 'object') {
            findings.push('accepts entry not an object');
            continue;
        }

        const scheme = String(a.scheme ?? '');
        const network = String(a.network ?? '');
        const amount = String(a.amount ?? '');
        const asset = String(a.asset ?? '');
        const payTo = String(a.payTo ?? '');
        const maxTimeoutSeconds = typeof a.maxTimeoutSeconds === 'number' ? a.maxTimeoutSeconds : undefined;
        const resource = typeof a.resource === 'string' ? a.resource : undefined;
        const description = typeof a.description === 'string' ? a.description : undefined;

        // required payTo
        if (!payTo) findings.push('missing payTo');

        // amount numeric, non-zero
        const amtNum = Number(amount);
        if (!amount || Number.isNaN(amtNum) || amtNum === 0) {
            findings.push(`non-numeric or zero amount: "${amount}"`);
        } else if (amtNum > 100000) {
            findings.push(`amount > 100000 base units: ${amount}`);
        }

        // network CAIP-2 style
        if (!/^[a-z0-9]+:[A-Za-z0-9]+$/.test(network)) {
            findings.push(`network not CAIP-2: "${network}"`);
        }

        // maxTimeoutSeconds missing
        if (maxTimeoutSeconds === undefined) findings.push('missing maxTimeoutSeconds');

        // summary line
        const assetPart = asset ? ` of ${asset}` : '';
        const toPart = payTo ? ` to ${payTo}` : '';
        summary.push(`pay ${amount}${assetPart} on ${network}${toPart}`);

        outAccepts.push({ scheme, network, amount, asset, payTo, maxTimeoutSeconds, resource, description });
    }

    return {
        ok: findings.length === 0,
        version: typeof version === 'number' ? version : undefined,
        accepts: outAccepts.length ? outAccepts : undefined,
        summary,
        findings,
        error: parsed.error ? String(parsed.error) : undefined,
    };
}
