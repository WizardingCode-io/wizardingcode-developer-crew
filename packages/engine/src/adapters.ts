import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  noteUpdated,
  type Reminder,
  runtimePathspecs,
  type UncommittedEntry,
} from "./adapters-uncommitted.ts";
import { appendDecision, lastEntryText, registerTampered } from "./decisions.ts";
import { baseCommitOf, gitStatusEntries } from "./fingerprint.ts";
import { nowIso, readText } from "./fs.ts";
import { LockBusy, withLock } from "./lock.ts";
import { type CrewPaths, canonical } from "./paths.ts";
import { quotedText } from "./quote.ts";
import {
  adapterLinkProblem,
  checkRuntime,
  type InstallDirs,
  InstallFailed,
  installRuntime,
  RUNTIME_NAMES,
  RUNTIMES,
  type Runtime,
  type RuntimeName,
  resolveScoped,
  rootOf,
} from "./runtimes.ts";
import { loadState, recordAdapterVersion } from "./state.ts";
import { compareVersions } from "./version.ts";

/**
 * The refresh of a checkout's runtime adapters (item 2026-11-08-002): the adapters whose
 * configuration names the running engine's own root are installed again from it when the check
 * says they are stale, the version is recorded per root once a check after the install says every
 * adapter is ok, and what happened goes to the project's decision register. SessionStart and
 * `crew projects update` share it. Every text a repository controls (a root, a path, a message)
 * passes `quoted` before it reaches a reason, a line, an entry or the fleet's output (AC-24).
 */

export type AdapterStatus =
  | "up to date"
  | "updated"
  | "would update"
  | "stale"
  | "refused"
  | "failed";
export interface AdapterResult {
  runtime: RuntimeName;
  status: AdapterStatus;
  why?: string;
  differed: number;
  removed: number;
  trust?: string;
  configWritten: boolean;
}
export type ForeignWhy = "older plugin folder" | "root gone" | "root unreadable" | "another root";
/** An adapter whose configuration names another root: never written, reported with its root and why. */
export interface ForeignAdapter {
  runtime: RuntimeName;
  root: string;
  /** The configuration file. */
  path: string;
  why: ForeignWhy;
}
export interface RefreshOptions {
  /** The running engine's canonical root and version. */
  root: string;
  version: string;
  home: string;
  dryRun: boolean;
  /** A time (ms since the epoch) past which no install starts; null for the fleet. */
  deadline: number | null;
  resumed: boolean;
  activeItem: boolean;
  worktree: boolean;
  live: boolean;
  /** Test seams: the install to call, and a hook run right before the lock is taken. */
  install?: typeof installRuntime;
  beforeLock?: () => void;
}
export interface Refresh {
  results: AdapterResult[];
  foreign: ForeignAdapter[];
  recorded: boolean;
  appended: boolean;
  /** The version recorded for the root before this refresh. */
  from: string | null;
  /** The running version. */
  version: string;
  /** The running engine's root. */
  root: string;
  /** What this refresh updated, as the not-committed mark holds it (item 2026-11-09-001). */
  entry?: UncommittedEntry;
  /** Why the mark could not be written, quoted; the caller then reminds from `entry`. */
  markFailed?: string;
}

/** The one path every root, path and message takes before it is shown: one line, no control or bidi character, 200 characters at most. */
export const quoted = (text: string): string => quotedText(text, 200);
const PLUGIN_CACHE_VERSION =
  /\/plugins\/cache\/[^/]+\/wizardingcode-developer-crew\/(\d+\.\d+\.\d+)$/;
const LOCK_WAIT_MS = 2000;
/** At most this many paths are named in a hold-back reason; the rest are counted. */
const PATHS_NAMED = 3;

type Check = ReturnType<typeof checkRuntime>;
/** An own-root adapter: the runtime, the root as its configuration names it and its first check. */
interface Own {
  runtime: Runtime;
  root: string;
  first: Check;
}

/** Whether a check found what an install fixes: a stale configuration, skill copy or agents. */
function isStale(check: Check): boolean {
  return (
    check.parts.config.state !== "ok" ||
    check.parts.skill.state !== "ok" ||
    (check.parts.agents !== null && check.parts.agents.state !== "ok")
  );
}
function differedOf(check: Check): number {
  return check.parts.config.differ + check.parts.skill.differ + (check.parts.agents?.differ ?? 0);
}
/** Whether an install of these adapters would change a file the Stop rule watches: a configuration, or Codex's agents. */
function changesWatched(own: Own[]): boolean {
  return own.some(
    (a) =>
      a.first.parts.config.state !== "ok" ||
      (a.runtime.name === "codex" && a.first.parts.agents?.state !== "ok"),
  );
}
function listed(paths: string[]): string {
  const shown = paths.slice(0, PATHS_NAMED).map(quoted).join(", ");
  return paths.length > PATHS_NAMED ? `${shown} and ${paths.length - PATHS_NAMED} more` : shown;
}

/** The first link problem of any own-root adapter's paths, since they all write the shared skill folder. */
function linkProblem(own: Own[], dirs: InstallDirs): string | null {
  for (const a of own) {
    const problem = adapterLinkProblem(a.runtime, dirs, a.root);
    if (problem) return quoted(problem);
  }
  return null;
}

/**
 * The hold-back the adapters' git status gives, or null when their files are clean: a checkout
 * that is no repository, a changed or renamed path, an untracked one (an adapter installed and
 * never committed), an ignored one, or a status git could not read.
 */
function gitHoldBack(own: Own[], paths: CrewPaths): string | null {
  if (!existsSync(join(paths.root, ".git"))) return "not a git repository";
  // The same paths the not-committed mark watches, the configuration always among them.
  const pathspec = new Set<string>();
  for (const a of own)
    for (const spec of runtimePathspecs(a.runtime.name, true)) pathspec.add(join(paths.root, spec));
  let entries: ReturnType<typeof gitStatusEntries>;
  try {
    entries = gitStatusEntries(paths.root, { pathspec: [...pathspec], ignored: true });
  } catch (error) {
    return `git status failed (${quoted((error as Error).message)})`;
  }
  const of = (...kinds: string[]) =>
    entries.filter((e) => kinds.includes(e.kind)).map((e) => e.path);
  const changed = of("modified", "renamed");
  if (changed.length) return `uncommitted changes in ${listed(changed)}`;
  const untracked = of("untracked");
  if (untracked.length) return `not committed: ${listed(untracked)}`;
  const ignored = of("ignored");
  if (ignored.length) return `files git ignores in ${listed(ignored)}`;
  return null;
}

/** One adapter's result as every output states it: `<runtime> updated (<n> differed, <n> removed)`, or `<runtime> <status> (<why>)`. */
export function resultText(r: AdapterResult): string {
  if (r.status === "updated")
    return `${r.runtime} updated (${r.differed} differed, ${r.removed} removed)`;
  return `${r.runtime} ${r.status}${r.why ? ` (${r.why})` : ""}`;
}

/** One foreign adapter as every output names it: the runtime, the root (or the file) it names, and why it is not this engine's. */
export function foreignText(f: ForeignAdapter): string {
  if (f.why === "another root") return `${f.runtime} on another root (${quoted(f.root)})`;
  if (f.why === "root unreadable") return `${f.runtime} root unreadable (${quoted(f.path)})`;
  return `${f.runtime} names ${quoted(f.root)} (${f.why})`;
}

/** The register's text of a refresh: each adapter's result, and the versions and root it moved between. */
export function adaptersEntryText(refresh: Refresh, root: string): string {
  const results = refresh.results.map(resultText).join(", ");
  return `adapters: ${results} (from ${refresh.from ?? "none"} to ${refresh.version} at ${quoted(root)})`;
}

/**
 * The command that commits a refresh: the configuration files it wrote, the shared skill folder,
 * the `crew-*` agents of each updated runtime and the register when an entry was appended, each
 * single-quoted; `-A` with the pathspecs stages the prune's deletions too; `-m` so it runs with no
 * editor. Null when nothing was updated.
 */
export function commitCommand(refresh: Refresh): string | null {
  const updated = refresh.results.filter((r) => r.status === "updated");
  if (!updated.length) return null;
  const paths: string[] = [];
  const add = (p: string) => {
    if (!paths.includes(p)) paths.push(p);
  };
  for (const r of updated) if (r.configWritten) add(RUNTIMES[r.runtime].config.project);
  for (const r of updated) add(`${RUNTIMES[r.runtime].skillsDir.project}/crew-method`);
  for (const r of updated) {
    const agents = RUNTIMES[r.runtime].agentsDir;
    if (agents) add(`${agents.project}/crew-*`);
  }
  if (refresh.appended) add(".crew/decisions.json");
  const q = (p: string) => `'${p.replace(/'/g, "'\\''")}'`;
  return `git add -A -- ${paths.map(q).join(" ")} && git commit -m 'adapters refreshed by crew ${refresh.version}'`;
}

/**
 * The SessionStart line of the adapters, or null when there is nothing to say: each result of the
 * refresh that is not up to date, each foreign adapter that is not simply another engine's, what
 * the not-committed mark says is still to commit (left out for the root this same refresh
 * updated, whose result already says it), a mark that could not be written or read, then once
 * each the note that an update applies from the runtime's next session, the commit command the
 * mark's reader built, and the hold-back suffixes that tell the person what ends the hold-back.
 * With no reminder it says the parts and no command.
 */
export function adaptersLine(
  refresh: Refresh | null,
  extra: string[] = [],
  reminder: Reminder | null = null,
): string | null {
  const results = refresh?.results ?? [];
  const updated = results.some((r) => r.status === "updated");
  const parts: string[] = [];
  for (const r of results) {
    if (r.status === "up to date") continue;
    parts.push(`${resultText(r)}${r.status === "updated" && r.trust ? ` (${r.trust})` : ""}`);
  }
  for (const f of refresh?.foreign ?? []) {
    if (f.why === "another root") continue;
    if (f.why === "root unreadable") parts.push(foreignText(f));
    else
      parts.push(
        `${foreignText(f)}: run crew runtime install ${f.runtime} with the crew of the root to keep, such as ~/.local/share/wizardingcode-developer-crew/bin/crew`,
      );
  }
  reminder?.parts.forEach((part, i) => {
    if (!(updated && reminder.roots[i] === refresh?.root)) parts.push(part);
  });
  if (refresh?.markFailed)
    parts.push(`the not-committed mark was not written (${refresh.markFailed})`);
  if (reminder?.failed) parts.push(`not-committed check failed (${reminder.failed})`);
  parts.push(...extra);
  if (!parts.length) return null;
  let line = `adapters: ${parts.join("; ")}`;
  if (updated) line += "; applies from each updated runtime's next session";
  if (reminder?.command) line += `. Commit: ${reminder.command}`;
  const whys = results.map((r) => r.why ?? "");
  if (whys.includes("an item is active"))
    line += "; it is updated at a session start with no active item, or by crew projects update";
  if (whys.some((w) => w.startsWith("uncommitted changes")))
    line += "; commit or restore them first";
  const never = results.find((r) => r.why?.startsWith("not committed"));
  if (never)
    line += `; commit them to adopt the adapter, or run crew runtime install ${never.runtime} again`;
  return `${line}.`;
}

/** The refresh of one checkout, at project scope: the spec's "The refresh of one checkout", step by step. */
export function refreshAdapters(paths: CrewPaths, o: RefreshOptions): Refresh {
  const dirs: InstallDirs = { project: paths.root, home: o.home };
  const refresh: Refresh = {
    results: [],
    foreign: [],
    recorded: false,
    appended: false,
    from: loadState(paths).adapters?.[o.root] ?? null,
    version: o.version,
    root: o.root,
  };
  const check = (runtime: Runtime, root: string) => checkRuntime(runtime, "project", dirs, root);
  const own: Own[] = [];
  // 1 and 2: each runtime's configuration, the root it names, own or foreign.
  for (const name of RUNTIME_NAMES) {
    if (name === "claude") continue;
    const runtime = RUNTIMES[name];
    const configPath = resolveScoped(runtime.config.project, dirs);
    const foreign = (root: string, why: ForeignWhy) =>
      refresh.foreign.push({ runtime: name, root, path: configPath, why });
    let named: string | null;
    try {
      const text = readText(configPath);
      if (text === null) continue;
      named = rootOf(text, runtime, "");
    } catch {
      foreign("", "root unreadable");
      continue;
    }
    if (named === null || named === "") continue;
    if (!isAbsolute(named)) {
      foreign(named, "root unreadable");
      continue;
    }
    if (!existsSync(join(named, "dist", "crew.mjs"))) {
      foreign(named, "root gone");
      continue;
    }
    const c = canonical(named);
    if (c !== o.root) {
      const cached = PLUGIN_CACHE_VERSION.exec(c);
      foreign(
        named,
        cached?.[1] && compareVersions(cached[1], o.version) < 0
          ? "older plugin folder"
          : "another root",
      );
      continue;
    }
    own.push({ runtime, root: named, first: check(runtime, named) });
  }
  // 3: the first check decides what an install fixes; an event failure is the engine's own fault.
  const results = new Map<RuntimeName, AdapterResult>();
  const set = (a: Own, status: AdapterStatus, why?: string, extra: Partial<AdapterResult> = {}) =>
    results.set(a.runtime.name, {
      runtime: a.runtime.name,
      status,
      ...(why ? { why } : {}),
      differed: differedOf(a.first),
      removed: 0,
      configWritten: false,
      ...extra,
    });
  const finish = (): Refresh => {
    refresh.results = own.map((a) => results.get(a.runtime.name) as AdapterResult);
    return refresh;
  };
  const writeEntry = () => {
    const ended = finish().results.some((r) => ["updated", "refused", "failed"].includes(r.status));
    if (!ended) return;
    const text = adaptersEntryText(refresh, o.root);
    if (text === lastEntryText(paths, "adapters")) return;
    appendDecision(paths, {
      at: nowIso(),
      item: "adapters",
      kind: "adapters",
      by: "the engine",
      text,
    });
    refresh.appended = true;
  };
  const lock = join(paths.localDir, "adapters");
  const lockOptions = { what: "adapter refresh", waitMs: LOCK_WAIT_MS };
  // The register entry of a run that installed nothing, under the adapters lock. When another
  // process holds the lock this run does not write the entry, and the next refresh writes it.
  const entryUnderLock = () => {
    if (o.dryRun) return;
    try {
      withLock(lock, writeEntry, lockOptions);
    } catch (error) {
      if (!(error instanceof LockBusy)) throw error;
    }
  };
  // A configuration the install would refuse (not JSON) is refused here, on the real run and the
  // dry run alike, so the dry run predicts it and nothing is installed over it; an adapter whose
  // event fails is failed with the event's line, and nothing is installed for it.
  for (const a of own)
    if (a.first.configRefused) set(a, "refused", quoted(a.first.configRefused));
    else if (a.first.parts.events.state !== "ok")
      set(
        a,
        "failed",
        quoted(a.first.problems.find((p) => p.includes(" failed (")) ?? "an event failed"),
      );
    else if (!isStale(a.first)) set(a, "up to date");
  const toInstall = own.filter((a) => !results.has(a.runtime.name));
  const notUpToDate = () => own.filter((a) => results.get(a.runtime.name)?.status !== "up to date");
  if (notUpToDate().length === 0) {
    if (!o.dryRun) {
      recordAdapterVersion(paths, o.root, o.version);
      refresh.recorded = true;
    }
    return finish();
  }
  // 4: held back, nothing written, not even the entry of a refused or failed adapter; every
  // adapter that is not up to date says the reason.
  const watched = changesWatched(toInstall);
  const heldBack =
    o.resumed && watched
      ? "a resumed session"
      : o.activeItem
        ? "an item is active"
        : o.worktree
          ? "a task worktree"
          : o.live && watched
            ? "a session is live"
            : registerTampered(paths)
              ? "decisions.json changed outside the engine"
              : null;
  if (heldBack) {
    for (const a of notUpToDate()) set(a, "stale", heldBack);
    return finish();
  }
  // Nothing to install, but a refusal or a failure to record. A busy lock changes the status of
  // what it prevented, and here it prevents no install: the refusal and the failure, which the
  // first check made, stand as they do at step 8, and the entry is appended by the next refresh.
  if (toInstall.length === 0) {
    entryUnderLock();
    return finish();
  }
  // 5: a link or a path outside the project refuses every own-root adapter.
  const problem = linkProblem(own, dirs);
  if (problem) {
    for (const a of own) set(a, "refused", problem);
    // The refusal stands under a busy lock too: the lock guards the entry, which the next refresh appends.
    entryUnderLock();
    return finish();
  }
  // 6: the adapters' git status holds a write back.
  const held = gitHoldBack(own, paths);
  if (held) {
    for (const a of toInstall) set(a, "stale", held);
    return finish();
  }
  // 7: a dry run predicts and writes nothing.
  if (o.dryRun) {
    for (const a of toInstall) set(a, "would update");
    return finish();
  }
  // 8: one hold of the lock for the checks again, the installs, the record and the entry.
  const pastDeadline = () => o.deadline !== null && Date.now() > o.deadline;
  o.beforeLock?.();
  if (pastDeadline()) {
    for (const a of toInstall) set(a, "stale", "time budget");
    return finish();
  }
  // The not-committed mark (item 2026-11-09-001): written right after each install, before the
  // version is recorded and the register entry appended, so a throw of either, or a kill after an
  // install, leaves the reminder. With no commit to name there is nothing to tie a change to, and
  // no mark. A write that fails is said once and never undoes the refresh.
  const at = nowIso();
  let head: string | null = null;
  const mark = (runtimes: UncommittedEntry["runtimes"], register: boolean) => {
    if (head === null) return;
    try {
      noteUpdated(paths, o.root, { version: o.version, at, head, runtimes, register });
    } catch (error) {
      refresh.markFailed ??= quoted((error as Error).message);
    }
  };
  try {
    withLock(
      lock,
      () => {
        head = baseCommitOf(paths.root);
        const still = toInstall.filter((a) => {
          if (isStale(check(a.runtime, a.root))) return true;
          set(a, "up to date");
          return false;
        });
        if (still.length) {
          const again = linkProblem(own, dirs);
          if (again) for (const a of own) set(a, "refused", again);
          else {
            const heldNow = gitHoldBack(own, paths);
            if (heldNow) for (const a of still) set(a, "stale", heldNow);
            else {
              let budgetOut = false;
              for (const a of still) {
                if (budgetOut || pastDeadline()) {
                  budgetOut = true;
                  set(a, "stale", "time budget");
                  continue;
                }
                try {
                  const done = (o.install ?? installRuntime)(a.runtime, "project", dirs, a.root);
                  if ("refused" in done) {
                    set(a, "refused", quoted(done.refused));
                    continue;
                  }
                  const after = check(a.runtime, a.root);
                  if (after.ok) {
                    set(a, "updated", undefined, {
                      removed: done.removed.length,
                      configWritten: done.configWritten,
                      ...(done.configWritten && a.runtime.trust ? { trust: a.runtime.trust } : {}),
                    });
                    mark([{ name: a.runtime.name, config: done.configWritten }], false);
                  } else set(a, "failed", quoted(after.problems[0] ?? "the check is not ok"));
                } catch (error) {
                  const message = quoted((error as Error).message);
                  set(
                    a,
                    "failed",
                    error instanceof InstallFailed && error.written > 0
                      ? `${message}; partly written; crew runtime check ${a.runtime.name} shows the state`
                      : message,
                  );
                }
              }
            }
          }
        }
        const all = [...results.values()];
        if (all.every((r) => r.status === "up to date" || r.status === "updated")) {
          recordAdapterVersion(paths, o.root, o.version);
          refresh.recorded = true;
        }
        writeEntry();
        // What the run updated, whole, for a caller whose mark could not be written; the mark
        // learns here that the register entry was appended.
        const updated = all.filter((r) => r.status === "updated");
        if (updated.length && head !== null) {
          const runtimes = updated.map((r) => ({ name: r.runtime, config: r.configWritten }));
          refresh.entry = { version: o.version, at, head, runtimes, register: refresh.appended };
          if (refresh.appended) mark(runtimes, true);
        }
      },
      lockOptions,
    );
  } catch (error) {
    if (!(error instanceof LockBusy)) throw error;
    for (const a of toInstall) set(a, "stale", "another session is updating");
  }
  return finish();
}
