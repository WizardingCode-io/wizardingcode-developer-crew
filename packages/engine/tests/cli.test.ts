import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { resolvePaths } from "../src/paths.ts";
import { readProtectedJson } from "../src/store.ts";
import { makeRepo, testEnv, write } from "./helpers.ts";

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
  const paths = resolvePaths(root, c.env);
  const file = join(root, ".crew", "policy.json");
  expect((await c.run("policy", "accept")).code).toBe(1);
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(file, '{"minimumRoute":"standard"}');
  expect((await c.run("detect", "--refresh")).code).toBe(0);
  expect(readProtectedJson(paths, file).tampered).toBe(false);
  writeFileSync(file, '{"minimumRoute":"fast"}');
  expect((await c.run("detect", "--refresh")).code).toBe(0);
  expect(readProtectedJson(paths, file).tampered).toBe(true);
  expect((await c.run("policy", "accept")).code).toBe(0);
  expect(readProtectedJson(paths, file).tampered).toBe(false);
  expect((await c.run("policy", "other")).code).toBe(1);
});
