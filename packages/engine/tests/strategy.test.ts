import { expect, test } from "bun:test";
import {
  checkStrategy,
  factLines,
  parseStrategy,
  STRATEGY_SECTIONS,
  strategyHash,
  strategyReport,
} from "../src/strategy.ts";

export const RESEARCH = [
  "# Research for x",
  "## What the code does today",
  "- src/a.ts:1 · the module exports nothing",
  "## What the documentation says",
  '- https://example.invalid/docs · "The limit is ten." · D-1 bound',
  "## Prior solutions",
  "- none",
  "## What the facts do not settle",
  "- D-1 · the cache's size",
  "",
].join("\n");

export const STRATEGY = [
  "# Strategy",
  "",
  "## Viability",
  "- One service serves the need [R3]",
  "",
  "## Cost",
  "- Two weeks of one developer [R5]",
  "",
  "## Time",
  "- Four weeks to the first release [R3] [R5]",
  "",
  "## Stack",
  "- From the research alone (no knowledge base until SP4): the stack the project has [R3]",
  "",
  "## Scaling phases",
  "",
  "| Trigger | Change | Cost |",
  "| :- | :- | :- |",
  "| 10k users | the queue becomes a service | 2 weeks |",
  "",
].join("\n");

test("SP8-T3 AC-1: parseStrategy reads the five sections, their bullets and the scaling rows; factLines names the researcher's fact lines alone", () => {
  expect(STRATEGY_SECTIONS).toEqual(["Viability", "Cost", "Time", "Stack", "Scaling phases"]);
  const parsed = parseStrategy(STRATEGY);
  expect(parsed.present).toEqual([...STRATEGY_SECTIONS]);
  expect(parsed.bullets.Viability).toEqual(["One service serves the need [R3]"]);
  expect(parsed.bullets.Time).toEqual(["Four weeks to the first release [R3] [R5]"]);
  expect(parsed.rows).toEqual([
    { trigger: "10k users", change: "the queue becomes a service", cost: "2 weeks" },
  ]);
  expect([...factLines(RESEARCH)]).toEqual([3, 5]);
});

test("SP8-T3 AC-1: checkStrategy names a missing section, an unmarked bullet, a mark on a non-fact line, a knowledge mark, an empty table and a row with an empty cell, and passes a sound strategy", () => {
  expect(checkStrategy(STRATEGY, RESEARCH)).toEqual([]);
  const noCost = STRATEGY.replace("## Cost\n- Two weeks of one developer [R5]\n\n", "");
  expect(checkStrategy(noCost, RESEARCH)).toEqual(['a "Cost" section with content in strategy.md']);
  const unmarked = STRATEGY.replace(
    "- One service serves the need [R3]",
    "- One service serves the need",
  );
  expect(checkStrategy(unmarked, RESEARCH)).toEqual([
    'no mark on "One service serves the need" in Viability: every claim ends with [R<n>] naming a fact line of conclave/researcher.md',
  ]);
  const heading = STRATEGY.replace("[R5]\n\n## Time", "[R2]\n\n## Time");
  expect(checkStrategy(heading, RESEARCH)).toEqual([
    "[R2] in Cost is not a fact line of conclave/researcher.md",
  ]);
  const none = STRATEGY.replace("[R5]\n\n## Time", "[R7]\n\n## Time");
  expect(checkStrategy(none, RESEARCH)).toEqual([
    "[R7] in Cost is not a fact line of conclave/researcher.md",
  ]);
  const knowledge = STRATEGY.replace("the project has [R3]", "the project has [K:stack-1]");
  expect(checkStrategy(knowledge, RESEARCH)).toEqual([
    "[K:stack-1] in Stack: stack-1 is not listed in knowledge.md (not in the base, or marked for another workspace: rule 13)",
  ]);
  // A listed entry is a mark like a researched fact (SP4 Task 3).
  expect(checkStrategy(knowledge, RESEARCH, ["stack-1"])).toEqual([]);
  const noRows = STRATEGY.replace("| 10k users | the queue becomes a service | 2 weeks |\n", "");
  expect(checkStrategy(noRows, RESEARCH)).toEqual([
    "no row in the Scaling phases table (| Trigger | Change | Cost |): every project has a first trigger at which its design changes",
  ]);
  const emptyCell = STRATEGY.replace("| 2 weeks |", "|  |");
  expect(checkStrategy(emptyCell, RESEARCH)).toEqual([
    "row 1 of the Scaling phases table has an empty cell",
  ]);
  expect(checkStrategy("# Strategy\n", RESEARCH)).toHaveLength(5);
});

test("SP8-T3 AC-2, AC-4: strategyHash covers both files, and strategyReport counts the claims, the rows, the faults and the ruling's state", () => {
  const h = strategyHash(STRATEGY, RESEARCH);
  expect(h).toMatch(/^[0-9a-f]{64}$/);
  expect(strategyHash(`${STRATEGY}\n- more [R3]\n`, RESEARCH)).not.toBe(h);
  expect(strategyHash(STRATEGY, `${RESEARCH}- src/b.ts:2 · another\n`)).not.toBe(h);
  const record = {
    gate: "strategy" as const,
    verdict: "proven" as const,
    reviewer: "cto",
    judge: "judge",
    findings: [],
    at: "2026-10-19T10:00:00.000Z",
    fingerprint: h,
  };
  const report = strategyReport(STRATEGY, RESEARCH, { judgement: [record] });
  expect(report).toEqual({
    faults: [],
    counts: { Viability: 1, Cost: 1, Time: 1, Stack: 1, "Scaling phases": 0 },
    rows: 1,
    ruling: { verdict: "proven", reviewer: "cto", findings: 0, stale: false },
  });
  const stale = strategyReport(`${STRATEGY}\n`, RESEARCH, { judgement: [record] });
  expect(stale?.ruling).toEqual({ verdict: "proven", reviewer: "cto", findings: 0, stale: true });
  expect(strategyReport(STRATEGY, RESEARCH, { judgement: [] })?.ruling).toBeNull();
  expect(strategyReport(null, RESEARCH, null)).toBeNull();
});
