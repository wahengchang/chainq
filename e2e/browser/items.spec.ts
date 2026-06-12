// Browser E2E — P1-b per-item panel. After a fan-out run, the node panel SHOWS
// the items model item by item (×N + each item's value), not just a flattened
// blob. input → splitOut produces 3 items with no model call, so this is fully
// offline. Title carries "editor" so `npm run e2e:ui:demo` (-g editor) picks it up.

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

// input emits one seed item whose `list` default is a 3-element array; splitOut
// fans it into 3 items. No `claude` needed.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  seed:
    type: input
    params:
      list: { default: [alpha, beta, gamma] }
  fan:
    type: splitOut
    from: seed
    field: list
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-items-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW);
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui", "flow.yaml"], { cwd: dir, env: { ...process.env, CHAIN_NO_OPEN: "1" } });
    let buf = "";
    const t = setTimeout(() => reject(new Error("server did not start:\n" + buf)), 20000);
    const onData = (d: Buffer) => {
      buf += d.toString();
      const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (m) { clearTimeout(t); resolve({ url: m[0], proc }); }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
  });
}
const dwell = (page: Page, ms: number) => (process.env.SLOWMO ? page.waitForTimeout(ms) : Promise.resolve());

let proc: ChildProcess, baseURL: string;
test.beforeAll(async () => ({ url: baseURL, proc } = await startServer()));
test.afterAll(() => proc?.kill());

test("editor shows the items model per item after a fan-out run (offline)", async ({ page }) => {
  await page.goto(baseURL);
  const fan = page.locator(".node", { has: page.locator(".nn", { hasText: /^fan$/ }) });
  await expect(fan.locator(".ntype")).toContainText("split out");

  // open the splitOut node panel and run to here (offline) — the ×N badge + the
  // per-item breakdown appear from /api/items
  await fan.click();
  await page.getByRole("button", { name: /Execute step/ }).click();

  const out = page.locator("#pnOut");
  await expect(out).toContainText("×3 items");
  await expect(out).toContainText("alpha");
  await expect(out).toContainText("gamma");
  await expect(out.locator(".itemrow")).toHaveCount(3); // one row per item
  await dwell(page, 1500);
});
