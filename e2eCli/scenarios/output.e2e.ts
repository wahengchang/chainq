// `run` output streams: the chain RESULT goes to stdout, progress to stderr, so
// `chainq run flow.yaml | jq` pipes only the result. -q/--quiet hides progress
// (keeps the result), -s/--silent hides everything. Uses cmd `echo` leaves so no
// real model (claude login) is needed — deterministic, runnable in CI.

import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";

const ONE = `steps:
  a: { type: cmd, run: "echo hello-from-a", mode: once }
`;

const TWO = `steps:
  a: { type: cmd, run: "echo aaa", mode: once }
  b: { type: cmd, run: "echo bbb", mode: once }
`;

describe("run output streams", () => {
  it("default: result on stdout, progress on stderr (pipe stays clean)", () => {
    const r = newProject().write("flow.yaml", ONE).chain("run", "flow.yaml");
    expect(r.code).toBe(0);
    // RESULT → stdout
    expect(r.stdout).toMatch(/hello-from-a/);
    // PROGRESS → stderr, and it must NOT leak into stdout (else `| jq` breaks)
    expect(r.stderr).toMatch(/✓ a/);
    expect(r.stderr).toMatch(/plan:/);
    expect(r.stdout).not.toMatch(/✓ a/);
    expect(r.stdout).not.toMatch(/plan:/);
  });

  it("-q/--quiet: result on stdout, no progress anywhere", () => {
    const r = newProject().write("flow.yaml", ONE).chain("run", "flow.yaml", "-q");
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/hello-from-a/);
    expect(r.stderr).not.toMatch(/✓ a/);
    expect(r.stderr).not.toMatch(/plan:/);
    expect(r.stderr).not.toMatch(/flow:/);
  });

  it("-s/--silent: prints nothing at all, exit code only", () => {
    const r = newProject().write("flow.yaml", ONE).chain("run", "flow.yaml", "-s");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
    expect(r.stderr.trim()).toBe("");
  });

  it("multiple leaves: every terminal node is printed with its id header", () => {
    const r = newProject().write("flow.yaml", TWO).chain("run", "flow.yaml", "-q");
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/— a —/);
    expect(r.stdout).toMatch(/aaa/);
    expect(r.stdout).toMatch(/— b —/);
    expect(r.stdout).toMatch(/bbb/);
  });

  it("--long forms alias the short flags", () => {
    const q = newProject().write("flow.yaml", ONE).chain("run", "flow.yaml", "--quiet");
    expect(q.stderr).not.toMatch(/✓ a/);
    expect(q.stdout).toMatch(/hello-from-a/);
    const s = newProject().write("flow.yaml", ONE).chain("run", "flow.yaml", "--silent");
    expect(s.stdout.trim()).toBe("");
    expect(s.stderr.trim()).toBe("");
  });
});
