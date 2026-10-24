import { readdirSync } from "node:fs";
import { join } from "node:path";
import { loadEvidence } from "./evidence.ts";
import { type KnowledgeScope, PROJECT_KINDS, visibleTo } from "./knowledge.ts";
import { loadLedger, objectionStatus } from "./objections.ts";
import type { CrewPaths } from "./paths.ts";
import { loadPolicy } from "./policy.ts";
import type { KnowledgeBase, KnowledgeKind, Phase, ProjectKnowledgeKind } from "./types.ts";
import { kindOfItem, loadWork } from "./work.ts";

/** One visible entry of the base as the CTO's inputs list it (SP4 Task 5): never the text. */
export interface KnowledgeRow {
  id: string;
  kind: KnowledgeKind;
  title: string;
  workspace: string | null;
  confirmed: number;
  contradicted: number;
}

/** The base's figures over the entries a scope reads, and the items of the given projects whose learn confirmed one. */
export interface KnowledgeCounts {
  entries: Record<ProjectKnowledgeKind, number>;
  confirmed: number;
  contradicted: number;
  cited: number;
}

export interface KnowledgeFigures extends KnowledgeCounts {
  rows: KnowledgeRow[];
}

function emptyKnowledge(): KnowledgeCounts {
  const entries = {} as Record<ProjectKnowledgeKind, number>;
  for (const kind of PROJECT_KINDS) entries[kind] = 0;
  return { entries, confirmed: 0, contradicted: 0, cited: 0 };
}

/**
 * The knowledge figures the CTO reads (SP4 Task 5): per kind, the refs summed, one row per entry,
 * over the entries visible to the scope alone (rule 13: a hidden entry is in no figure and no
 * row); `cited` counts the items of the projects whose learn confirmed at least one entry. No base
 * (missing or unreadable) gives zeros.
 */
export function knowledgeFigures(
  base: KnowledgeBase | null,
  scope: KnowledgeScope,
  projects: CrewPaths[],
): KnowledgeFigures {
  const figures: KnowledgeFigures = { ...emptyKnowledge(), rows: [] };
  if (!base) return figures;
  for (const e of base.entries) {
    // A harness lesson is no figure of the projects: the CTO's inputs carry it apart (ADR 0013).
    if (!visibleTo(e, scope) || e.kind === "harness-lesson") continue;
    figures.entries[e.kind] += 1;
    figures.confirmed += e.confirmedBy.length;
    figures.contradicted += e.contradictedBy.length;
    figures.rows.push({
      id: e.id,
      kind: e.kind,
      title: e.title,
      workspace: e.workspace,
      confirmed: e.confirmedBy.length,
      contradicted: e.contradictedBy.length,
    });
  }
  for (const paths of projects)
    for (const id of workIds(paths))
      if (loadWork(paths, id).work?.learned?.confirmed.length) figures.cited += 1;
  return figures;
}

/** The item folders of a project, none without a work folder. */
function workIds(paths: CrewPaths): string[] {
  try {
    return readdirSync(join(paths.crewDir, "work"));
  } catch {
    return [];
  }
}

/** The figures the CTO reads (SP7 §6.5), from the engine's records alone. */
export interface Metrics {
  projects: string[];
  items: {
    total: number;
    byRoute: Record<string, number>;
    byType: Record<string, number>;
    /** By the kind of work (SP7 §7.1); a record without one counts as a feature. */
    byKind: Record<string, number>;
  };
  rounds: { judgement: number; validation: number; gate: number };
  tokens: { byRole: Record<string, number>; byPersonality: Record<string, number>; total: number };
  defects: { byReviewer: Record<string, number> };
  tasks: { opened: number; proven: number; unproven: number };
  objections: { byStatus: Record<string, number> };
  decisions: { total: number; byUser: number; byValidator: number; byAgent: number };
  gates: { notRun: number; skipped: number };
  phaseMinutes: Partial<Record<Phase, number>>;
  /** Jev's answers (SP3 decision 13): every record's count, the defect marks, and verified over verified plus disputed. */
  verifications: {
    total: number;
    verified: number;
    disputed: number;
    unverified: number;
    agreement: number | null;
  };
  /** The base as the scope reads it (SP4 Task 5), without the rows: those stay in the CTO's inputs file. */
  knowledge: KnowledgeCounts;
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
export function computeMetrics(
  projects: CrewPaths[],
  knowledge: KnowledgeCounts = emptyKnowledge(),
): Metrics {
  const m: Metrics = {
    // Copied field by field: the figures carry rows (`KnowledgeFigures`) and the metrics never do.
    knowledge: {
      entries: { ...knowledge.entries },
      confirmed: knowledge.confirmed,
      contradicted: knowledge.contradicted,
      cited: knowledge.cited,
    },
    projects: projects.map((p) => p.root),
    items: { total: 0, byRoute: {}, byType: {}, byKind: {} },
    rounds: { judgement: 0, validation: 0, gate: 0 },
    tokens: { byRole: {}, byPersonality: {}, total: 0 },
    defects: { byReviewer: {} },
    tasks: { opened: 0, proven: 0, unproven: 0 },
    objections: { byStatus: {} },
    decisions: { total: 0, byUser: 0, byValidator: 0, byAgent: 0 },
    gates: { notRun: 0, skipped: 0 },
    phaseMinutes: {},
    verifications: { total: 0, verified: 0, disputed: 0, unverified: 0, agreement: null },
  };
  const phaseTotals: Partial<Record<Phase, number>> = {};
  const agreementOf = () => {
    const judged = m.verifications.verified + m.verifications.disputed;
    return judged ? Math.round((m.verifications.verified / judged) * 100) / 100 : null;
  };
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
      count(m.items.byKind, kindOfItem(work));
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
        // A decision with no `by` was recorded before it was named, and reads as the user's, as an
        // Approval does (finding 53).
        if (d.by === "user" || d.by === undefined) m.decisions.byUser += 1;
        else if (d.by === "validator") m.decisions.byValidator += 1;
        else if (d.by === "agent") m.decisions.byAgent += 1;
      }
      const evidence = loadEvidence(paths, id).evidence;
      for (const r of evidence.roles ?? []) {
        count(m.tokens.byRole, r.agent.replace(/-\d+$/, ""), r.tokens);
        if (r.personality) count(m.tokens.byPersonality, r.personality, r.tokens);
        m.tokens.total += r.tokens;
      }
      // With no role record (a session without the SubagentStop hook, finding 66), the rulings'
      // own tokens are the item's count; with one, they are already in it.
      if (!evidence.roles?.length)
        for (const j of evidence.judgement ?? []) m.tokens.total += j.tokens ?? 0;
      for (const j of evidence.judgement ?? []) {
        if (j.verdict === "not-run") m.gates.notRun += 1;
        const upheld = j.findings.filter((f) => f.severity === "defect" && !f.outside);
        if (upheld.length)
          count(m.defects.byReviewer, j.reviewer ?? `review-${j.gate}`, upheld.length);
        for (const f of upheld) if (f.verification) m.verifications[f.verification.status] += 1;
      }
      m.verifications.total += evidence.verifications?.length ?? 0;
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
  m.verifications.agreement = agreementOf();
  return m;
}

/** `  knowledge: 5 entries (general 2, validated-solution 3), confirmed 4, contradicted 1, cited by 2 items`. */
function knowledgeLine(k: KnowledgeCounts): string {
  const total = Object.values(k.entries).reduce((a, b) => a + b, 0);
  const kinds = Object.entries(k.entries)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, n]) => `${kind} ${n}`)
    .join(", ");
  return `  knowledge: ${total} entr${total === 1 ? "y" : "ies"}${kinds ? ` (${kinds})` : ""}, confirmed ${k.confirmed}, contradicted ${k.contradicted}, cited by ${k.cited} item${k.cited === 1 ? "" : "s"}`;
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
    `  items: ${m.items.total}${m.items.total ? ` (${pairs(m.items.byRoute)}; ${pairs(m.items.byKind)})` : ""}`,
    `  rounds: judgement ${m.rounds.judgement}, validation ${m.rounds.validation}, gate ${m.rounds.gate}`,
    `  tokens: ${m.tokens.total}${m.tokens.total ? ` (${pairs(m.tokens.byRole)})` : ""}`,
    `  defects upheld: ${Object.values(m.defects.byReviewer).reduce((a, b) => a + b, 0)}${Object.keys(m.defects.byReviewer).length ? ` (${pairs(m.defects.byReviewer)})` : ""}`,
    `  tasks: ${m.tasks.opened} opened, ${m.tasks.proven} proven, ${m.tasks.unproven} unproven`,
    `  decisions: ${m.decisions.total} (user ${m.decisions.byUser}, validator ${m.decisions.byValidator}, agent ${m.decisions.byAgent})`,
    `  verifications: ${m.verifications.total} (defects verified ${m.verifications.verified}, disputed ${m.verifications.disputed}, unverified ${m.verifications.unverified}; agreement ${m.verifications.agreement === null ? "none" : m.verifications.agreement})`,
    `  gates: ${m.gates.notRun} not run, ${m.gates.skipped} skipped`,
    `  minutes per phase: ${Object.keys(m.phaseMinutes).length ? pairs(m.phaseMinutes as Record<string, number>) : "none yet"}`,
    knowledgeLine(m.knowledge),
  ].join("\n");
}
