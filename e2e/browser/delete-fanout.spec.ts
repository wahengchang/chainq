// Browser E2E — three layers with a fan-out middle node. Deleting the MIDDLE
// node (which feeds TWO downstream leaves) force-deletes: it goes, and BOTH
// downstream leaves turn red (⚠), each naming the now-dead `from` ref, while the
// canvas message names both broken steps. Title carries "editor" so
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

// L1 src → L2 mid → L3 {leafA, leafB}. `mid` fans out to two leaves; deleting it
// must leave BOTH leaves with a dangling `from: mid`.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  src:
    type: input
    params:
      msg: { default: hi }
  mid:
    type: assemble
    from: src
    prompt: '{{ $json.msg }}'
  leafA:
    type: assemble
    from: mid
    prompt: 'A {{ $json }}'
  leafB:
    type: assemble
    from: mid
    prompt: 'B {{ $json }}'
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-fanout-"));
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

test("editor force-deletes a fan-out middle node: it goes, BOTH downstream leaves turn red ⚠", async ({ page }) => {
  await page.goto(baseURL);
  const mid = nodeByName(page, "mid");
  const leafA = nodeByName(page, "leafA");
  const leafB = nodeByName(page, "leafB");
  await expect(mid).toBeVisible();
  await expect(leafA).toBeVisible();
  await expect(leafB).toBeVisible();
  // both leaves start healthy (no red)
  await expect(leafA).not.toHaveClass(/invalid/);
  await expect(leafB).not.toHaveClass(/invalid/);
  await dwell(page, 800);

  // delete the middle node — it feeds BOTH leaves
  await mid.dblclick();
  await expect(page.locator("#pnId")).toHaveValue("mid");
  await dwell(page, 700);
  await page.getByRole("button", { name: /^delete$/ }).click();

  // 1) middle node is gone
  await expect(nodeByName(page, "mid")).toHaveCount(0);
  await dwell(page, 700);

  // 2) BOTH downstream leaves are now flagged broken — red + inline ⚠ dead ref
  await expect(leafA).toHaveClass(/invalid/);
  await expect(leafB).toHaveClass(/invalid/);
  await expect(leafA.locator(".nwarn")).toContainText('from: "mid" does not exist');
  await expect(leafB.locator(".nwarn")).toContainText('from: "mid" does not exist');

  // 3) the canvas message names BOTH broken downstream steps
  await expect(page.locator("#canvasMsg")).toContainText("已刪除「mid」");
  await expect(page.locator("#canvasMsg")).toContainText("leafA");
  await expect(page.locator("#canvasMsg")).toContainText("leafB");

  await page.screenshot({ path: "test-results/delete-fanout-broken.png", fullPage: true });
  await dwell(page, 1400);
});
