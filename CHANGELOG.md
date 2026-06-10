# Changelog

## 0.1.9

- **Editor: stop a run in flight.** A run had to finish on its own — a slow model
  call left you waiting, or killing the server. A **Stop** button now cancels the
  running chain: it aborts the in-flight node's subprocess and skips everything
  downstream, so you can fix a prompt and re-run without waiting it out. The
  add-step control also moved into the canvas toolbar (next to zoom), keeping the
  canvas chrome in one place.

## 0.1.8

- **Editor: zoom the canvas to manage big graphs.** A large flow ran off-screen
  with no way to see its whole shape. The canvas now zooms — `−` / `+` / `fit`
  buttons in the top bar, plus `⌘ +` / `⌘ -` and trackpad pinch. `fit` frames the
  entire graph; zoom is layout-only and never touches the flow.
- **Editor: the ai output-format box collapses.** The output-schema selector
  (Text / JSON / List) now folds up, and collapsed it shows just the current
  format — so the output column stays tidy when you're not editing the schema.

## 0.1.7

- **Editor: run your unsaved edits without saving first (draft model).** A node's
  edits used to live only in the textarea, while a run read the flow from disk — so
  a re-run executed the SAVED prompt and the stream's re-render wiped what you
  typed. Now an edit is kept as a per-node DRAFT: a run sends it as an in-memory
  override (the file is never touched, same idea as the `/api/render` template
  override), the run stream redraws only the output region so the edit survives,
  and the draft PERSISTS across close / node-switch / raw toggle — no prompt on
  leave. `Save` writes it to the file; `↩ Reset` discards it back to the saved
  value; a `●` marker on the canvas node + a footer chip flag unsaved drafts.
  Browser-only, per flow, per session. Covered by `e2e/browser/draft-run.spec.ts`.
- **Editor: ai output-schema field editor in the output column.** An ai node's
  structured-output schema moved from a raw JSON textarea to a two-level editor
  that sits above the output (where the contract belongs): pick an output format
  (Text / JSON / List), and JSON exposes `field → type` rows with a live "model
  returns:" preview. `List` wraps the array in a reserved `_list` field (the engine
  forbids a bare top-level array) — pure UI sugar, zero engine change. Covered by
  `e2e/browser/schema-editor.spec.ts`.
- **Run state: "queued" vs "running" are now distinct.** A run marked the WHOLE
  cone "running" at once, so a sequential chain looked like every node was
  executing simultaneously. The engine now emits an `onStart` the instant a node
  actually begins (past the cache/skip gates), streamed to the UI as a `running`
  record. The canvas shows the ONE executing node with the live spinner (solid
  accent + pulse) and the rest "queued" (dashed dim border, no spinner) — so you
  can see the queue advance one step at a time. Covered by `run-state.spec.ts` +
  server-stream tests.
- **Run state: a running node no longer shows its stale previous output.** While a
  node is queued or running, the panel's OUTPUT (and the canvas card) showed the
  LAST run's cached result — looking like the current run already finished with
  wrong data. It now shows "running…" / "queued — waiting its turn…" instead, and
  the real output replaces it when the run settles (`loadItems` is guarded so the
  cached items can't paint over the live indicator).
- **Editor: click an earlier output to wire it in + insert its reference.** The
  node panel's "earlier outputs" box (transitive upstreams not yet wired) was
  read-only — you had to drag a wire on the canvas, then come back and click the
  reference. Now one click on an earlier output appends it to `from:` (NON-primary,
  so `$json` stays the first input) AND inserts `{{ $node["id"] }}` at the cursor.
  Unsaved prompt edits are preserved across the wiring reload, matching the
  existing direct-input insert. Covered by `e2e/browser/insert-earlier.spec.ts`.

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
