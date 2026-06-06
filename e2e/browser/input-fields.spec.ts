// Browser E2E — defining an input node's FIELDS from the panel (no raw YAML).
// The missing "where do I set inputs" surface: click + add field, name/type/default,
// Save → it persists to `params` and the run-time form picks it up. Offline, no run.
// Title carries "editor" so `npm run e2e:ui:demo` (-g editor) picks it up.

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

// a flow whose start trigger has NO fields yet — the empty state a user must escape.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  start: { type: input, params: {} }
  draft: { type: ai, from: start, prompt: 'about {{ $json.topic }}' }
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-fields-"));
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

test("editor: define an input node's fields from the panel, no raw YAML", async ({ page }) => {
  await page.goto(baseURL);
  await nodeByName(page, "start").click();
  await dwell(page, 600);

  // empty state: no field rows yet, but a clear "+ add field" affordance
  await expect(page.locator("#pnParams .paramrow")).toHaveCount(0);
  await page.getByRole("button", { name: "+ add field" }).click();
  await dwell(page, 500);

  // fill the new field: name=topic, type=string, default=chains
  const row = page.locator("#pnParams .paramrow").first();
  await row.locator(".pf-name").fill("topic");
  await dwell(page, 300);
  await row.locator(".pf-type").selectOption("string");
  await row.locator(".pf-def").fill("chains");
  await dwell(page, 500);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await dwell(page, 600);

  // close, then re-open from the canvas: the field persisted to `params`
  // (round-tripped through YAML) AND the run-time value form now offers it
  // (proving the saved definition drives the run form).
  await page.getByRole("button", { name: /close/ }).click();
  await dwell(page, 400);
  await nodeByName(page, "start").click();
  await dwell(page, 400);
  await expect(page.locator("#pnParams .paramrow .pf-name")).toHaveValue("topic");
  await expect(page.locator("#pnParams .paramrow .pf-def")).toHaveValue("chains");
  await expect(page.locator("#pnInput")).toContainText("topic"); // run-time form picked it up
  await dwell(page, 1200);
});
