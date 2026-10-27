import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  analyseOrigin,
  type Origin,
  originPath,
  originSummary,
  readOrigin,
  writeOrigin,
} from "../src/analysis.ts";
import { appendDecision } from "../src/decisions.ts";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import { isProtectedPath, workDir } from "../src/paths.ts";
import { writeProtectedJson } from "../src/store.ts";
import type { Message, TaskRecord } from "../src/types.ts";
import { createWork, saveWork } from "../src/work.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

function origin(paths: ReturnType<typeof repoPaths>, list: string[]): Origin {
  const o = analyseOrigin(paths, list);
  if ("refused" in o) throw new Error(o.refused);
  return o;
}

test("SP3-T5 AC-1: the origin of a path from git and the records: the commits with their blamed lines and the items whose artifacts they carry, summarised from the records; no item for a commit without a work folder; 0 lines for a commit the blame no longer names; the newest twenty commits", () => {
  const root = makeRepo({ "src/a.mjs": "one\ntwo\n", "README.md": "# r\n" });
  const paths = repoPaths(root, testEnv());
  const work = createWork(paths, "Delete accounts");
  work.type = "fix";
  work.kind = "issue";
  work.kindFrom = "work_type fix";
  work.tasks = [{ task: "T-1", message: "M-1", criteria: ["AC-1"] } as unknown as TaskRecord];
  saveWork(paths, work);
  const { evidence } = loadEvidence(paths, work.id);
  evidence.roles = [
    {
      agent: "review-code-quality",
      at: "2026-10-18T10:00:00.000Z",
      tokens: 10,
      tokensFrom: "none",
      file: null,
    },
    { agent: "judge", at: "2026-10-18T10:01:00.000Z", tokens: 10, tokensFrom: "none", file: null },
    { agent: "judge", at: "2026-10-18T10:02:00.000Z", tokens: 10, tokensFrom: "none", file: null },
  ];
  saveEvidence(paths, work.id, evidence);
  appendDecision(paths, {
    at: "2026-10-18T10:00:00.000Z",
    item: work.id,
    kind: "decision",
    id: "D-1",
    text: "x",
    by: "the user",
  });
  writeProtectedJson(paths, join(workDir(paths, work.id), "mail.json"), {
    version: 1,
    messages: [{ id: "M-1" } as unknown as Message],
  });
  write(root, "src/a.mjs", "one\ntwo\nthree\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fix by the crew");
  const fix = git(root, "rev-parse", "HEAD");
  const first = origin(paths, ["src/a.mjs", "README.md"]);
  expect(first.paths.map((p) => p.path)).toEqual(["src/a.mjs", "README.md"]);
  const a = first.paths[0]?.commits ?? [];
  expect(a).toHaveLength(2);
  expect(a[0]).toMatchObject({ sha: fix, author: "Crew Test", lines: 1, items: [work.id] });
  expect(a[0]?.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(a[1]).toMatchObject({ lines: 2, items: [] });
  expect(first.paths[1]?.commits).toHaveLength(1);
  expect(first.paths[1]?.commits[0]).toMatchObject({ lines: 1, items: [] });
  expect(first.items).toEqual([
    {
      id: work.id,
      title: "Delete accounts",
      kind: "issue",
      roles: ["review-code-quality", "judge"],
      tasks: ["T-1"],
      decisions: 1,
      mail: 1,
    },
  ]);
  expect(first.note).toBeUndefined();
  expect(originSummary(first)).toBe(
    `2 commits, 1 item (${work.id}: roles review-code-quality, judge; tasks T-1)`,
  );
  // A rewrite the blame names alone: the earlier commits keep their place with 0 lines.
  write(root, "src/a.mjs", "alpha\n");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "rewrite");
  const rewritten = origin(paths, ["src/a.mjs"]);
  expect(rewritten.paths[0]?.commits.map((c) => [c.lines, c.items])).toEqual([
    [1, []],
    [0, [work.id]],
    [0, []],
  ]);
  expect(originSummary(origin(paths, ["README.md"]))).toBe("1 commit, 0 items");
  // The file: engine-owned, read back, tampered after a hand edit; a refused run leaves it as it was.
  writeOrigin(paths, work.id, first);
  const file = originPath(paths, work.id);
  expect(file).toBe(join(workDir(paths, work.id), "analysis", "origin.json"));
  expect(isProtectedPath(paths, file)).toBe(true);
  expect(isProtectedPath(paths, join(workDir(paths, work.id), "analysis.md"))).toBe(false);
  expect(readOrigin(paths, work.id)).toEqual({ origin: first, tampered: false });
  expect(readOrigin(paths, "2026-10-01-001-none")).toBeNull();
  expect(analyseOrigin(paths, ["src/a.mjs", "src/nope.mjs"])).toEqual({
    refused: "unknown path: src/nope.mjs (not in the repository)",
  });
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(first);
  writeFileSync(file, `${readFileSync(file, "utf8")}\n`);
  expect(readOrigin(paths, work.id)?.tampered).toBe(true);
  // The newest twenty commits of a path, the oldest dropped with its lines.
  const deep = makeRepo({ "f.txt": "0\n" });
  const init = git(deep, "rev-parse", "HEAD");
  for (let i = 1; i <= 21; i++) {
    write(deep, "f.txt", `${i}\n`);
    git(deep, "add", "-A");
    git(deep, "commit", "-q", "-m", `c${i}`);
  }
  const capped = origin(repoPaths(deep, testEnv()), ["f.txt"]);
  const shas = capped.paths[0]?.commits.map((c) => c.sha) ?? [];
  expect(shas).toHaveLength(20);
  expect(shas).not.toContain(init);
  expect(capped.paths[0]?.commits[0]?.lines).toBe(1);
  expect(originSummary(capped)).toBe("20 commits, 0 items");
});

test("SP3-T5 AC-1: a work folder a commit names but which is gone or a symlink gives the empty summary, a name outside the work-id pattern is ignored, a bad path is refused with the one message and nothing read, and outside git the origin is empty with the note", () => {
  const gone = makeRepo({ "src/b.mjs": "b\n" });
  const gpaths = repoPaths(gone, testEnv());
  write(gone, ".crew/work/2026-10-01-001-gone/work.json", "{}");
  write(gone, ".crew/work/x/work.json", "{}");
  write(gone, "src/b.mjs", "bb\n");
  git(gone, "add", "-A");
  git(gone, "commit", "-q", "-m", "by two folders");
  const empty = {
    id: "2026-10-01-001-gone",
    title: null,
    kind: null,
    roles: [],
    tasks: [],
    decisions: 0,
    mail: 0,
  };
  rmSync(join(gone, ".crew", "work", "2026-10-01-001-gone"), { recursive: true, force: true });
  const g = origin(gpaths, ["src/b.mjs"]);
  expect(g.paths[0]?.commits[0]?.items).toEqual(["2026-10-01-001-gone"]);
  expect(g.items).toEqual([empty]);
  expect(originSummary(g)).toBe("2 commits, 1 item (2026-10-01-001-gone: roles none; tasks none)");
  const outside = tempDir("crew-outside-");
  mkdirSync(join(outside, "item"));
  writeFileSync(
    join(outside, "item", "work.json"),
    JSON.stringify({ id: "2026-10-01-001-gone", title: "planted" }),
  );
  symlinkSync(join(outside, "item"), join(gone, ".crew", "work", "2026-10-01-001-gone"));
  expect(origin(gpaths, ["src/b.mjs"]).items).toEqual([empty]);
  // Refused, with nothing read: untracked, outside, absolute, empty, a newline, a folder, a magic pathspec.
  const root = makeRepo({ "src/a.mjs": "one\n" });
  const paths = repoPaths(root, testEnv());
  for (const p of [
    "src/nope.mjs",
    "../x",
    "/etc/passwd",
    "",
    "  ",
    "src/a.mjs\nREADME.md",
    "src",
    ":(glob)**",
    ":/",
    ":!src/a.mjs",
  ]) {
    expect(analyseOrigin(paths, [p])).toEqual({
      refused: `unknown path: ${p} (not in the repository)`,
    });
  }
  expect(analyseOrigin(paths, ["src/a.mjs", "src"])).toEqual({
    refused: "unknown path: src (not in the repository)",
  });
  // Outside git: empty, with the note.
  const plain = tempDir("crew-plain-");
  mkdirSync(join(plain, ".crew"));
  write(plain, "src/a.mjs", "x\n");
  const none = analyseOrigin(repoPaths(plain, testEnv()), ["src/a.mjs"]);
  expect(none).toMatchObject({ paths: [], items: [], note: "no git repository" });
  expect(originSummary(none as Origin)).toBe("0 commits, 0 items");
});

// 2026-10-27-007 AC-5: a porcelain blame past spawnSync's default buffer of 1 MB (the engine's largest
// files: cli.ts, cli.test.ts) is read; gitRun runs git with the 64 MB buffer fingerprint.ts and
// secrets.ts already use, so crew analyse never ends in "spawnSync git ENOBUFS".
test("2026-10-27-007 AC-5: analyseOrigin reads a committed file of 30 000 lines, whose blame exceeds 1 MB", () => {
  const big = Array.from(
    { length: 30_000 },
    (_, i) => `line ${i} of a file long enough to blame past the buffer`,
  ).join("\n");
  const root = makeRepo({ "big.txt": `${big}\n` });
  const paths = repoPaths(root, testEnv());
  const result = analyseOrigin(paths, ["big.txt"]);
  expect("refused" in result).toBe(false);
  const found = result as Origin;
  expect(found.paths).toHaveLength(1);
  expect(found.paths[0]?.path).toBe("big.txt");
  expect(found.paths[0]?.commits.reduce((sum, c) => sum + c.lines, 0)).toBe(30_000);
}, 60_000);
