import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { RouteDecision } from "./classify.ts";
import { higherRoute, routeRank } from "./classify.ts";
import { tddDone } from "./criteria.ts";
import { baseCommitOf } from "./fingerprint.ts";
import { nowIso, writeText } from "./fs.ts";
import { escapeRegExp } from "./glob.ts";
import { withLock } from "./lock.ts";
import { blockingObjections } from "./objections.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { decisionCounts, disputedDefault, disputedDefaultText } from "./policy.ts";
import { sourceLine, sourceText } from "./source.ts";
import { loadState, updateState } from "./state.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import { checkStrategy, RESEARCHER_FIRST, strategyHash, verdictText } from "./strategy.ts";
import type {
  Criterion,
  CriterionKind,
  Debate,
  Decision,
  Evidence,
  GapDecision,
  ObjectionLedger,
  Phase,
  PlannedStrategyJudgement,
  Policy,
  RemovedCriterion,
  Route,
  Screen,
  Source,
  ValidatorRule,
  WorkItem,
  WorkKind,
  WorkType,
} from "./types.ts";
import { PHASE_ORDER } from "./types.ts";
import { leadsMissing } from "./validation.ts";

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
  "learn",
];
export const PHASES_BY_ROUTE: Record<Route, Phase[]> = {
  fast: ["receive", "recognize", "build", "gate", "deliver", "learn"],
  standard: [...DELIBERATE],
  full: [...DELIBERATE],
};

/**
 * The phases of an item (SP7 §7.1): its route's list with its kind's phases inserted, `analyse`
 * after `recognize` for an issue on every route. A record without a kind (before 0.8.0) is a feature.
 */
export function phasesFor(work: Pick<WorkItem, "route" | "kind">): Phase[] {
  const base = PHASES_BY_ROUTE[work.route];
  const kind = kindOfItem(work);
  // An audit has its own four phases on every route (SP7 §7.5): nothing is built, the report is proven.
  if (kind === "audit") return ["receive", "recognize", "audit", "deliver"];
  if (kind === "issue") {
    const at = base.indexOf("recognize") + 1;
    return [...base.slice(0, at), "analyse", ...base.slice(at)];
  }
  // A new project's strategy comes before its spec (SP7 §7.3); a new project is never fast.
  if (kind === "new-project") {
    const at = base.indexOf("specify");
    if (at !== -1) return [...base.slice(0, at), "strategy", ...base.slice(at)];
  }
  return [...base];
}

/**
 * The strategy's judgement gate (SP7 §7.3, SP8 Task 3): planned for an item whose phases include
 * strategy and kept apart from the gates the gate run plans over the code; on the full route the
 * CTO reviews and the judge rules, on standard the judge rules from the files alone.
 */
export function plannedStrategyJudgement(
  work: Pick<WorkItem, "route" | "kind">,
): PlannedStrategyJudgement[] {
  if (!phasesFor(work).includes("strategy")) return [];
  return work.route === "full"
    ? [
        {
          gate: "strategy",
          reviewer: "cto",
          reason: "new project, full route: the CTO reviews, the judge rules",
        },
      ]
    : [
        {
          gate: "strategy",
          reviewer: "judge",
          reason: "new project, standard route: the judge rules from the files",
        },
      ];
}

/** The floors a kind sets on the route (SP7 §7.1, §7.5): a new project is never fast, an audit is always full. */
function kindFloor(work: WorkItem): void {
  if (work.kind === "new-project" && work.route === "fast") {
    work.route = "standard";
    work.routeReasons.push("kind new-project is never fast");
  }
  if (work.kind === "audit" && work.route !== "full") {
    work.route = "full";
    work.routeReasons.push("kind audit is always full");
  }
}

/** The kinds a feature arrives as, by its channel: the only ones a strategy may be raised from (SP8). */
const RAISABLE: readonly WorkKind[] = ["feature", "client-request", "cross-project"];
const RAISE_PHASES: readonly Phase[] = ["understand", "specify", "conclave"];

/**
 * A feature raised to a new project while its spec is still open (SP7 §7.3, SP8 decision 2): the
 * kind and its reason recorded, the standard floor applied, and the phase set back to `strategy`
 * from specify or conclave (the files stay; no approval exists yet, since the spec's approval is
 * the guard into plan). From plan on the raise is refused, and so is any other kind: an issue, a
 * new project already, an audit (never lowered).
 */
export function raiseKind(
  work: WorkItem,
  reason: string,
): { ok: true; movedTo: Phase | null } | { ok: false; reason: string } {
  if (!RAISABLE.includes(kindOfItem(work)))
    return {
      ok: false,
      reason: `only a feature is raised to a strategy: this item is ${kindLabel(work)}`,
    };
  if (phaseIndex(work.phase) >= phaseIndex("plan"))
    return { ok: false, reason: "a strategy comes before the plan; from plan on, a new item" };
  if (!RAISE_PHASES.includes(work.phase))
    return {
      ok: false,
      reason: `a feature is raised to a strategy from understand, specify or conclave, not ${work.phase}`,
    };
  work.kind = "new-project";
  work.kindFrom = `raised: ${reason}`;
  work.routeReasons.push(`kind raised to new-project: ${reason}`);
  kindFloor(work);
  if (work.phase === "understand") return { ok: true, movedTo: null };
  work.phase = "strategy";
  work.phaseAt = { ...(work.phaseAt ?? {}), strategy: nowIso() };
  return { ok: true, movedTo: "strategy" };
}

/** The kind a record carries; one written before 0.8.0 has none and is a feature. */
export function kindOfItem(work: Pick<WorkItem, "kind">): WorkKind {
  return work.kind ?? "feature";
}

/** `kind issue (from work_type fix)`: the kind and its derivation, as the start and the classify commands print them. */
export function kindLabel(work: Pick<WorkItem, "kind" | "kindFrom">): string {
  return `kind ${kindOfItem(work)} (from ${work.kindFrom ?? "default"})`;
}

/** The three sections of an issue's analysis, as headings of `analysis.md` (SP7 §7.4). */
export const ANALYSIS_SECTIONS = ["Origin", "Cause", "Blast radius"] as const;

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
  source?: Source,
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
    ...(source ? { source } : {}),
    createdAt: at,
    updatedAt: at,
  };
  writeProtectedJson(paths, workJson(paths, work.id), work);
  // The brief quotes the original text verbatim under its source (SP7 §10.1): the document whole,
  // or the request's text for a ticket; a document that cannot be read now says so in its place.
  let sourceSection = "";
  if (source) {
    const body = sourceText(source, paths.root, input);
    const text = typeof body === "string" ? body : body.refused;
    const proposed = source.proposedPriority
      ? `, proposed priority ${source.proposedPriority}`
      : "";
    sourceSection = `\n## Source\n\n${sourceLine(source)}${proposed}\n\n${text.endsWith("\n") ? text : `${text}\n`}`;
  }
  writeText(
    join(workDir(paths, work.id), "brief.md"),
    `# Brief\n\n## Request\n\n${input.trim()}\n${sourceSection}`,
  );
  // Under the lock every writer of the state takes, so a notice a role's stop leaves meanwhile stays.
  updateState(paths, (state) => {
    state.active = work.id;
  });
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

/**
 * A command's changes put onto the record as it stands (finding 186): every top-level field whose
 * value differs between `inHand` (the copy the command changed) and `loaded` (that copy as the
 * command read it), compared as JSON, is written onto `record`; a field the command removed is
 * deleted from it; a field the command left alone keeps the record's own value, so what another
 * command wrote meanwhile survives.
 */
export function applyChangedFields(record: WorkItem, inHand: WorkItem, loaded: WorkItem): void {
  const target = asRecord(record);
  const now = asRecord(inHand);
  const then = asRecord(loaded);
  for (const key of new Set([...Object.keys(now), ...Object.keys(then)])) {
    const value = JSON.stringify(now[key]);
    if (value === JSON.stringify(then[key])) continue;
    if (value === undefined) delete target[key];
    else target[key] = now[key];
  }
}

/** A work item read as a plain record, key by key, for the two merges above (2026-10-28-001 AC-5): the same object, typed for its keys. */
export function asRecord(work: WorkItem): Record<string, unknown> {
  return work as unknown as Record<string, unknown>;
}

/**
 * The copy in hand becomes the record (finding 186): every key of `inHand` is replaced by `record`'s
 * and a key the record lacks is removed, so a caller's later reads of the copy it holds see what the
 * file holds after a save.
 */
export function adoptRecord(inHand: WorkItem, record: WorkItem): void {
  const target = asRecord(inHand);
  const source = asRecord(record);
  for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
  Object.assign(target, source);
}

/**
 * The runtime a hook observed the active item under (SP6 Task 4): written once per name, under the
 * work folder's lock so a parallel role's record is never raced; a name already present writes
 * nothing. Returns whether the item changed.
 */
export function noteRuntime(paths: CrewPaths, id: string, runtime: string): boolean {
  return withLock(
    workDir(paths, id),
    () => {
      const { work, tampered } = loadWork(paths, id);
      if (!work || tampered || work.runtimes?.includes(runtime)) return false;
      work.runtimes = [...(work.runtimes ?? []), runtime];
      saveWork(paths, work);
      return true;
    },
    { what: "work folder" },
  );
}

export function activeWork(paths: CrewPaths): { work: WorkItem | null; tampered: boolean } | null {
  const id = loadState(paths).active;
  if (!id || !existsSync(workJson(paths, id))) return null;
  const item = loadWork(paths, id);
  // An abandoned item is nobody's work (finding 124): the Stop rule and the status see no item.
  return item.work?.abandoned ? null : item;
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
    if (!work || work.abandoned || work.phase === "deliver" || work.phase === "learn") continue;
    const evidence = readProtectedJson<Evidence>(paths, join(workDir(paths, id), "evidence.json"));
    if (evidence.data?.verdict === "proven") continue;
    open.push(work);
  }
  return open;
}

/**
 * The checkout's most recently learned item (latest `learned.at`), with the fingerprint its last
 * gate run proved, as `crew learn` reads it (finding 138): null when no item learned, and a null
 * fingerprint when that run's record is tampered or did not prove (finding 141).
 */
export function lastLearned(
  paths: CrewPaths,
): { work: WorkItem; fingerprint: string | null } | null {
  let ids: string[] = [];
  try {
    ids = readdirSync(join(paths.crewDir, "work"));
  } catch {
    return null;
  }
  let latest: WorkItem | null = null;
  for (const id of ids) {
    if (!existsSync(workJson(paths, id))) continue;
    const { work, tampered } = loadWork(paths, id);
    if (!work?.learned || tampered || work.abandoned) continue;
    if (!latest || (latest.learned?.at ?? "") < work.learned.at) latest = work;
  }
  if (!latest) return null;
  const evidence = readProtectedJson<Evidence>(
    paths,
    join(workDir(paths, latest.id), "evidence.json"),
  );
  const proven = !evidence.tampered && evidence.data?.verdict === "proven";
  return { work: latest, fingerprint: proven ? (evidence.data?.fingerprint ?? null) : null };
}

/**
 * The first classification sets the route; a later one can only raise it, and risk areas only
 * accumulate, so calmer answers never undo a raise.
 */
export function applyClassification(
  work: WorkItem,
  type: WorkType,
  decision: RouteDecision,
  kind?: { kind: WorkKind; from: string },
): void {
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
  // The kind (SP7 §7.1): recorded with where it came from; an issue or a new project is never taken
  // away by a reclassification (rule 11), as the route is never lowered; a new project is never fast.
  if (kind) {
    const kept = work.kind === "issue" || work.kind === "new-project";
    if (kept && kind.kind !== work.kind) {
      work.routeReasons.push(`kept kind ${work.kind}: a kind is never lowered`);
    } else {
      work.kind = kind.kind;
      work.kindFrom = kind.from;
    }
  }
  kindFloor(work);
  if (work.phase === "receive") work.phase = "recognize";
}

export function raiseRoute(work: WorkItem, to: Route, reason: string): boolean {
  if (routeRank(to) <= routeRank(work.route)) return false;
  work.route = to;
  work.routeReasons.push(`raised to ${to}: ${reason}`);
  return true;
}

/** The most parts a request is split into (finding 61). */
export const MAX_PARTS = 10;
/** The longest a part's text may be, so a part reads as one line of the status and the report. */
export const MAX_PART_LENGTH = 200;

/**
 * The parts of `crew start --part` (finding 61), or why they cannot be stored: each trimmed is one
 * line of at most 200 characters with no control character, none repeats another
 * (case-insensitive), at most ten; two or more are P-1..P-n, one part is the item itself, so none.
 */
export function parseParts(
  texts: readonly string[],
): { parts: { id: string; text: string }[] | undefined } | { problem: string } {
  if (texts.length > MAX_PARTS) return { problem: `at most ${MAX_PARTS} parts` };
  const trimmed = texts.map((t) => t.trim());
  const seen = new Set<string>();
  for (const text of trimmed) {
    if (!text) return { problem: "a part needs text" };
    if (text.length > MAX_PART_LENGTH)
      return { problem: `a part is at most ${MAX_PART_LENGTH} characters` };
    // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what is refused
    if (/[\u0000-\u001f\u007f]/.test(text))
      return { problem: "a part is one line with no control character" };
    const key = text.toLowerCase();
    if (seen.has(key)) return { problem: `a part repeats another: ${key}` };
    seen.add(key);
  }
  if (trimmed.length < 2) return { parts: undefined };
  return { parts: trimmed.map((text, n) => ({ id: `P-${n + 1}`, text })) };
}

export function addCriterion(
  work: WorkItem,
  text: string,
  kind: CriterionKind = "behavior",
  contract?: Criterion["contract"],
  screens?: Screen[],
): Criterion {
  // A number is taken for good, by a present or a removed criterion, so an id names one thing.
  const taken = [...work.criteria, ...(work.removedCriteria ?? [])]
    .map((c) => Number(c.id.slice("AC-".length)))
    .filter((n) => Number.isFinite(n));
  const next = taken.length ? Math.max(...taken) + 1 : 1;
  const criterion: Criterion = {
    id: `AC-${next}`,
    kind,
    text: text.trim(),
    ...(contract ? { contract } : {}),
    ...(screens?.length ? { screens } : {}),
  };
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
  // A superseded criterion and its replacement are read together (finding 118's list): neither goes.
  const target = work.criteria[index] as Criterion;
  if (target.supersededBy)
    return { refused: `${id} is superseded by ${target.supersededBy.id}; it stays` };
  const replaced = work.criteria.find((c) => c.supersededBy?.id === id);
  if (replaced) return { refused: `${id} supersedes ${replaced.id}; it stays` };
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

/** How much a criterion's proof shows: a behaviour's red and green, a preservation's before and after, an observation's pass with a reason. */
const PROOF_RANK: Record<CriterionKind, number> = { behavior: 2, preserve: 1, observed: 0 };

/**
 * Records that a criterion's text was replaced by another's (finding 118's list, the hardening item
 * 2026-10-21-010): the old one keeps its id, its text and its records and is read through the new
 * one. Refused where the replacement would prove less than the old (the kinds' rank), where an
 * objection still rests on the old one (bind it to the new one first, as `removeCriterion` keeps),
 * where either is already superseded, and on the same id.
 */
export function supersedeCriterion(
  work: WorkItem,
  from: string,
  by: string,
  ledger?: ObjectionLedger,
): { criterion: Criterion; at: string } | { refused: string } {
  const old = work.criteria.find((c) => c.id === from);
  if (!old) return { refused: `unknown criterion: ${from}` };
  const replacement = work.criteria.find((c) => c.id === by);
  if (!replacement) return { refused: `unknown criterion: ${by}` };
  if (from === by) return { refused: `${from} cannot supersede itself` };
  if (old.supersededBy)
    return { refused: `${from} is already superseded by ${old.supersededBy.id}` };
  if (replacement.supersededBy)
    return {
      refused: `${by} is superseded by ${replacement.supersededBy.id}: supersede by ${replacement.supersededBy.id} instead`,
    };
  const bound = ledger?.objections.find((o) => o.criterion === from && !o.waived);
  if (bound) return { refused: `${bound.id} is bound to ${from}: resolve it against ${by} first` };
  if (PROOF_RANK[replacement.kind] < PROOF_RANK[old.kind])
    return {
      refused: `${by} (${replacement.kind}) cannot replace ${from} (${old.kind}): a replacement proves at least as much`,
    };
  const at = nowIso();
  old.supersededBy = { id: by, at };
  return { criterion: old, at };
}

/** The criterion whose proof stands for `id`: the last of its supersede chain, or itself. */
export function currentCriterion(work: WorkItem, criterion: Criterion): Criterion {
  let current = criterion;
  // The engine's writers never leave a cycle or a dangling replacement (`supersedeCriterion` and
  // `removeCriterion` refuse both); `seen` and the fallback guard a hand-edited record on the read side.
  const seen = new Set<string>();
  while (current.supersededBy && !seen.has(current.id)) {
    seen.add(current.id);
    current = work.criteria.find((c) => c.id === current.supersededBy?.id) ?? current;
  }
  return current;
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
 * the rule that says so, and the record names it (SP2 §9); a default Jev disputed (2026-10-28-004,
 * D-3) is refused to the validator with `disputed`, the one refusal the caller makes the item wait
 * for a person on. Every refusal leaves the record as it was.
 */
export function answerDecision(
  work: WorkItem,
  id: string,
  answer: string | undefined,
  decision: Decision,
  policy: Policy,
): GapDecision | { refused: string; disputed?: true } {
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
    const conservative = found.jev?.conservative;
    if (typeof conservative === "number" && disputedDefault(found.jev, policy)) {
      return {
        refused: `${disputedDefaultText(conservative, `the default of ${id}`)}; a person decides`,
        disputed: true,
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

export function approve(work: WorkItem, what: "spec" | "audit", decision: Decision = USER): void {
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
  const escaped = escapeRegExp(heading);
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

/** The sections of an issue's analysis that are absent or empty, read as the conclave's are (SP7 §7.4). */
export function missingAnalysisSections(text: string): string[] {
  return ANALYSIS_SECTIONS.filter((name) => !hasSection(text, name));
}

/** A known root cause as the guard out of analyse reads it (SP4 Task 5): contradicted when this item disputed it on record. */
export interface KnownCause {
  id: string;
  title: string;
  paths: string[];
  contradicted: boolean;
}

export interface GuardContext {
  specText: string | null;
  /** `strategy.md` of the work folder, or null without one (a new project's strategy phase, SP7 §7.3). */
  strategyText: string | null;
  /** `conclave/researcher.md`, the facts a strategy's marks name, or null without one. */
  researcherText: string | null;
  /** `analysis.md` of the work folder, or null without one (an issue's analyse phase, SP7 §7.4). */
  analysisText: string | null;
  /** Whether `analysis/origin.json` exists in the work folder (`crew analyse`, SP3 Task 5). */
  originRecorded: boolean;
  /** The origin's known root causes the base still holds (SP4 Task 5, rule 17). */
  knownRootCauses: KnownCause[];
  /** Whether the root is a git repository: the origin is asked for only where git can give it. */
  gitRepository: boolean;
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
  // An audit has no spec and no plan: its report is the document (SP7 §7.5).
  if (kindOfItem(work) === "audit") return missing;
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

/** The line Plan and the validator name until the gap round recorded a read (SP9 Task 13, finding 194). */
const MISSING_CHECKLIST_READ =
  "a checklist read for the gap round (crew pack files checklists <kind>: the core's checklist of that kind and the packs'; crew pack files checklists none --reason \"<why>\" when no kind applies)";

/** The gap round's record, asked for once, on the way into Plan (SP2 §6): the document's four sections and a checklist read, named together so a session learns both at once. */
function conclaveDocument(work: WorkItem, ctx: GuardContext): string[] {
  if (work.route === "fast") return [];
  const missing =
    ctx.conclaveText === null
      ? ["conclave.md in the work folder (the gap round: four sections)"]
      : missingConclaveSections(ctx.conclaveText).map(
          (name) =>
            `a "${name}" section with content in conclave.md (write "none" when there is nothing)`,
        );
  // The gap round reads the checklists, not the request alone (SP9 Task 13, finding 194): a kind
  // served by crew pack files checklists, or none with its reason, recorded on the item.
  if (!work.checklists?.length) missing.push(MISSING_CHECKLIST_READ);
  return missing;
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
  // Out of analyse (SP7 §7.4): the document with its three sections, and the origin the engine
  // records from git where there is git.
  if (work.phase === "analyse") {
    for (const name of missingAnalysisSections(ctx.analysisText ?? ""))
      missing.push(
        `${/^[aeiou]/i.test(name) ? "an" : "a"} "${name}" section with content in analysis.md (write "none" when there is nothing)`,
      );
    if (ctx.gitRepository && !ctx.originRecorded)
      missing.push("analysis/origin.json in the work folder (crew analyse <id> --paths <files>)");
    // Rule 17 (SP4 Task 5): a root cause the base holds on the origin's paths is cited in the
    // document with what this fix does differently, or contradicted on record by this item.
    for (const k of ctx.knownRootCauses)
      if (!k.contradicted && !(ctx.analysisText ?? "").includes(`[K:${k.id}]`))
        missing.push(
          `${k.id} is a known root cause of ${k.paths.join(", ")} ("${k.title}"): cite it in analysis.md as [K:${k.id}] with what this fix does differently, or crew knowledge contradict ${k.id} --reason "<why>" --item ${work.id}`,
        );
  }
  // Out of strategy (SP7 §7.3): the research first, then the document's shape and marks, then a
  // proven ruling with gate strategy on the hash of the two files as they are now; no ruling of
  // another gate counts, and an edit after the ruling makes it stale.
  if (work.phase === "strategy") {
    if (ctx.researcherText === null) missing.push(RESEARCHER_FIRST);
    else if (ctx.strategyText === null) missing.push("strategy.md in the work folder");
    else {
      missing.push(
        ...checkStrategy(ctx.strategyText, ctx.researcherText, work.knowledge?.listed ?? []).map(
          (f) => `strategy.md: ${f}`,
        ),
      );
      const hash = strategyHash(ctx.strategyText, ctx.researcherText);
      const record = ctx.evidence?.judgement?.find((j) => j.gate === "strategy");
      if (!record)
        missing.push(
          "a proven strategy ruling (crew strategy <id> check, the reviewer and the judge, crew judgement <id> record --ruling <file>)",
        );
      else if (record.fingerprint !== hash)
        missing.push(
          "the strategy ruling is stale: strategy.md or conclave/researcher.md changed after it; check and judge again",
        );
      else if (record.verdict !== "proven")
        missing.push(
          `the strategy ruling is ${verdictText(record.verdict)} (${record.findings.length} findings)`,
        );
    }
  }
  if (next === "deliver" && kindOfItem(work) === "audit") {
    // An audit is proven by its three records alone (SP7 §7.5): no spec, no gate run, no leads.
    missing.push(...ctx.unproven.map((reason) => `not proven: ${reason}`));
    return missing;
  }
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
    // The mandatory teams' leads validate the spec before the plan (SP7 §6.4).
    missing.push(...leadsMissing(work, ctx, "spec"));
  } else if (next === "build") {
    if (work.criteria.length === 0) {
      missing.push('at least one acceptance criterion (crew criteria <id> add "...")');
    }
    missing.push(...routeDocuments(work, ctx));
    // A fix never creates (rule 11): the regression test and what stays green, before any code.
    if (kindOfItem(work) === "issue") {
      if (!work.criteria.some((c) => c.kind === "behavior"))
        missing.push(
          'an issue needs a regression test: at least one behavior criterion (crew criteria <id> add "<text>")',
        );
      if (!work.criteria.some((c) => c.kind === "preserve"))
        missing.push(
          'an issue keeps what works: at least one preserve criterion (crew criteria <id> add "<text>" --kind preserve)',
        );
    }
  } else if (next === "gate") {
    missing.push(...routeDocuments(work, ctx));
    for (const criterion of work.criteria) {
      // A superseded criterion is proven through its replacement, which the loop reads in its own
      // turn, as the verdict does (finding 135).
      if (criterion.supersededBy) continue;
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
    // The leads validate the delivery against the evidence the report vouches for (SP7 §6.4).
    missing.push(...leadsMissing(work, ctx, "delivery"));
  } else if (next === "learn") {
    // The proof as it stands now is the ticket into the base (SP4 Task 4, the security lead's
    // return): a verdict taken on earlier code learns nothing until the gates run again.
    if (!ctx.proven)
      missing.push(`not proven: the proof is on earlier code (crew gate run ${work.id})`);
  }
  return missing;
}

export function nextPhaseOf(work: WorkItem): Phase | null {
  const phases = phasesFor(work);
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
  // When the phase was entered: the minutes per phase of `crew metrics` read these stamps (SP7 §6.5).
  work.phaseAt = { ...(work.phaseAt ?? {}), [next]: nowIso() };
  return { ok: true, phase: next };
}

/** ", waiting for the user" / ", waiting for the roles" / ", waiting for a reply to M-…" / "" (SP2c §9). */
export function waitingText(work: WorkItem): string {
  const phrase = waitingPhrase(work);
  return phrase ? `, ${phrase}` : "";
}

/** "waiting for the user" / "waiting for the roles" / "waiting for a reply to M-…" / null: the wait as a phrase of its own. */
export function waitingPhrase(work: WorkItem): string | null {
  if (work.awaiting === "user") return "waiting for the user";
  if (work.awaiting === "role") return "waiting for the roles";
  if (work.awaiting === "mail")
    return `waiting for a reply to ${work.awaitingMessage ?? "a message"}`;
  return null;
}
