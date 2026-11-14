import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { backoffHours } from "../packages/engine/src/backoff.ts";
import { readJson, writeTextNew } from "../packages/engine/src/fs.ts";
import { processStart } from "../packages/engine/src/open.ts";
import { userDirOf } from "../packages/engine/src/paths.ts";
import { scanText } from "../packages/engine/src/secrets.ts";
import { singleQuoted } from "../packages/engine/src/shell-words.ts";
import {
  chooseJudge,
  DEFAULT_AGENT_MODEL,
  JUDGE_MODEL,
  judgeCandidates,
  kitEnvironment,
  LIMITED,
  MODEL_NAME,
  oneLine,
  type ProbeAnswer,
  probeJudge,
} from "./eval.ts";
import {
  allCases,
  type CaseFigures,
  ctoPlanFor,
  type ImproveOptions,
  type Kept,
  medianOf,
  realDeps,
  runImprove,
  verdictOf,
} from "./improve.ts";
import {
  type DayState,
  type DeadTick,
  type ImproveState,
  improveHome,
  type PendingRelease,
  readStateAt,
} from "./improve-home.ts";
import {
  accountToken,
  boundOf,
  type CommandRunner,
  gitEnv,
  LOCAL_MS,
  leftCommand,
  leftCommandOf,
  notificationCommand,
  type ProcessDeps,
  RELEASE_STEP_NAMES,
  type ReleaseOptions,
  type ReleaseOutcome,
  readCommandFile,
  recordedProcess,
  release,
  spawnRunner,
} from "./release.ts";

/** The keychain service every secret of the loop lives under (D-2). */
export const SERVICE = "wizardingcode-crew-improve";

/** The models a provider serves, by the alias Claude Code resolves and by the role the loop gives it. */
export interface ModelSet {
  fable: string;
  opus: string;
  sonnet: string;
  haiku: string;
  /** The agent under test in the kit (`--model`). */
  agent: string;
  /** The llm graders' judge and the adoption's judge (`--judge-model`). */
  judge: string;
}

/** A secret by its keychain account under `SERVICE`; never a value in a file. */
export interface SecretRef {
  keychain: string;
}

/**
 * A provider other than the runtime's own login: an Anthropic key, or a gateway (OpenRouter, Ollama,
 * LM Studio, any Anthropic-compatible `/v1/messages`) with its base URL, its bearer token and the
 * models it serves. `placeholder` is for the fixed, public, non-secret token a local server accepts.
 */
export interface ProviderConfig {
  name: string;
  baseUrl?: string;
  authToken?: SecretRef | { placeholder: string };
  apiKey?: SecretRef;
  models?: ModelSet;
}

/** `~/.wizardingcode/crew-improve/config.json` (D-2, D-7, D-8). */
export interface LoopConfig {
  provider: "runtime" | ProviderConfig;
  /** D-8's fallback under `runtime`: the login's token from `claude setup-token`, in the keychain. */
  oauthToken?: SecretRef;
  casesPerRun: number;
  staleDays: number;
  proposals: number;
  marketplace: { account: string };
  /** The user's checkout, fast-forwarded after each run when clean (D-1); set at install from --clone-from. */
  userCheckout?: string;
  /** True holds every tick after its probe, the agent left installed. */
  paused?: boolean;
  /** A ceiling for one run's kit spend (`--max-cost-usd`): 20 USD by default, 0 for none (2026-10-27-006 D-2; no cap was the default until 154.85 USD went on one day with nothing kept). */
  maxRunUsd?: number;
  /** A ceiling for a day's priced spend over its runs: 60 USD by default, 0 for none; a due tick at or above it runs nothing and says why (D-2). */
  maxDayUsd?: number;
}

/** The ceilings' defaults (2026-10-27-006 D-2). */
export const CEILING_DEFAULTS = { maxRunUsd: 20, maxDayUsd: 60 } as const;

/**
 * A ceiling as the configuration gives it (AC-6): 0 or a positive number as given; a value that is
 * not a finite number at or above 0 is the default, with a note for the tick's log naming the key,
 * the value and the default, so a typo never disables or inverts a ceiling in silence.
 */
export function ceilingOf(
  config: { maxRunUsd?: number; maxDayUsd?: number },
  key: "maxRunUsd" | "maxDayUsd",
  fallback: number,
): { value: number; note: string | null } {
  const given = config[key];
  if (given === undefined) return { value: fallback, note: null };
  if (typeof given === "number" && Number.isFinite(given) && given >= 0)
    return { value: given, note: null };
  return {
    value: fallback,
    note: `config: ${key} ${JSON.stringify(given)} is not a number at or above 0; the default ${fallback} applies`,
  };
}

/** A run's cost as the loop can price it: a finite number at or above 0, else null (2026-10-27-006 AC-6). The one rule the day ceiling, the daily report and the status share. */
export const pricedCost = (cost: unknown): number | null =>
  typeof cost === "number" && Number.isFinite(cost) && cost >= 0 ? cost : null;

/**
 * The day's cost as the ceiling reads it (AC-6): the priced costs summed; a null cost (a provider
 * with no list price) and a malformed one add nothing and are counted as unpriced, so the
 * comparison is between finite numbers and the skip's line says what it could not price.
 */
export function dayCostOf(runs: readonly DayRun[]): {
  priced: number;
  pricedRuns: number;
  unpriced: number;
} {
  let priced = 0;
  let pricedRuns = 0;
  let unpriced = 0;
  for (const run of runs) {
    const cost = pricedCost(run.costUsd);
    if (cost === null) unpriced += 1;
    else {
      priced += cost;
      pricedRuns += 1;
    }
  }
  return { priced, pricedRuns, unpriced };
}

/** The reason a day's budget skip gives, in its log line, its report line and its notice: one builder, so the three never drift. */
export function budgetReason(ceilingUsd: number, cost: ReturnType<typeof dayCostOf>): string {
  return `the day's budget of ${usd(ceilingUsd)} is spent (${usd(cost.priced)} over ${cost.pricedRuns} priced run(s); ${cost.unpriced} unpriced)`;
}

/** A run of a provider whose models have no list price (a local server): its cost is null by design, never malformed. */
export const providerUnpriced = (run: Pick<DayRun, "costUsd">): boolean => run.costUsd === null;

/** The hour and minute of an ISO time, as the report and the log name a skipped tick. */
const hhmm = (iso: string): string => iso.slice(11, 16);

/** What a run receives from its provider: the environment, the two models the kit names, and whether the models are Claude's (D-9). */
export interface ResolvedProvider {
  name: string;
  env: Record<string, string>;
  agentModel: string;
  judgeModel: string;
  claudeModels: boolean;
  /** Every secret value read, for the redaction of everything the loop writes (AC-14). */
  secrets: string[];
}

export type SecretReader = (account: string) => string | null;

/** Whether a model id names a Claude model at any provider (`claude-…`, `anthropic/claude-…`). */
function isClaudeModel(id: string): boolean {
  return /(?:^|\/)claude-/.test(id);
}

/**
 * The environment the kit and the editor receive on top of the session's, from the provider the
 * configuration names (AC-1): nothing for the runtime's own login; the key for an Anthropic key; the
 * base URL, the bearer token, an empty API key (OpenRouter's and Ollama's requirement), the aliases'
 * models and the subagents' model for a gateway. A secret the keychain does not hold is a refusal
 * naming the account, and nothing is returned.
 */
export function providerEnv(config: LoopConfig, readSecret: SecretReader): ResolvedProvider {
  const secrets: string[] = [];
  const read = (ref: SecretRef): string => {
    const value = readSecret(ref.keychain);
    if (value === null)
      throw new Error(
        `the keychain holds no item for account "${ref.keychain}" under the service ${SERVICE}; nothing runs`,
      );
    secrets.push(value);
    return value;
  };
  const env: Record<string, string> = {};
  if (config.oauthToken) env.CLAUDE_CODE_OAUTH_TOKEN = read(config.oauthToken);
  const provider = config.provider;
  if (provider === "runtime")
    return {
      name: "runtime",
      env,
      agentModel: DEFAULT_AGENT_MODEL,
      judgeModel: JUDGE_MODEL,
      claudeModels: true,
      secrets,
    };
  if (provider.apiKey) env.ANTHROPIC_API_KEY = read(provider.apiKey);
  if (provider.baseUrl) {
    env.ANTHROPIC_BASE_URL = provider.baseUrl;
    if (provider.authToken)
      env.ANTHROPIC_AUTH_TOKEN =
        "keychain" in provider.authToken
          ? read(provider.authToken)
          : provider.authToken.placeholder;
    if (!provider.apiKey) env.ANTHROPIC_API_KEY = "";
  }
  const models = provider.models;
  if (models) {
    env.ANTHROPIC_DEFAULT_FABLE_MODEL = models.fable;
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = models.opus;
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = models.sonnet;
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = models.haiku;
    env.CLAUDE_CODE_SUBAGENT_MODEL = models.sonnet;
  }
  // A model reaches `claude` as a flag's value: one that is no model name is refused here (2026-11-09-004).
  for (const [role, model] of [
    ["agent", models?.agent],
    ["judge", models?.judge],
  ] as const)
    if (model !== undefined && !MODEL_NAME.test(model))
      throw new Error(`the provider's ${role} model "${model}" is not a model name; nothing runs`);
  return {
    name: provider.name,
    env,
    agentModel: models?.agent ?? DEFAULT_AGENT_MODEL,
    judgeModel: models?.judge ?? JUDGE_MODEL,
    claudeModels: models ? Object.values(models).every(isClaudeModel) : true,
    secrets,
  };
}

/** What the last run saw, kept in `state.json` to tell a new reason from an old one. */
export interface LastRun {
  at: string;
  /** The newest commit on `origin/main` touching the plugin's text when the run started. */
  head: string;
  /** The CTO plan the run read, by its identity (the file's path and date), or null. */
  plan: string | null;
  /** How many harness lessons the base held when the run ended, the run's own included (finding 174). */
  lessons: number;
}

/** The repository as the tick reads it before deciding. */
export interface RepoFacts {
  pluginHead: string;
  plan: string | null;
  lessons: number;
  /** Each case's last measurement (ISO), or null when no run ever measured it. */
  lastMeasured: Record<string, string | null>;
  lockAlive: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether a run is due, and why (AC-4): a live lock never; no run yet, the plugin's text changed on
 * `origin/main`, a CTO plan newer than the last run, lessons that grew, or a case unmeasured for
 * `staleDays` or never; otherwise not, with the reason said.
 */
export function dueRun(
  state: { lastRun?: LastRun },
  facts: RepoFacts,
  config: { staleDays: number },
  now: Date,
): { due: boolean; reason: string } {
  if (facts.lockAlive) return { due: false, reason: "another tick holds the lock" };
  const last = state.lastRun;
  if (!last) return { due: true, reason: "no run yet" };
  if (facts.pluginHead !== last.head)
    return { due: true, reason: `the plugin's text changed on origin/main (${facts.pluginHead})` };
  if (facts.plan !== null && facts.plan !== last.plan)
    return { due: true, reason: "a CTO plan newer than the last run" };
  if (facts.lessons > last.lessons)
    return { due: true, reason: `the harness lessons grew (${last.lessons} to ${facts.lessons})` };
  for (const name of Object.keys(facts.lastMeasured).sort()) {
    const measured = facts.lastMeasured[name] ?? null;
    if (measured === null) return { due: true, reason: `case ${name} never measured` };
    const days = Math.floor((now.getTime() - Date.parse(measured)) / DAY_MS);
    if (days >= config.staleDays)
      return { due: true, reason: `case ${name} unmeasured for ${days} days` };
  }
  return {
    due: false,
    reason: `nothing new since the last run and no case older than ${config.staleDays} days`,
  };
}

/** The `n` cases a run targets (AC-4): never measured first, then the oldest measurement, ties by name. */
export function pickTargets(
  cases: readonly string[],
  lastMeasured: Record<string, string | null>,
  n = 2,
): string[] {
  const key = (name: string): [number, string, string] => {
    const measured = lastMeasured[name] ?? null;
    return [measured === null ? 0 : 1, measured ?? "", name];
  };
  return [...cases]
    .sort((a, b) => {
      const [ka, kb] = [key(a), key(b)];
      return ka[0] - kb[0] || ka[1].localeCompare(kb[1]) || ka[2].localeCompare(kb[2]);
    })
    .slice(0, n);
}

/** A secret's text, and a URL's userinfo, replaced wherever they appear (AC-14). */
export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const secret of secrets) if (secret) out = out.split(secret).join("[redacted]");
  return out.replace(/(https?:\/\/)[^\s/@"']+@/g, "$1[redacted]@");
}

/** A logger that redacts every line before the sink sees it. */
export function redactingLogger(
  secrets: readonly string[],
  sink: (line: string) => void,
): (line: string) => void {
  return (line) => sink(redact(line, secrets));
}

/** A file written through the redaction: the record, the report, the ruling, the state and the probe go through it. */
export function writeRedacted(path: string, text: string, secrets: readonly string[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, redact(text, secrets));
}

/** `security -i` with the add command on stdin, so the token is never in `argv` (AC-14); `-U` replaces an item of the same account. */
export function secretSetCommand(account: string, token: string): { cmd: string[]; input: string } {
  const quote = (text: string) => `"${text.replace(/(["\\])/g, "\\$1")}"`;
  return {
    cmd: ["security", "-i"],
    input: `add-generic-password -U -s ${SERVICE} -a ${quote(account)} -w ${quote(token)}\n`,
  };
}

/** The keychain read of an account's secret; its output is held in memory alone. */
export function secretReadCommand(account: string): string[] {
  return ["security", "find-generic-password", "-s", SERVICE, "-a", account, "-w"];
}

/** One run as the daily report lists it (D-7). */
export interface DayRun {
  run: string;
  targets: string[];
  verdict: string;
  provider: { name: string; claudeModels: boolean };
  /** null where the provider's models have no list price (a local server). */
  costUsd: number | null;
}

const usd = (n: number): string => `${n.toFixed(2)} USD`;

/**
 * The name of a release's stop, as a pushed file may hold it (2026-11-13-005): the line's first
 * line, redacted as every line of the loop is, with the loop's home and the user's home replaced,
 * cut to 200 characters. A stop's line is free text of this machine (a filesystem error's path,
 * git's words, a string read from a file), and the day's report is public.
 */
export function stopName(
  line: string,
  home: string,
  userHome: string,
  secrets: readonly string[],
): string {
  let name = redact(line.split("\n")[0] ?? "", secrets);
  // The loop's home first: it is usually under the user's. An empty home replaces nothing.
  if (home) name = name.split(home).join("<loop home>");
  if (userHome) name = name.split(userHome).join("~");
  return name.length > 200 ? `${name.slice(0, 199)}…` : name;
}

/** `docs/improve/daily/<date>.md`: the day's runs, the totals by provider, the releases and the failed steps (AC-10). */
export function dailyReport(
  date: string,
  runs: readonly DayRun[],
  releases: readonly { version: string; run: string }[],
  failures: readonly { run: string; step: number; name: string }[],
  skipped: {
    budget: { at: string; reason: string } | null;
    judge: { at: string } | null;
    /** No token for the release's account (2026-11-13-005). */
    token?: { at: string } | null;
    /** A release still pending after its resume (2026-11-13-005): the reason as it was written. */
    pending?: { at: string; reason: string } | null;
  } | null = null,
  extras: { deadTicks?: readonly DeadTick[]; stoppedRuns?: readonly string[] } = {},
): string {
  const deadTicks = extras.deadTicks ?? [];
  const stoppedRuns = extras.stoppedRuns ?? [];
  // A provider without a list price totals n/a; a malformed cost on a priced provider adds nothing
  // to its total and shows n/a in its row (2026-10-27-006 AC-6).
  const totals = new Map<string, number | null>();
  for (const run of runs) {
    const before = totals.get(run.provider.name);
    totals.set(
      run.provider.name,
      providerUnpriced(run) || before === null
        ? null
        : (before ?? 0) + (pricedCost(run.costUsd) ?? 0),
    );
  }
  const lines = [
    `# Improvement runs of ${date}`,
    "",
    "| Run | Targets | Verdict | Provider | Cost |",
    "| :- | :- | :- | :- | :- |",
    ...runs.map((r) => {
      const cost = pricedCost(r.costUsd);
      // A run the user stopped after it ended on its own reads as stopped (2026-10-28-001 AC-7).
      const verdict = stoppedRuns.includes(r.run) ? STOPPED_BY_USER : r.verdict;
      return `| ${r.run} | ${r.targets.join(", ")} | ${verdict} | ${r.provider.name}${r.provider.claudeModels ? "" : " (not Claude models)"} | ${cost === null ? "n/a" : usd(cost)} |`;
    }),
    "",
    "## Cost by provider",
    "",
    ...[...totals].map(
      ([name, total]) =>
        `- ${name}: ${total === null ? "n/a (no list price for its models)" : usd(total)}`,
    ),
    "",
    "## Releases",
    "",
    ...(releases.length ? releases.map((r) => `- ${r.version} from run ${r.run}`) : ["- none"]),
    "",
    "## Failed steps",
    "",
    ...(failures.length
      ? failures.map((f) =>
          // Step 0 is a release that stopped before step 1 (2026-11-13-005): its name is the stop's.
          f.step === 0
            ? `- run ${f.run}: the release stopped before step 1: ${f.name}`
            : `- run ${f.run}: step ${f.step} (${f.name}) failed`,
        )
      : ["- none"]),
    "",
  ];
  // One line per kind of skip, each with its own sentence: both can stand on the same day.
  if (skipped?.budget || skipped?.judge || skipped?.token || skipped?.pending)
    lines.push(
      "",
      "## Skipped ticks",
      "",
      ...(skipped.budget
        ? [
            `- ${hhmm(skipped.budget.at)} UTC: ${skipped.budget.reason}; every later tick of the day skips the same way until the budget or the day changes`,
          ]
        : []),
      ...(skipped.judge
        ? [`- ${hhmm(skipped.judge.at)} UTC: no judge answered; a later due tick probes again`]
        : []),
      ...(skipped.token
        ? [
            `- ${hhmm(skipped.token.at)} UTC: the release's account has no token; a later tick probes again`,
          ]
        : []),
      ...(skipped.pending
        ? [`- ${hhmm(skipped.pending.at)} UTC: ${skipped.pending.reason.replace(": ", "; ")}`]
        : []),
    );
  // The ticks that died before their run ended (2026-10-28-001 AC-9), each by what its lock said once checked.
  if (deadTicks.length)
    lines.push("", "## Dead ticks", "", ...deadTicks.map((d) => `- ${deadTickText(d)}`));
  return lines.join("\n");
}

/** `pid 849, started 00:32 UTC, run 2026-10-28-2 left without a record, folder removed`: a dead tick as the report and the status say it (2026-10-28-001 AC-9). */
function deadTickText(d: DeadTick): string {
  const p = deadTickParts(d);
  const run = p.run ? `run ${p.run} left without a record, folder removed` : "left no run";
  return `pid ${p.pid}, started ${p.start ?? "at an unknown time"}, ${run}`;
}

/** The notification a dead tick gets, once: `a tick died: pid 849 started at 00:32 UTC left run 2026-10-28-2 without a record`. */
function deadTickNotice(d: DeadTick): string {
  const p = deadTickParts(d);
  const run = p.run ? `left run ${p.run} without a record` : "left no run";
  return `a tick died: pid ${p.pid} started ${p.start ? `at ${p.start}` : "at an unknown time"} ${run}`;
}

/** What every line about a dead tick says of it: the pid or `unknown`, the start as `hh:mm UTC` or null, the run. */
function deadTickParts(d: DeadTick): { pid: string; start: string | null; run: string | null } {
  return {
    pid: String(d.pid ?? "unknown"),
    start: d.startedAt ? `${hhmm(d.startedAt)} UTC` : null,
    run: d.run,
  };
}

/** The run folders of the clone a tick left without a record, newest first: a direct child of `docs/improve/` named by the run pattern, a real directory, no `record.json` (2026-10-28-001 AC-9). */
function deadRunFolders(repo: string): string[] {
  const dir = join(repo, "docs", "improve");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => RUN_FOLDER.test(name))
    .filter((name) => {
      try {
        return (
          lstatSync(join(dir, name)).isDirectory() && !existsSync(join(dir, name, "record.json"))
        );
      } catch {
        return false;
      }
    })
    .sort((a, b) => {
      // Newest first: the later date, then the higher number (`-10` after `-9`, as createImproveFolder counts).
      const [dateA, nA] = splitRun(a);
      const [dateB, nB] = splitRun(b);
      return dateA === dateB ? nB - nA : dateA < dateB ? 1 : -1;
    });
}

/** A run folder's name as its date and its number. */
function splitRun(name: string): [string, number] {
  const at = name.lastIndexOf("-");
  return [name.slice(0, at), Number(name.slice(at + 1))];
}

/** A run folder's name, `<date>-<n>`, as `createImproveFolder` names it. */
const RUN_FOLDER = /^\d{4}-\d{2}-\d{2}-\d+$/;

/** An integer pid above 1, else null: never 0 (the caller's group), 1 (launchd), a negative number (another group) or a string. */
function validPid(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 1 ? value : null;
}

/** An ISO date, else null. */
function validIso(value: unknown): string | null {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T/.test(value) &&
    !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

/**
 * The lock as `stop` may act on it (2026-10-28-001 AC-7, the security lead's R-1): an object whose pid is
 * an integer above 1, whose boot is this boot's and whose start is an ISO date; anything else is null,
 * and nothing is signalled on it.
 */
export function validLock(raw: unknown, boot: string): TickLock | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { pid, startedAt } = raw as Record<string, unknown>;
  const ownPid = validPid(pid);
  const start = validIso(startedAt);
  if (ownPid === null || start === null || (raw as Record<string, unknown>).boot !== boot)
    return null;
  return { pid: ownPid, startedAt: start, boot };
}

/** What a tick that died left, from its lock once checked and from the clone (2026-10-28-001 AC-9): the newest dead run folder is removed. */
function deadTickOf(held: unknown, repo: string): DeadTick {
  const lock = typeof held === "object" && held !== null ? (held as Record<string, unknown>) : {};
  const [run] = deadRunFolders(repo);
  if (run) rmSync(join(repo, "docs", "improve", run), { recursive: true, force: true });
  return { pid: validPid(lock.pid), startedAt: validIso(lock.startedAt), run: run ?? null };
}

/** The configuration file with `patch` written over its keys, the others kept, mode 0600 as the install writes it. */
function writeConfigPatch(home: string, patch: Partial<LoopConfig>): void {
  mkdirSync(home, { recursive: true });
  const path = join(home, "config.json");
  writeFileSync(path, `${JSON.stringify({ ...readConfigFile(home), ...patch }, null, 2)}\n`, {
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

/** The stop marker the `stop` command leaves for the tick (2026-10-28-001 AC-7). */
const stopMarkerOf = (home: string) => join(home, "stop.json");

/** `bun scripts/improve-loop.ts pause`: no tick runs until `resume` (2026-10-28-001 AC-7). */
export function pauseLoop(home: string): string {
  writeConfigPatch(home, { paused: true });
  return "paused: no tick runs until bun scripts/improve-loop.ts resume";
}

/** `bun scripts/improve-loop.ts resume`: the ticks run again; a stop marker left behind goes. */
export function resumeLoop(home: string): string {
  writeConfigPatch(home, { paused: false });
  rmSync(stopMarkerOf(home), { force: true });
  return "resumed";
}

/** What `stop` reaches: the lock and the configuration in the home, `ps` and the signal, a wait. */
export interface StopDeps {
  home: string;
  boot: () => string;
  alive: (pid: number) => boolean;
  sh: TickDeps["sh"];
  kill: (pid: number, signal: "SIGTERM" | "SIGKILL") => void;
  /** The command a release of the stopped tick waits on, by its pid, or null: the release's own check when not given. */
  leftCommand?: (root: string, startedBy: number) => number | null;
  /** The stopped tick's own command, as the home's command file names it, or null (2026-11-13-005): the file's own check when not given. */
  tickCommand?: (home: string, startedBy: number) => number | null;
  wait: (ms: number) => Promise<void>;
  now: () => Date;
}

/** A door to a command a tick started: the group to signal, or null. */
type CommandDoor = (startedBy: number) => number | null;

/** The command a tick's release waits on, as the clone's command file names it (2026-11-13-004); a fake when given. */
const releaseDoor =
  (home: string, fake?: (root: string, startedBy: number) => number | null): CommandDoor =>
  (by) =>
    (fake ?? ((root, startedBy) => leftCommand(root, {}, startedBy)))(join(home, "repo"), by);

/** A tick's own command, as the home's command file names it (2026-11-13-005); a fake when given. */
const ownDoor =
  (home: string, fake?: (home: string, startedBy: number) => number | null): CommandDoor =>
  (by) =>
    (fake ?? ((root, startedBy) => leftCommand(root, {}, startedBy, TICK_COMMAND_FILE)))(home, by);

/**
 * Signals the commands a tick started (2026-11-13-004, D-2; 2026-11-13-005): a bounded command
 * leads a process group of its own, which a signal to the tick, or launchd ending the tick, does
 * not reach. Each door answers the group to signal only for a command that tick started and that
 * is still that process; a door not in the list is not asked. The groups signalled are returned.
 */
function endTickCommand(
  tick: number,
  doors: readonly CommandDoor[],
  kill: (group: number) => void,
): number[] {
  const ended: number[] = [];
  for (const door of doors) {
    const group = door(tick);
    if (group === null) continue;
    try {
      kill(group);
      ended.push(group);
    } catch {
      // The command ended between the check and the signal.
    }
  }
  return ended;
}

/** The pid of the tick the lock file names, when it names one. */
function lockedTick(home: string): number | null {
  const pid = readJson<{ pid?: unknown }>(join(home, "lock.json"))?.pid;
  return typeof pid === "number" && Number.isInteger(pid) && pid > 1 ? pid : null;
}

const STOP_WAIT_MS = 30_000;
const STOP_POLL_MS = 500;

/**
 * `bun scripts/improve-loop.ts stop` (2026-10-28-001 AC-7, D-1): the loop paused, the marker written for
 * the tick, and the live tick ended with SIGTERM: only a lock that passes every check is acted on (an
 * integer pid above 1, this boot, an ISO start, the process alive and running the tick's own command
 * line), its group when the pid is the group's id, the pid alone otherwise; then the lock is waited
 * for up to thirty seconds. A lock that fails a check signals nothing and stays as it is.
 */
export async function stopLoop(deps: StopDeps): Promise<string> {
  const { home } = deps;
  writeConfigPatch(home, { paused: true });
  writeFileSync(
    stopMarkerOf(home),
    `${JSON.stringify({ at: deps.now().toISOString(), by: "stop" })}\n`,
    { mode: 0o600 },
  );
  const lock = validLock(readJson<unknown>(join(home, "lock.json")), deps.boot());
  const none = "no tick is running; the loop is paused";
  if (!lock || !deps.alive(lock.pid)) return none;
  const pid = String(lock.pid);
  const command = deps.sh(["ps", "-o", "command=", "-p", pid], { cwd: home }).stdout;
  if (!(command.includes("improve-loop.ts") && /\btick\b/.test(command))) return none;
  const pgid = deps.sh(["ps", "-o", "pgid=", "-p", pid], { cwd: home }).stdout.trim();
  deps.kill(pgid === pid ? -lock.pid : lock.pid, "SIGTERM");
  // A command of the tick's release runs in a group of its own (2026-11-13-004, D-2), which the
  // signal above does not reach: it is killed here, so the step fails and the release stops as it
  // did when the command shared the tick's group. Asked again on each turn of the wait, for a tick
  // caught between two commands.
  const killCommand = () =>
    endTickCommand(lock.pid, [releaseDoor(home, deps.leftCommand)], (group) =>
      deps.kill(-group, "SIGKILL"),
    );
  // The tick's own command (2026-11-13-005): once, with the signal it got when it shared the
  // tick's group, and not again, so the commands a stopped tick then runs to write the stopped
  // run's record are left alone.
  endTickCommand(lock.pid, [ownDoor(home, deps.tickCommand)], (group) =>
    deps.kill(-group, "SIGTERM"),
  );
  killCommand();
  const ended = () => !existsSync(join(home, "lock.json"));
  for (let waited = 0; waited < STOP_WAIT_MS && !ended(); waited += STOP_POLL_MS) {
    await deps.wait(STOP_POLL_MS);
    if (!ended()) killCommand();
  }
  return ended()
    ? `stopped: the tick (pid ${pid}) ended; the loop is paused (bun scripts/improve-loop.ts resume)`
    : `stop requested: the tick (pid ${pid}) is still ending; the loop is paused`;
}

/** The command a relaunched tick runs (2026-10-28-001 AC-2): this bun, this script, the arguments given. */
export function relaunchCommand(args: readonly string[]): { cmd: string; args: string[] } {
  return { cmd: process.execPath, args: [process.argv[1] as string, ...args] };
}

/** Where a tick's running command says who it is, under the loop's home (2026-11-13-005). */
export const TICK_COMMAND_FILE = "tick-in-progress.command";
/** Where an install's running command says who it is, under the loop's home (2026-11-13-005). */
export const INSTALL_COMMAND_FILE = "install-in-progress.command";

/**
 * The loop's commands over a runner (2026-11-13-005): every one with a bound, so none waits for
 * ever. `sh` gives a call that names none the bound of a local command. `git` gives each command
 * the release's bound for it and the release's environment for git, so a credential that would
 * ask fails at once; the ssh command git's configuration names is read per folder a command runs
 * in, once, since the loop's git runs in its home, its clone and the user's checkout, and one
 * folder's key must not reach another's. A git command killed at its bound says so on the first
 * line of its stderr. Given a command file, every command carries it, so who ends a tick can end
 * its command (a bounded command leads a group of its own).
 */
export function loopCommands(
  run: CommandRunner,
  env: NodeJS.ProcessEnv,
  commandFile?: string,
): { sh: TickDeps["sh"]; git: TickDeps["git"] } {
  const file = commandFile ? { commandFile } : {};
  const sh: TickDeps["sh"] = (cmd, opts) =>
    run(cmd, { ...opts, timeoutMs: opts.timeoutMs ?? LOCAL_MS, ...file });
  const envOf = new Map<string, Record<string, string>>();
  const git: TickDeps["git"] = (args, cwd) => {
    let gitEnvironment = envOf.get(cwd);
    if (!gitEnvironment) {
      const configured = env.GIT_SSH_COMMAND
        ? ""
        : run(["git", "config", "--get", "core.sshCommand"], {
            cwd,
            timeoutMs: LOCAL_MS,
            env: { GIT_TERMINAL_PROMPT: "0" },
            ...file,
          });
      gitEnvironment = gitEnv(
        env,
        configured && configured.status === 0 ? configured.stdout.trim() : "",
      );
      // Kept for the folder when git answered: a command or none set (status 1). A read that
      // could not be made, as in a folder that is not there yet, is made again at the next call.
      const answered =
        configured === "" || (!configured.timedOut && !configured.error && configured.status <= 1);
      if (answered) envOf.set(cwd, gitEnvironment);
    }
    const cmd = ["git", ...args];
    const bound = boundOf(cmd);
    const r = run(cmd, { cwd, timeoutMs: bound, env: gitEnvironment, ...file });
    return r.timedOut ? { ...r, stderr: `timed out after ${bound / 1000} s\n${r.stderr}` } : r;
  };
  return { sh, git };
}

/** How old a lock file must be before the clearing takes it for a killed git's. */
const CLEAR_LOCK_AGE_MS = 60_000;

/** A wait inside the tick's own process, which runs its commands one at a time. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * What a killed git left in the loop's clone, cleared (2026-11-13-005): the lock files directly
 * in `.git` and under `.git/refs`, and a rebase left in progress, each said. Only a tick that
 * holds the loop's lock calls it, after the commands of a dead tick are ended, so no git of the
 * loop's own commands is writing there. A lock made in the last minute can still be a living
 * git's: git's own maintenance, started by the tick before, or a dead tick's git that no command
 * file named. So such a lock is waited for until it is a minute old, and taken only if it is
 * there with the same modification time then; one a git released meanwhile, or wrote again, is
 * left. A lock of a
 * git that was just killed, as by the install's kickstart, is taken after that wait, so the
 * tick's first git command does not fail on it. The release keeps a narrower rule for the same
 * folder (its own `index.lock` alone), since a release can run by hand beside a person's git.
 */
export function clearClone(
  repo: string,
  git: TickDeps["git"],
  log: (line: string) => void,
  wait: (ms: number) => void = sleepSync,
): void {
  const gitDir = join(repo, ".git");
  const locksIn = (dir: string, deep: boolean): string[] => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return deep ? locksIn(path, true) : [];
      return entry.name.endsWith(".lock") ? [path] : [];
    });
  };
  const madeAt = (path: string): number | null => {
    try {
      return statSync(path).mtimeMs;
    } catch {
      return null;
    }
  };
  for (const path of [...locksIn(gitDir, false), ...locksIn(join(gitDir, "refs"), true)]) {
    const rel = relative(repo, path);
    try {
      const made = madeAt(path);
      if (made === null) continue;
      const age = Date.now() - made;
      if (age >= CLEAR_LOCK_AGE_MS) {
        rmSync(path, { force: true });
        log(`a lock a killed git left was removed: ${rel}`);
        continue;
      }
      const rest = CLEAR_LOCK_AGE_MS - Math.max(age, 0);
      log(
        `a git lock made in the last minute: waiting ${Math.ceil(rest / 1000)} s before it is taken: ${rel}`,
      );
      wait(rest);
      const now = madeAt(path);
      // Released by a living git during the wait: nothing of this tick's to remove.
      if (now === null) continue;
      if (now !== made) {
        log(`a lock a git still holds is left: ${rel}`);
        continue;
      }
      rmSync(path, { force: true });
      log(`a lock made in the last minute was waited for and removed: ${rel}`);
    } catch {
      // Not removable: git says so itself at this tick's first command there.
    }
  }
  if (existsSync(join(gitDir, "rebase-merge")) || existsSync(join(gitDir, "rebase-apply"))) {
    const aborted = git(["rebase", "--abort"], repo);
    log(
      aborted.status === 0
        ? "a rebase left in progress was aborted"
        : `a rebase left in progress could not be aborted: ${aborted.stderr.trim().split("\n")[0] ?? ""}`,
    );
  }
}

/**
 * A clone made beside its place and moved there when it is whole (2026-11-13-005), so a folder
 * with `.git` at the clone's place is always a finished clone: a clone killed at its bound leaves
 * git no chance to remove a half-made one. A folder an earlier clone left is removed first.
 * Null when the clone is in place; the error's line otherwise, with nothing left beside it and
 * whatever stood at the clone's place untouched.
 */
export function cloneInto(
  git: TickDeps["git"],
  url: string,
  repo: string,
  cwd: string,
): string | null {
  const making = `${repo}.cloning`;
  rmSync(making, { recursive: true, force: true });
  const cloned = git(["clone", "-q", url, making], cwd);
  if (cloned.status !== 0) {
    rmSync(making, { recursive: true, force: true });
    return cloned.stderr.trim().split("\n")[0] ?? "";
  }
  try {
    renameSync(making, repo);
    return null;
  } catch (error) {
    rmSync(making, { recursive: true, force: true });
    return `${repo} is in the way: ${(error as Error).message}`;
  }
}

/** What a command needs of this machine (2026-10-28-001 AC-7): the shell, this boot's identity, whether a pid is alive. */
function machineDeps(
  home: string,
  run: CommandRunner = spawnRunner(false),
): {
  run: CommandRunner;
  boot: TickDeps["boot"];
  alive: TickDeps["alive"];
} {
  return {
    run,
    // Before the tick holds its lock: a bound and no command file, which a tick that then leaves would replace.
    boot: () =>
      run(["/usr/sbin/sysctl", "-n", "kern.boottime"], {
        cwd: home,
        timeoutMs: LOCAL_MS,
      }).stdout.trim(),
    alive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** The notification's title and body after a tick (AC-10): the version released, or `crew improve` and why nothing was. */
export function tickNotification(summary: {
  released: string | null;
  improved: readonly string[];
  reason: string | null;
  dayTotal: string;
  /** The run the user stopped (2026-10-28-001 AC-7): the notice says so in place of the verdict. */
  stopped?: string | null;
}): [title: string, body: string] {
  const title = summary.released ? `crew ${summary.released}` : "crew improve";
  const what = summary.stopped
    ? `${STOPPED_BY_USER}: run ${summary.stopped}`
    : summary.released
      ? summary.improved.join("; ")
      : (summary.reason ?? "nothing to report");
  return [title, `${what}. Today: ${summary.dayTotal}.`];
}

/** The roots a kept harness may touch (D-4): the skill and the agents, nothing that runs. */
export const HARNESS_ROOTS = ["plugins/core/skills/crew/", "plugins/core/agents/"] as const;
export const ADOPTION_RULE = "kept-harness-adoption";
/** How much of the judge's answer the ruling keeps. */
const RULING_LIMIT = 4000;

/** The part of a run's record the adoption reads. */
export interface AdoptionRecord {
  run: string;
  targets: string[];
  baseline: Record<string, CaseFigures>;
  proposals: { id: string; probe: Record<string, CaseFigures> }[];
  composition: { ids: string[]; probe: Record<string, CaseFigures> } | null;
  kept: Kept | null;
  branch: string | null;
}

const two = (n: number): string => n.toFixed(2);

/** The probe figures of what the run kept: the single proposal's, or the composition's. */
function keptProbe(record: AdoptionRecord): Record<string, CaseFigures> | null {
  if (!record.kept) return null;
  if (record.kept.kind === "single") {
    const id = record.kept.id;
    return record.proposals.find((p) => p.id === id)?.probe ?? null;
  }
  return record.composition?.probe ?? null;
}

/**
 * The adoption's gate, in code before any judge (AC-17, security R-2): the kept harness's figures
 * are a win by the run's own rule (`verdictOf`: every target rose over its baseline's median, no probed case
 * fell) and every path of its diff lies under the harness roots. The judge rules only what code
 * cannot: whether a rule of the method was weakened.
 */
export function adoptionGate(
  record: AdoptionRecord,
  diffPaths: readonly string[],
): { holds: boolean; clause: string | null } {
  if (!record.kept) return { holds: false, clause: "nothing kept" };
  const probe = keptProbe(record);
  if (!probe) return { holds: false, clause: "the kept harness has no probe figures" };
  const { verdict, reasons } = verdictOf(
    record.targets,
    Object.keys(probe),
    record.baseline,
    probe,
  );
  if (verdict !== "win")
    return { holds: false, clause: `the figures are not a win: ${reasons.join("; ")}` };
  const outside = diffPaths.filter((p) => !HARNESS_ROOTS.some((root) => p.startsWith(root)));
  if (outside.length)
    return { holds: false, clause: `paths outside the harness: ${outside.join(", ")}` };
  return { holds: true, clause: null };
}

/** The judge's answer, read strictly (AC-17): JSON with a `result` whose first line is exactly `holds`; anything else, an error or no JSON, is `does not hold`. */
export function parseRuling(output: string): { holds: boolean; text: string } {
  let parsed: { result?: unknown; is_error?: unknown } | null = null;
  try {
    parsed = JSON.parse(output) as { result?: unknown; is_error?: unknown };
  } catch {
    parsed = null;
  }
  if (typeof parsed !== "object" || parsed === null || typeof parsed.result !== "string")
    return { holds: false, text: `unreadable answer: ${output.slice(0, 200)}` };
  const text = parsed.result;
  const first = text
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l !== "");
  return { holds: parsed.is_error !== true && first === "holds", text };
}

/** The text of a judge answer the CLI marks as an error (`is_error: true` in its JSON), or null for any other answer: such an answer is a failed call, never a ruling (2026-11-09-004). */
function errorAnswerOf(output: string): string | null {
  try {
    const parsed = JSON.parse(output) as { is_error?: unknown; result?: unknown } | null;
    if (parsed?.is_error !== true) return null;
    return typeof parsed.result === "string" ? parsed.result : "";
  } catch {
    return null;
  }
}

/** The headless judge's arguments (AC-6): the prompt, the judge's own text with the rule appended, read-only tools, JSON, no session, no settings and no MCP server of the session, the model chosen for the ruling (2026-11-09-004), a turn cap. */
export function judgeArgs(prompt: string, systemPrompt: string, model: string): string[] {
  return [
    "-p",
    prompt,
    "--append-system-prompt",
    systemPrompt,
    "--tools",
    "Read,Grep,Glob",
    "--output-format",
    "json",
    "--no-session-persistence",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    "--model",
    model,
    "--max-turns",
    "40",
  ];
}

/** The rule as the judge's system prompt carries it, after the judge agent's own text. */
export function adoptionSystemPrompt(judgeText: string): string {
  return `${judgeText.trim()}

## The rule ${ADOPTION_RULE}

You act as validator for one rule, where no person watches. The loop's own code already checked that the kept harness's figures are a win and that its diff touches only the skill and the agents. You rule the one clause code cannot: whether the diff weakens or removes a rule of the method. Read the diff against the skill page and its rules; a sentence softened, a step made optional, a "never" turned into a "prefer", a gate or a record left out, a decision moved from the user to the agent, each is a weakening. Answer with a first line that is exactly \`holds\` or \`does not hold\`, then a \`Missing:\` line naming what is weakened (or \`none\`).`;
}

/** What the judge is asked to read for a run. */
export function adoptionPrompt(run: string): string {
  const folder = `docs/improve/${run}`;
  return `Rule ${ADOPTION_RULE} for improvement run ${run}. Read ${folder}/record.json (what was measured, the targets and their figures), ${folder}/adoption/diff.patch (the kept harness's change), plugins/core/skills/crew/SKILL.md and plugins/core/skills/crew/references/rules.md (the rules the diff must not weaken). Does the rule hold? First line exactly \`holds\` or \`does not hold\`; then \`Missing:\` with what is weakened, or \`none\`.`;
}

export interface AdoptDeps {
  git: (args: string[], cwd: string) => { status: number; stdout: string; stderr: string };
  /** One question to a model in the provider's environment, so the ruling is asked of one that can rule (2026-11-09-004). */
  probeJudge: (call: { model: string; cwd: string; env: Record<string, string> }) => ProbeAnswer;
  /** The judge's call: its status, its stdout (the JSON answer) and its stderr, where a limit can be written. */
  judge: (call: { cwd: string; args: string[]; env: Record<string, string> }) => {
    status: number | null;
    output: string;
    stderr?: string;
  };
  release: (call: {
    reason: string;
    notes: string[];
  }) => Promise<{ code: number; version: string | null; stopped?: string }>;
  log: (line: string) => void;
}

/** The text after `Missing:` in a ruling, or its second line, for the notification. */
function missingOf(text: string): string {
  const missing = /Missing:\s*(.+)/i.exec(text)?.[1]?.trim();
  if (missing) return missing;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  return lines[1] ?? lines[0] ?? "no reason given";
}

/**
 * The adoption of a kept harness (AC-6, D-4, D-5, D-9): the gate in code, then the judge on the
 * diff, chosen by a probe and named in the ruling (2026-11-09-004), then the merge into main and the patch release, when every answer holds and the run was
 * measured on Claude models; otherwise the branch stays and the reason is returned for the
 * notification. Every file written goes through the redaction.
 */
export async function adoptRun(
  input: {
    repo: string;
    folder: string;
    record: AdoptionRecord;
    provider: ResolvedProvider;
    judgeSystemPrompt: string;
  },
  deps: AdoptDeps,
): Promise<
  | { released: string | null; reason: string | null; notRuled?: undefined }
  | { released: null; reason: string; notRuled: true; branch: string }
> {
  const { repo, folder, record, provider } = input;
  const branch = record.branch ?? `improve/${record.run}`;
  const write = (rel: string, text: string) =>
    writeRedacted(join(folder, "adoption", rel), text, provider.secrets);
  // The branch's commit, read once and first (findings 237 and 240): the gate's paths, the patch and
  // the merge all name it by its id, so what is gated, ruled on and merged is one commit, and a
  // person adopting the run by hand checks origin's branch against it. A branch that does not
  // resolve ends here: nothing is gated, judged or merged on a name that names no commit.
  const resolved = deps.git(["rev-parse", branch], repo);
  const commit = resolved.stdout.trim();
  if (resolved.status !== 0 || !/^[0-9a-f]{40}$/.test(commit)) {
    const reason = `the branch ${branch} does not resolve to a commit`;
    deps.log(`adoption of ${record.run}: ${reason}`);
    return { released: null, reason };
  }
  write("commit", `${commit}\n`);
  // No rename detection: a file moved into the harness roots lists its old path too.
  const names = deps.git(["diff", "--name-only", "--no-renames", `main...${commit}`], repo);
  const paths = names.stdout.split("\n").filter((l) => l.trim() !== "");
  const gate = adoptionGate(record, paths);
  write(
    "gate.md",
    `# Adoption gate of ${record.run} (${ADOPTION_RULE})\n\n${gate.holds ? "holds" : `does not hold: ${gate.clause}`}\n\n- paths: ${paths.join(", ") || "none"}\n`,
  );
  if (!gate.holds) {
    deps.log(`adoption of ${record.run}: the gate failed: ${gate.clause}`);
    return { released: null, reason: `the gate failed: ${gate.clause}` };
  }
  write("diff.patch", deps.git(["diff", `main...${commit}`], repo).stdout);
  // The judge of the ruling, chosen as a run's is (2026-11-09-004 D-3): the first candidate that
  // answers its probe in the provider's environment. No probe's output is written anywhere but the log.
  const title = `# Ruling of ${record.run} (${ADOPTION_RULE})`;
  const choice = chooseJudge(provider.judgeModel, provider.agentModel, (model) =>
    deps.probeJudge({ model, cwd: repo, env: provider.env }),
  );
  for (const line of choice.lines) deps.log(`adoption of ${record.run}: ${line}`);
  // Every model asked that did not rule, with why: a ruling and a not-ruled file both name them.
  const passed = choice.skipped.map((s) => `${s.model} (${s.reason})`);
  const asked = (judge: string): string =>
    `- judge: ${judge}\n- passed over: ${passed.join(", ") || "none"}`;
  /** Nothing is ruled and nothing is released: the file and the log say why, the branch stays. */
  const notRuled = (
    sentence: string,
    reason = sentence,
  ): { released: null; reason: string; notRuled: true; branch: string } => {
    write("ruling.md", `${title}\n\n${asked("none")}\n\n${sentence}\n`);
    deps.log(`adoption of ${record.run}: ${sentence}`);
    return { released: null, reason, notRuled: true, branch };
  };
  if (choice.judge === null) {
    const reason = `no judge answered (${choice.probed.map((p) => `${p.model}: ${p.outcome}`).join(", ")})`;
    return notRuled(`not ruled: ${reason}`, reason);
  }
  // A judge call that fails is not a ruling, whatever its exit status: a non-zero exit, or an
  // answer the CLI marks as an error. At a limit the next candidate is asked once, whole; with
  // none left, or for any other failure, nothing is ruled.
  const candidates = judgeCandidates(provider.judgeModel, provider.agentModel);
  let ruled: { judge: string; output: string } | null = null;
  let failure = "not ruled: every judge was at its limit";
  for (const candidate of candidates.slice(candidates.indexOf(choice.judge))) {
    const answer = deps.judge({
      cwd: repo,
      args: judgeArgs(
        adoptionPrompt(record.run),
        adoptionSystemPrompt(input.judgeSystemPrompt),
        candidate,
      ),
      env: provider.env,
    });
    const errorText = answer.status === 0 ? errorAnswerOf(answer.output) : null;
    if (answer.status === 0 && errorText === null) {
      ruled = { judge: candidate, output: answer.output };
      break;
    }
    if (LIMITED.test(errorText ?? `${answer.output}${answer.stderr ?? ""}`)) {
      passed.push(`${candidate} (limited)`);
      continue;
    }
    passed.push(`${candidate} (failed)`);
    failure =
      answer.status === 0
        ? "not ruled: the judge's answer was an error"
        : `not ruled: the judge exited ${answer.status}`;
    break;
  }
  if (ruled === null) return notRuled(failure);
  const judge = ruled.judge;
  const ruling = parseRuling(ruled.output);
  // The ruling is published with the record: bounded, and withheld when it carries a secret's shape.
  const leaked = scanText(ruling.text, "ruling")[0];
  if (leaked) ruling.text = `withheld: the judge's answer held a secret (${leaked.rule})`;
  else ruling.text = ruling.text.slice(0, RULING_LIMIT);
  write(
    "ruling.md",
    `${title}\n\n${asked(judge)}\n\n${ruling.holds ? "holds" : "does not hold"}\n\n${ruling.text}\n`,
  );
  if (!ruling.holds) {
    const reason = `the judge ruled "does not hold": ${missingOf(ruling.text)}`;
    deps.log(`adoption of ${record.run}: ${reason}`);
    return { released: null, reason };
  }
  if (!provider.claudeModels) {
    const reason = `measured on ${provider.name}, not Claude models: kept on its branch, not released (D-9)`;
    deps.log(`adoption of ${record.run}: ${reason}`);
    return { released: null, reason };
  }
  const probe = keptProbe(record) as Record<string, CaseFigures>;
  const gains = gainTexts(record);
  const what = keptLabel(record) as string;
  const merged = deps.git(
    [
      "merge",
      "--no-ff",
      "-q",
      "-m",
      `Adopt improvement run ${record.run}: ${what} (${gains.join(", ")})`,
      commit,
    ],
    repo,
  );
  if (merged.status !== 0) {
    const reason = `the merge of ${branch} failed: ${merged.stderr.trim().split("\n")[0] ?? ""}`;
    deps.log(`adoption of ${record.run}: ${reason}`);
    deps.git(["merge", "--abort"], repo);
    return { released: null, reason };
  }
  const released = await deps.release({
    reason: `improvement run ${record.run}: ${gains.join(", ")}`,
    notes: [
      ...record.targets.map((t) => {
        const before = record.baseline[t] as CaseFigures;
        const after = probe[t] as CaseFigures;
        return `- ${t}: ${two(before.mean)} → ${two(after.mean)} (median ${two(medianOf(before))})`;
      }),
      `- kept: ${what}`,
    ],
  });
  if (released.code !== 0 || !released.version) {
    deps.log(`adoption of ${record.run}: the release did not finish`);
    return {
      released: null,
      reason: released.stopped
        ? `the release stopped before step 1: ${released.stopped}`
        : "the release did not finish: see the log and crew improve status",
    };
  }
  deps.git(["push", "-q", "origin", "--delete", branch], repo);
  return { released: released.version, reason: null };
}

/** What the tick tells a person of a kept run that was not ruled (2026-11-11-002, D-3). */
export const ADOPT_BY_HAND = "adopt it by hand (docs/improve/README.md)";

/**
 * What a person is told of an adoption that ruled nothing (2026-11-11-002, D-3): the loop never
 * offers the run again, so the sentence names its branch, in the notification's reason and in the
 * log. A run measured on a provider that is not Claude models has none: the loop's own rule never
 * releases one (ADR 0015, decision 3), so no person is asked to. One value for the two places
 * (finding 237): the sentence, or null.
 */
export function keptNote(branch: string, claudeModels: boolean): string | null {
  return claudeModels
    ? `the run was not ruled and its branch ${branch} is kept: ${ADOPT_BY_HAND}`
    : null;
}

/** The configuration file's own content, or nothing. */
function readConfigFile(home: string): Partial<LoopConfig> {
  const path = join(home, "config.json");
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Partial<LoopConfig>) : {};
}

/** The configuration as the file holds it, the defaults for what it leaves out. */
export function readConfig(home: string): LoopConfig {
  const defaults: LoopConfig = {
    provider: "runtime",
    casesPerRun: 2,
    staleDays: 7,
    proposals: 2,
    marketplace: { account: "andreagroferreira" },
    maxRunUsd: CEILING_DEFAULTS.maxRunUsd,
    maxDayUsd: CEILING_DEFAULTS.maxDayUsd,
  };
  const given = readConfigFile(home);
  return { ...defaults, ...given, marketplace: { ...defaults.marketplace, ...given.marketplace } };
}

const LOG_LIMIT = 5 * 1024 * 1024;
export const LOG_NAMES = ["tick.out.log", "tick.err.log"] as const;

/** launchd's two fixed logs, each moved to `.1` above 5 MB; one old generation kept (AC-16). */
export function rotateLogs(home: string): void {
  for (const name of LOG_NAMES) {
    const path = join(home, "log", name);
    if (existsSync(path) && statSync(path).size > LOG_LIMIT) renameSync(path, `${path}.1`);
  }
}

/** A run's record as the loop reads it back from `docs/improve/<run>/record.json`. */
interface LoopRecord extends AdoptionRecord {
  at: string;
  provider: { name: string; claudeModels: boolean } | null;
  costUsd: number;
  exit: number;
  /** The ids of the harness lessons the run recorded (`string[]` as `scripts/improve.ts` writes it); what the clone holds is not checked (finding 174). */
  lessons?: unknown;
}

/** How many distinct harness lessons a record lists: the string ids of its `lessons` array, 0 for a record without one or with another shape (finding 174). */
function listedLessons(record: Pick<LoopRecord, "lessons">): number {
  return Array.isArray(record.lessons)
    ? new Set(record.lessons.filter((id): id is string => typeof id === "string")).size
    : 0;
}

/** The lessons count a tick stores after its run (finding 174): the count from before the run plus the lessons the record lists, never above what the base holds now; so the run's own lessons never make the next tick due, while one added from outside during the run still does. */
function lessonsAfterRun(
  before: number,
  record: Pick<LoopRecord, "lessons">,
  heldNow: number,
): number {
  return Math.min(heldNow, before + listedLessons(record));
}

function readRecords(repo: string): LoopRecord[] {
  const dir = join(repo, "docs", "improve");
  if (!existsSync(dir)) return [];
  const out: LoopRecord[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name, "record.json");
    if (!existsSync(path)) continue;
    try {
      const record = JSON.parse(readFileSync(path, "utf8")) as LoopRecord;
      // A record of another shape (no run, no time) is no measurement either: read as one, it would
      // sort as the latest run through its missing time and the tick would read its run as undefined
      // (2026-10-28-001 AC-9, a `{}` record beside the dead folders).
      if (typeof record.run === "string" && typeof record.at === "string") out.push(record);
    } catch {
      // A record that is not JSON is no measurement.
    }
  }
  return out;
}

/**
 * Whether a case's figures hold a run that was not judged because its judge was at a limit
 * (2026-11-09-004): such a measurement is to be made again. A run not judged for another cause,
 * as a refusal of the case's content, would meet the same cause again, and counts as measured.
 * A cause is the class the record keeps since 2026-11-11-002 (`limited` and `overloaded` are at a
 * limit, `failed` is not); any other string is the CLI's text in a record written before that,
 * read by the pattern.
 */
export function unjudgedAtLimit(figures: unknown): boolean {
  const f = figures as { unjudged?: unknown; runs?: unknown } | null | undefined;
  if (f?.unjudged !== true || !Array.isArray(f.runs)) return false;
  const causes = (f.runs as { unjudged?: unknown }[])
    .map((r) => r?.unjudged)
    .filter((c): c is string => typeof c === "string");
  return causes.length > 0 && causes.every((c) => CLASS_AT_LIMIT.get(c) ?? LIMITED.test(c));
}

/** Whether each class of a not-judged cause is a limit: the measurement is made again. */
const CLASS_AT_LIMIT: ReadonlyMap<string, boolean> = new Map([
  ["limited", true],
  ["overloaded", true],
  ["failed", false],
]);

/** The figures of a record a run stopped on: every baseline's and probe's with a run not judged. */
function unjudgedFigures(record: Pick<LoopRecord, "baseline" | "proposals" | "composition">) {
  return [
    ...Object.values(record.baseline ?? {}),
    ...(record.proposals ?? []).flatMap((p) => Object.values(p.probe ?? {})),
    ...Object.values(record.composition?.probe ?? {}),
  ].filter((f) => (f as { unjudged?: unknown })?.unjudged === true);
}

/**
 * Each case's last measurement across the records (AC-4): a baseline or a probe, by the run's
 * time; a measurement not judged at a limit is none (2026-11-09-004). A record whose baseline for
 * a case errored does not measure it, unless the last record before it with a judged baseline for
 * the case errored too (2026-11-13-005): one error is tried again at the next due tick, and a
 * case that errors every time waits the stale window from its second error.
 */
export function lastMeasuredOf(
  records: readonly LoopRecord[],
  cases: readonly string[],
): Record<string, string | null> {
  const out: Record<string, string | null> = Object.fromEntries(cases.map((c) => [c, null]));
  // Whether the last record with a judged baseline for the case errored for it (2026-11-13-005).
  const lastBaselineErrored: Record<string, boolean> = {};
  const judged = (figures: Record<string, unknown> | undefined): string[] =>
    Object.entries(figures ?? {})
      .filter(([, f]) => !unjudgedAtLimit(f))
      .map(([name]) => name);
  for (const record of [...records].sort((a, b) => a.at.localeCompare(b.at))) {
    const baselines = new Set(judged(record.baseline));
    const names = new Set([
      ...baselines,
      ...(record.proposals ?? []).flatMap((p) => judged(p.probe)),
    ]);
    for (const name of names) {
      if (!(name in out)) continue;
      if (baselines.has(name)) {
        const errored =
          (record.baseline?.[name] as { errored?: unknown } | undefined)?.errored === true;
        const first = errored && lastBaselineErrored[name] !== true;
        lastBaselineErrored[name] = errored;
        // A baseline that errored once is to be measured again; twice running, the case waits as any measured one.
        if (first) continue;
      }
      if (out[name] === null || (out[name] as string) < record.at) out[name] = record.at;
    }
  }
  return out;
}

function gainTexts(record: AdoptionRecord): string[] {
  const probe = keptProbe(record);
  if (!probe) return [];
  return record.targets.map((t) => {
    const before = record.baseline[t];
    const after = probe[t];
    return before && after ? `${t} ${two(before.mean)} → ${two(after.mean)}` : t;
  });
}

/** What a record kept, by name: the proposal, or the composition's proposals joined. */
function keptLabel(record: AdoptionRecord): string | null {
  if (!record.kept) return null;
  return record.kept.kind === "composition" ? record.kept.ids.join(" + ") : record.kept.id;
}

/** The words of a run the user stopped (2026-10-28-001 AC-7), in the verdict, the commit, the report's row and the notification. */
export const STOPPED_BY_USER = "stopped by the user";

/** A run's verdict in words, by what `runImprove` documents each exit as (2026-10-28-001 AC-8): the ceiling is a stop the loop set, not an error. */
export function verdictText(record: LoopRecord): string {
  if (record.exit === 2) return `stopped at the ceiling (${usd(record.costUsd)})`;
  if (record.exit === 3) return "failed (exit 3)";
  if (record.exit === 4) return STOPPED_BY_USER;
  if (record.exit === 6) return "stopped: a run was not judged";
  if (record.exit !== 0) return `ended with exit ${record.exit}`;
  if (!record.kept) return "nothing kept";
  return `kept ${keptLabel(record)} (${gainTexts(record).join(", ")})`;
}

/** Today's runs as the report lists them: a provider without Claude models has no list price. */
function dayRunsOf(records: readonly LoopRecord[], date: string): DayRun[] {
  return records
    .filter((r) => r.at.startsWith(date))
    .map((r) => ({
      run: r.run,
      targets: r.targets,
      verdict: verdictText(r),
      provider: r.provider ?? { name: "runtime", claudeModels: true },
      costUsd: r.provider && !r.provider.claudeModels ? null : r.costUsd,
    }));
}

function dayTotalOf(runs: readonly DayRun[]): string {
  const priced = runs.map((r) => pricedCost(r.costUsd)).filter((c): c is number => c !== null);
  return priced.length ? usd(priced.reduce((sum, c) => sum + c, 0)) : "n/a";
}

export interface TickDeps {
  /** The loop's home. */
  home: string;
  originUrl: string;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  pid: number;
  /** This boot's identity, so a lock from before a reboot is stale. */
  boot: () => string;
  alive: (pid: number) => boolean;
  git: (
    args: string[],
    cwd: string,
  ) => { status: number; stdout: string; stderr: string; timedOut?: boolean };
  sh: (
    cmd: string[],
    opts: {
      cwd: string;
      env?: Record<string, string>;
      input?: string;
      /** The command's output is a secret: never printed. */
      quiet?: boolean;
      /** The command is killed past this many milliseconds, with its process group. */
      timeoutMs?: number;
    },
  ) => { status: number; stdout: string; stderr: string; timedOut?: boolean };
  /** The improvement itself (`runImprove` with the real deps of the clone). */
  improve: (options: ImproveOptions, repo: string) => Promise<number>;
  /** A signal handler for the tick's duration (2026-10-28-001 AC-7): installed, and removed by what it returns. */
  onSignal: (signal: "SIGTERM", handler: () => void) => () => void;
  /** The tick run again on the code the sync brought (2026-10-28-001 AC-2): its status. */
  relaunch: (args: string[]) => number;
  probeJudge: AdoptDeps["probeJudge"];
  judge: AdoptDeps["judge"];
  release: (options: ReleaseOptions) => Promise<ReleaseOutcome>;
  readSecret: SecretReader;
  /** The CTO plan's identity for this repository, or null. */
  plan: (repo: string) => string | null;
  /** How many harness lessons the base holds. */
  lessons: (repo: string) => number;
  /** The user's checkout to fast-forward when clean (D-1), or null. */
  userCheckout: string | null;
  tmpdir: string;
  log: (line: string) => void;
  /** A dead tick's own command, as the home's command file names it (2026-11-13-005): the file's own check when not given. */
  tickCommand?: (home: string, startedBy: number) => number | null;
  /** A dead tick's release's command, as the clone's command file names it: the release's own check when not given. */
  leftCommand?: (root: string, startedBy: number) => number | null;
  /** Kills a process group by its leader's pid: SIGKILL to the group when not given. */
  killGroup?: (group: number) => void;
  /** A wait inside the tick, for a git lock made in the last minute (2026-11-13-005): the process's own when not given. */
  pause?: (ms: number) => void;
  /** The pid of an install that still runs, or null (2026-11-13-005): none when not given. */
  installRunning?: () => number | null;
  /** The user's home, which a stop's name writes as `~`: none when not given. */
  userHome?: string;
}

const LOOP_TEMP = /^improve-(?:trees|hooks)-/;
/** A loop temp folder younger than this may be a run in progress by hand; older ones are leftovers. */
const TEMP_AGE_MS = DAY_MS;
const DATED_LOG_DAYS = 14;
/** An improvement run's result folder in the clone, as `runFolder` names it; bounded like the dated logs (finding 175). */
const IMPROVE_RESULT = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-improve-/;
/** How long the clone keeps an improvement run's result folder: as long as a dated log. */
const RESULT_FOLDER_DAYS = DATED_LOG_DAYS;

/** How each half of `sweepLeftovers` reads an entry: the temp half follows a link, the results half never does. */
export interface SweepStats {
  temp: (path: string) => { mtimeMs: number };
  results: (path: string) => { mtimeMs: number; isDirectory(): boolean };
}

/**
 * What a tick removes before it runs (finding 177): the loop's own temp folders past their age, by
 * name, and the improvement runs' result folders past theirs, a real directory alone (a file or a
 * link of a matching name is left, and a link is never followed). An entry whose stat throws, gone
 * between the listing and the stat or a link to nothing, is skipped and never removed, and the
 * sweep goes on.
 */
export function sweepLeftovers(
  tmp: string,
  results: string,
  now: Date,
  stats: SweepStats = { temp: statSync, results: lstatSync },
): void {
  const quietly = <T>(read: () => T): T | null => {
    try {
      return read();
    } catch {
      return null;
    }
  };
  for (const name of existsSync(tmp) ? readdirSync(tmp) : []) {
    if (!LOOP_TEMP.test(name)) continue;
    const entry = join(tmp, name);
    const stat = quietly(() => stats.temp(entry));
    if (stat && now.getTime() - stat.mtimeMs > TEMP_AGE_MS)
      rmSync(entry, { recursive: true, force: true });
  }
  for (const name of existsSync(results) ? readdirSync(results) : []) {
    if (!IMPROVE_RESULT.test(name)) continue;
    const entry = join(results, name);
    const stat = quietly(() => stats.results(entry));
    if (stat?.isDirectory() && now.getTime() - stat.mtimeMs > RESULT_FOLDER_DAYS * DAY_MS)
      rmSync(entry, { recursive: true, force: true });
  }
}

/** The wait after `failures` failed ticks in a row, in hours: 1, 2, 4 … capped at a day, so a run that cannot be saved is not paid for every hour. */
export { backoffHours };

/** The run's own files, written by `runImprove`, rewritten through the redaction (AC-14). */
function redactRunFiles(folder: string, secrets: readonly string[]): void {
  for (const name of ["record.json", "record.md"]) {
    const path = join(folder, name);
    if (existsSync(path)) writeRedacted(path, readFileSync(path, "utf8"), secrets);
  }
}

/** The user's checkout fast-forwarded when clean and on main (D-1); the note says why when it is left. */
function fastForwardUserCheckout(user: string, git: TickDeps["git"]): string {
  const status = git(["status", "--porcelain"], user).stdout.trim();
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], user).stdout.trim();
  if (status !== "") return "the user's checkout has uncommitted changes: left as it is";
  if (branch !== "main") return `the user's checkout is on ${branch}: left as it is`;
  // A command killed at its bound here can leave a lock the loop must not remove: the note names it (2026-11-13-005).
  const cut = (command: string) =>
    `the user's checkout: git ${command} timed out after ${boundOf(["git", command]) / 1000} s; if git then says a lock exists, remove ${join(user, ".git", "index.lock")}`;
  const fetched = git(["fetch", "-q", "origin"], user);
  if (fetched.timedOut) return cut("fetch");
  const ff = git(["merge", "-q", "--ff-only", "origin/main"], user);
  if (ff.timedOut) return cut("merge");
  return ff.status === 0 ? "" : "the user's checkout could not be fast-forwarded: left as it is";
}

/** The tick's lock: its own file, created exclusively, so two ticks started together (launchd's load and the install's kickstart) cannot both hold it. */
export interface TickLock {
  pid: number;
  startedAt: string;
  boot: string;
}

/** Installs the shell into the clone's `node_modules/.cache/ms-playwright`; a no-op once it is there. */
export const CLONE_SHELL_INSTALL = [
  "env",
  "PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/ms-playwright",
  // The clone's own bin, pinned by its lockfile: `bun x` would fetch one if the package ever left it.
  "node_modules/.bin/playwright",
  "install",
  "chromium-headless-shell",
];

export function readLock(home: string): TickLock | null {
  return readJson<TickLock>(join(home, "lock.json"));
}

/** The bounds of the bootstrap's two commands (2026-11-13-005): the packages, and the shell's download. */
const PACKAGES_MS = 300_000;
const SHELL_INSTALL_MS = 900_000;

/** One command of the bootstrap under its bound: null when it passed, the bootstrap's error otherwise. */
function bootstrapStep(
  sh: TickDeps["sh"],
  cmd: string[],
  repo: string,
  ms: number,
  what: string,
): string | null {
  const r = sh(cmd, { cwd: repo, timeoutMs: ms });
  if (r.status === 0) return null;
  return r.timedOut
    ? `${what} timed out after ${ms / 1000} s`
    : `${what} failed: ${r.stderr.trim().split("\n")[0] ?? ""}`;
}

/** The clone's packages, as its lockfile pins them: a no-op when they are there, so every tick runs it (2026-11-13-005). */
export function installPackages(repo: string, sh: TickDeps["sh"]): string | null {
  return bootstrapStep(
    sh,
    ["bun", "install", "--frozen-lockfile"],
    repo,
    PACKAGES_MS,
    "bun install",
  );
}

/**
 * The shell the ui cases copy, in the clone's own folder (the shared cache's clean-up can take
 * it), by Playwright's own install (2026-11-13-005): it downloads the
 * build the clone's Playwright names when that build is not finished, whatever older builds sit
 * beside it, and does nothing when it is. Run before every run, with no check of this loop's.
 */
export function ensureShell(repo: string, sh: TickDeps["sh"]): string | null {
  return bootstrapStep(
    sh,
    CLONE_SHELL_INSTALL,
    repo,
    SHELL_INSTALL_MS,
    "the headless shell's install",
  );
}

/** The clone made able to run, as the install does it: the packages, then the shell; null when both passed. */
export function bootstrapClone(repo: string, sh: TickDeps["sh"]): string | null {
  return installPackages(repo, sh) ?? ensureShell(repo, sh);
}

/** The dated logs older than two weeks, removed. */
function pruneDatedLogs(home: string, now: Date): void {
  const oldest = new Date(now.getTime() - DATED_LOG_DAYS * DAY_MS).toISOString().slice(0, 10);
  for (const name of readdirSync(join(home, "log")))
    if (/^\d{4}-\d{2}-\d{2}\.log$/.test(name) && name.slice(0, 10) < oldest)
      rmSync(join(home, "log", name), { force: true });
}

/**
 * A pending release at a step, with the step's name beside its number (item 2026-11-09-001,
 * AC-19): the name is what a resume looks for once the release's steps were renumbered.
 */
function pendingAt(version: string, failedStep: number): PendingRelease {
  const failedName = RELEASE_STEP_NAMES[failedStep - 1];
  return { version, failedStep, ...(failedName === undefined ? {} : { failedName }) };
}

/**
 * Where a pending release resumes, and the log line that says it (item 2026-11-09-001, AC-19): at
 * the stored number while its name still stands there, or when no name was stored (a state an
 * older loop wrote); at the step that carries the name now; with no `fromStep`, which is the first
 * step after the push, when the name is gone from the release.
 */
export function resumeFrom(pending: PendingRelease): { fromStep?: number; line: string } {
  const { version, failedStep, failedName } = pending;
  if (failedName === undefined || RELEASE_STEP_NAMES[failedStep - 1] === failedName)
    return { fromStep: failedStep, line: `resuming release ${version} from step ${failedStep}` };
  const index = (RELEASE_STEP_NAMES as readonly string[]).indexOf(failedName);
  if (index >= 0)
    return {
      fromStep: index + 1,
      line: `resuming release ${version}: step "${failedName}" is now step ${index + 1}`,
    };
  return {
    line: `resuming release ${version}: step "${failedName}" is gone from the release; resumed from the first step after the push`,
  };
}

/**
 * One tick of the loop (AC-5, AC-16): the lock, the logs, the back-off, the clone, the probe, the
 * pause, the clone brought to origin/main, a pending release resumed, the decision, the run (on
 * record before anything can fail), the record and the report committed and pushed, the adoption
 * with its merge undone when the release fails before its push, the user's checkout, the state
 * and the notification.
 */
export async function tick(
  options: { dryRun?: boolean; relaunched?: boolean },
  deps: TickDeps,
): Promise<number> {
  const { home } = deps;
  const repo = join(home, "repo");
  const now = deps.now();
  const date = now.toISOString().slice(0, 10);
  // A tick that died before this one (2026-10-28-001 AC-9), recorded once the day's state exists.
  let dead: DeadTick | null = null;
  // This tick handed over to one on the code the sync brought (2026-10-28-001 AC-2): its state is the other's to save.
  let relaunched = false;
  mkdirSync(join(home, "log"), { recursive: true });
  const config = readConfig(home);
  const state: ImproveState = readStateAt(home);
  let secrets: string[] = [];
  const log = (line: string) => {
    const text = redact(`${now.toISOString()} ${line}`, secrets);
    deps.log(text);
    appendFileSync(join(home, "log", `${date}.log`), `${text}\n`);
  };
  const saveState = () =>
    writeRedacted(join(home, "state.json"), `${JSON.stringify(state, null, 2)}\n`, secrets);

  // The lock: a file created exclusively; a live pid on this boot holds it, anything else is stale and taken over.
  const lockPath = join(home, "lock.json");
  const takeLock = () =>
    writeTextNew(
      lockPath,
      `${JSON.stringify({ pid: deps.pid, startedAt: now.toISOString(), boot: deps.boot() })}\n`,
    );
  // An install writes in the clone under a lock of its own (2026-11-13-005): no tick works beside it.
  const installing = deps.installRunning?.() ?? null;
  if (installing !== null) {
    log(`an install is running (pid ${installing}); leaving`);
    return 0;
  }
  if (!takeLock()) {
    const held = readJson<unknown>(lockPath);
    const shown = (held as Record<string, unknown> | null)?.pid;
    // A live tick is an integer pid alive on this boot, as before; the checks of `stop` and of the
    // dead tick's record (an integer above 1) are theirs, since only they act on the pid.
    const heldPid = typeof shown === "number" && Number.isInteger(shown) ? shown : null;
    const sameBoot = (held as Record<string, unknown> | null)?.boot === deps.boot();
    if (heldPid !== null && sameBoot && deps.alive(heldPid)) {
      log(`another tick holds the lock (pid ${heldPid}); leaving`);
      return 0;
    }
    // A dead pid on this boot, or a lock from another boot: the tick that wrote it died (finding 190).
    dead = deadTickOf(held, repo);
    log(
      `a stale lock (pid ${heldPid ?? "unknown"}) is taken over; ${dead.run ? `run ${dead.run} left without a record, folder removed` : "no run left"}`,
    );
    // What the dead tick left running, its own command or its release's (2026-11-13-005): ended
    // before this tick runs anything, so no push or download of a dead tick works beside it.
    if (heldPid !== null && heldPid > 1)
      for (const group of endTickCommand(
        heldPid,
        [releaseDoor(home, deps.leftCommand), ownDoor(home, deps.tickCommand)],
        deps.killGroup ?? ((g) => process.kill(-g, "SIGKILL")),
      ))
        log(`the command the dead tick left running was killed (pid ${group})`);
    rmSync(lockPath, { force: true });
    if (!takeLock()) {
      log("another tick took the lock first; leaving");
      return 0;
    }
  }
  // Whether a stop's marker was there before this tick: only one that appears during it is a stop
  // that landed on it (2026-11-13-005).
  const markerAtStart = existsSync(stopMarkerOf(home));
  const stopLanded = () => !markerAtStart && existsSync(stopMarkerOf(home));
  // What a killed git left in the clone, cleared before this tick's first git command there.
  if (existsSync(join(repo, ".git"))) clearClone(repo, deps.git, log, deps.pause);
  // The handler keeps the tick alive through a stop's SIGTERM so the record is written; the kit's
  // child dies with the group signal and the run ends at its next step (2026-10-28-001 AC-7, D-1).
  const offSignal = deps.onSignal("SIGTERM", () =>
    log("stop requested: the run ends at its next step"),
  );
  const notify = (title: string, body: string) =>
    deps.sh(notificationCommand(title, redact(body, secrets)), { cwd: home });
  const git = (args: string[], cwd = repo) => deps.git(args, cwd);
  const must = (args: string[], cwd = repo): string => {
    const r = git(args, cwd);
    if (r.status !== 0)
      throw new Error(`git ${args[0]} failed: ${r.stderr.trim().split("\n")[0] ?? ""}`);
    return r.stdout;
  };
  /** A step of the bootstrap, its error thrown. */
  const bootstrapped = (error: string | null) => {
    if (error) throw new Error(error);
  };
  /** The improve folder's changes committed; false when there is nothing to commit. */
  const commitDocs = (message: string): boolean => {
    must(["add", "-A", "docs/improve"]);
    if (git(["diff", "--cached", "--quiet"]).status === 0) return false;
    must(["commit", "-q", "-m", message]);
    return true;
  };
  /**
   * The clone's main rebased onto origin/main when origin moved (finding 172): null, or git's first
   * line when the rebase failed, the rebase aborted so the clone stays on main.
   */
  const rebaseOntoOrigin = (): string | null => {
    if (git(["merge-base", "--is-ancestor", "origin/main", "HEAD"]).status === 0) return null;
    const rebased = git(["rebase", "-q", "origin/main"]);
    if (rebased.status === 0) return null;
    git(["rebase", "--abort"]);
    return rebased.stderr.trim().split("\n")[0] ?? "";
  };
  /**
   * The clone's main pushed with `branches`, the records rebased onto origin/main first when a
   * person moved it during the run (finding 172); a rebase or a push that fails throws, so the
   * back-off applies. Returns where origin/main stood before the push.
   */
  const pushMain = (branches: string[]): string => {
    must(["fetch", "-q", "origin"]);
    const base = must(["rev-parse", "origin/main"]).trim();
    const failed = rebaseOntoOrigin();
    if (failed !== null)
      throw new Error(`the records could not be rebased onto origin/main: ${failed}`);
    const pushed = git(["push", "-q", "origin", "main", ...branches]);
    if (pushed.status !== 0)
      throw new Error(
        `the records' push was refused: ${pushed.stderr.trim().split("\n")[0] ?? ""}; the next tick pushes them again`,
      );
    return base;
  };
  const day: DayState = state.day?.date === date ? state.day : { date, releases: [], failures: [] };
  state.day = day;
  /** The report of the day as it stands, with the day's budget skip when one happened (2026-10-27-006 AC-5), its dead ticks and its stopped runs. */
  const writeDayReport = () =>
    writeRedacted(
      join(repo, "docs", "improve", "daily", `${date}.md`),
      dailyReport(
        date,
        dayRunsOf(readRecords(repo), date),
        day.releases,
        day.failures,
        {
          budget: day.budgetSkip ? { at: day.budgetSkip.at, reason: day.budgetSkip.reason } : null,
          judge: day.judgeSkip ?? null,
          token: day.tokenSkip ?? null,
          // The day's own record of the skip, never the state's present pending release.
          pending: day.pendingSkip ?? null,
        },
        { deadTicks: day.deadTicks ?? [], stoppedRuns: day.stoppedRuns ?? [] },
      ),
      secrets,
    );
  if (dead) {
    day.deadTicks = [...(day.deadTicks ?? []), dead];
    saveState();
    notify("crew improve", deadTickNotice(dead));
    // The day's report carries it now, as the budget skip's does; without a clone yet, the state does.
    if (existsSync(join(repo, ".git"))) {
      writeDayReport();
      if (commitDocs(`Improvement tick ${date}: a tick died`)) pushMain([]);
    }
  }
  /**
   * A due tick that runs nothing, for one of two reasons: the day's budget is spent (2026-10-27-006
   * D-2, AC-5) or no judge answered the run's probes (2026-11-09-004). The first skip of the day of
   * its kind is kept in the state before anything that can fail, written into the report's Skipped
   * ticks section, committed and pushed through the run's own path and notified once; a later skip
   * of the kind logs alone (the tick's finally saves the state). No record folder, no lastRun: what
   * made the tick due is unchanged.
   */
  const skipTick = (
    kind: "budget" | "judge" | "token" | "pending",
    reason: string,
    costUsd = 0,
  ): void => {
    const earlier = {
      budget: day.budgetSkip,
      judge: day.judgeSkip,
      token: day.tokenSkip,
      pending: day.pendingSkip,
    }[kind];
    if (earlier) {
      log(`skipped: ${reason}; reported at ${hhmm(earlier.at)} UTC`);
      return;
    }
    const at = now.toISOString();
    if (kind === "budget") day.budgetSkip = { at, costUsd, reason };
    else if (kind === "judge") day.judgeSkip = { at };
    else if (kind === "token") day.tokenSkip = { at };
    else day.pendingSkip = { at, reason };
    saveState();
    // What the log says after the reason; a pending release's reason says it all.
    const after = {
      budget: "; every later tick of the day skips the same way",
      judge: "; a later due tick probes again",
      token: "; a later tick probes again",
      pending: "",
    }[kind];
    log(`skipped: ${reason}${after}`);
    writeDayReport();
    commitDocs(
      `Improvement tick ${date}: ${
        {
          budget: "the day's budget is spent",
          judge: reason,
          token: "the release's account has no token",
          pending: "a release is pending",
        }[kind]
      }`,
    );
    pushMain([]);
    notify(
      "crew improve",
      kind === "budget"
        ? `skipped: ${reason}. Every later tick of the day skips the same way.`
        : kind === "judge"
          ? `skipped: ${reason}. The tick's log has each model's answer.`
          : `skipped: ${reason}${after}`,
    );
  };

  try {
    rotateLogs(home);
    pruneDatedLogs(home, now);
    // The clone, made and bootstrapped when absent.
    if (!existsSync(join(repo, ".git"))) {
      const failed = cloneInto(deps.git, deps.originUrl, repo, home);
      if (failed !== null) throw new Error(`git clone failed: ${failed}`);
    }
    // The provider, and with it the secrets every line and file is redacted of.
    const provider = providerEnv(config, deps.readSecret);
    secrets = provider.secrets;
    // The first tick writes the probe the install waits for (D-8).
    if (needsProbe(home, config.paused === true)) {
      const probe = runProbe(config, repo, deps.sh, deps.git);
      writeRedacted(join(home, "probe.json"), `${JSON.stringify(probe, null, 2)}\n`, secrets);
      state.probe = probe as unknown as Record<string, unknown>;
    }
    if (config.paused) {
      state.lastTick = now.toISOString();
      log("paused by config.json; nothing run");
      return 0;
    }
    // The clone brought to origin/main: a run's commits an earlier tick could not push go first,
    // then the fetch and the reset; stale worktrees and old temp folders pruned; then the packages.
    must(["fetch", "-q", "origin"]);
    // The loop never removes itself from the clone (finding 169): an origin/main without the
    // script is waited for, not synced to; nothing is pushed or reset until it holds the loop.
    if (git(["cat-file", "-e", "origin/main:scripts/improve-loop.ts"]).status !== 0) {
      state.lastTick = now.toISOString();
      log(
        `origin/main has no scripts/improve-loop.ts: the clone stays at ${must(["rev-parse", "--short", "HEAD"]).trim()}; waiting for the loop's commit`,
      );
      return 0;
    }
    if (git(["rev-list", "--count", "origin/main..HEAD"]).stdout.trim() !== "0") {
      // Only the records go: a merge an interrupted adoption left behind never reaches origin ungated.
      // The local commits' own changes (three dots, from the merge base), so a moved origin's files
      // are not counted against them (finding 172).
      const touched = git(["diff", "--name-only", "origin/main...HEAD"])
        .stdout.split("\n")
        .filter((l) => l.trim() !== "");
      const beyond = touched.filter((path) => !path.startsWith("docs/improve/"));
      if (beyond.length)
        log(`local commits beyond the records dropped (${beyond.slice(0, 3).join(", ")})`);
      else {
        // The kept branches the records name go with them, when origin lacks them.
        const local = git(["for-each-ref", "--format=%(refname:short)", "refs/heads/improve/"])
          .stdout.split("\n")
          .filter((l) => l.trim() !== "");
        const remote = git(["ls-remote", "--heads", "origin", "improve/*"]).stdout;
        const branches = local.filter((b) => !remote.includes(`refs/heads/${b}`));
        // Origin moved meanwhile: the records go on top of it, or are dropped when they cannot.
        const unrebased = rebaseOntoOrigin();
        if (unrebased !== null)
          log(
            `an earlier run's commits could not be rebased onto origin/main and are dropped: ${unrebased}`,
          );
        else {
          const pushed = git(["push", "-q", "origin", "main", ...branches]);
          log(
            pushed.status === 0
              ? `an earlier run's commits pushed${branches.length ? ` (with ${branches.join(", ")})` : ""}`
              : `an earlier run's commits could not be pushed and are dropped: ${pushed.stderr.trim().split("\n")[0] ?? ""}`,
          );
        }
      }
    }
    const headBefore = must(["rev-parse", "HEAD"]).trim();
    must(["reset", "-q", "--hard", "origin/main"]);
    // Where main stood when the run started: the base its figures were measured against (finding 172).
    const syncedMain = must(["rev-parse", "HEAD"]).trim();
    git(["worktree", "prune"]);
    sweepLeftovers(deps.tmpdir, join(repo, "plugins", "core", "evals", "results"), now);
    // The packages at every tick, and not only when the lockfile changed: an install that failed is
    // tried again by the next tick, and a no-op costs milliseconds (2026-11-13-005).
    bootstrapped(installPackages(repo, deps.sh));
    // The code this tick runs is the one bun loaded at launch; when the sync brought another, the
    // tick hands over to one on the new code, once (2026-10-28-001 AC-2, D-2, finding 188).
    if (!options.relaunched && headBefore !== syncedMain) {
      const changed = git([
        "diff",
        "--name-only",
        headBefore,
        syncedMain,
        "--",
        "scripts",
        "packages/engine/src",
      ]).stdout.trim();
      if (changed) {
        log(
          `the loop's code changed at the sync (${headBefore.slice(0, 7)}..${syncedMain.slice(0, 7)}); relaunched on the new code`,
        );
        relaunched = true;
        rmSync(lockPath, { force: true });
        return deps.relaunch(["tick", "--relaunched"]);
      }
    }
    // A release left pending after its push is resumed first; one with nothing to resume is cleared.
    if (state.pendingRelease) {
      const { version } = state.pendingRelease;
      const from = resumeFrom(state.pendingRelease);
      log(from.line);
      const resumed = await deps.release({
        root: repo,
        resume: version,
        ...(from.fromStep === undefined ? {} : { fromStep: from.fromStep }),
        reason: `resumed release ${version}`,
        githubAccount: config.marketplace.account,
      });
      if (resumed.code === 0) {
        state.pendingRelease = null;
        day.releases.push({ version, run: "resumed" });
      } else if (resumed.failedStep !== null)
        state.pendingRelease = pendingAt(version, resumed.failedStep);
      else if (resumed.stopped) {
        // The resume stopped, beside a running release or a command that did not end: the release
        // is still to be resumed, where "nothing to resume" would forget a version that is on
        // origin (2026-11-13-005). One line of the day's report, however many ticks meet it.
        log(`the resume of ${version} stopped: ${resumed.stopped}`);
        const name = stopName(resumed.stopped, home, deps.userHome ?? "", secrets);
        if (!day.failures.some((f) => f.run === "resumed" && f.name === name))
          day.failures.push({ run: "resumed", step: 0, name });
      } else {
        state.pendingRelease = null;
        log(`nothing to resume for ${version}: cleared`);
      }
      saveState();
    }
    // The back-off after failed ticks: the model is not paid again every hour for a run that cannot be saved.
    if (state.backoffUntil && now.toISOString() < state.backoffUntil) {
      log(`backing off until ${state.backoffUntil} after ${state.failures ?? 0} failed tick(s)`);
      return 0;
    }
    // The decision.
    const cases = allCases(repo);
    const facts: RepoFacts = {
      pluginHead: must(["log", "-1", "--format=%H", "HEAD", "--", ...HARNESS_ROOTS]).trim(),
      plan: deps.plan(repo),
      lessons: deps.lessons(repo),
      lastMeasured: lastMeasuredOf(readRecords(repo), cases),
      lockAlive: false,
    };
    const due = dueRun(state, facts, config, now);
    state.lastTick = now.toISOString();
    if (!due.due) {
      log(`not due: ${due.reason}`);
      return 0;
    }
    const targets = pickTargets(cases, facts.lastMeasured, config.casesPerRun);
    if (options.dryRun) {
      log(
        `dry run: due (${due.reason}); targets: ${targets.join(", ")}; provider: ${provider.name}; nothing run${
          readJson<Partial<Probe>>(join(home, "probe.json"))?.releaseToken === "missing"
            ? "; the release's account has no token: a real tick would skip"
            : ""
        }`,
      );
      return 0;
    }
    // A release still pending after its resume (2026-11-13-005): the adoption's release would stop
    // at it, so no run is paid for; said once a day, as any skip.
    if (state.pendingRelease) {
      const held = state.pendingRelease;
      skipTick(
        "pending",
        `release ${held.version} is pending at step ${held.failedStep}: no improvement run until it is resumed`,
      );
      state.lastTick = now.toISOString();
      return 0;
    }
    // The release's token, read by the due tick itself before it pays for a run (2026-11-13-005,
    // the user's decision of 2026-11-13): the probe's word can be old, since a word "found" is
    // never taken again. A read killed at its bound is no logged-out account: the tick fails.
    const account = config.marketplace.account;
    const read = accountToken(deps.sh, account, repo);
    if (read.timedOut)
      throw new Error(
        `the release's token could not be read: gh auth token timed out after ${LOCAL_MS / 1000} s`,
      );
    const releaseToken = read.token === null ? "missing" : "found";
    const probeFile = join(home, "probe.json");
    const probeNow = readJson<Record<string, unknown>>(probeFile);
    if (probeNow && probeNow.releaseToken !== releaseToken) {
      const updated = { ...probeNow, releaseToken };
      writeRedacted(probeFile, `${JSON.stringify(updated, null, 2)}\n`, secrets);
      state.probe = updated;
    }
    if (read.token === null) {
      skipTick(
        "token",
        `the release's account (${account}) has no token: log in to it with gh auth login`,
      );
      state.lastTick = now.toISOString();
      return 0;
    }
    // The two ceilings (2026-10-27-006 D-2): the run's goes to the run; the day's is read here from
    // the day's priced records, after the due and dry-run decisions and before the run.
    const runCeiling = ceilingOf(config, "maxRunUsd", CEILING_DEFAULTS.maxRunUsd);
    const dayCeiling = ceilingOf(config, "maxDayUsd", CEILING_DEFAULTS.maxDayUsd);
    for (const note of [runCeiling.note, dayCeiling.note]) if (note) log(note);
    if (dayCeiling.value > 0) {
      const cost = dayCostOf(dayRunsOf(readRecords(repo), date));
      if (cost.priced >= dayCeiling.value) {
        skipTick("budget", budgetReason(dayCeiling.value, cost), cost.priced);
        return 0;
      }
    }
    log(`due: ${due.reason}; targets: ${targets.join(", ")}; provider: ${provider.name}`);
    // A run needs the browser the ui cases copy. Here and not at the sync, so a download gates no tick that would
    // not run, no pending release and no dry run; a failed install fails this tick under the back-off, and the
    // next due tick installs again (2026-10-30-001 AC-28, 2026-11-13-005).
    if (stopLanded()) {
      // A stop that found no command to signal: the download does not start.
      state.lastTick = now.toISOString();
      log("stop requested: nothing run");
      return 0;
    }
    bootstrapped(ensureShell(repo, deps.sh));
    // The run; then the last run on record before anything can fail, its files through the
    // redaction, and the record and the day's report committed and pushed with the kept branch (D-3).
    const code = await deps.improve(
      {
        cases: targets,
        proposals: config.proposals,
        judgeModel: provider.judgeModel,
        provider,
        maxCostUsd: runCeiling.value > 0 ? runCeiling.value : undefined,
      },
      repo,
    );
    // No judge answered the run's probes (2026-11-09-004): nothing ran and no record was written,
    // so the newest record on file is an earlier run's and must not be read as this one's.
    if (code === 5) {
      skipTick("judge", "no judge answered");
      return 0;
    }
    const latest = readRecords(repo).sort((a, b) => (a.at < b.at ? 1 : -1))[0] ?? null;
    if (!latest) throw new Error(`the improvement exited ${code} and left no record`);
    // The user stopped the run (2026-10-28-001 AC-7): exit 4, or the marker present at its end. The
    // run is on record as stopped, nothing is adopted, no failure is counted; the marker goes.
    const stoppedRun = code === 4 || existsSync(stopMarkerOf(home));
    if (stoppedRun) {
      state.stopped = { at: now.toISOString(), run: latest.run };
      day.stoppedRuns = [...(day.stoppedRuns ?? []), latest.run];
      rmSync(stopMarkerOf(home), { force: true });
      latest.kept = null;
    }
    // A run stopped because its judge was at a limit measured nothing it can stand on
    // (2026-11-09-004): the last run stays what it was, so what made this tick due makes the next
    // one due, and that one probes first. A stop for another cause would repeat on the same case.
    const notJudged = unjudgedFigures(latest);
    const stoppedAtLimit = code === 6 && notJudged.length > 0 && notJudged.every(unjudgedAtLimit);
    if (!stoppedAtLimit)
      state.lastRun = {
        at: now.toISOString(),
        head: facts.pluginHead,
        plan: facts.plan,
        // The base read again now the run ended (finding 174): see lessonsAfterRun.
        lessons: lessonsAfterRun(facts.lessons, latest, deps.lessons(repo)),
        run: latest.run,
      };
    state.failures = 0;
    state.backoffUntil = null;
    saveState();
    const folder = join(repo, "docs", "improve", latest.run);
    redactRunFiles(folder, secrets);
    writeDayReport();
    commitDocs(
      `Improvement run ${latest.run}: ${stoppedRun ? STOPPED_BY_USER : verdictText(latest)}`,
    );
    const base = pushMain(latest.branch ? [latest.branch] : []);
    // The adoption (D-4, D-5, D-9): its merge is undone when the release fails before its push,
    // so nothing unreleased ever reaches origin/main.
    let released: string | null = null;
    let reason: string | null = latest.kept ? null : `run ${latest.run}: ${verdictText(latest)}`;
    // Main moved during the run (finding 172): the figures were measured against the whole tree,
    // so the adoption is made on the new main only when the move changed nothing outside docs/;
    // otherwise nothing is adopted on a tree that was not measured, and the next tick starts anew.
    let stale = false;
    if (latest.kept && base !== syncedMain) {
      const moved = git(["diff", "--name-only", "--no-renames", syncedMain, base])
        .stdout.split("\n")
        .filter((l) => l.trim() !== "");
      const outside = moved.filter((path) => !path.startsWith("docs/"));
      const span = `${syncedMain.slice(0, 7)}..${base.slice(0, 7)}`;
      if (outside.length === 0)
        log(`main moved during the run (${span}) in docs/ alone: adopting on the new main`);
      else {
        stale = true;
        reason = `run ${latest.run}: kept, but main moved during the run (${span}) beyond docs/ (${outside[0]}): nothing adopted on the tree that was not measured; the next tick starts from the new main (branch ${latest.branch} kept)`;
        log(reason);
      }
    }
    if (latest.kept && !stale) {
      const judgeText = existsSync(join(repo, "plugins/core/agents/judge.md"))
        ? readFileSync(join(repo, "plugins/core/agents/judge.md"), "utf8").replace(
            /^---[\s\S]*?---\n/,
            "",
          )
        : "# Judge";
      const mainBefore = must(["rev-parse", "HEAD"]).trim();
      const adopted = await adoptRun(
        { repo, folder, record: latest, provider, judgeSystemPrompt: judgeText },
        {
          git: deps.git,
          probeJudge: deps.probeJudge,
          judge: deps.judge,
          log,
          release: async ({ reason: why, notes }) => {
            // The adoption's files are committed before the release, whose precondition is a clean tree.
            commitDocs(`Improvement run ${latest.run}: the adoption's ruling`);
            const rulingCommit = must(["rev-parse", "HEAD"]).trim();
            /** The merge off main, the ruling's files committed again on the head that was. */
            const takeMergeBack = () => {
              must(["reset", "-q", "--hard", mainBefore]);
              git(["checkout", rulingCommit, "--", `docs/improve/${latest.run}`]);
              commitDocs(`Improvement run ${latest.run}: the adoption's ruling`);
            };
            const outcome = await deps.release({
              root: repo,
              bump: "patch",
              reason: why,
              notes,
              githubAccount: config.marketplace.account,
              pending: state.pendingRelease ?? null,
              rollbackTo: mainBefore,
            });
            // A stop before step 1 (2026-11-13-005): the whole line to the log, its name to what is kept.
            const stoppedAs =
              outcome.failedStep === null && outcome.stopped
                ? stopName(outcome.stopped, home, deps.userHome ?? "", secrets)
                : null;
            if (stoppedAs !== null) log(`the release stopped before step 1: ${outcome.stopped}`);
            const failure =
              outcome.failedStep === null
                ? stoppedAs === null
                  ? null
                  : { run: latest.run, step: 0, name: stoppedAs }
                : {
                    run: latest.run,
                    step: outcome.failedStep,
                    name: RELEASE_STEP_NAMES[outcome.failedStep - 1] as string,
                  };
            if (outcome.code === 0) {
              state.pendingRelease = null;
              day.releases.push({ version: outcome.version, run: latest.run });
            } else if (outcome.pending && failure) {
              state.pendingRelease = pendingAt(outcome.version, failure.step);
              day.failures.push(failure);
              if (outcome.localUnconfirmed) {
                // The pending version is held, and this run's commits are not confirmed on origin
                // (2026-11-13-004): the push's outcome is unknown, or the version is an earlier
                // run's. The merge goes, as for a failure before the push, so the tick's own push
                // sends nothing unreleased; the kept branch waits for a later tick.
                takeMergeBack();
                log(
                  `release ${outcome.version} is held pending at step ${failure.step} and is not confirmed on origin: this run's adoption waits`,
                );
              }
            } else {
              // Before the push: the merge goes, the adoption's files stay on the main that was.
              takeMergeBack();
              if (failure) day.failures.push(failure);
            }
            saveState();
            return {
              code: outcome.code,
              version: outcome.code === 0 ? outcome.version : null,
              ...(stoppedAs === null ? {} : { stopped: stoppedAs }),
            };
          },
        },
      ).catch((error: unknown) => {
        // Whatever stopped the adoption, the merge never stays on main.
        git(["reset", "-q", "--hard", mainBefore]);
        throw error;
      });
      released = adopted.released;
      reason = adopted.reason;
      if (adopted.notRuled) {
        // Nothing decided against the run and the loop never offers it again: a person is told.
        // The branch is the one the adoption read; its reason is already in the log.
        const note = keptNote(adopted.branch, provider.claudeModels);
        if (note !== null) {
          reason = `${adopted.reason}; ${note}`;
          log(`adoption of ${latest.run}: ${note}`);
        }
      }
      // The adoption's files and the day's report, with what the release did.
      writeDayReport();
      if (commitDocs(`Improvement run ${latest.run}: the day's report`)) pushMain([]);
    }
    const checkoutNote = deps.userCheckout
      ? fastForwardUserCheckout(deps.userCheckout, deps.git)
      : "";
    if (checkoutNote) log(checkoutNote);
    const dayTotal = dayTotalOf(dayRunsOf(readRecords(repo), date));
    const [title, body] = tickNotification({
      released,
      improved: gainTexts(latest),
      reason: reason ?? null,
      dayTotal,
      stopped: stoppedRun ? latest.run : null,
    });
    notify(title, checkoutNote ? `${body} ${checkoutNote}.` : body);
    return 0;
  } catch (error) {
    const message = (error as Error).message;
    if (stopLanded()) {
      // A command of this tick ended by a stop a person asked for: no failed tick, no back-off.
      log(`stop requested: the tick ends (${message})`);
      return 0;
    }
    state.failures = (state.failures ?? 0) + 1;
    const hours = backoffHours(state.failures);
    state.backoffUntil = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
    log(`the tick failed: ${message}; the next tick waits ${hours} h`);
    notify("crew improve", `the tick failed: ${message}. The next tick waits ${hours} h.`);
    return 1;
  } finally {
    offSignal();
    rmSync(lockPath, { force: true });
    // The stderr log's size as this tick ends: `status` reports what the agent writes after it
    // (finding 171); a tick that handed over saves nothing, the state is the relaunched tick's.
    if (!relaunched) {
      state.stderrBytes = agentStderrSize(home);
      saveState();
    }
  }
}

export const LABEL = "io.wizardingcode.crew-improve";

/**
 * The agent's launcher, `<home>/tick.sh`, run by launchd as `/bin/sh <path>` (finding 169): a clone
 * without the loop's script (synced to an origin/main that had none) is brought to origin/main
 * first, each step only after the one before, so the agent always finds the loop to run; a clone
 * that has it is launched as it is, since the tick's own sync keeps an interrupted run's records.
 * Whatever the heal did, bun runs and the launcher ends with its status, so a failure lands in
 * the agent's stderr log, where `status` reports it.
 */
export function launcherScript(input: { bun: string; repo: string }): string {
  return [
    "#!/bin/sh",
    "# The harness-improvement loop's launcher, written by `bun scripts/improve-loop.ts install`.",
    `repo=${singleQuoted(input.repo)}`,
    `bun=${singleQuoted(input.bun)}`,
    'if [ ! -f "$repo/scripts/improve-loop.ts" ]; then',
    '  git -C "$repo" fetch -q origin &&',
    '    git -C "$repo" cat-file -e origin/main:scripts/improve-loop.ts 2>/dev/null &&',
    '    git -C "$repo" reset -q --hard origin/main &&',
    '    (cd "$repo" && "$bun" install --frozen-lockfile)',
    "fi",
    'exec "$bun" "$repo/scripts/improve-loop.ts" tick',
    "",
  ].join("\n");
}

/**
 * A clone whose working tree lacks the loop's script, brought to origin/main when origin/main holds
 * it (the launcher's heal, for `install`): the short sha it was brought to, or why it was not (the
 * fetch failed, origin/main lacks the script too, the reset failed), for install to say. Called
 * only on a clone without the script, so a clone with local edits is never touched.
 */
export function healClone(
  repo: string,
  git: InstallDeps["git"],
): { sha: string } | { why: string } {
  const firstLine = (text: string) => text.trim().split("\n")[0] ?? "";
  const fetched = git(["fetch", "-q", "origin"], repo);
  if (fetched.status !== 0)
    return { why: `origin could not be fetched: ${firstLine(fetched.stderr)}` };
  if (git(["cat-file", "-e", "origin/main:scripts/improve-loop.ts"], repo).status !== 0)
    return { why: "origin/main has no scripts/improve-loop.ts either" };
  const reset = git(["reset", "-q", "--hard", "origin/main"], repo);
  if (reset.status !== 0)
    return { why: `the reset to origin/main failed: ${firstLine(reset.stderr)}` };
  return { sha: git(["rev-parse", "--short", "HEAD"], repo).stdout.trim() };
}

/** The tools the agent's PATH must reach: the loop, the engine's tests (php for the Laravel rows), the kit, the release. */
export const TOOLS = ["bun", "node", "claude", "gh", "php", "git"] as const;

/** The launchd agent (AC-8, D-8): hourly at minute 0 with catch-up on wake, once at load, the tools' PATH, the two fixed logs. */
export function launchdPlist(input: {
  launcher: string;
  home: string;
  path: readonly string[];
  userHome: string;
  wizardingcodeHome?: string;
}): string {
  const env = [
    ["PATH", input.path.join(":")],
    ["HOME", input.userHome],
    ...(input.wizardingcodeHome ? [["WIZARDINGCODE_HOME", input.wizardingcodeHome]] : []),
  ];
  const xml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "\t<key>Label</key>",
    `\t<string>${LABEL}</string>`,
    "\t<key>ProgramArguments</key>",
    "\t<array>",
    "\t\t<string>/bin/sh</string>",
    `\t\t<string>${xml(input.launcher)}</string>`,
    "\t</array>",
    "\t<key>StartCalendarInterval</key>",
    "\t<dict>",
    "\t\t<key>Minute</key>",
    "\t\t<integer>0</integer>",
    "\t</dict>",
    "\t<key>RunAtLoad</key>",
    "\t<true/>",
    "\t<key>EnvironmentVariables</key>",
    "\t<dict>",
    ...env.flatMap(([key, value]) => [
      `\t\t<key>${key}</key>`,
      `\t\t<string>${xml(value as string)}</string>`,
    ]),
    "\t</dict>",
    "\t<key>StandardOutPath</key>",
    `\t<string>${xml(join(input.home, "log", LOG_NAMES[0]))}</string>`,
    "\t<key>StandardErrorPath</key>",
    `\t<string>${xml(join(input.home, "log", LOG_NAMES[1]))}</string>`,
    "\t<key>ProcessType</key>",
    "\t<string>Standard</string>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

export interface InstallDeps {
  home: string;
  originUrl: string;
  userHome: string;
  uid: number;
  env: NodeJS.ProcessEnv;
  which: (tool: string) => string | null;
  git: TickDeps["git"];
  sh: TickDeps["sh"];
  wait: (ms: number) => Promise<void>;
  now: () => Date;
  log: (line: string) => void;
  /** Whether a pid is alive, for the status's reading of the lock. */
  alive?: (pid: number) => boolean;
  /** The command a release of the ended tick waits on, by its pid, or null: the release's own check when not given. */
  leftCommand?: (root: string, startedBy: number) => number | null;
  /** Kills a process group by its leader's pid: SIGKILL to the group when not given. */
  killGroup?: (pid: number) => void;
  /** The ended tick's own command, as the home's command file names it (2026-11-13-005): the file's own check when not given. */
  tickCommand?: (home: string, startedBy: number) => number | null;
  /** The install's lock and its command file, each read once (2026-11-13-005): the real doors when not given. */
  installLock?: () => InstallLockAnswer;
  installCommand?: () => InstallCommandAnswer;
}

/** Where an install says it runs, under the loop's home (2026-11-13-005): its pid and start time. */
export const INSTALL_LOCK = "install.lock";

export type InstallLockAnswer = "absent" | "stale" | { running: number };
export type InstallCommandAnswer =
  | "absent"
  | "off-shape"
  | { running: number }
  | { left: number | null };

/**
 * The install's lock as it stands (2026-11-13-005): absent; an install that still runs, by the
 * release's rule for a recorded process, when it is not this one; stale otherwise (its install is
 * gone or another process, it names this process, or it does not parse).
 */
export function installLockOf(home: string, deps: ProcessDeps = {}): InstallLockAnswer {
  const path = join(home, INSTALL_LOCK);
  if (!existsSync(path)) return "absent";
  const held = readJson<{ pid?: unknown; start?: unknown }>(path);
  const pid = held?.pid;
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 1) return "stale";
  if (typeof held?.start !== "string" || pid === process.pid) return "stale";
  return recordedProcess(pid, held.start, deps) === "same" ? { running: pid } : "stale";
}

/**
 * The install's command file, read once (2026-11-13-005). The file names its own starter, which
 * is asked too, since a lock removed or damaged by hand says nothing of an install that still
 * runs: a starter that still runs and is not this process is a running install. Otherwise the
 * command is judged on that same reading by the check a kill needs.
 */
export function installCommandOf(home: string, deps: ProcessDeps = {}): InstallCommandAnswer {
  const read = readCommandFile(home, INSTALL_COMMAND_FILE);
  if (typeof read === "string") return read;
  if (
    read.releasePid !== process.pid &&
    recordedProcess(read.releasePid, read.releaseStart, deps) === "same"
  )
    return { running: read.releasePid };
  return { left: leftCommandOf(read, deps) };
}

/** The install's lock taken (2026-11-13-005): created exclusively, a lock just read as stale removed first; false when another install created it first. */
function takeInstallLock(home: string, was: InstallLockAnswer): boolean {
  const path = join(home, INSTALL_LOCK);
  mkdirSync(home, { recursive: true });
  if (was === "stale") rmSync(path, { force: true });
  return writeTextNew(
    path,
    `${JSON.stringify({ pid: process.pid, start: processStart(process.pid) })}\n`,
  );
}

/** Ends the command of the tick launchd just ended for an install or an uninstall: launchd's kill does not reach it. */
function endEndedTickCommand(deps: InstallDeps, tick: number | null): void {
  if (tick === null) return;
  endTickCommand(
    tick,
    [releaseDoor(deps.home, deps.leftCommand), ownDoor(deps.home, deps.tickCommand)],
    deps.killGroup ?? ((group) => process.kill(-group, "SIGKILL")),
  );
}

/** What the first tick found it could reach (D-8), written to `probe.json` and printed by install. */
export interface Probe {
  loggedIn: boolean;
  authMethod: string;
  github: string | null;
  remote: string;
  push: string;
  /** Each configured keychain account: found or missing, never a value. */
  keychain: Record<string, "found" | "missing">;
  /**
   * Whether the release's account gave a token when the probe was written (2026-11-13-004), the
   * word alone: a snapshot, not the token's state at a later release. Absent from a probe an
   * older loop wrote.
   */
  releaseToken?: "found" | "missing";
}

/** The bound of each of the probe's two `gh` calls. */
const PROBE_GH_MS = 120_000;

/**
 * Whether the tick has a probe to write: the file is absent or does not parse, or, for a loop
 * that is not paused, does not say the release's token was found (2026-11-13-004), so the word
 * follows a login within the hour. A paused loop takes a probe only when it has none
 * (2026-11-13-005): it runs nothing the word could change.
 */
function needsProbe(home: string, paused: boolean): boolean {
  const file = join(home, "probe.json");
  if (!existsSync(file)) return true;
  try {
    const word = (JSON.parse(readFileSync(file, "utf8")) as Partial<Probe> | null)?.releaseToken;
    return !paused && word !== "found";
  } catch {
    return true;
  }
}

/** The accounts the configuration names in the keychain. */
function keychainAccounts(config: LoopConfig): string[] {
  const out: string[] = [];
  if (config.oauthToken) out.push(config.oauthToken.keychain);
  if (typeof config.provider === "object") {
    if (config.provider.authToken && "keychain" in config.provider.authToken)
      out.push(config.provider.authToken.keychain);
    if (config.provider.apiKey) out.push(config.provider.apiKey.keychain);
  }
  return [...new Set(out)];
}

/** The probe itself (AC-8): the login, the GitHub account, the remote read and a push dry run, the keychain's accounts by presence. */
export function runProbe(
  config: LoopConfig,
  repo: string,
  sh: TickDeps["sh"],
  git: TickDeps["git"],
): Probe {
  const auth = sh(["claude", "auth", "status"], { cwd: repo });
  let loggedIn = false;
  let authMethod = "none";
  try {
    const parsed = JSON.parse(auth.stdout) as { loggedIn?: unknown; authMethod?: unknown };
    loggedIn = parsed.loggedIn === true;
    authMethod = typeof parsed.authMethod === "string" ? parsed.authMethod : "none";
  } catch {
    authMethod = `unreadable (${auth.stderr.trim().split("\n")[0] ?? ""})`;
  }
  const gh = sh(["gh", "auth", "status"], { cwd: repo, timeoutMs: PROBE_GH_MS });
  const github = /account (\S+)/.exec(`${gh.stdout}\n${gh.stderr}`)?.[1] ?? null;
  const first = (text: string) => text.trim().split("\n")[0] ?? "";
  const remote = git(["ls-remote", "origin", "HEAD"], repo);
  const push = git(["push", "--dry-run", "-q", "origin", "main"], repo);
  const keychain: Probe["keychain"] = {};
  for (const account of keychainAccounts(config))
    keychain[account] =
      sh(["security", "find-generic-password", "-s", SERVICE, "-a", account], { cwd: repo })
        .status === 0
        ? "found"
        : "missing";
  return {
    loggedIn,
    authMethod,
    github,
    remote: remote.status === 0 ? "ok" : first(remote.stderr) || "failed",
    push: push.status === 0 ? "ok" : first(push.stderr) || "failed",
    keychain,
    // The release's own read, so the rule for a token being there is written once; the word alone is kept.
    releaseToken:
      accountToken(sh, config.marketplace.account, repo).token === null ? "missing" : "found",
  };
}

/** The fallback's three steps when the agent cannot read the login (D-8). */
const FALLBACK = [
  "the agent is not logged in: the fallback (D-8) is a token from claude setup-token in the keychain:",
  "  1. claude setup-token",
  "  2. bun scripts/improve-loop.ts secret set oauth-token",
  '  3. "oauthToken": { "keychain": "oauth-token" } in config.json',
];

export function printProbe(probe: Probe, account: string, log: (line: string) => void): void {
  log(`login: ${probe.authMethod} (${probe.loggedIn ? "logged in" : "not logged in"})`);
  log(`github: ${probe.github ?? "not logged in"}`);
  log(`release token (${account}): ${probe.releaseToken ?? "not probed"}`);
  log(`remote: ${probe.remote}; push: ${probe.push}`);
  const accounts = Object.entries(probe.keychain).map(([k, v]) => `${k} ${v}`);
  log(`keychain: ${accounts.join(", ") || "nothing configured"}`);
  if (!probe.loggedIn) for (const line of FALLBACK) log(line);
}

const plistPath = (deps: Pick<InstallDeps, "userHome">): string =>
  join(deps.userHome, "Library", "LaunchAgents", `${LABEL}.plist`);

/**
 * The install (AC-8): the tools found, the clone made and bootstrapped (from a checkout when the
 * loop's commit is not on origin yet), the plist written, the agent booted and kicked, the probe
 * waited for and printed with the fallback when the login is not there.
 */
/**
 * How long an install waits for its first tick's probe, in seconds: the probe's own commands,
 * and the minute that tick may first wait for a git lock the kickstart's kill left
 * (2026-11-13-005).
 */
const PROBE_WAIT_S = 90 + CLEAR_LOCK_AGE_MS / 1000;

export async function install(options: { cloneFrom?: string }, deps: InstallDeps): Promise<number> {
  const { home, log } = deps;
  const repo = join(home, "repo");
  // The install's two doors, read before any command of its own, which would replace the command
  // file (2026-11-13-005): another install that still runs stops this one; what an interrupted one
  // left running is ended.
  const held = (deps.installLock ?? (() => installLockOf(home)))();
  const beside = (pid: number): number => {
    log(`another install is running (pid ${pid}): wait for it`);
    return 1;
  };
  if (typeof held === "object") return beside(held.running);
  const left = (deps.installCommand ?? (() => installCommandOf(home)))();
  if (typeof left === "object" && "running" in left) return beside(left.running);
  const commandFile = join(home, INSTALL_COMMAND_FILE);
  if (left === "off-shape") rmSync(commandFile, { force: true });
  else if (typeof left === "object") {
    if (left.left !== null) {
      (deps.killGroup ?? ((group) => process.kill(-group, "SIGKILL")))(left.left);
      log(`the command an interrupted install left running was killed (pid ${left.left})`);
    } else log("the file an interrupted install left was removed");
    rmSync(commandFile, { force: true });
  }
  if (!takeInstallLock(home, held)) {
    const now = installLockOf(home);
    if (typeof now === "object") return beside(now.running);
    log("another install took the lock first: wait for it");
    return 1;
  }
  /** The install's lock freed, only while it is this install's: one another install took since is left. */
  const unlock = () => {
    const path = join(home, INSTALL_LOCK);
    if (readJson<{ pid?: unknown }>(path)?.pid === process.pid) rmSync(path, { force: true });
  };
  const target = `gui/${deps.uid}/${LABEL}`;
  const plist = plistPath(deps);
  /** Whether the bootout booted an agent out: one that was loaded is loaded again when a later step fails. */
  let booted = false;
  /** A step failed: said, the lock freed, and a loaded agent never left unloaded. */
  const failed = (line: string): number => {
    log(line);
    unlock();
    if (booted && existsSync(plist)) {
      const again = deps.sh(["launchctl", "bootstrap", `gui/${deps.uid}`, plist], { cwd: home });
      log(
        again.status === 0
          ? "the agent that was loaded is loaded again: run the install again"
          : `the agent that was loaded could not be loaded again (${again.stderr.trim().split("\n")[0] ?? ""}): no agent is loaded: run the install again`,
      );
    }
    return 1;
  };
  try {
    const tools: Record<string, string> = {};
    for (const tool of TOOLS) {
      const found = deps.which(tool);
      if (!found) return failed(`${tool} is not on PATH: install it first`);
      tools[tool] = found;
    }
    mkdirSync(join(home, "log"), { recursive: true });
    // The agent out first, and the commands of the tick it ended: no tick then works in the clone
    // while the install writes there (a bootout of nothing fails, and that is fine).
    const ended = lockedTick(home);
    booted = deps.sh(["launchctl", "bootout", target], { cwd: home }).status === 0;
    endEndedTickCommand(deps, ended);
    const live = lockedTick(home);
    if (live !== null && (deps.alive ?? (() => false))(live))
      return failed(`a tick is running (pid ${live}): wait for it or stop it`);
    if (!existsSync(join(repo, ".git"))) {
      const error = cloneInto(deps.git, options.cloneFrom ?? deps.originUrl, repo, home);
      if (error !== null) return failed(`the clone failed: ${error}`);
      if (options.cloneFrom) deps.git(["remote", "set-url", "origin", deps.originUrl], repo);
    }
    const script = join(repo, "scripts", "improve-loop.ts");
    // A clone synced to an origin/main that had no loop yet (finding 169): brought to one that has it.
    if (!existsSync(script)) {
      const healed = healClone(repo, deps.git);
      if ("sha" in healed)
        log(`the clone had no scripts/improve-loop.ts: brought to origin/main (${healed.sha})`);
      else log(`the clone has no scripts/improve-loop.ts and ${healed.why}`);
    }
    if (!existsSync(script))
      return failed(
        "the clone has no scripts/improve-loop.ts: push the loop's commit to origin first, or install with --clone-from <checkout>",
      );
    // The bootstrap on every install, so one interrupted during the packages or the shell is completed.
    const error = bootstrapClone(repo, deps.sh);
    if (error) return failed(error);
    // The install's work in the clone is done: the lock goes before the agent is loaded, since
    // the tick that load starts must run for the install to read its probe.
    unlock();
    const path = [
      ...new Set([
        ...TOOLS.map((t) => dirname(tools[t] as string)),
        "/usr/bin",
        "/bin",
        "/usr/sbin",
      ]),
    ];
    // The launcher, the agent's own and nobody else's to read or run (its mode set again on an existing file).
    const launcher = join(home, "tick.sh");
    writeFileSync(launcher, launcherScript({ bun: tools.bun as string, repo }), { mode: 0o700 });
    chmodSync(launcher, 0o700);
    mkdirSync(dirname(plist), { recursive: true });
    writeFileSync(
      plist,
      launchdPlist({
        launcher,
        home,
        path,
        userHome: deps.userHome,
        wizardingcodeHome: deps.env.WIZARDINGCODE_HOME,
      }),
    );
    const loaded = deps.sh(["launchctl", "bootstrap", `gui/${deps.uid}`, plist], { cwd: home });
    // Past this point nothing is put back: the agent that was loaded is this install's own.
    booted = false;
    if (loaded.status !== 0) {
      log(
        `launchctl bootstrap failed: ${loaded.stderr.trim().split("\n")[0] ?? ""}; no agent is loaded: run the install again`,
      );
      return 1;
    }
    rmSync(join(home, "probe.json"), { force: true });
    const running = lockedTick(home);
    deps.sh(["launchctl", "kickstart", "-k", target], { cwd: home });
    endEndedTickCommand(deps, running);
    log(`agent ${LABEL} installed: ${plist}; waiting for its first tick's probe`);
    for (let waited = 0; waited < PROBE_WAIT_S; waited++) {
      if (existsSync(join(home, "probe.json"))) break;
      await deps.wait(1000);
    }
    if (!existsSync(join(home, "probe.json"))) {
      log(
        `the agent wrote no probe in ${PROBE_WAIT_S} s: see launchctl print ${target} and ${join(home, "log")}`,
      );
      return 1;
    }
    printProbe(
      JSON.parse(readFileSync(join(home, "probe.json"), "utf8")) as Probe,
      readConfig(home).marketplace.account,
      log,
    );
    return 0;
  } catch (error) {
    // A step that threw, as a command that could not be started: the same way out as one that failed.
    return failed((error as Error).message);
  } finally {
    unlock();
  }
}

/** The agent booted out and its plist removed; the home and its clone stay. */
export async function uninstall(deps: InstallDeps): Promise<number> {
  const running = lockedTick(deps.home);
  deps.sh(["launchctl", "bootout", `gui/${deps.uid}/${LABEL}`], { cwd: deps.home });
  endEndedTickCommand(deps, running);
  rmSync(plistPath(deps), { force: true });
  deps.log(`agent ${LABEL} removed`);
  return 0;
}

/** The size of launchd's stderr log, 0 when there is none. */
function agentStderrSize(home: string): number {
  const path = join(home, "log", LOG_NAMES[1]);
  return existsSync(path) ? statSync(path).size : 0;
}

/**
 * What the agent wrote to launchd's stderr log after the last tick ended (or with no tick yet):
 * the only place a launch that never reached the loop lands (finding 169). The lines are those
 * beyond the size the last tick recorded as it ended (finding 171): a log rotated or shorter than
 * that size is read from its start, as is one no tick has measured. The line shown is the file's
 * text, not the loop's logger's, so it is redacted of URL userinfo and then made one bounded
 * line (`oneLine`: no control character, cut at 200 characters).
 */
export function agentStderrNote(home: string, state: ImproveState): string | null {
  const path = join(home, "log", LOG_NAMES[1]);
  if (!existsSync(path)) return null;
  const log = readFileSync(path);
  const recorded = state.stderrBytes ?? 0;
  const lines = log
    .subarray(recorded <= log.length ? recorded : 0)
    .toString("utf8")
    .split("\n")
    .filter((l) => l.trim() !== "");
  const last = lines[lines.length - 1];
  if (last === undefined) return null;
  const printable = oneLine(redact(last, []), 200);
  const since = state.lastTick ? "after the last tick" : "with no tick yet";
  return `agent stderr: ${lines.length} line(s) ${since} (log/${LOG_NAMES[1]}); last: ${printable}`;
}

/** Where the loop stands (AC-8): the job, the last tick and run, a pending release, the next due reason, the day's cost, the agent's stderr. */
export function statusText(deps: InstallDeps): string {
  const { home } = deps;
  const repo = join(home, "repo");
  const state = readStateAt(home);
  const config = readConfig(home);
  const printed = deps.sh(["launchctl", "print", `gui/${deps.uid}/${LABEL}`], { cwd: home });
  const job =
    printed.status === 0 ? (/state = [^\n]+/.exec(printed.stdout)?.[0] ?? "loaded") : "not loaded";
  const lines = [
    `job: ${job}`,
    `paused: ${config.paused ? "yes (bun scripts/improve-loop.ts resume)" : "no"}`,
    `last tick: ${state.lastTick ?? "never"}`,
  ];
  if (state.stopped)
    lines.push(`last stop: run ${state.stopped.run ?? "none"} at ${state.stopped.at}`);
  const today = deps.now().toISOString().slice(0, 10);
  const deadToday = state.day?.date === today ? (state.day.deadTicks ?? []) : [];
  const lastDead = deadToday.at(-1);
  if (lastDead) {
    const p = deadTickParts(lastDead);
    lines.push(
      `dead ticks today: ${deadToday.length} (last pid ${p.pid} at ${p.start ?? "an unknown time"})`,
    );
  }
  lines.push(
    state.lastRun ? `last run: ${state.lastRun.run} at ${state.lastRun.at}` : "last run: none",
  );
  lines.push(
    state.pendingRelease
      ? `pending release: ${state.pendingRelease.version} at step ${state.pendingRelease.failedStep} (${state.pendingRelease.failedName ?? RELEASE_STEP_NAMES[state.pendingRelease.failedStep - 1]})`
      : "pending release: none",
  );
  const stderrNote = agentStderrNote(home, state);
  if (stderrNote) lines.push(stderrNote);
  if (existsSync(join(repo, ".git"))) {
    const cases = allCases(repo);
    const head = deps
      .git(["log", "-1", "--format=%H", "HEAD", "--", ...HARNESS_ROOTS], repo)
      .stdout.trim();
    const due = dueRun(
      state,
      {
        pluginHead: head,
        plan: state.lastRun?.plan ?? null,
        lessons: state.lastRun?.lessons ?? 0,
        lastMeasured: lastMeasuredOf(readRecords(repo), cases),
        lockAlive: (() => {
          const held = readLock(home);
          return !!held && (deps.alive ? deps.alive(held.pid) : true);
        })(),
      },
      config,
      deps.now(),
    );
    lines.push(`next: ${due.due ? `due (${due.reason})` : `not due (${due.reason})`}`);
    const date = deps.now().toISOString().slice(0, 10);
    const runs = dayRunsOf(readRecords(repo), date);
    lines.push(
      `today: ${dayTotalOf(runs)} over ${runs.length} run(s), ${state.day?.releases.length ?? 0} release(s), ${state.day?.failures.length ?? 0} failed step(s)`,
    );
  } else {
    lines.push("next: no clone yet (bun scripts/improve-loop.ts install)");
    lines.push("today: n/a");
  }
  return lines.join("\n");
}

/** The real deps of a tick on this machine: git and the commands through spawnSync, the improvement through `runImprove`, the judge and the kit through `claude`. */
export function realTickDeps(
  home: string,
  config: LoopConfig,
  run: CommandRunner = spawnRunner(false),
): TickDeps {
  const machine = machineDeps(home, run);
  const { sh, git } = loopCommands(run, process.env, join(home, TICK_COMMAND_FILE));
  const userDir = userDirOf(process.env);
  return {
    home,
    originUrl: ORIGIN_URL,
    env: process.env,
    now: () => new Date(),
    pid: process.pid,
    boot: machine.boot,
    alive: machine.alive,
    git,
    sh,
    userHome: homedir(),
    installRunning: () => {
      const lock = installLockOf(home);
      return typeof lock === "object" ? lock.running : null;
    },
    improve: async (options, repo) => {
      const deps = realDeps(repo);
      deps.stopRequested = () => existsSync(stopMarkerOf(home));
      try {
        return await runImprove(options, deps);
      } finally {
        deps.dispose();
      }
    },
    onSignal: (signal, handler) => {
      process.on(signal, handler);
      return () => {
        process.off(signal, handler);
      };
    },
    relaunch: (args) => {
      const command = relaunchCommand(args);
      return (
        spawnSync(command.cmd, command.args, { stdio: "inherit", env: process.env }).status ?? 1
      );
    },
    judge: (call) => {
      const r = spawnSync("claude", call.args, {
        cwd: call.cwd,
        env: kitEnvironment({ ...process.env, ...call.env }),
        encoding: "utf8",
      });
      return { status: r.status, output: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
    probeJudge: (call) =>
      probeJudge(call.model, kitEnvironment({ ...process.env, ...call.env }), call.cwd),
    release: async (options) => {
      let outcome: ReleaseOutcome = {
        version: options.resume ?? "",
        code: 1,
        failedStep: null,
        pending: false,
      };
      await release(
        { ...options, home: homedir() },
        {
          run,
          log: (line) => console.log(line),
          report: (o) => {
            outcome = o;
          },
        },
      );
      return outcome;
    },
    readSecret: (account) => {
      const r = sh(secretReadCommand(account), { cwd: home, quiet: true });
      return r.status === 0 ? r.stdout.trim() : null;
    },
    plan: (repo) => {
      const text = ctoPlanFor(repo, userDir);
      return text === null ? null : createHash("sha256").update(text).digest("hex").slice(0, 16);
    },
    lessons: (repo) => realDeps(repo).lessons().length,
    userCheckout: config.userCheckout ?? null,
    tmpdir: tmpdir(),
    log: (line) => console.log(line),
  };
}

export const ORIGIN_URL = "git@github.com:WizardingCode-io/wizardingcode-developer-crew.git";

/** The real deps of the install, the uninstall and the status: every command bounded; the install's carry its command file (2026-11-13-005). */
export function realInstallDeps(
  home: string,
  run: CommandRunner = spawnRunner(false),
  commandFile?: string,
): InstallDeps {
  const { sh, git } = loopCommands(run, process.env, commandFile);
  const machine = machineDeps(home, run);
  return {
    home,
    originUrl: ORIGIN_URL,
    userHome: homedir(),
    uid: process.getuid?.() ?? 501,
    env: process.env,
    which: (tool) => {
      const r = sh(["which", tool], { cwd: home });
      return r.status === 0 ? r.stdout.trim() : null;
    },
    git,
    sh,
    alive: machine.alive,
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
    log: (line) => console.log(line),
  };
}

/** The real deps of `stop`: its commands bounded, with no command file, which would replace a running tick's. */
export function realStopDeps(home: string, run: CommandRunner = spawnRunner(false)): StopDeps {
  const machine = machineDeps(home, run);
  return {
    home,
    sh: loopCommands(run, process.env).sh,
    boot: machine.boot,
    alive: machine.alive,
    kill: (pid, signal) => process.kill(pid, signal),
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => new Date(),
  };
}

const USAGE = `usage: bun scripts/improve-loop.ts tick [--dry-run] | install [--clone-from <checkout>] | uninstall | status | pause | resume | stop | secret set <account>`;

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  const home = improveHome(process.env);
  const config = readConfig(home);
  let code = 0;
  if (command === "tick")
    code = await tick(
      { dryRun: rest.includes("--dry-run"), relaunched: rest.includes("--relaunched") },
      realTickDeps(home, config),
    );
  else if (command === "pause") console.log(pauseLoop(home));
  else if (command === "resume") console.log(resumeLoop(home));
  else if (command === "stop") {
    console.log(await stopLoop(realStopDeps(home)));
  } else if (command === "install") {
    const at = rest.indexOf("--clone-from");
    const cloneFrom = at >= 0 ? rest[at + 1] : undefined;
    // The checkout the install clones from is the user's, fast-forwarded after each run (D-1), when the configuration names none.
    if (cloneFrom && !config.userCheckout) {
      mkdirSync(home, { recursive: true });
      writeFileSync(
        join(home, "config.json"),
        `${JSON.stringify({ ...readConfigFile(home), userCheckout: cloneFrom }, null, 2)}\n`,
        { mode: 0o600 },
      );
    }
    code = await install(
      { cloneFrom },
      realInstallDeps(home, undefined, join(home, INSTALL_COMMAND_FILE)),
    );
  } else if (command === "uninstall") code = await uninstall(realInstallDeps(home));
  else if (command === "status") console.log(statusText(realInstallDeps(home)));
  else if (command === "secret" && rest[0] === "set" && rest[1]) {
    const token = process.stdin.isTTY
      ? (prompt(`token for ${rest[1]}:`) ?? "")
      : readFileSync(0, "utf8").trim();
    if (!token) {
      console.error("no token given");
      code = 1;
    } else {
      const { cmd, input } = secretSetCommand(rest[1], token);
      const r = spawnSync(cmd[0] as string, cmd.slice(1), { input, encoding: "utf8" });
      code = r.status ?? 1;
      console.log(
        code === 0
          ? `${rest[1]} stored under ${SERVICE}`
          : `security failed: ${(r.stderr ?? "").trim()}`,
      );
    }
  } else {
    console.error(USAGE);
    code = 1;
  }
  process.exit(code);
}
