import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4321/chainq/",
    launchOptions: {
      slowMo: Number(process.env.SLOWMO ?? 0),
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run preview -- --host 127.0.0.1 --port 4321",
    url: "http://127.0.0.1:4321/chainq/",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
