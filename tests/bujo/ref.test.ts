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
  it("formats and parses a ref", () => {
    expect(formatFutureRef(14, "9c04e7d1")).toBe("14:9c04e7d1");
    expect(parseFutureRef("14:9c04e7d1")).toEqual({ line: 14, fingerprint: "9c04e7d1" });
  });

  it("round-trips any future ref", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9_999_999 }),
        fc.stringMatching(/^[0-9a-f]{8}$/),
        (line, fp) => {
          expect(parseFutureRef(formatFutureRef(line, fp))).toEqual({ line, fingerprint: fp });
        },
      ),
    );
  });

  const codeOf = (fn: () => unknown): { code?: string; hint?: string } => {
    try {
      fn();
    } catch (error) {
      return { code: (error as DibujoError).code, hint: (error as DibujoError).hint };
    }
    return {};
  };

  it.each([
    ["a daily ref", "2026-11-09:7:9c04e7d1"],
    ["the old year form", "2026:14:9c04e7d1"],
    ["no fingerprint", "14"],
    ["a line of 0", "0:9c04e7d1"],
    ["a leading zero", "014:9c04e7d1"],
    ["an upper-case fingerprint", "14:9C04E7D1"],
    ["a short fingerprint", "14:9c04e7d"],
    ["trailing text", "14:9c04e7d1; rm -rf ~"],
    ["nothing", ""],
  ])("rejects %s with INVALID_REF and a hint to get fresh refs", (_name, value) => {
    const { code, hint } = codeOf(() => parseFutureRef(value));
    expect(code).toBe("INVALID_REF");
    expect(hint).toContain("dibujo future show");
    expect(hint).toContain("dibujo future due");
  });

  it("tells a daily ref apart, and points each parser at the other kind of ref", () => {
    expect(codeOf(() => parseFutureRef("2026-11-09:7:9c04e7d1")).hint).toContain("dibujo task");
    expect(codeOf(() => parseRef("14:9c04e7d1")).hint).toContain("dibujo future");
    expect(codeOf(() => parseRef("2026:14:9c04e7d1")).code).toBe("INVALID_REF");
  });
});
