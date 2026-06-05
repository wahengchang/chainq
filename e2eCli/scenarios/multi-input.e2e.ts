// Multi-input fan-in end-to-end: a node with `from: [A, B]` runs through the real
// CLI and produces output. There is no fake model, so we can't assert on exact
// rendered text here (the model output is non-deterministic) — the RESOLUTION of
// {{ $json }} / {{ $node["id"] }} / {{ $('id') }} is covered deterministically by
// the unit tests in src/engine/render.test.ts. This proves the wiring executes.
// Gated on a real `claude` being on PATH.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import { multiInputExpr } from "../fixtures/flows.js";
import { haveClaude } from "../harness/cli.js";
import { itemsText, type Item } from "../../src/engine/index.js";

describe.skipIf(!haveClaude)("multi-input fan-in (real model)", () => {
  it("a node wired from [A, B] runs and produces non-empty output", () => {
    const p = newProject().write("flow.yaml", multiInputExpr("{{ $json }} / {{ $('B') }}"));
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ A: "ran", B: "ran", M: "ran" });
    const items = JSON.parse(p.read(".chain/outputs/M.out")) as Item[];
    expect(itemsText(items).trim().length).toBeGreaterThan(0);
  });
});
