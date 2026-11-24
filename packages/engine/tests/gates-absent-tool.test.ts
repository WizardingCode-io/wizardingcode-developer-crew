import { expect, test } from "bun:test";
import { chmodSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { auditRunLine, runAudit } from "../src/audit-run.ts";
import { renderReport } from "../src/evidence.ts";
import { changedWatchedPaths } from "../src/fingerprint.ts";
import * as gatesModule from "../src/gates.ts";
import { plannedGates, runGates, runOneGate, runTaskGate } from "../src/gates.ts";
import { workDir } from "../src/paths.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { namedFiles } from "../src/problems.ts";
import { ensureProfile, saveProfile } from "../src/profile.ts";
import * as runModule from "../src/run.ts";
import type { GateName, Policy, Profile, Route } from "../src/types.ts";
import { addCriterion, applyClassification, createWork } from "../src/work.ts";
import { childEnv, cliIo, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

/** What this item adds to the two modules, reached so that the file loads before they exist. */
interface LeftOut {
  target: string;
  stack?: string;
  reason: string;
}
const gates = gatesModule as unknown as {
  NOT_FOUND_REASON: string;
  NOT_EXECUTABLE_REASON: string;
  NO_EXIT_REASON: string;
  auditsLeftOut(
    route: Route,
    profile: Profile,
    policy: Policy,
    changed: string[],
    root: string,
  ): LeftOut[];
};
const run = runModule as unknown as {
  gaveNoResult(result: { exit: number | null; timedOut: boolean }): boolean;
};

const NOT_PLANNED =
  "not planned: no lockfile; no audit ran for this change, and on the standard route the verdict does not wait for it (the policy's requiredGates can require it)";
const REPO = join(import.meta.dir, "..", "..", "..");

/** A node project with one changed file, `src/a.ts`, and the commands given set on its target. */
function project(
  files: Record<string, string>,
  commands: Partial<Record<"build" | "test" | "lint" | "typecheck", string>>,
) {
  const root = makeRepo({
    "package.json": JSON.stringify({ name: "x", scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    "src/b.ts": "x",
    ...files,
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const node = profile.targets[0];
  if (!node) throw new Error("no target");
  for (const [gate, command] of Object.entries(commands))
    node.gates[gate as GateName] = { command, source: "confirmed" };
  saveProfile(paths, profile);
  const work = createWork(paths, "fix");
  addCriterion(work, "x");
  write(root, "src/a.ts", "y");
  return { root, paths, profile, work };
}

test("AC-11: a lint or a typecheck whose command did not run is unavailable, whatever file its output names", async () => {
  for (const gate of ["lint", "typecheck"] as const) {
    // A file of the repository with no execute bit: the shell's own line names it, exit 126.
    const noBit = project({ "tools/lint.js": "console.log(1)\n" }, { [gate]: "./tools/lint.js" });
    const first = await runGates(noBit.paths, noBit.work, noBit.profile, DEFAULT_POLICY, {
      only: [gate],
    });
    const blocked = first.evidence.runs.find((r) => r.gate === gate);
    // The precondition that makes this a real case: the run's output names an unchanged file.
    expect(namedFiles(blocked?.tail ?? "", [noBit.root, noBit.root], noBit.root)).toEqual([
      "tools/lint.js",
    ]);
    expect(blocked?.status).toBe("unavailable");
    expect(blocked?.exit).toBe(126);
    expect(blocked?.reason).toBe(gates.NOT_EXECUTABLE_REASON);
    expect(blocked?.problems).toBeUndefined();
    expect(first.unproven).toContain(`gate ${gate} unavailable: ${gates.NOT_EXECUTABLE_REASON}`);
    // An earlier step names an unchanged file, then the binary is not found: exit 127.
    const missing = project(
      {},
      { [gate]: 'echo "src/b.ts:1:1 error"; no-such-linter-of-the-test' },
    );
    const second = await runGates(missing.paths, missing.work, missing.profile, DEFAULT_POLICY, {
      only: [gate],
    });
    const notFound = second.evidence.runs.find((r) => r.gate === gate);
    expect(notFound?.status).toBe("unavailable");
    expect(notFound?.exit).toBe(127);
    expect(notFound?.reason).toBe(gates.NOT_FOUND_REASON);
    expect(notFound?.problems).toBeUndefined();
  }
});

test("AC-11: a tool that ran is judged by the files it names, as before", async () => {
  const debt = project({}, { lint: 'echo "src/b.ts:1:1 error"; exit 1' });
  const old = (
    await runGates(debt.paths, debt.work, debt.profile, DEFAULT_POLICY, { only: ["lint"] })
  ).evidence.runs.find((r) => r.gate === "lint");
  expect(old).toMatchObject({ status: "pass", problems: { touched: [], untouched: 1 } });
  expect(old?.reason).toBe("1 file with problems, none changed by this item (pre-existing)");
  const own = project({}, { lint: 'echo "src/a.ts:1:1 error"; exit 1' });
  const touched = (
    await runGates(own.paths, own.work, own.profile, DEFAULT_POLICY, { only: ["lint"] })
  ).evidence.runs.find((r) => r.gate === "lint");
  expect(touched).toMatchObject({ status: "fail", problems: { touched: ["src/a.ts"] } });
  expect(touched?.reason).toBe("problems in files this item changed: src/a.ts");
});

test("AC-11: the three reasons are fixed sentences", () => {
  expect(gates.NOT_FOUND_REASON).toBe(
    "its command did not run (exit 127, not found); the log holds the shell's message",
  );
  expect(gates.NOT_EXECUTABLE_REASON).toBe(
    "its command did not run (exit 126, not executable); the log holds the shell's message",
  );
  expect(gates.NO_EXIT_REASON).toBe(
    "its command ended with no exit status (not started, or ended by a signal); the log holds its output",
  );
});

test("AC-14: a test and a build whose binary does not exist are unavailable with the reason, and the verdict says so", async () => {
  const p = project(
    {},
    { test: "no-such-runner-of-the-test", build: "no-such-builder-of-the-test" },
  );
  const outcome = await runGates(p.paths, p.work, p.profile, DEFAULT_POLICY, {
    only: ["build", "test"],
  });
  for (const gate of ["build", "test"] as const) {
    const one = outcome.evidence.runs.find((r) => r.gate === gate);
    expect(one?.status).toBe("unavailable");
    expect(one?.exit).toBe(127);
    expect(one?.reason).toBe(gates.NOT_FOUND_REASON);
    expect(outcome.unproven).toContain(`gate ${gate} unavailable: ${gates.NOT_FOUND_REASON}`);
  }
  expect(outcome.verdict).toBe("unproven");
});

test("AC-14: a command ended by a signal has its own reason, and no reason holds a line of the output", async () => {
  const killed = project({}, { test: "kill -9 $$" });
  const ended = (
    await runGates(killed.paths, killed.work, killed.profile, DEFAULT_POLICY, { only: ["test"] })
  ).evidence.runs.find((r) => r.gate === "test");
  expect(ended?.status).toBe("unavailable");
  expect(ended?.exit).toBeNull();
  expect(ended?.reason).toBe(gates.NO_EXIT_REASON);
  const loud = project({}, { test: 'echo "token=abc123-of-the-test"; no-such-runner-of-the-test' });
  const said = (
    await runGates(loud.paths, loud.work, loud.profile, DEFAULT_POLICY, { only: ["test"] })
  ).evidence.runs.find((r) => r.gate === "test");
  expect(said?.reason).toBe(gates.NOT_FOUND_REASON);
  expect(said?.reason).not.toContain("abc123-of-the-test");
  expect(said?.tail).toContain("abc123-of-the-test");
});

test("AC-14: an audit whose command exits 127 is unavailable and is not read as a report", async () => {
  const bin = tempDir("bin-");
  // A fake npm that prints a readable report, the lockfile itself, and was then not found.
  write(bin, "npm", "#!/bin/sh\ncat package-lock.json\nexit 127\n");
  chmodSync(join(bin, "npm"), 0o755);
  const gateEnv = { ...childEnv(), PATH: `${bin}:${process.env.PATH}` };
  const root = makeRepo({
    "package.json": JSON.stringify({ name: "x", scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  // The base commit holds no lockfile, so the one advisory is new to the item.
  const work = createWork(paths, "fix");
  write(
    root,
    "package-lock.json",
    JSON.stringify({
      vulnerabilities: {
        a: { via: [{ source: 1, url: "https://github.com/advisories/GHSA-new0-0000-0000" }] },
      },
    }),
  );
  const audit = await runOneGate(
    paths,
    work,
    profile,
    { gate: "deps", target: "." },
    "fp",
    ["package-lock.json"],
    DEFAULT_POLICY,
    undefined,
    undefined,
    gateEnv,
  );
  expect(audit.exit).toBe(127);
  expect(audit.advisories).toBeUndefined();
  expect(audit.status).toBe("unavailable");
  expect(audit.reason).toBe(gates.NOT_FOUND_REASON);
});

test("AC-14: a todo's gate and crew audit over a test command whose binary does not exist", async () => {
  const p = project({}, { test: "no-such-runner-of-the-test" });
  const todo = await runTaskGate(p.paths, p.work, p.profile, DEFAULT_POLICY, ["src/a.ts"]);
  const todoTest = todo.runs.find((r) => r.gate === "test");
  expect(todoTest?.status).toBe("unavailable");
  expect(todoTest?.reason).toBe(gates.NOT_FOUND_REASON);
  expect(todo.status).toBe("fail");
  const a = project({}, { test: "no-such-runner-of-the-test" });
  const audited = createWork(a.paths, "Audit this project");
  applyClassification(
    audited,
    "audit",
    { route: "full", reasons: [], riskAreas: [] },
    { kind: "audit", from: "work_type audit" },
  );
  audited.phase = "audit";
  const runs = await runAudit(a.paths, audited, a.profile, DEFAULT_POLICY);
  if (!("runs" in runs)) throw new Error("the audit did not run");
  const row = runs.runs.find((r) => r.gate === "test");
  expect(row?.status).toBe("unavailable");
  expect(row?.reason).toBe(gates.NOT_FOUND_REASON);
  if (!row) throw new Error("no test row");
  expect(auditRunLine(row)).toBe(`test (.): unavailable (${gates.NOT_FOUND_REASON})`);
  const saved = JSON.parse(
    readFileSync(join(workDir(a.paths, audited.id), "audit", "runs.json"), "utf8"),
  ) as { runs: { gate: string; status: string; reason?: string }[] };
  expect(saved.runs.find((r) => r.gate === "test")).toMatchObject({
    status: "unavailable",
    reason: gates.NOT_FOUND_REASON,
  });
});

test("AC-14: gaveNoResult is true for exit 126, 127 and none, and for nothing else", () => {
  for (const exit of [126, 127, null])
    expect(run.gaveNoResult({ exit, timedOut: false })).toBe(true);
  for (const exit of [0, 1, 2]) expect(run.gaveNoResult({ exit, timedOut: false })).toBe(false);
  expect(run.gaveNoResult({ exit: 127, timedOut: true })).toBe(false);
  expect(run.gaveNoResult({ exit: null, timedOut: true })).toBe(false);
});

/** A standard item that changed its manifest in a project with no lockfile. */
function manifestItem(extra: Record<string, string> = {}) {
  const root = makeRepo({
    "package.json": JSON.stringify({ name: "x", scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
    ...extra,
  });
  const paths = repoPaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, "fix");
  work.route = "standard";
  addCriterion(work, "x");
  write(root, "package.json", JSON.stringify({ name: "y", scripts: { test: "exit 0" } }));
  const changed = () => changedWatchedPaths(root, profile, work);
  return { root, paths, profile, work, changed };
}

test("AC-15: an audit the standard route leaves out is returned and said by the gate run, and stored nowhere", async () => {
  const p = manifestItem();
  expect(gates.auditsLeftOut("standard", p.profile, DEFAULT_POLICY, p.changed(), p.root)).toEqual([
    { target: ".", reason: "no lockfile" },
  ]);
  expect(
    plannedGates("standard", p.profile, DEFAULT_POLICY, p.changed(), p.root).map((g) => g.gate),
  ).not.toContain("deps");
  const line = `deps (.) ${NOT_PLANNED}`;
  const whole = (await runGates(p.paths, p.work, p.profile, DEFAULT_POLICY)) as unknown as {
    planNotes: string[];
    unproven: string[];
  };
  expect(whole.planNotes).toEqual([line]);
  expect(whole.unproven.join("; ")).not.toContain("deps");
  const only = (await runGates(p.paths, p.work, p.profile, DEFAULT_POLICY, {
    only: ["test"],
  })) as unknown as { planNotes: string[] };
  expect(only.planNotes).toEqual([line]);
  const saved = readFileSync(join(workDir(p.paths, p.work.id), "evidence.json"), "utf8");
  // The keys a gate run saved before this item (probes/evidence-keys-before.txt of the item).
  expect(Object.keys(JSON.parse(saved)).sort()).toEqual([
    "fingerprint",
    "runs",
    "tdd",
    "unproven",
    "verdict",
  ]);
  expect(saved).not.toContain("not planned");
});

test("AC-15: two targets at one path are each named by their stack; where the audit can run or was not asked, nothing is left out", () => {
  const two = manifestItem({ "composer.json": JSON.stringify({ name: "a/b" }) });
  write(two.root, "composer.json", JSON.stringify({ name: "a/c" }));
  const { profile } = ensureProfile(two.paths);
  const changed = changedWatchedPaths(two.root, profile, two.work);
  const left = gates.auditsLeftOut("standard", profile, DEFAULT_POLICY, changed, two.root);
  expect(left).toHaveLength(2);
  expect(new Set(left.map((e) => `${e.target}|${e.stack}|${e.reason}`))).toEqual(
    new Set([".|node|no lockfile", ".|php|no lockfile"]),
  );
  // No manifest changed: no audit was asked for.
  const plain = manifestItem();
  expect(
    gates.auditsLeftOut("standard", plain.profile, DEFAULT_POLICY, ["src/a.ts"], plain.root),
  ).toEqual([]);
  // The fast and the full routes plan the audit, so nothing is left out.
  for (const route of ["fast", "full"] as const) {
    expect(
      gates.auditsLeftOut(route, plain.profile, DEFAULT_POLICY, plain.changed(), plain.root),
    ).toEqual([]);
    expect(
      plannedGates(route, plain.profile, DEFAULT_POLICY, plain.changed(), plain.root).map(
        (g) => g.gate,
      ),
    ).toContain("deps");
  }
  // A lockfile and the manager on PATH: the audit can run and is planned.
  const able = manifestItem({ "package-lock.json": "{}" });
  const bin = tempDir("bin-");
  write(bin, "npm", "#!/bin/sh\nexit 0\n");
  chmodSync(join(bin, "npm"), 0o755);
  const savedPath = process.env.PATH;
  process.env.PATH = `${bin}:${savedPath}`;
  try {
    expect(
      gates.auditsLeftOut("standard", able.profile, DEFAULT_POLICY, able.changed(), able.root),
    ).toEqual([]);
    expect(
      plannedGates("standard", able.profile, DEFAULT_POLICY, able.changed(), able.root).map(
        (g) => g.gate,
      ),
    ).toContain("deps");
  } finally {
    process.env.PATH = savedPath;
  }
});

test("AC-15: two targets at one path give two lines, each with its stack", async () => {
  const two = manifestItem({ "composer.json": JSON.stringify({ name: "a/b" }) });
  write(two.root, "composer.json", JSON.stringify({ name: "a/c" }));
  const { profile } = ensureProfile(two.paths);
  const outcome = (await runGates(two.paths, two.work, profile, DEFAULT_POLICY, {
    only: ["secrets"],
  })) as unknown as { planNotes: string[] };
  expect(new Set(outcome.planNotes)).toEqual(
    new Set([`deps (., node) ${NOT_PLANNED}`, `deps (., php) ${NOT_PLANNED}`]),
  );
});

const standardAnswers = JSON.stringify({
  work_type: "chore",
  is_vague: 0.1,
  scope: 1,
  touches_auth: 0,
  touches_payments: 0,
  touches_personal_data: 0,
  touches_data_migration: 0,
  touches_infra: 0,
  touches_public_api: 0,
});

test("AC-15: crew gate run prints the line and returns it, and the item's report holds it after its Gates table", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ name: "x", scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = cliIo(root, testEnv());
  const started = JSON.parse(
    (await c("start", "Thing", "--answers", standardAnswers, "--json")).out,
  ) as { id: string; route: string };
  expect(started.route).toBe("standard");
  const id = started.id;
  await c("criteria", id, "add", "x");
  write(root, "package.json", JSON.stringify({ name: "y", scripts: { test: "exit 0" } }));
  const line = `deps (.) ${NOT_PLANNED}`;
  expect((await c("gate", "run", id)).out).toContain(`\n${line}`);
  const data = JSON.parse((await c("gate", "run", id, "--json")).out) as { planNotes?: string[] };
  expect(data.planNotes).toEqual([line]);
  const report = readFileSync(join(root, ".crew", "work", id, "report.md"), "utf8");
  const table = report.indexOf("| Gate | Target | Status |");
  expect(table).toBeGreaterThan(-1);
  const rows = report.slice(table).split("\n\n")[0] ?? "";
  expect(report.slice(table + rows.length)).toStartWith(`\n\n${line}\n`);
  // With no line given, the renderer prints none.
  const p = manifestItem();
  const outcome = await runGates(p.paths, p.work, p.profile, DEFAULT_POLICY);
  expect(renderReport(p.work, outcome.evidence, DEFAULT_POLICY)).not.toContain("not planned");
});

test("AC-9: a policy that requires deps keeps the audit in the standard route's plan, where it ends unavailable", async () => {
  const required: Policy = { ...DEFAULT_POLICY, requiredGates: ["deps"] };
  const p = manifestItem();
  expect(
    plannedGates("standard", p.profile, required, p.changed(), p.root).map((g) => g.gate),
  ).toContain("deps");
  // With no manifest changed the gate is planned as well.
  expect(
    plannedGates("standard", p.profile, required, ["src/a.ts"], p.root).map((g) => g.gate),
  ).toContain("deps");
  expect(gates.auditsLeftOut("standard", p.profile, required, p.changed(), p.root)).toEqual([]);
  const outcome = (await runGates(p.paths, p.work, p.profile, required)) as unknown as {
    planNotes: string[];
    unproven: string[];
    evidence: { runs: { gate: string; status: string; reason?: string }[] };
  };
  expect(outcome.evidence.runs.find((r) => r.gate === "deps")).toMatchObject({
    status: "unavailable",
    reason: "no lockfile",
  });
  expect(outcome.planNotes).toEqual([]);
  expect(outcome.unproven).toContain("gate deps unavailable: no lockfile");
  const todo = await runTaskGate(p.paths, p.work, p.profile, required, ["src/a.ts"]);
  expect(todo.runs.find((r) => r.gate === "deps")?.status).toBe("unavailable");
  expect(todo.status).toBe("fail");
});

const GATE_UNAVAILABLE =
  "An unavailable gate whose reason says its command did not run, or ended with no exit status, has a command, so read the run's log first: a tool or a script that is not installed asks for the project's install step, a file that cannot be executed for its mode, and then a run again; a command of the profile that names the wrong tool, or a script the project does not have, is corrected with `crew profile set`, the user's decision; a command that ended with no exit status is run again and, where it ends the same way, said to the user as it is (it was ended from outside, often for memory); a skip is never the answer to any of them.";
const NOTE_0002 =
  "Note of 2026-11-24 (item `2026-11-24-003`): the standard route keeps the audit in the plan when `policy.json` lists `deps` in `requiredGates`, and it ends unavailable there when no tool can run; the Decision's sentence \"The standard route still drops it when no tool can run\" holds for every other project. Such a project already ran the audit at every item where its tool could run; what changes is that an audit that cannot run now holds the item. An audit the standard route leaves out is said in a line of the gate run's output and of the item's report, stored nowhere.";
const NOTE_0006 =
  'Note of 2026-11-24 (item `2026-11-24-003`): a gate whose command did not run (exit 126 or 127) or ended with no exit status is unavailable, with a fixed reason, and is read neither for the files it names nor as an audit\'s report. This narrows three sentences of the Decision: "the gate is judged by its exit code as before", "reported, not failing" and "A tool that names no files is judged as today".';
// The two Decisions as they stood before this item: a later change to either changes this test with it.
const DECISION_0002 =
  "On every route the dependency audit is planned when the change, measured from the item's base commit, touches a manifest or a lockfile (`manifestChanged` in `packages/engine/src/gates.ts`), or when the team's `policy.json` lists `deps` in `requiredGates`. The standard route still drops it when no tool can run; the full route still records it unavailable and the user must skip it.";
const DECISION_0006_PARTS = [
  "When the tool's report cannot be read, the gate is judged by its exit code as before and the record says so; when the base cannot be audited, every advisory counts and the record says so.",
  "**Lint and typecheck** (next item, same decision). When the tool names the files it complains about, problems in files the item did not touch are the repository's debt: reported, not failing. Problems in touched files fail the gate. A tool that names no files is judged as today.",
  "What does not change: the test gate runs the team's own flow in full; nothing is skipped; the known debt is named on every report so it never disappears from view.",
];

/** A document's text from a heading to the next heading of its level. */
function section(text: string, heading: string): string {
  const from = text.indexOf(`${heading}\n`);
  if (from < 0) throw new Error(`no ${heading}`);
  const rest = text.slice(from + heading.length + 1);
  const end = rest.indexOf("\n## ");
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

test("AC-13: the gate reference and the two ADRs say what changed, the Decisions as they were", () => {
  const gate = readFileSync(
    join(REPO, "plugins", "core", "skills", "crew", "references", "gate.md"),
    "utf8",
  );
  const bullets = gate.split("\n").filter((l) => l.startsWith("- **"));
  const unavailable = bullets.find((l) => l.startsWith("- **A gate is unavailable**"));
  expect(unavailable?.endsWith(GATE_UNAVAILABLE)).toBe(true);
  const lint = bullets.find((l) => l.startsWith("- **Lint and typecheck**"));
  expect(
    lint?.endsWith(
      "A tool that names no files is judged by its exit code, unless its command gave no result.",
    ),
  ).toBe(true);
  const adr2 = readFileSync(
    join(REPO, "docs", "adr", "0002-dependency-audit-on-dependency-changes.md"),
    "utf8",
  );
  expect(adr2.trimEnd().split("\n\n").at(-1)).toBe(NOTE_0002);
  expect(section(adr2, "## Decision")).toBe(DECISION_0002);
  const adr6 = readFileSync(join(REPO, "docs", "adr", "0006-gates-judge-the-item.md"), "utf8");
  expect(adr6.trimEnd().split("\n\n").at(-1)).toBe(NOTE_0006);
  const decision6 = section(adr6, "## Decision");
  expect(decision6.split("\n\n")).toHaveLength(3);
  for (const part of DECISION_0006_PARTS) expect(decision6).toContain(part);
});
