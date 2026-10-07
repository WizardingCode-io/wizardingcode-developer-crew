import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { runGates } from "../src/gates.ts";
import { handleHook } from "../src/hooks/index.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { MAX_STOP_BLOCKS, onStop } from "../src/hooks/stop.ts";
import { loadState } from "../src/state.ts";
import { addCriterion, addSkip, createWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, tempDir, testEnv, write } from "./helpers.ts";

function session() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const ctx = hookContext({ session_id: "s", cwd: root }, env);
  onSessionStart(ctx);
  return { root, ctx, env };
}

test("C4: a new session that starts on unproven changes has no baseline, so they count", () => {
  const { root, ctx, env } = session();
  createWork(ctx.paths, "fix");
  write(root, "src/a.ts", "changed");
  const next = hookContext({ session_id: "s2", cwd: root }, env);
  onSessionStart(next, { source: "startup" });
  expect(loadState(next.paths).sessions.s2?.baseline).toBeNull();
  expect(onStop(next).decision).toBe("block");
});

test("C4: a resumed session keeps its baseline", () => {
  const { root, ctx } = session();
  const before = loadState(ctx.paths).sessions.s?.baseline;
  expect(before).toMatch(/^sha256:/);
  write(root, "src/a.ts", "changed");
  onSessionStart(ctx, { source: "resume" });
  expect(loadState(ctx.paths).sessions.s?.baseline).toBe(before);
  expect(onStop(ctx).decision).toBe("block");
  onSessionStart(ctx, { source: "compact" });
  expect(loadState(ctx.paths).sessions.s?.baseline).toBe(before);
});

test("case 1: nothing changed, the turn ends", () => {
  const { ctx } = session();
  expect(onStop(ctx)).toEqual({});
});

test("case 4 then 5: unproven changes block, and the third block is the last", () => {
  const { root, ctx } = session();
  write(root, "src/a.ts", "changed");
  for (let i = 1; i <= MAX_STOP_BLOCKS; i++) {
    const response = onStop(ctx);
    expect(response.decision).toBe("block");
    expect(String(response.reason)).toContain("no work item");
    expect(loadState(ctx.paths).sessions.s?.stopBlocks).toBe(i);
  }
  const notice = onStop(ctx);
  expect(notice.decision).toBeUndefined();
  expect(String(notice.systemMessage)).toMatch(/not proven after 3 attempts/);
});

test("case 3: a work item waiting for the user lets the turn end with a notice", () => {
  const { root, ctx } = session();
  const work = createWork(ctx.paths, "fix");
  write(root, "src/a.ts", "changed");
  expect(onStop(ctx).decision).toBe("block");
  work.awaiting = "user";
  saveWork(ctx.paths, work);
  const response = onStop(ctx);
  expect(response.decision).toBeUndefined();
  expect(String(response.systemMessage)).toContain(work.id);
  expect(loadState(ctx.paths).sessions.s?.stopBlocks).toBe(0);
});

test("case 2: proven work ends the turn, and a later edit blocks again", async () => {
  const { root, ctx } = session();
  const work = createWork(ctx.paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  addSkip(work, "tdd:AC-1", "manual");
  write(root, "src/a.ts", "changed");
  saveWork(ctx.paths, work);
  expect(onStop(ctx).decision).toBe("block");
  const outcome = await runGates(ctx.paths, work, ctx.profile, ctx.policy);
  saveWork(ctx.paths, work);
  expect(outcome.verdict).toBe("proven");
  expect(onStop(ctx)).toEqual({});
  expect(loadState(ctx.paths).sessions.s?.stopBlocks).toBe(0);
  write(root, "src/a.ts", "changed again");
  expect(String(onStop(ctx).reason)).toContain("code changed since the last gate run");
});

test("C3: in a plain folder the hooks stay silent and write nothing", () => {
  const dir = tempDir();
  write(dir, "src/a.ts", "x");
  expect(handleHook("stop", { session_id: "s", cwd: dir }, testEnv())).toEqual({});
  expect(handleHook("prompt", { session_id: "s", cwd: dir }, testEnv())).toEqual({});
  expect(
    handleHook(
      "pre-tool-use",
      { session_id: "s", cwd: dir, tool_name: "Bash", tool_input: { command: "crew skip x lint" } },
      testEnv(),
    ),
  ).toEqual({});
  expect(handleHook("session-start", { session_id: "s", cwd: dir }, testEnv())).toEqual({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext:
        "Crew is inactive here: not a git repository and no .crew/ folder. Run crew detect in a project root to activate it.",
    },
  });
  expect(existsSync(join(dir, ".crew"))).toBe(false);
});

test("handleHook dispatches by event and never throws", () => {
  const { root } = session();
  expect(handleHook("stop", { session_id: "s", cwd: root }, testEnv())).toEqual({});
  expect(handleHook("nonsense", { cwd: root }, testEnv())).toEqual({});
  expect(handleHook("prompt", { cwd: "/nonexistent/path/for/crew" }, testEnv())).toEqual({});
});
