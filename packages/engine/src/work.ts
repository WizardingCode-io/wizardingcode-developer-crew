import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { RouteDecision } from "./classify.ts";
import { higherRoute, routeRank } from "./classify.ts";
import { baseCommitOf } from "./fingerprint.ts";
import { nowIso, writeText } from "./fs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { loadState, saveState } from "./state.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type {
  Criterion,
  CriterionKind,
  Evidence,
  Phase,
  Route,
  TddRecord,
  WorkItem,
  WorkType,
} from "./types.ts";
import { PHASE_ORDER } from "./types.ts";

export const PHASES_BY_ROUTE: Record<Route, Phase[]> = {
  fast: ["receive", "recognize", "build", "gate", "deliver"],
  standard: ["receive", "recognize", "understand", "specify", "plan", "build", "gate", "deliver"],
  full: ["receive", "recognize", "understand", "specify", "plan", "build", "gate", "deliver"],
};

export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function workJson(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "work.json");
}

export function newWorkId(paths: CrewPaths, title: string): string {
  const date = nowIso().slice(0, 10);
  let existing = 0;
  try {
    existing = readdirSync(join(paths.crewDir, "work")).filter((n) => n.startsWith(date)).length;
  } catch {
    existing = 0;
  }
  const seq = String(existing + 1).padStart(3, "0");
  return `${date}-${seq}-${slug(title).slice(0, 40).replace(/-$/, "")}`;
}

export function createWork(
  paths: CrewPaths,
  input: string,
  baseFiles?: Record<string, string>,
): WorkItem {
  const title = (input.split("\n").find((line) => line.trim()) ?? "untitled").trim().slice(0, 80);
  const at = nowIso();
  const work: WorkItem = {
    id: newWorkId(paths, title),
    title,
    input,
    type: "feature",
    route: "standard",
    routeReasons: ["not classified yet: standard by default"],
    riskAreas: [],
    phase: "receive",
    awaiting: null,
    criteria: [],
    approvals: [],
    skips: [],
    baseCommit: baseCommitOf(paths.root),
    ...(baseFiles && Object.keys(baseFiles).length > 0 ? { baseFiles } : {}),
    createdAt: at,
    updatedAt: at,
  };
  writeProtectedJson(paths, workJson(paths, work.id), work);
  writeText(
    join(workDir(paths, work.id), "brief.md"),
    `# Brief\n\n## Request\n\n${input.trim()}\n`,
  );
  const state = loadState(paths);
  state.active = work.id;
  saveState(paths, state);
  return work;
}

export function saveWork(paths: CrewPaths, work: WorkItem): void {
  work.updatedAt = nowIso();
  writeProtectedJson(paths, workJson(paths, work.id), work);
}

export function loadWork(
  paths: CrewPaths,
  id: string,
): { work: WorkItem | null; tampered: boolean } {
  const read = readProtectedJson<WorkItem>(paths, workJson(paths, id));
  return { work: read.data, tampered: read.tampered };
}

export function activeWork(paths: CrewPaths): { work: WorkItem | null; tampered: boolean } | null {
  const id = loadState(paths).active;
  if (!id || !existsSync(workJson(paths, id))) return null;
  return loadWork(paths, id);
}

/**
 * The first classification sets the route; a later one can only raise it, and risk areas only
 * accumulate, so calmer answers never undo a raise.
 */
export function applyClassification(work: WorkItem, type: WorkType, decision: RouteDecision): void {
  // An item still in receive has only the default route, which is not a decision to keep.
  const first = work.phase === "receive";
  work.type = type;
  if (first) {
    work.route = decision.route;
    work.routeReasons = [...decision.reasons];
    work.riskAreas = [...decision.riskAreas];
  } else {
    const route = higherRoute(work.route, decision.route);
    if (route !== work.route) {
      work.routeReasons.push(`raised to ${route}: ${decision.reasons.join("; ")}`);
    } else if (decision.route !== work.route) {
      work.routeReasons.push(
        `reclassified as ${decision.route}; kept ${work.route}: a route is never lowered`,
      );
    }
    work.route = route;
    work.riskAreas = [...new Set([...work.riskAreas, ...decision.riskAreas])];
  }
  if (work.phase === "receive") work.phase = "recognize";
}

export function raiseRoute(work: WorkItem, to: Route, reason: string): boolean {
  if (routeRank(to) <= routeRank(work.route)) return false;
  work.route = to;
  work.routeReasons.push(`raised to ${to}: ${reason}`);
  return true;
}

export function addCriterion(
  work: WorkItem,
  text: string,
  kind: CriterionKind = "behavior",
): Criterion {
  const criterion: Criterion = { id: `AC-${work.criteria.length + 1}`, kind, text: text.trim() };
  work.criteria.push(criterion);
  return criterion;
}

export function approve(work: WorkItem, what: "spec"): void {
  work.approvals.push({ what, at: nowIso() });
}

export function addSkip(work: WorkItem, step: string, reason: string): void {
  work.skips.push({ step, reason, at: nowIso() });
}

export function isSkipped(work: WorkItem, step: string): boolean {
  return work.skips.some((s) => s.step === step);
}

export function phaseIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase);
}

export function isBeforeBuild(work: WorkItem): boolean {
  return phaseIndex(work.phase) < phaseIndex("build");
}

export function hasAcceptanceSection(text: string): boolean {
  const match = /^#{1,6}\s*acceptance criteria\s*$/im.exec(text);
  if (!match) return false;
  const rest = text.slice(match.index + match[0].length);
  const body = rest.split(/^#{1,6}\s/m)[0] ?? "";
  return body.trim().length > 0;
}

export interface GuardContext {
  specText: string | null;
  planExists: boolean;
  evidence: Evidence | null;
  proven: boolean;
  unproven: string[];
}

// Shared with evidence.ts so both agree on what a complete test-first record is.
export function tddDone(record: TddRecord | undefined, kind: CriterionKind): boolean {
  if (!record) return false;
  return kind === "behavior" ? !!record.red && !!record.green : !!record.before && !!record.after;
}

/** What the current route asks for before code: checked again later, so a raise mid-build is felt. */
function routeDocuments(work: WorkItem, ctx: GuardContext): string[] {
  const missing: string[] = [];
  if (work.route !== "fast") {
    if (ctx.specText === null) missing.push("spec.md in the work folder");
    else if (!hasAcceptanceSection(ctx.specText)) {
      missing.push('an "Acceptance criteria" section with content in spec.md');
    }
  }
  if (work.route === "full") {
    if (!work.approvals.some((a) => a.what === "spec")) {
      missing.push("the user's approval of the spec (crew approve <id> spec)");
    }
    if (!ctx.planExists) missing.push("plan.md in the work folder");
  }
  return missing;
}

export function guardFor(work: WorkItem, next: Phase, ctx: GuardContext): string[] {
  const missing: string[] = [];
  if (next === "build") {
    if (work.criteria.length === 0) {
      missing.push('at least one acceptance criterion (crew criteria <id> add "...")');
    }
    missing.push(...routeDocuments(work, ctx));
  } else if (next === "gate") {
    missing.push(...routeDocuments(work, ctx));
    for (const criterion of work.criteria) {
      if (isSkipped(work, `tdd:${criterion.id}`)) continue;
      const record = ctx.evidence?.tdd.find((t) => t.criterion === criterion.id);
      if (!tddDone(record, criterion.kind)) {
        const how = criterion.kind === "behavior" ? "red/green" : "before/after";
        missing.push(`test-first record for ${criterion.id} (crew tdd ${how})`);
      }
    }
  } else if (next === "deliver") {
    missing.push(...routeDocuments(work, ctx));
    if (!ctx.proven) {
      const reasons = ctx.unproven.map((reason) => `not proven: ${reason}`);
      missing.push(...(reasons.length ? reasons : ["not proven: run crew gate run <id>"]));
    }
  }
  return missing;
}

export function nextPhaseOf(work: WorkItem): Phase | null {
  const phases = PHASES_BY_ROUTE[work.route];
  const index = phases.indexOf(work.phase);
  // A phase that the current route does not list (after a route change) resumes at the next listed one.
  const current =
    index === -1 ? phases.findIndex((p) => phaseIndex(p) > phaseIndex(work.phase)) - 1 : index;
  return phases[current + 1] ?? null;
}

export function advancePhase(
  work: WorkItem,
  ctx: GuardContext,
): { ok: true; phase: Phase } | { ok: false; missing: string[] } {
  const next = nextPhaseOf(work);
  if (!next) return { ok: false, missing: ["already at the last phase"] };
  const missing = guardFor(work, next, ctx);
  if (missing.length) return { ok: false, missing };
  work.phase = next;
  return { ok: true, phase: next };
}
