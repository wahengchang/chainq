// Browser E2E — FAN-IN (多對一): a hub node takes three inputs (from: [a, b, c]).
// Clicking the × on the b → hub wire deletes ONLY that edge — a and c stay wired, hub
// stays valid. Removing one of several inputs is a clean delete (no orphaned ref), so
// it lands with an "ok" message, not a ⚠ warning. Offline: edits only, no `claude`.

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

// a, b, c all feed `hub` → three solid data-flow wires fan IN to one node.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  a:
    type: ai
    prompt: 'produce A'
  b:
    type: ai
    prompt: 'produce B'
  c:
    type: ai
    prompt: 'produce C'
  hub:
    type: ai
    from: [a, b, c]
    prompt: 'combine all three inputs'
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
  const dir = mkdtempSync(join(tmpdir(), "chain-delete-edge-fanin-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW);
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

test("fan-in: the × deletes one of several inputs, leaving the other two wired", async ({ page }) => {
  await page.goto(baseURL);
  const slow = process.env.SLOWMO ? 700 : 0;

  // baseline: three solid wires fan into hub; the middle one (b → hub) has its × control.
  const wires = page.locator("svg.wires path:not(.refwire)");
  await expect(wires).toHaveCount(3);
  const del = page.locator('.wins.wdel[title="delete the connection b → hub"]');
  await expect(del).toHaveCount(1);

  // reveal the midpoint controls (opacity:0 until canvas hover), then land on the ×.
  await page.locator("#graph").hover();
  await page.waitForTimeout(slow);
  await del.hover();
  await page.waitForTimeout(slow);

  // THE FEATURE: delete ONLY the b → hub edge.
  await del.click();
  await page.waitForTimeout(slow);

  // 1) one wire gone, the other two remain.
  await expect(wires).toHaveCount(2);
  // 2) clean delete — confirmed, no ⚠ (removing one of several inputs breaks nothing).
  await expect(page.locator("#canvasMsg")).toContainText("Removed link b → hub");
  // 3) hub is still valid (it still has a and c as inputs).
  await expect(nodeByName(page, "hub")).not.toHaveClass(/invalid/);

  // 4) hub's panel proves exactly which input went: a and c stay, b is gone.
  await nodeByName(page, "hub").dblclick();
  await expect(page.locator("#modal .modal")).toBeVisible();
  await expect(page.locator("#pnWire .chip", { hasText: "a" })).toHaveCount(1);
  await expect(page.locator("#pnWire .chip", { hasText: "c" })).toHaveCount(1);
  await expect(page.locator("#pnWire .chip", { hasText: /^b$/ })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // persist: the removal survives a reload.
  await page.reload();
  await expect(page.locator("svg.wires path:not(.refwire)")).toHaveCount(2);

  if (process.env.SLOWMO) await page.waitForTimeout(1500);
});
