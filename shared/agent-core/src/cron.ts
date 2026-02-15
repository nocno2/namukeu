/**
 * Minimal cron expression parser.
 * Supports 5-field format: minute hour day-of-month month day-of-week
 * Supports: numbers, *, ranges (1-5), steps (*​/5), lists (1,3,5)
 */

interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

function parseField(field: string, min: number, max: number): number[] {
  const values: Set<number> = new Set();

  for (const part of field.split(",")) {
    if (part === "*") {
      for (let i = min; i <= max; i++) values.add(i);
    } else if (part.includes("/")) {
      const [range, stepStr] = part.split("/");
      const step = parseInt(stepStr, 10);
      const start = range === "*" ? min : parseInt(range, 10);
      for (let i = start; i <= max; i += step) values.add(i);
    } else if (part.includes("-")) {
      const [startStr, endStr] = part.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      for (let i = start; i <= end; i++) values.add(i);
    } else {
      values.add(parseInt(part, 10));
    }
  }

  return [...values].filter((v) => v >= min && v <= max).sort((a, b) => a - b);
}

function parseCron(expression: string): CronFields {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${expression}`);
  }

  return {
    minute: parseField(parts[0], 0, 59),
    hour: parseField(parts[1], 0, 23),
    dayOfMonth: parseField(parts[2], 1, 31),
    month: parseField(parts[3], 1, 12),
    dayOfWeek: parseField(parts[4], 0, 6),
  };
}

function matchesCron(fields: CronFields, date: Date): boolean {
  return (
    fields.minute.includes(date.getMinutes()) &&
    fields.hour.includes(date.getHours()) &&
    fields.dayOfMonth.includes(date.getDate()) &&
    fields.month.includes(date.getMonth() + 1) &&
    fields.dayOfWeek.includes(date.getDay())
  );
}

/** Calculate next execution time from a cron expression */
export function getNextCronTime(expression: string, after: Date = new Date()): Date {
  const fields = parseCron(expression);

  // Start from next minute
  const next = new Date(after);
  next.setSeconds(0, 0);
  next.setMinutes(next.getMinutes() + 1);

  // Search up to 366 days ahead
  const maxIterations = 366 * 24 * 60;
  for (let i = 0; i < maxIterations; i++) {
    if (matchesCron(fields, next)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }

  throw new Error(`Could not find next execution time for: ${expression}`);
}

/** Check if a cron expression matches the current time (within the given date) */
export function cronMatchesNow(expression: string, now: Date = new Date()): boolean {
  const fields = parseCron(expression);
  return matchesCron(fields, now);
}

/** Validate a cron expression */
export function isValidCron(expression: string): boolean {
  try {
    parseCron(expression);
    return true;
  } catch {
    return false;
  }
}
