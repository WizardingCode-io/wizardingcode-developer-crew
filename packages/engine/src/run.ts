import { spawn } from "node:child_process";
import { appendFileSync, createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { Writable } from "node:stream";
import {
  COMMAND_WRAPPERS,
  type CommandWrapper,
  quoteWord,
  SHELL_NAMES,
  shellTakesNext,
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

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  logPath: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
  /** Where stderr goes when it must not mix with stdout in the log (the e2e gate grades a logs command's stdout alone); the tail still holds both. */
  stderrLogPath?: string;
  /** The stream a log path is written through: the file's by default; a test passes one whose end is slow, to see the promise wait for it (SP9 Task 10 AC-10). */
  openLog?: (path: string) => Writable;
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

/**
 * How long a run waits for its child's `close` after the timeout's kill: a descendant that left the
 * group keeps the pipes, and a runtime can lose the child's end (finding 220), so the run then
 * resolves timed out instead of hanging.
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

export function runCommand(command: string, options: RunOptions): Promise<RunResult> {
  const open = options.openLog ?? ((path: string): Writable => createWriteStream(path));
  mkdirSync(dirname(options.logPath), { recursive: true });
  const log = open(options.logPath);
  let errors: Writable | null = null;
  if (options.stderrLogPath) {
    mkdirSync(dirname(options.stderrLogPath), { recursive: true });
    errors = open(options.stderrLogPath);
  }
  const lines: string[] = [];
  let partial = "";
  const absorb = (chunk: Buffer, to: Writable = log): void => {
    to.write(chunk);
    partial += chunk.toString("utf8");
    const pieces = partial.split("\n");
    partial = pieces.pop() ?? "";
    for (const line of pieces) {
      lines.push(line);
      if (lines.length > TAIL_LINES) lines.shift();
    }
  };
  const note = eventsWriter(options);
  note(`start ${new Date().toISOString()} ${JSON.stringify(command)}`);
  const started = Date.now();
  const at = (): string => `+${Date.now() - started}ms`;
  return new Promise((resolve) => {
    // A detached child leads its own process group, so the timeout can kill it and everything it started.
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      detached: process.platform !== "win32",
      env: options.env ?? process.env,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    child.on("spawn", () => note(`spawn ${at()} pid ${child.pid}`));
    child.on("exit", (code, signal) => note(`exit ${at()} code ${code} signal ${signal}`));
    for (const [name, stream] of [
      ["stdout", child.stdout],
      ["stderr", child.stderr],
    ] as const) {
      stream?.on("end", () => note(`${name} end ${at()}`));
      stream?.on("close", () => note(`${name} close ${at()}`));
    }
    let timedOut = false;
    let grace: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => {
      timedOut = true;
      if (options.events) note(`probe ${at()} ${probe(child.pid)}`);
      killTree(child.pid);
      note(`timeout ${at()} killed the group`);
      grace = setTimeout(() => {
        note(`gave up ${at()} no close after the kill`);
        // The pipes go first, so nothing a descendant writes later reaches a log stream that
        // finish ends.
        child.stdout?.destroy();
        child.stderr?.destroy();
        finish(null);
      }, KILL_GRACE_MS);
    }, options.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => absorb(chunk));
    child.stderr?.on("data", (chunk: Buffer) => absorb(chunk, errors ?? log));
    if (options.stdin !== undefined) child.stdin?.end(options.stdin);
    // The promise resolves once the log streams have finished, so a caller that reads the log file
    // right after (the deep audit reads a tool's reply from it) finds the whole output: ending the
    // streams and resolving at once left a short file under load (SP9 Task 10). Finished once: the
    // error and close events may both arrive, and the grace after the timeout's kill may end it first.
    let finished = false;
    const finish = (exit: number | null): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      clearTimeout(grace);
      if (partial) lines.push(partial);
      const result = {
        exit,
        durationMs: Date.now() - started,
        tail: lines.slice(-TAIL_LINES).join("\n"),
        timedOut,
      };
      let pending = errors ? 2 : 1;
      const closed = (): void => {
        pending -= 1;
        if (pending > 0) return;
        note(`logs ended ${at()}`);
        resolve(result);
      };
      log.end(closed);
      errors?.end(closed);
    };
    child.on("error", (error) => {
      note(`error ${at()} ${error.message}`);
      absorb(Buffer.from(`${error.message}\n`));
      finish(null);
    });
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
  return /^[A-Za-z0-9_./-]+$/.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`;
}
