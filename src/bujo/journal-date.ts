import { addDays as addCalendarDays, format, isValid, parse, subDays } from "date-fns";
import { DibujoError } from "../errors.js";

const DATE_FORMAT = "yyyy-MM-dd";
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The date an entry belongs to, as `YYYY-MM-DD` in local time.
 *
 * Before `dayStartHour` on the wall clock, the entry belongs to the previous day.
 * This uses wall-clock hours rather than subtracting a duration, so DST changes
 * never move the boundary.
 */
export function journalDate(now: Date, dayStartHour: number): string {
  const day = now.getHours() < dayStartHour ? subDays(now, 1) : now;
  return format(day, DATE_FORMAT);
}

/** Validates a `--date` value. Accepts only real calendar dates in `YYYY-MM-DD` form. */
export function parseDateArg(value: string): string {
  const parsed = parse(value, DATE_FORMAT, new Date(2000, 0, 1));
  if (!DATE_SHAPE.test(value) || !isValid(parsed) || format(parsed, DATE_FORMAT) !== value) {
    throw new DibujoError(
      "INVALID_DATE",
      `Invalid date "${value}".`,
      "Use a real calendar date in YYYY-MM-DD form, for example 2026-11-09.",
    );
  }
  return value;
}

/** Local time as `HH:mm`, used in capture callout titles. */
export function localTime(now: Date): string {
  return format(now, "HH:mm");
}

/**
 * Shifts a `YYYY-MM-DD` date by `n` calendar days. The date is anchored at local
 * noon, so DST changes (which happen at night) can never move it to another day.
 */
export function addDays(date: string, n: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const noon = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
  return format(addCalendarDays(noon, n), DATE_FORMAT);
}
