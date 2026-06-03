# chain

Run multi-step **prompt chains** on your **local CLI models** (`claude -p`, `codex -m`) —
no API key, no HTTP. A flow is one YAML file. The point is the **iteration loop**: pin an
upstream node's sample, edit one prompt, re-run only that node, see the result in seconds
without re-running the expensive steps above it.

> Status: **engine core** (alpha). Offline, tested, runnable via the CLI. The visual
> canvas + node-editing UI (the product surface) is next. See `docs/design.md`.

## Why

A workflow has 3–10 prompt nodes. Tuning one prompt without a UI — and without re-running
the slow upstream every time — is the real pain. `chain` makes that loop cheap:
edit a node → only its transitive downstream is invalidated → everything else is served
from cache.

## Create a new project

```bash
npx tsx src/cli/index.ts init my-flow        # scaffolds flow.yaml + .gitignore + input.txt
cd my-flow
chain run flow.yaml --profile fake           # run offline (the cat fake model, no login)
chain run flow.yaml                          # run for real (first: claude login)
```

`init` writes a starter `flow.yaml` with both a real `default: claude -p` profile and a
`fake: cat` profile, so a fresh project runs offline immediately. It refuses to overwrite
an existing `flow.yaml` unless you pass `--force`.

## Run it

```bash
npm install
npm test                                       # 56 tests, fully offline (G2 fake model)
npx tsx src/cli/index.ts run examples/demo.yaml
npx tsx src/cli/index.ts run examples/demo.yaml --fresh   # ignore cache
npx tsx src/cli/index.ts validate examples/demo.yaml
```

The demo uses a `cat` "fake model" profile, so it runs with no API key and no network.
Point a profile at `claude -p` for the real thing.

## How it works

```
ONE engine (src/engine), two callers (CLI now, UI next):

  runNode(N)          resolve inputs → run → persist
  materializeUpstream walk N's transitive deps; reuse cache, run the stale
  runToNode(N)        upstream → N            (n8n "run to here")
  rerunNode(N)        force just N            (n8n "re-run node")
  runChain()          all nodes, topo order   (publish / chain run)
```

Cache correctness is a **Merkle key**: each node's key folds in its upstreams' keys, so
editing a node invalidates exactly its transitive downstream and nothing else. A `cmd`
node with no declared `inputs:` is treated as uncacheable (always re-runs). The whole
engine self-tests offline by swapping any profile for `cat`.

## Layout

```
src/engine/   parse → DAG → Merkle cache → serial run → validate
src/cli/      chain run / validate
examples/     demo flow
docs/         design.md (design + eng + design reviews), test-plan, tasks
```

## License

TBD.
