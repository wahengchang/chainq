// Browser E2E — the OFFLINE safety net for the editor. Drives the real `chain ui`
// (no fake page, no e2e-viz.html) but never RUNS a node, so it needs no `claude`
// on PATH: rendering + structural editing all go through offline endpoints. This
// is the net the module-extraction refactor and the items/editing features must
// keep green. The claude-gated run specs (run.spec / run-real.spec) prove the
// real model path separately.

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

// A flow that exercises the items-model node types (ai + splitOut + aggregate) so
// the editor has shapes to draw — rendering it is fully offline.
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
    const proc = spawn(TSX, [CLI, "ui", "flow.yaml"], { cwd: dir });
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
  const dir = mkdtempSync(join(tmpdir(), "chain-editor-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW);
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

test("editor renders the real flow graph from chain ui (offline)", async ({ page }) => {
  await page.goto(baseURL);

  // every step in the flow becomes a node card on the canvas
  await expect(page.locator(".node")).toHaveCount(4);

  const names = await page.locator(".node .nn").allInnerTexts();
  expect(names.map((s) => s.trim()).sort()).toEqual(["cities", "describe", "gather", "split"]);

  // demo dwell: let the rendered graph linger before the browser closes
  if (process.env.SLOWMO) await page.waitForTimeout(1200);
});
