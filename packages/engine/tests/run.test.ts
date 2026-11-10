import { expect, test } from "bun:test";
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import {
  eventsPathOf,
  joinWords,
  KILL_GRACE_MS,
  runCommand,
  type Spawn,
  shellRefusal,
  tailOf,
} from "../src/run.ts";
import { eventsReport, newestEvents, tempDir, within } from "./helpers.ts";

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
  // The child's events in the message (finding 220): a failure here names the spawn and the
  // missing event's time, where the fixture folder and its events file do not outlive the run.
  const events = eventsReport(eventsPathOf(log));
  expect(result.exit, events).toBe(3);
  expect(result.timedOut, events).toBe(false);
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

// The batched round of 2026-10-27-005: the stderr log is whole at the resolve as the log is. The child
// writes both by descriptor, so no stream of the engine's stands between its output and the disk.
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
  for (const line of lines.slice(1)) expect(line.ms).not.toBeNull();
  expect(names.at(-1)).toBe("resolved");
  // No pipe carries the output (2026-11-10-001), so no pipe has an end to note.
  for (const name of names) expect(name).not.toMatch(/^std(out|err) /);
  expect(names).not.toContain("logs ended");
  if (names.includes("ended at return")) {
    // The runtime ended the child inside spawn() (finding 220): one line stands for its events.
    expect(lines.find((l) => l.name === "ended at return")?.text).toMatch(
      /^ended at return \+\d+ms code 3 signal null$/,
    );
  } else {
    expect(lines.find((l) => l.name === "spawn")?.text).toMatch(/^spawn \+\d+ms pid \d+$/);
    expect(lines.find((l) => l.name === "exit")?.text).toMatch(/^exit \+\d+ms code 3 signal null$/);
    expect(lines.find((l) => l.name === "close")?.text).toMatch(
      /^close \+\d+ms code 3 signal null$/,
    );
  }
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

test("2026-11-02-002 AC-2: while the run is pending, the file already holds the spawn", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "held.txt");
  const path = eventsPathOf(log);
  const run = runCommand("sleep 1; echo x", {
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
    !(existsSync(path) && readFileSync(path, "utf8").includes("\nspawn "))
  )
    await new Promise((r) => setTimeout(r, 10));
  const pending = eventLines(path).map((l) => l.name);
  expect(settled).toBe(false);
  expect(pending).toContain("spawn");
  expect(pending).not.toContain("close");
  await run;
  const after = eventLines(path).map((l) => l.name);
  expect(after).toContain("exit");
  expect(after).toContain("close");
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

/** A child as the seam hands it over: an emitter with the fields `runCommand` reads, emitting nothing by itself. */
function fakeChild(fields: {
  pid?: number;
  exitCode?: number | null;
  signalCode?: NodeJS.Signals | null;
  stdin?: Writable | null;
}): ChildProcess {
  return Object.assign(new EventEmitter(), {
    pid: undefined,
    exitCode: null,
    signalCode: null,
    stdin: null,
    stdout: null,
    stderr: null,
    ...fields,
  }) as unknown as ChildProcess;
}

/** The descriptors `runCommand` gave the seam as the child's stdout and stderr. */
function descriptorsOf(options: Parameters<Spawn>[1]): [number, number] {
  const stdio = options.stdio as unknown[];
  return [stdio[1] as number, stdio[2] as number];
}

/** How many descriptors this process holds. */
function descriptors(): number {
  return readdirSync("/dev/fd").length;
}

test("2026-11-02-002 AC-9: a run whose close does not come after the timeout's kill resolves after the grace, timed out, with a gave up line", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "escaped.txt");
  const started = Date.now();
  // A child the runtime never ends (finding 220's first form): it wrote, and no event follows.
  const neverEnds: Spawn = (_command, options) => {
    writeSync(descriptorsOf(options)[0], "before\n");
    return fakeChild({});
  };
  const result = await within(
    runCommand("the seam runs nothing", {
      cwd: dir,
      timeoutMs: 300,
      logPath: log,
      events: true,
      spawn: neverEnds,
    }),
    8000,
    eventsPathOf(log),
  );
  const took = Date.now() - started;
  expect(result.timedOut).toBe(true);
  expect(result.exit).toBeNull();
  expect(result.tail).toBe("before");
  expect(took).toBeLessThan(300 + KILL_GRACE_MS + 1000);
  const lines = eventLines(eventsPathOf(log));
  const kill = lines.find((l) => l.name === "timeout")?.ms ?? 0;
  const gaveUp = lines.find((l) => l.name === "gave up");
  expect(gaveUp?.text).toMatch(/^gave up \+\d+ms no close after the kill$/);
  // A timer never fires early by more than the clock's own millisecond.
  expect((gaveUp?.ms ?? 0) - kill).toBeGreaterThanOrEqual(KILL_GRACE_MS - 2);
  expect((gaveUp?.ms ?? 0) - kill).toBeLessThan(KILL_GRACE_MS + 1000);
  expect(lines.at(-1)?.name).toBe("resolved");
  expect(readFileSync(log, "utf8")).toBe("before\n");
}, 15_000);

test("2026-11-02-002 AC-10: at the timeout, before the kill, the events file says whether the pid and its group were alive", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "probe.txt");
  await runCommand("sleep 5", { cwd: dir, timeoutMs: 300, logPath: log, events: true });
  const lines = eventLines(eventsPathOf(log));
  const probe = lines.findIndex((l) => l.name === "probe");
  expect(lines[probe]?.text).toMatch(/^probe \+\d+ms pid alive group alive$/);
  expect(probe).toBeLessThan(lines.findIndex((l) => l.name === "timeout"));
});

test("2026-11-02-002 AC-9: after a run gave up, what a descendant writes later lands in the log, the result does not change and nothing throws", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "late.txt");
  // The child never ends for the engine; a real process holding the log's descriptor writes at 3 s,
  // about 0.7 s after the run gave up (300 ms and the grace).
  const leavesAWriter: Spawn = (_command, options) => {
    const [out, err] = descriptorsOf(options);
    writeSync(out, "early\n");
    spawn("sleep 3; echo late", { shell: true, stdio: ["ignore", out, err] }).unref();
    return fakeChild({});
  };
  const result = await runCommand("the seam runs its own", {
    cwd: dir,
    timeoutMs: 300,
    logPath: log,
    events: true,
    spawn: leavesAWriter,
  });
  expect(result.timedOut).toBe(true);
  expect(result.exit).toBeNull();
  expect(result.tail).toBe("early");
  expect(readFileSync(log, "utf8")).toBe("early\n");
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && !readFileSync(log, "utf8").includes("late"))
    await new Promise((r) => setTimeout(r, 50));
  expect(readFileSync(log, "utf8")).toBe("early\nlate\n");
  expect(result.tail).toBe("early");
}, 15_000);

/** The seam's child that ran to its end inside the seam and emits nothing after: what bun's spawn() does to a child it finds ended (finding 220). */
const ranInside: Spawn = (command, options) => {
  const [out, err] = descriptorsOf(options);
  const ran = spawnSync(command, {
    cwd: options.cwd,
    shell: true,
    stdio: ["ignore", out, err],
  });
  return fakeChild({ pid: ran.pid, exitCode: ran.status, signalCode: ran.signal });
};

test("2026-11-10-001 AC-1: a child that had ended when spawn() returned, and emits nothing after, gives its exit code and its tail at once, and the events file says so", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "ended.txt");
  const started = Date.now();
  const result = await runCommand("echo one; echo two; echo err 1>&2; exit 3", {
    cwd: dir,
    timeoutMs: 5000,
    logPath: log,
    events: true,
    spawn: ranInside,
  });
  expect(Date.now() - started).toBeLessThan(1000);
  expect(result).toMatchObject({ exit: 3, timedOut: false, tail: "one\ntwo\nerr" });
  expect(readFileSync(log, "utf8")).toBe("one\ntwo\nerr\n");
  const lines = eventLines(eventsPathOf(log));
  expect(lines.map((l) => l.name)).toEqual(["start", "ended at return", "resolved"]);
  expect(lines[1]?.text).toMatch(/^ended at return \+\d+ms code 3 signal null$/);
  // A child a signal ended reads the same way: no code, its signal.
  const killed: Spawn = () => fakeChild({ signalCode: "SIGKILL" });
  const signalled = await runCommand("x", {
    cwd: dir,
    timeoutMs: 5000,
    logPath: join(dir, "logs", "signalled.txt"),
    events: true,
    spawn: killed,
  });
  expect(signalled).toMatchObject({ exit: null, timedOut: false, tail: "" });
  expect(eventLines(eventsPathOf(join(dir, "logs", "signalled.txt")))[1]?.text).toMatch(
    /^ended at return \+\d+ms code null signal SIGKILL$/,
  );
});

test("2026-11-10-001 AC-2: the child's stdout and stderr are descriptors of the log, never pipes; the tail is the log's last 40 lines, stdout's then stderr's with a stderr log; the parent keeps none open", async () => {
  const dir = tempDir();
  const seen: unknown[][] = [];
  const watching: Spawn = (command, options) => {
    seen.push(options.stdio as unknown[]);
    return spawn(command, options);
  };
  const log = join(dir, "logs", "one.txt");
  const one = await runCommand("seq 1 50; echo e 1>&2", {
    cwd: dir,
    timeoutMs: 5000,
    logPath: log,
    events: true,
    spawn: watching,
  });
  expect(seen[0]?.[0]).toBe("ignore");
  expect(typeof seen[0]?.[1]).toBe("number");
  // One descriptor for both, so the log keeps the order the child wrote in.
  expect(seen[0]?.[2]).toBe(seen[0]?.[1]);
  expect(one.exit).toBe(0);
  expect(one.tail.split("\n")).toEqual([
    ...Array.from({ length: 39 }, (_, i) => String(12 + i)),
    "e",
  ]);
  expect(readFileSync(log, "utf8").split("\n").length).toBe(52);
  const names = eventLines(eventsPathOf(log)).map((l) => l.name);
  for (const name of names) expect(name).not.toMatch(/^std(out|err) /);
  expect(names.at(-1)).toBe("resolved");
  const out = join(dir, "logs", "out.txt");
  const err = join(dir, "logs", "err.txt");
  const two = await runCommand("echo o1; echo e1 1>&2; sleep 0.1; echo o2", {
    cwd: dir,
    timeoutMs: 5000,
    logPath: out,
    stderrLogPath: err,
    spawn: watching,
  });
  expect(typeof seen[1]?.[2]).toBe("number");
  expect(seen[1]?.[2]).not.toBe(seen[1]?.[1]);
  expect(two.tail).toBe("o1\no2\ne1");
  expect(readFileSync(out, "utf8")).toBe("o1\no2\n");
  expect(readFileSync(err, "utf8")).toBe("e1\n");
  // A log path used again starts empty.
  await runCommand("echo again", { cwd: dir, timeoutMs: 5000, logPath: out });
  expect(readFileSync(out, "utf8")).toBe("again\n");
  // A leak would keep one descriptor or two per run.
  const before = descriptors();
  for (let i = 0; i < 100; i++)
    await runCommand("true", {
      cwd: dir,
      timeoutMs: 5000,
      logPath: join(dir, "logs", "leak.txt"),
      stderrLogPath: join(dir, "logs", "leak-err.txt"),
    });
  expect(descriptors() - before).toBeLessThan(20);
}, 60_000);

test("2026-11-10-001 AC-3: a run resolves when its command exits although a descendant still holds the output, and what the descendant writes later lands in the log", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "background.txt");
  const started = Date.now();
  const result = await runCommand("(sleep 2; echo late) & echo now", {
    cwd: dir,
    timeoutMs: 10_000,
    logPath: log,
  });
  // Under half of the descendant's two seconds.
  expect(Date.now() - started).toBeLessThan(1000);
  expect(result).toMatchObject({ exit: 0, timedOut: false, tail: "now" });
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline && !readFileSync(log, "utf8").includes("late"))
    await new Promise((r) => setTimeout(r, 50));
  expect(readFileSync(log, "utf8")).toBe("now\nlate\n");
}, 15_000);

test("2026-11-10-001 AC-4: a write to the stdin of a child that has ended, at the return or after it, changes nothing in the result and throws nothing", async () => {
  const dir = tempDir();
  const broken = (): Writable =>
    new Writable({
      write(_chunk, _encoding, next) {
        next(Object.assign(new Error("write EPIPE"), { code: "EPIPE" }));
      },
    });
  // Ended at the return: its stdin refuses every write.
  const refused = broken();
  const endedAtReturn: Spawn = (command, options) => {
    const child = ranInside(command, options);
    return Object.assign(child, { stdin: refused });
  };
  const first = await runCommand("echo out; exit 4", {
    cwd: dir,
    timeoutMs: 5000,
    logPath: join(dir, "logs", "first.txt"),
    stdin: "hello",
    spawn: endedAtReturn,
  });
  expect(first).toMatchObject({ exit: 4, timedOut: false, tail: "out" });
  // Nothing is written to a child that has ended: its stdin is released.
  expect(refused.destroyed).toBe(true);
  // Ended between the return and the write: the write fails, the close comes after.
  const endsBeforeTheWrite: Spawn = (_command, options) => {
    expect((options.stdio as unknown[])[0]).toBe("pipe");
    const child = fakeChild({ stdin: broken() });
    setTimeout(() => child.emit("close", 0, null), 50);
    return child;
  };
  const second = await runCommand("x", {
    cwd: dir,
    timeoutMs: 5000,
    logPath: join(dir, "logs", "second.txt"),
    stdin: "hello",
    spawn: endsBeforeTheWrite,
  });
  expect(second).toMatchObject({ exit: 0, timedOut: false, tail: "" });
  // Long enough for a stream's unhandled error to surface in this row.
  await new Promise((r) => setTimeout(r, 50));
});

test("2026-11-10-001 AC-7: tailOf reads a log's last 40 lines from its end, a log larger than the window included, with no broken character", () => {
  const dir = tempDir();
  const file = (name: string, text: string | Buffer): string => {
    const path = join(dir, name);
    writeFileSync(path, text);
    return path;
  };
  expect(tailOf(join(dir, "absent.txt"))).toEqual([]);
  expect(tailOf(file("empty.txt", ""))).toEqual([]);
  expect(tailOf(file("two.txt", "a\nb\n"))).toEqual(["a", "b"]);
  // A last line with no newline is a line.
  expect(tailOf(file("partial.txt", "a\nb"))).toEqual(["a", "b"]);
  expect(tailOf(file("blank.txt", "a\n\nb\n"))).toEqual(["a", "", "b"]);
  const numbered = (n: number): string =>
    Array.from({ length: n }, (_, i) => `line ${i}`).join("\n");
  expect(tailOf(file("hundred.txt", `${numbered(100)}\n`))).toEqual(
    Array.from({ length: 40 }, (_, i) => `line ${60 + i}`),
  );
  // Larger than the 256 KiB window: 60 000 lines, about 600 KiB.
  const large = tailOf(file("large.txt", `${numbered(60_000)}\n`));
  expect(large).toEqual(Array.from({ length: 40 }, (_, i) => `line ${59_960 + i}`));
  // The window starts inside a two-byte character of a cut line: the cut line goes whole.
  const cut = tailOf(file("cut.txt", `${"é".repeat(200_000)}x\nlast\n`));
  expect(cut).toEqual(["last"]);
  // One line longer than the window: kept from its first whole character.
  const long = tailOf(
    file("long.txt", Buffer.concat([Buffer.from("x"), Buffer.from("é".repeat(200_000))])),
  );
  expect(long.length).toBe(1);
  expect(long[0]).toMatch(/^é+$/);
  expect(Buffer.byteLength(long[0] ?? "")).toBeLessThanOrEqual(256 * 1024);
  expect(Buffer.byteLength(long[0] ?? "")).toBeGreaterThan(256 * 1024 - 4);
});

test("2026-11-10-001 AC-8: a spawn that throws resolves exit null with the error's message in the tail and the log, and leaves no descriptor open", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "thrown.txt");
  const throws: Spawn = () => {
    throw new Error("spawn EAGAIN");
  };
  const result = await runCommand("echo never", {
    cwd: dir,
    timeoutMs: 5000,
    logPath: log,
    events: true,
    spawn: throws,
  });
  expect(result).toMatchObject({ exit: null, timedOut: false, tail: "spawn EAGAIN" });
  expect(readFileSync(log, "utf8")).toBe("spawn EAGAIN\n");
  const lines = eventLines(eventsPathOf(log));
  expect(lines.map((l) => l.name)).toEqual(["start", "error", "resolved"]);
  expect(lines[1]?.text).toMatch(/^error \+\d+ms spawn EAGAIN$/);
  const before = descriptors();
  for (let i = 0; i < 100; i++)
    await runCommand("echo never", {
      cwd: dir,
      timeoutMs: 5000,
      logPath: log,
      stderrLogPath: join(dir, "logs", "thrown-err.txt"),
      spawn: throws,
    });
  expect(descriptors() - before).toBeLessThan(20);
});

test("2026-11-10-001 AC-9: a command that outruns its timeout has its whole group killed and resolves timed out, its tail read from the log", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "outrun.txt");
  const pidFile = join(dir, "child.pid");
  const started = Date.now();
  const result = await runCommand(
    `echo begun; sleep 30 & echo $! > ${pidFile}; sleep 30; echo never`,
    {
      cwd: dir,
      timeoutMs: 300,
      logPath: log,
      events: true,
    },
  );
  expect(Date.now() - started).toBeLessThan(300 + KILL_GRACE_MS);
  expect(result).toMatchObject({ exit: null, timedOut: true, tail: "begun" });
  const names = eventLines(eventsPathOf(log)).map((l) => l.name);
  expect(names).toContain("timeout");
  expect(names).not.toContain("gave up");
  // The background child was in the group the kill reached.
  const pid = Number(readFileSync(pidFile, "utf8").trim());
  const deadline = Date.now() + 2000;
  const alive = (): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  while (Date.now() < deadline && alive()) await new Promise((r) => setTimeout(r, 20));
  expect(alive()).toBe(false);
});

test("2026-11-10-001 AC-8: a stderr log that cannot be opened throws with the log's descriptor closed", () => {
  const dir = tempDir();
  // The stderr log's folder is a file, so its folder cannot be made.
  writeFileSync(join(dir, "blocked"), "a file");
  const run = (): Promise<unknown> =>
    runCommand("echo never", {
      cwd: dir,
      timeoutMs: 5000,
      logPath: join(dir, "logs", "out.txt"),
      stderrLogPath: join(dir, "blocked", "err.txt"),
    });
  expect(run).toThrow();
  const before = descriptors();
  for (let i = 0; i < 100; i++) expect(run).toThrow();
  expect(descriptors() - before).toBeLessThan(20);
});

test("2026-11-10-001 AC-2: a log is opened in append mode, so a writer whose file was emptied under it writes at the end, never at its stale offset", async () => {
  const dir = tempDir();
  const log = join(dir, "logs", "reused.txt");
  // What a process left by an earlier run does to a log path a newer run emptied.
  const staleWriter: Spawn = (_command, options) => {
    const [out] = descriptorsOf(options);
    writeSync(out, "from the earlier run\n");
    writeFileSync(log, "");
    writeSync(out, "late\n");
    return fakeChild({ exitCode: 0 });
  };
  const result = await runCommand("the seam writes", {
    cwd: dir,
    timeoutMs: 5000,
    logPath: log,
    spawn: staleWriter,
  });
  expect(readFileSync(log, "utf8")).toBe("late\n");
  expect(result.tail).toBe("late");
});
