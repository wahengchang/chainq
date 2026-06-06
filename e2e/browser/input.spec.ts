// Browser E2E — the OFFLINE proof that the web editor can DRIVE input nodes:
// fill the params form, run a downstream node, watch the output reflect the typed
// value — AND that the type/required contract is enforced in the browser with the
// same errors the CLI gives. input→assemble is pure data assembly (no `claude`
// on PATH), so the real run path runs end to end. Titles carry "editor" so
// `npm run e2e:ui:demo` (-g editor) picks them up.

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

function startServer(flowYaml: string): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-input-"));
  writeFileSync(join(dir, "flow.yaml"), flowYaml);
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
const dwell = (page: Page, ms: number) => (process.env.SLOWMO ? page.waitForTimeout(ms) : Promise.resolve());

test.describe("editor input — fill & run (increment 1)", () => {
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
  let proc: ChildProcess, baseURL: string;
  test.beforeAll(async () => ({ url: baseURL, proc } = await startServer(FLOW)));
  test.afterAll(() => proc?.kill());

  test("editor drives an input node: fill params → run → output reflects input (offline)", async ({ page }) => {
    await page.goto(baseURL);
    await expect(page.locator(".node")).toHaveCount(2);
    const seed = page.locator(".node", { has: page.locator(".nn", { hasText: /^seed$/ }) });
    const out = page.locator(".node", { has: page.locator(".nn", { hasText: /^out$/ }) });
    await expect(seed.locator(".ntype")).toContainText("input");

    await seed.click();
    const field = page.locator('.paramin[data-param="topic"]');
    await expect(field).toBeVisible();
    await dwell(page, 600);
    await field.fill("kyoto");
    await dwell(page, 400);
    await page.keyboard.press("Escape");

    await out.locator(".noderun").first().click();
    await expect(out.locator(".nodeout")).toContainText("kyoto");
    await dwell(page, 1200);
  });
});

test.describe("editor input — typed & required contract (increment 2)", () => {
  const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  seed:
    type: input
    params:
      name:  { type: string, required: true }
      topic: { default: tokyo }
      count: { type: number, default: 1 }
  out:
    type: assemble
    from: seed
    prompt: '{{ $json.name }}/{{ $json.topic }}/{{ $json.count }}'
`;
  let proc: ChildProcess, baseURL: string;
  test.beforeAll(async () => ({ url: baseURL, proc } = await startServer(FLOW)));
  test.afterAll(() => proc?.kill());

  test("editor enforces the input contract: typed widgets, required blocks, typed value flows (offline)", async ({ page }) => {
    await page.goto(baseURL);
    const seed = page.locator(".node", { has: page.locator(".nn", { hasText: /^seed$/ }) });
    const out = page.locator(".node", { has: page.locator(".nn", { hasText: /^out$/ }) });

    // the form draws a typed widget per param: number → number input
    await seed.click();
    await expect(page.locator('.paramin[data-param="count"]')).toHaveAttribute("type", "number");
    await expect(page.locator("#pnInput")).toContainText("*"); // required marker on `name`
    await dwell(page, 800);
    await page.keyboard.press("Escape");

    // run with the required `name` empty → blocked, the same error the CLI gives
    await out.locator(".noderun").first().click();
    await expect(page.locator("#canvasMsg")).toContainText("required");
    await expect(out.locator(".nodeout")).toHaveCount(0); // nothing ran
    await dwell(page, 900);

    // fill required name + a typed number, run → output reflects, number coerced
    await seed.click();
    await page.locator('.paramin[data-param="name"]').fill("ada");
    await page.locator('.paramin[data-param="count"]').fill("9");
    await dwell(page, 500);
    await page.keyboard.press("Escape");
    await out.locator(".noderun").first().click();
    await expect(out.locator(".nodeout")).toContainText("ada/tokyo/9");
    await dwell(page, 1200);
  });
});
