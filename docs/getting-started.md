# Getting started

A beginner's walkthrough: go from nothing to a running prompt chain in a few minutes.
No prior knowledge of `chain` assumed.

> **What is chain?** A tool that runs a *chain of prompts* — you give several AI steps
> in one YAML file, it runs them in order, feeds each step's output to the next, and
> caches everything so re-running is cheap. It uses your **local CLI model** (`claude -p`),
> so there's no API key.

---

## 0. One-time setup: make `chain` a command you can type

The tool isn't published yet, so you run it from this repo. The easiest way is a shell
**alias** so you can just type `chain` anywhere.

Add this to your `~/.zshrc` (then open a new terminal, or run `source ~/.zshrc`):

```bash
alias chain='"/Volumes/UGREEN 2TB /projects/chain-cli/node_modules/.bin/tsx" "/Volumes/UGREEN 2TB /projects/chain-cli/src/cli/index.ts"'
```

(One time, in the repo, make sure deps are installed: `cd "/Volumes/UGREEN 2TB /projects/chain-cli" && npm install`.)

Now `chain` works from any folder. Test it:

```bash
chain
# usage: chain init [dir] | chain new <name> | chain run|validate <flow.yaml> ... | chain ls [dir]
```

> Don't want an alias? Just replace `chain` below with
> `npx tsx "/Volumes/UGREEN 2TB /projects/chain-cli/src/cli/index.ts"`.

---

## 1. Make a new project

```bash
chain init my-first-flow      # creates the folder and a starter project
cd my-first-flow
```

You now have three files:

```
my-first-flow/
├─ flow.yaml      ← your workflow (the only file that matters)
├─ input.txt      ← a sample input the flow reads
└─ .gitignore     ← ignores the .chain/ cache folder
```

## 2. Look at what it made (`flow.yaml`)

```yaml
profiles:
  default: { cmd: 'claude -p' }   # the real local model (needs: claude login)

steps:
  load:
    type: cmd                      # a shell step
    run: 'cat input.txt'           # reads input.txt
    inputs: ['input.txt']          # tells chain this file is the input (so it caches right)

  summarize:
    type: ai                       # an AI step
    from: load                     # takes load's output as its input
    prompt: 'Summarize in one sentence: {{ $json }}'   # {{ $json }} = the input
```

Two steps: `load` reads a file, `summarize` asks the model to summarize it. The arrow is
the `from:` line.

## 3. Run it

Every `ai` step calls the real local model, so log in once with `claude login`, then:

```bash
chain run flow.yaml
```
```
plan: 1 ai call(s) · 0 reused · 0 skipped
✓ load        ← ran
✓ summarize   ← ran
```

## 4. The whole point: edit a prompt, re-run cheaply

Run it again without changing anything:

```bash
chain run flow.yaml
```
```
plan: 0 ai call(s) · 2 reused · 0 skipped
⊘ load        ← cached (not re-run)
⊘ summarize   ← cached
```
Nothing changed, so **nothing re-runs** — `⊘` means served from cache.

Now open `flow.yaml`, change the `summarize` prompt (e.g. add "in a funny tone"), save,
and run again:
```
⊘ load        ← still cached (you didn't touch it)
✓ summarize   ← re-ran (you edited it)
```
Only what you changed re-runs. That's the core idea — tune one prompt, pay for one step.

## 5. Add more workflows

A project can hold many flows. Make another:

```bash
chain new tweets              # creates tweets.yaml (a 2-step starter chain)
chain run tweets.yaml
chain ls                      # list every flow in this project
```

---

## Command reference

| Command | What it does |
|---|---|
| `chain init [dir]` | Create a new **project** (folder + starter `flow.yaml` + input + .gitignore) |
| `chain new <name>` | Create another **workflow** YAML in the current project |
| `chain run <flow.yaml>` | Run the chain (reuses cache) |
| `chain run <flow.yaml> --fresh` | Ignore the cache, re-run everything |
| `chain run <flow.yaml> --profile fake` | Run offline with the `cat` stand-in |
| `chain run <flow.yaml> --from <step>` | Force re-run a step and everything after it |
| `chain run <flow.yaml> --to <step>` | Run only up to a step |
| `chain run <flow.yaml> --pin <step>=<file>` | Try a change with a fixed input, into a scratch area (real outputs untouched) |
| `chain validate <flow.yaml>` | Check the file for mistakes without running anything |
| `chain ls [dir]` | List the flow files in a project |

`--force` on `init`/`new` overwrites an existing file.

## Core ideas (in one screen)

- **Flow** = one YAML file = a chain of steps.
- **Step types:** `ai` (calls the model), `cmd` (runs a shell command), `assemble` (just shuffles data).
- **`from:`** wires a step to the one(s) it reads. `{{ $json }}` is that input; `{{ $json.field }}`
  picks a field out of JSON. **Multi-input** (n8n-style): `from: [a, b]` — `{{ $json }}` is the first
  (`a`); reach any named upstream with `{{ $node["b"] }}` or the n8n alias `{{ $('b') }}`.
- **Profiles** map a name to a model command. `default` is real; swap in `fake` (or `--profile fake`)
  to run offline.
- **Cache:** edit a step → it and everything downstream re-run; everything else is reused.
  Editing an *upstream* step also re-runs its downstream (never serves a stale result).
- **`--pin`:** freeze a step's output to a sample so you can iterate on a *later* step without
  paying to re-run the expensive earlier ones. Trial runs go to `.chain/scratch/`, never your real outputs.

## Where things are stored

```
my-first-flow/
├─ flow.yaml            your workflow (commit this)
└─ .chain/              chain's work area (git-ignored)
   ├─ outputs/          each step's last real output (the cache)
   ├─ scratch/          --pin trial runs (never touches outputs/)
   └─ state.json        what's been run + cache keys
```

That's it. Edit `flow.yaml`, run, watch `✓`/`⊘`, repeat.
