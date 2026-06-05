// Flow builders for scenarios. There is no fake/offline model — every ai node
// calls the real local model (`claude -p`). Scenarios that actually RUN ai nodes
// gate on `haveClaude` (see harness/cli.ts) and skip when claude isn't on PATH.
//
// Two kinds of mock here:
//   • static, fixed-shape flows → e2eMock/*.yaml, read via mock() (shared with the
//     browser suite, single source of truth).
//   • parameterized flows (edit a prompt, swap `from` order, vary an expression) →
//     the builder functions below, since they must generate different YAML per call.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MOCK_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "e2eMock");

/** Read a shared static mock flow from e2eMock/<name>.yaml (CLI + browser share it). */
export function mock(name: string): string {
  return readFileSync(join(MOCK_DIR, `${name}.yaml`), "utf8");
}

const PROFILE = `profiles:\n  default: { cmd: 'claude -p' }\n`;

/** a → b → c, all ai. `pa` edits the root, `pc` the leaf. */
export function linear(pa = "a", pc = "c"): string {
  return `${PROFILE}steps:
  a: { type: ai, prompt: '${pa}' }
  b: { type: ai, from: a, prompt: '{{ $json }}' }
  c: { type: ai, from: b, prompt: '${pc}' }
`;
}

/** Two roots A, B feeding M; `order` is the from list, e.g. "[A, B]". */
export function multiInput(order: string): string {
  return `${PROFILE}steps:
  A: { type: ai, prompt: 'AAA' }
  B: { type: ai, prompt: 'BBB' }
  M: { type: ai, from: ${order}, prompt: '{{ $json }}' }
`;
}

/**
 * Two roots A ('AAA'), B ('BBB') → M, where M's prompt IS the given expression.
 * Used to assert the reference syntaxes resolve in a real CLI run:
 *   {{ $json }} → AAA (primary = first in `from`)
 *   {{ $node["B"] }} / {{ $('B') }} → BBB (named upstream + n8n alias)
 */
export function multiInputExpr(expr: string): string {
  // Block scalar (|-) holds the expression literally, so both " and ' survive
  // (a single-quoted scalar can't carry the ' in $('B')).
  return `${PROFILE}steps:
  A: { type: ai, prompt: 'AAA' }
  B: { type: ai, prompt: 'BBB' }
  M:
    type: ai
    from: [A, B]
    prompt: |-
      ${expr}
`;
}

// broken / unwired-ref / cmd-inputs are now STATIC mocks in e2eMock/ — read via mock().
