import { defineConfig, configDefaults } from "vitest/config";

// E2E framework: spawns the real CLI per scenario. Kept separate from the unit
// suite (vitest.config.ts) — run with `npm run e2e`.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // CLI E2E lives entirely under the top-level e2eCli/ folder (physically
    // separate from the browser suite in e2e/browser/, which runs under Playwright).
    include: ["e2eCli/**/*.e2e.ts"],
    exclude: [...configDefaults.exclude, "**/._*"],
    testTimeout: 30_000, // each scenario spawns several real CLI processes
  },
});
