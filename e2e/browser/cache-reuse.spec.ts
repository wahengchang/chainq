// Browser E2E — DOES the cache actually save earlier nodes' results, so a
// second run doesn't re-pay for upstream? Title carries "editor" so the headed
// demo (`-g editor`) picks it up. Uses the offline `slow.sh` profile (sleep 1.2s
// + cat) so each node takes VISIBLE time and the timing difference is the proof:
//   • fresh full run of 3 nodes   ≈ 3.6s
//   • all-cached re-run           ≈ instant
//   • edit the LAST node + ▷ Run to here → upstream served from cache (instant),
//     only the edited node runs ≈ 1.2s  (NOT 3.6s — that's the whole point)

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");

// alpha → beta → gamma, each runs slow.sh (sleep 1.2s, echo stdin back).
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
  const dir = mkdtempSync(join(tmpdir(), "chain-cache-reuse-"));
  const sh = join(dir, "slow.sh");
  writeFileSync(sh, "#!/bin/sh\nsleep 1.2\ncat\n");
  chmodSync(sh, 0o755);
  writeFileSync(join(dir, "flow.yaml"), flowYaml(sh));
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

// wall-clock a run by waiting until all 3 nodes have SETTLED (ran or cached).
async function timeRun(page: Page, fire: () => Promise<void>): Promise<number> {
  const start = await page.evaluate(() => performance.now());
  await fire();
  await expect(page.locator(".node.ran, .node.cached")).toHaveCount(3, { timeout: 15000 });
  return (await page.evaluate(() => performance.now())) - start;
}

test("editor: cache saves earlier nodes — 2nd run is instant, not a full re-run", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(baseURL);
  await expect(page.locator(".node")).toHaveCount(3);

  // ── 1st run: everything is cold → the full ~3.6s staircase, all .ran ──────────
  const cold = await timeRun(page, () => page.getByRole("button", { name: "Run all" }).click());
  await expect(page.locator(".node.ran")).toHaveCount(3);
  await expect(page.locator(".node.cached")).toHaveCount(0);

  // ── 2nd run: nothing changed → ALL served from cache, near-instant ────────────
  const warm = await timeRun(page, () => page.getByRole("button", { name: "Run all" }).click());
  await expect(page.locator(".node.cached")).toHaveCount(3); // proof: results were saved
  await expect(page.locator(".node.ran")).toHaveCount(0);

  // the cached re-run must be DRAMATICALLY faster — earlier results were reused,
  // not recomputed. (3.6s cold vs sub-second warm; assert a generous 2x margin.)
  expect(warm).toBeLessThan(cold / 2);
  console.log(`\n  cold run (all 3 ran):   ${cold.toFixed(0)}ms\n  warm run (all cached):  ${warm.toFixed(0)}ms\n`);

  // ── edit ONLY gamma, then ▷ Execute step: alpha+beta come from cache (instant),
  //    only gamma actually runs (~0.8s, not ~2.4s) ──────────────────────────────
  await page.locator(".node", { has: page.locator(".nn", { hasText: /^gamma$/ }) }).dblclick(); // double-click opens the editor (#40 v2)
  await expect(page.locator("#modal .modal")).toBeVisible();
  await page.locator("#pnPrompt").fill("gamma EDITED {{ $json }}");
  await expect(page.locator("#pnDirty")).toBeVisible(); // ● 未儲存草稿

  const partialStart = await page.evaluate(() => performance.now());
  await page.getByRole("button", { name: "Execute step" }).click();
  // gamma settles as freshly ran; alpha+beta were never re-run (still cached).
  await expect(page.locator("#pnOutStatus")).toContainText("ran", { timeout: 8000 });
  const partial = (await page.evaluate(() => performance.now())) - partialStart;

  await expect(page.locator(".node.cached")).toHaveCount(2); // alpha + beta reused
  await expect(page.locator(".node.ran")).toHaveCount(1);    // only gamma ran
  expect(partial).toBeLessThan(cold * 0.7); // one node's time, not three
  console.log(`  edit-last + Run-to-here: ${partial.toFixed(0)}ms (only gamma ran)\n`);

  if (process.env.SLOWMO) await page.waitForTimeout(1500);
});
