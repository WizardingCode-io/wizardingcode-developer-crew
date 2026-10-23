import {
  computeFingerprint,
  fingerprintMethod,
  MAX_WATCHED_FILES,
  UNAVAILABLE,
} from "../fingerprint.ts";
import { nowIso } from "../fs.ts";
import { assess } from "../gates.ts";
import { emptyInboxSummary, inboxSummary, markNoticed, subjectQuoted } from "../mail.ts";
import { loadState, sessionState, updateSession } from "../state.ts";
import { takeReplies } from "../tasks.ts";
import { activeWork, lastLearned, saveWork, waitingPhrase } from "../work.ts";
import { mailQuietly, refreshMail, sweepLines } from "./context.ts";
import { takeNotices } from "./notices.ts";
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
 * With no active item, whether the checkout's last learned item still vouches for the tree: its
 * last gate run proved, untampered, the code as it is now (finding 141: `crew learn` frees the slot).
 */
function learnedHolds(ctx: HookContext): boolean {
  const learned = lastLearned(ctx.paths);
  if (!learned?.fingerprint) return false;
  const now = computeFingerprint(
    ctx.paths.root,
    ctx.profile,
    learned.work,
    MAX_WATCHED_FILES,
    fingerprintMethod(learned.fingerprint),
  );
  return now !== UNAVAILABLE && now === learned.fingerprint;
}

/**
 * The Stop rule (spec, section 12). It compares fingerprints and reads evidence; it never runs gates.
 * 1. nothing changed: allow. 2. changed and proven: allow. 3. changed, unproven, waiting (for the
 * user, for the roles, or for a reply by mail; SP2c §9): allow with the wait's notice. 4. changed and
 * unproven: block. 5. after three blocks in a row: allow with a notice. A wait is a permit for one
 * turn to end, and the Stop that lets the turn end spends it. The prompt hook does not: a prompt can
 * be queued while the agent still works, and that prompt must not end a wait the Stop has not
 * honoured yet. Before the rule, the mail: a landed reply or an unread blocker holds the turn once.
 */
export function onStop(ctx: HookContext, payload: HookPayload = {}): HookResponse {
  // Read for the rule's decisions; written once, at the end, by `done`.
  const session = sessionState(loadState(ctx.paths), ctx.sessionId);
  // A Stop that does not continue a block starts a new count (finding 114); an absent field, on a
  // runtime that sends none, leaves the count alone, so the cap still releases a loop there.
  if (payload.stop_hook_active === false) session.stopBlocks = 0;
  // The session's state is written under the lock every writer takes, with what this run decided
  // (its count of blocks) and, for a blocked turn end, the notices the roles' stops left, taken as
  // they stand then rather than as they were read above, so one left meanwhile is not written away.
  const done = (response: HookResponse, withNotices = false): HookResponse =>
    updateSession(ctx.paths, ctx.sessionId, (fresh) => {
      fresh.stopBlocks = session.stopBlocks;
      if (!withNotices) return response;
      const notices = takeNotices(fresh)
        .map((n) => ` ${n}`)
        .join("");
      return { ...response, reason: `${response.reason}${notices}` };
    });
  // A message that tells the user to type a crew command is a turn that must not end: the user
  // never runs crew, the agent does, and the permission prompt is the signature (finding 22: a
  // stale memory beat rule 4 of the skill). It shares the cap, so a repeated ask cannot loop the
  // session, and it spends no wait, since the user was asked for the wrong thing.
  if (asksUserToTypeCrew(payload.last_assistant_message) && session.stopBlocks < MAX_STOP_BLOCKS) {
    session.stopBlocks += 1;
    return done({
      decision: "block",
      reason:
        "Crew: the last message tells the user to type a crew command. The user never types one: you run every crew command, and the permission prompt is the user's signature, in auto mode too (a note saying otherwise predates 0.1.6). Run the command now, without --mode, and tell the user what it recorded.",
    });
  }
  // The mail is read before the rule and never in its way: a mailbox this run cannot use is
  // named in the response, and the Stop rule below runs as if there were no mail.
  const mail = refreshMail(ctx);
  // What the turn end has to say about the mail: the mailbox off, or what the sweep of the sessions
  // this project opened settled (SP2c §10).
  const notes = mail.failed ? [`mail is off for this turn: ${mail.failed}`] : sweepLines(ctx);
  // Read when a line is built: the noticed pass below adds to the notes (round 19 ruling).
  const mailNote = () => (notes.length ? ` (${notes.join("; ")})` : "");
  const active = activeWork(ctx.paths);
  const work = active?.work ?? null;
  // A task's reply that landed fills the lead's record (SP2c §7).
  if (active?.work && !mail.failed)
    mailQuietly(() => takeReplies(ctx.mail, ctx.paths, active), undefined);
  // The wait, if any, is spent, and an unproven pause is kept in the record. A hand-edited item is
  // left as it is, since saving it would record the edit as the engine's own.
  const clearWait = (pause?: string): void => {
    if (!work || work.awaiting === null || active?.tampered) return;
    const kind = work.awaiting;
    work.awaiting = null;
    delete work.awaitingMessage;
    if (pause !== undefined)
      work.pauses = [...(work.pauses ?? []), { at: nowIso(), reason: pause, kind }];
    saveWork(ctx.paths, work);
  };
  // The turn ends.
  const release = (response: HookResponse, pause?: string): HookResponse => {
    clearWait(pause);
    return done(response);
  };
  // A turn held for the mail: a landed reply or an unread blocker, under the same cap as the rule's blocks.
  // A blocked turn end like the rule's, so the notices go with it (`done`).
  const hold = (reason: string): HookResponse => {
    session.stopBlocks += 1;
    return done({ decision: "block", reason: `${reason}${mailNote()}` }, true);
  };
  if (!mail.failed && session.stopBlocks < MAX_STOP_BLOCKS) {
    // One read of the inbox serves the landed reply and the blockers.
    const inbox = mailQuietly(() => inboxSummary(ctx.mail), emptyInboxSummary());
    // A reply the item waited for has landed: the wait is over, and the turn is held so the reply
    // is read now, not after a turn that ends for nothing (SP2c §9).
    if (work && work.awaiting === "mail" && work.awaitingMessage && !active?.tampered) {
      const landed = inbox.messages.find((m) => m.replyTo === work.awaitingMessage);
      if (landed) {
        clearWait();
        return hold(
          `Crew: the reply to ${landed.replyTo} has landed (${landed.id} from ${landed.from.project}): read it with crew mail read ${landed.id} and go on; the wait is over.`,
        );
      }
    }
    // A blocker interrupts the end of the turn, once (SP2c §6: the doorbell, then the Stop hook names it).
    const blocker = inbox.blockers.find((b) => !b.noticedAt);
    if (blocker) {
      mailQuietly(() => markNoticed(ctx.mail, blocker.id, notes), undefined, notes);
      return hold(
        `Crew: blocker ${blocker.id} from ${blocker.from.project}: ${subjectQuoted(blocker.subject)}. Read it (crew mail read ${blocker.id}) and say it to the user before anything else.`,
      );
    }
  }
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
  if (!changed || proven || (!work && learnedHolds(ctx))) {
    session.stopBlocks = 0;
    return release(notes.length ? { systemMessage: `Crew: ${notes.join("; ")}.` } : {});
  }
  const missing = result
    ? result.unproven
    : ['no work item: start one with crew start "<request>"'];
  // The three waits (SP2c §9): the user, the roles, a reply. Each lets one turn end, with its notice.
  const what = work ? waitingPhrase(work) : null;
  if (work && what) {
    session.stopBlocks = 0;
    const reason = missing[0] ?? "not proven";
    return release(
      {
        systemMessage: `Crew: work ${work.id} ends this turn ${what} and is not proven (${reason}). The next turn is held to the Stop rule again.${mailNote()}`,
      },
      reason,
    );
  }
  if (session.stopBlocks >= MAX_STOP_BLOCKS) {
    return done({
      systemMessage: `Crew: not proven after ${MAX_STOP_BLOCKS} attempts. ${missing.join("; ")}.${mailNote()}`,
    });
  }
  session.stopBlocks += 1;
  const gate = work ? `crew gate run ${work.id}` : 'crew start "<request>"';
  // The way out that costs no gate run is named here, where the agent reads when blocked
  // (finding 11 of the real-use phase: a third of the blocks were turns ending to ask or report).
  const wait = work
    ? ` To end the turn with a question for the user, run crew await ${work.id} user first; while the roles answer, crew await ${work.id} role; while a reply is due, crew await ${work.id} mail <message id>.`
    : "";
  // A judgement reason is not cleared by another gate run, and a judgement gate is not skipped by
  // default: the way out is the roles and the record (review of SP2b, finding 2).
  const judgement =
    work && missing.some((m) => m.startsWith("judgement gate"))
      ? ` A judgement gate is cleared by its roles, not by the gate run: run the planned reviewers and the judge, then crew judgement ${work.id} record --ruling .crew/work/${work.id}/review/ruling.json.`
      : "";
  // A blocked turn end is read by the model: what a role's stop could not save goes with it (`done`).
  return done(
    {
      decision: "block",
      reason: `Crew: watched source files changed and the work is not proven. Missing: ${missing.join("; ")}. Run ${gate}, fix what fails, or ask the user to skip a step with crew skip.${judgement}${wait}${mailNote()}`,
    },
    true,
  );
}
