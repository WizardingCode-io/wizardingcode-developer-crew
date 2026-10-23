import { nowIso } from "../fs.ts";
import { updateSession } from "../state.ts";
import { buildContext } from "./context.ts";
import { onPostToolUse } from "./post-tool-use.ts";
import { onPreToolUse } from "./pre-tool-use.ts";
import { onPrompt } from "./prompt.ts";
import { onSessionStart } from "./session-start.ts";
import { onStop } from "./stop.ts";
import { onSubagentStop } from "./subagent-stop.ts";
import type { HookPayload, HookResponse } from "./types.ts";

const EVENTS = new Set([
  "session-start",
  "prompt",
  "pre-tool-use",
  "post-tool-use",
  "stop",
  "subagent-stop",
  "session-end",
]);

export const INACTIVE_CONTEXT =
  "Crew is inactive here: not a git repository and no .crew/ folder. Run crew detect in a project root to activate it.";

/** A hook that cannot decide answers {} so a bug in the engine never blocks the user's session. */
export function handleHook(
  event: string,
  payload: HookPayload,
  env: NodeJS.ProcessEnv = process.env,
): HookResponse {
  if (!EVENTS.has(event)) return {};
  try {
    const ctx = buildContext(payload, env);
    if (!ctx) {
      return event === "session-start"
        ? {
            hookSpecificOutput: {
              hookEventName: "SessionStart",
              additionalContext: INACTIVE_CONTEXT,
            },
          }
        : {};
    }
    switch (event) {
      case "session-start":
        return onSessionStart(ctx, payload);
      case "prompt":
        return onPrompt(ctx);
      case "pre-tool-use":
        return onPreToolUse(ctx, payload);
      case "post-tool-use":
        return onPostToolUse(ctx, payload);
      case "subagent-stop":
        return onSubagentStop(ctx, payload);
      case "session-end":
        // Whatever the reason (`/clear` and logout among them), the session is no neighbour now.
        updateSession(ctx.paths, ctx.sessionId, (session) => {
          session.endedAt = nowIso();
        });
        return {};
      default:
        return onStop(ctx, payload);
    }
  } catch {
    return {};
  }
}
