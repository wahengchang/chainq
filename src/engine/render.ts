// Tier-1 expression substitution for prompt templates (the statically-checkable
// path selectors from the design §4.2). The tier-2 read-only JS sandbox
// ({{ a + b }}) stays deferred (security surface, eng review).
//
//   {{ $json }}                whole primary-upstream output
//   {{ $json.title }}          a field
//   {{ $json.items[2].text }}  nested + array index
//   {{ $json.items[-1].text }} negative index (from the end)
//   {{ $json.items[*].title }} pluck a column → JSON array
//   {{ $node["id"] }}          another named upstream (whole / + path)
//   {{ $node["id"].x.y }}
//
// Unknown expressions are left verbatim so they're visible, not silently blanked.

export interface RenderInputs {
  /** id -> that upstream's output text */
  outputs: Record<string, string>;
  /** the primary upstream id (first in `from`), if any */
  primary?: string;
}

const EXPR = /\{\{\s*(.*?)\s*\}\}/g;

export function renderPrompt(template: string, inputs: RenderInputs): string {
  return template.replace(EXPR, (whole, expr: string) => {
    const resolved = resolveExpr(expr.trim(), inputs);
    return resolved ?? whole;
  });
}

function resolveExpr(expr: string, inputs: RenderInputs): string | undefined {
  // $json[.path]
  let m = /^\$json(?:\.(.+))?$/.exec(expr);
  if (m) {
    if (!inputs.primary) return undefined;
    return select(inputs.outputs[inputs.primary], m[1]);
  }
  // $node["id"][.path]
  m = /^\$node\[["']([^"']+)["']\](?:\.(.+))?$/.exec(expr);
  if (m) {
    const id = m[1]!;
    if (!(id in inputs.outputs)) return undefined;
    return select(inputs.outputs[id], m[2]);
  }
  return undefined;
}

/** Apply a dotted path (with [n] / [-1] / [*]) to an upstream's output text. */
function select(raw: string | undefined, path?: string): string | undefined {
  if (raw === undefined) return undefined;
  if (!path) return raw; // {{ $json }} — whole output, verbatim

  let root: unknown;
  try {
    root = JSON.parse(raw);
  } catch {
    return undefined; // not JSON → no fields to select
  }
  const value = walk(root, tokenize(path));
  return stringify(value);
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
