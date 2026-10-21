#!/usr/bin/env bun
/**
 * The public benchmark (SP6 Task 5; the plan's decision 11; the vision's §15 and rule 18): the
 * cases tagged `benchmark` run through the eval kit as the whole suite runs, with the tag list
 * alone replaced, and a record is written from the kit's aggregate result and nothing else.
 * `bun scripts/benchmark.ts` runs the kit and writes `docs/benchmark/<date>-<version>.md` and
 * `.json`; `--from <aggregate.json>` writes the report alone; `--out <dir>` names another folder.
 * The record reads a fixed list of the aggregate's fields (`readAggregate`): a trace path, the
 * suite's root, a plugin's path, a grader's explanation or an error's text is never read, so it
 * never enters the record; `<version>` is the plugin version the aggregate names and `<date>` the
 * UTC day of the run's start, so a record can never name a version that did not run.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { runKit, scanResults } from "./eval.ts";

export type Category = "functional" | "security" | "cost";
export const CATEGORIES: Category[] = ["functional", "security", "cost"];
export interface BenchmarkSet {
  cases: Record<string, Category>;
  models: { agent: string; judge: string };
  runs: number;
}
export const SET_PATH = "plugins/core/evals/benchmark.json";
export const PLUGIN_NAME = "wizardingcode-developer-crew";
export const SCHEMA_VERSION = 1;
const ROOT = join(import.meta.dir, "..");

/** A run as the record reads it: the figures of a run that finished, or `errored` with nothing else read. */
export interface Run {
  errored: boolean;
  turns: number;
  costUsd: number;
  judgeCostUsd: number;
  durationSeconds: number;
}
export interface AggregateCase {
  name: string;
  runsPerCase: number;
  with: Run[];
  without: Run[];
  passRate: number;
  passRateWithout: number;
  delta: number;
}
/** The aggregate as the record reads it: the allow-list of fields, and no other. */
export interface Aggregate {
  schemaVersion: 1;
  claudeVersion: string;
  startedAt: string;
  durationSeconds: number;
  costUsd: number;
  partial: boolean;
  suite: {
    ablation: string;
    modelOverride: string | null;
    judgeModel: string | null;
    tagFilters: string[];
    threshold: number;
    pluginVersion: string;
  };
  cases: AggregateCase[];
}

type Expected = "string" | "number" | "boolean" | "array" | "object";
const typeOf = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
/** The field at `path` as the type the record reads, or the refusal naming the field and both types. */
function field<T>(value: unknown, path: string, expected: Expected): T {
  const found = typeOf(value);
  if (found !== expected) throw new Error(`benchmark: ${path} is ${found}, not ${expected}`);
  return value as T;
}
const optionalString = (value: unknown, path: string): string | null =>
  value === null || value === undefined ? null : field<string>(value, path, "string");
/** A string field that must have a shape, since it reaches a file name: refused naming the value. */
function shaped(value: unknown, path: string, pattern: RegExp, expected: string): string {
  const text = field<string>(value, path, "string");
  if (!pattern.test(text))
    throw new Error(`benchmark: ${path} is ${JSON.stringify(text)}, not ${expected}`);
  return text;
}
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T/;
const VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/;

function readRun(raw: unknown, path: string): Run {
  const run = field<Record<string, unknown>>(raw, path, "object");
  // A run with an error: counted, its figures never read (the error's text neither).
  if (run.error !== null && run.error !== undefined)
    return {
      errored: true,
      turns: 0,
      costUsd: 0,
      judgeCostUsd: 0,
      durationSeconds: 0,
    };
  // Read for their type, as the allow-list names them; no formula uses them.
  field(run.passed, `${path}.passed`, "boolean");
  field(run.score, `${path}.score`, "number");
  return {
    errored: false,
    turns: field(run.turns, `${path}.turns`, "number"),
    costUsd: field(run.costUsd, `${path}.costUsd`, "number"),
    judgeCostUsd: field(run.judgeCostUsd, `${path}.judgeCostUsd`, "number"),
    durationSeconds: field(run.durationSeconds, `${path}.durationSeconds`, "number"),
  };
}

function readCase(raw: unknown, path: string): AggregateCase {
  const c = field<Record<string, unknown>>(raw, path, "object");
  const arms = field<Record<string, unknown>>(c.arms, `${path}.arms`, "object");
  const aggregates = field<Record<string, unknown>>(c.aggregates, `${path}.aggregates`, "object");
  const runs = (arm: "with" | "without") =>
    field<unknown[]>(arms[arm], `${path}.arms.${arm}`, "array").map((r, i) =>
      readRun(r, `${path}.arms.${arm}[${i}]`),
    );
  return {
    name: field(c.name, `${path}.name`, "string"),
    runsPerCase: field(c.runsPerCase, `${path}.runsPerCase`, "number"),
    with: runs("with"),
    without: runs("without"),
    passRate: field(aggregates.passRate, `${path}.aggregates.passRate`, "number"),
    passRateWithout: field(
      aggregates.passRateWithout,
      `${path}.aggregates.passRateWithout`,
      "number",
    ),
    delta: field(aggregates.delta, `${path}.aggregates.delta`, "number"),
  };
}

/**
 * The kit's aggregate result read into the fields the record uses, refused when it is not the
 * schema the report reads, when its arms are not with and without, when it names no plugin of
 * ours, or when a read field has the wrong type (each refusal names what it found).
 */
export function readAggregate(text: string): Aggregate {
  const raw: unknown = JSON.parse(text);
  if (typeOf(raw) !== "object") throw new Error("benchmark: the aggregate is not an object");
  const top = raw as Record<string, unknown>;
  if (!("schemaVersion" in top)) throw new Error("benchmark: the aggregate has no schemaVersion");
  if (top.schemaVersion !== SCHEMA_VERSION)
    throw new Error(
      `benchmark: aggregate schemaVersion ${String(top.schemaVersion)} is not the one the report reads (${SCHEMA_VERSION})`,
    );
  const suite = field<Record<string, unknown>>(top.suite, "suite", "object");
  const ablation = field<string>(suite.ablation, "suite.ablation", "string");
  if (ablation !== "with-without")
    throw new Error(
      `benchmark: the aggregate's suite.ablation is ${ablation}, not with-without (a one-case run has no without arm)`,
    );
  const plugins = field<unknown[]>(suite.plugins, "suite.plugins", "array").map((p, i) =>
    field<Record<string, unknown>>(p, `suite.plugins[${i}]`, "object"),
  );
  const at = plugins.findIndex((p) => p.name === PLUGIN_NAME);
  const plugin = plugins[at];
  if (!plugin) throw new Error(`benchmark: the aggregate names no plugin ${PLUGIN_NAME}`);
  return {
    schemaVersion: 1,
    claudeVersion: field(top.claudeVersion, "claudeVersion", "string"),
    startedAt: shaped(top.startedAt, "startedAt", ISO_INSTANT, "an ISO instant (YYYY-MM-DDT…)"),
    durationSeconds: field(top.durationSeconds, "durationSeconds", "number"),
    costUsd: field(top.costUsd, "costUsd", "number"),
    partial: field(top.partial, "partial", "boolean"),
    suite: {
      ablation,
      modelOverride: optionalString(suite.modelOverride, "suite.modelOverride"),
      judgeModel: optionalString(suite.judgeModel, "suite.judgeModel"),
      tagFilters: field<unknown[]>(suite.tagFilters, "suite.tagFilters", "array").map((t, i) =>
        field<string>(t, `suite.tagFilters[${i}]`, "string"),
      ),
      threshold: field(suite.threshold, "suite.threshold", "number"),
      pluginVersion: shaped(
        plugin.version,
        `suite.plugins[${at}].version`,
        VERSION,
        "a version (X.Y.Z)",
      ),
    },
    cases: field<unknown[]>(top.cases, "cases", "array").map((c, i) => readCase(c, `cases[${i}]`)),
  };
}

export interface ArmFigures {
  runs: number;
  errored: number;
  passRate: number;
  costUsd: number | null;
  judgeCostUsd: number | null;
  durationSeconds: number | null;
  turns: number | null;
}
export interface CaseRecord {
  name: string;
  category: Category;
  with: ArmFigures;
  without: ArmFigures;
  delta: number;
}
export interface CategoryRecord {
  cases: string[];
  ran: number;
  passRateWith: number | null;
  passRateWithout: number | null;
}
export interface Totals {
  costWith: number;
  costWithout: number;
  costRatio: number | null;
  judgeCostWith: number;
  judgeCostWithout: number;
  durationWith: number;
  durationWithout: number;
  turnsWith: number;
  turnsWithout: number;
}
export interface BenchmarkRecord {
  schemaVersion: 1;
  version: string;
  writtenAt: string;
  kit: { schemaVersion: 1; claudeVersion: string };
  run: {
    startedAt: string;
    durationSeconds: number;
    costUsd: number;
    partial: boolean;
    ablation: string;
    tagFilters: string[];
    threshold: number;
    command: string | null;
    reportCommit: string;
    models: { agent: string | null; judge: string | null };
    runsPerCase: number | null;
    drift: string[];
  };
  categories: Record<Category, CategoryRecord>;
  cases: CaseRecord[];
  totals: Totals;
  notRun: string[];
}
export interface RecordMeta {
  command: string | null;
  reportCommit: string;
  writtenAt: string;
}

/**
 * The benchmark set read from `plugins/core/evals/benchmark.json`, refused by field as the
 * aggregate is: `benchmark: the set is not an object`, `benchmark: set.<path> is <found>, not
 * <expected>`, and a category outside the three named with its value.
 */
export function readSet(text: string): BenchmarkSet {
  const raw: unknown = JSON.parse(text);
  if (typeOf(raw) !== "object") throw new Error("benchmark: the set is not an object");
  const s = raw as Record<string, unknown>;
  const cases: Record<string, Category> = {};
  for (const [name, category] of Object.entries(
    field<Record<string, unknown>>(s.cases, "set.cases", "object"),
  )) {
    if (!CATEGORIES.includes(category as Category))
      throw new Error(
        `benchmark: set.cases.${name} is ${JSON.stringify(category)}, not one of ${CATEGORIES.join(", ")}`,
      );
    cases[name] = category as Category;
  }
  const models = field<Record<string, unknown>>(s.models, "set.models", "object");
  return {
    cases,
    models: {
      agent: field(models.agent, "set.models.agent", "string"),
      judge: field(models.judge, "set.models.judge", "string"),
    },
    runs: field(s.runs, "set.runs", "number"),
  };
}

const mean = (xs: number[]): number | null =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
const sum = (xs: (number | null)[]): number => xs.reduce<number>((a, b) => a + (b ?? 0), 0);
/** One arm of a case: the kit's pass rate, the means over the runs that finished, the errored ones counted. */
function armFigures(runs: Run[], passRate: number): ArmFigures {
  const done = runs.filter((r) => !r.errored);
  return {
    runs: done.length,
    errored: runs.length - done.length,
    passRate,
    costUsd: mean(done.map((r) => r.costUsd)),
    judgeCostUsd: mean(done.map((r) => r.judgeCostUsd)),
    durationSeconds: mean(done.map((r) => r.durationSeconds)),
    turns: mean(done.map((r) => r.turns)),
  };
}

/**
 * The record of a run: one formula per field. A case's pass rate per arm is the kit's; its cost,
 * judge cost, time and turns per arm are means over the runs that finished; a category's rates
 * are means over its run cases (null when none ran); the totals are the sums of the case means
 * (one run of the set per arm) and the cost ratio with over without (null on a zero without); a
 * case of the set the run did not cover is `notRun`, a case outside the set counts nowhere; the
 * models and the runs per case are the aggregate's, and `drift` names where they differ from the
 * set's.
 */
export function benchmarkRecord(
  aggregate: Aggregate,
  set: BenchmarkSet,
  meta: RecordMeta,
): BenchmarkRecord {
  const names = Object.keys(set.cases);
  const byName = new Map(aggregate.cases.map((c) => [c.name, c]));
  const cases: CaseRecord[] = [];
  const notRun: string[] = [];
  for (const [name, category] of Object.entries(set.cases)) {
    const c = byName.get(name);
    if (!c) {
      notRun.push(name);
      continue;
    }
    cases.push({
      name,
      category,
      with: armFigures(c.with, c.passRate),
      without: armFigures(c.without, c.passRateWithout),
      delta: c.delta,
    });
  }
  const categories = Object.fromEntries(
    CATEGORIES.map((category) => {
      const ran = cases.filter((c) => c.category === category);
      return [
        category,
        {
          cases: names.filter((n) => set.cases[n] === category),
          ran: ran.length,
          passRateWith: mean(ran.map((c) => c.with.passRate)),
          passRateWithout: mean(ran.map((c) => c.without.passRate)),
        },
      ];
    }),
  ) as Record<Category, CategoryRecord>;
  const costWith = sum(cases.map((c) => c.with.costUsd));
  const costWithout = sum(cases.map((c) => c.without.costUsd));
  const totals: Totals = {
    costWith,
    costWithout,
    costRatio: costWithout > 0 ? costWith / costWithout : null,
    judgeCostWith: sum(cases.map((c) => c.with.judgeCostUsd)),
    judgeCostWithout: sum(cases.map((c) => c.without.judgeCostUsd)),
    durationWith: sum(cases.map((c) => c.with.durationSeconds)),
    durationWithout: sum(cases.map((c) => c.without.durationSeconds)),
    turnsWith: sum(cases.map((c) => c.with.turns)),
    turnsWithout: sum(cases.map((c) => c.without.turns)),
  };
  const perCase = [
    ...new Set(aggregate.cases.filter((c) => names.includes(c.name)).map((c) => c.runsPerCase)),
  ];
  const drift: string[] = [];
  const agent = aggregate.suite.modelOverride;
  const judge = aggregate.suite.judgeModel;
  if (agent !== set.models.agent)
    drift.push(`agent model ${agent ?? "unset"} (the set names ${set.models.agent})`);
  if (judge !== set.models.judge)
    drift.push(`judge model ${judge ?? "unset"} (the set names ${set.models.judge})`);
  if (perCase.length !== 1 || perCase[0] !== set.runs)
    drift.push(`runsPerCase ${perCase.join(", ") || "none"} (the set names ${set.runs})`);
  return {
    schemaVersion: 1,
    version: aggregate.suite.pluginVersion,
    writtenAt: meta.writtenAt,
    kit: { schemaVersion: 1, claudeVersion: aggregate.claudeVersion },
    run: {
      startedAt: aggregate.startedAt,
      durationSeconds: aggregate.durationSeconds,
      costUsd: aggregate.costUsd,
      partial: aggregate.partial,
      ablation: aggregate.suite.ablation,
      tagFilters: aggregate.suite.tagFilters,
      threshold: aggregate.suite.threshold,
      command: meta.command,
      reportCommit: meta.reportCommit,
      models: { agent, judge },
      runsPerCase: perCase.length === 1 ? (perCase[0] as number) : null,
      drift,
    },
    categories,
    cases,
    totals,
    notRun,
  };
}

/** The one way a figure is printed: an integer whole, a fraction to four places, trailing zeros gone. */
export const fmt = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
const cell = (n: number | null): string => (n === null ? "none" : fmt(n));
/** The record's stem: the UTC day the run started and the plugin version it ran. */
export const recordStem = (record: BenchmarkRecord): string =>
  `${record.run.startedAt.slice(0, 10)}-${record.version}`;

/** The record as Markdown, rendered from the record alone: every figure of the JSON appears through `fmt`. */
export function renderMarkdown(record: BenchmarkRecord): string {
  const { run, totals } = record;
  const lines: string[] = [
    `# Benchmark ${run.startedAt.slice(0, 10)}, ${PLUGIN_NAME} ${record.version}`,
    "",
    `Written ${record.writtenAt} from the eval kit's aggregate result (kit schema ${fmt(record.kit.schemaVersion)}, Claude Code ${record.kit.claudeVersion}); record schema ${fmt(record.schemaVersion)}. The figures are the aggregate's and nothing else: a case the set names and the run did not cover is listed as not run, a case outside the set counts nowhere.`,
    "",
    "## The run",
    "",
    `- Started ${run.startedAt}; ${fmt(run.durationSeconds)} s; ${fmt(run.costUsd)} USD in all, the kit's own total.`,
    `- Models: agent ${run.models.agent ?? "unset"}, judge ${run.models.judge ?? "unset"}; runs per case ${cell(run.runsPerCase)}; threshold ${fmt(run.threshold)}; ablation ${run.ablation}; tags ${run.tagFilters.join(", ")}.`,
    run.command === null
      ? "- The report was written from a saved aggregate (`--from`): the run's tags above name it."
      : `- Command: \`${run.command}\``,
    `- Commit of the repository when the report was written: ${run.reportCommit}`,
    `- Drift from the set: ${run.drift.length ? run.drift.join("; ") : "none"}.`,
    "",
  ];
  if (run.partial)
    lines.push(
      "## Partial run",
      "",
      "The kit stopped at its cost cap: the figures below cover the cases it reached.",
      "",
    );
  lines.push(
    "## Categories",
    "",
    "| Category | Cases | Ran | Pass rate with | Pass rate without |",
    "| :- | -: | -: | -: | -: |",
  );
  for (const category of CATEGORIES) {
    const c = record.categories[category];
    lines.push(
      `| ${category} | ${fmt(c.cases.length)} | ${fmt(c.ran)} | ${cell(c.passRateWith)} | ${cell(c.passRateWithout)} |`,
    );
  }
  lines.push(
    "",
    "## Cases",
    "",
    "Per arm: the runs that finished (the errored ones in parentheses), the pass rate, the mean cost and judge cost in USD, the mean time in seconds and the mean turns; the delta is the kit's.",
    "",
    "| Case | Category | Runs with | Pass with | Cost with | Judge with | Time with | Turns with | Runs without | Pass without | Cost without | Judge without | Time without | Turns without | Delta |",
    "| :- | :- | -: | -: | -: | -: | -: | -: | -: | -: | -: | -: | -: | -: | -: |",
  );
  const arm = (a: ArmFigures) =>
    `${fmt(a.runs)} (${fmt(a.errored)}) | ${fmt(a.passRate)} | ${cell(a.costUsd)} | ${cell(a.judgeCostUsd)} | ${cell(a.durationSeconds)} | ${cell(a.turns)}`;
  for (const c of record.cases)
    lines.push(
      `| ${c.name} | ${c.category} | ${arm(c.with)} | ${arm(c.without)} | ${fmt(c.delta)} |`,
    );
  lines.push(
    "",
    "## Totals",
    "",
    "One run of the set per arm: the sums of the case means.",
    "",
    "| | With | Without |",
    "| :- | -: | -: |",
    `| Cost (USD) | ${fmt(totals.costWith)} | ${fmt(totals.costWithout)} |`,
    `| Judge cost (USD) | ${fmt(totals.judgeCostWith)} | ${fmt(totals.judgeCostWithout)} |`,
    `| Time (s) | ${fmt(totals.durationWith)} | ${fmt(totals.durationWithout)} |`,
    `| Turns | ${fmt(totals.turnsWith)} | ${fmt(totals.turnsWithout)} |`,
    "",
    `Cost ratio, with over without: ${cell(totals.costRatio)}.`,
    "",
    "## Not run",
    "",
    record.notRun.length ? `not run: ${record.notRun.join(", ")}` : "Every case of the set ran.",
    "",
  );
  return lines.join("\n");
}

/** The two files of a record under `dir`, the JSON the record and the Markdown rendered from it; their paths. */
export function writeRecord(record: BenchmarkRecord, dir: string): string[] {
  // The stem comes from the aggregate: it names a file in `dir` and nothing else, whatever it holds.
  const name = recordStem(record);
  if (dirname(resolve(dir, name)) !== resolve(dir))
    throw new Error(`benchmark: the record's stem ${name} is not a file name`);
  mkdirSync(dir, { recursive: true });
  const stem = join(dir, name);
  writeFileSync(`${stem}.json`, `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(`${stem}.md`, renderMarkdown(record));
  return [`${stem}.json`, `${stem}.md`];
}

/** What the kit's exit status says (`claude plugin eval --help`): the aggregate is written under each. */
const KIT_EXIT: Record<number, string> = {
  0: "every case at the threshold",
  1: "a case below the threshold",
  2: "the cost cap reached, a partial run",
};

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const flags = ["--from", "--out"];
  // The word after a flag, and never a flag itself: `--from --out x` is a missing value.
  const argAfter = (flag: string): string | undefined => {
    const next = argv[argv.indexOf(flag) + 1];
    return argv.includes(flag) && next !== undefined && !next.startsWith("--") ? next : undefined;
  };
  const wellFormed = argv.every(
    (a, i) => flags.includes(a) || (i > 0 && flags.includes(argv[i - 1] ?? "")),
  );
  if (!wellFormed || flags.some((f) => argv.includes(f) && !argAfter(f))) {
    console.error("usage: bun scripts/benchmark.ts [--from <aggregate.json>] [--out <dir>]");
    process.exit(1);
  }
  const from = argAfter("--from");
  const out = argAfter("--out") ?? join(ROOT, "docs", "benchmark");
  let text: string;
  let command: string | null = null;
  if (from) text = readFileSync(from, "utf8");
  else {
    // The record comes from the aggregate this run wrote into a folder of its own (finding 118),
    // whatever the kit's status: 1 says a case scored below the threshold and 2 a partial run,
    // both figures the record carries.
    const run = runKit({ root: ROOT, suffix: "benchmark", tags: ["benchmark"] });
    command = run.command;
    if (!run.aggregate) {
      console.error(
        `benchmark: the kit exited ${String(run.status)} and wrote no aggregate in ${run.relative}`,
      );
      process.exit(1);
    }
    // A run the suite's runner would flag is not a benchmark record (finding 95's rule in the
    // evals README): the person reruns it, or writes the record from its aggregate on purpose.
    const flagged = scanResults(run.folder);
    if (flagged.length) {
      for (const line of flagged) console.error(line);
      console.error(
        `benchmark: a run the runner flags needs-rerun is run once more; no record written (to write it from this aggregate anyway: bun scripts/benchmark.ts --from ${run.aggregate})`,
      );
      process.exit(1);
    }
    console.log(
      `benchmark: the kit exited ${String(run.status)} (${KIT_EXIT[run.status ?? -1] ?? "not a status the kit documents"}); the record is written from its aggregate`,
    );
    text = readFileSync(run.aggregate, "utf8");
  }
  const set = readSet(readFileSync(join(ROOT, SET_PATH), "utf8"));
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  const record = benchmarkRecord(readAggregate(text), set, {
    command,
    reportCommit: head.status === 0 ? head.stdout.trim() : "unknown",
    writtenAt: new Date().toISOString(),
  });
  for (const path of writeRecord(record, out)) console.log(path);
}
