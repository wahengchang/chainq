---
name: chainq
description: Author, run, and debug chainq flows — multi-step prompt chains defined in one YAML file and executed on a local CLI model (`claude -p`, `codex`). Use when the user asks to build, generate, edit, review, or debug a chainq flow or a flow.yaml, when they mention chainq, `chainq run`, `chainq ui`, or `chainq validate`, or when they describe a multi-step LLM workflow they want to run locally and re-run later.
license: MIT
---

# chainq

chainq runs a **prompt chain** — several prompts wired into a small DAG — from one
YAML file, on the CLI model the user is already logged into. No API key, no HTTP,
no hosted runtime. The same file runs from the terminal (`chainq run`) and opens
on a live canvas (`chainq ui`) where every node shows its real output.

## The prime directive

**A chainq flow is a chain of prompts. It is not a task runner, a Makefile, or a
shell script with YAML on top.**

The single most common failure when generating a flow is producing a file whose
real work happens in `cmd` steps or in one giant `ai` prompt. That file may run,
but it is not what chainq is for and the user cannot inspect, tune, or re-cut it.
Hold these rules:

1. **`ai` is the default node type.** Every step that *thinks* — decides, judges,
   extracts, generates, rewrites, summarizes, classifies, critiques — is an `ai`
   step. Reach for another type only for the specific reason it exists.
2. **`cmd` is edge I/O only.** Reading a file, listing a directory, calling a tool
   the user already has. Never put the reasoning the user asked for inside a
   command. If you are about to write `run: 'python analyze.py'` or
   `run: 'node summarize.js'`, that logic belongs in an `ai` prompt.
3. **Never author a script for the flow to call.** `cmd` is spawned as an argv
   array with no shell — no pipes, no redirects, no globs, on purpose. A flow that
   needs shell plumbing is a flow you modelled wrong.
4. **One step = one cognitive act.** If a prompt says "summarize *and then*
   translate *and then* format", it is three steps.
5. **Steps must actually depend on each other.** Later steps consume earlier ones
   through `{{ $json }}` or `{{ $('id') }}`. Independent steps side by side are a
   list, not a chain.
6. **Every step's output must be readable on its own.** The user opens the canvas
   and reads node cards. A step whose output means nothing to a human is cut wrong.

## Chain smells — run this checklist before you hand a flow back

| Smell | Why it is wrong | Fix |
|---|---|---|
| `cmd` steps outnumber `ai` steps | it is a script runner | move the reasoning into `ai` steps |
| exactly one `ai` step | it is a single prompt, not a chain | decompose into stages |
| a prompt with three or more imperative verbs | the step does too much | split it |
| `run: 'bash -c ...'` / `sh -c` / a pipe in `run` | reaching for a shell chainq withholds by design | re-express as `ai` / `assemble` |
| a step nothing downstream references | dead branch | wire it, or delete it |
| an `ai` step whose prompt only glues strings together | a wasted model call | use `assemble` (no model call) |
| a later step re-deriving what an earlier step produced | the data flow is broken | reference `{{ $('id') }}` |
| the whole flow in one `ai` step with a 40-line prompt | untunable, uninspectable | cut it at the cognitive seams |
| a `cmd` that reads a file with no `inputs:` | volatile — it and everything after it re-run always | declare every file it reads |
| `schema:` written as JSON Schema | the node fails at run time, not at validate | use the flat `{ field: type }` map |

A healthy small flow is typically **3–7 steps, of which most are `ai`**, plus an
`input` trigger and a `write` at the end when the result should land as a file.

## Workflow

**1 — Decompose before you type YAML.** Write the chain as a sentence first:
"take X → extract Y → judge Z → draft → critique → revise → save". Each arrow is a
step. If you cannot say the chain out loud, do not write it. See
[references/authoring.md](references/authoring.md) for the decomposition method and
two before/after worked examples.

**2 — Pick a shape.** Most real chains are one of six shapes (refine, fan-out and
synthesize, extract to JSON, map over a batch, boundary I/O, judge and fix). See
[references/patterns.md](references/patterns.md), which points at runnable
templates in `templates/`.

**3 — Write the YAML.** Node fields, template expressions, and every validation
rule are in [references/flow-syntax.md](references/flow-syntax.md). Load it before
writing anything past a two-step chain.

**4 — Validate. Always.** `chainq validate flow.yaml` is free and calls no model.
Never hand back a flow you have not validated. It catches typos, dangling `from:`,
cycles, bad profiles, and `{{ }}` references to nodes that are not ancestors.

**5 — Run it cheaply, not fully.** A full run spends a real model call per `ai`
step per item. Prove the shape first:

```bash
chainq validate flow.yaml            # free
chainq run flow.yaml --to draft      # stop early, reuse upstream cache
chainq run flow.yaml --steps 2       # first two nodes only
chainq run flow.yaml --cache         # reuse unchanged nodes while iterating
```

Options and output streams: [references/cli.md](references/cli.md).

**6 — Hand back the canvas.** chainq's value is that editing and running are the
same screen. Finish by telling the user:

```bash
chainq ui flow.yaml
```

so they can watch each node light up and tune a prompt without touching YAML.

## Minimum viable flow

```yaml
profiles:
  default: { cmd: 'claude -p' }      # the user's local CLI model

steps:
  start:                              # trigger — declares the flow's inputs
    type: input
    params:
      topic: { type: string, required: true }

  draft:                              # think
    type: ai
    from: start
    prompt: 'Write a 120-word explainer about {{ $json.topic }}. Output only the text.'

  critique:                           # think about the thinking
    type: ai
    from: draft
    prompt: |
      List the 3 weakest sentences in this draft and why. Be specific.

      {{ $json }}

  revise:                             # act on the critique, seeing both
    type: ai
    from: [draft, critique]
    prompt: |
      Rewrite the draft, fixing every issue raised. Output only the rewritten text.

      DRAFT:
      {{ $('draft') }}

      ISSUES:
      {{ $('critique') }}

  save:                               # land it
    type: write
    from: revise
    path: out/{{date}}-explainer.md
```

Five steps, three model calls, each one inspectable on the canvas. That is the
target shape.

## Structured output

When a later step reads fields, or the result is a `.json` file, put `schema:` on
the step that produces it. **`schema` is a flat field → type map — it is not JSON
Schema:**

```yaml
  to_json:
    type: ai
    from: [title, tags]
    schema: { title: string, tags: array }     # types: string number boolean array object
    prompt: 'Return ONLY a JSON object with fields title and tags. ...'
```

Writing `schema: { type: object, properties: {...} }` is the common mistake:
chainq would then demand the model return fields literally named `type` and
`properties`, and the node fails after one retry. Without `schema`, a node's
output is raw text and `{{ $json.field }}` will not work.

## Node types at a glance

| Type | Use it for | Never use it for |
|---|---|---|
| `ai` | any reasoning or generation; add a flat `schema:` map for guaranteed JSON | nothing — this is the default |
| `assemble` | joining or reshaping values with no model call | reasoning |
| `cmd` | reading a file, listing files, calling an existing tool | the task's actual logic; anything needing a shell |
| `input` | the trigger and its declared parameters | anything with `from:` — it is a root |
| `write` | landing the result as a file | intermediate steps |

## Hard constraints worth remembering now

- `cmd.run` is split into argv and spawned **without a shell**. No `|`, `>`, `*`, `&&`.
- A `cmd` node without `inputs:` is **volatile** — it re-runs even with `--cache`.
- `chainq run` **re-runs everything by default**; `--cache` opts back into reuse.
- `{{ $('id') }}` may reach any **ancestor**, not only the direct `from`. Referencing
  a non-ancestor is a validation error.
- An `ai` node with `schema` must return a JSON **object**; chainq retries once, then fails.
- `schema` is a flat `{ field: type }` map. JSON Schema (`type:`/`properties:`) is wrong.
- `profiles.default` is required as soon as one `ai` node exists.
- Node ids must match `^[A-Za-z_][A-Za-z0-9_-]*$` (max 64 chars) — they are also filenames.
- `.chain/` holds cache, layout, and real model output. Never commit it.

## Reference map

Load only what the task needs.

| You need to | Read |
|---|---|
| turn a request into a chain, or fix a flow that became a script runner | [references/authoring.md](references/authoring.md) |
| every YAML field, expression, and validation rule | [references/flow-syntax.md](references/flow-syntax.md) |
| a proven chain shape and a runnable template | [references/patterns.md](references/patterns.md) |
| commands, flags, cheap iteration, exit codes | [references/cli.md](references/cli.md) |
| an error message you are staring at | [references/troubleshooting.md](references/troubleshooting.md) |

Runnable templates live in `templates/`: `refine.yaml`, `fan-out-synthesize.yaml`,
`extract-to-json.yaml`.
