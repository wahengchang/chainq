// Partial runs (--from / --steps) and scratch isolation (--pin must never
// touch the real outputs — B1 in the design).

import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Runner } from "./run.js";
import { itemsText } from "./types.js";
import type { Flow } from "./types.js";

const dir = () => mkdtempSync(join(tmpdir(), "chain-test-"));
const cat = { default: { cmd: "cat" } };

function chain(): Flow {
  return {
    profiles: cat,
    steps: {
      a: { id: "a", type: "ai", prompt: "x" },
      b: { id: "b", type: "ai", from: "a", prompt: "{{ $json }}" },
      c: { id: "c", type: "ai", from: "b", prompt: "{{ $json }}" },
    },
  };
}

describe("partial runs", () => {
  it("--from forces the node and everything downstream, upstream stays cached", async () => {
    const d = dir();
    await new Runner(chain(), { chainDir: d }).runChain();
    const res = await new Runner(chain(), { chainDir: d }).runFrom("b");
    const status = Object.fromEntries(res.map((r) => [r.id, r.status]));
    expect(status.b).toBe("ran");
    expect(status.c).toBe("ran"); // downstream of b
    expect(status.a).toBeUndefined(); // a is upstream — not in the forced set
  });

  it("--steps runs only the first N nodes", async () => {
    const d = dir();
    const res = await new Runner(chain(), { chainDir: d }).runSteps(2);
    expect(res.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("cmd cwd", () => {
  it("resolves a cmd's relative path against baseDir, not process.cwd (cwd-drift regression)", async () => {
    const d = dir();
    writeFileSync(join(d, "data.txt"), "hello-from-basedir");
    const flow: Flow = {
      profiles: cat,
      steps: { read: { id: "read", type: "cmd", run: "cat data.txt", inputs: ["data.txt"] } },
    };
    // chainDir is a SUBdir; baseDir is d. process.cwd() is the repo root, NOT d —
    // so this only passes if the subprocess runs in baseDir.
    const res = await new Runner(flow, { chainDir: join(d, ".chain"), baseDir: d }).runChain();
    expect(res[0]!.status).toBe("ran");
    expect(itemsText(res[0]!.output)).toContain("hello-from-basedir");
  });
});

describe("scratch isolation (--pin)", () => {
  it("a pinned trial run writes .chain/scratch and NEVER touches real outputs", async () => {
    const d = dir();
    // Real run populates .chain/outputs.
    await new Runner(chain(), { chainDir: d }).runChain();
    const realB = readFileSync(join(d, "outputs", "b.out"), "utf8");

    // Trial run with a pinned upstream, in scratch mode.
    await new Runner(chain(), {
      chainDir: d,
      scratch: true,
      pins: { a: "PINNED-SAMPLE" },
    }).runToNode("c");

    // Real outputs are byte-for-byte unchanged...
    expect(readFileSync(join(d, "outputs", "b.out"), "utf8")).toBe(realB);
    // ...and the trial landed in scratch.
    expect(existsSync(join(d, "scratch"))).toBe(true);
    expect(readFileSync(join(d, "scratch", "b.out"), "utf8")).toContain("PINNED-SAMPLE");
  });
});
