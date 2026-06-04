// cmd `mode`: `once` (default, run a single time) vs `perItem` (run once per input
// item, piping the item value to stdin). Real shell, no model → OFFLINE.
//
// These cmd nodes declare no `inputs:`, so they're volatile (not persisted) — we
// assert on the CLI's item-count output (`✓ each (3 items)`) instead of reading .out.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";

const base =
  `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n` +
  `  src:   { type: cmd, run: 'cat arr.json', inputs: ['arr.json'] }\n` +
  `  split: { type: splitOut, from: src }\n`;

describe("cmd mode", () => {
  it("perItem runs the command once per input item (3 in → 3 out)", () => {
    const p = newProject()
      .write("arr.json", '["a","b","c"]')
      .write("flow.yaml", base + "  each: { type: cmd, run: 'cat', from: split, mode: perItem }\n");
    const { result, status } = p.run(["run", "flow.yaml"]);
    expect(status).toMatchObject({ split: "ran", each: "ran" });
    expect(result.out).toMatch(/each \(3 items\)/);
  });

  it("once (default) runs a single time regardless of input item count (3 in → 1 out)", () => {
    const p = newProject()
      .write("arr.json", '["a","b","c"]')
      .write("flow.yaml", base + "  one: { type: cmd, run: 'echo once', from: split }\n");
    const { result, status } = p.run(["run", "flow.yaml"]);
    expect(status).toMatchObject({ one: "ran" });
    expect(result.out).toMatch(/one \(1 item\)/);
  });
});
