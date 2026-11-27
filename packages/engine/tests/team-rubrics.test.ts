import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Item 2026-11-27-001: each team definition's subjects beyond the engine's enter the team's rubric
// (the user's decision of 2026-11-27, "Só rubricas"). The texts below are the spec's, word for word.

const ROOT = join(import.meta.dir, "../../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const RUBRIC = (name: string) => `plugins/core/skills/crew/rubrics/${name}.md`;

interface Block {
  criterion: string;
  questions: string[];
  closing: string;
  defects: string[];
  advisories: string[];
}

// The texts write the plugin root as {PLUGIN_ROOT}; each rubric writes it as the variable.
const PLUGIN_ROOT = ["$", "{CLAUDE_PLUGIN_ROOT}"].join("");
const TEXTS: Record<string, Block> = {
  security: {
    criterion: "AC-8",
    questions: [
      '9. Dependencies and supply chain, when the diff changes a manifest or a lock file (`composer.json`, `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml` and their locks): does the lock file change with the manifest, at a pinned version where the project pins, and does the change add a registry the project does not use? The row: `{PLUGIN_ROOT}/teams/security.md`, "Dependencies and supply chain".',
      "10. Secrets, when the diff reads a credential (an environment variable, a vault lookup, a key file): is the credential named in the project's example environment file without its value, written by its variable's name in every command and document the diff adds, and kept out of every log line, error message and response? The rule: `wizardingcode-devops-secrets-identities`.",
      "11. Cryptography, when the diff calls a hashing, encryption, signing, random-number or TLS interface: does it use the framework's or the platform's own primitive rather than a construction of its own, a hash made for passwords for a password, a secure generator for a token, and TLS with its verification on? The row: `{PLUGIN_ROOT}/teams/security.md`, \"Cryptography\".",
      "12. AI and agents, when the diff adds or changes a prompt, a call to a model, an agent or a tool an agent calls: is text from outside (a page, a file, a user's message, a tool's result) kept apart from the instructions as data, and does an agent that reads such text hold write tools only under a permission rule? The rule: `wizardingcode-agentic-agents-tools-prompts`.",
    ],
    closing:
      "Questions 9 to 12 are answered only when the diff touches their subject, by the trigger each names; the engine raises none of the four as a risk area.",
    defects: [
      "a secret's value written to a log line, an error message or a response",
      "outside text or a tool's result passed into a prompt as instructions",
    ],
    advisories: [
      "a manifest changed without its lock file where the project commits one",
      "a dependency at an unpinned range where the project pins",
      "a new secret missing from the example environment file",
      "a cryptographic construction of the change's own, a general-purpose hash for a password, or TLS verification turned off outside a test",
      "an agent that reads outside text holding write tools with no permission rule",
    ],
  },
  data: {
    criterion: "AC-9",
    questions: [
      "7. Pipelines, when the diff adds or changes a job, a scheduled task, a DAG, a queue worker or a transformation: does the transformation come with its tests, does a re-run on the same input give the same outcome rather than writing its rows twice, and is every connection written by its variable's name? The rule: `wizardingcode-etl-pipeline`.",
      "8. Data quality and validation, when the diff reads data that arrives from outside the code (a load, an import, a sync, a consumer): is the data read against its expected schema, checked for completeness and duplicates, and is what failed reported rather than dropped? The rule: `wizardingcode-etl-quality-monitor`.",
      "9. Imports, exports and file formats, when the diff reads or writes a file (CSV, JSON, XML, Parquet, a spreadsheet): is the schema that arrived set beside the one expected before rows are written? The rule: `wizardingcode-etl-schema-evolution`.",
      '10. Integrations and synchronisation, when the diff adds or changes a webhook handler, a message consumer, a change-data-capture reader or a job that writes to another system: does a message delivered twice write once, and can a write to the other system and a write to the database not happen one without the other? The row: `{PLUGIN_ROOT}/teams/etl.md`, "Integrations and synchronisation between systems".',
      "11. Backups, restore and retention, when the diff adds a table or a store, changes a backup or retention setting, or deletes data on a schedule: does the new store fall inside the backups the project already takes, does a restore step target a test database and never production, and does a scheduled deletion keep the retention the project states? The rule: `wizardingcode-devops-deploy-rollback`.",
      "12. Data warehouse and analytics, when the diff adds or changes a model, a view or a table for reporting (a dbt model, a warehouse table, a materialized view): does it say what one row stands for and at which time unit, and is a large table that only grows loaded incrementally rather than rebuilt? The rule: `wizardingcode-etl`.",
      "13. Sizing the solution to the volume, when the diff adds a store, an engine, a queue, a partitioning scheme or a batch mechanism the project does not have: does the item's spec state the volume it was chosen for, measured or estimated in writing? The rule: `wizardingcode-etl`.",
      "14. Documentation, catalogue and lineage, when the diff changes a table's columns or a model's output and the project keeps a data dictionary, schema descriptions or catalogue entries: are they updated in the same diff, and are the models that read the changed table named? The rule: `wizardingcode-etl-documentation`.",
    ],
    closing:
      "Questions 7 to 14 are answered only when the diff touches their subject, by the trigger each names; question 13 reads the item's spec, `.crew/work/<id>/spec.md`.",
    defects: [
      "a transformation with no test",
      "a re-run that writes the same rows twice",
      "data from outside written with no check against its expected schema",
      "a restore step that writes over production",
      "a scheduled deletion that contradicts the retention the project states",
      "a new store, engine or partitioning scheme with no volume stated in the spec, measured or estimated in writing",
    ],
    advisories: [
      "a consumer with no guard against a message delivered twice",
      "a new store outside the project's backups",
      "a reporting model whose grain is unstated, or a large append-only table rebuilt in full",
      "a data dictionary or catalogue entry not updated with the columns",
      "a changed table whose readers are not named",
    ],
  },
  "test-quality": {
    criterion: "AC-10",
    questions: [
      "9. Strategy and levels, when the diff adds a test for a path that differs end to end (a route, a command, a job): is there a test through the real flow beside the unit test, at the level the project's suite already uses for that kind of code? The rule: `wizardingcode-qa-test-design`.",
      "10. Flaky tests and determinism, when the diff adds or changes a retry, a skip, a raised timeout, a sleep, or a test that reads the clock, randomness, the run order or the network: does the change hide a red rather than trace it to its origin, and does the test use the framework's fake clock or seed where it has one? The rule: `wizardingcode-qa-proof`.",
      '11. Test doubles and boundaries, when the diff adds a mock, a stub, a fake or a fake HTTP server: does it replace only what crosses the boundary (the network, the clock, mail, a queue, storage), by the framework\'s own fake where the framework has one, and never the code under test? The row: `{PLUGIN_ROOT}/teams/qa.md`, "Test doubles and boundaries".',
      '12. Test data and state, when the diff adds a factory, a seeder, a fixture or a test that writes to a database or a file: does each test set up the state it reads and leave none for the next, by the project\'s own refresh or transaction mechanism? The row: `{PLUGIN_ROOT}/teams/qa.md`, "Test data and state".',
      '13. Property-based testing and fuzzing, when the diff adds a property test or a fuzz target: does a property hold for every generated input rather than restate the implementation, and is a fuzz run bounded in time and pointed at the project\'s local or test environment only? The row: `{PLUGIN_ROOT}/teams/qa.md`, "Property-based testing and fuzzing".',
      "14. The suite in CI, when the diff changes the CI's test job, its matrix, its sharding, its parallel settings or a coverage threshold: does every test the suite ran before still run, and is coverage read as a measure on the diff's lines rather than set as the goal? The row: `{PLUGIN_ROOT}/teams/qa.md`, \"The suite in CI\".",
      "15. Testing systems with AI, when the diff adds or changes an eval case, a grader or a prompt the product sends to a model: is a model's grade scored against a baseline arm, is the judge no weaker than the model it grades, and is what must have run read by a pattern over the trace? The rule: `wizardingcode-qa-evals`.",
    ],
    closing:
      "Questions 9 to 15 are answered only when the diff touches their subject, by the trigger each names.",
    defects: [
      "a path that differs end to end with a unit test and no test through the real flow (9)",
      "a retry, a skip or a raised timeout that makes a red pass without its cause traced (10)",
      "a model's grade with no baseline arm, or a judge weaker than the model it grades (15)",
    ],
    advisories: [
      "a test that reads the real clock or randomness where the framework has a fake",
      "a double of the change's own where the framework has its fake, or one that replaces more than the boundary",
      "a test that depends on state another test left",
      "a property that restates the implementation",
      "a fuzz run with no time bound or aimed outside the local or test environment",
      "a CI change that leaves tests of the suite out of the run with no stated reason",
      "a coverage threshold set as the goal",
    ],
  },
  infra: {
    criterion: "AC-11",
    questions: [
      "7. Containers and images, when the diff changes a Dockerfile, a compose file or an image reference: is the base image pinned where the project pins, does the image run as a non-root user where its neighbours do, and does the build context leave out environment files and the version-control folder? The rule: `wizardingcode-devops-environment-containers`.",
      "8. Infrastructure as code, when the diff changes Terraform or OpenTofu, Pulumi, CloudFormation or CDK, Bicep, Ansible, Helm or Kubernetes files: does a resource that holds data or serves traffic get replaced or destroyed, with its rollback stated (question 4), and does the change bring a tool whose licence is not open into a project that does not use it? The rule: `wizardingcode-devops-iac`.",
      "9. Deployment strategies and releases, when the diff changes a deploy job, a release tool's configuration, a feature flag or a version or changelog file: can the release be undone without losing data written in between, and are its manual steps named with who takes them and in which order? The rule: `wizardingcode-devops-deploy-rollback`.",
      "10. Observability and operation, when the diff adds a service, a job, a queue or an endpoint, or changes logging, metrics, alerts or dashboards: would a failure of the new path show in a log line, a metric or an alert the project already reads, and is an alert or a dashboard added as code the project validates? The rule: `wizardingcode-devops-operation`.",
      "11. Platforms and hosting, when the diff adds a platform, a managed service or a cluster the project does not run on (a provider's configuration, a first Kubernetes manifest, a platform's file): does the item's spec state the case it was chosen for, measured or estimated in writing? The rule: `wizardingcode-devops-deploy-rollback`.",
      "12. Cost, when the diff adds a billed resource or raises one (an instance size, a replica count, a database tier, a log retention, a CI runner): does the item's spec state what it costs, or the estimate it rests on? The rule: `wizardingcode-devops-iac`.",
      "13. Backups and disaster recovery, when the diff adds a store that holds data (a database, a volume, a bucket) or changes a backup job, its schedule or its retention: is the new store inside the project's backups, and does a restore step target a test database and never production? The rule: `wizardingcode-devops-deploy-rollback`.",
      "14. The pipeline's supply chain, when the diff adds or changes a CI step that uses a third-party action, image or downloaded tool: is it pinned by a full commit SHA or a verified version, and does the workflow's token carry only the permissions the job needs? The rule: `wizardingcode-devops-pipelines`.",
    ],
    closing:
      "Questions 7 to 14 are answered only when the diff touches their subject, by the trigger each names; questions 11 and 12 read the item's spec, `.crew/work/<id>/spec.md`.",
    defects: [
      "an image that runs as root where its neighbours do not",
      "a resource holding data replaced or destroyed with no rollback",
      "a release that cannot be undone without losing data written in between",
      "a new path whose failure no log line, metric or alert would show",
      "a new platform with no case stated in the spec, measured or estimated in writing",
      "a restore step that writes over production",
      "Trivy run through `trivy-action` at a moving tag",
    ],
    advisories: [
      "an unpinned base image where neighbours pin",
      "an environment file or the version-control folder inside the build context",
      "a tool whose licence is not open brought into a project that does not use it",
      "a manual release step with no owner named",
      "an alert added with no validation",
      "a billed resource added or raised with no cost stated",
      "a new store outside the project's backups",
      "a third-party action at a tag instead of a SHA",
    ],
  },
  architecture: {
    criterion: "AC-12",
    questions: [
      "7. Choosing the architecture style, when the diff adds a deployable, a service, an event bus, a queue between the project's own parts, CQRS or event sourcing, or a module boundary the base does not have: does the item's spec or an ADR state the case it was chosen for, measured or estimated in writing? The rule: `wizardingcode-architecture-decision`.",
      "8. Decisions and documentation, when the diff changes what an accepted ADR of the project decided, or adds an ADR: is the decision recorded in the form the project's ADRs have, and does a departure from an accepted ADR come with the ADR that supersedes it? The rule: `wizardingcode-architecture-decision`.",
      "9. Quality attributes, when the spec's Design names a figure (a latency, a load, an availability, a size) or the diff adds a cache, a retry, a timeout or a queue for load: does the change build the mechanism and the figure the Design names? The rule: `wizardingcode-architecture-quality-risk`.",
      "10. Evolution and debt, when the diff runs an old and a new path side by side, deprecates a call, or upgrades the framework's major version: does the change say which path is the old one and what removes it, and does an upgrade follow the framework's own upgrade guide? The row: `{PLUGIN_ROOT}/teams/architects.md`, \"Evolution and debt\".",
      "11. Technology and dependencies, when the diff adds a dependency, a library, a service or a client of a bought service: does the project's framework, or a dependency the project already has, already do the job? The rule: `wizardingcode-architecture-decision`.",
      "12. AI and agents, when the diff adds or changes a call to a model, an agent, a tool an agent calls or a prompt: does the call go through the project's own client or adapter (question 4), and does each agent name the tools it holds? The rule: `wizardingcode-agentic-agents-tools-prompts`.",
    ],
    closing:
      "Questions 7 to 12 are answered only when the diff touches their subject, by the trigger each names; question 7 reads the item's spec, `.crew/work/<id>/spec.md`.",
    defects: [
      "a new style or a new deployable with no case stated, measured or estimated in writing",
      "a departure from an accepted ADR with no ADR that supersedes it",
      "a figure or a mechanism the Design names built otherwise",
      "a new dependency that does what the framework already brings, with no reason stated",
      "an agent that names no tools, or a model called around the project's adapter",
    ],
    advisories: [
      "an old path with nothing named that removes it",
      "a framework upgrade that departs from its upgrade guide",
    ],
  },
};

const expand = (block: Block): Block => {
  const put = (text: string) => text.replaceAll("{PLUGIN_ROOT}", PLUGIN_ROOT);
  return { ...block, questions: block.questions.map(put), closing: put(block.closing) };
};
const BLOCKS: Record<string, Block> = Object.fromEntries(
  Object.entries(TEXTS).map(([name, block]) => [name, expand(block)]),
);

const sentence = (text: string, opening: string, next: string | null) => {
  const from = text.indexOf(opening);
  const to = next === null ? text.indexOf("\n", from) : text.indexOf(next, from);
  return text.slice(from, to === -1 ? undefined : to).trim();
};

const reference = (question: string) => {
  const rule = question.match(/ The rule: `([a-z0-9-]+)`\.$/);
  if (rule) return { kind: "skill", skill: rule[1] };
  const row = question.match(
    / The row: `\$\{CLAUDE_PLUGIN_ROOT\}\/teams\/([a-z-]+)\.md`, "([^"]+)"\.$/,
  );
  if (row) return { kind: "row", team: row[1], row: row[2] };
  return { kind: "none" };
};

for (const [name, block] of Object.entries(BLOCKS)) {
  test(`${block.criterion}: the ${name} rubric asks the definition's further subjects, each with its reference and its defect and advisory clauses`, () => {
    const text = read(RUBRIC(name));
    const lines = text.split("\n");
    const numbered = lines.filter((line) => /^\d+\. /.test(line));
    const first = Number((block.questions[0] ?? "").match(/^(\d+)\./)?.[1]);
    expect(numbered.slice(first - 1)).toEqual(block.questions);
    expect(lines).toContain(block.closing);
    for (const question of block.questions) {
      const ref = reference(question);
      expect({ question: question.slice(0, 40), kind: ref.kind }).not.toEqual({
        question: question.slice(0, 40),
        kind: "none",
      });
      if (ref.kind === "skill")
        expect({
          skill: ref.skill,
          exists: existsSync(join(ROOT, `plugins/core/skills/${ref.skill}/SKILL.md`)),
        }).toEqual({ skill: ref.skill, exists: true });
      if (ref.kind === "row")
        expect({
          row: ref.row,
          declared: read(`plugins/core/teams/${ref.team}.md`).includes(`\n| ${ref.row} |`),
        }).toEqual({ row: ref.row, declared: true });
    }
    const defect = sentence(text, "A **defect**", "An **advisory**");
    const advisory = sentence(text, "An **advisory**", null);
    for (const clause of block.defects)
      expect({ clause, in: defect.includes(clause) }).toEqual({ clause, in: true });
    for (const clause of block.advisories)
      expect({ clause, in: advisory.includes(clause) }).toEqual({ clause, in: true });
    expect(defect.endsWith(`${block.defects.at(-1)}.`)).toBe(true);
    expect(advisory.endsWith(`${block.advisories.at(-1)}.`)).toBe(true);
  });
}

const LEAD_PARAGRAPH =
  "On a spec, each team also validates its further subjects, each only where the request touches it, as its rubric's questions after the gate's own ask them: QA (test-quality 9 to 15): a path that differs end to end names its test through the real flow, an eval its baseline arm, a fuzz run its time bound and its local or test environment; security (security 9 to 12): a dependency added or bumped names its lock file, a new secret its variable's name and where it is held, a hash, a cipher or a signature the primitive it uses, outside text sent to a model or an agent how it is kept as data; architects (architecture 7 to 12): a new style, deployable, dependency or service, and a departure from an accepted ADR, comes with its case measured or estimated in writing and the ADR in the project's own form; ETL (data 7 to 14): the volume the solution is chosen for, measured or estimated in writing, a pipeline's tests and what a re-run on the same input writes, the expected schema of data from outside, a new store's backups and a scheduled deletion's retention; DevOps (infra 7 to 14): a new platform or billed resource carries its case and its cost, measured or estimated in writing, a release names its rollback and its manual steps with who takes them, a new store is inside the backups and a restore rehearses into a test database, a third-party CI step is pinned.";
const FRONTEND_CLAUSE =
  "; the project's kind and primary metric are recorded (`.crew/design-project.json`) and the spec names the kind's playbook it was read against, by `wizardingcode-frontend-strategy`, with each design choice the spec makes carrying the proof label its ground allows";

test("AC-6: the tech lead validates each team's further subjects on a spec, and the frontend's kind, metric and playbook", () => {
  const paragraphs = read("plugins/core/agents/tech-lead.md").split("\n\n");
  const spec = paragraphs.findIndex((p) => p.startsWith("For `spec`:"));
  expect(paragraphs[spec + 1]).toBe(LEAD_PARAGRAPH);
  const frontend = paragraphs.find((p) => p.startsWith("For `frontend`, at the spec:")) ?? "";
  expect(frontend).toContain(`the plan has the capture spec as a task${FRONTEND_CLAUSE}.`);
});

test("AC-14: the QA skills' no-rule sentences name the test-quality rubric's questions that now ask", () => {
  expect(read("plugins/core/skills/wizardingcode-qa-measuring/SKILL.md")).toContain(
    "- Beyond the test-quality rubric's questions 10, 13 and 14, the crew's files hold no rule on properties, fuzzing, flakiness or the suite in CI: the table has none.",
  );
  expect(read("plugins/core/skills/wizardingcode-qa-test-design/SKILL.md")).toContain(
    "The crew's files hold one rule on levels and, beyond the test-quality rubric's questions 11 and 12, none on test doubles or on test data and state, so the table has none for them.",
  );
});
