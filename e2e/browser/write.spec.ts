// Browser E2E — Epic D `write` 成品 node. The panel shows path + mode; running the
// chain writes the upstream content to a file and the node's output reflects it.
// Offline: input → assemble → write needs no model. Title carries "editor" so
// `npm run e2e:ui:demo` (-g editor) picks it up.

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
  seed:
    type: input
    params:
      msg: { default: hello-from-write }
  body:
    type: assemble
    from: seed
    prompt: '{{ $json.msg }}'
  out:
    type: write
    from: body
    path: 'result.txt'
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-write-"));
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

test("editor runs a write node: panel shows path/mode, output is the written content (offline)", async ({ page }) => {
  await page.goto(baseURL);
  const out = nodeByName(page, "out");
  await expect(out.locator(".ntype")).toContainText("write"); // ⤓ write chip

  // panel shows the write type editor (path + mode)
  await out.click();
  await expect(page.locator("#tfPath")).toHaveValue("result.txt");
  await expect(page.locator("#tfMode")).toBeVisible();
  await dwell(page, 700);
  await page.keyboard.press("Escape");

  // run the chain → the write node writes the content; its output is collapsed by
  // default (#40), so expand it via the ×N badge before reading the card output.
  await page.getByRole("button", { name: /Run all/ }).click();
  await out.locator(".xn.tog").click();
  await expect(out.locator(".nodeout")).toContainText("hello-from-write");
  await dwell(page, 1200);
});
