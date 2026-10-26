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
import { dirname, join } from "node:path";
import { readJson, writeTextNew } from "../packages/engine/src/fs.ts";
import { userDirOf } from "../packages/engine/src/paths.ts";
import { scanText } from "../packages/engine/src/secrets.ts";
import { DEFAULT_AGENT_MODEL, JUDGE_MODEL, kitEnvironment } from "./eval.ts";
import {
  allCases,
  type CaseFigures,
  ctoPlanFor,
  type ImproveOptions,
  type Kept,
  realDeps,
  runImprove,
  verdictOf,
} from "./improve.ts";
import { type DayState, type ImproveState, improveHome, readStateAt } from "./improve-home.ts";
import {
  notificationCommand,
  RELEASE_STEP_NAMES,
  type ReleaseOptions,
  type ReleaseOutcome,
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
  /** A ceiling for one run's kit spend (`--max-cost-usd`); none by default (the user's decision: no cap, managed). */
  maxRunUsd?: number;
}

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

/** `docs/improve/daily/<date>.md`: the day's runs, the totals by provider, the releases and the failed steps (AC-10). */
export function dailyReport(
  date: string,
  runs: readonly DayRun[],
  releases: readonly { version: string; run: string }[],
  failures: readonly { run: string; step: number; name: string }[],
): string {
  const totals = new Map<string, number | null>();
  for (const run of runs) {
    const before = totals.get(run.provider.name);
    totals.set(
      run.provider.name,
      run.costUsd === null || before === null ? null : (before ?? 0) + run.costUsd,
    );
  }
  const lines = [
    `# Improvement runs of ${date}`,
    "",
    "| Run | Targets | Verdict | Provider | Cost |",
    "| :- | :- | :- | :- | :- |",
    ...runs.map(
      (r) =>
        `| ${r.run} | ${r.targets.join(", ")} | ${r.verdict} | ${r.provider.name}${r.provider.claudeModels ? "" : " (not Claude models)"} | ${r.costUsd === null ? "n/a" : usd(r.costUsd)} |`,
    ),
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
      ? failures.map((f) => `- run ${f.run}: step ${f.step} (${f.name}) failed`)
      : ["- none"]),
    "",
  ];
  return lines.join("\n");
}

/** The notification's title and body after a tick (AC-10): the version released, or `crew improve` and why nothing was. */
export function tickNotification(summary: {
  released: string | null;
  improved: readonly string[];
  reason: string | null;
  dayTotal: string;
}): [title: string, body: string] {
  const title = summary.released ? `crew ${summary.released}` : "crew improve";
  const what = summary.released
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
 * are a win by the run's own rule (`verdictOf`: every target rose above its spread, no probed case
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

/** The headless judge's arguments (AC-6): the prompt, the judge's own text with the rule appended, read-only tools, JSON, no session, no settings, a turn cap. */
export function judgeArgs(prompt: string, systemPrompt: string): string[] {
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
  judge: (call: { cwd: string; args: string[]; env: Record<string, string> }) => {
    status: number | null;
    output: string;
  };
  release: (call: {
    reason: string;
    notes: string[];
  }) => Promise<{ code: number; version: string | null }>;
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
 * diff, then the merge into main and the patch release, when every answer holds and the run was
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
): Promise<{ released: string | null; reason: string | null }> {
  const { repo, folder, record, provider } = input;
  const branch = record.branch ?? `improve/${record.run}`;
  const write = (rel: string, text: string) =>
    writeRedacted(join(folder, "adoption", rel), text, provider.secrets);
  // No rename detection: a file moved into the harness roots lists its old path too.
  const names = deps.git(["diff", "--name-only", "--no-renames", `main...${branch}`], repo);
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
  write("diff.patch", deps.git(["diff", `main...${branch}`], repo).stdout);
  const answer = deps.judge({
    cwd: repo,
    args: judgeArgs(adoptionPrompt(record.run), adoptionSystemPrompt(input.judgeSystemPrompt)),
    env: provider.env,
  });
  const ruling =
    answer.status === 0
      ? parseRuling(answer.output)
      : { holds: false, text: `the judge exited ${answer.status}: ${answer.output.slice(0, 200)}` };
  // The ruling is published with the record: bounded, and withheld when it carries a secret's shape.
  const leaked = scanText(ruling.text, "ruling")[0];
  if (leaked) ruling.text = `withheld: the judge's answer held a secret (${leaked.rule})`;
  else ruling.text = ruling.text.slice(0, RULING_LIMIT);
  write(
    "ruling.md",
    `# Ruling of ${record.run} (${ADOPTION_RULE})\n\n${ruling.holds ? "holds" : "does not hold"}\n\n${ruling.text}\n`,
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
      branch,
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
        return `- ${t}: ${two(before.mean)} → ${two(after.mean)} (spread ${two(before.spread)})`;
      }),
      `- kept: ${what}`,
    ],
  });
  if (released.code !== 0 || !released.version) {
    deps.log(`adoption of ${record.run}: the release did not finish`);
    return {
      released: null,
      reason: "the release did not finish: see the log and crew improve status",
    };
  }
  deps.git(["push", "-q", "origin", "--delete", branch], repo);
  return { released: released.version, reason: null };
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
      out.push(JSON.parse(readFileSync(path, "utf8")) as LoopRecord);
    } catch {
      // A record that is not JSON is no measurement.
    }
  }
  return out;
}

/** Each case's last measurement across the records (AC-4): a baseline or a probe, by the run's time. */
export function lastMeasuredOf(
  records: readonly LoopRecord[],
  cases: readonly string[],
): Record<string, string | null> {
  const out: Record<string, string | null> = Object.fromEntries(cases.map((c) => [c, null]));
  for (const record of records) {
    const names = new Set([
      ...Object.keys(record.baseline ?? {}),
      ...(record.proposals ?? []).flatMap((p) => Object.keys(p.probe ?? {})),
    ]);
    for (const name of names)
      if (name in out && (out[name] === null || (out[name] as string) < record.at))
        out[name] = record.at;
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

function verdictText(record: LoopRecord): string {
  if (record.exit !== 0) return `errored (exit ${record.exit})`;
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
  const priced = runs.filter((r) => r.costUsd !== null);
  return priced.length ? usd(priced.reduce((sum, r) => sum + (r.costUsd as number), 0)) : "n/a";
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
  git: (args: string[], cwd: string) => { status: number; stdout: string; stderr: string };
  sh: (
    cmd: string[],
    opts: { cwd: string; env?: Record<string, string>; input?: string },
  ) => { status: number; stdout: string; stderr: string };
  /** The improvement itself (`runImprove` with the real deps of the clone). */
  improve: (options: ImproveOptions, repo: string) => Promise<number>;
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
}

const LOOP_TEMP = /^improve-(?:trees|hooks)-/;
/** A loop temp folder younger than this may be a run in progress by hand; older ones are leftovers. */
const TEMP_AGE_MS = DAY_MS;
const DATED_LOG_DAYS = 14;
/** An improvement run's result folder in the clone, as `runFolder` names it; bounded like the dated logs (finding 175). */
const IMPROVE_RESULT = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-improve-/;
/** How long the clone keeps an improvement run's result folder: as long as a dated log. */
const RESULT_FOLDER_DAYS = DATED_LOG_DAYS;

/** The wait after `failures` failed ticks in a row, in hours: 1, 2, 4 … capped at a day, so a run that cannot be saved is not paid for every hour. */
export function backoffHours(failures: number): number {
  return Math.min(2 ** Math.max(0, failures - 1), 24);
}

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
  git(["fetch", "-q", "origin"], user);
  const ff = git(["merge", "-q", "--ff-only", "origin/main"], user);
  return ff.status === 0 ? "" : "the user's checkout could not be fast-forwarded: left as it is";
}

/** The tick's lock: its own file, created exclusively, so two ticks started together (launchd's load and the install's kickstart) cannot both hold it. */
export interface TickLock {
  pid: number;
  startedAt: string;
  boot: string;
}

export function readLock(home: string): TickLock | null {
  return readJson<TickLock>(join(home, "lock.json"));
}

/** The repository's clone bootstrapped (`bun install --frozen-lockfile`): the error's first line, or null. */
export function bootstrapClone(repo: string, sh: TickDeps["sh"]): string | null {
  const r = sh(["bun", "install", "--frozen-lockfile"], { cwd: repo });
  return r.status === 0 ? null : `bun install failed: ${r.stderr.trim().split("\n")[0] ?? ""}`;
}

/** The dated logs older than two weeks, removed. */
function pruneDatedLogs(home: string, now: Date): void {
  const oldest = new Date(now.getTime() - DATED_LOG_DAYS * DAY_MS).toISOString().slice(0, 10);
  for (const name of readdirSync(join(home, "log")))
    if (/^\d{4}-\d{2}-\d{2}\.log$/.test(name) && name.slice(0, 10) < oldest)
      rmSync(join(home, "log", name), { force: true });
}

/**
 * One tick of the loop (AC-5, AC-16): the lock, the logs, the back-off, the clone, the probe, the
 * pause, the clone brought to origin/main, a pending release resumed, the decision, the run (on
 * record before anything can fail), the record and the report committed and pushed, the adoption
 * with its merge undone when the release fails before its push, the user's checkout, the state
 * and the notification.
 */
export async function tick(options: { dryRun?: boolean }, deps: TickDeps): Promise<number> {
  const { home } = deps;
  const repo = join(home, "repo");
  const now = deps.now();
  const date = now.toISOString().slice(0, 10);
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
  if (!takeLock()) {
    const held = readLock(home);
    if (held && held.boot === deps.boot() && deps.alive(held.pid)) {
      log(`another tick holds the lock (pid ${held.pid}); leaving`);
      return 0;
    }
    log(`a stale lock (pid ${held?.pid ?? "unknown"}) is taken over`);
    rmSync(lockPath, { force: true });
    if (!takeLock()) {
      log("another tick took the lock first; leaving");
      return 0;
    }
  }
  const notify = (title: string, body: string) =>
    deps.sh(notificationCommand(title, redact(body, secrets)), { cwd: home });
  const git = (args: string[], cwd = repo) => deps.git(args, cwd);
  const must = (args: string[], cwd = repo): string => {
    const r = git(args, cwd);
    if (r.status !== 0)
      throw new Error(`git ${args[0]} failed: ${r.stderr.trim().split("\n")[0] ?? ""}`);
    return r.stdout;
  };
  const bootstrap = () => {
    const error = bootstrapClone(repo, deps.sh);
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

  try {
    rotateLogs(home);
    pruneDatedLogs(home, now);
    // The clone, made and bootstrapped when absent.
    if (!existsSync(join(repo, ".git"))) {
      must(["clone", "-q", deps.originUrl, repo], home);
      bootstrap();
    }
    // The provider, and with it the secrets every line and file is redacted of.
    const provider = providerEnv(config, deps.readSecret);
    secrets = provider.secrets;
    // The first tick writes the probe the install waits for (D-8).
    if (!existsSync(join(home, "probe.json"))) {
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
    // then the fetch and the reset; stale worktrees and old temp folders pruned; a changed lockfile bootstraps.
    const lockfile = () =>
      existsSync(join(repo, "bun.lock")) ? readFileSync(join(repo, "bun.lock"), "utf8") : "";
    const before = lockfile();
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
    must(["reset", "-q", "--hard", "origin/main"]);
    // Where main stood when the run started: the base its figures were measured against (finding 172).
    const syncedMain = must(["rev-parse", "HEAD"]).trim();
    git(["worktree", "prune"]);
    for (const name of existsSync(deps.tmpdir) ? readdirSync(deps.tmpdir) : [])
      if (
        LOOP_TEMP.test(name) &&
        now.getTime() - statSync(join(deps.tmpdir, name)).mtimeMs > TEMP_AGE_MS
      )
        rmSync(join(deps.tmpdir, name), { recursive: true, force: true });
    const results = join(repo, "plugins", "core", "evals", "results");
    for (const name of existsSync(results) ? readdirSync(results) : []) {
      if (!IMPROVE_RESULT.test(name)) continue;
      const entry = join(results, name);
      const stat = lstatSync(entry);
      if (stat.isDirectory() && now.getTime() - stat.mtimeMs > RESULT_FOLDER_DAYS * DAY_MS)
        rmSync(entry, { recursive: true, force: true });
    }
    if (lockfile() !== before) bootstrap();
    // A release left pending after its push is resumed first; one with nothing to resume is cleared.
    if (state.pendingRelease) {
      const { version, failedStep } = state.pendingRelease;
      log(`resuming release ${version} from step ${failedStep}`);
      const resumed = await deps.release({
        root: repo,
        resume: version,
        fromStep: failedStep,
        reason: `resumed release ${version}`,
        marketplaceAccount: config.marketplace.account,
      });
      if (resumed.code === 0) {
        state.pendingRelease = null;
        day.releases.push({ version, run: "resumed" });
      } else if (resumed.failedStep !== null)
        state.pendingRelease = { version, failedStep: resumed.failedStep };
      else {
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
        `dry run: due (${due.reason}); targets: ${targets.join(", ")}; provider: ${provider.name}; nothing run`,
      );
      return 0;
    }
    log(`due: ${due.reason}; targets: ${targets.join(", ")}; provider: ${provider.name}`);
    // The run; then the last run on record before anything can fail, its files through the
    // redaction, and the record and the day's report committed and pushed with the kept branch (D-3).
    const code = await deps.improve(
      {
        cases: targets,
        proposals: config.proposals,
        judgeModel: provider.judgeModel,
        provider,
        maxCostUsd: config.maxRunUsd,
      },
      repo,
    );
    const latest = readRecords(repo).sort((a, b) => (a.at < b.at ? 1 : -1))[0] ?? null;
    if (!latest) throw new Error(`the improvement exited ${code} and left no record`);
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
    const report = () =>
      writeRedacted(
        join(repo, "docs", "improve", "daily", `${date}.md`),
        dailyReport(date, dayRunsOf(readRecords(repo), date), day.releases, day.failures),
        secrets,
      );
    report();
    commitDocs(`Improvement run ${latest.run}: ${verdictText(latest)}`);
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
          judge: deps.judge,
          log,
          release: async ({ reason: why, notes }) => {
            // The adoption's files are committed before the release, whose precondition is a clean tree.
            commitDocs(`Improvement run ${latest.run}: the adoption's ruling`);
            const rulingCommit = must(["rev-parse", "HEAD"]).trim();
            const outcome = await deps.release({
              root: repo,
              bump: "patch",
              reason: why,
              notes,
              marketplaceAccount: config.marketplace.account,
              pending: state.pendingRelease ?? null,
              rollbackTo: mainBefore,
            });
            const failure =
              outcome.failedStep === null
                ? null
                : {
                    run: latest.run,
                    step: outcome.failedStep,
                    name: RELEASE_STEP_NAMES[outcome.failedStep - 1] as string,
                  };
            if (outcome.code === 0) {
              state.pendingRelease = null;
              day.releases.push({ version: outcome.version, run: latest.run });
            } else if (outcome.pending && failure) {
              state.pendingRelease = { version: outcome.version, failedStep: failure.step };
              day.failures.push(failure);
            } else {
              // Before the push: the merge goes, the adoption's files stay on the main that was.
              must(["reset", "-q", "--hard", mainBefore]);
              git(["checkout", rulingCommit, "--", `docs/improve/${latest.run}`]);
              commitDocs(`Improvement run ${latest.run}: the adoption's ruling`);
              if (failure) day.failures.push(failure);
            }
            saveState();
            return { code: outcome.code, version: outcome.code === 0 ? outcome.version : null };
          },
        },
      ).catch((error: unknown) => {
        // Whatever stopped the adoption, the merge never stays on main.
        git(["reset", "-q", "--hard", mainBefore]);
        throw error;
      });
      released = adopted.released;
      reason = adopted.reason;
      // The adoption's files and the day's report, with what the release did.
      report();
      if (commitDocs(`Improvement run ${latest.run}: the day's report`)) pushMain([]);
    }
    const checkoutNote = deps.userCheckout
      ? fastForwardUserCheckout(deps.userCheckout, deps.git)
      : "";
    if (checkoutNote) log(checkoutNote);
    const [title, body] = tickNotification({
      released,
      improved: gainTexts(latest),
      reason: reason ?? null,
      dayTotal: dayTotalOf(dayRunsOf(readRecords(repo), date)),
    });
    notify(title, checkoutNote ? `${body} ${checkoutNote}.` : body);
    return 0;
  } catch (error) {
    const message = (error as Error).message;
    state.failures = (state.failures ?? 0) + 1;
    const hours = backoffHours(state.failures);
    state.backoffUntil = new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
    log(`the tick failed: ${message}; the next tick waits ${hours} h`);
    notify("crew improve", `the tick failed: ${message}. The next tick waits ${hours} h.`);
    return 1;
  } finally {
    rmSync(lockPath, { force: true });
    // The stderr log's size as this tick ends: `status` reports what the agent writes after it (finding 171).
    state.stderrBytes = agentStderrSize(home);
    saveState();
  }
}

export const LABEL = "io.wizardingcode.crew-improve";

/** `text` as one `sh` word: single-quoted, an embedded `'` written as `'\''`. */
function shQuote(text: string): string {
  return `'${text.replace(/'/g, "'\\''")}'`;
}

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
    `repo=${shQuote(input.repo)}`,
    `bun=${shQuote(input.bun)}`,
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
  const gh = sh(["gh", "auth", "status"], { cwd: repo });
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
  };
}

/** The fallback's three steps when the agent cannot read the login (D-8). */
const FALLBACK = [
  "the agent is not logged in: the fallback (D-8) is a token from claude setup-token in the keychain:",
  "  1. claude setup-token",
  "  2. bun scripts/improve-loop.ts secret set oauth-token",
  '  3. "oauthToken": { "keychain": "oauth-token" } in config.json',
];

function printProbe(probe: Probe, log: (line: string) => void): void {
  log(`login: ${probe.authMethod} (${probe.loggedIn ? "logged in" : "not logged in"})`);
  log(`github: ${probe.github ?? "not logged in"}`);
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
export async function install(options: { cloneFrom?: string }, deps: InstallDeps): Promise<number> {
  const { home, log } = deps;
  const repo = join(home, "repo");
  const tools: Record<string, string> = {};
  for (const tool of TOOLS) {
    const found = deps.which(tool);
    if (!found) {
      log(`${tool} is not on PATH: install it first`);
      return 1;
    }
    tools[tool] = found;
  }
  mkdirSync(join(home, "log"), { recursive: true });
  if (!existsSync(join(repo, ".git"))) {
    const cloned = deps.git(["clone", "-q", options.cloneFrom ?? deps.originUrl, repo], home);
    if (cloned.status !== 0) {
      log(`the clone failed: ${cloned.stderr.trim().split("\n")[0] ?? ""}`);
      return 1;
    }
    if (options.cloneFrom) deps.git(["remote", "set-url", "origin", deps.originUrl], repo);
    const error = bootstrapClone(repo, deps.sh);
    if (error) {
      log(error);
      return 1;
    }
  }
  const script = join(repo, "scripts", "improve-loop.ts");
  // A clone synced to an origin/main that had no loop yet (finding 169): brought to one that has it.
  if (!existsSync(script)) {
    const healed = healClone(repo, deps.git);
    if ("sha" in healed) {
      const error = bootstrapClone(repo, deps.sh);
      if (error) {
        log(error);
        return 1;
      }
      log(`the clone had no scripts/improve-loop.ts: brought to origin/main (${healed.sha})`);
    } else log(`the clone has no scripts/improve-loop.ts and ${healed.why}`);
  }
  if (!existsSync(script)) {
    log(
      "the clone has no scripts/improve-loop.ts: push the loop's commit to origin first, or install with --clone-from <checkout>",
    );
    return 1;
  }
  const path = [
    ...new Set([...TOOLS.map((t) => dirname(tools[t] as string)), "/usr/bin", "/bin", "/usr/sbin"]),
  ];
  // The launcher, the agent's own and nobody else's to read or run (its mode set again on an existing file).
  const launcher = join(home, "tick.sh");
  writeFileSync(launcher, launcherScript({ bun: tools.bun as string, repo }), { mode: 0o700 });
  chmodSync(launcher, 0o700);
  const plist = plistPath(deps);
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
  const target = `gui/${deps.uid}/${LABEL}`;
  // An earlier copy booted out (a bootout of nothing fails, and that is fine), then this one in.
  deps.sh(["launchctl", "bootout", target], { cwd: home });
  const booted = deps.sh(["launchctl", "bootstrap", `gui/${deps.uid}`, plist], { cwd: home });
  if (booted.status !== 0) {
    log(`launchctl bootstrap failed: ${booted.stderr.trim().split("\n")[0] ?? ""}`);
    return 1;
  }
  rmSync(join(home, "probe.json"), { force: true });
  deps.sh(["launchctl", "kickstart", "-k", target], { cwd: home });
  log(`agent ${LABEL} installed: ${plist}; waiting for its first tick's probe`);
  for (let waited = 0; waited < 90; waited++) {
    if (existsSync(join(home, "probe.json"))) break;
    await deps.wait(1000);
  }
  if (!existsSync(join(home, "probe.json"))) {
    log(`the agent wrote no probe in 90 s: see launchctl print ${target} and ${join(home, "log")}`);
    return 1;
  }
  printProbe(JSON.parse(readFileSync(join(home, "probe.json"), "utf8")) as Probe, log);
  return 0;
}

/** The agent booted out and its plist removed; the home and its clone stay. */
export async function uninstall(deps: InstallDeps): Promise<number> {
  deps.sh(["launchctl", "bootout", `gui/${deps.uid}/${LABEL}`], { cwd: deps.home });
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
 * text, not the loop's logger's, so it is redacted of URL userinfo, stripped of control
 * characters and cut at 200 characters, in that order.
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
  const printable = Array.from(redact(last, []))
    .filter((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) !== 0x7f)
    .join("")
    .slice(0, 200);
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
  const lines = [`job: ${job}`, `last tick: ${state.lastTick ?? "never"}`];
  lines.push(
    state.lastRun ? `last run: ${state.lastRun.run} at ${state.lastRun.at}` : "last run: none",
  );
  lines.push(
    state.pendingRelease
      ? `pending release: ${state.pendingRelease.version} at step ${state.pendingRelease.failedStep} (${RELEASE_STEP_NAMES[state.pendingRelease.failedStep - 1]})`
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
function realTickDeps(home: string, config: LoopConfig): TickDeps {
  const run = spawnRunner(false);
  const git: TickDeps["git"] = (args, cwd) => run(["git", ...args], { cwd });
  const userDir = userDirOf(process.env);
  return {
    home,
    originUrl: ORIGIN_URL,
    env: process.env,
    now: () => new Date(),
    pid: process.pid,
    boot: () => run(["/usr/sbin/sysctl", "-n", "kern.boottime"], { cwd: home }).stdout.trim(),
    alive: (pid) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
    git,
    sh: run,
    improve: async (options, repo) => {
      const deps = realDeps(repo);
      try {
        return await runImprove(options, deps);
      } finally {
        deps.dispose();
      }
    },
    judge: (call) => {
      const r = spawnSync("claude", call.args, {
        cwd: call.cwd,
        env: kitEnvironment({ ...process.env, ...call.env }),
        encoding: "utf8",
      });
      return { status: r.status, output: r.stdout ?? "" };
    },
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
      const r = run(secretReadCommand(account), { cwd: home });
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

const USAGE = `usage: bun scripts/improve-loop.ts tick [--dry-run] | install [--clone-from <checkout>] | uninstall | status | secret set <account>`;

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  const home = improveHome(process.env);
  const config = readConfig(home);
  const userHome = homedir();
  const installDeps = (): InstallDeps => {
    const deps = realTickDeps(home, config);
    return {
      home,
      originUrl: ORIGIN_URL,
      userHome,
      uid: process.getuid?.() ?? 501,
      env: process.env,
      which: (tool) => {
        const r = deps.sh(["which", tool], { cwd: home });
        return r.status === 0 ? r.stdout.trim() : null;
      },
      git: deps.git,
      sh: deps.sh,
      wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => new Date(),
      log: (line) => console.log(line),
    };
  };
  let code = 0;
  if (command === "tick")
    code = await tick({ dryRun: rest.includes("--dry-run") }, realTickDeps(home, config));
  else if (command === "install") {
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
    code = await install({ cloneFrom }, installDeps());
  } else if (command === "uninstall") code = await uninstall(installDeps());
  else if (command === "status") console.log(statusText(installDeps()));
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
