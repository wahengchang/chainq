import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const evidenceDir = process.env.EVIDENCE_DIR
  ? resolve(process.env.EVIDENCE_DIR)
  : resolve("test-results/evidence");

test("published documentation exposes real source metadata and per-page Git dates", async ({ page }) => {
  mkdirSync(evidenceDir, { recursive: true });

  await page.goto("./");
  await expect(page).toHaveTitle("chainq | chainq documentation");
  await expect(page.getByRole("heading", { level: 1, name: "chainq" })).toBeVisible();
  await expect(page.getByText("Source:").first()).toBeVisible();
  await expect(page.getByText("Last updated: Jun 30, 2026")).toBeVisible();

  const hero = page.getByRole("img", { name: "chainq visual editor" });
  await expect(hero).toBeVisible();
  expect(await hero.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);

  await page.screenshot({
    path: resolve(evidenceDir, "phase1-01-home-source-and-last-updated.png"),
    fullPage: true,
  });

  await page.getByRole("link", { name: "CLI reference", exact: true }).first().click();
  await expect(page).toHaveURL(/\/chainq\/cli\/reference\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "CLI reference" })).toBeVisible();
  await expect(page.getByText("docs/cli/reference.md", { exact: true })).toBeVisible();
  await expect(page.getByText("Last updated: Jun 25, 2026")).toBeVisible();

  await page.screenshot({
    path: resolve(evidenceDir, "phase1-02-cli-reference-distinct-last-updated.png"),
    fullPage: true,
  });

  await page.getByRole("link", { name: "Getting started", exact: true }).first().click();
  await expect(page).toHaveURL(/\/chainq\/getting-started\/$/);
  await expect(page.getByRole("heading", { level: 1, name: "Getting started" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "1. Install chainq" })).toBeVisible();
  await expect(page.getByText("there is no import or export step")).toBeVisible();

  await page.screenshot({
    path: resolve(evidenceDir, "phase1-03-getting-started-content.png"),
    fullPage: true,
  });
});
