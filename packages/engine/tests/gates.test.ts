import { expect, test } from "bun:test";
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { emptyEvidence, renderReport, saveEvidence } from "../src/evidence.ts";
import {
  assess,
  depsAuditCommand,
  gatesForTarget,
  manifestChanged,
  plannedGates,
  runGates,
} from "../src/gates.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { ensureProfile, loadProfile, saveProfile } from "../src/profile.ts";
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
  expect(gatesForTarget(target, DEFAULT_POLICY, ["src/a.ts"])).toEqual(["test", "lint"]);
  expect(gatesForTarget(target, DEFAULT_POLICY, ["package.json"])).toEqual([
    "test",
    "lint",
    "deps",
  ]);
  expect(gatesForTarget(target, DEFAULT_POLICY, [])).toEqual(["test", "lint"]);
  expect(gatesForTarget(target, DEFAULT_POLICY, ["composer.lock"])).toEqual([
    "test",
    "lint",
    "deps",
  ]);
  expect(gatesForTarget(target, { ...DEFAULT_POLICY, requiredGates: ["typecheck"] }, [])).toEqual([
    "test",
    "lint",
    "typecheck",
  ]);
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
  write(root, "package.json", JSON.stringify({ name: "x", scripts: { test: "exit 0" } }));
  const outcome = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["deps"] });
  expect(outcome.evidence.runs.find((r) => r.gate === "deps")).toMatchObject({
    status: "unavailable",
    reason: "no lockfile",
  });
});

test("finding 10: on every route the audit is planned only when the change touches a dependency", () => {
  expect(gatesForTarget(target, DEFAULT_POLICY, ["src/a.ts"])).toEqual(["test", "lint"]);
  expect(gatesForTarget(target, DEFAULT_POLICY, ["src/a.ts", "pnpm-lock.yaml"])).toEqual([
    "test",
    "lint",
    "deps",
  ]);
  expect(
    gatesForTarget(target, { ...DEFAULT_POLICY, requiredGates: ["deps"] }, ["src/a.ts"]),
  ).toEqual(["test", "lint", "deps"]);
  const profile = {
    version: 1 as const,
    detectedAt: "",
    targets: [target],
    watch: { exclude: [] },
  };
  for (const route of ["fast", "standard", "full"] as const) {
    expect(
      plannedGates(route, profile, DEFAULT_POLICY, ["src/a.ts"], tempDir()).map((g) => g.gate),
    ).toEqual(["secrets", "test", "lint"]);
  }
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

test("findings 1 and 14: an excluded risk path raises nothing, and the record says so once", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "plugins/core/hooks/session-start.ts": "x",
    "app/Auth/Guard.ts": "x",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const policy = { ...DEFAULT_POLICY, riskPathExclusions: ["plugins/core/hooks/session-*.ts"] };
  const work = createWork(paths, "fix");
  work.route = "fast";
  write(root, "plugins/core/hooks/session-start.ts", "y");
  const first = await runGates(paths, work, profile, policy, { only: ["test"] });
  expect(first.raised).toBeNull();
  expect(work.route as string).toBe("fast");
  expect(work.riskAreas).toEqual([]);
  expect(work.routeReasons.at(-1)).toBe(
    "risk paths excluded by the team policy: plugins/core/hooks/session-start.ts",
  );
  // A second run does not repeat the line; the report shows it with the route.
  await runGates(paths, work, profile, policy, { only: ["test"] });
  expect(work.routeReasons.filter((r) => r.startsWith("risk paths excluded"))).toHaveLength(1);
  const report = renderReport(work, first.evidence, policy);
  expect(report).toContain(
    "risk paths excluded by the team policy: plugins/core/hooks/session-start.ts",
  );
  // Another changed path that is not excluded still raises the route.
  write(root, "app/Auth/Guard.ts", "y");
  const third = await runGates(paths, work, profile, policy, { only: ["test"] });
  expect(third.raised).toBe("full");
  expect(work.riskAreas).toEqual(["auth"]);
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

const php: Target = {
  path: ".",
  stack: "php",
  packageManager: "composer",
  gates: {
    test: { command: "sh pest.sh", source: "detected" },
    lint: { command: "sh pint.sh", source: "detected" },
  },
  timeoutMs: 1000,
};

test("finding 8: two targets at one path plan each target's gates once, keyed by stack", () => {
  const profile = {
    version: 1 as const,
    detectedAt: "",
    targets: [target, php],
    watch: { exclude: [] },
  };
  const planned = plannedGates("fast", profile, DEFAULT_POLICY, ["src/a.ts"], tempDir());
  expect(planned).toEqual([
    { gate: "secrets", target: "." },
    { gate: "test", target: ".", stack: "node" },
    { gate: "lint", target: ".", stack: "node" },
    { gate: "test", target: ".", stack: "php" },
    { gate: "lint", target: ".", stack: "php" },
  ]);
  const keys = planned.map((g) => `${g.gate}@${g.target}@${g.stack ?? ""}`);
  expect(new Set(keys).size).toBe(keys.length);
  // A path with one target is named by its path alone, as before.
  const alone = { ...profile, targets: [target, { ...php, path: "api" }] };
  expect(plannedGates("fast", alone, DEFAULT_POLICY, ["api/x.php"], tempDir())).toEqual([
    { gate: "secrets", target: "." },
    { gate: "test", target: "." },
    { gate: "lint", target: "." },
    { gate: "test", target: "api" },
    { gate: "lint", target: "api" },
  ]);
});

test("finding 8: each target at a shared path runs its own command, recorded and labelled by stack", async () => {
  const root = makeRepo({
    "src/a.ts": "x",
    "node.sh": "exit 0\n",
    "pest.sh": "exit 0\n",
    "pint.sh": "exit 1\n",
  });
  const paths = repoPaths(root, testEnv());
  const node: Target = {
    ...target,
    packageManager: "bun",
    gates: {
      test: { command: "sh node.sh", source: "detected" },
      lint: { command: "sh node.sh", source: "detected" },
    },
  };
  const profile = {
    version: 1 as const,
    detectedAt: "",
    targets: [node, php],
    watch: { exclude: [".crew/**"] },
  };
  saveProfile(paths, profile);
  const work = createWork(paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  addSkip(work, "tdd:AC-1", "manual");
  // A row written by an earlier release names no stack: at a shared path it is replaced, never matched.
  const legacy = {
    gate: "test" as const,
    target: ".",
    command: "old",
    commandSource: "detected" as const,
    confirmed: true,
    exit: 0,
    status: "pass" as const,
    durationMs: 1,
    at: "t",
    log: null,
    tail: "",
    fingerprint: "f",
  };
  saveEvidence(paths, work.id, { ...emptyEvidence(), fingerprint: "f", runs: [legacy] });
  write(root, "src/a.ts", "y");
  const outcome = await runGates(paths, work, profile, DEFAULT_POLICY);
  expect(
    outcome.evidence.runs.map((r) => `${r.gate}@${r.stack ?? "-"}:${r.command}:${r.status}`),
  ).toEqual([
    "secrets@-:built-in secret scan:pass",
    "test@node:sh node.sh:pass",
    "lint@node:sh node.sh:pass",
    "test@php:sh pest.sh:pass",
    "lint@php:sh pint.sh:fail",
  ]);
  const pint = outcome.evidence.runs.find((r) => r.gate === "lint" && r.stack === "php");
  expect(pint?.log).toMatch(/^logs\/lint-_-php-\d+\.txt$/);
  expect(outcome.unproven).toEqual(["gate lint (php) failing"]);
  const report = renderReport(work, outcome.evidence, DEFAULT_POLICY);
  expect(report).toContain("| test | . (node) | pass | `sh node.sh` |");
  expect(report).toContain("| lint | . (php) | fail | `sh pint.sh` |");
  expect(report).toContain("| secrets | . | pass |");
});
