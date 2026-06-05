// Profile resolution. A profile maps a logical model name to a command line.
//
// G2 self-test: point a profile at `cat` (or `echo`) and the whole engine runs
// offline and deterministically — `cat` echoes the rendered prompt straight
// back as the node's output. No API key, no network, no real model.

import type { Flow, ProfileSpec } from "./types.js";

export function resolveProfile(flow: Flow, name: string | undefined): ProfileSpec {
  const key = name ?? "default";
  const spec = flow.profiles[key];
  if (!spec) {
    throw new Error(
      `profile "${key}" not found. Available: ${Object.keys(flow.profiles).join(", ") || "(none)"}`,
    );
  }
  return spec;
}

// Split a command template into argv. v1 splits on whitespace (no shell, no
// quoting). Good enough for `claude -p`, `codex -m gpt-5`, `cat`. A node that
// genuinely needs shell features uses a `cmd` step with an explicit marker
// (future work — noted in the design doc, not v1).
export function cmdToArgv(cmd: string): string[] {
  return cmd.trim().split(/\s+/).filter(Boolean);
}
