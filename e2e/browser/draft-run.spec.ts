// Browser E2E — the editor "run your draft without saving" + leave-guard behaviour.
// Drives the exact bug from the screenshot: edit a node, RE-RUN, and the edit must
// (a) actually be what runs, (b) survive the run instead of being wiped. Then the
// save-or-discard guard on close. Uses a `cmd` node (a real `echo` subprocess —
// this project has no fake profiles) so the run is REAL but deterministic.
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

// one cmd node — `run` is its editable "prompt" field; echo makes the run real + deterministic.
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

test("editor runs the unsaved draft, keeps the edit, and guards on leave", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto(baseURL);

  const prompt = page.locator("#pnPrompt");
  const dirty = page.locator("#pnDirty");
  const guard = page.locator("#pnGuard");
  const out = page.locator("#pnOut");

  // open the node — its `run` command shows in the prompt column, panel is clean.
  await nodeByName(page, "greet").click();
  await expect(prompt).toHaveValue("echo hello-world");
  await expect(dirty).toBeHidden();
  await dwell(page, 600);

  // EDIT but do NOT save → the "● 未儲存" indicator lights up.
  await prompt.fill("echo hello-DRAFT");
  await expect(dirty).toBeVisible();
  await dwell(page, 600);

  // RE-RUN (↻, fresh) — the screenshot's button. The DRAFT is what runs (server
  // applies it in memory, file untouched), so the real echo prints the edited text.
  await page.getByRole("button", { name: "↻ re-run" }).click();
  await expect(out).toContainText("hello-DRAFT", { timeout: 30000 });
  await dwell(page, 800);

  // THE FIX: the edit survived the run (old behaviour wiped it back to the saved
  // value), and the panel is still dirty because we ran but never saved.
  await expect(prompt).toHaveValue("echo hello-DRAFT");
  await expect(dirty).toBeVisible();
  await dwell(page, 800);

  // try to CLOSE with unsaved edits → the in-panel guard bar appears (no native dialog).
  await page.getByRole("button", { name: "✕ close" }).click();
  await expect(guard).toBeVisible();
  await dwell(page, 800);

  // DISCARD → panel closes; reopening shows the SAVED value (the draft was thrown away).
  await page.getByRole("button", { name: "不存，丟棄" }).click();
  await expect(page.locator("#modal")).toBeHidden();
  await dwell(page, 500);
  await nodeByName(page, "greet").click();
  await expect(prompt).toHaveValue("echo hello-world");
  await expect(dirty).toBeHidden();
  await dwell(page, 600);

  // now the SAVE path: edit, close, choose "先儲存" → the edit persists to the file.
  await prompt.fill("echo hello-SAVED");
  await expect(dirty).toBeVisible();
  await page.getByRole("button", { name: "✕ close" }).click();
  await expect(guard).toBeVisible();
  await dwell(page, 600);
  await page.getByRole("button", { name: "先儲存" }).click();
  await expect(page.locator("#modal")).toBeHidden();
  await dwell(page, 500);
  await nodeByName(page, "greet").click();
  await expect(prompt).toHaveValue("echo hello-SAVED");
  await expect(dirty).toBeHidden();
  await dwell(page, 800);
});
