import { type SessionState, updateSession } from "../state.ts";
import type { HookContext } from "./types.ts";

/**
 * What a hook could not say to the session's model in its own response is kept in the session's
 * state and printed where the model reads: the next PostToolUse, the next prompt, or the next
 * blocked turn end. A SubagentStop hook's output reaches the person (`systemMessage`) and the
 * subagent (`reason`, `additionalContext`), never the parent session, and Claude Code names a
 * PostToolUse hook as the way back in (risk review of SP2c task 3, round 11). The write takes the
 * lock every writer of the state takes (`updateSession`), so no hook writes the notice away.
 */
export function leaveNotice(ctx: HookContext, text: string): void {
  try {
    updateSession(ctx.paths, ctx.sessionId, (session) => {
      session.notices = [...(session.notices ?? []), text];
    });
  } catch {
    // The state could not be written: the person still has the systemMessage.
  }
}

/** The notices left for this session, cleared from the state the caller saves. */
export function takeNotices(session: SessionState): string[] {
  const notices = session.notices ?? [];
  session.notices = [];
  return notices;
}
