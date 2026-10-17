import { mailContext, registerProject, syncMail } from "../mail.ts";
import { sweepSafely } from "../open.ts";
import { resolvePaths } from "../paths.ts";
import { loadPolicy } from "../policy.ts";
import { ensureProfile } from "../profile.ts";
import type { Message } from "../types.ts";
import type { HookContext, HookPayload } from "./types.ts";

/**
 * The registry and the mailbox, refreshed for this hook run: the project's entry at most once in
 * two minutes (plan decision 3), the mail synced. A failure there (a full or read-only home, a
 * lock left behind by a killed hook) is dropped for this run and named in `failed`; it never
 * reaches the hook's own rule, which is the engine's guarantee (risk review of SP2c task 3).
 */
export function refreshMail(ctx: HookContext): { newMail: Message[]; failed: string | null } {
  try {
    registerProject(ctx.mail, ctx.sessionId, { minIntervalMs: 2 * 60 * 1000 });
    return { newMail: syncMail(ctx.mail, ctx.paths).newMail, failed: null };
  } catch (error) {
    return { newMail: [], failed: (error as Error).message };
  }
}

/** A read of the mailbox that must not cost the hook its rule: `fallback` when the mailbox cannot be read. */
export function mailQuietly<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
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
  const paths = resolvePaths(payload.cwd ?? process.cwd(), env);
  if (!paths) return null;
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
  };
}
