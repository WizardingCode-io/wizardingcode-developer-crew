// What the code-quality reviewer receives beside the diff (2026-10-29-001, P-6): the dependencies a
// change adds to its manifests and the action-shaped fallback phrases of its added lines. Inputs,
// never a finding on their own: the rubric's questions 7 and 9 read them. Every manifest is hostile
// input: bounded, parsed without throwing, read for its four sections' own string keys alone.

import { basename, join } from "node:path";
import { gitShowFile } from "./fingerprint.ts";
import { readRegular, regularFileSize } from "./fs.ts";
import { isMarkdownPath } from "./paths-kind.ts";
import { safeText } from "./quote.ts";
import { type AddedLine, addedLines } from "./secrets.ts";
import type { Profile } from "./types.ts";

const MANIFEST_MAX = 1024 * 1024;
const NAMES_MAX = 50;
const PHRASES_MAX = 50;
const SECTIONS: Record<string, readonly string[]> = {
  "package.json": ["dependencies", "devDependencies"],
  "composer.json": ["require", "require-dev"],
};
const IGNORED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export type DependencyInput =
  | { file: string; unreadable: true }
  | { file: string; added: Record<string, string[]>; more?: number };

/** A manifest's text parsed as an object, or `unreadable` (over the cap, not JSON, not an object). Never throws. */
function parsed(text: string): Record<string, unknown> | "unreadable" {
  if (text.length > MANIFEST_MAX) return "unreadable";
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : "unreadable";
  } catch {
    return "unreadable";
  }
}

/** A section's names: a plain object's own string-valued keys, never the prototype's; composer's platform keys left out. */
function names(
  manifest: Record<string, unknown> | null,
  section: string,
  composer: boolean,
): string[] {
  const value = manifest?.[section];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as object).filter(
    (key) =>
      Object.hasOwn(value as object, key) &&
      !IGNORED_KEYS.has(key) &&
      !(composer && (key === "php" || key.startsWith("ext-"))),
  );
}

/** The names each changed `package.json` and `composer.json` adds per section, between the base commit and now. */
export function dependencyInputs(
  root: string,
  base: string | null,
  changed: readonly string[],
): DependencyInput[] {
  const out: DependencyInput[] = [];
  for (const file of [...changed].sort()) {
    const kind = basename(file);
    const sections = SECTIONS[kind];
    if (!sections) continue;
    // A deleted manifest adds nothing; one over the cap, or one that cannot be read, is unreadable.
    if (regularFileSize(join(root, file)) === null) continue;
    const shown = base ? gitShowFile(root, base, file) : null;
    const before = shown === null ? null : parsed(shown);
    const bytes = readRegular(join(root, file), MANIFEST_MAX);
    const now = bytes instanceof Buffer ? parsed(bytes.toString("utf8")) : "unreadable";
    if (now === "unreadable" || before === "unreadable") {
      out.push({ file: safeText(file), unreadable: true });
      continue;
    }
    const composer = kind === "composer.json";
    const added: Record<string, string[]> = {};
    let total = 0;
    for (const section of sections) {
      const had = new Set(names(before, section, composer));
      const fresh = names(now, section, composer)
        .filter((n) => !had.has(n))
        .sort();
      if (!fresh.length) continue;
      const room = Math.max(0, NAMES_MAX - total);
      added[section] = fresh.slice(0, room).map((n) => safeText(n));
      total += fresh.length;
    }
    if (!Object.keys(added).length) continue;
    out.push(
      total > NAMES_MAX
        ? { file: safeText(file), added, more: total - NAMES_MAX }
        : { file: safeText(file), added },
    );
  }
  return out;
}

/** An action-shaped fallback phrase, as a whole word, and the benign forms a match inside is dropped from. */
const FALLBACK =
  /(?<![\p{L}\p{N}])(add a fallback|fall back to|fallback to|workaround|shim)(?![\p{L}\p{N}])/giu;
const BENIGN = /fallback value|default value|workaround for #\d+/giu;

/** The added lines' fallback phrases (outside Markdown), each match dropped when it sits inside a benign form, at most fifty. */
export function phraseInputs(
  lines: readonly AddedLine[],
): { file: string; line: number; phrase: string }[] {
  const out: { file: string; line: number; phrase: string }[] = [];
  for (const added of lines) {
    if (isMarkdownPath(added.file)) continue;
    const benign: [number, number][] = [...added.text.matchAll(BENIGN)].map((m) => [
      m.index ?? 0,
      (m.index ?? 0) + m[0].length,
    ]);
    for (const m of added.text.matchAll(FALLBACK)) {
      const at = m.index ?? 0;
      if (benign.some(([from, to]) => at >= from && at < to)) continue;
      out.push({ file: added.file, line: added.line, phrase: safeText(m[0].toLowerCase()) });
      break;
    }
    if (out.length >= PHRASES_MAX) break;
  }
  return out;
}

/** The two inputs of the code-quality reviewer, as `inputs.json` carries them (judgement.ts `ReviewInputs`). */
export interface ReviewSignals {
  dependencies: DependencyInput[];
  phrases: { file: string; line: number; phrase: string }[];
}

/** Both inputs for a change, as the gate run writes them into `inputs.json`. */
export function reviewSignals(
  root: string,
  profile: Profile,
  base: string | null,
  changed: readonly string[],
): ReviewSignals {
  const wanted = new Set(changed);
  const { lines } = addedLines(root, profile, base, (path) => wanted.has(path));
  return {
    dependencies: dependencyInputs(root, base, changed),
    phrases: phraseInputs(lines),
  };
}

/** Whether a value read back from `inputs.json` is a dependency input of the shape `dependencyInputs` writes. */
export function isDependencyInput(value: unknown): value is DependencyInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.file !== "string") return false;
  if (v.unreadable === true) return true;
  const added = v.added;
  if (!added || typeof added !== "object" || Array.isArray(added)) return false;
  const lists = Object.values(added as Record<string, unknown>);
  if (!lists.every((l) => Array.isArray(l) && l.every((n) => typeof n === "string"))) return false;
  return v.more === undefined || typeof v.more === "number";
}

/** Whether a value read back from `inputs.json` is a phrase input of the shape `phraseInputs` writes. */
export function isPhraseInput(value: unknown): value is ReviewSignals["phrases"][number] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.file === "string" && typeof v.line === "number" && typeof v.phrase === "string";
}
