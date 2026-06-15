// Browser E2E — the node panel (modal) must stay centered in the VIEWPORT no matter
// how far the canvas is scrolled/panned. Bug: `.modal` was position:absolute inside the
// scrolling stage, so top/left:50% anchored to the stage's un-scrolled origin — once you
// scrolled right/down to reach a node, the modal drifted off-screen (left / partly hidden).
// A wide chain forces horizontal scroll; opening the last node must still center the modal.

import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");

// a → b → … → h: eight columns make the canvas wider than the viewport, so reaching
// `h` requires scrolling the stage right (the condition that exposed the drift).
const IDS = ["a", "b", "c", "d", "e", "f", "g", "h"];
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
${IDS.map((id, i) => `  ${id}:
    type: ai
${i === 0 ? "" : `    from: ${IDS[i - 1]}\n`}    prompt: 'step ${id}'`).join("\n")}
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

let proc: ChildProcess, baseURL: string;
test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "chain-modal-position-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW);
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

test("the node panel stays centered in the viewport even when the canvas is scrolled", async ({ page }) => {
  await page.goto(baseURL);
  const slow = process.env.SLOWMO ? 700 : 0;
  const vp = page.viewportSize()!;

  // scroll the canvas to the far right + bottom (as if panning to a node off the
  // initial view) — this is the state that used to throw the modal off-screen.
  await page.locator("#nodeView").evaluate((s) => { s.scrollLeft = s.scrollWidth; s.scrollTop = s.scrollHeight; });
  await page.waitForTimeout(slow);

  // open the last node's panel.
  const h = page.locator(".node", { has: page.locator(".nn", { hasText: /^h$/ }) });
  await h.dblclick();
  await expect(page.locator("#modal .modal")).toBeVisible();
  await page.waitForTimeout(slow);

  // measure the modal against the viewport: its center must sit near the viewport
  // center, and it must be fully on-screen (no negative/overflowing edges).
  const box = (await page.locator("#modal .modal").boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // eslint-disable-next-line no-console
  console.log(`viewport ${vp.width}x${vp.height} | modal box`, box, `center (${cx},${cy})`);

  // centered within 5% of the viewport in each axis
  expect(Math.abs(cx - vp.width / 2)).toBeLessThan(vp.width * 0.05);
  expect(Math.abs(cy - vp.height / 2)).toBeLessThan(vp.height * 0.05);
  // fully visible: every edge inside the viewport
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height + 1);

  if (process.env.SLOWMO) await page.waitForTimeout(1500);
});
