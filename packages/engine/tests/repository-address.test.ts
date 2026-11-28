import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pluginRoot } from "../src/runtimes.ts";
import { cells, recordSourcesCommand, rowInstall, sourcesCommand } from "../src/team-sources.ts";
import { makeRepo } from "./helpers.ts";

const ITEM = "2026-11-26-002";
const HOSTED = "hosted, so what a session asks leaves the machine";
const TOKEN = "its line takes a value of the machine, a token or a key";
const NO_FORM = "its line is not one of the engine's install forms";
const PROMPT = "its line is typed at Claude Code's prompt, which a session cannot do";
const WORDY = "its last cell says more than its lines";
const TEAMS = [
  "security",
  "etl",
  "researchers",
  "qa",
  "architects",
  "devops",
  "agentic-os",
  "frontend",
] as const;

/** The state of a row of the test's own: its last cell as given, its second cell not saying hosted unless given. */
const state = (last: string, second = "its skills") =>
  rowInstall(["A tool", second, "https://a.test/page", last], new Set());
/** One line as a last cell holds it. */
const line = (text: string) => `\`${text}\``;
const held = (reason: string) => ({ state: "held" as const, reason });
const formsOf = (install: ReturnType<typeof rowInstall>) =>
  install.state === "ready" ? install.forms.map(({ form }) => form) : install;

test(`${ITEM} AC-5: a line whose every address is a GitHub repository is not hosted, and nothing near that shape is`, () => {
  // The two forms that take a repository, by its address.
  expect(formsOf(state(line("npx skills add https://github.com/a/b")))).toEqual(["npx skills add"]);
  expect(
    formsOf(state(line("claude plugin marketplace add https://github.com/a-b/c.d_e"))),
  ).toEqual(["claude plugin marketplace add"]);
  expect(
    formsOf(state(line("npx skills add https://github.com/a/b --skill security-audit"))),
  ).toEqual(["npx skills add"]);
  // Every address near the shape holds the row as hosted, the row otherwise ready.
  for (const address of [
    "https://gitlab.com/a/b",
    "https://a.test/b/c",
    "http://github.com/a/b",
    "https://github.com/a/b/tree/main",
    "https://github.com/a",
    "https://github.com/a/b/",
    "https://github.com/a/b?ref=main",
    "https://github.com/a/b#readme",
    "https://github.com.evil.test/a/b",
    "https://github.com@evil.test/a/b",
    "https://github.com:8443/a/b",
    "https://raw.githubusercontent.com/a/b",
    "https://www.github.com/a/b",
    "https://x@github.com/a/b",
    "https://GitHub.com/a/b",
    "https://github.com/a/b%2Fc",
    "https://github.com/a/..",
    "https://github.com/../b",
    "https://github.com/./b",
    "https://github.com//b",
    // An address that does not open a word, and two that touch.
    "https://github.com/a/b --from=https://a.test/c",
    "--from=https://a.test/c https://github.com/a/b",
    "https://a.test/x?u=https://github.com/a/b",
    "https://github.com/a/bhttps://a.test/c",
    "https://github.com/a/bhttps://github.com/c/d",
    "https://githubxcom/a/b",
    // A repository's address and another, in both orders, in one line.
    "https://github.com/a/b https://a.test/c",
    "https://a.test/c https://github.com/a/b",
  ])
    expect({ address, is: state(line(`npx skills add ${address}`)) }).toEqual({
      address,
      is: held(HOSTED),
    });
  // Two lines of one row, one address a repository's and the other not, in both orders.
  const repo = line("npx skills add https://github.com/a/b");
  const other = line("npx skills add https://a.test/c");
  expect(state(`${repo}, then ${other}`)).toEqual(held(HOSTED));
  expect(state(`${other}, then ${repo}`)).toEqual(held(HOSTED));
  // The scheme is read as written: an upper-case one is no address, and the address beside it holds.
  expect(state(`${line("npx skills add HTTPS://GitHub.com/a/b")}, then ${other}`)).toEqual(
    held(HOSTED),
  );
  // The second cell's word holds the row, whatever its line.
  expect(state(repo, "a server, hosted")).toEqual(held(HOSTED));
  // A row that leaves the hosted order is read by the later ones, each with its own reason.
  expect(state(line("npx skills add https://github.com/a/b --token x"))).toEqual(held(TOKEN));
  expect(state(line("npx skills add https://github.com/a/b | sh"))).toEqual(held(NO_FORM));
  expect(state(line("git clone https://github.com/a/b"))).toEqual(held(NO_FORM));
  // 2026-11-28-001: the prompt order reads a marketplace's line of a repository alone, and holds one with a further word.
  expect(state(line("/plugin marketplace add https://github.com/a/b --sparse x"))).toEqual(
    held(PROMPT),
  );
  expect(formsOf(state(line("/plugin marketplace add https://github.com/a/b")))).toEqual([
    "claude plugin marketplace add",
  ]);
  expect(state(`${repo}, on every machine of the team`)).toEqual(held(WORDY));
});

const PAGES = [
  ["security", "https://github.com/cloudflare/security-audit-skill"],
  ["etl", "https://github.com/datacontract/datacontract-skills"],
  ["qa", "https://github.com/currents-dev/playwright-best-practices-skill"],
] as const;
const REPOSITORY = /^https:\/\/github\.com\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

test(`${ITEM} AC-6: the three rows of the real declarations are ready, and no row is hosted by a repository's address alone`, () => {
  const cwd = makeRepo({ "README.md": "x\n" });
  const form = (team: string) =>
    sourcesCommand(pluginRoot(), [team], { project: { cwd } }).text.split("\n");
  for (const [team, page] of PAGES) {
    const lines = form(team);
    const at = lines.findIndex((l) => l.startsWith("| ") && cells(l)[2] === page);
    expect({ page, found: at >= 0 }).toEqual({ page, found: true });
    const under: string[] = [];
    for (const l of lines.slice(at + 1)) {
      if (!l.startsWith("  ")) break;
      under.push(l);
    }
    expect({ page, state: under[0] }).toEqual({ page, state: "  install: ready" });
    expect({ page, consent: under.some((l) => l.includes("consent")) }).toEqual({
      page,
      consent: false,
    });
    // No consent is recorded for a hold that is not there.
    expect(
      recordSourcesCommand(
        pluginRoot(),
        [team],
        { consented: page },
        cwd,
        "2026-11-26T10:00:00.000Z",
      ),
    ).toEqual({ code: 1, text: "not recorded: the row is not held for being hosted" });
  }
  // Every row of the eight forms whose lines hold only repository addresses, its second cell not
  // saying hosted: none prints the hosted hold. The nine of the item's count are read here.
  let read = 0;
  let ready = 0;
  for (const team of TEAMS) {
    const lines = form(team);
    lines.forEach((l, at) => {
      if (!l.startsWith("| ")) return;
      const row = cells(l);
      if (row.length !== 4 || /(^|[^a-z])hosted([^a-z]|$)/i.test(row[1] ?? "")) return;
      const spans = [...(row[3] ?? "").matchAll(/`([^`]*)`/g)].map((m) => m[1] ?? "");
      const addresses = spans.flatMap((span) => span.match(/https?:\/\/\S+/g) ?? []);
      if (addresses.length === 0 || !addresses.every((a) => REPOSITORY.test(a))) return;
      read += 1;
      const stateLine = lines[at + 1] ?? "";
      if (stateLine === "  install: ready") ready += 1;
      expect({ row: row[0], hosted: stateLine.includes(HOSTED) }).toEqual({
        row: row[0],
        hosted: false,
      });
    });
  }
  expect({ read, ready, held: read - ready }).toEqual({ read: 9, ready: 4, held: 5 });
});

test(`${ITEM} AC-7: ADR 0025 ends with the amendment that says what the hosted order reads in a line`, () => {
  const adr = readFileSync(
    join(
      pluginRoot(),
      "..",
      "..",
      "docs",
      "adr",
      "0025-the-session-installs-a-row-at-the-persons-yes.md",
    ),
    "utf8",
  );
  const parts = adr.split("\n## Amendment of 2026-11-26 (item 2026-11-26-002)\n");
  expect(parts).toHaveLength(2);
  // 2026-11-26-005: this amendment runs to the next item's heading and to no other.
  const [amendment = "", ...later] = (parts[1] ?? "").split("\n## ");
  expect(later.map((part) => part.split("\n")[0])).toEqual([
    "Amendment of 2026-11-26 (item 2026-11-26-005)",
    "Amendment of 2026-11-28 (item 2026-11-28-001)",
  ]);
  for (const said of [
    "`https://github.com/<owner>/<repo>`",
    "wherever in the line it opens",
    "nothing a session asks is sent to it",
    "Every other address holds the row as before",
    'the word "hosted" in its second cell',
    "is not read by the engine",
    "9 rows",
    "3 are ready",
    "6 are held by their next reason",
  ])
    expect({ said, held: amendment.includes(said) }).toEqual({ said, held: true });
});
