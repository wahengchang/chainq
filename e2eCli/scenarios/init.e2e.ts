// Creating a new project: scaffold structure (offline) → run with the real model
// (gated) → don't clobber.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import { haveClaude, haveCodex } from "../harness/cli.js";

describe("init", () => {
  it("scaffolds a project (flow.yaml + .gitignore + input.txt)", () => {
    const p = newProject();
    expect(p.chain("init").code).toBe(0);
    expect(p.exists("flow.yaml")).toBe(true);
    expect(p.exists(".gitignore")).toBe(true);
    expect(p.exists("input.txt")).toBe(true);
    expect(p.read("flow.yaml")).toContain("default: { cmd: 'claude -p' }");
    expect(p.read("flow.yaml")).toContain("codex exec --ephemeral --sandbox read-only");
  });

  it.skipIf(!haveClaude)("the scaffolded flow runs end-to-end (real model)", () => {
    const p = newProject();
    p.chain("init");
    const { status } = p.run(["run", "flow.yaml"]); // no fake model — real claude -p
    expect(status).toMatchObject({ load: "ran", summarize: "ran" });
  });

  it.skipIf(!haveCodex)("the scaffolded flow runs with the real Codex profile", () => {
    const p = newProject();
    p.chain("init");
    const { result, status } = p.run(["run", "flow.yaml", "--profile", "codex"]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).not.toBe("");
    expect(status).toMatchObject({ load: "ran", summarize: "ran" });
  }, 120_000);

  it("refuses to clobber an existing flow.yaml without --force", () => {
    const p = newProject();
    p.chain("init");
    const r = p.chain("init");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/refusing to overwrite/);
  });

  it("--force overwrites an existing project", () => {
    const p = newProject();
    p.chain("init");
    expect(p.chain("init", "--force").code).toBe(0);
  });
});
