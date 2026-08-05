# Getting started

Go from installation to a running prompt chain, then open the same flow in the
visual editor. You do not need to know chainq's YAML format before starting.

## 1. Install chainq

chainq needs **Node.js 18 or newer**. Install the CLI globally:

```bash
npm install -g @wahengchang2023/chainq
```

Check that the command is available:

```bash
chainq
# usage: chainq init [dir] | chainq new <name> | chainq ui [flow.yaml] | ...
```

Prefer not to install globally? Replace `chainq` in any example with
`npx @wahengchang2023/chainq`.

The starter flow uses the local `claude -p` CLI by default. Sign in once before the first
model run:

```bash
claude login
```

To use the bundled Codex profile instead, sign in once and select it for the run:

```bash
codex login
chainq run flow.yaml --profile codex
```

You can use another local CLI model later by changing the flow's `profiles:`.

## 2. Create a project

```bash
chainq init my-first-flow
cd my-first-flow
```

The command creates:

```text
my-first-flow/
├── flow.yaml     # the prompt chain; commit this
├── input.txt     # sample input read by the starter flow
└── .gitignore    # keeps .chain/ run data out of Git
```

One flow is one YAML file. `flow.yaml` starts with a `cmd` step that reads
`input.txt`, followed by an `ai` step that summarizes it.

## 3. Validate and run it

Validate the structure without calling the model:

```bash
chainq validate flow.yaml
```

Then run the whole chain:

```bash
chainq run flow.yaml
```

chainq shows a preflight before spending a model call, streams each step's
status to stderr, and prints the final leaf output to stdout.

```text
plan: 1 ai call(s) · 0 reused · 0 skipped
✓ load (1 item)
✓ summarize (1 item)
```

A plain `run` is fresh: every step runs again. Add `--cache` when iterating and
you want unchanged steps to reuse their previous outputs:

```bash
chainq run flow.yaml --cache
```

## 4. Open the visual editor

```bash
chainq ui flow.yaml
```

The editor opens on `127.0.0.1` using a random local port. The canvas and CLI
share the same engine and the same `flow.yaml`; there is no import or export
step. Run the flow, inspect each node's real output, edit a prompt, then save or
reset the draft.

## 5. Know what to commit

```text
my-first-flow/
├── flow.yaml              # commit
├── input.txt              # commit if it is safe project input
└── .chain/                # do not commit
    ├── outputs/           # cached real outputs
    ├── scratch/           # isolated --pin trial runs
    ├── layout.json        # visual canvas positions
    └── state.json         # cache state
```

Model outputs can contain sensitive data. Review files before sharing them even
when they are already covered by `.gitignore`.

## Next steps

- Learn the edit-and-cache loop in [Tutorial: your first flow](guides/first-flow.md).
- Copy a focused recipe from the [Common tasks](guides/common-tasks.md).
- Look up every command, flag, node type, and YAML field in the
  [CLI reference](reference/cli.md).
- Build flows in the browser with the [visual editor guide](guides/visual-editor.md).
- Diagnose common failures in [Troubleshooting](troubleshooting.md).
- Look up every YAML field in the [flow YAML reference](reference/flow.md).
