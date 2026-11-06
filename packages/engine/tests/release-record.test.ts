import { expect, spyOn, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  engineRecord,
  handDeps,
  type ReleaseRecord,
  realRunner,
} from "../../../scripts/release.ts";
import * as fingerprint from "../src/fingerprint.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { onStop } from "../src/hooks/stop.ts";
import * as open from "../src/open.ts";
import { ensureProfile } from "../src/profile.ts";
import { recordReleaseDone, recordReleaseStart } from "../src/release-record.ts";
import { loadState, updateSession, updateState } from "../src/state.ts";
import type { Profile } from "../src/types.ts";
import { addCriterion, createWork, noItemTurnEnds, saveWork } from "../src/work.ts";
import {
  cliIo,
  git,
  hookContext,
  learnedFreedSession,
  makeRepo,
  repoPaths,
  testEnv,
  write,
} from "./helpers.ts";

const V = "1.2.3";
const NOTICE = `Crew: release ${V} is in progress (started `;
const NOTICE_TAIL = `): the turn ends while its process lives; change no file, commit nothing and start no item until it ends: a failure before the push resets the tree, and a change before the push makes the final record refuse.`;

/**
 * A session `s` on a committed repository, its baseline taken: the shape finding 219 met. The env
 * drops the id the suite inherits under Claude Code, so a row with no session is one.
 */
function session() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  delete env.CLAUDE_CODE_SESSION_ID;
  const ctx = hookContext({ session_id: "s", cwd: root }, env);
  onSessionStart(ctx);
  const paths = repoPaths(root, env);
  const profile = ensureProfile(paths).profile;
  const folder = join(root, ".crew", "local", "running");
  return { root, env, ctx, paths, profile, folder, marker: join(folder, `${process.pid}.json`) };
}

const markerOf = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
const rewrite = (path: string, change: (m: Record<string, unknown>) => void, to = path) => {
  const m = markerOf(path);
  change(m);
  if (to !== path) rmSync(path);
  writeFileSync(to, JSON.stringify(m));
};
const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000).toISOString();
/** A change of the tree and a Stop that starts its own count, so the cap never releases a row. */
const blocked = (s: ReturnType<typeof session>) => {
  write(s.root, "src/a.ts", "changed");
  return onStop(s.ctx, { stop_hook_active: false });
};
let bumps = 0;
/** A commit of a watched change, tagged unless the tag is empty; each one differs, so a second commit is never empty. */
const commitTagged = (root: string, tag = `v${V}`) => {
  write(root, "src/a.ts", `the version bump ${++bumps}`);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", `Release ${V}`);
  if (tag) git(root, "tag", "-a", tag, "-m", "x");
};
const activate = (s: ReturnType<typeof session>) => {
  const work = createWork(s.paths, "fix");
  addCriterion(work, "x");
  saveWork(s.paths, work);
  updateState(s.paths, (state) => {
    state.active = work.id;
  });
  return work;
};

test("2026-11-01-003 AC-33: a release typed in a session is an unknown command that writes nothing", async () => {
  const s = session();
  const r = await cliIo(s.root, s.env)("release", "start", V);
  expect(r.code).toBe(1);
  expect(r.err).toContain("unknown command: release");
  expect(r.err).toContain("  detect [--refresh]");
  expect(existsSync(s.folder)).toBe(false);
});

test("2026-11-01-003 AC-39: with no session the start record writes nothing; with one, on a tree the rule lets end by its content, it writes the marker and answers recorded", () => {
  const s = session();
  for (const none of [null, ""]) {
    expect(recordReleaseStart(s.paths, s.profile, none, V)).toEqual({
      recorded: false,
      text: `release ${V}: no session, nothing recorded`,
    });
    expect(existsSync(s.marker)).toBe(false);
  }
  expect(recordReleaseStart(s.paths, s.profile, "s", V)).toEqual({
    recorded: true,
    text: `release ${V} recorded for session s: the turn may end while it runs`,
  });
  const m = markerOf(s.marker);
  expect(m).toMatchObject({
    command: `release ${V}`,
    pid: process.pid,
    processStart: open.processStart(process.pid),
    session: "s",
    version: V,
    head: git(s.root, "rev-parse", "HEAD"),
  });
  expect(typeof m.startedAt).toBe("string");
  expect(Number.isNaN(Date.parse(m.startedAt as string))).toBe(false);
});

test("2026-11-01-003 AC-39: a session the rule lets end whatever the tree (no baseline, an unreadable fingerprint) gets no marker", () => {
  const s = session();
  updateSession(s.paths, "s", (state) => {
    state.baseline = null;
  });
  const nothing = {
    recorded: false,
    text: `release ${V}: nothing to record: the Stop rule already lets this session's turns end`,
  };
  expect(recordReleaseStart(s.paths, s.profile, "s", V)).toEqual(nothing);
  expect(existsSync(s.marker)).toBe(false);
  const t = session();
  const unavailable = spyOn(fingerprint, "computeFingerprint").mockReturnValue(
    fingerprint.UNAVAILABLE,
  );
  try {
    expect(recordReleaseStart(t.paths, t.profile, "s", V)).toEqual(nothing);
  } finally {
    unavailable.mockRestore();
  }
  expect(existsSync(t.marker)).toBe(false);
});

test("2026-11-01-003 AC-39: an active or tampered item, unproven changes, an unreadable start time or a pid of 1 refuse the start record and write nothing", () => {
  const refused = (s: ReturnType<typeof session>, text: string) => {
    expect(recordReleaseStart(s.paths, s.profile, "s", V)).toEqual({ recorded: false, text });
    expect(existsSync(s.marker)).toBe(false);
  };
  const active = session();
  const work = activate(active);
  refused(
    active,
    `release ${V}: work item ${work.id} is active; a release is recorded with no item open`,
  );
  const tampered = session();
  const item = activate(tampered);
  const file = join(tampered.root, ".crew", "work", item.id, "work.json");
  writeFileSync(file, `${readFileSync(file, "utf8")}\n`);
  refused(
    tampered,
    `release ${V}: work item ${item.id} is active and its record changed outside the engine; a release is recorded with no item open`,
  );
  const changed = session();
  write(changed.root, "src/a.ts", "changed");
  refused(
    changed,
    `release ${V}: the session has changes the engine has not proven (the tree differs from the session's baseline); nothing recorded, the Stop rule stands`,
  );
  const unread = session();
  const noStart = spyOn(open, "processStart").mockReturnValue("");
  try {
    refused(unread, `release ${V}: the process's start time could not be read; nothing recorded`);
  } finally {
    noStart.mockRestore();
  }
  const one = session();
  const pid = process.pid;
  Object.defineProperty(process, "pid", { value: 1, configurable: true });
  try {
    refused(
      one,
      `release ${V}: the process id 1 is not one the engine can check; nothing recorded`,
    );
  } finally {
    Object.defineProperty(process, "pid", { value: pid, configurable: true });
  }
});

test("2026-11-01-003 AC-39: an abandoned active item is no item, a learned item's proof lets the start record on a tree that differs from the baseline, and a null baseline answers nothing to record whatever the proof", async () => {
  const s = session();
  const work = activate(s);
  const envS = { ...s.env, CLAUDE_CODE_SESSION_ID: "s" };
  const dropped = await cliIo(s.root, envS)("abandon", work.id, "--reason", "x");
  expect(dropped.code, dropped.err).toBe(0);
  expect(recordReleaseStart(s.paths, s.profile, "s", V).recorded).toBe(true);
  const learned = await learnedFreedSession(true);
  const paths = repoPaths(learned.root, learned.env);
  const profile = ensureProfile(paths).profile;
  expect(recordReleaseStart(paths, profile, "s", V).recorded).toBe(true);
  rmSync(join(learned.root, ".crew", "local", "running", `${process.pid}.json`));
  updateSession(paths, "s", (state) => {
    state.baseline = null;
  });
  expect(recordReleaseStart(paths, profile, "s", V)).toEqual({
    recorded: false,
    text: `release ${V}: nothing to record: the Stop rule already lets this session's turns end`,
  });
  expect(existsSync(join(learned.root, ".crew", "local", "running", `${process.pid}.json`))).toBe(
    false,
  );
});

test("2026-11-01-003 AC-27: while the marker holds the Stop hook lets every turn end with the notice and resets the block count, and with an item active it is not read", () => {
  const s = session();
  expect(recordReleaseStart(s.paths, s.profile, "s", V).recorded).toBe(true);
  write(s.root, "src/a.ts", "the version bump");
  updateSession(s.paths, "s", (state) => {
    state.stopBlocks = 3;
  });
  const first = onStop(s.ctx);
  expect(first.decision).toBeUndefined();
  const startedAt = markerOf(s.marker).startedAt as string;
  expect(first.systemMessage).toBe(`${NOTICE}${startedAt}${NOTICE_TAIL}`);
  expect(loadState(s.paths).sessions.s?.stopBlocks).toBe(0);
  const second = onStop(s.ctx);
  expect(second.decision).toBeUndefined();
  expect(second.systemMessage).toBe(`${NOTICE}${startedAt}${NOTICE_TAIL}`);
  const work = activate(s);
  const before = readFileSync(join(s.root, ".crew", "work", work.id, "work.json"), "utf8");
  const held = onStop(s.ctx);
  expect(held.decision).toBe("block");
  expect(existsSync(s.marker)).toBe(true);
  expect(readFileSync(join(s.root, ".crew", "work", work.id, "work.json"), "utf8")).toBe(before);
});

test("2026-11-01-003 AC-27: a dead, aged, malformed or misnamed marker is removed when a changed tree is read, a reused pid's or another session's is left and ignored, and the rule stands", () => {
  const dead = session();
  expect(recordReleaseStart(dead.paths, dead.profile, "s", V).recorded).toBe(true);
  const deadFile = join(dead.folder, "2147483000.json");
  rewrite(
    dead.marker,
    (m) => {
      m.pid = 2_147_483_000;
    },
    deadFile,
  );
  expect(String(blocked(dead).reason)).toContain("no work item");
  expect(existsSync(deadFile)).toBe(false);

  const reused = session();
  expect(recordReleaseStart(reused.paths, reused.profile, "s", V).recorded).toBe(true);
  rewrite(reused.marker, (m) => {
    m.processStart = "Thu Jan  1 00:00:00 1970";
  });
  expect(blocked(reused).decision).toBe("block");
  expect(existsSync(reused.marker)).toBe(true);

  for (const other of [false, true]) {
    const aged = session();
    expect(recordReleaseStart(aged.paths, aged.profile, "s", V).recorded).toBe(true);
    rewrite(aged.marker, (m) => {
      m.startedAt = minutesAgo(46);
      if (other) m.session = "other";
    });
    expect(blocked(aged).decision).toBe("block");
    expect(existsSync(aged.marker)).toBe(false);
  }

  const malformed = [
    () => "{ not json",
    (m: Record<string, unknown>) => {
      delete m.version;
      return JSON.stringify(m);
    },
    (m: Record<string, unknown>) => {
      delete m.head;
      return JSON.stringify(m);
    },
    (m: Record<string, unknown>) => {
      m.startedAt = "yesterday";
      return JSON.stringify(m);
    },
  ];
  for (const shape of malformed) {
    const s = session();
    expect(recordReleaseStart(s.paths, s.profile, "s", V).recorded).toBe(true);
    writeFileSync(s.marker, shape(markerOf(s.marker)));
    expect(blocked(s).decision).toBe("block");
    expect(existsSync(s.marker)).toBe(false);
  }

  const misnamed = session();
  expect(recordReleaseStart(misnamed.paths, misnamed.profile, "s", V).recorded).toBe(true);
  const oneFile = join(misnamed.folder, "1.json");
  renameSync(misnamed.marker, oneFile);
  expect(blocked(misnamed).decision).toBe("block");
  expect(existsSync(oneFile)).toBe(false);

  const foreign = session();
  expect(recordReleaseStart(foreign.paths, foreign.profile, "s", V).recorded).toBe(true);
  rewrite(foreign.marker, (m) => {
    m.session = "other";
  });
  expect(blocked(foreign).decision).toBe("block");
  expect(existsSync(foreign.marker)).toBe(true);
});

test("2026-11-01-003 AC-42: the end record on the recorded head's tagged, clean first child renews the baseline, resets the block count, removes the marker, and the next turn ends", () => {
  const s = session();
  expect(recordReleaseStart(s.paths, s.profile, "s", V).recorded).toBe(true);
  commitTagged(s.root);
  updateSession(s.paths, "s", (state) => {
    state.stopBlocks = 2;
  });
  expect(recordReleaseDone(s.paths, s.profile, "s", V)).toEqual({
    recorded: true,
    text: `release ${V} done: the session's baseline is now commit ${git(s.root, "rev-parse", "HEAD").slice(0, 7)}`,
  });
  expect(existsSync(s.marker)).toBe(false);
  expect(loadState(s.paths).sessions.s?.stopBlocks).toBe(0);
  expect(onStop(s.ctx)).toEqual({});
});

test("2026-11-01-003 AC-42: the end record refuses, naming the check, on a missing or aged marker, another version, a watched change, another or no first parent, a missing tag or an unreadable fingerprint, and records nothing with no session", () => {
  const refused = (s: ReturnType<typeof session>, version: string, text: string) =>
    expect(recordReleaseDone(s.paths, s.profile, "s", version)).toEqual({ recorded: false, text });
  const none = session();
  refused(none, V, `no release ${V} recorded for this session`);

  const aged = session();
  expect(recordReleaseStart(aged.paths, aged.profile, "s", V).recorded).toBe(true);
  rewrite(aged.marker, (m) => {
    m.startedAt = minutesAgo(46);
  });
  commitTagged(aged.root);
  refused(aged, V, `no release ${V} recorded for this session`);
  expect(existsSync(aged.marker)).toBe(false);

  const other = session();
  expect(recordReleaseStart(other.paths, other.profile, "s", V).recorded).toBe(true);
  commitTagged(other.root);
  refused(other, "9.9.9", "no release 9.9.9 recorded for this session");
  expect(existsSync(other.marker)).toBe(true);

  const dirty = session();
  expect(recordReleaseStart(dirty.paths, dirty.profile, "s", V).recorded).toBe(true);
  commitTagged(dirty.root);
  write(dirty.root, "src/a.ts", "dirty");
  refused(dirty, V, `release ${V}: a watched file changed from HEAD: src/a.ts`);
  expect(existsSync(dirty.marker)).toBe(true);

  const two = session();
  expect(recordReleaseStart(two.paths, two.profile, "s", V).recorded).toBe(true);
  const head = git(two.root, "rev-parse", "HEAD").slice(0, 7);
  commitTagged(two.root, "");
  commitTagged(two.root);
  const parent = git(two.root, "rev-parse", "HEAD^").slice(0, 7);
  refused(two, V, `release ${V}: HEAD's first parent is ${parent}, not the recorded ${head}`);
  expect(existsSync(two.marker)).toBe(true);

  const orphan = session();
  expect(recordReleaseStart(orphan.paths, orphan.profile, "s", V).recorded).toBe(true);
  git(orphan.root, "checkout", "-q", "--orphan", "fresh");
  git(orphan.root, "commit", "-q", "-m", "root");
  git(orphan.root, "tag", "-a", `v${V}`, "-m", "x");
  refused(orphan, V, `release ${V}: HEAD has no parent`);
  expect(existsSync(orphan.marker)).toBe(true);

  const untagged = session();
  expect(recordReleaseStart(untagged.paths, untagged.profile, "s", V).recorded).toBe(true);
  commitTagged(untagged.root, "");
  refused(untagged, V, `release ${V}: v${V} is not on HEAD`);
  expect(existsSync(untagged.marker)).toBe(true);

  const unreadable = session();
  expect(recordReleaseStart(unreadable.paths, unreadable.profile, "s", V).recorded).toBe(true);
  commitTagged(unreadable.root);
  const spy = spyOn(fingerprint, "computeFingerprint").mockReturnValue(fingerprint.UNAVAILABLE);
  try {
    refused(unreadable, V, `release ${V}: the tree could not be fingerprinted`);
  } finally {
    spy.mockRestore();
  }
  expect(existsSync(unreadable.marker)).toBe(true);

  const quiet = session();
  expect(recordReleaseDone(quiet.paths, quiet.profile as Profile, null, V)).toEqual({
    recorded: false,
    text: `release ${V}: no session, nothing recorded`,
  });
});

test("2026-11-01-003 AC-42: the end record refuses a marker another process wrote, naming its pid, and keeps it", () => {
  const s = session();
  expect(recordReleaseStart(s.paths, s.profile, "s", V).recorded).toBe(true);
  const other = process.ppid;
  const m = markerOf(s.marker);
  m.pid = other;
  m.processStart = open.processStart(other);
  const file = join(s.folder, `${other}.json`);
  writeFileSync(file, `${JSON.stringify(m)}\n`);
  rmSync(s.marker);
  commitTagged(s.root);
  expect(recordReleaseDone(s.paths, s.profile, "s", V)).toEqual({
    recorded: false,
    text: `release ${V}: the marker was written by process ${other}, not this one`,
  });
  expect(existsSync(file)).toBe(true);
});

test("2026-11-01-003 AC-43: the hand run's deps carry the engine's records from the environment: a session's start and end are the engine's, and no session, unresolvable paths or a missing profile answer unrecorded and write nothing", () => {
  const s = session();
  const deps = handDeps(s.root, { ...s.env, CLAUDE_CODE_SESSION_ID: "s" });
  expect(deps.run).toBe(realRunner);
  const record = deps.record as ReleaseRecord;
  expect(record.start(V)).toEqual({
    recorded: true,
    text: `release ${V} recorded for session s: the turn may end while it runs`,
  });
  expect(existsSync(s.marker)).toBe(true);
  commitTagged(s.root);
  expect(record.done(V)).toEqual({
    recorded: true,
    text: `release ${V} done: the session's baseline is now commit ${fingerprint.gitHead(s.root).slice(0, 7)}`,
  });
  expect(existsSync(s.marker)).toBe(false);
  const quiet = session();
  for (const env of [{ ...quiet.env, CLAUDE_CODE_SESSION_ID: "" }, quiet.env]) {
    expect(engineRecord(quiet.root, env).start(V)).toEqual({
      recorded: false,
      text: `release ${V}: no session, nothing recorded`,
    });
    expect(existsSync(quiet.marker)).toBe(false);
  }
  const nowhere = mkdtempSync(join(tmpdir(), "release-record-nowhere-"));
  expect(engineRecord(nowhere, { ...testEnv(), CLAUDE_CODE_SESSION_ID: "s" }).start(V)).toEqual({
    recorded: false,
    text: `release ${V}: no record: the repository's paths could not be resolved`,
  });
  const bare = makeRepo({ "src/a.ts": "x\n" });
  expect(engineRecord(bare, { ...testEnv(), CLAUDE_CODE_SESSION_ID: "s" }).start(V)).toEqual({
    recorded: false,
    text: `release ${V}: no record: the repository has no profile`,
  });
  expect(existsSync(join(bare, ".crew", "profile.json"))).toBe(false);
  const spoiled = session();
  const profileFile = join(spoiled.root, ".crew", "profile.json");
  writeFileSync(profileFile, `${readFileSync(profileFile, "utf8")}\n`);
  expect(
    engineRecord(spoiled.root, { ...spoiled.env, CLAUDE_CODE_SESSION_ID: "s" }).start(V),
  ).toEqual({
    recorded: false,
    text: `release ${V}: no record: the profile changed outside the engine`,
  });
  expect(existsSync(spoiled.marker)).toBe(false);
});

test("finding 225 AC-2: the end record sets the baseline's commit to the HEAD it renewed the baseline at, and a later commit with no watched change leaves the rule free and the next start record recorded", () => {
  const s = session();
  expect(recordReleaseStart(s.paths, s.profile, "s", V).recorded).toBe(true);
  commitTagged(s.root);
  expect(recordReleaseDone(s.paths, s.profile, "s", V).recorded).toBe(true);
  const head = git(s.root, "rev-parse", "HEAD");
  const renewed = loadState(s.paths).sessions.s;
  expect(renewed?.baselineCommit).toBe(head);
  expect(renewed?.baseline).toBe(
    fingerprint.computeFingerprint(s.root, s.profile, { baseCommit: head }),
  );
  write(s.root, "docs/improve/run.md", "the loop's record");
  git(s.root, "add", "docs");
  git(s.root, "commit", "-q", "-m", "Improvement run: nothing kept");
  const state = loadState(s.paths).sessions.s;
  if (!state) throw new Error("no session state");
  const current = fingerprint.computeFingerprint(s.root, s.profile, null);
  expect(noItemTurnEnds(s.paths, s.profile, state, current)).toBe(true);
  expect(recordReleaseStart(s.paths, s.profile, "s", "1.2.4").recorded).toBe(true);
});
