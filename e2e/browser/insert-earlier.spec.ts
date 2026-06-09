// Browser E2E — clicking an EARLIER (transitive, not-yet-wired) output in the
// node panel wires it into `from:` AND inserts {{ $node["id"] }} into the prompt,
// in one move. Offline: structural editing only (no node is run), so it needs no
// `claude` on PATH. This is the net for the "click to wire + insert" affordance.

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

// A 1-in-1-out chain: cities → split → describe → gather. For `describe`
// (from: split) the node `cities` is a TRANSITIVE ancestor — not directly wired —
// so it lands in the panel's "earlier outputs" box.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  cities:
    type: ai
    prompt: 'list 3 cities as a JSON array'
  split:
    type: splitOut
    from: cities
  describe:
    type: ai
    from: split
    prompt: 'describe {{ $json }}'
  gather:
    type: aggregate
    from: describe
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

test("clicking an earlier output wires it into from: and inserts its reference", async ({ page }) => {
  await page.goto(baseURL);
  const slow = process.env.SLOWMO ? 700 : 0;

  // open `describe` — its prompt already references {{ $json }} (the primary, split)
  const describe = page.locator(".node", { has: page.locator(".nn", { hasText: /^describe$/ }) });
  await describe.click();
  await expect(page.locator("#modal .modal")).toBeVisible();
  await page.waitForTimeout(slow);

  // baseline: `cities` is NOT wired — it shows ONLY in the earlier-outputs box,
  // and the prompt does not yet reference it.
  const earlier = page.locator("#pnEarlier .infield", { hasText: "cities" });
  await expect(earlier).toHaveCount(1);
  await expect(earlier).toContainText("wire + insert"); // the new affordance, not read-only
  await expect(page.locator("#pnWire")).not.toContainText("cities");
  await expect(page.locator("#pnPrompt")).toHaveValue("describe {{ $json }}");

  // put the cursor at the END of the prompt so the inserted ref lands there
  const ta = page.locator("#pnPrompt");
  await ta.focus();
  await ta.evaluate((el) => { const t = el as any; t.selectionStart = t.selectionEnd = t.value.length; });
  await page.waitForTimeout(slow);

  // THE FEATURE: one click wires `cities` in AND inserts {{ $node["cities"] }}
  await earlier.click();
  await page.waitForTimeout(slow);

  // 1) the prompt now references cities, appended at the cursor (unsaved edits kept)
  await expect(page.locator("#pnPrompt")).toHaveValue('describe {{ $json }}{{ $node["cities"] }}');
  // 2) cities is now a real upstream — a chip in the wiring row (NON-primary: $json
  //    is still the first input, so the original primary wasn't displaced)
  await expect(page.locator("#pnWire .chip", { hasText: "cities" })).toHaveCount(1);
  await expect(page.locator("#pnWire .chip.p")).toContainText("split"); // primary unchanged
  // 3) cities left the earlier-outputs box (it's wired now, shown as a direct input)
  await expect(page.locator("#pnEarlier .infield", { hasText: "cities" })).toHaveCount(0);
  await expect(page.locator("#pnInput")).toContainText("cities");
  // 4) confirmation message
  await expect(page.locator("#pnMsg")).toContainText("wired cities in");

  // persist + reload: the wiring + reference survive a round-trip through the
  // engine (real /api/connect + Save), proving it's not just DOM state.
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await page.waitForTimeout(slow);
  await page.reload();
  await describe.click();
  await expect(page.locator("#pnPrompt")).toHaveValue('describe {{ $json }}{{ $node["cities"] }}');
  await expect(page.locator("#pnWire .chip", { hasText: "cities" })).toHaveCount(1);

  if (process.env.SLOWMO) await page.waitForTimeout(1500);
});
