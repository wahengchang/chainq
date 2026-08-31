// `chainq skill install` — put the bundled agent skill where a coding agent
// looks for it.
//
// chainq ships an Agent Skill (skills/chainq/) that teaches an agent how to
// author a real prompt chain instead of a YAML file full of shell steps. The
// skill is plain files, so "installing" it is a directory copy — no registry, no
// network, and it works straight from npx:
//
//   npx @wahengchang2023/chainq skill install            → ./.claude/skills/chainq
//   npx @wahengchang2023/chainq skill install --global   → ~/.claude/skills/chainq
//   npx @wahengchang2023/chainq skill install --dir <p>  → <p>/chainq  (other agents)
//   npx @wahengchang2023/chainq skill path               → the bundled source dir
//
// Project scope is the default: it is visible in the repo, reviewable in a diff,
// and committable, where a silent write into $HOME is none of those.

import { cpSync, existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Directory name of the skill — also the command name the agent sees (`/chainq`). */
export const SKILL_NAME = "chainq";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The skill shipped inside the package: <package root>/skills/chainq.
 * Two levels up from this file resolves to the package root both in dev
 * (src/cli/skill.ts) and in the published build (dist/cli/skill.js), so there is
 * one path expression, not two.
 */
export function bundledSkillDir(): string {
  return resolve(HERE, "..", "..", "skills", SKILL_NAME);
}

export interface InstallOptions {
  /** Directory that will CONTAIN the skill folder, e.g. `<x>/.claude/skills`. */
  into: string;
  force?: boolean;
}

export interface InstallResult {
  /** The installed skill directory, `<into>/chainq`. */
  dest: string;
  /** Every file written, relative to `dest`, sorted. */
  files: string[];
}

/** Copy the bundled skill into `opts.into`. Throws rather than clobbering an
 * existing install unless `force` is set — an agent skill is a file the user may
 * have edited. */
export function installSkill(opts: InstallOptions): InstallResult {
  const src = bundledSkillDir();
  if (!existsSync(src)) {
    throw new Error(`bundled skill not found at ${src} — is the package installed correctly?`);
  }
  const dest = join(resolve(opts.into), SKILL_NAME);
  if (existsSync(dest)) {
    if (!opts.force) {
      throw new Error(`${dest} already exists — pass --force to replace it`);
    }
    rmSync(dest, { recursive: true, force: true });
  }
  cpSync(src, dest, { recursive: true });
  return { dest, files: listFiles(dest) };
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

/** Where `--global` / `--project` / `--dir` each put the skill folder. */
export function resolveTarget(
  args: string[],
  cwd: string,
  home: string,
): { into: string; scope: "global" | "project" | "custom" } {
  const dirIdx = args.indexOf("--dir");
  if (dirIdx >= 0) {
    const value = args[dirIdx + 1];
    if (!value || value.startsWith("--")) throw new Error("--dir expects a directory path");
    return { into: resolve(cwd, value), scope: "custom" };
  }
  if (args.includes("--global") || args.includes("-g")) {
    return { into: join(home, ".claude", "skills"), scope: "global" };
  }
  return { into: join(cwd, ".claude", "skills"), scope: "project" };
}

const USAGE = `usage: chainq skill install [--global | --dir <path>] [--force]
       chainq skill path`;

export function runSkill(args: string[]): number {
  const sub = args[0];

  if (sub === "path") {
    console.log(bundledSkillDir());
    return 0;
  }

  if (sub !== "install") {
    console.error(USAGE);
    return 2;
  }

  const rest = args.slice(1);
  let target: ReturnType<typeof resolveTarget>;
  try {
    target = resolveTarget(rest, process.cwd(), homedir());
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  let result: InstallResult;
  try {
    result = installSkill({ into: target.into, force: rest.includes("--force") });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 1;
  }

  console.error(`installed the chainq skill (${result.files.length} files) to:`);
  console.error(`  ${result.dest}`);
  console.error(`\nnext:`);
  console.error(`  restart your agent, then ask it to build a chainq flow (or type /chainq)`);
  if (target.scope === "project") {
    console.error(`  chainq skill install --global         # install it for every project instead`);
  }
  return 0;
}
