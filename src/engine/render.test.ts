import { describe, it, expect } from "vitest";
import { renderPrompt } from "./render.js";

const json = (obj: unknown) => JSON.stringify(obj);

describe("renderPrompt — path selectors (items model)", () => {
  const up = json({
    title: "AI breakthrough",
    items: [{ text: "one" }, { text: "two" }, { text: "three" }],
    tags: ["a", "b"],
  });
  const trend = json({ score: 42 });
  // one item per upstream (the 1-in-1-out base case); item.json is the raw text
  const inputs = { primary: "up", index: 0, items: { up: [{ json: up }], trend: [{ json: trend }] } };

  it("{{ $json }} returns the whole current item verbatim", () => {
    expect(renderPrompt("X {{ $json }}", inputs)).toBe(`X ${up}`);
  });

  it("{{ $json.title }} picks a field", () => {
    expect(renderPrompt("{{ $json.title }}", inputs)).toBe("AI breakthrough");
  });

  it("{{ $json.items[2].text }} does nested + array index", () => {
    expect(renderPrompt("{{ $json.items[2].text }}", inputs)).toBe("three");
  });

  it("{{ $json.items[-1].text }} indexes from the end", () => {
    expect(renderPrompt("{{ $json.items[-1].text }}", inputs)).toBe("three");
  });

  it("{{ $json.items[*].text }} plucks a column → JSON array", () => {
    expect(renderPrompt("{{ $json.items[*].text }}", inputs)).toBe(json(["one", "two", "three"]));
  });

  it("{{ $json.tags }} stringifies a non-string value", () => {
    expect(renderPrompt("{{ $json.tags }}", inputs)).toBe(json(["a", "b"]));
  });

  it("{{ $node[\"trend\"].score }} reads a named upstream's paired item", () => {
    expect(renderPrompt('{{ $node["trend"].score }}', inputs)).toBe("42");
  });

  it("{{ $('trend') }} is an n8n-style alias for $node[\"trend\"]", () => {
    expect(renderPrompt("{{ $('trend') }}", inputs)).toBe(trend);
    expect(renderPrompt('{{ $("trend").score }}', inputs)).toBe("42"); // double quotes too
  });

  // --- items-model additions (T2) ---

  it("root-level {{ $json[0] }} / {{ $json[*] }} select on an array item", () => {
    const arr = { primary: "a", index: 0, items: { a: [{ json: '["x","y","z"]' }] } };
    expect(renderPrompt("{{ $json[0] }}", arr)).toBe("x");
    expect(renderPrompt("{{ $json[*] }}", arr)).toBe(json(["x", "y", "z"]));
  });

  it("{{ $('id').all() }} returns ALL of an upstream's items as a JSON array", () => {
    const multi = { primary: "x", index: 0, items: { x: [{ json: "a" }, { json: "b" }, { json: "c" }] } };
    expect(renderPrompt("{{ $('x').all() }}", multi)).toBe(json(["a", "b", "c"]));
  });

  it("{{ $('id') }} / {{ $('id').item }} return the item PAIRED to the current index", () => {
    const multi = { primary: "x", index: 1, items: { x: [{ json: "a" }, { json: "b" }, { json: "c" }] } };
    expect(renderPrompt("{{ $('x') }}", multi)).toBe("b"); // index 1
    expect(renderPrompt("{{ $('x').item }}", multi)).toBe("b");
  });

  it("{{ $('id').item }} follows the current item's pairedItem, not the loop index", () => {
    // `split` fanned seed[0] → two items (both pairedItem 0) then seed[1] → one (pairedItem 1).
    // Rendering the 2nd split item (loop index 1) must pair back to seed[0] = X, not seed[1].
    const inputs = {
      primary: "split",
      index: 1,
      pairedIndex: 0, // ← split[1].pairedItem
      items: {
        split: [
          { json: "1", pairedItem: 0 },
          { json: "2", pairedItem: 0 },
          { json: "3", pairedItem: 1 },
        ],
        seed: [{ json: json({ tag: "X" }) }, { json: json({ tag: "Y" }) }],
      },
    };
    expect(renderPrompt("{{ $('seed').item.tag }}", inputs)).toBe("X"); // not "Y"
    expect(renderPrompt("{{ $json }}", inputs)).toBe("2"); // primary still by loop index
  });

  it("a self-reference {{ $('primary') }} stays the current item even with a pairedIndex", () => {
    const inputs = {
      primary: "x",
      index: 1,
      pairedIndex: 0,
      items: { x: [{ json: "a", pairedItem: 0 }, { json: "b", pairedItem: 0 }] },
    };
    expect(renderPrompt("{{ $('x') }}", inputs)).toBe("b"); // loop index 1, not pairedIndex 0
  });

  it("leaves an unresolvable expression verbatim (visible, not blanked)", () => {
    expect(renderPrompt("{{ $json.nope.deep }}", inputs)).toBe("{{ $json.nope.deep }}");
    expect(renderPrompt("{{ $json }}", { items: {} })).toBe("{{ $json }}"); // no primary
  });
});
