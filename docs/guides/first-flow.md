# Tutorial: your first chain

By the end you'll have built, run, and re-run a two-step prompt chain, and seen
chainq's whole point: editing one step re-runs only what changed. If chainq is
not installed yet, complete [Getting started](../getting-started.md) first.

This is learning-oriented. Follow every step in order; don't skip. Each `ai`
step calls the real model, so do this once first:

```bash
claude login
```

To follow the same tutorial with Codex, run `codex login` instead and append
`--profile codex` to each `chainq run` command.

## 1. Scaffold a project

```bash
chainq init my-first-flow
cd my-first-flow
```

You now have:

```
my-first-flow/
├─ flow.yaml      ← your flow definition
├─ input.txt      ← a sample input the flow reads
└─ .gitignore     ← ignores the .chain/ cache folder
```

## 2. Look at what it made (`flow.yaml`)

```yaml
profiles:
  default: { cmd: 'claude -p' }   # the real local model
  codex: { cmd: 'codex exec --ephemeral --sandbox read-only --skip-git-repo-check --color never -' }

steps:
  load:
    type: cmd                      # a local command (no shell)
    run: 'cat input.txt'           # reads input.txt
    inputs: ['input.txt']          # declares the input → this node is cacheable
  summarize:
    type: ai                       # an AI step
    from: load                     # takes load's output as its input
    prompt: 'Summarize in one sentence: {{ $json }}'   # {{ $json }} = the input
```

Two steps: `load` reads a file, `summarize` asks the model to summarize it. The
`from:` line is the wire between them.

## 3. Run it

```bash
chainq run flow.yaml
```

```
plan: 1 ai call(s) · 0 reused · 0 skipped
✓ load        (1 item)
✓ summarize   (1 item)
```

`✓` means the node ran. The `plan:` line above is a preflight — it tells you how
many model calls a run will make before spending any.

## 4. The whole point: edit a prompt, re-run only what changed

By default `chainq run` does a **fresh run** — every node re-runs. To reuse
unchanged outputs (the cheap iteration loop), add `--cache`. Run it again with
no edits:

```bash
chainq run flow.yaml --cache
```

```
plan: 0 ai call(s) · 2 reused · 0 skipped
⊘ load        (1 item)   ← cached, not re-run
⊘ summarize   (1 item)   ← cached
```

`⊘` means served from cache — nothing changed, so nothing re-runs and no model
is called. Now open `flow.yaml`, change the `summarize` prompt (add "in a funny
tone"), save, and run again with `--cache`:

```
⊘ load        ← still cached (you didn't touch it)
✓ summarize   ← re-ran (you edited it)
```

Only what you changed re-runs. Tune one prompt, pay for one step. That's the
iteration loop chainq is built around — see [execution and caching](../concepts/execution.md).

## 5. Where the output went

```bash
cat .chain/outputs/summarize.out
```

Outputs are stored as a JSON **items** array (`[{ "json": "..." }]`) — chainq's
data model. One value in, one value out, so you see a single item here. Feed an
`input` node a batch (`--input-file`) and each step runs once per item (next: the
[common tasks](common-tasks.md)).

## Next steps

- Add another flow: `chainq new tweets` → `chainq run tweets.yaml`
- Do a real task: [common tasks](common-tasks.md)
- Look up any command or flag: [CLI reference](../reference/cli.md)
