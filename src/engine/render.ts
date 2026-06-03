// Minimal expression substitution for prompt templates (v1 — tier-1 only).
//
// Supported (the path selectors; statically the common case):
//   {{ $json }}            -> the primary upstream's whole output
//   {{ $json.field }}      -> parse primary upstream as JSON, take .field
//   {{ $node["id"] }}      -> another named upstream's whole output
//   {{ $node["id"].field } -> that upstream parsed as JSON, take .field
//
// The tier-2 read-only JS sandbox ({{ a + b }}) is deferred (security surface,
// eng review). Unknown expressions are left verbatim so they're visible, not
// silently blanked.

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
  // $json[.field]
  let m = /^\$json(?:\.([\w[\]*-]+))?$/.exec(expr);
  if (m) {
    if (!inputs.primary) return undefined;
    return pick(inputs.outputs[inputs.primary], m[1]);
  }
  // $node["id"][.field]
  m = /^\$node\[["']([^"']+)["']\](?:\.([\w[\]*-]+))?$/.exec(expr);
  if (m) {
    const id = m[1]!;
    if (!(id in inputs.outputs)) return undefined;
    return pick(inputs.outputs[id], m[2]);
  }
  return undefined;
}

function pick(raw: string | undefined, field?: string): string | undefined {
  if (raw === undefined) return undefined;
  if (!field) return raw;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const val = obj[field];
    return val === undefined ? undefined : typeof val === "string" ? val : JSON.stringify(val);
  } catch {
    return undefined; // not JSON — can't pick a field
  }
}
