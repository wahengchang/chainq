// Browser E2E — the OFFLINE proof that the web editor can DRIVE an input node:
// open the input node, fill its params form, run a downstream node, and watch the
// output reflect the typed value. input→assemble is pure data assembly (no
// `claude` on PATH needed), so this exercises the real run path end to end.
// Title carries "editor" so `npm run e2e:ui:demo` (-g editor) picks it up.

import { test, expect } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");

// input → assemble: assemble renders {{ $json.topic }} from the seed item, with no
// external call, so the whole run is offline.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  seed:
    type: input
    params:
      topic: { default: tokyo }
  out:
    type: assemble
    from: seed
    prompt: '{{ $json.topic }}'
`;

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
  const dir = mkdtempSync(join(tmpdir(), "chain-input-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW);
  ({ url: baseURL, proc } = await startServer(dir));
});
test.afterAll(() => proc?.kill());

test("editor drives an input node: fill params → run → output reflects input (offline)", async ({ page }) => {
  await page.goto(baseURL);
  await expect(page.locator(".node")).toHaveCount(2); // seed + out

  const seed = page.locator(".node", { has: page.locator(".nn", { hasText: /^seed$/ }) });
  const out = page.locator(".node", { has: page.locator(".nn", { hasText: /^out$/ }) });

  // the input node reads with the ▶ input chip
  await expect(seed.locator(".ntype")).toContainText("input");

  // open the input node → its params form is drawn (prefilled with the default)
  await seed.click();
  const field = page.locator('.paramin[data-param="topic"]');
  await expect(field).toBeVisible();
  if (process.env.SLOWMO) await page.waitForTimeout(600);

  // type a runtime value and close the panel
  await field.fill("kyoto");
  if (process.env.SLOWMO) await page.waitForTimeout(400);
  await page.keyboard.press("Escape");

  // run the downstream assemble node (▷ run to here) → output reflects the value
  await out.locator(".noderun").first().click();
  await expect(out.locator(".nodeout")).toContainText("kyoto");
  if (process.env.SLOWMO) await page.waitForTimeout(1500);
});
