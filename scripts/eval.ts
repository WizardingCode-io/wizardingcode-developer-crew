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
  /** The cost cap in USD the user gave (`--max-cost-usd`, finding 63): without it the suite runs uncapped and a case at 5. */
  maxCostUsd?: number;
  /** The judge of the llm graders (`--judge-model`, the user's decision of 2026-10-23): the suite's own when not given. */
  judgeModel?: string;
  /** The model the agent under test runs on (`--model`): a provider's own id, `DEFAULT_AGENT_MODEL` when not given (2026-10-25-005). */
  model?: string;
  /** A one-case run's runs (the improvement loop's three, ADR 0013); one when not given. */
  runs?: number;
  /** A one-case run's full result file (`--json`, the per-run scores and graders the loop reads). */
  json?: string;
}

/**
 * The suite's judge: Fable, by the owner's rule of 2026-11-09 (every judge and coordinator runs on
 * Fable), and never a weaker model than the agent under test. It left Fable on 2026-10-30 because
 * at Fable's usage limit every llm grader threw and counted as failed (finding 208); the cause is
 * answered where it lies (`unjudgedGraders`, `chooseJudge`), so the judge is Fable again.
 */
export const JUDGE_MODEL = "claude-fable-5-2";
/** The judge of a whole run when `JUDGE_MODEL` cannot judge at its start (the user's decisions D-2 and D-3 of 2026-11-09-004): not weaker than `DEFAULT_AGENT_MODEL`. */
export const JUDGE_FALLBACK = "claude-opus-5-5";

/** The CLI's words for a model at its usage limit: the text finding 208 recorded ("You've reached your Fable limit") and the older wording. */
export const USAGE_LIMIT = /reached your [\w .-]{0,40}limit|usage limit/i;
/** A model that cannot answer now: at its usage limit, rate limited or overloaded. The one pattern the editor's ladder, the judge's probe and the loop's reading of an unjudged cause share. */
export const LIMITED = new RegExp(`${USAGE_LIMIT.source}|rate.?limit|\\b429\\b|overloaded`, "i");

/**
 * A text of a model call or of a grader as one bounded line, before it is printed or recorded:
 * whitespace runs become one space; the control characters (C0, DEL, C1), the zero-width
 * characters and the direction marks go, the same set the engine's `quotedText` strips
 * (`packages/engine/src/quote.ts`); the spaces they stood between become one; then the cut at
 * `limit`. It is not `quotedText` itself: that one keeps a text's first line alone and ends a cut
 * with an ellipsis, where a CLI's error is read whole and a cut is counted to the character.
 */
export function oneLine(text: string, limit: number): string {
  return (
    text
      .replace(/\s+/g, " ")
      // biome-ignore lint/suspicious/noControlCharactersInRegex: the control characters are what is stripped
      .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
      .replace(/ {2,}/g, " ")
      .trim()
      .slice(0, limit)
  );
}

/** A model name as a flag's value: it starts with a letter or a digit, so it never reaches `claude` as a flag of its own. */
export const MODEL_NAME = /^[A-Za-z0-9][\w.:/-]*$/;

/**
 * The models a run may be judged by, in order. The suite's judge gives way to the fallback only
 * when the agent under test is the default one: the fallback is known not weaker than it, and
 * nothing ranks a provider's own agent model. Any other judge is pinned, a gateway's prefixed id
 * among them.
 */
export function judgeCandidates(judge?: string, agentModel?: string): string[] {
  const suite = judge === undefined || judge === JUDGE_MODEL;
  const ranked = agentModel === undefined || agentModel === DEFAULT_AGENT_MODEL;
  return suite && ranked ? [JUDGE_MODEL, JUDGE_FALLBACK] : [judge ?? JUDGE_MODEL];
}

/** A judge probe's bound: a cold CLI start with a login, so an unattended tick never hangs on it. */
export const PROBE_TIMEOUT_MS = 60_000;

/** The judge probe's arguments: one question, no tool, one turn, no session, and no setting, plugin, hook or MCP server of the session. */
export function probeArgs(model: string): string[] {
  return [
    "-p",
    "Answer with the single word ok.",
    "--model",
    model,
    "--tools",
    "",
    "--max-turns",
    "1",
    "--no-session-persistence",
    "--setting-sources",
    "",
    "--strict-mcp-config",
  ];
}

/** What a judge probe gave: the status, stdout and stderr joined (the CLI writes a limit to either), and whether its timeout ended it. */
export interface ProbeAnswer {
  status: number | null;
  output: string;
  timedOut: boolean;
}

/** One question to a model through the CLI the kit spawns, in the environment of the call it stands for, so it reads the limit of the account that will judge. */
export function probeJudge(
  model: string,
  env: Record<string, string | undefined>,
  cwd: string,
  spawn: typeof spawnSync = spawnSync,
): ProbeAnswer {
  const r = spawn("claude", probeArgs(model), {
    cwd,
    env,
    encoding: "utf8",
    timeout: PROBE_TIMEOUT_MS,
  });
  return {
    status: r.status,
    output: `${r.stdout ?? ""}${r.stderr ?? ""}`,
    timedOut: (r.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT",
  };
}

export type ProbeOutcome = "answered" | "limited" | "overloaded" | "timed out" | "failed";

/**
 * How a judge probe reads. The usage limit's text decides at any status, since the status the CLI
 * gives at a limit is recorded nowhere; a probe that exits 0 otherwise answered, whatever retry
 * notice it printed on the way; a failed call that names a rate limit or an overload is a model
 * that cannot judge now; anything else is a failure that is no limit.
 */
export function probeOutcome(answer: ProbeAnswer): ProbeOutcome {
  if (answer.timedOut) return "timed out";
  if (USAGE_LIMIT.test(answer.output)) return "limited";
  if (answer.status === 0) return "answered";
  return LIMITED.test(answer.output) ? "overloaded" : "failed";
}

/** Why a candidate was passed over for the next one. */
export type SkipReason = "limited" | "overloaded" | "timed out";

/** The judge of a run, chosen once at its start: the model, each one passed over, every one probed, and the lines to print. */
export interface JudgeChoice {
  judge: string | null;
  skipped: { model: string; reason: SkipReason }[];
  probed: { model: string; outcome: ProbeOutcome }[];
  lines: string[];
}

/**
 * The judge of a whole run (D-2): the first candidate that answers its probe. One that cannot
 * judge now is passed over; a probe that fails for another reason (an expired login, an unknown
 * model) ends the choice with no judge, since the fallback would fail the same way and passing to
 * it on any error would judge with another model where the owner's rule says Fable. A failed
 * probe's output goes to the lines alone, bounded, and never into a record.
 */
export function chooseJudge(
  judge: string | undefined,
  agentModel: string | undefined,
  probe: (model: string) => ProbeAnswer,
): JudgeChoice {
  const choice: JudgeChoice = { judge: null, skipped: [], probed: [], lines: [] };
  let failure = "";
  for (const model of judgeCandidates(judge, agentModel)) {
    const answer = probe(model);
    const outcome = probeOutcome(answer);
    choice.probed.push({ model, outcome });
    if (outcome === "answered") {
      choice.judge = model;
      break;
    }
    if (outcome === "failed") {
      failure = oneLine(answer.output, 200);
      break;
    }
    choice.skipped.push({ model, reason: outcome });
  }
  if (choice.judge === null)
    choice.lines = [
      "judge: no judge answered; nothing runs",
      ...choice.probed.map(
        (p) => `judge: ${p.model}: ${p.outcome}${p.outcome === "failed" ? `: ${failure}` : ""}`,
      ),
    ];
  else if (choice.skipped.length)
    choice.lines = [
      `judge: ${choice.judge} judges this run whole; ${choice.skipped
        .map((s, i) => `${s.model}${i === 0 ? " passed over" : ""} (${s.reason})`)
        .join(", ")}`,
    ];
  return choice;
}

/**
 * The tools the kit's session may use without asking (findings 64 and 95): Bash whole, since the
 * narrow `Bash(crew *)`-style grants denied the agent's compound commands (`cd x && crew …`) and its
 * reads of the plugin's references, and already held `sh *`, `node *` and `env *`, which run any
 * code: the grant widens forms, not power. The kit's OS sandbox confines what Bash reaches.
 */
export const ALLOW_TOOLS = ["Write", "Edit", "Bash"];

/** The environment names the kit's session receives; every other name is dropped (finding 64, the security lead's R-2). */
const KIT_ENVIRONMENT = [
  /^(?:PATH|HOME|TMPDIR|LANG|TERM|SHELL|USER|LOGNAME)$/,
  /^LC_[A-Z_]+$/,
  // The provider's names (2026-10-25-005): the endpoint, the aliases' models and the credentials.
  /^ANTHROPIC_[A-Z0-9_]+$/,
  /^CLAUDE_[A-Z0-9_]+$/,
  /^WIZARDINGCODE_[A-Z0-9_]+$/,
];
/** A name of the allowlist that still names a secret (`CLAUDE_CODE_MESSAGING_TOKEN`): dropped too, unless `NEEDED_SECRETS` holds it. */
const SECRET_NAME = /TOKEN|SECRET|PASSWORD|CREDENTIAL|_KEY$/;
/** The credentials the kit's session needs to reach its model provider: the key, a gateway's bearer token or the login's token (2026-10-25-005). */
const NEEDED_SECRETS = new Set([
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
]);

/** The environment of the kit's session: the allowlist's names from `source`, and nothing else. */
export function kitEnvironment(source: Record<string, string | undefined>): Record<string, string> {
  const kept: Record<string, string> = {};
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined || !KIT_ENVIRONMENT.some((rule) => rule.test(name))) continue;
    if (SECRET_NAME.test(name) && !NEEDED_SECRETS.has(name)) continue;
    kept[name] = value;
  }
  return kept;
}

/**
 * The environment of one kit call, and of the judge probe that stands for it: the process's
 * variables, the call's over them (a provider's credentials, an emptied key among them), the
 * runner's own over both, then the composed PATH, through the allowlist. The runner's come after
 * the call's because a call may carry a copy of the process's environment, and the shell's value
 * of a name the runner sets must not reach the call.
 */
export function kitCallEnvironment(parts: {
  process: Record<string, string | undefined>;
  call: Record<string, string | undefined> | undefined;
  runner: Record<string, string>;
  path: string;
}): Record<string, string> {
  return kitEnvironment({ ...parts.process, ...parts.call, ...parts.runner, PATH: parts.path });
}
// The tags the sandbox can run: the three mail cases are tagged needs-real-opener (spike A6, the
// sandbox's temporary config holds no login) and are recorded from an end-to-end run instead.
export const SANDBOX_TAGS = [
  "spec",
  // Item 2026-10-30-005: a whole site from a brief, the costliest cases of the suite.
  "site",
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
  // SP9 (Task 14): the ui cases run in the sandbox with the browser fixtures/playwright-page.sh copies into
  // the scaffold (Playwright's headless shell, single-process; design §9's spike).
  "ui",
];
const COMMON = ["plugin", "eval", "plugins/core", "--scaffold", "--trust-plugin", "--no-publish"];
/** The model the agent under test runs on when a run names none (2026-10-25-005: a provider names its own). */
export const DEFAULT_AGENT_MODEL = "claude-sonnet-5-5";

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
        "--model",
        options.model ?? DEFAULT_AGENT_MODEL,
        ...output,
        "--case",
        options.caseName,
        "--runs",
        String(options.runs ?? 1),
        "--ablation",
        "none",
        "--max-cost-usd",
        String(options.maxCostUsd ?? 5 * (options.runs ?? 1)),
        ...(options.json ? ["--json", options.json] : []),
        // The one-case run keeps its sandbox too (SP8's record ran blind on the first tries; SP4 Task 6),
        // and its llm graders are judged by the suite's judge: the kit's default is a smaller model
        // than the agent under test (the owner's rule: never a weaker judge), and it split 1 of 3 on
        // a trace the suite's judge reads whole.
        "--keep-temp",
        "--judge-model",
        options.judgeModel ?? JUDGE_MODEL,
      ]
    : [
        ...COMMON,
        "--model",
        options.model ?? DEFAULT_AGENT_MODEL,
        ...output,
        "--tag",
        ...(options.tags ?? SANDBOX_TAGS),
        "--keep-temp",
        "--judge-model",
        options.judgeModel ?? JUDGE_MODEL,
        ...(options.maxCostUsd === undefined ? [] : ["--max-cost-usd", String(options.maxCostUsd)]),
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

/**
 * The line a run prints before the kit starts: what it is likely to cost, from the last recorded
 * figures, and where the figure comes from (finding 63, the user's decision of 2026-10-22).
 */
export function costEstimate(options: { caseName?: string; tags?: string[] }): string {
  if (options.caseName)
    return "estimated cost: about 0.3 to 2.3 USD (the one-case runs recorded in docs/evals/; ui-motion-frequency-found reaches 4.2; the case's cap is 5 USD)";
  if (options.tags?.includes("benchmark"))
    return "estimated cost: about 35 USD (the benchmark run of 2026-10-21, docs/benchmark/2026-10-21-0.11.0.md: 9.10 + 2.57 USD a run of the set, three runs and the judges)";
  return "estimated cost: about 95 USD (the SP7a suite run's 38.80 USD, docs/evals/2026-10-18-sp7a-results.md, and the eight ui cases' 9.37 USD a set at three runs and two arms, docs/evals/2026-10-30-sp9-ui-results.md; the other cases added since are not in it, so more)";
}

// A reference's path as a trace holds it, absolute or relative, matched by suffix: the file, or the
// folder alone (a denied Glob or listing of it). The match is what the lines print, never the text
// around it, so no content of a trace reaches a record.
const REFERENCE_PATH = /skills\/crew\/references(?:\/[\w.-]+)?/g;
const DENIAL = /permission|denied|not allowed|can't read|cannot read|outside what I can read/i;

const referencePaths = (text: string): string[] => text.match(REFERENCE_PATH) ?? [];
// A sentence of the agent's words: cut at a full stop, a question or an exclamation mark followed by
// whitespace or the text's end, or at a line break; a path's dots are never followed by whitespace, so it stays whole.
const SENTENCE_BREAK = /[.?!](?=\s|$)|\n/;
/** The references the agent's own words report denied: a sentence that names a denial and a reference (finding 118). */
const reportedDenials = (text: string): string[] =>
  text.split(SENTENCE_BREAK).flatMap((s) => (DENIAL.test(s) ? referencePaths(s) : []));
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

interface TraceUse {
  name: string;
  /** The references the call's input names. */
  paths: string[];
  /** The input's `file_path`, as given, when it has one. */
  filePath: string | null;
}

interface TraceCalls {
  readable: boolean;
  uses: Map<string, TraceUse>;
  results: { id: string; denied: boolean; errorPaths: string[] }[];
  reported: string[];
}

const filePathOf = (input: unknown): string | null => {
  const value = (input as { file_path?: unknown } | null)?.file_path;
  return typeof value === "string" ? value : null;
};

/** A kept trace's calls, their results and the agent's reported denials, read line by line as JSON: what `readTrace` and `acceptedReadPaths` judge. */
function traceCalls(lines: readonly string[]): TraceCalls {
  const uses = new Map<string, TraceUse>();
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
            filePath: filePathOf(entry.input),
          });
        else if (entry.type === "text" && typeof entry.text === "string")
          reported.push(...reportedDenials(entry.text));
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
  return { readable, uses, results, reported };
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
  const { readable, uses, results, reported } = traceCalls(lines);
  const denied = new Set<string>();
  const acceptedReads = new Set<string>();
  for (const result of results) {
    const use = uses.get(result.id);
    if (result.denied)
      for (const path of [...(use?.paths ?? []), ...result.errorPaths]) denied.add(path);
    else if (use?.name === "Read") for (const path of use.paths) acceptedReads.add(path);
  }
  for (const path of reported) denied.add(path);
  // A denial an accepted Read covers is no lost read (finding 157): the same file read, or for a
  // folder (a listing, a Glob) any file in it, as when the agent looked at another copy of the plugin
  // and then read the plugin under test's own references.
  const covered = (path: string): boolean =>
    acceptedReads.has(path) || [...acceptedReads].some((read) => read.startsWith(`${path}/`));
  return { readable, denied: [...denied].filter((path) => !covered(path)) };
}

/**
 * The files a trace's accepted `Read` calls named, as the calls gave them, once each in the order
 * found (ADR 0013): what the improvement loop maps to the plugin's files a case read. A Read the kit
 * denied is not a read.
 */
export function acceptedReadPaths(lines: readonly string[]): string[] {
  const { uses, results } = traceCalls(lines);
  const read = new Set<string>();
  for (const result of results) {
    const use = uses.get(result.id);
    if (!result.denied && use?.name === "Read" && use.filePath !== null) read.add(use.filePath);
  }
  return [...read];
}

/** The plugin references a kept trace shows denied to the agent (finding 95), once each. Such a run cannot follow the method and is re-run rather than scored. */
export function deniedReferenceReads(lines: readonly string[]): string[] {
  return readTrace(lines).denied;
}

/** A run of an aggregate as the scripts read it: its kept trace and its graders. */
export interface KitRunEntry {
  tracePath?: string;
  graders?: unknown;
}

/** How the kit words a grader whose judge call failed (read in the loop's records of 2026-10-26 to 2026-10-30): the result has no error field, so the prefix is the one sign. */
export const JUDGE_FAILED = "grader threw: judge call failed";

/**
 * The graders of a run that were not judged (finding 208): each scored grader whose explanation
 * starts with `JUDGE_FAILED`, with the cause after the prefix as one bounded line. Such a grader
 * says nothing about the case; a grader that threw for another reason is a defect of its case and
 * stays a failed grader.
 */
export function unjudgedGraders(run: unknown): { grader: string; cause: string }[] {
  const graders = (run as { graders?: unknown } | null)?.graders;
  if (!Array.isArray(graders)) return [];
  const out: { grader: string; cause: string }[] = [];
  for (const g of graders as { name?: unknown; scored?: unknown; explanation?: unknown }[]) {
    if (g?.scored === false || typeof g?.explanation !== "string") continue;
    if (!g.explanation.startsWith(JUDGE_FAILED)) continue;
    const cause = g.explanation.slice(JUDGE_FAILED.length).replace(/^[:\s]+/, "");
    out.push({ grader: String(g.name), cause: oneLine(cause, 120) });
  }
  return out;
}

/**
 * The runs of a case's arms as the kit writes them: an object keyed by arm (`with`, `without`), each
 * a list of runs; an older shape (a list of arms with `runs`) is read too (SP8 Task 6: the first
 * shape crashed the scan after every `--case` run).
 */
export function armRuns(arms: unknown): KitRunEntry[] {
  if (Array.isArray(arms))
    return arms.flatMap((a) =>
      Array.isArray((a as { runs?: unknown }).runs)
        ? ((a as { runs: unknown[] }).runs as KitRunEntry[])
        : [],
    );
  if (typeof arms === "object" && arms !== null)
    return Object.values(arms as Record<string, unknown>).flatMap((runs) =>
      Array.isArray(runs) ? (runs as KitRunEntry[]) : [],
    );
  return [];
}

/**
 * The `needs-rerun` lines of a results folder: one per run with a grader that was not judged, and
 * one per run whose kept trace (the sandbox file the aggregate names as `tracePath`) shows a denied
 * reference read, or could not be read at all.
 */
export function scanResults(dir: string): string[] {
  const aggregate = join(dir, "aggregate-result.json");
  if (!existsSync(aggregate)) return [];
  const parsed = JSON.parse(readFileSync(aggregate, "utf8")) as {
    cases?: { name?: string; arms?: unknown }[];
  };
  const lines: string[] = [];
  for (const c of parsed.cases ?? []) {
    for (const run of armRuns(c.arms)) {
      // A grader that was not judged, read before the trace is looked for: a run with no trace is still named.
      const [first, ...more] = unjudgedGraders(run);
      if (first)
        lines.push(
          `needs-rerun: ${c.name ?? "?"} (not judged: ${first.grader}: ${first.cause}${more.length ? `, +${more.length} more` : ""})`,
        );
      const trace = run.tracePath ?? "";
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
const RESULTS_DIR = "plugins/core/evals/results";

/**
 * The results directory a run uses: `WIZARDINGCODE_CREW_EVAL_RESULTS` when set (item C2b,
 * finding 118's debt: the tests give their runs a folder of their own and never write where a
 * real run reads), the kit's directory otherwise. A set value stays repository-relative like the
 * default, since the kit receives it as `--output-dir`: an absolute path, a `..` segment on either
 * separator or an empty value is refused naming the variable.
 */
export function resultsDir(env: Record<string, string | undefined> = process.env): string {
  const value = env.WIZARDINGCODE_CREW_EVAL_RESULTS;
  if (value === undefined) return RESULTS_DIR;
  const refused =
    value === "" ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.split(/[\\/]/).includes("..");
  if (refused)
    throw new Error(
      `WIZARDINGCODE_CREW_EVAL_RESULTS must be a path under the repository, not ${value}`,
    );
  return value;
}

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

/** What a run of the kit through a script leaves: its folder, the aggregate when the kit wrote one there, the status, the command line and the judge chosen for it. */
export type KitRun =
  | {
      folder: string;
      /** The folder as the kit received it, relative to the repository root. */
      relative: string;
      aggregate: string | null;
      status: number | null;
      command: string;
      judge: JudgeChoice;
    }
  /** No judge answered (status 5): no folder was made and the kit was not called. */
  | {
      folder: null;
      relative: null;
      aggregate: null;
      status: 5;
      command: "";
      judge: JudgeChoice;
    };

/**
 * Runs the kit into a folder of the run's own (finding 118): the folder is created first, so a kit
 * that refused it would refuse before any paid case; the kit receives it through `--output-dir`
 * and runs with cwd the repository root, wherever the script was run from; the aggregate is looked
 * for in that folder alone, never in the newest folder by name. The run's judge is chosen once,
 * after the results directory is checked and before the folder and the estimate, by a probe in
 * the kit call's own environment (2026-11-09-004): with no judge nothing is made and nothing runs.
 */
export function runKit(options: {
  root: string;
  suffix: string;
  caseName?: string;
  tags?: string[];
  maxCostUsd?: number;
  judgeModel?: string;
  /** The judge probe, the real one unless a test gives another. */
  probe?: (model: string, env: Record<string, string>, cwd: string) => ProbeAnswer;
}): KitRun {
  const dir = resultsDir();
  const results = join(options.root, dir);
  const invocation = (outputDir?: string, judgeModel?: string) =>
    evalInvocation({
      root: options.root,
      platform: process.platform,
      path: process.env.PATH ?? "",
      realGitDir: realGitDir(process.platform),
      caseName: options.caseName,
      tags: options.tags,
      outputDir,
      maxCostUsd: options.maxCostUsd,
      judgeModel,
    });
  const own = invocation();
  const environment = kitEnvironment({ ...process.env, ...own.env, PATH: own.path });
  const probe = options.probe ?? probeJudge;
  const judge = chooseJudge(options.judgeModel, undefined, (model) =>
    probe(model, environment, options.root),
  );
  for (const line of judge.lines) console.log(line);
  if (judge.judge === null)
    return { folder: null, relative: null, aggregate: null, status: 5, command: "", judge };
  const folder = runFolder(results, options.suffix, new Date());
  createRunFolder(folder, results);
  const relative = `${dir}/${basename(folder)}`;
  const { args } = invocation(relative, judge.judge);
  const command = `claude ${args.join(" ")}`;
  console.log(costEstimate(options));
  console.log(command);
  const run = spawnSync("claude", args, {
    cwd: options.root,
    stdio: "inherit",
    env: environment,
  });
  const aggregate = join(folder, "aggregate-result.json");
  return {
    folder,
    relative,
    aggregate: existsSync(aggregate) ? aggregate : null,
    status: run.status,
    command,
    judge,
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
  const argv = process.argv.slice(2);
  const given: Record<string, string> = {};
  // A flag the script does not take, or one given twice.
  let bad: string | undefined;
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i] ?? "";
    if (!["--case", "--max-cost-usd", "--judge-model"].includes(flag) || flag in given) bad = flag;
    else given[flag] = argv[i + 1] ?? "";
  }
  const name = given["--case"];
  // A case name is a plain word: it names the run's folder, so nothing else may reach it.
  if (bad !== undefined || (name !== undefined && !/^[\w-]+$/.test(name))) {
    console.error(
      "usage: bun scripts/eval.ts [--case <name>] [--max-cost-usd <usd>] [--judge-model <model>]",
    );
    process.exit(1);
  }
  const cap = given["--max-cost-usd"];
  if (cap !== undefined && !(/^\d+(\.\d+)?$/.test(cap) && Number(cap) > 0)) {
    console.error(
      `eval: --max-cost-usd takes a positive number of USD, not ${JSON.stringify(cap)}`,
    );
    process.exit(1);
  }
  const judge = given["--judge-model"];
  if (judge !== undefined && !MODEL_NAME.test(judge)) {
    console.error(`eval: --judge-model takes a model name, not ${JSON.stringify(judge)}`);
    process.exit(1);
  }
  const run = runKit({
    root: join(import.meta.dir, ".."),
    suffix: name ? `case-${name}` : "suite",
    caseName: name,
    maxCostUsd: cap === undefined ? undefined : Number(cap),
    judgeModel: judge,
  });
  // No judge answered: the lines above say which model gave what; nothing ran.
  if (run.folder === null) process.exit(5);
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
