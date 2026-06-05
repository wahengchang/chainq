# Explanation

Understanding-oriented. The ideas behind chain — why it's shaped this way. For
the exact surface, see [reference.md](./reference.md).

## The wedge: the iteration loop

A prompt workflow is 3–10 steps. The real pain isn't writing it once — it's
**tuning one prompt without re-running the slow, expensive steps above it**.

chain optimizes for that loop. Edit a node, and only that node plus its
transitive downstream re-run; everything else is served from cache:

```
edit `summarize`
  fetch   ⊘ cached     (untouched)
  clean   ⊘ cached     (untouched)
  summarize ✓ ran      (you edited it)
  title   ✓ ran        (downstream of the edit)
```

Tune one prompt, pay for one step. Everything else in the design serves this.

## The items model (why nodes run "per item")

chain follows n8n's data model: **every wire carries a list of items, and a node
runs once per input item** — automatically. This means there is no `loop`
construct. To do something to each element of a list you don't write a loop; you
fan the list into items and let the next node run per item:

```
list ─▶ [Split Out] ─▶ [do X]  ─▶ [Aggregate]
        array→items   runs per    items→array
                      item (auto)
```

Why this over a bolt-on `map`/`loop` node: iteration becomes the default, not a
special case. Fan-out (`splitOut`), fan-in (`aggregate`), and combining streams
(`merge`) are the only new pieces; "loop" falls out for free. A single-value
chain is just the degenerate case — one item in, one item out — so existing
linear flows behave exactly as before.

An item is `{ json: <value> }`. For an `ai`/`cmd` node the value is the raw output
text (not auto-parsed — model output is messy, and silently parsing markdown
fences would corrupt prompts downstream). You reach into structure explicitly,
with `splitOut` or a `{{ $json.field }}` path.

## The cache is a Merkle key (why it's never stale)

Each node's cache key folds in its own content (type, prompt, profile, declared
input hashes, config) **and its upstreams' keys**. So editing a node changes its
key, which changes every downstream key transitively — and leaves sibling
branches untouched.

This is content-addressed, not bookkeeping. There's no "remember to clear the
right caches" step to get wrong (a class of bug other tools ship). If the inputs
and the node are unchanged, the output is reused; otherwise it re-runs. That's
the whole rule.

`cmd` nodes with no declared `inputs:` are the exception: chain can't see what a
command reads, so it can't know when the output changed. Such a node is
**volatile** — always re-runs, never persisted — and that volatility propagates
downstream. Declare `inputs:` to make it cacheable again.

## Why there is no fake/offline model

chain is a tool for running **real** local CLI models. Earlier versions shipped a
`cat` "fake model" profile for offline demos; it's been removed from the product.
Every `ai` run calls the real model (`claude -p`). This keeps one honest story:
what you run is what ships. (The test suite gates model-running tests on `claude`
being present; pure structural checks — `validate`, scaffolding — stay offline.)

## One engine, two callers

```
        one YAML file (the source of truth)
                 │
          src/engine  (parse · Merkle cache · run · validate)
                 │
        ┌────────┴────────┐
       CLI              web UI
   chain run/...      chain ui
```

The CLI and the visual editor are both thin callers over the **same** engine —
there is never a second implementation of "run a node" or "is this cached". The
CLI is the fast path; the UI (`chain ui`) is the same flows with a canvas and
per-node panels. Structural edits in either always write back to the one YAML
(comment-preserving, validate-before-write).

## Where to go next

- The facts: [reference.md](./reference.md)
- Do a task: [how-to.md](./how-to.md)
- The current state of what's built vs not: [`../../draft.md`](../../draft.md) (the project's Capability & Gap Map)
