// Browser E2E — the middle "prompt" column only shows for nodes that use it.
// Bug it guards: every non-input node used to render an editable "prompt (template)"
// textarea, even though splitOut/aggregate/merge/write never read a prompt and cmd's
// textarea is actually the shell command. So 5/8 node kinds showed a misleading column.
// After the fix: prompt column shows only for ai/assemble/cmd; cmd relabels to
// "command"; collection/IO nodes hide the column AND their INPUT chips are read-only
// (no "insert into the prompt" affordance). Title carries "editor" for the demo filter.

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

// one flow exercising all 8 node types (same shape as node-types.spec).
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
  const dir = mkdtempSync(join(tmpdir(), "chain-promptcol-"));
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

// open a node's panel (Escape first per UI e2e convention — a lingering modal
// would intercept the dblclick), then settle for SLOWMO viewers.
async function open(page: Page, name: string) {
  await page.keyboard.press("Escape");
  await dwell(page, 250);
  await nodeByName(page, name).dblclick();
  await dwell(page, 700);
}

let proc: ChildProcess, baseURL: string;
test.beforeAll(async () => ({ url: baseURL, proc } = await startServer()));
test.afterAll(() => proc?.kill());

test("editor: prompt column only shows for nodes that use it (offline)", async ({ page }) => {
  await page.goto(baseURL);
  await dwell(page, 800);

  const col = page.locator("#pnPromptCol");
  const lab = page.locator("#pnPromptLab");

  // ── ai: real prompt template, clickable input chips ───────────────────────
  await open(page, "gen");
  await expect(col).toBeVisible();
  await expect(lab).toHaveText("prompt (template)");
  await expect(page.locator("#pnInput .infield")).toHaveCount(1);      // 1 upstream
  await expect(page.locator("#pnInput .infield.ro")).toHaveCount(0);   // clickable, not read-only

  // ── assemble: also a real prompt template ─────────────────────────────────
  await open(page, "asm");
  await expect(col).toBeVisible();
  await expect(lab).toHaveText("prompt (template)");

  // ── cmd: column shows, but relabeled "command" (textarea is the shell cmd) ─
  await open(page, "load");
  await expect(col).toBeVisible();
  await expect(lab).toHaveText("command");
  await expect(page.locator("#pnPrompt")).toHaveAttribute("placeholder", /shell/);

  // ── the 5 no-prompt kinds: middle column hidden, grid collapses to 2 cols ──
  for (const name of ["split", "gather", "combine", "save", "start"]) {
    await open(page, name);
    await expect(col).toBeHidden();
    await expect(page.locator("#pnCols")).toHaveClass(/trigger/);
  }

  // ── merge keeps its 2 INPUT chips, but read-only (no "insert" affordance) ──
  await open(page, "combine");
  await expect(page.locator("#pnInput .infield.ro")).toHaveCount(2);   // asm + gen, read-only
  await expect(page.locator("#pnInput .infield .ins")).toHaveCount(0); // no "↵ insert" label
  await dwell(page, 1200);
});
