/** Error codes that mean the caller used the CLI wrongly. Exit code 2. */
const USAGE_CODES = [
  "USAGE",
  "INVALID_INPUT",
  "INVALID_DATE",
  "INVALID_REF",
  "UNKNOWN_HARNESS",
] as const;

/** Error codes for runtime failures. Exit code 1. */
const RUNTIME_CODES = [
  "CONFIG_MISSING",
  "CONFIG_INVALID",
  "CONFIG_EXISTS",
  "VAULT_NOT_FOUND",
  "NOTE_CHANGED",
  "NOTE_VERSION_UNSUPPORTED",
  "TASK_NOT_FOUND",
  "NOT_A_TASK",
  "TASK_NOT_OPEN",
  "SUMMARY_EXISTS",
  "INTERNAL",
] as const;

export type UsageErrorCode = (typeof USAGE_CODES)[number];
export type RuntimeErrorCode = (typeof RUNTIME_CODES)[number];
export type ErrorCode = UsageErrorCode | RuntimeErrorCode;

export const EXIT_OK = 0;
export const EXIT_RUNTIME = 1;
export const EXIT_USAGE = 2;

/** An expected failure, with a stable code that skills and scripts can branch on. */
export class DibujoError extends Error {
  readonly code: ErrorCode;
  readonly hint: string | undefined;

  constructor(code: ErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "DibujoError";
    this.code = code;
    this.hint = hint;
  }
}

export function exitCodeFor(code: ErrorCode): number {
  return (USAGE_CODES as readonly string[]).includes(code) ? EXIT_USAGE : EXIT_RUNTIME;
}

export function isDibujoError(value: unknown): value is DibujoError {
  return value instanceof DibujoError;
}
