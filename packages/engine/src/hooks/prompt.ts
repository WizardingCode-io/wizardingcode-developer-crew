import { assess } from "../gates.ts";
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

export function onPrompt(ctx: HookContext): HookResponse {
  const active = activeWork(ctx.paths);
  if (!active?.work) return {};
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: statusLine(ctx, active.work, active.tampered),
    },
  };
}
