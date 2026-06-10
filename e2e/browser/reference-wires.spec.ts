// Browser E2E — reference wires (#33). Drives the real `chain ui` and proves the
// canvas tells the TWO kinds of upstream apart: data-flow wires (warm, solid — the
// $json main input) vs reference wires (cool, dashed — a {{ $('id') }} cross-step
// value lookup). Fully offline: it only renders + toggles, never runs a node, so it
// needs no `claude` on PATH. Run it as a live demo with:
//   SLOWMO=800 npx playwright test --headed -g "reference wires"

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

// Mirrors examples/fan-in.yaml: node3 reads BOTH upstreams by id via {{ $('node1') }}
// / {{ $('node2') }}, so node1→node3 and node2→node3 are reference wires; the other
// three edges (trigger→node1, trigger→node2, node3→result) are data-flow wires.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  trigger:
    type: ai
    prompt: 'output one city name in Japan'
  node1:
    type: ai
    from: trigger
    prompt: '3 must-eat foods in {{ $json }}'
  node2:
    type: ai
    from: trigger
    prompt: '3 must-see attractions in {{ $json }}'
  node3:
    type: ai
    from: [node1, node2]
    prompt: |
      itinerary from:
      {{ $('node1') }}
      {{ $('node2') }}
  result:
    type: ai
    from: node3
    prompt: 'rewrite into one tweet: {{ $json }}'
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
  const dir = mkdtempSync(join(tmpdir(), "chain-refwire-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW);
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

test("reference wires read distinctly and toggle on/off", async ({ page }) => {
  await page.goto(baseURL);

  // the five steps land as node cards…
  await expect(page.locator(".node")).toHaveCount(5);
  // …and every `from` edge becomes a wire path (5 total: 3 data-flow + 2 reference).
  const wires = page.locator("svg.wires path");
  await expect(wires).toHaveCount(5);

  // CLASSIFICATION: node3 reads node1 + node2 by id → exactly those two edges are
  // reference wires; the other three stay data-flow wires.
  const refWires = page.locator("svg.wires path.refwire");
  await expect(refWires).toHaveCount(2);
  await expect(page.locator("svg.wires path:not(.refwire)")).toHaveCount(3);

  // STYLE: reference wires are the cool dashed variant, data-flow wires are not.
  await expect(refWires.first()).toHaveAttribute("stroke-dasharray", "5,4");
  await expect(refWires.first()).toHaveAttribute("stroke", "var(--ref)");
  await expect(page.locator("svg.wires path:not(.refwire)").first()).toHaveAttribute("stroke", "var(--accent)");

  // TOGGLE — default ON: the control reads active and the wires are visible.
  const toggle = page.locator("#refToggle");
  await expect(toggle).toHaveClass(/\bon\b/);
  await expect(refWires.first()).toBeVisible();

  // click → reference wires hidden (data-flow wires untouched), control reads OFF.
  await toggle.click();
  await expect(page.locator("#graph")).toHaveClass(/hideRefs/);
  await expect(toggle).not.toHaveClass(/\bon\b/);
  await expect(refWires.first()).toBeHidden();
  await expect(page.locator("svg.wires path:not(.refwire)").first()).toBeVisible(); // data flow stays

  // click again → reference wires back.
  await toggle.click();
  await expect(page.locator("#graph")).not.toHaveClass(/hideRefs/);
  await expect(toggle).toHaveClass(/\bon\b/);
  await expect(refWires.first()).toBeVisible();
});
