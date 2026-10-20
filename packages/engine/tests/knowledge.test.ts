import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { jevConfig } from "../src/jev.ts";
import {
  addEntry,
  defaultConfidential,
  KNOWLEDGE_TEXT_LIMIT,
  type KnowledgeScope,
  knowledgeText,
  type LookupHit,
  latestPlan,
  lookup,
  type RankedHit,
  readBase,
  rerankHits,
  updateEntry,
  visibleTo,
  words,
} from "../src/knowledge.ts";
import { ctoDir, isProtectedPath, knowledgePath } from "../src/paths.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type { KnowledgeBase, KnowledgeDraft, KnowledgeEntry } from "../src/types.ts";
import { makeRepo, repoPaths, tempDir, testEnv } from "./helpers.ts";

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

function hit(
  id: string,
  score: number,
  title: string,
  createdAt: string,
  text = `body of ${id}`,
): LookupHit {
  return { entry: entry(id, createdAt, { title, text }), score, reasons: ["word login"] };
}

/** The API's answer, and every request body captured, as jev.test.ts does it. */
function fakeFetch(
  answers: Record<string, unknown>,
  calls: Record<string, unknown>[],
): typeof fetch {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    calls.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        model: "jev-1.13.0",
        answers,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;
}

const REQUEST = { title: "Login sessions expire too early", kind: "feature" };
const T1 = "2026-10-20T01:00:00.000Z";
const T2 = "2026-10-20T02:00:00.000Z";
const T3 = "2026-10-20T03:00:00.000Z";
const HITS = (): LookupHit[] => [
  hit("K-1", 3, "Login sessions", T1),
  hit("K-2", 2, "Cart totals", T2),
  hit("K-3", 1, "Session cookies", T3),
];
const KEYED = { WIZARDINGCODE_JEV_API_KEY: "k".repeat(40) } as NodeJS.ProcessEnv;

test("SP4-T3 AC-3: rerankHits asks one noul per hit, marks likely, unlikely and unverified by the threshold, orders likely hits first by noul then as the lookup gave them, drops nothing, caps at maxClaimsPerItem, redacts a flagged title and sends the text under claims-and-snippets alone", async () => {
  const cfg = jevConfig(KEYED, DEFAULT_CONFIG);
  const calls: Record<string, unknown>[] = [];
  const out = await rerankHits(cfg, DEFAULT_POLICY, REQUEST, HITS(), {
    fetch: fakeFetch(
      {
        k1: { type: "noul", noul: 0.95 },
        k2: { type: "noul", noul: 0.05 },
        k3: { type: "noul", noul: 0.85 },
      },
      calls,
    ),
  });
  // Two likely with different nouls, one unlikely that sat before them: a sort by noul alone or an unstable one fails.
  expect(out.hits.map((h) => [h.entry.id, h.jev?.verdict, h.jev?.noul])).toEqual([
    ["K-1", "likely", 0.95],
    ["K-3", "likely", 0.85],
    ["K-2", "unlikely", 0.05],
  ]);
  expect(out.records.map((r) => [r.what, r.ref, r.confidence])).toEqual([
    ["knowledge", "K-1", null],
    ["knowledge", "K-2", null],
    ["knowledge", "K-3", null],
  ]);
  expect(out.unavailable).toBeNull();
  const body = calls[0] as {
    state: { request: unknown; entries: Record<string, unknown> };
    questions: Record<string, { type: string }>;
  };
  expect(Object.keys(body.questions)).toEqual(["k1", "k2", "k3"]);
  expect(body.questions.k1?.type).toBe("noul");
  expect(body.state.request).toEqual(REQUEST);
  // Under claims the text stays on the machine.
  expect(body.state.entries.k1).toEqual({ id: "K-1", kind: "general", title: "Login sessions" });
  // Between the thresholds: unverified, kept in the deterministic order after the likely ones.
  const mid = await rerankHits(cfg, DEFAULT_POLICY, REQUEST, HITS(), {
    fetch: fakeFetch(
      {
        k1: { type: "noul", noul: 0.5 },
        k2: { type: "noul", noul: 0.8 },
        k3: { type: "noul", noul: 0.2 },
      },
      [],
    ),
  });
  expect(mid.hits.map((h) => [h.entry.id, h.jev?.verdict])).toEqual([
    ["K-2", "likely"],
    ["K-1", "unverified"],
    ["K-3", "unlikely"],
  ]);
  // Under claims-and-snippets the text goes, cut at 4000.
  const snippets = {
    ...DEFAULT_POLICY,
    verify: { ...DEFAULT_POLICY.verify, send: "claims-and-snippets" as const },
  };
  const longCalls: Record<string, unknown>[] = [];
  await rerankHits(cfg, snippets, REQUEST, [hit("K-1", 1, "Login", T1, "x".repeat(5000))], {
    fetch: fakeFetch({ k1: { type: "noul", noul: 0.9 } }, longCalls),
  });
  const sent = (longCalls[0] as { state: { entries: { k1: { text: string } } } }).state.entries.k1;
  expect(sent.text.length).toBe(4000);
  // The cap: the rest is unverified, naming it, and never sent.
  const capped = { ...DEFAULT_POLICY, verify: { ...DEFAULT_POLICY.verify, maxClaimsPerItem: 2 } };
  const capCalls: Record<string, unknown>[] = [];
  const cap = await rerankHits(cfg, capped, REQUEST, HITS(), {
    fetch: fakeFetch(
      { k1: { type: "noul", noul: 0.9 }, k2: { type: "noul", noul: 0.9 } },
      capCalls,
    ),
  });
  expect(Object.keys((capCalls[0] as { questions: object }).questions)).toEqual(["k1", "k2"]);
  expect(cap.hits.map((h) => [h.entry.id, h.jev?.verdict, h.jev?.reason ?? null])).toEqual([
    ["K-1", "likely", null],
    ["K-2", "likely", null],
    ["K-3", "unverified", "over maxClaimsPerItem"],
  ]);
  expect(cap.records.length).toBe(2);
  // A title that holds a secret leaves as its rule, never its value (the security lead's return).
  const key = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
  const redactCalls: Record<string, unknown>[] = [];
  await rerankHits(
    cfg,
    DEFAULT_POLICY,
    { title: `rotate ${key}`, kind: "fix" },
    [hit("K-1", 1, `key ${key}`, T1)],
    {
      fetch: fakeFetch({ k1: { type: "noul", noul: 0.9 } }, redactCalls),
    },
  );
  const redacted = JSON.stringify(redactCalls[0]);
  expect(redacted).not.toContain(key);
  expect((redactCalls[0] as { state: { request: { title: string } } }).state.request.title).toBe(
    "[redacted: AWS access key]",
  );
  expect(
    (redactCalls[0] as { state: { entries: { k1: { title: string } } } }).state.entries.k1.title,
  ).toBe("[redacted: AWS access key]");
});

test("SP4-T3 AC-3: with Jev unavailable, a malformed answer, no configuration or the knowledge ask left out, every hit keeps its place: unverified naming the reason, or jev null with no record", async () => {
  const dir = tempDir("crew-jev-");
  const file = join(dir, "answers.json");
  writeFileSync(file, "{}");
  const canned = jevConfig(
    { WIZARDINGCODE_JEV_ENDPOINT: `file://${file}` } as NodeJS.ProcessEnv,
    DEFAULT_CONFIG,
  );
  const down = await rerankHits(canned, DEFAULT_POLICY, REQUEST, HITS());
  expect(down.hits.map((h) => h.entry.id)).toEqual(["K-1", "K-2", "K-3"]);
  for (const h of down.hits)
    expect(h.jev).toEqual({
      noul: null,
      verdict: "unverified",
      reason: "jev unavailable: no canned answer for k1",
    });
  expect(down.records).toEqual([]);
  expect(down.unavailable).toBe("no canned answer for k1");
  writeFileSync(
    file,
    JSON.stringify({ k1: { type: "choice", choice: "x", probabilities: { x: 1 }, confidence: 1 } }),
  );
  const odd = await rerankHits(canned, DEFAULT_POLICY, REQUEST, HITS());
  expect(odd.hits.map((h) => h.entry.id)).toEqual(["K-1", "K-2", "K-3"]);
  expect(odd.hits[0]?.jev?.reason).toBe("jev unavailable: canned answer for k1 is not a noul");
  const none = await rerankHits(
    jevConfig({} as NodeJS.ProcessEnv, DEFAULT_CONFIG),
    DEFAULT_POLICY,
    REQUEST,
    HITS(),
  );
  expect(none.hits.map((h) => [h.entry.id, h.jev])).toEqual([
    ["K-1", null],
    ["K-2", null],
    ["K-3", null],
  ]);
  expect(none.records).toEqual([]);
  expect(none.unavailable).toBeNull();
  const notAsked = {
    ...DEFAULT_POLICY,
    verify: { ...DEFAULT_POLICY.verify, asks: ["defect" as const] },
  };
  const quietCalls: Record<string, unknown>[] = [];
  const quiet = await rerankHits(jevConfig(KEYED, DEFAULT_CONFIG), notAsked, REQUEST, HITS(), {
    fetch: fakeFetch({}, quietCalls),
  });
  expect(quietCalls).toEqual([]);
  expect(quiet.hits.map((h) => h.jev)).toEqual([null, null, null]);
  expect(quiet.records).toEqual([]);
});

test("SP4-T3 AC-1: knowledgeText writes the file's lines, and knowledge.md is the engine's", () => {
  const ranked: RankedHit[] = [
    {
      ...hit("K-4", 2, "Login sessions", T1),
      reasons: ["word login", "stack node"],
      jev: { noul: 0.91, verdict: "likely" },
    },
    { ...hit("K-5", 1, "Cart", T2), reasons: ["word cart"], jev: null },
    {
      ...hit("K-6", 1, "Cookies", T3),
      reasons: ["word cookies"],
      jev: { noul: null, verdict: "unverified", reason: "jev unavailable: x" },
    },
  ];
  expect(knowledgeText("2026-10-20-001-x", ranked, null)).toBe(
    [
      "# Knowledge for 2026-10-20-001-x",
      "",
      '- K-4 · general · "Login sessions" · acme · word login, stack node · likely 0.91',
      '- K-5 · general · "Cart" · acme · word cart · jev not asked',
      '- K-6 · general · "Cookies" · acme · word cookies · unverified (jev unavailable: x)',
      "",
    ].join("\n"),
  );
  expect(knowledgeText("x", [], null)).toBe("# Knowledge for x\n\n- none\n");
  expect(knowledgeText("x", [], "base.json: entries is not an array")).toBe(
    "# Knowledge for x\n\n- none (base unreadable: base.json: entries is not an array)\n",
  );
  const paths = repoPaths(makeRepo(), testEnv());
  expect(isProtectedPath(paths, join(paths.root, ".crew", "work", "x", "knowledge.md"))).toBe(true);
});

test("SP4-T5 AC-5: latestPlan reads the newest dated plan under the workspace's CTO folder and none without one", () => {
  const dir = userDir();
  expect(latestPlan(dir, "acme")).toBeNull();
  const folder = ctoDir(dir, "acme");
  expect(folder).toBe(join(dir, "cto", "acme"));
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "2026-10-01-plan.md"), "the old plan");
  writeFileSync(join(folder, "2026-10-19-inputs.json"), "{}");
  writeFileSync(join(folder, "2026-10-18-plan.md"), "the new plan");
  writeFileSync(join(folder, "notes.md"), "not a plan");
  expect(latestPlan(dir, "acme")).toEqual({
    path: join(folder, "2026-10-18-plan.md"),
    date: "2026-10-18",
  });
  expect(latestPlan(dir, "globex")).toBeNull();
});
