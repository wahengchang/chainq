// Paired-item: a node that cross-references a non-primary upstream via $('id').item
// must pair each item to the ORIGINATING seed row — by lineage (pairedItem), not by
// the loop index. The multi-item stream is an `input` batch flowing through an
// intermediate 1:1 step. Offline: input → assemble → assemble (no model).

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import type { Item } from "../../src/engine/index.js";

const items = (p: { read: (r: string) => string }, id: string): Item[] =>
  JSON.parse(p.read(`.chain/outputs/${id}.out`)) as Item[];

describe("paired-item across a batch", () => {
  it("$('seed').item pairs to the originating input row through an intermediate step", () => {
    const p = newProject()
      .write(
        "flow.yaml",
        `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n` +
          `  seed: { type: input, params: { tag: {}, n: {} } }\n` +
          `  mid:  { type: assemble, from: seed, prompt: "{{ $json.n }}" }\n` +
          `  show: { type: assemble, from: [mid, seed], prompt: "{{ $json }}|{{ $('seed').item.tag }}" }\n`,
      )
      .write("sets.jsonl", '{"tag":"X","n":1}\n{"tag":"Y","n":2}\n');

    p.run(["run", "flow.yaml", "--input-file", "sets.jsonl"]);
    // row X carries n=1, row Y carries n=2 — each show item keeps its own tag.
    expect(items(p, "show").map((i) => i.json)).toEqual(["1|X", "2|Y"]);
  });
});
