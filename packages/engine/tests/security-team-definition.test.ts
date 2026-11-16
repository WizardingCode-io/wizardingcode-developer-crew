import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import {
  LISTED_HEADER as HEADER,
  hasText,
  hasUrl,
  listedGaps,
  NOT_OPENED_MARK as MARK,
  markGaps,
  namedRowGaps,
  numberedLine,
  rows,
  section,
  withChangedLine,
} from "./definition-document.ts";

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
const NOT_OPENED_SENTENCE = "Six pages were not read on 2026-11-15";

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
/** The two rows the user's decision of 2026-11-15 changed: the row's words and what its cell holds. */
const CLOUDFLARE = "Cloudflare's Claude Code plugin";
const SKILLS_ALONE = "Installed as the skills alone";
const VAULT = "HashiCorp's Vault MCP server";
const NOT_INSTALLED = "Not installed";
/** Rule 3 says a server that acts on an account or can show a secret does not enter by it. */
const RULE_THREE = "3. ";
const LEFT_OUT = [
  "HashiCorp Vault's server is left out",
  "of Cloudflare's plugin the skills alone are installed",
];
/** The user's decisions of 2026-11-15 on the other servers that write or act, in rule 3's words. */
const DECIDED = [
  "a server of this table that writes or acts stays only with a reading mode and is installed with it, and one that can return a secret's value to the model is left out",
  "Semgrep AppSec Platform's server is installed at its read-only address, Infisical's with its allow-list of reading tools and its values masked, and SonarQube's with `SONARQUBE_READ_ONLY=true`",
  "GitGuardian's, Prowler's and Stripe's stay with a token or a key whose scopes, role or permissions only read, which was not the option recommended",
  "none of the three is installed until the building item shows that the writing tools are hidden",
  "Semgrep AppSec Platform's, GitGuardian's, Prowler's and Stripe's servers are not installed until the building item shows that no tool of the server returns a secret's value to the model",
  "1Password's and Doppler's servers and Burp Suite's extension are left out",
];
/** The servers that stay with a reading mode: the name, the row's words, what its second cell holds. */
const READING_MODE: [string, string, string[]][] = [
  [
    "Semgrep AppSec Platform",
    "Semgrep's hosted MCP server",
    ["https://semgrep.dev/api/mcp/read-only"],
  ],
  [
    "Infisical",
    "Infisical's MCP server",
    [
      "INFISICAL_ENABLED_TOOLS=list-projects,list-secrets,get-secret,list-folders",
      "INFISICAL_MASK_SECRET_VALUES=true",
    ],
  ],
  [
    "SonarQube",
    "SonarSource's MCP server",
    ["SONARQUBE_READ_ONLY=true", "the server is installed with it"],
  ],
];
const NOT_UNTIL = "not installed until the building item shows that the writing tools are hidden";
/** The servers whose reading alone is not shown yet: the name and the row's words. */
const HELD: [string, string][] = [
  ["GitGuardian", "GitGuardian's MCP server"],
  ["Prowler", "Prowler's Claude Code plugin"],
  ["Stripe", "Stripe's MCP server"],
];
const NO_SECRET = "no tool of the server returns a secret's value to the model";
/** The servers not yet shown to keep a secret's value from the model: the name and the row's words. */
const UNSHOWN: [string, string][] = [
  ["Semgrep AppSec Platform", "Semgrep's hosted MCP server"],
  ["GitGuardian", "GitGuardian's MCP server"],
  ["Prowler", "Prowler's Claude Code plugin"],
  ["Stripe", "Stripe's MCP server"],
];
/** The servers that are left out: the name and the row's words. */
const OUT: [string, string][] = [
  ["1Password", "1Password's Claude Code plugin"],
  ["Doppler", "Doppler's MCP server"],
  ["Burp Suite", 'PortSwigger\'s "MCP Server" extension'],
  ["Vault", VAULT],
  ["OWASP ZAP", 'ZAP\'s "MCP Integration" add-on'],
  ["promptfoo", "promptfoo's MCP server"],
  ["Snyk Studio", "Snyk Studio"],
  ["kubescape", "kubescape's MCP server"],
];
/** Rule 2 holds the servers of the tools' table to the rule of rule 3: the user's decision of 2026-11-16. */
const RULE_TWO = "2. ";
const RULE_TWO_HOLDS =
  "a server of that table that writes or acts stays only with a reading mode and is installed with it, and one with none is left out and its tool runs from the command line, in the project's own local or test environment";
/** Rule 2's sentences on the three servers left out and on the two that stay under a condition. */
const RULE_TWO_NAMES = [
  "OWASP ZAP's add-on, promptfoo's server and kubescape's server are left out",
  "Semgrep's local server stays as the server alone, without the Guardian plugin and with metrics off",
  "GitHub's server stays, in reading mode and without its two secret scanning tools",
];
/** GitHub's server is held until its command is shown: the row's words and what its second cell holds. */
const GITHUB = "GitHub's official server";
const GITHUB_HELD =
  "not installed until the building item shows the command with the read-only switch and without the secret scanning tools";
/** Semgrep's local server is held until a scan is shown to return no secret: the row's words, the phrase. */
const SEMGREP_LOCAL = "Semgrep's local MCP server";
const SCAN_HELD =
  "not installed until the building item shows that a scan returns no secret's value to the model";
const SERVER_ALONE =
  'installed as the server alone, without the "Semgrep Guardian" plugin and its remote form';
/** How Trivy's server is installed: the row's words and what its second cell holds. */
const TRIVY = "Trivy's MCP server";
const TRIVY_HOLDS = ["without `--use-aqua-platform`", "at a pinned and verified version"];
/** The line that installs Stripe's skills without the server: the row's words and what its last cell holds. */
const STRIPE_SKILLS = "Stripe's skills";
const LINE_USED = "`npx skills add https://docs.stripe.com` is the line used";

/** The numbered line of section 5 that states rule 3; empty when the section has none. */
const ruleThreeOf = (document: string) => numberedLine(document, 5, RULE_THREE);

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

/**
 * Every clause of the security team's definition the text fails, by name; empty when it holds all.
 * It reads the document by section and by table row, so a name inside a longer cell, a URL on
 * another row or a row written twice does not pass. A row of sources with no URL, a row of tools
 * with nothing in it, a four-cell row the list does not name and a marked page the list does not
 * hold are each named too.
 */
function definitionGaps(document: string): string[] {
  const gaps: string[] = [];
  const sources = rows(section(document, 3));
  const tools = rows(section(document, 4));
  const five = rows(section(document, 5));
  gaps.push(...namedRowGaps(sources, SUBJECTS, "subject row", "no source", hasUrl));
  gaps.push(...namedRowGaps(tools, KINDS, "kind row", "empty row", hasText));
  const rowsOf = (words: string) => five.filter((row) => row[1]?.includes(words));
  for (const [words, url] of SERVERS) {
    const found = rowsOf(words);
    if (found.length !== 1 || found[0]?.[2] !== url) gaps.push(`server url: ${words}`);
  }
  if (sources.length !== SUBJECTS.length + 1) gaps.push("row count: section 3");
  if (tools.length !== KINDS.length + 1) gaps.push("row count: section 4");
  gaps.push(...listedGaps(five, HEADER, SERVERS.length));
  gaps.push(...markGaps(document, NOT_OPENED, MARK, "not opened"));
  if (!document.includes(NOT_OPENED_SENTENCE)) gaps.push("not opened sentence");
  const running = tools.find((row) => row[0] === RUNNING)?.[1] ?? "";
  if (!running.includes(ENVIRONMENT)) gaps.push("own environment: section 4");
  const library = rowsOf(LIBRARY)[0]?.[1] ?? "";
  if (!library.includes(ENVIRONMENT)) gaps.push("own environment: section 5");
  if (!library.includes(DISCLAIMER)) gaps.push("community exception: disclaimer");
  for (const domain of DOMAINS)
    if (!library.includes(domain)) gaps.push(`community exception: ${domain}`);
  if (!(rowsOf(AUDIT)[0]?.[1] ?? "").includes(AUDIT_WHEN)) gaps.push("audit when");
  if (!rowsOf(CLOUDFLARE)[0]?.[1]?.includes(SKILLS_ALONE)) gaps.push("skills alone: Cloudflare");
  for (const [name, words] of OUT)
    if (!rowsOf(words)[0]?.[3]?.startsWith(NOT_INSTALLED)) gaps.push(`not installed: ${name}`);
  for (const [name, words, held] of READING_MODE)
    if (!held.every((mode) => rowsOf(words)[0]?.[1]?.includes(mode)))
      gaps.push(`reading mode: ${name}`);
  for (const [name, words] of HELD)
    if (!rowsOf(words)[0]?.[1]?.includes(NOT_UNTIL)) gaps.push(`not until: ${name}`);
  for (const [name, words] of UNSHOWN)
    if (!rowsOf(words)[0]?.[1]?.includes(NO_SECRET)) gaps.push(`no secret shown: ${name}`);
  const ruleThree = ruleThreeOf(document);
  for (const words of [...LEFT_OUT, ...DECIDED])
    if (!ruleThree.includes(words)) gaps.push(`rule 3: ${words}`);
  if (!numberedLine(document, 5, RULE_TWO).includes(RULE_TWO_HOLDS))
    gaps.push(`rule 2: ${RULE_TWO_HOLDS}`);
  for (const words of RULE_TWO_NAMES)
    if (!numberedLine(document, 5, RULE_TWO).includes(words)) gaps.push(`rule 2: ${words}`);
  if (!rowsOf(GITHUB)[0]?.[1]?.includes(GITHUB_HELD)) gaps.push("not until: GitHub");
  if (!rowsOf(SEMGREP_LOCAL)[0]?.[1]?.includes(SCAN_HELD)) gaps.push("not until: Semgrep local");
  if (!rowsOf(SEMGREP_LOCAL)[0]?.[1]?.includes(SERVER_ALONE)) gaps.push("alone: Semgrep local");
  for (const words of TRIVY_HOLDS)
    if (!rowsOf(TRIVY)[0]?.[1]?.includes(words)) gaps.push(`how installed: Trivy: ${words}`);
  if (!rowsOf(STRIPE_SKILLS)[0]?.[3]?.includes(LINE_USED)) gaps.push("line used: Stripe's skills");
  const headings = document.split("\n").filter((line) => line.startsWith("## "));
  if (headings.at(-1) !== LAST_HEADING) gaps.push("last section");
  return gaps;
}

/** An absent document reads as empty text, so every test is registered and fails by name. */
const text = existsSync(DEFINITION) ? readFileSync(DEFINITION, "utf8") : "";

/** The text with the table row of section `number` that holds `words` changed by `change`. */
const withRow = (number: number, words: string, change: (line: string) => string) =>
  withChangedLine(
    text,
    number,
    words,
    (line) => line.startsWith("| ") && line.includes(words),
    change,
  );

const twice = (line: string) => `${line}\n${line}`;

/** The text with `held` taken off the second cell of the row of section 5 that holds `words`. */
const withoutInSecond = (words: string, held: string) =>
  withRow(5, words, (line) => {
    const [first, second, ...rest] = line.split(" | ");
    return [first, (second ?? "").replaceAll(held, "other words"), ...rest].join(" | ");
  });

/** The second cell of the row of section 5 that holds `words`. */
const secondCellOf = (words: string) =>
  rows(section(text, 5)).find((row) => row[1]?.includes(words))?.[1];

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

test("2026-11-15-004 AC-2: a subject's row with no URL, or a kind's row with nothing in it, is named", () => {
  const emptied = (line: string) => `${line.split(" | ")[0]} | |`;
  for (const subject of SUBJECTS)
    expect(definitionGaps(withRow(3, `| ${subject} |`, emptied)), subject).toContain(
      `no source: ${subject}`,
    );
  for (const kind of KINDS)
    expect(definitionGaps(withRow(4, `| ${kind} |`, emptied)), kind).toContain(
      `empty row: ${kind}`,
    );
});

test("2026-11-15-004 AC-2: a four-cell row the list does not name, with a URL or with none, is named", () => {
  const [first] = SERVERS[0] ?? [""];
  const after = (row: string) => withRow(5, first, (line) => `${line}\n${row}`);
  const named = "| Another | Another server | https://example.com/ | `install` |";
  expect(definitionGaps(after(named))).toEqual(["server count"]);
  expect(definitionGaps(after("| Another | Another server | | `install` |"))).toEqual([
    "server count",
  ]);
  expect(definitionGaps(withRow(5, first, () => ""))).toContain("server count");
});

test("2026-11-15-004 AC-2: a seventh page marked as not read, or the sentence that counts them gone, is named", () => {
  expect(text).not.toBe("");
  const seventh = `${text}\nAlso https://example.com/seventh${MARK}.\n`;
  expect(definitionGaps(seventh)).toEqual(["not opened count"]);
  const recounted = text.replace(NOT_OPENED_SENTENCE, "Some pages were not read");
  expect(definitionGaps(recounted)).toEqual(["not opened sentence"]);
});

test("2026-11-15-004 AC-2: a row more in a table read by its first cell is named", () => {
  const more = (number: number, name: string) =>
    withRow(number, name, (line) => `${line}\n| One more | https://example.com/ |`);
  expect(definitionGaps(more(3, `| ${SUBJECTS[0]} |`))).toEqual(["row count: section 3"]);
  expect(definitionGaps(more(4, `| ${KINDS[0]} |`))).toEqual(["row count: section 4"]);
});

test("2026-11-15-008 AC-3: Cloudflare's row without the skills alone, Vault's row no longer not installed, or rule 3 without either, is named", () => {
  const five = rows(section(text, 5));
  expect(five.find((row) => row[1]?.includes(CLOUDFLARE))?.[1]).toContain(SKILLS_ALONE);
  const plugin = withRow(5, CLOUDFLARE, (line) => line.replaceAll(SKILLS_ALONE, "Installed whole"));
  expect(definitionGaps(plugin)).toEqual(["skills alone: Cloudflare"]);
  expect(five.find((row) => row[1]?.includes(VAULT))?.[3]).toStartWith(NOT_INSTALLED);
  const vault = withRow(5, VAULT, (line) => line.replace(`| ${NOT_INSTALLED}`, "| Installed"));
  expect(definitionGaps(vault)).toEqual(["not installed: Vault"]);
  const rule = ruleThreeOf(text);
  for (const words of LEFT_OUT) {
    expect(rule, words).toContain(words);
    const changed = text.replace(rule, () => rule.replaceAll(words, "other words"));
    expect(definitionGaps(changed), words).toEqual([`rule 3: ${words}`]);
  }
});

test("2026-11-15-009 AC-1: a server that stays whose second cell loses its reading mode is named", () => {
  for (const [name, words, held] of READING_MODE)
    for (const mode of held) {
      expect(secondCellOf(words), mode).toContain(mode);
      expect(definitionGaps(withoutInSecond(words, mode)), mode).toEqual([`reading mode: ${name}`]);
    }
});

test("2026-11-15-009 AC-1: a server held until its reading alone is shown whose second cell no longer says so is named", () => {
  for (const [name, words] of HELD) {
    expect(secondCellOf(words), name).toContain(NOT_UNTIL);
    expect(definitionGaps(withoutInSecond(words, NOT_UNTIL)), name).toEqual([`not until: ${name}`]);
  }
});

test("2026-11-15-009 AC-1: a server not yet shown to return no secret whose second cell no longer says so is named", () => {
  for (const [name, words] of UNSHOWN) {
    expect(secondCellOf(words), name).toContain(NO_SECRET);
    expect(definitionGaps(withoutInSecond(words, NO_SECRET)), name).toEqual([
      `no secret shown: ${name}`,
    ]);
  }
});

test("2026-11-15-009 AC-1: a server left out whose last cell no longer opens with not installed is named", () => {
  const five = rows(section(text, 5));
  for (const [name, words] of OUT) {
    expect(five.find((row) => row[1]?.includes(words))?.[3], name).toStartWith(NOT_INSTALLED);
    const changed = withRow(5, words, (line) => line.replace(`| ${NOT_INSTALLED}`, "| Installed"));
    expect(definitionGaps(changed), name).toEqual([`not installed: ${name}`]);
  }
});

test("2026-11-15-009 AC-1: rule 3 that loses a decision on the servers that write or act is named", () => {
  const rule = ruleThreeOf(text);
  for (const words of DECIDED) {
    expect(rule.split(words), words).toHaveLength(2);
    const changed = text.replace(rule, () => rule.replaceAll(words, "other words"));
    expect(definitionGaps(changed), words).toEqual([`rule 3: ${words}`]);
  }
});

test("2026-11-16-001 AC-1: rule 2 that loses the decision on the servers of the tools' table is named", () => {
  const rule = numberedLine(text, 5, RULE_TWO);
  expect(rule.split(RULE_TWO_HOLDS)).toHaveLength(2);
  const changed = text.replace(rule, () => rule.replaceAll(RULE_TWO_HOLDS, "other words"));
  expect(definitionGaps(changed)).toEqual([`rule 2: ${RULE_TWO_HOLDS}`]);
});

test("2026-11-16-001 AC-1: GitHub's row that no longer holds the server until its command is shown is named", () => {
  expect(secondCellOf(GITHUB)?.split(GITHUB_HELD)).toHaveLength(2);
  expect(definitionGaps(withoutInSecond(GITHUB, GITHUB_HELD))).toEqual(["not until: GitHub"]);
});

test("2026-11-16-001 AC-1: the row of Stripe's skills that no longer says which line is used is named", () => {
  const last = rows(section(text, 5)).find((row) => row[1]?.includes(STRIPE_SKILLS))?.[3];
  expect(last?.split(LINE_USED)).toHaveLength(2);
  const changed = withRow(5, STRIPE_SKILLS, (line) => line.replace(LINE_USED, "One line"));
  expect(definitionGaps(changed)).toEqual(["line used: Stripe's skills"]);
});

test("2026-11-16-002 AC-1: rule 2 that loses its sentence on what is left out, on Semgrep's local server or on GitHub's is named", () => {
  const rule = numberedLine(text, 5, RULE_TWO);
  for (const words of RULE_TWO_NAMES) {
    expect(rule.split(words), words).toHaveLength(2);
    const changed = text.replace(rule, () => rule.replaceAll(words, "other words"));
    expect(definitionGaps(changed), words).toEqual([`rule 2: ${words}`]);
  }
});

test("2026-11-16-002 AC-1: the row of Semgrep's local server that no longer holds it until a scan is shown is named", () => {
  expect(secondCellOf(SEMGREP_LOCAL)?.split(SCAN_HELD)).toHaveLength(2);
  expect(definitionGaps(withoutInSecond(SEMGREP_LOCAL, SCAN_HELD))).toEqual([
    "not until: Semgrep local",
  ]);
});

test("2026-11-16-002 AC-1: the row of Semgrep's local server that no longer keeps the plugin and its remote form out is named", () => {
  expect(secondCellOf(SEMGREP_LOCAL)?.split(SERVER_ALONE)).toHaveLength(2);
  expect(definitionGaps(withoutInSecond(SEMGREP_LOCAL, SERVER_ALONE))).toEqual([
    "alone: Semgrep local",
  ]);
});

test("2026-11-16-002 AC-1: Trivy's row that loses how its server is installed is named", () => {
  for (const words of TRIVY_HOLDS) {
    expect(secondCellOf(TRIVY)?.split(words), words).toHaveLength(2);
    expect(definitionGaps(withoutInSecond(TRIVY, words)), words).toEqual([
      `how installed: Trivy: ${words}`,
    ]);
  }
});
