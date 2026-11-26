import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ROW_TOOLS } from "../src/detect/row-tools.ts";
import { pluginRoot } from "../src/runtimes.ts";
import { cells, LAST_LINE, recordSourcesCommand, sourcesCommand } from "../src/team-sources.ts";
import { cliIo, makeRepo, tempDir, testEnv } from "./helpers.ts";

const ITEM = "2026-11-24-002";
const OTHERS = [
  "security",
  "etl",
  "researchers",
  "qa",
  "architects",
  "devops",
  "agentic-os",
  "frontend",
] as const;
type Team = (typeof OTHERS)[number];
const HEADER = "| Tool or service | Server or skills | Read at | How it is installed |";
const RULE = "| :- | :- | :- | :- |";
const NOT_TOLD =
  "not told: whether this project uses the tool or the service of a held row, and of a ready row save where the line under it says; the heading over a row says when it applies";
const NO_ENTRY = "  project: not told, nothing in a manifest or a file shows what this row is for";
const NO_TARGET = "  project: not told, this project has no target of a stack the engine reads";

const PLANETSCALE = "https://github.com/planetscale/database-skills";
const CLICKHOUSE = "https://github.com/ClickHouse/agent-skills";
const PRISMA = "https://github.com/prisma/skills";
const DATAHUB = "https://github.com/datahub-project/datahub-skills";
const METABASE = "https://github.com/metabase/agent-skills";
const LOOKER = "https://github.com/looker-open-source/looker-skills";
const ATLAS = "https://atlasgo.io/guides/ai-tools/agent-skills";
const CYPRESS = "https://github.com/cypress-io/ai-toolkit";
const PACT = "https://github.com/pactflow/pactflow-agent-skills";
const APOLLO = "https://github.com/apollographql/skills";
/** The two ready rows nothing of a project shows the use of. */
const NO_SIGN = [
  "https://github.com/WizardingCode-io/wizardingcode-mem",
  "https://github.com/mattpocock/skills",
  // 2026-11-26-002: three rows ready since a repository's address is no hosted server.
  "https://github.com/cloudflare/security-audit-skill",
  "https://github.com/datacontract/datacontract-skills",
  "https://github.com/currents-dev/playwright-best-practices-skill",
];

type Signs = { dependencies?: string[]; files?: string[] };
/** The Design's table, as a literal of the test. */
const EXPECTED: { page: string; name: string; stacks: Record<string, Signs> }[] = [
  {
    page: PLANETSCALE,
    name: "MySQL or PostgreSQL",
    stacks: {
      node: { dependencies: ["pg", "postgres", "mysql2", "@planetscale/database"] },
      python: {
        dependencies: [
          "psycopg",
          "psycopg2",
          "psycopg2-binary",
          "asyncpg",
          "mysqlclient",
          "pymysql",
          "mysql-connector-python",
        ],
      },
      go: {
        dependencies: [
          "github.com/jackc/pgx",
          "github.com/lib/pq",
          "github.com/go-sql-driver/mysql",
        ],
      },
      rust: { dependencies: ["tokio-postgres", "postgres", "mysql"] },
    },
  },
  {
    page: CLICKHOUSE,
    name: "ClickHouse",
    stacks: {
      node: { dependencies: ["@clickhouse/client", "@clickhouse/client-web"] },
      python: { dependencies: ["clickhouse-connect", "chdb"] },
      go: { dependencies: ["github.com/ClickHouse/clickhouse-go"] },
      rust: { dependencies: ["clickhouse"] },
    },
  },
  {
    page: PRISMA,
    name: "Prisma",
    stacks: { node: { dependencies: ["prisma", "@prisma/client"] } },
  },
  {
    page: DATAHUB,
    name: "DataHub",
    stacks: { python: { dependencies: ["acryl-datahub"] } },
  },
  {
    page: METABASE,
    name: "Metabase",
    stacks: { node: { dependencies: ["@metabase/embedding-sdk-react"] } },
  },
  {
    page: LOOKER,
    name: "Looker",
    stacks: {
      php: { files: ["manifest.lkml"] },
      node: { dependencies: ["@looker/sdk"], files: ["manifest.lkml"] },
      python: { dependencies: ["looker-sdk"], files: ["manifest.lkml"] },
      go: { files: ["manifest.lkml"] },
      rust: { files: ["manifest.lkml"] },
    },
  },
  {
    page: ATLAS,
    name: "Atlas",
    stacks: {
      php: { dependencies: ["ariga/atlas-provider-doctrine"], files: ["atlas.hcl"] },
      node: {
        dependencies: [
          "@ariga/atlas-provider-typeorm",
          "@ariga/atlas-provider-sequelize",
          "@ariga/ts-atlas-provider-sequelize",
        ],
        files: ["atlas.hcl"],
      },
      python: {
        dependencies: ["atlas-provider-sqlalchemy", "atlas-provider-django"],
        files: ["atlas.hcl"],
      },
      go: { dependencies: ["ariga.io/atlas-provider-gorm"], files: ["atlas.hcl"] },
      rust: { files: ["atlas.hcl"] },
    },
  },
  {
    page: CYPRESS,
    name: "Cypress",
    stacks: {
      node: {
        dependencies: ["cypress"],
        files: [
          "cypress.config.js",
          "cypress.config.ts",
          "cypress.config.mjs",
          "cypress.config.cjs",
          "cypress.config.mts",
          "cypress.config.cts",
        ],
      },
    },
  },
  {
    page: PACT,
    name: "Pact",
    stacks: {
      php: { dependencies: ["pact-foundation/pact-php"] },
      node: { dependencies: ["@pact-foundation/pact"] },
      python: { dependencies: ["pact-python"] },
      go: { dependencies: ["github.com/pact-foundation/pact-go"] },
    },
  },
  {
    page: APOLLO,
    name: "Apollo",
    stacks: {
      node: {
        dependencies: ["@apollo/server", "@apollo/client", "@apollo/subgraph", "@apollo/gateway"],
      },
    },
  },
];
/** The order the Design's line names stacks in: `CORE_STACKS`. */
const ORDER = ["node", "php", "python", "go", "rust"];

const declaration = (...sections: [heading: string, ...rows: string[]][]) =>
  sections
    .map(([heading, ...rows]) => [heading, "", HEADER, RULE, ...rows, ""].join("\n"))
    .join("\n");
const row = (name: string, page: string, last: string, second = "its skills") =>
  `| ${name} | ${second} | ${page} | ${last} |`;
const READY = "`npx skills add a/b`";

/** A plugin root of the test's own: the eight teams' files, each empty of tables but the ones given. */
function ownRoot(given: Partial<Record<Team, string>>): string {
  const root = tempDir("crew-own-root-");
  mkdirSync(join(root, "teams"));
  for (const team of OTHERS)
    writeFileSync(join(root, "teams", `${team}.md`), given[team] ?? "## 3. Nothing\n");
  return root;
}
const form = (root: string, team: string, cwd: string) =>
  sourcesCommand(root, [team], { project: { cwd } }).text.split("\n");
/** The lines printed under the one row read at a page, to the next line that is not indented. */
function under(lines: readonly string[], page: string): string[] {
  const at = lines.findIndex((line) => line.startsWith("| ") && cells(line)[2] === page);
  if (at < 0) throw new Error(`no row at ${page}`);
  const rest = lines.slice(at + 1);
  const end = rest.findIndex((line) => !line.startsWith("  "));
  return end < 0 ? rest : rest.slice(0, end);
}
const projectLine = (lines: readonly string[], page: string) =>
  under(lines, page).filter((line) => line.startsWith("  project: "));

/** A manifest of a stack that declares the names given, as its own detector and reader take it. */
function manifest(stack: string, names: readonly string[]): Record<string, string> {
  const versions = Object.fromEntries(names.map((name) => [name, "1.0.0"]));
  switch (stack) {
    case "node":
      return { "package.json": JSON.stringify({ name: "x", dependencies: versions }) };
    case "php":
      return { "composer.json": JSON.stringify({ name: "x/x", require: versions }) };
    case "python":
      return { "requirements.txt": `${names.map((name) => `${name}==1.0.0`).join("\n")}\n` };
    case "go":
      return {
        "go.mod": `module example.test/x\n\ngo 1.22\n\nrequire (\n${names.map((name) => `\t${name} v1.0.0`).join("\n")}\n)\n`,
      };
    default:
      return {
        "Cargo.toml": `[package]\nname = "x"\nversion = "0.1.0"\n\n[dependencies]\n${names.map((name) => `${name} = "1"`).join("\n")}\n`,
      };
  }
}
const project = (...parts: Record<string, string>[]) =>
  makeRepo(Object.assign({ "README.md": "x\n" }, ...parts));

const QA = declaration(
  [
    "### Installed",
    row("Cypress", CYPRESS, READY),
    row("ClickHouse", CLICKHOUSE, READY),
    row("Databases", PLANETSCALE, READY),
    row("Pact", PACT, READY),
    row("Atlas", ATLAS, READY),
    row("DataHub", DATAHUB, READY),
    row("Nothing shows it", "https://a.test/no-entry", READY),
    row("Held", PRISMA, READY, "a server, hosted"),
  ],
  ["### Held until the building item shows the reading", row("By heading", APOLLO, READY)],
);

test(`${ITEM} AC-1: the table holds the ten entries of the Design, and its pages are the ready rows' but the two that nothing shows`, () => {
  expect(ROW_TOOLS).toEqual(EXPECTED);
  const cwd = project();
  const ready = OTHERS.flatMap((team) => {
    const lines = form(pluginRoot(), team, cwd);
    return lines.flatMap((line, at) =>
      line.startsWith("| ") && lines[at + 1] === "  install: ready" ? [cells(line)[2] ?? ""] : [],
    );
  });
  expect(ready).toHaveLength(15);
  expect(ready.slice().sort()).toEqual([...EXPECTED.map((entry) => entry.page), ...NO_SIGN].sort());
});

test(`${ITEM} AC-6: the line under a ready row, by the first of its five cases that holds`, () => {
  const root = ownRoot({ qa: QA });
  const of = (cwd: string) => form(root, "qa", cwd);
  // No target of the five stacks: a page with no entry is said first, then the project.
  const none = of(project());
  expect(projectLine(none, "https://a.test/no-entry")).toEqual([NO_ENTRY]);
  expect(projectLine(none, CYPRESS)).toEqual([NO_TARGET]);
  expect(projectLine(none, DATAHUB)).toEqual([NO_TARGET]);
  // One stack: shown by a dependency, not shown, and a tool with no sign for the stack.
  const node = of(project(manifest("node", ["left-pad", "cypress"])));
  expect(projectLine(node, CYPRESS)).toEqual(["  project: shows Cypress (node)"]);
  expect(projectLine(node, CLICKHOUSE)).toEqual(["  project: does not show ClickHouse (node)"]);
  expect(projectLine(node, DATAHUB)).toEqual([
    "  project: not told, no sign of DataHub is known for node",
  ]);
  expect(projectLine(node, "https://a.test/no-entry")).toEqual([NO_ENTRY]);
  // Shown by a file of a fixed name, with no dependency; a file of another name shows nothing.
  const byFile = of(
    project(manifest("node", []), { "cypress.config.mts": "export default {};\n" }),
  );
  expect(projectLine(byFile, CYPRESS)).toEqual(["  project: shows Cypress (node)"]);
  const otherFile = of(project(manifest("node", []), { "cypress.config.json": "{}\n" }));
  expect(projectLine(otherFile, CYPRESS)).toEqual(["  project: does not show Cypress (node)"]);
  // A file in a subfolder that is no target, and a link of the name, show nothing.
  const linked = project(manifest("node", []), { "sub/atlas.hcl": "x\n", "real.hcl": "x\n" });
  symlinkSync(join(linked, "real.hcl"), join(linked, "atlas.hcl"));
  expect(projectLine(of(linked), ATLAS)).toEqual(["  project: does not show Atlas (node)"]);
  // Two stacks at once, php's manifest at the root and node's in two folders under it, so php is the first target found: the core's order, each stack once.
  const both = of(
    project(manifest("php", ["pact-foundation/pact-php"]), {
      "web/package.json": JSON.stringify({
        name: "web",
        dependencies: { "@pact-foundation/pact": "1" },
      }),
      "api/package.json": JSON.stringify({
        name: "api",
        dependencies: { "@pact-foundation/pact": "1" },
      }),
    }),
  );
  expect(projectLine(both, PACT)).toEqual(["  project: shows Pact (node, php)"]);
  // Only php shows it: the stack that shows is the one named.
  const phpOnly = of(
    project(manifest("php", ["pact-foundation/pact-php"]), manifest("node", ["left-pad"])),
  );
  expect(projectLine(phpOnly, PACT)).toEqual(["  project: shows Pact (php)"]);
  // A stack that shows the tool decides before a stack that holds no sign of it.
  const mixed = of(project(manifest("node", ["cypress"]), manifest("php", [])));
  expect(projectLine(mixed, CYPRESS)).toEqual(["  project: shows Cypress (node)"]);
  // Three stacks, one with no sign: both lists of the last case are in the core's order.
  const three = of(
    project(
      manifest("php", []),
      { "py/requirements.txt": "left-pad\n" },
      {
        "web/package.json": JSON.stringify({ name: "web" }),
      },
    ),
  );
  expect(projectLine(three, CLICKHOUSE)).toEqual([
    "  project: not told, no sign of ClickHouse is known for php; not shown in node, python",
  ]);
  expect(projectLine(three, DATAHUB)).toEqual([
    "  project: not told, no sign of DataHub is known for node, php; not shown in python",
  ]);
  // Not shown where every stack of the project holds signs, in the core's order.
  expect(projectLine(both, ATLAS)).toEqual(["  project: does not show Atlas (node, php)"]);
  // No sign for one of the project's stacks, with a stack that holds signs and without one.
  expect(projectLine(both, CLICKHOUSE)).toEqual([
    "  project: not told, no sign of ClickHouse is known for php; not shown in node",
  ]);
  expect(projectLine(both, DATAHUB)).toEqual([
    "  project: not told, no sign of DataHub is known for node, php",
  ]);
  expect(projectLine(both, CYPRESS)).toEqual([
    "  project: not told, no sign of Cypress is known for php; not shown in node",
  ]);
  // A stack the project lacks holds the sign: nothing is shown by it.
  const python = of(
    project({ "requirements.txt": "PyMySQL[rsa]==1.1\nClickHouse_Connect>=0.7\nleft-pad\n" }),
  );
  expect(projectLine(python, PLANETSCALE)).toEqual([
    "  project: shows MySQL or PostgreSQL (python)",
  ]);
  expect(projectLine(python, CLICKHOUSE)).toEqual(["  project: shows ClickHouse (python)"]);
  expect(projectLine(python, CYPRESS)).toEqual([
    "  project: not told, no sign of Cypress is known for python",
  ]);
  const go = of(project(manifest("go", ["github.com/jackc/pgx/v5"])));
  expect(projectLine(go, PLANETSCALE)).toEqual(["  project: shows MySQL or PostgreSQL (go)"]);
  // A target in a subfolder is read in its own folder: its manifest and its file, not the root's.
  const nested = of(
    project({
      "app/package.json": JSON.stringify({ name: "app", dependencies: { cypress: "1" } }),
      "app/atlas.hcl": "x\n",
    }),
  );
  expect(projectLine(nested, CYPRESS)).toEqual(["  project: shows Cypress (node)"]);
  expect(projectLine(nested, ATLAS)).toEqual(["  project: shows Atlas (node)"]);
  // The line is the last under its row; a held row has none; nothing else of the form moves.
  for (const lines of [none, node, both, python]) {
    expect(under(lines, CYPRESS).at(-1)?.startsWith("  project: ")).toBe(true);
    expect(under(lines, PRISMA)).toEqual([
      "  install: held, hosted, so what a session asks leaves the machine",
      // 2026-11-26-001: a hosted row a consent would lift says how the consent is given.
      `    a person's consent for this project lifts this hold: crew sources qa --consented ${PRISMA}`,
    ]);
    expect(under(lines, APOLLO)).toEqual([
      "  install: held, its table is left out or held by the definition",
    ]);
    expect(lines.filter((line) => !line.startsWith("  project: "))).toEqual(
      none.filter((line) => !line.startsWith("  project: ")),
    );
    expect(lines.filter((line) => line.startsWith("  project: "))).toHaveLength(7);
    expect(lines.slice(-3)).toEqual(["ready: 7 rows; held: 2 rows", NOT_TOLD, LAST_LINE]);
  }
});

test(`${ITEM} AC-7: each of the ten entries is shown under its real row by its first dependency of each stack, Looker and Atlas by their file, and not shown by an empty manifest`, () => {
  const teamOf = (page: string) => {
    const cwd = project();
    const team = OTHERS.find((name) =>
      form(pluginRoot(), name, cwd).some(
        (line, at, lines) =>
          line.startsWith("| ") && cells(line)[2] === page && lines[at + 1] === "  install: ready",
      ),
    );
    if (!team) throw new Error(`no ready row at ${page}`);
    return team;
  };
  for (const entry of EXPECTED) {
    const team = teamOf(entry.page);
    const withDependency = ORDER.filter((stack) => entry.stacks[stack]?.dependencies?.length);
    const shown = project(
      ...withDependency.map((stack) =>
        manifest(stack, [entry.stacks[stack]?.dependencies?.[0] ?? ""]),
      ),
    );
    expect({
      page: entry.page,
      is: projectLine(form(pluginRoot(), team, shown), entry.page),
    }).toEqual({
      page: entry.page,
      is: [`  project: shows ${entry.name} (${withDependency.join(", ")})`],
    });
    const [first = ""] = ORDER.filter((stack) => entry.stacks[stack]);
    const empty = project(manifest(first, []));
    expect({
      page: entry.page,
      is: projectLine(form(pluginRoot(), team, empty), entry.page),
    }).toEqual({
      page: entry.page,
      is: [`  project: does not show ${entry.name} (${first})`],
    });
  }
  // A stack with no dependency of the entry, and the entry's file in the target's folder.
  const looker = project(manifest("php", []), { "manifest.lkml": 'project_name: "x"\n' });
  expect(projectLine(form(pluginRoot(), "etl", looker), LOOKER)).toEqual([
    "  project: shows Looker (php)",
  ]);
  const atlas = project(manifest("rust", []), { "atlas.hcl": 'env "x" {}\n' });
  expect(projectLine(form(pluginRoot(), "etl", atlas), ATLAS)).toEqual([
    "  project: shows Atlas (rust)",
  ]);
  // The line follows a recorded decision's line as it follows ready.
  const cypress = project(manifest("node", ["cypress"]));
  expect(under(form(pluginRoot(), "qa", cypress), CYPRESS).at(0)).toBe("  install: ready");
  expect(
    recordSourcesCommand(
      pluginRoot(),
      ["qa"],
      { declined: CYPRESS },
      cypress,
      "2026-11-24T12:00:00.000Z",
    ).code,
  ).toBe(0);
  expect(under(form(pluginRoot(), "qa", cypress), CYPRESS)).toEqual([
    "  install: declined, recorded on 2026-11-24",
    "  project: shows Cypress (node)",
  ]);
});

test(`${ITEM} AC-8: the form's not told line, the reference's bullet and the ADR's amendment say what the line under a ready row is`, async () => {
  const qa = await cliIo(project(), testEnv())("sources", "qa", "--project");
  expect(qa.out.trimEnd().split("\n").slice(-2)).toEqual([NOT_TOLD, LAST_LINE]);
  const reference = readFileSync(
    join(pluginRoot(), "skills", "crew", "references", "understand.md"),
    "utf8",
  )
    .split("\n")
    .filter((line) => line.includes("crew sources"));
  expect(reference).toHaveLength(1);
  expect(reference[0]).toContain(
    "For another team, crew sources <team> --project prints every row of its install tables with its state, and under a ready row whether the project's manifests and files show its tool; present a ready row the project does not show only where the person asked for it. The record takes any team: crew sources <team> --installed <page> and --declined <page>.",
  );
  expect(reference[0]).not.toContain("tells nothing of whether the project uses a row's tool");
  const adr = readFileSync(
    join(
      import.meta.dir,
      "..",
      "..",
      "..",
      "docs",
      "adr",
      "0025-the-session-installs-a-row-at-the-persons-yes.md",
    ),
    "utf8",
  );
  const parts = adr.split("\n## Amendment of 2026-11-24 (item 2026-11-24-002)\n");
  expect(parts).toHaveLength(2);
  // 2026-11-26-001: this amendment runs to the next item's heading and to no other.
  const later = (parts[1] ?? "").split("\n## ").slice(1);
  expect(later.map((part) => part.split("\n")[0])).toEqual([
    "Amendment of 2026-11-26 (item 2026-11-26-001)",
    "Amendment of 2026-11-26 (item 2026-11-26-002)",
  ]);
  for (const phrase of [
    "under a ready row",
    "a held row is not marked",
    "does not show",
    "no proof",
    "dev-dependencies",
    "manifest.lkml",
  ])
    expect(parts[1], phrase).toContain(phrase);
});

test(`${ITEM}: the place refusal stands for a team other than the backend (owed by item 2026-11-24-001; no criterion of its own)`, () => {
  const cwd = project();
  writeFileSync(join(cwd, ".crew"), "a file where a folder is expected\n");
  const root = ownRoot({ qa: QA });
  expect(
    recordSourcesCommand(root, ["qa"], { installed: CYPRESS }, cwd, "2026-11-24T12:00:00.000Z"),
  ).toEqual({ code: 1, text: "not recorded: .crew/local is not a folder of this project" });
});
