import { readdirSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import { readText, readTextQuietly, sha256, writeJson, writeText } from "./fs.ts";
import { readUnderLock, withLock } from "./lock.ts";
import { type CrewPaths, PROTECTED_WORK_FILES } from "./paths.ts";

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

const STORE_LOCK = { what: "integrity record" };

/**
 * The store's lock: `withLock` on the integrity file's folder (finding 29), held over a protected
 * file's write and its hash's, so that the two always belong together (finding 239). A lock that
 * cannot be taken throws, `LockBusy` when it stays held past the wait, and nothing is written.
 * The `At` writers need no lock of their own: a mailbox's integrity file sits in the mailbox
 * folder, whose lock every writer of a box holds. No caller holds this lock when it calls into the
 * store, so it is never asked for twice by one process.
 */
function withStoreLock<T>(paths: CrewPaths, fn: () => T): T {
  return withLock(dirname(paths.integrityFile), fn, STORE_LOCK);
}

/**
 * A protected file written with its hash, both under the store's lock: a reader never finds one
 * writer's file beside another's hash, and a write that cannot take the lock leaves the file as
 * it was.
 */
export function writeProtectedText(paths: CrewPaths, absPath: string, text: string): void {
  withStoreLock(paths, () => {
    writeText(absPath, text);
    rememberIn(paths.integrityFile, rel(paths, absPath), text);
  });
}

export function writeProtectedJson(paths: CrewPaths, absPath: string, data: unknown): void {
  writeProtectedText(paths, absPath, `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * Records the current content of a file the user accepted, such as a hand-edited policy.json. The
 * file is read under the store's lock, so the hash recorded is that of the text it holds then,
 * whatever a writer did while the lock was waited for.
 */
export function recordIntegrity(paths: CrewPaths, absPath: string): boolean {
  return withStoreLock(paths, () => {
    const text = readText(absPath);
    if (text === null) return false;
    rememberIn(paths.integrityFile, rel(paths, absPath), text);
    return true;
  });
}

/**
 * The protected files a project may hold, as absolute paths: the profile, the register, and in
 * each folder of `.crew/work` that holds a `work.json`, the files of `PROTECTED_WORK_FILES`. The
 * policy is not among them: it is hand-written by design and trusted with no hash.
 */
function projectFiles(paths: CrewPaths): string[] {
  const files = [join(paths.crewDir, "profile.json"), join(paths.crewDir, "decisions.json")];
  const work = join(paths.crewDir, "work");
  let ids: string[] = [];
  try {
    ids = readdirSync(work);
  } catch {
    // no item yet
  }
  for (const id of ids) {
    const dir = join(work, id);
    if (readTextQuietly(join(dir, "work.json")) === null) continue;
    for (const name of PROTECTED_WORK_FILES) files.push(join(dir, name));
  }
  return files;
}

/** Whether a project's trust record holds nothing yet: absent or an empty object, never one that does not parse or cannot be read. */
function recordIsEmpty(file: string): boolean {
  const { map, corrupt } = readIntegrityFile(file);
  return !corrupt && Object.keys(map).length === 0;
}

/**
 * First use of a project on this machine (the user folder was removed, or the project was
 * cloned): while its trust record holds nothing, the tamper rule trusts every file with no hash,
 * and the engine's first write would then leave the others reading as changed outside the engine,
 * one file at a time. So the files the project already has are recorded as they stand, once.
 *
 * The record is looked at first with no lock: one that holds a hash, does not parse or cannot be
 * read ends it there, with nothing written and no lock taken. Otherwise everything happens in one
 * hold of the store's lock: the record is read again (a hook and a command start together, and
 * only one of them adopts), each file's text is read, and the record is written once. A file that
 * cannot be read is skipped. Answers the recorded paths from the project's root, sorted.
 */
export function adoptFirstUse(paths: CrewPaths): string[] {
  if (!recordIsEmpty(paths.integrityFile)) return [];
  const candidates = projectFiles(paths);
  // A project with no protected file gets no record and takes no lock.
  if (!candidates.some((file) => readTextQuietly(file) !== null)) return [];
  return withStoreLock(paths, () => {
    if (!recordIsEmpty(paths.integrityFile)) return [];
    const record: Integrity = {};
    for (const file of candidates) {
      const text = readTextQuietly(file);
      if (text !== null) record[rel(paths, file)] = sha256(text);
    }
    const recorded = Object.keys(record).sort();
    if (!recorded.length) return [];
    writeJson(paths.integrityFile, Object.fromEntries(recorded.map((key) => [key, record[key]])));
    return recorded;
  });
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
export function readProtectedJson<T>(
  paths: CrewPaths,
  absPath: string,
  waitMs?: number,
): Protected<T> {
  const { data, tampered } = readProtectedText<T>(paths, absPath, waitMs);
  return { data, tampered };
}

/** `readProtectedJson` with the very text the hash was checked on, for a byte-for-byte copy (session lanes, AC-5). */
export function readProtectedText<T>(
  paths: CrewPaths,
  absPath: string,
  waitMs?: number,
): Protected<T> & { text: string | null } {
  const key = rel(paths, absPath);
  const read = () => readProtected<T>(paths.integrityFile, key, absPath, key === HAND_WRITTEN);
  // With no lock first. A read that finds the file and its hash apart may have met a writer
  // between its two writes: it is made again under the store's lock, where `tampered` means a hand
  // (finding 239). `waitMs` is how long that lock is waited for; the lock's own wait when not given.
  const first = read();
  if (!first.tampered) return first;
  return readUnderLock(dirname(paths.integrityFile), first, read, { ...STORE_LOCK, waitMs });
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

/**
 * Records the current content of a file outside any repository the user accepted (a mailbox), in
 * the integrity file beside it; with `read`, the bytes the caller already read and checked are
 * recorded, never the file read a second time (the security lead's R-5 of 2026-10-23-004).
 */
export function recordIntegrityAt(integrityFile: string, absPath: string, read?: string): boolean {
  const text = read ?? readText(absPath);
  if (text === null) return false;
  rememberIn(integrityFile, basename(absPath), text);
  return true;
}

/** The same rule, against the integrity file beside the file; nothing there is hand-written. */
export function readProtectedJsonAt<T>(integrityFile: string, absPath: string): Protected<T> {
  const { data, tampered } = readProtected<T>(integrityFile, basename(absPath), absPath, false);
  return { data, tampered };
}
