import { dueFor } from "../vault/future.js";
import { humanBullet, humanEntry } from "./bullet-symbols.js";
import type { Ctx } from "./context.js";
import { Output } from "./output.js";
import type { Register } from "./program.js";
import { vaultAndDate } from "./vault-date.js";

interface FutureDueOptions {
  date?: string;
  json?: boolean;
}

export const registerFutureDue: Register = (future, ctx) => {
  future
    .command("due")
    .description(
      "List waiting future log tasks whose ⏳ date is today or earlier, plus today's events and the other waiting tasks",
    )
    .option("--date <YYYY-MM-DD>", "the day to treat as today (default: the current journal day)")
    .option("--json", "print the result as JSON")
    .addHelpText(
      "after",
      "\nA due entry stays in this list every day until it is brought in, given another date, or cancelled.\nWith --json, `events` are the events dated today, and `waiting` are the other waiting tasks\n(undated, or dated after today).",
    )
    .action((options: FutureDueOptions) => runFutureDue(ctx, options));
};

/** The plain-output lines that tell the user old year notes can be copied. Empty when there are none. */
export function legacyNotice(legacyNotes: readonly string[]): string[] {
  if (legacyNotes.length === 0) return [];
  return [
    "",
    "Old year notes have entries that are not in the future log yet:",
    ...legacyNotes.map((path) => `  ${path}`),
    "Run `dibujo future import` to copy them.",
  ];
}

export function runFutureDue(ctx: Ctx, options: FutureDueOptions): void {
  const out = new Output(ctx, options.json === true);
  const { config, date } = vaultAndDate(ctx, options.date);
  const due = dueFor(config, date);

  const lines: string[] = [];
  if (due.entries.length === 0) {
    lines.push("Nothing is due in the future log.");
  } else {
    lines.push(`Due in the future log on ${date}:`, "");
    for (const e of due.entries) {
      const overdue =
        e.daysOverdue > 0
          ? `  (${e.daysOverdue} day${e.daysOverdue === 1 ? "" : "s"} overdue)`
          : "";
      const origin = e.scheduledFrom ? { origin: { date: e.scheduledFrom, blockId: "" } } : {};
      const bullet = humanBullet({
        type: "task",
        state: "open",
        signifiers: e.signifiers,
        text: e.text,
        depth: 0,
        scheduled: e.scheduled,
        ...origin,
      });
      lines.push(`${bullet}${overdue}`, `     ref ${e.ref}`);
    }
  }
  if (due.events.length > 0) {
    lines.push("", "Events today:");
    for (const e of due.events) {
      lines.push(humanEntry({ type: "event", signifiers: e.signifiers, text: e.text }, 1));
    }
  }
  if (due.waiting.length > 0) {
    lines.push("", "Other waiting tasks:");
    for (const w of due.waiting) {
      lines.push(
        humanEntry(
          {
            type: "task",
            state: "open",
            signifiers: w.signifiers,
            text: w.text,
            ...(w.date === undefined ? {} : { date: w.date }),
          },
          1,
        ),
        `       ref ${w.ref}`,
      );
    }
  }
  lines.push(...legacyNotice(due.legacyNotes));
  out.success(due, lines);
}
