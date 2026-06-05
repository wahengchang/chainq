import { describe, it, expect } from "vitest";
import { ancestorsOf, parseFlow, topoOrder, wouldCycle } from "./dag.js";

const YAML = `
profiles:
  default: { cmd: 'cat' }
steps:
  fetch:     { type: cmd, run: 'cat in.txt', inputs: ['in.txt'] }
  summarize: { type: ai, from: fetch, prompt: 'sum {{ $json }}' }
  tweets:    { type: ai, from: summarize, prompt: 'tw' }
  report:    { type: ai, from: summarize, prompt: 'rep' }
`;

describe("parseFlow", () => {
  it("parses profiles and steps and stamps node ids", () => {
    const flow = parseFlow(YAML);
    expect(Object.keys(flow.profiles)).toEqual(["default"]);
    expect(flow.steps.summarize!.id).toBe("summarize");
    expect(flow.steps.fetch!.inputs).toEqual(["in.txt"]);
  });

  it("rejects an unknown node type", () => {
    expect(() => parseFlow(`steps:\n  x: { type: bogus }`)).toThrow(/invalid type/);
  });
});

describe("topoOrder", () => {
  it("orders dependencies before dependents", () => {
    const order = topoOrder(parseFlow(YAML));
    expect(order.indexOf("fetch")).toBeLessThan(order.indexOf("summarize"));
    expect(order.indexOf("summarize")).toBeLessThan(order.indexOf("tweets"));
    expect(order.indexOf("summarize")).toBeLessThan(order.indexOf("report"));
  });

  it("throws on a cycle", () => {
    const cyclic = `steps:\n  a: { type: assemble, from: b }\n  b: { type: assemble, from: a }`;
    expect(() => topoOrder(parseFlow(cyclic))).toThrow(/cycle/);
  });
});

describe("wouldCycle / ancestorsOf", () => {
  it("detects that connecting tweets -> fetch would cycle", () => {
    const flow = parseFlow(YAML);
    // fetch is an ancestor of tweets, so tweets -> fetch closes a loop
    expect(wouldCycle(flow, "fetch", "tweets")).toBe(true);
    expect(wouldCycle(flow, "tweets", "fetch")).toBe(false);
  });

  it("ancestorsOf returns the full upstream cone", () => {
    expect(ancestorsOf(parseFlow(YAML), "tweets")).toEqual(new Set(["summarize", "fetch"]));
  });
});
