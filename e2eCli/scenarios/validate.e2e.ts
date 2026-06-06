// Pre-run validation rejects bad flows, and a cmd resolves its input file
// against the flow's directory (cwd) and caches on declared inputs.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import { mock } from "../fixtures/flows.js";
import { haveClaude } from "../harness/cli.js";

describe("validate & cmd", () => {
  it("rejects a dangling from: before anything runs", () => {
    const p = newProject().write("flow.yaml", mock("broken"));
    const r = p.chain("validate", "flow.yaml");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/from: "ghost" does not exist/);
  });

  it("rejects a prompt reference with no matching from: edge — no model runs", () => {
    const p = newProject().write("flow.yaml", mock("unwired-ref"));
    const v = p.chain("validate", "flow.yaml");
    expect(v.code).toBe(1);
    expect(v.out).toMatch(/references \$node\["B"\] but it is not in from/);

    const r = p.chain("run", "flow.yaml", "--cache");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/nothing ran/); // caught before any CLI call
    expect(p.exists(".chain/outputs/M.out")).toBe(false);
  });

  // runs an ai node (sum) → real model, gated.
  it.skipIf(!haveClaude)("a cmd reads its input file (cwd) and is cacheable on a re-run", () => {
    const p = newProject().write("in.txt", "hello").write("flow.yaml", mock("cmd-inputs"));
    p.chain("run", "flow.yaml", "--cache"); // cold
    expect(p.run(["run", "flow.yaml", "--cache"]).status).toMatchObject({
      load: "cached",
      sum: "cached",
    });
  });
});
