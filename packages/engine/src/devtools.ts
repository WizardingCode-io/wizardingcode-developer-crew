// The deep audit through the chrome-devtools CLI (SP9 Task 7, ADR 0016): once per item inside the
// e2e run, after a passing e2e command and before the environment stops, only on a command a person
// confirmed; Lighthouse's audits and a performance trace per page, graded by the standard where it
// is unambiguous and said as advisory lines otherwise; `not captured` with its reason wherever the
// tool did not measure, never a verdict by default. Nothing a page or the CLI wrote reaches a shell
// unquoted or unvalidated, and nothing found in the folder is read as the audit's result.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { errorText, nowIso, readRegularText, writeText } from "./fs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { type RunResult, runCommand, shellWord } from "./run.ts";
import type { Profile, WorkItem } from "./types.ts";
import { safeText } from "./ui.ts";

export const AUDIT_DIR = "review/ui/audit";
export const AUDIT_FILE = `${AUDIT_DIR}/audit.json`;

/** The CLI's command lines, in one place a person can read against the tool's README. */
export const DEVTOOLS = {
  start: ["start", "--headless", "--isolated", "--no-usage-statistics", "--no-performance-crux"],
  newPage: "new_page",
  lighthouse: ["lighthouse_audit", "--mode", "navigation", "--device", "mobile"],
  trace: ["performance_start_trace", "--reload", "--autoStop"],
  stop: "stop",
  output: "--output-format=json",
} as const;

export const NO_DEVTOOLS_REASON =
  'no chrome-devtools in the profile: npm i -g chrome-devtools-mcp, then crew detect, or crew profile set browser.devtools "<cmd>"';
export const PROPOSED_REASON = "chrome-devtools proposed; crew profile confirm browser";
export const NO_URL_REASON = "no environment.url";
export const E2E_FAILED_REASON = "e2e command failed";

const DEFAULT_LIMITS = { commandMs: 60_000, totalMs: 300_000 };
const PAGE_CAP = 5;
const URL_MAX = 2048;
const FILE_MAX = 1024 * 1024;
const CLS_LIMIT = 0.1;
const PAGE_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** What `cmd.exe` reads as more than a word, whatever the quotes. */
const WIN32_UNSAFE = /[&|<>^%"\r\n]/;
/** The files the engine keeps under the audit folder besides `audit.json`: an earlier run's are swept before a run, so none is read as this run's. */
const ENGINE_FILES = /^(?:lighthouse-\d+\.json|trace-\d+\.json|insights-\d+\.txt)$/;

export interface DevtoolsLighthouse {
  file: string;
  scores: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  failed: { id: string; title: string; score: number }[];
}

export interface DevtoolsTrace {
  file: string | null;
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
}

export interface DevtoolsPage {
  url: string;
  id: string | null;
  lighthouse: DevtoolsLighthouse | null;
  trace: DevtoolsTrace | null;
  reason: string | null;
}

export interface DevtoolsAudit {
  status: "captured" | "not captured";
  reason: string | null;
  offence: string | null;
  lines: string[];
  pages: DevtoolsPage[];
}

export interface DevtoolsOptions {
  paths: CrewPaths;
  work: WorkItem;
  profile: Profile;
  /** The urls to audit, `auditPages`' list. */
  pages: readonly string[];
  env: NodeJS.ProcessEnv;
  /** Whether a capture's metadata carried a numeric CLS: the trace's figure is then advisory. */
  fixtureMeasuredCls: boolean;
  /** The e2e run's log name; the audit's logs sit beside it. */
  log: string;
  limits?: Partial<typeof DEFAULT_LIMITS>;
  platform?: NodeJS.Platform;
  /** The e2e command exited non-zero or timed out: a broken app is not audited. */
  e2eFailed?: boolean;
}

/** The pages to audit: `environment.url` first, then the captures' distinct urls, at most five. */
export function auditPages(
  environmentUrl: string | undefined,
  captureUrls: readonly string[],
): string[] {
  const seen = new Set<string>();
  const pages: string[] = [];
  for (const raw of [environmentUrl ?? "", ...captureUrls]) {
    const url = raw.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    pages.push(url);
    if (pages.length === PAGE_CAP) break;
  }
  return pages;
}

type Quoted = { ok: true; text: string } | { ok: false };

/** The argument quoted for the platform's shell, or refused where no quoting protects it. */
function quoteFor(platform: NodeJS.Platform, word: string): Quoted {
  if (platform === "win32")
    return WIN32_UNSAFE.test(word) ? { ok: false } : { ok: true, text: `"${word}"` };
  return word.includes("'") || /[\r\n]/.test(word)
    ? { ok: false }
    : { ok: true, text: shellWord(word) };
}

/** The url as the CLI gets it: parsed, http(s) only, bounded. */
function validUrl(raw: string): { href: string } | { reason: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { reason: "url not http(s)" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { reason: "url not http(s)" };
  if (url.href.length > URL_MAX) return { reason: "url not shell-safe" };
  return { href: url.href };
}

/** The first JSON object the text holds: the whole text, else from the first `{` to the last `}`. */
function jsonOf(text: string | null): Record<string, unknown> | null {
  if (text === null) return null;
  const parse = (s: string): Record<string, unknown> | null => {
    try {
      const value = JSON.parse(s) as unknown;
      return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const whole = parse(text.trim());
  if (whole) return whole;
  const from = text.indexOf("{");
  const to = text.lastIndexOf("}");
  return from >= 0 && to > from ? parse(text.slice(from, to + 1)) : null;
}

function pageIdOf(stdout: string | null): string | null {
  const json = jsonOf(stdout);
  if (!json) return null;
  const page =
    json.page && typeof json.page === "object" ? (json.page as Record<string, unknown>) : null;
  const id = json.pageId ?? json.id ?? page?.id;
  return typeof id === "string" && PAGE_ID.test(id) ? id : null;
}

/** The first number under a key named like `name` (case-insensitive), at any depth. */
function numberNamed(value: unknown, name: string, depth = 0): number | null {
  if (!value || typeof value !== "object" || depth > 8) return null;
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === name && typeof inner === "number" && Number.isFinite(inner))
      return inner;
  }
  for (const inner of Object.values(value as Record<string, unknown>)) {
    const found = numberNamed(inner, name, depth + 1);
    if (found !== null) return found;
  }
  return null;
}

/** LCP, CLS and INP from the trace command's output: the JSON's numbers, else `LCP: <n> ms`-style lines. */
function metricsOf(stdout: string | null): Omit<DevtoolsTrace, "file"> {
  const json = jsonOf(stdout);
  const fromText = (name: string): number | null => {
    const match = new RegExp(`\\b${name}\\b[^0-9\\n]*([0-9]+(?:\\.[0-9]+)?)`, "i").exec(
      stdout ?? "",
    );
    return match ? Number(match[1]) : null;
  };
  return {
    lcpMs: json ? numberNamed(json, "lcp") : fromText("LCP"),
    cls: json ? numberNamed(json, "cls") : fromText("CLS"),
    inpMs: json ? numberNamed(json, "inp") : fromText("INP"),
  };
}

const percent = (score: unknown): number | null =>
  typeof score === "number" && Number.isFinite(score) ? Math.round(score * 100) : null;

/** The report's scores, the accessibility audits at 0 with items, and the offences they are (one per audit, with the items' count). */
function gradeReport(
  report: Record<string, unknown>,
  file: string,
  url: string,
): { lighthouse: DevtoolsLighthouse; offences: string[] } {
  const categories = (report.categories ?? {}) as Record<string, Record<string, unknown>>;
  const audits = (report.audits ?? {}) as Record<string, Record<string, unknown>>;
  const refs = Array.isArray(categories.accessibility?.auditRefs)
    ? (categories.accessibility?.auditRefs as { id?: unknown }[])
    : [];
  const failed: DevtoolsLighthouse["failed"] = [];
  const offences: string[] = [];
  for (const ref of refs) {
    const id = typeof ref?.id === "string" ? ref.id : null;
    const audit = id ? audits[id] : undefined;
    if (!id || !audit || audit.score !== 0) continue;
    const details = audit.details as { items?: unknown } | undefined;
    if (!Array.isArray(details?.items) || details.items.length === 0) continue;
    const safeId = safeText(id);
    failed.push({ id: safeId, title: safeText(audit.title ?? id), score: 0 });
    offences.push(
      `audit: accessibility ${safeId} scored 0 on ${url} (${details.items.length} items)`,
    );
  }
  return {
    lighthouse: {
      file,
      scores: {
        performance: percent(categories.performance?.score),
        accessibility: percent(categories.accessibility?.score),
        bestPractices: percent(categories["best-practices"]?.score),
        seo: percent(categories.seo?.score),
      },
      failed,
    },
    offences,
  };
}

/** The Lighthouse report of one command: a `.json` that appeared in the folder after it started and holds `categories`, else the stdout's JSON; kept under the engine's name. */
function takeReport(
  dir: string,
  before: ReadonlySet<string>,
  stdout: string | null,
  n: number,
): Record<string, unknown> | null {
  const target = join(dir, `lighthouse-${n}.json`);
  let names: string[] = [];
  try {
    names = readdirSync(dir)
      .filter((name) => name.endsWith(".json") && !before.has(name))
      .sort();
  } catch {
    names = [];
  }
  for (const name of names) {
    const body = jsonOf(readRegularText(join(dir, name), FILE_MAX));
    if (body?.categories && typeof body.categories === "object") {
      renameSync(join(dir, name), target);
      return body;
    }
  }
  const printed = jsonOf(stdout);
  if (printed?.categories && typeof printed.categories === "object") {
    writeText(target, `${JSON.stringify(printed, null, 2)}\n`);
    return printed;
  }
  return null;
}

/** The trace command's output kept for the reviewer: control characters stripped, cut at the cap. */
function writeInsights(path: string, stdout: string | null): void {
  const text = stripControl(stdout ?? "").slice(0, FILE_MAX);
  // Never through a link: the sweep's rule for a file the engine writes under the session's folder.
  unlinkIfLink(path);
  // A plain write, not the temporary-file one: a folder that went away during the command throws here, and the step is named.
  writeFileSync(path, text.endsWith("\n") ? text : `${text}\n`);
}

/** The text without control characters (tabs and newlines kept): built from code points, so the source holds no escape a tool could turn into the character itself. */
function stripControl(text: string): string {
  let kept = "";
  for (const c of text) {
    const code = c.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10) || code === 127) continue;
    kept += c;
  }
  return kept;
}

function unlinkIfLink(path: string): void {
  try {
    if (lstatSync(path).isSymbolicLink()) unlinkSync(path);
  } catch {
    // nothing there
  }
}

function failure(
  tool: string,
  url: string,
  result: { exit: number | null; timedOut: boolean },
): string {
  return `${tool} failed on ${safeText(url)} (${result.timedOut ? "timed out" : `exit ${result.exit}`})`;
}

/** What one page's steps need: the folder, the platform's quoting, the runner. */
interface PageContext {
  dir: string;
  quotedDir: string;
  platform: NodeJS.Platform;
  run: (name: string, args: readonly string[]) => Promise<RunResult & { stdout: string | null }>;
}

/**
 * The audit once per item: the availability said first (no block, proposed, no url, a failed e2e
 * command), then the CLI through `runCommand` with the telemetry off, `start` once, the three tools
 * per page under the per-command cap and the budget, `stop` in a `finally`; every argument the
 * engine appends validated and quoted; the record written as `review/ui/audit/audit.json` whatever
 * happened, and the offences the standard names. The run never throws out of the gate: a failure
 * of its own (the record it could not write, the folder it could not make) is its reason.
 */
export async function runDevtoolsAudit(options: DevtoolsOptions): Promise<DevtoolsAudit> {
  try {
    return await auditRun(options);
  } catch (error) {
    const reason = safeText(errorText(error));
    try {
      writeNotCaptured(
        options.paths,
        options.work.id,
        options.profile.browser?.devtools.command ?? null,
        reason,
      );
    } catch {
      // the record's own failure is the reason already
    }
    return notCapturedResult(reason);
  }
}

function notCapturedResult(reason: string): DevtoolsAudit {
  return {
    status: "not captured",
    reason,
    offence: null,
    lines: [`audit: not captured (${reason})`],
    pages: [],
  };
}

/** The record of an audit that did not run or did not finish: no pages, the reason. */
function writeNotCaptured(
  paths: CrewPaths,
  id: string,
  command: string | null,
  reason: string,
): void {
  writeAudit(paths, id, {
    at: nowIso(),
    command,
    status: "not captured",
    reason,
    pages: [],
    offences: [],
    advisories: [],
  });
}

/** The sequence a person can read: the availability, `start`, a page at a time, `stop`, the grading, the record. */
async function auditRun(options: DevtoolsOptions): Promise<DevtoolsAudit> {
  const { paths, work, profile } = options;
  const dir = join(workDir(paths, work.id), AUDIT_DIR);
  const block = profile.browser?.devtools;
  const command = block?.command.trim() ?? "";
  const notCaptured = (reason: string): DevtoolsAudit => {
    writeNotCaptured(paths, work.id, command || null, reason);
    return notCapturedResult(reason);
  };
  sweepEngineFiles(dir);
  if (!block) return notCaptured(NO_DEVTOOLS_REASON);
  if (block.source !== "confirmed" || !command) return notCaptured(PROPOSED_REASON);
  if (!profile.environment?.url) return notCaptured(NO_URL_REASON);
  if (options.e2eFailed) return notCaptured(E2E_FAILED_REASON);
  const platform = options.platform ?? process.platform;
  const quotedDir = quoteFor(platform, dir);
  if (!quotedDir.ok) return notCaptured("path not shell-safe");
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const env = { ...options.env, CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: "1" };
  const logBase = options.log.replace(/\.txt$/, "");
  const logFor = (name: string) => join(workDir(paths, work.id), `${logBase}-audit-${name}.txt`);
  const run = async (name: string, args: readonly string[]) => {
    mkdirSync(dir, { recursive: true });
    const result = await runCommand(`${command} ${args.join(" ")}`, {
      cwd: paths.root,
      timeoutMs: limits.commandMs,
      logPath: logFor(name),
      env,
    });
    return { ...result, stdout: readRegularText(logFor(name), FILE_MAX) };
  };
  const context: PageContext = { dir, quotedDir: quotedDir.text, platform, run };
  const deadline = Date.now() + limits.totalMs;
  const pages: DevtoolsPage[] = [];
  // The offences of each page, indexed as `pages` (the page itself is the record's shape).
  const offencesOfPage: string[][] = [];
  let reason: string | null = null;
  try {
    const start = await run("start", [...DEVTOOLS.start, DEVTOOLS.output]);
    if (start.exit !== 0 || start.timedOut) {
      reason = `start failed (${start.timedOut ? "timed out" : `exit ${start.exit}`})`;
    } else {
      for (const [index, raw] of options.pages.entries()) {
        const page: DevtoolsPage = {
          url: safeText(raw),
          id: null,
          lighthouse: null,
          trace: null,
          reason: null,
        };
        pages.push(page);
        // The budget is read between pages: the first page always gets its turn after `start`.
        const overBudget = index > 0 && Date.now() > deadline;
        offencesOfPage.push(await auditPage(context, page, raw, index + 1, overBudget));
      }
    }
  } finally {
    try {
      await run("stop", [DEVTOOLS.stop]);
    } catch {
      // the stop's own failure changes nothing of the record
    }
  }
  if (reason !== null) return notCaptured(reason);
  const { offences, advisories } = gradeAudit(pages, offencesOfPage, options.fixtureMeasuredCls);
  writeAudit(paths, work.id, {
    at: nowIso(),
    command,
    status: "captured",
    reason: null,
    pages,
    offences,
    advisories,
  });
  const head = `audit: captured (${pages.length} page${pages.length === 1 ? "" : "s"}; ${AUDIT_FILE})`;
  return {
    status: "captured",
    reason: null,
    offence: offences[0] ?? null,
    lines: [head, ...offences, ...advisories],
    pages,
  };
}

/**
 * One page's steps: the url validated and quoted, `new_page`, `lighthouse_audit` (the report taken
 * and graded), `performance_start_trace` (the insights kept, the metrics read); a step that fails
 * or throws leaves the page's reason and the audit goes on to the next page. Returns the page's
 * offences.
 */
async function auditPage(
  ctx: PageContext,
  page: DevtoolsPage,
  raw: string,
  n: number,
  overBudget: boolean,
): Promise<string[]> {
  const valid = validUrl(raw);
  if ("reason" in valid) {
    page.reason = valid.reason;
    return [];
  }
  const quotedUrl = quoteFor(ctx.platform, valid.href);
  if (!quotedUrl.ok) {
    page.reason = "url not shell-safe";
    return [];
  }
  if (overBudget) {
    page.reason = "time budget";
    return [];
  }
  let step: string = DEVTOOLS.newPage;
  let offences: string[] = [];
  try {
    const opened = await ctx.run(`new-page-${n}`, [
      DEVTOOLS.newPage,
      "--url",
      quotedUrl.text,
      DEVTOOLS.output,
    ]);
    if (opened.exit !== 0 || opened.timedOut) {
      page.reason = failure(DEVTOOLS.newPage, raw, opened);
      return [];
    }
    const id = pageIdOf(opened.stdout);
    if (!id) {
      page.reason = "new_page gave no page id";
      return [];
    }
    page.id = id;
    step = DEVTOOLS.lighthouse[0];
    let before: Set<string>;
    try {
      before = new Set(readdirSync(ctx.dir));
    } catch {
      before = new Set();
    }
    const lighthouse = await ctx.run(`lighthouse-${n}`, [
      DEVTOOLS.lighthouse[0],
      id,
      ...DEVTOOLS.lighthouse.slice(1),
      "--outputDirPath",
      ctx.quotedDir,
      DEVTOOLS.output,
    ]);
    if (lighthouse.exit !== 0 || lighthouse.timedOut) {
      page.reason = failure(DEVTOOLS.lighthouse[0], raw, lighthouse);
      return [];
    }
    step = `lighthouse-${n}.json`;
    const report = takeReport(ctx.dir, before, lighthouse.stdout, n);
    if (report) {
      const graded = gradeReport(report, `lighthouse-${n}.json`, page.url);
      page.lighthouse = graded.lighthouse;
      offences = graded.offences;
    } else page.reason = "no Lighthouse report";
    const traceFile = join(ctx.dir, `trace-${n}.json`);
    const quotedTrace = quoteFor(ctx.platform, traceFile);
    if (!quotedTrace.ok) {
      page.reason ??= "path not shell-safe";
      return offences;
    }
    step = DEVTOOLS.trace[0];
    const trace = await ctx.run(`trace-${n}`, [
      DEVTOOLS.trace[0],
      id,
      ...DEVTOOLS.trace.slice(1),
      "--filePath",
      quotedTrace.text,
      DEVTOOLS.output,
    ]);
    if (trace.exit !== 0 || trace.timedOut) {
      page.reason ??= failure(DEVTOOLS.trace[0], raw, trace);
      return offences;
    }
    step = `insights-${n}.txt`;
    writeInsights(join(ctx.dir, `insights-${n}.txt`), trace.stdout);
    page.trace = {
      file: existsSync(traceFile) ? `trace-${n}.json` : null,
      ...metricsOf(trace.stdout),
    };
  } catch (error) {
    page.reason ??= `${step}: ${safeText(errorText(error))}`;
  }
  return offences;
}

/**
 * The grading in page order: the offences the standard names (an accessibility audit at 0 with
 * items, a traced CLS over the limit the fixture did not measure) and the advisory lines (the
 * scores, LCP and INP, a page not captured with its reason).
 */
function gradeAudit(
  pages: readonly DevtoolsPage[],
  offencesOfPage: readonly (readonly string[])[],
  fixtureMeasuredCls: boolean,
): { offences: string[]; advisories: string[] } {
  const offences: string[] = [];
  const advisories: string[] = [];
  for (const [index, page] of pages.entries()) {
    offences.push(...(offencesOfPage[index] ?? []));
    const cls = page.trace?.cls ?? null;
    if (cls !== null && cls > CLS_LIMIT && !fixtureMeasuredCls)
      offences.push(`audit: CLS ${cls} on ${page.url} (limit ${CLS_LIMIT})`);
    if (page.lighthouse) {
      const s = page.lighthouse.scores;
      const show = (v: number | null) => (v === null ? "n/a" : String(v));
      advisories.push(
        `audit: scores on ${page.url}: performance ${show(s.performance)}, accessibility ${show(s.accessibility)}, best practices ${show(s.bestPractices)}, seo ${show(s.seo)}`,
      );
    }
    if (page.trace && (page.trace.lcpMs !== null || page.trace.inpMs !== null))
      advisories.push(
        `audit: LCP ${page.trace.lcpMs ?? "n/a"} ms, INP ${page.trace.inpMs ?? "n/a"} ms on ${page.url}`,
      );
    if (page.reason) advisories.push(`audit: not captured on ${page.url} (${page.reason})`);
  }
  return { offences, advisories };
}

/** An earlier run's files under the engine's names removed, so a stale report is never beside this run's record; a folder that is not there, or not a folder, is left as it is. */
function sweepEngineFiles(dir: string): void {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!ENGINE_FILES.test(name)) continue;
    try {
      unlinkSync(join(dir, name));
    } catch {
      // a folder under the name stays: it is never read as a report (`takeReport` reads files that appeared after the command)
    }
  }
}

/** Writes the engine's record, never through a link. */
function writeAudit(
  paths: CrewPaths,
  id: string,
  record: {
    at: string;
    command: string | null;
    status: "captured" | "not captured";
    reason: string | null;
    pages: DevtoolsPage[];
    offences: string[];
    advisories: string[];
  },
): void {
  const path = join(workDir(paths, id), AUDIT_FILE);
  try {
    mkdirSync(join(workDir(paths, id), AUDIT_DIR), { recursive: true });
    unlinkIfLink(path);
    writeText(path, `${JSON.stringify(record, null, 2)}\n`);
  } catch (error) {
    throw new Error(`audit.json: ${errorText(error)}`);
  }
}
