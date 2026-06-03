// Runtime behaviour, end to end, fully offline via the G2 fake model (`cat`
// echoes the rendered prompt back as output). No API key, no network.

import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Runner } from "./run.js";
import type { Flow } from "./types.js";

const dir = () => mkdtempSync(join(tmpdir(), "chain-test-"));
const cat = { default: { cmd: "cat" } };

describe("Runner — G2 fake model", () => {
  it("runs a chain offline and flows data downstream", async () => {
    const flow: Flow = {
      profiles: cat,
      steps: {
        a: { id: "a", type: "ai", prompt: "hello" },
        b: { id: "b", type: "ai", from: "a", prompt: "got: {{ $json }}" },
      },
    };
    const r = await new Runner(flow, { chainDir: dir() }).runChain();
    expect(r.find((x) => x.id === "a")!.output).toContain("hello");
    expect(r.find((x) => x.id === "b")!.output).toContain("got: hello");
    expect(r.every((x) => x.status === "ran")).toBe(true);
  });

  it("a second identical run serves everything from cache", async () => {
    const flow: Flow = {
      profiles: cat,
      steps: {
        a: { id: "a", type: "ai", prompt: "x" },
        b: { id: "b", type: "ai", from: "a", prompt: "{{ $json }}" },
      },
    };
    const d = dir();
    await new Runner(flow, { chainDir: d }).runChain();
    const second = await new Runner(flow, { chainDir: d }).runChain();
    expect(second.every((x) => x.status === "cached")).toBe(true);
  });

  it("editing a downstream prompt re-runs ONLY it; upstream stays cached", async () => {
    const d = dir();
    const make = (pb: string): Flow => ({
      profiles: cat,
      steps: {
        a: { id: "a", type: "ai", prompt: "x" },
        b: { id: "b", type: "ai", from: "a", prompt: pb },
      },
    });
    await new Runner(make("v1"), { chainDir: d }).runChain();
    const res = await new Runner(make("v2"), { chainDir: d }).runChain();
    expect(res.find((x) => x.id === "a")!.status).toBe("cached");
    expect(res.find((x) => x.id === "b")!.status).toBe("ran");
  });

  it("editing an UPSTREAM prompt re-runs it AND its downstream (no stale serve)", async () => {
    const d = dir();
    const make = (pa: string): Flow => ({
      profiles: cat,
      steps: {
        a: { id: "a", type: "ai", prompt: pa },
        b: { id: "b", type: "ai", from: "a", prompt: "{{ $json }}" },
      },
    });
    await new Runner(make("x"), { chainDir: d }).runChain();
    const res = await new Runner(make("y"), { chainDir: d }).runChain();
    expect(res.find((x) => x.id === "a")!.status).toBe("ran");
    expect(res.find((x) => x.id === "b")!.status).toBe("ran");
  });

  it("rerunNode forces just the target on cached upstream", async () => {
    const d = dir();
    const flow: Flow = {
      profiles: cat,
      steps: {
        a: { id: "a", type: "ai", prompt: "x" },
        b: { id: "b", type: "ai", from: "a", prompt: "{{ $json }}" },
      },
    };
    await new Runner(flow, { chainDir: d }).runChain();
    const runner = new Runner(flow, { chainDir: d });
    const r = await runner.rerunNode("b");
    expect(r.status).toBe("ran"); // forced
  });

  it("a REUSED Runner: rerunNode forces a re-run even after runChain (per-op ctx)", async () => {
    const d = dir();
    const flow: Flow = {
      profiles: cat,
      steps: {
        a: { id: "a", type: "ai", prompt: "x" },
        b: { id: "b", type: "ai", from: "a", prompt: "{{ $json }}" },
      },
    };
    const runner = new Runner(flow, { chainDir: d });
    await runner.runChain(); // first operation
    const r = await runner.rerunNode("b"); // SAME instance — must NOT return stale memo
    expect(r.status).toBe("ran");
  });

  it("a pinned upstream is treated as a fact input and never runs", async () => {
    const d = dir();
    const flow: Flow = {
      profiles: cat,
      steps: {
        a: { id: "a", type: "ai", prompt: "expensive" },
        b: { id: "b", type: "ai", from: "a", prompt: "{{ $json }}" },
      },
    };
    const res = await new Runner(flow, { chainDir: d, pins: { a: "PINNED" } }).runToNode("b");
    expect(res.find((x) => x.id === "a")!.status).toBe("cached");
    expect(res.find((x) => x.id === "b")!.output).toContain("PINNED");
  });

  it("a failed upstream halts its downstream (skipped, no crash) — E2", async () => {
    const d = dir();
    const flow: Flow = {
      profiles: cat,
      steps: {
        a: { id: "a", type: "cmd", run: "false" }, // exits 1 -> fails
        b: { id: "b", type: "ai", from: "a", prompt: "{{ $json }}" },
      },
    };
    const res = await new Runner(flow, { chainDir: d }).runChain();
    expect(res.find((x) => x.id === "a")!.status).toBe("failed");
    expect(res.find((x) => x.id === "b")!.status).toBe("skipped");
    expect(res.find((x) => x.id === "b")!.error).toMatch(/upstream "a"/);
  });

  it("a node that exceeds its timeout fails as 'timed out' (kill path)", async () => {
    const d = dir();
    const flow: Flow = {
      profiles: cat,
      steps: { slow: { id: "slow", type: "cmd", run: "sleep 5" } },
    };
    const res = await new Runner(flow, { chainDir: d, timeoutMs: 100 }).runChain();
    expect(res[0]!.status).toBe("failed");
    expect(res[0]!.error).toMatch(/timed out/);
  });

  it("a failed node is not cached (next run retries it)", async () => {
    const d = dir();
    const flow: Flow = {
      profiles: { default: { cmd: "false" } }, // `false` exits 1 -> failure
      steps: { a: { id: "a", type: "ai", prompt: "x" } },
    };
    const first = await new Runner(flow, { chainDir: d }).runChain();
    expect(first.find((x) => x.id === "a")!.status).toBe("failed");
    // cache must be empty -> a re-run still attempts (still fails, not "cached")
    const second = await new Runner(flow, { chainDir: d }).runChain();
    expect(second.find((x) => x.id === "a")!.status).toBe("failed");
  });
});
