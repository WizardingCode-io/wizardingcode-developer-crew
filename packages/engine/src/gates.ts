import { accessSync, constants, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, delimiter, join } from "node:path";
import { type AuditToolName, parseAudit } from "./audit.ts";
import { excludedRiskPaths, riskAreasForPaths } from "./classify.ts";
import { computeVerdict, loadEvidence, type PlannedGate, saveEvidence } from "./evidence.ts";
import {
  changedWatchedPaths,
  computeFingerprint,
  fingerprintMethod,
  gitShowFile,
  MAX_WATCHED_FILES,
} from "./fingerprint.ts";
import { exists, nowIso, readText } from "./fs.ts";
import { plannedJudgementGates, writeReviewInputs } from "./judgement.ts";
import { loadLedger } from "./objections.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { namedFiles } from "./problems.ts";
import { runCommand } from "./run.ts";
import { scanSecrets } from "./secrets.ts";
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
    const prefix = PYTHON_AUDIT[target.packageManager] ?? PYTHON_AUDIT.pip ?? "pip-audit";
    return { command: `${prefix} --format=json`, tool: "pip-audit", files: [] };
  }
  let tool: AuditTool | undefined;
  if (target.stack === "node") {
    tool = NODE_AUDIT[target.packageManager];
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
    writeFileSync(join(scratch, file), text);
    if (index > 0) lockfiles += 1;
  }
  if (lockfiles === 0) return { readable: true, advisories: [] };
  const log = join(workDir(paths, work.id), "logs", `deps-base-${where}-${Date.now()}.txt`);
  const result = await runCommand(audit.command, {
    cwd: scratch,
    timeoutMs: gateTimeoutMs(target, "deps"),
    logPath: log,
  });
  const report = parseAudit(audit.tool, readText(log) ?? result.tail);
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
): Promise<GateRun> {
  const text = (run.log && readText(join(workDir(paths, work.id), run.log))) || run.tail;
  const report = parseAudit(audit.tool, text);
  if (!report.readable) return { ...run, reason: "audit report unreadable; judged by exit code" };
  const started = Date.now();
  const baseline = await baselineAdvisories(paths, work, target, audit, where);
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

/** The gate table from the spec, section 12, the same on every route since ADR 0002. Secrets is planned separately, once per repository. */
export function gatesForTarget(target: Target, policy: Policy, changed: string[]): GateName[] {
  const has = (gate: GateName): boolean => !!target.gates[gate];
  const gates: GateName[] = [];
  if (has("build")) gates.push("build");
  gates.push("test");
  if (has("lint")) gates.push("lint");
  if (has("typecheck")) gates.push("typecheck");
  // On every route the audit looks at the change: dependencies the item did not touch are the owner's standing debt (ADR 0002).
  if (manifestChanged(changed)) gates.push("deps");
  for (const gate of policy.requiredGates)
    if (gate !== "secrets" && !gates.includes(gate)) gates.push(gate);
  return gates;
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
    (t) =>
      t.path === "." ||
      changed.length === 0 ||
      changed.some((p) => p === t.path || p.startsWith(`${t.path}/`)),
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

async function runOne(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
  planned: PlannedGate,
  fingerprint: string,
  changed: string[],
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
  if (!target) return { ...base, reason: "target not in profile" };
  let command: string | null;
  let source: GateRun["commandSource"] = "detected";
  let audit: ResolvedAudit | null = null;
  if (gate === "deps") {
    const found = depsAuditCommand(target, paths.root);
    if ("reason" in found) return { ...base, reason: found.reason };
    audit = found;
    command = found.command;
  } else {
    const configured = target.gates[gate];
    if (!configured) return { ...base, reason: "no command" };
    command = configured.command;
    source = configured.source;
  }
  const where =
    targetPath.replace(/[^a-z0-9]+/gi, "_") + (planned.stack ? `-${planned.stack}` : "");
  const log = `logs/${gate}-${where}-${Date.now()}.txt`;
  const result = await runCommand(command, {
    cwd: join(paths.root, targetPath),
    timeoutMs: gateTimeoutMs(target, gate),
    logPath: join(workDir(paths, work.id), log),
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
  if (audit) return judgeAudit(run, audit, paths, work, target, where);
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
  const text = (run.log && readText(join(workDir(paths, work.id), run.log))) || run.tail;
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
}

export async function runGates(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
  policy: Policy,
  options: { only?: readonly (GateName | JudgementGateName)[]; tampered?: boolean } = {},
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
    const run = await runOne(paths, work, profile, one, stamp, changed);
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
  // Planned after the route may have been raised, so a risk area the diff touched plans the security gate.
  const judgement = plannedJudgementGates(work.route, work.riskAreas, changed, policy);
  const cut = judgement.length ? writeReviewInputs(paths, work, changed, stamp) : null;
  const verdict = computeVerdict({
    work,
    evidence,
    expected: planned,
    expectedJudgement: judgement,
    policy,
    ledger: loadLedger(paths, work.id).ledger,
    currentFingerprint: computeFingerprint(
      paths.root,
      profile,
      base,
      MAX_WATCHED_FILES,
      fingerprintMethod(fingerprintBefore),
    ),
    tampered,
  });
  evidence.verdict = verdict.verdict;
  evidence.unproven = verdict.unproven;
  saveEvidence(paths, work.id, evidence);
  return {
    evidence,
    ...verdict,
    planned,
    changed,
    raised,
    tampered,
    judgement,
    review: cut?.dir ?? null,
    reviewNote: cut?.note ?? null,
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
  /** Whether any engine-owned file of the item was changed outside the engine. */
  tampered: boolean;
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
  const judgement = plannedJudgementGates(work.route, work.riskAreas, changed, policy);
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
  return reassess(
    {
      evidence: read.evidence,
      expected,
      changed,
      judgement,
      currentFingerprint,
      ledger: led.ledger,
      tampered: tampered || read.tampered || led.tampered,
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
    policy,
  });
  return { ...a, ...verdict };
}
