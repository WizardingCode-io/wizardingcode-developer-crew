import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { gradeConsole, gradeLogs } from "./console.ts";
import { startEnvironment, stopEnvironment } from "./environment.ts";
import { readTextQuietly, writeText } from "./fs.ts";
import { insidePath } from "./mail-status.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { runCommand } from "./run.ts";
import type { GateRun, Profile, Target, WorkItem } from "./types.ts";
import { planLine, sweepLine, sweepStaleFixtureFiles, writeUiPlan } from "./ui.ts";

const LOGS_COMMAND_TIMEOUT_MS = 30_000;
/** A logs value with whitespace or any of these is a command; anything else is a path inside the project. */
const COMMAND_CHARS = /[\s;&|<>$`()*?[\]{}]/;
/** Where the run's artifacts go, relative to the work folder. */
const E2E_DIR = "review/e2e";
/** What an earlier run left: removed before the run, so nothing of it is read as this run's. */
const STALE = ["console.json", "console.jsonl", "logs.txt"];

export const NO_ENVIRONMENT_REASON =
  'no environment in the profile (crew profile set environment.start "<cmd>")';
export const NO_E2E_REASON = 'no e2e command (crew profile set e2e "<cmd>")';

/** Where the environment's logs come from: nothing, a command whose output is read, or a file read from the size it had (each variant carries what its reader needs). */
type LogsSource =
  | { kind: "none"; note: null }
  | { kind: "command"; value: string; note: null }
  | {
      kind: "path";
      value: string;
      /** The real file, or null when it is outside the project or missing (`note` says which). */
      file: string | null;
      note: string | null;
      sizeBefore: number;
    };

/** A path is read only inside the project, by its real path; a command is the profile's own and runs as such. */
function logsSource(root: string, logs: string | undefined): LogsSource {
  if (!logs?.trim()) return { kind: "none", note: null };
  if (COMMAND_CHARS.test(logs)) return { kind: "command", value: logs, note: null };
  const unread = { kind: "path" as const, value: logs, file: null, sizeBefore: 0 };
  const outside = `logs: ${logs} is outside the project; not read`;
  const missing = `logs: ${logs} not found; not read`;
  if (!insidePath(logs)) return { ...unread, note: outside };
  const candidate = join(root, logs);
  if (!existsSync(candidate)) return { ...unread, note: missing };
  let real: string;
  let rootReal: string;
  try {
    real = realpathSync(candidate);
    rootReal = realpathSync(root);
  } catch {
    return { ...unread, note: missing };
  }
  const rel = relative(rootReal, real);
  if (rel === "" || rel.startsWith("..") || rel.startsWith(sep) || !statSync(real).isFile())
    return { ...unread, note: outside };
  return { kind: "path", value: logs, file: real, note: null, sizeBefore: statSync(real).size };
}

/** The bytes a file gained since `from`; a file rotated or truncated meanwhile is read from its start. */
function readSince(file: string, from: number): string {
  const size = statSync(file).size;
  const start = Math.min(from, size);
  const length = size - start;
  if (length <= 0) return "";
  const fd = openSync(file, "r");
  try {
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, start);
    return buffer.toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/**
 * The logs the run produced, written to `logsFile`: a path is read from where it stood before the
 * run; a command runs from the root with its stdout alone in the file (its stderr beside the e2e
 * log) and its exit code never in the verdict. Null when the profile names no readable logs.
 */
async function readLogs(
  paths: CrewPaths,
  work: WorkItem,
  logs: LogsSource,
  logsFile: string,
  log: string,
): Promise<string | null> {
  if (logs.kind === "path" && logs.file) {
    const text = readSince(logs.file, logs.sizeBefore);
    writeText(logsFile, text);
    return text;
  }
  if (logs.kind === "command") {
    await runCommand(logs.value, {
      cwd: paths.root,
      timeoutMs: LOGS_COMMAND_TIMEOUT_MS,
      logPath: logsFile,
      stderrLogPath: join(workDir(paths, work.id), log.replace(/\.txt$/, "-logs-stderr.txt")),
    });
    return readTextQuietly(logsFile) ?? "";
  }
  return null;
}

export interface E2eInputs {
  paths: CrewPaths;
  work: WorkItem;
  profile: Profile;
  /** The planned target, or null when the profile has none at the planned path. */
  target: Target | null;
  /** The run as `runOne` starts it: unavailable, stamped, nothing run yet. */
  base: GateRun;
  timeoutMs: number;
  /** The log of the e2e command, relative to the work folder. */
  log: string;
}

/**
 * The e2e gate (SP7 §8.2, §8.3, rule 5): the environment up (the user's left alone, else started
 * and awaited), the project's end-to-end command run with the artifact folder and the console file
 * it should write named in its environment, the console and the logs graded as data, the
 * environment stopped when the engine started it. Without an environment or a command the run is
 * unavailable, with the command to set.
 */
export async function runE2e(inputs: E2eInputs): Promise<GateRun> {
  const { paths, work, profile, target, base, timeoutMs, log } = inputs;
  const environment = profile.environment;
  if (!environment) return { ...base, reason: NO_ENVIRONMENT_REASON };
  const command = target?.gates.e2e;
  if (!target || !command) return { ...base, reason: NO_E2E_REASON };
  const dir = join(workDir(paths, work.id), E2E_DIR);
  mkdirSync(dir, { recursive: true });
  for (const name of STALE) {
    try {
      unlinkSync(join(dir, name));
    } catch {
      // nothing of an earlier run
    }
  }
  // The UI evidence's folder and plan for the crew's fixture (SP9 Task 3): an earlier fixture run's
  // files swept, the session's kept; the plan derived from the criteria and the profile, never authored.
  const ui = join(workDir(paths, work.id), "review", "ui");
  mkdirSync(ui, { recursive: true });
  const sweep = sweepStaleFixtureFiles(ui);
  const plan = writeUiPlan(paths, work, profile);
  const started = await startEnvironment(paths, environment);
  if ("refused" in started) return { ...base, reason: started.refused };
  const environmentLine = started.managed
    ? `environment: started by the engine (pid ${started.pid})`
    : "environment: the user's";
  const logs = logsSource(paths.root, environment.logs);
  const begun = Date.now();
  let result: Awaited<ReturnType<typeof runCommand>>;
  let logsText: string | null = null;
  try {
    result = await runCommand(command.command, {
      cwd: join(paths.root, target.path),
      timeoutMs,
      logPath: join(workDir(paths, work.id), log),
      env: {
        ...process.env,
        WIZARDINGCODE_CREW_E2E_DIR: dir,
        WIZARDINGCODE_CREW_CONSOLE_FILE: join(dir, "console.json"),
        WIZARDINGCODE_CREW_UI_DIR: ui,
        WIZARDINGCODE_CREW_UI_PLAN: plan.file,
      },
    });
    logsText = await readLogs(paths, work, logs, join(dir, "logs.txt"), log);
  } finally {
    // What the engine started is stopped whatever the run did (the user's environment is never).
    if (started.managed) await stopEnvironment(paths, environment);
  }
  const consoleGrade = gradeConsole(dir);
  const graded = logsText === null ? null : gradeLogs(logsText);
  // Each line says what its measurement found; the gate's reason is the first offence of the two.
  const consoleOffence =
    consoleGrade.status === "failed"
      ? `console ${consoleGrade.first.type} on ${consoleGrade.first.page}: ${consoleGrade.first.text}`
      : consoleGrade.status === "invalid"
        ? "console file does not parse"
        : null;
  const logsOffence = graded?.status === "failed" ? `logs: ${graded.first}` : null;
  const offence = consoleOffence ?? logsOffence;
  const consoleLine =
    consoleOffence ?? (consoleGrade.status === "none" ? "console: not captured" : "console: clean");
  const logsLine = logsOffence ?? (graded === null ? (logs.note ?? "logs: none") : "logs: clean");
  const passed = result.exit === 0 && !result.timedOut && offence === null;
  return {
    ...base,
    command: command.command,
    commandSource: command.source,
    confirmed: command.source !== "proposed",
    exit: result.exit,
    status: passed ? "pass" : "fail",
    durationMs: Date.now() - begun,
    log,
    tail: [
      result.tail,
      environmentLine,
      consoleLine,
      logsLine,
      planLine(plan.plan) ?? "",
      sweepLine(sweep.skipped) ?? "",
    ]
      .filter((l) => l !== "")
      .join("\n"),
    ...(result.timedOut ? { reason: "timed out" } : offence ? { reason: offence } : {}),
    artifacts: {
      dir: E2E_DIR,
      console:
        consoleGrade.file === null
          ? null
          : `${E2E_DIR}/${consoleGrade.file.endsWith(".jsonl") ? "console.jsonl" : "console.json"}`,
      logs: logsText === null ? null : `${E2E_DIR}/logs.txt`,
    },
  };
}
