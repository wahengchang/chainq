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
  /** True when the process was killed because the caller aborted (UI Stop). */
  aborted: boolean;
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
  /**
   * Abort the in-flight child (UI Stop / cancelled run). On abort the process is
   * SIGTERM'd, then SIGKILL'd after the grace period — same escalation as the
   * timeout — and the result comes back with `aborted: true`. If the signal is
   * already aborted, no child is spawned.
   */
  signal?: AbortSignal;
}

// Built-in fallback when neither the node (FlowNode.timeout) nor the flow
// (Flow.defaults.timeout) sets one. Unified across CLI and web — a real
// `claude -p` call (reasoning, big inputs) needs more than the old 120s.
const DEFAULT_TIMEOUT = 300_000;
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

  // Already cancelled before we even start → don't spawn anything.
  if (opts.signal?.aborted) {
    return Promise.resolve({ stdout: "", stderr: "", code: null, timedOut: false, aborted: true });
  }

  return new Promise<SubprocessResult>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let aborted = false;
    let killTimer: NodeJS.Timeout | undefined;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // Escalate if it ignores SIGTERM.
      killTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
    }, timeoutMs);

    // UI Stop / cancelled run: kill the child the same way the timeout does.
    const onAbort = () => {
      aborted = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), killGraceMs);
    };
    opts.signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      opts.signal?.removeEventListener("abort", onAbort);
    };

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => {
      cleanup();
      reject(err); // e.g. ENOENT — command not found (caught upstream by `which` preflight)
    });

    child.on("close", (code) => {
      cleanup();
      resolve({ stdout, stderr, code, timedOut, aborted });
    });

    // Feed the prompt, then close stdin so the model knows input is complete.
    // Swallow EPIPE: if the child exits before reading stdin, the write errors —
    // the real failure is the non-zero exit, surfaced by the 'close' handler.
    child.stdin.on("error", () => {});
    child.stdin.write(stdin);
    child.stdin.end();
  });
}
