# Changelog

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
