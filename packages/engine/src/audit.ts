/**
 * Reading a dependency audit's report (ADR 0006). Each tool prints its own JSON; the advisories are
 * the identifiers a reader would quote (GHSA-, CVE-, PKSA-, PYSEC-, or npm's numeric id as
 * `npm-<id>`), so the set of a run and the set at the base commit can be compared whatever the tool.
 */

export type AuditToolName = "npm" | "pnpm" | "yarn" | "bun" | "composer" | "pip-audit";

export interface AuditReport {
  /** False when the text is not the tool's JSON: the gate is then judged by the exit code. */
  readable: boolean;
  advisories: string[];
  /** Composer's abandoned packages: maintenance information, never a failure. */
  abandoned: string[];
}

const NAMED_ID =
  /\b(GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}|CVE-\d{4}-\d{4,}|PKSA-[0-9a-z]{4}(?:-[0-9a-z]{4}){1,2}|PYSEC-\d{4}-\d+)\b/i;

function named(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = NAMED_ID.exec(value)?.[1];
  if (!id) return null;
  // One spelling per identifier: the prefix upper case, the rest lower case (GHSA and PKSA ids are
  // written that way; CVE and PYSEC ids are digits).
  const dash = id.indexOf("-");
  return `${id.slice(0, dash).toUpperCase()}${id.slice(dash).toLowerCase()}`;
}

type Obj = Record<string, unknown>;

function isObject(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The identifier of an object that is an advisory, or null for any other object. */
function advisoryId(o: Obj): string | null {
  const byName =
    named(o.advisoryId) ??
    named(o.github_advisory_id) ??
    named(o.url) ??
    named(o.id) ??
    named(o.cve);
  if (byName) return byName;
  const numeric = typeof o.source === "number" ? o.source : typeof o.id === "number" ? o.id : null;
  return numeric === null ? null : `npm-${numeric}`;
}

function collect(value: unknown, into: Set<string>, skipKey?: string): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, into);
    return;
  }
  if (!isObject(value)) return;
  const id = advisoryId(value);
  if (id) {
    into.add(id);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === skipKey) continue;
    collect(child, into);
  }
}

function abandonedOf(root: unknown): string[] {
  if (!isObject(root)) return [];
  const list = root.abandoned;
  if (Array.isArray(list)) return list.filter((v): v is string => typeof v === "string");
  if (isObject(list)) return Object.keys(list);
  return [];
}

/** The JSON in the text: the whole of it, from its first brace, or one object per line (yarn). */
function parseJson(text: string): unknown[] | null {
  const whole = tryParse(text);
  if (whole !== undefined) return [whole];
  const start = text.search(/[{[]/);
  if (start >= 0) {
    const fromBrace = tryParse(text.slice(start));
    if (fromBrace !== undefined) return [fromBrace];
  }
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"))
    .map(tryParse)
    .filter((v) => v !== undefined);
  return lines.length ? lines : null;
}

function tryParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function parseAudit(tool: AuditToolName, text: string): AuditReport {
  const documents = parseJson(text);
  if (!documents) return { readable: false, advisories: [], abandoned: [] };
  const ids = new Set<string>();
  const abandoned: string[] = [];
  for (const doc of documents) {
    collect(doc, ids, tool === "composer" ? "abandoned" : undefined);
    if (tool === "composer") abandoned.push(...abandonedOf(doc));
  }
  return { readable: true, advisories: [...ids], abandoned };
}
