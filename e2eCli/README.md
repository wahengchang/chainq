# CLI E2E framework (`e2eCli/`)

End-to-end tests that drive the **real** `chain` CLI as a subprocess against real
flow files in throwaway temp projects. No mocks, no internal imports — everything
runs the way a user would. There is **no fake model**: scenarios that actually run
`ai` nodes call real `claude -p` and are gated on `haveClaude` (skipped when claude
isn't on PATH). Structural tests (scaffold, validate, ls) stay offline.

**Physically separate from the browser suite:** CLI E2E lives here in top-level
`e2eCli/` (vitest); browser E2E lives in `e2e/browser/` (Playwright). They share
nothing and never run together.

```bash
npm run e2e:cli      # CLI E2E (vitest) — drives the real chain binary, asserts
npm run e2e          #   alias of e2e:cli (kept for habit)
npm run e2e:demo     # non-headless terminal — watch the real chain runs, in color
npm run e2e:ui       # BROWSER E2E (Playwright, headed) — separate suite, e2e/browser/
npm test             # unit tests only (src/), kept separate
```

Three layers, three locations:
- **unit** — `src/**/*.test.ts` (pure functions, `npm test`)
- **CLI E2E** — `e2eCli/` (spawns the real binary, `npm run e2e:cli`)
- **browser E2E** — `e2e/browser/*.spec.ts` (Playwright drives Chromium, `npm run e2e:ui`)

`e2e:demo` (`e2eCli/demo.ts`) walks the same flows but streams the CLI's real colored
output to your terminal (`✓ ran` / `⊘ cached` / `✗ failed`, the `plan:` preflight),
so you can *see* it work instead of just reading pass/fail.

## Layout

```
e2eCli/
├── harness/
│   ├── cli.ts        spawn the CLI (absolute tsx binary), strip ANSI → { out, code }
│   ├── status.ts     parse ✓/⊘/✗/– prefixes → { nodeId: status }
│   └── project.ts    Project: temp dir + .chain() / .run() / .write() / .read() / .exists()
├── fixtures/
│   └── flows.ts      flow builders: linear() · cmdInputs() · multiInput*() · broken() · unwiredRef()
└── scenarios/
    ├── init.e2e.ts        scaffold · refuse-clobber · --force
    ├── new.e2e.ts         add a flow · ls
    ├── cache.e2e.ts       cached-on-rerun · edit-downstream · edit-upstream
    ├── iterate.e2e.ts     pin → scratch · from-order reorder
    ├── validate.e2e.ts    dangling-from rejected · prompt-ref-must-be-wired · cmd cwd + caching
    └── multi-input.e2e.ts fan-in: $json / $node["id"] / $('id')
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
file must end in `.e2e.ts` and live under `e2eCli/` to be picked up by
`vitest.e2e.config.ts`. **Browser tests go in `e2e/browser/` as `.spec.ts`, never here.**
