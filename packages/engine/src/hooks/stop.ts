import { computeFingerprint, UNAVAILABLE } from "../fingerprint.ts";
import { nowIso } from "../fs.ts";
import { assess } from "../gates.ts";
import { loadState, saveState, sessionState } from "../state.ts";
import { activeWork, saveWork } from "../work.ts";
import type { HookContext, HookPayload, HookResponse } from "./types.ts";

export const MAX_STOP_BLOCKS = 3;

// A `!` that would make a crew line run in the user's terminal: at a line start or inline (in
// backticks, after a quote or a bracket), with or without a space, with or without a runner. Not a
// `!` that ends a sentence before the word crew, since the character before it must not be a word.
const TYPED_CREW = /(?:^|[^\w!])!\s?(?:(?:node|bun)\s+)?(?:\S*\/)?crew(?:\.mjs)?\s+[a-z]/m;

/** Whether the agent's last message tells the user to type a crew command (finding 22 of the real-use phase). */
export function asksUserToTypeCrew(message: string | undefined): boolean {
  return message !== undefined && TYPED_CREW.test(message);
}

/**
 * The Stop rule (spec, section 12). It compares fingerprints and reads evidence; it never runs gates.
 * 1. nothing changed: allow. 2. changed and proven: allow. 3. changed, unproven, waiting for the user:
 * allow with a notice. 4. changed and unproven: block. 5. after three blocks in a row: allow with a notice.
 * "Waiting for the user" is a permit for one turn to end, and the Stop that lets the turn end spends
 * it. The prompt hook does not: a prompt can be queued while the agent still works, and that prompt
 * must not end a wait the Stop has not honoured yet.
 */
export function onStop(ctx: HookContext, payload: HookPayload = {}): HookResponse {
  const state = loadState(ctx.paths);
  const session = sessionState(state, ctx.sessionId);
  // A message that tells the user to type a crew command is a turn that must not end: the user
  // never runs crew, the agent does, and the permission prompt is the signature (finding 22: a
  // stale memory beat rule 4 of the skill). It shares the cap, so a repeated ask cannot loop the
  // session, and it spends no wait, since the user was asked for the wrong thing.
  if (asksUserToTypeCrew(payload.last_assistant_message) && session.stopBlocks < MAX_STOP_BLOCKS) {
    session.stopBlocks += 1;
    saveState(ctx.paths, state);
    return {
      decision: "block",
      reason:
        "Crew: the last message tells the user to type a crew command. The user never types one: you run every crew command, and the permission prompt is the user's signature, in auto mode too (a note saying otherwise predates 0.1.6). Run the command now, without --mode, and tell the user what it recorded.",
    };
  }
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
  // A judgement reason is not cleared by another gate run, and a judgement gate is not skipped by
  // default: the way out is the roles and the record (review of SP2b, finding 2).
  const judgement =
    work && missing.some((m) => m.startsWith("judgement gate"))
      ? ` A judgement gate is cleared by its roles, not by the gate run: run the planned reviewers and the judge, then crew judgement ${work.id} record --ruling .crew/work/${work.id}/review/ruling.json.`
      : "";
  return done({
    decision: "block",
    reason: `Crew: watched source files changed and the work is not proven. Missing: ${missing.join("; ")}. Run ${gate}, fix what fails, or ask the user to skip a step with crew skip.${judgement}${wait}`,
  });
}
