# Reference

Information-oriented. The complete surface of the `chainq` CLI and the flow YAML.
For *why* it works this way, see [explanation.md](./explanation.md).

## Commands

| Command | What it does |
|---|---|
| `chainq init [dir]` | Scaffold a new project: `flow.yaml` (with a `claude -p` profile) + `.gitignore` + `input.txt`. Refuses to overwrite an existing `flow.yaml`. |
| `chainq new <name>` | Add another flow YAML (a 2-node starter) to the current project. |
| `chainq ui [flow.yaml]` | Open the local web editor (binds `127.0.0.1`). With a path, opens straight into that flow. |
| `chainq ls [dir]` | List every `.yaml` flow under `dir` (default: current dir). |
| `chainq validate <flow.yaml>` | Static pre-run checks only (DAG, cycles, profiles, `{{ }}` wiring). No model call. Exits non-zero on error. |
| `chainq run <flow.yaml> [flags]` | Run the chain. **Re-runs every node by default**; pass `--cache` to reuse unchanged outputs. See flags below. |

### `init` / `new` flags

| Flag | Effect |
|---|---|
| `--force` | Overwrite an existing `flow.yaml` (init) / flow file (new). |

### `run` flags

| Flag | Effect |
|---|---|
| *(default)* | A plain `run` **re-runs every node** — no need to pass anything. |
| `--cache` (`--reuse`) | Reuse cached outputs; only stale nodes re-run. The cheap-iteration mode. |
| `--fresh` | Ignore the cache; re-run every node. (Same as the default now — kept for clarity/scripts.) |
| `--from <node>` | Force-rerun `<node>` and everything downstream of it (upstream reused from cache). |
| `--to <node>` | Run up to `<node>` only; its upstream cone (n8n "run to here"). |
| `--steps <n>` | Run only the first `n` nodes in topological order. |
| `--pin <node>=<file>` | Treat `<file>` as `<node>`'s output (a fixed sample). The run goes to `.chain/scratch/` and never touches real outputs. |
| `--profile <name>` | Override every `ai` node's profile with `<name>` for this run (must be defined in `profiles:`). |
| `-q`, `--quiet` | Hide progress (the `flow:`/`plan:`/per-node lines on stderr). Still prints the result on stdout and still shows failures. The pipe-friendly mode. |
| `-s`, `--silent` | Print nothing at all — progress **and** result. Only the exit code is left (`0` ok, `1` failed). |

### Output streams

The chain **result goes to stdout; progress goes to stderr.** So `chainq run flow.yaml | jq`
pipes only the result, while you still watch progress in the terminal. The result is the
output of every **leaf** node (a node with no downstream — the chain's terminal output);
with more than one leaf, each is printed under a `— <node> —` header. A partial run
(`--to`/`--steps`/`--from`) that never reaches a leaf prints the last node that ran.

Before a run, chainq prints a preflight on stderr: `plan: N ai call(s) · M reused · K skipped`.
Per-node status as it settles (stderr): `✓` ran · `⊘` cached · `✗` failed · `–` skipped,
followed by the item count, e.g. `✓ summarize (3 items)`.

## Flow YAML

```yaml
profiles:
  default: { cmd: 'claude -p' }    # required; `default` is used unless --profile/`profile:` says otherwise
defaults:                          # optional, flow-wide
  timeout: 600                     # seconds; the default for any step without its own `timeout`
steps:
  <id>:
    type: <node type>
    ...node-specific fields
```

A node's identity is its YAML key (`<id>`). Wires are the `from:` field.

**`defaults`** is flow-wide. Today it holds one key, **`timeout`** (seconds): the ceiling every `ai`/`cmd` step falls back to when it sets no `timeout` of its own. Resolution, most specific wins: a node's `timeout` → `defaults.timeout` → the built-in **300s** (the same on CLI and in the editor). In the editor it's the **◷ Timeout** clock in the top bar.

## Node types

| type | Purpose | Fields |
|---|---|---|
| `ai` | Call the model once **per input item**. | `from`, `prompt`, `profile?`, `timeout?` |
| `cmd` | Run a shell command (argv, no shell). | `run`, `inputs?`, `from?`, `mode?`, `timeout?` |
| `assemble` | Pure data templating — render the prompt, no model call. Combine upstreams with `from: [a, b]`. | `from`, `prompt` |

Field notes:

- **`from`** — upstream node id (string), or `[a, b]` to fan two upstreams into one node (`assemble`/`ai`). Required except on root nodes.
- **`prompt`** — template with `{{ }}` expressions (see below). `ai`/`assemble` only.
- **`run`** — shell command, split on spaces into argv (no shell features). `cmd` only.
- **`inputs`** — files a `cmd` reads; declaring them makes the node cacheable. Without it, a `cmd` is **volatile** (always re-runs, not persisted, and its downstream too).
- **`mode`** — `cmd`: `once` (default, single run) | `perItem` (run per input item, item piped to stdin).
- **`timeout`** — `ai`/`cmd`: **seconds** before this step's subprocess is killed (`timed out`). Overrides the flow default; blank falls back to `defaults.timeout`, then the built-in **300s**. Raise it for a slow step (e.g. an `ai` step writing a long article: `timeout: 1200`). In the editor it lives behind the ◷ clock in a node's INPUT header.

## Prompt expressions (`{{ }}`)

Resolved against the **current item** (each node runs once per input item).

| Expression | Resolves to |
|---|---|
| `{{ $json }}` | the current item's value (raw text stays raw) |
| `{{ $json.field }}` | a field of the current item (parses it as JSON first) |
| `{{ $json[0] }}` `{{ $json[-1] }}` | array index (negative = from the end) |
| `{{ $json[*] }}` `{{ $json.items[*].x }}` | pluck a column → a JSON array |
| `{{ $node["id"] }}` / `{{ $('id') }}` | the item of upstream `id` **paired** to the current item — traced through its lineage, so it stays correct across multi-level fan-outs |
| `{{ $('id').item }}` | same as above, explicit |
| `{{ $('id').all() }}` | **all** of upstream `id`'s items, as a JSON array |

Unknown expressions are left verbatim (visible, not silently blanked). `$('id')` may
reference **any ancestor** — a node anywhere upstream, not just a direct `from:` — so
you can reach across several steps to grab a value. (`$json` still binds the primary
`from[0]` input.) `validate` flags a reference to a non-ancestor, since it has not run.

In the visual editor (`chainq ui`) these two relationships read differently on the
canvas: a **data-flow wire** (the `$json` main input) is warm and solid; a **reference
wire** (a `$('id')` / `$node["id"]` value lookup, including cross-step ones not in
`from:`) is cool and dashed. A toggle in the zoom toolbar hides the reference wires
when you want a cleaner view.

## The item model

- Every wire carries a list of **items**. An item is `{ json: <value>, pairedItem?: <index> }`.
- A node runs **once per input item** (`ai`, `cmd mode:perItem`).
- `ai`/`cmd` output text becomes one item; the text is **not** auto-parsed (`item.json` stays the raw string). Use a `{{ }}` path to get structure.
- Single-value chains are 1-in-1-out (one item) — backward compatible with non-list flows.
- Empty items → downstream is skipped.

## Profiles

- `profiles:` maps a name → `{ cmd: '<command>' }`. `default` is used unless overridden.
- There is **no fake/offline profile** — every `ai` run calls the real local model.
- `--profile <name>` swaps the profile for one run; it folds into the cache key, so switching
  models invalidates affected nodes.

## `.chain/` working directory

| Path | Contents |
|---|---|
| `.chain/outputs/<id>.out` | a node's output, as a pretty-printed JSON items array |
| `.chain/state.json` | per-node cache key + output file pointer |
| `.chain/scratch/` | trial runs from `--pin` (never the real outputs) |

The cache is a **Merkle key**: a node's key folds in its type, prompt/run, profile, declared
input hashes, node-specific config (`field`/`mode`/`key`), and its upstreams' keys. Edit a node
→ its key changes → it and its transitive downstream re-run; nothing else.
