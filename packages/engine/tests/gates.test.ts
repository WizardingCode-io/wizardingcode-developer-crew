import { expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  assess,
  depsAuditCommand,
  gatesForTarget,
  manifestChanged,
  plannedGates,
  runGates,
} from "../src/gates.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { ensureProfile, loadProfile } from "../src/profile.ts";
import type { Target } from "../src/types.ts";
import { addCriterion, addSkip, createWork } from "../src/work.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

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
  const profile = {
    version: 1 as const,
    detectedAt: "",
    targets: [target, { ...target, path: "apps/api" }],
    watch: { exclude: [] },
  };
  const root = tempDir();
  expect(plannedGates("fast", profile, DEFAULT_POLICY, ["src/a.ts"], root)).toEqual([
    { gate: "secrets", target: "." },
    { gate: "test", target: "." },
    { gate: "lint", target: "." },
  ]);
  expect(
    plannedGates("fast", profile, DEFAULT_POLICY, ["apps/api/x.php"], root).map((g) => g.target),
  ).toEqual([".", ".", ".", "apps/api", "apps/api"]);
});

/** A PATH that holds exactly these programs. */
function pathWith(...names: string[]): NodeJS.ProcessEnv {
  const dir = tempDir("bin-");
  for (const name of names) {
    write(dir, name, "#!/bin/sh\nexit 0\n");
    chmodSync(join(dir, name), 0o755);
  }
  return { ...process.env, PATH: dir };
}

test("I9: the dependency audit says why it cannot run: no lockfile, no binary", () => {
  const npm: Target = { ...target, packageManager: "npm" };
  const dir = tempDir();
  expect(depsAuditCommand(npm, dir, pathWith("npm"))).toEqual({ reason: "no lockfile" });
  write(dir, "npm-shrinkwrap.json", "{}");
  expect(depsAuditCommand(npm, dir, pathWith("npm"))).toEqual({
    command: "npm audit --audit-level=high",
  });
  expect(depsAuditCommand(npm, dir, pathWith())).toEqual({ reason: "npm not on PATH" });
  const nested: Target = { ...target, path: "apps/web" };
  write(dir, "apps/web/pnpm-lock.yaml", "");
  expect(depsAuditCommand(nested, dir, pathWith("pnpm"))).toEqual({
    command: "pnpm audit --audit-level=high",
  });
  const php: Target = { ...target, stack: "php", packageManager: "composer" };
  const app = tempDir();
  expect(depsAuditCommand(php, app, pathWith("composer"))).toEqual({ reason: "no lockfile" });
  write(app, "composer.lock", "{}");
  expect(depsAuditCommand(php, app, pathWith("composer"))).toEqual({ command: "composer audit" });
});

test("I9: Yarn Berry audits with yarn npm audit; classic Yarn with yarn audit", () => {
  const yarn: Target = { ...target, packageManager: "yarn" };
  const dir = tempDir();
  write(dir, "yarn.lock", "");
  expect(depsAuditCommand(yarn, dir, pathWith("yarn"))).toEqual({
    command: "yarn audit --level high",
  });
  write(dir, ".yarnrc.yml", "nodeLinker: node-modules\n");
  expect(depsAuditCommand(yarn, dir, pathWith("yarn"))).toEqual({
    command: "yarn npm audit --severity high",
  });
});

test("I9: Python audits through the detector's prefix, only when pip-audit exists", () => {
  const dir = tempDir();
  const python = (packageManager: string): Target => ({
    ...target,
    stack: "python",
    packageManager,
  });
  expect(depsAuditCommand(python("uv"), dir, pathWith())).toEqual({
    reason: "pip-audit not on PATH",
  });
  expect(depsAuditCommand(python("uv"), dir, pathWith("pip-audit"))).toEqual({
    command: "uv run pip-audit",
  });
  expect(depsAuditCommand(python("poetry"), dir, pathWith("pip-audit"))).toEqual({
    command: "poetry run pip-audit",
  });
  expect(depsAuditCommand(python("pip"), dir, pathWith("pip-audit"))).toEqual({
    command: "python -m pip_audit",
  });
});

test("I9: standard plans no audit it cannot run; full records it unavailable with the reason", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  expect(
    plannedGates("standard", profile, DEFAULT_POLICY, ["src/a.ts"], root).map((g) => g.gate),
  ).toEqual(["secrets", "test"]);
  const work = createWork(paths, "feature");
  work.route = "full";
  write(root, "src/a.ts", "y");
  const outcome = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["deps"] });
  expect(outcome.evidence.runs.find((r) => r.gate === "deps")).toMatchObject({
    status: "unavailable",
    reason: "no lockfile",
  });
});

test("runGates records results, replaces old runs and computes the verdict", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0", lint: "exit 1" } }),
    "src/a.ts": "x",
  });
  const paths = repoPaths(root, testEnv());
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

test("C1: --only never launders runs recorded on older code", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  addSkip(work, "tdd:AC-1", "manual");
  write(root, "src/a.ts", "y");
  const full = await runGates(paths, work, profile, DEFAULT_POLICY);
  expect(full.verdict).toBe("proven");
  write(root, "src/a.ts", "broken");
  const partial = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["secrets"] });
  expect(partial.verdict).toBe("unproven");
  expect(partial.unproven).toEqual(["gate test not run on the current code"]);
  expect(partial.evidence.runs.every((r) => typeof r.fingerprint === "string")).toBe(true);
});

test("C2: runGates carries the real tampered flag into the verdict it writes", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, "fix");
  work.route = "fast";
  const flagged = await runGates(paths, work, profile, DEFAULT_POLICY, { tampered: true });
  expect(flagged.tampered).toBe(true);
  expect(flagged.unproven).toContain("state changed outside the engine");
  writeFileSync(
    join(paths.crewDir, "work", work.id, "evidence.json"),
    JSON.stringify({ ...flagged.evidence, verdict: "proven" }),
  );
  const fromEvidence = await runGates(paths, work, profile, DEFAULT_POLICY);
  expect(fromEvidence.tampered).toBe(true);
  expect(fromEvidence.evidence.unproven).toContain("state changed outside the engine");
});

test("I1: a risk path committed before the gate run still raises the route", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "app/Auth/Guard.ts": "x",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, "fix");
  expect(work.baseCommit).toBe(git(root, "rev-parse", "HEAD"));
  work.route = "fast";
  write(root, "app/Auth/Guard.ts", "y");
  git(root, "commit", "-q", "-am", "work");
  const outcome = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["test"] });
  expect(outcome.changed).toEqual(["app/Auth/Guard.ts"]);
  expect(outcome.raised).toBe("full");
});

test("a diff that touches a risk path raises the route to full", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "app/Auth/Guard.ts": "x",
  });
  const paths = repoPaths(root, testEnv());
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

test("evidence recorded while git could not run is judged the same way once it can", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  // The walk counts every watched file as the change, the manifest included, which plans the
  // deps audit (unavailable here: no lockfile). That is a folder without git's behaviour, not
  // this test's subject.
  profile.watch.exclude.push("package.json");
  const work = createWork(paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  addSkip(work, "tdd:AC-1", "manual");
  write(root, "src/a.ts", "y");
  const bin = tempDir("bin-");
  write(bin, "git", "#!/bin/sh\nexit 1\n");
  chmodSync(join(bin, "git"), 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${bin}:${saved}`;
  let outcome: Awaited<ReturnType<typeof runGates>>;
  try {
    outcome = await runGates(paths, work, profile, DEFAULT_POLICY);
  } finally {
    process.env.PATH = saved;
  }
  expect(outcome.verdict).toBe("proven");
  expect(outcome.evidence.fingerprint).toMatch(/^walk:/);
  // The hook runs where git works: the same evidence still vouches for the same code.
  expect(assess(paths, work, profile, DEFAULT_POLICY).verdict).toBe("proven");
  write(root, "src/a.ts", "z");
  expect(assess(paths, work, profile, DEFAULT_POLICY).unproven).toEqual([
    "code changed since the last gate run",
  ]);
});

test("a workspace member plans only the gates it defines; the rest run once, at the package that lists it", () => {
  const rootTarget: Target = {
    ...target,
    gates: {
      test: { command: "bun test packages", source: "detected" },
      lint: { command: "l", source: "detected" },
    },
  };
  const profile = {
    version: 1 as const,
    detectedAt: "",
    targets: [
      rootTarget,
      { ...target, path: "packages/engine", gates: {}, workspaceOf: "." },
      {
        ...target,
        path: "packages/web",
        gates: { test: { command: "vitest", source: "detected" as const } },
        workspaceOf: ".",
      },
    ],
    watch: { exclude: [] },
  };
  const changed = ["packages/engine/src/a.ts", "packages/web/src/b.ts"];
  expect(plannedGates("fast", profile, DEFAULT_POLICY, changed, tempDir())).toEqual([
    { gate: "secrets", target: "." },
    { gate: "test", target: "." },
    { gate: "lint", target: "." },
    { gate: "test", target: "packages/web" },
  ]);
});
