import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { formatFutureRef, formatRef, parseFutureRef, parseRef } from "../../src/bujo/ref.js";
import { DibujoError } from "../../src/errors.js";
import { isoDate } from "../helpers/arbitraries.js";

describe("refs", () => {
  it("formats and parses a ref", () => {
    expect(formatRef("2026-11-09", 7, "9c04e7d1")).toBe("2026-11-09:7:9c04e7d1");
    expect(parseRef("2026-11-09:7:9c04e7d1")).toEqual({
      date: "2026-11-09",
      line: 7,
      fingerprint: "9c04e7d1",
    });
  });

  it.each([
    "",
    "2026-11-09",
    "2026-11-09:7",
    "2026-11-09:0:9c04e7d1",
    "2026-11-09:07:9c04e7d1",
    "2026-11-09:-1:9c04e7d1",
    "2026-11-09:7:9C04E7D1",
    "2026-11-09:7:9c04e7d",
    "2026-11-09:7:9c04e7d1x",
    "2026-02-30:7:9c04e7d1",
    "2026-11-09:7:9c04e7d1; rm -rf ~",
    " 2026-11-09:7:9c04e7d1",
  ])("rejects %j with INVALID_REF", (value) => {
    try {
      parseRef(value);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DibujoError);
      expect((error as DibujoError).code).toBe("INVALID_REF");
    }
  });

  it("round-trips any ref", () => {
    fc.assert(
      fc.property(
        isoDate,
        fc.integer({ min: 1, max: 9_999_999 }),
        fc.stringMatching(/^[0-9a-f]{8}$/),
        (date, line, fp) => {
          expect(parseRef(formatRef(date, line, fp))).toEqual({ date, line, fingerprint: fp });
        },
      ),
    );
  });
});

describe("future refs", () => {
  it("round-trips any future ref", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9999 }).map((n) => String(n).padStart(4, "0")),
        fc.integer({ min: 1, max: 9_999_999 }),
        fc.stringMatching(/^[0-9a-f]{8}$/),
        (year, line, fp) => {
          expect(parseFutureRef(formatFutureRef(year, line, fp))).toEqual({
            year,
            line,
            fingerprint: fp,
          });
        },
      ),
    );
  });

  it("points each parser at the other kind of ref", () => {
    const hint = (fn: () => unknown): string => {
      try {
        fn();
      } catch (error) {
        return (error as DibujoError).hint ?? "";
      }
      return "";
    };
    expect(hint(() => parseFutureRef("2026-11-09:7:9c04e7d1"))).toContain("dibujo task");
    expect(hint(() => parseRef("2026:14:9c04e7d1"))).toContain("dibujo future");
  });
});
