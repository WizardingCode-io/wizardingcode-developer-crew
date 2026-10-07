import { join } from "node:path";
import { detectProfile } from "./detect/index.ts";
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

/** Detection is file reads only, so a missing profile is built on the spot. */
export function ensureProfile(paths: CrewPaths): { profile: Profile; tampered: boolean } {
  const existing = loadProfile(paths);
  if (existing.profile) return { profile: existing.profile, tampered: existing.tampered };
  const profile = detectProfile(paths.root);
  saveProfile(paths, profile);
  return { profile, tampered: false };
}
