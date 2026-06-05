// Aggregate: many items → ONE item holding the array (fan-in). Collection operator,
// no model call → OFFLINE. Empty input still emits one item ([]), unlike the
// "empty → skip downstream" rule for per-item nodes.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import type { Item } from "../../src/engine/index.js";

// src (array) → split (items) → agg (back to one array item)
const flow = (aggLine: string) =>
  `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n` +
  `  src:   { type: cmd, run: 'cat arr.json', inputs: ['arr.json'] }\n` +
  `  split: { type: splitOut, from: src }\n${aggLine}`;

const items = (p: { read: (r: string) => string }, id: string): Item[] =>
  JSON.parse(p.read(`.chain/outputs/${id}.out`)) as Item[];

describe("aggregate", () => {
  it("collects items back into one array item", () => {
    const p = newProject()
      .write("arr.json", '["a","b","c"]')
      .write("flow.yaml", flow("  agg: { type: aggregate, from: split }\n"));
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ split: "ran", agg: "ran" });
    const out = items(p, "agg");
    expect(out).toHaveLength(1);
    expect(out[0]!.json).toEqual(["a", "b", "c"]);
  });

  it("empty input still emits one item holding []", () => {
    const p = newProject()
      .write("arr.json", "[]")
      .write("flow.yaml", flow("  agg: { type: aggregate, from: split }\n"));
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ agg: "ran" });
    const out = items(p, "agg");
    expect(out).toHaveLength(1);
    expect(out[0]!.json).toEqual([]);
  });
});
