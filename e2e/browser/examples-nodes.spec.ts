// Browser E2E — the shipped example flows open in the editor and the collection /
// shell nodes they showcase render the cleaned panel (no dead prompt column; cmd
// labeled "command"). Doubles as a smoke test that examples/*.yaml stay valid +
// openable. Drives the REAL example files (not a synthetic flow). Title carries
// "editor" for the demo filter.

import { test, expect, type Page, type Locator } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");

// open the editor on a real example file (cwd = repo so examples/*.yaml resolves).
function startServer(flow: string): Promise<{ url: string; proc: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui", flow], { cwd: REPO, env: { ...process.env, CHAIN_NO_OPEN: "1" } });
    let buf = "";
    const t = setTimeout(() => reject(new Error("no start:\n" + buf)), 20000);
    const on = (d: Buffer) => { buf += d.toString(); const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); resolve({ url: m[0], proc }); } };
    proc.stdout.on("data", on); proc.stderr.on("data", on);
  });
}
const dwell = (page: Page, ms: number) => (process.env.SLOWMO ? page.waitForTimeout(ms) : Promise.resolve());
const nodeByName = (page: Page, name: string): Locator =>
  page.locator(".node", { has: page.locator(".nn", { hasText: new RegExp("^" + name + "$") }) });
async function open(page: Page, name: string) {
  await page.keyboard.press("Escape");
  await dwell(page, 250);
  await nodeByName(page, name).dblclick();
  await dwell(page, 700);
}

test.describe.serial("editor: example flows showcase the collection/shell nodes", () => {
  let proc: ChildProcess | undefined;
  const boot = async (flow: string, page: Page) => {
    proc?.kill();
    const s = await startServer(flow);
    proc = s.proc;
    await page.goto(s.url);
    await dwell(page, 700);
  };
  test.afterAll(() => proc?.kill());

  test("editor: merge-join — combine (merge) has no prompt, read-only inputs", async ({ page }) => {
    await boot("examples/merge-join.yaml", page);
    await open(page, "combine");
    await expect(page.locator("#pnPromptCol")).toBeHidden();           // merge has no prompt
    await expect(page.locator("#pnInput .infield.ro")).toHaveCount(2); // headline + summary, read-only
    await open(page, "headline");                                      // a real ai branch still has its prompt
    await expect(page.locator("#pnPromptCol")).toBeVisible();
    await dwell(page, 800);
  });

  test("editor: split-aggregate — splitOut & aggregate hide the prompt column", async ({ page }) => {
    await boot("examples/split-aggregate.yaml", page);
    for (const name of ["each", "collect"]) {           // splitOut, aggregate
      await open(page, name);
      await expect(page.locator("#pnPromptCol")).toBeHidden();
    }
    await open(page, "expand");                          // the per-item ai keeps its template
    await expect(page.locator("#pnPromptCol")).toBeVisible();
    await expect(page.locator("#pnPromptLab")).toHaveText("prompt (template)");
    await dwell(page, 800);
  });

  test("editor: shell-command — cmd's column is relabeled 'command'", async ({ page }) => {
    await boot("examples/shell-command.yaml", page);
    await open(page, "list");                            // cmd
    await expect(page.locator("#pnPromptCol")).toBeVisible();
    await expect(page.locator("#pnPromptLab")).toHaveText("command");
    await expect(page.locator("#pnPrompt")).toHaveValue("ls -1");      // the textarea holds the shell command
    await dwell(page, 800);
  });
});
