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
import { improveState } from "./improve-home.ts";

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
    if (compare(bump.version, current) <= 0)
      throw new Error(`${bump.version} is not above ${current}`);
    return bump.version;
  }
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function compare(a: string, b: string): number {
  const [x, y] = [a.split(".").map(Number), b.split(".").map(Number)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  return 0;
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

export type CommandRunner = (
  cmd: readonly string[],
  opts: {
    cwd: string;
    env?: Record<string, string>;
    input?: string;
    /** The command's output is a secret (a token): never printed. */
    quiet?: boolean;
  },
) => { status: number; stdout: string; stderr: string };

export interface ReleaseDeps {
  run: CommandRunner;
  log: (line: string) => void;
  /** Told what the release did, for the loop's state (the pending step after a failure past the push). */
  report?: (outcome: ReleaseOutcome) => void;
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
  marketplaceAccount?: string;
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
/** The twelve steps by name, for the plan, the log and the loop's report. */
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
  "the notification",
] as const;

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
  const account = options.marketplaceAccount ?? "andreagroferreira";
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
  const marketplaceToken = (): string | null => {
    if (token !== null) return token;
    const r = sh(["gh", "auth", "token", "-u", account], undefined, undefined, true);
    token = r.status === 0 ? r.stdout.trim() : null;
    return token;
  };
  const readMarketplace = (): { sha: string; data: Marketplace } | string => {
    const t = marketplaceToken();
    if (t === null) return `gh auth token -u ${account} gave no token`;
    const r = sh(["gh", "api", `repos/${MARKETPLACE_REPO}/contents/${MARKETPLACE_FILE}`], {
      GH_TOKEN: t,
    });
    if (r.status !== 0) return `the marketplace file could not be read: ${firstLine(r.stderr)}`;
    const body = JSON.parse(r.stdout) as { sha: string; content: string };
    return {
      sha: body.sha,
      data: JSON.parse(Buffer.from(body.content, "base64").toString("utf8")) as Marketplace,
    };
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
  const ok = (
    r: { status: number; stderr: string; stdout: string },
    what: string,
  ): string | null => (r.status === 0 ? null : `${what}: ${firstLine(r.stderr || r.stdout)}`);
  const notify = (body: string) => sh(notificationCommand(`crew ${version}`, body));

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
        const stale = staleReleaseFiles(root, version);
        return stale.length ? `still at another version: ${stale.join(", ")}` : null;
      },
    },
    {
      n: 2,
      name: RELEASE_STEP_NAMES[1],
      command: "bun run build",
      run: () => ok(sh(["bun", "run", "build"]), "the build"),
    },
    {
      n: 3,
      name: RELEASE_STEP_NAMES[2],
      command: "bun run check",
      run: () => ok(sh(["bun", "run", "check"]), "the check"),
    },
    {
      n: 4,
      name: RELEASE_STEP_NAMES[3],
      command: "bun run plugin:check",
      run: () => ok(sh(["bun", "run", "plugin:check"]), "the plugin check"),
    },
    {
      n: 5,
      name: RELEASE_STEP_NAMES[4],
      // The files the release wrote and the bundle the build made, nothing else the checks left.
      command: `git add <the version files, the two tests, dist/crew.mjs> && git commit -m "${title}" && git tag -a ${tag} -m "${reason}"`,
      run: () =>
        ok(
          git(
            "add",
            "--",
            ...[...written, "plugins/core/dist/crew.mjs"].filter((rel) =>
              existsSync(join(root, rel)),
            ),
          ),
          "git add",
        ) ??
        ok(git("commit", "-q", "-m", title), "git commit") ??
        ok(git("tag", "-a", tag, "-m", reason), "git tag"),
    },
    {
      n: 6,
      name: RELEASE_STEP_NAMES[5],
      // Atomic: main and the tag land together or not at all.
      command: `git push --atomic origin main ${tag}`,
      run: () => ok(git("push", "-q", "--atomic", "origin", "main", tag), "git push"),
    },
    {
      n: 7,
      name: RELEASE_STEP_NAMES[6],
      command: "bun scripts/build.ts --tarball",
      done: () => existsSync(join(root, archive)),
      run: () => ok(sh(["bun", "scripts/build.ts", "--tarball"]), "the tarball"),
    },
    {
      n: 8,
      name: RELEASE_STEP_NAMES[7],
      command: `gh release create ${tag} ${archive} --verify-tag --title ${version} --notes-file ${notesFile}`,
      done: () => sh(["gh", "release", "view", tag]).status === 0,
      run: () => {
        mkdirSync(join(root, "dist"), { recursive: true });
        writeFileSync(
          join(root, notesFile),
          `${[`${reason}.`, "", ...(options.notes ?? [])].join("\n").trim()}\n`,
        );
        return ok(
          sh([
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
          ]),
          "gh release create",
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
        const read = marketplace ?? readMarketplace();
        if (typeof read === "string") return read;
        const entries = ours(read.data);
        if (!entries.some((p) => p.name === PLUGIN_NAME))
          return `the marketplace has no entry named ${PLUGIN_NAME}`;
        for (const entry of entries) {
          entry.version = version;
          entry.source.ref = tag;
        }
        read.data.metadata.version = marketplaceVersion(version);
        const t = marketplaceToken() as string;
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
        return ok(r, "the marketplace PUT");
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
        ) ??
        ok(
          sh(["claude", "plugin", "update", `${PLUGIN_NAME}@wizardingcode-plugins`]),
          "the plugin update",
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
      command: `osascript: crew ${version}: ${reason}`,
      soft: true,
      run: () =>
        ok(notify(`${reason}. Released, published and installed here.`), "the notification"),
    },
  ];

  if (options.dryRun) {
    log(`dry run: ${title}`);
    for (const step of steps) log(`  ${step.n}. ${step.name}: ${step.command}`);
    return 0;
  }
  const from = options.resume ? (options.fromStep ?? PUSH_STEP + 1) : 1;
  log(options.resume ? `resuming release ${version} from step ${from}` : title);
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
      continue;
    }
    if (step.soft) {
      log(`  ${step.n}. ${step.name}: ${error} (not fatal: the release is out)`);
      continue;
    }
    if (step.n <= PUSH_STEP && !options.resume) {
      // Before the push: the tree back where it started (or before the loop's merge), the tag gone,
      // every branch kept, nothing of the release left.
      const back = options.rollbackTo ?? startHead;
      git("reset", "-q", "--hard", back);
      git("tag", "-d", tag);
      const message = `step ${step.n} (${step.name}) failed: ${error}; the tree is back at ${back.slice(0, 7)}, nothing released`;
      log(message);
      notify(message);
      return outcome(1, step.n);
    }
    const message = `step ${step.n} (${step.name}) failed: ${error}`;
    log(message);
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
    });
    if (print && r.stdout && !opts.quiet) process.stdout.write(r.stdout);
    return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  };
}

/** The runner of a real release by hand: its output shown. */
export const realRunner: CommandRunner = spawnRunner(true);

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
    { run: realRunner, log: (line) => console.log(line) },
  );
  process.exit(code);
}
