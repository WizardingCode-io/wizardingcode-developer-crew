import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { sha256 } from "../packages/engine/src/fs.ts";
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

/**
 * Writes `to` into every release file, the two tests' literals and the packs' `core` bound; returns
 * the files written. A release file still at another version afterwards is the caller's failure
 * (`staleReleaseFiles`).
 */
export function bumpVersion(root: string, from: string, to: string): string[] {
  const written: string[] = [];
  for (const rel of releaseFiles(root)) {
    const path = join(root, rel);
    if (rel.endsWith(".json")) {
      // The version strings alone, every other byte kept: a re-serialization would reshape the
      // manifests the formatter keeps otherwise, and the check that guards the release would
      // reject its own write (finding 166).
      const text = readFileSync(path, "utf8");
      writeFileSync(
        path,
        text
          .replace(new RegExp(`("version"\\s*:\\s*")${escapeRegex(from)}(")`), `$1${to}$2`)
          .replace(new RegExp(`("core"\\s*:\\s*">=)${escapeRegex(from)}(")`), `$1${to}$2`),
      );
    } else {
      const text = readFileSync(path, "utf8");
      writeFileSync(
        path,
        text.replace(`export const VERSION = "${from}";`, `export const VERSION = "${to}";`),
      );
    }
    written.push(rel);
  }
  for (const [rel, pattern] of TEST_LITERALS) {
    const path = join(root, rel);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    const next = text.replace(pattern(from), (m) => m.replace(`"${from}"`, `"${to}"`));
    if (next !== text) {
      writeFileSync(path, next);
      written.push(rel);
    }
  }
  return written;
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
}

export type CommandRunner = (
  cmd: readonly string[],
  opts: {
    cwd: string;
    env?: Record<string, string>;
    input?: string;
    /** The command's output is a secret (a token): never printed. */
    quiet?: boolean;
    /** The command is killed past this many milliseconds (the project update's bound, item 2026-11-08-002). */
    timeoutMs?: number;
  },
) => CommandResult;

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
function failedStep(root: string, file: string, r: CommandResult, what: string): string {
  const status = statusLine(r);
  const nl = r.stdout && !r.stdout.endsWith("\n") ? "\n" : "";
  let note = "";
  try {
    mkdirSync(join(root, "dist"), { recursive: true });
    writeFileSync(join(root, file), `${status}\n${r.stdout}${nl}--- stderr ---\n${r.stderr}`);
  } catch (error) {
    note = ` (the output file could not be written: ${(error as Error).message})`;
  }
  return failureMessage(`${r.stdout}\n${r.stderr}`, what, status, file, note);
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
}

export const MARKETPLACE_REPO = "WizardingCode-io/wizardingcode-plugins";
export const MARKETPLACE_FILE = ".claude-plugin/marketplace.json";
export const PLUGIN_NAME = "wizardingcode-developer-crew";
const PUSH_STEP = 6;
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
  const git = (...args: string[]) => deps.run(["git", ...args], { cwd: root });
  const sh = (cmd: string[], env?: Record<string, string>, input?: string, quiet?: boolean) =>
    deps.run(cmd, { cwd: root, env, input, quiet });
  const fail = (message: string): number => {
    log(message);
    return 1;
  };

  // The version: a bump from the current one, or the one resumed.
  let version: string;
  let startHead = "";
  if (options.resume) {
    version = options.resume;
    const tags = git("ls-remote", "--tags", "origin", `v${version}`);
    if (tags.status !== 0 || !tags.stdout.includes(`refs/tags/v${version}`))
      return fail(`v${version} is not on origin; nothing to resume`);
  } else {
    if (!options.bump)
      return fail("a release names --patch, --minor, --major, --version <v> or --resume <v>");
    if (options.pending)
      return fail(
        `release ${options.pending.version} is pending at step ${options.pending.failedStep}: resume it first (bun scripts/release.ts --resume v${options.pending.version} --from-step ${options.pending.failedStep})`,
      );
    const branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.trim();
    if (branch !== "main") return fail(`the release runs on main, not ${branch}`);
    const status = git("status", "--porcelain").stdout;
    if (status.trim() !== "")
      return fail(
        `the tree has uncommitted changes (${firstLine(status).slice(3).trim()}): commit or stash them first`,
      );
    const fetched = git("fetch", "-q", "origin", "main");
    if (fetched.status !== 0) return fail(`origin is not reachable: ${firstLine(fetched.stderr)}`);
    const behind = git("rev-list", "--count", "HEAD..origin/main").stdout.trim();
    if (behind !== "0") return fail(`origin/main is ahead by ${behind} commit(s): pull first`);
    const current = (
      JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }
    ).version;
    try {
      version = nextVersion(current, options.bump);
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
  let token: string | null = null;
  /** The named account's token, for every GitHub step: never the account active in gh. */
  const githubToken = (): string | null => {
    if (token !== null) return token;
    const r = sh(["gh", "auth", "token", "-u", account], undefined, undefined, true);
    token = r.status === 0 ? r.stdout.trim() || null : null;
    return token;
  };
  const noTokenMessage = `gh auth token -u ${account} gave no token`;
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
  const outcome = (code: number, failedStep: number | null): number => {
    deps.report?.({
      version,
      code,
      failedStep,
      pending: failedStep !== null && failedStep > PUSH_STEP,
    });
    return code;
  };
  /** The step's output file, relative to the root, named by the version and the step (AC-40). */
  const stepOutputPath = (step: number) => join("dist", `release-${version}-step-${step}.log`);
  /** Null when the command succeeded; otherwise the failed step's message, its output kept (AC-40). */
  const ok = (r: CommandResult, what: string, step: number): string | null =>
    r.status === 0 ? null : failedStep(root, stepOutputPath(step), r, what);
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
  const notify = (body: string) => sh(notificationCommand(`crew ${version}`, body));

  // What step 12 did, for the notification: its count line, or why it did not update.
  let projectCounts = "not run";
  const steps: Step[] = [
    {
      n: 1,
      name: RELEASE_STEP_NAMES[0],
      command: `write ${version} into ${releaseFiles(root).length} release files, the two test literals and the packs' core bound`,
      run: () => {
        const current = (
          JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { version: string }
        ).version;
        written = bumpVersion(root, current, version);
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
        hashes.set(BUNDLE, hashOf(BUNDLE));
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
      done: () => {
        const t = githubToken();
        return t !== null && sh(["gh", "release", "view", tag], { GH_TOKEN: t }).status === 0;
      },
      run: () => {
        const t = githubToken();
        if (t === null) return noTokenMessage;
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
      command: `tar xzf ${archive} beside ${install} and swap it in by rename (skipped when absent)`,
      run: () => {
        if (!existsSync(install)) return null;
        // Staged beside the install, on the same device, and put back when the swap fails.
        const staging = mkdtempSync(join(dirname(install), `.${PLUGIN_NAME}-next-`));
        const previous = `${install}.previous`;
        try {
          const extracted = ok(
            sh(["tar", "xzf", join(root, archive), "-C", staging]),
            "the extraction",
            11,
          );
          if (extracted) return extracted;
          rmSync(previous, { recursive: true, force: true });
          renameSync(install, previous);
          try {
            renameSync(join(staging, PLUGIN_NAME), install);
          } catch (error) {
            renameSync(previous, install);
            return `the swap failed and the earlier install is back: ${(error as Error).message}`;
          }
          rmSync(previous, { recursive: true, force: true });
          return null;
        } finally {
          rmSync(staging, { recursive: true, force: true });
        }
      },
    },
    {
      n: 12,
      name: RELEASE_STEP_NAMES[11],
      command: `node ${install}/dist/crew.mjs projects update (skipped when absent; 300 s bound)`,
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
        const r = deps.run(["node", bundle, "projects", "update"], {
          cwd: root,
          timeoutMs: PROJECT_UPDATE_TIMEOUT_MS,
          env: { HOME: home },
        });
        const count = r.stdout.split("\n").find((l) => /^\d+ updated, /.test(l));
        // The project lines come first, before the user scope's line: what a killed run printed.
        const userLine = r.stdout.indexOf("user scope: ");
        const printed = (userLine >= 0 ? r.stdout.slice(0, userLine) : r.stdout)
          .split("\n")
          .filter((l) => l.trim() !== "").length;
        if (r.signal)
          projectCounts = `not updated (killed by ${r.signal}; ${printed} project lines printed)`;
        else if (count) projectCounts = r.status === 0 ? count : `${count} (exit ${r.status})`;
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
      if (step.n === PUSH_STEP && recorded) record("done");
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
        .filter((rel) => rel !== BUNDLE && (!hashes.has(rel) || hashOf(rel) !== hashes.get(rel)));
      git("reset", "-q", "--hard", back);
      git("tag", "-d", tag);
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

/** A runner through spawnSync: every command with the environment given on top of this process's; `print` shows a command's output as it comes, unless it is a secret's. */
export function spawnRunner(print: boolean): CommandRunner {
  return (cmd, opts) => {
    const r = spawnSync(cmd[0] as string, cmd.slice(1), {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      input: opts.input,
      encoding: "utf8",
      stdio: opts.input === undefined ? ["inherit", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
      maxBuffer: CAPTURE_BYTES,
      ...(opts.timeoutMs ? { timeout: opts.timeoutMs } : {}),
    });
    if (print && r.stdout && !opts.quiet) process.stdout.write(r.stdout);
    return {
      status: r.status ?? 1,
      exit: r.status,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
      ...(r.signal ? { signal: r.signal } : {}),
      ...(r.error ? { error: r.error.message } : {}),
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
