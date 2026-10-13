import { computeFingerprint, UNAVAILABLE } from "../fingerprint.ts";
import { nowIso } from "../fs.ts";
import { assess } from "../gates.ts";
import { loadState, saveState, sessionState } from "../state.ts";
import { activeWork, saveWork } from "../work.ts";
import type { HookContext, HookResponse } from "./types.ts";

export const MAX_STOP_BLOCKS = 3;

/**
 * The Stop rule (spec, section 12). It compares fingerprints and reads evidence; it never runs gates.
 * 1. nothing changed: allow. 2. changed and proven: allow. 3. changed, unproven, waiting for the user:
 * allow with a notice. 4. changed and unproven: block. 5. after three blocks in a row: allow with a notice.
 * "Waiting for the user" is a permit for one turn to end, and the Stop that lets the turn end spends
 * it. The prompt hook does not: a prompt can be queued while the agent still works, and that prompt
 * must not end a wait the Stop has not honoured yet.
 */
export function onStop(ctx: HookContext): HookResponse {
  const state = loadState(ctx.paths);
  const session = sessionState(state, ctx.sessionId);
  const active = activeWork(ctx.paths);
  const work = active?.work ?? null;
  const current = computeFingerprint(ctx.paths.root, ctx.profile, work);
  const result = work
    ? assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || !!active?.tampered)
    : null;
  const proven = result?.verdict === "proven";
  // Without a usable baseline (the plugin was enabled mid-session, or the folder is too big to
  // fingerprint) only an unproven work item counts as a change.
  const changed =
    session.baseline !== null && current !== UNAVAILABLE
      ? current !== session.baseline
      : work !== null && !proven;
  const done = (response: HookResponse): HookResponse => {
    saveState(ctx.paths, state);
    return response;
  };
  // The turn ends: the wait, if any, is spent, and an unproven pause is kept in the record. A
  // hand-edited item is left as it is, since saving it would record the edit as the engine's own.
  const release = (response: HookResponse, pause?: string): HookResponse => {
    if (work && work.awaiting !== null && !active?.tampered) {
      work.awaiting = null;
      if (pause !== undefined)
        work.pauses = [...(work.pauses ?? []), { at: nowIso(), reason: pause }];
      saveWork(ctx.paths, work);
    }
    return done(response);
  };
  if (!changed || proven) {
    session.stopBlocks = 0;
    return release({});
  }
  const missing = result
    ? result.unproven
    : ['no work item: start one with crew start "<request>"'];
  if (work?.awaiting === "user") {
    session.stopBlocks = 0;
    const reason = missing[0] ?? "not proven";
    return release(
      {
        systemMessage: `Crew: work ${work.id} ends this turn waiting for the user and is not proven (${reason}). The next turn is held to the Stop rule again.`,
      },
      reason,
    );
  }
  if (session.stopBlocks >= MAX_STOP_BLOCKS) {
    return done({
      systemMessage: `Crew: not proven after ${MAX_STOP_BLOCKS} attempts. ${missing.join("; ")}.`,
    });
  }
  session.stopBlocks += 1;
  const gate = work ? `crew gate run ${work.id}` : 'crew start "<request>"';
  // The way out that costs no gate run is named here, where the agent reads when blocked
  // (finding 11 of the real-use phase: a third of the blocks were turns ending to ask or report).
  const wait = work
    ? ` To end the turn with a question for the user, run crew await ${work.id} user first.`
    : "";
  return done({
    decision: "block",
    reason: `Crew: watched source files changed and the work is not proven. Missing: ${missing.join("; ")}. Run ${gate}, fix what fails, or ask the user to skip a step with crew skip.${wait}`,
  });
}
