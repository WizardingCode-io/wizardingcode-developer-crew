import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const DEFINITION = new URL(
  "../../../docs/specs/2026-11-15-researchers-team-design.md",
  import.meta.url,
);

const KINDS = [
  "Code and repository",
  "Documentation",
  "News and recent changes",
  "Good practice and proven solutions",
  "Product and market",
  "Flows and frontend",
  "The user's voice",
  "Academic",
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

const HEADER = "Tool or service";
const PART = " (read in part)";
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

const MARK = " (not opened)";
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

const LAST_HEADING = "## 8. What the code needs, not decided here";

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

/** How many rows of `table` have `name` as their first cell. */
const count = (table: string[][], name: string) => table.filter((row) => row[0] === name).length;

/**
 * Every clause of the researchers team's definition the text fails, by name; empty when it holds
 * all. It reads the document by section and by table row, so a name inside a longer cell, a URL
 * on another row or a row written twice does not pass. Section 7 holds tables of two shapes: a
 * row of four cells is a server, one of the user's links or a memory, a row of two is one of the
 * team's own skills.
 */
function definitionGaps(document: string): string[] {
  const gaps: string[] = [];
  const sources = rows(section(document, 3));
  const four = rows(section(document, 4));
  const five = section(document, 5);
  const tools = rows(section(document, 6));
  const seven = rows(section(document, 7));
  const servers = seven.filter((row) => row.length === 4 && row[0] !== HEADER);
  const own = seven.filter((row) => row.length === 2);
  for (const kind of KINDS) if (count(sources, kind) !== 1) gaps.push(`kind row: ${kind}`);
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
    const found = servers.filter((row) => row[0] === name);
    if (found.length !== 1 || found[0]?.[2] !== readAt) gaps.push(`server url: ${name}`);
  }
  if (servers.length !== SERVERS.length || servers.some((row) => !row[2]?.startsWith("https://")))
    gaps.push("server count");
  for (const skill of OWN_SKILLS) if (count(own, skill) !== 1) gaps.push(`own skill: ${skill}`);
  for (const [name, words, how] of FATES) {
    const second = servers.find((row) => row[0] === name)?.[1] ?? "";
    const holds = how === "starts" ? second.startsWith(words) : second.includes(words);
    if (!holds) gaps.push(`links: ${name}: ${words}`);
  }
  for (const url of NOT_OPENED) {
    const after = document.split(url).slice(1);
    if (after.length === 0 || after.some((rest) => !rest.startsWith(MARK)))
      gaps.push(`not opened: ${url}`);
  }
  const headings = document.split("\n").filter((line) => line.startsWith("## "));
  if (headings.at(-1) !== LAST_HEADING) gaps.push("last section");
  return gaps;
}

/** An absent document reads as empty text, so every test is registered and fails by name. */
const text = existsSync(DEFINITION) ? readFileSync(DEFINITION, "utf8") : "";

/** The text with the one line of section `number` that `picks` chooses changed by `change`. */
function withLine(
  number: number,
  what: string,
  picks: (line: string) => boolean,
  change: (line: string) => string,
): string {
  const part = section(text, number);
  const line = part.split("\n").find(picks);
  if (line === undefined) throw new Error(`no line holds ${what} in section ${number}`);
  const changed = part.replace(line, () => change(line));
  return text.replace(part, () => changed);
}

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
