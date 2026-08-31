// Guards for the shipped Agent Skill (skills/chainq/).
//
// The skill is prose, so nothing else would catch it going stale. Two jobs here:
//
//   CONTENT  — every flow the skill hands an agent is run through the real
//              engine, and the templates must obey the rule the skill teaches.
//   DRIFT    — the skill restates node types, CLI commands, and run flags. Those
//              are asserted against the engine's own NODE_TYPES and the CLI
//              source, so renaming a flag or a node type fails here instead of
//              silently teaching agents something that no longer exists.
//
// Distribution is `npx skills add` (the open skills CLI), which reads these same
// files from the repository — there is no chainq-specific installer to test.

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  NODE_TYPES,
  parseFlow,
  promptRefs,
  topoOrder,
  upstreamsOf,
  validate,
} from "./engine/index.js";

const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "skills", "chainq");
const TEMPLATE_DIR = join(SKILL_DIR, "templates");
// Every command and flag the CLI understands, across the whole thin shell —
// `--force` is parsed in init.ts/new.ts, not in the dispatcher.
const CLI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "cli");
const CLI_SOURCE = readdirSync(CLI_DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => readFileSync(join(CLI_DIR, f), "utf8"))
  .join("\n");

const read = (rel: string): string => readFileSync(join(SKILL_DIR, rel), "utf8");
const markdownFiles = (): string[] => [
  "SKILL.md",
  ...readdirSync(join(SKILL_DIR, "references")).map((f) => join("references", f)),
];
const templates = (): string[] => readdirSync(TEMPLATE_DIR).filter((f) => f.endsWith(".yaml"));

describe("the shipped skill is discoverable", () => {
  it("has the frontmatter the skills CLI requires to list it", () => {
    const md = read("SKILL.md");
    expect(md.startsWith("---\n")).toBe(true); // frontmatter is only read as line 1
    const front = md.slice(4, md.indexOf("\n---", 4));
    expect(front).toMatch(/^name: chainq$/m);
    expect(front).toMatch(/^description: .+/m);
  });

  it("resolves every file it links to", () => {
    for (const file of markdownFiles()) {
      const links = [...read(file).matchAll(/\]\((?!https?:)([^)#]+)\)/g)].map((m) => m[1]!);
      for (const link of links) {
        const target = resolve(SKILL_DIR, dirname(file), link);
        expect(existsSync(target), `${file} links to missing ${link}`).toBe(true);
      }
    }
  });
});

describe("shipped templates", () => {
  it("are flows the real engine accepts", () => {
    expect(templates().length).toBeGreaterThan(0);
    for (const name of templates()) {
      const errors = validate(parseFlow(readFileSync(join(TEMPLATE_DIR, name), "utf8")));
      expect(errors, `${name}: ${errors.map((e) => `${e.node}: ${e.message}`).join(", ")}`).toEqual(
        [],
      );
    }
  });

  it("keep the semantic work in ai nodes and out of commands", () => {
    // The skill's own rule, enforced on the files it hands out: cmd stays a
    // narrow deterministic boundary (no shell syntax — there is no shell — and
    // no script standing in for a prompt), and the chain has real prompt stages.
    for (const name of templates()) {
      const nodes = Object.values(parseFlow(readFileSync(join(TEMPLATE_DIR, name), "utf8")).steps);
      const ai = nodes.filter((n) => n.type === "ai");
      expect(ai.length, `${name} has no prompt stages to teach`).toBeGreaterThanOrEqual(2);
      for (const n of nodes.filter((n) => n.type === "cmd")) {
        expect(n.run, `${name}: ${n.id} uses shell syntax`).not.toMatch(/[|><&*]/);
        expect(n.run, `${name}: ${n.id} hides the chain in a script`).not.toMatch(
          /\b(?:node|python3?|bash|sh|ruby|deno|bun)\b/,
        );
      }
    }
  });

  it("carry the flow's source material through to the final stage", () => {
    // A revise/synthesis stage that never sees the original request quietly drops
    // its constraints (asked for 3 sentences, got 3 paragraphs). A node "carries"
    // the source if it names a carrier with $('id'), or reads one through $json
    // via its primary upstream. The last ai stage of every template must carry.
    for (const name of templates()) {
      const flow = parseFlow(readFileSync(join(TEMPLATE_DIR, name), "utf8"));
      const roots = Object.values(flow.steps).filter((n) => upstreamsOf(n).length === 0);
      const carriers = new Set(roots.map((n) => n.id));
      for (const id of topoOrder(flow)) {
        const node = flow.steps[id]!;
        if (!node.prompt) continue;
        const refs = promptRefs(node.prompt);
        const primary = upstreamsOf(node)[0];
        const carries =
          refs.nodes.some((r) => carriers.has(r)) ||
          (refs.usesJson && primary !== undefined && carriers.has(primary));
        if (carries) carriers.add(id);
      }
      const aiNodes = Object.values(flow.steps).filter((n) => n.type === "ai");
      const last = aiNodes[aiNodes.length - 1]!;
      expect(
        carriers.has(last.id),
        `${name}: final stage "${last.id}" never sees the flow's source material`,
      ).toBe(true);
    }
  });
});

describe("the skill does not drift from the product", () => {
  it("names exactly the node types the engine has", () => {
    const table = read("references/flow-syntax.md");
    const declared = [...table.matchAll(/`(input|ai|cmd|assemble|write)`/g)].map((m) => m[1]!);
    for (const type of NODE_TYPES) {
      expect(declared, `flow-syntax.md never documents "${type}"`).toContain(type);
    }
    // and nothing the engine dropped: every `type: x` the skill shows must exist
    for (const file of markdownFiles().concat(templates().map((t) => join("templates", t)))) {
      for (const [, used] of read(file).matchAll(/^\s*type:\s*(\w+)\s*$/gm)) {
        expect(NODE_TYPES, `${file} uses removed node type "${used}"`).toContain(used);
      }
    }
  });

  it("only shows CLI commands and flags the CLI still accepts", () => {
    // Only what the skill shows as a command — prose ("chainq prints a preflight")
    // is not an instruction an agent will type.
    const cli = read("references/cli.md");
    const code = [
      ...[...cli.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map((m) => m[1]!),
      ...[...cli.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!),
    ].join("\n");
    const commands = new Set([...code.matchAll(/\bchainq (\w+)/g)].map((m) => m[1]!));
    for (const cmd of commands) {
      expect(CLI_SOURCE, `cli.md documents "chainq ${cmd}", which the CLI no longer has`).toContain(
        `"${cmd}"`,
      );
    }
    // chainq's own flags: those on a line that runs chainq, plus the bare
    // `--flag` spans of the options tables. `claude -p --model opus` names a
    // flag of the model CLI, not of chainq, so it must not be swept up.
    const flagLines = code
      .split("\n")
      .filter((l) => l.includes("chainq") && !/^\s*(?:npx\s+)?skills\b/.test(l));
    const flags = new Set([
      ...flagLines.flatMap((l) => [...l.matchAll(/(--[a-z][a-z-]+)/g)].map((m) => m[1]!)),
      ...[...cli.matchAll(/`(--[a-z][a-z-]+)`/g)].map((m) => m[1]!),
    ]);
    for (const flag of flags) {
      expect(CLI_SOURCE, `cli.md documents "${flag}", which the CLI no longer has`).toContain(
        `"${flag}"`,
      );
    }
  });
});
