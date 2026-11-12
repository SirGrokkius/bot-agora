/**
 * Parses a cron expression into human-readable English and provides warnings for common mistakes.
 * Supports standard 5-field cron syntax with ranges, lists, steps, and named values (e.g., JAN, MON).
 * Returns an object with:
 * - ok: boolean indicating if parsing succeeded
 * - english?: string describing the schedule in English
 * - warnings?: string[] of common mistake warnings
 * - runs_per_day_estimate?: number for simple cases
 * - error?: string if parsing failed
 */
export function explainCron(expr: string): {
    ok: boolean;
    english?: string;
    warnings?: string[];
    runs_per_day_estimate?: number;
    error?: string;
} {
    try {
        // Input validation
        if (typeof expr !== 'string' || expr.length === 0 || expr.length > 255) {
            return { ok: false, error: 'Invalid input: must be a non-empty string ≤ 255 chars' };
        }

        const trimmed = expr.trim();

        // Handle special time strings
        const specialTimes: Record<string, string> = {
            '@hourly': '0 * * * *',
            '@daily': '0 0 * * *',
            '@midnight': '0 0 * * *',
            '@weekly': '0 0 * * 0',
            '@monthly': '0 0 1 * *',
            '@yearly': '0 0 1 1 *',
            '@annually': '0 0 1 1 *',
        };

        if (trimmed.startsWith('@')) {
            const lower = trimmed.toLowerCase();
            if (lower === '@reboot') {
                return { ok: true, english: 'Runs once when the system starts', runs_per_day_estimate: 0 };
            }
            if (specialTimes[lower]) {
                expr = specialTimes[lower];
            } else {
                return { ok: false, error: `Unknown special string: ${trimmed}` };
            }
        }

        // Split into fields
        const fields = trimmed.split(/\s+/);
        if (fields.length !== 5) {
            return { ok: false, error: 'Invalid cron format: must have exactly 5 fields' };
        }

        const fieldConfigs = [
            { name: 'minute', min: 0, max: 59 },
            { name: 'hour', min: 0, max: 23 },
            { name: 'day of month', min: 1, max: 31 },
            { name: 'month', min: 1, max: 12, names: { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 } },
            { name: 'day of week', min: 0, max: 6, names: { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 } } // Normalized 0-6
        ];

        const parsedFields: { values: number[], isAll: boolean, step?: number, rangeStart?: number, rangeEnd?: number }[] = [];
        const warnings: string[] = [];

        for (let i = 0; i < 5; i++) {
            const fieldStr = fields[i];
            const config = fieldConfigs[i];

            if (fieldStr.length > 100) {
                return { ok: false, error: `Field ${config.name} too long (>100 chars)` };
            }

            const parseResult = parseCronField(fieldStr, config.min, config.max, config.names);
            if (!parseResult.ok) {
                return { ok: false, error: `Invalid ${config.name} field: ${parseResult.error}` };
            }

            parsedFields.push({
                values: parseResult.values,
                isAll: parseResult.isAll,
                step: parseResult.step,
                rangeStart: parseResult.rangeStart,
                rangeEnd: parseResult.rangeEnd
            });
        }

        // Warnings Logic
        const domValues = parsedFields[2].values;
        const monthValues = parsedFields[3].values;
        
        // Warn on Feb 31
        if (domValues.includes(31) && monthValues.length === 1 && monthValues[0] === 2) {
            warnings.push('Day 31 in February never occurs');
        }

        // Warn on Day 31 in 30-day months only
        const thirtyDayMonths = [4, 6, 9, 11];
        if (domValues.includes(31) && monthValues.length > 0) {
            const allAreThirtyDayMonths = monthValues.every(m => thirtyDayMonths.includes(m));
            if (allAreThirtyDayMonths) {
                warnings.push('Day 31 does not occur in the selected months (Apr, Jun, Sep, Nov)');
            }
        }

        // Warn on frequent execution
        if (parsedFields[0].isAll && parsedFields[1].isAll) {
            warnings.push('Runs every minute - this is very frequent');
        }

        // Warn on DOM and DOW both set (Vixie cron OR behavior)
        if (!parsedFields[2].isAll && !parsedFields[4].isAll) {
            warnings.push('Both day-of-month and day-of-week are set; standard cron executes if EITHER matches');
        }

        // Generate English Text
        const english = generateEnglish(parsedFields);

        // Calculate Estimate
        const minuteCount = parsedFields[0].values.length;
        const hourCount = parsedFields[1].values.length;
        const runsPerDay = minuteCount * hourCount;

        return {
            ok: true,
            english,
            warnings: warnings.length > 0 ? warnings : undefined,
            runs_per_day_estimate: runsPerDay
        };

    } catch (e) {
        return { ok: false, error: 'Unexpected parsing error' };
    }
}

interface ParseResult {
    ok: boolean;
    values: number[];
    isAll: boolean;
    step?: number;
    rangeStart?: number;
    rangeEnd?: number;
    error?: string;
}

function parseCronField(field: string, min: number, max: number, names?: Record<string, number>): ParseResult {
    if (field === '*') {
        const values: number[] = [];
        for (let i = min; i <= max; i++) values.push(i);
        return { ok: true, values, isAll: true };
    }

    let values: number[] = [];
    let isAll = false;
    let step: number | undefined = undefined;
    let rangeStart: number | undefined = undefined;
    let rangeEnd: number | undefined = undefined;

    // Handle steps (e.g., */15 or 1-10/2)
    if (field.includes('/')) {
        const parts = field.split('/');
        if (parts.length !== 2) return { ok: false, values: [], isAll: false, error: 'Invalid step format' };
        const base = parts[0];
        const stepVal = parseInt(parts[1], 10);
        if (isNaN(stepVal) || stepVal < 1) return { ok: false, values: [], isAll: false, error: 'Invalid step value' };
        step = stepVal;

        // Parse base
        const baseResult = parseCronField(base, min, max, names);
        if (!baseResult.ok) return baseResult;
        
        // Apply step to base values
        if (base === '*') {
            isAll = true;
            for (let i = min; i <= max; i += stepVal) values.push(i);
        } else {
            // If base is a range or list, filter by step relative to min usually, 
            // but standard cron step applies to the range start.
            // Simplified: Just take every Nth value from the expanded base list starting from first
            // Actually standard cron: <start>-<end>/<step> starts at <start>.
            // For list: 1,5,10/2 -> usually invalid or treated specifically. 
            // We will assume step applies to range or *.
            if (base.includes('-')) {
                 // baseResult.values is sorted
                 const start = baseResult.rangeStart ?? baseResult.values[0];
                 for (let i = start; i <= max; i += stepVal) {
                     if (baseResult.values.includes(i)) values.push(i);
                 }
            } else {
                // Single value with step is unusual but treat as start
                const start = baseResult.values[0];
                for (let i = start; i <= max; i += stepVal) values.push(i);
            }
        }
        return { ok: true, values, isAll: false, step, rangeStart: values[0], rangeEnd: values[values.length-1] };
    }

    // Handle Lists
    if (field.includes(',')) {
        const parts = field.split(',');
        for (const part of parts) {
            const subRes = parseCronField(part, min, max, names);
            if (!subRes.ok) return subRes;
            values = values.concat(subRes.values);
        }
        // Remove duplicates and sort
        values = Array.from(new Set(values)).sort((a, b) => a - b);
        return { ok: true, values, isAll: false, rangeStart: values[0], rangeEnd: values[values.length-1] };
    }

    // Handle Ranges
    if (field.includes('-')) {
        const parts = field.split('-');
        if (parts.length !== 2) return { ok: false, values: [], isAll: false, error: 'Invalid range format' };
        
        const start = resolveValue(parts[0], names, min, max);
        const end = resolveValue(parts[1], names, min, max);

        if (start === null || end === null) return { ok: false, values: [], isAll: false, error: 'Invalid range values' };
        if (start > end) return { ok: false, values: [], isAll: false, error: 'Range start is greater than end' };

        rangeStart = start;
        rangeEnd = end;
        for (let i = start; i <= end; i++) values.push(i);
        return { ok: true, values, isAll: false, step: undefined, rangeStart, rangeEnd };
    }

    // Handle Single Value
    const val = resolveValue(field, names, min, max);
    if (val === null) return { ok: false, values: [], isAll: false, error: 'Invalid value' };
    return { ok: true, values: [val], isAll: false, rangeStart: val, rangeEnd: val };
}

function resolveValue(val: string, names: Record<string, number> | undefined, min: number, max: number): number | null {
    val = val.trim().toUpperCase();
    let num: number;

    if (names && val in names) {
        num = names[val];
    } else {
        num = parseInt(val, 10);
        if (isNaN(num)) return null;
    }

    // Special handling for DOW 7 -> 0
    if (max === 6 && num === 7) num = 0;

    if (num < min || num > max) return null;
    return num;
}

function generateEnglish(fields: { values: number[], isAll: boolean, step?: number, rangeStart?: number, rangeEnd?: number }[]): string {
    const [minF, hourF, domF, monthF, dowF] = fields;
    const parts: string[] = [];

    // Time Description
    if (minF.isAll && hourF.isAll) {
        parts.push('Every minute');
    } else if (minF.step && hourF.rangeStart !== undefined && hourF.rangeEnd !== undefined) {
        // e.g. */15 9-17
        const startH = pad(hourF.rangeStart);
        const endH = pad(hourF.rangeEnd);
        const endM = 59;
        parts.push(`Every ${minF.step} minutes, between ${startH}:00 and ${endH}:${endM}`);
    } else if (minF.step && hourF.isAll) {
        parts.push(`Every ${minF.step} minutes`);
    } else if (!minF.isAll && !hourF.isAll && minF.values.length === 1 && hourF.values.length === 1) {
        // Specific time
        const h = pad(hourF.values[0]);
        const m = pad(minF.values[0]);
        parts.push(`At ${h}:${m}`);
    } else if (!minF.isAll && hourF.isAll) {
         // Specific minute every hour
         if (minF.values.length === 1) {
             parts.push(`At minute ${minF.values[0]} of every hour`);
         } else {
             parts.push(`At minutes ${minF.values.join(', ')} of every hour`);
         }
    } else if (minF.isAll && !hourF.isAll) {
        // Every minute of specific hours
        if (hourF.rangeStart !== undefined && hourF.rangeEnd !== undefined && hourF.values.length > 1) {
             parts.push(`Every minute between ${pad(hourF.rangeStart)}:00 and ${pad(hourF.rangeEnd)}:59`);
        } else {
             parts.push(`Every minute during hour(s) ${hourF.values.join(', ')}`);
        }
    } else {
        // Fallback generic
        parts.push(`Minute: ${minF.values.join(',')}, Hour: ${hourF.values.join(',')}`);
    }

    // Day of Month / Month / Day of Week
    // Simplify: if DOM and Month are *, check DOW.
    if (domF.isAll && monthF.isAll) {
        if (!dowF.isAll) {
            parts.push(describeDOW(dowF));
        } else {
            parts.push('every day');
        }
    } else {
        // Complex date logic
        if (!monthF.isAll) {
            parts.push(describeMonth(monthF));
        }
        if (!domF.isAll) {
            parts.push(`on day(s) ${domF.values.join(', ')}`);
        }
        if (!dowF.isAll && !(domF.isAll && monthF.isAll)) {
             // If DOM/Month specified, DOW is usually ignored in strict cron but valid in expression.
             // We append it for completeness.
             parts.push(describeDOW(dowF));
        }
    }

    return parts.join(', ');
}

function describeDOW(f: { values: number[], isAll: boolean, rangeStart?: number, rangeEnd?: number }): string {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (f.isAll) return 'every day of the week';
    
    if (f.rangeStart !== undefined && f.rangeEnd !== undefined && f.values.length === (f.rangeEnd - f.rangeStart + 1)) {
        // Continuous range
        return `${days[f.rangeStart]} through ${days[f.rangeEnd]}`;
    }
    
    return f.values.map(v => days[v]).join(', ');
}

function describeMonth(f: { values: number[], isAll: boolean, rangeStart?: number, rangeEnd?: number }): string {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (f.isAll) return 'every month';

    if (f.rangeStart !== undefined && f.rangeEnd !== undefined && f.values.length === (f.rangeEnd - f.rangeStart + 1)) {
        return `${months[f.rangeStart - 1]} through ${months[f.rangeEnd - 1]}`;
    }

    return f.values.map(v => months[v - 1]).join(', ');
}

function pad(n: number): string {
    return n < 10 ? `0${n}` : `${n}`;
}
