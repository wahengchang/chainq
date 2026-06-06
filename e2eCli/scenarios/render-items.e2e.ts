// Render in the items model: a node downstream of a multi-item upstream can read
// the PAIRED current item ({{ $json }}) and ALL items ({{ $('id').all() }}) in the
// same template. Uses `assemble` (pure templating, no model) so it runs OFFLINE.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import type { Item } from "../../src/engine/index.js";

const items = (p: { read: (r: string) => string }, id: string): Item[] =>
  JSON.parse(p.read(`.chain/outputs/${id}.out`)) as Item[];

describe("render items ($json paired + $('id').all())", () => {
  it("each item sees its own value and the full upstream array", () => {
    const p = newProject()
      .write("arr.json", '["a","b","c"]')
      .write(
        "flow.yaml",
        `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n` +
          `  src:   { type: cmd, run: 'cat arr.json', inputs: ['arr.json'] }\n` +
          `  split: { type: splitOut, from: src }\n` +
          `  join:  { type: assemble, from: split, prompt: "{{ $json }}|{{ $('split').all() }}" }\n`,
      );
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ split: "ran", join: "ran" });
    const out = items(p, "join").map((i) => i.json as string);
    // 3 items: each shows its paired value, then the whole array
    expect(out).toEqual([
      'a|["a","b","c"]',
      'b|["a","b","c"]',
      'c|["a","b","c"]',
    ]);
  });
});
