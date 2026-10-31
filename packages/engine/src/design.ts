/**
 * What a new site or page is built from (item 2026-10-30-005): the surface and the amount of
 * invention, the shape of the session's brief, direction and copy, the seeded deal over the open
 * library, and the machine-wide history that keeps one site unlike the last. The session's files are
 * untrusted text, read under a cap and never evaluated; the history holds dimensions only, in a
 * closed schema, so no client's words cross projects.
 */
import { execFileSync } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gitChangedPaths, gitChangedSince } from "./fingerprint.ts";
import { ensureDir, exists, readRegular, sha256 } from "./fs.ts";
import { withLock } from "./lock.ts";
import type { CrewPaths } from "./paths.ts";
import { workDir } from "./paths.ts";
import { isInterfacePath } from "./paths-kind.ts";
import { pluginRoot } from "./runtimes.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type { WorkItem } from "./types.ts";

export const SURFACES = ["persuade", "operate", "read", "experience"] as const;
export type Surface = (typeof SURFACES)[number];
export const INVENTIONS = ["extend", "surface", "world"] as const;
export type Invention = (typeof INVENTIONS)[number];

export interface SurfaceRecord {
  surface: Surface;
  invention: Invention;
  at: string;
}

export const DESIGN_FILE_MAX = 256 * 1024;
export const REASON_MAX = 500;
export const QUERY_MAX = 200;
export const CONTRACT_BLOCKS = [
  "THESIS",
  "OWN-WORLD",
  "STORY",
  "FIRST VIEWPORT",
  "FORM",
  "FINISH",
] as const;

const ITEM_ID = /^\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+$/;
const SLOT = /^(?:direction|hero|type|palette|macrostructure|grammar)$/;
const SESSION_FILES = ["brief.md", "direction.md", "copy.md"] as const;

/** Whether a word can name an item's folder: it cannot leave `.crew/work/`. */
export function validItemId(id: string): boolean {
  return ITEM_ID.test(id);
}

/** Whether a word names a slot of the deal: a closed list, so it is never read as a path. */
export function validSlot(slot: string): boolean {
  return SLOT.test(slot);
}

export function designDir(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "design");
}

const surfaceFile = (paths: CrewPaths, id: string) => join(designDir(paths, id), "surface.json");
const dealFile = (paths: CrewPaths, id: string) => join(designDir(paths, id), "deal.json");

export function readSurface(paths: CrewPaths, id: string): SurfaceRecord | null {
  return readProtectedJson<SurfaceRecord>(paths, surfaceFile(paths, id)).data;
}

/** The pages this change adds, as far as git can say: a new interface file under a routing folder, or a new HTML file. */
export function addedPages(root: string, base: string | undefined): string[] {
  const changed = new Set<string>(gitChangedPaths(root) ?? []);
  for (const path of base ? (gitChangedSince(root, base) ?? []) : []) changed.add(path);
  return [...changed].filter(
    (path) =>
      isInterfacePath(path) &&
      (/(?:^|\/)(?:pages|views|routes)\//.test(path) ||
        /(?:^|\/)page\.[a-z]+$/.test(path) ||
        /\.html?$/.test(path)) &&
      exists(join(root, path)) &&
      !(base && baseHas(root, base, path)),
  );
}

function baseHas(root: string, base: string, path: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `${base}:${path}`], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Why `extend` cannot be the amount of invention, or null when it can. */
export function extendRefusal(paths: CrewPaths, work: WorkItem): string | null {
  if (work.type === "new-product")
    return "a new product cannot record extend: it has no world to inherit (surface or world)";
  if (exists(join(paths.root, "DESIGN.md")) || exists(join(paths.root, "docs", "DESIGN.md")))
    return null;
  const pages = addedPages(paths.root, work.baseCommit ?? undefined);
  return pages.length
    ? `the change adds ${pages[0]} and the project has no DESIGN.md: it cannot record extend (surface or world)`
    : null;
}

export function recordSurface(
  paths: CrewPaths,
  id: string,
  surface: Surface,
  invention: Invention,
  at: string,
): SurfaceRecord {
  const record: SurfaceRecord = { surface, invention, at };
  ensureDir(designDir(paths, id));
  writeProtectedJson(paths, surfaceFile(paths, id), record);
  return record;
}

/** Whether a recorded surface is a new site: a Persuade or Experience page at `surface` or `world`. */
export function isNewSite(record: SurfaceRecord | null): boolean {
  return (
    !!record &&
    record.invention !== "extend" &&
    (record.surface === "persuade" || record.surface === "experience")
  );
}

/** The bullets under a `## Heading`, up to the next heading of that level or above. */
function sectionLines(text: string, heading: string): string[] | null {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start < 0) return null;
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2} /.test(line)) break;
    if (line.trim()) out.push(line.trim());
  }
  return out;
}

function argumentRows(brief: string): { section: string; proof: boolean }[] | null {
  const lines = sectionLines(brief, "Argument");
  if (!lines) return null;
  return lines
    .filter((l) => l.startsWith("- "))
    .map((l) => {
      const body = l.slice(2);
      const colon = body.indexOf(":");
      return {
        section: (colon < 0 ? body : body.slice(0, colon)).trim().toLowerCase(),
        proof: /·\s*proof:\s*\S/i.test(body),
      };
    });
}

/** The brief: 8 to 12 things only this client has, and each section as a claim with its proof. */
export function checkBrief(text: string): string[] {
  const problems: string[] = [];
  if (!/^Client:\s*\S/m.test(text)) problems.push("brief.md: no Client: line");
  const inventory = sectionLines(text, "Inventory");
  if (!inventory) problems.push("brief.md: no inventory (## Inventory)");
  else {
    const n = inventory.filter((l) => l.startsWith("- ")).length;
    if (n < 8 || n > 12) problems.push(`brief.md: inventory has ${n} lines (8 to 12)`);
  }
  const rows = argumentRows(text);
  if (!rows || rows.length === 0) problems.push("brief.md: no argument (## Argument)");
  else
    for (const row of rows)
      if (!row.proof) problems.push(`brief.md: argument line with no proof: ${row.section}`);
  return problems;
}

/** The direction: the idea with both blanks filled, the competitor line, the six blocks. */
export function checkDirection(text: string): string[] {
  const problems: string[] = [];
  const idea = (sectionLines(text, "Idea") ?? []).join(" ");
  const match = /^On this page, (.+?) becomes? (.+)$/i.exec(idea);
  const blank = (s: string) => /\[.*\]|_{2,}|\.\.\.|…/.test(s) || !s.trim();
  if (!match || blank(match[1] ?? "") || blank(match[2] ?? ""))
    problems.push(
      'direction.md: idea sentence not filled ("On this page, <what belongs to the subject> becomes <the device>")',
    );
  if (!(sectionLines(text, "Competitor") ?? []).join("").trim())
    problems.push("direction.md: no competitor line (## Competitor)");
  for (const block of CONTRACT_BLOCKS) {
    if (!new RegExp(`^${block}:\\s*\\S`, "m").test(text))
      problems.push(`direction.md: contract block ${block} missing`);
  }
  return problems;
}

/** The copy deck: written before the markup, and every section has its claim in the brief. */
export function checkCopy(text: string, brief: string): string[] {
  const sections = text
    .split(/\r?\n/)
    .filter((l) => l.startsWith("## "))
    .map((l) => l.slice(3).trim().toLowerCase());
  if (!sections.length) return ["copy.md: no section (## <section>)"];
  const claimed = new Set((argumentRows(brief) ?? []).map((r) => r.section));
  return sections
    .filter((s) => !claimed.has(s))
    .map((s) => `copy.md: section with no argument line: ${s.slice(0, 60)}`);
}

export interface ProcessProblem {
  rule: string;
  text: string;
}

function readCapped(path: string, name: string): { text: string | null; problem: string | null } {
  if (!exists(path)) return { text: null, problem: `${name} is missing` };
  const read = readRegular(path, DESIGN_FILE_MAX);
  if (read === "over cap") return { text: null, problem: `${name} is over 256 KiB` };
  if (read === null) return { text: null, problem: `${name} is not a regular file` };
  return { text: read.toString("utf8"), problem: null };
}

/** What the amount of invention requires of the item's files. `extend` requires nothing. */
export function designProblems(
  paths: CrewPaths,
  id: string,
  record: SurfaceRecord,
): ProcessProblem[] {
  if (record.invention === "extend") return [];
  const dir = designDir(paths, id);
  const problems: ProcessProblem[] = [];
  const texts: Record<string, string | null> = {};
  for (const name of SESSION_FILES) {
    const read = readCapped(join(dir, name), name);
    texts[name] = read.text;
    if (read.problem)
      problems.push({ rule: `process/${name.replace(".md", "")}`, text: read.problem });
  }
  const each = (name: string, found: string[]) => {
    for (const text of found) problems.push({ rule: `process/${name.replace(".md", "")}`, text });
  };
  if (texts["brief.md"]) each("brief.md", checkBrief(texts["brief.md"]));
  if (texts["direction.md"]) each("direction.md", checkDirection(texts["direction.md"]));
  if (texts["copy.md"] && texts["brief.md"])
    each("copy.md", checkCopy(texts["copy.md"], texts["brief.md"]));
  if (!exists(dealFile(paths, id)))
    problems.push({ rule: "process/deal", text: "no deal (crew design <id> deal)" });
  if (
    record.invention === "world" &&
    !exists(join(paths.root, "DESIGN.md")) &&
    !exists(join(paths.root, "docs", "DESIGN.md"))
  )
    problems.push({
      rule: "process/design-md",
      text: "a new world ends with its DESIGN.md, written from the built page",
    });
  return problems;
}

// The open library (D-3): rows of data vendored at build time, each with its source and licence.

export interface LibraryRow {
  id: string;
  source: string;
  licence: string;
  [key: string]: unknown;
}
export type Library = Record<string, LibraryRow[]>;

export const LICENCES = ["MIT", "Apache-2.0"];
/** The proportion limits a row of the library cannot ask past (D-5): display type at most this, in px and in vw. */
export const DISPLAY_MAX_PX = 96;
export const DISPLAY_MAX_VW = 7;
export const PHONE_DISPLAY_MAX_VW = 13;

export function libraryDir(): string {
  return join(pluginRoot(), "design", "library");
}

/** The library's rows, every file checked against the hash its NOTICE pins. Data only: nothing here runs or fetches. */
export function loadLibrary(dir: string = libraryDir()): Library {
  const notice = JSON.parse(readFileSync(join(dir, "NOTICE.json"), "utf8")) as {
    files: { file: string; sha256: string }[];
  };
  const library: Library = {};
  for (const entry of notice.files) {
    const body = readFileSync(join(dir, entry.file));
    if (sha256(body) !== entry.sha256)
      throw new Error(`design library: ${entry.file}'s hash differs from its NOTICE`);
    library[entry.file.replace(/\.json$/, "")] = JSON.parse(body.toString("utf8")) as LibraryRow[];
  }
  return library;
}

const SIZE_TOO_BIG = (text: string): boolean => {
  for (const m of text.matchAll(/clamp\(([^)]*)\)/gi)) {
    const px = [...(m[1] ?? "").matchAll(/(\d+(?:\.\d+)?)px/g)].map((x) => Number(x[1]));
    const rem = [...(m[1] ?? "").matchAll(/(\d+(?:\.\d+)?)rem/g)].map((x) => Number(x[1]));
    const vw = [...(m[1] ?? "").matchAll(/(\d+(?:\.\d+)?)vw/g)].map((x) => Number(x[1]));
    if (
      px.some((n) => n > DISPLAY_MAX_PX) ||
      rem.some((n) => n * 16 > DISPLAY_MAX_PX) ||
      vw.some((n) => n > DISPLAY_MAX_VW)
    )
      return true;
  }
  // A bare vw beside words of type (a name at 23vw): widths of pictures stay free.
  for (const m of text.matchAll(/(\d+(?:\.\d+)?)vw/g)) {
    const near = text.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 20);
    if (
      Number(m[1]) > PHONE_DISPLAY_MAX_VW &&
      /\b(?:type|font|name|headline|letters?|word|title|size|display|wordmark)\b/i.test(near)
    )
      return true;
  }
  for (const m of text.matchAll(/\b(?:at|size|sized?|set at)\s+(\d{3,})px/gi))
    if (Number(m[1]) > DISPLAY_MAX_PX) return true;
  return /\b(?:as wide as|spanning|across|fills?)\s+(?:the\s+)?(?:whole\s+|entire\s+|full\s+)?(?:viewport|screen)\b/i.test(
    text,
  );
};

/** What is wrong with a row of the library: empty for a row the crew may ship. */
export function scanLibraryRow(row: LibraryRow): string[] {
  const problems: string[] = [];
  if (!LICENCES.includes(row.licence)) problems.push(`licence ${row.licence} not on the list`);
  const { id: _id, source: _source, licence: _licence, ...rest } = row;
  const text = JSON.stringify(rest);
  if (SIZE_TOO_BIG(text)) problems.push("proportion: type beyond the limits");
  if (/\bhttps?:\/\//i.test(text)) problems.push("url to fetch");
  if (
    /\b(?:ignore (?:all |the )?(?:previous|above)|run the tool|system prompt|you are now)\b/i.test(
      text,
    )
  )
    problems.push("instruction aimed at an agent");
  if (/(?:^|[\s`"])(?:curl|wget|npx|bash -c|sudo|rm -rf)\s/i.test(text))
    problems.push("shell snippet");
  if (/\b(?:sk-[a-z0-9-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})\b/.test(text))
    problems.push("secret-shaped string");
  if (/\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i.test(text)) problems.push("personal data");
  if (
    /(?<!\bno )(?<!\bnever )\bgradient (?:text|headline)|\bglass(?:morphism)? cards?\b|lorem ipsum|transition:\s*all/i.test(
      text,
    )
  )
    problems.push("refused device as a recommendation");
  if (/\bpicsum\.|\bunsplash\b|"photos?"\s*:/i.test(text)) problems.push("photo");
  if (/\b[a-z0-9-]+\.(?:com|io|app|co|studio|net|org|dev)\b/i.test(text))
    problems.push("third-party site name");
  return problems;
}

// The deal: seeded and dependency-free.

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DealOption {
  direction: string;
  hero: string;
  type: string;
  palette: string;
  macrostructure: string;
  grammar: string;
}
export interface Deal {
  seed: number;
  options: DealOption[];
}
export const DEAL_OPTIONS = 3;
export const RECENT_ROWS = 5;

function pick(
  rows: LibraryRow[],
  avoid: Set<string>,
  used: Set<string>,
  next: () => number,
): string {
  const fresh = rows.filter((r) => !avoid.has(r.id) && !used.has(r.id));
  const pool = fresh.length ? fresh : rows.filter((r) => !used.has(r.id));
  const from = pool.length ? pool : rows;
  const row = from[Math.floor(next() * from.length)];
  const id = row?.id ?? "";
  used.add(id);
  return id;
}

/** Three directions for one seed, whole and unlike each other, none using what `recent` names. */
export function dealDirections(
  library: Library,
  options: { seed: number; recent: readonly string[]; count?: number },
): Deal {
  const next = mulberry32(options.seed);
  const avoid = new Set(options.recent);
  const used = new Set<string>();
  const rows = (name: string) => library[name] ?? [];
  const dealt: DealOption[] = [];
  for (let i = 0; i < (options.count ?? DEAL_OPTIONS); i++) {
    const direction = pick(rows("directions"), avoid, used, next);
    const heroes = rows("heroes").filter(
      (h) => Array.isArray(h.directions) && (h.directions as string[]).includes(direction),
    );
    dealt.push({
      direction,
      hero: pick(heroes.length ? heroes : rows("heroes"), avoid, used, next),
      type: pick(rows("type"), avoid, used, next),
      palette: pick(rows("palettes"), avoid, used, next),
      macrostructure: pick(rows("macrostructures"), avoid, used, next),
      grammar: pick(rows("grammars"), avoid, used, next),
    });
  }
  return { seed: options.seed, options: dealt };
}

export interface DealRecord extends Deal {
  redraws: { slot: string; reason: string; was: string; now: string; at: string }[];
  chosen: number | null;
}

export function readDeal(paths: CrewPaths, id: string): DealRecord | null {
  return readProtectedJson<DealRecord>(paths, dealFile(paths, id)).data;
}

export function saveDeal(paths: CrewPaths, id: string, deal: DealRecord): void {
  ensureDir(designDir(paths, id));
  writeProtectedJson(paths, dealFile(paths, id), deal);
}

export function freshSeed(): number {
  return randomInt(1, 2 ** 31 - 1);
}

/** One slot dealt again in the chosen option (the first until one is chosen). A row outside the library is never named. */
export function redrawSlot(
  library: Library,
  deal: DealRecord,
  slot: string,
  reason: string,
  at: string,
): DealRecord {
  const index = deal.chosen ?? 0;
  const option = { ...(deal.options[index] as DealOption) };
  const key = slot as keyof DealOption;
  const names: Record<string, string> = {
    direction: "directions",
    hero: "heroes",
    type: "type",
    palette: "palettes",
    macrostructure: "macrostructures",
    grammar: "grammars",
  };
  const table = library[names[key] ?? ""] ?? [];
  const was = String(option[key] ?? "");
  const seen = new Set(deal.redraws.filter((r) => r.slot === slot).map((r) => r.was));
  seen.add(was);
  const next = mulberry32(deal.seed + deal.redraws.length + 1);
  const now = pick(table, seen, new Set(), next);
  option[key] = now;
  const options = deal.options.map((o, i) => (i === index ? option : o));
  return { ...deal, options, redraws: [...deal.redraws, { slot, reason, was, now, at }] };
}

// The history: what keeps one site unlike the last (D-5).

export const DIMENSIONS = ["display", "body", "palette", "sections", "hero", "motion"] as const;
export type Fingerprint = Record<(typeof DIMENSIONS)[number], string>;
export interface HistoryRow extends Fingerprint {
  at: string;
  item: string;
  dealt?: string[];
}
export const HISTORY_MAX_ROWS = 500;
export const HISTORY_ROW_MAX = 1024;
/** A site must differ from every earlier one on at least this many of the six dimensions. */
export const MIN_DIFFERENT = 4;

// The history's values are closed lists: a font family enters only as a one-way hash, since a client's own
// face can carry its name, and the rest are the fixture's fixed words.
const FAMILY_HASH = /^f-[a-f0-9]{12}$/;
const PALETTE =
  /^(?:light|mid|dark)-(?:neutral|warm|cold)-(?:red|orange|yellow|green|teal|blue|purple|pink|none)$/;
const SHAPES = /^(?:stack|grid|media|split|list)(?:,(?:stack|grid|media|split|list))*$/;
const HEROES =
  /^(?:text-only|media-full|centred-text|stacked|text-left-media-right|text-right-media-left)$/;
const MOTIONS = /^(?:none|(?:entrance|keyframes|scroll)(?:,(?:entrance|keyframes|scroll))*)$/;
const PATTERNS: Record<(typeof DIMENSIONS)[number], RegExp> = {
  display: FAMILY_HASH,
  body: FAMILY_HASH,
  palette: PALETTE,
  sections: SHAPES,
  hero: HEROES,
  motion: MOTIONS,
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[a-f0-9]{16}$/;
const ID = /^[a-z0-9-]{1,80}$/;

export function historyPath(userDir: string): string {
  return join(userDir, "design-history.json");
}

/** A one-way name of an item: the history is machine-wide, and it links no project to another. */
export function itemHash(item: string): string {
  return createHash("sha256").update(item).digest("hex").slice(0, 16);
}

/** What the history keeps of a site: the families hashed, one-way, so a client's own face leaves no name behind. */
export function historyPrint(print: Fingerprint): Fingerprint {
  const hashed = (family: string) =>
    FAMILY_HASH.test(family)
      ? family
      : `f-${createHash("sha256").update(family.toLowerCase()).digest("hex").slice(0, 12)}`;
  return { ...print, display: hashed(print.display), body: hashed(print.body) };
}

function fingerprintRefusal(print: Fingerprint): string | null {
  const keys = Object.keys(print);
  const unknown = keys.find((k) => !(DIMENSIONS as readonly string[]).includes(k));
  if (unknown) return `unknown key ${unknown.slice(0, 40)}`;
  for (const dim of DIMENSIONS) {
    const value = print[dim];
    if (typeof value !== "string" || !PATTERNS[dim].test(value))
      return `${dim} is outside its pattern`;
  }
  return null;
}

function validRow(row: unknown): row is HistoryRow {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const r = row as Record<string, unknown>;
  const allowed = new Set<string>([...DIMENSIONS, "at", "item", "dealt"]);
  if (Object.keys(r).some((k) => !allowed.has(k))) return false;
  if (typeof r.at !== "string" || !DATE.test(r.at)) return false;
  if (typeof r.item !== "string" || !HASH.test(r.item)) return false;
  if (r.dealt !== undefined) {
    if (!Array.isArray(r.dealt) || r.dealt.some((d) => typeof d !== "string" || !ID.test(d)))
      return false;
  }
  const { at: _a, item: _i, dealt: _d, ...print } = r;
  if (fingerprintRefusal(print as Fingerprint)) return false;
  return JSON.stringify(r).length <= HISTORY_ROW_MAX;
}

/** The rows that still hold their schema; a corrupt file reads as empty with a warning and never blocks. */
export function readHistory(userDir: string): { rows: HistoryRow[]; warning: string | null } {
  const path = historyPath(userDir);
  if (!exists(path)) return { rows: [], warning: null };
  const read = readRegular(path, HISTORY_MAX_ROWS * HISTORY_ROW_MAX * 2);
  if (read === null || read === "over cap")
    return { rows: [], warning: "the design history is corrupt or too big: read as empty" };
  try {
    const body = JSON.parse(read.toString("utf8")) as unknown;
    if (!Array.isArray(body)) throw new Error("not a list");
    return { rows: body.filter(validRow), warning: null };
  } catch {
    return { rows: [], warning: "the design history is corrupt: read as empty" };
  }
}

/** Adds a site, atomically under a lock, replacing the item's own row and dropping the oldest past the bound. */
export function addHistoryRow(
  userDir: string,
  input: { at: string; item: string; fingerprint: Fingerprint; dealt?: string[] },
): void {
  const print = historyPrint(input.fingerprint);
  const refused = fingerprintRefusal(print);
  if (refused) throw new Error(`design history: refused: ${refused}`);
  const row: HistoryRow = {
    at: input.at.slice(0, 10),
    item: itemHash(input.item),
    ...print,
    ...(input.dealt ? { dealt: input.dealt } : {}),
  };
  if (!validRow(row)) throw new Error("design history: refused: the row is outside its schema");
  ensureDir(userDir);
  withLock(
    `${historyPath(userDir)}.lock`,
    () => {
      const { rows } = readHistory(userDir);
      const kept = rows.filter((r) => r.item !== row.item);
      const next = [...kept, row].slice(-HISTORY_MAX_ROWS);
      const tmp = join(
        dirname(historyPath(userDir)),
        `.design-history.${process.pid}.${Date.now()}.tmp`,
      );
      writeFileSync(tmp, `${JSON.stringify(next)}\n`);
      renameSync(tmp, historyPath(userDir));
    },
    { waitMs: 20000, what: "the design history" },
  );
}

/** The dimensions on which two sites differ. */
export function differingDimensions(a: Fingerprint, b: Fingerprint): number {
  return DIMENSIONS.filter((d) => a[d].toLowerCase() !== b[d].toLowerCase()).length;
}

/** The offence of a site too like an earlier one, naming the row; null when it differs from every row on 4 or more. */
export function compareFingerprints(
  print: Fingerprint,
  rows: readonly (Fingerprint & { item: string; at: string })[],
): string | null {
  for (const row of rows) {
    const n = differingDimensions(print, row);
    if (n < MIN_DIFFERENT)
      return `design/too-alike: this site differs on ${n} of 6 from ${row.item} (${row.at}); it must differ on ${MIN_DIFFERENT}`;
  }
  return null;
}

/** The ids the deal avoids: what the last rows of the history were dealt. */
export function recentDealt(rows: readonly HistoryRow[]): string[] {
  return rows.slice(-RECENT_ROWS).flatMap((r) => r.dealt ?? []);
}

// The bar (D-5): the reviewer's score, read from the file the engine filed.

export const SCORE_BAR = 8.5;
export interface ScoreRecord {
  score: number;
  caps: string[];
  disposition: string;
  fingerprint: string;
  at: string;
  /** How many times the review has been recorded on this item. */
  round?: number;
}
const scoreFile = (paths: CrewPaths, id: string) => join(designDir(paths, id), "score.json");

/** The reviewer's line `score: 8.7 · caps: none · disposition: ship`; null when it is not there as that shape. */
export function parseScore(findings: string): Omit<ScoreRecord, "fingerprint" | "at"> | null {
  const line =
    /^score:\s*(\d+(?:\.\d+)?)\s*·\s*caps:\s*(.+?)\s*·\s*disposition:\s*(recapture|rebuild|fix|ship)\s*$/m.exec(
      findings,
    );
  if (!line) return null;
  const score = Number(line[1]);
  if (!Number.isFinite(score) || score < 0 || score > 10) return null;
  const caps =
    (line[2] ?? "").trim().toLowerCase() === "none"
      ? []
      : (line[2] ?? "").split(",").map((c) => c.trim().slice(0, 80));
  // Under the bar or capped, the word cannot be `ship`: it stands only for recapture and rebuild.
  const word = line[3] ?? "";
  const disposition = word === "ship" && (score < SCORE_BAR || caps.length > 0) ? "fix" : word;
  return { score, caps, disposition };
}

export function readScore(paths: CrewPaths, id: string): ScoreRecord | null {
  return readProtectedJson<ScoreRecord>(paths, scoreFile(paths, id)).data;
}

export function saveScore(paths: CrewPaths, id: string, record: ScoreRecord): void {
  ensureDir(designDir(paths, id));
  writeProtectedJson(paths, scoreFile(paths, id), record);
}

/** Why a site is not yet at the bar. Only a surface or a world on a Persuade or Experience page answers to it. */
export function designReasons(
  surface: SurfaceRecord | null,
  score: ScoreRecord | null,
  currentFingerprint: string,
): string[] {
  if (!surface || surface.invention === "extend") return [];
  if (surface.surface !== "persuade" && surface.surface !== "experience") return [];
  if (!score) return ["design score not recorded (crew design <id> score, after the review)"];
  const out: string[] = [];
  if (score.fingerprint !== currentFingerprint) out.push("design score not on the current code");
  if (score.score < SCORE_BAR)
    out.push(`design score ${score.score} under the bar of ${SCORE_BAR}`);
  for (const cap of score.caps) out.push(`design score capped: ${cap}`);
  if (score.disposition !== "ship") out.push(`design review says ${score.disposition}`);
  return out;
}

/** What the report says of the score. */
export function designScoreLines(score: ScoreRecord): string[] {
  return [
    `Design score: ${score.score} of 10, ${score.disposition}${score.caps.length ? `, caps: ${score.caps.join(", ")}` : ""}.`,
    "The score is a model's reading of the captures, not a measurement: the engine proves the process ran and the measurable signs are absent.",
  ];
}

// The comp path (D-4): a page built from an approved generated image, its regions measured against it.

export interface CompRegion {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
export const COMP_TOLERANCE = 8;

/** The regions of the approved comp against the page's marked elements, in percent of the first screen. */
export function gradeComp(
  regions: readonly CompRegion[],
  measured: readonly CompRegion[],
): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  for (const region of regions) {
    const found = measured.find((m) => m.id === region.id);
    if (!found) {
      out.push({
        id: "comp/region-missing",
        text: `comp/region-missing: ${region.id} is not on the page (data-comp)`,
      });
      continue;
    }
    const off = Math.max(
      Math.abs(found.x - region.x),
      Math.abs(found.y - region.y),
      Math.abs(found.w - region.w),
      Math.abs(found.h - region.h),
    );
    if (off > COMP_TOLERANCE)
      out.push({
        id: "comp/region-moved",
        text: `comp/region-moved: ${region.id} is ${Math.round(off)}% from the approved comp (limit ${COMP_TOLERANCE})`,
      });
  }
  return out;
}

export function compDir(paths: CrewPaths, id: string): string {
  return join(designDir(paths, id), "comps");
}
const compFile = (paths: CrewPaths, id: string) => join(designDir(paths, id), "comp.json");

export function readComp(
  paths: CrewPaths,
  id: string,
): { comp: string; regions: CompRegion[] } | null {
  return readProtectedJson<{ comp: string; regions: CompRegion[] }>(paths, compFile(paths, id))
    .data;
}

export function saveComp(paths: CrewPaths, id: string, comp: string, regions: CompRegion[]): void {
  writeProtectedJson(paths, compFile(paths, id), { comp, regions });
}

/** A regions file's rows, each checked; null for anything else. */
export function validRegions(body: unknown): CompRegion[] | null {
  if (!Array.isArray(body)) return null;
  const ok = body.every(
    (r) =>
      r &&
      typeof r === "object" &&
      /^[a-z0-9-]{1,40}$/.test(String((r as CompRegion).id)) &&
      ["x", "y", "w", "h"].every((k) => {
        const n = (r as unknown as Record<string, unknown>)[k];
        return typeof n === "number" && n >= 0 && n <= 200;
      }),
  );
  return ok ? (body as CompRegion[]).map(({ id, x, y, w, h }) => ({ id, x, y, w, h })) : null;
}

/** Why a search query cannot leave the machine: no brief to check it against, or it holds a word of the brief's `Client:` or `Address:` lines, an email or a number. */
export function queryRefusal(paths: CrewPaths, id: string, query: string): string | null {
  if (/@|\d/.test(query)) return "a query with an address or a number stays on this machine";
  const brief = readCapped(join(designDir(paths, id), "brief.md"), "brief.md").text;
  const lines = [...(brief ?? "").matchAll(/^(?:Client|Address):\s*(.+)$/gim)].map(
    (m) => m[1] ?? "",
  );
  if (!lines.length)
    return "a search needs the brief's Client: line first, to keep the client's words here";
  const words = new Set(
    lines
      .join(" ")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length >= 4),
  );
  const hit = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .some((w) => words.has(w));
  return hit
    ? "a query with a word of the client's name or address stays on this machine: search the trade, the materials or the kind of place"
    : null;
}
