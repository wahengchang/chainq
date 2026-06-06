// Rename a node id across a flow document — the structural edit behind the
// editor's inline-rename. Works on the `yaml` Document (not a parsed Flow) so
// comments and key order survive (保留註解). It does NOT validate or write: the
// caller (UI server / CLI) validates the mutated doc and writes only if clean,
// so a rename that would dangle a reference never lands (壞不落地).
//
//   steps:
//     a: { type: ai, prompt: '...' }
//     b: { type: ai, from: a, prompt: "{{ $('a') }}" }   ← rename a→x updates:
//                                                            • a's own key
//                                                            • b.from
//                                                            • b.prompt $('a')

import type { Document } from "yaml";
import { rewriteRefs } from "./render.js";

/** Rename `oldId` to `newId` everywhere in the flow doc, in place. Throws if
 * `oldId` is absent or `newId` already exists (the caller surfaces that as a
 * 400 / CLI error). No-op if the ids are equal. */
export function renameNode(doc: Document, oldId: string, newId: string): void {
  if (oldId === newId) return;
  const steps = doc.getIn(["steps"]) as
    | { has(k: string): boolean; items: Array<{ key: unknown; value: unknown }> }
    | undefined;
  if (!steps || typeof steps.has !== "function" || !steps.has(oldId)) {
    throw new Error(`rename: node "${oldId}" not found`);
  }
  if (steps.has(newId)) throw new Error(`rename: node "${newId}" already exists`);

  for (const pair of steps.items) {
    // 1. the renamed step's own key — mutate the Scalar in place to keep its
    //    position and any attached comments.
    const key = pair.key as { value?: unknown } | string;
    if (keyStr(key) === oldId && typeof key === "object") key.value = newId;

    // 2. every step's `from:` (scalar or list) + its prompt references.
    const node = pair.value as
      | { get(k: string): unknown; set(k: string, v: unknown): void; toJSON(): Record<string, unknown> }
      | null;
    if (!node || typeof node.get !== "function") continue;
    renameFrom(node, oldId, newId);
    const prompt = node.get("prompt");
    if (typeof prompt === "string" && prompt.includes(oldId)) {
      node.set("prompt", rewriteRefs(prompt, oldId, newId));
    }
  }
}

function keyStr(key: { value?: unknown } | string): string {
  return typeof key === "object" && key !== null ? String(key.value) : String(key);
}

function renameFrom(
  node: { set(k: string, v: unknown): void; toJSON(): Record<string, unknown> },
  oldId: string,
  newId: string,
): void {
  const from = node.toJSON()?.from; // string | string[] | undefined (resolved)
  if (from === oldId) {
    node.set("from", newId);
  } else if (Array.isArray(from) && from.includes(oldId)) {
    node.set(
      "from",
      from.map((x: string) => (x === oldId ? newId : x)),
    );
  }
}
