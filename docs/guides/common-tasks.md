# How-to guides

Task-oriented recipes. Each one is a single goal — copy, adapt, run. For the full
list of flags and node types, see [CLI reference](../reference/cli.md).

## Re-run only part of a chain

```bash
chainq run flow.yaml --to summarize     # run up to `summarize`, reuse upstream cache
chainq run flow.yaml --from clean        # force-rerun `clean` AND everything downstream
chainq run flow.yaml --steps 2           # run only the first 2 steps (topological order)
```

`--to` selects an upstream dependency cone. `--from` selects a node and its downstream dependents.

## Re-run everything explicitly

```bash
chainq run flow.yaml                     # fresh is already the default
chainq run flow.yaml --fresh             # ignore the cache, re-run every node
```

## Iterate on a late step without paying for the slow early ones

Pin an upstream node's output to a fixed sample, then tune a downstream prompt.
The trial runs into `.chain/scratch/` and never touches your real outputs:

```bash
chainq run flow.yaml --pin draft=sample.txt
# (sample.txt holds the text you want `draft` to "have produced")
```

## Combine two streams into one

Point a single node at two upstreams with `from: [a, b]` and reference each in
its prompt:

```yaml
steps:
  a: { type: ai, prompt: '...' }
  b: { type: ai, prompt: '...' }
  m: { type: assemble, from: [a, b],
       prompt: "【A】\n{{ $('a') }}\n\n【B】\n{{ $('b') }}" }
```

An `assemble` (or `ai`) node with `from: [a, b]` is how you fan two streams in.
To pull another node's value into an ordinary step's prompt without adding it to
`from`, just reference it: `{{ $('a') }}`.

## Run the same flow for a batch of inputs

Declare fields on an `input` node:

```yaml
steps:
  start:
    type: input
    params:
      topic: { type: string, required: true }
  draft:
    type: ai
    from: start
    prompt: 'Write one sentence about {{ $json.topic }}.'
```

Run one input set directly:

```bash
chainq run flow.yaml --input topic=automation
```

For a batch, pass a JSON array or JSONL file. Every record must be an object:

```json
[{ "topic": "automation" }, { "topic": "prompt chains" }]
```

```bash
chainq run flow.yaml --input-file topics.json
```

## Check a flow without calling the model

```bash
chainq validate flow.yaml                # static checks only (DAG, cycles, wiring) — no model call
```

Catches typos, dangling `from:`, cycles, and `{{ }}` references to nodes you
forgot to wire — before you spend a single model call.

## Use a different local model for one run

Define extra profiles, then pick one per run:

```yaml
profiles:
  default: { cmd: 'claude -p' }
  big:     { cmd: 'claude -p --model opus' }
  codex:   { cmd: 'codex exec --ephemeral --sandbox read-only --skip-git-repo-check --color never -' }
```

```bash
chainq run flow.yaml --profile big       # every ai node uses the `big` profile this run
chainq run flow.yaml --profile codex     # every ai node uses Codex for this run
```

## List every flow in a project

```bash
chainq ls                                # find all .yaml flows under the current dir
```

## Edit visually instead of in YAML

```bash
chainq ui flow.yaml                      # opens the local web editor (canvas + node panels)
```
