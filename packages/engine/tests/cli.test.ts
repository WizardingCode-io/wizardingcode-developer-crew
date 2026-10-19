import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { envRecordPath } from "../src/environment.ts";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import { writeJson } from "../src/fs.ts";
import { readReviewInputs } from "../src/judgement.ts";
import { mailbox, mailContext, ownInbox, readBox, registerProject, writeBox } from "../src/mail.ts";
import { loadPolicy } from "../src/policy.ts";
import { loadProfile } from "../src/profile.ts";
import { recordWorking } from "../src/state.ts";
import { readProtectedJson, writeProtectedJson } from "../src/store.ts";
import type { GateRun, Message } from "../src/types.ts";
import { loadWork, saveWork } from "../src/work.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

test("SP2b: debate open and close through the command; plan waits while the debate is open; status says so", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const standard = JSON.stringify({ ...JSON.parse(answers), scope: 1 });
  const id = (await c.json("start", "Delete accounts", "--answers", standard)).data.id as string;
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1 x\n");
  for (let i = 0; i < 3; i++) await c.run("phase", id, "next");
  expect((await c.json("status")).data.phase).toBe("conclave");
  write(
    root,
    `.crew/work/${id}/conclave.md`,
    "# Gap round\n\n## Assumed by good practice\nnone\n\n## Decisions only the user can make\nnone\n\n## Proposals\nnone\n\n## Warnings\nnone\n",
  );
  expect((await c.json("status")).data.debate).toBe("none");
  expect((await c.run("debate", id, "open")).code).toBe(1);
  const opened = await c.json("debate", id, "open", "--reason", "erasure or deactivation");
  expect(opened.code).toBe(0);
  expect(opened.data.debate).toMatchObject({ reason: "erasure or deactivation" });
  expect((await c.json("status")).data.debate).toBe("open");
  const refused = await c.run("phase", id, "next");
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("the debate is open (erasure or deactivation)");
  expect((await c.run("debate", id, "close", "--tokens", "lots")).err.trim()).toBe(
    "--tokens is a number",
  );
  const closed = await c.json("debate", id, "close", "--tokens", "5400");
  expect(closed.data.debate).toMatchObject({ reason: "erasure or deactivation", tokens: 5400 });
  expect((await c.json("status")).data.debate).toBe("closed");
  await validateLeads(c, root, id);
  expect((await c.json("phase", id, "next")).data.phase).toBe("plan");
  expect((await c.run("debate", id, "open", "--reason", "again")).err.trim()).toBe(
    "the debate is closed; it opens once per item",
  );
});

test("SP2b: judgement rulings are recorded from a file, judged by the verdict, shown in the report, and go stale with the code", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  expect((await c.run("tdd", "red", id, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", id, "AC-1", "--", "exit 0")).code).toBe(0);
  await c.run("skip", id, "gate:e2e", "--reason", "no environment in the fixture");
  const first = await c.json("gate", "run", id);
  expect(first.code).toBe(1);
  expect(first.data.unproven).toEqual(["judgement gate ui-ux not run"]);
  expect((await c.json("status")).data.phase).toBe("gate");
  const file = join(root, ".crew", "work", id, "review", "ruling.json");
  const ruling = (rulings: unknown[]) => writeFileSync(file, JSON.stringify({ rulings }));
  // A gate not planned for this item, and a malformed file, are refused with the reason.
  ruling([{ gate: "code-quality", verdict: "proven" }]);
  expect((await c.run("judgement", id, "record", "--ruling", file)).err.trim()).toBe(
    "ruling 1: code-quality is not planned for this item (planned: ui-ux)",
  );
  writeFileSync(file, "{not json");
  expect((await c.run("judgement", id, "record", "--ruling", file)).err.trim()).toBe(
    `the ruling file is not valid JSON: ${file}`,
  );
  const missing = join(root, "nope.json");
  expect((await c.run("judgement", id, "record", "--ruling", missing)).err.trim()).toBe(
    `no ruling file at ${missing}`,
  );
  ruling([
    {
      gate: "ui-ux",
      verdict: "not-proven",
      findings: [{ file: "src/App.vue", text: "no loading state", severity: "advisory" }],
    },
  ]);
  expect((await c.run("judgement", id, "record", "--ruling", file)).err).toContain(
    "not proven with no defect finding",
  );
  // Not proven, with a finding outside the change: recorded as the judge ruled, the finding marked.
  ruling([
    {
      gate: "ui-ux",
      verdict: "not-proven",
      reviewer: "ui-ux",
      judge: "judge",
      tokens: 800,
      findings: [
        { file: "src/App.vue", line: 1, text: "no empty-state copy", severity: "defect" },
        { file: "src/legacy.vue", text: "unlabelled button", severity: "advisory" },
      ],
    },
  ]);
  const notProven = await c.json("judgement", id, "record", "--ruling", file);
  expect(notProven.code).toBe(1);
  expect(notProven.data.unproven).toEqual(["judgement gate ui-ux not proven (2 findings)"]);
  const records = notProven.data.records as { findings: { outside?: boolean }[] }[];
  expect(records[0]?.findings.map((f) => f.outside ?? false)).toEqual([false, true]);
  const report = () => readFileSync(join(root, ".crew", "work", id, "report.md"), "utf8");
  expect(report()).toContain("| ui-ux | not proven | ui-ux | 2 | 800 |");
  expect(report()).toContain(
    "- ui-ux: src/legacy.vue unlabelled button (advisory, outside the change)",
  );
  expect((await c.json("status")).data.judgement).toEqual([
    { gate: "ui-ux", status: "not-proven", planned: "interface files: src/App.vue", findings: 2 },
  ]);
  // The judge rules proven on a second look: the record that proves the work delivers it.
  ruling([
    {
      gate: "ui-ux",
      verdict: "proven",
      reviewer: "ui-ux",
      judge: "judge",
      tokens: 400,
      findings: [],
    },
  ]);
  const proven = await c.json("judgement", id, "record", "--ruling", file);
  expect(proven.code).toBe(0);
  expect(proven.data.verdict).toBe("proven");
  expect((await c.json("status")).data.phase).toBe("deliver");
  expect(report()).toContain("**Proven**");
  // The code changes: the ruling is on other code until the roles look again.
  write(root, "src/App.vue", "<template>empty, again</template>");
  expect((await c.json("status")).data.unproven).toEqual(["code changed since the last gate run"]);
  expect((await c.json("status")).data.judgement).toEqual([
    {
      gate: "ui-ux",
      status: "stale",
      planned: "interface files: src/App.vue",
      findings: 0,
      reason: "ruling on earlier code",
    },
  ]);
  const again = await c.json("gate", "run", id);
  expect(again.data.unproven).toEqual(["judgement gate ui-ux not run on the current code"]);
  // The inputs were rewritten for other code: the old ruling and findings are gone with them.
  expect(existsSync(file)).toBe(false);
  expect((await c.run("gate", "run", id)).out).toContain(
    "Judgement gates to run: ui-ux (interface files: src/App.vue)",
  );
  // A gate that could not run is not run, with the reason, never passed.
  const notRun = await c.json(
    "judgement",
    id,
    "record",
    "ui-ux",
    "--not-run",
    "--reason",
    "no browser in this session",
  );
  expect(notRun.code).toBe(1);
  expect(notRun.data.unproven).toEqual([
    "judgement gate ui-ux not run: no browser in this session",
  ]);
  expect(report()).toContain("| ui-ux | not run: no browser in this session |  | 0 |  |");
  expect(
    (await c.run("judgement", id, "record", "risk", "--not-run", "--reason", "x")).err.trim(),
  ).toBe("risk is not planned for this item (planned: ui-ux)");
  // A hand edit of the evidence is caught, as for any engine-owned file.
  const evidenceFile = join(root, ".crew", "work", id, "evidence.json");
  writeFileSync(evidenceFile, readFileSync(evidenceFile, "utf8").replace('"not-run"', '"proven"'));
  expect((await c.json("status")).data.unproven).toContain("state changed outside the engine");
}, 30_000);

test("SP2b review: a ruling is accepted only while the review inputs describe the current code", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  await c.run("tdd", "red", id, "AC-1", "--", "exit 1");
  await c.run("tdd", "green", id, "AC-1", "--", "exit 0");
  const review = join(root, ".crew", "work", id, "review");
  const file = join(review, "ruling.json");
  const proven = JSON.stringify({ rulings: [{ gate: "ui-ux", verdict: "proven", findings: [] }] });
  // No gate run yet: no inputs, so no ruling can be about them.
  mkdirSync(review, { recursive: true });
  writeFileSync(file, proven);
  expect((await c.run("judgement", id, "record", "--ruling", file)).err.trim()).toBe(
    `no review inputs for this item: run crew gate run ${id} first, then the reviewers and the judge`,
  );
  await c.run("skip", id, "gate:e2e", "--reason", "no environment in the fixture");
  await c.run("gate", "run", id);
  writeFileSync(join(review, "ui-ux.findings.md"), "# ui-ux findings\n");
  writeFileSync(file, proven);
  // The code changes after the judge looked and before the record: the inputs describe other code.
  write(root, "src/App.vue", "<template>empty, again</template>");
  expect((await c.run("judgement", id, "record", "--ruling", file)).err.trim()).toBe(
    `the review inputs describe other code than the current one: run crew gate run ${id}, then the reviewers and the judge again`,
  );
  // The next gate run rewrites the inputs for the new code and removes what was written for the old.
  await c.run("gate", "run", id);
  expect(existsSync(file)).toBe(false);
  expect(existsSync(join(review, "ui-ux.findings.md"))).toBe(false);
  expect(existsSync(join(review, "inputs.json"))).toBe(true);
  // Rewritten for the same code, the inputs keep the session's files.
  writeFileSync(file, proven);
  await c.run("gate", "run", id, "--only", "ui-ux");
  expect(existsSync(file)).toBe(true);
  expect((await c.json("judgement", id, "record", "--ruling", file)).data.verdict).toBe("proven");
});

test("SP2b minors: a relative --ruling path resolves from the repository root and the refusal prints the resolved path (D-1)", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  await c.run("tdd", "red", id, "AC-1", "--", "exit 1");
  await c.run("tdd", "green", id, "AC-1", "--", "exit 0");
  await c.run("skip", id, "gate:e2e", "--reason", "no environment in the fixture");
  await c.run("gate", "run", id);
  // From a subfolder, the same relative path names the same file: the one under the root.
  mkdirSync(join(root, "sub"));
  const fromSub = io(join(root, "sub"), c.env);
  expect(
    (await fromSub.run("judgement", id, "record", "--ruling", "review/nowhere.json")).err.trim(),
  ).toBe(`no ruling file at ${join(root, "review/nowhere.json")}`);
});

test("SP2b minors: --not-run with --ruling is refused for giving both", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data
    .id as string;
  const both = await c.run(
    "judgement",
    id,
    "record",
    "ui-ux",
    "--not-run",
    "--reason",
    "no browser",
    "--ruling",
    "review/ruling.json",
  );
  expect(both.code).toBe(1);
  expect(both.err.trim()).toBe(
    "--not-run and --ruling do not go together: a gate that could not run has no ruling; give one or the other",
  );
});

test("SP2b minors: a proven ruling with a defect inside the change is refused and nothing is recorded", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  await c.run("tdd", "red", id, "AC-1", "--", "exit 1");
  await c.run("tdd", "green", id, "AC-1", "--", "exit 0");
  await c.run("skip", id, "gate:e2e", "--reason", "no environment in the fixture");
  await c.run("gate", "run", id);
  const file = join(root, ".crew", "work", id, "review", "ruling.json");
  const ruling = (findings: unknown[]) =>
    writeFileSync(
      file,
      JSON.stringify({ rulings: [{ gate: "ui-ux", verdict: "proven", findings }] }),
    );
  ruling([
    { file: "src/legacy.vue", line: 1, text: "unlabelled button", severity: "defect" },
    { file: "src/App.vue", line: 3, text: "no empty state", severity: "defect" },
  ]);
  const refused = await c.run("judgement", id, "record", "--ruling", file);
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(
    "ui-ux: proven with a defect on src/App.vue:3; the judge rules not proven on a defect inside the change, or lowers it to advisory",
  );
  expect((await c.json("status")).data.judgement).toEqual([
    { gate: "ui-ux", status: "planned", planned: "interface files: src/App.vue", findings: 0 },
  ]);
  // A defect outside the change is debt, named and never a failure (ADR 0006): proven stands.
  ruling([{ file: "src/legacy.vue", line: 1, text: "unlabelled button", severity: "defect" }]);
  expect((await c.json("judgement", id, "record", "--ruling", file)).data.verdict).toBe("proven");
});

test("SP2b minors: a gate run whose patch has no diff content says so, with the reason", async () => {
  // A folder without git: active once crew detect has written .crew/, the change measured by the walk.
  const root = tempDir();
  write(root, "package.json", JSON.stringify({ scripts: { test: "exit 0" } }));
  write(root, "src/App.vue", "<template/>");
  const c = io(root);
  expect((await c.run("detect")).code).toBe(0);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  await c.run("tdd", "red", id, "AC-1", "--", "exit 1");
  await c.run("tdd", "green", id, "AC-1", "--", "exit 0");
  await c.run("skip", id, "gate:e2e", "--reason", "no environment in the fixture");
  const run = await c.json("gate", "run", id);
  expect(run.data.judgement).toEqual([{ gate: "ui-ux", reason: "interface files: src/App.vue" }]);
  expect(run.data.reviewNote).toBe("outside git, no diff can be cut");
  expect((await c.run("gate", "run", id)).out).toContain(
    "\ndiff.patch: outside git, no diff can be cut",
  );
  expect(readFileSync(join(root, ".crew", "work", id, "review", "diff.patch"), "utf8")).toBe(
    "# outside git, no diff can be cut\n",
  );
});

test("SP2b: a judgement gate is skipped only when the policy lists it, and the verdict then passes over it", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  await c.run("tdd", "red", id, "AC-1", "--", "exit 1");
  await c.run("tdd", "green", id, "AC-1", "--", "exit 0");
  const refused = await c.run("skip", id, "gate:ui-ux", "--reason", "no browser");
  expect(refused.code).toBe(1);
  expect(refused.err).toContain(
    "the team policy does not allow skipping gate:ui-ux: gates are mandatory",
  );
  expect((await c.run("skip", id, "ui-ux", "--reason", "no browser")).code).toBe(1);
  expect((await c.run("skip", id, "gate:nope", "--reason", "x")).err.trim()).toBe(
    "unknown step: gate:nope",
  );
  write(root, ".crew/policy.json", JSON.stringify({ allowSkips: ["tdd", "ui-ux", "e2e"] }));
  expect((await c.run("policy", "accept")).code).toBe(0);
  const skipped = await c.json("skip", id, "ui-ux", "--reason", "no browser");
  expect((skipped.data.skips as { step: string }[]).at(-1)?.step).toBe("gate:ui-ux");
  await c.run("skip", id, "gate:e2e", "--reason", "no environment in the fixture");
  expect((await c.json("gate", "run", id)).data.verdict).toBe("proven");
  expect((await c.run("gate", "run", id)).out).not.toContain("Judgement gates to run");
  expect((await c.json("status")).data.judgement).toEqual([
    {
      gate: "ui-ux",
      status: "skipped",
      planned: "interface files: src/App.vue",
      findings: 0,
      reason: "no browser",
    },
  ]);
});

test("SP2b: gate run names the judgement gates to run, accepts their names in --only, and status shows the plan, the decisions and the objections' text", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  expect((await c.run("tdd", "red", id, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", id, "AC-1", "--", "exit 0")).code).toBe(0);
  await c.run("skip", id, "gate:e2e", "--reason", "no environment in the fixture");
  const run = await c.run("gate", "run", id);
  expect(run.out).toContain(
    `Judgement gates to run: ui-ux (interface files: src/App.vue); inputs in .crew/work/${id}/review/ (diff.patch, files.txt); record each with crew judgement ${id} record --ruling <file>`,
  );
  expect(existsSync(join(root, ".crew", "work", id, "review", "diff.patch"))).toBe(true);
  const json = await c.json("gate", "run", id, "--only", "ui-ux");
  expect(json.data.judgement).toEqual([{ gate: "ui-ux", reason: "interface files: src/App.vue" }]);
  expect(json.data.review).toBe(`.crew/work/${id}/review`);
  // secrets, test and the skipped e2e row of the full run; --only ui-ux ran nothing new.
  expect((json.data.runs as unknown[]).length).toBe(3);
  expect((await c.run("gate", "run", id, "--only", "ui-ux,bogus")).err.trim()).toBe(
    "unknown gate: bogus",
  );
  const status = await c.json("status");
  expect(status.data.judgement).toEqual([
    { gate: "ui-ux", status: "planned", planned: "interface files: src/App.vue", findings: 0 },
  ]);
  expect(status.data.decisions).toEqual([]);
  await c.run("decision", id, "add", "Which empty-state copy?", "--default", "the product's voice");
  await c.run("decide", id, "D-1", "the product's voice");
  await c.run(
    "objection",
    id,
    "add",
    "the empty state hides the primary action",
    "--by",
    "fault-finder",
    "--severity",
    "advisory",
  );
  const after = await c.json("status");
  expect(after.data.decisions).toEqual([
    { id: "D-1", question: "Which empty-state copy?", answer: "the product's voice", by: "user" },
  ]);
  expect(after.data.objections).toEqual([
    {
      id: "O-1",
      severity: "advisory",
      status: "open",
      text: "the empty state hides the primary action",
    },
  ]);
});

function io(cwd: string, env = testEnv(), stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const cli: CliIo = {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    stdin: async () => stdin,
    env,
    cwd,
  };
  const run = async (...argv: string[]) => {
    out.length = 0;
    err.length = 0;
    const code = await main(argv, cli);
    return { code, out: out.join(""), err: err.join("") };
  };
  const json = async (...argv: string[]) => {
    const result = await run(...argv, "--json");
    return { code: result.code, data: JSON.parse(result.out) as Record<string, unknown> };
  };
  return { run, json, env };
}

// A chore in one spot: fast, and a feature by kind, so the fast-route tests land in build as they did when the
// constant said fix (a fix is an issue from SP3 Task 2 on, and an issue walks through analyse first).
const answers = JSON.stringify({
  work_type: "chore",
  is_vague: 0.1,
  scope: 0,
  touches_auth: 0,
  touches_payments: 0,
  touches_personal_data: 0,
  touches_data_migration: 0,
  touches_infra: 0,
  touches_public_api: 0,
});

test("a fast-route fix from start to a proven report", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "sh t.sh" } }),
    "t.sh": "exit 1\n",
    "src/a.ts": "x",
  });
  const c = io(root);
  expect((await c.run("--version")).out.trim()).toBe("0.7.0");
  const detect = await c.json("detect");
  expect(detect.code).toBe(0);
  expect((detect.data.profile as { targets: unknown[] }).targets).toHaveLength(1);

  const start = await c.json("start", "Cart total ignores the discount", "--answers", answers);
  const id = start.data.id as string;
  expect(start.data.route).toBe("fast");
  expect(existsSync(join(root, ".crew", "local", "decisions.jsonl"))).toBe(true);

  expect((await c.run("phase", id, "next")).code).toBe(1);
  expect((await c.run("criteria", id, "add", "The total subtracts the discount.")).code).toBe(0);
  expect((await c.json("phase", id, "next")).data.phase).toBe("build");

  expect((await c.run("tdd", "green", id, "AC-1")).code).toBe(1);
  expect((await c.run("tdd", "red", id, "AC-1")).code).toBe(0);
  write(root, "t.sh", "exit 0\n");
  write(root, "src/a.ts", "fixed");
  expect((await c.run("tdd", "green", id, "AC-1")).code).toBe(0);

  const gates = await c.json("gate", "run", id);
  expect(gates.code).toBe(0);
  expect(gates.data.verdict).toBe("proven");
  // The gate run is the fast route's delivery: the report is on disk without a further command.
  expect(readFileSync(join(root, ".crew", "work", id, "report.md"), "utf8")).toContain(
    "**Proven**",
  );
  // ...and the item is in the deliver phase without a further command.
  expect((await c.json("status")).data.phase).toBe("deliver");

  const report = await c.run("evidence", id);
  expect(report.code).toBe(0);
  expect(report.out).toContain("**Proven**");
  expect(readFileSync(join(root, ".crew", "work", id, "report.md"), "utf8")).toContain(
    "red then green",
  );
  const status = await c.json("status");
  expect(status.data.verdict).toBe("proven");
  expect(status.data.active).toBe(id);
  expect(status.data.title).toBe("Cart total ignores the discount");
  expect(status.data.phases).toEqual(["receive", "recognize", "build", "gate", "deliver"]);
  expect(status.data.criteria).toEqual([
    {
      id: "AC-1",
      kind: "behavior",
      text: "The total subtracts the discount.",
      tdd: "red then green",
    },
  ]);
  expect(
    (status.data.runs as { gate: string; status: string }[]).map((r) => `${r.gate}:${r.status}`),
  ).toEqual(["secrets:pass", "test:pass"]);
  expect(status.data.expected).toEqual(["secrets", "test"]);
  expect(status.data.skips).toEqual([]);
  expect(status.data.awaiting).toBeNull();
  expect(typeof status.data.baseCommit).toBe("string");
});

test("status without an active item is a short answer", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const status = await c.json("status");
  expect(status.code).toBe(0);
  expect(status.data.active).toBeNull();
  expect(status.data.criteria).toBeUndefined();
});

/** A team policy that allows every skip, as the default did before 0.3.0; trusted on first use. */
function allowAllSkips(root: string, extra: Record<string, unknown> = {}): void {
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(
    join(root, ".crew", "policy.json"),
    JSON.stringify({ allowSkips: ["*"], ...extra }),
  );
}

test("refusals: unknown work, skip without reason, invalid answers, pilot cannot skip secrets", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  allowAllSkips(root);
  const c = io(root);
  expect((await c.run("phase", "nope", "next")).code).toBe(1);
  expect((await c.run("start", "x", "--answers", '{"work_type":"bug"}')).code).toBe(1);
  const start = await c.json("start", "Thing", "--answers", answers);
  const id = start.data.id as string;
  expect((await c.run("skip", id, "gate:lint")).code).toBe(1);
  expect((await c.run("skip", id, "gate:lint", "--reason", "legacy")).code).toBe(0);
  expect((await c.run("mode", "pilot")).code).toBe(0);
  const refused = await c.run("skip", id, "gate:secrets", "--reason", "no");
  expect(refused.code).toBe(1);
  expect(refused.err).toMatch(/pilot/i);
  expect((await c.run("config", "decisions.log", "false")).code).toBe(0);
  expect((await c.json("config", "decisions.log")).data.value).toBe(false);
});

test("profile set confirms in one step; a detector's guess stays proposed until confirmed", async () => {
  const root = makeRepo({ Makefile: "test:\n\ttrue\n", "src/a.c": "x" });
  const c = io(root);
  const detect = await c.json("detect");
  expect(detect.data.missing).toEqual([{ target: ".", gate: "test" }]);
  const set = await c.json("profile", "set", "test", "make test");
  expect(set.code).toBe(0);
  expect(set.data.message).toContain("confirmed");
  const start = await c.json("start", "fix", "--answers", answers);
  const id = start.data.id as string;
  await c.run("criteria", id, "add", "x");
  await c.run("skip", id, "tdd:AC-1", "--reason", "manual");
  write(root, "src/a.c", "y");
  const first = await c.json("gate", "run", id);
  expect(first.data.verdict).toBe("proven");
  // Replacing a confirmed command is the user's call.
  const refused = await c.run("profile", "set", "test", "make check");
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("--force");
  expect((await c.run("profile", "set", "test", "make check", "--force")).code).toBe(0);
  expect((await c.run("profile", "confirm")).code).toBe(0);
  expect(loadProfile(repoPaths(root, c.env)).profile?.targets[0]?.gates.test).toEqual({
    command: "make check",
    source: "confirmed",
  });

  // Two lockfiles and no packageManager field: the detector guesses, and the guess is proposed until confirmed (finding 13).
  const guessed = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "bun.lock": "",
    "pnpm-lock.yaml": "",
    "src/a.ts": "x",
  });
  const g = io(guessed);
  const gid = (await g.json("start", "fix", "--answers", answers, "--criterion", "x")).data
    .id as string;
  await g.run("skip", gid, "tdd:AC-1", "--reason", "manual");
  write(guessed, "src/a.ts", "y");
  expect((await g.json("gate", "run", gid)).data.unproven).toContain(
    "gate test ran an unconfirmed command (crew profile confirm)",
  );
  expect((await g.run("profile", "confirm", "test")).code).toBe(0);
  expect((await g.json("gate", "run", gid)).data.verdict).toBe("proven");
});

test("0.3.0: crew gate run follows the manifests and never replaces a confirmed command", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { build: "true" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  const id = (await c.json("start", "Thing", "--answers", answers, "--criterion", "x")).data
    .id as string;
  await c.run("skip", id, "tdd:AC-1", "--reason", "manual");
  expect(loadProfile(paths).profile?.targets[0]?.gates.test).toBeUndefined();
  // The work adds the test script and a lockfile; the gate run notices without crew detect --refresh.
  write(root, "package.json", JSON.stringify({ scripts: { build: "true", test: "exit 0" } }));
  write(root, "package-lock.json", "{}");
  write(root, "src/a.ts", "y");
  const run = await c.json("gate", "run", id);
  expect(run.data.refreshed).toEqual(expect.arrayContaining(["test (.): npm run test"]));
  expect(JSON.stringify(run.data.unproven)).not.toContain("no command");
  expect(loadProfile(paths).profile?.targets[0]?.gates.test).toEqual({
    command: "npm run test",
    source: "detected",
  });
  const plain = await c.run("gate", "run", id);
  expect(plain.out).not.toContain("profile refreshed");
  // A command a person set is never replaced by a refresh.
  expect((await c.run("profile", "set", "test", "exit 0 # mine", "--force")).code).toBe(0);
  write(root, "package.json", JSON.stringify({ scripts: { build: "true", test: "exit 1" } }));
  const after = await c.run("gate", "run", id);
  expect(after.out).not.toContain("profile refreshed");
  expect(loadProfile(paths).profile?.targets[0]?.gates.test).toEqual({
    command: "exit 0 # mine",
    source: "confirmed",
  });
}, 30_000);

test("C1: gate run --only refuses an unknown gate name", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  const refused = await c.run("gate", "run", id, "--only", "secrets,bogus");
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe("unknown gate: bogus");
});

test("C3: crew is inactive in a plain folder until crew detect activates it", async () => {
  const dir = tempDir();
  write(dir, "src/a.py", "a = 1\n");
  const c = io(dir);
  const inactive =
    "crew is inactive here: not a git repository and no .crew/ folder; run crew detect in the project root to activate it";
  const status = await c.run("status");
  expect(status.code).toBe(1);
  expect(status.err.trim()).toBe(inactive);
  expect((await c.run("start", "x", "--answers", answers)).err.trim()).toBe(inactive);
  expect(existsSync(join(dir, ".crew"))).toBe(false);
  expect((await c.run("mode")).code).toBe(0);
  expect((await c.run("config")).code).toBe(0);
  expect((await c.run("help")).code).toBe(0);
  expect(existsSync(join(dir, ".crew"))).toBe(false);
  expect((await c.run("detect")).code).toBe(0);
  expect(existsSync(join(dir, ".crew", "profile.json"))).toBe(true);
  expect((await c.json("status")).data.active).toBeNull();
});

test("C2: a hand-edited work item blocks every saving command until the user accepts it", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  const file = join(root, ".crew", "work", id, "work.json");
  const work = JSON.parse(readFileSync(file, "utf8"));
  work.skips.push({ step: "gate:test", reason: "agent", at: "t" });
  writeFileSync(file, JSON.stringify(work));
  const message = `state changed outside the engine: .crew/work/${id}/work.json; the user can accept it with crew accept ${id}`;
  const refused = await c.run("criteria", id, "add", "x");
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(message);
  for (const argv of [
    ["gate", "run", id],
    ["await", id, "user"],
    ["skip", id, "gate:lint", "--reason", "x"],
    ["phase", id, "next"],
  ]) {
    expect((await c.run(...argv)).err.trim()).toBe(message);
  }
  const status = await c.json("status");
  expect(status.code).toBe(0);
  expect(status.data.unproven).toContain("state changed outside the engine");
  const rendered = await c.run("evidence", id);
  expect(rendered.code).toBe(1);
  expect(rendered.err).toStartWith(message);
  expect(rendered.err).toContain("# Report: Thing");
  expect(existsSync(join(root, ".crew", "work", id, "report.md"))).toBe(false);
  expect((await c.run("accept", id)).code).toBe(0);
  expect((await c.run("criteria", id, "add", "x")).code).toBe(0);
  expect((await c.run("accept", "nope")).code).toBe(1);
});

test("C2: a corrupt integrity file is reported, and accept re-records profile and policy", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  writeFileSync(paths.integrityFile, "garbage");
  const status = await c.json("status");
  expect(status.data.unproven).toContain("state changed outside the engine");
  const refused = await c.run("profile", "set", "lint", "make lint");
  expect(refused.err.trim()).toBe(
    "state changed outside the engine: .crew/profile.json; the user can accept it with crew accept profile",
  );
  expect((await c.run("accept", "profile")).code).toBe(0);
  expect((await c.run("profile", "set", "lint", "make lint")).code).toBe(0);
  expect((await c.run("criteria", id, "add", "x")).code).toBe(1);
  expect((await c.run("accept", id)).code).toBe(0);
  expect((await c.run("criteria", id, "add", "x")).code).toBe(0);
  expect((await c.run("accept", "policy")).code).toBe(1);
});

test("I5 (0.3.0): profile set replaces a detected command in one confirmed step; a confirmed one only with --force", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0", lint: "exit 0" } }),
  });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  const gates = () => loadProfile(paths).profile?.targets[0]?.gates;
  expect((await c.run("detect")).code).toBe(0);
  expect(gates()?.test).toEqual({ command: "npm run test", source: "detected" });
  // The user's command is the user's decision (the hook asks or relays): set once, confirmed.
  const set = await c.run("profile", "set", "test", "true");
  expect(set.code).toBe(0);
  expect(set.out.trim()).toBe("test for . set and confirmed: true");
  expect(gates()?.test).toEqual({ command: "true", source: "confirmed" });
  expect((await c.run("profile", "set", "build", "make")).code).toBe(0);
  expect(gates()?.build).toEqual({ command: "make", source: "confirmed" });
  // Replacing what a person confirmed is on purpose only.
  const refused = await c.run("profile", "set", "build", "x");
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(
    'build for . already has a confirmed command (make); replacing it needs --force: crew profile set build "<cmd>" --force',
  );
  expect((await c.run("profile", "set", "build", "x", "--force")).code).toBe(0);
  expect(gates()?.build).toEqual({ command: "x", source: "confirmed" });
  // Nothing left to confirm: accepted, no effect.
  const none = await c.json("profile", "confirm");
  expect(none.code).toBe(0);
  expect(none.data.confirmed).toBe(0);
  expect((await c.run("profile", "confirm", "bogus")).code).toBe(1);
});

test("finding 8: profile set names the target by stack when two share a path", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "composer.json": JSON.stringify({ scripts: { test: "exit 0" } }),
  });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  const detect = await c.json("detect");
  expect(
    (detect.data.profile as { targets: { stack: string }[] }).targets.map((t) => t.stack),
  ).toEqual(["node", "php"]);
  const refused = await c.run("profile", "set", "lint", "pint");
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(
    "two targets at . (node, php): say which one with --stack <node|php>",
  );
  expect((await c.run("profile", "set", "lint", "pint", "--stack", "php")).code).toBe(0);
  const targets = loadProfile(paths).profile?.targets ?? [];
  expect(targets.find((t) => t.stack === "php")?.gates.lint).toEqual({
    command: "pint",
    source: "confirmed",
  });
  expect(targets.find((t) => t.stack === "node")?.gates.lint).toBeUndefined();
  expect((await c.run("profile", "set", "lint", "x", "--stack", "ruby")).code).toBe(1);
  // A path with one target needs no flag; a new path gets a target of its own.
  expect((await c.run("profile", "set", "test", "make test", "--target", "tools")).code).toBe(0);
  expect(loadProfile(paths).profile?.targets.find((t) => t.path === "tools")?.stack).toBe("other");
});

test("I6: skip steps are normalised, and anything else is refused", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  allowAllSkips(root);
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  await c.run("criteria", id, "add", "x");
  const step = async (raw: string) => {
    const result = await c.json("skip", id, raw, "--reason", "r");
    return result.code === 0
      ? (result.data.skips as { step: string }[]).at(-1)?.step
      : (result.data.message as string);
  };
  expect(await step("lint")).toBe("gate:lint");
  expect(await step("AC-1")).toBe("tdd:AC-1");
  expect(await step("gate:deps")).toBe("gate:deps");
  expect(await step("tdd:AC-1")).toBe("tdd:AC-1");
  expect(await step("specify")).toBe("specify");
  expect(await step("tdd:AC-9")).toBe("unknown step: tdd:AC-9");
  expect(await step("gate:bogus")).toBe("unknown step: gate:bogus");
  expect(await step("the tests")).toBe("unknown step: the tests");
});

test("I10: start needs the typed answers, and a question creates no work item", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const bare = await c.run("start", "Fix the cart");
  expect(bare.code).toBe(1);
  expect(bare.err.trim()).toBe(
    "answers are required: answer the nine typed questions from the crew skill (references/receive.md) and pass them with --answers",
  );
  const question = JSON.stringify({ ...JSON.parse(answers), work_type: "question" });
  const asked = await c.run("start", "What does add do?", "--answers", question);
  expect(asked.code).toBe(0);
  expect(asked.out.trim()).toBe("question: answer the user; no work item is created");
  expect(existsSync(join(root, ".crew", "work"))).toBe(false);
  expect((await c.json("status")).data.active).toBeNull();
});

test("starting a new item while another is active and unproven warns which one it replaces", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const first = (await c.json("start", "First", "--answers", answers)).data.id as string;
  const second = await c.run("start", "Second", "--answers", answers);
  expect(second.code).toBe(0);
  expect(second.out.split("\n")[0]).toBe(
    `warning: ${first} is not proven and is no longer the active work item`,
  );
});

test("hook: malformed or empty stdin answers {} and exits 0", async () => {
  const root = makeRepo();
  expect(await io(root, testEnv(), "").run("hook", "stop")).toMatchObject({ code: 0, out: "{}\n" });
  expect(await io(root, testEnv(), "{not json").run("hook", "stop")).toMatchObject({
    code: 0,
    out: "{}\n",
  });
  const ok = await io(root, testEnv(), JSON.stringify({ session_id: "s", cwd: root })).run(
    "hook",
    "session-start",
  );
  expect(ok.code).toBe(0);
  expect(JSON.parse(ok.out)).toHaveProperty("hookSpecificOutput");
});

test("detect --refresh never re-blesses a tampered policy; policy accept does", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  const file = join(root, ".crew", "policy.json");
  expect((await c.run("policy", "accept")).code).toBe(1);
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(file, '{"minimumRoute":"standard"}');
  expect((await c.run("detect", "--refresh")).code).toBe(0);
  expect(readProtectedJson(paths, file).tampered).toBe(false);
  writeFileSync(file, '{"minimumRoute":"fast"}');
  const refused = await c.run("detect", "--refresh");
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(
    "state changed outside the engine: .crew/policy.json; the user can accept it with crew accept policy",
  );
  expect(readProtectedJson(paths, file).tampered).toBe(true);
  expect((await c.run("detect")).code).toBe(0);
  expect((await c.run("policy", "accept")).code).toBe(0);
  expect(readProtectedJson(paths, file).tampered).toBe(false);
  expect((await c.run("policy", "other")).code).toBe(1);
});

test("ADR 0005: crew policy set writes the two decision keys through the engine and refuses the rest", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  const file = join(root, ".crew", "policy.json");
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(file, '{"minimumRoute":"standard"}');
  // A hand-written policy with no hash yet is trusted; set keeps what it says and records a hash.
  const set = await c.json("policy", "set", "attendedDecisions", "relay");
  expect(set.code).toBe(0);
  expect(set.data).toMatchObject({ key: "attendedDecisions", value: "relay" });
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
    minimumRoute: "standard",
    attendedDecisions: "relay",
  });
  expect(readProtectedJson(paths, file).tampered).toBe(false);
  expect((await c.run("policy", "set", "unattendedDecisions", "count")).code).toBe(0);
  expect(JSON.parse(readFileSync(file, "utf8")).unattendedDecisions).toBe("count");
  expect(readProtectedJson(paths, file).tampered).toBe(false);
  const badValue = await c.run("policy", "set", "attendedDecisions", "trust");
  expect(badValue.code).toBe(1);
  expect(badValue.err).toContain("prompt, relay");
  const badKey = await c.run("policy", "set", "minimumRoute", "full");
  expect(badKey.code).toBe(1);
  expect(badKey.err).toContain("attendedDecisions, unattendedDecisions");
  expect((await c.run("policy", "set", "attendedDecisions")).code).toBe(1);
  // A hand edit after the engine wrote the file is refused until a person accepts it.
  writeFileSync(file, '{"minimumRoute":"fast"}');
  const tampered = await c.run("policy", "set", "attendedDecisions", "prompt");
  expect(tampered.code).toBe(1);
  expect(tampered.err).toContain("state changed outside the engine: .crew/policy.json");
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({ minimumRoute: "fast" });
  expect((await c.run("policy", "accept")).code).toBe(0);
  expect((await c.run("policy", "set", "attendedDecisions", "prompt")).code).toBe(0);
  expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
    minimumRoute: "fast",
    attendedDecisions: "prompt",
  });
  // No --mode: the policy changes only when a person clicks.
  const flagged = await c.run("policy", "set", "attendedDecisions", "relay", "--mode", "dontAsk");
  expect(flagged.code).toBe(1);
  expect(flagged.err).toContain("unknown flag --mode");
  // With no policy file at all, set creates one.
  const bare = io(makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) }));
  expect((await bare.run("policy", "set", "attendedDecisions", "relay")).code).toBe(0);
  expect((await bare.json("status")).code).toBe(0);
});

test("ADR 0005: under relay a decision without --mode is the user's, relayed by the agent, in the record and the output", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  allowAllSkips(root);
  const c = io(root);
  expect((await c.run("policy", "set", "attendedDecisions", "relay")).code).toBe(0);
  const id = (await c.json("start", "Thing", "--answers", answers, "--criterion", "x")).data
    .id as string;
  const file = join(root, ".crew", "work", id, "work.json");
  const read = () => JSON.parse(readFileSync(file, "utf8"));
  const approved = await c.json("approve", id, "spec");
  expect(approved.code).toBe(0);
  expect(approved.data.message).toContain("by the user, relayed by the agent");
  expect(read().approvals).toEqual([
    { what: "spec", at: expect.any(String), by: "user", relayed: true },
  ]);
  const skipped = await c.json("skip", id, "gate:lint", "--reason", "legacy");
  expect(skipped.data.message).toContain("by the user, relayed by the agent");
  expect(skipped.data.message).not.toContain("counted");
  expect(read().skips[0]).toMatchObject({ by: "user", relayed: true });
  await c.run("decision", id, "add", "Which?");
  const decided = await c.json("decide", id, "D-1", "this");
  expect(decided.code).toBe(0);
  expect(decided.data.message).toContain("by the user, relayed by the agent");
  expect(read().decisions[0]).toMatchObject({ answer: "this", by: "user", relayed: true });
  await c.run("objection", id, "add", "no", "--by", "critic", "--severity", "advisory");
  const waived = await c.json("objection", id, "waive", "O-1", "--reason", "fine");
  expect(waived.code).toBe(0);
  expect(waived.data.message).toContain("waived by the user, relayed by the agent");
  const ledger = JSON.parse(
    readFileSync(join(root, ".crew", "work", id, "objections.json"), "utf8"),
  );
  expect(ledger.objections[0].waived).toMatchObject({ by: "user", relayed: true });
  // Where no person is watching, nothing is relayed.
  const agent = await c.json("approve", id, "spec", "--mode", "dontAsk");
  expect(agent.data.message).not.toContain("relayed");
  expect(read().approvals[1]).toEqual({
    what: "spec",
    at: expect.any(String),
    by: "agent",
    mode: "dontAsk",
  });
  // Under the default policy nothing is relayed either.
  expect((await c.run("policy", "set", "attendedDecisions", "prompt")).code).toBe(0);
  expect((await c.json("skip", id, "gate:test", "--reason", "y")).data.message).not.toContain(
    "relayed",
  );
  expect(read().skips[1]).toEqual({
    step: "gate:test",
    reason: "y",
    at: expect.any(String),
    by: "user",
  });
});

test("0.3.0: profile set --timeout stores a gate's own timeout, in minutes", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  expect((await c.run("profile", "set", "test", "exit 0", "--timeout", "30")).code).toBe(0);
  expect(loadProfile(repoPaths(root, c.env)).profile?.targets[0]?.gates.test).toEqual({
    command: "exit 0",
    source: "confirmed",
    timeoutMs: 30 * 60 * 1000,
  });
  const bad = await c.run("profile", "set", "lint", "x", "--timeout", "abc");
  expect(bad.code).toBe(1);
  expect(bad.err).toContain("--timeout");
  expect((await c.run("profile", "set", "lint", "x", "--timeout", "0")).code).toBe(1);
  expect(loadProfile(repoPaths(root, c.env)).profile?.targets[0]?.gates.lint).toBeUndefined();
});

test("the command comes first, so user-only verbs cannot hide behind a leading flag", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  const file = join(root, ".crew", "work", id, "work.json");
  const work = JSON.parse(readFileSync(file, "utf8"));
  work.skips.push({ step: "gate:test", reason: "agent", at: "t" });
  writeFileSync(file, JSON.stringify(work));
  const integrity = repoPaths(root, c.env).integrityFile;
  const before = readFileSync(integrity, "utf8");
  const message = "the command comes first: crew <command> [arguments] [--flags]";

  const lines = [
    ["--json", "accept", id],
    ["--json", "skip", id, "gate:lint", "--reason", "x"],
    ["--reason", "x", "--json", "skip", id, "gate:lint"],
    ["--json", "approve", id, "spec"],
    ["profile", "--force", "--json", "set", "test", "true"],
  ];
  for (const argv of lines) {
    const result = await c.run(...argv);
    expect(result.code).toBe(1);
    expect((JSON.parse(result.out) as { message: string }).message).toBe(message);
  }
  expect(readFileSync(integrity, "utf8")).toBe(before);
  expect(JSON.parse(readFileSync(file, "utf8")).skips).toEqual(work.skips);

  const plain = await c.run("--reason", "x", "skip", id, "gate:lint");
  expect(plain.code).toBe(1);
  expect(plain.err.trim()).toBe(message);
  expect((await c.run("status", "--json")).code).toBe(0);
});

test("approve and skip record who decided: the user, or the agent in an unattended mode", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  allowAllSkips(root, { attendedDecisions: "prompt" });
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  const file = join(root, ".crew", "work", id, "work.json");
  const read = () => JSON.parse(readFileSync(file, "utf8"));

  expect((await c.json("approve", id, "spec")).code).toBe(0);
  expect(read().approvals).toEqual([{ what: "spec", at: expect.any(String), by: "user" }]);
  const agent = await c.json("approve", id, "spec", "--mode", "auto");
  expect(agent.code).toBe(0);
  expect(agent.data.message).toContain("by the agent in auto mode");
  expect(read().approvals[1]).toEqual({
    what: "spec",
    at: expect.any(String),
    by: "agent",
    mode: "auto",
  });

  expect(
    (await c.json("skip", id, "gate:lint", "--reason", "x", "--mode", "bypassPermissions")).code,
  ).toBe(0);
  expect(read().skips).toEqual([
    {
      step: "gate:lint",
      reason: "x",
      at: expect.any(String),
      by: "agent",
      mode: "bypassPermissions",
    },
  ]);
  expect((await c.json("skip", id, "gate:test", "--reason", "y")).code).toBe(0);
  expect(read().skips[1]).toMatchObject({ step: "gate:test", by: "user" });

  // A headless session is unattended in any mode, so the flag may name any of the six (0.1.6).
  const headless = await c.json("approve", id, "spec", "--mode", "default");
  expect(headless.code).toBe(0);
  expect(read().approvals[2]).toMatchObject({ by: "agent", mode: "default" });
  const bad = await c.json("approve", id, "spec", "--mode", "yes");
  expect(bad.code).toBe(1);
  expect(bad.data.message).toContain(
    "default, acceptEdits, plan, auto, bypassPermissions or dontAsk",
  );
  expect((await c.json("skip", id, "gate:typecheck", "--reason", "z", "--mode", "yes")).code).toBe(
    1,
  );
  expect((await c.json("approve", id, "spec", "--mode")).code).toBe(1);
  expect(read().approvals).toHaveLength(3);
  expect(read().skips).toHaveLength(2);
});

test("gate run exits 1 while the work is not proven and 0 once it is (finding 18)", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "sh t.sh" } }),
    "t.sh": "exit 1\n",
    "src/a.ts": "x",
  });
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  await c.run("criteria", id, "add", "x");
  await c.run("skip", id, "tdd:AC-1", "--reason", "manual");
  const failing = await c.json("gate", "run", id);
  expect(failing.code).toBe(1);
  expect(failing.data.verdict).toBe("unproven");
  expect(failing.data.unproven).toContain("gate test failing");
  expect((await c.run("gate", "run", id)).out).toContain("Not proven: ");
  write(root, "t.sh", "exit 0\n");
  const proven = await c.json("gate", "run", id);
  expect(proven.code).toBe(0);
  expect(proven.data.verdict).toBe("proven");
});

test("criteria remove takes out a criterion with no record and keeps the removal in the record", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const start = await c.json(
    "start",
    "Two criteria",
    "--answers",
    answers,
    "--criterion",
    "a",
    "--criterion",
    "b",
  );
  const id = start.data.id as string;
  const removed = await c.json("criteria", id, "remove", "AC-1");
  expect(removed.code).toBe(0);
  expect(removed.data.removed).toMatchObject({ id: "AC-1", kind: "behavior", text: "a" });
  expect(typeof (removed.data.removed as { at: unknown }).at).toBe("string");
  const status = await c.json("status");
  expect((status.data.criteria as { id: string }[]).map((cr) => cr.id)).toEqual(["AC-2"]);
  const work = JSON.parse(readFileSync(join(root, ".crew", "work", id, "work.json"), "utf8"));
  expect(work.removedCriteria.map((r: { id: string }) => r.id)).toEqual(["AC-1"]);
  expect((await c.run("evidence", id)).code).toBe(0);
  const report = readFileSync(join(root, ".crew", "work", id, "report.md"), "utf8");
  expect(report).toContain("## Decisions");
  expect(report).toContain("- AC-1 (behavior) removed");
  expect(report).toContain(": a");
});

test("criteria remove refuses a criterion with a test-first record, one with a skip, and an unknown id", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "sh t.sh" } }),
    "t.sh": "exit 1\n",
    "src/a.ts": "x",
  });
  const c = io(root);
  const start = await c.json(
    "start",
    "Three criteria",
    "--answers",
    answers,
    "--criterion",
    "a",
    "--criterion",
    "b",
    "--criterion",
    "c",
  );
  const id = start.data.id as string;
  expect((await c.run("tdd", "red", id, "AC-1")).code).toBe(0);
  expect((await c.run("skip", id, "AC-2", "--reason", "manual check")).code).toBe(0);
  const file = join(root, ".crew", "work", id, "work.json");
  const before = readFileSync(file, "utf8");
  const recorded = await c.run("criteria", id, "remove", "AC-1");
  expect(recorded.code).toBe(1);
  expect(recorded.err).toContain("AC-1 has a test-first record");
  const skipped = await c.run("criteria", id, "remove", "AC-2");
  expect(skipped.code).toBe(1);
  expect(skipped.err).toContain("AC-2 has a skip");
  const unknown = await c.run("criteria", id, "remove", "AC-9");
  expect(unknown.code).toBe(1);
  expect(unknown.err).toContain("unknown criterion: AC-9");
  expect(readFileSync(file, "utf8")).toBe(before);
});

test("start takes --criterion, repeatable, and warns about uncommitted changes it will measure", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  write(root, "src/a.ts", "left over from earlier work");
  const start = await c.json(
    "start",
    "Second thing",
    "--answers",
    answers,
    "--criterion",
    "a happens",
    "--criterion",
    "b stays",
  );
  expect(start.code).toBe(0);
  expect(start.data.criteria).toEqual([
    { id: "AC-1", kind: "behavior", text: "a happens" },
    { id: "AC-2", kind: "behavior", text: "b stays" },
  ]);
  expect(start.data.inherited).toEqual(["src/a.ts"]);
  // A fast-route item with its criteria has nothing left before build.
  expect(start.data.phase).toBe("build");
  const status = await c.json("status");
  expect((status.data.criteria as { id: string }[]).map((cr) => cr.id)).toEqual(["AC-1", "AC-2"]);
  const text = await c.run("start", "Third thing", "--answers", answers, "--criterion", "c");
  expect(text.code).toBe(0);
  expect(text.out).toContain(
    "warning: uncommitted changes in src/a.ts count as this item's change; commit them first if they are not",
  );
  expect(text.out).toContain("  AC-1 (behavior): c");
});

test("a new item after a proven, uncommitted one starts with no change of its own", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const first = (await c.json("start", "First", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/a.ts", "the first item's work");
  expect((await c.run("tdd", "red", first, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", first, "AC-1", "--", "exit 0")).code).toBe(0);
  expect((await c.json("gate", "run", first)).data.verdict).toBe("proven");
  const second = await c.json("start", "Second", "--answers", answers, "--criterion", "b");
  const secondId = second.data.id as string;
  expect(second.data.replaced).toBeNull();
  expect(second.data.inherited).toEqual([]);
  expect(second.data.proven).toEqual({ of: first, paths: ["src/a.ts"] });
  // With no change of its own, only the second item's own proof stands between it and proven.
  const gates = await c.json("gate", "run", secondId);
  expect(gates.data.unproven).toEqual(["test-first record missing for AC-1"]);
  write(root, "src/a.ts", "the second item touches it too");
  expect((await c.json("status")).data.unproven).toContain("code changed since the last gate run");
});

test("start takes --preserve beside --criterion, numbered in command-line order (finding 7)", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const start = await c.json(
    "start",
    "Mixed criteria",
    "--answers",
    answers,
    "--criterion",
    "a",
    "--preserve",
    "b",
    "--criterion",
    "c",
  );
  expect(start.code).toBe(0);
  expect(start.data.phase).toBe("build");
  expect(start.data.criteria).toEqual([
    { id: "AC-1", kind: "behavior", text: "a" },
    { id: "AC-2", kind: "preserve", text: "b" },
    { id: "AC-3", kind: "behavior", text: "c" },
  ]);
  const only = await c.run(
    "start",
    "Only preserve",
    "--answers",
    answers,
    "--preserve",
    "the existing tests keep passing",
  );
  expect(only.code).toBe(0);
  expect(only.out).toContain("  AC-1 (preserve): the existing tests keep passing");
});

test("start refuses --kind, points to --preserve, and creates nothing (finding 7)", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const refused = await c.run(
    "start",
    "Nope",
    "--answers",
    answers,
    "--criterion",
    "a",
    "--kind",
    "preserve",
  );
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("unknown flag --kind");
  expect(refused.err).toContain("--preserve");
  expect((await c.json("status")).data.active).toBeNull();
  const workDir = join(root, ".crew", "work");
  expect(existsSync(workDir) ? readdirSync(workDir) : []).toEqual([]);
});

test("every command but hook refuses a flag it does not know and keeps its known ones", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const id = (await c.json("start", "Flags", "--answers", answers, "--criterion", "a")).data
    .id as string;
  const gate = await c.run("gate", "run", id, "--olny", "test");
  expect(gate.code).toBe(1);
  expect(gate.err.trim()).toBe("unknown flag --olny for gate (it takes --only, --json)");
  const status = await c.run("status", "--verbose");
  expect(status.code).toBe(1);
  expect(status.err.trim()).toBe("unknown flag --verbose for status (it takes --json)");
  expect((await c.run("detect", "--fresh")).code).toBe(1);
  // Known flags, including the global --json and --version, keep working.
  expect((await c.run("detect", "--refresh")).code).toBe(0);
  expect((await c.json("status")).data.active).toBe(id);
  expect((await c.run("--version")).code).toBe(0);
  // The hook reads its payload from stdin and is called by Claude Code, not by the agent.
  expect((await c.run("hook", "SessionStart", "--anything")).code).toBe(0);
});

test("start records a shared checkout when another item is open with uncommitted changes (finding 9)", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    "src/b.ts": "y",
  });
  const c = io(root);
  const first = (await c.json("start", "Lane A", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/a.ts", "lane A, half-written");
  const second = await c.run("start", "Lane B", "--answers", answers, "--criterion", "b");
  expect(second.code).toBe(0);
  expect(second.out).toContain(
    `warning: this checkout is shared with ${first}, which is open with uncommitted changes in src/a.ts; a second session on one checkout blocks turn ends and proves half-written code: work in a worktree (git worktree add ../<name> -b <branch>)`,
  );
  const status = await c.json("status");
  const secondId = status.data.active as string;
  const record = readProtectedJson<{
    sharedCheckout?: { with: string[]; paths: string[]; at: string };
  }>(repoPaths(root, c.env), join(root, ".crew", "work", secondId, "work.json")).data;
  expect(record?.sharedCheckout?.with).toEqual([first]);
  expect(record?.sharedCheckout?.paths).toEqual(["src/a.ts"]);
  expect(typeof record?.sharedCheckout?.at).toBe("string");
  // A third lane names both open items.
  write(root, "src/b.ts", "lane B, half-written");
  const third = await c.json("start", "Lane C", "--answers", answers, "--criterion", "c");
  expect((third.data.shared as { with: string[] }).with).toEqual([first, secondId]);
  expect((third.data.shared as { paths: string[] }).paths).toEqual(["src/a.ts", "src/b.ts"]);
});

test("start records no shared checkout without a neighbour or without a change (finding 9)", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  // Alone in the checkout, with an uncommitted change: measured as this item's, not shared.
  write(root, "src/a.ts", "mine");
  const alone = await c.json("start", "Alone", "--answers", answers, "--criterion", "a");
  expect(alone.data.shared).toBeNull();
  const aloneId = alone.data.id as string;
  expect(alone.data.inherited).toEqual(["src/a.ts"]);
  // A neighbour that is open, but a clean tree: nothing to share.
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "alone's work, committed");
  const clean = await c.json("start", "Clean", "--answers", answers, "--criterion", "b");
  expect(clean.data.shared).toBeNull();
  const cleanId = clean.data.id as string;
  // A proven, delivered neighbour with its work still uncommitted is not open; an open one is.
  write(root, "src/a.ts", "clean's work");
  expect((await c.run("tdd", "red", cleanId, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", cleanId, "AC-1", "--", "exit 0")).code).toBe(0);
  expect((await c.json("gate", "run", cleanId)).data.verdict).toBe("proven");
  const after = await c.json("start", "After", "--answers", answers, "--criterion", "c");
  expect((after.data.shared as { with: string[] }).with).toEqual([aloneId]);
  expect((after.data.shared as { paths: string[] }).paths).toEqual(["src/a.ts"]);
});

test("a proven item is not an open neighbour, whatever its phase; an unproven one in gate is", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  // Proven, then put back in its gate phase as items proven before 0.1.7 were left.
  const proven = (await c.json("start", "Proven", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/a.ts", "proven's work");
  expect((await c.run("tdd", "red", proven, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", proven, "AC-1", "--", "exit 0")).code).toBe(0);
  expect((await c.json("gate", "run", proven)).data.verdict).toBe("proven");
  const file = join(root, ".crew", "work", proven, "work.json");
  const record = readProtectedJson<{ phase: string }>(paths, file).data;
  writeProtectedJson(paths, file, { ...record, phase: "gate" });
  // Unproven and in gate: a gate run that proved nothing leaves it there, still being worked on.
  const open = (await c.json("start", "Open", "--answers", answers, "--criterion", "b")).data
    .id as string;
  expect((await c.run("tdd", "red", open, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", open, "AC-1", "--", "exit 0")).code).toBe(0);
  expect((await c.json("gate", "run", open, "--only", "test")).data.verdict).toBe("unproven");
  expect((await c.json("status")).data.phase).toBe("gate");
  write(root, "src/a.ts", "open's half-written work");
  const next = await c.json("start", "Next", "--answers", answers, "--criterion", "c");
  expect((next.data.shared as { with: string[] }).with).toEqual([open]);
});

test("a gate run that proves an item already in the gate phase delivers it", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const id = (await c.json("start", "Twice", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/a.ts", "y");
  expect((await c.run("tdd", "red", id, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", id, "AC-1", "--", "exit 0")).code).toBe(0);
  // A partial run proves nothing and moves the item from build to gate.
  const partial = await c.json("gate", "run", id, "--only", "secrets");
  expect(partial.data.verdict).toBe("unproven");
  expect((await c.json("status")).data.phase).toBe("gate");
  // A second partial run leaves it there; the proving run delivers it.
  expect((await c.json("gate", "run", id, "--only", "secrets")).data.verdict).toBe("unproven");
  expect((await c.json("status")).data.phase).toBe("gate");
  expect((await c.json("gate", "run", id)).data.verdict).toBe("proven");
  expect((await c.json("status")).data.phase).toBe("deliver");
}, 30_000);

test("SP2a: an item in specify moves to conclave, and plan asks for conclave.md by name", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const standard = JSON.stringify({ ...JSON.parse(answers), scope: 1 });
  const id = (await c.json("start", "Templates open empty", "--answers", standard)).data
    .id as string;
  expect((await c.json("phase", id, "next")).data.phase).toBe("understand");
  expect((await c.json("phase", id, "next")).data.phase).toBe("specify");
  expect((await c.json("phase", id, "next")).data.phase).toBe("conclave");
  const refused = await c.run("phase", id, "next");
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("conclave.md in the work folder (the gap round: four sections)");
  write(
    root,
    `.crew/work/${id}/conclave.md`,
    "# Gap round\n\n## Assumed by good practice\nnone\n\n## Decisions only the user can make\nnone\n\n## Proposals\nnone\n\n## Warnings\nnone\n",
  );
  // SP7a: the plan also waits for the leads' validation of the spec.
  const blockedByLeads = await c.run("phase", id, "next");
  expect(blockedByLeads.err).toContain("validation of spec by lead-qa");
  await validateLeads(c, root, id);
  expect((await c.json("phase", id, "next")).data.phase).toBe("plan");
});

test("SP2a: decision add and decide, as the user and as the validator", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const standard = JSON.stringify({ ...JSON.parse(answers), scope: 1 });
  const id = (await c.json("start", "Keys in the profile", "--answers", standard)).data
    .id as string;
  const added = await c.json(
    "decision",
    id,
    "add",
    "Who gets the create permission by default?",
    "--default",
    "admins only",
  );
  expect(added.code).toBe(0);
  expect(added.data.decision).toMatchObject({ id: "D-1", default: "admins only" });
  // With a person present the person answers; the validator takes a default only where no person watches.
  expect((await c.run("decide", id, "D-1", "--validator", "stated-default")).err).toContain(
    "a person answers",
  );
  const byValidator = await c.json(
    "decide",
    id,
    "D-1",
    "--mode",
    "dontAsk",
    "--validator",
    "stated-default",
  );
  expect(byValidator.data.decision).toMatchObject({
    answer: "admins only",
    by: "validator",
    rule: "stated-default",
  });
  const byUser = await c.json("decide", id, "D-1", "everyone with a team");
  expect(byUser.data.decision).toMatchObject({ answer: "everyone with a team", by: "user" });
  expect((await c.run("decide", id, "D-1", "--mode", "auto", "--validator", "judge")).code).toBe(1);
});

test("SP2a: objection add, resolve and waive through the command; a hand edit is caught", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const id = (
    await c.json("start", "Gated sync", "--answers", answers, "--criterion", "the sync is gated")
  ).data.id as string;
  const added = await c.json(
    "objection",
    id,
    "add",
    "the full sync would re-subscribe everyone",
    "--by",
    "fault-finder",
    "--severity",
    "blocking",
  );
  expect(added.data.objection).toMatchObject({
    id: "O-1",
    severity: "blocking",
    raisedBy: "fault-finder",
  });
  expect(
    (await c.run("objection", id, "add", "x", "--by", "expert", "--severity", "huge")).err,
  ).toContain("severity is blocking or advisory");
  const status = await c.json("status");
  expect(status.data.objections).toEqual([
    {
      id: "O-1",
      severity: "blocking",
      status: "open",
      text: "the full sync would re-subscribe everyone",
    },
  ]);
  expect((await c.json("gate", "run", id)).data.unproven).toContain(
    "blocking objection O-1 open: the full sync would re-subscribe everyone",
  );
  expect((await c.json("objection", id, "resolve", "O-1", "--criterion", "AC-1")).code).toBe(0);
  expect((await c.run("criteria", id, "remove", "AC-1")).err.trim()).toBe(
    "AC-1 is bound to objection O-1; it stays",
  );
  // A hand edit of the ledger stops every saving command until the user accepts it.
  const file = join(root, ".crew", "work", id, "objections.json");
  writeFileSync(file, readFileSync(file, "utf8").replace("blocking", "advisory"));
  const refused = await c.run(
    "objection",
    id,
    "add",
    "another",
    "--by",
    "expert",
    "--severity",
    "advisory",
  );
  expect(refused.err).toContain(
    `state changed outside the engine: .crew/work/${id}/objections.json`,
  );
  expect((await c.run("accept", id)).out).toContain("objections.json");
  expect((await c.run("objection", id, "waive", "O-1", "--reason", "done by hand")).code).toBe(0);
});

test("SP2a: an observed criterion through the command, and in the report", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const id = (await c.json("start", "Stubbed e2e", "--answers", answers, "--criterion", "a")).data
    .id as string;
  expect(
    (await c.run("criteria", id, "add", "the stubbed e2e passes", "--kind", "observed")).out,
  ).toContain("AC-2 (observed)");
  expect((await c.run("tdd", "observed", id, "AC-2")).err).toContain("needs --reason");
  expect(
    (
      await c.run(
        "tdd",
        "observed",
        id,
        "AC-2",
        "--reason",
        "the dev server stubs the backend",
        "--",
        "exit 0",
      )
    ).code,
  ).toBe(0);
  write(root, "src/a.ts", "y");
  expect((await c.run("tdd", "red", id, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", id, "AC-1", "--", "exit 0")).code).toBe(0);
  expect((await c.json("gate", "run", id)).data.verdict).toBe("proven");
  const report = readFileSync(join(root, ".crew", "work", id, "report.md"), "utf8");
  expect(report).toContain(
    "| AC-2 | observed | the stubbed e2e passes | observed: passes after (the dev server stubs the backend) |",
  );
});

test("0.3.0: with a person present the spec is approved under the complete-gap-round rule when nothing is pending", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "app/Auth/Guard.ts": "x",
  });
  const c = io(root);
  const full = JSON.stringify({ ...JSON.parse(answers), touches_auth: 0.9 });
  const id = (await c.json("start", "Keys in the profile", "--answers", full)).data.id as string;
  const workFile = join(root, ".crew", "work", id, "work.json");
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1 x\n");
  write(root, `.crew/work/${id}/plan.md`, "# Plan\n1. AC-1\n");
  expect((await c.run("criteria", id, "add", "x")).code).toBe(0);
  // The rule does not hold yet: refused, nothing recorded.
  const refused = await c.run("approve", id, "spec", "--validator", "complete-gap-round");
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("conclave.md in the work folder");
  expect(JSON.parse(readFileSync(workFile, "utf8")).approvals).toEqual([]);
  write(
    root,
    `.crew/work/${id}/conclave.md`,
    "## Assumed by good practice\nnone\n## Decisions only the user can make\nnone\n## Proposals\nnone\n## Warnings\nnone\n",
  );
  const approved = await c.json("approve", id, "spec", "--validator", "complete-gap-round");
  expect(approved.code).toBe(0);
  expect(approved.data.message).toContain("by the validator (rule: complete-gap-round)");
  expect(approved.data.message).toContain("a person was present");
  expect((approved.data.approvals as unknown[])[0]).toEqual({
    what: "spec",
    at: expect.any(String),
    by: "validator",
    rule: "complete-gap-round",
  });
  // It counts under the default policy, so the full route reaches build with no question asked.
  await validateLeads(c, root, id);
  for (let i = 0; i < 5; i++) expect((await c.run("phase", id, "next")).code).toBe(0);
  expect(JSON.parse(readFileSync(workFile, "utf8")).phase).toBe("build");
  // A pending decision keeps the rule from holding; the person answers it, in words, relayed.
  const second = (await c.json("start", "Keys again", "--answers", full)).data.id as string;
  write(root, `.crew/work/${second}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1 x\n");
  write(
    root,
    `.crew/work/${second}/conclave.md`,
    "## Assumed by good practice\nnone\n## Decisions only the user can make\n- D-1\n## Proposals\nnone\n## Warnings\nnone\n",
  );
  await c.run("decision", second, "add", "Who gets the permission?");
  const pending = await c.run("approve", second, "spec", "--validator", "complete-gap-round");
  expect(pending.code).toBe(1);
  expect(pending.err).toContain("a stated default or an answer for D-1");
  expect((await c.run("decide", second, "D-1", "--validator", "stated-default")).err).toContain(
    "a person answers",
  );
  const answered = await c.json("decide", second, "D-1", "admins only");
  expect(answered.data.message).toContain("by the user, relayed by the agent");
  expect((await c.run("approve", second, "spec", "--validator", "complete-gap-round")).code).toBe(
    0,
  );
});

test("0.3.0: a gate skip is refused by default and names the honest paths; a tdd skip and a listed gate pass", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers, "--criterion", "x")).data
    .id as string;
  const refused = await c.run("skip", id, "gate:lint", "--reason", "legacy");
  expect(refused.code).toBe(1);
  expect(refused.err).toContain(
    "the team policy does not allow skipping gate:lint: gates are mandatory",
  );
  expect(refused.err).toContain("crew profile set");
  expect(refused.err).toContain("allowSkips");
  expect((await c.run("skip", id, "tdd:AC-1", "--reason", "manual")).code).toBe(0);
  write(root, ".crew/policy.json", JSON.stringify({ allowSkips: ["gate:lint"] }));
  expect((await c.run("policy", "accept")).code).toBe(0);
  expect((await c.run("skip", id, "gate:lint", "--reason", "legacy")).code).toBe(0);
  expect((await c.run("skip", id, "gate:test", "--reason", "slow")).code).toBe(1);
});

test("SP2a: the validator's approval is refused until the rule holds, then counts only under policy validator", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "app/Auth/Guard.ts": "x",
  });
  const c = io(root);
  const full = JSON.stringify({ ...JSON.parse(answers), touches_auth: 0.9 });
  const id = (await c.json("start", "Keys in the profile", "--answers", full)).data.id as string;
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1 x\n");
  write(root, `.crew/work/${id}/plan.md`, "# Plan\n1. AC-1\n");
  expect((await c.run("criteria", id, "add", "x")).code).toBe(0);
  const refused = await c.run(
    "approve",
    id,
    "spec",
    "--mode",
    "dontAsk",
    "--validator",
    "complete-gap-round",
  );
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("conclave.md in the work folder (the gap round: four sections)");
  expect(
    (await c.run("approve", id, "spec", "--mode", "dontAsk", "--validator", "stated-default")).err,
  ).toContain("a spec is approved by the validator under the complete-gap-round rule");
  write(
    root,
    `.crew/work/${id}/conclave.md`,
    "## Assumed by good practice\nnone\n## Decisions only the user can make\nnone\n## Proposals\nnone\n## Warnings\nnone\n",
  );
  const approved = await c.json(
    "approve",
    id,
    "spec",
    "--mode",
    "dontAsk",
    "--validator",
    "complete-gap-round",
  );
  expect(approved.code).toBe(0);
  expect((approved.data.approvals as unknown[])[0]).toMatchObject({
    by: "validator",
    mode: "dontAsk",
    rule: "complete-gap-round",
  });
  // Under the default policy the guard still waits for a person.
  await validateLeads(c, root, id);
  for (let i = 0; i < 5; i++) await c.run("phase", id, "next");
  const waiting = await c.run("phase", id, "next");
  expect(waiting.err).toContain(
    "the user's approval of the spec: recorded by the validator in dontAsk mode and not counted",
  );
  write(root, ".crew/policy.json", JSON.stringify({ unattendedDecisions: "validator" }));
  expect((await c.run("policy", "accept")).code).toBe(0);
  expect((await c.json("phase", id, "next")).data.phase).toBe("build");
});

test("SP2a review: a hand-edited ledger reaches the verdict, not only the saving commands", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const id = (await c.json("start", "Gated sync", "--answers", answers, "--criterion", "a")).data
    .id as string;
  await c.json(
    "objection",
    id,
    "add",
    "re-subscribes everyone",
    "--by",
    "fault-finder",
    "--severity",
    "blocking",
  );
  write(root, "src/a.ts", "y");
  expect((await c.run("tdd", "red", id, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", id, "AC-1", "--", "exit 0")).code).toBe(0);
  expect((await c.json("gate", "run", id)).data.unproven).toEqual([
    "blocking objection O-1 open: re-subscribes everyone",
  ]);
  // Emptying the ledger by hand must not turn the item proven.
  writeFileSync(
    join(root, ".crew", "work", id, "objections.json"),
    JSON.stringify({ objections: [] }),
  );
  const status = await c.json("status");
  expect(status.data.verdict).toBe("unproven");
  expect(status.data.unproven).toContain("state changed outside the engine");
  expect((await c.run("accept", id)).code).toBe(0);
  expect((await c.json("status")).data.unproven).not.toContain("state changed outside the engine");
});

/** Two registered projects of one workspace, with the second's policy accepting what the test needs. */
function mailRepos(accept = ["question", "notice"]) {
  const env = testEnv();
  delete env.CLAUDE_CODE_SESSION_ID; // the registry records "cli" for a command run outside a hook
  const a = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const b = makeRepo({ "README.md": "# crm\n" });
  write(a, ".crew/policy.json", JSON.stringify({ mail: { workspace: "w", name: "storefront" } }));
  write(b, ".crew/policy.json", JSON.stringify({ mail: { workspace: "w", name: "crm", accept } }));
  const ca = io(a, env);
  const cb = io(b, env);
  return { env, a, b, ca, cb };
}

test("SP2c AC-9: crew mail send, inbox, read, reply and refuse through the command; status --json has mail; the report has a Mail section", async () => {
  const { a, b, env, ca, cb } = mailRepos();
  await ca.run("detect"); // registers storefront
  await cb.run("detect"); // registers crm
  // crm is live only when a session's hook registered it; a command's registration is not a session (SP2c 8a AC-3).
  const pb = repoPaths(b, env);
  registerProject(mailContext(pb, loadPolicy(pb).policy, env), "cli", { hook: true });
  const id = (await ca.json("start", "Loyalty tier", "--answers", answers, "--criterion", "a")).data
    .id as string;
  const sent = await ca.run(
    "mail",
    "send",
    "--to",
    "crm",
    "--type",
    "question",
    "Does POST /customers accept loyalty_tier?",
  );
  expect(sent.code).toBe(0);
  expect(sent.out).toMatch(
    /^sent M-\d{4}-\d{2}-\d{2}-001-storefront to crm \(workspace w\); live session \(session cli\): ring it if your harness lists it\n$/,
  );
  const mid = /sent (M-\S+) /.exec(sent.out)?.[1] as string;
  const refused = await ca.run(
    "mail",
    "send",
    "--to",
    "crm",
    "--type",
    "change-request",
    "Add the field",
  );
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(
    "refused: crm does not accept change-request (its policy accepts question, notice); recorded in the outbox as refused",
  );
  const inbox = await cb.run("mail", "inbox");
  expect(inbox.out).toBe(
    `Mail (w/crm, as session): 1 unread, 0 answered\n  ${mid} · [normal] · question · from storefront · Does POST /customers accept loyalty_tier? · sent\n`,
  );
  const read = await cb.run("mail", "read", mid);
  expect(read.out).toContain(
    `id: ${mid}\nfrom: storefront (session)\nto: crm\ntype: question\nsubject: Does POST /customers accept loyalty_tier?\nstatus: read\n`,
  );
  expect(read.out).toContain("\n\nDoes POST /customers accept loyalty_tier?\n");
  const replied = await cb.run("mail", "reply", mid, "Yes: gold, silver, none.");
  expect(replied.code).toBe(0);
  expect(replied.out).toMatch(
    new RegExp(`^replied to ${mid}: M-\\S+-001-crm to storefront; ${mid} done\\n$`),
  );
  // The sender sees the answer in its inbox and in the item's record.
  const theirs = await ca.run("mail", "inbox");
  expect(theirs.out).toContain("· Re: Does POST /customers accept loyalty_tier? · sent");
  const status = await ca.json("status");
  expect(status.data.mail).toEqual({ unread: 0, answered: 1, waiting: 0 });
  const mail = readProtectedJson<{ messages: { id: string; status: string }[] }>(
    repoPaths(a, ca.env),
    join(a, ".crew", "work", id, "mail.json"),
  );
  expect(mail.tampered).toBe(false);
  expect(
    mail.data?.messages.map((m) => [m.id.endsWith("-storefront") ? "sent" : "reply", m.status]),
  ).toEqual([
    ["sent", "done"],
    ["sent", "refused"],
    ["reply", "sent"],
  ]);
  // A body over 2 KB lives beside the inbox; `read` prints the whole of it, not the preview.
  const longBody = "L".repeat(2100);
  const longSent = await ca.run(
    "mail",
    "send",
    "--to",
    "crm",
    "--type",
    "question",
    "--subject",
    "Long one",
    longBody,
  );
  const longId = /sent (M-\S+) /.exec(longSent.out)?.[1] as string;
  const longRead = await cb.run("mail", "read", longId);
  expect(longRead.out).toContain(`\n\n${longBody}\n`);
  expect(longRead.out).not.toContain(`${"L".repeat(200)}...`);
  // `crew mail status` prunes a registered root that is gone.
  const registryFile = join(ca.env.WIZARDINGCODE_HOME as string, "crew", "projects.json");
  const registry = JSON.parse(readFileSync(registryFile, "utf8")) as {
    projects: Record<string, unknown>[];
  };
  registry.projects.push({
    root: "/nowhere/warehouse",
    name: "warehouse",
    workspace: "w",
    lastSeen: "2026-10-15T00:00:00.000Z",
    sessionId: "s",
  });
  writeFileSync(registryFile, JSON.stringify(registry));
  const mailStatus = await ca.json("mail", "status");
  expect(mailStatus.data.pruned).toEqual(["/nowhere/warehouse"]);
  expect(mailStatus.data.message).toContain("registry pruned: /nowhere/warehouse");
  expect(JSON.parse(readFileSync(registryFile, "utf8")).projects).toHaveLength(2);
  // Refuse the second question; the report lists every message with its status.
  const second = /sent (M-\S+) /.exec(
    (await ca.run("mail", "send", "--to", "crm", "--type", "question", "Second")).out,
  )?.[1] as string;
  // (a pipe in the reason: the report's table escapes it)
  expect(
    (await cb.run("mail", "refuse", second, "--reason", "not this sprint | maybe next")).out,
  ).toBe(`${second} refused: not this sprint | maybe next\n`);
  const report = (await ca.run("evidence", id)).out;
  expect(report).toContain(
    "## Mail\n\n| Message | Thread | At | Direction | With | Type | Priority | Subject | Status | Contracts |\n",
  );
  expect(report).toContain(`| ${mid} | `);
  expect(report).toContain(
    "| sent | crm | question | normal | Does POST /customers accept loyalty_tier? | done |",
  );
  expect(report).toContain(`| ${second} | `);
  expect(report).toContain(
    "| sent | crm | question | normal | Second | refused: not this sprint \\| maybe next |",
  );
  expect(report).toContain(
    "| received | crm | question | normal | Re: Does POST /customers accept loyalty_tier? | sent |",
  );
  // Usage and unknown flags.
  expect((await ca.run("mail")).err).toContain(
    "usage: crew mail send --to <project|.> --type question|change-request|notice|blocker",
  );
  expect((await ca.run("mail", "send", "--to", "crm", "hi")).err.trim()).toBe(
    'usage: crew mail send --to <project|.> --type question|change-request|notice|blocker [--priority blocker|high|normal|low] [--thread <root>] [--agent <session|T-n|role>] [--item <id>] [--reply-to <mid>] [--subject <text>] "<text>" [--file <path>]',
  );
  // A hand edit of the item's mail.json is tampering, and `crew accept <id>` re-trusts it like every other protected file of the item.
  const mailFile = join(a, ".crew", "work", id, "mail.json");
  writeFileSync(mailFile, JSON.stringify({ version: 1, messages: [] }));
  expect(readProtectedJson(repoPaths(a, ca.env), mailFile).tampered).toBe(true);
  // The report says so instead of rendering the hand-edited box as the engine's own.
  const tamperedReport = (await ca.run("evidence", id)).out;
  expect(tamperedReport).toContain(
    `## Mail\n\nmail.json changed outside the engine; the user accepts it with crew accept ${id}.`,
  );
  expect(tamperedReport).not.toContain("| Message | At |");
  const accepted = await ca.json("accept", id);
  expect(accepted.code).toBe(0);
  expect(accepted.data.files).toContain("mail.json");
  expect(readProtectedJson(repoPaths(a, ca.env), mailFile).tampered).toBe(false);
});

test("SP2c AC-9: crew start --origin answers a message of the inbox and refuses one in an inbox a hand changed", async () => {
  const { b, ca, cb } = mailRepos();
  await ca.run("detect");
  await cb.run("detect");
  const first = /sent (M-\S+) /.exec(
    (await ca.run("mail", "send", "--to", "crm", "--type", "question", "Which values?")).out,
  )?.[1] as string;
  expect((await cb.run("start", "x", "--answers", answers, "--origin", "M-nope")).err.trim()).toBe(
    "no message M-nope addressed to this session (crew mail inbox)",
  );
  const started = await cb.json(
    "start",
    "Answer the values",
    "--answers",
    answers,
    "--origin",
    first,
  );
  expect(started.code).toBe(0);
  const child = started.data.id as string;
  const work = readProtectedJson<{ origin?: { mail: string } }>(
    repoPaths(b, cb.env),
    join(b, ".crew", "work", child, "work.json"),
  );
  expect(work.data?.origin).toEqual({ mail: first });
  expect((await cb.run("mail", "inbox")).out).toContain(
    `${first} · [normal] · question · from storefront · Which values? · in-progress`,
  );
  const copy = readProtectedJson<{ messages: { id: string; status: string }[] }>(
    repoPaths(b, cb.env),
    join(b, ".crew", "work", child, "mail.json"),
  );
  expect(copy.data?.messages.map((m) => [m.id, m.status])).toEqual([[first, "in-progress"]]);
  // The inbox hand-edited: the second message is not trusted, and no item is created for it.
  const second = /sent (M-\S+) /.exec(
    (await ca.run("mail", "send", "--to", "crm", "--type", "question", "And the default?")).out,
  )?.[1] as string;
  const inboxFile = join(
    cb.env.WIZARDINGCODE_HOME as string,
    "crew",
    "mail",
    "w",
    "crm",
    "inbox.json",
  );
  const inbox = JSON.parse(readFileSync(inboxFile, "utf8")) as { messages: { subject: string }[] };
  (inbox.messages[1] as { subject: string }).subject = "FORGED";
  writeFileSync(inboxFile, JSON.stringify(inbox));
  const refused = await cb.run(
    "start",
    "Answer the default",
    "--answers",
    answers,
    "--origin",
    second,
  );
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(
    "crm's inbox changed outside the engine; files under the user's crew directory are written only by the crew command",
  );
  expect(readdirSync(join(b, ".crew", "work"))).toEqual([child]);
});

test("SP2c AC-9: crew await <id> role and mail record the wait and the message; status says so", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const id = (await c.json("start", "x", "--answers", answers, "--criterion", "a")).data
    .id as string;
  // (the JSON form carries `ok` and `message` beside the data, hence toMatchObject)
  expect((await c.json("await", id, "role")).data).toMatchObject({
    awaiting: "role",
    awaitingMessage: null,
  });
  expect((await c.run("status")).out).toContain("waiting for the roles");
  expect((await c.run("await", id, "mail")).err.trim()).toBe(
    "usage: crew await <id> user | role | mail <message id>",
  );
  expect((await c.json("await", id, "mail", "M-2026-10-15-001-crm")).data).toMatchObject({
    awaiting: "mail",
    awaitingMessage: "M-2026-10-15-001-crm",
  });
  const status = await c.json("status");
  expect(status.data.awaiting).toBe("mail");
  expect(status.data.awaitingMessage).toBe("M-2026-10-15-001-crm");
  expect((await c.run("status")).out).toContain("waiting for a reply to M-2026-10-15-001-crm");
  expect((await c.json("resume", id)).data).toMatchObject({
    awaiting: null,
    awaitingMessage: null,
  });
  expect((await c.run("await", id, "judge")).err.trim()).toBe(
    "usage: crew await <id> user | role | mail <message id>",
  );
});

test("SP2c AC-5: crew judgement record fills tokens from the engine's role records when the ruling leaves them at 0", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  // Two judgement gates on this item: ui-ux from the interface file, code-quality from the policy.
  write(root, ".crew/policy.json", JSON.stringify({ judgementGates: ["code-quality"] }));
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  await c.run("tdd", "red", id, "AC-1", "--", "exit 1");
  await c.run("tdd", "green", id, "AC-1", "--", "exit 0");
  await c.run("skip", id, "gate:e2e", "--reason", "no environment in the fixture");
  await c.run("gate", "run", id);
  const paths = repoPaths(root, c.env);
  const { evidence } = loadEvidence(paths, id);
  // The roles of this round stopped after the gate run cut the diff; a record from before the cut
  // belongs to an earlier round and counts for nothing, however recent it looks in the list.
  const cut = readReviewInputs(paths, id)?.at ?? "";
  const after = (s: number) => new Date(Date.parse(cut) + s * 1000).toISOString();
  const before = (s: number) => new Date(Date.parse(cut) - s * 1000).toISOString();
  const record = (
    agent: string,
    agentId: string,
    at: string,
    tokens: number,
    tokensFrom: "transcript" | "none" = "transcript",
  ) => ({
    agent,
    agentId,
    at,
    tokens,
    tokensFrom,
    file: agent === "judge" ? "review/ruling.json" : `review/${agent.slice(7)}.findings.md`,
  });
  evidence.roles = [
    record("review-ui-ux", "r1", after(1), 40000),
    record("review-code-quality", "r2", after(2), 30000),
    // A record whose tokens were never read counts for nothing: the read one before it stands.
    record("review-code-quality", "r3", after(3), 0, "none"),
    record("judge", "j", after(5), 70000),
    record("review-ui-ux", "r0", before(600), 999999),
  ];
  saveEvidence(paths, id, evidence);
  const file = join(root, ".crew", "work", id, "review", "ruling.json");
  const ruling = (gate: string, reviewer: string) => ({
    gate,
    verdict: "proven",
    reviewer,
    judge: "judge",
    findings: [],
    tokens: 0,
  });
  writeFileSync(
    file,
    JSON.stringify({
      rulings: [ruling("ui-ux", "review-ui-ux"), ruling("code-quality", "review-code-quality")],
    }),
  );
  // The judge's 70000 is shared by the two rulings recorded together: 35000 each.
  const recorded = await c.json("judgement", id, "record", "--ruling", file);
  expect(recorded.data.records).toMatchObject([
    { gate: "ui-ux", tokens: 75000 },
    { gate: "code-quality", tokens: 65000 },
  ]);
  const report = (await c.run("evidence", id)).out;
  expect(report).toContain("| ui-ux | proven | review-ui-ux | 0 | 75000 |");
  expect(report).toContain("| code-quality | proven | review-code-quality | 0 | 65000 |");
  // The judge ruled both gates, so its share is over both even when the session gave one gate's
  // number itself, which stands; an odd total rounds (test-quality review, round 2).
  const again = loadEvidence(paths, id).evidence;
  again.roles = [...(again.roles ?? []), record("judge", "j2", after(6), 70001)];
  saveEvidence(paths, id, again);
  writeFileSync(
    file,
    JSON.stringify({
      rulings: [
        { ...ruling("ui-ux", "review-ui-ux"), tokens: 500 },
        ruling("code-quality", "review-code-quality"),
      ],
    }),
  );
  expect((await c.json("judgement", id, "record", "--ruling", file)).data.records).toMatchObject([
    { gate: "ui-ux", tokens: 500 },
    { gate: "code-quality", tokens: 65001 },
  ]);
  // No role record at all: the tokens stay at 0 rather than being invented.
  const none = loadEvidence(paths, id).evidence;
  none.roles = [];
  saveEvidence(paths, id, none);
  writeFileSync(
    file,
    JSON.stringify({
      rulings: [ruling("ui-ux", "review-ui-ux"), ruling("code-quality", "review-code-quality")],
    }),
  );
  expect((await c.json("judgement", id, "record", "--ruling", file)).data.records).toMatchObject([
    { gate: "ui-ux", tokens: 0 },
    { gate: "code-quality", tokens: 0 },
  ]);
  // Only the judge went through the hook: its share alone is recorded.
  const judgeOnly = loadEvidence(paths, id).evidence;
  judgeOnly.roles = [record("judge", "j3", after(7), 70001)];
  saveEvidence(paths, id, judgeOnly);
  expect((await c.json("judgement", id, "record", "--ruling", file)).data.records).toMatchObject([
    { gate: "ui-ux", tokens: 35001 },
    { gate: "code-quality", tokens: 35001 },
  ]);
  // A gate that could not run takes no tokens, with records to take from; a number the session gave stands.
  const full = loadEvidence(paths, id).evidence;
  full.roles = [
    record("review-ui-ux", "r4", after(8), 40000),
    record("judge", "j4", after(9), 70000),
  ];
  saveEvidence(paths, id, full);
  const notRun = await c.json(
    "judgement",
    id,
    "record",
    "ui-ux",
    "--not-run",
    "--reason",
    "no browser",
  );
  expect(notRun.data.records).toMatchObject([{ gate: "ui-ux", verdict: "not-run" }]);
  expect((notRun.data.records as { tokens?: number }[])[0]?.tokens ?? 0).toBe(0);
  writeFileSync(
    file,
    JSON.stringify({ rulings: [{ gate: "ui-ux", verdict: "proven", findings: [], tokens: 123 }] }),
  );
  expect((await c.json("judgement", id, "record", "--ruling", file)).data.records).toMatchObject([
    { tokens: 123 },
  ]);
}, 30_000);

test("SP7a AC-4: crew team prints the seats with their reasons and records them; the gate run and the status carry them; the report has the Team table", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const c = io(root, env);
  const id = (
    await c.json(
      "start",
      "Refactor the module",
      "--answers",
      JSON.stringify({ ...JSON.parse(answers), scope: 1 }),
      "--criterion",
      "a",
    )
  ).data.id as string;
  const team = await c.run("team", id);
  expect(team.code).toBe(0);
  expect(team.out).toContain(`Team of ${id} (primary backend):`);
  expect(team.out).toContain("researcher (standard route)");
  expect(team.out).toContain("lead-qa (standard route)");
  expect(team.out).toContain("judge (a gate is planned)");
  expect(team.out).not.toContain("review-architecture");
  expect(loadWork(repoPaths(root, env), id).work?.seats?.map((s) => s.role)).toEqual([
    "researcher",
    "review-code-quality",
    "review-test-quality",
    "lead-qa",
    "lead-security",
    "judge",
  ]);
  expect(loadWork(repoPaths(root, env), id).work?.primaryTeam).toBe("backend");
  const status = await c.json("status");
  expect((status.data.team as { role: string }[]).map((s) => s.role)).toContain("lead-security");
  expect(status.data.primaryTeam).toBe("backend");
  expect(status.data.rounds).toEqual({ judgement: 0, validation: 0 });
  // The gate run records the seats too, from the paths the change touched.
  write(root, "src/App.vue", "<template />");
  await c.run("skip", id, "gate:e2e", "--reason", "no environment in the fixture");
  await c.run("gate", "run", id);
  const after = loadWork(repoPaths(root, env), id).work;
  expect(after?.seats?.map((s) => s.role)).toContain("review-ui-ux");
  expect(after?.primaryTeam).toBe("frontend");
  const report = (await c.run("evidence", id)).out;
  expect(report).toContain("## Team");
  expect(report).toContain("| Seat | Team | Reason |");
  expect(report).toContain("| lead-qa | qa | standard route |");
  expect(report).toContain("- Rounds: judgement 0 of 2, validation 0 of 2");
  // A fast item with no change yet seats nobody, and says so (the earlier change committed first).
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "the interface file");
  const fast = (await c.json("start", "Fix a", "--answers", answers, "--criterion", "a")).data
    .id as string;
  expect((await c.run("team", fast)).out.trim()).toBe(`Team of ${fast}: no seat (fast route)`);
});

test("SP7a AC-5: a third judgement round is refused; the user continues it once and the record says so; the cap only tightens", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    ".crew/policy.json": JSON.stringify({ team: { maxJudgementRounds: 3 } }),
  });
  const env = testEnv();
  const c = io(root, env);
  // 3 is above the default: the policy only tightens, so the cap reads 2.
  expect(loadPolicy(repoPaths(root, env)).policy.team.maxJudgementRounds).toBe(2);
  const id = (
    await c.json(
      "start",
      "Refactor the module",
      "--answers",
      JSON.stringify({ ...JSON.parse(answers), scope: 1 }),
      "--criterion",
      "a",
    )
  ).data.id as string;
  write(root, "src/a.ts", "y");
  await c.run("gate", "run", id);
  const file = `.crew/work/${id}/review/ruling.json`;
  const ruling = (verdict: "proven" | "not-proven") =>
    JSON.stringify({
      rulings: [
        {
          gate: "code-quality",
          verdict,
          findings:
            verdict === "proven"
              ? []
              : [{ file: "src/a.ts", line: 1, text: "a magic value", severity: "defect" }],
          tokens: 1,
        },
        { gate: "test-quality", verdict: "proven", findings: [], tokens: 1 },
      ],
    });
  write(root, file, ruling("not-proven"));
  expect((await c.run("judgement", id, "record", "--ruling", file)).out).toContain(
    "code-quality: not proven (1 finding)",
  );
  // A record on the same code is the same round: a not-run beside a ruling, or a ruling re-filed.
  expect((await c.run("judgement", id, "record", "--ruling", file)).code).toBe(1);
  expect(loadWork(repoPaths(root, env), id).work?.rounds).toMatchObject({
    judgement: 1,
    validation: 0,
  });
  // The code changes after the first round's defects: the second round.
  write(root, "src/a.ts", "y2");
  await c.run("gate", "run", id);
  write(root, file, ruling("not-proven"));
  expect((await c.run("judgement", id, "record", "--ruling", file)).out).toContain(
    "code-quality: not proven (1 finding)",
  );
  expect(loadWork(repoPaths(root, env), id).work?.rounds).toMatchObject({
    judgement: 2,
    validation: 0,
  });
  // A third state of the code: the third round is refused, and nothing is recorded.
  write(root, "src/a.ts", "y3");
  await c.run("gate", "run", id);
  write(root, file, ruling("proven"));
  const third = await c.run("judgement", id, "record", "--ruling", file);
  expect(third.code).toBe(1);
  expect(third.err.trim()).toBe(
    `judgement round 3 of ${id}: the policy allows 2 (team.maxJudgementRounds); the user continues it once with crew continue ${id} judgement, or decides (crew skip <id> gate:<gate> where policy.json allows it)`,
  );
  expect(loadWork(repoPaths(root, env), id).work?.rounds).toMatchObject({
    judgement: 2,
    validation: 0,
  });
  // The user's continuation, relayed: one more round, recorded as theirs.
  const granted = await c.run("continue", id, "judgement");
  expect(granted.code).toBe(0);
  expect(granted.out.trim()).toBe(
    `judgement of ${id} continued for one more round by the user, relayed by the agent`,
  );
  expect(loadWork(repoPaths(root, env), id).work?.continued?.[0]).toMatchObject({
    what: "judgement",
    by: { by: "user", relayed: true },
  });
  expect((await c.run("judgement", id, "record", "--ruling", file)).out).toContain(
    "code-quality: proven (0 findings)",
  );
  expect(loadWork(repoPaths(root, env), id).work?.rounds).toMatchObject({
    judgement: 3,
    validation: 0,
  });
  // The continuation bought one round, not the cap: a fourth state of the code is refused again.
  write(root, "src/a.ts", "y4");
  await c.run("gate", "run", id);
  write(root, file, ruling("proven"));
  const fourth = await c.run("judgement", id, "record", "--ruling", file);
  expect(fourth.code).toBe(1);
  expect(fourth.err.trim()).toBe(
    `judgement round 4 of ${id}: the policy allows 2 (team.maxJudgementRounds); the user continues it once with crew continue ${id} judgement, or decides (crew skip <id> gate:<gate> where policy.json allows it)`,
  );
  expect(loadWork(repoPaths(root, env), id).work?.rounds).toMatchObject({
    judgement: 3,
    validation: 0,
  });
  expect((await c.run("evidence", id)).out).toContain(
    "- Rounds: judgement 3 of 2, validation 0 of 2",
  );
  // A continuation of something else, or with no item, is refused with the usage.
  expect((await c.run("continue", id, "rounds")).err.trim()).toBe(
    "usage: crew continue <id> judgement | crew continue <id> validation | crew continue <id> gate T-n",
  );
});

/** A lead's `validated` file for the item, written where the hook would save it. */
function leadFile(root: string, id: string, lead: string, body?: string): string {
  const text =
    body ??
    `# ${lead} validation of ${id}: spec\nverdict: validated\n## Returns\n- none\n## Notes\n- holds\n`;
  write(root, `.crew/work/${id}/conclave/${lead}.md`, text);
  return `.crew/work/${id}/conclave/${lead}.md`;
}

/** Records every lead seat's validation of the spec, as the method asks before the plan (SP7a). */
async function validateLeads(c: ReturnType<typeof io>, root: string, id: string): Promise<void> {
  const seats = (await c.json("team", id)).data.seats as { role: string; kind: string }[];
  for (const seat of seats.filter((s) => s.kind === "lead")) {
    const recorded = await c.run(
      "validation",
      id,
      "record",
      "--what",
      "spec",
      "--by",
      seat.role,
      "--file",
      leadFile(root, id, seat.role),
    );
    if (recorded.code !== 0) throw new Error(recorded.err || recorded.out);
  }
}

test("SP7a-Task6 AC-1: crew profile set testScoped stores a confirmed scoped test template and refuses one without {files}", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const c = io(root, env);
  await c.run("detect");
  expect((await c.run("profile", "set", "testScoped", "vitest related --run")).err.trim()).toBe(
    "a scoped test command names where the files go: {files}",
  );
  const set = await c.run("profile", "set", "testScoped", "vitest related {files} --run");
  expect(set.code).toBe(0);
  expect(set.out.trim()).toBe("testScoped for . set and confirmed: vitest related {files} --run");
  expect(loadProfile(repoPaths(root, env)).profile?.targets[0]?.testScoped).toEqual({
    command: "vitest related {files} --run",
    source: "confirmed",
  });
});

test("SP7a-Task5 AC-2: every decision taken or recorded lands in the project's register; crew decisions lists it; crew start counts it; the file is protected", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const c = io(root, env);
  expect((await c.run("decisions")).out.trim()).toBe("the register is empty");
  const id = (
    await c.json(
      "start",
      "Refactor the module",
      "--answers",
      JSON.stringify({ ...JSON.parse(answers), scope: 1 }),
      "--criterion",
      "a",
    )
  ).data.id as string;
  await c.run("decision", id, "add", "Erasure or deactivation?", "--default", "deactivation");
  expect((await c.run("decide", id, "D-1", "deactivation")).code).toBe(0);
  await c.run(
    "objection",
    id,
    "add",
    "No index on the new column",
    "--by",
    "fault-finder",
    "--severity",
    "advisory",
  );
  await c.run(
    "objection",
    id,
    "add",
    "Rows lost on restore",
    "--by",
    "fault-finder",
    "--severity",
    "blocking",
  );
  expect(
    (await c.run("objection", id, "waive", "O-1", "--reason", "the table is small")).code,
  ).toBe(0);
  expect((await c.run("objection", id, "resolve", "O-2", "--criterion", "AC-1")).code).toBe(0);
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1 a\n");
  write(
    root,
    `.crew/work/${id}/conclave.md`,
    "# Gap round\n\n## Assumed by good practice\n- none\n\n## Decisions only the user can make\n- D-1\n\n## Proposals\n- none\n\n## Warnings\n- none\n",
  );
  for (let i = 0; i < 3; i++) await c.run("phase", id, "next");
  expect((await c.run("approve", id, "spec", "--validator", "complete-gap-round")).code).toBe(0);
  const returned = `# security lead's validation of ${id}: spec\nverdict: returned\n## Returns\n- R-1 · spec.md:4 · AC-1 is not observable\n## Notes\n- none\n`;
  expect(
    (
      await c.run(
        "validation",
        id,
        "record",
        "--what",
        "spec",
        "--by",
        "lead-security",
        "--file",
        leadFile(root, id, "lead-security", returned),
      )
    ).code,
  ).toBe(0);
  expect((await c.run("continue", id, "validation")).code).toBe(0);
  write(root, "src/a.ts", "y");
  await c.run("gate", "run", id);
  const rulingFile = `.crew/work/${id}/review/ruling.json`;
  write(
    root,
    rulingFile,
    JSON.stringify({
      rulings: [
        {
          gate: "code-quality",
          verdict: "not-proven",
          findings: [
            { file: "src/a.ts", line: 1, text: "a magic value", severity: "defect" },
            { file: "src/a.ts", line: 2, text: "a long name", severity: "advisory" },
            { file: "src/elsewhere.ts", line: 9, text: "old debt", severity: "defect" },
          ],
          tokens: 1,
        },
        { gate: "test-quality", verdict: "proven", findings: [], tokens: 1 },
      ],
    }),
  );
  await c.run("judgement", id, "record", "--ruling", rulingFile);
  const listed = await c.run("decisions");
  const lines = listed.out.split("\n").filter((l) => l.includes(" · "));
  expect(lines.length).toBe(7);
  // Newest first: the ruling's defect inside the change, and nothing for its advisory or its debt outside.
  expect(lines[0]).toBe(
    `${new Date().toISOString().slice(0, 10)} · ${id} · ruling · code-quality defect: src/a.ts:1 a magic value (by the judge)`,
  );
  expect(listed.out).toContain(
    `${id} · decision · D-1 Erasure or deactivation? → deactivation (by the user, relayed by the agent)`,
  );
  expect(listed.out).toContain(
    `${id} · objection · O-1 No index on the new column → waived: the table is small (by the user, relayed by the agent)`,
  );
  expect(listed.out).toContain(
    `${id} · objection · O-2 Rows lost on restore → resolved by AC-1 (by the engine)`,
  );
  expect(listed.out).toContain(
    `${id} · approval · spec approved (by the validator (rule: complete-gap-round))`,
  );
  expect(listed.out).toContain(
    `${id} · validation · spec returned by lead-security: 1 return (by lead-security)`,
  );
  expect(listed.out).toContain(
    `${id} · continue · validation continued for one more round (by the user, relayed by the agent)`,
  );
  expect(
    (await c.run("decisions", "--grep", "index")).out.split("\n").filter((l) => l.includes(" · "))
      .length,
  ).toBe(1);
  expect((await c.run("decisions", "--grep", "zzz")).out.trim()).toBe("no entry matches zzz");
  const entries = (await c.json("decisions", "--json")).data.entries as {
    kind: string;
    file?: string;
  }[];
  expect(entries.length).toBe(7);
  // The ruling's entry carries the ruling's file, the returned validation's the lead's file.
  expect(entries.find((e) => e.kind === "ruling")?.file).toBe(
    `.crew/work/${id}/review/ruling.json`,
  );
  expect(entries.find((e) => e.kind === "validation")?.file).toBe("conclave/lead-security.md");
  expect(entries.find((e) => e.kind === "decision")?.file).toBeUndefined();
  const second = await c.run("start", "Another change", "--answers", answers, "--criterion", "b");
  expect(second.out).toContain("decision register: 7 entries (crew decisions)");
  // The register is the engine's: a hand edit is refused until the user accepts it.
  write(root, ".crew/decisions.json", JSON.stringify({ version: 1, entries: [] }));
  const tampered = await c.run("decisions");
  expect(tampered.code).toBe(1);
  expect(tampered.err).toContain("decisions.json");
  expect(tampered.err).toContain("crew accept decisions");
  expect((await c.run("accept", "decisions")).code).toBe(0);
  expect((await c.run("decisions")).out.trim()).toBe("the register is empty");
});

test("SP7a AC-3: crew validation record parses the lead's file, refuses a lead not seated and a contradiction, caps the rounds, and the plan waits for it", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const c = io(root, env);
  const id = (
    await c.json(
      "start",
      "Refactor the module",
      "--answers",
      JSON.stringify({ ...JSON.parse(answers), scope: 1 }),
      "--criterion",
      "a",
    )
  ).data.id as string;
  // crew start on standard and full records the seats, so the guard can name the leads.
  expect(loadWork(repoPaths(root, env), id).work?.seats?.map((s) => s.role)).toContain("lead-qa");
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1 a\n");
  write(
    root,
    `.crew/work/${id}/conclave.md`,
    "# Gap round\n\n## Assumed by good practice\n- none\n\n## Decisions only the user can make\n- none\n\n## Proposals\n- none\n\n## Warnings\n- none\n",
  );
  await c.run("phase", id, "next"); // understand
  await c.run("phase", id, "next"); // specify
  await c.run("phase", id, "next"); // conclave
  await c.run("approve", id, "spec", "--validator", "complete-gap-round");
  const blocked = await c.run("phase", id, "next");
  expect(blocked.code).toBe(1);
  expect(blocked.err).toContain("validation of spec by lead-qa (crew validation");
  // A lead the item did not seat.
  expect(
    (
      await c.run(
        "validation",
        id,
        "record",
        "--what",
        "spec",
        "--by",
        "lead-etl",
        "--file",
        leadFile(root, id, "lead-etl"),
      )
    ).err.trim(),
  ).toBe(`lead-etl is not a seat of ${id} (crew team ${id} prints the seats)`);
  // A missing file, then a contradiction.
  expect(
    (
      await c.run(
        "validation",
        id,
        "record",
        "--what",
        "spec",
        "--by",
        "lead-qa",
        "--file",
        "nowhere.md",
      )
    ).err.trim(),
  ).toBe(`no validation file at ${join(root, "nowhere.md")}`);
  const bad = leadFile(
    root,
    id,
    "lead-qa",
    `# lead-qa validation of ${id}: spec\nverdict: validated\n## Returns\n- R-1 · spec.md:3 · unclear\n## Notes\n- none\n`,
  );
  const contradiction = await c.run(
    "validation",
    id,
    "record",
    "--what",
    "spec",
    "--by",
    "lead-qa",
    "--file",
    bad,
  );
  expect(contradiction.code).toBe(1);
  expect(contradiction.err).toContain("validated with 1 open return");
  expect(
    (
      await c.run(
        "validation",
        id,
        "record",
        "--what",
        "spec",
        "--by",
        "lead-qa",
        "--file",
        leadFile(root, id, "lead-qa"),
      )
    ).out.trim(),
  ).toBe("validation of spec by lead-qa: validated (round 1)");
  const returned = `# lead-security validation of ${id}: spec\nverdict: returned\n## Returns\n- R-1 · spec.md:4 · AC-1 is not observable\n## Notes\n- none\n`;
  expect(
    (
      await c.run(
        "validation",
        id,
        "record",
        "--what",
        "spec",
        "--by",
        "lead-security",
        "--file",
        leadFile(root, id, "lead-security", returned),
      )
    ).out.trim(),
  ).toBe("validation of spec by lead-security: returned, 1 return (round 1)");
  expect((await c.run("phase", id, "next")).err).toContain(
    "validation of spec by lead-security: returned 1 return",
  );
  // The spec revised: round 2; validated by both; the plan opens.
  write(
    root,
    `.crew/work/${id}/spec.md`,
    "# Spec\n\n## Acceptance criteria\n- AC-1 a, observed as b\n",
  );
  expect(
    (
      await c.run(
        "validation",
        id,
        "record",
        "--what",
        "spec",
        "--by",
        "lead-qa",
        "--file",
        leadFile(root, id, "lead-qa"),
      )
    ).out.trim(),
  ).toBe("validation of spec by lead-qa: validated (round 2)");
  expect(
    (
      await c.run(
        "validation",
        id,
        "record",
        "--what",
        "spec",
        "--by",
        "lead-security",
        "--file",
        leadFile(root, id, "lead-security"),
      )
    ).code,
  ).toBe(0);
  expect((await c.run("phase", id, "next")).code).toBe(0);
  expect(loadWork(repoPaths(root, env), id).work?.rounds).toMatchObject({
    judgement: 0,
    validation: 2,
  });
  // A third spec version is a third round: refused until the user continues.
  write(
    root,
    `.crew/work/${id}/spec.md`,
    "# Spec\n\n## Acceptance criteria\n- AC-1 a, observed as c\n",
  );
  const third = await c.run(
    "validation",
    id,
    "record",
    "--what",
    "spec",
    "--by",
    "lead-qa",
    "--file",
    leadFile(root, id, "lead-qa"),
  );
  expect(third.err.trim()).toBe(
    `validation round 3 of ${id}: the policy allows 2 (team.maxValidationRounds); the user continues it once with crew continue ${id} validation, or decides`,
  );
  expect((await c.run("continue", id, "validation")).code).toBe(0);
  expect(
    (
      await c.run(
        "validation",
        id,
        "record",
        "--what",
        "spec",
        "--by",
        "lead-qa",
        "--file",
        leadFile(root, id, "lead-qa"),
      )
    ).out.trim(),
  ).toBe("validation of spec by lead-qa: validated (round 3)");
  // Plan and delivery validations carry their own round by hash and spend no spec round.
  const planFile = (n: number) =>
    leadFile(
      root,
      id,
      `lead-qa-plan-${n}`,
      `# qa lead's validation of ${id}: plan\nverdict: validated\n## Returns\n- none\n## Notes\n- holds\n`,
    );
  expect(
    (
      await c.run(
        "validation",
        id,
        "record",
        "--what",
        "plan",
        "--by",
        "lead-qa",
        "--file",
        planFile(1),
      )
    ).out.trim(),
  ).toBe("validation of plan by lead-qa: validated (round 1)");
  write(root, `.crew/work/${id}/plan.md`, "# Plan\n\n1. AC-1\n");
  expect(
    (
      await c.run(
        "validation",
        id,
        "record",
        "--what",
        "plan",
        "--by",
        "lead-qa",
        "--file",
        planFile(2),
      )
    ).out.trim(),
  ).toBe("validation of plan by lead-qa: validated (round 2)");
  const deliveryFile = leadFile(
    root,
    id,
    "lead-qa.delivery",
    `# qa lead's validation of ${id}: delivery\nverdict: validated\n## Returns\n- none\n## Notes\n- holds\n`,
  );
  for (let i = 0; i < 2; i++)
    expect(
      (
        await c.run(
          "validation",
          id,
          "record",
          "--what",
          "delivery",
          "--by",
          "lead-qa",
          "--file",
          deliveryFile,
        )
      ).out.trim(),
    ).toBe("validation of delivery by lead-qa: validated (round 1)");
  expect(loadWork(repoPaths(root, env), id).work?.rounds).toMatchObject({
    judgement: 0,
    validation: 3,
  });
  const report = (await c.run("evidence", id)).out;
  expect(report).toContain("## Validations");
  expect(report).toContain("| What | By | Verdict | Returns | Round | File |");
  expect(report).toContain("| plan | lead-qa | validated | 0 | 2 | conclave/lead-qa-plan-2.md |");
  expect(report).toContain(
    "| delivery | lead-qa | validated | 0 | 1 | conclave/lead-qa.delivery.md |",
  );
  expect(report).toContain(
    "| spec | lead-security | returned | 1 | 1 | conclave/lead-security.md |",
  );
  expect(
    (
      await c.run("validation", id, "record", "--what", "brief", "--by", "lead-qa", "--file", "x")
    ).err.trim(),
  ).toBe(
    "usage: crew validation <id> record --what spec|plan|delivery --by lead-<team> --file <path>",
  );
});

test("SP7a AC-4: crew metrics counts the records of a project and of a workspace, and cto record files the plan under the workspace", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    ".crew/policy.json": JSON.stringify({ mail: { workspace: "w", name: "a" } }),
  });
  const env = testEnv();
  const c = io(root, env);
  await c.run("detect");
  const id = (await c.json("start", "Fix a", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/a.ts", "y");
  await c.run("tdd", "red", id, "AC-1", "--", "exit 1");
  await c.run("tdd", "green", id, "AC-1", "--", "exit 0");
  expect((await c.run("gate", "run", id)).code).toBe(0);
  const metrics = await c.json("metrics");
  expect(metrics.code).toBe(0);
  expect(metrics.data.items).toMatchObject({
    total: 1,
    byRoute: { fast: 1 },
    byType: { chore: 1 },
    byKind: { feature: 1 },
  });
  expect(metrics.data.rounds).toEqual({ judgement: 0, validation: 0, gate: 0 });
  expect(metrics.data.gates).toMatchObject({ notRun: 0, skipped: 0 });
  expect(metrics.data.decisions).toEqual({ total: 0, byUser: 0, byValidator: 0, byAgent: 0 });
  expect(typeof (metrics.data.phaseMinutes as Record<string, number>).build).toBe("number");
  expect((await c.run("metrics")).out).toContain("items: 1 (fast 1; feature 1)");
  // A worktree of a registered project is not a project of its own: the workspace counts it once.
  const registryFile = join(repoPaths(root, env).userDir, "projects.json");
  const registry = JSON.parse(readFileSync(registryFile, "utf8")) as { projects: unknown[] };
  registry.projects.push({
    root: `${root}-wt`,
    name: "a",
    workspace: "w",
    lastSeen: new Date().toISOString(),
    sessionId: "s2",
    worktreeOf: root,
  });
  writeFileSync(registryFile, JSON.stringify(registry));
  const byWorkspace = await c.json("metrics", "--workspace", "w");
  expect(byWorkspace.data.projects).toEqual([root]);
  expect((await c.run("metrics", "--workspace", "nope")).err.trim()).toBe(
    "no project of workspace nope is registered (crew detect in each project)",
  );
  write(
    root,
    "cto-plan.md",
    "# CTO plan for w, 2026-10-17\n## Keep\n- the fast route\n## Change\n- nothing yet\n## Measure\n- cost per item\n",
  );
  const filed = await c.run("cto", "record", "--workspace", "w", "--file", "cto-plan.md");
  expect(filed.code).toBe(0);
  expect(filed.out.trim()).toMatch(
    /^CTO plan of w filed: .*\/crew\/cto\/w\/\d{4}-\d{2}-\d{2}-plan\.md$/,
  );
  const filedPath = filed.out.trim().replace("CTO plan of w filed: ", "");
  expect(readFileSync(filedPath, "utf8")).toContain("## Change");
  expect((await c.run("cto", "record", "--file", "cto-plan.md")).err.trim()).toBe(
    "usage: crew cto record --workspace <ws> --file <plan.md>",
  );
  expect(
    (await c.run("cto", "record", "--workspace", "w", "--file", "missing.md")).err.trim(),
  ).toBe(`no plan file at ${join(root, "missing.md")}`);
  // The workspace names a folder under the user's crew directory: a name that is not a name is refused.
  for (const bad of ["../x", "a/b", "Shop Floor"])
    expect(
      (await c.run("cto", "record", "--workspace", bad, "--file", "cto-plan.md")).err.trim(),
    ).toBe(
      `a workspace is a lowercase name of letters, digits, dot, dash and underscore, up to 64 characters, not ${bad}`,
    );
});

test("SP7a AC-7 (Task 7): crew status --json carries the todo, the roles working and the branch; the text names them in order; no git repository means no branch; a long branch is cut", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const c = io(root, env);
  const id = (await c.json("start", "Fix a", "--answers", answers, "--criterion", "a")).data
    .id as string;
  const branch = git(root, "rev-parse", "--abbrev-ref", "HEAD").trim();
  const empty = await c.json("status");
  expect(empty.data.branch).toBe(branch);
  expect(empty.data.todo).toEqual({ done: 0, total: 0, items: [] });
  expect(empty.data.working).toEqual([]);
  const emptyText = (await c.run("status")).out.split("\n");
  expect(emptyText[2]).toBe(`  branch ${branch}`);
  expect(emptyText.join("\n")).not.toContain("  todo ");
  expect(emptyText.join("\n")).not.toContain("  working:");
  // One todo noted, gated and briefed; one record from 0.5.x, saved without a state.
  await c.run(
    "task",
    id,
    "note",
    "T-1",
    "--criteria",
    "AC-1",
    "--scope",
    "src/a.ts",
    "--text",
    "AC-1 inline",
  );
  expect((await c.run("task", id, "gate", "T-1")).code).toBe(0);
  expect((await c.run("task", id, "brief", "T-1")).code).toBe(0);
  const paths = repoPaths(root, env);
  const loaded = loadWork(paths, id).work;
  if (!loaded) throw new Error("no work");
  loaded.tasks = [
    ...(loaded.tasks ?? []),
    {
      task: "T-2",
      message: "M-2",
      criteria: ["AC-1"],
      text: "an older record",
      branch: "crew/x/T-2",
      worktree: "",
      openedAt: new Date().toISOString(),
    },
  ];
  saveWork(paths, loaded);
  recordWorking(paths, {
    agent: "review-security",
    team: "security",
    since: new Date().toISOString(),
    sessionId: "s",
    description: "Review the diff",
  });
  recordWorking(paths, {
    agent: "judge",
    team: null,
    since: new Date().toISOString(),
    sessionId: "s",
  });
  const status = await c.json("status");
  expect(status.data.todo).toEqual({
    done: 1,
    total: 2,
    items: [
      { task: "T-1", criteria: ["AC-1"], state: "briefed", inline: true },
      { task: "T-2", criteria: ["AC-1"], state: "open", inline: false },
    ],
  });
  expect(status.data.working).toEqual([
    {
      agent: "review-security",
      team: "security",
      since: expect.any(String),
      description: "Review the diff",
    },
    { agent: "judge", team: null, since: expect.any(String) },
  ]);
  const lines = (await c.run("status")).out.split("\n");
  expect(lines.slice(1, 5)).toEqual([
    "  phase build, route fast, kind feature, priority normal",
    `  branch ${branch}`,
    "  todo 1/2 briefed (T-1 briefed, T-2 open)",
    "  working: review-security (Review the diff), judge",
  ]);
  // A branch named with 200 characters is cut at 120, in the JSON and in the line alike.
  git(root, "checkout", "-q", "-b", "b".repeat(200));
  const long = await c.json("status");
  expect((long.data.branch as string).length).toBe(120);
  expect(long.data.branch as string).toMatch(/^b{119}…$/);
  expect((await c.run("status")).out.split("\n")[2]).toBe(`  branch ${"b".repeat(119)}…`);
  // No git repository: no branch, and no line about one.
  const plain = tempDir();
  write(plain, "package.json", JSON.stringify({ scripts: { test: "exit 0" } }));
  write(plain, "src/a.ts", "x");
  write(plain, ".crew/policy.json", "{}");
  const p = io(plain, env);
  await p.run("detect");
  const started = await p.json("start", "Fix a", "--answers", answers, "--criterion", "a");
  expect(started.code).toBe(0);
  const bare = await p.json("status");
  expect(bare.data.branch).toBeNull();
  expect((await p.run("status")).out).not.toContain("  branch ");
});

// ---------------------------------------------------------------------------------------------
// SP7b Task 1: priorities and statuses

function crmInboxDir(env: NodeJS.ProcessEnv): string {
  return join(env.WIZARDINGCODE_HOME as string, "crew", "mail", "w", "crm");
}

test("SP7b AC-1: crew mail accept confirms or lowers a priority with a reason, refuses an invalid value before any write, and crew mail read shows the decision", async () => {
  const { env, ca, cb } = mailRepos(["question", "notice", "change-request", "blocker"]);
  await ca.run("detect");
  await cb.run("detect");
  const mid = /sent (M-\S+) /.exec(
    (
      await ca.run(
        "mail",
        "send",
        "--to",
        "crm",
        "--type",
        "change-request",
        "--priority",
        "high",
        "Add the field",
      )
    ).out,
  )?.[1] as string;
  const file = join(crmInboxDir(env), "inbox.json");
  const bytes = readFileSync(file);
  const bad = await cb.run("mail", "accept", mid, "--priority", "urgent");
  expect(bad.code).toBe(1);
  expect(bad.err.trim()).toBe("priority is one of blocker, high, normal, low, not urgent");
  expect(readFileSync(file).equals(bytes)).toBe(true);
  const lowered = await cb.run(
    "mail",
    "accept",
    mid,
    "--priority",
    "normal",
    "--reason",
    "no client flow is down",
  );
  expect(lowered.code).toBe(0);
  expect(lowered.out).toBe(`${mid} accepted at normal (proposed high): no client flow is down\n`);
  const read = await cb.run("mail", "read", mid);
  expect(read.out).toContain(
    "priority: normal (proposed high, lowered by session: no client flow is down)\n",
  );
  expect(read.out).toContain("status: accepted\n");
  expect((await cb.run("mail", "inbox")).out).toContain(
    `${mid} · [normal] · change-request · from storefront · Add the field · accepted`,
  );
});

test("SP7b AC-3: the default inbox lists what is open and the originals done, hides a done reply and a refused message, and leaves a 0.6.0 record's bytes alone", async () => {
  const { env, ca, cb } = mailRepos(["question", "notice", "change-request", "blocker"]);
  await ca.run("detect");
  await cb.run("detect");
  const sendCr = async (text: string) =>
    /sent (M-\S+) /.exec(
      (await ca.run("mail", "send", "--to", "crm", "--type", "change-request", text)).out,
    )?.[1] as string;
  const m1 = await sendCr("Accepted one");
  const m2 = await sendCr("In progress one");
  const m3 = await sendCr("Blocked one");
  const m4 = await sendCr("Refused one");
  const q = /sent (M-\S+) /.exec(
    (await ca.run("mail", "send", "--to", "crm", "--type", "question", "Old answered")).out,
  )?.[1] as string;
  expect((await cb.run("mail", "accept", m1)).code).toBe(0);
  expect((await cb.json("start", "Two", "--answers", answers, "--origin", m2)).code).toBe(0);
  const third = (await cb.json("start", "Three", "--answers", answers, "--origin", m3)).data
    .id as string;
  expect((await cb.run("await", third, "user")).code).toBe(0);
  expect((await cb.run("mail", "refuse", m4, "--reason", "no")).code).toBe(0);
  // A 0.6.0 engine's spelling on an original, and a reply at done, written as the engine writes a box.
  const dir = crmInboxDir(env);
  const box = readBox(dir, "inbox").box;
  const original = box.messages.find((m) => m.id === q) as Message;
  (original as { status: string }).status = "answered";
  box.messages.push({
    ...original,
    id: "M-2026-01-01-009-storefront",
    subject: "Re: Old answered",
    replyTo: q,
    status: "done",
  });
  writeBox(dir, "inbox", box);
  const bytes = readFileSync(join(dir, "inbox.json"));
  const listed = (await cb.run("mail", "inbox")).out;
  expect(listed).toContain(
    `${m1} · [normal] · change-request · from storefront · Accepted one · accepted`,
  );
  expect(listed).toContain(
    `${m2} · [normal] · change-request · from storefront · In progress one · in-progress`,
  );
  expect(listed).toContain(
    `${m3} · [normal] · change-request · from storefront · Blocked one · blocked`,
  );
  expect(listed).toContain(`${q} · [normal] · question · from storefront · Old answered · done`);
  expect(listed).not.toContain("Re: Old answered");
  expect(listed).not.toContain(m4);
  const all = (await cb.run("mail", "inbox", "--all")).out;
  expect(all).toContain("Re: Old answered · done");
  expect(all).toContain(
    `${m4} · [normal] · change-request · from storefront · Refused one · refused: no`,
  );
  expect(readFileSync(join(dir, "inbox.json")).equals(bytes)).toBe(true);
});

test("SP7b AC-4: crew start --origin, await and resume move the origin message along the table on both copies", async () => {
  const { env, a, ca, cb } = mailRepos(["question", "notice", "change-request", "blocker"]);
  await ca.run("detect");
  await cb.run("detect");
  const mid = /sent (M-\S+) /.exec(
    (await ca.run("mail", "send", "--to", "crm", "--type", "change-request", "Add the field")).out,
  )?.[1] as string;
  const pa = repoPaths(a, env);
  const inboxStatus = () =>
    readBox(crmInboxDir(env), "inbox").box.messages.find((m) => m.id === mid)?.status;
  const outboxStatus = () =>
    readBox(mailbox(pa.userDir, "w", "storefront").dir, "outbox").box.messages.find(
      (m) => m.id === mid,
    )?.status;
  const id = (await cb.json("start", "Add the field", "--answers", answers, "--origin", mid)).data
    .id as string;
  // The kind of an item that answers a message is cross-project, from its origin (SP3 Task 2), at
  // start and again at a classify, which reads the recorded origin.
  expect((await cb.json("status")).data).toMatchObject({
    kind: "cross-project",
    kindFrom: "origin",
  });
  expect((await cb.json("classify", id, "--answers", answers)).data).toMatchObject({
    kind: "cross-project",
    kindFrom: "origin",
  });
  expect(inboxStatus()).toBe("in-progress");
  expect(outboxStatus()).toBe("in-progress");
  expect((await cb.run("await", id, "user")).code).toBe(0);
  expect(inboxStatus()).toBe("blocked");
  expect(outboxStatus()).toBe("blocked");
  expect((await cb.run("resume", id)).code).toBe(0);
  expect(inboxStatus()).toBe("in-progress");
  expect(outboxStatus()).toBe("in-progress");
}, 30_000);

test("SP7b AC-5: an item's priority comes from --priority, else from its origin's confirmed priority, else normal; status prints it", async () => {
  const { env, a, b, ca, cb } = mailRepos(["question", "notice", "change-request", "blocker"]);
  await ca.run("detect");
  await cb.run("detect");
  const started = await ca.json("start", "Thing", "--answers", answers, "--priority", "high");
  const id = started.data.id as string;
  const read = (root: string, item: string) =>
    JSON.parse(readFileSync(join(root, ".crew", "work", item, "work.json"), "utf8")) as {
      priority?: string;
    };
  expect(read(a, id).priority).toBe("high");
  expect((await ca.run("status")).out).toContain("route fast, kind feature, priority high\n");
  expect((await ca.json("status")).data.priority).toBe("high");
  const before = readdirSync(join(a, ".crew", "work")).length;
  const bad = await ca.run("start", "Thing", "--answers", answers, "--priority", "urgent");
  expect(bad.code).toBe(1);
  expect(bad.err.trim()).toBe("priority is one of blocker, high, normal, low, not urgent");
  expect(readdirSync(join(a, ".crew", "work")).length).toBe(before);
  // From the origin: the confirmed level, else the proposal, else normal for a value this engine does not know.
  const sendCr = async (text: string, ...flags: string[]) =>
    /sent (M-\S+) /.exec(
      (await ca.run("mail", "send", "--to", "crm", "--type", "change-request", ...flags, text)).out,
    )?.[1] as string;
  const lowered = await sendCr("Lowered", "--priority", "high");
  expect(
    (await cb.run("mail", "accept", lowered, "--priority", "normal", "--reason", "later")).code,
  ).toBe(0);
  const proposed = await sendCr("Proposed", "--priority", "high");
  const unknown = await sendCr("Unknown");
  const dir = crmInboxDir(env);
  const box = readBox(dir, "inbox").box;
  (box.messages.find((m) => m.id === unknown) as { priority?: string }).priority = "urgent";
  writeBox(dir, "inbox", box);
  const fromLowered = (await cb.json("start", "L", "--answers", answers, "--origin", lowered)).data
    .id as string;
  expect(read(b, fromLowered).priority).toBe("normal");
  // The origin's level wins over the priority answer (SP3 Task 2): a level 0 answer, a proposed high.
  const withPriority = (level: number) =>
    JSON.stringify({ ...(JSON.parse(answers) as Record<string, unknown>), priority: level });
  const fromProposed = (
    await cb.json("start", "P", "--answers", withPriority(0), "--origin", proposed)
  ).data.id as string;
  expect(read(b, fromProposed).priority).toBe("high");
  const fromUnknown = (await cb.json("start", "U", "--answers", answers, "--origin", unknown)).data
    .id as string;
  expect(read(b, fromUnknown).priority).toBe("normal");
  const plain = (await cb.json("start", "Plain", "--answers", answers)).data.id as string;
  expect(read(b, plain).priority).toBe("normal");
  // The priority answer's levels through start: 0 low, 3 blocker (1 normal and 2 high are tested elsewhere).
  const low = (await cb.json("start", "Low", "--answers", withPriority(0))).data.id as string;
  expect(read(b, low).priority).toBe("low");
  const top = (await cb.json("start", "Top", "--answers", withPriority(3))).data.id as string;
  expect(read(b, top).priority).toBe("blocker");
}, 30_000);

// ---------------------------------------------------------------------------------------------
// SP7b Task 2: threads, contracts and the evidence in a reply

/** A gate run of a child's evidence, with the fields the record needs. */
function childRun(gate: string, status: "pass" | "fail"): GateRun {
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

test("SP7b-T2 AC-1: crew mail thread prints a thread's messages oldest first with its parties; crew mail send --thread joins a third project", async () => {
  const { env, ca, cb } = mailRepos();
  await ca.run("detect");
  await cb.run("detect");
  const mid = /sent (M-\S+) /.exec(
    (await ca.run("mail", "send", "--to", "crm", "--type", "question", "Which values?")).out,
  )?.[1] as string;
  expect((await cb.run("mail", "reply", mid, "gold, silver")).code).toBe(0);
  const thread = await cb.run("mail", "thread", mid);
  expect(thread.code).toBe(0);
  const lines = thread.out.trimEnd().split("\n");
  expect(lines[0]).toBe(`Thread ${mid}: 2 messages, 2 parties (crm, storefront)`);
  expect(lines[1]).toBe(`  ${mid} · [normal] · question · storefront → crm · Which values? · done`);
  expect(lines[2]).toMatch(
    /^ {2}M-\S+-001-crm · \[normal\] · question · crm → storefront · Re: Which values\? · sent$/,
  );
  const json = await cb.json("mail", "thread", mid);
  expect((json.data.messages as unknown[]).length).toBe(2);
  expect(json.data.parties).toEqual(["crm", "storefront"]);
  expect((await cb.run("mail", "thread", "M-nope")).code).toBe(1);
  // The flag itself: a send with --thread to a third project of the workspace joins it.
  const c = makeRepo({ "README.md": "# warehouse\n" });
  write(c, ".crew/policy.json", JSON.stringify({ mail: { workspace: "w", name: "warehouse" } }));
  const cc = io(c, env);
  await cc.run("detect");
  const joined = await cb.json(
    "mail",
    "send",
    "--to",
    "warehouse",
    "--type",
    "question",
    "--thread",
    mid,
    "Can you ship it?",
  );
  expect(joined.code).toBe(0);
  expect(joined.data.message).toMatchObject({ thread: mid, subject: '"Which values?"' });
  const three = await cb.json("mail", "thread", mid);
  expect((three.data.messages as unknown[]).length).toBe(3);
  expect(three.data.parties).toEqual(["crm", "storefront", "warehouse"]);
});

test("SP7b-T2 AC-3: crew mail read prints a reply's evidence through the validating reader", async () => {
  const { env, a, b, ca, cb } = mailRepos(["question", "notice", "change-request", "blocker"]);
  await ca.run("detect");
  await cb.run("detect");
  const mid = /sent (M-\S+) /.exec(
    (await ca.run("mail", "send", "--to", "crm", "--type", "change-request", "Add the field")).out,
  )?.[1] as string;
  const pb = repoPaths(b, env);
  const child = (await cb.json("start", "Add the field", "--answers", answers, "--origin", mid))
    .data.id as string;
  const ev = loadEvidence(pb, child).evidence;
  ev.fingerprint = "sha256:abc";
  ev.runs = [childRun("test", "pass"), childRun("lint", "pass"), childRun("typecheck", "fail")];
  saveEvidence(pb, child, ev);
  const replied = await cb.run(
    "mail",
    "reply",
    mid,
    "Built",
    "--branch",
    "crew/x/T-1",
    "--item",
    child,
  );
  expect(replied.code).toBe(0);
  const rid = /: (M-\S+) to storefront/.exec(replied.out)?.[1] as string;
  expect((await ca.run("mail", "read", rid)).out).toContain(
    "evidence: gates passed test, lint; fingerprint sha256:abc; report none\n",
  );
  // A record rewritten by another party is read through the validating reader.
  const dir = mailbox(repoPaths(a, env).userDir, "w", "storefront").dir;
  const box = readBox(dir, "inbox").box;
  const copy = box.messages.find((m) => m.id === rid) as { evidence: unknown };
  copy.evidence = {
    report: "../../etc/x",
    fingerprint: "sha256:abc\n# Forged",
    gatesPassed: ["test", "bogus"],
  };
  writeBox(dir, "inbox", box);
  expect((await ca.run("mail", "read", rid)).out).toContain(
    "evidence: gates passed test; fingerprint sha256:abc # Forged; report none\n",
  );
  copy.evidence = { report: "../../etc/x", fingerprint: 5, gatesPassed: ["test", "bogus"] };
  writeBox(dir, "inbox", box);
  expect((await ca.run("mail", "read", rid)).out).toContain(
    "evidence: gates passed test; fingerprint none; report none\n",
  );
  const qid = /sent (M-\S+) /.exec(
    (await ca.run("mail", "send", "--to", "crm", "--type", "question", "Q")).out,
  )?.[1] as string;
  expect((await cb.run("mail", "reply", qid, "A")).code).toBe(0);
  const pa = repoPaths(a, env);
  const answer = ownInbox(mailContext(pa, loadPolicy(pa).policy, env)).messages.find(
    (m) => m.replyTo === qid,
  ) as Message;
  expect((await ca.run("mail", "read", answer.id)).out).not.toContain("evidence:");
});

test("SP7b-T2 AC-4: crew criteria add --contract binds a criterion to a contract of the item's mail; the report shows it", async () => {
  const { ca, cb } = mailRepos(["question", "notice", "change-request", "blocker"]);
  await ca.run("detect");
  await cb.run("detect");
  const id = (await ca.json("start", "Loyalty tier", "--answers", answers)).data.id as string;
  const mid = /sent (M-\S+) /.exec(
    (await ca.run("mail", "send", "--to", "crm", "--type", "change-request", "Add the field")).out,
  )?.[1] as string;
  const child = (await cb.json("start", "Add the field", "--answers", answers, "--origin", mid))
    .data.id as string;
  const replied = await cb.run(
    "mail",
    "reply",
    mid,
    "Done.\n\n## Contracts\n- no breaking change",
    "--branch",
    "crew/x/T-1",
    "--item",
    child,
    "--contract",
    "clause:no breaking change",
  );
  expect(replied.code).toBe(0);
  const rid = /: (M-\S+) to storefront/.exec(replied.out)?.[1] as string;
  await ca.run("mail", "inbox");
  const bound = await ca.json(
    "criteria",
    id,
    "add",
    "The field is typed",
    "--contract",
    `${rid}:1`,
  );
  expect(bound.code).toBe(0);
  expect(bound.data.criterion).toMatchObject({ id: "AC-1", contract: { message: rid, index: 1 } });
  expect(
    (await ca.run("criteria", id, "add", "Another", "--contract", `${rid}:3`)).err.trim(),
  ).toBe(`no contract 3 on ${rid} in this item's mail`);
  expect(
    (await ca.run("criteria", id, "add", "Another", "--contract", "M-nope:1")).err.trim(),
  ).toBe("no contract 1 on M-nope in this item's mail");
  expect((await ca.run("evidence", id)).out).toContain(
    `| AC-1 | behavior | The field is typed [contract ${rid}:1] |`,
  );
  const status = await ca.json("status");
  expect((status.data.criteria as { contract?: unknown }[])[0]?.contract).toEqual({
    message: rid,
    index: 1,
  });
});

// ---------------------------------------------------------------------------------------------
// SP7b Task 3: the environment in the profile and crew env

test("SP7b-T3 AC-2: crew profile set environment.* confirms a block key by key, crew profile confirm environment confirms a detected one, and crew env drives it with a record", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  const block = () => loadProfile(paths).profile?.environment;
  const set = await c.run(
    "profile",
    "set",
    "environment.start",
    "sh -c 'touch up.flag; exec sleep 300'",
  );
  expect(set.out).toBe(
    "environment.start set and confirmed: sh -c 'touch up.flag; exec sleep 300'\n",
  );
  expect(block()?.start).toEqual({
    command: "sh -c 'touch up.flag; exec sleep 300'",
    source: "confirmed",
  });
  const needs = 'the environment needs health (crew profile set environment.health "<cmd>")';
  expect((await c.run("env", "start")).err.trim()).toBe(needs);
  expect((await c.run("env", "health")).err.trim()).toBe(needs);
  expect((await c.run("profile", "set", "environment.health", "test -f up.flag")).code).toBe(0);
  expect((await c.run("profile", "set", "environment.stop", "rm -f up.flag")).code).toBe(0);
  expect((await c.run("profile", "set", "environment.logs", "var/log/app.log")).out).toBe(
    "environment.logs set: var/log/app.log\n",
  );
  expect((await c.run("profile", "set", "environment.url", "http://localhost:8080")).out).toBe(
    "environment.url set: http://localhost:8080\n",
  );
  expect(block()).toMatchObject({ logs: "var/log/app.log", url: "http://localhost:8080" });
  expect((await c.run("profile", "set", "environment.timeout", "0")).err.trim()).toBe(
    "environment.timeout is at least 1 second",
  );
  expect((await c.run("profile", "set", "environment.timeout", "2")).out).toBe(
    "environment.timeout set: 2 s\n",
  );
  expect(block()?.timeoutMs).toBe(2000);
  const started = await c.json("env", "start");
  expect(started.code).toBe(0);
  const pid = started.data.pid as number;
  const log = started.data.log as string;
  expect(typeof pid).toBe("number");
  expect(log).toContain(join(root, ".crew", "local", "env"));
  expect(started.data).toMatchObject({ started: true, managed: true, pid, log });
  expect(started.data.message).toBe(
    `environment up (started by the engine, pid ${pid}, log ${log})`,
  );
  const status = await c.json("env", "status");
  const since = status.data.since as string;
  expect(typeof since).toBe("string");
  expect(status.data).toMatchObject({ state: "up", managed: true, pid, since });
  expect(status.data.message).toBe(
    `environment: up, started by the engine (pid ${pid}, since ${since})`,
  );
  const health = await c.json("env", "health");
  expect(health.code).toBe(0);
  expect(health.data).toMatchObject({ message: "up", up: true, exit: 0 });
  const stopped = await c.json("env", "stop");
  expect(stopped.data).toMatchObject({
    message: `environment stopped (pid ${pid}, group signalled)`,
    stopped: true,
    pid,
  });
  const down = await c.run("env", "health");
  expect(down.code).toBe(1);
  expect(down.out).toBe("down (exit 1)\n");
  expect((await c.run("env", "stop")).err.trim()).toBe(
    "nothing was started by the engine (crew env start)",
  );
  // Without an environment in the profile.
  const bare = io(makeRepo());
  const none = 'no environment in the profile (crew profile set environment.start "<cmd>")';
  const noneStatus = await bare.json("env", "status");
  expect(noneStatus.code).toBe(0);
  expect(noneStatus.data).toMatchObject({ message: none, state: "none" });
  expect((await bare.run("env", "start")).err.trim()).toBe(none);
  // A detected block, confirmed in one step.
  const composed = makeRepo({
    "compose.yaml": "services:\n  web:\n    image: x\n",
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
  });
  const cc = io(composed);
  await cc.run("detect");
  expect((await cc.run("profile", "confirm", "environment")).out).toBe(
    "confirmed 3 command(s)\n  environment.start: docker compose up -d\n  environment.health: curl -fsS http://localhost:3000/\n  environment.stop: docker compose down\n",
  );
  const confirmed = loadProfile(repoPaths(composed, cc.env)).profile?.environment;
  expect(confirmed?.start.source).toBe("confirmed");
  expect(confirmed?.health.source).toBe("confirmed");
  expect(confirmed?.stop?.source).toBe("confirmed");
}, 30_000);

test("SP7b-T3 AC-3: crew env on the user's environment: nothing started, never stopped, down when it dies", async () => {
  const root = makeRepo();
  const c = io(root);
  await c.run("profile", "set", "environment.start", "sh -c 'touch up.flag; exec sleep 300'");
  await c.run("profile", "set", "environment.health", "test -f up.flag");
  await c.run("profile", "set", "environment.stop", "rm -f up.flag");
  write(root, "up.flag", "");
  const started = await c.json("env", "start");
  expect(started.data).toMatchObject({
    message: "environment already up (the user's); nothing started",
    started: false,
    managed: false,
  });
  expect((await c.run("env", "status")).out).toBe("environment: up (the user's)\n");
  expect((await c.run("env", "stop")).err.trim()).toBe(
    "the environment was up before crew env start: it is the user's, and the engine never stops it",
  );
  unlinkSync(join(root, "up.flag"));
  expect((await c.run("env", "status")).out).toBe("environment: down\n");
}, 30_000);

test("SP7b-T4 AC-1: crew profile set e2e sets the command; an interface change without an environment leaves the e2e gate unavailable until the user sets one or skips the gate, which the default policy allows for e2e alone", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const c = io(root);
  expect((await c.run("profile", "set", "e2e", "npx playwright test")).out.trim()).toBe(
    "e2e for . set and confirmed: npx playwright test",
  );
  expect(loadProfile(repoPaths(root, c.env)).profile?.targets[0]?.gates.e2e).toEqual({
    command: "npx playwright test",
    source: "confirmed",
  });
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  await c.run("tdd", "red", id, "AC-1", "--", "exit 1");
  await c.run("tdd", "green", id, "AC-1", "--", "exit 0");
  const reason = 'no environment in the profile (crew profile set environment.start "<cmd>")';
  const first = await c.json("gate", "run", id);
  expect(first.data.unproven).toContain(`gate e2e unavailable: ${reason}`);
  expect((first.data.runs as GateRun[]).find((r) => r.gate === "e2e")).toMatchObject({
    status: "unavailable",
    reason,
  });
  const refused = await c.run("skip", id, "gate:test", "--reason", "x");
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("allowSkips");
  const skipped = await c.json("skip", id, "gate:e2e", "--reason", "no environment yet");
  expect(skipped.code).toBe(0);
  expect(loadWork(repoPaths(root, c.env), id).work?.skips).toMatchObject([
    { step: "gate:e2e", reason: "no environment yet", by: "user" },
  ]);
  const second = await c.json("gate", "run", id);
  expect((second.data.runs as GateRun[]).find((r) => r.gate === "e2e")).toMatchObject({
    status: "skipped",
    reason: "no environment yet",
  });
  expect((second.data.unproven as string[]).some((u) => u.includes("e2e"))).toBe(false);
});

test("SP7b-T4 AC-4: the gate run names the captures and the ones without a console file", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  await c.run("skip", id, "gate:e2e", "--reason", "no environment in the fixture");
  const ui = join(root, ".crew", "work", id, "review", "ui");
  write(ui, "home-empty.png", "png");
  write(ui, "console-home-empty.json", "[]");
  write(ui, "cart-error.png", "png");
  const run = await c.run("gate", "run", id);
  expect(run.out).toContain("captures: 2 (1 without a console file: cart-error.png)");
  expect(readReviewInputs(repoPaths(root, c.env), id)?.captures).toEqual([
    { file: "review/ui/cart-error.png", console: null },
    { file: "review/ui/home-empty.png", console: "review/ui/console-home-empty.json" },
  ]);
  // Without captures the line is not printed.
  const bare = (await c.json("start", "Another", "--answers", answers, "--criterion", "a")).data
    .id as string;
  expect((await c.run("gate", "run", bare)).out).not.toContain("captures:");
});

/** The decision register of a repository, as the engine writes it. */
function register(root: string): { kind: string; text: string; by: string }[] {
  return (
    JSON.parse(readFileSync(join(root, ".crew", "decisions.json"), "utf8")) as {
      entries: { kind: string; text: string; by: string }[];
    }
  ).entries;
}

test("SP7b-T5 AC-2 (gate): under team.continuations granted a todo's gate runs two rounds past the cap, each the user's standing grant, and the fifth is refused until crew continue", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    ".crew/policy.json": JSON.stringify({ team: { continuations: "granted" } }),
  });
  const env = testEnv();
  const c = io(root, env);
  const id = (await c.json("start", "Thing", "--answers", answers, "--criterion", "a")).data
    .id as string;
  expect(
    (
      await c.run(
        "task",
        id,
        "note",
        "T-5",
        "--criteria",
        "AC-1",
        "--scope",
        "src/a.ts",
        "--text",
        "x",
      )
    ).code,
  ).toBe(0);
  const gate = () => c.run("task", id, "gate", "T-5");
  const continued = () => loadWork(repoPaths(root, env), id).work?.continued ?? [];
  expect((await gate()).code).toBe(0);
  expect((await gate()).code).toBe(0);
  expect(continued()).toEqual([]);
  const third = await gate();
  expect(third.code).toBe(0);
  expect(third.out).toContain("T-5 gate round 3: pass");
  expect(continued()).toMatchObject([
    { what: "gate", task: "T-5", by: { by: "user" }, standing: true },
  ]);
  expect(register(root).at(-1)).toMatchObject({
    kind: "continue",
    text: "gate of T-5 continued under the standing grant (team.continuations: granted)",
    by: "the user",
  });
  expect((await gate()).out).toContain("T-5 gate round 4: pass");
  expect(continued().filter((e) => e.standing).length).toBe(2);
  const fifth = await gate();
  expect(fifth.code).toBe(1);
  expect(fifth.err.trim()).toBe(
    `gate round 5 of T-5: the policy allows 2 (team.maxGateRounds); the user continues it once with crew continue ${id} gate T-5, or decides`,
  );
  expect((await c.run("continue", id, "gate", "T-5")).code).toBe(0);
  expect(continued().length).toBe(3);
  expect(continued()[2]?.standing).toBeUndefined();
  expect((await gate()).out).toContain("T-5 gate round 5: pass");
  expect((await gate()).err.trim()).toBe(
    `gate round 6 of T-5: the policy allows 2 (team.maxGateRounds); the user continues it once with crew continue ${id} gate T-5, or decides`,
  );
  // The policy set that grants it is in the register; another key appends nothing.
  const before = register(root).length;
  expect((await c.run("policy", "set", "team.maxGateRounds", "1")).code).toBe(0);
  expect(register(root).length).toBe(before);
  expect((await c.run("policy", "set", "team.continuations", "granted")).out.trim()).toBe(
    "policy team.continuations: granted",
  );
  expect(register(root).at(-1)).toMatchObject({
    kind: "decision",
    text: "team.continuations set to granted: rounds past a cap are the user's standing grant, up to the cap plus two",
    by: "the user",
  });
});

test("SP7b-T5 AC-2 (validation): under the standing grant the spec's third and fourth rounds are accepted and recorded, the fifth refused until crew continue", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    ".crew/policy.json": JSON.stringify({ team: { continuations: "granted" } }),
  });
  const env = testEnv();
  const c = io(root, env);
  const id = (
    await c.json(
      "start",
      "Refactor the module",
      "--answers",
      JSON.stringify({ ...JSON.parse(answers), scope: 1 }),
      "--criterion",
      "a",
    )
  ).data.id as string;
  write(
    root,
    `.crew/work/${id}/conclave.md`,
    "# Gap round\n\n## Assumed by good practice\n- none\n\n## Decisions only the user can make\n- none\n\n## Proposals\n- none\n\n## Warnings\n- none\n",
  );
  const spec = (n: number) =>
    write(
      root,
      `.crew/work/${id}/spec.md`,
      `# Spec\n\n## Acceptance criteria\n- AC-1 a, version ${n}\n`,
    );
  spec(1);
  await c.run("phase", id, "next");
  await c.run("phase", id, "next");
  await c.run("phase", id, "next");
  await c.run("approve", id, "spec", "--validator", "complete-gap-round");
  const validate = () =>
    c.run(
      "validation",
      id,
      "record",
      "--what",
      "spec",
      "--by",
      "lead-qa",
      "--file",
      leadFile(root, id, "lead-qa"),
    );
  expect((await validate()).out.trim()).toBe("validation of spec by lead-qa: validated (round 1)");
  spec(2);
  expect((await validate()).out.trim()).toBe("validation of spec by lead-qa: validated (round 2)");
  spec(3);
  expect((await validate()).out.trim()).toBe("validation of spec by lead-qa: validated (round 3)");
  const continued = () => loadWork(repoPaths(root, env), id).work?.continued ?? [];
  expect(continued()).toMatchObject([{ what: "validation", by: { by: "user" }, standing: true }]);
  expect(register(root).at(-1)).toMatchObject({
    kind: "continue",
    text: "validation continued under the standing grant (team.continuations: granted)",
    by: "the user",
  });
  spec(4);
  expect((await validate()).out.trim()).toBe("validation of spec by lead-qa: validated (round 4)");
  expect(continued().filter((e) => e.standing).length).toBe(2);
  spec(5);
  expect((await validate()).err.trim()).toBe(
    `validation round 5 of ${id}: the policy allows 2 (team.maxValidationRounds); the user continues it once with crew continue ${id} validation, or decides`,
  );
  expect((await c.run("continue", id, "validation")).code).toBe(0);
  expect((await validate()).out.trim()).toBe("validation of spec by lead-qa: validated (round 5)");
});

test("SP7b-T5 AC-2 (judgement): under the standing grant the third and fourth judgement rounds are accepted and recorded, the fifth refused until crew continue", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    ".crew/policy.json": JSON.stringify({ team: { continuations: "granted" } }),
  });
  const env = testEnv();
  const c = io(root, env);
  const id = (
    await c.json(
      "start",
      "Refactor the module",
      "--answers",
      JSON.stringify({ ...JSON.parse(answers), scope: 1 }),
      "--criterion",
      "a",
    )
  ).data.id as string;
  const file = `.crew/work/${id}/review/ruling.json`;
  const ruling = (verdict: "proven" | "not-proven") =>
    JSON.stringify({
      rulings: [
        {
          gate: "code-quality",
          verdict,
          findings:
            verdict === "proven"
              ? []
              : [{ file: "src/a.ts", line: 1, text: "a magic value", severity: "defect" }],
          tokens: 1,
        },
        { gate: "test-quality", verdict: "proven", findings: [], tokens: 1 },
      ],
    });
  const round = async (n: number, verdict: "proven" | "not-proven") => {
    write(root, "src/a.ts", `y${n}`);
    await c.run("gate", "run", id);
    write(root, file, ruling(verdict));
    return c.run("judgement", id, "record", "--ruling", file);
  };
  const continued = () => loadWork(repoPaths(root, env), id).work?.continued ?? [];
  expect((await round(1, "not-proven")).code).toBe(1);
  expect((await round(2, "not-proven")).code).toBe(1);
  expect(continued()).toEqual([]);
  expect((await round(3, "not-proven")).out).toContain("code-quality: not proven (1 finding)");
  expect(continued()).toMatchObject([{ what: "judgement", by: { by: "user" }, standing: true }]);
  expect(
    register(root).some(
      (e) =>
        e.text === "judgement continued under the standing grant (team.continuations: granted)",
    ),
  ).toBe(true);
  expect((await round(4, "not-proven")).out).toContain("code-quality: not proven (1 finding)");
  expect(continued().filter((e) => e.standing).length).toBe(2);
  expect(loadWork(repoPaths(root, env), id).work?.rounds).toMatchObject({ judgement: 4 });
  const fifth = await round(5, "proven");
  expect(fifth.code).toBe(1);
  expect(fifth.err.trim()).toBe(
    `judgement round 5 of ${id}: the policy allows 2 (team.maxJudgementRounds); the user continues it once with crew continue ${id} judgement, or decides (crew skip <id> gate:<gate> where policy.json allows it)`,
  );
  expect((await c.run("continue", id, "judgement")).code).toBe(0);
  expect((await c.run("judgement", id, "record", "--ruling", file)).out).toContain(
    "code-quality: proven (0 findings)",
  );
  expect(loadWork(repoPaths(root, env), id).work?.rounds).toMatchObject({ judgement: 5 });
}, 30_000);

test("SP7b-T5 AC-3: the engine keeps each judgement round's findings and ruling as round copies at the record, and a gate run's reset leaves them", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const c = io(root);
  const id = (await c.json("start", "Empty state", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/App.vue", "<template>empty</template>");
  await c.run("tdd", "red", id, "AC-1", "--", "exit 1");
  await c.run("tdd", "green", id, "AC-1", "--", "exit 0");
  await c.run("skip", id, "gate:e2e", "--reason", "no environment in the fixture");
  await c.run("gate", "run", id);
  const review = join(root, ".crew", "work", id, "review");
  const file = join(review, "ruling.json");
  const notProven = JSON.stringify({
    rulings: [
      {
        gate: "ui-ux",
        verdict: "not-proven",
        findings: [{ file: "src/App.vue", line: 1, text: "no empty state", severity: "defect" }],
      },
    ],
  });
  const proven = JSON.stringify({ rulings: [{ gate: "ui-ux", verdict: "proven", findings: [] }] });
  writeFileSync(
    join(review, "ui-ux.findings.md"),
    "# ui-ux findings\n- F-1 · src/App.vue:1 · no empty state\n",
  );
  writeFileSync(file, notProven);
  expect((await c.run("judgement", id, "record", "--ruling", file)).code).toBe(1);
  expect(readFileSync(join(review, "ui-ux.round1.md"), "utf8")).toBe(
    "# ui-ux findings\n- F-1 · src/App.vue:1 · no empty state\n",
  );
  expect(readFileSync(join(review, "ruling.round1.json"), "utf8")).toBe(notProven);
  // The code changes and the gate run cuts the inputs again: the originals go, the copies stay.
  write(root, "src/App.vue", "<template>empty, with copy</template>");
  await c.run("gate", "run", id);
  expect(existsSync(file)).toBe(false);
  expect(existsSync(join(review, "ui-ux.findings.md"))).toBe(false);
  expect(existsSync(join(review, "ui-ux.round1.md"))).toBe(true);
  expect(existsSync(join(review, "ruling.round1.json"))).toBe(true);
  writeFileSync(join(review, "ui-ux.findings.md"), "# ui-ux findings\n- none\n");
  writeFileSync(file, proven);
  expect((await c.run("judgement", id, "record", "--ruling", file)).code).toBe(0);
  expect(readFileSync(join(review, "ui-ux.round2.md"), "utf8")).toBe("# ui-ux findings\n- none\n");
  expect(readFileSync(join(review, "ruling.round2.json"), "utf8")).toBe(proven);
  expect(readFileSync(join(review, "ruling.round1.json"), "utf8")).toBe(notProven);
  // A not-run record on the same code copies nothing.
  await c.run("judgement", id, "record", "ui-ux", "--not-run", "--reason", "no browser");
  expect(readFileSync(join(review, "ruling.round2.json"), "utf8")).toBe(proven);
  expect(existsSync(join(review, "ruling.round3.json"))).toBe(false);
});

/** A project of the workspace, registered as a session would. */
function registered(
  root: string,
  env: NodeJS.ProcessEnv,
  name: string,
  extra: Record<string, unknown> = {},
) {
  const paths = repoPaths(root, env);
  write(root, ".crew/policy.json", JSON.stringify({ mail: { workspace: "shop", name, ...extra } }));
  registerProject(mailContext(paths, loadPolicy(paths).policy, env), `session-${name}`, {
    hook: true,
  });
  return paths;
}

test("SP7b-T6 AC-1: crew workspace status prints the workspace's projects from the records, says so without a workspace, and refuses another verb", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const env = testEnv();
  const c = io(root, env);
  const none = await c.run("workspace", "status");
  expect(none.code).toBe(0);
  expect(none.out.trim()).toBe(
    "no workspace in policy.json (mail.workspace): crew workspace status lists the projects of one workspace",
  );
  const paths = registered(root, env, "crm");
  const listed = await c.run("workspace", "status");
  expect(listed.code).toBe(0);
  expect(listed.out.trim()).toBe(
    `Workspace shop: 1 project\n  crm (${paths.root}): live · items 0 · unread 0 · threads 0 open · priorities 0 unconfirmed · environment none`,
  );
  expect((await c.json("workspace", "status")).data).toMatchObject({
    workspace: "shop",
    projects: [
      {
        name: "crm",
        root: paths.root,
        live: true,
        gone: false,
        items: 0,
        unread: 0,
        threads: 0,
        priorities: 0,
        environment: "none",
      },
    ],
  });
  expect((await c.run("workspace", "list")).err.trim()).toBe(
    "usage: crew workspace status [--json]",
  );
});

test("SP7b-T6 AC-2: crew status --json carries threads (the project's, with the unread addressed to it), priority and environment", async () => {
  const env = testEnv();
  const crmRoot = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const storefrontRoot = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
  });
  const crm = registered(crmRoot, env, "crm");
  registered(storefrontRoot, env, "storefront", { accept: ["question", "notice"] });
  const c = io(crmRoot, env);
  await c.json("start", "Thing", "--answers", answers, "--criterion", "a");
  const before = (await c.json("status")).data;
  expect(before.threads).toEqual([]);
  expect(before.environment).toBe("none");
  expect(before.priority).toBe("normal");
  const sent = await c.json(
    "mail",
    "send",
    "--to",
    "storefront",
    "--type",
    "question",
    "loyalty_tier on POST /customers",
  );
  expect(sent.code).toBe(0);
  const root = readBox(mailbox(crm.userDir, "shop", "crm").dir, "outbox").box.messages[0]
    ?.id as string;
  expect((await c.json("status")).data.threads).toEqual([
    { root, subject: "loyalty_tier on POST /customers", messages: 1, unread: 0, open: true },
  ]);
  writeJson(envRecordPath(crm), {
    pid: null,
    processStart: null,
    startedAt: "2026-10-18T10:00:00.000Z",
    managed: false,
    log: null,
    command: "x",
  });
  expect((await c.json("status")).data.environment).toBe("up");
  const gone = spawnSync("sh", ["-c", "exit 0"]);
  writeJson(envRecordPath(crm), {
    pid: gone.pid,
    processStart: "gone",
    startedAt: "2026-10-18T10:00:00.000Z",
    managed: true,
    log: null,
    command: "x",
  });
  expect((await c.json("status")).data.environment).toBe("down");
  // The receiving project sees the same thread with one unread message.
  const s = io(storefrontRoot, env);
  await s.json("start", "Answer", "--answers", answers, "--criterion", "a");
  expect((await s.json("status")).data.threads).toEqual([
    { root, subject: "loyalty_tier on POST /customers", messages: 1, unread: 1, open: true },
  ]);
});

test("SP7b-T6 AC-3: crew task <id> brief T-n --print prints an existing brief as it is and rewrites nothing", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const c = io(root, env);
  const id = (await c.json("start", "Thing", "--answers", answers, "--criterion", "a")).data
    .id as string;
  expect(
    (
      await c.run(
        "task",
        id,
        "note",
        "T-5",
        "--criteria",
        "AC-1",
        "--scope",
        "src/a.ts",
        "--text",
        "x",
      )
    ).code,
  ).toBe(0);
  expect((await c.run("task", id, "gate", "T-5")).code).toBe(0);
  expect((await c.run("task", id, "brief", "T-5", "--print")).err.trim()).toBe(
    "T-5 has no brief yet (crew task <id> brief T-5)",
  );
  expect((await c.run("task", id, "brief", "T-5")).code).toBe(0);
  const file = join(root, ".crew", "work", id, "tasks", "T-5.brief.md");
  const text = readFileSync(file, "utf8");
  const mtime = statSync(file).mtimeMs;
  const printed = await c.run("task", id, "brief", "T-5", "--print");
  expect(printed.code).toBe(0);
  expect(printed.out).toBe(text);
  expect(statSync(file).mtimeMs).toBe(mtime);
  expect((await c.json("task", id, "brief", "T-5", "--print")).data).toMatchObject({
    task: "T-5",
    brief: text,
  });
  expect(loadWork(repoPaths(root, env), id).work?.tasks?.[0]).toMatchObject({
    state: "briefed",
    brief: "tasks/T-5.brief.md",
  });
});

test("SP3-T1 AC-2 (finding 81): two tdd commands that overlap keep both records; a busy lock and a file rewritten by hand mid-run each refuse with one line and nothing recorded", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const one = io(root, env);
  const two = io(root, env);
  const id = (await one.json("start", "Two records", "--answers", answers, "--preserve", "keep"))
    .data.id as string;
  expect((await one.run("criteria", id, "add", "measured", "--kind", "observed")).code).toBe(0);
  expect((await one.run("tdd", "before", id, "AC-1", "--", "true")).code).toBe(0);
  const [after, observed] = await Promise.all([
    one.run("tdd", "after", id, "AC-1", "--", "sleep", "1"),
    two.run("tdd", "observed", id, "AC-2", "--reason", "a measurement", "--", "true"),
  ]);
  expect(after.code, after.err).toBe(0);
  expect(observed.code, observed.err).toBe(0);
  const paths = repoPaths(root, env);
  const tdd = loadEvidence(paths, id).evidence.tdd;
  expect(tdd.find((t) => t.criterion === "AC-1")?.after?.exit).toBe(0);
  expect(tdd.find((t) => t.criterion === "AC-2")?.observed?.exit).toBe(0);
  // A fresh lock another command holds: one line, exit 1, nothing recorded, the lock left alone.
  const lock = join(root, ".crew", "work", id, ".lock");
  mkdirSync(lock);
  const busy = await one.run("tdd", "observed", id, "AC-2", "--reason", "again", "--", "true");
  expect(busy.code).toBe(1);
  expect(busy.err.trim()).toStartWith(
    `the work folder of ${id} is busy (another crew command holds it); nothing recorded: run the command again (the observed run passed: logs/tdd-AC-2-observed-`,
  );
  expect(existsSync(lock)).toBe(true);
  rmdirSync(lock);
  expect(loadEvidence(paths, id).evidence.tdd.find((t) => t.criterion === "AC-2")?.reason).toBe(
    "a measurement",
  );
  // The file rewritten by hand while the run is in flight: the run's result is said, nothing recorded, the bytes kept.
  const file = join(root, ".crew", "work", id, "evidence.json");
  const running = one.run("tdd", "observed", id, "AC-2", "--reason", "again", "--", "sleep", "1");
  await Bun.sleep(300);
  writeFileSync(file, '{"hand":true}');
  const tampered = await running;
  expect(tampered.code).toBe(1);
  expect(tampered.err.trim()).toStartWith(
    `evidence.json of ${id} changed outside the engine (crew accept ${id}); nothing recorded (the observed run passed: logs/tdd-AC-2-observed-`,
  );
  expect(readFileSync(file, "utf8")).toBe('{"hand":true}');
}, 30_000);

test("SP3-T1 AC-4 (finding 78): crew validation record reads the last block of a resumed lead's reply file", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const standard = JSON.stringify({ ...JSON.parse(answers), scope: 1 });
  const id = (await c.json("start", "Two rounds", "--answers", standard)).data.id as string;
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1 x\n");
  const reply = `.crew/work/${id}/conclave/lead-qa-reply.md`;
  write(
    root,
    reply,
    `# qa lead's validation of ${id}: spec\nverdict: returned\n## Returns\n- R-1 · spec.md:3 · x\n## Notes\n- round 1\n\n# qa lead's validation of ${id}: spec\nverdict: validated\n## Returns\n- none\n## Notes\n- round 2\n`,
  );
  const recorded = await c.json(
    "validation",
    id,
    "record",
    "--what",
    "spec",
    "--by",
    "lead-qa",
    "--file",
    reply,
  );
  expect(recorded.code).toBe(0);
  expect(recorded.data.validation).toMatchObject({
    verdict: "validated",
    returns: 0,
    by: "lead-qa",
    file: "conclave/lead-qa-reply.md",
  });
});

test("SP3-T2 AC-1, AC-2, AC-3: crew start records the kind and says where it came from; an issue lands in analyse with the issue line, its guard names what is missing, and status, the log, the report and the metrics carry the kind", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const fix = JSON.stringify({ ...JSON.parse(answers), work_type: "fix" });
  const started = await c.run(
    "start",
    "Cart total ignores the discount",
    "--answers",
    fix,
    "--criterion",
    "the total subtracts the discount",
  );
  expect(started.code).toBe(0);
  expect(started.out).toContain("kind issue (from work_type fix)");
  expect(started.out).toContain(
    "issue: analysis.md (Origin, Cause, Blast radius) and a preserve criterion before build (references/analyse.md)",
  );
  const status = await c.json("status");
  const id = status.data.active as string;
  expect(status.data).toMatchObject({
    phase: "analyse",
    route: "fast",
    kind: "issue",
    kindFrom: "work_type fix",
  });
  expect(status.data.phases).toEqual([
    "receive",
    "recognize",
    "analyse",
    "build",
    "gate",
    "deliver",
  ]);
  expect((await c.run("status")).out).toContain(
    "phase analyse, route fast, kind issue, priority normal",
  );
  const next = await c.run("phase", id, "next");
  expect(next.code).toBe(1);
  expect(next.err).toContain('an "Origin" section with content in analysis.md');
  expect(next.err).toContain(
    "analysis/origin.json in the work folder (crew analyse <id> --paths <files>)",
  );
  expect(next.err).toContain("at least one preserve criterion");
  write(
    root,
    `.crew/work/${id}/analysis.md`,
    "# Analysis\n\n## Origin\nnone\n\n## Cause\nthe discount is read after the total\n\n## Blast radius\none function\n",
  );
  write(root, `.crew/work/${id}/analysis/origin.json`, '{"paths":[],"items":[]}');
  expect((await c.run("criteria", id, "add", "keep", "--kind", "preserve")).code).toBe(0);
  expect((await c.json("phase", id, "next")).data.phase).toBe("build");
  const log = readFileSync(join(root, ".crew", "local", "decisions.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  expect(log[log.length - 1]).toMatchObject({ kind: "issue", kindFrom: "work_type fix" });
  expect((await c.json("metrics")).data.items).toMatchObject({ byKind: { issue: 1 } });
  expect((await c.run("metrics")).out).toContain("items: 1 (fast 1; issue 1)");
  expect((await c.run("evidence", id)).out).toContain(
    "- Type: fix. Kind: issue (from work_type fix). Route: fast",
  );
});

test("SP3-T2 AC-1: an answered kind is taken where the type leaves it open, a lowering answer is refused before anything is created, the priority answer sets the item's priority when nothing else does, and classify keeps a recorded issue", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const base = JSON.parse(answers) as Record<string, unknown>;
  const answered = JSON.stringify({
    ...base,
    work_type: "feature",
    scope: 1,
    kind: "client-request",
    priority: 2,
  });
  const start = await c.json("start", "A ticket", "--answers", answered);
  expect(start.data).toMatchObject({
    kind: "client-request",
    kindFrom: "answer",
    priority: "high",
  });
  expect(
    (
      await c.run(
        "start",
        "x",
        "--answers",
        JSON.stringify({ ...base, work_type: "fix", kind: "feature" }),
      )
    ).err.trim(),
  ).toBe("invalid answers: kind: a fix is an issue");
  expect(
    (await c.run("start", "x", "--answers", JSON.stringify({ ...base, priority: 4 }))).err.trim(),
  ).toBe("invalid answers: priority: expected an integer level from 0 to 3");
  expect(readdirSync(join(root, ".crew", "work")).length).toBe(1);
  const flagged = await c.json("start", "B", "--answers", answered, "--priority", "low");
  expect(flagged.data.priority).toBe("low");
  const id = flagged.data.id as string;
  const asFix = await c.json(
    "classify",
    id,
    "--answers",
    JSON.stringify({ ...base, work_type: "fix" }),
  );
  expect(asFix.data).toMatchObject({ kind: "issue", kindFrom: "work_type fix" });
  const again = await c.json(
    "classify",
    id,
    "--answers",
    JSON.stringify({ ...base, work_type: "feature", scope: 1 }),
  );
  expect(again.data.kind).toBe("issue");
  // A record without a kind (written before 0.8.0) reads as feature.
  const paths = repoPaths(root, c.env);
  const old = loadWork(paths, id).work;
  if (!old) throw new Error("no work");
  old.kind = undefined;
  old.kindFrom = undefined;
  saveWork(paths, old);
  expect((await c.run("status")).out).toContain("kind feature");
  expect((await c.json("status")).data.phases).toEqual(PHASES_BY_ROUTE_STANDARD);
});

const PHASES_BY_ROUTE_STANDARD = [
  "receive",
  "recognize",
  "understand",
  "specify",
  "conclave",
  "plan",
  "build",
  "gate",
  "deliver",
];
