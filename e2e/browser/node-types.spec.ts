// Browser E2E — per-type visual identity (n8n-style). Every node type shows a
// coloured icon badge (the "logo") so types are scannable at a glance. A flow with
// all 8 node types must render a .tbadge on each, in that type's colour. Offline.
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

// one flow exercising all 8 node types (validates: merge=2 in, split/aggregate=1 in, write=path+from).
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  start:   { type: input, params: {} }
  load:    { type: cmd, from: start, run: 'echo hi' }
  gen:     { type: ai, from: load, prompt: 'x {{ $json }}' }
  split:   { type: splitOut, from: gen }
  step:    { type: ai, from: split, prompt: 'y {{ $json }}' }
  gather:  { type: aggregate, from: step }
  asm:     { type: assemble, from: gather, prompt: '{{ $json }}' }
  combine: { type: merge, from: [asm, gen], mode: append }
  save:    { type: write, from: combine, path: 'out/x.md', mode: overwrite }
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

  // every node carries a type badge
  await expect(page.locator(".node .tbadge")).toHaveCount(9);

  // spot-check four types render in their declared colour (proves per-type mapping)
  expect(await bg(nodeByName(page, "start").locator(".tbadge"))).toBe("rgb(16, 185, 129)");   // input — green
  expect(await bg(nodeByName(page, "gen").locator(".tbadge"))).toBe("rgb(167, 139, 250)");    // ai — violet
  expect(await bg(nodeByName(page, "load").locator(".tbadge"))).toBe("rgb(245, 158, 11)");    // cmd — amber
  expect(await bg(nodeByName(page, "combine").locator(".tbadge"))).toBe("rgb(244, 114, 182)"); // merge — pink
  await dwell(page, 1200);

  // the open-node panel header carries the same badge
  await nodeByName(page, "gen").click();
  await dwell(page, 500);
  await expect(page.locator("#pnType .tbadge")).toHaveCount(1);
  expect(await bg(page.locator("#pnType .tbadge"))).toBe("rgb(167, 139, 250)");
  await dwell(page, 1200);
});
