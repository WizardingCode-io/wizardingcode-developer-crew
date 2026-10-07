import { expect, test } from "bun:test";
import { runGates } from "../src/gates.ts";
import { buildContext } from "../src/hooks/context.ts";
import { handleHook } from "../src/hooks/index.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { MAX_STOP_BLOCKS, onStop } from "../src/hooks/stop.ts";
import { loadState } from "../src/state.ts";
import { addCriterion, addSkip, createWork, saveWork } from "../src/work.ts";
import { makeRepo, testEnv, write } from "./helpers.ts";

function session() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const ctx = buildContext({ session_id: "s", cwd: root }, testEnv());
  onSessionStart(ctx);
  return { root, ctx };
}

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

test("handleHook dispatches by event and never throws", () => {
  const { root } = session();
  expect(handleHook("stop", { session_id: "s", cwd: root }, testEnv())).toEqual({});
  expect(handleHook("nonsense", { cwd: root }, testEnv())).toEqual({});
  expect(handleHook("prompt", { cwd: "/nonexistent/path/for/crew" }, testEnv())).toEqual({});
});
