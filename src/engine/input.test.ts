// Unit tests for the shared runtime-input coercion used by BOTH the CLI
// (`--input`) and the web server (the input-node form). One code path → the two
// surfaces can't drift.

import { describe, it, expect } from "vitest";
import { parseVal, coerceParam, coerceInput, validateRunInput, staticParamErrors } from "./input.js";
import type { Flow } from "./types.js";

const flow: Flow = {
  profiles: {},
  steps: {
    seed: { id: "seed", type: "input", params: { topic: {}, count: {} } },
  },
};

// typed + required contract (increment 2)
const typedFlow: Flow = {
  profiles: {},
  steps: {
    seed: {
      id: "seed",
      type: "input",
      params: {
        name: { type: "string", required: true },
        count: { type: "number", default: 1 },
        flag: { type: "boolean" },
      },
    },
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

describe("typed coercion (declared ParamSpec.type bypasses parseVal)", () => {
  it("coerceParam honors the declared type", () => {
    expect(coerceParam("42", { type: "string" })).toBe("42"); // stays a string, not 42
    expect(coerceParam("5", { type: "number" })).toBe(5);
    expect(coerceParam("true", { type: "boolean" })).toBe(true);
    expect(coerceParam(false, { type: "boolean" })).toBe(false);
    // no declared type → lenient parseVal
    expect(coerceParam("42")).toBe(42);
  });

  it("coerceInput coerces each value by its declared type", () => {
    expect(coerceInput(typedFlow, [{ name: "42", count: "7", flag: "true" }])).toEqual([
      { name: "42", count: 7, flag: true },
    ]);
  });
});

describe("validateRunInput (runtime required / type — same gate for CLI + web)", () => {
  it("errors when a required param is missing and has no default", () => {
    const errs = validateRunInput(typedFlow, undefined);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain('input "name"');
    expect(errs[0]!.message).toContain("required");
  });

  it("passes when the required param is supplied", () => {
    expect(validateRunInput(typedFlow, [{ name: "ada" }])).toEqual([]);
  });

  it("errors on a declared-type mismatch", () => {
    const errs = validateRunInput(typedFlow, [{ name: "ada", count: "not-a-number" }]);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain('input "count"');
    expect(errs[0]!.message).toContain("number");
  });

  it("required + default never errors (default satisfies it)", () => {
    const f: Flow = {
      profiles: {},
      steps: { seed: { id: "seed", type: "input", params: { x: { required: true, default: "d" } } } },
    };
    expect(validateRunInput(f, undefined)).toEqual([]);
  });
});

describe("staticParamErrors (contract: legal type + default matches type)", () => {
  it("flags an illegal type literal", () => {
    const e = staticParamErrors("seed", "x", { type: "datetime" as never });
    expect(e).toHaveLength(1);
    expect(e[0]!.message).toContain("not one of string | number | boolean");
  });

  it("flags a default that doesn't match the declared type", () => {
    const e = staticParamErrors("seed", "n", { type: "number", default: "oops" });
    expect(e).toHaveLength(1);
    expect(e[0]!.message).toContain("not a number");
  });

  it("passes a legal contract", () => {
    expect(staticParamErrors("seed", "n", { type: "number", default: 3 })).toEqual([]);
    expect(staticParamErrors("seed", "s", { type: "string" })).toEqual([]);
    expect(staticParamErrors("seed", "p", {})).toEqual([]); // plain default-only param
  });
});
