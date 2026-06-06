// Subprocess runner — the ONE place chain shells out to a local CLI model.
//
// Rules locked in eng review (the CLI footguns the HTTP API doesn't have):
//   - prompt goes in via STDIN, then stdin is closed (no length limit, no
//     quoting hell)
//   - spawned with an argv array, never a shell string (no injection)
//   - hard timeout: SIGTERM, then SIGKILL after a grace period
//   - stdout AND stderr both captured (stderr carries the real error: login
//     expired, command not found)
//   - the caller is responsible for never persisting a failed/partial run as a
//     valid cache entry (atomic write lives in cache.ts)

import { spawn } from "node:child_process";

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  code: number | null;
  /** True when the process was killed because it exceeded the timeout. */
  timedOut: boolean;
}

export interface SubprocessOptions {
  timeoutMs?: number;
  /** Grace period between SIGTERM and SIGKILL. */
  killGraceMs?: number;
  /**
   * Working directory for the child. Relative paths in a cmd node (`cat in.txt`)
   * resolve against this — the flow's directory, NOT wherever the process was
   * launched. Pinning this kills the "same flow, different cwd → reads different
   * files" drift the design warns about.
   */
  cwd?: string;
}

const DEFAULT_TIMEOUT = 120_000;
const DEFAULT_KILL_GRACE = 2_000;

export async function runSubprocess(
  argv: string[],
  stdin: string,
  opts: SubprocessOptions = {},
): Promise<SubprocessResult> {
  if (argv.length === 0) throw new Error("runSubprocess: empty argv");
  const [cmd, ...args] = argv as [string, ...string[]];
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT;
  const killGraceMs = opts.killGraceMs ?? DEFAULT_KILL_GRACE;

  return new Promise<SubprocessResult>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // Escalate if it ignores SIGTERM.
      killTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
    }, timeoutMs);

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      reject(err); // e.g. ENOENT — command not found (caught upstream by `which` preflight)
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      resolve({ stdout, stderr, code, timedOut });
    });

    // Feed the prompt, then close stdin so the model knows input is complete.
    // Swallow EPIPE: if the child exits before reading stdin, the write errors —
    // the real failure is the non-zero exit, surfaced by the 'close' handler.
    child.stdin.on("error", () => {});
    child.stdin.write(stdin);
    child.stdin.end();
  });
}
