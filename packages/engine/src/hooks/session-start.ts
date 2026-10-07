import { missingTestCommands } from "../detect/index.ts";
import { computeFingerprint } from "../fingerprint.ts";
import { ensureCrewDir, loadState, saveState, sessionState } from "../state.ts";
import { activeWork } from "../work.ts";
import { statusLine } from "./prompt.ts";
import type { HookContext, HookResponse } from "./types.ts";

export function onSessionStart(ctx: HookContext): HookResponse {
  ensureCrewDir(ctx.paths, ctx.policy);
  const state = loadState(ctx.paths);
  const session = sessionState(state, ctx.sessionId);
  session.baseline = computeFingerprint(ctx.paths.root, ctx.profile);
  session.stopBlocks = 0;
  saveState(ctx.paths, state);

  const lines = [
    "Shibaox Developer Crew is active in this repository. Work is proven by the `crew` command and the crew skill, and a turn cannot end while watched source files have unproven changes.",
  ];
  const active = activeWork(ctx.paths);
  if (active?.work)
    lines.push(
      statusLine(ctx, active.work, active.tampered).replace(/^Crew: work/, "Work in progress:"),
    );
  else lines.push('No work item is active. A code change starts with `crew start "<request>"`.');
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
