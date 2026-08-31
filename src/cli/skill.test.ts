// Unit tests for `chainq skill install` — the shipped agent skill and the copy
// that installs it.
//
// Two things are guarded here. The mechanics (where the copy lands, refusing to
// clobber an edited install), and the CONTENT: every template the skill hands an
// agent is validated by the real engine, so a skill can never ship a flow that
// chainq itself would reject.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundledSkillDir, installSkill, resolveTarget, SKILL_NAME } from "./skill.js";
import { parseFlow, validate } from "../engine/index.js";

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "chainq-skill-"));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("the bundled skill", () => {
  it("ships a SKILL.md with name + description frontmatter", () => {
    const md = readFileSync(join(bundledSkillDir(), "SKILL.md"), "utf8");
    expect(md.startsWith("---\n")).toBe(true); // frontmatter is only read as line 1
    const front = md.slice(4, md.indexOf("\n---", 4));
    expect(front).toMatch(/^name: chainq$/m);
    expect(front).toMatch(/^description: .+/m);
  });

  it("references every file it points at", () => {
    const dir = bundledSkillDir();
    const md = readFileSync(join(dir, "SKILL.md"), "utf8");
    const links = [...md.matchAll(/\]\((references\/[^)]+)\)/g)].map((m) => m[1]!);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(existsSync(join(dir, link)), `SKILL.md links to missing ${link}`).toBe(true);
    }
  });

  it("only offers templates the real engine accepts", () => {
    const dir = join(bundledSkillDir(), "templates");
    const templates = readdirSync(dir).filter((f) => f.endsWith(".yaml"));
    expect(templates.length).toBeGreaterThan(0);
    for (const name of templates) {
      const errors = validate(parseFlow(readFileSync(join(dir, name), "utf8")));
      expect(errors, `${name}: ${errors.map((e) => `${e.node}: ${e.message}`).join(", ")}`).toEqual(
        [],
      );
    }
  });

  it("keeps every template a prompt chain, not a script runner", () => {
    // The skill's own prime directive, enforced on the files it hands out: the
    // work lives in `ai` steps, and `cmd` never carries shell syntax (there is
    // no shell — `run` is spawned as argv).
    const dir = join(bundledSkillDir(), "templates");
    for (const name of readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
      const flow = parseFlow(readFileSync(join(dir, name), "utf8"));
      const nodes = Object.values(flow.steps);
      const ai = nodes.filter((n) => n.type === "ai");
      const cmd = nodes.filter((n) => n.type === "cmd");
      expect(ai.length, `${name} has too few ai steps to be a chain`).toBeGreaterThanOrEqual(2);
      expect(cmd.length, `${name} leans on commands`).toBeLessThan(ai.length);
      for (const n of cmd) expect(n.run, `${name}: ${n.id} uses shell syntax`).not.toMatch(/[|><&*]/);
    }
  });
});

describe("installSkill", () => {
  it("copies the whole skill into <into>/chainq", () => {
    const { dest, files } = installSkill({ into: join(tmp, ".claude", "skills") });
    expect(dest).toBe(join(tmp, ".claude", "skills", SKILL_NAME));
    expect(files).toContain("SKILL.md");
    expect(files.some((f) => f.startsWith("references/"))).toBe(true);
    expect(files.some((f) => f.startsWith("templates/"))).toBe(true);
    expect(existsSync(join(dest, "SKILL.md"))).toBe(true);
  });

  it("refuses to clobber an existing install", () => {
    const into = join(tmp, "skills");
    installSkill({ into });
    writeFileSync(join(into, SKILL_NAME, "SKILL.md"), "edited by the user");
    expect(() => installSkill({ into })).toThrow(/already exists/);
    expect(readFileSync(join(into, SKILL_NAME, "SKILL.md"), "utf8")).toBe("edited by the user");
  });

  it("replaces a stale install with --force, leaving no removed files behind", () => {
    const into = join(tmp, "skills");
    installSkill({ into });
    writeFileSync(join(into, SKILL_NAME, "stale.md"), "from an older version");
    const { files } = installSkill({ into, force: true });
    expect(files).not.toContain("stale.md");
    expect(existsSync(join(into, SKILL_NAME, "stale.md"))).toBe(false);
  });
});

describe("resolveTarget", () => {
  const cwd = "/work/project";
  const home = "/home/user";

  it("defaults to the project's .claude/skills", () => {
    expect(resolveTarget([], cwd, home)).toEqual({
      into: "/work/project/.claude/skills",
      scope: "project",
    });
  });

  it("--global targets the home skills directory", () => {
    expect(resolveTarget(["--global"], cwd, home).into).toBe("/home/user/.claude/skills");
    expect(resolveTarget(["-g"], cwd, home).scope).toBe("global");
  });

  it("--dir resolves against the working directory", () => {
    expect(resolveTarget(["--dir", "agents"], cwd, home)).toEqual({
      into: "/work/project/agents",
      scope: "custom",
    });
  });

  it("--dir without a value is an error, not a silent home write", () => {
    expect(() => resolveTarget(["--dir"], cwd, home)).toThrow(/expects a directory/);
    expect(() => resolveTarget(["--dir", "--force"], cwd, home)).toThrow(/expects a directory/);
  });
});
