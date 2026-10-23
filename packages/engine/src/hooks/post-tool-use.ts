import { liveSessions, loadState, sessionState, updateSession } from "../state.ts";
import { openItems } from "../work.ts";
import { takeNotices } from "./notices.ts";
import { startsItem, startsItemAlone } from "./pre-tool-use.ts";
import type { HookContext, HookPayload, HookResponse } from "./types.ts";

/**
 * The item a crew start made becomes the session's own (session lanes, AC-2, the security lead's
 * R-1; triage L2): the id the command printed (`started <id>`), taken only when the command is one
 * crew start and nothing else (`startsItemAlone`) and its output holds exactly one started line,
 * and only when the engine's state says that id is an open item of this checkout, created at or
 * after the start's PreToolUse and held by no other live session.
 */
function claimStarted(ctx: HookContext, command: string, output: string): void {
  const start = loadState(ctx.paths).sessions[ctx.sessionId];
  const since = start?.startAt;
  if (!since) return;
  const printed = [...output.matchAll(/^started (\S+)/gm)].map((m) => m[1]);
  const id = startsItemAlone(command) && printed.length === 1 ? printed[0] : undefined;
  const work = id ? openItems(ctx.paths).find((w) => w.id === id) : undefined;
  const held =
    !!work &&
    Object.entries(liveSessions(ctx.paths)).some(
      ([sid, s]) => sid !== ctx.sessionId && s.item === work.id,
    );
  updateSession(ctx.paths, ctx.sessionId, (session) => {
    if (work && work.id !== start.startActive && work.createdAt >= since && !held)
      session.item = work.id;
    delete session.startAt;
    delete session.startActive;
  });
}

/** What a tool's answer printed: Claude Code's Bash `stdout`, an adapter's `output`, or the answer itself when it is text. */
function printedBy(response: unknown): string {
  if (typeof response === "string") return response;
  const { stdout, output } = (response ?? {}) as { stdout?: unknown; output?: unknown };
  return typeof stdout === "string" ? stdout : typeof output === "string" ? output : "";
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
      claimStarted(ctx, command, printedBy(payload.tool_response));
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
