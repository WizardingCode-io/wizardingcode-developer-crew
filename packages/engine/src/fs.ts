import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

/** What a caught value says: an error's message, anything else as a string. */
export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function exists(path: string): boolean {
  return existsSync(path);
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

/**
 * The file's text, or null when no file is there (ENOENT). Any other failure (a directory, no
 * permission) is thrown (finding 30): a file that is there but cannot be read is not an absent one.
 */
export function readText(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/**
 * The file's text, or null on any failure: for a read where a file that cannot be read means the
 * same as none (a detector's marker, a role's transcript, a JSON record that falls back to its
 * defaults), so a hook that reads it keeps its rule rather than failing open.
 */
export function readTextQuietly(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

/** A JSON file, or null when it is absent, cannot be read or does not parse: the caller's defaults apply. */
export function readJson<T>(path: string): T | null {
  const text = readTextQuietly(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * The size of a regular file, or null for anything else there (nothing, a directory, a symlink, a
 * FIFO): the stat never follows a link, so a planted one is seen as a link and never as its target.
 */
export function regularFileSize(path: string): number | null {
  try {
    const stat = lstatSync(path);
    return stat.isFile() ? stat.size : null;
  } catch {
    return null;
  }
}

/** Whether a regular file is there, by the rule of `regularFileSize`. */
export function isRegularFile(path: string): boolean {
  return regularFileSize(path) !== null;
}

/** Writes through a temporary file so a reader never sees a half-written file. */
export function writeText(path: string, text: string): void {
  ensureDir(dirname(path));
  const tmp = join(dirname(path), `.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

/**
 * The text at a path that holds nothing yet: a temporary file created exclusively under a random
 * name, hard-linked to the path, removed in every outcome. True when written; false when any entry
 * (a dangling symlink included) has the name, so it never replaces one; any other error is thrown.
 */
export function writeTextNew(path: string, text: string): boolean {
  const tmp = join(dirname(path), `.${randomUUID()}.tmp`);
  writeFileSync(tmp, text, { flag: "wx" });
  try {
    linkSync(tmp, path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * Writes the text at `<dir>/<base><ext>`, or at the first `<base>-<n><ext>` from 2 on that nobody
 * holds when it is written, and returns that path: a file of the same day never goes over an earlier
 * one, nor over one another writer created in the same instant (findings 53, 160). `write` is the
 * exclusive write; a test passes one that races it.
 */
export function createFreeFile(
  dir: string,
  base: string,
  ext: string,
  text: string,
  write: (path: string, text: string) => boolean = writeTextNew,
): string {
  return createFreeFiles(dir, base, [[ext, text]], write);
}

/** One file of a free set: its extension, and its text, or null for a name only held free. */
type FreeEntry = readonly [ext: string, text: string | null];

/**
 * A set of files under one free stem, `<base>` then `<base>-2` and on, and the first entry's path
 * returned (2026-10-25-002, 2026-10-25-003). Each entry with text is written exclusively, in order;
 * an entry with null text is only held free: a stem where anything has that name, a link to nothing
 * included, is passed over. When a name is held, the files this call wrote at the stem are removed and
 * the next stem tried; when a write fails otherwise, they are removed and the error stands.
 */
export function createFreeFiles(
  dir: string,
  base: string,
  files: readonly [FreeEntry, ...FreeEntry[]],
  write: (path: string, text: string) => boolean = writeTextNew,
): string {
  ensureDir(dir);
  for (let n = 1; ; n++) {
    const stem = join(dir, n === 1 ? base : `${base}-${n}`);
    if (files.some(([ext, text]) => text === null && holds(`${stem}${ext}`))) continue;
    const written: string[] = [];
    let complete = false;
    try {
      complete = files.every(([ext, text]) => {
        if (text === null) return true;
        const path = `${stem}${ext}`;
        if (!write(path, text)) return false;
        written.push(path);
        return true;
      });
    } finally {
      if (!complete) for (const path of written) rmSync(path, { force: true });
    }
    if (complete) return `${stem}${files[0][0]}`;
  }
}

/** Whether anything has the name, a link to nothing included. */
function holds(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** The engine's JSON form: two-space indents and a closing newline. */
export function jsonText(data: unknown): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

export function writeJson(path: string, data: unknown): void {
  writeText(path, jsonText(data));
}

export function nowIso(): string {
  return new Date().toISOString();
}
