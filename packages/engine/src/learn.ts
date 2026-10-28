/**
 * Learn (vision phase 9, SP7 §12, SP4 Task 4): a proven item enters the base. The entries are
 * built from the records as they stand, scanned for secrets before anything is written, and the
 * base learns a root cause once (rule 17). The workspace's other projects are told by mail.
 */
import { join } from "node:path";
import { readOrigin } from "./analysis.ts";
import { learnedBody } from "./evidence.ts";
import { changedWatchedPaths, gitHead } from "./fingerprint.ts";
import { nowIso, readJson, readText } from "./fs.ts";
import {
  addEntry,
  KNOWLEDGE_TEXT_LIMIT,
  type KnowledgeScope,
  readBase,
  scopeOf,
  updateEntry,
  visibleTo,
  words,
} from "./knowledge.ts";
import { loadRegistry, type MailContext, send } from "./mail.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { parseFacts, urlRefusal } from "./research.ts";
import { scanText } from "./secrets.ts";
import type { KnowledgeDraft, KnowledgeEntry, Policy, Profile, Stack, WorkItem } from "./types.ts";
import { kindOfItem } from "./work.ts";

export interface LearnOutcome {
  entries: KnowledgeEntry[];
  confirmed: string[];
  notices: { to: string; id: string | null; refused?: string }[];
  /** The facts left out, named: a documentation source the engine refuses (userinfo, not http). */
  skipped: string[];
}

/** The body under `## <heading>` up to the next `## `, trimmed, or null without the heading. */
function section(text: string | null, heading: string): string | null {
  if (text === null) return null;
  const re = new RegExp(`^##\\s+${heading}\\s*$`, "m");
  const start = re.exec(text);
  if (!start) return null;
  const body = text.slice(start.index + start[0].length);
  const end = body.search(/^##\s/m);
  return (end === -1 ? body : body.slice(0, end)).trim();
}

/** The targets whose path holds a changed file: `.` holds every file. */
function stacksOf(profile: Profile, changed: readonly string[]): Stack[] {
  const stacks = new Set<Stack>();
  for (const target of profile.targets) {
    const prefix = target.path === "." ? "" : `${target.path.replace(/\/$/, "")}/`;
    if (changed.some((p) => p.startsWith(prefix))) stacks.add(target.stack);
  }
  return [...stacks];
}

/** A draft's text within the base's limit for one entry. */
function clipKnowledge(text: string): string {
  return text.slice(0, KNOWLEDGE_TEXT_LIMIT);
}

/** What the drafts are built from, per kind, for the refusal that names a secret's source. */
const SOURCE: Record<KnowledgeDraft["kind"], string> = {
  "validated-solution": "spec.md",
  "root-cause": "analysis.md",
  documentation: "conclave/researcher.md",
  "stack-preference": "the profiles",
  general: "general",
  "harness-lesson": "the improvement run's record",
};

/** The drafts of an item, read from its records, git (the changed files, HEAD) and the registry's profiles; nothing written: the solution, an issue's cause, the facts with a URL source, the workspace's stack preference. */
export function draftsOf(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
  policy: Policy,
  scope: KnowledgeScope,
): { drafts: KnowledgeDraft[]; skipped: string[] } {
  const dir = workDir(paths, work.id);
  const base = {
    workspace: scope.workspace,
    project: scope.project,
    projectRoot: scope.projectRoot,
    commit: null as string | null,
    stacks: [] as Stack[],
    paths: [] as string[],
    source: null as string | null,
    item: work.id as string | null,
  };
  const drafts: KnowledgeDraft[] = [];
  const skipped: string[] = [];
  // The validated solution: the spec's problem and the criteria, the files the item changed.
  const problem = section(readText(join(dir, "spec.md")), "Problem");
  const criteria = work.criteria.map((c) => `${c.id}: ${c.text}`);
  const solutionText = clipKnowledge([...(problem ? [problem] : []), ...criteria].join("\n"));
  const changed = changedWatchedPaths(paths.root, profile, work);
  const head = gitHead(paths.root);
  const commit = policy.artifacts === "commit" && head !== "none" ? head : null;
  drafts.push({
    ...base,
    kind: "validated-solution",
    title: work.title,
    confidential: true,
    stacks: stacksOf(profile, changed),
    paths: [...changed],
    commit,
    words: words(`${work.title} ${solutionText}`),
    text: solutionText,
  });
  // An issue's root cause: the analysis's cause over the origin's paths.
  if (kindOfItem(work) === "issue") {
    const cause = section(readText(join(dir, "analysis.md")), "Cause");
    const origin = readOrigin(paths, work.id)?.origin ?? null;
    if (cause && origin) {
      const title = `Root cause: ${work.title}`;
      const text = clipKnowledge(cause);
      drafts.push({
        ...base,
        kind: "root-cause",
        title,
        confidential: true,
        commit,
        paths: origin.paths.map((p) => p.path),
        // The words of the cause and the item's title: the fixed prefix would make every cause share two.
        words: words(`${work.title} ${text}`),
        text,
      });
    }
  }
  // The researcher's facts with a URL source, not disputed: the documentation's own words, unmarked.
  const researcher = readText(join(dir, "conclave", "researcher.md"));
  if (researcher !== null) {
    const verification = readJson<{ facts?: { id: string; status?: string }[] }>(
      join(dir, "conclave", "researcher.verification.json"),
    );
    const status = new Map((verification?.facts ?? []).map((f) => [f.id, f.status ?? ""]));
    for (const fact of parseFacts(researcher)) {
      if (!/^https?:\/\//.test(fact.source)) continue;
      if (status.get(fact.id) === "disputed") continue;
      const why = urlRefusal(fact.source);
      if (why) {
        skipped.push(`${fact.id}: ${fact.source} carries ${why}`);
        continue;
      }
      const url = new URL(fact.source);
      const source = `${url.origin}${url.pathname}`;
      const title = `${source} · ${fact.quote.slice(0, 60)}`;
      const text = clipKnowledge(`${fact.quote} · ${fact.claim}`);
      drafts.push({
        ...base,
        kind: "documentation",
        title,
        confidential: false,
        source,
        words: words(`${title} ${text}`),
        text,
      });
    }
  }
  // The workspace's stack preference, measured over its registered projects' profiles.
  if (scope.workspace !== null) {
    const counts = new Map<string, number>();
    for (const project of loadRegistry(paths.userDir).projects) {
      if (project.workspace !== scope.workspace) continue;
      const other = readJson<Profile>(join(project.root, ".crew", "profile.json"));
      if (!other || !Array.isArray(other.targets)) continue;
      for (const stack of new Set(other.targets.map((t) => t.stack)))
        counts.set(stack, (counts.get(stack) ?? 0) + 1);
    }
    if (counts.size) {
      const title = `Stack preference of ${scope.workspace}`;
      const text = [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([stack, n]) => `${stack}: ${n} project${n === 1 ? "" : "s"}`)
        .join("\n");
      drafts.push({
        ...base,
        kind: "stack-preference",
        title,
        confidential: true,
        item: null,
        words: words(`${title} ${text}`),
        text,
      });
    }
  }
  return { drafts, skipped };
}

/**
 * The words of the project's own prose (finding 139): with four or more root causes, a word at
 * least half of them hold says nothing of a cause; below four, none is common (rule 17 as before).
 */
export function commonWords(entries: readonly Pick<KnowledgeEntry, "words">[]): Set<string> {
  const common = new Set<string>();
  if (entries.length < 4) return common;
  const holders = new Map<string, number>();
  for (const entry of entries)
    for (const word of new Set(entry.words)) holders.set(word, (holders.get(word) ?? 0) + 1);
  for (const [word, count] of holders) if (count * 2 >= entries.length) common.add(word);
  return common;
}

/**
 * The same root cause (rule 17): at least one shared path and at least three shared words, the
 * base's common words not counted, the shared words at least a quarter of the shorter of the two word
 * lists (finding 185): on a hub file every cause shares the path, and a long title shares three words
 * with each of them; the proportion scales with the title's length and keeps a short re-worded cause
 * caught.
 */
export function sameRootCause(
  existing: Pick<KnowledgeEntry, "paths" | "words">,
  draft: Pick<KnowledgeDraft, "paths" | "words">,
  common: ReadonlySet<string> = new Set(),
): boolean {
  const path = draft.paths.some((p) => existing.paths.includes(p));
  const shared = draft.words.filter((w) => existing.words.includes(w) && !common.has(w)).length;
  const shorter = Math.min(existing.words.length, draft.words.length);
  return path && shared >= 3 && shared * 4 >= shorter;
}

/** The refusal for the first secret in a draft's title or text, naming the source and the field; null when clean. */
export function scanDrafts(drafts: readonly KnowledgeDraft[]): string | null {
  for (const draft of drafts) {
    for (const field of ["title", "text"] as const) {
      const finding = scanText(draft[field], field)[0];
      if (finding)
        return `${SOURCE[draft.kind]}: ${finding.rule} found in the ${field} of the ${draft.kind} entry; nothing was written`;
    }
  }
  return null;
}

/** The ids a text cites as `[K:<id>]`, the one form of a citation. */
function citations(text: string): Set<string> {
  return new Set([...text.matchAll(/\[K:([^\]]+)\]/g)].map((m) => m[1] ?? ""));
}

/** The ids the records cite as `[K:<id>]`, among the ones the engine listed for the item. */
function citedIds(dir: string, work: WorkItem): string[] {
  const listed = work.knowledge?.listed ?? [];
  if (!listed.length) return [];
  const text = ["spec.md", "strategy.md", "analysis.md"]
    .map((f) => readText(join(dir, f)) ?? "")
    .join("\n");
  const cited = citations(text);
  return listed.filter((id) => cited.has(id));
}

/** Rule 17's refusal: every entry that already records the cause, with the two ways out of each (finding 139). */
function duplicateRefusal(id: string, duplicates: readonly KnowledgeEntry[]): string {
  const origin = (d: KnowledgeEntry) => `item ${d.item ?? "-"}, commit ${d.commit ?? "-"}`;
  const contradict = (d: KnowledgeEntry) =>
    `crew knowledge contradict ${d.id} --reason "<why>" --item ${id}`;
  const [only] = duplicates;
  if (only && duplicates.length === 1)
    return `${only.id} already records this root cause (${origin(only)}): crew learn ${id} --confirm ${only.id} confirms it, ${contradict(only)} disputes it`;
  return `${duplicates.map((d) => d.id).join(", ")} already record this root cause (${duplicates.map((d) => `${d.id}: ${origin(d)}`).join("; ")}): crew learn ${id} --confirm <K-n> confirms one of them, ${duplicates.map(contradict).join(" and ")} dispute them`;
}

/**
 * The learn of one item: refused outside the phase, on an audit, twice, on a proof that no longer
 * holds, on a secret, on an id the project cannot read, on a duplicate root cause without
 * `--confirm`; else the drafts written, the cited entries confirmed, the workspace told.
 */
export function learnItem(
  paths: CrewPaths,
  work: WorkItem,
  profile: Profile,
  policy: Policy,
  mail: MailContext,
  proven: boolean,
  options: { confirm?: string } = {},
): LearnOutcome | { refused: string } {
  if (work.phase !== "learn")
    return { refused: `crew learn runs in the learn phase: crew phase ${work.id} next first` };
  if (kindOfItem(work) === "audit") return { refused: "an audit learns nothing in this release" };
  if (work.learned)
    return {
      refused: `already learned: ${learnedBody(work.learned.entries, work.learned.confirmed)}`,
    };
  if (!proven)
    return { refused: `not proven: the proof is on earlier code (crew gate run ${work.id})` };
  const dir = workDir(paths, work.id);
  const scope = scopeOf(paths, mail.self);
  const { drafts, skipped } = draftsOf(paths, work, profile, policy, scope);
  const secret = scanDrafts(drafts);
  if (secret) return { refused: secret };
  // The base as it is now: every confirmation goes through rule 13 at this moment, not at the lookup's.
  const read = readBase(paths.userDir);
  if (read.base === null && read.reason !== "missing")
    return { refused: `the knowledge base cannot be read: ${read.reason}` };
  const entries = read.base?.entries ?? [];
  const visible = (id: string): KnowledgeEntry | null =>
    entries.find((e) => e.id === id && visibleTo(e, scope)) ?? null;
  const toConfirm = citedIds(dir, work);
  for (const id of toConfirm)
    if (!visible(id)) return { refused: `no entry ${id} visible to this project` };
  const confirmTarget = options.confirm === undefined ? null : visible(options.confirm);
  if (options.confirm !== undefined) {
    if (!confirmTarget) return { refused: `no entry ${options.confirm} visible to this project` };
    if (confirmTarget.kind !== "root-cause")
      return {
        refused: `--confirm names ${options.confirm}, which is not a root cause this project reads`,
      };
  }
  // Rule 17: a root cause enters once, but beside an entry this item contradicted in this project
  // (finding 137) or one its analysis cites as [K:K-n] (finding 139); every match in one refusal.
  const cause = drafts.find((d) => d.kind === "root-cause");
  const contradicted = (e: KnowledgeEntry): boolean =>
    e.contradictedBy.some((r) => r.item === work.id && r.project === scope.project);
  const cited = citations(readText(join(dir, "analysis.md")) ?? "");
  const causes = entries.filter((e) => e.kind === "root-cause" && visibleTo(e, scope));
  const common = commonWords(causes);
  const duplicates = cause
    ? entries.filter(
        (e) =>
          e.kind === "root-cause" &&
          visibleTo(e, scope) &&
          !contradicted(e) &&
          !cited.has(e.id) &&
          sameRootCause(e, cause, common),
      )
    : [];
  if (duplicates.length && !duplicates.some((d) => d.id === confirmTarget?.id))
    return { refused: duplicateRefusal(work.id, duplicates) };
  const toWrite = confirmTarget ? drafts.filter((d) => d !== cause) : drafts;
  // The writes: a stack preference of this workspace is rewritten in place.
  const written: KnowledgeEntry[] = [];
  for (const draft of toWrite) {
    const existing =
      draft.kind === "stack-preference"
        ? entries.find(
            (e) =>
              e.kind === "stack-preference" &&
              e.workspace === scope.workspace &&
              visibleTo(e, scope),
          )
        : undefined;
    const saved = existing
      ? updateEntry(paths.userDir, existing.id, (e) => {
          e.text = draft.text;
          e.words = draft.words;
          e.paths = draft.paths;
        })
      : addEntry(paths.userDir, draft);
    if ("refused" in saved) return { refused: saved.refused };
    written.push(saved);
  }
  const at = nowIso();
  const confirmed: string[] = [];
  for (const id of [...toConfirm, ...(confirmTarget ? [confirmTarget.id] : [])]) {
    if (confirmed.includes(id)) continue;
    const saved = updateEntry(paths.userDir, id, (e) => {
      e.confirmedBy.push({ item: work.id, project: scope.project, at });
    });
    if ("refused" in saved) return { refused: saved.refused };
    confirmed.push(id);
  }
  const notices = tellWorkspace(paths, work, mail, scope, written);
  work.learned = { at, entries: written.map((e) => e.id), confirmed };
  return { entries: written, confirmed, notices, skipped };
}

/** The workspace's other registered projects are told of each entry (vision phase 9): a box that refuses is noted, never fatal. */
function tellWorkspace(
  paths: CrewPaths,
  work: WorkItem,
  mail: MailContext,
  scope: KnowledgeScope,
  written: readonly KnowledgeEntry[],
): LearnOutcome["notices"] {
  if (scope.workspace === null) return [];
  const siblings = loadRegistry(paths.userDir).projects.filter(
    (p) => p.workspace === scope.workspace && p.name !== scope.project,
  );
  const notices: LearnOutcome["notices"] = [];
  for (const entry of written)
    for (const sibling of siblings) {
      const sent = send(
        mail,
        {
          to: sibling.name,
          type: "notice",
          subject: `${entry.id} entered the base`,
          text: `${entry.id} entered the base: ${entry.title} (${entry.kind}, from ${scope.project})`,
          item: work.id,
        },
        work,
      );
      notices.push(
        "refused" in sent
          ? { to: sibling.name, id: null, refused: sent.refused }
          : { to: sibling.name, id: sent.message.id },
      );
    }
  return notices;
}
