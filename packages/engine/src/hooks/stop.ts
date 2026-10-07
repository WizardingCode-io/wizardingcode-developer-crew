import { computeFingerprint } from "../fingerprint.ts";
import { assess } from "../gates.ts";
import { loadState, saveState, sessionState } from "../state.ts";
import { activeWork } from "../work.ts";
import type { HookContext, HookResponse } from "./types.ts";

export const MAX_STOP_BLOCKS = 3;

/**
 * The Stop rule (spec, section 12). It compares fingerprints and reads evidence; it never runs gates.
 * 1. nothing changed: allow. 2. changed and proven: allow. 3. changed, unproven, waiting for the user:
 * allow with a notice. 4. changed and unproven: block. 5. after three blocks in a row: allow with a notice.
 */
export function onStop(ctx: HookContext): HookResponse {
  const state = loadState(ctx.paths);
  const session = sessionState(state, ctx.sessionId);
  const current = computeFingerprint(ctx.paths.root, ctx.profile);
  const active = activeWork(ctx.paths);
  const work = active?.work ?? null;
  const result = work
    ? assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || !!active?.tampered)
    : null;
  const proven = result?.verdict === "proven";
  // Without a baseline (the plugin was enabled mid-session) only an unproven work item counts as a change.
  const changed =
    session.baseline !== null ? current !== session.baseline : work !== null && !proven;
  const done = (response: HookResponse): HookResponse => {
    saveState(ctx.paths, state);
    return response;
  };
  if (!changed || proven) {
    session.stopBlocks = 0;
    return done({});
  }
  const missing = result
    ? result.unproven
    : ['no work item: start one with crew start "<request>"'];
  if (work?.awaiting === "user") {
    session.stopBlocks = 0;
    return done({
      systemMessage: `Crew: work ${work.id} is waiting for the user and is not proven (${missing[0]}).`,
    });
  }
  if (session.stopBlocks >= MAX_STOP_BLOCKS) {
    return done({
      systemMessage: `Crew: not proven after ${MAX_STOP_BLOCKS} attempts. ${missing.join("; ")}.`,
    });
  }
  session.stopBlocks += 1;
  const gate = work ? `crew gate run ${work.id}` : 'crew start "<request>"';
  return done({
    decision: "block",
    reason: `Crew: watched source files changed and the work is not proven. Missing: ${missing.join("; ")}. Run ${gate}, fix what fails, or ask the user to skip a step with crew skip.`,
  });
}
