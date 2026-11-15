import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  bullets,
  cells,
  LISTED_HEADER as HEADER,
  isRow,
  listedGaps,
  NOT_OPENED_MARK as MARK,
  markGaps,
  READ_IN_PART_MARK as PART,
  rows,
  section,
  withChangedLine,
} from "./definition-document.ts";

const DEFINITION = new URL(
  "../../../docs/specs/2026-11-15-researchers-team-design.md",
  import.meta.url,
);

/** Each kind of research with the number of URLs its row of sources holds. */
const KIND_SOURCES: [string, number][] = [
  ["Code and repository", 7],
  ["Documentation", 6],
  ["News and recent changes", 14],
  ["Good practice and proven solutions", 10],
  ["Product and market", 16],
  ["Flows and frontend", 15],
  ["The user's voice", 14],
  ["Academic", 14],
];
const KINDS = KIND_SOURCES.map(([kind]) => kind);

/** What sections 1 and 2 say of the team today, each under its clause. */
const STANDING: [number, string, string][] = [
  [1, "why", "`TEAMS.researchers`"],
  [1, "why", "bem sólido"],
  [2, "today", "`crew research <id> verify` checks each quote"],
  [2, "today", "The fast route seats the researcher for nothing"],
];
const TODAY_BULLETS = 6;

/** How each top-level bullet of section 8 opens: what the building item settles. */
const NEEDS = [
  "The three new moments:",
  "The eight kinds:",
  "The three depths:",
  "The freshness window of each kind",
  "The separate verifier:",
  "The claims ledger, the coverage table and the evidence map",
  "The memory:",
  "The researcher's new tools.",
  "How the sources' own terms are kept:",
  "Personal data in the user's voice:",
  'How "installed where the project uses it" is carried out',
  "How the servers are confined:",
  "An ADR for installing an outside skill by one person",
  "The four skills of the team's own:",
  "What stays of the sources the research found closed or changed:",
  "The researchers team itself:",
];

/** Each moment with the word its second cell starts with. */
const MOMENTS: [string, string][] = [
  ["The conclave's debate", "exists"],
  ["A new project's strategy", "exists"],
  ["An audit", "exists"],
  ["The understand phase", "new"],
  ["A research item on request", "new"],
  ["The learn phase", "new"],
];

const DEPTHS = ["Quick", "Normal", "Deep"];

/** The twelve rules of method, each by words only its own line holds. */
const RULES = [
  "a sentence with a source",
  "apart from synthesis",
  "says where it looked",
  "different underlying data",
  "has its freshness window",
  "never reconstructed",
  "never an instruction",
  "written as unknown",
  "the decision it serves",
  "never what is true",
  "followed to its origin",
  "the sample's size",
];

/** The phrases of section 5's four decisions, each under its clause; each stands once in the section. */
const PHRASES: [string, string][] = [
  ["verification", "Jev says whether the source supports the claim"],
  ["verification", "A separate verifier joins them on the normal and deep depths"],
  ["verification", "a fresh context"],
  ["result", "A claims ledger"],
  ["result", "A coverage table"],
  ["result", "The evidence map"],
  ["base", "Verified claims only"],
  ["base", "its kind's freshness window"],
  ["base", "A disputed claim never enters"],
  ["memory", "whichever memory the project has"],
  ["memory", "always give the tip to use it"],
];

const TOOLS = ["Files and the web", "A browser", "Read-only commands", "Collection scripts"];

const OWN_SKILLS = ["Research", "Verification", "Evidence map", "Selection"];

const COPILOT = "https://github.com/github/awesome-copilot";
const LAST30DAYS = "last30days (mvanhorn/last30days-skill)";
const NEXU = "last30days, the copy in nexu-io/open-design";
const KWP =
  "knowledge-work-plugins research skills (`synthesize-research`, `competitive-brief`, `search`, `knowledge-synthesis`, `search-strategy`, `account-research`, `competitive-intelligence`)";

/** The four-cell rows of section 7: the first cell, and the third, where the row was read. */
const SERVERS: [string, string][] = [
  ["Context7", "https://context7.com/docs/resources/all-clients.md"],
  ["Playwright MCP", "https://github.com/microsoft/playwright-mcp"],
  [
    "OpenAlex MCP server (academic research only)",
    "https://github.com/ourresearch/openalex-mcp-server",
  ],
  [
    "Exa (only where the project already has Exa's key)",
    "https://github.com/exa-labs/exa-mcp-server",
  ],
  [
    "Tavily (only where the project already has Tavily's key)",
    "https://github.com/tavily-ai/tavily-mcp",
  ],
  [
    "Brave Search (only where the project already has Brave's key)",
    "https://github.com/brave/brave-search-mcp-server",
  ],
  [
    "Firecrawl (only where the project already has Firecrawl's key)",
    "https://github.com/firecrawl/firecrawl-mcp-server",
  ],
  [LAST30DAYS, "https://github.com/mvanhorn/last30days-skill"],
  ["BMad Deep Recon (`bmad-deep-recon`)", "https://github.com/bmad-code-org/BMAD-METHOD"],
  ["doublecheck", `${COPILOT}${PART}`],
  ["build-evidence-map", `${COPILOT}${PART}`],
  ["deep-research (bytedance/deer-flow)", `https://github.com/bytedance/deer-flow${PART}`],
  [KWP, "https://github.com/anthropics/knowledge-work-plugins"],
  ["nature-reviewer (Yuan1z0825/nature-skills)", "https://github.com/Yuan1z0825/nature-skills"],
  [NEXU, `https://github.com/nexu-io/open-design${PART}`],
  ["eyeball", `${COPILOT}${PART}`],
  ["wizardingcode-mem", "https://github.com/WizardingCode-io/wizardingcode-mem"],
  ["Mem0", "https://docs.mem0.ai/platform/mem0-mcp.md"],
  ["Zep and Graphiti", `https://github.com/getzep/graphiti${PART}`],
  ["Letta", "https://github.com/letta-ai/letta"],
  [
    "Anthropic's memory tool (Claude API)",
    "https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool.md",
  ],
  [
    "Claude Code's own memory (CLAUDE.md files and auto memory)",
    "https://code.claude.com/docs/en/memory.md",
  ],
  ["claude-mem", "https://github.com/thedotmack/claude-mem"],
  ["basic-memory", "https://github.com/basicmachines-co/basic-memory"],
  ["Honcho", "https://github.com/plastic-labs/honcho"],
];

const INSTALLED = "Installed as it is";
const ONE_PERSON = "One person's work";
const SOURCE = "Read as a source for the team's own skills, not installed";
const LEFT_OUT = "Left out";

/** What the second cell of each of the user's links says of its use: how it starts, or what it holds. */
const FATES: [string, string, "starts" | "holds"][] = [
  [LAST30DAYS, INSTALLED, "starts"],
  [LAST30DAYS, ONE_PERSON, "holds"],
  ["BMad Deep Recon (`bmad-deep-recon`)", SOURCE, "starts"],
  ["doublecheck", SOURCE, "starts"],
  ["build-evidence-map", SOURCE, "starts"],
  ["deep-research (bytedance/deer-flow)", SOURCE, "starts"],
  [KWP, SOURCE, "starts"],
  ["nature-reviewer (Yuan1z0825/nature-skills)", SOURCE, "starts"],
  [NEXU, LEFT_OUT, "starts"],
  ["eyeball", LEFT_OUT, "starts"],
];

const NOT_OPENED = [
  "https://12factor.net/blog",
  "https://api-dashboard.search.brave.com/app/plans",
  "https://context7.com/pricing",
  "https://developer.x.com",
  "https://docs.github.com/search-github/searching-on-github/searching-code",
  "https://github.com/alsoleg89/doubt",
  "https://github.com/microsoft/playwright-cli",
  "https://pageflows.com/about/",
  "https://rss.marketingtools.apple.com/",
  "https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki",
  "https://support.reddithelp.com/hc/en-us/articles/26410290525844-Public-Content-Policy",
  "https://www.capterra.com/",
  "https://www.g2.com/",
  "https://www.gartner.com/en/digital-markets",
  "https://www.ncbi.nlm.nih.gov/books/NBK25497/",
  "https://www.trustradius.com/",
];

const NOT_OPENED_SENTENCE = "Sixteen pages were not opened on 2026-11-15";
const READ_IN_PART_SENTENCE = "twenty-two were read in part";
const READ_IN_PART = [
  "https://api.semanticscholar.org/api-docs/graph",
  "https://archive.org/about/terms",
  "https://developer.apple.com/design/human-interface-guidelines/",
  "https://developer.apple.com/documentation/appstoreconnectapi/customer-reviews",
  "https://docs.discourse.org/",
  "https://endoflife.date/docs/api/v1/",
  "https://github.com/bytedance/deer-flow",
  "https://github.com/getzep/graphiti",
  "https://github.com/github/awesome-copilot",
  "https://github.com/letta-ai/letta-code",
  "https://github.com/nexu-io/open-design",
  "https://help.getzep.com/llms.txt",
  "https://hn.algolia.com/",
  "https://hn.algolia.com/api",
  "https://m3.material.io/",
  "https://nvd.nist.gov/",
  "https://owasp.org/projects",
  "https://stackoverflow.com/legal/terms-of-service/public",
  "https://unpaywall.org/products/api",
  "https://www.cve.org/",
  "https://www.reddit.com/r/programming/",
  "https://www.semanticscholar.org/product/api/license",
];

const LAST_HEADING = "## 8. What the code needs, not decided here";

/** How many rows of `table` have `name` as their first cell. */
const count = (table: string[][], name: string) => table.filter((row) => row[0] === name).length;

/**
 * Every clause of the researchers team's definition the text fails, by name; empty when it holds
 * all. It reads the document by section and by table row, so a name inside a longer cell, a URL
 * on another row or a row written twice does not pass. Section 7 holds tables of two shapes: a
 * row of four cells is a server, one of the user's links or a memory, a row of two is one of the
 * team's own skills. It also reads what sections 1 and 2 say of the team today, how each bullet
 * of section 8 opens, how many URLs each kind's row holds, and both marks at every place a page
 * is cited.
 */
function definitionGaps(document: string): string[] {
  const gaps: string[] = [];
  const sources = rows(section(document, 3));
  const four = rows(section(document, 4));
  const five = section(document, 5);
  const tools = rows(section(document, 6));
  const seven = rows(section(document, 7));
  const listed = seven.filter((row) => row.length === 4 && row[0] !== HEADER);
  const own = seven.filter((row) => row.length === 2);
  for (const [kind, urls] of KIND_SOURCES) {
    if (count(sources, kind) !== 1) gaps.push(`kind row: ${kind}`);
    const second = sources.find((row) => row[0] === kind)?.[1] ?? "";
    if (second.split("https://").length - 1 !== urls) gaps.push(`sources of: ${kind}`);
  }
  for (const [number, clause, phrase] of STANDING)
    if (!section(document, number).includes(phrase)) gaps.push(`${clause}: ${phrase}`);
  if (bullets(section(document, 2)).length !== TODAY_BULLETS) gaps.push("today count");
  const needs = bullets(section(document, 8));
  for (const opening of NEEDS)
    if (needs.filter((bullet) => bullet.startsWith(opening)).length !== 1)
      gaps.push(`needs: ${opening}`);
  if (needs.length !== NEEDS.length) gaps.push("needs count");
  for (const [moment, state] of MOMENTS) {
    if (count(four, moment) !== 1) gaps.push(`moment row: ${moment}`);
    const second = four.find((row) => row[0] === moment)?.[1] ?? "";
    if (!second.startsWith(`${state}:`)) gaps.push(`moment state: ${moment}`);
  }
  for (const depth of DEPTHS) if (count(four, depth) !== 1) gaps.push(`depth row: ${depth}`);
  const lines = five.split("\n");
  for (const [index, words] of RULES.entries()) {
    const numbered = lines.filter((line) => line.startsWith(`${index + 1}. `));
    if (numbered.length !== 1 || !numbered[0]?.includes(words)) gaps.push(`rule: ${index + 1}`);
  }
  for (const [clause, phrase] of PHRASES)
    if (five.split(phrase).length !== 2) gaps.push(`${clause}: ${phrase}`);
  for (const tool of TOOLS) if (count(tools, tool) !== 1) gaps.push(`tool row: ${tool}`);
  for (const [name, readAt] of SERVERS) {
    const found = listed.filter((row) => row[0] === name);
    if (found.length !== 1 || found[0]?.[2] !== readAt) gaps.push(`server url: ${name}`);
  }
  if (sources.length !== KINDS.length + 1) gaps.push("row count: section 3");
  if (four.length !== MOMENTS.length + DEPTHS.length + 2) gaps.push("row count: section 4");
  if (tools.length !== TOOLS.length + 1) gaps.push("row count: section 6");
  if (own.length !== OWN_SKILLS.length + 1) gaps.push("row count: own skills");
  gaps.push(...listedGaps(seven, HEADER, SERVERS.length));
  for (const skill of OWN_SKILLS) if (count(own, skill) !== 1) gaps.push(`own skill: ${skill}`);
  for (const [name, words, how] of FATES) {
    const second = listed.find((row) => row[0] === name)?.[1] ?? "";
    const holds = how === "starts" ? second.startsWith(words) : second.includes(words);
    if (!holds) gaps.push(`links: ${name}: ${words}`);
  }
  gaps.push(...markGaps(document, NOT_OPENED, MARK, "not opened"));
  if (!document.includes(NOT_OPENED_SENTENCE)) gaps.push("not opened sentence");
  gaps.push(...markGaps(document, READ_IN_PART, PART, "read in part", true));
  if (!document.includes(READ_IN_PART_SENTENCE)) gaps.push("read in part sentence");
  const headings = document.split("\n").filter((line) => line.startsWith("## "));
  if (headings.at(-1) !== LAST_HEADING) gaps.push("last section");
  return gaps;
}

/** An absent document reads as empty text, so every test is registered and fails by name. */
const text = existsSync(DEFINITION) ? readFileSync(DEFINITION, "utf8") : "";

/** The text with the one line of section `number` that `picks` chooses changed by `change`. */
const withLine = (
  number: number,
  what: string,
  picks: (line: string) => boolean,
  change: (line: string) => string,
) => withChangedLine(text, number, what, picks, change);

/** The table row of section `number` whose first cell is `name`, changed. */
const withRow = (number: number, name: string, change: (line: string) => string) =>
  withLine(number, name, (line) => isRow(line) && cells(line)[0] === name, change);

/** The line of section 5 that starts with the rule's number, changed. */
const withRule = (index: number, change: (line: string) => string) =>
  withLine(5, `rule ${index + 1}`, (line) => line.startsWith(`${index + 1}. `), change);

/** The text with a phrase of section 5 replaced, in that section alone. */
function withoutPhrase(phrase: string): string {
  const part = section(text, 5);
  if (!part.includes(phrase)) throw new Error(`section 5 does not hold ${phrase}`);
  return text.replace(part, () => part.replaceAll(phrase, "something else"));
}

const twice = (line: string) => `${line}\n${line}`;
const gone = () => "";

/** Each table the test reads by its first cell: its section, its names and its clause. */
const TABLES: [number, string[], string][] = [
  [3, KINDS, "kind row"],
  [4, MOMENTS.map(([moment]) => moment), "moment row"],
  [4, DEPTHS, "depth row"],
  [6, TOOLS, "tool row"],
  [7, OWN_SKILLS, "own skill"],
];

test("2026-11-15-003 AC-1: the researchers team's definition holds every clause", () => {
  expect(definitionGaps(text)).toEqual([]);
});

test("2026-11-15-003 AC-1: a kind, a moment, a depth, a tool or an own skill whose row leaves its table is named", () => {
  for (const [number, names, clause] of TABLES)
    for (const name of names)
      expect(definitionGaps(withRow(number, name, gone)), name).toContain(`${clause}: ${name}`);
});

test("2026-11-15-003 AC-1: a kind, a moment, a depth, a tool or an own skill whose row stands twice is named", () => {
  for (const [number, names, clause] of TABLES)
    for (const name of names)
      expect(definitionGaps(withRow(number, name, twice)), name).toContain(`${clause}: ${name}`);
});

test("2026-11-15-003 AC-1: a name left only inside a longer first cell has no row", () => {
  for (const [number, names, clause] of TABLES)
    for (const name of names) {
      const longer = withRow(number, name, (line) =>
        line.replace(`| ${name} |`, `| ${name} and more |`),
      );
      expect(definitionGaps(longer), name).toContain(`${clause}: ${name}`);
    }
});

test("2026-11-15-003 AC-1: a moment whose state changes between existing and new is named", () => {
  for (const [moment, state] of MOMENTS) {
    const other = state === "exists" ? "new" : "exists";
    const changed = withRow(4, moment, (line) => line.replace(`| ${state}:`, `| ${other}:`));
    expect(definitionGaps(changed), moment).toContain(`moment state: ${moment}`);
  }
});

test("2026-11-15-003 AC-1: a rule of method taken out, written twice or left without its words is named", () => {
  for (const [index, words] of RULES.entries()) {
    const gap = `rule: ${index + 1}`;
    expect(definitionGaps(withRule(index, gone)), gap).toContain(gap);
    expect(definitionGaps(withRule(index, twice)), `${gap} twice`).toContain(gap);
    const reworded = withRule(index, (line) => line.replace(words, "something else"));
    expect(definitionGaps(reworded), `${gap} reworded`).toContain(gap);
  }
});

test("2026-11-15-003 AC-1: a phrase of the verification, the result, the base or the memory off section 5 is named", () => {
  for (const [clause, phrase] of PHRASES)
    expect(definitionGaps(withoutPhrase(phrase)), phrase).toContain(`${clause}: ${phrase}`);
});

test("2026-11-15-003 AC-1: a server, a link or a memory whose URL leaves its own row is named, also when the URL stands on another row", () => {
  for (const [name, readAt] of SERVERS) {
    const gap = `server url: ${name}`;
    const emptied = withRow(7, name, (line) => line.replace(`| ${readAt} |`, "| |"));
    expect(definitionGaps(emptied), name).toContain(gap);
    const moved = withRow(
      7,
      name,
      (line) => `${line.replace(`| ${readAt} |`, "| |")}\n| x | another row | ${readAt} | |`,
    );
    expect(definitionGaps(moved), `${name} moved`).toContain(gap);
  }
});

test("2026-11-15-003 AC-1: a server, a link or a memory whose row stands twice is named", () => {
  for (const [name] of SERVERS)
    expect(definitionGaps(withRow(7, name, twice)), name).toContain(`server url: ${name}`);
});

test("2026-11-15-003 AC-1: a four-cell row the list does not name, with a URL or with none, is named", () => {
  const after = (row: string) => withRow(7, "Context7", (line) => `${line}\n${row}`);
  const named = "| Another server | Published by someone. | https://example.com/ | `install` |";
  expect(definitionGaps(after(named))).toEqual(["server count"]);
  const bare = "| Another server | Published by someone. | | `install` |";
  expect(definitionGaps(after(bare))).toEqual(["server count"]);
  const emptied = withRow(7, "Honcho", gone);
  expect(definitionGaps(emptied)).toContain("server count");
});

test("2026-11-15-003 AC-1: the words that say how each of the user's links is used, off its row, are named", () => {
  for (const [name, words] of FATES) {
    const changed = withRow(7, name, (line) => line.replace(words, "Something else"));
    expect(definitionGaps(changed), `${name}: ${words}`).toContain(`links: ${name}: ${words}`);
  }
});

test("2026-11-15-003 AC-1: a page not read that loses its mark, or leaves the document, is named", () => {
  expect(text).not.toBe("");
  for (const url of NOT_OPENED) {
    const gap = `not opened: ${url}`;
    expect(definitionGaps(text.replace(`${url}${MARK}`, url)), url).toContain(gap);
    expect(definitionGaps(text.replaceAll(`${url}${MARK}`, "")), `${url} gone`).toContain(gap);
  }
});

test("2026-11-15-003 AC-1: a bare copy of a page not read is named while its first place keeps its mark", () => {
  for (const url of NOT_OPENED) {
    const marked = `${url}${MARK}`;
    const first = text.indexOf(marked);
    expect(first, url).toBeGreaterThan(0);
    const changed = `${text}\nSee also ${url} for more.\n`;
    expect(changed.indexOf(marked), url).toBe(first);
    expect(definitionGaps(changed), url).toContain(`not opened: ${url}`);
  }
});

test("2026-11-15-003 AC-1: a section after the one on what the code needs is named", () => {
  expect(text).not.toBe("");
  expect(definitionGaps(`${text}\n## 9. More\n\nMore.\n`)).toContain("last section");
});

test("2026-11-15-004 AC-2: a kind's row of sources that loses one of its URLs, or gains one, is named", () => {
  for (const kind of KINDS) {
    const gap = `sources of: ${kind}`;
    const fewer = withRow(3, kind, (line) => line.replace("(https://", "(the page at "));
    expect(definitionGaps(fewer), kind).toContain(gap);
    const more = withRow(3, kind, (line) =>
      line.replace("(https://", "(https://example.com/ and https://"),
    );
    expect(definitionGaps(more), `${kind} more`).toEqual([gap]);
  }
});

test("2026-11-15-004 AC-2: what sections 1 and 2 say of the team today, reworded or with a bullet more, is named", () => {
  for (const [number, clause, phrase] of STANDING) {
    const part = section(text, number);
    expect(part, phrase).toContain(phrase);
    const changed = text.replace(part, () => part.replace(phrase, "something else"));
    expect(definitionGaps(changed), phrase).toEqual([`${clause}: ${phrase}`]);
  }
  const more = withLine(
    2,
    "a bullet",
    (line) => line.startsWith("- "),
    (line) => `- More.\n${line}`,
  );
  expect(definitionGaps(more)).toEqual(["today count"]);
});

test("2026-11-15-004 AC-2: a bullet of section 8 taken out, written twice or added is named", () => {
  for (const opening of NEEDS) {
    const picks = (line: string) => line.startsWith(`- ${opening}`);
    const gap = `needs: ${opening}`;
    expect(definitionGaps(withLine(8, opening, picks, gone)), opening).toContain(gap);
    expect(definitionGaps(withLine(8, opening, picks, twice)), `${opening} twice`).toContain(gap);
  }
  const first = NEEDS[0] ?? "";
  const added = withLine(
    8,
    first,
    (line) => line.startsWith(`- ${first}`),
    (line) => `- Something more: to settle.\n${line}`,
  );
  expect(definitionGaps(added)).toEqual(["needs count"]);
});

test("2026-11-15-004 AC-2: a page read in part cited without its mark, at its first place or at a new one, is named", () => {
  for (const url of READ_IN_PART) {
    const gap = `read in part: ${url}`;
    expect(definitionGaps(text.replace(`${url}${PART}`, url)), url).toContain(gap);
    const cited = `${text}\nSee the page (${url}) for more.\n`;
    expect(definitionGaps(cited), `${url} cited`).toEqual([gap]);
  }
});

test("2026-11-15-004 AC-2: a page marked that its list does not hold, or a sentence that counts the pages gone, is named", () => {
  expect(text).not.toBe("");
  const added = (mark: string) => `${text}\nAlso https://example.com/more${mark}.\n`;
  expect(definitionGaps(added(MARK))).toEqual(["not opened count"]);
  expect(definitionGaps(added(PART))).toEqual(["read in part count"]);
  const without = (sentence: string) => definitionGaps(text.replace(sentence, "some pages"));
  expect(without(NOT_OPENED_SENTENCE)).toEqual(["not opened sentence"]);
  expect(without(READ_IN_PART_SENTENCE)).toEqual(["read in part sentence"]);
});

test("2026-11-15-004 AC-2: a row more in a table read by its first cell is named", () => {
  const more = (number: number, name: string) =>
    withRow(number, name, (line) => `${line}\n| One more | https://example.com/ |`);
  expect(definitionGaps(more(3, KINDS[0] ?? ""))).toEqual(["row count: section 3"]);
  expect(definitionGaps(more(4, DEPTHS[0] ?? ""))).toEqual(["row count: section 4"]);
  expect(definitionGaps(more(6, TOOLS[0] ?? ""))).toEqual(["row count: section 6"]);
  expect(definitionGaps(more(7, OWN_SKILLS[0] ?? ""))).toEqual(["row count: own skills"]);
});

test("2026-11-15-004 AC-2: a page read in part that stands in backticks as a link sent, or runs on into a longer URL, is not a citation", () => {
  expect(text).not.toBe("");
  for (const url of READ_IN_PART) {
    const longer = url.endsWith("/") ? `${url}longer` : `${url}/longer`;
    const changed = `${text}\nThe link \`${url}\` as it was sent, and the page (${longer}).\n`;
    expect(definitionGaps(changed), url).toEqual([]);
  }
});
