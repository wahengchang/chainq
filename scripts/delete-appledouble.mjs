#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import {
  closeSync,
  openSync,
  readSync,
  readdirSync,
  unlinkSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

const mode = process.argv.includes("--clean") ? "clean" : "check";
const skippedDirectories = new Set([
  ".git",
  ".chain",
  "dist",
  "node_modules",
  "out",
  "playwright-report",
  "reports",
  "test-results",
]);

function repositoryRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function slashPath(path) {
  return path.split(sep).join("/");
}

function trackedPaths(repoRoot) {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Set(output.split("\0").filter(Boolean));
}

function isAppleDouble(path) {
  const fd = openSync(path, "r");
  try {
    const magic = Buffer.alloc(4);
    return readSync(fd, magic, 0, magic.length, 0) === 4
      && magic.equals(Buffer.from([0x00, 0x05, 0x16, 0x07]));
  } finally {
    closeSync(fd);
  }
}

function candidates(repoRoot, tracked) {
  const found = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (skippedDirectories.has(entry.name)) continue;
        visit(path);
        continue;
      }
      if (!entry.isFile() || !entry.name.startsWith("._")) continue;
      const rel = slashPath(relative(repoRoot, path));
      if (!tracked.has(rel) && isAppleDouble(path)) found.push({ path, rel });
    }
  };
  visit(repoRoot);
  return found;
}

const repoRoot = repositoryRoot();
const found = candidates(repoRoot, trackedPaths(repoRoot));

if (mode === "clean") {
  for (const item of found) unlinkSync(item.path);
  process.exit(0);
}

if (found.length > 0) {
  process.stderr.write(
    `AppleDouble sidecars found (${found.length}):\n${found.map((item) => `  ${item.rel}`).join("\n")}\n`,
  );
  process.exit(1);
}
