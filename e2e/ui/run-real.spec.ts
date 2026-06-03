// Browser E2E with the REAL profile (claude -p). Forces a fresh run via the
// ↻ re-run button so the cache can't serve it — the only way the OUTPUT badge
// can read "✓ ran · called the model" is if the `claude -p` subprocess actually
// executed. Skipped automatically if `claude` isn't on PATH (e.g. CI).

import { test, expect } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");
const USER_FLOW = join(REPO, "test060316.yaml");

const haveClaude = spawnSync("which", ["claude"]).status === 0;

function startServer(dir: string): Promise<{ url: string; proc: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui", "flow.yaml"], { cwd: dir });
    let buf = "";
    const t = setTimeout(() => reject(new Error("server did not start:\n" + buf)), 20000);
    const onData = (d: Buffer) => {
      buf += d.toString();
      const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (m) {
        clearTimeout(t);
        resolve({ url: m[0], proc });
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
  });
}

let proc: ChildProcess;
let baseURL: string;

test.beforeAll(async () => {
  test.skip(!haveClaude, "`claude` CLI not found on PATH");
  const dir = mkdtempSync(join(tmpdir(), "chain-uireal-"));
  copyFileSync(USER_FLOW, join(dir, "flow.yaml"));
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

test("↻ re-run with the real profile actually calls claude -p", async ({ page }) => {
  test.skip(!haveClaude, "`claude` CLI not found on PATH");
  test.setTimeout(120000); // a real model call takes a few seconds

  await page.goto(baseURL);
  await expect(page.locator(".node").first()).toBeVisible();

  // the REAL profile (value="" → "default (claude -p)")
  await page.locator("#profile").selectOption({ value: "" });

  // open the first node and force a fresh run (ignores cache → must call the cmd)
  await page.locator(".node").first().click();
  await expect(page.locator(".modal")).toBeVisible();

  // capture proof the subprocess spawned: poll `pgrep claude` while it runs
  let sawProcess = false;
  const poll = setInterval(() => {
    if (spawnSync("pgrep", ["-f", "claude"]).status === 0) sawProcess = true;
  }, 200);

  await page.getByRole("button", { name: /re-run/ }).click();

  // the badge must say it RAN (called the model) — NOT cached
  await expect(page.locator("#pnOutStatus")).toContainText("called the model", { timeout: 90000 });
  clearInterval(poll);

  // and there must be real output text
  const out = page.locator("#pnOut");
  await expect(out).not.toHaveText("running…");
  await expect(out).not.toBeEmpty();

  expect(sawProcess, "a `claude` process should have been spawned during the run").toBe(true);
});
