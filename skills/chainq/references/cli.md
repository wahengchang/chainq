# CLI reference

Paths are resolved from the current directory, except paths *inside* a flow
(`cmd.inputs`, `write.path`), which resolve from the flow file's directory.

Install once (`npm i -g @wahengchang2023/chainq`) or prefix any command with
`npx @wahengchang2023/chainq`. Needs Node 18+. An `ai` node uses the local CLI's
own login — for the default profile, `claude login` first.

## Commands

| Command | Does |
|---|---|
| `chainq init [dir] [--force]` | scaffold `flow.yaml`, `.gitignore`, `input.txt` |
| `chainq new <name> [--force]` | add one more flow file to the current project |
| `chainq ui [flow.yaml]` | open the visual editor on a random `127.0.0.1` port |
| `chainq ls [dir]` | list flow YAMLs, skipping hidden dirs and `node_modules` |
| `chainq validate <flow.yaml>` | static checks only — no model call, no command run |
| `chainq run <flow.yaml> [options]` | validate, then run |
| `chainq skill install [--global] [--force]` | install this skill for an agent (see below) |

Exit codes: `0` success, `1` validation or run failure, `2` unknown or incomplete
command.

## Run options

| Option | Does |
|---|---|
| `--cache`, `--reuse` | reuse valid cached outputs during a full run |
| `--fresh` | ignore the cache (already the default for a full run) |
| `--from <node>` | re-run that node and everything downstream; reuse upstream |
| `--to <node>` | run only that node and its upstream cone |
| `--steps <n>` | run the first `n` nodes in topological order |
| `--pin <node>=<file>` | substitute a file as that node's output; the trial is isolated under `.chain/scratch/` |
| `--profile <name>` | use one declared profile for every `ai` node this run |
| `--input <name>=<value>` | set a declared input param; repeatable |
| `--input-file <file>` | one JSON object, an array of objects, or JSONL — each record must be an object |
| `-q`, `--quiet` | hide progress; keep results on stdout and failures on stderr |
| `-s`, `--silent` | print nothing; use the exit code |

`--input` overrides matching keys from every set loaded by `--input-file`.

## Output streams

Results go to **stdout**; the plan, per-node progress, and errors go to **stderr**.
So `chainq run flow.yaml --cache | jq` pipes cleanly. A complete run prints every
leaf node, with an `— <node> —` heading when there is more than one. A partial run
that never reaches a leaf prints the last node it ran.

Before executing, chainq prints a preflight: planned AI calls, reused nodes,
skipped nodes. Read it before spending a model call.

## Iterating without burning calls

```bash
chainq validate flow.yaml               # free — always do this first
chainq run flow.yaml --steps 2          # prove the front of the chain
chainq run flow.yaml --to draft         # stop at a node, reuse upstream cache
chainq run flow.yaml --cache            # full run, reuse everything unchanged
chainq run flow.yaml --from critique    # a prompt changed here — re-run this and after
chainq run flow.yaml --pin draft=sample.txt   # tune a late step against a fixed sample
```

`--pin` writes into `.chain/scratch/` and never touches real outputs, so it is the
safe way to iterate on the tail of an expensive chain.

A partial run may need cached prerequisites. If there are none yet, run the whole
flow once, or pick a boundary whose upstream already ran.

## Batch runs

```yaml
start:
  type: input
  params:
    topic: { type: string, required: true }
```

```bash
chainq run flow.yaml --input topic=automation
chainq run flow.yaml --input-file topics.json   # [{"topic":"a"},{"topic":"b"}]
```

Each set becomes one seed item, and every `ai` node runs once per item — cost
scales with items × `ai` nodes.

## Several models

```yaml
profiles:
  default: { cmd: 'claude -p' }
  big:     { cmd: 'claude -p --model opus' }
```

```bash
chainq run flow.yaml --profile big
```

Per node instead: `profile: big` on that `ai` node.

## Installing this skill elsewhere

```bash
npx @wahengchang2023/chainq skill install            # → ./.claude/skills/chainq
npx @wahengchang2023/chainq skill install --global   # → ~/.claude/skills/chainq
npx @wahengchang2023/chainq skill path               # print the bundled source dir
```

`--dir <path>` copies to any directory, for agents that read skills elsewhere.
`--force` replaces an existing install.

## The editor

`chainq ui flow.yaml` binds to `127.0.0.1` on a random port — do not expose it to
an untrusted network. Editing and running happen on the same canvas: each node
streams `running → ran / cached / failed` with its real output on the card. An
edit is a draft until saved, so a prompt can be re-run without touching the file.
