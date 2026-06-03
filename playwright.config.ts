import { defineConfig, devices } from "@playwright/test";

// Browser E2E (UI). Separate from the CLI E2E (vitest, e2e/scenarios) and the
// unit suite. Run with `npm run e2e:ui` (headed — you watch it) or
// `npm run e2e:ui:headless`.
export default defineConfig({
  testDir: "./e2e/ui",
  testMatch: "**/*.spec.ts",
  // This drive is non-HFS; macOS writes a `._*` AppleDouble sidecar per file.
  testIgnore: "**/._*",
  // Regenerate e2e-viz.html from the real engine before opening the browser.
  globalSetup: "./e2e/ui/global-setup.ts",
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    trace: "on-first-retry",
  },
});
