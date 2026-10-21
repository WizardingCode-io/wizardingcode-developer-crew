// Runs the plugin's eval suite with the PATH an eval needs (plugins/core/evals/README.md): the plugin's
// bin/ first, because `crew` is not on the Bash tool's PATH inside an eval, and on macOS the real git,
// because the /usr/bin shim cannot write its xcrun cache inside the eval sandbox.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, delimiter, dirname, join, resolve } from "node:path";

export interface EvalOptions {
  root: string;
  platform: NodeJS.Platform;
  path: string;
  realGitDir: string | null;
  caseName?: string;
  /** The tags to run in place of the sandbox list (the benchmark's `benchmark`); never with a case. */
  tags?: string[];
  /** The folder the kit writes its aggregate to (`--output-dir`), as given: the run's own (finding 118). */
  outputDir?: string;
}

const ALLOW_TOOLS = [
  "Write",
  "Edit",
  "Bash(crew *)",
  "Bash(node *)",
  "Bash(npm *)",
  "Bash(git *)",
  "Bash(cat *)",
  "Bash(ls *)",
  "Bash(sh *)",
  "Bash(make *)",
  "Bash(sed *)",
  "Bash(head *)",
  "Bash(echo *)",
  "Bash(which *)",
  // SP2c: a case may change into peer/b, and the opener runs claude with its environment
  "Bash(cd *)",
  "Bash(env *)",
  "Bash(claude *)",
];
// The tags the sandbox can run: the three mail cases are tagged needs-real-opener (spike A6, the
// sandbox's temporary config holds no login) and are recorded from an end-to-end run instead.
export const SANDBOX_TAGS = [
  "cost",
  "enforcement",
  "method",
  "risk",
  "stacks",
  "gap",
  "kind",
  "validator",
  "judgement",
  "team",
  // SP7b: the four cases need no opener (a change request to a read-only project is queued in its inbox).
  "environment",
  "priority",
  "contracts",
  // SP3 (Task 7): the reception, the jev and the issue cases run in the sandbox (the canned Jev transport, no opener).
  "reception",
  "jev",
  "issue",
  // SP8 (Task 6): the strategy and the audit cases run in the sandbox (no opener; the roles as subagents).
  "strategy",
  "audit",
  // SP4 (Task 6): the knowledge cases run in the sandbox (the fixture seeds the base through the engine under the sandbox's home).
  "knowledge",
  // SP6 (Task 5): the benchmark set's tag; its cases carry a sandbox tag each as well.
  "benchmark",
  // SP6 (Task 6): the two pack pairs run in the sandbox (the fixture copies the repository's pack into
  // the scaffold and registers it; the Laravel pair needs php on the machine, since a session's PATH is
  // Claude Code's and never the runner's).
  "packs",
];
const COMMON = [
  "plugin",
  "eval",
  "plugins/core",
  "--scaffold",
  "--trust-plugin",
  "--no-publish",
  "--model",
  "claude-sonnet-5-5",
];

export function evalInvocation(options: EvalOptions): {
  path: string;
  args: string[];
  /** What the kit's environment carries beyond PATH: the repository root the pack fixtures register from. */
  env: Record<string, string>;
} {
  if (options.tags && options.caseName)
    throw new Error("evalInvocation: a one-case run takes no tags");
  // The fixtures' bin first (SP6 Task 6: the helper a pack fixture asks the repository root of, since
  // the kit keeps PATH and strips the rest), then the plugin's.
  const entries = [
    join(options.root, "plugins/core/evals/fixtures/bin"),
    join(options.root, "plugins/core/bin"),
  ];
  if (options.realGitDir) entries.push(options.realGitDir);
  if (options.path) entries.push(options.path);
  // One more pair in the same place in both lists, the value as given (the mains build it with runFolder).
  const output = options.outputDir ? ["--output-dir", options.outputDir] : [];
  const args = options.caseName
    ? [
        ...COMMON,
        ...output,
        "--case",
        options.caseName,
        "--runs",
        "1",
        "--ablation",
        "none",
        "--max-cost-usd",
        "5",
        // The one-case run keeps its sandbox too (SP8's record ran blind on the first tries; SP4 Task 6),
        // and its llm graders are judged by the suite's judge: the kit's default is a smaller model
        // than the agent under test (the owner's rule: never a weaker judge), and it split 1 of 3 on
        // a trace the suite's judge reads whole.
        "--keep-temp",
        "--judge-model",
        "claude-fable-5-1",
      ]
    : [
        ...COMMON,
        ...output,
        "--tag",
        ...(options.tags ?? SANDBOX_TAGS),
        "--keep-temp",
        "--judge-model",
        "claude-fable-5-1",
        "--max-cost-usd",
        "40",
        "--concurrency",
        "3",
        "--report",
        "plugins/core/evals/results/report.html",
        "--json",
        "plugins/core/evals/results/last.json",
      ];
  return {
    path: entries.join(delimiter),
    args: [...args, "--allow-tools", ...ALLOW_TOOLS],
    env: { WIZARDINGCODE_CREW_REPO: options.root },
  };
}

// A reference's path as a trace holds it, absolute or relative, matched by suffix: the file, or the
// folder alone (a denied Glob or listing of it). The match is what the lines print, never the text
// around it, so no content of a trace reaches a record.
const REFERENCE_PATH = /skills\/crew\/references(?:\/[\w.-]+)?/g;
const DENIAL = /permission|denied|not allowed|can't read|cannot read|outside what I can read/i;

const referencePaths = (text: string): string[] => text.match(REFERENCE_PATH) ?? [];
/** Every string inside a value, however nested: a tool_use input's file_path, path, pattern or command. */
const stringsOf = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsOf);
  return [];
};

interface TraceLine {
  type?: unknown;
  message?: { content?: unknown };
  tool_result_meta?: unknown;
}
interface ContentEntry {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  input?: unknown;
  text?: unknown;
  tool_use_id?: unknown;
  content?: unknown;
  is_error?: unknown;
}
interface MetaEntry {
  id?: unknown;
  permission_decision?: { decision?: unknown };
}

/** What a kept trace shows about the plugin's references. */
export interface TraceReading {
  /** False when no line parsed as the kit's `assistant` or `user` line: an empty, truncated or drifted trace is never passed. */
  readable: boolean;
  /** The references the trace shows denied to the agent, once each, in the order found. */
  denied: string[];
}

/**
 * Reads a kept trace line by line as JSON (finding 118, under the rule of finding 95). A reference
 * is denied when a tool result carries the kit's own marks, `is_error: true` or a
 * `permission_decision` other than `accept`, and its `tool_use` input (any tool: a Read's
 * file_path, a Bash command) or the error's text names the reference; or when the agent's own words
 * report the denial and no accepted Read of that same path is in the trace. The join on the id reads
 * the result before or after its `tool_use`, and a metadata entry with no content entry. An accepted
 * result's content and its metadata are never read for a denial: the references hold the denial
 * words themselves, and every accepted call carries `permission_decision: accept`.
 */
export function readTrace(lines: readonly string[]): TraceReading {
  const uses = new Map<string, { name: string; paths: string[] }>();
  const results: { id: string; denied: boolean; errorPaths: string[] }[] = [];
  const reported: string[] = [];
  let readable = false;
  for (const line of lines) {
    let parsed: TraceLine;
    try {
      parsed = JSON.parse(line) as TraceLine;
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object") continue;
    if (parsed.type !== "assistant" && parsed.type !== "user") continue;
    readable = true;
    const content = Array.isArray(parsed.message?.content)
      ? (parsed.message.content as ContentEntry[])
      : [];
    if (parsed.type === "assistant") {
      for (const entry of content) {
        if (entry.type === "tool_use" && typeof entry.id === "string")
          uses.set(entry.id, {
            name: String(entry.name),
            paths: stringsOf(entry.input).flatMap(referencePaths),
          });
        else if (entry.type === "text" && typeof entry.text === "string" && DENIAL.test(entry.text))
          reported.push(...referencePaths(entry.text));
      }
      continue;
    }
    const rejected = new Set<string>();
    const meta = Array.isArray(parsed.tool_result_meta)
      ? (parsed.tool_result_meta as MetaEntry[])
      : [];
    for (const entry of meta) {
      const decision = entry?.permission_decision?.decision;
      if (typeof entry?.id === "string" && typeof decision === "string" && decision !== "accept")
        rejected.add(entry.id);
    }
    const seen = new Set<string>();
    for (const entry of content) {
      if (entry.type !== "tool_result" || typeof entry.tool_use_id !== "string") continue;
      seen.add(entry.tool_use_id);
      const refused = entry.is_error === true || rejected.has(entry.tool_use_id);
      results.push({
        id: entry.tool_use_id,
        denied: refused,
        errorPaths: refused ? stringsOf(entry.content).flatMap(referencePaths) : [],
      });
    }
    for (const id of rejected)
      if (!seen.has(id)) results.push({ id, denied: true, errorPaths: [] });
  }
  const denied = new Set<string>();
  const acceptedReads = new Set<string>();
  for (const result of results) {
    const use = uses.get(result.id);
    if (result.denied)
      for (const path of [...(use?.paths ?? []), ...result.errorPaths]) denied.add(path);
    else if (use?.name === "Read") for (const path of use.paths) acceptedReads.add(path);
  }
  for (const path of reported) if (!acceptedReads.has(path)) denied.add(path);
  return { readable, denied: [...denied] };
}

/** The plugin references a kept trace shows denied to the agent (finding 95), once each. Such a run cannot follow the method and is re-run rather than scored. */
export function deniedReferenceReads(lines: readonly string[]): string[] {
  return readTrace(lines).denied;
}

/**
 * The runs of a case's arms as the kit writes them: an object keyed by arm (`with`, `without`), each
 * a list of runs; an older shape (a list of arms with `runs`) is read too (SP8 Task 6: the first
 * shape crashed the scan after every `--case` run).
 */
export function armRuns(arms: unknown): { tracePath?: string }[] {
  if (Array.isArray(arms))
    return arms.flatMap((a) =>
      Array.isArray((a as { runs?: unknown }).runs)
        ? ((a as { runs: unknown[] }).runs as { tracePath?: string }[])
        : [],
    );
  if (typeof arms === "object" && arms !== null)
    return Object.values(arms as Record<string, unknown>).flatMap((runs) =>
      Array.isArray(runs) ? (runs as { tracePath?: string }[]) : [],
    );
  return [];
}

/**
 * The `needs-rerun` lines of a results folder: one per run whose kept trace (the sandbox file the
 * aggregate names as `tracePath`) shows a denied reference read, or could not be read at all.
 */
export function scanResults(dir: string): string[] {
  const aggregate = join(dir, "aggregate-result.json");
  if (!existsSync(aggregate)) return [];
  const parsed = JSON.parse(readFileSync(aggregate, "utf8")) as {
    cases?: { name?: string; arms?: unknown }[];
  };
  const lines: string[] = [];
  for (const c of parsed.cases ?? []) {
    for (const trace of armRuns(c.arms).map((r) => r.tracePath ?? "")) {
      if (!trace || !existsSync(trace)) continue;
      const reading = readTrace(readFileSync(trace, "utf8").split("\n"));
      if (!reading.readable)
        lines.push(`needs-rerun: ${c.name ?? "?"} (trace unreadable: ${trace})`);
      else if (reading.denied.length)
        lines.push(
          `needs-rerun: ${c.name ?? "?"} (reference read denied: ${reading.denied.join(", ")})`,
        );
    }
  }
  return lines;
}

/** The kit's results directory, relative to the repository root: what the kit receives, so no absolute path enters a record's command line. */
export const RESULTS_DIR = "plugins/core/evals/results";

/** The folder a run gives the kit: the kit's own UTC stamp shape and the run's suffix, from the clock given and nothing else. */
export function runFolder(results: string, suffix: string, now: Date): string {
  return join(results, `${now.toISOString().replace(/[:.]/g, "-")}-${suffix}`);
}

/**
 * Creates a run's folder: its parent must be the results directory (a name that climbs is refused
 * before anything is created), the results directory is created when missing, and the leaf without
 * `recursive`, so a folder that exists (a same-millisecond stamp, an earlier run's) is refused and
 * two runs never share one.
 */
export function createRunFolder(folder: string, results: string): void {
  if (resolve(dirname(folder)) !== resolve(results))
    throw new Error(`run folder ${folder} is not under ${results}`);
  mkdirSync(results, { recursive: true });
  try {
    mkdirSync(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`run folder ${folder} exists`);
    throw error;
  }
}

/** What a run of the kit through a script leaves: its folder, the aggregate when the kit wrote one there, the status and the command line. */
export interface KitRun {
  folder: string;
  /** The folder as the kit received it, relative to the repository root. */
  relative: string;
  aggregate: string | null;
  status: number | null;
  command: string;
}

/**
 * Runs the kit into a folder of the run's own (finding 118): the folder is created first, so a kit
 * that refused it would refuse before any paid case; the kit receives it through `--output-dir`
 * and runs with cwd the repository root, wherever the script was run from; the aggregate is looked
 * for in that folder alone, never in the newest folder by name.
 */
export function runKit(options: {
  root: string;
  suffix: string;
  caseName?: string;
  tags?: string[];
}): KitRun {
  const results = join(options.root, RESULTS_DIR);
  const folder = runFolder(results, options.suffix, new Date());
  createRunFolder(folder, results);
  const relative = `${RESULTS_DIR}/${basename(folder)}`;
  const { path, args, env } = evalInvocation({
    root: options.root,
    platform: process.platform,
    path: process.env.PATH ?? "",
    realGitDir: realGitDir(process.platform),
    caseName: options.caseName,
    tags: options.tags,
    outputDir: relative,
  });
  const command = `claude ${args.join(" ")}`;
  console.log(command);
  const run = spawnSync("claude", args, {
    cwd: options.root,
    stdio: "inherit",
    env: { ...process.env, ...env, PATH: path },
  });
  const aggregate = join(folder, "aggregate-result.json");
  return {
    folder,
    relative,
    aggregate: existsSync(aggregate) ? aggregate : null,
    status: run.status,
    command,
  };
}

/** Where the real git lives on macOS, as xcrun reports it; null elsewhere. Fails rather than run the suite on the shim. */
export function realGitDir(platform: NodeJS.Platform): string | null {
  if (platform !== "darwin") return null;
  const found = spawnSync("xcrun", ["--find", "git"], { encoding: "utf8" });
  const file = found.stdout?.trim();
  if (found.status !== 0 || !file) {
    throw new Error(`xcrun --find git failed: ${found.stderr?.trim() ?? ""}`);
  }
  return dirname(file);
}

if (import.meta.main) {
  const [flag, name] = process.argv.slice(2);
  // A case name is a plain word: it names the run's folder, so nothing else may reach it.
  if (
    (flag !== undefined && flag !== "--case") ||
    (flag === "--case" && !/^[\w-]+$/.test(name ?? ""))
  ) {
    console.error("usage: bun scripts/eval.ts [--case <name>]");
    process.exit(1);
  }
  const run = runKit({
    root: join(import.meta.dir, ".."),
    suffix: name ? `case-${name}` : "suite",
    caseName: name,
  });
  if (!run.aggregate) {
    console.error(
      `eval: the kit exited ${String(run.status)} and wrote no aggregate in ${run.relative}`,
    );
    process.exit(1);
  }
  // The run's own traces, read for a denied reference read (finding 95).
  for (const line of scanResults(run.folder)) console.log(line);
  process.exit(run.status ?? 1);
}
