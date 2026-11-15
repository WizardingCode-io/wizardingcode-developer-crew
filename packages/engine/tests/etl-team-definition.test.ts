import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const DEFINITION = new URL("../../../docs/specs/2026-11-15-etl-team-design.md", import.meta.url);

const SUBJECTS = [
  "Schema and migrations",
  "Queries and ORM use",
  "Transactions",
  "Indexes",
  "Availability of the data while the change runs",
  "Pipelines",
  "Data quality and validation",
  "Imports, exports and file formats",
  "Integrations and synchronisation between systems",
  "Backups, restore and retention",
  "Data warehouse and analytics",
  "Sizing the solution to the volume",
  "Documentation, catalogue and lineage of the data",
];

const BACKUPS = "Backups and restore";
const VOLUME = "Volume and measuring";
const KINDS = [
  "Migrations and schema",
  "Queries and indexes",
  "Data quality",
  "Pipelines and load",
  BACKUPS,
  VOLUME,
  "Documentation, catalogue and lineage",
];

const OWN_SKILLS = [
  "Data quality monitor",
  "Pipeline generator",
  "Documentation and data dictionary generator",
  "Query optimiser",
  "Lineage tracer",
  "Data test generator",
  "Source schema evolution handler",
  "Performance measuring",
  "Data catalogue",
  "pandas and Polars",
  "Sizing to the volume",
];

const MARK = " (not opened)";
const CONFLUENT = "https://docs.confluent.io/cloud/current/ai/ai-tools/managed-mcp-server.html";
const LOOKER = "https://docs.cloud.google.com/looker/docs/mcp";
/** The pages that were not read on 2026-11-15. */
const NOT_OPENED = [
  "https://eur-lex.europa.eu/eli/reg/2016/679/oj",
  "https://www.oreilly.com/library/view/fundamentals-of-data/9781098108298/",
  "https://www.iso.org/standard/81745.html",
  "https://www.iso.org/standard/35736.html",
  "https://duckdb.org/docs/stable/data/csv/overview",
  "https://duckdb.org/docs/stable/data/parquet/overview",
  CONFLUENT,
  LOOKER,
];

const ENVIRONMENT = "the project's own local or test environment";
const MEASURED = "measured or estimated in writing";
const MURRAY = "`data-engineering-skills`";
const EXCEPTION = "the one exception to rule 1";
const TECHNOLOGIES = [
  "Apache Iceberg",
  "Apache Paimon",
  "Apache Fluss",
  "Apache Flink",
  "Flink Agents",
  "Apache Iggy",
  "Lance",
  "Firn",
];
const MOZILLA = "Mozilla's `bigquery-etl-skills`";
const NOT_INSTALLED = "not installed";
const PANDAS = "The `pandas-expert` file";
const NO_LICENCE = "no licence";
const LAST_HEADING = "## 6. What the code needs, not decided here";

/** A row of section 5: words of its second cell and the whole text of its "Read at" cell. */
const SERVERS: [string, string][] = [
  ["Supabase's `postgres-best-practices` skills", "https://github.com/supabase/agent-skills"],
  ["PlanetScale's `database-skills`", "https://github.com/planetscale/database-skills"],
  ["The MongoDB MCP Server", "https://github.com/mongodb-js/mongodb-mcp-server"],
  ["MongoDB's skills and plugin", "https://github.com/mongodb/agent-skills"],
  ["The Redis MCP Server", "https://github.com/redis/mcp-redis"],
  ["Redis's skills", "https://github.com/redis/agent-skills"],
  ["`mcp-clickhouse`", "https://github.com/ClickHouse/mcp-clickhouse"],
  ["The ClickHouse Cloud server", "https://clickhouse.com/docs/use-cases/AI/MCP/remote_mcp"],
  ["ClickHouse's skills", "https://github.com/ClickHouse/agent-skills"],
  ["`mcp-server-motherduck`", "https://github.com/motherduckdb/mcp-server-motherduck"],
  [
    "MotherDuck's hosted server",
    "https://motherduck.com/docs/key-tasks/ai-and-motherduck/mcp-workflows/mcp-setup/",
  ],
  ["DuckDB's skills", "https://github.com/duckdb/duckdb-skills"],
  ["The `mariadb-shell` server", "https://github.com/mariadb-corporation/ai-plugins"],
  ["BigQuery's remote server", "https://docs.cloud.google.com/bigquery/docs/use-bigquery-mcp"],
  ["Google's MCP Toolbox for Databases", "https://github.com/googleapis/genai-toolbox"],
  [
    "The Snowflake-managed server",
    "https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp",
  ],
  ["AWS Labs' servers", "https://github.com/awslabs/mcp"],
  [
    "The Azure MCP Server",
    "https://learn.microsoft.com/en-us/azure/developer/azure-mcp-server/tools/",
  ],
  [
    "The SQL MCP Server of Data API builder",
    "https://learn.microsoft.com/en-us/azure/data-api-builder/mcp/overview",
  ],
  ["The Cosmos DB MCP Toolkit", "https://github.com/AzureCosmosDB/MCPToolKit"],
  ["Supabase's server", "https://supabase.com/docs/guides/getting-started/mcp"],
  ["Supabase's plugin of skills", "https://github.com/supabase/agent-skills"],
  ["Neon's server", "https://github.com/neondatabase/mcp-server-neon"],
  ["Neon's skills", "https://github.com/neondatabase/agent-skills"],
  ["PlanetScale's server", "https://planetscale.com/docs/connect/mcp"],
  ["Tiger MCP", "https://github.com/timescale/tiger-cli"],
  ["pg-aiguide: PostgreSQL skills", "https://github.com/timescale/pg-aiguide"],
  [
    "The CockroachDB Cloud server",
    "https://docs.cockroachlabs.com/docs/cockroachcloud/connect-to-the-cockroachdb-cloud-mcp-server",
  ],
  ["`cockroachdb-mcp-server`", "https://github.com/cockroachdb/cockroachdb-mcp-server"],
  ["CockroachDB's plugin for Claude Code", "https://github.com/cockroachdb/claude-plugin"],
  ["pganalyze's server", "https://pganalyze.com/docs/mcp"],
  ["Prisma's server", "https://www.prisma.io/docs/postgres/integrations/mcp-server"],
  ["Prisma's skills", "https://github.com/prisma/skills"],
  ["`dbt-mcp`", "https://github.com/dbt-labs/dbt-mcp"],
  ["dbt's skills", "https://github.com/dbt-labs/dbt-agent-skills"],
  ["`astro-airflow-mcp`", "https://github.com/astronomer/agents/tree/main/astro-airflow-mcp"],
  ["The Dagster+ MCP server", "https://dagster.io/docs/getting-started/ai-tools/dagster-mcp"],
  ["Dagster's skills", "https://github.com/dagster-io/skills"],
  ["`prefect-mcp-server`", "https://github.com/PrefectHQ/prefect-mcp-server"],
  ["`temporal-mcp`", "https://github.com/temporalio/temporal-mcp"],
  ["Temporal's plugin of skills", "https://github.com/temporalio/claude-temporal-plugin"],
  ["The dltHub AI Harness", "https://github.com/dlt-hub/dlthub-ai-harness"],
  ["The Airbyte MCP server", "https://docs.airbyte.com/platform/airbyte-mcp/install"],
  ["Airbyte's skills", "https://github.com/airbytehq/airbyte-agent-sdk"],
  [
    "The Meltano MCP server",
    "https://github.com/meltano/meltano/tree/main/docs/docs/meltano-ai/meltano-mcp",
  ],
  ["Meltano's skills", "https://github.com/meltano/agent-skills"],
  ["Soda's plugin", "https://github.com/sodadata/soda-agentic-tools"],
  ["`mcp-confluent`", "https://github.com/confluentinc/mcp-confluent"],
  ["Confluent's managed server", `${CONFLUENT}${MARK}`],
  ["Confluent's skills", "https://github.com/confluentinc/agent-skills"],
  ["`mcp-server-datahub`", "https://github.com/acryldata/mcp-server-datahub"],
  ["DataHub's skills", "https://github.com/datahub-project/datahub-skills"],
  ["OpenMetadata's server", "https://docs.open-metadata.org/latest/how-to-guides/mcp/claude-code"],
  ["Metabase's server", "https://www.metabase.com/docs/latest/ai/mcp"],
  ["Metabase's skills", "https://github.com/metabase/agent-skills"],
  [
    "Superset's MCP service",
    "https://superset.apache.org/user-docs/using-superset/using-ai-with-superset/",
  ],
  ["Preset's hosted gateway", "https://github.com/preset-io/agent-skills"],
  [
    "The Power BI Authoring MCP server",
    "https://learn.microsoft.com/power-bi/developer/mcp/power-bi-authoring-mcp",
  ],
  ["Microsoft's `skills-for-fabric`", "https://github.com/microsoft/skills-for-fabric"],
  ["The Looker-managed server", `${LOOKER}${MARK}`],
  [
    "Looker through MCP Toolbox",
    "https://docs.cloud.google.com/looker/docs/connect-ide-to-looker-using-mcp-toolbox",
  ],
  ["Looker's skills", "https://github.com/looker-open-source/looker-skills"],
  [
    "Databricks' managed servers",
    "https://docs.databricks.com/aws/en/generative-ai/mcp/managed-mcp",
  ],
  ["Databricks' skills", "https://github.com/databricks/databricks-agent-skills"],
  ["`mcp-k6`", "https://github.com/grafana/mcp-k6"],
  [
    "Great Expectations' skills",
    "https://docs.greatexpectations.io/docs/core/set_up_a_gx_environment/install_agent_skills",
  ],
  ["Atlas's skills", "https://atlasgo.io/guides/ai-tools/agent-skills"],
  ["datacontract-cli's skills", "https://github.com/datacontract/datacontract-skills"],
  [MURRAY, "https://github.com/gordonmurray/data-engineering-skills"],
  [MOZILLA, "https://github.com/mozilla/bigquery-etl-skills"],
  [PANDAS, "https://github.com/Dlaby23/claude-agents-ultimate-collection"],
];

/** The text of one `## ` section, from its heading to the next; empty when the heading is absent. */
function section(text: string, number: number): string {
  const parts = text.split(/\n(?=## )/);
  return parts.find((part) => part.startsWith(`## ${number}. `)) ?? "";
}

/** The cells of one table line. */
function cells(line: string): string[] {
  return line
    .slice(1, line.endsWith("|") ? -1 : undefined)
    .split("|")
    .map((cell) => cell.trim());
}

const isRow = (line: string) => line.startsWith("| ") && !line.startsWith("| :-");

/** The rows of a section's tables, each as its cells, the rule under a header left out. */
function rows(part: string): string[][] {
  return part.split("\n").filter(isRow).map(cells);
}

/**
 * Every clause of the ETL team's definition the text fails, by name; empty when it holds all.
 * It reads the document by section and by table row, so a name inside a longer cell, a URL on
 * another row or a row written twice does not pass. Section 5 holds tables of two shapes: a row
 * of four cells is a server or a set of skills, a row of two is one of the team's own skills.
 */
function definitionGaps(document: string): string[] {
  const gaps: string[] = [];
  const sources = rows(section(document, 3));
  const tools = rows(section(document, 4));
  const five = rows(section(document, 5));
  const servers = five.filter((row) => row.length === 4);
  const own = five.filter((row) => row.length === 2);
  for (const subject of SUBJECTS)
    if (sources.filter((row) => row[0] === subject).length !== 1)
      gaps.push(`subject row: ${subject}`);
  for (const kind of KINDS)
    if (tools.filter((row) => row[0] === kind).length !== 1) gaps.push(`kind row: ${kind}`);
  const rowsOf = (words: string) => servers.filter((row) => row[1]?.includes(words));
  for (const [words, readAt] of SERVERS) {
    const found = rowsOf(words);
    if (found.length !== 1 || found[0]?.[2] !== readAt) gaps.push(`server url: ${words}`);
  }
  for (const skill of OWN_SKILLS)
    if (own.filter((row) => row[0] === skill).length !== 1) gaps.push(`own skill: ${skill}`);
  for (const url of NOT_OPENED) {
    const after = document.split(url).slice(1);
    if (after.length === 0 || after.some((rest) => !rest.startsWith(MARK)))
      gaps.push(`not opened: ${url}`);
  }
  const toolsOf = (kind: string) => tools.find((row) => row[0] === kind)?.[1] ?? "";
  for (const kind of [BACKUPS, VOLUME])
    if (!toolsOf(kind).includes(ENVIRONMENT)) gaps.push(`own environment: ${kind}`);
  if (!toolsOf(VOLUME).includes(MEASURED)) gaps.push("measured volume");
  const second = (words: string) => rowsOf(words)[0]?.[1] ?? "";
  if (!second(MURRAY).includes(EXCEPTION)) gaps.push("links: exception");
  for (const technology of TECHNOLOGIES)
    if (!second(MURRAY).includes(technology)) gaps.push(`links: ${technology}`);
  if (!second(MOZILLA).includes(NOT_INSTALLED)) gaps.push("links: not installed");
  if (!second(PANDAS).includes(NO_LICENCE)) gaps.push("links: no licence");
  const headings = document.split("\n").filter((line) => line.startsWith("## "));
  if (headings.at(-1) !== LAST_HEADING) gaps.push("last section");
  return gaps;
}

/** An absent document reads as empty text, so every test is registered and fails by name. */
const text = existsSync(DEFINITION) ? readFileSync(DEFINITION, "utf8") : "";

/** The text with the one table row of section `number` that `picks` chooses changed by `change`. */
function withLine(
  number: number,
  what: string,
  picks: (line: string) => boolean,
  change: (line: string) => string,
): string {
  const part = section(text, number);
  const line = part.split("\n").find((l) => isRow(l) && picks(l));
  if (line === undefined) throw new Error(`no row holds ${what} in section ${number}`);
  const changed = part.replace(line, () => change(line));
  return text.replace(part, () => changed);
}

/** The row of section `number` whose first cell is `name`, changed. */
const withRow = (number: number, name: string, change: (line: string) => string) =>
  withLine(number, name, (line) => cells(line)[0] === name, change);

/** The row of section 5 whose second cell holds `words`, changed. */
const withServer = (words: string, change: (line: string) => string) =>
  withLine(
    5,
    words,
    (line) => rows(line).some((row) => row.length === 4 && row[1]?.includes(words)),
    change,
  );

const twice = (line: string) => `${line}\n${line}`;

test("2026-11-15-002 AC-1: the ETL team's definition holds every clause", () => {
  expect(definitionGaps(text)).toEqual([]);
});

test("2026-11-15-002 AC-1: a subject, a kind or an own skill whose row leaves its table is named", () => {
  for (const subject of SUBJECTS)
    expect(definitionGaps(withRow(3, subject, () => "")), subject).toContain(
      `subject row: ${subject}`,
    );
  for (const kind of KINDS)
    expect(definitionGaps(withRow(4, kind, () => "")), kind).toContain(`kind row: ${kind}`);
  for (const skill of OWN_SKILLS)
    expect(definitionGaps(withRow(5, skill, () => "")), skill).toContain(`own skill: ${skill}`);
});

test("2026-11-15-002 AC-1: a subject, a kind or an own skill whose row stands twice is named", () => {
  for (const subject of SUBJECTS)
    expect(definitionGaps(withRow(3, subject, twice)), subject).toContain(
      `subject row: ${subject}`,
    );
  for (const kind of KINDS)
    expect(definitionGaps(withRow(4, kind, twice)), kind).toContain(`kind row: ${kind}`);
  for (const skill of OWN_SKILLS)
    expect(definitionGaps(withRow(5, skill, twice)), skill).toContain(`own skill: ${skill}`);
});

test("2026-11-15-002 AC-1: a name left only inside a longer first cell has no row", () => {
  const longer = (number: number, name: string, more: string) =>
    withRow(number, name, (line) => line.replace(`| ${name} |`, `| ${name} ${more} |`));
  expect(definitionGaps(longer(3, "Indexes", "and statistics"))).toContain("subject row: Indexes");
  expect(definitionGaps(longer(4, "Data quality", "and validation"))).toContain(
    "kind row: Data quality",
  );
  expect(definitionGaps(longer(5, "Query optimiser", "and planner"))).toContain(
    "own skill: Query optimiser",
  );
});

test("2026-11-15-002 AC-1: a server or a set of skills whose URL leaves its own row is named, also when the URL stands on another row", () => {
  for (const [words, readAt] of SERVERS) {
    const gap = `server url: ${words}`;
    const gone = withServer(words, (line) => line.replace(`| ${readAt} |`, "| |"));
    expect(definitionGaps(gone), words).toContain(gap);
    const moved = withServer(
      words,
      (line) => `${line.replace(`| ${readAt} |`, "| |")}\n| x | another row | ${readAt} | |`,
    );
    expect(definitionGaps(moved), `${words} moved`).toContain(gap);
  }
});

test("2026-11-15-002 AC-1: a server or a set of skills whose words pick two rows is named", () => {
  for (const [words] of SERVERS)
    expect(definitionGaps(withServer(words, twice)), words).toContain(`server url: ${words}`);
});

test("2026-11-15-002 AC-1: a page not read that loses its mark, or leaves the document, is named", () => {
  expect(text).not.toBe("");
  for (const url of NOT_OPENED) {
    const gap = `not opened: ${url}`;
    expect(definitionGaps(text.replace(`${url}${MARK}`, url)), url).toContain(gap);
    expect(definitionGaps(text.replaceAll(`${url}${MARK}`, "")), `${url} gone`).toContain(gap);
  }
});

test("2026-11-15-002 AC-1: a bare copy of a page not read is named while its first place keeps its mark", () => {
  for (const url of NOT_OPENED) {
    const marked = `${url}${MARK}`;
    const first = text.indexOf(marked);
    expect(first, url).toBeGreaterThan(0);
    const changed = `${text}\nSee also ${url} for more.\n`;
    expect(changed.indexOf(marked), url).toBe(first);
    expect(definitionGaps(changed), url).toContain(`not opened: ${url}`);
  }
});

test("2026-11-15-002 AC-1: the project's own environment off the row of backups or of volume is named", () => {
  for (const kind of [BACKUPS, VOLUME]) {
    const changed = withRow(4, kind, (line) => line.replace(ENVIRONMENT, "a test environment"));
    expect(definitionGaps(changed), kind).toContain(`own environment: ${kind}`);
  }
});

test("2026-11-15-002 AC-1: the row of volume without the measured or written volume is named", () => {
  const changed = withRow(4, VOLUME, (line) => line.replace(MEASURED, "known"));
  expect(definitionGaps(changed)).toContain("measured volume");
});

test("2026-11-15-002 AC-1: the words that say how each of the user's three links is used, off its row, are named", () => {
  const off = (words: string, phrase: string) =>
    definitionGaps(withServer(words, (line) => line.replace(phrase, "something else")));
  expect(off(MURRAY, EXCEPTION)).toContain("links: exception");
  for (const technology of TECHNOLOGIES)
    expect(off(MURRAY, technology), technology).toContain(`links: ${technology}`);
  expect(off(MOZILLA, NOT_INSTALLED)).toContain("links: not installed");
  expect(off(PANDAS, NO_LICENCE)).toContain("links: no licence");
});

test("2026-11-15-002 AC-1: a section after the one on what the code needs is named", () => {
  expect(text).not.toBe("");
  expect(definitionGaps(`${text}\n## 7. More\n\nMore.\n`)).toContain("last section");
});
