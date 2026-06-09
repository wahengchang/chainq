// Browser E2E — C4 schema panel editor. An ai node's panel has a schema field;
// setting it round-trips through the YAML. Pure structural edit (no run), offline.
// Title carries "editor" so `npm run e2e:ui:demo` (-g editor) picks it up.

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
  gen:
    type: ai
    prompt: 'make json'
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-schema-"));
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

test("editor sets an ai node's output schema via the two-level format selector (offline)", async ({ page }) => {
  await page.goto(baseURL);
  await nodeByName(page, "gen").click();
  // schema describes the OUTPUT shape → it lives in the output column as a two-level
  // editor: pick an OUTPUT FORMAT first (Text/JSON/List), only JSON exposes fields.
  const editor = page.locator("#pnSchema");
  const wrap = editor.locator("#pnSchemaWrap");
  const hdr = editor.locator(".schemahdr");
  const chip = editor.locator("#pnFmtNow");
  const body = editor.locator(".schemabody");
  const rows = editor.locator("#pnSchemaRows .paramrow");
  const fmt = (v: string) => editor.locator(`.fmtbtn[data-fmt="${v}"]`);
  const save = async () => { await page.getByRole("button", { name: "Save" }).click(); await expect(page.locator("#pnMsg")).toContainText("saved"); };

  // COLLAPSE/EXPAND: the OUTPUT FORMAT box starts collapsed — only the active
  // format shows (as a chip in the header); the selector/fields stay hidden.
  await expect(wrap).toHaveClass(/collapsed/);
  await expect(chip).toHaveText("Text");
  await expect(body).toBeHidden();
  await dwell(page, 700);
  await hdr.click(); // expand → the full settings appear, the chip goes away
  await expect(wrap).not.toHaveClass(/collapsed/);
  await expect(body).toBeVisible();
  await expect(chip).toBeHidden();
  await dwell(page, 700);

  // a node with no schema defaults to Text (the common case) — no fields shown.
  await expect(wrap).toHaveClass(/fmt-text/);
  await expect(rows).toHaveCount(0);
  await dwell(page, 600);

  // NON-DESTRUCTIVE SWITCH: build JSON fields, flip to Text, flip back — fields survive.
  await fmt("json").click();
  await expect(wrap).toHaveClass(/fmt-json/);
  const addField = editor.getByRole("button", { name: "+ add field" });
  await addField.click();
  await rows.nth(0).locator(".pf-name").fill("title");
  await addField.click();
  await rows.nth(1).locator(".pf-name").fill("tags");
  await rows.nth(1).locator(".pf-type").selectOption("array");
  await dwell(page, 500);
  // preview reflects the live fields (sample value per type)
  await expect(editor.locator("#pnSchemaPrev .prevcode")).toContainText('"title": "…", "tags": ["…"]');
  // collapsing now shows JSON as the active format; expanding restores the fields.
  await hdr.click();
  await expect(wrap).toHaveClass(/collapsed/);
  await expect(chip).toHaveText("JSON");
  await dwell(page, 600);
  await hdr.click();
  await expect(wrap).not.toHaveClass(/collapsed/);
  await dwell(page, 400);
  await fmt("text").click(); // misclick to Text…
  await expect(wrap).toHaveClass(/fmt-text/);
  await fmt("json").click(); // …and back: the 2 fields are still here (not nuked)
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator(".pf-name")).toHaveValue("title");
  await expect(rows.nth(1).locator(".pf-type")).toHaveValue("array");
  await dwell(page, 500);

  // JSON ROUND-TRIP: save → re-parsed from YAML → mode + fields + types persist.
  await save();
  await expect(wrap).toHaveClass(/fmt-json/);
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator(".pf-name")).toHaveValue("title");
  await expect(rows.nth(0).locator(".pf-type")).toHaveValue("string");
  await expect(rows.nth(1).locator(".pf-name")).toHaveValue("tags");
  await expect(rows.nth(1).locator(".pf-type")).toHaveValue("array");
  await dwell(page, 500);

  // LIST ROUND-TRIP: a bare list can't be top-level, so List wraps it in `_list`.
  await fmt("list").click();
  await expect(wrap).toHaveClass(/fmt-list/);
  await expect(editor.locator("#pnSchemaPrev .prevcode")).toContainText('"_list": [ "…", "…" ]');
  await save();
  await expect(wrap).toHaveClass(/fmt-list/); // {_list:array} detected as List on reload
  await dwell(page, 500);

  // BACK TO TEXT: clearing the format removes the schema entirely.
  await fmt("text").click();
  await save();
  await expect(wrap).toHaveClass(/fmt-text/);
  await dwell(page, 800);
});
