// Browser E2E — the "×" twin on a wire midpoint deletes that connection straight
// from the canvas (mirrors the "+" insert affordance). It drops `source` from the
// target's from: via /api/connect — no node is run, so it needs no `claude` on PATH.

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

// The REAL-WORLD case that used to be undeletable. Chain: field_b → mid → to_json.
// `to_json` reaches back to field_b via {{ $node["field_b"] }} (a legal cross-layer
// reference, since field_b is a transitive ancestor). Deleting the field_b → mid wire
// breaks that path → to_json now references a node that is no longer upstream. The old
// non-force /api/connect rejected the whole delete with "field_b is not upstream", so
// the × did nothing (完全用不了). It must now LAND the delete and flag to_json red ⚠.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  field_b:
    type: ai
    prompt: 'produce B'
  mid:
    type: ai
    from: field_b
    prompt: 'pass {{ $json }}'
  to_json:
    type: ai
    from: mid
    prompt: 'combine {{ $node["field_b"] }}'
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
  const dir = mkdtempSync(join(tmpdir(), "chain-delete-edge-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW);
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

test("the × on a wire midpoint deletes a connection even when a downstream still references it", async ({ page }) => {
  await page.goto(baseURL);
  const slow = process.env.SLOWMO ? 700 : 0;

  // baseline: two solid data-flow wires (field_b→mid, mid→to_json), plus the delete
  // control for the one we target. (field_b→to_json also draws, but dashed/reference.)
  const wires = page.locator("svg.wires path:not(.refwire)");
  await expect(wires).toHaveCount(2);
  const del = page.locator('.wins.wdel[title="delete the connection field_b → mid"]');
  await expect(del).toHaveCount(1);

  // hover the canvas so the midpoint controls reveal (they're opacity:0 until hover),
  // then watch the "×" go solid red as the pointer lands on it.
  await page.locator("#graph").hover();
  await page.waitForTimeout(slow);
  await del.hover();
  await page.waitForTimeout(slow);

  // THE FEATURE: one click removes the wire — and is NOT refused despite to_json still
  // referencing field_b (the bug was a raw "field_b is not upstream" rejection here).
  await del.click();
  await page.waitForTimeout(slow);

  // 1) the field_b→mid wire is gone (the delete actually landed) — one solid wire left.
  await expect(wires).toHaveCount(1);
  // 2) canvas names the breakage rather than swallowing it — to_json's ref went stale.
  await expect(page.locator("#canvasMsg")).toContainText("Removed link");
  await expect(page.locator("#canvasMsg")).toContainText("to_json");
  // 3) to_json is flagged broken (red ⚠) so the dangling reference is visible to fix.
  const toJson = page.locator(".node", { has: page.locator(".nn", { hasText: /^to_json$/ }) });
  await expect(toJson).toHaveClass(/invalid/);

  // persist + the forgiving delete survives a reload: wire stays gone, flag stays red.
  await page.reload();
  await expect(page.locator("svg.wires path:not(.refwire)")).toHaveCount(1);
  await expect(page.locator(".node", { has: page.locator(".nn", { hasText: /^to_json$/ }) }))
    .toHaveClass(/invalid/);

  if (process.env.SLOWMO) await page.waitForTimeout(1500);
});
