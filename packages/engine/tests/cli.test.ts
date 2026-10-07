import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
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
  expect((await c.json("phase", id, "next")).data.phase).toBe("gate");

  const gates = await c.json("gate", "run", id);
  expect(gates.code).toBe(0);
  expect(gates.data.verdict).toBe("proven");
  expect((await c.json("phase", id, "next")).data.phase).toBe("deliver");

  const report = await c.run("evidence", id);
  expect(report.code).toBe(0);
  expect(report.out).toContain("**Proven**");
  expect(readFileSync(join(root, ".crew", "work", id, "report.md"), "utf8")).toContain(
    "red then green",
  );
  const status = await c.json("status");
  expect(status.data.verdict).toBe("proven");
});

test("refusals: unknown work, skip without reason, invalid answers, pilot cannot skip secrets", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const c = io(root);
  expect((await c.run("phase", "nope", "next")).code).toBe(1);
  expect((await c.run("start", "x", "--answers", '{"work_type":"bug"}')).code).toBe(1);
  const start = await c.json("start", "Thing");
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
  const start = await c.json("start", "fix");
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
