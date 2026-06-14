// Browser E2E demo — examples/generate-json.yaml.
//   trigger → field_a / field_b / field_c → to_json(ai+schema) → result(write .json)
// Drives the REAL editor: opens the shipped example, runs the whole chain with the
// real model, and proves the `write` node produced a valid JSON file on disk.
// Title carries "editor" so `npm run e2e:ui:demo` (-g editor) picks it up.
// Skipped automatically if `claude` isn't on PATH (e.g. CI).

import { test, expect, type Page } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");
const EXAMPLE = join(REPO, "examples", "generate-json.yaml");

const haveClaude = spawnSync("which", ["claude"]).status === 0;

let dir: string;
function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  dir = mkdtempSync(join(tmpdir(), "chain-genjson-"));
  copyFileSync(EXAMPLE, join(dir, "flow.yaml")); // run the SHIPPED example verbatim
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
test.beforeAll(async () => {
  test.skip(!haveClaude, "`claude` CLI not found on PATH");
  ({ url: baseURL, proc } = await startServer());
});
test.afterAll(() => proc?.kill());

test("editor generates a JSON file: write node emits valid JSON to disk (real model)", async ({ page }) => {
  test.skip(!haveClaude, "`claude` CLI not found on PATH");
  test.setTimeout(180000); // three real model calls

  await page.goto(baseURL);
  await expect(page.locator(".node").first()).toBeVisible();

  // the three field branches + the write 成品 are all on the canvas
  await expect(nodeByName(page, "field_a")).toBeVisible();
  await expect(nodeByName(page, "field_b")).toBeVisible();
  await expect(nodeByName(page, "field_c")).toBeVisible();
  const result = nodeByName(page, "result");
  await expect(result.locator(".ntype")).toContainText("write");

  // open the write node → it targets a .json file
  await result.dblclick();
  await expect(page.locator("#tfPath")).toHaveValue("out/result.json");
  await dwell(page, 800);
  await page.keyboard.press("Escape");

  // run the whole chain with the real model
  await page.getByRole("button", { name: /Run all/ }).click();

  // the write node's output (collapsed by #40) holds the JSON it wrote. The toggle
  // only appears once the node has output (i.e. the run reached it), so waiting for
  // it doubles as "the chain finished". Then expand to read the JSON.
  await expect(result.locator(".xn.tog")).toBeVisible({ timeout: 150000 });
  await result.locator(".xn.tog").click();
  await expect(result.locator(".outbadge")).toContainText(/ran|cached/);
  await expect(result.locator(".nodeout")).toContainText('"original"');
  await expect(result.locator(".nodeout")).toContainText('"zh_tw"');
  await expect(result.locator(".nodeout")).toContainText('"japanese"');
  await dwell(page, 1500);

  // prove it on disk: the written file parses as JSON with the three fields
  const file = join(dir, "out", "result.json");
  expect(existsSync(file), `${file} should exist`).toBe(true);
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  expect(parsed).toHaveProperty("original");
  expect(parsed).toHaveProperty("zh_tw");
  expect(parsed).toHaveProperty("japanese");
});
