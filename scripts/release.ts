import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { nowIso, sha256, writeJson } from "../packages/engine/src/fs.ts";
import { killGroup, processGone, processStart } from "../packages/engine/src/open.ts";
import { resolvePaths } from "../packages/engine/src/paths.ts";
import { loadProfile } from "../packages/engine/src/profile.ts";
import {
  type RecordResult,
  recordReleaseDone,
  recordReleaseStart,
} from "../packages/engine/src/release-record.ts";
import { compareVersions } from "../packages/engine/src/version.ts";
import { improveState } from "./improve-home.ts";

/** The bundle the build writes and the release commits beside the version files. */
const BUNDLE = "plugins/core/dist/crew.mjs";

/**
 * The version files CLAUDE.md's `## Releasing` section names, sorted: its backticked `.json` paths and
 * `version.ts`. The section is the release's list, so the check reads it rather than a copy of it
 * (finding 162).
 */
export function releaseFiles(root: string): string[] {
  const text = readFileSync(join(root, "CLAUDE.md"), "utf8");
  const section = text.slice(text.indexOf("## Releasing"), text.indexOf("## Conventions"));
  const paths = [...section.matchAll(/`([^`\s]+(?:\.json|\/version\.ts))`/g)].map(
    (m) => m[1] as string,
  );
  return [...new Set(paths)].sort();
}

/** The release files under `root` that do not carry `version`: a `.json` by its `version` field, `version.ts` by its `VERSION` constant. */
export function staleReleaseFiles(root: string, version: string): string[] {
  return releaseFiles(root).filter((rel) => {
    const text = readFileSync(join(root, rel), "utf8");
    return rel.endsWith(".json")
      ? (JSON.parse(text) as { version?: unknown }).version !== version
      : !text.includes(`export const VERSION = "${version}";`);
  });
}

export type Bump = "patch" | "minor" | "major" | { version: string };

/** The version after `bump`, or the one given when it is above the current (AC-7). */
export function nextVersion(current: string, bump: Bump): string {
  const [major, minor, patch] = current.split(".").map(Number) as [number, number, number];
  if (typeof bump === "object") {
    if (compareVersions(bump.version, current) <= 0)
      throw new Error(`${bump.version} is not above ${current}`);
    return bump.version;
  }
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

/** The two tests that assert the version by a literal, beside the files CLAUDE.md lists. */
const TEST_LITERALS: [path: string, pattern: (version: string) => RegExp][] = [
  [
    "packages/engine/tests/version.test.ts",
    (v) => new RegExp(`expect\\(VERSION\\)\\.toBe\\("${escapeRegex(v)}"\\)`),
  ],
  [
    "packages/engine/tests/cli.test.ts",
    (v) =>
      new RegExp(
        `\\.run\\("--version"\\)\\)\\.out\\.trim\\(\\)\\)\\.toBe\\("${escapeRegex(v)}"\\)`,
      ),
  ],
];

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One file of a bump's plan: its path from the root and the text the bump gives it. */
export interface PlannedFile {
  rel: string;
  text: string;
}

/** The paths a bump can write, with no version needed: the release files and the two tests' files (2026-11-13-004). */
export function journalPaths(root: string): string[] {
  return [...releaseFiles(root), ...TEST_LITERALS.map(([rel]) => rel)];
}

/**
 * What a bump would write, and nothing written (2026-11-13-004 AC-44): each release file and each
 * test literal with the text `to` gives it, in the order the bump writes them. A test literal whose
 * file is absent, or whose text would not change, is left out.
 */
export function plannedBump(root: string, from: string, to: string): PlannedFile[] {
  const plan: PlannedFile[] = [];
  for (const rel of releaseFiles(root)) {
    const text = readFileSync(join(root, rel), "utf8");
    // The version strings alone, every other byte kept: a re-serialization would reshape the
    // manifests the formatter keeps otherwise, and the check that guards the release would
    // reject its own write (finding 166).
    plan.push({
      rel,
      text: rel.endsWith(".json")
        ? text
            .replace(new RegExp(`("version"\\s*:\\s*")${escapeRegex(from)}(")`), `$1${to}$2`)
            .replace(new RegExp(`("core"\\s*:\\s*">=)${escapeRegex(from)}(")`), `$1${to}$2`)
        : text.replace(`export const VERSION = "${from}";`, `export const VERSION = "${to}";`),
    });
  }
  for (const [rel, pattern] of TEST_LITERALS) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    const next = text.replace(pattern(from), (m) => m.replace(`"${from}"`, `"${to}"`));
    if (next !== text) plan.push({ rel, text: next });
  }
  return plan;
}

/** Writes a bump's plan; returns the files written, in the plan's order. */
export function writePlan(root: string, plan: readonly PlannedFile[]): string[] {
  for (const { rel, text } of plan) writeFileSync(join(root, rel), text);
  return plan.map((f) => f.rel);
}

/**
 * Writes `to` into every release file, the two tests' literals and the packs' `core` bound; returns
 * the files written. A release file still at another version afterwards is the caller's failure
 * (`staleReleaseFiles`).
 */
export function bumpVersion(root: string, from: string, to: string): string[] {
  return writePlan(root, plannedBump(root, from, to));
}

/**
 * What a command ended with. `status` is the exit, or 1 when there is none, as every reader of it
 * expects; `exit` is the exit as it was, null when a signal ended the command or the capture
 * overran, so a failed step names its cause instead of a made-up 1 (finding 217).
 */
export interface CommandResult {
  status: number;
  exit: number | null;
  stdout: string;
  stderr: string;
  signal?: string;
  error?: string;
  /** The command passed the bound it was given and was killed with its process group (2026-11-13-004). */
  timedOut?: boolean;
}

export type CommandRunner = (
  cmd: readonly string[],
  opts: {
    cwd: string;
    env?: Record<string, string>;
    input?: string;
    /** The command's output is a secret (a token): never printed. */
    quiet?: boolean;
    /**
     * The command is killed past this many milliseconds, with the processes of its own group: it
     * runs as the leader of a new one and reads no terminal (2026-11-13-004, D-2).
     */
    timeoutMs?: number;
    /** Where a bounded command writes its pid and start and its starter's while it runs, so the next release can end a command a killed one left (2026-11-13-004). */
    commandFile?: string;
  },
) => CommandResult;

/** The three bounds of a release's commands (2026-11-13-004): a local command, a remote one or a build, the check. */
export const LOCAL_MS = 120_000;
export const REMOTE_OR_BUILD_MS = 300_000;
export const CHECK_MS = 2_700_000;
/** Where a bounded command of the release says who it is while it runs, under the root. */
export const COMMAND_FILE = "dist/release-in-progress.command";

/** The bound of a command of the release, by what it is. */
export function boundOf(cmd: readonly string[]): number {
  const [program, first, second] = cmd;
  if (program === "bun")
    return first === "run" && second === "check" ? CHECK_MS : REMOTE_OR_BUILD_MS;
  if (program === "git")
    return first === "fetch" || first === "ls-remote" || first === "push"
      ? REMOTE_OR_BUILD_MS
      : LOCAL_MS;
  if (program === "gh") return first === "auth" ? LOCAL_MS : REMOTE_OR_BUILD_MS;
  return program === "claude" || program === "tar" ? REMOTE_OR_BUILD_MS : LOCAL_MS;
}

/**
 * What every git command of the release carries, so a credential that would ask fails at once
 * instead of waiting out its bound: no prompt of git's, and ssh in batch mode. The caller's own
 * `GIT_SSH_COMMAND` is left as it is; an ssh command git's configuration names
 * (`core.sshCommand`), which the environment's setting would otherwise replace, is kept with
 * batch mode added.
 */
export function gitEnv(env: NodeJS.ProcessEnv, configured = ""): Record<string, string> {
  return {
    GIT_TERMINAL_PROMPT: "0",
    ...(env.GIT_SSH_COMMAND ? {} : { GIT_SSH_COMMAND: `${configured || "ssh"} -o BatchMode=yes` }),
  };
}

/** The least a runner must do for the token's read: the release's runner and the loop's both do. */
type TokenRunner = (
  cmd: string[],
  opts: { cwd: string; quiet?: boolean; timeoutMs?: number },
) => { status: number; stdout: string; timedOut?: boolean };

/**
 * The named account's token, read quietly (2026-11-13-004): a token when the command exits 0 with
 * an output, none otherwise, and whether the command passed its bound. The one place that says
 * when a token is there, for the release and for the loop's probe; nothing of the command's
 * output or error leaves this function but the token.
 */
export function accountToken(
  run: TokenRunner,
  account: string,
  cwd: string,
): { token: string | null; timedOut: boolean } {
  const r = run(["gh", "auth", "token", "-u", account], { cwd, quiet: true, timeoutMs: LOCAL_MS });
  return {
    token: r.status === 0 ? r.stdout.trim() || null : null,
    timedOut: r.timedOut === true,
  };
}

/** Where a release that is not a dry run keeps what it is about to write, under the root, until its push or its rollback. */
export const JOURNAL = "dist/release-in-progress.journal";

/**
 * A release's journal (2026-11-13-004, D-1): written before step 1 writes anything, so the next new
 * release can put back what a killed one left. It records no commit: the release's commit is
 * recognised by its parent, its subject and its paths. It holds no secret.
 */
export interface Journal {
  version: string;
  tag: string;
  title: string;
  /** `HEAD` when the release started. */
  head: string;
  pid: number;
  /** The release's process's start, as the engine reads it: with the pid, the process's identity. */
  processStart: string;
  writtenAt: string;
  /** Each file step 1 writes, with the sha256 of the text it writes. */
  files: Record<string, string>;
  /** The bundle's sha256 after the build step. */
  bundle?: string;
}

/** The journal under a root: what it holds as parsed, or why there is nothing to read. */
export function readJournal(root: string): unknown | "absent" | "unparsable" {
  const path = join(root, JOURNAL);
  if (!existsSync(path)) return "absent";
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return "unparsable";
  }
}

/** What a recovery asks of the system about a process: the engine's functions when a field is not given. */
export interface ProcessDeps {
  /** Whether a pid is no process any more. */
  processGone?: (pid: number) => boolean;
  /** A process's start time, empty when it cannot be read. */
  processStart?: (pid: number) => string;
  /** Whether a process leads a process group of its own. */
  groupLeader?: (pid: number) => boolean;
}

/** The process group a process is in, by `ps`; empty when it cannot be read. */
const groupOf = (pid: number): string =>
  spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" }).stdout.trim();
const leadsItsGroup = (pid: number): boolean => groupOf(pid) === String(pid);

/** Removes a file the release left (its journal, its command file, a part-written archive, the lock of a command it killed), whatever sits at its path, and never throws: a removal must not stop a step. */
function removeLeft(path: string): void {
  try {
    rmSync(path, { force: true, recursive: true });
  } catch {
    // What could not be removed is read again, and judged again, by the next release.
  }
}

/** What a command file says: the command's pid and start, and those of the release that started it. */
export interface CommandFile {
  pid: number;
  start: string;
  releasePid: number;
  releaseStart: string;
}

/**
 * The command file under a root (2026-11-13-004): its four values, or why there are none. Its
 * shape is checked before anything is done with it, since a pid from it can reach a signal: four
 * lines, each id decimal digits alone and above 1 (0, 1 and a negative number never pass), each
 * start time not empty.
 */
export function readCommandFile(root: string): "absent" | "off-shape" | CommandFile {
  const path = join(root, COMMAND_FILE);
  if (!existsSync(path)) return "absent";
  let lines: string[];
  try {
    lines = readFileSync(path, "utf8")
      .replace(/\n$/, "")
      .split("\n")
      .map((l) => l.trim());
  } catch {
    return "off-shape";
  }
  const [pid, start, releasePid, releaseStart] = lines as [string, string, string, string];
  const id = (text: string) => /^[0-9]{1,10}$/.test(text) && Number(text) > 1;
  if (lines.length !== 4 || !id(pid) || !id(releasePid) || !start || !releaseStart)
    return "off-shape";
  return { pid: Number(pid), start, releasePid: Number(releasePid), releaseStart };
}

/**
 * The command a release that is gone left running, by its pid, or null (2026-11-13-004): the
 * command file has its shape, it names `startedBy` as its release when one is given, and the
 * command passes the check a kill needs, stricter than the one a stop needs: its process is
 * alive, its start time read now is present and equal to the file's, and it leads a process group
 * of its own. Whether the release itself is gone is the caller's question.
 */
export function leftCommand(
  root: string,
  deps: ProcessDeps = {},
  startedBy?: number,
): number | null {
  const file = readCommandFile(root);
  if (typeof file === "string") return null;
  if (startedBy !== undefined && file.releasePid !== startedBy) return null;
  // Never this process, nor the group it is in: a file that names it is no command a release left.
  if (file.pid === process.pid || String(file.pid) === groupOf(process.pid)) return null;
  if ((deps.processGone ?? processGone)(file.pid)) return null;
  const now = (deps.processStart ?? processStart)(file.pid);
  if (!now || now !== file.start) return null;
  return (deps.groupLeader ?? leadsItsGroup)(file.pid) ? file.pid : null;
}

/** What GitHub holds of a version's release: nothing, one published with its archive, one left unfinished (a draft, no archive, an archive still uploading), or no answer that can be read. */
type GithubRelease =
  | { state: "none" | "published" | "unfinished" }
  | { state: "unknown"; why: string };

/** The capture per stream: spawnSync's own 1 MiB stops a check's output with ENOBUFS (finding 217). */
const CAPTURE_BYTES = 64 * 1024 * 1024;
const NAMED_LINES = 20;
const TAIL_LINES = 10;

/** `exit <n>` with the signal and the spawn error when they apply: the first fact of a failed step. */
export function statusLine(r: CommandResult): string {
  return `exit ${r.exit}${r.signal ? `, signal ${r.signal}` : ""}${r.error ? `, ${r.error}` : ""}`;
}

/**
 * The lines of a step's output that name a failure, each trimmed at both ends: bun
 * test's `(fail)` lines and biome's `━━━` headers first, then the `error`, `×`, `✗`, `error TS`
 * and `Found N error` lines, a `(pass)` or `(skip)` line never, each kept once; bun test's `N fail`
 * summary apart, since it must survive the cap; and the output's last lines, which the message
 * prints whatever matched, so a runner with other markers still shows its ending.
 */
export function failureLines(text: string): {
  lines: string[];
  summary: string | null;
  tail: string[];
} {
  const all = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
  const first = all.filter((l) => l.startsWith("(fail)") || l.includes("━━━"));
  const second = all.filter(
    (l) =>
      (/^[×✗]/.test(l) ||
        /^error\b/.test(l) ||
        /\berror TS\d+/.test(l) ||
        /^Found \d+ error/.test(l)) &&
      !/^\((pass|skip)\)/.test(l),
  );
  const summary = [...all].reverse().find((l) => /^\d+ fail$/.test(l)) ?? null;
  return { lines: [...new Set([...first, ...second])], summary, tail: all.slice(-TAIL_LINES) };
}

/** The message a failed step logs: a first line naming the label, the status and the file, then the named lines, the summary and the tail, each indented. */
function failureMessage(
  text: string,
  what: string,
  status: string,
  file: string,
  note = "",
): string {
  const { lines, summary, tail } = failureLines(text);
  const kind = lines.length
    ? "lines that name a failure, then the output's last lines"
    : tail.length
      ? "no line names a failure; the output's last lines"
      : "no output";
  const head = `${what} (${status}): ${kind} (the whole output in ${file})${note}`;
  if (tail.length === 0) return head;
  const body = lines.slice(0, NAMED_LINES);
  if (lines.length > NAMED_LINES) body.push(`… and ${lines.length - NAMED_LINES} more`);
  if (summary) body.push(summary);
  body.push("last lines:", ...tail);
  return [head, ...body.map((l) => `  ${l}`)].join("\n");
}

/**
 * A failed step's whole output, kept under `dist/` (git-ignored, so the rollback leaves it) with
 * the status line in front: the file is written only here, for a failed step, and a write that
 * fails is a note on the message, never a thrown error.
 */
function failedStep(
  root: string,
  file: string,
  r: CommandResult,
  what: string,
  afterMs?: number,
): string {
  const status = statusLine(r);
  const nl = r.stdout && !r.stdout.endsWith("\n") ? "\n" : "";
  let note = "";
  try {
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, file), `${status}\n${r.stdout}${nl}--- stderr ---\n${r.stderr}`);
  } catch (error) {
    note = ` (the output file could not be written: ${(error as Error).message})`;
  }
  const message = failureMessage(`${r.stdout}\n${r.stderr}`, what, status, file, note);
  if (afterMs === undefined) return message;
  // A command killed at its bound says so first; the line it has otherwise follows (2026-11-13-004).
  const [head, ...body] = message.split("\n") as [string, ...string[]];
  return [
    `${what} timed out after ${Math.round(afterMs / 1000)} s`,
    `  ${head}`,
    "  processes that left the command's group may still be running",
    ...body,
  ].join("\n");
}

/**
 * The engine's two records of a release run inside a Claude Code session (finding 219): the
 * start, after the title line, and the end, right after the push; each answers whether it
 * recorded and a text the log carries. Wired by the entry point, by nothing in the loop, and by
 * the tests' fakes.
 */
export interface ReleaseRecord {
  start(version: string): RecordResult;
  done(version: string): RecordResult;
}

export interface ReleaseDeps {
  run: CommandRunner;
  log: (line: string) => void;
  /** Told what the release did, for the loop's state (the pending step after a failure past the push). */
  report?: (outcome: ReleaseOutcome) => void;
  /** The engine's records of the release, when the run is a session's (2026-11-01-003). */
  record?: ReleaseRecord;
  /** The caller's environment, read for its own ssh command; this process's when not given. */
  env?: NodeJS.ProcessEnv;
  /** Whether a pid is no process any more, and a process's start time: the engine's when not given. */
  processGone?: (pid: number) => boolean;
  processStart?: (pid: number) => string;
  /** Whether a process leads its own group, by `ps` when not given. */
  groupLeader?: (pid: number) => boolean;
  /** Ends a process group: the engine's `killGroup` when not given (asked to end, a second, then killed). */
  killGroup?: (pid: number) => void;
  /** How long the release waits for a command it ended to be gone; 10 seconds when not given. */
  leftRunningWaitMs?: number;
  /** How long the release waits before it asks origin a second time for a killed push's tag; 5 seconds when not given. */
  pushSettleMs?: number;
}

export interface ReleaseOptions {
  root: string;
  reason: string;
  /** A new version from the current one; absent with `resume`. */
  bump?: Bump;
  /** The version whose release stopped after its push, resumed from `fromStep` (7 when not given). */
  resume?: string;
  fromStep?: number;
  /** A release the loop's state holds as pending: a new bump is refused until it is resumed (AC-15). */
  pending?: { version: string; failedStep: number } | null;
  /** Where a failure before the push resets the tree: the head the release started from when not given; the loop names the head before its adoption's merge, so the merge goes too. */
  rollbackTo?: string;
  /** The home whose `.local/share/wizardingcode-developer-crew` the tarball refreshes; the user's when not given. */
  home?: string;
  githubAccount?: string;
  /** Lines for the GitHub release's notes beside the reason (the run's gains). */
  notes?: string[];
  dryRun?: boolean;
}

export interface ReleaseOutcome {
  version: string;
  /** 0 when every step ran or was done; 1 otherwise. */
  code: number;
  /** The step that failed, when one did. */
  failedStep: number | null;
  /** True when the failure came after the push: the release is resumed, never redone. */
  pending: boolean;
  /**
   * With `pending`: the commits the caller made for this run are not confirmed to be on origin
   * (2026-11-13-004). The push's outcome is unknown, or the pending version is an earlier run's;
   * a caller that keeps a merge for a pending release takes it back.
   */
  localUnconfirmed?: boolean;
}

export const MARKETPLACE_REPO = "WizardingCode-io/wizardingcode-plugins";
export const MARKETPLACE_FILE = ".claude-plugin/marketplace.json";
export const PLUGIN_NAME = "wizardingcode-developer-crew";
const PUSH_STEP = 6;
const TARBALL_STEP = 7;
/** How long a release waits for a command it ended to be gone. */
const LEFT_RUNNING_WAIT_MS = 10_000;
/** How long a push killed at its bound is given to land before origin is asked a second time. */
const PUSH_SETTLE_MS = 5_000;
const pause = (ms: number): void => {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};
/** The git commands of the release that write the index, and so can leave its lock when killed. */
const INDEX_WRITES = ["add", "commit", "reset", "checkout"];
/** What a stop on a failed git write says of the lock. */
const LOCK_ADVICE =
  "if no git command is running, remove the lock file git names and run the release again";
/** The last step that needs the account's token (the GitHub release is step 8, the marketplace entry step 9). */
const MARKETPLACE_STEP = 9;
/** The thirteen steps by name, for the plan, the log and the loop's report. */
export const RELEASE_STEP_NAMES = [
  "the version files",
  "bun run build",
  "bun run check",
  "bun run plugin:check",
  "the commit and the tag",
  "the push",
  "the tarball",
  "the GitHub release",
  "the marketplace entry",
  "the plugin update here",
  "the local install",
  "the project update",
  "the notification",
] as const;
/** The bound of the project update (step 12): the registry's 45 entries at under 6 s each (the spec's Risks). */
const PROJECT_UPDATE_TIMEOUT_MS = 300_000;
/** The bound of the fleet's dry run, inside the step's bound: a record of what the update will write, never a gate. */
const PROJECT_DRY_RUN_TIMEOUT_MS = 60_000;

/** The marketplace's own version for a plugin version: `2.Y.Z` of our `X.Y.Z`. */
export function marketplaceVersion(version: string): string {
  return `2.${version.split(".").slice(1).join(".")}`;
}

interface Step {
  n: number;
  name: string;
  /** The command the plan prints. */
  command: string;
  /** Whether the step's result already exists (a resume skips it). */
  done?: () => boolean;
  run: () => string | null;
  /** A failure here is logged, never fatal (the notification: the release is out already). */
  soft?: boolean;
}

interface MarketplaceEntry {
  name: string;
  version: string;
  source: { ref: string };
}
interface Marketplace {
  metadata: { version: string };
  plugins: MarketplaceEntry[];
}

/** AppleScript's string: backslashes and double quotes escaped. */
export function appleScriptString(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** The `osascript` command for a notification with a title and a body (AC-10). */
export function notificationCommand(title: string, body: string): string[] {
  return [
    "osascript",
    "-e",
    `display notification "${appleScriptString(body)}" with title "${appleScriptString(title)}"`,
  ];
}

const firstLine = (text: string) => text.trim().split("\n")[0] ?? "";

/**
 * The command a killed release left running (2026-11-13-004), handled at the start of a new
 * release and of a resume: true when the release must stop. A file off its shape is removed. A
 * release that still runs is never touched: this one stops, and the file stays. A command whose
 * release is gone is ended with its group, waited for, and said; a resume then drops its
 * version's archive, which that command may have been writing. In `report` mode nothing is
 * ended or removed.
 */
function endLeftCommand(at: {
  root: string;
  mode: "apply" | "report";
  log: (line: string) => void;
  stopLine: (line: string) => boolean;
  sameProcess: (pid: number, start: string) => "gone" | "same" | "another";
  processes: ProcessDeps;
  kill: (pid: number) => void;
  waitMs: number;
  /** The version a resume resumes, when the run is one. */
  resumed: string | undefined;
}): boolean {
  const { root, mode, log } = at;
  const path = join(root, COMMAND_FILE);
  const file = readCommandFile(root);
  if (file === "absent") return false;
  if (file === "off-shape") {
    if (mode === "apply") {
      removeLeft(path);
      log(`${COMMAND_FILE} is not a release's: removed, nothing killed`);
    }
    return false;
  }
  if (
    file.releasePid !== process.pid &&
    at.sameProcess(file.releasePid, file.releaseStart) === "same"
  )
    return at.stopLine(
      `a release is running (pid ${file.releasePid}): wait for it; if no release is running, delete ${COMMAND_FILE}`,
    );
  const left = leftCommand(root, at.processes);
  if (mode === "report") {
    if (left !== null) log(`would kill the command a killed release left running (pid ${left})`);
    return false;
  }
  if (left !== null) {
    const gone = at.processes.processGone ?? processGone;
    at.kill(left);
    for (const until = Date.now() + at.waitMs; !gone(left) && Date.now() < until; ) pause(100);
    if (!gone(left))
      return at.stopLine(
        `the command a killed release left running (pid ${left}) did not end: nothing put back; end it and run the release again`,
      );
    log(`the command a killed release left running was killed (pid ${left})`);
    if (at.resumed) removeLeft(join(root, "dist", `${PLUGIN_NAME}-${at.resumed}.tar.gz`));
  }
  removeLeft(path);
  return false;
}

/** The first field of a journal that is off its shape, or null (2026-11-13-004): no value of a journal reaches git unless it passed this. */
function journalFault(
  value: unknown,
  root: string,
  git: (...args: string[]) => CommandResult,
): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return "content";
  const j = value as Record<string, unknown>;
  const text = (v: unknown): v is string => typeof v === "string" && !v.startsWith("-");
  if (!text(j.version) || !/^\d+\.\d+\.\d+$/.test(j.version)) return "version";
  if (j.tag !== `v${j.version}`) return "tag";
  if (!text(j.title)) return "title";
  if (!text(j.head) || !/^[0-9a-f]{40}$/.test(j.head)) return "head";
  if (git("cat-file", "-e", `${j.head}^{commit}`).status !== 0) return "head";
  if (typeof j.pid !== "number" || !Number.isInteger(j.pid) || j.pid <= 0) return "pid";
  if (typeof j.processStart !== "string" || j.processStart.startsWith("-")) return "processStart";
  if (!text(j.writtenAt)) return "writtenAt";
  if (typeof j.files !== "object" || j.files === null || Array.isArray(j.files)) return "files";
  const allowed = journalPaths(root);
  for (const [rel, hash] of Object.entries(j.files))
    if (!allowed.includes(rel) || rel.split("/").includes("..") || !text(hash)) return "files";
  if (j.bundle !== undefined && !text(j.bundle)) return "bundle";
  return null;
}

/** The commit a tag points at in an `ls-remote --tags` answer: the peeled line of an annotated tag, the tag's own of a lightweight one; null when the answer has neither. */
function taggedCommit(answer: string, tag: string): string | null {
  const lines = answer.split("\n").map((l) => l.trim().split(/\s+/));
  const of = (ref: string) => lines.find((l) => l[1] === ref)?.[0] ?? null;
  return of(`refs/tags/${tag}^{}`) ?? of(`refs/tags/${tag}`);
}

/**
 * The recovery of a release killed before its push (2026-11-13-004, D-1), run by the next new
 * release before its preconditions: null when the release goes on, or the stop, with what the
 * caller is told when the stop reports. It puts back only a file whose content is exactly what
 * the journal says the release wrote, and the bundle; it takes off `main` only a commit git shows
 * to be the release's (one parent, the journal's head; the journal's title; the journal's paths
 * alone) by a reset that keeps the working tree; anything it cannot tell stops it with nothing
 * changed. In `report` mode (a dry run) it reads the same and changes nothing.
 */
function recoverKilled(at: {
  root: string;
  git: (...args: string[]) => CommandResult;
  log: (line: string) => void;
  mode: "apply" | "report";
  sameProcess: (pid: number, start: string) => "gone" | "same" | "another";
  /** Says a stop; false in a dry run, where the release goes on to print its plan. */
  stopLine: (line: string) => boolean;
}): { report?: ReleaseOutcome } | null {
  const { root, git, log, mode } = at;
  const stop = (line: string, report?: ReleaseOutcome) =>
    at.stopLine(line) ? { ...(report ? { report } : {}) } : null;
  const read = readJournal(root);
  if (read === "absent") return null;
  if (read === "unparsable")
    return stop(
      `${JOURNAL} does not parse: nothing put back; read it, and delete it if it is not a release's`,
    );
  const fault = journalFault(read, root, git);
  if (fault) return stop(`${JOURNAL} has no valid ${fault}: nothing put back`);
  const j = read as Journal;
  const v = j.version;
  // Rule 1: the journal's release is running.
  if (at.sameProcess(j.pid, j.processStart) === "same")
    return stop(
      `release ${v} is running (pid ${j.pid}, written ${j.writtenAt}): wait for it; if no release is running, delete ${JOURNAL}`,
    );
  // Rule 2: the recovery changes something only on main.
  const branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
  if (branch !== "main")
    return stop(
      `a release ${v} was killed before its push: check out main and run the release again; nothing put back on ${branch}`,
    );
  const files = Object.keys(j.files);
  const paths = [...files, BUNDLE];
  const short = (hash: string) => hash.slice(0, 7);
  /** 4a: a commit is the release's by what the journal held before the commit existed. */
  const isReleaseCommit = (commit: string): boolean => {
    const line = git("rev-list", "--parents", "-n", "1", commit).stdout.trim().split(/\s+/);
    if (line.length !== 2 || line[1] !== j.head) return false;
    if (git("log", "-1", "--format=%s", commit).stdout.trim() !== j.title) return false;
    const changed = git("diff", "--name-only", j.head, commit);
    return (
      changed.status === 0 &&
      changed.stdout
        .split("\n")
        .filter(Boolean)
        .every((rel) => paths.includes(rel))
    );
  };
  // Rule 3: the push went through and the kill came after it: the resume's, not the recovery's.
  const asked = git("ls-remote", "--tags", "origin", j.tag, `${j.tag}^{}`);
  if (asked.status !== 0)
    return stop(`origin could not be asked whether release ${v} was pushed: nothing put back`);
  if (asked.stdout.includes(`refs/tags/${j.tag}`)) {
    // The tag counts as the killed release's only by its commit: one of rule 4a's shape.
    const onOrigin = taggedCommit(asked.stdout, j.tag);
    if (onOrigin === null || !isReleaseCommit(onOrigin))
      return stop(
        `the tag ${j.tag} on origin is not the killed release's commit: nothing put back; delete ${JOURNAL} if that release is another's`,
      );
    return stop(
      `release ${v} is on origin and was not finished: resume it with bun scripts/release.ts --resume ${j.tag} --from-step ${PUSH_STEP + 1}`,
      { version: v, code: 1, failedStep: PUSH_STEP + 1, pending: true, localUnconfirmed: true },
    );
  }
  // Rule 4: killed before its push.
  const failed = (what: string, r: CommandResult) =>
    stop(`the recovery could not ${what}: ${firstLine(r.stderr)}; ${LOCK_ADVICE}`);
  const head = git("rev-parse", "HEAD").stdout.trim();
  const atRelease = head !== j.head && isReleaseCommit(head);
  const elsewhere = head !== j.head && !atRelease;
  // 4c: HEAD is somebody's, and something of the killed release is still in the tree.
  const nothingLeft = elsewhere && git("diff", "--quiet", "HEAD", "--", ...paths).status === 0;
  if (elsewhere && !nothingLeft)
    return stop(
      `a release ${v} was killed before its push and HEAD moved since (${short(head)}): nothing put back; put back by hand: git checkout ${j.head} -- ${files.join(" ")}, then delete ${JOURNAL}`,
    );
  // A commit origin/main already holds is never taken off, whatever its shape. The ref is this
  // clone's own, as fresh as its last fetch or push: rule 3's ask of origin above is the live check.
  if (atRelease && git("merge-base", "--is-ancestor", head, "origin/main").status === 0)
    return stop(
      `the commit ${short(head)} has the shape of release ${v}'s and is on origin/main: nothing put back; delete ${JOURNAL} if that release is finished`,
    );
  // 4b: the release's own commit comes off main; the working tree is kept and the reflog keeps the commit.
  if (atRelease) {
    if (mode === "report") log(`would take the commit ${short(head)} off main`);
    else {
      const reset = git("reset", "-q", "--mixed", j.head);
      if (reset.status !== 0) return failed(`take the commit ${short(head)} off main`, reset);
      log(`the commit ${short(head)} of release ${v} is off main, kept in the reflog`);
    }
  }
  // 4d: the killed release's tag, when it points at the release's commit.
  const tagged = git("rev-parse", "-q", "--verify", `refs/tags/${j.tag}^{commit}`);
  if (mode === "apply" && tagged.status === 0) {
    const target = tagged.stdout.trim();
    if (isReleaseCommit(target)) git("tag", "-d", j.tag);
    else
      log(`the tag ${j.tag} points at ${short(target)}, not at the killed release's commit: left`);
  }
  // 4e: nothing of the killed release is left (the loop's clone after its reset).
  if (nothingLeft) {
    if (mode === "report") {
      log("would remove the journal: nothing of the killed release is left");
      return null;
    }
    removeLeft(join(root, JOURNAL));
    log(
      `release ${v} was killed before its push and nothing of it is left: its journal is removed`,
    );
    return null;
  }
  // 4f: each file the release wrote goes back to its content at the head; one changed since stays.
  const putBack: string[] = [];
  const left: string[] = [];
  const present = (rel: string): string | null =>
    existsSync(join(root, rel)) ? sha256(readFileSync(join(root, rel))) : null;
  const differs = (rel: string) => git("diff", "--quiet", j.head, "--", rel).status !== 0;
  for (const rel of files) {
    if (present(rel) === j.files[rel]) {
      if (mode === "apply") {
        const back = git("checkout", j.head, "--", rel);
        if (back.status !== 0) return failed(`put ${rel} back`, back);
      }
      putBack.push(rel);
    } else if (differs(rel)) left.push(rel);
  }
  // The bundle is the build's output, made again by the build: put back even when rebuilt since.
  if (differs(BUNDLE)) {
    const rebuilt = j.bundle !== undefined && present(BUNDLE) !== j.bundle;
    if (mode === "apply") {
      const back = git("checkout", j.head, "--", BUNDLE);
      if (back.status !== 0) return failed(`put ${BUNDLE} back`, back);
    }
    putBack.push(`${BUNDLE}${rebuilt ? " (rebuilt since the release's build)" : ""}`);
  }
  const list = (rels: string[]) => rels.join(", ") || "none";
  if (mode === "report") {
    log(`would put back: ${list(putBack)}`);
    log(`would leave: ${list(left)}`);
    return null;
  }
  // 4g
  removeLeft(join(root, JOURNAL));
  log(
    `release ${v} was killed before its push (written ${j.writtenAt}): put back: ${list(putBack)}`,
  );
  if (left.length)
    log(`left as they are, changed since the release wrote them: ${left.join(", ")}`);
  return null;
}

/**
 * The one release flow (AC-7, AC-15), for a person and for the loop: the preconditions, then twelve
 * steps in order, each stopping the release with nothing after it. A failure before the push puts
 * the tree back where it started (or where `rollbackTo` names) and keeps every branch; a failure
 * after it is resumed from the failed step, each later step skipped when its result already exists.
 * A step that throws is a failed step like any other; a failed notification is not a failed release.
 */
export async function release(options: ReleaseOptions, deps: ReleaseDeps): Promise<number> {
  const { root, reason } = options;
  const { log } = deps;
  const home = options.home ?? homedir();
  const account = options.githubAccount ?? "andreagroferreira";
  const commandFile = join(root, COMMAND_FILE);
  const journalFile = join(root, JOURNAL);
  const startOf = deps.processStart ?? processStart;
  /** The bound each result of the helpers was given: a result from elsewhere (the fleet's two calls) has none, and words its own failure. */
  const bounds = new WeakMap<CommandResult, number>();
  /** The command the helpers ran last and its result: a failed step reads it for the lock a killed index write left. */
  const ran: { last: { cmd: readonly string[]; result: CommandResult } | null } = { last: null };
  const bounded = (
    cmd: string[],
    opts: { env?: Record<string, string>; input?: string; quiet?: boolean },
  ): CommandResult => {
    const boundMs = boundOf(cmd);
    // A dry run writes nothing, a command file included: its commands are the preconditions' reads.
    const result = deps.run(cmd, {
      cwd: root,
      ...opts,
      timeoutMs: boundMs,
      ...(options.dryRun ? {} : { commandFile }),
    });
    ran.last = { cmd, result };
    bounds.set(result, boundMs);
    return result;
  };
  /** The environment of the release's git commands, read once: git's configured ssh command is asked first. */
  let noTerminal: Record<string, string> | null = null;
  const git = (...args: string[]): CommandResult => {
    if (noTerminal === null) {
      const env = deps.env ?? process.env;
      const configured = env.GIT_SSH_COMMAND
        ? ""
        : bounded(["git", "config", "--get", "core.sshCommand"], {
            env: { GIT_TERMINAL_PROMPT: "0" },
          }).stdout.trim();
      noTerminal = gitEnv(env, configured);
    }
    return bounded(["git", ...args], { env: noTerminal });
  };
  const sh = (cmd: string[], env?: Record<string, string>, input?: string, quiet?: boolean) =>
    bounded(cmd, { env, input, quiet });
  const seconds = (ms: number) => Math.round(ms / 1000);
  const fail = (message: string): number => {
    log(message);
    return 1;
  };

  if (!options.resume && !options.bump)
    return fail("a release names --patch, --minor, --major, --version <v> or --resume <v>");
  if (!options.resume && options.pending)
    return fail(
      `release ${options.pending.version} is pending at step ${options.pending.failedStep}: resume it first (bun scripts/release.ts --resume v${options.pending.version} --from-step ${options.pending.failedStep})`,
    );
  const goneNow = deps.processGone ?? processGone;
  /** Tells the caller what the release did, and answers its exit code. */
  const report = (o: ReleaseOutcome): number => {
    deps.report?.(o);
    return o.code;
  };
  /**
   * Whether a recorded process is still that process, by the rule a stop needs (the engine's for a
   * session's pid): gone; the same when its start time is the recorded one or either cannot be
   * read; another process otherwise.
   */
  const sameProcess = (pid: number, start: string): "gone" | "same" | "another" => {
    if (goneNow(pid)) return "gone";
    const now = startOf(pid);
    return !now || !start || now === start ? "same" : "another";
  };
  const mode = options.dryRun ? "report" : "apply";
  /**
   * A notification under a title: `crew release` for a stop before the version is known, the
   * version's once it is. Sent with its bound and no command file: a notification is no command of the release's work,
   * and through the file it would replace, then remove, the record of a release that is running
   * when this one only stops beside it.
   */
  const notifyAs = (title: string, body: string): CommandResult => {
    const result = deps.run(notificationCommand(title, body), { cwd: root, timeoutMs: LOCAL_MS });
    bounds.set(result, LOCAL_MS);
    return result;
  };
  /**
   * A stop before step 1: said and notified, since under launchd the log is otherwise the only
   * place it is said; in a dry run said as what the next new release would do, and not a stop.
   */
  const stopLine = (line: string): boolean => {
    if (mode === "report") {
      log(`the next new release would stop: ${line}`);
      return false;
    }
    log(line);
    notifyAs("crew release", line);
    return true;
  };
  // A resume starts at a step after the push: anything else would run the steps before it again.
  if (
    options.resume &&
    options.fromStep !== undefined &&
    !(
      Number.isInteger(options.fromStep) &&
      options.fromStep > PUSH_STEP &&
      options.fromStep <= RELEASE_STEP_NAMES.length
    )
  )
    return fail(
      `--from-step names a step from ${PUSH_STEP + 1} to ${RELEASE_STEP_NAMES.length}, not ${options.fromStep}`,
    );
  // A resume's version names files under dist/: only the version form passes.
  if (options.resume && !/^\d+\.\d+\.\d+$/.test(options.resume))
    return fail(`--resume names a version as X.Y.Z, not ${options.resume}`);

  // The command a killed release left running (2026-11-13-004): read before anything else, by a
  // new release and by a resume, so nothing of a killed run writes while this one works.
  if (
    endLeftCommand({
      root,
      mode,
      log,
      stopLine,
      sameProcess,
      processes: { processGone: goneNow, processStart: startOf, groupLeader: deps.groupLeader },
      kill: deps.killGroup ?? killGroup,
      waitMs: deps.leftRunningWaitMs ?? LEFT_RUNNING_WAIT_MS,
      resumed: options.resume,
    })
  )
    return 1;

  // The recovery of a release killed before its push (2026-11-13-004, D-1): by a new release
  // alone, from the journal, taking from it only what git confirms.
  if (!options.resume) {
    const recovered = recoverKilled({ root, git, log, mode, sameProcess, stopLine });
    if (recovered) {
      if (recovered.report) deps.report?.(recovered.report);
      return 1;
    }
  }

  // The version: a bump from the current one, or the one resumed.
  let version: string;
  let current = "";
  let startHead = "";
  if (options.resume) {
    version = options.resume;
    const tags = git("ls-remote", "--tags", "origin", `v${version}`);
    if (tags.status !== 0 || !tags.stdout.includes(`refs/tags/v${version}`))
      return fail(`v${version} is not on origin; nothing to resume`);
    // Origin has the tag, so a journal of this version has nothing left to put back; one of
    // another version is another release's, and is left.
    const left = readJournal(root);
    if (
      mode === "apply" &&
      typeof left === "object" &&
      left !== null &&
      (left as Journal).version === version
    )
      removeLeft(journalFile);
  } else {
    const branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
    if (branch !== "main") return fail(`the release runs on main, not ${branch}`);
    const status = git("status", "--porcelain").stdout;
    if (status.trim() !== "")
      return fail(
        // A porcelain line is two status columns, a space and the path: read from the line as git printed it.
        `the tree has uncommitted changes (${(status.split("\n")[0] ?? "").slice(3).trim()}): commit or stash them first`,
      );
    const fetched = git("fetch", "-q", "origin", "main");
    if (fetched.status !== 0)
      return fail(
        `origin is not reachable: ${fetched.timedOut ? `timed out after ${seconds(REMOTE_OR_BUILD_MS)} s` : firstLine(fetched.stderr)}`,
      );
    const behind = git("rev-list", "--count", "HEAD..origin/main").stdout.trim();
    if (behind !== "0") return fail(`origin/main is ahead by ${behind} commit(s): pull first`);
    current = (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string })
      .version;
    try {
      version = nextVersion(current, options.bump as Bump);
    } catch (error) {
      return fail((error as Error).message);
    }
    startHead = git("rev-parse", "HEAD").stdout.trim();
  }

  const tag = `v${version}`;
  const archive = join("dist", `${PLUGIN_NAME}-${version}.tar.gz`);
  const notesFile = join("dist", `release-notes-${version}.md`);
  const title = `Release ${version}: ${reason}`;
  const install = join(home, ".local", "share", PLUGIN_NAME);
  let written: string[] = [];
  let plan: PlannedFile[] = [];
  let journal: Journal | null = null;
  let token: string | null = null;
  /** The named account's token, for every GitHub step: never the account active in gh. */
  const readToken = () =>
    accountToken((cmd, opts) => sh(cmd, undefined, undefined, opts.quiet), account, root);
  const githubToken = (): string | null => {
    token ??= readToken().token;
    return token;
  };
  const noTokenMessage = `gh auth token -u ${account} gave no token`;
  let onGithub: GithubRelease | null = null;
  /**
   * What GitHub holds of this version's release: nothing, one published with the archive, one left
   * unfinished, or no answer that can be read, with why. "Nothing" is gh's own `release not found`
   * (gh 2.87.3, read here on 2026-11-13, exit 1); a gh that worded it otherwise would make step 8
   * fail as unread, never delete or create.
   */
  const githubRelease = (): GithubRelease => {
    const t = githubToken();
    if (t === null) return { state: "none" };
    const viewed = sh(["gh", "release", "view", tag, "--json", "isDraft,assets"], { GH_TOKEN: t });
    // gh says a release that does not exist in these words; any other failure (the network, a
    // bound) is no answer, and is never read as "none".
    if (viewed.status !== 0)
      return /release not found/i.test(viewed.stderr)
        ? { state: "none" }
        : {
            state: "unknown",
            why: viewed.timedOut
              ? `timed out after ${seconds(REMOTE_OR_BUILD_MS)} s`
              : firstLine(viewed.stderr),
          };
    let got: { isDraft?: unknown; assets?: unknown };
    try {
      got = JSON.parse(viewed.stdout) as typeof got;
    } catch {
      return { state: "unknown", why: "its answer does not parse" };
    }
    if (typeof got.isDraft !== "boolean" || !Array.isArray(got.assets))
      return { state: "unknown", why: "its answer has no isDraft or no assets" };
    const name = archive.split("/").at(-1);
    // An asset still being uploaded is listed with another state: only an uploaded one counts.
    const uploaded = (got.assets as { name?: unknown; state?: unknown }[]).some(
      (a) => a.name === name && (a.state === undefined || a.state === "uploaded"),
    );
    return { state: !got.isDraft && uploaded ? "published" : "unfinished" };
  };
  /** The marketplace file fetched with the token: the command's result, or the no-token text. */
  const fetchMarketplace = (): CommandResult | string => {
    const t = githubToken();
    if (t === null) return noTokenMessage;
    return sh(["gh", "api", `repos/${MARKETPLACE_REPO}/contents/${MARKETPLACE_FILE}`], {
      GH_TOKEN: t,
    });
  };
  const parseMarketplace = (r: CommandResult): { sha: string; data: Marketplace } => {
    const body = JSON.parse(r.stdout) as { sha: string; content: string };
    return {
      sha: body.sha,
      data: JSON.parse(Buffer.from(body.content, "base64").toString("utf8")) as Marketplace,
    };
  };
  /** The read of step 9's `done`: a failure is one line, since the check decides nothing. */
  const readMarketplace = (): { sha: string; data: Marketplace } | string => {
    const got = fetchMarketplace();
    if (typeof got === "string") return got;
    if (got.status !== 0) return `the marketplace file could not be read: ${firstLine(got.stderr)}`;
    return parseMarketplace(got);
  };
  /** The read of step 9's `run`: a failure is the step's, its output kept (AC-41). */
  const readMarketplaceStep = (): { sha: string; data: Marketplace } | string => {
    const got = fetchMarketplace();
    if (typeof got === "string") return got;
    return ok(got, "the marketplace read", 9) ?? parseMarketplace(got);
  };
  /** The entries released from this repository at this tag: the core and every pack (finding 167). */
  const ours = (data: Marketplace) =>
    data.plugins.filter((p) => p.name === PLUGIN_NAME || p.name.startsWith("wizardingcode-pack-"));
  let marketplace: { sha: string; data: Marketplace } | null = null;
  const outcome = (code: number, failedStep: number | null): number =>
    report({ version, code, failedStep, pending: failedStep !== null && failedStep > PUSH_STEP });
  /** The step's output file, relative to the root, named by the version and the step (AC-40). */
  const stepOutputPath = (step: number) => join("dist", `release-${version}-step-${step}.log`);
  /** Null when the command succeeded; otherwise the failed step's message, its output kept (AC-40). */
  const ok = (r: CommandResult, what: string, step: number): string | null =>
    r.status === 0
      ? null
      : failedStep(root, stepOutputPath(step), r, what, r.timedOut ? bounds.get(r) : undefined);
  /**
   * What step 1 wrote and step 2 built, by hash, so step 5 commits that and nothing else (AC-43):
   * a change to one of these files between the write and the commit would land inside the
   * release's commit, where the engine's end record cannot see it. An absent file is recorded as
   * absent and must still be absent.
   */
  const hashes = new Map<string, string | null>();
  const hashOf = (rel: string): string | null =>
    existsSync(join(root, rel)) ? sha256(readFileSync(join(root, rel))) : null;
  const guardWritten = (): string | null => {
    for (const [rel, hash] of hashes)
      if (hashOf(rel) !== hash) return `changed since the release wrote it: ${rel}`;
    if (options.resume) return null;
    const head = git("rev-parse", "HEAD").stdout.trim();
    return head === startHead ? null : `HEAD moved since the release started: ${head.slice(0, 7)}`;
  };
  /** One of the engine's two records, logged and never fatal: a throw is a failed record, not a failed step. */
  const record = (what: "start" | "done"): boolean => {
    try {
      const r = (deps.record as ReleaseRecord)[what](version);
      log(`  release ${what}: ${r.text}`);
      return r.recorded;
    } catch (error) {
      log(`  release ${what}: failed: ${(error as Error).message}`);
      return false;
    }
  };
  const notify = (body: string) => notifyAs(`crew ${version}`, body);

  // What step 12 did, for the notification: its count line, or why it did not update.
  let projectCounts = "not run";
  const steps: Step[] = [
    {
      n: 1,
      name: RELEASE_STEP_NAMES[0],
      command: `write ${version} into ${releaseFiles(root).length} release files, the two test literals and the packs' core bound`,
      run: () => {
        written = writePlan(root, plan);
        for (const rel of written) hashes.set(rel, hashOf(rel));
        const stale = staleReleaseFiles(root, version);
        return stale.length ? `still at another version: ${stale.join(", ")}` : null;
      },
    },
    {
      n: 2,
      name: RELEASE_STEP_NAMES[1],
      command: "bun run build",
      run: () => {
        const built = ok(sh(["bun", "run", "build"]), "the build", 2);
        if (built) return built;
        const bundleHash = hashOf(BUNDLE);
        hashes.set(BUNDLE, bundleHash);
        if (journal && bundleHash !== null) {
          journal.bundle = bundleHash;
          writeJson(journalFile, journal);
        }
        return null;
      },
    },
    {
      n: 3,
      name: RELEASE_STEP_NAMES[2],
      command: "bun run check",
      run: () => ok(sh(["bun", "run", "check"]), "the check", 3),
    },
    {
      n: 4,
      name: RELEASE_STEP_NAMES[3],
      command: "bun run plugin:check",
      run: () => ok(sh(["bun", "run", "plugin:check"]), "the plugin check", 4),
    },
    {
      n: 5,
      name: RELEASE_STEP_NAMES[4],
      // The files the release wrote and the bundle the build made, nothing else the checks left.
      command: `git add <the version files, the two tests, dist/crew.mjs> && git commit -m "${title}" && git tag -a ${tag} -m "${reason}"`,
      run: () =>
        guardWritten() ??
        ok(
          git("add", "--", ...[...written, BUNDLE].filter((rel) => existsSync(join(root, rel)))),
          "git add",
          5,
        ) ??
        ok(git("commit", "-q", "-m", title), "git commit", 5) ??
        ok(git("tag", "-a", tag, "-m", reason), "git tag", 5),
    },
    {
      n: 6,
      name: RELEASE_STEP_NAMES[5],
      // Atomic: main and the tag land together or not at all.
      command: `git push --atomic origin main ${tag}`,
      run: () => ok(git("push", "-q", "--atomic", "origin", "main", tag), "git push", 6),
    },
    {
      n: 7,
      name: RELEASE_STEP_NAMES[6],
      command: "bun scripts/build.ts --tarball",
      done: () => existsSync(join(root, archive)),
      run: () => ok(sh(["bun", "scripts/build.ts", "--tarball"]), "the tarball", 7),
    },
    {
      n: 8,
      name: RELEASE_STEP_NAMES[7],
      command: `gh release create ${tag} ${archive} --verify-tag --title ${version} --notes-file ${notesFile} with GH_TOKEN from gh auth token -u ${account}`,
      // Done only when GitHub shows the release published with the version's archive: a create
      // killed at its bound can leave a draft, or a release with no archive (2026-11-13-004).
      done: () => {
        onGithub = githubRelease();
        return onGithub.state === "published";
      },
      run: () => {
        const t = githubToken();
        if (t === null) return noTokenMessage;
        // What `done` just read, so GitHub is asked once.
        const held = onGithub ?? githubRelease();
        // An answer that could not be read is a failed step: nothing is deleted or created on it.
        if (held.state === "unknown")
          return `the GitHub release of ${tag} could not be read: ${held.why}`;
        if (held.state === "unfinished") {
          const removed = ok(
            sh(["gh", "release", "delete", tag, "--yes"], { GH_TOKEN: t }),
            "gh release delete",
            8,
          );
          if (removed) return removed;
          log(
            `  the GitHub release of ${tag} was left unfinished: deleted and created again, with this run's notes`,
          );
        }
        mkdirSync(join(root, "dist"), { recursive: true });
        writeFileSync(
          join(root, notesFile),
          `${[`${reason}.`, "", ...(options.notes ?? [])].join("\n").trim()}\n`,
        );
        return ok(
          sh(
            [
              "gh",
              "release",
              "create",
              tag,
              archive,
              "--verify-tag",
              "--title",
              version,
              "--notes-file",
              notesFile,
            ],
            { GH_TOKEN: t },
          ),
          "gh release create",
          8,
        );
      },
    },
    {
      n: 9,
      name: RELEASE_STEP_NAMES[8],
      command: `gh api -X PUT repos/${MARKETPLACE_REPO}/contents/${MARKETPLACE_FILE} (version ${version}, ref ${tag}, metadata ${marketplaceVersion(version)}) with GH_TOKEN from gh auth token -u ${account}`,
      done: () => {
        const read = readMarketplace();
        if (typeof read === "string") return false;
        marketplace = read;
        const entries = ours(read.data);
        return entries.length > 0 && entries.every((p) => p.version === version);
      },
      run: () => {
        const read = marketplace ?? readMarketplaceStep();
        if (typeof read === "string") return read;
        const entries = ours(read.data);
        if (!entries.some((p) => p.name === PLUGIN_NAME))
          return `the marketplace has no entry named ${PLUGIN_NAME}`;
        for (const entry of entries) {
          entry.version = version;
          entry.source.ref = tag;
        }
        read.data.metadata.version = marketplaceVersion(version);
        const t = githubToken() as string;
        const r = sh(
          [
            "gh",
            "api",
            "-X",
            "PUT",
            `repos/${MARKETPLACE_REPO}/contents/${MARKETPLACE_FILE}`,
            "--input",
            "-",
          ],
          { GH_TOKEN: t },
          JSON.stringify({
            message: `${PLUGIN_NAME} ${version}`,
            content: Buffer.from(`${JSON.stringify(read.data, null, 2)}\n`).toString("base64"),
            sha: read.sha,
          }),
        );
        return ok(r, "the marketplace PUT", 9);
      },
    },
    {
      n: 10,
      name: RELEASE_STEP_NAMES[9],
      command: `claude plugin marketplace update wizardingcode-plugins && claude plugin update ${PLUGIN_NAME}@wizardingcode-plugins`,
      run: () =>
        ok(
          sh(["claude", "plugin", "marketplace", "update", "wizardingcode-plugins"]),
          "the marketplace update",
          10,
        ) ??
        ok(
          sh(["claude", "plugin", "update", `${PLUGIN_NAME}@wizardingcode-plugins`]),
          "the plugin update",
          10,
        ),
    },
    {
      n: 11,
      name: RELEASE_STEP_NAMES[10],
      command: `tar xzf ${archive} beside ${install} and swap it in by rename, the replaced install kept as ${install}.previous (skipped when absent)`,
      run: () => {
        const previous = `${install}.previous`;
        // A swap cut between its two renames leaves the previous install and no install (item
        // 2026-11-09-001, AC-30): the previous one is put back and said, and the swap goes on.
        if (!existsSync(install) && existsSync(previous)) {
          renameSync(previous, install);
          log(
            "  11. the local install was missing and its previous one was put back (a swap cut short)",
          );
        }
        if (!existsSync(install)) return null;
        // The staging folders a kill left between an extraction and its removal (item
        // 2026-11-09-003): each entry beside the install whose own name starts with the staging
        // prefix goes, a link unlinked and never followed, and each is said. The install, its
        // previous one and every other name stay.
        const beside = dirname(install);
        const prefix = `.${PLUGIN_NAME}-next-`;
        for (const name of readdirSync(beside).sort()) {
          if (!name.startsWith(prefix)) continue;
          const path = join(beside, name);
          // A leftover that cannot be removed is said and left: housekeeping never stops the swap.
          try {
            const kind = lstatSync(path);
            if (kind.isSymbolicLink()) unlinkSync(path);
            else rmSync(path, { recursive: kind.isDirectory(), force: true });
            log(`  11. removed a staging folder an earlier swap left: ${name}`);
          } catch (error) {
            log(
              `  11. a staging folder could not be removed: ${name} (${(error as Error).message})`,
            );
          }
        }
        // Staged beside the install, on the same device, and put back when the swap fails.
        const staging = mkdtempSync(join(beside, prefix));
        try {
          const extracted = ok(
            sh(["tar", "xzf", join(root, archive), "-C", staging]),
            "the extraction",
            11,
          );
          if (extracted) return extracted;
          // The install already is this release (a resumed step 11, AC-23): the staged bundle and
          // the installed one are the same bytes, and a swap would put the install just made in
          // the place of the rollback target. The bundle alone is compared, since it carries the
          // version: a tarball of the same version cut again with the same bundle is taken as
          // installed, and its other files (bin/, the skills, the agents) are not written again.
          const staged = join(staging, PLUGIN_NAME, "dist", "crew.mjs");
          const installed = join(install, "dist", "crew.mjs");
          if (
            existsSync(staged) &&
            existsSync(installed) &&
            sha256(readFileSync(staged)) === sha256(readFileSync(installed))
          )
            return null;
          rmSync(previous, { recursive: true, force: true });
          renameSync(install, previous);
          try {
            renameSync(join(staging, PLUGIN_NAME), install);
          } catch (error) {
            renameSync(previous, install);
            return `the swap failed and the earlier install is back: ${(error as Error).message}`;
          }
          // The replaced install stays beside the new one, the rollback target until the next
          // release's step 11 replaces it (AC-20).
          return null;
        } finally {
          rmSync(staging, { recursive: true, force: true });
        }
      },
    },
    {
      n: 12,
      name: RELEASE_STEP_NAMES[11],
      command: `node ${install}/dist/crew.mjs projects update --dry-run, then node ${install}/dist/crew.mjs projects update (skipped when absent; 300 s bound)`,
      soft: true,
      run: () => {
        // The adapters of every registered project, refreshed by the bundle step 11 swapped in,
        // so the root they name is the tarball's (item 2026-11-08-002, AC-6; D-3: soft; D-8: an
        // unattended release runs it the same way).
        const bundle = join(install, "dist", "crew.mjs");
        if (!existsSync(bundle)) {
          projectCounts = "skipped (no local install)";
          return null;
        }
        // The fleet's dry run first (item 2026-11-09-003): what the update will write, in the
        // log before it writes. A record, never a gate: the real run starts whatever it did, with
        // what is left of the step's bound.
        const began = Date.now();
        const isCount = (l: string) => /^\d+ updated, /.test(l);
        const dry = deps.run(["node", bundle, "projects", "update", "--dry-run"], {
          cwd: root,
          timeoutMs: PROJECT_DRY_RUN_TIMEOUT_MS,
          commandFile,
          env: { HOME: home },
        });
        const dryLines = dry.stdout.split("\n");
        const dryUser = dryLines.findIndex((l) => l.startsWith("user scope: "));
        for (const l of dryLines.slice(0, dryUser < 0 ? dryLines.length : dryUser))
          if (l.includes(" would update") && !isCount(l)) log(`  12. dry run: ${l}`);
        const dryCount = dryLines.find(isCount);
        if (dryCount) log(`  12. dry run: ${dryCount}`);
        if (dry.signal) log(`  12. dry run: killed by ${dry.signal}`);
        else if (!dryCount) log(`  12. dry run: no count line (exit ${dry.status})`);
        const r = deps.run(["node", bundle, "projects", "update"], {
          cwd: root,
          timeoutMs: Math.max(1, PROJECT_UPDATE_TIMEOUT_MS - (Date.now() - began)),
          commandFile,
          env: { HOME: home },
        });
        const count = r.stdout.split("\n").find(isCount);
        // The project lines come first; the fleet writes the user scope's line as soon as the
        // last project is done, then the count line and the commit lines.
        const userLine = r.stdout.indexOf("user scope: ");
        const printed = (userLine >= 0 ? r.stdout.slice(0, userLine) : r.stdout)
          .split("\n")
          .filter((l) => l.trim() !== "");
        // What a kill leaves (item 2026-11-09-001, AC-17): the notification says only what the
        // output proves. With no user scope line the run may have been cut between two projects
        // or after the last one, so it does not say the rest was not updated. The projects updated
        // before the kill hold the not-committed mark, so their own sessions print the command.
        if (r.signal) {
          const killed = `killed by ${r.signal}`;
          const reminded = "each updated project's sessions print its commit command";
          const listed = "by crew projects update --dry-run";
          // A project the kill may have left written in part holds an unfinished runtime in its
          // mark, when it has a commit to name (item 2026-11-09-003).
          const unfinishedSaid = "a project left unfinished says what to run at its session start";
          if (count) projectCounts = `${count} (${killed} after the count line)`;
          else if (userLine >= 0)
            projectCounts = `cut at the bound (${killed} after every project's line, ${printed.length} of them; the count line was not printed; ${reminded})`;
          else if (printed.length === 0)
            projectCounts = `cut at the bound (${killed} before any project line; the first project listed ${listed} may be written in part and no other is updated; ${unfinishedSaid})`;
          else
            projectCounts = `cut at the bound (${killed} after ${printed.length} project lines, the last one "${(printed.at(-1) ?? "").slice(0, 160)}"; any project listed after it ${listed} may be written in part or not updated; ${reminded}; ${unfinishedSaid})`;
        } else if (count) projectCounts = r.status === 0 ? count : `${count} (exit ${r.status})`;
        else if (r.status === 0) projectCounts = "done";
        else {
          const first = (r.stderr.trim() || r.stdout.trim()).split("\n")[0] ?? "";
          projectCounts = `not updated (${first})`;
        }
        return ok(r, "the project update", 12);
      },
    },
    {
      n: 13,
      name: RELEASE_STEP_NAMES[12],
      command: `osascript: crew ${version}: ${reason}`,
      soft: true,
      run: () =>
        ok(
          notify(`${reason}. Released, published and installed here; projects: ${projectCounts}.`),
          "the notification",
          13,
        ),
    },
  ];

  if (options.dryRun) {
    log(`dry run: ${title}`);
    for (const step of steps) log(`  ${step.n}. ${step.name}: ${step.command}`);
    return 0;
  }
  const from = options.resume ? (options.fromStep ?? PUSH_STEP + 1) : 1;
  // The token before step 1 (2026-11-13-004, finding 212): a run that still has step 8 or 9 ahead
  // reads it now, so a release with none writes and pushes nothing. A resume refused here reports
  // the step it would resume from, so its caller keeps the release pending there.
  if (from <= MARKETPLACE_STEP) {
    const read = readToken();
    token = read.token;
    if (token === null) {
      const cause = read.timedOut ? `timed out after ${seconds(LOCAL_MS)} s` : "gave no token";
      const line = `gh auth token -u ${account} ${cause}: ${options.resume ? "nothing resumed" : "nothing written, nothing pushed by this release"}; log in to that account with gh auth login`;
      log(line);
      notify(line);
      return outcome(1, options.resume ? from : null);
    }
  }
  // The journal before step 1 writes anything (2026-11-13-004, D-1): the whole of it or none.
  if (!options.resume) {
    plan = plannedBump(root, current, version);
    journal = {
      version,
      tag,
      title,
      head: startHead,
      pid: process.pid,
      processStart: startOf(process.pid),
      writtenAt: nowIso(),
      files: Object.fromEntries(plan.map((f) => [f.rel, sha256(f.text)])),
    };
    try {
      writeJson(journalFile, journal);
    } catch (error) {
      const line = `the release's journal could not be written (${(error as Error).message}): nothing written`;
      log(line);
      notify(line);
      return outcome(1, null);
    }
  }
  log(options.resume ? `resuming release ${version} from step ${from}` : title);
  // The engine's start record (2026-11-01-003): a session's run, never a resume (its commit is
  // pushed already); the end is recorded only when this one did.
  const recorded = deps.record && !options.resume ? record("start") : false;
  for (const step of steps) {
    if (step.n < from) continue;
    let error: string | null;
    try {
      if (step.done?.()) {
        log(`  ${step.n}. ${step.name}: done already`);
        continue;
      }
      error = step.run();
    } catch (thrown) {
      error = (thrown as Error).message;
    }
    if (error === null) {
      log(`  ${step.n}. ${step.name}: ok`);
      // The engine's end record (2026-11-01-003), right after the push went through: the pushed
      // commit becomes the session's baseline; a refusal is logged and the release goes on.
      if (step.n === PUSH_STEP) {
        removeLeft(journalFile);
        if (recorded) record("done");
      }
      continue;
    }
    // A failed step's message is several lines (AC-40): the first names the cause, the file and the
    // branch's sentence and is what the notification carries; the body follows on its own lines.
    const [head, ...body] = error.split("\n") as [string, ...string[]];
    if (step.soft) {
      log(`step ${step.n} (${step.name}) failed: ${head} (not fatal: the release is out)`);
      for (const line of body) log(line);
      continue;
    }
    // The lock a timed-out index write of the release left (2026-11-13-004): its group is killed,
    // so the lock is its leftover and is removed. No other lock is ever removed here: a fetch, a
    // push or a failed command takes none, and one found then is somebody else's.
    const failedCommand = ran.last;
    if (
      failedCommand?.result.timedOut &&
      failedCommand.cmd[0] === "git" &&
      INDEX_WRITES.includes(failedCommand.cmd[1] as string)
    ) {
      const lock = git("rev-parse", "--git-path", "index.lock").stdout.trim();
      if (lock) removeLeft(resolve(root, lock));
    }
    if (step.n === PUSH_STEP && !options.resume) {
      // A push that failed or was killed has an outcome nobody knows: origin is asked before
      // anything is reset (2026-11-13-004).
      // The tag counts as this release's only when its commit is the release's own. A push killed
      // at its bound may still land a moment later: an "absent" after such a kill is asked again.
      const own = git("rev-parse", `${tag}^{commit}`).stdout.trim();
      // Both names are asked: the tag's own, and the peeled one that carries an annotated tag's commit.
      const ask = () => git("ls-remote", "--tags", "origin", tag, `${tag}^{}`);
      const landed = (r: CommandResult) => own !== "" && taggedCommit(r.stdout, tag) === own;
      let asked = ask();
      if (asked.status === 0 && !landed(asked) && failedCommand?.result.timedOut) {
        pause(deps.pushSettleMs ?? PUSH_SETTLE_MS);
        asked = ask();
      }
      if (asked.status !== 0) {
        const message = `step ${step.n} (${step.name}) failed: the push's outcome is unknown: origin could not be asked; nothing was reset; run bun scripts/release.ts --resume ${tag} when origin answers: it goes on if the tag is there; if it says there is nothing to resume, the next new release puts the tree back`;
        log(message);
        notify(message);
        return report({
          version,
          code: 1,
          failedStep: PUSH_STEP + 1,
          pending: true,
          localUnconfirmed: true,
        });
      }
      if (landed(asked)) {
        log(`  ${step.n}. ${step.name}: ok (found on origin after the push command failed)`);
        removeLeft(journalFile);
        if (recorded) record("done");
        continue;
      }
    }
    // A part-written archive is never published: the resume builds it again.
    if (step.n === TARBALL_STEP) removeLeft(join(root, archive));
    if (step.n <= PUSH_STEP && !options.resume) {
      // Before the push: the tree back where it started (or before the loop's merge), the tag gone,
      // every branch kept, nothing of the release left.
      const back = options.rollbackTo ?? startHead;
      // What the rollback takes with it, named (2026-11-01-003): a tracked file edited under the
      // release's permit (a file the release wrote counts when its hash moved since the write; the
      // bundle, the build's own output, never), and a commit made since the start, which the reflog
      // alone keeps.
      const headNow = git("rev-parse", "HEAD").stdout.trim();
      const discarded = git("status", "--porcelain")
        .stdout.split("\n")
        .filter((l) => l.length > 3 && !l.startsWith("??"))
        .map((l) => l.slice(3).trim())
        .filter((rel) =>
          // The bundle is the build's own output: named only when it was rebuilt after the build
          // step recorded it (2026-11-13-004, finding 221).
          rel === BUNDLE
            ? hashes.has(BUNDLE) && hashOf(BUNDLE) !== hashes.get(BUNDLE)
            : !hashes.has(rel) || hashOf(rel) !== hashes.get(rel),
        );
      const reset = git("reset", "-q", "--hard", back);
      if (reset.status !== 0) {
        // A rollback that could not reset changes nothing further and keeps the journal, so the
        // next new release puts the tree back; it never says the tree is back.
        const stuck = `the rollback could not put the tree back: ${firstLine(reset.stderr)}; ${LOCK_ADVICE}`;
        log(`step ${step.n} (${step.name}) failed: ${head}`);
        for (const line of body) log(line);
        log(stuck);
        notify(stuck);
        return outcome(1, step.n);
      }
      git("tag", "-d", tag);
      removeLeft(journalFile);
      const message = `step ${step.n} (${step.name}) failed: ${head}; the tree is back at ${back.slice(0, 7)}, nothing released`;
      log(message);
      for (const line of body) log(line);
      if (discarded.length) log(`  discarded by the rollback: ${discarded.join(", ")}`);
      if (headNow !== startHead)
        log(`  the commit ${headNow.slice(0, 7)} is off main, kept in the reflog`);
      notify(message);
      return outcome(1, step.n);
    }
    const message = `step ${step.n} (${step.name}) failed: ${head}`;
    log(message);
    for (const line of body) log(line);
    log(`resume with: bun scripts/release.ts --resume ${tag} --from-step ${step.n}`);
    notify(`${message}; resume with --resume ${tag} --from-step ${step.n}`);
    return outcome(1, step.n);
  }
  log(`released ${version}`);
  return outcome(0, null);
}

/** `bun scripts/release.ts --patch|--minor|--major|--version X.Y.Z --reason "<why>" [--dry-run] | --resume vX.Y.Z [--from-step N] --reason "<why>"` */
export function parseReleaseArgs(argv: readonly string[]): ReleaseOptions | string {
  const options: ReleaseOptions = { root: join(import.meta.dir, ".."), reason: "" };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i] as string;
    const value = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    try {
      if (flag === "--patch" || flag === "--minor" || flag === "--major")
        options.bump = flag.slice(2) as Bump;
      else if (flag === "--version") options.bump = { version: value() };
      else if (flag === "--resume") options.resume = value().replace(/^v/, "");
      else if (flag === "--from-step") options.fromStep = Number(value());
      else if (flag === "--reason") options.reason = value();
      else if (flag === "--root") options.root = value();
      else if (flag === "--dry-run") options.dryRun = true;
      else return `unknown option ${flag}`;
    } catch (error) {
      return (error as Error).message;
    }
  }
  if (!options.reason) return "--reason is required";
  if (!options.bump && !options.resume)
    return "name --patch, --minor, --major, --version <v> or --resume <v>";
  return options;
}

/** A command's three streams: its input when one is given, nothing when it is bounded (no terminal to ask), this process's otherwise. */
export function stdioFor(
  opts: Parameters<CommandRunner>[1],
): ["pipe" | "ignore" | "inherit", "pipe", "pipe"] {
  if (opts.input !== undefined) return ["pipe", "pipe", "pipe"];
  return [opts.timeoutMs ? "ignore" : "inherit", "pipe", "pipe"];
}

/**
 * What starts a bounded command that has a command file (2026-11-13-004): it writes four lines
 * (its own pid and start time, then its starter's, handed to it), beside the file and renamed, and
 * becomes the command, so the first pid is the command's and its group's. The script is this fixed
 * text; the file, the two values and the command's words are its arguments, never part of it.
 */
const WRAPPER =
  'f="$0"; r="$1"; s="$2"; shift 2; printf "%s\\n%s\\n%s\\n%s\\n" "$$" "$(LC_ALL=C TZ=UTC ps -o lstart= -p $$)" "$r" "$s" > "$f.$$" && mv -f "$f.$$" "$f"; exec "$@"';

/**
 * A runner through spawnSync: every command with the environment given on top of this process's;
 * `print` shows a command's output as it comes, unless it is a secret's. A command given a bound
 * leads a process group of its own, which is killed whole when it passes the bound (D-2), and
 * reads no terminal; one given none runs as it always did.
 */
export function spawnRunner(print: boolean): CommandRunner {
  let ownStart: string | null = null;
  return (cmd, opts) => {
    const file = opts.timeoutMs ? opts.commandFile : undefined;
    let argv = [...cmd];
    if (file) {
      try {
        mkdirSync(dirname(file), { recursive: true });
      } catch {
        // The wrapper's write fails too, and the command runs all the same.
      }
      ownStart ??= processStart(process.pid);
      argv = ["sh", "-c", WRAPPER, file, String(process.pid), ownStart, ...cmd];
    }
    const r = spawnSync(argv[0] as string, argv.slice(1), {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      input: opts.input,
      encoding: "utf8",
      stdio: stdioFor(opts),
      maxBuffer: CAPTURE_BYTES,
      // SIGKILL at the bound: a leader that ignores a request to end would keep spawnSync waiting.
      ...(opts.timeoutMs
        ? { timeout: opts.timeoutMs, killSignal: "SIGKILL" as const, detached: true }
        : {}),
    });
    const timedOut = (r.error as NodeJS.ErrnoException | undefined)?.code === "ETIMEDOUT";
    if (timedOut && r.pid)
      try {
        process.kill(-r.pid, "SIGKILL");
      } catch {
        // the group is gone already
      }
    if (file) for (const left of [file, `${file}.${r.pid}`]) removeLeft(left);
    if (print && r.stdout && !opts.quiet) process.stdout.write(r.stdout);
    return {
      status: r.status ?? 1,
      exit: r.status,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
      ...(r.signal ? { signal: r.signal } : {}),
      ...(r.error ? { error: r.error.message } : {}),
      ...(timedOut ? { timedOut: true } : {}),
    };
  };
}

/** The runner of a real release by hand: its output shown. */
export const realRunner: CommandRunner = spawnRunner(true);

/**
 * The engine's records wired for a run by hand (2026-11-01-003): the repository's paths are
 * resolved and its profile read, never written, inside each call, so a folder that is no
 * repository, or one with no profile, answers an unrecorded result and a throw is the record's,
 * never the release's; the session is the one Claude Code names in the environment, none when the
 * id is absent or empty.
 */
export function engineRecord(root: string, env: NodeJS.ProcessEnv): ReleaseRecord {
  const call = (what: "start" | "done", version: string): RecordResult => {
    const paths = resolvePaths(root, env);
    if (!paths)
      return {
        recorded: false,
        text: `release ${version}: no record: the repository's paths could not be resolved`,
      };
    const { profile, tampered } = loadProfile(paths);
    if (!profile)
      return {
        recorded: false,
        text: `release ${version}: no record: the repository has no profile`,
      };
    if (tampered)
      return {
        recorded: false,
        text: `release ${version}: no record: the profile changed outside the engine`,
      };
    const session = env.CLAUDE_CODE_SESSION_ID || null;
    return (what === "start" ? recordReleaseStart : recordReleaseDone)(
      paths,
      profile,
      session,
      version,
    );
  };
  return { start: (v) => call("start", v), done: (v) => call("done", v) };
}

/** The deps of a release run by hand: the real runner, the console, and the engine's records from this process's environment. */
export function handDeps(root: string, env: NodeJS.ProcessEnv): ReleaseDeps {
  return { run: realRunner, log: (line) => console.log(line), record: engineRecord(root, env) };
}

if (import.meta.main) {
  const parsed = parseReleaseArgs(process.argv.slice(2));
  if (typeof parsed === "string") {
    console.error(
      `${parsed}\nusage: bun scripts/release.ts --patch|--minor|--major|--version X.Y.Z --reason "<why>" [--dry-run] | --resume vX.Y.Z [--from-step N] --reason "<why>"`,
    );
    process.exit(1);
  }
  const code = await release(
    { ...parsed, pending: improveState(process.env).pendingRelease ?? null },
    handDeps(parsed.root, process.env),
  );
  process.exit(code);
}
