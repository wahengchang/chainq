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
import type { Flow, Item } from "./types.js";

const ENGINE_VERSION = 2; // 2: outputs are now Item[] (n8n items model), not raw strings

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
  input?: Record<string, unknown>[],
): Map<string, string> {
  const keys = new Map<string, string>();
  for (const id of topoOrder(flow)) {
    const node = flow.steps[id]!;
    const profileCmd =
      node.type === "ai" ? resolveProfile(flow, profileOverride ?? node.profile).cmd : null;
    const inputFileHashes = (node.inputs ?? []).map((p) => hashFile(join(baseDir, p)));
    // input node: the resolved params + run-time values ARE its content — fold
    // them in so changing --input invalidates the trigger and its downstream.
    const inputMaterial = node.type === "input" ? { params: node.params ?? null, input: input ?? null } : null;
    // NOT sorted: `from` order is significant — $json binds to the first
    // upstream (run.ts), so reordering changes behavior and MUST change the key.
    const upstreamKeys = upstreamsOf(node)
      .filter((u) => flow.steps[u])
      .map((u) => keys.get(u) ?? "");

    const material = canonicalize({
      v: ENGINE_VERSION,
      type: node.type,
      prompt: node.prompt ?? null,
      run: node.run ?? null,
      profileCmd,
      inputFileHashes,
      upstreamKeys,
      // cmd-mode / write-mode config: editing these must invalidate the node
      mode: node.mode ?? null,
      input: inputMaterial,
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

  load(id: string): Item[] {
    const entry = this.state[id];
    if (!entry) throw new Error(`no cached output for "${id}"`);
    const raw = readFileSync(join(this.outputsDir, entry.outputFile), "utf8");
    return JSON.parse(raw) as Item[];
  }

  /** Persist a successful run. Atomic: temp file + rename, never a half write.
   * Output items are stored as pretty JSON so .out files stay human-readable. */
  put(id: string, key: string, output: Item[]): void {
    const outputFile = `${id}.out`;
    atomicWrite(join(this.outputsDir, outputFile), JSON.stringify(output, null, 2));
    this.state[id] = { key, outputFile };
    atomicWrite(this.statePath, JSON.stringify(this.state, null, 2));
  }

  /** Move a node's cached state + output file from oldId to newId, so a rename
   * keeps its cache instead of forcing a recompute. Safe because the Merkle key
   * folds in content + upstream keys, NOT the id — the output stays valid. Best
   * effort: a missing entry / file just means the node recomputes next run. */
  rename(oldId: string, newId: string): void {
    const entry = this.state[oldId];
    if (!entry) return; // never ran → nothing cached to move
    const newFile = `${newId}.out`;
    try {
      const from = join(this.outputsDir, entry.outputFile);
      if (existsSync(from)) renameSync(from, join(this.outputsDir, newFile));
    } catch {
      /* best-effort: leave the recompute to happen on next run */
    }
    delete this.state[oldId];
    this.state[newId] = { key: entry.key, outputFile: newFile };
    atomicWrite(this.statePath, JSON.stringify(this.state, null, 2));
  }
}

function atomicWrite(path: string, data: string): void {
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}
