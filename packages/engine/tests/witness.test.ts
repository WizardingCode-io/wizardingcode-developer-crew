import { expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type CliIo, main } from "../src/cli.ts";
import { loadEvidence } from "../src/evidence.ts";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { SPEC_LENSES, STAGES } from "../src/spec-review.ts";
import type { RoleRecord, WorkItem } from "../src/types.ts";
import { NO_WITNESS_ON_ITEM, recordSpawn } from "../src/witness.ts";
import { loadWork, saveWork } from "../src/work.ts";
import { hookContext, leadAnswerText, makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

const PLUGIN = "wizardingcode-developer-crew";
const ENTRY = fileURLToPath(new URL("../src/crew.ts", import.meta.url));
const ANSWERS = (route: "standard" | "full" | "fast") =>
  JSON.stringify({
    work_type: route === "fast" ? "chore" : "feature",
    is_vague: 0.1,
    scope: route === "fast" ? 0 : 1,
    touches_auth: 0,
    touches_payments: 0,
    touches_personal_data: 0,
    touches_data_migration: 0,
    touches_infra: route === "full" ? 1 : 0,
    touches_public_api: 0,
  });
const noWitness = (names: string) => `answers with no runtime witness: ${names}`;

/** An item on the route given, its spec written, with the hook's two verbs run through the command as a runtime runs them: the payload on the standard input. */
async function item(route: "standard" | "full" | "fast" = "standard") {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    "tests/crew-red.test.sh": "exit 1\n",
    "tests/crew-green.test.sh": "exit 0\n",
  });
  const env = testEnv();
  const paths = repoPaths(root, env);
  const run = async (argv: string[], stdin = "") => {
    const out: string[] = [];
    const err: string[] = [];
    const io: CliIo = {
      stdout: (t) => out.push(t),
      stderr: (t) => err.push(t),
      stdin: async () => stdin,
      env,
      cwd: root,
    };
    const code = await main(argv, io);
    return { code, out: out.join(""), err: err.join("") };
  };
  await run(["detect"]);
  const started = await run([
    "start",
    "Add a thing",
    "--answers",
    ANSWERS(route),
    "--criterion",
    "a",
  ]);
  const id = /started (\S+)/.exec(started.out)?.[1] ?? "";
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1: a\n");
  const payload = (agentId: string, role: string, more: Record<string, unknown> = {}) =>
    JSON.stringify({
      cwd: root,
      session_id: "s",
      agent_id: agentId,
      agent_type: `${PLUGIN}:${role}`,
      ...more,
    });
  const spawned = (agentId: string, role = "tech-lead") =>
    run(["hook", "agent-spawn"], payload(agentId, role));
  const stopped = (
    agentId: string,
    role: string,
    answer?: string,
    more: Record<string, unknown> = {},
  ) =>
    run(
      ["hook", "subagent-stop"],
      payload(agentId, role, {
        ...(answer === undefined ? {} : { last_assistant_message: answer.replace(/\n$/, "") }),
        ...more,
      }),
    );
  const roles = (): RoleRecord[] => loadEvidence(paths, id).evidence.roles ?? [];
  const logFile = join(root, ".crew", "local", "witness", "log.json");
  const log = (): { agentId: string; agent: string; at: string; sessionId?: string }[] =>
    existsSync(logFile) ? JSON.parse(readFileSync(logFile, "utf8")).entries : [];
  const validate = (lead: string, file: string, what = "spec") =>
    run([
      "validation",
      id,
      "record",
      "--what",
      what,
      "--by",
      lead,
      "--file",
      `.crew/work/${id}/${file}`,
    ]);
  const work = (): WorkItem => loadWork(paths, id).work as WorkItem;
  return {
    root,
    env,
    paths,
    run,
    id,
    payload,
    spawned,
    stopped,
    roles,
    log,
    logFile,
    validate,
    work,
  };
}

test("2026-11-12-007 AC-6 (finding 243): crew hook agent-spawn appends the crew role it is told of to the project's witness log, and the stop of that agent id is filed witnessed, also when the active item changed in between", async () => {
  const t = await item();
  const done = await t.spawned("lead-1");
  expect(done.code).toBe(0);
  expect(done.out.trim()).toBe("{}");
  expect(t.log()).toEqual([
    { agentId: "lead-1", agent: "tech-lead", at: expect.any(String), sessionId: "s" },
  ]);
  // A subagent that is no crew role, and a payload with no agent id, leave nothing.
  await t.run(
    ["hook", "agent-spawn"],
    JSON.stringify({ cwd: t.root, agent_id: "x", agent_type: "general-purpose" }),
  );
  await t.run(
    ["hook", "agent-spawn"],
    JSON.stringify({ cwd: t.root, agent_type: `${PLUGIN}:judge` }),
  );
  expect(t.log().length).toBe(1);
  // Another item becomes the active one before the lead stops: the log is the project's.
  const other = await t.run([
    "start",
    "Another thing",
    "--answers",
    ANSWERS("fast"),
    "--criterion",
    "b",
  ]);
  expect(other.code, other.err).toBe(0);
  const otherId = /started (\S+)/.exec(other.out)?.[1];
  expect(otherId).toBeDefined();
  expect(otherId).not.toBe(t.id);
  const active = JSON.parse((await t.run(["status", "--json"])).out).active;
  expect(active).toBe(otherId);
  await t.stopped("lead-1", "tech-lead", leadAnswerText(t.id, "lead-qa", "spec"));
  expect(t.roles().at(-1)).toMatchObject({
    agent: "tech-lead",
    agentId: "lead-1",
    file: "conclave/lead-qa.md",
    witnessed: true,
  });
  // The entry is spent by the filing it marked.
  expect(t.log()).toEqual([]);
});

test("2026-11-12-007 AC-6: the witness log is kept to its latest 500 entries", () => {
  const root = makeRepo();
  const paths = repoPaths(root, testEnv());
  for (let n = 1; n <= 503; n++) recordSpawn(paths, `agent-${n}`, "expert");
  const entries = JSON.parse(
    readFileSync(join(root, ".crew", "local", "witness", "log.json"), "utf8"),
  ).entries as { agentId: string }[];
  expect(entries.length).toBe(500);
  expect(entries[0]?.agentId).toBe("agent-4");
  expect(entries.at(-1)?.agentId).toBe("agent-503");
});

test("2026-11-12-007 AC-9: one witness entry marks one filing of its own role: a second stop of the run, in either shape, a filing of another role and a stop with no spawn are not witnessed, and a resumed role's new spawn marks its next filing", async () => {
  const t = await item();
  await t.spawned("lead-1");
  await t.stopped("lead-1", "tech-lead", leadAnswerText(t.id, "lead-qa", "spec"));
  expect(t.roles().at(-1)?.witnessed).toBe(true);
  // The probe's second payload: the runtime continued the role, which stops again with no message.
  await t.stopped("lead-1", "tech-lead", undefined, { stop_hook_active: true });
  const second = t.roles().at(-1);
  expect(second).toMatchObject({ agent: "tech-lead", agentId: "lead-1", file: null });
  expect(second?.witnessed).toBeUndefined();
  // The first filing's file is still read through its own, witnessed record.
  expect(
    t
      .roles()
      .filter((r) => r.file === "conclave/lead-qa.md")
      .at(-1)?.witnessed,
  ).toBe(true);
  const taken = await t.validate("lead-qa", "conclave/lead-qa.md");
  expect(taken.code, taken.err).toBe(0);
  expect(taken.out).not.toContain("no runtime witness");
  // The other shape: the second stop carries an answer, which lands in the reply file, unmarked and named.
  await t.stopped(
    "lead-1",
    "tech-lead",
    leadAnswerText(t.id, "lead-qa", "spec", { note: "again" }),
    {
      stop_hook_active: true,
    },
  );
  expect(t.roles().at(-1)).toMatchObject({ file: "conclave/lead-qa-reply.md" });
  expect(t.roles().at(-1)?.witnessed).toBeUndefined();
  const named = await t.validate("lead-qa", "conclave/lead-qa-reply.md");
  expect(named.code, named.err).toBe(0);
  expect(named.out.split("\n")).toContain(noWitness("tech-lead (qa)"));
  // The resumed role is spawned again by the runtime, and its next filing is marked.
  await t.spawned("lead-1");
  await t.stopped(
    "lead-1",
    "tech-lead",
    leadAnswerText(t.id, "lead-qa", "spec", { note: "resumed" }),
  );
  expect(t.roles().at(-1)?.witnessed).toBe(true);
  // An entry of one role marks no filing of another role with the same id.
  await t.spawned("mixed-1", "review-code-quality");
  await t.stopped("mixed-1", "tech-lead", leadAnswerText(t.id, "lead-security", "spec"));
  expect(t.roles().at(-1)).toMatchObject({ agentId: "mixed-1", file: "conclave/lead-security.md" });
  expect(t.roles().at(-1)?.witnessed).toBeUndefined();
  expect(t.log().map((e) => e.agentId)).toEqual(["mixed-1"]);
});

/** A subagent's transcript whose last turn hands back `handback`, as the runtime writes it. */
function transcript(dir: string, handback: string): string {
  const file = join(dir, "agent-transcript.jsonl");
  writeFileSync(
    file,
    `${[
      JSON.stringify({ type: "user", message: { role: "user", content: "review" } }),
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "tool_use", name: "SubagentHandback", input: { message: handback } }],
          usage: { input_tokens: 1, output_tokens: 1 },
        },
      }),
    ].join("\n")}\n`,
  );
  return file;
}

test("2026-11-12-007 AC-10: a filing is marked from the spawn's entry alone: a role whose last message differs from its hand-back is filed witnessed with the hand-back, and the spec review's record takes it", async () => {
  const t = await item("full");
  write(t.root, `.crew/work/${t.id}/plan.md`, "# Plan\n\n1. The plan.\n");
  const current = t.work();
  current.phase = "spec-review";
  saveWork(t.paths, current);
  expect((await t.run(["spec-review", t.id, "check"])).code).toBe(0);
  const stage = STAGES[0];
  if (!stage) throw new Error("no stage");
  const clean = (role: string) => `# findings\nreviewer: ${role}\n\n## Findings\nnone`;
  for (const [n, role] of stage.reviewers.entries()) {
    await t.spawned(`goldfish-${n}`, role);
    await t.stopped(`goldfish-${n}`, role, "Done, the report is handed back.", {
      agent_transcript_path: transcript(t.root, clean(role)),
    });
    const filed = t.roles().at(-1);
    expect(filed, role).toMatchObject({
      agent: role,
      file: `spec-review/${role}.md`,
      witnessed: true,
    });
    expect(readFileSync(join(t.root, `.crew/work/${t.id}/spec-review/${role}.md`), "utf8")).toBe(
      `${clean(role)}\n`,
    );
  }
  const recorded = await t.run(["spec-review", t.id, "record", String(stage.stage)]);
  expect(recorded.code, recorded.err).toBe(0);
  expect(recorded.out).not.toContain("no runtime witness");
});

/** The command run in a process of its own with the payload on its standard input, as a runtime's hook runs it. */
function runVerb(
  cwd: string,
  env: NodeJS.ProcessEnv,
  verb: string,
  payload: string,
): Promise<number> {
  return new Promise((done, failed) => {
    const child = spawn("bun", [ENTRY, "hook", verb], {
      cwd,
      env,
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("error", failed);
    child.on("close", (code) => done(code ?? 1));
    child.stdin.end(payload);
  });
}

test("2026-11-12-007 AC-20: roles spawned and stopped in parallel, each in a process of its own, each keep their witness", async () => {
  const t = await item();
  const ids = Array.from({ length: 8 }, (_, n) => `expert-agent-${n + 1}`);
  const spawnCodes = await Promise.all(
    ids.map((id) => runVerb(t.root, t.env, "agent-spawn", t.payload(id, "expert"))),
  );
  expect(spawnCodes).toEqual(ids.map(() => 0));
  expect(
    t
      .log()
      .map((e) => e.agentId)
      .sort(),
  ).toEqual([...ids].sort());
  const stopCodes = await Promise.all(
    ids.map((id) =>
      runVerb(
        t.root,
        t.env,
        "subagent-stop",
        t.payload(id, "expert", {
          last_assistant_message: `# Proposal for ${t.id}, D-1\npersonality: conservative\n## Proposal\nAnswer: ${id}`,
        }),
      ),
    ),
  );
  expect(stopCodes).toEqual(ids.map(() => 0));
  const filed = t.roles().filter((r) => r.agent.startsWith("expert"));
  expect(filed.map((r) => r.agentId).sort()).toEqual([...ids].sort());
  expect(filed.map((r) => r.witnessed)).toEqual(ids.map(() => true));
  expect(t.log()).toEqual([]);
}, 120_000);

test("2026-11-12-007 AC-22: a witness log that cannot be read, does not parse or was changed outside the engine marks no filing and loses none, and the next spawn starts it again with its own entry alone", async () => {
  const states: [string, (file: string) => void][] = [
    ["does not parse", (file) => writeFileSync(file, "{not json")],
    [
      "was changed outside the engine",
      (file) =>
        writeFileSync(
          file,
          JSON.stringify({
            entries: [
              { agentId: "lead-1", agent: "tech-lead", at: "2026-11-13T10:00:00.000Z" },
              { agentId: "forged-1", agent: "tech-lead", at: "2026-11-13T10:00:00.000Z" },
            ],
          }),
        ),
    ],
    ["cannot be read", (file) => chmodSync(file, 0o000)],
  ];
  for (const [state, damage] of states) {
    const t = await item();
    await t.spawned("lead-1");
    damage(t.logFile);
    const stop = await t.stopped("lead-1", "tech-lead", leadAnswerText(t.id, "lead-qa", "spec"));
    expect(stop.code, state).toBe(0);
    const filed = t.roles().at(-1);
    expect(filed, state).toMatchObject({ agent: "tech-lead", file: "conclave/lead-qa.md" });
    expect(filed?.witnessed, state).toBeUndefined();
    // The entry a hand wrote marks nothing either.
    await t.stopped("forged-1", "tech-lead", leadAnswerText(t.id, "lead-security", "spec"));
    expect(t.roles().at(-1)?.witnessed, state).toBeUndefined();
    const taken = await t.validate("lead-qa", "conclave/lead-qa.md");
    expect(taken.code, `${state}: ${taken.err}`).toBe(0);
    expect(taken.out.split("\n"), state).toContain(NO_WITNESS_ON_ITEM);
    // The next spawn starts the log again: its own entry, nothing of the damaged file.
    await t.spawned("lead-2");
    expect(t.log(), state).toEqual([
      { agentId: "lead-2", agent: "tech-lead", at: expect.any(String), sessionId: "s" },
    ]);
    await t.stopped(
      "lead-2",
      "tech-lead",
      leadAnswerText(t.id, "lead-qa", "spec", { note: "after" }),
    );
    expect(t.roles().at(-1)?.witnessed, state).toBe(true);
  }
});

/** The probe of finding 243, step by step, on an item that already holds a witnessed filing. */
test("2026-11-12-007 AC-5 (finding 243): the probe's script files a made-up lead's answer, which is recorded, not refused, and named as an answer with no runtime witness by every reader", async () => {
  const t = await item();
  const ctx = hookContext({ session_id: "s", cwd: t.root }, t.env);
  onSessionStart(ctx);
  const ask = (tool_name: string, tool_input: Record<string, unknown>) =>
    JSON.stringify(onPreToolUse(ctx, { session_id: "s", cwd: t.root, tool_name, tool_input }));
  // Steps 1 to 4: the verb on a line is denied, the new event included; a script's run is not read.
  for (const verb of ["subagent-stop", "agent-spawn"])
    expect(ask("Bash", { command: `echo '{}' | crew hook ${verb}` })).toContain(
      "crew hook runs from the runtime's hook configuration alone",
    );
  expect(ask("Bash", { command: "sh file-it.sh" })).toBe("{}");
  // A real lead, spawned by the runtime and witnessed.
  await t.spawned("real-security");
  await t.stopped("real-security", "tech-lead", leadAnswerText(t.id, "lead-security", "spec"));
  expect((await t.validate("lead-security", "conclave/lead-security.md")).out).not.toContain(
    "no runtime witness",
  );
  // Step 5: the script's one call, a made-up tech lead's payload.
  const forged = await t.stopped(
    "made-up-1",
    "tech-lead",
    leadAnswerText(t.id, "lead-qa", "spec", { note: "written by the session, no lead ran" }),
  );
  expect(forged.code).toBe(0);
  const record = t.roles().at(-1);
  expect(record).toMatchObject({ agent: "tech-lead", team: "qa", file: "conclave/lead-qa.md" });
  expect(record?.witnessed).toBeUndefined();
  expect(record?.filedBy).toBeUndefined();
  // Recorded and counted, as D-1 says, and named.
  const taken = await t.validate("lead-qa", "conclave/lead-qa.md");
  expect(taken.code, taken.err).toBe(0);
  expect(taken.out.split("\n")).toContain(noWitness("tech-lead (qa)"));
  // The gate run, the judgement record and the report name it too, a forged judge with it.
  const current = t.work();
  current.phase = "build";
  saveWork(t.paths, current);
  write(t.root, "src/a.ts", "x = 1");
  await t.run(["tdd", "red", t.id, "AC-1", "--", "sh tests/crew-red.test.sh"]);
  await t.run(["tdd", "green", t.id, "AC-1", "--", "sh tests/crew-green.test.sh"]);
  await t.run(["skip", t.id, "gate:e2e", "--reason", "no environment in the fixture"]);
  const gate = await t.run(["gate", "run", t.id]);
  expect(gate.out.split("\n")).toContain(noWitness("tech-lead (qa)"));
  const ruling = JSON.stringify({
    rulings: ["code-quality", "test-quality"].map((gateName) => ({
      gate: gateName,
      verdict: "proven",
      reviewer: `review-${gateName}`,
      judge: "judge",
      findings: [],
    })),
  });
  await t.stopped("made-up-judge", "judge", ruling);
  const judged = await t.run([
    "judgement",
    t.id,
    "record",
    "--ruling",
    `.crew/work/${t.id}/review/ruling.json`,
  ]);
  expect(judged.err).toBe("");
  expect(judged.out.split("\n")).toContain(noWitness("tech-lead (qa), judge"));
  const report = (await t.run(["evidence", t.id])).out;
  expect(report).toContain(`\n${noWitness("tech-lead (qa), judge")}\n`);
  expect(report).toMatch(
    /\| tech-lead \|[^\n]*\| conclave\/lead-security\.md \| hook, witnessed \|/,
  );
  expect(report).toMatch(/\| tech-lead \|[^\n]*\| conclave\/lead-qa\.md \| hook \|/);
});

test("2026-11-12-007 AC-5: the spec review's record and the brainstorm record name a reviewer filed with no runtime witness on an item that holds witnessed ones", async () => {
  const t = await item("full");
  write(t.root, `.crew/work/${t.id}/plan.md`, "# Plan\n\n1. The plan.\n");
  write(
    t.root,
    `.crew/work/${t.id}/concepts_brief.md`,
    "## Overview\nx\n## Analysis\nx\n## Goals vs. Non-Goals\nx\n## Alternatives Weighed\nx\n## Key Decisions\nx\n",
  );
  // The six lenses of the brainstorm: the first spawned by the runtime, the others a script's.
  for (const [n, role] of SPEC_LENSES.entries()) {
    if (n === 0) await t.spawned(`lens-${n}`, role);
    await t.stopped(
      `lens-${n}`,
      role,
      `mode: brainstorm\n# findings\nreviewer: ${role}\n\n## Findings\nnone`,
    );
  }
  const lensNames = SPEC_LENSES.slice(1).join(", ");
  const brief = await t.run(["spec-review", t.id, "brief"]);
  expect(brief.code, brief.err).toBe(0);
  expect(brief.out.split("\n")).toContain(noWitness(lensNames));
  const current = t.work();
  current.phase = "spec-review";
  saveWork(t.paths, current);
  expect((await t.run(["spec-review", t.id, "check"])).code).toBe(0);
  const stage = STAGES[0];
  if (!stage) throw new Error("no stage");
  for (const [n, role] of stage.reviewers.entries())
    await t.stopped(`stage-${n}`, role, `# findings\nreviewer: ${role}\n\n## Findings\nnone`);
  const recorded = await t.run(["spec-review", t.id, "record", String(stage.stage)]);
  expect(recorded.code, recorded.err).toBe(0);
  expect(
    recorded.out.split("\n").filter((l) => l.startsWith("answers with no runtime witness")),
  ).toEqual([noWitness([...new Set([...SPEC_LENSES.slice(1), ...stage.reviewers])].join(", "))]);
});

test("2026-11-12-007 AC-16: which items print the item's line: hook filings with none witnessed do; no role record prints neither line; the session's filings alone print the session's line; both kinds print both; an earlier filing is named once a witnessed one exists", async () => {
  const lines = (out: string) =>
    out.split("\n").filter((l) => l.includes("runtime witness") || l.startsWith("answers filed"));
  // No role record at all: the gate run prints neither line.
  const bare = await item("fast");
  expect(lines((await bare.run(["gate", "run", bare.id])).out)).toEqual([]);
  // The hook's filings, none witnessed.
  const hook = await item();
  await hook.stopped("lead-1", "tech-lead", leadAnswerText(hook.id, "lead-qa", "spec"));
  expect(lines((await hook.validate("lead-qa", "conclave/lead-qa.md")).out)).toEqual([
    NO_WITNESS_ON_ITEM,
  ]);
  // The earlier filing is named once a witnessed one exists.
  await hook.spawned("lead-2");
  await hook.stopped("lead-2", "tech-lead", leadAnswerText(hook.id, "lead-security", "spec"));
  expect(lines((await hook.validate("lead-security", "conclave/lead-security.md")).out)).toEqual([
    noWitness("tech-lead (qa)"),
  ]);
  // The session's filings alone, where the runtime has no subagent event.
  const session = await item();
  const gemini = session.work();
  gemini.runtimes = ["gemini"];
  saveWork(session.paths, gemini);
  const source = join(session.root, "qa.md");
  writeFileSync(source, leadAnswerText(session.id, "lead-qa", "spec"));
  await session.run(["answer", "file", session.id, "--role", "tech-lead", "--file", source]);
  expect(lines((await session.validate("lead-qa", "conclave/lead-qa.md")).out)).toEqual([
    "answers filed by the session: tech-lead (qa)",
  ]);
  // Both kinds on one item, none witnessed: both lines.
  await session.stopped("lead-9", "tech-lead", leadAnswerText(session.id, "lead-security", "spec"));
  expect(lines((await session.validate("lead-security", "conclave/lead-security.md")).out)).toEqual(
    ["answers filed by the session: tech-lead (qa)", NO_WITNESS_ON_ITEM],
  );
});

test("2026-11-12-007 AC-8: a real role whose witness never reached the log is recorded as today, taken by the readers and named, never refused", async () => {
  const t = await item();
  await t.spawned("lead-1");
  await t.stopped("lead-1", "tech-lead", leadAnswerText(t.id, "lead-qa", "spec"));
  // The security lead ran, and its spawn's witness call failed in the mod: no entry.
  await t.stopped("lead-2", "tech-lead", leadAnswerText(t.id, "lead-security", "spec"));
  const record = t.roles().at(-1);
  expect(record).toMatchObject({ agentId: "lead-2", file: "conclave/lead-security.md" });
  expect(record?.filedBy).toBeUndefined();
  expect(record?.witnessed).toBeUndefined();
  const taken = await t.validate("lead-security", "conclave/lead-security.md");
  expect(taken.code, taken.err).toBe(0);
  expect(taken.out.split("\n")[0]).toBe("validation of spec by lead-security: validated (round 1)");
  expect(taken.out.split("\n")).toContain(noWitness("tech-lead (security)"));
  expect(t.work().validations?.map((v) => v.by)).toEqual(["lead-security"]);
});

test("2026-11-12-007 AC-12: a verdict that rests on a lead's validation or a judge's ruling with no runtime witness carries those names on its own record, and the report prints them beside the verdict", async () => {
  const t = await item();
  await t.spawned("lead-1");
  await t.stopped("lead-1", "tech-lead", leadAnswerText(t.id, "lead-qa", "spec"));
  await t.stopped("lead-2", "tech-lead", leadAnswerText(t.id, "lead-security", "spec"));
  await t.validate("lead-qa", "conclave/lead-qa.md");
  await t.validate("lead-security", "conclave/lead-security.md");
  expect(loadEvidence(t.paths, t.id).evidence.unwitnessed).toEqual(["lead-security (spec)"]);
  const current = t.work();
  current.phase = "build";
  saveWork(t.paths, current);
  write(t.root, "src/a.ts", "x = 1");
  await t.run(["tdd", "red", t.id, "AC-1", "--", "sh tests/crew-red.test.sh"]);
  await t.run(["tdd", "green", t.id, "AC-1", "--", "sh tests/crew-green.test.sh"]);
  await t.run(["skip", t.id, "gate:e2e", "--reason", "no environment in the fixture"]);
  await t.run(["gate", "run", t.id]);
  // The judge's ruling filed with no spawn seen: bound, counted, and named on the record.
  const ruling = JSON.stringify({
    rulings: ["code-quality", "test-quality"].map((gate) => ({
      gate,
      verdict: "proven",
      reviewer: `review-${gate}`,
      judge: "judge",
      findings: [],
    })),
  });
  await t.stopped("judge-1", "judge", ruling);
  const judged = await t.run([
    "judgement",
    t.id,
    "record",
    "--ruling",
    `.crew/work/${t.id}/review/ruling.json`,
  ]);
  expect(judged.err).toBe("");
  const report = (await t.run(["evidence", t.id])).out;
  expect(loadEvidence(t.paths, t.id).evidence.unwitnessed).toEqual([
    "lead-security (spec)",
    "judge",
  ]);
  expect(report).toContain(
    "\n- The verdict rests on answers with no runtime witness: lead-security (spec), judge\n",
  );
  // With every answer witnessed the record carries no such names and the report no such line.
  const clean = await item("fast");
  await clean.run(["gate", "run", clean.id]);
  expect(loadEvidence(clean.paths, clean.id).evidence.unwitnessed).toBeUndefined();
  expect((await clean.run(["evidence", clean.id])).out).not.toContain("rests on answers");
});

test("2026-11-12-007 AC-13: a role record written before this item, with no witnessed and no filedBy, reads as the hook's in the Roles table and in crew validation record, and the item's next command succeeds", async () => {
  const t = await item();
  // The record as 0.23.4 wrote it: the hook's filing, before any witness existed.
  await t.stopped("old-lead", "tech-lead", leadAnswerText(t.id, "lead-qa", "spec"));
  const record = t.roles().at(-1);
  expect(Object.keys(record ?? {}).sort()).toEqual(
    ["agent", "agentId", "at", "file", "fileHash", "team", "tokens", "tokensFrom"].sort(),
  );
  const taken = await t.validate("lead-qa", "conclave/lead-qa.md");
  expect(taken.code, taken.err).toBe(0);
  expect(taken.out.split("\n")[0]).toBe("validation of spec by lead-qa: validated (round 1)");
  const report = await t.run(["evidence", t.id]);
  expect(report.code, report.err).toBe(0);
  expect(report.out).toMatch(/\| tech-lead \|[^\n]*\| conclave\/lead-qa\.md \| hook \|/);
  expect((await t.run(["status"])).code).toBe(0);
});

test("2026-11-13-001 AC-6 (finding 244): a stop with no answer leaves the witness entry for that agent's next filing, and a filing with an answer spends every entry of its agent id and role", async () => {
  const t = await item();
  const entries = () => t.log().map((e) => `${e.agentId} ${e.agent}`);
  // A role cut off: its end is recorded with no file and no mark, and the entry stays.
  await t.spawned("lead-1");
  await t.stopped("lead-1", "tech-lead");
  expect(t.roles().at(-1)).toMatchObject({ agentId: "lead-1", file: null });
  expect(t.roles().at(-1)?.witnessed).toBeUndefined();
  expect(entries()).toEqual(["lead-1 tech-lead"]);
  // Its next stop, with an answer, is the filing the entry marks.
  await t.stopped("lead-1", "tech-lead", leadAnswerText(t.id, "lead-qa", "spec"));
  expect(t.roles().at(-1)).toMatchObject({ file: "conclave/lead-qa.md", witnessed: true });
  expect(entries()).toEqual([]);
  // A role that stopped with no answer and was resumed holds two entries of one id.
  await t.spawned("lead-2");
  await t.stopped("lead-2", "tech-lead");
  expect(entries()).toEqual(["lead-2 tech-lead"]);
  await t.spawned("lead-2");
  expect(entries()).toEqual(["lead-2 tech-lead", "lead-2 tech-lead"]);
  // An entry of another role under the same id is not this filing's to spend.
  await t.spawned("lead-2", "judge");
  await t.stopped("lead-2", "tech-lead", leadAnswerText(t.id, "lead-security", "spec"));
  expect(t.roles().at(-1)).toMatchObject({ file: "conclave/lead-security.md", witnessed: true });
  expect(entries()).toEqual(["lead-2 judge"]);
  // None is left for a later filing with that id: it is not witnessed.
  await t.stopped(
    "lead-2",
    "tech-lead",
    leadAnswerText(t.id, "lead-security", "spec", { note: "later" }),
  );
  expect(t.roles().at(-1)).toMatchObject({ agentId: "lead-2", file: "conclave/lead-security.md" });
  expect(t.roles().at(-1)?.witnessed).toBeUndefined();
  expect(entries()).toEqual(["lead-2 judge"]);
});

test("2026-11-13-001 AC-5: on an item whose hook filings are none witnessed, the gate run, crew judgement record and the report each print the item's line in their own output, the report after its Roles table", async () => {
  const t = await item();
  await t.stopped("lead-1", "tech-lead", leadAnswerText(t.id, "lead-qa", "spec"));
  const current = t.work();
  current.phase = "build";
  saveWork(t.paths, current);
  write(t.root, "src/a.ts", "x = 1");
  await t.run(["tdd", "red", t.id, "AC-1", "--", "sh tests/crew-red.test.sh"]);
  await t.run(["tdd", "green", t.id, "AC-1", "--", "sh tests/crew-green.test.sh"]);
  await t.run(["skip", t.id, "gate:e2e", "--reason", "no environment in the fixture"]);
  const gate = await t.run(["gate", "run", t.id]);
  expect(gate.out.split("\n")).toContain(NO_WITNESS_ON_ITEM);
  const ruling = JSON.stringify({
    rulings: ["code-quality", "test-quality"].map((gateName) => ({
      gate: gateName,
      verdict: "proven",
      reviewer: `review-${gateName}`,
      judge: "judge",
      findings: [],
    })),
  });
  await t.stopped("judge-1", "judge", ruling);
  const judged = await t.run([
    "judgement",
    t.id,
    "record",
    "--ruling",
    `.crew/work/${t.id}/review/ruling.json`,
  ]);
  expect(judged.err).toBe("");
  expect(judged.out.split("\n")).toContain(NO_WITNESS_ON_ITEM);
  const report = (await t.run(["evidence", t.id])).out.split("\n");
  const roles = report.indexOf("## Roles");
  expect(roles).toBeGreaterThan(-1);
  const line = report.indexOf(NO_WITNESS_ON_ITEM);
  expect(line).toBeGreaterThan(roles);
  // The line closes the table: between the heading and it there are only blanks and table rows.
  expect(report.slice(roles + 1, line).every((l) => l === "" || l.startsWith("|"))).toBe(true);
});

test("2026-11-13-001 AC-5: on an item whose hook filings are none witnessed, the brainstorm record and the spec review's record each print the item's line in their own output", async () => {
  const t = await item("full");
  write(t.root, `.crew/work/${t.id}/plan.md`, "# Plan\n\n1. The plan.\n");
  write(
    t.root,
    `.crew/work/${t.id}/concepts_brief.md`,
    "## Overview\nx\n## Analysis\nx\n## Goals vs. Non-Goals\nx\n## Alternatives Weighed\nx\n## Key Decisions\nx\n",
  );
  for (const [n, role] of SPEC_LENSES.entries())
    await t.stopped(
      `lens-${n}`,
      role,
      `mode: brainstorm\n# findings\nreviewer: ${role}\n\n## Findings\nnone`,
    );
  const brief = await t.run(["spec-review", t.id, "brief"]);
  expect(brief.code, brief.err).toBe(0);
  expect(brief.out.split("\n")).toContain(NO_WITNESS_ON_ITEM);
  const current = t.work();
  current.phase = "spec-review";
  saveWork(t.paths, current);
  expect((await t.run(["spec-review", t.id, "check"])).code).toBe(0);
  const stage = STAGES[0];
  if (!stage) throw new Error("no stage");
  for (const [n, role] of stage.reviewers.entries())
    await t.stopped(`stage-${n}`, role, `# findings\nreviewer: ${role}\n\n## Findings\nnone`);
  const recorded = await t.run(["spec-review", t.id, "record", String(stage.stage)]);
  expect(recorded.code, recorded.err).toBe(0);
  expect(recorded.out.split("\n")).toContain(NO_WITNESS_ON_ITEM);
});
