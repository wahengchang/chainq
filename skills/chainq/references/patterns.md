# Chain patterns

Six shapes cover almost every real flow. Pick one, then adapt. Three ship as
runnable templates in `templates/` — copy the file, rename the nodes, rewrite the
prompts.

---

## 1. Refine — draft, critique, revise

```
start ─→ draft ─┬─→ critique ─┐
                └─────────────┴─→ revise ─→ save
```

**Use when** quality matters more than speed: prose, explanations, copy, specs.

**The key move** is that `revise` takes `from: [draft, critique]` and quotes both
in its prompt. A revise step that sees only the critique has nothing to rewrite.

Template: [`templates/refine.yaml`](../templates/refine.yaml)

---

## 2. Fan out and synthesize

```
start ─┬─→ angle_a ─┐
       ├─→ angle_b ─┼─→ synthesize ─→ save
       └─→ angle_c ─┘
```

**Use when** one source needs several independent passes: extract decisions /
risks / next steps; review for correctness / style / tests; three takes on a topic.

**The key move**: each branch gets one narrow instruction, and the synthesizer is
told to use *only* the material quoted from the branches. Branches never see each
other — that independence is the point.

Template: [`templates/fan-out-synthesize.yaml`](../templates/fan-out-synthesize.yaml)

---

## 3. Extract to structured JSON

```
source ─→ extract ─→ to_json (ai + schema) ─→ save (.json)
```

**Use when** the output must be machine-readable, or a later step reads fields.

**The key move**: only the `to_json` step carries `schema:`. Do not try to make an
early creative step emit JSON — let it write freely, then convert. Never build
JSON by string-concatenating in `assemble`; quoting and newlines will break it.

Template: [`templates/extract-to-json.yaml`](../templates/extract-to-json.yaml)

---

## 4. Map over a batch

```
start (many input sets) ─→ classify ─→ explain ─→ save (append)
```

**Use when** the same chain runs over many rows.

```yaml
steps:
  start:
    type: input
    params:
      ticket: { type: string, required: true }
  classify:
    type: ai
    from: start
    schema: { label: string, confidence: number }
    prompt: |
      Classify this support ticket as billing, bug, or howto.
      Return ONLY a JSON object with fields label and confidence (0-1).

      {{ $json.ticket }}
  explain:
    type: ai
    from: [classify, start]
    prompt: |
      In one sentence, say why this ticket is "{{ $json.label }}".

      {{ $('start').item.ticket }}
  save:
    type: write
    from: explain
    path: out/triage.md
    mode: append
```

```bash
chainq run flow.yaml --input-file tickets.jsonl
```

**Watch the cost**: items × `ai` nodes model calls. Prove the chain on one
`--input ticket=...` before pointing it at the file. There is no `loop` node in
chainq — a batch `input` *is* the loop.

---

## 5. Boundary I/O, pure reasoning inside

```
load (cmd) ─→ extract ─→ judge ─→ report
```

**Use when** the data must come from disk or a tool the user already has.

```yaml
steps:
  load:
    type: cmd
    run: 'cat notes.md'
    inputs: ['notes.md']     # declared → cacheable; without this it re-runs always
```

Exactly one `cmd`, at the edge. Everything after it is `ai`. If a second `cmd`
appears in the middle of the chain, you are almost certainly doing reasoning in a
command — see [authoring.md](authoring.md).

Remember there is no shell: `git diff main` is fine, `git diff | head -50` is not.

---

## 6. Judge and fix

```
generate ─→ judge (ai + schema) ─┬─→ fix ─→ save
                                 └─(score, issues)
```

**Use when** output must clear a bar, and you want the bar visible on the canvas.

```yaml
  judge:
    type: ai
    from: generate
    schema: { score: number, issues: array }
    prompt: |
      Score this against: factual, concrete, under 150 words.
      Return ONLY a JSON object with fields score (0-10) and issues (array of strings).

      {{ $json }}

  fix:
    type: ai
    from: [generate, judge]
    prompt: |
      Rewrite to resolve every issue. Output only the text.

      TEXT:
      {{ $('generate') }}

      ISSUES:
      {{ $('judge').item.issues }}
```

The `schema` on `judge` is what makes the score readable on the node card and
usable downstream. chainq has no conditional edges, so the `fix` step always runs;
tell it in the prompt to return the text unchanged when there are no issues.

---

## Composing shapes

Real flows nest these: boundary I/O feeding a fan-out, whose synthesis goes
through a refine loop, ending in extract-to-JSON. Keep the total under roughly ten
nodes — beyond that, split into two flows and let a `write` from the first feed a
`cmd` read in the second.
