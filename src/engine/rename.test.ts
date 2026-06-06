import { describe, it, expect } from "vitest";
import { parseDocument } from "yaml";
import { rewriteRefs } from "./render.js";
import { renameNode } from "./rename.js";
import { parseFlow } from "./dag.js";
import { validate } from "./validate.js";

describe("rewriteRefs — rename a reference inside {{ }}", () => {
  it("rewrites $('old') to $('new')", () => {
    expect(rewriteRefs("X {{ $('a') }} Y", "a", "x")).toBe("X {{ $('x') }} Y");
  });

  it("rewrites $node[\"old\"] to $node[\"new\"]", () => {
    expect(rewriteRefs(`{{ $node["a"] }}`, "a", "x")).toBe(`{{ $node["x"] }}`);
  });

  it("keeps a trailing path / .all() / .item", () => {
    expect(rewriteRefs("{{ $('a').all()[*].t }}", "a", "x")).toBe("{{ $('x').all()[*].t }}");
    expect(rewriteRefs("{{ $('a').item.title }}", "a", "x")).toBe("{{ $('x').item.title }}");
  });

  it("rewrites every occurrence", () => {
    expect(rewriteRefs("{{ $('a') }} and {{ $('a').item }}", "a", "x")).toBe(
      "{{ $('x') }} and {{ $('x').item }}",
    );
  });

  it("does NOT touch a literal $('a') outside {{ }} (★ no false rewrite)", () => {
    expect(rewriteRefs("see $('a') in prose {{ $('a') }}", "a", "x")).toBe(
      "see $('a') in prose {{ $('x') }}",
    );
  });

  it("leaves a different id untouched", () => {
    expect(rewriteRefs("{{ $('b') }}", "a", "x")).toBe("{{ $('b') }}");
  });

  it("does not match a prefix id (a vs ab)", () => {
    expect(rewriteRefs("{{ $('ab') }}", "a", "x")).toBe("{{ $('ab') }}");
  });
});

describe("renameNode — structural rename across the flow doc", () => {
  const flow = `# my flow
profiles:
  default: { cmd: claude -p }
steps:
  a:
    type: ai
    prompt: 'start'
  b:
    type: ai
    from: a            # keep me
    prompt: "{{ $('a') }} then more"
`;

  const rename = (src: string, oldId: string, newId: string): string => {
    const doc = parseDocument(src);
    renameNode(doc, oldId, newId);
    return String(doc);
  };

  it("renames the step key, downstream from:, and prompt ref together", () => {
    const out = rename(flow, "a", "intro");
    expect(out).toContain("intro:");
    expect(out).not.toMatch(/^\s*a:/m);
    expect(out).toContain("from: intro");
    expect(out).toContain("{{ $('intro') }}");
    // the result is still a valid flow
    expect(validate(parseFlow(out))).toEqual([]);
  });

  it("preserves comments and key order (保留註解)", () => {
    const out = rename(flow, "a", "intro");
    expect(out).toContain("# my flow");
    expect(out).toContain("# keep me");
    // a stays before b
    expect(out.indexOf("intro:")).toBeLessThan(out.indexOf("b:"));
  });

  it("rewrites a from: list element", () => {
    const src = `profiles:
  default: { cmd: claude -p }
steps:
  a: { type: ai, prompt: 'a' }
  b: { type: ai, prompt: 'b' }
  c:
    type: merge
    from: [a, b]
`;
    const out = rename(src, "a", "x");
    const c = parseFlow(out).steps.c;
    expect(c!.from).toEqual(["x", "b"]);
  });

  it("throws when the new id already exists", () => {
    expect(() => rename(flow, "a", "b")).toThrow(/already exists/);
  });

  it("throws when the old id is absent", () => {
    expect(() => rename(flow, "nope", "x")).toThrow(/not found/);
  });

  it("is a no-op when old === new (vs the same doc untouched)", () => {
    const untouched = String(parseDocument(flow));
    expect(rename(flow, "a", "a")).toBe(untouched);
  });
});
