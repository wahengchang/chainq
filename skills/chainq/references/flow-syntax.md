# Flow YAML reference

One flow is one YAML file. A node's key under `steps` **is** its identifier.
Canvas coordinates are never in the flow — they live in `.chain/layout.json`.

```yaml
profiles:
  default: { cmd: 'claude -p' }
defaults:
  timeout: 600
steps:
  load:
    type: cmd
    run: 'cat input.txt'
    inputs: ['input.txt']
  summarize:
    type: ai
    from: load
    prompt: 'Summarize in one sentence: {{ $json }}'
```

## Top level

| Field | Required | Meaning |
|---|---|---|
| `profiles` | when any `ai` node exists | name → `{ cmd: '<local model command>' }`. `default` is used unless a node names another. |
| `steps` | yes | id → node. YAML order is the stable run order where dependencies allow. |
| `defaults.timeout` | no | seconds, applied to nodes without their own `timeout`. Built-in fallback is 300. |

A profile's `cmd` is a local CLI that reads the prompt on **stdin**: `claude -p`,
`claude -p --model opus`, `codex -m <model>`. It is split into argv and spawned
without a shell. No API keys ever appear in a flow.

## Shared node fields

| Field | Meaning |
|---|---|
| `type` | `input` · `ai` · `cmd` · `assemble` · `write` |
| `from` | one id or a list. Forbidden on `input`, required on `write`, optional elsewhere. `from[0]` is the **primary** upstream and binds `{{ $json }}`. |
| `timeout` | seconds, `ai` and `cmd` only; overrides `defaults.timeout`. |

Node ids must match `^[A-Za-z_][A-Za-z0-9_-]*$`, max 64 characters — an id is also
a cache filename and a CSS selector in the editor.

## `input` — the trigger

Has no upstream. Declares runtime fields and emits one item per supplied input set.

```yaml
start:
  type: input
  params:
    topic: { type: string, required: true }
    count: { type: number, default: 3 }
```

Each param takes `type` (`string` | `number` | `boolean`), `required`, `default`.
A default satisfies `required`. Downstream, the fields are `{{ $json.topic }}`.
Supplied at run time with `--input topic=x` or `--input-file batch.json`.

## `ai` — the model call

Runs the selected profile once per input item.

| Field | Required | Meaning |
|---|---|---|
| `prompt` | yes | template sent to the model on stdin |
| `profile` | no | profile name; default `default` |
| `schema` | no | field → type map for structured output |

`schema` types: `string`, `number`, `boolean`, `array`, `object` (containers are
checked shallowly). With `schema`, output is parsed as JSON and must be an
**object** containing each declared field with the declared type; extra fields are
allowed. On invalid output chainq makes one corrective retry, then fails the node.
The node's item becomes the parsed object, so downstream can use `{{ $json.field }}`.

Without `schema`, output stays **raw text** — `{{ $json.field }}` will not work.

```yaml
to_json:
  type: ai
  from: [title, body]
  schema: { title: string, body: string, tags: array }
  prompt: |
    Return ONLY a JSON object with fields title, body, tags.
    title: {{ $('title') }}
    body: {{ $('body') }}
```

## `cmd` — a local command

| Field | Required | Meaning |
|---|---|---|
| `run` | yes | command line split into argv |
| `inputs` | no | files whose contents fold into the cache key |
| `mode` | no | `once` (default) or `perItem` (each item is piped to stdin) |

**No shell.** Pipes, redirects, `&&`, globs, and `~` are not interpreted. Run one
program with plain arguments.

**Volatile by default.** Without `inputs:` chainq cannot know what the command
depends on, so the node re-runs on every run, `--cache` included, and so does
everything downstream. Declare every file it reads to make it cacheable.

## `assemble` — reshape without a model call

Renders `prompt` once per input item. Free. Use it to join upstreams, relabel, or
carry a value through unchanged.

```yaml
combine:
  type: assemble
  from: [food, sights]
  prompt: |
    [FOOD]
    {{ $('food') }}

    [SIGHTS]
    {{ $('sights') }}
```

## `write` — land a file

| Field | Required | Meaning |
|---|---|---|
| `path` | yes | relative to the flow file's directory; supports `{{date}}` and `{{datetime}}` |
| `from` | yes | what to write |
| `mode` | no | `overwrite` (default) or `append` |

## Template expressions

Resolved against the current item. Unknown expressions are left **verbatim** in
the prompt rather than blanked, so a mistake is visible.

| Expression | Value |
|---|---|
| `{{ $json }}` | the current value; raw text stays text |
| `{{ $json.field }}` | an object field |
| `{{ $json[0] }}` · `{{ $json[-1] }}` | array element; negative counts from the end |
| `{{ $json[*] }}` · `{{ $json.items[*].x }}` | pluck from an array → JSON array |
| `{{ $('id') }}` · `{{ $node["id"] }}` | the paired item of ancestor `id` |
| `{{ $('id').item.x }}` | explicit paired item, then a path |
| `{{ $('id').all() }}` | every item of `id` as a JSON array |

`$json` binds to `from[0]`. `$('id')` may reach **any ancestor**, not just a direct
upstream — referencing a non-ancestor is a validation error.

## What validation rejects

`chainq validate flow.yaml` collects every error in one pass and suggests the
nearest legal name on a typo. It rejects:

- an unknown `type`
- a `from:` naming a node that does not exist
- a cycle anywhere in the graph
- an `ai` node whose `profile` is not declared under `profiles`
- `{{ $json }}` in a node with no `from:`
- `{{ $('id') }}` where `id` is not an ancestor of this node
- an `ai` node with no `prompt`; a `cmd` node with no `run`
- a `write` node with no `path`, or with no `from`
- an `input` node that has a `from`
- a param whose `type` is not `string`/`number`/`boolean`, or whose `default` does
  not fit its declared type

Validation is static: it never calls a model or runs a command.

## Items, pairing, and fan-out

Every wire carries a **list of items**. `ai`, `assemble`, and `cmd` in `perItem`
mode run once per input item. An empty output causes downstream nodes to be
skipped. Pairing metadata is what makes `{{ $('draft') }}` select the item that
corresponds to the current one after a fan-out, rather than an unrelated row.

## Cache keys

A node's key covers its type and configuration, its profile, the contents of its
declared `inputs:` files, and its upstream keys. Editing a node invalidates that
node and everything downstream, not unrelated branches. A `cmd` node without
`inputs:` has no stable key and is always volatile.

Runtime state sits beside the flow in `.chain/` — `outputs/`, `state.json`,
`scratch/`, `layout.json`, `lock`. It can contain real model output. Do not commit it.

## Deliberately absent

There is **no `loop` container**, by design. Iteration is expressed as a batch
`input` plus per-item `ai`/`cmd` steps. There is also no `splitOut`, `aggregate`,
or `merge` node — fan-in is `from: [a, b]` on an `ai` or `assemble` node.
