import { relative } from "node:path";
import { readJson, readText, sha256, writeJson, writeText } from "./fs.ts";
import type { CrewPaths } from "./paths.ts";

type Integrity = Record<string, string>;

function rel(paths: CrewPaths, absPath: string): string {
  return relative(paths.root, absPath).replace(/\\/g, "/");
}

export function integrityOf(paths: CrewPaths): Integrity {
  return readJson<Integrity>(paths.integrityFile) ?? {};
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

/** Records the current content of a file a person edited by hand, such as policy.json. */
export function recordIntegrity(paths: CrewPaths, absPath: string): void {
  const text = readText(absPath);
  if (text !== null) remember(paths, absPath, text);
}

export interface Protected<T> {
  data: T | null;
  tampered: boolean;
}

/**
 * A file is tampered when the engine recorded a hash for it and the content no longer
 * matches. A file with no recorded hash (hand-written policy) is trusted until recorded.
 */
export function readProtectedJson<T>(paths: CrewPaths, absPath: string): Protected<T> {
  const text = readText(absPath);
  if (text === null) return { data: null, tampered: false };
  const expected = integrityOf(paths)[rel(paths, absPath)];
  const tampered = expected !== undefined && expected !== sha256(text);
  try {
    return { data: JSON.parse(text) as T, tampered };
  } catch {
    return { data: null, tampered: true };
  }
}
