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

test("a cross-layer reference draws a wire that isn't in from: (#33 Phase 2)", async ({ page }) => {
  // refine reaches across draft to the grandparent `start` via {{ $node["start"] }},
  // but only wires `draft`. The start→refine edge exists ONLY as a reference — it must
  // still be drawn (as a reference wire), and the node must validate clean.
  const FLOW2 = `profiles:
  default: { cmd: 'claude -p' }
steps:
  start: { type: ai, prompt: 'one city' }
  draft: { type: ai, from: start, prompt: '{{ $json }}' }
  refine: { type: ai, from: draft, prompt: '{{ $json }} about {{ $node["start"] }}' }
`;
  const dir = mkdtempSync(join(tmpdir(), "chain-crosslayer-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW2);
  const { url, proc: p2 } = await startServer(dir);
  try {
    await page.goto(url);
    await expect(page.locator(".node")).toHaveCount(3);

    // edges drawn: start→draft (flow), draft→refine (flow), start→refine (reference,
    // NOT a from: edge). Three paths, exactly one of them a reference wire.
    await expect(page.locator("svg.wires path")).toHaveCount(3);
    await expect(page.locator("svg.wires path.refwire")).toHaveCount(1);
    await expect(page.locator("svg.wires path.refwire").first()).toHaveAttribute("stroke", "var(--ref)");

    // the cross-layer ref is legal now → refine is not flagged invalid…
    const refine = page.locator(".node", { has: page.locator(".nn", { hasText: /^refine$/ }) });
    await expect(refine).not.toHaveClass(/invalid/);
    // …and start was NOT silently wired into refine.from (it stays a pure reference).
    await expect(refine).toContainText("from [draft]");
    await expect(refine).not.toContainText("from [draft, start]");

    // toggle hides the cross-layer reference wire; the two data-flow wires stay.
    await page.locator("#refToggle").click();
    await expect(page.locator("svg.wires path.refwire").first()).toBeHidden();
    await expect(page.locator("svg.wires path:not(.refwire)").first()).toBeVisible();
  } finally {
    p2.kill();
  }
});
