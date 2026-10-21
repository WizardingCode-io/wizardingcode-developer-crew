import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname } from "node:path";
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
}

export interface RunResult {
  exit: number | null;
  durationMs: number;
  tail: string;
  timedOut: boolean;
}

const TAIL_LINES = 40;

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
  mkdirSync(dirname(options.logPath), { recursive: true });
  const log = createWriteStream(options.logPath);
  let errors: WriteStream | null = null;
  if (options.stderrLogPath) {
    mkdirSync(dirname(options.stderrLogPath), { recursive: true });
    errors = createWriteStream(options.stderrLogPath);
  }
  const lines: string[] = [];
  let partial = "";
  const absorb = (chunk: Buffer, to: WriteStream = log): void => {
    to.write(chunk);
    partial += chunk.toString("utf8");
    const pieces = partial.split("\n");
    partial = pieces.pop() ?? "";
    for (const line of pieces) {
      lines.push(line);
      if (lines.length > TAIL_LINES) lines.shift();
    }
  };
  const started = Date.now();
  return new Promise((resolve) => {
    // A detached child leads its own process group, so the timeout can kill it and everything it started.
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      detached: process.platform !== "win32",
      env: options.env ?? process.env,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, options.timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => absorb(chunk));
    child.stderr?.on("data", (chunk: Buffer) => absorb(chunk, errors ?? log));
    if (options.stdin !== undefined) child.stdin?.end(options.stdin);
    const finish = (exit: number | null): void => {
      clearTimeout(timer);
      if (partial) lines.push(partial);
      log.end();
      errors?.end();
      resolve({
        exit,
        durationMs: Date.now() - started,
        tail: lines.slice(-TAIL_LINES).join("\n"),
        timedOut,
      });
    };
    child.on("error", (error) => {
      absorb(Buffer.from(`${error.message}\n`));
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}
