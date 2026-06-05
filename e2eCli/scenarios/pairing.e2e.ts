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

describe("multi-hop paired-item (P-LINEAGE)", () => {
  it("$('seed') is correct across TWO levels of fan-out (not single-hop)", () => {
    // seed → splitA(outer) → splitB(inner) → show. Reference to the grandparent
    // `seed` must walk both hops. Single-hop would index seed with splitB's
    // pairedItem (an index into splitA) and mis-tag the middle row.
    const p = newProject()
      .write(
        "flow.yaml",
        `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n` +
          `  seed:   { type: input, params: {} }\n` +
          `  splitA: { type: splitOut, from: seed, field: outer }\n` +
          `  splitB: { type: splitOut, from: splitA, field: inner }\n` +
          `  show:   { type: assemble, from: [splitB, seed], prompt: "{{ $json.v }}|{{ $('seed').item.tag }}" }\n`,
      )
      .write(
        "sets.jsonl",
        '{"tag":"X","outer":[{"inner":[{"v":1}]},{"inner":[{"v":2}]}]}\n' +
          '{"tag":"Y","outer":[{"inner":[{"v":3}]}]}\n',
      );

    p.run(["run", "flow.yaml", "--input-file", "sets.jsonl"]);
    // v=1 and v=2 both originate in row X (two outer entries); v=3 in row Y.
    // Single-hop would produce ["1|X","2|Y","3|Y"] — the 2nd row is the regression.
    expect(items(p, "show").map((i) => i.json)).toEqual(["1|X", "2|X", "3|Y"]);
  });

  it("$('seed') across an aggregate collapses to the first source row (documented)", () => {
    // seed → split → aggregate → show. The aggregate folds every split item into
    // ONE item, so the 1:1 pairing to `seed` is gone. The lineage walk gives the
    // only defined answer: the first source row (seed[0] = X). This asserts the
    // walk stays correct/total through a cardinality collapse rather than crashing.
    const p = newProject()
      .write(
        "flow.yaml",
        `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n` +
          `  seed:  { type: input, params: {} }\n` +
          `  split: { type: splitOut, from: seed, field: arr }\n` +
          `  agg:   { type: aggregate, from: split }\n` +
          `  show:  { type: assemble, from: [agg, seed], prompt: "{{ $('seed').item.tag }}" }\n`,
      )
      .write("sets.jsonl", '{"tag":"X","arr":[1,2]}\n{"tag":"Y","arr":[3,4]}\n');

    p.run(["run", "flow.yaml", "--input-file", "sets.jsonl"]);
    expect(items(p, "show").map((i) => i.json)).toEqual(["X"]);
  });
});
