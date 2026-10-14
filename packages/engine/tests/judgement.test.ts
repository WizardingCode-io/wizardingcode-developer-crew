import { expect, test } from "bun:test";
import { isInterfacePath, plannedJudgementGates } from "../src/judgement.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import type { Policy } from "../src/types.ts";

const names = (planned: { gate: string }[]) => planned.map((p) => p.gate);

test("SP2b: judgement gates are planned from the route, the risk areas, the diff and the policy", () => {
  expect(plannedJudgementGates("fast", [], ["src/a.ts"], DEFAULT_POLICY)).toEqual([]);
  expect(plannedJudgementGates("fast", [], ["src/App.vue"], DEFAULT_POLICY)).toEqual([
    { gate: "ui-ux", reason: "interface files: src/App.vue" },
  ]);
  expect(plannedJudgementGates("standard", [], ["src/a.ts"], DEFAULT_POLICY)).toEqual([
    { gate: "code-quality", reason: "standard route" },
    { gate: "test-quality", reason: "standard route" },
  ]);
  expect(names(plannedJudgementGates("standard", ["auth"], ["src/a.ts"], DEFAULT_POLICY))).toEqual([
    "code-quality",
    "test-quality",
    "security",
  ]);
  expect(plannedJudgementGates("standard", ["auth", "payments"], [], DEFAULT_POLICY)[2]).toEqual({
    gate: "security",
    reason: "risk areas auth, payments",
  });
  expect(
    plannedJudgementGates(
      "full",
      [],
      ["src/a.ts", "resources/views/home.blade.php"],
      DEFAULT_POLICY,
    ),
  ).toEqual([
    { gate: "code-quality", reason: "full route" },
    { gate: "test-quality", reason: "full route" },
    { gate: "security", reason: "full route" },
    { gate: "ui-ux", reason: "interface files: resources/views/home.blade.php" },
    { gate: "risk", reason: "full route" },
  ]);
  // The policy adds what the route does not; a gate already planned keeps its first reason.
  const policy: Policy = { ...DEFAULT_POLICY, judgementGates: ["security", "code-quality"] };
  expect(plannedJudgementGates("fast", [], ["src/a.ts"], policy)).toEqual([
    { gate: "security", reason: "policy" },
    { gate: "code-quality", reason: "policy" },
  ]);
  expect(plannedJudgementGates("standard", [], ["src/a.ts"], policy)).toEqual([
    { gate: "code-quality", reason: "standard route" },
    { gate: "test-quality", reason: "standard route" },
    { gate: "security", reason: "policy" },
  ]);
  // Many interface files: the first three are named.
  expect(
    plannedJudgementGates("fast", [], ["a.css", "b.scss", "c.less", "d.html"], DEFAULT_POLICY),
  ).toEqual([{ gate: "ui-ux", reason: "interface files: a.css, b.scss, c.less, +1 more" }]);
});

test("SP2b: an interface file is known by its extension or by living under resources/views/", () => {
  for (const path of [
    "src/App.vue",
    "src/x.svelte",
    "src/B.tsx",
    "src/c.jsx",
    "src/d.astro",
    "resources/views/a.blade.php",
    "public/index.html",
    "s.css",
    "s.scss",
    "s.less",
    "resources/views/mail/x.php",
    "apps/web/resources/views/y.txt",
  ])
    expect(isInterfacePath(path)).toBe(true);
  for (const path of [
    "src/a.ts",
    "src/a.php",
    "app/Http/Controllers/A.php",
    "views/a.txt",
    "docs/a.md",
    "src/Views.ts",
  ])
    expect(isInterfacePath(path)).toBe(false);
});
