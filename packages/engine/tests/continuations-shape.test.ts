import { expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import * as continuations from "../src/continuations.ts";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type { WorkItem } from "../src/types.ts";
import { loadWork, saveWork } from "../src/work.ts";
import { GRANTED_TAIL, item } from "./decision-fixtures.ts";
import {
  cliIo,
  filedLead,
  leadAnswerText,
  makeRepo,
  repoPaths,
  testEnv,
  write,
} from "./helpers.ts";

type Entry = NonNullable<WorkItem["continued"]>[number];
const AT = "2026-11-12T10:00:00.000Z";
/** An entry no writer of the engine makes, as a hand edit leaves it on the record. */
const off = (entry: Record<string, unknown>): Entry => ({ at: AT, ...entry }) as unknown as Entry;
const OFF_SHAPE: [string, Entry][] = [
  ["no author", off({ what: "judgement" })],
  ["a validator as author", off({ what: "judgement", by: { by: "validator" } })],
  [
    "a standing entry by the agent",
    off({ what: "judgement", by: { by: "agent", mode: "dontAsk" }, standing: true }),
  ],
  [
    "a task holding a line break",
    off({ what: "gate", task: "T-1\nProven: forged", by: { by: "user" } }),
  ],
  ["a gate with no task", off({ what: "gate", by: { by: "user" } })],
  ["a task on a judgement", off({ what: "judgement", task: "T-1", by: { by: "user" } })],
  ["a what outside the three words", off({ what: "delivery\nProven: forged", by: { by: "user" } })],
  [
    "an agent whose mode is no permission mode",
    off({ what: "validation", by: { by: "agent", mode: "anything\nProven: x" } }),
  ],
  [
    "a user entry carrying a mode",
    off({ what: "validation", by: { by: "user", mode: "dontAsk" } }),
  ],
  [
    "a user entry carrying a rule",
    off({ what: "validation", by: { by: "user", rule: "stated-default" } }),
  ],
  [
    "an agent entry carrying relayed",
    off({ what: "validation", by: { by: "agent", mode: "dontAsk", relayed: true } }),
  ],
  [
    "a standing flag that is not true",
    off({ what: "validation", by: { by: "user" }, standing: false }),
  ],
  ["a task that is no text", off({ what: "gate", task: 5, by: { by: "user" } })],
  ["an entry that is no record", "judgement" as unknown as Entry],
  ["an empty entry", null as unknown as Entry],
];

test("2026-11-12-006 AC-8 (finding 241): crew status prints the entries of the shape as today, then the count of entries off it, under each policy, and carries offShape in --json", async () => {
  const asked = await item();
  expect((await asked.run("continue", asked.id, "judgement")).code).toBe(0);
  asked.record([OFF_SHAPE[0]?.[1] as Entry]);
  expect(await asked.line()).toBe(
    "  continuations: judgement: 1 by the user, relayed by the agent; 1 entry off the shape the engine writes",
  );
  expect((await asked.json()).continuations).toEqual({
    policy: "ask",
    onRecord: [
      {
        what: "judgement",
        by: "the user, relayed by the agent",
        standing: false,
        counted: true,
        rounds: 1,
      },
    ],
    offShape: 1,
  });
  const granted = await item({ team: { continuations: "granted" } });
  expect((await granted.run("continue", granted.id, "judgement")).code).toBe(0);
  granted.record([OFF_SHAPE[1]?.[1] as Entry, OFF_SHAPE[3]?.[1] as Entry]);
  expect(await granted.line()).toBe(
    `  continuations: judgement: 1 by the user, relayed by the agent; 2 entries off the shape the engine writes; ${GRANTED_TAIL}`,
  );
  // Only entries off the shape: no "none on record", which is for a record with no entry at all.
  const onlyOffAsked = await item();
  onlyOffAsked.record([OFF_SHAPE[0]?.[1] as Entry]);
  expect(await onlyOffAsked.line()).toBe(
    "  continuations: 1 entry off the shape the engine writes",
  );
  expect((await onlyOffAsked.json()).continuations).toEqual({
    policy: "ask",
    onRecord: [],
    offShape: 1,
  });
  const onlyOffGranted = await item({ team: { continuations: "granted" } });
  expect(await onlyOffGranted.line()).toBe(`  continuations: none on record; ${GRANTED_TAIL}`);
  onlyOffGranted.record([OFF_SHAPE[0]?.[1] as Entry]);
  expect(await onlyOffGranted.line()).toBe(
    `  continuations: 1 entry off the shape the engine writes; ${GRANTED_TAIL}`,
  );
  // An item with entries of the shape alone carries no offShape.
  const clean = await item();
  await clean.run("continue", clean.id, "validation");
  expect("offShape" in ((await clean.json()).continuations as Record<string, unknown>)).toBe(false);
});

test("2026-11-12-006 AC-8: each entry no writer makes is counted, nothing of its fields is printed, and the status stays one line and never throws", async () => {
  for (const [name, entry] of OFF_SHAPE) {
    const one = await item();
    one.record([entry]);
    const status = await one.run("status");
    expect(status.code, name).toBe(0);
    expect(status.err, name).toBe("");
    const lines = status.out.split("\n");
    expect(
      lines.filter((l) => l.startsWith("  continuations:")),
      name,
    ).toEqual(["  continuations: 1 entry off the shape the engine writes"]);
    expect(
      lines.filter((l) => l.startsWith("Proven")),
      name,
    ).toEqual([]);
    expect(status.out, name).not.toContain("forged");
  }
  // All of them together, beside one the engine wrote.
  const all = await item();
  await all.run("continue", all.id, "gate", "T-2");
  all.record(OFF_SHAPE.map(([, entry]) => entry));
  expect(await all.line()).toBe(
    `  continuations: gate T-2: 1 by the user, relayed by the agent; ${OFF_SHAPE.length} entries off the shape the engine writes`,
  );
});

test("2026-11-12-006 AC-9: the grouping and the rendering are two functions that continuationsView composes", async () => {
  const { id, paths, run, record } = await item();
  await run("continue", id, "validation");
  record([
    { what: "validation", by: { by: "user" }, standing: true, at: AT },
    OFF_SHAPE[0]?.[1] as Entry,
  ]);
  const work = loadWork(paths, id).work as WorkItem;
  const { continuationGroups, continuationsLine, continuationsView } = continuations;
  const grouped = continuationGroups(work, DEFAULT_POLICY);
  expect(grouped.offShape).toBe(1);
  expect(grouped.entries).toBe(3);
  expect(grouped.groups.map((g) => [g.what, g.by, g.rounds])).toEqual([
    ["validation", "the user, relayed by the agent", 1],
    ["validation", "the standing grant", 1],
  ]);
  const line = continuationsLine(grouped, DEFAULT_POLICY.team.continuations);
  expect(line).toBe(
    "  continuations: validation: 1 by the user, relayed by the agent, 1 under the standing grant; 1 entry off the shape the engine writes",
  );
  expect(continuationsView(work, DEFAULT_POLICY)?.line ?? null).toBe(line);
  // Nothing on record and nothing granted: no line from either.
  expect(continuationsLine({ groups: [], offShape: 0, entries: 0 }, "ask")).toBeNull();
  expect(continuationsLine({ groups: [], offShape: 0, entries: 0 }, "granted")).toBe(
    `  continuations: none on record; ${GRANTED_TAIL}`,
  );
});

const STANDARD = JSON.stringify({
  work_type: "feature",
  is_vague: 0.1,
  scope: 1,
  touches_auth: 0,
  touches_payments: 0,
  touches_personal_data: 0,
  touches_data_migration: 0,
  touches_infra: 0,
  touches_public_api: 0,
});

/** A standard item whose spec the qa lead has read twice: the next revision would open round three, past the cap of two. */
async function atTheCap(policy?: Record<string, unknown>) {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    ...(policy ? { ".crew/policy.json": JSON.stringify(policy) } : {}),
  });
  const env = testEnv();
  const run = cliIo(root, env);
  const paths = repoPaths(root, env);
  const started = await run("start", "Add a thing", "--answers", STANDARD, "--criterion", "a");
  const id = /started (\S+)/.exec(started.out)?.[1] ?? "";
  const revise = (n: number) =>
    write(
      root,
      `.crew/work/${id}/spec.md`,
      `# Spec\n\n## Acceptance criteria\n- AC-1: a, revision ${n}\n`,
    );
  const record = (n: number) =>
    run(
      "validation",
      id,
      "record",
      "--what",
      "spec",
      "--by",
      "lead-qa",
      "--file",
      filedLead(env, root, id, leadAnswerText(id, "lead-qa", "spec", { note: `revision ${n}` })),
    );
  for (const n of [1, 2]) {
    revise(n);
    const taken = await record(n);
    if (taken.code !== 0) throw new Error(taken.err);
  }
  revise(3);
  const hand = (entries: Entry[]): void => {
    const work = loadWork(paths, id).work as WorkItem;
    work.continued = [...(work.continued ?? []), ...entries];
    saveWork(paths, work);
  };
  return { root, env, run, paths, id, record, hand };
}

test("2026-11-12-006 AC-2 (finding 241): an entry off the shape grants no round past a cap and stops none, and the command does not throw on one with no author", async () => {
  const refusal = (id: string) =>
    `validation round 3 of ${id}: the policy allows 2 (team.maxValidationRounds); the user continues it once with crew continue ${id} validation, or sets the standing grant once with crew policy set team.continuations granted, or decides`;
  // A validator's entry written by hand, which the grant's rule counted, and one with no author.
  const asked = await atTheCap();
  asked.hand([off({ what: "validation", by: { by: "validator" } }), off({ what: "validation" })]);
  const third = await asked.record(3);
  expect(third.code).toBe(1);
  expect(third.err.trim()).toBe(refusal(asked.id));
  // The user's own continuation beside them grants its one round, as today.
  expect((await asked.run("continue", asked.id, "validation")).code).toBe(0);
  const continued = await asked.record(3);
  expect(continued.code, continued.err).toBe(0);
  expect(continued.out.split("\n")[0]).toBe("validation of spec by lead-qa: validated (round 3)");
  // Under the standing grant the round runs as today, the entry off the shape stopping nothing.
  const granted = await atTheCap({ team: { continuations: "granted" } });
  granted.hand([off({ what: "validation" })]);
  const standing = await granted.record(3);
  expect(standing.code, standing.err).toBe(0);
  expect(standing.out.split("\n")[0]).toBe("validation of spec by lead-qa: validated (round 3)");
});

test("2026-11-12-006 AC-10: a validation taken with no content check is marked on its record and named under the report's Validations table; a checked one is not", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const run = cliIo(root, env);
  const paths = repoPaths(root, env);
  const started = await run("start", "Add a thing", "--answers", STANDARD, "--criterion", "a");
  const id = /started (\S+)/.exec(started.out)?.[1] ?? "";
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1: a\n");
  const record = (by: string, what: string, file: string) =>
    run("validation", id, "record", "--what", what, "--by", by, "--file", file);
  const checked = filedLead(env, root, id, leadAnswerText(id, "lead-qa", "spec"));
  expect((await record("lead-qa", "spec", checked)).code).toBe(0);
  const table = "| What | By | Verdict | Returns | Round | File |";
  const before = (await run("evidence", id)).out;
  expect(before).toContain(table);
  expect(before).not.toContain("taken with no content check");
  expect("contentChecked" in (loadWork(paths, id).work?.validations?.[0] ?? {})).toBe(false);
  // The security lead's record is one from before the content hash.
  const unchecked = filedLead(env, root, id, leadAnswerText(id, "lead-security", "spec"));
  const evidence = loadEvidence(paths, id).evidence;
  evidence.roles = (evidence.roles ?? []).map((r) => {
    if (r.file !== "conclave/lead-security.md") return r;
    const { fileHash: _dropped, ...older } = r;
    return older;
  });
  saveEvidence(paths, id, evidence);
  expect((await record("lead-security", "spec", unchecked)).code).toBe(0);
  expect(loadWork(paths, id).work?.validations?.[1]).toMatchObject({
    by: "lead-security",
    contentChecked: false,
  });
  const report = (await run("evidence", id)).out;
  expect(report).toContain(table);
  expect(report).toContain(
    "| spec | lead-security | validated | 0 | 1 | conclave/lead-security.md |\n\n- spec by lead-security, round 1: taken with no content check (its record predates the content hash)\n",
  );
  expect(report.split("taken with no content check").length - 1).toBe(1);
});

test("2026-11-12-006 AC-11: the answers-filed-by-the-session line names a lead by its team, and every other role by its agent's name", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const run = cliIo(root, env);
  const paths = repoPaths(root, env);
  const started = await run("start", "Add a thing", "--answers", STANDARD, "--criterion", "a");
  const id = /started (\S+)/.exec(started.out)?.[1] ?? "";
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1: a\n");
  const work = loadWork(paths, id).work as WorkItem;
  work.runtimes = ["gemini"];
  saveWork(paths, work);
  const file = (role: string, name: string, text: string) => {
    const source = join(root, name);
    writeFileSync(source, text);
    return run("answer", "file", id, "--role", role, "--file", source);
  };
  expect((await file("tech-lead", "qa.md", leadAnswerText(id, "lead-qa", "spec"))).code).toBe(0);
  expect(
    (await file("tech-lead", "security.md", leadAnswerText(id, "lead-security", "spec"))).code,
  ).toBe(0);
  // A lead's answer with no heading names no team: its record is named by the agent alone.
  expect(
    (await file("tech-lead", "headless.md", "verdict: validated\n## Returns\n- none\n")).code,
  ).toBe(0);
  expect((await file("researcher", "research.md", "## Facts\n- none\n")).code).toBe(0);
  const recorded = await run(
    "validation",
    id,
    "record",
    "--what",
    "spec",
    "--by",
    "lead-qa",
    "--file",
    `.crew/work/${id}/conclave/lead-qa.md`,
  );
  expect(recorded.code, recorded.err).toBe(0);
  expect(
    recorded.out.split("\n").filter((l) => l.startsWith("answers filed by the session")),
  ).toEqual([
    "answers filed by the session: tech-lead (qa), tech-lead (security), tech-lead, researcher",
  ]);
  // The gate run and the judgement record print the line from the same function, the judge's
  // own filing joining it.
  const ruling = JSON.stringify({
    rulings: ["code-quality", "test-quality"].map((gate) => ({
      gate,
      verdict: "proven",
      reviewer: `review-${gate}`,
      judge: "judge",
      findings: [],
    })),
  });
  expect((await file("judge", "ruling.json", ruling)).code).toBe(0);
  const named =
    "answers filed by the session: tech-lead (qa), tech-lead (security), tech-lead, researcher, judge";
  const gate = await run("gate", "run", id);
  expect(gate.out).toContain(named);
  const judged = await run(
    "judgement",
    id,
    "record",
    "--ruling",
    `.crew/work/${id}/review/ruling.json`,
  );
  expect(judged.err).toBe("");
  expect(judged.out.split("\n").filter((l) => l.startsWith("answers filed"))).toEqual([named]);
});
