import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { PROTECTED_WORK_FILES } from "../src/paths.ts";
import * as store from "../src/store.ts";
import { openItems } from "../src/work.ts";
import {
  cliIo,
  git,
  hookContext,
  makeRepo,
  repoPaths,
  tempDir,
  testEnv,
  write,
} from "./helpers.ts";

const ANSWERS = JSON.stringify({
  work_type: "feature",
  is_vague: 0.1,
  scope: 0,
  touches_auth: 0,
  touches_payments: 0,
  touches_personal_data: 0,
  touches_data_migration: 0,
  touches_infra: 0,
  touches_public_api: 0,
});

const FIRST_USE =
  /first use of this project on this machine: (\d+) file\(s\) recorded as they stand/;
const TAMPERED = "state changed outside the engine: ";

/** A project the engine made: a profile, a register and one item, with the trust record the engine wrote. */
async function project() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "true" } }),
    "src/a.ts": "x\n",
  });
  const env = testEnv();
  const run = cliIo(root, env);
  const started = await run("start", "a change", "--answers", ANSWERS, "--criterion", "it works");
  expect(started.code).toBe(0);
  const paths = repoPaths(root, env);
  const id = openItems(paths)[0]?.id ?? "";
  expect(id).not.toBe("");
  // A decision answered, so the project has its register too.
  expect((await run("decision", id, "add", "which way?", "--default", "the short one")).code).toBe(
    0,
  );
  expect((await run("decide", id, "D-1", "the short one")).code).toBe(0);
  expect(existsSync(join(root, ".crew", "decisions.json"))).toBe(true);
  const save = () => run("criteria", id, "add", `one more ${Math.random()}`);
  return { root, env, run, paths, id, save };
}

/** The protected files a project has, as paths from its root, sorted, the policy left out. */
function protectedOf(root: string, id: string): string[] {
  const names = [
    ".crew/profile.json",
    ".crew/decisions.json",
    ...PROTECTED_WORK_FILES.map((name) => `.crew/work/${id}/${name}`),
  ];
  return names.filter((name) => existsSync(join(root, name))).sort();
}

const recordOf = (file: string): Record<string, string> =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;

test("AC-1: with an absent or an empty trust record, the adoption records every protected file the project has, sorted, and leaves the policy and an unreadable file out", () => {
  for (const state of ["absent", "empty"] as const) {
    const root = makeRepo();
    const paths = repoPaths(root, testEnv());
    write(root, ".crew/profile.json", '{"version":1}');
    write(root, ".crew/decisions.json", '{"version":1,"entries":[]}');
    write(root, ".crew/policy.json", '{"minimumRoute":"standard"}');
    write(root, ".crew/work/w1/work.json", '{"id":"w1"}');
    write(root, ".crew/work/w1/evidence.json", '{"verdict":"proven"}');
    write(root, ".crew/work/w1/report.md", "# report\n");
    write(root, ".crew/work/w1/knowledge.md", "# knowledge\n");
    // An item whose evidence cannot be read: a folder of that name.
    write(root, ".crew/work/w2/work.json", '{"id":"w2"}');
    mkdirSync(join(root, ".crew/work/w2/evidence.json"));
    // A folder with no work.json is no item.
    write(root, ".crew/work/notes/report.md", "not an item\n");
    if (state === "empty") {
      mkdirSync(dirname(paths.integrityFile), { recursive: true });
      writeFileSync(paths.integrityFile, "{}\n");
    }
    const recorded = store.adoptFirstUse(paths);
    const expected = [
      ".crew/decisions.json",
      ".crew/profile.json",
      ".crew/work/w1/evidence.json",
      ".crew/work/w1/knowledge.md",
      ".crew/work/w1/report.md",
      ".crew/work/w1/work.json",
      ".crew/work/w2/work.json",
    ];
    expect(recorded).toEqual(expected);
    expect(Object.keys(recordOf(paths.integrityFile)).sort()).toEqual(expected);
    // Recorded, each file reads as the engine's own.
    for (const name of expected.filter((n) => n.endsWith(".json")))
      expect(store.readProtectedJson(paths, join(root, name)).tampered).toBe(false);
    // A second call finds a record that holds hashes and does nothing.
    expect(store.adoptFirstUse(paths)).toEqual([]);
  }
});

test("AC-1: a project with no protected file gets no trust record from the adoption", () => {
  const root = makeRepo();
  const paths = repoPaths(root, testEnv());
  expect(store.adoptFirstUse(paths)).toEqual([]);
  expect(existsSync(paths.integrityFile)).toBe(false);
});

test("AC-1: after the trust record is lost, the first saving command says the files were recorded and the second is not refused", async () => {
  const { root, paths, id, save } = await project();
  const files = protectedOf(root, id);
  expect(files.length).toBeGreaterThanOrEqual(3);
  rmSync(paths.integrityFile);
  const first = await save();
  expect(first.code).toBe(0);
  const said = FIRST_USE.exec(first.err);
  expect(said?.[1]).toBe(String(files.length));
  expect(first.err).toContain(`(${join(paths.userDir, "integrity")})`);
  const second = await save();
  expect(second.err).not.toContain(TAMPERED);
  expect(second.code).toBe(0);
  expect(second.err).not.toMatch(FIRST_USE);
});

test("AC-1: a hook's context records the files and says nothing, and a saving command after it is not refused", async () => {
  const { root, env, paths, id, save } = await project();
  const files = protectedOf(root, id);
  rmSync(paths.integrityFile);
  hookContext({ session_id: "s1", cwd: root }, env);
  for (const name of files) expect(recordOf(paths.integrityFile)[name]).toBeDefined();
  const next = await save();
  expect(next.code).toBe(0);
  expect(next.err).not.toMatch(FIRST_USE);
  expect((await save()).code).toBe(0);
});

test("AC-1: a worktree with an empty record, a committed register and a policy to take from its main is not refused", async () => {
  const { root, env } = await project();
  git(root, "add", "-f", ".crew/profile.json", ".crew/decisions.json");
  git(root, "commit", "-q", "-m", "the crew's files");
  // The main's policy is not committed: the worktree lacks it and takes it from the main, which
  // writes a hash in the worktree's record. An adoption run after that would find it and do nothing.
  write(root, ".crew/policy.json", '{"minimumRoute":"fast"}');
  const main = cliIo(root, env);
  expect((await main("policy", "accept")).code).toBe(0);
  const worktree = join(tempDir("crew-wt-"), "lane");
  git(root, "worktree", "add", "-q", worktree, "-b", "lane");
  expect(existsSync(join(worktree, ".crew", "decisions.json"))).toBe(true);
  expect(existsSync(join(worktree, ".crew", "policy.json"))).toBe(false);
  const lane = cliIo(worktree, env);
  const started = await lane(
    "start",
    "in the lane",
    "--answers",
    ANSWERS,
    "--criterion",
    "it works",
  );
  expect(started.err).not.toContain(TAMPERED);
  expect(started.code).toBe(0);
  expect(existsSync(join(worktree, ".crew", "policy.json"))).toBe(true);
  const laneItem = openItems(repoPaths(worktree, env)).find((w) => w.title === "in the lane");
  const saved = await lane("criteria", laneItem?.id ?? "", "add", "one more");
  expect(saved.err).not.toContain(TAMPERED);
  expect(saved.code).toBe(0);
});

test("AC-1: a file changed after its hash was recorded is still refused with today's message", async () => {
  const { root, paths, save } = await project();
  rmSync(paths.integrityFile);
  expect((await save()).code).toBe(0);
  const profile = join(root, ".crew", "profile.json");
  writeFileSync(profile, `${readFileSync(profile, "utf8")}\n`);
  const refused = await save();
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(
    `${TAMPERED}.crew/profile.json; the user can accept it with crew accept profile`,
  );
});

test("AC-3: a trust record that holds a hash, one that does not parse and one that cannot be read are left as they are, and a file with no hash is still refused", async () => {
  // A record that holds one other file's hash.
  {
    const { paths, save } = await project();
    const whole = recordOf(paths.integrityFile);
    const kept = { ".crew/profile.json": whole[".crew/profile.json"] };
    const text = `${JSON.stringify(kept, null, 2)}\n`;
    writeFileSync(paths.integrityFile, text);
    expect(store.adoptFirstUse(paths)).toEqual([]);
    expect(readFileSync(paths.integrityFile, "utf8")).toBe(text);
    const refused = await save();
    expect(refused.code).toBe(1);
    expect(refused.err).toContain(`${TAMPERED}.crew/decisions.json`);
    expect(readFileSync(paths.integrityFile, "utf8")).toBe(text);
  }
  // A record that does not parse.
  {
    const { paths, save } = await project();
    writeFileSync(paths.integrityFile, "not json");
    expect(store.adoptFirstUse(paths)).toEqual([]);
    const refused = await save();
    expect(refused.code).toBe(1);
    expect(refused.err).toContain(TAMPERED);
    expect(readFileSync(paths.integrityFile, "utf8")).toBe("not json");
  }
  // A record that cannot be read: a folder in its place.
  {
    const { paths, save } = await project();
    rmSync(paths.integrityFile);
    mkdirSync(paths.integrityFile);
    expect(store.adoptFirstUse(paths)).toEqual([]);
    const refused = await save();
    expect(refused.code).toBe(1);
    expect(refused.err).toContain(TAMPERED);
    // Still the folder it was, with nothing put in it.
    expect(statSync(paths.integrityFile).isDirectory()).toBe(true);
    expect(readdirSync(paths.integrityFile)).toEqual([]);
  }
});
