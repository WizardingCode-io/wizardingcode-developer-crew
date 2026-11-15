import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const DEFINITION = new URL(
  "../../../docs/specs/2026-11-15-security-team-design.md",
  import.meta.url,
);

const SUBJECTS = [
  "Auth",
  "Personal data",
  "Payments",
  "Public API",
  "Data migration",
  "Infra",
  "Dependencies and supply chain",
  "Secrets",
  "Cryptography",
  "AI and agents",
];

const RUNNING = "The running application";
const KINDS = ["Static analysis", "Dependencies", "Secrets", "Infra", RUNNING, "AI and agents"];

const GDPR = "https://eur-lex.europa.eu/eli/reg/2016/679/oj";
/** The pages that were not read on 2026-11-15. */
const NOT_OPENED = [
  GDPR,
  "https://eur-lex.europa.eu/eli/reg_del/2018/389/oj",
  "https://eur-lex.europa.eu/eli/dir/2022/2555/oj",
  "https://eur-lex.europa.eu/eli/reg/2024/2847/oj",
  "https://eur-lex.europa.eu/eli/reg/2024/1689/oj",
  "https://atlas.mitre.org/",
];
const MARK = " (not opened)";

const ENVIRONMENT = "the project's own local or test environment";
const AUDIT = "The `security-audit` skill";
const AUDIT_WHEN = "one of the ten subjects";
const LIBRARY = "A community library by Mahipal Jangra";
const DISCLAIMER = "Not affiliated with Anthropic PBC";
const DOMAINS = [
  "Web Application Security",
  "API Security",
  "Identity & Access Management",
  "Cryptography",
  "AI Security",
  "Supply Chain Security",
  "DevSecOps",
  "Container Security",
  "Cloud Security",
  "Vulnerability Management",
  "Privacy Compliance",
  "Data Protection",
  "Compliance & Governance",
  "Mobile Security",
  "Penetration Testing",
  "Network Security",
];
const LAST_HEADING = "## 6. What the code needs, not decided here";

/** A row of section 5: words of its second cell and the URL of its "Read at" cell. */
const SERVERS: [string, string][] = [
  [AUDIT, "https://github.com/cloudflare/security-audit-skill"],
  [LIBRARY, "https://github.com/mukul975/Anthropic-Cybersecurity-Skills"],
  ["The Claude Security plugin", "https://code.claude.com/docs/en/claude-security"],
  ["The security guidance plugin", "https://code.claude.com/docs/en/security-guidance"],
  ["Trail of Bits' skills", "https://github.com/trailofbits/skills"],
  ["Semgrep's skills", "https://github.com/semgrep/skills"],
  ["Semgrep's local MCP server", "https://github.com/semgrep/semgrep/blob/develop/README.md"],
  ["GitHub's official server", "https://github.com/github/github-mcp-server"],
  ["OSV-Scanner's MCP server", "https://github.com/google/osv-scanner/releases/tag/v2.2.4"],
  ["Trivy's MCP server", "https://github.com/aquasecurity/trivy-mcp"],
  ["Scorecard's MCP server", "https://github.com/ossf/scorecard/blob/main/docs/mcp.md"],
  ["kubescape's MCP server", "https://github.com/kubescape/kubescape"],
  [
    'ZAP\'s "MCP Integration" add-on',
    "https://www.zaproxy.org/docs/desktop/addons/mcp-integration/",
  ],
  ["promptfoo's MCP server", "https://www.promptfoo.dev/docs/integrations/mcp-server/"],
  ["promptfoo's Claude Code plugin", "https://www.promptfoo.dev/docs/integrations/agent-skill/"],
  ["Semgrep's hosted MCP server", "https://docs.semgrep.dev/mcp/connect/claude-code"],
  [
    "Snyk Studio",
    "https://docs.snyk.io/integrations/snyk-studio-agentic-integrations/quickstart-guides-for-snyk-studio/claude-code-guide",
  ],
  ["SonarSource's MCP server", "https://github.com/SonarSource/sonarqube-mcp-server"],
  ["GitGuardian's MCP server", "https://github.com/GitGuardian/ggmcp"],
  ["Socket's MCP server", "https://docs.socket.dev/docs/remote-socket-mcp.md"],
  ["Prowler's Claude Code plugin", "https://docs.prowler.com/user-guide/ai-agents/claude-code.md"],
  ["Cloudflare's Claude Code plugin", "https://github.com/cloudflare/skills"],
  ["HashiCorp's Vault MCP server", "https://github.com/hashicorp/vault-mcp-server"],
  ["1Password's Claude Code plugin", "https://www.1password.dev/environments/claude-plugin"],
  ["Doppler's MCP server", "https://docs.doppler.com/docs/mcp"],
  ["Infisical's MCP server", "https://github.com/Infisical/infisical-mcp-server"],
  ["Stripe's MCP server", "https://docs.stripe.com/mcp"],
  ["Stripe's skills", "https://docs.stripe.com/skills.md"],
  ['PortSwigger\'s "MCP Server" extension', "https://github.com/PortSwigger/mcp-server"],
];

/** The text of one `## ` section, from its heading to the next; empty when the heading is absent. */
function section(text: string, number: number): string {
  const parts = text.split(/\n(?=## )/);
  return parts.find((part) => part.startsWith(`## ${number}. `)) ?? "";
}

/** The rows of a section's tables, each as its cells, the rule under a header left out. */
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
 * Every clause of the security team's definition the text fails, by name; empty when it holds all.
 * It reads the document by section and by table row, so a name inside a longer cell, a URL on
 * another row or a row written twice does not pass.
 */
function definitionGaps(document: string): string[] {
  const gaps: string[] = [];
  const sources = rows(section(document, 3));
  const tools = rows(section(document, 4));
  const five = rows(section(document, 5));
  for (const subject of SUBJECTS)
    if (sources.filter((row) => row[0] === subject).length !== 1)
      gaps.push(`subject row: ${subject}`);
  for (const kind of KINDS)
    if (tools.filter((row) => row[0] === kind).length !== 1) gaps.push(`kind row: ${kind}`);
  const rowsOf = (words: string) => five.filter((row) => row[1]?.includes(words));
  for (const [words, url] of SERVERS) {
    const found = rowsOf(words);
    if (found.length !== 1 || found[0]?.[2] !== url) gaps.push(`server url: ${words}`);
  }
  for (const url of NOT_OPENED) {
    const after = document.split(url).slice(1);
    if (after.length === 0 || after.some((rest) => !rest.startsWith(MARK)))
      gaps.push(`not opened: ${url}`);
  }
  const running = tools.find((row) => row[0] === RUNNING)?.[1] ?? "";
  if (!running.includes(ENVIRONMENT)) gaps.push("own environment: section 4");
  const library = rowsOf(LIBRARY)[0]?.[1] ?? "";
  if (!library.includes(ENVIRONMENT)) gaps.push("own environment: section 5");
  if (!library.includes(DISCLAIMER)) gaps.push("community exception: disclaimer");
  for (const domain of DOMAINS)
    if (!library.includes(domain)) gaps.push(`community exception: ${domain}`);
  if (!(rowsOf(AUDIT)[0]?.[1] ?? "").includes(AUDIT_WHEN)) gaps.push("audit when");
  const headings = document.split("\n").filter((line) => line.startsWith("## "));
  if (headings.at(-1) !== LAST_HEADING) gaps.push("last section");
  return gaps;
}

/** An absent document reads as empty text, so every test is registered and fails by name. */
const text = existsSync(DEFINITION) ? readFileSync(DEFINITION, "utf8") : "";

/** The text with the table row of section `number` that holds `words` changed by `change`. */
function withRow(number: number, words: string, change: (line: string) => string): string {
  const part = section(text, number);
  const line = part.split("\n").find((l) => l.startsWith("| ") && l.includes(words));
  if (line === undefined) throw new Error(`no row holds ${words} in section ${number}`);
  const changed = part.replace(line, () => change(line));
  return text.replace(part, () => changed);
}

const twice = (line: string) => `${line}\n${line}`;

test("2026-11-15-001 AC-1: the security team's definition holds every clause", () => {
  expect(definitionGaps(text)).toEqual([]);
});

test("2026-11-15-001 AC-1: a subject or a kind whose row leaves its table is named", () => {
  for (const subject of SUBJECTS)
    expect(definitionGaps(withRow(3, `| ${subject} |`, () => "")), subject).toContain(
      `subject row: ${subject}`,
    );
  for (const kind of KINDS)
    expect(definitionGaps(withRow(4, `| ${kind} |`, () => "")), kind).toContain(
      `kind row: ${kind}`,
    );
});

test("2026-11-15-001 AC-1: a subject or a kind whose row stands twice is named", () => {
  for (const subject of SUBJECTS)
    expect(definitionGaps(withRow(3, `| ${subject} |`, twice)), subject).toContain(
      `subject row: ${subject}`,
    );
  for (const kind of KINDS)
    expect(definitionGaps(withRow(4, `| ${kind} |`, twice)), kind).toContain(`kind row: ${kind}`);
});

test("2026-11-15-001 AC-1: a subject or a kind named only inside a longer first cell has no row", () => {
  const kind = withRow(4, "| Dependencies |", (line) =>
    line.replace("| Dependencies |", "| Dependencies and supply chain |"),
  );
  expect(definitionGaps(kind)).toContain("kind row: Dependencies");
  const subject = withRow(3, "| Secrets |", (line) =>
    line.replace("| Secrets |", "| Secrets and keys |"),
  );
  expect(definitionGaps(subject)).toContain("subject row: Secrets");
});

test("2026-11-15-001 AC-1: a server or a set of skills whose URL leaves its own row is named, also when the URL stands on another row", () => {
  for (const [words, url] of SERVERS) {
    const gap = `server url: ${words}`;
    const gone = withRow(5, words, (line) => line.replace(`| ${url} |`, "| |"));
    expect(definitionGaps(gone), words).toContain(gap);
    const moved = withRow(
      5,
      words,
      (line) => `${line.replace(`| ${url} |`, "| |")}\n| x | another row | ${url} | |`,
    );
    expect(definitionGaps(moved), `${words} moved`).toContain(gap);
  }
});

test("2026-11-15-001 AC-1: a server or a set of skills whose words pick two rows is named", () => {
  for (const [words] of SERVERS)
    expect(definitionGaps(withRow(5, words, twice)), words).toContain(`server url: ${words}`);
});

test("2026-11-15-001 AC-1: a page not read that loses its mark, or leaves the document, is named", () => {
  expect(text).not.toBe("");
  for (const url of NOT_OPENED) {
    const gap = `not opened: ${url}`;
    expect(definitionGaps(text.replace(`${url}${MARK}`, url)), url).toContain(gap);
    expect(definitionGaps(text.replaceAll(`${url}${MARK}`, "")), `${url} gone`).toContain(gap);
  }
});

test("2026-11-15-001 AC-1: the mark off the second place a page stands is named while the first keeps its own", () => {
  const marked = `${GDPR}${MARK}`;
  const first = text.indexOf(marked);
  expect(first).toBeGreaterThan(0);
  const second = text.indexOf(marked, first + marked.length);
  expect(second).toBeGreaterThan(first);
  const changed = `${text.slice(0, second)}${GDPR}${text.slice(second + marked.length)}`;
  expect(changed.indexOf(marked)).toBe(first);
  expect(definitionGaps(changed)).toContain(`not opened: ${GDPR}`);
});

test("2026-11-15-001 AC-1: the project's own environment off the running application's row or the library's row is named", () => {
  const tools = withRow(4, `| ${RUNNING} |`, (line) =>
    line.replace(ENVIRONMENT, "a test environment"),
  );
  expect(definitionGaps(tools)).toContain("own environment: section 4");
  const skills = withRow(5, LIBRARY, (line) => line.replace(ENVIRONMENT, "a test environment"));
  expect(definitionGaps(skills)).toContain("own environment: section 5");
});

test("2026-11-15-001 AC-1: the community library's disclaimer or one of its sixteen domains off its row is named", () => {
  const plain = withRow(5, LIBRARY, (line) => line.replace(DISCLAIMER, "a community project"));
  expect(definitionGaps(plain)).toContain("community exception: disclaimer");
  for (const domain of DOMAINS) {
    const changed = withRow(5, LIBRARY, (line) => line.replace(domain, "another domain"));
    expect(definitionGaps(changed), domain).toContain(`community exception: ${domain}`);
  }
});

test("2026-11-15-001 AC-1: the audit's row without the words on when the whole audit runs is named", () => {
  const changed = withRow(5, AUDIT, (line) => line.replace(AUDIT_WHEN, "a risk area"));
  expect(definitionGaps(changed)).toContain("audit when");
});

test("2026-11-15-001 AC-1: a section after the one on what the code needs is named", () => {
  expect(text).not.toBe("");
  expect(definitionGaps(`${text}\n## 7. More\n\nMore.\n`)).toContain("last section");
});
