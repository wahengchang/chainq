// Browser E2E: load the real flow in `chain ui`, click "Run all", and PROVE it
// actually shells out to `claude -p` — there is no fake/offline profile anymore,
// every run is the real model. We force-fresh (the ↻ button) so the cache can't
// serve it, poll `pgrep claude` to catch the subprocess, and require every node
// card to settle on the "✓ ran · called the model" badge.
// Skipped automatically if `claude` isn't on PATH (e.g. CI).

import { test, expect } from "@playwright/test";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");
const USER_FLOW = join(REPO, "e2eMock", "test060316.yaml"); // shared E2E mock flow

const haveClaude = spawnSync("which", ["claude"]).status === 0;

// Spawn `chain ui flow.yaml` in `dir`, resolve once it prints its URL.
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
  test.skip(!haveClaude, "`claude` CLI not found on PATH");
  const dir = mkdtempSync(join(tmpdir(), "chain-uitest-"));
  // isolate: copy the user's real flow into a temp project (don't mutate theirs)
  if (existsSync(USER_FLOW)) copyFileSync(USER_FLOW, join(dir, "flow.yaml"));
  else
    writeFileSync(
      join(dir, "flow.yaml"),
      `profiles:\n  default: { cmd: 'claude -p' }\nsteps:\n  draft: { type: ai, prompt: 'a city in japan' }\n  refine: { type: ai, from: draft, prompt: '3 ideas: {{ $json }}' }\n`,
    );
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

test("Run all (fresh) really calls claude -p on every node — no fake data", async ({ page }) => {
  test.skip(!haveClaude, "`claude` CLI not found on PATH");
  test.setTimeout(180000); // several real model calls, one per node

  await page.goto(baseURL);
  await expect(page.locator(".node").first()).toBeVisible();

  // there is no fake/offline profile — the header shows a static "claude -p · real" pill
  await expect(page.locator(".profilepill")).toContainText(/real/);
  await expect(page.locator("#profile")).toHaveValue(""); // hidden input → yaml default = claude -p

  // proof the subprocess spawned: poll `pgrep claude` while the run is in flight
  let sawProcess = false;
  const poll = setInterval(() => {
    if (spawnSync("pgrep", ["-f", "claude"]).status === 0) sawProcess = true;
  }, 200);

  // click the header "↻ fresh" — Run all, ignoring cache, so EVERY node must really call the model
  await page.getByRole("button", { name: /fresh/ }).click();

  const nodes = page.locator(".node");
  const count = await nodes.count();
  expect(count).toBeGreaterThan(0);

  // every node card must settle on RAN (fresh run → really called the model, not
  // cached). The status shows on the card via the ✓ glyph — always visible, unlike
  // the output body, which is collapsed by default (#40).
  for (let i = 0; i < count; i++) {
    await expect(nodes.nth(i).locator(".glyph.g-ran")).toBeVisible({ timeout: 120000 });
  }
  clearInterval(poll);

  // expand the first node's output to confirm the "called the model" badge + real text
  await nodes.first().locator(".xn.tog").click();
  await expect(nodes.first().locator(".outbadge")).toContainText("called the model");
  await expect(nodes.first().locator(".nodeout")).not.toBeEmpty();

  expect(sawProcess, "a `claude` process should have been spawned during Run all").toBe(true);
});
