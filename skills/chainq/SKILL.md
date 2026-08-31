---
name: chainq
description: Author, run, and debug chainq flows — multi-step prompt chains defined in one YAML file and executed on a local CLI model (`claude -p`, `codex`). Use when the user asks to build, generate, edit, review, or debug a chainq flow or a flow.yaml, when they mention chainq, `chainq run`, `chainq ui`, or `chainq validate`, or when they describe a multi-step LLM workflow they want to run locally and re-run later.
license: MIT
compatibility: Requires chainq (@wahengchang2023/chainq), Node.js 18 or newer, and a local model CLI the user is already logged into for `ai` nodes.
---

# chainq

chainq runs a **prompt chain** — several prompts wired into a small DAG — from one
YAML file, on the CLI model the user is already logged into. No API key, no HTTP,
no hosted runtime. The same file runs from the terminal (`chainq run`) and opens
on a live canvas (`chainq ui`) where every node shows its real output.

## Prime directive

**The prompt chain must be visible in the flow.**

Split the work by responsibility, not by position in the graph:

- **`ai` — semantic work the model does.** Deciding, judging, extracting,
  generating, rewriting, summarizing, classifying, critiquing.
- **`assemble` — deterministic composition.** Joining or reshaping values that
  are already final. No new reasoning, no model call.
- **`cmd` — a narrow deterministic or external-tool boundary.** Reading a file,
  running a linter, calling a tool the user already has.
- **`input` — the trigger.** **`write` — persist a result.**

The one thing that is always wrong: **hiding semantic prompt work inside a command
or a helper script.** A `cmd` in the middle of a chain is fine —
`draft(ai) → lint(cmd) → fix(ai)` is a good flow. A `cmd` that decides, drafts,
classifies, or calls a model on an `ai` node's behalf is not, wherever it sits.
Never author a helper script just to make the YAML shorter.

`cmd.run` is spawned as argv with no shell — no pipes, redirects, or globs. A flow
that needs shell plumbing is usually a flow modelled wrong.

## A full chain is not a maximal one

Node count is not the goal. **A cognitive verb identifies a candidate stage, not
automatically a node.** A candidate earns its own node when its intermediate output
is worth inspecting, reusing, branching from, caching, or tuning on its own — that
is the whole test. Splitting past it produces fragments whose outputs mean nothing
to a reader, and each one still costs a model call.

The useful check: *if the `cmd` nodes were hidden, could a reviewer still see
where the model analyzes, decides, drafts, critiques, and synthesizes?*

## Workflow

**0 — Decide whether chainq fits.** It earns its keep when the task holds two or
more meaningful prompt transformations, branching prompt work, or a pipeline worth
re-running. A task that is one deterministic shell operation with no prompt-chain
structure should not be forced into a flow — say so instead of building one.

**1 — Design the chain before writing YAML.** Say it as stages:
"take X → extract Y → judge Z → draft → critique → revise → save". Each arrow is a
candidate node; apply the split test above to each. See
[references/authoring.md](references/authoring.md) for the decomposition method
and two before/after worked examples, and
[references/patterns.md](references/patterns.md) for six proven shapes with
runnable templates.

**2 — Give every `ai` node a contract.** Before writing its prompt, state:

| | |
|---|---|
| **Task** | the one transformation or decision this node owns |
| **Input** | explicitly — `{{ $json }}`, a field, or a named ancestor |
| **Criteria** | the constraints that matter at this stage |
| **Output** | what the next node is allowed to rely on |

Carry the user's original request forward to the stages that need it. A `revise`
step that sees only the draft and the critique will quietly drop constraints from
the original brief.

**3 — Write the YAML.** Every field, expression, and validation rule is in
[references/flow-syntax.md](references/flow-syntax.md). Load it before writing
anything past a two-step chain — especially before using `schema:`, which is a
flat `{ field: type }` map and **not** JSON Schema.

**4 — Validate. Always.** `chainq validate flow.yaml` is free and calls no model.
Never hand back a flow you have not validated.

**5 — Run it cheaply, not fully.** A full run spends a model call per `ai` step per
item. Prove the shape first — `--to`, `--steps`, `--cache`, `--pin`; see
[references/cli.md](references/cli.md).

**6 — Hand back the canvas.** Editing and running are the same screen, so finish
with `chainq ui flow.yaml` and let the user watch each node light up.

## Quality gate

Run this before handing a flow back. These are smells to explain or fix, not
automatic failures:

| Smell | Why it matters | Usual fix |
|---|---|---|
| a `cmd` that decides, drafts, or calls a model | the chain is hidden from the canvas | lift it into an `ai` node |
| `run:` invoking a script you just wrote | same, one step removed | delete the script, write prompts |
| the whole task in one `ai` step with a 40-line prompt | untunable, uninspectable | cut at the stage boundaries |
| a prompt with three or more imperative verbs | the step owns too much | split, if each half is worth inspecting |
| steps split so finely their outputs mean nothing alone | over-decomposition | merge them back |
| a step nothing downstream references | dead branch | wire it, or delete it |
| an `ai` step whose prompt only glues strings together | a wasted model call | use `assemble` |
| a final stage that never sees the original request | constraints get dropped | reference the trigger |
| a `cmd` reading a file with no `inputs:` | volatile — it and everything after re-run always | declare the files it reads |
| `schema:` written as JSON Schema | passes validate, fails at run time | use the flat `{ field: type }` map |
| `chainq validate` not run | you are guessing | run it |

## Minimum viable flow

```yaml
profiles:
  default: { cmd: 'claude -p' }      # the user's local CLI model

steps:
  start:                              # trigger — declares the flow's inputs
    type: input
    params:
      topic: { type: string, required: true }

  draft:
    type: ai
    from: start
    prompt: 'Write a 120-word explainer about {{ $json.topic }}. Output only the text.'

  critique:
    type: ai
    from: draft
    prompt: |
      List the 3 weakest sentences in this draft and why. Be specific.

      {{ $json }}

  revise:                             # sees the draft, the critique AND the brief
    type: ai
    from: [draft, critique]
    prompt: |
      Rewrite the draft, fixing every issue raised. Keep it about the original
      topic and length. Output only the rewritten text.

      TOPIC: {{ $('start').topic }}

      DRAFT:
      {{ $('draft') }}

      ISSUES:
      {{ $('critique') }}

  save:
    type: write
    from: revise
    path: out/{{date}}-explainer.md
```

## Reference map

Load only what the task needs.

| You need to | Read |
|---|---|
| turn a request into a chain, or fix a flow whose work vanished into scripts | [references/authoring.md](references/authoring.md) |
| a proven chain shape and a runnable template | [references/patterns.md](references/patterns.md) |
| every YAML field, expression, and validation rule | [references/flow-syntax.md](references/flow-syntax.md) |
| commands, flags, cheap iteration, exit codes | [references/cli.md](references/cli.md) |
| an error message you are staring at | [references/troubleshooting.md](references/troubleshooting.md) |

Runnable templates: `templates/refine.yaml`, `templates/fan-out-synthesize.yaml`,
`templates/extract-to-json.yaml`.
