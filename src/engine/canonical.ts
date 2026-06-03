// Canonical (stable) JSON serialization for cache keys.
//
// Object keys are sorted recursively so the same logical value always produces
// the same string — otherwise hashes flap across platforms / insertion order
// (flagged by the Codex outside-voice in eng review).

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}
