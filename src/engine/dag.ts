// Parse a flow YAML into a Flow, and derive the dependency DAG.
//
// `from:` is the dependency edge: a node lists the upstream(s) it reads. The
// engine executes in topological order; v1 runs strictly serially but the
// topo sort is real so parallelism can be added later without a rewrite.
//
//   fetch ──▶ summarize ──▶ tweets ──▶ report
//                                └────▶ title_each
//
// The DAG is also what makes cache invalidation correct: editing a node must
// invalidate its *transitive* downstream, which we walk via these edges.

import { parse as parseYaml } from "yaml";
import type { Flow, FlowNode, NodeType } from "./types.js";

const NODE_TYPES: readonly NodeType[] = ["ai", "cmd", "assemble"];

export function parseFlow(yamlText: string): Flow {
  const raw = parseYaml(yamlText) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") throw new Error("flow YAML is empty or not a mapping");

  const profilesRaw = (raw.profiles ?? {}) as Record<string, { cmd?: unknown }>;
  const profiles: Flow["profiles"] = {};
  for (const [name, spec] of Object.entries(profilesRaw)) {
    if (!spec || typeof spec.cmd !== "string") {
      throw new Error(`profile "${name}" must have a string "cmd"`);
    }
    profiles[name] = { cmd: spec.cmd };
  }

  const stepsRaw = (raw.steps ?? {}) as Record<string, Record<string, unknown>>;
  const steps: Flow["steps"] = {};
  for (const [id, spec] of Object.entries(stepsRaw)) {
    const type = spec.type as NodeType;
    if (!NODE_TYPES.includes(type)) {
      throw new Error(`step "${id}" has invalid type "${String(spec.type)}" (expected ai|cmd|assemble)`);
    }
    const node: FlowNode = { id, type };
    if (spec.from !== undefined) node.from = spec.from as string | string[];
    if (typeof spec.prompt === "string") node.prompt = spec.prompt;
    if (typeof spec.run === "string") node.run = spec.run;
    if (typeof spec.profile === "string") node.profile = spec.profile;
    if (Array.isArray(spec.inputs)) node.inputs = spec.inputs as string[];
    steps[id] = node;
  }

  return { profiles, steps };
}

/** Direct upstream ids of a node, normalized to a list. */
export function upstreamsOf(node: FlowNode): string[] {
  if (node.from === undefined) return [];
  return Array.isArray(node.from) ? node.from : [node.from];
}

/** Topological order of node ids (Kahn). Throws on a cycle. */
export function topoOrder(flow: Flow): string[] {
  const ids = Object.keys(flow.steps);
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const dependents = new Map<string, string[]>(ids.map((id) => [id, []]));

  for (const id of ids) {
    for (const up of upstreamsOf(flow.steps[id]!)) {
      if (!flow.steps[up]) continue; // dangling ref — validate() reports it
      indeg.set(id, (indeg.get(id) ?? 0) + 1);
      dependents.get(up)!.push(id);
    }
  }

  // Seed with YAML order preserved among ready nodes (deterministic output).
  const queue = ids.filter((id) => (indeg.get(id) ?? 0) === 0);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const dep of dependents.get(id)!) {
      const d = (indeg.get(dep) ?? 0) - 1;
      indeg.set(dep, d);
      if (d === 0) queue.push(dep);
    }
  }

  if (order.length !== ids.length) {
    const stuck = ids.filter((id) => !order.includes(id));
    throw new Error(`dependency cycle involving: ${stuck.join(", ")}`);
  }
  return order;
}

/** Does adding edge from→to create a cycle? Used to reject a canvas connect live. */
export function wouldCycle(flow: Flow, fromId: string, toId: string): boolean {
  // A cycle forms if `fromId` is already reachable from `toId`.
  const seen = new Set<string>();
  const stack = [toId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === fromId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const node = flow.steps[cur];
    if (node) stack.push(...upstreamsOf(node).filter((u) => flow.steps[u]));
  }
  return false;
}

/** All transitive descendants of `id` (everything that depends on it). */
export function descendantsOf(flow: Flow, id: string): Set<string> {
  // Build reverse edges once: upstream -> [dependents].
  const dependents = new Map<string, string[]>();
  for (const nid of Object.keys(flow.steps)) {
    for (const up of upstreamsOf(flow.steps[nid]!)) {
      if (!flow.steps[up]) continue;
      (dependents.get(up) ?? dependents.set(up, []).get(up)!).push(nid);
    }
  }
  const seen = new Set<string>();
  const stack = [...(dependents.get(id) ?? [])];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(dependents.get(cur) ?? []));
  }
  return seen;
}

/** All transitive ancestors of `id` (its upstream cone), plus nothing else. */
export function ancestorsOf(flow: Flow, id: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...upstreamsOf(flow.steps[id]!)];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (!flow.steps[cur] || seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...upstreamsOf(flow.steps[cur]!));
  }
  return seen;
}
