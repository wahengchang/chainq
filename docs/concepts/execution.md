# Execution and caching

chainq turns the `from` relationships in a flow into a directed acyclic graph.
The same engine validates and runs that graph from the CLI and visual editor.

## Items and dependencies

Every connection carries a list of items. Internally, an item contains a `json`
value and may record the input item from which it was derived. An `ai` node and a
`cmd` node in `perItem` mode run once for each input item. An empty output causes
dependent work to be skipped.

Raw model and command output remains text. An `ai` node with `schema` is the
exception: chainq parses and validates its JSON object. Pairing metadata lets an
expression such as `{{ $('draft') }}` select the corresponding ancestor item
after fan-out rather than an unrelated item.

## Full and partial runs

A plain `chainq run` deliberately executes the complete flow again. Use
`--cache` for inexpensive iteration. Partial modes (`--from`, `--to`, `--steps`,
and `--pin`) reuse prerequisite output when possible because they cannot always
recreate the selected boundary in isolation.

The preflight plan reports AI calls before execution. Nodes then settle as
`ran`, `cached`, `failed`, or `skipped`. A failure prevents dependent nodes from
running.

## Cache invalidation

A node's cache key includes its type and configuration, profile, declared input
file contents, and upstream cache keys. Changing a node invalidates that node and
its downstream dependents, but not unrelated branches. Changing profiles also
invalidates affected `ai` nodes.

A `cmd` node without `inputs` is volatile because chainq cannot know which files
or external state influence it. It and dependent nodes run even when cache reuse
is enabled.

## Working directory

chainq stores runtime state beside the flow under `.chain/`:

| Path | Purpose |
|---|---|
| `.chain/outputs/<id>.out` | Cached node output as a JSON item array. |
| `.chain/state.json` | Cache keys and output pointers. |
| `.chain/scratch/` | Isolated output for pinned trials. |
| `.chain/layout.json` | Visual editor positions. |
| `.chain/lock` | Single-writer coordination while a run is active. |

Do not commit `.chain/`. It can contain model output and other sensitive data,
and chainq can recreate it.

## Why local CLI profiles

A profile names a local command such as `claude -p`. The flow contains no model
API key and chainq inherits the local CLI's authentication. This keeps the YAML
portable, but it also means model availability, cost, and login errors come from
the selected CLI.

For syntax, see the [flow YAML reference](../reference/flow.md). For run options,
see the [CLI reference](../reference/cli.md).
