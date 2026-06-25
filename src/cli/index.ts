#!/usr/bin/env node
// CLI surface (T9). The UI and CLI share the SAME engine (src/engine) — this is
// a thin wrapper, no engine logic lives here.
//
//   chainq run <flow.yaml>            run the whole chain — RE-RUNS EVERYTHING by default
//           --cache                  reuse cached node outputs (skip unchanged)
//           --fresh                  ignore cache, re-run everything (now the default)
//           --from <node>            force re-run <node> + everything downstream
//           --to <node>             run up to <node> (reuse upstream cache)
//           --steps <n>             run the first N nodes
//           --pin <node>=<file>     pin a sample as <node>'s output; writes scratch
//           --profile <name>        override every ai node's profile
//           -q, --quiet              hide progress (stderr); still print the result (stdout)
//           -s, --silent             print nothing — progress AND result; exit code only
//   chainq validate <flow.yaml>       static pre-run checks only
//   chainq ls [dir]                   list flow YAMLs under dir (default cwd)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  parseFlow,
  validate,
  Runner,
  FlowLock,
  parseVal,
  validateRunInput,
  itemsText,
  upstreamsOf,
  type NodeResult,
  type Flow,
} from "../engine/index.js";
import { runInit } from "./init.js";
import { runNew } from "./new.js";
import { startWebServer } from "../web/server.js";

const PREFIX: Record<NodeResult["status"], string> = {
  ran: "\x1b[32m✓\x1b[0m",
  cached: "\x1b[90m⊘\x1b[0m",
  failed: "\x1b[31m✗\x1b[0m",
  skipped: "\x1b[90m–\x1b[0m",
};

// Print the chain's RESULT to stdout (process status goes to stderr) so that
// `chainq run flow.yaml | jq` pipes only the result. Prints every leaf node
// (no downstream — the chain's terminal outputs); a partial run (--to/--steps/
// --from) that never reaches a leaf falls back to the last node that ran.
// Reads from the in-memory NodeResult.output, NOT the cache file, so a VOLATILE
// `cmd` leaf prints fine too. Multiple leaves are each prefixed with their id.
function printLeafResults(flow: Flow, results: NodeResult[]): void {
  if (results.length === 0) return;
  const referenced = new Set<string>();
  for (const id of Object.keys(flow.steps)) {
    for (const up of upstreamsOf(flow.steps[id]!)) referenced.add(up);
  }
  const leafIds = new Set(Object.keys(flow.steps).filter((id) => !referenced.has(id)));
  let targets = results.filter((r) => leafIds.has(r.id));
  if (targets.length === 0) targets = [results[results.length - 1]!];
  const multi = targets.length > 1;
  for (const r of targets) {
    if (multi) console.log(`— ${r.id} —`);
    console.log(itemsText(r.output));
  }
}

interface Flags {
  fresh: boolean;
  cache: boolean; // opt BACK INTO cache reuse for a full run (default re-runs all)
  from?: string;
  to?: string;
  steps?: number;
  profile?: string;
  quiet: boolean; // hide progress (stderr); still print the leaf result (stdout)
  silent: boolean; // print nothing at all — progress AND result; exit code only
  pins: Record<string, string>;
  input?: Record<string, unknown>[];
}

/** A --input-file holds one object, a JSON array of objects, or JSONL (one per line).
 * Every set MUST be a plain object — a primitive/array would become a malformed
 * seed item (e.g. "abc" → {0:"a",1:"b"}), so we reject it loudly instead. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseInputFile(path: string): Record<string, unknown>[] {
  const txt = readFileSync(path, "utf8").trim();
  const sets: unknown[] = (() => {
    try {
      const parsed = JSON.parse(txt);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return txt
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => JSON.parse(l) as unknown);
    }
  })();
  for (const set of sets) {
    if (!isPlainObject(set)) {
      throw new Error(
        `--input-file: every input set must be a JSON object, got ${JSON.stringify(set)}`,
      );
    }
  }
  return sets as Record<string, unknown>[];
}

function parseFlags(rest: string[], baseDir: string): Flags {
  const flags: Flags = { fresh: false, cache: false, quiet: false, silent: false, pins: {} };
  const inputKv: Record<string, unknown> = {};
  let inputSets: Record<string, unknown>[] | undefined;
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--fresh") flags.fresh = true;
    else if (a === "--cache" || a === "--reuse") flags.cache = true;
    else if (a === "--quiet" || a === "-q") flags.quiet = true;
    else if (a === "--silent" || a === "-s") flags.silent = true;
    else if (a === "--from") flags.from = rest[++i];
    else if (a === "--to") flags.to = rest[++i];
    else if (a === "--steps") flags.steps = Number(rest[++i]);
    else if (a === "--profile") flags.profile = rest[++i];
    else if (a === "--input") {
      const spec = rest[++i] ?? "";
      const eq = spec.indexOf("=");
      if (eq < 0) throw new Error(`--input expects <name>=<value>, got "${spec}"`);
      inputKv[spec.slice(0, eq)] = parseVal(spec.slice(eq + 1));
    } else if (a === "--input-file") {
      inputSets = parseInputFile(resolve(baseDir, rest[++i] ?? ""));
    } else if (a === "--pin") {
      const spec = rest[++i] ?? "";
      const eq = spec.indexOf("=");
      if (eq < 0) throw new Error(`--pin expects <node>=<file>, got "${spec}"`);
      const node = spec.slice(0, eq);
      const file = spec.slice(eq + 1);
      flags.pins[node] = readFileSync(resolve(baseDir, file), "utf8");
    } else throw new Error(`unknown flag: ${a}`);
  }
  // --input k=v overrides each set from --input-file (or stands alone as one set)
  const hasKv = Object.keys(inputKv).length > 0;
  if (inputSets) flags.input = inputSets.map((set) => ({ ...set, ...inputKv }));
  else if (hasKv) flags.input = [inputKv];
  return flags;
}

function listFlows(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      if (name.startsWith(".") || name === "node_modules") continue;
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.ya?ml$/.test(name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

async function main(argv: string[]): Promise<number> {
  const [cmd, ...args] = argv;

  if (cmd === "init") {
    return runInit(args);
  }

  if (cmd === "new") {
    return runNew(args);
  }

  if (cmd === "ui") {
    const initialFlow = args[0] ? resolve(args[0]) : undefined;
    startWebServer({ cwd: process.cwd(), initialFlow });
    return new Promise<number>(() => {}); // never resolves — the server keeps running
  }

  if (cmd === "ls") {
    const dir = resolve(args[0] ?? ".");
    const flows = listFlows(dir);
    if (flows.length === 0) console.error(`no flows found under ${dir}`);
    for (const f of flows) console.log(f);
    return 0;
  }

  const file = args[0];
  if (!cmd || !file || !["run", "validate"].includes(cmd)) {
    console.error(
      "usage: chainq init [dir] | chainq new <name> | chainq ui [flow.yaml] | chainq <run|validate> <flow.yaml> [flags] | chainq ls [dir]",
    );
    return 2;
  }

  const flowPath = resolve(file);
  const baseDir = dirname(flowPath);
  const flow = parseFlow(readFileSync(flowPath, "utf8"));
  const flags = parseFlags(args.slice(1), baseDir);

  // A plain `chainq run` RE-RUNS EVERYTHING by default — the user asked for
  // "run it every time". The cache still backs the partial-run modes (--from /
  // --to / --steps / --pin reuse upstream), and `--cache` opts a full run back
  // into reuse for cheap re-runs. --fresh stays as an explicit no-op alias here.
  const partialMode =
    flags.from !== undefined ||
    flags.to !== undefined ||
    flags.steps !== undefined ||
    Object.keys(flags.pins).length > 0;
  if (cmd === "run" && !partialMode && !flags.cache) flags.fresh = true;

  // -q/--quiet hides progress (stderr) but keeps the result + errors; -s/--silent
  // hides everything (silent implies quiet). Result always goes to stdout.
  const hideProgress = flags.quiet || flags.silent;
  const printResult = !flags.silent;

  if (!hideProgress) {
    console.error(`flow: ${flowPath}`);
    console.error(`cwd:  ${baseDir}`);
  }

  const errors = validate(flow);
  if (errors.length > 0) {
    if (!flags.silent) {
      console.error(`\n${errors.length} validation error(s) — nothing ran:`);
      for (const e of errors) console.error(`  ✗ ${e.node}: ${e.message}`);
    }
    return 1;
  }
  if (cmd === "validate") {
    if (!hideProgress) console.error("\n✓ valid");
    return 0;
  }

  // runtime input contract (required / declared type) — same gate the web uses.
  const inputErrors = validateRunInput(flow, flags.input);
  if (inputErrors.length > 0) {
    if (!flags.silent) {
      console.error(`\n${inputErrors.length} input error(s) — nothing ran:`);
      for (const e of inputErrors) console.error(`  ✗ ${e.node}: ${e.message}`);
    }
    return 1;
  }

  const chainDir = join(baseDir, ".chain");
  const usingPins = Object.keys(flags.pins).length > 0;
  let failed = false;
  let results: NodeResult[] = [];

  const lock = new FlowLock(chainDir);
  lock.acquire();
  try {
    const runner = new Runner(flow, {
      chainDir,
      baseDir,
      fresh: flags.fresh,
      scratch: usingPins, // pinned trial runs are isolated to .chain/scratch
      profileOverride: flags.profile,
      pins: flags.pins,
      input: flags.input,
      onResult: (r) => {
        if (r.status === "failed") failed = true;
        if (flags.silent) return; // -s: not even failures
        // A failure is an error, not progress — show it even under -q/--quiet.
        if (r.status !== "failed" && hideProgress) return;
        const n = r.output.length;
        // show item count for ran/cached (items model) — makes fan-out visible
        const count =
          r.status === "ran" || r.status === "cached" ? ` (${n} item${n === 1 ? "" : "s"})` : "";
        const tail =
          r.status === "failed"
            ? `  ${r.authExpired ? "[login expired] " : ""}${r.error}`
            : "";
        console.error(`${PREFIX[r.status]} ${r.id}${count}${tail}`);
      },
    });

    // Preflight: show what WILL run before burning any quota (n8n-style).
    if (!hideProgress && !flags.from && flags.steps === undefined) {
      const p = runner.plan(flags.to ?? null);
      console.error(
        `plan: ${p.aiCallCount} ai call(s) · ${p.toReuse.length} reused · ${p.toSkip.length} skipped\n`,
      );
    }

    if (flags.from) results = await runner.runFrom(flags.from);
    else if (flags.to) results = await runner.runToNode(flags.to);
    else if (flags.steps !== undefined) results = await runner.runSteps(flags.steps);
    else results = await runner.runChain();

    if (!hideProgress && usingPins) console.error("\n(scratch run — real outputs untouched)");
  } finally {
    lock.release();
  }

  // Result → stdout (process status went to stderr), so `... | jq` is clean.
  if (printResult) printLeafResults(flow, results);

  return failed ? 1 : 0;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
