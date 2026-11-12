interface InspectionResult {
  ok: boolean;
  parts?: {
    protocol: string;
    host: string;
    port: string;
    path: string;
    query: Record<string, string[]>;
    fragment: string;
  };
  normalized?: string;
  findings: string[];
  error?: string;
}

export function inspectUrl(input: string): InspectionResult {
  const result: InspectionResult = { ok: false, findings: [] };

  try {
    if (typeof input !== 'string') {
      result.error = 'Input must be a string';
      return result;
    }

    if (input.length > 8192) {
      result.error = 'Input exceeds maximum length limit';
      return result;
    }

    const url = new URL(input);

    const queryRecord: Record<string, string[]> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (!queryRecord[key]) {
        queryRecord[key] = [];
      }
      queryRecord[key].push(value);
    }

    result.parts = {
      protocol: url.protocol,
      host: url.hostname,
      port: url.port,
      path: url.pathname,
      query: queryRecord,
      fragment: url.hash,
    };

    if (url.username || url.password) {
      result.findings.push('Credentials in URL');
    }

    if (url.protocol !== 'https:') {
      result.findings.push('Non-HTTPS protocol');
    }

    const ipv4Regex = /^\d{1,3}(\.\d{1,3}){3}$/;
    const isIpv4 = ipv4Regex.test(url.hostname);
    const isIpv6 = url.hostname.startsWith('[') && url.hostname.endsWith(']');
    if (isIpv4 || isIpv6) {
      result.findings.push('IP-literal host');
    }

    if (url.hostname.includes('xn--')) {
      result.findings.push('Punycode/IDN host');
    }

    if (url.search.includes('%25')) {
      result.findings.push('Double-encoded characters');
    }

    if (url.search.length > 2000) {
      result.findings.push('Very long query string');
    }

    if (url.pathname.includes('../')) {
      result.findings.push('Path traversal detected');
    }

    const trackingPrefix = 'utm_';
    const trackingExact = ['fbclid', 'gclid'];
    let hasTracking = false;

    const normUrl = new URL(url);
    for (const key of url.searchParams.keys()) {
      if (key.startsWith(trackingPrefix) || trackingExact.includes(key)) {
        hasTracking = true;
        normUrl.searchParams.delete(key);
      }
    }

    if (hasTracking) {
      result.findings.push('Tracking parameters detected');
    }

    result.normalized = normUrl.href;
    result.ok = true;
    return result;
  } catch (e) {
    result.error = 'Invalid URL format';
    return result;
  }
}
