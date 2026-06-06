// Structured-output validation for ai steps (C4). Local CLI models have no API
// "JSON mode", so we must extract JSON from a chatty answer ourselves, validate
// it against a declared schema, and (in run.ts) retry once on a mismatch.

import type { SchemaSpec, SchemaType } from "./types.js";

/** Pull a JSON value out of a model's text answer: strip ``` fences and any prose
 * around the outermost { } or [ ]. Throws if nothing parses. */
export function extractJson(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {
    /* fall through to slice the outermost object/array */
  }
  const starts = [stripped.indexOf("{"), stripped.indexOf("[")].filter((i) => i >= 0);
  const start = starts.length ? Math.min(...starts) : -1;
  const end = Math.max(stripped.lastIndexOf("}"), stripped.lastIndexOf("]"));
  if (start >= 0 && end > start) return JSON.parse(stripped.slice(start, end + 1));
  throw new Error("no JSON found in the output");
}

const typeOf = (v: unknown): SchemaType | "null" =>
  v === null ? "null" : Array.isArray(v) ? "array" : (typeof v as SchemaType);

/** Validate a parsed value against a minimal field→type schema. Returns a list of
 * human-readable mismatches (empty = valid). Extra fields are allowed; the check
 * is shallow (array/object check the container only — by design). */
export function schemaErrors(value: unknown, schema: SchemaSpec): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [`expected a JSON object, got ${typeOf(value)}`];
  }
  const obj = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const [field, type] of Object.entries(schema)) {
    if (!(field in obj)) {
      errors.push(`missing field "${field}"`);
      continue;
    }
    const got = typeOf(obj[field]);
    const ok = type === "number" ? typeof obj[field] === "number" && Number.isFinite(obj[field]) : got === type;
    if (!ok) errors.push(`field "${field}" should be ${type}, got ${got}`);
  }
  return errors;
}

/** The corrective instruction appended to the prompt on a retry. */
export function correctionNote(errors: string[]): string {
  return (
    "\n\nYour previous answer was invalid: " +
    errors.join("; ") +
    ".\nReturn ONLY valid JSON matching the required shape — no prose, no code fences."
  );
}
