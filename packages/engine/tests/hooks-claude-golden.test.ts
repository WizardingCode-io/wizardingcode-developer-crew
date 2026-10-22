import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { leaveNotice } from "../src/hooks/notices.ts";
import { MAX_STOP_BLOCKS } from "../src/hooks/stop.ts";
import { addCriterion, createWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

// SP6 Task 4 AC-9: the Claude Code hook path, pinned per event in a named state, and equal byte for
// byte to `--runtime claude` (the table's first row is today's code).

function cli(cwd: string, env: NodeJS.ProcessEnv) {
  return async (stdin: string, ...argv: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const io: CliIo = {
      stdout: (t) => out.push(t),
      stderr: (t) => err.push(t),
      stdin: async () => stdin,
      env,
      cwd,
    };
    const code = await main(argv, io);
    return { code, out: out.join(""), err: err.join("") };
  };
}

/** Both forms of the hook command on the same payload: today's bytes, and the same bytes through the table. */
async function both(
  run: ReturnType<typeof cli>,
  event: string,
  payload: unknown,
): Promise<Record<string, unknown>> {
  const stdin = typeof payload === "string" ? payload : JSON.stringify(payload);
  const plain = await run(stdin, "hook", event);
  const claude = await run(stdin, "hook", event, "--runtime", "claude");
  expect(plain.code, event).toBe(0);
  expect(plain.err, event).toBe("");
  expect(claude, event).toEqual(plain);
  return JSON.parse(plain.out);
}

test("SP6-T4 AC-9: the golden rows of crew hook per event, each in its state, unchanged and equal to --runtime claude", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(
    join(root, ".crew", "policy.json"),
    JSON.stringify({ attendedDecisions: "prompt" }),
  );
  const env = testEnv();
  const run = cli(root, env);
  const paths = repoPaths(root, env);
  const work = createWork(paths, "fix");
  addCriterion(work, "x");
  saveWork(paths, work);
  const session = { session_id: "g1", cwd: root };
  // session-start: the context names the item.
  const started = await both(run, "session-start", { ...session, source: "startup" });
  expect(started).toMatchObject({ hookSpecificOutput: { hookEventName: "SessionStart" } });
  expect((started.hookSpecificOutput as { additionalContext: string }).additionalContext).toContain(
    `Work in progress: ${work.id}`,
  );
  // prompt: the status line.
  const prompted = await both(run, "prompt", { ...session, prompt: "go" });
  expect(prompted).toMatchObject({ hookSpecificOutput: { hookEventName: "UserPromptSubmit" } });
  expect(
    (prompted.hookSpecificOutput as { additionalContext: string }).additionalContext,
  ).toContain(`Crew: work ${work.id}`);
  // pre-tool-use: a deny on the item's evidence file, and an ask on a person-only command under prompt.
  const owned = `.crew/work/${work.id}/evidence.json`;
  expect(
    await both(run, "pre-tool-use", {
      ...session,
      tool_name: "Write",
      tool_input: { file_path: owned },
    }),
  ).toEqual({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: `Crew: ${owned} is maintained by the engine and is changed through the crew command`,
    },
  });
  const asked = await both(run, "pre-tool-use", {
    ...session,
    tool_name: "Bash",
    tool_input: { command: `crew approve ${work.id} spec` },
    permission_mode: "default",
  });
  expect(asked).toMatchObject({
    hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask" },
  });
  // post-tool-use: nothing to say is {}; a notice left for the session comes back as context, once
  // (a notice is taken by the hook that prints it, so the two forms are run on two notices).
  expect(
    await both(run, "post-tool-use", {
      ...session,
      tool_name: "Bash",
      tool_input: { command: "ls" },
    }),
  ).toEqual({});
  leaveNotice(hookContext({ session_id: "g1", cwd: root }, env), "Crew: note two");
  const noted = await run(
    JSON.stringify({ ...session, tool_name: "Bash", tool_input: { command: "ls" } }),
    "hook",
    "post-tool-use",
  );
  expect(noted.out).toBe(
    `${JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "Crew: note two" } })}\n`,
  );
  leaveNotice(hookContext({ session_id: "g1", cwd: root }, env), "Crew: note three");
  const notedByTable = await run(
    JSON.stringify({ ...session, tool_name: "Bash", tool_input: { command: "ls" } }),
    "hook",
    "post-tool-use",
    "--runtime",
    "claude",
  );
  expect(notedByTable.out).toBe(noted.out.replace("note two", "note three"));
  // stop: unproven changes block, the third block is the last, then the release says so.
  write(root, "src/a.ts", "changed");
  for (let i = 1; i <= MAX_STOP_BLOCKS; i++) {
    const stopped = await run(JSON.stringify(session), "hook", "stop");
    const parsed = JSON.parse(stopped.out) as { decision?: string; reason?: string };
    expect(parsed.decision, `block ${i}`).toBe("block");
    expect(parsed.reason, `block ${i}`).toContain(
      "Crew: watched source files changed and the work is not proven.",
    );
  }
  const released = JSON.parse((await run(JSON.stringify(session), "hook", "stop")).out) as {
    decision?: string;
    systemMessage?: string;
  };
  expect(released.decision).toBeUndefined();
  expect(released.systemMessage).toMatch(/not proven after 3 attempts/);
  // The same state through the table: another session, the same four answers.
  const other = { session_id: "g2", cwd: root };
  await run(JSON.stringify({ ...other, source: "startup" }), "hook", "session-start");
  for (let i = 1; i <= MAX_STOP_BLOCKS; i++) {
    const stopped = JSON.parse(
      (await run(JSON.stringify(other), "hook", "stop", "--runtime", "claude")).out,
    ) as { decision?: string };
    expect(stopped.decision, `table block ${i}`).toBe("block");
  }
  expect(
    (
      JSON.parse((await run(JSON.stringify(other), "hook", "stop", "--runtime", "claude")).out) as {
        systemMessage?: string;
      }
    ).systemMessage,
  ).toMatch(/not proven after 3 attempts/);
  // subagent-stop: a role with no answer, said in a systemMessage.
  expect(
    await both(run, "subagent-stop", {
      ...session,
      agent_id: "r1",
      agent_type: "wizardingcode-developer-crew:review-risk",
      agent_transcript_path: "/tmp/r1.jsonl",
      last_assistant_message: "",
    }),
  ).toEqual({
    systemMessage:
      "Crew: review-risk stopped with no answer (no hand-back in its last turn): its end is recorded with no file; an earlier file of this role, if any, is not this round's answer. Run the role again or save its answer from the transcript (/tmp/r1.jsonl).",
  });
  // An unknown event: {}. Garbage stdin is an empty payload, judged in the command's folder: {} where nothing is unproven.
  expect(await both(run, "no-such-event", session)).toEqual({});
  const clean = cli(makeRepo(), env);
  expect(await both(clean, "stop", "{not json")).toEqual({});
  expect(await both(clean, "pre-tool-use", "")).toEqual({});
});
