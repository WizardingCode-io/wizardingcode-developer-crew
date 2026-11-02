import {
  changedWatchedPaths,
  computeFingerprint,
  gitHead,
  gitParent,
  gitTagsAt,
  UNAVAILABLE,
} from "./fingerprint.ts";
import { nowIso } from "./fs.ts";
import { processStart } from "./open.ts";
import type { CrewPaths } from "./paths.ts";
import {
  type ReleaseMarker,
  releasePermit,
  removeReleaseMarker,
  writeReleaseMarker,
} from "./running.ts";
import { loadState, sessionState, updateSession } from "./state.ts";
import type { Profile } from "./types.ts";
import { activeWork, noItemTurnEnds } from "./work.ts";

/**
 * What a release record answered: `recorded` only when the marker was written (the start) or the
 * baseline renewed (the end); the text is what the release script logs (2026-11-01-003).
 */
export interface RecordResult {
  recorded: boolean;
  text: string;
}

const no = (text: string): RecordResult => ({ recorded: false, text });

/**
 * The release script's record that a release started (finding 219): a marker of the release
 * folder, written only with a session, with no item active, on a tree the Stop rule would let end
 * by its content, from a process whose start time reads. A session the rule lets end whatever the
 * tree (no baseline, an unreadable fingerprint) gets no marker, whatever the last learned item
 * says: its turns end as they are, and a marker would only turn the rule on mid-session when the
 * end record renews the baseline.
 */
export function recordReleaseStart(
  paths: CrewPaths,
  profile: Profile,
  session: string | null,
  version: string,
): RecordResult {
  if (!session) return no(`release ${version}: no session, nothing recorded`);
  const active = activeWork(paths);
  if (active?.tampered)
    return no(
      `release ${version}: work item ${loadState(paths).active} is active and its record changed outside the engine; a release is recorded with no item open`,
    );
  if (active?.work)
    return no(
      `release ${version}: work item ${active.work.id} is active; a release is recorded with no item open`,
    );
  const state = sessionState(loadState(paths), session);
  const current = computeFingerprint(paths.root, profile, null);
  if (state.baseline === null || current === UNAVAILABLE)
    return no(
      `release ${version}: nothing to record: the Stop rule already lets this session's turns end`,
    );
  if (!noItemTurnEnds(paths, profile, state, current))
    return no(
      `release ${version}: the session has changes the engine has not proven (the tree differs from the session's baseline); nothing recorded, the Stop rule stands`,
    );
  const pid = process.pid;
  if (pid <= 1)
    return no(
      `release ${version}: the process id ${pid} is not one the engine can check; nothing recorded`,
    );
  const started = processStart(pid);
  if (started === "")
    return no(`release ${version}: the process's start time could not be read; nothing recorded`);
  const marker: ReleaseMarker = {
    command: `release ${version}`,
    pid,
    processStart: started,
    session,
    startedAt: nowIso(),
    version,
    head: gitHead(paths.root),
  };
  writeReleaseMarker(paths, marker);
  return {
    recorded: true,
    text: `release ${version} recorded for session ${session}: the turn may end while it runs`,
  };
}

/**
 * The release script's record that the release's commit is pushed (finding 219): from the process
 * that wrote the marker, on the recorded head's first child, clean and tagged, the session's
 * baseline becomes the tree's fingerprint and the marker goes; each failed check is a named refusal
 * that keeps the marker, and a marker past its age is removed by the read itself.
 */
export function recordReleaseDone(
  paths: CrewPaths,
  profile: Profile,
  session: string | null,
  version: string,
): RecordResult {
  if (!session) return no(`release ${version}: no session, nothing recorded`);
  const marker = releasePermit(paths, session);
  if (!marker || marker.version !== version)
    return no(`no release ${version} recorded for this session`);
  if (marker.pid !== process.pid)
    return no(`release ${version}: the marker was written by process ${marker.pid}, not this one`);
  const [dirty] = changedWatchedPaths(paths.root, profile);
  if (dirty) return no(`release ${version}: a watched file changed from HEAD: ${dirty}`);
  const parent = gitParent(paths.root);
  if (parent === "") return no(`release ${version}: HEAD has no parent`);
  if (parent !== marker.head)
    return no(
      `release ${version}: HEAD's first parent is ${parent.slice(0, 7)}, not the recorded ${marker.head.slice(0, 7)}`,
    );
  if (!gitTagsAt(paths.root).includes(`v${version}`))
    return no(`release ${version}: v${version} is not on HEAD`);
  const current = computeFingerprint(paths.root, profile, null);
  if (current === UNAVAILABLE) return no(`release ${version}: the tree could not be fingerprinted`);
  updateSession(paths, session, (state) => {
    state.baseline = current;
    state.stopBlocks = 0;
  });
  removeReleaseMarker(paths, marker.pid);
  return {
    recorded: true,
    text: `release ${version} done: the session's baseline is now commit ${gitHead(paths.root).slice(0, 7)}`,
  };
}
