# Authoring: turning a request into a real prompt chain

This page exists because of one recurring failure: a generated flow that *runs*
but is not a prompt chain — the reasoning ended up in shell commands, or in a
single oversized prompt. This is how to avoid producing that file.

## The decomposition method

Answer five questions, in order, before writing YAML.

**0. Does chainq fit at all?**
It earns its keep when the task holds two or more meaningful prompt
transformations, branching prompt work, or a pipeline worth re-running. One
deterministic shell operation with no prompt-chain structure should not be forced
into a flow — say so rather than building one.

**1. What comes in, and from where?**
A value the user types, a file on disk, or the output of a tool they already have.
Each boundary source enters through its own node — `input` for a typed value,
`cmd` for a file or a tool. **Several sources is normal**, and they meet at the
first `ai` step that needs them:

```text
job_description (input) ─┐
                         ├─→ analyze (ai) → ...
resume.md (cmd) ─────────┘
```

**2. What are the cognitive acts between input and answer?**
Say the chain out loud as verbs joined by arrows. **A verb identifies a candidate
stage, not automatically a node** — question 6 decides which candidates earn one:

| Verb | The step does | Typical output |
|---|---|---|
| extract | pull the relevant facts out of raw text | a short list |
| classify / route | decide what kind of thing this is | one label |
| judge / score | rate against stated criteria | a score plus reasons |
| plan / outline | decide the shape of the answer | 3–5 bullets |
| generate / draft | write the thing | prose |
| critique | find what is wrong with the previous step's output | a list of issues |
| revise | rewrite given the draft *and* the critique | prose |
| structure | turn prose into declared fields | a JSON object (`schema:`) |
| translate / rewrite | change form, not content | prose |

**3. Which of those need to see more than one earlier step?**
Those get `from: [a, b]` and reference each upstream by name in the prompt
(`{{ $('a') }}`). This is how critique-then-revise, and any synthesis, works.

**4. Does the result need to land somewhere?**
If yes, one `write` node at the end. If the user only wants to read it, skip it —
`chainq run` prints the leaf to stdout.

**5. Does any step need guaranteed structure?**
If a downstream step reads fields, or the result is a `.json` file, the producing
step is `ai` with `schema:`. Without `schema`, model output is raw text and
`{{ $json.field }}` will not work.

**6. Which candidates earn their own node?**
Take each arrow from question 2 and ask: is this intermediate output worth
inspecting, reusing, branching from, caching, or tuning on its own? Yes → its own
`ai` step. No → fold it into its neighbour. Two verbs in one prompt is fine when
nobody would ever look at the seam between them.

Now write the YAML.

## Sizing a step

Split a stage out when its intermediate output is worth **inspecting, reusing,
branching from, caching, or tuning on its own**. That single test decides it — not
prompt length, and not a target node count.

Signs a step is the right size:

- Its output is something a person would recognise if shown it alone on the canvas.
- Re-running only this step, with a tweaked prompt, is a meaningful experiment.
- You can name it in one word: `extract`, `score`, `draft`, `critique`, `revise`.

If naming it needs "and", that is a sign of two candidate stages. But a long prompt is not by
itself a reason to split: fragments whose outputs mean nothing alone are their own
failure, and they cost a model call each. Keep a stage whole when splitting it
would only produce pieces nobody would ever inspect.

## Meaning first, format second

When the answer has to come out in a fixed shape, do not ask one prompt for both
the judgement and the presentation. Let an `ai` step settle the meaning under a
`schema:`, then let a free `assemble` template render it:

```yaml
  verdict:
    type: ai
    from: review
    schema: { status: string, reason: string, owner: string }
    prompt: |
      Decide the release status from the review below.
      status is exactly one of: ship, hold, block.

      {{ $json }}

  report:                             # no model call — the format is settled here
    type: assemble
    from: verdict
    prompt: |
      ## Release check — {{ $json.status }}

      {{ $json.reason }}

      Owner: {{ $json.owner }}
```

The heading, the field order, and the wording belong to the template now: the
model cannot drift them between runs, and the only thing left to tune is the
judgement. Note where the constraint on `status` lives, too — `schema:`
guarantees the fields and their types, not the set of legal values, so name the
values once in the prompt, and if the choice must actually be enforced put a
`cmd` check after the node rather than a paragraph of prohibitions.

## Naming

Node ids are YAML keys, cache filenames, and canvas labels. Use the verb:
`load`, `extract`, `score`, `draft`, `critique`, `revise`, `to_json`, `save`.
Not `step1`, `step2`, `node3`. Must match `^[A-Za-z_][A-Za-z0-9_-]*$`, max 64 chars.

## Worked example 1 — meeting transcript to a manager update

The user asks: *"Take my meeting transcript and turn it into a weekly update for
my manager."*

### The wrong flow (a script runner)

```yaml
steps:
  process:
    type: cmd
    run: 'python summarize_transcript.py transcript.txt'
  save:
    type: write
    from: process
    path: out/update.md
```

What is wrong: the whole task lives in a script that does not exist and that
chainq cannot help with. There is nothing to inspect on the canvas, nothing to
tune, no model call chainq manages. A second variant of the same mistake is one
`ai` node whose prompt says "read the transcript, pull out decisions, risks and
next steps, then write a manager update in a friendly tone" — one opaque call the
user cannot re-cut.

### The right flow

```yaml
profiles:
  default: { cmd: 'claude -p' }

steps:
  load:                               # boundary I/O — the only non-ai step here
    type: cmd
    run: 'cat transcript.txt'
    inputs: ['transcript.txt']        # declared → cacheable

  decisions:
    type: ai
    from: load
    prompt: |
      List every decision made in this transcript, one per line.
      If none, output "none".

      {{ $json }}

  risks:
    type: ai
    from: load
    prompt: |
      List every risk, blocker, or open question raised. One per line.

      {{ $json }}

  next_steps:
    type: ai
    from: load
    prompt: |
      List every committed next step as "owner — action — due". One per line.

      {{ $json }}

  update:
    type: ai
    from: [decisions, risks, next_steps]
    prompt: |
      Write a weekly update for a manager: 5 sentences, plain, no filler,
      leading with outcomes. Use only the material below.

      DECISIONS:
      {{ $('decisions') }}

      RISKS:
      {{ $('risks') }}

      NEXT STEPS:
      {{ $('next_steps') }}

  save:
    type: write
    from: update
    path: out/{{date}}-update.md
```

Why this is right: three independent extractions the user can read and correct on
the canvas — each one is worth inspecting alone, which is what earns it a node —
one synthesis that sees all three, one file. Tuning "risks" is one
prompt edit and one `--from risks` re-run.

Every prompt above uses a block scalar (`prompt: |`). Do that whenever a prompt
needs real newlines: `'...\n{{ $json }}'` inside single-quoted YAML sends a
literal backslash-n to the model, not a line break.

## Worked example 2 — when a command *is* legitimate

The user asks: *"Review the files I changed on this branch."*

The boundary genuinely needs a tool: only `git` knows the diff. But the review
itself is reasoning.

```yaml
profiles:
  default: { cmd: 'claude -p' }

steps:
  diff:                               # legitimate cmd: a tool the user already has
    type: cmd
    run: 'git diff --unified=3 main'

  risky:
    type: ai
    from: diff
    prompt: |
      From this diff, list changes that could break behaviour.
      One per line, each naming the file.

      {{ $json }}

  tests:
    type: ai
    from: diff
    prompt: |
      From this diff, list behaviour that is changed but not covered by a test
      in the same diff.

      {{ $json }}

  report:
    type: ai
    from: [risky, tests]
    prompt: |
      Write a short review. Two sections, "Risk" and "Missing coverage".
      Each bullet names a file. Omit a section that has nothing.

      RISK CANDIDATES:
      {{ $('risky') }}

      COVERAGE GAPS:
      {{ $('tests') }}
```

One `cmd` at the boundary, three `ai` steps doing the work. The test for a
legitimate `cmd`: *is its output fully determined by its input, with no judgement
involved?* If a model would have to decide something, it is an `ai` step.

Position is not the test. A deterministic command is welcome mid-chain —
`draft(ai) → lint(cmd) → fix(ai)` is a good flow, and so is a format conversion
between two prompt stages. The only thing that is always wrong is a command that
carries reasoning, or that calls a model on an `ai` node's behalf.

Note `git diff --unified=3 main` works because it is plain argv. `git diff | head`
would not — there is no shell.

## Rewriting a flow that became a script runner

1. List every `cmd` node. For each, ask: is this deterministic work, or is it
   deciding something? Deciding → convert to `ai`, and move the logic into the
   prompt. A genuinely deterministic command may stay exactly where it is.
2. Find every `ai` node whose prompt contains "and then", "also", or a numbered
   list of tasks. Those are candidate seams — split the ones where the
   intermediate output is worth inspecting, reusing, caching, or tuning on its
   own, and leave the rest whole.
3. Re-wire: each new step's `from:` is the step whose output it consumes.
4. Delete `assemble`-able `ai` steps — string joining costs a model call for nothing.
5. `chainq validate flow.yaml`, then `chainq run flow.yaml --steps 2` to prove the
   front of the chain before paying for the whole thing.

## Cost discipline

Every `ai` node runs **once per input item**. A 20-item batch through a 4-step
chain is 80 model calls. Before a full run: `chainq validate`, then `--steps` or
`--to` on a single input, then widen. `--pin <node>=<file>` lets you tune a late
step against a fixed upstream sample without re-running the expensive front.
