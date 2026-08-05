import { describe, expect, it } from "vitest";
import { cmdToArgv } from "./profiles.js";

describe("model profile commands", () => {
  it("splits the standard non-interactive Codex profile into the expected argv", () => {
    expect(
      cmdToArgv("codex exec --ephemeral --sandbox read-only --skip-git-repo-check --color never -"),
    ).toEqual([
      "codex",
      "exec",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--skip-git-repo-check",
      "--color",
      "never",
      "-",
    ]);
  });
});
