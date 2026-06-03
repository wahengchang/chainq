// END-TO-END verification matrix. Spawns the REAL `chain` CLI as a subprocess
// against REAL flow files in temp dirs — no mocks, no internal imports. Offline
// via the `cat` fake model. Fixture-driven: each scenario is data, one runner
// loops over them.
//
//   init-scaffold · init-refuse · cached-on-rerun · edit-downstream ·
//   edit-upstream · cmd-inputs · pin-scratch · multi-input-reorder · validate-fail

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "index.ts");
// repo root = up from src/cli; use the repo's own tsx binary by absolute path so
// it resolves even when cwd is a temp dir with no node_modules.
const TSX = join(dirname(CLI), "..", "..", "node_modules", ".bin", "tsx");

type Status = "ran" | "cached" | "failed" | "skipped";
type ChainFn = (...args: string[]) => { out: string; code: number };

// Run the chain CLI as a real process in `cwd`. Combine stdout+stderr (status
// prefixes go to stderr) and strip ANSI so the glyphs match cleanly.
function makeChain(cwd: string): ChainFn {
  return (...args) => {
    const r = spawnSync(TSX, [CLI, ...args], { cwd, encoding: "utf8" });
    const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "");
    return { out, code: r.status ?? 1 };
  };
}

// Parse "✓ load" / "⊘ load" / "✗ load" / "– load" lines into { id: status }.
const GLYPH: Record<string, Status> = { "✓": "ran", "⊘": "cached", "✗": "failed", "–": "skipped" };
function parseStatuses(out: string): Record<string, Status> {
  const map: Record<string, Status> = {};
  for (const line of out.split("\n")) {
    const m = /^([✓⊘✗–])\s+(\w+)/.exec(line.trim());
    if (m) map[m[2]!] = GLYPH[m[1]!]!;
  }
  return map;
}

// ---- flow fixtures (written into the temp dir by each scenario's setup) ----

const cat = `profiles:\n  default: { cmd: 'cat' }\n`;

/** a → b → c, all ai. `pc` "edits" the leaf, `pa` the root. */
function linear(dir: string, pa = "a", pc = "c"): void {
  writeFileSync(
    join(dir, "flow.yaml"),
    `${cat}steps:
  a: { type: ai, prompt: '${pa}' }
  b: { type: ai, from: a, prompt: '{{ $json }}' }
  c: { type: ai, from: b, prompt: '${pc}' }
`,
  );
}

interface Fixture {
  name: string;
  setup?: (dir: string, chain: ChainFn) => void; // prior runs / file writes
  args: string[]; // the run under test
  expect: {
    code?: number;
    status?: Record<string, Status>;
    outMatch?: RegExp;
    files?: string[]; // relative paths that must exist after
  };
}

const FIXTURES: Fixture[] = [
  {
    name: "init-scaffold: chain init → run offline → every node ran",
    setup: (_d, chain) => chain("init"),
    args: ["run", "flow.yaml", "--profile", "fake"],
    expect: {
      code: 0,
      status: { load: "ran", summarize: "ran" },
      files: ["flow.yaml", ".gitignore", "input.txt"],
    },
  },
  {
    name: "init-refuse: init over an existing flow.yaml → exit 1, no clobber",
    setup: (_d, chain) => chain("init"),
    args: ["init"],
    expect: { code: 1, outMatch: /refusing to overwrite/ },
  },
  {
    name: "cached-on-rerun: identical flow → everything cached",
    setup: (dir, chain) => {
      linear(dir);
      chain("run", "flow.yaml"); // cold
    },
    args: ["run", "flow.yaml"],
    expect: { status: { a: "cached", b: "cached", c: "cached" } },
  },
  {
    name: "edit-downstream: only the edited leaf re-runs",
    setup: (dir, chain) => {
      linear(dir, "a", "c1");
      chain("run", "flow.yaml");
      linear(dir, "a", "c2"); // edit leaf c
    },
    args: ["run", "flow.yaml"],
    expect: { status: { a: "cached", b: "cached", c: "ran" } },
  },
  {
    name: "edit-upstream: root edit cascades to all downstream (no stale)",
    setup: (dir, chain) => {
      linear(dir, "a1", "c");
      chain("run", "flow.yaml");
      linear(dir, "a2", "c"); // edit root a
    },
    args: ["run", "flow.yaml"],
    expect: { status: { a: "ran", b: "ran", c: "ran" } },
  },
  {
    name: "cmd-inputs: cmd reads input.txt (cwd + declared-input cacheable)",
    setup: (dir, chain) => {
      writeFileSync(join(dir, "in.txt"), "hello");
      writeFileSync(
        join(dir, "flow.yaml"),
        `${cat}steps:\n  load: { type: cmd, run: 'cat in.txt', inputs: ['in.txt'] }\n  sum: { type: ai, from: load, prompt: '{{ $json }}' }\n`,
      );
      chain("run", "flow.yaml"); // cold
    },
    args: ["run", "flow.yaml"],
    expect: { status: { load: "cached", sum: "cached" } },
  },
  {
    name: "pin-scratch: --pin runs into scratch, real outputs untouched",
    setup: (dir, chain) => {
      linear(dir);
      chain("run", "flow.yaml"); // populate real outputs
      writeFileSync(join(dir, "sample.txt"), "PINNED");
    },
    args: ["run", "flow.yaml", "--pin", "b=sample.txt"],
    expect: { outMatch: /scratch run/, files: [".chain/outputs/c.out", ".chain/scratch"] },
  },
  {
    name: "multi-input-reorder: reordering `from` invalidates the node (from-order)",
    setup: (dir, chain) => {
      const flow = (order: string) =>
        `${cat}steps:\n  A: { type: ai, prompt: 'AAA' }\n  B: { type: ai, prompt: 'BBB' }\n  M: { type: ai, from: ${order}, prompt: '{{ $json }}' }\n`;
      writeFileSync(join(dir, "flow.yaml"), flow("[A, B]"));
      chain("run", "flow.yaml"); // cold
      writeFileSync(join(dir, "flow.yaml"), flow("[B, A]")); // reorder → $json source changes
    },
    args: ["run", "flow.yaml"],
    expect: { status: { A: "cached", B: "cached", M: "ran" } },
  },
  {
    name: "validate-fail: a dangling from: is rejected before anything runs",
    setup: (dir) =>
      writeFileSync(
        join(dir, "flow.yaml"),
        `${cat}steps:\n  a: { type: ai, from: ghost, prompt: 'x' }\n`,
      ),
    args: ["validate", "flow.yaml"],
    expect: { code: 1, outMatch: /from: "ghost" does not exist/ },
  },
];

describe("chain — E2E workflow matrix", () => {
  for (const f of FIXTURES) {
    it(f.name, () => {
      const dir = mkdtempSync(join(tmpdir(), "chain-e2e-"));
      const chain = makeChain(dir);
      f.setup?.(dir, chain);
      const r = chain(...f.args);

      if (f.expect.code !== undefined) expect(r.code, r.out).toBe(f.expect.code);
      if (f.expect.status) {
        const got = parseStatuses(r.out);
        for (const [id, st] of Object.entries(f.expect.status)) {
          expect(got[id], `node ${id} in:\n${r.out}`).toBe(st);
        }
      }
      if (f.expect.outMatch) expect(r.out).toMatch(f.expect.outMatch);
      for (const fp of f.expect.files ?? []) {
        expect(existsSync(join(dir, fp)), `expected file ${fp}`).toBe(true);
      }
    });
  }
});
