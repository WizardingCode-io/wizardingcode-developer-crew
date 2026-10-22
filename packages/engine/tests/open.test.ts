import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type Delivery,
  loadRegistry,
  mailbox,
  mailContext,
  readBox,
  recordOpened,
  registerProject,
  send,
  tamperedBox,
  writeBox,
} from "../src/mail.ts";
import {
  isAlive,
  isSession,
  OPENER_STRIPS,
  type OpenRequest,
  openerArgs,
  openForMail,
  openSession,
  processStart,
  questionPrompt,
  readOutcome,
  stopSession,
  sweepOpened,
} from "../src/open.ts";
import { openedMarkerFile, openedMarkerPath } from "../src/opened.ts";
import { loadPolicy } from "../src/policy.ts";
import { saveProfile } from "../src/profile.ts";
import type { Message, OpenedSession } from "../src/types.ts";
import { git, hookContext, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

const FAKE = fileURLToPath(new URL("./fixtures/fake-claude.sh", import.meta.url));

/** The `open` member of a delivery, or a thrown error: these tests send mail that opens a session. */
function opening(delivery: Delivery): Extract<Delivery, { kind: "open" }> {
  if (delivery.kind !== "open") throw new Error(`delivery ${delivery.kind}, not open`);
  return delivery;
}

/**
 * Polls a condition with a deadline, yielding to the event loop between looks (a detached child
 * is reaped there: a blocked loop would leave it a zombie that still answers `kill -0`).
 */
async function waitFor(what: string, cond: () => boolean, ms = 8000): Promise<void> {
  const until = Date.now() + ms;
  while (!cond() && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  if (!cond()) throw new Error(`timed out waiting for ${what}`);
}

/** The fake opener's record of what it saw, once it is in place. */
async function recorded(file: string): Promise<string> {
  await waitFor(`the record ${file}`, () => existsSync(file));
  return readFileSync(file, "utf8");
}

/** The arguments the fake was called with: between `argv=` and the record separator, split on the unit separator (a prompt may hold newlines). */
function argvOf(record: string): string[] {
  const start = record.indexOf("argv=") + 5;
  const end = record.indexOf("\x1e", start);
  return record.slice(start, end).split("\x1f").slice(0, -1);
}

/** Whether the process group a detached child led is gone (a kill that reached the group, not only the shell). */
function groupGone(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return false;
  } catch {
    return true;
  }
}

/** The start time of a process as `ps` prints it in the C locale and UTC, the identity the engine records. */
function psStart(pid: number): string {
  return execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", TZ: "UTC" },
  }).trim();
}

/** Runs `fn` with the process's locale and time zone changed, as a hook of another shell might run. */
function underLocale<T>(tz: string, locale: string, fn: () => T): T {
  const saved = { TZ: process.env.TZ, LC_ALL: process.env.LC_ALL, LANG: process.env.LANG };
  process.env.TZ = tz;
  process.env.LC_ALL = locale;
  process.env.LANG = locale;
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const STRIP_VALUES: Record<string, string> = {
  CLAUDECODE: "1",
  CLAUDE_CODE_ENTRYPOINT: "cli",
  CLAUDE_CODE_CHILD_SESSION: "1",
  CLAUDE_CODE_SESSION_ID: "parent",
  CLAUDE_CODE_SESSION_ATTENDED: "1",
  CLAUDE_CODE_MESSAGING_SOCKET: "/tmp/parent.sock",
  CLAUDE_CODE_MESSAGING_TOKEN: "parent-token",
};

function pair(extraEnv: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = {
    ...testEnv(),
    ...STRIP_VALUES,
    CLAUDE_CODE_KEPT_BY_THE_CHILD: "a value the record never shows",
    WIZARDINGCODE_CREW_CLAUDE: FAKE,
    ...extraEnv,
  };
  const a = makeRepo({ "README.md": "# storefront\n" });
  const b = makeRepo({ "README.md": "# crm\n" });
  write(a, ".crew/policy.json", JSON.stringify({ mail: { workspace: "w", name: "storefront" } }));
  write(
    b,
    ".crew/policy.json",
    JSON.stringify({
      mail: {
        workspace: "w",
        name: "crm",
        open: "branch",
        accept: ["question", "change-request", "blocker"],
        maxMinutes: 1,
        maxConcurrent: 10,
      },
    }),
  );
  const pa = repoPaths(a, env);
  const pb = repoPaths(b, env);
  const ctxA = mailContext(pa, loadPolicy(pa).policy, env);
  const ctxB = mailContext(pb, loadPolicy(pb).policy, env);
  // crm registered long ago: not live, so a question opens a session.
  registerProject(ctxA, "sa");
  registerProject(ctxB, "sb");
  const registry = loadRegistry(pa.userDir);
  for (const p of registry.projects) if (p.name === "crm") p.lastSeen = "2020-01-01T00:00:00.000Z";
  write(pa.userDir, "projects.json", JSON.stringify(registry));
  const outboxOf = (id: string): Message =>
    readBox(mailbox(pa.userDir, "w", "storefront").dir, "outbox").box.messages.find(
      (m) => m.id === id,
    ) as Message;
  /** Sends a question to crm and opens its session with the given context (the fake's environment comes from it). */
  const ask = (ctx = ctxA, text = "Which values?") => {
    const sent = send(ctx, { to: "crm", type: "question", text }, null);
    if ("refused" in sent) throw new Error(sent.refused);
    const line = openForMail(ctx, ctx.policy, sent.message, opening(sent.delivery));
    return {
      id: sent.message.id,
      line,
      opened: () => outboxOf(sent.message.id).opened as OpenedSession,
    };
  };
  return { env, a, b, pa, pb, ctxA, ctxB, outboxOf, ask };
}

const message = (over: Partial<Message> = {}): Message => ({
  id: "M-2026-10-15-001-storefront",
  at: "2026-10-15T14:02:11.000Z",
  from: { workspace: "w", project: "storefront", item: "2026-10-15-003-x", agent: "session" },
  to: { workspace: "w", project: "crm", item: null, agent: null },
  type: "question",
  subject: "loyalty_tier on POST /customers",
  body: "Does POST /customers accept a loyalty_tier field, and which values?",
  replyTo: null,
  hops: 0,
  status: "sent",
  opened: null,
  ...over,
});

const READ_ONLY = [
  "--allowedTools",
  "Read",
  "Glob",
  "Grep",
  "Bash(crew *)",
  "--disallowedTools",
  "Write",
  "Edit",
  "MultiEdit",
  "NotebookEdit",
];

test("SP2c AC-1: the opener's arguments, environment and record", async () => {
  const request: OpenRequest = {
    message: message(),
    mode: "read-only",
    cwd: "/x/crm",
    branch: null,
    prompt: "P",
    maxTurns: 40,
    maxMinutes: 30,
    hops: 1,
    agent: "session",
    log: "/x/log",
  };
  // The name comes first, so a process listing shows it before a long prompt.
  const base = [
    "--name",
    "crew-M-2026-10-15-001-storefront",
    "-p",
    "P",
    "--permission-mode",
    "dontAsk",
    "--max-turns",
    "40",
    "--output-format",
    "json",
  ];
  expect(openerArgs(request, { pluginDir: null })).toEqual([...base, ...READ_ONLY]);
  // A branch session gets the tools the method needs, and a grant for the first word of each gate
  // command of the project's profile (SP2c 8a AC-4).
  const BRANCH = [
    "--allowedTools",
    "Read",
    "Glob",
    "Grep",
    "Write",
    "Edit",
    "MultiEdit",
    "NotebookEdit",
    "Skill",
    "Agent",
    "Bash(crew *)",
    "Bash(git *)",
  ];
  expect(
    openerArgs(
      { ...request, mode: "branch", branch: "crew/x/T-1" },
      { pluginDir: "/plug", profile: null },
    ),
  ).toEqual([...base, "--plugin-dir", "/plug", ...BRANCH]);
  const profile = {
    version: 1 as const,
    detectedAt: "",
    watch: { exclude: [] },
    targets: [
      {
        path: ".",
        stack: "node" as const,
        packageManager: "npm",
        timeoutMs: 1000,
        gates: {
          test: { command: "npm run test", source: "detected" as const },
          lint: { command: "npx biome check .", source: "detected" as const },
          build: { command: "npm run build", source: "detected" as const },
        },
      },
    ],
  };
  expect(
    openerArgs(
      { ...request, mode: "branch", branch: "crew/x/T-1" },
      { pluginDir: "/plug", profile },
    ),
  ).toEqual([...base, "--plugin-dir", "/plug", ...BRANCH, "Bash(npm *)", "Bash(npx *)"]);
  // A read-only session, started by the fake: what it saw of its environment and its arguments.
  const record = join(tempDir("crew-rec-"), "rec.txt");
  const { env, pa, pb, ctxA } = pair({
    FAKE_CLAUDE_RECORD: record,
    WIZARDINGCODE_CREW_PLUGIN_DIR: "/plug",
    FAKE_CLAUDE_SLEEP: "2",
  });
  // The message stands in the opener's outbox, as a sent one would: a session no copy records is stopped.
  const own = mailbox(pa.userDir, "w", "storefront").dir;
  mkdirSync(own, { recursive: true });
  const outbox = readBox(own, "outbox").box;
  outbox.messages.push(
    message(),
    message({ id: "M-2026-10-15-002-storefront", type: "change-request" }),
  );
  writeBox(own, "outbox", outbox);
  const log = join(tempDir("crew-log-"), "m.log");
  const opened = openSession(ctxA, {
    message: message(),
    mode: "read-only",
    cwd: pb.root,
    branch: null,
    prompt: questionPrompt(message(), "crm"),
    maxTurns: 40,
    maxMinutes: 30,
    hops: 1,
    agent: "session",
    log,
  });
  if ("failed" in opened) throw new Error(opened.failed);
  expect(typeof opened.pid).toBe("number");
  expect(Number.isNaN(Date.parse(opened.startedAt))).toBe(false);
  expect(opened).toMatchObject({
    mode: "read-only",
    cwd: pb.root,
    branch: null,
    name: "crew-M-2026-10-15-001-storefront",
    maxTurns: 40,
    maxMinutes: 30,
    log,
  });
  // The process's own start time, as ps prints it: with the pid, what tells the session from a
  // process that reused its pid (the real binary shows no arguments in ps, only its name). It is
  // read in one locale and time zone, so a hook run from another shell reads the same string.
  expect(opened.processStart).toBe(psStart(opened.pid as number));
  underLocale("Asia/Tokyo", "pt_PT.UTF-8", () => {
    expect(processStart(opened.pid as number)).toBe(opened.processStart as string);
    expect(isSession(opened)).toBe(true);
  });
  const seen = await recorded(record);
  expect(seen).toContain(`cwd=${pb.root}\n`);
  // A read-only session runs in the destination's own root, shared with the lead: no record of an
  // opener is left there, and a session in that root is nobody's child.
  expect(existsSync(openedMarkerPath(pb))).toBe(false);
  expect(
    hookContext({ session_id: "s", cwd: pb.root }, { ...env, CLAUDE_CODE_SESSION_ATTENDED: "0" })
      .openedBy,
  ).toBeNull();
  expect(seen).toContain("WIZARDINGCODE_CREW_MAIL_ID=M-2026-10-15-001-storefront\n");
  expect(seen).toContain("WIZARDINGCODE_CREW_MAIL_AGENT=session\n");
  expect(seen).toContain("WIZARDINGCODE_CREW_MAIL_HOPS=1\n");
  expect(seen).toContain("WIZARDINGCODE_CREW_MAIL_MODE=read-only\n");
  // A read-only session has no branch of its own: with none pinned the hook denies every push.
  expect(seen).not.toContain("WIZARDINGCODE_CREW_MAIL_BRANCH=");
  // The parent's nesting guard, identity, attendance and messaging socket: none of the seven reaches the child.
  expect([...OPENER_STRIPS].sort()).toEqual(Object.keys(STRIP_VALUES).sort());
  for (const key of Object.keys(STRIP_VALUES)) {
    expect(env[key]).toBeDefined();
    expect(seen).not.toMatch(new RegExp(`^${key}(=|$)`, "m"));
  }
  // A variable the child keeps (as it keeps its authentication) is recorded by the fake by name
  // only, so no value of the parent's lands in a record file.
  expect(seen).toContain("CLAUDE_CODE_KEPT_BY_THE_CHILD\n");
  expect(seen).not.toContain("a value the record never shows");
  const argv = argvOf(seen);
  expect(argv.slice(0, 4)).toEqual([
    "--name",
    "crew-M-2026-10-15-001-storefront",
    "-p",
    questionPrompt(message(), "crm"),
  ]);
  expect(argv).toContain("--plugin-dir");
  expect(argv[argv.indexOf("--plugin-dir") + 1]).toBe("/plug");
  expect(argv).toContain("Bash(crew *)");
  // The sender and the destination have different test commands: a branch session's grants are
  // the destination's, where it works (SP2c 8a AC-4, round 2).
  const profileOf = (command: string) => ({
    version: 1 as const,
    detectedAt: "",
    watch: { exclude: [] },
    targets: [
      {
        path: ".",
        stack: "node" as const,
        packageManager: "npm",
        timeoutMs: 1000,
        gates: { test: { command, source: "detected" as const } },
      },
    ],
  });
  saveProfile(pa, profileOf("npm run test"));
  saveProfile(pb, profileOf("pnpm test"));
  // A session on a branch has that branch pinned for the hook's push rule (Task 3's ruling), and no read-only flags.
  const branchRecord = join(tempDir("crew-rec-"), "rec.txt");
  const onBranch = openSession(
    mailContext(ctxA.paths, ctxA.policy, { ...env, FAKE_CLAUDE_RECORD: branchRecord }),
    {
      message: message({ id: "M-2026-10-15-002-storefront", type: "change-request" }),
      mode: "branch",
      cwd: pb.root,
      branch: "crew/mail/M-2026-10-15-002-storefront",
      prompt: "P",
      maxTurns: 40,
      maxMinutes: 30,
      hops: 1,
      agent: "session",
      log: join(tempDir("crew-log-"), "b.log"),
    },
  );
  if ("failed" in onBranch) throw new Error(onBranch.failed);
  const seenBranch = await recorded(branchRecord);
  expect(seenBranch).toContain(
    "WIZARDINGCODE_CREW_MAIL_BRANCH=crew/mail/M-2026-10-15-002-storefront\n",
  );
  expect(seenBranch).toContain("WIZARDINGCODE_CREW_MAIL_MODE=branch\n");
  expect(seenBranch).toContain("--allowedTools");
  expect(seenBranch).toContain("Bash(git *)");
  // The grants come from the project whose code the session works on (the destination, crm), never
  // from the sender's profile (SP2c 8a AC-4, round 2).
  expect(seenBranch).toContain("Bash(pnpm *)");
  expect(seenBranch).not.toContain("Bash(npm *)");
  expect(questionPrompt(message(), "crm")).toContain(
    "You are answering mail M-2026-10-15-001-storefront from storefront in project crm",
  );
  expect(questionPrompt(message(), "crm")).toContain(
    'crew mail reply M-2026-10-15-001-storefront "<your answer>"',
  );
  expect(questionPrompt(message(), "crm")).toContain("Read the code; change nothing");
}, 20_000);

test("SP2c AC-2: the sweep reads the log and the process before the minutes, kills past the minutes, never signals a process that is not the session, and crew mail stop records stopped", async () => {
  const { env, pa, pb, ctxA, outboxOf, ask } = pair({ FAKE_CLAUDE_SLEEP: "30" });
  const quick = { ...env };
  delete quick.FAKE_CLAUDE_SLEEP;
  const quickCtx = (over: Record<string, string> = {}) =>
    mailContext(pa, ctxA.policy, { ...quick, ...over });
  // A sleeping session: recorded with its log beside the outbox, alive, then killed past its minute.
  const first = ask();
  expect(first.line).toMatch(
    /^read-only session opened \(crew-M-\S+, pid \d+, 40 turns, 1 minute\)$/,
  );
  expect(first.opened().log).toBe(
    join(mailbox(pa.userDir, "w", "storefront").dir, "opened", `${first.id}.log`),
  );
  expect(Number.isNaN(Date.parse(first.opened().startedAt))).toBe(false);
  const firstPid = first.opened().pid as number;
  expect(firstPid).toBeGreaterThan(0);
  expect(isAlive(firstPid)).toBe(true);
  expect(first.opened().processStart).toBe(psStart(firstPid));
  // Not over its minute yet: nothing happens.
  expect(sweepOpened(ctxA)).toMatchObject({ expired: [], ended: [] });
  // Over the minute: the group is killed and the message expired.
  expect(sweepOpened(ctxA, Date.now() + 2 * 60_000)).toMatchObject({
    expired: [first.id],
    ended: [],
  });
  await waitFor("the sleeping fake to die", () => !isAlive(firstPid));
  expect(groupGone(firstPid)).toBe(true);
  expect(outboxOf(first.id)).toMatchObject({
    status: "expired",
    reason: "the session ran past 1 minute (mail.maxMinutes) and was stopped",
    opened: { outcome: "expired" },
  });
  expect(readBox(mailbox(pb.userDir, "w", "crm").dir, "inbox").box.messages[0]).toMatchObject({
    status: "expired",
  });
  // A session that ends on its own: its log holds the result and its process is gone, so a sweep
  // past the minutes finds it ended, not expired; without a reply the message is expired with the reason.
  const second = ask(quickCtx(), "Second");
  await waitFor(
    "the quick fake to end",
    () => readOutcome(second.opened().log).ended && !isAlive(second.opened().pid),
  );
  expect(readOutcome(second.opened().log)).toEqual({ turns: 1, costUsd: 0.0123, ended: true });
  expect(sweepOpened(quickCtx(), Date.now() + 10 * 60_000)).toMatchObject({
    expired: [],
    ended: [second.id],
  });
  expect(outboxOf(second.id)).toMatchObject({
    status: "expired",
    reason: "the session ended without a reply",
    opened: { outcome: "ended", turns: 1, costUsd: 0.0123 },
  });
  // A session that ended with an error result (the turns ran out): failed, with the subtype as the reason.
  const third = ask(quickCtx({ FAKE_CLAUDE_SUBTYPE: "error_max_turns" }), "Third");
  await waitFor(
    "the failing fake to end",
    () => readOutcome(third.opened().log).ended && !isAlive(third.opened().pid),
  );
  expect(readOutcome(third.opened().log)).toMatchObject({
    ended: true,
    error: "error_max_turns",
    turns: 3,
  });
  expect(sweepOpened(quickCtx())).toMatchObject({ expired: [third.id], ended: [] });
  expect(outboxOf(third.id)).toMatchObject({
    status: "expired",
    reason: "the session ended with error_max_turns",
    opened: { outcome: "failed", turns: 3, costUsd: 0.05 },
  });
  // A session that died before its result (killed from outside): no end in the log, its process
  // gone; expired with the reason, and nothing is signalled.
  const fourth = ask(ctxA, "Fourth");
  const fourthPid = fourth.opened().pid as number;
  process.kill(-fourthPid, "SIGKILL");
  await waitFor("the killed fake to die", () => !isAlive(fourthPid));
  const fourthSweep = sweepOpened(ctxA);
  expect(fourthSweep).toMatchObject({ expired: [fourth.id], ended: [] });
  // The line says what a person may still find: a member of the group that outlived its leader.
  expect(fourthSweep.lines).toEqual([
    `${fourth.id} is gone without a reply (expired); a member of its process group may remain (ps -g ${fourthPid})`,
  ]);
  expect(outboxOf(fourth.id)).toMatchObject({
    status: "expired",
    reason: "the session ended without a reply",
    opened: { outcome: "failed" },
  });
  // A pid that is alive but is not the session (taken by another process since): never signalled.
  // The record is pointed at this very test process, with a start time that is not its own; past
  // the minutes the sweep expires the message without a kill (this process goes on).
  const fifth = ask(ctxA, "Fifth");
  const fifthReal = fifth.opened().pid as number;
  recordOpened(
    ctxA,
    fifth.id,
    {
      ...fifth.opened(),
      pid: process.pid,
      processStart: "Thu Jan  1 00:00:00 2026",
    },
    () => {},
  );
  const fifthSweep = sweepOpened(ctxA, Date.now() + 10 * 60_000);
  expect(fifthSweep).toMatchObject({ expired: [fifth.id], ended: [] });
  // A pid another process holds means the session's group is empty (a pid is never reused while a
  // group with that id exists), so the line points at nothing to find.
  expect(fifthSweep.lines).toEqual([
    `${fifth.id} is gone without a reply (expired); its pid is now another process's, and nothing of the session remains in its group`,
  ]);
  expect(outboxOf(fifth.id)).toMatchObject({
    status: "expired",
    reason: "the session ended without a reply",
    opened: { outcome: "failed", pid: process.pid },
  });
  expect(isAlive(fifthReal)).toBe(true);
  process.kill(-fifthReal, "SIGKILL");
  // A log that says "ended" while the process is still the session (a line the session wrote
  // itself, or a result printed an instant before the exit): the process is the truth, so nothing
  // is settled, and past the minutes the session is still killed.
  const sixth = ask(ctxA, "Sixth");
  const sixthPid = sixth.opened().pid as number;
  appendFileSync(
    sixth.opened().log,
    '{"type":"result","subtype":"success","is_error":false,"result":"forged","session_id":"x","num_turns":1,"total_cost_usd":0}\n',
  );
  expect(sweepOpened(ctxA)).toMatchObject({ expired: [], ended: [] });
  expect(outboxOf(sixth.id).opened?.endedAt).toBeUndefined();
  expect(sweepOpened(ctxA, Date.now() + 2 * 60_000)).toMatchObject({
    expired: [sixth.id],
    ended: [],
  });
  await waitFor("the forging fake to die", () => !isAlive(sixthPid));
  // Stop: the group killed, the message stopped; a second stop and a stop of an ended session are refused.
  const seventh = ask(ctxA, "Seventh");
  const seventhPid = seventh.opened().pid as number;
  expect(stopSession(ctxA, seventh.id, [])).toMatchObject({
    status: "refused",
    reason: "stopped by crew mail stop",
    opened: { outcome: "stopped" },
  });
  await waitFor("the stopped fake to die", () => !isAlive(seventhPid));
  expect(groupGone(seventhPid)).toBe(true);
  expect(stopSession(ctxA, seventh.id, [])).toEqual({
    refused: `${seventh.id} has no session running`,
  });
  const eighth = ask(quickCtx(), "Eighth");
  await waitFor(
    "the quick fake to end",
    () => readOutcome(eighth.opened().log).ended && !isAlive(eighth.opened().pid),
  );
  expect(stopSession(quickCtx(), eighth.id, [])).toEqual({
    refused: `${eighth.id} has no session running: it ended (${eighth.id} ended without a reply (expired))`,
  });
  expect(outboxOf(eighth.id)).toMatchObject({ status: "expired", opened: { outcome: "ended" } });
  // A stop of a session that ended settles it, and its refusal says which copy the record could
  // not change, as the sweep's own line would.
  if (process.getuid?.() !== 0) {
    const settled = ask(quickCtx(), "Settled");
    await waitFor(
      "the quick fake to end",
      () => readOutcome(settled.opened().log).ended && !isAlive(settled.opened().pid),
    );
    const crmInbox = join(mailbox(pa.userDir, "w", "crm").dir, "inbox.json");
    chmodSync(crmInbox, 0o000);
    try {
      const refusal = stopSession(quickCtx(), settled.id, []) as { refused: string };
      expect(refusal.refused).toContain(
        `${settled.id} has no session running: it ended (the record of ${settled.id} skipped a box it could not read: ${crmInbox} (`,
      );
    } finally {
      chmodSync(crmInbox, 0o644);
    }
  }
  // A session that ignores SIGTERM is killed all the same: the kill escalates, and "stopped" is true.
  const ninth = ask(mailContext(pa, ctxA.policy, { ...env, FAKE_CLAUDE_TRAP: "1" }), "Ninth");
  const ninthPid = ninth.opened().pid as number;
  expect(stopSession(ctxA, ninth.id, [])).toMatchObject({ status: "refused" });
  await waitFor("the trapping fake to die", () => !isAlive(ninthPid));
  // A session opened by mail stops no sessions: the outbox is the project's, shared with the lead.
  const tenth = ask(ctxA, "Tenth");
  const opened = mailContext(pa, ctxA.policy, { ...env, WIZARDINGCODE_CREW_MAIL_ID: "M-x" });
  expect(stopSession(opened, tenth.id, [])).toEqual({
    refused: "a session opened by mail (M-x) stops no sessions",
  });
  // Nor does its sweep settle or stop anything (crew mail status runs it too).
  expect(sweepOpened(opened, Date.now() + 10 * 60_000)).toEqual({
    ended: [],
    expired: [],
    lines: [],
  });
  expect(isAlive(tenth.opened().pid)).toBe(true);
  expect(outboxOf(tenth.id).opened?.endedAt).toBeUndefined();
  expect(stopSession(ctxA, tenth.id, [])).toMatchObject({ status: "refused" });
  // A member of the group that ignores SIGTERM after its leader ended: the whole group is killed,
  // so "stopped" is true of every process the session started.
  const mark = join(tempDir("crew-orphan-"), "mark");
  const eleventh = ask(
    mailContext(pa, ctxA.policy, {
      ...env,
      FAKE_CLAUDE_ORPHAN: "1",
      FAKE_CLAUDE_ORPHAN_MARK: mark,
    }),
    "Eleventh",
  );
  const eleventhPid = eleventh.opened().pid as number;
  await waitFor("the orphan to be started", () => existsSync(mark));
  expect(stopSession(ctxA, eleventh.id, [])).toMatchObject({ status: "refused" });
  await waitFor("the whole group to die", () => groupGone(eleventhPid));
}, 90_000);

test("SP2c AC-2: an outbox changed outside the engine is named by the sweep, and a log folder that cannot be made leaves no record of an opener", async () => {
  const { env, b, pa, ctxA, outboxOf, ask } = pair();
  const own = mailbox(pa.userDir, "w", "storefront").dir;
  // The log's folder stands as a file: the session cannot start, and nothing of it is left behind.
  mkdirSync(own, { recursive: true });
  writeFileSync(join(own, "opened"), "not a folder\n");
  const change = send(ctxA, { to: "crm", type: "change-request", text: "Add it" }, null);
  if ("refused" in change) throw new Error(change.refused);
  const line = openForMail(ctxA, ctxA.policy, change.message, opening(change.delivery));
  expect(line).toMatch(/^could not open a session: could not open the log .*; queued$/);
  const worktree = join(b, "..", `${basename(b)}-mail-${change.message.id}`);
  expect(existsSync(openedMarkerFile(pa.userDir, worktree))).toBe(false);
  expect(existsSync(worktree)).toBe(false);
  rmSync(join(own, "opened"));
  // The outbox written by hand between the send and the start: the session that started has no
  // record where the sweep, the stop and the listing read, so it is stopped at once (the fake would
  // linger for 30 seconds) and the start fails, nothing left behind; the copy that was written,
  // the destination's, says the session ended.
  const second = send(ctxA, { to: "crm", type: "change-request", text: "Add more" }, null);
  if ("refused" in second) throw new Error(second.refused);
  const outboxFile = join(own, "outbox.json");
  const outboxBytes = readFileSync(outboxFile, "utf8");
  writeFileSync(outboxFile, JSON.stringify(JSON.parse(outboxBytes)));
  const lingering = mailContext(pa, ctxA.policy, { ...env, FAKE_CLAUDE_SLEEP: "30" });
  const unrecorded = openForMail(lingering, ctxA.policy, second.message, opening(second.delivery));
  expect(unrecorded).toBe(
    `could not open a session: the session started but the outbox could not record it (a mailbox changed outside the engine), so it was stopped; queued; a copy of ${second.message.id} was not changed: ${outboxFile} (changed outside the engine)`,
  );
  const crmCopy = readBox(mailbox(pa.userDir, "w", "crm").dir, "inbox").box.messages.find(
    (m) => m.id === second.message.id,
  );
  const secondPid = crmCopy?.opened?.pid as number;
  expect(secondPid).toBeGreaterThan(0);
  await waitFor("the unrecorded session's group to die", () => groupGone(secondPid));
  expect(crmCopy?.opened).toMatchObject({ outcome: "stopped" });
  expect(typeof crmCopy?.opened?.endedAt).toBe("string");
  const secondTree = join(b, "..", `${basename(b)}-mail-${second.message.id}`);
  expect(existsSync(openedMarkerFile(pa.userDir, secondTree))).toBe(false);
  expect(existsSync(secondTree)).toBe(false);
  writeFileSync(outboxFile, outboxBytes);
  // The outbox's lock held by another writer past the wait: the record throws after the start,
  // and the session is stopped all the same, the line naming the lock. The fake writes its record
  // into the worktree long before the wait runs out, so the worktree cannot be removed: it is kept,
  // never removed by force, and the line names it and its branch, with git's reason and none of
  // git's advice.
  const third = send(ctxA, { to: "crm", type: "change-request", text: "Add a third" }, null);
  if ("refused" in third) throw new Error(third.refused);
  const thirdTree = join(b, "..", `${basename(b)}-mail-${third.message.id}`);
  const thirdRecord = join(thirdTree, "rec.txt");
  const lock = join(own, ".lock");
  mkdirSync(lock);
  const busy = openForMail(
    mailContext(pa, ctxA.policy, {
      ...env,
      FAKE_CLAUDE_SLEEP: "30",
      FAKE_CLAUDE_RECORD: thirdRecord,
    }),
    ctxA.policy,
    third.message,
    opening(third.delivery),
  );
  rmSync(lock, { recursive: true, force: true });
  expect(busy).toMatch(
    /^could not open a session: the session started but the outbox could not record it \(mailbox busy: \S+\.lock held for more than \d+ ms\), so it was stopped; queued; the worktree \S+ is kept, with its branch crew\/mail\/\S+: .+$/,
  );
  expect(busy).toContain(
    `; queued; the worktree ${thirdTree} is kept, with its branch crew/mail/${third.message.id}: `,
  );
  expect(busy).not.toContain("--force");
  const thirdPid = Number(/^pid=(\d+)$/m.exec(await recorded(thirdRecord))?.[1]);
  expect(thirdPid).toBeGreaterThan(0);
  await waitFor("the busy session's group to die", () => groupGone(thirdPid));
  expect(existsSync(openedMarkerFile(pa.userDir, thirdTree))).toBe(false);
  expect(existsSync(thirdRecord)).toBe(true);
  git(b, "worktree", "remove", "--force", thirdTree);
  expect(existsSync(thirdTree)).toBe(false);
  // A session opened, then the outbox written by hand: the sweep settles nothing and says why,
  // instead of settling nothing in silence.
  const first = ask(ctxA, "First?");
  expect(outboxOf(first.id).opened).not.toBeNull();
  const box = readFileSync(join(own, "outbox.json"), "utf8");
  writeFileSync(join(own, "outbox.json"), JSON.stringify(JSON.parse(box)));
  const swept = sweepOpened(ctxA, Date.now() + 10 * 60_000);
  expect(swept.ended).toEqual([]);
  expect(swept.expired).toEqual([]);
  expect(swept.lines).toEqual([tamperedBox("storefront", "outbox")]);
  expect(stopSession(ctxA, first.id, [])).toEqual({ refused: tamperedBox("storefront", "outbox") });
}, 20_000);

test("SP2c AC-2: a change request opens a session on a branch of the destination, in a worktree, and a session that cannot start leaves the message queued", async () => {
  const record = join(tempDir("crew-rec-"), "rec.txt");
  const { env, b, pa, ctxA, outboxOf } = pair({ FAKE_CLAUDE_RECORD: record });
  // The destination keeps its worktrees under a folder reached through a symbolic link, so the
  // path the engine records and the path the checkout resolves to differ in their spelling.
  const linked = tempDir("crew-wt-");
  symlinkSync(linked, join(b, "wtlink"));
  write(
    b,
    ".crew/policy.json",
    JSON.stringify({
      mail: {
        workspace: "w",
        name: "crm",
        open: "branch",
        accept: ["question", "change-request", "blocker"],
        maxMinutes: 1,
        maxConcurrent: 10,
        worktrees: "wtlink",
      },
    }),
  );
  const worktrees = join(b, "wtlink");
  const sent = send(ctxA, { to: "crm", type: "change-request", text: "Add the field" }, null);
  if ("refused" in sent) throw new Error(sent.refused);
  expect(sent.delivery).toMatchObject({ kind: "open", mode: "branch" });
  const line = openForMail(ctxA, ctxA.policy, sent.message, opening(sent.delivery));
  const id = sent.message.id;
  expect(line).toMatch(
    new RegExp(
      `^session opened on branch crew/mail/${id} \\(crew-${id}, pid \\d+, 40 turns, 1 minute\\)$`,
    ),
  );
  const worktree = join(worktrees, `${basename(b)}-mail-${id}`);
  // The engine's record of what opened the session, for the worktree it made; gone once the
  // session has ended and the sweep settled it, so whoever takes the worktree over is not its
  // child. The record is keyed by the checkout's canonical root, whatever spelling named it.
  expect(existsSync(openedMarkerPath(repoPaths(worktree, env)))).toBe(true);
  await waitFor(
    "the branch fake to end",
    () =>
      readOutcome(outboxOf(id).opened?.log ?? "").ended &&
      !isAlive(outboxOf(id).opened?.pid ?? null),
  );
  expect(sweepOpened(ctxA)).toMatchObject({ ended: [id] });
  expect(existsSync(openedMarkerPath(repoPaths(worktree, env)))).toBe(false);
  expect(existsSync(openedMarkerFile(pa.userDir, worktree))).toBe(false);
  expect(existsSync(worktree)).toBe(true);
  expect(existsSync(join(worktree, "README.md"))).toBe(true);
  expect(git(worktree, "rev-parse", "--abbrev-ref", "HEAD")).toBe(`crew/mail/${id}`);
  expect(outboxOf(id).opened).toMatchObject({
    mode: "branch",
    cwd: worktree,
    branch: `crew/mail/${id}`,
  });
  const seen = await recorded(record);
  // The fake prints its folder as the shell resolves it, through the link.
  expect(seen).toContain(`cwd=${realpathSync(worktree)}\n`);
  expect(seen).toContain(`WIZARDINGCODE_CREW_MAIL_BRANCH=crew/mail/${id}\n`);
  expect(seen).toContain("WIZARDINGCODE_CREW_MAIL_MODE=branch\n");
  const argv = argvOf(seen);
  const prompt = argv[argv.indexOf("-p") + 1] ?? "";
  expect(prompt).toContain(
    `You are building mail ${id} from storefront in project crm, on branch crew/mail/${id}`,
  );
  expect(prompt).toContain(
    `crew mail reply ${id} --branch crew/mail/${id} --item <the work item id>`,
  );
  // A binary that cannot start: the line says so and the message keeps no session.
  const broken = mailContext(pa, ctxA.policy, {
    ...env,
    WIZARDINGCODE_CREW_CLAUDE: join(tempDir("crew-none-"), "claude"),
  });
  const again = send(broken, { to: "crm", type: "question", text: "Another?" }, null);
  if ("refused" in again) throw new Error(again.refused);
  const failed = openForMail(broken, broken.policy, again.message, opening(again.delivery));
  expect(failed).toMatch(/^could not open a session: .*; queued$/);
  expect(outboxOf(again.message.id).opened).toBeNull();
  expect(outboxOf(again.message.id).status).toBe("sent");
  // A change request whose session cannot start: the worktree and the branch made for it go too.
  const change = send(broken, { to: "crm", type: "change-request", text: "Add another" }, null);
  if ("refused" in change) throw new Error(change.refused);
  const failedBranch = openForMail(broken, broken.policy, change.message, opening(change.delivery));
  expect(failedBranch).toMatch(/^could not open a session: .*; queued$/);
  const failedWorktree = join(worktrees, `${basename(b)}-mail-${change.message.id}`);
  expect(existsSync(failedWorktree)).toBe(false);
  expect(git(b, "branch", "--list", `crew/mail/${change.message.id}`)).toBe("");
  expect(existsSync(openedMarkerFile(pa.userDir, failedWorktree))).toBe(false);
}, 20_000);

test.skipIf(process.getuid?.() === 0)(
  "CON6-AC-9 (finding 30): crew mail stop of a session whose sweep throws refuses naming the settle failure, its lines once, never a throw",
  async () => {
    const { pa, ctxA, ask } = pair();
    const ended = ask(ctxA, "Will the stop settle me?");
    await waitFor(
      "the fake to end",
      () => readOutcome(ended.opened().log).ended && !isAlive(ended.opened().pid),
    );
    // The receiver's mailbox folder cannot be written: the settle's record throws there.
    const crmDir = mailbox(pa.userDir, "w", "crm").dir;
    chmodSync(crmDir, 0o555);
    let outcome: unknown;
    try {
      outcome = stopSession(ctxA, ended.id, []);
    } catch (error) {
      outcome = { threw: String(error) };
    } finally {
      chmodSync(crmDir, 0o755);
    }
    expect(outcome).toEqual({ refused: expect.stringContaining("EACCES") });
    const refused = (outcome as { refused: string }).refused;
    // The failure is said once, not once per line that repeats it.
    expect(refused.split("EACCES").length - 1).toBe(1);
  },
  20_000,
);
