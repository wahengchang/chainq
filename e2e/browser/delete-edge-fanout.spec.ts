// Browser E2E — FAN-OUT (一對多): one source feeds three downstream branches
// (src → x, src → y, src → z). Clicking the × on the src → y wire deletes ONLY that
// branch — x and z stay wired, y just becomes unwired (a legit work-in-progress, like
// a freshly added node), so it's a clean delete with no ⚠. Offline: edits only.

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

// src fans OUT to x, y, z → three solid data-flow wires from one node.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  src:
    type: ai
    prompt: 'seed the branches'
  x:
    type: ai
    from: src
    prompt: 'branch X'
  y:
    type: ai
    from: src
    prompt: 'branch Y'
  z:
    type: ai
    from: src
    prompt: 'branch Z'
`;

function startServer(dir: string): Promise<{ url: string; proc: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui", "flow.yaml"], { cwd: dir, env: { ...process.env, CHAIN_NO_OPEN: "1" } });
    let buf = "";
    const t = setTimeout(() => reject(new Error("server did not start:\n" + buf)), 20000);
    const on = (d: Buffer) => { buf += d.toString(); const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); resolve({ url: m[0], proc }); } };
    proc.stdout.on("data", on); proc.stderr.on("data", on);
  });
}
const nodeByName = (page: Page, name: string) =>
  page.locator(".node", { has: page.locator(".nn", { hasText: new RegExp("^" + name + "$") }) });

let proc: ChildProcess, baseURL: string;
test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "chain-delete-edge-fanout-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW);
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

test("fan-out: the × deletes one of several branches, leaving the other two wired", async ({ page }) => {
  await page.goto(baseURL);
  const slow = process.env.SLOWMO ? 700 : 0;

  // baseline: three solid wires fan out of src; the middle branch (src → y) has its ×.
  const wires = page.locator("svg.wires path:not(.refwire)");
  await expect(wires).toHaveCount(3);
  const del = page.locator('.wins.wdel[title="delete the connection src → y"]');
  await expect(del).toHaveCount(1);

  // reveal the midpoint controls (opacity:0 until canvas hover), then land on the ×.
  await page.locator("#graph").hover();
  await page.waitForTimeout(slow);
  await del.hover();
  await page.waitForTimeout(slow);

  // THE FEATURE: delete ONLY the src → y branch.
  await del.click();
  await page.waitForTimeout(slow);

  // 1) one wire gone, the other two branches remain.
  await expect(wires).toHaveCount(2);
  // 2) clean delete — confirmed, no ⚠ (y had no dependents and references nothing).
  await expect(page.locator("#canvasMsg")).toContainText("已刪除連線 src → y");
  // 3) y is now unwired but valid (its prompt uses no $json), not flagged broken.
  await expect(nodeByName(page, "y")).not.toHaveClass(/invalid/);

  // 4) y's panel proves the branch is gone: it no longer lists src as an input.
  await nodeByName(page, "y").dblclick();
  await expect(page.locator("#modal .modal")).toBeVisible();
  await expect(page.locator("#pnWire .chip", { hasText: "src" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // 5) x and z still take src — open x and confirm its input survived untouched.
  await nodeByName(page, "x").dblclick();
  await expect(page.locator("#pnWire .chip", { hasText: "src" })).toHaveCount(1);
  await page.keyboard.press("Escape");

  // persist: the removal survives a reload.
  await page.reload();
  await expect(page.locator("svg.wires path:not(.refwire)")).toHaveCount(2);

  if (process.env.SLOWMO) await page.waitForTimeout(1500);
});
