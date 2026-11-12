/**
 * Bot Agora JSON Validator Module
 * Service: Agora x402 Desk (Sir Grokkius for Luminosity)
 * Purpose: Validate JSON structure, compute metrics, and provide lint hints.
 * Limits: 1MB max input size to prevent DoS on Worker.
 */

export interface ValidationResult {
  ok: boolean;
  error?: string;
  line?: number;
  column?: number;
  type?: string;
  keys?: number;
  depth?: number;
  size_bytes: number;
  hints?: string[];
}

const MAX_INPUT_BYTES = 1024 * 1024; // 1MB Limit

/**
 * Calculates line and column number from a character index.
 */
function getLineCol(text: string, index: number): { line: number; column: number } {
  let line = 1;
  let column = 1;
  const limit = Math.min(index, text.length);
  for (let i = 0; i < limit; i++) {
    if (text[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }
  return { line, column };
}

/**
 * Generates lint hints based on common JSON syntax errors.
 */
function generateHints(text: string): string[] {
  const hints: string[] = [];
  if (text.charCodeAt(0) === 0xfeff) hints.push("Remove UTF-8 BOM at start");
  if (text.includes("'")) hints.push("Use double quotes \" instead of single quotes '");
  if (/\b(NaN|Infinity|-Infinity)\b/.test(text)) hints.push("Remove non-standard literals (NaN, Infinity)");
  if (/\\"/g.test(text) || /\/\/|\/\*/.test(text)) hints.push("Remove comments (// or /*)");
  if (/,\s*[\]}]/.test(text)) hints.push("Remove trailing commas before ] or }");
  if (/[a-zA-Z_][a-zA-Z0-9_]*\s*:/.test(text)) hints.push("Quote all object keys with \"");
  return hints;
}

/**
 * Analyzes valid JSON for depth, key count, and root type.
 * Uses iterative stack to prevent call stack overflow.
 */
function analyzeJson(obj: unknown): { keys: number; depth: number; type: string } {
  let keys = 0;
  let maxDepth = 0;
  const stack: { val: unknown; d: number }[] = [{ val: obj, d: 1 }];
  let type = "null";

  if (obj === null) return { keys: 0, depth: 0, type: "null" };
  if (Array.isArray(obj)) type = "array";
  else if (typeof obj === "object") type = "object";
  else type = typeof obj;

  while (stack.length > 0) {
    const { val, d } = stack.pop()!;
    if (d > maxDepth) maxDepth = d;

    if (Array.isArray(val)) {
      for (let i = val.length - 1; i >= 0; i--) {
        stack.push({ val: val[i], d: d + 1 });
      }
    } else if (typeof val === "object" && val !== null) {
      const k = Object.keys(val);
      keys += k.length;
      for (let i = k.length - 1; i >= 0; i--) {
        stack.push({ val: (val as Record<string, unknown>)[k[i]], d: d + 1 });
      }
    }
  }
  return { keys, depth: maxDepth, type };
}

/**
 * Validates JSON text strictly. Returns metrics on success, hints on failure.
 * Never throws; all errors are returned in the result object.
 */
export function validateJson(text: string): ValidationResult {
  try {
    // 1. Size Check
    const encoder = new TextEncoder();
    const size_bytes = encoder.encode(text).byteLength;
    if (size_bytes > MAX_INPUT_BYTES) {
      return {
        ok: false,
        error: `Input exceeds ${MAX_INPUT_BYTES} byte limit`,
        size_bytes,
        hints: ["Reduce input size"],
      };
    }

    // 2. Parse Attempt
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      const err = e as SyntaxError;
      const msg = err.message;
      const posMatch = msg.match(/position\s+(\d+)/);
      const pos = posMatch ? parseInt(posMatch[1], 10) : text.length;
      const { line, column } = getLineCol(text, pos);
      
      return {
        ok: false,
        error: msg,
        line,
        column,
        size_bytes,
        hints: generateHints(text),
      };
    }

    // 3. Analysis
    const stats = analyzeJson(parsed);
    return {
      ok: true,
      size_bytes,
      type: stats.type,
      keys: stats.keys,
      depth: stats.depth,
    };
  } catch (e) {
    // Catch-all for unexpected internal errors (e.g. OOM)
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown validation error",
      size_bytes: 0,
      hints: ["Internal validator error"],
    };
  }
}
