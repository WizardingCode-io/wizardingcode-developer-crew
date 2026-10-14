import { expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_WATCH_EXCLUDE } from "../src/detect/index.ts";
import { onPrompt } from "../src/hooks/prompt.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { loadProfile, saveProfile } from "../src/profile.ts";
import { loadState } from "../src/state.ts";
import { addCriterion, createWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, testEnv } from "./helpers.ts";

function context(root: string, env = testEnv()) {
  return hookContext({ session_id: "s1", cwd: join(root, "src") }, env);
}

test("finding 22: the session context says who runs crew commands and how the user signs", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  // Under the policy that prompts; the default relays (ADR 0005, 0.3.0) and is tested below.
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(
    join(root, ".crew", "policy.json"),
    JSON.stringify({ attendedDecisions: "prompt" }),
  );
  const text = (onSessionStart(context(root)).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(text).toContain("You run every crew command; the user never types one");
  expect(text).toContain("signed by the permission prompt");
});

test("0.3.0: a session start follows the manifests and says what the profile picked up", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { build: "true" } }),
    "src/a.ts": "x",
  });
  const first = context(root);
  onSessionStart(first);
  expect(loadProfile(first.paths).profile?.targets[0]?.gates.test).toBeUndefined();
  // The project gained a test script between sessions.
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ scripts: { build: "true", test: "exit 0" } }),
  );
  const next = hookContext({ session_id: "s2", cwd: root }, testEnv());
  const text = (
    onSessionStart(next, { source: "startup" }).hookSpecificOutput as {
      additionalContext: string;
    }
  ).additionalContext;
  expect(text).toContain("profile refreshed: test (.): npm run test");
  expect(loadProfile(next.paths).profile?.targets[0]?.gates.test).toEqual({
    command: "npm run test",
    source: "detected",
  });
  expect(next.profile.targets[0]?.gates.test?.command).toBe("npm run test");
  // Nothing new: nothing said.
  const quiet = (
    onSessionStart(hookContext({ session_id: "s3", cwd: root }, testEnv()), {
      source: "startup",
    }).hookSpecificOutput as { additionalContext: string }
  ).additionalContext;
  expect(quiet).not.toContain("profile refreshed");
});

test("ADR 0005: under relay the session context says the user's yes in the conversation is the signature", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(join(root, ".crew", "policy.json"), JSON.stringify({ attendedDecisions: "relay" }));
  const text = (onSessionStart(context(root)).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(text).toContain("You run every crew command; the user never types one");
  expect(text).toContain("relayed by you from the conversation");
  expect(text).toContain("no prompt");
  expect(text).not.toContain("signed by the permission prompt");
});

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
  expect(text).toContain(
    "No work item is active. A code change starts by answering the crew skill's nine typed questions, then crew start \"<request>\" --answers '<json>'.",
  );
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

test("finding 12: a watch list left by an earlier release follows the current default at session start", () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const env = testEnv();
  const former = ["**/*.md", "docs/**", ".crew/**"];
  const first = context(root, env);
  saveProfile(first.paths, { ...first.profile, watch: { exclude: [...former] } });
  const ctx = context(root, env);
  expect(ctx.profile.watch.exclude).toEqual(former);
  const text = (onSessionStart(ctx).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(text).toContain(
    "The profile's watch list predated this release and now follows the current default",
  );
  expect(text).not.toContain("crew detect --refresh");
  expect(loadProfile(ctx.paths).profile?.watch.exclude).toEqual(DEFAULT_WATCH_EXCLUDE);
  expect(ctx.profile.watch.exclude).toEqual(DEFAULT_WATCH_EXCLUDE);
  // A list the user chose is theirs.
  saveProfile(ctx.paths, { ...ctx.profile, watch: { exclude: ["**/*.md", "generated/**"] } });
  const custom = context(root, env);
  const kept = (onSessionStart(custom).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(kept).not.toContain("watch list");
  expect(loadProfile(custom.paths).profile?.watch.exclude).toEqual(["**/*.md", "generated/**"]);
  // A profile changed outside the engine is left as it is, with the hint to refresh it.
  writeFileSync(
    join(root, ".crew", "profile.json"),
    JSON.stringify({ ...ctx.profile, watch: { exclude: former } }),
  );
  const tampered = context(root, env);
  expect(tampered.tampered).toBe(true);
  const hint = (onSessionStart(tampered).hookSpecificOutput as { additionalContext: string })
    .additionalContext;
  expect(hint).toContain("run `crew detect --refresh` once");
  expect(loadProfile(tampered.paths).profile?.watch.exclude).toEqual(former);
});
