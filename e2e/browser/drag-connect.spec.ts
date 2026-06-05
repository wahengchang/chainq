// Browser E2E — P2-b drag-to-connect. Drag a node's output port onto another
// node to wire it (→ /api/connect), instead of typing a comma-separated `from`.
// Pure structural edit (no run), fully offline. Title carries "editor" so
// `npm run e2e:ui:demo` (-g editor) picks it up.

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
    prompt: 'y'
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-drag-"));
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

test("editor connects two nodes by dragging the output port (offline)", async ({ page }) => {
  await page.goto(baseURL);
  const a = nodeByName(page, "a");
  const b = nodeByName(page, "b");
  await expect(page.locator(".node")).toHaveCount(2);
  await expect(b).not.toContainText("from ["); // unconnected to start

  // hover `a` to reveal its port, then drag the port onto `b`
  await a.hover();
  const port = a.locator(".port");
  const pb = (await port.boundingBox())!;
  const bb = (await b.boundingBox())!;
  await page.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2);
  await page.mouse.down();
  await dwell(page, 400);
  await page.mouse.move(pb.x + 60, pb.y + 20, { steps: 4 }); // drag out (temp wire follows)
  await dwell(page, 400);
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 8 });
  await dwell(page, 400);
  await page.mouse.up();

  // b is now wired from a — the card shows it and the canvas re-rendered
  await expect(b).toContainText("from [a]");
  await expect(page.locator("#canvasMsg")).toContainText("connected");
  await dwell(page, 1200);
});
