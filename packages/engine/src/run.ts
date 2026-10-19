import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import { dirname } from "node:path";

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

const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh", "fish"]);
const WRAPPERS = new Set(["env", "command"]);
const WRAPPER_VALUE_FLAGS = new Set(["-u", "-C", "-S"]);
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SAFE_WORD = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** One word, quoted for a POSIX shell: a word of safe characters stays as it is, the rest goes in single quotes. */
export function quoteWord(word: string): string {
  return SAFE_WORD.test(word) ? word : `'${word.replace(/'/g, "'\\''")}'`;
}

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
  // A wrapper, its own flags (`env -i`, `command -p`; `-u`, `-C` and `-S` take a value) and any
  // assignments come before the shell's name (the security lead's return at the delivery).
  let i = 0;
  while (i < words.length) {
    const word = words[i] ?? "";
    if (WRAPPERS.has(base(word)) || ASSIGNMENT.test(word)) i += 1;
    else if (i > 0 && word.startsWith("-")) i += WRAPPER_VALUE_FLAGS.has(word) ? 2 : 1;
    else break;
  }
  const name = base(words[i]);
  if (!SHELLS.has(name)) return null;
  let j = i + 1;
  let commandString = false;
  while (j < words.length && (words[j] ?? "").startsWith("-")) {
    if (/^-[A-Za-z]*c[A-Za-z]*$/.test(words[j] ?? "")) commandString = true;
    j += 1;
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
