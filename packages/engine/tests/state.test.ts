import { expect, spyOn, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as stateModule from "../src/state.ts";
import { loadState, oneLine, recordAdapterVersion, updateSession } from "../src/state.ts";
import * as worktreeModule from "../src/worktree.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv } from "./helpers.ts";

/** The bidirectional and invisible format characters oneLine deletes (finding 58, the security lead's return). */
const FORMAT = [
  ...[0x200b, 0x200c, 0x200d, 0x200e, 0x200f],
  ...[0x202a, 0x202b, 0x202c, 0x202d, 0x202e],
  0x2060,
  ...[0x2066, 0x2067, 0x2068, 0x2069],
  0xfeff,
];

test("CON5-AC-7-oneline: oneLine deletes each bidirectional and invisible format character, not spaces it, beside what it cleans today", () => {
  for (const code of FORMAT) {
    const ch = String.fromCharCode(code);
    expect(oneLine(`ab${ch}cd`), `U+${code.toString(16)}`).toBe("abcd");
    expect(oneLine(`${ch}ab ${ch}cd${ch}`), `U+${code.toString(16)}`).toBe("ab cd");
  }
  expect(oneLine("a‮​﻿b")).toBe("ab");
  // What it removes today stays removed: an escape sequence, and C0, DEL and C1 as one space.
  expect(oneLine("a\x1b[31mb")).toBe("ab");
  expect(oneLine("a\x00b\x7fc\x85d")).toBe("a b c d");
});

test("CON6-AC-8 (finding 58): a working role's stored description is cleaned to one line again when the state is read", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  mkdirSync(paths.localDir, { recursive: true });
  const since = new Date().toISOString();
  const dirty = "\x1b[31mreview\x1b[0m the\ncart\u202e  totals\r\n";
  writeFileSync(
    join(paths.localDir, "state.json"),
    JSON.stringify({
      active: null,
      sessions: {},
      working: [
        { agent: "review-security", team: null, since, sessionId: "s", description: dirty },
        { agent: "judge", team: null, since, sessionId: "s", description: "\u200b\n\x1b[0m" },
      ],
    }),
  );
  const working = loadState(paths).working ?? [];
  // The judge's description cleans to nothing: its role is not kept as an empty line.
  expect(working).toHaveLength(1);
  expect(working[0]).toEqual({
    agent: "review-security",
    team: null,
    since,
    sessionId: "s",
    description: "review the cart totals",
  });
  // A description that cleans to nothing is not kept as an empty line.
  for (const role of working) expect(role.description).not.toBe("");
  expect(
    working.map((w) => w.description).filter((d) => d !== undefined && oneLine(d) !== d),
  ).toEqual([]);
});

test("DEBT-AC-7-worktree-of: isWorktreeOf reads a gitdir written with backslashes and a trailing separator", () => {
  const main = makeRepo();
  const lane = join(tempDir(), "lane");
  git(main, "worktree", "add", "-q", "-b", "lane", lane);
  const record = join(main, ".git", "worktrees", "lane");
  const isWorktreeOf = (
    stateModule as unknown as { isWorktreeOf?: (r: string, m: string) => boolean }
  ).isWorktreeOf;
  expect(typeof isWorktreeOf).toBe("function");
  const real = worktreeModule.gitRun;
  // The gitdir a Windows git writes cannot be followed by this git: the common dir is answered.
  const run = spyOn(worktreeModule, "gitRun").mockImplementation((cwd, ...args) =>
    args[0] === "rev-parse" ? join(main, ".git") : real(cwd, ...args),
  );
  try {
    for (const line of [
      `gitdir: ${record.replace(/\//g, "\\")}`,
      `gitdir: ${record.replace(/\//g, "\\")}\\`,
      `gitdir: ${record}/`,
    ]) {
      writeFileSync(join(lane, ".git"), `${line}\n`);
      expect(isWorktreeOf?.(lane, main), line).toBe(true);
    }
    writeFileSync(
      join(lane, ".git"),
      `gitdir: ${join(main, ".git", "worktrees", "other").replace(/\//g, "\\")}\\\n`,
    );
    expect(isWorktreeOf?.(lane, main)).toBe(false);
  } finally {
    run.mockRestore();
  }
});

test("2026-11-08-002 AC-1: the adapters record survives a load and an unrelated update", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  mkdirSync(paths.localDir, { recursive: true });
  const file = join(paths.localDir, "state.json");
  writeFileSync(
    file,
    JSON.stringify({
      active: null,
      sessions: { s: { baseline: null, stopBlocks: 0 } },
      adapters: { "/r/a": "0.21.0", "/r/b": "x", "": "0.1.0" },
    }),
  );
  expect(loadState(paths).adapters).toEqual({ "/r/a": "0.21.0" });
  updateSession(paths, "s", (s) => {
    s.stopBlocks = 1;
  });
  const raw = JSON.parse(readFileSync(file, "utf8")) as { adapters?: unknown };
  expect(raw.adapters).toEqual({ "/r/a": "0.21.0" });
  writeFileSync(file, JSON.stringify({ active: null, sessions: {}, adapters: [] }));
  expect("adapters" in loadState(paths)).toBe(false);
});

test("2026-11-08-002 AC-8: a record write drops the roots that are gone", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  mkdirSync(paths.localDir, { recursive: true });
  const live = tempDir();
  mkdirSync(join(live, "dist"));
  writeFileSync(join(live, "dist", "crew.mjs"), "");
  const gone = join(tempDir(), "gone");
  const run = tempDir();
  mkdirSync(join(run, "dist"));
  writeFileSync(join(run, "dist", "crew.mjs"), "");
  writeFileSync(
    join(paths.localDir, "state.json"),
    JSON.stringify({ active: null, sessions: {}, adapters: { [live]: "0.1.0", [gone]: "0.1.0" } }),
  );
  recordAdapterVersion(paths, run, "0.2.0");
  expect(loadState(paths).adapters).toEqual({ [live]: "0.1.0", [run]: "0.2.0" });
});
