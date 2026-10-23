import { accessSync, constants, mkdirSync, rmSync } from "node:fs";
import { basename, delimiter, join } from "node:path";
import { type AuditToolName, parseAudit } from "./audit.ts";
import { auditState } from "./audit-state.ts";
import { excludedRiskPaths, riskAreasForPaths } from "./classify.ts";
import { proposedByPack } from "./detect/index.ts";
import { runE2e } from "./e2e.ts";
import { computeVerdict, loadEvidence, type PlannedGate, updateEvidence } from "./evidence.ts";
import {
  changedPaths,
  changedWatchedPaths,
  computeFingerprint,
  fingerprintMethod,
  gitHead,
  gitShowFile,
  MAX_WATCHED_FILES,
} from "./fingerprint.ts";
import { exists, nowIso, readTextQuietly, writeText } from "./fs.ts";
import { plannedJudgementGates, plannedTaskJudgement, writeReviewInputs } from "./judgement.ts";
import { loadLedger } from "./objections.ts";
import { packTemplates, recordPackUse } from "./packs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { isInterfacePath } from "./paths-kind.ts";
import { namedFiles } from "./problems.ts";
import { runCommand } from "./run.ts";
import { scanSecrets } from "./secrets.ts";
import { plannedSeats, primaryTeam, teamsFor } from "./team.ts";
import type {
  Evidence,
  GateName,
  GateRun,
  JudgementGateName,
  ObjectionLedger,
  PlannedJudgement,
  Policy,
  Profile,
  Route,
  Target,
  WorkItem,
} from "./types.ts";
import { GATE_NAMES } from "./types.ts";
import { isSkipped, raiseRoute } from "./work.ts";

const MANIFESTS = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "composer.json",
  "composer.lock",
  "pyproject.toml",
  "uv.lock",
  "poetry.lock",
  "requirements.txt",
]);

export function manifestChanged(changed: string[]): boolean {
  return changed.some(
    (p) => MANIFESTS.has(basename(p)) || /^requirements.*\.txt$/.test(basename(p)),
  );
}

/** Looks the program up on PATH without starting a process, so planning stays fast enough for a hook. */
function onPath(binary: string, env: NodeJS.ProcessEnv): boolean {
  const extensions =
    process.platform === "win32" ? ["", ...(env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";")] : [""];
  for (const dir of (env.PATH ?? "").split(delimiter)) {
    if (!dir) continue;
    for (const extension of extensions) {
      try {
        accessSync(join(dir, binary + extension), constants.X_OK);
        return true;
      } catch {
        // Not here; keep looking.
      }
    }
  }
  return false;
}

interface AuditTool {
  binary: string;
  /** In the tool's JSON, so the advisories can be read and compared with the base commit (ADR 0006). */
  command: string;
  lockfiles: string[];
  tool: AuditToolName;
  /** The manifest the baseline needs beside the lockfile. */
  manifest: string;
}

const NODE_AUDIT: Record<string, AuditTool> = {
  npm: {
    binary: "npm",
    command: "npm audit --audit-level=high --json",
    lockfiles: ["package-lock.json", "npm-shrinkwrap.json"],
    tool: "npm",
    manifest: "package.json",
  },
  pnpm: {
    binary: "pnpm",
    command: "pnpm audit --audit-level=high --json",
    lockfiles: ["pnpm-lock.yaml"],
    tool: "pnpm",
    manifest: "package.json",
  },
  yarn: {
    binary: "yarn",
    command: "yarn audit --level high --json",
    lockfiles: ["yarn.lock"],
    tool: "yarn",
    manifest: "package.json",
  },
  bun: {
    binary: "bun",
    command: "bun audit --json",
    lockfiles: ["bun.lock", "bun.lockb"],
    tool: "bun",
    manifest: "package.json",
  },
};

// The same runner prefix the Python detector uses for the other gates.
const PYTHON_AUDIT: Record<string, string> = {
  uv: "uv run pip-audit",
  poetry: "poetry run pip-audit",
  pip: "python -m pip_audit",
};

/** A team's test flow may take this long before it is a problem (the user's figure, 2026-10-14). */
export const TEST_TIMEOUT_MS = 20 * 60 * 1000;

/** The gate's own limit when the profile gives one; else the target's, with the twenty-minute floor for the test gate. */
export function gateTimeoutMs(target: Target, gate: GateName): number {
  const own = target.gates[gate]?.timeoutMs;
  if (own !== undefined) return own;
  return gate === "test" ? Math.max(target.timeoutMs, TEST_TIMEOUT_MS) : target.timeoutMs;
}

/** An audit that can run: its command, its tool, and the manifest and lockfile a baseline at the base commit needs (none for pip-audit, which audits an environment). */
export interface ResolvedAudit {
  command: string;
  tool: AuditToolName;
  files: string[];
}
export type AuditCommand = ResolvedAudit | { reason: string };

/** The audit for a target, or why it cannot run: an audit without a lockfile or a tool proves nothing. */
export function depsAuditCommand(
  target: Target,
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): AuditCommand {
  const dir = join(root, target.path);
  if (target.stack === "python") {
    if (!onPath("pip-audit", env)) return { reason: "pip-audit not on PATH" };
    // Own keys only: a package manager named like an inherited key (toString) is no runner.
    const own = Object.hasOwn(PYTHON_AUDIT, target.packageManager)
      ? PYTHON_AUDIT[target.packageManager]
      : undefined;
    const prefix = own ?? PYTHON_AUDIT.pip ?? "pip-audit";
    return { command: `${prefix} --format=json`, tool: "pip-audit", files: [] };
  }
  let tool: AuditTool | undefined;
  if (target.stack === "node") {
    tool = Object.hasOwn(NODE_AUDIT, target.packageManager)
      ? NODE_AUDIT[target.packageManager]
      : undefined;
    // Yarn Berry dropped `yarn audit`; its audit lives under `yarn npm`.
    if (tool && target.packageManager === "yarn" && exists(join(dir, ".yarnrc.yml")))
      tool = { ...tool, command: "yarn npm audit --severity high --json" };
  } else if (target.stack === "php") {
    // An abandoned package is reported, never a failure (finding 23).
    tool = {
      binary: "composer",
      command: "composer audit --format=json --abandoned=report",
      lockfiles: ["composer.lock"],
      tool: "composer",
      manifest: "composer.json",
    };
  }
  if (!tool) return { reason: `no audit tool for ${target.packageManager}` };
  const present = tool.lockfiles.filter((name) => exists(join(dir, name)));
  if (present.length === 0) return { reason: "no lockfile" };
  if (!onPath(tool.binary, env)) return { reason: `${tool.binary} not on PATH` };
  return { command: tool.command, tool: tool.tool, files: [tool.manifest, ...present] };
}

/**
 * The advisories the item's base commit already had (ADR 0006): the manifest and the lockfile at
 * `baseCommit` are audited in a scratch folder under `.crew/local/`. No lockfile at the base means
 * nothing was locked, so every advisory is the item's; a base that cannot be read or audited is
 * unreadable, and the caller counts every advisory and says why.
 */
async function baselineAdvisories(
  paths: CrewPaths,
  work: WorkItem,
  target: Target,
  audit: ResolvedAudit,
  where: string,
  env?: NodeJS.ProcessEnv,
): Promise<{ readable: boolean; advisories: string[] }> {
  if (!work.baseCommit || audit.files.length === 0) return { readable: false, advisories: [] };
  const scratch = join(paths.crewDir, "local", "audit-base", work.id, where || "root");
  rmSync(scratch, { recursive: true, force: true });
  mkdirSync(scratch, { recursive: true });
  let lockfiles = 0;
  for (const [index, file] of audit.files.entries()) {
    const rel = target.path === "." ? file : `${target.path}/${file}`;
    const text = gitShowFile(paths.root, work.baseCommit, rel);
    if (text === null) continue;
    writeText(join(scratch, file), text);
    if (index > 0) lockfiles += 1;
  }
  if (lockfiles === 0) return { readable: true, advisories: [] };
  const log = join(workDir(paths, work.id), "logs", `deps-base-${where}-${Date.now()}.txt`);
  const result = await runCommand(audit.command, {
    cwd: scratch,
    timeoutMs: gateTimeoutMs(target, "deps"),
    logPath: log,
    env,
  });
  const report = parseAudit(audit.tool, readTextQuietly(log) ?? result.tail);
  return { readable: report.readable && !result.timedOut, advisories: report.advisories };
}

/** The deps gate judged against the base commit: new advisories fail, known ones are named, an unreadable report falls back to the exit code. */
async function judgeAudit(
  run: GateRun,
  audit: ResolvedAudit,
  paths: CrewPaths,
  work: WorkItem,
  target: Target,
  where: string,
  env?: NodeJS.ProcessEnv,
): Promise<GateRun> {
  const text = (run.log && readTextQuietly(join(workDir(paths, work.id), run.log))) || run.tail;
  const report = parseAudit(audit.tool, text);
  if (!report.readable) return { ...run, reason: "audit report unreadable; judged by exit code" };
  const started = Date.now();
  const baseline = await baselineAdvisories(paths, work, target, audit, where, env);
  const known = baseline.readable
    ? report.advisories.filter((a) => baseline.advisories.includes(a))
    : [];
  const fresh = baseline.readable
    ? report.advisories.filter((a) => !baseline.advisories.includes(a))
    : report.advisories;
  const unbaselined = baseline.readable
    ? ""
    : "; the base commit could not be audited, so every advisory counts";
  const reason = fresh.length
    ? `${fresh.length} new: ${fresh.join(", ")}${known.length ? `; ${known.length} known before` : ""}${unbaselined}`
    : known.length
      ? `${known.length} known before this item, none introduced`
      : undefined;
  return {
    ...run,
    status: fresh.length ? "fail" : "pass",
    durationMs: run.durationMs + (Date.now() - started),
    ...(reason ? { reason } : {}),
    advisories: {
      current: report.advisories.length,
      known: known.length,
      fresh,
      baselined: baseline.readable,
    },
  };
}

/** The gate table from the spec, section 12, the same on every route since ADR 0002. Secrets and e2e are planned separately, once per item. */
export function gatesForTarget(target: Target, policy: Policy, changed: string[]): GateName[] {
  const has = (gate: GateName): boolean => !!target.gates[gate];
  const gates: GateName[] = [];
  if (has("build")) gates.push("build");
  // Tests run on every route: a target without a command is planned so the run says so, unless the
  // user unset the gate on purpose (finding 87: another target runs the same suite).
  if (!target.unset?.includes("test")) gates.push("test");
  if (has("lint")) gates.push("lint");
  if (has("typecheck")) gates.push("typecheck");
  // On every route the audit looks at the change: dependencies the item did not touch are the owner's standing debt (ADR 0002).
  if (manifestChanged(changed)) gates.push("deps");
  for (const gate of policy.requiredGates)
    if (gate !== "secrets" && gate !== "e2e" && !gates.includes(gate)) gates.push(gate);
  return gates;
}

/** Whether a target covers a path: the root covers every path, any other its own folder. */
function covers(target: Target, path: string): boolean {
  return target.path === "." || path === target.path || path.startsWith(`${target.path}/`);
}

/** Whether the item's change calls for the e2e gate (SP7 §8.2): an interface or a public-api path, or the policy requiring it. */
function wantsE2e(policy: Policy, changed: string[]): boolean {
  return (
    policy.requiredGates.includes("e2e") ||
    changed.some(isInterfacePath) ||
    riskAreasForPaths(changed, policy).includes("public-api")
  );
}

export function plannedGates(
  route: Route,
  profile: Profile,
  policy: Policy,
  changed: string[],
  root: string,
): PlannedGate[] {
  const planned: PlannedGate[] = [{ gate: "secrets", target: "." }];
  const touched = profile.targets.filter(
    (t) => changed.length === 0 || changed.some((p) => covers(t, p)),
  );
  // Two manifests in one folder (composer.json beside package.json) are two targets at one path;
  // the stack then names which one a gate belongs to (finding 8 of the real-use phase).
  const atPath = new Map<string, number>();
  for (const t of profile.targets) atPath.set(t.path, (atPath.get(t.path) ?? 0) + 1);
  for (const target of touched) {
    const member =
      target.workspaceOf !== undefined &&
      profile.targets.some((t) => t.path === target.workspaceOf);
    const shared = (atPath.get(target.path) ?? 0) > 1;
    for (const gate of gatesForTarget(target, policy, changed)) {
      // A workspace member runs only the gates it defines; the package that lists it runs the rest once.
      if (member && !target.gates[gate]) continue;
      // On the standard route the audit is required only when a tool exists; on the full route it must be skipped explicitly.
      if (gate === "deps" && route === "standard" && "reason" in depsAuditCommand(target, root))
        continue;
      planned.push({ gate, target: target.path, ...(shared ? { stack: target.stack } : {}) });
    }
  }
  // A profile with no target, or a changed file no target covers, plans the test gate at the root
  // anyway: it ends unavailable until a command is set, so an item is never proven by the secrets
  // gate alone (finding #36 of the real-use phase).
  const uncovered =
    profile.targets.length === 0 ||
    changed.some((path) => !profile.targets.some((t) => covers(t, path)));
  if (uncovered && !planned.some((g) => g.gate === "test" && g.target === "."))
    planned.push({ gate: "test", target: "." });
  // The e2e gate runs the whole application once per item, never per target: on the first target
  // with a command, else at the root, where the run says what is missing (SP7 §8.2).
  if (wantsE2e(policy, changed)) {
    const runner = profile.targets.find((t) => t.gates.e2e);
    const shared = runner !== undefined && (atPath.get(runner.path) ?? 0) > 1;
    planned.push({
      gate: "e2e",
      target: runner?.path ?? ".",
      ...(shared && runner ? { stack: runner.stack } : {}),
    });
  }
  return planned;
}

/** The target a planned gate belongs to: by path, and by stack where the plan names one. */
function targetOf(profile: Profile, planned: PlannedGate): Target | undefined {
  return profile.targets.find(
    (t) => t.path === planned.target && (planned.stack === undefined || t.stack === planned.stack),
  );
}

/** A run of the same gate at the same path that this plan supersedes: its own stack, a row from before stacks were recorded, or any row when the plan names no stack. */
function superseded(run: GateRun, planned: PlannedGate): boolean {
  return (
    run.gate === planned.gate &&
    run.target === planned.target &&
    (planned.stack === undefined || run.stack === undefined || run.stack === planned.stack)
  );
}

const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|php|py|rb|go|rs|java|kt|cs)$/i;

/**
 * A path as one shell word: as it is when it has only safe characters, in POSIX single quotes
 * otherwise, so a file name on an implementer's branch adds no command to the lead's gate. A name
 * that starts with `-` is written `./<name>` first, so the runner never reads it as an option
 * (finding 56).
 */
function shellWord(path: string): string {
  const word = path.startsWith("-") ? `./${path}` : path;
  return /^[A-Za-z0-9_./-]+$/.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`;
}

/**
 * The test command of a todo (SP7 §8.1): the target's scoped template with the todo's source files
 * under the target substituted for `{files}`, or the target's whole test command when the profile
 * has no template or the todo touched no source file of the target; null with no test command.
 */
export function scopedTestCommand(target: Target, scope: readonly string[]): string | null {
  const whole = target.gates.test?.command;
  return whole === undefined ? null : narrowedTest(target, whole, scope);
}

/** `whole` narrowed to the todo's source files under the target by its scoped template, or `whole` itself. */
function narrowedTest(target: Target, whole: string, scope: readonly string[]): string {
  if (!target.testScoped) return whole;
  const prefix = target.path === "." ? "" : `${target.path}/`;
  const files = scope
    .filter((p) => (prefix ? p.startsWith(prefix) : true) && SOURCE_EXTENSIONS.test(p))
    .map((p) => (prefix ? p.slice(prefix.length) : p));
  if (!files.length) return whole;
  // A function replacer: a replacement string would read `$&`, `$'` or `$`+backtick inside a file name.
  return target.testScoped.command.replace("{files}", () => files.map(shellWord).join(" "));
}

/**
 * A todo's own gate (SP7 §8.1): the deterministic gates the todo's files plan, without the secrets
 * scan (the item's gate run scans the whole change) and without the e2e run (the item's run proves
 * the whole application), the test command scoped to those files. The
 * runs are returned to the todo's record, never written to the item's evidence; an `unavailable`
 * test gate fails the todo, since a todo with nothing to test is not proven.
 */
export async function runTaskGate(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
  policy: Policy,
  scope: string[],
): Promise<{ status: "pass" | "fail"; runs: GateRun[]; judgement: PlannedJudgement[] }> {
  const planned = plannedGates(work.route, profile, policy, scope, paths.root).filter(
    (p) => p.gate !== "secrets" && p.gate !== "e2e",
  );
  const stamp = gitHead(paths.root) ?? "none";
  const runs: GateRun[] = [];
  for (const p of planned)
    runs.push(await runOneGate(paths, work, profile, p, stamp, scope, scope));
  // The judgement the scope asks for is planned here and run by the roles, never by the engine (SP7b decision 14).
  return {
    status: runs.length && runs.every((r) => r.status === "pass") ? "pass" : "fail",
    runs,
    judgement: plannedTaskJudgement(scope, policy),
  };
}

/**
 * One planned gate run for one target: the profile's command in the target's folder under its
 * timeout, judged as the gate asks (the deps audit against the item's base commit, lint and
 * typecheck by the files they name, the secrets scan over the item's change). The audit (SP8
 * Task 4) calls it with an item whose base commit is null, so nothing is compared with a base, and
 * names each log itself.
 */
export async function runOneGate(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
  planned: PlannedGate,
  fingerprint: string,
  changed: string[],
  scope?: readonly string[],
  logName?: string,
  env?: NodeJS.ProcessEnv,
): Promise<GateRun> {
  const { gate, target: targetPath } = planned;
  const at = nowIso();
  const base: GateRun = {
    gate,
    target: targetPath,
    ...(planned.stack ? { stack: planned.stack } : {}),
    command: null,
    commandSource: null,
    confirmed: true,
    exit: null,
    status: "unavailable",
    durationMs: 0,
    at,
    log: null,
    tail: "",
    fingerprint,
  };
  if (gate === "secrets") {
    const started = Date.now();
    const scan = await scanSecrets(paths.root, profile, work.baseCommit);
    return {
      ...base,
      command: scan.usedGitleaks ? "built-in secret scan + gitleaks" : "built-in secret scan",
      exit: scan.status === "pass" ? 0 : 1,
      status: scan.status,
      durationMs: Date.now() - started,
      tail: scan.tail,
    };
  }
  const target = targetOf(profile, planned);
  // A pack's command is never run unseen (SP6 Task 2 AC-3): proposed until a person confirms it
  // in this project, the gate says so and the item stays unproven; a core detector's own guess
  // runs. The hold stands before every runner that reads the target's command, the e2e's included
  // (round 3); the deps gate runs the audit tool, never a configured command.
  const held = (command: string, what: string, pack: string): GateRun => ({
    ...base,
    command,
    commandSource: "proposed",
    confirmed: false,
    reason: `pack ${pack}'s ${what} is not confirmed (crew profile confirm ${gate})`,
  });
  const own = gate === "deps" ? undefined : target?.gates[gate];
  const ownPack = proposedByPack(own);
  if (own && ownPack) return held(own.command, "command", ownPack);
  if (gate === "e2e") {
    const where = targetPath.replace(/[^a-z0-9]+/gi, "_");
    return runE2e({
      paths,
      work,
      profile,
      target: target ?? null,
      base,
      timeoutMs: target ? gateTimeoutMs(target, "e2e") : 0,
      log: `logs/e2e-${where}-${Date.now()}.txt`,
    });
  }
  if (!target)
    return {
      ...base,
      reason:
        gate === "test"
          ? 'no test command (crew profile set test "<cmd>")'
          : "target not in profile",
    };
  let command: string | null;
  let source: GateRun["commandSource"] = "detected";
  let audit: ResolvedAudit | null = null;
  if (gate === "deps") {
    const found = depsAuditCommand(target, paths.root, env);
    if ("reason" in found) return { ...base, reason: found.reason };
    audit = found;
    command = found.command;
  } else {
    const configured = target.gates[gate];
    if (!configured) return { ...base, reason: "no command" };
    // A todo's gate runs the test command narrowed to the todo's files where the profile knows how (SP7 §8.1).
    command =
      gate === "test" && scope
        ? narrowedTest(target, configured.command, scope)
        : configured.command;
    source = configured.source;
    // The scoped template the same rule gave is held on its own confirmation (the security, risk
    // and architecture gates' finding): a todo's gate runs it, whatever the whole command's state.
    const scopedPack = proposedByPack(target.testScoped);
    if (gate === "test" && scope && command !== configured.command && scopedPack)
      return held(command, "scoped test command", scopedPack);
  }
  const where =
    targetPath.replace(/[^a-z0-9]+/gi, "_") + (planned.stack ? `-${planned.stack}` : "");
  const log = logName ?? `logs/${gate}-${where}-${Date.now()}.txt`;
  const result = await runCommand(command, {
    cwd: join(paths.root, targetPath),
    timeoutMs: gateTimeoutMs(target, gate),
    logPath: join(workDir(paths, work.id), log),
    env,
  });
  const passed = result.exit === 0 && !result.timedOut;
  const run: GateRun = {
    ...base,
    command,
    commandSource: source,
    confirmed: source !== "proposed",
    exit: result.exit,
    status: passed ? "pass" : "fail",
    durationMs: result.durationMs,
    log,
    tail: result.tail,
    ...(result.timedOut ? { reason: "timed out" } : {}),
  };
  // The audit is judged against the item's base commit, not by its exit code alone (ADR 0006).
  if (result.timedOut) return run;
  if (audit) return judgeAudit(run, audit, paths, work, target, where, env);
  // Lint and typecheck are judged by the files they name (ADR 0006).
  if ((gate === "lint" || gate === "typecheck") && run.status === "fail")
    return judgeProblems(run, paths, work, targetPath, changed);
  return run;
}

/**
 * A failing lint or typecheck read for the files it names: problems only in files the item never
 * changed are the repository's standing debt, counted and not failing; a problem in a file the item
 * changed fails, named. A run that names no file is judged by its exit code as before.
 */
function judgeProblems(
  run: GateRun,
  paths: CrewPaths,
  work: WorkItem,
  targetPath: string,
  changed: string[],
): GateRun {
  const text = (run.log && readTextQuietly(join(workDir(paths, work.id), run.log))) || run.tail;
  const named = namedFiles(text, [join(paths.root, targetPath), paths.root], paths.root);
  if (named.length === 0) return run;
  const touched = named.filter((file) => changed.includes(file));
  const untouched = named.length - touched.length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (touched.length === 0) {
    return {
      ...run,
      status: "pass",
      reason: `${plural(named.length, "file")} with problems, none changed by this item (pre-existing)`,
      problems: { touched, untouched },
    };
  }
  return {
    ...run,
    reason: `problems in files this item changed: ${touched.join(", ")}${untouched ? `; ${plural(untouched, "untouched file")} also` : ""}`,
    problems: { touched, untouched },
  };
}

export interface GateOutcome {
  evidence: Evidence;
  verdict: "proven" | "unproven";
  unproven: string[];
  planned: PlannedGate[];
  changed: string[];
  raised: Route | null;
  tampered: boolean;
  /** The judgement gates the item needs, printed before the roles run them (SP2 §10). */
  judgement: PlannedJudgement[];
  /** The review folder, written when a judgement gate is planned; null when none is. */
  review: string | null;
  /** What the review's patch lacks, when something could not be cut (review of SP2b, findings 9 and 10). */
  reviewNote: string | null;
  /** Set when the evidence could not be saved (edited outside the engine during the run, or the lock held): nothing recorded, the verdict unproven on the in-memory evidence (finding 81). */
  saveRefused?: string;
}

/**
 * The files the reviewers read (finding 134): every path the item changed, watched or not (`all`,
 * git's view, so an ignored file stays out), but the engine's own `.crew/` (compared without
 * regard to case). Outside git, or with nothing there, the watched list the rest of the run reads.
 */
export function reviewPaths(all: readonly string[], watched: readonly string[]): string[] {
  const reviewed = all.filter((p) => !p.toLowerCase().startsWith(".crew/"));
  return reviewed.length ? reviewed : [...watched];
}

export async function runGates(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
  policy: Policy,
  /** `env`: the environment of the gates' commands, the process's when none is given (finding 147). */
  options: {
    only?: readonly (GateName | JudgementGateName)[];
    tampered?: boolean;
    env?: NodeJS.ProcessEnv;
  } = {},
): Promise<GateOutcome> {
  const base = work;
  const changed = changedWatchedPaths(paths.root, profile, base);
  const pathRisk = riskAreasForPaths(changed, policy);
  // A path the policy kept from raising the route is named once, so the loosening is on record.
  const excluded = excludedRiskPaths(changed, policy);
  const excludedNote = "risk paths excluded by the team policy: ";
  if (excluded.length && !work.routeReasons.some((r) => r.startsWith(excludedNote)))
    work.routeReasons.push(`${excludedNote}${excluded.join(", ")}`);
  let raised: Route | null = null;
  if (pathRisk.length) {
    for (const area of pathRisk) if (!work.riskAreas.includes(area)) work.riskAreas.push(area);
    if (raiseRoute(work, "full", `the change touches ${pathRisk.join(", ")} paths`))
      raised = "full";
  }
  const planned = plannedGates(work.route, profile, policy, changed, paths.root);
  const read = loadEvidence(paths, work.id);
  const evidence = read.evidence;
  // The caller knows about the work item and the profile; the evidence and the ledger are checked here.
  const tampered = !!options.tampered || read.tampered || loadLedger(paths, work.id).tampered;
  const fingerprintBefore = computeFingerprint(paths.root, profile, base);
  // The stamp the runs carry: the tree before them, or as the build gate left it (finding 18).
  let stamp = fingerprintBefore;
  // `--only` with judgement names alone runs no deterministic gate: the inputs are rewritten and the plan stands.
  const onlyGates = options.only?.filter((g): g is GateName => GATE_NAMES.includes(g as GateName));
  for (const one of planned) {
    const { gate, target } = one;
    if (onlyGates !== undefined && !onlyGates.includes(gate)) continue;
    evidence.runs = evidence.runs.filter((r) => !superseded(r, one));
    if (isSkipped(work, `gate:${gate}`, policy)) {
      const skip = work.skips.find((s) => s.step === `gate:${gate}`);
      evidence.runs.push({
        gate,
        target,
        ...(one.stack ? { stack: one.stack } : {}),
        command: null,
        commandSource: null,
        confirmed: true,
        exit: null,
        status: "skipped",
        durationMs: 0,
        at: nowIso(),
        log: null,
        tail: "",
        reason: skip?.reason,
        fingerprint: stamp,
      });
      continue;
    }
    const run = await runOneGate(
      paths,
      work,
      profile,
      one,
      stamp,
      changed,
      undefined,
      undefined,
      options.env,
    );
    // A build that rewrote watched files is part of the proof, not a change against it: the stamp
    // moves to the tree as the build left it, and the run says what it wrote (finding 18).
    if (gate === "build" && run.status === "pass") {
      const after = computeFingerprint(
        paths.root,
        profile,
        base,
        MAX_WATCHED_FILES,
        fingerprintMethod(fingerprintBefore),
      );
      if (after !== stamp) {
        const now = changedWatchedPaths(paths.root, profile, base);
        run.wrote = now.filter((p) => !changed.includes(p));
        run.fingerprint = after;
        stamp = after;
      }
    }
    evidence.runs.push(run);
  }
  // Every run of this gate run carries the stamp; any other gate that edits files shows up as a change.
  if (stamp !== fingerprintBefore)
    for (const r of evidence.runs) if (r.fingerprint === fingerprintBefore) r.fingerprint = stamp;
  evidence.fingerprint = stamp;
  // The seats the route plans, recorded with the paths the change touched (SP7 §6.6); the caller
  // saves the work, as it does for the risk areas. The registry carries the registered packs'
  // templates and their globs read the change before the watch's exclusions, as `crew team` does
  // (SP6 Task 6), so a pack's seat survives to the report.
  const registry = teamsFor(policy, packTemplates(paths.userDir)).teams;
  // Planned after the route may have been raised, so a risk area the diff touched plans the
  // security gate; from the same registry as the seats.
  const judgement = itemJudgement(work, changed, policy, registry);
  // Every path the item changed, watched or not: the templates' globs and the reviewers read it.
  const allChanged = changedPaths(paths.root, base);
  work.seats = plannedSeats(work.route, work.riskAreas, changed, policy, {
    registry,
    templatePaths: allChanged,
  });
  // What crew team records at the conclave, recorded again with the paths the change touched (SP6
  // Task 6), so the report shows the packs and the expert's files even when crew team never ran.
  recordPackUse(work, { userDir: paths.userDir, profile, changed, policy, registry });
  work.primaryTeam = primaryTeam(changed);
  const reviewInputs = judgement.length
    ? writeReviewInputs(paths, work, reviewPaths(allChanged, changed), stamp)
    : null;
  const currentFingerprint = computeFingerprint(
    paths.root,
    profile,
    base,
    MAX_WATCHED_FILES,
    fingerprintMethod(fingerprintBefore),
  );
  const ledger = loadLedger(paths, work.id).ledger;
  const verdictOf = (of: Evidence) =>
    computeVerdict({
      work,
      evidence: of,
      expected: planned,
      expectedJudgement: judgement,
      policy,
      ledger,
      currentFingerprint,
      tampered,
    });
  // Saved into the evidence as it stands now, under the lock (finding 81): the runs and the stamp
  // are this run's, the test-first and the roles' records are whatever landed meanwhile, and the
  // verdict is computed on the merge. A refusal (the file edited outside the engine during the run,
  // a lock held) saves nothing and is said; the verdict is then unproven, on the in-memory evidence.
  const saved = updateEvidence(paths, work.id, (fresh) => {
    fresh.runs = evidence.runs;
    fresh.fingerprint = stamp;
    const merged = verdictOf(fresh);
    fresh.verdict = merged.verdict;
    fresh.unproven = merged.unproven;
  });
  if ("refused" in saved) {
    evidence.verdict = "unproven";
    evidence.unproven = [saved.refused, ...verdictOf(evidence).unproven];
  }
  const final = "saved" in saved ? saved.saved : evidence;
  return {
    evidence: final,
    verdict: final.verdict,
    unproven: final.unproven,
    planned,
    changed,
    raised,
    tampered,
    judgement,
    review: reviewInputs?.dir ?? null,
    reviewNote: reviewInputs?.note ?? null,
    ...("refused" in saved ? { saveRefused: saved.refused } : {}),
  };
}

export interface Assessment {
  evidence: Evidence;
  verdict: "proven" | "unproven";
  unproven: string[];
  expected: PlannedGate[];
  changed: string[];
  /** The judgement gates planned for the item as it stands (SP2 §10). */
  judgement: PlannedJudgement[];
  /** The fingerprint of the code as it is now, by the method the evidence was made with. */
  currentFingerprint: string;
  /** The objection ledger as read, so a reassessment needs no second read. */
  ledger: ObjectionLedger;
  /** An audit's records as they stand (SP7 §7.5, SP8 Task 5): the run at HEAD or not, the report current or not. */
  audit: { run: boolean; runAtHead: boolean; report: boolean; reportCurrent: boolean };
  /** Whether any engine-owned file of the item was changed outside the engine. */
  tampered: boolean;
}

/**
 * The judgement gates an item is held to: the route's, then each gate the agent seated with
 * `crew team <id> seat` (finding 140), its reason the planned one's.
 */
export function itemJudgement(
  work: WorkItem,
  changed: readonly string[],
  policy: Policy,
  registry: Parameters<typeof plannedJudgementGates>[4],
): PlannedJudgement[] {
  const planned = plannedJudgementGates(work.route, work.riskAreas, changed, policy, registry);
  for (const seated of work.seatedJudgement ?? [])
    if (!planned.some((p) => p.gate === seated.gate))
      planned.push({ gate: seated.gate, reason: `seated: ${seated.reason}` });
  return planned;
}

/** Read-only: what the evidence says about the code as it is right now. Fast enough for a hook. */
export function assess(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
  policy: Policy,
  tampered = false,
): Assessment {
  const base = work;
  const changed = changedWatchedPaths(paths.root, profile, base);
  const expected = plannedGates(work.route, profile, policy, changed, paths.root);
  const judgement = itemJudgement(
    work,
    changed,
    policy,
    teamsFor(policy, packTemplates(paths.userDir)).teams,
  );
  const read = loadEvidence(paths, work.id);
  // Judged with the method the evidence was made with: a walk fingerprint from a process where
  // git could not run is compared to the walk here, not to git's name for the same code.
  const currentFingerprint = computeFingerprint(
    paths.root,
    profile,
    base,
    MAX_WATCHED_FILES,
    fingerprintMethod(read.evidence.fingerprint),
  );
  const led = loadLedger(paths, work.id);
  const audit = auditState(paths, work);
  return reassess(
    {
      evidence: read.evidence,
      expected,
      changed,
      judgement,
      currentFingerprint,
      ledger: led.ledger,
      tampered: tampered || read.tampered || led.tampered,
      audit: {
        run: audit.run !== null,
        runAtHead: audit.runAtHead,
        report: audit.report !== null,
        reportCurrent: audit.reportCurrent,
      },
    },
    work,
    policy,
  );
}

/** What an assessment is judged from: everything but the verdict. */
export type AssessmentInputs = Omit<Assessment, "verdict" | "unproven">;

/**
 * The verdict from inputs already read: the first time, and again after the evidence changed in
 * memory (a ruling recorded), so a command reads once and writes once, with the verdict
 * (review of SP2b, finding 8).
 */
export function reassess(a: AssessmentInputs, work: WorkItem, policy: Policy): Assessment {
  const verdict = computeVerdict({
    work,
    evidence: a.evidence,
    expected: a.expected,
    expectedJudgement: a.judgement,
    ledger: a.ledger,
    currentFingerprint: a.currentFingerprint,
    tampered: a.tampered,
    audit: a.audit,
    policy,
  });
  return { ...a, ...verdict };
}
