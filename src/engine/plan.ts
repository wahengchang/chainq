// Execution PLANNING, separated from execution (the one genuinely good idea
// from n8n's partial-execution pipeline — see docs/design.md).
//
// `planRun` answers "if I run to <destination>, what actually runs vs reuses?"
// WITHOUT running anything. That powers:
//   - a UI preflight ("this will call 2 ai nodes") → quota awareness up front
//   - testing the decision in isolation (no subprocesses)
//
// It shares ONE decision function — `nodeDisposition` — with the executor
// (Runner.ensure), so a plan can never drift from what actually happens.
//
// We keep our Merkle invalidation: a node's disposition is read from cache
// VALIDITY (key match), not from a mutated/cleared runData flag. No cleanRunData.

import { ancestorsOf, topoOrder } from "./dag.js";
import type { CacheStore } from "./cache.js";
import type { Flow } from "./types.js";

export type Disposition = "pin" | "cache" | "run";

export interface PlanDeps {
  keys: Map<string, string>;
  volatile: Set<string>;
  store: CacheStore;
  pins?: Record<string, string>;
  fresh?: boolean;
}

/** The single decision both the planner and the executor use. Pin wins over cache. */
export function nodeDisposition(id: string, deps: PlanDeps): Disposition {
  if (deps.pins?.[id] !== undefined) return "pin";
  if (!deps.fresh && deps.store.isValid(id, deps.keys.get(id)!, deps.volatile.has(id))) {
    return "cache";
  }
  return "run";
}

export interface RunPlan {
  /** Nodes that will execute (model / command call). */
  toRun: string[];
  /** Nodes served from cache or a pin — no execution. */
  toReuse: string[];
  /** Nodes outside the target subgraph (not needed for the destination). */
  toSkip: string[];
  /** ai nodes that will actually run = the quota-relevant number for a preflight. */
  aiCallCount: number;
}

/**
 * Plan a run. `destination` = run to that node (+ its upstream cone); null = full chain.
 * Pure prediction: it does NOT model runtime failures (fast-fail) — that only
 * happens once nodes actually run.
 */
export function planRun(flow: Flow, destination: string | null, deps: PlanDeps): RunPlan {
  const target = destination
    ? new Set<string>([destination, ...ancestorsOf(flow, destination)])
    : new Set<string>(topoOrder(flow));

  const toRun: string[] = [];
  const toReuse: string[] = [];
  const toSkip: string[] = [];
  for (const id of topoOrder(flow)) {
    if (!target.has(id)) {
      toSkip.push(id);
      continue;
    }
    if (nodeDisposition(id, deps) === "run") toRun.push(id);
    else toReuse.push(id);
  }
  const aiCallCount = toRun.filter((id) => flow.steps[id]!.type === "ai").length;
  return { toRun, toReuse, toSkip, aiCallCount };
}
