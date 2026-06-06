// The headline "loop" scenario, end-to-end and OFFLINE: take a list, do something
// to EACH element, collect the results back. In the n8n items model this needs no
// loop construct — Split Out fans the array into items, a per-item node processes
// each, Aggregate folds them back. Item counts (printed by the CLI) prove the flow:
//   src(1) → split(3) → each(3, perItem) → agg(1 array)
// `each` is a volatile cmd (no declared inputs), so we assert on the CLI's
// item-count output rather than reading its .out.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";

describe("loop pipeline (splitOut → per-item → aggregate)", () => {
  it("processes each element of a list and collects the results", () => {
    const p = newProject()
      .write("arr.json", '["a","b","c"]')
      .write(
        "flow.yaml",
        `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n` +
          `  src:   { type: cmd, run: 'cat arr.json', inputs: ['arr.json'] }\n` +
          `  split: { type: splitOut, from: src }\n` +
          `  each:  { type: cmd, run: 'cat', from: split, mode: perItem }\n` +
          `  agg:   { type: aggregate, from: each }\n`,
      );
    const { result, status } = p.run(["run", "flow.yaml"]);
    expect(status).toMatchObject({ src: "ran", split: "ran", each: "ran", agg: "ran" });
    // the list fans out to 3, each is processed once, then folded back to 1
    expect(result.out).toMatch(/split \(3 items\)/);
    expect(result.out).toMatch(/each \(3 items\)/);
    expect(result.out).toMatch(/agg \(1 item\)/);
  });
});
