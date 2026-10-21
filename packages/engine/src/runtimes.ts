import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FRONT_MATTER, frontMatterProblems, parseQuoted } from "./front-matter.ts";
import { sha256 as hashOf, writeText } from "./fs.ts";
import type { HookPayload, HookResponse } from "./hooks/types.ts";
import { opencodePlugin } from "./runtimes/opencode-plugin.ts";
import { ROLE_NAMES } from "./team.ts";

/**
 * The runtime adapters as one table (SP6 Task 4; ADR 0011): per runtime, the events it has by the
 * engine's names, the reader of its payload into the engine's `HookPayload`, the writer of the
 * engine's answer in its shape, its hook configuration, the folders of its skills and agents, the
 * agent file in its format, and what each guarantee of the method is there: enforced where the
 * official page documents the mechanism, requested with the reason elsewhere. The facts come from
 * the pages read on 2026-10-20 (`docs/adr/0011-runtime-adapters.md`); nothing unsourced is enforced.
 */

export const RUNTIME_NAMES = [
  "claude",
  "codex",
  "cursor",
  "copilot",
  "gemini",
  "opencode",
] as const;
export type RuntimeName = (typeof RUNTIME_NAMES)[number];
export const ENGINE_EVENTS = [
  "session-start",
  "prompt",
  "pre-tool-use",
  "post-tool-use",
  "stop",
  "subagent-stop",
] as const;
export type EngineEvent = (typeof ENGINE_EVENTS)[number];
export type Scope = "project" | "user";
export type GuaranteeName =
  | "context at start"
  | "the status line per prompt"
  | "the denial of engine files"
  | "the denial of forbidden commands"
  | "the hold at Stop"
  | "the roles' answers filed"
  | "the roles read-only";
export interface Guarantee {
  what: GuaranteeName;
  tier: "enforced" | "requested";
  why: string | null;
}
/** What `crew hook --runtime` prints and exits with; `dropped` is a `systemMessage` the runtime has no field for, left as a notice. */
export interface Written {
  stdout: string;
  exitCode: number;
  dropped: string | null;
}
/** An agent page of `plugins/core/agents/*.md`: its frontmatter and its body. */
export interface AgentPage {
  name: string;
  description: string;
  tools: string[];
  model?: string;
  body: string;
}
export interface RuntimeConfig {
  /** The hook configuration's path at each scope, relative to the repository root or to `~`. */
  project: string;
  user: string;
  /** The entries crew writes for a plugin root: an object to merge, or the plugin's text (OpenCode). */
  entries(root: string): unknown;
  /** The existing file's content with crew's entries in and every foreign entry kept. */
  merge(existing: unknown, entries: unknown): unknown;
  /** The existing file's content with crew's entries out (`crew runtime remove`); null where crew writes the file whole, which is then deleted. */
  strip: ((existing: unknown) => unknown) | null;
}
export interface Runtime {
  name: RuntimeName;
  label: string;
  events: Record<EngineEvent, string | null>;
  tools: Record<string, string>;
  readPayload(event: EngineEvent, raw: unknown, cwd: string): HookPayload;
  writeResponse(event: EngineEvent, response: HookResponse): Written;
  config: RuntimeConfig;
  skillsDir: Record<Scope, string>;
  agentsDir: Record<Scope, string> | null;
  agentFile(page: AgentPage): { name: string; text: string } | null;
  guarantees: Guarantee[];
  trust: string | null;
  /** One recorded payload per event the runtime has (the fixtures of `tests/fixtures/runtimes`), for `crew runtime check`. */
  samples: Partial<Record<EngineEvent, unknown>>;
}

const PLUGIN_PREFIX = "wizardingcode-developer-crew:";
const EXPERT = /^expert-\d+$/;
const WRITE_TOOL_NAMES = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash"]);
const PATCH_START = "*** Begin Patch";
const PATCH_HEADER = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm;
/** The seconds each event's hook may take, as `plugins/core/hooks/hooks.json` gives them. */
const TIMEOUTS: Record<EngineEvent, number> = {
  "session-start": 15,
  prompt: 5,
  "pre-tool-use": 5,
  "post-tool-use": 5,
  stop: 10,
  "subagent-stop": 10,
};

type Rec = Record<string, unknown>;
const isRecord = (value: unknown): value is Rec =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | undefined => (typeof value === "string" ? value : undefined);
/** An object without its undefined fields, as the runtime readers build their payloads. */
function compact(fields: Record<string, unknown>): HookPayload {
  const out: Rec = {};
  for (const [key, value] of Object.entries(fields)) if (value !== undefined) out[key] = value;
  return out as HookPayload;
}

/** A runtime agent's name as the engine's prefixed role, when it is a registry role (`crew-<role>` or bare); the name itself otherwise. */
function roleType(name: unknown): string | undefined {
  const value = str(name);
  if (value === undefined) return undefined;
  const bare = value.startsWith("crew-") ? value.slice("crew-".length) : value;
  return ROLE_NAMES.includes(bare) || EXPERT.test(bare) ? `${PLUGIN_PREFIX}${bare}` : value;
}

/** Every path a patch names (openai/codex's apply_patch grammar: Add, Update, Delete, Move to), absolute against the working folder. */
export function patchPaths(text: string, cwd: string): string[] {
  const paths: string[] = [];
  for (const match of text.matchAll(PATCH_HEADER)) {
    const path = (match[1] ?? "").trim();
    if (path) paths.push(resolve(cwd, path));
  }
  return paths;
}
const isPatch = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith(PATCH_START);
/** The input with the patch's paths beside its fields (`file_path` the first, `paths` all), when a string field is a patch. */
function withPatchPaths(input: Rec, cwd: string): Rec {
  const text = Object.values(input).find(isPatch);
  if (!text) return input;
  const paths = patchPaths(text, cwd);
  return paths.length ? { ...input, file_path: paths[0], paths } : input;
}
/**
 * `file_path` from the field names the runtimes use (`file_path`, `path`, `filePath`), made
 * absolute against the session's folder as the patch paths are (judgement round 2): the Write rule
 * joins a relative path to the repository's root, while the runtime writes it under its own cwd.
 */
function withFilePath(input: Rec, cwd: string): Rec {
  const found = str(input.file_path) ?? str(input.path) ?? str(input.filePath);
  return found === undefined ? input : { ...input, file_path: resolve(cwd, found) };
}
const cwdOf = (raw: Rec, cwd: string): string => str(raw.cwd) ?? cwd;

// The engine's answers, read for the writers.
const decisionOf = (r: HookResponse): { decision: string; reason: string } | null => {
  const out = isRecord(r.hookSpecificOutput) ? r.hookSpecificOutput : null;
  const decision = str(out?.permissionDecision);
  return decision === "deny" || decision === "ask"
    ? { decision, reason: str(out?.permissionDecisionReason) ?? "" }
    : null;
};
const contextOf = (r: HookResponse): string | undefined =>
  isRecord(r.hookSpecificOutput) ? str(r.hookSpecificOutput.additionalContext) : undefined;
const blockOf = (r: HookResponse): string | undefined =>
  r.decision === "block" ? (str(r.reason) ?? "") : undefined;
const sysOf = (r: HookResponse): string | undefined => str(r.systemMessage);
const out = (value: unknown, dropped: string | null = null): Written => ({
  stdout: JSON.stringify(value),
  exitCode: 0,
  dropped,
});
/** The engine's JSON with an ask turned into a deny (a runtime that does not enforce ask lets the call through). */
function askAsDeny(r: HookResponse): HookResponse {
  const d = decisionOf(r);
  if (d?.decision !== "ask" || !isRecord(r.hookSpecificOutput)) return r;
  return { ...r, hookSpecificOutput: { ...r.hookSpecificOutput, permissionDecision: "deny" } };
}
function withoutSys(r: HookResponse): HookResponse {
  const { systemMessage: _dropped, ...rest } = r;
  return rest;
}

// The hook command each runtime's configuration runs.
const command = (root: string, event: EngineEvent, runtime: RuntimeName) =>
  `node ${root}/dist/crew.mjs hook ${event} --runtime ${runtime}`;
const CREW_HOOK = /crew\.mjs hook\b/;
const isCrewGroup = (group: unknown): boolean =>
  isRecord(group) &&
  Array.isArray(group.hooks) &&
  group.hooks.some((h) => isRecord(h) && CREW_HOOK.test(str(h.command) ?? ""));
const isCrewFlat = (field: string) => (entry: unknown) =>
  isRecord(entry) && CREW_HOOK.test(str(entry[field]) ?? "");
/** Crew's entries replace crew's own and join the foreign ones, per event; other keys stay. */
function mergeHooks(
  existing: unknown,
  entries: unknown,
  isCrew: (entry: unknown) => boolean,
): unknown {
  const base: Rec = isRecord(existing) ? { ...existing } : {};
  const ours = isRecord(entries) ? entries : {};
  const hooks: Rec = isRecord(base.hooks) ? { ...base.hooks } : {};
  const theirs = isRecord(ours.hooks) ? ours.hooks : {};
  for (const [event, list] of Object.entries(theirs)) {
    const had = Array.isArray(hooks[event]) ? (hooks[event] as unknown[]) : [];
    hooks[event] = [...had.filter((e) => !isCrew(e)), ...(Array.isArray(list) ? list : [])];
  }
  const result: Rec = { ...base, ...ours, hooks };
  return result;
}

// The agent files per format.
const readOnly = (page: AgentPage) => page.tools.every((t) => !WRITE_TOOL_NAMES.has(t));
const yaml = (value: string) => JSON.stringify(value);
function frontmatter(lines: string[], body: string): string {
  return `---\n${lines.join("\n")}\n---\n\n${body}`;
}

/**
 * A front-matter value as the engine reads it: a double-quoted one decoded once as the JSON string
 * it is (finding 121's debt: a page quoted for a strict loader must not be quoted twice by the
 * generators), anything else raw, as before.
 */
function scalar(value: string): string {
  return parseQuoted(value) ?? value;
}

/** The frontmatter and the body of an agent page (`plugins/core/agents/*.md`). */
export function readAgentPage(text: string): AgentPage {
  const match = FRONT_MATTER.exec(text);
  const fields: Record<string, string> = {};
  for (const line of (match?.[1] ?? "").split("\n")) {
    const at = line.indexOf(":");
    if (at > 0) fields[line.slice(0, at).trim()] = scalar(line.slice(at + 1).trim());
  }
  const body = match ? text.slice(match[0].length).replace(/^\n+/, "") : text;
  return {
    name: fields.name ?? "",
    description: fields.description ?? "",
    tools: (fields.tools ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    ...(fields.model ? { model: fields.model } : {}),
    body,
  };
}

const enforced = (what: GuaranteeName): Guarantee => ({ what, tier: "enforced", why: null });
const requested = (what: GuaranteeName, why: string): Guarantee => ({
  what,
  tier: "requested",
  why,
});

// The recorded payloads, one per runtime and event (the fixtures under tests/fixtures/runtimes are these).
const ANSWER =
  "# security findings for w1\nreviewer: review-security\nread: 1 files, 1 hunks\n\n## Findings\n- none\n\n## Outside the change\n- none\n\n## Not answerable\n- none\n";
const claudeSamples: Partial<Record<EngineEvent, unknown>> = {
  "session-start": {
    session_id: "s1",
    transcript_path: "/tmp/s1.jsonl",
    cwd: "/repo",
    hook_event_name: "SessionStart",
    source: "startup",
  },
  prompt: {
    session_id: "s1",
    transcript_path: "/tmp/s1.jsonl",
    cwd: "/repo",
    hook_event_name: "UserPromptSubmit",
    prompt: "Fix the cart total",
  },
  "pre-tool-use": {
    session_id: "s1",
    transcript_path: "/tmp/s1.jsonl",
    cwd: "/repo",
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "npm test" },
    permission_mode: "default",
  },
  "post-tool-use": {
    session_id: "s1",
    transcript_path: "/tmp/s1.jsonl",
    cwd: "/repo",
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command: "ls" },
    tool_response: { stdout: "", stderr: "" },
  },
  stop: {
    session_id: "s1",
    transcript_path: "/tmp/s1.jsonl",
    cwd: "/repo",
    hook_event_name: "Stop",
    stop_hook_active: false,
    last_assistant_message: "Done.",
  },
  "subagent-stop": {
    session_id: "s1",
    transcript_path: "/tmp/s1.jsonl",
    cwd: "/repo",
    hook_event_name: "SubagentStop",
    agent_id: "a1",
    agent_type: "wizardingcode-developer-crew:review-security",
    agent_transcript_path: "/tmp/a1.jsonl",
    last_assistant_message: ANSWER,
    stop_hook_active: false,
  },
};
const codexSamples: Partial<Record<EngineEvent, unknown>> = {
  "session-start": {
    session_id: "s1",
    transcript_path: "/tmp/s1.jsonl",
    cwd: "/repo",
    hook_event_name: "SessionStart",
    model: "gpt-5-codex",
    source: "startup",
  },
  prompt: {
    session_id: "s1",
    transcript_path: "/tmp/s1.jsonl",
    cwd: "/repo",
    hook_event_name: "UserPromptSubmit",
    model: "gpt-5-codex",
    prompt: "Fix the cart total",
  },
  "pre-tool-use": {
    session_id: "s1",
    transcript_path: "/tmp/s1.jsonl",
    cwd: "/repo",
    hook_event_name: "PreToolUse",
    model: "gpt-5-codex",
    tool_name: "Bash",
    tool_input: { command: "npm test" },
    turn_id: "t1",
    tool_use_id: "u1",
  },
  "post-tool-use": {
    session_id: "s1",
    transcript_path: "/tmp/s1.jsonl",
    cwd: "/repo",
    hook_event_name: "PostToolUse",
    model: "gpt-5-codex",
    tool_name: "Bash",
    tool_input: { command: "ls" },
    tool_response: { output: "" },
    turn_id: "t1",
    tool_use_id: "u1",
  },
  stop: {
    session_id: "s1",
    transcript_path: "/tmp/s1.jsonl",
    cwd: "/repo",
    hook_event_name: "Stop",
    model: "gpt-5-codex",
    stop_hook_active: false,
    last_assistant_message: "Done.",
  },
  "subagent-stop": {
    session_id: "s1",
    transcript_path: "/tmp/s1.jsonl",
    cwd: "/repo",
    hook_event_name: "SubagentStop",
    model: "gpt-5-codex",
    agent_id: "a1",
    agent_type: "crew-review-security",
    agent_transcript_path: "/tmp/a1.jsonl",
    stop_hook_active: false,
    last_assistant_message: ANSWER,
  },
};
const cursorCommon = {
  conversation_id: "c1",
  model: "claude-4-sonnet",
  model_id: "claude-4-sonnet",
  model_params: {},
  cursor_version: "2.5.0",
  workspace_roots: ["/repo"],
  user_email: "dev@example.com",
  transcript_path: "/tmp/c1.txt",
};
const cursorSamples: Partial<Record<EngineEvent, unknown>> = {
  "session-start": {
    conversation_id: "c1",
    generation_id: "g1",
    model: "claude-4-sonnet",
    model_id: "claude-4-sonnet",
    model_params: {},
    hook_event_name: "sessionStart",
    cursor_version: "2.5.0",
    workspace_roots: ["/repo"],
    user_email: "dev@example.com",
    transcript_path: "/tmp/c1.txt",
    session_id: "c1",
  },
  prompt: {
    ...cursorCommon,
    generation_id: "g2",
    hook_event_name: "beforeSubmitPrompt",
    prompt: "Fix the cart total",
  },
  "pre-tool-use": {
    ...cursorCommon,
    generation_id: "g2",
    hook_event_name: "preToolUse",
    tool_name: "Shell",
    tool_input: { command: "npm install", working_directory: "/repo" },
    tool_use_id: "u1",
    cwd: "/repo",
    agent_message: "",
  },
  "post-tool-use": {
    ...cursorCommon,
    generation_id: "g2",
    hook_event_name: "postToolUse",
    tool_name: "Shell",
    tool_input: { command: "ls", working_directory: "/repo" },
    tool_output: "",
    tool_use_id: "u1",
    cwd: "/repo",
  },
  stop: {
    ...cursorCommon,
    generation_id: "g2",
    hook_event_name: "stop",
    status: "completed",
    loop_count: 0,
  },
  "subagent-stop": {
    ...cursorCommon,
    generation_id: "g3",
    hook_event_name: "subagentStop",
    subagent_type: "crew-review-security",
    status: "completed",
    task: "Review the diff against the security rubric",
    summary: ANSWER,
    duration_ms: 12000,
    tool_call_count: 4,
    loop_count: 0,
    modified_files: [],
    agent_transcript_path: "/tmp/sub-c1.txt",
  },
};
const geminiSamples: Partial<Record<EngineEvent, unknown>> = {
  "session-start": {
    session_id: "s1",
    transcript_path: "/tmp/s1.json",
    cwd: "/repo",
    hook_event_name: "SessionStart",
    timestamp: "2026-10-20T10:00:00Z",
    source: "startup",
  },
  prompt: {
    session_id: "s1",
    transcript_path: "/tmp/s1.json",
    cwd: "/repo",
    hook_event_name: "BeforeAgent",
    timestamp: "2026-10-20T10:00:01Z",
    prompt: "Fix the cart total",
  },
  "pre-tool-use": {
    session_id: "s1",
    transcript_path: "/tmp/s1.json",
    cwd: "/repo",
    hook_event_name: "BeforeTool",
    timestamp: "2026-10-20T10:00:02Z",
    tool_name: "run_shell_command",
    tool_input: { command: "npm test", description: "Run the tests", dir_path: "/repo" },
  },
  "post-tool-use": {
    session_id: "s1",
    transcript_path: "/tmp/s1.json",
    cwd: "/repo",
    hook_event_name: "AfterTool",
    timestamp: "2026-10-20T10:00:03Z",
    tool_name: "write_file",
    tool_input: { file_path: "src/a.ts", content: "export const x = 2;\n" },
    tool_response: { output: "ok" },
  },
  stop: {
    session_id: "s1",
    transcript_path: "/tmp/s1.json",
    cwd: "/repo",
    hook_event_name: "AfterAgent",
    timestamp: "2026-10-20T10:00:04Z",
    prompt: "Fix the cart total",
    prompt_response: "Done.",
    stop_hook_active: false,
  },
};
const copilotSamples: Partial<Record<EngineEvent, unknown>> = {
  "session-start": {
    session_id: "s1",
    timestamp: 1760954400000,
    cwd: "/repo",
    hook_event_name: "SessionStart",
    source: "startup",
    initialPrompt: "",
  },
  prompt: {
    session_id: "s1",
    timestamp: 1760954401000,
    cwd: "/repo",
    hook_event_name: "UserPromptSubmit",
    prompt: "Fix the cart total",
  },
  "pre-tool-use": {
    session_id: "s1",
    timestamp: 1760954402000,
    cwd: "/repo",
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "npm test" },
  },
  "post-tool-use": {
    session_id: "s1",
    timestamp: 1760954403000,
    cwd: "/repo",
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command: "ls" },
    tool_result: { resultType: "success", textResultForLlm: "" },
  },
  stop: {
    session_id: "s1",
    timestamp: 1760954404000,
    cwd: "/repo",
    hook_event_name: "Stop",
    transcript_path: "/tmp/s1.json",
    stop_reason: "end_turn",
    stop_hook_active: false,
  },
  "subagent-stop": {
    session_id: "s1",
    timestamp: 1760954405000,
    cwd: "/repo",
    hook_event_name: "SubagentStop",
    agent_id: "a1",
    agent_type: "custom",
    agent_name: "crew-review-security",
    response: ANSWER,
    stop_reason: "end_turn",
    transcript_path: "/tmp/sub-a1.json",
  },
};
const opencodeSamples: Partial<Record<EngineEvent, unknown>> = {
  "session-start": { session_id: "ses_01", cwd: "/repo" },
  "pre-tool-use": {
    session_id: "ses_01",
    cwd: "/repo",
    tool_name: "bash",
    tool_input: { command: "npm test", description: "Run the tests" },
  },
  "post-tool-use": {
    session_id: "ses_01",
    cwd: "/repo",
    tool_name: "bash",
    tool_input: { command: "ls" },
  },
};

// The readers.
function readClaude(_event: EngineEvent, raw: unknown, cwd: string): HookPayload {
  if (!isRecord(raw)) return { cwd };
  return { ...(raw as HookPayload), cwd: cwdOf(raw, cwd) };
}
function readCodex(event: EngineEvent, raw: unknown, cwd: string): HookPayload {
  if (!isRecord(raw)) return { cwd };
  const payload: Rec = { ...raw, cwd: cwdOf(raw, cwd) };
  if (event === "pre-tool-use" || event === "post-tool-use") {
    const name = str(payload.tool_name);
    const mapped = name ? RUNTIMES.codex.tools[name] : undefined;
    if (mapped) {
      const input = isRecord(payload.tool_input) ? payload.tool_input : {};
      const paths = patchPaths(str(input.command) ?? "", payload.cwd as string);
      payload.tool_name = mapped;
      payload.tool_input = paths.length ? { file_path: paths[0], paths } : {};
    }
  }
  if (event === "subagent-stop") payload.agent_type = roleType(payload.agent_type);
  return payload as HookPayload;
}
function readCursor(event: EngineEvent, raw: unknown, cwd: string): HookPayload {
  if (!isRecord(raw)) return { cwd };
  const roots = Array.isArray(raw.workspace_roots) ? raw.workspace_roots : [];
  const base = {
    session_id: str(raw.conversation_id) ?? str(raw.session_id),
    cwd: str(raw.cwd) ?? str(roots[0]) ?? cwd,
    hook_event_name: str(raw.hook_event_name),
  };
  switch (event) {
    case "prompt":
      return compact({ ...base, prompt: str(raw.prompt) });
    case "pre-tool-use":
    case "post-tool-use": {
      const name = str(raw.tool_name);
      const mapped = name ? (RUNTIMES.cursor.tools[name] ?? name) : undefined;
      let input = isRecord(raw.tool_input) ? raw.tool_input : undefined;
      if (input && (name === "Write" || name === "Delete")) input = withFilePath(input, base.cwd);
      return compact({ ...base, tool_name: mapped, tool_input: input });
    }
    case "stop":
      return compact({
        ...base,
        stop_hook_active: typeof raw.loop_count === "number" ? raw.loop_count > 0 : undefined,
      });
    case "subagent-stop":
      return compact({
        ...base,
        agent_type: roleType(raw.subagent_type),
        agent_transcript_path: str(raw.agent_transcript_path),
        last_assistant_message: str(raw.summary),
      });
    default:
      return compact(base);
  }
}
function readGemini(event: EngineEvent, raw: unknown, cwd: string): HookPayload {
  if (!isRecord(raw)) return { cwd };
  const base = {
    session_id: str(raw.session_id),
    cwd: cwdOf(raw, cwd),
    hook_event_name: str(raw.hook_event_name),
  };
  switch (event) {
    case "session-start":
      return compact({ ...base, source: str(raw.source) });
    case "prompt":
      return compact({ ...base, prompt: str(raw.prompt) });
    case "pre-tool-use":
    case "post-tool-use": {
      const name = str(raw.tool_name);
      const mapped = name ? (RUNTIMES.gemini.tools[name] ?? name) : undefined;
      const input = isRecord(raw.tool_input) ? raw.tool_input : undefined;
      return compact({
        ...base,
        tool_name: mapped,
        tool_input:
          input && (mapped === "Write" || mapped === "Edit")
            ? withFilePath(input, base.cwd)
            : input,
      });
    }
    case "stop":
      return compact({
        ...base,
        stop_hook_active:
          typeof raw.stop_hook_active === "boolean" ? raw.stop_hook_active : undefined,
        last_assistant_message: str(raw.prompt_response),
      });
    default:
      return compact(base);
  }
}
/** Copilot's tool input: a JSON string parsed, a plain string read as the command or the path, patch text parsed. */
function copilotInput(tool: string | undefined, value: unknown, cwd: string): Rec | undefined {
  let input: unknown = value;
  if (typeof input === "string") {
    try {
      input = JSON.parse(input);
    } catch {
      if (tool === "Bash") return { command: input };
      if (tool === "Write" || tool === "Edit") {
        if (isPatch(input)) {
          const paths = patchPaths(input, cwd);
          return paths.length ? { file_path: paths[0], paths } : {};
        }
        return withFilePath({ file_path: input }, cwd);
      }
      return undefined;
    }
  }
  if (!isRecord(input)) return undefined;
  if (tool === "Write" || tool === "Edit") return withFilePath(withPatchPaths(input, cwd), cwd);
  return input;
}
function readCopilot(event: EngineEvent, raw: unknown, cwd: string): HookPayload {
  if (!isRecord(raw)) return { cwd };
  const base = {
    session_id: str(raw.session_id),
    cwd: cwdOf(raw, cwd),
    hook_event_name: str(raw.hook_event_name),
  };
  switch (event) {
    case "session-start":
      return compact({ ...base, source: str(raw.source) });
    case "prompt":
      return compact({ ...base, prompt: str(raw.prompt) });
    case "pre-tool-use":
    case "post-tool-use": {
      const name = str(raw.tool_name);
      const lower = name?.toLowerCase();
      const mapped = lower === undefined ? undefined : (RUNTIMES.copilot.tools[lower] ?? name);
      let input = copilotInput(mapped, raw.tool_input, base.cwd);
      if (lower === "powershell") input = { ...(input ?? {}), shell: "powershell" };
      return compact({ ...base, tool_name: mapped, tool_input: input });
    }
    case "stop":
      return compact({
        ...base,
        stop_hook_active:
          typeof raw.stop_hook_active === "boolean" ? raw.stop_hook_active : undefined,
      });
    case "subagent-stop":
      return compact({
        ...base,
        agent_id: str(raw.agent_id),
        agent_type: roleType(raw.agent_name ?? raw.agent_type),
        agent_transcript_path: str(raw.transcript_path),
        last_assistant_message: str(raw.response),
      });
    default:
      return compact(base);
  }
}
function readOpencode(event: EngineEvent, raw: unknown, cwd: string): HookPayload {
  if (!isRecord(raw)) return { cwd };
  const base = { session_id: str(raw.session_id), cwd: cwdOf(raw, cwd) };
  if (event !== "pre-tool-use" && event !== "post-tool-use") return compact(base);
  const name = str(raw.tool_name);
  const mapped = name ? (RUNTIMES.opencode.tools[name] ?? name) : undefined;
  let input = isRecord(raw.tool_input) ? raw.tool_input : undefined;
  if (input && (mapped === "Write" || mapped === "Edit"))
    input = withFilePath(withPatchPaths(input, base.cwd), base.cwd);
  return compact({ ...base, tool_name: mapped, tool_input: input });
}

// The writers.
function writeCodex(_event: EngineEvent, r: HookResponse): Written {
  return out(askAsDeny(r));
}
function writeCursor(event: EngineEvent, r: HookResponse): Written {
  const d = decisionOf(r);
  const sys = sysOf(r);
  const ctx = contextOf(r);
  const block = blockOf(r);
  switch (event) {
    case "pre-tool-use":
      if (d)
        return out({
          permission: "deny",
          agent_message: d.reason,
          ...(sys ? { user_message: sys } : {}),
        });
      return out(sys ? { user_message: sys } : {});
    case "prompt":
      return out(sys ? { user_message: sys } : {});
    case "session-start":
    case "post-tool-use":
      return out(ctx !== undefined ? { additional_context: ctx } : {}, sys ?? null);
    case "stop":
      return out(block !== undefined ? { followup_message: block } : {}, sys ?? null);
    default:
      return out({}, sys ?? null);
  }
}
function writeGemini(event: EngineEvent, r: HookResponse): Written {
  const d = decisionOf(r);
  const sys = sysOf(r);
  const ctx = contextOf(r);
  const block = blockOf(r);
  const tail = sys ? { systemMessage: sys } : {};
  if (d) return out({ decision: "deny", reason: d.reason, ...tail });
  if (event === "stop" && block !== undefined)
    return out({ decision: "deny", reason: block, ...tail });
  if (
    ctx !== undefined &&
    (event === "session-start" || event === "prompt" || event === "post-tool-use")
  )
    return out({
      hookSpecificOutput: { hookEventName: RUNTIMES.gemini.events[event], additionalContext: ctx },
      ...tail,
    });
  return out(sys ? { systemMessage: sys } : {});
}
function writeCopilot(event: EngineEvent, r: HookResponse): Written {
  const d = decisionOf(r);
  const sys = sysOf(r) ?? null;
  const ctx = contextOf(r);
  const block = blockOf(r);
  if (d) return out({ permissionDecision: "deny", permissionDecisionReason: d.reason }, sys);
  if ((event === "session-start" || event === "post-tool-use") && ctx !== undefined)
    return out({ additionalContext: ctx }, sys);
  if ((event === "stop" || event === "subagent-stop") && block !== undefined)
    return out({ decision: "block", reason: block }, sys);
  return out({}, sys);
}
function writeOpencode(_event: EngineEvent, r: HookResponse): Written {
  const sys = sysOf(r) ?? null;
  return out(withoutSys(askAsDeny(r)), sys);
}

// The configurations.
const grouped = (
  root: string,
  runtime: RuntimeName,
  matchers: Partial<Record<EngineEvent, string>>,
) =>
  Object.fromEntries(
    ENGINE_EVENTS.filter((e) => RUNTIMES[runtime].events[e] !== null).map((e) => [
      RUNTIMES[runtime].events[e] as string,
      [
        {
          ...(matchers[e] ? { matcher: matchers[e] } : {}),
          hooks: [{ type: "command", command: command(root, e, runtime), timeout: TIMEOUTS[e] }],
        },
      ],
    ]),
  );
const CODEX_MATCHER = "Bash|apply_patch|Write|Edit|Agent|spawn_agent";
const CURSOR_MATCHER = "Shell|Write|Delete|Task";
const GEMINI_MATCHER = "run_shell_command|write_file|replace";

function codexEntries(root: string): unknown {
  return {
    hooks: grouped(root, "codex", {
      "pre-tool-use": CODEX_MATCHER,
      "post-tool-use": CODEX_MATCHER,
    }),
  };
}
function cursorEntries(root: string): unknown {
  const hooks = Object.fromEntries(
    ENGINE_EVENTS.map((e) => {
      const entry: Rec = { command: command(root, e, "cursor"), timeout: TIMEOUTS[e] };
      if (e === "pre-tool-use" || e === "post-tool-use") entry.matcher = CURSOR_MATCHER;
      if (e === "stop" || e === "subagent-stop") entry.loop_limit = null;
      return [RUNTIMES.cursor.events[e] as string, [entry]];
    }),
  );
  return { version: 1, hooks };
}
function geminiEntries(root: string): unknown {
  const hooks = Object.fromEntries(
    ENGINE_EVENTS.filter((e) => RUNTIMES.gemini.events[e] !== null).map((e) => [
      RUNTIMES.gemini.events[e] as string,
      [
        {
          ...(e === "pre-tool-use" || e === "post-tool-use" ? { matcher: GEMINI_MATCHER } : {}),
          hooks: [
            {
              name: "wizardingcode-crew",
              type: "command",
              command: command(root, e, "gemini"),
              timeout: TIMEOUTS[e] * 1000,
            },
          ],
        },
      ],
    ]),
  );
  return { hooks };
}
function copilotEntries(root: string): unknown {
  const hooks = Object.fromEntries(
    ENGINE_EVENTS.map((e) => [
      RUNTIMES.copilot.events[e] as string,
      [{ type: "command", bash: command(root, e, "copilot"), timeoutSec: TIMEOUTS[e] }],
    ]),
  );
  return { version: 1, hooks };
}

// The agent files.
function agentCodex(page: AgentPage) {
  const body = page.body.replace(/"""/g, '\\"\\"\\"');
  return {
    name: `crew-${page.name}.toml`,
    text: `name = "crew-${page.name}"\ndescription = ${yaml(page.description)}\ndeveloper_instructions = """\n${body}"""\n`,
  };
}
function agentCursor(page: AgentPage) {
  const lines = [`name: crew-${page.name}`, `description: ${yaml(page.description)}`];
  if (readOnly(page)) lines.push("readonly: true");
  return { name: `crew-${page.name}.md`, text: frontmatter(lines, page.body) };
}
function agentGemini(page: AgentPage) {
  const lines = [`name: crew-${page.name}`, `description: ${yaml(page.description)}`];
  if (readOnly(page)) lines.push("tools:", "  - read_file", "  - grep_search");
  return { name: `crew-${page.name}.md`, text: frontmatter(lines, page.body) };
}
function agentCopilot(page: AgentPage) {
  const lines = [`name: crew-${page.name}`, `description: ${yaml(page.description)}`];
  if (readOnly(page)) lines.push('tools: ["view", "grep", "glob"]');
  return { name: `crew-${page.name}.agent.md`, text: frontmatter(lines, page.body) };
}
function agentOpencode(page: AgentPage) {
  const lines = [`description: ${yaml(page.description)}`, "mode: subagent"];
  if (readOnly(page))
    lines.push(
      "permission:",
      "  edit: deny",
      "  write: deny",
      "  bash: deny",
      "  apply_patch: deny",
    );
  return { name: `crew-${page.name}.md`, text: frontmatter(lines, page.body) };
}

const AGENTS_SKILLS = { project: ".agents/skills", user: "~/.agents/skills" } as const;

export const RUNTIMES: Record<RuntimeName, Runtime> = {
  claude: {
    name: "claude",
    label: "Claude Code",
    events: {
      "session-start": "SessionStart",
      prompt: "UserPromptSubmit",
      "pre-tool-use": "PreToolUse",
      "post-tool-use": "PostToolUse",
      stop: "Stop",
      "subagent-stop": "SubagentStop",
    },
    tools: {},
    readPayload: readClaude,
    writeResponse: (_event, r) => out(r),
    config: {
      project: "hooks/hooks.json",
      user: "hooks/hooks.json",
      entries: () => null,
      merge: (existing) => existing,
      strip: null,
    },
    skillsDir: { project: ".claude/skills", user: "~/.claude/skills" },
    agentsDir: { project: ".claude/agents", user: "~/.claude/agents" },
    agentFile: () => null,
    guarantees: [
      enforced("context at start"),
      enforced("the status line per prompt"),
      enforced("the denial of engine files"),
      enforced("the denial of forbidden commands"),
      enforced("the hold at Stop"),
      enforced("the roles' answers filed"),
      enforced("the roles read-only"),
    ],
    trust: null,
    samples: claudeSamples,
  },
  codex: {
    name: "codex",
    label: "Codex CLI",
    events: {
      "session-start": "SessionStart",
      prompt: "UserPromptSubmit",
      "pre-tool-use": "PreToolUse",
      "post-tool-use": "PostToolUse",
      stop: "Stop",
      "subagent-stop": "SubagentStop",
    },
    tools: { apply_patch: "Write" },
    readPayload: readCodex,
    writeResponse: writeCodex,
    config: {
      project: ".codex/hooks.json",
      user: "~/.codex/hooks.json",
      entries: codexEntries,
      merge: (existing, entries) => mergeHooks(existing, entries, isCrewGroup),
      strip: (existing) => stripHooks(existing, isCrewGroup),
    },
    skillsDir: AGENTS_SKILLS,
    agentsDir: { project: ".codex/agents", user: "~/.codex/agents" },
    agentFile: agentCodex,
    guarantees: [
      enforced("context at start"),
      enforced("the status line per prompt"),
      enforced("the denial of engine files"),
      enforced("the denial of forbidden commands"),
      enforced("the hold at Stop"),
      requested(
        "the roles' answers filed",
        "the page does not say that agent_type names a custom agent",
      ),
      requested("the roles read-only", "no tools field is documented for a Codex agent"),
    ],
    trust:
      "review and trust the hook in /hooks before it runs; a changed hook is skipped until trusted again",
    samples: codexSamples,
  },
  cursor: {
    name: "cursor",
    label: "Cursor",
    events: {
      "session-start": "sessionStart",
      prompt: "beforeSubmitPrompt",
      "pre-tool-use": "preToolUse",
      "post-tool-use": "postToolUse",
      stop: "stop",
      "subagent-stop": "subagentStop",
    },
    tools: { Shell: "Bash", Write: "Write", Delete: "Write", Read: "Read", Task: "Agent" },
    readPayload: readCursor,
    writeResponse: writeCursor,
    config: {
      project: ".cursor/hooks.json",
      user: "~/.cursor/hooks.json",
      entries: cursorEntries,
      merge: (existing, entries) => mergeHooks(existing, entries, isCrewFlat("command")),
      strip: (existing) => stripHooks(existing, isCrewFlat("command")),
    },
    skillsDir: AGENTS_SKILLS,
    agentsDir: { project: ".cursor/agents", user: "~/.cursor/agents" },
    agentFile: agentCursor,
    guarantees: [
      enforced("context at start"),
      requested("the status line per prompt", "beforeSubmitPrompt carries no context field"),
      requested(
        "the denial of engine files",
        "the Write and Delete path fields are not documented; Shell is denied",
      ),
      enforced("the denial of forbidden commands"),
      enforced("the hold at Stop"),
      requested(
        "the roles' answers filed",
        "subagentStop gives a summary, not the transcript's last message, and the transcript format is not documented",
      ),
      enforced("the roles read-only"),
    ],
    trust: null,
    samples: cursorSamples,
  },
  copilot: {
    name: "copilot",
    label: "GitHub Copilot CLI",
    events: {
      "session-start": "SessionStart",
      prompt: "UserPromptSubmit",
      "pre-tool-use": "PreToolUse",
      "post-tool-use": "PostToolUse",
      stop: "Stop",
      "subagent-stop": "SubagentStop",
    },
    tools: {
      bash: "Bash",
      powershell: "Bash",
      create: "Write",
      edit: "Edit",
      str_replace_editor: "Edit",
      apply_patch: "Edit",
      view: "Read",
      task: "Agent",
    },
    readPayload: readCopilot,
    writeResponse: writeCopilot,
    config: {
      project: ".github/hooks/crew.json",
      user: "~/.copilot/hooks/crew.json",
      entries: copilotEntries,
      merge: (existing, entries) => mergeHooks(existing, entries, isCrewFlat("bash")),
      strip: (existing) => stripHooks(existing, isCrewFlat("bash")),
    },
    skillsDir: AGENTS_SKILLS,
    agentsDir: { project: ".github/agents", user: "~/.copilot/agents" },
    agentFile: agentCopilot,
    guarantees: [
      enforced("context at start"),
      requested("the status line per prompt", "UserPromptSubmit carries no context field"),
      requested(
        "the denial of engine files",
        "the create, edit and apply_patch input fields are not documented; file_path, path and filePath are tried and patch text is parsed; bash is denied",
      ),
      // The powershell tool's lines are read by text (hooks/powershell.ts, judgement rounds 2 to 29):
      // a text reader of a second grammar cannot promise what the POSIX reader promises for bash.
      requested(
        "the denial of forbidden commands",
        "the powershell tool's lines are read by text and rewritten for the POSIX reader, so a crew command built without the word crew on the line may pass, and a line that names the word outside a crew command, or a crew command with an unquoted comma list, is denied, since Copilot answers every ask of the engine as a deny; bash is enforced",
      ),
      enforced("the hold at Stop"),
      enforced("the roles' answers filed"),
      enforced("the roles read-only"),
    ],
    trust: null,
    samples: copilotSamples,
  },
  gemini: {
    name: "gemini",
    label: "Gemini CLI",
    events: {
      "session-start": "SessionStart",
      prompt: "BeforeAgent",
      "pre-tool-use": "BeforeTool",
      "post-tool-use": "AfterTool",
      stop: "AfterAgent",
      "subagent-stop": null,
    },
    tools: { run_shell_command: "Bash", write_file: "Write", replace: "Edit" },
    readPayload: readGemini,
    writeResponse: writeGemini,
    config: {
      project: ".gemini/settings.json",
      user: "~/.gemini/settings.json",
      entries: geminiEntries,
      merge: (existing, entries) => mergeHooks(existing, entries, isCrewGroup),
      strip: (existing) => stripHooks(existing, isCrewGroup),
    },
    skillsDir: AGENTS_SKILLS,
    agentsDir: { project: ".gemini/agents", user: "~/.gemini/agents" },
    agentFile: agentGemini,
    guarantees: [
      enforced("context at start"),
      enforced("the status line per prompt"),
      enforced("the denial of engine files"),
      enforced("the denial of forbidden commands"),
      enforced("the hold at Stop"),
      requested("the roles' answers filed", "no subagent event"),
      enforced("the roles read-only"),
    ],
    trust: "the first run warns about the new hook; a changed command is warned about again",
    samples: geminiSamples,
  },
  opencode: {
    name: "opencode",
    label: "OpenCode",
    events: {
      "session-start": "session.created",
      prompt: null,
      "pre-tool-use": "tool.execute.before",
      "post-tool-use": "tool.execute.after",
      stop: null,
      "subagent-stop": null,
    },
    tools: { bash: "Bash", write: "Write", edit: "Edit", apply_patch: "Write" },
    readPayload: readOpencode,
    writeResponse: writeOpencode,
    config: {
      project: ".opencode/plugins/wizardingcode-crew.js",
      user: "~/.config/opencode/plugins/wizardingcode-crew.js",
      entries: (root) => opencodePlugin(root),
      merge: (_existing, entries) => entries,
      strip: null,
    },
    skillsDir: AGENTS_SKILLS,
    agentsDir: { project: ".opencode/agents", user: "~/.config/opencode/agents" },
    agentFile: agentOpencode,
    guarantees: [
      requested(
        "context at start",
        "no context injection, and the session id field of session.created is not documented: the skill's first step runs crew status",
      ),
      requested("the status line per prompt", "no prompt hook"),
      requested(
        "the denial of engine files",
        "the write, edit and apply_patch argument names are not on an official page; filePath is tried",
      ),
      enforced("the denial of forbidden commands"),
      requested("the hold at Stop", "no stop hook: the record says the turn's end was not held"),
      requested("the roles' answers filed", "no subagent event"),
      enforced("the roles read-only"),
    ],
    trust: null,
    samples: opencodeSamples,
  },
};

/** The runtime of a name, or null for a name the table does not have. */
export function runtimeOf(name: string): Runtime | null {
  return (RUNTIME_NAMES as readonly string[]).includes(name) ? RUNTIMES[name as RuntimeName] : null;
}

/** The guarantee lines as `crew runtime check` prints them and the documents repeat them. */
export function guaranteeLines(runtime: Runtime): string[] {
  return runtime.guarantees.map((g) =>
    g.tier === "enforced" ? `${g.what}: enforced` : `${g.what}: requested (${g.why})`,
  );
}

/** The plugin folder of the running bundle: the folder above `dist/`; the repository's `plugins/core` when the engine runs from its sources. */
export function pluginRoot(): string {
  const here = fileURLToPath(import.meta.url);
  if (here.endsWith(`${"/dist/"}crew.mjs`)) return dirname(dirname(here));
  return resolve(dirname(here), "../../../plugins/core");
}

// `crew runtime list | install | check` (AC-3).

/** Where a runtime's paths resolve: the repository root for project scope, the home for `~/`. */
export interface InstallDirs {
  project: string;
  home: string;
}
/** A table path at a scope: `~/x` under the home, a relative one under the repository root. */
export function resolveScoped(path: string, dirs: InstallDirs): string {
  return path.startsWith("~/") ? join(dirs.home, path.slice(2)) : join(dirs.project, path);
}
const SKILL_FOLDER = "crew-method";

/** One line per runtime, as `crew runtime list` prints them. */
export function listLines(): string[] {
  return RUNTIME_NAMES.map((name) => {
    const r = RUNTIMES[name];
    const hooks = ENGINE_EVENTS.filter((e) => r.events[e] !== null);
    return `${r.name} · ${r.label} · hooks: ${hooks.length ? hooks.join(", ") : "none"} · config: ${r.config.project} | ${r.config.user} · skills: ${r.skillsDir.project} · agents: ${r.agentsDir?.project ?? "none"}`;
  });
}

function filesBelow(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory()
      ? filesBelow(path, base)
      : [relative(base, path).split(sep).join("/")];
  });
}
const sha256 = (path: string) => hashOf(readFileSync(path));
/** The agent files the table generates from the plugin's pages, by file name. */
function generatedAgents(runtime: Runtime, root: string): { name: string; text: string }[] {
  const dir = join(root, "agents");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .flatMap((f) => {
      const file = runtime.agentFile(readAgentPage(readFileSync(join(dir, f), "utf8")));
      return file ? [file] : [];
    });
}

/**
 * Writes the runtime's hook configuration (merged, crew's entries replacing crew's own, every
 * foreign entry kept), the skill copied whole as `crew-method/`, and the agents under `crew-`
 * names; nothing else is touched. Returns every file written, in order, and the trust step.
 */
export function installRuntime(
  runtime: Runtime,
  scope: Scope,
  dirs: InstallDirs,
  root: string,
): { files: string[]; trust: string | null } | { refused: string } {
  // A skill page a strict YAML loader would drop is refused before anything is written
  // (finding 121): the runtime would load the hooks and lose the method without a word.
  const skillPage = join(root, "skills", "crew", "SKILL.md");
  const pageProblems = existsSync(skillPage)
    ? frontMatterProblems(readFileSync(skillPage, "utf8"))
    : [];
  // Every problem named at once (finding 128): one attempt is enough to fix the page.
  if (pageProblems.length)
    return {
      refused: `skills/crew/SKILL.md ${pageProblems.join("; ")}; a strict YAML loader drops the page: fix the front matter`,
    };
  const files: string[] = [];
  const configPath = resolveScoped(
    scope === "project" ? runtime.config.project : runtime.config.user,
    dirs,
  );
  const entries = runtime.config.entries(root);
  if (typeof entries === "string") {
    writeText(configPath, entries);
  } else {
    let existing: unknown = null;
    if (existsSync(configPath)) {
      try {
        existing = JSON.parse(readFileSync(configPath, "utf8"));
      } catch {
        return { refused: `${configPath} is not JSON: fix or move it first` };
      }
    }
    writeText(configPath, `${JSON.stringify(runtime.config.merge(existing, entries), null, 2)}\n`);
  }
  files.push(configPath);
  const skillSource = join(root, "skills", "crew");
  const skillTarget = join(resolveScoped(runtime.skillsDir[scope], dirs), SKILL_FOLDER);
  for (const rel of filesBelow(skillSource).sort()) {
    const target = join(skillTarget, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(skillSource, rel), target);
    files.push(target);
  }
  if (runtime.agentsDir) {
    const agentsTarget = resolveScoped(runtime.agentsDir[scope], dirs);
    for (const { name, text } of generatedAgents(runtime, root)) {
      const target = join(agentsTarget, name);
      writeText(target, text);
      files.push(target);
    }
  }
  return { files, trust: runtime.trust };
}

/** The existing configuration without crew's entries: an event's list emptied is dropped, and so is an empty `hooks`. */
function stripHooks(existing: unknown, isCrew: (entry: unknown) => boolean): unknown {
  if (!isRecord(existing)) return existing;
  const hooks: Rec = {};
  for (const [event, list] of Object.entries(isRecord(existing.hooks) ? existing.hooks : {})) {
    const kept = Array.isArray(list) ? list.filter((e) => !isCrew(e)) : list;
    if (!Array.isArray(kept) || kept.length) hooks[event] = kept;
  }
  const { hooks: _hooks, ...rest } = existing;
  return Object.keys(hooks).length ? { ...rest, hooks } : rest;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/**
 * The rollback of `installRuntime` (judgement round 2): crew's entries stripped from the merged
 * configuration (every foreign entry and every other key kept; a file crew alone filled, or the
 * plugin file crew writes whole, deleted), `crew-method/` removed, the agents under crew's names
 * removed and the user's own kept. Returns every path rewritten and removed, in that order.
 */
export function removeRuntime(
  runtime: Runtime,
  scope: Scope,
  dirs: InstallDirs,
): { rewritten: string[]; removed: string[] } | { refused: string } {
  const rewritten: string[] = [];
  const removed: string[] = [];
  const configPath = resolveScoped(
    scope === "project" ? runtime.config.project : runtime.config.user,
    dirs,
  );
  const strip = runtime.config.strip;
  if (existsSync(configPath)) {
    if (strip === null) {
      rmSync(configPath);
      removed.push(configPath);
    } else {
      let existing: unknown;
      try {
        existing = JSON.parse(readFileSync(configPath, "utf8"));
      } catch {
        return { refused: `${configPath} is not JSON: fix or move it first` };
      }
      const stripped = strip(existing);
      if (!same(stripped, existing)) {
        // What crew alone would have left behind is nothing of the user's: the file goes.
        const bare = strip(runtime.config.merge(null, runtime.config.entries("/")));
        if (same(stripped, bare)) {
          rmSync(configPath);
          removed.push(configPath);
        } else {
          writeText(configPath, `${JSON.stringify(stripped, null, 2)}\n`);
          rewritten.push(configPath);
        }
      }
    }
  }
  const skillTarget = join(resolveScoped(runtime.skillsDir[scope], dirs), SKILL_FOLDER);
  if (existsSync(skillTarget)) {
    rmSync(skillTarget, { recursive: true, force: true });
    removed.push(skillTarget);
  }
  if (runtime.agentsDir) {
    const agentsTarget = resolveScoped(runtime.agentsDir[scope], dirs);
    if (existsSync(agentsTarget))
      for (const name of readdirSync(agentsTarget)
        .filter((f) => f.startsWith("crew-"))
        .sort()) {
        rmSync(join(agentsTarget, name), { force: true });
        removed.push(join(agentsTarget, name));
      }
  }
  return { rewritten, removed };
}

const ROOT_IN_COMMAND = /node (\S+)\/dist\/crew\.mjs hook\b/;
const ROOT_IN_PLUGIN = /const ROOT = "((?:[^"\\]|\\.)*)";/;
/** The plugin root a configuration's crew command names, or null when it holds none. */
function rootOf(text: string, runtime: Runtime, fallback: string): string | null {
  if (runtime.name === "claude") return text.includes("crew.mjs") ? fallback : null;
  if (runtime.name === "opencode") {
    const match = ROOT_IN_PLUGIN.exec(text);
    return match ? JSON.parse(`"${match[1]}"`) : null;
  }
  const match = ROOT_IN_COMMAND.exec(text);
  return match ? (match[1] ?? null) : null;
}
const hasKey = (value: unknown, keys: readonly string[]): boolean => {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((k) => keys.includes(k))) return true;
  return Object.values(value).some((v) => hasKey(v, keys));
};
const SAMPLE_ANSWERS: Record<EngineEvent, HookResponse> = {
  "session-start": {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "C" },
  },
  prompt: { hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "C" } },
  "pre-tool-use": {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "R",
    },
  },
  "post-tool-use": { hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "C" } },
  stop: { decision: "block", reason: "B" },
  "subagent-stop": { systemMessage: "S" },
};
const tierOf = (runtime: Runtime, what: GuaranteeName) =>
  runtime.guarantees.find((g) => g.what === what)?.tier ?? "requested";
/** One event through the adapter on its sample: `ok`, or `failed (<why>)`. */
function eventResult(runtime: Runtime, event: EngineEvent): string {
  const runtimeEvent = runtime.events[event];
  if (runtimeEvent === null) return `${event}: none`;
  try {
    const payload = runtime.readPayload(event, runtime.samples[event], "/");
    if (typeof payload.cwd !== "string") return `${event}: ${runtimeEvent} failed (no cwd read)`;
    const written = runtime.writeResponse(event, SAMPLE_ANSWERS[event]);
    const answer = JSON.parse(written.stdout);
    const expects =
      event === "pre-tool-use"
        ? ["permission", "decision", "permissionDecision"]
        : event === "session-start" && tierOf(runtime, "context at start") === "enforced"
          ? ["additional_context", "additionalContext"]
          : event === "prompt" && tierOf(runtime, "the status line per prompt") === "enforced"
            ? ["additional_context", "additionalContext"]
            : event === "stop" && tierOf(runtime, "the hold at Stop") === "enforced"
              ? ["followup_message", "decision"]
              : null;
    if (expects && !hasKey(answer, expects))
      return `${event}: ${runtimeEvent} failed (the answer has none of ${expects.join(", ")})`;
    return `${event}: ${runtimeEvent} ok`;
  } catch (error) {
    return `${event}: ${runtimeEvent} failed (${(error as Error).message})`;
  }
}
/** The copy against its source: `ok`, `missing`, or `stale (<n> files differ)`. */
function copyState(
  expected: Map<string, string>,
  actualDir: string,
  actual: (path: string) => string | null,
): string {
  if (!existsSync(actualDir)) return "missing";
  let differ = 0;
  for (const [rel, hash] of expected) if (actual(join(actualDir, rel)) !== hash) differ++;
  return differ ? `stale (${differ} files differ)` : "ok";
}

/**
 * Reads the configuration back (project scope then user when none is named), names the root its
 * crew command points at and whether it holds the bundle, runs every event through the adapter on
 * its sample, compares the skill copy and the agents by sha256 against the root's sources, and
 * prints the guarantee table; `ok` is false on a missing or foreign configuration, a gone root, a
 * failed event or a stale copy.
 */
export function checkRuntime(
  runtime: Runtime,
  scope: Scope | null,
  dirs: InstallDirs,
  fallbackRoot: string,
): { lines: string[]; ok: boolean } {
  const lines: string[] = [];
  const candidates: [Scope, string][] =
    runtime.name === "claude"
      ? [["project", join(fallbackRoot, "hooks", "hooks.json")]]
      : scope
        ? [
            [
              scope,
              resolveScoped(
                scope === "project" ? runtime.config.project : runtime.config.user,
                dirs,
              ),
            ],
          ]
        : [
            ["project", resolveScoped(runtime.config.project, dirs)],
            ["user", resolveScoped(runtime.config.user, dirs)],
          ];
  const found = candidates.find(([, path]) => existsSync(path));
  if (!found) return { lines: [`missing: ${candidates.map(([, p]) => p).join(" | ")}`], ok: false };
  const [foundScope, configPath] = found;
  const text = readFileSync(configPath, "utf8");
  const root = rootOf(text, runtime, fallbackRoot);
  if (!root) return { lines: [`config: ${configPath} holds no crew hook`], ok: false };
  lines.push(`config: ${configPath}`);
  let ok = true;
  if (!existsSync(join(root, "dist", "crew.mjs"))) {
    lines.push(`root: ${root} missing dist/crew.mjs`);
    return { lines, ok: false };
  }
  lines.push(`root: ${root} ok`);
  for (const event of ENGINE_EVENTS) {
    const line = eventResult(runtime, event);
    if (line.includes(" failed (")) ok = false;
    lines.push(line);
  }
  if (runtime.name === "claude") {
    lines.push("skill: ok", "agents: ok");
  } else {
    const skillSource = join(root, "skills", "crew");
    const skillHashes = new Map(
      filesBelow(skillSource).map((rel) => [rel, sha256(join(skillSource, rel))]),
    );
    const skillCopy = join(resolveScoped(runtime.skillsDir[foundScope], dirs), SKILL_FOLDER);
    const skill = copyState(skillHashes, skillCopy, (p) => (existsSync(p) ? sha256(p) : null));
    lines.push(`skill: ${skill}`);
    if (skill !== "ok") ok = false;
    // The installed page as a strict YAML loader reads it (finding 121): a copy equal to its source
    // is still dropped by the runtime when its front matter holds a plain scalar YAML reads
    // otherwise. Every problem is named (finding 128); a missing page is the skill line's to say.
    const installedPage = join(skillCopy, "SKILL.md");
    if (existsSync(installedPage)) {
      const pageProblems = frontMatterProblems(readFileSync(installedPage, "utf8"));
      lines.push(
        `skill front matter: ${pageProblems.length ? `SKILL.md ${pageProblems.join("; ")}` : "ok"}`,
      );
      if (pageProblems.length) ok = false;
    }
    if (runtime.agentsDir) {
      const expected = new Map(
        generatedAgents(runtime, root).map(({ name, text: t }) => [name, hashOf(t)]),
      );
      const agents = copyState(expected, resolveScoped(runtime.agentsDir[foundScope], dirs), (p) =>
        existsSync(p) ? sha256(p) : null,
      );
      lines.push(`agents: ${agents}`);
      if (agents !== "ok") ok = false;
    }
  }
  lines.push(...guaranteeLines(runtime));
  if (runtime.trust) lines.push(`trust: ${runtime.trust}`);
  return { lines, ok };
}
