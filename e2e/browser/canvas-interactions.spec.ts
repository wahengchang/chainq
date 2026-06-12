// Browser E2E — #40 canvas interactions: output collapse (×N badge toggle),
// Shift+click multi-select + group move, and drag-empty-canvas to pan. Title
// carries "editor" so `npm run e2e:ui:demo` (-g editor) picks it up.

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

// A long linear chain → many depth columns → the graph is wide enough to overflow
// the viewport, so the pan test has somewhere to scroll. b/c are used by multi-select.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  a: { type: cmd, run: 'echo hello' }
  b: { type: cmd, from: a, run: 'cat' }
  c: { type: cmd, from: b, run: 'cat' }
  d: { type: cmd, from: c, run: 'cat' }
  e: { type: cmd, from: d, run: 'cat' }
  f: { type: cmd, from: e, run: 'cat' }
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-canvas-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW);
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui", "flow.yaml"], { cwd: dir, env: { ...process.env, CHAIN_NO_OPEN: "1" } });
    let buf = "";
    const t = setTimeout(() => reject(new Error("no start:\n" + buf)), 20000);
    const onData = (d: Buffer) => { buf += d.toString(); const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); resolve({ url: m[0], proc }); } };
    proc.stdout.on("data", onData); proc.stderr.on("data", onData);
  });
}
const dwell = (page: Page, ms: number) => (process.env.SLOWMO ? page.waitForTimeout(ms) : Promise.resolve());
const nodeByName = (page: Page, name: string) =>
  page.locator(".node", { has: page.locator(".nn", { hasText: new RegExp("^" + name + "$") }) });

let proc: ChildProcess, baseURL: string;
test.beforeAll(async () => ({ url: baseURL, proc } = await startServer()));
test.afterAll(() => proc?.kill());

test("editor hides a finished node's output until the ×N badge is clicked", async ({ page }) => {
  await page.goto(baseURL);
  const a = nodeByName(page, "a");

  // run the whole flow (cmd nodes, fully offline) → `a` outputs "hello".
  await page.getByRole("button", { name: "Run all" }).click();
  await expect(a).toHaveClass(/\bran\b/);
  await dwell(page, 400);

  // output is HIDDEN by default — the card stays compact; the ▸ toggle badge shows.
  await expect(a.locator(".nodeout")).toHaveCount(0);
  const badge = a.locator(".xn.tog");
  await expect(badge).toBeVisible();

  // click the badge → output appears with the text; click again → hidden.
  await badge.click();
  await expect(a.locator(".nodeout")).toContainText("hello");
  await dwell(page, 500);
  await a.locator(".xn.tog").click();
  await expect(a.locator(".nodeout")).toHaveCount(0);
});

test("editor Shift+click multi-selects and drags the group together", async ({ page }) => {
  await page.goto(baseURL);
  const b = nodeByName(page, "b");
  const c = nodeByName(page, "c");

  // Shift+click both → both get the selection ring; the panel does NOT open.
  await b.click({ modifiers: ["Shift"] });
  await c.click({ modifiers: ["Shift"] });
  await expect(b).toHaveClass(/selsel/);
  await expect(c).toHaveClass(/selsel/);
  await expect(page.locator("#modal")).toBeHidden();
  await dwell(page, 400);

  const b0 = (await b.boundingBox())!;
  const c0 = (await c.boundingBox())!;
  // drag `b` by a clear delta → `c` moves the same amount (group move).
  await page.mouse.move(b0.x + b0.width / 2, b0.y + b0.height / 2);
  await page.mouse.down();
  await page.mouse.move(b0.x + b0.width / 2 + 140, b0.y + b0.height / 2 + 90, { steps: 8 });
  await page.mouse.up();
  await dwell(page, 500);

  const b1 = (await b.boundingBox())!;
  const c1 = (await c.boundingBox())!;
  expect(b1.x - b0.x).toBeGreaterThan(80); // dragged node moved
  expect(c1.x - c0.x).toBeGreaterThan(80); // …and so did the other selected node
  expect(c1.y - c0.y).toBeGreaterThan(50);
});

test("editor drag on the empty canvas pans (scrolls) the view", async ({ page }) => {
  await page.goto(baseURL);
  const stage = page.locator("#nodeView");

  // zoom in so the graph overflows the viewport (something to scroll to).
  const zin = page.locator('.zoomctl button[title="zoom in (⌘ +)"]');
  for (let i = 0; i < 6; i++) await zin.click();
  await dwell(page, 400);

  const box = (await stage.boundingBox())!;
  const before = await stage.evaluate((el) => el.scrollLeft);
  // drag from the empty band BELOW the chain (it sits at the top of the graph), leftward.
  const px = box.x + box.width * 0.4, py = box.y + box.height * 0.7;
  await page.mouse.move(px, py);
  await page.mouse.down();
  await page.mouse.move(px - 240, py, { steps: 8 });
  await page.mouse.up();
  await dwell(page, 400);

  const after = await stage.evaluate((el) => el.scrollLeft);
  expect(after).toBeGreaterThan(before); // empty-canvas drag scrolled the view
});
