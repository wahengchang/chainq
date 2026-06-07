# Changelog

## 0.1.6

Docs release (no code changes).

- **README is now a scannable landing page** — one-line pitch, a hero screenshot
  of the visual editor, a CLI + UI quickstart, and a "you want to… → go to" table
  linking the deeper docs. The engine internals moved behind those links.
- **Docs synced to current behavior** — the cache walkthroughs use `--cache`
  (since `run` re-runs by default), dead `fake`/offline-profile references are
  gone, and the dated design/planning snapshots carry a "current behavior differs"
  pointer.

## 0.1.5

- **Editor: tighter node panel.** The input column had large phantom gaps (the
  `.mbody` `white-space:pre-wrap` was rendering the source-code newlines between
  its blocks). Removed it there — so the input chips, schema, direct inputs and
  earlier outputs all fit without scrolling.
- **Editor: the type dropdown is context-aware.** A start node (no upstream) only
  offers `input` / `ai` / `cmd`; a node with upstream offers the consumer types
  (`ai` / `cmd` / `assemble` / `splitOut` / `aggregate` / `merge`) but not the
  `input` trigger. No more nonsensical options like `merge` on a start node.
- **Editor: an `input` trigger no longer shows a prompt column.** The hide had
  no effect because `.mcol{display:flex}` overrode `.hidden{display:none}` —
  made `.hidden` win (`!important`) and collapse the panel to INPUT + OUTPUT (two
  columns) for triggers, since a trigger has no prompt.

## 0.1.4

- **Editor: change a node's type.** The panel header has a type dropdown — switch
  a node between ai / cmd / input / merge / etc. It resets that node's
  type-specific fields to the new type's defaults and keeps its wiring (an
  `input` trigger drops its `from`). E.g. turn a step into an `input` node and
  add a default-valued parameter.
- **Editor: fix the doubled "no upstream" note.** A start node now shows one
  clear line instead of two.

## 0.1.3

- **Editor: no more typing node ids.** The `from` text box is gone. A node's
  wiring now shows as **chips** (first = `$json`), each with a `×` to disconnect
  — so you wire on the canvas (drag a node's ● / the `+` on a wire) and just
  *see* the result here.
- **Editor: the panel shows earlier steps' outputs.** Below the direct
  input(s), every earlier upstream step's output is listed (read-only) so you
  can see all the data flowing toward this node.

## 0.1.2

- **Editor: the `from` field is clearer.** It now reads "wired upstream(s)",
  shows `empty = start node`, and a hint explains it auto-fills when you connect
  on the canvas — typing ids is optional, not required.

## 0.1.1

- **`chainq run` now re-runs every node by default.** Pass `--cache` (alias
  `--reuse`) to reuse unchanged outputs; the partial-run modes (`--from` /
  `--to` / `--steps` / `--pin`) still reuse upstream cache as before.
- **Editor: invalid nodes are flagged.** A node whose prompt references an
  unwired upstream (e.g. `$('start')` without `start` in `from:`) — or any
  other validation error — now shows a red outline and a ⚠ reason on the canvas
  and in its panel, so the problem is visible before you run.
- **Editor: insert a step between two nodes.** Hover a wire and click the `+`
  at its midpoint to drop a new node onto that edge — the upstream and
  downstream are rewired automatically.

## 0.1.0

- Initial release: prompt-chain runner for local CLI models (`claude -p`,
  `codex -m`), Merkle-cached engine, CLI + local `127.0.0.1` visual editor.
