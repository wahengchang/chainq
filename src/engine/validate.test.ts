import { describe, it, expect } from "vitest";
import { parseFlow } from "./dag.js";
import { validate } from "./validate.js";

describe("validate (E4 pre-run static checks)", () => {
  it("passes a well-formed flow", () => {
    const flow = parseFlow(`
profiles:
  default: { cmd: 'cat' }
steps:
  a: { type: ai, prompt: 'x' }
  b: { type: ai, from: a, prompt: '{{ $json }}' }
`);
    expect(validate(flow)).toEqual([]);
  });

  it("flags a dangling from: with a did-you-mean suggestion", () => {
    const flow = parseFlow(`
profiles:
  default: { cmd: 'cat' }
steps:
  summarize: { type: ai, prompt: 'x' }
  b: { type: ai, from: summarise, prompt: 'y' }
`); // 'summarise' (British) vs 'summarize'
    const errs = validate(flow);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toMatch(/did you mean "summarize"/);
  });

  it("flags an unknown profile", () => {
    const flow = parseFlow(`
profiles:
  default: { cmd: 'cat' }
steps:
  a: { type: ai, prompt: 'x', profile: deflt }
`);
    expect(validate(flow).some((e) => /profile "deflt" not found/.test(e.message))).toBe(true);
  });

  it("flags a prompt referencing an upstream not wired in from:", () => {
    const flow = parseFlow(`
profiles:
  default: { cmd: 'cat' }
steps:
  a: { type: ai, prompt: 'x' }
  b: { type: ai, prompt: 'y' }
  m: { type: ai, from: a, prompt: '{{ $json }} {{ $node["b"] }}' }
`); // m reads b but only wired to a
    const errs = validate(flow);
    expect(errs.some((e) => e.node === "m" && /\$node\["b"\] but it is not in from/.test(e.message))).toBe(true);
  });

  it("accepts $node / $('id') / $json when all are wired in from:", () => {
    const flow = parseFlow(`
profiles:
  default: { cmd: 'cat' }
steps:
  a: { type: ai, prompt: 'x' }
  b: { type: ai, prompt: 'y' }
  m: { type: ai, from: [a, b], prompt: "{{ $json }} {{ $node[\\"b\\"] }} {{ $('a') }}" }
`);
    expect(validate(flow)).toEqual([]);
  });

  it("flags {{ $json }} on a root step with no from:", () => {
    const flow = parseFlow(`
profiles:
  default: { cmd: 'cat' }
steps:
  a: { type: ai, prompt: '{{ $json }}' }
`);
    expect(validate(flow).some((e) => e.node === "a" && /has no from/.test(e.message))).toBe(true);
  });

  it("collects ALL errors, not just the first", () => {
    const flow = parseFlow(`
profiles:
  default: { cmd: 'cat' }
steps:
  a: { type: ai, from: nope, prompt: 'x' }
  b: { type: cmd }
`);
    const errs = validate(flow);
    expect(errs.length).toBeGreaterThanOrEqual(2); // dangling from + cmd missing run
  });
});
