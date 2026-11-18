// Three readers and their median (item 2026-11-18-011): which readings of a site's design review
// are a round's three, and the one text their medians make. A round is the readings the hook filed
// on one fingerprint of the item's evidence; its three are the first three by time, counted from
// the protected records and never from the files that still stand, so a session cannot drop a
// reading it dislikes and keep the rest.
import { join } from "node:path";
import { DIMENSIONS_OF_THE_BAR, parseScore } from "./design.ts";
import { type BarLines, parseBarLines } from "./design-bar.ts";
import { loadEvidence } from "./evidence.ts";
import { readRegularText } from "./fs.ts";
import { type CrewPaths, READING_FILE, workDir } from "./paths.ts";
import type { RoleRecord } from "./types.ts";
import { fileHash } from "./validation.ts";

const READING_MAX_BYTES = 1024 * 1024;
const CLARIFICATIONS = "## Clarifications";
const COUNT_LINE = /^reference:[ \t]*(\d+)[ \t]+shots\b/m;

/** What the score command says when it records nothing: fixed words, each with its own remedy. */
export const READERS_REFUSALS = {
  third:
    "two readings of this code are on record: a third reader is owed before a score is recorded",
  broken:
    "a reading of the first three was changed or is missing: no score is recorded for this round; a new round begins with a gate run on changed code",
} as const;

export interface RoundReadings {
  /** How many readers the hook filed on this code. */
  filed: number;
  /** The first three's first answers, when all three still count; null otherwise. */
  three: string[] | null;
}

/** A reviewer's first answer: the text above its clarifications, which a resumed reviewer adds below. */
function firstAnswer(text: string): string {
  const lines = text.split("\n");
  const at = lines.findIndex((line) => line.trimEnd() === CLARIFICATIONS);
  return at < 0 ? text : lines.slice(0, at).join("\n");
}

/**
 * The round of the evidence's present fingerprint: the hook-filed `review-ui-ux` records that took
 * it, the first of each agent id, in the order they were filed. A reading counts while its file
 * stands with the hash of the latest record the hook filed for that agent id and that file, and
 * its first answer holds a score line. A record with no fingerprint (filed before any gate run), a
 * session's filing, and a record with no agent id are of no round.
 */
export function roundReadings(paths: CrewPaths, id: string): RoundReadings {
  const { evidence, tampered } = loadEvidence(paths, id);
  const fingerprint = evidence.fingerprint;
  if (tampered || !fingerprint) return { filed: 0, three: null };
  const own = (r: RoleRecord): boolean =>
    r.agent === "review-ui-ux" &&
    typeof r.agentId === "string" &&
    r.filedBy !== "session" &&
    r.code === fingerprint &&
    typeof r.file === "string" &&
    READING_FILE.test(r.file);
  const records = (evidence.roles ?? []).filter(own);
  const first: RoleRecord[] = [];
  for (const r of records) if (!first.some((f) => f.agentId === r.agentId)) first.push(r);
  if (first.length < 3) return { filed: first.length, three: null };
  const dir = workDir(paths, id);
  const three: string[] = [];
  for (const reader of first.slice(0, 3)) {
    const latest = records
      .filter((r) => r.agentId === reader.agentId && r.file === reader.file)
      .at(-1);
    const text = reader.file ? readRegularText(join(dir, reader.file), READING_MAX_BYTES) : null;
    if (text === null || !latest?.fileHash || fileHash(text) !== latest.fileHash)
      return { filed: first.length, three: null };
    const answer = firstAnswer(text);
    if (!parseScore(answer)) return { filed: first.length, three: null };
    three.push(answer);
  }
  return { filed: first.length, three };
}

const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? Number.NaN;

/**
 * The three readings as one text of the reviewer's own shape, which `parseScore` and the bar's
 * reader then read as they read one reviewer's: the median of the overall figure; the caps where
 * two readings name one, those the capping readings name, each once; the word two readings give,
 * `fix` where no two agree; and, where all three readings' lines for the bar were read with one
 * count of shots, the medians of each dimension and of each figure of the level. Nothing of a
 * reading reaches the text but its figures and its caps.
 */
export function medianFindings(three: readonly string[]): { text: string; capsUnapplied: number } {
  const scores = three.map((t) => parseScore(t)).filter((s) => s !== null);
  const bars = three.map((t) => parseBarLines(t));
  const capping = scores.filter((s) => s.caps.length > 0);
  const caps = capping.length >= 2 ? [...new Set(capping.flatMap((s) => s.caps))] : [];
  const words = bars.map((b) => b.word);
  const word = words.find((w, i) => w !== null && words.indexOf(w) !== i) ?? "fix";
  const lines = [
    `score: ${median(scores.map((s) => s.score))} · caps: ${caps.length ? caps.join(", ") : "none"} · disposition: ${word}`,
  ];
  const read = bars.map((b) => b.lines).filter((l): l is BarLines => l !== null);
  if (read.length === three.length && read.every((l) => l.shots === read[0]?.shots)) {
    const figures = (pick: (l: BarLines) => BarLines["level"]): string =>
      DIMENSIONS_OF_THE_BAR.map((d) => `${d} ${median(read.map((l) => pick(l)[d]))}`).join(" · ");
    lines.push(
      `dimensions: ${figures((l) => l.dimensions)}`,
      `reference: ${read[0]?.shots} shots`,
      `level: ${figures((l) => l.level)}`,
    );
  } else {
    // The lines unread, the count kept where the three readings give one: a count that differs
    // from the approved shots is still said as that, as for one reading.
    const counts = three.map((t) => Number(COUNT_LINE.exec(t)?.[1] ?? Number.NaN));
    if (Number.isFinite(counts[0]) && counts.every((c) => c === counts[0]))
      lines.push(`reference: ${counts[0]} shots`);
  }
  return { text: `${lines.join("\n")}\n`, capsUnapplied: capping.length === 1 ? 1 : 0 };
}
