// `chain new <name> [--force]` — generate a new workflow YAML file.
//
// Unlike `chain init` (which bootstraps a whole project — first flow + .gitignore
// + input), `new` just writes ONE more flow file into the project you're already
// in. A project holds many flows; this adds another. The template is a tiny,
// self-contained 2-node chain.

import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const NEW_FLOW_TEMPLATE = `# A new chain workflow. Edit the prompts, then:
#   chain run THIS_FILE                  # every ai step calls the model (needs: claude login)
profiles:
  default: { cmd: 'claude -p' }

steps:
  draft:
    type: ai
    prompt: 'Write one sentence about chains.'

  refine:
    type: ai
    from: draft
    prompt: 'Make it punchier: {{ $json }}'
`;

export function runNew(args: string[]): number {
  const force = args.includes("--force");
  const nameArg = args.find((a) => !a.startsWith("--"));
  if (!nameArg) {
    console.error("usage: chain new <name> [--force]");
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
  console.error(`  chain run ${file}                   # first: claude login`);
  console.error(`  chain ui ${file}                    # edit it visually`);
  return 0;
}
