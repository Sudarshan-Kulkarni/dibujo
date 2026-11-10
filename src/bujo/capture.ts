import { createHash } from "node:crypto";
import { z } from "zod";
import { DibujoError } from "../errors.js";
import { BULLET_TYPES, type Bullet, MAX_WRITE_DEPTH, SIGNIFIERS, TASK_STATES } from "./types.js";

const RESERVED_TAG = /#(priority|inspiration)\b/i;
/** Any `[?]` at the start would make the written line look like a checkbox. */
const LEADING_CHECKBOX = /^\[.\]/;
const TRAILING_BLOCK_ID_LIKE = /\s\^[A-Za-z0-9-]+$/;
const TRAILING_BLOCK_LINK = /\[\[[^\]]*#\^[^\]]*\]\]$/;

export const BulletText = z
  .string()
  .trim()
  .min(1, "must not be empty")
  .refine((t) => !/[\r\n\u2028\u2029]/.test(t), "must be a single line")
  .refine((t) => !LEADING_CHECKBOX.test(t), "must not start with a checkbox like [ ]")
  .refine((t) => !RESERVED_TAG.test(t), "use `signifiers` instead of #priority/#inspiration")
  .refine((t) => !t.includes("⏳"), "must not contain ⏳ (scheduled dates are set by dibujo)")
  .refine((t) => !TRAILING_BLOCK_ID_LIKE.test(t), "must not end with a block id like ^abc123")
  .refine((t) => !TRAILING_BLOCK_LINK.test(t), "must not end with a block link like [[note#^id]]");

export const BulletInput = z
  .object({
    type: z.enum(BULLET_TYPES),
    text: BulletText,
    state: z.enum(TASK_STATES).optional(),
    signifiers: z.array(z.enum(SIGNIFIERS)).default([]),
    depth: z.number().int().min(0).max(MAX_WRITE_DEPTH).default(0),
  })
  .strict()
  .superRefine((bullet, ctx) => {
    if (bullet.state !== undefined && bullet.type !== "task") {
      ctx.addIssue({
        code: "custom",
        path: ["state"],
        message: "is only allowed on tasks",
      });
    }
  });

export const CaptureInput = z
  .object({
    raw: z.string().trim().min(1, "must not be empty"),
    bullets: z.array(BulletInput).min(1, "must contain at least one bullet"),
  })
  .strict()
  .superRefine((capture, ctx) => {
    let previous = -1;
    capture.bullets.forEach((bullet, index) => {
      if (bullet.depth > previous + 1) {
        ctx.addIssue({
          code: "custom",
          path: ["bullets", index, "depth"],
          message:
            index === 0
              ? "the first bullet must have depth 0"
              : `can be at most one level deeper than the bullet before it (${previous})`,
        });
      }
      previous = bullet.depth;
    });
  });

export interface Capture {
  /** Raw text with normalized line endings and no trailing whitespace. */
  raw: string;
  bullets: Bullet[];
}

/** Parses and validates capture JSON from stdin. Throws `INVALID_INPUT` with field paths. */
export function parseCapture(json: string): Capture {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new DibujoError(
      "INVALID_INPUT",
      "Capture input is not valid JSON.",
      'Pipe a JSON object like {"raw": "...", "bullets": [...]} on stdin.',
    );
  }
  const result = CaptureInput.safeParse(value);
  if (!result.success) {
    throw new DibujoError(
      "INVALID_INPUT",
      `Capture input is invalid: ${formatIssues(result.error)}`,
      "See references/vault-format.md for the capture schema.",
    );
  }
  return {
    raw: normalizeRaw(result.data.raw),
    bullets: result.data.bullets.map((b) => {
      const bullet: Bullet = {
        type: b.type,
        signifiers: dedupe(b.signifiers),
        text: b.text,
        depth: b.depth,
      };
      if (b.type === "task") bullet.state = b.state ?? "open";
      return bullet;
    }),
  };
}

/** Lists each issue as `path: message`. Never includes the input values. */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

/** Normalizes line endings, strips trailing whitespace on each line, and trims blank edges. */
export function normalizeRaw(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/^\n+|\n+$/g, "");
}

/** Stable 8-hex-character id for a capture, used to skip duplicate submissions. */
export function captureId(capture: Capture): string {
  const canonical = {
    raw: normalizeRaw(capture.raw),
    bullets: capture.bullets.map((b) => ({
      type: b.type,
      state: b.type === "task" ? (b.state ?? "open") : null,
      signifiers: [...b.signifiers],
      text: b.text,
      depth: b.depth,
    })),
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 8);
}

/** Formats the collapsed callout that stores a capture's raw text. */
export function formatCallout(time: string, id: string, raw: string): string[] {
  const body = normalizeRaw(raw)
    .split("\n")
    .map((line) => (line.length > 0 ? `> ${line}` : ">"));
  return [`> [!capture]- ${time} · ${id}`, ...body];
}

/** Matches a capture callout title line and captures its id. */
export const CALLOUT_HEADER = /^>\s*\[!capture\][+-]?\s.*·\s*([0-9a-f]{8})\s*$/i;

function dedupe<T>(values: readonly T[]): T[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}
