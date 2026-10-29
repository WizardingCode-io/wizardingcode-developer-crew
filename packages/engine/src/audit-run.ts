/**
 * The audit run (SP7 §7.5, SP8 Task 4): the project's own tools over the whole tree with no
 * baseline, through the gate runners, every result recorded and a failure never a block; beside
 * the runs, the files the reviewers read and the scope with its risk areas. The engine writes
 * nothing of the audited project: everything lands under `.crew/work/<id>/audit/` and `logs/`.
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import { riskAreasForPaths } from "./classify.ts";
import { allWatchedFiles, gitHead, MAX_WATCHED_FILES } from "./fingerprint.ts";
import { nowIso, readJson, writeText } from "./fs.ts";
import { plannedGates, runOneGate } from "./gates.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { writeProtectedJson, writeProtectedText } from "./store.ts";
import type { GateName, GateRun, Policy, Profile, RiskArea, Stack, WorkItem } from "./types.ts";

export interface AuditRun {
  gate: GateName;
  target: string;
  stack?: Stack;
  status: "pass" | "fail" | "unavailable";
  durationMs: number;
  /** The run's log under the work folder (`logs/audit-<gate>-<target>.txt`), null when nothing ran. */
  log: string | null;
  reason?: string;
  /** The dependency audit's advisories, every one of them: an audit has no base commit. */
  advisories?: string[];
}

export interface AuditRuns {
  at: string;
  /** The commit the tree was at, null outside git. */
  head: string | null;
  runs: AuditRun[];
}

export interface AuditScope {
  targets: { path: string; stack: string; packageManager: string | null }[];
  files: number;
  bytes: number;
  riskAreas: RiskArea[];
}

export interface AuditOptions {
  /** The gates to run; their runs replace the earlier record's, the others are kept. */
  only?: readonly GateName[];
  /** The walk's cap, the fingerprint's by default; a test lowers it. */
  maxFiles?: number;
}

/** The e2e gate is never run by the audit: the application needs its environment, started by hand. */
export const E2E_BY_HAND = "needs the environment; run by hand";

/** Every watched source file of the tree, sorted, or null above the walk's cap: a partial list is never written. */
export function auditFiles(
  root: string,
  profile: Profile,
  maxFiles = MAX_WATCHED_FILES,
): string[] | null {
  const files = allWatchedFiles(root, profile, maxFiles);
  return files === null ? null : [...files].sort();
}

/** The targets, the files' count and bytes, and the risk areas over every file. */
export function auditScope(
  paths: CrewPaths,
  profile: Profile,
  policy: Policy,
  files: readonly string[],
): AuditScope {
  let bytes = 0;
  for (const file of files) {
    try {
      bytes += statSync(join(paths.root, file)).size;
    } catch {
      // A file gone between the walk and the count: it weighs nothing.
    }
  }
  return {
    targets: profile.targets.map((t) => ({
      path: t.path,
      stack: t.stack,
      packageManager: t.packageManager || null,
    })),
    files: files.length,
    bytes,
    riskAreas: riskAreasForPaths(files, policy),
  };
}

/** Why `--only` cannot run: no recorded run to keep, or a HEAD the kept runs never ran at. */
export type StaleAudit = { recorded: string | null; now: string | null } | { reason: string };

/** The refusal of a stale `--only`, naming both heads (twelve characters each, `no git` for none) or the missing run. */
export function staleRefusal(id: string, stale: StaleAudit): string {
  if ("reason" in stale) return `--only needs a recorded run: run crew audit ${id} run first`;
  const short = (sha: string | null) => (sha === null ? "no git" : sha.slice(0, 12));
  return `HEAD moved since the recorded run (${short(stale.recorded)} → ${short(stale.now)}): run crew audit ${id} run without --only`;
}

/** The refusal of a tree over the cap: nothing was recorded, since a partial audit would hide what it did not read. */
export function cappedRefusal(cap: number): string {
  return `the tree has more than ${cap} watched files, the walk's cap: nothing was recorded, since a partial audit would hide what it did not read; narrow the profile's targets or the folders it skips, then run again`;
}

/** The log of one audit run: `logs/audit-<gate>-<target>.txt`, the root as `root`, the stack appended where a path holds two targets. */
export function auditLogName(gate: GateName, target: string, stack?: Stack): string {
  const where = target === "." ? "root" : target.replace(/[^a-z0-9]+/gi, "_");
  return `logs/audit-${gate}-${where}${stack ? `-${stack}` : ""}.txt`;
}

/** A gate run read as an audit run: three states, the log, the reason, the advisories as a list. */
function toAuditRun(run: GateRun): AuditRun {
  const status: AuditRun["status"] =
    run.status === "pass" ? "pass" : run.status === "fail" ? "fail" : "unavailable";
  const advisories = run.advisories?.fresh;
  const reason =
    advisories !== undefined
      ? advisories.length
        ? `${advisories.length} advisor${advisories.length === 1 ? "y" : "ies"}; no baseline on an audit`
        : "no advisories"
      : run.reason;
  return {
    gate: run.gate,
    target: run.target,
    ...(run.stack ? { stack: run.stack } : {}),
    status,
    durationMs: run.durationMs,
    log: run.log,
    ...(reason ? { reason } : {}),
    ...(advisories !== undefined ? { advisories } : {}),
  };
}

/**
 * The run: the files and the scope first, then every gate the full route plans for the tree
 * except e2e, each through the gate runner with no base commit (every advisory listed, the whole
 * tree scanned for secrets, every file counted by lint and typecheck). A tree over the cap records
 * nothing and says so.
 */
export async function runAudit(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
  policy: Policy,
  options: AuditOptions = {},
): Promise<AuditRuns | { capped: number } | { stale: StaleAudit }> {
  const dir = workDir(paths, work.id);
  const auditDir = join(dir, "audit");
  const head = gitHead(paths.root);
  const only = options.only;
  // `--only` keeps the other gates' runs, which are the run at HEAD only while HEAD is where they
  // ran (finding 101): checked before anything is written, so a refusal records nothing.
  let earlier: AuditRuns | null = null;
  if (only !== undefined) {
    earlier = readJson<AuditRuns>(join(auditDir, "runs.json"));
    if (earlier === null) return { stale: { reason: "no recorded run" } };
    const now = head === "none" ? null : head;
    if (earlier.head !== now) return { stale: { recorded: earlier.head, now } };
  }
  const cap = options.maxFiles ?? MAX_WATCHED_FILES;
  const files = auditFiles(paths.root, profile, cap);
  if (files === null) return { capped: cap };
  writeProtectedText(paths, join(auditDir, "files.txt"), `${files.join("\n")}\n`);
  writeProtectedJson(
    paths,
    join(auditDir, "scope.json"),
    auditScope(paths, profile, policy, files),
  );
  // No base commit: the deps judge finds nothing to compare with and the secrets scan walks the tree.
  const unbased: WorkItem = { ...work, baseCommit: null };
  // The design lint and the prose scan judge a change, not a repository (SP9 Task 6;
  // 2026-10-29-001): planned out as the e2e run is.
  const planned = plannedGates("full", profile, policy, files, paths.root).filter(
    (p) =>
      p.gate !== "e2e" &&
      p.gate !== "design-lint" &&
      p.gate !== "prose" &&
      (only === undefined || only.includes(p.gate)),
  );
  const runs: AuditRun[] = [];
  for (const one of planned) {
    const log = auditLogName(one.gate, one.target, one.stack);
    const run = await runOneGate(paths, unbased, profile, one, head, files, policy, undefined, log);
    // The scan writes no log of its own: its findings go under the item's logs, so the report names them.
    if (one.gate === "secrets") {
      writeText(join(dir, log), `${run.tail}\n`);
      run.log = log;
    }
    runs.push(toAuditRun(run));
  }
  if (only === undefined || only.includes("e2e"))
    runs.push({
      gate: "e2e",
      target: ".",
      status: "unavailable",
      durationMs: 0,
      log: null,
      reason: E2E_BY_HAND,
    });
  const kept = (earlier?.runs ?? []).filter((r) => !only?.includes(r.gate));
  const record: AuditRuns = {
    at: nowIso(),
    head: head === "none" ? null : head,
    runs: [...kept, ...runs],
  };
  writeProtectedJson(paths, join(auditDir, "runs.json"), record);
  return record;
}

/** One run on one line: the gate, the target, the state, the log of a failure or the reason of what did not run. */
export function auditRunLine(run: AuditRun): string {
  const where = `${run.target}${run.stack ? `, ${run.stack}` : ""}`;
  const detail =
    run.status === "fail" && run.log
      ? ` (${run.log})`
      : run.status === "unavailable" && run.reason
        ? ` (${run.reason})`
        : "";
  const took = run.status === "unavailable" ? "" : ` in ${(run.durationMs / 1000).toFixed(1)}s`;
  return `${run.gate} (${where}): ${run.status}${detail}${took}`;
}

/** The runs counted by state, the failing and the unavailable gates named in the run's order. */
export function auditSummary(runs: readonly AuditRun[]): string {
  const of = (status: AuditRun["status"]) => runs.filter((r) => r.status === status);
  const named = (list: AuditRun[]) =>
    list.length ? ` (${list.map((r) => r.gate).join(", ")})` : "";
  const failed = of("fail");
  const missing = of("unavailable");
  return `${of("pass").length} pass, ${failed.length} fail${named(failed)}, ${missing.length} unavailable${named(missing)}`;
}
