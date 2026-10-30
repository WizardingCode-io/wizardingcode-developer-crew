// The checker of a whole-tag run (2026-10-30-003 AC-4): what lets a release go out over the run's aggregates.
import { expect, test } from "bun:test";
import { checkTagRun } from "../../../scripts/tag-run-check.ts";

const aggregate = (startedAt: string, ...scores: [string, number][]) => ({
  startedAt,
  cases: scores.map(([name, score]) => ({ name, aggregates: { score } })),
});
const since = "2026-10-30T12:00:00.000Z";
const later = "2026-10-30T13:00:00.000Z";

test("2026-10-30-003 AC-4: every named case at 1.00 passes, its latest run deciding; a missing case, one below 1.00, a run before the commit and an unreadable aggregate each fail, named", () => {
  const cases = ["a", "b"];
  expect(checkTagRun({ cases, since, aggregates: [aggregate(later, ["a", 1], ["b", 1])] })).toEqual(
    [],
  );
  // Across two aggregates: a re-run that passes counts, as does the latest over an earlier pass.
  expect(
    checkTagRun({
      cases,
      since,
      aggregates: [
        aggregate(later, ["a", 1], ["b", 0.8]),
        aggregate("2026-10-30T14:00:00.000Z", ["b", 1]),
      ],
    }),
  ).toEqual([]);
  expect(
    checkTagRun({
      cases,
      since,
      aggregates: [
        aggregate("2026-10-30T14:00:00.000Z", ["a", 1], ["b", 0.8]),
        aggregate(later, ["b", 1]),
      ],
    }),
  ).toEqual(["b: 0.80 in the latest run"]);
  // A case with no run.
  expect(checkTagRun({ cases, since, aggregates: [aggregate(later, ["a", 1])] })).toEqual([
    "b: no run",
  ]);
  // A run before the commit is no run of this tree.
  expect(
    checkTagRun({
      cases,
      since,
      aggregates: [aggregate("2026-10-30T11:00:00.000Z", ["a", 1], ["b", 1])],
    }),
  ).toEqual(["a: no run", "b: no run"]);
  // A case outside the tags does not count against them.
  expect(
    checkTagRun({ cases: ["a"], since, aggregates: [aggregate(later, ["a", 1], ["z", 0])] }),
  ).toEqual([]);
  // An aggregate that cannot be read fails: it may hold the run that decides.
  expect(
    checkTagRun({ cases, since, aggregates: [aggregate(later, ["a", 1], ["b", 1]), null] }),
  ).toEqual(["an aggregate could not be read"]);
  // Nothing to check is no pass.
  expect(checkTagRun({ cases: [], since, aggregates: [] })).toEqual(["no case carries the tags"]);
});
