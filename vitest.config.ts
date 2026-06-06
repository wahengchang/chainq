import { defineConfig, configDefaults } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // This repo lives on a non-HFS drive; macOS writes an AppleDouble `._*`
    // sidecar next to every file. Keep them out of the test run.
    exclude: [...configDefaults.exclude, "**/._*"],
  },
});
