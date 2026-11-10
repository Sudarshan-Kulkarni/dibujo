import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, journalDate, localTime, parseDateArg } from "../../src/bujo/journal-date.js";
import { DibujoError } from "../../src/errors.js";

// Pin a time zone with DST so the tests mean the same thing on every machine.
const originalTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/New_York";
});
afterAll(() => {
  process.env.TZ = originalTz;
});

describe("journalDate", () => {
  it("uses the calendar date when the day starts at midnight", () => {
    expect(journalDate(new Date("2026-11-09T00:00:00"), 0)).toBe("2026-11-09");
    expect(journalDate(new Date("2026-11-09T23:59:59"), 0)).toBe("2026-11-09");
  });

  it("counts times before the day-start hour as the previous day", () => {
    expect(journalDate(new Date("2026-11-10T01:30:00"), 4)).toBe("2026-11-09");
    expect(journalDate(new Date("2026-11-10T03:59:59"), 4)).toBe("2026-11-09");
    expect(journalDate(new Date("2026-11-10T04:00:00"), 4)).toBe("2026-11-10");
  });

  it("crosses month and year boundaries", () => {
    expect(journalDate(new Date("2027-01-01T02:00:00"), 4)).toBe("2026-12-31");
    expect(journalDate(new Date("2026-03-01T02:00:00"), 4)).toBe("2026-02-28");
  });

  it("keeps the boundary on the wall clock when DST starts", () => {
    // 2026-03-08: clocks jump from 02:00 to 03:00 in New York.
    expect(journalDate(new Date("2026-03-08T03:30:00"), 4)).toBe("2026-03-07");
    expect(journalDate(new Date("2026-03-08T04:30:00"), 4)).toBe("2026-03-08");
  });

  it("keeps the boundary on the wall clock when DST ends", () => {
    // 2026-11-01: clocks fall back from 02:00 to 01:00 in New York.
    expect(journalDate(new Date("2026-11-01T01:30:00-05:00"), 4)).toBe("2026-10-31");
    expect(journalDate(new Date("2026-11-01T04:30:00"), 4)).toBe("2026-11-01");
  });

  it("supports the last hour of the range", () => {
    expect(journalDate(new Date("2026-11-10T22:59:00"), 23)).toBe("2026-11-09");
    expect(journalDate(new Date("2026-11-10T23:00:00"), 23)).toBe("2026-11-10");
  });
});

describe("parseDateArg", () => {
  it.each(["2026-11-09", "2024-02-29", "2026-12-31", "2026-01-01"])("accepts %s", (value) => {
    expect(parseDateArg(value)).toBe(value);
  });

  it.each([
    "2026-02-30",
    "2025-02-29",
    "2026-13-01",
    "2026-00-10",
    "2026-11-31",
    "2026-11-9",
    "26-11-09",
    "2026/11/09",
    "today",
    "",
    " 2026-11-09",
    "2026-11-09T00:00",
  ])("rejects %j with INVALID_DATE", (value) => {
    expect(() => parseDateArg(value)).toThrow(DibujoError);
    try {
      parseDateArg(value);
    } catch (error) {
      expect((error as DibujoError).code).toBe("INVALID_DATE");
    }
  });
});

describe("localTime", () => {
  it("formats the local time as HH:mm", () => {
    expect(localTime(new Date("2026-11-09T08:42:59"))).toBe("08:42");
    expect(localTime(new Date("2026-11-09T21:05:00"))).toBe("21:05");
  });
});

describe("addDays", () => {
  it.each([
    ["2026-11-09", -1, "2026-11-08"],
    ["2026-11-09", 1, "2026-11-10"],
    ["2026-11-09", 0, "2026-11-09"],
    ["2026-12-01", -1, "2026-11-30"],
    ["2026-10-31", 1, "2026-11-01"],
    ["2027-01-01", -1, "2026-12-31"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2024-03-01", -1, "2024-02-29"],
    ["2024-02-28", 1, "2024-02-29"],
    ["2025-03-01", -1, "2025-02-28"],
    ["2026-11-09", -365, "2025-11-09"],
  ])("%s %+d is %s", (date, n, expected) => {
    expect(addDays(date, n)).toBe(expected);
  });

  it("is not moved by DST changes", () => {
    // DST starts 2026-03-08 and ends 2026-11-01 in New York.
    expect(addDays("2026-03-08", -1)).toBe("2026-03-07");
    expect(addDays("2026-03-09", -1)).toBe("2026-03-08");
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
    expect(addDays("2026-11-02", -1)).toBe("2026-11-01");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
});
