# Changelog

## 0.1.18

- **CLI: `chainq run` now shows you the result.** It used to print only per-node status
  (`✓ greet`) to stderr — to see what a node actually produced you had to `cat
  .chain/outputs/<id>.out`. Now the chain **result goes to stdout** (every leaf node;
  multiple leaves each under a `— <node> —` header) while progress stays on stderr, so
  `chainq run flow.yaml | jq` pipes only the result. Two new flags follow the usual
  convention: `-q`/`--quiet` hides progress but keeps the result (and still shows
  failures), `-s`/`--silent` prints nothing at all (exit code only). Reads from the
  in-memory run result, not the cache file, so a `cmd` leaf prints too. Covered by
  `e2eCli/scenarios/output.e2e.ts` (default split / `-q` / `-s` / multiple leaves / long forms).
- **Editor: the middle column only appears for nodes that use it.** It no longer shows a
  fake prompt field for the 5-of-8 node types that have no prompt (`cmd`, `splitOut`,
  `aggregate`, `merge`, `input`).
- **Editor: forcing a connection no longer lets a cycle through.** `/api/connect`'s force
  path only relaxes pure edge removals, never an edge add that would create a cycle.
- **UI text is now English** across the editor (e.g. lineage wires read "refs").
- New example flows: `merge-join`, `split-aggregate`, `shell-command`.

## 0.1.17

- **Editor: the node panel stays centered no matter how far you've scrolled the canvas.** The
  floating node panel was positioned `absolute` inside the scrollable canvas, so it anchored to the
  canvas's un-scrolled origin — pan or scroll over to a node on the right or bottom, open it, and the
  panel drifted off-screen (showing only a sliver, or nothing at all). It now uses `position: fixed`,
  anchoring to the viewport, so it opens dead-center every time. Covered by
  `e2e/browser/modal-position.spec.ts` (wide chain → scroll to the far corner → open the last node →
  assert the panel is centered and fully on-screen).

## 0.1.16

- **Editor: delete a connection straight from the canvas.** Every data-flow wire now floats two
  buttons at its midpoint — **+** (insert a node, as before) and **×** (delete the connection;
  hover turns it red). Deleting a wire used to be impossible: it goes through `/api/connect`, and
  if removing it left a downstream prompt's `{{ $node["x"] }}` reference no longer upstream,
  `editFlow` treated that as a newly-introduced error and refused to write the whole flow — the
  wire simply wouldn't delete. Edge-delete now carries `force` (like node-delete): the removal
  lands, any step left with a dead reference comes back as a warning and is flagged red (⚠) on the
  canvas to fix, while *adding* a wire stays strict (cycles / bad wiring still rejected). Covered by
  `e2e/browser/delete-edge.spec.ts`, `delete-edge-fanin.spec.ts`, and `delete-edge-fanout.spec.ts`.
- **Editor: edit the default profile's command from the toolbar pill.** The `● claude -p · real`
  pill in the top bar was a fixed label; click it to edit the default profile's launch command
  (e.g. `claude -p --model claude-sonnet-4-6`) — the local CLI each `ai` step shells out to. Prompts
  always arrive on stdin, so the pill only holds the launch command. New `/api/set-profile`
  (comment-preserving; an empty command is rejected). Covered by `e2e/browser/profile-field.spec.ts`.

## 0.1.15

- **Editor: canvas interaction v2 — marquee select, Space-to-pan, click-selects / double-click-edits.**
  Reworks the canvas gestures toward the Figma/n8n model so a big graph is easy to select and
  navigate (supersedes the 0.1.14 drag-to-pan + Shift+click model):
  - **Drag the empty canvas = rubber-band marquee select** — every node the box touches joins the
    selection; **Shift+drag** adds to it; a plain press clears it. Multi-select is now grab-a-box,
    not one Shift+click at a time.
  - **Pan moved off plain-drag: hold Space then drag to pan** (cursor grab/grabbing); mouse/trackpad
    scroll still pans natively. Space is ignored while a field is focused, so it still types in the
    prompt editor.
  - **A single click selects a node** (ring, no panel); a **double click opens the editor**.

  Covered by `e2e/browser/canvas-interactions.spec.ts` (marquee + Space-pan + single/double-click).

- **New `examples/generate-json.yaml` — a copy-paste recipe for producing a JSON file.** input →
  three fields → an `ai` step with `schema` assembles them into a validated JSON object → a `write`
  node lands it as `out/result.json`. Shows the reliable way to emit JSON: let `schema` parse and
  validate the object instead of hand-building a `{ }` string (which breaks on quotes/newlines).
  How-to in `docs/scenario/creation/create-write.md` (產生 JSON 檔); covered by
  `e2e/browser/generate-json.spec.ts`.

## 0.1.14

- **Editor: pan, multi-select move, and collapsible output — three canvas-readability wins so a
  big graph stays usable.**
  - **Drag the empty canvas to pan** the view (cursor grab/grabbing). Drags on nodes (move) and
    on ports (connect) are untouched.
  - **Shift+click nodes to build a selection group** (accent ring, no panel opens); dragging any
    member moves the whole group by the same delta and saves once via `/api/layout`. A plain
    click drops the group and opens the panel.
  - **A finished node's output is hidden by default** so a tall result no longer buries its
    neighbours. The ×N items badge doubles as a show/hide toggle (▸/▾ when there's no count) —
    click to reveal, click again to hide.

  Covered by `e2e/browser/canvas-interactions.spec.ts`.

## 0.1.13

- **Editor: run buttons renamed to match n8n — "Execute step" / "Force execute".** The node
  panel's `▷ Run to here` / `↻ re-run` (and the `▷` / `↻` icons on each canvas card) are now
  **▷ Execute step** / **↻ Force execute**, with tooltips that spell out the cache behavior:
  Execute step runs the node plus the upstream it needs and reuses cache (only what changed
  runs — n8n's partial execution); Force execute ignores cache and really calls the model.
  Wording only — the partial-execution behavior is unchanged.

## 0.1.12

- **Timeout is now yours to set — a long `ai` step no longer dies at a hardcoded limit.** An `ai`
  step writing a whole article used to be killed at a fixed ceiling (120s on the CLI, 300s in the
  editor — and the two disagreed). Now any `ai`/`cmd` step takes an optional `timeout:` (seconds)
  in the YAML, and a flow can set a `defaults: { timeout: N }` that every step falls back to.
  Resolution, most specific wins: a node's own `timeout` → the flow default → a built-in **300s**,
  identical on the CLI and in the editor. Set `timeout: 1200` on the article step and it runs to
  the end. In the editor a node's timeout hides behind a **◷ clock** in its INPUT header (bare when
  unset, `◷ 1200s` when set, click to edit), and the flow-wide default is the **◷ Timeout** clock
  in the top bar. Covered by `e2e/browser/timeout-field.spec.ts` plus engine tests in
  `dag.test.ts` (parse/validate) and `run.test.ts` (per-node caps, flow default, precedence).

## 0.1.11

- **Editor: delete a node even when a downstream step still points at it.** Deleting
  a node that another step's `from:` still referenced used to be rejected outright
  (`another step still depends on this — rewire it first`) — the panel stayed, the
  node stayed, and it looked like the delete did nothing. Now the delete always
  lands: any downstream step left with a dangling reference is flagged red on the
  canvas (`⚠ from: "X" does not exist`) and named in a canvas message, so the
  breakage is loud and you can rewire it. Edits that would corrupt the YAML are
  still rejected (壞不落地 still holds for corruption). The deleted node's reference
  is left in place on purpose — so the broken step shows an error to fix, rather
  than silently dropping the wiring. Covered by `e2e/browser/delete-node.spec.ts`
  (single dependent) and `e2e/browser/delete-fanout.spec.ts` (a fan-out middle node
  whose two downstream leaves both turn red). New `examples/fan-out.yaml` to try it.

## 0.1.10

- **Editor: reference wires — see which upstreams are data, which are just looked up.**
  Every connection on the canvas used to look the same warm line, so a real `$json`
  data input and a `{{ $('id') }}` value lookup were impossible to tell apart. Now the
  canvas draws two kinds: **data-flow wires** (warm, solid — the `$json` main input)
  and **reference wires** (cool, dashed — a `$('id')` / `$node["id"]` value lookup). A
  **引用線 / reference wires** toggle in the zoom toolbar hides the reference wires when
  you want a cleaner view. Covered by `e2e/browser/reference-wires.spec.ts`.
- **You can now reference a value from any step back, not just a direct `from:`.** A
  prompt's `{{ $('id') }}` / `{{ $node["id"] }}` can reach **any ancestor** — a node
  anywhere upstream — instead of only a node wired into `from:`. So you can pull a
  value from several steps back without adding it to the data flow. (`$json` still
  binds the primary `from[0]` input; referencing a non-ancestor is still flagged.)
  Spine-aligned ancestors pair by lineage; off-spine ones fall back to best-effort.
- **Editor: clicking an "earlier output" now inserts a reference without rewiring.**
  This reverses the 0.1.7 behavior: a click on an earlier output used to append the
  node to `from:` as well. It now inserts `{{ $node["id"] }}` as a pure cross-step
  reference and leaves `from:` untouched — keeping "connected nodes" (data flow) and
  "earlier outputs" (references) distinct. Paired with the engine change above, the
  reference resolves at run time on its own.

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
