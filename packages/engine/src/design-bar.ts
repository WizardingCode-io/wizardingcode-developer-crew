// The bar of a new site with references (item 2026-11-18-008, the user's D-1, option C): the
// reviewer's three lines after the score line, the user's approval of the references that may set
// the bar, the fixture's record of pairs, and which bar a score is held to. A session can add a
// reference by itself, so nothing here reaches the references' bar without the user's `yes` to the
// question this module words, and without a pair for every approved shot.
import { lstatSync, realpathSync } from "node:fs";
import { join, sep } from "node:path";
import {
  type BarFigures,
  DIMENSIONS_OF_THE_BAR,
  designDir,
  SCORE_BAR,
  SCORE_LINE,
  type ScoreRecord,
} from "./design.ts";
import { ensureDir, readRegular, readRegularText, sha256 } from "./fs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type { GapDecision, WorkItem } from "./types.ts";
import { addDecision } from "./work.ts";

/** The level under which the references set no bar, on each dimension. */
export const LEVEL_FLOOR = 7.5;

// The bounds the pair helper holds (plugins/core/e2e/playwright.mjs), kept the same here.
const SHOT_NAME = /^[a-z0-9-]+$/;
const REF_NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*\.(png|jpe?g|webp)$/i;
const SHOTS_HEADER = "| Shot | Ref | Whose and from where | Shows | Take from it | Leave | Width |";
const SHOTS_MAX_BYTES = 256 * 1024;
const SHOTS_MAX_ROWS = 50;
const REF_MAX_BYTES = 20 * 1024 * 1024;
const WIDTH_MIN = 200;
const WIDTH_MAX = 4000;
const RECORD_MAX_BYTES = 1024 * 1024;

/** Why the references did not set the bar: fixed sentences, the first that applies. */
export const BAR_SENTENCES = {
  notApproved: "no references approved by the user for the bar",
  list: "the shot list no longer names an approved shot once",
  changed: "a reference changed since it was approved",
  noDigest: "a pair's record does not carry the approved reference's digest",
  noPair: "an approved shot has no pair on the fixture's record",
  older: "the fixture's record is older than a capture it pairs",
  readers: "fewer than three readers read the references",
  count: "the review read another number of shots than were approved",
  unread: "the review's lines for the dimensions and the level were not read",
  low: `the references read under ${LEVEL_FLOOR} on`,
} as const;

export interface BarLines {
  dimensions: BarFigures;
  shots: number;
  level: BarFigures;
}

const FIGURES = DIMENSIONS_OF_THE_BAR.map((d) => `${d} (\\d{1,2}(?:\\.\\d+)?)`).join(" · ");
const DIMENSIONS_LINE = new RegExp(`^dimensions: ${FIGURES}$`);
const LEVEL_LINE = new RegExp(`^level: ${FIGURES}$`);
const REFERENCE_LINE = /^reference: (\d{1,3}) shots$/;

function figures(match: RegExpExecArray | null): BarFigures | null {
  if (!match) return null;
  const values = DIMENSIONS_OF_THE_BAR.map((_, i) => Number(match[i + 1]));
  if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 10)) return null;
  return Object.fromEntries(DIMENSIONS_OF_THE_BAR.map((d, i) => [d, values[i]])) as BarFigures;
}

/**
 * The word of the disposition as the reviewer wrote it, and the three lines for the bar. The lines
 * are read only as the three that follow the score line, in the rubric's order with nothing between
 * them, each shape once in the whole file and never inside a fenced block; anything else leaves all
 * three unread. A text reaches no field: only figures do.
 */
export function parseBarLines(findings: string): { word: string | null; lines: BarLines | null } {
  const score = SCORE_LINE.exec(findings);
  if (!score) return { word: null, lines: null };
  const word = score[3] ?? null;
  const all = findings.split("\n").map((line) => line.trimEnd());
  const at = findings.slice(0, score.index).split("\n").length - 1;
  const fences = all.slice(0, at).filter((line) => line.trimStart().startsWith("```")).length;
  const once = (shape: string): boolean =>
    all.filter((line) => line.trimStart().startsWith(shape)).length === 1;
  if (fences % 2 === 1 || !once("dimensions:") || !once("reference:") || !once("level:"))
    return { word, lines: null };
  const dimensions = figures(DIMENSIONS_LINE.exec(all[at + 1] ?? ""));
  const shots = Number(REFERENCE_LINE.exec(all[at + 2] ?? "")?.[1] ?? 0);
  const level = figures(LEVEL_LINE.exec(all[at + 3] ?? ""));
  if (!dimensions || !level || !Number.isInteger(shots) || shots < 1) return { word, lines: null };
  return { word, lines: { dimensions, shots, level } };
}

// The approval: `crew design <id> bar` words the question, the user answers it.

export interface BarShot {
  shot: string;
  width: number;
  ref: string;
  digest: string;
}
export interface BarRecord {
  /** The decision this record's question was put as. */
  decision: string;
  /** When the question was put: for a person reading the file; the engine does not read it. */
  at: string;
  shots: BarShot[];
}

const barFile = (paths: CrewPaths, id: string) => join(designDir(paths, id), "bar.json");
const named = (shot: { shot: string; width: number }): string => `${shot.shot}@${shot.width}`;

/** The question the command puts, in fixed words: nothing of the session's is in it but the shots' names. */
export function barQuestion(shots: readonly string[]): string {
  return `May these references set the bar of this site's design review, each dimension held to the references' level in place of ${SCORE_BAR} overall: ${shots.join(", ")}? Answer yes or no.`;
}
const BAR_DEFAULT = `no: the bar of ${SCORE_BAR} overall stands`;

/** The record whose hash holds; a record a hand changed is no record. */
export function readBar(paths: CrewPaths, id: string): BarRecord | null {
  const read = readProtectedJson<BarRecord>(paths, barFile(paths, id));
  return read.tampered ? null : read.data;
}

/** True only for the user's `yes`, the word alone, to the question the command wrote for this record's shots. */
export function barApproved(
  decisions: readonly Pick<GapDecision, "id" | "question" | "answer" | "by">[] | undefined,
  bar: Pick<BarRecord, "decision" | "shots"> | null,
): boolean {
  if (!bar || !Array.isArray(bar.shots) || bar.shots.length === 0) return false;
  const decision = (decisions ?? []).find((d) => d.id === bar.decision);
  if (!decision) return false;
  return (
    decision.question === barQuestion(bar.shots.map(named)) &&
    decision.answer === "yes" &&
    decision.by === "user"
  );
}

const isDir = (path: string): boolean => {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
};

/** The rows of the item's shot list as cells, or null when the list is absent, not a regular file or too large. */
function shotRows(folder: string): string[][] | null {
  if (!isDir(join(folder, "design"))) return null;
  const text = readRegularText(join(folder, "design", "shots.md"), SHOTS_MAX_BYTES);
  if (text === null) return null;
  const lines = text.split("\n").map((line) => line.trim());
  const header = lines.indexOf(SHOTS_HEADER);
  if (header < 0) return null;
  const rows: string[][] = [];
  for (const line of lines.slice(header + 1)) {
    if (!line.startsWith("|")) break;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim().replace(/^`+|`+$/g, ""));
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    rows.push(cells);
    if (rows.length > SHOTS_MAX_ROWS) return null;
  }
  return rows;
}

/** The reference a shot's one row names, or why there is none. */
function refOfShot(
  rows: string[][],
  shot: string,
  width: number,
): { ref: string } | { why: string } {
  const own = rows.filter((cells) => cells[0] === shot && cells[6] === String(width));
  if (own.length === 0) return { why: `${shot}@${width} has no row in design/shots.md` };
  if (own.length > 1) return { why: `${shot}@${width} has ${own.length} rows in design/shots.md` };
  const ref = own[0]?.[1] ?? "";
  if (!REF_NAME.test(ref))
    return { why: `the reference of ${shot}@${width} is no bare picture name` };
  return { ref };
}

/** The digest of a reference's bytes, read under the pair helper's bounds; null when a bound fails. */
function refDigest(folder: string, ref: string): string | null {
  const refs = join(folder, "design", "refs");
  if (!REF_NAME.test(ref) || !isDir(refs)) return null;
  const path = join(refs, ref);
  try {
    if (!realpathSync(path).startsWith(`${realpathSync(folder)}${sep}`)) return null;
  } catch {
    return null;
  }
  const bytes = readRegular(path, REF_MAX_BYTES);
  return bytes instanceof Buffer ? sha256(bytes) : null;
}

/**
 * `crew design <id> bar --shots a@1280,b@360`: puts the question as a decision of the item and
 * records which bytes it was asked of. Every refusal adds no decision and writes nothing. A new run
 * is a new question, so an earlier `yes` never reaches other shots; a run while the last question
 * waits is refused, so a session cannot pile questions until one is answered.
 */
export function requestBar(
  paths: CrewPaths,
  work: WorkItem,
  shotsFlag: string | undefined,
  at: string,
): { ok: true; decision: GapDecision; record: BarRecord } | { ok: false; why: string } {
  const no = (why: string) => ({ ok: false as const, why });
  const asked = (shotsFlag ?? "").split(",").filter((part) => part !== "");
  if (asked.length === 0) return no("name the shots: --shots <shot@width>,…");
  if (new Set(asked).size !== asked.length) return no("a shot is named twice");
  const earlier = readBar(paths, work.id);
  const waiting = (work.decisions ?? []).find((d) => d.id === earlier?.decision);
  if (waiting && waiting.answer === undefined)
    return no(`${waiting.id} already asks it and waits for the user's answer`);
  const folder = workDir(paths, work.id);
  const rows = shotRows(folder);
  if (rows === null) return no("design/shots.md is not there as a shot list");
  const shots: BarShot[] = [];
  for (const part of asked) {
    const match = /^([^@]+)@(\d{1,5})$/.exec(part);
    const shot = match?.[1] ?? "";
    const width = Number(match?.[2] ?? 0);
    if (!SHOT_NAME.test(shot) || width < WIDTH_MIN || width > WIDTH_MAX)
      return no("a shot is <name>@<width>, the name in [a-z0-9-] and the width in pixels");
    const row = refOfShot(rows, shot, width);
    if ("why" in row) return no(row.why);
    const digest = refDigest(folder, row.ref);
    if (digest === null)
      return no(
        `the reference of ${shot}@${width} is not a regular file of 20 MB at most in design/refs/`,
      );
    shots.push({ shot, width, ref: row.ref, digest });
  }
  const decision = addDecision(work, barQuestion(shots.map(named)), BAR_DEFAULT);
  const record: BarRecord = { decision: decision.id, at, shots };
  ensureDir(designDir(paths, work.id));
  writeProtectedJson(paths, barFile(paths, work.id), record);
  return { ok: true, decision, record };
}

// The fixture's record of pairs and the captures' metadata, read as far as the bar needs them.

function boundedJson(path: string): Record<string, unknown> | null {
  const text = readRegularText(path, RECORD_MAX_BYTES);
  if (text === null) return null;
  try {
    const data: unknown = JSON.parse(text);
    return typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const timeOf = (value: unknown): number =>
  typeof value === "string" ? Date.parse(value) : Number.NaN;

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** True for a regular file within the reference's bound that begins as a PNG does, which is what the pair helper writes. */
function isPng(path: string): boolean {
  const bytes = readRegular(path, REF_MAX_BYTES);
  return bytes instanceof Buffer && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

/** The sentence for what the fixture's files lack for the approved shots, or null when they hold. */
function evidenceSentence(ui: string, shots: readonly BarShot[]): string | null {
  const record = boundedJson(join(ui, "shots.json"));
  if (record?.by !== "fixture" || !Array.isArray(record.pairs)) return BAR_SENTENCES.noPair;
  let unpaired = false;
  for (const shot of shots) {
    const pair = `${named(shot)}.pair.png`;
    const entry = (record.pairs as unknown[]).find(
      (e): e is Record<string, unknown> =>
        typeof e === "object" &&
        e !== null &&
        (e as Record<string, unknown>).shot === shot.shot &&
        (e as Record<string, unknown>).width === shot.width,
    );
    if (!entry || entry.pair !== pair || !isPng(join(ui, pair))) unpaired = true;
    // The pair was composed from these bytes, by the helper's own read: other bytes than the
    // approved ones are another reference, whatever stands on disk when the score is recorded.
    // A record from a fixture before item 2026-11-18-008 has no digest, and says the same.
    else if (entry.digest !== shot.digest) return BAR_SENTENCES.noDigest;
  }
  if (unpaired) return BAR_SENTENCES.noPair;
  const paired = timeOf(record.at);
  for (const shot of shots) {
    const meta = boundedJson(join(ui, `${shot.shot}.json`));
    const captured = timeOf(meta?.at);
    if (meta?.by !== "fixture" || !Number.isFinite(captured)) return BAR_SENTENCES.older;
    if (!Number.isFinite(paired) || paired < captured) return BAR_SENTENCES.older;
  }
  return null;
}

/** What a score is held to: the fields of the record that say the bar, the figures and why, and the disposition, which replaces the parsed one where the record is written. */
export type BarOutcome = Pick<ScoreRecord, "bar" | "why" | "dimensions" | "level"> & {
  disposition: string;
};

/**
 * Which bar the score just read is held to, decided once at `crew design <id> score`. The
 * references set it only when the user approved them, each is unchanged, each approved shot is
 * paired on a fixture's record not older than its capture, the review counted the same shots, its
 * lines were read and the references' level is at the floor on every dimension. Otherwise the bar
 * is 8.5 overall and, where references were claimed or asked for, one fixed sentence says why.
 */
export function decideBar(
  paths: CrewPaths,
  work: WorkItem,
  findings: string,
  parsed: Pick<ScoreRecord, "caps" | "disposition">,
  /** How many readers the figures rest on: the references set the bar on three, never on fewer (item 2026-11-18-011). */
  readers = 1,
): BarOutcome {
  const overall = (why?: string): BarOutcome => ({
    bar: "overall",
    ...(why ? { why } : {}),
    disposition: parsed.disposition,
  });
  const bar = readBar(paths, work.id);
  const claimed = /^reference:[ \t]*\d+[ \t]+shots\b/m.test(findings);
  if (!bar && !claimed) return overall();
  if (!bar || !barApproved(work.decisions, bar)) return overall(BAR_SENTENCES.notApproved);
  const folder = workDir(paths, work.id);
  const rows = shotRows(folder) ?? [];
  // The list first, for every shot, then each reference: the sentences keep the order of the checks.
  const named = bar.shots.map((shot) => refOfShot(rows, shot.shot, shot.width));
  if (named.some((row) => "why" in row)) return overall(BAR_SENTENCES.list);
  for (const [i, shot] of bar.shots.entries()) {
    const row = named[i];
    if (!row || "why" in row || row.ref !== shot.ref) return overall(BAR_SENTENCES.changed);
    if (refDigest(folder, shot.ref) !== shot.digest) return overall(BAR_SENTENCES.changed);
  }
  const lacking = evidenceSentence(join(folder, "review", "ui"), bar.shots);
  if (lacking) return overall(lacking);
  if (readers < 3) return overall(BAR_SENTENCES.readers);
  const { word, lines } = parseBarLines(findings);
  const counted = Number(/^reference:[ \t]*(\d+)[ \t]+shots\b/m.exec(findings)?.[1] ?? Number.NaN);
  // A count that differs is said only where the findings hold a count: with none, the lines are unread.
  const count = lines?.shots ?? counted;
  if (Number.isFinite(count) && count !== bar.shots.length) return overall(BAR_SENTENCES.count);
  if (!lines) return overall(BAR_SENTENCES.unread);
  const low = DIMENSIONS_OF_THE_BAR.find((d) => lines.level[d] < LEVEL_FLOOR);
  if (low) return overall(`${BAR_SENTENCES.low} ${low}`);
  const under = DIMENSIONS_OF_THE_BAR.some((d) => lines.dimensions[d] < lines.level[d]);
  const disposition =
    word === "ship" && (under || parsed.caps.length > 0) ? "fix" : (word ?? parsed.disposition);
  return { bar: "references", dimensions: lines.dimensions, level: lines.level, disposition };
}
