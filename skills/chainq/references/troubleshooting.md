# Troubleshooting

Symptom → cause → fix. Run `chainq validate <flow.yaml>` first for anything that
looks structural; it is free and reports every problem in one pass.

## `chainq: command not found`

Node 18+ must be active. Either install globally
(`npm i -g @wahengchang2023/chainq`) or prefix every command with
`npx @wahengchang2023/chainq`.

## `from: "x" does not exist`

A `from:` names a node that is not a key under `steps`. chainq suggests the
nearest legal id when it is close. Check for a rename that missed a reference.

## `prompt references $node["x"] but x is not upstream`

`{{ $('x') }}` may reach any **ancestor**, but not a node with no path to here.
Either wire the dependency (`from: [current, x]` or an edge further up) or
reference a node that really is upstream.

## `prompt uses {{ $json }} but the step has no from:`

`$json` binds to `from[0]`. Add a `from:`, or switch to `{{ $('id') }}` against a
real ancestor. An `input` node cannot have a `from` at all — it is the root.

## `profile "default" not found`

Every `ai` node resolves a profile. Add one:

```yaml
profiles:
  default: { cmd: 'claude -p' }
```

## An `ai` node fails with an authentication error

chainq never manages model credentials; it inherits the CLI's login. Run the login
for the CLI named in the profile — `claude login` for `claude -p` — and re-run.

## Structured output fails

An `ai` node with `schema` must return a JSON **object** — not prose, not a bare
array, not a fenced block. Say "Return ONLY a JSON object with fields …" in the
prompt, and put the schema on a dedicated conversion step rather than on a
creative one. chainq retries invalid output once, then fails the node.

## `{{ $json.field }}` renders as literal text

Two causes. Either the producing node has no `schema:`, so its output is raw text
with no fields — add `schema` there or reference `{{ $json }}` whole. Or the
expression is misspelled: unknown expressions are deliberately left verbatim so
the mistake is visible rather than silently blank.

## A prompt shows a literal `\n`

Single-quoted YAML does not interpret escapes. Use a block scalar:

```yaml
prompt: |
  First line.

  {{ $json }}
```

## The command ignores pipes or redirection

`cmd.run` is split into argv and spawned **without a shell**. `|`, `>`, `&&`, `*`,
and `~` are not interpreted. Run a single program with plain arguments. If the
work genuinely needs several stages, that is usually a sign it belongs in `ai`
steps — see [authoring.md](authoring.md).

## A node re-runs even with `--cache`

A `cmd` node without `inputs:` is intentionally volatile, and so is everything
downstream of it. Declare every file it reads under `inputs:`. A changed prompt,
profile, declared input file, option, or upstream key also invalidates a node.

## A partial run reports missing upstream output

`--from`, `--to`, and `--steps` reuse cached prerequisites. Run the whole flow
once, choose a boundary whose upstream has already run, or supply the missing
value with `--pin <node>=<file>`.

## Nothing comes out of a pipe

Results go to stdout, progress to stderr. `--silent` hides both — use `--quiet`,
which keeps results while hiding progress.

## A node is killed part-way

The subprocess timeout is 300 seconds unless overridden. Raise it for that node:

```yaml
  long_step:
    type: ai
    timeout: 1200
```

or flow-wide with `defaults: { timeout: 600 }`.

## The editor shows an old version

`chainq ui` reads its page assets once at startup. After changing anything the
server serves, restart it.

## The flow runs but the result is disappointing

Usually the chain is cut wrong, not the prompts. Check the chain smells table in
`SKILL.md`: one giant `ai` step, reasoning hidden in a `cmd`, or steps that do not
reference each other. Re-cut with the method in [authoring.md](authoring.md), then
tune one step at a time with `--pin` so you are not paying for the whole chain per
experiment.
