# chainq

Run multi-step **prompt chains** on your **local CLI models** (`claude -p`, `codex -m`) —
no API key, no HTTP. A flow is one YAML file. The point is the **iteration loop**: pin an
upstream node's sample, edit one prompt, re-run only that node, see the result in seconds
without re-running the expensive steps above it.

> Status: **engine core** (alpha). Offline, tested, runnable via the CLI. The visual
> canvas + node-editing UI (the product surface) is next. See `docs/design.md`.

## Why

A workflow has 3–10 prompt nodes. Tuning one prompt without a UI — and without re-running
the slow upstream every time — is the real pain. `chainq` makes that loop cheap:
edit a node → only its transitive downstream is invalidated → everything else is served
from cache.

> **New here?** Read [docs/getting-started.md](docs/getting-started.md) — a step-by-step
> walkthrough from zero to a running chain (no prior knowledge assumed).
>
> **CLI docs** (Diátaxis): [docs/cli/](docs/cli/) — tutorial · how-to · reference · explanation.

## Quickstart

No install needed — `npx` runs it straight from npm:

```bash
npx @wahengchang2023/chainq init my-flow    # scaffolds flow.yaml + .gitignore + input.txt
cd my-flow
npx @wahengchang2023/chainq ui flow.yaml    # open the visual editor (or: ... run flow.yaml)
```

Prefer a permanent command? Install once, then call `chainq` from anywhere:

```bash
npm install -g @wahengchang2023/chainq
chainq init my-flow
cd my-flow
chainq run flow.yaml          # every ai step calls the local model (first: claude login)
```

> Runs on bare **Node ≥ 18** — no build step, no API key, no transpiler at runtime.
> The published package is **`@wahengchang2023/chainq`**; the installed command is **`chainq`**.

`init` writes a starter `flow.yaml` with a `default: claude -p` profile. It refuses to
overwrite an existing `flow.yaml` unless you pass `--force`.

A project holds many flows — add another workflow any time:

```bash
chainq new tweets          # generates tweets.yaml (a 2-node starter chain)
chainq run tweets.yaml
chainq ls                  # list every flow in the project
```

## Run it

```bash
npm install
npm test                                       # unit tests (offline)
npm run e2e:cli                                # CLI E2E — drives the real CLI (see e2eCli/)
npx tsx src/cli/index.ts validate examples/demo.yaml
npx tsx src/cli/index.ts run examples/demo.yaml          # calls the real model (claude login)
```

Every run calls the real local model (`claude -p`) — there is no fake/offline profile.
CLI E2E gates model-running scenarios on `claude` being on PATH; structural tests
(validate / scaffold / ls) run offline.

## How it works

```
ONE engine (src/engine), two callers (CLI now, UI next):

  runNode(N)          resolve inputs → run → persist
  materializeUpstream walk N's transitive deps; reuse cache, run the stale
  runToNode(N)        upstream → N            (n8n "run to here")
  rerunNode(N)        force just N            (n8n "re-run node")
  runChain()          all nodes, topo order   (publish / chainq run)
```

Cache correctness is a **Merkle key**: each node's key folds in its upstreams' keys, so
editing a node invalidates exactly its transitive downstream and nothing else. A `cmd`
node with no declared `inputs:` is treated as uncacheable (always re-runs).

## Layout

```
src/engine/   parse → DAG → Merkle cache → serial run → validate
src/cli/      chainq run / validate
examples/     demo flow
docs/         cli/ (Diátaxis CLI docs) · design.md · getting-started.md · design/
```

## Security

`chainq` runs **local** CLI models you already trust (`claude -p`, `codex -m`): prompts are
piped over stdin and every subprocess is spawned with an argv array — never a shell string,
so there is no command injection. The visual editor (`chainq ui`) binds to **`127.0.0.1` only**
on a random port and reads/writes files on your machine on your behalf. Treat it as a local
dev tool: **do not expose the UI port to an untrusted network.**

## License

[MIT](LICENSE) © wahengchang
