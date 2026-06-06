// `chainq init [dir] [--force]` — scaffold a new chain project.
//
// Writes a runnable starter: a flow.yaml with a `claude -p` default profile, a
// .gitignore for the .chain/ work dir, and a sample input. Refuses to clobber an
// existing flow.yaml unless --force.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const FLOW_TEMPLATE = `# A chain flow: ONE YAML file = one prompt chain.
#   chainq run flow.yaml          # every ai step calls the model (needs: claude login)
profiles:
  default: { cmd: 'claude -p' }   # your local CLI model

steps:
  load:
    type: cmd
    run: 'cat input.txt'
    inputs: ['input.txt']          # declared input → this node is cacheable

  summarize:
    type: ai
    from: load
    prompt: 'Summarize in one sentence: {{ $json }}'
`;

const GITIGNORE = `.chain/\n`;
const INPUT = `chain turns a YAML file into a re-runnable prompt chain.\n`;

export function runInit(args: string[]): number {
  const force = args.includes("--force");
  const dirArg = args.find((a) => !a.startsWith("--"));
  const dir = resolve(dirArg ?? ".");

  mkdirSync(dir, { recursive: true });
  const flowPath = join(dir, "flow.yaml");
  if (existsSync(flowPath) && !force) {
    console.error(`refusing to overwrite ${flowPath} — pass --force to replace it`);
    return 1;
  }

  writeFileSync(flowPath, FLOW_TEMPLATE);
  writeFileSync(join(dir, ".gitignore"), GITIGNORE);
  const inputPath = join(dir, "input.txt");
  if (!existsSync(inputPath) || force) writeFileSync(inputPath, INPUT);

  console.error(`created ${flowPath}`);
  console.error(`        ${join(dir, ".gitignore")}`);
  console.error(`        ${inputPath}`);
  console.error(`\nnext:`);
  console.error(`  chainq run flow.yaml                  # first: claude login`);
  return 0;
}
