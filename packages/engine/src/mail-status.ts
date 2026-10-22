import {
  CONTRACT_KINDS,
  type Contract,
  type ContractKind,
  GATE_NAMES,
  type GateName,
  isMailPriority,
  MAIL_PRIORITIES,
  type MailPriority,
  type Message,
  type ReplyEvidence,
} from "./types.ts";

/** The eight statuses a record holds since 0.7.0, each with the ones it may move to (SP7 §9). */
export type MappedStatus =
  | "sent"
  | "read"
  | "accepted"
  | "in-progress"
  | "blocked"
  | "done"
  | "refused"
  | "expired";

export const MAIL_TRANSITIONS: Record<MappedStatus, readonly MappedStatus[]> = {
  // A receiver may answer without reading the message as a step of its own: from sent, every
  // status a reply or the sweep gives is reachable; only accepted waits for a read.
  sent: ["read", "done", "refused", "expired", "in-progress", "blocked"],
  read: ["accepted", "refused", "in-progress", "done", "blocked", "expired"],
  accepted: ["in-progress", "blocked", "done", "refused"],
  "in-progress": ["blocked", "done"],
  blocked: ["in-progress", "done", "refused", "expired"],
  done: [],
  refused: [],
  expired: [],
};

/** The spellings records before 0.7.0 hold, read as the status they stand for; never written back. */
const BEFORE_0_7: Record<string, MappedStatus> = {
  answered: "done",
  "waiting-for-person": "blocked",
  stopped: "refused",
};

/**
 * A record's status as the engine reads it: one of the eight as it is, the three spellings of
 * records before 0.7.0 mapped, and a value no engine wrote read as `sent`, so the message is
 * listed and never hidden.
 */
export function mailStatus(m: Pick<Message, "status">): MappedStatus {
  const raw = m.status as string;
  if (Object.hasOwn(MAIL_TRANSITIONS, raw)) return raw as MappedStatus;
  return BEFORE_0_7[raw] ?? "sent";
}

/** The sender's proposal as recorded, validated: a value this engine does not know falls back to the type's default. */
export function priorityOf(m: Pick<Message, "type" | "priority">): MailPriority {
  if (isMailPriority(m.priority)) return m.priority;
  return m.type === "blocker" ? "blocker" : "normal";
}

/** The level the receiver confirmed, validated; the proposal when no valid decision stands. */
export function decidedPriority(
  m: Pick<Message, "type" | "priority" | "priorityDecision">,
): MailPriority {
  const confirmed = m.priorityDecision?.confirmed;
  return isMailPriority(confirmed) ? confirmed : priorityOf(m);
}

/** The inbox's order: 0 for a blocker, 3 for low. */
export function priorityRank(priority: MailPriority): number {
  return MAIL_PRIORITIES.indexOf(priority);
}

/**
 * The message moved to `to` with `extra` merged, when the table allows it from the message's
 * mapped status; the refusal otherwise. `sent` → `done` is a notice read: a request is never
 * done without being read, so the writers read it first.
 */
export function transition(
  m: Message,
  to: MappedStatus,
  extra: Partial<Message> = {},
): Message | { refused: string } {
  const from = mailStatus(m);
  const allowed =
    MAIL_TRANSITIONS[from].includes(to) &&
    !(from === "sent" && to === "done" && m.type !== "notice");
  if (!allowed) return { refused: `${m.id} is ${from}; it cannot become ${to}` };
  return { ...m, ...extra, status: to };
}

// ---------------------------------------------------------------------------------------------
// Readers of what another party wrote (SP7 §9): a thread, the contracts and the evidence of a
// record come from another project's engine or from a hand, so each is validated on read.

/** The shape of a message id (`newMessageId`): a day, a sequence and the sender's name. */
export const MESSAGE_ID = /^M-\d{4}-\d{2}-\d{2}-\d{3}-[A-Za-z0-9._-]+$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** The thread a message belongs to: its `thread` when it has a message id's shape, else the message itself (a root). */
export function threadOf(m: Pick<Message, "id" | "thread">): string {
  return typeof m.thread === "string" && MESSAGE_ID.test(m.thread) ? m.thread : m.id;
}

/** A path inside the project as written: relative, no `..` segment, no backslash, not empty. */
export function insidePath(path: unknown): path is string {
  return (
    typeof path === "string" &&
    path.length > 0 &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !path.split("/").includes("..")
  );
}

/** The well-formed contracts of a record; anything else is dropped, never printed. */
export function readContracts(m: Pick<Message, "contracts">): Contract[] {
  if (!Array.isArray(m.contracts)) return [];
  const kept: Contract[] = [];
  for (const raw of m.contracts) {
    if (!raw || typeof raw !== "object") continue;
    const { kind, path, hash, summary } = raw as unknown as Record<string, unknown>;
    if (!CONTRACT_KINDS.includes(kind as ContractKind) || typeof summary !== "string") continue;
    if (hash !== null && (typeof hash !== "string" || !SHA256.test(hash))) continue;
    if (kind === "clause" ? path !== null : !insidePath(path)) continue;
    kept.push({ kind: kind as ContractKind, path: path as string | null, hash, summary });
  }
  return kept;
}

/** The evidence a reply carried, each field validated; null when the record carries none. */
export function readEvidence(m: Pick<Message, "evidence">): ReplyEvidence | null {
  const raw = m.evidence;
  if (!raw || typeof raw !== "object") return null;
  const { report, fingerprint, gatesPassed } = raw as unknown as Record<string, unknown>;
  const reportInside =
    typeof report === "string" && report.startsWith(".crew/work/") && insidePath(report);
  return {
    report: reportInside ? report : null,
    fingerprint: typeof fingerprint === "string" ? fingerprint : null,
    gatesPassed: Array.isArray(gatesPassed)
      ? gatesPassed.filter((g): g is GateName => GATE_NAMES.includes(g as GateName))
      : [],
  };
}
