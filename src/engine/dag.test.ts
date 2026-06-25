import { describe, it, expect } from "vitest";
import { ancestorsOf, parseFlow, topoOrder, wouldCycle } from "./dag.js";
import { validate } from "./validate.js";

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

  it("parses an unknown node type leniently, and validate flags it", () => {
    // An unknown type (a typo, or a removed splitOut/aggregate/merge) parses
    // through so the editor can still open the flow and paint an error node;
    // validate() is what reports it (the CLI prints it, nothing runs).
    const flow = parseFlow(`steps:\n  x: { type: bogus }`);
    expect(flow.steps.x!.type).toBe("bogus");
    const errs = validate(flow);
    expect(errs.some((e) => e.node === "x" && /unknown node type "bogus"/.test(e.message))).toBe(true);
  });

  it("parses a node `timeout` and a flow `defaults.timeout` (seconds)", () => {
    const flow = parseFlow(
      [
        "profiles:",
        "  default: { cmd: 'cat' }",
        "defaults:",
        "  timeout: 600",
        "steps:",
        "  a: { type: ai, prompt: 'x', timeout: 1200 }",
        "",
      ].join("\n"),
    );
    expect(flow.defaults?.timeout).toBe(600);
    expect(flow.steps.a!.timeout).toBe(1200);
  });

  it("leaves timeout undefined when not set", () => {
    const flow = parseFlow(`steps:\n  a: { type: ai, prompt: 'x' }`);
    expect(flow.steps.a!.timeout).toBeUndefined();
    expect(flow.defaults).toBeUndefined();
  });

  it("tolerates a bare/null timeout key (how the editor clears it via setIn)", () => {
    const flow = parseFlow(`steps:\n  a: { type: ai, prompt: 'x', timeout: null }`);
    expect(flow.steps.a!.timeout).toBeUndefined();
  });

  it("rejects a non-positive or non-number timeout (node and flow default)", () => {
    expect(() => parseFlow(`steps:\n  a: { type: ai, prompt: 'x', timeout: 0 }`)).toThrow(
      /positive number of seconds/,
    );
    expect(() => parseFlow(`steps:\n  a: { type: ai, prompt: 'x', timeout: -5 }`)).toThrow(
      /positive number/,
    );
    expect(() => parseFlow(`steps:\n  a: { type: ai, prompt: 'x', timeout: soon }`)).toThrow(
      /positive number/,
    );
    expect(() =>
      parseFlow(`defaults:\n  timeout: 0\nsteps:\n  a: { type: ai, prompt: 'x' }`),
    ).toThrow(/flow defaults timeout/);
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
