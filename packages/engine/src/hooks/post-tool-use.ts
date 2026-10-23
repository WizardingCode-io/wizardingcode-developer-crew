import { liveSessions, loadState, sessionState, updateSession } from "../state.ts";
import { activeWork } from "../work.ts";
import { takeNotices } from "./notices.ts";
import { startsItem } from "./pre-tool-use.ts";
import type { HookContext, HookPayload, HookResponse } from "./types.ts";

/**
 * The item a crew start made becomes the session's own (session lanes, AC-2, the security lead's
 * R-1), read from the engine's state, never from the command's output: the checkout's active item
 * when it is not the one the start's PreToolUse saw, was created at or after it, and no other live
 * session holds it.
 */
function claimStarted(ctx: HookContext): void {
  const start = loadState(ctx.paths).sessions[ctx.sessionId];
  const since = start?.startAt;
  if (!since) return;
  const work = activeWork(ctx.paths)?.work;
  const held =
    !!work &&
    Object.entries(liveSessions(ctx.paths)).some(
      ([id, s]) => id !== ctx.sessionId && s.item === work.id,
    );
  updateSession(ctx.paths, ctx.sessionId, (session) => {
    if (work && work.id !== start.startActive && work.createdAt >= since && !held)
      session.item = work.id;
    delete session.startAt;
    delete session.startActive;
  });
}

/**
 * After a tool call: the notices the roles' stops left for this session, printed once as context
 * the model reads, and nothing else. The plugin runs it after Agent, Bash, Write and Edit, the
 * tools a lead uses between launching the roles and recording their answers.
 */
export function onPostToolUse(ctx: HookContext, payload: HookPayload = {}): HookResponse {
  // A subagent's own tool calls run this hook too, under the parent's session id with the agent's
  // id beside it: the notices are the lead's, and a sibling role still running must not take them
  // (risk review, round 12).
  if (payload.agent_id) return {};
  const command = payload.tool_input?.command;
  if (payload.tool_name === "Bash" && typeof command === "string" && startsItem(command)) {
    try {
      claimStarted(ctx);
    } catch {
      // no claim: the session holds no item
    }
  }
  // The hook runs after most tool calls: with nothing pending, nothing is written and no lock taken.
  if (!sessionState(loadState(ctx.paths), ctx.sessionId).notices?.length) return {};
  const notices = updateSession(ctx.paths, ctx.sessionId, takeNotices);
  if (!notices.length) return {};
  return {
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: notices.join(" ") },
  };
}
