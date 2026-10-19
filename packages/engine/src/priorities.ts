import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { nowIso, readJson, readText, sha256, writeJson } from "./fs.ts";
import { priorityRank } from "./mail-status.ts";
import type { MailPriority, Triage, WorkItem } from "./types.ts";

/** The workspace's folder under the user's crew directory: `priorities.md` (the user's words) and `priorities.json` (the engine's signature). */
export function prioritiesDir(userDir: string, workspace: string): string {
  return join(userDir, "workspaces", workspace);
}

export type PrioritiesState = "none" | "unsigned" | "signed" | "changed";

export interface PrioritiesStatus {
  state: PrioritiesState;
  path: string;
  text: string | null;
  signedAt: string | null;
}

interface Signature {
  hash: string;
  by: string;
  at: string;
}

function hashOf(text: string): string {
  return `sha256:${sha256(text)}`;
}

/** The signature as written, or null when the file is there but not what the engine writes (read as changed). */
function readSignature(dir: string): Signature | null | undefined {
  const file = join(dir, "priorities.json");
  if (!existsSync(file)) return undefined;
  const raw = readJson<Partial<Signature>>(file);
  if (!raw || typeof raw.hash !== "string") return null;
  return { hash: raw.hash, by: String(raw.by ?? ""), at: String(raw.at ?? "") };
}

/**
 * Where the business priorities stand (SP7 §10.2): none without the file; unsigned with the file
 * and no signature; signed when the signature's hash is the file's; changed otherwise, a malformed
 * signature included (the file is not what was signed).
 */
export function prioritiesState(userDir: string, workspace: string): PrioritiesStatus {
  const dir = prioritiesDir(userDir, workspace);
  const path = join(dir, "priorities.md");
  const text = readText(path);
  if (text === null) return { state: "none", path, text: null, signedAt: null };
  const signature = readSignature(dir);
  if (signature === undefined) return { state: "unsigned", path, text, signedAt: null };
  if (signature === null || signature.hash !== hashOf(text))
    return { state: "changed", path, text, signedAt: null };
  return { state: "signed", path, text, signedAt: signature.at };
}

/**
 * The user's signature of the priorities (a user-only decision): with `file`, that file's text is
 * copied into the workspace folder first; the signature names the hash, who signed and when.
 */
export function acceptPriorities(
  userDir: string,
  workspace: string,
  options: { file?: string; by: string },
): (PrioritiesStatus & { state: "signed"; hash: string }) | { refused: string } {
  const dir = prioritiesDir(userDir, workspace);
  const path = join(dir, "priorities.md");
  if (options.file !== undefined) {
    const copied = readText(options.file);
    if (copied === null) return { refused: `${options.file} cannot be read` };
    if (!copied.trim()) return { refused: `${options.file} is empty` };
    mkdirSync(dir, { recursive: true });
    writeFileSync(path, copied);
  }
  const text = readText(path);
  if (text === null || !text.trim())
    return {
      refused: `no priorities to sign: write ${path}, or crew workspace priorities accept --file <path>`,
    };
  const hash = hashOf(text);
  const at = nowIso();
  writeJson(join(dir, "priorities.json"), { hash, by: options.by, at });
  return { state: "signed", path, text, signedAt: at, hash };
}

/** The one line `crew workspace priorities` prints for each state (finding 84). */
export function prioritiesLine(status: PrioritiesStatus): string {
  switch (status.state) {
    case "signed":
      return `priorities: signed (${status.signedAt})`;
    case "changed":
      return "priorities: changed since signing (crew workspace priorities accept)";
    case "unsigned":
      return "priorities: unsigned (crew workspace priorities accept)";
    default:
      return `priorities: none (write ${status.path}, or crew workspace priorities accept --file <path>)`;
  }
}

/**
 * The item's priority with its triage (SP7 §10.2), from the one summary (finding 84): at the start
 * the decision in full; in the status the level alone, unless the proposal is still unconfirmed.
 */
export function triageText(
  work: Pick<WorkItem, "priority" | "triage">,
  where: "start" | "status",
): string {
  const t = work.triage;
  if (!t) return `priority ${work.priority ?? "normal"}`;
  if (t.confirmed === null)
    return `priority ${t.proposed} (proposed, unconfirmed: no signed business priorities)`;
  if (where === "status") return `priority ${work.priority ?? "normal"}`;
  return `priority ${t.confirmed} (${triageSummary(t)})`;
}

const NOT_SIGNED =
  "the business priorities are not signed (crew workspace priorities accept [--file <path>]): the proposal stays unconfirmed";

/**
 * The lead's triage of a source's proposed priority (SP7 §10.2): against the signed priorities the
 * lead confirms (no flag, or the same level) or lowers with a reason, never raises (after the
 * mail's own rule); without the signed file the proposal stays unconfirmed and a flag is refused.
 */
export function triagePriority(
  proposed: MailPriority,
  flag: MailPriority | undefined,
  reason: string | undefined,
  state: PrioritiesState,
  by: string,
): Triage | { refused: string } {
  const cleaned = reason?.trim() ? reason.trim().replace(/\s*\n\s*/g, " ") : null;
  const against = state === "signed" ? "signed" : state === "none" ? "none" : "unsigned";
  if (against !== "signed") {
    if (flag !== undefined) return { refused: NOT_SIGNED };
    return { proposed, confirmed: null, by, reason: cleaned, against, at: nowIso() };
  }
  const confirmed = flag ?? proposed;
  if (priorityRank(confirmed) < priorityRank(proposed))
    return {
      refused: `the source proposed ${proposed}; the lead confirms or lowers, never raises`,
    };
  if (priorityRank(confirmed) > priorityRank(proposed) && !cleaned)
    return { refused: 'a lowering needs --reason "<why>"' };
  return { proposed, confirmed, by, reason: cleaned, against, at: nowIso() };
}

/** `proposed high, confirmed normal against the signed business priorities: <reason>`, as the report says it. */
export function triageSummary(triage: Triage): string {
  if (triage.confirmed === null)
    return `proposed ${triage.proposed}, unconfirmed (no signed business priorities)`;
  const reason = triage.reason ? `: ${triage.reason}` : "";
  return `proposed ${triage.proposed}, confirmed ${triage.confirmed} against the signed business priorities${reason}`;
}
