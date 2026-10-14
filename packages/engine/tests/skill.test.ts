import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const skill = readFileSync(
  fileURLToPath(new URL("../../../plugins/core/skills/crew/SKILL.md", import.meta.url)),
  "utf8",
);

test("the rules say one checkout per session, a worktree for each lane", () => {
  const rules = skill.slice(skill.indexOf("## Rules that do not bend"));
  expect(rules).toMatch(/one checkout per session/i);
  expect(rules).toMatch(/git worktree add/);
  expect(rules).toMatch(/every watched file/);
});
