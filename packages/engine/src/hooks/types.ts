import type { CrewPaths } from "../paths.ts";
import type { Policy, Profile } from "../types.ts";

export interface HookPayload {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  source?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  /** Claude Code's permission mode: default, acceptEdits, plan, auto, dontAsk or bypassPermissions. */
  permission_mode?: string;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
}

export type HookResponse = Record<string, unknown>;

export interface HookContext {
  paths: CrewPaths;
  sessionId: string;
  profile: Profile;
  policy: Policy;
  tampered: boolean;
}
