import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { workDir } from "../src/paths.ts";
import { loadState } from "../src/state.ts";
import type { Evidence, RunRecord } from "../src/types.ts";
import {
  activeWork,
  addCriterion,
  addSkip,
  advancePhase,
  applyClassification,
  approve,
  createWork,
  type GuardContext,
  guardFor,
  hasAcceptanceSection,
  loadWork,
  raiseRoute,
  saveWork,
} from "../src/work.ts";
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
const empty: GuardContext = {
  specText: null,
  planExists: false,
  evidence: null,
  proven: false,
  unproven: [],
};

test("createWork writes the item and the brief and makes it active", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "The cart total ignores the discount\n\nSteps: add a coupon.");
  expect(work.id).toMatch(/^\d{4}-\d{2}-\d{2}-001-the-cart-total-ignores-the-discount$/);
  expect(work.title).toBe("The cart total ignores the discount");
  expect(work.phase).toBe("receive");
  expect(existsSync(join(workDir(paths, work.id), "work.json"))).toBe(true);
  expect(readFileSync(join(workDir(paths, work.id), "brief.md"), "utf8")).toContain("add a coupon");
  expect(loadState(paths).active).toBe(work.id);
  expect(activeWork(paths)?.work?.id).toBe(work.id);
  expect(createWork(paths, "Second").id).toMatch(/-002-second$/);
});

test("classification sets type, route and risk, and routes only go up", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "fix");
  applyClassification(work, "fix", { route: "fast", reasons: ["r"], riskAreas: [] });
  expect(work).toMatchObject({ type: "fix", route: "fast", phase: "recognize" });
  expect(raiseRoute(work, "full", "touches app/Auth")).toBe(true);
  expect(work.routeReasons).toEqual(["r", "raised to full: touches app/Auth"]);
  expect(raiseRoute(work, "standard", "x")).toBe(false);
  saveWork(paths, work);
  expect(loadWork(paths, work.id).work?.route).toBe("full");
});

test("guards: build needs criteria, then spec, approval and plan by route", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "feature");
  applyClassification(work, "feature", { route: "fast", reasons: [], riskAreas: [] });
  expect(guardFor(work, "build", empty)).toEqual([
    'at least one acceptance criterion (crew criteria <id> add "...")',
  ]);
  addCriterion(work, "The total subtracts the discount.");
  expect(guardFor(work, "build", empty)).toEqual([]);
  work.route = "full";
  expect(guardFor(work, "build", empty)).toEqual([
    "spec.md in the work folder",
    "the user's approval of the spec (crew approve <id> spec)",
    "plan.md in the work folder",
  ]);
  expect(hasAcceptanceSection("# Spec\n\n## Acceptance criteria\n\n- AC-1 x\n")).toBe(true);
  expect(hasAcceptanceSection("# Spec\n\n## Acceptance criteria\n\n## Risks\n")).toBe(false);
  approve(work, "spec");
  const ready = { ...empty, specText: "## Acceptance criteria\n- x\n", planExists: true };
  expect(guardFor(work, "build", ready)).toEqual([]);
});

test("guards: gate needs test-first records per criterion kind, deliver needs proof", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "refactor");
  const behaviour = addCriterion(work, "x");
  const preserve = addCriterion(work, "keep", "preserve");
  expect(guardFor(work, "gate", empty)).toEqual([
    `test-first record for ${behaviour.id} (crew tdd red/green)`,
    `test-first record for ${preserve.id} (crew tdd before/after)`,
  ]);
  const evidence: Evidence = {
    fingerprint: "f",
    tdd: [
      { criterion: behaviour.id, red: run, green: run },
      { criterion: preserve.id, before: run },
    ],
    runs: [],
    verdict: "unproven",
    unproven: [],
  };
  expect(guardFor(work, "gate", { ...empty, evidence })).toEqual([
    `test-first record for ${preserve.id} (crew tdd before/after)`,
  ]);
  addSkip(work, `tdd:${preserve.id}`, "manual check");
  expect(guardFor(work, "gate", { ...empty, evidence })).toEqual([]);
  expect(guardFor(work, "deliver", { ...empty, unproven: ["gate test failing"] })).toEqual([
    "not proven: gate test failing",
  ]);
  expect(guardFor(work, "deliver", { ...empty, proven: true })).toEqual([]);
});

test("advancePhase follows the route and stops at a failing guard", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const work = createWork(paths, "fix");
  applyClassification(work, "fix", { route: "fast", reasons: [], riskAreas: [] });
  expect(advancePhase(work, empty)).toEqual({
    ok: false,
    missing: ['at least one acceptance criterion (crew criteria <id> add "...")'],
  });
  addCriterion(work, "x");
  expect(advancePhase(work, empty)).toEqual({ ok: true, phase: "build" });
  expect(work.phase).toBe("build");
});
