import { describe, it, expect } from "vitest";
import { renderPrompt } from "./render.js";

const json = (obj: unknown) => JSON.stringify(obj);

describe("renderPrompt — tier-1 path selectors", () => {
  const inputs = {
    primary: "up",
    outputs: {
      up: json({
        title: "AI breakthrough",
        items: [{ text: "one" }, { text: "two" }, { text: "three" }],
        tags: ["a", "b"],
      }),
      trend: json({ score: 42 }),
    },
  };

  it("{{ $json }} returns the whole output verbatim", () => {
    expect(renderPrompt("X {{ $json }}", inputs)).toBe(`X ${inputs.outputs.up}`);
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

  it("{{ $node[\"trend\"].score }} reads a named upstream", () => {
    expect(renderPrompt('{{ $node["trend"].score }}', inputs)).toBe("42");
  });

  it("leaves an unresolvable expression verbatim (visible, not blanked)", () => {
    expect(renderPrompt("{{ $json.nope.deep }}", inputs)).toBe("{{ $json.nope.deep }}");
    expect(renderPrompt("{{ $json }}", { outputs: {} })).toBe("{{ $json }}"); // no primary
  });
});
