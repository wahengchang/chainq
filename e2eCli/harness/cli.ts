// Spawn the REAL chain CLI as a subprocess. No mocks, no internal imports — the
// E2E framework only ever talks to the binary the way a user would.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HARNESS_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HARNESS_DIR, "..", "..");
// Use the repo's own tsx binary by absolute path: `npx tsx` can't resolve tsx
// from a temp project dir that has no node_modules.
const TSX = join(REPO_ROOT, "node_modules", ".bin", "tsx");
const CLI = join(REPO_ROOT, "src", "cli", "index.ts");

/** Is the real `claude` CLI on PATH? There is no fake model — scenarios that
 * actually RUN ai nodes gate on this and skip when it's absent (e.g. CI). */
export const haveClaude = spawnSync("which", ["claude"]).status === 0;

const stripAnsi = (s: string | null): string => (s ?? "").replace(/\x1b\[[0-9;]*m/g, "");

export interface CliResult {
  out: string; // stdout + stderr, ANSI stripped (back-compat: most asserts use this)
  stdout: string; // ANSI stripped — the RESULT stream (`-q` / pipe-friendly)
  stderr: string; // ANSI stripped — the PROGRESS stream
  code: number;
}

export function runCli(cwd: string, args: string[]): CliResult {
  const r = spawnSync(TSX, [CLI, ...args], { cwd, encoding: "utf8" });
  const stdout = stripAnsi(r.stdout);
  const stderr = stripAnsi(r.stderr);
  return { out: `${stdout}${stderr}`, stdout, stderr, code: r.status ?? 1 };
}

// "Non-headless": stream the CLI's real (colored) output straight to the
// terminal so you can WATCH the chain run. Used by the demo runner, not asserts.
export function showCli(cwd: string, args: string[]): number {
  const r = spawnSync(TSX, [CLI, ...args], { cwd, stdio: "inherit" });
  return r.status ?? 1;
}
