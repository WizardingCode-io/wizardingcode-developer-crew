import { expect, test } from "bun:test";
import { listDecisions } from "../src/decisions.ts";
import { item } from "./decision-fixtures.ts";

test("2026-11-12-003 AC-1 (finding 182): crew decision add refuses a text that is a placeholder whole, names the gap round's word and records nothing", async () => {
  const { run, id, paths, work } = await item();
  const before = listDecisions(paths).length;
  for (const text of ["none", "None.", '"n/a"', "N/A", "NA", "na.", "-", "...", " — ", "'none'"]) {
    const refused = await run("decision", id, "add", text);
    expect(refused.code, text).toBe(1);
    expect(refused.out, text).toBe("");
    expect(refused.err.trim(), text).toBe(
      `"${text.trim()}" is no decision: under the gap round's heading "Decisions only the user can make" the word none means there is no decision, and nothing is recorded for it; a decision is a question only the user can answer`,
    );
  }
  expect(work().decisions ?? []).toEqual([]);
  expect(listDecisions(paths).length).toBe(before);
  // The placeholder is refused with its flags too: a default does not make it a question.
  expect((await run("decision", id, "add", "none", "--default", "keep it")).code).toBe(1);
  expect(work().decisions ?? []).toEqual([]);
});

test("2026-11-12-003 AC-2: a question that holds the word among others, one with no ASCII letter and one whose default is none are filed as before", async () => {
  const { run, id, work } = await item();
  const held = await run(
    "decision",
    id,
    "add",
    "Should the export keep none of the archived rows?",
  );
  expect(held.code).toBe(0);
  expect(held.out).toBe("D-1: Should the export keep none of the archived rows?\n");
  expect((await run("decision", id, "add", "Какой вариант?")).out).toBe("D-2: Какой вариант?\n");
  expect((await run("decision", id, "add", "Which copy?", "--default", "none")).out).toBe(
    "D-3: Which copy? (default: none)\n",
  );
  expect((await run("decision", id, "add", "N/A or zero for a missing price?")).out).toBe(
    "D-4: N/A or zero for a missing price?\n",
  );
  expect((await run("decision", id, "add", "7?")).out).toBe("D-5: 7?\n");
  expect(work().decisions?.map((d) => d.id)).toEqual(["D-1", "D-2", "D-3", "D-4", "D-5"]);
  // No text at all keeps the usage it has.
  expect((await run("decision", id, "add", "  ")).err.trim()).toBe(
    'usage: crew decision <id> add "<question>" [--default "<answer>"] [--supersedes D-n]',
  );
});
