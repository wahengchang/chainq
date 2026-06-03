# E2E framework

End-to-end tests that drive the **real** `chain` CLI as a subprocess against real
flow files in throwaway temp projects. No mocks, no internal imports — everything
runs the way a user would, fully offline via the `cat` fake model.

```bash
npm run e2e          # CLI E2E (vitest) — drives the real chain binary, asserts
npm run e2e:demo     # non-headless terminal — watch the real chain runs, in color
npm run e2e:ui       # BROWSER E2E (Playwright, headed) — Chromium opens the
                     #   visualizer and clicks through every step; you watch it
npm run e2e:ui:headless   # same, no visible window (CI)
npm test             # unit tests only (src/), kept separate
```

Three layers: **unit** (`src/`, pure functions), **CLI E2E** (`e2e/scenarios`, spawns
the real binary), **browser E2E** (`e2e/ui`, Playwright drives Chromium over the
`e2e-viz.html` visualizer — which itself replays the real engine).

`e2e:demo` (`e2e/demo.ts`) walks the same flows but streams the CLI's real colored
output to your terminal (`✓ ran` / `⊘ cached` / `✗ failed`, the `plan:` preflight),
so you can *see* it work instead of just reading pass/fail.

## Layout

```
e2e/
├── harness/
│   ├── cli.ts        spawn the CLI (absolute tsx binary), strip ANSI → { out, code }
│   ├── status.ts     parse ✓/⊘/✗/– prefixes → { nodeId: status }
│   └── project.ts    Project: temp dir + .chain() / .run() / .write() / .exists()
├── fixtures/
│   └── flows.ts      flow builders: linear() · cmdInputs() · multiInput() · broken()
└── scenarios/
    ├── init.e2e.ts       scaffold · refuse-clobber · --force
    ├── cache.e2e.ts      cached-on-rerun · edit-downstream · edit-upstream
    ├── iterate.e2e.ts    pin → scratch · from-order reorder
    └── validate.e2e.ts   dangling-from rejected · cmd cwd + caching
```

## Add a scenario

```ts
import { describe, it, expect } from "vitest";
import { newProject } from "../harness/project.js";
import { linear } from "../fixtures/flows.js";

describe("my-feature", () => {
  it("does the thing", () => {
    const p = newProject().write("flow.yaml", linear());
    const { status } = p.run(["run", "flow.yaml"]);
    expect(status).toMatchObject({ a: "ran" });
  });
});
```

Put new flow shapes in `fixtures/flows.ts`, new helpers in `harness/`. A scenario
file must end in `.e2e.ts` to be picked up by `vitest.e2e.config.ts`.
