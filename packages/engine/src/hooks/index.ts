import { buildContext } from "./context.ts";
import { onPreToolUse } from "./pre-tool-use.ts";
import { onPrompt } from "./prompt.ts";
import { onSessionStart } from "./session-start.ts";
import { onStop } from "./stop.ts";
import type { HookPayload, HookResponse } from "./types.ts";

/** A hook that cannot decide answers {} so a bug in the engine never blocks the user's session. */
export function handleHook(
  event: string,
  payload: HookPayload,
  env: NodeJS.ProcessEnv = process.env,
): HookResponse {
  try {
    const ctx = buildContext(payload, env);
    switch (event) {
      case "session-start":
        return onSessionStart(ctx);
      case "prompt":
        return onPrompt(ctx);
      case "pre-tool-use":
        return onPreToolUse(ctx, payload);
      case "stop":
        return onStop(ctx);
      default:
        return {};
    }
  } catch {
    return {};
  }
}
