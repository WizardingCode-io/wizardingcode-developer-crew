import { expect, test } from "bun:test";
import { chmodSync, existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import {
  INLINE_BODY_LIMIT,
  inboxSummary,
  isLive,
  loadRegistry,
  mailbox,
  mailContext,
  markRead,
  newMessageId,
  ownInbox,
  pruneRegistry,
  readBox,
  refuseMail,
  registerProject,
  reply,
  resolveProject,
  send,
  syncMail,
  withMailLock,
  writeBox,
} from "../src/mail.ts";
import { loadPolicy, setPolicyValue } from "../src/policy.ts";
import { readProtectedJson, recordIntegrity } from "../src/store.ts";
import type { Mailbox, Message } from "../src/types.ts";
import { createWork } from "../src/work.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

/** Two projects of one workspace and a third outside it, each registered as a session would. */
function workspace(env = testEnv()) {
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
    registerProject(ctx, `session-${name}`);
    return { root, paths, policy, ctx };
  };
  return {
    env,
    a: make("storefront", "clubefashion"),
    b: make("crm", "clubefashion", { accept: ["question", "notice"] }),
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
      "wizardingcode-developer-crew is not in workspace clubefashion (it is in wizardingcode); mail never leaves the workspace",
  });
  const outbox = readBox(
    mailbox(w.a.paths.userDir, "clubefashion", "storefront").dir,
    "outbox",
  ).box;
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
    refused: "no project named warehouse in workspace clubefashion (known: crm, storefront)",
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
    from: { workspace: "clubefashion", project: "storefront", item: work.id, agent: "session" },
    to: { workspace: "clubefashion", project: "crm", agent: null, item: null },
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
  const inbox = readBox(mailbox(w.b.paths.userDir, "clubefashion", "crm").dir, "inbox").box;
  expect(inbox.messages.map((m) => m.id)).toEqual([out.message.id]);
  const itemCopy = readProtectedJson<Mailbox>(
    w.a.paths,
    join(w.a.paths.crewDir, "work", work.id, "mail.json"),
  );
  expect(itemCopy.tampered).toBe(false);
  expect(itemCopy.data?.messages.map((m) => m.id)).toEqual([out.message.id]);
  // crm not live: a question opens a read-only session; a change request is queued (crm does not open on a branch).
  const registry = loadRegistry(w.a.paths.userDir);
  for (const p of registry.projects) if (p.name === "crm") p.lastSeen = "2020-01-01T00:00:00.000Z";
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
    original: { status: "answered" },
  });
  // Concurrency: two sessions already open in crm, and crm not live.
  const registry = loadRegistry(w.a.paths.userDir);
  for (const p of registry.projects) if (p.name === "crm") p.lastSeen = "2020-01-01T00:00:00.000Z";
  writeFileSync(join(w.a.paths.userDir, "projects.json"), JSON.stringify(registry));
  const crmBox = mailbox(w.b.paths.userDir, "clubefashion", "crm");
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
      from: { workspace: "clubefashion", project: "storefront", item: null, agent: "session" },
      to: { workspace: "clubefashion", project: "crm", item: null, agent: null },
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
        workspace: "clubefashion",
        name: "crm",
        accept: ["question", "notice", "change-request"],
      },
    }),
  );
  setPolicyValue(w.b.paths, "mail.maxConcurrent", "3"); // records the hand edit's hash as the engine's, so the next edit is the tampering
  writeFileSync(
    join(w.b.paths.crewDir, "policy.json"),
    JSON.stringify({ mail: { workspace: "clubefashion", name: "crm", accept: ["question"] } }),
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
    join(mailbox(w.b.paths.userDir, "clubefashion", "crm").dir, `${sent.message.id}.md`),
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
  expect(answered.original.status).toBe("answered");
  expect(ownInbox(w.a.ctx).messages.map((m) => m.replyTo)).toEqual([sent.message.id]);
  expect(reply(w.b.ctx, sent.message.id, "again", {}, [])).toEqual({
    refused: `${sent.message.id} is answered; a second answer is a new message`,
  });
  // The sender's outbox learns the status at the next sync.
  syncMail(w.a.ctx, w.a.paths);
  const outbox = readBox(
    mailbox(w.a.paths.userDir, "clubefashion", "storefront").dir,
    "outbox",
  ).box;
  expect(outbox.messages.find((m) => m.id === sent.message.id)?.status).toBe("answered");
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
        workspace: "clubefashion",
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
  const box = mailbox(w.b.paths.userDir, "clubefashion", "crm");
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
    ["storefront", "clubefashion", "session-storefront"],
    ["crm", "clubefashion", "session-crm"],
    ["wizardingcode-developer-crew", "wizardingcode", "session-wizardingcode-developer-crew"],
  ]);
  const crm = entries[1] as (typeof entries)[number];
  expect(isLive(crm)).toBe(true);
  expect(isLive({ ...crm, lastSeen: new Date(Date.now() - 11 * 60_000).toISOString() })).toBe(
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
    workspace: "clubefashion",
    lastSeen: "2026-10-15T00:00:00.000Z",
    sessionId: "s",
  });
  writeFileSync(join(w.a.paths.userDir, "projects.json"), JSON.stringify(registry));
  expect(resolveProject(w.a.ctx, "warehouse")).toEqual({
    refused:
      "no project named warehouse in workspace clubefashion; the registry knew one at /nowhere/warehouse, which is gone",
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
  const crmDir = mailbox(w.b.paths.userDir, "clubefashion", "crm").dir;
  const ownDir = mailbox(w.a.paths.userDir, "clubefashion", "storefront").dir;
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
  const crmDir = mailbox(w.b.paths.userDir, "clubefashion", "crm").dir;
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
  const outbox = readBox(mailbox(w.a.paths.userDir, "clubefashion", "storefront").dir, "outbox");
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
  expect(
    readBox(mailbox(w.b.paths.userDir, "clubefashion", "crm").dir, "inbox").box.messages,
  ).toHaveLength(1);
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
  const before = readBox(mailbox(w.a.paths.userDir, "clubefashion", "storefront").dir, "outbox");
  expect(before.box.messages.find((m) => m.id === sent.message.id)?.status).toBe("sent");
  registerProject(w.a.ctx, "session-storefront");
  syncMail(w.a.ctx, w.a.paths);
  const outbox = readBox(mailbox(w.a.paths.userDir, "clubefashion", "storefront").dir, "outbox");
  expect(outbox.box.messages.find((m) => m.id === sent.message.id)?.status).toBe("answered");
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
  const crmDir = mailbox(w.b.paths.userDir, "clubefashion", "crm").dir;
  const crmInbox = JSON.parse(readFileSync(join(crmDir, "inbox.json"), "utf8")) as Mailbox;
  (crmInbox.messages[0] as Message).subject = "FORGED";
  writeFileSync(join(crmDir, "inbox.json"), JSON.stringify(crmInbox));
  expect(syncMail(w.a.ctx, w.a.paths).updated).toBe(0);
  const ownDir = mailbox(w.a.paths.userDir, "clubefashion", "storefront").dir;
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
