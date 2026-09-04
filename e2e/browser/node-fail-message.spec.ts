// Browser E2E — a FAILED node shows WHY it failed. Guards two regressions:
//  1. OUTPUT panel: a failed run must show its error, not the stale last-cached
//     output (/api/items serves the old .out, which used to paint over the error).
//  2. Canvas card: a failed node shows its error reason inline (no expand needed).
// Fully offline: a `cmd` node that first succeeds (caches output) then is edited to
// a failing command. Title carries "editor" so the demo filter picks it up.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");

const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  start: { type: input, params: {} }
  boom:  { type: cmd, from: start, run: 'echo OKVALUE' }
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-fail-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW);
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui", "flow.yaml"], { cwd: dir, env: { ...process.env, CHAIN_NO_OPEN: "1" } });
    let buf = "";
    const t = setTimeout(() => reject(new Error("no start:\n" + buf)), 20000);
    const on = (d: Buffer) => { buf += d.toString(); const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); resolve({ url: m[0], proc }); } };
    proc.stdout.on("data", on); proc.stderr.on("data", on);
  });
}
const dwell = (page: Page, ms: number) => (process.env.SLOWMO ? page.waitForTimeout(ms) : Promise.resolve());
const nodeByName = (page: Page, name: string) =>
  page.locator(".node", { has: page.locator(".nn", { hasText: new RegExp("^" + name + "$") }) });

let proc: ChildProcess, baseURL: string;
test.beforeAll(async () => ({ url: baseURL, proc } = await startServer()));
test.afterAll(() => proc?.kill());

test("editor: a failed node shows its error, not the stale cached output", async ({ page }) => {
  await page.goto(baseURL);
  await dwell(page, 500);

  // 1. run boom once → it succeeds and caches "OKVALUE"
  await nodeByName(page, "boom").dblclick();
  await page.getByRole("button", { name: /Execute step/ }).click();
  await expect(page.locator("#pnOut")).toContainText("OKVALUE");
  await dwell(page, 600);

  // 2. edit the command to one that fails, save it
  await page.locator("#pnPrompt").fill("false");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await dwell(page, 400);

  // 3. force-execute → it fails
  await page.getByRole("button", { name: /Force execute/ }).click();
  await expect(page.locator("#pnOutStatus")).toContainText("failed");
  await dwell(page, 600);

  // 4. the OUTPUT panel shows the ERROR, NOT the stale "OKVALUE" from the cached .out
  await expect(page.locator("#pnOut")).not.toContainText("OKVALUE"); // masking regression guard
  await expect(page.locator("#pnOut")).toContainText("exit");        // the real failure reason

  // 5. the canvas card surfaces the reason inline (collapsed output, no expand needed)
  await page.keyboard.press("Escape");
  await dwell(page, 300);
  const boom = nodeByName(page, "boom");
  await expect(boom).toHaveClass(/failed/);
  await expect(boom.locator(".nwarn")).toContainText("exit");
  await dwell(page, 800);
});
