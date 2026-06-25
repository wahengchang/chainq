// Browser E2E — the default profile's command, edited from the toolbar pill.
// The pill shows `profiles.default.cmd` (the local CLI every ai node shells out
// to); clicking it opens a popover to edit that command. Pure structural edit
// (no run), fully offline. Title carries "editor" so `npm run e2e:ui:demo`
// (-g editor) picks it up.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
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
  gen:
    type: ai
    prompt: 'write a haiku'
`;

let flowPath = "";

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-profile-"));
  flowPath = join(dir, "flow.yaml");
  writeFileSync(flowPath, FLOW);
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui", "flow.yaml"], { cwd: dir, env: { ...process.env, CHAIN_NO_OPEN: "1" } });
    let buf = "";
    const t = setTimeout(() => reject(new Error("no start:\n" + buf)), 20000);
    const onData = (d: Buffer) => { buf += d.toString(); const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); resolve({ url: m[0], proc }); } };
    proc.stdout.on("data", onData); proc.stderr.on("data", onData);
  });
}
const dwell = (page: Page, ms: number) => (process.env.SLOWMO ? page.waitForTimeout(ms) : Promise.resolve());

let proc: ChildProcess, baseURL: string;
test.beforeAll(async () => ({ url: baseURL, proc } = await startServer()));
test.afterAll(() => proc?.kill());

test("editor edits the default profile's command via the toolbar pill — round-trips through YAML", async ({ page }) => {
  await page.goto(baseURL);
  const pill = page.locator("#profileBtn");
  const pop = page.locator("#profilePop");

  // the pill in the top bar shows the default profile's cmd; popover starts closed.
  await expect(pill).toHaveText("● claude -p · real");
  await expect(pop).toBeHidden();
  await dwell(page, 500);

  // click the pill → popover opens, prefilled with the current cmd.
  await pill.click();
  await expect(pop).toBeVisible();
  await expect(page.locator("#profileInput")).toHaveValue("claude -p");
  await dwell(page, 500);

  // change the cmd to pin a model; Apply → writes profiles.default.cmd, relabels pill.
  await page.locator("#profileInput").fill("claude -p --model claude-sonnet-4-6");
  await dwell(page, 400);
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(pop).toBeHidden();
  await expect(pill).toHaveText("● claude -p --model claude-sonnet-4-6 · real");
  expect(readFileSync(flowPath, "utf8")).toMatch(/cmd:\s*'?claude -p --model claude-sonnet-4-6'?/);
  await dwell(page, 600);

  // reopen → the new value is what's prefilled (it persisted, not just relabeled).
  await pill.click();
  await expect(page.locator("#profileInput")).toHaveValue("claude -p --model claude-sonnet-4-6");
  await dwell(page, 400);

  // an empty command is refused — the flow keeps a runnable cmd (壞不落地).
  await page.locator("#profileInput").fill("   ");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator("#canvasMsg")).toContainText("cannot be empty");
  await dwell(page, 500);
});
