import fc from "fast-check";
import { BulletText } from "../../src/bujo/capture.js";
import {
  BULLET_TYPES,
  type Bullet,
  MAX_WRITE_DEPTH,
  SIGNIFIERS,
  TASK_STATES,
} from "../../src/bujo/types.js";

/** Any text a capture could contain: random Unicode, kept only if the capture schema accepts it. */
export const bulletText: fc.Arbitrary<string> = fc
  .oneof(
    fc.string({ unit: "grapheme", minLength: 1, maxLength: 40 }),
    fc.string({ unit: "grapheme-ascii", minLength: 1, maxLength: 40 }),
    // Text that looks like the fields dibujo parses, so the edges get exercised.
    fc
      .tuple(
        fc.string({ unit: "grapheme-ascii", minLength: 1, maxLength: 10 }),
        fc.constantFrom(
          " ^",
          "^",
          " [[",
          "]]",
          " #",
          "#work",
          " ⏳",
          "[x] ",
          "* ",
          "- ",
          "\t",
          " ",
        ),
        fc.string({ unit: "grapheme-ascii", maxLength: 10 }),
      )
      .map(([a, b, c]) => `${a}${b}${c}`),
  )
  .map((raw) => BulletText.safeParse(raw))
  .filter((result) => result.success)
  .map((result) => result.data ?? "");

export const isoDate: fc.Arbitrary<string> = fc
  .date({
    min: new Date("2000-01-01T00:00:00Z"),
    max: new Date("2099-12-31T00:00:00Z"),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString().slice(0, 10));

export const blockId: fc.Arbitrary<string> = fc.stringMatching(/^[A-Za-z0-9-]{1,8}$/);

export const signifiers = fc.subarray([...SIGNIFIERS]);

/** A bullet that dibujo could write, including the fields added by migration and scheduling. */
export const bullet: fc.Arbitrary<Bullet> = fc
  .record({
    type: fc.constantFrom(...BULLET_TYPES),
    state: fc.constantFrom(...TASK_STATES),
    text: bulletText,
    signifiers,
    depth: fc.integer({ min: 0, max: MAX_WRITE_DEPTH }),
    origin: fc.option(fc.record({ date: isoDate, blockId }), { nil: undefined }),
    scheduled: fc.option(isoDate, { nil: undefined }),
    blockId: fc.option(blockId, { nil: undefined }),
  })
  .map((r) => {
    const b: Bullet = { type: r.type, signifiers: r.signifiers, text: r.text, depth: r.depth };
    if (r.type === "task") {
      b.state = r.state;
      if (r.origin) b.origin = r.origin;
      if (r.scheduled) b.scheduled = r.scheduled;
    }
    if (r.blockId) b.blockId = r.blockId;
    return b;
  });

export const folder = fc.constantFrom(undefined, "Bujo", "Journal/Bujo", "My Journal");
