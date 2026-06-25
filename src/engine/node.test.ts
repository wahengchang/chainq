import { describe, it, expect } from "vitest";
import { isValidNodeId, nodeIdError, nodeStarter } from "./node.js";
import type { NodeType } from "./types.js";

describe("isValidNodeId — id is also a filename / selector / cache key", () => {
  it("accepts identifier-shaped ids", () => {
    for (const id of ["foo", "_bar", "a1", "my-node", "summarize", "node1"]) {
      expect(isValidNodeId(id)).toBe(true);
    }
  });

  it("rejects ids that would break a filename, selector, or YAML key", () => {
    for (const id of ["", "a b", "a/b", "../x", "a.b", "a,b", "a:b", "a[0]", "1abc", "a\nb", '"x"']) {
      expect(isValidNodeId(id)).toBe(false);
    }
  });

  it("rejects an over-long id", () => {
    expect(isValidNodeId("a".repeat(65))).toBe(false);
    expect(isValidNodeId("a".repeat(64))).toBe(true);
  });

  it("nodeIdError explains the rejection (and returns null when valid)", () => {
    expect(nodeIdError("ok_id")).toBeNull();
    expect(nodeIdError("")).toMatch(/empty/);
    expect(nodeIdError("a/b")).toMatch(/illegal/);
    expect(nodeIdError("a".repeat(99))).toMatch(/too long/);
  });
});

describe("nodeStarter — minimal legal fields per type (single source)", () => {
  it("gives each type its required scalar field", () => {
    expect(nodeStarter("ai")).toEqual({ type: "ai", prompt: "new step" });
    expect(nodeStarter("cmd")).toEqual({ type: "cmd", run: "echo hello" });
    expect(nodeStarter("assemble")).toEqual({ type: "assemble", prompt: "{{ $json }}" });
    expect(nodeStarter("input")).toEqual({ type: "input", params: {} });
    expect(nodeStarter("write")).toEqual({ type: "write", path: "out/{{date}}.md", mode: "overwrite" });
  });

  it("covers every NodeType (no missing case)", () => {
    const all: NodeType[] = ["ai", "cmd", "assemble", "input", "write"];
    for (const t of all) expect(nodeStarter(t).type).toBe(t);
  });
});
