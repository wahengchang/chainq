#!/usr/bin/env -S npx tsx
// Minimal CLI surface (T9, partial): `chain run` and `chain validate`.
// The UI and CLI share the SAME engine (src/engine) — this is a thin wrapper.
//
//   chain run <flow.yaml>       run the whole chain (reuse cache)
//   chain run <flow.yaml> --fresh   ignore cache, re-run everything
//   chain validate <flow.yaml>  static pre-run checks only

import { readFileSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { parseFlow, validate, Runner, type NodeResult } from "../engine/index.js";

const PREFIX: Record<NodeResult["status"], string> = {
  ran: "\x1b[32m✓\x1b[0m", // green
  cached: "\x1b[90m⊘\x1b[0m", // grey
  failed: "\x1b[31m✗\x1b[0m", // red
  skipped: "\x1b[90m–\x1b[0m",
};

async function main(argv: string[]): Promise<number> {
  const [cmd, file, ...rest] = argv;
  if (!cmd || !file || !["run", "validate"].includes(cmd)) {
    console.error("usage: chain <run|validate> <flow.yaml> [--fresh]");
    return 2;
  }

  const flowPath = resolve(file);
  const flow = parseFlow(readFileSync(flowPath, "utf8"));

  // Honest reporting starts with the cwd resolution (E1): print where we are.
  const baseDir = dirname(flowPath);
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
  const fresh = rest.includes("--fresh");
  let failed = false;

  const runner = new Runner(flow, {
    chainDir,
    baseDir,
    fresh,
    onResult: (r) => {
      const tail = r.status === "failed" ? `  ${r.authExpired ? "[login expired] " : ""}${r.error}` : "";
      console.error(`${PREFIX[r.status]} ${r.id}${tail}`);
      if (r.status === "failed") failed = true;
    },
  });

  await runner.runChain();
  return failed ? 1 : 0;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
