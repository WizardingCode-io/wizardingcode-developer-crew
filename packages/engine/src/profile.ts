import { join } from "node:path";
import { detectProfile, profileChanges } from "./detect/index.ts";
import { packRules } from "./packs.ts";
import type { CrewPaths } from "./paths.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type { Profile } from "./types.ts";

export function profilePath(paths: CrewPaths): string {
  return join(paths.crewDir, "profile.json");
}

export function loadProfile(paths: CrewPaths): { profile: Profile | null; tampered: boolean } {
  const read = readProtectedJson<Profile>(paths, profilePath(paths));
  return { profile: read.data, tampered: read.tampered };
}

export function saveProfile(paths: CrewPaths, profile: Profile): void {
  writeProtectedJson(paths, profilePath(paths), profile);
}

/**
 * The profile follows the manifests (finding 23): detection runs again, a person's commands and
 * targets stay (`mergeProfile`), and when a target, a package manager or a detected command changed
 * the new profile is saved and the changes returned, one line each. Nothing is written when nothing
 * changed, and a profile changed outside the engine is left for the user to accept.
 */
export function refreshProfile(
  paths: CrewPaths,
  current: Profile,
  tampered = false,
): { profile: Profile; changed: string[] } {
  if (tampered) return { profile: current, changed: [] };
  const next = detectProfile(paths.root, current, packRules(paths.userDir));
  const changed = profileChanges(current, next);
  if (changed.length === 0) return { profile: current, changed };
  saveProfile(paths, next);
  return { profile: next, changed };
}

/** Detection is file reads only, so a missing profile is built on the spot. */
export function ensureProfile(paths: CrewPaths): { profile: Profile; tampered: boolean } {
  const existing = loadProfile(paths);
  if (existing.profile) return { profile: existing.profile, tampered: existing.tampered };
  // The registered packs' rules read with the core detectors (SP6 Task 2), here and at every refresh.
  const profile = detectProfile(paths.root, null, packRules(paths.userDir));
  // A profile that exists but does not parse was changed outside the engine: overwriting it would
  // hide that, so the fresh detection is used in memory only and the state stays tampered.
  if (existing.tampered) return { profile, tampered: true };
  saveProfile(paths, profile);
  return { profile, tampered: false };
}
