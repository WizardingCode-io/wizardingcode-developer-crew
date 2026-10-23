import { mailContext, registerProject, syncMail } from "../mail.ts";
import { sweepSafely } from "../open.ts";
import { resolvePaths } from "../paths.ts";
import { loadPolicy } from "../policy.ts";
import { ensureProfile } from "../profile.ts";
import { adoptMainFiles, liveSessions, loadState, recordSeen } from "../state.ts";
import type { Message } from "../types.ts";
import { openItems } from "../work.ts";
import type { HookContext, HookPayload } from "./types.ts";

/**
 * The registry and the mailbox, refreshed for this hook run: the project's entry at most once in
 * two minutes (plan decision 3), the mail synced. A failure there (a full or read-only home, a
 * lock left behind by a killed hook) is dropped for this run and named in `failed`; it never
 * reaches the hook's own rule, which is the engine's guarantee (risk review of SP2c task 3).
 */
export function refreshMail(ctx: HookContext): { newMail: Message[]; failed: string | null } {
  try {
    registerProject(ctx.mail, ctx.sessionId, { minIntervalMs: 2 * 60 * 1000, hook: true });
    return { newMail: syncMail(ctx.mail, ctx.paths).newMail, failed: null };
  } catch (error) {
    return { newMail: [], failed: (error as Error).message };
  }
}

/**
 * A read of the mailbox that must not cost the hook its rule: `fallback` when the mailbox cannot be
 * read, with `mail: <message>` pushed into `notes` when given, so the error is said (finding 30).
 */
export function mailQuietly<T>(read: () => T, fallback: T, notes?: string[]): T {
  try {
    return read();
  } catch (error) {
    notes?.push(`mail: ${(error as Error).message}`);
    return fallback;
  }
}

/** The lines of `sweepSafely` for the hook to say, at a session start and at every turn end, since the engine has no daemon (SP2c §10). */
export function sweepLines(ctx: HookContext): string[] {
  return sweepSafely(ctx.mail).lines;
}

/** Null where crew is inactive (no git repository and no `.crew/`); nothing is written then. */
export function buildContext(
  payload: HookPayload,
  env: NodeJS.ProcessEnv = process.env,
): HookContext | null {
  const cwd = payload.cwd ?? process.cwd();
  const paths = resolvePaths(cwd, env);
  if (!paths) return null;
  // A worktree's policy and profile come from its main checkout before anything reads them (AC-5);
  // the session's heartbeat is liveness data (AC-1). Neither may cost the hook its rule.
  try {
    adoptMainFiles(paths);
  } catch {
    // the worktree goes on with what it has
  }
  if (payload.session_id) {
    try {
      recordSeen(paths, payload.session_id, cwd);
    } catch {
      // no record: no neighbour
    }
  }
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  // What opened this session: the variables, narrowed by the engine's record (`resolveOpener`, the
  // one place the rule is written, read once through `mailSelf`).
  const mail = mailContext(paths, policy.policy, env);
  return {
    paths,
    sessionId: payload.session_id ?? "default",
    profile: profile.profile,
    policy: policy.policy,
    tampered: profile.tampered || policy.tampered,
    headless: env.CLAUDE_CODE_SESSION_ATTENDED === "0",
    mail,
    openedBy: mail.self.openedBy,
    openedBranch: mail.self.openedBranch,
    openedMode: mail.self.openedMode,
    env,
  };
}

/**
 * The live sessions of this checkout, other than this one, whose item is an open item of the
 * checkout and not this session's own (session lanes, AC-3), by id. A session opened by mail keeps
 * its own rules and has none: the opener is read from the engine's records (`resolveOpener`).
 */
export function neighbours(ctx: HookContext): { id: string; item: string }[] {
  if (ctx.openedBy) return [];
  const live = liveSessions(ctx.paths);
  const own = live[ctx.sessionId]?.item;
  const others = Object.entries(live)
    .filter(([id, s]) => id !== ctx.sessionId && s.item && s.item !== own)
    .sort(([a], [b]) => a.localeCompare(b));
  if (!others.length) return [];
  const open = new Set(openItems(ctx.paths).map((w) => w.id));
  return others
    .filter(([, s]) => open.has(s.item ?? ""))
    .map(([id, s]) => ({ id, item: s.item ?? "" }));
}

/** Whether this session holds an open item of this checkout: the lane rule never refuses it (AC-3, its own item passes). */
export function holdsOpenItem(ctx: HookContext): boolean {
  const own = loadState(ctx.paths).sessions[ctx.sessionId]?.item;
  return !!own && openItems(ctx.paths).some((w) => w.id === own);
}

/** The context line naming the live neighbours (AC-4), or null when there is none or the check fails. */
export function neighbourLine(ctx: HookContext): string | null {
  let found: { id: string; item: string }[];
  try {
    found = neighbours(ctx);
  } catch {
    return null;
  }
  if (!found.length) return null;
  return `Crew: ${found.length} other live session(s) in this checkout: ${found.map((n) => `${n.id.slice(0, 8)} on ${n.item}`).join(", ")}. Start new work in a worktree of your own (EnterWorktree).`;
}
