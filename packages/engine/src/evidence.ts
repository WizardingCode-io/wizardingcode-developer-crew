import { join } from "node:path";
import { UNAVAILABLE } from "./fingerprint.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { decisionCounts } from "./policy.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type {
  CriterionKind,
  DecidedBy,
  Evidence,
  GateName,
  Policy,
  UnattendedMode,
  WorkItem,
} from "./types.ts";
import { isSkipped, tddDone } from "./work.ts";

type Decided = { by?: DecidedBy; mode?: UnattendedMode };

/** "by the user" or "by the agent in <mode> mode": the record says who decided, never less. */
export function decidedBy(decision: Decided): string {
  return decision.by === "agent" ? `by the agent in ${decision.mode} mode` : "by the user";
}

/** What the agent's decision is worth under the policy; a person's decision needs no note. */
export function countedNote(policy: Policy, decision: Decided): string {
  if (decision.by !== "agent") return "";
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
}

export interface VerdictInput {
  work: WorkItem;
  evidence: Evidence;
  expected: PlannedGate[];
  currentFingerprint: string;
  tampered: boolean;
  /** Decides whether a skip the agent recorded with no person watching counts. */
  policy: Policy;
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
  for (const { gate, target } of expected) {
    if (isSkipped(work, `gate:${gate}`, policy)) continue;
    const label = multiTarget && target !== "." ? `${gate} (${target})` : gate;
    const run = evidence.runs.find((r) => r.gate === gate && r.target === target);
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
  if (tddDone(record, kind))
    return kind === "behavior" ? "red then green" : "passing before and after";
  if (record?.red || record?.before) return kind === "behavior" ? "red only" : "before only";
  return "missing";
}

export function renderReport(work: WorkItem, evidence: Evidence, policy: Policy): string {
  const lines: string[] = [];
  lines.push(`# Report: ${work.title}`, "");
  lines.push(`- Work: \`${work.id}\``);
  lines.push(`- Type: ${work.type}. Route: ${work.route} (${work.routeReasons.join("; ")})`);
  lines.push(`- Verdict: **${evidence.verdict === "proven" ? "Proven" : "Not proven"}**`, "");
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
        : r.status;
    lines.push(
      `| ${r.gate} | ${r.target} | ${status} | ${r.command ? `\`${r.command}\`` : ""} | ${r.durationMs} ms | ${r.log ?? ""} |`,
    );
  }
  const removed = work.removedCriteria ?? [];
  const pauses = work.pauses ?? [];
  if (work.approvals.length || work.skips.length || removed.length || pauses.length) {
    lines.push("", "## Decisions", "");
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
  lines.push("", `Fingerprint: ${evidence.fingerprint ?? "none"}`, "");
  return lines.join("\n");
}
