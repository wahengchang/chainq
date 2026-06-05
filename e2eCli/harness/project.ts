// A throwaway chain project in a temp dir — the core abstraction every scenario
// uses. Reads like English:
//
//   const p = newProject().write("flow.yaml", linear());
//   p.chain("run", "flow.yaml");                       // first run
//   expect(p.run(["run", "flow.yaml"]).status).toMatchObject({ a: "cached" });

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCli, showCli, type CliResult } from "./cli.js";
import { parseStatuses, type Status } from "./status.js";

export class Project {
  constructor(readonly dir: string) {}

  /** Run the chain CLI in this project's dir. */
  chain(...args: string[]): CliResult {
    return runCli(this.dir, args);
  }

  /** Run the CLI and also return the parsed per-node status map. */
  run(args: string[]): { result: CliResult; status: Record<string, Status> } {
    const result = this.chain(...args);
    return { result, status: parseStatuses(result.out) };
  }

  /** Write a file into the project (chainable). */
  write(rel: string, content: string): this {
    writeFileSync(join(this.dir, rel), content);
    return this;
  }

  exists(rel: string): boolean {
    return existsSync(join(this.dir, rel));
  }

  /** Read a file from the project (e.g. a node's persisted output). */
  read(rel: string): string {
    return readFileSync(join(this.dir, rel), "utf8");
  }

  /** Run the CLI streaming its real colored output to the terminal (demo mode). */
  show(...args: string[]): number {
    return showCli(this.dir, args);
  }
}

export function newProject(): Project {
  return new Project(mkdtempSync(join(tmpdir(), "chain-e2e-")));
}
