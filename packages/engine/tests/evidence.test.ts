import { expect, test } from "bun:test";
import {
  computeVerdict,
  emptyEvidence,
  loadEvidence,
  renderReport,
  saveEvidence,
} from "../src/evidence.ts";
import type { Evidence, GateRun, RunRecord, WorkItem } from "../src/types.ts";
import { addCriterion, addSkip, createWork } from "../src/work.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

const run: RunRecord = {
  command: "npm run test",
  exit: 0,
  at: "t",
  durationMs: 5,
  log: "logs/x",
  tail: "",
  timedOut: false,
};
function gate(
  gate: GateRun["gate"],
  status: GateRun["status"],
  extra: Partial<GateRun> = {},
): GateRun {
  return {
    gate,
    target: ".",
    command: "cmd",
    commandSource: "detected",
    confirmed: true,
    exit: status === "pass" ? 0 : 1,
    status,
    durationMs: 1,
    at: "t",
    log: null,
    tail: "",
    fingerprint: "f",
    ...extra,
  };
}
function workWith(paths: ReturnType<typeof repoPaths>): WorkItem {
  const work = createWork(paths, "fix");
  addCriterion(work, "x");
  return work;
}

test("evidence loads empty and round-trips", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  expect(loadEvidence(paths, work.id)).toEqual({ evidence: emptyEvidence(), tampered: false });
  const evidence: Evidence = { ...emptyEvidence(), fingerprint: "f" };
  saveEvidence(paths, work.id, evidence);
  expect(loadEvidence(paths, work.id).evidence.fingerprint).toBe("f");
});

test("the verdict names every reason the work is not proven", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const expected = [
    { gate: "secrets" as const, target: "." },
    { gate: "test" as const, target: "." },
    { gate: "lint" as const, target: "." },
  ];
  const evidence: Evidence = {
    fingerprint: "old",
    tdd: [],
    runs: [
      gate("secrets", "pass"),
      gate("test", "fail"),
      gate("lint", "unavailable", { reason: "no command" }),
    ],
    verdict: "unproven",
    unproven: [],
  };
  expect(
    computeVerdict({ work, evidence, expected, currentFingerprint: "new", tampered: true }),
  ).toEqual({
    verdict: "unproven",
    unproven: [
      "state changed outside the engine",
      "code changed since the last gate run",
      "gate test failing",
      "gate lint unavailable: no command",
      "test-first record missing for AC-1",
    ],
  });
});

test("skips, unconfirmed commands and a matching fingerprint", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  addSkip(work, "gate:lint", "legacy code");
  addSkip(work, "tdd:AC-1", "manual");
  const expected = [
    { gate: "test" as const, target: "." },
    { gate: "lint" as const, target: "." },
  ];
  const evidence: Evidence = {
    fingerprint: "f",
    tdd: [],
    runs: [gate("test", "pass", { confirmed: false, commandSource: "proposed" })],
    verdict: "unproven",
    unproven: [],
  };
  expect(
    computeVerdict({ work, evidence, expected, currentFingerprint: "f", tampered: false }).unproven,
  ).toEqual(["gate test ran an unconfirmed command (crew profile confirm)"]);
  const confirmed: Evidence = {
    ...evidence,
    runs: [gate("test", "pass")],
    tdd: [{ criterion: "AC-1", red: run, green: run }],
  };
  expect(
    computeVerdict({
      work,
      evidence: confirmed,
      expected,
      currentFingerprint: "f",
      tampered: false,
    }),
  ).toEqual({ verdict: "proven", unproven: [] });
});

test("the report says what was proven and what was not", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = workWith(paths);
  addSkip(work, "gate:lint", "legacy code");
  const evidence: Evidence = {
    fingerprint: "f",
    tdd: [{ criterion: "AC-1", red: { ...run, exit: 1 }, green: run }],
    runs: [gate("test", "pass"), gate("deps", "fail")],
    verdict: "unproven",
    unproven: ["gate deps failing"],
  };
  const report = renderReport(work, evidence);
  expect(report).toContain("# Report: fix");
  expect(report).toContain("**Not proven**");
  expect(report).toContain("gate deps failing");
  expect(report).toContain("| AC-1 | behavior | x | red then green |");
  expect(report).toContain("| test | . | pass |");
  expect(report).toContain("gate:lint");
  expect(report).toContain("legacy code");
});

test("an item with no criteria is never proven, whatever the gates say", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "fix");
  const expected = [{ gate: "test" as const, target: "." }];
  const evidence: Evidence = {
    fingerprint: "f",
    tdd: [],
    runs: [gate("test", "pass")],
    verdict: "unproven",
    unproven: [],
  };
  expect(
    computeVerdict({ work, evidence, expected, currentFingerprint: "f", tampered: false }),
  ).toEqual({
    verdict: "unproven",
    unproven: ['no acceptance criteria (crew criteria <id> add "...")'],
  });
});
