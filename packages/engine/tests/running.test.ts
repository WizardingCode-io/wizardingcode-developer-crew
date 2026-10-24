import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { onStop } from "../src/hooks/stop.ts";
import { processStart } from "../src/open.ts";
import { runningFile, withRunning } from "../src/running.ts";
import { loadState } from "../src/state.ts";
import { addCriterion, createWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

function io(cwd: string, env: NodeJS.ProcessEnv) {
  const out: string[] = [];
  const err: string[] = [];
  const cli: CliIo = {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    stdin: async () => "",
    env,
    cwd,
  };
  return async (...argv: string[]) => {
    out.length = 0;
    err.length = 0;
    const code = await main(argv, cli);
    return { code, out: out.join(""), err: err.join("") };
  };
}

test("AC-14 (finding 146): withRunning writes the marker for the run's length and removes it when the run ends or throws; with no session it writes none", async () => {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const paths = repoPaths(root, testEnv());
  const work = createWork(paths, "fix");
  const file = runningFile(paths, work.id);
  const seen = await withRunning(paths, work.id, "s1", "crew gate run x", async () =>
    JSON.parse(readFileSync(file, "utf8")),
  );
  expect(seen).toMatchObject({
    command: "crew gate run x",
    pid: process.pid,
    processStart: processStart(process.pid),
    session: "s1",
  });
  expect(typeof seen.startedAt).toBe("string");
  expect(existsSync(file)).toBe(false);
  await expect(
    withRunning(paths, work.id, "s1", "crew tdd red x AC-1", async () => {
      expect(existsSync(file)).toBe(true);
      throw new Error("the run broke");
    }),
  ).rejects.toThrow("the run broke");
  expect(existsSync(file)).toBe(false);
  expect(
    await withRunning(paths, work.id, null, "crew gate run x", async () => existsSync(file)),
  ).toBe(false);
});

test("AC-14 (finding 146): crew gate run and crew tdd write the marker while their command runs, with the session from CLAUDE_CODE_SESSION_ID, and remove it after", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "sh t.sh" } }),
    "t.sh": "exit 0\n",
    "src/a.ts": "x",
  });
  const env = { ...testEnv(), CLAUDE_CODE_SESSION_ID: "sess-9" };
  const run = io(root, env);
  await run("detect");
  const started = await run(
    "start",
    "A change",
    "--answers",
    JSON.stringify({
      work_type: "chore",
      is_vague: 0.1,
      scope: 0,
      touches_auth: 0,
      touches_payments: 0,
      touches_personal_data: 0,
      touches_data_migration: 0,
      touches_infra: 0,
      touches_public_api: 0,
    }),
    "--criterion",
    "a says A",
  );
  const id = /started (\S+)/.exec(started.out)?.[1] as string;
  // The CLI runs in this process, so the marker is named by this process's pid (finding 146).
  const marker = `.crew/work/${id}/running/${process.pid}.json`;
  // The test command copies the marker it finds while it runs.
  write(root, "t.sh", `cp ${marker} seen-gate.json 2>/dev/null; exit 0\n`);
  await run("gate", "run", id);
  expect(JSON.parse(readFileSync(join(root, "seen-gate.json"), "utf8"))).toMatchObject({
    command: `crew gate run ${id}`,
    session: "sess-9",
  });
  expect(existsSync(join(root, marker))).toBe(false);
  await run("tdd", "red", id, "AC-1", "--", `cp ${marker} seen-tdd.json; exit 1`);
  expect(JSON.parse(readFileSync(join(root, "seen-tdd.json"), "utf8"))).toMatchObject({
    command: `crew tdd red ${id} AC-1`,
    session: "sess-9",
  });
  expect(existsSync(join(root, marker))).toBe(false);
}, 60_000);

function stopSession() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const ctx = hookContext({ session_id: "s", cwd: root }, env);
  onSessionStart(ctx);
  const work = createWork(ctx.paths, "fix");
  addCriterion(work, "x");
  saveWork(ctx.paths, work);
  write(root, "src/a.ts", "changed");
  const file = runningFile(ctx.paths, work.id);
  // A marker under running/, named by its pid unless `name` says otherwise (a misnamed one)
  const mark = (fields: Record<string, unknown>, name?: string) =>
    write(
      root,
      `.crew/work/${work.id}/running/${name ?? String(fields.pid ?? process.pid)}.json`,
      JSON.stringify({
        command: `crew gate run ${work.id}`,
        pid: process.pid,
        processStart: processStart(process.pid),
        session: "s",
        startedAt: "2026-10-23T22:00:00.000Z",
        ...fields,
      }),
    );
  return { root, ctx, work, file, mark };
}

test("AC-14 (finding 146): the Stop hook lets the turn end once for this session's live run, naming it, and never changes the item", () => {
  const { root, ctx, work, mark } = stopSession();
  const evidence = join(root, ".crew", "work", work.id, "evidence.json");
  const before = existsSync(evidence) ? readFileSync(evidence, "utf8") : null;
  const workBefore = readFileSync(join(root, ".crew", "work", work.id, "work.json"), "utf8");
  mark({});
  const first = onStop(ctx);
  expect(first.decision).toBeUndefined();
  expect(String(first.systemMessage)).toContain(
    `Crew: crew gate run ${work.id} is still running (started 2026-10-23T22:00:00.000Z); the turn ends while it runs, and the next one is held to the Stop rule again.`,
  );
  expect(loadState(ctx.paths).sessions.s?.runPermits).toEqual(["2026-10-23T22:00:00.000Z"]);
  // The same run again: the permit is spent.
  expect(onStop(ctx).decision).toBe("block");
  // A new run of the same session permits once more.
  mark({ startedAt: "2026-10-23T22:05:00.000Z" });
  expect(onStop(ctx).decision).toBeUndefined();
  // The item is as it was: no record, no wait, no verdict.
  expect(existsSync(evidence) ? readFileSync(evidence, "utf8") : null).toBe(before);
  expect(readFileSync(join(root, ".crew", "work", work.id, "work.json"), "utf8")).toBe(workBefore);
});

test("AC-14 (finding 146): another session's marker, a malformed one, a dead pid and a reused pid give no permit; the dead and the malformed are removed", () => {
  const { ctx, work, file, mark } = stopSession();
  // Each Stop a new turn's, so the cap of blocks in a row never releases one.
  const stop = () => onStop(ctx, { stop_hook_active: false });
  mark({ session: "other" });
  expect(stop().decision).toBe("block");
  expect(existsSync(file)).toBe(true);
  mark({ startedAt: "2026-10-23T22:01:00.000Z", processStart: "Thu Jan  1 00:00:00 1970" });
  expect(stop().decision).toBe("block");
  // Another session's and a reused pid's marker are left: they are not this session's to clear.
  expect(existsSync(file)).toBe(true);
  mark({ startedAt: "2026-10-23T22:02:00.000Z", pid: 2_147_483_000 });
  expect(stop().decision).toBe("block");
  expect(existsSync(runningFile(ctx.paths, work.id, 2_147_483_000))).toBe(false);
  write(ctx.paths.root, file.slice(ctx.paths.root.length + 1), "{ not json");
  expect(stop().decision).toBe("block");
  expect(existsSync(file)).toBe(false);
  expect(loadState(ctx.paths).sessions.s?.runPermits ?? []).toEqual([]);
});

test("AC-13 (finding 146): each run keeps its own marker under running/: two live runs of one item both permit, a misnamed marker and an old running.json permit nothing and are removed, and each run's end removes its own alone", async () => {
  const { ctx, mark } = stopSession();
  // Two live runs of one item: this process and its parent, both this session's
  mark({ startedAt: "2026-10-24T10:00:00.000Z" });
  mark({
    pid: process.ppid,
    processStart: processStart(process.ppid),
    startedAt: "2026-10-24T10:01:00.000Z",
  });
  const stop = () => onStop(ctx, { stop_hook_active: false });
  expect(stop().decision).toBeUndefined();
  expect(stop().decision).toBeUndefined();
  expect(stop().decision).toBe("block");
  expect(loadState(ctx.paths).sessions.s?.runPermits?.length).toBe(2);
  // A misnamed marker (its file name is not its pid) permits nothing and is removed
  const fresh = stopSession();
  fresh.mark({ startedAt: "2026-10-24T10:02:00.000Z" }, "12345");
  expect(onStop(fresh.ctx, { stop_hook_active: false }).decision).toBe("block");
  expect(
    existsSync(join(fresh.ctx.paths.root, ".crew", "work", fresh.work.id, "running", "12345.json")),
  ).toBe(false);
  // An old running.json from an engine before this change permits nothing, and the next run clears it
  const old = stopSession();
  const legacy = `.crew/work/${old.work.id}/running.json`;
  write(
    old.root,
    legacy,
    JSON.stringify({
      command: "crew gate run x",
      pid: process.pid,
      processStart: processStart(process.pid),
      session: "s",
      startedAt: "2026-10-24T10:03:00.000Z",
    }),
  );
  expect(onStop(old.ctx, { stop_hook_active: false }).decision).toBe("block");
  await withRunning(old.ctx.paths, old.work.id, "s", "crew gate run x", async () => undefined);
  expect(existsSync(join(old.root, legacy))).toBe(false);
  // Each run's end removes its own marker alone
  const paths = repoPaths(makeRepo({ "package.json": "{}" }), testEnv());
  const item = createWork(paths, "fix");
  const other = runningFile(paths, item.id, process.ppid);
  write(paths.root, other.slice(paths.root.length + 1), "{}");
  await withRunning(paths, item.id, "s1", "crew gate run x", async () => {
    expect(existsSync(runningFile(paths, item.id))).toBe(true);
  });
  expect(existsSync(runningFile(paths, item.id))).toBe(false);
  expect(existsSync(other)).toBe(true);
});
