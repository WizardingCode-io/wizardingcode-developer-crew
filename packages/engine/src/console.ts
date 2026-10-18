import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** One console entry a run wrote (SP7 §8.3): the page, the message's type and its text. */
export interface ConsoleEntry {
  page: string;
  type: string;
  text: string;
}

export type ConsoleGrade =
  | { status: "none"; file: null }
  | { status: "invalid"; file: string }
  | { status: "failed"; file: string; first: ConsoleEntry }
  | { status: "clean"; file: string };

/** `warn` and `warning` are one level; anything else keeps its name. */
function levelOf(type: string): string {
  return type === "warn" ? "warning" : type;
}

/** The entries of a console file: each an object with a string `type`; anything else is ignored. */
function entriesOf(parsed: unknown[]): ConsoleEntry[] {
  const entries: ConsoleEntry[] = [];
  for (const raw of parsed) {
    if (!raw || typeof raw !== "object") continue;
    const { page, type, text } = raw as Record<string, unknown>;
    if (typeof type !== "string") continue;
    entries.push({
      page: typeof page === "string" ? page : "",
      type: levelOf(type),
      text: typeof text === "string" ? text : "",
    });
  }
  return entries;
}

/**
 * The console a run captured under `dir` (rule 5): `console.json`, a JSON array, or else
 * `console.jsonl`, one JSON object per line. The first entry at error or warning fails; a file that
 * does not parse is invalid; no file is none. A forged entry can fail the gate, never pass it.
 */
export function gradeConsole(dir: string): ConsoleGrade {
  const array = join(dir, "console.json");
  const lines = join(dir, "console.jsonl");
  let parsed: unknown[];
  let file: string;
  if (existsSync(array)) {
    file = array;
    try {
      const data: unknown = JSON.parse(readFileSync(array, "utf8"));
      if (!Array.isArray(data)) return { status: "invalid", file };
      parsed = data;
    } catch {
      return { status: "invalid", file };
    }
  } else if (existsSync(lines)) {
    file = lines;
    try {
      parsed = readFileSync(lines, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l) as unknown);
    } catch {
      return { status: "invalid", file };
    }
  } else return { status: "none", file: null };
  const first = entriesOf(parsed).find((e) => e.type === "error" || e.type === "warning");
  return first ? { status: "failed", file, first } : { status: "clean", file };
}

/**
 * A line at error or warning: leading punctuation, an optional timestamp (digits first, bracketed
 * or not), an optional bracket, then the word as a whole word, so `errors handled: 0` and
 * `warnings: none` are clean; or a JSON `"level"` field or a `level=` pair at that level.
 */
const LEVEL_AT_START = /^\W*(?:\[?\d[\dT:\-./Z ]*\]?\s*)?\[?(error|warn|warning)\b/i;
const LEVEL_FIELD = /"level"\s*:\s*"(error|warn|warning)"/i;
const LEVEL_PAIR = /\blevel=(error|warn|warning)\b/i;

/** The lines a run added to the environment's logs (rule 5): the first at error or warning fails. */
export function gradeLogs(text: string): { status: "clean" } | { status: "failed"; first: string } {
  for (const line of text.split("\n")) {
    if (LEVEL_AT_START.test(line) || LEVEL_FIELD.test(line) || LEVEL_PAIR.test(line))
      return { status: "failed", first: line.trim() };
  }
  return { status: "clean" };
}
