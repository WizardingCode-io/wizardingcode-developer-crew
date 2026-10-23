import { assess } from "../gates.ts";
import { subjectQuoted } from "../mail.ts";
import { listPacks } from "../packs.ts";
import { updateSession } from "../state.ts";
import { takeReplies } from "../tasks.ts";
import type { WorkItem } from "../types.ts";
import { activeWork, waitingText } from "../work.ts";
import { mailQuietly, neighbourLine, refreshMail } from "./context.ts";
import { takeNotices } from "./notices.ts";
import type { HookContext, HookResponse } from "./types.ts";

/** One line, written as a fact: the state of the active work item. */
export function statusLine(ctx: HookContext, work: WorkItem, tampered = false): string {
  const result = assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || tampered);
  const state =
    result.verdict === "proven"
      ? "proven"
      : `not proven (${result.unproven[0] ?? "gates have not run"})`;
  // What the base listed, on the line every session reads (SP4 Task 3).
  const knowledge = work.knowledge
    ? `, knowledge: ${work.knowledge.listed.length ? `${work.knowledge.listed.length} listed` : "none"}`
    : "";
  return `Crew: work ${work.id} "${work.title}", phase ${work.phase}, route ${work.route}, ${state}${knowledge}${packsPart(ctx)}${waitingText(work)}.`;
}

/** The registered packs, counted (SP6 Task 2 AC-6): `{ registered, missing }`, missing counting the unreadable too. */
export function packCounts(ctx: HookContext): { registered: number; missing: number } {
  // The quick listing (the root and the manifest alone): a hook never hashes every pack's files,
  // and a listing that cannot be made costs the session nothing (the risk gate's finding).
  try {
    const listed = listPacks(ctx.paths.userDir, { quick: true });
    return {
      registered: listed.length,
      missing: listed.filter((p) => p.state.kind === "missing" || p.state.kind === "unreadable")
        .length,
    };
  } catch {
    return { registered: 0, missing: 0 };
  }
}

/** `, packs: 2 (1 missing)` on the status line when a pack is registered; nothing otherwise. */
function packsPart(ctx: HookContext): string {
  const { registered, missing } = packCounts(ctx);
  if (!registered) return "";
  return `, packs: ${registered}${missing ? ` (${missing} missing)` : ""}`;
}

/**
 * The user has spoken. Neither the Stop rule's count of blocks nor the wait for the user is reset
 * here: a prompt can be queued while the agent still works, and Claude Code runs this hook as soon
 * as it is typed, so only a Stop starts the count afresh (finding 114) and spends the wait.
 */
export function onPrompt(ctx: HookContext): HookResponse {
  // What a role's stop could not save is taken, if no tool call printed it yet; under the lock
  // every writer of the state takes.
  const notices = updateSession(ctx.paths, ctx.sessionId, (session) => takeNotices(session));
  // The project's registry entry is refreshed, and what arrived since the last prompt is named once.
  const mail = refreshMail(ctx);
  const active = activeWork(ctx.paths);
  // A task's reply that landed fills the lead's record (SP2c §7).
  if (active?.work && !mail.failed)
    mailQuietly(() => takeReplies(ctx.mail, ctx.paths, active), undefined);
  const lines: string[] = [];
  if (active?.work) lines.push(statusLine(ctx, active.work, active.tampered));
  const lane = neighbourLine(ctx);
  if (lane) lines.push(lane);
  lines.push(...notices);
  if (mail.failed) lines.push(`Mail is off for this prompt: ${mail.failed}.`);
  else if (mail.newMail.length)
    lines.push(
      `Mail: ${mail.newMail.length} new: ${mail.newMail.map((m) => `${m.id} ${m.type} from ${m.from.project} ${subjectQuoted(m.subject)}`).join("; ")} (crew mail inbox).`,
    );
  if (!lines.length) return {};
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: lines.join(" "),
    },
  };
}
