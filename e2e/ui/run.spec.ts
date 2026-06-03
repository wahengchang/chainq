// Browser E2E: load a real flow in `chain ui`, click the run button on a node,
// and verify it actually runs and shows output. Uses the offline `fake` profile
// so it needs no login and is deterministic.

import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");
const USER_FLOW = join(REPO, "test060316.yaml"); // the flow the user pointed at

// Spawn `chain ui flow.yaml` in `dir`, resolve once it prints its URL.
function startServer(dir: string): Promise<{ url: string; proc: ChildProcess }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui", "flow.yaml"], { cwd: dir });
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
  const dir = mkdtempSync(join(tmpdir(), "chain-uitest-"));
  // isolate: copy the user's real flow into a temp project (don't mutate theirs)
  if (existsSync(USER_FLOW)) copyFileSync(USER_FLOW, join(dir, "flow.yaml"));
  else
    writeFileSync(
      join(dir, "flow.yaml"),
      `profiles:\n  default: { cmd: 'claude -p' }\n  fake: { cmd: 'cat' }\nsteps:\n  draft: { type: ai, prompt: 'a city in japan' }\n  refine: { type: ai, from: draft, prompt: '3 ideas: {{ $json }}' }\n`,
    );
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

test("Run to here on a node produces output (offline)", async ({ page }) => {
  await page.goto(baseURL);
  await expect(page.locator(".node").first()).toBeVisible();

  // offline profile — no login needed
  await page.locator("#profile").selectOption("fake");

  // open the first node's panel and run to here
  await page.locator(".node").first().click();
  await expect(page.locator(".modal")).toBeVisible();
  await page.getByRole("button", { name: /Run to here/ }).click();

  // the output status badge must settle on ran or cached (not stuck on running…)
  await expect(page.locator("#pnOutStatus")).toContainText(/ran|cached/, { timeout: 20000 });
  // and the output box must have real text
  await expect(page.locator("#pnOut")).not.toHaveText("running…");
  await expect(page.locator("#pnOut")).not.toHaveText("Run to see this node's output.");
});

test("the ▷ button on a node card opens its panel AND shows output", async ({ page }) => {
  // reproduces the user's report: clicking ▷ used to run silently with no
  // visible output. Now it must open the panel and surface the result.
  await page.goto(baseURL);
  await expect(page.locator(".node").first()).toBeVisible();
  await page.locator("#profile").selectOption("fake");

  // pick a DOWNSTREAM node (has upstream) so we exercise run-to-here, not just a start node
  const node = page.locator(".node").nth(1);
  await node.hover();
  await node.locator(".noderun").click();

  // ▷ must open the node panel (this was the bug — it ran without opening it)
  await expect(page.locator(".modal")).toBeVisible();

  // the node's glyph settles to a finished state
  await expect(node.locator(".glyph")).toContainText(/[✓⊘]/, { timeout: 20000 });

  // and the OUTPUT panel actually shows text (not stuck on running / placeholder)
  const out = page.locator("#pnOut");
  await expect(out).not.toHaveText("running…");
  await expect(out).not.toHaveText("Run to see this node's output.");
  await expect(out).not.toBeEmpty();
  // status badge reports ran or cached
  await expect(page.locator("#pnOutStatus")).toContainText(/ran|cached/, { timeout: 20000 });
});
