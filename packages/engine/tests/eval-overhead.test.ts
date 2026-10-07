import { expect, test } from "bun:test";
import { hasAnyCost, overheadByCase } from "../../../scripts/eval-overhead.ts";
import sample from "./fixtures/aggregate-result.sample.json";

test("reads with and without costs per case and computes the ratio", () => {
  const rows = overheadByCase(sample);
  expect(rows).toEqual([
    { name: "fast-route-overhead", withUsd: 0.6, withoutUsd: 0.5, ratio: 1.2 },
    { name: "false-done", withUsd: 0.9, withoutUsd: null, ratio: null },
  ]);
  expect(hasAnyCost(rows)).toBe(true);
});

test("runs without any known cost field read as no cost at all", () => {
  const noCost = {
    cases: [{ name: "false-done", arms: { with: [{ tokens: 10 }], without: [{ tokens: 8 }] } }],
  };
  const rows = overheadByCase(noCost);
  expect(rows).toEqual([{ name: "false-done", withUsd: null, withoutUsd: null, ratio: null }]);
  expect(hasAnyCost(rows)).toBe(false);
});
