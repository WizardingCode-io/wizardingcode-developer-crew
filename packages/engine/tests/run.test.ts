import { expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import { joinWords, runCommand, shellRefusal } from "../src/run.ts";
import { tempDir } from "./helpers.ts";

test("captures exit code, tail and a log file", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "a.txt");
  const result = await runCommand("echo one; echo two; echo err 1>&2; exit 3", {
    cwd: dir,
    timeoutMs: 5000,
    logPath: log,
  });
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
