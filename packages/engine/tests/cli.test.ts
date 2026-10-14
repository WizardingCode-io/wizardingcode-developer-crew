import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { loadProfile } from "../src/profile.ts";
import { readProtectedJson, writeProtectedJson } from "../src/store.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

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
  expect((await c.run("--version")).out.trim()).toBe("0.1.7");
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

test("finding 8: profile set names the target by stack when two share a path", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "composer.json": JSON.stringify({ scripts: { test: "exit 0" } }),
  });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  const detect = await c.json("detect");
  expect(
    (detect.data.profile as { targets: { stack: string }[] }).targets.map((t) => t.stack),
  ).toEqual(["node", "php"]);
  const refused = await c.run("profile", "set", "lint", "pint");
  expect(refused.code).toBe(1);
  expect(refused.err.trim()).toBe(
    "two targets at . (node, php): say which one with --stack <node|php>",
  );
  expect((await c.run("profile", "set", "lint", "pint", "--stack", "php")).code).toBe(0);
  const targets = loadProfile(paths).profile?.targets ?? [];
  expect(targets.find((t) => t.stack === "php")?.gates.lint).toEqual({
    command: "pint",
    source: "proposed",
  });
  expect(targets.find((t) => t.stack === "node")?.gates.lint).toBeUndefined();
  expect((await c.run("profile", "set", "lint", "x", "--stack", "ruby")).code).toBe(1);
  // A path with one target needs no flag; a new path gets a target of its own.
  expect((await c.run("profile", "set", "test", "make test", "--target", "tools")).code).toBe(0);
  expect(loadProfile(paths).profile?.targets.find((t) => t.path === "tools")?.stack).toBe("other");
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

test("approve and skip record who decided: the user, or the agent in an unattended mode", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  const file = join(root, ".crew", "work", id, "work.json");
  const read = () => JSON.parse(readFileSync(file, "utf8"));

  expect((await c.json("approve", id, "spec")).code).toBe(0);
  expect(read().approvals).toEqual([{ what: "spec", at: expect.any(String), by: "user" }]);
  const agent = await c.json("approve", id, "spec", "--mode", "auto");
  expect(agent.code).toBe(0);
  expect(agent.data.message).toContain("by the agent in auto mode");
  expect(read().approvals[1]).toEqual({
    what: "spec",
    at: expect.any(String),
    by: "agent",
    mode: "auto",
  });

  expect(
    (await c.json("skip", id, "gate:lint", "--reason", "x", "--mode", "bypassPermissions")).code,
  ).toBe(0);
  expect(read().skips).toEqual([
    {
      step: "gate:lint",
      reason: "x",
      at: expect.any(String),
      by: "agent",
      mode: "bypassPermissions",
    },
  ]);
  expect((await c.json("skip", id, "gate:test", "--reason", "y")).code).toBe(0);
  expect(read().skips[1]).toMatchObject({ step: "gate:test", by: "user" });

  // A headless session is unattended in any mode, so the flag may name any of the six (0.1.6).
  const headless = await c.json("approve", id, "spec", "--mode", "default");
  expect(headless.code).toBe(0);
  expect(read().approvals[2]).toMatchObject({ by: "agent", mode: "default" });
  const bad = await c.json("approve", id, "spec", "--mode", "yes");
  expect(bad.code).toBe(1);
  expect(bad.data.message).toContain(
    "default, acceptEdits, plan, auto, bypassPermissions or dontAsk",
  );
  expect((await c.json("skip", id, "gate:typecheck", "--reason", "z", "--mode", "yes")).code).toBe(
    1,
  );
  expect((await c.json("approve", id, "spec", "--mode")).code).toBe(1);
  expect(read().approvals).toHaveLength(3);
  expect(read().skips).toHaveLength(2);
});

test("gate run exits 1 while the work is not proven and 0 once it is (finding 18)", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "sh t.sh" } }),
    "t.sh": "exit 1\n",
    "src/a.ts": "x",
  });
  const c = io(root);
  const id = (await c.json("start", "Thing", "--answers", answers)).data.id as string;
  await c.run("criteria", id, "add", "x");
  await c.run("skip", id, "tdd:AC-1", "--reason", "manual");
  const failing = await c.json("gate", "run", id);
  expect(failing.code).toBe(1);
  expect(failing.data.verdict).toBe("unproven");
  expect(failing.data.unproven).toContain("gate test failing");
  expect((await c.run("gate", "run", id)).out).toContain("Not proven: ");
  write(root, "t.sh", "exit 0\n");
  const proven = await c.json("gate", "run", id);
  expect(proven.code).toBe(0);
  expect(proven.data.verdict).toBe("proven");
});

test("criteria remove takes out a criterion with no record and keeps the removal in the record", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const start = await c.json(
    "start",
    "Two criteria",
    "--answers",
    answers,
    "--criterion",
    "a",
    "--criterion",
    "b",
  );
  const id = start.data.id as string;
  const removed = await c.json("criteria", id, "remove", "AC-1");
  expect(removed.code).toBe(0);
  expect(removed.data.removed).toMatchObject({ id: "AC-1", kind: "behavior", text: "a" });
  expect(typeof (removed.data.removed as { at: unknown }).at).toBe("string");
  const status = await c.json("status");
  expect((status.data.criteria as { id: string }[]).map((cr) => cr.id)).toEqual(["AC-2"]);
  const work = JSON.parse(readFileSync(join(root, ".crew", "work", id, "work.json"), "utf8"));
  expect(work.removedCriteria.map((r: { id: string }) => r.id)).toEqual(["AC-1"]);
  expect((await c.run("evidence", id)).code).toBe(0);
  const report = readFileSync(join(root, ".crew", "work", id, "report.md"), "utf8");
  expect(report).toContain("## Decisions");
  expect(report).toContain("- AC-1 (behavior) removed");
  expect(report).toContain(": a");
});

test("criteria remove refuses a criterion with a test-first record, one with a skip, and an unknown id", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "sh t.sh" } }),
    "t.sh": "exit 1\n",
    "src/a.ts": "x",
  });
  const c = io(root);
  const start = await c.json(
    "start",
    "Three criteria",
    "--answers",
    answers,
    "--criterion",
    "a",
    "--criterion",
    "b",
    "--criterion",
    "c",
  );
  const id = start.data.id as string;
  expect((await c.run("tdd", "red", id, "AC-1")).code).toBe(0);
  expect((await c.run("skip", id, "AC-2", "--reason", "manual check")).code).toBe(0);
  const file = join(root, ".crew", "work", id, "work.json");
  const before = readFileSync(file, "utf8");
  const recorded = await c.run("criteria", id, "remove", "AC-1");
  expect(recorded.code).toBe(1);
  expect(recorded.err).toContain("AC-1 has a test-first record");
  const skipped = await c.run("criteria", id, "remove", "AC-2");
  expect(skipped.code).toBe(1);
  expect(skipped.err).toContain("AC-2 has a skip");
  const unknown = await c.run("criteria", id, "remove", "AC-9");
  expect(unknown.code).toBe(1);
  expect(unknown.err).toContain("unknown criterion: AC-9");
  expect(readFileSync(file, "utf8")).toBe(before);
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

test("a new item after a proven, uncommitted one starts with no change of its own", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const first = (await c.json("start", "First", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/a.ts", "the first item's work");
  expect((await c.run("tdd", "red", first, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", first, "AC-1", "--", "exit 0")).code).toBe(0);
  expect((await c.json("gate", "run", first)).data.verdict).toBe("proven");
  const second = await c.json("start", "Second", "--answers", answers, "--criterion", "b");
  const secondId = second.data.id as string;
  expect(second.data.replaced).toBeNull();
  expect(second.data.inherited).toEqual([]);
  expect(second.data.proven).toEqual({ of: first, paths: ["src/a.ts"] });
  // With no change of its own, only the second item's own proof stands between it and proven.
  const gates = await c.json("gate", "run", secondId);
  expect(gates.data.unproven).toEqual(["test-first record missing for AC-1"]);
  write(root, "src/a.ts", "the second item touches it too");
  expect((await c.json("status")).data.unproven).toContain("code changed since the last gate run");
});

test("start takes --preserve beside --criterion, numbered in command-line order (finding 7)", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const start = await c.json(
    "start",
    "Mixed criteria",
    "--answers",
    answers,
    "--criterion",
    "a",
    "--preserve",
    "b",
    "--criterion",
    "c",
  );
  expect(start.code).toBe(0);
  expect(start.data.phase).toBe("build");
  expect(start.data.criteria).toEqual([
    { id: "AC-1", kind: "behavior", text: "a" },
    { id: "AC-2", kind: "preserve", text: "b" },
    { id: "AC-3", kind: "behavior", text: "c" },
  ]);
  const only = await c.run(
    "start",
    "Only preserve",
    "--answers",
    answers,
    "--preserve",
    "the existing tests keep passing",
  );
  expect(only.code).toBe(0);
  expect(only.out).toContain("  AC-1 (preserve): the existing tests keep passing");
});

test("start refuses --kind, points to --preserve, and creates nothing (finding 7)", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const refused = await c.run(
    "start",
    "Nope",
    "--answers",
    answers,
    "--criterion",
    "a",
    "--kind",
    "preserve",
  );
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("unknown flag --kind");
  expect(refused.err).toContain("--preserve");
  expect((await c.json("status")).data.active).toBeNull();
  const workDir = join(root, ".crew", "work");
  expect(existsSync(workDir) ? readdirSync(workDir) : []).toEqual([]);
});

test("every command but hook refuses a flag it does not know and keeps its known ones", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const id = (await c.json("start", "Flags", "--answers", answers, "--criterion", "a")).data
    .id as string;
  const gate = await c.run("gate", "run", id, "--olny", "test");
  expect(gate.code).toBe(1);
  expect(gate.err.trim()).toBe("unknown flag --olny for gate (it takes --only, --json)");
  const status = await c.run("status", "--verbose");
  expect(status.code).toBe(1);
  expect(status.err.trim()).toBe("unknown flag --verbose for status (it takes --json)");
  expect((await c.run("detect", "--fresh")).code).toBe(1);
  // Known flags, including the global --json and --version, keep working.
  expect((await c.run("detect", "--refresh")).code).toBe(0);
  expect((await c.json("status")).data.active).toBe(id);
  expect((await c.run("--version")).code).toBe(0);
  // The hook reads its payload from stdin and is called by Claude Code, not by the agent.
  expect((await c.run("hook", "SessionStart", "--anything")).code).toBe(0);
});

test("start records a shared checkout when another item is open with uncommitted changes (finding 9)", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    "src/b.ts": "y",
  });
  const c = io(root);
  const first = (await c.json("start", "Lane A", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/a.ts", "lane A, half-written");
  const second = await c.run("start", "Lane B", "--answers", answers, "--criterion", "b");
  expect(second.code).toBe(0);
  expect(second.out).toContain(
    `warning: this checkout is shared with ${first}, which is open with uncommitted changes in src/a.ts; a second session on one checkout blocks turn ends and proves half-written code: work in a worktree (git worktree add ../<name> -b <branch>)`,
  );
  const status = await c.json("status");
  const secondId = status.data.active as string;
  const record = readProtectedJson<{
    sharedCheckout?: { with: string[]; paths: string[]; at: string };
  }>(repoPaths(root, c.env), join(root, ".crew", "work", secondId, "work.json")).data;
  expect(record?.sharedCheckout?.with).toEqual([first]);
  expect(record?.sharedCheckout?.paths).toEqual(["src/a.ts"]);
  expect(typeof record?.sharedCheckout?.at).toBe("string");
  // A third lane names both open items.
  write(root, "src/b.ts", "lane B, half-written");
  const third = await c.json("start", "Lane C", "--answers", answers, "--criterion", "c");
  expect((third.data.shared as { with: string[] }).with).toEqual([first, secondId]);
  expect((third.data.shared as { paths: string[] }).paths).toEqual(["src/a.ts", "src/b.ts"]);
});

test("start records no shared checkout without a neighbour or without a change (finding 9)", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  // Alone in the checkout, with an uncommitted change: measured as this item's, not shared.
  write(root, "src/a.ts", "mine");
  const alone = await c.json("start", "Alone", "--answers", answers, "--criterion", "a");
  expect(alone.data.shared).toBeNull();
  const aloneId = alone.data.id as string;
  expect(alone.data.inherited).toEqual(["src/a.ts"]);
  // A neighbour that is open, but a clean tree: nothing to share.
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "alone's work, committed");
  const clean = await c.json("start", "Clean", "--answers", answers, "--criterion", "b");
  expect(clean.data.shared).toBeNull();
  const cleanId = clean.data.id as string;
  // A proven, delivered neighbour with its work still uncommitted is not open; an open one is.
  write(root, "src/a.ts", "clean's work");
  expect((await c.run("tdd", "red", cleanId, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", cleanId, "AC-1", "--", "exit 0")).code).toBe(0);
  expect((await c.json("gate", "run", cleanId)).data.verdict).toBe("proven");
  const after = await c.json("start", "After", "--answers", answers, "--criterion", "c");
  expect((after.data.shared as { with: string[] }).with).toEqual([aloneId]);
  expect((after.data.shared as { paths: string[] }).paths).toEqual(["src/a.ts"]);
});

test("a proven item is not an open neighbour, whatever its phase; an unproven one in gate is", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const paths = repoPaths(root, c.env);
  // Proven, then put back in its gate phase as items proven before 0.1.7 were left.
  const proven = (await c.json("start", "Proven", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/a.ts", "proven's work");
  expect((await c.run("tdd", "red", proven, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", proven, "AC-1", "--", "exit 0")).code).toBe(0);
  expect((await c.json("gate", "run", proven)).data.verdict).toBe("proven");
  const file = join(root, ".crew", "work", proven, "work.json");
  const record = readProtectedJson<{ phase: string }>(paths, file).data;
  writeProtectedJson(paths, file, { ...record, phase: "gate" });
  // Unproven and in gate: a gate run that proved nothing leaves it there, still being worked on.
  const open = (await c.json("start", "Open", "--answers", answers, "--criterion", "b")).data
    .id as string;
  expect((await c.run("tdd", "red", open, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", open, "AC-1", "--", "exit 0")).code).toBe(0);
  expect((await c.json("gate", "run", open, "--only", "test")).data.verdict).toBe("unproven");
  expect((await c.json("status")).data.phase).toBe("gate");
  write(root, "src/a.ts", "open's half-written work");
  const next = await c.json("start", "Next", "--answers", answers, "--criterion", "c");
  expect((next.data.shared as { with: string[] }).with).toEqual([open]);
});

test("a gate run that proves an item already in the gate phase delivers it", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const id = (await c.json("start", "Twice", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/a.ts", "y");
  expect((await c.run("tdd", "red", id, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", id, "AC-1", "--", "exit 0")).code).toBe(0);
  // A partial run proves nothing and moves the item from build to gate.
  const partial = await c.json("gate", "run", id, "--only", "secrets");
  expect(partial.data.verdict).toBe("unproven");
  expect((await c.json("status")).data.phase).toBe("gate");
  // A second partial run leaves it there; the proving run delivers it.
  expect((await c.json("gate", "run", id, "--only", "secrets")).data.verdict).toBe("unproven");
  expect((await c.json("status")).data.phase).toBe("gate");
  expect((await c.json("gate", "run", id)).data.verdict).toBe("proven");
  expect((await c.json("status")).data.phase).toBe("deliver");
});

test("SP2a: an item in specify moves to conclave, and plan asks for conclave.md by name", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const standard = JSON.stringify({ ...JSON.parse(answers), scope: 1 });
  const id = (await c.json("start", "Templates open empty", "--answers", standard)).data
    .id as string;
  expect((await c.json("phase", id, "next")).data.phase).toBe("understand");
  expect((await c.json("phase", id, "next")).data.phase).toBe("specify");
  expect((await c.json("phase", id, "next")).data.phase).toBe("conclave");
  const refused = await c.run("phase", id, "next");
  expect(refused.code).toBe(1);
  expect(refused.err).toContain("conclave.md in the work folder (the gap round: four sections)");
  write(
    root,
    `.crew/work/${id}/conclave.md`,
    "# Gap round\n\n## Assumed by good practice\nnone\n\n## Decisions only the user can make\nnone\n\n## Proposals\nnone\n\n## Warnings\nnone\n",
  );
  expect((await c.json("phase", id, "next")).data.phase).toBe("plan");
});

test("SP2a: decision add and decide, as the user and as the validator", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const standard = JSON.stringify({ ...JSON.parse(answers), scope: 1 });
  const id = (await c.json("start", "Keys in the profile", "--answers", standard)).data
    .id as string;
  const added = await c.json(
    "decision",
    id,
    "add",
    "Who gets the create permission by default?",
    "--default",
    "admins only",
  );
  expect(added.code).toBe(0);
  expect(added.data.decision).toMatchObject({ id: "D-1", default: "admins only" });
  expect((await c.run("decide", id, "D-1", "--validator", "stated-default")).err).toContain(
    "the validator acts only where no person is watching: add --mode <mode>",
  );
  const byValidator = await c.json(
    "decide",
    id,
    "D-1",
    "--mode",
    "dontAsk",
    "--validator",
    "stated-default",
  );
  expect(byValidator.data.decision).toMatchObject({
    answer: "admins only",
    by: "validator",
    rule: "stated-default",
  });
  const byUser = await c.json("decide", id, "D-1", "everyone with a team");
  expect(byUser.data.decision).toMatchObject({ answer: "everyone with a team", by: "user" });
  expect((await c.run("decide", id, "D-1", "--mode", "auto", "--validator", "judge")).code).toBe(1);
});
