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

test("bash: with no person watching, a user-only decision must name its mode to be recorded as the agent's", () => {
  const { ctx } = setup();
  const bash = (command: string, permission_mode: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode });
  for (const mode of ["auto", "bypassPermissions", "dontAsk"]) {
    const bare = bash("crew approve w1 spec", mode);
    expect(decision(bare)).toBe("deny");
    expect(reason(bare)).toContain(`--mode ${mode}`);
    expect(decision(bash('crew skip w1 gate:lint --reason "legacy"', mode))).toBe("deny");
    expect(bash(`crew approve w1 spec --mode ${mode}`, mode)).toEqual({});
    expect(bash(`node /x/dist/crew.mjs skip w1 gate:lint --reason x --mode ${mode}`, mode)).toEqual(
      {},
    );
    expect(bash(`cd /repo && ./crew.mjs profile confirm --mode ${mode}`, mode)).toEqual({});
    const other = mode === "auto" ? "dontAsk" : "auto";
    const wrong = bash(`crew approve w1 spec --mode ${other}`, mode);
    expect(decision(wrong)).toBe("deny");
    expect(reason(wrong)).toContain(mode);
  }
  // The flag does not open the engine's files: the write rule still applies after it.
  expect(
    decision(bash("crew approve w1 spec --mode auto; echo x > .crew/profile.json", "auto")),
  ).toBe("deny");
});

test("bash: with a person present, a user-only decision is asked and --mode cannot dodge the prompt", () => {
  const { ctx } = setup();
  const bash = (command: string, permission_mode?: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode });
  for (const mode of ["default", "acceptEdits", "plan", undefined]) {
    expect(decision(bash("crew approve w1 spec", mode))).toBe("ask");
    expect(decision(bash('crew skip w1 gate:lint --reason "legacy"', mode))).toBe("ask");
    const flagged = bash("crew approve w1 spec --mode auto", mode);
    expect(decision(flagged)).toBe("deny");
    expect(reason(flagged)).toContain("without --mode");
    expect(decision(bash("crew skip w1 gate:lint --reason x --mode=dontAsk", mode))).toBe("deny");
  }
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
