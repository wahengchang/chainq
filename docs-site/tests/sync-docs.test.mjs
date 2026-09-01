import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { parse as parseYaml } from "yaml";
import { GENERATED_DOCS, MANIFEST_PATH, SITE_ROOT, syncDocs } from "../scripts/sync-docs.mjs";
import { validateGeneratedDocs } from "../scripts/validate-generated-docs.mjs";

// The manifest is the only source of truth for what gets published, so what the
// sync must produce is read from it. A hard-coded page count goes stale the next
// time a page is added, and checking a number never catches the sync publishing
// the wrong page — comparing the actual set of outputs does.
const manifestOutputs = parseYaml(readFileSync(MANIFEST_PATH, "utf8")).files.map((f) => f.to);

describe("same-repository documentation sync", () => {
  let result;

  beforeAll(() => {
    result = syncDocs();
  });

  test("generates every allowlisted page with source metadata", () => {
    expect(result.pages.map((page) => page.outputPath).sort()).toEqual([...manifestOutputs].sort());
    for (const output of manifestOutputs) {
      expect(existsSync(resolve(GENERATED_DOCS, output)), `${output} was not written`).toBe(true);
    }
    const home = readFileSync(resolve(GENERATED_DOCS, "index.md"), "utf8");
    expect(home).toContain("lastUpdated:");
    expect(home).toContain("Source: [`README.md`]");
    expect(home).not.toContain("\n# chainq\n");
  });

  test("rewrites links to published pages using the GitHub Pages base", () => {
    const home = readFileSync(resolve(GENERATED_DOCS, "index.md"), "utf8");
    expect(home).toContain("/chainq/getting-started/");
    expect(home).toContain("/chainq/reference/cli/");
  });

  test("links unlisted repository files to the exact source commit", () => {
    const home = readFileSync(resolve(GENERATED_DOCS, "index.md"), "utf8");
    expect(home).toContain(`/blob/${result.sourceCommit}/examples/generate-json.yaml`);
  });

  test("copies local images into a source-keyed public directory", () => {
    const home = readFileSync(resolve(GENERATED_DOCS, "index.md"), "utf8");
    expect(home).toContain("/chainq/generated/chainq/docs/screenshots/doc-sample-1.png");
    expect(
      existsSync(resolve(SITE_ROOT, "public/generated/chainq/docs/screenshots/doc-sample-1.png")),
    ).toBe(true);
  });

  test("validates the complete generated output", () => {
    expect(validateGeneratedDocs()).toEqual({ pages: new Set(manifestOutputs).size });
  });
});
