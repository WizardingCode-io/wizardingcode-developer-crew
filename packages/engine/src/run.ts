import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  logPath: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
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

export function runCommand(command: string, options: RunOptions): Promise<RunResult> {
  mkdirSync(dirname(options.logPath), { recursive: true });
  const log = createWriteStream(options.logPath);
  const lines: string[] = [];
  let partial = "";
  const absorb = (chunk: Buffer): void => {
    log.write(chunk);
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
    child.stdout?.on("data", absorb);
    child.stderr?.on("data", absorb);
    if (options.stdin !== undefined) child.stdin?.end(options.stdin);
    const finish = (exit: number | null): void => {
      clearTimeout(timer);
      if (partial) lines.push(partial);
      log.end();
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
