import { existsSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { readText } from "./fs.ts";
import { isMailPriority, type Source } from "./types.ts";

const CONNECTORS = ["clickup", "jira", "notion", "other"] as const;
const KEYS = new Set([
  "channel",
  "connector",
  "externalId",
  "url",
  "documentPath",
  "proposedPriority",
]);

/**
 * The document's real file under the root, or the refusal (SP7 §10.1; security review of SP3 Task 3):
 * a relative path with no `..` segment, naming a regular file whose real path (symlinks resolved)
 * lies under the root's real path, so a link to a file outside the root is refused.
 */
function documentFile(root: string, documentPath: string): { file: string } | { refused: string } {
  const bad = `source: documentPath ${documentPath}`;
  if (
    !documentPath.trim() ||
    isAbsolute(documentPath) ||
    documentPath.split(/[\\/]/).includes("..")
  )
    return { refused: `${bad} is not a relative path under the root` };
  const candidate = join(root, documentPath);
  let real: string;
  let rootReal: string;
  try {
    if (!existsSync(candidate) || !statSync(candidate).isFile())
      return { refused: `${bad} is not a file under the root` };
    real = realpathSync(candidate);
    rootReal = realpathSync(root);
  } catch {
    return { refused: `${bad} is not a file under the root` };
  }
  const rel = relative(rootReal, real);
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel))
    return { refused: `${bad} resolves outside the root` };
  return { file: real };
}

/** The `--source` flag's value, validated before anything is created; each refusal names the key. */
export function parseSource(raw: string, root: string): Source | { refused: string } {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { refused: "source: a JSON object" };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { refused: "source: a JSON object" };
  const input = value as Record<string, unknown>;
  for (const key of Object.keys(input))
    if (!KEYS.has(key)) return { refused: `source: unknown key ${key}` };
  const channel = input.channel;
  if (channel !== "document" && channel !== "task-manager")
    return { refused: "source: channel is document or task-manager" };
  const source: Source = { channel };
  if (channel === "task-manager") {
    const connector = input.connector;
    const externalId = input.externalId;
    if (typeof connector !== "string" || typeof externalId !== "string" || !externalId.trim())
      return { refused: "source: a task manager needs connector and externalId" };
    if (!(CONNECTORS as readonly string[]).includes(connector))
      return { refused: "source: connector is clickup, jira, notion or other" };
    source.connector = connector as Source["connector"];
    source.externalId = externalId.trim();
  } else {
    const documentPath = input.documentPath;
    if (typeof documentPath !== "string")
      return { refused: "source: a document needs documentPath" };
    const file = documentFile(root, documentPath);
    if ("refused" in file) return file;
    if (!(readText(file.file) ?? "").trim())
      return { refused: `source: documentPath ${documentPath} is empty` };
    source.documentPath = documentPath;
  }
  if (input.url !== undefined) {
    if (typeof input.url !== "string" || !/^https?:\/\//.test(input.url))
      return { refused: "source: url is http or https" };
    source.url = input.url;
  }
  if (input.proposedPriority !== undefined) {
    if (!isMailPriority(input.proposedPriority))
      return { refused: "source: proposedPriority is one of blocker, high, normal, low" };
    source.proposedPriority = input.proposedPriority;
  }
  return source;
}

/** `clickup 86c1 (https://…)`, `jira AB-1`, `document docs/requests/x.md`: the source as the start, the status and the report name it. */
export function sourceLine(source: Source): string {
  if (source.channel === "document") return `document ${source.documentPath ?? ""}`;
  return `${source.connector ?? "other"} ${source.externalId ?? ""}${source.url ? ` (${source.url})` : ""}`;
}

/** The original text the brief quotes verbatim: the document's text (its path checked again at the read), else the request's. */
export function sourceText(
  source: Source,
  root: string,
  input: string,
): string | { refused: string } {
  if (source.channel !== "document" || !source.documentPath) return input;
  const file = documentFile(root, source.documentPath);
  if ("refused" in file) return file;
  return readText(file.file) ?? "";
}
