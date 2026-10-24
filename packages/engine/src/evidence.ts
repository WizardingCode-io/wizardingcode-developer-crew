import { join } from "node:path";
import { type Origin, type OriginItem, rolesAndTasks } from "./analysis.ts";
import { UNAVAILABLE } from "./fingerprint.ts";
import { two } from "./jev.ts";
import { LockBusy, withLock } from "./lock.ts";
import { decidedPriority, mailStatus, readContracts, threadOf } from "./mail-status.ts";
import { blockingObjections, objectionStatus } from "./objections.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { decisionCounts } from "./policy.ts";
import { triageSummary } from "./priorities.ts";
import { questionChannelsCell } from "./questions.ts";
import { guaranteeLines, runtimeOf } from "./runtimes.ts";
import { sourceLine } from "./source.ts";
import { oneLine } from "./state.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import {
  RESEARCH_AND_BASE,
  STRATEGY_SECTIONS,
  type StrategyReport,
  verdictText,
} from "./strategy.ts";
import type {
  CriterionKind,
  DecidedBy,
  Evidence,
  FindingVerification,
  GateName,
  GateRun,
  Mailbox,
  ObjectionLedger,
  PermissionMode,
  PlannedJudgement,
  Policy,
  Stack,
  ValidatorRule,
  WorkItem,
} from "./types.ts";
import { partyLabel } from "./types.ts";
import { currentCriterion, isSkipped, kindOfItem, tddDone } from "./work.ts";

type Decided = {
  by?: DecidedBy;
  mode?: PermissionMode;
  rule?: ValidatorRule;
  relayed?: boolean;
};

/** A table cell from text a person typed: one line, its pipes escaped (finding 86). */
function cell(text: string): string {
  return oneLine(text).replace(/\|/g, "\\|");
}

/**
 * "by the user", "by the user, relayed by the agent", "by the agent in <mode> mode" or "by the
 * validator (rule: <rule>)": the record says who decided, never less, never "by the user" for a
 * decision a person did not take, and never a prompt where the agent relayed a yes (ADR 0005).
 */
export function decidedBy(decision: Decided): string {
  return `by ${whoDecides(decision)}`;
}

/** Who took a decision, as the register names them: `decidedBy`'s name without its "by ". */
export function whoDecides(decision: Decided): string {
  if (decision.by === "validator") return `the validator (rule: ${decision.rule ?? "unnamed"})`;
  if (decision.by === "agent") return `the agent in ${decision.mode} mode`;
  return decision.relayed ? "the user, relayed by the agent" : "the user";
}

/** `verified by Jev (0.93)`, `disputed by Jev (0.95)`, `unverified: <reason>`: a finding's mark as the report and the record command say it. */
export function markText(v: FindingVerification): string {
  if (v.status === "unverified")
    return `unverified: ${(v.reason ?? "no reason").replace(/\|/g, "\\|")}`;
  return `${v.status} by Jev${v.confidence !== undefined ? ` (${two(v.confidence)})` : ""}`;
}

/** An answer as the Verifications table shows it: `yes 0.93` or `no 0.97` for a noul, `<choice> 0.95`, `score <k> 0.86` for the highest level. */
export function answerText(answer: unknown): string {
  if (typeof answer !== "object" || answer === null) return "-";
  const a = answer as {
    type?: unknown;
    noul?: unknown;
    choice?: unknown;
    confidence?: unknown;
    probabilities?: Record<string, number>;
  };
  if (a.type === "noul" && typeof a.noul === "number")
    return a.noul >= 0.5 ? `yes ${two(a.noul)}` : `no ${two(1 - a.noul)}`;
  const confidence = typeof a.confidence === "number" ? two(a.confidence) : "-";
  if (a.type === "choice" && typeof a.choice === "string") return `${a.choice} ${confidence}`;
  if (a.type === "score" && a.probabilities) {
    const top = Object.entries(a.probabilities).sort(([, x], [, y]) => y - x)[0];
    return `score ${top ? top[0] : "-"} ${confidence}`;
  }
  return "-";
}

/** What a decision not taken by a person is worth under the policy; a person's needs no note. */
export function countedNote(policy: Policy, decision: Decided): string {
  if (!decision.by || decision.by === "user") return "";
  // A rule the validator applied with a person present: the person was there to object.
  if (decision.by === "validator" && decision.mode === undefined)
    return ": counted, a person was present";
  return decisionCounts(policy, decision)
    ? ": counted by policy"
    : ": not counted, the policy waits for a person";
}

export function emptyEvidence(): Evidence {
  return {
    fingerprint: null,
    tdd: [],
    runs: [],
    verdict: "unproven",
    unproven: ["gates have not run"],
  };
}

function evidencePath(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "evidence.json");
}

export function loadEvidence(
  paths: CrewPaths,
  id: string,
): { evidence: Evidence; tampered: boolean } {
  const read = readProtectedJson<Evidence>(paths, evidencePath(paths, id));
  return { evidence: read.data ?? emptyEvidence(), tampered: read.tampered };
}

export function saveEvidence(paths: CrewPaths, id: string, evidence: Evidence): void {
  writeProtectedJson(paths, evidencePath(paths, id), evidence);
}

/**
 * One record into the evidence as it stands at the save (finding 81): under the work folder's
 * lock the file is read again, `apply` writes its record into that copy, and the merge is saved,
 * so a command that ran for minutes and one that ran beside it lose nothing. Refused, nothing
 * applied and nothing saved, when the fresh read is tampered (a file edited outside the engine is
 * never re-sealed as the engine's own) or when the lock is held past the wait (never broken, never
 * bypassed); each refusal is the one line the caller prints with exit 1, `nothing recorded` or
 * `nothing credited` as the caller's verb says. Returns what the callback returned beside the merge.
 */
export function updateEvidence<T = void>(
  paths: CrewPaths,
  id: string,
  apply: (evidence: Evidence) => T,
  options: { verb?: "recorded" | "credited" } = {},
): { saved: Evidence; result: T } | { refused: string } {
  const nothing = `nothing ${options.verb ?? "recorded"}`;
  try {
    return withLock(
      workDir(paths, id),
      (): { saved: Evidence; result: T } | { refused: string } => {
        const read = loadEvidence(paths, id);
        if (read.tampered)
          return {
            refused: `evidence.json of ${id} changed outside the engine (crew accept ${id}); ${nothing}`,
          };
        const result = apply(read.evidence);
        saveEvidence(paths, id, read.evidence);
        return { saved: read.evidence, result };
      },
      { what: "work folder" },
    );
  } catch (error) {
    if (error instanceof LockBusy)
      return {
        refused: `the work folder of ${id} is busy (another crew command holds it); ${nothing}: run the command again`,
      };
    throw error;
  }
}

export interface PlannedGate {
  gate: GateName;
  target: string;
  /** Named when the path holds more than one target (a Laravel app with a package.json beside it). */
  stack?: Stack;
}

/**
 * The run that vouches for a planned gate: the same gate and path, and the same stack where the
 * plan names one. A row with no stack vouches only for a plan that names none, so a row written
 * before the stack was recorded never stands in for a second target at the same path.
 */
export function runMatches(run: GateRun, planned: PlannedGate): boolean {
  return (
    run.gate === planned.gate &&
    run.target === planned.target &&
    (run.stack ?? null) === (planned.stack ?? null)
  );
}

/** `test`, `test (api)`, `test (php)` or `test (api, php)`: the path when several differ, the stack when the plan names one. */
function gateLabel(planned: PlannedGate, multiTarget: boolean): string {
  const parts: string[] = [];
  if (multiTarget && planned.target !== ".") parts.push(planned.target);
  if (planned.stack) parts.push(planned.stack);
  return parts.length ? `${planned.gate} (${parts.join(", ")})` : planned.gate;
}

export interface VerdictInput {
  work: WorkItem;
  evidence: Evidence;
  expected: PlannedGate[];
  currentFingerprint: string;
  tampered: boolean;
  /** Decides whether a skip the agent recorded with no person watching counts. */
  policy: Policy;
  /** The objection ledger; a blocking objection open or bound to an unproven criterion keeps the work unproven. */
  ledger?: ObjectionLedger;
  /** The judgement gates planned for the item; each is a reason until a current ruling says proven (SP2 §10). */
  expectedJudgement?: PlannedJudgement[];
  /** An audit's records as they stand (SP7 §7.5, SP8 Task 5): the run and whether it is at HEAD, the report and whether it is current against its inputs. */
  audit?: { run: boolean; runAtHead: boolean; report: boolean; reportCurrent: boolean };
}

/** An audit as the report shows it (SP8 Task 5): the run's summary, the findings' counts, the report's files, the signature. */
export interface AuditReportView {
  runSummary: string | null;
  head: string | null;
  runAtHead: boolean;
  /** The lines the roles filed, per section (the report's `findings` passed the proof check). */
  filed: Record<string, number>;
  report: {
    md: string;
    html: string;
    pdf: string | null;
    pdfReason: string | null;
    verdict: string;
  } | null;
  reportCurrent: boolean;
  signed: { at: string; by: string; relayed: boolean } | null;
}

export function computeVerdict(input: VerdictInput): {
  verdict: "proven" | "unproven";
  unproven: string[];
} {
  const { work, evidence, expected, currentFingerprint, tampered, policy } = input;
  const unproven: string[] = [];
  if (tampered) unproven.push("state changed outside the engine");
  // An audit is proven by its three records (SP7 §7.5, SP8): the run, the report and a person's
  // signature; no criterion, no test-first record and no gate run have a say.
  if (kindOfItem(work) === "audit") {
    const audit = input.audit ?? {
      run: false,
      runAtHead: false,
      report: false,
      reportCurrent: false,
    };
    if (!audit.run) unproven.push("audit run not recorded (crew audit <id> run)");
    else if (!audit.runAtHead)
      unproven.push("the audit run predates HEAD: run again (crew audit <id> run)");
    if (!audit.report) unproven.push("audit report not rendered (crew audit <id> report)");
    else if (!audit.reportCurrent)
      unproven.push(
        "the audit report is stale: its inputs changed after it (crew audit <id> report)",
      );
    if (!work.approvals.some((a) => a.what === "audit"))
      unproven.push("the audit's signature (crew approve <id> audit)");
    return { verdict: unproven.length === 0 ? "proven" : "unproven", unproven };
  }
  if (currentFingerprint === UNAVAILABLE)
    unproven.push("fingerprint unavailable: too many files to watch without git");
  // When no run vouches for the current code, one reason says it all; otherwise each stale gate is named.
  const stale =
    evidence.fingerprint !== null &&
    evidence.fingerprint !== currentFingerprint &&
    !evidence.runs.some((r) => r.fingerprint === currentFingerprint);
  if (evidence.fingerprint === null) unproven.push("gates have not run");
  else if (stale) unproven.push("code changed since the last gate run");
  const multiTarget = new Set(expected.map((e) => e.target)).size > 1;
  for (const planned of expected) {
    const { gate } = planned;
    if (isSkipped(work, `gate:${gate}`, policy)) continue;
    const label = gateLabel(planned, multiTarget);
    const run = evidence.runs.find((r) => runMatches(r, planned));
    if (!run) unproven.push(`gate ${label} not run`);
    else if (run.fingerprint !== currentFingerprint && !stale)
      unproven.push(`gate ${label} not run on the current code`);
    else if (run.status === "fail") unproven.push(`gate ${label} failing`);
    else if (run.status === "unavailable")
      unproven.push(`gate ${label} unavailable: ${run.reason ?? "no command"}`);
    else if (run.status === "pass" && !run.confirmed) {
      unproven.push(`gate ${label} ran an unconfirmed command (crew profile confirm)`);
    }
  }
  // A judgement gate is proven by a ruling on this code, never by default (SP2 §10): each planned
  // one not skipped is named until a current ruling says proven.
  for (const { gate } of input.expectedJudgement ?? []) {
    if (isSkipped(work, `gate:${gate}`, policy)) continue;
    const record = (evidence.judgement ?? []).find((j) => j.gate === gate);
    if (!record) unproven.push(`judgement gate ${gate} not run`);
    else if (record.fingerprint !== currentFingerprint && !stale)
      unproven.push(`judgement gate ${gate} not run on the current code`);
    else if (record.verdict === "not-proven") {
      const n = record.findings.length;
      unproven.push(`judgement gate ${gate} not proven (${n} finding${n === 1 ? "" : "s"})`);
    } else if (record.verdict === "not-run")
      unproven.push(`judgement gate ${gate} not run: ${record.reason ?? "no reason given"}`);
  }
  // A blocking objection is a reason of its own: open, or bound to a criterion not yet proven (SP2 §8).
  if (input.ledger) {
    for (const o of blockingObjections(input.ledger, work, evidence, policy, ["open", "bound"]))
      unproven.push(
        `blocking objection ${o.id} ${objectionStatus(o, work, evidence, policy)}: ${o.text}`,
      );
  }
  // A request in several parts (finding 61): each part's todo noted, gated and briefed, on top of
  // every other reason.
  for (const part of work.parts ?? []) {
    const todo = (work.tasks ?? []).find((t) => t.part === part.id);
    if (!todo)
      unproven.push(
        `part ${part.id} has no todo: crew task ${work.id} note T-n --part ${part.id} --criteria AC-j --scope <path>`,
      );
    else if (todo.state !== "gated" && todo.state !== "briefed")
      unproven.push(
        `todo ${todo.task} of ${part.id} not gated: crew task ${work.id} gate ${todo.task}`,
      );
    else if (!todo.brief)
      unproven.push(
        `todo ${todo.task} of ${part.id} has no brief: crew task ${work.id} brief ${todo.task}`,
      );
  }
  // Test-first is proved per criterion, so an item with none would be proven by the gates alone.
  if (work.criteria.length === 0)
    unproven.push('no acceptance criteria (crew criteria <id> add "...")');
  for (const criterion of work.criteria) {
    if (isSkipped(work, `tdd:${criterion.id}`, policy)) continue;
    // A superseded criterion is read through its replacement (finding 118's list): the last of
    // the chain proves for all of them, and a missing proof names the chain.
    const current = currentCriterion(work, criterion);
    const record = evidence.tdd.find((t) => t.criterion === current.id);
    if (!tddDone(record, current.kind))
      unproven.push(
        `test-first record missing for ${criterion.id}${current.id !== criterion.id ? ` (superseded by ${current.id})` : ""}`,
      );
  }
  return { verdict: unproven.length === 0 ? "proven" : "unproven", unproven };
}

export function tddSummary(
  work: WorkItem,
  evidence: Evidence,
  criterionId: string,
  kind: CriterionKind,
  policy: Policy,
): string {
  // A superseded criterion's cell says which text replaced it and what it proved on its own
  // (finding 118's list, the security lead of 2026-10-21-010): the reader sees both.
  const replaced = work.criteria.find((c) => c.id === criterionId)?.supersededBy;
  if (replaced)
    return `superseded by ${replaced.id} (${replaced.at.slice(0, 10)}); own record: ${ownSummary(work, evidence, criterionId, kind, policy)}`;
  return ownSummary(work, evidence, criterionId, kind, policy);
}

/** A criterion's own test-first state, read from its records alone. */
function ownSummary(
  work: WorkItem,
  evidence: Evidence,
  criterionId: string,
  kind: CriterionKind,
  policy: Policy,
): string {
  if (isSkipped(work, `tdd:${criterionId}`, policy)) {
    const skip = work.skips.find((s) => s.step === `tdd:${criterionId}`);
    return `skipped: ${skip?.reason ?? ""}`;
  }
  const record = evidence.tdd.find((t) => t.criterion === criterionId);
  if (record?.merged)
    return `proven by ${record.merged.task} (child ${record.merged.child}, merged ${record.merged.commit.slice(0, 7)})`;
  if (tddDone(record, kind)) {
    if (kind === "behavior") return "red then green";
    if (kind === "preserve") return "passing before and after";
    return `observed: passes after (${record?.reason ?? "no reason given"})`;
  }
  if (record?.red || record?.before) return kind === "behavior" ? "red only" : "before only";
  return "missing";
}

/** The deps gate's status with what it judged: the new advisories, and the known ones that are the repository's standing debt (ADR 0006). */
function auditStatus(status: GateRun["status"], a: NonNullable<GateRun["advisories"]>): string {
  const known = a.known ? `, ${a.known} known before` : "";
  const base = a.baselined ? "" : ", base not audited";
  if (status === "fail")
    return `fail: ${a.fresh.length} new (${a.fresh.join(", ")})${known}${base}`;
  return a.known ? `pass: ${a.known} known before, none new` : status;
}

/** A lint or typecheck judged by the files it named: the item's files that fail, and the untouched ones that are debt (ADR 0006). */
function problemStatus(status: GateRun["status"], p: NonNullable<GateRun["problems"]>): string {
  const untouched = `${p.untouched} untouched file${p.untouched === 1 ? "" : "s"}`;
  if (status === "fail")
    return `fail: problems in ${p.touched.join(", ")}${p.untouched ? ` (${untouched} also)` : ""}`;
  return `pass: ${untouched} with problems, none of the item's`;
}

/** `K-7, K-8; confirmed K-4` or `none`: what the item wrote into the base, without the verb, for the report's line and the refusals (SP6 Task 1 AC-5). */
export function learnedBody(entries: readonly string[], confirmed: readonly string[]): string {
  return `${entries.join(", ") || "none"}${confirmed.length ? `; confirmed ${confirmed.join(", ")}` : ""}`;
}

/** `learned K-7, K-8; confirmed K-4`, `learned none`: one wording for the register, the status and the report (SP4 Task 4). */
export function learnedText(entries: readonly string[], confirmed: readonly string[]): string {
  return `learned ${learnedBody(entries, confirmed)}`;
}

/** What the report may carry beside the item, its evidence and the policy (SP6 Task 1 AC-5), each optional. */
export interface ReportOptions {
  ledger?: ObjectionLedger;
  /** The item's copy of its messages (`mail.json`). */
  mail?: { box: Mailbox; tampered: boolean };
  /** The project's name in the mail, so a message this item sent reads as sent and the rest as received. */
  selfName?: string;
  analysis?: { origin: Origin | null; tampered: boolean };
  strategy?: StrategyReport | null;
  audit?: AuditReportView | null;
  /** The text of the item's knowledge list, as the engine wrote it at classification. */
  knowledge?: string | null;
  ctoPlan?: { path: string; date: string } | null;
}

/** Whom a turn end waited for, from the pause's kind (finding 123); no kind is the user's wait. */
function waitedFor(kind: "user" | "role" | "mail" | undefined): string {
  if (kind === "role") return "for the roles";
  if (kind === "mail") return "for a reply";
  return "for the user";
}

/**
 * The report. Its sections read the item and the evidence, and the records `options` carries:
 * the objections, the mail, an issue's origin, the strategy, an audit, the knowledge list and
 * the latest CTO plan (`ReportOptions`).
 */
export function renderReport(
  work: WorkItem,
  evidence: Evidence,
  policy: Policy,
  options: ReportOptions = {},
): string {
  const { ledger, mail, selfName, analysis, strategy, audit, knowledge, ctoPlan } = options;
  const lines: string[] = [];
  lines.push(`# Report: ${work.title}`, "");
  lines.push(`- Work: \`${work.id}\``);
  lines.push(
    `- Type: ${work.type}. Kind: ${kindOfItem(work)}${work.kindFrom ? ` (from ${work.kindFrom})` : ""}. Route: ${work.route} (${work.routeReasons.join("; ")})`,
  );
  // The latest plan the CTO filed for the project's workspace (SP4 Task 5): its path and date, never its content.
  lines.push(ctoPlan ? `- CTO plan: ${ctoPlan.path} (${ctoPlan.date})` : "- CTO plan: none");
  // The packs the item used (SP6 Task 2): the knowledge files served to the expert, the template that seated a team.
  lines.push(work.packs?.length ? `- Packs: ${work.packs.join(", ")}` : "- Packs: none");
  // The files by their pack and the path inside it (finding 118), never a machine's path; a record
  // older than the labels prints the paths it holds.
  if (work.knowledgeFiles?.length)
    lines.push(
      `- Knowledge files for the expert: ${(work.knowledgeLabels?.length ? work.knowledgeLabels : work.knowledgeFiles).join(", ")}`,
    );
  // Where the request entered from and the lead's triage of its priority (SP7 §10).
  if (work.source) lines.push(`- Source: ${sourceLine(work.source)}`);
  if (work.triage) lines.push(`- Triage: ${triageSummary(work.triage)}`);
  // A waived objection is named with the verdict, so a report that says Proven with a waiver says so first.
  // Grouped by who waived, rendered through decidedBy: never "by the user" for a decision a
  // person did not take (SP2a review, finding I1).
  const byDecider = new Map<string, number>();
  for (const o of ledger?.objections ?? []) {
    if (!o.waived || !decisionCounts(policy, o.waived)) continue;
    const who = `${decidedBy(o.waived)}${o.waived.by === "user" ? "" : " (counted by policy)"}`;
    byDecider.set(who, (byDecider.get(who) ?? 0) + 1);
  }
  const waivedNote = byDecider.size
    ? `, with ${[...byDecider]
        .map(([who, n]) => `${n} objection${n === 1 ? "" : "s"} waived ${who}`)
        .join(" and ")}`
    : "";
  // An abandoned item's verdict is the user's word (finding 124), never a proof it will not have.
  const verdictLine = work.abandoned
    ? `Abandoned on ${work.abandoned.at.slice(0, 10)}: ${work.abandoned.reason}`
    : evidence.verdict === "proven"
      ? "Proven"
      : "Not proven";
  lines.push(`- Verdict: **${verdictLine}**${waivedNote}`, "");
  if (evidence.unproven.length) {
    lines.push("## Not proven", "");
    for (const reason of evidence.unproven) lines.push(`- ${reason}`);
    lines.push("");
  }
  // Where the defect came from (SP7 §7.4, rule 11): the paths' commits and the items whose artifacts they carry.
  if (analysis) {
    lines.push("## Analysis", "");
    if (analysis.tampered || !analysis.origin) {
      lines.push(
        `analysis/origin.json changed outside the engine; the user accepts it with crew accept ${work.id}.`,
      );
    } else {
      const o = analysis.origin;
      const count = (n: number) => `${n} commit${n === 1 ? "" : "s"}`;
      lines.push(
        `- Paths: ${o.paths.length ? o.paths.map((p) => `${p.path} (${count(p.commits.length)})`).join(", ") : "none"}`,
      );
      const item = (i: OriginItem) =>
        i.kind === null
          ? `${i.id} (not in the records)`
          : `${i.id} "${cell(i.title ?? "")}" (${i.kind}; ${rolesAndTasks(i)}; decisions ${i.decisions}; mail ${i.mail})`;
      lines.push(
        `- Items: ${o.items.length ? o.items.map(item).join("; ") : "none in the records"}`,
      );
      if (o.note) lines.push(`- Note: ${o.note}`);
    }
    lines.push("");
  }
  // A new project's strategy as it stands (SP7 §7.3, §13.1): from the research alone until SP4.
  if (strategy) {
    lines.push("## Strategy", "");
    lines.push(`- ${RESEARCH_AND_BASE.charAt(0).toUpperCase()}${RESEARCH_AND_BASE.slice(1)}.`);
    const claims = STRATEGY_SECTIONS.filter((s) => s !== "Scaling phases")
      .map((s) => `${s} ${strategy.counts[s]}`)
      .join(", ");
    lines.push(`- Claims: ${claims}; scaling rows: ${strategy.rows}.`);
    const r = strategy.ruling;
    lines.push(
      r
        ? `- Ruling: ${verdictText(r.verdict)} (reviewer ${r.reviewer}, ${r.findings} finding${r.findings === 1 ? "" : "s"})${r.stale ? ", stale: the files changed after it" : ""}.`
        : "- Ruling: none.",
    );
    if (strategy.faults.length) lines.push(`- Faults: ${strategy.faults.join("; ")}`);
    lines.push("");
  }
  // What the base listed at classification (SP4 Task 3): the file's bullets, or none.
  lines.push("## Knowledge", "");
  const bullets = (knowledge ?? "").split("\n").filter((l) => l.startsWith("- "));
  lines.push(...(bullets.length ? bullets : ["- none"]));
  // What the item wrote into the base at Learn (SP4 Task 4), or not yet.
  const learned = work.learned;
  lines.push(
    learned
      ? `- Learned: ${learnedBody(learned.entries, learned.confirmed)}`
      : "- Learned: not yet",
    "",
  );
  // An audit's records (SP7 §7.5, SP8 Task 5): the run, the findings, the report's three files, the signature.
  if (audit) {
    lines.push("## Audit", "");
    lines.push(
      audit.runSummary
        ? `- Run: ${audit.runSummary} (head ${audit.head ? audit.head.slice(0, 12) : "no git"})${audit.runAtHead ? "" : "; predates HEAD, run again"}.`
        : "- Run: none yet (crew audit <id> run).",
    );
    const filed = Object.entries(audit.filed);
    lines.push(
      `- Filed: ${filed.length ? filed.map(([s, n]) => `${s} ${n}`).join(", ") : "none yet"} (the roles' lines; the report counts what passed the proof check).`,
    );
    lines.push(
      audit.report
        ? `- Report: ${audit.report.md}, ${audit.report.html}, ${audit.report.pdf ?? `pdf not produced (${audit.report.pdfReason ?? "no reason given"})`}; verdict ${audit.report.verdict}${audit.reportCurrent ? "" : "; stale: its inputs changed after it"}.`
        : "- Report: none yet (crew audit <id> report).",
    );
    lines.push(
      audit.signed
        ? `- Signed on ${audit.signed.at.slice(0, 10)} by ${audit.signed.by === "user" ? "the user" : audit.signed.by}${audit.signed.relayed ? ", relayed by the agent" : ""}.`
        : "- Signed: not yet (crew approve <id> audit).",
      "",
    );
  }
  lines.push(
    "## Acceptance criteria",
    "",
    "| Id | Kind | Criterion | Test-first |",
    "| :- | :- | :- | :- |",
  );
  for (const c of work.criteria) {
    lines.push(
      `| ${c.id} | ${c.kind} | ${c.text.replace(/\|/g, "\\|")}${c.contract ? ` [contract ${c.contract.message}:${c.contract.index}]` : ""} | ${tddSummary(work, evidence, c.id, c.kind, policy)} |`,
    );
  }
  lines.push(
    "",
    "## Gates",
    "",
    "| Gate | Target | Status | Command | Duration | Log |",
    "| :- | :- | :- | :- | -: | :- |",
  );
  for (const r of evidence.runs) {
    const status =
      r.status === "skipped" || r.status === "unavailable"
        ? `${r.status}${r.reason ? `: ${r.reason}` : ""}`
        : r.advisories
          ? auditStatus(r.status, r.advisories)
          : r.problems
            ? problemStatus(r.status, r.problems)
            : r.status === "fail" && r.reason
              ? `fail: ${r.reason}`
              : r.status;
    const target = r.stack ? `${r.target} (${r.stack})` : r.target;
    lines.push(
      `| ${r.gate} | ${target} | ${status} | ${r.command ? `\`${r.command}\`` : ""} | ${r.durationMs} ms | ${r.log ?? ""} |`,
    );
  }
  // The rulings as the judge gave them; a finding outside the change is named as such, never hidden (ADR 0006).
  const judgement = evidence.judgement ?? [];
  if (judgement.length) {
    lines.push(
      "",
      "## Judgement gates",
      "",
      "| Gate | Verdict | Reviewer | Findings | Tokens |",
      "| :- | :- | :- | -: | -: |",
    );
    for (const j of judgement) {
      const word =
        j.verdict === "not-run"
          ? `not run: ${j.reason ?? "no reason given"}`
          : j.verdict === "not-proven"
            ? "not proven"
            : "proven";
      // A ruling on other code than the evidence's is said so where its verdict is shown, never
      // read as a proof of this code (review of SP2b, finding 7).
      const verdict = j.fingerprint === evidence.fingerprint ? word : `${word} (earlier code)`;
      lines.push(
        `| ${j.gate} | ${verdict} | ${j.reviewer ?? ""} | ${j.findings.length} | ${j.tokens ?? ""} |`,
      );
    }
    const findings = judgement.flatMap((j) => j.findings.map((f) => ({ gate: j.gate, ...f })));
    if (findings.length) lines.push("");
    for (const f of findings) {
      lines.push(
        `- ${f.gate}: ${f.file}${f.line ? `:${f.line}` : ""} ${f.text.replace(/\|/g, "\\|")} (${f.severity}${f.outside ? ", outside the change" : ""}${f.verification ? `, ${markText(f.verification)}` : ""})`,
      );
    }
  }
  // Jev's answers on the item (SP3 Task 6): what was asked, the answer, its confidence, the model.
  if (evidence.verifications?.length) {
    lines.push(
      "",
      "## Verifications",
      "",
      "| What | Ref | Answer | Confidence | Model | At |",
      "| :- | :- | :- | -: | :- | :- |",
    );
    for (const v of evidence.verifications)
      lines.push(
        `| ${v.what} | ${cell(v.ref)} | ${cell(answerText(v.answer))} | ${v.confidence === null ? "-" : two(v.confidence)} | ${cell(v.model)} | ${v.at} |`,
      );
  }
  // The seats the route planned, with their reasons, and the rounds spent against the caps (SP7 §6.6).
  if (work.seats?.length || work.rounds) {
    lines.push("", "## Team", "");
    if (work.primaryTeam) lines.push(`- Primary team: ${work.primaryTeam} (the session)`, "");
    if (work.seats?.length) {
      lines.push("| Seat | Team | Reason |", "| :- | :- | :- |");
      for (const s of work.seats) lines.push(`| ${s.role} | ${s.team ?? ""} | ${s.reason} |`);
      lines.push("");
    }
    const rounds = work.rounds ?? { judgement: 0, validation: 0 };
    lines.push(
      `- Rounds: judgement ${rounds.judgement} of ${policy.team.maxJudgementRounds}, validation ${rounds.validation} of ${policy.team.maxValidationRounds}`,
    );
    // The runtimes whose hooks observed the item, each with its guarantees (SP6 Task 4); nothing
    // for an item no hook recorded (one before 0.11.0).
    if (work.runtimes?.length)
      lines.push(
        `- Runtimes: ${work.runtimes
          .map((name) => {
            const runtime = runtimeOf(name);
            return runtime ? `${name} (${guaranteeLines(runtime).join("; ")})` : name;
          })
          .join("; ")}`,
      );
  }
  // The leads' verdicts on the spec, the plan and the delivery (SP7 §6.4), every round kept.
  if (work.validations?.length) {
    lines.push(
      "",
      "## Validations",
      "",
      "| What | By | Verdict | Returns | Round | File |",
      "| :- | :- | :- | -: | -: | :- |",
    );
    for (const v of work.validations)
      lines.push(`| ${v.what} | ${v.by} | ${v.verdict} | ${v.returns} | ${v.round} | ${v.file} |`);
  }
  const decisions = work.decisions ?? [];
  if (decisions.length || work.debate) {
    lines.push("", "## Gap round", "");
    for (const d of decisions) {
      const answer =
        d.answer === undefined
          ? "no answer yet"
          : `${d.answer}, ${decidedBy(d)}${countedNote(policy, d)}`;
      lines.push(`- ${d.id}: ${d.question} → ${answer}`);
    }
    // Whether the round found a decision with consequences (SP2 §7): the debate, its reason, its close.
    const debate = work.debate;
    lines.push(
      debate
        ? `- Debate: opened (${debate.reason}), ${debate.closedAt ? "closed" : "open"}${debate.tokens !== undefined ? `, ${debate.tokens} tokens` : ""}`
        : "- Debate: none",
    );
  }
  // The doubts raised on the item (SP7 §10.3): what was asked, where it went, who answered and when.
  if (work.questions?.length) {
    lines.push(
      "",
      "## Questions",
      "",
      "| Question | Asked | Text | Channels | Answer | By | At |",
      "| :- | :- | :- | :- | :- | :- | :- |",
    );
    for (const q of work.questions)
      lines.push(
        `| ${q.id} | ${q.askedAt} | ${cell(q.text)} | ${questionChannelsCell(q)} | ${q.answer === null ? "-" : cell(q.answer)} | ${q.by ?? "-"} | ${q.answeredAt ?? "-"} |`,
      );
  }
  // The item's mail (SP2c §6): what it sent and what reached it, as the engine last recorded each.
  if (mail?.tampered) {
    lines.push(
      "",
      "## Mail",
      "",
      `mail.json changed outside the engine; the user accepts it with crew accept ${work.id}.`,
    );
  } else if (mail?.box.messages.length) {
    lines.push(
      "",
      "## Mail",
      "",
      "| Message | Thread | At | Direction | With | Type | Priority | Subject | Status | Contracts |",
      "| :- | :- | :- | :- | :- | :- | :- | :- | :- | :- |",
    );
    for (const m of mail.box.messages) {
      const sent = m.from.item === work.id && m.from.project === selfName;
      const direction = sent ? "sent" : "received";
      const other = partyLabel(sent ? m.to : m.from);
      // The status as the engine reads it (SP7 §9) and the priority with its proposal when lowered.
      const decision = m.priorityDecision;
      const priority =
        decision && decision.confirmed !== decision.proposed
          ? `${decidedPriority(m)} (proposed ${decision.proposed})`
          : decidedPriority(m);
      const status = cell(
        `${mailStatus(m)}${m.reason ? `: ${m.reason}` : ""}${
          m.verdict ? ` (${m.verdict}${m.branch ? `, ${m.branch}` : ""})` : ""
        }${m.relayed ? ", relayed" : ""}`,
      );
      // The thread and the contracts as another party wrote them, validated and one-lined (SP7 §9).
      const thread = threadOf(m) === m.id ? "-" : threadOf(m);
      const contracts =
        readContracts(m)
          .map((c) => (c.kind === "clause" ? "clause" : `${c.kind} ${cell(c.path ?? "")}`))
          .join(", ") || "-";
      lines.push(
        `| ${m.id} | ${thread} | ${m.at} | ${direction} | ${other} | ${m.type} | ${priority} | ${cell(m.subject)} | ${status} | ${contracts} |`,
      );
    }
  }
  // Each role's end as the SubagentStop hook recorded it (SP2c §11), or as the session filed it (SP6 Task 4).
  if (evidence.roles?.length) {
    lines.push(
      "",
      "## Roles",
      "",
      "| Role | Model | Personality | At | Tokens | Answer | Filed by |",
      "| :- | :- | :- | :- | -: | :- | :- |",
    );
    for (const r of evidence.roles)
      lines.push(
        `| ${r.agent} | ${r.model ?? "-"} | ${r.personality ?? "-"} | ${r.at} | ${r.tokensFrom === "none" ? "not read" : r.tokens} | ${r.file ?? "not saved"} | ${r.filedBy ?? "hook"} |`,
      );
  }
  // The tasks handed to implementers (SP2c §7), filled by `crew task`.
  if (work.tasks?.length) {
    lines.push(
      "",
      "## Tasks",
      "",
      "| Task | Criteria | Branch | Child | Verdict | Merged | Report | State | Gate |",
      "| :- | :- | :- | :- | :- | :- | :- | :- | :- |",
    );
    for (const t of work.tasks)
      lines.push(
        `| ${t.task} | ${t.criteria.join(", ")} | ${t.inline ? "inline" : t.branch} | ${t.child ?? ""} | ${t.verdict ?? (t.inline ? "" : "no reply yet")} | ${
          t.mergedAt
            ? `${t.mergeCommit?.slice(0, 7) ?? ""}${t.forcedBy ? " (forced by the user)" : ""}`
            : t.inline
              ? "inline"
              : "no"
        } | ${t.child ? `.crew/work/${t.child}/report.md` : ""} | ${t.state ?? "open"} | ${
          t.gate ? `${t.gate.status} (round ${t.gate.round})` : "-"
        } |`,
      );
  }
  const removed = work.removedCriteria ?? [];
  const pauses = work.pauses ?? [];
  const shared = work.sharedCheckout;
  // What the start found (finding 9): a fact, not a decision (finding 124). The open items by id
  // and the count of uncommitted files; the paths stay in work.json, never in a report that may
  // be pasted outside the project.
  if (shared) {
    const n = shared.paths.length;
    lines.push(
      "",
      "## Checkout",
      "",
      `- started in a checkout shared with ${shared.with.join(", ")}: ${n} uncommitted file${n === 1 ? "" : "s"} at the start, listed in work.json (sharedCheckout.paths) (${shared.at})`,
    );
  }
  if (work.approvals.length || work.skips.length || removed.length || work.abandoned) {
    lines.push("", "## Decisions", "");
    if (work.abandoned) {
      lines.push(
        `- abandoned ${decidedBy(work.abandoned.by)} (${work.abandoned.at}): ${work.abandoned.reason}`,
      );
    }
    for (const a of work.approvals) {
      lines.push(`- ${a.what} approved ${decidedBy(a)} (${a.at})${countedNote(policy, a)}`);
    }
    for (const s of work.skips) {
      lines.push(
        `- \`${s.step}\` skipped ${decidedBy(s)}: ${s.reason} (${s.at})${countedNote(policy, s)}`,
      );
    }
    for (const r of removed) lines.push(`- ${r.id} (${r.kind}) removed (${r.at}): ${r.text}`);
  }
  // The turns that ended waiting while the work was not proven, by whom the session waited for
  // (finding 123): a wait is never a decision. A pause with no kind predates the roles' and the
  // mail's waits (SP2c), when the only wait a turn could end on was the user's.
  if (pauses.length) {
    lines.push("", "## Waits", "");
    for (const p of pauses) lines.push(`- ${waitedFor(p.kind)} (${p.at}), not proven: ${p.reason}`);
  }
  if (ledger?.objections.length) {
    lines.push("", "## Objections", "");
    for (const o of ledger.objections) {
      const status = objectionStatus(o, work, evidence, policy);
      let how = "open";
      if (status === "waived" && o.waived) {
        how = `waived ${decidedBy(o.waived)}: ${o.waived.reason} (${o.waived.at})`;
      } else if (status === "resolved") how = `resolved by ${o.criterion}`;
      else if (status === "bound") how = `bound to ${o.criterion}, not yet proven`;
      else if (o.waived) how = `open (waiver ${decidedBy(o.waived)} not counted)`;
      lines.push(`- ${o.id} (${o.severity}, raised by ${o.raisedBy}) ${how}: ${o.text}`);
    }
  }
  lines.push("", `Fingerprint: ${evidence.fingerprint ?? "none"}`, "");
  return lines.join("\n");
}
