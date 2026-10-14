import { resolvePaths } from "../paths.ts";
import { loadPolicy } from "../policy.ts";
import { ensureProfile } from "../profile.ts";
import type { HookContext, HookPayload } from "./types.ts";

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
  };
}
