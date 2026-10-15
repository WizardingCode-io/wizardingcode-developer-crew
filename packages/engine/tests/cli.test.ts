import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { loadProfile } from "../src/profile.ts";
import { readProtectedJson, writeProtectedJson } from "../src/store.ts";
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
});

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
  write(root, ".crew/policy.json", JSON.stringify({ allowSkips: ["tdd", "ui-ux"] }));
  expect((await c.run("policy", "accept")).code).toBe(0);
  const skipped = await c.json("skip", id, "ui-ux", "--reason", "no browser");
  expect((skipped.data.skips as { step: string }[]).at(-1)?.step).toBe("gate:ui-ux");
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
  const run = await c.run("gate", "run", id);
  expect(run.out).toContain(
    `Judgement gates to run: ui-ux (interface files: src/App.vue); inputs in .crew/work/${id}/review/ (diff.patch, files.txt); record each with crew judgement ${id} record --ruling <file>`,
  );
  expect(existsSync(join(root, ".crew", "work", id, "review", "diff.patch"))).toBe(true);
  const json = await c.json("gate", "run", id, "--only", "ui-ux");
  expect(json.data.judgement).toEqual([{ gate: "ui-ux", reason: "interface files: src/App.vue" }]);
  expect(json.data.review).toBe(`.crew/work/${id}/review`);
  expect((json.data.runs as unknown[]).length).toBe(2);
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

const answers = JSON.stringify({
  work_type: "fix",
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
  expect((await c.run("--version")).out.trim()).toBe("0.4.0");
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
});

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
});

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
