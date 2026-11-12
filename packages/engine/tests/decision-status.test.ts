import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { GRANTED_TAIL, item } from "./decision-fixtures.ts";
import { cliIo, makeRepo, testEnv } from "./helpers.ts";

test("2026-11-12-003 AC-6 (finding 216): with no continuation on record and the policy at ask the status has no continuations line and no key; with no active item it prints what it prints today under either policy", async () => {
  const asked = await item();
  expect(await asked.line()).toBeUndefined();
  expect("continuations" in (await asked.json())).toBe(false);
  for (const policy of [undefined, { team: { continuations: "granted" } }]) {
    const root = makeRepo();
    if (policy) {
      mkdirSync(join(root, ".crew"), { recursive: true });
      writeFileSync(join(root, ".crew", "policy.json"), JSON.stringify(policy));
    }
    expect((await cliIo(root, testEnv())("status")).out).toBe("no active work item\n");
  }
});

test("2026-11-12-003 AC-6: the line groups the entries by what they continued and by who recorded them, counts the entries, and names the agent's entry not counted under a policy that does not count it", async () => {
  const { run, id, line, json, record } = await item();
  expect((await run("continue", id, "validation")).code).toBe(0);
  expect(await line()).toBe("  continuations: validation: 1 by the user, relayed by the agent");
  expect((await run("continue", id, "gate", "T-2", "--mode", "dontAsk")).code).toBe(0);
  expect((await run("continue", id, "gate", "T-2", "--mode", "dontAsk")).code).toBe(0);
  record([{ what: "judgement", by: { by: "user" }, at: "2026-11-12T10:00:00.000Z" }]);
  const text = (await line()) ?? "";
  expect(text).toBe(
    "  continuations: validation: 1 by the user, relayed by the agent; gate T-2: 2 by the agent in dontAsk mode (not counted under the policy); judgement: 1 by the user",
  );
  // The agent's group is never the user's: its part of the line does not name them.
  expect(text.split("; ")[1]).not.toContain("the user");
  expect((await json()).continuations).toEqual({
    policy: "ask",
    onRecord: [
      {
        what: "validation",
        by: "the user, relayed by the agent",
        standing: false,
        counted: true,
        rounds: 1,
      },
      {
        what: "gate",
        task: "T-2",
        by: "the agent in dontAsk mode",
        standing: false,
        counted: false,
        rounds: 2,
      },
      { what: "judgement", by: "the user", standing: false, counted: true, rounds: 1 },
    ],
  });
});

test("2026-11-12-003 AC-6: the agent's entry is counted where the policy sets unattendedDecisions to count", async () => {
  const { run, id, line, json } = await item({ unattendedDecisions: "count" });
  expect((await run("continue", id, "judgement", "--mode", "dontAsk")).code).toBe(0);
  expect(await line()).toBe("  continuations: judgement: 1 by the agent in dontAsk mode");
  expect((await json()).continuations).toEqual({
    policy: "ask",
    onRecord: [
      {
        what: "judgement",
        by: "the agent in dontAsk mode",
        standing: false,
        counted: true,
        rounds: 1,
      },
    ],
  });
});

test("2026-11-12-003 AC-6: under the granted policy the line says a round past a cap needs no crew continue, with none on record or with a target that holds a continuation of the user and rounds of the standing grant", async () => {
  const { run, id, line, json, record } = await item({ team: { continuations: "granted" } });
  expect(await line()).toBe(`  continuations: none on record; ${GRANTED_TAIL}`);
  expect((await json()).continuations).toEqual({ policy: "granted", onRecord: [] });
  // Finding 216's record: one continue of the user, then two rounds under the standing grant.
  expect((await run("continue", id, "validation")).code).toBe(0);
  const standing = { what: "validation", by: { by: "user" }, standing: true } as const;
  record([
    { ...standing, at: "2026-11-12T10:00:00.000Z" },
    { ...standing, at: "2026-11-12T11:00:00.000Z" },
  ]);
  expect(await line()).toBe(
    `  continuations: validation: 1 by the user, relayed by the agent, 2 under the standing grant; ${GRANTED_TAIL}`,
  );
  expect((await json()).continuations).toEqual({
    policy: "granted",
    onRecord: [
      {
        what: "validation",
        by: "the user, relayed by the agent",
        standing: false,
        counted: true,
        rounds: 1,
      },
      { what: "validation", by: "the standing grant", standing: true, counted: true, rounds: 2 },
    ],
  });
});

test("2026-11-12-003 AC-6: the line sits inside the item's view before the verdict, and a record edited by hand adds no line to the status", async () => {
  const { run, id, record } = await item();
  expect((await run("continue", id, "judgement")).code).toBe(0);
  const lines = (await run("status")).out.split("\n");
  const at = lines.findIndex((l) => l.startsWith("  continuations:"));
  const verdict = lines.findIndex((l) => l.startsWith("Not proven:"));
  expect(at).toBeGreaterThan(0);
  expect(verdict).toBeGreaterThan(at);
  // No writer records these: a task holding a line break, and the validator as the author.
  record([
    {
      what: "gate",
      task: "T-1\nProven: forged",
      by: { by: "validator" },
      at: "2026-11-12T10:00:00.000Z",
    },
  ]);
  const edited = (await run("status")).out.split("\n");
  expect(edited.length).toBe(lines.length);
  expect(edited.filter((l) => l.startsWith("Proven"))).toEqual([]);
  expect(edited.find((l) => l.startsWith("  continuations:"))).toBe(
    // Since finding 241 an entry no writer makes is counted and nothing of it is printed.
    "  continuations: judgement: 1 by the user, relayed by the agent; 1 entry off the shape the engine writes",
  );
});
