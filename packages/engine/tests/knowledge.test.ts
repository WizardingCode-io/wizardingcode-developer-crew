import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  addEntry,
  defaultConfidential,
  KNOWLEDGE_TEXT_LIMIT,
  type KnowledgeScope,
  lookup,
  readBase,
  updateEntry,
  visibleTo,
  words,
} from "../src/knowledge.ts";
import { knowledgePath } from "../src/paths.ts";
import type { KnowledgeBase, KnowledgeDraft, KnowledgeEntry } from "../src/types.ts";
import { tempDir } from "./helpers.ts";

/** A user directory of its own, as `WIZARDINGCODE_HOME/crew` is. */
function userDir(): string {
  const dir = join(tempDir("crew-home-"), "crew");
  mkdirSync(dir, { recursive: true });
  return dir;
}

function draft(over: Partial<KnowledgeDraft> = {}): KnowledgeDraft {
  return {
    kind: "general",
    title: "Login sessions",
    workspace: "acme",
    project: "shop",
    projectRoot: "/real/acme/shop",
    confidential: true,
    item: null,
    commit: null,
    stacks: ["node"],
    paths: ["src/auth/session.ts"],
    words: ["login", "sessions"],
    text: "how the sessions are kept",
    source: null,
    ...over,
  };
}

function entry(id: string, createdAt: string, over: Partial<KnowledgeDraft> = {}): KnowledgeEntry {
  return { ...draft(over), id, createdAt, confirmedBy: [], contradictedBy: [] };
}

const ACME: KnowledgeScope = { workspace: "acme", project: "shop", projectRoot: "/real/acme/shop" };
const GLOBEX: KnowledgeScope = {
  workspace: "globex",
  project: "crm",
  projectRoot: "/real/globex/crm",
};
const ALONE_A: KnowledgeScope = { workspace: null, project: "app", projectRoot: "/real/a/app" };
const ALONE_B: KnowledgeScope = { workspace: null, project: "app", projectRoot: "/real/b/app" };

test("SP4-T2 AC-1: readBase says why a base cannot be read (missing, garbage, a later version, a wrong shape) and never writes it; addEntry refuses an unreadable base", () => {
  const dir = userDir();
  expect(readBase(dir)).toEqual({ base: null, reason: "missing" });
  const file = knowledgePath(dir);
  const cases: [string, string][] = [
    ["not json at all", "JSON"],
    [
      JSON.stringify({ version: 2, next: 1, entries: [] }),
      "version 2 is newer than this engine reads (1)",
    ],
    [JSON.stringify({ version: 1, next: 1, entries: {} }), "base.json: entries is not an array"],
    [
      JSON.stringify({ version: 1, next: 0, entries: [] }),
      "base.json: next is not a positive integer",
    ],
    [
      JSON.stringify({
        version: 1,
        next: 2,
        entries: [{ ...entry("K-1", "2026-10-20T00:00:00.000Z"), title: undefined }],
      }),
      "base.json: entry K-1 has no title",
    ],
    [
      JSON.stringify({
        version: 1,
        next: 2,
        entries: [{ ...entry("K-1", "2026-10-20T00:00:00.000Z"), confidential: "false" }],
      }),
      "base.json: entry K-1 has a confidential that is not a boolean",
    ],
  ];
  mkdirSync(dirname(file), { recursive: true });
  for (const [text, reason] of cases) {
    writeFileSync(file, text);
    const read = readBase(dir);
    expect(read.base, text).toBeNull();
    expect(read.reason, text).toContain(reason);
    expect(readFileSync(file, "utf8"), text).toBe(text);
    const refused = addEntry(dir, draft());
    expect("refused" in refused && refused.refused, text).toContain(reason);
    expect(readFileSync(file, "utf8"), text).toBe(text);
  }
});

test("SP4-T2 AC-2: addEntry takes K-1 then K-2 for good under the lock, both present, and updateEntry changes one entry in place", () => {
  const dir = userDir();
  const first = addEntry(dir, draft());
  const second = addEntry(dir, draft({ title: "Cart totals", words: ["cart", "totals"] }));
  if ("refused" in first || "refused" in second) throw new Error("the adds were refused");
  expect(first.id).toBe("K-1");
  expect(second.id).toBe("K-2");
  expect(first.confirmedBy).toEqual([]);
  expect(typeof first.createdAt).toBe("string");
  const base = readBase(dir).base as KnowledgeBase;
  expect(base.next).toBe(3);
  expect(base.entries.map((e) => e.id)).toEqual(["K-1", "K-2"]);
  const changed = updateEntry(dir, "K-2", (e) => {
    e.confidential = false;
  });
  expect("refused" in changed).toBe(false);
  const again = readBase(dir).base as KnowledgeBase;
  expect(again.entries.map((e) => [e.id, e.confidential])).toEqual([
    ["K-1", true],
    ["K-2", false],
  ]);
  expect(updateEntry(dir, "K-9", () => {})).toEqual({ refused: "no entry K-9 in the base" });
  // A text over the limit is cut at add.
  const long = addEntry(dir, draft({ text: "x".repeat(KNOWLEDGE_TEXT_LIMIT + 10) }));
  if ("refused" in long) throw new Error("the add was refused");
  expect(long.text.length).toBe(KNOWLEDGE_TEXT_LIMIT);
});

test("SP4-T2 AC-3: visibleTo reads an unmarked entry everywhere, a marked one inside its workspace, and with no workspace inside the project's real root alone; a confidential not exactly false is marked", () => {
  const at = "2026-10-20T00:00:00.000Z";
  const unmarked = entry("K-1", at, { confidential: false, workspace: "acme" });
  const marked = entry("K-2", at, { workspace: "acme" });
  const alone = entry("K-3", at, { workspace: null, project: "app", projectRoot: "/real/a/app" });
  for (const scope of [ACME, GLOBEX, ALONE_A, ALONE_B])
    expect(visibleTo(unmarked, scope)).toBe(true);
  expect(visibleTo(marked, ACME)).toBe(true);
  expect(visibleTo(marked, GLOBEX)).toBe(false);
  expect(visibleTo(marked, ALONE_A)).toBe(false);
  expect(visibleTo(alone, ALONE_A)).toBe(true);
  // The same basename under another real root is another project (the security lead's R-2).
  expect(visibleTo(alone, ALONE_B)).toBe(false);
  expect(visibleTo(alone, ACME)).toBe(false);
  for (const value of ["false", 0, null, undefined]) {
    const odd = { ...unmarked, confidential: value as unknown as boolean };
    expect(visibleTo(odd, GLOBEX), String(value)).toBe(false);
    expect(visibleTo(odd, ACME), String(value)).toBe(true);
  }
  expect(defaultConfidential("general")).toBe(true);
  expect(defaultConfidential("documentation")).toBe(true);
  expect(defaultConfidential("validated-solution")).toBe(true);
});

test("SP4-T2 AC-4: words keeps lower-case runs of four letters or more minus the stop list; lookup filters by visibility first, scores 2 x paths + stacks + words with a reason each, orders by score then date, caps at the limit and lists nothing at score zero", () => {
  expect(
    words("The login Sessions keep this token alive after a restart; the login again"),
  ).toEqual(["login", "sessions", "keep", "token", "alive", "restart", "again"]);
  const base: KnowledgeBase = {
    version: 1,
    next: 6,
    entries: [
      entry("K-1", "2026-10-20T01:00:00.000Z"),
      // Hidden: another workspace, marked, and it would score highest.
      entry("K-2", "2026-10-20T02:00:00.000Z", {
        workspace: "globex",
        words: ["login", "cart"],
        paths: ["src/auth/session.ts", "src/cart.ts"],
      }),
      entry("K-3", "2026-10-20T03:00:00.000Z", {
        kind: "documentation",
        confidential: false,
        workspace: null,
        stacks: ["php"],
        paths: [],
        words: ["login"],
      }),
      entry("K-4", "2026-10-20T04:00:00.000Z", {
        kind: "documentation",
        confidential: false,
        workspace: null,
        stacks: ["php"],
        paths: [],
        words: ["login"],
      }),
      entry("K-5", "2026-10-20T05:00:00.000Z", { stacks: ["php"], paths: [], words: ["nothing"] }),
    ],
  };
  const query = {
    scope: ACME,
    stacks: ["node" as const],
    paths: ["src/auth/session.ts"],
    words: ["login", "cart"],
  };
  const hits = lookup(base, query);
  expect(hits.map((h) => [h.entry.id, h.score])).toEqual([
    ["K-1", 4],
    ["K-4", 1],
    ["K-3", 1],
  ]);
  expect(hits[0]?.reasons).toEqual(["path src/auth/session.ts", "stack node", "word login"]);
  expect(hits.some((h) => h.entry.id === "K-2")).toBe(false);
  expect(hits.some((h) => h.entry.id === "K-5")).toBe(false);
  // The limit counts visible hits alone: the hidden top scorer never takes a slot.
  expect(lookup(base, query, 1).map((h) => h.entry.id)).toEqual(["K-1"]);
  expect(lookup(base, { ...query, kinds: ["documentation"] }).map((h) => h.entry.id)).toEqual([
    "K-4",
    "K-3",
  ]);
  expect(lookup(base, { ...query, stacks: [], paths: [], words: ["elsewhere"] })).toEqual([]);
  expect(lookup(base, { ...query, scope: GLOBEX }).map((h) => h.entry.id)).toEqual([
    "K-2",
    "K-4",
    "K-3",
  ]);
});
