import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const DEFINITION = new URL(
  "../../../docs/specs/2026-11-14-backend-team-stacks-design.md",
  import.meta.url,
);

const STACKS = ["PHP", "Node / TypeScript", "Python", "Go", "Rust"];

const LAST_HEADING = "## 6. What the code needs, not decided here";
const SUPABASE_READ_ONLY = "https://mcp.supabase.com/mcp?read_only=true";
const NEON_READ_ONLY = "https://mcp.neon.tech/mcp?readonly=true";
const NEON_SENTENCE = "the command sets no read-only mode";
const GUIDE_PAGE = "on the site's one page, `https://dominikwro.github.io/`";
/** Supabase's server URL with no parameter after it, in any quoting. */
const SUPABASE_BARE = /mcp\.supabase\.com\/mcp(?![?\w])/;
const NOT_STABLE = ["three servers", "Drizzle Kit", "gopls", "Datadog"];

/** A server or a set of skills of section 5: words of its row's second cell and the URL of its "Read at" cell. */
const SERVERS: [string, string][] = [
  ["GitHub's official server", "https://github.com/github/github-mcp-server"],
  ["Errors in production: Sentry", "https://mcp.sentry.dev/"],
  ["Errors in production: Rollbar", "https://docs.rollbar.com/docs/mcp-server-setup"],
  ["Errors in production: Datadog", "https://docs.datadoghq.com/bits_ai/mcp_server/setup/"],
  ["Errors in production: Bugsnag", "https://developer.smartbear.com/smartbear-mcp"],
  ["Google MCP Toolbox for Databases", "https://mcp-toolbox.dev/documentation/introduction/"],
  ["Supabase's hosted server", "https://supabase.com/docs/guides/getting-started/mcp"],
  ["Neon's hosted server", "https://neon.com/docs/ai/neon-mcp-server"],
  ["Laravel Boost", "https://laravel.com/framework/docs/boost"],
  [
    "Laravel Herd's MCP server",
    "https://herd.laravel.com/docs/macos/advanced-usage/ai-integrations",
  ],
  ["Symfony AI Mate", "https://symfony.com/doc/current/ai/components/mate.html"],
  ["API Platform's skills", "https://github.com/api-platform/skillset"],
  ["WordPress Agent Skills", "https://github.com/WordPress/agent-skills"],
  ["WordPress MCP Adapter", "https://github.com/WordPress/mcp-adapter"],
  ["Drizzle Kit's MCP server", "https://orm.drizzle.team/docs/drizzle-kit-mcp"],
  ["Drizzle's skill", "https://orm.drizzle.team/docs/drizzle-kit-skills"],
  ["Prisma's MCP server", "https://www.prisma.io/docs/ai/tools/mcp-server"],
  ["Prisma's skills", "https://www.prisma.io/docs/ai/tools/skills"],
  ["Deno's skills", "https://github.com/denoland/skills"],
  ["FastAPI's skill", "https://fastapi.tiangolo.com/ai-development/"],
  ["Litestar's skills", "https://github.com/litestar-org/litestar-skills"],
  ["Astral's plugin", "https://github.com/astral-sh/agent-plugins"],
  ["Pydantic's skills", "https://github.com/pydantic/skills"],
  [
    "gopls's built-in MCP server",
    "https://github.com/golang/tools/blob/master/gopls/doc/features/mcp.md",
  ],
];

const ASTRAL = "Astral's plugin";

/** The name a server's or a skill's pair fails under: Astral's is the clause this item corrected. */
function gapOf(words: string): string {
  return words === ASTRAL ? "astral" : `server url: ${words}`;
}

/** The text of one `## ` section, from its heading to the next; empty when the heading is absent. */
function section(text: string, number: number): string {
  const parts = text.split(/\n(?=## )/);
  return parts.find((part) => part.startsWith(`## ${number}. `)) ?? "";
}

/** The rows of a section's tables, each as its cells, the header and the rule left out. */
function rows(part: string): string[][] {
  return part
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| :-"))
    .map((line) =>
      line
        .slice(1, line.endsWith("|") ? -1 : undefined)
        .split("|")
        .map((cell) => cell.trim()),
    );
}

/**
 * Every clause of the backend team's definition the text fails, by name; empty when it holds all.
 * It reads the document by section and by table row, so a name inside another word, a URL on
 * another row or a heading in another place does not pass (item 2026-11-14-008).
 */
function definitionGaps(text: string): string[] {
  const gaps: string[] = [];
  const sources = rows(section(text, 3));
  const frameworks = rows(section(text, 4));
  const five = rows(section(text, 5));
  for (const stack of STACKS) {
    if (sources.filter((row) => row[0] === stack).length !== 1)
      gaps.push(`stack row: ${stack} in section 3`);
    if (frameworks.filter((row) => row[0] === stack).length !== 1)
      gaps.push(`stack row: ${stack} in section 4`);
  }
  const rowOf = (words: string) =>
    five.find((row) => row[0]?.includes(words) || row[1]?.includes(words));
  for (const [words, url] of SERVERS) {
    if (rowOf(words)?.[2] === url) continue;
    gaps.push(gapOf(words));
  }
  if (!rowOf("Google MCP Toolbox for Databases")?.[1]?.includes("SELECT-only"))
    gaps.push("select-only");
  const supabase = rowOf("Supabase's hosted server")?.[3] ?? "";
  if (!supabase.includes(SUPABASE_READ_ONLY) || SUPABASE_BARE.test(supabase))
    gaps.push("supabase read-only");
  const neon = (rowOf("Neon's hosted server") ?? []).join(" | ");
  if (!neon.includes(NEON_READ_ONLY) || !neon.includes(NEON_SENTENCE)) gaps.push("neon read-only");
  const notStable =
    section(text, 6)
      .split("\n")
      .find((line) => line.includes("not stable")) ?? "";
  if (!NOT_STABLE.every((word) => notStable.includes(word))) gaps.push("not stable");
  const guide =
    text.split("\n").find((line) => line.startsWith("`https://dominikwro.github.io/` is")) ?? "";
  if (!guide.includes(GUIDE_PAGE)) gaps.push("python guide");
  const headings = text.split("\n").filter((line) => line.startsWith("## "));
  if (headings.at(-1) !== LAST_HEADING) gaps.push("last section");
  return gaps;
}

const text = readFileSync(DEFINITION, "utf8");

/** The text with one line of section `number` changed by `change`: the first table row that holds `words`, or the first line when no row does. */
function withLine(number: number, words: string, change: (line: string) => string): string {
  const part = section(text, number);
  const lines = part.split("\n").filter((l) => l.includes(words));
  const line = lines.find((l) => l.startsWith("| ")) ?? lines[0];
  if (line === undefined) throw new Error(`no line holds ${words} in section ${number}`);
  return text.replace(part, part.replace(line, change(line)));
}

test("2026-11-14-008 AC-2: the backend team's definition holds every clause", () => {
  expect(definitionGaps(text)).toEqual([]);
});

test("2026-11-14-008 AC-2: a stack whose row leaves the sources table or the frameworks table is named", () => {
  for (const stack of STACKS)
    for (const number of [3, 4]) {
      const changed = withLine(number, `| ${stack} |`, () => "");
      expect(definitionGaps(changed), `${stack} ${number}`).toContain(
        `stack row: ${stack} in section ${number}`,
      );
    }
});

test("2026-11-14-008 AC-2: a stack named only inside another word has no row", () => {
  const changed = withLine(3, "| Go |", (line) => line.replace("| Go |", "| Google |"));
  expect(definitionGaps(changed)).toContain("stack row: Go in section 3");
});

test("2026-11-14-008 AC-2: a server or a skill whose URL leaves its own row is named, also when the URL stands on another row", () => {
  for (const [words, url] of SERVERS) {
    const gap = gapOf(words);
    // The cell alone: a URL may also open a longer one in the row's other cells.
    const gone = withLine(5, words, (line) => line.replace(`| ${url} |`, "| |"));
    expect(definitionGaps(gone), words).toContain(gap);
    const moved = withLine(
      5,
      words,
      (line) => `${line.replace(`| ${url} |`, "| |")}\n| x | another row | ${url} | |`,
    );
    expect(definitionGaps(moved), `${words} moved`).toContain(gap);
  }
});

test("2026-11-14-008 AC-2: the Astral row read at the repository's earlier name is named", () => {
  const changed = withLine(5, ASTRAL, (line) =>
    line.replace("astral-sh/agent-plugins |", "astral-sh/claude-code-plugins |"),
  );
  expect(definitionGaps(changed)).toContain("astral");
});

test("2026-11-14-008 AC-2: SELECT-only off Google MCP Toolbox's row is named, also when it stands on another row", () => {
  const gone = withLine(5, "Google MCP Toolbox for Databases", (line) =>
    line.replace("SELECT-only", "limited"),
  );
  expect(definitionGaps(gone)).toContain("select-only");
  const moved = withLine(
    5,
    "Google MCP Toolbox for Databases",
    (line) => `${line.replace("SELECT-only", "limited")}\n| x | a SELECT-only user | | |`,
  );
  expect(definitionGaps(moved)).toContain("select-only");
});

test("2026-11-14-008 AC-2: Supabase's command without the read-only URL is named, also when the URL stands in another cell", () => {
  const bare = withLine(5, "Supabase's hosted server", (line) =>
    line.replace(`"${SUPABASE_READ_ONLY}"`, '"https://mcp.supabase.com/mcp"'),
  );
  expect(definitionGaps(bare)).toContain("supabase read-only");
  const elsewhere = withLine(5, "Supabase's hosted server", (line) =>
    line
      .replace(`"${SUPABASE_READ_ONLY}"`, '"https://mcp.supabase.com/mcp"')
      .replace("Supabase's hosted server", `Supabase's hosted server at ${SUPABASE_READ_ONLY}`),
  );
  expect(definitionGaps(elsewhere)).toContain("supabase read-only");
});

test("2026-11-14-008 AC-2: a bare server URL beside the read-only one in Supabase's command is named, in any quoting", () => {
  for (const bare of [
    '"https://mcp.supabase.com/mcp"',
    "https://mcp.supabase.com/mcp",
    "'https://mcp.supabase.com/mcp'",
  ]) {
    const changed = withLine(5, "Supabase's hosted server", (line) =>
      line.replace(`"${SUPABASE_READ_ONLY}"`, `"${SUPABASE_READ_ONLY}" or ${bare}`),
    );
    expect(definitionGaps(changed), bare).toContain("supabase read-only");
  }
});

test("2026-11-14-008 AC-2: Neon's row without its read-only URL or without the sentence on its command is named", () => {
  const noUrl = withLine(5, "Neon's hosted server", (line) => line.replace(NEON_READ_ONLY, ""));
  expect(definitionGaps(noUrl)).toContain("neon read-only");
  const noSentence = withLine(5, "Neon's hosted server", (line) => line.replace(NEON_SENTENCE, ""));
  expect(definitionGaps(noSentence)).toContain("neon read-only");
});

test("2026-11-14-008 AC-2: the line of the servers that are not stable is named when it loses a server or its count", () => {
  for (const word of NOT_STABLE) {
    const changed = withLine(6, "not stable", (line) => line.replaceAll(word, "x"));
    expect(definitionGaps(changed), word).toContain("not stable");
  }
});

test("2026-11-14-008 AC-2: the Python guide's paragraph without the page its facts were read at is named", () => {
  const noPhrase = withLine(3, GUIDE_PAGE, (line) => line.replace("on the site's one page, ", ""));
  expect(definitionGaps(noPhrase)).toContain("python guide");
  const noUrl = withLine(3, GUIDE_PAGE, (line) =>
    line.replace(GUIDE_PAGE, "on the site's one page"),
  );
  expect(definitionGaps(noUrl)).toContain("python guide");
});

test("2026-11-14-008 AC-2: a section after section 6 is named", () => {
  expect(definitionGaps(`${text}\n## 7. More\n\ntext\n`)).toContain("last section");
});
