// Browser E2E — the RUN-STATE lifecycle on the canvas + panel. The engine runs
// nodes one at a time, so the UI must show exactly ONE node "running" (spinner)
// while the rest sit "queued" — not the whole chain spinning at once. And while a
// node is running/queued its OUTPUT panel must NOT show the previous run's stale
// result. Driven OFFLINE via a tiny `slow.sh` profile (sleep + cat), so it needs
// no `claude` on PATH while still taking visible time per node.

import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");

// Three ai nodes in a straight line. Each runs `slow.sh` (sleep ~1.2s, then echo
// stdin back), so a full run is a visible ~3.6s staircase: a runs → b runs → c runs.
// The profile cmd is the ABSOLUTE path to slow.sh — Node resolves a relative
// command against the parent process cwd, not the subprocess cwd, so `./slow.sh`
// wouldn't be found. cmdToArgv splits on whitespace; the tmpdir path has no spaces.
const flowYaml = (shPath: string) => `profiles:
  default: { cmd: '${shPath}' }
steps:
  alpha:
    type: ai
    prompt: 'alpha'
  beta:
    type: ai
    from: alpha
    prompt: 'beta {{ $json }}'
  gamma:
    type: ai
    from: beta
    prompt: 'gamma {{ $json }}'
`;

function startServer(dir: string): Promise<{ url: string; proc: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui", "flow.yaml"], { cwd: dir, env: { ...process.env, CHAIN_NO_OPEN: "1" } });
    let buf = "";
    const t = setTimeout(() => reject(new Error("server did not start:\n" + buf)), 20000);
    const onData = (d: Buffer) => {
      buf += d.toString();
      const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (m) { clearTimeout(t); resolve({ url: m[0], proc }); }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
  });
}

let proc: ChildProcess;
let baseURL: string;

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "chain-run-state-"));
  // the slow offline "model": wait, then echo whatever was piped to stdin.
  const sh = join(dir, "slow.sh");
  writeFileSync(sh, "#!/bin/sh\nsleep 1.2\ncat\n");
  chmodSync(sh, 0o755);
  writeFileSync(join(dir, "flow.yaml"), flowYaml(sh));
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

// snapshot the live run-state of the canvas in one shot, so the two counts are
// read at the SAME instant (separate auto-retrying assertions could each catch a
// different moment of the moving staircase).
const stateOf = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const d = (globalThis as any).document;
    const running = d.querySelectorAll(".node.running").length;
    return {
      running,
      pending: d.querySelectorAll(".node.pending").length,
      ran: d.querySelectorAll(".node.ran").length,
      // is the live spinner on the running node (and ONLY there)? read in the same
      // tick as the counts so the moving staircase can't slip between assertions.
      runningSpins: d.querySelectorAll(".node.running .spin").length > 0,
      pendingSpins: d.querySelectorAll(".node.pending .spin").length,
    };
  });

test("canvas: one node runs (spinner) while the rest are queued — not all at once", async ({ page }) => {
  await page.goto(baseURL);
  await expect(page.locator(".node")).toHaveCount(3);

  await page.getByRole("button", { name: "Run all" }).click();

  // THE FIX (Image #13): at the head of the staircase exactly ONE node spins
  // (live spinner) and the other two are queued WITHOUT a spinner — never three
  // spinners. The spin state is read in the same tick as the counts, so the moving
  // staircase can't slip between assertions. (The {0,3} flash before alpha starts
  // is skipped over by the poll.)
  await expect.poll(() => stateOf(page), { timeout: 8000 })
    .toEqual({ running: 1, pending: 2, ran: 0, runningSpins: true, pendingSpins: 0 });

  // the staircase advances: alpha done, beta running, gamma still queued
  await expect.poll(() => stateOf(page), { timeout: 8000 })
    .toEqual({ running: 1, pending: 1, ran: 1, runningSpins: true, pendingSpins: 0 });

  // …and it drains to all-done (no node left stuck spinning/queued)
  await expect(page.locator(".node.ran")).toHaveCount(3, { timeout: 8000 });
  await expect(page.locator(".node.running, .node.pending")).toHaveCount(0);
});

test("panel: a running node shows 'running', never the previous run's stale output", async ({ page }) => {
  await page.goto(baseURL);
  // warm the cache so `beta` has a real output on disk to (wrongly) fall back to.
  // Settled = ran OR cached (a prior test may have already populated the cache).
  await page.getByRole("button", { name: "Run all" }).click();
  await expect(page.locator(".node.ran, .node.cached")).toHaveCount(3, { timeout: 12000 });

  const beta = page.locator(".node", { has: page.locator(".nn", { hasText: /^beta$/ }) });
  await beta.dblclick();
  await expect(page.locator("#modal .modal")).toBeVisible();
  // pre-condition: the panel shows beta's PREVIOUS output (the stale result)
  await expect(page.locator("#pnOut")).toContainText("beta alpha");

  // re-run fresh from the panel; it stays open + selected, so it updates live.
  await page.getByRole("button", { name: "re-run" }).click();

  // THE FIX (Image #12): while it's queued/running the OUTPUT flips to a live
  // status — the stale "beta alpha" must NOT sit there looking like this result.
  await expect(page.locator("#pnOut")).toHaveText(/running…|queued/, { timeout: 8000 });
  await expect(page.locator("#pnOut")).not.toContainText("beta alpha");
  await expect(page.locator("#pnOutStatus")).toContainText(/running|queued/);

  // when it settles, the fresh output is back
  await expect(page.locator("#pnOut")).toContainText("beta alpha", { timeout: 8000 });
  await expect(page.locator("#pnOutStatus")).toContainText("ran");

  if (process.env.SLOWMO) await page.waitForTimeout(1200);
});
