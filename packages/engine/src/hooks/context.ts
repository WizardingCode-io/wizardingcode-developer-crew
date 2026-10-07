import { resolvePaths } from "../paths.ts";
import { loadPolicy } from "../policy.ts";
import { ensureProfile } from "../profile.ts";
import type { HookContext, HookPayload } from "./types.ts";

export function buildContext(
  payload: HookPayload,
  env: NodeJS.ProcessEnv = process.env,
): HookContext {
  const paths = resolvePaths(payload.cwd ?? process.cwd(), env);
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  return {
    paths,
    sessionId: payload.session_id ?? "default",
    profile: profile.profile,
    policy: policy.policy,
    tampered: profile.tampered || policy.tampered,
  };
}
