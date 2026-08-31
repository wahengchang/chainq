# Agent skill

chainq ships an [Agent Skill](https://agentskills.io) that teaches a coding agent
how to author a chainq flow. Install it once and "build me a flow that reviews my
PR description" produces a real prompt chain instead of a YAML file wrapped around
a shell script.

## Install it

The skill lives at `skills/chainq/` in this repository, in the open Agent Skills
layout, so the standard [`skills`](https://github.com/vercel-labs/skills) CLI
installs it directly:

```bash
npx skills add wahengchang/chainq --skill chainq          # this project
npx skills add wahengchang/chainq --skill chainq -g       # every project
npx skills use wahengchang/chainq --skill chainq          # once, without installing
```

That one command covers Claude Code, Codex, Cursor, opencode, Cline and a dozen
more agents. Narrow it by repeating `-a`, one agent per flag:

```bash
npx skills add wahengchang/chainq --skill chainq -a claude-code -a codex
```

A comma-separated list is rejected — `-a claude-code,codex` fails with
`Invalid agents`.

Claude Code users can install it as a plugin instead, which tracks this
repository and updates with `/plugin marketplace update chainq`:

```
/plugin marketplace add wahengchang/chainq
/plugin install chainq@chainq
```

## What the skill contains

| File | Purpose |
|---|---|
| `SKILL.md` | the prime directive, the authoring workflow, and the quality gate |
| `references/authoring.md` | decomposing a request into stages, with before/after examples |
| `references/patterns.md` | six proven chain shapes |
| `references/flow-syntax.md` | every node field, template expression, and validation rule |
| `references/cli.md` | commands, flags, and how to iterate without spending model calls |
| `references/troubleshooting.md` | error message to fix |
| `templates/*.yaml` | three runnable starting flows |

`SKILL.md` is the only file loaded up front. The agent opens a reference when the
task needs it, so the skill costs almost nothing until it is used.

## What it teaches

The failure it exists to prevent is a flow whose real work sits in `cmd` steps or
in one oversized prompt — a task runner with chainq syntax. The skill's rule is
that the model's work belongs in visible `ai` nodes, while `cmd` stays a narrow
deterministic boundary; a command may sit mid-chain, but it must never carry
reasoning or call a model on an `ai` node's behalf. It also guards the other
direction: a full prompt chain is not a maximal one, and a stage earns its own
node only when its output is worth inspecting, reusing, caching, or tuning alone.

## Use it

Restart the agent, then describe the workflow you want:

> Build me a chainq flow that reads `notes.md`, pulls out the decisions and the
> open questions, and writes a summary to `out/`.

Claude Code users can also invoke it by name with `/chainq`.

## How it stays correct

`src/skills.test.ts` runs in CI and fails the build if the skill drifts from the
product: every shipped template is parsed and validated by the real engine, the
templates must obey the rule the skill teaches, every internal link must resolve,
and every node type, command, and flag the skill documents must still exist.

See the [CLI reference](../reference/cli.md) for the commands themselves.
