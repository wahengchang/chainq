// Single-writer lock per flow (T7). Two `chain run`/`chain ui` processes must
// not race on state.json. The lock BLOCKS (not just warns), and a stale lock —
// left by a crashed process — is reclaimed automatically.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface LockInfo {
  pid: number;
  startedAt: number;
}

const STALE_MS = 60 * 60 * 1000; // an hour with no living owner = stale

export class FlowLock {
  private path: string;
  private held = false;

  constructor(chainDir: string) {
    mkdirSync(chainDir, { recursive: true });
    this.path = join(chainDir, "lock");
  }

  /** Acquire, or throw if another live process already holds it. */
  acquire(now: number = Date.now()): void {
    if (existsSync(this.path)) {
      const info = this.read();
      if (info && !this.isStale(info, now)) {
        throw new Error(
          `another chain process (pid ${info.pid}) is using this flow. ` +
            `Wait for it to finish, or remove ${this.path} if it crashed.`,
        );
      }
      // stale → reclaim
    }
    writeFileSync(this.path, JSON.stringify({ pid: process.pid, startedAt: now } satisfies LockInfo));
    this.held = true;
  }

  release(): void {
    if (this.held && existsSync(this.path)) rmSync(this.path, { force: true });
    this.held = false;
  }

  private read(): LockInfo | null {
    try {
      return JSON.parse(readFileSync(this.path, "utf8")) as LockInfo;
    } catch {
      return null; // unreadable/corrupt → treat as reclaimable
    }
  }

  private isStale(info: LockInfo, now: number): boolean {
    if (now - info.startedAt > STALE_MS) return true;
    return !pidAlive(info.pid);
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0); // signal 0 = existence check, doesn't kill
    return true;
  } catch (err) {
    // ESRCH = no such process; EPERM = exists but not ours (still alive)
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
