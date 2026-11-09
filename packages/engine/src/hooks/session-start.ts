import { join } from "node:path";
import { adaptersLine, quoted, refreshAdapters, unwrittenMark } from "../adapters.ts";
import { uncommittedAdapters } from "../adapters-uncommitted.ts";
import { appendDecision, lastEntryText } from "../decisions.ts";
import {
  DEFAULT_WATCH_EXCLUDE,
  isFormerWatchDefault,
  missingTestCommands,
} from "../detect/index.ts";
import { baseCommitOf, changedWatchedPaths, computeFingerprint } from "../fingerprint.ts";
import { nowIso } from "../fs.ts";
import { assess } from "../gates.ts";
import { LockBusy, withLock } from "../lock.ts";
import { emptyInboxSummary, inboxSummary, subjectQuoted } from "../mail.ts";
import { discoverPacks } from "../packs.ts";
import { canonical } from "../paths.ts";
import { refreshProfile, saveProfile } from "../profile.ts";
import { pluginRoot } from "../runtimes.ts";
import { ensureCrewDir, liveSessions, loadState, updateSession } from "../state.ts";
import { VERSION } from "../version.ts";
import { activeWork } from "../work.ts";
import { worktreeMainRoot } from "../worktree.ts";
import { mailQuietly, neighbourLine, refreshMail, sweepLines } from "./context.ts";
import { packCounts, statusLine } from "./prompt.ts";
import type { HookContext, HookPayload, HookResponse } from "./types.ts";

/**
 * How long the adapter step may run, from entry to `onSessionStart`, inside the hook's 15 s bound
 * (item 2026-11-08-002, AC-21): an install not begun by then is left stale, and the baseline wait
 * gives up by then too. A property, so a test can shorten it.
 */
export const adapterDeadline = { ms: 8000 };

export function onSessionStart(ctx: HookContext, payload: HookPayload = {}): HookResponse {
  const start = Date.now();
  ensureCrewDir(ctx.paths, ctx.policy);
  // The project is known to the mail from its first moment; what the sync marks as seen is what
  // the prompt hook will not repeat (SP2c §6; plan decision 3). A mailbox this run cannot use
  // costs the session its mail lines, never its context.
  const mail = refreshMail(ctx);
  // The sessions this project opened are swept here and at Stop (SP2c §10).
  const swept = mail.failed ? [] : sweepLines(ctx);
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
  // The packs Claude Code installed are registered before the profile refresh (SP6 Task 2 AC-6),
  // so a discovered pack's rules reach this start's profile; read-only on the registry, fail-open.
  try {
    // What the discovery changed or refused enters the project's register (the risk gate's
    // finding): the context says the count alone, the register says what happened. A refusal that
    // stands at every start is written once: the same text as the register's last pack entry is
    // not appended again (round 3).
    const discovered = discoverPacks(ctx.paths.userDir, ctx.env);
    const text = `pack discovery: ${discovered.join("; ")}`;
    // The register is read only when the discovery has something to say (finding 111).
    if (discovered.length && text !== lastEntryText(ctx.paths, "pack"))
      appendDecision(ctx.paths, {
        at: nowIso(),
        item: "pack",
        kind: "pack",
        text,
        by: "the engine",
      });
  } catch {
    // A discovery that cannot run costs nothing: the session starts without it.
  }
  // The profile follows the manifests: a script or a lockfile added since the last detection is
  // picked up here and at every gate run, never by hand (finding 23).
  const refreshed = refreshProfile(ctx.paths, ctx.profile, ctx.tampered);
  ctx.profile = refreshed.profile;
  const active = activeWork(ctx.paths);
  // A resume or a compaction continues the same session: its baseline still says where it began.
  const continues =
    (payload.source === "resume" || payload.source === "compact") &&
    loadState(ctx.paths).sessions[ctx.sessionId] !== undefined;
  // The runtime adapters of this checkout (item 2026-11-08-002): refreshed from this engine's root
  // when the recorded version differs, before the baseline is taken, so the session's own Stop
  // never counts the files the refresh wrote; then the wait for the adapters lock, so no baseline
  // is taken while another session's or the fleet's refresh writes (AC-27). Fenced: a throw costs
  // the line, never the context.
  let adaptersText: string | null = null;
  try {
    const deadline = start + adapterDeadline.ms;
    const engineRoot = canonical(pluginRoot());
    const recorded = loadState(ctx.paths).adapters?.[engineRoot];
    const refresh =
      recorded === VERSION
        ? null
        : refreshAdapters(ctx.paths, {
            root: engineRoot,
            version: VERSION,
            home: ctx.env.HOME ?? "",
            dryRun: false,
            deadline,
            resumed: continues,
            activeItem: active !== null,
            worktree: worktreeMainRoot(ctx.paths.root) !== null,
            live: Object.keys(liveSessions(ctx.paths)).some((id) => id !== ctx.sessionId),
          });
    let busy = false;
    try {
      withLock(join(ctx.paths.localDir, "adapters"), () => {}, {
        what: "adapter refresh",
        waitMs: Math.max(0, deadline - Date.now()),
      });
    } catch (error) {
      if (!(error instanceof LockBusy)) throw error;
      busy = true;
    }
    // The mark of a refresh nobody committed yet (item 2026-11-09-001), read at every start and
    // on any root: the reminder with its commit command, and the clean entries cleared. A refresh
    // whose own mark could not be written reminds from the entry it holds.
    const reminder = uncommittedAdapters(ctx.paths, {
      clear: true,
      also: unwrittenMark(refresh),
    });
    adaptersText = adaptersLine(refresh, busy ? ["another session is updating"] : [], reminder);
  } catch (error) {
    adaptersText = `adapters: not checked (${quoted((error as Error).message)}).`;
  }
  if (!continues) {
    const work = active?.work ?? null;
    // Unproven changes left by an earlier session are not this session's starting point: with no
    // baseline the Stop rule counts them as changed.
    const base = work;
    const inherited =
      work !== null &&
      changedWatchedPaths(ctx.paths.root, ctx.profile, base).length > 0 &&
      assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || !!active?.tampered)
        .verdict !== "proven";
    const head = baseCommitOf(ctx.paths.root);
    const baseline = inherited ? null : computeFingerprint(ctx.paths.root, ctx.profile, base);
    // A no-item git baseline was measured from HEAD: the no-item Stop rule reads the change from
    // that commit, so a commit that touches no watched path is no change (finding 225).
    const baselineCommit =
      work === null && head !== null && baseline?.startsWith("sha256:") ? head : undefined;
    // Under the lock every writer of the state takes (`updateSession`).
    updateSession(ctx.paths, ctx.sessionId, (session) => {
      session.baseline = baseline;
      if (baselineCommit) session.baselineCommit = baselineCommit;
      else delete session.baselineCommit;
      session.stopBlocks = 0;
    });
  }

  const lines = [
    "WizardingCode Developer Crew is active in this repository. Work is proven by the `crew` command and the crew skill, and a turn cannot end while watched source files have unproven changes.",
    // Where every session reads it, not only in the skill: a stale note once beat rule 4 (finding 22).
    ctx.policy.attendedDecisions === "relay"
      ? "You run every crew command; the user never types one: a decision that is theirs (crew approve, skip, decide, accept, profile confirm) is relayed by you from the conversation under this repository's policy (attendedDecisions: relay), so run the command once the user has said yes, with no prompt; the record says relayed by the agent."
      : "You run every crew command; the user never types one: a decision that is theirs (crew approve, skip, decide, accept, profile confirm) is signed by the permission prompt your command raises, in auto mode too.",
    // The writing standard where every session reads it: a session opens build.md and deliver.md
    // only when it needs them, and the measuring case's run wrote its texts having opened neither (2026-10-29-001, AC-21).
    "Every text you write, your ending too, follows the skill's references/writing.md: no filler or inflation, every fact and scope limit kept, a missing source marked [source?], never invented or dropped.",
    // The engine that runs, so a stale plugin shows at the start, not in the cache (finding 66).
    `Engine: crew ${VERSION}.`,
    // What the refresh of the runtime adapters did, when it did or held back anything (item 2026-11-08-002).
    ...(adaptersText ? [adaptersText] : []),
  ];
  if (active?.work)
    lines.push(
      statusLine(ctx, active.work, active.tampered).replace(/^Crew: work/, "Work in progress:"),
    );
  else {
    lines.push(
      "No work item is active. A code change starts by answering the crew skill's nine typed questions, then crew start \"<request>\" --answers '<json>'.",
    );
    // The packs, said once here when no item's status line carries them (SP6 Task 2 AC-6).
    const packs = packCounts(ctx);
    if (packs.registered)
      lines.push(
        `Packs: ${packs.registered} registered${packs.missing ? ` (${packs.missing} missing)` : ""}.`,
      );
  }
  const lane = neighbourLine(ctx);
  if (lane) lines.push(lane);
  if (refreshed.changed.length) lines.push(`profile refreshed: ${refreshed.changed.join("; ")}.`);
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
  // The mail: blockers first, then the inbox in one line, then what a session opened by mail may do.
  const summary = mail.failed
    ? emptyInboxSummary()
    : mailQuietly(() => inboxSummary(ctx.mail), emptyInboxSummary());
  const blockers = summary.blockers.map(
    (b) =>
      `Blocker ${b.id} from ${b.from.project}: ${subjectQuoted(b.subject)} (crew mail read ${b.id}).`,
  );
  if (mail.failed) lines.push(`Mail is off for this session start: ${mail.failed}.`);
  else if (summary.tampered && summary.line) lines.push(`${summary.line}.`);
  else if (summary.line)
    lines.push(
      `${summary.line}. crew mail inbox lists it; a question is answered from the code with crew mail reply, a change request waits for the user's yes and starts an item with --origin <id>, a notice is said.`,
    );
  if (ctx.openedBy && !ctx.journeyId) {
    const opener = summary.messages.find((m) => m.id === ctx.openedBy);
    // The branch is the one the opener pinned; HEAD never stands in for it (the agent can move HEAD).
    const branch = ctx.openedBranch
      ? ` (branch ${ctx.openedBranch})`
      : " (the opener pinned no branch: every push is denied)";
    lines.push(
      `This session was opened by mail ${ctx.openedBy}${opener ? ` from ${opener.from.project} (${opener.type})` : ""}: read it with crew mail read ${ctx.openedBy}. A question: answer from the code and crew mail reply ${ctx.openedBy} "<text>". A change request: run the method on this branch as a work item started with --origin ${ctx.openedBy}${branch}, commit on it, and end with crew mail reply ${ctx.openedBy} --branch <branch> --item <child id>. Never merge, push to another branch or deploy; a full-route spec waits for a person (crew await <id> user).`,
    );
  }
  // What the sweep settled: a session that ended without a reply, failed, or was stopped past its minutes.
  if (swept.length) lines.push(`Swept: ${swept.join("; ")}.`);
  lines.unshift(...blockers);
  return {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join(" ") },
  };
}
