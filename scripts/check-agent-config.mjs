#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");
const parse = (path) => JSON.parse(read(path));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const agents = read("AGENTS.md");
const claude = read("CLAUDE.md");
const claudeSettings = parse(".claude/settings.json");
const codexHooks = parse(".codex/hooks.json");

check(claude.trimStart().startsWith("@AGENTS.md"), "CLAUDE.md must import @AGENTS.md first");
check(Buffer.byteLength(agents, "utf8") <= 32_768, "AGENTS.md exceeds Codex's 32 KiB default");

function postWriteHook(config, label) {
  const groups = config?.hooks?.PostToolUse;
  check(Array.isArray(groups) && groups.length === 1, `${label} must define one PostToolUse group`);
  const group = groups?.[0];
  check(group?.matcher === "Edit|Write", `${label} matcher must be Edit|Write`);
  check(group?.hooks?.length === 1, `${label} must define one PostToolUse command`);
  const hook = group?.hooks?.[0];
  check(hook?.type === "command", `${label} hook must be a command`);
  check(
    typeof hook?.command === "string" && hook.command.includes("scripts/delete-appledouble.mjs"),
    `${label} must call the shared AppleDouble cleaner`,
  );
  return hook?.command ?? "";
}

const claudeCommand = postWriteHook(claudeSettings, "Claude settings");
const codexHookCommand = postWriteHook(codexHooks, "Codex hooks");
const serialized = JSON.stringify({ claudeSettings, codexHooks });
const codexProfileCommand = "codex exec --ephemeral --sandbox read-only --skip-git-repo-check --color never -";
const profileFiles = [
  "src/cli/init.ts",
  "src/cli/new.ts",
  "examples/demo.yaml",
  "examples/fan-in-merge.yaml",
  "examples/fan-in.yaml",
  "examples/fan-out.yaml",
  "examples/generate-json.yaml",
  "examples/shell-command.yaml",
];

check(claudeCommand.includes("$CLAUDE_PROJECT_DIR"), "Claude hook must resolve from CLAUDE_PROJECT_DIR");
check(codexHookCommand.includes("git rev-parse --show-toplevel"), "Codex hook must resolve from the Git root");
check(!serialized.includes("/Users/"), "agent hook config must not contain an absolute user path");
check(!/(api[_-]?key|bearer\s+|token\s*[=:])/i.test(serialized), "agent hook config appears to contain a secret");
for (const path of profileFiles) {
  check(read(path).includes(codexProfileCommand), `${path} is missing the standard Codex profile command`);
}
check(!read("README.md").includes("codex -m"), "README.md still documents interactive `codex -m`");

if (failures.length > 0) {
  process.stderr.write(`${failures.map((failure) => `✗ ${failure}`).join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("✓ agent configuration is consistent\n");
