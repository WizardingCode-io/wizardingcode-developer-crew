/**
 * The strategy of a new project (SP7 §7.3, SP8 Task 3): `strategy.md` with five sections, every
 * claim marked with a researched fact of `conclave/researcher.md`, and a scaling table with at
 * least one row. The engine checks the shape and the sources; the judge rules the substance. Until
 * the knowledge base of SP4 the strategy is written from the research alone, and says so.
 */
import { sha256 } from "./fs.ts";
import type { Evidence, JudgementRecord } from "./types.ts";

export const STRATEGY_SECTIONS = ["Viability", "Cost", "Time", "Stack", "Scaling phases"] as const;
export type StrategySection = (typeof STRATEGY_SECTIONS)[number];

/** What the status and the report say of every strategy until SP4 lands. */
export const RESEARCH_ALONE = "from the research alone (no knowledge base until SP4)";

export interface ScalingRow {
  trigger: string;
  change: string;
  cost: string;
}

export interface ParsedStrategy {
  /** The sections present, in the order written. */
  present: StrategySection[];
  /** The bullets of the first four sections (the scaling section holds a table). */
  bullets: Record<StrategySection, string[]>;
  rows: ScalingRow[];
}

const FACT_HEADINGS = new Set(["What the code does today", "What the documentation says"]);
const MARK = /\[R(\d+)\]/g;
const KNOWLEDGE_MARK = /\[K:[^\]]+\]/g;
const SEPARATOR_CELL = /^:?-+:?$/;

function isSection(name: string): name is StrategySection {
  return (STRATEGY_SECTIONS as readonly string[]).includes(name);
}

export function parseStrategy(text: string): ParsedStrategy {
  const bullets: Record<StrategySection, string[]> = {
    Viability: [],
    Cost: [],
    Time: [],
    Stack: [],
    "Scaling phases": [],
  };
  const present: StrategySection[] = [];
  const rows: ScalingRow[] = [];
  let current: StrategySection | null = null;
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      const name = (heading[1] ?? "").trim();
      current = isSection(name) ? name : null;
      if (current && !present.includes(current)) present.push(current);
      continue;
    }
    if (!current) continue;
    if (current === "Scaling phases") {
      if (!line.startsWith("|")) continue;
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.every((c) => SEPARATOR_CELL.test(c))) continue;
      if (cells.map((c) => c.toLowerCase()).join("|") === "trigger|change|cost") continue;
      rows.push({ trigger: cells[0] ?? "", change: cells[1] ?? "", cost: cells[2] ?? "" });
    } else if (line.startsWith("- ")) bullets[current].push(line.slice(2).trim());
  }
  return { present, bullets, rows };
}

/** The 1-based lines of `conclave/researcher.md` a mark may name: a `- ` line under the two fact headings, `- none` aside. */
export function factLines(researcherText: string): Set<number> {
  const facts = new Set<number>();
  let under = false;
  researcherText.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      under = FACT_HEADINGS.has((heading[1] ?? "").trim());
      return;
    }
    if (under && line.startsWith("- ") && line.trim() !== "- none") facts.add(i + 1);
  });
  return facts;
}

/** The faults of a strategy against the research as it stands: none for a sound one. */
export function checkStrategy(text: string, researcherText: string): string[] {
  const faults: string[] = [];
  const parsed = parseStrategy(text);
  const facts = factLines(researcherText);
  for (const section of STRATEGY_SECTIONS) {
    const empty =
      section === "Scaling phases"
        ? !parsed.present.includes(section)
        : parsed.bullets[section].length === 0;
    if (empty) {
      faults.push(`a "${section}" section with content in strategy.md`);
      continue;
    }
    if (section === "Scaling phases") {
      if (parsed.rows.length === 0)
        faults.push(
          "no row in the Scaling phases table (| Trigger | Change | Cost |): every project has a first trigger at which its design changes",
        );
      parsed.rows.forEach((row, i) => {
        if (!row.trigger || !row.change || !row.cost)
          faults.push(`row ${i + 1} of the Scaling phases table has an empty cell`);
      });
      continue;
    }
    for (const bullet of parsed.bullets[section]) {
      const knowledge = bullet.match(KNOWLEDGE_MARK) ?? [];
      for (const k of knowledge)
        faults.push(`${k} in ${section}: knowledge entries arrive with SP4`);
      const marks = [...bullet.matchAll(MARK)].map((m) => Number(m[1]));
      if (marks.length === 0 && knowledge.length === 0)
        faults.push(
          `no mark on "${bullet.slice(0, 60)}" in ${section}: every claim ends with [R<n>] naming a fact line of conclave/researcher.md`,
        );
      for (const n of marks)
        if (!facts.has(n))
          faults.push(`[R${n}] in ${section} is not a fact line of conclave/researcher.md`);
    }
  }
  return faults;
}

/** The hash a strategy ruling is stamped with: both files, so an edit to either makes the ruling stale. */
export function strategyHash(strategyText: string, researcherText: string): string {
  return sha256(`${strategyText}\n---\n${researcherText}`);
}

export interface StrategyReport {
  faults: string[];
  counts: Record<StrategySection, number>;
  rows: number;
  ruling: {
    verdict: JudgementRecord["verdict"];
    reviewer: string;
    findings: number;
    stale: boolean;
  } | null;
}

/** What the status and the report say of the strategy as it stands; null without a document. */
export function strategyReport(
  strategyText: string | null,
  researcherText: string | null,
  evidence: Pick<Evidence, "judgement"> | null,
): StrategyReport | null {
  if (strategyText === null) return null;
  const research = researcherText ?? "";
  const parsed = parseStrategy(strategyText);
  const counts: Record<StrategySection, number> = {
    Viability: parsed.bullets.Viability.length,
    Cost: parsed.bullets.Cost.length,
    Time: parsed.bullets.Time.length,
    Stack: parsed.bullets.Stack.length,
    "Scaling phases": 0,
  };
  const faults =
    researcherText === null ? [RESEARCHER_FIRST] : checkStrategy(strategyText, research);
  const record = evidence?.judgement?.find((j) => j.gate === "strategy") ?? null;
  const ruling = record
    ? {
        verdict: record.verdict,
        reviewer: record.reviewer ?? "judge",
        findings: record.findings.length,
        stale: record.fingerprint !== strategyHash(strategyText, research),
      }
    : null;
  return { faults, counts, rows: parsed.rows.length, ruling };
}

export const RESEARCHER_FIRST =
  "conclave/researcher.md: the researcher's pass comes before the strategy (references/strategy.md)";

/** The ruling's word as the status and the report print it. */
export function verdictText(verdict: JudgementRecord["verdict"]): string {
  return verdict === "not-proven" ? "not proven" : verdict === "not-run" ? "not run" : "proven";
}
