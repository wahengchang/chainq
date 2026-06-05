// Execution primitives. ONE layered runner — the CLI and the UI are both
// callers (eng review D1), so there is exactly one place that runs a node.
//
//   runNode(N)          lowest unit: resolve inputs, run, persist
//   materializeUpstream walk N's transitive deps; reuse cache, run the stale
//   runToNode(N)        materialize upstream → run N           (n8n "run to here")
//   rerunNode(N)        force-run N on materialized upstream   (n8n "re-run node")
//   runChain()          run every node in topo order           (publish / chain run)

import { ancestorsOf, descendantsOf, topoOrder, upstreamsOf } from "./dag.js";
import { CacheStore, computeKeys, volatileSet } from "./cache.js";
import { cmdToArgv, resolveProfile } from "./profiles.js";
import { renderPrompt } from "./render.js";
import { runSubprocess } from "./proc.js";
import { nodeDisposition, planRun, type PlanDeps, type RunPlan } from "./plan.js";
import type { Flow, NodeResult, Item, MergeMode } from "./types.js";
import { textItem } from "./types.js";

export interface RunOptions {
  /** .chain directory (next to the flow file). */
  chainDir: string;
  /** Directory the flow's relative paths (cmd inputs) resolve against. */
  baseDir?: string;
  /** Pinned sample outputs: id -> fixed output. Treated as fact inputs. */
  pins?: Record<string, string>;
  /** Ignore all cached outputs and re-run everything. */
  fresh?: boolean;
  /** Trial run: read/write .chain/scratch only, never the real outputs (B1). */
  scratch?: boolean;
  /** Override every ai node's profile (CLI --profile). Folds into cache keys. */
  profileOverride?: string;
  /** Run-time input parameter sets (CLI --input / --input-file). One set → one
   * seed item from each `input` node; many sets → a batch (one item each). Folds
   * into the input node's cache key. */
  input?: Record<string, unknown>[];
  /** Per-node timeout. */
  timeoutMs?: number;
  /** Called as each node settles — lets the UI stream ran/cached/failed live. */
  onResult?: (r: NodeResult) => void;
}

/**
 * Per-operation scratch state. Created fresh for EACH run* call, never stored on
 * the Runner — so a Runner can be reused across many UI actions (run-to-here,
 * re-run, edit) without one operation's memo/blocked leaking into the next.
 */
interface RunCtx {
  /** in-operation output cache (successes), so a node runs at most once per op */
  memo: Map<string, Item[]>;
  /** nodes that failed or were skipped this op → halt their downstream (E2) */
  blocked: Set<string>;
}

const newCtx = (): RunCtx => ({ memo: new Map(), blocked: new Set() });

export class Runner {
  private keys: Map<string, string>;
  private volatile: Set<string>;
  private store: CacheStore;
  private baseDir: string; // where the flow's relative paths resolve

  constructor(private flow: Flow, private opts: RunOptions) {
    this.baseDir = opts.baseDir ?? opts.chainDir;
    this.keys = computeKeys(flow, this.baseDir, opts.profileOverride, opts.input);
    this.volatile = volatileSet(flow);
    this.store = new CacheStore(opts.chainDir, { scratch: opts.scratch });
  }

  private deps(): PlanDeps {
    return {
      keys: this.keys,
      volatile: this.volatile,
      store: this.store,
      pins: this.opts.pins,
      fresh: this.opts.fresh,
    };
  }

  /**
   * Predict what a run would do WITHOUT running it. `destination` = run-to-here
   * (null = full chain). Use it for a UI preflight ("will call N ai nodes").
   */
  plan(destination: string | null = null): RunPlan {
    return planRun(this.flow, destination, this.deps());
  }

  /** Run every node, in topological order. (发布模式 / `chain run`) */
  async runChain(): Promise<NodeResult[]> {
    const ctx = newCtx();
    const results: NodeResult[] = [];
    for (const id of topoOrder(this.flow)) {
      results.push(await this.ensure(id, false, ctx));
    }
    return results;
  }

  /** Run upstream of N (reusing cache), then N. (n8n 运行到当前节点) */
  async runToNode(id: string): Promise<NodeResult[]> {
    const ctx = newCtx();
    const cone = topoOrder(this.flow).filter(
      (n) => n === id || ancestorsOf(this.flow, id).has(n),
    );
    const results: NodeResult[] = [];
    for (const n of cone) results.push(await this.ensure(n, false, ctx));
    return results;
  }

  /** Force-run just N, materializing its upstream first. (n8n 重跑任一节点) */
  async rerunNode(id: string): Promise<NodeResult> {
    const ctx = newCtx();
    await this.materializeUpstream(id, ctx);
    return this.ensure(id, true, ctx);
  }

  /** Force-rerun N and everything downstream of it, reusing upstream cache. (--from) */
  async runFrom(id: string): Promise<NodeResult[]> {
    const ctx = newCtx();
    await this.materializeUpstream(id, ctx);
    const forced = new Set<string>([id, ...descendantsOf(this.flow, id)]);
    const results: NodeResult[] = [];
    for (const n of topoOrder(this.flow)) {
      if (forced.has(n)) results.push(await this.ensure(n, true, ctx));
    }
    return results;
  }

  /** Run the first N nodes in topological order. (--steps) */
  async runSteps(n: number): Promise<NodeResult[]> {
    const ctx = newCtx();
    const results: NodeResult[] = [];
    for (const id of topoOrder(this.flow).slice(0, n)) {
      results.push(await this.ensure(id, false, ctx));
    }
    return results;
  }

  /** Ensure every transitive upstream of N has an output available (shared ctx). */
  private async materializeUpstream(id: string, ctx: RunCtx): Promise<void> {
    const cone = topoOrder(this.flow).filter((n) => ancestorsOf(this.flow, id).has(n));
    for (const n of cone) await this.ensure(n, false, ctx);
  }

  // Run a node if needed (or forced); otherwise serve cache. Memoized per OPERATION.
  private async ensure(id: string, force: boolean, ctx: RunCtx): Promise<NodeResult> {
    if (ctx.memo.has(id)) {
      return { id, status: "cached", output: ctx.memo.get(id)! };
    }

    // A pinned node is a fixed fact input — never runs, never charges quota.
    const pin = this.opts.pins?.[id];
    if (pin !== undefined) {
      const items = [textItem(pin)]; // a pinned sample is one fixed item
      ctx.memo.set(id, items);
      const r: NodeResult = { id, status: "cached", output: items };
      this.opts.onResult?.(r);
      return r;
    }

    // Fast-fail (E2): if any upstream failed or was skipped, don't run this node
    // (it has no valid input) — and don't read a non-existent upstream output.
    const node = this.flow.steps[id]!;
    const failedUp = upstreamsOf(node)
      .filter((u) => this.flow.steps[u])
      .find((u) => ctx.blocked.has(u));
    if (failedUp) {
      ctx.blocked.add(id);
      const r: NodeResult = {
        id,
        status: "skipped",
        output: [],
        error: `upstream "${failedUp}" did not complete`,
      };
      this.opts.onResult?.(r);
      return r;
    }

    // Same decision the planner uses (DRY: plan can never drift from execution).
    const key = this.keys.get(id)!;
    const valid = !force && nodeDisposition(id, this.deps()) === "cache";
    if (valid) {
      const output = this.store.load(id);
      ctx.memo.set(id, output);
      const r: NodeResult = { id, status: "cached", output };
      this.opts.onResult?.(r);
      return r;
    }

    const r = await this.runNode(id, key, ctx);
    if (r.status === "failed") ctx.blocked.add(id); // halt downstream (E2)
    this.opts.onResult?.(r);
    return r;
  }

  // Lowest primitive: resolve input items, run, persist on success.
  // n8n items model: a node runs ONCE PER primary input item. The other upstreams
  // are paired by index (clamped) and rendered into the template as $json/$('id').
  // cmd runs once (mode: once — the v1 default). Empty primary items → empty output.
  private async runNode(id: string, key: string, ctx: RunCtx): Promise<NodeResult> {
    const node = this.flow.steps[id]!;
    const ups = upstreamsOf(node).filter((u) => this.flow.steps[u]);
    const itemsOf = (u: string): Item[] => ctx.memo.get(u) ?? this.store.load(u);

    const primary = ups[0];
    try {
      let output: Item[];

      if (node.type === "input") {
        // trigger: emit the flow's seed item(s) from declared params + run-time
        // values. No upstream. One supplied set → one item; many → a batch.
        const defaults: Record<string, unknown> = {};
        for (const [name, spec] of Object.entries(node.params ?? {})) {
          if (spec && spec.default !== undefined) defaults[name] = spec.default;
        }
        const sets = this.opts.input && this.opts.input.length ? this.opts.input : [{}];
        output = sets.map((set, i) => ({ json: { ...defaults, ...set }, pairedItem: i }));
      } else if (node.type === "splitOut") {
        // collection op: each input item's array field → one output item per element
        output = [];
        (primary ? itemsOf(primary) : []).forEach((it, i) => {
          const base = coerceJson(it.json);
          const arr = node.field ? (base as Record<string, unknown>)?.[node.field] : base;
          if (!Array.isArray(arr)) {
            throw new Error(
              `splitOut: item ${i} ${node.field ? `field "${node.field}"` : "value"} is not an array`,
            );
          }
          for (const el of arr) output.push({ json: el, pairedItem: i });
        });
      } else if (node.type === "aggregate") {
        // collection op: all input items → ONE item holding the array (empty → [])
        const values = (primary ? itemsOf(primary) : []).map((it) =>
          node.field ? (coerceJson(it.json) as Record<string, unknown>)?.[node.field] : it.json,
        );
        output = [{ json: values }];
      } else if (node.type === "merge") {
        // collection op: combine two input streams (n8n Merge)
        const a = ups[0] ? itemsOf(ups[0]) : [];
        const b = ups[1] ? itemsOf(ups[1]) : [];
        output = mergeItems(a, b, (node.mode as MergeMode) ?? "append", node.key);
      } else if (node.type === "cmd") {
        if (node.mode === "perItem") {
          // run the command once per input item, piping the item value to stdin
          output = [];
          const items = primary ? itemsOf(primary) : [];
          for (let i = 0; i < items.length; i++) {
            const res = await runSubprocess(cmdToArgv(node.run ?? ""), itemValue(items[i]!), {
              timeoutMs: this.opts.timeoutMs,
              cwd: this.baseDir,
            });
            if (res.timedOut) return this.fail(id, "timed out");
            if (res.code !== 0) return this.fail(id, res.stderr || `exit ${res.code}`);
            output.push(textItem(res.stdout, i));
          }
        } else {
          // mode: once (default) — run a single time, no stdin
          const res = await runSubprocess(cmdToArgv(node.run ?? ""), "", {
            timeoutMs: this.opts.timeoutMs,
            cwd: this.baseDir,
          });
          if (res.timedOut) return this.fail(id, "timed out");
          if (res.code !== 0) return this.fail(id, res.stderr || `exit ${res.code}`);
          output = [textItem(res.stdout)];
        }
      } else {
        const runCount = primary ? itemsOf(primary).length : 1; // root runs once
        output = [];
        // pass every upstream's full items; render pairs by index / supports .all()
        const itemsByUp: Record<string, Item[]> = {};
        for (const u of ups) itemsByUp[u] = itemsOf(u);
        const primaryItems = primary ? itemsByUp[primary]! : [];
        for (let i = 0; i < runCount; i++) {
          // cross-refs to other upstreams pair via this item's lineage, not loop index
          const pairedIndex = primaryItems[i]?.pairedItem ?? i;
          const rendered = renderPrompt(node.prompt ?? "", { items: itemsByUp, primary, index: i, pairedIndex });
          if (node.type === "assemble") {
            output.push(textItem(rendered, i)); // pure data assembly, no external call
          } else {
            const profile = resolveProfile(this.flow, this.opts.profileOverride ?? node.profile);
            const res = await runSubprocess(cmdToArgv(profile.cmd), rendered, {
              timeoutMs: this.opts.timeoutMs,
              cwd: this.baseDir,
            });
            if (res.timedOut) return this.fail(id, "timed out");
            if (res.code !== 0) {
              return this.fail(id, res.stderr || `exit ${res.code}`, isAuthError(res.stderr));
            }
            output.push(textItem(res.stdout, i));
          }
        }
      }

      // Persist ONLY on success — a failed/partial run never becomes valid cache.
      if (!this.volatile.has(id)) this.store.put(id, key, output);
      ctx.memo.set(id, output);
      return { id, status: "ran", output };
    } catch (err) {
      // e.g. ENOENT (command not found) — surfaced verbatim.
      return this.fail(id, err instanceof Error ? err.message : String(err));
    }
  }

  private fail(id: string, error: string, authExpired = false): NodeResult {
    return { id, status: "failed", output: [], error, authExpired };
  }
}

function isAuthError(stderr: string): boolean {
  return /\b(auth|login|unauthorized|forbidden|expired|not\s+logged\s*in)\b/i.test(stderr);
}

/** An item's value as a string for {{ }} rendering — raw text stays raw, structured
 * values are JSON-stringified (so the existing path selectors can re-parse them). */
function itemValue(item: Item): string {
  return typeof item.json === "string" ? item.json : JSON.stringify(item.json);
}

/** Coerce an item value to structured JSON: a string is parsed (so a cmd node that
 * echoes `["a","b"]` becomes a real array); anything else is returned as-is. */
function coerceJson(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v; // not JSON — leave as the raw string (splitOut will then error clearly)
  }
}

/** Shallow-merge two item values into one object (scalars wrap as { value }). */
function mergeObjects(a: unknown, b: unknown): Record<string, unknown> {
  const obj = (v: unknown): Record<string, unknown> =>
    typeof v === "object" && v !== null ? (v as Record<string, unknown>) : { value: v };
  return { ...obj(coerceJson(a)), ...obj(coerceJson(b)) };
}

/** Merge two input streams (n8n Merge node): append | byPosition | byKey. */
function mergeItems(a: Item[], b: Item[], mode: MergeMode, key?: string): Item[] {
  if (mode === "append") return [...a, ...b];
  if (mode === "byPosition") {
    const out: Item[] = [];
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      out.push({ json: mergeObjects(a[i]!.json, b[i]!.json), pairedItem: i });
    }
    return out;
  }
  if (mode === "byKey") {
    if (!key) throw new Error("merge byKey requires a `key` field");
    const bByKey = new Map<unknown, unknown>();
    for (const it of b) bByKey.set((coerceJson(it.json) as Record<string, unknown>)?.[key], it.json);
    const out: Item[] = [];
    a.forEach((it, i) => {
      const av = coerceJson(it.json) as Record<string, unknown>;
      const match = bByKey.get(av?.[key]);
      if (match !== undefined) out.push({ json: mergeObjects(av, match), pairedItem: i });
    });
    return out;
  }
  throw new Error(`merge: unknown mode "${mode}"`);
}
