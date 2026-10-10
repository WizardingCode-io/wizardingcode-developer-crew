import { missingTestCommands } from "../detect/index.ts";
import { changedWatchedPaths, computeFingerprint } from "../fingerprint.ts";
import { assess } from "../gates.ts";
import { ensureCrewDir, loadState, saveState, sessionState } from "../state.ts";
import { activeWork } from "../work.ts";
import { statusLine } from "./prompt.ts";
import type { HookContext, HookPayload, HookResponse } from "./types.ts";

export function onSessionStart(ctx: HookContext, payload: HookPayload = {}): HookResponse {
  ensureCrewDir(ctx.paths, ctx.policy);
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
    const base = work?.baseCommit;
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
  return {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join(" ") },
  };
}
