// `input` trigger node: a flow declares params; values are supplied at run time
// (--input / --input-file) and become the seed item(s). One set → one item; many
// sets → a batch. Offline (input → assemble, no model).

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import type { Item } from "../../src/engine/index.js";

const items = (p: { read: (r: string) => string }, id: string): Item[] =>
  JSON.parse(p.read(`.chain/outputs/${id}.out`)) as Item[];

// in (params) → show (renders the params so we can read them back offline)
const FLOW =
  `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n` +
  `  in:   { type: input, params: { city: { default: Tokyo }, lang: { default: zh-tw } } }\n` +
  `  show: { type: assemble, from: in, prompt: 'city={{ $json.city }} lang={{ $json.lang }}' }\n`;

describe("input trigger node", () => {
  it("uses declared defaults when nothing is supplied", () => {
    const p = newProject().write("flow.yaml", FLOW);
    expect(p.run(["run", "flow.yaml", "--cache"]).status).toMatchObject({ in: "ran", show: "ran" });
    expect(items(p, "show").map((i) => i.json)).toEqual(["city=Tokyo lang=zh-tw"]);
  });

  it("--input k=v overrides a param, keeping other defaults", () => {
    const p = newProject().write("flow.yaml", FLOW);
    p.run(["run", "flow.yaml", "--cache", "--input", "city=Osaka"]);
    expect(items(p, "show").map((i) => i.json)).toEqual(["city=Osaka lang=zh-tw"]);
  });

  it("--input-file with many sets runs the chain once per set (batch)", () => {
    const p = newProject()
      .write("flow.yaml", FLOW)
      .write("sets.jsonl", '{"city":"A"}\n{"city":"B"}\n');
    expect(p.run(["run", "flow.yaml", "--cache", "--input-file", "sets.jsonl"]).status).toMatchObject({
      in: "ran",
      show: "ran",
    });
    expect(items(p, "show").map((i) => i.json)).toEqual([
      "city=A lang=zh-tw",
      "city=B lang=zh-tw",
    ]);
  });

  it("changing --input re-runs the trigger and its downstream (key invalidation)", () => {
    const p = newProject().write("flow.yaml", FLOW);
    expect(p.run(["run", "flow.yaml", "--cache", "--input", "city=A"]).status).toMatchObject({ in: "ran", show: "ran" });
    expect(p.run(["run", "flow.yaml", "--cache", "--input", "city=A"]).status).toMatchObject({ in: "cached", show: "cached" });
    expect(p.run(["run", "flow.yaml", "--cache", "--input", "city=B"]).status).toMatchObject({ in: "ran", show: "ran" }); // ★ changed input
  });

  it("rejects an --input-file whose entries are not JSON objects", () => {
    const p = newProject().write("flow.yaml", FLOW).write("bad.jsonl", '"abc"\n123\n');
    const r = p.chain("run", "flow.yaml", "--cache", "--input-file", "bad.jsonl");
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/must be a JSON object/);
  });

  it("rejects an input node that has a `from` (it's a trigger)", () => {
    const p = newProject().write(
      "flow.yaml",
      `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n` +
        `  a:  { type: assemble, prompt: 'x' }\n` +
        `  in: { type: input, from: a, params: { city: {} } }\n`,
    );
    const r = p.chain("validate", "flow.yaml");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/input is a trigger/);
  });
});
