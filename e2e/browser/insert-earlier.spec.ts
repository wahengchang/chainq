// Browser E2E — clicking an EARLIER (transitive ancestor, not directly wired) output
// in the node panel inserts a CROSS-STEP REFERENCE {{ $node["id"] }} into the prompt
// WITHOUT touching from:. The engine resolves references to any ancestor (#33 Phase 2),
// so an earlier node stays a reference, not a forced data-flow input. Offline: it only
// edits + saves (no node is run), so it needs no `claude` on PATH.

import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");

// A 1-in-1-out chain: cities → step → describe. For `describe` (from: step) the
// node `cities` is a TRANSITIVE ancestor — not directly wired — so it lands in the
// panel's "earlier outputs" box.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  cities:
    type: ai
    prompt: 'list 3 cities as a JSON array'
  step:
    type: ai
    from: cities
    prompt: 'pick one: {{ $json }}'
  describe:
    type: ai
    from: step
    prompt: 'describe {{ $json }}'
`;

function startServer(dir: string): Promise<{ url: string; proc: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui", "flow.yaml"], { cwd: dir, env: { ...process.env, CHAIN_NO_OPEN: "1" } });
    let buf = "";
    const t = setTimeout(() => reject(new Error("server did not start:\n" + buf)), 20000);
    const onData = (d: Buffer) => {
      buf += d.toString();
      const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\//);
      if (m) {
        clearTimeout(t);
        resolve({ url: m[0], proc });
      }
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
  });
}

let proc: ChildProcess;
let baseURL: string;

test.beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "chain-insert-earlier-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW);
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

test("clicking an earlier output inserts a cross-step reference, leaving from: untouched", async ({ page }) => {
  await page.goto(baseURL);
  const slow = process.env.SLOWMO ? 700 : 0;

  // open `describe` — its prompt already references {{ $json }} (the primary, split)
  const describe = page.locator(".node", { has: page.locator(".nn", { hasText: /^describe$/ }) });
  await describe.dblclick();
  await expect(page.locator("#modal .modal")).toBeVisible();
  await page.waitForTimeout(slow);

  // baseline: `cities` is NOT wired — it shows ONLY in the earlier-outputs box, the
  // affordance is "insert ref" (a reference, not a wiring), and the prompt does not
  // yet reference it.
  const earlier = page.locator("#pnEarlier .infield", { hasText: "cities" });
  await expect(earlier).toHaveCount(1);
  await expect(earlier).toContainText("insert ref");
  await expect(page.locator("#pnWire")).not.toContainText("cities");
  await expect(page.locator("#pnPrompt")).toHaveValue("describe {{ $json }}");

  // put the cursor at the END of the prompt so the inserted ref lands there
  const ta = page.locator("#pnPrompt");
  await ta.focus();
  await ta.evaluate((el) => { const t = el as any; t.selectionStart = t.selectionEnd = t.value.length; });
  await page.waitForTimeout(slow);

  // THE FEATURE: one click inserts {{ $node["cities"] }} as a cross-step reference.
  await earlier.click();
  await page.waitForTimeout(slow);

  // 1) the prompt now references cities, appended at the cursor (unsaved edits kept)
  await expect(page.locator("#pnPrompt")).toHaveValue('describe {{ $json }}{{ $node["cities"] }}');
  // 2) from: is UNTOUCHED — cities did not become a wiring chip; primary stays split.
  await expect(page.locator("#pnWire .chip", { hasText: "cities" })).toHaveCount(0);
  await expect(page.locator("#pnWire .chip.p")).toContainText("step");
  // 3) cities STAYS in the earlier-outputs box (still an ancestor, still not wired).
  await expect(page.locator("#pnEarlier .infield", { hasText: "cities" })).toHaveCount(1);

  // persist + reload: the cross-step reference survives a Save round-trip through the
  // engine, and the node is NOT flagged invalid (referencing an ancestor is legal).
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await page.waitForTimeout(slow);
  await page.reload();
  await expect(describe).not.toHaveClass(/invalid/); // ancestor ref validates clean
  await describe.dblclick();
  await expect(page.locator("#pnPrompt")).toHaveValue('describe {{ $json }}{{ $node["cities"] }}');
  await expect(page.locator("#pnWire .chip", { hasText: "cities" })).toHaveCount(0); // from still untouched
  await expect(page.locator("#pnEarlier .infield", { hasText: "cities" })).toHaveCount(1);

  if (process.env.SLOWMO) await page.waitForTimeout(1500);
});
