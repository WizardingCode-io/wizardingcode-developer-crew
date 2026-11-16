import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  cells,
  hasText,
  hasUrl,
  isRow,
  LISTED_HEADER,
  listedGaps,
  markGaps,
  NOT_OPENED_MARK,
  namedRowGaps,
  numberedLine,
  rows,
  section,
  withChangedLine,
} from "./definition-document.ts";

const DEFINITION = new URL(
  "../../../docs/specs/2026-11-15-architects-team-design.md",
  import.meta.url,
);

const STYLE = "Choosing the architecture style";
const SUBJECTS = [
  "Layers and boundaries",
  "Data and domain model",
  "Contracts",
  "Integrations",
  "The spec's Design",
  "Consistency with neighbours",
  "Risk in production",
  STYLE,
  "Decisions and documentation",
  "Quality attributes",
  "Evolution and debt",
  "Technology and dependencies",
  "AI and agents",
];

const MEASURING = "Measuring quality attributes";
const KINDS = [
  "Boundaries and dependencies",
  "Contracts",
  "Diagrams and decisions",
  MEASURING,
  "Evolution and debt",
  "Technology, dependencies, AI and agents",
];

const OWN_SKILLS = [
  "Architecture",
  "Decision",
  "Boundaries and contracts",
  "Quality attributes and risk",
  "Views",
];

const NOT_OPENED_SENTENCE = "Twelve pages were not read on 2026-11-15";
/** The pages that were not read on 2026-11-15. */
const NOT_OPENED = [
  "https://www.oreilly.com/library/view/fundamentals-of-software/9781098175504/",
  "https://www.oreilly.com/library/view/software-architecture-the/9781492086888/",
  "https://www.oreilly.com/library/view/building-evolutionary-architectures/9781492097532/",
  "https://www.oreilly.com/library/view/working-effectively-with/0131177052/",
  "https://www.oreilly.com/library/view/designing-data-intensive-applications/9781098119058/",
  "https://architecturethehardparts.com/",
  "https://www.iso.org/standard/74393.html",
  "https://www.iso.org/standard/78176.html",
  "https://deps.dev/",
  "https://clinicjs.org/",
  "https://docs.sentry.io/product/sentry-mcp",
  "https://docs.moderne.io/user-documentation/agent-tools/mcp/remote-server",
];

const ENVIRONMENT = "the project's own local or test environment";
const MEASURED = "measured or estimated in writing";
const NO_READ_ONLY = "no read-only mode";
/** The three servers that enter although each writes and gives no read-only mode, by their rows' words. */
const EXCEPTIONS = ["SmartBear's server", "Miro's server", "New Relic's server"];
/** The servers that write and have a literal read-only switch: the row's words and the switch. */
const SWITCHES: [string, string][] = [
  ["Lucid's server", "https://mcp.lucid.app/mcp/readonly"],
  ["Grafana's server", "--disable-write"],
  ["SonarSource's server", "SONARQUBE_READ_ONLY=true"],
];
const NOT_INSTALLED = "Not installed";
/** The user's four links, by their rows' words. */
const LINKS = [
  "By the GitHub user `45ck`",
  "By the GitHub user `artubss`",
  "In the repository of the GitHub user `davila7`",
  "By the GitHub user `dandgabr`",
];
const LAST_HEADING = "## 6. What the code needs, not decided here";
/** The clouds' sets that are installed without the server they bring: the row's words. */
const SKILLS_ALONE = "Installed as the skills alone";
const SKILLS_ALONE_RULE = "the skills alone are installed";
const WITHOUT_SERVER = ["The Agent Toolkit for AWS", "Microsoft's azure-skills"];
/** The two sets as the sentence of rule 5 on the skills alone names them. */
const SKILLS_ALONE_SETS = ["the Agent Toolkit for AWS", "Microsoft's azure-skills"];
/** promptfoo's server stays here while the security team's definition leaves it out. */
const PROMPTFOO = "promptfoo's MCP server";
const LEFT_OUT_THERE = "The security team's definition leaves the server out";
/** Rule 5 of section 5: a set that serves a service, a cloud or a tool enters only where it is used. */
const RULE_FIVE = "5. ";
const WHERE_USED = "only where the project already uses it";
/** The four sets rule 5 names as held to a project that uses them. */
const WHERE_USED_SETS = [
  "The Agent Toolkit for AWS",
  "Microsoft's azure-skills",
  "PactFlow's skills and plugin",
  "Nx's skills",
];
/** The old words of the point the user closed on 2026-11-15; they stand nowhere in the document. */
const OPEN_POINT = "which rule wins";
/** Rule 5 named in section 6, in either case, reopens the point too. */
const RULE_FIVE_NAMED = /rule 5/i;

/** A row of section 5: words of its second cell and the whole text of its "Read at" cell. */
const SERVERS: [string, string][] = [
  ["Nx's MCP server", "https://nx.dev/docs/reference/nx-mcp"],
  ["Structurizr's MCP server", "https://docs.structurizr.com/ai/mcp"],
  ["`@plantuml/mcp-js`", "https://github.com/plantuml/plantuml"],
  ["jscpd's MCP server", "https://github.com/kucherenko/jscpd/blob/HEAD/docs/ai-ready.md"],
  ["knip's MCP server", "https://github.com/webpro-nl/knip/tree/main/packages/mcp-server"],
  ["Scorecard's MCP server", "https://github.com/ossf/scorecard/blob/HEAD/docs/mcp.md"],
  ["Jaeger's MCP server", "https://www.jaegertracing.io/docs/latest/ai/mcp-server/"],
  [
    "The Model Context Protocol project's Inspector",
    "https://github.com/modelcontextprotocol/inspector",
  ],
  ["promptfoo's MCP server", "https://www.promptfoo.dev/docs/integrations/mcp-server/"],
  ["Laravel's own server", "https://github.com/laravel/boost"],
  ["Redocly's server", "https://github.com/Redocly/redocly-plugin"],
  ["SmartBear's server", "https://github.com/SmartBear/smartbear-mcp"],
  ["The Apollo MCP Server", "https://github.com/apollographql/apollo-mcp-server"],
  ["JGraph's server", "https://github.com/jgraph/drawio-mcp"],
  ["Excalidraw's server", "https://github.com/excalidraw/excalidraw-mcp"],
  ["Miro's server", "https://developers.miro.com/docs/miro-mcp"],
  ["Lucid's server", "https://help.lucid.co/hc/en-us/articles/42578801807508"],
  ["Grafana's server", "https://github.com/grafana/mcp-grafana"],
  ["Sentry's server", "https://github.com/getsentry/sentry-mcp"],
  ["Datadog's server", "https://docs.datadoghq.com/bits_ai/mcp_server/setup/"],
  ["Honeycomb's server", "https://docs.honeycomb.io/integrations/mcp/"],
  ["New Relic's server", "https://docs.newrelic.com/docs/agentic-ai/mcp/setup/"],
  ["SonarSource's server", "https://github.com/SonarSource/sonarqube-mcp-server"],
  ["CodeScene's CodeHealth MCP server", "https://github.com/codescene-oss/codescene-mcp-server"],
  ["Socket's server", "https://github.com/SocketDev/socket-mcp"],
  [
    "Snyk Studio",
    "https://docs.snyk.io/integrations/snyk-studio-agentic-integrations/quickstart-guides-for-snyk-studio/claude-code-guide",
  ],
  [
    "The AWS Knowledge MCP Server",
    "https://github.com/awslabs/mcp/tree/main/src/aws-knowledge-mcp-server",
  ],
  ["The Microsoft Learn MCP Server", "https://learn.microsoft.com/en-us/training/support/mcp"],
  ["Google's Developer Knowledge MCP server", "https://developers.google.com/knowledge/mcp"],
  [
    "Cloudflare's Documentation server",
    "https://developers.cloudflare.com/agents/model-context-protocol/mcp-servers-for-cloudflare/",
  ],
  [
    "The `feature-dev` plugin",
    "https://github.com/anthropics/claude-plugins-official/tree/main/plugins/feature-dev",
  ],
  [
    "The `code-modernization` plugin",
    "https://github.com/anthropics/claude-plugins-official/tree/main/plugins/code-modernization",
  ],
  ["Three plugins: plugin-dev", "https://github.com/anthropics/claude-plugins-official"],
  ["Nx's skills", "https://github.com/nrwl/nx-ai-agents-config"],
  ["Redocly's skills", "https://github.com/Redocly/redocly-cli"],
  ["Buf's plugin `protobuf`", "https://github.com/bufbuild/claude-plugins"],
  ["PactFlow's skills", "https://github.com/pactflow/pactflow-agent-skills"],
  ["Apollo's skills", "https://github.com/apollographql/skills"],
  ["jscpd's skills", "https://github.com/kucherenko/jscpd"],
  ["Google's skills", "https://github.com/google/skills"],
  ["Microsoft's azure-skills", "https://github.com/microsoft/azure-skills"],
  ["The Agent Toolkit for AWS", "https://github.com/aws/agent-toolkit-for-aws"],
  ["Three skills of his set", "https://github.com/mattpocock/skills"],
  ["Two skills of its set", "https://github.com/trailofbits/skills"],
  ["By the GitHub user `45ck`", "https://github.com/45ck/software-architecture-skills"],
  ["By the GitHub user `artubss`", "https://github.com/artubss/SKILLS-CLAUDE-CODE"],
  [
    "In the repository of the GitHub user `davila7`",
    "https://github.com/davila7/claude-code-templates/blob/main/cli-tool/components/skills/development/software-architecture/SKILL.md",
  ],
  [
    "By the GitHub user `dandgabr`",
    "https://github.com/dandgabr/skills/blob/main/skills/roles/software-architect/SKILL.md",
  ],
];

/** The numbered line of section 5 that states rule 5; empty when the section has none. */
const ruleFiveOf = (document: string) => numberedLine(document, 5, RULE_FIVE);

/** The one sentence of rule 5 that says where a set is installed; empty when the rule has none. */
const whereUsedOf = (document: string) =>
  ruleFiveOf(document)
    .split(". ")
    .find((sentence) => sentence.includes(WHERE_USED)) ?? "";

/** The one sentence of rule 5 that says the skills alone are installed; empty when the rule has none. */
const skillsAloneOf = (document: string) =>
  ruleFiveOf(document)
    .split(". ")
    .find((sentence) => sentence.includes(SKILLS_ALONE_RULE)) ?? "";

/**
 * Every clause of the architects team's definition the text fails, by name; empty when it holds
 * all. It reads the document by section and by table row, so a name inside a longer cell, a URL
 * on another row or a row written twice does not pass. Section 5 holds tables of two shapes: a
 * row of four cells is a server or a set of skills, a row of two is one of the team's own skills.
 */
function definitionGaps(document: string): string[] {
  const gaps: string[] = [];
  const sources = rows(section(document, 3));
  const tools = rows(section(document, 4));
  const five = rows(section(document, 5));
  const servers = five.filter((row) => row.length === 4);
  const own = five.filter((row) => row.length === 2);
  gaps.push(...namedRowGaps(sources, SUBJECTS, "subject row", "no source", hasUrl));
  gaps.push(...namedRowGaps(tools, KINDS, "kind row", "empty row", hasText));
  const rowsOf = (words: string) => servers.filter((row) => row[1]?.includes(words));
  for (const [words, readAt] of SERVERS) {
    const found = rowsOf(words);
    if (found.length !== 1 || found[0]?.[2] !== readAt) gaps.push(`server url: ${words}`);
  }
  for (const skill of OWN_SKILLS)
    if (own.filter((row) => row[0] === skill).length !== 1) gaps.push(`own skill: ${skill}`);
  if (sources.length !== SUBJECTS.length + 1) gaps.push("row count: section 3");
  if (tools.length !== KINDS.length + 1) gaps.push("row count: section 4");
  if (own.length !== OWN_SKILLS.length + 1) gaps.push("row count: own skills");
  gaps.push(...listedGaps(five, LISTED_HEADER, SERVERS.length));
  gaps.push(...markGaps(document, NOT_OPENED, NOT_OPENED_MARK, "not opened"));
  if (!document.includes(NOT_OPENED_SENTENCE)) gaps.push("not opened sentence");
  const second = (table: string[][], name: string) =>
    table.find((row) => row[0] === name)?.[1] ?? "";
  if (!second(tools, MEASURING).includes(ENVIRONMENT)) gaps.push("own environment");
  if (!second(sources, STYLE).includes(MEASURED)) gaps.push("measured case");
  for (const words of EXCEPTIONS)
    if (!rowsOf(words)[0]?.[1]?.includes(NO_READ_ONLY)) gaps.push(`exception: ${words}`);
  for (const [words, flag] of SWITCHES)
    if (!rowsOf(words)[0]?.[1]?.includes(flag)) gaps.push(`read-only switch: ${words}`);
  for (const words of LINKS)
    if (!rowsOf(words)[0]?.[3]?.startsWith(NOT_INSTALLED)) gaps.push(`link: ${words}`);
  const sentence = whereUsedOf(document);
  const held = WHERE_USED_SETS.every((words) => sentence.includes(words));
  const reopened = document.includes(OPEN_POINT) || RULE_FIVE_NAMED.test(section(document, 6));
  if (!held || reopened) gaps.push("where used");
  for (const words of WITHOUT_SERVER)
    if (!rowsOf(words)[0]?.[1]?.includes(SKILLS_ALONE)) gaps.push(`skills alone: ${words}`);
  const alone = skillsAloneOf(document);
  if (!SKILLS_ALONE_SETS.every((words) => alone.includes(words))) gaps.push("skills alone: rule 5");
  if (!rowsOf(PROMPTFOO)[0]?.[1]?.includes(LEFT_OUT_THERE))
    gaps.push(`left out there: ${PROMPTFOO}`);
  const headings = document.split("\n").filter((line) => line.startsWith("## "));
  if (headings.at(-1) !== LAST_HEADING) gaps.push("last section");
  return gaps;
}

/** An absent document reads as empty text, so every test is registered and fails by name. */
const text = existsSync(DEFINITION) ? readFileSync(DEFINITION, "utf8") : "";

/** The text with the one table row of section `number` that `picks` chooses changed by `change`. */
const withLine = (
  number: number,
  what: string,
  picks: (line: string) => boolean,
  change: (line: string) => string,
) => withChangedLine(text, number, what, (line) => isRow(line) && picks(line), change);

/** The row of section `number` whose first cell is `name`, changed. */
const withRow = (number: number, name: string, change: (line: string) => string) =>
  withLine(number, name, (line) => cells(line)[0] === name, change);

/** The four-cell row of section 5 whose second cell holds `words`, changed. */
const withServer = (words: string, change: (line: string) => string) =>
  withLine(
    5,
    words,
    (line) => cells(line).length === 4 && (cells(line)[1] ?? "").includes(words),
    change,
  );

const twice = (line: string) => `${line}\n${line}`;
const NAMED: [number, string[], string][] = [
  [3, SUBJECTS, "subject row"],
  [4, KINDS, "kind row"],
  [5, OWN_SKILLS, "own skill"],
];

test("2026-11-15-005 AC-2: the architects team's definition holds every clause", () => {
  expect(definitionGaps(text)).toEqual([]);
});

test("2026-11-15-005 AC-2: a subject, a kind or an own skill whose row leaves its table is named", () => {
  for (const [number, names, clause] of NAMED)
    for (const name of names)
      expect(definitionGaps(withRow(number, name, () => "")), name).toContain(`${clause}: ${name}`);
});

test("2026-11-15-005 AC-2: a subject, a kind or an own skill whose row stands twice is named", () => {
  for (const [number, names, clause] of NAMED)
    for (const name of names)
      expect(definitionGaps(withRow(number, name, twice)), name).toContain(`${clause}: ${name}`);
});

test("2026-11-15-005 AC-2: a name left only inside a longer first cell has no row", () => {
  const longer = (number: number, name: string) =>
    withRow(number, name, (line) => line.replace(`| ${name} |`, `| ${name} and more |`));
  expect(definitionGaps(longer(3, "Contracts"))).toContain("subject row: Contracts");
  expect(definitionGaps(longer(4, "Contracts"))).toContain("kind row: Contracts");
  expect(definitionGaps(longer(5, "Decision"))).toContain("own skill: Decision");
});

test("2026-11-15-005 AC-2: a subject's row with no URL, or a kind's row with nothing in it, is named", () => {
  const emptied = (line: string) => `${line.split(" | ")[0]} | |`;
  for (const subject of SUBJECTS)
    expect(definitionGaps(withRow(3, subject, emptied)), subject).toContain(
      `no source: ${subject}`,
    );
  for (const kind of KINDS)
    expect(definitionGaps(withRow(4, kind, emptied)), kind).toContain(`empty row: ${kind}`);
});

test("2026-11-15-005 AC-2: a row more in a table read by its first cell is named", () => {
  const more = (number: number, name: string) =>
    withRow(number, name, (line) => `${line}\n| One more | https://example.com/ |`);
  expect(definitionGaps(more(3, STYLE))).toEqual(["row count: section 3"]);
  expect(definitionGaps(more(4, MEASURING))).toEqual(["row count: section 4"]);
  expect(definitionGaps(more(5, "Views"))).toEqual(["row count: own skills"]);
});

test("2026-11-15-005 AC-2: a server or a set of skills whose URL leaves its own row is named, also when the URL stands on another row", () => {
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

test("2026-11-15-005 AC-2: a server or a set of skills whose words pick two rows is named", () => {
  for (const [words] of SERVERS)
    expect(definitionGaps(withServer(words, twice)), words).toContain(`server url: ${words}`);
});

test("2026-11-15-005 AC-2: a four-cell row the list does not name, with a URL or with none, or a row gone, is named", () => {
  const last = LINKS.at(-1) ?? "";
  const after = (row: string) => withServer(last, (line) => `${line}\n${row}`);
  const named = "| Another | Another server | https://example.com/ | `install` |";
  expect(definitionGaps(after(named))).toEqual(["server count"]);
  expect(definitionGaps(after("| Another | Another server | | `install` |"))).toEqual([
    "server count",
  ]);
  expect(definitionGaps(withServer(last, () => ""))).toContain("server count");
});

test("2026-11-15-005 AC-2: a page not read that loses its mark, or leaves the document, is named", () => {
  expect(text).not.toBe("");
  for (const url of NOT_OPENED) {
    const gap = `not opened: ${url}`;
    const marked = `${url}${NOT_OPENED_MARK}`;
    expect(definitionGaps(text.replace(marked, url)), url).toContain(gap);
    expect(definitionGaps(text.replaceAll(marked, "")), `${url} gone`).toContain(gap);
  }
});

test("2026-11-15-005 AC-2: a bare copy of a page not read is named while its first place keeps its mark", () => {
  for (const url of NOT_OPENED) {
    const marked = `${url}${NOT_OPENED_MARK}`;
    const first = text.indexOf(marked);
    expect(first, url).toBeGreaterThan(0);
    const changed = `${text}\nSee also ${url} for more.\n`;
    expect(changed.indexOf(marked), url).toBe(first);
    expect(definitionGaps(changed), url).toContain(`not opened: ${url}`);
  }
});

test("2026-11-15-005 AC-2: a thirteenth page marked as not read, or the sentence that counts them gone, is named", () => {
  expect(text).not.toBe("");
  const thirteenth = `${text}\nAlso https://example.com/thirteenth${NOT_OPENED_MARK}.\n`;
  expect(definitionGaps(thirteenth)).toEqual(["not opened count"]);
  const recounted = text.replace(NOT_OPENED_SENTENCE, "Some pages were not read");
  expect(definitionGaps(recounted)).toEqual(["not opened sentence"]);
});

test("2026-11-15-005 AC-2: the project's own environment off the measuring row, or the measured case off the style's row, is named", () => {
  const measuring = withRow(4, MEASURING, (line) =>
    line.replace(ENVIRONMENT, "a test environment"),
  );
  expect(definitionGaps(measuring)).toEqual(["own environment"]);
  const style = withRow(3, STYLE, (line) => line.replace(MEASURED, "known"));
  expect(definitionGaps(style)).toEqual(["measured case"]);
});

test("2026-11-15-005 AC-2: an exception's row that no longer says the server has no read-only mode is named", () => {
  for (const words of EXCEPTIONS) {
    const changed = withServer(words, (line) => line.replace(NO_READ_ONLY, "a mode"));
    expect(definitionGaps(changed), words).toEqual([`exception: ${words}`]);
  }
});

test("2026-11-15-005 AC-2: a writing server's row that loses its read-only switch from its second cell is named", () => {
  for (const [words, flag] of SWITCHES) {
    const changed = withServer(words, (line) => {
      const [first, second, ...rest] = line.split(" | ");
      return [first, (second ?? "").replace(flag, "a switch"), ...rest].join(" | ");
    });
    expect(definitionGaps(changed), words).toEqual([`read-only switch: ${words}`]);
  }
});

test("2026-11-15-005 AC-2: a link's row whose last cell no longer opens with not installed is named", () => {
  for (const words of LINKS) {
    const changed = withServer(words, (line) =>
      line.replace(`| ${NOT_INSTALLED}`, "| Installed with the team"),
    );
    expect(definitionGaps(changed), words).toEqual([`link: ${words}`]);
  }
});

test("2026-11-15-005 AC-2: a section after the one on what the code needs is named", () => {
  expect(text).not.toBe("");
  expect(definitionGaps(`${text}\n## 7. More\n\nMore.\n`)).toContain("last section");
});

test("2026-11-15-006 AC-2: rule 5 that loses where a set is installed, or one of the four sets, is named", () => {
  const sentence = whereUsedOf(text);
  for (const words of [WHERE_USED, ...WHERE_USED_SETS]) {
    expect(sentence, words).toContain(words);
    const changed = text.replace(sentence, () => sentence.replaceAll(words, "other words"));
    expect(definitionGaps(changed), words).toEqual(["where used"]);
  }
});

test("2026-11-15-007 AC-2: a set moved out of the sentence that holds it to a project that uses it is named", () => {
  const rule = ruleFiveOf(text);
  for (const name of WHERE_USED_SETS) {
    expect(whereUsedOf(text), name).toContain(name);
    const moved = rule.replace(name, "One set").replace(/$/, ` ${name} is installed always.`);
    expect(definitionGaps(text.replace(rule, () => moved)), name).toEqual(["where used"]);
  }
});

test("2026-11-15-007 AC-2: the point put back as open in section 6, in its old words or by naming rule 5, is named", () => {
  expect(text).not.toContain(OPEN_POINT);
  expect(section(text, 6)).not.toMatch(RULE_FIVE_NAMED);
  const bullets = [
    `It is open ${OPEN_POINT}`,
    "It is open what rule 5 holds",
    "Rule 5 and its sets",
  ];
  for (const bullet of bullets) {
    const reopened = text.replace(LAST_HEADING, `${LAST_HEADING}\n\n- ${bullet}.`);
    expect(definitionGaps(reopened), bullet).toEqual(["where used"]);
  }
});

test("2026-11-15-008 AC-2: a cloud's set whose row, or rule 5, no longer says the skills alone are installed is named", () => {
  for (const words of WITHOUT_SERVER) {
    const second = rows(section(text, 5)).find((row) => row[1]?.includes(words))?.[1];
    expect(second, words).toContain(SKILLS_ALONE);
    const changed = withServer(words, (line) => {
      const [first, cell, ...rest] = line.split(" | ");
      return [first, (cell ?? "").replaceAll(SKILLS_ALONE, "Installed whole"), ...rest].join(" | ");
    });
    expect(definitionGaps(changed), words).toEqual([`skills alone: ${words}`]);
  }
  const rule = ruleFiveOf(text);
  expect(rule).toContain(SKILLS_ALONE_RULE);
  const loosened = text.replace(rule, () => rule.replaceAll(SKILLS_ALONE_RULE, "the plugin is"));
  expect(definitionGaps(loosened)).toEqual(["skills alone: rule 5"]);
});

test("2026-11-15-009 AC-2: a cloud's set taken off the sentence of rule 5 on the skills alone is named", () => {
  const sentence = skillsAloneOf(text);
  for (const name of SKILLS_ALONE_SETS) {
    expect(sentence, name).toContain(name);
    const changed = text.replace(sentence, () => sentence.replaceAll(name, "one set"));
    expect(definitionGaps(changed), name).toEqual(["skills alone: rule 5"]);
  }
});

/** The second cell of the four-cell row of section 5 that `words` pick; empty when none does. */
const secondCellOf = (words: string) =>
  rows(section(text, 5)).find((row) => row.length === 4 && row[1]?.includes(words))?.[1] ?? "";

test("2026-11-16-001 AC-3: promptfoo's row that no longer says the security team's definition leaves the server out is named", () => {
  expect(secondCellOf(PROMPTFOO).split(LEFT_OUT_THERE)).toHaveLength(2);
  const changed = withServer(PROMPTFOO, (line) => line.replaceAll(LEFT_OUT_THERE, "As elsewhere"));
  expect(definitionGaps(changed)).toEqual([`left out there: ${PROMPTFOO}`]);
});
