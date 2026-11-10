import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { HookPayload, HookResponse } from "../src/hooks/types.ts";
import { opencodePlugin } from "../src/runtimes/opencode-plugin.ts";
import {
  adapterLinkProblem,
  checkRuntime,
  ENGINE_EVENTS,
  type EngineEvent,
  type Guarantee,
  guaranteeLines,
  type InstallDirs,
  InstallFailed,
  installRuntime,
  patchPaths,
  RUNTIME_NAMES,
  RUNTIMES,
  type Runtime,
  type RuntimeName,
  readAgentPage,
  runtimeOf,
} from "../src/runtimes.ts";
import { git, makeRepo, tempDir, write } from "./helpers.ts";

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
  expect(page.model).toBe("fable");
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

test("AC-2 (finding 121's debt): readAgentPage decodes a double-quoted description once, so the generated files of a quoted page are byte-identical to the unquoted page's", () => {
  const pageText = readFileSync(
    fileURLToPath(new URL("../../../plugins/core/agents/tech-lead.md", import.meta.url)),
    "utf8",
  );
  const page = readAgentPage(pageText);
  const quotedText = pageText.replace(
    /^description: (.*)$/m,
    (_, d: string) => `description: ${JSON.stringify(d)}`,
  );
  expect(quotedText).not.toBe(pageText);
  const quoted = readAgentPage(quotedText);
  expect(quoted).toEqual(page);
  for (const name of RUNTIME_NAMES) {
    expect(RUNTIMES[name].agentFile(quoted), name).toEqual(RUNTIMES[name].agentFile(page));
  }
  // An escape inside the quotes is decoded once by the reader and encoded once by a generator.
  const escaped = readAgentPage(
    '---\nname: x\ndescription: "a \\"b\\" c"\ntools: Read\n---\n\nbody\n',
  );
  expect(escaped.description).toBe('a "b" c');
  expect(RUNTIMES.copilot.agentFile(escaped)?.text).toContain('description: "a \\"b\\" c"');
  // A value that is not a JSON string stays raw, as today.
  expect(
    readAgentPage('---\nname: x\ndescription: "unclosed\ntools: Read\n---\n\nbody\n').description,
  ).toBe('"unclosed');
});

test("AC-3 (finding 121's debt): crew runtime install refuses a skill page a strict loader drops, naming the line, and writes nothing; crew runtime check reports the installed page's front matter", () => {
  const root = tempDir("crew-root-");
  const page = (description: string) =>
    `---\nname: crew-method\ndescription: ${description}\n---\n\n# Crew\n`;
  mkdirSync(join(root, "skills", "crew", "references"), { recursive: true });
  mkdirSync(join(root, "agents"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist", "crew.mjs"), "");
  writeFileSync(join(root, "skills", "crew", "references", "rules.md"), "# Rules\n");
  writeFileSync(
    join(root, "agents", "tech-lead.md"),
    readFileSync(
      fileURLToPath(new URL("../../../plugins/core/agents/tech-lead.md", import.meta.url)),
      "utf8",
    ),
  );
  writeFileSync(
    join(root, "skills", "crew", "SKILL.md"),
    page("Use when the user asks: a fix, a feature"),
  );
  const dirs = { project: tempDir("crew-project-"), home: tempDir("crew-home-") };
  const refused = installRuntime(RUNTIMES.cursor, "project", dirs, root);
  expect(refused).toEqual({
    refused:
      'skills/crew/SKILL.md line 3: a plain value holds ": " (quote it); a strict YAML loader drops the page: fix the front matter',
  });
  expect(existsSync(join(dirs.project, ".cursor", "hooks.json"))).toBe(false);
  expect(existsSync(join(dirs.project, ".agents", "skills", "crew-method"))).toBe(false);
  // The page fixed: installed, and the check says the front matter is fine, right after the copy's line.
  writeFileSync(
    join(root, "skills", "crew", "SKILL.md"),
    page('"Use when the user asks: a fix, a feature"'),
  );
  expect("files" in installRuntime(RUNTIMES.cursor, "project", dirs, root)).toBe(true);
  const checked = checkRuntime(RUNTIMES.cursor, "project", dirs, root);
  expect(checked.ok, checked.lines.join("\n")).toBe(true);
  expect(checked.lines.indexOf("skill front matter: ok")).toBe(
    checked.lines.indexOf("skill: ok") + 1,
  );
  // The installed copy edited to the dropped shape: the check names the line and is not ok.
  writeFileSync(
    join(dirs.project, ".agents", "skills", "crew-method", "SKILL.md"),
    page("Use when the user asks: a fix, a feature"),
  );
  const broken = checkRuntime(RUNTIMES.cursor, "project", dirs, root);
  expect(broken.ok).toBe(false);
  expect(broken.lines).toContain(
    'skill front matter: SKILL.md line 3: a plain value holds ": " (quote it)',
  );
  // Every problem named, in line order (finding 128): one attempt is enough to fix a page.
  writeFileSync(
    join(dirs.project, ".agents", "skills", "crew-method", "SKILL.md"),
    page("Use when: a #b"),
  );
  expect(checkRuntime(RUNTIMES.cursor, "project", dirs, root).lines).toContain(
    'skill front matter: SKILL.md line 3: a plain value holds ": " (quote it); line 3: a plain value holds " #" (quote it)',
  );
  writeFileSync(join(root, "skills", "crew", "SKILL.md"), page("Use when: a #b"));
  expect(installRuntime(RUNTIMES.cursor, "project", dirs, root)).toEqual({
    refused:
      'skills/crew/SKILL.md line 3: a plain value holds ": " (quote it); line 3: a plain value holds " #" (quote it); a strict YAML loader drops the page: fix the front matter',
  });
  // The copy gone: the skill line says so once, and no front-matter line is printed.
  rmSync(join(dirs.project, ".agents", "skills", "crew-method", "SKILL.md"));
  const gone = checkRuntime(RUNTIMES.cursor, "project", dirs, root);
  expect(gone.ok).toBe(false);
  expect(gone.lines.some((l) => l.startsWith("skill front matter"))).toBe(false);
  expect(gone.lines.find((l) => l.startsWith("skill: "))).not.toBe("skill: ok");
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

// 2026-11-08-002 Task 2: the install's write order, the prune of what git can bring back, the link
// refusal at project scope, and the check's parts as data (AC-18, AC-28, AC-9, AC-19, AC-23, AC-13).

/** A plugin root with a bundle, a skill page, one reference and one agent page, by its real path. */
function fakeRoot(): string {
  const root = tempDir("crew-root-");
  mkdirSync(join(root, "skills", "crew", "references"), { recursive: true });
  mkdirSync(join(root, "agents"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, "dist", "crew.mjs"), "");
  writeFileSync(
    join(root, "skills", "crew", "SKILL.md"),
    '---\nname: crew-method\ndescription: "Use when the user asks: a fix, a feature"\n---\n\n# Crew\n',
  );
  writeFileSync(join(root, "skills", "crew", "references", "a.md"), "# A\n");
  writeFileSync(
    join(root, "agents", "tech-lead.md"),
    readFileSync(
      fileURLToPath(new URL("../../../plugins/core/agents/tech-lead.md", import.meta.url)),
      "utf8",
    ),
  );
  return realpathSync(root);
}

/** A repository with the adapter installed and committed, so its files are tracked and clean. */
function gitFixture(runtime: Runtime, root: string): { project: string; dirs: InstallDirs } {
  const project = realpathSync(makeRepo());
  const dirs = { project, home: tempDir("crew-home-") };
  const done = installRuntime(runtime, "project", dirs, root);
  if ("refused" in done) throw new Error(done.refused);
  git(project, "add", "-A");
  git(project, "commit", "-q", "-m", "adapter");
  return { project, dirs };
}

/** Every file under a folder with its bytes' hash, by relative path, to show nothing changed. */
function hashesBelow(dir: string, base = dir): Record<string, string> {
  if (!existsSync(dir)) return {};
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (lstatSync(path).isDirectory()) Object.assign(out, hashesBelow(path, base));
    else if (lstatSync(path).isFile())
      out[path.slice(base.length + 1)] = createHash("sha256")
        .update(readFileSync(path))
        .digest("hex");
  }
  return out;
}

test("2026-11-08-002 AC-18: the install writes the configuration last and prunes only what git can bring back", () => {
  const root = fakeRoot();
  const copilot = RUNTIMES.copilot;
  const { project, dirs } = gitFixture(copilot, root);
  const agents = join(project, ".github", "agents");
  const old = join(project, ".agents", "skills", "crew-method", "references", "old.md");
  write(project, ".agents/skills/crew-method/references/old.md", "old\n");
  write(project, ".github/agents/crew-retired.agent.md", "retired\n");
  write(project, ".github/agents/crew-edited.agent.md", "edited\n");
  write(project, ".github/agents/crew-é d.agent.md", "accent\n");
  git(project, "add", "-A");
  git(project, "commit", "-q", "-m", "leftovers");
  write(project, ".github/agents/crew-edited.agent.md", "edited twice\n");
  write(project, ".github/agents/crew-é d.agent.md", "accent twice\n");
  write(project, ".github/agents/crew-mine.agent.md", "mine\n");
  write(project, ".github/agents/mine.agent.md", "mine\n");
  const done = installRuntime(copilot, "project", dirs, root);
  if ("refused" in done) throw new Error(done.refused);
  expect(existsSync(old)).toBe(false);
  expect(existsSync(join(agents, "crew-retired.agent.md"))).toBe(false);
  expect([...done.removed].sort()).toEqual([old, join(agents, "crew-retired.agent.md")].sort());
  const left = ["crew-edited.agent.md", "crew-é d.agent.md", "crew-mine.agent.md"].map((n) =>
    join(agents, n),
  );
  for (const path of left) expect(existsSync(path), path).toBe(true);
  expect([...done.left].sort()).toEqual([...left].sort());
  expect(existsSync(join(agents, "mine.agent.md"))).toBe(true);
  expect(done.left).not.toContain(join(agents, "mine.agent.md"));
  expect(readFileSync(join(agents, "crew-edited.agent.md"), "utf8")).toBe("edited twice\n");
  // Under crew-method/ too: a tracked leftover edited since its commit, and one git ignores, are
  // left; the agent leftovers, committed since, go.
  const references = join(project, ".agents", "skills", "crew-method", "references");
  write(project, ".agents/skills/crew-method/references/edited.md", "edited\n");
  write(project, ".gitignore", "*.scratch\n");
  git(project, "add", "-A");
  git(project, "commit", "-q", "-m", "more leftovers");
  write(project, ".agents/skills/crew-method/references/edited.md", "edited twice\n");
  write(project, ".agents/skills/crew-method/references/notes.scratch", "scratch\n");
  const more = installRuntime(copilot, "project", dirs, root);
  if ("refused" in more) throw new Error(more.refused);
  expect([...more.removed].sort()).toEqual([...left].sort());
  expect([...more.left].sort()).toEqual(
    [join(references, "edited.md"), join(references, "notes.scratch")].sort(),
  );
  expect(readFileSync(join(references, "edited.md"), "utf8")).toBe("edited twice\n");
  // Outside a git repository the same leftovers are all left.
  const plain = { project: tempDir("crew-plain-"), home: tempDir("crew-home-") };
  expect("files" in installRuntime(copilot, "project", plain, root)).toBe(true);
  write(plain.project, ".agents/skills/crew-method/references/old.md", "old\n");
  write(plain.project, ".github/agents/crew-retired.agent.md", "retired\n");
  const again = installRuntime(copilot, "project", plain, root);
  if ("refused" in again) throw new Error(again.refused);
  expect(again.removed).toEqual([]);
  expect([...again.left].sort()).toEqual(
    [
      join(plain.project, ".agents", "skills", "crew-method", "references", "old.md"),
      join(plain.project, ".github", "agents", "crew-retired.agent.md"),
    ].sort(),
  );
  // User scope: a skill leftover goes, an agent leftover stays and is named.
  const home = tempDir("crew-home-");
  const userDirs = { project: tempDir("crew-project-"), home };
  expect("files" in installRuntime(copilot, "user", userDirs, root)).toBe(true);
  write(home, ".agents/skills/crew-method/old.md", "old\n");
  write(home, ".copilot/agents/crew-mine.agent.md", "mine\n");
  const user = installRuntime(copilot, "user", userDirs, root);
  if ("refused" in user) throw new Error(user.refused);
  expect(existsSync(join(home, ".agents", "skills", "crew-method", "old.md"))).toBe(false);
  expect(user.removed).toEqual([join(home, ".agents", "skills", "crew-method", "old.md")]);
  expect(existsSync(join(home, ".copilot", "agents", "crew-mine.agent.md"))).toBe(true);
  expect(user.left).toEqual([join(home, ".copilot", "agents", "crew-mine.agent.md")]);
});

test.skipIf(process.getuid?.() === 0)(
  "2026-11-08-002 AC-18 (write order): a copy that fails leaves the configuration as it was",
  () => {
    const root = fakeRoot();
    const unreadable = join(root, "skills", "crew", "references", "a.md");
    chmodSync(unreadable, 0o000);
    try {
      // A first install: the configuration is never written.
      const fresh = { project: tempDir("crew-project-"), home: tempDir("crew-home-") };
      expect(() => installRuntime(RUNTIMES.copilot, "project", fresh, root)).toThrow(InstallFailed);
      try {
        installRuntime(RUNTIMES.copilot, "project", fresh, root);
      } catch (error) {
        expect((error as InstallFailed).written).toBeGreaterThan(0);
      }
      expect(existsSync(join(fresh.project, ".github", "hooks", "crew.json"))).toBe(false);
      // A second install from another root: the configuration keeps its earlier bytes.
      const good = fakeRoot();
      const project = { project: tempDir("crew-project-"), home: tempDir("crew-home-") };
      expect("files" in installRuntime(RUNTIMES.copilot, "project", project, good)).toBe(true);
      const config = join(project.project, ".github", "hooks", "crew.json");
      const before = readFileSync(config, "utf8");
      expect(() => installRuntime(RUNTIMES.copilot, "project", project, root)).toThrow(
        InstallFailed,
      );
      expect(readFileSync(config, "utf8")).toBe(before);
    } finally {
      chmodSync(unreadable, 0o644);
    }
  },
);

test("2026-11-08-002 AC-28: an unchanged configuration is not rewritten", () => {
  const root = fakeRoot();
  const dirs = { project: tempDir("crew-project-"), home: tempDir("crew-home-") };
  const first = installRuntime(RUNTIMES.cursor, "project", dirs, root);
  if ("refused" in first) throw new Error(first.refused);
  expect(first.configWritten).toBe(true);
  const config = join(dirs.project, ".cursor", "hooks.json");
  const mtime = statSync(config).mtimeMs;
  const second = installRuntime(RUNTIMES.cursor, "project", dirs, root);
  if ("refused" in second) throw new Error(second.refused);
  expect(second.configWritten).toBe(false);
  expect(statSync(config).mtimeMs).toBe(mtime);
  expect(second.files).not.toContain(config);
  // A person's own entry added by hand stays, and the file is still not rewritten.
  const parsed = JSON.parse(readFileSync(config, "utf8")) as { hooks: Record<string, unknown[]> };
  parsed.hooks.stop = [{ command: "./mine.sh" }, ...(parsed.hooks.stop ?? [])];
  writeFileSync(config, `${JSON.stringify(parsed, null, 2)}\n`);
  const withMine = statSync(config).mtimeMs;
  const third = installRuntime(RUNTIMES.cursor, "project", dirs, root);
  if ("refused" in third) throw new Error(third.refused);
  expect(third.configWritten).toBe(false);
  expect(statSync(config).mtimeMs).toBe(withMine);
  expect((JSON.parse(readFileSync(config, "utf8")) as typeof parsed).hooks.stop?.[0]).toEqual({
    command: "./mine.sh",
  });
  // A crew entry changed by hand: written again, the entry restored.
  const edited = JSON.parse(readFileSync(config, "utf8")) as {
    hooks: Record<string, { command?: string; timeout?: number }[]>;
  };
  const crewStop = edited.hooks.stop?.find((e) => e.command?.includes("crew.mjs"));
  if (!crewStop) throw new Error("no crew stop entry");
  crewStop.timeout = 99;
  writeFileSync(config, `${JSON.stringify(edited, null, 2)}\n`);
  const fourth = installRuntime(RUNTIMES.cursor, "project", dirs, root);
  if ("refused" in fourth) throw new Error(fourth.refused);
  expect(fourth.configWritten).toBe(true);
  const restored = JSON.parse(readFileSync(config, "utf8")) as typeof edited;
  expect(restored.hooks.stop?.find((e) => e.command?.includes("crew.mjs"))?.timeout).toBe(10);
  // OpenCode's file, compared by its text.
  const oc = installRuntime(RUNTIMES.opencode, "project", dirs, root);
  if ("refused" in oc) throw new Error(oc.refused);
  const plugin = join(dirs.project, ".opencode", "plugins", "wizardingcode-crew.js");
  const ocTime = statSync(plugin).mtimeMs;
  const ocAgain = installRuntime(RUNTIMES.opencode, "project", dirs, root);
  if ("refused" in ocAgain) throw new Error(ocAgain.refused);
  expect(ocAgain.configWritten).toBe(false);
  expect(statSync(plugin).mtimeMs).toBe(ocTime);
});

test("2026-11-08-002 AC-23: a user-scope install through a linked home folder", () => {
  const root = fakeRoot();
  const home = tempDir("crew-home-");
  const elsewhere = tempDir("crew-dotfiles-");
  symlinkSync(elsewhere, join(home, ".agents"));
  const done = installRuntime(RUNTIMES.copilot, "user", { project: tempDir(), home }, root);
  expect("refused" in done).toBe(false);
  expect(existsSync(join(elsewhere, "skills", "crew-method", "SKILL.md"))).toBe(true);
});

test("2026-11-08-002 AC-9: the check sees leftovers and links, and not a left user agent", () => {
  const root = fakeRoot();
  const dirs = { project: tempDir("crew-project-"), home: tempDir("crew-home-") };
  expect("files" in installRuntime(RUNTIMES.copilot, "project", dirs, root)).toBe(true);
  const extra = join(dirs.project, ".agents", "skills", "crew-method", "extra.md");
  writeFileSync(extra, "extra\n");
  let checked = checkRuntime(RUNTIMES.copilot, "project", dirs, root);
  expect(checked.parts.skill).toEqual({ state: "stale", differ: 1 });
  expect(checked.ok).toBe(false);
  rmSync(extra);
  const outside = join(tempDir("crew-outside-"), "o.md");
  writeFileSync(outside, "o\n");
  symlinkSync(outside, extra);
  checked = checkRuntime(RUNTIMES.copilot, "project", dirs, root);
  expect(checked.parts.skill.state).toBe("stale");
  rmSync(extra);
  symlinkSync(join(tempDir("crew-gone-"), "nowhere.md"), extra);
  checked = checkRuntime(RUNTIMES.copilot, "project", dirs, root);
  expect(checked.parts.skill.state).toBe("stale");
  rmSync(extra);
  expect(checkRuntime(RUNTIMES.copilot, "project", dirs, root).ok).toBe(true);
  const agents = join(dirs.project, ".github", "agents");
  writeFileSync(join(agents, "crew-gone.agent.md"), "gone\n");
  checked = checkRuntime(RUNTIMES.copilot, "project", dirs, root);
  expect(checked.parts.agents).toEqual({ state: "stale", differ: 1 });
  rmSync(join(agents, "crew-gone.agent.md"));
  writeFileSync(join(agents, "mine.agent.md"), "mine\n");
  checked = checkRuntime(RUNTIMES.copilot, "project", dirs, root);
  expect(checked.parts.agents).toEqual({ state: "ok", differ: 0 });
  expect(checked.ok).toBe(true);
  // User scope: an agent the install leaves never fails the check.
  const home = tempDir("crew-home-");
  const userDirs = { project: tempDir("crew-project-"), home };
  expect("files" in installRuntime(RUNTIMES.copilot, "user", userDirs, root)).toBe(true);
  write(home, ".copilot/agents/crew-mine.agent.md", "mine\n");
  expect("files" in installRuntime(RUNTIMES.copilot, "user", userDirs, root)).toBe(true);
  expect(checkRuntime(RUNTIMES.copilot, "user", userDirs, root).ok).toBe(true);
  // Folder names that read like a failed line never make the check fail: the parts are data.
  const odd = join(tempDir("crew-odd-"), "missing-docs", "failed-build");
  mkdirSync(odd, { recursive: true });
  const oddDirs = { project: odd, home: tempDir("crew-home-") };
  expect("files" in installRuntime(RUNTIMES.copilot, "project", oddDirs, root)).toBe(true);
  const oddCheck = checkRuntime(RUNTIMES.copilot, "project", oddDirs, root);
  expect(oddCheck.ok, oddCheck.lines.join("\n")).toBe(true);
  expect(oddCheck.problems).toEqual([]);
});

test("2026-11-08-002 AC-19: the check compares the configuration", () => {
  const root = fakeRoot();
  const dirs = { project: tempDir("crew-project-"), home: tempDir("crew-home-") };
  expect("files" in installRuntime(RUNTIMES.cursor, "project", dirs, root)).toBe(true);
  const config = join(dirs.project, ".cursor", "hooks.json");
  const parsed = JSON.parse(readFileSync(config, "utf8")) as {
    hooks: Record<string, { command?: string; timeout?: number }[]>;
  };
  const crewStop = parsed.hooks.stop?.find((e) => e.command?.includes("crew.mjs"));
  if (!crewStop) throw new Error("no crew stop entry");
  crewStop.timeout = 99;
  writeFileSync(config, `${JSON.stringify(parsed, null, 2)}\n`);
  let checked = checkRuntime(RUNTIMES.cursor, "project", dirs, root);
  expect(checked.parts.config).toEqual({ state: "stale", differ: 1 });
  expect(checked.ok).toBe(false);
  expect(
    checked.lines.indexOf("config: stale (differs from what crew runtime install writes)"),
  ).toBe(checked.lines.indexOf(`config: ${config}`) + 1);
  expect("files" in installRuntime(RUNTIMES.cursor, "project", dirs, root)).toBe(true);
  checked = checkRuntime(RUNTIMES.cursor, "project", dirs, root);
  expect(checked.ok, checked.lines.join("\n")).toBe(true);
  // The same value, another layout: not stale.
  writeFileSync(config, `${JSON.stringify(JSON.parse(readFileSync(config, "utf8")), null, 4)}\n`);
  expect(checkRuntime(RUNTIMES.cursor, "project", dirs, root).ok).toBe(true);
  // A person's own entry beside crew's, installed again: ok.
  const withMine = JSON.parse(readFileSync(config, "utf8")) as typeof parsed;
  withMine.hooks.stop = [{ command: "./mine.sh" }, ...(withMine.hooks.stop ?? [])];
  writeFileSync(config, `${JSON.stringify(withMine, null, 2)}\n`);
  expect("files" in installRuntime(RUNTIMES.cursor, "project", dirs, root)).toBe(true);
  expect(checkRuntime(RUNTIMES.cursor, "project", dirs, root).ok).toBe(true);
  // OpenCode's plugin file, compared by its text.
  expect("files" in installRuntime(RUNTIMES.opencode, "project", dirs, root)).toBe(true);
  const plugin = join(dirs.project, ".opencode", "plugins", "wizardingcode-crew.js");
  writeFileSync(plugin, `${readFileSync(plugin, "utf8")} `);
  expect(checkRuntime(RUNTIMES.opencode, "project", dirs, root).parts.config.state).toBe("stale");
});

test("2026-11-08-002 AC-13 (install): crew runtime install refuses a link at project scope", () => {
  const root = fakeRoot();
  const dirs = { project: realpathSync(tempDir("crew-project-")), home: tempDir("crew-home-") };
  expect("files" in installRuntime(RUNTIMES.copilot, "project", dirs, root)).toBe(true);
  const references = join(dirs.project, ".agents", "skills", "crew-method", "references");
  rmSync(references, { recursive: true });
  const outside = tempDir("crew-outside-");
  writeFileSync(join(outside, "keep.md"), "keep\n");
  symlinkSync(outside, references);
  const before = hashesBelow(dirs.project);
  const refused = installRuntime(RUNTIMES.copilot, "project", dirs, root);
  expect("refused" in refused).toBe(true);
  if ("refused" in refused)
    expect(refused.refused).toContain(".agents/skills/crew-method/references is a symbolic link");
  expect(readFileSync(join(outside, "keep.md"), "utf8")).toBe("keep\n");
  expect(hashesBelow(dirs.project)).toEqual(before);
});

// Item 2026-11-09-001, Task 4: the link check's resolver and crew runtime check's quoted lines (AC-15, AC-18).

test("2026-11-09-001 AC-15: an entry that resolves outside the project is refused, and the install refuses each link case", () => {
  const root = fakeRoot();
  // The resolver seam: no link among the parents, and one entry's real path outside the project.
  const seam = gitFixture(RUNTIMES.copilot, root);
  expect(adapterLinkProblem(RUNTIMES.copilot, seam.dirs, root)).toBeNull();
  expect(
    adapterLinkProblem(RUNTIMES.copilot, seam.dirs, root, (path) =>
      path.endsWith("/crew-method/SKILL.md") ? "/elsewhere/SKILL.md" : realpathSync(path),
    ),
  ).toBe(".agents/skills/crew-method/SKILL.md leaves the project");
  // Each case on a fresh installed project: refused with its text, nothing written, the target kept.
  const refuses = (text: string, make: (project: string, outside: string) => void) => {
    const { project, dirs } = gitFixture(RUNTIMES.copilot, root);
    const outside = tempDir("crew-outside-");
    make(project, outside);
    const before = hashesBelow(project);
    const outsideBefore = hashesBelow(outside);
    const refused = installRuntime(RUNTIMES.copilot, "project", dirs, root);
    expect("refused" in refused, text).toBe(true);
    if ("refused" in refused) expect(refused.refused).toContain(text);
    expect(hashesBelow(project), text).toEqual(before);
    expect(hashesBelow(outside), text).toEqual(outsideBefore);
  };
  /** The entry replaced by a link to a copy of itself outside the project. */
  const linked = (rel: string) => (project: string, outside: string) => {
    const copy = join(outside, "copy");
    writeFileSync(copy, readFileSync(join(project, rel)));
    rmSync(join(project, rel));
    symlinkSync(copy, join(project, rel));
  };
  const agent = ".github/agents/crew-tech-lead.agent.md";
  refuses(".github/hooks/crew.json is a symbolic link", linked(".github/hooks/crew.json"));
  refuses(
    ".agents/skills/crew-method/SKILL.md is a symbolic link",
    linked(".agents/skills/crew-method/SKILL.md"),
  );
  refuses(`${agent} is a symbolic link`, linked(agent));
  refuses(".agents is a symbolic link", (project, outside) => {
    renameSync(join(project, ".agents"), join(outside, "agents"));
    symlinkSync(join(outside, "agents"), join(project, ".agents"));
  });
  refuses(`${agent} is not a file`, (project) => {
    rmSync(join(project, agent));
    mkdirSync(join(project, agent));
  });
});

test("2026-11-09-001 AC-18: crew runtime check prints the root and the configuration's path quoted", () => {
  const root = fakeRoot();
  const clean = (lines: string[]) => {
    for (const line of lines) {
      expect(line).not.toContain("\x1b");
      expect(line).not.toContain("\n");
      expect(line).not.toContain("‮");
    }
  };
  // A root with an escape sequence and 300 characters more, named by a configuration written by hand.
  const dirs = { project: realpathSync(tempDir("crew-project-")), home: tempDir("crew-home-") };
  const escRoot = `/tmp/y\x1b[2J${"y".repeat(300)}`;
  write(
    dirs.project,
    ".cursor/hooks.json",
    `{"version":1,"hooks":{"stop":[{"command":"node ${escRoot}/dist/crew.mjs hook stop --runtime cursor"}]}}\n`,
  );
  const cursor = checkRuntime(RUNTIMES.cursor, "project", dirs, root).lines;
  clean(cursor);
  const missing = " missing dist/crew.mjs";
  const rootLine = cursor.find((l) => l.startsWith("root: ")) ?? "";
  expect(rootLine.endsWith(missing)).toBe(true);
  expect(rootLine.slice("root: ".length, -missing.length).length).toBeLessThanOrEqual(200);
  // A bidi-override character in the root.
  write(
    dirs.project,
    ".gemini/settings.json",
    JSON.stringify({
      hooks: {
        Stop: [
          {
            hooks: [
              {
                type: "command",
                command: "node /tmp/‮z/dist/crew.mjs hook stop --runtime gemini",
              },
            ],
          },
        ],
      },
    }),
  );
  const gemini = checkRuntime(RUNTIMES.gemini, "project", dirs, root).lines;
  clean(gemini);
  expect(gemini.some((l) => l.startsWith("root: /tmp/"))).toBe(true);
  // A project folder whose parent's name holds a newline and an escape sequence.
  const hostile = join(realpathSync(tempDir("crew-evil-")), "evil\n\x1b[2J", "project");
  mkdirSync(hostile, { recursive: true });
  const hostileDirs = { project: hostile, home: tempDir("crew-home-") };
  const done = installRuntime(RUNTIMES.copilot, "project", hostileDirs, root);
  if ("refused" in done) throw new Error(done.refused);
  const installed = checkRuntime(RUNTIMES.copilot, "project", hostileDirs, root).lines;
  clean(installed);
  expect(installed.some((l) => l.startsWith("config: "))).toBe(true);
  expect(installed.some((l) => l.startsWith("root: ") && l.endsWith(" ok"))).toBe(true);
  // A configuration that is absent, in the same folder.
  const absent = checkRuntime(RUNTIMES.codex, "project", hostileDirs, root).lines;
  clean(absent);
  expect(absent.some((l) => l.startsWith("missing: "))).toBe(true);
  // A configuration that holds no crew hook, in the same folder.
  write(hostile, ".codex/hooks.json", "{}\n");
  const hookless = checkRuntime(RUNTIMES.codex, "project", hostileDirs, root).lines;
  clean(hookless);
  expect(hookless.some((l) => l.endsWith(" holds no crew hook"))).toBe(true);
  // A configuration the install would refuse (its closing brace cut), in the same folder: the
  // refusal names the path.
  const copilotConfig = join(hostile, ".github", "hooks", "crew.json");
  writeFileSync(copilotConfig, readFileSync(copilotConfig, "utf8").trimEnd().replace(/\}$/, ""));
  const refusedLines = checkRuntime(RUNTIMES.copilot, "project", hostileDirs, root).lines;
  clean(refusedLines);
  expect(refusedLines.some((l) => l.startsWith("config: stale ("))).toBe(true);
  // A root that holds a bundle and whose path holds a newline, an escape sequence and a bidi
  // override, named by OpenCode's plugin file (the one configuration whose root is a JSON string,
  // so a newline survives in it): the check reaches the root's `ok` line.
  const hostileRoot = join(realpathSync(tempDir("crew-evil-root-")), "evil\n\x1b[2J\u202eroot");
  cpSync(root, hostileRoot, { recursive: true });
  const opencodeDirs = {
    project: realpathSync(tempDir("crew-project-")),
    home: tempDir("crew-home-"),
  };
  const viaHostile = installRuntime(RUNTIMES.opencode, "project", opencodeDirs, hostileRoot);
  if ("refused" in viaHostile) throw new Error(viaHostile.refused);
  const opencode = checkRuntime(RUNTIMES.opencode, "project", opencodeDirs, root).lines;
  clean(opencode);
  const okLine = opencode.find((l) => l.startsWith("root: ") && l.endsWith(" ok")) ?? "";
  expect(okLine).toContain("evil");
});
