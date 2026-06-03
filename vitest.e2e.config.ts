import { defineConfig, configDefaults } from "vitest/config";

// E2E framework: spawns the real CLI per scenario. Kept separate from the unit
// suite (vitest.config.ts) — run with `npm run e2e`.
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["e2e/**/*.e2e.ts"],
    exclude: [...configDefaults.exclude, "**/._*"],
    testTimeout: 30_000, // each scenario spawns several real CLI processes
  },
});
