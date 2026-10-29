import { expect, test } from "bun:test";
import { type SpawnSyncReturns, spawnSync } from "node:child_process";
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
import { basename, delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOW_TOOLS,
  armRuns,
  createRunFolder,
  deniedReferenceReads,
  evalInvocation,
  kitEnvironment,
  resultsDir,
  runFolder,
  runKit,
  SANDBOX_TAGS,
  scanResults,
} from "../../../scripts/eval.ts";
import { CEILINGS } from "../../../scripts/eval-overhead.ts";
import { scanText } from "../src/secrets.ts";
import type { KnowledgeEntry } from "../src/types.ts";
import { childEnv } from "./helpers.ts";
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
  expect(one.slice(one.indexOf("--allow-tools"))).toEqual(["--allow-tools", ...ALLOW_TOOLS]);
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
  // SP9 Task 10 (2026-10-27-005): the frontend team pack's pair.
  "pack-frontend-seats-the-team",
  "pack-frontend-absent",
  // SP9 Task 11 (2026-10-28-003): the nuxt stack pack's pair.
  "pack-nuxt-refines-the-gates",
  "pack-nuxt-absent",
  // SP9 Task 12 (2026-10-28-005): the next stack pack's pair.
  "pack-next-refines-the-gates",
  "pack-next-absent",
  // SP9 Task 13 (2026-10-28-006): the laravel pack's Blade pair (the dusk rule, the screen checklist).
  "pack-laravel-blade-tags-the-view",
  "pack-laravel-blade-tags-the-view-absent",
  // 2026-10-29-001 (AC-15, which superseded AC-10): the prose gate's measuring case.
  "prose-gate-refuses-chatbot-artefact",
  // 2026-10-29-001 (D-3, AC-18): the measuring cases of the writing standard and of the code-quality questions.
  "writing-standard-ending-without-tells",
  "code-quality-flags-unasked-dependency",
];
/** The pack pairs' cases, by their prefix (SP9 Task 11: derived, so a new pair edits no count). */
const PACK_CASES = CASES.filter((name) => name.startsWith("pack-"));
/** The pack each with case registers, by the case's name prefix (SP9 Task 11). */
const PACK_BY_PREFIX: Record<string, string> = {
  "pack-laravel": "wizardingcode-pack-laravel",
  "pack-agentic-os": "wizardingcode-pack-agentic-os",
  "pack-frontend": "wizardingcode-pack-frontend",
  "pack-nuxt": "wizardingcode-pack-nuxt",
  "pack-next": "wizardingcode-pack-next",
};
/** The with halves of the pack pairs, the cases that register a pack (SP9 Task 11): derived once for the two tests that read them. */
const WITH_CASES = PACK_CASES.filter((name) => !name.endsWith("-absent"));

test("SP2c, SP7b-T7 AC-1, SP3-T1 AC-5, SP3-T7 AC-1, SP4-T6 AC-1: the fifty-three cases each have their four parts, and the fixtures they share exist", () => {
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
  // Bash whole covers `cd`, `env` and `claude` (findings 64, 95).
  expect(args).toContain("--allow-tools Write Edit Bash");
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
/**
 * A gate of a profile as the detector writes it: command, source, then the pack's name or the close.
 * One builder per pack (SP9 Task 11, the judge's advisory at round 1): the matcher is a serialisation
 * shape, the same for every stack pack.
 */
const packGate =
  (packName: string) => (gate: string, command: string, source: string, pack: boolean) =>
    new RegExp(
      `"${gate}":\\s*\\{\\s*"command":\\s*"${escapeRegExp(command)}",\\s*"source":\\s*"${source}"${pack ? `,\\s*"pack":\\s*"${packName}"` : "\\s*\\}"}`,
    );
const LARAVEL_GATE = packGate(PACK_BY_PREFIX["pack-laravel"] as string);
/** A gate the core detected or proposed on its own: the same shape with no pack name (the absent halves); no flag, since none of its rows names a pack. */
const CORE_GATE = (gate: string, command: string, source: string) =>
  packGate("")(gate, command, source, false);
/** The nuxt profile's gates (SP9 Task 11), the same shape with the nuxt pack's name. */
const NUXT_GATE = packGate(PACK_BY_PREFIX["pack-nuxt"] as string);
/** The next profile's gates (SP9 Task 12), the same shape with the next pack's name. */
const NEXT_GATE = packGate(PACK_BY_PREFIX["pack-next"] as string);
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
      pattern: CORE_GATE("lint", "vendor/bin/pint --test", "detected"),
    },
    {
      file: ".crew/profile.json",
      pattern: CORE_GATE("typecheck", "vendor/bin/phpstan analyse --no-progress", "detected"),
    },
    { file: ".crew/profile.json", pattern: /^(?![\s\S]*"pack")(?![\s\S]*"laravel")[\s\S]*$/ },
    { file: "packs/wizardingcode-pack-laravel.json", home: true, absent: true },
  ],
  // SP9 Task 13 (2026-10-28-006): the laravel pack's Blade pair. The tree adds a Dusk test case, a
  // layout and a welcome view; the with half's profile carries the dusk rule's e2e gate proposed
  // with the pack beside the laravel rule's test gate and the two tags; the absent half neither.
  "pack-laravel-blade-tags-the-view": [
    // Finding 197: the person's standing grant of rounds past the cap, in both halves.
    { file: ".crew/policy.json", pattern: /"continuations":\s*"granted"/ },
    { file: "artisan", pattern: /role="alert"/ },
    { file: "tests/DuskTestCase.php", pattern: /Laravel\\Dusk\\TestCase/ },
    { file: "resources/views/welcome.blade.php", pattern: /<x-layouts\.app>/ },
    { file: "resources/views/components/alert.blade.php", absent: true },
    { file: "pack.json", absent: true },
    { file: ".packs/laravel/pack.json", pattern: /"stack":\s*"dusk"/ },
    { file: ".gitignore", pattern: /^\.packs\/$/m },
    {
      file: ".crew/profile.json",
      pattern: LARAVEL_GATE("test", "php artisan test", "proposed", true),
    },
    {
      file: ".crew/profile.json",
      pattern: LARAVEL_GATE("e2e", "php artisan dusk", "proposed", true),
    },
    { file: ".crew/profile.json", pattern: /"tags":\s*\[\s*"laravel"\s*,\s*"dusk"\s*\]/ },
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
  "pack-laravel-blade-tags-the-view-absent": [
    // Finding 197: the person's standing grant of rounds past the cap, in both halves.
    { file: ".crew/policy.json", pattern: /"continuations":\s*"granted"/ },
    { file: "artisan", pattern: /role="alert"/ },
    { file: "tests/DuskTestCase.php", pattern: /Laravel\\Dusk\\TestCase/ },
    { file: "resources/views/components/alert.blade.php", absent: true },
    { file: "pack.json", absent: true },
    {
      file: ".crew/profile.json",
      pattern: /^(?![\s\S]*"test":\s*\{)(?![\s\S]*"e2e":\s*\{)[\s\S]*"lint":/,
    },
    {
      file: ".crew/profile.json",
      pattern: /^(?![\s\S]*"pack")(?![\s\S]*"laravel")(?![\s\S]*"dusk")[\s\S]*$/,
    },
    { file: "packs/wizardingcode-pack-laravel.json", home: true, absent: true },
  ],
  // 2026-10-29-001 (AC-15): the planted line is in the working tree, uncommitted, above the function.
  "prose-gate-refuses-chatbot-artefact": [
    { file: "src/greet.mjs", pattern: /^\/\/ I hope this he[l]ps!/ },
    { committed: /^tests\/greet\.test\.mjs$/ },
  ],
  // 2026-10-29-001 (D-3, AC-18): the person's draft README, committed, with its unsourced claim and its scope limits.
  "writing-standard-ending-without-tells": [
    { file: "src/accounts.mjs", pattern: /export function listAccounts/ },
    {
      file: "README.md",
      pattern: /Studies show[\s\S]*Node 20 or later[\s\S]*not measured on Windows/,
    },
    { committed: /^README\.md$/ },
  ],
  // 2026-10-29-001 (D-3, AC-18): the person's uncommitted edits: a development dependency no criterion
  // needs and a debug line behind an environment flag, above a committed module.
  "code-quality-flags-unasked-dependency": [
    { file: "package.json", pattern: /"devDependencies":\s*\{\s*"nodemon":/ },
    { file: "src/names.mjs", pattern: /console\.log\(/ },
    { file: ".crew/policy.json", pattern: /"judgementGates":\s*\[\s*"code-quality"\s*\]/ },
    { committed: /^src\/names\.mjs$/ },
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
  // SP9 Task 10 (2026-10-27-005): the frontend pair on the Vue-shaped tree.
  "pack-frontend-seats-the-team": [
    { file: "components/Notice.vue", pattern: /<template>/ },
    { file: "tests/notice.test.mjs", pattern: /transition/ },
    { file: "pack.json", absent: true },
    {
      file: ".crew/policy.json",
      pattern:
        /"team":\s*\{\s*"template":\s*"frontend",\s*"specialists":\s*\["wizardingcode-pack-frontend:frontend",\s*"wizardingcode-pack-frontend:motion"\]\s*\}/,
    },
    {
      file: "packs/wizardingcode-pack-frontend.json",
      home: true,
      assert: (text: string, dir: string) => {
        const registration = JSON.parse(text) as { root: string; by: string };
        expect(realpathSync(registration.root)).toBe(realpathSync(join(dir, ".packs", "frontend")));
        expect(registration.by).toBe("command");
      },
    },
  ],
  "pack-frontend-absent": [
    { file: "components/Notice.vue", pattern: /<template>/ },
    { file: "pack.json", absent: true },
    { file: ".crew/policy.json", absent: true },
    { file: "packs/wizardingcode-pack-frontend.json", home: true, absent: true },
  ],
  // SP9 Task 11 (2026-10-28-003): the nuxt pair on the Nuxt-shaped tree: the faked packages committed
  // under node_modules/, no tsconfig.json, the with half's profile with the three gates proposed with the
  // pack and the tag, the absent half's with the core's build gate and nothing of the pack.
  "pack-nuxt-refines-the-gates": [
    { file: "nuxt.config.ts", pattern: /defineNuxtConfig/ },
    { file: "app/app.vue", pattern: /<template>/ },
    { file: "node_modules/vitest/vitest.mjs", pattern: /slugify/ },
    { file: "node_modules/eslint/bin/eslint.js", pattern: /process\.exit\(0\)/ },
    { file: "node_modules/nuxt/bin/nuxt.mjs", pattern: /typecheck/ },
    { file: "app/utils/slugify.ts", absent: true },
    { file: "tsconfig.json", absent: true },
    { file: "pack.json", absent: true },
    { file: ".packs/nuxt/pack.json", pattern: /"name":\s*"wizardingcode-pack-nuxt"/ },
    { file: ".gitignore", pattern: /^\.packs\/$/m },
    { file: ".crew/profile.json", pattern: NUXT_GATE("test", "npx vitest run", "proposed", true) },
    { file: ".crew/profile.json", pattern: NUXT_GATE("lint", "npx eslint .", "proposed", true) },
    {
      file: ".crew/profile.json",
      pattern: NUXT_GATE("typecheck", "npx nuxi typecheck", "proposed", true),
    },
    { file: ".crew/profile.json", pattern: /"tags":\s*\[\s*"nuxt"\s*\]/ },
    {
      file: "packs/wizardingcode-pack-nuxt.json",
      home: true,
      assert: (text: string, dir: string) => {
        const registration = JSON.parse(text) as { root: string; by: string };
        expect(realpathSync(registration.root)).toBe(realpathSync(join(dir, ".packs", "nuxt")));
        expect(registration.by).toBe("command");
      },
    },
  ],
  "pack-nuxt-absent": [
    { file: "nuxt.config.ts", pattern: /defineNuxtConfig/ },
    { file: "node_modules/vitest/vitest.mjs", pattern: /slugify/ },
    { file: "app/utils/slugify.ts", absent: true },
    { file: "tsconfig.json", absent: true },
    { file: "pack.json", absent: true },
    { file: ".crew/profile.json", pattern: /^(?![\s\S]*"test":\s*\{)[\s\S]*"build":/ },
    { file: ".crew/profile.json", pattern: CORE_GATE("build", "npm run build", "detected") },
    { file: ".crew/profile.json", pattern: /^(?![\s\S]*"pack")(?![\s\S]*"nuxt")[\s\S]*$/ },
    { file: "packs/wizardingcode-pack-nuxt.json", home: true, absent: true },
  ],
  // SP9 Task 12 (2026-10-28-005): the next pair on the Next-shaped tree: the faked packages committed
  // under node_modules/, no tsconfig.json (D-2), the with half's profile with the two gates proposed with
  // the pack and the tag, the absent half's with the core's detected build gate and nothing of the pack.
  "pack-next-refines-the-gates": [
    { file: "next.config.ts", pattern: /nextConfig/ },
    { file: "app/layout.tsx", pattern: /<html/ },
    { file: "app/page.tsx", pattern: /export default function/ },
    { file: "node_modules/vitest/vitest.mjs", pattern: /slugify/ },
    { file: "node_modules/eslint/bin/eslint.js", pattern: /process\.exit\(0\)/ },
    { file: "node_modules/next/dist/bin/next", pattern: /build/ },
    { file: "lib/slugify.ts", absent: true },
    { file: "tsconfig.json", absent: true },
    { file: "pack.json", absent: true },
    { file: ".packs/next/pack.json", pattern: /"name":\s*"wizardingcode-pack-next"/ },
    { file: ".gitignore", pattern: /^\.packs\/$/m },
    { file: ".crew/profile.json", pattern: NEXT_GATE("test", "npx vitest run", "proposed", true) },
    { file: ".crew/profile.json", pattern: NEXT_GATE("lint", "npx eslint .", "proposed", true) },
    { file: ".crew/profile.json", pattern: /^(?![\s\S]*"typecheck":\s*\{)[\s\S]*"build":/ },
    { file: ".crew/profile.json", pattern: /"tags":\s*\[\s*"next"\s*\]/ },
    {
      file: "packs/wizardingcode-pack-next.json",
      home: true,
      assert: (text: string, dir: string) => {
        const registration = JSON.parse(text) as { root: string; by: string };
        expect(realpathSync(registration.root)).toBe(realpathSync(join(dir, ".packs", "next")));
        expect(registration.by).toBe("command");
      },
    },
  ],
  "pack-next-absent": [
    { file: "next.config.ts", pattern: /nextConfig/ },
    { file: "node_modules/vitest/vitest.mjs", pattern: /slugify/ },
    { file: "lib/slugify.ts", absent: true },
    { file: "tsconfig.json", absent: true },
    { file: "pack.json", absent: true },
    { file: ".crew/profile.json", pattern: /^(?![\s\S]*"test":\s*\{)[\s\S]*"build":/ },
    { file: ".crew/profile.json", pattern: CORE_GATE("build", "npm run build", "detected") },
    { file: ".crew/profile.json", pattern: /^(?![\s\S]*"pack")(?![\s\S]*"next")[\s\S]*$/ },
    { file: "packs/wizardingcode-pack-next.json", home: true, absent: true },
  ],
});

test("2026-10-29-001 AC-18 (D-3): the two measuring cases are listed in the evals README with their graders", () => {
  const readme = readFileSync(`${EVALS}README.md`, "utf8");
  for (const name of [
    "writing-standard-ending-without-tells",
    "code-quality-flags-unasked-dependency",
  ]) {
    const line = readme.split("\n").find((l) => l.startsWith(`| \`${name}\` |`));
    expect(line, `${name}: no README row`).toBeDefined();
    for (const grader of readdirSync(`${EVALS}${name}/graders`).filter((g) => g.endsWith(".md")))
      expect(line, `${name}: ${grader}`).toContain(`\`${grader.replace(/\.md$/, "")}\``);
  }
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
            ...childEnv(),
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
    // SP9 Task 10 (2026-10-27-005) edits this list: the Vue-shaped fixture.
    `${EVALS}fixtures/node-vue.sh`,
    // SP9 Task 11 (2026-10-28-003) edits this list: the Nuxt-shaped fixture.
    `${EVALS}fixtures/nuxt-shaped.sh`,
    // SP9 Task 12 (2026-10-28-005) edits this list: the Next-shaped fixture.
    `${EVALS}fixtures/next-shaped.sh`,
    // SP9 Task 13 (2026-10-28-006) edits this list: the Laravel Blade-shaped fixture.
    `${EVALS}fixtures/laravel-blade-shaped.sh`,
    `${EVALS}fixtures/commit.sh`,
    ...CONFINED.map((name) => `${EVALS}${name}/fixture.sh`),
  ];
  // The one permitted parent path: sourcing a shared fixture beside the case, inside the evals tree.
  const sourcing = [
    '. "$(dirname "$0")/../fixtures/node-plain.sh"',
    '. "$(dirname "$0")/../fixtures/two-projects.sh"',
    '. "$(dirname "$0")/../fixtures/laravel-shaped.sh"',
    '. "$(dirname "$0")/../fixtures/node-agentic.sh"',
    // SP9 Task 10 (2026-10-27-005) edits this list: the Vue-shaped fixture.
    '. "$(dirname "$0")/../fixtures/node-vue.sh"',
    // SP9 Task 11 (2026-10-28-003) edits this list: the Nuxt-shaped fixture.
    '. "$(dirname "$0")/../fixtures/nuxt-shaped.sh"',
    // SP9 Task 12 (2026-10-28-005) edits this list: the Next-shaped fixture.
    '. "$(dirname "$0")/../fixtures/next-shaped.sh"',
    // SP9 Task 13 (2026-10-28-006) edits this list: the Laravel Blade-shaped fixture, which sources the laravel-shaped one.
    '. "$(dirname "$0")/../fixtures/laravel-blade-shaped.sh"',
    '. "$(dirname "$0")/../fixtures/commit.sh"',
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

test("SP8-T1 AC-5 (finding 96): the issue case's fixed grader anchors on the filter of active accounts, and the four SP3 fixtures commit through the shared helper, defined once in fixtures/commit.sh and sourced by every fixture that commits through it", () => {
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
  // The helper is defined once, in fixtures/commit.sh (O2); every fixture that commits through it
  // sources that file, node-plain.sh among them, and none defines its own.
  const evals = join(repoRoot, "plugins/core/evals");
  expect(readFileSync(join(evals, "fixtures/commit.sh"), "utf8")).toContain("fixture_commit() {");
  const sourcing = '. "$(dirname "$0")/../fixtures/commit.sh"';
  expect(readFileSync(join(evals, "fixtures/node-plain.sh"), "utf8")).toContain(sourcing);
  const fixtures = [
    ...readdirSync(join(evals, "fixtures"))
      .filter((f) => f.endsWith(".sh") && f !== "commit.sh")
      .map((f) => join(evals, "fixtures", f)),
    ...readdirSync(evals)
      .map((d) => join(evals, d, "fixture.sh"))
      .filter((f) => existsSync(f)),
  ];
  const defining = fixtures.filter((f) => readFileSync(f, "utf8").includes("fixture_commit() {"));
  expect(defining).toEqual([]);
  // A fixture that calls the helper has it from commit.sh, sourced by itself or by a shared fixture it sources.
  const hasHelper = (file: string): boolean => {
    const text = readFileSync(file, "utf8");
    if (text.includes(sourcing)) return true;
    return [...text.matchAll(/\/\.\.\/fixtures\/([\w-]+\.sh)"/g)].some(
      (m) => m[1] !== "commit.sh" && hasHelper(join(evals, "fixtures", m[1] ?? "")),
    );
  };
  for (const file of fixtures) {
    const calls = readFileSync(file, "utf8")
      .split("\n")
      .some((line) => /^\s*fixture_commit /.test(line));
    if (calls) expect(hasHelper(file), file).toBe(true);
  }
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
    env: { ...childEnv(), ...env, PATH: path },
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
  // reject in the metadata alone, no is_error, the path from the error text alone (no tool_use line).
  expect(
    deniedReferenceReads([
      toolResult("toolu_g", `Permission to read ${reference("plan.md")} has been denied.`, {
        decision: "reject",
      }),
    ]),
  ).toEqual(["skills/crew/references/plan.md"]);
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
    const run = runEval(bin, ["--case", name], { WIZARDINGCODE_STUB_EXIT: "0" });
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
      WIZARDINGCODE_STUB_AGGREGATE: flagged,
      WIZARDINGCODE_STUB_EXIT: "1",
      WIZARDINGCODE_STUB_LOG: log,
      WIZARDINGCODE_STUB_DECOY: decoy,
      WIZARDINGCODE_STUB_DECOY_AGGREGATE: decoyAggregate,
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
      WIZARDINGCODE_STUB_AGGREGATE: clean,
      WIZARDINGCODE_STUB_EXIT: "0",
      WIZARDINGCODE_STUB_LOG: log,
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
        WIZARDINGCODE_STUB_AGGREGATE: join(dir, "missing.json"),
        WIZARDINGCODE_STUB_EXIT: "0",
        WIZARDINGCODE_STUB_LOG: log,
        WIZARDINGCODE_STUB_DECOY: newer,
        WIZARDINGCODE_STUB_DECOY_AGGREGATE: decoyAggregate,
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
    const good = runEval(
      bin,
      [],
      { WIZARDINGCODE_STUB_AGGREGATE: flagged, WIZARDINGCODE_STUB_EXIT: "0" },
      dir,
    );
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
  // SP9 Task 13 (2026-10-28-006): the Blade pair's graders. The with half's profile-tags pattern
  // is whitespace-tolerant and ordered (the QA lead's R-1 at the spec); ui-ux-not-run reuses
  // judgement-gate-not-run's pattern over the engine's wording.
  "pack-laravel-blade-tags-the-view": {
    "pack-e2e-gate": {
      type: "regex",
      target: "trace",
      pattern: "e2e=php artisan dusk( \\[proposed\\])? \\(pack wizardingcode-pack-laravel\\)",
      arm: "with-only",
    },
    "profile-tags": {
      type: "regex",
      target: "{ source: file, path: .crew/profile.json }",
      pattern: '"tags":\\s*\\[\\s*"laravel"\\s*,\\s*"dusk"\\s*\\]',
      arm: "with-only",
    },
    "screen-checklist": {
      type: "regex",
      target: "trace",
      pattern: "\\.packs/laravel/checklists/screen\\.md",
      arm: "with-only",
    },
    "knowledge-path": {
      type: "regex",
      target: "trace",
      pattern: "knowledge/laravel\\.md",
      arm: "with-only",
    },
    "ui-ux-not-run": {
      type: "regex",
      target: "trace",
      pattern: "record ui-ux --not-run|ui-ux: not run|judgement gate ui-ux not run",
      arm: "with-only",
    },
    "component-added": {
      type: "regex",
      target: "{ source: file, path: resources/views/components/alert.blade.php }",
      pattern: 'role="alert"',
      arm: "both",
    },
    "honest-ending": { type: "llm" },
  },
  "pack-laravel-blade-tags-the-view-absent": {
    "no-pack-e2e": {
      type: "regex",
      target: "trace",
      pattern: "\\(pack wizardingcode-pack-laravel\\)",
      match: "not_contains",
      arm: "with-only",
    },
    "no-dusk-tag": {
      type: "regex",
      target: "{ source: file, path: .crew/profile.json }",
      pattern: '"dusk"',
      match: "not_contains",
      arm: "with-only",
    },
    "no-screen-checklist": {
      type: "regex",
      target: "trace",
      pattern: "\\.packs/laravel/checklists/screen\\.md",
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
    "component-added": {
      type: "regex",
      target: "{ source: file, path: resources/views/components/alert.blade.php }",
      pattern: 'role="alert"',
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
  // SP9 Task 10 (2026-10-27-005): the frontend pair's graders (the reduced-motion one on both arms, D-1).
  "pack-frontend-seats-the-team": {
    // The seat in either form the engine prints it: the report's Team row (crew evidence) or the
    // team line crew gate run prints before the judgement gates (AC-8), the form crew team prints;
    // a frontend item ends not proven in the sandbox (no browser), so the report is never printed.
    seat: {
      type: "regex",
      target: "trace",
      pattern:
        "(\\| expert \\| frontend \\| pack wizardingcode-pack-frontend \\(components/\\*\\*\\) \\||expert \\(pack wizardingcode-pack-frontend \\(components/\\*\\*\\)\\))",
      arm: "with-only",
    },
    "knowledge-path": {
      type: "regex",
      target: "trace",
      pattern: "knowledge/frontend\\.md",
      arm: "with-only",
    },
    "motion-knowledge-path": {
      type: "regex",
      target: "trace",
      pattern: "knowledge/motion\\.md",
      arm: "with-only",
    },
    "transition-added": {
      type: "regex",
      target: "{ source: file, path: components/Notice.vue }",
      pattern: "transition",
      arm: "both",
    },
    "reduced-motion": {
      type: "regex",
      target: "{ source: file, path: components/Notice.vue }",
      pattern: "prefers-reduced-motion",
      arm: "both",
    },
    "no-transition-all": {
      type: "regex",
      target: "{ source: file, path: components/Notice.vue }",
      pattern: "transition:\\s*all",
      match: "not_contains",
      arm: "both",
    },
    "honest-ending": { type: "llm" },
  },
  "pack-frontend-absent": {
    "no-seat": {
      type: "regex",
      target: "trace",
      pattern: "pack wizardingcode-pack-frontend",
      match: "not_contains",
      arm: "with-only",
    },
    "no-knowledge-path": {
      type: "regex",
      target: "trace",
      pattern: "knowledge/frontend\\.md",
      match: "not_contains",
      arm: "with-only",
    },
    "transition-added": {
      type: "regex",
      target: "{ source: file, path: components/Notice.vue }",
      pattern: "transition",
      arm: "both",
    },
    "honest-ending": { type: "llm" },
  },
  // SP9 Task 12 (2026-10-28-005): the next pair's graders, the nuxt pair's shape with the util under lib/
  // (the relayed test command confirmed in the profile is the with half's proof of D-1).
  "pack-next-refines-the-gates": {
    "pack-gate": {
      type: "regex",
      target: "trace",
      pattern:
        "test=npx vitest run( \\[proposed\\])? \\(pack wizardingcode-pack-next\\)|pack wizardingcode-pack-next's command is not confirmed",
      arm: "with-only",
    },
    "gate-ran": {
      type: "regex",
      target: "trace",
      pattern: "test \\(\\.\\): pass",
      arm: "with-only",
    },
    "profile-tag": {
      type: "regex",
      target: "{ source: file, path: .crew/profile.json }",
      pattern: '"tags":\\s*\\[\\s*"next"\\s*\\]',
      arm: "with-only",
    },
    "profile-set": {
      type: "regex",
      target: "{ source: file, path: .crew/profile.json }",
      pattern:
        '"command":\\s*"node node_modules/vitest/vitest\\.mjs run",\\s*"source":\\s*"confirmed"',
      arm: "with-only",
    },
    "knowledge-path": {
      type: "regex",
      target: "trace",
      pattern: "knowledge/next\\.md",
      arm: "with-only",
    },
    "util-added": {
      type: "regex",
      target: "{ source: file, path: lib/slugify.ts }",
      pattern: "export (function|const) slugify",
      arm: "both",
    },
    "honest-ending": { type: "llm" },
  },
  "pack-next-absent": {
    "no-pack-gate": {
      type: "regex",
      target: "trace",
      pattern: "\\(pack wizardingcode-pack-next\\)",
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
    "no-next-tag": {
      type: "regex",
      target: "{ source: file, path: .crew/profile.json }",
      pattern: '"next"',
      match: "not_contains",
      arm: "with-only",
    },
    "no-knowledge-path": {
      type: "regex",
      target: "trace",
      pattern: "knowledge/next\\.md",
      match: "not_contains",
      arm: "with-only",
    },
    "util-added": {
      type: "regex",
      target: "{ source: file, path: lib/slugify.ts }",
      pattern: "export (function|const) slugify",
      arm: "both",
    },
    "honest-ending": { type: "llm" },
  },
  // SP9 Task 11 (2026-10-28-003): the nuxt pair's graders (the util on both arms; the relayed test command
  // confirmed in the profile is the with half's proof of D-2).
  "pack-nuxt-refines-the-gates": {
    "pack-gate": {
      type: "regex",
      target: "trace",
      pattern:
        "test=npx vitest run( \\[proposed\\])? \\(pack wizardingcode-pack-nuxt\\)|pack wizardingcode-pack-nuxt's command is not confirmed",
      arm: "with-only",
    },
    "gate-ran": {
      type: "regex",
      target: "trace",
      pattern: "test \\(\\.\\): pass",
      arm: "with-only",
    },
    "profile-tag": {
      type: "regex",
      target: "{ source: file, path: .crew/profile.json }",
      pattern: '"tags":\\s*\\[\\s*"nuxt"\\s*\\]',
      arm: "with-only",
    },
    "profile-set": {
      type: "regex",
      target: "{ source: file, path: .crew/profile.json }",
      pattern:
        '"command":\\s*"node node_modules/vitest/vitest\\.mjs run",\\s*"source":\\s*"confirmed"',
      arm: "with-only",
    },
    "knowledge-path": {
      type: "regex",
      target: "trace",
      pattern: "knowledge/nuxt\\.md",
      arm: "with-only",
    },
    "util-added": {
      type: "regex",
      target: "{ source: file, path: app/utils/slugify.ts }",
      pattern: "export (function|const) slugify",
      arm: "both",
    },
    "honest-ending": { type: "llm" },
  },
  "pack-nuxt-absent": {
    "no-pack-gate": {
      type: "regex",
      target: "trace",
      pattern: "\\(pack wizardingcode-pack-nuxt\\)",
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
    "no-nuxt-tag": {
      type: "regex",
      target: "{ source: file, path: .crew/profile.json }",
      pattern: '"nuxt"',
      match: "not_contains",
      arm: "with-only",
    },
    "no-knowledge-path": {
      type: "regex",
      target: "trace",
      pattern: "knowledge/nuxt\\.md",
      match: "not_contains",
      arm: "with-only",
    },
    "util-added": {
      type: "regex",
      target: "{ source: file, path: app/utils/slugify.ts }",
      pattern: "export (function|const) slugify",
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

test("SP6-T6 AC-1: the eight pack cases carry the tag packs, SANDBOX_TAGS holds it, the invocation carries the repository root as WIZARDINGCODE_CREW_REPO and nothing else, and the README's command line shows the PATH", () => {
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
  // H118: both mains run the kit through runKit, the one spawn, which passes the invocation's
  // environment beside PATH (the row "SP6-T6 AC-11 (runKit)" runs it against the stub kit).
  const evalSource = readFileSync(join(repoRoot, "scripts/eval.ts"), "utf8");
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

test("SP6-T6 AC-11 (runKit): the kit runs with the allowlist's names of the caller's environment (finding 64), the invocation's WIZARDINGCODE_CREW_REPO beside it and the composed PATH, the fixtures' bin first", () => {
  const dir = mkdtempSync(join(tmpdir(), "eval-env-"));
  const bin = stubKit(dir);
  const aggregate = join(dir, "clean.json");
  writeFileSync(aggregate, scanAggregate({ "false-done": [] }));
  const hadResults = existsSync(RESULTS);
  const before = listResults(RESULTS);
  try {
    const dump = join(dir, "kit.env");
    const run = runEval(bin, ["--case", "false-done"], {
      WIZARDINGCODE_STUB_AGGREGATE: aggregate,
      WIZARDINGCODE_STUB_EXIT: "0",
      WIZARDINGCODE_STUB_ENV: dump,
      WIZARDINGCODE_STUB_MARK: "the caller's own variable",
      CALLER_MARK: "a name the allowlist does not hold",
    });
    expect(run.status, run.stderr).toBe(0);
    const seen = new Map(
      readFileSync(dump, "utf8")
        .split("\n")
        .filter((line) => line.includes("="))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
    expect(seen.get("WIZARDINGCODE_STUB_MARK")).toBe("the caller's own variable");
    // The allowlist alone reaches the kit (finding 64): a caller's other name is dropped.
    expect(seen.has("CALLER_MARK")).toBe(false);
    expect(seen.get("WIZARDINGCODE_CREW_REPO")).toBe(repoRoot);
    const path = (seen.get("PATH") ?? "").split(delimiter);
    expect(path[0]).toBe(join(repoRoot, "plugins/core/evals/fixtures/bin"));
    expect(path[1]).toBe(join(repoRoot, "plugins/core/bin"));
    expect(path).toContain(bin);
  } finally {
    for (const f of foldersSince(RESULTS, before))
      rmSync(join(RESULTS, f), { recursive: true, force: true });
    if (!hadResults) rmSync(RESULTS, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test("SP6-T6 AC-12: the pack fixtures stay confined: set -eu, the variable alone as the pack's path, a loud refusal without it, crew pack add before crew detect, no copy of a pack, no gate confirmed or set by hand; a with fixture given an empty folder exits non-zero and leaves no commit", () => {
  // SP9 Task 11 (2026-10-28-003): the with cases derived (WITH_CASES), no list edited per pair.
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
        // SP9 Task 10 (2026-10-27-005), Task 11 (2026-10-28-003) and Task 12 (2026-10-28-005) edit this regex: the frontend, nuxt and next packs' copies.
        /^cp -R "\$REPO\/packs\/(laravel|agentic-os|frontend|nuxt|next)" \.packs\/(laravel|agentic-os|frontend|nuxt|next)$|pack\.json|^# /,
      );
    for (const line of text.split("\n").filter((l) => l.includes("crew pack add")))
      expect(line.trim(), name).toMatch(
        /^crew pack add \.packs\/(laravel|agentic-os|frontend|nuxt|next)( > \/dev\/null)?$/,
      );
    if (WITH_CASES.includes(name)) {
      expect(text, name).toMatch(/WIZARDINGCODE_CREW_REPO[^\n]*pack\.json is missing/);
      expect(text.indexOf("crew pack add"), name).toBeLessThan(text.indexOf("crew detect"));
    } else expect(text, name).not.toContain("crew pack add");
  }
  for (const shared of ["laravel-shaped.sh", "node-agentic.sh"])
    expect(readFileSync(`${EVALS}fixtures/${shared}`, "utf8")).toContain("set -eu");
  for (const name of WITH_CASES) {
    const dir = mkdtempSync(join(tmpdir(), `crew-eval-empty-${name}-`));
    const home = mkdtempSync(join(tmpdir(), "crew-evals-home-"));
    const empty = mkdtempSync(join(tmpdir(), "no-packs-"));
    try {
      const run = spawnSync("sh", [`${EVALS}${name}/fixture.sh`], {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...childEnv(),
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
    ...childEnv(),
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
  // SP9 Task 10 (2026-10-27-005): a frontend item ends not proven in the sandbox (no browser), so the
  // session never reaches the delivery that prints the report's Team table; the user asks for the team
  // at the end, in both halves of the pair, and the seat grader reads what crew team or the report prints.
  for (const name of ["pack-frontend-seats-the-team", "pack-frontend-absent"]) {
    const text = readFileSync(`${EVALS}${name}/prompt.md`, "utf8");
    expect(text, name).toContain(
      "tell me who sat on the item's team and why each seat was planned",
    );
  }
  expect(readFileSync(`${EVALS}pack-frontend-seats-the-team/prompt.md`, "utf8")).toBe(
    readFileSync(`${EVALS}pack-frontend-absent/prompt.md`, "utf8"),
  );
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
    ...childEnv(),
    PATH: `${FIXTURES_BIN}${delimiter}${PLUGIN_BIN}${delimiter}${process.env.PATH}`,
  };
  delete (env as Record<string, string | undefined>).WIZARDINGCODE_CREW_REPO;
  const helper = spawnSync("wizardingcode-crew-repo", [], { encoding: "utf8", env });
  expect(helper.status, helper.stderr).toBe(0);
  expect(realpathSync(helper.stdout.trim())).toBe(realpathSync(repoRoot));
  // SP9 Task 11 (2026-10-28-003): the with cases derived (WITH_CASES), no list edited per pair.
  for (const name of WITH_CASES) {
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
      // SP9 Task 10 and Task 11 (2026-10-28-003) edit this lookup: the pack a with case registers, by the case's prefix (PACK_BY_PREFIX).
      const pack = Object.entries(PACK_BY_PREFIX).find(([prefix]) => name.startsWith(prefix))?.[1];
      expect(pack, name).toBeDefined();
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
    ...childEnv(),
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

test("CON7-AC-4-validators (finding 65): team-by-route's validators-exist grader reads src/validation.mjs and passes both validators in either order, never one alone", () => {
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

/** The text a fixture writes to a file through `cat > <path> <<'EOF'`, as the scaffold holds it. */
const scaffolded = (caseName: string, path: string): string => {
  const fixture = readFileSync(`${EVALS}${caseName}/fixture.sh`, "utf8");
  const start = fixture.indexOf(`cat > ${path} <<'EOF'\n`);
  if (start < 0) throw new Error(`${caseName}: the fixture writes no ${path}`);
  const body = fixture.slice(start + `cat > ${path} <<'EOF'\n`.length);
  return body.slice(0, body.indexOf("\nEOF\n") + 1);
};

test("CON7-AC-4-norole (finding 65): the overhead cases' no-role-launched grader passes a trace with no plugin role and fails one that launched the judge, paired with a fixed grader that fails the committed code and passes the solved one", () => {
  // The fixed grader's body: the committed src/math.mjs fails it, the request's change passes it.
  const solved: Record<string, (committed: string) => string> = {
    "fast-route-overhead": (committed) =>
      `${committed}\nexport function multiply(a, b) {\n  return a * b;\n}\n`,
    "issue-fast-overhead": (committed) => committed.replace("return a - b", "return a + b"),
  };
  for (const [name, solve] of Object.entries(solved)) {
    const committed = scaffolded(name, "src/math.mjs");
    expect(committed, name).toContain("export function add(a, b) {");
    const fixedPattern = graderPattern(name, "fixed");
    expect(committed, name).not.toMatch(fixedPattern);
    expect(solve(committed), name).not.toBe(committed);
    expect(solve(committed), name).toMatch(fixedPattern);
  }
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

test("CON7-AC-4-ruling (finding 65): rounds-bounded's ruling-recorded grader passes the ruling recorded by a Bash call, never the agent's prose naming the command", () => {
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

test("CON7-AC-4-register (finding 65): decision-register-reread's register-read grader passes crew decisions run, with or without a cd prefix, never the references' text or the agent's prose", () => {
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

test("CON7-AC-4-cap (finding 65): rounds-bounded's cap-refused grader, a trace regex beside the llm grader, passes the engine's refusal of a second round and never the agent quoting it", () => {
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

test("CON7-AC-5 (finding 37): the kind-observed-e2e fixture opens no socket, and its e2e test passes in process with every listen made to throw", () => {
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
        ...childEnv(),
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

test("CON7-AC-8 (finding 63): the runner caps a case at 5 USD and the suite at nothing unless given, prints the estimate before the kit starts, passes the cap through and refuses one that is not a positive number", () => {
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
    const run = runEval(bin, [], {
      WIZARDINGCODE_STUB_AGGREGATE: aggregate,
      WIZARDINGCODE_STUB_EXIT: "0",
      WIZARDINGCODE_STUB_LOG: log,
    });
    expect(run.status, run.stderr).toBe(0);
    const estimate = run.stdout.match(/estimated cost: about 38\.80 USD \(([^)]*)\)/);
    expect(estimate?.[1] ?? "").toContain("SP7a");
    expect(run.stdout.indexOf("estimated cost:")).toBeLessThan(
      run.stdout.indexOf("claude plugin eval"),
    );
    expect(readFileSync(log, "utf8").split("\n")[1] ?? "").not.toContain("--max-cost-usd");
    const cappedLog = join(dir, "capped.log");
    const cappedRun = runEval(bin, ["--max-cost-usd", "12"], {
      WIZARDINGCODE_STUB_AGGREGATE: aggregate,
      WIZARDINGCODE_STUB_EXIT: "0",
      WIZARDINGCODE_STUB_LOG: cappedLog,
    });
    expect(cappedRun.status, cappedRun.stderr).toBe(0);
    expect(readFileSync(cappedLog, "utf8").split("\n")[1] ?? "").toContain("--max-cost-usd 12");
    for (const value of ["0", "-3", "abc", ""]) {
      const refusedLog = join(dir, `refused-${value || "empty"}.log`);
      const folders = listResults(RESULTS);
      const refused = runEval(bin, ["--max-cost-usd", value], {
        WIZARDINGCODE_STUB_AGGREGATE: aggregate,
        WIZARDINGCODE_STUB_EXIT: "0",
        WIZARDINGCODE_STUB_LOG: refusedLog,
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

test("REL-AC-2 (the user's decision of 2026-10-23): the judge model is the suite's own unless one is given, for a case and for the suite alike", () => {
  const judges = (args: string[]) => args.filter((_, i) => args[i - 1] === "--judge-model");
  expect(judges(evalInvocation({ ...base, caseName: "false-done" }).args)).toEqual([
    "claude-fable-5-1",
  ]);
  expect(judges(evalInvocation(base).args)).toEqual(["claude-fable-5-1"]);
  const opus = { ...base, judgeModel: "claude-opus-5-5" };
  expect(judges(evalInvocation({ ...opus, caseName: "false-done" }).args)).toEqual([
    "claude-opus-5-5",
  ]);
  expect(judges(evalInvocation(opus).args)).toEqual(["claude-opus-5-5"]);
  const refused = spawnSync("bun", ["scripts/eval.ts", "--judge-model", "x y"], {
    cwd: join(import.meta.dir, "../../.."),
    encoding: "utf8",
  });
  expect(refused.status).toBe(1);
  expect(refused.stderr).toContain('eval: --judge-model takes a model name, not "x y"');
});

test("AC-10 (finding 62): personalities-differ's proposals-differ grader passes on designs proposed or named as rejected alternatives, never on proposals alone", () => {
  const grader = readFileSync(`${EVALS}personalities-differ/graders/proposals-differ.md`, "utf8");
  expect(grader).toContain("rejected alternative");
  expect(grader).toMatch(
    /at least two distinct storage designs[^\n]*proposed by the experts or named as a rejected alternative with its reason/,
  );
  expect(grader).toMatch(/which the judge closed on/);
  expect(grader).not.toMatch(
    /at least two distinct storage designs for the plan and its history, or one design argued for opposite reasons/,
  );
});

test("AC-12 (finding 118): the agent's own words count as a denial only where one sentence names both the denial and the reference", () => {
  const ref = "skills/crew/references/plan.md";
  expect(deniedReferenceReads([agentText(`I was denied a read of ${ref}.`)])).toEqual([ref]);
  // A denial and the reference in two sentences, or across a line break: nothing
  expect(
    deniedReferenceReads([agentText(`Permission denied. I then read ${ref} without trouble.`)]),
  ).toEqual([]);
  expect(
    deniedReferenceReads([agentText(`The permission was denied\n${ref} is the plan reference`)]),
  ).toEqual([]);
  // A reference named with no denial word, and a denial with no reference: nothing
  expect(deniedReferenceReads([agentText(`I read ${ref} and followed it.`)])).toEqual([]);
  expect(deniedReferenceReads([agentText("A Bash call was denied by the sandbox.")])).toEqual([]);
  // A metadata rejection whose tool input names no reference, the path in the error text alone
  expect(
    deniedReferenceReads([
      toolUse("toolu_9", "Bash", { command: "cat the-plan" }),
      toolResult("toolu_9", `cannot open ${ref}`, { decision: "reject" }),
    ]),
  ).toEqual([ref]);
});

test("AC-14 (was AC-13; findings 64, 95): the kit's session gets Bash whole, Write and Edit, and only the environment names of the allowlist", () => {
  expect(ALLOW_TOOLS).toEqual(["Write", "Edit", "Bash"]);
  const args = evalInvocation({ root: "/r", platform: "linux", path: "", realGitDir: null }).args;
  expect(args.slice(args.indexOf("--allow-tools") + 1)).toEqual(["Write", "Edit", "Bash"]);
  const kept = {
    ANTHROPIC_API_KEY: "k",
    CLAUDE_CONFIG_DIR: "/c",
    PATH: "/bin",
    LC_ALL: "C",
    HOME: "/h",
    TMPDIR: "/t",
    WIZARDINGCODE_CREW_REPO: "/r",
  };
  const dropped = {
    SSH_AUTH_SOCK: "/s",
    GH_TOKEN: "g",
    AWS_PROFILE: "p",
    DB_PASSWORD: "d",
    KUBECONFIG: "/k",
    DOCKER_AUTH_CONFIG: "{}",
    NPM_CONFIG_TOKEN: "n",
    RANDOM_NEW_NAME: "x",
    CLAUDE_CODE_MESSAGING_TOKEN: "m",
    WIZARDINGCODE_SECRET: "w",
  };
  expect(kitEnvironment({ ...kept, ...dropped })).toEqual(kept);
  // The grant lives in scripts/eval.ts alone; the bundle's `Bash(crew *)` is the opened sessions'
  // grant (open.ts), not the eval's; the kit's ignored results are no file of the repository. grep
  // says 1 for no match; 2, an error, is never an absence.
  const grep = (pattern: string, ...exclude: string[]) =>
    spawnSync(
      "grep",
      ["-rlE", ...exclude.map((e) => `--exclude=${e}`), "-e", pattern, "plugins", ".claude"],
      {
        cwd: repoRoot,
        encoding: "utf8",
      },
    );
  const flag = grep("--allow-tools");
  expect(flag.status, `${flag.stdout}${flag.stderr}`).toBe(1);
  const narrow = grep("Bash\\(crew", "crew.mjs");
  expect(narrow.status, `${narrow.stdout}${narrow.stderr}`).toBe(1);
  expect(readFileSync(join(repoRoot, "plugins/core/dist/crew.mjs"), "utf8")).not.toContain(
    "--allow-tools",
  );
});

test("AC-17 (finding 157): a denied reference read covered by an accepted Read of the same file, or a denied references folder covered by an accepted Read of any file in it, is no lost read; one never covered still flags", () => {
  // The run of 2026-10-24: a listing of the installed plugin's references denied, then the plugin
  // under test's own references read.
  const listing = [
    toolUse("toolu_l", "Bash", {
      command: "cd ~/.claude/plugins/cache/x/0.13.0/ && ls skills/crew/references",
    }),
    toolResult("toolu_l", "ls: skills/crew/references: Operation not permitted", { isError: true }),
  ];
  expect(deniedReferenceReads([...listing, ...acceptedRead("toolu_r", "conclave.md")])).toEqual([]);
  // The same file denied, then read: covered; read before the denial: covered too.
  const file = deniedRead("toolu_d", "specify.md");
  expect(deniedReferenceReads([...file, ...acceptedRead("toolu_s", "specify.md")])).toEqual([]);
  expect(deniedReferenceReads([...acceptedRead("toolu_s", "specify.md"), ...file])).toEqual([]);
  // Another file read covers neither a denied file nor, alone, anything else.
  expect(deniedReferenceReads([...file, ...acceptedRead("toolu_o", "plan.md")])).toEqual([
    "skills/crew/references/specify.md",
  ]);
  expect(deniedReferenceReads(listing)).toEqual(["skills/crew/references"]);
});

test("AC-22 (findings 155, 156, 159): learn.md gives the CTO review's order; figures-quoted judges the plan file with the fixture's figures; briefs-say-changed matches a brief the Read tool showed and refuses another file", () => {
  const learn = readFileSync(
    join(repoRoot, "plugins/core/skills/crew/references/learn.md"),
    "utf8",
  );
  const section = learn.slice(learn.indexOf("## 4. The CTO review"));
  expect(section).toStartWith("## 4. The CTO review");
  expect(section).toContain('--observed "<the plan filed>"` before anything else');
  expect(section).toContain("A behaviour criterion cannot be superseded by an observed one");
  expect(section.indexOf("--observed")).toBeLessThan(
    section.indexOf("crew cto review --workspace"),
  );
  const figures = readFileSync(
    join(EVALS, "cto-report-from-records/graders/figures-quoted.md"),
    "utf8",
  );
  // The judge reads the plan file: an llm judge of the trace sees only its first and last 12
  // messages (the kit's documentation), where neither the engine's figures nor the plan sit.
  expect(figures).toMatch(/^focus: \{ source: file, path: cto-plan\.md \}$/m);
  expect(figures).not.toContain("focus: trace");
  expect(figures).toContain(
    "items 3 when the review item is opened after the review, 4 when it is opened first",
  );
  expect(figures).toContain(
    "knowledge 4 entries (stack-preference 1, validated-solution 3), confirmed 1, contradicted 1, cited by 1 item",
  );
  expect(readFileSync(join(EVALS, "cto-report-from-records/prompt.md"), "utf8")).toContain(
    "written to `cto-plan.md` in this project",
  );
  const grader = readFileSync(join(EVALS, "brief-per-todo/graders/briefs-say-changed.md"), "utf8");
  const pattern = new RegExp(/^pattern: '(.*)'$/m.exec(grader)?.[1] ?? "^$");
  // As the Read tool shows a brief in a JSON trace (escaped newline, the line number, an escaped tab),
  // as the kit may decode it, and as the brief itself is written.
  expect(
    pattern.test(String.raw`"3\t## Changed\n4\t- src/accounts.mjs\n5\t- tests/a.test.mjs"`),
  ).toBe(true);
  expect(pattern.test("3\t## Changed\n4\t- src/accounts.mjs")).toBe(true);
  expect(pattern.test("## Changed\n- src/accounts.mjs")).toBe(true);
  expect(pattern.test(String.raw`"3\t## Changed\n4\t- src/other.mjs"`)).toBe(false);
});

test("AC-23 (findings 149, 62): rounds-bounded's fixture leaves round 1 recorded not proven under a cap of one, with no audit seed left; personalities-differ runs under the unattended user's policy and proposals-differ judges the final message", () => {
  const dir = mkdtempSync(join(tmpdir(), "crew-rounds-"));
  const home = mkdtempSync(join(tmpdir(), "crew-rounds-home-"));
  const scaffold = spawnSync("sh", [`${EVALS}rounds-bounded/fixture.sh`], {
    cwd: dir,
    encoding: "utf8",
    env: {
      ...childEnv(),
      PATH: [join(repoRoot, "plugins/core/bin"), process.env.PATH ?? ""].join(delimiter),
      WIZARDINGCODE_HOME: home,
    },
  });
  expect(scaffold.status, scaffold.stderr).toBe(0);
  const [id] = readdirSync(join(dir, ".crew/work"));
  const work = JSON.parse(readFileSync(join(dir, ".crew/work", id ?? "", "work.json"), "utf8"));
  expect(work.rounds.judgement).toBe(1);
  const policy = JSON.parse(readFileSync(join(dir, ".crew/policy.json"), "utf8"));
  expect(policy.team.maxJudgementRounds).toBe(1);
  const evidence = JSON.parse(
    readFileSync(join(dir, ".crew/work", id ?? "", "evidence.json"), "utf8"),
  );
  const verdicts = Object.fromEntries(
    (evidence.judgement as { gate: string; verdict: string }[]).map((j) => [j.gate, j.verdict]),
  );
  expect(verdicts["code-quality"]).toBe("not-proven");
  expect(verdicts.security).toBe("not-proven");
  // Everything committed: the session starts from a clean tree with the defect in the code.
  expect(spawnSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" }).stdout).toBe(
    "",
  );
  expect(readFileSync(join(dir, "src/accounts.mjs"), "utf8")).toContain(
    "console.log(`deactivating ${account.email}`)",
  );
  // The audit seed is gone from the shared fixture and from every case.
  expect(readFileSync(`${EVALS}fixtures/node-plain.sh`, "utf8")).not.toContain("AUDIT_HOOK");
  for (const name of readdirSync(EVALS)) {
    const file = join(EVALS, name, "fixture.sh");
    if (existsSync(file)) expect(readFileSync(file, "utf8"), name).not.toContain("AUDIT_HOOK");
  }
  const differ = graderOf("personalities-differ", "proposals-differ") as Record<string, unknown>;
  expect(differ.focus).toBeUndefined();
  expect(readFileSync(`${EVALS}personalities-differ/fixture.sh`, "utf8")).toContain(
    '{ "unattendedDecisions": "count" }',
  );
});

test("2026-10-25-005 AC-2: the kit's environment admits the provider's names and the credentials it needs, drops the other secrets, and the kit's model is an option", () => {
  const kept = {
    PATH: "/bin",
    HOME: "/h",
    ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
    ANTHROPIC_AUTH_TOKEN: "t",
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "anthropic/claude-sonnet-5.5",
    CLAUDE_CODE_SUBAGENT_MODEL: "anthropic/claude-sonnet-5.5",
    CLAUDE_CODE_OAUTH_TOKEN: "o",
  };
  const dropped = {
    CLAUDE_CODE_MESSAGING_TOKEN: "m",
    GITHUB_TOKEN: "g",
    GH_TOKEN: "g",
    OPENROUTER_API_KEY: "k",
  };
  expect(kitEnvironment({ ...kept, ...dropped })).toEqual(kept);
  const withModel = evalInvocation({ ...base, model: "anthropic/claude-sonnet-5.5" }).args;
  expect(withModel.slice(withModel.indexOf("--model"), withModel.indexOf("--model") + 2)).toEqual([
    "--model",
    "anthropic/claude-sonnet-5.5",
  ]);
  expect(withModel.filter((a) => a === "--model")).toHaveLength(1);
  const plain = evalInvocation(base).args;
  expect(plain.slice(plain.indexOf("--model"), plain.indexOf("--model") + 2)).toEqual([
    "--model",
    "claude-sonnet-5-5",
  ]);
});

test("SP9-T10 AC-3: the Vue-shaped fixture's test is red as committed in both halves of the pair, so the seat case's request is a real change", () => {
  for (const name of ["pack-frontend-seats-the-team", "pack-frontend-absent"]) redAsCommitted(name);
});

/** The case's scaffold in a fresh folder and home, then node --test red on the notice's transition. */
function redAsCommitted(name: string): void {
  const dir = mkdtempSync(join(tmpdir(), "crew-eval-vue-red-"));
  const home = mkdtempSync(join(tmpdir(), "crew-evals-home-"));
  try {
    const scaffold = spawnSync("sh", [`${EVALS}${name}/fixture.sh`], {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...childEnv(),
        PATH: `${FIXTURES_BIN}${delimiter}${PLUGIN_BIN}${delimiter}${process.env.PATH}`,
        WIZARDINGCODE_HOME: home,
      },
    });
    expect(scaffold.status, `${name}: ${scaffold.stderr}`).toBe(0);
    const red = spawnSync("node", ["--test"], { cwd: dir, encoding: "utf8" });
    expect(red.status, name).not.toBe(0);
    // The failing test by name beside the runner's fail marker (TAP's `not ok`, or the spec
    // reporter's cross), and the other test passing: the red is the transition's, not any failure.
    const output = `${red.stdout}${red.stderr}`;
    expect(output).toMatch(
      /(not ok \d+ - |✖ )the notice animates its dismiss with a transition on transform or opacity/,
    );
    // Anchored at a line start (finding 184): a `not ok` line never satisfies it.
    const passLine = /(^|\n)\s*(ok \d+ - |✔ )the notice has a dismiss button/;
    expect(output).toMatch(passLine);
    expect(output).not.toMatch(/(^|\n)\s*(not ok \d+ - |✖ )the notice has a dismiss button/);
    expect("not ok 1 - the notice has a dismiss button").not.toMatch(passLine);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

/**
 * The forbidden shapes of a fixture stub (SP9 Task 11, AC-9; SP9 Task 12, AC-16): a process,
 * network or worker module; an fs write in its synchronous, callback or promise form, `copyFile`
 * and `symlink` in both forms, each matched as a call so an ordinary word in a stub's printed lines
 * does not trip it; a `fetch` call; a URL.
 */
const STUB_MODULES =
  /(?:from\s*|require\(\s*|import\(\s*)["'](?:node:)?(?:child_process|net|http|https|dns|worker_threads|vm)["']/;
const STUB_WRITES =
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|mkdirSync|mkdir|rmSync|rm|unlinkSync|unlink|renameSync|rename|createWriteStream|cpSync|cp|copyFileSync|copyFile|symlinkSync|symlink)\s*\(/;
const STUB_FETCH = /\bfetch\s*\(/;
/**
 * A pack pair's faked packages (SP9 Task 12, the code-quality round 1: one shape for the nuxt and
 * the next pairs): the scaffold's prefix, the stubs' sources the scan reads, the two files its vitest
 * reads as literals, the util the request writes and the path a test imports it by, and the stubs
 * run beside vitest, each with its arguments and what its output must be (`stdout` whole, `says` a
 * part) when the row checks it.
 */
interface PairStubs {
  prefix: string;
  files: readonly string[];
  reads: readonly string[];
  util: string;
  importPath: string;
  others: readonly { args: readonly string[]; stdout?: string; says?: string }[];
}
const NUXT_PAIR: PairStubs = {
  prefix: "nuxt",
  files: [
    "node_modules/vitest/vitest.mjs",
    "node_modules/eslint/bin/eslint.js",
    "node_modules/nuxt/bin/nuxt.mjs",
  ],
  reads: ["app/utils/slugify.ts", "tests/slugify.test.ts"],
  util: "app/utils/slugify.ts",
  importPath: "../app/utils/slugify",
  others: [
    { args: ["node_modules/eslint/bin/eslint.js", "."], stdout: "" },
    { args: ["node_modules/nuxt/bin/nuxt.mjs", "typecheck"], says: "typecheck" },
    { args: ["node_modules/nuxt/bin/nuxt.mjs", "build"] },
  ],
};
const NEXT_PAIR: PairStubs = {
  prefix: "next",
  files: [
    "node_modules/vitest/vitest.mjs",
    "node_modules/eslint/bin/eslint.js",
    "node_modules/next/dist/bin/next",
  ],
  reads: ["lib/slugify.ts", "tests/slugify.test.ts"],
  util: "lib/slugify.ts",
  importPath: "../lib/slugify",
  others: [
    { args: ["node_modules/eslint/bin/eslint.js", "."], stdout: "" },
    {
      args: ["node_modules/next/dist/bin/next", "build"],
      stdout: "[next] build: the fixture's stub, nothing run\n",
    },
    { args: ["node_modules/next/dist/bin/next", "typegen"] },
  ],
};
/**
 * A readFileSync or readFile call whose argument is a string literal in single or double quotes
 * (SP9 Task 11, AC-9; the judge's defect at round 1; SP9 Task 12, AC-16: both forms): a template
 * literal, a variable or a call is not one, so a stub that computes a path has fewer literal calls
 * than calls and the scan refuses it.
 */
const READ_LITERAL = /readFile(?:Sync)?\(\s*(["'])([^"']*)\1/g;
const READ_CALL = /readFile(?:Sync)?\(/g;

/** A pack pair's scaffold in a fresh folder and home, and a runner of its stubs from the scaffold (SP9 Task 12: one helper for the nuxt and the next pairs). */
function packScaffold(
  prefix: string,
  name: string,
  extra: Record<string, string> = {},
): {
  dir: string;
  home: string;
  env: NodeJS.ProcessEnv;
  stub: (...args: string[]) => ReturnType<typeof spawnSync>;
} {
  const dir = mkdtempSync(join(tmpdir(), `crew-eval-${prefix}-`));
  const home = mkdtempSync(join(tmpdir(), "crew-evals-home-"));
  const env: NodeJS.ProcessEnv = {
    ...childEnv(),
    PATH: `${FIXTURES_BIN}${delimiter}${PLUGIN_BIN}${delimiter}${process.env.PATH}`,
    WIZARDINGCODE_HOME: home,
    ...extra,
  };
  const scaffold = spawnSync("sh", [`${EVALS}${name}/fixture.sh`], {
    cwd: dir,
    encoding: "utf8",
    env,
  });
  expect(scaffold.status, `${name}: ${scaffold.stderr}`).toBe(0);
  const stub = (...args: string[]) => spawnSync("node", args, { cwd: dir, encoding: "utf8" });
  return { dir, home, env, stub };
}

/**
 * A pair's faked vitest red as committed and green on the request (SP9 Task 11 AC-5, SP9 Task 12
 * AC-13): red naming the slugify test, still red with the util alone, green with the test naming it,
 * `related` run, and the other stubs exiting 0 with the output the pair says.
 */
function expectStubRedThenGreen(pair: PairStubs, name: string): void {
  const { dir, home, stub } = packScaffold(pair.prefix, name);
  try {
    const red = stub("node_modules/vitest/vitest.mjs", "run");
    expect(red.status, name).toBe(1);
    expect(`${red.stdout}${red.stderr}`, name).toMatch(
      /FAIL\s+tests\/slugify\.test\.ts > slugify turns a title into a slug/,
    );
    // The util alone is not green: the test has to name it (the request asks for both).
    mkdirSync(join(dir, dirname(pair.util)), { recursive: true });
    writeFileSync(
      join(dir, pair.util),
      "export function slugify(title: string): string {\n  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');\n}\n",
    );
    const half = stub("node_modules/vitest/vitest.mjs", "run");
    expect(half.status, name).toBe(1);
    expect(`${half.stdout}${half.stderr}`, name).toContain(
      "tests/slugify.test.ts does not name slugify",
    );
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(
      join(dir, "tests", "slugify.test.ts"),
      `import { describe, expect, it } from 'vitest';\nimport { slugify } from '${pair.importPath}';\n\ndescribe('slugify', () => {\n  it('turns a title into a slug', () => {\n    expect(slugify('Hello, World!')).toBe('hello-world');\n  });\n});\n`,
    );
    const green = stub("node_modules/vitest/vitest.mjs", "run");
    expect(green.status, `${name}: ${green.stdout}${green.stderr}`).toBe(0);
    expect(green.stdout, name).toContain("1 passed");
    const related = stub("node_modules/vitest/vitest.mjs", "related", pair.util, "--run");
    expect(related.status, name).toBe(0);
    expect(related.stdout, name).toContain(`related: ${pair.util}`);
    for (const other of pair.others) {
      const run = stub(...other.args);
      const label = `${name}: ${other.args.join(" ")}`;
      expect(run.status, label).toBe(0);
      if (other.stdout !== undefined) expect(run.stdout, label).toBe(other.stdout);
      if (other.says !== undefined) expect(run.stdout, label).toContain(other.says);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

/**
 * A pair's faked packages inert (SP9 Task 11 AC-9, SP9 Task 12 AC-16; the security lead's rounds of
 * both items): no process, network or worker module, no fs write in any form, no fetch, no URL, the
 * vitest stub's reads the two named files alone as literals in either form (each refused shape a
 * test string the regexes must match), and a red run then a green one leaving the scaffold's tree
 * unchanged but for the util and the test.
 */
function expectInertStubs(pair: PairStubs, name: string): void {
  const { dir, home, stub } = packScaffold(pair.prefix, name);
  try {
    const reads: string[] = [];
    // The three forms a module enters by, each refused on a string of its own.
    for (const shape of [
      'import { spawn } from "node:child_process";',
      'const net = require("net");',
      'const { exec } = await import("node:child_process");',
    ])
      expect(shape, shape).toMatch(STUB_MODULES);
    // The writes in every form, each refused on a string of its own; a bare word that is not a call is not.
    for (const shape of [
      'writeFileSync("a", "b")',
      'await writeFile("a", "b")',
      "fs.promises.appendFile(p, d)",
      "await mkdir(dir, { recursive: true })",
      "rm(target)",
      "await unlink(p)",
      "rename(a, b)",
      "createWriteStream(p)",
      "await cp(a, b)",
      "copyFile(a, b)",
      "copyFileSync(a, b)",
      "symlink(a, b)",
      "symlinkSync(a, b)",
    ])
      expect(shape, shape).toMatch(STUB_WRITES);
    for (const shape of ["the rm word in a line", "a cp of the file", "rename it later"])
      expect(shape, shape).not.toMatch(STUB_WRITES);
    expect("await fetch(url)").toMatch(STUB_FETCH);
    expect("const res = fetch (target)").toMatch(STUB_FETCH);
    for (const rel of pair.files) {
      const src = readFileSync(join(dir, rel), "utf8");
      expect(src, rel).not.toMatch(STUB_MODULES);
      expect(src, rel).not.toMatch(STUB_WRITES);
      expect(src, rel).not.toMatch(STUB_FETCH);
      expect(src, rel).not.toMatch(/https?:\/\//);
      // Every read, in either form, takes a string literal (the QA lead's advisory at Task 11: a computed path would slip a scan).
      const calls = src.match(READ_CALL) ?? [];
      const literals = [...src.matchAll(READ_LITERAL)].map((m) => m[2] as string);
      expect(literals, rel).toHaveLength(calls.length);
      reads.push(...literals);
    }
    expect([...new Set(reads)].sort()).toEqual([...pair.reads].sort());
    // The same two regexes refuse a computed path in either form: one call, no literal, so the counts differ.
    for (const computed of [
      'readFileSync(`${base}/x.ts`, "utf8")',
      'await readFile(`${base}/x.ts`, "utf8")',
      'readFile(join(a, "b"), "utf8")',
      'readFileSync(path, "utf8")',
      'readFileSync(join(a, "b"), "utf8")',
    ]) {
      expect(computed.match(READ_CALL), computed).toHaveLength(1);
      expect([...computed.matchAll(READ_LITERAL)], computed).toHaveLength(0);
    }
    expect(
      [...'readFile("lib/slugify.ts", "utf8")'.matchAll(READ_LITERAL)].map((m) => m[2]),
    ).toEqual(["lib/slugify.ts"]);
    // The scaffold's own state is the baseline (the fixture's crew detect leaves .crew/ untracked); the stubs add nothing to it.
    const status = () =>
      spawnSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" })
        .stdout.trim()
        .split("\n")
        .filter(Boolean)
        .sort();
    const baseline = status();
    expect(stub("node_modules/vitest/vitest.mjs", "run").status).toBe(1);
    for (const other of pair.others)
      expect(stub(...other.args).status, other.args.join(" ")).toBe(0);
    expect(status()).toEqual(baseline);
    mkdirSync(join(dir, dirname(pair.util)), { recursive: true });
    mkdirSync(join(dir, "tests"), { recursive: true });
    writeFileSync(join(dir, pair.util), "export const slugify = (t: string) => t;\n");
    writeFileSync(
      join(dir, "tests", "slugify.test.ts"),
      `import { slugify } from '${pair.importPath}';\n`,
    );
    expect(stub("node_modules/vitest/vitest.mjs", "run").status).toBe(0);
    expect(status().filter((line) => !baseline.includes(line))).toEqual([
      `?? ${dirname(pair.util)}/`,
      "?? tests/",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
}

test("SP9-T11 AC-5: the fixture's faked vitest is red as committed in both halves of the pair, naming the slugify test, and green once the util exports slugify and the test names it; the faked eslint and nuxt typecheck exit 0", () => {
  for (const name of ["pack-nuxt-refines-the-gates", "pack-nuxt-absent"])
    expectStubRedThenGreen(NUXT_PAIR, name);
});

test("SP9-T11 AC-9: the three faked packages are inert: no process, network or worker module, no fs write in any form, no fetch, no URL, the vitest stub's reads the two named files alone as literals, and a red run then a green one leave the scaffold's tree unchanged but for the util and the test", () => {
  expectInertStubs(NUXT_PAIR, "pack-nuxt-absent");
});

test("SP9-T12 AC-13: the next fixture's faked vitest is red as committed in both halves of the pair, naming the slugify test, and green once the util under lib/ exports slugify and the test names it; the faked eslint and next build exit 0 with the stub's one line", () => {
  for (const name of ["pack-next-refines-the-gates", "pack-next-absent"])
    expectStubRedThenGreen(NEXT_PAIR, name);
});

test("SP9-T12 AC-16: the next fixture's three faked packages are inert: no process, network or worker module, no fs write in any form, no fetch, no URL, the vitest stub's reads the two named files alone as literals in either form, and a red run then a green one leave the scaffold's tree unchanged but for the util and the test", () => {
  expectInertStubs(NEXT_PAIR, "pack-next-absent");
});

test("2026-10-28-004 AC-10: the gate matchers read their pack names from PACK_BY_PREFIX and CORE_GATE takes the gate, the command and the source alone", () => {
  expect(LARAVEL_GATE("test", "php artisan test", "proposed", true).source).toContain(
    PACK_BY_PREFIX["pack-laravel"] as string,
  );
  expect(NUXT_GATE("test", "npx vitest run", "proposed", true).source).toContain(
    PACK_BY_PREFIX["pack-nuxt"] as string,
  );
  expect(CORE_GATE.length).toBe(3);
  // Read, never spelled: this file's own source holds no pack name at a packGate call (the
  // test-quality round 1 of 2026-10-28-004).
  const source = readFileSync(fileURLToPath(import.meta.url), "utf8");
  expect(source).not.toContain(["packGate(", '"wizardingcode-pack-'].join(""));
  expect(CORE_GATE("build", "npm run build", "detected").source).toContain(
    '"source":\\s*"detected"\\s*\\}',
  );
  expect(CORE_GATE("build", "npm run build", "detected").source).not.toContain("pack");
});

/**
 * The laravel Blade pair's artisan, a PHP script scanned deny by default (SP9 Task 13 AC-9, the
 * security lead's R-1 and R-2 at the spec): the comments stripped, then the string literals too for
 * the call scan, so a forbidden word in a printed line or a comment does not trip it and a call
 * cannot hide in either. Every `name(` is one of the six the stub calls (a language construct
 * such as `if (` is not a call), no `$name(`, no `new Name(`, no backtick, none of the code forms.
 */
const PHP_CALLS_ALLOWED = [
  "file_get_contents",
  "file_exists",
  "str_contains",
  "implode",
  "array_slice",
  "exit",
];
const PHP_CONSTRUCTS = [
  "if",
  "elseif",
  "while",
  "for",
  "foreach",
  "switch",
  "match",
  "isset",
  "empty",
  "array",
  "list",
];
const PHP_CODE_FORMS = /\b(?:eval|include|include_once|require|require_once)\b/;
/** A PHP source without its comments (`//` and `#` to the line's end, the block form), and the same without its string literals too (each kept as an empty pair of its quotes). */
function phpStripped(src: string): { noComments: string; noStrings: string } {
  let noComments = "";
  let noStrings = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i] as string;
    const n = src[i + 1];
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if ((c === "/" && n === "/") || c === "#") {
      const end = src.indexOf("\n", i);
      i = end === -1 ? src.length : end;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
      noComments += src.slice(i, j + 1);
      noStrings += c + c;
      i = j + 1;
      continue;
    }
    noComments += c;
    noStrings += c;
    i += 1;
  }
  return { noComments, noStrings };
}
/** Why a PHP stub is not inert, or nothing: a call outside the allow-list, a variable call, a `new`, a backtick, a code form. */
function phpStubProblems(src: string): string[] {
  const { noStrings } = phpStripped(src);
  const problems: string[] = [];
  for (const m of noStrings.matchAll(/(\$?)\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const name = m[2] as string;
    if (m[1]) problems.push(`a variable call: $${name}(`);
    else if (!PHP_CALLS_ALLOWED.includes(name) && !PHP_CONSTRUCTS.includes(name))
      problems.push(`a call outside the allow-list: ${name}(`);
  }
  if (/\bnew\s+\\?[A-Za-z_]/.test(noStrings)) problems.push("a new expression");
  if (noStrings.includes("`")) problems.push("a backtick");
  const form = PHP_CODE_FORMS.exec(noStrings);
  if (form) problems.push(`a code form: ${form[0]}`);
  return problems;
}
/**
 * The one read form a PHP stub may use (the security lead's R-2): every `file_get_contents(` and
 * `file_exists(` (READ_CALL_PHP) is a `__DIR__ . '/<literal>'` read whose single-quoted literal
 * holds no `$`, no `:` and no `..` and whose call ends at `)` (READ_LITERAL_PHP); a computed path, a
 * parent path or a wrapper leaves fewer literal reads than calls, or a refused literal.
 */
const READ_CALL_PHP = /\b(?:file_get_contents|file_exists)\s*\(/g;
const READ_LITERAL_PHP = /\b(?:file_get_contents|file_exists)\(__DIR__ \. '(\/[^'$:]*)'\)/g;
function phpReads(src: string): { calls: number; literals: string[]; problems: string[] } {
  const { noComments } = phpStripped(src);
  const calls = (noComments.match(READ_CALL_PHP) ?? []).length;
  const literals = [...noComments.matchAll(READ_LITERAL_PHP)].map((m) => m[1] as string);
  const problems = literals.filter((l) => l.includes("..")).map((l) => `a parent path: ${l}`);
  if (literals.length !== calls) problems.push(`${calls} reads, ${literals.length} literal`);
  return { calls, literals, problems };
}

/** The laravel Blade pair's scaffold in a fresh folder and home, and a runner of its artisan through the machine's php (SP9 Task 13). */
function laravelBladeScaffold(name: string): {
  dir: string;
  home: string;
  artisan: (...args: string[]) => SpawnSyncReturns<string>;
  crew: (...args: string[]) => SpawnSyncReturns<string>;
} {
  // The pack pairs' scaffold (packScaffold), with the repository for the with half's copy of the pack.
  const { dir, home, env } = packScaffold("laravel-blade", name, {
    WIZARDINGCODE_CREW_REPO: repoRoot,
  });
  const artisan = (...args: string[]) =>
    spawnSync("php", ["artisan", ...args], { cwd: dir, encoding: "utf8", env });
  const crew = (...args: string[]) => spawnSync("crew", args, { cwd: dir, encoding: "utf8", env });
  return { dir, home, artisan, crew };
}
const BLADE_PAIR = ["pack-laravel-blade-tags-the-view", "pack-laravel-blade-tags-the-view-absent"];
const BLADE_FIXTURE = `${EVALS}fixtures/laravel-blade-shaped.sh`;
/** The anonymous component the request asks, and the welcome view rendering it with the session's status. */
const ALERT_COMPONENT =
  "@props(['type' => 'success'])\n<div role=\"alert\" {{ $attributes->class([$type]) }}>{{ $slot }}</div>\n";
function renderAlert(dir: string): void {
  const welcome = join(dir, "resources", "views", "welcome.blade.php");
  writeFileSync(
    welcome,
    readFileSync(welcome, "utf8").replace(
      "<h1>",
      "<x-alert type=\"success\">{{ session('status') }}</x-alert>\n    <h1>",
    ),
  );
}

test("SP9-T13 AC-3: the Blade pair's profile-tags grader matches a pretty-printed profile with the two tags in order and not one with laravel alone or the tags reversed; both fixtures source the Blade-shaped fixture, which sources the laravel-shaped one", () => {
  const pattern = new RegExp(
    frontMatter(
      readFileSync(`${EVALS}pack-laravel-blade-tags-the-view/graders/profile-tags.md`, "utf8"),
    ).pattern as string,
  );
  const profile = (tags: string[]) =>
    JSON.stringify({ targets: [{ path: ".", stack: "php", tags }] }, null, 2);
  expect(profile(["laravel", "dusk"])).toMatch(pattern);
  expect(profile(["laravel"])).not.toMatch(pattern);
  expect(profile(["dusk", "laravel"])).not.toMatch(pattern);
  for (const name of BLADE_PAIR)
    expect(readFileSync(`${EVALS}${name}/fixture.sh`, "utf8"), name).toContain(
      '. "$(dirname "$0")/../fixtures/laravel-blade-shaped.sh"',
    );
  expect(readFileSync(BLADE_FIXTURE, "utf8")).toContain(
    '. "$(dirname "$0")/../fixtures/laravel-shaped.sh"',
  );
});

test("SP9-T13 AC-3 (the test-quality defect at round 1): the pack-e2e-gate and ui-ux-not-run patterns match the lines the engine prints on the with case's scaffold, and not the same lines without the pack's mark or with another gate", () => {
  const pattern = (grader: string) =>
    new RegExp(
      frontMatter(
        readFileSync(`${EVALS}pack-laravel-blade-tags-the-view/graders/${grader}.md`, "utf8"),
      ).pattern as string,
    );
  const e2e = pattern("pack-e2e-gate");
  const notRun = pattern("ui-ux-not-run");
  const { dir, home, crew } = laravelBladeScaffold("pack-laravel-blade-tags-the-view");
  try {
    // The profile as crew detect prints it: the dusk rule's e2e line with the pack's mark.
    const detected = crew("detect");
    expect(detected.status, detected.stderr).toBe(0);
    expect(detected.stdout).toMatch(e2e);
    expect(detected.stdout.replace(/ \(pack wizardingcode-pack-laravel\)/g, "")).not.toMatch(e2e);
    // A Blade change on an item: the not-run record's own line and the verdict's line.
    writeFileSync(
      join(dir, "resources", "views", "welcome.blade.php"),
      "<x-layouts.app>\n</x-layouts.app>\n",
    );
    const started = crew(
      "start",
      "Edit the welcome view",
      "--answers",
      JSON.stringify({
        work_type: "fix",
        is_vague: 0,
        scope: 0,
        touches_auth: 0,
        touches_payments: 0,
        touches_personal_data: 0,
        touches_data_migration: 0,
        touches_infra: 0,
        touches_public_api: 0,
      }),
      "--criterion",
      "a",
    );
    expect(started.status, started.stderr).toBe(0);
    const id = readdirSync(join(dir, ".crew", "work"))[0] as string;
    const recorded = crew(
      "judgement",
      id,
      "record",
      "ui-ux",
      "--not-run",
      "--reason",
      "no evidence",
    );
    // The record is written and the item stays not proven, so the command exits 1 with both lines.
    expect(recorded.status, `${recorded.stdout}${recorded.stderr}`).toBe(1);
    expect(recorded.stdout).toContain("  ui-ux: not run: no evidence");
    expect(recorded.stdout).toMatch(notRun);
    expect(recorded.stdout.replace(/ui-ux/g, "code-quality")).not.toMatch(notRun);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("SP9-T13 AC-4: the Blade fixture's artisan is red as committed in both halves of the pair, naming the welcome test and the missing component, still red with the component alone, green once the welcome view renders <x-alert>; dusk and serve exit 0 with the stub's one line", () => {
  for (const name of BLADE_PAIR) {
    const { dir, home, artisan } = laravelBladeScaffold(name);
    try {
      const red = artisan("test");
      expect(red.status, name).toBe(1);
      expect(red.stdout, name).toContain("FAIL  Tests\\Feature\\WelcomeTest");
      expect(red.stdout, name).toContain("View [components.alert] not found");
      mkdirSync(join(dir, "resources", "views", "components"), { recursive: true });
      writeFileSync(
        join(dir, "resources", "views", "components", "alert.blade.php"),
        ALERT_COMPONENT,
      );
      const half = artisan("test");
      expect(half.status, name).toBe(1);
      expect(half.stdout, name).toContain("FAIL  Tests\\Feature\\WelcomeTest");
      expect(half.stdout, name).toContain("the welcome view does not render <x-alert>");
      renderAlert(dir);
      const green = artisan("test");
      expect(green.status, `${name}: ${green.stdout}${green.stderr}`).toBe(0);
      expect(green.stdout, name).toContain("PASS  Tests\\Feature\\WelcomeTest");
      for (const args of [["dusk"], ["serve", "--port", "8000"]]) {
        const run = artisan(...args);
        expect(run.status, args.join(" ")).toBe(0);
        expect(run.stdout, args.join(" ")).toBe(`artisan: ${args.join(" ")}\n`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
      rmSync(home, { recursive: true, force: true });
    }
  }
});

test("SP9-T13 AC-9: the Blade fixture's artisan is inert, deny by default: every name the security lead listed is a refused string and a bare word in a printed line or a comment is not; its reads are the three files by literal path and the refused read shapes are strings of their own; no URL; the shell stubs are laravel-shaped.sh's; test, dusk and serve leave the scaffold's tree as it was, and the green run adds the component and changes the welcome view alone", () => {
  // The processes, the code forms, the network, the writes and the reads that bypass the rule (R-1).
  for (const shape of [
    "exec($cmd)",
    "shell_exec('ls')",
    "system('ls')",
    "passthru('ls')",
    "proc_open('ls', [], $pipes)",
    "popen('ls', 'r')",
    "`ls`",
    "eval($code)",
    "include 'x.php';",
    "include_once 'x.php';",
    "require 'x.php';",
    "require_once __DIR__ . '/x.php';",
    "pcntl_exec('/bin/sh')",
    "proc_nice(1)",
    "mail($to, $subject, $body)",
    "assert('1 === 1')",
    "call_user_func($f)",
    "call_user_func_array($f, [])",
    "create_function('', '')",
    "unserialize($s)",
    "putenv('A=1')",
    "ini_set('a', '1')",
    "dl('x.so')",
    "$f()",
    "$this->run()",
    "curl_init()",
    "curl_exec($ch)",
    "curl_multi_init()",
    "fsockopen('h', 80)",
    "stream_socket_client('tcp://h:80')",
    "stream_socket_server('tcp://0:80')",
    "socket_create(AF_INET, SOCK_STREAM, 0)",
    "socket_connect($s, 'h', 80)",
    "stream_context_create([])",
    "new SoapClient('x')",
    "mysqli_connect('h')",
    "new PDO('sqlite::memory:')",
    "file_put_contents('x', 'y')",
    "fwrite($h, 'x')",
    "fputs($h, 'x')",
    "touch('x')",
    "chmod('x', 0644)",
    "chown('x', 'u')",
    "rmdir('x')",
    "tempnam('/tmp', 'x')",
    "tmpfile()",
    "new SplFileObject('x', 'w')",
    "new SplTempFileObject()",
    "move_uploaded_file('a', 'b')",
    "ftruncate($h, 0)",
    "rename('a', 'b')",
    "unlink('x')",
    "mkdir('x')",
    "copy('a', 'b')",
    "symlink('a', 'b')",
    "file('x')",
    "readfile('x')",
    "fopen('x', 'r')",
    "parse_ini_file('x')",
    "highlight_file('x')",
    "show_source('x')",
    "glob('*')",
    "scandir('.')",
    "opendir('.')",
    "new DirectoryIterator('.')",
  ])
    expect(phpStubProblems(shape), shape).not.toEqual([]);
  for (const shape of [
    'echo "the exec word in a line";',
    "// unlink here, in a comment",
    "# and fopen in a hash comment",
    "/* require inside a block */",
    "echo 'artisan: ' . implode(' ', array_slice($argv, 1)) . \"\\n\";",
    "if (file_exists(__DIR__ . '/x')) { exit(0); }",
  ])
    expect(phpStubProblems(shape), shape).toEqual([]);
  // The read shapes refused (R-2), each on a string of its own; the one accepted shape counted.
  for (const shape of [
    "file_get_contents(__DIR__ . '/x' . $y)",
    "file_get_contents(dirname(__DIR__) . '/x')",
    'file_get_contents(__DIR__ . "/{$x}")',
    "file_get_contents(__DIR__ . <<<EOT\n/x\nEOT)",
    "file_exists(__DIR__ . '../x')",
    "file_exists(__DIR__ . '/../x')",
    "file_get_contents('php://stdin')",
    "file_get_contents(__DIR__ . '/php://x')",
    "file_get_contents($path)",
  ])
    expect(phpReads(shape).problems, shape).not.toEqual([]);
  expect(
    phpReads("file_exists(__DIR__ . '/a.php') && file_get_contents(__DIR__ . '/b.php') // c('/d')"),
  ).toEqual({ calls: 2, literals: ["/a.php", "/b.php"], problems: [] });
  const fixture = readFileSync(BLADE_FIXTURE, "utf8");
  expect(fixture).not.toContain("vendor/bin/pint");
  expect(fixture).not.toContain("vendor/bin/phpstan");
  const { dir, home, artisan } = laravelBladeScaffold("pack-laravel-blade-tags-the-view-absent");
  try {
    const src = readFileSync(join(dir, "artisan"), "utf8");
    expect(phpStubProblems(src)).toEqual([]);
    expect(src).not.toMatch(/https?:\/\//);
    const reads = phpReads(src);
    expect(reads.problems).toEqual([]);
    expect([...new Set(reads.literals)].sort()).toEqual([
      "/resources/views/components/alert.blade.php",
      "/resources/views/welcome.blade.php",
      "/tests/Feature/WelcomeTest.php",
    ]);
    // The scaffold's own state is the baseline; the stubs add nothing to it (the lines whole, since a modified file's line starts with a space).
    const status = () =>
      spawnSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" })
        .stdout.split("\n")
        .filter(Boolean)
        .sort();
    const baseline = status();
    expect(artisan("test").status).toBe(1);
    expect(artisan("dusk").status).toBe(0);
    expect(artisan("serve", "--port", "8000").status).toBe(0);
    expect(status()).toEqual(baseline);
    mkdirSync(join(dir, "resources", "views", "components"), { recursive: true });
    writeFileSync(
      join(dir, "resources", "views", "components", "alert.blade.php"),
      ALERT_COMPONENT,
    );
    renderAlert(dir);
    expect(artisan("test").status).toBe(0);
    expect(status().filter((line) => !baseline.includes(line))).toEqual([
      " M resources/views/welcome.blade.php",
      // The components folder holds the layout already, so the new file is listed by its name.
      "?? resources/views/components/alert.blade.php",
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test("2026-10-29-001 AC-18 (the test-quality advisories at round 5): the D-3 cases' discriminating graders pass what the standard asks and fail what it refuses", () => {
  // review-names-dependency: a findings line naming nodemon as a defect, read from the trace.
  const named = graderPattern("code-quality-flags-unasked-dependency", "review-names-dependency");
  const findings = (lines: string, outside = "none") =>
    `# code-quality findings for 2026-10-29-001-x\nreviewer: review-code-quality\n\n## Findings\n${lines}\n\n## Outside the change\n${outside}\n`;
  const read = (text: string) =>
    traceText(ranBash("b1", "cat review/code-quality.findings.md", text));
  const defect =
    "- F-1 · defect · package.json:11 · nodemon is a dependency no criterion asks for (question 7).";
  const advisory =
    "- F-1 · advisory · package.json:11 · nodemon is unrelated to initials (question 5).";
  expect(read(findings(defect))).toMatch(named);
  expect(read(findings(advisory))).not.toMatch(named);
  expect(
    read(findings("- F-1 · defect · src/names.mjs:3 · a name could be sharper.\n" + advisory)),
  ).not.toMatch(named);
  expect(read(findings("none", `- package.json:11 · defect · nodemon`))).not.toMatch(named);
  expect(traceText([agentText("The review named nodemon as a defect.")])).not.toMatch(named);
  // scope-kept: both scope limits as the draft states them, never reversed or loosened.
  const kept = graderPattern("writing-standard-ending-without-tells", "scope-kept");
  expect("It runs on Node 20 or later and was not measured on Windows.").toMatch(kept);
  expect("It runs on Node 20 or later and has not been measured on Windows.").toMatch(kept);
  expect("It needs Node 20 or later and has not been tested on Windows.").not.toMatch(kept);
  expect("It runs on Node 18 or later and was not measured on Windows.").not.toMatch(kept);
  expect("It runs on Node 20 or later and was measured on Windows.").not.toMatch(kept);
});
