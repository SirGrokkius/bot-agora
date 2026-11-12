/**
 * Minimal robots.txt parser + matcher (RFC 9309 subset)
 *
 * No external dependencies – works in Cloudflare Workers.
 * The implementation follows the spec:
 *   • User‑agent matching is case‑insensitive.
 *   • The most specific (longest) user‑agent token wins; fallback to "*".
 *   • For the chosen group the Allow/Disallow rules are evaluated.
 *   • The rule with the longest matching pattern wins.
 *   • If the longest match is a tie, Allow wins.
 *   • Supports the "*" and "$" wild‑cards via a manual matcher (no RegExp).
 *   • Input limited to 500 KiB, any violation returns ok:false with an error.
 */

export function checkRobots(
	robotsTxt: string,
	userAgent: string,
	path: string
): {
	ok: boolean;
	allowed?: boolean;
	matched_rule?: string;
	group?: string;
	crawl_delay?: number;
	sitemaps?: string[];
	warnings?: string[];
	error?: string;
} {
	const MAX_SIZE = 500 * 1024; // 500 KiB

	if (robotsTxt.length > MAX_SIZE) {
		return { ok: false, error: `robots.txt exceeds ${MAX_SIZE} bytes limit` };
	}

	const warnings: string[] = [];

	/** Helper: split a line at the first ':' */
	function splitField(line: string): [string, string] | null {
		const idx = line.indexOf(':');
		if (idx === -1) return null;
		const field = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		return [field, value];
	}

	/** Helper: simple pattern matcher for *, $ wild‑cards (no RegExp) */
	function matchPattern(pattern: string, target: string): boolean {
		// Handle trailing $
		let mustEnd = false;
		if (pattern.endsWith('$')) {
			mustEnd = true;
			pattern = pattern.slice(0, -1);
		}

		// Split on *
		const parts = pattern.split('*');
		// If pattern has no '*', treat as simple starts‑with check
		if (parts.length === 1) {
			if (mustEnd) return target === parts[0];
			return target.startsWith(parts[0]);
		}

		let pos = 0;
		// First part must match at start unless pattern starts with '*'
		if (parts[0] !== '') {
			if (!target.startsWith(parts[0])) return false;
			pos = parts[0].length;
		}
		// Process middle parts
		for (let i = 1; i < parts.length - 1; i++) {
			const part = parts[i];
			if (part === '') continue; // consecutive '*'
			const idx = target.indexOf(part, pos);
			if (idx === -1) return false;
			pos = idx + part.length;
		}
		// Last part
		const last = parts[parts.length - 1];
		if (last !== '') {
			if (mustEnd) {
				// Must appear at the very end
				return target.endsWith(last);
			}
			const idx = target.indexOf(last, pos);
			if (idx === -1) return false;
			// No further checks needed
		} else {
			// Pattern ends with '*'
			if (mustEnd) {
				// '*' before '$' means any suffix, but must still end at string end
				return true;
			}
		}
		return true;
	}

	/** Types for internal representation */
	type DirectiveGroup = {
		agents: string[]; // lower‑cased tokens
		allow: string[];
		disallow: string[];
		crawlDelay?: number;
		sitemaps: string[];
	};

	const groups: DirectiveGroup[] = [];

	let currentGroup: DirectiveGroup | null = null;
	let directivesSeenInGroup = false;

	const lines = robotsTxt.split(/\r?\n/);
	for (let rawLine of lines) {
		// Strip comments
		const hashIdx = rawLine.indexOf('#');
		if (hashIdx !== -1) rawLine = rawLine.slice(0, hashIdx);
		const line = rawLine.trim();
		if (!line) continue; // empty

		const pair = splitField(line);
		if (!pair) {
			warnings.push(`Ignored malformed line (missing colon): "${rawLine}"`);
			continue;
		}
		const [rawField, rawValue] = pair;
		const field = rawField.toLowerCase();
		const value = rawValue; // keep case where needed

		if (field === 'user-agent') {
			// New group if we already have directives
			if (!currentGroup || directivesSeenInGroup) {
				currentGroup = {
					agents: [],
					allow: [],
					disallow: [],
					sitemaps: [],
				};
				groups.push(currentGroup);
				directivesSeenInGroup = false;
			}
			currentGroup.agents.push(value.toLowerCase());
			continue;
		}

		// Any other directive must belong to a group
		if (!currentGroup) {
			warnings.push(`Directive "${field}" before any User-agent line ignored`);
			continue;
		}
		directivesSeenInGroup = true;

		switch (field) {
			case 'allow':
				currentGroup.allow.push(value);
				break;
			case 'disallow':
				currentGroup.disallow.push(value);
				break;
			case 'crawl-delay': {
				const num = parseFloat(value);
				if (!isNaN(num) && isFinite(num) && num >= 0) {
					currentGroup.crawlDelay = num;
				} else {
					warnings.push(`Invalid Crawl-delay value "${value}"`);
				}
				break;
			}
			case 'sitemap':
				currentGroup.sitemaps.push(value);
				break;
			default:
				// Unknown fields are allowed per spec – ignore but warn
				warnings.push(`Unknown field "${field}" ignored`);
				break;
		}
	}

	/** Step 1 – select the best matching group */
	const uaLC = userAgent.toLowerCase();
	let bestGroup: DirectiveGroup | null = null;
	let bestTokenLen = -1;
	let bestToken = '';

	for (const grp of groups) {
		for (const token of grp.agents) {
			if (token === '*') {
				if (bestTokenLen < 0) {
					// '*' only wins if no better token found yet
					bestGroup = grp;
					bestTokenLen = 0;
					bestToken = '*';
				}
				continue;
			}
			if (uaLC.includes(token)) {
				if (token.length > bestTokenLen) {
					bestGroup = grp;
					bestTokenLen = token.length;
					bestToken = token;
				}
			}
		}
	}
	// If nothing matched and there is a "*" group, it will already be selected.
	if (!bestGroup) {
		return {
			ok: false,
			error: 'No matching User-agent group found',
			warnings: warnings.length ? warnings : undefined,
		};
	}

	/** Step 2 – evaluate Allow/Disallow rules */
	type Rule = { type: 'allow' | 'disallow'; pattern: string; length: number };
	const matchedRules: Rule[] = [];

	for (const pat of bestGroup.allow) {
		if (matchPattern(pat, path)) {
			matchedRules.push({ type: 'allow', pattern: pat, length: pat.length });
		}
	}
	for (const pat of bestGroup.disallow) {
		if (matchPattern(pat, path)) {
			matchedRules.push({ type: 'disallow', pattern: pat, length: pat.length });
		}
	}

	let allowed: boolean;
	let matchedRuleStr: string | undefined;

	if (matchedRules.length === 0) {
		allowed = true; // default allow
	} else {
		// Find longest length
		let maxLen = -1;
		for (const r of matchedRules) {
			if (r.length > maxLen) maxLen = r.length;
		}
		// Filter to those with maxLen
		const candidates = matchedRules.filter(r => r.length === maxLen);
		// Prefer Allow over Disallow on tie
		const chosen = candidates.find(r => r.type === 'allow') ?? candidates[0];
		allowed = chosen.type === 'allow';
		matchedRuleStr = `${chosen.type.charAt(0).toUpperCase() + chosen.type.slice(1)}: ${chosen.pattern}`;
	}

	/** Step 3 – collect sitemaps from all groups (per spec) */
	const allSitemaps: string[] = [];
	for (const g of groups) {
		allSitemaps.push(...g.sitemaps);
	}

	/** Compose result */
	const result: {
		ok: boolean;
		allowed?: boolean;
		matched_rule?: string;
		group?: string;
		crawl_delay?: number;
		sitemaps?: string[];
		warnings?: string[];
		error?: string;
	} = {
		ok: true,
		allowed,
		sitemaps: allSitemaps.length ? allSitemaps : undefined,
	};

	if (matchedRuleStr) result.matched_rule = matchedRuleStr;
	if (bestToken !== '*') result.group = bestToken;
	if (bestGroup.crawlDelay !== undefined) result.crawl_delay = bestGroup.crawlDelay;
	if (warnings.length) result.warnings = warnings;

	return result;
}
