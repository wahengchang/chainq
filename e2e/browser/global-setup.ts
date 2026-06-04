// Runs once before the browser tests: regenerate e2e-viz.html by executing the
// REAL engine through the iteration-loop scenarios (npm run viz). So the UI test
// always asserts against fresh, real engine output — not a stale snapshot.

import { execSync } from "node:child_process";

export default function globalSetup(): void {
  execSync("npm run viz", { stdio: "inherit" });
}
