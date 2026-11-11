import { DibujoError, isDibujoError } from "../errors.js";
import { parseDateArg } from "./journal-date.js";

/** Points at one bullet: the note's date, its 1-based line, and its fingerprint. */
export interface Ref {
  date: string;
  line: number;
  fingerprint: string;
}

const REF_SHAPE = /^(\d{4}-\d{2}-\d{2}):([1-9]\d{0,6}):([0-9a-f]{8})$/;

export function formatRef(date: string, line: number, fingerprint: string): string {
  return `${date}:${line}:${fingerprint}`;
}

/** Parses `YYYY-MM-DD:<line>:<fingerprint>`. Throws `INVALID_REF` for anything else. */
export function parseRef(value: string): Ref {
  const match = REF_SHAPE.exec(value);
  const [, date = "", line = "", fp = ""] = match ?? [];
  if (match) {
    try {
      return { date: parseDateArg(date), line: Number(line), fingerprint: fp };
    } catch (error) {
      if (!isDibujoError(error)) throw error;
    }
  }
  throw new DibujoError(
    "INVALID_REF",
    `Invalid task ref "${value}".`,
    FUTURE_REF_SHAPE.test(value)
      ? "This looks like a future log ref, use `dibujo future ...` commands with it. Daily refs come from `dibujo task review --json` or `dibujo log show --json`, like 2026-11-09:7:9c04e7d1."
      : "Use a ref from `dibujo task review --json` or `dibujo log show --json`, like 2026-11-09:7:9c04e7d1.",
  );
}

/** Points at one entry in the future log: its 1-based line and its fingerprint. */
export interface FutureRef {
  line: number;
  fingerprint: string;
}

const FUTURE_REF_SHAPE = /^([1-9]\d{0,6}):([0-9a-f]{8})$/;
const FRESH_REFS = "Get fresh refs from `dibujo future show --json` or `dibujo future due --json`";

export function formatFutureRef(line: number, fingerprint: string): string {
  return `${line}:${fingerprint}`;
}

/**
 * Parses `<line>:<fingerprint>`. Throws `INVALID_REF` for anything else, including a
 * daily ref (three parts, starting with a date) and the year form the earlier future
 * log used (`YYYY:<line>:<fingerprint>`).
 */
export function parseFutureRef(value: string): FutureRef {
  const match = FUTURE_REF_SHAPE.exec(value);
  if (match) {
    const [, line = "", fp = ""] = match;
    return { line: Number(line), fingerprint: fp };
  }
  throw new DibujoError(
    "INVALID_REF",
    `Invalid future log ref "${value}".`,
    REF_SHAPE.test(value)
      ? `This looks like a daily task ref, use \`dibujo task ...\` commands with it. ${FRESH_REFS}, like 14:9c04e7d1.`
      : `${FRESH_REFS}, like 14:9c04e7d1. Refs from the earlier year-based future log no longer work.`,
  );
}
