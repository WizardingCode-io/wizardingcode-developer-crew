import { expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { computeVerdict, emptyEvidence, loadEvidence } from "../src/evidence.ts";
import { onStop } from "../src/hooks/stop.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type { Seat, WorkItem } from "../src/types.ts";
import { loadWork, openItems, saveWork } from "../src/work.ts";
import { cliIo, filedRuling, hookContext, makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

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
const FAST = JSON.stringify({ ...JSON.parse(STANDARD), work_type: "chore", scope: 0 });
const LEADS = ["lead-qa", "lead-security"] as const;

const owed = (what: "spec" | "delivery", lead: string): string =>
  `validation of ${what} by ${lead} (crew validation <id> record --what ${what} --by ${lead} --file conclave/${lead}${what === "delivery" ? ".delivery" : ""}.md)`;

/**
 * An item whose gates passed and whose judgement gates are ruled proven, with no validation on
 * record: finding 209's state. On the standard route it has the two leads the registry always
 * seats; on the fast route none.
 */
async function ruled(route: "standard" | "fast" = "standard") {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    "tests/crew-red.test.sh": "exit 1\n",
    "tests/crew-green.test.sh": "exit 0\n",
  });
  const env = testEnv();
  const run = cliIo(root, env);
  const paths = repoPaths(root, env);
  const started = await run(
    "start",
    "Add a thing",
    "--answers",
    route === "fast" ? FAST : STANDARD,
    "--criterion",
    "a",
  );
  const id = /started (\S+)/.exec(started.out)?.[1] ?? "";
  const work = (): WorkItem => loadWork(paths, id).work as WorkItem;
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1: a\n");
  const first = work();
  first.phase = "build";
  saveWork(paths, first);
  write(root, "src/a.ts", "x = 1");
  expect((await run("tdd", "red", id, "AC-1", "--", "sh tests/crew-red.test.sh")).code).toBe(0);
  expect((await run("tdd", "green", id, "AC-1", "--", "sh tests/crew-green.test.sh")).code).toBe(0);
  await run("skip", id, "gate:e2e", "--reason", "no environment in the fixture");
  const ruling = join(root, "ruling.json");
  writeFileSync(
    ruling,
    JSON.stringify({
      rulings: ["code-quality", "test-quality"].map((gate) => ({
        gate,
        verdict: "proven",
        findings: [],
      })),
    }),
  );
  const gate = await run("gate", "run", id);
  const judge = async () =>
    route === "fast"
      ? gate
      : await run("judgement", id, "record", "--ruling", filedRuling(env, root, id, ruling));
  /** A lead's answer as the hook saves it, recorded; `body` after the verdict line. */
  const validate = async (
    what: "spec" | "delivery",
    lead: string,
    verdict = "validated",
    returns = "- none",
    note = "holds",
  ) => {
    const name = `conclave/${lead}${what === "delivery" ? ".delivery" : ""}${note === "holds" ? "" : `-${note}`}.md`;
    write(
      root,
      `.crew/work/${id}/${name}`,
      `# ${lead.replace(/^lead-/, "")} lead's validation of ${id}: ${what}\nverdict: ${verdict}\n## Returns\n${returns}\n## Notes\n- ${note}\n`,
    );
    return run(
      "validation",
      id,
      "record",
      "--what",
      what,
      "--by",
      lead,
      "--file",
      `.crew/work/${id}/${name}`,
    );
  };
  const unproven = async (): Promise<string[]> =>
    (JSON.parse((await run("status", id, "--json")).out) as { unproven: string[] }).unproven;
  const stop = () =>
    onStop(hookContext({ session_id: "s", cwd: root }, env)) as {
      decision?: string;
      reason?: string;
    };
  return { root, env, run, paths, id, work, judge, validate, unproven, stop };
}

test("2026-11-12-004 AC-8, AC-2, AC-9 (finding 209): on the standard route an item whose gates passed and whose judgement is ruled proven reads Not proven and names lead-qa and lead-security for the spec and for the delivery, in every reader; with the four validations recorded it reads Proven", async () => {
  const { run, paths, id, judge, validate, unproven, stop, work } = await ruled();
  const four = [
    owed("spec", "lead-qa"),
    owed("spec", "lead-security"),
    owed("delivery", "lead-qa"),
    owed("delivery", "lead-security"),
  ];
  const judged = await judge();
  expect(judged.code).toBe(1);
  expect(judged.out.split("\n").filter((l) => l.startsWith("Not proven:"))).toEqual([
    `Not proven: ${four.join("; ")}`,
  ]);
  expect(await unproven()).toEqual(four);
  expect(loadEvidence(paths, id).evidence.verdict).toBe("unproven");
  const gate = await run("gate", "run", id, "--only", "lint");
  expect(gate.out).toContain(`Not proven: ${four.join("; ")}`);
  expect(gate.code).toBe(1);
  const report = await run("evidence", id);
  expect(report.out).toContain(`- Verdict: **Not proven**`);
  for (const reason of four) expect(report.out).toContain(reason);
  // The turn's end is where the finding did its harm: the hook holds it on the leads owed.
  const held = stop();
  expect(held.decision).toBe("block");
  for (const reason of four) expect(held.reason).toContain(reason);
  // The item never left the phase its session put it in: nothing delivered it.
  expect(work().phase).toBe("gate");
  for (const lead of LEADS) expect((await validate("spec", lead)).code).toBe(0);
  expect(await unproven()).toEqual(four.slice(2));
  expect((await validate("delivery", "lead-qa")).code).toBe(0);
  expect(await unproven()).toEqual(four.slice(3));
  expect(stop().decision).toBe("block");
  expect((await validate("delivery", "lead-security")).code).toBe(0);
  expect(await unproven()).toEqual([]);
  expect((await run("status", id)).out).toContain(`Proven: ${id}`);
  expect(stop().decision).toBeUndefined();
});

test("2026-11-12-004 AC-8 (D-1, answer A): a spec edited after a lead validated it makes each validation stale, and a returned spec is named with its returns", async () => {
  const { root, id, judge, validate, unproven } = await ruled();
  await judge();
  for (const lead of LEADS) await validate("spec", lead);
  for (const lead of LEADS) await validate("delivery", lead);
  expect(await unproven()).toEqual([]);
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1: a, amended\n");
  expect(await unproven()).toEqual(
    LEADS.map(
      (lead) => `validation of spec by ${lead}: stale (spec changed); record the lead again`,
    ),
  );
  expect(
    (await validate("spec", "lead-qa", "returned", "- R-1 · spec.md:4 · say what a is", "again"))
      .code,
  ).toBe(0);
  expect((await unproven())[0]).toBe(
    "validation of spec by lead-qa: returned 1 return (conclave/lead-qa-again.md); revise the spec and record the lead again (a resumed lead's answer: its -reply.md file)",
  );
});

test("2026-11-12-004 AC-8: a lead seated after Plan owes the spec's validation as the others do, and a spec's validation is refused while the item has no spec.md", async () => {
  const { root, run, id, judge, validate, work, unproven } = await ruled();
  await judge();
  for (const lead of LEADS) await validate("spec", lead);
  for (const lead of LEADS) await validate("delivery", lead);
  expect(await unproven()).toEqual([]);
  // A page changes after the plan: the next gate run seats the frontend's lead, who owes the
  // spec's validation as the others do, and the delivery's.
  write(root, "src/App.vue", "<template><p>hello</p></template>\n");
  const gate = await run("gate", "run", id);
  expect(gate.code).toBe(1);
  expect(work().seats?.some((seat) => seat.role === "lead-frontend")).toBe(true);
  const left = await unproven();
  expect(left).toContain(owed("spec", "lead-frontend"));
  expect(left).toContain(owed("delivery", "lead-frontend"));
  // The other leads validated the spec as it stands, so only their delivery is stale.
  expect(left.filter((r) => r.startsWith("validation of spec"))).toEqual([
    owed("spec", "lead-frontend"),
  ]);
  expect(gate.out).toContain(owed("spec", "lead-frontend"));
  // The evidence moved with the page, so the two earlier leads' delivery is stale, read through the verdict.
  expect(left.filter((r) => r.startsWith("validation of delivery"))).toEqual([
    ...LEADS.map(
      (lead) =>
        `validation of delivery by ${lead}: stale (the evidence changed); record the lead again`,
    ),
    owed("delivery", "lead-frontend"),
  ]);
  // With no spec.md there is no text to validate: the record is refused, nothing hashed.
  rmSync(join(root, `.crew/work/${id}/spec.md`));
  const refused = await validate("spec", "lead-qa", "validated", "- none", "empty");
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(
    `no spec.md to validate: write .crew/work/${id}/spec.md first (the route asks for it)`,
  );
  expect(work().validations?.length).toBe(4);
});

test("2026-11-12-004 AC-8: the leads of an item a gate run raised from the fast route owe the spec's validation", async () => {
  const { root, run, id, work, unproven } = await ruled("fast");
  expect(work().route).toBe("fast");
  expect(await unproven()).toEqual([]);
  // A login path is a risk path: the gate run raises the route and plans the seats again.
  write(root, "src/login.ts", "export const login = 1;\n");
  const gate = await run("gate", "run", id);
  expect(gate.code).toBe(1);
  expect(gate.out).toContain("Route raised to full");
  expect(work().route).toBe("full");
  const left = await unproven();
  for (const lead of LEADS) {
    expect(left).toContain(owed("spec", lead));
    expect(left).toContain(owed("delivery", lead));
  }
});

test("2026-11-12-004 AC-11: an item with leads that is past Deliver keeps the verdict its last record wrote: a later change of the tree and of the spec does not unprove it for crew learn or the open items", async () => {
  const { root, run, paths, id, judge, validate, work, unproven } = await ruled();
  await judge();
  for (const lead of LEADS) await validate("spec", lead);
  for (const lead of LEADS) await validate("delivery", lead);
  expect(work().phase).toBe("deliver");
  expect((await run("phase", id, "next")).out.trim()).toBe(`${id}: phase learn`);
  // The tree moves on and the spec is touched: read now, the item would owe its leads again.
  write(root, "src/a.ts", "x = 2");
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1: a, later\n");
  expect((await unproven()).some((r) => r.startsWith("validation of spec by lead-qa: stale"))).toBe(
    true,
  );
  // The record its last validation wrote still says proven, and that is what is read past Deliver.
  expect(loadEvidence(paths, id).evidence.verdict).toBe("proven");
  expect(openItems(paths).map((w) => w.id)).not.toContain(id);
  const learned = await run("learn", id);
  expect(learned.code, learned.err).toBe(0);
});

test("2026-11-12-004 AC-9: the guard into Deliver names each lead owed once", async () => {
  const { run, id, judge, validate } = await ruled();
  await judge();
  for (const lead of LEADS) await validate("spec", lead);
  const refused = await run("phase", id, "next");
  expect(refused.code).toBe(1);
  for (const lead of LEADS)
    expect(refused.err.split(`not proven: ${owed("delivery", lead)}`).length - 1, lead).toBe(1);
  expect(refused.err.split("validation of delivery by lead-qa").length - 1).toBe(1);
});

test("2026-11-12-004 AC-10: crew validation record prints the verdict line under its own, and the record that proves the item delivers it: the phase, the report, the open items and crew learn", async () => {
  const { root, run, paths, id, judge, validate, work } = await ruled();
  await judge();
  const first = await validate("spec", "lead-qa");
  expect(first.code).toBe(0);
  // The line of the answers the session filed stays beside the verdict line (the fixture files the judge's).
  expect(first.out.trim().split("\n")).toEqual([
    "validation of spec by lead-qa: validated (round 1)",
    `Not proven: ${[owed("spec", "lead-security"), owed("delivery", "lead-qa"), owed("delivery", "lead-security")].join("; ")}`,
    "answers filed by the session: judge",
  ]);
  // A record that does not prove writes the verdict as it stands and moves no phase.
  expect(loadEvidence(paths, id).evidence.unproven).toEqual([
    owed("spec", "lead-security"),
    owed("delivery", "lead-qa"),
    owed("delivery", "lead-security"),
  ]);
  expect(work().phase).toBe("gate");
  expect(openItems(paths).map((w) => w.id)).toContain(id);
  await validate("spec", "lead-security");
  await validate("delivery", "lead-qa");
  // A returned delivery is a record taken: exit 0, the verdict said under it.
  const returned = await validate(
    "delivery",
    "lead-security",
    "returned",
    "- R-1 · report.md:1 · name the skip",
    "first",
  );
  expect(returned.code).toBe(0);
  expect(returned.out).toContain("Not proven: validation of delivery by lead-security: returned");
  const last = await validate("delivery", "lead-security", "validated", "- none", "second");
  expect(last.code).toBe(0);
  expect(last.out.trim().split("\n")).toEqual([
    "validation of delivery by lead-security: validated (round 1)",
    `Proven: ${id}`,
    "answers filed by the session: judge",
  ]);
  expect(loadEvidence(paths, id).evidence.verdict).toBe("proven");
  expect(work().phase).toBe("deliver");
  expect(readFileSync(join(root, `.crew/work/${id}/report.md`), "utf8")).toContain(
    "- Verdict: **Proven**",
  );
  expect(openItems(paths).map((w) => w.id)).not.toContain(id);
  // One step into learn and no gate run: the proof stands as the last record wrote it.
  expect((await run("phase", id, "next")).out.trim()).toBe(`${id}: phase learn`);
  expect((await run("learn", id)).code).toBe(0);
});

test("2026-11-12-004 AC-11: an item on the fast route has no lead and reads Proven at its gate run, and a verdict with no lead seated names none", async () => {
  const { id, judge, work, paths } = await ruled("fast");
  const gate = await judge();
  expect(gate.code).toBe(0);
  expect(gate.out).toContain(`Proven: ${id}`);
  expect(work().phase).toBe("deliver");
  // A standard item with no lead on its record (a policy with no validating team): nothing is owed.
  const bare = { ...work(), route: "standard" as const, seats: [] };
  const verdict = computeVerdict({
    work: bare,
    evidence: { ...emptyEvidence(), ...loadEvidence(paths, id).evidence },
    expected: [],
    currentFingerprint: loadEvidence(paths, id).evidence.fingerprint ?? "",
    tampered: false,
    policy: DEFAULT_POLICY,
    standing: { eligible: true },
    specText: null,
  });
  expect(verdict.unproven.filter((r) => r.startsWith("validation of"))).toEqual([]);
  // The same item with the two leads on its record owes all four: the empty answer above is the
  // seats', not a reading that never asks.
  const seats: Seat[] = LEADS.map((role) => ({
    role,
    team: role === "lead-qa" ? "qa" : "security",
    kind: "lead",
    reason: "standard route",
  }));
  const seated = computeVerdict({
    work: { ...bare, seats },
    evidence: { ...emptyEvidence(), ...loadEvidence(paths, id).evidence },
    expected: [],
    currentFingerprint: loadEvidence(paths, id).evidence.fingerprint ?? "",
    tampered: false,
    policy: DEFAULT_POLICY,
    standing: { eligible: true },
    specText: null,
  });
  expect(seated.unproven.filter((r) => r.startsWith("validation of"))).toEqual([
    owed("spec", "lead-qa"),
    owed("spec", "lead-security"),
    owed("delivery", "lead-qa"),
    owed("delivery", "lead-security"),
  ]);
});

test("2026-11-12-004 AC-2: a delivery validated before any gate run proves nothing: gates have not run stands, and the first gate run makes that record stale", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const run = cliIo(root, env);
  const started = await run("start", "Add a thing", "--answers", STANDARD, "--criterion", "a");
  const id = /started (\S+)/.exec(started.out)?.[1] ?? "";
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1: a\n");
  const unproven = async (): Promise<string[]> =>
    (JSON.parse((await run("status", id, "--json")).out) as { unproven: string[] }).unproven;
  for (const lead of LEADS) {
    const name = `.crew/work/${id}/conclave/${lead}.delivery.md`;
    write(
      root,
      name,
      `# ${lead.replace(/^lead-/, "")} lead's validation of ${id}: delivery\nverdict: validated\n## Returns\n- none\n## Notes\n- early\n`,
    );
    const early = await run(
      "validation",
      id,
      "record",
      "--what",
      "delivery",
      "--by",
      lead,
      "--file",
      name,
    );
    expect(early.code).toBe(0);
    expect(early.out).toContain("Not proven: gates have not run");
  }
  // On no fingerprint the records answer the delivery's lines, and the item is no nearer to proven.
  const before = await unproven();
  expect(before[0]).toBe("gates have not run");
  expect(before.filter((r) => r.startsWith("validation of delivery"))).toEqual([]);
  // The first gate run gives the evidence a fingerprint: the early records are of something else.
  write(root, "src/a.ts", "x = 1");
  await run("gate", "run", id);
  const after = await unproven();
  expect(after).not.toContain("gates have not run");
  expect(after.filter((r) => r.startsWith("validation of delivery"))).toEqual(
    LEADS.map(
      (lead) =>
        `validation of delivery by ${lead}: stale (the evidence changed); record the lead again`,
    ),
  );
});
