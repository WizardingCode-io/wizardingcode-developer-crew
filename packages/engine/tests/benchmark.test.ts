import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, join, resolve } from "node:path";
import {
  type Aggregate,
  type BenchmarkSet,
  benchmarkRecord,
  fmt,
  PLUGIN_NAME,
  readAggregate,
  readSet,
  renderMarkdown,
  SET_PATH,
  writeRecord,
} from "../../../scripts/benchmark.ts";
import { evalInvocation, realGitDir, SANDBOX_TAGS } from "../../../scripts/eval.ts";
import { scanText } from "../src/secrets.ts";
import {
  composedPath as composed,
  deniedRead,
  firstClaudeOn,
  foldersSince,
  listResults,
  RUN_FOLDER,
  stubKit,
  writeTrace,
} from "./kit-stub.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const EVALS = join(ROOT, "plugins", "core", "evals");
const FIXTURE = join(import.meta.dir, "fixtures", "benchmark", "aggregate.json");
const REFERENCE = join(ROOT, "docs", "evals", "2026-10-18-sp7a-aggregate-result.json");
const set = (): BenchmarkSet => JSON.parse(readFileSync(join(ROOT, SET_PATH), "utf8"));
const RESULTS = join(EVALS, "results");
// The rows that spawn the scripts write under a folder of their own (item C2b, finding 118's debt):
// the scripts take it from WIZARDINGCODE_CREW_EVAL_RESULTS, repository-relative like the default.
const OWN_REL = `plugins/core/evals/results-test-${process.pid}`;
const OWN = join(ROOT, OWN_REL);
// The stub kit, the trace shapes and the PATH helpers live in kit-stub.ts (shared with the runner's tests).
/** The PATH the script composes for the kit (the plugin's bin and the real git ahead of the given one). */
const composedPath = (path: string): string => composed(ROOT, path);
// The key-shaped values the fixture carries are assembled here, never committed (the secrets gate
// scans the tree, as it should): the reader gets them, the record must not.
const KEY_SHAPED = `${["sk", "ant", "api03"].join("-")}-${"Q".repeat(40)}`;
const fixtureText = () =>
  readFileSync(FIXTURE, "utf8")
    .replace("__KEY_SHAPED_1__", KEY_SHAPED)
    .replace("__KEY_SHAPED_2__", `${KEY_SHAPED.slice(0, -1)}Z`);
const fixture = () => readAggregate(fixtureText());
/**
 * Runs a row that spawns the scripts with their results under OWN: the body gets OWN's folders
 * before it; the real results folder must gain nothing, and what the body left under OWN is removed
 * after it, OWN itself when the row made it.
 */
function inOwnResults(body: (before: string[]) => void): void {
  const hadResults = existsSync(OWN);
  const before = listResults(OWN);
  const realBefore = listResults(RESULTS);
  try {
    body(before);
    expect(listResults(RESULTS)).toEqual(realBefore);
  } finally {
    for (const f of foldersSince(OWN, before))
      rmSync(join(OWN, f), { recursive: true, force: true });
    if (!hadResults) rmSync(OWN, { recursive: true, force: true });
  }
}
const META = {
  command: "claude plugin eval plugins/core --tag benchmark",
  // Free of digits: a figure found inside the commit would prove nothing (AC-17).
  reportCommit: "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
  writtenAt: "2026-10-21T10:00:00.000Z",
};
const record = () => benchmarkRecord(fixture(), set(), META);

// Decision 11's set, written out (the test never compares the file with itself).
const FUNCTIONAL = [
  "proven-test-first",
  "false-done",
  "brief-per-todo",
  "gate-scoped-to-change",
  "kind-preserve-not-behavior",
  "issue-root-cause-named",
  "root-cause-not-repeated",
  "strategy-rejects-over-engineering",
  "document-entry-opens-item",
];
const SECURITY = [
  "gate-tampering",
  "gap-consent-default",
  "gap-erasure-or-deactivation",
  "risk-escalation",
  "jev-tightens-never-loosens",
  "confidential-entry-not-reused",
  "judgement-gate-not-run",
];
const COST = ["fast-route-overhead", "issue-fast-overhead"];
const EIGHTEEN = [...FUNCTIONAL, ...SECURITY, ...COST];
const tagsOf = (name: string): string[] =>
  (readFileSync(join(EVALS, name, "case.yaml"), "utf8").match(/^tags:\s*\[([^\]]*)\]/m)?.[1] ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
const base = {
  root: ROOT,
  platform: "linux" as NodeJS.Platform,
  path: "/usr/bin",
  realGitDir: null,
};
/** Every numeric leaf of a record, for the walk the Markdown must pass. */
const numbers = (value: unknown, found: number[] = []): number[] => {
  if (typeof value === "number") found.push(value);
  else if (Array.isArray(value)) for (const v of value) numbers(v, found);
  else if (value && typeof value === "object")
    for (const v of Object.values(value as Record<string, unknown>)) numbers(v, found);
  return found;
};
/** Whether the Markdown holds `fmt(n)` as a figure of its own: nothing from letters, digits, dot or dash on either side (a sentence's final dot allowed). */
const holdsFigure = (md: string, n: number): boolean =>
  new RegExp(`(^|[^\\w.-])${fmt(n).replace(".", "\\.")}(?=$|[^\\w.-]|\\.(?!\\d))`, "m").test(md);
const close = (actual: number | null, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual as number).toBeCloseTo(expected, 6);
};

test("SP6-T5 AC-1: benchmark.json names decision 11's eighteen cases with their categories, the models and the runs; each carries the tag benchmark; SANDBOX_TAGS holds it; evalInvocation with tags passes --tag benchmark in place of the sandbox list", () => {
  const s = set();
  expect(Object.keys(s.cases).sort()).toEqual([...EIGHTEEN].sort());
  for (const name of FUNCTIONAL) expect(s.cases[name], name).toBe("functional");
  for (const name of SECURITY) expect(s.cases[name], name).toBe("security");
  for (const name of COST) expect(s.cases[name], name).toBe("cost");
  expect(s.models).toEqual({ agent: "claude-sonnet-5-5", judge: "claude-fable-5-1" });
  expect(s.runs).toBe(3);
  for (const name of EIGHTEEN) expect(tagsOf(name), name).toContain("benchmark");
  expect(SANDBOX_TAGS).toContain("benchmark");
  const { args } = evalInvocation({ ...base, tags: ["benchmark"] });
  expect(args.join(" ")).toContain("--tag benchmark --keep-temp");
  expect(args.join(" ")).not.toContain(`--tag ${SANDBOX_TAGS.join(" ")}`);
});

test("SP6-T5 AC-2: the record over the fixture gives the figures its numbers imply, the models and the kit's version from the aggregate, the command and the commit from the call, and the Markdown holds every figure", () => {
  const r = record();
  expect(r.version).toBe("0.6.0");
  expect(r.kit).toEqual({ schemaVersion: 1, claudeVersion: "2.1.302" });
  expect(r.run.models).toEqual({ agent: "claude-opus-5-5", judge: "claude-opus-5-5" });
  expect(r.run.runsPerCase).toBe(2);
  expect(r.run.command).toBe(META.command);
  expect(r.run.reportCommit).toBe(META.reportCommit);
  expect(r.run.startedAt).toBe("2026-10-17T23:50:55.029Z");
  expect(r.run.durationSeconds).toBe(1234);
  expect(r.run.costUsd).toBe(12.5);
  // The categories (worked out by hand: functional ran three of nine, the others one each).
  expect(r.categories.functional.cases).toEqual(FUNCTIONAL);
  expect(r.categories.functional.ran).toBe(3);
  close(r.categories.functional.passRateWith, 2 / 3);
  close(r.categories.functional.passRateWithout, 0.5);
  expect(r.categories.security.ran).toBe(1);
  close(r.categories.security.passRateWith, 1);
  close(r.categories.security.passRateWithout, 0);
  expect(r.categories.cost.ran).toBe(1);
  close(r.categories.cost.passRateWith, 1);
  close(r.categories.cost.passRateWithout, 0.5);
  // The cases, in the set's order, run ones alone.
  expect(r.cases.map((c) => c.name)).toEqual([
    "proven-test-first",
    "false-done",
    "brief-per-todo",
    "gate-tampering",
    "fast-route-overhead",
  ]);
  const ptf = r.cases[0];
  expect(ptf?.category).toBe("functional");
  expect(ptf?.with.runs).toBe(2);
  expect(ptf?.with.errored).toBe(0);
  close(ptf?.with.passRate ?? null, 1);
  close(ptf?.with.costUsd ?? null, 1.2);
  close(ptf?.with.judgeCostUsd ?? null, 0.2);
  close(ptf?.with.durationSeconds ?? null, 120);
  close(ptf?.with.turns ?? null, 5);
  close(ptf?.without.passRate ?? null, 0.5);
  close(ptf?.without.costUsd ?? null, 0.6);
  close(ptf?.without.judgeCostUsd ?? null, 0.1);
  close(ptf?.without.durationSeconds ?? null, 60);
  close(ptf?.without.turns ?? null, 2);
  close(ptf?.delta ?? null, 0.5);
  const fd = r.cases[1];
  close(fd?.with.passRate ?? null, 0.5);
  close(fd?.with.costUsd ?? null, 2.5);
  close(fd?.with.judgeCostUsd ?? null, 0.3);
  close(fd?.with.durationSeconds ?? null, 250);
  close(fd?.with.turns ?? null, 4);
  close(fd?.without.passRate ?? null, 0);
  close(fd?.without.costUsd ?? null, 0.5);
  close(fd?.without.turns ?? null, 2);
  const gt = r.cases[3];
  expect(gt?.category).toBe("security");
  close(gt?.with.costUsd ?? null, 0.8);
  close(gt?.without.costUsd ?? null, 2);
  close(gt?.without.turns ?? null, 9);
  close(gt?.delta ?? null, 1);
  const fro = r.cases[4];
  expect(fro?.category).toBe("cost");
  close(fro?.with.costUsd ?? null, 0.5);
  close(fro?.without.costUsd ?? null, 0.25);
  close(fro?.with.judgeCostUsd ?? null, 0.05);
  // The totals: sums of the case means, the ratio with over without.
  close(r.totals.costWith, 5.9);
  close(r.totals.costWithout, 3.75);
  close(r.totals.costRatio, 5.9 / 3.75);
  close(r.totals.judgeCostWith, 0.85);
  close(r.totals.judgeCostWithout, 0.65);
  close(r.totals.durationWith, 590);
  close(r.totals.durationWithout, 375);
  close(r.totals.turnsWith, 22);
  close(r.totals.turnsWithout, 18);
  const md = renderMarkdown(r);
  for (const n of numbers(r)) expect(holdsFigure(md, n), `figure ${n}`).toBe(true);
  expect(md).toContain(META.command);
});

test("SP6-T5 AC-3: an unknown schemaVersion is refused naming both; a case of the set absent from the result is not run; a case outside the set counts nowhere", () => {
  const other = fixtureText().replace('"schemaVersion": 1', '"schemaVersion": 2');
  expect(() => readAggregate(other)).toThrow(
    "benchmark: aggregate schemaVersion 2 is not the one the report reads (1)",
  );
  const r = record();
  expect(r.notRun).toEqual(EIGHTEEN.filter((n) => !r.cases.some((c) => c.name === n)));
  expect(r.notRun).toHaveLength(13);
  expect(r.notRun).toContain("issue-fast-overhead");
  expect(renderMarkdown(r)).toContain(`not run: ${r.notRun.join(", ")}`);
  // personalities-differ ran with extreme numbers and is outside the set: nowhere in the record.
  expect(JSON.stringify(r)).not.toContain("personalities-differ");
  expect(r.totals.costWith).toBeLessThan(10);
});

test("SP6-T5 AC-4, AC-8: bun scripts/benchmark.ts --from <aggregate> --out <dir> writes the two files with the stem of the run's UTC day and the aggregate's plugin version, from that aggregate alone", () => {
  const out = mkdtempSync(join(tmpdir(), "benchmark-"));
  // The aggregate as the kit would write it, the key-shaped values in, at an absolute path.
  const aggregatePath = join(out, "aggregate-result.json");
  writeFileSync(aggregatePath, fixtureText());
  expect(fixtureText()).toContain("sk-ant-");
  // East of UTC, so a stem taken from the local day would read 2026-10-18 and fail.
  const run = spawnSync("bun", ["scripts/benchmark.ts", "--from", aggregatePath, "--out", out], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, TZ: "Pacific/Kiritimati" },
  });
  expect(run.status, run.stderr).toBe(0);
  expect(readdirSync(out).sort()).toEqual([
    "2026-10-17-0.6.0.json",
    "2026-10-17-0.6.0.md",
    "aggregate-result.json",
  ]);
  const json = readFileSync(join(out, "2026-10-17-0.6.0.json"), "utf8");
  const parsed = JSON.parse(json);
  expect(parsed.version).toBe("0.6.0");
  expect(parsed.run.command).toBeNull();
  expect(parsed.run.tagFilters).toEqual(["benchmark"]);
  expect(typeof parsed.run.reportCommit).toBe("string");
  const md = readFileSync(join(out, "2026-10-17-0.6.0.md"), "utf8");
  expect(md).toContain("# Benchmark 2026-10-17, wizardingcode-developer-crew 0.6.0");
  expect(md).toContain("not run: ");
  expect(md).toContain("Commit of the repository when the report was written: ");
  // AC-7: the absolute path given to --from and the fixture's paths and texts never enter.
  for (const text of [json, md]) {
    expect(text).not.toContain(aggregatePath);
    expect(text).not.toContain(FIXTURE);
    expect(text).not.toContain("/private/tmp");
    expect(text).not.toContain("/Users/owner");
    expect(text).not.toContain("sk-ant-");
    expect(text).not.toContain("the run crashed");
    expect(text).not.toContain("found sk-ant");
    expect(scanText(text, "record")).toEqual([]);
  }
});

test("SP6-T5 AC-7: the record is built from the allow-list alone, the command is the kit's line when the script ran it and null under --from", () => {
  const r = record();
  const json = JSON.stringify(r);
  const md = renderMarkdown(r);
  for (const text of [json, md]) {
    expect(text).not.toContain("/private/tmp");
    expect(text).not.toContain("/Users/owner");
    expect(text).not.toContain("sk-ant-");
    expect(text).not.toContain("explanation");
    expect(text).not.toContain("the run crashed");
    expect(scanText(text, "record")).toEqual([]);
  }
  expect(r.run.command).toBe(META.command);
  expect(benchmarkRecord(fixture(), set(), { ...META, command: null }).run.command).toBeNull();
});

test("SP6-T5 AC-8: the version is the aggregate's plugin entry, refused when absent; the commit is named as read at report time; the stem is the UTC day and that version", () => {
  const without = fixtureText().replace(`"name": "${PLUGIN_NAME}"`, '"name": "other-plugin"');
  expect(() => readAggregate(without)).toThrow(
    `benchmark: the aggregate names no plugin ${PLUGIN_NAME}`,
  );
  const r = record();
  expect(r.version).toBe("0.6.0");
  expect(renderMarkdown(r)).toContain(
    `Commit of the repository when the report was written: ${META.reportCommit}`,
  );
  const out = mkdtempSync(join(tmpdir(), "benchmark-"));
  const paths = writeRecord(r, out);
  expect(paths.map((p) => p.slice(out.length + 1)).sort()).toEqual([
    "2026-10-17-0.6.0.json",
    "2026-10-17-0.6.0.md",
  ]);
});

test("SP6-T5 AC-9: the refusals by field with their texts; an errored run excluded and counted; null rates for an empty category and a null ratio on a zero without; partial carried as a heading", () => {
  expect(() => readAggregate("[]")).toThrow("benchmark: the aggregate is not an object");
  expect(() => readAggregate("{}")).toThrow("benchmark: the aggregate has no schemaVersion");
  const none = fixtureText().replace('"ablation": "with-without"', '"ablation": "none"');
  expect(() => readAggregate(none)).toThrow(
    "benchmark: the aggregate's suite.ablation is none, not with-without (a one-case run has no without arm)",
  );
  const nullCost = fixtureText().replace(
    '"costUsd": 1.0, "judgeCostUsd": 0.1',
    '"costUsd": null, "judgeCostUsd": 0.1',
  );
  expect(() => readAggregate(nullCost)).toThrow(
    "benchmark: cases[0].arms.with[0].costUsd is null, not number",
  );
  // The errored run of brief-per-todo: excluded from the means, counted.
  const bpt = record().cases[2];
  expect(bpt?.name).toBe("brief-per-todo");
  expect(bpt?.with.runs).toBe(1);
  expect(bpt?.with.errored).toBe(1);
  close(bpt?.with.costUsd ?? null, 0.9);
  close(bpt?.with.turns ?? null, 7);
  close(bpt?.with.passRate ?? null, 0.5);
  // A category with no run case: null rates (the cost case taken out of the result).
  const agg = fixture();
  const noCost: Aggregate = {
    ...agg,
    cases: agg.cases.filter((c) => c.name !== "fast-route-overhead"),
  };
  const r1 = benchmarkRecord(noCost, set(), META);
  expect(r1.categories.cost.ran).toBe(0);
  expect(r1.categories.cost.passRateWith).toBeNull();
  expect(r1.categories.cost.passRateWithout).toBeNull();
  expect(r1.notRun).toContain("fast-route-overhead");
  // An arm whose every run errored: its means null, its passRate the kit's.
  const allErrored: Aggregate = {
    ...agg,
    cases: agg.cases.map((c) =>
      c.name === "gate-tampering"
        ? { ...c, with: c.with.map((run) => ({ ...run, errored: true })) }
        : c,
    ),
  };
  const gt = benchmarkRecord(allErrored, set(), META).cases.find(
    (c) => c.name === "gate-tampering",
  );
  expect(gt?.with.runs).toBe(0);
  expect(gt?.with.errored).toBe(2);
  expect(gt?.with.costUsd).toBeNull();
  expect(gt?.with.turns).toBeNull();
  close(gt?.with.passRate ?? null, 1);
  // A zero cost without: the ratio null.
  const freeWithout: Aggregate = {
    ...agg,
    cases: agg.cases.map((c) => ({
      ...c,
      without: c.without.map((run) => ({ ...run, costUsd: 0 })),
    })),
  };
  const r2 = benchmarkRecord(freeWithout, set(), META);
  expect(r2.totals.costWithout).toBe(0);
  expect(r2.totals.costRatio).toBeNull();
  // A partial run is said.
  const partial = benchmarkRecord({ ...agg, partial: true }, set(), META);
  expect(partial.run.partial).toBe(true);
  expect(renderMarkdown(partial)).toContain("## Partial run");
  expect(renderMarkdown(record())).not.toContain("## Partial run");
});

test("SP6-T5 AC-11: the benchmark invocation deep-equals the whole suite's with only the --tag values replaced; tags with a case are refused; the tagged cases, the set and the literal agree; the set's models and runs are the invocation's and the reference's; the drift lines", () => {
  // H118 AC-10: the same outputDir given to both, the deep-equal holds with the --tag values alone replaced.
  const outputDir = "plugins/core/evals/results/x";
  const suite = evalInvocation({ ...base, outputDir });
  const bench = evalInvocation({ ...base, tags: ["benchmark"], outputDir });
  const at = suite.args.indexOf("--tag");
  let end = at + 1;
  while (end < suite.args.length && !suite.args[end]?.startsWith("--")) end++;
  expect(bench.args).toEqual([
    ...suite.args.slice(0, at + 1),
    "benchmark",
    ...suite.args.slice(end),
  ]);
  expect(bench.path).toBe(suite.path);
  // --output-dir is one pair at the same place in both lists, the value as given, absent when not given.
  expect(suite.args.indexOf("--output-dir")).toBeGreaterThan(0);
  expect(suite.args.indexOf("--output-dir")).toBe(bench.args.indexOf("--output-dir"));
  expect(suite.args[suite.args.indexOf("--output-dir") + 1]).toBe(outputDir);
  expect(evalInvocation(base).args).not.toContain("--output-dir");
  expect(
    evalInvocation({
      ...base,
      caseName: "false-done",
      outputDir: "plugins/core/evals/results/y",
    }).args.join(" "),
  ).toContain("--output-dir plugins/core/evals/results/y --case false-done");
  expect(() => evalInvocation({ ...base, caseName: "false-done", tags: ["benchmark"] })).toThrow(
    "evalInvocation: a one-case run takes no tags",
  );
  const tagged = readdirSync(EVALS)
    .filter((name) => existsSync(join(EVALS, name, "case.yaml")))
    .filter((name) => tagsOf(name).includes("benchmark"))
    .sort();
  expect(tagged).toEqual(Object.keys(set().cases).sort());
  expect(tagged).toEqual([...EIGHTEEN].sort());
  const value = (flag: string) => suite.args[suite.args.indexOf(flag) + 1] ?? "";
  expect(set().models.agent).toBe(value("--model"));
  expect(set().models.judge).toBe(value("--judge-model"));
  const reference = JSON.parse(readFileSync(REFERENCE, "utf8")) as {
    cases: { runsPerCase: number }[];
  };
  expect(set().runs).toBe(reference.cases[0]?.runsPerCase ?? 0);
  expect(record().run.drift).toEqual([
    "agent model claude-opus-5-5 (the set names claude-sonnet-5-5)",
    "judge model claude-opus-5-5 (the set names claude-fable-5-1)",
    "runsPerCase 2 (the set names 3)",
  ]);
  const agg = fixture();
  const matching: Aggregate = {
    ...agg,
    suite: { ...agg.suite, modelOverride: "claude-sonnet-5-5", judgeModel: "claude-fable-5-1" },
    cases: agg.cases.map((c) => ({ ...c, runsPerCase: 3 })),
  };
  expect(benchmarkRecord(matching, set(), META).run.drift).toEqual([]);
});

test("SP6-T5 AC-12: the expected figures are distinct hand literals; the Markdown holds fmt of every numeric leaf; the two written files read back as the record; the real reference aggregate reads without refusing, its missing set cases not run, no figure NaN", () => {
  const r = record();
  const leaves = numbers(r);
  expect(leaves.some((n) => Number.isNaN(n))).toBe(false);
  const md = renderMarkdown(r);
  for (const n of leaves) expect(holdsFigure(md, n), `figure ${n}`).toBe(true);
  const out = mkdtempSync(join(tmpdir(), "benchmark-"));
  const [jsonPath, mdPath] = writeRecord(r, out).sort();
  expect(JSON.parse(readFileSync(jsonPath as string, "utf8"))).toEqual(r);
  const written = readFileSync(mdPath as string, "utf8");
  for (const n of leaves) expect(holdsFigure(written, n), `written figure ${n}`).toBe(true);
  // fmt itself: integers whole, fractions to four places, trailing zeros gone.
  expect(fmt(22)).toBe("22");
  expect(fmt(2 / 3)).toBe("0.6667");
  expect(fmt(5.9 / 3.75)).toBe("1.5733");
  expect(fmt(0.05)).toBe("0.05");
  expect(fmt(-0.5)).toBe("-0.5");
  // The kit's own output of 2026-10-17: read, never refused, its missing set cases named.
  const real = readAggregate(readFileSync(REFERENCE, "utf8"));
  const rr = benchmarkRecord(real, set(), { ...META, command: null });
  expect(rr.version).toBe("0.6.0");
  expect(rr.notRun).toContain("issue-fast-overhead");
  expect(rr.notRun).toContain("document-entry-opens-item");
  expect(rr.cases.map((c) => c.name)).toContain("proven-test-first");
  expect(numbers(rr).some((n) => Number.isNaN(n))).toBe(false);
  const referenceMd = renderMarkdown(rr);
  for (const n of numbers(rr))
    expect(holdsFigure(referenceMd, n), `reference figure ${n}`).toBe(true);
});

test("SP6-T5 AC-16: the usage check refuses a flag as a value: --from --out x exits 1 with the usage line and reads no file", () => {
  const run = spawnSync("bun", ["scripts/benchmark.ts", "--from", "--out", "x"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  expect(run.status).toBe(1);
  expect(run.stderr).toContain(
    "usage: bun scripts/benchmark.ts [--from <aggregate.json>] [--out <dir>]",
  );
  expect(run.stderr).not.toContain("ENOENT");
});

test("SP6-T5 AC-15: readSet reads the committed set as the test writes it out and refuses by field, naming the field and what it found", () => {
  const text = readFileSync(join(ROOT, SET_PATH), "utf8");
  expect(readSet(text)).toEqual(set());
  const s = JSON.parse(text) as BenchmarkSet;
  const altered = (patch: unknown) => JSON.stringify(patch);
  expect(() => readSet("[]")).toThrow("benchmark: the set is not an object");
  expect(() => readSet(altered({ ...s, cases: ["false-done"] }))).toThrow(
    "benchmark: set.cases is array, not object",
  );
  expect(() => readSet(altered({ ...s, cases: { ...s.cases, "false-done": "speed" } }))).toThrow(
    'benchmark: set.cases.false-done is "speed", not one of functional, security, cost',
  );
  expect(() => readSet(altered({ ...s, models: { ...s.models, agent: 3 } }))).toThrow(
    "benchmark: set.models.agent is number, not string",
  );
  expect(() => readSet(altered({ ...s, runs: "3" }))).toThrow(
    "benchmark: set.runs is string, not number",
  );
});

test("H118 AC-3 (SP6-T5 AC-13 rewritten): without --from the script gives the kit a folder of its own through --output-dir and writes the record from that folder's aggregate when the kit exits 1, with the kit's argument line as the command and the commit read at report time; a newer folder written beside it during the run changes nothing; the kit gone before it wrote is refused naming the status and the folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "benchmark-run-"));
  const bin = stubKit(dir);
  const aggregatePath = join(dir, "aggregate.json");
  writeFileSync(aggregatePath, fixtureText());
  // The decoy the stub writes beside the run's folder: a flagged trace, so a scan of it would refuse the record.
  const trace = writeTrace(join(dir, "denied.jsonl"), deniedRead("toolu_1", "build.md"));
  const decoyAggregate = join(dir, "decoy.json");
  writeFileSync(
    decoyAggregate,
    fixtureText().replace("/private/tmp/e-abc123/out/trace.jsonl", trace),
  );
  const decoy = join(OWN, `9999-decoy-${process.pid}`);
  const path = [bin, process.env.PATH ?? ""].join(delimiter);
  const log = join(dir, "stub.log");
  const env = {
    ...process.env,
    PATH: path,
    WIZARDINGCODE_CREW_EVAL_RESULTS: OWN_REL,
    TZ: "Pacific/Kiritimati",
    WIZARDINGCODE_STUB_AGGREGATE: aggregatePath,
    WIZARDINGCODE_STUB_EXIT: "1",
    WIZARDINGCODE_STUB_LOG: log,
    WIZARDINGCODE_STUB_DECOY: decoy,
    WIZARDINGCODE_STUB_DECOY_AGGREGATE: decoyAggregate,
  };
  expect(firstClaudeOn(composedPath(path))).toBe(bin);
  inOwnResults((before) => {
    const out = join(dir, "out");
    const run = spawnSync("bun", ["scripts/benchmark.ts", "--out", out], {
      cwd: ROOT,
      encoding: "utf8",
      env,
    });
    expect(run.status, run.stderr).toBe(0);
    expect(run.stdout).toContain("benchmark: the kit exited 1 (a case below the threshold)");
    expect(run.stderr).not.toContain("needs-rerun");
    expect(readdirSync(out).sort()).toEqual(["2026-10-17-0.6.0.json", "2026-10-17-0.6.0.md"]);
    const parsed = JSON.parse(readFileSync(join(out, "2026-10-17-0.6.0.json"), "utf8"));
    // The run's own folder: the kit's stamp and the benchmark suffix, holding the aggregate the stub copied there.
    const own = foldersSince(OWN, before).filter((f) => f !== basename(decoy));
    expect(own).toHaveLength(1);
    const folder = own[0] ?? "";
    expect(folder).toMatch(RUN_FOLDER);
    expect(folder.endsWith("-benchmark")).toBe(true);
    expect(readFileSync(join(OWN, folder, "aggregate-result.json"), "utf8")).toBe(fixtureText());
    // The command line: the --output-dir value is that folder, the rest deep-equals the line built here.
    const value = String(parsed.run.command).match(/--output-dir (\S+)/)?.[1];
    expect(value).toBe(`${OWN_REL}/${folder}`);
    const { args } = evalInvocation({
      root: ROOT,
      platform: process.platform,
      path,
      realGitDir: realGitDir(process.platform),
      tags: ["benchmark"],
      outputDir: value,
    });
    expect(parsed.run.command).toBe(`claude ${args.join(" ")}`);
    expect(parsed.run.command).toContain("--tag benchmark");
    expect(parsed.run.command).not.toContain(ROOT);
    const [cwd, logged] = readFileSync(log, "utf8").split("\n");
    expect(realpathSync(cwd ?? "")).toBe(realpathSync(ROOT));
    expect(logged).toContain(`--output-dir ${value}`);
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
    expect(head.stdout.trim()).toMatch(/^[0-9a-f]{40}$/);
    expect(parsed.run.reportCommit).toBe(head.stdout.trim());
    // The kit gone before it wrote: refused naming the status and the run's folder, nothing written.
    const gone = spawnSync("bun", ["scripts/benchmark.ts", "--out", join(dir, "out2")], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...env,
        WIZARDINGCODE_STUB_AGGREGATE: join(dir, "missing.json"),
        WIZARDINGCODE_STUB_EXIT: "3",
        WIZARDINGCODE_STUB_DECOY: "",
      },
    });
    expect(gone.status).toBe(1);
    const second = foldersSince(OWN, [...before, folder, basename(decoy)]);
    expect(second).toHaveLength(1);
    expect(gone.stderr).toContain(
      `benchmark: the kit exited 3 and wrote no aggregate in ${OWN_REL}/${second[0]}`,
    );
    expect(existsSync(join(dir, "out2"))).toBe(false);
  });
});

test("SP6-T5 AC-14: a run the runner flags needs-rerun writes no record: the lines and the rule printed with the way out, exit 1, --out left absent; the README says so and names the kit's statuses the record carries", () => {
  const dir = mkdtempSync(join(tmpdir(), "benchmark-rerun-"));
  const bin = stubKit(dir);
  // H118: the trace in the kit's line shape, a Read of the reference denied.
  const trace = writeTrace(join(dir, "trace.jsonl"), deniedRead("toolu_1", "build.md"));
  const aggregatePath = join(dir, "aggregate.json");
  writeFileSync(
    aggregatePath,
    fixtureText().replace("/private/tmp/e-abc123/out/trace.jsonl", trace),
  );
  const path = [bin, process.env.PATH ?? ""].join(delimiter);
  expect(firstClaudeOn(composedPath(path))).toBe(bin);
  inOwnResults((before) => {
    const run = spawnSync("bun", ["scripts/benchmark.ts", "--out", join(dir, "out")], {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: path,
        WIZARDINGCODE_CREW_EVAL_RESULTS: OWN_REL,
        WIZARDINGCODE_STUB_AGGREGATE: aggregatePath,
        WIZARDINGCODE_STUB_EXIT: "0",
      },
    });
    expect(run.status).toBe(1);
    const own = foldersSince(OWN, before);
    expect(own).toHaveLength(1);
    expect(run.stderr).toContain(
      "needs-rerun: proven-test-first (reference read denied: skills/crew/references/build.md)",
    );
    expect(run.stderr).toContain(
      `benchmark: a run the runner flags needs-rerun is run once more; no record written (to write it from this aggregate anyway: bun scripts/benchmark.ts --from ${join(OWN, own[0] ?? "", "aggregate-result.json")})`,
    );
    expect(existsSync(join(dir, "out"))).toBe(false);
  });
  const readme = readFileSync(join(ROOT, "docs", "benchmark", "README.md"), "utf8");
  expect(readme).toContain(
    "The script exits 0 once the record is written, whatever the kit's status: 1 says a case scored below the threshold and 2 a partial run, both carried in the record; a run that left no aggregate is refused naming the status.",
  );
  expect(readme).toContain(
    "A run the runner flags `needs-rerun` (a reference read denied to the agent, `plugins/core/evals/README.md`) writes no record: run it again, or write the record from that run's aggregate with `--from` once you have decided the run stands.",
  );
});

test("SP6-T5 AC-18: in every set case of the fixture the with arm's score differs from its pass rate, so the pass rate the record carries is the pass rate read", () => {
  const raw = JSON.parse(fixtureText()) as {
    cases: { name: string; aggregates: { score: number; passRate: number } }[];
  };
  const inSet = raw.cases.filter((c) => EIGHTEEN.includes(c.name));
  expect(inSet).toHaveLength(5);
  for (const c of inSet) expect(c.aggregates.score, c.name).not.toBe(c.aggregates.passRate);
  expect(record().cases.find((c) => c.name === "proven-test-first")?.with.passRate).toBe(1);
});

test("SP6-T5 AC-19: the runsPerCase drift reads the set's cases alone (the case outside the set carries 9); mixed in-set values give run.runsPerCase null and the line names them in order", () => {
  const raw = JSON.parse(fixtureText()) as { cases: { name: string; runsPerCase: number }[] };
  expect(raw.cases.find((c) => c.name === "personalities-differ")?.runsPerCase).toBe(9);
  expect(record().run.runsPerCase).toBe(2);
  expect(record().run.drift).toContain("runsPerCase 2 (the set names 3)");
  const agg = fixture();
  const mixed: Aggregate = {
    ...agg,
    cases: agg.cases.map((c) => (c.name === "proven-test-first" ? { ...c, runsPerCase: 3 } : c)),
  };
  const r = benchmarkRecord(mixed, set(), META);
  expect(r.run.runsPerCase).toBeNull();
  expect(r.run.drift).toContain("runsPerCase 3, 2 (the set names 3)");
});

test("SP6-T5 AC-20: the cost category's arms differ (fast-route-overhead without one failed run), so a swap of the arms fails the cost rows", () => {
  const r = record();
  const fro = r.cases.find((c) => c.name === "fast-route-overhead");
  close(fro?.with.passRate ?? null, 1);
  close(fro?.without.passRate ?? null, 0.5);
  expect(fro?.delta).toBe(0.5);
  close(r.categories.cost.passRateWith, 1);
  close(r.categories.cost.passRateWithout, 0.5);
  expect(fro?.with.passRate).not.toBe(fro?.without.passRate);
});

test("SP6-T5 AC-17: the walk matches a figure at a boundary alone, the commit is free of digits, and the fixture's rows are pinned literally, so a cell removed from renderMarkdown fails", () => {
  expect(META.reportCommit).not.toMatch(/\d/);
  expect(holdsFigure("| 9 | 3 |", 3)).toBe(true);
  expect(holdsFigure("| 0.85 |", 0.8)).toBe(false);
  expect(holdsFigure("abcdef1234abcdef", 1234)).toBe(false);
  expect(holdsFigure("2026-10-17", 10)).toBe(false);
  expect(holdsFigure("| -0.5 |", 0.5)).toBe(false);
  expect(holdsFigure("| -0.5 |", -0.5)).toBe(true);
  expect(holdsFigure("ratio: 1.5733.", 1.5733)).toBe(true);
  expect(holdsFigure("version 0.6.0.", 0.6)).toBe(false);
  const md = renderMarkdown(record());
  for (const line of [
    "| functional | 9 | 3 | 0.6667 | 0.5 |",
    "| security | 7 | 1 | 1 | 0 |",
    "| cost | 2 | 1 | 1 | 0.5 |",
    "| proven-test-first | functional | 2 (0) | 1 | 1.2 | 0.2 | 120 | 5 | 2 (0) | 0.5 | 0.6 | 0.1 | 60 | 2 | 0.5 |",
    "| brief-per-todo | functional | 1 (1) | 0.5 | 0.9 | 0.1 | 90 | 7 | 2 (0) | 1 | 0.4 | 0.1 | 40 | 4 | -0.5 |",
    "| Cost (USD) | 5.9 | 3.75 |",
    "| Judge cost (USD) | 0.85 | 0.65 |",
    "| Time (s) | 590 | 375 |",
    "| Turns | 22 | 18 |",
    "Cost ratio, with over without: 1.5733.",
  ])
    expect(md, line).toContain(line);
});

test("H118 AC-8 (SP6-T5 AC-21 rewritten): a run whose own folder holds no aggregate is refused naming the status and the folder, nothing written, while decoy older and newer folders holding distinct aggregates are never read; the kit runs with cwd the repository root wherever the script is run from", () => {
  const dir = mkdtempSync(join(tmpdir(), "benchmark-empty-"));
  const bin = stubKit(dir);
  const older = join(OWN, `0000-older-${process.pid}`);
  const newer = join(OWN, `9999-newer-${process.pid}`);
  const path = [bin, process.env.PATH ?? ""].join(delimiter);
  expect(firstClaudeOn(composedPath(path))).toBe(bin);
  // Distinct aggregates: a record read from either would carry another version's stem.
  expect(fixtureText()).toContain('"version": "0.6.0"');
  const olderAggregate = join(dir, "older.json");
  writeFileSync(olderAggregate, fixtureText().replace('"version": "0.6.0"', '"version": "0.5.9"'));
  const newerAggregate = join(dir, "newer.json");
  writeFileSync(newerAggregate, fixtureText().replace('"version": "0.6.0"', '"version": "0.6.1"'));
  const ownAggregate = join(dir, "own.json");
  writeFileSync(ownAggregate, fixtureText());
  inOwnResults((before) => {
    mkdirSync(older, { recursive: true });
    writeFileSync(join(older, "aggregate-result.json"), readFileSync(olderAggregate));
    const log = join(dir, "stub.log");
    // From another cwd, with nothing to copy: the folder is created under the repository, the kit
    // runs there, the newer decoy appears during the run, and the empty folder is refused.
    const run = spawnSync(
      "bun",
      [join(ROOT, "scripts", "benchmark.ts"), "--out", join(dir, "out")],
      {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: path,
          WIZARDINGCODE_CREW_EVAL_RESULTS: OWN_REL,
          WIZARDINGCODE_STUB_AGGREGATE: join(dir, "missing.json"),
          WIZARDINGCODE_STUB_EXIT: "0",
          WIZARDINGCODE_STUB_LOG: log,
          WIZARDINGCODE_STUB_DECOY: newer,
          WIZARDINGCODE_STUB_DECOY_AGGREGATE: newerAggregate,
        },
      },
    );
    expect(run.status).toBe(1);
    const own = foldersSince(OWN, [...before, basename(older)]).filter(
      (f) => f !== basename(newer),
    );
    expect(own).toHaveLength(1);
    expect(own[0]).toMatch(RUN_FOLDER);
    expect(run.stderr).toContain(
      `benchmark: the kit exited 0 and wrote no aggregate in ${OWN_REL}/${own[0]}`,
    );
    expect(existsSync(join(dir, "out"))).toBe(false);
    expect(realpathSync(readFileSync(log, "utf8").split("\n")[0] ?? "")).toBe(realpathSync(ROOT));
    // From another cwd with an aggregate: the record is written from the run's own folder, the decoys' versions nowhere.
    const good = spawnSync(
      "bun",
      [join(ROOT, "scripts", "benchmark.ts"), "--out", join(dir, "out2")],
      {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: path,
          WIZARDINGCODE_CREW_EVAL_RESULTS: OWN_REL,
          TZ: "Pacific/Kiritimati",
          WIZARDINGCODE_STUB_AGGREGATE: ownAggregate,
          WIZARDINGCODE_STUB_EXIT: "0",
        },
      },
    );
    expect(good.status, good.stderr).toBe(0);
    expect(readdirSync(join(dir, "out2")).sort()).toEqual([
      "2026-10-17-0.6.0.json",
      "2026-10-17-0.6.0.md",
    ]);
  });
});

test("SP6-T5 AC-22: the run section's lines and the remaining Cases rows are pinned literally; the main reads the set through readSet; the models.judge refusal; no redundant category cast", () => {
  const md = renderMarkdown(record());
  for (const line of [
    "(kit schema 1, Claude Code 2.1.302); record schema 1.",
    "- Started 2026-10-17T23:50:55.029Z; 1234 s; 12.5 USD in all, the kit's own total.",
    "- Models: agent claude-opus-5-5, judge claude-opus-5-5; runs per case 2; threshold 1; ablation with-without; tags benchmark.",
    "| false-done | functional | 2 (0) | 0.5 | 2.5 | 0.3 | 250 | 4 | 2 (0) | 0 | 0.5 | 0.1 | 50 | 2 | 0.5 |",
    "| gate-tampering | security | 2 (0) | 1 | 0.8 | 0.2 | 80 | 3 | 2 (0) | 0 | 2 | 0.3 | 200 | 9 | 1 |",
    "| fast-route-overhead | cost | 2 (0) | 1 | 0.5 | 0.05 | 50 | 3 | 2 (0) | 0.5 | 0.25 | 0.05 | 25 | 1 | 0.5 |",
  ])
    expect(md, line).toContain(line);
  const benchmarkSource = readFileSync(join(ROOT, "scripts", "benchmark.ts"), "utf8");
  expect(benchmarkSource).toContain(
    'const set = readSet(readFileSync(join(ROOT, SET_PATH), "utf8"));',
  );
  expect(benchmarkSource).not.toContain("as BenchmarkSet");
  expect(benchmarkSource).not.toContain("set.cases[name] as Category");
  const s = JSON.parse(readFileSync(join(ROOT, SET_PATH), "utf8")) as BenchmarkSet;
  expect(() => readSet(JSON.stringify({ ...s, models: { ...s.models, judge: null } }))).toThrow(
    "benchmark: set.models.judge is null, not string",
  );
});

test("SP6-T5 AC-23: a path-shaped version or startedAt in the aggregate is refused before anything is written, writeRecord refuses a stem that is not a file name, and a crafted aggregate under --from writes nothing inside or outside --out", () => {
  const badVersion = fixtureText().replace('"version": "0.6.0"', '"version": "/../../x"');
  expect(() => readAggregate(badVersion)).toThrow(
    'benchmark: suite.plugins[0].version is "/../../x", not a version (X.Y.Z)',
  );
  const badStart = fixtureText().replace(
    '"startedAt": "2026-10-17T23:50:55.029Z"',
    '"startedAt": "../../../x"',
  );
  expect(() => readAggregate(badStart)).toThrow(
    'benchmark: startedAt is "../../../x", not an ISO instant (YYYY-MM-DDT…)',
  );
  expect(() =>
    readAggregate(fixtureText().replace('"version": "0.6.0"', '"version": "0.11.0-rc.1"')),
  ).not.toThrow();
  // writeRecord's own guard, the reader bypassed.
  const out = mkdtempSync(join(tmpdir(), "benchmark-escape-"));
  expect(() => writeRecord({ ...record(), version: "/../../x" }, out)).toThrow(
    "benchmark: the record's stem 2026-10-17-/../../x is not a file name",
  );
  expect(readdirSync(out)).toEqual([]);
  // The script under --from: refused, nothing inside or outside --out.
  const aggregatePath = join(out, "crafted.json");
  writeFileSync(aggregatePath, badVersion);
  const records = join(out, "records");
  const run = spawnSync(
    "bun",
    ["scripts/benchmark.ts", "--from", aggregatePath, "--out", records],
    {
      cwd: ROOT,
      encoding: "utf8",
    },
  );
  expect(run.status).toBe(1);
  expect(run.stderr).toContain(
    'benchmark: suite.plugins[0].version is "/../../x", not a version (X.Y.Z)',
  );
  expect(existsSync(records)).toBe(false);
  expect(existsSync(resolve(records, "2026-10-17-/../../x.json"))).toBe(false);
  expect(readdirSync(out)).toEqual(["crafted.json"]);
});

// Consolidation item 7 (2026-10-22-014, finding 116): an all-errored arm leaves its case out of the
// totals, and writeRecord neither overwrites a record nor writes one that holds a secret.

/** The fixture with every run of one arm of gate-tampering errored, and the record of each. */
const erroredArm = (arm: "with" | "without") => {
  const agg = fixture();
  const normal = benchmarkRecord(agg, set(), META);
  const allErrored: Aggregate = {
    ...agg,
    cases: agg.cases.map((c) =>
      c.name === "gate-tampering"
        ? { ...c, [arm]: c[arm].map((run) => ({ ...run, errored: true })) }
        : c,
    ),
  };
  const r = benchmarkRecord(allErrored, set(), META);
  const gt = normal.cases.find((c) => c.name === "gate-tampering");
  expect(gt).toBeDefined();
  return { normal, r, g: gt as (typeof normal.cases)[number] };
};

/** Gate-tampering's figures out of both arms' totals, the other cases' sums as they were, the Markdown naming it under the totals. */
const expectLeftOut = (
  normal: ReturnType<typeof benchmarkRecord>,
  r: ReturnType<typeof benchmarkRecord>,
  g: ReturnType<typeof benchmarkRecord>["cases"][number],
) => {
  close(r.totals.costWith, normal.totals.costWith - (g.with.costUsd ?? 0));
  close(r.totals.costWithout, normal.totals.costWithout - (g.without.costUsd ?? 0));
  close(r.totals.judgeCostWithout, normal.totals.judgeCostWithout - (g.without.judgeCostUsd ?? 0));
  close(r.totals.durationWithout, normal.totals.durationWithout - (g.without.durationSeconds ?? 0));
  close(r.totals.turnsWithout, normal.totals.turnsWithout - (g.without.turns ?? 0));
  close(r.totals.costRatio, r.totals.costWith / r.totals.costWithout);
  const md = renderMarkdown(r);
  const totals = md.slice(md.indexOf("## Totals"), md.indexOf("## Not run"));
  expect(totals).toContain("gate-tampering");
};

test("CON7-AC-2 (finding 116): a case whose with arm all errored is named with that arm and left out of both arms' totals", () => {
  const { normal, r, g } = erroredArm("with");
  // The case is named, with the arm whose runs all errored.
  expect((r as unknown as { excluded?: unknown }).excluded).toEqual([
    { case: "gate-tampering", arm: "with" },
  ]);
  expect((normal as unknown as { excluded?: unknown }).excluded).toEqual([]);
  // Out of both arms' totals; the other cases' sums as they were.
  expectLeftOut(normal, r, g);
});

test("CON7-AC-2-without (finding 116): a case whose without arm all errored is named with that arm and left out of both arms' totals", () => {
  const { normal, r, g } = erroredArm("without");
  expect((r as unknown as { excluded?: unknown }).excluded).toEqual([
    { case: "gate-tampering", arm: "without" },
  ]);
  close(r.totals.judgeCostWith, normal.totals.judgeCostWith - (g.with.judgeCostUsd ?? 0));
  expectLeftOut(normal, r, g);
  expect(renderMarkdown(r)).toContain("gate-tampering (without)");
});

/** The message a call refuses with, or null when it did not refuse. */
const refusalOf = (call: () => unknown): string | null => {
  try {
    call();
    return null;
  } catch (error) {
    return (error as Error).message;
  }
};

test("CON7-AC-3-exists (finding 116): writeRecord refuses a record whose stem exists as either file, naming it, the earlier file byte for byte, nothing else written", () => {
  const dir = mkdtempSync(join(tmpdir(), "benchmark-write-"));
  try {
    const r = record();
    const stem = `${r.run.startedAt.slice(0, 10)}-${r.version}`;
    for (const ext of ["json", "md"]) {
      const out = join(dir, `exists-${ext}`);
      mkdirSync(out);
      const existing = join(out, `${stem}.${ext}`);
      writeFileSync(existing, `the earlier record's ${ext}\n`);
      const message = refusalOf(() => writeRecord(r, out));
      expect(message, ext).not.toBeNull();
      expect(message ?? "", ext).toContain(`${stem}.${ext}`);
      expect(readFileSync(existing, "utf8"), ext).toBe(`the earlier record's ${ext}\n`);
      expect(readdirSync(out), ext).toEqual([`${stem}.${ext}`]);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CON7-AC-3-secret (finding 116): writeRecord refuses a record holding a value the secrets scan flags, naming the file and the rule, never the value, neither file written", () => {
  const dir = mkdtempSync(join(tmpdir(), "benchmark-write-"));
  try {
    const r = record();
    const stem = `${r.run.startedAt.slice(0, 10)}-${r.version}`;
    const keyed = { ...r, run: { ...r.run, command: `claude plugin eval --key ${KEY_SHAPED}` } };
    expect(scanText(JSON.stringify(keyed, null, 2), "json").length).toBeGreaterThan(0);
    const out = join(dir, "keyed");
    const message = refusalOf(() => writeRecord(keyed, out));
    expect(message).not.toBeNull();
    expect(message ?? "").not.toContain(KEY_SHAPED);
    expect(message ?? "").not.toContain(KEY_SHAPED.slice(0, 20));
    const rule = scanText(renderMarkdown(keyed), "md")[0]?.rule ?? "";
    expect(rule, "the Markdown is flagged by a named rule").not.toBe("");
    expect(
      (message ?? "").includes(rule) || (message ?? "").includes(stem),
      `the refusal names the rule or the file: ${message}`,
    ).toBe(true);
    // The JSON is scanned first: the refusal names it and the rule that flagged it.
    const jsonRule = scanText(`${JSON.stringify(keyed, null, 2)}\n`, `${stem}.json`)[0]?.rule ?? "";
    expect(jsonRule).not.toBe("");
    expect(message ?? "").toContain(`${stem}.json`);
    expect(message ?? "").toContain(`(${jsonRule})`);
    expect(existsSync(join(out, `${stem}.json`))).toBe(false);
    expect(existsSync(join(out, `${stem}.md`))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CON7-AC-3-md-only (finding 116): a value flagged in the Markdown alone (the JSON escapes its quotes) is refused too, never quoted, neither file written", () => {
  const dir = mkdtempSync(join(tmpdir(), "benchmark-write-"));
  try {
    const r = record();
    const stem = `${r.run.startedAt.slice(0, 10)}-${r.version}`;
    const secret = ["Zq7Wm2Rt9", "Lp4Xv8Nb3", "Kc6Hd1"].join("");
    const quoted = { ...r, run: { ...r.run, command: `run --api_key="${secret}"` } };
    expect(scanText(`${JSON.stringify(quoted, null, 2)}\n`, "json")).toEqual([]);
    expect(scanText(renderMarkdown(quoted), "md").length).toBeGreaterThan(0);
    const mdOut = join(dir, "md-only");
    const mdMessage = refusalOf(() => writeRecord(quoted, mdOut));
    expect(mdMessage).not.toBeNull();
    expect(mdMessage ?? "").not.toContain(secret);
    expect(existsSync(join(mdOut, `${stem}.json`))).toBe(false);
    expect(existsSync(join(mdOut, `${stem}.md`))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
