import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { emptyEvidence } from "../src/evidence.ts";
import {
  addObjection,
  bindObjection,
  blockingObjections,
  ledgerPath,
  loadLedger,
  objectionStatus,
  saveLedger,
  waiveObjection,
} from "../src/objections.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type { Evidence, ObjectionLedger, RunRecord } from "../src/types.ts";
import { addCriterion, createWork } from "../src/work.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

const run: RunRecord = {
  command: "x",
  exit: 0,
  at: "t",
  durationMs: 1,
  log: "l",
  tail: "",
  timedOut: false,
};

test("SP2a: objections are numbered once, bound to a criterion, waived by a person, never by the validator", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ac = addCriterion(work, "the sync is gated");
  const { ledger } = loadLedger(paths, work.id);
  expect(ledger).toEqual({ objections: [] });
  const o1 = addObjection(
    ledger,
    "the full sync would re-subscribe everyone",
    "fault-finder",
    "blocking",
  );
  const o2 = addObjection(
    ledger,
    "a support ticket's delete may mean erasure",
    "gap-round",
    "advisory",
  );
  expect([o1.id, o2.id]).toEqual(["O-1", "O-2"]);
  expect(bindObjection(ledger, work, "O-1", "AC-9")).toEqual({
    refused: "unknown criterion: AC-9",
  });
  expect(bindObjection(ledger, work, "O-1", ac.id)).toMatchObject({ id: "O-1", criterion: ac.id });
  expect(
    waiveObjection(ledger, "O-2", "soft delete chosen knowingly", {
      by: "validator",
      mode: "dontAsk",
      rule: "complete-gap-round",
    }),
  ).toEqual({
    refused:
      "the validator never waives an objection; a person does, or it is bound to a criterion",
  });
  expect(
    waiveObjection(ledger, "O-2", "soft delete chosen knowingly", { by: "user" }),
  ).toMatchObject({
    waived: { reason: "soft delete chosen knowingly", by: "user" },
  });
  expect(bindObjection(ledger, work, "O-2", ac.id)).toEqual({
    refused: "O-2 is waived; it stays waived",
  });
  expect(waiveObjection(ledger, "O-7", "x", { by: "user" })).toEqual({
    refused: "unknown objection: O-7",
  });
  saveLedger(paths, work.id, ledger);
  expect(existsSync(ledgerPath(paths, work.id))).toBe(true);
  expect(loadLedger(paths, work.id).ledger.objections.map((o) => o.id)).toEqual(["O-1", "O-2"]);
});

test("SP2a: status follows the bound criterion's proof and whether a waiver counts", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  const ac = addCriterion(work, "x");
  const ledger: ObjectionLedger = { objections: [] };
  const open = addObjection(ledger, "open", "fault-finder", "blocking");
  const bound = addObjection(ledger, "bound", "fault-finder", "blocking");
  bindObjection(ledger, work, bound.id, ac.id);
  const waivedByAgent = addObjection(ledger, "waived by the agent", "gap-round", "blocking");
  waiveObjection(ledger, waivedByAgent.id, "no time", { by: "agent", mode: "dontAsk" });
  const none: Evidence = emptyEvidence();
  expect(objectionStatus(open, work, none, DEFAULT_POLICY)).toBe("open");
  expect(objectionStatus(bound, work, none, DEFAULT_POLICY)).toBe("bound");
  const proven: Evidence = { ...none, tdd: [{ criterion: ac.id, red: run, green: run }] };
  expect(objectionStatus(bound, work, proven, DEFAULT_POLICY)).toBe("resolved");
  expect(objectionStatus(waivedByAgent, work, none, DEFAULT_POLICY)).toBe("open");
  expect(
    objectionStatus(waivedByAgent, work, none, { ...DEFAULT_POLICY, unattendedDecisions: "count" }),
  ).toBe("waived");
  expect(blockingObjections(ledger, work, none, DEFAULT_POLICY, ["open"]).map((o) => o.id)).toEqual(
    [open.id, waivedByAgent.id],
  );
  expect(
    blockingObjections(ledger, work, proven, DEFAULT_POLICY, ["open", "bound"]).map((o) => o.id),
  ).toEqual([open.id, waivedByAgent.id]);
});
