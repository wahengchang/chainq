// Non-headless E2E demo: walks the same scenarios the framework asserts, but
// STREAMS the real (colored) CLI output to your terminal so you can watch the
// chain run — scaffold, cache hits, edits, pin, fail.
//
//   npm run e2e:demo

import { newProject, type Project } from "./harness/project.js";
import { linear, broken } from "./fixtures/flows.js";

const head = (s: string) => console.log(`\n\x1b[1;36m━━ ${s} ━━\x1b[0m`);
const run = (p: Project, ...args: string[]): void => {
  console.log(`\x1b[2m$ chain ${args.join(" ")}\x1b[0m`);
  p.show(...args);
};

head("init — scaffold a brand-new project, then run it (real model)");
const p1 = newProject();
run(p1, "init");
run(p1, "run", "flow.yaml");

head("cache — cold run (everything ✓ ran)");
const p2 = newProject().write("flow.yaml", linear());
run(p2, "run", "flow.yaml");

head("cache — warm run (everything ⊘ cached, zero model calls)");
run(p2, "run", "flow.yaml");

head("cache — edit the leaf prompt → only it re-runs");
p2.write("flow.yaml", linear("a", "c-edited"));
run(p2, "run", "flow.yaml");

head("iterate — pin an upstream sample, trial-run into scratch");
const p3 = newProject().write("flow.yaml", linear());
run(p3, "run", "flow.yaml");
p3.write("sample.txt", "PINNED SAMPLE");
run(p3, "run", "flow.yaml", "--pin", "b=sample.txt");

head("validate — a broken flow is rejected before anything runs");
const p4 = newProject().write("flow.yaml", broken());
run(p4, "validate", "flow.yaml");

console.log(`\n\x1b[32m✓ demo complete\x1b[0m`);
