import { expect, setSystemTime, spyOn, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { lane } from "../src/hooks/context.ts";
import { handleHook } from "../src/hooks/index.ts";
import type { HookPayload } from "../src/hooks/types.ts";
import * as lockModule from "../src/lock.ts";
import type { CrewPaths } from "../src/paths.ts";
import * as stateModule from "../src/state.ts";
import { loadState } from "../src/state.ts";
import { VERSION } from "../src/version.ts";
import { addCriterion, createWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, repoPaths, testEnv } from "./helpers.ts";

/** A session's record as the lanes design writes it (AC-1): read loosely, since today's type knows none of it. */
type LaneRecord = { cwd?: unknown; seenAt?: unknown; endedAt?: unknown; item?: unknown };

function lanesRepo() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  return { root, env, paths: repoPaths(root, env) };
}

function recordOf(paths: CrewPaths, sessionId: string): LaneRecord | undefined {
  return loadState(paths).sessions[sessionId] as LaneRecord | undefined;
}

/** The ids `liveSessions` returned, whatever its shape: a list of ids, a list of records with an id, or a map keyed by id. */
function liveIds(result: unknown): string[] {
  if (Array.isArray(result))
    return result.map((entry) =>
      typeof entry === "string"
        ? entry
        : String(
            (entry as { id?: unknown; sessionId?: unknown }).id ??
              (entry as { sessionId?: unknown }).sessionId,
          ),
    );
  if (result && typeof result === "object") return Object.keys(result);
  return [];
}

test("LANE-AC-1: every hook records its session at most once a minute, SessionEnd ends it, a session is live within ten minutes, bad entries are dropped", () => {
  const { root, env, paths } = lanesRepo();
  const ls = (session_id: string): HookPayload => ({
    session_id,
    cwd: root,
    tool_name: "Bash",
    tool_input: { command: "ls" },
  });
  const t0 = Date.now();
  const locks = spyOn(lockModule, "withLock");
  const stateLocks = () => locks.mock.calls.filter((call) => call[0] === paths.localDir).length;
  try {
    // Two hooks a second apart: one locked write of the state, one seenAt.
    setSystemTime(new Date(t0));
    handleHook("post-tool-use", ls("s-one"), env);
    setSystemTime(new Date(t0 + 1000));
    handleHook("post-tool-use", ls("s-one"), env);
    expect(stateLocks()).toBe(1);
    expect(recordOf(paths, "s-one")?.seenAt).toBe(new Date(t0).toISOString());
    expect(recordOf(paths, "s-one")?.cwd).toBe(root);
    // A minute later the record moves on.
    setSystemTime(new Date(t0 + 61_000));
    handleHook("post-tool-use", ls("s-one"), env);
    expect(stateLocks()).toBe(2);
    expect(recordOf(paths, "s-one")?.seenAt).toBe(new Date(t0 + 61_000).toISOString());
  } finally {
    locks.mockRestore();
    setSystemTime();
  }
  // A SessionEnd of any reason ends the session: /clear and logout among them.
  handleHook("post-tool-use", ls("s-two"), env);
  handleHook(
    "session-end",
    {
      session_id: "s-one",
      cwd: root,
      hook_event_name: "SessionEnd",
      reason: "clear",
    } as HookPayload,
    env,
  );
  handleHook(
    "session-end",
    {
      session_id: "s-two",
      cwd: root,
      hook_event_name: "SessionEnd",
      reason: "logout",
    } as HookPayload,
    env,
  );
  for (const id of ["s-one", "s-two"]) {
    const ended = recordOf(paths, id)?.endedAt;
    expect(typeof ended, id).toBe("string");
    expect(Number.isNaN(Date.parse(String(ended))), id).toBe(false);
  }
  // Live within ten minutes of the last hook, not at eleven, never once ended.
  const liveSessions = (stateModule as Record<string, unknown>).liveSessions as
    | ((paths: CrewPaths, now: number) => unknown)
    | undefined;
  expect(typeof liveSessions).toBe("function");
  if (!liveSessions) return;
  const seen = Date.now();
  handleHook("post-tool-use", ls("s-three"), env);
  expect(liveIds(liveSessions(paths, seen + 9 * 60_000))).toContain("s-three");
  expect(liveIds(liveSessions(paths, seen + 11 * 60_000))).not.toContain("s-three");
  expect(liveIds(liveSessions(paths, seen + 60_000))).not.toContain("s-one");
  expect(liveIds(liveSessions(paths, seen + 60_000))).not.toContain("s-two");
  // A null entry and one whose seenAt is no date are dropped on load, never thrown on.
  const stateFile = join(paths.localDir, "state.json");
  const good = { baseline: null, stopBlocks: 0, cwd: root, seenAt: new Date().toISOString() };
  writeFileSync(
    stateFile,
    JSON.stringify({
      active: null,
      sessions: {
        "s-null": null,
        "s-bad-date": { baseline: null, stopBlocks: 0, cwd: root, seenAt: "yesterday" },
        "s-good": good,
      },
    }),
  );
  expect(() => loadState(paths)).not.toThrow();
  const loaded = loadState(paths).sessions;
  expect(Object.keys(loaded)).not.toContain("s-null");
  expect(Object.keys(loaded)).not.toContain("s-bad-date");
  expect(Object.keys(loaded)).toContain("s-good");
  expect(() => liveSessions(paths, Date.now())).not.toThrow();
  // The plugin wires the event to the engine's hook verb.
  const hooks = JSON.parse(
    readFileSync(
      join(import.meta.dir, "..", "..", "..", "plugins", "core", "hooks", "hooks.json"),
      "utf8",
    ),
  ) as { hooks: { SessionEnd?: { hooks: { command: string; args: string[] }[] }[] } };
  expect(hooks.hooks.SessionEnd?.[0]?.hooks[0]?.args.slice(1)).toEqual(["hook", "session-end"]);
});

const SESSION_START_HEAD = `WizardingCode Developer Crew is active in this repository. Work is proven by the \`crew\` command and the crew skill, and a turn cannot end while watched source files have unproven changes. You run every crew command; the user never types one: a decision that is theirs (crew approve, skip, decide, accept, profile confirm) is relayed by you from the conversation under this repository's policy (attendedDecisions: relay), so run the command once the user has said yes, with no prompt; the record says relayed by the agent. Engine: crew ${VERSION}.`;

test("LANE-AC-7-alone: a session alone gets today's PreToolUse answers and today's SessionStart and prompt context texts", () => {
  // The texts captured from the engine before the lanes change (2026-10-23), pinned as literals.
  const { root, env, paths } = lanesRepo();
  const p = { session_id: "alone-session-1", cwd: root };
  const write = (): HookPayload => ({
    ...p,
    tool_name: "Write",
    tool_input: { file_path: join(root, "src", "a.ts"), content: "y" },
  });
  const start = (): HookPayload => ({
    ...p,
    tool_name: "Bash",
    tool_input: { command: `crew start "x" --answers {}` },
  });
  expect(handleHook("session-start", { ...p, source: "startup" }, env)).toEqual({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `${SESSION_START_HEAD} No work item is active. A code change starts by answering the crew skill's nine typed questions, then crew start "<request>" --answers '<json>'.`,
    },
  });
  expect(handleHook("prompt", { ...p, prompt: "hi" }, env)).toEqual({});
  expect(handleHook("pre-tool-use", write(), env)).toEqual({});
  expect(handleHook("pre-tool-use", start(), env)).toEqual({});
  expect(handleHook("post-tool-use", start(), env)).toEqual({});
  const work = createWork(paths, "Add a total");
  addCriterion(work, "the total adds up");
  saveWork(paths, work);
  const id = work.id;
  expect(handleHook("session-start", { ...p, source: "startup" }, env)).toEqual({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: `${SESSION_START_HEAD} Work in progress: ${id} "Add a total", phase receive, route standard, not proven (gates have not run).`,
    },
  });
  expect(handleHook("prompt", { ...p, prompt: "hi" }, env)).toEqual({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: `Crew: work ${id} "Add a total", phase receive, route standard, not proven (gates have not run).`,
    },
  });
  expect(handleHook("pre-tool-use", write(), env)).toEqual({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `Crew: work ${id} is in phase receive on the standard route; source files change in the build phase (crew phase ${id} next)`,
    },
  });
  expect(handleHook("pre-tool-use", start(), env)).toEqual({});
  // In build, the session's own edit passes.
  work.phase = "build";
  saveWork(paths, work);
  expect(handleHook("pre-tool-use", write(), env)).toEqual({});
});

test("AC-1 (finding 131): lane reads the session state once, with a live neighbour to scan", () => {
  const { root, env, paths } = lanesRepo();
  const work = createWork(paths, "x");
  addCriterion(work, "a");
  saveWork(paths, work);
  // A live neighbour on the open item, and this session on it too
  stateModule.updateState(paths, (state) => {
    const now = new Date().toISOString();
    state.sessions.other = { seenAt: now, cwd: root, item: "another-item" } as never;
    state.sessions.me = { seenAt: now, cwd: root, item: work.id } as never;
  });
  const ctx = hookContext({ session_id: "me", cwd: root }, env);
  // liveSessions reads the state inside its own module, where a spy cannot count it: lane reads
  // the state once itself and takes the live sessions from that one read.
  const reads = spyOn(stateModule, "loadState");
  const live = spyOn(stateModule, "liveSessions");
  try {
    lane(ctx);
    expect(reads).toHaveBeenCalledTimes(1);
    expect(live).not.toHaveBeenCalled();
  } finally {
    reads.mockRestore();
    live.mockRestore();
  }
});
