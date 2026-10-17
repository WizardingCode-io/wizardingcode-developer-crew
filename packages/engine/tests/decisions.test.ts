import { expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  appendDecision,
  decisionLine,
  decisionsCount,
  listDecisions,
  registerTampered,
} from "../src/decisions.ts";
import { readProtectedJson } from "../src/store.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

test("SP7a AC-1 (Task 5): the register is appended through the engine, listed newest first, filtered by text, printed as one line each, and protected", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(decisionsCount(paths)).toBe(0);
  expect(listDecisions(paths)).toEqual([]);
  expect(registerTampered(paths)).toBe(false);
  appendDecision(paths, {
    at: "2026-10-17T10:00:00.000Z",
    item: "w1",
    kind: "decision",
    id: "D-1",
    text: "Erasure or deactivation?",
    answer: "keep the rows",
    by: "the user",
  });
  appendDecision(paths, {
    at: "2026-10-17T11:00:00.000Z",
    item: "w2",
    kind: "ruling",
    text: "code-quality defect: src/a.ts:3 a magic number",
    by: "the judge",
    file: "review/ruling.json",
  });
  expect(decisionsCount(paths)).toBe(2);
  expect(listDecisions(paths).map((e) => e.item)).toEqual(["w2", "w1"]);
  // The grep reads the text, the answer and the id, each matched on its own, case-insensitive.
  expect(listDecisions(paths, "ERASURE").map((e) => e.id)).toEqual(["D-1"]);
  expect(listDecisions(paths, "rows").map((e) => e.id)).toEqual(["D-1"]);
  expect(listDecisions(paths, "d-1").map((e) => e.id)).toEqual(["D-1"]);
  expect(listDecisions(paths, "magic").map((e) => e.item)).toEqual(["w2"]);
  expect(listDecisions(paths, "nothing")).toEqual([]);
  expect(decisionLine(listDecisions(paths)[1] as never)).toBe(
    "2026-10-17 · w1 · decision · D-1 Erasure or deactivation? → keep the rows (by the user)",
  );
  expect(decisionLine(listDecisions(paths)[0] as never)).toBe(
    "2026-10-17 · w2 · ruling · code-quality defect: src/a.ts:3 a magic number (by the judge)",
  );
  const file = join(paths.crewDir, "decisions.json");
  expect(readProtectedJson(paths, file).tampered).toBe(false);
  // A hand edit is read as tampered, as the ledger's would be.
  writeFileSync(file, readFileSync(file, "utf8").replace("keep the rows", "drop the rows"));
  expect(registerTampered(paths)).toBe(true);
});
