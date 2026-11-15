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
  rows,
  section,
  withChangedLine,
} from "./definition-document.ts";

const DEFINITION = new URL("../../../docs/specs/2026-11-15-qa-team-design.md", import.meta.url);

const SUITE = "The suite in CI";
const FUZZING = "Property-based testing and fuzzing";
const SUBJECTS = [
  "A test per criterion, red first",
  "Nothing true by construction",
  "Preserve criteria and regression tests",
  "Observed criteria and their reason",
  "Behaviour, not implementation",
  "Mutation",
  "Fixtures with neutral names",
  "End to end",
  "Criteria observable and provable",
  "Strategy and levels",
  "Flaky tests and determinism",
  "Test doubles and boundaries",
  "Test data and state",
  "Property-based testing and fuzzing",
  "The suite in CI",
  "Testing systems with AI",
];

const DOUBLES = "Doubles, environments and test data";
const EVALS = "Evals of systems with AI";
const KINDS = [
  "Runners",
  "Mutation",
  "End to end and API",
  "Doubles, environments and test data",
  "Property-based testing and fuzzing",
  "Coverage, flakiness and test lint",
  "Evals of systems with AI",
];

const OWN_SKILLS = [
  "Testing",
  "Proof",
  "Test design",
  "End to end and API",
  "Measuring the tests",
  "Evals",
];

const NOT_OPENED_SENTENCE = "Five pages were not read on 2026-11-15";
/** The pages that were not read on 2026-11-15. */
const NOT_OPENED = [
  "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-sharing/anonymisation/",
  "https://www.edpb.europa.eu/system/files/2026-07/edpb_guidelines_202602_anonymisation_v1_en_0.pdf",
  "https://www.iso.org/standard/72089.html",
  "https://dl.acm.org/doi/10.1145/351240.351266",
  "https://medium.com/@kentbeck_7670/test-desiderata-94150638a4b3",
];

/** The words a row of section 3 or 4 holds: the clause, the section, the row's name, the words. */
const PHRASES: [string, number, string, string][] = [
  ["measure", 3, SUITE, "a measure, not a target"],
  ["own environment", 4, FUZZING, "the project's own local or test environment"],
  ["where already used", 4, DOUBLES, "only where the project already uses it"],
  ["cost bound", 4, EVALS, "a cost bound"],
];
const LAST_HEADING = "## 6. What the code needs, not decided here";

/** A row of section 5: words of its second cell and the whole text of its "Read at" cell. */
const SERVERS: [string, string][] = [
  ["Laravel's own server", "https://laravel.com/docs/13.x/boost"],
  ["promptfoo's MCP server", "https://www.promptfoo.dev/docs/integrations/mcp-server/"],
  ["Cypress's Cloud MCP server", "https://docs.cypress.io/cloud/integrations/cloud-mcp"],
  ["SonarSource's server", "https://github.com/SonarSource/sonarqube-mcp-server"],
  ["Sentry's server", "https://github.com/getsentry/sentry-mcp"],
  ["Datadog's server", "https://docs.datadoghq.com/bits_ai/mcp_server/setup/"],
  ["Chromatic's server", "https://www.chromatic.com/docs/mcp"],
  ["Checkly's server", "https://www.checklyhq.com/docs/ai/mcp-server/tools.md"],
  ["Trunk's server", "https://docs.trunk.io/flaky-tests/reference/mcp-reference"],
  ["LocalStack's server", "https://github.com/localstack/localstack-mcp-server"],
  ["GitHub's server", "https://github.com/github/github-mcp-server"],
  ["Buildkite's server", "https://buildkite.com/docs/apis/mcp-server"],
  [
    "The skill `webapp-testing`",
    "https://github.com/anthropics/skills/tree/main/skills/webapp-testing",
  ],
  ["The skill `playwright-cli`", "https://github.com/microsoft/playwright-cli"],
  ["Cypress's ai-toolkit", "https://github.com/cypress-io/ai-toolkit"],
  ["Testcontainers' skills", "https://github.com/testcontainers/claude-skills"],
  ["Currents' skill", "https://github.com/currents-dev/playwright-best-practices-skill"],
  ["Checkly's plugin", "https://github.com/checkly/checkly-plugin"],
  ["Allure's skills", "https://github.com/allure-framework/skills"],
  ["Laravel Boost's testing skill", "https://github.com/laravel/boost"],
  ["ai-evals-course's evals-skills", "https://github.com/ai-evals-course/evals-skills"],
  ["promptfoo's four skills", "https://www.promptfoo.dev/docs/integrations/agent-skill/"],
  ["Confident AI's eval-skills", "https://github.com/confident-ai/eval-skills"],
  ["Meridian Labs' inspect-skills", "https://github.com/meridianlabs-ai/inspect-skills"],
  ["obra's superpowers", "https://github.com/obra/superpowers"],
];

/** How reading alone is obtained on a server's row: the row's words and what its second cell holds. */
const READING_ALONE: [string, string][] = [
  ["Cypress's Cloud MCP server", "It reads alone, by design"],
  ["SonarSource's server", "SONARQUBE_READ_ONLY=true"],
  ["Sentry's server", "--skills=inspect"],
  ["Datadog's server", "mcp_read"],
  ["Chromatic's server", '`chromatic_mutate` to "Blocked"'],
  ["Checkly's server", "session permissions"],
  ["Trunk's server", "No write to the Trunk account was found"],
  ["LocalStack's server", "no read-only mode"],
  ["GitHub's server", "--read-only"],
  ["Buildkite's server", "https://mcp.buildkite.com/mcp/readonly"],
];

/** What Sentry's row says of `--skills=inspect`: that it reads alone was not read. */
const SENTRY = "Sentry's server";
const NOT_CONFIRMED = "is not confirmed";

/**
 * Every clause of the QA team's definition the text fails, by name; empty when it holds all. It
 * reads the document by section and by table row, so a name inside a longer cell, a URL on
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
  for (const [clause, number, name, words] of PHRASES) {
    const table = number === 3 ? sources : tools;
    if (!table.find((row) => row[0] === name)?.[1]?.includes(words)) gaps.push(clause);
  }
  for (const [words, holds] of READING_ALONE)
    if (!rowsOf(words)[0]?.[1]?.includes(holds)) gaps.push(`reading alone: ${words}`);
  if (!rowsOf(SENTRY)[0]?.[1]?.includes(NOT_CONFIRMED)) gaps.push("not confirmed");
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

test("2026-11-15-006 AC-1: the QA team's definition holds every clause", () => {
  expect(definitionGaps(text)).toEqual([]);
});

test("2026-11-15-006 AC-1: a subject, a kind or an own skill whose row leaves its table is named", () => {
  for (const [number, names, clause] of NAMED)
    for (const name of names)
      expect(definitionGaps(withRow(number, name, () => "")), name).toContain(`${clause}: ${name}`);
});

test("2026-11-15-006 AC-1: a subject, a kind or an own skill whose row stands twice is named", () => {
  for (const [number, names, clause] of NAMED)
    for (const name of names)
      expect(definitionGaps(withRow(number, name, twice)), name).toContain(`${clause}: ${name}`);
});

test("2026-11-15-006 AC-1: a name left only inside a longer first cell has no row", () => {
  const longer = (number: number, name: string) =>
    withRow(number, name, (line) => line.replace(`| ${name} |`, `| ${name} and more |`));
  expect(definitionGaps(longer(3, "Mutation"))).toContain("subject row: Mutation");
  expect(definitionGaps(longer(4, "Mutation"))).toContain("kind row: Mutation");
  expect(definitionGaps(longer(5, "Proof"))).toContain("own skill: Proof");
});

test("2026-11-15-006 AC-1: a subject's row with no URL, or a kind's row with nothing in it, is named", () => {
  const emptied = (line: string) => `${line.split(" | ")[0]} | |`;
  for (const subject of SUBJECTS)
    expect(definitionGaps(withRow(3, subject, emptied)), subject).toContain(
      `no source: ${subject}`,
    );
  for (const kind of KINDS)
    expect(definitionGaps(withRow(4, kind, emptied)), kind).toContain(`empty row: ${kind}`);
});

test("2026-11-15-006 AC-1: a row more in a table read by its first cell is named", () => {
  const more = (number: number, name: string) =>
    withRow(number, name, (line) => `${line}\n| One more | https://example.com/ |`);
  expect(definitionGaps(more(3, SUITE))).toEqual(["row count: section 3"]);
  expect(definitionGaps(more(4, EVALS))).toEqual(["row count: section 4"]);
  expect(definitionGaps(more(5, "Evals"))).toEqual(["row count: own skills"]);
});

test("2026-11-15-006 AC-1: a server or a set of skills whose URL leaves its own row is named, also when the URL stands on another row", () => {
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

test("2026-11-15-006 AC-1: a server or a set of skills whose words pick two rows is named", () => {
  for (const [words] of SERVERS)
    expect(definitionGaps(withServer(words, twice)), words).toContain(`server url: ${words}`);
});

test("2026-11-15-006 AC-1: a four-cell row the list does not name, with a URL or with none, or a row gone, is named", () => {
  const last = "obra's superpowers";
  const after = (row: string) => withServer(last, (line) => `${line}\n${row}`);
  const named = "| Another | Another server | https://example.com/ | `install` |";
  expect(definitionGaps(after(named))).toEqual(["server count"]);
  expect(definitionGaps(after("| Another | Another server | | `install` |"))).toEqual([
    "server count",
  ]);
  expect(definitionGaps(withServer(last, () => ""))).toContain("server count");
});

test("2026-11-15-006 AC-1: a page not read that loses its mark, or leaves the document, is named", () => {
  expect(text).not.toBe("");
  for (const url of NOT_OPENED) {
    const gap = `not opened: ${url}`;
    const marked = `${url}${NOT_OPENED_MARK}`;
    expect(definitionGaps(text.replace(marked, url)), url).toContain(gap);
    expect(definitionGaps(text.replaceAll(marked, "")), `${url} gone`).toContain(gap);
  }
});

test("2026-11-15-006 AC-1: a bare copy of a page not read is named while its first place keeps its mark", () => {
  for (const url of NOT_OPENED) {
    const marked = `${url}${NOT_OPENED_MARK}`;
    const first = text.indexOf(marked);
    expect(first, url).toBeGreaterThan(0);
    const changed = `${text}\nSee also ${url} for more.\n`;
    expect(changed.indexOf(marked), url).toBe(first);
    expect(definitionGaps(changed), url).toContain(`not opened: ${url}`);
  }
});

test("2026-11-15-006 AC-1: a sixth page marked as not read, or the sentence that counts them gone, is named", () => {
  expect(text).not.toBe("");
  const sixth = `${text}\nAlso https://example.com/sixth${NOT_OPENED_MARK}.\n`;
  expect(definitionGaps(sixth)).toEqual(["not opened count"]);
  const recounted = text.replace(NOT_OPENED_SENTENCE, "Some pages were not read");
  expect(definitionGaps(recounted)).toEqual(["not opened sentence"]);
});

test("2026-11-15-006 AC-1: a row of sources or of tools that loses the words it must hold is named", () => {
  for (const [clause, number, name, words] of PHRASES) {
    const changed = withRow(number, name, (line) => line.replace(words, "other words"));
    expect(definitionGaps(changed), clause).toEqual([clause]);
  }
});

test("2026-11-15-006 AC-1: a server's row that loses how reading alone is obtained from its second cell is named", () => {
  for (const [words, holds] of READING_ALONE) {
    const changed = withServer(words, (line) => {
      const [first, second, ...rest] = line.split(" | ");
      return [first, (second ?? "").replaceAll(holds, "another way"), ...rest].join(" | ");
    });
    expect(definitionGaps(changed), words).toEqual([`reading alone: ${words}`]);
  }
});

test("2026-11-15-006 AC-1: Sentry's row that no longer says reading alone is not confirmed is named", () => {
  const changed = withServer(SENTRY, (line) => line.replace(NOT_CONFIRMED, "is confirmed"));
  expect(definitionGaps(changed)).toEqual(["not confirmed"]);
});

test("2026-11-15-006 AC-1: a section after the one on what the code needs is named", () => {
  expect(text).not.toBe("");
  expect(definitionGaps(`${text}\n## 7. More\n\nMore.\n`)).toContain("last section");
});
