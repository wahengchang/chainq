# How-to guides

Task-oriented recipes. Each one is a single goal — copy, adapt, run. For the full
list of flags and node types, see [reference.md](./reference.md).

## Re-run only part of a chain

```bash
chain run flow.yaml --to summarize     # run up to `summarize`, reuse upstream cache
chain run flow.yaml --from clean        # force-rerun `clean` AND everything downstream
chain run flow.yaml --steps 2           # run only the first 2 steps (topological order)
```

`--to` is n8n's "run to here". `--from` is "re-run this node" (it + its downstream).

## Force everything to re-run

```bash
chain run flow.yaml --fresh             # ignore the cache, re-run every node
```

## Iterate on a late step without paying for the slow early ones

Pin an upstream node's output to a fixed sample, then tune a downstream prompt.
The trial runs into `.chain/scratch/` and never touches your real outputs:

```bash
chain run flow.yaml --pin draft=sample.txt
# (sample.txt holds the text you want `draft` to "have produced")
```

## Loop over a list (do something to each item)

chain has no loop construct — it's the items model. Produce a list, **Split Out**
fans it into items, the next node runs **once per item** automatically, then
**Aggregate** folds the results back:

```yaml
steps:
  topics:  { type: ai, prompt: 'List 3 blog topics as a JSON array' }
  split:   { type: splitOut, from: topics }          # ["a","b","c"] → 3 items
  draft:   { type: ai, from: split,
             prompt: 'Write a one-line pitch for: {{ $json }}' }   # runs 3×, $json = each topic
  collect: { type: aggregate, from: draft }          # 3 items → one [pitch, pitch, pitch]
```

`ai` nodes are per-item by default. To loop a **shell** step per item, set
`mode: perItem` (the item is piped to stdin):

```yaml
  each: { type: cmd, run: 'wc -w', from: split, mode: perItem }
```

## Merge two streams into one

```yaml
steps:
  a: { type: ai, prompt: '...' }
  b: { type: ai, prompt: '...' }
  m: { type: merge, from: [a, b], mode: append }        # a's items then b's items
  # or join two object streams on a shared key:
  # m: { type: merge, from: [a, b], mode: byKey, key: id }
```

`merge` is the only node that takes two inputs. To pull another node's value into
an ordinary step's prompt, just reference it: `{{ $('a') }}` (no Merge needed).

## Check a flow without calling the model

```bash
chain validate flow.yaml                # static checks only (DAG, cycles, wiring) — no model call
```

Catches typos, dangling `from:`, cycles, and `{{ }}` references to nodes you
forgot to wire — before you spend a single model call.

## Use a different local model for one run

Define extra profiles, then pick one per run:

```yaml
profiles:
  default: { cmd: 'claude -p' }
  big:     { cmd: 'claude -p --model opus' }
```

```bash
chain run flow.yaml --profile big       # every ai node uses the `big` profile this run
```

## List every flow in a project

```bash
chain ls                                # find all .yaml flows under the current dir
```

## Edit visually instead of in YAML

```bash
chain ui flow.yaml                      # opens the local web editor (canvas + node panels)
```
