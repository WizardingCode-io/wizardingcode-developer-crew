import { expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseAudit } from "../src/audit.ts";
import { emptyEvidence, loadEvidence, renderReport, saveEvidence } from "../src/evidence.ts";
import { computeFingerprint } from "../src/fingerprint.ts";
import {
  assess,
  depsAuditCommand,
  gatesForTarget,
  gateTimeoutMs,
  manifestChanged,
  plannedGates,
  runGates,
  runTaskGate,
  scopedTestCommand,
} from "../src/gates.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { namedFiles } from "../src/problems.ts";
import { ensureProfile, loadProfile, saveProfile } from "../src/profile.ts";
import type { Target } from "../src/types.ts";
import { addCriterion, addSkip, createWork } from "../src/work.ts";
import { git, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

test("SP2b: a gate run writes the review inputs when a judgement gate is planned, and nothing on a fast item without an interface file", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    "src/App.vue": "<template/>",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  write(root, "src/a.ts", "y");
  const plain = await runGates(paths, work, profile, DEFAULT_POLICY);
  expect(plain.judgement).toEqual([]);
  expect(plain.review).toBeNull();
  expect(existsSync(join(paths.crewDir, "work", work.id, "review"))).toBe(false);
  write(root, "src/App.vue", "<template>hi</template>");
  write(root, "src/new.ts", "new");
  const withUi = await runGates(paths, work, profile, DEFAULT_POLICY);
  expect(withUi.judgement).toEqual([{ gate: "ui-ux", reason: "interface files: src/App.vue" }]);
  expect(withUi.review).toBe(join(paths.crewDir, "work", work.id, "review"));
  const review = withUi.review ?? "";
  expect(readFileSync(join(review, "files.txt"), "utf8")).toBe(
    "src/App.vue\nsrc/a.ts\nsrc/new.ts\n",
  );
  const patch = readFileSync(join(review, "diff.patch"), "utf8");
  expect(patch).toContain("+++ b/src/App.vue");
  expect(patch).toContain("+<template>hi</template>");
  expect(patch).toContain("new file mode 100644\n--- /dev/null\n+++ b/src/new.ts");
  // The review folder is the session's, not the engine's: it moves neither the fingerprint nor the plan.
  const after = assess(paths, work, profile, DEFAULT_POLICY);
  expect(after.unproven).not.toContain("code changed since the last gate run");
  expect(after.judgement).toEqual(withUi.judgement);
});

test("SP2b: --only with judgement names alone runs no deterministic gate and rewrites the review inputs", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/App.vue": "<template/>",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  addSkip(work, "tdd:AC-1", "manual");
  write(root, "src/App.vue", "<template>a</template>");
  const only = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["ui-ux"] });
  expect(only.evidence.runs).toEqual([]);
  expect(only.judgement.map((j) => j.gate)).toEqual(["ui-ux"]);
  expect(readFileSync(join(only.review ?? "", "files.txt"), "utf8")).toBe("src/App.vue\n");
  expect(only.unproven.slice(0, 2)).toEqual(["gate secrets not run", "gate test not run"]);
  // A deterministic name beside a judgement name runs that gate alone.
  const mixed = await runGates(paths, work, profile, DEFAULT_POLICY, {
    only: ["secrets", "ui-ux"],
  });
  expect(mixed.evidence.runs.map((r) => r.gate)).toEqual(["secrets"]);
});

const target: Target = {
  path: ".",
  stack: "node",
  packageManager: "pnpm",
  gates: { test: { command: "t", source: "detected" }, lint: { command: "l", source: "detected" } },
  timeoutMs: 1000,
};

test("SP7a AC-2 (Task 6): the scoped test command takes the todo's source files under the target; without a template or a source file the target's test command runs whole", () => {
  const scoped: Target = {
    ...target,
    testScoped: { command: "vitest related {files} --run", source: "detected" },
  };
  expect(scopedTestCommand(scoped, ["src/a.ts", "src/b.ts", "docs/x.md"])).toBe(
    "vitest related src/a.ts src/b.ts --run",
  );
  expect(scopedTestCommand(target, ["src/a.ts"])).toBe("t");
  const api: Target = { ...scoped, path: "apps/api" };
  expect(scopedTestCommand(api, ["apps/api/src/a.ts", "web/b.ts"])).toBe(
    "vitest related src/a.ts --run",
  );
  // Only source files are passed: a Markdown file or a lockfile is never a test's subject.
  expect(scopedTestCommand(scoped, ["README.md", "pnpm-lock.yaml"])).toBe("t");
  // No test command at all: nothing to run.
  expect(scopedTestCommand({ ...target, gates: {} }, ["src/a.ts"])).toBeNull();
  // A file name the shell would read as syntax is one quoted word, so an implementer's branch cannot
  // smuggle a command into the lead's gate (the security lead's return R-1 of SP7a Task 6).
  // A `$` sequence a replacement string would read (`$&`, `$'`) stays the file's own characters.
  expect(
    scopedTestCommand(scoped, ["src/a b;touch X.ts", "src/ok.ts", "src/it's.ts", "src/a$&b$'c.ts"]),
  ).toBe(
    "vitest related 'src/a b;touch X.ts' src/ok.ts 'src/it'\\''s.ts' 'src/a$&b$'\\''c.ts' --run",
  );
});

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
  // The audit runs in JSON so its advisories can be read, and names the files a baseline needs (0.3.0).
  expect(depsAuditCommand(npm, dir, pathWith("npm"))).toEqual({
    command: "npm audit --audit-level=high --json",
    tool: "npm",
    files: ["package.json", "npm-shrinkwrap.json"],
  });
  expect(depsAuditCommand(npm, dir, pathWith())).toEqual({ reason: "npm not on PATH" });
  const nested: Target = { ...target, path: "apps/web" };
  write(dir, "apps/web/pnpm-lock.yaml", "");
  expect(depsAuditCommand(nested, dir, pathWith("pnpm"))).toEqual({
    command: "pnpm audit --audit-level=high --json",
    tool: "pnpm",
    files: ["package.json", "pnpm-lock.yaml"],
  });
  const php: Target = { ...target, stack: "php", packageManager: "composer" };
  const app = tempDir();
  expect(depsAuditCommand(php, app, pathWith("composer"))).toEqual({ reason: "no lockfile" });
  write(app, "composer.lock", "{}");
  expect(depsAuditCommand(php, app, pathWith("composer"))).toEqual({
    command: "composer audit --format=json --abandoned=report",
    tool: "composer",
    files: ["composer.json", "composer.lock"],
  });
});

test("I9: Yarn Berry audits with yarn npm audit; classic Yarn with yarn audit", () => {
  const yarn: Target = { ...target, packageManager: "yarn" };
  const dir = tempDir();
  write(dir, "yarn.lock", "");
  expect(depsAuditCommand(yarn, dir, pathWith("yarn"))).toMatchObject({
    command: "yarn audit --level high --json",
    tool: "yarn",
  });
  write(dir, ".yarnrc.yml", "nodeLinker: node-modules\n");
  expect(depsAuditCommand(yarn, dir, pathWith("yarn"))).toMatchObject({
    command: "yarn npm audit --severity high --json",
    tool: "yarn",
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
  expect(depsAuditCommand(python("uv"), dir, pathWith("pip-audit"))).toMatchObject({
    command: "uv run pip-audit --format=json",
    tool: "pip-audit",
  });
  expect(depsAuditCommand(python("poetry"), dir, pathWith("pip-audit"))).toMatchObject({
    command: "poetry run pip-audit --format=json",
    tool: "pip-audit",
  });
  expect(depsAuditCommand(python("pip"), dir, pathWith("pip-audit"))).toMatchObject({
    command: "python -m pip_audit --format=json",
    tool: "pip-audit",
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

test("0.3.0: parseAudit reads the advisories of each tool's JSON and says when it cannot", () => {
  const ghsa = "GHSA-p6mc-m468-83gw";
  const npm7 = JSON.stringify({
    vulnerabilities: {
      lodash: {
        severity: "high",
        via: [{ source: 1523, url: `https://github.com/advisories/${ghsa}`, title: "x" }, "other"],
      },
      other: { via: ["lodash"] },
    },
  });
  expect(parseAudit("npm", npm7)).toEqual({ readable: true, advisories: [ghsa], abandoned: [] });
  // npm 6 and pnpm: advisories by id, the GitHub id when it is there.
  const pnpm = JSON.stringify({
    advisories: {
      "1523": { id: 1523, url: "https://npmjs.com/advisories/1523", github_advisory_id: ghsa },
    },
  });
  expect(parseAudit("pnpm", pnpm).advisories).toEqual([ghsa]);
  const numeric = JSON.stringify({
    advisories: { "77": { id: 77, url: "https://npmjs.com/advisories/77" } },
  });
  expect(parseAudit("pnpm", numeric).advisories).toEqual(["npm-77"]);
  // yarn classic: one JSON object per line.
  const yarn = `{"type":"auditAdvisory","data":{"advisory":{"id":1523,"url":"https://github.com/advisories/${ghsa}"}}}\n{"type":"auditSummary","data":{"vulnerabilities":{"high":1}}}\n`;
  expect(parseAudit("yarn", yarn).advisories).toEqual([ghsa]);
  // bun: the registry's bulk format, advisories by package.
  const bun = JSON.stringify({
    lodash: [{ id: 1523, url: `https://github.com/advisories/${ghsa}`, severity: "high" }],
  });
  expect(parseAudit("bun", bun).advisories).toEqual([ghsa]);
  // composer: advisories by package, abandoned packages apart.
  const composer = JSON.stringify({
    advisories: { "a/b": [{ advisoryId: "PKSA-abcd-1234", cve: "CVE-2024-1", title: "t" }] },
    abandoned: { "symplify/x": null },
  });
  expect(parseAudit("composer", composer)).toEqual({
    readable: true,
    advisories: ["PKSA-abcd-1234"],
    abandoned: ["symplify/x"],
  });
  expect(
    parseAudit("composer", JSON.stringify({ advisories: [], abandoned: { "x/y": "z/w" } })),
  ).toEqual({ readable: true, advisories: [], abandoned: ["x/y"] });
  // pip-audit.
  const pip = JSON.stringify({
    dependencies: [
      { name: "requests", version: "2.0", vulns: [{ id: "PYSEC-2023-74", fix_versions: [] }] },
      { name: "ok", version: "1", vulns: [] },
    ],
  });
  expect(parseAudit("pip-audit", pip).advisories).toEqual(["PYSEC-2023-74"]);
  // Not the tool's JSON: unreadable. A warning line before the JSON is tolerated.
  expect(parseAudit("npm", "npm ERR! network\n")).toEqual({
    readable: false,
    advisories: [],
    abandoned: [],
  });
  expect(parseAudit("composer", `Deprecated: x\n${composer}`).advisories).toEqual([
    "PKSA-abcd-1234",
  ]);
});

test("0.3.0: the deps gate fails only on advisories absent from the base commit, reports an abandoned package, and falls back to the exit code", async () => {
  const bin = tempDir("bin-");
  // A fake npm whose audit report is the lockfile itself, so the base and the tree can differ.
  write(
    bin,
    "npm",
    "#!/bin/sh\ncat package-lock.json\ngrep -q GHSA package-lock.json && exit 1\nexit 0\n",
  );
  write(
    bin,
    "composer",
    `#!/bin/sh\necho '{"advisories":[],"abandoned":{"symplify/x":null}}'\nexit 2\n`,
  );
  write(bin, "pnpm", "#!/bin/sh\necho garbage\nexit 1\n");
  for (const name of ["npm", "composer", "pnpm"]) chmodSync(join(bin, name), 0o755);
  const savedPath = process.env.PATH;
  process.env.PATH = `${bin}:${savedPath}`;
  try {
    const old = "GHSA-old0-0000-0000";
    const fresh = "GHSA-new0-0000-0000";
    const known = JSON.stringify({
      vulnerabilities: { a: { via: [{ source: 1, url: `https://github.com/advisories/${old}` }] } },
    });
    const root = makeRepo({
      "package.json": JSON.stringify({ name: "x", scripts: { test: "exit 0" } }),
      "package-lock.json": known,
      "src/a.ts": "x",
    });
    const paths = repoPaths(root, testEnv());
    const { profile } = ensureProfile(paths);
    const work = createWork(paths, "chore");
    work.route = "full";
    // The item touches the lockfile and introduces nothing: the known advisory is debt, not failure.
    write(root, "package-lock.json", `${known}\n`);
    let outcome = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["deps"] });
    let run = outcome.evidence.runs.find((r) => r.gate === "deps");
    expect(run).toMatchObject({
      status: "pass",
      command: "npm audit --audit-level=high --json",
      advisories: { current: 1, known: 1, fresh: [], baselined: true },
    });
    expect(run?.reason).toBe("1 known before this item, none introduced");
    expect(outcome.unproven).not.toContain("gate deps failing");
    // A new advisory fails the gate and is named.
    const more = JSON.stringify({
      vulnerabilities: {
        a: { via: [{ source: 1, url: `https://github.com/advisories/${old}` }] },
        b: { via: [{ source: 2, url: `https://github.com/advisories/${fresh}` }] },
      },
    });
    write(root, "package-lock.json", more);
    outcome = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["deps"] });
    run = outcome.evidence.runs.find((r) => r.gate === "deps");
    expect(run).toMatchObject({
      status: "fail",
      advisories: { current: 2, known: 1, fresh: [fresh], baselined: true },
    });
    expect(run?.reason).toBe(`1 new: ${fresh}; 1 known before`);
    expect(outcome.unproven).toContain("gate deps failing");
    const report = renderReport(work, outcome.evidence, DEFAULT_POLICY);
    expect(report).toContain(`| deps | . | fail: 1 new (${fresh}), 1 known before |`);
    // No lockfile at the base commit: the baseline is empty and every advisory is new.
    const young = makeRepo({
      "package.json": JSON.stringify({ name: "y", scripts: { test: "exit 0" } }),
      "src/a.ts": "x",
    });
    const ypaths = repoPaths(young, testEnv());
    const yprofile = ensureProfile(ypaths).profile;
    const ywork = createWork(ypaths, "chore");
    ywork.route = "full";
    write(young, "package-lock.json", known);
    const first = (
      await runGates(ypaths, ywork, yprofile, DEFAULT_POLICY, { only: ["deps"] })
    ).evidence.runs.find((r) => r.gate === "deps");
    expect(first).toMatchObject({
      status: "fail",
      advisories: { current: 1, known: 0, fresh: [old], baselined: true },
    });
    // composer: an abandoned package is reported in the log and never fails the gate.
    const php = makeRepo({
      "composer.json": JSON.stringify({ scripts: { test: "true" } }),
      "composer.lock": "{}",
      "app/a.php": "<?php",
    });
    const ppaths = repoPaths(php, testEnv());
    const pprofile = ensureProfile(ppaths).profile;
    const pwork = createWork(ppaths, "chore");
    pwork.route = "full";
    write(php, "composer.lock", "{ }");
    const audit = (
      await runGates(ppaths, pwork, pprofile, DEFAULT_POLICY, { only: ["deps"] })
    ).evidence.runs.find((r) => r.gate === "deps");
    expect(audit).toMatchObject({
      status: "pass",
      command: "composer audit --format=json --abandoned=report",
      advisories: { current: 0, known: 0, fresh: [], baselined: true },
    });
    expect(audit?.tail).toContain("symplify/x");
    // A report that is not the tool's JSON: judged by the exit code, and the record says so.
    const bad = makeRepo({
      "package.json": JSON.stringify({ name: "z", scripts: { test: "exit 0" } }),
      "pnpm-lock.yaml": "",
      "src/a.ts": "x",
    });
    const bpaths = repoPaths(bad, testEnv());
    const bprofile = ensureProfile(bpaths).profile;
    const bwork = createWork(bpaths, "chore");
    bwork.route = "full";
    write(bad, "pnpm-lock.yaml", "x");
    const unreadable = (
      await runGates(bpaths, bwork, bprofile, DEFAULT_POLICY, { only: ["deps"] })
    ).evidence.runs.find((r) => r.gate === "deps");
    expect(unreadable).toMatchObject({
      status: "fail",
      reason: "audit report unreadable; judged by exit code",
    });
    expect(unreadable?.advisories).toBeUndefined();
  } finally {
    process.env.PATH = savedPath;
  }
});

test("0.3.0: lint and typecheck judge the files the item changed; a tool that names none is judged by its exit code", async () => {
  const lint = [
    "#!/bin/sh",
    'case "$CREW_TEST_LINT" in',
    '  old) echo "src/old.ts:1:1 error no-unused-vars"; echo "$PWD/src/old.ts"; echo "  3:5  error  x"; echo "src/old.ts(3,5): error TS2322: y"; exit 1;;',
    '  touched) echo "src/old.ts:1:1 error x"; echo "src/a.ts:2:3 error y"; exit 1;;',
    '  none) echo "3 errors"; exit 1;;',
    "esac",
    "exit 0",
  ].join("\n");
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "lint.sh": lint,
    "src/a.ts": "x",
    "src/old.ts": "x",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const node = profile.targets[0];
  if (!node) throw new Error("no target");
  node.gates.lint = { command: "sh lint.sh", source: "confirmed" };
  node.gates.typecheck = { command: "sh lint.sh", source: "confirmed" };
  saveProfile(paths, profile);
  const work = createWork(paths, "fix");
  write(root, "src/a.ts", "y");
  const run = async (mode: string, gate: "lint" | "typecheck") => {
    process.env.CREW_TEST_LINT = mode;
    try {
      const outcome = await runGates(paths, work, profile, DEFAULT_POLICY, { only: [gate] });
      return { outcome, run: outcome.evidence.runs.find((r) => r.gate === gate) };
    } finally {
      delete process.env.CREW_TEST_LINT;
    }
  };
  // Problems only in a file the item never touched, named in three formats: debt, not failure.
  const old = await run("old", "lint");
  expect(old.run).toMatchObject({ status: "pass", problems: { touched: [], untouched: 1 } });
  expect(old.run?.reason).toBe("1 file with problems, none changed by this item (pre-existing)");
  expect(old.outcome.unproven).not.toContain("gate lint failing");
  expect(renderReport(work, old.outcome.evidence, DEFAULT_POLICY)).toContain(
    "| lint | . | pass: 1 untouched file with problems, none of the item's |",
  );
  // The same judgement for typecheck.
  expect((await run("old", "typecheck")).run).toMatchObject({
    status: "pass",
    problems: { touched: [], untouched: 1 },
  });
  // A problem in a file the item changed fails, named; the untouched ones are counted apart.
  const touched = await run("touched", "lint");
  expect(touched.run).toMatchObject({
    status: "fail",
    problems: { touched: ["src/a.ts"], untouched: 1 },
  });
  expect(touched.run?.reason).toBe(
    "problems in files this item changed: src/a.ts; 1 untouched file also",
  );
  expect(touched.outcome.unproven).toContain("gate lint failing");
  expect(renderReport(work, touched.outcome.evidence, DEFAULT_POLICY)).toContain(
    "| lint | . | fail: problems in src/a.ts (1 untouched file also) |",
  );
  // No file named: the exit code decides, as before.
  const none = await run("none", "lint");
  expect(none.run).toMatchObject({ status: "fail" });
  expect(none.run?.problems).toBeUndefined();
  expect(none.run?.reason).toBeUndefined();
  // namedFiles reads the formats and ignores what is not a file on disk.
  expect(
    namedFiles(
      "src/old.ts:1:1 x\nhttps://example.com/a.ts\nrule no-x.ts\nsrc/missing.ts:1 y\n",
      [root],
      root,
    ),
  ).toEqual(["src/old.ts"]);
});

test("0.3.0: a build that rewrites watched files proves in one run: the stamp is taken after the build and the run records what it wrote", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "build.sh": '#!/bin/sh\nmkdir -p dist\necho "built $(cat src/a.ts)" > dist/out.js\n',
    "src/a.ts": "x",
    "dist/out.js": "built x\n",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const node = profile.targets[0];
  if (!node) throw new Error("no target");
  node.gates.build = { command: "sh build.sh", source: "confirmed" };
  saveProfile(paths, profile);
  const work = createWork(paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  addSkip(work, "tdd:AC-1", "manual");
  write(root, "src/a.ts", "y");
  const outcome = await runGates(paths, work, profile, DEFAULT_POLICY);
  expect(outcome.unproven).not.toContain("code changed since the last gate run");
  expect(outcome.verdict).toBe("proven");
  const build = outcome.evidence.runs.find((r) => r.gate === "build");
  expect(build).toMatchObject({ status: "pass", wrote: ["dist/out.js"] });
  // Every run of this gate run carries the post-build stamp, which is the tree as it is now.
  const now = computeFingerprint(root, profile, work);
  expect(outcome.evidence.fingerprint).toBe(now);
  for (const r of outcome.evidence.runs) expect(r.fingerprint).toBe(now);
  // A later edit still counts as a change.
  write(root, "src/a.ts", "z");
  expect(assess(paths, work, profile, DEFAULT_POLICY).unproven).toContain(
    "code changed since the last gate run",
  );
});

test("0.3.0: the test gate has twenty minutes by default, a gate may carry its own timeout, and the runner honours it", async () => {
  const t: Target = { ...target, timeoutMs: 600_000 };
  expect(gateTimeoutMs(t, "test")).toBe(20 * 60 * 1000);
  expect(gateTimeoutMs(t, "lint")).toBe(600_000);
  expect(gateTimeoutMs({ ...t, timeoutMs: 30 * 60 * 1000 }, "test")).toBe(30 * 60 * 1000);
  expect(
    gateTimeoutMs(
      { ...t, gates: { ...t.gates, test: { command: "t", source: "detected", timeoutMs: 50 } } },
      "test",
    ),
  ).toBe(50);
  // Honoured: a test gate with its own 100 ms times out on a two-second command.
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "sleep 2" } }),
    "src/a.ts": "x",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const node = profile.targets[0];
  if (!node) throw new Error("no target");
  node.gates.test = { command: "sleep 2", source: "confirmed", timeoutMs: 100 };
  saveProfile(paths, profile);
  const work = createWork(paths, "fix");
  write(root, "src/a.ts", "y");
  const outcome = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ["test"] });
  expect(outcome.evidence.runs.find((r) => r.gate === "test")).toMatchObject({
    status: "fail",
    reason: "timed out",
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

test("SP2c 8a AC-1: a profile with no target, or a change no target covers, plans a root test gate that ends unavailable with the proposal, and the verdict names it", async () => {
  const none = { version: 1 as const, detectedAt: "", targets: [], watch: { exclude: [] } };
  const root = tempDir();
  expect(plannedGates("fast", none, DEFAULT_POLICY, ["src/greet.sh"], root)).toEqual([
    { gate: "secrets", target: "." },
    { gate: "test", target: "." },
  ]);
  const api = { ...none, targets: [{ ...target, path: "apps/api" }] };
  expect(plannedGates("fast", api, DEFAULT_POLICY, ["scripts/x.sh"], root)).toEqual([
    { gate: "secrets", target: "." },
    { gate: "test", target: "." },
  ]);
  // A change inside the target plans that target's gates and no root gate.
  expect(
    plannedGates("fast", api, DEFAULT_POLICY, ["apps/api/x.ts"], root).map((g) => g.target),
  ).toEqual([".", "apps/api", "apps/api"]);
  // A Makefile-only project: the engine detects no target, so the test gate at the root is
  // unavailable until a command is set, and the item is never proven by the secrets gate alone.
  const repo = makeRepo({ Makefile: "test:\n\tsh tests/run.sh\n", "src/greet.sh": "echo hi\n" });
  const paths = repoPaths(repo, testEnv());
  const { profile } = ensureProfile(paths);
  expect(profile.targets).toEqual([]);
  const work = createWork(paths, "fix the greeting");
  addCriterion(work, "greets");
  write(repo, "src/greet.sh", "echo hello\n");
  const outcome = await runGates(paths, work, profile, DEFAULT_POLICY);
  expect(outcome.evidence.runs.find((r) => r.gate === "test")).toMatchObject({
    target: ".",
    status: "unavailable",
    reason: 'no test command (crew profile set test "<cmd>")',
  });
  expect(outcome.verdict).toBe("unproven");
  expect(outcome.unproven).toContain(
    'gate test unavailable: no test command (crew profile set test "<cmd>")',
  );
});

test("SP7a AC-3 (Task 6): runTaskGate runs the todo's files through the scoped template, never the secrets scan, fails the todo on a failing or unavailable test gate, and writes nothing to the item's evidence", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    "src/fail.ts": "y",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const target = profile.targets[0];
  if (!target) throw new Error("no target detected");
  const template = `node -e "process.exit(process.argv[1].includes('fail') ? 1 : 0)" {files}`;
  target.testScoped = { command: template, source: "confirmed" };
  const work = createWork(paths, "feature");
  work.route = "standard";
  addCriterion(work, "x");
  const passed = await runTaskGate(paths, work, profile, DEFAULT_POLICY, ["src/a.ts"]);
  expect(passed.status).toBe("pass");
  expect(passed.runs.map((r) => r.gate)).toEqual(["test"]);
  expect(passed.runs[0]).toMatchObject({
    status: "pass",
    command: template.replace("{files}", "src/a.ts"),
  });
  const failed = await runTaskGate(paths, work, profile, DEFAULT_POLICY, ["src/fail.ts"]);
  expect(failed.status).toBe("fail");
  expect(failed.runs[0]).toMatchObject({ gate: "test", status: "fail", exit: 1 });
  const bare = {
    ...profile,
    targets: [{ ...target, gates: { ...target.gates, test: undefined } }],
  };
  const unavailable = await runTaskGate(paths, work, bare, DEFAULT_POLICY, ["src/a.ts"]);
  expect(unavailable.status).toBe("fail");
  expect(unavailable.runs[0]).toMatchObject({
    gate: "test",
    status: "unavailable",
    reason: "no command",
  });
  expect(loadEvidence(paths, work.id).evidence.runs).toEqual([]);
});
