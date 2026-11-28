import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pluginRoot } from "../src/runtimes.ts";
import { readSourcesRecord } from "../src/sources-record.ts";
import {
  declarationSections,
  INSTALL_FORMS,
  installLines,
  READING_SERVERS,
  type RowInstall,
  recordSourcesCommand,
  rowInstall,
  SERVER_FORMS,
  sourcesCommand,
} from "../src/team-sources.ts";
import { makeRepo } from "./helpers.ts";

const ITEM = "2026-11-26-005";
const NO_FORM = "its line is not one of the engine's install forms";
const TOKEN = "its line takes a value of the machine, a token or a key";
const NOT_READING = "its server is not one the declarations show to only read";
const HOSTED = "hosted, so what a session asks leaves the machine";
const LOCAL =
  "adds a hosted server to the person's Claude Code for this project alone, in their `~/.claude.json`";
const PROJECT =
  "adds a hosted server to the project's `.mcp.json`, a file that a commit shares with everyone who opens the project";
const USER =
  "adds a hosted server to the person's Claude Code for every project of theirs, in their `~/.claude.json`";
const READS = "https://mcp.clickhouse.cloud/mcp";
const cellsOf = (line: string, second = "a server, hosted") => [
  "A server",
  second,
  "https://a.test/page",
  `\`${line}\``,
];
const lifted = (line: string) => rowInstall(cellsOf(line), new Set(), true);
const ready = (note: string): RowInstall => ({
  state: "ready",
  forms: [{ form: "claude mcp add", note }],
});
const held = (reason: string): RowInstall => ({ state: "held", reason });

test(`${ITEM} AC-8: a line that adds a hosted server by its address alone is ready, with the note of its scope`, () => {
  const cases: [string, string][] = [
    [`claude mcp add --transport http x ${READS}`, LOCAL],
    [`claude mcp add -t http x ${READS}`, LOCAL],
    [`claude mcp add x ${READS} --transport http`, LOCAL],
    [`claude mcp add x ${READS} -t http`, LOCAL],
    [`claude mcp add --transport http --scope local x ${READS}`, LOCAL],
    [`claude mcp add --scope local --transport http x ${READS}`, LOCAL],
    [`claude mcp add --transport http -s project x ${READS}`, PROJECT],
    [`claude mcp add --transport http x ${READS} -s project`, PROJECT],
    [`claude mcp add --transport http --scope user x ${READS}`, USER],
    [`claude mcp add x ${READS} --scope user --transport http`, USER],
    [`claude mcp add --transport http x_Y-9 ${READS}`, LOCAL],
    [`claude mcp add x --transport http ${READS}`, LOCAL],
    [`claude mcp add x -t http ${READS}`, LOCAL],
    [`claude mcp add x --scope project --transport http ${READS}`, PROJECT],
    [`claude mcp add --transport http x -s user ${READS}`, USER],
    [`claude mcp add -s local x ${READS} -t http`, LOCAL],
  ];
  for (const [line, note] of cases) expect([line, lifted(line)]).toEqual([line, ready(note)]);
  const printed = (note: string) => ["  install: ready", `    claude mcp add: ${note}`];
  expect(installLines(lifted(`claude mcp add --transport http x ${READS}`))).toEqual(
    printed(LOCAL),
  );
  expect(installLines(lifted(`claude mcp add -s project -t http x ${READS}`))).toEqual(
    printed(PROJECT),
  );
  expect(installLines(lifted(`claude mcp add -s user -t http x ${READS}`))).toEqual(printed(USER));
  expect(SERVER_FORMS.map(({ form, note }) => [form, note])).toEqual([
    ["claude mcp add", LOCAL],
    ["claude mcp add", PROJECT],
    ["claude mcp add", USER],
  ]);
  expect(INSTALL_FORMS.some(({ form }) => form.startsWith("claude mcp"))).toBe(false);
});

test(`${ITEM} AC-9: every other claude mcp add line stays no form, and a value stays a value`, () => {
  const noForm = [
    `claude mcp add x ${READS}`,
    `claude mcp add --transport sse x ${READS}`,
    `claude mcp add --transport stdio x ${READS}`,
    `claude mcp add --transport http --transport http x ${READS}`,
    `claude mcp add --transport http -t http x ${READS}`,
    `claude mcp add --transport http --scope local -s user x ${READS}`,
    `claude mcp add --transport http --scope global x ${READS}`,
    `claude mcp add --transport=http x ${READS}`,
    `claude mcp add --transport http x ${READS} -- npx y`,
    `claude mcp add --transport http x ${READS} --`,
    `claude mcp add x ${READS} --transport`,
    `claude mcp add --transport http x ${READS} --scope`,
    `claude mcp add --transport http x ${READS} `,
    `claude mcp add --transport http x ${READS} -s`,
    `claude mcp add --transport http --client-id a x ${READS}`,
    `claude mcp add --transport http --client-secret x ${READS}`,
    `claude mcp add --transport http --callback-port 1 x ${READS}`,
    `claude mcp add --transport http -h x ${READS}`,
    `claude mcp add --transport http x ${READS} extra`,
    `claude mcp add --transport http  x ${READS}`,
    `claude mcp add --transport http x`,
    "claude mcp add --transport http",
    `claude mcp add --transport http ${READS}`,
    "claude mcp add --transport http x http://mcp.clickhouse.cloud/mcp",
    "claude mcp add --transport http x https://",
    "claude mcp add --transport http x https:///mcp",
    'claude mcp add --transport http x https://mcp.clickhouse.cloud/mcp"',
    "claude mcp add --transport http x https://mcp.clickhouse.cloud/m\\cp",
    "claude mcp add --transport http x https://mcp.clickhouse.cloud/m'cp",
    `claude mcp add --transport http x.y ${READS}`,
    `claude mcp add --transport http x/y ${READS}`,
    `claude mcp add --transport http -x ${READS}`,
    `claude mcp add --transport http ${READS} x`,
    `claude mcp addx --transport http x ${READS}`,
  ];
  for (const line of noForm) expect([line, lifted(line)]).toEqual([line, held(NO_FORM)]);
  for (const line of [
    `claude mcp add --transport http -e A=b x ${READS}`,
    `claude mcp add --transport http -H "X: y" x ${READS}`,
    `claude mcp add --transport http --header X x ${READS}`,
  ])
    expect([line, lifted(line)]).toEqual([line, held(TOKEN)]);
});

test(`${ITEM} AC-10: a server the declarations do not show to only read is held, and no form leaves the hosted hold`, () => {
  for (const address of [
    "https://a.test/mcp",
    "https://mcp.prisma.io/mcp",
    "https://mcp.socket.dev/",
    `${READS}/x`,
    "https://MCP.clickhouse.cloud/mcp",
    "https://mcp.clickhouse.cloud:443/mcp",
    `${READS}?x=1`,
    `${READS}#x`,
    `${READS}/`,
  ]) {
    const line = `claude mcp add --transport http x ${address}`;
    expect([line, lifted(line)]).toEqual([line, held(NOT_READING)]);
  }
  // Two lines, both of ready forms: the table is asked of the server's line alone.
  const two = (address: string) => [
    "A server",
    "a server, hosted",
    "https://a.test/page",
    `\`npx skills add a/b\` and \`claude mcp add --transport http x ${address}\``,
  ];
  expect(rowInstall(two("https://a.test/mcp"), new Set(), true)).toEqual(held(NOT_READING));
  const both = rowInstall(two(READS), new Set(), true);
  expect(both.state).toBe("ready");
  expect(both.state === "ready" && both.forms.map(({ form }) => form)).toEqual([
    "npx skills add",
    "claude mcp add",
  ]);
  // Without the hosted hold lifted, every line of the form is hosted first.
  for (const line of [
    `claude mcp add --transport http x ${READS}`,
    `claude mcp add --transport http --scope user x ${READS}`,
    "claude mcp add --transport http x https://a.test/mcp",
  ])
    expect([line, rowInstall(cellsOf(line), new Set())]).toEqual([line, held(HOSTED)]);
});

const TEAMS = [
  "agentic-os",
  "architects",
  "backend",
  "devops",
  "etl",
  "frontend",
  "qa",
  "researchers",
  "security",
] as const;
const real = (team: string) => readFileSync(join(pluginRoot(), "teams", `${team}.md`), "utf8");
/** Every row of every table of the nine declarations whose header ends with how it is installed. */
const installRows = () =>
  TEAMS.flatMap((team) =>
    declarationSections(real(team)).flatMap((section) =>
      section.tables
        .filter((table) => table.header.at(-1) === "How it is installed")
        .flatMap((table) => table.rows.map((cells) => ({ team, cells }))),
    ),
  );
const READING_ROWS = [
  ["agentic-os", "https://developers.openai.com/learn/docs-mcp"],
  ["agentic-os", "https://help.getzep.com/docs-mcp-server.md"],
  ["etl", "https://clickhouse.com/docs/use-cases/AI/MCP/remote_mcp"],
  ["researchers", "https://github.com/ourresearch/openalex-mcp-server"],
];
const WRITING_ROWS = [
  ["backend", "https://www.prisma.io/docs/ai/tools/mcp-server"],
  ["etl", "https://www.prisma.io/docs/postgres/integrations/mcp-server"],
  ["etl", "https://motherduck.com/docs/key-tasks/ai-and-motherduck/mcp-workflows/mcp-setup/"],
  [
    "etl",
    "https://docs.cockroachlabs.com/docs/cockroachcloud/connect-to-the-cockroachdb-cloud-mcp-server",
  ],
  ["architects", "https://docs.datadoghq.com/bits_ai/mcp_server/setup/"],
  ["architects", "https://docs.honeycomb.io/integrations/mcp/"],
  ["researchers", "https://github.com/tavily-ai/tavily-mcp"],
  ["security", "https://docs.socket.dev/docs/remote-socket-mcp.md"],
  ["architects", "https://github.com/SocketDev/socket-mcp"],
];

test(`${ITEM} AC-11: every row of the form in the declarations is classified, and the table holds four addresses`, () => {
  expect(READING_SERVERS.map(({ address, team, page }) => [address, team, page])).toEqual([
    ["https://developers.openai.com/mcp", ...(READING_ROWS[0] ?? [])],
    ["https://docs-mcp.getzep.com/mcp", ...(READING_ROWS[1] ?? [])],
    ["https://mcp.clickhouse.cloud/mcp", ...(READING_ROWS[2] ?? [])],
    ["https://mcp.openalex.org/mcp", ...(READING_ROWS[3] ?? [])],
  ]);
  // Each entry's words stand in the row of its team at its page whose line holds its address.
  for (const entry of READING_SERVERS) {
    const rows = installRows().filter(
      ({ team, cells }) =>
        team === entry.team &&
        cells[2] === entry.page &&
        (cells.at(-1) ?? "").includes(entry.address),
    );
    expect([entry.address, rows.length]).toEqual([entry.address, 1]);
    expect([entry.address, rows[0]?.cells.join(" | ").includes(entry.words)]).toEqual([
      entry.address,
      true,
    ]);
  }
  const ofForm = installRows().filter(({ cells }) => {
    const state = rowInstall(cells, new Set(), true);
    return (
      (state.state === "ready" && state.forms.some(({ form }) => form === "claude mcp add")) ||
      (state.state === "held" && state.reason === NOT_READING)
    );
  });
  const key = ({ team, cells }: { team: string; cells: string[] }) => [team, cells[2] ?? ""];
  const reading = ofForm.filter(
    ({ cells }) => rowInstall(cells, new Set(), true).state === "ready",
  );
  expect(reading.map(key).sort()).toEqual([...READING_ROWS].sort());
  expect(
    ofForm
      .filter(({ cells }) => rowInstall(cells, new Set(), true).state === "held")
      .map(key)
      .sort(),
  ).toEqual([...WRITING_ROWS].sort());
});

const offer = (team: string, page: string) =>
  `    a person's consent for this project lifts this hold: crew sources ${team} --consented ${page}`;
const formOf = (team: string, cwd: string) =>
  sourcesCommand(pluginRoot(), [team], { project: { cwd } }).text.split("\n");
function under(lines: readonly string[], page: string): string[] {
  const at = lines.findIndex((line) => line.startsWith("| ") && line.includes(` ${page} `));
  if (at < 0) throw new Error(`no row is read at ${page}`);
  const out: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (!line.startsWith("  ")) break;
    out.push(line);
  }
  return out;
}

test(`${ITEM} AC-11: the forms offer a consent for the four reading rows and none for the nine others`, () => {
  const cwd = makeRepo({ "README.md": "x\n" });
  for (const [team, page] of READING_ROWS) {
    const lines = under(formOf(team ?? "", cwd), page ?? "");
    expect([team, page, lines.slice(0, 2)]).toEqual([
      team,
      page,
      [`  install: held, ${HOSTED}`, offer(team ?? "", page ?? "")],
    ]);
  }
  for (const [team, page] of WRITING_ROWS.filter(([team]) => team !== "backend")) {
    const lines = under(formOf(team ?? "", cwd), page ?? "");
    expect([team, page, lines.some((line) => line.includes("--consented"))]).toEqual([
      team,
      page,
      false,
    ]);
  }
});

test(`${ITEM} AC-12: a consent makes ClickHouse's row ready with the local note, and Prisma's is refused`, () => {
  const cwd = makeRepo({ "README.md": "x\n" });
  const clickhouse = "https://clickhouse.com/docs/use-cases/AI/MCP/remote_mcp";
  const prisma = "https://www.prisma.io/docs/postgres/integrations/mcp-server";
  const at = "2026-11-26T10:00:00.000Z";
  expect(recordSourcesCommand(pluginRoot(), ["etl"], { consented: prisma }, cwd, at)).toEqual({
    code: 1,
    text: `not recorded: with the hosted hold lifted the row is still held, ${NOT_READING}`,
  });
  expect(readSourcesRecord(cwd).entries).toEqual([]);
  expect(recordSourcesCommand(pluginRoot(), ["etl"], { consented: clickhouse }, cwd, at).code).toBe(
    0,
  );
  const lines = under(formOf("etl", cwd), clickhouse);
  expect(lines.slice(0, 3)).toEqual([
    "  install: ready",
    `    claude mcp add: ${LOCAL}`,
    "    hosted: consented on 2026-11-26; what a session asks of this server leaves the machine",
  ]);
});

test(`${ITEM} AC-13: ADR 0025 ends with this item's amendment`, () => {
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
  const heading = "## Amendment of 2026-11-26 (item 2026-11-26-005)";
  // 2026-11-28-001: this amendment runs to the next item's heading and to no other.
  const [part = "", ...later] = adr.slice(adr.indexOf(heading)).split("\n## ");
  expect(later.map((next) => next.split("\n")[0])).toEqual([
    "Amendment of 2026-11-28 (item 2026-11-28-001)",
  ]);
  for (const words of [
    "`claude mcp add`",
    "`--transport http`",
    "`local`",
    "`project`",
    "`user`",
    LOCAL,
    PROJECT,
    USER,
    "https://developers.openai.com/mcp",
    "https://docs-mcp.getzep.com/mcp",
    "https://mcp.clickhouse.cloud/mcp",
    "https://mcp.openalex.org/mcp",
    `    claude mcp add: ${LOCAL}`,
    `    claude mcp add: ${PROJECT}`,
    `    claude mcp add: ${USER}`,
    NOT_READING,
    "Honeycomb",
    "Socket",
    "`early development`",
    "2026-11-24-001",
    "Prisma",
    "MotherDuck",
    "CockroachDB",
    "Datadog",
    "Tavily",
    "its tools, its sign-in, what it sends back",
  ])
    expect([words, part.includes(words)]).toEqual([words, true]);
});
