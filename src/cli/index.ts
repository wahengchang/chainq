#!/usr/bin/env -S npx tsx
// CLI surface (T9). The UI and CLI share the SAME engine (src/engine) — this is
// a thin wrapper, no engine logic lives here.
//
//   chain run <flow.yaml>            run the whole chain (reuse cache)
//           --fresh                  ignore cache, re-run everything
//           --from <node>            force re-run <node> + everything downstream
//           --to <node>             run up to <node> (reuse upstream cache)
//           --steps <n>             run the first N nodes
//           --pin <node>=<file>     pin a sample as <node>'s output; writes scratch
//           --profile <name>        override every ai node's profile
//   chain validate <flow.yaml>       static pre-run checks only
//   chain ls [dir]                   list flow YAMLs under dir (default cwd)

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  parseFlow,
  validate,
  Runner,
  FlowLock,
  type NodeResult,
} from "../engine/index.js";
import { runInit } from "./init.js";
import { runNew } from "./new.js";

const PREFIX: Record<NodeResult["status"], string> = {
  ran: "\x1b[32m✓\x1b[0m",
  cached: "\x1b[90m⊘\x1b[0m",
  failed: "\x1b[31m✗\x1b[0m",
  skipped: "\x1b[90m–\x1b[0m",
};

interface Flags {
  fresh: boolean;
  from?: string;
  to?: string;
  steps?: number;
  profile?: string;
  pins: Record<string, string>;
}

function parseFlags(rest: string[], baseDir: string): Flags {
  const flags: Flags = { fresh: false, pins: {} };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a === "--fresh") flags.fresh = true;
    else if (a === "--from") flags.from = rest[++i];
    else if (a === "--to") flags.to = rest[++i];
    else if (a === "--steps") flags.steps = Number(rest[++i]);
    else if (a === "--profile") flags.profile = rest[++i];
    else if (a === "--pin") {
      const spec = rest[++i] ?? "";
      const eq = spec.indexOf("=");
      if (eq < 0) throw new Error(`--pin expects <node>=<file>, got "${spec}"`);
      const node = spec.slice(0, eq);
      const file = spec.slice(eq + 1);
      flags.pins[node] = readFileSync(resolve(baseDir, file), "utf8");
    } else throw new Error(`unknown flag: ${a}`);
  }
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
      "usage: chain init [dir] | chain new <name> | chain <run|validate> <flow.yaml> [flags] | chain ls [dir]",
    );
    return 2;
  }

  const flowPath = resolve(file);
  const baseDir = dirname(flowPath);
  const flow = parseFlow(readFileSync(flowPath, "utf8"));
  const flags = parseFlags(args.slice(1), baseDir);

  console.error(`flow: ${flowPath}`);
  console.error(`cwd:  ${baseDir}`);

  const errors = validate(flow);
  if (errors.length > 0) {
    console.error(`\n${errors.length} validation error(s) — nothing ran:`);
    for (const e of errors) console.error(`  ✗ ${e.node}: ${e.message}`);
    return 1;
  }
  if (cmd === "validate") {
    console.error("\n✓ valid");
    return 0;
  }

  const chainDir = join(baseDir, ".chain");
  const usingPins = Object.keys(flags.pins).length > 0;
  let failed = false;

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
      onResult: (r) => {
        const tail =
          r.status === "failed"
            ? `  ${r.authExpired ? "[login expired] " : ""}${r.error}`
            : "";
        console.error(`${PREFIX[r.status]} ${r.id}${tail}`);
        if (r.status === "failed") failed = true;
      },
    });

    // Preflight: show what WILL run before burning any quota (n8n-style).
    if (!flags.from && flags.steps === undefined) {
      const p = runner.plan(flags.to ?? null);
      console.error(
        `plan: ${p.aiCallCount} ai call(s) · ${p.toReuse.length} reused · ${p.toSkip.length} skipped\n`,
      );
    }

    if (flags.from) await runner.runFrom(flags.from);
    else if (flags.to) await runner.runToNode(flags.to);
    else if (flags.steps !== undefined) await runner.runSteps(flags.steps);
    else await runner.runChain();

    if (usingPins) console.error("\n(scratch run — real outputs untouched)");
  } finally {
    lock.release();
  }

  return failed ? 1 : 0;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
