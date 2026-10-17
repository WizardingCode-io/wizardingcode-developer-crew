import { expect, test } from "bun:test";
import { chmodSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { onPrompt } from "../src/hooks/prompt.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { onStop } from "../src/hooks/stop.ts";
import {
  type Delivery,
  loadRegistry,
  mailbox,
  mailContext,
  readBox,
  registerProject,
  reply,
  send,
} from "../src/mail.ts";
import { isAlive, openForMail, readOutcome, sweepOpened, sweepSafely } from "../src/open.ts";
import { loadPolicy } from "../src/policy.ts";
import type { Message, TaskRecord } from "../src/types.ts";
import { addCriterion, createWork, loadWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

const FAKE = fileURLToPath(new URL("./fixtures/fake-claude.sh", import.meta.url));
const root = process.getuid?.() === 0;

function opening(delivery: Delivery): Extract<Delivery, { kind: "open" }> {
  if (delivery.kind !== "open") throw new Error(`delivery ${delivery.kind}, not open`);
  return delivery;
}

/** Polls a condition with a deadline, yielding to the event loop so a detached child is reaped between looks. */
async function waitFor(what: string, cond: () => boolean, ms = 8000): Promise<void> {
  const until = Date.now() + ms;
  while (!cond() && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  if (!cond()) throw new Error(`timed out waiting for ${what}`);
}

/** Two projects of one workspace; crm not live, so a question to it opens a session (the fake). */
function setup() {
  const env: NodeJS.ProcessEnv = { ...testEnv(), WIZARDINGCODE_CREW_CLAUDE: FAKE };
  const a = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    ".crew/policy.json": JSON.stringify({ mail: { workspace: "w", name: "storefront" } }),
  });
  const b = makeRepo({
    "README.md": "# crm\n",
    ".crew/policy.json": JSON.stringify({
      mail: { workspace: "w", name: "crm", accept: ["question"], maxMinutes: 1 },
    }),
  });
  // A third project, ops, takes questions too: a receiver whose mailbox stays writable while crm's
  // is not, so one session can settle while the next fails.
  const c = makeRepo({
    "README.md": "# ops\n",
    ".crew/policy.json": JSON.stringify({
      mail: { workspace: "w", name: "ops", accept: ["question"], maxMinutes: 1 },
    }),
  });
  const pa = repoPaths(a, env);
  const pb = repoPaths(b, env);
  const pc = repoPaths(c, env);
  const ctxA = mailContext(pa, loadPolicy(pa).policy, env);
  registerProject(ctxA, "sa");
  registerProject(mailContext(pb, loadPolicy(pb).policy, env), "sb");
  registerProject(mailContext(pc, loadPolicy(pc).policy, env), "sc");
  const registry = loadRegistry(pa.userDir);
  for (const p of registry.projects)
    if (p.name === "crm" || p.name === "ops") p.lastSeen = "2020-01-01T00:00:00.000Z";
  write(pa.userDir, "projects.json", JSON.stringify(registry));
  const hook = hookContext({ session_id: "s", cwd: a }, env);
  const outboxOf = (id: string): Message =>
    readBox(mailbox(pa.userDir, "w", "storefront").dir, "outbox").box.messages.find(
      (m) => m.id === id,
    ) as Message;
  /** A question to crm (or to `to`) whose session (the quick fake) has ended, not yet swept. */
  const ask = async (text: string, to = "crm") => {
    const sent = send(ctxA, { to, type: "question", text }, null);
    if ("refused" in sent) throw new Error(sent.refused);
    openForMail(ctxA, ctxA.policy, sent.message, opening(sent.delivery));
    const id = sent.message.id;
    await waitFor(
      "the fake to end",
      () =>
        readOutcome(outboxOf(id).opened?.log ?? "").ended &&
        !isAlive(outboxOf(id).opened?.pid ?? null),
    );
    return id;
  };
  const crmDir = mailbox(pb.userDir, "w", "crm").dir;
  return { env, a, b, pa, ctxA, hook, outboxOf, ask, crmDir };
}

test("SP2c AC-2: the Stop and SessionStart hooks sweep the sessions this project opened and name what they found", async () => {
  const { hook, outboxOf, ask } = setup();
  onSessionStart(hook);
  // An ended session without a reply: the Stop hook's sweep expires the message and says so.
  const first = await ask("First?");
  expect(outboxOf(first).opened?.endedAt).toBeUndefined();
  const stop = onStop(hook) as { systemMessage?: string; decision?: string };
  expect(stop.decision).toBeUndefined();
  expect(stop.systemMessage).toContain(`${first} ended without a reply (expired)`);
  expect(outboxOf(first)).toMatchObject({
    status: "expired",
    reason: "the session ended without a reply",
    opened: { outcome: "ended", turns: 1 },
  });
  // The SessionStart hook sweeps too, and its context names the session.
  const second = await ask("Second?");
  const start = onSessionStart(hook, { source: "startup" }) as {
    hookSpecificOutput: { additionalContext: string };
  };
  expect(start.hookSpecificOutput.additionalContext).toContain(
    `${second} ended without a reply (expired)`,
  );
  expect(outboxOf(second)).toMatchObject({ status: "expired", opened: { outcome: "ended" } });
}, 20_000);

test.skipIf(root)(
  "SP2c AC-2: a sweep that throws never switches the hooks off, and the hooks say it failed",
  async () => {
    const { hook, ask, crmDir } = setup();
    onSessionStart(hook);
    // Two ended sessions: each hook's sweep throws on the first it reaches, so both hooks see the failure.
    const first = await ask("Will the sweep reach me?");
    const second = await ask("And me?");
    // The receiver's mailbox cannot be written: the sweep's record of the end throws there, after
    // the lead's own sync, which only reads it, went through.
    // A third session, to ops, whose mailbox stays writable: it settles, and keeps its line.
    const settled = await ask("Reach me too", "ops");
    chmodSync(crmDir, 0o555);
    try {
      // Each session's record fails on its own line, nothing of crm's is said to have ended, and
      // the session that settled keeps its line beside the failures.
      const stop = onStop(hook) as { systemMessage?: string; decision?: string };
      expect(stop.decision).toBeUndefined();
      expect(stop.systemMessage).toContain(`the sweep of ${first} failed: `);
      expect(stop.systemMessage).toContain(`the sweep of ${second} failed: `);
      expect(stop.systemMessage).toContain(`${settled} ended without a reply (expired)`);
      expect(stop.systemMessage).not.toContain(`${first} ended`);
      expect(stop.systemMessage).not.toContain(`${second} ended`);
      const start = onSessionStart(hook, { source: "startup" }) as {
        hookSpecificOutput: { additionalContext: string };
      };
      expect(start.hookSpecificOutput.additionalContext).toContain(
        `the sweep of ${first} failed: `,
      );
    } finally {
      chmodSync(crmDir, 0o755);
    }
    // The receiver's copies were never written.
    const crmInbox = readBox(crmDir, "inbox").box.messages;
    for (const id of [first, second]) {
      const found = crmInbox.find((m) => m.id === id);
      expect(found).toBeDefined();
      expect(found?.opened?.endedAt).toBeUndefined();
    }
  },
  20_000,
);

test.skipIf(root)(
  "SP2c AC-2: a box the record pass cannot read is skipped and named, and the other copies are written",
  async () => {
    const { hook, ask, crmDir, outboxOf } = setup();
    onSessionStart(hook);
    const other = await ask("Reach crm first");
    const settled = await ask("Reach me", "ops");
    // crm's inbox holds no copy of the ops message and cannot be read: the pass skips it, says so,
    // and settles the session in the copies it can write (crm's own message settles in the
    // storefront's outbox, its inbox copy skipped the same way).
    const crmInbox = join(crmDir, "inbox.json");
    chmodSync(crmInbox, 0o000);
    try {
      const swept = sweepSafely(hook.mail);
      expect([...swept.ended].sort()).toEqual([other, settled].sort());
      expect(swept.lines).toContain(`${settled} ended without a reply (expired)`);
      expect(
        swept.lines.some((l) =>
          l.startsWith(`the record of ${settled} skipped a box it could not read: ${crmInbox} (`),
        ),
      ).toBe(true);
      expect(outboxOf(settled)).toMatchObject({ status: "expired", opened: { outcome: "ended" } });
    } finally {
      chmodSync(crmInbox, 0o644);
    }
  },
  20_000,
);

test.skipIf(root)(
  "SP2c AC-2: a sweep that fails before any session is reached says so in one line, and the hooks go on",
  async () => {
    const { pa, hook, ask } = setup();
    onSessionStart(hook);
    await ask("Will the sweep reach me?");
    // The lead's own outbox cannot be read: an unreadable box is never an empty one, so the sweep
    // throws before it reaches a session, and the guarded sweep the hooks and the commands run
    // turns that into its one line.
    const outbox = join(mailbox(pa.userDir, "w", "storefront").dir, "outbox.json");
    chmodSync(outbox, 0o000);
    try {
      expect(() => sweepOpened(hook.mail)).toThrow(/permission denied/);
      const swept = sweepSafely(hook.mail);
      expect(swept).toMatchObject({ ended: [], expired: [] });
      expect(swept.lines).toHaveLength(1);
      expect(swept.lines[0]).toMatch(/^the sweep failed: EACCES: permission denied/);
    } finally {
      chmodSync(outbox, 0o644);
    }
  },
  20_000,
);

test("SP2c AC-2: a turn the Stop hook holds for a blocker still names what the sweep settled", async () => {
  const { env, a, b, ask } = setup();
  // storefront takes blockers for this test.
  write(
    a,
    ".crew/policy.json",
    JSON.stringify({
      mail: { workspace: "w", name: "storefront", accept: ["question", "notice", "blocker"] },
    }),
  );
  const held = hookContext({ session_id: "s", cwd: a }, env);
  onSessionStart(held);
  const id = await ask("Held?");
  const pb = repoPaths(b, env);
  const fromCrm = mailContext(pb, loadPolicy(pb).policy, env);
  const blocker = send(
    fromCrm,
    { to: "storefront", type: "blocker", text: "The build is red" },
    null,
  );
  if ("refused" in blocker) throw new Error(blocker.refused);
  // The turn is held for the blocker, and the line still says what the sweep settled.
  const stop = onStop(held) as { decision?: string; reason?: string };
  expect(stop.decision).toBe("block");
  expect(stop.reason).toContain(`blocker ${blocker.message.id}`);
  expect(stop.reason).toContain(`${id} ended without a reply (expired)`);
}, 20_000);

test("SP2c AC-2: the hooks of a session opened by mail sweep nothing; the lead's do", async () => {
  const { env, a, hook, outboxOf, ask } = setup();
  onSessionStart(hook);
  const id = await ask("Who sweeps?");
  // An implementer's hooks run in a worktree that shares the project's mailbox: they settle and
  // stop no session of the project's (the lead's sweep does).
  const openedHook = hookContext(
    { session_id: "child", cwd: a },
    { ...env, WIZARDINGCODE_CREW_MAIL_ID: "M-2026-10-16-009-storefront" },
  );
  const stop = onStop(openedHook) as { systemMessage?: string; decision?: string };
  expect(stop.decision).toBeUndefined();
  expect(stop.systemMessage ?? "").not.toContain("ended without a reply");
  expect(outboxOf(id).opened?.endedAt).toBeUndefined();
  const start = onSessionStart(openedHook, { source: "startup" }) as {
    hookSpecificOutput: { additionalContext: string };
  };
  expect(start.hookSpecificOutput.additionalContext).not.toContain("Swept:");
  expect(outboxOf(id).opened?.endedAt).toBeUndefined();
  const lead = onStop(hook) as { systemMessage?: string };
  expect(lead.systemMessage).toContain(`${id} ended without a reply (expired)`);
  expect(outboxOf(id).opened?.outcome).toBe("ended");
}, 20_000);

test("SP2c AC-4: the Stop and prompt hooks take a task's reply into the lead's record without a command", async () => {
  const { env, a, pa, ctxA, hook } = setup();
  onSessionStart(hook);
  // The children first, so the lead is the active item the hooks read.
  const child1 = createWork(pa, "T-1 of the lead");
  saveWork(pa, child1);
  const child2 = createWork(pa, "T-2 of the lead");
  saveWork(pa, child2);
  const lead = createWork(pa, "Lead");
  addCriterion(lead, "a");
  const record = (task: string): TaskRecord => ({
    task,
    message: "",
    criteria: ["AC-1"],
    text: `do ${task}`,
    branch: `crew/x/${task}`,
    worktree: join(a, "..", `x-${task}`),
    openedAt: new Date().toISOString(),
  });
  lead.tasks = [record("T-1"), record("T-2")];
  saveWork(pa, lead);
  const open = (task: string) => {
    const sent = send(
      ctxA,
      { to: ".", agent: task, type: "change-request", text: `do ${task}` },
      lead,
    );
    if ("refused" in sent) throw new Error(sent.refused);
    const t = lead.tasks?.find((x) => x.task === task) as TaskRecord;
    t.message = sent.message.id;
    saveWork(pa, lead);
    return sent.message.id;
  };
  const m1 = open("T-1");
  const m2 = open("T-2");
  // The implementers answer from the same checkout here (a worktree in use); each reply names the child item and the branch.
  const answer = (task: string, mid: string, child: string) => {
    const asTask = mailContext(pa, ctxA.policy, {
      ...env,
      WIZARDINGCODE_CREW_MAIL_ID: mid,
      WIZARDINGCODE_CREW_MAIL_AGENT: task,
    });
    const answered = reply(asTask, mid, "built", { branch: `crew/x/${task}`, item: child }, []);
    if ("refused" in answered) throw new Error(answered.refused);
    return answered.reply.at;
  };
  const at1 = answer("T-1", m1, child1.id);
  // The lead's record still knows no child; its next turn end fills it.
  expect(loadWork(pa, lead.id).work?.tasks?.[0]?.child).toBeUndefined();
  onStop(hook);
  expect(loadWork(pa, lead.id).work?.tasks?.[0]).toMatchObject({
    child: child1.id,
    verdict: "unproven",
    repliedAt: at1,
  });
  // The prompt hook takes a reply too.
  const at2 = answer("T-2", m2, child2.id);
  expect(loadWork(pa, lead.id).work?.tasks?.[1]?.child).toBeUndefined();
  onPrompt(hook);
  expect(loadWork(pa, lead.id).work?.tasks?.[1]).toMatchObject({
    child: child2.id,
    verdict: "unproven",
    repliedAt: at2,
  });
});
