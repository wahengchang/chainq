// The iteration loop: pinned trial runs stay in scratch, and `from` order is
// cache-significant (it picks $json).

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import { linear, multiInput } from "../fixtures/flows.js";
import { haveClaude } from "../harness/cli.js";

// These RUN ai nodes (no fake model) → real `claude -p`. Gated; skipped without it.
describe.skipIf(!haveClaude)("iterate", () => {
  it("--pin runs into scratch; real outputs are untouched", () => {
    const p = newProject().write("flow.yaml", linear());
    p.chain("run", "flow.yaml"); // populate real .chain/outputs
    p.write("sample.txt", "PINNED");

    const r = p.chain("run", "flow.yaml", "--pin", "b=sample.txt");
    expect(r.out).toMatch(/scratch run/);
    expect(p.exists(".chain/outputs/c.out")).toBe(true); // real output still there
    expect(p.exists(".chain/scratch")).toBe(true); // trial landed in scratch
  });

  it("reordering a node's `from` invalidates it (from-order regression)", () => {
    const p = newProject().write("flow.yaml", multiInput("[A, B]"));
    p.chain("run", "flow.yaml"); // cold
    p.write("flow.yaml", multiInput("[B, A]")); // $json source changes
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({
      A: "cached",
      B: "cached",
      M: "ran",
    });
  });
});
