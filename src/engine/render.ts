// Tier-1 expression substitution for prompt templates (the statically-checkable
// path selectors from the design §4.2). The tier-2 read-only JS sandbox
// ({{ a + b }}) stays deferred (security surface, eng review).
//
// items model: a node runs once per primary input item; `index` selects which.
//   {{ $json }}                whole current item value (raw text stays raw)
//   {{ $json.title }}          a field of the current item
//   {{ $json[0] }} {{ $json[*] }}  root-level array index / column pluck
//   {{ $json.items[-1].text }} nested + negative index
//   {{ $node["id"] }} {{ $('id') }}        the PAIRED item of upstream id (n8n $('Node').item)
//   {{ $('id').item.x }}                   explicit paired item + path
//   {{ $('id').all() }} {{ $('id').all()[*].x }}   ALL items of upstream id as a JSON array
//
// Unknown expressions are left verbatim so they're visible, not silently blanked.

import type { Item } from "./types.js";

export interface RenderInputs {
  /** id -> that upstream's full items (n8n items model) */
  items: Record<string, Item[]>;
  /** the primary upstream id (first in `from`), if any — binds $json */
  primary?: string;
  /** which item index this render is for (per-item execution); default 0 */
  index?: number;
  /**
   * The current primary item's `pairedItem` — the single-hop index it traces back
   * to in its own direct input. Kept as a back-compat fallback for callers that
   * don't supply `lineage`, and for references to upstreams that sit OFF the
   * primary spine. Defaults to `index` when absent (1-in-1-out chains).
   */
  pairedIndex?: number;
  /**
   * Multi-hop paired-item lineage: ancestorId -> the source item index in that
   * ancestor for the current primary item. Built in run.ts by composing
   * `pairedItem` up the primary-input spine (the `from[0]` chain), so
   * $('id') / $node["id"] / .item to OTHER upstreams pairs to the right row
   * through CHAINED fan-outs — not just one hop. A reference whose id is present here uses
   * lineage[id]; anything off the spine falls back to `pairedIndex`. Optional:
   * a 1-in-1-out render (or any caller not tracking lineage) omits it with no
   * behavior change.
   */
  lineage?: Record<string, number>;
}

const EXPR = /\{\{\s*(.*?)\s*\}\}/g;

// The two ways a prompt names an upstream node. These are the SINGLE SOURCE OF
// TRUTH for "what is a node reference", shared by promptRefs (read — validate's
// wiring check), resolveExpr (run), and rewriteRefs (rename). Capture groups:
//   1 = prefix, 2 = id, 3 = suffix
// so rename can swap the id while keeping the original quote style. Anchored at
// the start of an expression; any trailing path/.all()/.item is whatever follows.
const NODE_REF = /^(\$node\[["'])([^"']+)(["']\])/; // $node["id"]
const ALIAS_REF = /^(\$\(\s*["'])([^"']+)(["']\s*\))/; // $('id')

export function renderPrompt(template: string, inputs: RenderInputs): string {
  return template.replace(EXPR, (whole, expr: string) => {
    const resolved = resolveExpr(expr.trim(), inputs);
    return resolved ?? whole;
  });
}

/** What upstreams a template refers to — so validate can check they're wired in `from:`. */
export interface PromptRefs {
  /** uses {{ $json }} / {{ $json.path }} / {{ $json[...] }} (binds to the primary upstream). */
  usesJson: boolean;
  /** ids named via {{ $node["id"] }} or the alias {{ $('id') }}. */
  nodes: string[];
}

export function promptRefs(template: string): PromptRefs {
  const nodes = new Set<string>();
  let usesJson = false;
  for (const m of template.matchAll(EXPR)) {
    const expr = m[1]!.trim();
    if (/^\$json(?:[.[]|$)/.test(expr)) usesJson = true;
    const nm = NODE_REF.exec(expr) ?? ALIAS_REF.exec(expr);
    if (nm) nodes.add(nm[2]!); // group 2 = id
  }
  return { usesJson, nodes: [...nodes] };
}

/** Rename an upstream reference inside a prompt: every {{ $('old') }} /
 * {{ $node["old"] }} becomes newId, keeping the quote style and any trailing
 * path / .all() / .item. Only ids INSIDE {{ }} are touched — a literal $('x')
 * in prose stays as-is. Reuses NODE_REF/ALIAS_REF so it can never drift from how
 * promptRefs/validate recognise a reference. */
export function rewriteRefs(template: string, oldId: string, newId: string): string {
  const swap = (m: string, pre: string, id: string, suf: string) =>
    id === oldId ? pre + newId + suf : m;
  return template.replace(EXPR, (whole: string, raw: string) => {
    const expr = raw.trim();
    const out = expr.replace(NODE_REF, swap).replace(ALIAS_REF, swap);
    return out === expr ? whole : `{{ ${out} }}`;
  });
}

/** The item paired to `index` (clamped to the upstream's last item). */
function paired(items: Item[] | undefined, index: number): Item | undefined {
  if (!items || items.length === 0) return undefined;
  return items[Math.min(index, items.length - 1)];
}

function resolveExpr(expr: string, inputs: RenderInputs): string | undefined {
  const idx = inputs.index ?? 0;

  // $json[.path | [i] | [*]] — the current primary item
  const m = /^\$json\b([.[].*)?$/.exec(expr);
  if (m) {
    if (!inputs.primary) return undefined;
    const cur = paired(inputs.items[inputs.primary], idx);
    return cur === undefined ? undefined : selectVal(cur.json, m[1]);
  }

  // $node["id"] / $('id'), optionally .all() or .item, then a path
  const nm = NODE_REF.exec(expr) ?? ALIAS_REF.exec(expr);
  if (nm) {
    const id = nm[2]!;
    const rest = expr.slice(nm[0]!.length);
    const its = inputs.items[id];
    if (its === undefined) return undefined;
    const allM = /^\.all\(\)(.*)$/.exec(rest);
    if (allM) return selectVal(its.map((i) => i.json), allM[1]); // all items as an array
    const itemM = /^\.item\b(.*)$/.exec(rest);
    const path = itemM ? itemM[1] : rest;
    // The paired item of OTHER upstreams follows the current item's lineage:
    // prefer the multi-hop walk (lineage[id], correct through chained fan-outs),
    // fall back to the single-hop pairedIndex for ids off
    // the primary spine, then the loop index. A self-reference ($('primary')) is
    // always just the current item.
    const refIdx =
      id === inputs.primary ? idx : inputs.lineage?.[id] ?? inputs.pairedIndex ?? idx;
    const cur = paired(its, refIdx);
    return cur === undefined ? undefined : selectVal(cur.json, path);
  }
  return undefined;
}

/** Apply a path selector to a value. `value` may be structured already (split-out
 * elements) or a raw string (ai/cmd text) which is parsed on demand. */
function selectVal(value: unknown, pathExpr?: string): string | undefined {
  if (!pathExpr) return stringify(value); // whole value — raw text stays raw
  const root = typeof value === "string" ? tryParse(value) : value;
  const path = pathExpr.replace(/^\./, ""); // ".a.b" → "a.b"; "[0]" stays "[0]"
  return stringify(walk(root, tokenize(path)));
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s; // not JSON → no fields to select (walk returns undefined → verbatim)
  }
}

type Accessor = { kind: "key"; key: string } | { kind: "index"; index: number | "*" };

// "items[2].text" → [key items, index 2, key text] ; "items[*].title" → [..., index *, key title]
function tokenize(path: string): Accessor[] {
  const out: Accessor[] = [];
  const re = /(\w+)|\[(\*|-?\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path)) !== null) {
    if (m[1] !== undefined) out.push({ kind: "key", key: m[1] });
    else out.push({ kind: "index", index: m[2] === "*" ? "*" : Number(m[2]) });
  }
  return out;
}

function walk(value: unknown, accessors: Accessor[]): unknown {
  if (accessors.length === 0) return value;
  if (value === null || value === undefined) return undefined;
  const [acc, ...rest] = accessors as [Accessor, ...Accessor[]];

  if (acc.kind === "key") {
    if (typeof value !== "object") return undefined;
    return walk((value as Record<string, unknown>)[acc.key], rest);
  }
  // index
  if (!Array.isArray(value)) return undefined;
  if (acc.index === "*") return value.map((el) => walk(el, rest)); // pluck a column
  const idx = acc.index < 0 ? value.length + acc.index : acc.index;
  return walk(value[idx], rest);
}

function stringify(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : JSON.stringify(value);
}
