// Browser E2E — per-node `timeout` (seconds) set from the node panel. ai/cmd
// nodes spawn a subprocess, so they carry a timeout that overrides the flow
// default. Pure structural edit (no run), fully offline. Title carries "editor"
// so `npm run e2e:ui:demo` (-g editor) picks it up.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
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
  gen:
    type: ai
    prompt: 'write a whole article'
  shell:
    type: cmd
    from: gen
    run: 'cat'
`;

let flowPath = "";

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-timeout-"));
  flowPath = join(dir, "flow.yaml");
  writeFileSync(flowPath, FLOW);
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

test("editor sets a per-node timeout via the ◷ clock — round-trips through YAML", async ({ page }) => {
  await page.goto(baseURL);
  const clock = page.locator("#pnTimeoutBtn");
  const box = page.locator("#tfTimeout");

  // ai node `gen`: the ◷ clock shows in the INPUT header; the box is collapsed.
  await nodeByName(page, "gen").click();
  await expect(clock).toBeVisible();
  await expect(box).toBeHidden();
  await dwell(page, 400);

  // click the clock → the box opens; set 1200s; the clock label live-updates.
  await clock.click();
  await expect(box).toBeVisible();
  await box.fill("1200");
  await expect(clock).toHaveText(/1200s/);
  await dwell(page, 500);

  // Save → lands in the YAML as a number; re-render collapses but the clock still
  // shows the value (no need to open it to see a timeout is set).
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await expect(clock).toHaveText(/1200s/);
  await expect(box).toBeHidden();
  expect(readFileSync(flowPath, "utf8")).toMatch(/timeout:\s*1200/);
  await dwell(page, 500);

  // cmd node `shell` carries the clock too (it also spawns a subprocess).
  await page.keyboard.press("Escape"); // close gen's panel before switching nodes
  await dwell(page, 300);
  await nodeByName(page, "shell").click();
  await expect(clock).toBeVisible();
  await clock.click();
  await box.fill("45");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await expect(clock).toHaveText(/45s/);

  // clear `gen`'s timeout → it falls back to the flow default; the clock goes bare.
  await page.keyboard.press("Escape"); // close shell's panel before switching nodes
  await dwell(page, 300);
  await nodeByName(page, "gen").click();
  await expect(clock).toHaveText(/1200s/);
  await clock.click();
  await box.fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await expect(clock).toHaveText("◷"); // bare clock = no timeout set
});

test("editor sets a flow-wide default timeout via the ◷ flow clock in the bar", async ({ page }) => {
  await page.goto(baseURL);
  const flowClock = page.locator("#flowTimeoutBtn");
  const pop = page.locator("#flowTimeoutPop");

  // the ◷ Timeout clock sits in the top bar; bare when no flow default is set.
  await expect(flowClock).toHaveText("◷ Timeout");
  await expect(pop).toBeHidden();
  await dwell(page, 400);

  // click → popover opens; set 600s and 套用 → writes flow.defaults.timeout.
  await flowClock.click();
  await expect(pop).toBeVisible();
  await page.locator("#flowTimeoutInput").fill("600");
  await dwell(page, 400);
  await page.getByRole("button", { name: "套用" }).click();
  await expect(pop).toBeHidden();
  await expect(flowClock).toHaveText("◷ Timeout 600s");
  expect(readFileSync(flowPath, "utf8")).toMatch(/defaults:\s*\n\s*timeout:\s*600/);
  await dwell(page, 500);

  // clear it → flow falls back to the built-in 300; the clock goes bare and the
  // `defaults:` block is pruned from the YAML.
  await flowClock.click();
  await page.locator("#flowTimeoutInput").fill("");
  await page.getByRole("button", { name: "套用" }).click();
  await expect(flowClock).toHaveText("◷ Timeout");
  expect(readFileSync(flowPath, "utf8")).not.toMatch(/defaults:/);
});
