// Unit tests for the shared runtime-input coercion used by BOTH the CLI
// (`--input`) and the web server (the input-node form). One code path → the two
// surfaces can't drift.

import { describe, it, expect } from "vitest";
import { parseVal, coerceParam, coerceInput } from "./input.js";
import type { Flow } from "./types.js";

const flow: Flow = {
  profiles: {},
  steps: {
    seed: { id: "seed", type: "input", params: { topic: {}, count: {} } },
  },
};

describe("input coercion (shared by CLI --input and the web form)", () => {
  it("parseVal: JSON if it parses, else the literal string", () => {
    expect(parseVal("42")).toBe(42);
    expect(parseVal("true")).toBe(true);
    expect(parseVal('["a","b"]')).toEqual(["a", "b"]);
    expect(parseVal("hello")).toBe("hello");
    expect(parseVal("")).toBe(""); // empty string isn't valid JSON → stays a string
  });

  it("coerceParam: strings go through parseVal, non-strings pass through", () => {
    expect(coerceParam("5")).toBe(5);
    expect(coerceParam("x")).toBe("x");
    expect(coerceParam(7)).toBe(7);
    expect(coerceParam(true)).toBe(true);
  });

  it("coerceInput: coerces each value, and folds 'no real values' to undefined", () => {
    // undefined / empty / all-empty must become undefined so the run shares the
    // no-input Merkle cache key (sending [{}] would compute a different key).
    expect(coerceInput(flow, undefined)).toBeUndefined();
    expect(coerceInput(flow, [])).toBeUndefined();
    expect(coerceInput(flow, [{}])).toBeUndefined();
    // real values coerce like the CLI: "3" → number 3
    expect(coerceInput(flow, [{ topic: "hi", count: "3" }])).toEqual([{ topic: "hi", count: 3 }]);
  });
});
