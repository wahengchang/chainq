// Browser E2E — the Stop button. Mid-run you realise the flow is wrong, but more
// nodes are queued; Stop must abort the whole run immediately: the running node's
// process is killed and the queued downstream never executes. Offline — a slow
// `cmd` (sleep) gives a window to hit Stop, a downstream `cmd` is the witness that
// must never run. Title carries "editor" so `npm run e2e:ui:demo` (-g editor) picks
// it up.

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

// slow → after: `slow` sleeps long enough to hit Stop; `after` is the witness that
// must NOT run once we stop. perItem so it genuinely waits on slow's output.
const FLOW = `profiles:
  default: { cmd: 'claude -p' }
steps:
  slow:
    type: cmd
    run: 'sleep 4'
  after:
    type: cmd
    from: slow
    mode: perItem
    run: 'echo done'
`;

function startServer(): Promise<{ url: string; proc: ChildProcess }> {
  const dir = mkdtempSync(join(tmpdir(), "chain-stop-"));
  writeFileSync(join(dir, "flow.yaml"), FLOW);
  return new Promise((resolve, reject) => {
    const proc = spawn(TSX, [CLI, "ui", "flow.yaml"], { cwd: dir, env: { ...process.env, CHAIN_NO_OPEN: "1" } });
    let buf = "";
    const t = setTimeout(() => reject(new Error("no start:\n" + buf)), 20000);
    const onData = (d: Buffer) => { buf += d.toString(); const m = buf.match(/http:\/\/127\.0\.0\.1:\d+\//); if (m) { clearTimeout(t); resolve({ url: m[0], proc }); } };
    proc.stdout.on("data", onData); proc.stderr.on("data", onData);
  });
}
const dwell = (page: Page, ms: number) => (process.env.SLOWMO ? page.waitForTimeout(ms) : Promise.resolve());
const nodeByName = (page: Page, name: string) =>
  page.locator(".node", { has: page.locator(".nn", { hasText: new RegExp("^" + name + "$") }) });

let proc: ChildProcess, baseURL: string;
test.beforeAll(async () => ({ url: baseURL, proc } = await startServer()));
test.afterAll(() => proc?.kill());

test("editor stops a running flow mid-flight — the queued downstream never runs", async ({ page }) => {
  await page.goto(baseURL);
  const stop = page.locator("#stopBtn");
  const slow = nodeByName(page, "slow");
  const after = nodeByName(page, "after");

  // idle: no Stop button.
  await expect(stop).toBeHidden();
  await dwell(page, 500);

  // Run all → Stop appears, and `slow` starts running (spinner), `after` queues.
  await page.getByRole("button", { name: "Run all" }).click();
  await expect(stop).toBeVisible();
  await expect(slow).toHaveClass(/running/); // the ONE node actually executing
  await expect(after).toHaveClass(/pending/); // queued behind it
  await dwell(page, 1000);

  // hit Stop — the run aborts: button hides, a "中止" notice shows.
  await stop.click();
  await expect(stop).toBeHidden();
  await expect(page.locator("#canvasMsg")).toContainText("中止");
  await dwell(page, 800);

  // PROOF it really stopped: wait well past when `slow` (sleep 4) would have
  // finished — `after` must never have run (no ✓ ran), since the chain was killed.
  await page.waitForTimeout(4500);
  await expect(after.locator(".glyph.g-ran")).toHaveCount(0);
  await expect(slow.locator(".glyph.g-ran")).toHaveCount(0);
  await dwell(page, 800);

  // and the editor is usable again: a fresh Run all is accepted (Stop reappears).
  await page.getByRole("button", { name: "Run all" }).click();
  await expect(stop).toBeVisible();
  await stop.click(); // don't leave a 4s sleep running
  await expect(stop).toBeHidden();
  await dwell(page, 600);
});
