// Paired-item regression (codex pre-landing review, finding 1). When splitOut
// changes cardinality, a downstream fan-in to a PRE-split upstream via $('id')
// must pair each item to the right source row — by lineage (pairedItem), not by
// the loop index. Offline: input → splitOut → assemble (no model).

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import type { Item } from "../../src/engine/index.js";

const items = (p: { read: (r: string) => string }, id: string): Item[] =>
  JSON.parse(p.read(`.chain/outputs/${id}.out`)) as Item[];

describe("paired-item across a fan-out", () => {
  it("$('seed').item pairs to the originating input row, not the loop index", () => {
    const p = newProject()
      .write(
        "flow.yaml",
        `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n` +
          `  seed:  { type: input, params: {} }\n` +
          `  split: { type: splitOut, from: seed, field: arr }\n` +
          `  show:  { type: assemble, from: [split, seed], prompt: "{{ $json }}|{{ $('seed').item.tag }}" }\n`,
      )
      .write("sets.jsonl", '{"tag":"X","arr":[1,2]}\n{"tag":"Y","arr":[3,4]}\n');

    p.run(["run", "flow.yaml", "--input-file", "sets.jsonl"]);
    // 1,2 came from row X; 3,4 from row Y — each must keep its own tag.
    expect(items(p, "show").map((i) => i.json)).toEqual(["1|X", "2|X", "3|Y", "4|Y"]);
  });
});
