import { spawnSync } from "node:child_process";
import { basename, join } from "node:path";
import { riskAreasForPaths } from "./classify.ts";
import { computeVerdict, loadEvidence, type PlannedGate, saveEvidence } from "./evidence.ts";
import { changedWatchedPaths, computeFingerprint } from "./fingerprint.ts";
import { nowIso } from "./fs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { runCommand } from "./run.ts";
import { scanSecrets } from "./secrets.ts";
import type {
  Evidence,
  GateName,
  GateRun,
  Policy,
  Profile,
  Route,
  Target,
  WorkItem,
} from "./types.ts";
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

function onPath(binary: string): boolean {
  const result = spawnSync(process.platform === "win32" ? "where" : "which", [binary], {
    stdio: "ignore",
  });
  return result.status === 0;
}

const NODE_AUDIT: Record<string, string> = {
  npm: "npm audit --audit-level=high",
  pnpm: "pnpm audit --audit-level=high",
  yarn: "yarn audit --level high",
  bun: "bun audit",
};

export function depsAuditCommand(target: Target): string | null {
  if (target.stack === "node") return NODE_AUDIT[target.packageManager] ?? null;
  if (target.stack === "php") return "composer audit";
  if (target.stack === "python") return onPath("pip-audit") ? "pip-audit" : null;
  return null;
}

/** The gate table from the spec, section 12. Secrets is planned separately, once per repository. */
export function gatesForTarget(
  route: Route,
  target: Target,
  policy: Policy,
  changed: string[],
): GateName[] {
  const has = (gate: GateName): boolean => !!target.gates[gate];
  const gates: GateName[] = [];
  if (has("build")) gates.push("build");
  gates.push("test");
  if (has("lint")) gates.push("lint");
  if (has("typecheck")) gates.push("typecheck");
  if (route === "fast" ? manifestChanged(changed) : true) gates.push("deps");
  for (const gate of policy.requiredGates)
    if (gate !== "secrets" && !gates.includes(gate)) gates.push(gate);
  return gates;
}

export function plannedGates(
  route: Route,
  profile: Profile,
  policy: Policy,
  changed: string[],
): PlannedGate[] {
  const planned: PlannedGate[] = [{ gate: "secrets", target: "." }];
  const touched = profile.targets.filter(
    (t) =>
      t.path === "." ||
      changed.length === 0 ||
      changed.some((p) => p === t.path || p.startsWith(`${t.path}/`)),
  );
  for (const target of touched) {
    for (const gate of gatesForTarget(route, target, policy, changed)) {
      // On the standard route the audit is required only when a tool exists; on the full route it must be skipped explicitly.
      if (gate === "deps" && route === "standard" && !depsAuditCommand(target)) continue;
      planned.push({ gate, target: target.path });
    }
  }
  return planned;
}

async function runOne(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
  gate: GateName,
  targetPath: string,
  fingerprint: string,
): Promise<GateRun> {
  const at = nowIso();
  const base: GateRun = {
    gate,
    target: targetPath,
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
    const scan = await scanSecrets(paths.root, profile);
    return {
      ...base,
      command: scan.usedGitleaks ? "built-in secret scan + gitleaks" : "built-in secret scan",
      exit: scan.status === "pass" ? 0 : 1,
      status: scan.status,
      durationMs: Date.now() - started,
      tail: scan.tail,
    };
  }
  const target = profile.targets.find((t) => t.path === targetPath);
  if (!target) return { ...base, reason: "target not in profile" };
  let command: string | null;
  let source: GateRun["commandSource"] = "detected";
  if (gate === "deps") {
    command = depsAuditCommand(target);
    if (!command) return { ...base, reason: `no audit tool for ${target.packageManager}` };
  } else {
    const configured = target.gates[gate];
    if (!configured) return { ...base, reason: "no command" };
    command = configured.command;
    source = configured.source;
  }
  const log = `logs/${gate}-${targetPath.replace(/[^a-z0-9]+/gi, "_")}-${Date.now()}.txt`;
  const result = await runCommand(command, {
    cwd: join(paths.root, targetPath),
    timeoutMs: target.timeoutMs,
    logPath: join(workDir(paths, work.id), log),
  });
  const passed = result.exit === 0 && !result.timedOut;
  return {
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
}

export interface GateOutcome {
  evidence: Evidence;
  verdict: "proven" | "unproven";
  unproven: string[];
  planned: PlannedGate[];
  changed: string[];
  raised: Route | null;
}

export async function runGates(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
  policy: Policy,
  options: { only?: GateName[] } = {},
): Promise<GateOutcome> {
  const changed = changedWatchedPaths(paths.root, profile);
  const pathRisk = riskAreasForPaths(changed, policy);
  let raised: Route | null = null;
  if (pathRisk.length) {
    for (const area of pathRisk) if (!work.riskAreas.includes(area)) work.riskAreas.push(area);
    if (raiseRoute(work, "full", `the change touches ${pathRisk.join(", ")} paths`))
      raised = "full";
  }
  const planned = plannedGates(work.route, profile, policy, changed);
  const { evidence } = loadEvidence(paths, work.id);
  const fingerprintBefore = computeFingerprint(paths.root, profile);
  for (const { gate, target } of planned) {
    if (options.only && !options.only.includes(gate)) continue;
    evidence.runs = evidence.runs.filter((r) => !(r.gate === gate && r.target === target));
    if (isSkipped(work, `gate:${gate}`)) {
      const skip = work.skips.find((s) => s.step === `gate:${gate}`);
      evidence.runs.push({
        gate,
        target,
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
        fingerprint: fingerprintBefore,
      });
      continue;
    }
    evidence.runs.push(await runOne(paths, work, profile, gate, target, fingerprintBefore));
  }
  // The fingerprint from before the runs is what the evidence vouches for; a gate that edits files shows up as a change.
  evidence.fingerprint = fingerprintBefore;
  const verdict = computeVerdict({
    work,
    evidence,
    expected: planned,
    currentFingerprint: computeFingerprint(paths.root, profile),
    tampered: false,
  });
  evidence.verdict = verdict.verdict;
  evidence.unproven = verdict.unproven;
  saveEvidence(paths, work.id, evidence);
  return { evidence, ...verdict, planned, changed, raised };
}

export interface Assessment {
  evidence: Evidence;
  verdict: "proven" | "unproven";
  unproven: string[];
  expected: PlannedGate[];
  changed: string[];
}

/** Read-only: what the evidence says about the code as it is right now. Fast enough for a hook. */
export function assess(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
  policy: Policy,
  tampered = false,
): Assessment {
  const changed = changedWatchedPaths(paths.root, profile);
  const expected = plannedGates(work.route, profile, policy, changed);
  const read = loadEvidence(paths, work.id);
  const verdict = computeVerdict({
    work,
    evidence: read.evidence,
    expected,
    currentFingerprint: computeFingerprint(paths.root, profile),
    tampered: tampered || read.tampered,
  });
  return { evidence: read.evidence, ...verdict, expected, changed };
}
