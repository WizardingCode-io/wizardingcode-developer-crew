import { loadState, sessionState, updateSession } from "../state.ts";
import { takeNotices } from "./notices.ts";
import type { HookContext, HookPayload, HookResponse } from "./types.ts";

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
  // The hook runs after most tool calls: with nothing pending, nothing is written and no lock taken.
  if (!sessionState(loadState(ctx.paths), ctx.sessionId).notices?.length) return {};
  const notices = updateSession(ctx.paths, ctx.sessionId, takeNotices);
  if (!notices.length) return {};
  return {
    hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: notices.join(" ") },
  };
}
