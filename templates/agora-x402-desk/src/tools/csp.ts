/**
 * Content Security Policy (CSP) parser for Cloudflare Workers.
 *
 * The function analyses a CSP header value and returns:
 * - a map of directives → array of source expressions,
 * - a list of security‑related findings,
 * - a simple risk score (100 = perfect, lower = weaker).
 *
 * No external dependencies, no dynamic RegExp from user input.
 */

type ParseResult = {
	/** true if parsing succeeded, false otherwise */
	ok: boolean;
	/** map of directive → sources (present only on success) */
	directives?: Record<string, string[]>;
	/** each issue found in the policy */
	findings: string[];
	/** security score (0‑100) */
	score: number;
	/** error message when ok === false */
	error?: string;
};

export function parseCsp(header: string): ParseResult {
	// -----------------------------------------------------------------
	// Helper to safely split a header into directives and sources
	// -----------------------------------------------------------------
	const result: ParseResult = {ok: false, findings: [], score: 0};

	if (typeof header !== "string" || header.trim() === "") {
		result.error = "CSP header must be a non‑empty string";
		return result;
	}

	const directives: Record<string, string[]> = {};

	// Split on ';', then on whitespace – no user‑controlled RegExp
	const rawDirectives = header.split(";");

	for (let raw of rawDirectives) {
		raw = raw.trim();
		if (!raw) continue; // skip empty parts

		// Manual whitespace split to avoid regex built from input
		const parts: string[] = [];
		let token = "";
		for (let i = 0; i < raw.length; i++) {
			const ch = raw[i];
			if (ch === " " || ch === "\t") {
				if (token) {
					parts.push(token);
					token = "";
				}
			} else {
				token += ch;
			}
		}
		if (token) parts.push(token);

		if (parts.length === 0) continue;

		const name = parts[0].toLowerCase();
		const sources = parts.slice(1);
		directives[name] = sources;
	}

	// -------------------------------------------------------------
	// Analyse the parsed directives
	// -------------------------------------------------------------
	const findings: string[] = [];

	// ------- script-src specific checks -------
	const scriptSrc = directives["script-src"];
	if (scriptSrc) {
		if (scriptSrc.includes("'unsafe-inline'"))
			findings.push("script-src contains 'unsafe-inline'");

		if (scriptSrc.includes("'unsafe-eval'"))
			findings.push("script-src contains 'unsafe-eval'");

		if (scriptSrc.some((s) => s.toLowerCase().startsWith("data:")))
			findings.push("script-src contains data: source");

		scriptSrc.forEach((src) => {
			if (src === "*")
				findings.push("script-src contains wildcard '*'");
			else if (src.toLowerCase().startsWith("http:"))
				findings.push(`script-src contains insecure http source '${src}'`);
		});
	}

	// ------- default-src must exist -------
	if (!directives["default-src"]) {
		findings.push("missing default-src directive");
	}

	// ------- object-src should be 'none' -------
	const objectSrc = directives["object-src"];
	if (!objectSrc || !objectSrc.includes("'none'")) {
		findings.push("object-src is missing or does not contain 'none'");
	}

	// ------- wildcard / http: in any other directive -------
	for (const [name, sources] of Object.entries(directives)) {
		if (name === "script-src") continue; // already handled
		sources.forEach((src) => {
			if (src === "*")
				findings.push(`${name} contains wildcard '*'`);
			else if (src.toLowerCase().startsWith("http:"))
				findings.push(`${name} contains insecure http source '${src}'`);
		});
	}

	// ------- missing frame-ancestors -------
	if (!directives["frame-ancestors"]) {
		findings.push("missing frame-ancestors directive");
	}

	// ------- missing base-uri -------
	if (!directives["base-uri"]) {
		findings.push("missing base-uri directive");
	}

	// -------------------------------------------------------------
	// Scoring – start at 100, subtract penalties per finding
	// -------------------------------------------------------------
	const penaltyMap: Record<string, number> = {
		"script-src contains 'unsafe-inline'": 20,
		"script-src contains 'unsafe-eval'": 15,
		"script-src contains data: source": 10,
		"missing default-src directive": 10,
		"object-src is missing or does not contain 'none'": 10,
		"missing frame-ancestors directive": 10,
		"missing base-uri directive": 10,
	};

	let score = 100;

	for (const f of findings) {
		if (f.includes("wildcard")) {
			score -= 5; // per wildcard occurrence
		} else if (f.includes("insecure http source")) {
			score -= 5; // per insecure http source
		} else {
			score -= penaltyMap[f] ?? 0;
		}
	}

	if (score < 0) score = 0;

	// -------------------------------------------------------------
	// Return final result
	// -------------------------------------------------------------
	return {
		ok: true,
		directives,
		findings,
		score,
	};
}
