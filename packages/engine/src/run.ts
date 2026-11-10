import { type ChildProcess, type SpawnOptions, spawn } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import {
  COMMAND_WRAPPERS,
  type CommandWrapper,
  quoteWord,
  SHELL_NAMES,
  shellTakesNext,
  singleQuoted,
  takesNext,
} from "./shell-words.ts";

/** A wrapper's option that takes the next word: a valued one, or a script option as a word (`-S`) or as a cluster's last letter (`-vS`). */
function wrapperTakesNext(wrapper: CommandWrapper, option: string): boolean {
  if (takesNext(wrapper, option)) return true;
  const scripts = wrapper.scriptOptions ?? [];
  if (scripts.includes(option)) return true;
  if (option.startsWith("--") || option.includes("=")) return false;
  return scripts.some((s) => s.length === 2 && option.endsWith(s.charAt(1)));
}

/** What starts a run's child: the command line and the options `runCommand` built for it. */
export type Spawn = (command: string, options: SpawnOptions) => ChildProcess;

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  logPath: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  /** Where stderr goes when it must not mix with stdout in the log (the e2e gate grades a logs command's stdout alone); the tail still holds both. */
  stderrLogPath?: string;
  /** What starts the child: `node:child_process`'s `spawn` by default; a test passes one whose child has already ended, never ends or throws (finding 220). */
  spawn?: Spawn;
  /** Write the child's events, each with its time, to `eventsPathOf(logPath)` as they come (finding 220). */
  events?: boolean;
}

export interface RunResult {
  exit: number | null;
  durationMs: number;
  tail: string;
  timedOut: boolean;
}

const TAIL_LINES = 40;
/** How much of a log's end the tail is read from, so a log of any size costs the same to finish. */
const TAIL_WINDOW = 256 * 1024;
/**
 * A log is opened empty and in append mode: every write lands at the file's end, so a process an
 * earlier run on the same path left behind cannot write at a stale offset over a newer run's log.
 */
const LOG_FLAGS = constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_APPEND;

/**
 * A log's last lines, at most forty, read from its end; none for a file that cannot be read. A last
 * line with no newline is a line. When the window starts inside the file, the text up to its first
 * newline is a cut line and is dropped; a window with no newline (one line longer than the window)
 * is kept from its first whole character.
 */
export function tailOf(path: string): string[] {
  let fd: number;
  try {
    fd = openSync(path, "r");
  } catch {
    return [];
  }
  try {
    const size = fstatSync(fd).size;
    const buffer = Buffer.alloc(Math.min(size, TAIL_WINDOW));
    let read = 0;
    while (read < buffer.length) {
      const got = readSync(fd, buffer, read, buffer.length - read, size - buffer.length + read);
      if (got === 0) break;
      read += got;
    }
    let from = 0;
    if (size > buffer.length) {
      const newline = buffer.indexOf(10);
      if (newline >= 0) from = newline + 1;
      else while (from < read && ((buffer[from] ?? 0) & 0xc0) === 0x80) from += 1;
    }
    const lines = buffer.subarray(from, read).toString("utf8").split("\n");
    if (lines.at(-1) === "") lines.pop();
    return lines.slice(-TAIL_LINES);
  } catch {
    return [];
  } finally {
    closeSync(fd);
  }
}

/**
 * How long a run waits for its child's `close` after the timeout's kill: a runtime can lose the
 * child's end (finding 220), so the run then resolves timed out instead of hanging.
 */
export const KILL_GRACE_MS = 2000;

/** Whether a process (a pid) or a process group (a negative pid) exists: signal 0, `EPERM` counting as alive. */
function exists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Whether a timed-out child and its group still exist, before the kill: `gone` means the runtime
 * lost an end that came, `alive` that the kill has something to reach (finding 220).
 */
function probe(pid: number | undefined): string {
  if (!pid || process.platform === "win32") return "pid unknown";
  return `pid ${exists(pid) ? "alive" : "gone"} group ${exists(-pid) ? "alive" : "gone"}`;
}

/** Where a run's events go: beside its log, the last extension replaced by `.events.txt` (finding 220). */
export function eventsPathOf(logPath: string): string {
  const name = basename(logPath);
  const ext = extname(name);
  return join(dirname(logPath), `${ext ? name.slice(0, -ext.length) : name}.events.txt`);
}

/**
 * The writer of a run's events file, or one that writes nothing: each line is written at once, so
 * a run whose promise never resolves leaves on disk every event that came; the first truncates. A
 * failed write is swallowed, so the trace can never throw out of a listener, the timer or the run.
 */
function eventsWriter(options: RunOptions): (line: string) => void {
  if (!options.events) return () => {};
  const path = eventsPathOf(options.logPath);
  let first = true;
  return (line) => {
    try {
      if (first) writeFileSync(path, `${line}\n`);
      else appendFileSync(path, `${line}\n`);
    } catch {
      // The trace is a witness, never a cause: the run goes on without it.
    }
    first = false;
  };
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (process.platform === "win32") spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
    else process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone.
    }
  }
}

const WRAPPER_BY_NAME = new Map(COMMAND_WRAPPERS.map((w) => [w.name, w]));
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/**
 * The words after `--` as one command line (finding 91): one word is the command line as given
 * (`-- "a && b"`); several keep their boundaries, each quoted, so `-- sh -c "a && b"` reaches the
 * shell as `sh -c 'a && b'` and not as `sh -c a && b`.
 */
export function joinWords(words: readonly string[]): string {
  if (words.length === 1) return words[0] ?? "";
  return words.map(quoteWord).join(" ");
}

/**
 * Why shell words cannot be recorded, or null: a shell (`sh`, `bash`, `zsh`, `dash`, `ksh`,
 * `fish`, path-qualified or behind `env` or `command`) given `-c` (alone or in a flag cluster, after
 * other flags) and more than one word after it would run the first word as the command and hand
 * the rest to it as parameters, and a green from that proves nothing (finding 91).
 */
export function shellRefusal(words: readonly string[]): string | null {
  const base = (word: string | undefined): string => (word ?? "").split("/").pop() ?? "";
  // A wrapper, its options with their values (`env -u NAME`, `env -iu NAME`, `env --chdir /d`,
  // `env -S "a b"`) and its assignments come before the shell's name (the security lead's return
  // at the delivery). An option is the wrapper's only right after the wrapper or another of its
  // options: after an assignment alone, `-x` is the command (finding 98).
  let i = 0;
  let wrapper: CommandWrapper | null = null;
  while (i < words.length) {
    const word = words[i] ?? "";
    const named = WRAPPER_BY_NAME.get(base(word));
    if (named) {
      wrapper = named;
      i += 1;
    } else if (ASSIGNMENT.test(word)) {
      wrapper = null;
      i += 1;
    } else if (wrapper && word.startsWith("-")) i += wrapperTakesNext(wrapper, word) ? 2 : 1;
    else break;
  }
  const name = base(words[i]);
  if (!SHELL_NAMES.includes(name)) return null;
  // The shell's own options, `-…` and `+…`, some with a value (`-o pipefail`, `-eo pipefail`,
  // `+O extglob`, `--rcfile x`): finding 98's gap stopped at the value and never saw the `-c`.
  let j = i + 1;
  let commandString = false;
  while (j < words.length && /^[-+]/.test(words[j] ?? "")) {
    const option = words[j] ?? "";
    if (/^-[A-Za-z]*c[A-Za-z]*$/.test(option)) commandString = true;
    j += shellTakesNext(option) ? 2 : 1;
  }
  const after = words.length - j;
  if (!commandString || after <= 1) return null;
  return `${after} words follow -c and the shell would run only the first (${words[j]}) with the rest as its parameters: quote the command string as one argument, -- ${name} -c "<command>"`;
}

/**
 * Runs a command line in a shell and resolves with its exit code and the tail of its output.
 *
 * The child writes its output straight to the log by descriptor, and its end is read from its own
 * fields once `spawn()` has returned, then from `close`. Nothing of the result comes from an event
 * a runtime may emit before a listener exists: bun's `spawn()` reaps a child it finds ended and
 * emits its `exit`, its `close` and the end of its pipes before it returns (finding 220). So a run
 * resolves when its command exits, and a process the command left behind can still write to the log
 * after that.
 */
export function runCommand(command: string, options: RunOptions): Promise<RunResult> {
  const spawnChild = options.spawn ?? spawn;
  mkdirSync(dirname(options.logPath), { recursive: true });
  const out = openSync(options.logPath, LOG_FLAGS);
  let err = out;
  if (options.stderrLogPath) {
    try {
      mkdirSync(dirname(options.stderrLogPath), { recursive: true });
      err = openSync(options.stderrLogPath, LOG_FLAGS);
    } catch (error) {
      closeSync(out);
      throw error;
    }
  }
  // The child holds its own copies once it has started; the parent's are closed on every path.
  const release = (): void => {
    closeSync(out);
    if (err !== out) closeSync(err);
  };
  const note = eventsWriter(options);
  note(`start ${new Date().toISOString()} ${JSON.stringify(command)}`);
  const started = Date.now();
  const at = (): string => `+${Date.now() - started}ms`;
  return new Promise((resolve) => {
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let grace: ReturnType<typeof setTimeout> | undefined;
    // Finished once: the error and close events may both arrive, and the grace after the timeout's
    // kill may end the run first. The tail is the log's as it is now, stdout's lines before
    // stderr's when stderr has its own file.
    let finished = false;
    const finish = (exit: number | null): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(grace);
      const lines = tailOf(options.logPath);
      if (options.stderrLogPath) lines.push(...tailOf(options.stderrLogPath));
      const result = {
        exit,
        durationMs: Date.now() - started,
        tail: lines.slice(-TAIL_LINES).join("\n"),
        timedOut,
      };
      note(`resolved ${at()}`);
      resolve(result);
    };
    const fail = (error: Error): void => {
      note(`error ${at()} ${error.message}`);
      try {
        appendFileSync(options.logPath, `${error.message}\n`);
      } catch {
        // The run ends with no child either way; the events file holds the message.
      }
      finish(null);
    };
    let child: ChildProcess;
    try {
      // A detached child leads its own process group, so the timeout can kill it and everything it started.
      child = spawnChild(command, {
        cwd: options.cwd,
        shell: true,
        detached: process.platform !== "win32",
        env: options.env ?? process.env,
        stdio: [options.stdin === undefined ? "ignore" : "pipe", out, err],
      });
    } catch (error) {
      release();
      fail(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    release();
    // A child that has ended refuses the write; the result is the child's, never the pipe's.
    child.stdin?.on("error", () => {});
    if (child.exitCode !== null || child.signalCode !== null) {
      note(`ended at return ${at()} code ${child.exitCode} signal ${child.signalCode}`);
      child.stdin?.destroy();
      finish(child.exitCode);
      return;
    }
    child.on("spawn", () => note(`spawn ${at()} pid ${child.pid}`));
    child.on("exit", (code, signal) => note(`exit ${at()} code ${code} signal ${signal}`));
    timer = setTimeout(() => {
      timedOut = true;
      if (options.events) note(`probe ${at()} ${probe(child.pid)}`);
      killTree(child.pid);
      note(`timeout ${at()} killed the group`);
      grace = setTimeout(() => {
        note(`gave up ${at()} no close after the kill`);
        finish(null);
      }, KILL_GRACE_MS);
    }, options.timeoutMs);
    if (options.stdin !== undefined) child.stdin?.end(options.stdin);
    child.on("error", fail);
    child.on("close", (code, signal) => {
      note(`close ${at()} code ${code} signal ${signal}`);
      finish(code);
    });
  });
}

/**
 * A path or a value as one shell word: as it is when it has only safe characters, in POSIX single
 * quotes otherwise (a `'` inside escaped), so a file name on an implementer's branch or a page's url
 * adds no command to a gate; a name that starts with `-` is written `./<name>` first, so the runner
 * never reads it as an option (finding 56). Shared by the todo's test command and the deep audit.
 */
export function shellWord(path: string): string {
  const word = path.startsWith("-") ? `./${path}` : path;
  return /^[A-Za-z0-9_./-]+$/.test(word) ? word : singleQuoted(word);
}
