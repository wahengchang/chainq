// The plan/execute split: planRun predicts run-vs-reuse without executing.
// These assert the prediction matches the cache state — the basis for the
// UI preflight ("this will call N ai nodes").

import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Runner } from "./run.js";
import type { Flow } from "./types.js";

const dir = () => mkdtempSync(join(tmpdir(), "chain-plan-"));
const cat = { default: { cmd: "cat" } };

// a → b → c, all ai. `pc` lets us "edit" the leaf.
function chain(pc = "c"): Flow {
  return {
    profiles: cat,
    steps: {
      a: { id: "a", type: "ai", prompt: "a" },
      b: { id: "b", type: "ai", from: "a", prompt: "{{ $json }}" },
      c: { id: "c", type: "ai", from: "b", prompt: pc },
    },
  };
}

describe("planRun (preflight)", () => {
  it("cold: everything runs, ai call count = all ai nodes", () => {
    const p = new Runner(chain(), { chainDir: dir() }).plan(null);
    expect(p.toRun).toEqual(["a", "b", "c"]);
    expect(p.toReuse).toEqual([]);
    expect(p.aiCallCount).toBe(3);
  });

  it("after a full run, the next plan reuses everything (0 ai calls)", async () => {
    const d = dir();
    await new Runner(chain(), { chainDir: d }).runChain();
    const p = new Runner(chain(), { chainDir: d }).plan(null);
    expect(p.toReuse.sort()).toEqual(["a", "b", "c"]);
    expect(p.aiCallCount).toBe(0);
  });

  it("editing the leaf plans only it to run; upstream reused", async () => {
    const d = dir();
    await new Runner(chain("v1"), { chainDir: d }).runChain();
    const p = new Runner(chain("v2"), { chainDir: d }).plan(null);
    expect(p.toRun).toEqual(["c"]);
    expect(p.toReuse.sort()).toEqual(["a", "b"]);
    expect(p.aiCallCount).toBe(1);
  });

  it("a destination skips nodes outside its upstream cone", () => {
    const p = new Runner(chain(), { chainDir: dir() }).plan("b");
    expect(p.toSkip).toEqual(["c"]); // c is downstream of b → not needed
    expect(p.toRun.sort()).toEqual(["a", "b"]);
  });

  it("a pinned node is reuse, not an ai call", () => {
    const p = new Runner(chain(), { chainDir: dir(), pins: { a: "X" } }).plan(null);
    expect(p.toReuse).toContain("a");
    expect(p.aiCallCount).toBe(2); // b, c run; a is pinned
  });

  it("the plan matches what actually runs (no drift)", async () => {
    const d = dir();
    await new Runner(chain("v1"), { chainDir: d }).runChain();
    // edit leaf → plan says only c runs; execution should agree
    const runner = new Runner(chain("v2"), { chainDir: d });
    const predicted = runner.plan(null);
    const actual = await runner.runChain();
    const ranForReal = actual.filter((r) => r.status === "ran").map((r) => r.id);
    expect(ranForReal).toEqual(predicted.toRun);
  });
});
