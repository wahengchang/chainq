import { describe, it, expect } from "vitest";
import { extractJson, schemaErrors } from "./schema.js";

describe("extractJson — pull JSON out of a chatty model answer", () => {
  it("parses clean JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips ``` fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("slices the object out of surrounding prose", () => {
    expect(extractJson('Sure! Here you go: {"a":1,"b":"x"} — hope that helps')).toEqual({ a: 1, b: "x" });
  });
  it("handles arrays", () => {
    expect(extractJson("prefix [1,2,3] suffix")).toEqual([1, 2, 3]);
  });
  it("throws when there is no JSON", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("schemaErrors — minimal field→type validation", () => {
  it("passes a matching object (extra fields allowed)", () => {
    expect(schemaErrors({ text: "hi", n: 3, extra: true }, { text: "string", n: "number" })).toEqual([]);
  });
  it("flags a missing field", () => {
    expect(schemaErrors({ n: 3 }, { text: "string", n: "number" })).toEqual(['missing field "text"']);
  });
  it("flags a wrong type", () => {
    const e = schemaErrors({ text: 42 }, { text: "string" });
    expect(e).toHaveLength(1);
    expect(e[0]).toContain('field "text" should be string, got number');
  });
  it("rejects a non-object top level", () => {
    expect(schemaErrors([1, 2], { text: "string" })[0]).toContain("expected a JSON object");
  });
  it("checks array / object containers", () => {
    expect(schemaErrors({ items: [1], meta: {} }, { items: "array", meta: "object" })).toEqual([]);
    expect(schemaErrors({ items: "x" }, { items: "array" })[0]).toContain("should be array");
  });
  it("rejects NaN/Infinity for number", () => {
    expect(schemaErrors({ n: Infinity }, { n: "number" })[0]).toContain("should be number");
  });
});
