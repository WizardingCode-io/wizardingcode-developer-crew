/**
 * The knowledge base (SP7 §12, SP4 Task 2, ADR 0009): one protected JSON file under the user's
 * crew directory, read whole and written whole under a lock; entries of five kinds, each with its
 * origin workspace and a confidentiality mark; one rule says what a project reads (rule 13); a
 * deterministic lookup by stacks, paths and words whose order a person can follow.
 */
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { nowIso, readText, writeJson } from "./fs.ts";
import { type AskOptions, askJev, type JevConfig, type JevQuestion } from "./jev.ts";
import { withLock } from "./lock.ts";
import { worktreeMainRoot } from "./mail.ts";
import { type CrewPaths, canonical, ctoDir, knowledgeDir, knowledgePath } from "./paths.ts";
import { scanText } from "./secrets.ts";
import type {
  KnowledgeBase,
  KnowledgeDraft,
  KnowledgeEntry,
  KnowledgeKind,
  KnownRootCause,
  Policy,
  Stack,
  Verification,
} from "./types.ts";
import { askAllowed } from "./verify.ts";

export const KNOWLEDGE_KINDS: readonly KnowledgeKind[] = [
  "stack-preference",
  "validated-solution",
  "documentation",
  "root-cause",
  "general",
];
/** The kinds a person adds with `crew knowledge add`; the other three are written at Learn alone. */
export const USER_KINDS: readonly KnowledgeKind[] = ["general", "documentation"];
/** An entry's text is cut here, so the base stays a file a hook reads whole. */
export const KNOWLEDGE_TEXT_LIMIT = 4000;
const BASE_VERSION = 1;

/** Who is reading the base: the project's workspace and name as the mail says them, and its main checkout's real path. */
export interface KnowledgeScope {
  workspace: string | null;
  project: string;
  projectRoot: string;
}

export function scopeOf(
  paths: CrewPaths,
  self: { workspace: string | null; project: string },
): KnowledgeScope {
  return {
    workspace: self.workspace,
    project: self.project,
    projectRoot: canonical(worktreeMainRoot(paths.root) ?? paths.root),
  };
}

/** Every entry enters marked (ADR 0009): it leaves its workspace by a person's `crew knowledge unmark` alone. */
export function defaultConfidential(_kind: KnowledgeKind): boolean {
  return true;
}

/**
 * Rule 13 as one function: an unmarked entry is read everywhere; a marked one inside its workspace;
 * with no workspace on either side, inside the project it came from, told by the main checkout's
 * real path and never by a folder's name. A `confidential` that is not exactly `false` is marked.
 */
export function visibleTo(entry: KnowledgeEntry, scope: KnowledgeScope): boolean {
  if (entry.confidential === false) return true;
  if (entry.workspace !== null) return entry.workspace === scope.workspace;
  return scope.workspace === null && entry.projectRoot === scope.projectRoot;
}

const STRING_FIELDS = ["id", "kind", "title", "project", "projectRoot", "text"] as const;
const NULLABLE_FIELDS = ["workspace", "item", "commit", "source"] as const;
const ARRAY_FIELDS = ["stacks", "paths", "words", "confirmedBy", "contradictedBy"] as const;

/** What is wrong with a parsed base, or null for a sound one: the shape is checked field by field (the security lead's R-4). */
function shapeFault(data: unknown): string | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) return "not an object";
  const base = data as Record<string, unknown>;
  if (base.version !== BASE_VERSION) {
    const version = typeof base.version === "number" ? base.version : 0;
    return version > BASE_VERSION
      ? `version ${version} is newer than this engine reads (${BASE_VERSION})`
      : "base.json: version is not 1";
  }
  if (!Number.isInteger(base.next) || (base.next as number) < 1)
    return "base.json: next is not a positive integer";
  if (!Array.isArray(base.entries)) return "base.json: entries is not an array";
  for (const [i, e] of (base.entries as unknown[]).entries()) {
    const name = `entry ${typeof (e as { id?: unknown })?.id === "string" ? (e as { id: string }).id : `#${i + 1}`}`;
    if (typeof e !== "object" || e === null) return `base.json: ${name} is not an object`;
    const entry = e as Record<string, unknown>;
    for (const field of STRING_FIELDS)
      if (typeof entry[field] !== "string") return `base.json: ${name} has no ${field}`;
    if (!KNOWLEDGE_KINDS.includes(entry.kind as KnowledgeKind))
      return `base.json: ${name} has an unknown kind ${String(entry.kind)}`;
    for (const field of NULLABLE_FIELDS)
      if (entry[field] !== null && typeof entry[field] !== "string")
        return `base.json: ${name} has a ${field} that is neither a string nor null`;
    if (typeof entry.confidential !== "boolean")
      return `base.json: ${name} has a confidential that is not a boolean`;
    for (const field of ARRAY_FIELDS)
      if (!Array.isArray(entry[field])) return `base.json: ${name} has no ${field} list`;
    if (typeof entry.createdAt !== "string") return `base.json: ${name} has no createdAt`;
    // A ref names an item or none (null; `"-"` is what 0.10.0 wrote for none), a project and a
    // date, and a reason when it has one (SP6 Task 1 AC-3).
    for (const list of ["confirmedBy", "contradictedBy"] as const)
      for (const r of entry[list] as unknown[]) {
        if (typeof r !== "object" || r === null)
          return `base.json: ${name} has a ref that is not an object`;
        const ref = r as Record<string, unknown>;
        if (ref.item !== null && typeof ref.item !== "string")
          return `base.json: ${name} has a ref whose item is neither a string nor null`;
        for (const field of ["project", "at"] as const)
          if (typeof ref[field] !== "string")
            return `base.json: ${name} has a ref with no ${field}`;
        if (ref.reason !== undefined && typeof ref.reason !== "string")
          return `base.json: ${name} has a ref whose reason is not a string`;
      }
  }
  return null;
}

/** The refs as this engine reads them: the dash 0.10.0 wrote for no item is null. */
function readRefs(base: KnowledgeBase): KnowledgeBase {
  for (const entry of base.entries)
    for (const list of [entry.confirmedBy, entry.contradictedBy])
      for (const ref of list) if (ref.item === "-") ref.item = null;
  return base;
}

/**
 * The base as it stands, or null with the reason: `missing` for no file (the first write creates
 * it), the parse error's words for garbage, the version for a later shape, the field for a wrong
 * one. A read never writes.
 */
export function readBase(userDir: string): { base: KnowledgeBase | null; reason: string } {
  const text = readText(knowledgePath(userDir));
  if (text === null) return { base: null, reason: "missing" };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return {
      base: null,
      reason: `base.json: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const fault = shapeFault(data);
  if (fault !== null) return { base: null, reason: fault };
  return { base: readRefs(data as KnowledgeBase), reason: "" };
}

/** The next id taken for good, the whole file written, under the folder's lock; an unreadable base is refused, a missing one created. */
export function addEntry(
  userDir: string,
  draft: KnowledgeDraft,
): KnowledgeEntry | { refused: string } {
  return withLock(
    knowledgeDir(userDir),
    () => {
      const read = readBase(userDir);
      if (read.base === null && read.reason !== "missing") return { refused: read.reason };
      const base: KnowledgeBase = read.base ?? { version: 1, next: 1, entries: [] };
      const entry: KnowledgeEntry = {
        ...draft,
        text: draft.text.slice(0, KNOWLEDGE_TEXT_LIMIT),
        id: `K-${base.next}`,
        createdAt: nowIso(),
        confirmedBy: [],
        contradictedBy: [],
      };
      base.next += 1;
      base.entries.push(entry);
      writeJson(knowledgePath(userDir), base);
      return entry;
    },
    { what: "the knowledge base" },
  );
}

/** One entry changed in place under the lock; an unknown id or an unreadable base is refused. */
export function updateEntry(
  userDir: string,
  id: string,
  change: (entry: KnowledgeEntry) => void,
): KnowledgeEntry | { refused: string } {
  return withLock(
    knowledgeDir(userDir),
    () => {
      const read = readBase(userDir);
      if (read.base === null)
        return { refused: read.reason === "missing" ? `no entry ${id} in the base` : read.reason };
      const entry = read.base.entries.find((e) => e.id === id);
      if (!entry) return { refused: `no entry ${id} in the base` };
      change(entry);
      writeJson(knowledgePath(userDir), read.base);
      return entry;
    },
    { what: "the knowledge base" },
  );
}

const STOP_WORDS = new Set([
  "that",
  "this",
  "with",
  "from",
  "into",
  "when",
  "then",
  "what",
  "have",
  "will",
  "every",
  "each",
  "their",
  "there",
  "which",
  "about",
  "after",
  "before",
  "also",
  "only",
]);

/** The words a text is looked up by: lower-case runs of letters and digits of four or more, minus the stop list, unique, in order. */
export function words(text: string): string[] {
  const seen = new Set<string>();
  for (const run of text.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [])
    if (!STOP_WORDS.has(run)) seen.add(run);
  return [...seen];
}

export interface LookupQuery {
  scope: KnowledgeScope;
  stacks: readonly Stack[];
  paths: readonly string[];
  words: readonly string[];
  kinds?: readonly KnowledgeKind[];
}

export interface LookupHit {
  entry: KnowledgeEntry;
  score: number;
  reasons: string[];
}

/**
 * The entries that bear on a query, visible ones alone (rule 13 first, then the kinds asked): a
 * reason per overlap, `2 × paths + stacks + words` as the score, hits above zero by score then by
 * date, the first `limit`. Deterministic; Jev reorders without dropping in Task 3.
 */
export function lookup(base: KnowledgeBase, query: LookupQuery, limit = 10): LookupHit[] {
  const hits: LookupHit[] = [];
  for (const entry of base.entries) {
    if (!visibleTo(entry, query.scope)) continue;
    if (query.kinds && !query.kinds.includes(entry.kind)) continue;
    const reasons: string[] = [];
    let score = 0;
    for (const path of query.paths)
      if (entry.paths.includes(path)) {
        reasons.push(`path ${path}`);
        score += 2;
      }
    for (const stack of query.stacks)
      if (entry.stacks.includes(stack)) {
        reasons.push(`stack ${stack}`);
        score += 1;
      }
    for (const word of query.words)
      if (entry.words.includes(word)) {
        reasons.push(`word ${word}`);
        score += 1;
      }
    if (score > 0) hits.push({ entry, score, reasons });
  }
  hits.sort((a, b) => b.score - a.score || b.entry.createdAt.localeCompare(a.entry.createdAt));
  return hits.slice(0, limit);
}

/**
 * The real path of a file named by a person, inside the project's real tree: null when there is
 * no file, "" when its real path (a `..`, an absolute path, a symlink) leaves the tree.
 */
export function fileInsideRoot(root: string, file: string): string | null {
  const candidate = resolve(root, file);
  if (!existsSync(candidate)) return null;
  try {
    const real = realpathSync(candidate);
    const rel = relative(realpathSync(root), real);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel) ? real : "";
  } catch {
    return null;
  }
}

/**
 * The root causes the base holds on an issue's origin paths (SP4 Task 5, rule 17): the root-cause
 * kind alone, visible entries alone, matched by a shared path and never by words or stacks, and
 * uncapped so a crowd of other hits never hides one; each with the paths it shares with the origin.
 */
export function knownRootCauses(
  base: KnowledgeBase,
  scope: KnowledgeScope,
  paths: readonly string[],
): KnownRootCause[] {
  const hits = lookup(
    base,
    { scope, stacks: [], paths, words: [], kinds: ["root-cause"] },
    Number.POSITIVE_INFINITY,
  );
  return hits.map(({ entry }) => ({
    id: entry.id,
    title: entry.title,
    item: entry.item,
    commit: entry.commit,
    paths: entry.paths.filter((p) => paths.includes(p)),
  }));
}

const PLAN_FILE = /^\d{4}-\d{2}-\d{2}-plan\.md$/;

/** The newest `<date>-plan.md` the CTO filed for a workspace (`crew cto record`), or null without one. */
export function latestPlan(
  userDir: string,
  workspace: string,
): { path: string; date: string } | null {
  const dir = ctoDir(userDir, workspace);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return null;
  }
  const last = names
    .filter((n) => PLAN_FILE.test(n))
    .sort()
    .at(-1);
  return last ? { path: join(dir, last), date: last.slice(0, 10) } : null;
}

/** One entry on one line, as `crew knowledge list` prints it. */
export function entryLine(e: KnowledgeEntry): string {
  return `${e.id} · ${e.kind} · "${e.title}" · ${e.workspace ?? "alone"} · ${e.confidential === false ? "unmarked" : "marked"} · confirmed ${e.confirmedBy.length}, contradicted ${e.contradictedBy.length}`;
}

/** One entry in full, every field then the text, as `crew knowledge show` prints it. */
export function entryText(e: KnowledgeEntry): string {
  const refs = (list: KnowledgeEntry["confirmedBy"]) =>
    list.length
      ? list
          .map(
            (r) =>
              `${r.item ?? "no item"} (${r.project}, ${r.at.slice(0, 10)})${r.reason ? `: ${r.reason}` : ""}`,
          )
          .join("; ")
      : "none";
  return [
    entryLine(e),
    `project: ${e.project} (${e.projectRoot})`,
    `item: ${e.item ?? "-"} · commit: ${e.commit ?? "-"} · source: ${e.source ?? "-"}`,
    `stacks: ${e.stacks.join(", ") || "-"} · paths: ${e.paths.join(", ") || "-"} · words: ${e.words.join(", ") || "-"}`,
    `created: ${e.createdAt} · confirmed by: ${refs(e.confirmedBy)} · contradicted by: ${refs(e.contradictedBy)}`,
    "---",
    e.text,
  ].join("\n");
}

/** Jev's word on one hit: likely or unlikely by the threshold, unverified between or when it could not answer. */
export interface JevMark {
  noul: number | null;
  verdict: "likely" | "unlikely" | "unverified";
  reason?: string;
}

export interface RankedHit extends LookupHit {
  /** Null when Jev was not asked (not configured, or the `knowledge` ask not allowed). */
  jev: JevMark | null;
}

/** A title as it may leave the machine: a secret in it replaced by its rule, never its value (the security lead's return at Task 3). */
function safeTitle(title: string): string {
  const finding = scanText(title, "title")[0];
  return finding ? `[redacted: ${finding.rule}]` : title;
}

/**
 * Jev over the lookup's hits (SP4 Task 3, the re-ranking cookbook): one noul per hit, the first
 * `maxClaimsPerItem`, over the request's title and kind and the entry's id, kind and title (the
 * text under `claims-and-snippets` alone, cut at the limit); likely hits first by noul, then the
 * rest as the lookup gave them. Nothing is dropped: Jev reorders and marks (rule 6).
 */
export async function rerankHits(
  cfg: JevConfig,
  policy: Policy,
  request: { title: string; kind: string },
  hits: readonly LookupHit[],
  options: AskOptions = {},
): Promise<{ hits: RankedHit[]; records: Verification[]; unavailable: string | null }> {
  if (!cfg.configured || !askAllowed(policy, "knowledge"))
    return { hits: hits.map((h) => ({ ...h, jev: null })), records: [], unavailable: null };
  const cap = policy.verify.maxClaimsPerItem;
  const entries: Record<string, unknown> = {};
  const questions: Record<string, JevQuestion> = {};
  hits.slice(0, cap).forEach((h, i) => {
    const id = `k${i + 1}`;
    entries[id] = {
      id: h.entry.id,
      kind: h.entry.kind,
      title: safeTitle(h.entry.title),
      ...(policy.verify.send === "claims-and-snippets"
        ? { text: h.entry.text.slice(0, KNOWLEDGE_TEXT_LIMIT) }
        : {}),
    };
    questions[id] = {
      type: "noul",
      instructions: `Does the entry \`entries.${id}\` bear on the request \`request\`: would a developer doing the request need to read it before designing?`,
      criteria: {
        true: "the entry's solution, cause, fact or tendency applies to what the request asks",
        false: "the entry concerns another need, another layer or another stack",
      },
    };
  });
  const state = { request: { title: safeTitle(request.title), kind: request.kind }, entries };
  const result = await askJev(cfg, { state, questions }, options);
  if (!result.ok) {
    const reason = `jev unavailable: ${result.unavailable}`;
    return {
      hits: hits.map((h) => ({ ...h, jev: { noul: null, verdict: "unverified", reason } })),
      records: [],
      unavailable: result.unavailable,
    };
  }
  const threshold = policy.verify.threshold;
  // The policy's threshold has at most two decimals: the lower bound is read the same way, so 0.2 is at 1 − 0.8.
  const lower = Number((1 - threshold).toFixed(2));
  const records: Verification[] = [];
  const ranked: RankedHit[] = hits.map((h, i) => {
    if (i >= cap)
      return { ...h, jev: { noul: null, verdict: "unverified", reason: "over maxClaimsPerItem" } };
    const id = `k${i + 1}`;
    const answer = result.answers[id];
    const question = questions[id];
    if (!answer || answer.type !== "noul" || !question)
      return {
        ...h,
        jev: { noul: null, verdict: "unverified", reason: "jev unavailable: no answer" },
      };
    const verdict =
      answer.noul >= threshold ? "likely" : answer.noul <= lower ? "unlikely" : "unverified";
    records.push({
      what: "knowledge",
      ref: h.entry.id,
      question: String(question.instructions),
      answer,
      confidence: null,
      model: result.model,
      at: nowIso(),
    });
    return { ...h, jev: { noul: answer.noul, verdict } };
  });
  const likely = ranked
    .filter((h) => h.jev?.verdict === "likely")
    .sort((a, b) => (b.jev?.noul ?? 0) - (a.jev?.noul ?? 0));
  return {
    hits: [...likely, ...ranked.filter((h) => h.jev?.verdict !== "likely")],
    records,
    unavailable: null,
  };
}

function jevWord(mark: JevMark | null): string {
  if (!mark) return "jev not asked";
  if (mark.verdict === "unverified") return `unverified (${mark.reason ?? "no answer"})`;
  return `${mark.verdict} ${mark.noul}`;
}

/** `knowledge.md` of an item: one bullet per hit with its reasons and Jev's word, or none, or why the base could not be read. */
export function knowledgeText(
  id: string,
  hits: readonly RankedHit[],
  unreadable: string | null,
): string {
  const lines = [`# Knowledge for ${id}`, ""];
  if (unreadable) lines.push(`- none (base unreadable: ${unreadable})`);
  else if (!hits.length) lines.push("- none");
  else
    for (const h of hits)
      lines.push(
        `- ${h.entry.id} · ${h.entry.kind} · "${h.entry.title}" · ${h.entry.workspace ?? "alone"} · ${h.reasons.join(", ")} · ${jevWord(h.jev)}`,
      );
  return `${lines.join("\n")}\n`;
}
