// `extend` on a look nobody judged (item 2026-11-18-019): on a project where no item was held to
// the bar and passed, a Persuade or Experience item cannot record `extend` by the session's word
// alone. It is `surface`, or the user says, on the item's record, that the look stands.
import { expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import {
  LOOK_QUESTION,
  projectAtTheBar,
  recordSurface,
  type ScoreRecord,
  saveScore,
} from "../src/design.ts";
import { runDesignLint } from "../src/design-lint.ts";
import { declareKind } from "../src/design-proof.ts";
import { detectProfile } from "../src/detect/index.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { loadWork, saveWork } from "../src/work.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

const ROOT = join(import.meta.dir, "..", "..", "..");
const NEVER = "no page of this project was ever held to the bar";
const AT_THE_BAR: ScoreRecord = {
  score: 9,
  caps: [],
  disposition: "ship",
  fingerprint: "sha256:the-code-it-read",
  at: "2026-11-18T10:00:00.000Z",
  round: 1,
};

/** A project, with a DESIGN.md unless told otherwise, and the commands to drive its items. */
async function project(design = true) {
  const root = makeRepo({
    "README.md": "# t\n",
    "package.json": '{"name":"t"}\n',
    ...(design ? { "DESIGN.md": "---\ncolors:\n  ink: '#111'\n---\n# Design\n" } : {}),
  });
  const env = testEnv();
  const paths = repoPaths(root, env);
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
  /** A new item of the project, by its id. */
  const start = async (work_type = "feature"): Promise<string> => {
    const answers = JSON.stringify({
      work_type,
      is_vague: 0,
      scope: 1,
      touches_auth: 0,
      touches_payments: 0,
      touches_personal_data: 0,
      touches_data_migration: 0,
      touches_infra: 0,
      touches_public_api: 0,
    });
    const started = await run("start", "a page", "--answers", answers, "--json");
    // The answer's own id: its message may name an earlier item first.
    const id = (JSON.parse(started.text) as { id?: string }).id;
    if (!id) throw new Error(`no item was started: ${started.text}`);
    return id;
  };
  const extend = (id: string, mode = "persuade") =>
    run("design", id, "surface", mode, "--invention", "extend");
  const surfaceFile = (id: string) => join(root, ".crew", "work", id, "design", "surface.json");
  /** A question added to an item; its decision's id. */
  const ask = async (id: string, question: string): Promise<string> =>
    /(D-\d+)/.exec((await run("decision", id, "add", question)).text)?.[1] ?? "";
  /** An item judged and scored: a Persuade page at `world`, with the score given. */
  const scored = async (score: ScoreRecord, mode = "persuade", invention = "world") => {
    const id = await start();
    recordSurface(paths, id, mode as "persuade", invention as "world", "2026-11-18T09:00:00.000Z");
    saveScore(paths, id, score);
    return id;
  };
  return { root, paths, run, start, extend, surfaceFile, ask, scored };
}

test("unscored AC-1: on a project nobody held to the bar, extend on a Persuade or Experience page waits for a scored page or the user's yes", async () => {
  const p = await project();
  const a = await p.start();
  for (const mode of ["persuade", "experience"]) {
    const refused = await p.extend(a, mode);
    expect(refused.code, mode).not.toBe(0);
    expect(refused.text, mode).toContain(NEVER);
    expect(refused.text, mode).toContain(LOOK_QUESTION);
    expect(refused.text, mode).toContain(`crew decision ${a} add`);
    expect(refused.text, mode).not.toContain("operate");
    expect(existsSync(p.surfaceFile(a)), mode).toBe(false);
  }
  // The two modes the design score is not for record extend as before.
  const o = await p.start();
  for (const mode of ["operate", "read"]) expect((await p.extend(o, mode)).code, mode).toBe(0);

  // Only the user's yes to the engine's own question lifts it.
  const other = await p.ask(a, "Does the look stand?");
  expect((await p.run("decide", a, other, "yes")).code).toBe(0);
  expect((await p.extend(a)).code, "another question").not.toBe(0);
  const open = await p.ask(a, LOOK_QUESTION);
  expect((await p.extend(a)).code, "unanswered").not.toBe(0);
  expect((await p.run("decide", a, open, "no")).code).toBe(0);
  expect((await p.extend(a)).code, "answered no").not.toBe(0);
  // Answered yes by another than the user: no command of an attended session records it, so the
  // answer is planted through the engine's own writer.
  const v = await p.start();
  const planted = await p.ask(v, LOOK_QUESTION);
  const held = loadWork(p.paths, v).work;
  if (!held) throw new Error("the item is not there");
  const decision = held.decisions?.find((d) => d.id === planted);
  if (!decision) throw new Error("the decision is not there");
  Object.assign(decision, { answer: "yes", by: "validator", at: "2026-11-18T10:00:00.000Z" });
  saveWork(p.paths, held);
  expect((await p.extend(v)).code, "a validator's yes").not.toBe(0);
  // The user's yes.
  const asked = await p.ask(a, LOOK_QUESTION);
  expect((await p.run("decide", a, asked, "yes")).code).toBe(0);
  const taken = await p.extend(a);
  expect(taken.code).toBe(0);
  expect(JSON.parse(readFileSync(p.surfaceFile(a), "utf8")).invention).toBe("extend");
  // The yes is the item's: another item of the same project is still refused.
  expect((await p.extend(await p.start())).code).not.toBe(0);

  // A page of the project judged and at the bar: extend with no decision, on any other item.
  const q = await p_with(AT_THE_BAR);
  expect((await q.p.extend(await q.p.start())).code).toBe(0);
  // What does not put a project at the bar.
  const cases: [string, () => Promise<Awaited<ReturnType<typeof project>>>][] = [
    ["a score under the bar", async () => (await p_with({ ...AT_THE_BAR, score: 7 })).p],
    ["a score that says fix", async () => (await p_with({ ...AT_THE_BAR, disposition: "fix" })).p],
    ["a score on an operate page", async () => (await p_with(AT_THE_BAR, "operate", "surface")).p],
    [
      "a score of 3 on an operate page",
      async () => (await p_with({ ...AT_THE_BAR, score: 3 }, "operate", "world")).p,
    ],
    ["a score on an extend item", async () => (await p_with(AT_THE_BAR, "persuade", "extend")).p],
    [
      "an abandoned item's score",
      async () => {
        const made = await p_with(AT_THE_BAR);
        expect((await made.p.run("abandon", made.id, "--reason", "dropped")).code).toBe(0);
        return made.p;
      },
    ],
  ];
  for (const [name, make] of cases) {
    const made = await make();
    const refused = await made.extend(await made.start());
    expect(refused.code, name).not.toBe(0);
    expect(refused.text, name).toContain(NEVER);
  }

  // A score changed by hand is no score. The engine's refusal of a changed record comes first
  // for a command, so the rule is asked of the function itself.
  const changed = await p_with({ ...AT_THE_BAR, score: 7 });
  expect(projectAtTheBar(changed.p.paths)).toBe(false);
  const file = join(changed.p.root, ".crew", "work", changed.id, "design", "score.json");
  writeFileSync(file, readFileSync(file, "utf8").replace('"score": 7', '"score": 9'));
  expect(JSON.parse(readFileSync(file, "utf8")).score).toBe(9);
  expect(projectAtTheBar(changed.p.paths)).toBe(false);
  expect(projectAtTheBar(q.p.paths)).toBe(true);

  // With no DESIGN.md and no page added the new reason is the one said; where an older reason
  // applies, the older one is.
  const bare = await project(false);
  expect((await bare.extend(await bare.start())).text).toContain(NEVER);
  const product = await bare.extend(await bare.start("new-product"));
  expect(product.code).not.toBe(0);
  expect(product.text).toContain("a new product cannot record extend");
  expect(product.text).not.toContain(NEVER);

  // An item whose surface was recorded extend before: the gate's lint takes it as it did.
  const l = await project();
  const before = await l.start();
  const work = loadWork(l.paths, before).work;
  if (!work) throw new Error("the item is not there");
  recordSurface(l.paths, before, "persuade", "extend", "2026-10-30T00:00:00.000Z");
  declareKind(l.paths, { kind: "product-ui", metric: "activation" }, "2026-11-16");
  writeFileSync(join(l.root, "Card.vue"), "<template><p>Hello</p></template>\n");
  const lint = runDesignLint({
    paths: l.paths,
    work,
    profile: detectProfile(l.root),
    files: ["Card.vue"],
    policy: DEFAULT_POLICY,
    writes: false,
  });
  expect(lint.tail ?? "").not.toContain("process/no-surface");
}, 120_000);

/** A project with one item scored as given, and that item's id. */
async function p_with(score: ScoreRecord, mode = "persuade", invention = "world") {
  const p = await project();
  return { p, id: await p.scored(score, mode, invention) };
}

test("unscored AC-2: the brief says where the session learns it and proposes surface only for a change to how the page looks", () => {
  const brief = readFileSync(
    join(ROOT, "plugins/core/skills/wizardingcode-design-brief/SKILL.md"),
    "utf8",
  );
  const start = brief.indexOf("2. **Record the surface");
  const step = brief.slice(start, brief.indexOf("\n3. **", start));
  for (const phrase of [
    "the engine refuses `extend` there and says so",
    "for a change to how the page looks",
    "the site was never held to the bar",
    "propose `surface`",
  ])
    expect(step, phrase).toContain(phrase);
});
