import { mailContext, registerProject, syncMail } from "../mail.ts";
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

/** Null where crew is inactive (no git repository and no `.crew/`); nothing is written then. */
export function buildContext(
  payload: HookPayload,
  env: NodeJS.ProcessEnv = process.env,
): HookContext | null {
  const paths = resolvePaths(payload.cwd ?? process.cwd(), env);
  if (!paths) return null;
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  return {
    paths,
    sessionId: payload.session_id ?? "default",
    profile: profile.profile,
    policy: policy.policy,
    tampered: profile.tampered || policy.tampered,
    headless: env.CLAUDE_CODE_SESSION_ATTENDED === "0",
    mail: mailContext(paths, policy.policy, env),
    openedBy: env.WIZARDINGCODE_CREW_MAIL_ID?.trim() || null,
    openedBranch: env.WIZARDINGCODE_CREW_MAIL_BRANCH?.trim() || null,
  };
}
