// Browser E2E — P2-a type-specific editor. splitOut/aggregate `field`, merge
// `mode`/`key`, cmd `mode` can be set from the node panel instead of dropping to
// raw YAML. Pure structural edits (no run), fully offline. Title carries "editor"
// so `npm run e2e:ui:demo` (-g editor) picks it up.

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
  src:
    type: ai
    prompt: 'x'
  fork:
    type: splitOut
    from: src
  mrg:
    type: merge
    from: [src, fork]
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-type-"));
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

test("editor sets type-specific fields from the panel (splitOut field, merge mode+key) — no raw YAML", async ({ page }) => {
  await page.goto(baseURL);

  // splitOut: set `field` in the panel, Save → it round-trips through the YAML
  await nodeByName(page, "fork").click();
  await page.locator("#tfField").fill("items");
  await dwell(page, 500);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await expect(page.locator("#tfField")).toHaveValue("items"); // re-parsed from YAML
  await page.keyboard.press("Escape");
  await dwell(page, 400);

  // merge: switch mode to byKey → the key field appears → set it → Save
  await nodeByName(page, "mrg").click();
  await expect(page.locator("#tfKeyWrap")).toHaveClass(/hidden/); // append → key hidden
  await page.locator("#tfMode").selectOption("byKey");
  await expect(page.locator("#tfKeyWrap")).not.toHaveClass(/hidden/);
  await page.locator("#tfKey").fill("id");
  await dwell(page, 500);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await expect(page.locator("#tfMode")).toHaveValue("byKey"); // persisted
  await expect(page.locator("#tfKey")).toHaveValue("id");
  await dwell(page, 1000);
});
