// The score says how many of a round's three readers were resumed (item 2026-11-18-016, the user's
// yes of 2026-11-18), counted from the protected records; and the hook and the round ask one test
// of a reading's record. The rows drive `fileAnswer` as the SubagentStop hook does.
import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { designScoreLines, readScore } from "../src/design.ts";
import { resumedReaders, roundReadings } from "../src/design-readers.ts";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import { buildContext } from "../src/hooks/context.ts";
import { fileAnswer, type Progress } from "../src/hooks/subagent-stop.ts";
import { withLock } from "../src/lock.ts";
import { CLARIFICATIONS_HEADING, workDir } from "../src/paths.ts";
import { filedReading, makeRepo, newRound, repoPaths, testEnv } from "./helpers.ts";

const PLAIN = "review/ui-ux.findings.md";
const HEADING = CLARIFICATIONS_HEADING;
const scored = (n: number): string =>
  `# ui-ux findings for x\nreviewer: review-ui-ux\nread: 4 images\nscore: ${n} · caps: none · disposition: ship\n\n## Findings\n(or: none)\n`;

/** An item, a new site unless `invention` is null, and the ways to file a reader on it. */
async function site(invention: "world" | null = "world") {
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
  if (invention) {
    const recorded = await run("design", id, "surface", "persuade", "--invention", invention);
    if (recorded.code !== 0) throw new Error(recorded.text);
  }
  const file = (text: string, agentId?: string) => filedReading(env, root, id, text, agentId);
  /** A gate run on changed code: a new fingerprint, every reading file removed. */
  const round = (fingerprint?: string) => newRound(env, root, id, fingerprint);
  /** A first gate run: the evidence takes a fingerprint and no file is removed. */
  const firstRun = (fingerprint: string): void => {
    const evidence = loadEvidence(paths, id).evidence;
    evidence.fingerprint = fingerprint;
    saveEvidence(paths, id, evidence);
  };
  /** A reader that stops with no answer, as the hook files a role cut off. */
  const cutOff = (agentId: string): void => {
    const ctx = buildContext({ session_id: "crew-test-reader", cwd: root }, env);
    if (!ctx) throw new Error("crew is inactive");
    const progress: Progress = { saved: null, recorded: false, pending: null, reply: null };
    withLock(workDir(ctx.paths, id), () =>
      fileAnswer(
        ctx,
        id,
        "review-ui-ux",
        { answer: "", agentId, filedBy: "hook", tokens: { tokens: 0, from: "none" } },
        "",
        progress,
      ),
    );
    if (!progress.recorded) throw new Error("the cut-off was not recorded");
  };
  const records = () =>
    (loadEvidence(paths, id).evidence.roles ?? []).filter((r) => r.agent === "review-ui-ux");
  const text = (name: string): string => readFileSync(join(folder, name), "utf8");
  const has = (name: string): boolean => existsSync(join(folder, name));
  const readings = (): string[] =>
    readdirSync(join(folder, "review"))
      .filter((n) => n.endsWith(".findings.md"))
      .map((n) => `review/${n}`)
      .sort();
  const score = async () => {
    const answer = await run("design", id, "score");
    return { answer, saved: answer.code === 0 ? readScore(paths, id) : null };
  };
  return { id, paths, folder, file, round, firstRun, cutOff, records, text, has, readings, score };
}

const ONE =
  "; 1 of the three was a resumed reader, with a record on this item before its reading of this code";
const many = (n: number): string =>
  `; ${n} of the three were resumed readers, each with a record on this item before its reading of this code`;
const WORD = "resumed reader";

test("count AC-1: the score records how many of the round's three were resumed readers, and its lines say it", async () => {
  // One reader of an earlier round beside two fresh: 1, in the form for one.
  const a = await site();
  a.round();
  const old = [a.file(scored(7)), a.file(scored(7.2)), a.file(scored(7.4))];
  a.round();
  a.file(scored(8.6), old[1]?.agentId);
  a.file(scored(8.4));
  a.file(scored(9));
  expect(resumedReaders(a.paths, a.id)).toBe(1);
  const one = await a.score();
  expect(one.saved?.resumed).toBe(1);
  expect(one.answer.text).toContain(`the median of each figure${ONE};`);
  expect(designScoreLines(one.saved ?? fail()).join("\n")).toContain(
    `the median of each figure${ONE}.`,
  );
  // A fourth reader, a resumed one, is not of the first three: the count stands.
  a.file(scored(9.5), old[0]?.agentId);
  expect(roundReadings(a.paths, a.id).filed).toBe(4);
  expect(resumedReaders(a.paths, a.id)).toBe(1);
  expect((await a.score()).saved?.resumed).toBe(1);

  // One filed before any gate run and one cut off, beside a fresh one: 2.
  const b = await site();
  const early = b.file(scored(6));
  b.firstRun("sha256:the-first-run");
  b.file(scored(8.6), early.agentId);
  b.cutOff("crew-test-cut");
  b.file(scored(8.4));
  b.file(scored(8.8), "crew-test-cut");
  const two = await b.score();
  expect(two.saved?.resumed).toBe(2);
  expect(two.answer.text).toContain(`the median of each figure${many(2)};`);
  expect(two.answer.text).not.toContain(ONE);
  expect(designScoreLines(two.saved ?? fail()).join("\n")).toContain(
    `the median of each figure${many(2)}.`,
  );

  // Three filed before any gate run, all resumed after the first: three new files, the standing
  // ones kept byte for byte, the new readings the round's three, and the count 3.
  const c = await site();
  const first = [c.file(scored(6)), c.file(scored(6.1)), c.file(scored(6.2))];
  const standing = c.readings();
  expect(standing.length).toBe(3);
  c.firstRun("sha256:the-first-run");
  const fresh = [
    c.file(scored(8.4), first[0]?.agentId),
    c.file(scored(8.6), first[1]?.agentId),
    c.file(scored(8.8), first[2]?.agentId),
  ];
  expect(c.readings().length).toBe(6);
  expect(fresh.every((r) => !standing.includes(r.file))).toBe(true);
  expect(standing.map((name) => c.text(name))).toEqual([scored(6), scored(6.1), scored(6.2)]);
  expect(roundReadings(c.paths, c.id).three).toEqual([scored(8.4), scored(8.6), scored(8.8)]);
  const three = await c.score();
  expect(three.saved?.score).toBe(8.6);
  expect(three.saved?.resumed).toBe(3);
  expect(three.answer.text).toContain(many(3));
  expect(designScoreLines(three.saved ?? fail()).join("\n")).toContain(
    `the median of each figure${many(3)}.`,
  );
  // A fresh fourth reader does not move the count of the first three either.
  c.file(scored(9.9));
  expect(resumedReaders(c.paths, c.id)).toBe(3);

  // None resumed: the record holds 0 and no word is added; a clarification filed after a fresh
  // reader's reading does not make it resumed.
  const d = await site();
  d.round();
  const readers = [d.file(scored(8.4)), d.file(scored(8.6)), d.file(scored(8.8))];
  d.file("the cap stands as I filed it", readers[0]?.agentId);
  expect(d.text(readers[0]?.file ?? "")).toContain(HEADING);
  expect(resumedReaders(d.paths, d.id)).toBe(0);
  const none = await d.score();
  expect(none.saved?.resumed).toBe(0);
  expect(none.answer.text).toContain("the median of each figure;");
  expect(none.answer.text).not.toContain(WORD);
  expect(designScoreLines(none.saved ?? fail()).join("\n")).not.toContain(WORD);
  // A record of three readers written before the count was kept reads as it did.
  const { resumed: _dropped, ...older } = one.saved ?? fail();
  expect(designScoreLines(older).join("\n")).not.toContain(WORD);
  expect(designScoreLines(older).join("\n")).toContain("the median of each figure.");

  // No three to count among: fewer than three filed, and a round that is broken.
  const e = await site();
  e.round();
  const few = [e.file(scored(8.4)), e.file(scored(8.6))];
  expect(resumedReaders(e.paths, e.id)).toBeNull();
  e.file(scored(8.8));
  expect(resumedReaders(e.paths, e.id)).toBe(0);
  unlinkSync(join(e.folder, few[1]?.file ?? ""));
  expect(resumedReaders(e.paths, e.id)).toBeNull();
  // One reader's score has no count.
  const f = await site();
  f.round();
  f.file(scored(8.6));
  const single = await f.score();
  expect(single.saved?.readers).toBe(1);
  expect(single.saved?.resumed).toBeUndefined();
}, 60_000);

test("count AC-2: a record on the fingerprint whose file is no reading's is no reading of the round, for the round and for the hook", async () => {
  const a = await site();
  const code = a.round();
  const reader = a.file(scored(7));
  // No command produces this record today: it is planted through the evidence's own writer, the
  // reader's record made to hold another file, as an audit's review would.
  const other = "audit/review-ui-ux.md";
  const evidence = loadEvidence(a.paths, a.id).evidence;
  const record = (evidence.roles ?? []).find((r) => r.agentId === reader.agentId);
  if (!record) throw new Error("the reader's record is not there");
  record.file = other;
  saveEvidence(a.paths, a.id, evidence);
  mkdirSync(dirname(join(a.folder, other)), { recursive: true });
  writeFileSync(join(a.folder, other), "an audit's review\n");
  unlinkSync(join(a.folder, PLAIN));
  expect(a.records().at(-1)).toMatchObject({ file: other, code });
  expect(roundReadings(a.paths, a.id).filed).toBe(0);

  const again = a.file(scored(8.6), reader.agentId);
  expect(again.file).toBe(PLAIN);
  expect(a.text(PLAIN)).toBe(scored(8.6));
  expect(a.text(other)).toBe("an audit's review\n");
  expect(roundReadings(a.paths, a.id).filed).toBe(1);
}, 60_000);

function fail(): never {
  throw new Error("no score was saved");
}
