import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTarball } from "../../../scripts/tarball.ts";
import { VERSION } from "../src/version.ts";
import { makeRepo, tempDir } from "./helpers.ts";

// SP6 Task 4 AC-6: the plugin folder as the distribution on every runtime.

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const TOP = "wizardingcode-developer-crew";

function entries(archive: string): { mode: string; path: string }[] {
  return execFileSync("tar", ["-tzvf", archive], { encoding: "utf8" })
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      const parts = l.trim().split(/\s+/);
      return { mode: parts[0] ?? "", path: parts[parts.length - 1] ?? "" };
    });
}

test("SP6-T4 AC-6 (judgement round 2): bun scripts/build.ts --tarball builds the archive into dist/ after the bundle, the branch read from the script", () => {
  const script = readFileSync(join(REPO, "scripts", "build.ts"), "utf8");
  expect(script).toContain('import { archiveKilobytes, buildTarball } from "./tarball.ts";');
  expect(script).toMatch(
    /if \(process\.argv\.includes\("--tarball"\)\) \{\n\s+const archive = buildTarball\(VERSION, "dist"\);\n\s+console\.log\(`built \$\{archive\} \(\$\{archiveKilobytes\(archive\)\} KB\)`\);\n\}/,
  );
  // After the bundle: the archive takes dist/crew.mjs as built.
  expect(script.indexOf("--tarball")).toBeGreaterThan(script.indexOf(`built \${outdir}/crew.mjs`));
});

test("SP6-T4 AC-6: buildTarball writes the archive of plugins/core under one folder with the exact top-level set, bin/crew executable, no evals and no tsconfig; bin/crew --version runs the bundle from another cwd and through a symlink", () => {
  const out = tempDir("tarball-");
  const archive = buildTarball(VERSION, out);
  expect(archive).toBe(join(out, `${TOP}-${VERSION}.tar.gz`));
  expect(existsSync(archive)).toBe(true);
  const listed = entries(archive).filter((e) => !e.mode.startsWith("d"));
  const paths = listed.map((e) => e.path).sort();
  const top = [...new Set(paths.map((p) => p.split("/").slice(0, 2).join("/")))].sort();
  expect(top).toEqual([
    `${TOP}/.claude-plugin`,
    `${TOP}/agents`,
    `${TOP}/bin`,
    `${TOP}/dist`,
    `${TOP}/hooks`,
    `${TOP}/skills`,
  ]);
  expect(paths).toContain(`${TOP}/.claude-plugin/plugin.json`);
  expect(paths).toContain(`${TOP}/dist/crew.mjs`);
  expect(paths).toContain(`${TOP}/hooks/hooks.json`);
  expect(paths).toContain(`${TOP}/hooks/register.js`);
  expect(paths).toContain(`${TOP}/skills/crew/SKILL.md`);
  expect(paths).toContain(`${TOP}/skills/crew/references/rules.md`);
  expect(paths.filter((p) => p.startsWith(`${TOP}/agents/`))).toHaveLength(15);
  expect(paths.some((p) => p.includes("/evals/"))).toBe(false);
  expect(paths.some((p) => p.endsWith("tsconfig.json"))).toBe(false);
  expect(paths.some((p) => p.includes("/dist/") && !p.endsWith("crew.mjs"))).toBe(false);
  const bin = listed.find((e) => e.path === `${TOP}/bin/crew`);
  expect(bin?.mode).toBe("-rwxr-xr-x");
  // Extracted, the launcher runs the bundle from any cwd and through a symlink into a PATH folder.
  const extracted = tempDir("extracted-");
  execFileSync("tar", ["-xzf", archive, "-C", extracted]);
  const crew = join(extracted, TOP, "bin", "crew");
  const elsewhere = tempDir("elsewhere-");
  expect(execFileSync(crew, ["--version"], { cwd: elsewhere, encoding: "utf8" }).trim()).toBe(
    VERSION,
  );
  const binDir = tempDir("path-");
  symlinkSync(crew, join(binDir, "crew"));
  expect(
    execFileSync(join(binDir, "crew"), ["--version"], { cwd: elsewhere, encoding: "utf8" }).trim(),
  ).toBe(VERSION);
  // The release section names the asset and the install from it.
  const claudeMd = readFileSync(join(REPO, "CLAUDE.md"), "utf8");
  expect(claudeMd).toContain("bun scripts/build.ts --tarball");
  expect(claudeMd).toContain(
    "gh release create vX.Y.Z dist/wizardingcode-developer-crew-X.Y.Z.tar.gz",
  );
  expect(claudeMd).toContain("crew runtime install <name>");
});

test("SP6-T4 AC-8: crew runtime install and check run from the extracted tarball's tree, with no tests folder, against a fixture repository", () => {
  const out = tempDir("tarball-");
  const archive = buildTarball(VERSION, out);
  const extracted = tempDir("extracted-");
  execFileSync("tar", ["-xzf", archive, "-C", extracted]);
  const root = join(extracted, TOP);
  expect(existsSync(join(root, "tests"))).toBe(false);
  const crew = join(root, "bin", "crew");
  const repo = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const home = tempDir("home-");
  mkdirSync(join(home, ".wizardingcode"), { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    WIZARDINGCODE_HOME: join(home, ".wizardingcode"),
  };
  delete env.CLAUDE_PLUGIN_ROOT;
  const run = (...args: string[]) => execFileSync(crew, args, { cwd: repo, env, encoding: "utf8" });
  const installed = run("runtime", "install", "cursor");
  expect(installed).toContain(join(repo, ".cursor", "hooks.json"));
  const hooks = JSON.parse(readFileSync(join(repo, ".cursor", "hooks.json"), "utf8")) as {
    hooks: { preToolUse: { command: string }[] };
  };
  expect(hooks.hooks.preToolUse[0]?.command).toBe(
    `node ${root}/dist/crew.mjs hook pre-tool-use --runtime cursor`,
  );
  const checked = run("runtime", "check", "cursor");
  expect(checked.split("\n")[1]).toBe(`root: ${root} ok`);
  expect(checked).toContain("\nskill: ok\n");
  expect(checked).toContain("\nagents: ok\n");
  // The hook itself, through the extracted bundle, on a write to the engine's own file.
  writeFileSync(
    join(repo, "payload.json"),
    JSON.stringify({
      conversation_id: "c1",
      workspace_roots: [repo],
      tool_name: "Write",
      tool_input: { file_path: ".crew/profile.json" },
    }),
  );
  const denied = execFileSync(
    "sh",
    ["-c", `node ${root}/dist/crew.mjs hook pre-tool-use --runtime cursor < payload.json`],
    { cwd: repo, env, encoding: "utf8" },
  );
  expect(JSON.parse(denied)).toEqual({
    permission: "deny",
    agent_message: `Crew: ${join(repo, ".crew", "profile.json")} is maintained by the engine and is changed through the crew command`,
  });
});
