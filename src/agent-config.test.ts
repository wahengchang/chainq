import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cleaner = join(repoRoot, "scripts", "delete-appledouble.mjs");
const temporaryDirectories: string[] = [];
const appleDouble = Buffer.from([0x00, 0x05, 0x16, 0x07, 0x00, 0x02, 0x00, 0x00]);

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("shared agent configuration", () => {
  it("cleans only untracked AppleDouble sidecars inside the repository", () => {
    const directory = mkdtempSync(join(tmpdir(), "chain-agent-config-"));
    temporaryDirectories.push(directory);
    execFileSync("git", ["init", "-q"], { cwd: directory });

    const removable = join(directory, "._remove");
    const ordinary = join(directory, "._ordinary");
    const tracked = join(directory, "._tracked");
    const skipped = join(directory, "node_modules", "._skipped");
    const gitSidecar = join(directory, ".git", "objects", "pack", "._pack-test.idx");
    mkdirSync(dirname(skipped), { recursive: true });
    mkdirSync(dirname(gitSidecar), { recursive: true });
    writeFileSync(removable, appleDouble);
    writeFileSync(ordinary, "not AppleDouble");
    writeFileSync(tracked, appleDouble);
    writeFileSync(skipped, appleDouble);
    writeFileSync(gitSidecar, appleDouble);
    execFileSync("git", ["add", "-f", "._tracked"], { cwd: directory });

    const check = spawnSync(process.execPath, [cleaner, "--check"], { cwd: directory, encoding: "utf8" });
    expect(check.status).toBe(1);
    expect(check.stderr).toContain("._remove");
    expect(check.stderr).not.toContain(".git/objects/pack/._pack-test.idx");
    expect(check.stderr).not.toContain("._tracked");
    expect(check.stderr).not.toContain("._ordinary");
    expect(check.stderr).not.toContain("node_modules/._skipped");

    expect(spawnSync(process.execPath, [cleaner, "--clean"], { cwd: directory }).status).toBe(0);
    expect(existsSync(removable)).toBe(false);
    expect(existsSync(gitSidecar)).toBe(true);
    expect(existsSync(ordinary)).toBe(true);
    expect(existsSync(tracked)).toBe(true);
    expect(existsSync(skipped)).toBe(true);
  });
});
