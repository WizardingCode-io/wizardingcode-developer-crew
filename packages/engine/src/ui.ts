// The UI evidence's engine side (SP9 Task 3, design §4, ADR 0016): the screens the criteria declare,
// the plan the e2e gate writes for the crew's Playwright fixture (the viewports, the schemes, the
// screens), the dark scheme read from the profile or the project's stylesheets, the sweep of what an
// earlier fixture run left under `review/ui/`, the viewports a person sets, and what the gate run says
// of the captures against the declared screens. The folder `review/ui/` is the session's and the
// fixture's; the plan beside it is the engine's.

import {
  closeSync,
  type Dirent,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { isNewSite, readSurface } from "./design.ts";
import { isWatched } from "./fingerprint.ts";
import { isRegularFile, nowIso, readRegularText, writeText } from "./fs.ts";
import { type Capture, listCaptures, reviewDir } from "./judgement.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { quotedText, SAFE_TEXT_MAX, safeText } from "./quote.ts";
import { SKIP_DIRS } from "./skip-dirs.ts";
import type { Profile, Screen, UiArtifact, Viewport, WorkItem } from "./types.ts";

/** The fixture's rule for a page, a state or an interaction: what the engine reads back from a file name. */
export const SCREEN_NAME = /^[a-z0-9-]+$/;
export const SCREENS_RULE = "screens: use page:state with [a-z0-9-]+ names, comma-separated";
export const VIEWPORTS_RULE =
  "ui.viewports: one to six WxH pairs, integers 200 to 4000, comma-separated";
export const DARK_RULE = "ui.dark: true or false";

/** The standard's three widths (design §6): the defaults when the profile has no ui block. */
export const DEFAULT_VIEWPORTS: readonly Viewport[] = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];
const SIZE_MIN = 200;
const SIZE_MAX = 4000;
const VIEWPORTS_MAX = 6;

/** `page:state[,page:state]`, each name in the fixture's rule, each pair once; the rule otherwise. */
export function parseScreens(text: string): Screen[] | { refused: string } {
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (parts.length === 0) return { refused: SCREENS_RULE };
  const seen = new Map<string, Screen>();
  for (const part of parts) {
    const [page, state, ...rest] = part.split(":");
    if (rest.length || !page || !state || !SCREEN_NAME.test(page) || !SCREEN_NAME.test(state)) {
      return { refused: SCREENS_RULE };
    }
    seen.set(part, { page, state });
  }
  return [...seen.values()];
}

export interface ExpectedScreen extends Screen {
  criteria: string[];
}

/** The screens the live criteria declare (not a superseded one), with the criteria that declare each, sorted by page then state. */
export function expectedScreens(work: WorkItem): ExpectedScreen[] {
  const byKey = new Map<string, ExpectedScreen>();
  for (const criterion of work.criteria) {
    if (criterion.supersededBy || !criterion.screens) continue;
    for (const screen of criterion.screens) {
      const key = `${screen.page}-${screen.state}`;
      const entry = byKey.get(key) ?? { page: screen.page, state: screen.state, criteria: [] };
      if (!entry.criteria.includes(criterion.id)) entry.criteria.push(criterion.id);
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()].sort(
    (a, b) => a.page.localeCompare(b.page) || a.state.localeCompare(b.state),
  );
}

/** The name a width gets: mobile under 600, tablet under 1024, desktop otherwise. */
function viewportName(width: number): string {
  return width < 600 ? "mobile" : width < 1024 ? "tablet" : "desktop";
}

/** `WxH[,WxH]`, one to six, integers 200 to 4000, named by width (a second of a name gets the width appended). */
export function parseViewports(text: string): Viewport[] | { refused: string } {
  const parts = text
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (parts.length === 0 || parts.length > VIEWPORTS_MAX) return { refused: VIEWPORTS_RULE };
  const out: Viewport[] = [];
  const taken = new Set<string>();
  for (const part of parts) {
    const match = /^(\d+)x(\d+)$/.exec(part);
    if (!match) return { refused: VIEWPORTS_RULE };
    const width = Number(match[1]);
    const height = Number(match[2]);
    for (const size of [width, height]) {
      if (!Number.isInteger(size) || size < SIZE_MIN || size > SIZE_MAX)
        return { refused: VIEWPORTS_RULE };
    }
    const base = viewportName(width);
    const name = taken.has(base) ? `${base}-${width}` : base;
    if (taken.has(name)) return { refused: VIEWPORTS_RULE };
    taken.add(name);
    out.push({ name, width, height });
  }
  return out;
}

/** One line for `crew profile`: the viewports and the dark word. */
export function uiLine(ui: NonNullable<Profile["ui"]>): string {
  const viewports = ui.viewports.map((v) => `${v.width}x${v.height} ${v.name}`).join(", ");
  return `ui: viewports ${viewports}; dark: ${ui.dark === undefined ? "unset" : String(ui.dark)}`;
}

// The dark scheme.

const STYLE_EXTENSIONS = [
  ".css",
  ".scss",
  ".less",
  ".vue",
  ".svelte",
  ".tsx",
  ".jsx",
  ".astro",
  ".html",
  ".blade.php",
];
const DARK_FILES_MAX = 400;
const DARK_BYTES_MAX = 256 * 1024;
/** The media query, a `.dark` class as a whole token, or a `data-theme="dark"` attribute. */
const DARK = /prefers-color-scheme:\s*dark|\.dark(?![\w-])|data-theme=["']dark["']/;

function readHead(path: string, max: number): string {
  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(max);
    const read = readSync(fd, buffer, 0, max, 0);
    return buffer.subarray(0, read).toString("utf8");
  } finally {
    closeSync(fd);
  }
}

/**
 * Whether the project has a dark scheme: the profile's word when set; else the stylesheets and the
 * components, walked under the root in name order, no symlink followed, the dependency and build
 * folders and the watch's exclusions skipped, at most 400 files and the first 256 KB of each, the
 * walk stopping at the first match.
 */
export function darkScheme(
  root: string,
  profile: Profile,
): { dark: boolean; from: "profile" | "stylesheets" | "none" } {
  if (typeof profile.ui?.dark === "boolean") return { dark: profile.ui.dark, from: "profile" };
  let seen = 0;
  const walk = (dir: string, rel: string): boolean => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    } catch {
      return false;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink() || SKIP_DIRS.has(entry.name)) continue;
      const path = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (walk(join(dir, entry.name), path)) return true;
        if (seen >= DARK_FILES_MAX) return false;
        continue;
      }
      if (!entry.isFile()) continue;
      const lower = entry.name.toLowerCase();
      if (!STYLE_EXTENSIONS.some((ext) => lower.endsWith(ext)) || !isWatched(path, profile))
        continue;
      if (++seen > DARK_FILES_MAX) return false;
      try {
        if (DARK.test(readHead(join(dir, entry.name), DARK_BYTES_MAX))) return true;
      } catch {
        // unreadable: not the project's stylesheet
      }
    }
    return false;
  };
  return walk(root, "") ? { dark: true, from: "stylesheets" } : { dark: false, from: "none" };
}

// The plan.

export interface UiPlan {
  id: string;
  at: string;
  viewports: Viewport[];
  colorSchemes: ("light" | "dark")[];
  darkFrom: "profile" | "stylesheets" | "none";
  screens: ExpectedScreen[];
  /** A new site is captured whole (item 2026-10-30-005): the fixture's default state, the full page. */
  fullPage?: boolean;
}

export function uiPlanPath(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "review", "ui-plan.json");
}

/** Writes `review/ui-plan.json` for the fixture: the viewports, the schemes and the declared screens, derived, never authored. */
export function writeUiPlan(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
): { file: string; plan: UiPlan } {
  const { dark, from } = darkScheme(paths.root, profile);
  const plan: UiPlan = {
    id: work.id,
    at: nowIso(),
    viewports: (profile.ui?.viewports ?? DEFAULT_VIEWPORTS).map((v) => ({ ...v })),
    colorSchemes: dark ? ["light", "dark"] : ["light"],
    darkFrom: from,
    screens: expectedScreens(work),
    ...(isNewSite(readSurface(paths, work.id)) ? { fullPage: true } : {}),
  };
  const file = uiPlanPath(paths, work.id);
  writeText(file, `${JSON.stringify(plan, null, 2)}\n`);
  return { file, plan };
}

// The sweep.

const IMAGE_NAME = /^[a-z0-9-]+-[a-z0-9-]+@\d+(?:-dark)?\.(?:png|jpe?g)$/;
const CONSOLE_OR_AXE_NAME = /^(?:console|axe)-[a-z0-9-]+\.json$/;
const ARIA_NAME = /^[a-z0-9-]+\.aria\.yml$/;
const STRIP_NAME = /^[a-z0-9-]+\.strip\.png$/;
const MOTION_DIR = /^motion\/[a-z0-9-]+$/;
const FRAME_NAME = /^\d{2}\.png$/;

/** A name from a metadata file is data: accepted only in the fixture's shape and only inside the folder. */
function contained(ui: string, name: unknown, shape: RegExp): string | null {
  if (typeof name !== "string" || name.includes("\0") || !shape.test(name)) return null;
  const target = resolve(ui, name);
  return target.startsWith(`${resolve(ui)}${sep}`) ? target : null;
}

/** Removes a file or a symlink (as a link, never followed); a folder is left alone. */
function removeFile(target: string): boolean {
  try {
    const stat = lstatSync(target);
    if (stat.isDirectory()) return false;
    unlinkSync(target);
    return true;
  } catch {
    return false;
  }
}

/** Removes the fixture's frames folder: a real folder whose entries are frames, nothing else. */
function removeFrames(target: string): boolean {
  try {
    // The `motion` folder itself must be real: a symlinked intermediate folder is never followed.
    const parent = lstatSync(dirname(target));
    if (parent.isSymbolicLink() || !parent.isDirectory()) return false;
    const stat = lstatSync(target);
    if (!stat.isDirectory()) return false;
    const entries = readdirSync(target, { withFileTypes: true });
    if (!entries.every((e) => e.isFile() && FRAME_NAME.test(e.name))) return false;
    rmSync(target, { recursive: true, force: false });
    return true;
  } catch {
    return false;
  }
}

function isLink(target: string): boolean {
  try {
    return lstatSync(target).isSymbolicLink();
  } catch {
    return false;
  }
}

function readJsonFile(path: string): Record<string, unknown> | null {
  // A regular file only: a FIFO or a symlink planted there is never opened (the sweep reads data).
  if (!isRegularFile(path)) return null;
  try {
    const body = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * What an earlier fixture run left under `review/ui/`, removed before the next: each metadata file
 * whose `by` is `fixture` with the images, the console, the aria and the axe files it names, each
 * motion sample with its strip and its frames folder. A name outside the fixture's shape, or outside
 * the folder, is skipped and returned; the session's captures (bare names, `by: "session"`) stay.
 */
export function sweepStaleFixtureFiles(ui: string): { removed: string[]; skipped: string[] } {
  const removed: string[] = [];
  const skipped: string[] = [];
  if (!existsSync(ui)) return { removed, skipped };
  const take = (name: unknown, shape: RegExp, remove: (target: string) => boolean): void => {
    if (name === null || name === undefined) return;
    const target = contained(ui, name, shape);
    if (!target) {
      skipped.push(String(name));
      return;
    }
    // A target the remover refuses (a folder where a file was named, a frames folder under a
    // symlinked `motion`) is left alone and said; what is not there at all is no skip.
    if (remove(target)) removed.push(String(name));
    else if (existsSync(target) || isLink(target)) skipped.push(String(name));
  };
  for (const name of readdirSync(ui).sort()) {
    if (!name.endsWith(".json")) continue;
    const body = readJsonFile(join(ui, name));
    if (!body) continue;
    if (name.endsWith(".motion.json")) {
      if (typeof body.page !== "string" || typeof body.interaction !== "string") continue;
      const frames =
        body.frames && typeof body.frames === "object"
          ? (body.frames as Record<string, unknown>)
          : {};
      take(frames.dir, MOTION_DIR, removeFrames);
      take(frames.strip, STRIP_NAME, removeFile);
      if (removeFile(join(ui, name))) removed.push(name);
      continue;
    }
    if (body.by !== "fixture" || typeof body.page !== "string" || typeof body.state !== "string")
      continue;
    for (const viewport of Array.isArray(body.viewports) ? body.viewports : []) {
      if (!viewport || typeof viewport !== "object") continue;
      const v = viewport as Record<string, unknown>;
      take(v.light, IMAGE_NAME, removeFile);
      take(v.dark, IMAGE_NAME, removeFile);
    }
    take(body.console, CONSOLE_OR_AXE_NAME, removeFile);
    take(body.aria, ARIA_NAME, removeFile);
    const axe =
      body.axe && typeof body.axe === "object" ? (body.axe as Record<string, unknown>) : {};
    take(axe.file, CONSOLE_OR_AXE_NAME, removeFile);
    if (removeFile(join(ui, name))) removed.push(name);
  }
  return { removed, skipped };
}

/** The line the e2e run's tail carries when screens are declared: what the fixture was given to capture. */
export function planLine(plan: UiPlan): string | null {
  if (plan.screens.length === 0) return null;
  const screens = `${plan.screens.length} screen${plan.screens.length === 1 ? "" : "s"} declared`;
  return `ui plan: ${screens}; viewports ${plan.viewports.map((v) => v.width).join(", ")}; schemes ${plan.colorSchemes.join(", ")}`;
}

/** The line the e2e run's tail carries when the sweep skipped names outside the fixture's shape. */
export function sweepLine(skipped: readonly string[]): string | null {
  if (skipped.length === 0) return null;
  return `ui: skipped ${skipped.length} stale name${skipped.length === 1 ? "" : "s"} outside the fixture's shape: ${skipped.join(", ")}`;
}

// What the gate run says.

export interface ScreensSummary {
  captures: number;
  captured: number;
  expected: number;
  missing: string[];
  extra: string[];
  fixture: number;
  session: number;
  viewports: number[];
}

/** The captures against the declared screens: captured counts the expected screens with a capture; extra the captures nobody declared. */
export function screensSummary(
  expected: readonly ExpectedScreen[],
  captures: readonly Capture[],
): ScreensSummary {
  const have = new Set(captures.map((c) => `${c.page}-${c.state}`));
  const wanted = expected.map((s) => `${s.page}-${s.state}`);
  const wantedSet = new Set(wanted);
  const widths = [...new Set(captures.flatMap((c) => c.widths))].sort((a, b) => a - b);
  return {
    captures: captures.length,
    captured: wanted.filter((key) => have.has(key)).length,
    expected: wanted.length,
    missing: wanted.filter((key) => !have.has(key)),
    extra: wanted.length ? [...have].filter((key) => !wantedSet.has(key)).sort() : [],
    fixture: captures.filter((c) => c.by === "fixture").length,
    session: captures.filter((c) => c.by !== "fixture").length,
    viewports: widths,
  };
}

/** The gate run's line: against the declared screens when there are any, the plain count as before otherwise. */
export function capturesLine(summary: ScreensSummary, silent: readonly string[]): string {
  const silentPart = silent.length
    ? `${silent.length} without a console file: ${silent.join(", ")}`
    : null;
  if (summary.expected === 0) {
    if (summary.captures === 0) return "";
    return `captures: ${summary.captures}${silentPart ? ` (${silentPart})` : ""}`;
  }
  const parts = [
    `captures: ${summary.captured} of ${summary.expected} expected (fixture ${summary.fixture}, session ${summary.session})`,
  ];
  if (summary.missing.length) parts.push(`missing: ${summary.missing.join(", ")}`);
  if (summary.extra.length) parts.push(`extra: ${summary.extra.join(", ")}`);
  if (summary.viewports.length) parts.push(`viewports ${summary.viewports.join(", ")}`);
  if (silentPart) parts.push(silentPart);
  return parts.join("; ");
}

// The grading (SP9 Task 4, design §4): the evidence read as data after the console and the logs.

/** The standard's limits (design §6): Core Web Vitals' "good" for CLS; under reduced motion, opacity alone and short. */
export const CLS_LIMIT = 0.1;
export const REDUCED_MOTION_OPACITY_MS = 300;
const LAYOUT_PROPERTIES = [
  "width",
  "height",
  "top",
  "left",
  "right",
  "bottom",
  "margin",
  "padding",
  "inset",
];
const AXE_FAILING = new Set(["serious", "critical"]);
/** A file under `review/ui/` is data: its size is capped, its strings are made safe, its lists are cut. */
export const EVIDENCE_FILE_MAX = 1024 * 1024;
export const IDS_MAX = 5;

// The quoting rules live in quote.ts (no imports), so the scans can quote without the UI module.
export { quotedText, SAFE_TEXT_MAX, safeText };

/** At most `max` items, then the count of the rest. */
export function safeList(items: readonly string[], max = IDS_MAX): string {
  const shown = items.slice(0, max).map((item) => safeText(item));
  const rest = items.length - shown.length;
  return rest > 0 ? `${shown.join(", ")}, +${rest} more` : shown.join(", ");
}

export type ReducedMotionStatus = "clean" | "running" | "not captured";
export type AxeStatus = "clean" | "violations" | "not captured";
export type ConsoleStatus = "clean" | "error" | "not captured";

export interface UiScreenRow {
  page: string;
  state: string;
  criteria: string[];
  declared: boolean;
  by: "fixture" | "session" | null;
  captured: { light: number[]; dark: number[] } | null;
  console: ConsoleStatus;
  axe: AxeStatus;
  vitals: { cls: number | null; lcpMs: number | null; inpMs: number | null } | null;
  reducedMotion: ReducedMotionStatus;
  /** The page's own measurements (2026-10-29-001, P-1), set on a captured row: `not captured` where the capture has no field. */
  measures?: UiPageMeasures;
}

/** What the fixture measured in the page itself, per captured screen (2026-10-29-001). */
export interface UiPageMeasures {
  overflow: "clean" | "overflow" | "not captured";
  images: "clean" | "broken" | "not captured";
  fonts: "loaded" | "not loaded" | "not captured";
  hiddenText: "clean" | "hidden" | "not captured";
  /** The app-screen evidence the fixture measured at the narrowest width, numbers only (P-3); absent when not captured. */
  app?: UiAppMeasures;
}

/** The numbers of an app screen the ui-ux reviewer reads (rubric question 11): never a finding on their own. */
export interface UiAppMeasures {
  width: number;
  numericCells: number;
  rightAlignedShare: number;
  tabularShare: number;
  chartHues: number[];
  sidebarShare: number;
}

export interface UiInteractionRow {
  page: string;
  interaction: string;
  strip: boolean;
  animations: number;
  over50ms: number;
  reducedMotion: ReducedMotionStatus;
}

/** The manifest `review/ui-evidence.json` (design §4, decision 3 of the plan): what was declared, captured and measured. */
export interface UiEvidence {
  id: string;
  at: string;
  plan: { viewports: Viewport[]; colorSchemes: ("light" | "dark")[] };
  screens: UiScreenRow[];
  interactions: UiInteractionRow[];
  unreadable: string[];
  /** The deep audit's status, reason and pages (SP9 Task 7), set by the e2e run when it ran the audit. */
  audit?: { status: "captured" | "not captured"; reason: string | null; pages: string[] };
  summary: {
    captures: number;
    captured: number;
    expected: number;
    missing: string[];
    extra: string[];
    offence: string | null;
  };
}

export interface UiGrade {
  offence: string | null;
  lines: string[];
  manifest: UiEvidence;
  artifacts: UiArtifact | null;
}

export function uiEvidencePath(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "review", "ui-evidence.json");
}

type Json = Record<string, unknown>;

/** The JSON of a regular file under the cap, whatever its shape; `undefined` for anything else (a link, a FIFO, too big, not JSON). */
function readBoundedJson(path: string): unknown {
  const text = readRegularText(path, EVIDENCE_FILE_MAX);
  if (text === null) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

const isObject = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);
const finiteOrNull = (v: unknown): v is number | null =>
  v === null || (typeof v === "number" && Number.isFinite(v));
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** A JSON object from a file under the cap; `null` for anything else. */
function readBounded(path: string): Json | null {
  const body = readBoundedJson(path);
  return isObject(body) ? body : null;
}

interface Running {
  target: string;
  iterations: unknown;
  durationMs: number | null;
  properties: string[];
}

/** The shape of a reduced-motion entry (a capture's `running[]` or a sample's `animations[]`); null when it is not one. */
function runningEntry(raw: unknown): Running | null {
  if (!isObject(raw)) return null;
  if (!finiteOrNull(raw.durationMs ?? null)) return null;
  if (raw.properties !== undefined && !Array.isArray(raw.properties)) return null;
  return {
    target: safeText(raw.target ?? ""),
    iterations: raw.iterations,
    durationMs: (raw.durationMs as number | null | undefined) ?? null,
    properties: strings(raw.properties),
  };
}

type ReducedReading = { status: ReducedMotionStatus; entries: Running[] } | null;

/**
 * The reduced-motion block of a capture's metadata (`running`) or of a motion sample (`animations`):
 * absent reads as not captured; a status other than clean or running reads as not captured; the
 * list must be an array of entries of the shape above, else the block is the wrong shape (null).
 */
function readReduced(raw: unknown, key: "running" | "animations"): ReducedReading {
  if (raw === undefined) return { status: "not captured", entries: [] };
  if (!isObject(raw) || typeof raw.status !== "string") return null;
  if (raw.status !== "clean" && raw.status !== "running")
    return { status: "not captured", entries: [] };
  const list = raw[key] ?? [];
  if (!Array.isArray(list)) return null;
  const entries: Running[] = [];
  for (const item of list) {
    const entry = runningEntry(item);
    if (!entry) return null;
    entries.push(entry);
  }
  return { status: raw.status, entries };
}

/** Whether an animation still running under reduced motion breaks the standard: infinite, moving, or long. Only the fixture's string "Infinity" is infinite. */
function offendsReducedMotion(entry: Running): boolean {
  if (entry.iterations === "Infinity") return true;
  const moves = entry.properties.some(
    (p) =>
      p === "transform" ||
      LAYOUT_PROPERTIES.some((layout) => p === layout || p.startsWith(`${layout}-`)),
  );
  if (moves) return true;
  return entry.durationMs !== null && entry.durationMs > REDUCED_MOTION_OPACITY_MS;
}

/** AC-1's contract line for every entry that offends, named by the capture or the interaction. */
function reducedMotionOffences(entries: readonly Running[], label: string): string[] {
  return entries
    .filter(offendsReducedMotion)
    .map((entry) => `ui: animation still running under reduced motion: ${entry.target} (${label})`);
}

interface AxeReading {
  status: AxeStatus;
  reason: string | null;
  violations: { id: string; impact: string | null; nodes: number }[];
}

/** The axe file named by a metadata that claims clean or violations: its violations, or `unreadable` when the file is missing, too big or of the wrong shape. */
function readAxeFile(dir: string, name: string): AxeReading | "unreadable" | "missing" {
  if (!/^axe-[a-z0-9-]+\.json$/.test(name) || !existsSync(join(dir, name))) return "missing";
  const body = readBounded(join(dir, name));
  if (!body || !Array.isArray(body.violations)) return "unreadable";
  const violations: AxeReading["violations"] = [];
  for (const v of body.violations) {
    if (!isObject(v) || typeof v.id !== "string") return "unreadable";
    violations.push({
      id: safeText(v.id),
      impact: typeof v.impact === "string" ? safeText(v.impact) : null,
      nodes: typeof v.nodes === "number" && Number.isFinite(v.nodes) ? v.nodes : 0,
    });
  }
  return { status: violations.length ? "violations" : "clean", reason: null, violations };
}

interface MetaReading {
  axe: AxeReading;
  /** The axe file that could not be read, when the metadata named one. */
  axeUnreadable: string | null;
  vitals: UiScreenRow["vitals"];
  reducedMotion: { status: ReducedMotionStatus; entries: Running[] };
  /** The page's own measurements (2026-10-29-001, P-1). */
  page: PageReading;
}

/** A capture's metadata read for its shape (the fixture's); null when the shape is wrong. */
function readMeta(dir: string, meta: Json, base: string): MetaReading | null {
  if (typeof meta.page !== "string" || typeof meta.state !== "string") return null;
  if (meta.viewports !== undefined && !Array.isArray(meta.viewports)) return null;
  let axe: AxeReading = { status: "not captured", reason: "not measured", violations: [] };
  let axeUnreadable: string | null = null;
  if (meta.axe !== undefined) {
    if (!isObject(meta.axe) || typeof meta.axe.status !== "string") return null;
    if (meta.axe.status === "clean" || meta.axe.status === "violations") {
      // The file is the record; the metadata's summary is not trusted on its own.
      const name = typeof meta.axe.file === "string" ? meta.axe.file : `axe-${base}.json`;
      const read = readAxeFile(dir, name);
      if (read === "missing")
        axe = { status: "not captured", reason: `${safeText(name)} missing`, violations: [] };
      else if (read === "unreadable") {
        axeUnreadable = safeText(name);
        axe = { status: "not captured", reason: `${safeText(name)} unreadable`, violations: [] };
      } else axe = read;
    } else {
      axe = {
        status: "not captured",
        reason: safeText(meta.axe.reason ?? "not measured"),
        violations: [],
      };
    }
  }
  // All-null vitals are the fixture's "not captured"; a cls that is not a finite number is the wrong shape.
  let vitals: UiScreenRow["vitals"] = null;
  if (meta.vitals !== undefined && meta.vitals !== null) {
    if (!isObject(meta.vitals)) return null;
    const { cls, lcpMs, inpMs } = meta.vitals;
    const allNull = (cls ?? null) === null && (lcpMs ?? null) === null && (inpMs ?? null) === null;
    if (!allNull) {
      if (typeof cls !== "number" || !Number.isFinite(cls)) return null;
      if (!finiteOrNull(lcpMs ?? null) || !finiteOrNull(inpMs ?? null)) return null;
      vitals = {
        cls,
        lcpMs: (lcpMs as number | null | undefined) ?? null,
        inpMs: (inpMs as number | null | undefined) ?? null,
      };
    }
  }
  const reducedMotion = readReduced(meta.reducedMotion, "running");
  if (!reducedMotion) return null;
  return { axe, axeUnreadable, vitals, reducedMotion, page: readPage(meta) };
}

interface SampleReading {
  page: string;
  interaction: string;
  strip: boolean;
  animations: number;
  over50ms: number;
  reducedMotion: { status: ReducedMotionStatus; entries: Running[] };
}

/** A motion sample read for its shape; null when the shape is wrong. */
function readSample(dir: string, body: Json): SampleReading | null {
  if (typeof body.page !== "string" || typeof body.interaction !== "string") return null;
  if (body.frames !== undefined && !isObject(body.frames)) return null;
  if (body.animations !== undefined && !Array.isArray(body.animations)) return null;
  if (body.frameTimes !== undefined && !isObject(body.frameTimes)) return null;
  const frames = isObject(body.frames) ? body.frames : {};
  const stripName = typeof frames.strip === "string" ? frames.strip : null;
  const strip =
    stripName !== null && STRIP_NAME.test(stripName) && existsSync(join(dir, stripName));
  const over = isObject(body.frameTimes) ? body.frameTimes.over50ms : 0;
  const reducedMotion = readReduced(body.reducedMotion, "animations");
  if (!reducedMotion) return null;
  return {
    page: safeText(body.page),
    interaction: safeText(body.interaction),
    strip,
    animations: Array.isArray(body.animations) ? body.animations.length : 0,
    over50ms: typeof over === "number" && Number.isFinite(over) ? over : 0,
    reducedMotion,
  };
}

/** The console file beside a capture: clean, an error or a warning in it, or nothing readable. */
function consoleStatus(path: string | null): ConsoleStatus {
  const entries = path ? readBoundedJson(path) : undefined;
  if (!Array.isArray(entries)) return "not captured";
  const failing = entries.some(
    (e) => isObject(e) && (e.type === "error" || e.type === "warning" || e.type === "warn"),
  );
  return failing ? "error" : "clean";
}

function imageWidths(capture: Capture, dark: boolean): number[] {
  const suffix = dark ? "-dark" : "";
  return capture.widths.filter((w) =>
    capture.files.some((f) => f.replace(/\.(png|jpe?g)$/i, "").endsWith(`@${w}${suffix}`)),
  );
}

function emptyRow(page: string, state: string, criteria: string[], declared: boolean): UiScreenRow {
  return {
    page,
    state,
    criteria,
    declared,
    by: null,
    captured: null,
    console: "not captured",
    axe: "not captured",
    vitals: null,
    reducedMotion: "not captured",
  };
}

/** What the grading measured, before the lines, the manifest and the artifact are drawn from it. */
interface Measured {
  captures: Capture[];
  rows: Map<string, UiScreenRow>;
  interactions: UiInteractionRow[];
  unreadable: string[];
  reducedOffences: string[];
  axeOffences: string[];
  clsOffences: string[];
  /** The page's own offences (2026-10-29-001, P-1), graded after axe and before CLS, and the fonts' advisory lines. */
  overflowOffences: string[];
  imageOffences: string[];
  hiddenOffences: string[];
  fontLines: string[];
  axeViolations: string[];
  axeReasons: string[];
  axeClean: number;
  clsMax: { value: number; where: string } | null;
  lcpMax: number | null;
  reducedSeen: boolean;
  withoutStrip: number;
}

/** Reads the captures' metadata and the motion samples under the folder into one measurement. */
function measure(paths: CrewPaths, id: string, plan: UiPlan): Measured {
  const dir = join(reviewDir(paths, id), "ui");
  const m: Measured = {
    captures: listCaptures(paths, id),
    rows: new Map(),
    interactions: [],
    unreadable: [],
    reducedOffences: [],
    axeOffences: [],
    clsOffences: [],
    overflowOffences: [],
    imageOffences: [],
    hiddenOffences: [],
    fontLines: [],
    axeViolations: [],
    axeReasons: [],
    axeClean: 0,
    clsMax: null,
    lcpMax: null,
    reducedSeen: false,
    withoutStrip: 0,
  };
  for (const screen of plan.screens) {
    m.rows.set(
      `${screen.page}/${screen.state}`,
      emptyRow(screen.page, screen.state, [...screen.criteria], true),
    );
  }
  measureCaptures(m, paths, id, dir);
  measureSamples(m, dir);
  return m;
}

/** Each capture's row, with its console and its metadata (the axe, the vitals, the reduced-motion pass), added to the measurement. */
function measureCaptures(m: Measured, paths: CrewPaths, id: string, dir: string): void {
  for (const capture of m.captures) {
    const key = `${capture.page}/${capture.state}`;
    const label = `${capture.page}-${capture.state}`;
    const row = m.rows.get(key) ?? emptyRow(capture.page, capture.state, [], false);
    m.rows.set(key, row);
    row.by = capture.by;
    row.captured = {
      light: imageWidths(capture, false),
      dark: capture.dark ? imageWidths(capture, true) : [],
    };
    row.console = consoleStatus(capture.console ? join(workDir(paths, id), capture.console) : null);
    // The metadata by its name: listCaptures drops one it could not parse, which is exactly what is unreadable here.
    const metaName = `${label}.json`;
    if (!existsSync(join(dir, metaName))) continue;
    const body = readBounded(join(dir, metaName));
    const reading = body ? readMeta(dir, body, label) : null;
    if (!reading) {
      m.unreadable.push(metaName);
      continue;
    }
    if (reading.axeUnreadable) m.unreadable.push(reading.axeUnreadable);
    row.axe = reading.axe.status;
    row.vitals = reading.vitals;
    row.reducedMotion = reading.reducedMotion.status;
    if (reading.axe.status === "violations") {
      for (const v of reading.axe.violations) {
        m.axeViolations.push(`${v.id} on ${label}`);
        if (v.impact && AXE_FAILING.has(v.impact)) {
          m.axeOffences.push(`ui: axe ${v.impact} ${v.id} on ${label} (${v.nodes} nodes)`);
        }
      }
    } else if (reading.axe.status === "clean") m.axeClean += 1;
    else if (reading.axe.reason) m.axeReasons.push(reading.axe.reason);
    if (reading.vitals) {
      const where = basename(capture.file).replace(/\.[^.]+$/, "");
      const { cls, lcpMs } = reading.vitals;
      if (cls !== null && (m.clsMax === null || cls > m.clsMax.value))
        m.clsMax = { value: cls, where };
      if (cls !== null && cls > CLS_LIMIT)
        m.clsOffences.push(`ui: CLS ${cls} on ${where} (limit ${CLS_LIMIT})`);
      if (lcpMs !== null && (m.lcpMax === null || lcpMs > m.lcpMax)) m.lcpMax = lcpMs;
    }
    if (reading.reducedMotion.status !== "not captured") {
      m.reducedSeen = true;
      m.reducedOffences.push(...reducedMotionOffences(reading.reducedMotion.entries, label));
    }
    row.measures = reading.page.measures;
    pageOffences(m, reading.page, label);
  }
}

/** The page's strings from a field, at most ten, each quoted (`quotedText`); null when the field is not a list. */
function quotedStrings(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((v): v is string => typeof v === "string")
    .slice(0, 10)
    .map((v) => quotedText(v));
}

/** A finite number at or above zero, or null. */
function nonNegative(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

/** The app measures from the metadata, numbers only, every field checked; null when absent or malformed. */
function appMeasuresOf(value: unknown): UiAppMeasures | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const a = value as Json;
  const width = nonNegative(a.width);
  const numericCells = nonNegative(a.numericCells);
  const rightAlignedShare = nonNegative(a.rightAlignedShare);
  const tabularShare = nonNegative(a.tabularShare);
  const sidebarShare = nonNegative(a.sidebarShare);
  const hues = Array.isArray(a.chartHues) ? a.chartHues.map(nonNegative) : null;
  if (
    width === null ||
    numericCells === null ||
    rightAlignedShare === null ||
    tabularShare === null ||
    sidebarShare === null ||
    hues === null ||
    hues.some((h) => h === null)
  )
    return null;
  return {
    width,
    numericCells,
    rightAlignedShare,
    tabularShare,
    chartHues: (hues as number[]).slice(0, 20),
    sidebarShare,
  };
}

/** What one capture's page measured, read once with its metadata: the statuses and the defects behind them. */
interface PageReading {
  measures: UiPageMeasures;
  /** Each viewport that overflowed: its width, the pixels and the widest offender. */
  overflow: { width: number; px: number; offender: string }[];
  images: string[];
  fonts: string[];
  hidden: string[];
}

/**
 * The page's own measurements of one capture (2026-10-29-001, P-1): the overflow per viewport, the
 * broken images, the fonts not loaded and the text hidden under reduced motion, each `not captured`
 * where the metadata has no field, and the app measures where it has them. Every string is the
 * page's, quoted through `quotedText`; every number is checked. Nothing is graded here.
 */
function readPage(meta: Json): PageReading {
  const page: PageReading = {
    measures: {
      overflow: "not captured",
      images: "not captured",
      fonts: "not captured",
      hiddenText: "not captured",
    },
    overflow: [],
    images: [],
    fonts: [],
    hidden: [],
  };
  const viewports = Array.isArray(meta.viewports) ? (meta.viewports as Json[]) : [];
  const measured = viewports.filter((v) => isObject(v) && isObject(v.overflow));
  if (measured.length) page.measures.overflow = "clean";
  for (const v of measured) {
    const o = v.overflow as Json;
    const px = typeof o.overflowPx === "number" ? Math.round(o.overflowPx) : 0;
    if (px <= 0) continue;
    page.measures.overflow = "overflow";
    const first = Array.isArray(o.offenders) ? (o.offenders[0] as Json | undefined) : undefined;
    const offender =
      first && typeof first.target === "string" ? quotedText(first.target) : "unknown";
    page.overflow.push({ width: Number(v.width) || 0, px, offender });
  }
  const images = quotedStrings(meta.images);
  if (images) {
    page.measures.images = images.length ? "broken" : "clean";
    page.images = images;
  }
  const fonts = quotedStrings(meta.fonts);
  if (fonts) {
    page.measures.fonts = fonts.length ? "not loaded" : "loaded";
    page.fonts = fonts;
  }
  const reduced = isObject(meta.reducedMotion) ? meta.reducedMotion : null;
  if (reduced && Array.isArray(reduced.hidden)) {
    const hidden = (reduced.hidden as Json[])
      .filter((h) => isObject(h) && typeof h.target === "string")
      .slice(0, 10)
      .map((h) => quotedText(h.target));
    page.measures.hiddenText = hidden.length ? "hidden" : "clean";
    page.hidden = hidden;
  }
  const app = appMeasuresOf(meta.app);
  if (app) page.measures.app = app;
  return page;
}

/** The capture's page defects added to the measurement as the gate's offence lines, and its fonts as an advisory line. */
function pageOffences(m: Measured, page: PageReading, label: string): void {
  for (const o of page.overflow)
    m.overflowOffences.push(
      `ui: horizontal overflow ${o.px}px on ${label}@${o.width} (${o.offender})`,
    );
  for (const src of page.images) m.imageOffences.push(`ui: broken image ${src} on ${label}`);
  if (page.fonts.length)
    m.fontLines.push(`ui: fonts not loaded on ${label}: ${page.fonts.join(", ")}`);
  for (const target of page.hidden)
    m.hiddenOffences.push(`ui: text hidden under reduced motion: ${target} (${label})`);
}

/** Each motion sample added to the measurement: its row, a missing strip counted, its reduced-motion rerun. */
function measureSamples(m: Measured, dir: string): void {
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  for (const name of names) {
    if (!name.endsWith(".motion.json")) continue;
    const body = readBounded(join(dir, name));
    const sample = body ? readSample(dir, body) : null;
    if (!sample) {
      m.unreadable.push(name);
      continue;
    }
    if (!sample.strip) m.withoutStrip += 1;
    m.interactions.push({
      page: sample.page,
      interaction: sample.interaction,
      strip: sample.strip,
      animations: sample.animations,
      over50ms: sample.over50ms,
      reducedMotion: sample.reducedMotion.status,
    });
    if (sample.reducedMotion.status !== "not captured") {
      m.reducedSeen = true;
      m.reducedOffences.push(
        ...reducedMotionOffences(
          sample.reducedMotion.entries,
          `${sample.page}-${sample.interaction}`,
        ),
      );
    }
  }
}

/** The tail's four lines, one per measurement (AC-10). */
function measurementLines(m: Measured, axe: AxeStatus, reduced: ReducedMotionStatus): string[] {
  const axeLine =
    axe === "violations"
      ? `axe: violations: ${safeList(m.axeViolations)}`
      : axe === "clean"
        ? `axe: clean (${m.axeClean} capture${m.axeClean === 1 ? "" : "s"})`
        : `axe: not captured (${safeText(m.axeReasons[0] ?? (m.captures.length ? "not measured" : "no capture"))})`;
  const vitalsLine = m.clsMax
    ? `vitals: CLS max ${m.clsMax.value} (${m.clsMax.where})${m.lcpMax !== null ? `, LCP max ${m.lcpMax} ms` : ""}`
    : "vitals: not captured";
  const reducedLine =
    reduced === "running"
      ? (m.reducedOffences[0] ?? "reduced motion: running")
      : reduced === "clean"
        ? "reduced motion: clean"
        : "reduced motion: not captured";
  const n = m.interactions.length;
  const motionLine = n
    ? `motion: ${n} interaction${n === 1 ? "" : "s"} sampled${m.withoutStrip ? ` (${m.withoutStrip} without a strip)` : ""}`
    : "motion: none";
  return [axeLine, vitalsLine, reducedLine, motionLine];
}

/**
 * The UI evidence graded against the plan (design §4): the first offence in order (a declared
 * screen not captured, an unreadable file, an animation still running under reduced motion, an
 * axe serious or critical violation, CLS over the limit), one tail line per measurement, the
 * manifest to write and the artifact to carry. Nothing read here can pass a run on its own.
 */
export function gradeUi(paths: CrewPaths, id: string, plan: UiPlan): UiGrade {
  const m = measure(paths, id, plan);
  const missingScreens = plan.screens.filter((s) => !m.rows.get(`${s.page}/${s.state}`)?.captured);
  const missing = missingScreens.map((s) => `${s.page}-${s.state}`);
  const first = missingScreens[0];
  const offence =
    (first
      ? `ui: screen ${first.page}-${first.state} declared by ${first.criteria.join(", ")} not captured`
      : null) ??
    (m.unreadable.length ? `ui: unreadable ${safeText(m.unreadable[0])}` : null) ??
    m.reducedOffences[0] ??
    m.axeOffences[0] ??
    m.overflowOffences[0] ??
    m.imageOffences[0] ??
    m.hiddenOffences[0] ??
    m.clsOffences[0] ??
    null;
  const screens = [...m.rows.values()].sort(
    (a, b) => a.page.localeCompare(b.page) || a.state.localeCompare(b.state),
  );
  const axeStatus: AxeStatus = m.axeViolations.length
    ? "violations"
    : m.axeClean
      ? "clean"
      : "not captured";
  const reducedStatus: ReducedMotionStatus = m.reducedOffences.length
    ? "running"
    : m.reducedSeen
      ? "clean"
      : "not captured";
  const measured = m.captures.length > 0 || plan.screens.length > 0;
  const manifest: UiEvidence = {
    id,
    at: nowIso(),
    plan: {
      viewports: plan.viewports.map((v) => ({ ...v })),
      colorSchemes: [...plan.colorSchemes],
    },
    screens,
    interactions: m.interactions,
    unreadable: m.unreadable.map((n) => safeText(n)),
    summary: {
      captures: m.captures.length,
      captured: plan.screens.length - missing.length,
      expected: plan.screens.length,
      missing,
      extra: screens.filter((r) => !r.declared).map((r) => `${r.page}-${r.state}`),
      offence,
    },
  };
  const artifacts: UiArtifact | null = measured
    ? {
        manifest: "review/ui-evidence.json",
        captures: m.captures.length,
        expected: plan.screens.length,
        missing,
        axe: axeStatus,
        reducedMotion: reducedStatus,
        motion: m.interactions.length,
      }
    : null;
  return {
    offence,
    // The page's own offences and the fonts' advisory lines follow the four measurement lines (2026-10-29-001).
    lines: measured
      ? [
          ...measurementLines(m, axeStatus, reducedStatus),
          ...[m.overflowOffences[0], m.imageOffences[0], m.hiddenOffences[0]].filter(
            (l): l is string => typeof l === "string",
          ),
          ...m.fontLines,
        ]
      : [],
    manifest,
    artifacts,
  };
}

/** Writes the manifest the engine owns, beside the plan. */
export function writeUiEvidence(paths: CrewPaths, id: string, manifest: UiEvidence): string {
  const file = uiEvidencePath(paths, id);
  writeText(file, `${JSON.stringify(manifest, null, 2)}\n`);
  return file;
}

const numbersOnly = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((n) => typeof n === "number");
const stringsOnly = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((s) => typeof s === "string");

function isScreenRow(raw: unknown): raw is UiScreenRow {
  if (!isObject(raw)) return false;
  if (typeof raw.page !== "string" || typeof raw.state !== "string" || !stringsOnly(raw.criteria))
    return false;
  if (typeof raw.declared !== "boolean") return false;
  if (
    raw.captured !== null &&
    !(isObject(raw.captured) && numbersOnly(raw.captured.light) && numbersOnly(raw.captured.dark))
  )
    return false;
  if (
    typeof raw.console !== "string" ||
    typeof raw.axe !== "string" ||
    typeof raw.reducedMotion !== "string"
  )
    return false;
  if (raw.vitals !== null && !(isObject(raw.vitals) && finiteOrNull(raw.vitals.cls ?? null)))
    return false;
  if (raw.measures !== undefined && !isPageMeasures(raw.measures)) return false;
  return true;
}

/** A screen's page measures as the engine writes them: four statuses, and the app measures when present. */
function isPageMeasures(raw: unknown): raw is UiPageMeasures {
  if (!isObject(raw)) return false;
  const statuses = [raw.overflow, raw.images, raw.fonts, raw.hiddenText];
  if (!statuses.every((s) => typeof s === "string")) return false;
  return raw.app === undefined || appMeasuresOf(raw.app) !== null;
}

function isInteractionRow(raw: unknown): raw is UiInteractionRow {
  return (
    isObject(raw) &&
    typeof raw.page === "string" &&
    typeof raw.interaction === "string" &&
    typeof raw.strip === "boolean" &&
    typeof raw.animations === "number" &&
    typeof raw.over50ms === "number" &&
    typeof raw.reducedMotion === "string"
  );
}

/** The manifest read back for the report, with the same cap and the whole shape checked; null for anything less. */
export function readUiEvidence(paths: CrewPaths, id: string): UiEvidence | null {
  const body = readBounded(uiEvidencePath(paths, id));
  if (
    !body ||
    typeof body.id !== "string" ||
    !Array.isArray(body.screens) ||
    !Array.isArray(body.interactions)
  )
    return null;
  if (!body.screens.every(isScreenRow) || !body.interactions.every(isInteractionRow)) return null;
  if (!stringsOnly(body.unreadable) || !isObject(body.summary)) return null;
  const summary = body.summary;
  if (!stringsOnly(summary.missing) || !stringsOnly(summary.extra)) return null;
  if (typeof summary.captures !== "number" || typeof summary.expected !== "number") return null;
  // The audit's field (SP9 Task 7), when the run set it: two strings and a string list.
  if (body.audit !== undefined) {
    const audit = body.audit;
    if (
      !isObject(audit) ||
      (audit.status !== "captured" && audit.status !== "not captured") ||
      (audit.reason !== null && typeof audit.reason !== "string") ||
      !stringsOnly(audit.pages)
    )
      return null;
  }
  return body as unknown as UiEvidence;
}

/** A capture's metadata as the fixture wrote it, whatever its shape. */
export type CaptureMetadata = Record<string, unknown>;

/**
 * The captures' metadata (SP9 Task 7), read once for every reader of it, in the captures' order:
 * each a regular file under the cap, parsed as a JSON object; a capture without one, over the cap
 * or not a regular file gives nothing.
 */
export function captureMetadata(paths: CrewPaths, id: string): CaptureMetadata[] {
  const bodies: CaptureMetadata[] = [];
  for (const capture of listCaptures(paths, id)) {
    if (!capture.meta) continue;
    const body = readBounded(join(workDir(paths, id), capture.meta));
    if (body) bodies.push(body);
  }
  return bodies;
}

/** The urls the captures' metadata name, distinct, in order: each `url` a string made safe; a metadata without one gives nothing. */
export function captureUrls(metadata: readonly CaptureMetadata[]): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const body of metadata) {
    if (typeof body.url !== "string") continue;
    const url = safeText(body.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

/** Whether a capture's metadata carried a numeric CLS: the trace's figure is then advisory. */
export function capturesMeasuredCls(metadata: readonly CaptureMetadata[]): boolean {
  return metadata.some((body) => {
    const vitals = isObject(body.vitals) ? body.vitals : null;
    return typeof vitals?.cls === "number" && Number.isFinite(vitals.cls);
  });
}
