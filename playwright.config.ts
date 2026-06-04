import { defineConfig, devices } from "@playwright/test";

// Browser E2E. Separate from the CLI E2E (vitest, top-level e2eCli/) and the
// unit suite. Run with `npm run e2e:ui` (headed — you watch it) or
// `npm run e2e:ui:headless`.
export default defineConfig({
  testDir: "./e2e/browser",
  testMatch: "**/*.spec.ts",
  // This drive is non-HFS; macOS writes a `._*` AppleDouble sidecar per file.
  testIgnore: "**/._*",
  // Regenerate e2e-viz.html from the real engine before opening the browser.
  globalSetup: "./e2e/browser/global-setup.ts",
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    trace: "on-first-retry",
    // SLOWMO=900 makes each browser action visibly slow, so you can WATCH the
    // automation click through the visualizer live (the `e2e:ui:demo` script).
    launchOptions: { slowMo: Number(process.env.SLOWMO ?? 0) },
  },
});
