import { z } from "zod";
import { DibujoError } from "../errors.js";
import { type FormatOptions, formatBullet } from "./bullet.js";
import { BulletText, formatIssues } from "./capture.js";
import type { FutureBullet } from "./future.js";
import { parseDateArg } from "./journal-date.js";
import { BULLET_TYPES, type Bullet, SIGNIFIERS } from "./types.js";

export const FutureEntryInput = z
  .object({
    type: z.enum(BULLET_TYPES),
    text: BulletText,
    signifiers: z.array(z.enum(SIGNIFIERS)).default([]),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "must be a date like 2026-12-12")
      .optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.type === "note" && entry.date !== undefined) {
      ctx.addIssue({ code: "custom", path: ["date"], message: "is not allowed on notes" });
    }
  });

export const FutureAddInput = z
  .object({
    entries: z.array(FutureEntryInput).min(1, "must contain at least one entry"),
  })
  .strict();

export type FutureEntryInput = z.output<typeof FutureEntryInput>;

/** Parses and validates `future add` JSON from stdin. Throws `INVALID_INPUT` with field paths. */
export function parseFutureAdd(json: string): FutureEntryInput[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new DibujoError(
      "INVALID_INPUT",
      "Future log input is not valid JSON.",
      'Pipe a JSON object like {"entries": [{"type": "task", "text": "..."}]} on stdin.',
    );
  }
  const result = FutureAddInput.safeParse(value);
  if (!result.success) {
    throw new DibujoError(
      "INVALID_INPUT",
      `Future log input is invalid: ${formatIssues(result.error)}`,
      'Each entry needs a type ("task", "event", or "note") and text. Tasks and events may have a date.',
    );
  }
  return result.data.entries;
}

export interface AddPlan {
  /** The lines to append to the future log, in input order. */
  lines: string[];
  /** The number of input entries left out because the note (or the input) already has them. */
  skipped: number;
}

/**
 * Turns the input into lines for the future log. Throws `INVALID_DATE`, before
 * anything can be written, when a date isn't a real calendar date or is earlier than
 * `today`. An entry is skipped when it has the same type, text, signifiers, and date
 * as an entry that is still waiting in `existing` (open tasks, and all events and
 * notes), or as an earlier entry in the same input.
 */
export function planAdd(
  existing: readonly FutureBullet[],
  input: readonly FutureEntryInput[],
  today: string,
  folder?: string,
): AddPlan {
  const bullets = input.map((entry): Bullet => {
    const date = entry.date === undefined ? undefined : checkDate(entry.date, today);
    const bullet: Bullet = {
      type: entry.type,
      signifiers: entry.signifiers.filter((s, i) => entry.signifiers.indexOf(s) === i),
      text: entry.text,
      depth: 0,
    };
    if (entry.type === "task") {
      bullet.state = "open";
      if (date) bullet.scheduled = date;
    } else if (entry.type === "event" && date) {
      bullet.eventDate = date;
    }
    return bullet;
  });

  const seen = new Set(existing.filter(isWaiting).map(keyOf));
  const options: FormatOptions = folder === undefined ? {} : { folder };
  const lines: string[] = [];
  let skipped = 0;
  for (const bullet of bullets) {
    const key = keyOf(bullet);
    if (seen.has(key)) {
      skipped++;
      continue;
    }
    seen.add(key);
    lines.push(formatBullet(bullet, options));
  }
  return { lines, skipped };
}

function checkDate(date: string, today: string): string {
  parseDateArg(date);
  if (date < today) {
    throw new DibujoError(
      "INVALID_DATE",
      `The date ${date} is earlier than today (${today}).`,
      "Use today or a later date, or leave the entry undated.",
    );
  }
  return date;
}

/** Open tasks, and all events and notes. */
function isWaiting(entry: Bullet): boolean {
  return entry.type !== "task" || entry.state === "open";
}

/** What makes two entries the same: type, text, signifiers (in any order), and date. */
function keyOf(entry: Bullet): string {
  const date = entry.type === "task" ? entry.scheduled : entry.eventDate;
  return JSON.stringify([entry.type, entry.text, [...entry.signifiers].sort(), date ?? null]);
}
