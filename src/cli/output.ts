import { DibujoError, type ErrorCode } from "../errors.js";
import type { Ctx } from "./context.js";

export interface ErrorPayload {
  code: ErrorCode;
  message: string;
  hint?: string;
}

/**
 * Writes command results. In JSON mode stdout gets exactly one JSON document;
 * everything else goes to stderr.
 */
export class Output {
  constructor(
    private readonly ctx: Ctx,
    readonly json: boolean,
  ) {}

  /** Prints a successful result: `data` as JSON, or the human lines. */
  success(data: unknown, human: string | readonly string[]): void {
    if (this.json) {
      this.ctx.stdout.write(`${JSON.stringify({ ok: true, data })}\n`);
      return;
    }
    const lines = typeof human === "string" ? [human] : human;
    if (lines.length > 0) this.ctx.stdout.write(`${lines.join("\n")}\n`);
  }

  /** Prints a side message (warnings, progress). Always stderr, so JSON stdout stays clean. */
  info(message: string): void {
    this.ctx.stderr.write(`${message}\n`);
  }

  error(error: ErrorPayload): void {
    if (this.json) {
      this.ctx.stdout.write(`${JSON.stringify({ ok: false, error })}\n`);
      return;
    }
    this.ctx.stderr.write(`error: ${error.message}\n`);
    if (error.hint) this.ctx.stderr.write(`hint: ${error.hint}\n`);
  }
}

export function toPayload(error: DibujoError): ErrorPayload {
  return error.hint === undefined
    ? { code: error.code, message: error.message }
    : { code: error.code, message: error.message, hint: error.hint };
}

export const INTERNAL_MESSAGE = "Unexpected internal error.";
export const INTERNAL_HINT = "Run again with DIBUJO_DEBUG=1 to print details.";

export function internalPayload(): ErrorPayload {
  return { code: "INTERNAL", message: INTERNAL_MESSAGE, hint: INTERNAL_HINT };
}

export { DibujoError };
