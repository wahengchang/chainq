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
import type { Flow, NodeResult } from "./types.js";

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
  /** Per-node timeout. */
  timeoutMs?: number;
  /** Called as each node settles — lets the UI stream ran/cached/failed live. */
  onResult?: (r: NodeResult) => void;
}

export class Runner {
  private keys: Map<string, string>;
  private volatile: Set<string>;
  private store: CacheStore;
  private memo = new Map<string, string>(); // in-run output cache (successes)
  private blocked = new Set<string>(); // failed this run, or downstream of a failure

  constructor(private flow: Flow, private opts: RunOptions) {
    const baseDir = opts.baseDir ?? opts.chainDir;
    this.keys = computeKeys(flow, baseDir, opts.profileOverride);
    this.volatile = volatileSet(flow);
    this.store = new CacheStore(opts.chainDir, { scratch: opts.scratch });
  }

  /** Run every node, in topological order. (发布模式 / `chain run`) */
  async runChain(): Promise<NodeResult[]> {
    const results: NodeResult[] = [];
    for (const id of topoOrder(this.flow)) {
      results.push(await this.ensure(id, false));
    }
    return results;
  }

  /** Run upstream of N (reusing cache), then N. (n8n 运行到当前节点) */
  async runToNode(id: string): Promise<NodeResult[]> {
    const cone = topoOrder(this.flow).filter(
      (n) => n === id || ancestorsOf(this.flow, id).has(n),
    );
    const results: NodeResult[] = [];
    for (const n of cone) results.push(await this.ensure(n, false));
    return results;
  }

  /** Force-run just N, materializing its upstream first. (n8n 重跑任一节点) */
  async rerunNode(id: string): Promise<NodeResult> {
    await this.materializeUpstream(id);
    return this.ensure(id, true);
  }

  /** Force-rerun N and everything downstream of it, reusing upstream cache. (--from) */
  async runFrom(id: string): Promise<NodeResult[]> {
    await this.materializeUpstream(id);
    const forced = new Set<string>([id, ...descendantsOf(this.flow, id)]);
    const results: NodeResult[] = [];
    for (const n of topoOrder(this.flow)) {
      if (forced.has(n)) results.push(await this.ensure(n, true));
    }
    return results;
  }

  /** Run the first N nodes in topological order. (--steps) */
  async runSteps(n: number): Promise<NodeResult[]> {
    const results: NodeResult[] = [];
    for (const id of topoOrder(this.flow).slice(0, n)) {
      results.push(await this.ensure(id, false));
    }
    return results;
  }

  /** Ensure every transitive upstream of N has an output available. */
  async materializeUpstream(id: string): Promise<void> {
    const cone = topoOrder(this.flow).filter((n) => ancestorsOf(this.flow, id).has(n));
    for (const n of cone) await this.ensure(n, false);
  }

  // Run a node if needed (or forced); otherwise serve cache. Memoized per run.
  private async ensure(id: string, force: boolean): Promise<NodeResult> {
    if (this.memo.has(id)) {
      return { id, status: "cached", output: this.memo.get(id)! };
    }

    // A pinned node is a fixed fact input — never runs, never charges quota.
    const pin = this.opts.pins?.[id];
    if (pin !== undefined) {
      this.memo.set(id, pin);
      const r: NodeResult = { id, status: "cached", output: pin };
      this.opts.onResult?.(r);
      return r;
    }

    // Fast-fail (E2): if any upstream failed or was skipped, don't run this node
    // (it has no valid input) — and don't read a non-existent upstream output.
    const node = this.flow.steps[id]!;
    const failedUp = upstreamsOf(node)
      .filter((u) => this.flow.steps[u])
      .find((u) => this.blocked.has(u));
    if (failedUp) {
      this.blocked.add(id);
      const r: NodeResult = {
        id,
        status: "skipped",
        output: "",
        error: `upstream "${failedUp}" did not complete`,
      };
      this.opts.onResult?.(r);
      return r;
    }

    const key = this.keys.get(id)!;
    const valid =
      !force && !this.opts.fresh && this.store.isValid(id, key, this.volatile.has(id));
    if (valid) {
      const output = this.store.load(id);
      this.memo.set(id, output);
      const r: NodeResult = { id, status: "cached", output };
      this.opts.onResult?.(r);
      return r;
    }

    const r = await this.runNode(id, key);
    if (r.status === "failed") this.blocked.add(id); // halt downstream (E2)
    this.opts.onResult?.(r);
    return r;
  }

  // Lowest primitive: resolve inputs, run, persist on success.
  private async runNode(id: string, key: string): Promise<NodeResult> {
    const node = this.flow.steps[id]!;
    const ups = upstreamsOf(node).filter((u) => this.flow.steps[u]);
    const outputs: Record<string, string> = {};
    for (const u of ups) outputs[u] = this.memo.get(u) ?? this.store.load(u);

    try {
      let output: string;
      if (node.type === "cmd") {
        const res = await runSubprocess(cmdToArgv(node.run ?? ""), "", {
          timeoutMs: this.opts.timeoutMs,
        });
        if (res.timedOut) return this.fail(id, "timed out");
        if (res.code !== 0) return this.fail(id, res.stderr || `exit ${res.code}`);
        output = res.stdout;
      } else {
        const rendered = renderPrompt(node.prompt ?? "", { outputs, primary: ups[0] });
        if (node.type === "assemble") {
          output = rendered; // pure data assembly, no external call
        } else {
          const profile = resolveProfile(this.flow, this.opts.profileOverride ?? node.profile);
          const res = await runSubprocess(cmdToArgv(profile.cmd), rendered, {
            timeoutMs: this.opts.timeoutMs,
          });
          if (res.timedOut) return this.fail(id, "timed out");
          if (res.code !== 0) {
            return this.fail(id, res.stderr || `exit ${res.code}`, isAuthError(res.stderr));
          }
          output = res.stdout;
        }
      }

      // Persist ONLY on success — a failed/partial run never becomes valid cache.
      if (!this.volatile.has(id)) this.store.put(id, key, output);
      this.memo.set(id, output);
      return { id, status: "ran", output };
    } catch (err) {
      // e.g. ENOENT (command not found) — surfaced verbatim.
      return this.fail(id, err instanceof Error ? err.message : String(err));
    }
  }

  private fail(id: string, error: string, authExpired = false): NodeResult {
    return { id, status: "failed", output: "", error, authExpired };
  }
}

function isAuthError(stderr: string): boolean {
  return /\b(auth|login|unauthorized|forbidden|expired|not\s+logged\s*in)\b/i.test(stderr);
}
