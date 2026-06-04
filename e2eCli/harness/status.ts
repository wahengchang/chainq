// Parse the CLI's honest status prefixes into a { nodeId: status } map.
//   ✓ ran   ⊘ cached   ✗ failed   – skipped

export type Status = "ran" | "cached" | "failed" | "skipped";

const GLYPH: Record<string, Status> = {
  "✓": "ran",
  "⊘": "cached",
  "✗": "failed",
  "–": "skipped",
};

export function parseStatuses(out: string): Record<string, Status> {
  const map: Record<string, Status> = {};
  for (const line of out.split("\n")) {
    const m = /^([✓⊘✗–])\s+(\w+)/.exec(line.trim());
    if (m) map[m[2]!] = GLYPH[m[1]!]!;
  }
  return map;
}
