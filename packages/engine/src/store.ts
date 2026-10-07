import { relative } from "node:path";
import { readText, sha256, writeJson, writeText } from "./fs.ts";
import type { CrewPaths } from "./paths.ts";

type Integrity = Record<string, string>;

/** A person may write the policy by hand; every other protected file is written only by the engine. */
const HAND_WRITTEN = ".crew/policy.json";

function rel(paths: CrewPaths, absPath: string): string {
  return relative(paths.root, absPath).replace(/\\/g, "/");
}

/** `corrupt` when the file exists but is not a JSON object: nothing it vouched for can be trusted. */
function readIntegrity(paths: CrewPaths): { map: Integrity; corrupt: boolean } {
  const text = readText(paths.integrityFile);
  if (text === null) return { map: {}, corrupt: false };
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return { map: {}, corrupt: true };
    return { map: parsed as Integrity, corrupt: false };
  } catch {
    return { map: {}, corrupt: true };
  }
}

export function integrityOf(paths: CrewPaths): Integrity {
  return readIntegrity(paths).map;
}

function remember(paths: CrewPaths, absPath: string, text: string): void {
  const integrity = integrityOf(paths);
  integrity[rel(paths, absPath)] = sha256(text);
  writeJson(paths.integrityFile, integrity);
}

export function writeProtectedText(paths: CrewPaths, absPath: string, text: string): void {
  writeText(absPath, text);
  remember(paths, absPath, text);
}

export function writeProtectedJson(paths: CrewPaths, absPath: string, data: unknown): void {
  writeProtectedText(paths, absPath, `${JSON.stringify(data, null, 2)}\n`);
}

/** Records the current content of a file the user accepted, such as a hand-edited policy.json. */
export function recordIntegrity(paths: CrewPaths, absPath: string): boolean {
  const text = readText(absPath);
  if (text === null) return false;
  remember(paths, absPath, text);
  return true;
}

export interface Protected<T> {
  data: T | null;
  tampered: boolean;
}

/**
 * A file is tampered when its content no longer matches the recorded hash, when the integrity
 * file does not parse, or when the engine never recorded it although it recorded others. A file
 * with no hash is trusted only on true first use (nothing recorded yet) or when it is the
 * hand-written policy. A missing file is not tampered: it simply holds nothing.
 */
export function readProtectedJson<T>(paths: CrewPaths, absPath: string): Protected<T> {
  const text = readText(absPath);
  if (text === null) return { data: null, tampered: false };
  const { map, corrupt } = readIntegrity(paths);
  const key = rel(paths, absPath);
  const expected = map[key];
  const tampered = corrupt
    ? true
    : expected === undefined
      ? key !== HAND_WRITTEN && Object.keys(map).length > 0
      : expected !== sha256(text);
  try {
    return { data: JSON.parse(text) as T, tampered };
  } catch {
    return { data: null, tampered: true };
  }
}
