// `chain new` — generate a new workflow YAML, and a project can hold several.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";

describe("new", () => {
  it("creates a new workflow file that validates and runs offline", () => {
    const p = newProject();
    expect(p.chain("new", "blog").code).toBe(0);
    expect(p.exists("blog.yaml")).toBe(true);

    expect(p.chain("validate", "blog.yaml").code).toBe(0);
    const { status } = p.run(["run", "blog.yaml", "--profile", "fake"]);
    expect(status).toMatchObject({ draft: "ran", refine: "ran" });
  });

  it("appends .yaml when the name has no extension", () => {
    const p = newProject();
    p.chain("new", "tweets");
    expect(p.exists("tweets.yaml")).toBe(true);
  });

  it("refuses to overwrite an existing workflow without --force", () => {
    const p = newProject();
    p.chain("new", "blog");
    const r = p.chain("new", "blog");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/refusing to overwrite/);
    expect(p.chain("new", "blog", "--force").code).toBe(0);
  });

  it("a project can hold several workflows (chain ls finds them)", () => {
    const p = newProject();
    p.chain("new", "a");
    p.chain("new", "b");
    const ls = p.chain("ls").out;
    expect(ls).toMatch(/a\.yaml/);
    expect(ls).toMatch(/b\.yaml/);
  });
});
