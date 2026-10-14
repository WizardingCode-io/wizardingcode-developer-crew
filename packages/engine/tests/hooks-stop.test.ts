import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEvidence, renderReport } from "../src/evidence.ts";
import { runGates } from "../src/gates.ts";
import { handleHook } from "../src/hooks/index.ts";
import { onPrompt } from "../src/hooks/prompt.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { MAX_STOP_BLOCKS, onStop } from "../src/hooks/stop.ts";
import { loadState } from "../src/state.ts";
import type { WorkItem } from "../src/types.ts";
import { addCriterion, addSkip, createWork, loadWork, saveWork } from "../src/work.ts";
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

test("I3: a prompt re-arms the Stop rule and leaves the wait to the Stop that ends the turn", () => {
  const { root, ctx } = session();
  const work = createWork(ctx.paths, "fix");
  write(root, "src/a.ts", "changed");
  for (let i = 1; i <= MAX_STOP_BLOCKS; i++) expect(onStop(ctx).decision).toBe("block");
  expect(onStop(ctx).decision).toBeUndefined();
  work.awaiting = "user";
  saveWork(ctx.paths, work);
  onPrompt(ctx);
  expect(loadWork(ctx.paths, work.id).work?.awaiting).toBe("user");
  expect(loadState(ctx.paths).sessions.s?.stopBlocks).toBe(0);
  expect(onStop(ctx).decision).toBeUndefined();
  expect(loadWork(ctx.paths, work.id).work?.awaiting).toBeNull();
  expect(onStop(ctx).decision).toBe("block");
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

test("finding 11: the block names crew await as the way to end a turn with a question", () => {
  const { root, ctx } = session();
  write(root, "src/a.ts", "changed");
  expect(String(onStop(ctx).reason)).not.toContain("crew await");
  const work = createWork(ctx.paths, "fix");
  const response = onStop(ctx);
  expect(response.decision).toBe("block");
  expect(String(response.reason)).toContain(
    `To end the turn with a question for the user, run crew await ${work.id} user first.`,
  );
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
  // The turn that ends spends the wait and leaves the pause in the record.
  const saved = loadWork(ctx.paths, work.id).work;
  expect(saved?.awaiting).toBeNull();
  expect(saved?.pauses).toHaveLength(1);
  expect(typeof saved?.pauses?.[0]?.reason).toBe("string");
  const report = renderReport(
    saved as WorkItem,
    loadEvidence(ctx.paths, work.id).evidence,
    ctx.policy,
  );
  expect(report).toContain("## Decisions");
  expect(report).toContain("paused for the user");
  expect(onStop(ctx).decision).toBe("block");
});

test("case 3: a prompt queued during the turn does not end the wait before the Stop honours it", () => {
  const { root, ctx } = session();
  const work = createWork(ctx.paths, "fix");
  write(root, "src/a.ts", "changed");
  work.awaiting = "user";
  saveWork(ctx.paths, work);
  // The user typed while the agent was still working: Claude Code runs the prompt hook at once.
  const prompt = onPrompt(ctx);
  const context = (prompt.hookSpecificOutput as { additionalContext?: string } | undefined)
    ?.additionalContext;
  expect(String(context)).toContain("waiting for the user");
  const response = onStop(ctx);
  expect(response.decision).toBeUndefined();
  expect(String(response.systemMessage)).toContain(work.id);
  expect(String(response.systemMessage)).toContain("not proven");
  expect(loadWork(ctx.paths, work.id).work?.awaiting).toBeNull();
  expect(onStop(ctx).decision).toBe("block");
});

test("case 2: a wait on proven work is spent when the turn ends", async () => {
  const { root, ctx } = session();
  const work = createWork(ctx.paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  addSkip(work, "tdd:AC-1", "manual");
  write(root, "src/a.ts", "changed");
  await runGates(ctx.paths, work, ctx.profile, ctx.policy);
  work.awaiting = "user";
  saveWork(ctx.paths, work);
  expect(onStop(ctx)).toEqual({});
  const saved = loadWork(ctx.paths, work.id).work;
  expect(saved?.awaiting).toBeNull();
  expect(saved?.pauses ?? []).toEqual([]);
});

test("C4: a session after a released wait starts without a baseline and blocks again", () => {
  const { root, ctx, env } = session();
  const work = createWork(ctx.paths, "fix");
  write(root, "src/a.ts", "changed");
  work.awaiting = "user";
  saveWork(ctx.paths, work);
  expect(onStop(ctx).decision).toBeUndefined();
  const next = hookContext({ session_id: "s2", cwd: root }, env);
  const started = onSessionStart(next, { source: "startup" });
  const context = (started.hookSpecificOutput as { additionalContext?: string } | undefined)
    ?.additionalContext;
  expect(String(context)).toMatch(/not proven/);
  expect(loadState(next.paths).sessions.s2?.baseline).toBeNull();
  expect(onStop(next).decision).toBe("block");
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

test("finding 22: a message that tells the user to type a crew command cannot end the turn", () => {
  const { ctx } = session();
  const asks = (last_assistant_message: string) => onStop(ctx, { last_assistant_message });
  // Nothing changed in the tree, so the proof rule alone would let the turn end.
  const blocked = asks(
    "Cola esta linha tal como está, com o `!`:\n\n```\n! crew approve w1 spec\n```\n",
  );
  expect(blocked.decision).toBe("block");
  expect(String(blocked.reason)).toContain("the permission prompt is the user's signature");
  expect(String(blocked.reason)).toContain("never");
  expect(loadState(ctx.paths).sessions.s?.stopBlocks).toBe(1);
  // A sentence ending with ! before the word crew is prose; the agent's own commands are not asks.
  // Each of these ends the turn as before, which also resets the block count.
  expect(asks("The hook refused it! crew approve ran again and the prompt appeared.")).toEqual({});
  expect(asks("I ran `crew approve w1 spec`; the record says by the user.")).toEqual({});
  expect(asks("")).toEqual({});
  expect(onStop(ctx)).toEqual({});
  expect(loadState(ctx.paths).sessions.s?.stopBlocks).toBe(0);
  expect(asks("Paste `! crew skip w1 gate:test --reason x` to close it.").decision).toBe("block");
  expect(asks("Run `!crew accept w1` in your terminal.").decision).toBe("block");
  expect(asks("Then: `! node /x/dist/crew.mjs approve w1 spec`").decision).toBe("block");
  expect(loadState(ctx.paths).sessions.s?.stopBlocks).toBe(MAX_STOP_BLOCKS);
});

test("finding 22: the guard counts toward the three-block cap and does not spend a wait", () => {
  const { ctx } = session();
  const work = createWork(ctx.paths, "fix");
  work.awaiting = "user";
  saveWork(ctx.paths, work);
  const payload = { last_assistant_message: "! crew approve w1 spec" };
  for (let i = 1; i <= MAX_STOP_BLOCKS; i++) {
    expect(onStop(ctx, payload).decision).toBe("block");
    expect(loadState(ctx.paths).sessions.s?.stopBlocks).toBe(i);
  }
  expect(loadWork(ctx.paths, work.id).work?.awaiting).toBe("user");
  // After the cap the ordinary rules decide, so the session cannot loop.
  expect(onStop(ctx, payload).decision).toBeUndefined();
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
