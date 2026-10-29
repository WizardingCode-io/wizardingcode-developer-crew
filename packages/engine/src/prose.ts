// The prose gate (2026-10-29-001, P-5; the user's decision D-2): a built-in gate over the change's
// added lines, as `secrets` is, failing on the artefacts a chat model leaves in shipped text (a
// chatbot's phrases, a knowledge-cutoff disclaimer, a model's markup). Three rules of fixed phrases,
// bounded on both sides, so a word inside another never trips one; an allowance with a why is the
// way out, listed beside the hits. Distilled from department-of-prose (MIT, CyranoB, 60ef0cc) and
// ai-slop-cleaner of oh-my-claudecode (MIT, Yeachan Heo, 8690a21), in the crew's words (ADR 0017).

import { join } from "node:path";
import { readRegularText } from "./fs.ts";
import { isMarkdownPath, isTestPath } from "./paths-kind.ts";
import { quotedText } from "./quote.ts";
import { type AddedLine, addedLines, MAX_BYTES } from "./secrets.ts";
import type { Profile } from "./types.ts";

export const PROSE_RULES = [
  "prose/chatbot-artefact",
  "prose/cutoff-disclaimer",
  "prose/model-markup",
] as const;
export type ProseRule = (typeof PROSE_RULES)[number];

/**
 * Each phrase is written in parts, so this file's own lines never carry one: the gate runs on
 * every item, this repository's included, and a definition is not an artefact.
 */
const p = (...parts: string[]) => parts.join("");
/** The markers a model's search tool leaves with an index after them: bounded before, never after. */
const SEARCH_MARKERS = [p("turn0", "search"), p("cite", "turn")];
const PHRASES: Record<ProseRule, readonly string[]> = {
  "prose/chatbot-artefact": [
    p("As an ", "AI"),
    p("as a large ", "language model"),
    p("I hope ", "this helps"),
    p("I hope ", "this clarifies"),
    p("Certain", "ly!"),
    p("Great ", "question"),
    p("feel free ", "to ask"),
    p("Let me know ", "if you"),
  ],
  "prose/cutoff-disclaimer": [
    p("as of my ", "last update"),
    p("as of my ", "knowledge cutoff"),
    p("I don't have ", "access to real-time"),
  ],
  "prose/model-markup": [
    p("<|im_", "start|>"),
    p("<|im_", "end|>"),
    p("<|endof", "text|>"),
    p("[IN", "ST]"),
    p("<think", "ing>"),
    ...SEARCH_MARKERS,
  ],
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const PREFIX_MARKERS: ReadonlySet<string> = new Set(SEARCH_MARKERS);
/** A fixed phrase bounded on each side where it starts or ends in a letter or digit: linear time, no nested quantifier. */
function phrasePattern(phrase: string): RegExp {
  const start = /^[\p{L}\p{N}]/u.test(phrase) ? "(?<![\\p{L}\\p{N}])" : "";
  const end =
    /[\p{L}\p{N}]$/u.test(phrase) && !PREFIX_MARKERS.has(phrase) ? "(?![\\p{L}\\p{N}])" : "";
  return new RegExp(`${start}${escapeRegExp(phrase)}${end}`, "iu");
}
const PATTERNS: { rule: ProseRule; pattern: RegExp }[] = PROSE_RULES.flatMap((rule) =>
  PHRASES[rule].map((phrase) => ({ rule, pattern: phrasePattern(phrase) })),
);

/** `crew-lint: allow prose/<rule> -- <why>`: one rule, a non-blank why. */
const ALLOWANCE = /crew-lint:\s*allow\s+(prose\/[a-z-]+)\s+--\s*(.*?)\s*(?:\*\/|-->|$)/;

export interface ProseHit {
  rule: ProseRule;
  file: string;
  line: number;
  text: string;
}
export interface ProseAllowed {
  rule: ProseRule;
  file: string;
  line: number;
  why: string;
}

/** The allowance a line carries for the rule, or null: the rule named alone, a why after ` -- `. */
function allowanceFor(text: string | null, rule: ProseRule): string | null {
  if (text === null) return null;
  const match = ALLOWANCE.exec(text);
  if (!match || match[1] !== rule) return null;
  const why = (match[2] ?? "").trim();
  return why ? why : null;
}

/**
 * The hits of the added lines: each line's first matching rule, unless the line itself or the
 * line just above it in the same file (read from the new file) carries that rule's allowance;
 * the model's markup is not a hit in a test file.
 */
export function scanProse(
  lines: readonly AddedLine[],
  lineAt: (file: string, line: number) => string | null,
): { hits: ProseHit[]; allowed: ProseAllowed[] } {
  const hits: ProseHit[] = [];
  const allowed: ProseAllowed[] = [];
  for (const added of lines) {
    const found = PATTERNS.find(
      ({ rule, pattern }) =>
        pattern.test(added.text) && !(rule === "prose/model-markup" && isTestPath(added.file)),
    );
    if (!found) continue;
    const why =
      allowanceFor(added.text, found.rule) ??
      (added.line > 1 ? allowanceFor(lineAt(added.file, added.line - 1), found.rule) : null);
    if (why !== null)
      allowed.push({ rule: found.rule, file: added.file, line: added.line, why: quotedText(why) });
    else
      hits.push({
        rule: found.rule,
        file: added.file,
        line: added.line,
        text: quotedText(added.text),
      });
  }
  return { hits, allowed };
}

/**
 * The gate: the item's change since `base` (the watched paths it changed, plus the Markdown it
 * changed, which the watch leaves out and is prose too), the hits by file and line, the allowed and
 * the skipped named; how the change was read is said, and a change that could not be read at all
 * leaves the gate unavailable, never clean.
 */
export function runProse(
  root: string,
  profile: Profile,
  base: string | null,
  changed: readonly string[],
): { status: "pass" | "fail" | "unavailable"; tail: string } {
  const own = new Set(changed);
  const { lines, skipped, mode } = addedLines(
    root,
    profile,
    base,
    (path) => !path.startsWith(".crew/") && (own.has(path) || isMarkdownPath(path)),
  );
  if (mode.kind === "unreadable")
    return { status: "unavailable", tail: `the change could not be read: ${mode.why}` };
  const cache = new Map<string, string[] | null>();
  const lineAt = (file: string, line: number) => {
    if (!cache.has(file))
      cache.set(file, readRegularText(join(root, file), MAX_BYTES)?.split("\n") ?? null);
    return cache.get(file)?.[line - 1] ?? null;
  };
  const scan = scanProse(lines, lineAt);
  const tail = [
    ...(mode.kind === "whole tree"
      ? [`no diff: the change read as every watched file whole (${mode.why})`]
      : []),
    // Every name and line is the change's own text, quoted (the security advisory at round 2).
    ...scan.hits.map((h) => `${h.rule} ${quotedText(h.file)}:${h.line}: "${h.text}"`),
    ...scan.allowed.map((a) => `allowed ${a.rule} ${quotedText(a.file)}:${a.line} -- ${a.why}`),
    ...skipped.map((s) => `skipped ${quotedText(s.file)} (${s.reason})`),
  ];
  return {
    status: scan.hits.length ? "fail" : "pass",
    tail: tail.join("\n") || "no chatbot artefacts in the change",
  };
}
