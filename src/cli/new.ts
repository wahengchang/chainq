// `chainq new <name> [--force]` — generate a new workflow YAML file.
//
// Unlike `chainq init` (which bootstraps a whole project — first flow + .gitignore
// + input), `new` just writes ONE more flow file into the project you're already
// in. A project holds many flows; this adds another. The template is a tiny,
// self-contained chain that opens with a `start` trigger (input node) — every new
// chain begins at an explicit start point, even an empty one.

import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const NEW_FLOW_TEMPLATE = `# A new chain workflow. Edit the prompts, then:
#   chainq run THIS_FILE                  # every ai step calls the model (needs: claude login)
profiles:
  default: { cmd: 'claude -p' }

steps:
  # The start point (trigger). Every chain begins here. Define input fields under
  # params (like CLI --input); each becomes {{ $json.name }} downstream. A run can
  # override the default. Leave params empty to just kick off the chain.
  start:
    type: input
    params:
      topic: { type: string, default: 'chains' }

  draft:
    type: ai
    from: start
    prompt: 'Write one sentence about {{ $json.topic }}.'

  refine:
    type: ai
    from: draft
    prompt: 'Make it punchier: {{ $json }}'
`;

export function runNew(args: string[]): number {
  const force = args.includes("--force");
  const nameArg = args.find((a) => !a.startsWith("--"));
  if (!nameArg) {
    console.error("usage: chainq new <name> [--force]");
    return 2;
  }

  const file = /\.ya?ml$/.test(nameArg) ? nameArg : `${nameArg}.yaml`;
  const path = resolve(file);
  if (existsSync(path) && !force) {
    console.error(`refusing to overwrite ${path} — pass --force to replace it`);
    return 1;
  }

  writeFileSync(path, NEW_FLOW_TEMPLATE);
  console.error(`created ${path}`);
  console.error(`\nnext:`);
  console.error(`  chainq run ${file}                   # first: claude login`);
  console.error(`  chainq ui ${file}                    # edit it visually`);
  return 0;
}
