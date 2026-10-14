import {
  DEFAULT_WATCH_EXCLUDE,
  isFormerWatchDefault,
  missingTestCommands,
} from "../detect/index.ts";
import { changedWatchedPaths, computeFingerprint } from "../fingerprint.ts";
import { assess } from "../gates.ts";
import { saveProfile } from "../profile.ts";
import { ensureCrewDir, loadState, saveState, sessionState } from "../state.ts";
import { activeWork } from "../work.ts";
import { statusLine } from "./prompt.ts";
import type { HookContext, HookPayload, HookResponse } from "./types.ts";

export function onSessionStart(ctx: HookContext, payload: HookPayload = {}): HookResponse {
  ensureCrewDir(ctx.paths, ctx.policy);
  // A watch list equal to an earlier release's default was never the user's choice, so it follows
  // the current default here, before the baseline is taken with it (finding 12 of the real-use
  // phase: a hint asking the agent to refresh was shown at every start and never acted on). A
  // profile changed outside the engine is left as it is, with the hint.
  const former = isFormerWatchDefault(ctx.profile);
  const moved = former && !ctx.tampered;
  if (moved) {
    ctx.profile.watch.exclude = [...DEFAULT_WATCH_EXCLUDE];
    saveProfile(ctx.paths, ctx.profile);
  }
  const state = loadState(ctx.paths);
  const active = activeWork(ctx.paths);
  // A resume or a compaction continues the same session: its baseline still says where it began.
  const continues =
    (payload.source === "resume" || payload.source === "compact") &&
    state.sessions[ctx.sessionId] !== undefined;
  if (!continues) {
    const session = sessionState(state, ctx.sessionId);
    const work = active?.work ?? null;
    // Unproven changes left by an earlier session are not this session's starting point: with no
    // baseline the Stop rule counts them as changed.
    const base = work;
    const inherited =
      work !== null &&
      changedWatchedPaths(ctx.paths.root, ctx.profile, base).length > 0 &&
      assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || !!active?.tampered)
        .verdict !== "proven";
    session.baseline = inherited ? null : computeFingerprint(ctx.paths.root, ctx.profile, base);
    session.stopBlocks = 0;
    saveState(ctx.paths, state);
  }

  const lines = [
    "WizardingCode Developer Crew is active in this repository. Work is proven by the `crew` command and the crew skill, and a turn cannot end while watched source files have unproven changes.",
    // Where every session reads it, not only in the skill: a stale note once beat rule 4 (finding 22).
    "You run every crew command; the user never types one: a decision that is theirs (crew approve, skip, decide, accept, profile confirm) is signed by the permission prompt your command raises, in auto mode too.",
  ];
  if (active?.work)
    lines.push(
      statusLine(ctx, active.work, active.tampered).replace(/^Crew: work/, "Work in progress:"),
    );
  else
    lines.push(
      "No work item is active. A code change starts by answering the crew skill's nine typed questions, then crew start \"<request>\" --answers '<json>'.",
    );
  const missing = missingTestCommands(ctx.profile);
  if (missing.length) {
    lines.push(
      `No test command is known for: ${missing.map((m) => m.target).join(", ")}. One is proposed with \`crew profile set test "<cmd>"\`.`,
    );
  }
  if (moved) {
    lines.push(
      `The profile's watch list predated this release and now follows the current default (${DEFAULT_WATCH_EXCLUDE.join(", ")}).`,
    );
  } else if (former) {
    // A profile written by an earlier release keeps its watch list and knows no workspaces until re-detected.
    lines.push(
      "The profile predates this release: run `crew detect --refresh` once to pick up the current defaults.",
    );
  }
  return {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join(" ") },
  };
}
