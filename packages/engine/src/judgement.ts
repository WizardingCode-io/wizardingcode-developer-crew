import { join } from "node:path";
import { gitDiffSince } from "./fingerprint.ts";
import { writeText } from "./fs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import type {
  Evidence,
  JudgementGateName,
  PlannedJudgement,
  Policy,
  RiskArea,
  Route,
  WorkItem,
} from "./types.ts";
import { isSkipped } from "./work.ts";

const INTERFACE_EXTENSIONS = [
  ".vue",
  ".svelte",
  ".tsx",
  ".jsx",
  ".astro",
  ".blade.php",
  ".html",
  ".css",
  ".scss",
  ".less",
];

/** A file the user sees: a component, a template, a stylesheet, or anything under resources/views/. */
export function isInterfacePath(rel: string): boolean {
  const lower = rel.toLowerCase();
  if (/(?:^|\/)resources\/views\//.test(lower)) return true;
  return INTERFACE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * The judgement gates an item needs, from the route, the risk areas and the diff (SP2 §10): code and
 * test quality on standard and full; security on full, or on standard when a risk area is touched;
 * UI/UX on any route when the change touches an interface file; risk on full; and whatever the team
 * policy requires. A fast item with no interface file plans none, so the fast route costs nothing more.
 */
export function plannedJudgementGates(
  route: Route,
  riskAreas: readonly RiskArea[],
  changed: readonly string[],
  policy: Policy,
): PlannedJudgement[] {
  const planned: PlannedJudgement[] = [];
  const plan = (gate: JudgementGateName, reason: string): void => {
    if (!planned.some((p) => p.gate === gate)) planned.push({ gate, reason });
  };
  if (route !== "fast") {
    plan("code-quality", `${route} route`);
    plan("test-quality", `${route} route`);
  }
  if (route === "full") plan("security", "full route");
  else if (route === "standard" && riskAreas.length)
    plan("security", `risk area${riskAreas.length === 1 ? "" : "s"} ${riskAreas.join(", ")}`);
  const interfaces = changed.filter(isInterfacePath);
  if (interfaces.length) {
    const shown = interfaces.slice(0, 3).join(", ");
    const more = interfaces.length > 3 ? `, +${interfaces.length - 3} more` : "";
    plan("ui-ux", `interface files: ${shown}${more}`);
  }
  if (route === "full") plan("risk", "full route");
  for (const gate of policy.judgementGates) plan(gate, "policy");
  return planned;
}

/** Where the review of an item lives: the engine's inputs, and the roles' answers the session saves beside them. Not engine-owned. */
export function reviewDir(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "review");
}

/**
 * What a reviewer receives, and nothing else (SP2 §10, finding 20): the diff of the item's change
 * since its base commit, untracked files as additions, and the list of changed watched paths.
 * Plain files, rewritten at every gate run; the session writes its rulings beside them.
 */
export function writeReviewInputs(
  paths: CrewPaths,
  work: WorkItem,
  changed: readonly string[],
): string {
  const dir = reviewDir(paths, work.id);
  const patch = work.baseCommit ? gitDiffSince(paths.root, work.baseCommit, changed) : "";
  writeText(join(dir, "diff.patch"), patch);
  writeText(join(dir, "files.txt"), changed.length ? `${changed.join("\n")}\n` : "");
  return dir;
}

export type JudgementState = "planned" | "proven" | "not-proven" | "not-run" | "stale" | "skipped";
export interface JudgementRow {
  gate: JudgementGateName;
  status: JudgementState;
  /** Why the gate is planned for this item. */
  planned: string;
  findings: number;
  /** For not-run, the reviewer's reason; for skipped, the skip's. */
  reason?: string;
}

/** One row per planned judgement gate, as the status and the panel show them; derived, never stored. */
export function judgementRows(
  work: WorkItem,
  evidence: Evidence,
  planned: readonly PlannedJudgement[],
  currentFingerprint: string,
  policy: Policy,
): JudgementRow[] {
  return planned.map((p) => {
    const record = (evidence.judgement ?? []).find((j) => j.gate === p.gate);
    const findings = record?.findings.length ?? 0;
    if (isSkipped(work, `gate:${p.gate}`, policy)) {
      const skip = work.skips.find((s) => s.step === `gate:${p.gate}`);
      return {
        gate: p.gate,
        status: "skipped",
        planned: p.reason,
        findings,
        ...(skip?.reason ? { reason: skip.reason } : {}),
      };
    }
    if (!record) return { gate: p.gate, status: "planned", planned: p.reason, findings: 0 };
    if (record.fingerprint !== currentFingerprint)
      return { gate: p.gate, status: "stale", planned: p.reason, findings };
    return {
      gate: p.gate,
      status: record.verdict,
      planned: p.reason,
      findings,
      ...(record.reason ? { reason: record.reason } : {}),
    };
  });
}
