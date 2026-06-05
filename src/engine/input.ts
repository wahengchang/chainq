// Runtime input handling shared by the CLI (`--input`) and the web server (the
// input-node params form). Keeping parsing + coercion in ONE place means the two
// surfaces can never drift: a value typed into the web form is coerced exactly
// like the same value passed on the command line.

import type { Flow, ParamSpec } from "./types.js";

/** Parse a `--input k=v` (or web form) value: JSON if it parses
 * (numbers / bools / arrays), else the literal string. */
export function parseVal(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

/** Coerce one raw runtime value for a declared param. Increment 1: params carry
 * no declared `type` yet, so this is parseVal (JSON-or-string), matching the CLI.
 * `spec` is already threaded so Increment 2 can add the typed branch (bypass
 * parseVal when spec.type is set) without touching any caller. */
export function coerceParam(raw: unknown, _spec?: ParamSpec): unknown {
  return typeof raw === "string" ? parseVal(raw) : raw;
}

/** Coerce a list of runtime input sets against a flow's input-node params, and
 * collapse "no real values" to undefined. Sending `[{}]` instead of `undefined`
 * would fold a DIFFERENT Merkle cache key (computeKeys folds input) for what is
 * the same run — so an all-empty input must become undefined, never `[{}]`. */
export function coerceInput(
  flow: Flow,
  input: Record<string, unknown>[] | undefined,
): Record<string, unknown>[] | undefined {
  if (!input || input.length === 0) return undefined;
  // union of every input node's param specs, by name (params should be unique
  // across input nodes — see design "multiple input nodes").
  const specs: Record<string, ParamSpec> = {};
  for (const n of Object.values(flow.steps)) {
    if (n.type === "input")
      for (const [k, s] of Object.entries(n.params ?? {})) specs[k] = s;
  }
  const coerced = input.map((set) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(set)) out[k] = coerceParam(v, specs[k]);
    return out;
  });
  return coerced.some((s) => Object.keys(s).length > 0) ? coerced : undefined;
}
