import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { composePort, detectEnvironment, environmentChanges } from "../src/detect/environment.ts";
import { detectProfile, mergeProfile, profileChanges } from "../src/detect/index.ts";
import {
  checkHealth,
  envRecordPath,
  envStatus,
  startEnvironment,
  stopEnvironment,
} from "../src/environment.ts";
import { writeJson } from "../src/fs.ts";
import { isAlive } from "../src/open.ts";
import type { Environment, GateCommand, Profile } from "../src/types.ts";
import { makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

const proposed = (command: string): GateCommand => ({ command, source: "proposed" });
const confirmed = (command: string): GateCommand => ({ command, source: "confirmed" });

/** The environment of the tests: a flag file stands for the server, a sleeping process for it being up. */
function flagged(overrides: Partial<Environment> = {}): Environment {
  return {
    start: confirmed("sh -c 'touch up.flag; exec sleep 300'"),
    health: confirmed("test -f up.flag"),
    stop: confirmed("rm -f up.flag"),
    timeoutMs: 10_000,
    ...overrides,
  };
}

async function waitFor(what: string, cond: () => boolean, ms = 4000): Promise<void> {
  const until = Date.now() + ms;
  while (!cond() && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
  if (!cond()) throw new Error(`timed out waiting for ${what}`);
}

const compose = (ports: string) =>
  `services:\n  web:\n    image: x\n${ports ? `    ports:\n      - ${ports}\n` : ""}`;

// The AC-1 blocks share the environment a compose file publishing "8080:80" is detected as (the
// merge and the change lines start from it) and the profile those blocks merge into.
const quoted = tempDir();
write(quoted, "compose.yaml", compose('"8080:80"'));
const detected = detectEnvironment(quoted, []) as Environment;
const base: Profile = {
  version: 1,
  detectedAt: "2026-10-18T10:00:00.000Z",
  targets: [],
  watch: { exclude: [] },
};

test("SP7b-T3 AC-1 (compose port): the environment is detected from a compose file, every command proposed, the port digits alone", () => {
  expect(composePort(readFileSync(join(quoted, "compose.yaml"), "utf8"))).toBe(8080);
  expect(detected).toEqual({
    start: proposed("docker compose up -d"),
    stop: proposed("docker compose down"),
    health: proposed("curl -fsS http://localhost:8080/"),
    url: "http://localhost:8080",
    timeoutMs: 120_000,
  });
  expect(composePort(compose("8080:80"))).toBe(8080);
  expect(composePort(compose(""))).toBe(3000);
  for (const hostile of [
    '"8080;touch pwned:80"',
    "${PORT}:80",
    '"0:80"',
    '"65536:80"',
    '"99999:80"',
    '"8000-8010:80"',
    '"127.0.0.1:8080:80"',
  ]) {
    expect(composePort(compose(hostile))).toBe(3000);
    const dir = tempDir();
    write(dir, "docker-compose.yml", compose(hostile));
    expect(detectEnvironment(dir, [])?.health.command).toBe("curl -fsS http://localhost:3000/");
  }
  expect(composePort(compose('"65535:80"'))).toBe(65535);
  for (const name of ["docker-compose.yml", "compose.yml", "docker-compose.yaml"]) {
    const dir = tempDir();
    write(dir, name, compose('"8081:80"'));
    expect(detectEnvironment(dir, [])?.url).toBe("http://localhost:8081");
  }
});

test("SP7b-T3 AC-1 (artisan): the environment is detected from artisan, and a compose file beside it wins", () => {
  const laravel = tempDir();
  write(laravel, "artisan", "#!/usr/bin/env php\n");
  expect(detectEnvironment(laravel, [])).toEqual({
    start: proposed("php artisan serve --port 8000"),
    health: proposed("curl -fsS http://127.0.0.1:8000/"),
    url: "http://127.0.0.1:8000",
    timeoutMs: 120_000,
  });
  // A compose file beside artisan: the compose commands.
  write(laravel, "docker-compose.yml", compose(""));
  expect(detectEnvironment(laravel, [])?.start).toEqual(proposed("docker compose up -d"));
  expect(detectEnvironment(laravel, [])?.health).toEqual(
    proposed("curl -fsS http://localhost:3000/"),
  );
});

test("SP7b-T3 AC-1 (Makefile): the environment is detected from a Makefile's serve, start or dev target", () => {
  const makefiles: [string, string | null][] = [
    ["dev:\n\tnode app.js\nserve:\n\tnode serve.js\n", "make serve"],
    ["serve:\n\tx\nstart:\n\ty\n", "make start"],
    ["dev:\n\tx\n", "make dev"],
    ["test:\n\tx\nbuild:\n\ty\n", null],
  ];
  for (const [text, start] of makefiles) {
    const dir = tempDir();
    write(dir, "Makefile", text);
    expect(detectEnvironment(dir, [])?.start.command ?? null).toBe(start);
  }
});

test("SP7b-T3 AC-1 (package.json): the environment is detected from a package.json script, and a tree with none of the four has none", () => {
  const node = tempDir();
  write(
    node,
    "package.json",
    JSON.stringify({ scripts: { start: "node .", dev: "vite", test: "exit 0" } }),
  );
  write(node, "bun.lock", "");
  expect(detectProfile(node).environment).toEqual({
    start: proposed("bun run dev"),
    health: proposed("curl -fsS http://localhost:3000/"),
    url: "http://localhost:3000",
    timeoutMs: 120_000,
  });
  const plainNode = tempDir();
  write(plainNode, "package.json", JSON.stringify({ scripts: { start: "node ." } }));
  expect(detectProfile(plainNode).environment?.start).toEqual(proposed("npm run start"));
  const nothing = tempDir();
  write(nothing, "README.md", "# nothing\n");
  expect(detectEnvironment(nothing, [])).toBeNull();
  expect(detectProfile(nothing).environment).toBeUndefined();
});

test("SP7b-T3 AC-1 (mergeProfile): a confirmed block outlives a re-detection", () => {
  // The merge: a block with any confirmed command outlives the detection whole; a proposed one follows it.
  const startConfirmed: Environment = { ...detected, start: confirmed("make up") };
  expect(mergeProfile({ ...base, environment: startConfirmed }, [], detected).environment).toEqual(
    startConfirmed,
  );
  const healthConfirmed: Environment = {
    ...detected,
    health: confirmed("curl -fsS http://localhost:9000/"),
  };
  expect(mergeProfile({ ...base, environment: healthConfirmed }, [], detected).environment).toEqual(
    healthConfirmed,
  );
  expect(
    mergeProfile({ ...base, environment: { ...detected, timeoutMs: 1 } }, [], detected).environment,
  ).toEqual(detected);
  expect(
    mergeProfile({ ...base, environment: { ...detected, timeoutMs: 1 } }, [], null).environment,
  ).toBeUndefined();
  const kept = mergeProfile({ ...base, environment: startConfirmed }, [], null);
  expect(kept.environment).toEqual(startConfirmed);
  expect(profileChanges({ ...base, environment: startConfirmed }, kept)).toEqual([]);
});

test("SP7b-T3 AC-1 (the change lines): a re-detection names the environment's changes", () => {
  // The changes a re-detection names.
  expect(profileChanges(base, { ...base, environment: detected })).toContain(
    "environment.start: docker compose up -d",
  );
  expect(
    profileChanges(
      { ...base, environment: detected },
      { ...base, environment: { ...detected, health: confirmed(detected.health.command) } },
    ),
  ).toEqual(["environment.health: curl -fsS http://localhost:8080/"]);
  const { stop: _stop, ...withoutStop } = detected;
  expect(
    profileChanges({ ...base, environment: detected }, { ...base, environment: withoutStop }),
  ).toEqual(["environment.stop: removed"]);
  expect(profileChanges({ ...base, environment: detected }, base)).toContain(
    "environment: removed",
  );
});

test("SP7b-T3 AC-2: crew env starts the environment detached with a record written before the wait, waits for health, stops it and ends the group; a stop with no record says so; a time out ends what was started; a gone or reused pid is never signalled", async () => {
  const root = makeRepo();
  const paths = repoPaths(root, testEnv());
  const env = flagged();
  const started = await startEnvironment(paths, env);
  if ("refused" in started) throw new Error(started.refused);
  expect(started).toMatchObject({ started: true, managed: true });
  const pid = started.pid as number;
  expect(existsSync(join(root, "up.flag"))).toBe(true);
  expect(isAlive(pid)).toBe(true);
  const record = JSON.parse(readFileSync(envRecordPath(paths), "utf8"));
  expect(typeof record.processStart).toBe("string");
  expect((record.processStart as string).length).toBeGreaterThan(0);
  expect(record).toMatchObject({
    pid,
    managed: true,
    command: "sh -c 'touch up.flag; exec sleep 300'",
  });
  expect(record.log).toContain(join(paths.localDir, "env"));
  expect(readdirSync(join(paths.localDir, "env")).some((f) => f.startsWith("start-"))).toBe(true);
  expect((await checkHealth(paths, env)).up).toBe(true);
  expect(await envStatus(paths, env)).toMatchObject({ state: "up", managed: true, pid });
  const stopped = await stopEnvironment(paths, env);
  expect(stopped).toEqual({ stopped: true, pid, signalled: true });
  expect(existsSync(join(root, "up.flag"))).toBe(false);
  await waitFor("the started process to die", () => !isAlive(pid));
  expect(existsSync(envRecordPath(paths))).toBe(false);
  expect(await stopEnvironment(paths, env)).toEqual({
    refused: "nothing was started by the engine (crew env start)",
  });
  expect((await checkHealth(paths, env)).up).toBe(false);
  expect(await envStatus(paths, env)).toMatchObject({ state: "down", managed: null, pid: null });
  // The record is written before the wait: health passes only once env.json exists.
  const recorded = await startEnvironment(
    paths,
    flagged({ start: confirmed("sleep 300"), health: confirmed("test -f .crew/local/env.json") }),
  );
  if ("refused" in recorded) throw new Error(recorded.refused);
  expect(recorded.started).toBe(true);
  expect(JSON.parse(readFileSync(envRecordPath(paths), "utf8"))).toMatchObject({
    pid: recorded.pid,
    managed: true,
  });
  const ended = await stopEnvironment(paths, flagged({ stop: undefined }));
  expect(ended).toEqual({ stopped: true, pid: recorded.pid, signalled: true });
  await waitFor("the sleeper to die", () => !isAlive(recorded.pid as number));
  // A start whose health never comes: the group is ended and the record removed.
  const timedOut = await startEnvironment(
    paths,
    flagged({ start: confirmed("sleep 300"), health: confirmed("exit 1"), timeoutMs: 1000 }),
  );
  expect(timedOut).toEqual({
    refused: "the environment did not answer health in 1 s (exit 1)",
  });
  expect(existsSync(envRecordPath(paths))).toBe(false);
  const starts = readdirSync(join(paths.localDir, "env")).filter((f) => f.startsWith("start-"));
  expect(starts.length).toBe(3);
  // A stale record (finding 71): the stop command runs whenever the profile has one, nothing is
  // signalled, the record goes; without a stop command the stop is refused and says so.
  const gone = spawnSync("sh", ["-c", "exit 0"]);
  const stale = flagged({ stop: confirmed("touch stopped.flag") });
  const staleRecord = {
    pid: gone.pid,
    processStart: "gone",
    startedAt: "2026-10-18T10:00:00.000Z",
    managed: true,
    log: null,
    command: "x",
  };
  writeJson(envRecordPath(paths), staleRecord);
  expect(await stopEnvironment(paths, stale)).toEqual({
    stopped: true,
    pid: gone.pid,
    signalled: false,
  });
  expect(existsSync(join(root, "stopped.flag"))).toBe(true);
  expect(existsSync(envRecordPath(paths))).toBe(false);
  unlinkSync(join(root, "stopped.flag"));
  writeJson(envRecordPath(paths), staleRecord);
  expect(await stopEnvironment(paths, flagged({ stop: undefined }))).toEqual({
    refused: `the recorded process (pid ${gone.pid}) is gone; the record was removed and nothing was signalled`,
  });
  expect(existsSync(envRecordPath(paths))).toBe(false);
  expect(existsSync(join(root, "stopped.flag"))).toBe(false);
  // A reused pid: alive, but not the process the engine started: never signalled, with or without a stop command.
  const reused = { ...staleRecord, pid: process.pid, processStart: "not this one" };
  writeJson(envRecordPath(paths), reused);
  expect(await stopEnvironment(paths, stale)).toEqual({
    stopped: true,
    pid: process.pid,
    signalled: false,
  });
  expect(existsSync(join(root, "stopped.flag"))).toBe(true);
  unlinkSync(join(root, "stopped.flag"));
  writeJson(envRecordPath(paths), reused);
  expect(await stopEnvironment(paths, flagged({ stop: undefined }))).toEqual({
    refused: `the recorded process (pid ${process.pid}) is gone; the record was removed and nothing was signalled`,
  });
  expect(existsSync(envRecordPath(paths))).toBe(false);
  // An empty start time is never ours, even with a live pid.
  writeJson(envRecordPath(paths), { ...reused, processStart: "" });
  expect(await stopEnvironment(paths, stale)).toEqual({
    stopped: true,
    pid: process.pid,
    signalled: false,
  });
  expect(existsSync(join(root, "stopped.flag"))).toBe(true);
  unlinkSync(join(root, "stopped.flag"));
  expect(existsSync(envRecordPath(paths))).toBe(false);
}, 30_000);

test("SP7b-T3 AC-3: an environment up before the start is the user's: nothing spawned, recorded as not managed, never stopped; down when its server dies", async () => {
  const root = makeRepo();
  const paths = repoPaths(root, testEnv());
  const env = flagged();
  write(root, "up.flag", "");
  const started = await startEnvironment(paths, env);
  expect(started).toEqual({ started: false, managed: false, pid: null, log: null });
  expect(readdirSync(join(paths.localDir, "env")).some((f) => f.startsWith("start-"))).toBe(false);
  expect(JSON.parse(readFileSync(envRecordPath(paths), "utf8"))).toMatchObject({
    pid: null,
    managed: false,
  });
  expect(await envStatus(paths, env)).toMatchObject({ state: "up", managed: false, pid: null });
  expect(await stopEnvironment(paths, env)).toEqual({
    refused:
      "the environment was up before crew env start: it is the user's, and the engine never stops it",
  });
  expect(existsSync(join(root, "up.flag"))).toBe(true);
  unlinkSync(join(root, "up.flag"));
  expect(await envStatus(paths, env)).toMatchObject({ state: "down", managed: false });
});

test("CON6-AC-5 (finding 72): the environment's change lines carry no (.) marker", () => {
  const before: Environment = {
    start: proposed("docker compose up -d"),
    health: proposed("curl -fsS http://localhost:8080/"),
    stop: proposed("docker compose down"),
    timeoutMs: 1,
  };
  const after: Environment = {
    start: confirmed("docker compose up -d --wait"),
    health: proposed("curl -fsS http://localhost:8080/"),
    timeoutMs: 1,
  };
  expect(environmentChanges(before, after)).toEqual([
    "environment.start: docker compose up -d --wait",
    "environment.stop: removed",
  ]);
  for (const line of environmentChanges(undefined, before)) expect(line).not.toContain("(.)");
});
