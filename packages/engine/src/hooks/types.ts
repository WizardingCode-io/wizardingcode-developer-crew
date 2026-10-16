import type { MailContext } from "../mail.ts";
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
  /** SubagentStop and SubagentStart: the subagent's id and type (`plugin-name:agent-name` for a plugin agent; spike A4). */
  agent_id?: string;
  agent_type?: string;
  /** SubagentStop: the subagent's own transcript (JSONL). */
  agent_transcript_path?: string;
}

export type HookResponse = Record<string, unknown>;

export interface HookContext {
  paths: CrewPaths;
  sessionId: string;
  profile: Profile;
  policy: Policy;
  tampered: boolean;
  /** A headless session (`CLAUDE_CODE_SESSION_ATTENDED=0`, as `claude -p` sets it): no prompt reaches a person. */
  headless: boolean;
  /** The mail identity of this project and agent (SP2c §6). */
  mail: MailContext;
  /** The message that opened this session, when mail did (`WIZARDINGCODE_CREW_MAIL_ID`; plan decision 4). */
  openedBy: string | null;
  /** The branch the opener made for this session (`WIZARDINGCODE_CREW_MAIL_BRANCH`): the one branch it may push, whatever HEAD says now. */
  openedBranch: string | null;
}
