import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import { eventsPathOf, joinWords, runCommand, shellRefusal } from "../src/run.ts";
import { newestEvents, tempDir, within } from "./helpers.ts";

test("captures exit code, tail and a log file", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "a.txt");
  const result = await within(
    runCommand("echo one; echo two; echo err 1>&2; exit 3", {
      cwd: dir,
      timeoutMs: 5000,
      logPath: log,
      events: true,
    }),
    20_000,
    eventsPathOf(log),
  );
  expect(result.exit).toBe(3);
  expect(result.timedOut).toBe(false);
  expect(result.tail).toContain("two");
  expect(result.tail).toContain("err");
  expect(readFileSync(log, "utf8")).toContain("one");
});

test("a hanging command is killed at the timeout, children included", async () => {
  const dir = tempDir();
  const started = Date.now();
  const result = await runCommand("sleep 30 & sleep 30; echo never", {
    cwd: dir,
    timeoutMs: 300,
    logPath: join(dir, "hang.txt"),
  });
  expect(result.timedOut).toBe(true);
  expect(result.exit).not.toBe(0);
  expect(Date.now() - started).toBeLessThan(5000);
  expect(result.tail).not.toContain("never");
});

test("stdin is passed through when given", async () => {
  const dir = tempDir();
  const result = await runCommand("cat", {
    cwd: dir,
    timeoutMs: 5000,
    logPath: join(dir, "c.txt"),
    stdin: "hello",
  });
  expect(result.exit).toBe(0);
  expect(result.tail).toBe("hello");
});

test("SP8-T1 AC-1 (finding 91): shellRefusal names a shell whose command string is followed by more words, whatever its path, wrapper or flag cluster, and lets every other command through", () => {
  const refused = [
    ["sh", "-c", "bun", "run", "check"],
    ["/bin/sh", "-c", "bun", "run", "check"],
    ["bash", "-ec", "bun", "run", "check"],
    ["zsh", "-lc", "bun", "run", "check"],
    ["bash", "-l", "-c", "bun", "run", "check"],
    ["env", "sh", "-c", "bun", "run", "check"],
    ["env", "A=b", "sh", "-c", "bun", "run", "check"],
    ["command", "sh", "-c", "bun", "run", "check"],
    ["dash", "-c", "a", "b"],
    ["ksh", "-c", "a", "b"],
    ["fish", "-c", "a", "b"],
    ["/usr/bin/env", "bash", "-xc", "a", "b"],
    // A wrapper's own flags do not hide the shell (the security lead's return at the delivery).
    ["env", "-i", "sh", "-c", "a", "b"],
    ["env", "-u", "HOME", "sh", "-c", "a", "b"],
    ["env", "-i", "A=b", "zsh", "-c", "a", "b"],
    ["command", "-p", "bash", "-lc", "a", "b"],
    // A shell's valued option, as a word or as a cluster's last letter, and its long valued
    // options hide nothing (finding 98: `bash -o pipefail -c a b` ran `a` with `$0=b`).
    ["bash", "-o", "pipefail", "-c", "a", "b"],
    ["bash", "+O", "extglob", "-c", "a", "b"],
    ["bash", "-eo", "pipefail", "-c", "a", "b"],
    ["bash", "-eO", "extglob", "-c", "a", "b"],
    ["bash", "--rcfile", "x", "-c", "a", "b"],
    ["bash", "--init-file", "x", "-c", "a", "b"],
    ["bash", "--rcfile=x", "-c", "a", "b"],
    // A wrapper's valued option, short (as a word or a cluster), long or a script option, from
    // the table the hook reads (finding 98: the tables had drifted, `env -P /x sh -c a b` passed).
    ["env", "-P", "/x", "sh", "-c", "a", "b"],
    ["env", "-iu", "X", "sh", "-c", "a", "b"],
    ["env", "-C", "/d", "sh", "-c", "a", "b"],
    ["env", "-L", "u", "sh", "-c", "a", "b"],
    ["env", "-U", "u", "sh", "-c", "a", "b"],
    ["env", "--unset", "X", "sh", "-c", "a", "b"],
    ["env", "--chdir", "/d", "sh", "-c", "a", "b"],
    ["env", "--block-signal", "INT", "sh", "-c", "a", "b"],
    ["env", "--default-signal", "INT", "sh", "-c", "a", "b"],
    ["env", "--ignore-signal", "INT", "sh", "-c", "a", "b"],
    ["env", "--unset=X", "sh", "-c", "a", "b"],
    ["env", "-S", "x", "sh", "-c", "a", "b"],
    ["env", "--split-string", "x", "sh", "-c", "a", "b"],
    ["env", "-vS", "x", "sh", "-c", "a", "b"],
    ["env", "--", "sh", "-c", "a", "b"],
  ];
  for (const words of refused) {
    const why = shellRefusal(words);
    expect(why, words.join(" ")).toContain("quote the command string as one argument");
    expect(why, words.join(" ")).toContain('-c "<command>"');
  }
  const accepted = [
    ["sh", "-c", "bun run check && true"],
    ["bun", "test", "x.test.ts"],
    ["sh", "script.sh", "arg"],
    ["bash", "-o", "pipefail", "-c", "x"],
    ["bash", "-o", "pipefail", "-c", "a && b"],
    // A cluster whose last letter takes no value: `extglob` is the command, not a shell form.
    ["bash", "+Oe", "extglob", "-c", "a", "b"],
    // A wrapper's flag is skipped only right after a wrapper word or another of its flags: after
    // an assignment alone, `-x` is the command the shell (or env) runs.
    ["A=1", "-x", "sh", "-c", "a", "b"],
    ["env", "A=1", "-x", "sh", "-c", "a", "b"],
    ["sh", "-c"],
    ["echo", "-c", "a", "b"],
    ["bun run check && true"],
    [],
  ];
  for (const words of accepted) expect(shellRefusal(words), words.join(" ")).toBeNull();
});

test("SP8-T1 AC-1 (finding 91): joinWords keeps the words' boundaries when there are several and runs one word as the command line it is", async () => {
  expect(joinWords(["sh", "-c", "a && b"])).toBe("sh -c 'a && b'");
  expect(joinWords(["bun", "test", "x.test.ts"])).toBe("bun test x.test.ts");
  expect(joinWords(["echo", "it's"])).toBe("echo 'it'\\''s'");
  expect(joinWords(["a && b"])).toBe("a && b");
  expect(joinWords([])).toBe("");
  // The shell gets the string whole: `exit 3 && echo never` is one command line, not `exit` with $0=3.
  const dir = tempDir();
  const result = await runCommand(joinWords(["sh", "-c", "exit 3 && echo never"]), {
    cwd: dir,
    timeoutMs: 5000,
    logPath: join(dir, "logs", "joined.txt"),
  });
  expect(result.exit).toBe(3);
  expect(result.tail).not.toContain("never");
});

// SP9 Task 10 (2026-10-27-005) AC-10: the promise resolves only once the log is on disk. The fourth
// gate run's test gate read the deep audit's new_page reply short under load ("new_page gave no page
// id"), and a probe found one short read in ten of a 3 MB output: runCommand ended its log stream
// and resolved without waiting for the stream to finish. Twenty runs of a large output, each log
// complete the moment the promise resolves.
test("SP9-T10 AC-10: the log file holds the whole output when runCommand resolves, twenty large runs in a row", async () => {
  const dir = tempDir();
  const bytes = 8_000_000;
  for (let i = 0; i < 20; i++) {
    const logPath = join(dir, "logs", `large-${i}.txt`);
    const result = await runCommand(`head -c ${bytes} /dev/zero | tr '\\0' x`, {
      cwd: dir,
      timeoutMs: 20_000,
      logPath,
    });
    expect(result.exit).toBe(0);
    expect(statSync(logPath).size, `run ${i}`).toBe(bytes);
  }
}, 60_000);

// The batched round of 2026-10-27-005: the stderr stream waited for as the log is, and the wait seen
// deterministically through the seam (a stream whose end is slow), beside the twenty-run guard.
test("SP9-T10 AC-10: a stderr log file holds the whole output when runCommand resolves", async () => {
  const dir = tempDir();
  const bytes = 4_000_000;
  const logPath = join(dir, "logs", "out.txt");
  const stderrLogPath = join(dir, "logs", "err.txt");
  const result = await runCommand(`head -c ${bytes} /dev/zero | tr '\\0' x 1>&2; echo done`, {
    cwd: dir,
    timeoutMs: 20_000,
    logPath,
    stderrLogPath,
  });
  expect(result.exit).toBe(0);
  expect(statSync(stderrLogPath).size).toBe(bytes);
  expect(readFileSync(logPath, "utf8")).toBe("done\n");
}, 60_000);

test("SP9-T10 AC-10: the promise waits for both streams to finish, seen through a stream whose end is slow", async () => {
  const dir = tempDir();
  const finished: Record<string, number> = {};
  const slow = (path: string): Writable =>
    new Writable({
      write(_chunk, _encoding, next) {
        next();
      },
      final(done) {
        setTimeout(() => {
          finished[path] = Date.now();
          done();
        }, 40);
      },
    });
  const logPath = join(dir, "logs", "slow-out.txt");
  const stderrLogPath = join(dir, "logs", "slow-err.txt");
  const result = await runCommand("echo out; echo err 1>&2", {
    cwd: dir,
    timeoutMs: 5000,
    logPath,
    stderrLogPath,
    openLog: slow,
  });
  const resolvedAt = Date.now();
  expect(result.exit).toBe(0);
  expect(result.tail).toContain("out");
  expect(finished[logPath]).toBeDefined();
  expect(finished[stderrLogPath]).toBeDefined();
  expect(resolvedAt).toBeGreaterThanOrEqual(finished[logPath] ?? Number.POSITIVE_INFINITY);
  expect(resolvedAt).toBeGreaterThanOrEqual(finished[stderrLogPath] ?? Number.POSITIVE_INFINITY);
});

/** The events file's lines, each split into its name and its milliseconds (finding 220). */
function eventLines(path: string): { text: string; name: string; ms: number | null }[] {
  return readFileSync(path, "utf8")
    .trimEnd()
    .split("\n")
    .map((text) => {
      const timed = /^(.+?) \+(\d+)ms\b/.exec(text);
      return {
        text,
        name: timed?.[1] ?? text.split(" ")[0] ?? "",
        ms: timed ? Number(timed[2]) : null,
      };
    });
}

test("2026-11-02-002 AC-1: with events, runCommand writes each event of its child beside the log as it comes, timed from the spawn", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "a.txt");
  const command = "echo one; echo err 1>&2; exit 3";
  await runCommand(command, { cwd: dir, timeoutMs: 5000, logPath: log, events: true });
  expect(eventsPathOf(log)).toBe(join(dir, "logs", "a.events.txt"));
  expect(eventsPathOf(join(dir, "x.d", "b"))).toBe(join(dir, "x.d", "b.events.txt"));
  const lines = eventLines(eventsPathOf(log));
  const [word, at, ...rest] = (lines[0]?.text ?? "").split(" ");
  expect(word).toBe("start");
  expect(Number.isNaN(Date.parse(at ?? ""))).toBe(false);
  expect(at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(rest.join(" ")).toBe(JSON.stringify(command));
  const names = lines.slice(1).map((l) => l.name);
  for (const name of [
    "spawn",
    "stdout end",
    "stdout close",
    "stderr end",
    "stderr close",
    "exit",
    "close",
    "logs ended",
  ])
    expect(names).toContain(name);
  for (const line of lines.slice(1)) expect(line.ms).not.toBeNull();
  expect(names.at(-1)).toBe("logs ended");
  expect(lines.find((l) => l.name === "spawn")?.text).toMatch(/^spawn \+\d+ms pid \d+$/);
  expect(lines.find((l) => l.name === "exit")?.text).toMatch(/^exit \+\d+ms code 3 signal null$/);
  expect(lines.find((l) => l.name === "close")?.text).toMatch(/^close \+\d+ms code 3 signal null$/);
  // Without events, nothing is written beside the log.
  const plain = join(dir, "plain", "p.txt");
  await runCommand("echo x", { cwd: dir, timeoutMs: 5000, logPath: plain });
  expect(readdirSync(join(dir, "plain"))).toEqual(["p.txt"]);
});

test("2026-11-02-002 AC-1: a timed-out run leaves a timeout line, and a run whose cwd is missing leaves an error line", async () => {
  const dir = tempDir();
  const hung = join(dir, "logs", "hung.txt");
  const timed = await runCommand("sleep 5", {
    cwd: dir,
    timeoutMs: 300,
    logPath: hung,
    events: true,
  });
  expect(timed.timedOut).toBe(true);
  expect(eventLines(eventsPathOf(hung)).map((l) => l.text)).toContainEqual(
    expect.stringMatching(/^timeout \+\d+ms killed the group$/),
  );
  const lost = join(dir, "logs", "lost.txt");
  const failed = await runCommand("echo hi", {
    cwd: join(dir, "missing"),
    timeoutMs: 5000,
    logPath: lost,
    events: true,
  });
  expect(failed.exit).toBeNull();
  const names = eventLines(eventsPathOf(lost)).map((l) => l.name);
  expect(names).toContain("error");
  expect(names).not.toContain("spawn");
});

test("2026-11-02-002 AC-2: while the run is pending, the file already holds the exit, and a pipe a grandchild holds shows no close until it ends", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "held.txt");
  const path = eventsPathOf(log);
  const run = runCommand("sleep 1 & echo x", {
    cwd: dir,
    timeoutMs: 10_000,
    logPath: log,
    events: true,
  });
  let settled = false;
  void run.then(() => {
    settled = true;
  });
  const deadline = Date.now() + 900;
  while (
    Date.now() < deadline &&
    !(existsSync(path) && readFileSync(path, "utf8").includes("\nexit "))
  )
    await new Promise((r) => setTimeout(r, 10));
  const pending = eventLines(path).map((l) => l.name);
  expect(settled).toBe(false);
  expect(pending).toContain("spawn");
  expect(pending).toContain("exit");
  expect(pending).not.toContain("stdout close");
  expect(pending).not.toContain("close");
  await run;
  const after = eventLines(path);
  const exit = after.find((l) => l.name === "exit")?.ms ?? 0;
  const close = after.find((l) => l.name === "close")?.ms ?? 0;
  expect(close - exit).toBeGreaterThanOrEqual(500);
});

test("2026-11-02-002 AC-5: an events path that cannot be written changes nothing in the run", async () => {
  const dir = tempDir();
  const blocked = join(dir, "logs", "blocked.txt");
  mkdirSync(eventsPathOf(blocked), { recursive: true });
  const result = await within(
    runCommand("echo one; echo two; exit 3", {
      cwd: dir,
      timeoutMs: 5000,
      logPath: blocked,
      events: true,
    }),
    10_000,
    null,
  );
  expect(result.exit).toBe(3);
  expect(result.timedOut).toBe(false);
  expect(result.tail).toBe("one\ntwo");
  expect(readFileSync(blocked, "utf8")).toBe("one\ntwo\n");
});

test("2026-11-02-002 AC-7: within names the events file when the promise has no result in time, and newestEvents picks by modification time", async () => {
  const dir = tempDir();
  const path = join(dir, "a.events.txt");
  writeFileSync(path, "start x\nspawn +1ms pid 1\n");
  const never = new Promise<number>(() => {});
  await expect(within(never, 50, path)).rejects.toThrow(
    /no result in 50 ms; events: a\.events\.txt: start x\nspawn \+1ms pid 1/,
  );
  await expect(within(never, 50, () => null)).rejects.toThrow(/no result in 50 ms; events: none/);
  await expect(within(never, 50, join(dir, "absent.events.txt"))).rejects.toThrow(/events: none/);
  expect(await within(Promise.resolve(7), 50, path)).toBe(7);
  // The older file's name sorts after the newer one's.
  const logs = join(dir, "logs");
  mkdirSync(logs);
  expect(newestEvents(logs)).toBeNull();
  writeFileSync(join(logs, "tdd-AC-2-after-1.events.txt"), "start old\n");
  writeFileSync(join(logs, "tdd-AC-1-red-2.events.txt"), "start new\n");
  writeFileSync(join(logs, "tdd-AC-9-red-3.txt"), "a log\n");
  utimesSync(join(logs, "tdd-AC-2-after-1.events.txt"), new Date(1_000_000), new Date(1_000_000));
  utimesSync(join(logs, "tdd-AC-1-red-2.events.txt"), new Date(2_000_000), new Date(2_000_000));
  expect(newestEvents(logs)).toBe(join(logs, "tdd-AC-1-red-2.events.txt"));
  expect(newestEvents(join(dir, "none"))).toBeNull();
});

test("2026-11-02-002 AC-9: a run whose close does not come after the timeout's kill resolves after the grace, timed out, with a gave up line", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "escaped.txt");
  const started = Date.now();
  // A descendant that leaves the group survives the group kill and holds the pipes for 4 s.
  const result = await within(
    runCommand(`perl -e 'use POSIX; setsid(); exec "sleep", "4"' & echo before; sleep 10`, {
      cwd: dir,
      timeoutMs: 300,
      logPath: log,
      events: true,
    }),
    8000,
    eventsPathOf(log),
  );
  const took = Date.now() - started;
  expect(result.timedOut).toBe(true);
  expect(result.exit).toBeNull();
  expect(took).toBeGreaterThanOrEqual(2000);
  expect(took).toBeLessThan(5000);
  const lines = eventLines(eventsPathOf(log));
  const kill = lines.find((l) => l.name === "timeout")?.ms ?? 0;
  const gaveUp = lines.find((l) => l.name === "gave up");
  expect(gaveUp?.text).toMatch(/^gave up \+\d+ms no close after the kill$/);
  expect((gaveUp?.ms ?? 0) - kill).toBeGreaterThanOrEqual(1900);
  expect(readFileSync(log, "utf8")).toContain("before");
});

test("2026-11-02-002 AC-10: at the timeout, before the kill, the events file says whether the pid and its group were alive", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "probe.txt");
  await runCommand("sleep 5", { cwd: dir, timeoutMs: 300, logPath: log, events: true });
  const lines = eventLines(eventsPathOf(log));
  const probe = lines.findIndex((l) => l.name === "probe");
  expect(lines[probe]?.text).toMatch(/^probe \+\d+ms pid alive group alive$/);
  expect(probe).toBeLessThan(lines.findIndex((l) => l.name === "timeout"));
});

test("2026-11-02-002 AC-9: the run releases the pipes it gave up on, so what a descendant writes later is refused, and nothing throws", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "late.txt");
  // The descendant ignores SIGPIPE and leaves a marker: `refused` when its write found no reader.
  const late = `trap "" PIPE; sleep 3; if echo late; then touch ${dir}/wrote; else touch ${dir}/refused; fi`;
  const result = await runCommand(
    `perl -e 'use POSIX; setsid(); exec "sh", "-c", $ARGV[0]' '${late}' & echo early; sleep 10`,
    { cwd: dir, timeoutMs: 300, logPath: log, events: true },
  );
  expect(result.timedOut).toBe(true);
  // The descendant writes about 0.7 s after the run gave up (300 ms + 2 s grace, at 3 s).
  const deadline = Date.now() + 3000;
  while (
    Date.now() < deadline &&
    !existsSync(join(dir, "refused")) &&
    !existsSync(join(dir, "wrote"))
  )
    await new Promise((r) => setTimeout(r, 50));
  expect(existsSync(join(dir, "refused"))).toBe(true);
  expect(existsSync(join(dir, "wrote"))).toBe(false);
  const text = readFileSync(log, "utf8");
  expect(text).toContain("early");
  expect(text).not.toContain("late");
});
