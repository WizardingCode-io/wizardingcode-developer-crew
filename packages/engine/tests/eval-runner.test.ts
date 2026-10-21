import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  armRuns,
  deniedReferenceReads,
  evalInvocation,
  SANDBOX_TAGS,
} from "../../../scripts/eval.ts";
import { CEILINGS } from "../../../scripts/eval-overhead.ts";
import type { KnowledgeEntry } from "../src/types.ts";

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

test("the suite runs with the judge and the reports; one case runs once, without a baseline, with the same judge", () => {
  const suite = evalInvocation(base).args;
  expect(suite.slice(0, 3)).toEqual(["plugin", "eval", "plugins/core"]);
  expect(suite.join(" ")).toContain("--judge-model claude-fable-5-1");
  expect(suite.join(" ")).toContain("--json plugins/core/evals/results/last.json");
  const one = evalInvocation({ ...base, caseName: "false-done" }).args;
  expect(one.join(" ")).toContain("--case false-done --runs 1 --ablation none");
  // One case runs once with no baseline arm, judged by the suite's judge (SP4 Task 6: never a weaker judge).
  expect(one.join(" ")).toContain("--judge-model claude-fable-5-1");
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
  "ticket-triaged-against-business",
  "document-entry-opens-item",
  "jev-tightens-never-loosens",
  "issue-root-cause-named",
  "strategy-rejects-over-engineering",
  "strategy-declares-phases",
  "audit-report-three-formats",
  "issue-fast-overhead",
  "confidential-entry-not-reused",
  "root-cause-not-repeated",
  "cto-report-from-records",
];

test("SP2c, SP7b-T7 AC-1, SP3-T1 AC-5, SP3-T7 AC-1, SP4-T6 AC-1: the thirty-four cases each have their four parts, and the fixtures they share exist", () => {
  const folders = readdirSync(EVALS)
    // benchmark.json is the benchmark set (SP6 Task 5), not a case.
    .filter((f) => !["README.md", "benchmark.json", "fixtures", "results"].includes(f))
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
    "ticket-triaged-against-business",
    "document-entry-opens-item",
    "jev-tightens-never-loosens",
    "issue-root-cause-named",
    "confidential-entry-not-reused",
    "root-cause-not-repeated",
  ])
    expect(readFileSync(`${EVALS}${name}/fixture.sh`, "utf8")).toContain("fixtures/node-plain.sh");
  for (const name of [
    "mail-question-between-projects",
    "task-implementer-worktree",
    "mail-refused-by-policy",
    "priority-lowered-with-reason",
    "thread-with-contracts",
    "cto-report-from-records",
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
  expect(args).toContain(`--tag ${SANDBOX_TAGS.join(" ")}`);
  expect(SANDBOX_TAGS).not.toContain("needs-real-opener");
  expect(args).not.toContain("needs-real-opener");
});

test("SP3-T1 AC-5 (finding 80): every case's tags are within the runner's sandbox tag list unless the case needs a real opener", () => {
  for (const name of CASES) {
    const line = readFileSync(`${EVALS}${name}/case.yaml`, "utf8").match(/^tags:\s*\[([^\]]*)\]/m);
    if (!line?.[1]) throw new Error(`${name}: no tags line in case.yaml`);
    const tags = line[1].split(",").map((t) => t.trim());
    if (tags.includes("needs-real-opener")) continue;
    for (const tag of tags) expect(SANDBOX_TAGS, `${name}: tag ${tag}`).toContain(tag);
  }
});

const PLUGIN_BIN = fileURLToPath(new URL("../../../plugins/core/bin/", import.meta.url));

/**
 * The state each SP7b and SP3 fixture leaves and its graders rely on (finding 80): the policy and
 * the profile under the scaffold, the queued mail, the signed priorities and the config under the
 * test's own crew home (`home: true`), and the paths a fixture's last commit must carry (`committed`).
 */
/** The entries of a base a fixture left, parsed: the state rows of SP4's cases read them per entry. */
function parseBase(text: string): KnowledgeEntry[] {
  return (JSON.parse(text) as { entries: KnowledgeEntry[] }).entries;
}

/** The item folders of a project of the scaffold, none without a work folder. */
function itemsOf(dir: string, project = "."): string[] {
  try {
    return readdirSync(join(dir, project, ".crew", "work")).filter((f) => /^\d{4}-/.test(f));
  } catch {
    return [];
  }
}

const SCAFFOLD_STATE: Record<
  string,
  (
    | { file: string; home?: true; pattern: RegExp }
    | { file: string; absent: true }
    | { committed: RegExp }
    | { file: string; home?: true; assert: (text: string, dir: string) => void }
  )[]
> = {
  "priority-lowered-with-reason": [
    {
      file: ".crew/policy.json",
      pattern: /"accept":\s*\["question", "notice", "change-request"\]/,
    },
    { file: ".crew/policy.json", pattern: /"unattendedDecisions":\s*"wait"/ },
    { file: "mail/w/a/inbox.json", home: true, pattern: /newsletter on POST \/customers/ },
    { file: "mail/w/a/inbox.json", home: true, pattern: /"priority":\s*"high"/ },
    { file: "mail/w/a/inbox.json", home: true, pattern: /rename the loyalty tiers/ },
  ],
  "thread-with-contracts": [
    {
      file: ".crew/policy.json",
      pattern: /"accept":\s*\["question", "notice", "change-request"\]/,
    },
    { file: ".crew/policy.json", pattern: /"unattendedDecisions":\s*"validator"/ },
    { file: "mail/w/a/inbox.json", home: true, pattern: /loyalty_tier in the checkout payload/ },
  ],
  "env-observed-proof": [
    { file: ".crew/profile.json", pattern: /"environment"/ },
    { file: ".crew/profile.json", pattern: /node scripts\/env\.mjs start/ },
    { file: ".crew/profile.json", pattern: /node scripts\/env\.mjs stop/ },
    { file: ".crew/policy.json", pattern: /"requiredGates":\s*\["e2e"\]/ },
  ],
  "no-environment-cannot-prove": [
    // The fixture writes neither a profile nor a policy: the session's first command detects a profile
    // with no environment to find, and the e2e gate is planned from the interface path alone.
    { file: ".crew/profile.json", absent: true },
    { file: ".crew/policy.json", absent: true },
    { file: "package.json", pattern: /"test:e2e":\s*"node tests\/e2e\/run\.mjs"/ },
    { file: "src/index.html", pattern: /<h1>/ },
    { file: "tests/e2e/run.mjs", pattern: /WIZARDINGCODE_CREW_CONSOLE_FILE/ },
  ],
  // SP3 (Task 7): the workspace and the signed priorities of the ticket case, the document, the
  // validator policy and the canned Jev of the jev case, the earlier item the issue case's commit carries.
  "ticket-triaged-against-business": [
    { file: ".crew/policy.json", pattern: /"workspace":\s*"w"/ },
    { file: "src/page.mjs", pattern: /<button>Register<\/button>/ },
    { file: "workspaces/w/priorities.md", home: true, pattern: /loyalty programme/ },
    { file: "workspaces/w/priorities.json", home: true, pattern: /"hash":\s*"sha256:/ },
  ],
  "document-entry-opens-item": [
    { file: "docs/requests/newsletter.md", pattern: /the value marketing decided/ },
    { file: ".crew/policy.json", absent: true },
  ],
  "jev-tightens-never-loosens": [
    { file: ".crew/policy.json", pattern: /"unattendedDecisions":\s*"validator"/ },
    { file: "src/auth/session.mjs", pattern: /SESSION_TIMEOUT_MINUTES = 30/ },
    { file: "jev-answers.json", pattern: /"v2":\s*\{\s*"type":\s*"noul",\s*"noul":\s*0\.03\s*\}/ },
    {
      file: "config.json",
      home: true,
      pattern: /"endpoint":\s*"file:\/\/jev-answers\.json"/,
    },
  ],
  "issue-root-cause-named": [
    { file: "src/accounts.mjs", pattern: /export function deactivateAccount/ },
    { file: "src/accounts.mjs", pattern: /return \[\.\.\.accounts\.values\(\)\];/ },
    { committed: /^\.crew\/work\/[^/]+-add-deactivateaccount-[^/]*\/evidence\.json$/ },
    { committed: /^tests\/deactivate\.test\.mjs$/ },
  ],
  // SP8 (Task 6): the strategy cases' empty projects with a README naming the request's context, the
  // audit case's planted key (assembled by the fixture), failing test and lint error, the two overhead cases.
  "strategy-rejects-over-engineering": [
    { file: "README.md", pattern: /personal finance/ },
    { file: "package.json", absent: true },
  ],
  "strategy-declares-phases": [
    { file: "README.md", pattern: /social network/ },
    { file: "package.json", absent: true },
  ],
  "audit-report-three-formats": [
    { file: "config/keys.mjs", pattern: /AKIA[A-Z0-9]{16}/ },
    { file: "package.json", pattern: /"lint":\s*"node scripts\/lint\.mjs"/ },
    { file: "tests/fails.test.mjs", pattern: /assert\.equal\(1, 2\)/ },
    { committed: /^config\/keys\.mjs$/ },
  ],
  "issue-fast-overhead": [{ file: "src/math.mjs", pattern: /return a - b/ }],
  "fast-route-overhead": [
    { file: "src/math.mjs", pattern: /^(?![\s\S]*multiply)[\s\S]*return a \+ b/ },
  ],
  // SP4 (Task 6): the base each knowledge fixture leaves under the home, parsed per entry (the leads'
  // returns at the spec: an absence grader is sound only when the hidden entry exists and is marked),
  // and the tree the session finds.
  "confidential-entry-not-reused": [
    { file: ".crew/policy.json", pattern: /"workspace":\s*"globex"/ },
    { file: "src/catalog.mjs", pattern: /export function entryOf/ },
    { file: "peer/shop/.crew/policy.json", pattern: /"workspace":\s*"acme"/ },
    {
      file: "knowledge/base.json",
      home: true,
      assert: (text) => {
        const entries = parseBase(text);
        expect(entries.map((e) => [e.id, e.kind, e.confidential, e.workspace])).toEqual([
          ["K-1", "documentation", false, "acme"],
          ["K-2", "validated-solution", true, "acme"],
          ["K-3", "stack-preference", true, "acme"],
        ]);
        expect(entries[0]?.title).toBe("Cache expiry in the framework");
        // The hidden solution shares a word with the request, so it would be listed if it were visible.
        expect(entries[1]?.title).toBe("Add a cache staleness helper");
        expect(entries[1]?.words).toContain("cache");
        expect(entries[1]?.text).toContain("isStale(entry, maxAge)");
        expect(entries[2]?.title).toBe("Stack preference of acme");
        expect(entries.filter((e) => e.confidential === false)).toHaveLength(1);
      },
    },
  ],
  "root-cause-not-repeated": [
    { file: ".crew/policy.json", pattern: /"workspace":\s*"acme"/ },
    // The regression: listAccounts without the filter, deactivateAccount still exported, the test gone.
    {
      file: "src/accounts.mjs",
      pattern:
        /^(?![\s\S]*\.filter\([^)]*\.active)[\s\S]*export function listAccounts[\s\S]*export function deactivateAccount/,
    },
    { file: "tests/active.test.mjs", absent: true },
    { committed: /^\.crew\/work\/[^/]+-listaccounts-returns-[^/]*\/evidence\.json$/ },
    {
      file: "knowledge/base.json",
      home: true,
      assert: (text) => {
        const entries = parseBase(text);
        expect(entries.map((e) => e.kind)).toEqual([
          "validated-solution",
          "root-cause",
          "stack-preference",
        ]);
        // The solution carries the changed watched files; the root cause the origin's paths alone.
        expect(entries[0]?.paths).toEqual(
          expect.arrayContaining(["src/accounts.mjs", "tests/active.test.mjs"]),
        );
        const cause = entries[1];
        expect(cause).toMatchObject({ id: "K-2", confidential: true, workspace: "acme" });
        expect(cause?.paths).toEqual(["src/accounts.mjs"]);
      },
    },
  ],
  "cto-report-from-records": [
    { file: ".crew/policy.json", pattern: /"workspace":\s*"w"/ },
    { file: "src/greeting.mjs", pattern: /export function greeting/ },
    { file: "peer/b/src/customers.mjs", pattern: /export function findCustomer/ },
    {
      file: "knowledge/base.json",
      home: true,
      assert: (text, dir) => {
        const byId = Object.fromEntries(parseBase(text).map((e) => [e.id, e]));
        expect(byId["K-1"]).toMatchObject({
          kind: "validated-solution",
          workspace: "w",
          confidential: true,
        });
        expect(byId["K-1"]?.confirmedBy.map((r) => r.project)).toEqual(["b"]);
        expect(byId["K-1"]?.contradictedBy).toEqual([]);
        expect(byId["K-2"]).toMatchObject({ kind: "stack-preference", workspace: "w" });
        expect(byId["K-3"]?.confirmedBy).toEqual([]);
        expect(byId["K-3"]?.contradictedBy).toHaveLength(1);
        expect(byId["K-3"]?.contradictedBy[0]).toMatchObject({
          project: "a",
          reason: "findCustomer was replaced by the framework's query",
        });
        expect(byId["K-3"]?.contradictedBy[0]?.item).toMatch(/-add-a-greeting-/);
        // Three items across the two projects: one in a, two in b.
        expect(itemsOf(dir)).toHaveLength(1);
        expect(itemsOf(dir, "peer/b")).toHaveLength(2);
      },
    },
  ],
};
const SP8_CASES = [
  "strategy-rejects-over-engineering",
  "strategy-declares-phases",
  "audit-report-three-formats",
  "issue-fast-overhead",
];

test("SP2c, SP3-T1 AC-5: every fixture scaffolds under sh into a committed repository, with the plugin's crew on the PATH, and leaves the state its graders rely on", () => {
  const home = mkdtempSync(join(tmpdir(), "crew-evals-home-"));
  try {
    for (const name of CASES) {
      const dir = mkdtempSync(join(tmpdir(), `crew-eval-${name}-`));
      // One crew home per case, as the sandbox gives each run its own: a knowledge fixture's base
      // starts at K-1, which its graders name (SP4 Task 6).
      const caseHome = mkdtempSync(join(home, `${name}-`));
      try {
        const run = spawnSync("sh", [`${EVALS}${name}/fixture.sh`], {
          cwd: dir,
          encoding: "utf8",
          env: {
            ...process.env,
            PATH: `${PLUGIN_BIN}${delimiter}${process.env.PATH}`,
            WIZARDINGCODE_HOME: caseHome,
          },
        });
        expect(run.status, `${name}: ${run.stderr}`).toBe(0);
        const commits = spawnSync("git", ["-C", dir, "rev-list", "--count", "HEAD"], {
          encoding: "utf8",
        });
        expect(Number(commits.stdout.trim()), `${name} has no commit`).toBeGreaterThanOrEqual(1);
        const committed = spawnSync("git", ["-C", dir, "ls-tree", "-r", "HEAD", "--name-only"], {
          encoding: "utf8",
        }).stdout.split("\n");
        for (const state of SCAFFOLD_STATE[name] ?? []) {
          if ("committed" in state) {
            expect(
              committed.some((p) => state.committed.test(p)),
              `${name}: no committed path matches ${state.committed}`,
            ).toBe(true);
            continue;
          }
          const path =
            "home" in state && state.home
              ? join(caseHome, "crew", state.file)
              : join(dir, state.file);
          if ("absent" in state) {
            expect(existsSync(path), `${name}: ${state.file} written`).toBe(false);
            continue;
          }
          expect(existsSync(path), `${name}: ${state.file} not written`).toBe(true);
          if ("assert" in state) {
            state.assert(readFileSync(path, "utf8"), dir);
            continue;
          }
          expect(readFileSync(path, "utf8"), `${name}: ${state.file}`).toMatch(state.pattern);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}, 120_000);

test("SP7a AC-8 (Task 8), SP7b-T7 AC-1, SP3-T7 AC-1: every fixture stays inside the scaffold: no home, no absolute or parent path, no global git config, no network, no package install", () => {
  // The scope: the six team cases (SP7a Task 8, AC-2), the four SP7b cases (Task 7), the four SP3 cases
  // (Task 7) and the two shared fixtures they source. The older cases source other shared fixtures
  // (node-ts.sh, makefile.sh), outside this check.
  const CONFINED = [
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
    "ticket-triaged-against-business",
    "document-entry-opens-item",
    "jev-tightens-never-loosens",
    "issue-root-cause-named",
    "confidential-entry-not-reused",
    "root-cause-not-repeated",
    "cto-report-from-records",
  ];
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

const repoRoot = join(import.meta.dir, "..", "..", "..");

test("SP8-T1 AC-5 (finding 96): the issue case's fixed grader anchors on the filter of active accounts, and the four SP3 fixtures commit through the shared helper", () => {
  const grader = readFileSync(
    join(repoRoot, "plugins/core/evals/issue-root-cause-named/graders/fixed.md"),
    "utf8",
  );
  expect(grader).toContain("\\.filter\\(");
  for (const name of [
    "ticket-triaged-against-business",
    "document-entry-opens-item",
    "jev-tightens-never-loosens",
    "issue-root-cause-named",
  ]) {
    const fixture = readFileSync(join(repoRoot, "plugins/core/evals", name, "fixture.sh"), "utf8");
    expect(fixture, name).toContain("fixture_commit ");
    expect(fixture, name).not.toContain("git -c user.name=Fixture");
  }
  expect(
    readFileSync(join(repoRoot, "plugins/core/evals/fixtures/node-plain.sh"), "utf8"),
  ).toContain("fixture_commit() {");
});

test("SP8-T1 AC-5 (finding 95): deniedReferenceReads names the plugin references a trace shows denied, once each, and nothing from a clean trace", () => {
  const denied = JSON.stringify({
    type: "tool_result",
    content:
      "Permission denied: Read /plugins/wizardingcode-developer-crew/skills/crew/references/conclave.md",
  });
  const said = JSON.stringify({
    type: "assistant",
    text: "I can't read ${CLAUDE_PLUGIN_ROOT}/skills/crew/references/conclave.md: it sits outside what I can read in this session",
  });
  const clean = JSON.stringify({
    type: "tool_result",
    content: "# Conclave (read from skills/crew/references/conclave.md)",
  });
  expect(deniedReferenceReads([denied, said, clean])).toEqual([
    "skills/crew/references/conclave.md",
  ]);
  expect(deniedReferenceReads([clean])).toEqual([]);
  expect(deniedReferenceReads([])).toEqual([]);
});

test("SP8-T6 AC-1: the SP8 cases carry the strategy and audit tags the sandbox runs, their fixtures hold no key-shaped literal and write inside their scaffold alone", () => {
  expect(SANDBOX_TAGS).toContain("strategy");
  expect(SANDBOX_TAGS).toContain("audit");
  const tagsOf = (name: string) =>
    readFileSync(`${EVALS}${name}/case.yaml`, "utf8").match(/^tags:\s*\[([^\]]*)\]/m)?.[1] ?? "";
  // The benchmark set (SP6 Task 5) tags its cases too.
  expect(tagsOf("strategy-rejects-over-engineering")).toBe("strategy, benchmark");
  expect(tagsOf("strategy-declares-phases")).toBe("strategy");
  expect(tagsOf("audit-report-three-formats")).toBe("audit");
  expect(tagsOf("issue-fast-overhead")).toBe("cost, benchmark");
  for (const name of [...SP8_CASES, "fast-route-overhead"]) {
    const fixture = readFileSync(`${EVALS}${name}/fixture.sh`, "utf8");
    // The audit case's key is assembled by the shell at scaffold time: no committed text matches the engine's rule.
    expect(fixture, name).not.toMatch(/AKIA[A-Z0-9]{16}/);
    // A fixture writes inside its scaffold: no home folder, no network, no absolute path outside it.
    expect(fixture, name).not.toMatch(/\$HOME|~\/|\bcurl\b|\bwget\b/);
    expect(fixture, name).not.toMatch(/(^|[\s"'=])\/(Users|home|tmp|etc|var|opt)\//m);
    expect(readFileSync(`${EVALS}${name}/prompt.md`, "utf8")).toContain(
      "allowed_tools: [Read, Glob, Grep, Skill]",
    );
  }
  // The kept runs' record carries no secret value (the security lead's return R-3 of SP8 Task 6).
  expect(
    readFileSync(
      fileURLToPath(new URL("../../../docs/evals/2026-10-19-sp8-results.md", import.meta.url)),
      "utf8",
    ),
  ).not.toMatch(/AKIA[A-Z0-9]{16}/);
  // The overhead cases' ceilings live in the script's table (the kit refuses unknown front-matter keys): 2.03 for the feature, 3.5 for the fix.
  expect(CEILINGS).toEqual({ "fast-route-overhead": 2.03, "issue-fast-overhead": 3.5 });
  for (const name of Object.keys(CEILINGS))
    expect(existsSync(`${EVALS}${name}/case.yaml`), name).toBe(true);
  for (const name of ["fast-route-overhead", "issue-fast-overhead"])
    expect(readFileSync(`${EVALS}${name}/prompt.md`, "utf8")).not.toMatch(/overhead_ceiling/);
  expect(readFileSync(`${EVALS}fast-route-overhead/prompt.md`, "utf8")).toMatch(/multiply\(a, b\)/);
  expect(readFileSync(`${EVALS}fast-route-overhead/graders/fixed.md`, "utf8")).toContain(
    "return a \\* b",
  );
  expect(readFileSync(`${EVALS}issue-fast-overhead/graders/fixed.md`, "utf8")).toContain(
    "return a \\+ b",
  );
});

test("SP8-T6 AC-1: the results scan reads the kit's arms as an object keyed by arm, and the older list shape too", () => {
  expect(
    armRuns({ with: [{ tracePath: "/a" }], without: [{ tracePath: "/b" }] }).map(
      (r) => r.tracePath,
    ),
  ).toEqual(["/a", "/b"]);
  expect(armRuns([{ runs: [{ tracePath: "/c" }] }, { runs: [] }]).map((r) => r.tracePath)).toEqual([
    "/c",
  ]);
  expect(armRuns(undefined)).toEqual([]);
  expect(armRuns({ with: "x" })).toEqual([]);
});

const SP4_CASES = [
  "confidential-entry-not-reused",
  "root-cause-not-repeated",
  "cto-report-from-records",
];

test("SP4-T6 AC-1: the knowledge cases carry the tag the sandbox runs, seed the base through the engine inside their scaffold with no key-shaped literal, every regex grader says its arm, a one-case run keeps its sandbox, and the evals record holds no key and no sandbox path", () => {
  expect(SANDBOX_TAGS).toContain("knowledge");
  // A one-case run keeps its workspace and trace, so a failing grader can be read (the SP8 record's first runs ran blind).
  expect(evalInvocation({ ...base, caseName: "root-cause-not-repeated" }).args).toContain(
    "--keep-temp",
  );
  for (const name of SP4_CASES) {
    const tags =
      readFileSync(`${EVALS}${name}/case.yaml`, "utf8").match(/^tags:\s*\[([^\]]*)\]/m)?.[1] ?? "";
    // Two of the three are in the benchmark set (SP6 Task 5) and carry its tag too.
    expect(tags, name).toBe(
      name === "cto-report-from-records" ? "knowledge" : "knowledge, benchmark",
    );
    const fixture = readFileSync(`${EVALS}${name}/fixture.sh`, "utf8");
    expect(fixture, name).not.toMatch(/AKIA[A-Z0-9]{16}/);
    expect(fixture, name).not.toMatch(/\$HOME|~\/|\bcurl\b|\bwget\b/);
    expect(fixture, name).not.toMatch(/(^|[\s"'=])\/(Users|home|tmp|etc|var|opt)\//m);
    // The base is seeded through the engine's commands, never by writing its file.
    expect(fixture, name).not.toMatch(/base\.json/);
    expect(fixture, name).toMatch(/crew learn /);
    expect(readFileSync(`${EVALS}${name}/prompt.md`, "utf8")).toContain(
      "allowed_tools: [Read, Glob, Grep, Skill]",
    );
    // Every regex grader says its arm: the engine's lines exist on the plugin arm alone, the fix on both.
    for (const grader of readdirSync(`${EVALS}${name}/graders`).sort()) {
      const text = readFileSync(`${EVALS}${name}/graders/${grader}`, "utf8");
      if (!/^type: regex$/m.test(text)) continue;
      expect(text.match(/^arm: (.+)$/m)?.[1], `${name}/${grader}`).toBe(
        name === "root-cause-not-repeated" && grader === "fixed.md" ? "both" : "with-only",
      );
    }
  }
  const record = readFileSync(
    fileURLToPath(new URL("../../../docs/evals/2026-10-20-sp4-results.md", import.meta.url)),
    "utf8",
  );
  expect(record).not.toMatch(/AKIA[A-Z0-9]{16}/);
  expect(record).not.toMatch(/\/private\/var\/folders|\/tmp\/|crew-home-/);
});
