# Tutorial: your first chain

By the end you'll have built, run, and re-run a two-step prompt chain, and seen
chain's whole point: editing one step re-runs only what changed.

This is learning-oriented. Follow every step in order; don't skip. Each `ai`
step calls the real model, so do this once first:

```bash
claude login
```

## 1. Scaffold a project

```bash
chain init my-first-flow
cd my-first-flow
```

You now have:

```
my-first-flow/
├─ flow.yaml      ← your workflow (the only file that matters)
├─ input.txt      ← a sample input the flow reads
└─ .gitignore     ← ignores the .chain/ cache folder
```

## 2. Look at what it made (`flow.yaml`)

```yaml
profiles:
  default: { cmd: 'claude -p' }   # the real local model

steps:
  load:
    type: cmd                      # a shell step
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
chain run flow.yaml
```

```
plan: 1 ai call(s) · 0 reused · 0 skipped
✓ load        (1 item)
✓ summarize   (1 item)
```

`✓` means the node ran. The `plan:` line above is a preflight — it tells you how
many model calls a run will make before spending any.

## 4. The whole point: edit a prompt, re-run cheaply

Run it again without changing anything:

```bash
chain run flow.yaml
```

```
plan: 0 ai call(s) · 2 reused · 0 skipped
⊘ load        (1 item)   ← cached, not re-run
⊘ summarize   (1 item)   ← cached
```

`⊘` means served from cache — nothing changed, so nothing re-runs and no model
is called. Now open `flow.yaml`, change the `summarize` prompt (add "in a funny
tone"), save, and run again:

```
⊘ load        ← still cached (you didn't touch it)
✓ summarize   ← re-ran (you edited it)
```

Only what you changed re-runs. Tune one prompt, pay for one step. That's the
iteration loop chain is built around — see [explanation.md](./explanation.md).

## 5. Where the output went

```bash
cat .chain/outputs/summarize.out
```

Outputs are stored as a JSON **items** array (`[{ "json": "..." }]`) — chain's
data model. One value in, one value out, so you see a single item here. When a
step produces a list, you'll see many; that's how loops work (next: the
[how-to guide](./how-to.md), "loop over a list").

## Next steps

- Add another flow: `chain new tweets` → `chain run tweets.yaml`
- Do a real task: [how-to.md](./how-to.md)
- Look up any command or flag: [reference.md](./reference.md)
