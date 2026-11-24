// Which tool a ready row of a team's declaration is for, and what in a project shows it. A closed
// table keyed by the row's page: the dependency a manifest declares or the file of a fixed name in
// a target's folder, per stack, in the shape of `tools.ts`' signs and read by its one function. A
// name is written as the engine's readers give it: a Python name normalised, a Go module path
// without its `/vN`. The backend's own table is `TOOLS`; this one is the other eight teams'.

import { join } from "node:path";
import { CORE_STACKS, type Target } from "../types.ts";
import { manifestFacts } from "./frameworks.ts";
import { signsShown, type ToolSigns } from "./tools.ts";

export interface RowTool {
  /** The third cell of the row the entry is for. */
  page: string;
  /** The name the line under the row writes the tool by. */
  name: string;
  stacks: Readonly<Record<string, ToolSigns>>;
}

const LOOKML = { files: ["manifest.lkml"] };
const ATLAS_FILE = ["atlas.hcl"];

/**
 * One entry a ready row, in the declarations' order. Each sign was read on 2026-11-24 on the page
 * named over its entry. Left out, and so never shown: a database of a PHP project (PDO is an
 * extension, and no Composer package shows it); `sqlx` (it may be SQLite's, and features are not
 * read); `@mysql/xdevapi`; `acryl-datahub-cloud` and `@metabase/custom-viz` (no page read says a
 * manifest declares them); Atlas's providers whose pages were not opened; Pact's Rust crate, which
 * stands under dev-dependencies, a table the engine does not read; the files of Apollo's router
 * and of Prisma, whose names their pages do not fix at a target's folder.
 */
export const ROW_TOOLS: readonly RowTool[] = [
  // node-postgres.com, github.com/porsager/postgres, sidorares.github.io/node-mysql2/docs,
  // github.com/planetscale/database-js; psycopg.org (3 and 2), magicstack.github.io/asyncpg,
  // github.com/PyMySQL/mysqlclient, pymysql.readthedocs.io, pypi.org/project/mysql-connector-python;
  // github.com/jackc/pgx, github.com/lib/pq, github.com/go-sql-driver/mysql; docs.rs: tokio-postgres,
  // postgres, mysql.
  {
    page: "https://github.com/planetscale/database-skills",
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
  // clickhouse.com/docs/integrations/language-clients: js, python, go, rust; /docs/chdb/install/python.
  {
    page: "https://github.com/ClickHouse/agent-skills",
    name: "ClickHouse",
    stacks: {
      node: { dependencies: ["@clickhouse/client", "@clickhouse/client-web"] },
      python: { dependencies: ["clickhouse-connect", "chdb"] },
      go: { dependencies: ["github.com/ClickHouse/clickhouse-go"] },
      rust: { dependencies: ["clickhouse"] },
    },
  },
  // prisma.io/docs/orm/overview/introduction/what-is-prisma.
  {
    page: "https://github.com/prisma/skills",
    name: "Prisma",
    stacks: { node: { dependencies: ["prisma", "@prisma/client"] } },
  },
  // docs.datahub.com/docs/cli and /docs/metadata-ingestion/as-a-library.
  {
    page: "https://github.com/datahub-project/datahub-skills",
    name: "DataHub",
    stacks: { python: { dependencies: ["acryl-datahub"] } },
  },
  // metabase.com/docs/latest/embedding/sdk/quickstart.
  {
    page: "https://github.com/metabase/agent-skills",
    name: "Metabase",
    stacks: { node: { dependencies: ["@metabase/embedding-sdk-react"] } },
  },
  // docs.cloud.google.com/looker/docs/api-sdk and /looker/docs/lookml-project-files.
  {
    page: "https://github.com/looker-open-source/looker-skills",
    name: "Looker",
    stacks: {
      php: LOOKML,
      node: { dependencies: ["@looker/sdk"], ...LOOKML },
      python: { dependencies: ["looker-sdk"], ...LOOKML },
      go: LOOKML,
      rust: LOOKML,
    },
  },
  // atlasgo.io/atlas-schema/projects; /guides/orms: doctrine, typeorm, sequelize, sqlalchemy, django, gorm.
  {
    page: "https://atlasgo.io/guides/ai-tools/agent-skills",
    name: "Atlas",
    stacks: {
      php: { dependencies: ["ariga/atlas-provider-doctrine"], files: ATLAS_FILE },
      node: {
        dependencies: [
          "@ariga/atlas-provider-typeorm",
          "@ariga/atlas-provider-sequelize",
          "@ariga/ts-atlas-provider-sequelize",
        ],
        files: ATLAS_FILE,
      },
      python: {
        dependencies: ["atlas-provider-sqlalchemy", "atlas-provider-django"],
        files: ATLAS_FILE,
      },
      go: { dependencies: ["ariga.io/atlas-provider-gorm"], files: ATLAS_FILE },
      rust: { files: ATLAS_FILE },
    },
  },
  // docs.cypress.io/app/get-started/install-cypress, /app/references/configuration, /app/tooling/typescript-support.
  {
    page: "https://github.com/cypress-io/ai-toolkit",
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
  // docs.pact.io/implementation_guides: php, javascript, python, go.
  {
    page: "https://github.com/pactflow/pactflow-agent-skills",
    name: "Pact",
    stacks: {
      php: { dependencies: ["pact-foundation/pact-php"] },
      node: { dependencies: ["@pact-foundation/pact"] },
      python: { dependencies: ["pact-python"] },
      go: { dependencies: ["github.com/pact-foundation/pact-go"] },
    },
  },
  // apollographql.com/docs: apollo-server/getting-started, react/get-started, and using-federation's two setups.
  {
    page: "https://github.com/apollographql/skills",
    name: "Apollo",
    stacks: {
      node: {
        dependencies: ["@apollo/server", "@apollo/client", "@apollo/subgraph", "@apollo/gateway"],
      },
    },
  },
];

const inOrder = (stacks: ReadonlySet<string>) =>
  CORE_STACKS.filter((stack) => stacks.has(stack)).join(", ");

/**
 * The line printed under a ready row read at a page, for a project's targets of the core's stacks:
 * what the row's tool is shown by, that it is not shown, or that nothing can tell, by the first
 * case that holds. It names the tool and the stacks alone, never a name of the project's.
 */
export function rowProjectLine(
  page: string,
  root: string,
  targets: readonly Pick<Target, "path" | "stack">[],
): string {
  const said = (text: string) => `  project: ${text}`;
  const tool = ROW_TOOLS.find((entry) => entry.page === page);
  if (tool === undefined)
    return said("not told, nothing in a manifest or a file shows what this row is for");
  if (targets.length === 0)
    return said("not told, this project has no target of a stack the engine reads");
  const signsOf = (stack: string) =>
    Object.hasOwn(tool.stacks, stack) ? tool.stacks[stack] : undefined;
  const shown = new Set<string>();
  const known = new Set<string>();
  const unknown = new Set<string>();
  for (const target of targets) {
    const signs = signsOf(target.stack);
    if (signs === undefined) {
      unknown.add(target.stack);
      continue;
    }
    known.add(target.stack);
    const dir = join(root, target.path);
    if (signsShown(dir, manifestFacts(dir, target.stack), signs)) shown.add(target.stack);
  }
  if (shown.size > 0) return said(`shows ${tool.name} (${inOrder(shown)})`);
  if (unknown.size === 0) return said(`does not show ${tool.name} (${inOrder(known)})`);
  const tail = known.size > 0 ? `; not shown in ${inOrder(known)}` : "";
  return said(`not told, no sign of ${tool.name} is known for ${inOrder(unknown)}${tail}`);
}
