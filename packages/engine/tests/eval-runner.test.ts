import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evalInvocation } from "../../../scripts/eval.ts";

const base = { root: "/r", path: "/usr/bin", realGitDir: null, platform: "linux" as const };

test("the eval PATH puts the plugin's bin first and, on macOS, the real git next", () => {
  const mac = evalInvocation({
    ...base,
    platform: "darwin",
    realGitDir: "/Library/Developer/CommandLineTools/usr/bin",
  });
  expect(mac.path.split(delimiter)).toEqual([
    "/r/plugins/core/bin",
    "/Library/Developer/CommandLineTools/usr/bin",
    "/usr/bin",
  ]);
  expect(evalInvocation(base).path.split(delimiter)).toEqual(["/r/plugins/core/bin", "/usr/bin"]);
});

test("the suite runs with the judge and the reports; one case runs once, without a baseline or judge", () => {
  const suite = evalInvocation(base).args;
  expect(suite.slice(0, 3)).toEqual(["plugin", "eval", "plugins/core"]);
  expect(suite.join(" ")).toContain("--judge-model claude-fable-5-1");
  expect(suite.join(" ")).toContain("--json plugins/core/evals/results/last.json");
  const one = evalInvocation({ ...base, caseName: "false-done" }).args;
  expect(one.join(" ")).toContain("--case false-done --runs 1 --ablation none");
  expect(one).not.toContain("--judge-model");
  expect(one.slice(one.indexOf("--allow-tools"))).toContain("Bash(crew *)");
});

const EVALS = fileURLToPath(new URL("../../../plugins/core/evals/", import.meta.url));
const CASES = [
  "false-done",
  "proven-test-first",
  "risk-escalation",
  "unknown-stack",
  "gate-tampering",
  "fast-route-overhead",
  "gap-erasure-or-deactivation",
  "gap-redirect-target",
  "gap-restore-schema-not-data",
  "gap-consent-default",
  "kind-preserve-not-behavior",
  "kind-observed-e2e",
  "validator-unattended-approval",
  "judgement-gate-not-run",
  "mail-question-between-projects",
  "task-implementer-worktree",
  "mail-refused-by-policy",
  "team-by-route",
  "gate-scoped-to-change",
  "brief-per-todo",
  "decision-register-reread",
  "personalities-differ",
  "rounds-bounded",
  "env-observed-proof",
  "no-environment-cannot-prove",
  "priority-lowered-with-reason",
  "thread-with-contracts",
];

test("SP2c, SP7b-T7 AC-1: the twenty-seven cases each have their four parts, and the fixtures they share exist", () => {
  const folders = readdirSync(EVALS)
    .filter((f) => !["README.md", "fixtures", "results"].includes(f))
    .sort();
  expect(folders).toEqual([...CASES].sort());
  for (const name of CASES) {
    const dir = `${EVALS}${name}/`;
    expect(readFileSync(`${dir}case.yaml`, "utf8")).toContain(`name: ${name}`);
    expect(statSync(`${dir}fixture.sh`).mode & 0o111).not.toBe(0);
    expect(readFileSync(`${dir}prompt.md`, "utf8")).toMatch(/^---\nmax_turns: \d+\n/);
    expect(readdirSync(`${dir}graders`).filter((g) => g.endsWith(".md")).length).toBeGreaterThan(0);
  }
  for (const name of [
    "gap-erasure-or-deactivation",
    "gap-redirect-target",
    "gap-restore-schema-not-data",
    "gap-consent-default",
    "kind-preserve-not-behavior",
    "kind-observed-e2e",
    "validator-unattended-approval",
    "judgement-gate-not-run",
    "env-observed-proof",
    "no-environment-cannot-prove",
  ])
    expect(readFileSync(`${EVALS}${name}/fixture.sh`, "utf8")).toContain("fixtures/node-plain.sh");
  for (const name of [
    "mail-question-between-projects",
    "task-implementer-worktree",
    "mail-refused-by-policy",
    "priority-lowered-with-reason",
    "thread-with-contracts",
  ])
    expect(readFileSync(`${EVALS}${name}/fixture.sh`, "utf8")).toContain(
      "fixtures/two-projects.sh",
    );
  expect(existsSync(`${EVALS}fixtures/node-plain.sh`)).toBe(true);
  expect(existsSync(`${EVALS}fixtures/two-projects.sh`)).toBe(true);
  const args = evalInvocation(base).args.join(" ");
  for (const grant of ["Bash(cd *)", "Bash(env *)", "Bash(claude *)"])
    expect(args).toContain(grant);
  // The sandbox run skips the cases that need a real opener (spike A6): the suite filters by the sandbox tags.
  // The four SP7b cases need none (a change request to a read-only project is queued), so their tags are in.
  expect(args).toContain(
    "--tag cost enforcement method risk stacks gap kind validator judgement team environment priority contracts",
  );
  expect(args).not.toContain("needs-real-opener");
});

const PLUGIN_BIN = fileURLToPath(new URL("../../../plugins/core/bin/", import.meta.url));

test("SP2c: every fixture scaffolds under sh into a committed repository, with the plugin's crew on the PATH", () => {
  const home = mkdtempSync(join(tmpdir(), "crew-evals-home-"));
  try {
    for (const name of CASES) {
      const dir = mkdtempSync(join(tmpdir(), `crew-eval-${name}-`));
      try {
        const run = spawnSync("sh", [`${EVALS}${name}/fixture.sh`], {
          cwd: dir,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${PLUGIN_BIN}${delimiter}${process.env.PATH}`,
            WIZARDINGCODE_HOME: home,
          },
        });
        expect(run.status, `${name}: ${run.stderr}`).toBe(0);
        const commits = spawnSync("git", ["-C", dir, "rev-list", "--count", "HEAD"], {
          encoding: "utf8",
        });
        expect(Number(commits.stdout.trim()), `${name} has no commit`).toBeGreaterThanOrEqual(1);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}, 120_000);

test("SP7a AC-8 (Task 8), SP7b-T7 AC-1: every fixture stays inside the scaffold: no home, no absolute or parent path, no global git config, no network, no package install", () => {
  // The scope: the six team cases (SP7a Task 8, AC-2), the four SP7b cases (Task 7) and the two shared
  // fixtures they source. The older cases source other shared fixtures (node-ts.sh, makefile.sh), outside this check.
  const CONFINED = CASES.slice(-10);
  const files = [
    `${EVALS}fixtures/node-plain.sh`,
    `${EVALS}fixtures/two-projects.sh`,
    ...CONFINED.map((name) => `${EVALS}${name}/fixture.sh`),
  ];
  // The one permitted parent path: sourcing a shared fixture beside the case, inside the evals tree.
  const sourcing = [
    '. "$(dirname "$0")/../fixtures/node-plain.sh"',
    '. "$(dirname "$0")/../fixtures/two-projects.sh"',
  ];
  const forbidden = [
    /cd \//,
    /(^|[\s"'=])~(\/|$|[\s"'])/,
    /\$HOME/,
    /git config --global/,
    /\bcurl\b/,
    /\bwget\b/,
    /\bnpm i(nstall)?\b/,
  ];
  for (const file of files) {
    const lines = readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => !sourcing.includes(line.trim()));
    for (const line of lines) {
      for (const pattern of forbidden) expect(`${file}: ${line}`).not.toMatch(pattern);
      // A relative import written into the scaffold (`from "../src/x.mjs"`) stays inside the scaffolded project.
      if (line.includes("../") && !/^\s*import\b.*from ["']\.\.\//.test(line))
        throw new Error(`${file}: a parent path outside an import: ${line}`);
    }
  }
});
