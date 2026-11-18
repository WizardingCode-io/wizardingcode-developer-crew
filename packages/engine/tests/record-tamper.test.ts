// A ledger or an evidence file removed by hand is state changed outside the engine (item
// 2026-11-18-013): refused where an item is opened and where the file is written, named in the
// verdict, and accepted by a person alone, on record.
import { expect, test } from "bun:test";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEvidence, updateEvidence } from "../src/evidence.ts";
import { runGates } from "../src/gates.ts";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { onStop } from "../src/hooks/stop.ts";
import { fileAnswer, type Progress } from "../src/hooks/subagent-stop.ts";
import { addObjection, loadLedger, saveLedger } from "../src/objections.ts";
import { writeProtectedText } from "../src/store.ts";
import { PERMISSION_MODES } from "../src/types.ts";
import { addCriterion, addSkip, createWork, saveWork } from "../src/work.ts";
import { cliIo, hookContext, makeRepo, testEnv, write } from "./helpers.ts";

const LEDGER = "objections.json";
const EVIDENCE = "evidence.json";
const removed = (name: string, id: string): string =>
  `record removed outside the engine: ${name} (the user accepts it with crew accept ${id})`;
const refusal = (name: string, id: string): string =>
  `state changed outside the engine: .crew/work/${id}/${name}; the user can accept it with crew accept ${id}`;

/** An active item, the session started and the commands to drive it; proven by a real gate run when `proven`. */
async function item(proven = true) {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const ctx = hookContext({ session_id: "s", cwd: root }, env);
  onSessionStart(ctx);
  const work = createWork(ctx.paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  addSkip(work, "tdd:AC-1", "manual");
  saveWork(ctx.paths, work);
  if (proven) {
    write(root, "src/a.ts", "changed");
    const outcome = await runGates(ctx.paths, work, ctx.profile, ctx.policy);
    if (outcome.verdict !== "proven")
      throw new Error(`the fixture's gates did not prove: ${outcome.verdict}`);
  }
  const folder = join(root, ".crew", "work", work.id);
  const run = cliIo(root, env);
  const said = async (...argv: string[]) => {
    const got = await run(...argv);
    return { code: got.code, text: `${got.out}${got.err}` };
  };
  /** One open blocking objection, through the engine's own writer. */
  const object = () => {
    const { ledger } = loadLedger(ctx.paths, work.id);
    addObjection(ledger, "the page leaks a key", "gap-round", "blocking");
    saveLedger(ctx.paths, work.id, ledger);
  };
  const stop = () => onStop(ctx) as { decision?: string; reason?: string };
  const register = (): { item: string; kind: string; text: string; by: string }[] => {
    const file = join(root, ".crew", "decisions.json");
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).entries : [];
  };
  return { root, env, ctx, work, id: work.id, folder, said, object, stop, register };
}
type Item = Awaited<ReturnType<typeof item>>;

/** What the saving commands, the status and the Stop hook answer on an item whose `name` was removed. */
async function refused(a: Item, name: string): Promise<void> {
  const before = readFileSync(join(a.folder, "work.json"), "utf8");
  for (const command of [
    ["gate", "run", a.id],
    ["criteria", a.id, "add", "one more"],
  ]) {
    const got = await a.said(...command);
    expect(got.code, `${name}: ${command.join(" ")}`).not.toBe(0);
    expect(got.text, `${name}: ${command.join(" ")}`).toContain(refusal(name, a.id));
  }
  // The ledger's one writer, the objection command, is refused on a removed ledger and writes none.
  if (name === LEDGER) {
    const got = await a.said(
      "objection",
      a.id,
      "add",
      "one more",
      "--by",
      "gap-round",
      "--severity",
      "advisory",
    );
    expect(got.code, "objection add").not.toBe(0);
    expect(got.text, "objection add").toContain(refusal(name, a.id));
  }
  expect(readFileSync(join(a.folder, "work.json"), "utf8"), name).toBe(before);
  expect(existsSync(join(a.folder, name)), name).toBe(false);
  const status = await a.said("status", a.id);
  expect(status.text, name).toContain("Not proven");
  expect(status.text, name).toContain(removed(name, a.id));
  const held = a.stop();
  expect(held.decision, name).toBe("block");
  expect(held.reason, name).toContain(removed(name, a.id));
}

test("record AC-7: a ledger or an evidence file removed by hand refuses the saving commands, is named by the status, and keeps the turn open", async () => {
  // An item proven but for one open blocking objection: the objection is what keeps the turn open.
  const a = await item();
  expect(a.stop().decision, "proven, the turn ends").toBeUndefined();
  a.object();
  expect(a.stop().decision, "an open blocking objection").toBe("block");
  expect((await a.said("status", a.id)).text).not.toContain("record removed outside the engine");
  // The ledger removed by hand: the objection must not vanish with it.
  unlinkSync(join(a.folder, LEDGER));
  await refused(a, LEDGER);

  // The evidence removed by hand, on an item that has evidence.
  const b = await item();
  unlinkSync(join(b.folder, EVIDENCE));
  await refused(b, EVIDENCE);

  // An item that never had a ledger: nothing refused, no such reason, and a proven turn ends.
  const c = await item();
  expect(existsSync(join(c.folder, LEDGER))).toBe(false);
  const plain = await c.said("status", c.id);
  expect(plain.text).not.toContain("record removed outside the engine");
  expect(c.stop().decision).toBeUndefined();
  expect((await c.said("criteria", c.id, "add", "one more")).code).toBe(0);

  // An item with a ledger and no evidence yet: the same.
  const d = await item(false);
  d.object();
  expect(existsSync(join(d.folder, EVIDENCE))).toBe(false);
  expect((await d.said("status", d.id)).text).not.toContain("record removed outside the engine");
  expect((await d.said("criteria", d.id, "add", "one more")).code).toBe(0);
});

/** A role's answer filed as the hook files it, and the note the hook would tell the session. */
function filed(a: Item, agentId: string): { note: string | null; file: string | null } {
  const progress: Progress = { saved: null, recorded: false, pending: null, reply: null };
  const note = fileAnswer(
    a.ctx,
    a.id,
    "review-code-quality",
    {
      answer: "# code-quality findings\nnone",
      agentId,
      filedBy: "hook",
      tokens: { tokens: 0, from: "none" },
    },
    "",
    progress,
  );
  return { note, file: progress.saved?.file ?? null };
}
const roles = (a: Item): number => (loadEvidence(a.ctx.paths, a.id).evidence.roles ?? []).length;

test("record AC-8: the hook's filing and updateEvidence write nothing over a removed evidence file", async () => {
  // An evidence file the engine wrote: the hook files as before.
  const whole = await item();
  expect(filed(whole, "a-1").note).toBeNull();
  expect(roles(whole)).toBe(1);

  // An item that never had one: the first role is recorded and the file is made.
  const fresh = await item(false);
  expect(existsSync(join(fresh.folder, EVIDENCE))).toBe(false);
  expect(filed(fresh, "a-1").note).toBeNull();
  expect(roles(fresh)).toBe(1);

  // Removed by hand: nothing is recorded and no file is written in its place.
  const a = await item();
  unlinkSync(join(a.folder, EVIDENCE));
  const answer = filed(a, "a-2");
  expect(answer.note).toContain(
    `evidence.json of ${a.id} changed outside the engine (crew accept ${a.id})`,
  );
  expect(answer.note).toContain("is saved at review/code-quality.findings.md");
  expect(answer.note).toContain("not recorded");
  expect(existsSync(join(a.folder, EVIDENCE))).toBe(false);
  expect(existsSync(join(a.folder, "review", "code-quality.findings.md"))).toBe(true);
  const written = updateEvidence(a.ctx.paths, a.id, () => {});
  expect("refused" in written && written.refused).toContain("changed outside the engine");
  expect(existsSync(join(a.folder, EVIDENCE))).toBe(false);
  // The item still refuses, and still asks for the user's accept.
  expect((await a.said("criteria", a.id, "add", "one more")).text).toContain(
    refusal(EVIDENCE, a.id),
  );
  expect((await a.said("status", a.id)).text).toContain(removed(EVIDENCE, a.id));
  expect((await a.said("accept", a.id)).code).toBe(0);
  expect((await a.said("criteria", a.id, "add", "one more")).code).toBe(0);
  expect(filed(a, "a-3").note).toBeNull();
});

test("record AC-9: accept says what is given up for a ledger and for an evidence file taken as gone", async () => {
  const a = await item();
  a.object();
  unlinkSync(join(a.folder, LEDGER));
  const ledger = await a.said("accept", a.id);
  expect(ledger.code).toBe(0);
  expect(ledger.text).toContain("taken as gone: objections.json");
  expect(ledger.text).toContain(
    "the item's objections are no longer on record, any open blocking one among them",
  );
  expect(ledger.text).not.toContain("the item's proof");
  expect((await a.said("status", a.id)).text).not.toContain("record removed outside the engine");
  expect((await a.said("criteria", a.id, "add", "one more")).code).toBe(0);

  const b = await item();
  unlinkSync(join(b.folder, EVIDENCE));
  const evidence = await b.said("accept", b.id);
  expect(evidence.code).toBe(0);
  expect(evidence.text).toContain("taken as gone: evidence.json");
  expect(evidence.text).toContain(
    "the item's proof and its roles' records are no longer on record; the gates run again",
  );
  expect(evidence.text).not.toContain("the item's objections");
  expect((await b.said("status", b.id)).text).not.toContain("record removed outside the engine");
});

test("record AC-10: an accept that took a changed or a gone file is one decision of the register, with who accepted", async () => {
  // A changed file, a gone file and whole ones in one accept.
  const a = await item();
  a.object();
  const ledger = join(a.folder, LEDGER);
  writeFileSync(ledger, `${readFileSync(ledger, "utf8")} `);
  unlinkSync(join(a.folder, EVIDENCE));
  const before = a.register().length;
  expect((await a.said("accept", a.id)).code).toBe(0);
  const entries = a.register();
  expect(entries.length).toBe(before + 1);
  const entry = entries.at(-1);
  expect(entry?.item).toBe(a.id);
  expect(entry?.kind).toBe("accept");
  expect(entry?.text).toContain("changed: objections.json");
  expect(entry?.text).toContain("gone: evidence.json");
  expect(entry?.text).not.toContain("work.json");
  expect(entry?.by).toBe("the user, relayed by the agent");

  // Nothing changed and nothing gone: no decision.
  const count = a.register().length;
  expect((await a.said("accept", a.id)).code).toBe(0);
  expect(a.register().length).toBe(count);

  // A report and a knowledge listing, both whole and neither JSON, are not changed files (the QA
  // lead's return at the delivery): an accept with nothing changed appends none, and the entry of
  // an accept with a changed ledger names neither.
  const c = await item();
  c.object();
  await c.said("evidence", c.id);
  writeProtectedText(c.ctx.paths, join(c.folder, "knowledge.md"), "# Knowledge\n\n- none\n");
  expect(existsSync(join(c.folder, "report.md"))).toBe(true);
  const whole = c.register().length;
  const clean = await c.said("accept", c.id, "--json");
  expect(clean.code).toBe(0);
  expect(JSON.parse(clean.text).changed).toEqual([]);
  expect(c.register().length, "whole files, no decision").toBe(whole);
  const theirs = join(c.folder, LEDGER);
  writeFileSync(theirs, `${readFileSync(theirs, "utf8")} `);
  expect((await c.said("accept", c.id)).code).toBe(0);
  expect(c.register().length, "one changed file, one decision").toBe(whole + 1);
  expect(c.register().at(-1)?.text).toBe(
    "files accepted after a change outside the engine; changed: objections.json; gone: none",
  );
  // A report changed by hand is a changed file all the same.
  const report = join(c.folder, "report.md");
  writeFileSync(report, `${readFileSync(report, "utf8")} `);
  expect((await c.said("accept", c.id)).code).toBe(0);
  expect(c.register().at(-1)?.text).toContain("changed: report.md;");

  // The register itself changed by hand: refused first, nothing accepted.
  const b = await item();
  b.object();
  // A first accepted change, so that the project has a register to change.
  const first = join(b.folder, LEDGER);
  writeFileSync(first, `${readFileSync(first, "utf8")} `);
  expect((await b.said("accept", b.id)).code).toBe(0);
  unlinkSync(first);
  const register = join(b.root, ".crew", "decisions.json");
  expect(existsSync(register)).toBe(true);
  writeFileSync(register, `${readFileSync(register, "utf8")} `);
  const held = await b.said("accept", b.id);
  expect(held.code).not.toBe(0);
  expect(held.text).toContain(".crew/decisions.json");
  expect(held.text).toContain("crew accept decisions");
  expect((await b.said("status", b.id)).text).toContain(removed(LEDGER, b.id));
  // The register accepted first, the item's files after it: no loop between the two.
  expect((await b.said("accept", "decisions")).code).toBe(0);
  expect((await b.said("accept", b.id)).code).toBe(0);
  expect((await b.said("status", b.id)).text).not.toContain("record removed outside the engine");
});

test("record AC-14: with nobody watching nobody accepts what was changed outside the engine: the command refuses --mode for every target and the hook names the person's way", async () => {
  const a = await item();
  a.object();
  unlinkSync(join(a.folder, LEDGER));
  const before = a.register().length;
  expect(PERMISSION_MODES.length).toBeGreaterThan(2);
  for (const mode of PERMISSION_MODES) {
    const got = await a.said("accept", a.id, "--mode", mode);
    expect(got.code, mode).not.toBe(0);
    expect(got.text, mode).toContain("unknown flag --mode for accept");
    expect(got.text, mode).toContain("a person accepts what was changed outside the engine");
    expect(got.text, mode).toContain("nothing is accepted until then");
    expect(a.register().length, mode).toBe(before);
    expect((await a.said("status", a.id)).text, mode).toContain(removed(LEDGER, a.id));
    expect((await a.said("criteria", a.id, "add", "one more")).text, mode).toContain(
      refusal(LEDGER, a.id),
    );
  }
  // Every other target of the command: the same refusal, the same reason.
  for (const target of [
    ["profile"],
    ["policy"],
    ["decisions"],
    ["mail", "inbox"],
    ["mail", "outbox"],
  ]) {
    const got = await a.said("accept", ...target, "--mode", "dontAsk");
    expect(got.code, target.join(" ")).not.toBe(0);
    expect(got.text, target.join(" ")).toContain("unknown flag --mode for accept");
    expect(got.text, target.join(" ")).toContain(
      "a person accepts what was changed outside the engine",
    );
  }
  // The hook, in a session nobody watches: denied with the person's way, and no flag to add, for
  // an item, the profile, the register and a mailbox.
  const hook = (command: string, mode: string): string =>
    JSON.stringify(
      onPreToolUse(a.ctx, { tool_name: "Bash", tool_input: { command }, permission_mode: mode }),
    );
  for (const mode of ["bypassPermissions", "dontAsk"])
    for (const target of [a.id, "profile", "decisions", "mail inbox", "mail outbox"]) {
      const answer = hook(`crew accept ${target}`, mode);
      expect(answer, `${target} ${mode}`).toContain("deny");
      expect(answer, `${target} ${mode}`).toContain(
        "run crew accept in a session a person watches",
      );
      expect(answer, `${target} ${mode}`).not.toContain("--mode");
    }
  // The policy keeps the answer of its own, older branch, which names the person's way too.
  const policy = hook("crew accept policy", "dontAsk");
  expect(policy).toContain("deny");
  expect(policy).toContain("the policy is changed by a person alone");
  expect(policy).not.toContain("files changed outside the engine are accepted by a person alone");
  // With a person present the hook does not deny any of them.
  for (const target of [a.id, "profile", "decisions", "mail inbox"])
    expect(hook(`crew accept ${target}`, "default"), target).not.toContain("deny");
});
