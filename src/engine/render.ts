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
}

const EXPR = /\{\{\s*(.*?)\s*\}\}/g;

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
  const re = /\{\{\s*(.*?)\s*\}\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const expr = m[1]!.trim();
    if (/^\$json(?:[.[]|$)/.test(expr)) usesJson = true;
    const nm =
      /^\$node\[["']([^"']+)["']\]/.exec(expr) ?? /^\$\(\s*["']([^"']+)["']\s*\)/.exec(expr);
    if (nm) nodes.add(nm[1]!);
  }
  return { usesJson, nodes: [...nodes] };
}

/** The item paired to `index` (clamped to the upstream's last item). */
function paired(items: Item[] | undefined, index: number): Item | undefined {
  if (!items || items.length === 0) return undefined;
  return items[Math.min(index, items.length - 1)];
}

function resolveExpr(expr: string, inputs: RenderInputs): string | undefined {
  const idx = inputs.index ?? 0;

  // $json[.path | [i] | [*]] — the current primary item
  let m = /^\$json\b([.[].*)?$/.exec(expr);
  if (m) {
    if (!inputs.primary) return undefined;
    const cur = paired(inputs.items[inputs.primary], idx);
    return cur === undefined ? undefined : selectVal(cur.json, m[1]);
  }

  // $node["id"] / $('id'), optionally .all() or .item, then a path
  m =
    /^\$node\[["']([^"']+)["']\](.*)$/.exec(expr) ??
    /^\$\(\s*["']([^"']+)["']\s*\)(.*)$/.exec(expr);
  if (m) {
    const id = m[1]!;
    const rest = m[2] ?? "";
    const its = inputs.items[id];
    if (its === undefined) return undefined;
    const allM = /^\.all\(\)(.*)$/.exec(rest);
    if (allM) return selectVal(its.map((i) => i.json), allM[1]); // all items as an array
    const itemM = /^\.item\b(.*)$/.exec(rest);
    const path = itemM ? itemM[1] : rest;
    const cur = paired(its, idx);
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
