// Browser E2E — deleting a node that a downstream step still references. The
// delete is FORCED: it always lands, and the now-dangling step is flagged red
// (⚠) on canvas plus a canvas message names what broke — instead of blocking the
// delete. Title carries "editor" so `npm run e2e:ui:demo` (-g editor) picks it up.

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

// src → mid → tail. Deleting `mid` leaves `tail.from: mid` dangling → tail breaks.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  src:
    type: input
    params:
      msg: { default: hi }
  mid:
    type: assemble
    from: src
    prompt: '{{ $json.msg }}'
  tail:
    type: assemble
    from: mid
    prompt: 'use {{ $json }}'
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-del-"));
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

test("editor force-deletes a depended-on node: it goes, the dependent turns red ⚠, canvas names the breakage", async ({ page }) => {
  await page.goto(baseURL);
  const mid = nodeByName(page, "mid");
  const tail = nodeByName(page, "tail");
  await expect(mid).toBeVisible();
  await expect(tail).toBeVisible();
  await dwell(page, 700);

  // open `mid`'s panel and hit delete — previously this was REJECTED (tail depends on it)
  await mid.click();
  await expect(page.locator("#pnId")).toHaveValue("mid");
  await dwell(page, 700);
  await page.getByRole("button", { name: /^delete$/ }).click();

  // 1) the node is actually gone
  await expect(nodeByName(page, "mid")).toHaveCount(0);
  await dwell(page, 700);

  // 2) the dependent is flagged broken — red card + inline ⚠ naming the dead ref
  await expect(tail).toHaveClass(/invalid/);
  await expect(tail.locator(".nwarn")).toContainText('from: "mid" does not exist');

  // 3) the canvas message names what broke (breakage isn't silent)
  await expect(page.locator("#canvasMsg")).toContainText("已刪除「mid」");
  await expect(page.locator("#canvasMsg")).toContainText("tail");
  await page.screenshot({ path: "test-results/delete-node-broken.png", fullPage: true });
  await dwell(page, 1400);
});
