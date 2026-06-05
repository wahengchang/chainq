// THE make-or-break test. If transitive Merkle invalidation is wrong, chain
// silently serves stale output — the worst possible failure for this tool.

import { describe, it, expect } from "vitest";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeKeys, volatileSet, CacheStore } from "./cache.js";
import type { Flow } from "./types.js";

// DAG:  A ──▶ B ──▶ C
//        └──▶ D            (D is a sibling branch of B)
function diamond(promptB: string, promptA = "a"): Flow {
  return {
    profiles: { default: { cmd: "cat" } },
    steps: {
      A: { id: "A", type: "ai", prompt: promptA },
      B: { id: "B", type: "ai", from: "A", prompt: promptB },
      C: { id: "C", type: "ai", from: "B", prompt: "c" },
      D: { id: "D", type: "ai", from: "A", prompt: "d" },
    },
  };
}

describe("Merkle cache keys", () => {
  it("editing B invalidates B and its transitive downstream C — but NOT sibling D or upstream A", () => {
    const before = computeKeys(diamond("b"), "/tmp");
    const after = computeKeys(diamond("b-edited"), "/tmp");

    expect(after.get("A")).toBe(before.get("A")); // upstream untouched
    expect(after.get("D")).toBe(before.get("D")); // sibling untouched
    expect(after.get("B")).not.toBe(before.get("B")); // edited node
    expect(after.get("C")).not.toBe(before.get("C")); // transitive downstream
  });

  it("editing the root A cascades to every descendant", () => {
    const before = computeKeys(diamond("b", "a"), "/tmp");
    const after = computeKeys(diamond("b", "a-edited"), "/tmp");

    expect(after.get("A")).not.toBe(before.get("A"));
    expect(after.get("B")).not.toBe(before.get("B"));
    expect(after.get("C")).not.toBe(before.get("C"));
    expect(after.get("D")).not.toBe(before.get("D"));
  });

  it("identical flows produce identical keys (deterministic)", () => {
    const a = computeKeys(diamond("b"), "/tmp");
    const b = computeKeys(diamond("b"), "/tmp");
    expect([...a.entries()]).toEqual([...b.entries()]);
  });

  it("switching an ai node's profile changes its key (env is folded in)", () => {
    const f = diamond("b");
    f.profiles.fast = { cmd: "claude --model haiku -p" };
    const base = computeKeys(f, "/tmp");
    const f2 = diamond("b");
    f2.profiles.fast = { cmd: "claude --model haiku -p" };
    f2.steps.B!.profile = "fast";
    const changed = computeKeys(f2, "/tmp");
    expect(changed.get("B")).not.toBe(base.get("B"));
  });
});

describe("from-order is cache-significant", () => {
  it("reordering a node's from list changes its key ($json binds to the first upstream)", () => {
    const base = (order: string[]): Flow => ({
      profiles: { default: { cmd: "cat" } },
      steps: {
        A: { id: "A", type: "ai", prompt: "a" },
        B: { id: "B", type: "ai", prompt: "b" },
        M: { id: "M", type: "ai", from: order, prompt: "{{ $json }}" },
      },
    });
    const ab = computeKeys(base(["A", "B"]), "/tmp");
    const ba = computeKeys(base(["B", "A"]), "/tmp");
    expect(ba.get("M")).not.toBe(ab.get("M")); // different $json source → different key
  });
});

describe("volatile (uncacheable) propagation", () => {
  it("a cmd with no declared inputs is volatile, and poisons its downstream", () => {
    const flow: Flow = {
      profiles: { default: { cmd: "cat" } },
      steps: {
        fetch: { id: "fetch", type: "cmd", run: "echo hi" }, // no inputs -> volatile
        sum: { id: "sum", type: "ai", from: "fetch", prompt: "{{ $json }}" },
      },
    };
    const v = volatileSet(flow);
    expect(v.has("fetch")).toBe(true);
    expect(v.has("sum")).toBe(true); // fed by a volatile node
  });

  it("a cmd WITH declared inputs is cacheable", () => {
    const flow: Flow = {
      profiles: { default: { cmd: "cat" } },
      steps: { fetch: { id: "fetch", type: "cmd", run: "cat in.txt", inputs: ["in.txt"] } },
    };
    expect(volatileSet(flow).has("fetch")).toBe(false);
  });
});

describe("CacheStore.rename — rename keeps the cache (id is not in the Merkle key)", () => {
  const withStore = (fn: (dir: string) => void): void => {
    const dir = mkdtempSync(join(tmpdir(), "chain-cache-"));
    try {
      fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };

  it("moves state + output file from old id to new id", () => {
    withStore((dir) => {
      new CacheStore(dir).put("a", "k1", [{ json: "hello" }]);
      new CacheStore(dir).rename("a", "x");

      const reopened = new CacheStore(dir);
      expect(reopened.load("x")).toEqual([{ json: "hello" }]);
      expect(() => reopened.load("a")).toThrow(/no cached output/);
      expect(existsSync(join(dir, "outputs", "x.out"))).toBe(true);
      expect(existsSync(join(dir, "outputs", "a.out"))).toBe(false);
    });
  });

  it("keeps the same key so the renamed node stays valid (not re-run)", () => {
    withStore((dir) => {
      new CacheStore(dir).put("a", "k1", [{ json: 1 }]);
      new CacheStore(dir).rename("a", "x");
      // same key it was stored under → still a cache hit, no recompute
      expect(new CacheStore(dir).isValid("x", "k1", false)).toBe(true);
    });
  });

  it("is a no-op for a node that never ran", () => {
    withStore((dir) => {
      expect(() => new CacheStore(dir).rename("ghost", "x")).not.toThrow();
    });
  });
});
