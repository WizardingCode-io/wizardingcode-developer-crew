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
import { join, resolve, sep } from "node:path";
import { isWatched } from "./fingerprint.ts";
import { nowIso, writeText } from "./fs.ts";
import type { Capture } from "./judgement.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { SKIP_DIRS } from "./skip-dirs.ts";
import type { Profile, Screen, Viewport, WorkItem } from "./types.ts";

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

function readJsonFile(path: string): Record<string, unknown> | null {
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
    if (remove(target)) removed.push(String(name));
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
