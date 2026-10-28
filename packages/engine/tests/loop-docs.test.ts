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
    // SP9 Task 12 (2026-10-28-005) edits this list: the next pack's two files, before nuxt's in order.
    "packs/next/.claude-plugin/plugin.json",
    "packs/next/pack.json",
    // SP9 Task 11 (2026-10-28-003) edits this list: the nuxt pack's two files.
    "packs/nuxt/.claude-plugin/plugin.json",
    "packs/nuxt/pack.json",
    "plugins/core/.claude-plugin/plugin.json",
  ]);
  expect(existsSync(`${root}docs/improve/README.md`)).toBe(true);
  expect(read("README.md")).toContain("bun scripts/improve-loop.ts install");
  const findings = read("docs/real-use/findings.md");
  const section = findings.slice(findings.indexOf("### 163."), findings.indexOf("### 164."));
  expect(/\n- Outcome: closed in `2026-10-25-005`/.test(section)).toBe(true);
});

// 2026-10-27-006 AC-3: the verdict's rule and the two ceilings, where a reader looks.
test("2026-10-27-006 AC-3: ADR 0013 carries the dated note on the verdict by dominance over the baseline's median and on the two ceilings; the loop's README names maxRunUsd and maxDayUsd with their defaults, the meaning of 0 and the report's Skipped ticks section", () => {
  const adr = read("docs/adr/0013-harness-improvement-loop.md");
  expect(adr).toContain("2026-10-27");
  expect(adr).toMatch(/median/);
  expect(adr).toContain("maxRunUsd");
  expect(adr).toContain("maxDayUsd");
  expect(adr).toContain("154.85 USD");
  const readme = read("docs/improve/README.md");
  expect(readme).toContain("`maxRunUsd`");
  expect(readme).toContain("`maxDayUsd`");
  expect(readme).toMatch(/20 USD/);
  expect(readme).toMatch(/60 USD/);
  expect(readme).toMatch(/`0`[^.\n]*no ceiling/);
  expect(readme).toContain("Skipped ticks");
});

// 2026-10-28-001 AC-5: the loop's README names the three commands, the relaunch, the unprobed status, the five exit statuses and the dead ticks; ADR 0015 carries the dated note.
test("2026-10-28-001 AC-5: the README documents pause, resume and stop (kill -KILL the last resort), the relaunch, unprobed, the five exit statuses and Dead ticks; ADR 0015 has the note of 2026-10-28", () => {
  const readme = read("docs/improve/README.md");
  for (const word of [
    "`pause`",
    "`resume`",
    "`stop`",
    "kill -KILL",
    "--relaunched",
    "`unprobed`",
    "Dead ticks",
    "stopped by the user",
  ])
    expect(readme, word).toContain(word);
  expect(readme).toMatch(
    /\b0\b[^.\n]*done[^.\n]*\b1\b[^.\n]*refused[^.\n]*\b2\b[^.\n]*ceiling[^.\n]*\b3\b[^.\n]*failure[^.\n]*\b4\b[^.\n]*stopped by the user/,
  );
  const adr = read("docs/adr/0015-the-loop-runs-always-and-releases-what-it-proves.md");
  expect(adr).toContain("2026-10-28");
  for (const word of ["`stop`", "relaunch", "unprobed", "dead tick"])
    expect(adr, word).toContain(word);
});
