// Browser E2E — defining an input node's FIELDS from the panel (no raw YAML).
// The missing "where do I set inputs" surface: click + add field, name/type/default,
// Save → it persists to `params` and the run-time form picks it up. Offline, no run.
// Title carries "editor" so `npm run e2e:ui:demo` (-g editor) picks it up.

import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = join(here, "..", "..");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const CLI = join(REPO, "src", "cli", "index.ts");

// a flow whose start trigger has NO fields yet — the empty state a user must escape.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  start: { type: input, params: {} }
  draft: { type: ai, from: start, prompt: 'about {{ $json.topic }}' }
`;

function startServer(): Promise<{ url: string; proc: ChildProcess; flowPath: string }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-fields-"));
  const flowPath = join(dir, "flow.yaml");
  writeFileSync(flowPath, FLOW);
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui", "flow.yaml"], { cwd: dir, env: { ...process.env, CHAIN_NO_OPEN: "1" } });
    let buf = "";
    const t = setTimeout(() => reject(new Error("no start:\n" + buf)), 20000);
    const on = (d: Buffer) => { buf += d.toString(); const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); resolve({ url: m[0], proc, flowPath }); } };
    proc.stdout.on("data", on); proc.stderr.on("data", on);
  });
}
const dwell = (page: Page, ms: number) => (process.env.SLOWMO ? page.waitForTimeout(ms) : Promise.resolve());
const nodeByName = (page: Page, name: string) =>
  page.locator(".node", { has: page.locator(".nn", { hasText: new RegExp("^" + name + "$") }) });

let proc: ChildProcess, baseURL: string, flowPath: string;
test.beforeAll(async () => ({ url: baseURL, proc, flowPath } = await startServer()));
test.afterAll(() => proc?.kill());

test("editor: define an input node's fields from the panel, no raw YAML", async ({ page }) => {
  await page.goto(baseURL);
  await nodeByName(page, "start").dblclick();
  await dwell(page, 600);

  // A new input node has nothing to hide, so field setup starts expanded.
  const setup = page.locator(".flowfields-toggle");
  await expect(setup).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#pnParamsPanel")).toBeVisible();
  await expect(page.locator("#pnParams .paramrow")).toHaveCount(0);
  await page.getByRole("button", { name: "+ add field" }).click();
  await dwell(page, 500);

  // Include quotes in the default to prove generated input attributes remain intact.
  const row = page.locator("#pnParams .paramrow").first();
  await row.locator(".pf-name").fill("topic");
  await dwell(page, 300);
  await row.locator(".pf-type").selectOption("string");
  await row.locator(".pf-def").fill('chains "quoted"');
  await dwell(page, 500);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnMsg")).toContainText("saved");
  await expect(setup).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#pnParamsPanel")).toBeHidden();
  await expect(setup).toContainText("1 field");
  await expect(page.locator("#pnInput")).toContainText("Run input");
  await expect(page.locator("#pnInput")).toContainText("Session only · not saved");
  await expect(page.locator('.paramin[data-param="topic"]')).toHaveValue('chains "quoted"');
  await expect(page.locator(".runstate.default")).toHaveText("Using default");
  await expect(page.getByRole("button", { name: "Reset to default" })).toBeHidden();
  await dwell(page, 600);

  // Runtime values are session-only: they change state without dirtying or
  // rewriting the flow, and Reset returns to the effective YAML default.
  const yamlWithTopic = readFileSync(flowPath, "utf8");
  await page.locator('.paramin[data-param="topic"]').fill("runtime only");
  await expect(page.locator(".runstate.override")).toHaveText("Run override");
  await expect(page.getByRole("button", { name: "Reset to default" })).toBeVisible();
  await expect(page.locator("#pnSaveBtn")).not.toHaveClass(/dirty/);
  expect(readFileSync(flowPath, "utf8")).toBe(yamlWithTopic);
  await page.getByRole("button", { name: "Reset to default" }).click();
  await expect(page.locator('.paramin[data-param="topic"]')).toHaveValue('chains "quoted"');
  await expect(page.locator(".runstate.default")).toHaveText("Using default");
  await expect(page.getByRole("button", { name: "Reset to default" })).toBeHidden();

  // Re-open uses a keyboard-operable disclosure; rename + delete still persist
  // only through Save, and a renamed field does not inherit a stale override.
  await page.getByRole("button", { name: /close/ }).click();
  await dwell(page, 400);
  await nodeByName(page, "start").dblclick();
  await dwell(page, 400);
  await expect(setup).toHaveAttribute("aria-expanded", "false");
  await page.locator('.paramin[data-param="topic"]').fill("stale override");
  await expect(page.locator(".runstate.override")).toHaveText("Run override");
  await setup.focus();
  await setup.press("Enter");
  await expect(setup).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#pnParams .paramrow .pf-name")).toHaveValue("topic");
  await page.locator("#pnParams .paramrow .pf-name").fill("subject");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator('.paramin[data-param="topic"]')).toHaveCount(0);
  await expect(page.locator('.paramin[data-param="subject"]')).toHaveValue('chains "quoted"');
  await expect(page.locator(".runstate.default")).toHaveText("Using default");

  await setup.click();
  await page.locator("#pnParams .pf-del").click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator("#pnInput")).toContainText("No run inputs yet");
  await expect(setup).toHaveAttribute("aria-expanded", "true");
  await dwell(page, 1200);
});
