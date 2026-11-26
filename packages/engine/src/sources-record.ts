// What a person said to the rows of a team's declaration, in this checkout on this machine
// (ADR 0025, the amendment on the record). The file is under the engine's local folder, which git
// ignores and only the engine writes. It is under no hash: it is read as a regular file under a
// cap and against a strict shape, and anything else reads as no record at all.

import { lstatSync } from "node:fs";
import { join } from "node:path";
import { ensureDir, readRegular, writeText } from "./fs.ts";
import { TEAMS } from "./team.ts";

/** What a person decided for a row: its lines ran, they said no, or its hosted server may receive what a session asks. */
export type SourceDecision = "installed" | "declined" | "consented";
const DECISIONS: readonly unknown[] = ["installed", "declined", "consented"];

export interface SourceEntry {
  team: string;
  /** The row's third cell, whole: with the team, the row's key. */
  page: string;
  decision: SourceDecision;
  /** The time of the record, as `Date.prototype.toISOString` writes it. */
  at: string;
  /** The row's install lines as the declaration held them when it was recorded. */
  lines: string[];
}

/** The record's name as the commands print it. */
export const SOURCES_RECORD_NAME = ".crew/local/sources.json";

const MAX_BYTES = 256 * 1024;
const MAX_ROWS = 500;
const MAX_LINES = 20;
const MAX_TEXT = 2000;
const VERSION = 1;
const AT_FORM = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ENTRY_KEYS: readonly string[] = ["team", "page", "decision", "at", "lines"];

export function sourcesRecordFile(root: string): string {
  return join(root, ".crew", "local", "sources.json");
}

/** What stands at a path, asked of the name itself: a link is a link, whatever it points at. */
function standing(path: string): "absent" | "folder" | "other" {
  try {
    return lstatSync(path).isDirectory() ? "folder" : "other";
  } catch {
    return "absent";
  }
}

/** The two folders above the record, each absent, a real folder, or something a record is not kept behind. */
function place(root: string): "absent" | "folders" | "refused" {
  const found = [join(root, ".crew"), join(root, ".crew", "local")].map(standing);
  if (found.includes("other")) return "refused";
  return found.includes("absent") ? "absent" : "folders";
}

/** Whether the engine's folder or its local folder is a link or is no folder, so nothing is read or recorded there. */
export function sourcesPlaceRefused(root: string): boolean {
  return place(root) === "refused";
}

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length >= 1 && value.length <= MAX_TEXT;

/** Whether a time is in the engine's own form and exists: the form alone lets the thirtieth of February by. */
function isTime(value: unknown): value is string {
  if (typeof value !== "string" || !AT_FORM.test(value)) return false;
  const time = new Date(value);
  return !Number.isNaN(time.getTime()) && time.toISOString() === value;
}

const sameKeys = (value: object, keys: readonly string[]) =>
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));

function isEntry(value: unknown): value is SourceEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  if (!sameKeys(value, ENTRY_KEYS)) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.team === "string" &&
    Object.hasOwn(TEAMS, entry.team) &&
    isText(entry.page) &&
    DECISIONS.includes(entry.decision) &&
    isTime(entry.at) &&
    Array.isArray(entry.lines) &&
    entry.lines.length >= 1 &&
    entry.lines.length <= MAX_LINES &&
    entry.lines.every(isText)
  );
}

const keyOf = (entry: Pick<SourceEntry, "team" | "page">) =>
  JSON.stringify([entry.team, entry.page]);

/** The entries of a text that fits the record's shape whole; null for any misfit. */
function entriesIn(text: string): SourceEntry[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  if (!sameKeys(data, ["version", "rows"])) return null;
  const { version, rows } = data as { version: unknown; rows: unknown };
  if (version !== VERSION || !Array.isArray(rows) || rows.length > MAX_ROWS) return null;
  if (!rows.every(isEntry)) return null;
  return new Set(rows.map(keyOf)).size === rows.length ? rows : null;
}

/**
 * The record of a checkout. `unread` says a file or a folder stands there that could not be read as
 * the engine writes it: it gives no entry, never some of them.
 */
export function readSourcesRecord(root: string): { entries: SourceEntry[]; unread: boolean } {
  const none = (unread: boolean) => ({ entries: [], unread });
  const where = place(root);
  if (where !== "folders") return none(where === "refused");
  const file = sourcesRecordFile(root);
  if (standing(file) === "absent") return none(false);
  const bytes = readRegular(file, MAX_BYTES);
  if (!(bytes instanceof Buffer)) return none(true);
  const entries = entriesIn(bytes.toString("utf8"));
  return entries === null ? none(true) : { entries, unread: false };
}

export type Recorded =
  | { ok: true; entry: SourceEntry; replaced: SourceEntry | null; notKept: boolean }
  | { ok: false; why: "place" | "bounds" };

/**
 * Records one row: its entry replaces the one that stood for its team and page, in its place, or is
 * added after the others. Nothing the reader would reject is written: a row past the bounds, a
 * 501st entry and a file that would pass the reader's cap are refused. A file that could not be read is started again (`notKept`).
 */
export function recordSourceRow(
  root: string,
  row: { team: string; page: string; decision: SourceDecision; lines: readonly string[] },
  at: string,
): Recorded {
  // A folder at the file's own name cannot be replaced by the write's rename.
  if (sourcesPlaceRefused(root) || standing(sourcesRecordFile(root)) === "folder")
    return { ok: false, why: "place" };
  const entry: SourceEntry = {
    team: row.team,
    page: row.page,
    decision: row.decision,
    at,
    lines: [...row.lines],
  };
  if (!isEntry(entry)) return { ok: false, why: "bounds" };
  const read = readSourcesRecord(root);
  const isRow = (held: SourceEntry) => keyOf(held) === keyOf(entry);
  const replaced = read.entries.find(isRow) ?? null;
  if (replaced === null && read.entries.length >= MAX_ROWS) return { ok: false, why: "bounds" };
  const rows =
    replaced === null
      ? [...read.entries, entry]
      : read.entries.map((held) => (isRow(held) ? entry : held));
  // Entries that each fit can together pass the cap the reader reads under.
  const text = `${JSON.stringify({ version: VERSION, rows }, null, 2)}\n`;
  if (Buffer.byteLength(text) > MAX_BYTES) return { ok: false, why: "bounds" };
  ensureDir(join(root, ".crew", "local"));
  writeText(sourcesRecordFile(root), text);
  return { ok: true, entry, replaced, notKept: read.unread };
}
