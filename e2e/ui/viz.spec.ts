// Browser E2E: open the visualizer in Chromium, step through every scenario, and
// assert the node graph renders the correct real-engine statuses. Run headed
// (`npm run e2e:ui`) to watch Chromium click through it.

import { test, expect, type Page } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const VIZ = pathToFileURL(join(here, "..", "..", "e2e-viz.html")).href;

// Read the node graph as [{ id, status }] in left-to-right order.
async function nodes(page: Page): Promise<{ id: string; status: string }[]> {
  return page.locator(".node").evaluateAll((els) =>
    els.map((e) => ({
      id: e.querySelector(".nn")?.textContent?.trim() ?? "",
      status: (e.querySelector(".stat")?.textContent?.trim() ?? "").toLowerCase(),
    })),
  );
}
const statuses = async (page: Page) => (await nodes(page)).map((n) => n.status);

test.describe("E2E visualizer (browser)", () => {
  test("page renders the graph and the 6-step list", async ({ page }) => {
    await page.goto(VIZ);
    await expect(page.getByText("E2E visualizer")).toBeVisible();
    await expect(page.locator(".step")).toHaveCount(6);
    await expect(page.locator(".node")).toHaveCount(3);
  });

  test("replays each scenario with the correct node statuses", async ({ page }) => {
    await page.goto(VIZ);

    // 1 — cold: everything ran
    expect(await nodes(page)).toEqual([
      { id: "load", status: "ran" },
      { id: "summarize", status: "ran" },
      { id: "title", status: "ran" },
    ]);

    // 2 — warm: everything cached
    await page.locator(".step").nth(1).click();
    expect(await statuses(page)).toEqual(["cached", "cached", "cached"]);

    // 3 — edit downstream: only title re-runs
    await page.locator(".step").nth(2).click();
    expect(await statuses(page)).toEqual(["cached", "cached", "ran"]);

    // 4 — edit upstream: summarize + title re-run (Merkle cascade)
    await page.locator(".step").nth(3).click();
    expect(await statuses(page)).toEqual(["cached", "ran", "ran"]);

    // 5 — pin: summarize served from the pin, title re-runs
    await page.locator(".step").nth(4).click();
    expect(await statuses(page)).toEqual(["ran", "cached", "ran"]);

    // 6 — upstream fails: downstream skipped, not crashed
    await page.locator(".step").nth(5).click();
    expect(await nodes(page)).toEqual([
      { id: "load", status: "failed" },
      { id: "summarize", status: "skipped" },
      { id: "title", status: "skipped" },
    ]);
  });
});
