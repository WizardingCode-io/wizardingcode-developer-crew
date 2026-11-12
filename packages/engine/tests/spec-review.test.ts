import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import { answerFile } from "../src/hooks/subagent-stop.ts";
import { isProtectedPath } from "../src/paths.ts";
import {
  briefHash,
  FINDING_LINE,
  parseSpecAnswer,
  SPEC_LENSES,
  STAGES,
} from "../src/spec-review.ts";
import { hookContext, makeRepo, repoPaths, testEnv } from "./helpers.ts";

const ANSWERS = (touches_infra: number, scope = 1) =>
  JSON.stringify({
    work_type: "feature",
    is_vague: 0,
    scope,
    touches_auth: 0,
    touches_payments: 0,
    touches_personal_data: 0,
    touches_data_migration: 0,
    touches_infra,
    touches_public_api: 0,
  });

const clean = (role: string) => `# findings\nreviewer: ${role}\n\n## Findings\nnone\n`;

/** A started item driven through the CLI in process, with its two documents written. */
async function item(touchesInfra = 1) {
  const root = makeRepo({ "README.md": "# t\n", "src/known.ts": "export const known = 1;\n" });
  const env = testEnv();
  const paths = repoPaths(root, env);
  const run = async (...args: string[]) => {
    const lines: string[] = [];
    const io: CliIo = {
      cwd: root,
      env,
      stdout: (t: string) => void lines.push(t),
      stderr: (t: string) => void lines.push(t),
      stdin: async () => "",
    };
    const code = await main(args, io);
    return { code, text: lines.join("\n") };
  };
  await run("detect");
  const started = await run("start", "a change", "--answers", ANSWERS(touchesInfra), "--json");
  const id = /(\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+)/.exec(started.text)?.[1] ?? "";
  const dir = join(root, ".crew", "work", id);
  writeFileSync(join(dir, "spec.md"), "# Spec\n\nThe spec.\n");
  writeFileSync(join(dir, "plan.md"), "# Plan\n\n1. The plan.\n");
  let agent = 0;
  /** What the SubagentStop hook leaves: the answer at its file and the role's row, with a fresh agent id. */
  const answer = (
    role: string,
    text = clean(role),
    agentId: string | null = `agent-${++agent}`,
  ) => {
    mkdirSync(join(dir, "spec-review"), { recursive: true });
    writeFileSync(join(dir, `spec-review/${role}.md`), text);
    const { evidence } = loadEvidence(paths, id);
    evidence.roles = [
      ...(evidence.roles ?? []),
      {
        agent: role,
        ...(agentId ? { agentId } : {}),
        at: new Date().toISOString(),
        tokens: 0,
        tokensFrom: "none",
        file: `spec-review/${role}.md`,
      },
    ];
    saveEvidence(paths, id, evidence);
  };
  const stage = async (n: number, findings: Record<string, string> = {}) => {
    const entry = STAGES.find((s) => s.stage === n);
    for (const role of entry?.reviewers ?? []) answer(role, findings[role] ?? clean(role));
    return run("spec-review", id, "record", String(n));
  };
  /** One whole round of the five stages with no findings. */
  const quietRound = async () => {
    await run("spec-review", id, "check");
    for (const s of STAGES) expect((await stage(s.stage)).code).toBe(0);
    return run("spec-review", id, "close");
  };
  return { root, env, paths, id, dir, run, answer, stage, quietRound };
}

const blocker = (scope = "Goals", text = "the goal is false") =>
  `## Findings\n- F-1 · Blocker · ${scope} · ${text}\n`;

const record = (t: Awaited<ReturnType<typeof item>>) =>
  loadEvidence(t.paths, t.id).evidence.specReview;

const findingId = (t: Awaited<ReturnType<typeof item>>) => {
  const rounds = record(t)?.rounds ?? [];
  return rounds.at(-1)?.findings.at(-1)?.id ?? "";
};

test("2026-10-31-005 AC-1: a full-route item has spec-review between plan and build; a standard item and an unstamped one do not", async () => {
  const { phasesFor } = await import("../src/work.ts");
  const full = await item(1);
  const work = JSON.parse(readFileSync(join(full.dir, "work.json"), "utf8"));
  expect(work.route).toBe("full");
  expect(work.specReview).toBe(true);
  const phases = phasesFor(work);
  expect(phases.indexOf("spec-review")).toBe(phases.indexOf("plan") + 1);
  expect(phases.indexOf("build")).toBe(phases.indexOf("spec-review") + 1);
  const standard = await item(0);
  const other = JSON.parse(readFileSync(join(standard.dir, "work.json"), "utf8"));
  expect(other.specReview).toBeUndefined();
  expect(phasesFor(other)).not.toContain("spec-review");
  expect(phasesFor({ route: "full", kind: "feature" })).not.toContain("spec-review");
});

test("2026-10-31-005 AC-2: the guard refuses build until the review is done, and an edit after it leaves it open", async () => {
  const { guardFor } = await import("../src/work.ts");
  const t = await item();
  const work = JSON.parse(readFileSync(join(t.dir, "work.json"), "utf8"));
  work.phase = "spec-review";
  work.criteria = [{ id: "AC-1", kind: "behavior", text: "x" }];
  const guard = () => {
    const ctx = {
      specText: readFileSync(join(t.dir, "spec.md"), "utf8"),
      planText: readFileSync(join(t.dir, "plan.md"), "utf8"),
      planExists: true,
      evidence: loadEvidence(t.paths, t.id).evidence,
    } as unknown as Parameters<typeof guardFor>[2];
    return guardFor(work, "build", ctx).filter((m) => m.includes("spec review"));
  };
  expect(guard().length).toBeGreaterThan(0);
  const first = await t.quietRound();
  expect(first.text).toContain("done: round 1 clean");
  expect(guard()).toEqual([]);
  writeFileSync(join(t.dir, "plan.md"), "# Plan\n\n1. Another plan.\n");
  expect(guard()).toEqual([]);
  // A churn mark stops the rounds; an acceptance ends the review, and an edit after it too.
  const cap = await item();
  const capWork = JSON.parse(readFileSync(join(cap.dir, "work.json"), "utf8"));
  capWork.phase = "spec-review";
  const capGuard = () =>
    guardFor(capWork, "build", {
      specText: readFileSync(join(cap.dir, "spec.md"), "utf8"),
      planText: readFileSync(join(cap.dir, "plan.md"), "utf8"),
      planExists: true,
      evidence: loadEvidence(cap.paths, cap.id).evidence,
    } as unknown as Parameters<typeof guardFor>[2]).filter((m) => m.includes("spec review"));
  await cap.run("spec-review", cap.id, "check");
  await cap.run(
    "spec-review",
    cap.id,
    "record",
    "5",
    "goldfish-zoom-out",
    "--not-run",
    "--reason",
    "x",
  );
  for (const s of [7, 9]) await cap.stage(s);
  await cap.run("spec-review", cap.id, "close");
  expect(capGuard().length).toBeGreaterThan(0);
  expect((await cap.run("spec-review", cap.id, "accept", "--reason", "their words")).code).toBe(0);
  expect(capGuard()).toEqual([]);
  writeFileSync(join(cap.dir, "spec.md"), "# Spec\n\nEdited.\n");
  expect(capGuard()).toEqual([]);
});

test("2026-10-31-005 AC-3: the stages record only in order, each with its reviewers, on an unchanged document", async () => {
  // 2026-11-08-001: the stages are 5, 7 and 9.
  expect(STAGES.map((s) => s.stage)).toEqual([5, 7, 9]);
  const t = await item();
  expect((await t.run("spec-review", t.id, "check")).text).toContain("stage 5");
  const early = await t.stage(7);
  expect(early.code).toBe(1);
  expect(early.text).toContain("stage 5");
  expect((await t.stage(5)).code).toBe(0);
  // A stage with a reviewer's answer missing.
  t.answer("goldfish-design");
  t.answer("goldfish-structural");
  rmSync(join(t.dir, "spec-review/goldfish-style.md"), { force: true });
  const missing = await t.run("spec-review", t.id, "record", "7");
  expect(missing.code).toBe(1);
  expect(missing.text).toContain("goldfish-style");
  writeFileSync(join(t.dir, "spec.md"), "# Spec\n\nChanged.\n");
  const changed = await t.stage(7);
  expect(changed.code).toBe(1);
  expect(changed.text).toContain("changed");
  // An answer with no findings section is no review.
  writeFileSync(join(t.dir, "spec.md"), "# Spec\n\nThe spec.\n");
  t.answer("goldfish-design");
  t.answer("goldfish-structural");
  t.answer("goldfish-style", "I read it and it looks fine.\n");
  const shapeless = await t.run("spec-review", t.id, "record", "7");
  expect(shapeless.code).toBe(1);
  expect(shapeless.text).toContain("## Findings");
});

test("2026-10-31-005 AC-4: a clean round ends the review; a propose-fix Blocker or a not run keeps a round from being clean; a settled finding does not", async () => {
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker() });
  await t.run(
    "spec-review",
    t.id,
    "resolve",
    findingId(t),
    "propose-fix",
    "--reason",
    "it is false",
  );
  for (const s of [7, 9]) await t.stage(s);
  const closed = await t.run("spec-review", t.id, "close");
  expect(closed.text).toContain("not clean");
  expect(record(t)?.rounds[0]?.clean).toBe(false);
  // A reviewer that did not run keeps its round from being clean.
  const n = await item();
  await n.run("spec-review", n.id, "check");
  const notRun = await n.run(
    "spec-review",
    n.id,
    "record",
    "5",
    "--not-run",
    "goldfish-zoom-out",
    "--reason",
    "it timed out twice",
  );
  expect(notRun.code).toBe(0);
  for (const s of [7, 9]) await n.stage(s);
  expect((await n.run("spec-review", n.id, "close")).text).toContain("not clean");
  // Round 2 settles against round 1's contested finding, and the review is done.
  const c = await item();
  await c.run("spec-review", c.id, "check");
  await c.stage(5, { "goldfish-zoom-out": blocker("Risks") });
  const contested = findingId(c);
  await c.run("spec-review", c.id, "resolve", contested, "propose-fix", "--reason", "x");
  await c.stage(7, { "goldfish-design": blocker("Goals") });
  await c.run(
    "spec-review",
    c.id,
    "resolve",
    findingId(c),
    "contest",
    "--reason",
    "the code shows it",
    "--evidence",
    "src/known.ts:known",
  );
  const earlier = findingId(c);
  await c.stage(9);
  expect((await c.run("spec-review", c.id, "close")).text).toContain("not clean");
  await c.run("spec-review", c.id, "check");
  await c.stage(5, { "goldfish-zoom-out": blocker("Goals") });
  const settled = await c.run(
    "spec-review",
    c.id,
    "resolve",
    findingId(c),
    "settled",
    "--reason",
    "raised before",
    "--earlier",
    earlier,
  );
  expect(settled.code).toBe(0);
  for (const s of [7, 9]) await c.stage(s);
  expect((await c.run("spec-review", c.id, "close")).text).toContain("done: round 2 clean");
});

test("2026-10-31-005 AC-5: the rules of a disposition, and no way to change a severity", async () => {
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker() });
  const id = findingId(t);
  const contest = await t.run("spec-review", t.id, "resolve", id, "contest", "--reason", "no");
  expect(contest.code).toBe(1);
  expect(contest.text).toContain("--evidence");
  const decline = await t.run("spec-review", t.id, "resolve", id, "decline", "--reason", "minor");
  expect(decline.code).toBe(1);
  expect(decline.text).toContain("Nit");
  const settled = await t.run("spec-review", t.id, "resolve", id, "settled", "--reason", "x");
  expect(settled.code).toBe(1);
  expect(settled.text).toContain("--earlier");
  const severity = await t.run(
    "spec-review",
    t.id,
    "resolve",
    id,
    "propose-fix",
    "--reason",
    "x",
    "--severity",
    "Nit",
  );
  expect(severity.code).toBe(1);
  expect(record(t)?.rounds[0]?.findings[0]?.severity).toBe("Blocker");
  // A Nit may be declined.
  await t.run("spec-review", t.id, "resolve", id, "propose-fix", "--reason", "x");
  t.answer("goldfish-design");
  t.answer("goldfish-structural");
  t.answer("goldfish-style", "## Findings\n- F-1 · Nit · Style · a small thing\n");
  expect((await t.run("spec-review", t.id, "record", "7")).code).toBe(0);
  const nit = findingId(t);
  expect(
    (await t.run("spec-review", t.id, "resolve", nit, "decline", "--reason", "small")).code,
  ).toBe(0);
  await t.stage(9);
  expect((await t.run("spec-review", t.id, "close")).code).toBe(0);
  // 2026-11-08-001: the comprehension stage left the round, so its never-contested rule is read
  // only on an old round's findings.
});

test("2026-10-31-005 AC-6: after a churn mark, round 2 is refused until accept", async () => {
  const c = await item();
  await c.run("spec-review", c.id, "check");
  await c.stage(5, { "goldfish-zoom-out": blocker() });
  await c.run(
    "spec-review",
    c.id,
    "resolve",
    findingId(c),
    "propose-fix",
    "--reason",
    "x",
    "--churn",
  );
  for (const s of [7, 9]) await c.stage(s);
  await c.run("spec-review", c.id, "close");
  const after = await c.run("spec-review", c.id, "check");
  expect(after.code).toBe(1);
  expect(after.text).toContain("churn");
  expect((await c.run("spec-review", c.id, "accept", "--reason", "take it as it is")).code).toBe(0);
  // With nothing stopping the rounds there is nothing to accept.
  const n = await item();
  expect((await n.run("spec-review", n.id, "accept", "--reason", "x")).code).toBe(1);
});

test("2026-10-31-005 AC-7: an answer from an agent id already recorded is refused", async () => {
  const t = await item();
  await t.run("spec-review", t.id, "check");
  t.answer("goldfish-zoom-out", clean("goldfish-zoom-out"), "same-agent");
  expect((await t.run("spec-review", t.id, "record", "5")).code).toBe(0);
  // 2026-11-08-001: stage 7 follows stage 5; a reviewer of it answering with the same agent id.
  t.answer("goldfish-design", clean("goldfish-design"), "same-agent");
  t.answer("goldfish-structural");
  t.answer("goldfish-style");
  const resumed = await t.run("spec-review", t.id, "record", "7");
  expect(resumed.code).toBe(1);
  expect(resumed.text).toContain("fresh");
});

test("2026-10-31-005 AC-8: a goldfish's answer lands at spec-review/<role>.md, the explorer's does not, and the record survives a gate run", async () => {
  expect(answerFile("goldfish-zoom-out", "x")).toBe("spec-review/goldfish-zoom-out.md");
  expect(answerFile("goldfish-explorer", "x")).toBe("conclave/goldfish-explorer.md");
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker() });
  // The whole answer is kept per round and stage, whatever a later answer does to the plain file.
  expect(
    readFileSync(join(t.dir, "spec-review/round1-stage5-goldfish-zoom-out.md"), "utf8"),
  ).toContain("the goal is false");
  expect((await t.run("gate", "run", t.id)).code).not.toBe(2);
  expect(existsSync(join(t.dir, "spec-review/goldfish-zoom-out.md"))).toBe(true);
  expect(record(t)?.rounds[0]?.findings).toHaveLength(1);
  expect(existsSync(join(t.dir, "spec-review/round1-stage5-goldfish-zoom-out.md"))).toBe(true);
});

test("2026-10-31-005 AC-9: report writes the consolidated file with the paraphrase, and the status and the item's report say where the review stands", async () => {
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker() });
  await t.run("spec-review", t.id, "resolve", findingId(t), "propose-fix", "--reason", "false");
  // 2026-11-08-001: the comprehension stage left the round, so no paraphrase is written now; an
  // old record's paraphrase is still rendered (renderSpecReview reads round.paraphrase).
  expect((await t.run("spec-review", t.id, "report")).code).toBe(0);
  const text = readFileSync(join(t.dir, "spec-review/consolidated.md"), "utf8");
  expect(text).toContain("goldfish-zoom-out");
  expect(text).toContain("the goal is false");
  expect(text).toContain("propose-fix");
  expect((await t.run("status")).text).toContain("spec review: round 1");
  const { renderReport } = await import("../src/evidence.ts");
  const { loadPolicy } = await import("../src/policy.ts");
  const work = JSON.parse(readFileSync(join(t.dir, "work.json"), "utf8"));
  const report = renderReport(
    work,
    loadEvidence(t.paths, t.id).evidence,
    loadPolicy(t.paths).policy,
  );
  expect(report).toContain("## Spec review");
});

test("2026-10-31-005 AC-11: spec-review/ is engine-owned: a Write and a Bash redirect into it are denied", async () => {
  const t = await item();
  expect(isProtectedPath(t.paths, join(t.dir, "spec-review/goldfish-zoom-out.md"))).toBe(true);
  const ctx = hookContext({ session_id: "s", cwd: t.root }, t.env);
  const denied = (r: Record<string, unknown>) =>
    (r.hookSpecificOutput as { permissionDecision?: string } | undefined)?.permissionDecision;
  expect(
    denied(
      onPreToolUse(ctx, {
        tool_name: "Write",
        tool_input: { file_path: join(t.dir, "spec-review/goldfish-zoom-out.md") },
      }),
    ),
  ).toBe("deny");
  expect(
    denied(
      onPreToolUse(ctx, {
        tool_name: "Bash",
        tool_input: { command: `echo x > .crew/work/${t.id}/spec-review/goldfish-zoom-out.md` },
      }),
    ),
  ).toBe("deny");
});

test("2026-10-31-005 AC-12: a raise to full stamps the item, and one raised after build began is refused at gate and at deliver", async () => {
  const { guardFor, raiseRoute } = await import("../src/work.ts");
  const t = await item(0);
  const work = JSON.parse(readFileSync(join(t.dir, "work.json"), "utf8"));
  expect(work.specReview).toBeUndefined();
  expect(raiseRoute(work, "full", "the diff touched infra")).toBe(true);
  expect(work.specReview).toBe(true);
  work.phase = "build";
  const ctx = {
    specText: "# Spec\n",
    planText: "# Plan\n",
    planExists: true,
    evidence: loadEvidence(t.paths, t.id).evidence,
    unproven: [],
    proven: true,
  } as unknown as Parameters<typeof guardFor>[2];
  for (const next of ["gate", "deliver"] as const)
    expect(guardFor(work, next, ctx).join(), next).toContain("spec review");
});

test("2026-10-31-005 AC-13: a Blocker marked escalate stays open until a person's answer", async () => {
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker() });
  const id = findingId(t);
  await t.run("spec-review", t.id, "resolve", id, "escalate", "--reason", "a team convention");
  for (const s of [7, 9]) await t.stage(s);
  const refused = await t.run("spec-review", t.id, "close");
  expect(refused.code).toBe(1);
  expect(refused.text).toContain(id);
  expect(
    (await t.run("spec-review", t.id, "answer", id, "confirm", "--reason", "it holds")).code,
  ).toBe(0);
  expect((await t.run("spec-review", t.id, "close")).text).not.toContain("not clean");
  // A fact added is a fix in the document: the round is not clean.
  const f = await item();
  await f.run("spec-review", f.id, "check");
  await f.stage(5, { "goldfish-zoom-out": blocker() });
  const added = findingId(f);
  await f.run("spec-review", f.id, "resolve", added, "escalate", "--reason", "a verbal decision");
  await f.run("spec-review", f.id, "answer", added, "add-fact", "--reason", "write it down");
  for (const s of [7, 9]) await f.stage(s);
  expect((await f.run("spec-review", f.id, "close")).text).toContain("not clean");
});

test("2026-10-31-005 AC-14: the engine checks contest's evidence and settled's earlier finding; a fixed finding is not one", async () => {
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker("Goals") });
  const fixed = findingId(t);
  const contest = (id: string, ev: string) =>
    t.run("spec-review", t.id, "resolve", id, "contest", "--reason", "x", "--evidence", ev);
  for (const bad of [
    "src/absent.ts:known",
    "src/known.ts:absent",
    "../outside.ts:known",
    "nocolon",
  ])
    expect((await contest(fixed, bad)).code, bad).toBe(1);
  await t.run("spec-review", t.id, "resolve", fixed, "propose-fix", "--reason", "x");
  // 2026-11-08-001: round 1 is not clean (the fixed Blocker), so round 2 runs; a contested
  // finding of round 1 is what a later one may settle against.
  await t.stage(7, { "goldfish-design": blocker("Risks") });
  const contested = findingId(t);
  expect((await contest(contested, "src/known.ts:known")).code).toBe(0);
  await t.stage(9);
  await t.run("spec-review", t.id, "close");
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker("Goals") });
  const later = findingId(t);
  const settle = (id: string, earlier: string) =>
    t.run("spec-review", t.id, "resolve", id, "settled", "--reason", "x", "--earlier", earlier);
  // Fixed, so it re-opens rather than settles; unknown; and this round's own id.
  for (const bad of [fixed, "zoom-out-9.9-9", later])
    expect((await settle(later, bad)).code, bad).toBe(1);
  // Evidence in the item's own document holds.
  expect((await contest(later, "spec.md:The spec")).code).toBe(0);
  // Another scope does not settle against a contested finding.
  await t.stage(7, { "goldfish-design": blocker("Elsewhere") });
  const other = await settle(findingId(t), contested);
  expect(other.code).toBe(1);
  expect(other.text).toContain("scope");
});

test("2026-10-31-005 AC-15: accept and answer are denied where nobody watches and with --mode beside a person; under relay they run and enter the register", async () => {
  const t = await item();
  const ctx = hookContext({ session_id: "s", cwd: t.root }, t.env);
  const verdict = (command: string, permission_mode?: string) =>
    (
      onPreToolUse(ctx, {
        tool_name: "Bash",
        tool_input: { command },
        permission_mode,
      } as never).hookSpecificOutput as { permissionDecision?: string } | undefined
    )?.permissionDecision;
  for (const verb of [`accept --reason x`, `answer F confirm --reason x`]) {
    const command = `crew spec-review ${t.id} ${verb}`;
    expect(verdict(command, "bypassPermissions"), verb).toBe("deny");
    expect(verdict(`${command} --mode bypassPermissions`, "bypassPermissions"), verb).toBe("deny");
    expect(verdict(`${command} --mode default`, "default"), verb).toBe("deny");
    expect(verdict(command, "default"), verb).toBeUndefined();
  }
  // Every other verb decides nothing.
  expect(verdict(`crew spec-review ${t.id} check`, "bypassPermissions")).toBeUndefined();
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker() });
  const id = findingId(t);
  await t.run("spec-review", t.id, "resolve", id, "escalate", "--reason", "x");
  await t.run("spec-review", t.id, "answer", id, "confirm", "--reason", "their words");
  expect((await t.run("decisions", "--grep", "their words")).text).toContain("relayed");
});

test("2026-10-31-005 AC-16: an answer with no hook record, or a row with no agent id, is refused", async () => {
  const t = await item();
  await t.run("spec-review", t.id, "check");
  // A file with no row.
  mkdirSync(join(t.dir, "spec-review"), { recursive: true });
  writeFileSync(join(t.dir, "spec-review/goldfish-zoom-out.md"), clean("goldfish-zoom-out"));
  expect((await t.run("spec-review", t.id, "record", "5")).code).toBe(1);
  // A row with no agent id.
  t.answer("goldfish-zoom-out", clean("goldfish-zoom-out"), null);
  expect((await t.run("spec-review", t.id, "record", "5")).code).toBe(1);
  // A session's filing.
  t.answer("goldfish-zoom-out", clean("goldfish-zoom-out"), "agent-filed");
  const { evidence } = loadEvidence(t.paths, t.id);
  const row = (evidence.roles ?? []).at(-1);
  if (row) row.filedBy = "session";
  saveEvidence(t.paths, t.id, evidence);
  const filed = await t.run("spec-review", t.id, "record", "5");
  expect(filed.code).toBe(1);
  expect(filed.text).toContain("not run");
});

const LENSES = [...SPEC_LENSES];

const BRIEF = [
  "# A feature",
  "## Overview",
  "What it is.",
  "## Analysis",
  "What the lenses said.",
  "## Goals vs. Non-Goals",
  "In and out.",
  "## Alternatives Weighed",
  "What was rejected.",
  "## Key Decisions",
  "What was decided.",
  "",
].join("\n");

/** What the hook leaves for a lens launched in brainstorm mode. */
function lens(
  t: Awaited<ReturnType<typeof item>>,
  role: string,
  agentId: string,
  file = `spec-review/brainstorm-${role}.md`,
) {
  mkdirSync(join(t.dir, "spec-review"), { recursive: true });
  writeFileSync(join(t.dir, file), "mode: brainstorm\n\n## Findings\nnone\n");
  const { evidence } = loadEvidence(t.paths, t.id);
  evidence.roles = [
    ...(evidence.roles ?? []),
    { agent: role, agentId, at: new Date().toISOString(), tokens: 0, tokensFrom: "none", file },
  ];
  saveEvidence(t.paths, t.id, evidence);
}

const allLenses = (t: Awaited<ReturnType<typeof item>>) => {
  for (const role of LENSES) lens(t, role, `lens-${role}`);
};

test("2026-10-31-007 AC-2: brief refuses a missing section and a lens with no hook-filed row, and records the hash and the agents when all hold", async () => {
  const t = await item();
  expect((await t.run("spec-review", t.id, "brief")).code).toBe(1);
  allLenses(t);
  writeFileSync(
    join(t.dir, "concepts_brief.md"),
    BRIEF.replace("## Analysis\nWhat the lenses said.\n", ""),
  );
  const missing = await t.run("spec-review", t.id, "brief");
  expect(missing.code).toBe(1);
  expect(missing.text).toContain("Analysis");
  // A heading with nothing under it, and one level too deep, are missing too.
  writeFileSync(join(t.dir, "concepts_brief.md"), BRIEF.replace("What the lenses said.\n", ""));
  expect((await t.run("spec-review", t.id, "brief")).text).toContain("Analysis");
  writeFileSync(join(t.dir, "concepts_brief.md"), BRIEF.replace("## Analysis", "### Analysis"));
  expect((await t.run("spec-review", t.id, "brief")).text).toContain("Analysis");
  writeFileSync(join(t.dir, "concepts_brief.md"), BRIEF);
  // A lens filed by the session does not count.
  const { evidence } = loadEvidence(t.paths, t.id);
  const row = (evidence.roles ?? []).at(-1);
  if (row) row.filedBy = "session";
  saveEvidence(t.paths, t.id, evidence);
  const filed = await t.run("spec-review", t.id, "brief");
  expect(filed.code).toBe(1);
  expect(filed.text).toContain(LENSES.at(-1) as string);
  allLenses(t);
  expect((await t.run("spec-review", t.id, "brief")).code).toBe(0);
  const brief = record(t)?.brief;
  expect(Object.keys(brief?.agents ?? {}).sort()).toEqual([...LENSES].sort());
  expect(brief?.hash).toBe(briefHash(BRIEF));
});

test("2026-10-31-007 AC-3: the guard into specify requires a recorded brief on a stamped feature; an issue, an unstamped item and a standard item pass", async () => {
  const { guardFor } = await import("../src/work.ts");
  const t = await item();
  const work = JSON.parse(readFileSync(join(t.dir, "work.json"), "utf8"));
  work.phase = "understand";
  const guard = (w: typeof work) =>
    guardFor(w, "specify", {
      evidence: loadEvidence(t.paths, t.id).evidence,
    } as unknown as Parameters<typeof guardFor>[2]).filter((m) => m.includes("brief"));
  expect(guard(work).join()).toContain("crew spec-review");
  expect(guard({ ...work, kind: "new-project" }).length).toBe(1);
  expect(guard({ ...work, kind: "issue" })).toEqual([]);
  expect(guard({ ...work, specReview: undefined })).toEqual([]);
  expect(guard({ ...work, route: "standard" })).toEqual([]);
  allLenses(t);
  writeFileSync(join(t.dir, "concepts_brief.md"), BRIEF);
  await t.run("spec-review", t.id, "brief");
  expect(guard(work)).toEqual([]);
});

test("2026-10-31-007 AC-7: a lens's answer lands apart, brief refuses a review-mode row and a shared id, accepts its own, and a stage refuses its agents", async () => {
  expect(answerFile("goldfish-design", "mode: brainstorm\n\n## Findings\n")).toBe(
    "spec-review/brainstorm-goldfish-design.md",
  );
  expect(answerFile("goldfish-design", "# design findings\n\n## Findings\n")).toBe(
    "spec-review/goldfish-design.md",
  );
  const t = await item();
  writeFileSync(join(t.dir, "concepts_brief.md"), BRIEF);
  // A review-mode row for one lens.
  for (const role of LENSES.slice(1)) lens(t, role, `lens-${role}`);
  lens(t, LENSES[0] as string, "review-agent", `spec-review/${LENSES[0]}.md`);
  const review = await t.run("spec-review", t.id, "brief");
  expect(review.code).toBe(1);
  expect(review.text).toContain(LENSES[0] as string);
  // One agent id for two lenses.
  lens(t, LENSES[0] as string, "shared");
  lens(t, LENSES[1] as string, "shared");
  const shared = await t.run("spec-review", t.id, "brief");
  expect(shared.code).toBe(1);
  expect(shared.text).toContain("shared");
  lens(t, LENSES[1] as string, `lens-${LENSES[1]}`);
  expect((await t.run("spec-review", t.id, "brief")).code).toBe(0);
  // An agent a stage already recorded does not count as a lens.
  const other = await item();
  writeFileSync(join(other.dir, "concepts_brief.md"), BRIEF);
  await other.run("spec-review", other.id, "check");
  other.answer("goldfish-zoom-out", clean("goldfish-zoom-out"), "stage-agent");
  expect((await other.run("spec-review", other.id, "record", "5")).code).toBe(0);
  for (const role of LENSES) lens(other, role, `lens-${role}`);
  lens(other, LENSES[0] as string, "stage-agent");
  const used = await other.run("spec-review", other.id, "brief");
  expect(used.code).toBe(1);
  expect(used.text).toContain("stage-agent");
  // A revised brief is recorded again with the same agents.
  writeFileSync(join(t.dir, "concepts_brief.md"), `${BRIEF}\nRevised.\n`);
  expect((await t.run("spec-review", t.id, "brief")).code).toBe(0);
  // A lens's agent does not count in a stage.
  await t.run("spec-review", t.id, "check");
  t.answer("goldfish-zoom-out", clean("goldfish-zoom-out"), "lens-goldfish-zoom-out");
  const stage = await t.run("spec-review", t.id, "record", "5");
  expect(stage.code).toBe(1);
  expect(stage.text).toContain("fresh");
});

/** A review that converged, so an item may publish. */
async function converged(t: Awaited<ReturnType<typeof item>>) {
  await t.quietRound();
}

test("2026-10-31-007 AC-4: publish writes the document with the provenance and the sitemap row, and an unstamped item writes nothing", async () => {
  const t = await item();
  await converged(t);
  const first = await t.run("spec-review", t.id, "publish");
  expect(first.code).toBe(0);
  const file = join(t.root, "docs/designs", `${t.id}.md`);
  expect(first.text).toContain(`docs/designs/${t.id}.md`);
  expect(first.text).toContain("commit");
  const text = readFileSync(file, "utf8");
  expect(text).toContain("The spec.");
  expect(text).toContain("The plan.");
  expect(text).toContain(t.id);
  // No sitemap appears by itself.
  expect(existsSync(join(t.root, "docs/designs/SITEMAP.md"))).toBe(false);
  const standard = await item(0);
  expect((await standard.run("spec-review", standard.id, "publish")).code).toBe(1);
  expect(existsSync(join(standard.root, "docs/designs"))).toBe(false);
});

test("2026-10-31-007 AC-8: a secret or a symlink writes nothing and is said, the sitemap row appears once, neutralised, and a review neither converged nor accepted writes nothing", async () => {
  const t = await item();
  const none = await t.run("spec-review", t.id, "publish");
  expect(none.code).toBe(1);
  expect(none.text).toContain("spec review");
  expect(existsSync(join(t.root, "docs/designs"))).toBe(false);
  await converged(t);
  const planFile = join(t.dir, "plan.md");
  const plan = readFileSync(planFile, "utf8");
  const file = join(t.root, "docs/designs", `${t.id}.md`);
  const { publishDesign } = await import("../src/spec-publish.ts");
  const secret = publishDesign(t.root, t.id, "T", "# S\n", `key AKIA${"ABCDEFGHIJKLMNOP"}\n`);
  expect("refused" in secret).toBe(true);
  expect(existsSync(file)).toBe(false);
  // The folder a symlink out of the repository.
  const outside = makeRepo({ "x.md": "x\n" });
  mkdirSync(join(t.root, "docs"), { recursive: true });
  symlinkSync(outside, join(t.root, "docs/designs"));
  const linked = publishDesign(t.root, t.id, "T", "# S\n", plan);
  expect("refused" in linked).toBe(true);
  expect(existsSync(join(outside, `${t.id}.md`))).toBe(false);
  rmSync(join(t.root, "docs/designs"));
  // The file a symlink.
  mkdirSync(join(t.root, "docs/designs"), { recursive: true });
  symlinkSync(join(outside, "x.md"), file);
  expect("refused" in publishDesign(t.root, t.id, "T", "# S\n", plan)).toBe(true);
  expect(readFileSync(join(outside, "x.md"), "utf8")).toBe("x\n");
  rmSync(file);
  expect(publishDesign(t.root, "../escape", "T", "# S\n", plan)).toHaveProperty("refused");
  // The sitemap gets one row, its title neutralised, and the file is replaced on a second run.
  writeFileSync(join(t.root, "docs/designs/SITEMAP.md"), "# Sitemap\n");
  publishDesign(t.root, t.id, "A | title\nwith a break", "# S\n", plan);
  publishDesign(t.root, t.id, "A | title\nwith a break", "# S2\n", plan);
  const sitemap = readFileSync(join(t.root, "docs/designs/SITEMAP.md"), "utf8");
  expect(sitemap.split(t.id).length - 1).toBe(2); // the id and the file name, one row
  expect(sitemap).toContain("A / title with a break");
  expect(readFileSync(file, "utf8")).toContain("# S2");
});

/** A fast item proven through the CLI, stamped as a full item would be, ready to learn. */
async function provenStamped(reviewed: boolean) {
  const root = makeRepo({
    "README.md": "# t\n",
    "package.json": JSON.stringify({ name: "t", scripts: { test: "exit 0" } }),
    ".crew/policy.json": JSON.stringify({ allowSkips: ["tdd"] }),
  });
  const env = testEnv();
  const paths = repoPaths(root, env);
  const run = async (...args: string[]) => {
    const lines: string[] = [];
    const code = await main(args, {
      cwd: root,
      env,
      stdout: (t: string) => void lines.push(t),
      stderr: (t: string) => void lines.push(t),
      stdin: async () => "",
    });
    return { code, text: lines.join("\n") };
  };
  await run("detect");
  const answers = JSON.stringify({
    work_type: "chore",
    is_vague: 0,
    scope: 0,
    touches_auth: 0,
    touches_payments: 0,
    touches_personal_data: 0,
    touches_data_migration: 0,
    touches_infra: 0,
    touches_public_api: 0,
  });
  const started = await run("start", "A chore", "--answers", answers, "--criterion", "it holds");
  const id = /(\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+)/.exec(started.text)?.[1] ?? "";
  const dir = join(root, ".crew", "work", id);
  await run("skip", id, "tdd:AC-1", "--reason", "manual");
  expect((await run("gate", "run", id)).text).toContain(`Proven: ${id}`);
  expect((await run("phase", id, "next")).code).toBe(0);
  writeFileSync(join(dir, "spec.md"), "# Spec\n\nThe spec.\n");
  writeFileSync(join(dir, "plan.md"), "# Plan\n\n1. The plan.\n");
  const { loadWork, saveWork } = await import("../src/work.ts");
  const work = loadWork(paths, id).work;
  if (!work) throw new Error("no work");
  work.specReview = true;
  saveWork(paths, work);
  if (reviewed) {
    const { evidence } = loadEvidence(paths, id);
    const { specReviewHash } = await import("../src/spec-review.ts");
    evidence.specReview = {
      rounds: [],
      agentIds: [],
      accepted: {
        hash: specReviewHash("# Spec\n\nThe spec.\n", "# Plan\n\n1. The plan.\n"),
        round: 5,
        reason: "r",
        by: "user",
        at: "t",
      },
    };
    saveEvidence(paths, id, evidence);
  }
  return { root, id, run };
}

test("2026-10-31-007 AC-4: crew learn publishes a stamped item's document, says it needs committing, and holds when it cannot publish", async () => {
  const t = await provenStamped(true);
  const learned = await t.run("learn", t.id);
  expect(learned.code).toBe(0);
  expect(learned.text).toContain(`docs/designs/${t.id}.md: commit it`);
  expect(readFileSync(join(t.root, "docs/designs", `${t.id}.md`), "utf8")).toContain("The plan.");
  const open = await provenStamped(false);
  const held = await open.run("learn", open.id);
  expect(held.code).toBe(0);
  expect(held.text).toContain("not published");
  expect(existsSync(join(open.root, "docs/designs"))).toBe(false);
});

test("2026-11-01-002 AC-11: a clean round ends the review whatever it raised: a settled Blocker leaves round 1 clean", async () => {
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker("Goals", "the goal is false") });
  const contested = await t.run(
    "spec-review",
    t.id,
    "resolve",
    findingId(t),
    "contest",
    "--reason",
    "the spec decides it",
    "--evidence",
    "spec.md:The spec",
  );
  expect(contested.code).toBe(0);
  for (const s of [7, 9]) await t.stage(s);
  expect((await t.run("spec-review", t.id, "close")).text).toContain("done: round 1 clean");
  expect((await t.run("spec-review", t.id, "status")).text).not.toContain("stopped");
});

/** Stages 7 and 9 recorded quiet: what follows stage 5 in a round of three stages (2026-11-08-001). */
async function rest(t: Awaited<ReturnType<typeof item>>) {
  await t.stage(7);
  await t.stage(9);
}

test("2026-11-08-001 AC-3: a round has the stages 5, 7 and 9, in that order", async () => {
  expect(STAGES.map((s) => [s.stage, s.reviewers])).toEqual([
    [5, ["goldfish-zoom-out"]],
    [7, ["goldfish-design", "goldfish-structural", "goldfish-style"]],
    [9, ["goldfish-readiness", "goldfish-codebase"]],
  ]);
  const t = await item();
  await t.run("spec-review", t.id, "check");
  expect((await t.stage(5)).code).toBe(0);
  const due = await t.run("spec-review", t.id, "status");
  expect(due.text).toContain("stage 7");
  expect((await t.run("spec-review", t.id, "record", "6")).code).toBe(1);
  await rest(t);
  expect((await t.run("spec-review", t.id, "close")).code).toBe(0);
});

test("2026-11-08-001 AC-7: at most two rounds; done after a clean round or after two; a churn mark still stops", async () => {
  const { specReviewMissing } = await import("../src/spec-review.ts");
  const once = await item();
  expect((await once.quietRound()).text).toContain("done: round 1 clean");
  const after = await once.run("spec-review", once.id, "check");
  expect(after.code).toBe(1);
  expect(after.text).toContain("the spec review is done");
  expect(specReviewMissing(record(once))).toEqual([]);
  // Round 1 not clean opens round 2; after round 2, clean or not, the review is done.
  const twice = await item();
  for (const scope of ["Goals", "Risks"]) {
    expect((await twice.run("spec-review", twice.id, "check")).code).toBe(0);
    await twice.stage(5, { "goldfish-zoom-out": blocker(scope) });
    await twice.run(
      "spec-review",
      twice.id,
      "resolve",
      findingId(twice),
      "propose-fix",
      "--reason",
      "x",
    );
    await rest(twice);
    await twice.run("spec-review", twice.id, "close");
  }
  expect(record(twice)?.rounds.at(-1)?.clean).toBe(false);
  expect((await twice.run("spec-review", twice.id, "status")).text).toContain("done: two rounds");
  const third = await twice.run("spec-review", twice.id, "check");
  expect(third.code).toBe(1);
  expect(third.text).toContain("the spec review is done");
  expect(specReviewMissing(record(twice))).toEqual([]);
  // A reviewer not run in round 1 opens round 2 with no accept.
  const gap = await item();
  await gap.run("spec-review", gap.id, "check");
  await gap.run(
    "spec-review",
    gap.id,
    "record",
    "5",
    "--not-run",
    "goldfish-zoom-out",
    "--reason",
    "x",
  );
  await rest(gap);
  expect((await gap.run("spec-review", gap.id, "close")).text).toContain("not clean");
  expect((await gap.run("spec-review", gap.id, "check")).code).toBe(0);
  // A churn mark on round 1 stops before round 2 until accept, which ends the review.
  const churn = await item();
  await churn.run("spec-review", churn.id, "check");
  await churn.stage(5, { "goldfish-zoom-out": blocker() });
  await churn.run(
    "spec-review",
    churn.id,
    "resolve",
    findingId(churn),
    "propose-fix",
    "--reason",
    "x",
    "--churn",
  );
  await rest(churn);
  await churn.run("spec-review", churn.id, "close");
  const stopped = await churn.run("spec-review", churn.id, "check");
  expect(stopped.code).toBe(1);
  expect(stopped.text).toContain("churn");
  expect((await churn.run("spec-review", churn.id, "accept", "--reason", "take it")).code).toBe(0);
  expect(specReviewMissing(record(churn))).toEqual([]);
  // Nothing stops a fresh review, so there is nothing to accept.
  const fresh = await item();
  expect((await fresh.run("spec-review", fresh.id, "accept", "--reason", "x")).code).toBe(1);
});

test("2026-11-08-001 AC-8: only an unsettled Blocker keeps a round from being clean", async () => {
  const major = await item();
  await major.run("spec-review", major.id, "check");
  await major.stage(5, { "goldfish-zoom-out": "## Findings\n- F-1 · Major · Plan · a detail\n" });
  const id = findingId(major);
  await rest(major);
  const undecided = await major.run("spec-review", major.id, "close");
  expect(undecided.code).toBe(1);
  expect(undecided.text).toContain(id);
  await major.run("spec-review", major.id, "resolve", id, "propose-fix", "--reason", "x");
  expect((await major.run("spec-review", major.id, "close")).text).toContain("done: round 1 clean");
  const cases: [string, string[], boolean][] = [
    ["propose-fix", ["--reason", "x"], false],
    ["contest", ["--reason", "x", "--evidence", "src/known.ts:known"], true],
  ];
  for (const [disposition, args, clean] of cases) {
    const t = await item();
    await t.run("spec-review", t.id, "check");
    await t.stage(5, { "goldfish-zoom-out": blocker() });
    await t.run("spec-review", t.id, "resolve", findingId(t), disposition, ...args);
    await rest(t);
    await t.run("spec-review", t.id, "close");
    expect(record(t)?.rounds[0]?.clean, disposition).toBe(clean);
  }
  for (const [choice, clean] of [
    ["confirm", true],
    ["add-fact", false],
  ] as const) {
    const t = await item();
    await t.run("spec-review", t.id, "check");
    await t.stage(5, { "goldfish-zoom-out": blocker() });
    const b = findingId(t);
    await t.run("spec-review", t.id, "resolve", b, "escalate", "--reason", "a convention");
    await rest(t);
    const refused = await t.run("spec-review", t.id, "close");
    expect(refused.code).toBe(1);
    expect(refused.text).toContain(b);
    await t.run("spec-review", t.id, "answer", b, choice, "--reason", "their words");
    await t.run("spec-review", t.id, "close");
    expect(record(t)?.rounds[0]?.clean, choice).toBe(clean);
  }
});

test("2026-11-08-001 AC-9: an edit once the review is done leaves it done; an edit in an open round restarts that round", async () => {
  const { specReviewMissing } = await import("../src/spec-review.ts");
  const t = await item();
  await t.quietRound();
  writeFileSync(join(t.dir, "spec.md"), "# Spec\n\nThe fixes applied.\n");
  expect(specReviewMissing(record(t))).toEqual([]);
  expect((await t.run("spec-review", t.id, "check")).text).toContain("the spec review is done");
  const open = await item();
  await open.run("spec-review", open.id, "check");
  await open.stage(5);
  writeFileSync(join(open.dir, "plan.md"), "# Plan\n\n1. Changed mid-round.\n");
  const fresh = await open.run("spec-review", open.id, "check");
  expect(fresh.code).toBe(0);
  expect(fresh.text).toContain("round 1");
  expect(fresh.text).toContain("stage 5");
  expect(record(open)?.rounds.length).toBe(1);
});

test("2026-11-08-001 AC-10: a record written under the old rules is read as it stands", async () => {
  const { specReviewMissing, closeSpecRound, renderSpecReview, resolveSpecFinding } = await import(
    "../src/spec-review.ts"
  );
  const stagesOf = (ns: number[]) => ns.map((stage) => ({ stage, reviewers: {}, at: "t" }));
  const round = (n: number, clean: boolean) => ({
    n,
    hash: "old",
    openedAt: "t",
    closedAt: "t",
    clean,
    stages: stagesOf([5, 6, 7, 8, 9]),
    findings: [],
  });
  expect(
    specReviewMissing({ rounds: [round(1, false), round(2, false), round(3, false)] } as never),
  ).toEqual([]);
  expect(specReviewMissing({ rounds: [round(1, true)] } as never)).toEqual([]);
  // An old round is not judged again: one closed not clean for a Major alone leaves the review
  // not done, and round 2 opens on it.
  const majorOnly = {
    rounds: [
      {
        ...round(1, false),
        findings: [
          { id: "x", severity: "Major", scope: "s", text: "t", disposition: "propose-fix" },
        ],
      },
    ],
  };
  expect(specReviewMissing(majorOnly as never).join()).toContain("not done");
  // An open round that holds stage 6 and not 8, or 8 and not 6, closes once 5, 7 and 9 are there.
  for (const held of [
    [5, 6, 7, 9],
    [5, 7, 8, 9],
  ]) {
    const open = {
      rounds: [{ n: 1, hash: "old", openedAt: "t", stages: stagesOf(held), findings: [] }],
    };
    expect(closeSpecRound(open as never, "t"), held.join()).toBeNull();
    expect(open.rounds[0]).toMatchObject({ clean: true, closedAt: "t" });
  }
  // An old round's paraphrase is still rendered, and its comprehension finding still never contested.
  const old = {
    rounds: [
      {
        n: 1,
        hash: "old",
        openedAt: "t",
        stages: stagesOf([5, 6]),
        paraphrase: "**What this proposes**\nA thing.",
        findings: [
          {
            id: "comprehension-1.6-1",
            round: 1,
            reviewer: "goldfish-comprehension",
            severity: "Blocker",
            scope: "Overview",
            text: "a gap",
          },
        ],
      },
    ],
  };
  expect(renderSpecReview(old as never)).toContain("**What this proposes**");
  const refused = resolveSpecFinding(old as never, {
    finding: "comprehension-1.6-1",
    disposition: "contest",
    reason: "clear to me",
    evidence: "src/known.ts:known",
  });
  expect(refused).toContain("comprehension");
});

test("2026-11-08-001 AC-11: the texts say two rounds, a Blocker-only clean round and stages 5, 7 and 9", () => {
  const read = (path: string) => readFileSync(join(import.meta.dir, "../../..", path), "utf8");
  const files = [
    "plugins/core/skills/wizardingcode-spec-review/SKILL.md",
    "plugins/core/skills/wizardingcode-spec-review-loop/SKILL.md",
    "docs/adr/0019-the-document-is-reviewed-before-the-code.md",
    "docs/sources/ledger.json",
    "packages/engine/src/cli.ts",
  ];
  for (const file of files) {
    const text = read(file);
    expect(text, file).not.toContain("two consecutive clean rounds");
    expect(text, file).not.toContain("cap of 5");
  }
  const loop = read("plugins/core/skills/wizardingcode-spec-review-loop/SKILL.md");
  expect(loop).toContain("two rounds");
  expect(loop).toContain("only an unsettled Blocker");
  const review = read("plugins/core/skills/wizardingcode-spec-review/SKILL.md");
  expect(review).not.toContain("6, comprehension");
  expect(review).not.toContain("8, second zoom out");
  const adr = read("docs/adr/0019-the-document-is-reviewed-before-the-code.md");
  for (const words of ["At most two rounds", "no Blocker is unsettled", "stages 5, 7 and 9"])
    expect(adr, words).toContain(words);
  expect(review).toContain("Runs three stages");
  expect(review).toContain("At most two rounds");
  const rows = (JSON.parse(read("docs/sources/ledger.json")) as { rows: Record<string, string>[] })
    .rows;
  const row = (rule: string) => rows.find((r) => r.rule === rule);
  expect(row("review: the five stages in order")).toMatchObject({
    status: "refused",
    decision: "D-3",
  });
  expect(row("review: the five stages in order")?.reason).toContain("stages 5, 7 and 9");
  const loopRow = row("review-loop: two clean rounds, the cap, churn");
  expect(loopRow).toMatchObject({ status: "refused", decision: "D-1" });
  expect(loopRow?.reason).toContain("at most two rounds");
  expect(loopRow?.reason).toContain("only an unsettled Blocker");
});

const HEAD = "# findings\nreviewer: goldfish-style\n\n## Findings\n";

test("2026-11-12-001 AC-1: an answer with a finding line of no readable severity is refused with each such line named; no section has its own refusal", async () => {
  expect(parseSpecAnswer("I read it.\n")).toEqual({ refused: "no-section" });
  const off = parseSpecAnswer(
    `${HEAD}- F-1 · Nit · Goals · fine\n- F-2 · Minor · Goals · no such severity\n- F-3 · Major\n- F-4 · Nit · \n`,
  );
  expect(off).toEqual({
    refused: "off-shape",
    lines: [
      { line: 6, text: "- F-2 · Minor · Goals · no such severity" },
      { line: 7, text: "- F-3 · Major" },
      { line: 8, text: "- F-4 · Nit ·" },
    ],
  });
  // Through the command: each refusal in its own words, and nothing recorded for the stage.
  const t = await item();
  await t.run("spec-review", t.id, "check");
  expect((await t.stage(5)).code).toBe(0);
  const before = JSON.stringify(record(t));
  const long = `- F-2 · Minor · Goals · ${"x".repeat(200)}`;
  const refused = await t.stage(7, {
    "goldfish-style": `${HEAD}- F-1 · Nit · Goals · fine\n${long}\n- F-3 · Major\n`,
  });
  expect(refused.code).toBe(1);
  expect(refused.text).toContain(
    "goldfish-style's answer has 2 finding lines off the shape (- F-n · Blocker|Major|Nit · <scope> · <text>)",
  );
  // A line's text is cut at 120 characters.
  expect(refused.text).toContain(`line 6 "${long.slice(0, 120)}…"`);
  expect(refused.text).not.toContain(long.slice(0, 121));
  expect(refused.text).toContain('line 7 "- F-3 · Major"');
  expect(refused.text).toContain("launch it again or record it as not run");
  expect(JSON.stringify(record(t))).toBe(before);
  const none = await t.stage(7, { "goldfish-style": "I read it and it looks fine.\n" });
  expect(none.code).toBe(1);
  expect(none.text).toContain(
    "goldfish-style's answer is no review: it has no ## Findings section",
  );
  expect(none.text).not.toContain("off the shape");
  expect(JSON.stringify(record(t))).toBe(before);
  const one = await t.stage(7, { "goldfish-style": `${HEAD}- F-1 · Minor · Goals · x\n` });
  expect(one.text).toContain("has 1 finding line off the shape");
});

test("2026-11-12-001 AC-2: a finding line with a severity and a text and no scope is recorded with the scope not given, and the answer names the line", async () => {
  const read = parseSpecAnswer(
    `${HEAD}- F-1 · Nit · Goals · fine\n- F-2 · Nit · Line 113 repeats line 50\n- F-3 · Blocker · Risks · the risk is false\n`,
  );
  expect(read).toEqual({
    findings: [
      { severity: "Nit", scope: "Goals", text: "fine" },
      { severity: "Nit", scope: "not given", text: "Line 113 repeats line 50" },
      { severity: "Blocker", scope: "Risks", text: "the risk is false" },
    ],
    prose: "",
    mended: [{ line: 6, kind: "no-scope" }],
  });
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5);
  const done = await t.stage(7, {
    "goldfish-style": `${HEAD}- F-1 · Nit · Goals · fine\n- F-2 · Nit · Line 113 repeats line 50\n- F-3 · Nit · and line 60\n`,
    "goldfish-design": `## Findings\n- F-1 · Major · no scope here either\n`,
  });
  expect(done.code).toBe(0);
  expect(done.text).toContain("stage 7 recorded: 4 findings");
  expect(done.text).toContain(
    'goldfish-style: lines 6 and 7 had no scope (recorded as "not given")',
  );
  expect(done.text).toContain('goldfish-design: line 2 had no scope (recorded as "not given")');
  const found = record(t)?.rounds.at(-1)?.findings ?? [];
  expect(
    found.filter((f) => f.reviewer === "goldfish-style").map((f) => [f.scope, f.text]),
  ).toEqual([
    ["Goals", "fine"],
    ["not given", "Line 113 repeats line 50"],
    ["not given", "and line 60"],
  ]);
  // An answer with nothing mended says nothing more than before.
  const quiet = await t.stage(9);
  expect(quiet.text).not.toContain("had no scope");
  expect(quiet.text).not.toContain("joined");
});

test("2026-11-12-001 AC-3: a line indented under a finding joins that finding's text and is named; a line not indented, or after a blank line, stays outside", async () => {
  const read = parseSpecAnswer(
    `${HEAD}- F-1 · Major · Goals · the goal is vague\n  - it names no measure\n\tand no date\n- F-2 · Nit · Risks · short\n\n  an indented line after a blank line\nnot indented\n- F-3 · Nit · Design · last\n  * a starred bullet\n`,
  );
  expect(read).toEqual({
    findings: [
      {
        severity: "Major",
        scope: "Goals",
        text: "the goal is vague it names no measure and no date",
      },
      { severity: "Nit", scope: "Risks", text: "short" },
      { severity: "Nit", scope: "Design", text: "last a starred bullet" },
    ],
    prose: "an indented line after a blank line\nnot indented",
    mended: [
      { line: 6, kind: "joined" },
      { line: 7, kind: "joined" },
      { line: 13, kind: "joined" },
    ],
  });
  // An indented line under no finding is prose.
  const lone = parseSpecAnswer(`## Findings\n  a paraphrase, indented\n- F-1 · Nit · Goals · x\n`);
  expect(lone).toMatchObject({ prose: "a paraphrase, indented", mended: [] });
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5);
  const done = await t.stage(7, {
    "goldfish-style": `${HEAD}- F-1 · Major · Goals · the goal is vague\n  - it names no measure\n- F-2 · Nit · no scope\n  and more\n  and more still\n`,
  });
  expect(done.code).toBe(0);
  expect(done.text).toContain(
    'goldfish-style: line 7 had no scope (recorded as "not given"), lines 6, 8 and 9 joined to the finding above them',
  );
  const texts = (record(t)?.rounds.at(-1)?.findings ?? []).map((f) => f.text);
  expect(texts).toEqual([
    "the goal is vague it names no measure",
    "no scope and more and more still",
  ]);
  // One joined line reads in the singular.
  const t2 = await item();
  await t2.run("spec-review", t2.id, "check");
  await t2.stage(5);
  const single = await t2.stage(7, {
    "goldfish-style": `${HEAD}- F-1 · Major · Goals · vague\n  - no measure\n`,
  });
  expect(single.text).toContain("goldfish-style: line 6 joined to the finding above it");
});

test("2026-11-12-001 AC-13: a finding line that is indented, starred or without its bullet refuses the answer and is never joined nor left as prose", async () => {
  const cases: [string, number][] = [
    // A Blocker indented under a Nit: joined, its severity would be lost.
    [`${HEAD}- F-1 · Nit · Goals · fine\n  - F-2 · Blocker · Goals · the goal is false\n`, 6],
    [`${HEAD}* F-1 · Blocker · Goals · the goal is false\n`, 5],
    // An indented first finding, under nothing.
    [`${HEAD}  - F-1 · Blocker · Goals · the goal is false\n`, 5],
    [`${HEAD}F-1 · Nit · Goals · no bullet\n`, 5],
    [`${HEAD}- F-1 · Nit · Goals · fine\n\tF-2 above is worse\n`, 6],
    // More than one space after the bullet: at the first column, starred, and indented under a finding.
    [`${HEAD}-  F-1 · Blocker · Goals · the goal is false\n`, 5],
    [`${HEAD}*  F-1 · Blocker · Goals · the goal is false\n`, 5],
    [`${HEAD}- F-1 · Nit · Goals · fine\n  -  F-2 · Blocker · Goals · the goal is false\n`, 6],
  ];
  for (const [answer, line] of cases) {
    const read = parseSpecAnswer(answer);
    expect(read, answer).toMatchObject({ refused: "off-shape" });
    expect("lines" in read ? read.lines.map((l) => l.line) : [], answer).toEqual([line]);
  }
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5);
  const before = JSON.stringify(record(t));
  const refused = await t.stage(7, { "goldfish-style": cases[0]?.[0] ?? "" });
  expect(refused.code).toBe(1);
  expect(refused.text).toContain('line 6 "- F-2 · Blocker · Goals · the goal is false"');
  expect(JSON.stringify(record(t))).toBe(before);
});

test("2026-11-12-001 AC-14: settled is refused when either finding was recorded with no scope, and nothing is recorded", async () => {
  const noScope = "## Findings\n- F-1 · Blocker · the goal is false\n";
  const settle = (t: Awaited<ReturnType<typeof item>>, id: string, earlier: string) =>
    t.run("spec-review", t.id, "resolve", id, "settled", "--reason", "x", "--earlier", earlier);
  /** Round 1 with two contested findings (one with no scope, one on Goals) and one fixed, then round 2 open. */
  const twoRounds = async () => {
    const t = await item();
    await t.run("spec-review", t.id, "check");
    await t.stage(5, { "goldfish-zoom-out": noScope });
    const bare = findingId(t);
    await t.run(
      "spec-review",
      t.id,
      "resolve",
      bare,
      "contest",
      "--reason",
      "x",
      "--evidence",
      "src/known.ts:known",
    );
    await t.stage(7, { "goldfish-design": blocker("Goals") });
    const scoped = findingId(t);
    await t.run(
      "spec-review",
      t.id,
      "resolve",
      scoped,
      "contest",
      "--reason",
      "x",
      "--evidence",
      "src/known.ts:known",
    );
    // A Blocker fixed keeps round 1 from being clean, so round 2 runs (2026-11-08-001).
    await t.stage(9, { "goldfish-readiness": blocker("Risks") });
    await t.run("spec-review", t.id, "resolve", findingId(t), "propose-fix", "--reason", "x");
    await t.run("spec-review", t.id, "close");
    expect((await t.run("spec-review", t.id, "check")).code).toBe(0);
    return { t, bare, scoped };
  };
  const WORDS =
    "was recorded with no scope: a finding with no scope cannot be settled against another by scope";
  // Both with no scope: the placeholder never equals itself.
  const a = await twoRounds();
  await a.t.stage(5, { "goldfish-zoom-out": noScope });
  const laterBare = findingId(a.t);
  const before = JSON.stringify(record(a.t));
  const both = await settle(a.t, laterBare, a.bare);
  expect(both.code).toBe(1);
  expect(both.text).toContain(`${laterBare} ${WORDS}`);
  // The later one alone.
  const laterOnly = await settle(a.t, laterBare, a.scoped);
  expect(laterOnly.code).toBe(1);
  expect(laterOnly.text).toContain(`${laterBare} ${WORDS}`);
  expect(JSON.stringify(record(a.t))).toBe(before);
  // The earlier one alone, and a reviewer that wrote the placeholder as its scope.
  const b = await twoRounds();
  await b.t.stage(5, { "goldfish-zoom-out": blocker("not given") });
  const written = findingId(b.t);
  expect((await settle(b.t, written, b.bare)).text).toContain(WORDS);
  await b.t.stage(7, { "goldfish-design": blocker("Goals") });
  const laterScoped = findingId(b.t);
  const earlierOnly = await settle(b.t, laterScoped, b.bare);
  expect(earlierOnly.code).toBe(1);
  expect(earlierOnly.text).toContain(`${b.bare} ${WORDS}`);
  // Two findings of one written scope still settle.
  expect((await settle(b.t, laterScoped, b.scoped)).code).toBe(0);
});

test("2026-11-12-002 AC-6: a line whose first word under any leading marks is F-<n> is a finding line and refuses the answer off the two recorded shapes; another first word stays prose; a joined line keeps its text", async () => {
  const REST = " · Blocker · Goals · the goal is false";
  const shapes = [
    `- **F-2**${REST}`,
    `**F-2**${REST}`,
    `- __F-2__${REST}`,
    `- *F-2*${REST}`,
    `- _F-2_${REST}`,
    `- \`F-2\`${REST}`,
    `- ~~F-2~~${REST}`,
    `+ F-2${REST}`,
    `• F-2${REST}`,
    `– F-2${REST}`,
    `-F-2${REST}`,
    `1. F-2${REST}`,
    `1) F-2${REST}`,
    `- [F-2]${REST}`,
    `- [ ] F-2${REST}`,
    `- [x] F-2${REST}`,
    `- [X] F-2${REST}`,
    `> - F-2${REST}`,
    `### F-2${REST}`,
    "| F-2 | Blocker | Goals | the goal is false |",
    `- f-2${REST}`,
  ];
  for (const shape of shapes) {
    // At the first column, and indented under a Nit, where it would be joined and its severity hidden.
    const first = parseSpecAnswer(`${HEAD}${shape}\n`);
    expect(first, shape).toEqual({ refused: "off-shape", lines: [{ line: 5, text: shape }] });
    const under = parseSpecAnswer(`${HEAD}- F-1 · Nit · Goals · fine\n  ${shape}\n`);
    expect(under, `indented: ${shape}`).toEqual({
      refused: "off-shape",
      lines: [{ line: 6, text: shape }],
    });
  }
  // Another first word: prose at the first column, as before.
  const prose = [
    "**Note** the goal is vague",
    "- É F-2 que falha",
    "- 3 of them, see F-2",
    "- F-2nd draft",
    "- [x] done, see F-2",
  ];
  for (const line of prose)
    expect(parseSpecAnswer(`${HEAD}- F-1 · Nit · Goals · fine\n${line}\n`), line).toEqual({
      findings: [{ severity: "Nit", scope: "Goals", text: "fine" }],
      prose: line,
      mended: [],
    });
  // An indented line that is no finding line joins with its text as before: only a "- " or "* " bullet goes.
  expect(
    parseSpecAnswer(
      `${HEAD}- F-1 · Major · Goals · vague\n  + no measure\n  **why** it matters\n  - and no date\n`,
    ),
  ).toMatchObject({
    findings: [
      {
        severity: "Major",
        scope: "Goals",
        text: "vague + no measure **why** it matters and no date",
      },
    ],
  });
  // Through the command: refused in its words, nothing recorded.
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5);
  const before = JSON.stringify(record(t));
  const refused = await t.stage(7, {
    "goldfish-style": `${HEAD}- F-1 · Nit · Goals · fine\n- **F-2**${REST}\n`,
  });
  expect(refused.code).toBe(1);
  expect(refused.text).toContain("goldfish-style's answer has 1 finding line off the shape");
  expect(refused.text).toContain(`line 6 "- **F-2**${REST}"`);
  expect(JSON.stringify(record(t))).toBe(before);
});

test("2026-11-12-002 AC-6 (cost): in Node, where the command runs, a long line of spaces with no label is read in time that grows with its length, not with its square", () => {
  // Measured before the fix, in Node: two quantifiers over the same spaces took 220 ms at 16 000
  // characters and four times that at each doubling, so a line of 200 000 takes over half a minute.
  // One quantifier reads it in under a millisecond. Bun's own engine stops such a search after
  // about 0.4 s whatever the length, so the cost is measured where the engine's users meet it: the
  // expression's source runs in a Node process that is killed at five seconds.
  const script = `const re = new RegExp(${JSON.stringify(FINDING_LINE.source)}, ${JSON.stringify(FINDING_LINE.flags)});
const line = " ".repeat(200000) + "no label here";
const started = performance.now();
const found = re.test(line);
console.log(JSON.stringify({ found, ms: Math.round(performance.now() - started) }));`;
  const run = spawnSync("node", ["-e", script], { encoding: "utf8", timeout: 5000 });
  expect(run.error, `killed at five seconds: ${run.signal ?? ""}`).toBeUndefined();
  expect(run.status).toBe(0);
  const out = JSON.parse(run.stdout) as { found: boolean; ms: number };
  expect(out.found).toBe(false);
  expect(out.ms).toBeLessThan(1000);
  // The same line through the parser: it is indented under a finding and no finding line, so it joins.
  const long = `${" ".repeat(200_000)}no label here`;
  expect(parseSpecAnswer(`${HEAD}- F-1 · Nit · Goals · fine\n${long}\n`)).toEqual({
    findings: [{ severity: "Nit", scope: "Goals", text: "fine no label here" }],
    prose: "",
    mended: [{ line: 6, kind: "joined" }],
  });
});
