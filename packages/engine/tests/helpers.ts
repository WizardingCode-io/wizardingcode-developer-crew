import { spyOn } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  type Stats,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, sep } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import { runGates } from "../src/gates.ts";
import { buildContext } from "../src/hooks/context.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { fileAnswer, fileAnswerBySession, type Progress } from "../src/hooks/subagent-stop.ts";
import type { HookContext, HookPayload } from "../src/hooks/types.ts";
import { learnItem } from "../src/learn.ts";
import { withLock } from "../src/lock.ts";
import { type CrewPaths, resolvePaths, workDir } from "../src/paths.ts";
import { updateState } from "../src/state.ts";
import * as store from "../src/store.ts";
import { TEAMS } from "../src/team.ts";
import type { Mailbox, TeamName, WorkItem } from "../src/types.ts";
import { fileHash, leadHeading } from "../src/validation.ts";
import { addCriterion, addSkip, createWork, loadWork, saveWork } from "../src/work.ts";

const GIT_ENV = {
  GIT_AUTHOR_NAME: "Crew Test",
  GIT_AUTHOR_EMAIL: "crew@test.invalid",
  GIT_COMMITTER_NAME: "Crew Test",
  GIT_COMMITTER_EMAIL: "crew@test.invalid",
};

/**
 * The skill page's ceiling in bytes: every fast-route turn re-reads the page, so 0.4.0's size is
 * the ceiling, and a page that grows past it is trimmed where the fast route does not read
 * (finding #33).
 */
export const SKILL_PAGE_MAX_BYTES = 9254;

/**
 * The fixtures this run made, one set for every module instance that loads this file (the preload
 * and the test files), so the preload removes them all when the run ends (finding 74).
 */
const REGISTRY = "__wizardingcodeCrewTempDirs";
const globals = globalThis as Record<string, unknown>;
if (!(globals[REGISTRY] instanceof Set)) globals[REGISTRY] = new Set<string>();
export const TEMP_DIRS = globals[REGISTRY] as Set<string>;

/** Canonical (symlinks resolved), as the engine names every root: on macOS the temp dir is an alias. Registered for the cleanup at the end of the run. */
export function tempDir(prefix = "crew-"): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  TEMP_DIRS.add(dir);
  return dir;
}

/** A run folder's name: the pid of the process that made it, then what `mkdtemp` adds. */
const RUN_NAME = /^crew-run-(\d+)-/;
/** The folder the run folders live in, beside the system temporary folder. */
const RUNS_HOME = "crew-tests";

/** The current user's id; -1 where the platform has none, which no folder's owner equals. */
function currentUser(): number {
  return process.getuid?.() ?? -1;
}

/** Whether an entry, as `lstat` read it, is a real folder of `owner`'s that group and others cannot write. */
function ownFolder(stat: Stats, owner: number): boolean {
  return stat.isDirectory() && stat.uid === owner && (stat.mode & 0o022) === 0;
}

/** Whether a pid names a live process: signal 0, `EPERM` counting as alive. */
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * The folder a run's own temporary folder is made in (finding 234). A process started from a script
 * pays for every ancestor folder's size, and the system temporary folder is one every project on
 * the machine fills, so the home is `crew-tests` beside it, in its parent. That fixed name is safe
 * only where nobody else can make it first: the parent must be the user's alone and not the
 * filesystem's root, and an existing home a real folder of the user's alone. Anything else answers
 * the temporary folder itself and leaves what it found as it is. `tmp` is canonical; `owner` is the
 * current user unless a row names another. A run started inside a run answers that run's home, so
 * no home is made inside a home.
 */
export function runsHome(tmp: string, owner: number = currentUser()): string {
  const parent = dirname(tmp);
  try {
    if (parent === dirname(parent) || !ownFolder(lstatSync(parent), owner)) return tmp;
    if (basename(parent) === RUNS_HOME && RUN_NAME.test(basename(tmp))) return parent;
    const home = join(parent, RUNS_HOME);
    let found: Stats;
    try {
      found = lstatSync(home);
    } catch {
      mkdirSync(home, { mode: 0o700 });
      return home;
    }
    return ownFolder(found, owner) ? home : tmp;
  } catch {
    return tmp;
  }
}

/**
 * What a run adds to `GIT_CONFIG_PARAMETERS`, the variable git keeps a command's `-c` options in
 * for its children: a value there outranks the repository's, the user's and the system's
 * configuration, so a developer's own settings cannot turn the maintenance back on. git's manual
 * does not describe the variable's format; the row of finding 228 in helpers.test.ts fails the day
 * git stops reading it.
 */
export const NO_GIT_MAINTENANCE = "'maintenance.auto=false'";

/** What a `GIT_TRACE2_EVENT` file says of the git commands traced into it. */
export interface GitTrace {
  /** A `git commit` started: without it a count of zero below would prove nothing. */
  committed: boolean;
  /** The `git maintenance` children those commands started. */
  maintenance: number;
}

/** Reads git's own trace of the commands run with `GIT_TRACE2_EVENT` at `file`. */
export function gitTraceOf(file: string): GitTrace {
  const events = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { event: string; argv?: string[] });
  return {
    committed: events.some((e) => e.event === "start" && e.argv?.includes("commit") === true),
    maintenance: events.filter(
      (e) => e.event === "child_start" && e.argv?.includes("maintenance") === true,
    ).length,
  };
}

/**
 * The run's `GIT_CONFIG_PARAMETERS`, for a test that hands git an environment built from a list of
 * allowed names, where the process's own variable does not arrive; empty outside a run.
 */
export function gitRunEnv(): NodeJS.ProcessEnv {
  const parameters = process.env.GIT_CONFIG_PARAMETERS;
  return parameters === undefined ? {} : { GIT_CONFIG_PARAMETERS: parameters };
}

/** A run's temporary folder and the one way out of it. */
export interface TestRun {
  folder: string;
  /** Puts `TMPDIR` and git's variable back as the entry found them, then removes the folder the entry made; once. */
  leave(): void;
}

/**
 * Makes this run's temporary folder in `home` and points the process's `TMPDIR` at it, so every
 * fixture lands inside it whoever makes it: `tempDir`, a test's own
 * `mkdtempSync(join(tmpdir(), …))`, a child process (finding 234). The leave removes that one
 * folder and takes no path; with `WIZARDINGCODE_CREW_KEEP_FIXTURES=1` it removes nothing and marks
 * the folder with `.keep`, which `sweepDeadRuns` then skips. A removal that fails is swallowed: the
 * next run's sweep takes what is left.
 *
 * The entry also turns git's automatic maintenance off for the run, and the leave puts git's
 * variable back as it was (finding 228). A commit ends by starting `git maintenance run --auto`
 * detached; with git 2.54.0 that maintenance repacks a repository as soon as two loose objects lie
 * under `objects/17`, one fixture commit in 256, and removes the loose objects while the fixture's
 * next git command reads them.
 */
export function enterRun(home: string): TestRun {
  const env = process.env;
  const folder = mkdtempSync(join(home, `crew-run-${process.pid}-`));
  const previous = env.TMPDIR;
  env.TMPDIR = folder;
  const parameters = env.GIT_CONFIG_PARAMETERS;
  env.GIT_CONFIG_PARAMETERS = parameters
    ? `${parameters} ${NO_GIT_MAINTENANCE}`
    : NO_GIT_MAINTENANCE;
  let left = false;
  return {
    folder,
    leave() {
      if (left) return;
      left = true;
      if (previous === undefined) delete env.TMPDIR;
      else env.TMPDIR = previous;
      if (parameters === undefined) delete env.GIT_CONFIG_PARAMETERS;
      else env.GIT_CONFIG_PARAMETERS = parameters;
      try {
        if (env.WIZARDINGCODE_CREW_KEEP_FIXTURES === "1") writeFileSync(join(folder, ".keep"), "");
        else rmSync(folder, { recursive: true, force: true });
      } catch {
        // Not removed now: its pid is dead at the next run, whose sweep removes it.
      }
    },
  };
}

/**
 * Removes the run folders that runs which never left have left in `home` (a killed suite), and
 * returns how many. An entry is taken only when it is all of: named as a run folder, a real folder
 * of `owner`'s by one `lstat` (a link is never followed, another owner's folder never walked: in a
 * shared temporary folder anyone can make the name), of a pid that names no live process, and
 * without the `.keep` of a kept post-mortem. The entry is named as listed, nothing resolved. One
 * that cannot be removed is skipped and not counted, and nothing is thrown: the preload calls this
 * as it loads, where a throw would stop every test.
 */
export function sweepDeadRuns(home: string, owner: number = currentUser()): number {
  let names: string[];
  try {
    names = readdirSync(home);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const name of names) {
    const pid = RUN_NAME.exec(name)?.[1];
    if (pid === undefined) continue;
    const path = join(home, name);
    try {
      const stat = lstatSync(path);
      if (!stat.isDirectory() || stat.uid !== owner) continue;
      if (processExists(Number(pid)) || existsSync(join(path, ".keep"))) continue;
      rmSync(path, { recursive: true });
      removed += 1;
    } catch {
      // Gone since the listing (another suite's sweep) or not removable: skipped.
    }
  }
  return removed;
}

/**
 * Removes the registered fixtures and returns how many (finding 74). None with
 * `WIZARDINGCODE_CREW_KEEP_FIXTURES=1`, the escape hatch for a failing test's post-mortem. A
 * registered path outside the canonical temp folder is skipped and stays registered: nothing but
 * the registry names a path to remove, and the registry never reaches outside the temp folder.
 */
export function removeTempDirs(): number {
  if (process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES === "1") return 0;
  const temp = realpathSync(tmpdir());
  let removed = 0;
  for (const dir of [...TEMP_DIRS]) {
    if (!dir.startsWith(`${temp}${sep}`)) continue;
    rmSync(dir, { recursive: true, force: true });
    TEMP_DIRS.delete(dir);
    removed++;
  }
  return removed;
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: childEnv(GIT_ENV),
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function write(root: string, rel: string, text: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** A committed git repository in a temporary folder. */
export function makeRepo(files: Record<string, string> = { "README.md": "# test\n" }): string {
  const root = tempDir();
  git(root, "init", "-q", "-b", "main");
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "init");
  return root;
}

/** An environment whose user state lives in a fresh temporary home. */
export function testEnv(): NodeJS.ProcessEnv {
  const home = tempDir("crew-home-");
  // No test ever starts the real claude binary (finding 89): a session the engine opens for mail
  // runs this fake, which exits at once; a test that needs a session's shape sets its own fake.
  const fake = join(home, "claude");
  writeFileSync(fake, "#!/bin/sh\nexit 0\n");
  chmodSync(fake, 0o755);
  const env: NodeJS.ProcessEnv = childEnv({
    WIZARDINGCODE_HOME: home,
    WIZARDINGCODE_CREW_CLAUDE: fake,
  });
  // A suite run under Claude Code inherits the plugin's variables, which would turn the pack
  // discovery on in every fixture (SP6 Task 2, round 3): a test that wants them sets them.
  delete env.CLAUDE_PLUGIN_ROOT;
  delete env.CLAUDE_CONFIG_DIR;
  return env;
}

/**
 * The environment a test hands a child process (2026-10-28-004, the residual of finding 193): the
 * developer's own without the three Jev variables, merged with `extra`; a test that wants Jev sets
 * its own key, endpoint or model, and the real service is never reached from the suite, as the
 * real claude binary is not (finding 89). Every spread of the process environment in the tests
 * goes through here; a row of jev.test.ts refuses any other.
 */
export function childEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  delete env.WIZARDINGCODE_JEV_API_KEY;
  delete env.WIZARDINGCODE_JEV_ENDPOINT;
  delete env.WIZARDINGCODE_JEV_MODEL;
  return env;
}

/** Paths of a folder the test knows to be active (a git repository or one holding .crew/). */
export function repoPaths(root: string, env: NodeJS.ProcessEnv = testEnv()): CrewPaths {
  const paths = resolvePaths(root, env);
  if (!paths) throw new Error(`crew is inactive in ${root}`);
  return paths;
}

/** The hook context of an active folder. */
export function hookContext(payload: HookPayload, env: NodeJS.ProcessEnv = testEnv()): HookContext {
  const ctx = buildContext(payload, env);
  if (!ctx) throw new Error(`crew is inactive in ${payload.cwd}`);
  return ctx;
}

/**
 * A spy on the protected reads of the mailboxes (triage 4g): every `readProtectedJsonAt` goes
 * through `onRead` with the file and what the real read returned, and `onRead`'s answer is the
 * read. The caller restores it with `mockRestore`, in a `finally`.
 */
export function spyMailReads(
  onRead: (file: string, read: store.Protected<Mailbox>) => store.Protected<Mailbox>,
) {
  const realRead = store.readProtectedJsonAt;
  return spyOn(store, "readProtectedJsonAt").mockImplementation(((
    integrity: string,
    file: string,
  ) => onRead(file, realRead<Mailbox>(integrity, file))) as typeof store.readProtectedJsonAt);
}

/** A Lighthouse report as the chrome-devtools CLI writes one (SP9 Task 7): four categories, one accessibility audit at 0 with items. */
export const DEVTOOLS_REPORT = {
  categories: {
    performance: { score: 0.5, auditRefs: [{ id: "uses-http2" }] },
    accessibility: { score: 0.8, auditRefs: [{ id: "color-contrast" }, { id: "label" }] },
    "best-practices": { score: 1, auditRefs: [{ id: "uses-http2" }] },
    seo: { score: 0.9, auditRefs: [] },
  },
  audits: {
    "color-contrast": {
      id: "color-contrast",
      title: "Background and foreground colors do not have a sufficient contrast ratio.",
      score: 0,
      details: { items: [{ node: "button.pay" }, { node: "a.help" }] },
    },
    label: {
      id: "label",
      title: "Form elements have associated labels",
      score: 1,
      details: { items: [{}] },
    },
    "uses-http2": { id: "uses-http2", title: "Use HTTP/2", score: 0, details: { items: [{}] } },
  },
};

/** The trace command's insights as the CLI prints them: LCP and INP in ms, CLS as is. */
export const DEVTOOLS_INSIGHTS = {
  insights: { LCP: { lcp: 1234 }, CLS: { cls: 0.18 }, INP: { inp: 200 } },
};

/**
 * A fake chrome-devtools CLI (SP9 Task 7): a script in a folder of its own that records every call
 * (its argv and the telemetry variable) in `FAKE_CALLS` and answers each tool with canned JSON; its
 * modes come from the environment, or from a `fake.env` file beside it when a run cannot set them.
 */
export function fakeDevtoolsCli(): { bin: string; dir: string } {
  const dir = tempDir("crew-devtools-");
  const bin = join(dir, "chrome-devtools");
  writeFileSync(
    bin,
    `#!/bin/sh
here="$(dirname "$0")"
[ -f "$here/fake.env" ] && . "$here/fake.env"
echo "$* NOUSAGE=$CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS" >> "$FAKE_CALLS"
tool="$1"; shift
case "$tool" in
  start)
    [ "$FAKE_START" = exit1 ] && exit 1
    [ -n "$FAKE_FLAG" ] && [ -f "$FAKE_FLAG" ] && echo "flag-up" >> "$FAKE_CALLS"
    echo '{"ok":true}' ;;
  new_page)
    case "$FAKE_PAGE_ID" in
      bad) echo '{"pageId":"1; touch MARKER"}' ;;
      big) head -c 1100000 /dev/zero | tr '\\0' 'x' ;;
      none) echo '{}' ;;
      *) echo '{"pageId":"p1"}' ;;
    esac ;;
  lighthouse_audit)
    dir=""
    while [ $# -gt 0 ]; do [ "$1" = --outputDirPath ] && dir="$2"; shift; done
    case "$FAKE_LIGHTHOUSE" in
      exit3) exit 3 ;;
      hang) sleep 30 ;;
      none) echo '{}' ;;
      stdout) cat "$FAKE_REPORT" ;;
      big) head -c 1100000 /dev/zero | tr '\\0' 'x' > "$dir/lhr-big.json"; echo '{}' ;;
      *) cp "$FAKE_REPORT" "$dir/lhr-$$.json"; echo '{"ok":true}' ;;
    esac ;;
  performance_start_trace)
    file=""
    while [ $# -gt 0 ]; do [ "$1" = --filePath ] && file="$2"; shift; done
    if [ "$FAKE_TRACE" = rmdir ]; then rm -rf "$(dirname "$file")"; exit 0; fi
    echo '{"trace":true}' > "$file"
    cat "$FAKE_INSIGHTS" ;;
  stop) echo "stopped" >> "$FAKE_CALLS" ;;
esac
`,
  );
  chmodSync(bin, 0o755);
  // A command an unquoted url would make the shell run (`$(pwn)` survives `new URL`, a space does
  // not): it marks the file `FAKE_MARKER` names, so a marker that exists is a url that reached the
  // shell unquoted.
  const pwn = join(dir, "pwn");
  writeFileSync(pwn, '#!/bin/sh\n[ -n "$FAKE_MARKER" ] && : > "$FAKE_MARKER"\nexit 0\n');
  chmodSync(pwn, 0o755);
  return { bin, dir };
}

/**
 * A judge's ruling filed as the SubagentStop hook files it (finding 192, 2026-10-28-004): the role
 * record and its file under the work folder, the path a `crew judgement record` takes. The first
 * ruling of an item goes through the hook's filing; a later one is written into the file that record
 * names, as a resumed judge's is, unless `how` is `file`: then it goes through the hook's filing
 * again, which archives the earlier ruling with its record as a resumed judge's stop does. A source
 * that does not exist is returned as it is, so a row that expects `no ruling file at` keeps its path.
 */
export function filedRuling(
  env: NodeJS.ProcessEnv,
  root: string,
  id: string,
  from: string,
  how: "write" | "file" = "write",
): string {
  // A relative source is the test's path from the repository root, as `--ruling` reads one.
  const source = isAbsolute(from) ? from : join(root, from);
  if (!existsSync(source)) return from;
  const text = readFileSync(source, "utf8");
  const judge = (loadEvidence(repoPaths(root, env), id).evidence.roles ?? []).find(
    (r) => r.agent === "judge" && typeof r.file === "string",
  );
  if (judge?.file && how === "write") {
    const target = join(root, ".crew", "work", id, judge.file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    return target;
  }
  const ctx = buildContext({ session_id: "crew-test-judge", cwd: root }, env);
  if (!ctx) throw new Error(`crew is inactive in ${root}`);
  // A judge on record filed again resumes its record (`as`), so the hook archives the earlier ruling.
  const done = fileAnswerBySession(ctx, id, "judge", {
    answer: text.replace(/\n$/, ""),
    ...(judge ? { as: "judge" } : {}),
  });
  if (!done.file) throw new Error(done.note ?? "the ruling was not filed");
  return join(root, ".crew", "work", id, done.file);
}

/** A lead's answer in the shape its role file asks, for the fixtures that record one. */
export function leadAnswerText(
  id: string,
  lead: string,
  what: "spec" | "plan" | "delivery",
  options: { verdict?: "validated" | "returned"; returns?: string; note?: string } = {},
): string {
  return `# ${lead.replace(/^lead-/, "")} lead's validation of ${id}: ${what}\nverdict: ${options.verdict ?? "validated"}\n## Returns\n${options.returns ?? "- none"}\n## Notes\n- ${options.note ?? "holds"}\n`;
}

let leadAgents = 0;

/**
 * A lead's answer filed as the SubagentStop hook files it (finding 242): the file under the work
 * folder and its role record, through the hook's own filing under the work folder's lock, never a
 * file written by hand. Each call is a lead launched fresh unless `agentId` names the one to
 * resume, whose answer then lands in its reply file. Returns the path a `crew validation record
 * --file` takes.
 */
export function filedLead(
  env: NodeJS.ProcessEnv,
  root: string,
  id: string,
  text: string,
  agentId = `crew-test-lead-${++leadAgents}`,
): string {
  const ctx = buildContext({ session_id: "crew-test-lead", cwd: root }, env);
  if (!ctx) throw new Error(`crew is inactive in ${root}`);
  const progress: Progress = { saved: null, recorded: false, pending: null, reply: null };
  const note = withLock(
    workDir(ctx.paths, id),
    () =>
      fileAnswer(
        ctx,
        id,
        "tech-lead",
        {
          answer: text.replace(/\n$/, ""),
          agentId,
          filedBy: "hook",
          tokens: { tokens: 0, from: "none" },
        },
        "",
        progress,
      ),
    { what: "work folder" },
  );
  if (!progress.saved?.file) throw new Error(note ?? "the lead's answer was not filed");
  return join(root, ".crew", "work", id, progress.saved.file);
}

/**
 * A lead's file a fixture wrote in a shape one filing does not give (a reply file of several
 * blocks, a name of the row's own), put on record as the answer a role filed (finding 242): the
 * role record the hook writes, with the team of the file's last lead heading and the hash of the
 * content as it stands, saved through the engine's own writer. A file with no lead heading, or
 * outside the item's folder, is left as it is: its row is about a refusal that comes before the
 * record is read. Rows on what the hook itself files use `filedLead`.
 */
export function registerFiled(
  env: NodeJS.ProcessEnv,
  root: string,
  id: string,
  file: string,
): void {
  const paths = repoPaths(root, env);
  const dir = workDir(paths, id);
  const path = isAbsolute(file) ? file : join(root, file);
  if (!existsSync(path) || !path.startsWith(`${dir}${sep}`)) return;
  const text = readFileSync(path, "utf8");
  const heading = leadHeading(text);
  const team = (Object.keys(TEAMS) as TeamName[]).find((name) => name === heading?.team);
  if (!team) return;
  const evidence = loadEvidence(paths, id).evidence;
  evidence.roles = [
    ...(evidence.roles ?? []),
    {
      agent: "tech-lead",
      agentId: `crew-test-lead-${++leadAgents}`,
      at: new Date().toISOString(),
      tokens: 0,
      tokensFrom: "none",
      file: path
        .slice(dir.length + 1)
        .split(sep)
        .join("/"),
      team,
      fileHash: fileHash(text),
    },
  ];
  saveEvidence(paths, id, evidence);
}

/**
 * The CLI run in this process against a folder: stdout and stderr collected per call, the code
 * answered (2026-11-01-003: shared by the running and the release-record rows).
 */
export function cliIo(
  cwd: string,
  env: NodeJS.ProcessEnv,
): (...argv: string[]) => Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const cli: CliIo = {
    stdout: (t) => out.push(t),
    stderr: (t) => err.push(t),
    stdin: async () => "",
    env,
    cwd,
  };
  return async (...argv: string[]) => {
    out.length = 0;
    err.length = 0;
    const code = await main(argv, cli);
    return { code, out: out.join(""), err: err.join("") };
  };
}

/**
 * A session `s` whose one item was proven and left the active slot (finding 141's shape): a fast
 * item with a criterion and a skip, a change, the gates run and proven, learned when `learned`,
 * the slot freed. The env is the one the repository, its evidence and the engine's integrity
 * record live under, so a row that reads them passes it on (2026-11-01-003).
 */
export async function learnedFreedSession(
  learned: boolean,
): Promise<{ root: string; ctx: HookContext; env: NodeJS.ProcessEnv; work: WorkItem }> {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const ctx = hookContext({ session_id: "s", cwd: root }, env);
  onSessionStart(ctx);
  const work = createWork(ctx.paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  addSkip(work, "tdd:AC-1", "manual");
  write(root, "src/a.ts", "changed");
  const outcome = await runGates(ctx.paths, work, ctx.profile, ctx.policy);
  if (outcome.verdict !== "proven")
    throw new Error(`the fixture's gates did not prove: ${outcome.verdict}`);
  work.phase = "learn";
  saveWork(ctx.paths, work);
  if (learned) {
    const out = learnItem(ctx.paths, work, ctx.profile, ctx.policy, ctx.mail, true);
    if ("refused" in out) throw new Error(`the fixture's learn was refused: ${out.refused}`);
    saveWork(ctx.paths, work);
    if (!loadWork(ctx.paths, work.id).work?.learned)
      throw new Error("the fixture's item is not learned");
  }
  updateState(ctx.paths, (state) => {
    state.active = null;
  });
  return { root, ctx, env, work };
}

/**
 * The `*.events.txt` file with the newest modification time in a folder, or null: names do not
 * sort in time, because their prefixes differ (`tdd-AC-1-red-…`, `tdd-AC-2-after-…`) (finding 220).
 */
export function newestEvents(dir: string): string | null {
  let names: string[];
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".events.txt"));
  } catch {
    return null;
  }
  let newest: { path: string; at: number } | null = null;
  for (const name of names) {
    const path = join(dir, name);
    try {
      const at = statSync(path).mtimeMs;
      if (!newest || at > newest.at) newest = { path, at };
    } catch {
      // Gone since the listing.
    }
  }
  return newest?.path ?? null;
}

/** An events file as a failure message shows it: `<name>: <text>`, or `none` when there is no file to read (finding 220). */
export function eventsReport(path: string | null): string {
  if (!path) return "none";
  try {
    return `${basename(path)}: ${readFileSync(path, "utf8")}`;
  } catch {
    return "none";
  }
}

/**
 * The promise's result, or a failure when it has none within `ms` that holds the events file's
 * text, so a run that stalls says which of its child's events came before the test runner's own
 * limit kills the row (finding 220). `events` is the file's path, or a function that names it when
 * the timer fires. The run given up on is not killed: its own timeout does that.
 */
export function within<T>(
  promise: Promise<T>,
  ms: number,
  events: string | null | (() => string | null),
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const path = typeof events === "function" ? events() : events;
      reject(new Error(`no result in ${ms} ms; events: ${eventsReport(path)}`));
    }, ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}
