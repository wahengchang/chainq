# Handoff 2 — input trigger node + paired-item fix + repo squash

Continues `HANDOFF.md` (the editor/items-model UI handoff). Read that one first —
this doc only records what changed **after** it.

Last verified on `main` @ **3b56a5b** with: **typecheck clean · 80 unit green ·
40 e2eCli e2e green (real `claude -p`)**. Browser e2e (`e2e/browser/editor.spec.ts`,
offline) unchanged, not re-run this session.

## TL;DR
- New engine/CLI feature: a **`input` trigger node** — a flow declares params, you
  supply values at run time (`--input` / `--input-file`), one set → one item, many
  → a batch. Done + tested on the CLI.
- A cross-model review (codex) found 3 issues. **2 fixed** (a real silent-wrong-output
  paired-item bug + an input-file validation gap), **1 deferred** (web can't pass
  runtime input — this is the #1 next task, see below).
- Repo housekeeping: the old **35-commit / 8-stacked-PR** history was squashed into a
  **single commit on `main`**; all 8 PRs closed, all feature branches deleted. Origin
  now has only `main`.

## Where the truth lives (3 layers — don't mix)
- **現況層 (what exists / gaps):** `draft.md` — Capability & Gap Map. **Slightly stale**:
  it predates this session, so it does NOT yet show the `input` node or that input is
  "CLI done / web missing". Update it when you next touch the code.
- **決策層 (why):** `docs/design/2026-06-04-loop-and-scenarios.md` (engine) + the
  office-hours/eng-review design doc under `~/.gstack/projects/chain-cli/`.
- **未來層 (next):** the "What's next" list below + `HANDOFF.md`'s canvas list.

## What shipped this session (all in commit 3b56a5b)

### 1. `input` trigger node (CLI)
A flow declares a trigger with params + defaults; values come in at run time.

```yaml
steps:
  in:   { type: input, params: { city: { default: Tokyo }, lang: { default: zh-tw } } }
  show: { type: assemble, from: in, prompt: 'city={{ $json.city }} lang={{ $json.lang }}' }
```

- `chain run flow.yaml` → uses `params` defaults → 1 seed item.
- `chain run flow.yaml --input city=Osaka` → overrides one param (others keep
  defaults); value is JSON-parsed if possible (numbers/bools/arrays), else a string.
  `--input` is repeatable.
- `chain run flow.yaml --input-file sets.{json,jsonl}` → one object, an array of
  objects, or JSONL → **many sets = batch**, the whole chain runs once per set.
  `--input-file` + `--input` compose: `--input` overrides every set.

Files: `types.ts` (`NodeType += "input"`, `ParamSpec`, `FlowNode.params`),
`dag.ts` (`NODE_TYPES` + parse `params`), `run.ts` (the `input` branch emits
`sets.map((set,i) => ({json:{...defaults,...set}, pairedItem:i}))`), `validate.ts`
(input is a trigger → must NOT have `from:`), `cli/index.ts` (`--input` / `--input-file`,
`parseInputFile`), `cache.ts` (see next).

**Cache correctness:** the input node's Merkle key folds in `params` + the run-time
`input` array, so changing `--input` invalidates the trigger **and all downstream**;
the same input hits cache. `ENGINE_VERSION` is `2` (outputs are `Item[]`).
Tests: `e2eCli/scenarios/input.e2e.ts` (6, offline via input→assemble).

### 2. Paired-item across a fan-out (codex finding ①, **fixed** — was silent wrong output)
After `splitOut` changes cardinality, a downstream fan-in to a **pre-split** upstream
via `$('id')` / `.item` was paired by the **loop index**, not by lineage. Repro:
`seed[X,Y] → split → show("{{ $json }}|{{ $('seed').item.tag }}")` produced
`1|X 2|Y 3|Y 4|Y` instead of the correct `1|X 2|X 3|Y 4|Y`.

Fix: cross-references to **other** upstreams now resolve through the current item's
`pairedItem` (`RenderInputs.pairedIndex`, computed in `run.ts`); `$json` and a
self-reference `$('primary')` still use the loop index. **No-op for 1-in-1-out chains**
(there `pairedItem === index`), so zero regression — confirmed by 80 unit + 40 e2e.
Files: `render.ts`, `run.ts`. Tests: 2 in `render.test.ts` + `e2eCli/scenarios/pairing.e2e.ts`.

> ⚠️ **Limitation — single-hop.** This pairs correctly when the referenced upstream is
> the primary's direct input or a 1:1 ancestor chain. A full multi-hop **lineage walk**
> (correct through aggregates / multi-layer fan-out) is **not** implemented. Marked in
> the `render.ts` comment. This is "What's next" item P-LINEAGE below.
>
> ✅ **RESOLVED (`feat/lineage`, P-LINEAGE).** The multi-hop lineage walk shipped:
> `run.ts` `lineageOf()` composes `pairedItem` up the primary spine, so `$('id').item`
> is correct across two-level fan-outs and collapses to the first source row across an
> aggregate. Only references off the primary spine still use the single-hop fallback.

### 3. `--input-file` rejects non-object entries (codex finding ②, fixed)
A JSONL line `"abc"` / `123` or a top-level array of primitives used to be cast to a
`Record` and become a malformed seed item. `parseInputFile` now validates every set is
a plain object via `isPlainObject` and throws otherwise. Test in `input.e2e.ts`.

### 4. Repo squash + cleanup
`main..HEAD` (35 commits across 8 stacked PRs #1–#8) was collapsed into one commit
(`3b56a5b`) whose tree is byte-identical to the old tip `f7ed7b9` (verified: empty
`git diff`). Pushed fast-forward to `main`. All 8 PRs closed, all 8 feature branches
deleted from origin + locally; tracking refs pruned. **Origin now has only `main`.**
(The old tip `f7ed7b9` is still in local reflog if anything needs recovery.)

## What's next (priority order)

**P0 — input usable in the web editor (codex finding ③, OPEN — do this first).**
`/api/run` and `/api/run-node` in `src/web/server.ts` do **not** accept or pass runtime
input, and `new Runner(...)` there has no `input`. So a flow with `type: input` can only
run with `{}`/defaults in the UI — **and it writes those defaults into the same `.chain`
cache**, so the user thinks they ran some input but actually ran empty. This is a real
correctness footgun, not just a missing feature. Wire: server endpoints take an `input`
payload → `Runner({..., input})`; node panel for `input` lets you fill params and run.

**P1 — per-item panel** (`/api/items` already built + tested): show `item[0..N]`.
**P2 — drag-to-connect + remember position** (`/api/connect`, `/api/layout` ready).
**P3 — per-type panel editors** (splitOut/aggregate `field`, merge `mode`+`key`);
  `saveNode()` in `app.js` still writes `prompt` for every non-`cmd` type.
**P4 — cleanup** (per `draft.md` §5): temp pages, UI tests drive real `chain ui`.
~~**P-LINEAGE — full multi-hop paired-item walk**~~ ✅ DONE (`feat/lineage`) — upgraded the
single-hop fix from §2 to a lineage walk; correct across two-level fan-out + aggregate.

See `HANDOFF.md` "What's next" for the full canvas backlog (P1–P3 overlap it).

## Open decision (deferred by the user)
Canvas architecture for P1–P3: **keep stacking the vanilla canvas** vs **adopt React
Flow** (design T10). Affects implementation cost of P2/P3; P0/P1 are mostly unaffected.
Not decided yet.

## Run & test (delta from HANDOFF.md)
```bash
npm test                 # 80 unit (incl render paired-item tests)
npm run e2e:cli          # 40 e2eCli e2e — gated tests call REAL claude (needs `claude login`)
# input feature is offline-testable: input→assemble needs no model
```
`e2e:cli` and `e2e` both map to `vitest run --config vitest.e2e.config.ts` (the
`e2eCli/` suite). Browser e2e is the separate Playwright `e2e:ui:*` set.

## Gotchas specific to this session
- ~~**Single-hop pairing** (§2 limitation)~~ — RESOLVED on `feat/lineage` (P-LINEAGE):
  `$('id').item` is now correct across two-level fan-outs and aggregates (first source
  row). Only off-primary-spine references still use the single-hop fallback.
- **Web input cache pollution** (P0) — until P0 lands, do not run `type: input` flows from
  the web editor expecting the cache to reflect a chosen input; it runs defaults.
- **`delete_dot_underscore.sh`** is an untracked macOS `._*` cleanup helper (NAS artifact),
  intentionally NOT committed. Ignore or `rm` it.
- **Direct-to-main workflow** — the user confirmed this is a solo repo and pushes straight
  to `main` (no PR). The 8-PR stack is gone; don't recreate stacked PRs.
