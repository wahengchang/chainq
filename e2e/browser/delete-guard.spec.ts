// Browser E2E — the editor's `delete` button is GUARDED: a step that something
// downstream still depends on can't be deleted (deleting it would orphan the
// dependent's `from:`). This reproduces the reported symptom — clicking `delete`
// on such a node does nothing visible to the canvas; the panel stays open and an
// error explains why. The escape hatch: delete/rewire the dependent first, then
// the node deletes cleanly. Offline (no run). Title carries "editor" so
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

// a → b: `b` depends on `a`, so `a` is NOT a leaf and must not be deletable.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  a:
    type: ai
    prompt: 'x'
  b:
    type: assemble
    from: a
    prompt: '{{ $json }}'
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-del-"));
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

test("editor refuses to delete a node a downstream step depends on, deletes once it's a leaf", async ({ page }) => {
  await page.goto(baseURL);
  const panel = page.locator("#modal .modal"); // the floating panel itself (the #modal wrapper is zero-size)
  const msg = page.locator("#pnMsg");
  const del = () => page.getByRole("button", { name: "delete" }).click();

  // both nodes are on the canvas to start
  await expect(nodeByName(page, "a")).toHaveCount(1);
  await expect(nodeByName(page, "b")).toHaveCount(1);
  await dwell(page, 500);

  // THE REPORTED BUG: open `a` (which `b` depends on) and hit delete.
  await nodeByName(page, "a").click();
  await expect(panel).toBeVisible();
  await dwell(page, 600);
  await del();
  // delete is REFUSED: an error explains why, the panel stays open, `a` survives.
  await expect(msg).toContainText("depends");
  await expect(panel).toBeVisible();
  await expect(nodeByName(page, "a")).toHaveCount(1);
  await dwell(page, 800);

  // ESCAPE HATCH: `b` is a leaf → it deletes. Panel closes, `b` leaves the canvas.
  await page.keyboard.press("Escape");
  await nodeByName(page, "b").click();
  await expect(panel).toBeVisible();
  await dwell(page, 500);
  await del();
  await expect(panel).toBeHidden();
  await expect(nodeByName(page, "b")).toHaveCount(0);
  await dwell(page, 600);

  // now `a` has no dependents → it deletes cleanly too.
  await nodeByName(page, "a").click();
  await expect(panel).toBeVisible();
  await dwell(page, 500);
  await del();
  await expect(panel).toBeHidden();
  await expect(nodeByName(page, "a")).toHaveCount(0);
  await dwell(page, 800);
});
