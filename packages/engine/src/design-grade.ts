/**
 * What a new site's page is held to (item 2026-10-30-005, D-1, D-2, D-5): the fixture's numbers read
 * against the limits, each offence with its rule id. Page-level limits hold on a Persuade or
 * Experience page; an Operate or Read page keeps the frontend standard alone. A value a project
 * declares in `DESIGN.md` counts only with the user's decision on record.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  addHistoryRow,
  compareFingerprints,
  DESIGN_FILE_MAX,
  DISPLAY_MAX_PX,
  DISPLAY_MAX_VW,
  designDir,
  type Fingerprint,
  gradeComp,
  historyPrint,
  itemHash,
  PHONE_DISPLAY_MAX_VW,
  RECENT_ROWS,
  readComp,
  readDeal,
  readHistory,
  readSurface,
} from "./design.ts";
import { errorText, nowIso, readRegularText } from "./fs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { writeProtectedJson } from "./store.ts";
import type { WorkItem } from "./types.ts";

export interface PageProbe {
  width: number;
  height: number;
  title: { count: number; sizePx: number; lines: number; boxShare: number; inView: boolean };
  displayPx: number;
  bodyPx: number;
  controls: number[];
  icons: number[];
  sectionGaps: number[];
  navShare: number;
  margins: { left: number; right: number };
  blankGaps: number[];
  emptyScreens: number;
  untitled: number;
  lopsided: number;
  iconCards: number;
  families: number;
  sizes: number;
  lowContrast: number;
  eyebrows: number;
  microLabels: number;
  covered: number;
  clipped: number;
  pictures: number;
  aiLook?: string | null;
  compRegions?: { id: string; x: number; y: number; w: number; h: number }[];
  motion?: { count: number; kinds: string[]; titleLate?: boolean | null };
  fingerprint?: { display: string; body: string; palette: string; sections: string; hero: string };
}

export interface Offence {
  id: string;
  text: string;
}

export interface Limits {
  displayMaxPx?: number;
  /** `DESIGN.md` declares `devices: [ai-look]`: a brand that really is cream or violet. */
  look?: boolean;
}

export const LIMITS = {
  displayMaxPx: DISPLAY_MAX_PX,
  displayMaxVw: DISPLAY_MAX_VW,
  phoneDisplayMaxVw: PHONE_DISPLAY_MAX_VW,
  ratioMin: 2.5,
  ratioMax: 6,
  titleBoxMax: 0.4,
  bodyMin: 16,
  bodyMax: 20,
  controlMin: 36,
  phoneControlMin: 44,
  controlMax: 64,
  iconMax: 64,
  gapDesktop: [120, 240],
  gapPhone: [72, 112],
  navShareMax: 0.1,
  picturesMin: 4,
  movingMin: 8,
  phoneWidth: 480,
};

/** The longest run of neighbouring sections with the same shape. */
function sameRun(sections: string): number {
  let best = 0;
  let run = 0;
  let last = "";
  for (const shape of sections.split(",")) {
    run = shape && shape === last ? run + 1 : 1;
    last = shape;
    best = Math.max(best, run);
  }
  return best;
}

/** The limits a project declared, each only with an answered decision named beside it. */
export function readLimits(contract: string, answered: ReadonlySet<string>): Limits {
  const front = /^---\n([\s\S]*?)\n---/.exec(contract)?.[1] ?? "";
  const look = /^devices\s*:.*\bai-look\b/m.test(front);
  const decision = /^proportion-decision:\s*(D-\d+)\s*$/m.exec(front)?.[1];
  const declared = look ? { look } : {};
  if (!decision || !answered.has(decision)) return declared;
  const max = /^proportion-display-max-px:\s*(\d+)\s*$/m.exec(front)?.[1];
  return max ? { ...declared, displayMaxPx: Number(max) } : declared;
}

const PAGE_LEVEL = new Set(["persuade", "experience"]);

/** The offences of one width's reading. */
export function gradeProbe(probe: PageProbe, surface: string, limits: Limits): Offence[] {
  if (!PAGE_LEVEL.has(surface)) return [];
  const out: Offence[] = [];
  const add = (id: string, text: string) =>
    out.push({ id, text: `${id}: ${text} at ${probe.width}` });
  const phone = probe.width <= LIMITS.phoneWidth;
  const L = LIMITS;
  const size = probe.title.sizePx || probe.displayPx;
  const maxPx = phone
    ? (L.phoneDisplayMaxVw * probe.width) / 100
    : (limits.displayMaxPx ?? Math.min(L.displayMaxPx, (L.displayMaxVw * probe.width) / 100));
  if (size > maxPx)
    add("proportion/display-size", `display type ${size}px (limit ${Math.round(maxPx)}px)`);
  if (probe.bodyPx > 0) {
    const ratio = size / probe.bodyPx;
    if (size > 0 && (ratio < L.ratioMin || ratio > L.ratioMax))
      add(
        "proportion/display-ratio",
        `display is ${ratio.toFixed(1)} times body (${L.ratioMin} to ${L.ratioMax})`,
      );
    if (probe.bodyPx < L.bodyMin || probe.bodyPx > L.bodyMax)
      add("proportion/body-size", `body ${probe.bodyPx}px (${L.bodyMin} to ${L.bodyMax})`);
  }
  if (probe.title.boxShare > L.titleBoxMax)
    add(
      "proportion/title-box",
      `the title takes ${Math.round(probe.title.boxShare * 100)}% of the first screen (limit ${L.titleBoxMax * 100}%)`,
    );
  const minControl = phone ? L.phoneControlMin : L.controlMin;
  const badControl = probe.controls.find((h) => h < minControl || h > L.controlMax);
  if (badControl !== undefined)
    add(
      "proportion/control-height",
      `a control ${badControl}px high (${minControl} to ${L.controlMax})`,
    );
  const bigIcon = probe.icons.find((w) => w > L.iconMax);
  if (bigIcon !== undefined)
    add("proportion/icon-size", `an icon ${bigIcon}px wide (limit ${L.iconMax})`);
  const maxGap = (phone ? L.gapPhone : L.gapDesktop)[1] as number;
  const bigGap = probe.sectionGaps.find((g) => g > maxGap);
  if (bigGap !== undefined)
    add("proportion/section-gap", `sections ${bigGap}px apart (limit ${maxGap})`);
  if (probe.navShare > L.navShareMax)
    add(
      "proportion/nav-share",
      `navigation takes ${Math.round(probe.navShare * 100)}% of the first screen (limit 10%)`,
    );

  if (probe.title.count === 0) add("page/no-title", "the page has no visible h1");
  if (probe.title.lines > 2)
    add("page/headline-lines", `the title runs to ${probe.title.lines} lines (limit 2)`);
  if (probe.motion?.titleLate) add("page/late-title", "the title is hidden 1.2 s after load");
  if (probe.covered > 0)
    add("page/covered-text", `${probe.covered} text blocks covered by another element`);
  if (probe.clipped > 0) add("page/clipped-text", `${probe.clipped} text blocks clipped`);
  const diff = Math.abs(probe.margins.left - probe.margins.right);
  if (
    diff >= Math.max(phone ? 14 : 40, 0.045 * probe.width) &&
    Math.max(probe.margins.left, probe.margins.right) >= (phone ? 28 : 0.07 * probe.width)
  )
    add("frame/off-centre", `margins ${probe.margins.left} and ${probe.margins.right}`);
  if (probe.lopsided >= 2) add("frame/lopsided", `${probe.lopsided} sections huddle on one side`);
  const gapLimit = 0.6 * probe.height;
  const blank = probe.blankGaps.filter((g) => g >= gapLimit);
  if (blank.length || probe.blankGaps.filter((g) => g >= 0.42 * probe.height).length >= 2)
    add("frame/blank-gap", `a stretch of ${Math.max(...probe.blankGaps)}px holds nothing`);
  if (probe.emptyScreens >= 2)
    add("frame/empty-screens", `${probe.emptyScreens} screens nearly empty`);
  if (probe.untitled >= 2)
    add("frame/untitled-section", `${probe.untitled} sections with no heading`);
  const run = sameRun(probe.fingerprint?.sections ?? "");
  if (run >= 3) add("frame/same-layout", `${run} sections in a row share one layout`);
  if (probe.iconCards > 0)
    add("craft/icon-cards", "a row of identical boxed cards, each with an icon");
  if (probe.families > 3) add("type/font-count", `${probe.families} font families (limit 3)`);
  if (probe.sizes > 9) add("type/size-count", `${probe.sizes} text sizes (limit 9)`);
  if (probe.lowContrast > 0) add("colour/contrast", `${probe.lowContrast} text blocks under 2.6:1`);
  if (probe.aiLook && !limits.look)
    add("colour/ai-look", `${probe.aiLook}: the look a generated page falls into`);
  if (probe.eyebrows > 0) add("label/eyebrow", `${probe.eyebrows} eyebrow labels above a heading`);
  if (probe.microLabels >= 3)
    add("label/micro", `${probe.microLabels} tiny uppercase tracked labels`);
  if (!phone && probe.pictures < L.picturesMin)
    add("picture/few", `${probe.pictures} pictures (a site carries at least ${L.picturesMin})`);
  if (!phone && probe.motion && probe.motion.count < L.movingMin)
    add("motion/still", `${probe.motion.count} moving elements (at least ${L.movingMin})`);
  return out;
}

/** The page's reading, where a capture's metadata holds one, at each width. */
function probesOf(meta: unknown): PageProbe[] {
  const viewports = (meta as { viewports?: unknown } | null)?.viewports;
  if (!Array.isArray(viewports)) return [];
  return viewports.map((v) => (v as { page?: unknown }).page).filter(validProbe);
}

/** A reading from a file the session owns: its shape is checked, so a forged one cannot throw out of the grade. */
function validProbe(p: unknown): p is PageProbe {
  if (!p || typeof p !== "object") return false;
  const r = p as PageProbe;
  const number = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const numbers = (v: unknown) => Array.isArray(v) && v.every(number);
  const text = (v: unknown) => typeof v === "string";
  return (
    number(r.width) &&
    number(r.height) &&
    !!r.title &&
    number(r.title.count) &&
    number(r.title.sizePx) &&
    number(r.title.lines) &&
    number(r.title.boxShare) &&
    number(r.displayPx) &&
    number(r.bodyPx) &&
    numbers(r.controls) &&
    numbers(r.icons) &&
    numbers(r.sectionGaps) &&
    numbers(r.blankGaps) &&
    !!r.margins &&
    number(r.margins.left) &&
    number(r.margins.right) &&
    (r.motion === undefined ||
      r.motion === null ||
      (number(r.motion.count) && Array.isArray(r.motion.kinds) && r.motion.kinds.every(text))) &&
    (r.fingerprint === undefined ||
      (!!r.fingerprint &&
        Object.values(r.fingerprint).length === 5 &&
        Object.values(r.fingerprint).every(text))) &&
    (r.compRegions === undefined || Array.isArray(r.compRegions))
  );
}

export interface DesignGrade {
  offences: string[];
  lines: string[];
  fingerprint: Fingerprint | null;
}

/**
 * The third look at a new site after the UI grade: each default capture's readings against the
 * limits, then the fingerprint against the history. Nothing for an `extend` item or a page with no
 * reading, so an ordinary item runs as before. A forged reading can pass no reviewer: the images stand.
 */
export function gradeDesign(paths: CrewPaths, work: WorkItem): DesignGrade {
  const record = readSurface(paths, work.id);
  const none: DesignGrade = { offences: [], lines: [], fingerprint: null };
  if (!record || record.invention === "extend") return none;
  const contract = readRegularText(join(paths.root, "DESIGN.md"), DESIGN_FILE_MAX) ?? "";
  const answered = new Set((work.decisions ?? []).filter((d) => d.answer).map((d) => d.id));
  const limits = readLimits(contract, answered);
  const dir = join(workDir(paths, work.id), "review", "ui");
  const names = existsSync(dir)
    ? readdirSync(dir).filter((n) => /^[a-z0-9-]+-default\.json$/.test(n))
    : [];
  const offences: string[] = [];
  let widest: PageProbe | null = null;
  for (const name of names.sort()) {
    const meta = readJsonQuiet(join(dir, name));
    for (const probe of probesOf(meta)) {
      for (const o of gradeProbe(probe, record.surface, limits))
        offences.push(`${o.text} (${name.replace(/-default\.json$/, "")})`);
      if (!widest || probe.width > widest.width) widest = probe;
    }
  }
  // The comp path (D-4): the approved comp's regions against the page's marked elements at the widest width.
  const comp = readComp(paths, work.id);
  if (comp && widest)
    for (const o of gradeComp(comp.regions, widest.compRegions ?? [])) offences.push(o.text);
  const lines = [
    `design: ${names.length} page${names.length === 1 ? "" : "s"} measured, surface ${record.surface}, invention ${record.invention}`,
  ];
  if (!widest?.fingerprint || !PAGE_LEVEL.has(record.surface))
    return { offences, lines, fingerprint: null };
  const print: Fingerprint = {
    ...widest.fingerprint,
    motion: (widest.motion?.kinds ?? []).sort().join(",") || "none",
  };
  writeProtectedJson(paths, join(designDir(paths, work.id), "fingerprint.json"), print);
  // The project's path with the id: item ids repeat between projects, and the hash keeps them one-way.
  const self = itemHash(`${paths.root}:${work.id}`);
  const history = readHistory(paths.userDir);
  if (history.warning) lines.push(history.warning);
  const alike = compareFingerprints(
    historyPrint(print),
    history.rows.filter((r) => r.item !== self),
  );
  if (alike) offences.push(alike);
  // The palette and the first screen are what a visitor sees first: four dimensions apart still let three
  // cream-and-rust pages through (docs/evals), so neither repeats among the latest sites.
  const earlier = history.rows.filter((r) => r.item !== self).slice(-RECENT_ROWS);
  const repeat = earlier.find((r) => r.palette === print.palette);
  if (repeat)
    offences.push(
      `design/palette-repeat: palette ${print.palette} repeats ${repeat.item} (${repeat.at}); a site's palette differs from the last ${RECENT_ROWS}`,
    );
  const lastHero = earlier.slice(-2).find((r) => r.hero === print.hero);
  if (lastHero)
    offences.push(
      `design/hero-repeat: first screen ${print.hero} repeats ${lastHero.item} (${lastHero.at}); it differs from the last 2`,
    );
  lines.push(
    `fingerprint: ${print.display}, ${print.body}, ${print.palette}, ${print.hero}, ${print.sections}, ${print.motion}`,
  );
  return { offences, lines, fingerprint: print };
}

/** Adds a site that passed to the history; a value outside the schema is said, and never blocks the run. */
export function recordDesignHistory(
  paths: CrewPaths,
  work: WorkItem,
  print: Fingerprint,
): string | null {
  try {
    const deal = readDeal(paths, work.id);
    const chosen = deal ? deal.options[deal.chosen ?? 0] : undefined;
    addHistoryRow(paths.userDir, {
      at: nowIso(),
      item: `${paths.root}:${work.id}`,
      fingerprint: print,
      ...(chosen ? { dealt: [chosen.direction, chosen.hero, chosen.type, chosen.palette] } : {}),
    });
    return null;
  } catch (error) {
    return `design history: ${errorText(error)}`;
  }
}

function readJsonQuiet(path: string): unknown {
  const text = readRegularText(path, 1024 * 1024);
  if (text === null) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}
