import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmdirSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { handleHook } from "../src/hooks/index.ts";
import { onPostToolUse } from "../src/hooks/post-tool-use.ts";
import { onPrompt } from "../src/hooks/prompt.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { onStop } from "../src/hooks/stop.ts";
import { onSubagentStop } from "../src/hooks/subagent-stop.ts";
import { addCriterion, createWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, testEnv, write } from "./helpers.ts";

const PLUGIN = "wizardingcode-developer-crew";

function session() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const ctx = hookContext({ session_id: "s", cwd: root }, env);
  onSessionStart(ctx);
  const work = createWork(ctx.paths, "Delete accounts");
  addCriterion(work, "x");
  saveWork(ctx.paths, work);
  return { root, env, ctx, work };
}

// Five stops, each waiting the lock's two seconds: hence the test's own timeout.
test("SP2c AC-3: what a role's stop could not save is a notice the session reads at its next tool call, prompt or blocked turn end", () => {
  const { root, env, ctx, work } = session();
  // A SubagentStop hook's output never reaches the parent session's model (Claude Code shows
  // `systemMessage` to the person), so the engine keeps the note and prints it where the model reads.
  const lock = join(root, ".crew", "work", work.id, ".lock");
  mkdirSync(lock);
  // Each stop meets a lock still fresh (a stale one, ten seconds old, would be taken).
  const stop = (id: string) => {
    utimesSync(lock, new Date(), new Date());
    return onSubagentStop(ctx, {
      agent_id: id,
      agent_type: `${PLUGIN}:review-risk`,
      last_assistant_message: "# risk findings\n## Findings\n- none\n",
    });
  };
  const first = stop("r1");
  expect(first.systemMessage).toContain("Crew: review-risk stopped but nothing was saved");
  // A subagent's own tool call runs the hook too, under the parent's session id with the agent's
  // id beside it: the notices are the lead's, so a sibling role still running takes none of them.
  expect(
    onPostToolUse(ctx, {
      agent_id: "r2",
      agent_type: `${PLUGIN}:review-security`,
      tool_name: "Bash",
      tool_input: { command: "ls" },
    }),
  ).toEqual({});
  // The next tool call of the session prints the notice once, as context the model reads.
  expect(onPostToolUse(ctx, { tool_name: "Bash", tool_input: { command: "ls" } })).toEqual({
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: first.systemMessage },
  });
  expect(onPostToolUse(ctx, { tool_name: "Bash", tool_input: { command: "ls" } })).toEqual({});
  // Two notices in a row are printed together, by the prompt hook when no tool call came first.
  const second = stop("r2");
  const third = stop("r3");
  const prompt = onPrompt(ctx) as { hookSpecificOutput: { additionalContext: string } };
  expect(prompt.hookSpecificOutput.additionalContext).toContain(
    `${second.systemMessage} ${third.systemMessage}`,
  );
  expect(onPrompt(ctx) as object).not.toHaveProperty(
    "hookSpecificOutput.additionalContext",
    expect.stringContaining("nothing was saved"),
  );
  // A blocked turn end carries the notice in its reason.
  const fourth = stop("r4");
  write(root, "src/a.ts", "changed");
  const blocked = onStop(ctx) as { decision?: string; reason?: string };
  expect(blocked.decision).toBe("block");
  expect(blocked.reason).toContain(fourth.systemMessage as string);
  expect(onPostToolUse(ctx, { tool_name: "Bash", tool_input: { command: "ls" } })).toEqual({});
  // Another session of the same checkout has notices of its own.
  const other = hookContext({ session_id: "other", cwd: root }, env);
  stop("r5");
  expect(onPostToolUse(other, { tool_name: "Bash", tool_input: { command: "ls" } })).toEqual({});
  // Through the dispatcher, with the payload a hook receives.
  expect(
    handleHook(
      "post-tool-use",
      { cwd: root, session_id: "s", tool_name: "Write", tool_input: { file_path: "x" } },
      env,
    ),
  ).toMatchObject({
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      additionalContext: expect.stringContaining("Crew: review-risk stopped but nothing was saved"),
    },
  });
  rmdirSync(lock);
  // The plugin wires the event to the tools a lead uses between launching the roles and recording.
  const hooks = JSON.parse(
    readFileSync(
      join(import.meta.dir, "..", "..", "..", "plugins", "core", "hooks", "hooks.json"),
      "utf8",
    ),
  ) as {
    hooks: { PostToolUse?: { matcher: string; hooks: { command: string; args: string[] }[] }[] };
  };
  const entry = hooks.hooks.PostToolUse?.[0];
  expect(entry?.matcher).toBe("Agent|Bash|Write|Edit");
  expect(entry?.hooks[0]?.args.slice(1)).toEqual(["hook", "post-tool-use"]);
}, 30_000);

test("SP2c AC-3: every writer of the session's state takes the local folder's lock, waits half a second for one held, and then goes on rather than fail open", () => {
  const { root, ctx, work } = session();
  // A role's stop leaves its notice under this lock; a hook that loaded the state before it and
  // saved after it would write the notice away. Held fresh, the lock delays each writer; it never
  // stops one, since a hook that failed here would fail open and skip its rule.
  const lock = join(root, ".crew", "local", ".lock");
  mkdirSync(lock);
  // The lock is dated a minute ahead: a writer that stats it computes a negative age and never takes
  // it as stale, however long the hook's work before the lock takes under load (finding 55).
  const ahead = () => new Date(Date.now() + 60_000);
  const timed = (run: () => unknown): number => {
    utimesSync(lock, ahead(), ahead());
    const started = Date.now();
    run();
    return Date.now() - started;
  };
  // Nothing pending: nothing written, so no lock to wait for.
  const stateFile = join(root, ".crew", "local", "state.json");
  const written = statSync(stateFile).mtimeMs;
  onPostToolUse(ctx, { tool_name: "Bash", tool_input: { command: "ls" } });
  expect(statSync(stateFile).mtimeMs).toBe(written);
  expect(timed(() => onPrompt(ctx))).toBeGreaterThanOrEqual(500);
  expect(timed(() => onStop(ctx))).toBeGreaterThanOrEqual(500);
  expect(timed(() => onSessionStart(ctx, { source: "startup" }))).toBeGreaterThanOrEqual(500);
  // The stop's own notice, the write the lock exists to protect: the work folder's lock held fresh
  // makes the stop fail after its two seconds, and the notice then waits for this lock (half a
  // second more) before it is written.
  const workLock = join(root, ".crew", "work", work.id, ".lock");
  mkdirSync(workLock);
  expect(
    timed(() => {
      utimesSync(workLock, ahead(), ahead());
      return onSubagentStop(ctx, {
        agent_id: "r1",
        agent_type: `${PLUGIN}:review-risk`,
        last_assistant_message: "# risk findings\n## Findings\n- none\n",
      });
    }),
  ).toBeGreaterThanOrEqual(2500);
  rmdirSync(workLock);
  // The CLI's crew start, setting the active item.
  expect(timed(() => createWork(ctx.paths, "Another"))).toBeGreaterThanOrEqual(500);
  rmdirSync(lock);
  // The notice went through the held lock, and the lead's next tool call reads it.
  expect(onPostToolUse(ctx, { tool_name: "Bash", tool_input: { command: "ls" } })).toMatchObject({
    hookSpecificOutput: {
      additionalContext: expect.stringContaining("Crew: review-risk stopped but nothing was saved"),
    },
  });
  write(root, "src/a.ts", "changed");
  // The Stop rule still ran: the change is unproven, so the turn is blocked.
  expect(onStop(ctx)).toMatchObject({ decision: "block" });
}, 15_000);
