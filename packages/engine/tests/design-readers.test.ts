// Three readers and their median (item 2026-11-18-011): where a second and a third reading are
// filed, which readings are a round's three, what the score command reads of them, and that the
// references set the bar on three readings and never on fewer.
import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import {
  designReasons,
  designScoreLines,
  readScore,
  readSurface,
  type ScoreRecord,
} from "../src/design.ts";
import { BAR_SENTENCES } from "../src/design-bar.ts";
import { medianFindings, READERS_REFUSALS, roundReadings } from "../src/design-readers.ts";
import { loadEvidence } from "../src/evidence.ts";
import { buildContext } from "../src/hooks/context.ts";
import {
  answerFile,
  fileAnswer,
  fileAnswerBySession,
  type Progress,
} from "../src/hooks/subagent-stop.ts";
import { writeReviewInputs } from "../src/judgement.ts";
import { loadWork } from "../src/work.ts";
import { filedReading, makeRepo, newRound, repoPaths, testEnv } from "./helpers.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const repoFile = (path: string): string => readFileSync(join(ROOT, path), "utf8");
const digestOf = (bytes: string): string => createHash("sha256").update(bytes).digest("hex");
const PNG_PAIR = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const HEADER = "| Shot | Ref | Whose and from where | Shows | Take from it | Leave | Width |";

const DIMS = "dimensions: design 8.2 · usability 8 · creativity 7.6 · content 8";
const REFS = "reference: 1 shots";
const LEVEL = "level: design 8 · usability 8 · creativity 7.5 · content 7.8";
/** A reviewer's findings: its score line, and whatever lines follow it. */
const reading = (score: string, ...lines: string[]): string =>
  `# ui-ux findings for x\nreviewer: review-ui-ux\nread: 4 images\n${[score, ...lines].join("\n")}\n\n## Findings\n(or: none)\n`;
const scored = (n: number, caps = "none", word = "ship"): string =>
  reading(`score: ${n} · caps: ${caps} · disposition: ${word}`);

/** An item of a new site, with one reference in its shot list, and the commands to drive it. */
async function site(invention: "world" | "surface" | "extend" | null = "world") {
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
  const review = join(folder, "review");
  const ui = join(review, "ui");
  mkdirSync(join(folder, "design", "refs"), { recursive: true });
  mkdirSync(ui, { recursive: true });
  if (invention) {
    const recorded = await run("design", id, "surface", "persuade", "--invention", invention);
    if (recorded.code !== 0) throw new Error(recorded.text);
  }
  const file = (text: string, agentId?: string) => filedReading(env, root, id, text, agentId);
  const round = (fingerprint?: string) => newRound(env, root, id, fingerprint);
  const score = async () => {
    const answer = await run("design", id, "score");
    const saved = answer.code === 0 ? readScore(paths, id) : null;
    const reasons = saved ? designReasons(readSurface(paths, id), saved, saved.fingerprint) : [];
    return { answer, saved, reasons };
  };
  /** The user's yes to one reference for the bar, and the fixture's files for it. */
  const approved = async () => {
    writeFileSync(join(folder, "design", "refs", "home.png"), "the reference");
    writeFileSync(
      join(folder, "design", "shots.md"),
      `${HEADER}\n| home-default | home.png | the user's | a screen | the proportions | the colours | 1280 |\n`,
    );
    const asked = await run("design", id, "bar", "--shots", "home-default@1280");
    await run("decide", id, /(D-\d+)/.exec(asked.text)?.[1] ?? "", "yes");
    writeFileSync(join(ui, "home-default@1280.png"), "png");
    writeFileSync(
      join(ui, "home-default.json"),
      JSON.stringify({
        page: "home",
        state: "default",
        by: "fixture",
        at: "2026-11-18T10:00:00.000Z",
      }),
    );
    writeFileSync(join(ui, "home-default@1280.pair.png"), PNG_PAIR);
    writeFileSync(
      join(ui, "shots.json"),
      JSON.stringify({
        by: "fixture",
        at: "2026-11-18T10:05:00.000Z",
        pairs: [
          {
            shot: "home-default",
            width: 1280,
            ref: "home.png",
            pair: "home-default@1280.pair.png",
            digest: digestOf("the reference"),
          },
        ],
      }),
    );
  };
  return { run, id, root, env, paths, folder, review, file, round, score, approved };
}
type Site = Awaited<ReturnType<typeof site>>;
const textOf = (a: Site, file: string): string => readFileSync(join(a.folder, file), "utf8");

test("readers AC-16: on a new site three reviewers leave three files, none written over; on any other item and for other roles the filing is as before", async () => {
  const a = await site();
  a.round();
  const first = a.file(scored(7.9));
  const second = a.file(scored(8.6));
  const third = a.file(scored(9));
  expect([first.file, second.file, third.file]).toEqual([
    "review/ui-ux.findings.md",
    "review/ui-ux.reading-2.findings.md",
    "review/ui-ux.reading-3.findings.md",
  ]);
  expect(textOf(a, first.file)).toBe(scored(7.9));
  expect(textOf(a, second.file)).toBe(scored(8.6));
  expect(textOf(a, third.file)).toBe(scored(9));
  // Each record took the code it read.
  const records = (loadEvidence(a.paths, a.id).evidence.roles ?? []).filter(
    (r) => r.agent === "review-ui-ux",
  );
  expect(records.map((r) => r.code)).toEqual(
    Array(3).fill(loadEvidence(a.paths, a.id).evidence.fingerprint),
  );

  // The second reviewer resumed: its answer joins its own reading, and the first's stands.
  const resumed = a.file("the cap stands as I filed it", second.agentId);
  expect(resumed.file).toBe(second.file);
  expect(textOf(a, second.file)).toContain(
    `${scored(8.6).trimEnd()}\n\n## Clarifications\n- the cap stands as I filed it`,
  );
  expect(textOf(a, first.file)).toBe(scored(7.9));

  // Another reviewer's second fresh answer is filed as before, over the first.
  const ctx = buildContext({ session_id: "crew-test", cwd: a.root }, a.env);
  if (!ctx) throw new Error("no context");
  const other = (text: string, agentId: string): string | null => {
    const progress: Progress = { saved: null, recorded: false, pending: null, reply: null };
    fileAnswer(
      ctx,
      a.id,
      "review-code-quality",
      { answer: text, agentId, filedBy: "hook", tokens: { tokens: 0, from: "none" } },
      "",
      progress,
    );
    return progress.saved?.file ?? null;
  };
  expect(other("# code-quality findings\nfirst", "cq-1")).toBe("review/code-quality.findings.md");
  expect(other("# code-quality findings\nsecond", "cq-2")).toBe("review/code-quality.findings.md");
  expect(textOf(a, "review/code-quality.findings.md")).toBe("# code-quality findings\nsecond\n");
  // An audit's reviewer is filed under audit/, where no reading file is made.
  expect(answerFile("review-ui-ux", scored(8), "audit")).toBe("audit/ui-ux.findings.md");

  // An item that is no new site: a later reviewer's findings take the plain file, as before, and its record takes no code.
  // Before any gate run too, where no reader's record has a code to tell a round by.
  for (const [kind, gated] of [
    [null, true],
    ["extend", true],
    [null, false],
  ] as const) {
    const plainItem = await site(kind);
    if (gated) plainItem.round();
    const cut = plainItem.file("the reviewer was cut off");
    const whole = plainItem.file(scored(8.2));
    expect([cut.file, whole.file], `${kind} ${gated}`).toEqual([
      "review/ui-ux.findings.md",
      "review/ui-ux.findings.md",
    ]);
    expect(textOf(plainItem, whole.file), `${kind} ${gated}`).toBe(scored(8.2));
    expect(
      existsSync(join(plainItem.review, "ui-ux.reading-2.findings.md")),
      `${kind} ${gated}`,
    ).toBe(false);
    const filed = (loadEvidence(plainItem.paths, plainItem.id).evidence.roles ?? []).filter(
      (r) => r.agent === "review-ui-ux",
    );
    expect(
      filed.map((r) => r.code),
      `${kind} ${gated}`,
    ).toEqual([undefined, undefined]);
    expect(roundReadings(plainItem.paths, plainItem.id).filed, `${kind} ${gated}`).toBe(0);
  }

  // A gate run on the same code keeps the readings; one on changed code removes all three.
  const work = loadWork(a.paths, a.id).work;
  if (!work) throw new Error("no work");
  writeReviewInputs(a.paths, work, [], "sha256:one");
  writeReviewInputs(a.paths, work, [], "sha256:one");
  expect(existsSync(join(a.folder, third.file))).toBe(true);
  writeReviewInputs(a.paths, work, [], "sha256:two");
  for (const f of [first.file, second.file, third.file])
    expect(existsSync(join(a.folder, f)), f).toBe(false);
});

test("readers AC-12: the median of three, the caps two name, the word two give, and a resumed reader's first answer", async () => {
  const a = await site();
  /** One round of three readings, scored. */
  const of = async (...texts: string[]) => {
    a.round();
    const filed = texts.map((t) => a.file(t));
    return { filed, got: await a.score() };
  };
  const plain = (await of(scored(7.9), scored(8.6), scored(9))).got;
  expect(plain.saved?.score).toBe(8.6);
  expect(plain.saved?.readers).toBe(3);
  expect(plain.saved?.filed).toBe(3);
  expect(plain.saved?.caps).toEqual([]);
  expect(plain.saved?.disposition).toBe("ship");
  expect(plain.reasons).toEqual([]);
  // The order they were filed in does not matter to the median.
  expect((await of(scored(9), scored(7.9), scored(8.6))).got.saved?.score).toBe(8.6);

  const same = (await of(scored(9, "creativity 7"), scored(9, "creativity 7"), scored(9))).got;
  expect(same.saved?.caps).toEqual(["creativity 7"]);
  expect(same.saved?.disposition).toBe("fix");
  const different = (await of(scored(9, "creativity 7"), scored(9, "content 6"), scored(9))).got;
  expect(different.saved?.caps).toEqual(["creativity 7", "content 6"]);
  expect(different.reasons.join("; ")).toContain("capped: creativity 7");
  const alone = (await of(scored(9, "creativity 7"), scored(9), scored(9))).got;
  expect(alone.saved?.caps).toEqual([]);
  expect(alone.saved?.capsUnapplied).toBe(1);
  expect(alone.saved?.disposition).toBe("ship");

  expect(
    (await of(scored(9, "none", "ship"), scored(9, "none", "rebuild"), scored(9, "none", "ship")))
      .got.saved?.disposition,
  ).toBe("ship");
  expect(
    (
      await of(
        scored(9, "none", "rebuild"),
        scored(9, "none", "rebuild"),
        scored(9, "none", "ship"),
      )
    ).got.saved?.disposition,
  ).toBe("rebuild");
  expect(
    (
      await of(
        scored(9, "none", "ship"),
        scored(9, "none", "rebuild"),
        scored(9, "none", "recapture"),
      )
    ).got.saved?.disposition,
  ).toBe("fix");
  const under = (
    await of(scored(8.4, "none", "ship"), scored(8.4, "none", "ship"), scored(9, "none", "fix"))
  ).got;
  expect(under.saved?.score).toBe(8.4);
  expect(under.saved?.disposition).toBe("fix");

  // A reader resumed, restating another score in its clarification: still a reading, its first answer's figures.
  a.round();
  const readers = [a.file(scored(7.9)), a.file(scored(8.6)), a.file(scored(9))];
  a.file(
    "score: 9.9 · caps: none · disposition: ship\ndimensions: design 9 · usability 9 · creativity 9 · content 9",
    readers[1]?.agentId,
  );
  const resumed = await a.score();
  expect(resumed.saved?.score).toBe(8.6);
  expect(resumed.saved?.readers).toBe(3);

  // The medians' text holds figures and caps, and no other word of a reading.
  const made = medianFindings([
    reading("score: 8 · caps: none · disposition: ship", DIMS, REFS, LEVEL),
    scored(8),
    scored(8),
  ]);
  expect(made.text).toBe("score: 8 · caps: none · disposition: ship\n");
});

test("readers AC-9: the first three of a round stand whole or no score is recorded", async () => {
  const a = await site();
  a.round();
  for (const n of [7.6, 7.8, 8, 9.5, 9.6]) a.file(scored(n));
  const five = await a.score();
  expect(five.saved?.score).toBe(7.8);
  expect(five.saved?.filed).toBe(5);
  expect(five.saved?.readers).toBe(3);

  // A later reading changed or deleted changes nothing: the first three decide.
  const later = (loadEvidence(a.paths, a.id).evidence.roles ?? [])
    .filter((r) => r.agent === "review-ui-ux")
    .map((r) => r.file ?? "");
  writeFileSync(join(a.folder, later[3] ?? ""), scored(1));
  unlinkSync(join(a.folder, later[4] ?? ""));
  expect((await a.score()).saved?.score).toBe(7.8);

  /** A round of three, one thing done to it, and what the score command answers. */
  const broken = async (what: string, change: (files: string[]) => void, later = true) => {
    a.round();
    const files = [a.file(scored(8.1)), a.file(scored(8.3)), a.file(scored(8.7))].map(
      (r) => r.file,
    );
    const before = readScore(a.paths, a.id);
    change(files);
    if (later) a.file(scored(9.5));
    const got = await a.score();
    expect(got.answer.code, what).not.toBe(0);
    expect(got.answer.text, what).toContain(READERS_REFUSALS.broken);
    expect(readScore(a.paths, a.id), what).toEqual(before);
  };
  await broken("a low reading's file changed, a later one filed", (f) =>
    writeFileSync(join(a.folder, f[0] ?? ""), scored(9.9)),
  );
  await broken("a low reading's file deleted, a later one filed", (f) =>
    unlinkSync(join(a.folder, f[1] ?? "")),
  );
  await broken(
    "the plain file itself deleted",
    (f) => unlinkSync(join(a.folder, f[0] ?? "")),
    false,
  );
  await broken(
    "a reading left with no score line",
    (f) => writeFileSync(join(a.folder, f[2] ?? ""), "no score here\n"),
    false,
  );
  // A reader that filed no score line is one of the three, and the three are then not whole.
  a.round();
  a.file(scored(8.7));
  a.file(
    "# ui-ux findings for x\nreviewer: review-ui-ux\nread: 4 images\nthe captures did not load",
  );
  a.file(scored(8.9));
  a.file(scored(9.5));
  const scoreless = await a.score();
  expect(scoreless.answer.code).not.toBe(0);
  expect(scoreless.answer.text).toContain(READERS_REFUSALS.broken);
  // Three filed and two spoiled, the plain file the highest: no fall to one reader.
  a.round();
  const spoiled = [a.file(scored(8.7)), a.file(scored(8.1)), a.file(scored(8.3))].map(
    (r) => r.file,
  );
  writeFileSync(join(a.folder, spoiled[1] ?? ""), "spoiled\n");
  writeFileSync(join(a.folder, spoiled[2] ?? ""), "spoiled\n");
  const kept = await a.score();
  expect(kept.answer.code).not.toBe(0);
  expect(kept.answer.text).toContain(READERS_REFUSALS.broken);

  // Two readings: a third is owed.
  a.round();
  a.file(scored(8.7));
  a.file(scored(8.1));
  const two = await a.score();
  expect(two.answer.code).not.toBe(0);
  expect(two.answer.text).toContain(READERS_REFUSALS.third);
  // A session's filing under the reviewer's role is no reading of the round: a third is still owed.
  const ctx = buildContext({ session_id: "crew-answer", cwd: a.root }, a.env);
  if (!ctx) throw new Error("no context");
  fileAnswerBySession(ctx, a.id, "review-ui-ux", { answer: scored(9.9).trimEnd() });
  expect(roundReadings(a.paths, a.id).filed).toBe(2);
  expect((await a.score()).answer.text).toContain(READERS_REFUSALS.third);
  // The session's filing wrote over the plain file, the first reader's: with the third reader filed,
  // the three are not whole and no score is recorded. A session gains nothing by filing a reading.
  a.file(scored(8.9));
  expect(roundReadings(a.paths, a.id).filed).toBe(3);
  expect((await a.score()).answer.text).toContain(READERS_REFUSALS.broken);

  // A gate run on unchanged code keeps the round; changed code begins another; a code that returns finds its old round broken.
  const one = a.round();
  for (const n of [8.6, 8.7, 8.8]) a.file(scored(n));
  expect((await a.score()).saved?.score).toBe(8.7);
  const work = loadWork(a.paths, a.id).work;
  if (!work) throw new Error("no work");
  writeReviewInputs(a.paths, work, [], one);
  writeReviewInputs(a.paths, work, [], one);
  expect((await a.score()).saved?.score).toBe(8.7);
  a.round();
  expect(roundReadings(a.paths, a.id)).toEqual({ filed: 0, three: null });
  a.round(one);
  expect(roundReadings(a.paths, a.id)).toEqual({ filed: 3, three: null });
  expect((await a.score()).answer.text).toContain(READERS_REFUSALS.broken);

  // Before any gate run a reading belongs to no round: the plain file is read, one reader's.
  const b = await site();
  for (const n of [8.6, 8.7, 8.8]) b.file(scored(n));
  expect(roundReadings(b.paths, b.id).filed).toBe(0);
  const unbound = await b.score();
  expect(unbound.saved?.readers).toBe(1);
  expect(unbound.saved?.score).toBe(8.6);
});

test("readers AC-13: the references set the bar on three readings and never on fewer", async () => {
  const dims = (design: number) =>
    `dimensions: design ${design} · usability 8 · creativity 7.6 · content 8`;
  const level = (design: number) =>
    `level: design ${design} · usability 8 · creativity 7.5 · content 7.8`;
  const read = (design: number, lvl: number, caps = "none") =>
    reading(`score: 7.9 · caps: ${caps} · disposition: ship`, dims(design), REFS, level(lvl));
  const a = await site();
  await a.approved();
  a.round();
  for (const [d, l] of [
    [8.4, 7.9],
    [8.2, 8.1],
    [8.1, 8.3],
  ] as const)
    a.file(read(d, l));
  const at = await a.score();
  expect(at.saved?.bar).toBe("references");
  expect(at.saved?.readers).toBe(3);
  expect(at.saved?.dimensions?.design).toBe(8.2);
  expect(at.saved?.level?.design).toBe(8.1);
  expect(at.saved?.disposition).toBe("ship");
  expect(at.reasons).toEqual([]);

  // One tenth under the level's median fails, with both figures.
  a.round();
  for (const [d, l] of [
    [8.4, 7.9],
    [8, 8.1],
    [7.9, 8.3],
  ] as const)
    a.file(read(d, l));
  const under = await a.score();
  expect(under.saved?.bar).toBe("references");
  expect(under.saved?.disposition).toBe("fix");
  expect(under.reasons.join("; ")).toContain("design 8 under the references' 8.1");

  // One reading: the bar is 8.5 and the record says why; a low level at once says the readers' sentence, the earlier.
  for (const lvl of [8.1, 7.4]) {
    a.round();
    a.file(read(8.4, lvl));
    const one = await a.score();
    expect(one.saved?.bar, String(lvl)).toBe("overall");
    expect(one.saved?.why, String(lvl)).toBe(BAR_SENTENCES.readers);
    expect(one.saved?.readers, String(lvl)).toBe(1);
    expect(one.reasons.join("; "), String(lvl)).toContain("7.9 under the bar of 8.5");
  }
  expect(BAR_SENTENCES.readers).toBe("fewer than three readers read the references");

  // Three readings of which one has unread lines.
  a.round();
  a.file(read(8.4, 7.9));
  a.file(read(8.2, 8.1));
  a.file(reading("score: 7.9 · caps: none · disposition: ship", dims(8.1), REFS));
  const unread = await a.score();
  expect(unread.saved?.bar).toBe("overall");
  expect(unread.saved?.why).toBe(BAR_SENTENCES.unread);
  expect(unread.saved?.readers).toBe(3);

  // Three readings that count different numbers of shots: the lines are unread.
  a.round();
  a.file(read(8.4, 7.9));
  a.file(read(8.2, 8.1));
  a.file(read(8.1, 8.3).replace(REFS, "reference: 2 shots"));
  const counts = await a.score();
  expect(counts.saved?.bar).toBe("overall");
  expect(counts.saved?.why).toBe(BAR_SENTENCES.unread);

  // A reader resumed, restating its lines for the bar in a clarification: its first answer is read, and the bar stands.
  a.round();
  const resumed = [a.file(read(8.4, 7.9)), a.file(read(8.2, 8.1)), a.file(read(8.1, 8.3))];
  a.file(`${dims(9.9)}\n${level(7.5)}`, resumed[0]?.agentId);
  const clarified = await a.score();
  expect(clarified.saved?.bar).toBe("references");
  expect(clarified.saved?.dimensions?.design).toBe(8.2);
  expect(clarified.saved?.level?.design).toBe(8.1);

  // A cap one reader alone names is not applied, and the record says a reader named one.
  a.round();
  a.file(read(8.4, 7.9, "creativity 7"));
  a.file(read(8.2, 8.1));
  a.file(read(8.1, 8.3));
  const capped = await a.score();
  expect(capped.saved?.bar).toBe("references");
  expect(capped.saved?.caps).toEqual([]);
  expect(capped.saved?.capsUnapplied).toBe(1);
  expect(capped.saved?.disposition).toBe("ship");
});

test("readers AC-5: the command and the report say how many read", async () => {
  const a = await site();
  a.round();
  for (const n of [8.6, 8.7, 8.8, 9]) a.file(scored(n, n === 8.6 ? "creativity 7" : "none"));
  const three = await a.score();
  for (const text of [three.answer.text, designScoreLines(three.saved as ScoreRecord).join("\n")]) {
    expect(text).toContain("three readers read the site, the median of each figure");
    expect(text).toContain("the first three of 4 filed");
    expect(text).toContain("1 reader named a cap that was not applied");
    expect(text).not.toContain("jury");
  }
  a.round();
  a.file(scored(8.6));
  const one = await a.score();
  for (const text of [one.answer.text, designScoreLines(one.saved as ScoreRecord).join("\n")])
    expect(text).toContain("one reader read the site");

  await a.approved();
  a.round();
  for (let i = 0; i < 3; i += 1)
    a.file(reading("score: 7.9 · caps: none · disposition: ship", DIMS, REFS, LEVEL));
  const refs = await a.score();
  const report = designScoreLines(refs.saved as ScoreRecord).join("\n");
  expect(refs.saved?.bar).toBe("references");
  expect(report).toContain(
    "three readers read both the references and the site, the median of each figure",
  );
  expect(report).not.toContain("one reader");
  // A record of before this item says one reader, as it did.
  const old = {
    score: 8.6,
    caps: [],
    disposition: "ship",
    fingerprint: "f",
    at: "x",
    bar: "overall",
  } as ScoreRecord;
  expect(designScoreLines(old).join("\n")).toContain("one reader read the site");
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

test("readers AC-6: the skill, the rubric, the gate's reference and the ADR say three readers", () => {
  const review = repoFile("plugins/core/skills/wizardingcode-design-review/SKILL.md");
  const launch = step(review, 2, "Launch");
  expect(launch).toContain("three `review-ui-ux`");
  expect(launch).toContain("in one message");
  expect(section(review, "Done when")).toContain("three readings");
  expect(
    section(repoFile("plugins/core/skills/crew/rubrics/design-finish.md"), "The line"),
  ).toContain("the median of three readings");
  const gate = repoFile("plugins/core/skills/crew/references/gate.md")
    .split("\n")
    .find((l) => l.includes("`crew design <id> score` records the bar"));
  expect(gate).toContain("median");
  const adr = repoFile("docs/adr/0018-a-new-site-has-a-creation-process-the-engine-requires.md");
  expect(adr.slice(adr.indexOf("Note of 2026-11-18"))).toContain("three readers");
});

// Item 2026-11-18-012: the refusal of a round names its cause, and rows for what the code decides.

test("readers2 AC-2: the refusal of a round that is not whole names the reading and the cause", async () => {
  const a = await site();
  const refusal = async (change: (files: string[]) => void): Promise<string> => {
    a.round();
    const files = [a.file(scored(8.1)), a.file(scored(8.3)), a.file(scored(8.7))].map(
      (r) => r.file,
    );
    change(files);
    const got = await a.score();
    expect(got.answer.code).not.toBe(0);
    return got.answer.text;
  };
  const missing = await refusal((f) => unlinkSync(join(a.folder, f[0] ?? "")));
  expect(missing).toContain(`${READERS_REFUSALS.broken} (the first reading: its file is missing)`);
  const changed = await refusal((f) =>
    writeFileSync(join(a.folder, f[1] ?? ""), `${scored(9.9)}SECRET-WORDS\n`),
  );
  expect(changed).toContain(
    `${READERS_REFUSALS.broken} (the second reading: its file changed since it was filed)`,
  );
  expect(changed).not.toContain("SECRET-WORDS");
  // The third reader filed no score line: the hook's own filing, so the hash holds and the line is what lacks.
  a.round();
  a.file(scored(8.1));
  a.file(scored(8.3));
  a.file(
    "# ui-ux findings for x\nreviewer: review-ui-ux\nthe captures did not load, CUT-OFF-WORDS",
  );
  const scoreless = (await a.score()).answer.text;
  expect(scoreless).toContain(
    `${READERS_REFUSALS.broken} (the third reading: it holds no score line)`,
  );
  expect(scoreless).not.toContain("CUT-OFF-WORDS");
});

test("readers2 AC-3: the review skill names the reviewer cut off before its score line", () => {
  const review = repoFile("plugins/core/skills/wizardingcode-design-review/SKILL.md");
  expect(step(review, 2, "Launch")).toContain("cut off before its score line");
});

test("readers2 AC-9: a site of invention surface, a surface recorded after a first reader, and a new site before any gate run", async () => {
  const records = (a: Site) =>
    (loadEvidence(a.paths, a.id).evidence.roles ?? []).filter((r) => r.agent === "review-ui-ux");
  const three = [
    "review/ui-ux.findings.md",
    "review/ui-ux.reading-2.findings.md",
    "review/ui-ux.reading-3.findings.md",
  ];

  // Invention `surface` is a new site as `world` is.
  const s = await site("surface");
  const code = s.round();
  expect([s.file(scored(7.9)).file, s.file(scored(8.6)).file, s.file(scored(9)).file]).toEqual(
    three,
  );
  expect(records(s).map((r) => r.code)).toEqual([code, code, code]);
  expect((await s.score()).saved?.score).toBe(8.6);

  // A surface recorded after a first reader filed: that reader is of no round and its file is written over.
  const late = await site(null);
  late.round();
  const first = late.file(scored(9.9));
  expect(
    (await late.run("design", late.id, "surface", "persuade", "--invention", "world")).code,
  ).toBe(0);
  const second = late.file(scored(8.1));
  expect([first.file, second.file]).toEqual([
    "review/ui-ux.findings.md",
    "review/ui-ux.findings.md",
  ]);
  expect(textOf(late, second.file)).toBe(scored(8.1));
  expect(records(late).map((r) => r.code === undefined)).toEqual([true, false]);
  expect(roundReadings(late.paths, late.id).filed).toBe(1);
  expect(late.file(scored(8.3)).file).toBe("review/ui-ux.reading-2.findings.md");
  expect((await late.score()).answer.text).toContain(READERS_REFUSALS.third);

  // A new site before any gate run: three files, none written over, no code and no round.
  const early = await site();
  expect([
    early.file(scored(8.6)).file,
    early.file(scored(8.7)).file,
    early.file(scored(8.8)).file,
  ]).toEqual(three);
  expect(textOf(early, three[0] ?? "")).toBe(scored(8.6));
  expect(records(early).map((r) => r.code)).toEqual([undefined, undefined, undefined]);
  expect(roundReadings(early.paths, early.id).filed).toBe(0);
});
