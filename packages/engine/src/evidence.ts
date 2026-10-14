import { join } from "node:path";
import { UNAVAILABLE } from "./fingerprint.ts";
import { blockingObjections, objectionStatus } from "./objections.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { decisionCounts } from "./policy.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type {
  CriterionKind,
  DecidedBy,
  Evidence,
  GateName,
  GateRun,
  ObjectionLedger,
  PermissionMode,
  Policy,
  Stack,
  ValidatorRule,
  WorkItem,
} from "./types.ts";
import { isSkipped, tddDone } from "./work.ts";

type Decided = {
  by?: DecidedBy;
  mode?: PermissionMode;
  rule?: ValidatorRule;
  relayed?: boolean;
};

/**
 * "by the user", "by the user, relayed by the agent", "by the agent in <mode> mode" or "by the
 * validator (rule: <rule>)": the record says who decided, never less, never "by the user" for a
 * decision a person did not take, and never a prompt where the agent relayed a yes (ADR 0005).
 */
export function decidedBy(decision: Decided): string {
  if (decision.by === "validator") return `by the validator (rule: ${decision.rule ?? "unnamed"})`;
  if (decision.by === "agent") return `by the agent in ${decision.mode} mode`;
  return decision.relayed ? "by the user, relayed by the agent" : "by the user";
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
}

export function computeVerdict(input: VerdictInput): {
  verdict: "proven" | "unproven";
  unproven: string[];
} {
  const { work, evidence, expected, currentFingerprint, tampered, policy } = input;
  const unproven: string[] = [];
  if (tampered) unproven.push("state changed outside the engine");
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
  // A blocking objection is a reason of its own: open, or bound to a criterion not yet proven (SP2 §8).
  if (input.ledger) {
    for (const o of blockingObjections(input.ledger, work, evidence, policy, ["open", "bound"]))
      unproven.push(
        `blocking objection ${o.id} ${objectionStatus(o, work, evidence, policy)}: ${o.text}`,
      );
  }
  // Test-first is proved per criterion, so an item with none would be proven by the gates alone.
  if (work.criteria.length === 0)
    unproven.push('no acceptance criteria (crew criteria <id> add "...")');
  for (const criterion of work.criteria) {
    if (isSkipped(work, `tdd:${criterion.id}`, policy)) continue;
    const record = evidence.tdd.find((t) => t.criterion === criterion.id);
    if (!tddDone(record, criterion.kind))
      unproven.push(`test-first record missing for ${criterion.id}`);
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
  if (isSkipped(work, `tdd:${criterionId}`, policy)) {
    const skip = work.skips.find((s) => s.step === `tdd:${criterionId}`);
    return `skipped: ${skip?.reason ?? ""}`;
  }
  const record = evidence.tdd.find((t) => t.criterion === criterionId);
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

export function renderReport(
  work: WorkItem,
  evidence: Evidence,
  policy: Policy,
  ledger?: ObjectionLedger,
): string {
  const lines: string[] = [];
  lines.push(`# Report: ${work.title}`, "");
  lines.push(`- Work: \`${work.id}\``);
  lines.push(`- Type: ${work.type}. Route: ${work.route} (${work.routeReasons.join("; ")})`);
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
  lines.push(
    `- Verdict: **${evidence.verdict === "proven" ? "Proven" : "Not proven"}**${waivedNote}`,
    "",
  );
  if (evidence.unproven.length) {
    lines.push("## Not proven", "");
    for (const reason of evidence.unproven) lines.push(`- ${reason}`);
    lines.push("");
  }
  lines.push(
    "## Acceptance criteria",
    "",
    "| Id | Kind | Criterion | Test-first |",
    "| :- | :- | :- | :- |",
  );
  for (const c of work.criteria) {
    lines.push(
      `| ${c.id} | ${c.kind} | ${c.text.replace(/\|/g, "\\|")} | ${tddSummary(work, evidence, c.id, c.kind, policy)} |`,
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
  const decisions = work.decisions ?? [];
  if (decisions.length) {
    lines.push("", "## Gap round", "");
    for (const d of decisions) {
      const answer =
        d.answer === undefined
          ? "no answer yet"
          : `${d.answer}, ${decidedBy(d)}${countedNote(policy, d)}`;
      lines.push(`- ${d.id}: ${d.question} → ${answer}`);
    }
  }
  const removed = work.removedCriteria ?? [];
  const pauses = work.pauses ?? [];
  const shared = work.sharedCheckout;
  if (work.approvals.length || work.skips.length || removed.length || pauses.length || shared) {
    lines.push("", "## Decisions", "");
    if (shared) {
      lines.push(
        `- started in a checkout shared with ${shared.with.join(", ")}, open with uncommitted changes in ${shared.paths.join(", ")} (${shared.at})`,
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
    for (const p of pauses) lines.push(`- paused for the user (${p.at}), not proven: ${p.reason}`);
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
