import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { onPrompt } from "../src/hooks/prompt.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { loadState } from "../src/state.ts";
import { addCriterion, createWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, testEnv } from "./helpers.ts";

function context(root: string, env = testEnv()) {
  return hookContext({ session_id: "s1", cwd: join(root, "src") }, env);
}

test("session start detects the profile, records the baseline and describes the state", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const ctx = context(root);
  const response = onSessionStart(ctx);
  expect(existsSync(join(root, ".crew", "profile.json"))).toBe(true);
  expect(existsSync(join(root, ".crew", ".gitignore"))).toBe(true);
  const session = loadState(ctx.paths).sessions.s1;
  expect(session?.baseline).toMatch(/^sha256:/);
  expect(session?.stopBlocks).toBe(0);
  const text = (response.hookSpecificOutput as { additionalContext: string }).additionalContext;
  expect(text).toContain("crew start");
  expect(text).toContain("No work item is active");
  expect(text.length).toBeLessThan(900);
});

test("session start reports a missing test command and the work in progress", () => {
  const root = makeRepo({ Makefile: "test:\n\ttrue\n", "src/a.c": "x" });
  const ctx = context(root);
  const work = createWork(ctx.paths, "Fix the build");
  addCriterion(work, "x");
  saveWork(ctx.paths, work);
  const text = (onSessionStart(ctx).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(text).toContain("No test command is known");
  expect(text).toContain(`Work in progress: ${work.id}`);
  expect(text).toContain("not proven");
});

test("the prompt hook adds one status line only while work is active", () => {
  const root = makeRepo({ "src/a.ts": "x" });
  const ctx = context(root);
  expect(onPrompt(ctx)).toEqual({});
  createWork(ctx.paths, "Thing");
  const text = (onPrompt(ctx).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(text).toMatch(/^Crew: work \S+ "Thing", phase receive, route standard, not proven/);
  expect(text.split("\n")).toHaveLength(1);
});
