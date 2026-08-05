# Flow YAML reference

A flow is one YAML file containing model profiles, optional defaults, and named
nodes. A node's key under `steps` is its identifier.

```yaml
profiles:
  default: { cmd: 'claude -p' }
  codex: { cmd: 'codex exec --ephemeral --sandbox read-only --skip-git-repo-check --color never -' }
defaults:
  timeout: 600
steps:
  load:
    type: cmd
    run: 'cat input.txt'
    inputs: [input.txt]
  summarize:
    type: ai
    from: load
    prompt: 'Summarize: {{ $json }}'
```

## Top-level fields

| Field | Required | Description |
|---|---:|---|
| `profiles` | For `ai` nodes | Map of profile names to `{ cmd: '<local model command>' }`. `default` is selected unless overridden. |
| `steps` | Yes | Map of unique node identifiers to node definitions. YAML order is the stable execution order when dependencies permit. |
| `defaults.timeout` | No | Flow-wide subprocess timeout in seconds. The built-in fallback is 300 seconds. |

## Shared node fields

| Field | Description |
|---|---|
| `type` | One of `input`, `ai`, `cmd`, `assemble`, or `write`. |
| `from` | One upstream identifier or a list of identifiers. Forbidden on `input`; required on `write`; optional otherwise. |
| `timeout` | Positive timeout in seconds for an `ai` or `cmd` node. Overrides `defaults.timeout`. |

## Node types

### `input`

Declares runtime fields and emits one item for each supplied input set. It has no
upstream.

```yaml
start:
  type: input
  params:
    topic: { type: string, required: true }
    count: { type: number, default: 3 }
```

Each parameter supports `type` (`string`, `number`, or `boolean`), `required`,
and `default`. A default satisfies a required parameter.

### `ai`

Calls the selected local model once per input item.

| Field | Required | Description |
|---|---:|---|
| `prompt` | Yes | Template sent to the model. |
| `profile` | No | Profile name; defaults to `default`. |
| `schema` | No | Field-to-type map for structured output. Types are `string`, `number`, `boolean`, `array`, and `object`. |

With `schema`, output must be a JSON object containing each declared field with
the declared shallow type. Extra fields are allowed. chainq makes one corrective
retry after invalid output, then fails the node.

The bundled Codex command uses `codex exec` because chainq is non-interactive. It
reads the rendered prompt from stdin (`-`), keeps the run ephemeral and read-only,
and sends its final response to stdout. Select it with `--profile codex`; omitting
the flag preserves the flow's existing default and per-node profile choices.

### `cmd`

Runs a command directly, without a shell.

| Field | Required | Description |
|---|---:|---|
| `run` | Yes | Command line split into an executable and arguments. Shell syntax such as pipes and redirection is not interpreted. |
| `inputs` | No | Files whose contents affect the cache key. Without this field the node is volatile and always runs. |
| `mode` | No | `once` (default) or `perItem`. `perItem` sends each input item to stdin. |

### `assemble`

Renders `prompt` once per input item without calling a model. Use it to reshape
values or join several upstreams.

### `write`

Writes upstream items to `path`, relative to the flow directory. `mode` is
`overwrite` (default) or `append`. Paths support `{{date}}` and `{{datetime}}`.

## Template expressions

Expressions are resolved against the current item.

| Expression | Value |
|---|---|
| `{{ $json }}` | Current value; raw text remains text. |
| `{{ $json.field }}` | Object field. |
| `{{ $json[0] }}`, `{{ $json[-1] }}` | Array item; negative indexes count from the end. |
| `{{ $json[*] }}`, `{{ $json.items[*].x }}` | Values selected from an array, returned as a JSON array. |
| `{{ $('id') }}`, `{{ $node["id"] }}` | Paired value from an ancestor node. |
| `{{ $('id').item }}` | Explicit paired ancestor value. |
| `{{ $('id').all() }}` | All values from an ancestor, returned as a JSON array. |

`$json` uses the first entry in `from` when a node has several upstreams. An
ancestor reference can reach beyond direct upstream nodes. Validation rejects a
reference to a node that is not an ancestor. Unknown expressions remain visible
instead of becoming empty text.

See [execution and caching](../concepts/execution.md) for item pairing and cache
behavior.
