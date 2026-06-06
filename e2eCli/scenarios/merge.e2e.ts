// Merge: combine two input streams (n8n Merge node) — append / byPosition / byKey.
// Collection operator, no model call → OFFLINE.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import type { Item } from "../../src/engine/index.js";

const items = (p: { read: (r: string) => string }, id: string): Item[] =>
  JSON.parse(p.read(`.chain/outputs/${id}.out`)) as Item[];

const head = `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n`;

describe("merge", () => {
  it("append concatenates both inputs' items", () => {
    const p = newProject()
      .write("a.txt", "apple")
      .write("b.txt", "banana")
      .write(
        "flow.yaml",
        head +
          "  a: { type: cmd, run: 'cat a.txt', inputs: ['a.txt'] }\n" +
          "  b: { type: cmd, run: 'cat b.txt', inputs: ['b.txt'] }\n" +
          "  m: { type: merge, from: [a, b], mode: append }\n",
      );
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ m: "ran" });
    expect(items(p, "m").map((i) => i.json)).toEqual(["apple", "banana"]);
  });

  // object streams for byKey / byPosition (split arrays of objects into items)
  const objFlow = (mergeLine: string) =>
    head +
    "  sa: { type: cmd, run: 'cat a.json', inputs: ['a.json'] }\n" +
    "  sb: { type: cmd, run: 'cat b.json', inputs: ['b.json'] }\n" +
    "  splitA: { type: splitOut, from: sa }\n" +
    "  splitB: { type: splitOut, from: sb }\n" +
    mergeLine;
  const A = '[{"id":1,"a":"x"},{"id":2,"a":"y"}]';
  const B = '[{"id":1,"b":"p"},{"id":2,"b":"q"}]';

  it("byKey joins objects on a shared key", () => {
    const p = newProject()
      .write("a.json", A)
      .write("b.json", B)
      .write("flow.yaml", objFlow("  m: { type: merge, from: [splitA, splitB], mode: byKey, key: id }\n"));
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ m: "ran" });
    expect(items(p, "m").map((i) => i.json)).toEqual([
      { id: 1, a: "x", b: "p" },
      { id: 2, a: "y", b: "q" },
    ]);
  });

  it("byPosition merges items pairwise by index", () => {
    const p = newProject()
      .write("a.json", A)
      .write("b.json", B)
      .write("flow.yaml", objFlow("  m: { type: merge, from: [splitA, splitB], mode: byPosition }\n"));
    expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ m: "ran" });
    expect(items(p, "m").map((i) => i.json)).toEqual([
      { id: 1, a: "x", b: "p" },
      { id: 2, a: "y", b: "q" },
    ]);
  });
});
