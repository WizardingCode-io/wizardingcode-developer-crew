import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { releaseFiles } from "../../../scripts/release.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (rel: string) => readFileSync(`${root}${rel}`, "utf8");

test("2026-10-25-005 AC-11: ADR 0015 records the decisions and supersedes ADR 0013's points 2 and 4, CLAUDE.md names the release script and the loop while releaseFiles still reads its eight files, the improve folder has its README, and finding 163 reads closed", () => {
  const adr = read("docs/adr/0015-the-loop-runs-always-and-releases-what-it-proves.md");
  for (const d of ["D-1", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8", "D-9"])
    expect(adr).toContain(d);
  expect(adr).toContain("Supersedes points 2 and 4 of [ADR 0013]");
  expect(adr).toContain("ADR 0012 does not apply");
  const earlier = read("docs/adr/0013-harness-improvement-loop.md");
  expect(earlier).toContain("points 2 and 4 superseded by [ADR 0015]");
  const claude = read("CLAUDE.md");
  const releasing = claude.slice(claude.indexOf("## Releasing"), claude.indexOf("## Conventions"));
  expect(releasing).toContain("bun scripts/release.ts --patch");
  expect(releasing).toContain("bun scripts/improve-loop.ts install");
  expect(releasing).toContain("bun scripts/improve-loop.ts status");
  expect(releaseFiles(root)).toEqual([
    "package.json",
    "packages/engine/package.json",
    "packages/engine/src/version.ts",
    "packs/agentic-os/.claude-plugin/plugin.json",
    "packs/agentic-os/pack.json",
    // SP9 Task 10 (2026-10-27-005) edits this list: the frontend pack's two files.
    "packs/frontend/.claude-plugin/plugin.json",
    "packs/frontend/pack.json",
    "packs/laravel/.claude-plugin/plugin.json",
    "packs/laravel/pack.json",
    "plugins/core/.claude-plugin/plugin.json",
  ]);
  expect(existsSync(`${root}docs/improve/README.md`)).toBe(true);
  expect(read("README.md")).toContain("bun scripts/improve-loop.ts install");
  const findings = read("docs/real-use/findings.md");
  const section = findings.slice(findings.indexOf("### 163."), findings.indexOf("### 164."));
  expect(/\n- Outcome: closed in `2026-10-25-005`/.test(section)).toBe(true);
});
