// Browser E2E — the editor "draft" model: edits are kept as a per-node draft that
// (a) is what a run executes, (b) survives close/reopen (no leave prompt), (c) is
// discarded only by ↩ Reset or written by Save. Uses a `cmd` node (a real `echo`
// subprocess — this project has no fake profiles) so the run is REAL but deterministic.
// Title carries "editor" so `npm run e2e:ui:demo` (-g editor) picks it up too.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");

const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  greet:
    type: cmd
    run: "echo hello-world"
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-draftrun-"));
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
const nodeByName = (page: Page, name: string) =>
  page.locator(".node", { has: page.locator(".nn", { hasText: new RegExp("^" + name + "$") }) });

let proc: ChildProcess, baseURL: string;
test.beforeAll(async () => ({ url: baseURL, proc } = await startServer()));
test.afterAll(() => proc?.kill());

test("editor keeps an unsaved draft across close/reopen, runs it, resets, saves", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(baseURL);

  const prompt = page.locator("#pnPrompt");
  const dirty = page.locator("#pnDirty");
  const reset = page.getByRole("button", { name: "↩ Reset" });
  const out = page.locator("#pnOut");
  const canvasDot = page.locator(".node .ndirty");

  // open the node — clean: no indicator, Reset hidden, no ● on the canvas.
  await nodeByName(page, "greet").dblclick();
  await expect(prompt).toHaveValue("echo hello-world");
  await expect(dirty).toBeHidden();
  await expect(reset).toBeHidden();
  await dwell(page, 600);

  // EDIT (no save) → footer "● Unsaved draft" lights up, ↩ Reset appears, canvas node gets a ●.
  await prompt.fill("echo hello-DRAFT");
  await expect(dirty).toBeVisible();
  await expect(reset).toBeVisible();
  await expect(canvasDot).toHaveCount(1);
  await dwell(page, 700);

  // RE-RUN (↻, fresh) — the draft is what runs (server applies it in memory, file
  // untouched), so echo prints the edited text; the edit survives the run.
  await page.getByRole("button", { name: "↻ Force execute" }).click();
  await expect(out).toContainText("hello-DRAFT", { timeout: 30000 });
  await expect(prompt).toHaveValue("echo hello-DRAFT");
  await expect(dirty).toBeVisible();
  await dwell(page, 800);

  // CLOSE — no prompt, no guard bar. Then REOPEN → the draft is STILL there (kept).
  await page.getByRole("button", { name: "✕ close" }).click();
  await expect(page.locator("#modal")).toBeHidden();
  await dwell(page, 500);
  await nodeByName(page, "greet").dblclick();
  await expect(prompt).toHaveValue("echo hello-DRAFT");   // ← persisted across close/reopen
  await expect(dirty).toBeVisible();
  await dwell(page, 700);

  // ↩ RESET — the only way to discard: back to the saved value, ● gone everywhere.
  await reset.click();
  await expect(prompt).toHaveValue("echo hello-world");
  await expect(dirty).toBeHidden();
  await expect(reset).toBeHidden();
  await expect(canvasDot).toHaveCount(0);
  await dwell(page, 700);

  // SAVE path — edit, Save, reopen → the value persisted to the file and is clean.
  await prompt.fill("echo hello-SAVED");
  await expect(dirty).toBeVisible();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(dirty).toBeHidden();          // saved → draft cleared
  await expect(canvasDot).toHaveCount(0);
  await dwell(page, 500);
  await page.getByRole("button", { name: "✕ close" }).click();
  await nodeByName(page, "greet").dblclick();
  await expect(prompt).toHaveValue("echo hello-SAVED");
  await expect(dirty).toBeHidden();
  await dwell(page, 800);
});
