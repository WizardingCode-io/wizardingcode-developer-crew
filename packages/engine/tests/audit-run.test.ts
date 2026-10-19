import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { AuditRun, AuditRuns, AuditScope } from "../src/audit-run.ts";
import { auditFiles, auditScope, cappedRefusal, runAudit, staleRefusal } from "../src/audit-run.ts";
import { workDir } from "../src/paths.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { ensureProfile } from "../src/profile.ts";
import { applyClassification, createWork } from "../src/work.ts";
import { git, makeRepo, repoPaths, testEnv } from "./helpers.ts";

/** The planted key, assembled at run time so this repository's own secrets gate never sees it in a diff. */
export const PLANTED_KEY = ["AKIA", "IOSFODNN7EXAMPLE1"].join("");

/**
 * The audited project: a build that passes, a test that fails, a planted key, a migration (the
 * data-migration risk area) and a node_modules folder the walk skips. Built here, never committed
 * to this repository: a planted secret in a fixture folder would fail the repository's own gate.
 */
export function auditFixture(): string {
  return makeRepo({
    "package.json": JSON.stringify({
      name: "audited",
      scripts: { build: "exit 0", test: "exit 1" },
    }),
    "src/a.ts": "export const a = 1;\n",
    "src/db/migrations/001_init.sql": "create table t (id int);\n",
    "config/keys.ts": `export const aws = "${PLANTED_KEY}";\n`,
    "node_modules/dep/index.js": "module.exports = 1;\n",
  });
}

function auditItem(root: string) {
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, "Audit this project");
  applyClassification(
    work,
    "audit",
    { route: "full", reasons: [], riskAreas: [] },
    { kind: "audit", from: "work_type audit" },
  );
  work.phase = "audit";
  return { paths, profile, work };
}

/** A hash of every file of the project outside `.crew` and `.git`: the run must leave it as it was. */
function treeHash(root: string): string {
  const hash = createHash("sha256");
  const walk = (dir: string, rel: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      if (rel === "" && (entry.name === ".crew" || entry.name === ".git")) continue;
      const path = join(dir, entry.name);
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(path, relPath);
      else hash.update(`${relPath}\n`).update(readFileSync(path)).update("\n");
    }
  };
  walk(root, "");
  return hash.digest("hex");
}

function readRuns(paths: ReturnType<typeof repoPaths>, id: string): AuditRuns {
  return JSON.parse(readFileSync(join(workDir(paths, id), "audit", "runs.json"), "utf8"));
}

function byGate(runs: AuditRuns, gate: string): AuditRun | undefined {
  return runs.runs.find((r) => r.gate === gate);
}

test("SP8-T4 AC-1, AC-4: the audit runs every tool over the whole tree with no baseline, records a failure with its log and never blocks, and leaves the tree as it was", async () => {
  const root = auditFixture();
  const { paths, profile, work } = auditItem(root);
  const before = treeHash(root);
  const result = await runAudit(paths, work, profile, DEFAULT_POLICY, {});
  if (!("runs" in result)) throw new Error("the fixture is under the cap and HEAD unchanged");
  const runs = result;
  expect(treeHash(root)).toBe(before);
  expect(runs.head).toBe(git(root, "rev-parse", "HEAD").trim());
  expect(runs.at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(readRuns(paths, work.id)).toEqual(runs);
  const dir = workDir(paths, work.id);
  // The build passes and the test fails: each a run with its own log under the item's logs.
  const build = byGate(runs, "build");
  expect(build).toMatchObject({ target: ".", status: "pass", log: "logs/audit-build-root.txt" });
  expect(existsSync(join(dir, build?.log ?? ""))).toBe(true);
  const failing = byGate(runs, "test");
  expect(failing).toMatchObject({ target: ".", status: "fail", log: "logs/audit-test-root.txt" });
  expect(existsSync(join(dir, failing?.log ?? ""))).toBe(true);
  // The secrets scan covers the committed tree, not a diff: the planted key is named with its line.
  const secrets = byGate(runs, "secrets");
  expect(secrets).toMatchObject({ status: "fail", log: "logs/audit-secrets-root.txt" });
  expect(readFileSync(join(dir, secrets?.log ?? ""), "utf8")).toContain(
    "config/keys.ts:1: AWS access key",
  );
  // No lockfile: the dependency audit is unavailable with its reason, never silently absent.
  expect(byGate(runs, "deps")).toMatchObject({ status: "unavailable", reason: "no lockfile" });
  // The application is never started by the audit.
  expect(byGate(runs, "e2e")).toMatchObject({
    status: "unavailable",
    reason: "needs the environment; run by hand",
    log: null,
  });
  expect(runs.runs.map((r) => r.gate).sort()).toEqual(["build", "deps", "e2e", "secrets", "test"]);
  for (const run of runs.runs) expect(["pass", "fail", "unavailable"]).toContain(run.status);
  // `--only` replaces the runs of the gates named and keeps the others.
  const only = await runAudit(paths, work, profile, DEFAULT_POLICY, { only: ["test"] });
  if (!("runs" in only)) throw new Error("the fixture is under the cap and HEAD unchanged");
  expect(only.runs.map((r) => r.gate).sort()).toEqual(["build", "deps", "e2e", "secrets", "test"]);
  expect(byGate(only, "test")?.status).toBe("fail");
  expect(byGate(only, "build")).toEqual(build as AuditRun);
  // A second full run replaces the first: one record, the newer stamp.
  const again = await runAudit(paths, work, profile, DEFAULT_POLICY, {});
  if (!("runs" in again)) throw new Error("the fixture is under the cap and HEAD unchanged");
  expect(again.runs.length).toBe(runs.runs.length);
  expect(readRuns(paths, work.id).at).toBe(again.at);
  expect(again.at >= runs.at).toBe(true);
  // `--only` after HEAD moved is refused before anything is written: the kept runs would be
  // stamped current at a head they never ran at (finding 101).
  const auditDir = join(dir, "audit");
  const bytesOf = () =>
    ["runs.json", "files.txt", "scope.json"].map((n) => readFileSync(join(auditDir, n), "utf8"));
  const kept = bytesOf();
  git(root, "commit", "-q", "--allow-empty", "-m", "moved");
  const now = git(root, "rev-parse", "HEAD").trim();
  const stale = await runAudit(paths, work, profile, DEFAULT_POLICY, { only: ["test"] });
  expect(stale).toEqual({ stale: { recorded: again.head, now } });
  expect(bytesOf()).toEqual(kept);
  expect(staleRefusal(work.id, { recorded: again.head, now })).toBe(
    `HEAD moved since the recorded run (${again.head?.slice(0, 12)} → ${now.slice(0, 12)}): run crew audit ${work.id} run without --only`,
  );
  // `--only` with no recorded run would write a partial record at HEAD that the guard reads as the run.
  rmSync(join(auditDir, "runs.json"));
  const first = await runAudit(paths, work, profile, DEFAULT_POLICY, { only: ["test"] });
  expect(first).toEqual({ stale: { reason: "no recorded run" } });
  expect(existsSync(join(auditDir, "runs.json"))).toBe(false);
  expect(["files.txt", "scope.json"].map((n) => readFileSync(join(auditDir, n), "utf8"))).toEqual(
    kept.slice(1),
  );
  expect(staleRefusal(work.id, { reason: "no recorded run" })).toBe(
    `--only needs a recorded run: run crew audit ${work.id} run first`,
  );
  expect(treeHash(root)).toBe(before);
});

test("SP8-T4 AC-2: the files the reviewers read and the scope with its risk areas are written beside the runs", async () => {
  const root = auditFixture();
  const { paths, profile, work } = auditItem(root);
  const files = auditFiles(root, profile);
  if (files === null) throw new Error("the fixture is under the cap");
  expect(files).toEqual([...files].sort());
  expect(files).toContain("src/a.ts");
  expect(files).toContain("config/keys.ts");
  expect(files).toContain("src/db/migrations/001_init.sql");
  expect(files.some((f) => f.startsWith("node_modules/"))).toBe(false);
  const scope: AuditScope = auditScope(paths, profile, DEFAULT_POLICY, files);
  expect(scope.targets).toEqual([{ path: ".", stack: "node", packageManager: "npm" }]);
  expect(scope.files).toBe(files.length);
  const bytes = files.reduce((n, f) => n + statSync(join(root, f)).size, 0);
  expect(scope.bytes).toBe(bytes);
  expect(scope.riskAreas).toEqual(["data-migration"]);
  await runAudit(paths, work, profile, DEFAULT_POLICY, {});
  const dir = join(workDir(paths, work.id), "audit");
  expect(readFileSync(join(dir, "files.txt"), "utf8")).toBe(`${files.join("\n")}\n`);
  expect(JSON.parse(readFileSync(join(dir, "scope.json"), "utf8"))).toEqual(scope);
  expect(readdirSync(dir).sort()).toEqual(["files.txt", "runs.json", "scope.json"]);
});

test("SP8-T4 AC-1 (the security lead's return): a tree over the walk's cap is never audited in part; a tree at the cap is", async () => {
  const root = auditFixture();
  const { paths, profile, work } = auditItem(root);
  const files = auditFiles(root, profile);
  if (files === null) throw new Error("the fixture is under the cap");
  expect(auditFiles(root, profile, files.length - 1)).toBeNull();
  expect(auditFiles(root, profile, files.length)).toEqual(files);
  const capped = await runAudit(paths, work, profile, DEFAULT_POLICY, {
    maxFiles: files.length - 1,
  });
  expect(capped).toEqual({ capped: files.length - 1 });
  // Nothing recorded: no truncated list, no secrets run on a tree the scan did not cover.
  expect(existsSync(join(workDir(paths, work.id), "audit"))).toBe(false);
  expect(cappedRefusal(files.length - 1)).toBe(
    `the tree has more than ${files.length - 1} watched files, the walk's cap: nothing was recorded, since a partial audit would hide what it did not read; narrow the profile's targets or the folders it skips, then run again`,
  );
  const atCap = await runAudit(paths, work, profile, DEFAULT_POLICY, { maxFiles: files.length });
  expect("capped" in atCap).toBe(false);
  expect(existsSync(join(workDir(paths, work.id), "audit", "files.txt"))).toBe(true);
});
