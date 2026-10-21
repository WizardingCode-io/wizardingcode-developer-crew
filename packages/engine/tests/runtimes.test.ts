import { expect, test } from "bun:test";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { HookPayload, HookResponse } from "../src/hooks/types.ts";
import { opencodePlugin } from "../src/runtimes/opencode-plugin.ts";
import {
  ENGINE_EVENTS,
  type EngineEvent,
  type Guarantee,
  guaranteeLines,
  patchPaths,
  RUNTIME_NAMES,
  RUNTIMES,
  type RuntimeName,
  readAgentPage,
  runtimeOf,
} from "../src/runtimes.ts";
import { tempDir } from "./helpers.ts";

// SP6 Task 4: the runtime adapters over the recorded payloads (AC-1, AC-4, AC-8's unit rows).

const FIXTURES = fileURLToPath(new URL("./fixtures/runtimes/", import.meta.url));
const PREFIX = "wizardingcode-developer-crew:";
const fixture = (runtime: RuntimeName, name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURES, runtime, `${name}.json`), "utf8"));
const read = (
  runtime: RuntimeName,
  event: EngineEvent,
  name: string = event,
  cwd = "/cwd",
): HookPayload => RUNTIMES[runtime].readPayload(event, fixture(runtime, name), cwd);
const written = (runtime: RuntimeName, event: EngineEvent, response: HookResponse) =>
  RUNTIMES[runtime].writeResponse(event, response);

const DENY: HookResponse = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "R",
  },
};
const ASK: HookResponse = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "ask",
    permissionDecisionReason: "R",
  },
};
const context = (hookEventName: string): HookResponse => ({
  hookSpecificOutput: { hookEventName, additionalContext: "C" },
});
const BLOCK: HookResponse = { decision: "block", reason: "B" };
const SYS: HookResponse = { systemMessage: "S" };
const DENY_SYS: HookResponse = { ...DENY, systemMessage: "S" };

test("SP6-T4 AC-1: the table names six runtimes in order, their events by the engine's names, and runtimeOf knows them alone", () => {
  expect(RUNTIME_NAMES).toEqual(["claude", "codex", "cursor", "copilot", "gemini", "opencode"]);
  expect(ENGINE_EVENTS).toEqual([
    "session-start",
    "prompt",
    "pre-tool-use",
    "post-tool-use",
    "stop",
    "subagent-stop",
  ]);
  const events = Object.fromEntries(RUNTIME_NAMES.map((n) => [n, RUNTIMES[n].events]));
  expect(events).toEqual({
    claude: {
      "session-start": "SessionStart",
      prompt: "UserPromptSubmit",
      "pre-tool-use": "PreToolUse",
      "post-tool-use": "PostToolUse",
      stop: "Stop",
      "subagent-stop": "SubagentStop",
    },
    codex: {
      "session-start": "SessionStart",
      prompt: "UserPromptSubmit",
      "pre-tool-use": "PreToolUse",
      "post-tool-use": "PostToolUse",
      stop: "Stop",
      "subagent-stop": "SubagentStop",
    },
    cursor: {
      "session-start": "sessionStart",
      prompt: "beforeSubmitPrompt",
      "pre-tool-use": "preToolUse",
      "post-tool-use": "postToolUse",
      stop: "stop",
      "subagent-stop": "subagentStop",
    },
    copilot: {
      "session-start": "SessionStart",
      prompt: "UserPromptSubmit",
      "pre-tool-use": "PreToolUse",
      "post-tool-use": "PostToolUse",
      stop: "Stop",
      "subagent-stop": "SubagentStop",
    },
    gemini: {
      "session-start": "SessionStart",
      prompt: "BeforeAgent",
      "pre-tool-use": "BeforeTool",
      "post-tool-use": "AfterTool",
      stop: "AfterAgent",
      "subagent-stop": null,
    },
    opencode: {
      "session-start": "session.created",
      prompt: null,
      "pre-tool-use": "tool.execute.before",
      "post-tool-use": "tool.execute.after",
      stop: null,
      "subagent-stop": null,
    },
  });
  expect(runtimeOf("cursor")?.name).toBe("cursor");
  expect(runtimeOf("antigravity")).toBeNull();
  expect(runtimeOf("")).toBeNull();
  // The samples check runs on are the fixtures, byte for byte as JSON.
  for (const runtime of RUNTIME_NAMES)
    for (const event of ENGINE_EVENTS) {
      if (RUNTIMES[runtime].events[event] === null) {
        expect(RUNTIMES[runtime].samples[event], `${runtime} ${event}`).toBeUndefined();
        continue;
      }
      expect(RUNTIMES[runtime].samples[event], `${runtime} ${event}`).toEqual(
        fixture(runtime, event),
      );
    }
  // Every fixture file is a sample or a short payload of its runtime.
  for (const runtime of RUNTIME_NAMES)
    for (const file of readdirSync(join(FIXTURES, runtime))) {
      const event = file.replace(/\.json$/, "").replace(/\.short-.*$/, "") as EngineEvent;
      expect(ENGINE_EVENTS, `${runtime}/${file}`).toContain(event);
      expect(RUNTIMES[runtime].events[event], `${runtime}/${file}`).not.toBeNull();
    }
});

test("SP6-T4 AC-1: the tool maps", () => {
  expect(RUNTIMES.claude.tools).toEqual({});
  expect(RUNTIMES.codex.tools).toEqual({ apply_patch: "Write" });
  expect(RUNTIMES.cursor.tools).toEqual({
    Shell: "Bash",
    Write: "Write",
    Delete: "Write",
    Read: "Read",
    Task: "Agent",
  });
  expect(RUNTIMES.gemini.tools).toEqual({
    run_shell_command: "Bash",
    write_file: "Write",
    replace: "Edit",
  });
  expect(RUNTIMES.copilot.tools).toEqual({
    bash: "Bash",
    powershell: "Bash",
    create: "Write",
    edit: "Edit",
    str_replace_editor: "Edit",
    apply_patch: "Edit",
    view: "Read",
    task: "Agent",
  });
  expect(RUNTIMES.opencode.tools).toEqual({
    bash: "Bash",
    write: "Write",
    edit: "Edit",
    apply_patch: "Write",
  });
});

test("SP6-T4 AC-1: the patch parser names every path a hunk names, absolute against the cwd", () => {
  const patch =
    "*** Begin Patch\n*** Update File: src/a.ts\n*** Move to: src/b.ts\n@@\n-x\n+y\n*** Add File: ../docs/new.md\n+# new\n*** Delete File: /abs/old.txt\n*** End Patch\n";
  expect(patchPaths(patch, "/repo/pkg")).toEqual([
    "/repo/pkg/src/a.ts",
    "/repo/pkg/src/b.ts",
    "/repo/docs/new.md",
    "/abs/old.txt",
  ]);
  expect(patchPaths("*** Begin Patch\n*** End Patch\n", "/repo")).toEqual([]);
  expect(patchPaths("not a patch", "/repo")).toEqual([]);
});

test("SP6-T4 AC-1: the readers (claude and codex)", () => {
  for (const event of ENGINE_EVENTS) {
    expect(read("claude", event)).toEqual(fixture("claude", event));
    if (event !== "subagent-stop") expect(read("codex", event)).toEqual(fixture("codex", event));
  }
  // Codex: a generated agent's name becomes the engine's prefixed role.
  expect(read("codex", "subagent-stop")).toEqual({
    ...fixture("codex", "subagent-stop"),
    agent_type: `${PREFIX}review-security`,
  });
  // A patch is a Write on every path it names, relative paths made absolute against the payload's cwd.
  const patched = read("codex", "pre-tool-use", "pre-tool-use.short-apply-patch");
  expect(patched.tool_name).toBe("Write");
  expect(patched.tool_input).toEqual({
    file_path: "/repo/pkg/src/a.ts",
    paths: ["/repo/pkg/src/a.ts", "/repo/docs/new.md"],
  });
  expect(patched.cwd).toBe("/repo/pkg");
  // A patch with no hunk: a Write the engine allows.
  const empty = read("codex", "pre-tool-use", "pre-tool-use.short-apply-patch-empty");
  expect(empty.tool_name).toBe("Write");
  expect(empty.tool_input).toEqual({});
  // A payload without cwd takes the command's.
  expect(RUNTIMES.codex.readPayload("prompt", { session_id: "s" }, "/here").cwd).toBe("/here");
  // Garbage never throws.
  expect(RUNTIMES.codex.readPayload("stop", null, "/here")).toEqual({ cwd: "/here" });
  expect(RUNTIMES.claude.readPayload("stop", "x", "/here")).toEqual({ cwd: "/here" });
});

test("SP6-T4 AC-1: the Cursor reader", () => {
  expect(read("cursor", "session-start")).toEqual({
    session_id: "c1",
    cwd: "/repo",
    hook_event_name: "sessionStart",
  });
  expect(read("cursor", "prompt")).toEqual({
    session_id: "c1",
    cwd: "/repo",
    hook_event_name: "beforeSubmitPrompt",
    prompt: "Fix the cart total",
  });
  expect(read("cursor", "pre-tool-use")).toEqual({
    session_id: "c1",
    cwd: "/repo",
    hook_event_name: "preToolUse",
    tool_name: "Bash",
    tool_input: { command: "npm install", working_directory: "/repo" },
  });
  expect(read("cursor", "post-tool-use")).toEqual({
    session_id: "c1",
    cwd: "/repo",
    hook_event_name: "postToolUse",
    tool_name: "Bash",
    tool_input: { command: "ls", working_directory: "/repo" },
  });
  expect(read("cursor", "stop")).toEqual({
    session_id: "c1",
    cwd: "/repo",
    hook_event_name: "stop",
    stop_hook_active: false,
  });
  expect(read("cursor", "subagent-stop")).toEqual({
    session_id: "c1",
    cwd: "/repo",
    hook_event_name: "subagentStop",
    agent_type: `${PREFIX}review-security`,
    agent_transcript_path: "/tmp/sub-c1.txt",
    last_assistant_message: fixture("cursor", "subagent-stop").summary as string,
  });
  // A short payload: no roots and no cwd, the command's cwd; Write and Delete take the path the reader tries.
  expect(read("cursor", "pre-tool-use", "pre-tool-use.short-no-roots", "/here")).toEqual({
    session_id: "c1",
    cwd: "/here",
    hook_event_name: "preToolUse",
    tool_name: "Bash",
    tool_input: { command: "npm test" },
  });
  const write = RUNTIMES.cursor.readPayload(
    "pre-tool-use",
    { conversation_id: "c1", cwd: "/repo", tool_name: "Delete", tool_input: { path: "a.txt" } },
    "/x",
  );
  expect(write.tool_name).toBe("Write");
  expect(write.tool_input).toEqual({ path: "a.txt", file_path: "/repo/a.txt" });
  const camel = RUNTIMES.cursor.readPayload(
    "pre-tool-use",
    { conversation_id: "c1", cwd: "/repo", tool_name: "Write", tool_input: { filePath: "b.txt" } },
    "/x",
  );
  expect(camel.tool_input).toEqual({ filePath: "b.txt", file_path: "/repo/b.txt" });
  // Task is the Agent tool; a tool outside the map keeps its name; a subagent type outside the registry is not a role.
  expect(
    RUNTIMES.cursor.readPayload("pre-tool-use", { tool_name: "Task", tool_input: {} }, "/x")
      .tool_name,
  ).toBe("Agent");
  expect(
    RUNTIMES.cursor.readPayload("pre-tool-use", { tool_name: "Grep", tool_input: {} }, "/x")
      .tool_name,
  ).toBe("Grep");
  expect(
    RUNTIMES.cursor.readPayload("subagent-stop", { subagent_type: "my-helper" }, "/x").agent_type,
  ).toBe("my-helper");
});

test("SP6-T4 AC-1: the Gemini reader", () => {
  expect(read("gemini", "session-start")).toEqual({
    session_id: "s1",
    cwd: "/repo",
    hook_event_name: "SessionStart",
    source: "startup",
  });
  expect(read("gemini", "prompt")).toEqual({
    session_id: "s1",
    cwd: "/repo",
    hook_event_name: "BeforeAgent",
    prompt: "Fix the cart total",
  });
  expect(read("gemini", "pre-tool-use")).toEqual({
    session_id: "s1",
    cwd: "/repo",
    hook_event_name: "BeforeTool",
    tool_name: "Bash",
    tool_input: { command: "npm test", description: "Run the tests", dir_path: "/repo" },
  });
  expect(read("gemini", "post-tool-use")).toEqual({
    session_id: "s1",
    cwd: "/repo",
    hook_event_name: "AfterTool",
    tool_name: "Write",
    tool_input: { file_path: "/repo/src/a.ts", content: "export const x = 2;\n" },
  });
  expect(read("gemini", "stop")).toEqual({
    session_id: "s1",
    cwd: "/repo",
    hook_event_name: "AfterAgent",
    stop_hook_active: false,
    last_assistant_message: "Done.",
  });
  expect(read("gemini", "pre-tool-use", "pre-tool-use.short-unknown-tool")).toEqual({
    session_id: "s1",
    cwd: "/repo",
    hook_event_name: "BeforeTool",
    tool_name: "google_web_search",
    tool_input: { query: "laravel" },
  });
  const replaced = RUNTIMES.gemini.readPayload(
    "pre-tool-use",
    { tool_name: "replace", tool_input: { file_path: "a.ts", old_string: "x", new_string: "y" } },
    "/x",
  );
  expect(replaced.tool_name).toBe("Edit");
  expect(replaced.tool_input?.file_path).toBe("/x/a.ts");
});

test("SP6-T4 AC-1 (judgement round 2): every reader but Claude's makes a write's relative path absolute against the session's folder, as the patch paths are, so a path climbing out of a subfolder is judged where the runtime writes it", () => {
  const owned = "../.crew/policy.json";
  // Gemini: write_file from a subfolder of the repository.
  const gemini = RUNTIMES.gemini.readPayload(
    "pre-tool-use",
    {
      session_id: "s1",
      cwd: "/repo/app",
      hook_event_name: "BeforeTool",
      tool_name: "write_file",
      tool_input: { file_path: owned, content: "{}" },
    },
    "/elsewhere",
  );
  expect(gemini.tool_input).toEqual({ file_path: "/repo/.crew/policy.json", content: "{}" });
  // Cursor: Write and Delete by `path`, resolved against the first workspace root.
  const cursor = RUNTIMES.cursor.readPayload(
    "pre-tool-use",
    {
      conversation_id: "c1",
      workspace_roots: ["/repo/app"],
      hook_event_name: "preToolUse",
      tool_name: "Delete",
      tool_input: { path: owned },
    },
    "/elsewhere",
  );
  expect(cursor.tool_input).toEqual({ path: owned, file_path: "/repo/.crew/policy.json" });
  // Copilot: `filePath`, a JSON string and a plain string.
  const copilot = (toolInput: unknown) =>
    RUNTIMES.copilot.readPayload(
      "pre-tool-use",
      {
        session_id: "s1",
        cwd: "/repo/app",
        hook_event_name: "PreToolUse",
        tool_name: "create",
        tool_input: toolInput,
      },
      "/elsewhere",
    ).tool_input;
  expect(copilot({ filePath: owned })?.file_path).toBe("/repo/.crew/policy.json");
  expect(copilot(JSON.stringify({ filePath: owned }))?.file_path).toBe("/repo/.crew/policy.json");
  expect(copilot(owned)?.file_path).toBe("/repo/.crew/policy.json");
  // OpenCode: `filePath` on the plugin's wire shape.
  expect(
    RUNTIMES.opencode.readPayload(
      "pre-tool-use",
      { session_id: "s1", cwd: "/repo/app", tool_name: "write", tool_input: { filePath: owned } },
      "/elsewhere",
    ).tool_input?.file_path,
  ).toBe("/repo/.crew/policy.json");
  // An absolute path stays; Claude's is never touched.
  expect(copilot({ filePath: "/abs/x.ts" })?.file_path).toBe("/abs/x.ts");
  expect(
    RUNTIMES.claude.readPayload(
      "pre-tool-use",
      { cwd: "/repo/app", tool_name: "Write", tool_input: { file_path: "x.ts" } },
      "/elsewhere",
    ).tool_input,
  ).toEqual({ file_path: "x.ts" });
});

test("SP6-T4 AC-1: the Copilot reader", () => {
  expect(read("copilot", "session-start")).toEqual({
    session_id: "s1",
    cwd: "/repo",
    hook_event_name: "SessionStart",
    source: "startup",
  });
  expect(read("copilot", "prompt")).toEqual({
    session_id: "s1",
    cwd: "/repo",
    hook_event_name: "UserPromptSubmit",
    prompt: "Fix the cart total",
  });
  expect(read("copilot", "pre-tool-use")).toEqual({
    session_id: "s1",
    cwd: "/repo",
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: "npm test" },
  });
  expect(read("copilot", "stop")).toEqual({
    session_id: "s1",
    cwd: "/repo",
    hook_event_name: "Stop",
    stop_hook_active: false,
  });
  expect(read("copilot", "subagent-stop")).toEqual({
    session_id: "s1",
    cwd: "/repo",
    hook_event_name: "SubagentStop",
    agent_id: "a1",
    agent_type: `${PREFIX}review-security`,
    agent_transcript_path: "/tmp/sub-a1.json",
    last_assistant_message: fixture("copilot", "subagent-stop").response as string,
  });
  // The native names, case-insensitively; a JSON string parsed; a plain string read as the command or the path.
  expect(read("copilot", "pre-tool-use", "pre-tool-use.short-json-string").tool_input).toEqual({
    command: "npm test",
  });
  const plain = read("copilot", "pre-tool-use", "pre-tool-use.short-plain-string");
  expect(plain.tool_name).toBe("Write");
  expect(plain.tool_input).toEqual({ file_path: "/repo/src/new.ts" });
  const at = (tool_name: string, tool_input: unknown) =>
    RUNTIMES.copilot.readPayload("pre-tool-use", { cwd: "/repo", tool_name, tool_input }, "/x");
  expect(at("powershell", { command: "Get-ChildItem" })).toEqual({
    cwd: "/repo",
    tool_name: "Bash",
    tool_input: { command: "Get-ChildItem", shell: "powershell" },
  });
  expect(at("EDIT", { path: "a.ts" }).tool_name).toBe("Edit");
  expect(at("EDIT", { path: "a.ts" }).tool_input).toEqual({
    path: "a.ts",
    file_path: "/repo/a.ts",
  });
  expect(at("str_replace_editor", {}).tool_name).toBe("Edit");
  expect(at("apply_patch", {}).tool_name).toBe("Edit");
  expect(at("view", {}).tool_name).toBe("Read");
  expect(at("task", {}).tool_name).toBe("Agent");
  expect(at("Write", { file_path: "a" }).tool_name).toBe("Write");
  // Patch text in an Edit, as a string or in a field: every path, absolute against the cwd.
  const patch = "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-x\n+y\n*** End Patch\n";
  expect(at("Edit", patch).tool_input).toEqual({
    file_path: "/repo/src/a.ts",
    paths: ["/repo/src/a.ts"],
  });
  expect(at("apply_patch", { input: patch }).tool_input).toEqual({
    input: patch,
    file_path: "/repo/src/a.ts",
    paths: ["/repo/src/a.ts"],
  });
  // The agent name first, the type as the fallback; an unknown name is no role.
  expect(
    RUNTIMES.copilot.readPayload("subagent-stop", { agent_type: "crew-judge" }, "/x").agent_type,
  ).toBe(`${PREFIX}judge`);
  expect(
    RUNTIMES.copilot.readPayload(
      "subagent-stop",
      { agent_name: "helper", agent_type: "custom" },
      "/x",
    ).agent_type,
  ).toBe("helper");
});

test("SP6-T4 AC-1: the OpenCode reader (the plugin's own wire shape)", () => {
  expect(read("opencode", "session-start")).toEqual({ session_id: "ses_01", cwd: "/repo" });
  expect(read("opencode", "pre-tool-use")).toEqual({
    session_id: "ses_01",
    cwd: "/repo",
    tool_name: "Bash",
    tool_input: { command: "npm test", description: "Run the tests" },
  });
  const at = (tool_name: string, tool_input: unknown) =>
    RUNTIMES.opencode.readPayload("pre-tool-use", { cwd: "/repo", tool_name, tool_input }, "/x");
  expect(at("write", { filePath: "a.ts", content: "x" })).toEqual({
    cwd: "/repo",
    tool_name: "Write",
    tool_input: { filePath: "a.ts", content: "x", file_path: "/repo/a.ts" },
  });
  expect(at("edit", { filePath: "a.ts", oldString: "x", newString: "y" }).tool_name).toBe("Edit");
  const patch = "*** Begin Patch\n*** Delete File: old.txt\n*** End Patch\n";
  expect(at("apply_patch", { patchText: patch })).toEqual({
    cwd: "/repo",
    tool_name: "Write",
    tool_input: { patchText: patch, file_path: "/repo/old.txt", paths: ["/repo/old.txt"] },
  });
  expect(at("read", { filePath: "a.ts" }).tool_name).toBe("read");
});

test("SP6-T4 AC-1: the writers per runtime and event, with the exit code and the dropped message", () => {
  const w = (runtime: RuntimeName, event: EngineEvent, response: HookResponse) => {
    const out = written(runtime, event, response);
    expect(out.exitCode, `${runtime} ${event}`).toBe(0);
    return { out: JSON.parse(out.stdout), dropped: out.dropped };
  };
  // Claude: the engine's JSON as it is.
  expect(w("claude", "pre-tool-use", ASK)).toEqual({ out: ASK, dropped: null });
  expect(w("claude", "stop", SYS)).toEqual({ out: SYS, dropped: null });
  // Codex: the same JSON, an ask turned into a deny with the reason kept.
  expect(w("codex", "pre-tool-use", DENY)).toEqual({ out: DENY, dropped: null });
  expect(w("codex", "pre-tool-use", ASK)).toEqual({ out: DENY, dropped: null });
  expect(w("codex", "pre-tool-use", DENY_SYS)).toEqual({ out: DENY_SYS, dropped: null });
  expect(w("codex", "session-start", context("SessionStart"))).toEqual({
    out: context("SessionStart"),
    dropped: null,
  });
  expect(w("codex", "stop", BLOCK)).toEqual({ out: BLOCK, dropped: null });
  expect(w("codex", "stop", SYS)).toEqual({ out: SYS, dropped: null });
  expect(w("codex", "subagent-stop", SYS)).toEqual({ out: SYS, dropped: null });
  // Cursor.
  expect(w("cursor", "pre-tool-use", DENY)).toEqual({
    out: { permission: "deny", agent_message: "R" },
    dropped: null,
  });
  expect(w("cursor", "pre-tool-use", ASK)).toEqual({
    out: { permission: "deny", agent_message: "R" },
    dropped: null,
  });
  expect(w("cursor", "pre-tool-use", DENY_SYS)).toEqual({
    out: { permission: "deny", agent_message: "R", user_message: "S" },
    dropped: null,
  });
  expect(w("cursor", "session-start", context("SessionStart"))).toEqual({
    out: { additional_context: "C" },
    dropped: null,
  });
  expect(w("cursor", "prompt", context("UserPromptSubmit"))).toEqual({
    out: {},
    dropped: null,
  });
  expect(w("cursor", "prompt", { ...context("UserPromptSubmit"), systemMessage: "S" })).toEqual({
    out: { user_message: "S" },
    dropped: null,
  });
  expect(w("cursor", "post-tool-use", context("PostToolUse"))).toEqual({
    out: { additional_context: "C" },
    dropped: null,
  });
  expect(w("cursor", "stop", BLOCK)).toEqual({ out: { followup_message: "B" }, dropped: null });
  expect(w("cursor", "stop", SYS)).toEqual({ out: {}, dropped: "S" });
  expect(w("cursor", "subagent-stop", SYS)).toEqual({ out: {}, dropped: "S" });
  // Gemini.
  expect(w("gemini", "pre-tool-use", DENY)).toEqual({
    out: { decision: "deny", reason: "R" },
    dropped: null,
  });
  expect(w("gemini", "pre-tool-use", ASK)).toEqual({
    out: { decision: "deny", reason: "R" },
    dropped: null,
  });
  expect(w("gemini", "pre-tool-use", DENY_SYS)).toEqual({
    out: { decision: "deny", reason: "R", systemMessage: "S" },
    dropped: null,
  });
  expect(w("gemini", "session-start", context("SessionStart"))).toEqual({
    out: { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "C" } },
    dropped: null,
  });
  expect(w("gemini", "prompt", context("UserPromptSubmit"))).toEqual({
    out: { hookSpecificOutput: { hookEventName: "BeforeAgent", additionalContext: "C" } },
    dropped: null,
  });
  expect(w("gemini", "post-tool-use", context("PostToolUse"))).toEqual({
    out: { hookSpecificOutput: { hookEventName: "AfterTool", additionalContext: "C" } },
    dropped: null,
  });
  expect(w("gemini", "stop", BLOCK)).toEqual({
    out: { decision: "deny", reason: "B" },
    dropped: null,
  });
  expect(w("gemini", "stop", { ...BLOCK, systemMessage: "S" })).toEqual({
    out: { decision: "deny", reason: "B", systemMessage: "S" },
    dropped: null,
  });
  expect(w("gemini", "stop", SYS)).toEqual({ out: { systemMessage: "S" }, dropped: null });
  // Copilot.
  expect(w("copilot", "pre-tool-use", DENY)).toEqual({
    out: { permissionDecision: "deny", permissionDecisionReason: "R" },
    dropped: null,
  });
  expect(w("copilot", "pre-tool-use", ASK)).toEqual({
    out: { permissionDecision: "deny", permissionDecisionReason: "R" },
    dropped: null,
  });
  expect(w("copilot", "pre-tool-use", DENY_SYS)).toEqual({
    out: { permissionDecision: "deny", permissionDecisionReason: "R" },
    dropped: "S",
  });
  expect(w("copilot", "session-start", context("SessionStart"))).toEqual({
    out: { additionalContext: "C" },
    dropped: null,
  });
  expect(w("copilot", "prompt", context("UserPromptSubmit"))).toEqual({ out: {}, dropped: null });
  expect(w("copilot", "post-tool-use", context("PostToolUse"))).toEqual({
    out: { additionalContext: "C" },
    dropped: null,
  });
  expect(w("copilot", "stop", BLOCK)).toEqual({ out: BLOCK, dropped: null });
  expect(w("copilot", "stop", SYS)).toEqual({ out: {}, dropped: "S" });
  expect(w("copilot", "subagent-stop", SYS)).toEqual({ out: {}, dropped: "S" });
  // OpenCode: the engine's JSON for the plugin, an ask a deny, a systemMessage dropped.
  expect(w("opencode", "pre-tool-use", DENY)).toEqual({ out: DENY, dropped: null });
  expect(w("opencode", "pre-tool-use", ASK)).toEqual({ out: DENY, dropped: null });
  expect(w("opencode", "pre-tool-use", DENY_SYS)).toEqual({ out: DENY, dropped: "S" });
  expect(w("opencode", "session-start", context("SessionStart"))).toEqual({
    out: context("SessionStart"),
    dropped: null,
  });
  // An empty answer is {} everywhere.
  for (const runtime of RUNTIME_NAMES)
    for (const event of ENGINE_EVENTS)
      expect(written(runtime, event, {}), `${runtime} ${event}`).toEqual({
        stdout: "{}",
        exitCode: 0,
        dropped: null,
      });
});

const GUARANTEES: Record<RuntimeName, Guarantee[]> = {
  claude: [
    { what: "context at start", tier: "enforced", why: null },
    { what: "the status line per prompt", tier: "enforced", why: null },
    { what: "the denial of engine files", tier: "enforced", why: null },
    { what: "the denial of forbidden commands", tier: "enforced", why: null },
    { what: "the hold at Stop", tier: "enforced", why: null },
    { what: "the roles' answers filed", tier: "enforced", why: null },
    { what: "the roles read-only", tier: "enforced", why: null },
  ],
  codex: [
    { what: "context at start", tier: "enforced", why: null },
    { what: "the status line per prompt", tier: "enforced", why: null },
    { what: "the denial of engine files", tier: "enforced", why: null },
    { what: "the denial of forbidden commands", tier: "enforced", why: null },
    { what: "the hold at Stop", tier: "enforced", why: null },
    {
      what: "the roles' answers filed",
      tier: "requested",
      why: "the page does not say that agent_type names a custom agent",
    },
    {
      what: "the roles read-only",
      tier: "requested",
      why: "no tools field is documented for a Codex agent",
    },
  ],
  cursor: [
    { what: "context at start", tier: "enforced", why: null },
    {
      what: "the status line per prompt",
      tier: "requested",
      why: "beforeSubmitPrompt carries no context field",
    },
    {
      what: "the denial of engine files",
      tier: "requested",
      why: "the Write and Delete path fields are not documented; Shell is denied",
    },
    { what: "the denial of forbidden commands", tier: "enforced", why: null },
    { what: "the hold at Stop", tier: "enforced", why: null },
    {
      what: "the roles' answers filed",
      tier: "requested",
      why: "subagentStop gives a summary, not the transcript's last message, and the transcript format is not documented",
    },
    { what: "the roles read-only", tier: "enforced", why: null },
  ],
  copilot: [
    { what: "context at start", tier: "enforced", why: null },
    {
      what: "the status line per prompt",
      tier: "requested",
      why: "UserPromptSubmit carries no context field",
    },
    {
      what: "the denial of engine files",
      tier: "requested",
      why: "the create, edit and apply_patch input fields are not documented; file_path, path and filePath are tried and patch text is parsed; bash is denied",
    },
    {
      what: "the denial of forbidden commands",
      tier: "requested",
      why: "the powershell tool's lines are read by text and rewritten for the POSIX reader, so a crew command built without the word crew on the line may pass, and a line that names the word outside a crew command, or a crew command with an unquoted comma list, is denied, since Copilot answers every ask of the engine as a deny; bash is enforced",
    },
    { what: "the hold at Stop", tier: "enforced", why: null },
    { what: "the roles' answers filed", tier: "enforced", why: null },
    { what: "the roles read-only", tier: "enforced", why: null },
  ],
  gemini: [
    { what: "context at start", tier: "enforced", why: null },
    { what: "the status line per prompt", tier: "enforced", why: null },
    { what: "the denial of engine files", tier: "enforced", why: null },
    { what: "the denial of forbidden commands", tier: "enforced", why: null },
    { what: "the hold at Stop", tier: "enforced", why: null },
    { what: "the roles' answers filed", tier: "requested", why: "no subagent event" },
    { what: "the roles read-only", tier: "enforced", why: null },
  ],
  opencode: [
    {
      what: "context at start",
      tier: "requested",
      why: "no context injection, and the session id field of session.created is not documented: the skill's first step runs crew status",
    },
    { what: "the status line per prompt", tier: "requested", why: "no prompt hook" },
    {
      what: "the denial of engine files",
      tier: "requested",
      why: "the write, edit and apply_patch argument names are not on an official page; filePath is tried",
    },
    { what: "the denial of forbidden commands", tier: "enforced", why: null },
    {
      what: "the hold at Stop",
      tier: "requested",
      why: "no stop hook: the record says the turn's end was not held",
    },
    { what: "the roles' answers filed", tier: "requested", why: "no subagent event" },
    { what: "the roles read-only", tier: "enforced", why: null },
  ],
};

test("SP6-T4 AC-3: the guarantee table per runtime, pinned whole, and its lines as check prints them; the trust steps", () => {
  for (const runtime of RUNTIME_NAMES)
    expect(RUNTIMES[runtime].guarantees, runtime).toEqual(GUARANTEES[runtime]);
  expect(guaranteeLines(RUNTIMES.cursor)).toEqual([
    "context at start: enforced",
    "the status line per prompt: requested (beforeSubmitPrompt carries no context field)",
    "the denial of engine files: requested (the Write and Delete path fields are not documented; Shell is denied)",
    "the denial of forbidden commands: enforced",
    "the hold at Stop: enforced",
    "the roles' answers filed: requested (subagentStop gives a summary, not the transcript's last message, and the transcript format is not documented)",
    "the roles read-only: enforced",
  ]);
  expect(RUNTIMES.codex.trust).toBe(
    "review and trust the hook in /hooks before it runs; a changed hook is skipped until trusted again",
  );
  expect(RUNTIMES.gemini.trust).toBe(
    "the first run warns about the new hook; a changed command is warned about again",
  );
  for (const name of ["claude", "cursor", "copilot", "opencode"] as const)
    expect(RUNTIMES[name].trust, name).toBeNull();
});

test("SP6-T4 AC-3: the config paths, the skills and agents folders", () => {
  const paths = Object.fromEntries(
    RUNTIME_NAMES.map((n) => [
      n,
      [
        RUNTIMES[n].config.project,
        RUNTIMES[n].config.user,
        RUNTIMES[n].skillsDir.project,
        RUNTIMES[n].skillsDir.user,
        RUNTIMES[n].agentsDir?.project ?? null,
        RUNTIMES[n].agentsDir?.user ?? null,
      ],
    ]),
  );
  expect(paths).toEqual({
    claude: [
      "hooks/hooks.json",
      "hooks/hooks.json",
      ".claude/skills",
      "~/.claude/skills",
      ".claude/agents",
      "~/.claude/agents",
    ],
    codex: [
      ".codex/hooks.json",
      "~/.codex/hooks.json",
      ".agents/skills",
      "~/.agents/skills",
      ".codex/agents",
      "~/.codex/agents",
    ],
    cursor: [
      ".cursor/hooks.json",
      "~/.cursor/hooks.json",
      ".agents/skills",
      "~/.agents/skills",
      ".cursor/agents",
      "~/.cursor/agents",
    ],
    copilot: [
      ".github/hooks/crew.json",
      "~/.copilot/hooks/crew.json",
      ".agents/skills",
      "~/.agents/skills",
      ".github/agents",
      "~/.copilot/agents",
    ],
    gemini: [
      ".gemini/settings.json",
      "~/.gemini/settings.json",
      ".agents/skills",
      "~/.agents/skills",
      ".gemini/agents",
      "~/.gemini/agents",
    ],
    opencode: [
      ".opencode/plugins/wizardingcode-crew.js",
      "~/.config/opencode/plugins/wizardingcode-crew.js",
      ".agents/skills",
      "~/.agents/skills",
      ".opencode/agents",
      "~/.config/opencode/agents",
    ],
  });
});

test("SP6-T4 AC-3: the config entries per runtime from a root, and the merge that keeps every foreign entry", () => {
  const root = "/opt/crew";
  const cmd = (event: EngineEvent, runtime: RuntimeName) =>
    `node ${root}/dist/crew.mjs hook ${event} --runtime ${runtime}`;
  // Codex: three levels, timeout in seconds, the matcher on the tool events.
  const codex = RUNTIMES.codex.config.entries(root) as { hooks: Record<string, unknown[]> };
  expect(Object.keys(codex.hooks)).toEqual([
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "Stop",
    "SubagentStop",
  ]);
  expect(codex.hooks.PreToolUse).toEqual([
    {
      matcher: "Bash|apply_patch|Write|Edit|Agent|spawn_agent",
      hooks: [{ type: "command", command: cmd("pre-tool-use", "codex"), timeout: 5 }],
    },
  ]);
  expect(codex.hooks.SessionStart).toEqual([
    { hooks: [{ type: "command", command: cmd("session-start", "codex"), timeout: 15 }] },
  ]);
  expect(codex.hooks.Stop).toEqual([
    { hooks: [{ type: "command", command: cmd("stop", "codex"), timeout: 10 }] },
  ]);
  // Cursor: version 1, a flat entry per event, loop_limit null on the holds.
  const cursor = RUNTIMES.cursor.config.entries(root) as {
    version: number;
    hooks: Record<string, unknown[]>;
  };
  expect(cursor.version).toBe(1);
  expect(cursor.hooks.preToolUse).toEqual([
    { command: cmd("pre-tool-use", "cursor"), timeout: 5, matcher: "Shell|Write|Delete|Task" },
  ]);
  expect(cursor.hooks.stop).toEqual([
    { command: cmd("stop", "cursor"), timeout: 10, loop_limit: null },
  ]);
  expect(cursor.hooks.subagentStop).toEqual([
    { command: cmd("subagent-stop", "cursor"), timeout: 10, loop_limit: null },
  ]);
  expect(cursor.hooks.beforeSubmitPrompt).toEqual([
    { command: cmd("prompt", "cursor"), timeout: 5 },
  ]);
  // Gemini: the hooks key, timeout in milliseconds, named entries, the matcher on the tool events.
  const gemini = RUNTIMES.gemini.config.entries(root) as { hooks: Record<string, unknown[]> };
  expect(Object.keys(gemini.hooks)).toEqual([
    "SessionStart",
    "BeforeAgent",
    "BeforeTool",
    "AfterTool",
    "AfterAgent",
  ]);
  expect(gemini.hooks.BeforeTool).toEqual([
    {
      matcher: "run_shell_command|write_file|replace",
      hooks: [
        {
          name: "wizardingcode-crew",
          type: "command",
          command: cmd("pre-tool-use", "gemini"),
          timeout: 5000,
        },
      ],
    },
  ]);
  expect(gemini.hooks.AfterAgent).toEqual([
    {
      hooks: [
        {
          name: "wizardingcode-crew",
          type: "command",
          command: cmd("stop", "gemini"),
          timeout: 10000,
        },
      ],
    },
  ]);
  // Copilot: version 1, PascalCase events, bash and timeoutSec.
  const copilot = RUNTIMES.copilot.config.entries(root) as {
    version: number;
    hooks: Record<string, unknown[]>;
  };
  expect(copilot.version).toBe(1);
  expect(Object.keys(copilot.hooks)).toEqual([
    "SessionStart",
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "Stop",
    "SubagentStop",
  ]);
  expect(copilot.hooks.PreToolUse).toEqual([
    { type: "command", bash: cmd("pre-tool-use", "copilot"), timeoutSec: 5 },
  ]);
  expect(copilot.hooks.Stop).toEqual([
    { type: "command", bash: cmd("stop", "copilot"), timeoutSec: 10 },
  ]);
  // OpenCode: the plugin text.
  expect(RUNTIMES.opencode.config.entries(root)).toBe(opencodePlugin(root));
  // The merge: a foreign entry kept in its place, crew's replaced, a reinstall identical, other keys kept.
  const mine = { matcher: "Bash", hooks: [{ type: "command", command: "./mine.sh", timeout: 5 }] };
  const stale = {
    hooks: [
      { type: "command", command: "node /old/dist/crew.mjs hook pre-tool-use --runtime codex" },
    ],
  };
  const merged = RUNTIMES.codex.config.merge(
    { description: "mine", hooks: { PreToolUse: [stale, mine], SessionEnd: [mine] } },
    codex,
  ) as { description: string; hooks: Record<string, unknown[]> };
  expect(merged.description).toBe("mine");
  expect(merged.hooks.SessionEnd).toEqual([mine]);
  expect(merged.hooks.PreToolUse).toEqual([mine, ...(codex.hooks.PreToolUse ?? [])]);
  expect(RUNTIMES.codex.config.merge(merged, codex)).toEqual(merged);
  const cursorMine = { command: "./audit.sh", loop_limit: 10 };
  const cursorMerged = RUNTIMES.cursor.config.merge(
    {
      version: 1,
      hooks: {
        stop: [cursorMine, { command: "node /old/dist/crew.mjs hook stop --runtime cursor" }],
      },
    },
    cursor,
  ) as { hooks: Record<string, unknown[]> };
  expect(cursorMerged.hooks.stop).toEqual([cursorMine, ...(cursor.hooks.stop ?? [])]);
  const geminiMerged = RUNTIMES.gemini.config.merge(
    { theme: "dark", hooks: { BeforeTool: [mine] } },
    gemini,
  ) as { theme: string; hooks: Record<string, unknown[]> };
  expect(geminiMerged.theme).toBe("dark");
  expect(geminiMerged.hooks.BeforeTool).toEqual([mine, ...(gemini.hooks.BeforeTool ?? [])]);
  const copilotMine = { type: "command", bash: "./mine.sh", timeoutSec: 30 };
  const copilotMerged = RUNTIMES.copilot.config.merge(
    { version: 1, hooks: { PreToolUse: [copilotMine] } },
    copilot,
  ) as { hooks: Record<string, unknown[]> };
  expect(copilotMerged.hooks.PreToolUse).toEqual([
    copilotMine,
    ...(copilot.hooks.PreToolUse ?? []),
  ]);
  // Nothing existing: the entries themselves.
  expect(RUNTIMES.codex.config.merge(null, codex)).toEqual(codex);
  expect(RUNTIMES.opencode.config.merge("old text", "new text")).toBe("new text");
});

test("SP6-T4 AC-3: the agent file per format, from the tech lead's page", () => {
  const pageText = readFileSync(
    fileURLToPath(new URL("../../../plugins/core/agents/tech-lead.md", import.meta.url)),
    "utf8",
  );
  const page = readAgentPage(pageText);
  expect(page.name).toBe("tech-lead");
  expect(page.tools).toEqual(["Read", "Grep", "Glob"]);
  expect(page.model).toBe("sonnet");
  expect(page.description.startsWith("A team's tech lead, read-only.")).toBe(true);
  expect(page.body.startsWith("# ")).toBe(true);
  expect(pageText.endsWith(page.body)).toBe(true);
  const desc = JSON.stringify(page.description);
  const codex = RUNTIMES.codex.agentFile(page);
  expect(codex?.name).toBe("crew-tech-lead.toml");
  expect(codex?.text).toBe(
    `name = "crew-tech-lead"\ndescription = ${desc}\ndeveloper_instructions = """\n${page.body.replace(/"""/g, '\\"\\"\\"')}"""\n`,
  );
  const cursor = RUNTIMES.cursor.agentFile(page);
  expect(cursor?.name).toBe("crew-tech-lead.md");
  expect(cursor?.text).toBe(
    `---\nname: crew-tech-lead\ndescription: ${desc}\nreadonly: true\n---\n\n${page.body}`,
  );
  expect(RUNTIMES.gemini.agentFile(page)).toEqual({
    name: "crew-tech-lead.md",
    text: `---\nname: crew-tech-lead\ndescription: ${desc}\ntools:\n  - read_file\n  - grep_search\n---\n\n${page.body}`,
  });
  expect(RUNTIMES.copilot.agentFile(page)).toEqual({
    name: "crew-tech-lead.agent.md",
    text: `---\nname: crew-tech-lead\ndescription: ${desc}\ntools: ["view", "grep", "glob"]\n---\n\n${page.body}`,
  });
  expect(RUNTIMES.opencode.agentFile(page)).toEqual({
    name: "crew-tech-lead.md",
    text: `---\ndescription: ${desc}\nmode: subagent\npermission:\n  edit: deny\n  write: deny\n  bash: deny\n  apply_patch: deny\n---\n\n${page.body}`,
  });
  expect(RUNTIMES.claude.agentFile(page)).toBeNull();
  // A page with a write tool is not read-only: no readonly, no tools list, no permission block.
  const writer = { ...page, name: "builder", tools: ["Read", "Write"] };
  expect(RUNTIMES.cursor.agentFile(writer)?.text).toBe(
    `---\nname: crew-builder\ndescription: ${desc}\n---\n\n${page.body}`,
  );
  expect(RUNTIMES.gemini.agentFile(writer)?.text).not.toContain("tools:");
  expect(RUNTIMES.copilot.agentFile(writer)?.text).not.toContain("tools:");
  expect(RUNTIMES.opencode.agentFile(writer)?.text).not.toContain("permission:");
});

test("SP6-T4 AC-4: the OpenCode plugin text runs crew hook through the injected $ with the mapped payload, throws the reason on deny or ask and returns on anything else", async () => {
  const root = "/opt/crew";
  const text = opencodePlugin(root);
  expect(text).toContain("export const WizardingCodeCrew");
  // The runtime is the row's name and nothing else can override it (judgement rounds 2 and 3).
  expect(text).toContain("export function makePlugin($, directory, root = ROOT) {");
  expect(text).not.toContain("runtime = RUNTIME");
  for (const hook of ["tool.execute.before", "tool.execute.after", "session.created"])
    expect(text).toContain(hook);
  const dir = tempDir("opencode-plugin-");
  const file = join(dir, "wizardingcode-crew.mjs");
  writeFileSync(file, text);
  const mod = (await import(pathToFileURL(file).href)) as {
    makePlugin: (
      $: unknown,
      directory: string,
      root: string,
    ) => Record<string, (...args: unknown[]) => Promise<unknown>>;
  };
  type Call = { command: string; stdin: string };
  const calls: Call[] = [];
  const stub = (stdout: string | Error) =>
    function $(strings: TemplateStringsArray, ...values: unknown[]) {
      const parts: string[] = [];
      let stdin = "";
      strings.raw.forEach((s, i) => {
        parts.push(s);
        const v = values[i];
        if (v instanceof Response) {
          parts.push("<stdin>");
          v.text().then((t) => {
            stdin = t;
          });
        } else if (v !== undefined) parts.push(String(v));
      });
      const call: Call = { command: parts.join(""), stdin: "" };
      calls.push(call);
      const promise = Promise.resolve().then(async () => {
        await new Promise((r) => setTimeout(r, 0));
        call.stdin = stdin;
      });
      return {
        quiet() {
          return this;
        },
        async text() {
          await promise;
          if (stdout instanceof Error) throw stdout;
          return stdout;
        },
      };
    };
  const deny = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "Crew: no",
    },
  });
  const input = { tool: "bash", sessionID: "ses_01", callID: "c1" };
  const output = { args: { command: "rm -rf x" } };
  const denying = mod.makePlugin(stub(deny), "/work/dir", root);
  const before = denying["tool.execute.before"] as (i: unknown, o: unknown) => Promise<unknown>;
  await expect(before(input, output)).rejects.toThrow("Crew: no");
  expect(calls[0]?.command).toBe(
    `node ${root}/dist/crew.mjs hook pre-tool-use --runtime opencode < <stdin>`,
  );
  expect(JSON.parse(calls[0]?.stdin ?? "{}")).toEqual({
    session_id: "ses_01",
    cwd: "/work/dir",
    tool_name: "bash",
    tool_input: { command: "rm -rf x" },
  });
  const ask = deny.replace('"deny"', '"ask"');
  const asking = mod.makePlugin(stub(ask), "/work/dir", root);
  await expect(
    (asking["tool.execute.before"] as (i: unknown, o: unknown) => Promise<unknown>)(input, output),
  ).rejects.toThrow("Crew: no");
  const allowing = mod.makePlugin(stub("{}"), "/work/dir", root);
  await expect(
    (allowing["tool.execute.before"] as (i: unknown, o: unknown) => Promise<unknown>)(
      input,
      output,
    ),
  ).resolves.toBeUndefined();
  const broken = mod.makePlugin(stub(new Error("spawn failed")), "/work/dir", root);
  await expect(
    (broken["tool.execute.before"] as (i: unknown, o: unknown) => Promise<unknown>)(input, output),
  ).resolves.toBeUndefined();
  const garbage = mod.makePlugin(stub("not json"), "/work/dir", root);
  await expect(
    (garbage["tool.execute.before"] as (i: unknown, o: unknown) => Promise<unknown>)(input, output),
  ).resolves.toBeUndefined();
  // After and the start: never a throw, the events named.
  calls.length = 0;
  const after = mod.makePlugin(stub(deny), "/work/dir", root);
  await expect(
    (after["tool.execute.after"] as (i: unknown, o: unknown) => Promise<unknown>)(input, output),
  ).resolves.toBeUndefined();
  expect(calls[0]?.command).toContain("hook post-tool-use --runtime opencode");
  await (after.event as (e: unknown) => Promise<unknown>)({
    event: { type: "session.created", properties: { info: { id: "ses_02" } } },
  });
  expect(calls[1]?.command).toContain("hook session-start --runtime opencode");
  expect(JSON.parse(calls[1]?.stdin ?? "{}")).toEqual({ session_id: "ses_02", cwd: "/work/dir" });
  await (after.event as (e: unknown) => Promise<unknown>)({ event: { type: "session.idle" } });
  expect(calls).toHaveLength(2);
  // The plugin's own payload through the reader reaches the engine's names.
  const payload = JSON.parse(calls[0]?.stdin ?? "{}");
  const readBack = RUNTIMES.opencode.readPayload("post-tool-use", payload, "/x");
  expect(readBack.tool_name).toBe("Bash");
  expect(readBack.cwd).toBe("/work/dir");
  // The entry point OpenCode calls (judgement round 2): the root and the runtime the text carries,
  // through the export itself, with the directory as the session's folder.
  calls.length = 0;
  const entry = mod as unknown as {
    WizardingCodeCrew: (ctx: {
      $: unknown;
      directory: string;
    }) => Promise<Record<string, (...args: unknown[]) => Promise<unknown>>>;
  };
  const plugin = await entry.WizardingCodeCrew({ $: stub(deny), directory: "/session/dir" });
  await expect(
    (plugin["tool.execute.before"] as (i: unknown, o: unknown) => Promise<unknown>)(input, output),
  ).rejects.toThrow("Crew: no");
  expect(calls[0]?.command).toBe(
    `node ${root}/dist/crew.mjs hook pre-tool-use --runtime opencode < <stdin>`,
  );
  expect(JSON.parse(calls[0]?.stdin ?? "{}").cwd).toBe("/session/dir");
});
