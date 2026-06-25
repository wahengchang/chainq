// Render in the items model: a node downstream of a multi-item upstream can read
// the PAIRED current item ({{ $json }}) and ALL items ({{ $('id').all() }}) in the
// same template. The multi-item stream comes from an `input` batch. Uses `assemble`
// (pure templating, no model) so it runs OFFLINE.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import type { Item } from "../../src/engine/index.js";

const items = (p: { read: (r: string) => string }, id: string): Item[] =>
  JSON.parse(p.read(`.chain/outputs/${id}.out`)) as Item[];

describe("render items ($json paired + $('id').all())", () => {
  it("each item sees its own value and the full upstream array", () => {
    const p = newProject()
      .write("sets.jsonl", '{"v":"a"}\n{"v":"b"}\n{"v":"c"}\n')
      .write(
        "flow.yaml",
        `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n` +
          `  src:  { type: input, params: { v: {} } }\n` +
          `  join: { type: assemble, from: src, prompt: "{{ $json.v }}|{{ $('src').all() }}" }\n`,
      );
    expect(p.run(["run", "flow.yaml", "--input-file", "sets.jsonl"]).status).toMatchObject({
      src: "ran",
      join: "ran",
    });
    const out = items(p, "join").map((i) => i.json as string);
    // 3 items: each shows its own paired value, then the whole upstream array.
    expect(out).toEqual([
      'a|[{"v":"a"},{"v":"b"},{"v":"c"}]',
      'b|[{"v":"a"},{"v":"b"},{"v":"c"}]',
      'c|[{"v":"a"},{"v":"b"},{"v":"c"}]',
    ]);
  });
});
