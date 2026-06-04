// Split Out: one item containing an array → many items (fan-out). A collection
// operator — no model call, so this runs fully OFFLINE. The array is fed by a
// cacheable cmd node (`cat arr.json`) so its output persists and we can read it.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import type { Item } from "../../src/engine/index.js";

const flow = (steps: string) =>
  `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n  src: { type: cmd, run: 'cat arr.json', inputs: ['arr.json'] }\n${steps}`;

const items = (p: { read: (r: string) => string }, id: string): Item[] =>
  JSON.parse(p.read(`.chain/outputs/${id}.out`)) as Item[];

describe("splitOut", () => {
  it("splits an array item into one item per element", () => {
    const p = newProject()
      .write("arr.json", '["a","b","c"]')
      .write("flow.yaml", flow("  split: { type: splitOut, from: src }\n"));
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ src: "ran", split: "ran" });
    expect(items(p, "split").map((i) => i.json)).toEqual(["a", "b", "c"]);
  });

  it("splits a named field (object → its array field)", () => {
    const p = newProject()
      .write("arr.json", '{"items":["x","y"]}')
      .write("flow.yaml", flow("  split: { type: splitOut, from: src, field: items }\n"));
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ split: "ran" });
    expect(items(p, "split").map((i) => i.json)).toEqual(["x", "y"]);
  });

  it("an empty array yields zero items (not an error)", () => {
    const p = newProject()
      .write("arr.json", "[]")
      .write("flow.yaml", flow("  split: { type: splitOut, from: src }\n"));
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ split: "ran" });
    expect(items(p, "split")).toEqual([]);
  });

  it("a non-array value fails the node with a clear error", () => {
    const p = newProject()
      .write("arr.json", '{"x":1}')
      .write("flow.yaml", flow("  split: { type: splitOut, from: src }\n"));
    const r = p.chain("run", "flow.yaml");
    expect(r.out).toMatch(/not an array/);
  });
});
