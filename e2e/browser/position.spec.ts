// Browser E2E — P3 node position persistence. Drag a node's body to reposition;
// the canvas switches to free positions and saves to /api/layout; on reload the
// layout is restored. Pure structural edit (no run), offline. Title carries
// "editor" so `npm run e2e:ui:demo` (-g editor) picks it up.

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
  a:
    type: ai
    prompt: 'x'
  b:
    type: ai
    from: a
    prompt: 'y'
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-pos-"));
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

test("editor repositions a node by dragging and persists it across reload (offline)", async ({ page }) => {
  await page.goto(baseURL);
  const a = nodeByName(page, "a");
  await expect(page.locator(".gwrap")).not.toHaveClass(/manual/); // auto column layout to start

  // drag node a's body (left-center, clear of the port/run buttons)
  const box = (await a.boundingBox())!;
  const cx = box.x + 50, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await dwell(page, 400);
  const saved = page.waitForResponse(r => r.url().includes("/api/layout") && r.request().method() === "POST");
  await page.mouse.move(cx + 150, cy + 90, { steps: 10 });
  await dwell(page, 400);
  await page.mouse.up();
  await saved; // layout POSTed to /api/layout

  await expect(page.locator(".gwrap.manual")).toHaveCount(1); // switched to free positions
  const moved = (await a.boundingBox())!;
  expect(moved.x).toBeGreaterThan(box.x + 60); // actually moved right

  // persistence: reload → layout restored from disk (still manual, node still placed)
  await page.reload();
  await expect(page.locator(".gwrap.manual")).toHaveCount(1);
  await expect(nodeByName(page, "a")).toBeVisible();
  await dwell(page, 1200);
});
