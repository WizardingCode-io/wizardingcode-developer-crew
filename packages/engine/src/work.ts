import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { RouteDecision } from "./classify.ts";
import { higherRoute, routeRank } from "./classify.ts";
import { tddDone } from "./criteria.ts";
import { baseCommitOf } from "./fingerprint.ts";
import { nowIso, writeText } from "./fs.ts";
import { blockingObjections } from "./objections.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { decisionCounts } from "./policy.ts";
import { loadState, saveState } from "./state.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type {
  Criterion,
  CriterionKind,
  Debate,
  Decision,
  Evidence,
  GapDecision,
  ObjectionLedger,
  Phase,
  Policy,
  RemovedCriterion,
  Route,
  ValidatorRule,
  WorkItem,
  WorkType,
} from "./types.ts";
import { PHASE_ORDER } from "./types.ts";

// The conclave sits between specify and plan (SP2 §6): the gap round happens before a plan exists.
const DELIBERATE: Phase[] = [
  "receive",
  "recognize",
  "understand",
  "specify",
  "conclave",
  "plan",
  "build",
  "gate",
  "deliver",
];
export const PHASES_BY_ROUTE: Record<Route, Phase[]> = {
  fast: ["receive", "recognize", "build", "gate", "deliver"],
  standard: [...DELIBERATE],
  full: [...DELIBERATE],
};

/** The four lists of the gap round, as headings of `conclave.md` (SP2 §6). */
export const CONCLAVE_SECTIONS = [
  "Assumed by good practice",
  "Decisions only the user can make",
  "Proposals",
  "Warnings",
] as const;

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
 * The checkout's items still being worked on, in id order: before deliver, and with no gate run
 * that proved them. An item in deliver, or proven and left in its gate phase, is no longer edited,
 * so it is not a neighbour another session could be working beside (finding 9). The verdict read
 * is the one recorded at the item's last gate run, so the check costs a file read per item.
 */
export function openItems(paths: CrewPaths, except?: string): WorkItem[] {
  let ids: string[] = [];
  try {
    ids = readdirSync(join(paths.crewDir, "work")).sort();
  } catch {
    return [];
  }
  const open: WorkItem[] = [];
  for (const id of ids) {
    if (id === except || !existsSync(workJson(paths, id))) continue;
    const { work } = loadWork(paths, id);
    if (!work || work.phase === "deliver") continue;
    const evidence = readProtectedJson<Evidence>(paths, join(workDir(paths, id), "evidence.json"));
    if (evidence.data?.verdict === "proven") continue;
    open.push(work);
  }
  return open;
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
  // A number is taken for good, by a present or a removed criterion, so an id names one thing.
  const taken = [...work.criteria, ...(work.removedCriteria ?? [])]
    .map((c) => Number(c.id.slice("AC-".length)))
    .filter((n) => Number.isFinite(n));
  const next = taken.length ? Math.max(...taken) + 1 : 1;
  const criterion: Criterion = { id: `AC-${next}`, kind, text: text.trim() };
  work.criteria.push(criterion);
  return criterion;
}

/**
 * Takes a criterion out while nothing names it. A test-first record or a skip is evidence about
 * that criterion, and evidence is never dropped; the removal itself stays in the record.
 */
export function removeCriterion(
  work: WorkItem,
  evidence: Evidence,
  id: string,
  ledger?: ObjectionLedger,
): { removed: RemovedCriterion } | { refused: string } {
  const index = work.criteria.findIndex((c) => c.id === id);
  if (index === -1) return { refused: `unknown criterion: ${id}` };
  // An objection bound to the criterion would be silently unresolved by the removal.
  const bound = ledger?.objections.find((o) => o.criterion === id && !o.waived);
  if (bound) return { refused: `${id} is bound to objection ${bound.id}; it stays` };
  if (evidence.tdd.some((t) => t.criterion === id)) {
    return { refused: `${id} has a test-first record; it stays` };
  }
  if (work.skips.some((s) => s.step === `tdd:${id}`)) {
    return { refused: `${id} has a skip; it stays` };
  }
  const [criterion] = work.criteria.splice(index, 1) as [Criterion];
  const removed: RemovedCriterion = { ...criterion, at: nowIso() };
  work.removedCriteria = [...(work.removedCriteria ?? []), removed];
  return { removed };
}

const USER: Decision = { by: "user" };

/** A decision only the user can make, found by the gap round; `D-n`, a number taken for good. */
export function addDecision(work: WorkItem, question: string, dflt?: string): GapDecision {
  const taken = (work.decisions ?? [])
    .map((d) => Number(d.id.slice("D-".length)))
    .filter(Number.isFinite);
  const next = taken.length ? Math.max(...taken) + 1 : 1;
  const decision: GapDecision = {
    id: `D-${next}`,
    question: question.trim(),
    ...(dflt?.trim() ? { default: dflt.trim() } : {}),
  };
  work.decisions = [...(work.decisions ?? []), decision];
  return decision;
}

/**
 * Records an answer. A person answers anything; the validator takes only the stated default, under
 * the rule that says so, and the record names it (SP2 §9).
 */
export function answerDecision(
  work: WorkItem,
  id: string,
  answer: string | undefined,
  decision: Decision,
): GapDecision | { refused: string } {
  const found = (work.decisions ?? []).find((d) => d.id === id);
  if (!found) return { refused: `unknown decision: ${id}` };
  if (decision.by === "validator") {
    // A recorded answer stands, whoever gave it; the validator fills a blank, never a decision.
    if (found.answer !== undefined) {
      const who = found.by === "validator" ? "the validator" : `the ${found.by ?? "user"}`;
      return {
        refused: `${id} is already answered by ${who}; the validator never overwrites an answer`,
      };
    }
    if (found.default === undefined) {
      return { refused: `${id} has no stated default; a person answers it` };
    }
    if (answer !== undefined && answer.trim() !== found.default) {
      return {
        refused: `the validator may only take the stated default of ${id} (${found.default})`,
      };
    }
  } else if (!answer?.trim()) {
    return { refused: `an answer is required: crew decide <id> ${id} "<answer>"` };
  }
  found.answer = (answer ?? found.default ?? "").trim();
  found.at = nowIso();
  found.by = decision.by;
  if (decision.mode) found.mode = decision.mode;
  else delete found.mode;
  if (decision.rule) found.rule = decision.rule;
  else delete found.rule;
  if (decision.relayed) found.relayed = true;
  else delete found.relayed;
  return found;
}

/** The decisions without an answer that counts: a person's always, the validator's or the agent's per the policy. */
export function unansweredDecisions(work: WorkItem, policy: Policy): GapDecision[] {
  return (work.decisions ?? []).filter((d) => d.answer === undefined || !decisionCounts(policy, d));
}

export type DebateState = "none" | "open" | "closed";

export function debateState(work: WorkItem): DebateState {
  if (!work.debate) return "none";
  return work.debate.closedAt ? "closed" : "open";
}

/** Opens the debate, once per item: a decision with consequences is the reason, never the route (SP2 §7). */
export function openDebate(work: WorkItem, reason: string): Debate | { refused: string } {
  const current = work.debate;
  if (current) {
    return {
      refused: current.closedAt
        ? "the debate is closed; it opens once per item"
        : `the debate is already open (${current.openedAt}): ${current.reason}`,
    };
  }
  if (!reason.trim())
    return { refused: "a debate opens for a reason: the decision with consequences" };
  work.debate = { openedAt: nowIso(), reason: reason.trim() };
  return work.debate;
}

/** Closes the debate once the judge has ruled, keeping what the round cost when known, so the eval can report it. */
export function closeDebate(work: WorkItem, tokens?: number): Debate | { refused: string } {
  const debate = work.debate;
  if (!debate) return { refused: 'no debate is open (crew debate <id> open --reason "<why>")' };
  if (debate.closedAt) return { refused: "the debate is already closed" };
  debate.closedAt = nowIso();
  if (tokens !== undefined) debate.tokens = tokens;
  return debate;
}

export function approve(work: WorkItem, what: "spec", decision: Decision = USER): void {
  work.approvals.push({ what, at: nowIso(), ...decision });
}

export function addSkip(
  work: WorkItem,
  step: string,
  reason: string,
  decision: Decision = USER,
): void {
  work.skips.push({ step, reason, at: nowIso(), ...decision });
}

/** A step is skipped when a skip for it counts: a person's always does, the agent's per the policy. */
export function isSkipped(work: WorkItem, step: string, policy: Policy): boolean {
  return work.skips.some((s) => s.step === step && decisionCounts(policy, s));
}

export function phaseIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase);
}

export function isBeforeBuild(work: WorkItem): boolean {
  return phaseIndex(work.phase) < phaseIndex("build");
}

/**
 * The content under each occurrence of a heading, up to the next heading of the same or a higher
 * level, with sub-heading lines taken out: a sub-heading with nothing under it is not content, what
 * is written under it is (SP2a review, finding I3).
 */
function sectionBodies(text: string, heading: string): string[] {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bodies: string[] = [];
  for (const match of text.matchAll(new RegExp(`^(#{1,6})\\s*${escaped}\\s*$`, "gim"))) {
    const level = (match[1] ?? "#").length;
    const rest = text.slice((match.index ?? 0) + match[0].length);
    const next = new RegExp(`^#{1,${level}}\\s`, "m").exec(rest);
    const body = next ? rest.slice(0, next.index) : rest;
    bodies.push(body.replace(/^#{1,6}\s.*$/gm, "").trim());
  }
  return bodies;
}

function hasSection(text: string, heading: string): boolean {
  return sectionBodies(text, heading).some((body) => body.length > 0);
}

export function hasAcceptanceSection(text: string): boolean {
  return hasSection(text, "acceptance criteria");
}

/** The sections of the gap round that are absent or empty; "none" under a heading is content. */
export function missingConclaveSections(text: string): string[] {
  return CONCLAVE_SECTIONS.filter((name) => !hasSection(text, name));
}

export interface GuardContext {
  specText: string | null;
  conclaveText: string | null;
  ledger: ObjectionLedger | null;
  planExists: boolean;
  evidence: Evidence | null;
  proven: boolean;
  unproven: string[];
  policy: Policy;
}

// Shared with evidence.ts and objections.ts so all agree on what a complete test-first record is.
export { tddDone } from "./criteria.ts";

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
    const approvals = work.approvals.filter((a) => a.what === "spec");
    if (!approvals.some((a) => decisionCounts(ctx.policy, a))) {
      const uncounted = approvals.find((a) => a.by && a.by !== "user");
      missing.push(
        uncounted
          ? `the user's approval of the spec: recorded by the ${uncounted.by} in ${uncounted.mode} mode and not counted (a person runs crew approve <id> spec, or policy.json sets unattendedDecisions to "${uncounted.by === "validator" ? "validator" : "count"}")`
          : "the user's approval of the spec (crew approve <id> spec)",
      );
    }
    if (!ctx.planExists) missing.push("plan.md in the work folder");
  }
  return missing;
}

/** The gap round's record, asked for once, on the way into Plan (SP2 §6). */
function conclaveDocument(work: WorkItem, ctx: GuardContext): string[] {
  if (work.route === "fast") return [];
  if (ctx.conclaveText === null) {
    return ["conclave.md in the work folder (the gap round: four sections)"];
  }
  return missingConclaveSections(ctx.conclaveText).map(
    (name) =>
      `a "${name}" section with content in conclave.md (write "none" when there is nothing)`,
  );
}

/**
 * What must hold before the validator may take a decision under a rule (SP2 §9). The engine checks
 * the mechanical part; the role that reads the documents is SP2b's. `stated-default` is checked
 * where the decision is answered.
 */
export function validatorPreconditions(
  rule: ValidatorRule,
  work: WorkItem,
  ctx: GuardContext,
): string[] {
  if (rule !== "complete-gap-round") return [];
  const missing = conclaveDocument(work, ctx);
  for (const d of work.decisions ?? []) {
    const answered = d.answer !== undefined && decisionCounts(ctx.policy, d);
    if (!answered && d.default === undefined)
      missing.push(`a stated default or an answer for ${d.id}`);
  }
  if (ctx.ledger) {
    for (const o of blockingObjections(ctx.ledger, work, ctx.evidence, ctx.policy, ["open"]))
      missing.push(`blocking objection ${o.id} bound to a criterion or waived by a person`);
  }
  return missing;
}

export function guardFor(work: WorkItem, next: Phase, ctx: GuardContext): string[] {
  const missing: string[] = [];
  if (next === "plan") {
    missing.push(...conclaveDocument(work, ctx));
    for (const d of unansweredDecisions(work, ctx.policy))
      missing.push(`an answer to ${d.id} (crew decide <id> ${d.id} "<answer>")`);
    if (ctx.ledger) {
      for (const o of blockingObjections(ctx.ledger, work, ctx.evidence, ctx.policy, ["open"]))
        missing.push(
          `a criterion bound to blocking objection ${o.id}, or the user's waiver (crew objection <id> resolve ${o.id} --criterion AC-k | waive ${o.id} --reason "<why>")`,
        );
    }
    // The judge's ruling comes before the plan: an open debate is a decision still being taken (SP2 §7).
    if (debateState(work) === "open")
      missing.push(
        `the debate is open (${work.debate?.reason ?? ""}); close it with the judge's ruling (crew debate <id> close [--tokens n])`,
      );
  } else if (next === "build") {
    if (work.criteria.length === 0) {
      missing.push('at least one acceptance criterion (crew criteria <id> add "...")');
    }
    missing.push(...routeDocuments(work, ctx));
  } else if (next === "gate") {
    missing.push(...routeDocuments(work, ctx));
    for (const criterion of work.criteria) {
      if (isSkipped(work, `tdd:${criterion.id}`, ctx.policy)) continue;
      const record = ctx.evidence?.tdd.find((t) => t.criterion === criterion.id);
      if (!tddDone(record, criterion.kind)) {
        const how =
          criterion.kind === "behavior"
            ? "red/green"
            : criterion.kind === "preserve"
              ? "before/after"
              : "observed --reason";
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

/** ", waiting for the user" / ", waiting for the roles" / ", waiting for a reply to M-…" / "" (SP2c §9). */
export function waitingText(work: WorkItem): string {
  if (work.awaiting === "user") return ", waiting for the user";
  if (work.awaiting === "role") return ", waiting for the roles";
  if (work.awaiting === "mail")
    return `, waiting for a reply to ${work.awaitingMessage ?? "a message"}`;
  return "";
}
