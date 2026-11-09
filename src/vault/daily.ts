import { readFileSync } from "node:fs";
import { type Capture, captureId, formatCallout } from "../bujo/capture.js";
import { localTime } from "../bujo/journal-date.js";
import {
  appendCapture,
  FORMAT_VERSION,
  newNoteTemplate,
  type ParsedBullet,
  type ParsedNote,
  parseDailyNote,
  type UnrecognizedLine,
} from "../bujo/note.js";
import type { VaultConfig } from "../config.js";
import { DibujoError } from "../errors.js";
import { replaceIfUnchanged, type WriteHooks, writeNew } from "./atomic-write.js";
import { dailyNotePath } from "./paths.js";

export interface DailyNote {
  exists: boolean;
  path: string;
  date: string;
  bullets: ParsedBullet[];
  unrecognized: UnrecognizedLine[];
}

export type AddStatus = "created" | "updated" | "unchanged";

export interface AddResult {
  status: AddStatus;
  path: string;
  date: string;
  captureId: string;
  added: number;
  /** The full resulting note. Only set for dry runs. */
  content?: string;
  dryRun: boolean;
}

export interface AddOptions {
  dryRun?: boolean;
  now: Date;
  hooks?: WriteHooks;
}

export function readDailyNote(config: VaultConfig, date: string): DailyNote {
  const path = dailyNotePath(config, date);
  const content = readIfExists(path);
  if (content === null) return { exists: false, path, date, bullets: [], unrecognized: [] };
  const parsed = parseDailyNote(content);
  assertSupported(parsed, path);
  return { exists: true, path, date, bullets: parsed.bullets, unrecognized: parsed.unrecognized };
}

export function addCapture(
  config: VaultConfig,
  date: string,
  capture: Capture,
  options: AddOptions,
): AddResult {
  const path = dailyNotePath(config, date);
  const id = captureId(capture);
  const original = readIfExists(path);
  const base = original ?? newNoteTemplate(date);
  const dryRun = options.dryRun === true;

  const parsed = parseDailyNote(base);
  assertSupported(parsed, path);

  if (parsed.captureIds.includes(id)) {
    const result: AddResult = { status: "unchanged", path, date, captureId: id, added: 0, dryRun };
    if (dryRun) result.content = base;
    return result;
  }

  const callout = formatCallout(localTime(options.now), id, capture.raw);
  const content = appendCapture(base, capture.bullets, callout);
  const status: AddStatus = original === null ? "created" : "updated";
  const result: AddResult = {
    status,
    path,
    date,
    captureId: id,
    added: capture.bullets.length,
    dryRun,
  };

  if (dryRun) {
    result.content = content;
    return result;
  }
  if (original === null) writeNew(path, content, options.hooks);
  else replaceIfUnchanged(path, original, content, options.hooks);
  return result;
}

function readIfExists(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function assertSupported(parsed: ParsedNote, path: string): void {
  if (parsed.version !== null && parsed.version <= FORMAT_VERSION) return;
  throw new DibujoError(
    "NOTE_VERSION_UNSUPPORTED",
    parsed.version === null
      ? `The note ${path} has an invalid "dibujo" version in its frontmatter.`
      : `The note ${path} uses format version ${parsed.version}, but this dibujo supports up to ${FORMAT_VERSION}.`,
    parsed.version === null
      ? 'Fix the "dibujo" field so it is a whole number, or remove it.'
      : "Upgrade with `npm update -g digi-bujo`.",
  );
}
