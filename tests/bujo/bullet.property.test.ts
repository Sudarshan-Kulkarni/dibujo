import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fingerprint, formatBullet, parseBulletLine } from "../../src/bujo/bullet.js";
import { blockId, bullet, folder, isoDate } from "../helpers/arbitraries.js";

describe("bullet properties", () => {
  it("parses every formatted bullet back to itself, with or without a folder", () => {
    fc.assert(
      fc.property(bullet, folder, (b, f) => {
        const options = f === undefined ? {} : { folder: f };
        expect(parseBulletLine(formatBullet(b, options))).toEqual(b);
      }),
      { numRuns: 2000 },
    );
  });

  it("keeps the fingerprint when only state, dates, or block id change", () => {
    fc.assert(
      fc.property(bullet, isoDate, blockId, (b, date, id) => {
        const before = fingerprint(b);
        if (b.type === "task") {
          expect(fingerprint({ ...b, state: "migrated" })).toBe(before);
          expect(fingerprint({ ...b, scheduled: date })).toBe(before);
        }
        if (b.type === "event") {
          expect(fingerprint({ ...b, eventDate: date })).toBe(before);
        }
        expect(fingerprint({ ...b, blockId: id })).toBe(before);
      }),
    );
  });
});
