import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { GENERATED_DOCS, SITE_ROOT, syncDocs } from "../scripts/sync-docs.mjs";
import { validateGeneratedDocs } from "../scripts/validate-generated-docs.mjs";

describe("same-repository documentation sync", () => {
  let result;

  beforeAll(() => {
    result = syncDocs();
  });

  test("generates every allowlisted page with source metadata", () => {
    expect(result.pages).toHaveLength(12);
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
    expect(validateGeneratedDocs()).toEqual({ pages: 12 });
  });
});
