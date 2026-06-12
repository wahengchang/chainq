// Browser E2E — every NEW chain opens with a `start` trigger (input node).
// Creating a flow through the UI must produce start → draft → refine, with the
// start node being an `input` trigger (the explicit start point). Offline, no run.
// Title carries "editor" so `npm run e2e:ui:demo` (-g editor) picks it up.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");

// Start `chain ui` with NO flow arg → the create screen (pick folder, name a flow).
function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-start-"));
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui"], { cwd: dir, env: { ...process.env, CHAIN_NO_OPEN: "1" } });
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

test("editor: a new chain opens with a start trigger (input) feeding the first node", async ({ page }) => {
  await page.goto(baseURL);
  // create screen: name a flow and create it (dir is prefilled with the cwd)
  await dwell(page, 600);
  await page.locator("#name").fill("hello");
  await dwell(page, 400);
  await page.getByRole("button", { name: /Create/ }).click();

  // the editor opens on the template: start → draft → refine
  await expect(nodeByName(page, "start")).toBeVisible();
  await expect(nodeByName(page, "draft")).toBeVisible();
  await expect(nodeByName(page, "refine")).toBeVisible();
  await dwell(page, 800);

  // the start node is an `input` trigger — open it. A trigger has no prompt and no
  // upstream, so both columns are hidden; the designed default ships a `topic`
  // input field, defined right here in the panel (no raw YAML needed).
  await nodeByName(page, "start").dblclick();
  await dwell(page, 600);
  await expect(page.locator("#pnPromptCol")).toHaveClass(/hidden/); // trigger → no prompt
  await expect(page.locator("#pnFromWrap")).toHaveClass(/hidden/);  // trigger → no `from`
  await expect(page.locator("#pnParams .paramrow .pf-name")).toHaveValue("topic");
  await dwell(page, 1200);
});
