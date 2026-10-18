import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import {
  acceptMail,
  decidedPriority,
  INLINE_BODY_LIMIT,
  inboxSummary,
  isLive,
  loadRegistry,
  MAIL_TRANSITIONS,
  type MappedStatus,
  mailbox,
  mailContext,
  mailStatus,
  markRead,
  newMessageId,
  ownInbox,
  priorityOf,
  pruneRegistry,
  readBox,
  readEvidence,
  refuseMail,
  registerProject,
  reply,
  resolveProject,
  send,
  syncMail,
  threadOf,
  threadParties,
  transition,
  withMailLock,
  writeBox,
} from "../src/mail.ts";
import { loadPolicy, setPolicyValue } from "../src/policy.ts";
import { readProtectedJson, recordIntegrity } from "../src/store.ts";
import type { GateRun, Mailbox, MailPriority, Message } from "../src/types.ts";
import { createWork, saveWork } from "../src/work.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

/** Two projects of one workspace and a third outside it, each registered as a session would. */
function workspace(env = testEnv(), acceptB: string[] = ["question", "notice"]) {
  const make = (name: string, ws: string | null, extra: Record<string, unknown> = {}) => {
    const root = makeRepo({ "README.md": `# ${name}\n` });
    const paths = repoPaths(root, env);
    mkdirSync(paths.crewDir, { recursive: true });
    writeFileSync(
      join(paths.crewDir, "policy.json"),
      JSON.stringify({ mail: { ...(ws ? { workspace: ws } : {}), name, ...extra } }),
    );
    const policy = loadPolicy(paths).policy;
    const ctx = mailContext(paths, policy, env);
    registerProject(ctx, `session-${name}`, { hook: true });
    return { root, paths, policy, ctx };
  };
  return {
    env,
    a: make("storefront", "shop"),
    b: make("crm", "shop", { accept: acceptB }),
    c: make("wizardingcode-developer-crew", "wizardingcode"),
  };
}

const question = (text = "Does POST /customers accept loyalty_tier?") => ({
  to: "crm",
  type: "question" as const,
  text,
});

test("SP2c AC-1: mail never leaves the workspace; a refusal is recorded in the sender's outbox only", () => {
  const w = workspace();
  const out = send(
    w.a.ctx,
    { to: "wizardingcode-developer-crew", type: "question", text: "hi" },
    null,
  );
  expect(out).toMatchObject({
    refused:
      "wizardingcode-developer-crew is not in workspace shop (it is in wizardingcode); mail never leaves the workspace",
  });
  const outbox = readBox(mailbox(w.a.paths.userDir, "shop", "storefront").dir, "outbox").box;
  expect(outbox.messages).toHaveLength(1);
  expect(outbox.messages[0]).toMatchObject({
    status: "refused",
    to: { project: "wizardingcode-developer-crew" },
  });
  expect(outbox.messages[0]?.reason).toContain("mail never leaves the workspace");
  expect(
    existsSync(
      join(
        w.c.paths.userDir,
        "mail",
        "wizardingcode",
        "wizardingcode-developer-crew",
        "inbox.json",
      ),
    ),
  ).toBe(false);
  // A name the workspace does not know, and a project with no workspace.
  expect(send(w.a.ctx, { to: "warehouse", type: "question", text: "hi" }, null)).toMatchObject({
    refused: "no project named warehouse in workspace shop (known: crm, storefront)",
  });
  const alone = repoPaths(makeRepo(), w.env);
  const aloneCtx = mailContext(alone, loadPolicy(alone).policy, w.env);
  registerProject(aloneCtx, "s");
  expect(send(aloneCtx, { to: "crm", type: "question", text: "hi" }, null)).toMatchObject({
    refused:
      "this project has no workspace (crew policy set mail.workspace <name>); it can only mail itself (--to .)",
  });
  expect(send(aloneCtx, { to: ".", type: "notice", text: "note to self" }, null)).toMatchObject({
    message: { to: { project: basename(alone.root), workspace: "_alone" }, status: "sent" },
  });
});

test("SP2c AC-2: an accepted message reaches the inbox, the outbox and the item's mail.json, and the send says what happens next", () => {
  const w = workspace();
  const work = createWork(w.a.paths, "Loyalty tier on checkout");
  const out = send(w.a.ctx, question(), work);
  if ("refused" in out) throw new Error(out.refused);
  expect(out.message.id).toMatch(/^M-\d{4}-\d{2}-\d{2}-001-storefront$/);
  expect(out.message).toMatchObject({
    from: { workspace: "shop", project: "storefront", item: work.id, agent: "session" },
    to: { workspace: "shop", project: "crm", agent: null, item: null },
    type: "question",
    subject: "Does POST /customers accept loyalty_tier?",
    hops: 0,
    status: "sent",
    opened: null,
    replyTo: null,
  });
  // crm was registered a moment ago, so it is live: queued, ring it.
  expect(out.delivery).toMatchObject({
    kind: "live",
    entry: { name: "crm", sessionId: "session-crm" },
  });
  const inbox = readBox(mailbox(w.b.paths.userDir, "shop", "crm").dir, "inbox").box;
  expect(inbox.messages.map((m) => m.id)).toEqual([out.message.id]);
  const itemCopy = readProtectedJson<Mailbox>(
    w.a.paths,
    join(w.a.paths.crewDir, "work", work.id, "mail.json"),
  );
  expect(itemCopy.tampered).toBe(false);
  expect(itemCopy.data?.messages.map((m) => m.id)).toEqual([out.message.id]);
  // crm not live: a question opens a read-only session; a change request is queued (crm does not open on a branch).
  const registry = loadRegistry(w.a.paths.userDir);
  for (const p of registry.projects) if (p.name === "crm") p.lastHook = "2020-01-01T00:00:00.000Z";
  writeFileSync(join(w.a.paths.userDir, "projects.json"), JSON.stringify(registry));
  const second = send(w.a.ctx, question("Second"), work);
  if ("refused" in second) throw new Error(second.refused);
  expect(second.message.id).toMatch(/-002-storefront$/);
  expect(second.delivery).toMatchObject({ kind: "open", mode: "read-only" });
  // A subject given is kept; a long first line is cut for the subject.
  const noticed = send(
    w.a.ctx,
    { to: "crm", type: "notice", subject: "Release tonight", text: "x".repeat(300) },
    work,
  );
  if ("refused" in noticed) throw new Error(noticed.refused);
  expect(noticed.delivery).toEqual({ kind: "queued", reason: "a notice waits in the inbox" });
  expect(noticed.message.subject).toBe("Release tonight");
  expect(send(w.a.ctx, { to: "crm", type: "notice", text: "y".repeat(300) }, work)).toMatchObject({
    message: { subject: `${"y".repeat(77)}...` },
  });
});

test("SP2c AC-3: the receiving policy, the hops, the concurrency and a tampered destination refuse; a reply passes the hop rule", () => {
  const w = workspace();
  expect(
    send(w.a.ctx, { to: "crm", type: "change-request", text: "add a field" }, null),
  ).toMatchObject({
    refused: "crm does not accept change-request (its policy accepts question, notice)",
  });
  const hopped = mailContext(w.a.paths, w.a.policy, {
    ...w.env,
    WIZARDINGCODE_CREW_MAIL_HOPS: "2",
    WIZARDINGCODE_CREW_MAIL_ID: "M-x",
  });
  expect(send(hopped, question(), null)).toMatchObject({
    refused:
      "this session is 2 hops from the first message and crm allows 2 (mail.maxHops); only a reply may go out",
  });
  // The reply from the hopped session: allowed.
  const first = send(
    w.b.ctx,
    { to: "storefront", type: "question", text: "Which values does loyalty_tier take?" },
    null,
  );
  if ("refused" in first) throw new Error(first.refused);
  const answered = reply(hopped, first.message.id, "gold, silver, none", {}, []);
  expect(answered).toMatchObject({
    reply: { replyTo: first.message.id, hops: 2 },
    original: { status: "done" },
  });
  // Concurrency: two sessions already open in crm, and crm not live.
  const registry = loadRegistry(w.a.paths.userDir);
  for (const p of registry.projects) if (p.name === "crm") p.lastHook = "2020-01-01T00:00:00.000Z";
  writeFileSync(join(w.a.paths.userDir, "projects.json"), JSON.stringify(registry));
  const crmBox = mailbox(w.b.paths.userDir, "shop", "crm");
  const inbox = readBox(crmBox.dir, "inbox").box;
  const opened = {
    mode: "read-only" as const,
    cwd: w.b.root,
    branch: null,
    pid: null,
    name: "crew-x",
    maxTurns: 40,
    maxMinutes: 30,
    startedAt: "2026-10-15T10:00:00.000Z",
    log: "x.log",
  };
  for (const n of [1, 2])
    inbox.messages.push({
      ...question(),
      id: `M-2026-10-15-00${n}-storefront`,
      at: "2026-10-15T10:00:00.000Z",
      from: { workspace: "shop", project: "storefront", item: null, agent: "session" },
      to: { workspace: "shop", project: "crm", item: null, agent: null },
      subject: "x",
      body: "x",
      replyTo: null,
      hops: 0,
      status: "sent",
      opened,
    } as Message);
  writeBox(crmBox.dir, "inbox", inbox);
  expect(send(w.a.ctx, question("Third"), null)).toMatchObject({
    refused: "crm has 2 sessions open (mail.maxConcurrent 2); try again when one ends",
  });
  // A destination whose policy was changed outside the engine.
  writeFileSync(
    join(w.b.paths.crewDir, "policy.json"),
    JSON.stringify({
      mail: {
        workspace: "shop",
        name: "crm",
        accept: ["question", "notice", "change-request"],
      },
    }),
  );
  setPolicyValue(w.b.paths, "mail.maxConcurrent", "3"); // records the hand edit's hash as the engine's, so the next edit is the tampering
  writeFileSync(
    join(w.b.paths.crewDir, "policy.json"),
    JSON.stringify({ mail: { workspace: "shop", name: "crm", accept: ["question"] } }),
  );
  expect(send(w.a.ctx, question("Fourth"), null)).toMatchObject({
    refused: "crm's policy changed outside the engine; its user accepts it with crew policy accept",
  });
});

test("SP2c AC-4: inbox, read, reply, refuse; a long body lives beside the inbox; second replies and strangers are refused", () => {
  const w = workspace();
  const long = "L".repeat(INLINE_BODY_LIMIT + 10);
  const sent = send(
    w.a.ctx,
    { to: "crm", type: "question", subject: "Long one", text: long },
    null,
  );
  if ("refused" in sent) throw new Error(sent.refused);
  expect(sent.message.body).toBe(`${long.slice(0, 200)}...`);
  expect(sent.message.bodyFile).toBe(
    join(mailbox(w.b.paths.userDir, "shop", "crm").dir, `${sent.message.id}.md`),
  );
  expect(readFileSync(sent.message.bodyFile ?? "", "utf8")).toBe(long);
  const inbox = ownInbox(w.b.ctx);
  expect(inbox.messages.map((m) => [m.id, m.status])).toEqual([[sent.message.id, "sent"]]);
  const read = markRead(w.b.ctx, sent.message.id, []);
  expect(read).toMatchObject({ status: "read" });
  expect(reply(w.a.ctx, sent.message.id, "I am not the addressee", {}, [])).toEqual({
    refused: `${sent.message.id} is addressed to crm, not to storefront`,
  });
  const answered = reply(w.b.ctx, sent.message.id, "Yes: gold, silver, none.", {}, []);
  if ("refused" in answered) throw new Error(answered.refused);
  expect(answered.reply).toMatchObject({
    from: { project: "crm", agent: "session" },
    to: { project: "storefront", agent: "session", item: null },
    type: "question",
    subject: "Re: Long one",
    replyTo: sent.message.id,
    status: "sent",
  });
  expect(answered.original.status).toBe("done");
  expect(ownInbox(w.a.ctx).messages.map((m) => m.replyTo)).toEqual([sent.message.id]);
  expect(reply(w.b.ctx, sent.message.id, "again", {}, [])).toEqual({
    refused: `${sent.message.id} is done; a second answer is a new message`,
  });
  // The sender's outbox learns the status at the next sync.
  syncMail(w.a.ctx, w.a.paths);
  const outbox = readBox(mailbox(w.a.paths.userDir, "shop", "storefront").dir, "outbox").box;
  expect(outbox.messages.find((m) => m.id === sent.message.id)?.status).toBe("done");
  // Refuse, and a reply to a refused message.
  const second = send(w.a.ctx, question("Second"), null);
  if ("refused" in second) throw new Error(second.refused);
  expect(refuseMail(w.b.ctx, second.message.id, "not this week", [])).toMatchObject({
    status: "refused",
    reason: "not this week",
  });
  expect(reply(w.b.ctx, second.message.id, "x", {}, [])).toEqual({
    refused: `${second.message.id} is refused; it has no answer`,
  });
  // A reply to a change request carries the branch, the child and its verdict.
  setPolicyValue(w.b.paths, "mail.open", "branch");
  writeFileSync(
    join(w.b.paths.crewDir, "policy.json"),
    JSON.stringify({
      mail: {
        workspace: "shop",
        name: "crm",
        open: "branch",
        accept: ["question", "notice", "change-request"],
      },
    }),
  );
  // (a hand edit of the list; the user accepts it with crew policy accept, which is recordIntegrity)
  recordIntegrity(w.b.paths, join(w.b.paths.crewDir, "policy.json"));
  const bCtx = mailContext(w.b.paths, loadPolicy(w.b.paths).policy, w.env);
  const change = send(
    w.a.ctx,
    { to: "crm", type: "change-request", text: "Add loyalty_tier to POST /customers" },
    null,
  );
  if ("refused" in change) throw new Error(change.refused);
  const child = createWork(w.b.paths, "Add loyalty_tier");
  const ev = loadEvidence(w.b.paths, child.id).evidence;
  ev.verdict = "proven";
  saveEvidence(w.b.paths, child.id, ev);
  // (checked before the answer: an answered message meets the "answered" rule first)
  expect(reply(bCtx, change.message.id, "x", { item: "nope" }, [])).toEqual({
    refused: "unknown work item: nope",
  });
  const done = reply(
    bCtx,
    change.message.id,
    "Built on the branch.",
    {
      branch: "crew/x/T-1",
      item: child.id,
    },
    [],
  );
  expect(done).toMatchObject({
    reply: { branch: "crew/x/T-1", item: child.id, verdict: "proven" },
  });
});

test("SP2c AC-5: a message to the judge comes from the lead only, the critics receive the proposals and nothing else, and role mail is relayed", () => {
  const w = workspace();
  const work = createWork(w.a.paths, "Delete accounts");
  write(w.a.root, `.crew/work/${work.id}/conclave/proposals.md`, "## P-1 (D-1)\nsoft delete\n");
  const asTask = mailContext(w.a.paths, w.a.policy, {
    ...w.env,
    WIZARDINGCODE_CREW_MAIL_AGENT: "T-1",
    WIZARDINGCODE_CREW_MAIL_ID: "M-x",
  });
  expect(
    send(asTask, { to: ".", agent: "judge", type: "question", text: "which line?" }, work),
  ).toMatchObject({
    refused: "a message to the judge comes from the lead (session), not from T-1",
  });
  expect(
    send(
      w.a.ctx,
      {
        to: ".",
        agent: "devils-advocate",
        type: "question",
        text: "what do you think of the reasoning?",
      },
      work,
    ),
  ).toMatchObject({
    refused: `a message to devils-advocate carries .crew/work/${work.id}/conclave/proposals.md (--file) and nothing else`,
  });
  // Another file, or the proposals with a text beside them: refused too.
  expect(
    send(
      w.a.ctx,
      { to: ".", agent: "fault-finder", type: "question", text: "", filePath: "README.md" },
      work,
    ),
  ).toMatchObject({
    refused: `a message to fault-finder carries .crew/work/${work.id}/conclave/proposals.md (--file) and nothing else`,
  });
  expect(
    send(
      w.a.ctx,
      {
        to: ".",
        agent: "devils-advocate",
        type: "question",
        text: "and be gentle",
        filePath: `.crew/work/${work.id}/conclave/proposals.md`,
      },
      work,
    ),
  ).toMatchObject({
    refused: `a message to devils-advocate carries .crew/work/${work.id}/conclave/proposals.md (--file) and nothing else`,
  });
  const ok = send(
    w.a.ctx,
    {
      to: ".",
      agent: "fault-finder",
      type: "question",
      text: "",
      filePath: `.crew/work/${work.id}/conclave/proposals.md`,
    },
    work,
  );
  expect(ok).toMatchObject({
    message: { to: { agent: "fault-finder" }, relayed: true, body: "## P-1 (D-1)\nsoft delete\n" },
    delivery: { kind: "self" },
  });
  const toExpert = send(
    w.a.ctx,
    {
      to: ".",
      agent: "expert-1",
      type: "question",
      text: "answer the objections",
      filePath: `.crew/work/${work.id}/conclave/proposals.md`,
    },
    work,
  );
  expect(toExpert).toMatchObject({ message: { relayed: true, to: { agent: "expert-1" } } });
  const toJudge = send(
    w.a.ctx,
    { to: ".", agent: "judge", type: "notice", text: "the reviewer's line is 220" },
    work,
  );
  expect(toJudge).toMatchObject({ message: { relayed: true } });
  // The relayed answer, recorded by the lead on the role's behalf (the hook does this in Task 3).
  if ("refused" in toExpert) throw new Error(toExpert.refused);
  if ("refused" in toJudge) throw new Error(toJudge.refused);
  const answered = reply(
    w.a.ctx,
    toExpert.message.id,
    "The objections do not touch the proposal's answer.",
    { as: "expert-1" },
    [],
  );
  expect(answered).toMatchObject({
    reply: { from: { agent: "expert-1" }, relayed: true, to: { agent: "session" } },
  });
  expect(reply(w.a.ctx, toJudge.message.id, "x", { as: "nobody" }, [])).toEqual({
    refused:
      "--as names a role: judge, researcher, expert-<n>, devils-advocate, fault-finder or review-<gate>",
  });
});

test("SP2c AC-6: the mailbox lock; a stale lock is taken; two writers lose nothing", () => {
  const w = workspace();
  const box = mailbox(w.b.paths.userDir, "shop", "crm");
  mkdirSync(box.dir, { recursive: true });
  const lock = join(box.dir, ".lock");
  mkdirSync(lock);
  const old = new Date(Date.now() - 20_000);
  utimesSync(lock, old, old);
  expect(withMailLock(box.dir, () => "ran")).toBe("ran");
  expect(existsSync(lock)).toBe(false);
  mkdirSync(lock);
  const started = Date.now();
  expect(() => withMailLock(box.dir, () => "never", { waitMs: 300 })).toThrow(
    `mailbox busy: ${lock} held for more than 300 ms`,
  );
  expect(Date.now() - started).toBeGreaterThanOrEqual(300);
  expect(existsSync(lock)).toBe(true);
  // Two processes, twenty messages each.
  const script = join(tempDir("crew-writer-"), "writer.ts");
  writeFileSync(
    script,
    `import { mailContext, send, registerProject } from "${join(import.meta.dir, "../src/mail.ts")}";
import { loadPolicy } from "${join(import.meta.dir, "../src/policy.ts")}";
import { resolvePaths } from "${join(import.meta.dir, "../src/paths.ts")}";
const paths = resolvePaths(process.argv[2]!, process.env)!;
const ctx = mailContext(paths, loadPolicy(paths).policy, process.env);
for (let i = 0; i < 20; i++) {
  const out = send(ctx, { to: "crm", type: "notice", text: process.argv[3] + " " + i }, null);
  if ("refused" in out) throw new Error(out.refused);
}
`,
  );
  // The lock from the previous assertion is still there: take it away first, as the stale rule would after ten seconds.
  utimesSync(lock, old, old);
  const env = { ...process.env, WIZARDINGCODE_HOME: w.env.WIZARDINGCODE_HOME ?? "" };
  // (both writers send from the storefront; the second process only differs by its argv)
  const runs = [0, 1].map((i) =>
    Bun.spawn(["bun", "run", script, w.a.root, `writer-${i}`], {
      env,
      stdout: "pipe",
      stderr: "pipe",
    }),
  );
  const codes = runs.map((r) => r.exited);
  return Promise.all(codes).then((exits) => {
    expect(exits).toEqual([0, 0]);
    const inbox = readBox(box.dir, "inbox").box;
    expect(inbox.messages).toHaveLength(40);
    expect(new Set(inbox.messages.map((m) => m.id)).size).toBe(40);
  });
});

test("SP2c AC-7: the registry knows root, name, workspace, liveness and worktrees; a gone root is skipped and pruned", () => {
  const w = workspace();
  const entries = loadRegistry(w.a.paths.userDir).projects;
  expect(entries.map((p) => [p.name, p.workspace, p.sessionId])).toEqual([
    ["storefront", "shop", "session-storefront"],
    ["crm", "shop", "session-crm"],
    ["wizardingcode-developer-crew", "wizardingcode", "session-wizardingcode-developer-crew"],
  ]);
  const crm = entries[1] as (typeof entries)[number];
  expect(isLive(crm)).toBe(true);
  expect(isLive({ ...crm, lastHook: new Date(Date.now() - 11 * 60_000).toISOString() })).toBe(
    false,
  );
  // A folder's name when the policy names none.
  const plain = repoPaths(makeRepo(), w.env);
  const plainEntry = registerProject(mailContext(plain, loadPolicy(plain).policy, w.env), "s");
  expect(plainEntry).toMatchObject({ name: basename(plain.root), workspace: null });
  // A refresh within the interval writes nothing; after it, lastSeen moves.
  const before = loadRegistry(w.a.paths.userDir).projects.find((p) => p.name === "crm")?.lastSeen;
  registerProject(w.b.ctx, "session-crm", { minIntervalMs: 60_000 });
  expect(loadRegistry(w.a.paths.userDir).projects.find((p) => p.name === "crm")?.lastSeen).toBe(
    before,
  );
  // A worktree of crm registers under crm's name, marked as its worktree, with the message that opened it.
  git(
    w.b.root,
    "worktree",
    "add",
    "-q",
    "-b",
    "crew/x/T-1",
    join(w.b.root, "..", `${basename(w.b.root)}-x-T-1`),
    "HEAD",
  );
  const wt = repoPaths(join(w.b.root, "..", `${basename(w.b.root)}-x-T-1`), w.env);
  const wtCtx = mailContext(wt, loadPolicy(wt).policy, {
    ...w.env,
    WIZARDINGCODE_CREW_MAIL_ID: "M-2026-10-15-003-crm",
    WIZARDINGCODE_CREW_MAIL_AGENT: "T-1",
  });
  expect(registerProject(wtCtx, "s-wt")).toMatchObject({
    name: "crm",
    worktreeOf: w.b.root,
    mail: "M-2026-10-15-003-crm",
  });
  expect(resolveProject(w.a.ctx, "crm")).toMatchObject({ entry: { root: w.b.root } });
  // A gone root.
  const registry = loadRegistry(w.a.paths.userDir);
  registry.projects.push({
    root: "/nowhere/warehouse",
    name: "warehouse",
    workspace: "shop",
    lastSeen: "2026-10-15T00:00:00.000Z",
    sessionId: "s",
  });
  writeFileSync(join(w.a.paths.userDir, "projects.json"), JSON.stringify(registry));
  expect(resolveProject(w.a.ctx, "warehouse")).toEqual({
    refused:
      "no project named warehouse in workspace shop; the registry knew one at /nowhere/warehouse, which is gone",
  });
  expect(pruneRegistry(w.a.paths.userDir)).toEqual(["/nowhere/warehouse"]);
  expect(loadRegistry(w.a.paths.userDir).projects.some((p) => p.name === "warehouse")).toBe(false);
  // Message ids count per sender per day.
  const outbox: Mailbox = { version: 1, messages: [] };
  expect(newMessageId(outbox, "storefront", "2026-10-15T10:00:00.000Z")).toBe(
    "M-2026-10-15-001-storefront",
  );
  outbox.messages.push(
    { id: "M-2026-10-15-001-storefront", at: "2026-10-15T10:00:00.000Z" } as Message,
    { id: "M-2026-10-14-007-storefront", at: "2026-10-14T10:00:00.000Z" } as Message,
  );
  expect(newMessageId(outbox, "storefront", "2026-10-15T11:00:00.000Z")).toBe(
    "M-2026-10-15-002-storefront",
  );
});

test("SP2c AC-6: a lock that cannot be created for a reason other than contention throws instead of spinning", () => {
  // In a child process with a time limit: a lock loop that never gives up would hang the test runner itself.
  const dir = tempDir("crew-locked-");
  chmodSync(dir, 0o555);
  const script = join(tempDir("crew-locker-"), "locker.ts");
  writeFileSync(
    script,
    `import { withMailLock } from "${join(import.meta.dir, "../src/mail.ts")}";
withMailLock(process.argv[2]!, () => "never", { waitMs: 300 });
`,
  );
  try {
    const run = Bun.spawnSync(["bun", "run", script, dir], {
      env: process.env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 3000,
    });
    expect(run.exitCode).toBe(1); // null when the time limit killed a loop that never ends
    expect(run.stderr.toString()).toContain("EACCES");
  } finally {
    chmodSync(dir, 0o755);
  }
});

test("SP2c AC-2: a mailbox changed outside the engine is never written; the send is refused and the files stay as the hand left them", () => {
  const w = workspace();
  const crmDir = mailbox(w.b.paths.userDir, "shop", "crm").dir;
  const ownDir = mailbox(w.a.paths.userDir, "shop", "storefront").dir;
  const first = send(w.a.ctx, question("First"), null);
  if ("refused" in first) throw new Error(first.refused);
  // The destination's inbox, hand-edited: refused, recorded in the sender's outbox, the inbox untouched.
  const forged = JSON.stringify({ version: 1, messages: [{ id: "forged" }] });
  writeFileSync(join(crmDir, "inbox.json"), forged);
  expect(send(w.a.ctx, question("Second"), null)).toMatchObject({
    refused:
      "crm's inbox changed outside the engine; files under the user's crew directory are written only by the crew command",
  });
  expect(readFileSync(join(crmDir, "inbox.json"), "utf8")).toBe(forged);
  const outbox = readBox(ownDir, "outbox").box;
  expect(outbox.messages[outbox.messages.length - 1]).toMatchObject({
    subject: "Second",
    status: "refused",
  });
  // A reply into that inbox is refused too, and the original is left as it was.
  const theirs = send(w.b.ctx, { to: "storefront", type: "question", text: "Hello?" }, null);
  if ("refused" in theirs) throw new Error(theirs.refused);
  expect(reply(w.a.ctx, theirs.message.id, "Hi.", {}, [])).toEqual({
    refused:
      "crm's inbox changed outside the engine; files under the user's crew directory are written only by the crew command",
  });
  expect(readFileSync(join(crmDir, "inbox.json"), "utf8")).toBe(forged);
  // The sender's own outbox, hand-edited: nothing can be recorded, so the refusal carries no message.
  writeFileSync(join(ownDir, "outbox.json"), forged);
  expect(send(w.a.ctx, question("Third"), null)).toEqual({
    refused:
      "storefront's outbox changed outside the engine; files under the user's crew directory are written only by the crew command",
    message: null,
  });
  expect(readFileSync(join(ownDir, "outbox.json"), "utf8")).toBe(forged);
});

test("SP2c AC-2: an empty message needs a text, whoever it is for", () => {
  const w = workspace();
  expect(
    send(w.b.ctx, { to: ".", agent: "expert-1", type: "question", text: "" }, null),
  ).toMatchObject({ refused: "a message needs a text (or --file)" });
  expect(send(w.a.ctx, { to: "crm", type: "notice", text: "  " }, null)).toMatchObject({
    refused: "a message needs a text (or --file)",
  });
});

test("SP2c AC-4: an inbox a hand changed is refused by read, refuse and reply, and nothing is written", () => {
  const w = workspace();
  const sent = send(w.a.ctx, question("Hand"), null);
  if ("refused" in sent) throw new Error(sent.refused);
  const crmDir = mailbox(w.b.paths.userDir, "shop", "crm").dir;
  const inbox = JSON.parse(readFileSync(join(crmDir, "inbox.json"), "utf8")) as Mailbox;
  (inbox.messages[0] as Message).subject = "FORGED";
  const forged = JSON.stringify(inbox);
  writeFileSync(join(crmDir, "inbox.json"), forged);
  const refusal = {
    refused:
      "crm's inbox changed outside the engine; files under the user's crew directory are written only by the crew command",
  };
  expect(markRead(w.b.ctx, sent.message.id, [])).toEqual(refusal);
  expect(refuseMail(w.b.ctx, sent.message.id, "no", [])).toEqual(refusal);
  expect(reply(w.b.ctx, sent.message.id, "yes", {}, [])).toEqual(refusal);
  expect(readFileSync(join(crmDir, "inbox.json"), "utf8")).toBe(forged);
  // Nothing was recorded anywhere: the sender's outbox still says sent.
  const outbox = readBox(mailbox(w.a.paths.userDir, "shop", "storefront").dir, "outbox");
  expect(outbox.box.messages.find((m) => m.id === sent.message.id)?.status).toBe("sent");
});

test("SP2c AC-7: two projects of one name in two workspaces are told apart by the workspace when statuses sync", () => {
  const w = workspace();
  // Another "crm" in another workspace, placed first in the registry: a lookup by name alone meets it first.
  const otherRoot = makeRepo({ "README.md": "# another crm\n" });
  const otherPaths = repoPaths(otherRoot, w.env);
  mkdirSync(otherPaths.crewDir, { recursive: true });
  writeFileSync(
    join(otherPaths.crewDir, "policy.json"),
    JSON.stringify({ mail: { workspace: "wizardingcode", name: "crm" } }),
  );
  registerProject(mailContext(otherPaths, loadPolicy(otherPaths).policy, w.env), "session-other");
  const registry = loadRegistry(w.a.paths.userDir);
  registry.projects = [
    ...registry.projects.filter((p) => p.root === otherRoot),
    ...registry.projects.filter((p) => p.root !== otherRoot),
  ];
  writeFileSync(join(w.a.paths.userDir, "projects.json"), JSON.stringify(registry));
  const sent = send(w.a.ctx, question("Which crm?"), null);
  if ("refused" in sent) throw new Error(sent.refused);
  expect(readBox(mailbox(w.b.paths.userDir, "shop", "crm").dir, "inbox").box.messages).toHaveLength(
    1,
  );
  expect(existsSync(join(w.a.paths.userDir, "mail", "wizardingcode", "crm", "inbox.json"))).toBe(
    false,
  );
  // The storefront is unknown to the registry while crm answers (its session gone), so the answer
  // reaches the storefront's outbox only through its own sync, which must find the right crm.
  const without = loadRegistry(w.a.paths.userDir);
  without.projects = without.projects.filter((p) => p.root !== w.a.root);
  writeFileSync(join(w.a.paths.userDir, "projects.json"), JSON.stringify(without));
  const answered = reply(w.b.ctx, sent.message.id, "This one.", {}, []);
  if ("refused" in answered) throw new Error(answered.refused);
  const before = readBox(mailbox(w.a.paths.userDir, "shop", "storefront").dir, "outbox");
  expect(before.box.messages.find((m) => m.id === sent.message.id)?.status).toBe("sent");
  registerProject(w.a.ctx, "session-storefront");
  syncMail(w.a.ctx, w.a.paths);
  const outbox = readBox(mailbox(w.a.paths.userDir, "shop", "storefront").dir, "outbox");
  expect(outbox.box.messages.find((m) => m.id === sent.message.id)?.status).toBe("done");
});

test("SP2c AC-7: syncMail copies nothing from an inbox a hand changed, a receiver's or its own, and the summary says so", () => {
  const w = workspace();
  const sent = send(w.a.ctx, question("Sync"), null);
  if ("refused" in sent) throw new Error(sent.refused);
  // The storefront out of the registry while crm answers: the answer reaches its outbox only through its own sync.
  const without = loadRegistry(w.a.paths.userDir);
  without.projects = without.projects.filter((p) => p.root !== w.a.root);
  writeFileSync(join(w.a.paths.userDir, "projects.json"), JSON.stringify(without));
  const answered = reply(w.b.ctx, sent.message.id, "Yes.", {}, []);
  if ("refused" in answered) throw new Error(answered.refused);
  registerProject(w.a.ctx, "session-storefront");
  // crm's inbox hand-edited after the answer: the sync copies nothing from it.
  const crmDir = mailbox(w.b.paths.userDir, "shop", "crm").dir;
  const crmInbox = JSON.parse(readFileSync(join(crmDir, "inbox.json"), "utf8")) as Mailbox;
  (crmInbox.messages[0] as Message).subject = "FORGED";
  writeFileSync(join(crmDir, "inbox.json"), JSON.stringify(crmInbox));
  expect(syncMail(w.a.ctx, w.a.paths).updated).toBe(0);
  const ownDir = mailbox(w.a.paths.userDir, "shop", "storefront").dir;
  expect(readBox(ownDir, "outbox").box.messages.find((m) => m.id === sent.message.id)?.status).toBe(
    "sent",
  );
  // The storefront's own inbox hand-edited: nothing new is reported, nothing recorded, and the summary says why.
  const own = JSON.parse(readFileSync(join(ownDir, "inbox.json"), "utf8")) as Mailbox;
  (own.messages[0] as Message).subject = "FORGED";
  const forged = JSON.stringify(own);
  writeFileSync(join(ownDir, "inbox.json"), forged);
  const synced = syncMail(w.a.ctx, w.a.paths);
  expect(synced.newMail).toEqual([]);
  expect(synced.tampered).toBe(true);
  expect(readFileSync(join(ownDir, "inbox.json"), "utf8")).toBe(forged);
  expect(inboxSummary(w.a.ctx)).toEqual({
    messages: [],
    unread: 0,
    answered: 0,
    waiting: 0,
    blockers: [],
    tampered: true,
    line: "storefront's inbox changed outside the engine; files under the user's crew directory are written only by the crew command",
  });
});

test("SP2c 8a AC-3: a command's registration never makes a project live; a hook's does, and a later command keeps the hook's mark", () => {
  const w = workspace();
  const plain = repoPaths(makeRepo(), w.env);
  const ctx = mailContext(plain, loadPolicy(plain).policy, w.env);
  // `crew detect`, or any command: registered, listed, not live.
  const byCommand = registerProject(ctx, "cli");
  expect(byCommand.lastHook).toBeUndefined();
  expect(isLive(byCommand)).toBe(false);
  // A hook marks the entry even within the interval when it has no mark yet; the mark ages out.
  const byHook = registerProject(ctx, "cli", { minIntervalMs: 60_000, hook: true });
  expect(typeof byHook.lastHook).toBe("string");
  expect(isLive(byHook)).toBe(true);
  expect(isLive({ ...byHook, lastHook: new Date(Date.now() - 11 * 60_000).toISOString() })).toBe(
    false,
  );
  // A command after the hook keeps the hook's mark.
  expect(registerProject(ctx, "cli").lastHook).toBe(byHook.lastHook);
});

// ---------------------------------------------------------------------------------------------
// SP7b Task 1: priorities and statuses

/** The two projects of one workspace, the receiver taking every kind of mail. */
function receiving() {
  return workspace(testEnv(), ["question", "notice", "change-request", "blocker"]);
}

function sendOrThrow(
  ctx: ReturnType<typeof workspace>["a"]["ctx"],
  request: Parameters<typeof send>[1],
): Message {
  const out = send(ctx, request, null);
  if ("refused" in out) throw new Error(out.refused);
  return out.message;
}

const crmInbox = (w: ReturnType<typeof workspace>) => mailbox(w.b.paths.userDir, "shop", "crm").dir;
const storefrontOutbox = (w: ReturnType<typeof workspace>) =>
  mailbox(w.a.paths.userDir, "shop", "storefront").dir;

test("SP7b AC-1: a message carries the sender's proposed priority and the receiver's decision; a raise, a lowering without a reason, a question and a notice are refused", () => {
  const w = receiving();
  const high = sendOrThrow(w.a.ctx, {
    to: "crm",
    type: "change-request",
    priority: "high",
    text: "Add loyalty_tier",
  });
  expect(high.priority).toBe("high");
  const copy = (id: string) => ownInbox(w.b.ctx).messages.find((m) => m.id === id);
  expect(copy(high.id)?.priority).toBe("high");
  const blocker = sendOrThrow(w.a.ctx, { to: "crm", type: "blocker", text: "Checkout is down" });
  expect(blocker.priority).toBe("blocker");
  expect(priorityOf(blocker)).toBe("blocker");
  const q = sendOrThrow(w.a.ctx, question());
  expect(priorityOf(q)).toBe("normal");
  // An invalid value is refused before any record.
  const outboxCount = () => readBox(storefrontOutbox(w), "outbox").box.messages.length;
  const before = outboxCount();
  expect(
    send(
      w.a.ctx,
      { to: "crm", type: "question", priority: "urgent" as MailPriority, text: "x" },
      null,
    ),
  ).toEqual({
    refused: "priority is one of blocker, high, normal, low, not urgent",
    message: null,
  });
  expect(outboxCount()).toBe(before);
  // A request carrying a status and a decision beside its fields lands as sent, undecided.
  const forged = sendOrThrow(w.a.ctx, {
    to: "crm",
    type: "change-request",
    text: "Forged",
    status: "done",
    priorityDecision: { proposed: "low", confirmed: "low", by: "x", reason: null, at: "now" },
  } as Parameters<typeof send>[1]);
  expect(forged.status).toBe("sent");
  expect(forged.priorityDecision).toBeUndefined();
  expect(copy(forged.id)).toMatchObject({ status: "sent" });
  expect(copy(forged.id)?.priorityDecision).toBeUndefined();
  // The same level confirms; both copies carry the decision.
  const confirmed = acceptMail(w.b.ctx, high.id, { priority: "high", by: "session" }, []);
  expect(confirmed).toMatchObject({
    message: {
      status: "accepted",
      priorityDecision: {
        proposed: "high",
        confirmed: "high",
        by: "session",
        reason: null,
        at: expect.any(String),
      },
    },
  });
  expect(copy(high.id)).toMatchObject({
    status: "accepted",
    priorityDecision: { confirmed: "high" },
  });
  syncMail(w.a.ctx, w.a.paths);
  expect(
    readBox(storefrontOutbox(w), "outbox").box.messages.find((m) => m.id === high.id),
  ).toMatchObject({
    status: "accepted",
    priorityDecision: { proposed: "high", confirmed: "high", by: "session", reason: null },
  });
  // A lower level needs a reason, stored as one line.
  const lowered = acceptMail(
    w.b.ctx,
    blocker.id,
    { priority: "normal", reason: "no client\nflow is down", by: "session" },
    [],
  );
  expect(lowered).toMatchObject({
    message: {
      status: "accepted",
      priorityDecision: {
        proposed: "blocker",
        confirmed: "normal",
        reason: "no client flow is down",
      },
    },
  });
  // Without a reason, above the proposal, on a question or a notice: refused, the record unchanged.
  const second = sendOrThrow(w.a.ctx, {
    to: "crm",
    type: "change-request",
    priority: "high",
    text: "Second",
  });
  const record = () => JSON.stringify(copy(second.id));
  const untouched = record();
  expect(acceptMail(w.b.ctx, second.id, { priority: "normal", by: "session" }, [])).toEqual({
    refused: 'a lowering needs --reason "<why>"',
  });
  expect(acceptMail(w.b.ctx, second.id, { priority: "blocker", by: "session" }, [])).toEqual({
    refused: `${second.id} was proposed high; the receiver confirms or lowers, never raises`,
  });
  expect(record()).toBe(untouched);
  expect(acceptMail(w.b.ctx, q.id, { by: "session" }, [])).toEqual({
    refused: "a question is done by its reply; accept applies to a change request or a blocker",
  });
  const notice = sendOrThrow(w.a.ctx, { to: "crm", type: "notice", text: "FYI" });
  expect(acceptMail(w.b.ctx, notice.id, { by: "session" }, [])).toEqual({
    refused: "a notice is done when read; accept applies to a change request or a blocker",
  });
  // No priority given: the proposal is confirmed as it stands.
  expect(acceptMail(w.b.ctx, second.id, { by: "session" }, [])).toMatchObject({
    message: { priorityDecision: { proposed: "high", confirmed: "high" } },
  });
  expect(decidedPriority(copy(second.id) as Message)).toBe("high");
});

test("SP7b AC-2: the inbox is ordered by priority then age; an unknown priority ranks as normal and the record is left as it is", () => {
  const w = receiving();
  sendOrThrow(w.a.ctx, { to: "crm", type: "question", text: "normal one" });
  sendOrThrow(w.a.ctx, { to: "crm", type: "blocker", text: "the blocker" });
  sendOrThrow(w.a.ctx, { to: "crm", type: "change-request", priority: "high", text: "the high" });
  sendOrThrow(w.a.ctx, { to: "crm", type: "question", priority: "high", text: "high two" });
  sendOrThrow(w.a.ctx, { to: "crm", type: "notice", priority: "low", text: "the low" });
  const subjects = () => ownInbox(w.b.ctx).messages.map((m) => m.subject);
  expect(subjects()).toEqual(["the blocker", "the high", "high two", "normal one", "the low"]);
  // A record another engine wrote with a value this one does not know ranks as normal, listed.
  const dir = crmInbox(w);
  const box = readBox(dir, "inbox").box;
  const normal = box.messages.find((m) => m.subject === "normal one") as Message;
  (normal as { priority?: string }).priority = "urgent";
  writeBox(dir, "inbox", box);
  const bytes = readFileSync(join(dir, "inbox.json"));
  expect(priorityOf(normal)).toBe("normal");
  expect(subjects()).toEqual(["the blocker", "the high", "high two", "normal one", "the low"]);
  expect(readFileSync(join(dir, "inbox.json")).equals(bytes)).toBe(true);
});

test("SP7b AC-3: the statuses are the seven plus expired; old spellings read mapped through mailStatus and are never rewritten; the summary counts through the map", () => {
  expect(Object.keys(MAIL_TRANSITIONS)).toEqual([
    "sent",
    "read",
    "accepted",
    "in-progress",
    "blocked",
    "done",
    "refused",
    "expired",
  ]);
  const at = (status: string) => ({ status }) as Message;
  expect(mailStatus(at("answered"))).toBe("done");
  expect(mailStatus(at("waiting-for-person"))).toBe("blocked");
  expect(mailStatus(at("stopped"))).toBe("refused");
  expect(mailStatus(at("forged"))).toBe("sent");
  for (const s of Object.keys(MAIL_TRANSITIONS) as MappedStatus[])
    expect(mailStatus(at(s))).toBe(s);
  const w = receiving();
  const oldWait = sendOrThrow(w.a.ctx, { to: "crm", type: "change-request", text: "old wait" });
  const newBlock = sendOrThrow(w.a.ctx, { to: "crm", type: "change-request", text: "new block" });
  const notice = sendOrThrow(w.a.ctx, { to: "crm", type: "notice", text: "a notice" });
  sendOrThrow(w.a.ctx, question("fresh"));
  const dir = crmInbox(w);
  const box = readBox(dir, "inbox").box;
  const set = (id: string, status: string) => {
    (box.messages.find((m) => m.id === id) as { status: string }).status = status;
  };
  set(oldWait.id, "waiting-for-person");
  set(newBlock.id, "blocked");
  set(notice.id, "done");
  writeBox(dir, "inbox", box);
  const summary = inboxSummary(w.b.ctx);
  expect(summary.waiting).toBe(2);
  expect(summary.unread).toBe(1);
  expect(ownInbox(w.b.ctx).messages.find((m) => m.id === oldWait.id)?.status).toBe(
    "waiting-for-person",
  );
});

test("SP7b AC-4: a status moves only along the table; a reply closes a request only with a proven child; the child id is confined to this project", () => {
  const w = receiving();
  const q = sendOrThrow(w.a.ctx, question("Q"));
  const notice = sendOrThrow(w.a.ctx, { to: "crm", type: "notice", text: "N" });
  expect(transition(q, "done")).toEqual({ refused: `${q.id} is sent; it cannot become done` });
  expect(transition(notice, "done")).toMatchObject({ status: "done" });
  expect(transition({ ...q, status: "done" }, "read")).toEqual({
    refused: `${q.id} is done; it cannot become read`,
  });
  // A 0.6.0 record moves from its mapped status, and only its status changes.
  const old: Message = { ...q, status: "waiting-for-person" };
  expect(transition(old, "in-progress")).toEqual({ ...old, status: "in-progress" });
  // The writers go through the table.
  expect(markRead(w.b.ctx, notice.id, [])).toMatchObject({
    status: "done",
    readAt: expect.any(String),
  });
  const answered = reply(w.b.ctx, q.id, "A", {}, []);
  if ("refused" in answered) throw new Error(answered.refused);
  expect(answered.original).toMatchObject({ status: "done", answeredAt: expect.any(String) });
  expect(reply(w.b.ctx, q.id, "again", {}, [])).toEqual({
    refused: `${q.id} is done; a second answer is a new message`,
  });
  // A 0.6.0 record at answered is done.
  const oldAnswered = sendOrThrow(w.a.ctx, {
    to: "crm",
    type: "change-request",
    text: "Old answered",
  });
  const dir = crmInbox(w);
  const box = readBox(dir, "inbox").box;
  (box.messages.find((m) => m.id === oldAnswered.id) as { status: string }).status = "answered";
  writeBox(dir, "inbox", box);
  expect(reply(w.b.ctx, oldAnswered.id, "x", {}, [])).toEqual({
    refused: `${oldAnswered.id} is done; a second answer is a new message`,
  });
  // A change request: the child's verdict decides, read from its evidence; the id stays in this project.
  const change = sendOrThrow(w.a.ctx, {
    to: "crm",
    type: "change-request",
    text: "Add loyalty_tier",
  });
  const child = createWork(w.b.paths, "Add loyalty_tier");
  const ev = loadEvidence(w.b.paths, child.id).evidence;
  ev.verdict = "unproven";
  ev.unproven = ["gate test failing"];
  saveEvidence(w.b.paths, child.id, ev);
  const outboxCount = () =>
    readBox(mailbox(w.b.paths.userDir, "shop", "crm").dir, "outbox").box.messages.length;
  const before = outboxCount();
  expect(reply(w.b.ctx, change.id, "x", { item: "../x" }, [])).toEqual({
    refused: "unknown work item: ../x",
  });
  expect(outboxCount()).toBe(before);
  const blocked = reply(w.b.ctx, change.id, "Built, not proven", { item: child.id }, []);
  if ("refused" in blocked) throw new Error(blocked.refused);
  expect(blocked.original).toMatchObject({
    status: "blocked",
    reason: "unproven: gate test failing",
    verdict: "unproven",
  });
  ev.verdict = "proven";
  ev.unproven = [];
  saveEvidence(w.b.paths, child.id, ev);
  const done = reply(w.b.ctx, change.id, "Proven now", { item: child.id }, []);
  if ("refused" in done) throw new Error(done.refused);
  expect(done.original).toMatchObject({ status: "done", verdict: "proven" });
  // No child named: blocked with the reason; accepted and in-progress originals take a reply.
  const bare = sendOrThrow(w.a.ctx, { to: "crm", type: "change-request", text: "Bare" });
  const noItem = reply(w.b.ctx, bare.id, "x", {}, []);
  if ("refused" in noItem) throw new Error(noItem.refused);
  expect(noItem.original).toMatchObject({
    status: "blocked",
    reason: "the reply names no child item (--item)",
  });
  const accepted = sendOrThrow(w.a.ctx, {
    to: "crm",
    type: "change-request",
    text: "Accepted one",
  });
  acceptMail(w.b.ctx, accepted.id, { by: "session" }, []);
  expect(reply(w.b.ctx, accepted.id, "x", { item: child.id }, [])).toMatchObject({
    original: { status: "done" },
  });
  const inProgress = sendOrThrow(w.a.ctx, {
    to: "crm",
    type: "change-request",
    text: "In progress one",
  });
  const box2 = readBox(dir, "inbox").box;
  const index = box2.messages.findIndex((m) => m.id === inProgress.id);
  box2.messages[index] = transition(box2.messages[index] as Message, "in-progress") as Message;
  writeBox(dir, "inbox", box2);
  expect(reply(w.b.ctx, inProgress.id, "x", { item: child.id }, [])).toMatchObject({
    original: { status: "done" },
  });
});

// ---------------------------------------------------------------------------------------------
// SP7b Task 2: threads, contracts and the evidence in a reply

/** A fourth project of the receiving workspace, registered live, taking every kind of mail. */
function warehouse(w: ReturnType<typeof workspace>) {
  const root = makeRepo({ "README.md": "# warehouse\n" });
  const paths = repoPaths(root, w.env);
  mkdirSync(paths.crewDir, { recursive: true });
  writeFileSync(
    join(paths.crewDir, "policy.json"),
    JSON.stringify({
      mail: {
        workspace: "shop",
        name: "warehouse",
        accept: ["question", "notice", "change-request", "blocker"],
      },
    }),
  );
  const policy = loadPolicy(paths).policy;
  const ctx = mailContext(paths, policy, w.env);
  registerProject(ctx, "session-warehouse", { hook: true });
  return { root, paths, policy, ctx };
}

const crmOutbox = (w: ReturnType<typeof workspace>) =>
  readBox(mailbox(w.b.paths.userDir, "shop", "crm").dir, "outbox").box.messages;

/** A gate run of a child's evidence, with the fields the record needs. */
function gateRun(gate: string, status: "pass" | "fail"): GateRun {
  return {
    gate: gate as GateRun["gate"],
    target: ".",
    command: "x",
    commandSource: "confirmed",
    confirmed: true,
    exit: status === "pass" ? 0 : 1,
    status,
    durationMs: 1,
    at: "2026-10-18T10:00:00.000Z",
    log: null,
    tail: "",
    fingerprint: "f",
  };
}

test("SP7b-T2 AC-1: a thread is its root's id, inherited by every reply; --thread joins a party up to mail.maxParties, never a role", () => {
  const w = receiving();
  warehouse(w);
  const q = sendOrThrow(w.a.ctx, question("Root Q"));
  expect(threadOf(q)).toBe(q.id);
  const answered = reply(w.b.ctx, q.id, "A", {}, []);
  if ("refused" in answered) throw new Error(answered.refused);
  expect(answered.reply.thread).toBe(q.id);
  expect(ownInbox(w.a.ctx).messages.find((m) => m.id === answered.reply.id)?.thread).toBe(q.id);
  expect(crmOutbox(w).find((m) => m.id === answered.reply.id)?.thread).toBe(q.id);
  // A thread another engine wrote with a value that is not a message id reads as its own root.
  const dir = crmInbox(w);
  const box = readBox(dir, "inbox").box;
  (box.messages.find((m) => m.id === q.id) as { thread?: string }).thread = "../x";
  writeBox(dir, "inbox", box);
  expect(threadOf(ownInbox(w.b.ctx).messages.find((m) => m.id === q.id) as Message)).toBe(q.id);
  // A third party joins, with the root's subject quoted.
  const joined = sendOrThrow(w.b.ctx, {
    to: "warehouse",
    type: "question",
    thread: q.id,
    text: "Can you ship it?",
  });
  expect(joined.thread).toBe(q.id);
  expect(joined.subject).toBe('"Root Q"');
  const held = [...ownInbox(w.b.ctx).messages, ...crmOutbox(w)];
  expect(threadParties(held, q.id).sort()).toEqual(["crm", "storefront", "warehouse"]);
  // The cap, tightened to 2 on the sender: a thread of two parties takes no third; one already in passes.
  const q2 = sendOrThrow(w.a.ctx, question("Root Q2"));
  writeFileSync(
    join(w.b.paths.crewDir, "policy.json"),
    JSON.stringify({
      mail: {
        workspace: "shop",
        name: "crm",
        accept: ["question", "notice", "change-request", "blocker"],
        maxParties: 2,
      },
    }),
  );
  recordIntegrity(w.b.paths, join(w.b.paths.crewDir, "policy.json"));
  const bCtx = mailContext(w.b.paths, loadPolicy(w.b.paths).policy, w.env);
  const before = crmOutbox(w).length;
  expect(send(bCtx, { to: "warehouse", type: "question", thread: q2.id, text: "x" }, null)).toEqual(
    {
      refused: `thread ${q2.id} has 2 parties (mail.maxParties 2); warehouse cannot join`,
      message: null,
    },
  );
  expect(crmOutbox(w).length).toBe(before);
  expect(
    send(bCtx, { to: "storefront", type: "question", thread: q2.id, text: "back to you" }, null),
  ).toMatchObject({ message: { thread: q2.id } });
  // Never a role; an unknown root.
  expect(
    send(
      bCtx,
      { to: ".", agent: "review-code-quality", type: "question", thread: q2.id, text: "x" },
      null,
    ),
  ).toEqual({ refused: "a thread joins projects and tasks, never roles", message: null });
  expect(
    send(bCtx, { to: "storefront", type: "question", thread: "M-nope", text: "x" }, null),
  ).toEqual({ refused: "no message M-nope in this project's mail", message: null });
});

test("SP7b-T2 AC-2: a contract is checked at the branch's tip, never the working tree, and a failing check refuses the reply before any record", () => {
  const w = receiving();
  const root = w.b.root;
  git(root, "checkout", "-q", "-b", "crew/x/T-1");
  write(root, "src/types.ts", "export type A = 1;\n");
  write(root, "docs/plain.txt", "plain\n");
  git(root, "add", "src/types.ts", "docs/plain.txt");
  git(root, "commit", "-q", "-m", "first");
  const child = createWork(w.b.paths, "Add the field");
  expect(child.baseCommit).toBe(git(root, "rev-parse", "HEAD"));
  write(root, "src/types.ts", "export type A = 2;\n");
  write(root, "docs/api.json", '{"openapi":"3.1.0"}\n');
  write(root, "docs/api.yaml", "openapi: 3.1.0\n");
  write(root, "docs/bad.json", "{nope\n");
  git(root, "add", "src/types.ts", "docs/api.json", "docs/api.yaml", "docs/bad.json");
  git(root, "commit", "-q", "-m", "second");
  git(root, "checkout", "-q", "main");
  write(root, "src/wt.ts", "x\n");
  // The working tree is main's: it holds no src/types.ts at all, and an uncommitted src/wt.ts.
  expect(existsSync(join(root, "src/types.ts"))).toBe(false);
  const change = sendOrThrow(w.a.ctx, { to: "crm", type: "change-request", text: "Add the field" });
  const tip = (path: string) =>
    createHash("sha256")
      .update(execFileSync("git", ["show", `crew/x/T-1:${path}`], { cwd: root }))
      .digest("hex");
  const before = crmOutbox(w).length;
  const refused = (
    contracts: string[],
    options: { branch?: string; item?: string } = { branch: "crew/x/T-1", item: child.id },
    text = "Done.\n\n## Contracts\n- as said",
  ) => {
    const out = reply(w.b.ctx, change.id, text, { ...options, contracts }, []);
    expect(crmOutbox(w).length).toBe(before);
    return out;
  };
  expect(refused(["types:docs/plain.txt"])).toEqual({
    refused: "contract types:docs/plain.txt is not in the child's diff",
  });
  expect(refused(["types:src/wt.ts"])).toEqual({
    refused: "contract types:src/wt.ts is not at the tip of crew/x/T-1",
  });
  expect(refused(["openapi:docs/bad.json"])).toEqual({
    refused: "contract openapi:docs/bad.json does not parse as JSON",
  });
  expect(refused(["openapi:docs/missing.yaml"])).toEqual({
    refused: "contract openapi:docs/missing.yaml is not at the tip of crew/x/T-1",
  });
  expect(refused(["schema:docs/plain.txt"])).toEqual({
    refused: "contract schema:docs/plain.txt has no openapi, swagger or $schema line",
  });
  expect(refused(["clause:x"], undefined, "no section")).toEqual({
    refused: 'contract clause needs a "## Contracts" section in the reply',
  });
  expect(refused(["types:../x.ts"])).toEqual({
    refused: "contract types:../x.ts names a path outside the project",
  });
  expect(refused(["types:/etc/passwd"])).toEqual({
    refused: "contract types:/etc/passwd names a path outside the project",
  });
  expect(refused(["bogus:x"])).toEqual({
    refused:
      "a contract is openapi:<path>, types:<path>, schema:<path> or clause:<summary>, not bogus:x",
  });
  expect(refused(["types:src/types.ts"], { item: child.id })).toEqual({
    refused: "a contract needs --branch <b>: the file is checked at its tip",
  });
  expect(refused(["types:src/types.ts"], { branch: "-x", item: child.id })).toEqual({
    refused: "--branch -x is not a branch name",
  });
  expect(refused(["types:src/types.ts"], { branch: "a..b", item: child.id })).toEqual({
    refused: "--branch a..b is not a branch name",
  });
  expect(refused(["clause:x"], { branch: "crew/x/T-1" })).toEqual({
    refused: "a contract comes with the child item (--item)",
  });
  const orphan = createWork(w.b.paths, "No base");
  orphan.baseCommit = null;
  saveWork(w.b.paths, orphan);
  expect(refused(["types:src/types.ts"], { branch: "crew/x/T-1", item: orphan.id })).toEqual({
    refused: "contract types:src/types.ts cannot be checked: the child has no base commit",
  });
  // The four kinds, checked at the tip.
  const landed = reply(
    w.b.ctx,
    change.id,
    "Done.\n\n## Contracts\n- no breaking change",
    {
      branch: "crew/x/T-1",
      item: child.id,
      contracts: [
        "openapi:docs/api.json",
        "schema:docs/api.yaml",
        "types:src/types.ts",
        "clause:no breaking change",
      ],
    },
    [],
  );
  if ("refused" in landed) throw new Error(landed.refused);
  expect(landed.reply.contracts).toEqual([
    { kind: "openapi", path: "docs/api.json", hash: tip("docs/api.json"), summary: "" },
    { kind: "schema", path: "docs/api.yaml", hash: tip("docs/api.yaml"), summary: "" },
    { kind: "types", path: "src/types.ts", hash: tip("src/types.ts"), summary: "" },
    { kind: "clause", path: null, hash: null, summary: "no breaking change" },
  ]);
  expect(tip("src/types.ts")).toBe(
    createHash("sha256").update("export type A = 2;\n").digest("hex"),
  );
});

test("SP7b-T2 AC-3: a reply carries the child's evidence read from disk, and its reader validates what another party wrote", () => {
  const w = receiving();
  const change = sendOrThrow(w.a.ctx, { to: "crm", type: "change-request", text: "Add the field" });
  const child = createWork(w.b.paths, "Add the field");
  const ev = loadEvidence(w.b.paths, child.id).evidence;
  ev.fingerprint = "sha256:abc";
  ev.runs = [
    gateRun("test", "pass"),
    gateRun("lint", "pass"),
    gateRun("typecheck", "fail"),
    gateRun("bogus", "pass"),
  ];
  saveEvidence(w.b.paths, child.id, ev);
  const first = reply(w.b.ctx, change.id, "Built", { branch: "crew/x/T-1", item: child.id }, []);
  if ("refused" in first) throw new Error(first.refused);
  expect(first.reply.evidence).toEqual({
    report: null,
    fingerprint: "sha256:abc",
    gatesPassed: ["test", "lint"],
  });
  writeFileSync(join(w.b.root, ".crew", "work", child.id, "report.md"), "# Report\n");
  const second = reply(
    w.b.ctx,
    change.id,
    "Built again",
    { branch: "crew/x/T-1", item: child.id },
    [],
  );
  if ("refused" in second) throw new Error(second.refused);
  expect(second.reply.evidence).toEqual({
    report: `.crew/work/${child.id}/report.md`,
    fingerprint: "sha256:abc",
    gatesPassed: ["test", "lint"],
  });
  const q = sendOrThrow(w.a.ctx, question("Q"));
  const plain = reply(w.b.ctx, q.id, "A", {}, []);
  if ("refused" in plain) throw new Error(plain.refused);
  expect(plain.reply.evidence).toBeUndefined();
  // The reader, on records another party wrote.
  const forged = (evidence: unknown) => readEvidence({ ...q, evidence } as unknown as Message);
  expect(
    forged({ report: "../../etc/x", fingerprint: 5, gatesPassed: ["test", "bogus", 3] }),
  ).toEqual({
    report: null,
    fingerprint: null,
    gatesPassed: ["test"],
  });
  expect(forged({ report: ".crew/work/../../etc/x", fingerprint: "f", gatesPassed: [] })).toEqual({
    report: null,
    fingerprint: "f",
    gatesPassed: [],
  });
  expect(
    forged({ report: "/abs/.crew/work/x/report.md", fingerprint: "f", gatesPassed: [] }),
  ).toEqual({ report: null, fingerprint: "f", gatesPassed: [] });
  expect(
    forged({ report: ".crew/work/x/report.md", fingerprint: "f", gatesPassed: ["lint"] }),
  ).toEqual({ report: ".crew/work/x/report.md", fingerprint: "f", gatesPassed: ["lint"] });
  expect(readEvidence(q)).toBeNull();
});
