/**
 * Cloudflare Workers compatible module for HTTP Status Code explanation.
 * No external dependencies. Covers IANA 100-511 + common unofficial/Cloudflare codes.
 */

export interface StatusExplanation {
  ok: boolean;
  code?: number;
  name?: string;
  class?: string;
  meaning?: string;
  retryable?: boolean;
  retry_advice?: string;
  idempotency_note?: string;
  error?: string;
}

// Comprehensive map of status codes
const STATUS_DATA: Record<number, { name: string; meaning: string }> = {
  // 1xx Informational
  100: { name: "Continue", meaning: "Request received, continuing process" },
  101: { name: "Switching Protocols", meaning: "Switching to another protocol as requested" },
  102: { name: "Processing", meaning: "Request accepted, processing continues (WebDAV)" },
  103: { name: "Early Hints", meaning: "Return some response headers before final HTTP message" },
  
  // 2xx Success
  200: { name: "OK", meaning: "Standard response for successful HTTP requests" },
  201: { name: "Created", meaning: "Request has been fulfilled, resulting in creation of a new resource" },
  202: { name: "Accepted", meaning: "Request accepted for processing, but processing has not been completed" },
  203: { name: "Non-Authoritative Information", meaning: "Request successful but returned info from another source" },
  204: { name: "No Content", meaning: "Server successfully processed the request and is not returning any content" },
  205: { name: "Reset Content", meaning: "Server successfully processed the request, asks user to reset document view" },
  206: { name: "Partial Content", meaning: "Server delivers only part of the resource due to range header" },
  207: { name: "Multi-Status", meaning: "Provides status for multiple independent operations (WebDAV)" },
  208: { name: "Already Reported", meaning: "Members of a DAV binding have already been enumerated (WebDAV)" },
  226: { name: "IM Used", meaning: "Server has fulfilled a GET request for the resource, result is instance manipulation" },

  // 3xx Redirection
  300: { name: "Multiple Choices", meaning: "Request has more than one possible response" },
  301: { name: "Moved Permanently", meaning: "URL of requested resource has been changed permanently" },
  302: { name: "Found", meaning: "URL of requested resource has been changed temporarily" },
  303: { name: "See Other", meaning: "Response to request can be found under another URI using GET" },
  304: { name: "Not Modified", meaning: "Resource has not been modified since last request" },
  305: { name: "Use Proxy", meaning: "Requested resource must be accessed through a proxy (deprecated)" },
  306: { name: "Switch Proxy", meaning: "No longer used, originally meant subsequent requests use proxy" },
  307: { name: "Temporary Redirect", meaning: "Redirect to another URL, method must not change" },
  308: { name: "Permanent Redirect", meaning: "Redirect to another URL, method must not change, permanent" },

  // 4xx Client Error
  400: { name: "Bad Request", meaning: "Server cannot process request due to client error (e.g. malformed syntax)" },
  401: { name: "Unauthorized", meaning: "Authentication required and has failed or not been provided" },
  402: { name: "Payment Required", meaning: "Reserved for future use (digital payments)" },
  403: { name: "Forbidden", meaning: "Server understood request but refuses to authorize it" },
  404: { name: "Not Found", meaning: "Requested resource could not be found" },
  405: { name: "Method Not Allowed", meaning: "Request method is known by server but has been disabled" },
  406: { name: "Not Acceptable", meaning: "Server cannot produce response matching Accept headers" },
  407: { name: "Proxy Authentication Required", meaning: "Client must authenticate itself to proxy" },
  408: { name: "Request Timeout", meaning: "Server timed out waiting for request" },
  409: { name: "Conflict", meaning: "Request conflicts with current state of server" },
  410: { name: "Gone", meaning: "Requested resource is no longer available and will not be available again" },
  411: { name: "Length Required", meaning: "Content-Length header field is not defined" },
  412: { name: "Precondition Failed", meaning: "Precondition given in headers evaluated to false" },
  413: { name: "Payload Too Large", meaning: "Request entity is larger than limits defined by server" },
  414: { name: "URI Too Long", meaning: "URI requested by client is longer than server is willing to interpret" },
  415: { name: "Unsupported Media Type", meaning: "Media format of requested data is not supported" },
  416: { name: "Range Not Satisfiable", meaning: "Client asked for part of file but server cannot supply that portion" },
  417: { name: "Expectation Failed", meaning: "Server cannot meet requirements of Expect request-header field" },
  418: { name: "I'm a teapot", meaning: "Server refuses to brew coffee because it is a teapot (RFC 2324)" },
  421: { name: "Misdirected Request", meaning: "Request was directed at a server that is not able to produce a response" },
  422: { name: "Unprocessable Entity", meaning: "Request well-formed but contains semantic errors (WebDAV)" },
  423: { name: "Locked", meaning: "Resource is locked (WebDAV)" },
  424: { name: "Failed Dependency", meaning: "Request failed due to failure of a previous request (WebDAV)" },
  425: { name: "Too Early", meaning: "Server unwilling to risk processing request that might be replayed" },
  426: { name: "Upgrade Required", meaning: "Client should switch to a different protocol" },
  428: { name: "Precondition Required", meaning: "Server requires request to be conditional" },
  429: { name: "Too Many Requests", meaning: "User has sent too many requests in a given amount of time" },
  431: { name: "Request Header Fields Too Large", meaning: "Server unwilling to process request because headers are too large" },
  451: { name: "Unavailable For Legal Reasons", meaning: "Resource unavailable due to legal demands" },
  499: { name: "Client Closed Request", meaning: "Connection closed by client while server is processing (Nginx/CF)" },

  // 5xx Server Error
  500: { name: "Internal Server Error", meaning: "Generic error message when server encounters unexpected condition" },
  501: { name: "Not Implemented", meaning: "Server does not support functionality required to fulfill request" },
  502: { name: "Bad Gateway", meaning: "Server received invalid response from upstream server" },
  503: { name: "Service Unavailable", meaning: "Server is not ready to handle request (overloaded or down)" },
  504: { name: "Gateway Timeout", meaning: "Server did not receive timely response from upstream server" },
  505: { name: "HTTP Version Not Supported", meaning: "Server does not support HTTP protocol version used in request" },
  506: { name: "Variant Also Negotiates", meaning: "Transparent content negotiation results in circular reference" },
  507: { name: "Insufficient Storage", meaning: "Server unable to store representation needed to complete request (WebDAV)" },
  508: { name: "Loop Detected", meaning: "Server detected infinite loop while processing request (WebDAV)" },
  510: { name: "Not Extended", meaning: "Further extensions to request are required (RFC 2774)" },
  511: { name: "Network Authentication Required", meaning: "Client needs to authenticate to gain network access" },

  // Cloudflare Specific / Unofficial
  520: { name: "Web Server Returned Unknown Error", meaning: "Origin server returned empty/unknown response to Cloudflare" },
  521: { name: "Web Server Is Down", meaning: "Cloudflare could not connect to origin server" },
  522: { name: "Connection Timed Out", meaning: "Cloudflare connected but origin did not respond in time" },
  523: { name: "Origin Is Unreachable", meaning: "Cloudflare could not route to origin (routing issue)" },
  524: { name: "A Timeout Occurred", meaning: "Connection established but origin took too long to respond" },
  525: { name: "SSL Handshake Failed", meaning: "SSL handshake between Cloudflare and origin failed" },
  526: { name: "Invalid SSL Certificate", meaning: "Origin SSL certificate is invalid/expired/mismatched" },
  527: { name: "Railgun Error", meaning: "Connection between Cloudflare and Railgun interrupted" },
  530: { name: "Site Frozen", meaning: "Cloudflare site is frozen (older error code)" },
};

// Codes explicitly defined as retryable per prompt requirements
const RETRYABLE_SET = new Set([
  408, 425, 429, 500, 502, 503, 504, 
  520, 521, 522, 523, 524, 525, 526, 527, 530
]);

/**
 * Explains an HTTP status code.
 * @param code - HTTP status code (number or string)
 * @returns StatusExplanation object
 */
export function explainStatus(code: string | number): StatusExplanation {
  try {
    // 1. Input Validation & Normalization
    let numericCode: number;

    if (typeof code === "string") {
      if (!/^\d+$/.test(code)) {
        return { ok: false, error: "Invalid input: string must be numeric" };
      }
      numericCode = parseInt(code, 10);
    } else if (typeof code === "number") {
      if (!Number.isInteger(code)) {
        return { ok: false, error: "Invalid input: number must be an integer" };
      }
      numericCode = code;
    } else {
      return { ok: false, error: "Invalid input: expected string or number" };
    }

    // Strict limits: Allow standard range + known unofficials
    // Standard: 100-599 (IANA technically goes higher but 511 is max registered usually)
    // We allow up to 599 to be safe, but lookup will fail for unregistered.
    if (numericCode < 100 || numericCode > 599) {
      return { ok: false, error: "Code out of valid HTTP range (100-599)" };
    }

    // 2. Lookup
    const data = STATUS_DATA[numericCode];
    
    if (!data) {
      // Fallback for unregistered codes within range
      const className = getClass(numericCode);
      return {
        ok: true,
        code: numericCode,
        name: "Unknown",
        class: className,
        meaning: `Unregistered ${className} code`,
        retryable: isRetryable(numericCode),
        retry_advice: getRetryAdvice(numericCode),
        idempotency_note: getIdempotencyNote(numericCode)
      };
    }

    // 3. Construct Response
    const className = getClass(numericCode);
    const retryable = isRetryable(numericCode);
    
    return {
      ok: true,
      code: numericCode,
      name: data.name,
      class: className,
      meaning: data.meaning,
      retryable: retryable,
      retry_advice: getRetryAdvice(numericCode),
      idempotency_note: getIdempotencyNote(numericCode)
    };

  } catch (e) {
    // Safety net, though logic above should prevent throws
    return { ok: false, error: "Unexpected processing error" };
  }
}

// --- Helpers ---

function getClass(code: number): string {
  const hundreds = Math.floor(code / 100);
  switch (hundreds) {
    case 1: return "1xx Informational";
    case 2: return "2xx Success";
    case 3: return "3xx Redirection";
    case 4: return "4xx Client Error";
    case 5: return "5xx Server Error";
    default: return "Unknown Class";
  }
}

function isRetryable(code: number): boolean {
  return RETRYABLE_SET.has(code);
}

function getRetryAdvice(code: number): string | undefined {
  if (!isRetryable(code)) return undefined;
  
  if (code === 429 || code === 503) {
    return "Honor Retry-After header if present; implement exponential backoff.";
  }
  
  if (code >= 500 || code >= 520) {
    return "Implement exponential backoff with jitter.";
  }

  return "Retry with caution.";
}

function getIdempotencyNote(code: number): string | undefined {
  // Generally, 5xx and specific 4xx are retryable ONLY if the method is idempotent (GET, PUT, DELETE, HEAD, OPTIONS)
  // POST is not idempotent by default.
  if (isRetryable(code)) {
    return "Safe to retry only if HTTP method is idempotent (GET, PUT, DELETE). Avoid retrying POST without idempotency keys.";
  }
  return undefined;
}
