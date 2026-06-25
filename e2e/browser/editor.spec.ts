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

// A small linear flow (ai → ai → ai → assemble) so the editor has shapes to draw —
// rendering it is fully offline.
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
  gather:
    type: assemble
    from: describe
    prompt: '{{ $json }}'
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
  expect(names.map((s) => s.trim()).sort()).toEqual(["cities", "describe", "gather", "step"]);

  // each node carries a type chip naming its kind
  const step = page.locator(".node", { has: page.locator(".nn", { hasText: /^step$/ }) });
  const gather = page.locator(".node", { has: page.locator(".nn", { hasText: /^gather$/ }) });
  await expect(step.locator(".ntype")).toContainText("ai");
  await expect(gather.locator(".ntype")).toContainText("assemble");

  // PLACEMENT: the add-step control is a floating toolbar grouped with the zoom
  // control in the bottom-right corner (one canvas toolbar cluster), stacked just
  // above it — not stranded in the document flow at the top-left.
  const vp = page.viewportSize()!;
  const addBox = (await page.locator(".addnode").boundingBox())!;
  const zoomBox = (await page.locator(".zoomctl").boundingBox())!;
  // both pinned to the right edge…
  expect(vp.width - (addBox.x + addBox.width)).toBeLessThan(40);
  expect(vp.width - (zoomBox.x + zoomBox.width)).toBeLessThan(40);
  // …and to the bottom half of the viewport…
  expect(addBox.y).toBeGreaterThan(vp.height * 0.55);
  // …with add-step sitting ABOVE the zoom bar, not overlapping it.
  expect(addBox.y + addBox.height).toBeLessThanOrEqual(zoomBox.y + 1);

  // add a new node from the canvas, choosing its type — goes through the real
  // /api/add-node (engine nodeStarter), so a brand-new cmd node appears with its own
  // accent chip. The old editor could only ever add an `ai` step.
  await page.selectOption("#addType", "cmd");
  await page.getByRole("button", { name: "+ add step" }).click();
  await expect(page.locator(".node")).toHaveCount(5);
  const added = page.locator(".node", { has: page.locator(".ntype", { hasText: "cmd" }) });
  await expect(added).toHaveCount(1);
  await page.keyboard.press("Escape"); // add-node opened the new node's panel — close it

  // inline rename: open the `step` node's panel, rename it → its key AND the
  // downstream describe.from both follow, via the real /api/rename (engine).
  await step.dblclick();
  await page.locator("#pnId").fill("fork");
  await page.locator("#pnId").press("Enter");
  await page.keyboard.press("Escape"); // close the panel to read the canvas behind
  await expect(page.locator(".node", { has: page.locator(".nn", { hasText: /^fork$/ }) })).toHaveCount(1);
  await expect(page.locator(".node", { has: page.locator(".nn", { hasText: /^step$/ }) })).toHaveCount(0);
  const describe = page.locator(".node", { has: page.locator(".nn", { hasText: /^describe$/ }) });
  await expect(describe).toContainText("from [fork]"); // downstream wiring followed the rename

  // demo dwell: let the rendered graph linger before the browser closes
  if (process.env.SLOWMO) await page.waitForTimeout(1500);
});
