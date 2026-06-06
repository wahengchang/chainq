// Runtime input handling shared by the CLI (`--input`) and the web server (the
// input-node params form). Keeping parsing + coercion + validation in ONE place
// means the two surfaces can never drift: a value typed into the web form is
// coerced and validated exactly like the same value passed on the command line.

import type { Flow, ParamSpec } from "./types.js";
import type { ValidationError } from "./validate.js"; // type-only: no runtime cycle

/** Parse a `--input k=v` (or web form) value: JSON if it parses
 * (numbers / bools / arrays), else the literal string. Used for params with no
 * declared `type` (the lenient default). */
export function parseVal(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

type Typed = "string" | "number" | "boolean";
const LEGAL_TYPES = new Set<string>(["string", "number", "boolean"]);

type Coerced = { ok: true; value: unknown } | { ok: false; expected: string };

/** Coerce a raw value to a declared param type. Bypasses parseVal — the raw
 * string goes straight to the type, so a type:"string" field keeps "42" a
 * string. Returns ok:false (with the expected type) when it can't. */
function coerceTyped(raw: unknown, type: Typed): Coerced {
  if (type === "string") return { ok: true, value: typeof raw === "string" ? raw : String(raw) };
  if (type === "number") {
    const n = typeof raw === "number" ? raw : Number(typeof raw === "string" ? raw.trim() : NaN);
    return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, expected: "number" };
  }
  // boolean
  if (typeof raw === "boolean") return { ok: true, value: raw };
  const s = String(raw).trim().toLowerCase();
  if (s === "true") return { ok: true, value: true };
  if (s === "false") return { ok: true, value: false };
  return { ok: false, expected: "boolean (true or false)" };
}

/** Coerce one raw runtime value for a param. Declared `type` → typed coercion
 * (bypassing parseVal); no type → parseVal (JSON-or-string), matching the CLI's
 * lenient `--input`. On a typed-coercion failure the raw value is returned as-is
 * — validateRunInput is the gate that reports it, and it runs first. */
export function coerceParam(raw: unknown, spec?: ParamSpec): unknown {
  if (spec?.type && LEGAL_TYPES.has(spec.type)) {
    const r = coerceTyped(raw, spec.type);
    return r.ok ? r.value : raw;
  }
  return typeof raw === "string" ? parseVal(raw) : raw;
}

/** Union of every input node's param specs, by name (params should be unique
 * across input nodes; later wins, matching the single global input[] model). */
function inputSpecs(flow: Flow): Record<string, ParamSpec> {
  const specs: Record<string, ParamSpec> = {};
  for (const n of Object.values(flow.steps)) {
    if (n.type === "input")
      for (const [k, s] of Object.entries(n.params ?? {})) specs[k] = s;
  }
  return specs;
}

/** Coerce a list of runtime input sets against a flow's input-node params, and
 * collapse "no real values" to undefined. Sending `[{}]` instead of `undefined`
 * would fold a DIFFERENT Merkle cache key (computeKeys folds input) for what is
 * the same run — so an all-empty input must become undefined, never `[{}]`.
 * Assumes the input already passed validateRunInput. */
export function coerceInput(
  flow: Flow,
  input: Record<string, unknown>[] | undefined,
): Record<string, unknown>[] | undefined {
  if (!input || input.length === 0) return undefined;
  const specs = inputSpecs(flow);
  const coerced = input.map((set) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(set)) out[k] = coerceParam(v, specs[k]);
    return out;
  });
  return coerced.some((s) => Object.keys(s).length > 0) ? coerced : undefined;
}

// One error-message shape so the CLI and the web read identically.
const perr = (node: string, param: string, message: string): ValidationError => ({
  node,
  message: `input "${param}": ${message}`,
});

/** Runtime validation of the supplied input against the flow's input-node
 * params: required-but-missing, and declared-type mismatches. Called at BOTH run
 * gates (CLI before run, web streamRun before the Runner) so the two surfaces
 * give the same error. `validate(flow)` can't do this — it has no runtime values
 * — so this is a separate function that takes the input. */
export function validateRunInput(
  flow: Flow,
  input: Record<string, unknown>[] | undefined,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const sets = input && input.length ? input : [{}];
  for (const n of Object.values(flow.steps)) {
    if (n.type !== "input") continue;
    for (const [name, spec] of Object.entries(n.params ?? {})) {
      const hasDefault = spec.default !== undefined;
      for (const set of sets) {
        const has = Object.prototype.hasOwnProperty.call(set, name);
        if (!has) {
          // not supplied: only an error if required AND no default to fall back on
          if (spec.required && !hasDefault) errors.push(perr(n.id, name, "required, but no value was supplied"));
          continue;
        }
        if (spec.type && LEGAL_TYPES.has(spec.type)) {
          const r = coerceTyped(set[name], spec.type);
          if (!r.ok) errors.push(perr(n.id, name, `must be a ${r.expected}, got ${JSON.stringify(set[name])}`));
        }
      }
    }
  }
  return errors;
}

/** Static (no runtime values) checks on one declared param, called from
 * validate(flow): the `type` literal is legal, and any declared `default` is
 * itself coercible to that type. This is the half that genuinely belongs in the
 * static validator (壞不落地 for the contract itself). */
export function staticParamErrors(nodeId: string, name: string, spec: ParamSpec): ValidationError[] {
  const errors: ValidationError[] = [];
  if (spec.type !== undefined && !LEGAL_TYPES.has(spec.type)) {
    errors.push(perr(nodeId, name, `type "${String(spec.type)}" is not one of string | number | boolean`));
    return errors; // can't check a default against an illegal type
  }
  if (spec.type && spec.default !== undefined) {
    const r = coerceTyped(spec.default, spec.type);
    if (!r.ok) errors.push(perr(nodeId, name, `default ${JSON.stringify(spec.default)} is not a ${r.expected}`));
  }
  return errors;
}
