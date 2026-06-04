// The cache contract, end to end: reuse when unchanged, re-run exactly the
// transitive downstream of an edit, never serve stale.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import { linear } from "../fixtures/flows.js";
import { haveClaude } from "../harness/cli.js";

// These RUN ai nodes (no fake model) → real `claude -p`. Gated; skipped without it.
describe.skipIf(!haveClaude)("cache", () => {
  it("re-running an unchanged flow serves everything from cache", () => {
    const p = newProject().write("flow.yaml", linear());
    p.chain("run", "flow.yaml"); // cold
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({
      a: "cached",
      b: "cached",
      c: "cached",
    });
  });

  it("editing a downstream node re-runs only it; upstream stays cached", () => {
    const p = newProject().write("flow.yaml", linear("a", "c1"));
    p.chain("run", "flow.yaml");
    p.write("flow.yaml", linear("a", "c2")); // edit leaf
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({
      a: "cached",
      b: "cached",
      c: "ran",
    });
  });

  it("editing an upstream node cascades to all downstream (no stale serve)", () => {
    const p = newProject().write("flow.yaml", linear("a1", "c"));
    p.chain("run", "flow.yaml");
    p.write("flow.yaml", linear("a2", "c")); // edit root
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({
      a: "ran",
      b: "ran",
      c: "ran",
    });
  });
});
