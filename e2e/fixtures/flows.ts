// Flow builders for scenarios. All use the `cat` fake model so E2E runs offline.

const CAT = `profiles:\n  default: { cmd: 'cat' }\n`;

/** a → b → c, all ai. `pa` edits the root, `pc` the leaf. */
export function linear(pa = "a", pc = "c"): string {
  return `${CAT}steps:
  a: { type: ai, prompt: '${pa}' }
  b: { type: ai, from: a, prompt: '{{ $json }}' }
  c: { type: ai, from: b, prompt: '${pc}' }
`;
}

/** A cmd that reads a file (tests cwd + declared-input caching) → ai. */
export function cmdInputs(): string {
  return `${CAT}steps:
  load: { type: cmd, run: 'cat in.txt', inputs: ['in.txt'] }
  sum: { type: ai, from: load, prompt: '{{ $json }}' }
`;
}

/** Two roots A, B feeding M; `order` is the from list, e.g. "[A, B]". */
export function multiInput(order: string): string {
  return `${CAT}steps:
  A: { type: ai, prompt: 'AAA' }
  B: { type: ai, prompt: 'BBB' }
  M: { type: ai, from: ${order}, prompt: '{{ $json }}' }
`;
}

/** A flow with a dangling `from:` — should fail validation. */
export function broken(): string {
  return `${CAT}steps:
  a: { type: ai, from: ghost, prompt: 'x' }
`;
}
