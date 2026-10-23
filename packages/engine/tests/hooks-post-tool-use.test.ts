import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmdirSync, statSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import { handleHook } from "../src/hooks/index.ts";
import { onPostToolUse } from "../src/hooks/post-tool-use.ts";
import { onPrompt } from "../src/hooks/prompt.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { onStop } from "../src/hooks/stop.ts";
import { onSubagentStop } from "../src/hooks/subagent-stop.ts";
import type { HookPayload } from "../src/hooks/types.ts";
import { loadState } from "../src/state.ts";
import { addCriterion, createWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

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

/** A fast chore, so a real crew start makes an item with no question asked. */
const START_ANSWERS = JSON.stringify({
  work_type: "chore",
  is_vague: 0.1,
  scope: 0,
  touches_auth: 0,
  touches_payments: 0,
  touches_personal_data: 0,
  touches_data_migration: 0,
  touches_infra: 0,
  touches_public_api: 0,
});

/** A checkout, its sessions' hooks as Claude Code runs them, and the crew command run in process. */
function lanes() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const paths = repoPaths(root, env);
  const crew = async (...argv: string[]) => {
    const out: string[] = [];
    const err: string[] = [];
    const io: CliIo = {
      stdout: (t) => out.push(t),
      stderr: (t) => err.push(t),
      stdin: async () => "",
      env,
      cwd: root,
    };
    const code = await main(argv, io);
    return { code, out: out.join(""), err: err.join("") };
  };
  const bash = (session_id: string, command: string, stdout = ""): HookPayload =>
    ({
      session_id,
      cwd: root,
      tool_name: "Bash",
      tool_input: { command },
      tool_response: { stdout, stderr: "", interrupted: false },
    }) as HookPayload;
  const pre = (session: string, command: string) =>
    handleHook("pre-tool-use", bash(session, command), env);
  const post = (session: string, command: string, stdout: string) =>
    handleHook("post-tool-use", bash(session, command, stdout), env);
  const itemOf = (session: string) =>
    (loadState(paths).sessions[session] as { item?: unknown } | undefined)?.item;
  /** A real crew start between the session's two hooks: the id of the item it made. */
  const started = async (session: string, command: string, title: string) => {
    pre(session, command);
    const run = await crew(
      "start",
      title,
      "--answers",
      START_ANSWERS,
      "--criterion",
      "x",
      "--json",
    );
    expect(run.code, run.err).toBe(0);
    const id = (JSON.parse(run.out) as { id: string }).id;
    post(session, command, `started ${id}`);
    return id;
  };
  return { root, env, paths, crew, pre, post, itemOf, started };
}

test("LANE-AC-2: the item a crew start makes is the creating session's own item, whatever the command's spelling", async () => {
  // Each spelling in a checkout of its own: a second session beside a live one is refused (AC-3).
  const spellings = [
    (_root: string) => `crew start "Add a total" --answers '${START_ANSWERS}'`,
    (root: string) => `cd "${root}" && crew start "Add a total" --answers '${START_ANSWERS}'`,
    (_root: string) =>
      `"/opt/wizardingcode/bin/crew" start "Add a total" --answers '${START_ANSWERS}'`,
  ];
  for (const spelling of spellings) {
    const { root, itemOf, started } = lanes();
    const command = spelling(root);
    const id = await started("s-start", command, "Add a total");
    expect(itemOf("s-start"), command).toBe(id);
  }
});

test("LANE-AC-2: a command that only prints started <id>, a refused crew start and an item created before the command's PreToolUse set nothing", async () => {
  const { paths, crew, pre, post, itemOf, started } = lanes();
  const held = await started(
    "s-owner",
    `crew start "Add a total" --answers '${START_ANSWERS}'`,
    "Add a total",
  );
  expect(itemOf("s-owner")).toBe(held);
  // Another session's command prints the owner's item without starting anything.
  pre("s-echo", `echo "started ${held}"`);
  post("s-echo", `echo "started ${held}"`, `started ${held}`);
  expect(itemOf("s-echo")).toBeUndefined();
  // An item already active before this session's PreToolUse (made outside any hook) is stale: a
  // refused crew start (no new item) leaves the session with nothing, whatever the output says.
  const outside = await crew(
    "start",
    "Made outside",
    "--answers",
    START_ANSWERS,
    "--criterion",
    "x",
    "--json",
  );
  expect(outside.code, outside.err).toBe(0);
  const stale = (JSON.parse(outside.out) as { id: string }).id;
  Bun.sleepSync(5);
  const refusedCommand = `crew start "Again" --answers '{"work_type":"bug"}'`;
  pre("s-refused", refusedCommand);
  const refused = await crew("start", "Again", "--answers", '{"work_type":"bug"}');
  expect(refused.code).toBe(1);
  post("s-refused", refusedCommand, `started ${stale}`);
  expect(itemOf("s-refused")).toBeUndefined();
  // The checkout's active item is the stale one, and it stays nobody's.
  expect(loadState(paths).active).toBe(stale);
  expect(itemOf("s-owner")).toBe(held);
});

test("LANE-AC-2: an item another live session holds is never claimed", async () => {
  const { crew, pre, post, itemOf } = lanes();
  const command = `crew start "Add a total" --answers '${START_ANSWERS}'`;
  // B's PreToolUse comes first, then A's, then A's start makes the item and A's PostToolUse claims it.
  pre("s-b", command);
  pre("s-a", command);
  const run = await crew(
    "start",
    "Add a total",
    "--answers",
    START_ANSWERS,
    "--criterion",
    "x",
    "--json",
  );
  expect(run.code, run.err).toBe(0);
  const id = (JSON.parse(run.out) as { id: string }).id;
  post("s-a", command, `started ${id}`);
  expect(itemOf("s-a")).toBe(id);
  // B's PostToolUse finds the item made after its PreToolUse, but A, live, holds it.
  post("s-b", command, `started ${id}`);
  expect(itemOf("s-b")).toBeUndefined();
  expect(itemOf("s-a")).toBe(id);
});

/** A real crew start, run between a session's hooks by the caller: the id of the item it made. */
async function made(crew: ReturnType<typeof lanes>["crew"], title: string): Promise<string> {
  const run = await crew("start", title, "--answers", START_ANSWERS, "--criterion", "x", "--json");
  expect(run.code, run.err).toBe(0);
  return (JSON.parse(run.out) as { id: string }).id;
}

test("DEBT-AC-7-interleaved: two starts whose PostToolUse hooks run after both items exist each claim the item their own start printed", async () => {
  const { crew, pre, post, itemOf } = lanes();
  const commandA = `crew start "Add a total" --answers '${START_ANSWERS}'`;
  const commandB = `crew start "Add a count" --answers '${START_ANSWERS}'`;
  pre("s-a", commandA);
  pre("s-b", commandB);
  const a = await made(crew, "Add a total");
  const b = await made(crew, "Add a count");
  // A's PostToolUse comes after B's start: the checkout's active item is B's, A takes its own.
  post("s-a", commandA, `started ${a} (route fast: x)`);
  post("s-b", commandB, `started ${b} (route fast: x)`);
  expect(itemOf("s-a")).toBe(a);
  expect(itemOf("s-b")).toBe(b);
});

test("DEBT-AC-7-compound: a crew start beside another command claims nothing, whatever the output prints; a cd prefix is no other command", async () => {
  const { crew, pre, post, itemOf } = lanes();
  // The security lead's R-4: A's own start is refused, its echo prints B's item, made after A's
  // PreToolUse and not yet claimed by B.
  const echoed = `crew start "Again" --answers '{"work_type":"bug"}'; echo "started $(cat /tmp/b-id)"`;
  pre("s-a", echoed);
  pre("s-b", `crew start "Add a count" --answers '${START_ANSWERS}'`);
  const b = await made(crew, "Add a count");
  post("s-a", echoed, `started ${b}`);
  expect(itemOf("s-a")).toBeUndefined();
  post("s-b", `crew start "Add a count" --answers '${START_ANSWERS}'`, `started ${b}`);
  expect(itemOf("s-b")).toBe(b);
  // A start of its own followed by another command: nothing is claimed either. Each in a
  // checkout of its own, since a start beside a live session holding an item is refused (AC-3).
  const chain = lanes();
  const chained = `crew start "Add a total" --answers '${START_ANSWERS}' && echo ok`;
  chain.pre("s-c", chained);
  const c = await made(chain.crew, "Add a total");
  chain.post("s-c", chained, `started ${c}\nok`);
  expect(chain.itemOf("s-c")).toBeUndefined();
  // A cd into the checkout before it is the one prefix allowed.
  const cd = lanes();
  const prefixed = `cd "${cd.root}" && crew start "Add a note" --answers '${START_ANSWERS}'`;
  cd.pre("s-d", prefixed);
  const d = await made(cd.crew, "Add a note");
  cd.post("s-d", prefixed, `started ${d}`);
  expect(cd.itemOf("s-d")).toBe(d);
});

test("DEBT-AC-7-two-lines: an output holding more than one started line claims nothing", async () => {
  const { crew, pre, post, itemOf } = lanes();
  const command = `crew start "Add a total" --answers '${START_ANSWERS}'`;
  pre("s-a", command);
  const a = await made(crew, "Add a total");
  post("s-a", command, `started ${a}\nstarted ${a}`);
  expect(itemOf("s-a")).toBeUndefined();
});

test("DEBT-AC-7-unknown: a printed id that is no item of this checkout claims nothing", async () => {
  const { crew, pre, post, itemOf } = lanes();
  const command = `crew start "Add a total" --answers '${START_ANSWERS}'`;
  pre("s-a", command);
  await made(crew, "Add a total");
  post("s-a", command, "started 2026-01-01-001-nowhere");
  expect(itemOf("s-a")).toBeUndefined();
});

test("DEBT-AC-7-before: a printed id created before the session's PreToolUse claims nothing", async () => {
  const { crew, pre, post, itemOf } = lanes();
  const stale = await made(crew, "Made outside");
  Bun.sleepSync(5);
  const command = `crew start "Add a total" --answers '${START_ANSWERS}'`;
  pre("s-a", command);
  await made(crew, "Add a total");
  post("s-a", command, `started ${stale}`);
  expect(itemOf("s-a")).toBeUndefined();
});

test("DEBT-AC-7-not-open: a printed id whose item is no longer open claims nothing", async () => {
  const { paths, crew, pre, post, itemOf } = lanes();
  const command = `crew start "Add a total" --answers '${START_ANSWERS}'`;
  pre("s-a", command);
  const a = await made(crew, "Add a total");
  const evidence = loadEvidence(paths, a).evidence;
  evidence.verdict = "proven";
  saveEvidence(paths, a, evidence);
  post("s-a", command, `started ${a}`);
  expect(itemOf("s-a")).toBeUndefined();
});

test("DEBT-AC-7-held: a printed id another live session holds claims nothing", async () => {
  const { crew, pre, post, itemOf } = lanes();
  const command = `crew start "Add a total" --answers '${START_ANSWERS}'`;
  pre("s-a", command);
  pre("s-b", command);
  const b = await made(crew, "Add a total");
  post("s-b", command, `started ${b}`);
  post("s-a", command, `started ${b}`);
  expect(itemOf("s-a")).toBeUndefined();
  expect(itemOf("s-b")).toBe(b);
});
