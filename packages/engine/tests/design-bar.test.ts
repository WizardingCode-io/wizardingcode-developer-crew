// The bar of a new site is the level of its references (item 2026-11-18-008, the user's D-1): the
// reviewer's lines for the bar, the user's approval of the references that may set it, the fixture's
// record of pairs, and the rule the score is held to. With no approved references the bar is 8.5.
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import * as designModule from "../src/design.ts";
import {
  designReasons,
  designScoreLines,
  parseScore,
  readScore,
  readSurface,
  type ScoreRecord,
} from "../src/design.ts";
import {
  BAR_SENTENCES,
  barApproved,
  barQuestion,
  decideBar,
  parseBarLines,
  readBar,
} from "../src/design-bar.ts";
import { PROTECTED_WORK_FILES } from "../src/paths.ts";
import { filedReading, makeRepo, newRound, repoPaths, testEnv } from "./helpers.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");

/** What the pair helper writes: a PNG, here its signature and a few bytes. */
const PNG_PAIR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const digestOf = (bytes: string): string => createHash("sha256").update(bytes).digest("hex");
const SCORE = "score: 7.9 · caps: none · disposition: ship";
const DIMS = "dimensions: design 8.2 · usability 8 · creativity 7.6 · content 8";
const REFS = "reference: 2 shots";
const LEVEL = "level: design 8 · usability 8 · creativity 7.5 · content 7.8";
const findings = (...lines: string[]): string =>
  `# ui-ux findings for x\nreviewer: review-ui-ux\nread: 4 images\n${lines.join("\n")}\n\n## Findings\n(or: none)\n`;

test("bar AC-15: the three lines are read only in their place, once, outside a fence, and parseScore reads what it read", () => {
  const whole = parseBarLines(findings(SCORE, DIMS, REFS, LEVEL));
  expect(whole.word).toBe("ship");
  expect(whole.lines).toEqual({
    dimensions: { design: 8.2, usability: 8, creativity: 7.6, content: 8 },
    shots: 2,
    level: { design: 8, usability: 8, creativity: 7.5, content: 7.8 },
  });
  const alone = parseScore(findings(SCORE));
  const unread: [string, string][] = [
    ["a figure over 10", findings(SCORE, DIMS.replace("8.2", "11"), REFS, LEVEL)],
    ["a missing dimension", findings(SCORE, DIMS.replace(" · content 8", ""), REFS, LEVEL)],
    ["a dimension named twice", findings(SCORE, DIMS.replace("content", "design"), REFS, LEVEL)],
    ["a line of another shape", findings(SCORE, DIMS, "reference: two shots", LEVEL)],
    ["no shots at all", findings(SCORE, DIMS, "reference: 0 shots", LEVEL)],
    ["the lines out of order", findings(SCORE, REFS, DIMS, LEVEL)],
    ["a blank line between them", findings(SCORE, DIMS, "", REFS, LEVEL)],
    ["a line of prose between them", findings(SCORE, DIMS, "as read:", REFS, LEVEL)],
    ["a level filed twice", `${findings(SCORE, DIMS, REFS, LEVEL)}\n${LEVEL}\n`],
    [
      "the dimensions quoted again lower down",
      `${findings(SCORE, DIMS, REFS, LEVEL)}\nThe rubric says: \n${DIMS}\n`,
    ],
    ["the lines inside a fence", findings("```", SCORE, DIMS, REFS, LEVEL, "```")],
    ["no level line", findings(SCORE, DIMS, REFS)],
    ["a site with no references, as the rubric files it", findings(SCORE, DIMS, "reference: none")],
    ["a level filed with no references", findings(SCORE, DIMS, "reference: none", LEVEL)],
  ];
  for (const [what, text] of unread) {
    expect(parseBarLines(text).lines, what).toBeNull();
    if (!text.includes("```")) expect(parseScore(text), what).toEqual(alone);
  }
  expect(parseBarLines(findings(SCORE, DIMS, "reference: none")).word).toBe("ship");
  expect(parseBarLines("no such line")).toEqual({ word: null, lines: null });
  // The score line with its three lines after it reads, to parseScore, as the score line alone.
  expect(parseScore(findings(SCORE, DIMS, REFS, LEVEL))).toEqual(alone);
});

const HEADER = "| Shot | Ref | Whose and from where | Shows | Take from it | Leave | Width |";
const shotRow = (shot: string, ref: string, width: number): string =>
  `| ${shot} | ${ref} | the user's | a screen | the proportions | the colours | ${width} |`;

/** An item of a new site with two references in its shot list, and the commands to drive it. */
async function site() {
  const root = makeRepo({ "README.md": "# t\n", "package.json": '{"name":"t"}\n' });
  const env = testEnv();
  const run = async (...args: string[]) => {
    const lines: string[] = [];
    const io: CliIo = {
      cwd: root,
      env,
      stdout: (t: string) => void lines.push(t),
      stderr: (t: string) => void lines.push(t),
      stdin: async () => "",
    };
    const code = await main(args, io);
    return { code, text: lines.join("\n") };
  };
  await run("detect");
  const answers = JSON.stringify({
    work_type: "feature",
    is_vague: 0,
    scope: 1,
    touches_auth: 0,
    touches_payments: 0,
    touches_personal_data: 0,
    touches_data_migration: 0,
    touches_infra: 0,
    touches_public_api: 0,
  });
  const started = await run("start", "a site", "--answers", answers, "--json");
  const id = /(\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+)/.exec(started.text)?.[1] ?? "";
  const paths = repoPaths(root, env);
  const folder = join(root, ".crew", "work", id);
  const design = join(folder, "design");
  const refs = join(design, "refs");
  const ui = join(folder, "review", "ui");
  mkdirSync(refs, { recursive: true });
  mkdirSync(ui, { recursive: true });
  await run("design", id, "surface", "persuade", "--invention", "world");
  writeFileSync(join(refs, "home.png"), "the first reference");
  writeFileSync(join(refs, "shop.png"), "the second reference");
  const list = join(design, "shots.md");
  writeFileSync(
    list,
    `${HEADER}\n| :- | :- | :- | :- | :- | :- | :- |\n${shotRow("home-default", "home.png", 1280)}\n${shotRow("shop-default", "shop.png", 360)}\n`,
  );
  const SHOTS = "home-default@1280,shop-default@360";
  /** The fixture's files for the two shots: each capture's metadata, each pair, and the record. */
  const evidence = (captured = "2026-11-18T10:00:00.000Z", paired = "2026-11-18T10:05:00.000Z") => {
    for (const [shot, width] of [
      ["home-default", 1280],
      ["shop-default", 360],
    ] as const) {
      const [page, state] = shot.split("-");
      writeFileSync(join(ui, `${shot}@${width}.png`), "png");
      writeFileSync(
        join(ui, `${shot}.json`),
        JSON.stringify({ page, state, by: "fixture", at: captured, viewports: [] }),
      );
      writeFileSync(join(ui, `${shot}@${width}.pair.png`), PNG_PAIR);
    }
    record({ at: paired });
  };
  const record = (over: Record<string, unknown> = {}, entries?: unknown[]) =>
    writeFileSync(
      join(ui, "shots.json"),
      JSON.stringify({
        by: "fixture",
        at: "2026-11-18T10:05:00.000Z",
        reason: null,
        context: "own",
        pairs: entries ?? [
          {
            shot: "home-default",
            width: 1280,
            ref: "home.png",
            pair: "home-default@1280.pair.png",
            digest: digestOf("the first reference"),
          },
          {
            shot: "shop-default",
            width: 360,
            ref: "shop.png",
            pair: "shop-default@360.pair.png",
            digest: digestOf("the second reference"),
          },
        ],
        ...over,
      }),
    );
  /** The review of one state of the code: three readers of three agent ids, each filing the same findings through the hook's own filing (item 2026-11-18-011). */
  const review = (...lines: string[]) => {
    newRound(env, root, id);
    for (let reader = 0; reader < 3; reader += 1) filedReading(env, root, id, findings(...lines));
  };
  /** The score recorded from the findings: the command's answer, the record, and why the site is not at the bar. */
  const score = async () => {
    const answer = await run("design", id, "score");
    const saved = readScore(paths, id);
    const reasons = saved ? designReasons(readSurface(paths, id), saved, saved.fingerprint) : [];
    return { answer, saved, reasons };
  };
  /** The command's question put and answered by the user: the references approved for the bar. */
  const approve = async (answer = "yes") => {
    const asked = await run("design", id, "bar", "--shots", SHOTS);
    const decision = /(D-\d+)/.exec(asked.text)?.[1] ?? "";
    const decided = await run("decide", id, decision, answer);
    return { asked, decision, decided };
  };
  const work = () => JSON.parse(readFileSync(join(folder, "work.json"), "utf8"));
  return {
    run,
    id,
    root,
    paths,
    folder,
    design,
    refs,
    ui,
    list,
    SHOTS,
    evidence,
    record,
    review,
    score,
    approve,
    work,
  };
}

test("bar AC-16: the command puts its own question, records each reference's digest, and refuses what it cannot hold", async () => {
  const a = await site();
  const refusals: [string, () => void | Promise<void>, string[]][] = [
    ["a shot not of its shape", () => {}, ["--shots", "home-default"]],
    ["a shot with words", () => {}, ["--shots", "Home Page@1280"]],
    ["no shot", () => {}, []],
    ["a shot with no row", () => {}, ["--shots", "about-default@1280"]],
    [
      "a shot with two rows",
      () =>
        writeFileSync(
          a.list,
          `${readFileSync(a.list, "utf8")}${shotRow("home-default", "shop.png", 1280)}\n`,
        ),
      ["--shots", "home-default@1280"],
    ],
  ];
  for (const [what, plant, args] of refusals) {
    const before = readFileSync(a.list, "utf8");
    await plant();
    const refused = await a.run("design", a.id, "bar", ...args);
    expect(refused.code, what).not.toBe(0);
    expect(a.work().decisions ?? [], what).toEqual([]);
    expect(() => readFileSync(join(a.design, "bar.json")), what).toThrow();
    writeFileSync(a.list, before);
  }
  const badRefs: [string, () => void][] = [
    [
      "a reference's name with a path",
      () => writeFileSync(a.list, `${HEADER}\n${shotRow("home-default", "../x.png", 1280)}\n`),
    ],
    ["a reference that is absent", () => unlinkSync(join(a.refs, "home.png"))],
    [
      "a reference that is a link",
      () => {
        unlinkSync(join(a.refs, "home.png"));
        writeFileSync(join(a.root, "outside.png"), "outside");
        symlinkSync(join(a.root, "outside.png"), join(a.refs, "home.png"));
      },
    ],
    [
      "a folder of references that is a link",
      () => {
        rmSync(a.refs, { recursive: true });
        mkdirSync(join(a.root, "out"));
        writeFileSync(join(a.root, "out", "home.png"), "outside");
        symlinkSync(join(a.root, "out"), a.refs);
      },
    ],
    [
      "a folder of references that is a link to a folder inside the item",
      () => {
        rmSync(a.refs, { recursive: true });
        mkdirSync(join(a.design, "held"));
        writeFileSync(join(a.design, "held", "home.png"), "inside");
        symlinkSync(join(a.design, "held"), a.refs);
      },
    ],
    [
      "a reference over 20 MB",
      () => writeFileSync(join(a.refs, "home.png"), Buffer.alloc(20 * 1024 * 1024 + 1)),
    ],
  ];
  for (const [what, plant] of badRefs) {
    const b = await site();
    Object.assign(a, { list: b.list, refs: b.refs, root: b.root, design: b.design });
    plant();
    const refused = await b.run("design", b.id, "bar", "--shots", "home-default@1280");
    expect(refused.code, what).not.toBe(0);
    expect(b.work().decisions ?? [], what).toEqual([]);
    expect(() => readFileSync(join(b.design, "bar.json")), what).toThrow();
  }

  const c = await site();
  const asked = await c.run("design", c.id, "bar", "--shots", c.SHOTS);
  expect(asked.code).toBe(0);
  const decisions = c.work().decisions;
  expect(decisions.length).toBe(1);
  expect(decisions[0].question).toBe(barQuestion(["home-default@1280", "shop-default@360"]));
  expect(decisions[0].question).toContain("home-default@1280");
  expect(decisions[0].question).toContain("shop-default@360");
  expect(decisions[0].question).toContain("8.5");
  expect(decisions[0].default).toContain("8.5");
  expect(decisions[0].answer).toBeUndefined();
  const bar = JSON.parse(readFileSync(join(c.design, "bar.json"), "utf8"));
  expect(bar.decision).toBe(decisions[0].id);
  expect(
    bar.shots.map((s: { shot: string; width: number; ref: string }) => [s.shot, s.width, s.ref]),
  ).toEqual([
    ["home-default", 1280, "home.png"],
    ["shop-default", 360, "shop.png"],
  ]);
  const { createHash } = await import("node:crypto");
  expect(bar.shots[0].digest).toBe(
    createHash("sha256").update("the first reference").digest("hex"),
  );
  // The record is the engine's own: the guard that keeps a session from writing it reads this list.
  expect(PROTECTED_WORK_FILES).toContain("design/bar.json");
  // A second run while the first question waits for its answer adds no second question.
  const again = await c.run("design", c.id, "bar", "--shots", c.SHOTS);
  expect(again.code).not.toBe(0);
  expect(c.work().decisions.length).toBe(1);
});

test("bar AC-9: approved references that read at the level set the bar, dimension by dimension, with its edges", async () => {
  const a = await site();
  await a.approve();
  a.evidence();
  a.review(SCORE, DIMS, REFS, LEVEL);
  const at = await a.score();
  expect(at.saved?.bar).toBe("references");
  expect(at.saved?.disposition).toBe("ship");
  expect(at.saved?.score).toBe(7.9);
  expect(at.reasons).toEqual([]);
  expect(at.answer.text).toContain("at the bar");

  // Equal to the references' on every dimension is at the bar; a level of exactly 7.5 sets it.
  a.review(
    SCORE,
    "dimensions: design 7.5 · usability 7.5 · creativity 7.5 · content 7.5",
    REFS,
    "level: design 7.5 · usability 7.5 · creativity 7.5 · content 7.5",
  );
  const equal = await a.score();
  expect(equal.saved?.bar).toBe("references");
  expect(equal.reasons).toEqual([]);

  // One tenth under on one dimension is not, and the reason names it with both figures.
  a.review(SCORE, DIMS.replace("creativity 7.6", "creativity 7.4"), REFS, LEVEL);
  const under = await a.score();
  expect(under.saved?.bar).toBe("references");
  expect(under.saved?.disposition).toBe("fix");
  expect(under.reasons.join("; ")).toContain("creativity 7.4 under the references' 7.5");
  expect(under.reasons.join("; ")).not.toContain("8.5");
  expect(under.reasons.join("; ")).not.toContain("usability");
  expect(under.answer.text).toContain("not at the bar");
});

test("bar AC-17: without the user's yes, an unchanged reference, a pair for every shot and a level read at 7.5, the bar is 8.5 and the record says why", async () => {
  const S = BAR_SENTENCES;
  type Site = Awaited<ReturnType<typeof site>>;
  /** One case: a site with everything in place, one thing changed, and the sentence the record must say. */
  const held = async (
    what: string,
    change: (a: Site) => void | Promise<void>,
    sentence: string,
    approval: string | null = "yes",
  ) => {
    const a = await site();
    if (approval !== null) await a.approve(approval);
    a.evidence();
    a.review(SCORE, DIMS, REFS, LEVEL);
    await change(a);
    const got = await a.score();
    expect(got.saved?.bar, what).toBe("overall");
    expect(got.saved?.why, what).toBe(sentence);
    expect(got.saved?.disposition, what).toBe("fix");
    expect(got.reasons.join("; "), what).toContain("7.9 under the bar of 8.5");
    expect(got.reasons.join("; "), what).toContain(sentence);
    return { a, got };
  };

  await held("no approval asked", () => {}, S.notApproved, null);
  await held("the question answered no", () => {}, S.notApproved, "no");
  await held("an answer of other words", () => {}, S.notApproved, "yes, for the home page only");
  await held("the word with a capital", () => {}, S.notApproved, "Yes");
  // The approval itself, on planted records: only the user's `yes` to the command's own question.
  const shots = [{ shot: "home-default", width: 1280, ref: "home.png", digest: "d" }];
  const bar = { decision: "D-1", at: "x", shots };
  const asked = { id: "D-1", question: barQuestion(["home-default@1280"]) };
  const yes = { ...asked, answer: "yes", by: "user" as const };
  expect(barApproved([yes], bar)).toBe(true);
  expect(barApproved([asked], bar), "the question not answered").toBe(false);
  expect(barApproved([{ ...yes, by: "validator" as const }], bar), "a validator's answer").toBe(
    false,
  );
  expect(barApproved([{ ...yes, by: "agent" as const }], bar), "the agent's answer").toBe(false);
  expect(barApproved([{ ...asked, answer: "yes" }], bar), "an answer by nobody").toBe(false);
  expect(
    barApproved([{ ...yes, question: "Shall the hero use the client's photograph?" }], bar),
    "a question that is not the command's",
  ).toBe(false);
  expect(
    barApproved([{ ...yes, question: barQuestion(["shop-default@360"]) }], bar),
    "the command's question for other shots",
  ).toBe(false);
  expect(barApproved([{ ...yes, id: "D-2" }], bar), "another decision's yes").toBe(false);
  expect(barApproved([yes], null), "no record").toBe(false);
  expect(barApproved([yes], { ...bar, shots: [] }), "a record with no shot").toBe(false);

  await held(
    "a reference's bytes changed",
    (a) => writeFileSync(join(a.refs, "home.png"), "a weaker picture"),
    S.changed,
  );
  await held(
    "a row pointed at another file",
    (a) => writeFileSync(a.list, readFileSync(a.list, "utf8").replace("home.png", "shop.png")),
    S.changed,
  );
  // The same bytes written again are the same reference.
  const same = await site();
  await same.approve();
  same.evidence();
  same.review(SCORE, DIMS, REFS, LEVEL);
  writeFileSync(join(same.refs, "home.png"), "the first reference");
  expect((await same.score()).saved?.bar).toBe("references");

  const entry = (over: Record<string, unknown>) => [
    {
      shot: "home-default",
      width: 1280,
      ref: "home.png",
      pair: "home-default@1280.pair.png",
      digest: digestOf("the first reference"),
      ...over,
    },
    {
      shot: "shop-default",
      width: 360,
      ref: "shop.png",
      pair: "shop-default@360.pair.png",
      digest: digestOf("the second reference"),
    },
  ];
  await held("an approved shot with no entry", (a) => a.record({}, entry({}).slice(1)), S.noPair);
  await held("a null pair", (a) => a.record({}, entry({ pair: null })), S.noPair);
  await held(
    "a pair's name that is not its own",
    (a) => a.record({}, entry({ pair: "shop-default@360.pair.png" })),
    S.noPair,
  );
  await held(
    "a pair file that is absent",
    (a) => unlinkSync(join(a.ui, "home-default@1280.pair.png")),
    S.noPair,
  );
  await held(
    "a pair file that is a folder",
    (a) => {
      unlinkSync(join(a.ui, "home-default@1280.pair.png"));
      mkdirSync(join(a.ui, "home-default@1280.pair.png"));
    },
    S.noPair,
  );
  await held("no record", (a) => unlinkSync(join(a.ui, "shots.json")), S.noPair);
  await held(
    "a record that does not parse",
    (a) => writeFileSync(join(a.ui, "shots.json"), "{not json"),
    S.noPair,
  );
  await held("a record over 1 MB", (a) => a.record({ padding: "x".repeat(1024 * 1024) }), S.noPair);
  await held(
    "a record that is a link",
    (a) => {
      const real = join(a.root, "real-shots.json");
      writeFileSync(real, readFileSync(join(a.ui, "shots.json")));
      unlinkSync(join(a.ui, "shots.json"));
      symlinkSync(real, join(a.ui, "shots.json"));
    },
    S.noPair,
  );
  await held("a record by another", (a) => a.record({ by: "session" }), S.noPair);

  await held(
    "a record older than a capture",
    (a) => a.evidence("2026-11-18T10:06:00.000Z", "2026-11-18T10:05:00.000Z"),
    S.older,
  );
  await held(
    "a capture with no fixture's metadata",
    (a) =>
      writeFileSync(
        join(a.ui, "home-default.json"),
        JSON.stringify({
          page: "home",
          state: "default",
          by: "session",
          at: "2026-11-18T10:00:00.000Z",
        }),
      ),
    S.older,
  );
  await held(
    "a capture with no metadata",
    (a) => unlinkSync(join(a.ui, "home-default.json")),
    S.older,
  );
  // The time is the record's own, whatever the file's time on disk.
  const touched = await site();
  await touched.approve();
  touched.evidence();
  touched.review(SCORE, DIMS, REFS, LEVEL);
  utimesSync(join(touched.ui, "shots.json"), new Date("2020-01-01"), new Date("2020-01-01"));
  expect((await touched.score()).saved?.bar).toBe("references");

  await held(
    "another count of shots in the review",
    (a) => a.review(SCORE, DIMS, "reference: 3 shots", LEVEL),
    S.count,
  );
  await held("the lines not read", (a) => a.review(SCORE, DIMS, REFS), S.unread);
  await held(
    "a level of 7.4 on one dimension",
    (a) => a.review(SCORE, DIMS, REFS, LEVEL.replace("creativity 7.5", "creativity 7.4")),
    `${S.low} creativity`,
  );

  // The first sentence that applies: no approval and a changed reference at once is the approval's.
  await held(
    "two conditions at once",
    (a) => writeFileSync(join(a.refs, "home.png"), "a weaker picture"),
    S.notApproved,
    "no",
  );
  await held(
    "a changed reference and a missing pair at once",
    (a) => {
      writeFileSync(join(a.refs, "home.png"), "a weaker picture");
      unlinkSync(join(a.ui, "shots.json"));
    },
    S.changed,
  );

  // A site that claimed no references says no sentence, and is held to 8.5 as before.
  const plain = await site();
  plain.review(SCORE, DIMS, "reference: none");
  const none = await plain.score();
  expect(none.saved?.bar).toBe("overall");
  expect(none.saved?.why).toBeUndefined();
  expect(none.reasons).toEqual(["design score 7.9 under the bar of 8.5", "design review says fix"]);
  // A second run of the command is a new question: the first yes does not carry to it.
  const twice = await site();
  await twice.approve();
  const second = await twice.run("design", twice.id, "bar", "--shots", "home-default@1280");
  expect(second.code).toBe(0);
  twice.evidence();
  twice.review(SCORE, DIMS, "reference: 1 shots", LEVEL);
  expect((await twice.score()).saved?.why).toBe(S.notApproved);
});

test("bar AC-11: a cap, another word, a stale score or none keep a site out under the references' bar, and an older record is held to 8.5", async () => {
  const a = await site();
  await a.approve();
  a.evidence();
  a.review("score: 8 · caps: creativity 7 · disposition: ship", DIMS, REFS, LEVEL);
  const capped = await a.score();
  expect(capped.saved?.bar).toBe("references");
  expect(capped.saved?.disposition).toBe("fix");
  expect(capped.reasons.join("; ")).toContain("creativity 7");
  a.review("score: 8 · caps: none · disposition: rebuild", DIMS, REFS, LEVEL);
  const rebuild = await a.score();
  expect(rebuild.saved?.disposition).toBe("rebuild");
  expect(rebuild.reasons.join("; ")).toContain("rebuild");
  a.review(SCORE, DIMS, REFS, LEVEL);
  const good = await a.score();
  const surface = readSurface(a.paths, a.id);
  expect(designReasons(surface, good.saved, "another fingerprint").join("; ")).toContain(
    "current code",
  );
  expect(designReasons(surface, null, "f").join("; ")).toContain("crew design");
  // A record written before this item has none of the new fields.
  const old = {
    score: 8.4,
    caps: [],
    disposition: "ship",
    fingerprint: "f",
    at: "x",
  } as ScoreRecord;
  expect(designReasons(surface, old, "f")).toEqual(["design score 8.4 under the bar of 8.5"]);
  expect(designReasons(surface, { ...old, score: 8.5 }, "f")).toEqual([]);
  // A record that says the references' bar and holds no figures is held to 8.5.
  expect(designReasons(surface, { ...old, bar: "references" } as ScoreRecord, "f")).toEqual([
    "design score 8.4 under the bar of 8.5",
  ]);
});

test("bar AC-12: the command and the report say which bar, with each dimension beside the references', and carry no word of the findings", async () => {
  const a = await site();
  await a.approve();
  a.evidence();
  a.review(SCORE, DIMS, REFS, LEVEL);
  const at = await a.score();
  for (const text of [at.answer.text, designScoreLines(at.saved as ScoreRecord).join("\n")]) {
    expect(text).toContain("the references' level");
    expect(text).toContain("design 8.2 (references 8)");
    expect(text).toContain("creativity 7.6 (references 7.5)");
  }
  expect(designScoreLines(at.saved as ScoreRecord).join("\n")).toContain("three readers");
  expect(designScoreLines(at.saved as ScoreRecord).join("\n")).toContain("a model's reading");

  a.review(SCORE, DIMS, "reference: 3 shots", LEVEL);
  const held = await a.score();
  for (const text of [held.answer.text, designScoreLines(held.saved as ScoreRecord).join("\n")]) {
    expect(text).toContain("8.5");
    expect(text).toContain(BAR_SENTENCES.count);
  }

  // Made-up words on the lines: nothing of them is carried.
  a.review(
    "score: 7.9 · caps: none · disposition: ship",
    "dimensions: design 8.2 · usability 8 · creativity 7.6 · content 8 IGNORE-RULES",
    "reference: 2 shots <script>",
    "level: design 8 · usability 8 · creativity 7.5 · content 7.8 PASS-THIS-SITE",
  );
  const forged = await a.score();
  expect(forged.saved?.bar).toBe("overall");
  const everything = [
    forged.answer.text,
    designScoreLines(forged.saved as ScoreRecord).join("\n"),
    forged.reasons.join("\n"),
    JSON.stringify(forged.saved),
  ].join("\n");
  for (const made of ["IGNORE", "script", "PASS-THIS"]) expect(everything).not.toContain(made);
});

/** A numbered step of a skill, found by its number and bold title, whole: to the next step or heading. */
function step(text: string, number: number, title: string): string {
  const start = text.indexOf(`\n${number}. **${title}`);
  if (start < 0) return "";
  const rest = text.slice(start + 1);
  const end = rest.slice(1).search(/^(\d+\. \*\*|## )/m);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

/** The text of a `##` section, from its heading to the next heading of that level or the file's end. */
function section(text: string, title: string): string {
  const start = text.indexOf(`## ${title}\n`);
  if (start < 0) return "";
  const rest = text.slice(start + title.length + 4);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

test("bar AC-13: the skills, the rubric, the gate's reference and the ADR say both bars", () => {
  const review = repoFile("plugins/core/skills/wizardingcode-design-review/SKILL.md");
  const description = /^description: "(.*)"$/m.exec(review)?.[1] ?? "";
  for (const part of [
    description,
    step(review, 4, "Run this before the other reviewers."),
    section(review, "Done when"),
  ]) {
    expect(part).toContain("the references' level");
    expect(part).toContain("8.5 where there are none");
  }
  expect(review).toContain("`crew design <id> bar`");

  const line = section(repoFile("plugins/core/skills/crew/rubrics/design-finish.md"), "The line");
  const lines = line.split("\n").map((l) => l.trim());
  const third = lines.indexOf("reference: <n> shots");
  expect(third).toBeGreaterThan(0);
  expect(line).toContain("level: design <n> · usability <n> · creativity <n> · content <n>");
  expect(line.indexOf("level: design <n>")).toBeGreaterThan(line.indexOf("reference: <n> shots"));
  expect(line).toContain("before the right half is scored");

  const gate = repoFile("plugins/core/skills/crew/references/gate.md")
    .split("\n")
    .find((l) => l.includes("`crew design <id> score` records the bar"));
  expect(gate).toContain("the references' level");
  expect(gate).toContain("8.5");

  const verification = repoFile("plugins/core/skills/wizardingcode-frontend-verification/SKILL.md");
  const row = verification
    .split("\n")
    .find((l) => l.startsWith("| The review reads the captures with no inherited context"));
  expect(row).toContain("under its bar");
  expect(verification).toContain(
    "- The review's 8.5 is one model's reading of the captures and no proof that a person prefers the page.",
  );

  const adr = repoFile("docs/adr/0018-a-new-site-has-a-creation-process-the-engine-requires.md");
  const note = adr.slice(adr.indexOf("Note of 2026-11-18"));
  expect(adr).toContain("Note of 2026-11-18");
  expect(note).toContain("option C");
  expect(adr).toContain(
    "under 8.5, a cap or a disposition other than `ship` leaves the item not prove",
  );
});

test("bar AC-18: the pair helper records the digest of the bytes it paired, and a pair made from other bytes than the approved sets no bar", async () => {
  // The engine's side: the file on disk matches the approval, and the record says what was paired.
  const paired = (digest: unknown) => [
    {
      shot: "home-default",
      width: 1280,
      ref: "home.png",
      pair: "home-default@1280.pair.png",
      digest,
    },
    {
      shot: "shop-default",
      width: 360,
      ref: "shop.png",
      pair: "shop-default@360.pair.png",
      digest: digestOf("the second reference"),
    },
  ];
  const cases: [string, unknown, string | null][] = [
    ["the approved bytes", digestOf("the first reference"), null],
    ["a weaker picture's bytes", digestOf("a weaker picture"), BAR_SENTENCES.noDigest],
    ["no digest", undefined, BAR_SENTENCES.noDigest],
    ["a null digest", null, BAR_SENTENCES.noDigest],
    ["the other reference's digest", digestOf("the second reference"), BAR_SENTENCES.noDigest],
  ];
  for (const [what, digest, sentence] of cases) {
    const a = await site();
    await a.approve();
    a.evidence();
    a.record({}, paired(digest));
    a.review(SCORE, DIMS, REFS, LEVEL);
    const got = await a.score();
    expect(got.saved?.bar, what).toBe(sentence === null ? "references" : "overall");
    expect(got.saved?.why, what).toBe(sentence ?? undefined);
    // The approved file stands unchanged on disk in every case.
    expect(readFileSync(join(a.refs, "home.png"), "utf8"), what).toBe("the first reference");
  }

  // The helper's side, with a stand-in page: the digest is of the bytes handed to the page.
  const { pairShots } = (await import(
    new URL("../../../plugins/core/e2e/playwright.mjs", import.meta.url).href
  )) as {
    pairShots: (page: unknown) => Promise<{
      pairs: { shot: string; pair: string | null; digest: string | null; reason: string | null }[];
    } | null>;
  };
  const b = await site();
  writeFileSync(join(b.ui, "home-default@1280.png"), "a capture");
  writeFileSync(join(b.ui, "shop-default@360.png"), "a capture");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const handed: string[] = [];
  let calls = 0;
  const blank = {
    evaluate: async (_fn: unknown, input: { reference: string }) => {
      handed.push(input.reference);
      calls += 1;
      return calls === 1
        ? { reason: null, cut: null, dataUrl: `data:image/png;base64,${png.toString("base64")}` }
        : { reason: "too many pixels" };
    },
    close: async () => {},
  };
  const page = { context: () => ({ browser: () => null, newPage: async () => blank }) };
  const names = ["WIZARDINGCODE_CREW_UI_DIR", "WIZARDINGCODE_CREW_E2E_DIR"] as const;
  const previous = names.map((name) => process.env[name]);
  try {
    delete process.env.WIZARDINGCODE_CREW_E2E_DIR;
    process.env.WIZARDINGCODE_CREW_UI_DIR = b.ui;
    const record = await pairShots(page);
    expect(record?.pairs.map((e) => [e.shot, e.pair, e.digest, e.reason])).toEqual([
      ["home-default", "home-default@1280.pair.png", digestOf("the first reference"), null],
      ["shop-default", null, null, "too many pixels"],
    ]);
    // The digest is of the very bytes the page was handed.
    const sent = Buffer.from((handed[0] ?? "").split(",")[1] ?? "", "base64");
    expect(createHash("sha256").update(sent).digest("hex")).toBe(record?.pairs[0]?.digest ?? "");
    const filed = JSON.parse(readFileSync(join(b.ui, "shots.json"), "utf8"));
    expect(filed.pairs[0].digest).toBe(digestOf("the first reference"));
    expect(Object.keys(filed.pairs[1])).toContain("digest");
  } finally {
    for (const [i, name] of names.entries()) {
      const value = previous[i];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

// Item 2026-11-18-009: the advisories of item 2026-11-18-008, closed. The rows are titled "bar2".

type Site = Awaited<ReturnType<typeof site>>;
/** One case: a site with everything in place for the references' bar, one thing changed, and the sentence the record must say; null where the references set the bar. */
async function after(
  what: string,
  change: (a: Site) => void | Promise<void>,
  sentence: string | null,
): Promise<Site> {
  const a = await site();
  await a.approve();
  a.evidence();
  a.review(SCORE, DIMS, REFS, LEVEL);
  await change(a);
  const got = await a.score();
  expect(got.saved?.bar, what).toBe(sentence === null ? "references" : "overall");
  expect(got.saved?.why, what).toBe(sentence ?? undefined);
  if (sentence !== null) expect(got.reasons.join("; "), what).toContain("7.9 under the bar of 8.5");
  return a;
}
const HOME = { shot: "home-default", width: 1280, ref: "home.png" };
const SHOP = { shot: "shop-default", width: 360, ref: "shop.png" };
const homeEntry = (over: Record<string, unknown> = {}) => ({
  ...HOME,
  pair: "home-default@1280.pair.png",
  digest: digestOf("the first reference"),
  ...over,
});
const shopEntry = (over: Record<string, unknown> = {}) => ({
  ...SHOP,
  pair: "shop-default@360.pair.png",
  digest: digestOf("the second reference"),
  ...over,
});
const rowsOf = (...rows: string[]): string =>
  `${HEADER}\n| :- | :- | :- | :- | :- | :- | :- |\n${rows.join("\n")}\n`;

test("bar2 AC-1: a score record a hand changed is no score, and one the engine wrote is read as before", async () => {
  const a = await after("the references set the bar", () => {}, null);
  const file = join(a.design, "score.json");
  const written = readScore(a.paths, a.id);
  expect(written?.score).toBe(7.9);
  expect((await a.run("status", a.id)).text).not.toContain("design score not recorded");
  writeFileSync(file, JSON.stringify({ ...written, score: 9.9, caps: [], disposition: "ship" }));
  expect(readScore(a.paths, a.id)).toBeNull();
  expect(designReasons(readSurface(a.paths, a.id), readScore(a.paths, a.id), "f")).toEqual([
    "design score not recorded (crew design <id> score, after the review)",
  ]);
  // Through the command a person runs: the item's status says the score is not recorded.
  const status = await a.run("status", a.id);
  expect(status.text).toContain("design score not recorded");
  // The engine's own next write is a record again, the round counted from one.
  const again = await a.score();
  expect(again.saved?.score).toBe(7.9);
  expect(again.saved?.round).toBe(1);
  // A record with none of item 008's fields, written by the engine, is read as it is.
  const old = { score: 8.6, caps: [], disposition: "ship", fingerprint: "f", at: "x" };
  designModule.saveScore(a.paths, a.id, old);
  expect(readScore(a.paths, a.id)).toEqual(old);
});

test("bar2 AC-2: each cause has the sentence that is so", async () => {
  const S = BAR_SENTENCES;
  expect(S.list).toBe("the shot list no longer names an approved shot once");
  expect(S.noDigest).toBe("a pair's record does not carry the approved reference's digest");
  const home = shotRow("home-default", "home.png", 1280);
  const shop = shotRow("shop-default", "shop.png", 360);
  await after("an approved shot with no row", (a) => writeFileSync(a.list, rowsOf(shop)), S.list);
  await after(
    "an approved shot with two rows",
    (a) => writeFileSync(a.list, rowsOf(home, shop, home)),
    S.list,
  );
  await after("the shot list gone", (a) => unlinkSync(a.list), S.list);
  await after("a shot list with no table", (a) => writeFileSync(a.list, "no table here\n"), S.list);
  await after(
    "an entry with another digest",
    (a) => a.record({}, [homeEntry({ digest: digestOf("a weaker picture") }), shopEntry()]),
    S.noDigest,
  );
  await after(
    "an entry with no digest",
    (a) => a.record({}, [homeEntry({ digest: undefined }), shopEntry()]),
    S.noDigest,
  );
  await after(
    "a row that names another file",
    (a) => writeFileSync(a.list, rowsOf(shotRow("home-default", "shop.png", 1280), shop)),
    S.changed,
  );
  await after(
    "a file with other bytes",
    (a) => writeFileSync(join(a.refs, "home.png"), "a weaker picture"),
    S.changed,
  );
  await after("findings with no count of shots", (a) => a.review(SCORE, DIMS), S.unread);
  await after(
    "reference: none while references are approved",
    (a) => a.review(SCORE, DIMS, "reference: none"),
    S.unread,
  );
  await after(
    "a count that differs",
    (a) => a.review(SCORE, DIMS, "reference: 3 shots", LEVEL),
    S.count,
  );
});

test("bar2 AC-3: a pair is a file that begins with a PNG's signature", async () => {
  const pair = (a: Site) => join(a.ui, "home-default@1280.pair.png");
  await after("a pair of one byte", (a) => writeFileSync(pair(a), "x"), BAR_SENTENCES.noPair);
  await after(
    "a pair of text",
    (a) => writeFileSync(pair(a), "a pair, in words"),
    BAR_SENTENCES.noPair,
  );
  await after(
    "a pair one byte short of the signature",
    (a) => writeFileSync(pair(a), PNG_PAIR.subarray(0, 7)),
    BAR_SENTENCES.noPair,
  );
  await after("an empty pair", (a) => writeFileSync(pair(a), ""), BAR_SENTENCES.noPair);
  await after("the signature alone", (a) => writeFileSync(pair(a), PNG_PAIR.subarray(0, 8)), null);
});

test("bar2 AC-9: one exported pattern reads the score line for both parsers", () => {
  const pattern = (designModule as Record<string, unknown>).SCORE_LINE;
  expect(pattern).toBeInstanceOf(RegExp);
  const source = repoFile("packages/engine/src/design-bar.ts");
  expect(source).toContain("SCORE_LINE");
  expect(/\/\^?score:/.test(source)).toBe(false);
  const texts: [string, string | null][] = [
    ["score: 8.7 · caps: none · disposition: ship", "ship"],
    // The raw word: `parseScore` turns it into `fix` under 8.5, `parseBarLines` gives it as written.
    ["score: 7.9 · caps: none · disposition: ship", "ship"],
    ["score: 8.7 · caps: creativity 7 · disposition: ship", "ship"],
    ["score: 6 · caps: none · disposition: rebuild", "rebuild"],
    ["score: 8.7 · caps: none", null],
    ["Score: 8.7 · caps: none · disposition: ship", null],
    ["score: 8.7 · caps: none · disposition: accept", null],
    ["score: 8.7 · caps: none · disposition: ship · more", null],
    ["no line at all", null],
  ];
  for (const [line, word] of texts) {
    const text = `read: 4 images\n${line}\n`;
    expect(parseBarLines(text).word, line).toBe(word);
    expect(parseScore(text) === null, line).toBe(word === null);
    expect(pattern instanceof RegExp && pattern.exec(text)?.[3], line).toBe(word ?? undefined);
  }
  expect(parseScore("score: 7.9 · caps: none · disposition: ship\n")?.disposition).toBe("fix");
  // The line twice: both read the first.
  const twice =
    "score: 9 · caps: none · disposition: ship\nscore: 6 · caps: none · disposition: fix\n";
  expect(parseBarLines(twice).word).toBe("ship");
  expect(parseScore(twice)?.score).toBe(9);
});

test("bar2 AC-13: a bar record rewritten by hand after the user's yes is no record", async () => {
  const a = await site();
  await a.approve();
  a.evidence();
  const file = join(a.design, "bar.json");
  const record = JSON.parse(readFileSync(file, "utf8"));
  expect(readBar(a.paths, a.id)).toEqual(record);
  // A weaker picture under the approved name, paired, and the record pointed at its digest by hand.
  writeFileSync(join(a.refs, "home.png"), "a weaker picture");
  record.shots[0].digest = digestOf("a weaker picture");
  writeFileSync(file, JSON.stringify(record));
  a.record({}, [homeEntry({ digest: digestOf("a weaker picture") }), shopEntry()]);
  a.review(SCORE, DIMS, REFS, LEVEL);
  expect(readBar(a.paths, a.id)).toBeNull();
  const direct = decideBar(a.paths, a.work(), findings(SCORE, DIMS, REFS, LEVEL), {
    caps: [],
    disposition: "fix",
  });
  expect(direct.bar).toBe("overall");
  expect(direct.why).toBe(BAR_SENTENCES.notApproved);
  const got = await a.score();
  expect(got.saved?.bar).toBe("overall");
  expect(got.saved?.why).toBe(BAR_SENTENCES.notApproved);
  expect(got.reasons.join("; ")).toContain("7.9 under the bar of 8.5");
});

test("bar2 AC-11: each bound the engine copies is the fixture's own", () => {
  const fixture = repoFile("plugins/core/e2e/playwright.mjs");
  const engine = repoFile("packages/engine/src/design-bar.ts");
  const boundOf = (source: string, name: string): string =>
    new RegExp(`^const ${name} =\\s*([^;]+);`, "m")
      .exec(source)?.[1]
      ?.replace(/\s+/g, " ")
      .trim() ?? `no ${name}`;
  const bounds: [string, string, string][] = [
    ["the shot's name", "SHOT_NAME", "NAME"],
    ["the reference's name", "REF_NAME", "REF_NAME"],
    ["the shot list's header", "SHOTS_HEADER", "SHOTS_HEADER"],
    ["the shot list's size", "SHOTS_MAX_BYTES", "SHOTS_MAX_BYTES"],
    ["the shot list's rows", "SHOTS_MAX_ROWS", "SHOTS_MAX_ROWS"],
    ["the reference's size", "REF_MAX_BYTES", "REF_MAX_BYTES"],
    ["the least width", "WIDTH_MIN", "SIZE_MIN"],
    ["the greatest width", "WIDTH_MAX", "SIZE_MAX"],
  ];
  for (const [what, ours, theirs] of bounds) {
    expect(boundOf(fixture, theirs), what).not.toBe(`no ${theirs}`);
    expect(`${what}: ${boundOf(engine, ours)}`).toBe(`${what}: ${boundOf(fixture, theirs)}`);
  }
});

test("bar2 AC-7: the branches the code already decides, each with its row", async () => {
  // The bar command's refusals, and the widths at their edges.
  const a = await site();
  const refused = async (what: string, ...args: string[]) => {
    const got = await a.run("design", a.id, "bar", ...args);
    expect(got.code, what).not.toBe(0);
    expect(a.work().decisions ?? [], what).toEqual([]);
    expect(() => readFileSync(join(a.design, "bar.json")), what).toThrow();
  };
  await refused("a shot named twice", "--shots", "home-default@1280,home-default@1280");
  writeFileSync(
    a.list,
    rowsOf(shotRow("home-default", "home.png", 199), shotRow("shop-default", "shop.png", 4001)),
  );
  await refused("a width of 199", "--shots", "home-default@199");
  await refused("a width of 4001", "--shots", "shop-default@4001");
  unlinkSync(a.list);
  await refused("no shot list", "--shots", "home-default@1280");
  writeFileSync(
    a.list,
    rowsOf(shotRow("home-default", "home.png", 200), shotRow("shop-default", "shop.png", 4000)),
  );
  const taken = await a.run("design", a.id, "bar", "--shots", "home-default@200,shop-default@4000");
  expect(taken.code).toBe(0);

  // The figures' edges, and a fenced block closed before the score line.
  const withDesign = (figure: string) =>
    findings(SCORE, DIMS.replace("design 8.2", `design ${figure}`), REFS, LEVEL);
  expect(parseBarLines(withDesign("10")).lines?.dimensions.design).toBe(10);
  expect(parseBarLines(withDesign("0")).lines?.dimensions.design).toBe(0);
  expect(parseBarLines(withDesign("10.1")).lines).toBeNull();
  const closed = `# notes\n\`\`\`\nan example\n\`\`\`\n${findings(SCORE, DIMS, REFS, LEVEL)}`;
  expect(parseBarLines(closed).lines?.shots).toBe(2);

  // The times: equal is not older; a time that does not parse is.
  const at = "2026-11-18T10:00:00.000Z";
  await after("a record at the capture's own time", (b) => b.evidence(at, at), null);
  await after(
    "a capture's time that does not parse",
    (b) =>
      writeFileSync(
        join(b.ui, "home-default.json"),
        JSON.stringify({ page: "home", state: "default", by: "fixture", at: "yesterday" }),
      ),
    BAR_SENTENCES.older,
  );

  // Two causes at once: the earlier sentence is said.
  await after(
    "no record and a capture with no metadata",
    (b) => {
      unlinkSync(join(b.ui, "shots.json"));
      unlinkSync(join(b.ui, "home-default.json"));
    },
    BAR_SENTENCES.noPair,
  );
  await after(
    "the lines unread and a count that differs",
    (b) => b.review(SCORE, DIMS, "reference: 3 shots"),
    BAR_SENTENCES.count,
  );
  const digestSentence =
    (BAR_SENTENCES as Record<string, string>).noDigest ?? BAR_SENTENCES.changed;
  await after(
    "one shot with no pair and another with another digest",
    (b) => b.record({}, [shopEntry({ digest: digestOf("a weaker picture") })]),
    digestSentence,
  );

  // The answers given through `crew decide` are the answers the engine recorded.
  for (const answer of ["no", "Yes", "yes, for the home page only", "yes"]) {
    const c = await site();
    const { decided, decision } = await c.approve(answer);
    expect(decided.code, answer).toBe(0);
    const recorded = c.work().decisions.find((d: { id: string }) => d.id === decision);
    expect(recorded.answer, answer).toBe(answer);
    expect(recorded.by, answer).toBe("user");
    expect(barApproved(c.work().decisions, readBar(c.paths, c.id)), answer).toBe(answer === "yes");
  }
});
