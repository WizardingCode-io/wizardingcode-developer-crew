import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  linkSync,
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
  ensureDir(dir);
  for (let n = 1; ; n++) {
    const target = join(dir, n === 1 ? `${base}${ext}` : `${base}-${n}${ext}`);
    if (write(target, text)) return target;
  }
}

/**
 * Two files under one free name, `<base><first ext>` and `<base><second ext>`, then `<base>-2…` and
 * on: the first written exclusively, then the second; when the second name is held, the first file
 * this call created is removed and the next name tried; when the second write fails otherwise, the
 * first is removed and the error stands. Returns the first file's path (2026-10-25-002, a CTO plan
 * and the inputs it was written from, never one without the other).
 */
export function createFreePair(
  dir: string,
  base: string,
  first: [ext: string, text: string],
  second: [ext: string, text: string],
  write: (path: string, text: string) => boolean = writeTextNew,
): string {
  ensureDir(dir);
  for (let n = 1; ; n++) {
    const stem = join(dir, n === 1 ? base : `${base}-${n}`);
    const head = `${stem}${first[0]}`;
    if (!write(head, first[1])) continue;
    let paired = false;
    try {
      paired = write(`${stem}${second[0]}`, second[1]);
    } finally {
      if (!paired) rmSync(head, { force: true });
    }
    if (paired) return head;
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
