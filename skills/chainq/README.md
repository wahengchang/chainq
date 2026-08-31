# chainq agent skill

Teaches a coding agent to build a chainq flow as an actual **prompt chain** — the
model's work visible in `ai` nodes on the canvas — instead of a YAML file wrapped
around a shell script.

## Install

```bash
npx skills add wahengchang/chainq --skill chainq          # this project
npx skills add wahengchang/chainq --skill chainq -g       # every project
npx skills use wahengchang/chainq --skill chainq          # once, without installing
```

For specific agents only — repeat `-a`, one agent per flag:

```bash
npx skills add wahengchang/chainq --skill chainq \
  -a claude-code \
  -a codex \
  -a opencode
```

Claude Code users can install it as a plugin instead, which tracks the repository:

```
/plugin marketplace add wahengchang/chainq
/plugin install chainq@chainq
```

## Layout

Progressive disclosure — only `SKILL.md` loads up front:

```text
SKILL.md                        prime directive · workflow · quality gate
├── references/
│   ├── authoring.md            decomposing a request into stages
│   ├── patterns.md             six chain shapes
│   ├── flow-syntax.md          every YAML field and expression
│   ├── cli.md                  commands, flags, cheap iteration
│   └── troubleshooting.md      error message → fix
└── templates/                  three runnable flows
```

There is deliberately no `scripts/` directory. The skill's central rule is that a
flow's reasoning belongs in `ai` nodes, not in helper scripts — shipping a place to
put scripts would argue the opposite.

## Guarantees

`src/skills.test.ts` in this repository runs on every CI build and asserts that
every template here parses and validates through the real chainq engine, that the
templates obey the rule the skill teaches, that every internal link resolves, and
that the node types, commands, and flags the skill documents still exist in the
product.
