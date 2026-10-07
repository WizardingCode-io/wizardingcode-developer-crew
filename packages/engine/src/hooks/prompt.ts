import { assess } from "../gates.ts";
import { loadState, saveState, sessionState } from "../state.ts";
import type { WorkItem } from "../types.ts";
import { activeWork, saveWork } from "../work.ts";
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
 * The user has answered: the wait is over and the Stop rule starts counting blocks afresh.
 * A tampered item is left as it is, since saving it would record the change as the engine's own.
 */
export function onPrompt(ctx: HookContext): HookResponse {
  const state = loadState(ctx.paths);
  sessionState(state, ctx.sessionId).stopBlocks = 0;
  saveState(ctx.paths, state);
  const active = activeWork(ctx.paths);
  if (!active?.work) return {};
  if (active.work.awaiting !== null && !active.tampered) {
    active.work.awaiting = null;
    saveWork(ctx.paths, active.work);
  }
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: statusLine(ctx, active.work, active.tampered),
    },
  };
}
