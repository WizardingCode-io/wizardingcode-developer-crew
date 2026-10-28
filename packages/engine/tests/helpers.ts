import { spyOn } from "bun:test";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { buildContext } from "../src/hooks/context.ts";
import type { HookContext, HookPayload } from "../src/hooks/types.ts";
import { type CrewPaths, resolvePaths } from "../src/paths.ts";
import * as store from "../src/store.ts";
import type { Mailbox } from "../src/types.ts";

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
    env: { ...process.env, ...GIT_ENV },
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
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    WIZARDINGCODE_HOME: home,
    WIZARDINGCODE_CREW_CLAUDE: fake,
  };
  // A suite run under Claude Code inherits the plugin's variables, which would turn the pack
  // discovery on in every fixture (SP6 Task 2, round 3): a test that wants them sets them.
  delete env.CLAUDE_PLUGIN_ROOT;
  delete env.CLAUDE_CONFIG_DIR;
  // The developer's Jev (finding 193, SP9 Task 11): a test that wants Jev sets its own key, endpoint
  // or model; the real service is never reached from the suite, as the real claude binary is not.
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
