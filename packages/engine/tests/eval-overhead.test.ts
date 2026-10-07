import { expect, test } from "bun:test";
import { overheadByCase } from "../../../scripts/eval-overhead.ts";
import sample from "./fixtures/aggregate-result.sample.json";

test("reads with and without costs per case and computes the ratio", () => {
  const rows = overheadByCase(sample);
  expect(rows).toEqual([
    { name: "fast-route-overhead", withUsd: 0.6, withoutUsd: 0.5, ratio: 1.2 },
    { name: "false-done", withUsd: 0.9, withoutUsd: null, ratio: null },
  ]);
});
