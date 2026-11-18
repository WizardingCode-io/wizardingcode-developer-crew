// A reader of a new site's design resumed (item 2026-11-18-015, the user's answer of 2026-11-18):
// one that has no reading of the present round is filed as a reading of it; one that has is joined
// to it. The rows drive `fileAnswer` as the SubagentStop hook does; the hook's entry is not driven.
import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { readScore } from "../src/design.ts";
import { brokenReading, READERS_REFUSALS, roundReadings } from "../src/design-readers.ts";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import { buildContext } from "../src/hooks/context.ts";
import { fileAnswer, type Progress } from "../src/hooks/subagent-stop.ts";
import { withLock } from "../src/lock.ts";
import { workDir } from "../src/paths.ts";
import { filedReading, makeRepo, newRound, repoPaths, testEnv } from "./helpers.ts";

const PLAIN = "review/ui-ux.findings.md";
const second = "review/ui-ux.reading-2.findings.md";
const third = "review/ui-ux.reading-3.findings.md";
const HEADING = "## Clarifications";
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
  return { id, paths, file, round, firstRun, cutOff, records, text, has, readings, score };
}

test("resumed AC-5: a reader of an earlier round, resumed after the code changed, is a reading of the new round", async () => {
  const a = await site();
  a.round();
  const one = a.file(scored(7));
  const two = a.file(scored(7.2));
  const three = a.file(scored(7.4));
  expect([one.file, two.file, three.file]).toEqual([PLAIN, second, third]);

  // The code changed: one reader resumed, two fresh ones beside it.
  const next = a.round();
  const again = a.file(scored(8.6), two.agentId);
  expect(again.file).toBe(PLAIN);
  expect(a.text(PLAIN)).toBe(scored(8.6));
  expect(a.text(PLAIN)).not.toContain(HEADING);
  expect(a.records().at(-1)?.code).toBe(next);
  a.file(scored(8.4));
  a.file(scored(9));
  expect(roundReadings(a.paths, a.id).three?.length).toBe(3);
  const got = await a.score();
  expect(got.answer.code).toBe(0);
  expect(got.saved?.score).toBe(8.6);
  expect(got.saved?.readers).toBe(3);

  // Resumed again in the new round, where its file has another name than in the earlier one: it
  // joins the new round's file, and no file of the earlier name is made.
  const before = a.readings();
  const clarified = a.file("score: 9.9 · caps: none · disposition: ship", two.agentId);
  expect(clarified.file).toBe(PLAIN);
  expect(a.text(PLAIN).startsWith(scored(8.6).trimEnd())).toBe(true);
  expect(a.text(PLAIN)).toContain(`${HEADING}\n- score: 9.9`);
  expect(a.readings()).toEqual(before);
  expect(a.text(second)).not.toContain(HEADING);
  expect((await a.score()).saved?.score).toBe(8.6);

  // Three readers of an earlier round, resumed in another order than they first filed, are the
  // new round's three, each in a file of its own.
  const b = await site();
  b.round();
  const first = [b.file(scored(7)), b.file(scored(7.1)), b.file(scored(7.2))];
  const later = b.round();
  const files = [
    b.file(scored(8.8), first[2]?.agentId).file,
    b.file(scored(8.6), first[0]?.agentId).file,
    b.file(scored(8.7), first[1]?.agentId).file,
  ];
  expect(files).toEqual([PLAIN, second, third]);
  expect([b.text(PLAIN), b.text(second), b.text(third)]).toEqual([
    scored(8.8),
    scored(8.6),
    scored(8.7),
  ]);
  expect(
    b
      .records()
      .slice(-3)
      .map((r) => r.code),
  ).toEqual([later, later, later]);
  const median = await b.score();
  expect(median.saved?.score).toBe(8.7);
  expect(median.saved?.readers).toBe(3);

  // A resumed answer with no score line is a reading that holds none, and the refusal names it.
  const c = await site();
  c.round();
  const old = [c.file(scored(7)), c.file(scored(7.1)), c.file(scored(7.2))];
  c.round();
  c.file(scored(8.6), old[0]?.agentId);
  c.file("the cap stands as I filed it", old[1]?.agentId);
  c.file(scored(8.8), old[2]?.agentId);
  expect(brokenReading(c.paths, c.id)).toBe("the second reading: it holds no score line");
  const refused = await c.score();
  expect(refused.answer.code).not.toBe(0);
  expect(refused.answer.text).toContain(READERS_REFUSALS.broken);
  expect(refused.answer.text).toContain("the second reading: it holds no score line");
}, 60_000);

test("resumed AC-5: a reader filed before any gate run, and one cut off with no answer, resumed", async () => {
  // Filed before any gate run; the first gate run removes no file, so its file stands.
  const a = await site();
  const early = a.file(scored(6));
  expect(early.file).toBe(PLAIN);
  expect(a.records().at(-1)?.code).toBeUndefined();
  a.firstRun("sha256:the-first-run");
  const again = a.file(scored(8.6), early.agentId);
  expect(again.file).toBe(second);
  expect(a.text(second)).toBe(scored(8.6));
  expect(a.text(PLAIN), "the standing file keeps its bytes").toBe(scored(6));
  expect(a.records().at(-1)?.code).toBe("sha256:the-first-run");
  a.file(scored(8.4));
  a.file(scored(9));
  const standing = await a.score();
  expect(standing.saved?.score).toBe(8.6);
  expect(standing.saved?.readers).toBe(3);

  // The same reader where a later gate run on changed code removed its file.
  const b = await site();
  const gone = b.file(scored(6));
  const next = b.round();
  expect(b.has(PLAIN)).toBe(false);
  const back = b.file(scored(8.6), gone.agentId);
  expect(back.file).toBe(PLAIN);
  expect(b.text(PLAIN)).toBe(scored(8.6));
  expect(b.records().at(-1)?.code).toBe(next);

  // A reader of this round cut off with no answer, then resumed: a record with no file is no
  // reading, so its answer is one, and its place in the round is its reading's.
  const c = await site();
  const round = c.round();
  c.cutOff("crew-test-cut-off");
  expect(c.records().at(-1)).toMatchObject({ file: null, code: round });
  expect(roundReadings(c.paths, c.id).filed).toBe(0);
  const one = c.file(scored(8.4));
  const resumed = c.file(scored(8.8), "crew-test-cut-off");
  expect([one.file, resumed.file]).toEqual([PLAIN, second]);
  expect(c.text(second)).toBe(scored(8.8));
  expect(c.text(second)).not.toContain(HEADING);
  c.file(scored(8.6));
  expect(roundReadings(c.paths, c.id).three).toEqual([scored(8.4), scored(8.8), scored(8.6)]);
  expect((await c.score()).saved?.score).toBe(8.6);

  // A reader of an earlier round, cut off in the new one and resumed again: its record of the new
  // round holds no file, so it still has no reading of it, and its answer is one.
  const d = await site();
  d.round();
  const before = d.file(scored(7));
  const later = d.round();
  d.cutOff(before.agentId);
  const whole = d.file(scored(8.6), before.agentId);
  expect(whole.file).toBe(PLAIN);
  expect(d.text(PLAIN)).toBe(scored(8.6));
  expect(d.records().at(-1)?.code).toBe(later);
}, 60_000);

test("resumed AC-4: a reader that has a reading of the round is joined to it, and what is no new site or has no fingerprint is filed as before", async () => {
  // Resumed within the round it first read: joined, its figures those of its first answer.
  const a = await site();
  a.round();
  const readers = [a.file(scored(8.4)), a.file(scored(8.6)), a.file(scored(8.8))];
  const joined = a.file("score: 9.9 · caps: none · disposition: ship", readers[1]?.agentId);
  expect(joined.file).toBe(second);
  expect(a.text(second)).toContain(`${HEADING}\n- score: 9.9`);
  expect(a.readings()).toEqual([PLAIN, second, third].sort());
  expect((await a.score()).saved?.score).toBe(8.6);
  // Its reading's file removed by hand, the reader resumed: no new reading, and the round refused.
  unlinkSync(join(a.paths.root, ".crew", "work", a.id, third));
  const drawn = a.file(scored(9.5), readers[2]?.agentId);
  expect(drawn.file).toBe(third);
  expect(a.text(third).trimStart().startsWith(HEADING)).toBe(true);
  expect(a.readings()).toEqual([PLAIN, second, third].sort());
  expect(brokenReading(a.paths, a.id)).toBe("the third reading: it holds no score line");
  expect((await a.score()).answer.text).toContain(READERS_REFUSALS.broken);

  // An item that is no new site: a reviewer resumed after the code changed joins the plain file.
  const b = await site(null);
  b.round();
  const reviewer = b.file(scored(7));
  b.round();
  const reply = b.file("the finding stands", reviewer.agentId);
  expect(reply.file).toBe(PLAIN);
  expect(b.text(PLAIN).trimStart().startsWith(HEADING)).toBe(true);
  expect(b.records().every((r) => r.code === undefined)).toBe(true);

  // A new site whose evidence has no fingerprint: joined as before.
  const c = await site();
  const early = c.file(scored(7));
  const more = c.file("one more thing", early.agentId);
  expect(more.file).toBe(PLAIN);
  expect(c.text(PLAIN)).toContain(`${HEADING}\n- one more thing`);
  expect(c.records().every((r) => r.code === undefined)).toBe(true);

  // A return to a code read before: the reader's record on that code is its first, its file was
  // removed by the gate runs between, and the round is refused as holding no score line.
  const d = await site();
  const codeA = d.round();
  const old = [d.file(scored(8.4)), d.file(scored(8.6)), d.file(scored(8.8))];
  d.round();
  d.round(codeA);
  for (const reader of old) d.file(scored(9), reader.agentId);
  expect(d.text(PLAIN).trimStart().startsWith(HEADING)).toBe(true);
  expect(brokenReading(d.paths, d.id)).toBe("the first reading: it holds no score line");
  expect((await d.score()).answer.text).toContain(READERS_REFUSALS.broken);
}, 60_000);
