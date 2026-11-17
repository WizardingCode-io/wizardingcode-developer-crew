// The design-detect gate (item 2026-11-17-001; the frontend team's definition, section 5, rules 6
// and 9): impeccable's detector, a third party's command-line tool, run over the interface files a
// change holds. The engine decides what runs and where: the pinned version from the public
// registry, in an empty folder outside the project, with a named minimum of the environment. It
// reads standard output alone and prints nothing of the detector's but a rule id, a path and a line.

import {
  closeSync,
  mkdtempSync,
  openSync,
  readSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import type { CrewPaths } from "./paths.ts";
import { workDir } from "./paths.ts";
import { isInterfacePath } from "./paths-kind.ts";
import { onPath } from "./pdf.ts";
import { quotedText } from "./quote.ts";
import { runCommand, shellWord } from "./run.ts";
import type { GateStatus, WorkItem } from "./types.ts";

/** The detector's version: a new one enters with a release of the crew, never by itself. */
export const DETECTOR_VERSION = "4.9.2";
/** The public registry, named on the command so that no configuration of a project renames the package. */
export const DETECTOR_REGISTRY = "https://registry.npmjs.org/";
/** The gate's own bound: the first run downloads the package. */
export const DETECT_TIMEOUT_MS = 180_000;
/** Standard output past this size is not read. */
export const DETECT_OUTPUT_MAX = 2 * 1024 * 1024;
/** How many findings the gate's output names before it counts the rest. */
const LISTED = 10;

/**
 * What of the caller's environment reaches the detector, each only when the caller holds it: where
 * commands and the person's npm cache are found, the proxy, and what Windows needs to start a
 * process. Nothing else does: no secret of the session, and no variable that names another engine
 * or another registry.
 */
export const DETECT_ENV_KEYS: readonly string[] = [
  "PATH",
  "HOME",
  "TMPDIR",
  "LANG",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "npm_config_cache",
  "APPDATA",
  "LOCALAPPDATA",
  "USERPROFILE",
  "SystemRoot",
  "ComSpec",
  "PATHEXT",
];

/**
 * The detector's environment: the named minimum of the caller's, then the two variables the
 * definition asks for. Every run of the third party's code takes it from here: the gate's, and the
 * eval runner's when it fills its cache.
 */
export function detectEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const own: NodeJS.ProcessEnv = {};
  for (const key of DETECT_ENV_KEYS) if (env[key] !== undefined) own[key] = env[key];
  own.DO_NOT_TRACK = "1";
  own.IMPECCABLE_PRO = "off";
  return own;
}

/** The interface files of a change that exist: what the detector can read. */
export function detectableFiles(root: string, files: readonly string[]): string[] {
  return files.filter((file) => isInterfacePath(file) && isFile(join(root, file)));
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function real(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function under(folder: string, root: string): boolean {
  return folder === root || folder.startsWith(root + sep);
}

/**
 * An empty folder of the engine's own for the run, never the project's root or under it: there the
 * project's `node_modules` and `.npmrc` are not read. The caller's temporary folder when it lies
 * outside the project, else the system's; null when neither does.
 */
function runFolder(root: string, env: NodeJS.ProcessEnv): string | null {
  const projectRoot = real(root) ?? root;
  for (const base of [env.TMPDIR, tmpdir()]) {
    const folder = base ? real(base) : null;
    if (!folder || under(folder, projectRoot)) continue;
    try {
      return mkdtempSync(join(folder, "crew-design-detect-"));
    } catch {
      // The next base.
    }
  }
  return null;
}

/** The command line: every word the engine's, each file one word. */
function detectCommand(absolute: readonly string[]): string {
  return [
    "npx",
    "--yes",
    // The person's npm cache first, the registry only when the cache holds no such package: a
    // machine needs the network for its first run alone (the eval sandbox reaches no registry).
    "--prefer-offline",
    `--registry=${DETECTOR_REGISTRY}`,
    `impeccable@${DETECTOR_VERSION}`,
    "detect",
    "--json",
    "--no-config",
    ...absolute.map(shellWord),
  ].join(" ");
}

interface Finding {
  rule: string;
  advisory: boolean;
  file: string;
  line: number;
}

/** Standard output as the log holds it, or why it is not read. */
function readOutput(log: string): { text: string } | { reason: string } {
  let size: number;
  try {
    size = statSync(log).size;
  } catch {
    return { reason: "the detector's output could not be read" };
  }
  if (size > DETECT_OUTPUT_MAX) return { reason: "the detector's output is over 2 MB" };
  const buffer = Buffer.alloc(size);
  let fd: number | null = null;
  try {
    fd = openSync(log, "r");
    const read = readSync(fd, buffer, 0, size, 0);
    return { text: buffer.subarray(0, read).toString("utf8") };
  } catch {
    return { reason: "the detector's output could not be read" };
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

/**
 * The findings of an output, or null when it is not a JSON array of findings: each an object with
 * a string rule id (`antipattern`), a string severity, an integer line of 0 or more and a file that
 * is one the gate passed, compared by real path.
 */
function findingsOf(text: string, passed: ReadonlyMap<string, string>): Finding[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  const findings: Finding[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
    const { antipattern, severity, line, file } = entry as Record<string, unknown>;
    if (typeof antipattern !== "string" || antipattern.trim() === "") return null;
    if (typeof severity !== "string") return null;
    if (typeof line !== "number" || !Number.isInteger(line) || line < 0) return null;
    if (typeof file !== "string" || !isAbsolute(file)) return null;
    const known = passed.get(real(file) ?? file);
    if (known === undefined) return null;
    findings.push({ rule: antipattern, advisory: severity === "advisory", file: known, line });
  }
  return findings;
}

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? "" : "s"}`;

export interface DesignDetectRun {
  command: string | null;
  exit: number | null;
  status: GateStatus;
  durationMs: number;
  log: string | null;
  tail: string;
  reason?: string;
}

/**
 * One run of the gate over a change's files (or a todo's). Exit 0 with no finding that counts is a
 * pass; exit 2 with one is a fail that names each; everything else is unavailable with the
 * engine's own reason, and never a pass.
 */
export async function runDesignDetect(options: {
  paths: CrewPaths;
  work: WorkItem;
  files: readonly string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}): Promise<DesignDetectRun> {
  const { paths, work, files } = options;
  const env = options.env ?? process.env;
  const timeoutMs = options.timeoutMs ?? DETECT_TIMEOUT_MS;
  const started = Date.now();
  const targets = detectableFiles(paths.root, files);
  const unavailable = (reason: string, more: Partial<DesignDetectRun> = {}): DesignDetectRun => ({
    command: null,
    exit: null,
    log: null,
    ...more,
    status: "unavailable",
    durationMs: Date.now() - started,
    tail: reason,
    reason,
  });
  if (targets.length === 0) return unavailable("no interface file of the change exists");
  if (!onPath("npx", env)) return unavailable("npx not on PATH");
  const folder = runFolder(paths.root, env);
  if (!folder) return unavailable("no temporary folder outside the project");
  // The files as the detector is given them, and as it names them back.
  const passed = new Map<string, string>();
  const absolute: string[] = [];
  for (const file of targets) {
    const path = join(paths.root, file);
    absolute.push(path);
    passed.set(real(path) ?? path, file);
  }
  const command = detectCommand(absolute);
  const log = `logs/design-detect-${Date.now()}.txt`;
  const logPath = join(workDir(paths, work.id), log);
  let result: Awaited<ReturnType<typeof runCommand>>;
  try {
    result = await runCommand(command, {
      cwd: folder,
      timeoutMs,
      logPath,
      stderrLogPath: logPath.replace(/\.txt$/, ".stderr.txt"),
      env: detectEnv(env),
    });
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
  const ran = { command, exit: result.exit, log };
  if (result.timedOut) return unavailable(`the detector did not end in ${timeoutMs / 1000} s`, ran);
  if (result.exit === 1)
    return unavailable(
      "exit 1: a target could not be scanned, or npx could not fetch the package",
      ran,
    );
  if (result.exit !== 0 && result.exit !== 2)
    return unavailable(`exit ${result.exit === null ? "unknown" : result.exit}`, ran);
  const output = readOutput(logPath);
  if ("reason" in output) return unavailable(output.reason, ran);
  const findings = findingsOf(output.text, passed);
  if (!findings) return unavailable("the detector's output could not be read", ran);
  const counted = findings.filter((f) => !f.advisory);
  const advisories = findings.length - counted.length;
  if ((result.exit === 0) !== (counted.length === 0))
    return unavailable(
      `the detector's exit and its output disagree (exit ${result.exit}, ${plural(counted.length, "finding")})`,
      ran,
    );
  const noted = advisories ? `${plural(advisories, "advisory finding")} not listed` : "";
  if (counted.length === 0)
    return {
      ...ran,
      status: "pass",
      durationMs: Date.now() - started,
      tail: [`no finding in ${plural(targets.length, "file")}`, noted].filter(Boolean).join("; "),
    };
  const lines = counted
    .slice(0, LISTED)
    .map(
      (f) =>
        `${quotedText(f.rule)} ${quotedText(relative(paths.root, join(paths.root, f.file)).split(sep).join("/"), 300)}:${f.line}`,
    );
  if (counted.length > LISTED) lines.push(`+${counted.length - LISTED} more`);
  if (noted) lines.push(noted);
  // The line a gate run prints: the first finding and how many more, as the design lint's does.
  const reason = `${lines[0]}${counted.length > 1 ? `, +${counted.length - 1} more` : ""}`;
  return {
    ...ran,
    status: "fail",
    durationMs: Date.now() - started,
    tail: lines.join("\n"),
    reason,
  };
}
