import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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

export function writeJson(path: string, data: unknown): void {
  writeText(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function nowIso(): string {
  return new Date().toISOString();
}
