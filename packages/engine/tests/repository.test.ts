import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { childEnv, makeRepo, write } from "./helpers.ts";

/** This repository, whose own ignore and lint files the rows copy. */
const REPO = join(import.meta.dir, "../../..");

test("2026-11-01-003 AC-32: the repository's own .gitignore keeps Claude Code's local settings file out of git and out of biome's lint (finding 218)", () => {
  // The two files as this repository holds them, committed; the settings file as Claude Code
  // writes it, untracked, its allow array on one line.
  const root = makeRepo({
    ".gitignore": readFileSync(join(REPO, ".gitignore"), "utf8"),
    "biome.json": readFileSync(join(REPO, "biome.json"), "utf8"),
  });
  write(
    root,
    ".claude/settings.local.json",
    '{"permissions":{"allow":["Bash(ls:*)","Bash(cat:*)","Bash(git status:*)"]}}\n',
  );
  // The user's and the system's git configuration out of the way, so the ignore is the repository's own.
  const env = childEnv({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" });
  const git = (...args: string[]) =>
    spawnSync("git", ["-c", "core.excludesFile=/dev/null", ...args], {
      cwd: root,
      encoding: "utf8",
      env,
    });
  expect(git("check-ignore", "-q", ".claude/settings.local.json").status).toBe(0);
  expect(git("status", "--porcelain", "--untracked-files=all").stdout).toBe("");
  // The lint gate's own view: biome reads the repository's .gitignore through vcs.useIgnoreFile.
  const biome = spawnSync(join(REPO, "node_modules/.bin/biome"), ["check", "."], {
    cwd: root,
    encoding: "utf8",
    env,
  });
  const said = `${biome.stdout}${biome.stderr}`;
  expect(biome.status, said).toBe(0);
  expect(said).not.toContain("settings.local.json");
});
