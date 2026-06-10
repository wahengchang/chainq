// Browser E2E — canvas zoom. Big graphs get unmanageable; the floating control
// (− / 100% / + / ⤢fit) scales the whole canvas. The real test isn't that it
// shrinks — it's that wiring stays pixel-exact AT a zoom level, so we drag-connect
// two nodes while zoomed out and assert the wire lands. Pure structural edit (no
// run), offline. Title carries "editor" so `npm run e2e:ui:demo` (-g editor) picks it up.

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

// a fan-out + a couple of loose nodes — enough that zooming out is meaningful and
// there's an unwired pair (c, d) to connect under zoom.
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
  c:
    type: ai
    prompt: 'z'
  d:
    type: ai
    prompt: 'w'
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-zoom-"));
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

test("editor zooms the canvas and stays wire-accurate when connecting at zoom (offline)", async ({ page }) => {
  await page.goto(baseURL);
  await expect(page.locator(".node")).toHaveCount(4);

  const zoomOut = page.locator(".zoomctl button").nth(0);
  const zoomLbl = page.locator("#zoomLbl");
  const zoomIn = page.locator(".zoomctl button").nth(2);
  const zoomFit = page.locator(".zoomctl button").nth(3);
  await expect(zoomLbl).toHaveText("100%"); // starts at 1:1

  // graph width AT 100% — we'll prove the next zooms actually shrink the render.
  const w100 = (await page.locator("#graph").boundingBox())!.width;

  // ── zoom OUT three steps → 70%, render visibly smaller ──────────────────────
  for (let i = 0; i < 3; i++) { await zoomOut.click(); await dwell(page, 350); }
  await expect(zoomLbl).toHaveText("70%");
  const w70 = (await page.locator("#graph").boundingBox())!.width;
  expect(w70).toBeLessThan(w100 * 0.85); // genuinely scaled down (~0.7×)

  // ── connect c → d WHILE zoomed out — the real correctness check ─────────────
  const c = nodeByName(page, "c");
  const d = nodeByName(page, "d");
  await expect(d).not.toContainText("from ["); // loose to start
  await c.hover();
  const port = c.locator(".port");
  const pb = (await port.boundingBox())!;
  const db = (await d.boundingBox())!;
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.down();
  await dwell(page, 400);
  await page.mouse.move(pb.x + 40, pb.y + 14, { steps: 4 }); // drag out — temp wire follows the cursor
  await dwell(page, 400);
  await page.mouse.move(db.x + db.width / 2, db.y + db.height / 2, { steps: 8 });
  await dwell(page, 400);
  await page.mouse.up();
  // landed on d despite the scale → coordinate math is zoom-correct
  await expect(d).toContainText("from [c]");
  await expect(page.locator("#canvasMsg")).toContainText("connected");
  await dwell(page, 800);

  // ── zoom IN past 100% → render grows ────────────────────────────────────────
  for (let i = 0; i < 4; i++) { await zoomIn.click(); await dwell(page, 300); }
  await expect(zoomLbl).toHaveText("110%"); // 70% + 4×10
  expect((await page.locator("#graph").boundingBox())!.width).toBeGreaterThan(w70);

  // ── fit → graph ends up inside the viewport; reset → back to exactly 1:1 ─────
  await zoomFit.click();
  await dwell(page, 500);
  const stageW = (await page.locator("#nodeView").boundingBox())!.width;
  expect((await page.locator("#graph").boundingBox())!.width).toBeLessThanOrEqual(stageW + 1);
  await zoomLbl.click(); // the label IS the reset button
  await expect(zoomLbl).toHaveText("100%");
  await expect.poll(async () => (await page.locator("#graph").boundingBox())!.width).toBeCloseTo(w100, -1);
  await dwell(page, 1200);
});
