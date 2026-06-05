# Handoff — chain editor (items-model UI)

Last verified on `main` @ commit with: **typecheck clean · 80 unit · 3 browser e2e green**.

## TL;DR
Backend for the editor's items-model + structural editing is **done and tested**.
Four visible editor features shipped. The remaining work is **canvas UI only** —
every endpoint it needs already exists and is tested.

## Where the truth lives (3 layers — don't mix)
- **現況層 (what exists / gaps):** `draft.md` — Capability & Gap Map, keep it current.
- **決策層 (why):** `docs/design/2026-06-04-loop-and-scenarios.md` (engine) + the
  office-hours/eng-review design doc at
  `~/.gstack/projects/chain-cli/wahengchang-feat-web-create-design-*.md`
  (full plan, Implementation Tasks T0–T10, GSTACK REVIEW REPORT, codex findings).
- **未來層 (next):** the "What's next" list below.

## Run & test
```bash
npm run ui -- e2eMock/test060316.yaml   # open the editor on a flow (auto-opens browser)
npm run ui                              # no arg → create/pick screen
npm run e2e:ui:demo                     # Playwright headed+slowmo: render→add→rename (offline)
npm run e2e:ui:headed                   # the claude -p real-run proofs (needs `claude login`)
npm test                                # 80 unit
npm run e2e:ui:headless                 # 3 browser e2e
```
No build step — `tsx` runs TS directly; the server reads `app.html` on boot and
serves `src/web/ui/*.js` as native ES modules. Restart the server to see edits.

## Done & verified
- **engine:** `rewriteRefs`/`renameNode` (single-source ref regex), `isValidNodeId`,
  `nodeStarter`, `CacheStore.rename` (rename keeps the cache — id is not in the Merkle key).
- **server endpoints (all tested):** `/api/rename` · `add-node` · `connect` (JSON array,
  order = $json-first) · `items` (per-node Item[]) · `layout` (per-flow sidecar) ·
  `parse` (now returns field/mode/key/inputs). In-process per-flow async mutex serializes
  writes; `editFlow` rejects only **newly-introduced** validation errors.
- **editor UI (`src/web/ui/app.js`):** splitOut/aggregate/merge accent shapes · ×N item
  badge · `+add` type picker (→ nodeStarter) · inline rename (panel-header id → `/api/rename`,
  downstream `from` + prompt `$('id')` follow).
- **e2e net:** `e2e/browser/editor.spec.ts` drives real `chain ui` offline (no claude).
  Temp pages (`e2e-viz.html`) and the `viz` script were removed.

## What's next (backends ready — wire the canvas)
1. **drag-to-connect** gesture on the canvas → POST `/api/connect` `{from: string[]}`
   (order is semantic: `from[0]` = `$json`; give reorder/remove controls).
2. **free node drag + remember position** → GET/POST `/api/layout`
   (`.chain/layout/<flow>.json`). This means the canvas moves from flex-column
   auto-layout to absolute positioning (real change, not sidecar-only).
3. **per-item panel** → GET `/api/items?path=&node=` returns `{inputs:{id:Item[]}, output:Item[]}`.
   Show `item[0..N]` in the node panel.
4. **per-type panel editors** → splitOut/aggregate `field`, merge `mode`+`key`.
   Fix `saveNode()` in app.js: it still writes `prompt` for every non-`cmd` type.
5. **front-end cleanup** → add `// @ts-check` + JSDoc to `app.js`, split into
   canvas/panel/api modules, drop the `window` bridge (see gotcha).

## Gotchas (read before editing)
- **`app.js` window bridge:** the module exposes handler fns on `window` because
  `app.html` still uses inline `onclick=`. Converting to `addEventListener` is part of #5.
- **`editFlow` = no-new-errors**, NOT full-valid. A just-added unwired merge node is
  allowed; only edits that *introduce* breakage (dangling ref / cycle / parse fail) are
  blocked. Don't "tighten" this back to full validate — it makes the editor unusable mid-build.
- **`FlowLock` (engine) is built but unused project-wide.** Web concurrency uses the
  in-process mutex instead (two tabs = same process; FlowLock is pid-based, wrong tool).
  Cross-process (`chain run` while editing) is still unguarded — a real TODO.
- **`/api/list` is non-recursive** — lists one folder, not subfolders. Flows live in
  `examples/`, `e2eMock/`. (Make it recursive if you want a tree view.)
- **node id charset** is whitelisted (`isValidNodeId`) at add/rename only, not retroactively
  on existing flows.
