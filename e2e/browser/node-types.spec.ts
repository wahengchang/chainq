// Browser E2E — per-type visual identity (n8n-style). Every node type shows a
// coloured icon badge (the "logo") so types are scannable at a glance. A flow with
// all 5 node types must render a .tbadge on each, in that type's colour. The flow
// also includes ONE removed type (merge) to prove old flows still open and paint a
// red ⚠ error node instead of crashing the editor. Offline.
// Title carries "editor" so `npm run e2e:ui:demo` (-g editor) picks it up.

import { test, expect, type Page, type Locator } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");

// the 5 surviving node types, plus a `gone` node carrying a removed type (merge) so
// we can assert old flows degrade to an error node rather than throwing on open.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  start:  { type: input, params: {} }
  load:   { type: cmd, from: start, run: 'echo hi' }
  gen:    { type: ai, from: load, prompt: 'x {{ $json }}' }
  asm:    { type: assemble, from: gen, prompt: '{{ $json }}' }
  save:   { type: write, from: asm, path: 'out/x.md', mode: overwrite }
  gone:   { type: merge, from: [asm, gen], mode: append }
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-types-"));
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
const nodeByName = (page: Page, name: string): Locator =>
  page.locator(".node", { has: page.locator(".nn", { hasText: new RegExp("^" + name + "$") }) });
const bg = (l: Locator) =>
  l.evaluate((el) => (el.ownerDocument as any).defaultView.getComputedStyle(el).backgroundColor as string);

let proc: ChildProcess, baseURL: string;
test.beforeAll(async () => ({ url: baseURL, proc } = await startServer()));
test.afterAll(() => proc?.kill());

test("editor: every node type shows its own coloured icon badge (offline)", async ({ page }) => {
  await page.goto(baseURL);
  await dwell(page, 800);

  // every node carries a type badge (5 valid + 1 removed-type node)
  await expect(page.locator(".node .tbadge")).toHaveCount(6);

  // spot-check each valid type renders in its declared colour (per-type mapping)
  expect(await bg(nodeByName(page, "start").locator(".tbadge"))).toBe("rgb(16, 185, 129)"); // input — green
  expect(await bg(nodeByName(page, "gen").locator(".tbadge"))).toBe("rgb(167, 139, 250)");  // ai — violet
  expect(await bg(nodeByName(page, "load").locator(".tbadge"))).toBe("rgb(245, 158, 11)");  // cmd — amber
  expect(await bg(nodeByName(page, "asm").locator(".tbadge"))).toBe("rgb(96, 165, 250)");   // assemble — blue
  expect(await bg(nodeByName(page, "save").locator(".tbadge"))).toBe("rgb(45, 212, 191)");  // write — teal
  await dwell(page, 1200);

  // the removed-type node (merge) degrades to a red ⚠ error node: red badge,
  // .unknown class, flagged invalid — the editor opened the flow instead of throwing.
  const gone = nodeByName(page, "gone");
  await expect(gone).toHaveClass(/unknown/);
  await expect(gone).toHaveClass(/invalid/);
  expect(await bg(gone.locator(".tbadge"))).toBe("rgb(239, 68, 68)"); // unknown — red
  await dwell(page, 1200);

  // opening it shows the "type was removed" hint, and the type can be re-selected
  await gone.dblclick();
  await dwell(page, 500);
  await expect(page.locator("#pnType")).toContainText("merge");
  await expect(page.locator("#pnTypeFields")).toContainText("unknown node type");
  await dwell(page, 1200);

  // the open-node panel header carries the same badge for a valid type
  await page.keyboard.press("Escape");
  await nodeByName(page, "gen").dblclick();
  await dwell(page, 500);
  await expect(page.locator("#pnType .tbadge")).toHaveCount(1);
  expect(await bg(page.locator("#pnType .tbadge"))).toBe("rgb(167, 139, 250)");
  await dwell(page, 1200);
});
