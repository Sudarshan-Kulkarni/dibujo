import { describe, expect, it } from "vitest";
import { type ErrorCode, EXIT_RUNTIME, EXIT_USAGE, exitCodeFor } from "../src/errors.js";

describe("exitCodeFor", () => {
  it.each<ErrorCode>(["USAGE", "INVALID_INPUT", "INVALID_DATE", "INVALID_REF", "UNKNOWN_HARNESS"])(
    "maps %s to the usage exit code",
    (code) => {
      expect(exitCodeFor(code)).toBe(EXIT_USAGE);
    },
  );

  it.each<ErrorCode>([
    "CONFIG_MISSING",
    "CONFIG_INVALID",
    "CONFIG_EXISTS",
    "VAULT_NOT_FOUND",
    "NOTE_CHANGED",
    "NOTE_VERSION_UNSUPPORTED",
    "TASK_NOT_FOUND",
    "NOT_A_TASK",
    "TASK_NOT_OPEN",
    "INTERNAL",
  ])("maps %s to the runtime exit code", (code) => {
    expect(exitCodeFor(code)).toBe(EXIT_RUNTIME);
  });
});
