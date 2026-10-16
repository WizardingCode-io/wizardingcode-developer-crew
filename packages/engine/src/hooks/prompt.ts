import { assess } from "../gates.ts";
import { subjectQuoted } from "../mail.ts";
import { updateSession } from "../state.ts";
import type { WorkItem } from "../types.ts";
import { activeWork, waitingText } from "../work.ts";
import { refreshMail } from "./context.ts";
import { takeNotices } from "./notices.ts";
import type { HookContext, HookResponse } from "./types.ts";

/** One line, written as a fact: the state of the active work item. */
export function statusLine(ctx: HookContext, work: WorkItem, tampered = false): string {
  const result = assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || tampered);
  const state =
    result.verdict === "proven"
      ? "proven"
      : `not proven (${result.unproven[0] ?? "gates have not run"})`;
  return `Crew: work ${work.id} "${work.title}", phase ${work.phase}, route ${work.route}, ${state}${waitingText(work)}.`;
}

/**
 * The user has spoken: the Stop rule starts counting blocks afresh. The wait for the user is not
 * ended here. A prompt can be queued while the agent still works, and Claude Code runs this hook as
 * soon as it is typed, so only the Stop that lets the turn end spends the wait.
 */
export function onPrompt(ctx: HookContext): HookResponse {
  // The count starts afresh, and what a role's stop could not save is taken, if no tool call
  // printed it yet; under the lock every writer of the state takes.
  const notices = updateSession(ctx.paths, ctx.sessionId, (session) => {
    session.stopBlocks = 0;
    return takeNotices(session);
  });
  // The project's registry entry is refreshed, and what arrived since the last prompt is named once.
  const mail = refreshMail(ctx);
  const active = activeWork(ctx.paths);
  const lines: string[] = [];
  if (active?.work) lines.push(statusLine(ctx, active.work, active.tampered));
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
