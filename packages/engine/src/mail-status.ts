import { isMailPriority, MAIL_PRIORITIES, type MailPriority, type Message } from "./types.ts";

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
