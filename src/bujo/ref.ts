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
    "Use a ref from `dibujo task review --json` or `dibujo log show --json`, like 2026-11-09:7:9c04e7d1.",
  );
}
