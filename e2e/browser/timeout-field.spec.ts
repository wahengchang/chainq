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

test("editor sets a per-node timeout (seconds) from the panel — round-trips through YAML", async ({ page }) => {
  await page.goto(baseURL);

  // ai node `gen`: the timeout field shows, starts empty (no timeout set yet).
  await nodeByName(page, "gen").click();
  await expect(page.locator("#tfTimeout")).toHaveValue("");
  await dwell(page, 400);

  // set 1200s (a long article) and Save → it lands in the YAML as a number.
  await page.locator("#tfTimeout").fill("1200");
  await dwell(page, 500);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await expect(page.locator("#tfTimeout")).toHaveValue("1200"); // re-parsed from YAML
  expect(readFileSync(flowPath, "utf8")).toMatch(/timeout:\s*1200/);
  await dwell(page, 500);

  // cmd node `shell` carries the field too (it also spawns a subprocess).
  await page.keyboard.press("Escape"); // close gen's panel before switching nodes
  await dwell(page, 300);
  await nodeByName(page, "shell").click();
  await expect(page.locator("#tfTimeout")).toHaveValue("");
  await page.locator("#tfTimeout").fill("45");
  await dwell(page, 400);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await expect(page.locator("#tfTimeout")).toHaveValue("45");

  // clear `gen`'s timeout → it falls back to the flow default (field empty again,
  // and the YAML no longer pins a number for it).
  await page.keyboard.press("Escape"); // close shell's panel before switching nodes
  await dwell(page, 300);
  await nodeByName(page, "gen").click();
  await expect(page.locator("#tfTimeout")).toHaveValue("1200");
  await page.locator("#tfTimeout").fill("");
  await dwell(page, 400);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await expect(page.locator("#tfTimeout")).toHaveValue("");
});
