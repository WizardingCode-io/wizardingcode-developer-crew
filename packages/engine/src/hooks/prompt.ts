import { assess } from "../gates.ts";
import { loadState, saveState, sessionState } from "../state.ts";
import type { WorkItem } from "../types.ts";
import { activeWork } from "../work.ts";
import type { HookContext, HookResponse } from "./types.ts";

/** One line, written as a fact: the state of the active work item. */
export function statusLine(ctx: HookContext, work: WorkItem, tampered = false): string {
  const result = assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || tampered);
  const state =
    result.verdict === "proven"
      ? "proven"
      : `not proven (${result.unproven[0] ?? "gates have not run"})`;
  const waiting = work.awaiting === "user" ? ", waiting for the user" : "";
  return `Crew: work ${work.id} "${work.title}", phase ${work.phase}, route ${work.route}, ${state}${waiting}.`;
}

/**
 * The user has spoken: the Stop rule starts counting blocks afresh. The wait for the user is not
 * ended here. A prompt can be queued while the agent still works, and Claude Code runs this hook as
 * soon as it is typed, so only the Stop that lets the turn end spends the wait.
 */
export function onPrompt(ctx: HookContext): HookResponse {
  const state = loadState(ctx.paths);
  sessionState(state, ctx.sessionId).stopBlocks = 0;
  saveState(ctx.paths, state);
  const active = activeWork(ctx.paths);
  if (!active?.work) return {};
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: statusLine(ctx, active.work, active.tampered),
    },
  };
}
