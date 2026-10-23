import { basename, dirname, relative } from "node:path";
import { readText, sha256, writeJson, writeText } from "./fs.ts";
import { withLock } from "./lock.ts";
import type { CrewPaths } from "./paths.ts";

type Integrity = Record<string, string>;

/** A person may write the policy by hand; every other protected file is written only by the engine. */
const HAND_WRITTEN = ".crew/policy.json";

/** A path as the records name it: from the project's root, with forward slashes. */
export function rel(paths: CrewPaths, absPath: string): string {
  return relative(paths.root, absPath).replace(/\\/g, "/");
}

/**
 * `corrupt` when the file exists but is not a JSON object, or cannot be read (a directory, no
 * permission, finding 30): nothing it vouched for can be trusted. Only an absent file is empty.
 */
function readIntegrityFile(file: string): { map: Integrity; corrupt: boolean } {
  let text: string | null;
  try {
    text = readText(file);
  } catch {
    return { map: {}, corrupt: true };
  }
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
  return readIntegrityFile(paths.integrityFile).map;
}

function rememberIn(file: string, key: string, text: string): void {
  const integrity = readIntegrityFile(file).map;
  integrity[key] = sha256(text);
  writeJson(file, integrity);
}

/**
 * A repository's hash recorded under the store's lock (finding 29): `withLock` on the integrity
 * file's folder, so two writers never lose each other's hash; a lock held past the wait throws
 * `LockBusy` and nothing is written unlocked. The `At` writers need no lock of their own: a
 * mailbox's integrity file sits in the mailbox folder, whose lock every writer of a box holds.
 */
function remember(paths: CrewPaths, absPath: string, text: string): void {
  const file = paths.integrityFile;
  withLock(dirname(file), () => rememberIn(file, rel(paths, absPath), text), {
    what: "integrity record",
  });
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
 * The one tamper rule. A file is tampered when its content no longer matches the recorded hash,
 * when the integrity file does not parse, or when the engine never recorded it although it
 * recorded others. A file with no hash is trusted only on true first use (nothing recorded yet)
 * or when it is hand-written by design. A missing file is not tampered: it simply holds nothing.
 */
function readProtected<T>(
  integrityFile: string,
  key: string,
  absPath: string,
  handWritten: boolean,
): Protected<T> & { text: string | null } {
  // A file that is there but cannot be read (finding 30) holds nothing to trust.
  let text: string | null;
  try {
    text = readText(absPath);
  } catch {
    return { data: null, tampered: true, text: null };
  }
  if (text === null) return { data: null, tampered: false, text };
  const { map, corrupt } = readIntegrityFile(integrityFile);
  const expected = map[key];
  const tampered = corrupt
    ? true
    : expected === undefined
      ? !handWritten && Object.keys(map).length > 0
      : expected !== sha256(text);
  try {
    return { data: JSON.parse(text) as T, tampered, text };
  } catch {
    return { data: null, tampered: true, text };
  }
}

/** A protected file of a repository, keyed by its path from the root in the repository's integrity file; the policy may be hand-written. */
export function readProtectedJson<T>(paths: CrewPaths, absPath: string): Protected<T> {
  const { data, tampered } = readProtectedText<T>(paths, absPath);
  return { data, tampered };
}

/** `readProtectedJson` with the very text the hash was checked on, for a byte-for-byte copy (session lanes, AC-5). */
export function readProtectedText<T>(
  paths: CrewPaths,
  absPath: string,
): Protected<T> & { text: string | null } {
  const key = rel(paths, absPath);
  return readProtected<T>(paths.integrityFile, key, absPath, key === HAND_WRITTEN);
}

/**
 * A protected file outside any repository (a mailbox, the registry): the integrity file sits
 * beside it and is keyed by file name, since the file belongs to no repository's record.
 */
export function writeProtectedJsonAt(integrityFile: string, absPath: string, data: unknown): void {
  const text = `${JSON.stringify(data, null, 2)}\n`;
  writeText(absPath, text);
  rememberIn(integrityFile, basename(absPath), text);
}

/** Records the current content of a file outside any repository the user accepted (a mailbox), in the integrity file beside it. */
export function recordIntegrityAt(integrityFile: string, absPath: string): boolean {
  const text = readText(absPath);
  if (text === null) return false;
  rememberIn(integrityFile, basename(absPath), text);
  return true;
}

/** The same rule, against the integrity file beside the file; nothing there is hand-written. */
export function readProtectedJsonAt<T>(integrityFile: string, absPath: string): Protected<T> {
  const { data, tampered } = readProtected<T>(integrityFile, basename(absPath), absPath, false);
  return { data, tampered };
}
