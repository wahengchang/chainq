# e2eMock — shared E2E mock flows

Static flow `.yaml` files used as **mock input by both test suites** (single source
of truth), so the CLI and the browser test the same flow instead of drifting:

- **CLI E2E** (`e2eCli/`, vitest) — reads these as fixed flows when a scenario needs a
  stable, real flow (it runs them with the real `claude -p`, gated on `haveClaude`).
- **Browser E2E** (`e2e/browser/`, Playwright) — `chain ui` opens these; `run.spec.ts`
  and `run-real.spec.ts` point `USER_FLOW` here.

Every mock here uses the real `default: claude -p` profile — there is **no fake model**.

```
e2eMock/
└─ test060316.yaml    draft → refine → step3 (linear chain)
```

Note: `e2eCli/fixtures/flows.ts` is different — those are *dynamic builders* (TS
functions that generate flow YAML at test time for cache/edit/from-order cases).
This folder is for *static* flows shared verbatim across suites.
