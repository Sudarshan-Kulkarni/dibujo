import { readdirSync } from "node:fs";
import { fingerprint } from "../bujo/bullet.js";
import {
  dueEntries,
  type FutureBullet,
  type LocatedEntry,
  type ParsedFutureNote,
  parseFutureNote,
} from "../bujo/future.js";
import { daysBetween } from "../bujo/journal-date.js";
import type { UnrecognizedLine } from "../bujo/note.js";
import { formatFutureRef } from "../bujo/ref.js";
import type { Bullet, Origin, Signifier, TaskState } from "../bujo/types.js";
import type { VaultConfig } from "../config.js";
import { assertSupported, readIfExists } from "./daily.js";
import { futureNotePath, resolveInVault } from "./paths.js";

/** A future log note read from disk. */
export interface LoadedFutureNote {
  year: string;
  path: string;
  /** The note's full content, as read. Writes compare against it. */
  content: string;
  parsed: ParsedFutureNote;
}

export interface LoadOptions {
  /** Skip notes for years after this one. */
  throughYear?: string;
}

const FUTURE_FILE = /^(\d{4})\.md$/;

/**
 * Reads every `Future/YYYY.md` note, oldest year first, and checks each one's format
 * version. A missing folder gives an empty list. A note with an unsupported version
 * throws, naming the note, instead of being skipped: a skipped note would hide
 * entries that are meant to keep coming back.
 */
export function loadFutureNotes(
  config: VaultConfig,
  options: LoadOptions = {},
): LoadedFutureNote[] {
  const folder = resolveInVault(config, "Future");
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }

  const notes: LoadedFutureNote[] = [];
  const years = names
    .flatMap((name) => FUTURE_FILE.exec(name)?.[1] ?? [])
    .filter((year) => options.throughYear === undefined || year <= options.throughYear)
    .sort();
  for (const year of years) {
    const path = futureNotePath(config, year);
    const content = readIfExists(path);
    if (content === null) continue;
    const parsed = parseFutureNote(content);
    assertSupported(parsed, path);
    notes.push({ year, path, content, parsed });
  }
  return notes;
}

/** Every entry in the loaded notes, with the year of its note, in note order. */
export function locateEntries(notes: readonly LoadedFutureNote[]): LocatedEntry[] {
  return notes.flatMap((note) => note.parsed.entries.map((e) => ({ ...e, year: note.year })));
}

export function entryRef(entry: LocatedEntry): string {
  return formatFutureRef(entry.year, entry.line, fingerprint(entry));
}

export interface FutureEntryView {
  ref: string;
  line: number;
  type: Bullet["type"];
  state?: TaskState;
  text: string;
  signifiers: Signifier[];
  depth: number;
  scheduled?: string;
  origin?: Origin;
}

export interface FutureNoteView {
  exists: boolean;
  path: string;
  year: string;
  /** The months that have entries, in calendar order. */
  months: { month: string; entries: FutureEntryView[] }[];
  unrecognized: UnrecognizedLine[];
}

/** Reads one year's note for `future show`. */
export function readFutureNote(config: VaultConfig, year: string): FutureNoteView {
  const path = futureNotePath(config, year);
  const content = readIfExists(path);
  if (content === null) return { exists: false, path, year, months: [], unrecognized: [] };
  const parsed = parseFutureNote(content);
  assertSupported(parsed, path);

  const byMonth = new Map<string, FutureEntryView[]>();
  for (const entry of parsed.entries) {
    const list = byMonth.get(entry.month) ?? [];
    list.push(viewOf(entry, year));
    byMonth.set(entry.month, list);
  }
  const months = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, entries]) => ({ month, entries }));
  return { exists: true, path, year, months, unrecognized: parsed.unrecognized };
}

function viewOf(entry: FutureBullet, year: string): FutureEntryView {
  const view: FutureEntryView = {
    ref: formatFutureRef(year, entry.line, fingerprint(entry)),
    line: entry.line,
    type: entry.type,
    text: entry.text,
    signifiers: entry.signifiers,
    depth: entry.depth,
  };
  if (entry.state) view.state = entry.state;
  if (entry.scheduled) view.scheduled = entry.scheduled;
  if (entry.origin) view.origin = entry.origin;
  return view;
}

export interface DueEntry {
  ref: string;
  text: string;
  signifiers: Signifier[];
  scheduled: string;
  /** Calendar days from the entry's date to today. 0 on the day itself. */
  daysOverdue: number;
  /** The date of the daily note the entry started from, or `null` when the chain can't be followed. */
  scheduledFrom: string | null;
  path: string;
}

export interface DueResult {
  today: string;
  entries: DueEntry[];
}

/**
 * Lists the due entries in the notes for today's year and every earlier year. A
 * waiting entry stays waiting until it is handled, so it is listed again each day.
 */
export function dueEntriesFor(config: VaultConfig, today: string): DueResult {
  const notes = loadFutureNotes(config, { throughYear: today.slice(0, 4) });
  const located = locateEntries(notes);
  const pathOf = new Map(notes.map((n) => [n.year, n.path]));

  const entries = dueEntries(located, today).map((e): DueEntry => {
    const scheduled = e.scheduled ?? today;
    return {
      ref: entryRef(e),
      text: e.text,
      signifiers: e.signifiers,
      scheduled,
      daysOverdue: Math.max(0, daysBetween(scheduled, today)),
      scheduledFrom: scheduledFrom(located, e),
      path: pathOf.get(e.year) ?? futureNotePath(config, e.year),
    };
  });
  return { today, entries };
}

/**
 * Follows future origins across the notes until a daily origin gives the date of the
 * daily note the task started in. Returns `null` when the chain breaks or loops.
 */
function scheduledFrom(entries: readonly LocatedEntry[], start: LocatedEntry): string | null {
  const visited = new Set<string>();
  let current: LocatedEntry = start;
  for (;;) {
    const origin = current.origin;
    if (!origin) return null;
    if ("date" in origin) return origin.date;
    const key = `${origin.year}:${origin.blockId}`;
    if (visited.has(key)) return null;
    visited.add(key);
    const next = entries.find((e) => e.year === origin.year && e.blockId === origin.blockId);
    if (!next) return null;
    current = next;
  }
}
