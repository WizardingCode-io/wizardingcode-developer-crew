import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadEvidence } from "./evidence.ts";
import { loadLedger, objectionStatus } from "./objections.ts";
import type { CrewPaths } from "./paths.ts";
import { loadPolicy } from "./policy.ts";
import type { Phase } from "./types.ts";
import { loadWork } from "./work.ts";

/** The figures the CTO reads (SP7 §6.5), from the engine's records alone. */
export interface Metrics {
  projects: string[];
  items: { total: number; byRoute: Record<string, number>; byType: Record<string, number> };
  rounds: { judgement: number; validation: number; gate: number };
  tokens: { byRole: Record<string, number>; byPersonality: Record<string, number>; total: number };
  defects: { byReviewer: Record<string, number> };
  tasks: { opened: number; proven: number; unproven: number };
  objections: { byStatus: Record<string, number> };
  decisions: { total: number; byUser: number; byValidator: number; byAgent: number };
  gates: { notRun: number; skipped: number };
  phaseMinutes: Partial<Record<Phase, number>>;
}

const count = (map: Record<string, number>, key: string, n = 1): void => {
  map[key] = (map[key] ?? 0) + n;
};

/**
 * The figures of the given projects (SP7 §6.5, rule 18): deterministic, from `work.json`,
 * `evidence.json` and `objections.json` of every item, never from a transcript. The minutes per
 * phase come from the stamps `advancePhase` leaves (`phaseAt`): each phase lasts until the next one
 * is entered; the current phase of an open item is not counted.
 */
export function computeMetrics(projects: CrewPaths[]): Metrics {
  const m: Metrics = {
    projects: projects.map((p) => p.root),
    items: { total: 0, byRoute: {}, byType: {} },
    rounds: { judgement: 0, validation: 0, gate: 0 },
    tokens: { byRole: {}, byPersonality: {}, total: 0 },
    defects: { byReviewer: {} },
    tasks: { opened: 0, proven: 0, unproven: 0 },
    objections: { byStatus: {} },
    decisions: { total: 0, byUser: 0, byValidator: 0, byAgent: 0 },
    gates: { notRun: 0, skipped: 0 },
    phaseMinutes: {},
  };
  const phaseTotals: Partial<Record<Phase, number>> = {};
  for (const paths of projects) {
    // An objection's status is read, not stored (open, resolved, waived, as `objectionStatus` reads it
    // from the item, the evidence and the project's policy).
    const policy = loadPolicy(paths).policy;
    let ids: string[] = [];
    try {
      ids = readdirSync(join(paths.crewDir, "work"));
    } catch {
      continue;
    }
    for (const id of ids) {
      const work = loadWork(paths, id).work;
      if (!work) continue;
      m.items.total += 1;
      count(m.items.byRoute, work.route);
      count(m.items.byType, work.type);
      m.rounds.judgement += work.rounds?.judgement ?? 0;
      m.rounds.validation += work.rounds?.validation ?? 0;
      for (const t of work.tasks ?? []) {
        m.tasks.opened += 1;
        if (t.verdict === "proven") m.tasks.proven += 1;
        else if (t.verdict === "unproven") m.tasks.unproven += 1;
        m.rounds.gate += t.gate?.round ?? 0;
      }
      for (const d of work.decisions ?? []) {
        if (d.answer === undefined) continue;
        m.decisions.total += 1;
        if (d.by === "user") m.decisions.byUser += 1;
        else if (d.by === "validator") m.decisions.byValidator += 1;
        else if (d.by === "agent") m.decisions.byAgent += 1;
      }
      const evidence = loadEvidence(paths, id).evidence;
      for (const r of evidence.roles ?? []) {
        count(m.tokens.byRole, r.agent.replace(/-\d+$/, ""), r.tokens);
        if (r.personality) count(m.tokens.byPersonality, r.personality, r.tokens);
        m.tokens.total += r.tokens;
      }
      for (const j of evidence.judgement ?? []) {
        if (j.verdict === "not-run") m.gates.notRun += 1;
        const defects = j.findings.filter((f) => f.severity === "defect" && !f.outside).length;
        if (defects) count(m.defects.byReviewer, j.reviewer ?? `review-${j.gate}`, defects);
      }
      m.gates.skipped += evidence.runs.filter((r) => r.status === "skipped").length;
      for (const o of loadLedger(paths, id).ledger.objections)
        count(m.objections.byStatus, objectionStatus(o, work, evidence, policy));
      const stamps = Object.entries(work.phaseAt ?? {}) as [Phase, string][];
      stamps.sort((a, b) => a[1].localeCompare(b[1]));
      for (let i = 0; i + 1 < stamps.length; i++) {
        const current = stamps[i];
        const following = stamps[i + 1];
        if (!current || !following) continue;
        const minutes = (Date.parse(following[1]) - Date.parse(current[1])) / 60_000;
        phaseTotals[current[0]] = (phaseTotals[current[0]] ?? 0) + minutes;
      }
    }
  }
  for (const [phase, minutes] of Object.entries(phaseTotals) as [Phase, number][])
    m.phaseMinutes[phase] = Math.round(minutes * 100) / 100;
  return m;
}

/** The short text `crew metrics` prints: one line per figure that matters. */
export function metricsText(m: Metrics): string {
  const pairs = (map: Record<string, number>): string =>
    Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k} ${v}`)
      .join(", ");
  return [
    `metrics of ${m.projects.length} project${m.projects.length === 1 ? "" : "s"}`,
    `  items: ${m.items.total}${m.items.total ? ` (${pairs(m.items.byRoute)})` : ""}`,
    `  rounds: judgement ${m.rounds.judgement}, validation ${m.rounds.validation}, gate ${m.rounds.gate}`,
    `  tokens: ${m.tokens.total}${m.tokens.total ? ` (${pairs(m.tokens.byRole)})` : ""}`,
    `  defects upheld: ${Object.values(m.defects.byReviewer).reduce((a, b) => a + b, 0)}${Object.keys(m.defects.byReviewer).length ? ` (${pairs(m.defects.byReviewer)})` : ""}`,
    `  tasks: ${m.tasks.opened} opened, ${m.tasks.proven} proven, ${m.tasks.unproven} unproven`,
    `  decisions: ${m.decisions.total} (user ${m.decisions.byUser}, validator ${m.decisions.byValidator}, agent ${m.decisions.byAgent})`,
    `  gates: ${m.gates.notRun} not run, ${m.gates.skipped} skipped`,
    `  minutes per phase: ${Object.keys(m.phaseMinutes).length ? pairs(m.phaseMinutes as Record<string, number>) : "none yet"}`,
  ].join("\n");
}
