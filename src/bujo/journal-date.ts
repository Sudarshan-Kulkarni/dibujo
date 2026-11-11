import {
  addDays as addCalendarDays,
  differenceInCalendarDays,
  format,
  isValid,
  parse,
  subDays,
} from "date-fns";
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

const MONTH_SHAPE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** The month a `YYYY-MM-DD` date is in, as `YYYY-MM`. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The month before a `YYYY-MM` month: `2026-01` gives `2025-12`. */
export function previousMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  const y = year ?? 0;
  const m = number ?? 1;
  const prevYear = m === 1 ? y - 1 : y;
  const prevMonth = m === 1 ? 12 : m - 1;
  return `${String(prevYear).padStart(4, "0")}-${String(prevMonth).padStart(2, "0")}`;
}

/** Validates a month argument. Accepts only `YYYY-MM` with a month from 01 to 12. */
export function parseMonthArg(value: string): string {
  if (!MONTH_SHAPE.test(value)) {
    throw new DibujoError(
      "INVALID_DATE",
      `Invalid month "${value}".`,
      "Use a month in YYYY-MM form, for example 2026-10.",
    );
  }
  return value;
}

/** The English name of a `YYYY-MM` month with its year: `2026-10` gives `October 2026`. */
export function monthName(month: string): string {
  const [year, number] = month.split("-");
  return `${MONTH_NAMES[Number(number) - 1] ?? month} ${year}`;
}

/** True when a `YYYY-MM-DD` date is in the `YYYY-MM` month. */
export function isDateInMonth(date: string, month: string): boolean {
  return monthOf(date) === month;
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
  return format(addCalendarDays(atNoon(date), n), DATE_FORMAT);
}

/**
 * The number of calendar days from one `YYYY-MM-DD` date to another. It is negative
 * when `to` is before `from`. Both dates are anchored at local noon, like `addDays`,
 * so DST changes can never alter the result.
 */
export function daysBetween(from: string, to: string): number {
  return differenceInCalendarDays(atNoon(to), atNoon(from));
}

function atNoon(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
}
