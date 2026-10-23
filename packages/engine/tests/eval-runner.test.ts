import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  armRuns,
  createRunFolder,
  deniedReferenceReads,
  evalInvocation,
  resultsDir,
  runFolder,
  runKit,
  SANDBOX_TAGS,
  scanResults,
} from "../../../scripts/eval.ts";
import { CEILINGS } from "../../../scripts/eval-overhead.ts";
import { scanText } from "../src/secrets.ts";
import type { KnowledgeEntry } from "../src/types.ts";
import {
  acceptedRead,
  agentText,
  composedPath,
  deniedRead,
  firstClaudeOn,
  foldersSince,
  listResults,
  PLUGIN_ROOT,
  REFERENCE_TEXT,
  RUN_FOLDER,
  reference,
  scanAggregate,
  stubKit,
  toolResult,
  toolUse,
  writeTrace,
} from "./kit-stub.ts";

const base = { root: "/r", path: "/usr/bin", realGitDir: null, platform: "linux" as const };

test("the eval PATH puts the plugin's bin first and, on macOS, the real git next", () => {
  const mac = evalInvocation({
    ...base,
    platform: "darwin",
    realGitDir: "/Library/Developer/CommandLineTools/usr/bin",
  });
  // SP6 Task 6 (AC-1): the fixtures' bin first, where the repository helper lives, then the plugin's bin.
  expect(mac.path.split(delimiter)).toEqual([
    "/r/plugins/core/evals/fixtures/bin",
    "/r/plugins/core/bin",
    "/Library/Developer/CommandLineTools/usr/bin",
    "/usr/bin",
  ]);
  expect(evalInvocation(base).path.split(delimiter)).toEqual([
    "/r/plugins/core/evals/fixtures/bin",
    "/r/plugins/core/bin",
    "/usr/bin",
  ]);
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
  // SP6 Task 6: the two pack pairs (decision 12).
  "pack-laravel-refines-the-gates",
  "pack-laravel-absent",
  "pack-agentic-os-seats-the-team",
  "pack-agentic-os-absent",
];
const PACK_CASES = CASES.slice(-4);

test("SP2c, SP7b-T7 AC-1, SP3-T1 AC-5, SP3-T7 AC-1, SP4-T6 AC-1: the forty-two cases each have their four parts, and the fixtures they share exist", () => {
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
const FIXTURES_BIN = fileURLToPath(
  new URL("../../../plugins/core/evals/fixtures/bin/", import.meta.url),
);
const repoRoot = join(import.meta.dir, "..", "..", "..");

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
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A gate of the laravel profile as the detector writes it: command, source, then the pack or the close. */
const LARAVEL_GATE = (gate: string, command: string, source: string, pack: boolean) =>
  new RegExp(
    `"${gate}":\\s*\\{\\s*"command":\\s*"${escapeRegExp(command)}",\\s*"source":\\s*"${source}"${pack ? ',\\s*"pack":\\s*"wizardingcode-pack-laravel"' : "\\s*\\}"}`,
  );
Object.assign(SCAFFOLD_STATE, {
  // SP6 Task 6 (AC-19): the pack pairs' state. The with cases copy the repository's pack into the
  // scaffold's .packs/ at scaffold time and register the copy under the home (the kit's sandbox reads the
  // scaffold and the plugin folder, not the repository beside them), and the laravel profile carries the
  // pack's three gates proposed; the absent cases leave the core's guess.
  "pack-laravel-refines-the-gates": [
    { file: "artisan", pattern: /scopeActive/ },
    { file: "composer.json", pattern: /"laravel\/framework":\s*"\^13\.0"/ },
    { file: "pack.json", absent: true },
    { file: ".packs/laravel/pack.json", pattern: /"name":\s*"wizardingcode-pack-laravel"/ },
    { file: ".gitignore", pattern: /^\.packs\/$/m },
    {
      file: ".crew/profile.json",
      pattern: LARAVEL_GATE("test", "php artisan test", "proposed", true),
    },
    {
      file: ".crew/profile.json",
      pattern: LARAVEL_GATE("lint", "vendor/bin/pint --test", "proposed", true),
    },
    {
      file: ".crew/profile.json",
      pattern: LARAVEL_GATE(
        "typecheck",
        "vendor/bin/phpstan analyse --no-progress",
        "proposed",
        true,
      ),
    },
    { file: ".crew/profile.json", pattern: /"tags":\s*\[\s*"laravel"\s*\]/ },
    {
      file: "packs/wizardingcode-pack-laravel.json",
      home: true,
      assert: (text: string, dir: string) => {
        const registration = JSON.parse(text) as { root: string; by: string };
        expect(realpathSync(registration.root)).toBe(realpathSync(join(dir, ".packs", "laravel")));
        expect(registration.by).toBe("command");
      },
    },
  ],
  "pack-laravel-absent": [
    { file: "artisan", pattern: /scopeActive/ },
    { file: "pack.json", absent: true },
    { file: ".crew/profile.json", pattern: /^(?![\s\S]*"test":\s*\{)[\s\S]*"lint":/ },
    {
      file: ".crew/profile.json",
      pattern: LARAVEL_GATE("lint", "vendor/bin/pint --test", "detected", false),
    },
    {
      file: ".crew/profile.json",
      pattern: LARAVEL_GATE(
        "typecheck",
        "vendor/bin/phpstan analyse --no-progress",
        "detected",
        false,
      ),
    },
    { file: ".crew/profile.json", pattern: /^(?![\s\S]*"pack")(?![\s\S]*"laravel")[\s\S]*$/ },
    { file: "packs/wizardingcode-pack-laravel.json", home: true, absent: true },
  ],
  "pack-agentic-os-seats-the-team": [
    { file: "agents/triage.md", pattern: /^# Triage/ },
    { file: "tests/triage.test.mjs", pattern: /on-call/ },
    { file: "pack.json", absent: true },
    {
      file: ".crew/policy.json",
      pattern:
        /"team":\s*\{\s*"template":\s*"agentic-os",\s*"specialists":\s*\["wizardingcode-pack-agentic-os:agentic"\]\s*\}/,
    },
    {
      file: "packs/wizardingcode-pack-agentic-os.json",
      home: true,
      assert: (text: string, dir: string) => {
        const registration = JSON.parse(text) as { root: string; by: string };
        expect(realpathSync(registration.root)).toBe(
          realpathSync(join(dir, ".packs", "agentic-os")),
        );
        expect(registration.by).toBe("command");
      },
    },
  ],
  "pack-agentic-os-absent": [
    { file: "agents/triage.md", pattern: /^# Triage/ },
    { file: "pack.json", absent: true },
    { file: ".crew/policy.json", absent: true },
    { file: "packs/wizardingcode-pack-agentic-os.json", home: true, absent: true },
  ],
});

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
            PATH: `${FIXTURES_BIN}${delimiter}${PLUGIN_BIN}${delimiter}${process.env.PATH}`,
            WIZARDINGCODE_HOME: caseHome,
            WIZARDINGCODE_CREW_REPO: repoRoot,
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
    ...PACK_CASES,
  ];
  const files = [
    `${EVALS}fixtures/node-plain.sh`,
    `${EVALS}fixtures/two-projects.sh`,
    `${EVALS}fixtures/laravel-shaped.sh`,
    `${EVALS}fixtures/node-agentic.sh`,
    ...CONFINED.map((name) => `${EVALS}${name}/fixture.sh`),
  ];
  // The one permitted parent path: sourcing a shared fixture beside the case, inside the evals tree.
  const sourcing = [
    '. "$(dirname "$0")/../fixtures/node-plain.sh"',
    '. "$(dirname "$0")/../fixtures/two-projects.sh"',
    '. "$(dirname "$0")/../fixtures/laravel-shaped.sh"',
    '. "$(dirname "$0")/../fixtures/node-agentic.sh"',
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

test("SP8-T1 AC-5 (finding 95), in the kit's line shape since 2026-10-21-003 AC-1: deniedReferenceReads names the reference a denied Read names, once, the agent's own report of one, and nothing from a clean trace", () => {
  const denied = deniedRead("toolu_1", "conclave.md");
  const said = agentText(
    "I can't read ${CLAUDE_PLUGIN_ROOT}/skills/crew/references/conclave.md: it sits outside what I can read in this session",
  );
  const clean = acceptedRead("toolu_2", "receive.md");
  expect(deniedReferenceReads([...denied, said, ...clean])).toEqual([
    "skills/crew/references/conclave.md",
  ]);
  expect(deniedReferenceReads(clean)).toEqual([]);
  expect(deniedReferenceReads([])).toEqual([]);
});

// The hardening of finding 118 (2026-10-21-003): the kit's own marks, the scripts' own folder.
const RESULTS = join(repoRoot, "plugins", "core", "evals", "results");
/** Spawns scripts/eval.ts with the stub first on PATH, from the repository root unless told otherwise. */
const runEval = (bin: string, args: string[], env: Record<string, string>, cwd = repoRoot) => {
  const path = [bin, process.env.PATH ?? ""].join(delimiter);
  expect(firstClaudeOn(composedPath(repoRoot, path))).toBe(bin);
  return spawnSync("bun", [join(repoRoot, "scripts", "eval.ts"), ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env, PATH: path },
  });
};

test("H118 AC-1: a denial is read from the result's own marks, is_error or a decision other than accept, through the tool_use input or the error text, or from the agent's own report; an accepted read whose content holds the denial words and whose metadata says accept is never named", () => {
  // The false flag of finding 118: the method's words in the content, accept in the metadata, the path on the line.
  const accepted = acceptedRead("toolu_a", "understand.md");
  expect(accepted[1]).toContain("permission");
  expect(accepted[1]).toContain("skills/crew/references/understand.md");
  expect(deniedReferenceReads(accepted)).toEqual([]);
  // is_error alone, the path from the tool_use input (the error text names nothing).
  expect(
    deniedReferenceReads([
      toolUse("toolu_b", "Read", { file_path: reference("conclave.md") }),
      toolResult("toolu_b", "File does not exist.", { isError: true }),
    ]),
  ).toEqual(["skills/crew/references/conclave.md"]);
  // reject in the metadata alone, no is_error.
  expect(
    deniedReferenceReads([
      toolUse("toolu_c", "Read", { file_path: reference("specify.md") }),
      toolResult("toolu_c", "Permission to use Read has been denied.", { decision: "reject" }),
    ]),
  ).toEqual(["skills/crew/references/specify.md"]);
  // The path from the error text alone (no tool_use line for the id, no metadata).
  expect(
    deniedReferenceReads([
      toolResult("toolu_d", `Permission denied: Read ${reference("build.md")}`, {
        isError: true,
        meta: false,
      }),
    ]),
  ).toEqual(["skills/crew/references/build.md"]);
  // A Bash command naming a reference, denied.
  expect(
    deniedReferenceReads([
      toolUse("toolu_e", "Bash", { command: `cat ${reference("gate.md")}` }),
      toolResult(
        "toolu_e",
        "Permission to use Bash has been denied because Claude Code is running in don't ask mode.",
        { isError: true, decision: "reject" },
      ),
    ]),
  ).toEqual(["skills/crew/references/gate.md"]);
  // The agent's own report, with no read of the file.
  expect(
    deniedReferenceReads([
      agentText(
        `I can't read ${reference("deliver.md")}: it sits outside what I can read in this session`,
      ),
    ]),
  ).toEqual(["skills/crew/references/deliver.md"]);
  // The agent's report set aside by an accepted Read of that path.
  expect(
    deniedReferenceReads([
      agentText(`I can't read ${reference("learn.md")}: permission denied`),
      ...acceptedRead("toolu_f", "learn.md"),
    ]),
  ).toEqual([]);
  // An accepted result of another tool, an accepted Read of another file and a line that is not JSON name nothing.
  expect(
    deniedReferenceReads([
      toolUse("toolu_g", "Bash", { command: `ls ${reference("")}` }),
      toolResult("toolu_g", "receive.md\npermission.md"),
      "not json",
      ...acceptedRead("toolu_h", "plan.md"),
    ]),
  ).toEqual([]);
});

test("H118 AC-9: the agent's report is set aside only by an accepted Read of that same path; a denial naming the folder alone is named skills/crew/references; the join reads the result before its tool_use and a metadata entry with no content entry; an accepted read followed by the agent's words is not named", () => {
  const report = agentText(
    `I can't read ${reference("learn.md")}: it sits outside what I can read in this session`,
  );
  // An accepted Bash naming the path sets nothing aside.
  expect(
    deniedReferenceReads([
      report,
      toolUse("toolu_1", "Bash", { command: `ls ${reference("learn.md")}` }),
      toolResult("toolu_1", reference("learn.md")),
    ]),
  ).toEqual(["skills/crew/references/learn.md"]);
  // An accepted Read of another reference sets nothing aside.
  expect(deniedReferenceReads([report, ...acceptedRead("toolu_2", "plan.md")])).toEqual([
    "skills/crew/references/learn.md",
  ]);
  // A denied Glob of the folder alone.
  expect(
    deniedReferenceReads([
      toolUse("toolu_3", "Glob", {
        pattern: "*.md",
        path: `${PLUGIN_ROOT}/skills/crew/references`,
      }),
      toolResult("toolu_3", "Permission denied.", { isError: true }),
    ]),
  ).toEqual(["skills/crew/references"]);
  // The result before its tool_use.
  const [use, result] = deniedRead("toolu_4", "gate.md") as [string, string];
  expect(deniedReferenceReads([result, use])).toEqual(["skills/crew/references/gate.md"]);
  // A metadata entry whose id has no content entry: the rejection is the denial.
  const metaOnly = JSON.stringify({
    type: "user",
    message: { role: "user", content: [{ type: "text", text: "continue" }] },
    tool_result_meta: [
      {
        id: "toolu_5",
        permission_decision: { decision: "reject", source: "config", reason_type: "mode" },
      },
    ],
  });
  expect(
    deniedReferenceReads([
      toolUse("toolu_5", "Read", { file_path: reference("audit.md") }),
      metaOnly,
    ]),
  ).toEqual(["skills/crew/references/audit.md"]);
  // An accepted read, then the agent's words about the file with the denial words beside the path.
  expect(
    deniedReferenceReads([
      ...acceptedRead("toolu_6", "rules.md"),
      agentText(`${reference("rules.md")} says a permission is asked where nobody watches`),
    ]),
  ).toEqual([]);
  // A metadata entry without a decision is not a rejection.
  const noDecision = JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_7", content: REFERENCE_TEXT }],
    },
    tool_result_meta: [{ id: "toolu_7" }],
  });
  expect(
    deniedReferenceReads([
      toolUse("toolu_7", "Read", { file_path: reference("mail.md") }),
      noDecision,
    ]),
  ).toEqual([]);
});

test("H118 AC-6: scanResults prints one line per denied run, none for accepted reads alone, and a trace unreadable line for a trace yielding no assistant or user line", () => {
  const dir = mkdtempSync(join(tmpdir(), "scan-"));
  const deniedA1 = writeTrace(join(dir, "a1.jsonl"), [
    ...acceptedRead("t1", "receive.md"),
    ...deniedRead("t2", "conclave.md"),
  ]);
  const deniedA2 = writeTrace(join(dir, "a2.jsonl"), deniedRead("t3", "specify.md"));
  const deniedB = writeTrace(join(dir, "b1.jsonl"), [
    ...deniedRead("t4", "gate.md"),
    ...deniedRead("t5", "conclave.md"),
  ]);
  const acceptedB = writeTrace(join(dir, "b2.jsonl"), acceptedRead("t6", "gate.md"));
  const acceptedC1 = writeTrace(join(dir, "c1.jsonl"), [
    ...acceptedRead("t7", "understand.md"),
    ...acceptedRead("t8", "specify.md"),
  ]);
  const acceptedC2 = writeTrace(join(dir, "c2.jsonl"), acceptedRead("t9", "conclave.md"));
  const garbage = writeTrace(join(dir, "d1.jsonl"), [
    "not json",
    '{"type":"system","subtype":"init"}',
    "{truncated",
  ]);
  const empty = writeTrace(join(dir, "d2.jsonl"), []);
  writeFileSync(
    join(dir, "aggregate-result.json"),
    scanAggregate({
      a: [deniedA1, deniedA2],
      b: [deniedB, acceptedB],
      c: [acceptedC1, acceptedC2],
      d: [garbage, empty, join(dir, "missing.jsonl")],
    }),
  );
  expect(scanResults(dir)).toEqual([
    "needs-rerun: a (reference read denied: skills/crew/references/conclave.md)",
    "needs-rerun: a (reference read denied: skills/crew/references/specify.md)",
    "needs-rerun: b (reference read denied: skills/crew/references/gate.md, skills/crew/references/conclave.md)",
    `needs-rerun: d (trace unreadable: ${garbage})`,
    `needs-rerun: d (trace unreadable: ${empty})`,
  ]);
  expect(scanResults(join(dir, "none"))).toEqual([]);
});

test("H118 AC-7: runFolder builds the kit's stamp and the suffix from the clock given; createRunFolder refuses a parent other than results and an existing folder; a case name outside ^[\\w-]+$ is the usage line before anything is created", () => {
  const now = new Date("2026-10-21T03:45:01.273Z");
  expect(runFolder("/r/results", "benchmark", now)).toBe(
    "/r/results/2026-10-21T03-45-01-273Z-benchmark",
  );
  expect(runFolder("/r/results", "case-false-done", now)).toBe(
    "/r/results/2026-10-21T03-45-01-273Z-case-false-done",
  );
  expect(runFolder("/r/results", "suite", new Date("2026-01-02T00:00:00.000Z"))).toBe(
    "/r/results/2026-01-02T00-00-00-000Z-suite",
  );
  const dir = mkdtempSync(join(tmpdir(), "run-folder-"));
  const results = join(dir, "results");
  const folder = runFolder(results, "suite", now);
  expect(existsSync(results)).toBe(false);
  createRunFolder(folder, results);
  expect(statSync(folder).isDirectory()).toBe(true);
  expect(() => createRunFolder(folder, results)).toThrow(`run folder ${folder} exists`);
  const outside = join(dir, "elsewhere", "2026-10-21T03-45-01-273Z-suite");
  expect(() => createRunFolder(outside, results)).toThrow(
    `run folder ${outside} is not under ${results}`,
  );
  expect(existsSync(join(dir, "elsewhere"))).toBe(false);
  const climbing = join(results, "..", "x");
  expect(() => createRunFolder(climbing, results)).toThrow("is not under");
  expect(existsSync(join(dir, "x"))).toBe(false);
  // The usage line for a case name that is not a plain word, before anything is created.
  const bin = stubKit(dir);
  const before = listResults(RESULTS);
  for (const name of ["../x", "a b", "x/y", ""]) {
    const run = runEval(bin, ["--case", name], { STUB_EXIT: "0" });
    expect(run.status, name).toBe(1);
    expect(run.stderr, name).toContain("usage: bun scripts/eval.ts [--case <name>]");
  }
  expect(foldersSince(RESULTS, before)).toEqual([]);
});

test("H118 AC-4: bun scripts/eval.ts gives the kit a folder of its own through --output-dir and scans that folder's traces alone, with --case and without; newestResults is gone from both scripts", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-run-"));
  const bin = stubKit(dir);
  const denied = writeTrace(join(dir, "denied.jsonl"), [
    ...acceptedRead("t1", "receive.md"),
    ...deniedRead("t2", "build.md"),
  ]);
  const accepted = writeTrace(join(dir, "accepted.jsonl"), [
    ...acceptedRead("t3", "understand.md"),
    ...acceptedRead("t4", "conclave.md"),
  ]);
  const flagged = join(dir, "flagged.json");
  writeFileSync(flagged, scanAggregate({ "proven-test-first": [denied, accepted] }));
  const clean = join(dir, "clean.json");
  writeFileSync(clean, scanAggregate({ "false-done": [accepted] }));
  const decoyAggregate = join(dir, "decoy.json");
  writeFileSync(decoyAggregate, scanAggregate({ "decoy-case": [denied] }));
  const decoy = join(RESULTS, `9999-decoy-${process.pid}`);
  const hadResults = existsSync(RESULTS);
  const before = listResults(RESULTS);
  try {
    const log = join(dir, "stub.log");
    const suite = runEval(bin, [], {
      STUB_AGGREGATE: flagged,
      STUB_EXIT: "1",
      STUB_LOG: log,
      STUB_DECOY: decoy,
      STUB_DECOY_AGGREGATE: decoyAggregate,
    });
    expect(suite.status, suite.stderr).toBe(1);
    expect(suite.stdout).toContain(
      "needs-rerun: proven-test-first (reference read denied: skills/crew/references/build.md)",
    );
    expect(suite.stdout).not.toContain("decoy-case");
    const own = foldersSince(RESULTS, before).filter((f) => f !== basename(decoy));
    expect(own).toHaveLength(1);
    const folder = own[0] ?? "";
    expect(folder).toMatch(RUN_FOLDER);
    expect(folder.endsWith("-suite")).toBe(true);
    expect(existsSync(join(RESULTS, folder, "aggregate-result.json"))).toBe(true);
    const [cwd, args] = readFileSync(log, "utf8").split("\n");
    expect(realpathSync(cwd ?? "")).toBe(realpathSync(repoRoot));
    expect(args).toContain(`--output-dir plugins/core/evals/results/${folder}`);
    expect(args).toContain("--tag ");
    expect(suite.stdout).toContain(`--output-dir plugins/core/evals/results/${folder}`);
    // One case: the suffix names it, an accepted-only trace prints no line, the status is the kit's.
    const one = runEval(bin, ["--case", "false-done"], {
      STUB_AGGREGATE: clean,
      STUB_EXIT: "0",
      STUB_LOG: log,
    });
    expect(one.status, one.stderr).toBe(0);
    expect(one.stdout).not.toContain("needs-rerun");
    const second = foldersSince(RESULTS, [...before, folder, basename(decoy)]);
    expect(second).toHaveLength(1);
    expect(second[0]?.endsWith("-case-false-done")).toBe(true);
    const logged = readFileSync(log, "utf8").split("\n")[1] ?? "";
    expect(logged).toContain("--case false-done");
    expect(logged).toContain(`--output-dir plugins/core/evals/results/${second[0]}`);
  } finally {
    for (const f of foldersSince(RESULTS, before))
      rmSync(join(RESULTS, f), { recursive: true, force: true });
    if (!hadResults) rmSync(RESULTS, { recursive: true, force: true });
  }
  const evalSource = readFileSync(join(repoRoot, "scripts", "eval.ts"), "utf8");
  const benchmarkSource = readFileSync(join(repoRoot, "scripts", "benchmark.ts"), "utf8");
  expect(evalSource).not.toContain("newestResults");
  expect(benchmarkSource).not.toContain("newestResults");
  expect(benchmarkSource).not.toContain("readdirSync");
});

test("H118 AC-8 (eval.ts): the kit is spawned with cwd the repository root wherever the script runs from, and a folder holding no aggregate after the run is refused naming the status and the folder, nothing scanned; decoy older and newer folders are never read", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-empty-"));
  const bin = stubKit(dir);
  const denied = writeTrace(join(dir, "denied.jsonl"), deniedRead("t1", "build.md"));
  const decoyAggregate = join(dir, "decoy.json");
  writeFileSync(decoyAggregate, scanAggregate({ "decoy-case": [denied] }));
  const older = join(RESULTS, `0000-older-${process.pid}`);
  const newer = join(RESULTS, `9999-newer-${process.pid}`);
  const hadResults = existsSync(RESULTS);
  const before = listResults(RESULTS);
  try {
    mkdirSync(older, { recursive: true });
    writeFileSync(join(older, "aggregate-result.json"), readFileSync(decoyAggregate));
    const log = join(dir, "stub.log");
    // From another cwd, with nothing to copy: the folder is created under the repository, the kit runs there, the empty folder is refused.
    const run = runEval(
      bin,
      [],
      {
        STUB_AGGREGATE: join(dir, "missing.json"),
        STUB_EXIT: "0",
        STUB_LOG: log,
        STUB_DECOY: newer,
        STUB_DECOY_AGGREGATE: decoyAggregate,
      },
      dir,
    );
    expect(run.status).toBe(1);
    const own = foldersSince(RESULTS, [...before, basename(older)]).filter(
      (f) => f !== basename(newer),
    );
    expect(own).toHaveLength(1);
    expect(own[0]).toMatch(RUN_FOLDER);
    expect(run.stderr).toContain(
      `eval: the kit exited 0 and wrote no aggregate in plugins/core/evals/results/${own[0]}`,
    );
    expect(run.stdout).not.toContain("needs-rerun");
    expect(realpathSync(readFileSync(log, "utf8").split("\n")[0] ?? "")).toBe(
      realpathSync(repoRoot),
    );
    // From another cwd with an aggregate: written into the repository's folder and scanned there, the decoys nowhere.
    const flagged = join(dir, "flagged.json");
    writeFileSync(flagged, scanAggregate({ "proven-test-first": [denied] }));
    const good = runEval(bin, [], { STUB_AGGREGATE: flagged, STUB_EXIT: "0" }, dir);
    expect(good.status, good.stderr).toBe(0);
    expect(good.stdout).toContain(
      "needs-rerun: proven-test-first (reference read denied: skills/crew/references/build.md)",
    );
    expect(good.stdout).not.toContain("decoy-case");
  } finally {
    for (const f of foldersSince(RESULTS, before))
      rmSync(join(RESULTS, f), { recursive: true, force: true });
    if (!hadResults) rmSync(RESULTS, { recursive: true, force: true });
  }
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

// SP6 Task 6: the pack pairs (decision 12), the shim and the runner's environment.
const PACK_GRADERS: Record<string, Record<string, Record<string, string>>> = {
  "pack-laravel-refines-the-gates": {
    "pack-gate": {
      type: "regex",
      target: "trace",
      pattern:
        "test=php artisan test( \\[proposed\\])? \\(pack wizardingcode-pack-laravel\\)|pack wizardingcode-pack-laravel's command is not confirmed",
      arm: "with-only",
    },
    "gate-ran": {
      type: "regex",
      target: "trace",
      pattern: "test \\(\\.\\): pass",
      arm: "with-only",
    },
    "profile-pack": {
      type: "regex",
      target: "{ source: file, path: .crew/profile.json }",
      pattern:
        '"command":\\s*"php artisan test",\\s*"source":\\s*"confirmed",\\s*"pack":\\s*"wizardingcode-pack-laravel"',
      arm: "with-only",
    },
    "knowledge-path": {
      type: "regex",
      target: "trace",
      pattern: "knowledge/laravel\\.md",
      arm: "with-only",
    },
    "scope-added": {
      type: "regex",
      target: "{ source: file, path: app/Models/Account.php }",
      pattern: "scopeActive|#\\[Scope\\]",
      arm: "both",
    },
    "honest-ending": { type: "llm" },
  },
  "pack-laravel-absent": {
    "no-pack-gate": {
      type: "regex",
      target: "trace",
      pattern: "\\(pack wizardingcode-pack-laravel\\)",
      match: "not_contains",
      arm: "with-only",
    },
    "no-pack-in-profile": {
      type: "regex",
      target: "{ source: file, path: .crew/profile.json }",
      pattern: '"pack":',
      match: "not_contains",
      arm: "with-only",
    },
    "no-knowledge-path": {
      type: "regex",
      target: "trace",
      pattern: "knowledge/laravel\\.md",
      match: "not_contains",
      arm: "with-only",
    },
    "scope-added": {
      type: "regex",
      target: "{ source: file, path: app/Models/Account.php }",
      pattern: "scopeActive|#\\[Scope\\]",
      arm: "both",
    },
    "honest-ending": { type: "llm" },
  },
  "pack-agentic-os-seats-the-team": {
    seat: {
      type: "regex",
      target: "trace",
      pattern:
        "\\| expert \\| agentic-os \\| pack wizardingcode-pack-agentic-os \\(agents/\\*\\*\\) \\|",
      arm: "with-only",
    },
    "knowledge-path": {
      type: "regex",
      target: "trace",
      pattern: "knowledge/agentic\\.md",
      arm: "with-only",
    },
    "rule-added": {
      type: "regex",
      target: "{ source: file, path: agents/triage.md }",
      pattern: "on-call",
      arm: "both",
    },
    "honest-ending": { type: "llm" },
  },
  "pack-agentic-os-absent": {
    "no-seat": {
      type: "regex",
      target: "trace",
      pattern: "pack wizardingcode-pack-agentic-os",
      match: "not_contains",
      arm: "with-only",
    },
    "no-knowledge-path": {
      type: "regex",
      target: "trace",
      pattern: "knowledge/agentic\\.md",
      match: "not_contains",
      arm: "with-only",
    },
    "rule-added": {
      type: "regex",
      target: "{ source: file, path: agents/triage.md }",
      pattern: "on-call",
      arm: "both",
    },
    "honest-ending": { type: "llm" },
  },
};
/** A grader's front matter as key: value lines, the quotes of a pattern stripped. */
const frontMatter = (text: string): Record<string, string> => {
  const block = text.split("---")[1] ?? "";
  const out: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const at = line.indexOf(":");
    if (at < 0) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    if (value.startsWith("'") && value.endsWith("'"))
      value = value.slice(1, -1).replace(/''/g, "'");
    out[key] = value;
  }
  return out;
};

test("SP6-T6 AC-1: the four pack cases carry the tag packs, SANDBOX_TAGS holds it, the invocation carries the repository root as WIZARDINGCODE_CREW_REPO and nothing else, and the README's command line shows the PATH", () => {
  expect(SANDBOX_TAGS).toContain("packs");
  for (const name of PACK_CASES) {
    const tags =
      readFileSync(`${EVALS}${name}/case.yaml`, "utf8").match(/^tags:\s*\[([^\]]*)\]/m)?.[1] ?? "";
    expect(
      tags.split(",").map((t) => t.trim()),
      name,
    ).toContain("packs");
  }
  expect(evalInvocation(base).env).toEqual({ WIZARDINGCODE_CREW_REPO: "/r" });
  expect(evalInvocation({ ...base, caseName: "false-done" }).env).toEqual({
    WIZARDINGCODE_CREW_REPO: "/r",
  });
  const readme = readFileSync(`${EVALS}README.md`, "utf8");
  expect(readme).toContain(
    'PATH="$PWD/plugins/core/evals/fixtures/bin:$PWD/plugins/core/bin:$(dirname "$(xcrun --find git)"):$PATH" WIZARDINGCODE_CREW_REPO="$PWD" claude plugin eval plugins/core',
  );
});

test("SP6-T6 AC-11, AC-28: fixtures/bin holds the repository helper alone (no shim: a session's PATH is Claude Code's, never the runner's); both mains pass the invocation's environment beside PATH", () => {
  expect(readdirSync(FIXTURES_BIN)).toEqual(["wizardingcode-crew-repo"]);
  expect(statSync(join(FIXTURES_BIN, "wizardingcode-crew-repo")).mode & 0o111).not.toBe(0);
  // H118: both mains run the kit through runKit, the one spawn, which passes the invocation's environment beside PATH.
  const evalSource = readFileSync(join(repoRoot, "scripts/eval.ts"), "utf8");
  expect(evalSource).toContain("env: { ...process.env, ...env, PATH: path }");
  expect(evalSource.split('spawnSync("claude"').length).toBe(2);
  const benchmarkSource = readFileSync(join(repoRoot, "scripts/benchmark.ts"), "utf8");
  expect(benchmarkSource).toContain(
    'runKit({ root: ROOT, suffix: "benchmark", tags: ["benchmark"] })',
  );
  expect(benchmarkSource).not.toContain('spawnSync("claude"');
  expect(benchmarkSource).not.toContain("WIZARDINGCODE_CREW_REPO");
  const readme = readFileSync(`${EVALS}README.md`, "utf8");
  expect(readme).toContain(
    "The Laravel pair needs `php` on the machine that runs the evals (the fixture's `artisan` is a PHP script with no framework): a session's PATH is Claude Code's, with the plugin's own `bin/` added, never the runner's, so nothing the runner puts on its PATH reaches the engine's gates inside a session.",
  );
});

test("SP6-T6 AC-12: the pack fixtures stay confined: set -eu, the variable alone as the pack's path, a loud refusal without it, crew pack add before crew detect, no copy of a pack, no gate confirmed or set by hand; a with fixture given an empty folder exits non-zero and leaves no commit", () => {
  const withCases = ["pack-laravel-refines-the-gates", "pack-agentic-os-seats-the-team"];
  for (const name of PACK_CASES) {
    const text = readFileSync(`${EVALS}${name}/fixture.sh`, "utf8");
    expect(text, name).toContain("set -eu");
    expect(text, name).not.toMatch(/crew profile (confirm|set)/);
    expect(text, name).not.toMatch(/\.crew\/profile\.json/);
    // Nothing of a fixture enters the repository's packs/ or changes into it; the copy goes one way,
    // from the repository into the scaffold's .packs/ (the kit's sandbox reads the scaffold and the
    // plugin folder, not the repository beside them), and the registration names the scaffold's copy.
    expect(text, name).not.toMatch(/\bcd\b[^\n]*packs\//);
    expect(text, name).not.toMatch(/>\s*"?\$REPO\/packs/);
    // Every line that names the repository's packs/ (not the scaffold's .packs/) is the copy, the
    // manifest check or a comment.
    for (const line of text.split("\n").filter((l) => /(^|[^.])packs\//.test(l)))
      expect(line.trim(), name).toMatch(
        /^cp -R "\$REPO\/packs\/(laravel|agentic-os)" \.packs\/(laravel|agentic-os)$|pack\.json|^# /,
      );
    for (const line of text.split("\n").filter((l) => l.includes("crew pack add")))
      expect(line.trim(), name).toMatch(
        /^crew pack add \.packs\/(laravel|agentic-os)( > \/dev\/null)?$/,
      );
    if (withCases.includes(name)) {
      expect(text, name).toMatch(/WIZARDINGCODE_CREW_REPO[^\n]*pack\.json is missing/);
      expect(text.indexOf("crew pack add"), name).toBeLessThan(text.indexOf("crew detect"));
    } else expect(text, name).not.toContain("crew pack add");
  }
  for (const shared of ["laravel-shaped.sh", "node-agentic.sh"])
    expect(readFileSync(`${EVALS}fixtures/${shared}`, "utf8")).toContain("set -eu");
  for (const name of withCases) {
    const dir = mkdtempSync(join(tmpdir(), `crew-eval-empty-${name}-`));
    const home = mkdtempSync(join(tmpdir(), "crew-evals-home-"));
    const empty = mkdtempSync(join(tmpdir(), "no-packs-"));
    try {
      const run = spawnSync("sh", [`${EVALS}${name}/fixture.sh`], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${FIXTURES_BIN}${delimiter}${PLUGIN_BIN}${delimiter}${process.env.PATH}`,
          WIZARDINGCODE_HOME: home,
          WIZARDINGCODE_CREW_REPO: empty,
        },
      });
      expect(run.status, name).not.toBe(0);
      expect(run.stderr, name).toContain("pack.json is missing");
      expect(
        spawnSync("git", ["-C", dir, "rev-list", "--count", "HEAD"], { encoding: "utf8" }).status,
      ).not.toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
      rmSync(empty, { recursive: true, force: true });
    }
  }
});

test("SP6-T6 AC-18, AC-28: the laravel fixture's artisan is a PHP script that fails through the machine's php as committed and passes once the model holds the scope", () => {
  const php = spawnSync("php", ["-v"], { encoding: "utf8" });
  expect(php.status, "php is needed on PATH for the Laravel pair").toBe(0);
  const dir = mkdtempSync(join(tmpdir(), "crew-eval-artisan-"));
  const home = mkdtempSync(join(tmpdir(), "crew-evals-home-"));
  const env = {
    ...process.env,
    PATH: `${FIXTURES_BIN}${delimiter}${PLUGIN_BIN}${delimiter}${process.env.PATH}`,
    WIZARDINGCODE_HOME: home,
    WIZARDINGCODE_CREW_REPO: repoRoot,
  };
  try {
    const scaffold = spawnSync("sh", [`${EVALS}pack-laravel-absent/fixture.sh`], {
      cwd: dir,
      encoding: "utf8",
      env,
    });
    expect(scaffold.status, scaffold.stderr).toBe(0);
    expect(readFileSync(join(dir, "artisan"), "utf8").split("\n")[0]).toBe("#!/usr/bin/env php");
    const red = spawnSync("php", ["artisan", "test"], { cwd: dir, encoding: "utf8", env });
    expect(red.status, red.stdout + red.stderr).toBe(1);
    expect(red.stdout).toContain("FAIL");
    const model = join(dir, "app", "Models", "Account.php");
    writeFileSync(
      model,
      readFileSync(model, "utf8").replace(
        /\}\s*$/,
        "    public function scopeActive($query)\n    {\n        return $query->where('active', true);\n    }\n}\n",
      ),
    );
    const green = spawnSync("php", ["artisan", "test"], { cwd: dir, encoding: "utf8", env });
    expect(green.status, green.stdout + green.stderr).toBe(0);
    expect(green.stdout).toContain("PASS");
    // The attribute form Laravel documents since 12.x turns the gate green too (AC-20's grader accepts it).
    writeFileSync(
      model,
      readFileSync(model, "utf8").replace(
        / {4}public function scopeActive[\s\S]*?\n {4}\}\n/,
        "    #[Scope]\n    protected function active($query)\n    {\n        return $query->where('active', true);\n    }\n",
      ),
    );
    expect(readFileSync(model, "utf8")).not.toContain("scopeActive");
    const attribute = spawnSync("php", ["artisan", "test"], { cwd: dir, encoding: "utf8", env });
    expect(attribute.status, attribute.stdout + attribute.stderr).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("SP6-T6 AC-3, AC-16, AC-17, AC-20, AC-24: the pack cases' graders, their patterns, targets and arms, exactly; the laravel prompt names scopeActive and asks for crew profile before the confirmation", () => {
  for (const [name, graders] of Object.entries(PACK_GRADERS)) {
    const dir = `${EVALS}${name}/graders/`;
    expect(readdirSync(dir).sort(), name).toEqual(
      Object.keys(graders)
        .map((g) => `${g}.md`)
        .sort(),
    );
    for (const [grader, expected] of Object.entries(graders))
      expect(frontMatter(readFileSync(`${dir}${grader}.md`, "utf8")), `${name}/${grader}`).toEqual(
        expected,
      );
  }
  const prompt = readFileSync(`${EVALS}pack-laravel-refines-the-gates/prompt.md`, "utf8");
  expect(prompt).toContain("scopeActive");
  expect(prompt).toMatch(/crew profile[^.]*then confirm them/);
  expect(readFileSync(`${EVALS}pack-laravel-absent/prompt.md`, "utf8")).toContain(
    "php artisan test",
  );
  expect(readFileSync(`${EVALS}pack-agentic-os-seats-the-team/prompt.md`, "utf8")).toContain(
    "on-call",
  );
  for (const name of PACK_CASES) {
    const text = readFileSync(`${EVALS}${name}/prompt.md`, "utf8");
    expect(text, name).toMatch(/^---\nmax_turns: \d+\n/);
    expect(text, name).toContain("without waiting for me");
  }
});

test("SP6-T6 AC-13: the committed records of the SP6 run hold no absolute path and no secret: the redacted aggregate copy, the evals record and the pack READMEs' figures paragraphs", () => {
  const files = [
    "docs/evals/2026-10-21-sp6-results.md",
    "docs/evals/2026-10-21-sp6-aggregate-result.json",
    "packs/laravel/README.md",
    "packs/agentic-os/README.md",
  ];
  for (const rel of files) {
    const text = readFileSync(join(repoRoot, rel), "utf8");
    for (const forbidden of ["/Users/", "/private/", "/tmp/", "crew-home-", repoRoot])
      expect(text, `${rel} holds ${forbidden}`).not.toContain(forbidden);
    expect(scanText(text, rel), rel).toEqual([]);
  }
  const aggregate = JSON.parse(readFileSync(join(repoRoot, files[1] as string), "utf8")) as {
    suite: { root: string; plugins: { path: string }[] };
    cases: { arms: Record<string, { tracePath: string }[]> }[];
  };
  expect(aggregate.suite.root).toBe("<repo>");
  for (const plugin of aggregate.suite.plugins) expect(plugin.path).toBe("<repo>/plugins/core");
  for (const c of aggregate.cases)
    for (const runs of Object.values(c.arms))
      for (const run of runs) expect(run.tracePath).toMatch(/^<tmp>\//);
});

test("SP6-T6 AC-26: the repository root reaches a pack fixture through PATH: the helper prints the root of the repository it lives in, a with fixture run without the variable registers the pack, and the fixtures take the variable first", () => {
  const env = {
    ...process.env,
    PATH: `${FIXTURES_BIN}${delimiter}${PLUGIN_BIN}${delimiter}${process.env.PATH}`,
  };
  delete (env as Record<string, string | undefined>).WIZARDINGCODE_CREW_REPO;
  const helper = spawnSync("wizardingcode-crew-repo", [], { encoding: "utf8", env });
  expect(helper.status, helper.stderr).toBe(0);
  expect(realpathSync(helper.stdout.trim())).toBe(realpathSync(repoRoot));
  for (const name of ["pack-laravel-refines-the-gates", "pack-agentic-os-seats-the-team"]) {
    const text = readFileSync(`${EVALS}${name}/fixture.sh`, "utf8");
    expect(text, name).toContain(
      'REPO="${WIZARDINGCODE_CREW_REPO:-$(wizardingcode-crew-repo 2>/dev/null || true)}"',
    );
    const dir = mkdtempSync(join(tmpdir(), `crew-eval-nohome-${name}-`));
    const home = mkdtempSync(join(tmpdir(), "crew-evals-home-"));
    try {
      const run = spawnSync("sh", [`${EVALS}${name}/fixture.sh`], {
        cwd: dir,
        encoding: "utf8",
        env: { ...env, WIZARDINGCODE_HOME: home },
      });
      expect(run.status, `${name}: ${run.stderr}`).toBe(0);
      const pack = name.startsWith("pack-laravel")
        ? "wizardingcode-pack-laravel"
        : "wizardingcode-pack-agentic-os";
      expect(existsSync(join(home, "crew", "packs", `${pack}.json`)), name).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  }
});

test("SP6-T6 AC-24: the profile-pack grader's pattern holds after a person's confirmation and a refreshed detection: the key order command, source, pack is what the engine leaves", () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-eval-confirm-"));
  const home = mkdtempSync(join(tmpdir(), "crew-evals-home-"));
  const env = {
    ...process.env,
    PATH: `${FIXTURES_BIN}${delimiter}${PLUGIN_BIN}${delimiter}${process.env.PATH}`,
    WIZARDINGCODE_HOME: home,
    WIZARDINGCODE_CREW_REPO: repoRoot,
  };
  try {
    const scaffold = spawnSync("sh", [`${EVALS}pack-laravel-refines-the-gates/fixture.sh`], {
      cwd: dir,
      encoding: "utf8",
      env,
    });
    expect(scaffold.status, scaffold.stderr).toBe(0);
    const pattern = new RegExp(
      frontMatter(
        readFileSync(`${EVALS}pack-laravel-refines-the-gates/graders/profile-pack.md`, "utf8"),
      ).pattern as string,
    );
    const profile = () => readFileSync(join(dir, ".crew", "profile.json"), "utf8");
    expect(profile()).not.toMatch(pattern);
    const confirm = spawnSync("crew", ["profile", "confirm", "test"], {
      cwd: dir,
      encoding: "utf8",
      env,
    });
    expect(confirm.status, confirm.stderr).toBe(0);
    expect(profile()).toMatch(pattern);
    const refresh = spawnSync("crew", ["detect", "--refresh"], { cwd: dir, encoding: "utf8", env });
    expect(refresh.status, refresh.stderr).toBe(0);
    expect(profile()).toMatch(pattern);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("AC-2 (item C2b, finding 118's debt): resultsDir takes WIZARDINGCODE_CREW_EVAL_RESULTS when set, a repository-relative path without .., and the default otherwise", () => {
  expect(resultsDir({})).toBe("plugins/core/evals/results");
  expect(resultsDir({ WIZARDINGCODE_CREW_EVAL_RESULTS: "plugins/core/evals/results-test-1" })).toBe(
    "plugins/core/evals/results-test-1",
  );
  for (const value of [
    "/tmp/results",
    "C:\\results",
    "plugins/../x",
    "..\\x",
    "plugins\\..\\x",
    "",
  ]) {
    expect(() => resultsDir({ WIZARDINGCODE_CREW_EVAL_RESULTS: value }), value).toThrow(
      `WIZARDINGCODE_CREW_EVAL_RESULTS must be a path under the repository, not ${value}`,
    );
  }
});

test("AC-3 (finding 131): runKit takes its folder from resultsDir, so an absolute WIZARDINGCODE_CREW_EVAL_RESULTS is refused before any folder is created or the kit spawned", () => {
  const root = mkdtempSync(join(tmpdir(), "crew-runkit-"));
  const saved = process.env.WIZARDINGCODE_CREW_EVAL_RESULTS;
  process.env.WIZARDINGCODE_CREW_EVAL_RESULTS = "/tmp/results";
  try {
    expect(() => runKit({ root, suffix: "refused" })).toThrow(
      "WIZARDINGCODE_CREW_EVAL_RESULTS must be a path under the repository, not /tmp/results",
    );
    expect(readdirSync(root)).toEqual([]);
  } finally {
    if (saved === undefined) delete process.env.WIZARDINGCODE_CREW_EVAL_RESULTS;
    else process.env.WIZARDINGCODE_CREW_EVAL_RESULTS = saved;
    rmSync(root, { recursive: true, force: true });
  }
});

// Consolidation item 7 (2026-10-22-014): the graders read what ran (findings 65, 37), the
// kind-observed-e2e fixture opens no socket (finding 37) and the runner's cost cap (finding 63).

/** A grader's front matter, read from its file in the case's graders folder. */
const graderOf = (caseName: string, grader: string): Record<string, string> =>
  frontMatter(readFileSync(`${EVALS}${caseName}/graders/${grader}.md`, "utf8"));
/** A regex grader's pattern compiled as the kit reads it. */
const graderPattern = (caseName: string, grader: string): RegExp =>
  new RegExp(graderOf(caseName, grader).pattern as string);
/** A kept trace's text: its lines, one JSON line each, as the kit's regex graders read it. */
const traceText = (lines: readonly string[]): string => `${lines.join("\n")}\n`;
const CON7_ID = "2026-10-22-001-rounds";
/** The two lines of a Bash call that ran the command and printed its output. */
const ranBash = (id: string, command: string, output: string, isError = false): string[] => [
  toolUse(id, "Bash", { command, description: "Run the crew command" }),
  toolResult(id, output, { isError }),
];
/** The two lines of an accepted Read of a reference, its whole text as the result. */
const readReference = (id: string, file: string): string[] => {
  const text = readFileSync(join(repoRoot, "plugins/core/skills/crew/references", file), "utf8");
  return [
    toolUse(id, "Read", { file_path: reference(file) }),
    toolResult(id, text, { filePath: reference(file) }),
  ];
};

test("CON7-AC-4-validators", () => {
  const grader = graderOf("team-by-route", "validators-exist");
  expect(grader.type).toBe("regex");
  expect(grader.target).toBe("{ source: file, path: src/validation.mjs }");
  const pattern = graderPattern("team-by-route", "validators-exist");
  const id = 'export function validId(id) {\n  return typeof id === "string" && id !== "";\n}\n';
  const email = 'export function validEmail(email) {\n  return email.split("@").length === 2;\n}\n';
  // Both validators, in either order.
  expect(`${id}\n${email}`).toMatch(pattern);
  expect(`${email}\n${id}`).toMatch(pattern);
  // One of the two is not enough.
  expect(email).not.toMatch(pattern);
  expect(id).not.toMatch(pattern);
});

test("CON7-AC-4-norole", () => {
  for (const name of ["fast-route-overhead", "issue-fast-overhead"]) {
    const pattern = graderPattern(name, "no-role-launched");
    const plain = traceText([
      ...readReference("r1", "gate.md"),
      ...ranBash("b1", "node --test", "# pass 2"),
      agentText("Added multiply beside add, with its test; the suite passes."),
    ]);
    expect(plain, name).toMatch(pattern);
    const judged = traceText([
      ...ranBash("b1", "node --test", "# pass 2"),
      toolUse("a1", "Agent", {
        subagent_type: "wizardingcode-developer-crew:judge",
        description: "Rule the gates",
        prompt: "as judge of the gates",
      }),
      toolResult("a1", "ruling filed"),
    ]);
    expect(judged, name).not.toMatch(pattern);
    // The negative grader is paired with the positive one: a run that did nothing fails `fixed`.
    const fixed = graderOf(name, "fixed");
    expect(fixed.type, name).toBe("regex");
    expect(fixed.arm, name).toBe("both");
    expect(fixed.target, name).toBe("{ source: file, path: src/math.mjs }");
  }
});

test("CON7-AC-4-ruling", () => {
  const pattern = graderPattern("rounds-bounded", "ruling-recorded");
  const ruling = `.crew/work/${CON7_ID}/review/ruling.json`;
  const plain = traceText(
    ranBash("b1", `crew judgement ${CON7_ID} record --ruling ${ruling}`, "code-quality: proven"),
  );
  expect(plain).toMatch(pattern);
  // A quoted cd prefix: the command field holds escaped quotes before the call.
  const prefixed = traceText(
    ranBash(
      "b2",
      `cd "/x" && crew judgement ${CON7_ID} record --ruling ${ruling}`,
      "code-quality: proven",
    ),
  );
  expect(prefixed).toContain('\\"/x\\"');
  expect(prefixed).toMatch(pattern);
  // The references' sentences alone, read by the agent: no ruling recorded.
  const references = traceText([
    ...readReference("r1", "gate.md"),
    ...readReference("r2", "plan.md"),
  ]);
  expect(references).toContain("crew judgement <id> record --ruling");
  expect(references).not.toMatch(pattern);
  // The agent only quoting the command in its own words: no ruling recorded.
  const prose = traceText([
    agentText(`Next I record the ruling with crew judgement ${CON7_ID} record --ruling ${ruling}.`),
  ]);
  expect(prose).not.toMatch(pattern);
});

test("CON7-AC-4-register", () => {
  const pattern = graderPattern("decision-register-reread", "register-read");
  expect(traceText(ranBash("b1", "crew decisions", "D-1 deactivation (user)"))).toMatch(pattern);
  const prefixed = traceText(
    ranBash("b2", 'cd "/x" && crew decisions --grep loyalty', "D-1 deactivation (user)"),
  );
  expect(prefixed).toContain('\\"/x\\"');
  expect(prefixed).toMatch(pattern);
  const references = traceText([
    ...readReference("r1", "rules.md"),
    ...readReference("r2", "understand.md"),
    ...readReference("r3", "receive.md"),
  ]);
  expect(references).toContain("crew decisions");
  expect(references).not.toMatch(pattern);
  const prose = traceText([
    agentText("Before building I would read the register with crew decisions --grep loyalty."),
  ]);
  expect(prose).not.toMatch(pattern);
});

test("CON7-AC-4-cap", () => {
  const file = `${EVALS}rounds-bounded/graders/cap-refused.md`;
  expect(existsSync(file)).toBe(true);
  const grader = graderOf("rounds-bounded", "cap-refused");
  expect(grader.type).toBe("regex");
  expect(grader.target).toBe("trace");
  expect(grader.arm).toBeDefined();
  // The llm grader stays beside it.
  expect(graderOf("rounds-bounded", "cap-respected").type).toBe("llm");
  const pattern = graderPattern("rounds-bounded", "cap-refused");
  // The engine's refusal as cli.ts prints it for a policy of one round.
  const refusal = `judgement round 2 of ${CON7_ID}: the policy allows 1 (team.maxJudgementRounds); the user continues it once with crew continue ${CON7_ID} judgement, or decides (crew skip <id> gate:<gate> where policy.json allows it)`;
  const refused = traceText(
    ranBash(
      "b1",
      `crew judgement ${CON7_ID} record --ruling .crew/work/${CON7_ID}/review/ruling.json`,
      `Exit code 1\n${refusal}`,
      true,
    ),
  );
  expect(refused).toMatch(pattern);
  // Another round count or another cap is not the refusal of this case.
  expect(
    traceText(ranBash("b2", "crew status", refusal.replace("allows 1", "allows 2"))),
  ).not.toMatch(pattern);
  // A proven first ruling alone: no refusal.
  expect(
    traceText(ranBash("b3", `crew judgement ${CON7_ID} record --ruling r.json`, "proven")),
  ).not.toMatch(pattern);
  // The agent only quoting the refusal in its own words: the engine refused nothing.
  expect(traceText([agentText(`The engine would answer: ${refusal}`)])).not.toMatch(pattern);
});

test("CON7-AC-5", () => {
  const fixture = readFileSync(`${EVALS}kind-observed-e2e/fixture.sh`, "utf8");
  // First: the fixture opens no socket.
  expect(fixture).not.toContain("listen");
  expect(fixture).toMatch(/export function answer\(path\)/);
  const dir = mkdtempSync(join(tmpdir(), "crew-eval-nosocket-"));
  const home = mkdtempSync(join(tmpdir(), "crew-evals-home-"));
  const guard = join(home, "no-listen.mjs");
  // Any listen in the test process throws: the e2e test passes only in process.
  writeFileSync(
    guard,
    [
      'import net from "node:net";',
      "net.Server.prototype.listen = function () {",
      '  throw new Error("a listening socket was opened");',
      "};",
      "",
    ].join("\n"),
  );
  try {
    const scaffold = spawnSync("sh", [`${EVALS}kind-observed-e2e/fixture.sh`], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${FIXTURES_BIN}${delimiter}${PLUGIN_BIN}${delimiter}${process.env.PATH}`,
        WIZARDINGCODE_HOME: home,
      },
    });
    expect(scaffold.status, scaffold.stderr).toBe(0);
    const run = spawnSync("node", ["--import", guard, "--test", "tests/e2e/health.test.mjs"], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(run.status, `${run.stdout}\n${run.stderr}`).toBe(0);
    expect(run.stdout).toContain("pass 1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}, 60_000);

test("CON7-AC-8", () => {
  // The invocation builder: no cap on the suite unless one is given, the given one passed, 5 on a case.
  const suite = evalInvocation(base).args;
  expect(suite).not.toContain("--max-cost-usd");
  const capped = evalInvocation({ ...base, maxCostUsd: 12 }).args;
  expect(capped[capped.indexOf("--max-cost-usd") + 1]).toBe("12");
  const one = evalInvocation({ ...base, caseName: "false-done" }).args;
  expect(one[one.indexOf("--max-cost-usd") + 1]).toBe("5");
  // The main: the estimate with its figure and source before the kit starts, the flag passed through,
  // a value that is not a positive number refused before the kit starts.
  const dir = mkdtempSync(join(tmpdir(), "eval-cap-"));
  const bin = stubKit(dir);
  const aggregate = join(dir, "clean.json");
  writeFileSync(aggregate, scanAggregate({ "false-done": [] }));
  const hadResults = existsSync(RESULTS);
  const before = listResults(RESULTS);
  try {
    const log = join(dir, "suite.log");
    const run = runEval(bin, [], { STUB_AGGREGATE: aggregate, STUB_EXIT: "0", STUB_LOG: log });
    expect(run.status, run.stderr).toBe(0);
    const estimate = run.stdout.match(/estimated cost: about 38\.80 USD \(([^)]*)\)/);
    expect(estimate?.[1] ?? "").toContain("SP7a");
    expect(run.stdout.indexOf("estimated cost:")).toBeLessThan(
      run.stdout.indexOf("claude plugin eval"),
    );
    expect(readFileSync(log, "utf8").split("\n")[1] ?? "").not.toContain("--max-cost-usd");
    const cappedLog = join(dir, "capped.log");
    const cappedRun = runEval(bin, ["--max-cost-usd", "12"], {
      STUB_AGGREGATE: aggregate,
      STUB_EXIT: "0",
      STUB_LOG: cappedLog,
    });
    expect(cappedRun.status, cappedRun.stderr).toBe(0);
    expect(readFileSync(cappedLog, "utf8").split("\n")[1] ?? "").toContain("--max-cost-usd 12");
    for (const value of ["0", "-3", "abc", ""]) {
      const refusedLog = join(dir, `refused-${value || "empty"}.log`);
      const folders = listResults(RESULTS);
      const refused = runEval(bin, ["--max-cost-usd", value], {
        STUB_AGGREGATE: aggregate,
        STUB_EXIT: "0",
        STUB_LOG: refusedLog,
      });
      expect(refused.status, value).not.toBe(0);
      expect(refused.stderr, value).toMatch(/--max-cost-usd/);
      expect(refused.stderr, value).toMatch(/positive number/);
      expect(existsSync(refusedLog), `${value}: the kit started`).toBe(false);
      expect(listResults(RESULTS), value).toEqual(folders);
    }
  } finally {
    for (const f of foldersSince(RESULTS, before))
      rmSync(join(RESULTS, f), { recursive: true, force: true });
    if (!hadResults) rmSync(RESULTS, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);
