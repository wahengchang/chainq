// END-TO-END walkthrough of how `chain` actually works.
//
// This spawns the REAL CLI as a subprocess against a REAL flow file in a temp
// dir — no mocks, no internal imports. It uses the `cat` fake model so it runs
// offline. Read it top to bottom and you see the whole product loop:
//
//   1. cold run            every node runs        ✓ ✓ ✓
//   2. warm run            everything cached       ⊘ ⊘ ⊘   (no model called)
//   3. edit a downstream   only it re-runs         ⊘ ⊘ ✓
//   4. edit an upstream    it + downstream re-run   ⊘ ✓ ✓   (no stale output)
//   5. pin a sample        trial in scratch         real outputs untouched
//   6. break the flow      validate blocks it       nothing runs

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "index.ts");
// repo root = up from src/cli; use the repo's own tsx binary by absolute path so
// it resolves even when cwd is a temp flow dir with no node_modules.
const REPO_ROOT = join(dirname(CLI), "..", "..");
const TSX = join(REPO_ROOT, "node_modules", ".bin", "tsx");

// Run the chain CLI as a real process. Status prefixes go to stderr, `ls` to
// stdout — combine both so the test sees everything the user sees.
function chain(cwd: string, ...args: string[]): { out: string; code: number } {
  const r = spawnSync(TSX, [CLI, ...args], { cwd, encoding: "utf8" });
  // Strip ANSI color codes so the status prefixes (✓ ⊘ ✗) match cleanly.
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "");
  return { out, code: r.status ?? 1 };
}

// A 3-node flow: load (reads a file) → summarize (ai) → title (ai).
// `prefix`/`titleText` let us "edit" a prompt between runs.
function writeFlow(dir: string, summaryPrefix: string, titleText: string): void {
  writeFileSync(
    join(dir, "flow.yaml"),
    `profiles:
  default: { cmd: 'cat' }   # G2 fake model: echoes the rendered prompt
steps:
  load:
    type: cmd
    run: 'cat input.txt'
    inputs: ['input.txt']    # declared -> cacheable
  summarize:
    type: ai
    from: load
    prompt: '${summaryPrefix}: {{ $json }}'
  title:
    type: ai
    from: summarize
    prompt: '${titleText}'
`,
  );
}

describe("chain — end to end", () => {
  it("walks the full iteration loop", () => {
    const dir = mkdtempSync(join(tmpdir(), "chain-e2e-"));
    writeFileSync(join(dir, "input.txt"), "the quick brown fox");
    writeFlow(dir, "SUMMARY", "TITLE v1");

    // 1. COLD RUN — nothing cached yet, every node runs.
    let r = chain(dir, "run", "flow.yaml");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/✓ load/);
    expect(r.out).toMatch(/✓ summarize/);
    expect(r.out).toMatch(/✓ title/);
    // data really flowed: summarize embedded load's output
    expect(readFileSync(join(dir, ".chain/outputs/summarize.out"), "utf8")).toBe(
      "SUMMARY: the quick brown fox",
    );

    // 2. WARM RUN — identical flow, everything served from cache (no model call).
    r = chain(dir, "run", "flow.yaml");
    expect(r.out).toMatch(/⊘ load/);
    expect(r.out).toMatch(/⊘ summarize/);
    expect(r.out).toMatch(/⊘ title/);

    // 3. EDIT A DOWNSTREAM PROMPT — only `title` re-runs; upstream stays cached.
    writeFlow(dir, "SUMMARY", "TITLE v2");
    r = chain(dir, "run", "flow.yaml");
    expect(r.out).toMatch(/⊘ load/);
    expect(r.out).toMatch(/⊘ summarize/);
    expect(r.out).toMatch(/✓ title/);

    // 4. EDIT AN UPSTREAM PROMPT — summarize AND its downstream title re-run.
    //    This is the anti-stale guarantee: editing upstream never serves an old
    //    downstream from cache.
    writeFlow(dir, "DIGEST", "TITLE v2");
    r = chain(dir, "run", "flow.yaml");
    expect(r.out).toMatch(/⊘ load/); // load (cmd w/ declared input) unchanged
    expect(r.out).toMatch(/✓ summarize/);
    expect(r.out).toMatch(/✓ title/);

    // 5. PIN A SAMPLE — trial-run a downstream against a fixed upstream value.
    //    Writes ONLY to .chain/scratch; real outputs are untouched.
    const realTitle = readFileSync(join(dir, ".chain/outputs/title.out"), "utf8");
    writeFileSync(join(dir, "sample.txt"), "PINNED SUMMARY");
    r = chain(dir, "run", "flow.yaml", "--pin", "summarize=sample.txt");
    expect(r.out).toMatch(/scratch run/);
    expect(existsSync(join(dir, ".chain/scratch"))).toBe(true);
    // real output unchanged after the trial
    expect(readFileSync(join(dir, ".chain/outputs/title.out"), "utf8")).toBe(realTitle);

    // 6. BREAK THE FLOW — a dangling `from:` is caught before anything runs.
    writeFileSync(
      join(dir, "broken.yaml"),
      `profiles: { default: { cmd: 'cat' } }
steps:
  a: { type: ai, from: ghost, prompt: 'x' }
`,
    );
    r = chain(dir, "validate", "broken.yaml");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/from: "ghost" does not exist/);
  });
});
