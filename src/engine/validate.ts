// Pre-run static validation (E4). Catches mistakes BEFORE any model runs, so a
// typo never costs a real CLI call. Collects ALL errors in one pass (never
// fail-on-first), and suggests the nearest legal name on a typo.
//
// Shared by the CLI (chain validate / before run) and the UI (before save-back)
// — one validator, never two (eng review code-quality rule).

import { topoOrder, upstreamsOf } from "./dag.js";
import { promptRefs } from "./render.js";
import { staticParamErrors } from "./input.js";
import type { Flow } from "./types.js";

export interface ValidationError {
  node: string;
  message: string;
}

export function validate(flow: Flow): ValidationError[] {
  const errors: ValidationError[] = [];
  const ids = Object.keys(flow.steps);

  for (const id of ids) {
    const node = flow.steps[id]!;

    // from: must reference real nodes
    for (const up of upstreamsOf(node)) {
      if (!flow.steps[up]) {
        errors.push({ node: id, message: `from: "${up}" does not exist${suggest(up, ids)}` });
      }
    }

    // ai nodes must reference a real profile
    if (node.type === "ai") {
      const p = node.profile ?? "default";
      if (!flow.profiles[p]) {
        errors.push({
          node: id,
          message: `profile "${p}" not found${suggest(p, Object.keys(flow.profiles))}`,
        });
      }
    }

    // prompt references must be wired in `from:` — else they silently render
    // verbatim at run time (only declared upstreams are loaded). Catches the
    // {{ $node["X"] }} / {{ $('X') }} / {{ $json }} footgun before any model runs.
    if (node.prompt) {
      const refs = promptRefs(node.prompt);
      const ups = upstreamsOf(node);
      if (refs.usesJson && ups.length === 0) {
        errors.push({ node: id, message: `prompt uses {{ $json }} but the step has no from:` });
      }
      for (const ref of refs.nodes) {
        if (!ups.includes(ref)) {
          errors.push({
            node: id,
            message: `prompt references $node["${ref}"] but it is not in from:${suggest(ref, ups)}`,
          });
        }
      }
    }

    // shape sanity
    if (node.type === "ai" && !node.prompt) {
      errors.push({ node: id, message: `ai step has no prompt` });
    }
    if (node.type === "cmd" && !node.run) {
      errors.push({ node: id, message: `cmd step has no run` });
    }
    // collection operators: input arity
    const ups = upstreamsOf(node);
    if (node.type === "merge") {
      if (ups.length !== 2) {
        errors.push({ node: id, message: `merge needs exactly 2 inputs (from: [a, b]), got ${ups.length}` });
      }
      if (node.mode === "byKey" && !node.key) {
        errors.push({ node: id, message: `merge mode byKey needs a 'key' field` });
      }
    }
    if ((node.type === "splitOut" || node.type === "aggregate") && ups.length !== 1) {
      errors.push({ node: id, message: `${node.type} needs exactly 1 input, got ${ups.length}` });
    }
    if (node.type === "input") {
      if (ups.length > 0) {
        errors.push({ node: id, message: `input is a trigger — it must not have a 'from' (got ${ups.length})` });
      }
      // static param contract: type literal legal + default coercible to type
      for (const [name, spec] of Object.entries(node.params ?? {})) {
        errors.push(...staticParamErrors(id, name, spec));
      }
    }
  }

  // cycle detection (topoOrder throws on a cycle)
  try {
    topoOrder(flow);
  } catch (err) {
    errors.push({ node: "(flow)", message: err instanceof Error ? err.message : String(err) });
  }

  return errors;
}

function suggest(bad: string, candidates: string[]): string {
  let best: string | undefined;
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = editDistance(bad, c);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best && bestDist <= 2 ? ` — did you mean "${best}"?` : "";
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[a.length]![b.length]!;
}
