// Browser E2E — C4 schema panel editor. An ai node's panel has a schema field;
// setting it round-trips through the YAML. Pure structural edit (no run), offline.
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

const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  gen:
    type: ai
    prompt: 'make json'
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-schema-"));
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

test("editor sets an ai node's structured-output schema from the panel (offline)", async ({ page }) => {
  await page.goto(baseURL);
  await nodeByName(page, "gen").click();
  const schema = page.locator("#tfSchema");
  await expect(schema).toHaveValue(""); // no schema to start
  await schema.fill('{"text":"string","n":"number"}');
  await dwell(page, 500);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  // re-parsed from YAML → the schema persisted (normalized JSON)
  await expect(page.locator("#tfSchema")).toHaveValue('{"text":"string","n":"number"}');
  await dwell(page, 1000);
});
