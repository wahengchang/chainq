# Agent skill

chainq ships an [Agent Skill](https://agentskills.io) that teaches a coding agent
— Claude Code and any other tool that reads the same format — how to author a
chainq flow. Install it once and "build me a flow that reviews my PR description"
produces a real prompt chain instead of a YAML file wrapped around a shell script.

## What the skill contains

| File | Purpose |
|---|---|
| `SKILL.md` | the prime directive, the chain-smell checklist, and the six-step authoring workflow |
| `references/authoring.md` | how to decompose a request into steps, with before/after examples |
| `references/flow-syntax.md` | every node field, template expression, and validation rule |
| `references/patterns.md` | six proven chain shapes |
| `references/cli.md` | commands, flags, and how to iterate without spending model calls |
| `references/troubleshooting.md` | error message to fix |
| `templates/*.yaml` | three runnable starting flows |

`SKILL.md` is the only file loaded up front. The agent opens a reference file when
the task needs it, so the skill costs almost nothing until it is used.

## Install it

### For one project

```bash
npx @wahengchang2023/chainq skill install
```

Writes `.claude/skills/chainq/` in the current directory. Commit it and everyone
working in the repository gets the same skill.

### For every project

```bash
npx @wahengchang2023/chainq skill install --global
```

Writes `~/.claude/skills/chainq/`.

### As a Claude Code plugin

```bash
/plugin marketplace add wahengchang/chainq
/plugin install chainq@chainq
```

The plugin tracks the repository, so `/plugin marketplace update chainq` picks up
a newer version of the skill.

### For another agent

```bash
npx @wahengchang2023/chainq skill path          # print the bundled source directory
npx @wahengchang2023/chainq skill install --dir <path>
```

`--dir` copies the skill folder into any directory. Add `--force` to replace an
existing install; without it, chainq refuses rather than overwrite a copy you may
have edited.

## Use it

Restart the agent, then describe the workflow you want:

> Build me a chainq flow that reads `notes.md`, pulls out the decisions and the
> open questions, and writes a summary to `out/`.

Claude Code users can also invoke it by name with `/chainq`.

## Options

| Option | Effect |
|---|---|
| `--global`, `-g` | install to `~/.claude/skills/` instead of the project |
| `--dir <path>` | install into `<path>/chainq` |
| `--force` | replace an existing install |

See the [CLI reference](../reference/cli.md) for every other command.
