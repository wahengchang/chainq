// Cache correctness for the new collection-op config: editing a splitOut `field`
// or a merge `mode` MUST invalidate the node (it's folded into the Merkle key).
// Without that fold, chain would silently serve stale output. Offline (no model).

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";

const head = `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n`;

describe("items cache invalidation", () => {
  it("changing a splitOut `field` re-runs it; upstream stays cached", () => {
    const flow = (field: string) =>
      head +
      "  src: { type: cmd, run: 'cat arr.json', inputs: ['arr.json'] }\n" +
      `  split: { type: splitOut, from: src, field: ${field} }\n`;
    const p = newProject()
      .write("arr.json", '{"a":["x"],"b":["y","z"]}')
      .write("flow.yaml", flow("a"));

    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ src: "ran", split: "ran" }); // cold
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ src: "cached", split: "cached" }); // warm

    p.write("flow.yaml", flow("b")); // edit only the field
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ src: "cached", split: "ran" }); // ★ re-runs
  });

  it("changing a merge `mode` re-runs it", () => {
    const flow = (mode: string) =>
      head +
      "  a: { type: cmd, run: 'cat a.txt', inputs: ['a.txt'] }\n" +
      "  b: { type: cmd, run: 'cat b.txt', inputs: ['b.txt'] }\n" +
      `  m: { type: merge, from: [a, b], mode: ${mode} }\n`;
    const p = newProject()
      .write("a.txt", "apple")
      .write("b.txt", "banana")
      .write("flow.yaml", flow("append"));

    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ m: "ran" }); // cold
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ m: "cached" }); // warm
    p.write("flow.yaml", flow("byPosition")); // edit only the mode
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ m: "ran" }); // ★ re-runs
  });
});
