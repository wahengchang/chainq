// Node identity + construction helpers — the single source of truth the UI's
// "+ add" and rename share with the engine, so the two never drift.
//
// A node id is its YAML key, but it is ALSO an output filename (`.chain/<id>.out`),
// a DOM/CSS selector in the editor, and part of a cache key. So it must be safe in
// all of those: an identifier-shaped whitelist, not "any YAML key". We gate ids at
// the points where a NEW one enters (add / rename), not retroactively in validate,
// so existing hand-written flows are never rejected.

import type { NodeType } from "./types.js";

const ID_RE = /^[A-Za-z_][A-Za-z0-9_-]*$/;
const MAX_ID = 64;

/** True if `id` is safe as a YAML key, filename, CSS selector, and cache key. */
export function isValidNodeId(id: string): boolean {
  return typeof id === "string" && id.length > 0 && id.length <= MAX_ID && ID_RE.test(id);
}

/** Human-readable reason an id is rejected, or null if it is valid. */
export function nodeIdError(id: string): string | null {
  if (typeof id !== "string" || id.length === 0) return "node id is empty";
  if (id.length > MAX_ID) return `node id too long (max ${MAX_ID} characters)`;
  if (!ID_RE.test(id)) {
    return `node id "${id}" has illegal characters — use letters, digits, _ and - (and start with a letter or _)`;
  }
  return null;
}

/** The minimal legal fields for a freshly-added node of `type`. `from` is left
 * out — the user wires it by dragging a connection — so a node that needs input
 * is intentionally still "needs input" until wired (validate surfaces that). */
export function nodeStarter(type: NodeType): Record<string, unknown> {
  switch (type) {
    case "ai":
      return { type, prompt: "new step" };
    case "cmd":
      return { type, run: "echo hello" };
    case "assemble":
      return { type, prompt: "{{ $json }}" };
    case "input":
      return { type, params: {} };
    case "write":
      return { type, path: "out/{{date}}.md", mode: "overwrite" };
    default:
      // Unknown type (a typo, or a removed splitOut/aggregate/merge). Return a
      // minimal {type} node — parseable, flagged by validate, painted as an error
      // node in the editor — instead of `undefined`, which would crash callers
      // (/api/add-node writing null, /api/set-type dereferencing starter.from).
      return { type };
  }
}
