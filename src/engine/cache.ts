// Cache keys + validity — the highest-stakes correctness surface in the engine.
//
// THE INVARIANT: editing a node must invalidate that node AND all of its
// transitive downstream, while leaving unrelated branches cached. If this is
// wrong, chain silently serves stale output — worse than slow.
//
// We get it via a MERKLE key: each node's key folds in the keys of its direct
// upstreams. Change a node's content → its key changes → every downstream key
// changes (because each embeds it), transitively. Sibling branches are
// untouched.
//
//   key(N) = sha256( type + prompt|run + profileCmd + inputFileHashes
//                    + sorted( key(upstream) for each upstream ) )
//
// VOLATILE nodes (a cmd with no declared `inputs:`) are uncacheable: the engine
// can't see what they read, so it can't know when their output changed. They
// always re-run, and that volatility propagates downstream — anything fed by an
// uncacheable node is itself uncacheable. Declare `inputs:` on a cmd to make it
// (and its downstream) cacheable again.

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { canonicalize } from "./canonical.js";
import { resolveProfile } from "./profiles.js";
import { topoOrder, upstreamsOf } from "./dag.js";
import type { Flow } from "./types.js";

const ENGINE_VERSION = 1; // bump to bust all caches when key computation changes

function sha256(s: string | Uint8Array): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Which nodes are uncacheable (undeclared cmd, or fed by one). */
export function volatileSet(flow: Flow): Set<string> {
  const volatile = new Set<string>();
  for (const id of topoOrder(flow)) {
    const node = flow.steps[id]!;
    const selfVolatile = node.type === "cmd" && (!node.inputs || node.inputs.length === 0);
    const upstreamVolatile = upstreamsOf(node).some((u) => volatile.has(u));
    if (selfVolatile || upstreamVolatile) volatile.add(id);
  }
  return volatile;
}

/**
 * Merkle keys for every node, computed in topological order.
 * `profileOverride` (the CLI's --profile) folds into ai keys, so switching the
 * model invalidates the cache for those nodes (different model = different output).
 */
export function computeKeys(
  flow: Flow,
  baseDir: string,
  profileOverride?: string,
): Map<string, string> {
  const keys = new Map<string, string>();
  for (const id of topoOrder(flow)) {
    const node = flow.steps[id]!;
    const profileCmd =
      node.type === "ai" ? resolveProfile(flow, profileOverride ?? node.profile).cmd : null;
    const inputFileHashes = (node.inputs ?? []).map((p) => hashFile(join(baseDir, p)));
    const upstreamKeys = upstreamsOf(node)
      .filter((u) => flow.steps[u])
      .map((u) => keys.get(u) ?? "")
      .sort();

    const material = canonicalize({
      v: ENGINE_VERSION,
      type: node.type,
      prompt: node.prompt ?? null,
      run: node.run ?? null,
      profileCmd,
      inputFileHashes,
      upstreamKeys,
    });
    keys.set(id, sha256(material));
  }
  return keys;
}

function hashFile(path: string): string {
  try {
    return sha256(readFileSync(path));
  } catch {
    return "MISSING"; // file gone → key changes → node re-runs (safe)
  }
}

// ---- persisted state (.chain/state.json + .chain/outputs/<id>.out) ----

interface StateEntry {
  key: string;
  outputFile: string;
}
type State = Record<string, StateEntry>;

export interface CacheStoreOptions {
  /**
   * Scratch mode: a trial run (--pin) writes to .chain/scratch and a separate
   * state file, NEVER touching the real outputs/ or state.json. So試跑 can never
   * pollute your committed results (B1 in the design).
   */
  scratch?: boolean;
}

export class CacheStore {
  private statePath: string;
  private outputsDir: string;
  private state: State;

  constructor(private chainDir: string, opts: CacheStoreOptions = {}) {
    const sub = opts.scratch ? "scratch" : "outputs";
    this.statePath = join(chainDir, opts.scratch ? "scratch-state.json" : "state.json");
    this.outputsDir = join(chainDir, sub);
    mkdirSync(this.outputsDir, { recursive: true });
    this.state = existsSync(this.statePath)
      ? (JSON.parse(readFileSync(this.statePath, "utf8")) as State)
      : {};
  }

  /** A node is served from cache iff: not volatile, has a matching key, output exists. */
  isValid(id: string, key: string, volatile: boolean): boolean {
    if (volatile) return false;
    const entry = this.state[id];
    if (!entry || entry.key !== key) return false;
    return existsSync(join(this.outputsDir, entry.outputFile));
  }

  load(id: string): string {
    const entry = this.state[id];
    if (!entry) throw new Error(`no cached output for "${id}"`);
    return readFileSync(join(this.outputsDir, entry.outputFile), "utf8");
  }

  /** Persist a successful run. Atomic: temp file + rename, never a half write. */
  put(id: string, key: string, output: string): void {
    const outputFile = `${id}.out`;
    atomicWrite(join(this.outputsDir, outputFile), output);
    this.state[id] = { key, outputFile };
    atomicWrite(this.statePath, JSON.stringify(this.state, null, 2));
  }
}

function atomicWrite(path: string, data: string): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}
