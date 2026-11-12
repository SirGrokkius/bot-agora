/**
 * Analyzes raw HTTP response headers for security best practices.
 * Designed for Cloudflare Workers (no external deps).
 * 
 * @param raw - Raw HTTP header text (e.g. "Content-Type: text/html\n...")
 * @returns Analysis result with score, findings, and parsed headers.
 */
export function checkHeaders(raw: string): { ok: boolean, headers: Record<string, string>, score: number, findings: string[], good: string[] } {
  // Strict input limits to prevent DoS
  if (typeof raw !== 'string' || raw.length > 65536) {
    return { ok: false, headers: {}, score: 0, findings: [], good: [], error: "Invalid or too large input" } as any;
  }

  const headers: Record<string, string> = {};
  const lines = raw.split(/\r?\n/);
  
  // Parse headers
  for (const line of lines) {
    if (!line.trim()) continue;
    if (line.startsWith('HTTP/')) continue; // Skip status line

    const sep = line.indexOf(':');
    if (sep === -1) continue;

    const key = line.substring(0, sep).trim().toLowerCase();
    const val = line.substring(sep + 1).trim();
    // Handle multiple headers with same name by concatenating (standard behavior)
    headers[key] = headers[key] ? `${headers[key]}, ${val}` : val;
  }

  const findings: string[] = [];
  const good: string[] = [];
  let score = 100;

  const penalize = (msg: string, pts: number) => { findings.push(msg); score -= pts; };
  const reward = (msg: string) => { good.push(msg); };

  // 1. Strict-Transport-Security (HSTS)
  const hsts = headers['strict-transport-security'];
  if (hsts) {
    const match = hsts.match(/max-age=(\d+)/);
    const age = match ? parseInt(match[1], 10) : 0;
    if (age >= 15552000) { // 6 months
      reward("HSTS max-age >= 6 months");
    } else {
      penalize(`HSTS max-age (${age}) < 15552000`, 10);
    }
  } else {
    penalize("Missing Strict-Transport-Security", 15);
  }

  // 2. Content-Security-Policy
  if (headers['content-security-policy']) {
    reward("Content-Security-Policy present");
  } else {
    penalize("Missing Content-Security-Policy", 10);
  }

  // 3. X-Content-Type-Options
  if (headers['x-content-type-options'] === 'nosniff') {
    reward("X-Content-Type-Options: nosniff");
  } else {
    penalize("Missing or invalid X-Content-Type-Options (expected nosniff)", 5);
  }

  // 4. Referrer-Policy
  if (headers['referrer-policy']) {
    reward("Referrer-Policy present");
  } else {
    penalize("Missing Referrer-Policy", 5);
  }

  // 5. Frame Protection (CSP frame-ancestors OR X-Frame-Options)
  const csp = headers['content-security-policy'] || "";
  const hasFrameAncestors = csp.includes('frame-ancestors');
  const xfo = headers['x-frame-options'];
  const hasXfo = xfo && (xfo.toUpperCase() === 'DENY' || xfo.toUpperCase() === 'SAMEORIGIN');

  if (hasFrameAncestors || hasXfo) {
    reward("Clickjacking protection enabled");
  } else {
    penalize("Missing frame protection (CSP frame-ancestors or X-Frame-Options)", 10);
  }

  // 6. CORS Misconfiguration
  const acao = headers['access-control-allow-origin'];
  const acac = headers['access-control-allow-credentials'];
  if (acao === '*' && acac === 'true') {
    penalize("CRITICAL: CORS wildcard (*) with Allow-Credentials true", 20);
  }

  // 7. Cache-Control on Private Responses
  if (headers['set-cookie']) {
    const cc = headers['cache-control'] || "";
    const isPrivate = cc.includes('no-store') || cc.includes('private');
    if (!isPrivate) {
      penalize("Set-Cookie present without Cache-Control no-store/private", 10);
    } else {
      reward("Cache-Control correctly configured for cookies");
    }
  }

  // 8. Version Leaks (Server / X-Powered-By)
  ['server', 'x-powered-by'].forEach(k => {
    const val = headers[k];
    if (val) {
      // Simple heuristic: if it contains digits, it likely leaks version
      if (/\d/.test(val)) {
        penalize(`Information leak in ${k}: ${val}`, 2);
      }
    }
  });

  // 9. Retry-After Validity
  const retry = headers['retry-after'];
  if (retry) {
    const isInt = /^\d+$/.test(retry);
    const isDate = !isNaN(Date.parse(retry));
    if (!isInt && !isDate) {
      penalize(`Invalid Retry-After format: ${retry}`, 2);
    }
  }

  return {
    ok: true,
    headers,
    score: Math.max(0, score),
    findings,
    good
  };
}
