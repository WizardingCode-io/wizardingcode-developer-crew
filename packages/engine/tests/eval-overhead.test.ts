import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  hasAnyCost,
  overheadByCase,
  readCeilings,
  rowLine,
} from "../../../scripts/eval-overhead.ts";
import sample from "./fixtures/aggregate-result.sample.json";

test("reads with and without costs per case and computes the ratio", () => {
  const rows = overheadByCase(sample);
  // No ceiling given: the ratio is read, nothing is judged (SP8 widened the row).
  expect(rows).toEqual([
    {
      name: "fast-route-overhead",
      withUsd: 0.6,
      withoutUsd: 0.5,
      ratio: 1.2,
      ceiling: null,
      verdict: null,
    },
    {
      name: "false-done",
      withUsd: 0.9,
      withoutUsd: null,
      ratio: null,
      ceiling: null,
      verdict: null,
    },
  ]);
  expect(hasAnyCost(rows)).toBe(true);
});

test("runs without any known cost field read as no cost at all", () => {
  const noCost = {
    cases: [{ name: "false-done", arms: { with: [{ tokens: 10 }], without: [{ tokens: 8 }] } }],
  };
  const rows = overheadByCase(noCost);
  expect(rows).toEqual([
    {
      name: "false-done",
      withUsd: null,
      withoutUsd: null,
      ratio: null,
      ceiling: null,
      verdict: null,
    },
  ]);
  expect(hasAnyCost(rows)).toBe(false);
});

test("SP8-T6 AC-2: the ceiling of a case is read from its prompt's front matter and each row says under or over it", () => {
  const evals = fileURLToPath(new URL("../../../plugins/core/evals/", import.meta.url));
  const ceilings = readCeilings(evals);
  expect(ceilings).toMatchObject({ "fast-route-overhead": 2.03, "issue-fast-overhead": 3.5 });
  expect(ceilings["false-done"]).toBeUndefined();
  expect(readCeilings()).toEqual({ "fast-route-overhead": 2.03, "issue-fast-overhead": 3.5 });
  expect(readCeilings("/nonexistent")).toEqual({});
  const rows = overheadByCase(sample, { "fast-route-overhead": 1.5, "false-done": 2 });
  expect(rows).toEqual([
    {
      name: "fast-route-overhead",
      withUsd: 0.6,
      withoutUsd: 0.5,
      ratio: 1.2,
      ceiling: 1.5,
      verdict: "under",
    },
    { name: "false-done", withUsd: 0.9, withoutUsd: null, ratio: null, ceiling: 2, verdict: null },
  ]);
  const [first, second] = rows;
  const [over] = overheadByCase(sample, { "fast-route-overhead": 1.1 });
  if (!first || !second || !over) throw new Error("two rows expected");
  expect(over.verdict).toBe("over");
  expect(rowLine(first)).toBe(
    "fast-route-overhead: with 0.6 USD · without 0.5 USD · 1.2x · under the 1.5x ceiling",
  );
  expect(rowLine(over)).toBe(
    "fast-route-overhead: with 0.6 USD · without 0.5 USD · 1.2x · over the 1.1x ceiling",
  );
  expect(rowLine(second)).toBe("false-done: with 0.9 USD · without n/a USD · n/a");
  expect(overheadByCase(sample)[0]).toMatchObject({ ceiling: null, verdict: null });
});
