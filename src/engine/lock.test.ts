import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FlowLock } from "./lock.js";

const dir = () => mkdtempSync(join(tmpdir(), "chain-lock-"));

describe("FlowLock — single writer", () => {
  it("blocks a second acquirer while held, then frees on release", () => {
    const d = dir();
    const a = new FlowLock(d);
    const b = new FlowLock(d);
    a.acquire();
    expect(() => b.acquire()).toThrow(/another chain process/);
    a.release();
    expect(() => b.acquire()).not.toThrow();
    b.release();
  });

  it("reclaims a stale lock (owner long gone by time)", () => {
    const d = dir();
    new FlowLock(d).acquire(1000); // held since t=1000, not released
    const later = new FlowLock(d);
    // an hour+ later → previous lock is stale → reclaimable
    expect(() => later.acquire(1000 + 2 * 60 * 60 * 1000)).not.toThrow();
    later.release();
  });
});
