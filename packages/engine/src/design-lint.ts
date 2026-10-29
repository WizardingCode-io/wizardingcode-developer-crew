// The design lint (SP9 Task 6, ADR 0016): what text alone decides about motion and craft in the
// changed interface files, as a built-in gate like `secrets`. Nine rules, one readable pattern
// each, with their id in the tail; what needs a browser, a computed value or a design judgement is
// the reviewer's. A forged file can fail the gate and never pass it: every file is read only as a
// regular file under the cap, and every string from a file or the policy is made safe.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { allWatchedFiles, gitShowFile } from "./fingerprint.ts";
import { nowIso, regularFileSize, writeText } from "./fs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { isInterfacePath, isTestPath } from "./paths-kind.ts";
import { safeText } from "./quote.ts";
import type { Policy, Profile, WorkItem } from "./types.ts";

/** The rules, in the order their hits are listed within one line. */
export const LINT_RULES = [
  "motion/transition-all",
  "motion/scale-from-zero",
  "motion/layout-property",
  "motion/duration-over-500",
  "motion/ease-in",
  "motion/reduced-motion-missing",
  "hover/unguarded",
  "perf/will-change",
  "tokens/raw-colour",
  // 2026-10-29-001 (P-2): the standard's Refused list, from taste-skill (MIT, Leonxlnx, v2.1.2) and
  // ai-slop-cleaner (MIT, oh-my-claudecode, 8690a21), distilled.
  "craft/gradient-text",
  "craft/emoji",
  "copy/placeholder",
  "craft/glass",
  "layout/100vh",
] as const;
export type LintRule = (typeof LINT_RULES)[number];

const ADVISORY_RULES: ReadonlySet<string> = new Set([
  "motion/ease-in",
  "hover/unguarded",
  "perf/will-change",
  "craft/glass",
  "layout/100vh",
]);

/** The device a contract declares to turn a craft rule off (`devices:` in `DESIGN.md`'s front matter). */
const RULE_DEVICE: Partial<Record<LintRule, string>> = {
  "craft/gradient-text": "gradient-text",
  "craft/emoji": "emoji",
  "craft/glass": "glass",
  "layout/100vh": "full-viewport",
};

export type LintVerdictKind = "defect" | "advisory" | "disabled";

export interface LintHit {
  rule: string;
  file: string;
  line: number;
  text: string;
  verdict: LintVerdictKind;
  /** The why of an inline allowance (`crew-lint: allow <rule> -- <why>`), null when the hit stands. */
  allowed: string | null;
}

export interface LintUnresolved {
  file: string;
  line: number;
  text: string;
}

export type InventoryKind = "transition" | "animation" | "vue-transition" | "motion" | "waapi";

export interface LintInventoryEntry {
  file: string;
  line: number;
  kind: InventoryKind;
  property: string | null;
  durationMs: number | null;
  easing: string | null;
}

export interface LintOptions {
  /** The rule ids `policy.json` disables (`ui.lint.disabled`): their hits are kept and never judged. */
  disabled?: readonly string[];
  /** The design contract, when the project has one: whether it declares colour tokens, and the devices it adopts. */
  contract?: { colours: boolean; devices?: readonly string[] } | null;
  /** The devices the base commit's contract declared; a device counts only when it is there too. Absent: the contract's own (no history to compare). */
  baseDevices?: readonly string[];
  /** The project's watched files, searched for the reduced-motion guard when the change adds motion. */
  projectFiles?: readonly string[];
}

export interface LintResult {
  /** The changed interface files linted, in the change's order. */
  files: string[];
  /** The changed interface files that could not be read as a regular file under the cap, sorted. */
  skipped: string[];
  hits: LintHit[];
  unresolved: LintUnresolved[];
  inventory: LintInventoryEntry[];
  /** The known rule ids the policy disabled. */
  disabled: string[];
  /** The ids the policy named that no rule has. */
  unknownDisabled: string[];
  /** The craft rules the project's design contract turns off, with the device it declares (2026-10-29-001). */
  offByContract?: { rule: string; device: string }[];
  /** The devices this change's contract declares that its base did not: their rules stay on until the declaration is committed. */
  pendingByContract?: { rule: string; device: string }[];
}

/** The counts a gate run carries (`GateRun.lint`). */
export interface LintCounts {
  file: string | null;
  defects: number;
  advisories: number;
  unresolved: number;
  allowed: number;
  disabled: number;
  inventory: number;
}

export const DESIGN_LINT_FILE = "review/design-lint.json";
const FILE_MAX = 1024 * 1024;

const LAYOUT = /^(?:width|height|top|left|right|bottom|margin|padding)$|^(?:margin|padding)-/;
const LAYOUT_DECLARATION =
  /(?<![\w-])(?:width|height|top|left|right|bottom|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?)\s*:/;
const DURATION_VALUE = /\b(?:transition|animation)(?:-duration)?\s*:\s*([^;}]*)/g;
const SHORTHAND = /\b(transition|animation)\s*:\s*([^;}]*)/g;
const LITERAL_DURATION = /(\d*\.?\d+)(ms|s)\b/;
const UNRESOLVED_TOKEN = /var\(|\$[\w-]+|@[\w-]+|theme\(|calc\(|env\(/;
const EASING = /\b(ease-in-out|ease-in|ease-out|ease|linear|cubic-bezier\([^)]*\)|steps\([^)]*\))/;
const MOTION_ADDED =
  /\b(?:animation|transition)\s*:|@keyframes\b|<transition(?:group)?\b|\bmotion\.|usemotion\(|\banimate\(/;
const GUARD = /prefers-reduced-motion|useReducedMotion|reducedMotion|motion-reduce:/;
const RAW_COLOUR = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\b(?:rgba?|hsla?)\(/i;
const ALLOWANCE = /crew-lint:\s*allow\s+(\S+)\s+--\s*(.*?)\s*(?:\*\/|-->|$)/;
const GRADIENT_TEXT = /(?:-webkit-)?background-clip\s*:\s*text\b|(?<![\w-])bg-clip-text(?![\w-])/;
/** A pictograph (the Unicode property), never a symbol a page uses as text: ©, ®, ™, arrows, •, ✓. */
const EMOJI = /\p{Extended_Pictographic}/u;
const NOT_EMOJI = /[\u00a9\u00ae\u2122\u2190-\u21ff\u2022\u2713]/gu;
const PLACEHOLDER =
  /\blorem ipsum\b|\bjohn doe\b|\bjane doe\b|(?<![\p{L}\p{N}])acme(?![\p{L}\p{N}])|(?:^|[@/.\s'"])example\.com(?=$|[/:"'\s])/u;
/** An input's `placeholder` attribute with its quoted value. */
const PLACEHOLDER_ATTRIBUTE = /\bplaceholder\s*=\s*(["'])[^"']*\1/g;
const GLASS = /\bbackdrop-filter\s*:|(?<![\w-])backdrop-blur(?:-[a-z0-9]+)?(?![\w-])/;
const FULL_VIEWPORT = /\b100vh\b|(?<![\w-])(?:min-)?h-screen(?![\w-])/;
/** A line without its comments (a line comment not after a scheme's colon, a block comment, an HTML or a Blade comment): what the copy rules read. */
function outsideComments(line: string): string {
  return line
    .replace(/<!--.*?(?:-->|$)/g, "")
    .replace(/\{\{--.*?(?:--\}\}|$)/g, "")
    .replace(/\/\*.*?(?:\*\/|$)/g, "")
    .replace(/(?<!:)\/\/.*$/, "");
}

/** A relative path with no `..` segment: the only kind the lint opens. */
function isSafeRelative(rel: string): boolean {
  const path = rel.replace(/\\/g, "/");
  if (path.startsWith("/") || /^[a-z]:/i.test(path)) return false;
  return !path.split("/").some((segment) => segment === "..");
}

/** The text of a regular file under the cap, or null for a link, a FIFO, a folder, an absent, an oversize, a binary or a climbing path. */
function readSafe(root: string, rel: string): string | null {
  if (!isSafeRelative(rel)) return null;
  const size = regularFileSize(join(root, rel));
  if (size === null || size > FILE_MAX) return null;
  let buffer: Buffer;
  try {
    buffer = readFileSync(join(root, rel));
  } catch {
    return null;
  }
  if (buffer.subarray(0, 8000).includes(0)) return null;
  return buffer.toString("utf8");
}

/** The milliseconds of the first literal duration in a value, or null. */
function literalMs(value: string): number | null {
  const match = LITERAL_DURATION.exec(value);
  if (!match) return null;
  const n = Number(match[1]);
  return match[2] === "s" ? n * 1000 : n;
}

/** The named easing of a value, or null. */
function easingOf(value: string): string | null {
  const match = EASING.exec(value);
  return match?.[1] ?? null;
}

/** The first word of a value: the property a transition animates, the name of an animation. */
function firstToken(value: string): string | null {
  const token = value.trim().split(/[\s,]+/)[0] ?? "";
  return token && token !== "none" ? token : null;
}

/** Every value of a `transition`/`animation` property on the line, by the pattern given (reset per call). */
function values(line: string, pattern: RegExp): string[] {
  const found: string[] = [];
  pattern.lastIndex = 0;
  for (let m = pattern.exec(line); m; m = pattern.exec(line)) found.push(m[m.length - 1] ?? "");
  return found;
}

/** The hits one line gives, each rule once per line, in the rules' order. */
function lineHits(
  lower: string,
  inKeyframes: boolean,
  colours: boolean,
  raw: string,
  testFile: boolean,
): LintRule[] {
  const hits: LintRule[] = [];
  if (/\btransition(?:-property)?\s*:\s*all\b/.test(lower) || /\btransition-all\b/.test(lower))
    hits.push("motion/transition-all");
  if (
    /\bscale(?:3d|x|y)?\(\s*0(?:\.0+)?\s*[,)]/.test(lower) ||
    (/\bscale-0\b/.test(lower) && /\b(?:transition|animate-)/.test(lower))
  )
    hits.push("motion/scale-from-zero");
  const transitions = values(lower, /\btransition(?:-property)?\s*:\s*([^;}]*)/g);
  const layout = transitions.some((value) =>
    value
      .split(",")
      .map((part) => part.trim().split(/\s+/)[0] ?? "")
      .some((property) => LAYOUT.test(property)),
  );
  if (layout || (inKeyframes && LAYOUT_DECLARATION.test(lower)))
    hits.push("motion/layout-property");
  const durations = values(lower, DURATION_VALUE);
  const over = durations.some((value) => (literalMs(value) ?? 0) > 500);
  const tailwind = /\bduration-(\d+)\b/.exec(lower);
  if (over || (tailwind && Number(tailwind[1]) > 500)) hits.push("motion/duration-over-500");
  if (/\bease-in\b(?!-out)/.test(lower)) hits.push("motion/ease-in");
  if (colours && RAW_COLOUR.test(lower)) hits.push("tokens/raw-colour");
  if (GRADIENT_TEXT.test(lower)) hits.push("craft/gradient-text");
  // The copy rules read the line outside its comments, once; an input's placeholder attribute is
  // the convention for an example value, not shipped copy.
  const copy = outsideComments(raw);
  if (EMOJI.test(copy.replace(NOT_EMOJI, ""))) hits.push("craft/emoji");
  if (!testFile && PLACEHOLDER.test(copy.toLowerCase().replace(PLACEHOLDER_ATTRIBUTE, "")))
    hits.push("copy/placeholder");
  if (GLASS.test(lower)) hits.push("craft/glass");
  if (FULL_VIEWPORT.test(lower)) hits.push("layout/100vh");
  return hits;
}

/** Whether the line has a duration value with no literal and a variable, a function or a preprocessor token where one would sit. */
function isUnresolved(lower: string): boolean {
  return values(lower, DURATION_VALUE).some(
    (value) => literalMs(value) === null && UNRESOLVED_TOKEN.test(value),
  );
}

/** The animated declarations one line holds. */
function inventoryOf(file: string, line: number, raw: string): LintInventoryEntry[] {
  const entries: LintInventoryEntry[] = [];
  const lower = raw.toLowerCase();
  SHORTHAND.lastIndex = 0;
  for (let m = SHORTHAND.exec(raw); m; m = SHORTHAND.exec(raw)) {
    const kind = (m[1] ?? "").toLowerCase() as "transition" | "animation";
    const value = m[2] ?? "";
    const property = firstToken(value);
    if (property === null) continue;
    entries.push({
      file,
      line,
      kind,
      property: safeText(property),
      durationMs: literalMs(value),
      easing: easingOf(value),
    });
  }
  const vue = /<transition(?:group)?\b([^>]*)>?/.exec(lower);
  if (vue) {
    const name = /\bname\s*=\s*["']([^"']*)["']/.exec(vue[1] ?? "");
    entries.push({
      file,
      line,
      kind: "vue-transition",
      property: name ? safeText(name[1]) : null,
      durationMs: null,
      easing: null,
    });
  }
  if (/\bmotion\.|usemotion\(|(?<![.\w])animate\(/.test(lower))
    entries.push({ file, line, kind: "motion", property: null, durationMs: null, easing: null });
  if (/\.animate\(/.test(lower))
    entries.push({ file, line, kind: "waapi", property: null, durationMs: null, easing: null });
  return entries;
}

/** The why of an allowance for the rule on the line, or null. */
function allowanceFor(line: string | undefined, rule: string): string | null {
  if (!line) return null;
  // A carriage return or a Unicode line separator (U+2028, U+2029) inside the line would stop the
  // match: each is read as a space.
  const normalised = [...line]
    .map((c) => (c === "\r" || c.charCodeAt(0) === 0x2028 || c.charCodeAt(0) === 0x2029 ? " " : c))
    .join("");
  const match = ALLOWANCE.exec(normalised);
  if (!match || match[1] !== rule) return null;
  const why = (match[2] ?? "").trim();
  return why ? safeText(why) : null;
}

/**
 * Lints the changed interface files as text: the hits of the nine rules, the unresolved durations,
 * the inventory of animated declarations, what the policy disabled and what could not be read.
 */
export function lintInterfaceFiles(
  root: string,
  changed: readonly string[],
  options: LintOptions = {},
): LintResult {
  const known = new Set<string>(LINT_RULES);
  const wanted = [...new Set((options.disabled ?? []).map((id) => safeText(id)))];
  const disabled = wanted.filter((id) => known.has(id));
  const unknownDisabled = wanted.filter((id) => !known.has(id));
  const colours = options.contract?.colours === true;
  // A device the contract adopts turns its rule off for the project (2026-10-29-001, P-2), once
  // the base commit's contract declared it too: a change cannot switch a rule off for itself.
  const devices = new Set(options.contract?.devices ?? []);
  const atBase = new Set(options.baseDevices ?? options.contract?.devices ?? []);
  const declared = (Object.entries(RULE_DEVICE) as [LintRule, string][]).filter(([, device]) =>
    devices.has(device),
  );
  const offPairs = declared.filter(([, device]) => atBase.has(device));
  const pendingPairs = declared.filter(([, device]) => !atBase.has(device));
  const offByContract = new Set<string>(offPairs.map(([rule]) => rule));
  const files: string[] = [];
  const skipped: string[] = [];
  const texts = new Map<string, string>();
  for (const rel of changed) {
    if (!isInterfacePath(rel)) continue;
    const text = readSafe(root, rel);
    if (text === null) skipped.push(safeText(rel));
    else {
      // The safe name is the one every record carries; the text is keyed by it too.
      const name = safeText(rel);
      files.push(name);
      texts.set(name, text);
    }
  }
  skipped.sort();
  const hits: LintHit[] = [];
  const unresolved: LintUnresolved[] = [];
  const inventory: LintInventoryEntry[] = [];
  let firstMotion: { file: string; line: number; text: string } | null = null;
  for (const file of files) {
    const lines = (texts.get(file) ?? "").split("\n");
    const name = file;
    const guarded = /\(hover:\s*hover\)/i.test(texts.get(file) ?? "");
    let hoverSaid = false;
    let willChange = 0;
    let depth = 0;
    let inKeyframes = false;
    let keyframesDepth = 0;
    lines.forEach((raw, index) => {
      const line = index + 1;
      // An allowance comment names a rule; the rules never read the comment itself.
      const lower = raw.toLowerCase().replace(/crew-lint:[^*\n]*/g, "");
      if (/@keyframes\b/.test(lower) && !inKeyframes) {
        inKeyframes = true;
        keyframesDepth = depth;
      }
      const text = safeText(raw);
      const rules: string[] = lineHits(
        lower,
        inKeyframes,
        colours,
        raw.replace(/crew-lint:[^*\n]*/g, ""),
        isTestPath(file),
      ).filter((rule) => !offByContract.has(rule));
      if (/:hover\b/.test(lower) && !guarded && !hoverSaid) {
        hoverSaid = true;
        rules.push("hover/unguarded");
      }
      if (/\bwill-change\s*:/.test(lower) && ++willChange === 3) rules.push("perf/will-change");
      for (const rule of rules) {
        const allowed = allowanceFor(raw, rule) ?? allowanceFor(lines[index - 1], rule);
        const verdict: LintVerdictKind = disabled.includes(rule)
          ? "disabled"
          : ADVISORY_RULES.has(rule)
            ? "advisory"
            : "defect";
        hits.push({
          rule,
          file: name,
          line,
          text,
          verdict,
          allowed: verdict === "disabled" ? null : allowed,
        });
      }
      if (isUnresolved(lower)) unresolved.push({ file: name, line, text });
      inventory.push(...inventoryOf(name, line, raw));
      if (!firstMotion && MOTION_ADDED.test(lower)) firstMotion = { file: name, line, text };
      depth += (raw.match(/{/g) ?? []).length - (raw.match(/}/g) ?? []).length;
      if (inKeyframes && depth <= keyframesDepth) inKeyframes = false;
    });
  }
  // The guard is searched only when the change adds motion: a clean change pays nothing.
  if (firstMotion !== null) {
    const found =
      [...texts.values()].some((text) => GUARD.test(text)) ||
      (options.projectFiles ?? []).some((rel) => {
        if (texts.has(rel)) return false;
        const text = readSafe(root, rel);
        return text !== null && GUARD.test(text);
      });
    if (!found) {
      const rule = "motion/reduced-motion-missing";
      const at: { file: string; line: number; text: string } = firstMotion;
      hits.push({
        rule,
        file: at.file,
        line: at.line,
        text: at.text,
        verdict: disabled.includes(rule) ? "disabled" : "defect",
        allowed: null,
      });
    }
  }
  const order = (rule: string) => LINT_RULES.indexOf(rule as LintRule);
  hits.sort(
    (a, b) =>
      files.indexOf(a.file) - files.indexOf(b.file) ||
      a.line - b.line ||
      order(a.rule) - order(b.rule),
  );
  return {
    files,
    skipped,
    hits,
    unresolved,
    inventory,
    disabled,
    unknownDisabled,
    offByContract: offPairs.map(([rule, device]) => ({ rule, device })),
    pendingByContract: pendingPairs.map(([rule, device]) => ({ rule, device })),
  };
}

/** The `devices:` list of a front matter, inline (`[a, b]`) or as `- a` lines; only `[a-z-]` names. */
function frontDevices(front: string): string[] {
  const inline = /^devices\s*:\s*\[([^\]\n]*)\]/m.exec(front);
  const block = /^devices\s*:\s*\n((?:[ \t]+-[ \t]*[^\n]*\n?)+)/m.exec(front);
  const raw = inline
    ? (inline[1] ?? "").split(",")
    : block
      ? (block[1] ?? "").split("\n").map((l) => l.replace(/^[ \t]+-[ \t]*/, ""))
      : [];
  return raw.map((d) => d.trim().replace(/^["']|["']$/g, "")).filter((d) => /^[a-z-]+$/.test(d));
}

/** The contract's text and its declarations: its colour tokens and the devices its front matter adopts. */
function contractOf(text: string): { colours: boolean; devices: string[] } {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return {
    colours: front !== null && /^colou?rs\s*:/m.test(front[1] ?? ""),
    devices: front ? frontDevices(`${front[1] ?? ""}\n`) : [],
  };
}

/** The first contract's text a reader finds, `DESIGN.md` at the root then under `docs/`; null without one. */
function firstContract(read: (path: string) => string | null): string | null {
  for (const candidate of ["DESIGN.md", "docs/DESIGN.md"]) {
    const text = read(candidate);
    if (text !== null) return text;
  }
  return null;
}

/** The devices the contract declared at the base commit, read from git; the working tree's when there is no base. */
function baseContractDevices(root: string, base: string | null): string[] | undefined {
  if (base === null) return undefined;
  const text = firstContract((path) => {
    const shown = gitShowFile(root, base, path);
    return shown !== null && shown.length <= FILE_MAX ? shown : null;
  });
  return text === null ? [] : contractOf(text).devices;
}

/** The design contract's declarations: `DESIGN.md` at the root or under `docs/`, read as a regular file; its colour tokens and the devices it adopts; null without one. */
export function readDesignContract(root: string): { colours: boolean; devices: string[] } | null {
  const text = firstContract((path) => readSafe(root, path));
  return text === null ? null : contractOf(text);
}

/** The hits by what they count as: the standing defects, the advisories, the allowed and the disabled; one place says what stands. */
function partition(hits: readonly LintHit[]): {
  defects: LintHit[];
  advisories: LintHit[];
  allowed: LintHit[];
  disabled: LintHit[];
} {
  return {
    defects: hits.filter((h) => h.verdict === "defect" && h.allowed === null),
    advisories: hits.filter((h) => h.verdict === "advisory" && h.allowed === null),
    allowed: hits.filter((h) => h.allowed !== null),
    disabled: hits.filter((h) => h.verdict === "disabled"),
  };
}

/** The run's status, reason and tail from a lint result, in the tail's fixed order. */
export function lintVerdict(result: LintResult): {
  status: "pass" | "fail";
  reason: string | null;
  tail: string;
} {
  if (result.files.length === 0 && result.skipped.length === 0)
    return { status: "pass", reason: null, tail: "no interface file in the change" };
  const { defects, advisories, allowed, disabled: disabledHits } = partition(result.hits);
  const where = (h: LintHit) => `${h.rule} ${h.file}:${h.line}`;
  const lines: string[] = [
    ...defects.map(where),
    ...advisories.map((h) => `advisory: ${where(h)}`),
    ...allowed.map((h) => `allowed: ${where(h)} (${h.allowed})`),
  ];
  if (result.disabled.length) {
    lines.push(`rules disabled by policy: ${result.disabled.join(", ")}`);
    lines.push(...disabledHits.map((h) => `disabled: ${where(h)}`));
  }
  if (result.unknownDisabled.length)
    lines.push(`unknown rule in ui.lint.disabled: ${result.unknownDisabled.join(", ")}`);
  for (const off of result.offByContract ?? [])
    lines.push(`${off.rule} off: DESIGN.md declares ${off.device}`);
  for (const pending of result.pendingByContract ?? [])
    lines.push(
      `${pending.rule} on: DESIGN.md declares ${pending.device} in this change; it takes effect once committed`,
    );
  if (result.skipped.length) lines.push(`skipped: ${result.skipped.join(", ")}`);
  lines.push(`unresolved: ${result.unresolved.length}`);
  lines.push(`inventory: ${result.inventory.length} animated declarations (${DESIGN_LINT_FILE})`);
  const first = defects[0];
  const reason = first
    ? `${where(first)}${defects.length > 1 ? `, +${defects.length - 1} more` : ""}`
    : null;
  return { status: first ? "fail" : "pass", reason, tail: lines.join("\n") };
}

/** The counts a gate run carries. */
export function lintCounts(result: LintResult, file: string | null): LintCounts {
  const parts = partition(result.hits);
  return {
    file,
    defects: parts.defects.length,
    advisories: parts.advisories.length,
    unresolved: result.unresolved.length,
    allowed: parts.allowed.length,
    disabled: parts.disabled.length,
    inventory: result.inventory.length,
  };
}

/** Writes the engine-owned file the reviewer reads, beside the UI plan and the manifest under `review/`. */
export function writeDesignLint(paths: CrewPaths, id: string, result: LintResult): string {
  const record = {
    at: nowIso(),
    files: result.files,
    skipped: result.skipped,
    hits: result.hits,
    unresolved: result.unresolved,
    inventory: result.inventory,
    disabled: result.disabled,
  };
  writeText(join(workDir(paths, id), DESIGN_LINT_FILE), `${JSON.stringify(record, null, 2)}\n`);
  return DESIGN_LINT_FILE;
}

/** What a gate run takes from one design-lint run. */
export interface DesignLintRun {
  command: string;
  exit: number;
  status: "pass" | "fail";
  durationMs: number;
  tail: string;
  reason?: string;
  lint: LintCounts;
}

/**
 * One run of the gate (SP9 Task 6), as `scanSecrets` is to the secrets gate: the lint over the files
 * (an item's change, or a todo's scope) with the policy's disabled rules, the project's design
 * contract and its watched files; the verdict; the file for an item's run (`writes`), none for a
 * todo's; the counts.
 */
export function runDesignLint(options: {
  paths: CrewPaths;
  work: WorkItem;
  profile: Profile;
  files: readonly string[];
  policy: Policy;
  writes: boolean;
}): DesignLintRun {
  const { paths, work, profile, files, policy, writes } = options;
  const started = Date.now();
  const result = lintInterfaceFiles(paths.root, files, {
    disabled: policy.ui.lint.disabled,
    contract: readDesignContract(paths.root),
    baseDevices: baseContractDevices(paths.root, work.baseCommit),
    projectFiles: allWatchedFiles(paths.root, profile) ?? [],
  });
  const verdict = lintVerdict(result);
  const file = writes ? writeDesignLint(paths, work.id, result) : null;
  return {
    command: "built-in design lint",
    exit: verdict.status === "pass" ? 0 : 1,
    status: verdict.status,
    durationMs: Date.now() - started,
    tail: verdict.tail,
    ...(verdict.reason ? { reason: verdict.reason } : {}),
    lint: lintCounts(result, file),
  };
}
