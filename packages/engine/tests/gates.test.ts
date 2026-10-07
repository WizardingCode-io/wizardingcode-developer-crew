import { expect, test } from "bun:test";
import {
  assess,
  depsAuditCommand,
  gatesForTarget,
  manifestChanged,
  plannedGates,
  runGates,
} from "../src/gates.ts";
import { resolvePaths } from "../src/paths.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { ensureProfile, loadProfile } from "../src/profile.ts";
import type { Target } from "../src/types.ts";
import { addCriterion, addSkip, createWork } from "../src/work.ts";
import { makeRepo, testEnv, write } from "./helpers.ts";

const target: Target = {
  path: ".",
  stack: "node",
  packageManager: "pnpm",
  gates: { test: { command: "t", source: "detected" }, lint: { command: "l", source: "detected" } },
  timeoutMs: 1000,
};

test("planned gates follow the route table", () => {
  expect(gatesForTarget("fast", target, DEFAULT_POLICY, ["src/a.ts"])).toEqual(["test", "lint"]);
  expect(gatesForTarget("fast", target, DEFAULT_POLICY, ["package.json"])).toEqual([
    "test",
    "lint",
    "deps",
  ]);
  expect(gatesForTarget("full", target, DEFAULT_POLICY, [])).toEqual(["test", "lint", "deps"]);
  expect(
    gatesForTarget("fast", target, { ...DEFAULT_POLICY, requiredGates: ["typecheck"] }, []),
  ).toEqual(["test", "lint", "typecheck"]);
  expect(manifestChanged(["a/requirements-dev.txt"])).toBe(true);
  expect(depsAuditCommand(target)).toBe("pnpm audit --audit-level=high");
  expect(depsAuditCommand({ ...target, stack: "php", packageManager: "composer" })).toBe(
    "composer audit",
  );
  const profile = {
    version: 1 as const,
    detectedAt: "",
    targets: [target, { ...target, path: "apps/api" }],
    watch: { exclude: [] },
  };
  expect(plannedGates("fast", profile, DEFAULT_POLICY, ["src/a.ts"])).toEqual([
    { gate: "secrets", target: "." },
    { gate: "test", target: "." },
    { gate: "lint", target: "." },
  ]);
  expect(
    plannedGates("fast", profile, DEFAULT_POLICY, ["apps/api/x.php"]).map((g) => g.target),
  ).toEqual([".", ".", ".", "apps/api", "apps/api"]);
});

test("runGates records results, replaces old runs and computes the verdict", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0", lint: "exit 1" } }),
    "src/a.ts": "x",
  });
  const paths = resolvePaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  expect(loadProfile(paths).profile?.targets[0]?.gates.test?.command).toBe("npm run test");
  const work = createWork(paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  write(root, "src/a.ts", "y");
  const first = await runGates(paths, work, profile, DEFAULT_POLICY);
  expect(first.evidence.runs.map((r) => `${r.gate}:${r.status}`)).toEqual([
    "secrets:pass",
    "test:pass",
    "lint:fail",
  ]);
  expect(first.unproven).toEqual(["gate lint failing", "test-first record missing for AC-1"]);
  addSkip(work, "gate:lint", "legacy");
  addSkip(work, "tdd:AC-1", "manual");
  const second = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["test"] });
  expect(second.evidence.runs.filter((r) => r.gate === "test")).toHaveLength(1);
  expect(second.verdict).toBe("proven");
  const later = assess(paths, work, profile, DEFAULT_POLICY);
  expect(later.verdict).toBe("proven");
  write(root, "src/a.ts", "z");
  expect(assess(paths, work, profile, DEFAULT_POLICY).unproven).toEqual([
    "code changed since the last gate run",
  ]);
});

test("a diff that touches a risk path raises the route to full", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "app/Auth/Guard.ts": "x",
  });
  const paths = resolvePaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, "fix");
  work.route = "fast";
  write(root, "app/Auth/Guard.ts", "y");
  const outcome = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["test"] });
  expect(outcome.raised).toBe("full");
  // runGates mutates work.route; widen the type so the assignment above does not narrow it to "fast".
  expect(work.route as string).toBe("full");
  expect(work.riskAreas).toEqual(["auth"]);
  expect(work.routeReasons.at(-1)).toBe("raised to full: the change touches auth paths");
});
