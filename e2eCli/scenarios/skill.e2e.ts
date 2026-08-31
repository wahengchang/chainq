// Installing the bundled agent skill through the real CLI: it lands in the
// project, it is validated content (the templates it ships are runnable flows),
// and it never silently replaces a copy the user edited.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";

describe("skill install", () => {
  it("installs into the project's .claude/skills/chainq by default", () => {
    const p = newProject();
    const r = p.chain("skill", "install");
    expect(r.code).toBe(0);
    expect(p.exists(".claude/skills/chainq/SKILL.md")).toBe(true);
    expect(p.exists(".claude/skills/chainq/references/authoring.md")).toBe(true);
    expect(p.exists(".claude/skills/chainq/templates/refine.yaml")).toBe(true);
  });

  it("ships templates the CLI itself accepts", () => {
    const p = newProject();
    p.chain("skill", "install");
    const r = p.chain("validate", ".claude/skills/chainq/templates/refine.yaml");
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/valid/);
  });

  it("refuses to clobber an edited install without --force", () => {
    const p = newProject();
    p.chain("skill", "install");
    p.write(".claude/skills/chainq/SKILL.md", "edited by the user");
    const r = p.chain("skill", "install");
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/already exists/);
    expect(p.read(".claude/skills/chainq/SKILL.md")).toBe("edited by the user");
  });

  it("--force replaces it", () => {
    const p = newProject();
    p.chain("skill", "install");
    p.write(".claude/skills/chainq/SKILL.md", "edited by the user");
    expect(p.chain("skill", "install", "--force").code).toBe(0);
    expect(p.read(".claude/skills/chainq/SKILL.md")).toMatch(/^---\nname: chainq/);
  });

  it("skill path prints the bundled source directory", () => {
    const p = newProject();
    const r = p.chain("skill", "path");
    expect(r.code).toBe(0);
    expect(r.out.trim()).toMatch(/skills[/\\]chainq$/);
  });
});
