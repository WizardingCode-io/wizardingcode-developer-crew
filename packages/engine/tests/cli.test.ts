import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { loadProfile } from "../src/profile.ts";
import { readProtectedJson } from "../src/store.ts";
import { makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

function io(cwd: string, env = testEnv(), stdin = "") {
  const out: string[] = [];
  const err: string[] = [];
  const cli: CliIo = {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    stdin: async () => stdin,
    env,
    cwd,
  };
  const run = async (...argv: string[]) => {
    out.length = 0;
    err.length = 0;
    const code = await main(argv, cli);
    return { code, out: out.join(""), err: err.join("") };
  };
  const json = async (...argv: string[]) => {
    const result = await run(...argv, "--json");
    return { code: result.code, data: JSON.parse(result.out) as Record<string, unknown> };
  };
  return { run, json, env };
}

const answers = JSON.stringify({
  work_type: "fix",
  is_vague: 0.1,
  scope: 0,
  touches_auth: 0,
  touches_payments: 0,
  touches_personal_data: 0,
  touches_data_migration: 0,
  touches_infra: 0,
  touches_public_api: 0,
});

test("a fast-route fix from start to a proven report", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "sh t.sh" } }),
    "t.sh": "exit 1\n",
    "src/a.ts": "x",
  });
  const c = io(root);
  expect((await c.run("--version")).out.trim()).toBe("0.1.0");
  const detect = await c.json("detect");
  expect(detect.code).toBe(0);
  expect((detect.data.profile as { targets: unknown[] }).targets).toHaveLength(1);

  const start = await c.json("start", "Cart total ignores the discount", "--answers", answers);
  const id = start.data.id as string;
  expect(start.data.route).toBe("fast");
  expect(existsSync(join(root, ".crew", "local", "decisions.jsonl"))).toBe(true);

  expect((await c.run("phase", id, "next")).code).toBe(1);
  expect((await c.run("criteria", id, "add", "The total subtracts the discount.")).code).toBe(0);
  expect((await c.json("phase", id, "next")).data.phase).toBe("build");

  expect((await c.run("tdd", "green", id, "AC-1")).code).toBe(1);
  expect((await c.run("tdd", "red", id, "AC-1")).code).toBe(0);
  write(root, "t.sh", "exit 0\n");
  write(root, "src/a.ts", "fixed");
  expect((await c.run("tdd", "green", id, "AC-1")).code).toBe(0);

  const gates = await c.json("gate", "run", id);
  expect(gates.code).toBe(0);
  expect(gates.data.verdict).toBe("proven");
  // The gate run is the fast route's delivery: the report is on disk without a further command.
  expect(readFileSync(join(root, ".crew", "work", id, "report.md"), "utf8")).toContain(
    "**Proven**",
  );
  // ...and the item is in the deliver phase without a further command.
  expect((await c.json("status")).data.phase).toBe("deliver");

  const report = await c.run("evidence", id);
  expect(report.code).toBe(0);
  expect(report.out).toContain("**Proven**");
  expect(readFileSync(join(root, ".crew", "work", id, "report.md"), "utf8")).toContain(
    "red then green",
  );
  const status = await c.json("status");
  expect(status.data.verdict).toBe("proven");
  expect(status.data.active).toBe(id);
  expect(status.data.title).toBe("Cart total ignores the discount");
  expect(status.data.phases).toEqual(["receive", "recognize", "build", "gate", "deliver"]);
  expect(status.data.criteria).toEqual([
    {
      id: "AC-1",
      kind: "behavior",
      text: "The total subtracts the discount.",
      tdd: "red then green",
    },
  ]);
  expect(
    (status.data.runs as { gate: string; status: string }[]).map((r) => `${r.gate}:${r.status}`),
  ).toEqual(["secrets:pass", "test:pass"]);
  expect(status.data.expected).toEqual(["secrets", "test"]);
  expect(status.data.skips).toEqual([]);
  expect(status.data.awaiting).toBeNull();
  expect(typeof status.data.baseCommit).toBe("string");
});

test("status without an active item is a short answer", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const status = await c.json("status");
  expect(status.code).toBe(0);
  expect(status.data.active).toBeNull();
  expect(status.data.criteria).toBeUndefined();
});

test("refusals: unknown work, skip without reason, invalid answers, pilot cannot skip secrets", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  expect((await c.run("phase", "nope", "next")).code).toBe(1);
  expect((await c.run("start", "x", "--answers", '{"work_type":"bug"}')).code).toBe(1);
  const start = await c.json("start", "Thing", "--answers", answers);
  const id = start.data.id as string;
  expect((await c.run("skip", id, "gate:lint")).code).toBe(1);
  expect((await c.run("skip", id, "gate:lint", "--reason", "legacy")).code).toBe(0);
  expect((await c.run("mode", "pilot")).code).toBe(0);
  const refused = await c.run("skip", id, "gate:secrets", "--reason", "no");
  expect(refused.code).toBe(1);
  expect(refused.err).toMatch(/pilot/i);
  expect((await c.run("config", "decisions.log", "false")).code).toBe(0);
  expect((await c.json("config", "decisions.log")).data.value).toBe(false);
});

test("profile set and confirm: proposed commands stay unconfirmed until confirmed", async () => {
  const root = makeRepo({ Makefile: "test:\n\ttrue\n", "src/a.c": "x" });
  const c = io(root);
  const detect = await c.json("detect");
  expect(detect.data.missing).toEqual([{ target: ".", gate: "test" }]);
  expect((await c.run("profile", "set", "test", "make test")).code).toBe(0);
  const start = await c.json("start", "fix", "--answers", answers);
  const id = start.data.id as string;
  await c.run("criteria", id, "add", "x");
  await c.run("skip", id, "tdd:AC-1", "--reason", "manual");
  write(root, "src/a.c", "y");
  const first = await c.json("gate", "run", id);
  expect(first.data.unproven).toEqual([
    "gate test ran an unconfirmed command (crew profile confirm)",
  ]);
  expect((await c.run("profile", "confirm")).code).toBe(0);
  const second = await c.json("gate", "run", id);
  expect(second.data.verdict).toBe("proven");
});

test("C1: gate run --only refuses an unknown gate name", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  const refused = await c.run("gate", "run", id, "--only", "secrets,bogus");
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe("unknown gate: bogus");
});

test("C3: crew is inactive in a plain folder until crew detect activates it", async () => {
  const dir = tempDir();
  write(dir, "src/a.py", "a = 1\n");
  const c = io(dir);
  const inactive =
    "crew is inactive here: not a git repository and no .crew/ folder; run crew detect in the project root to activate it";
  const status = await c.run("status");
  expect(status.code).toBe(1);
  expect(status.err.trim()).toBe(inactive);
  expect((await c.run("start", "x", "--answers", answers)).err.trim()).toBe(inactive);
  expect(existsSync(join(dir, ".crew"))).toBe(false);
  expect((await c.run("mode")).code).toBe(0);
  expect((await c.run("config")).code).toBe(0);
  expect((await c.run("help")).code).toBe(0);
  expect(existsSync(join(dir, ".crew"))).toBe(false);
  expect((await c.run("detect")).code).toBe(0);
  expect(existsSync(join(dir, ".crew", "profile.json"))).toBe(true);
  expect((await c.json("status")).data.active).toBeNull();
});

test("C2: a hand-edited work item blocks every saving command until the user accepts it", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  const file = join(root, ".crew", "work", id, "work.json");
  const work = JSON.parse(readFileSync(file, "utf8"));
  work.skips.push({ step: "gate:test", reason: "agent", at: "t" });
  writeFileSync(file, JSON.stringify(work));
  const message = `state changed outside the engine: .crew/work/${id}/work.json; the user can accept it with crew accept ${id}`;
  const refused = await c.run("criteria", id, "add", "x");
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(message);
  for (const argv of [
    ["gate", "run", id],
    ["await", id, "user"],
    ["skip", id, "gate:lint", "--reason", "x"],
    ["phase", id, "next"],
  ]) {
    expect((await c.run(...argv)).err.trim()).toBe(message);
  }
  const status = await c.json("status");
  expect(status.code).toBe(0);
  expect(status.data.unproven).toContain("state changed outside the engine");
  const rendered = await c.run("evidence", id);
  expect(rendered.code).toBe(1);
  expect(rendered.err).toStartWith(message);
  expect(rendered.err).toContain("# Report: Thing");
  expect(existsSync(join(root, ".crew", "work", id, "report.md"))).toBe(false);
  expect((await c.run("accept", id)).code).toBe(0);
  expect((await c.run("criteria", id, "add", "x")).code).toBe(0);
  expect((await c.run("accept", "nope")).code).toBe(1);
});

test("C2: a corrupt integrity file is reported, and accept re-records profile and policy", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  writeFileSync(paths.integrityFile, "garbage");
  const status = await c.json("status");
  expect(status.data.unproven).toContain("state changed outside the engine");
  const refused = await c.run("profile", "set", "lint", "make lint");
  expect(refused.err.trim()).toBe(
    "state changed outside the engine: .crew/profile.json; the user can accept it with crew accept profile",
  );
  expect((await c.run("accept", "profile")).code).toBe(0);
  expect((await c.run("profile", "set", "lint", "make lint")).code).toBe(0);
  expect((await c.run("criteria", id, "add", "x")).code).toBe(1);
  expect((await c.run("accept", id)).code).toBe(0);
  expect((await c.run("criteria", id, "add", "x")).code).toBe(0);
  expect((await c.run("accept", "policy")).code).toBe(1);
});

test("I5: profile set keeps detected commands unless forced; confirm names what it confirms", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0", lint: "exit 0" } }),
  });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  const gates = () => loadProfile(paths).profile?.targets[0]?.gates;
  const refused = await c.run("profile", "set", "test", "true");
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(
    'test for . already has a detected command (npm run test); replacing it needs the user: crew profile set test "<cmd>" --force',
  );
  expect(gates()?.test).toEqual({ command: "npm run test", source: "detected" });
  expect((await c.run("profile", "set", "test", "true", "--force")).code).toBe(0);
  expect(gates()?.test).toEqual({ command: "true", source: "proposed" });
  expect((await c.run("profile", "set", "build", "make")).code).toBe(0);
  const one = await c.json("profile", "confirm", "test");
  expect(one.data.message).toBe("confirmed 1 command(s)\n  test: true");
  expect(gates()?.build?.source).toBe("proposed");
  expect((await c.run("profile", "confirm")).out).toContain("  build: make");
  expect(gates()?.build?.source).toBe("confirmed");
  expect((await c.run("profile", "set", "build", "x")).code).toBe(1);
  expect((await c.run("profile", "confirm", "bogus")).code).toBe(1);
});

test("I6: skip steps are normalised, and anything else is refused", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  await c.run("criteria", id, "add", "x");
  const step = async (raw: string) => {
    const result = await c.json("skip", id, raw, "--reason", "r");
    return result.code === 0
      ? (result.data.skips as { step: string }[]).at(-1)?.step
      : (result.data.message as string);
  };
  expect(await step("lint")).toBe("gate:lint");
  expect(await step("AC-1")).toBe("tdd:AC-1");
  expect(await step("gate:deps")).toBe("gate:deps");
  expect(await step("tdd:AC-1")).toBe("tdd:AC-1");
  expect(await step("specify")).toBe("specify");
  expect(await step("tdd:AC-9")).toBe("unknown step: tdd:AC-9");
  expect(await step("gate:bogus")).toBe("unknown step: gate:bogus");
  expect(await step("the tests")).toBe("unknown step: the tests");
});

test("I10: start needs the typed answers, and a question creates no work item", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const bare = await c.run("start", "Fix the cart");
  expect(bare.code).toBe(1);
  expect(bare.err.trim()).toBe(
    "answers are required: answer the nine typed questions from the crew skill (references/receive.md) and pass them with --answers",
  );
  const question = JSON.stringify({ ...JSON.parse(answers), work_type: "question" });
  const asked = await c.run("start", "What does add do?", "--answers", question);
  expect(asked.code).toBe(0);
  expect(asked.out.trim()).toBe("question: answer the user; no work item is created");
  expect(existsSync(join(root, ".crew", "work"))).toBe(false);
  expect((await c.json("status")).data.active).toBeNull();
});

test("starting a new item while another is active and unproven warns which one it replaces", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const first = (await c.json("start", "First", "--answers", answers)).data.id as string;
  const second = await c.run("start", "Second", "--answers", answers);
  expect(second.code).toBe(0);
  expect(second.out.split("\n")[0]).toBe(
    `warning: ${first} is not proven and is no longer the active work item`,
  );
});

test("hook: malformed or empty stdin answers {} and exits 0", async () => {
  const root = makeRepo();
  expect(await io(root, testEnv(), "").run("hook", "stop")).toMatchObject({ code: 0, out: "{}\n" });
  expect(await io(root, testEnv(), "{not json").run("hook", "stop")).toMatchObject({
    code: 0,
    out: "{}\n",
  });
  const ok = await io(root, testEnv(), JSON.stringify({ session_id: "s", cwd: root })).run(
    "hook",
    "session-start",
  );
  expect(ok.code).toBe(0);
  expect(JSON.parse(ok.out)).toHaveProperty("hookSpecificOutput");
});

test("detect --refresh never re-blesses a tampered policy; policy accept does", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  const file = join(root, ".crew", "policy.json");
  expect((await c.run("policy", "accept")).code).toBe(1);
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(file, '{"minimumRoute":"standard"}');
  expect((await c.run("detect", "--refresh")).code).toBe(0);
  expect(readProtectedJson(paths, file).tampered).toBe(false);
  writeFileSync(file, '{"minimumRoute":"fast"}');
  const refused = await c.run("detect", "--refresh");
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(
    "state changed outside the engine: .crew/policy.json; the user can accept it with crew accept policy",
  );
  expect(readProtectedJson(paths, file).tampered).toBe(true);
  expect((await c.run("detect")).code).toBe(0);
  expect((await c.run("policy", "accept")).code).toBe(0);
  expect(readProtectedJson(paths, file).tampered).toBe(false);
  expect((await c.run("policy", "other")).code).toBe(1);
});

test("the command comes first, so user-only verbs cannot hide behind a leading flag", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  const file = join(root, ".crew", "work", id, "work.json");
  const work = JSON.parse(readFileSync(file, "utf8"));
  work.skips.push({ step: "gate:test", reason: "agent", at: "t" });
  writeFileSync(file, JSON.stringify(work));
  const integrity = repoPaths(root, c.env).integrityFile;
  const before = readFileSync(integrity, "utf8");
  const message = "the command comes first: crew <command> [arguments] [--flags]";

  const lines = [
    ["--json", "accept", id],
    ["--json", "skip", id, "gate:lint", "--reason", "x"],
    ["--reason", "x", "--json", "skip", id, "gate:lint"],
    ["--json", "approve", id, "spec"],
    ["profile", "--force", "--json", "set", "test", "true"],
  ];
  for (const argv of lines) {
    const result = await c.run(...argv);
    expect(result.code).toBe(1);
    expect((JSON.parse(result.out) as { message: string }).message).toBe(message);
  }
  expect(readFileSync(integrity, "utf8")).toBe(before);
  expect(JSON.parse(readFileSync(file, "utf8")).skips).toEqual(work.skips);

  const plain = await c.run("--reason", "x", "skip", id, "gate:lint");
  expect(plain.code).toBe(1);
  expect(plain.err.trim()).toBe(message);
  expect((await c.run("status", "--json")).code).toBe(0);
});

test("start takes --criterion, repeatable, and warns about uncommitted changes it will measure", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  write(root, "src/a.ts", "left over from earlier work");
  const start = await c.json(
    "start",
    "Second thing",
    "--answers",
    answers,
    "--criterion",
    "a happens",
    "--criterion",
    "b stays",
  );
  expect(start.code).toBe(0);
  expect(start.data.criteria).toEqual([
    { id: "AC-1", kind: "behavior", text: "a happens" },
    { id: "AC-2", kind: "behavior", text: "b stays" },
  ]);
  expect(start.data.inherited).toEqual(["src/a.ts"]);
  // A fast-route item with its criteria has nothing left before build.
  expect(start.data.phase).toBe("build");
  const status = await c.json("status");
  expect((status.data.criteria as { id: string }[]).map((cr) => cr.id)).toEqual(["AC-1", "AC-2"]);
  const text = await c.run("start", "Third thing", "--answers", answers, "--criterion", "c");
  expect(text.code).toBe(0);
  expect(text.out).toContain(
    "warning: uncommitted changes in src/a.ts count as this item's change; commit them first if they are not",
  );
  expect(text.out).toContain("  AC-1 (behavior): c");
});
