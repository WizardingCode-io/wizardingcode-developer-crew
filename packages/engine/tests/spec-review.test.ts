import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import { answerFile } from "../src/hooks/subagent-stop.ts";
import { isProtectedPath } from "../src/paths.ts";
import { briefHash, SPEC_LENSES, STAGES } from "../src/spec-review.ts";
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

test("2026-10-31-005 AC-2: the guard refuses build until the review converged on the current hash, and an edit refuses it again", async () => {
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
  expect((await t.quietRound()).code).toBe(0);
  expect(guard().length).toBeGreaterThan(0);
  const second = await t.quietRound();
  expect(second.text).toContain("converged");
  expect(guard()).toEqual([]);
  writeFileSync(join(t.dir, "plan.md"), "# Plan\n\n1. Another plan.\n");
  expect(guard().join()).toContain("stale");
  // An acceptance holds on the text it was given for, and an edit makes it stale too.
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
  for (const s of [6, 7, 8, 9]) await cap.stage(s);
  await cap.run("spec-review", cap.id, "close");
  expect((await cap.run("spec-review", cap.id, "accept", "--reason", "their words")).code).toBe(0);
  expect(capGuard()).toEqual([]);
  writeFileSync(join(cap.dir, "spec.md"), "# Spec\n\nEdited.\n");
  expect(capGuard().join()).toContain("stale");
});

test("2026-10-31-005 AC-3: the stages record only in order, each with its reviewers, on an unchanged document", async () => {
  expect(STAGES.map((s) => [s.stage, s.reviewers])).toEqual([
    [5, ["goldfish-zoom-out"]],
    [6, ["goldfish-comprehension"]],
    [7, ["goldfish-design", "goldfish-structural", "goldfish-style"]],
    [8, ["goldfish-zoom-out"]],
    [9, ["goldfish-readiness", "goldfish-codebase", "goldfish-style"]],
  ]);
  const t = await item();
  expect((await t.run("spec-review", t.id, "check")).text).toContain("stage 5");
  const early = await t.stage(7);
  expect(early.code).toBe(1);
  expect(early.text).toContain("stage 5");
  expect((await t.stage(5)).code).toBe(0);
  // A stage with a reviewer's answer missing.
  const missing = await t.run("spec-review", t.id, "record", "6");
  expect(missing.code).toBe(1);
  expect(missing.text).toContain("goldfish-comprehension");
  writeFileSync(join(t.dir, "spec.md"), "# Spec\n\nChanged.\n");
  const changed = await t.stage(6);
  expect(changed.code).toBe(1);
  expect(changed.text).toContain("changed");
  // An answer with no findings section is no review.
  writeFileSync(join(t.dir, "spec.md"), "# Spec\n\nThe spec.\n");
  t.answer("goldfish-comprehension", "I read it and it looks fine.\n");
  const shapeless = await t.run("spec-review", t.id, "record", "6");
  expect(shapeless.code).toBe(1);
  expect(shapeless.text).toContain("## Findings");
});

test("2026-10-31-005 AC-4: two clean rounds converge; a propose-fix or a not run keeps a round from being clean; a settled finding does not", async () => {
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker() });
  const first = findingId(t);
  await t.run("spec-review", t.id, "resolve", first, "propose-fix", "--reason", "it is false");
  for (const s of [6, 7, 8, 9]) await t.stage(s);
  const closed = await t.run("spec-review", t.id, "close");
  expect(closed.text).toContain("not clean");
  expect(record(t)?.rounds[0]?.clean).toBe(false);
  // A reviewer that did not run keeps its round from being clean.
  await t.run("spec-review", t.id, "check");
  const notRun = await t.run(
    "spec-review",
    t.id,
    "record",
    "5",
    "--not-run",
    "goldfish-zoom-out",
    "--reason",
    "it timed out twice",
  );
  expect(notRun.code).toBe(0);
  for (const s of [6, 7, 8, 9]) await t.stage(s);
  expect((await t.run("spec-review", t.id, "close")).text).toContain("not clean");
  // A contested finding settles, and a later round may settle against it.
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker("Risks") });
  await t.run(
    "spec-review",
    t.id,
    "resolve",
    findingId(t),
    "contest",
    "--reason",
    "the code shows it",
    "--evidence",
    "src/known.ts:known",
  );
  const contested = findingId(t);
  for (const s of [6, 7, 8, 9]) await t.stage(s);
  expect((await t.run("spec-review", t.id, "close")).text).not.toContain("not clean");
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker("Risks") });
  const settled = await t.run(
    "spec-review",
    t.id,
    "resolve",
    findingId(t),
    "settled",
    "--reason",
    "raised before",
    "--earlier",
    contested,
  );
  expect(settled.code).toBe(0);
  for (const s of [6, 7, 8, 9]) await t.stage(s);
  expect((await t.run("spec-review", t.id, "close")).text).toContain("converged");
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
  await t.stage(6, {
    "goldfish-comprehension": "## Findings\n- F-1 · Nit · Style · a small thing\n",
  });
  const nit = findingId(t);
  expect(
    (await t.run("spec-review", t.id, "resolve", nit, "decline", "--reason", "small")).code,
  ).toBe(0);
  await t.stage(7);
  await t.stage(8);
  await t.stage(9);
  expect((await t.run("spec-review", t.id, "close")).code).toBe(0);
  await t.run("spec-review", t.id, "check");
  await t.stage(5);
  // A comprehension gap is never contested.
  await t.stage(6, { "goldfish-comprehension": blocker("Overview", "no paraphrase possible") });
  const gap = await t.run(
    "spec-review",
    t.id,
    "resolve",
    findingId(t),
    "contest",
    "--reason",
    "clear to me",
    "--evidence",
    "src/known.ts:known",
  );
  expect(gap.code).toBe(1);
  expect(gap.text).toContain("comprehension");
});

test("2026-10-31-005 AC-6: at the cap, or after a churn mark, another round is refused until accept", async () => {
  const t = await item();
  // Five rounds that never converge: each has a reviewer not run.
  for (let i = 0; i < 5; i += 1) {
    await t.run("spec-review", t.id, "check");
    await t.run(
      "spec-review",
      t.id,
      "record",
      "5",
      "--not-run",
      "goldfish-zoom-out",
      "--reason",
      "x",
    );
    for (const s of [6, 7, 8, 9]) await t.stage(s);
    await t.run("spec-review", t.id, "close");
  }
  const sixth = await t.run("spec-review", t.id, "check");
  expect(sixth.code).toBe(1);
  expect(sixth.text).toContain("accept");
  expect((await t.run("spec-review", t.id, "accept", "--reason", "take it as it is")).code).toBe(0);
  expect((await t.run("spec-review", t.id, "check")).code).toBe(0);
  // A churn mark stops the rounds the same way.
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
  for (const s of [6, 7, 8, 9]) await c.stage(s);
  await c.run("spec-review", c.id, "close");
  const after = await c.run("spec-review", c.id, "check");
  expect(after.code).toBe(1);
  expect(after.text).toContain("churn");
  // With nothing stopping the rounds there is nothing to accept.
  const n = await item();
  expect((await n.run("spec-review", n.id, "accept", "--reason", "x")).code).toBe(1);
});

test("2026-10-31-005 AC-7: an answer from an agent id already recorded is refused", async () => {
  const t = await item();
  await t.run("spec-review", t.id, "check");
  t.answer("goldfish-zoom-out", clean("goldfish-zoom-out"), "same-agent");
  expect((await t.run("spec-review", t.id, "record", "5")).code).toBe(0);
  await t.stage(6);
  await t.stage(7);
  t.answer("goldfish-zoom-out", clean("goldfish-zoom-out"), "same-agent");
  const resumed = await t.run("spec-review", t.id, "record", "8");
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
  const paraphrase = `**What this proposes**\nA thing.\n\n${blocker("Overview", "a gap")}`;
  await t.stage(6, { "goldfish-comprehension": `# x\n\n## Findings\n${paraphrase}` });
  expect((await t.run("spec-review", t.id, "report")).code).toBe(0);
  const text = readFileSync(join(t.dir, "spec-review/consolidated.md"), "utf8");
  expect(text).toContain("goldfish-zoom-out");
  expect(text).toContain("the goal is false");
  expect(text).toContain("propose-fix");
  expect(text).toContain("**What this proposes**");
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
  for (const s of [6, 7, 8, 9]) await t.stage(s);
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
  for (const s of [6, 7, 8, 9]) await f.stage(s);
  expect((await f.run("spec-review", f.id, "close")).text).toContain("not clean");
});

test("2026-10-31-005 AC-14: the engine checks contest's evidence and settled's earlier finding; a fixed finding is not one", async () => {
  const t = await item();
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker("Goals") });
  const fixed = findingId(t);
  const contest = (ev: string) =>
    t.run("spec-review", t.id, "resolve", fixed, "contest", "--reason", "x", "--evidence", ev);
  for (const bad of [
    "src/absent.ts:known",
    "src/known.ts:absent",
    "../outside.ts:known",
    "nocolon",
  ])
    expect((await contest(bad)).code, bad).toBe(1);
  await t.run("spec-review", t.id, "resolve", fixed, "propose-fix", "--reason", "x");
  for (const s of [6, 7, 8, 9]) await t.stage(s);
  await t.run("spec-review", t.id, "close");
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker("Goals") });
  const later = findingId(t);
  const settle = (earlier: string) =>
    t.run("spec-review", t.id, "resolve", later, "settled", "--reason", "x", "--earlier", earlier);
  // Fixed, so it re-opens rather than settles; unknown; and this round's own id.
  for (const bad of [fixed, "zoom-out-9.9-9", later]) expect((await settle(bad)).code, bad).toBe(1);
  // Evidence in the item's own document holds.
  const own = await t.run(
    "spec-review",
    t.id,
    "resolve",
    later,
    "contest",
    "--reason",
    "the spec decides it",
    "--evidence",
    "spec.md:The spec",
  );
  expect(own.code).toBe(0);
  // Another scope does not settle against a contested finding.
  for (const s of [6, 7, 8, 9]) await t.stage(s);
  await t.run("spec-review", t.id, "close");
  await t.run("spec-review", t.id, "check");
  await t.stage(5, { "goldfish-zoom-out": blocker("Elsewhere") });
  const other = await t.run(
    "spec-review",
    t.id,
    "resolve",
    findingId(t),
    "settled",
    "--reason",
    "x",
    "--earlier",
    later,
  );
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
