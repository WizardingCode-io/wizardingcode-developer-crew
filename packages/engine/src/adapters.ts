import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { appendDecision, lastEntryText, registerTampered } from "./decisions.ts";
import { gitStatusEntries } from "./fingerprint.ts";
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
}

/** The one path every root, path and message takes before it is shown: one line, no control or bidi character, 200 characters at most. */
export const quoted = (text: string): string => quotedText(text, 200);
const PLUGIN_CACHE_VERSION =
  /\/plugins\/cache\/[^/]+\/wizardingcode-developer-crew\/(\d+\.\d+\.\d+)$/;
const LOCK_WAIT_MS = 2000;
/** At most this many paths are named in a hold-back reason; the rest are counted. */
const PATHS_NAMED = 3;

type Check = ReturnType<typeof checkRuntime>;
/** An own-root adapter: the runtime, the root as its configuration names it, its configuration file and its first check. */
interface Own {
  runtime: Runtime;
  root: string;
  configPath: string;
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
function linkProblem(own: Own[], paths: CrewPaths, dirs: InstallDirs): string | null {
  for (const a of own) {
    const problem = adapterLinkProblem(paths.root, a.runtime, dirs, a.root);
    if (problem) return quoted(problem);
  }
  return null;
}

/**
 * The hold-back the adapters' git status gives, or null when their files are clean: a checkout
 * that is no repository, a changed or renamed path, an untracked one (an adapter installed and
 * never committed), an ignored one, or a status git could not read.
 */
function gitHoldBack(own: Own[], paths: CrewPaths, dirs: InstallDirs): string | null {
  if (!existsSync(join(paths.root, ".git"))) return "not a git repository";
  const pathspec = new Set<string>();
  for (const a of own) {
    pathspec.add(a.configPath);
    pathspec.add(join(resolveScoped(a.runtime.skillsDir.project, dirs), "crew-method"));
    if (a.runtime.agentsDir)
      pathspec.add(join(resolveScoped(a.runtime.agentsDir.project, dirs), "crew-*"));
  }
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

/** The register's text of a refresh: each adapter's result, and the versions and root it moved between. */
export function adaptersEntryText(refresh: Refresh, root: string): string {
  const results = refresh.results
    .map((r) => `${r.runtime} ${r.status}${r.why ? ` (${r.why})` : ""}`)
    .join(", ");
  return `adapters: ${results} (from ${refresh.from ?? "none"} to ${refresh.version} at ${quoted(root)})`;
}

/**
 * The command that commits a refresh: the configuration files it wrote, the shared skill folder,
 * the `crew-*` agents of each updated runtime and the register when an entry was appended, each
 * single-quoted; `-A` with the pathspecs stages the prune's deletions too; `-m` so it runs with no
 * editor. Null when nothing was updated.
 */
export function commitCommand(refresh: Refresh, _dirs: InstallDirs): string | null {
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
 * The SessionStart line of a refresh, or null when every adapter is up to date and every foreign
 * one is on another root: each result, each foreign adapter that is not simply another engine's,
 * then once each the note that an update applies from the runtime's next session, the commit
 * command, and the hold-back suffixes that tell the person what ends the hold-back.
 */
export function adaptersLine(
  refresh: Refresh,
  root: string,
  dirs: InstallDirs,
  extra: string[] = [],
): string | null {
  const parts: string[] = [];
  for (const r of refresh.results) {
    if (r.status === "up to date") continue;
    if (r.status === "updated")
      parts.push(
        `${r.runtime} updated (${r.differed} differed, ${r.removed} removed)${r.trust ? ` (${r.trust})` : ""}`,
      );
    else parts.push(`${r.runtime} ${r.status}${r.why ? ` (${r.why})` : ""}`);
  }
  for (const f of refresh.foreign) {
    if (f.why === "another root") continue;
    if (f.why === "root unreadable") parts.push(`${f.runtime} root unreadable (${quoted(f.path)})`);
    else
      parts.push(
        `${f.runtime} names ${quoted(f.root)} (${f.why}): run crew runtime install ${f.runtime} with the crew of the root to keep, such as ~/.local/share/wizardingcode-developer-crew/bin/crew`,
      );
  }
  parts.push(...extra);
  if (!parts.length) return null;
  let line = `adapters: ${parts.join("; ")}`;
  if (refresh.results.some((r) => r.status === "updated"))
    line += "; applies from each updated runtime's next session";
  const commit = commitCommand(refresh, dirs);
  if (commit) line += `. Commit: ${commit}`;
  const whys = refresh.results.map((r) => r.why ?? "");
  if (whys.includes("an item is active"))
    line += "; it is updated at a session start with no active item, or by crew projects update";
  if (whys.some((w) => w.startsWith("uncommitted changes")))
    line += "; commit or restore them first";
  const never = refresh.results.find((r) => r.why?.startsWith("not committed"));
  if (never)
    line += `; commit them to adopt the adapter, or run crew runtime install ${never.runtime} again`;
  void root;
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
    let c: string;
    try {
      c = canonical(named);
    } catch {
      foreign(named, "root gone");
      continue;
    }
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
    own.push({ runtime, root: named, configPath, first: check(runtime, named) });
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
    const ended = [...results.values()].some((r) =>
      ["updated", "refused", "failed"].includes(r.status),
    );
    if (!ended) return;
    refresh.results = own.map((a) => results.get(a.runtime.name) as AdapterResult);
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
  // A configuration the install would refuse (not JSON) is refused here, on the real run and the
  // dry run alike, so the dry run predicts it and nothing is installed over it.
  const toInstall = own.filter((a) => isStale(a.first) && !a.first.configRefused);
  for (const a of own)
    if (a.first.configRefused) set(a, "refused", quoted(a.first.configRefused));
    else if (!isStale(a.first))
      if (a.first.parts.events.state === "ok") set(a, "up to date");
      else set(a, "failed", quoted(a.first.problems[0] ?? "an event failed"));
  if (toInstall.length === 0) {
    const ended = [...results.values()].some(
      (r) => r.status === "failed" || r.status === "refused",
    );
    if (!o.dryRun && !ended) {
      recordAdapterVersion(paths, o.root, o.version);
      refresh.recorded = true;
    } else if (!o.dryRun && !registerTampered(paths)) {
      try {
        withLock(lock, writeEntry, lockOptions);
      } catch (error) {
        if (!(error instanceof LockBusy)) throw error;
      }
    }
    return finish();
  }
  const watched = changesWatched(toInstall);
  // 4: held back, nothing written.
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
    for (const a of toInstall) set(a, "stale", heldBack);
    return finish();
  }
  // 5: a link or a path outside the project refuses every own-root adapter.
  const problem = linkProblem(own, paths, dirs);
  if (problem) {
    for (const a of own) set(a, "refused", problem);
    if (!o.dryRun) {
      try {
        withLock(lock, writeEntry, lockOptions);
      } catch (error) {
        if (!(error instanceof LockBusy)) throw error;
        for (const a of own) set(a, "stale", "another session is updating");
      }
    }
    return finish();
  }
  // 6: the adapters' git status holds a write back.
  const held = gitHoldBack(own, paths, dirs);
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
  try {
    withLock(
      lock,
      () => {
        const still = toInstall.filter((a) => {
          if (isStale(check(a.runtime, a.root))) return true;
          set(a, "up to date");
          return false;
        });
        if (still.length) {
          const again = linkProblem(own, paths, dirs);
          if (again) for (const a of own) set(a, "refused", again);
          else {
            const heldNow = gitHoldBack(own, paths, dirs);
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
                  if (after.ok)
                    set(a, "updated", undefined, {
                      removed: done.removed.length,
                      configWritten: done.configWritten,
                      ...(done.configWritten && a.runtime.trust ? { trust: a.runtime.trust } : {}),
                    });
                  else set(a, "failed", quoted(after.problems[0] ?? "the check is not ok"));
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
      },
      lockOptions,
    );
  } catch (error) {
    if (!(error instanceof LockBusy)) throw error;
    for (const a of toInstall) set(a, "stale", "another session is updating");
  }
  return finish();
}
