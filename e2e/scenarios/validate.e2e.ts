// Pre-run validation rejects bad flows, and a cmd resolves its input file
// against the flow's directory (cwd) and caches on declared inputs.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import { broken, cmdInputs } from "../fixtures/flows.js";

describe("validate & cmd", () => {
  it("rejects a dangling from: before anything runs", () => {
    const p = newProject().write("flow.yaml", broken());
    const r = p.chain("validate", "flow.yaml");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/from: "ghost" does not exist/);
  });

  it("a cmd reads its input file (cwd) and is cacheable on a re-run", () => {
    const p = newProject().write("in.txt", "hello").write("flow.yaml", cmdInputs());
    p.chain("run", "flow.yaml"); // cold
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({
      load: "cached",
      sum: "cached",
    });
  });
});
