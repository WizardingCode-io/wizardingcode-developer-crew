import { expect, test } from "bun:test";
import { symlinkSync } from "node:fs";
import { join } from "node:path";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import { createWork, saveWork } from "../src/work.ts";
import { hookContext, makeRepo, tempDir, testEnv } from "./helpers.ts";

function decision(response: Record<string, unknown>): string | undefined {
  return (response.hookSpecificOutput as { permissionDecision?: string } | undefined)
    ?.permissionDecision;
}

function setup() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  return { root, ctx: hookContext({ session_id: "s", cwd: root }, testEnv()) };
}

test("writes to engine-owned files are denied; files outside the repo get no opinion", () => {
  const { root, ctx } = setup();
  const edit = (file_path: string) =>
    onPreToolUse(ctx, { tool_name: "Edit", tool_input: { file_path } });
  expect(decision(edit(join(root, ".crew", "profile.json")))).toBe("deny");
  expect(decision(edit(join(root, ".crew", "work", "w1", "evidence.json")))).toBe("deny");
  expect(decision(edit(join(ctx.paths.userDir, "config.json")))).toBe("deny");
  expect(edit(join(root, ".crew", "work", "w1", "spec.md"))).toEqual({});
  expect(edit("/tmp/elsewhere/file.ts")).toEqual({});
  expect(edit(join(process.env.HOME ?? "/", ".zshrc"))).toEqual({});
  expect(onPreToolUse(ctx, { tool_name: "Write", tool_input: {} })).toEqual({});
});

test("source edits are denied before the build phase on standard and full routes only", () => {
  const { root, ctx } = setup();
  const edit = () =>
    onPreToolUse(ctx, {
      tool_name: "Write",
      tool_input: { file_path: join(root, "src", "a.ts") },
    });
  expect(edit()).toEqual({});
  const work = createWork(ctx.paths, "feature");
  work.route = "standard";
  work.phase = "specify";
  saveWork(ctx.paths, work);
  expect(decision(edit())).toBe("deny");
  expect(
    onPreToolUse(ctx, { tool_name: "Write", tool_input: { file_path: join(root, "README.md") } }),
  ).toEqual({});
  work.phase = "build";
  saveWork(ctx.paths, work);
  expect(edit()).toEqual({});
  work.route = "fast";
  work.phase = "recognize";
  saveWork(ctx.paths, work);
  expect(edit()).toEqual({});
});

test("bash: user-only decisions ask, writes to engine files are denied, everything else passes", () => {
  const { ctx } = setup();
  const bash = (command: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command } });
  expect(decision(bash('crew skip w1 gate:lint --reason "legacy"'))).toBe("ask");
  expect(decision(bash("crew approve w1 spec"))).toBe("ask");
  expect(decision(bash("crew profile confirm"))).toBe("ask");
  expect(decision(bash("crew policy accept"))).toBe("ask");
  expect(decision(bash("crew accept 2026-10-07-001-thing"))).toBe("ask");
  expect(decision(bash("crew accept profile"))).toBe("ask");
  expect(decision(bash('crew "skip" w1 gate:lint --reason x'))).toBe("ask");
  expect(decision(bash("crew sk''ip w1 gate:lint --reason x"))).toBe("ask");
  expect(decision(bash("c\\rew approve w1 spec"))).toBe("ask");
  expect(decision(bash("node /x/dist/crew.mjs skip w1 gate:lint --reason x"))).toBe("ask");
  expect(decision(bash("cd /repo && ./crew.mjs profile confirm"))).toBe("ask");
  expect(decision(bash('crew profile set test "true" --force'))).toBe("ask");
  expect(decision(bash("crew profile set test true --target api --force"))).toBe("ask");
  expect(bash("crew status && echo skip")).toEqual({});
  expect(bash("screw skip")).toEqual({});
  expect(decision(bash("echo '{\"targets\":[]}' > .crew/profile.json"))).toBe("deny");
  expect(decision(bash('sed -i "s/fail/pass/" .crew/work/w1/evidence.json'))).toBe("deny");
  expect(decision(bash("rm -rf ~/.wizardingcode/crew/integrity"))).toBe("deny");
  expect(decision(bash("crew status; echo '{}' > .crew/profile.json"))).toBe("deny");
  expect(bash("cat .crew/profile.json")).toEqual({});
  expect(bash("cat .crew/profile.json 2>/dev/null")).toEqual({});
  expect(bash("cat .crew/profile.json 2>&1")).toEqual({});
  expect(bash("cat .crew/work/w1/report.md > /tmp/report.md")).toEqual({});
  expect(decision(bash("echo x > .crew/profile.json 2>/dev/null"))).toBe("deny");
  expect(decision(bash('cat x >> ".crew/work/w1/work.json"'))).toBe("deny");
  expect(decision(bash("echo x > ~/.wizardingcode/crew/integrity/x"))).toBe("deny");
  // An opaque target may be an engine file: a deny rule fails closed on it.
  expect(decision(bash("echo x >| .crew/profile.json"))).toBe("deny");
  expect(decision(bash("F=.crew/profile.json; echo x > $F"))).toBe("deny");
  expect(decision(bash('F=.crew/profile.json; echo x > "$F"'))).toBe("deny");
  expect(decision(bash("echo x > $(echo .crew/profile.json)"))).toBe("deny");
  expect(bash('crew profile set test "make test"')).toEqual({});
  expect(bash("npm test")).toEqual({});
  expect(
    onPreToolUse(ctx, { tool_name: "Read", tool_input: { file_path: ".crew/profile.json" } }),
  ).toEqual({});
});

function reason(response: Record<string, unknown>): string | undefined {
  return (response.hookSpecificOutput as { permissionDecisionReason?: string } | undefined)
    ?.permissionDecisionReason;
}

test("bash: in a mode that shows no prompt, a user-only decision must name its mode to be recorded as the agent's", () => {
  const { ctx } = setup();
  const bash = (command: string, permission_mode: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode });
  for (const mode of ["bypassPermissions", "dontAsk"]) {
    const bare = bash("crew approve w1 spec", mode);
    expect(decision(bare)).toBe("deny");
    expect(reason(bare)).toContain(`--mode ${mode}`);
    expect(decision(bash('crew skip w1 gate:lint --reason "legacy"', mode))).toBe("deny");
    expect(bash(`crew approve w1 spec --mode ${mode}`, mode)).toEqual({});
    expect(bash(`node /x/dist/crew.mjs skip w1 gate:lint --reason x --mode ${mode}`, mode)).toEqual(
      {},
    );
    expect(bash(`cd /repo && ./crew.mjs profile confirm --mode ${mode}`, mode)).toEqual({});
    const other = mode === "dontAsk" ? "bypassPermissions" : "dontAsk";
    const wrong = bash(`crew approve w1 spec --mode ${other}`, mode);
    expect(decision(wrong)).toBe("deny");
    expect(reason(wrong)).toContain(mode);
  }
  // The flag does not open the engine's files: the write rule still applies after it.
  expect(
    decision(
      bash(
        "crew approve w1 spec --mode bypassPermissions; echo x > .crew/profile.json",
        "bypassPermissions",
      ),
    ),
  ).toBe("deny");
});

test("bash: with a person present, auto mode included, a user-only decision is asked and --mode cannot dodge the prompt", () => {
  const { ctx } = setup();
  const bash = (command: string, permission_mode?: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode });
  // Auto mode shows the prompt a hook asks for (finding 3 revisited, finding 19): attended.
  for (const mode of ["default", "acceptEdits", "plan", "auto", undefined]) {
    expect(decision(bash("crew approve w1 spec", mode))).toBe("ask");
    expect(decision(bash('crew skip w1 gate:lint --reason "legacy"', mode))).toBe("ask");
    const flagged = bash(`crew approve w1 spec --mode ${mode ?? "default"}`, mode);
    expect(decision(flagged)).toBe("deny");
    expect(reason(flagged)).toContain("without --mode");
    expect(decision(bash("crew skip w1 gate:lint --reason x --mode=dontAsk", mode))).toBe("deny");
  }
});

test("bash: a headless session is unattended in every mode, and the flag names the session's mode", () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const headless = hookContext(
    { session_id: "s", cwd: root },
    { ...testEnv(), CLAUDE_CODE_SESSION_ATTENDED: "0" },
  );
  const bash = (command: string, permission_mode?: string) =>
    onPreToolUse(headless, { tool_name: "Bash", tool_input: { command }, permission_mode });
  for (const mode of ["default", "acceptEdits", "plan", "auto", "bypassPermissions", "dontAsk"]) {
    const bare = bash("crew approve w1 spec", mode);
    expect(decision(bare)).toBe("deny");
    expect(reason(bare)).toContain("headless");
    expect(reason(bare)).toContain(`--mode ${mode}`);
    expect(bash(`crew approve w1 spec --mode ${mode}`, mode)).toEqual({});
    const other = mode === "auto" ? "default" : "auto";
    expect(decision(bash(`crew approve w1 spec --mode ${other}`, mode))).toBe("deny");
  }
  // No mode in the payload: the session is in default mode.
  expect(decision(bash("crew approve w1 spec"))).toBe("deny");
  expect(bash("crew approve w1 spec --mode default")).toEqual({});
  // The variable at 1 is an attended session: the modes alone decide.
  const attended = hookContext(
    { session_id: "s", cwd: root },
    { ...testEnv(), CLAUDE_CODE_SESSION_ATTENDED: "1" },
  );
  const seen = (command: string, permission_mode: string) =>
    onPreToolUse(attended, { tool_name: "Bash", tool_input: { command }, permission_mode });
  expect(decision(seen("crew approve w1 spec", "auto"))).toBe("ask");
  expect(decision(seen("crew approve w1 spec", "dontAsk"))).toBe("deny");
  expect(seen("crew approve w1 spec --mode dontAsk", "dontAsk")).toEqual({});
});

test("bash: each simple command is judged on its own; a deny in one wins over an ask in another", () => {
  const { ctx } = setup();
  const bash = (command: string, permission_mode?: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode });
  // Finding 2: a document that names an engine file, then a write verb on another file.
  const docs = [
    "cat > docs/real-use/findings.md <<'EOF'",
    "# Findings",
    "- Evidence: `.crew/work/2026-10-12-001-thing/work.json` (`routeReasons`).",
    "EOF",
    "sed -i '' 's/old/new/' CLAUDE.md",
  ].join("\n");
  expect(bash(docs)).toEqual({});
  expect(bash('echo "see .crew/work/w1/work.json" > docs/notes.md && rm docs/draft.md')).toEqual(
    {},
  );
  expect(bash("grep -n fail .crew/work/w1/report.md | tee /tmp/out.txt")).toEqual({});
  expect(decision(bash("cat docs/notes.md; rm .crew/work/w1/logs/test.txt"))).toBe("deny");
  expect(decision(bash("echo x | tee .crew/profile.json"))).toBe("deny");
  expect(decision(bash('bash -c "rm .crew/profile.json"'))).toBe("deny");
  expect(decision(bash("crew approve w1 spec; echo x > .crew/profile.json", "default"))).toBe(
    "deny",
  );
});

test("bash: the user-only rule and --mode are read from the same simple command", () => {
  const { ctx } = setup();
  const bash = (command: string, permission_mode?: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode });
  // Finding 5: a read-only probe whose payload names the command, after an echo that says --mode.
  // Since finding 16 the payload is text, not the command: the probe gets no opinion at all.
  const probe = [
    'echo "probe: the bare command, --mode in auto, through the installed bundle"',
    `printf '%s' '{"permission_mode":"auto","tool_input":{"command":"node plugins/core/dist/crew.mjs approve w1 spec"}}' | node dist/crew.mjs hook pre-tool-use`,
  ].join("; ");
  expect(bash(probe, "plan")).toEqual({});
  expect(bash('crew skip w1 gate:lint --reason "a; b && c" --mode dontAsk', "dontAsk")).toEqual({});
  expect(decision(bash('crew skip w1 gate:lint --reason "a; b"', "default"))).toBe("ask");
  expect(decision(bash('crew skip w1 gate:lint --reason "a; b" --mode auto', "default"))).toBe(
    "deny",
  );
  // The flag must sit on the crew command itself.
  expect(decision(bash("echo --mode dontAsk; crew approve w1 spec", "dontAsk"))).toBe("deny");
  expect(decision(bash("crew approve w1 spec; echo --mode dontAsk", "dontAsk"))).toBe("deny");
});

test("finding 16: a user-only verb counts only at the command position of a simple command", () => {
  const { ctx } = setup();
  const bash = (command: string, permission_mode?: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode });
  // Words inside another program's argument are text, whatever the mode.
  expect(
    bash(
      `cat transcripts.jsonl | grep -oE '"command":"[^"]{0,40}crew accept[^"]{0,40}' | sort | uniq -c`,
      "auto",
    ),
  ).toEqual({});
  expect(bash("echo 'then run crew approve w1 spec'", "auto")).toEqual({});
  expect(bash('printf "%s" "crew skip w1 gate:lint --reason x"', "default")).toEqual({});
  expect(bash("cat notes.md | grep 'crew profile confirm'", "plan")).toEqual({});
  // The command itself, in every spelling, is still the command.
  expect(decision(bash("FOO=1 node /x/dist/crew.mjs skip w1 gate:lint --reason x"))).toBe("ask");
  expect(decision(bash('bash -c "crew approve w1 spec"'))).toBe("ask");
  expect(decision(bash("env FOO=1 crew approve w1 spec"))).toBe("ask");
  expect(decision(bash("(crew approve w1 spec)"))).toBe("ask");
  expect(decision(bash("time crew policy accept"))).toBe("ask");
  expect(decision(bash("xargs -0 crew accept profile"))).toBe("ask");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the hook sees the placeholder as written in hooks.json
  expect(decision(bash("node ${CLAUDE_PLUGIN_ROOT}/dist/crew.mjs profile confirm"))).toBe("ask");
  expect(decision(bash("cd /repo && ./crew.mjs profile confirm"))).toBe("ask");
  expect(decision(bash("crew approve w1 spec", "auto"))).toBe("ask");
  expect(decision(bash("crew approve w1 spec", "dontAsk"))).toBe("deny");
  expect(bash("screw skip w1")).toEqual({});
});

test("bash: a heredoc body line is judged like a simple command", () => {
  const { ctx } = setup();
  const bash = (command: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command } });
  expect(decision(bash("bash <<'EOF'\nrm .crew/profile.json\nEOF"))).toBe("deny");
  expect(decision(bash("cat <<'EOF' | sh\ncp x .crew/work/w1/evidence.json\nEOF"))).toBe("deny");
  const notes = [
    "cat > docs/notes.md <<'EOF'",
    "The evidence is in .crew/work/w1/work.json and the profile in .crew/profile.json.",
    "Drafts are removed with rm docs/draft.md.",
    "EOF",
  ].join("\n");
  expect(bash(notes)).toEqual({});
});

test("bash: an opaque redirect target fails closed over the whole command", () => {
  const { ctx } = setup();
  const bash = (command: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command } });
  expect(decision(bash("F=.crew/profile.json; echo x > $F"))).toBe("deny");
  expect(decision(bash("F=.crew/work/w1/work.json\ncat x >> $F"))).toBe("deny");
  expect(decision(bash("echo x > `echo .crew/profile.json`"))).toBe("deny");
  expect(bash("F=docs/notes.md; echo x > $F")).toEqual({});
});

test("SP2a: decide is a user-only command; decision add is not", () => {
  const { ctx } = setup();
  const bash = (command: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command } });
  expect(decision(bash('crew decide w1 D-1 "admins only"'))).toBe("ask");
  expect(decision(bash('crew decision w1 add "Which roles?"'))).toBeUndefined();
});

test("SP2a: objections.json is engine-owned and waive is user-only", () => {
  const { root, ctx } = setup();
  expect(
    decision(
      onPreToolUse(ctx, {
        tool_name: "Edit",
        tool_input: { file_path: join(root, ".crew", "work", "w1", "objections.json") },
      }),
    ),
  ).toBe("deny");
  const bash = (command: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command } });
  expect(decision(bash('crew objection w1 waive O-1 --reason "known"'))).toBe("ask");
  expect(
    decision(bash('crew objection w1 add "x" --by expert --severity advisory')),
  ).toBeUndefined();
  expect(decision(bash("echo x > .crew/work/w1/objections.json"))).toBe("deny");
});

test("a write through a symlinked alias of the repository is judged like the real path", () => {
  const { root, ctx } = setup();
  const alias = join(tempDir(), "alias");
  symlinkSync(root, alias);
  const edit = (file_path: string) =>
    onPreToolUse(ctx, { tool_name: "Edit", tool_input: { file_path } });
  expect(decision(edit(join(alias, ".crew", "profile.json")))).toBe("deny");
  expect(decision(edit(join(alias, ".crew", "work", "w1", "evidence.json")))).toBe("deny");
  expect(edit(join(alias, "README.md"))).toEqual({});
  const work = createWork(ctx.paths, "feature");
  work.route = "standard";
  work.phase = "specify";
  saveWork(ctx.paths, work);
  expect(decision(edit(join(alias, "src", "a.ts")))).toBe("deny");
});
