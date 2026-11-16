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

const DEFINITION = new URL("../../../docs/specs/2026-11-15-devops-team-design.md", import.meta.url);

const SUBJECTS = [
  "Pipelines",
  "Secrets",
  "Permissions and identities",
  "Rollback",
  "Hosts",
  "Reproducibility",
  "The project's environment",
  "Containers and images",
  "Infrastructure as code",
  "Deployment strategies and releases",
  "Observability and operation",
  "Platforms and hosting",
  "Cost",
  "Backups and disaster recovery",
  "The pipeline's supply chain",
];

const KINDS = [
  "Pipelines",
  "Secrets and identities",
  "Containers and images",
  "Infrastructure as code and Kubernetes",
  "Environment and reproducibility",
  "Deploy and releases",
  "Observability and operation",
  "Supply chain, backups and cost",
];

const OWN_SKILLS = [
  "DevOps",
  "Pipelines",
  "Secrets and identities",
  "Environment and containers",
  "Infrastructure as code",
  "Deploy and rollback",
  "Operation",
];

const NOT_OPENED_SENTENCE = "Seven pages were not read on 2026-11-15";
/** The pages that were not read on 2026-11-15. */
const NOT_OPENED = [
  "https://sealed-secrets.netlify.app/",
  "https://www.oreilly.com/library/view/infrastructure-as-code/9781098150341/",
  "https://circleci.com/docs/guides/toolkit/local-cli/",
  "https://www.infracost.io/docs/ai_editor_plugins/ai_skills/",
  "https://docs.aws.amazon.com/eks/latest/userguide/eks-mcp-introduction.html",
  "https://www.chainguard.dev/docs/platform/mcp-servers",
  "https://docs.port.io/ai-interfaces/port-mcp-server/installation",
];

/** The words a row of section 3 or 4 holds, which limit what the team does: section, row, words. */
const PHRASES: [number, string, string][] = [
  [3, "Platforms and hosting", "measured or estimated in writing"],
  [4, "Pipelines", "never triggers a deploy pipeline"],
  [4, "Secrets and identities", "never values"],
  [4, "Containers and images", "no push to a registry"],
  [4, "Containers and images", "at a pinned and verified version"],
  [4, "Infrastructure as code and Kubernetes", "never apply or destroy"],
  [4, "Deploy and releases", "a person's decision"],
  [4, "Supply chain, backups and cost", "never over production"],
  [3, "Secrets", "the one the team proposes on a new project"],
  [4, "Infrastructure as code and Kubernetes", "the one the team proposes on a new project"],
  [3, "Secrets", "licensor IBM, only where the project already uses it"],
  [3, "Reproducibility", "used only where the project already uses it"],
  [
    3,
    "Infrastructure as code",
    "which is not an open-source licence, only where the project already uses it",
  ],
  [
    3,
    "Infrastructure as code",
    '"serverless customer agreement", only where the project already uses it',
  ],
  [
    3,
    "The pipeline's supply chain",
    "not under an open-source licence, only where the project already uses it",
  ],
  [
    4,
    "Secrets and identities",
    "only where the project already uses it, the team using `kubectl auth can-i`",
  ],
  [4, "Secrets and identities", "only where the project already uses Vault"],
  [
    4,
    "Containers and images",
    "not an open-source licence, only where the project already uses it",
  ],
  [
    4,
    "Infrastructure as code and Kubernetes",
    "only where the project already uses Terraform under its own licence",
  ],
  [
    4,
    "Environment and reproducibility",
    "only where the project already uses it, the team using process-compose",
  ],
  [
    4,
    "Observability and operation",
    "not an open-source licence today, only where the project already uses it",
  ],
];

/** The user's decisions on the numbered rules of section 5: how the rule's line opens, what it holds. */
const RULES: [string, string][] = [
  ["2. ", "only where the project uses the tool, and always reading"],
  ["2. ", "only after the building item shows the install command with the switch"],
  ["2. ", "is not installed until the building item shows that it only reads: Infracost's"],
  [
    "3. ",
    "No server that acts on a cloud account, a platform or a cluster enters, with or without a read-only switch",
  ],
  ["3. ", "The two exceptions are Argo CD's and Flux's servers"],
  ["4. ", "is not installed until the building item shows that it only reads: Sentry's"],
  ["5. ", "installs on a host or spends enters with its set"],
  ["5. ", "is a person's decision"],
  ["6. ", "Vault's server and the server of Cloudflare's plugin are left out there as well"],
  ["4. ", "only where the project already uses the service, and always reading"],
  ["5. ", "and the skills alone"],
  ["6. ", "without the server that acts on the account"],
  ["6. ", "no server that acts on an account enters by a set of skills or by another team's row"],
];
const LAST_HEADING = "## 6. What the code needs, not decided here";

/** A row of section 5: words of its second cell and the whole text of its "Read at" cell. */
const SERVERS: [string, string][] = [
  ["five tools on the OpenTofu Registry", "https://github.com/opentofu/opentofu-mcp-server"],
  ["HashiCorp's server, MPL-2.0", "https://github.com/hashicorp/terraform-mcp-server"],
  ["The Prometheus project's server", "https://github.com/prometheus/prometheus-mcp"],
  ["Official Kubecost MCP server", "https://github.com/kubecost/mcp-kubecost"],
  ["built into OpenCost", "https://github.com/opencost/opencost"],
  ["inside the CLI (`infracost mcp`)", "https://github.com/infracost/agent-skills"],
  ["Ansible Automation Platform", "https://github.com/ansible/aap-mcp-server"],
  ["The server of argoproj-labs", "https://github.com/argoproj-labs/mcp-for-argocd"],
  ["the Flux Operator's MCP server, on the machine", "https://fluxoperator.dev/docs/mcp/install/"],
  ["for the runs and the logs of GitHub Actions", "https://github.com/github/github-mcp-server"],
  ["Official MCP Server for Buildkite", "https://buildkite.com/docs/apis/mcp-server"],
  [
    "Microsoft's remote server",
    "https://learn.microsoft.com/en-us/azure/devops/mcp-server/remote-mcp-server?view=azure-devops",
  ],
  ["Harness' official MCP Server", "https://github.com/harness/mcp-server"],
  ["Rootly's server, Apache-2.0", "https://github.com/rootlyhq/rootly-mcp-server"],
  ["incident.io's server, hosted", "https://docs.incident.io/ai/remote-mcp"],
  ["Grafana Labs' server", "https://github.com/grafana/mcp-grafana"],
  ["the route for a self-hosted Sentry", "https://github.com/getsentry/sentry-mcp"],
  ["one address per Datadog site", "https://docs.datadoghq.com/bits_ai/mcp_server/setup/"],
  ["HashiCorp's agent-skills", "https://github.com/hashicorp/agent-skills"],
  ["Official Pulumi Agent Skills", "https://github.com/pulumi/agent-skills"],
  ["Three public skills", "https://github.com/fluxcd/agent-skills"],
  ["Official Buildkite skills", "https://github.com/buildkite/skills"],
  ["Infracost's agent-skills, by Infracost", "https://github.com/infracost/agent-skills"],
  ["Render's skills, by Render", "https://github.com/render-oss/skills"],
  ["Fly's skills, by Fly.io", "https://github.com/superfly/skills"],
  ["Railway's skill, by Railway", "https://github.com/railwayapp/railway-skills"],
  ["Grafana's skills, by Grafana Labs", "https://github.com/grafana/skills"],
  ["in `netlify/context-and-tools`", "https://github.com/netlify/context-and-tools"],
  ["Cloudflare's skills, by Cloudflare", "https://github.com/cloudflare/skills"],
  ["in `datadog-labs/agent-skills`", "https://github.com/datadog-labs/agent-skills"],
  ["in `getsentry/skills`", "https://github.com/getsentry/skills"],
  ["Vercel's vercel-plugin", "https://github.com/vercel/vercel-plugin"],
];

/** How reading alone is obtained on a server's row: the row's words and what its second cell holds. */
const READING_ALONE: [string, string][] = [
  ["five tools on the OpenTofu Registry", "It reads alone"],
  ["HashiCorp's server, MPL-2.0", "It reads by default: the default `--toolsets=registry` is kept"],
  [
    "The Prometheus project's server",
    "need `--dangerous.enable-tsdb-admin-tools`, which is never passed",
  ],
  ["Official Kubecost MCP server", "It reads alone"],
  ["built into OpenCost", "It reads alone, by queries"],
  ["inside the CLI (`infracost mcp`)", "no read-only mode was found"],
  [
    "Ansible Automation Platform",
    "It reads by default: write operations need `ALLOW_WRITE_OPERATIONS=true`",
  ],
  ["The server of argoproj-labs", "Read-only with the switch `MCP_READ_ONLY=true`"],
  ["the Flux Operator's MCP server, on the machine", "Read-only with the flag `--read-only`"],
  ["for the runs and the logs of GitHub Actions", "the flag `--read-only` or `GITHUB_READ_ONLY=1`"],
  ["Official MCP Server for Buildkite", "the address `https://mcp.buildkite.com/mcp/readonly`"],
  ["Microsoft's remote server", "Read-only with the header `X-MCP-Readonly: true`"],
  ["Harness' official MCP Server", "Read-only with `HARNESS_READ_ONLY=true`"],
  ["Rootly's server, Apache-2.0", "Read-only with `?readonly=true`"],
  ["incident.io's server, hosted", "Read-only is chosen at the OAuth approval"],
  ["Grafana Labs' server", "Read-only with `--disable-write`"],
  ["the route for a self-hosted Sentry", "a group is granted with `--skills=inspect`"],
  ["one address per Datadog site", "reading alone is by Datadog's permission `mcp_read`"],
];

const NOT_UNTIL = "not installed until";
const GITHUB_HELD =
  "not installed until the building item shows the command with the read-only switch and without the secret scanning tools";
/** The servers held until the building item shows something: the row's words and the words that hold it. */
const UNCONFIRMED: [string, string][] = [
  ["inside the CLI (`infracost mcp`)", NOT_UNTIL],
  ["the route for a self-hosted Sentry", NOT_UNTIL],
  ["for the runs and the logs of GitHub Actions", GITHUB_HELD],
];

/** The line of section 5 that states a numbered rule; empty when the section has none. */
const ruleOf = (document: string, opens: string) => numberedLine(document, 5, opens);

/**
 * Every clause of the DevOps team's definition the text fails, by name; empty when it holds all.
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
  for (const [number, name, words] of PHRASES) {
    const table = number === 3 ? sources : tools;
    if (!table.find((row) => row[0] === name)?.[1]?.includes(words))
      gaps.push(`limit: ${name}: ${words}`);
  }
  for (const [opens, words] of RULES)
    if (!ruleOf(document, opens).includes(words)) gaps.push(`rule ${opens.trim()} ${words}`);
  for (const [words, holds] of READING_ALONE)
    if (!rowsOf(words)[0]?.[1]?.includes(holds)) gaps.push(`reading alone: ${words}`);
  for (const [words, holds] of UNCONFIRMED)
    if (!rowsOf(words)[0]?.[1]?.includes(holds)) gaps.push(`not until: ${words}`);
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

/** The second cell of the four-cell row of section 5 that `words` pick; empty when none does. */
const secondCellOf = (words: string) =>
  rows(section(text, 5)).find((row) => row.length === 4 && row[1]?.includes(words))?.[1] ?? "";

/** A row of section 5 with `words` taken off its second cell alone, at every place. */
const withoutInSecond = (picks: string, words: string) =>
  withServer(picks, (line) => {
    const [first, second, ...rest] = line.split(" | ");
    return [first, (second ?? "").replaceAll(words, "other words"), ...rest].join(" | ");
  });

const twice = (line: string) => `${line}\n${line}`;
const NAMED: [number, string[], string][] = [
  [3, SUBJECTS, "subject row"],
  [4, KINDS, "kind row"],
  [5, OWN_SKILLS, "own skill"],
];

test("2026-11-15-008 AC-1: the DevOps team's definition holds every clause", () => {
  expect(definitionGaps(text)).toEqual([]);
});

test("2026-11-15-008 AC-1: a subject, a kind or an own skill whose row leaves its table is named", () => {
  for (const [number, names, clause] of NAMED)
    for (const name of names)
      expect(definitionGaps(withRow(number, name, () => "")), name).toContain(`${clause}: ${name}`);
});

test("2026-11-15-008 AC-1: a subject, a kind or an own skill whose row stands twice is named", () => {
  for (const [number, names, clause] of NAMED)
    for (const name of names)
      expect(definitionGaps(withRow(number, name, twice)), name).toContain(`${clause}: ${name}`);
});

test("2026-11-15-008 AC-1: a name left only inside a longer first cell has no row", () => {
  const longer = (number: number, name: string) =>
    withRow(number, name, (line) => line.replace(`| ${name} |`, `| ${name} and more |`));
  expect(definitionGaps(longer(3, "Pipelines"))).toContain("subject row: Pipelines");
  expect(definitionGaps(longer(4, "Pipelines"))).toContain("kind row: Pipelines");
  expect(definitionGaps(longer(5, "Operation"))).toContain("own skill: Operation");
});

test("2026-11-15-008 AC-1: a subject's row with no URL, or a kind's row with nothing in it, is named", () => {
  const emptied = (line: string) => `${line.split(" | ")[0]} | |`;
  for (const subject of SUBJECTS)
    expect(definitionGaps(withRow(3, subject, emptied)), subject).toContain(
      `no source: ${subject}`,
    );
  for (const kind of KINDS)
    expect(definitionGaps(withRow(4, kind, emptied)), kind).toContain(`empty row: ${kind}`);
});

test("2026-11-15-008 AC-1: a row more in a table read by its first cell is named", () => {
  const more = (number: number, name: string) =>
    withRow(number, name, (line) => `${line}\n| One more | https://example.com/ |`);
  expect(definitionGaps(more(3, "Cost"))).toEqual(["row count: section 3"]);
  expect(definitionGaps(more(4, "Pipelines"))).toEqual(["row count: section 4"]);
  expect(definitionGaps(more(5, "Operation"))).toEqual(["row count: own skills"]);
});

test("2026-11-15-008 AC-1: a server or a set of skills whose URL leaves its own row is named, also when the URL stands on another row", () => {
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

test("2026-11-15-008 AC-1: a server or a set of skills whose words pick two rows is named", () => {
  for (const [words] of SERVERS)
    expect(definitionGaps(withServer(words, twice)), words).toContain(`server url: ${words}`);
});

test("2026-11-15-008 AC-1: a four-cell row the list does not name, with a URL or with none, or a row gone, is named", () => {
  const last = SERVERS.at(-1)?.[0] ?? "";
  const after = (row: string) => withServer(last, (line) => `${line}\n${row}`);
  const named = "| Another | Another server | https://example.com/ | `install` |";
  expect(definitionGaps(after(named))).toEqual(["server count"]);
  expect(definitionGaps(after("| Another | Another server | | `install` |"))).toEqual([
    "server count",
  ]);
  expect(definitionGaps(withServer(last, () => ""))).toContain("server count");
});

test("2026-11-15-008 AC-1: a page not read that loses its mark, or leaves the document, is named", () => {
  expect(text).not.toBe("");
  for (const url of NOT_OPENED) {
    const gap = `not opened: ${url}`;
    const marked = `${url}${NOT_OPENED_MARK}`;
    expect(definitionGaps(text.replace(marked, url)), url).toContain(gap);
    expect(definitionGaps(text.replaceAll(marked, "")), `${url} gone`).toContain(gap);
  }
});

test("2026-11-15-008 AC-1: a bare copy of a page not read is named while its first place keeps its mark", () => {
  for (const url of NOT_OPENED) {
    const marked = `${url}${NOT_OPENED_MARK}`;
    const first = text.indexOf(marked);
    expect(first, url).toBeGreaterThan(0);
    const changed = `${text}\nSee also ${url} for more.\n`;
    expect(changed.indexOf(marked), url).toBe(first);
    expect(definitionGaps(changed), url).toContain(`not opened: ${url}`);
  }
});

test("2026-11-15-008 AC-1: one more page marked as not read, or the sentence that counts them gone, is named", () => {
  expect(text).not.toBe("");
  const more = `${text}\nAlso https://example.com/one-more${NOT_OPENED_MARK}.\n`;
  expect(definitionGaps(more)).toEqual(["not opened count"]);
  const recounted = text.replace(NOT_OPENED_SENTENCE, "Some pages were not read");
  expect(definitionGaps(recounted)).toEqual(["not opened sentence"]);
});

test("2026-11-15-008 AC-1: a row of sources or of tools that loses a limit on what the team does is named", () => {
  for (const [number, name, words] of PHRASES) {
    const table = rows(section(text, number));
    expect(table.find((row) => row[0] === name)?.[1], name).toContain(words);
    const changed = withRow(number, name, (line) => line.replaceAll(words, "other words"));
    expect(definitionGaps(changed), `${name}: ${words}`).toContain(`limit: ${name}: ${words}`);
  }
});

test("2026-11-15-008 AC-1: a rule of section 5 that loses the user's decision is named", () => {
  for (const [opens, words] of RULES) {
    const rule = ruleOf(text, opens);
    expect(rule, words).toContain(words);
    const changed = text.replace(rule, () => rule.replaceAll(words, "other words"));
    expect(definitionGaps(changed), words).toContain(`rule ${opens.trim()} ${words}`);
  }
});

test("2026-11-15-008 AC-1: a server's row that loses how reading alone is obtained from its second cell is named", () => {
  for (const [words, holds] of READING_ALONE) {
    expect(secondCellOf(words), words).toContain(holds);
    expect(definitionGaps(withoutInSecond(words, holds)), words).toEqual([
      `reading alone: ${words}`,
    ]);
  }
});

test("2026-11-15-008 AC-1: a server whose reading is not confirmed and whose row no longer holds it back is named", () => {
  for (const [words, holds] of UNCONFIRMED) {
    expect(secondCellOf(words), words).toContain(holds);
    expect(definitionGaps(withoutInSecond(words, holds)), words).toEqual([`not until: ${words}`]);
  }
});

test("2026-11-16-001 AC-2: GitHub's row held by the switch alone, the secret scanning tools unsaid, is named", () => {
  const words = "for the runs and the logs of GitHub Actions";
  expect(secondCellOf(words).split(GITHUB_HELD)).toHaveLength(2);
  const old = "not installed until the building item shows the command with the switch";
  const changed = withServer(words, (line) => line.replaceAll(GITHUB_HELD, old));
  expect(definitionGaps(changed)).toEqual([`not until: ${words}`]);
});

test("2026-11-15-008 AC-1: a section after the one on what the code needs is named", () => {
  expect(text).not.toBe("");
  expect(definitionGaps(`${text}\n## 7. More\n\nMore.\n`)).toContain("last section");
});
