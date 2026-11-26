import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import { pluginRoot } from "../src/runtimes.ts";
import { readSourcesRecord } from "../src/sources-record.ts";
import {
  cells,
  declarationSections,
  LAST_LINE,
  recordSourcesCommand,
  rowInstall,
  sourcesCommand,
} from "../src/team-sources.ts";
import { cliIo, hookContext, makeRepo, tempDir, testEnv } from "./helpers.ts";

const ITEM = "2026-11-24-001";
const OTHERS = [
  "security",
  "etl",
  "researchers",
  "qa",
  "architects",
  "devops",
  "agentic-os",
  "frontend",
] as const;
type Team = (typeof OTHERS)[number];
const HEADER = "| Tool or service | Server or skills | Read at | How it is installed |";
const RULE = "| :- | :- | :- | :- |";
const NOT_TOLD =
  // 2026-11-24-002: a line under a ready row says it where a manifest or a file can.
  "not told: whether this project uses the tool or the service of a held row, and of a ready row save where the line under it says; the heading over a row says when it applies";
const NO_ENTRY = "  project: not told, nothing in a manifest or a file shows what this row is for";
const NO_PROJECT =
  "this folder is in no project (no .git at or above it, no .crew in it): nothing was read of it";
const USAGE =
  "usage: crew sources [<team> [<n>]] | crew sources <team> --project | crew sources <team> --installed <page> | crew sources <team> --declined <page> | crew sources <team> --consented <page>";
const NOT_STABLE = "not stable by its own row";
const HOSTED = "hosted, so what a session asks leaves the machine";
const NO_COMMAND = "its row gives no command";
const WORDY = "its last cell says more than its lines";
const BY_HEADING = "its table is left out or held by the definition";
const OWED = "its row says what is still owed or to be checked before it enters";
const OTHER_TEAM = "another team's declaration holds a row at its page";
const heldLine = (reason: string) => `  install: held, ${reason}`;
const SKILLS_NOTE =
  "    npx skills add: downloads and runs the npm package `skills` first, which the row does not say is its publisher's";
const noRow = (team: string) =>
  `no row of this project is read at that page: crew sources ${team} --project prints the rows and their pages`;
const MORE =
  "more than one row of this team is read at that page, so a record by its page would not say which";

const real = (team: string) => readFileSync(join(pluginRoot(), "teams", `${team}.md`), "utf8");

/** A declaration of the test's own: each heading with one install table of the rows given. */
const declaration = (...sections: [heading: string, ...rows: string[]][]) =>
  sections
    .map(([heading, ...rows]) => [heading, "", HEADER, RULE, ...rows, ""].join("\n"))
    .join("\n");
const row = (name: string, page: string, last: string, second = "its skills") =>
  `| ${name} | ${second} | ${page} | ${last} |`;
const READY = "`npx skills add a/b`";

/** A plugin root of the test's own: the eight teams' files, each empty of tables but the ones given; `absent` leaves a file out. */
function ownRoot(given: Partial<Record<Team, string>>, absent: readonly Team[] = []): string {
  const root = tempDir("crew-own-root-");
  mkdirSync(join(root, "teams"));
  for (const team of OTHERS)
    if (!absent.includes(team))
      writeFileSync(join(root, "teams", `${team}.md`), given[team] ?? "## 3. Nothing\n");
  return root;
}
const form = (root: string, team: string, cwd: string) =>
  sourcesCommand(root, [team], { project: { cwd } });
const linesOf = (answer: { text: string }) => answer.text.split("\n");
/** The state line printed under the row that holds a text. */
function stateOf(lines: readonly string[], holds: string): string {
  const at = lines.findIndex((line) => line.startsWith("| ") && line.includes(holds));
  if (at < 0) throw new Error(`no row holds ${holds}`);
  return lines[at + 1] ?? "";
}
const state = (last: string, over: { second?: string; third?: string } = {}) =>
  rowInstall(
    ["A tool", over.second ?? "its skills", over.third ?? "https://a.test/p", last],
    new Set(),
  );
const reasonOf = (install: ReturnType<typeof rowInstall>) =>
  install.state === "held" ? install.reason : install.state;

/** The headings and rows the form prints for a declaration, read by the test's own walk of the file. */
function skeleton(text: string): string[] {
  const out: string[] = [];
  for (const section of declarationSections(text)) {
    let header: string | null = null;
    let said = false;
    for (const line of section.lines) {
      if (!line.startsWith("|")) header = null;
      else if (header === null) header = line;
      else if (line.startsWith("| ") && !line.startsWith("| :-") && header === HEADER) {
        if (!said) out.push(`${section.heading.replace(/^#+ /, "")}:`);
        said = true;
        out.push(line);
      }
    }
  }
  return out;
}

const READY_PAGES: Record<Team, string[]> = {
  security: [
    // 2026-11-26-002: a repository's address in a line is no hosted server.
    "https://github.com/cloudflare/security-audit-skill",
  ],
  etl: [
    "https://github.com/planetscale/database-skills",
    "https://github.com/ClickHouse/agent-skills",
    "https://github.com/prisma/skills",
    "https://github.com/datahub-project/datahub-skills",
    "https://github.com/metabase/agent-skills",
    "https://github.com/looker-open-source/looker-skills",
    "https://atlasgo.io/guides/ai-tools/agent-skills",
    // 2026-11-26-002: a repository's address in a line is no hosted server.
    "https://github.com/datacontract/datacontract-skills",
  ],
  researchers: ["https://github.com/WizardingCode-io/wizardingcode-mem"],
  qa: [
    "https://github.com/cypress-io/ai-toolkit",
    // 2026-11-26-002: a repository's address in a line is no hosted server.
    "https://github.com/currents-dev/playwright-best-practices-skill",
  ],
  architects: [
    "https://github.com/pactflow/pactflow-agent-skills",
    "https://github.com/apollographql/skills",
    "https://github.com/mattpocock/skills",
  ],
  devops: [],
  "agentic-os": [],
  frontend: [],
};
const HELD_COUNT: Record<Team, number> = {
  // 2026-11-26-002: one row fewer in security, ETL and QA.
  security: 28,
  etl: 63,
  researchers: 24,
  qa: 25,
  architects: 46,
  devops: 32,
  "agentic-os": 80,
  frontend: 54,
};

test(`${ITEM} AC-11: each of the eight teams' forms prints every row of its install tables under its heading with its state, the ready rows pinned by their page`, async () => {
  const project = makeRepo({ "README.md": "x\n" });
  const run = cliIo(project, testEnv());
  for (const team of OTHERS) {
    const answer = await run("sources", team, "--project");
    expect({ team, code: answer.code, err: answer.err }).toEqual({ team, code: 0, err: "" });
    const lines = answer.out.trimEnd().split("\n");
    const expected = skeleton(real(team));
    const rows = expected.filter((line) => line.startsWith("| "));
    expect(rows.length).toBeGreaterThan(20);
    expect(lines[0]).toBe(join(pluginRoot(), "teams", `${team}.md`));
    // The headings and the rows, in the declaration's order, with nothing of a state between them.
    const body = lines.slice(1, -3);
    expect(body.filter((line) => !line.startsWith("  "))).toEqual(expected);
    // Every row is followed by a state's line.
    body.forEach((line, at) => {
      if (line.startsWith("| ")) expect(body[at + 1]?.startsWith("  install: ")).toBe(true);
    });
    const ready = body
      .filter((line, at) => line.startsWith("| ") && body[at + 1] === "  install: ready")
      .map((line) => cells(line)[2] ?? "");
    expect({ team, ready }).toEqual({ team, ready: READY_PAGES[team] });
    const held = body.filter((line) => line.startsWith("  install: held, ")).length;
    expect({ team, held }).toEqual({ team, held: HELD_COUNT[team] });
    expect(ready.length + held).toBe(rows.length);
    const count = (n: number) => `${n} row${n === 1 ? "" : "s"}`;
    expect(lines.slice(-3)).toEqual([
      `ready: ${count(ready.length)}; held: ${count(held)}`,
      NOT_TOLD,
      LAST_LINE,
    ]);
  }
  // In no project: the backend form's answer for that case, and no row.
  const nowhere = await cliIo(tempDir("crew-no-project-"), testEnv())("sources", "qa", "--project");
  expect(nowhere.code).toBe(0);
  expect(nowhere.out.trimEnd().split("\n")).toEqual([
    join(pluginRoot(), "teams", "qa.md"),
    NO_PROJECT,
    LAST_LINE,
  ]);
});

test(`${ITEM} AC-11: a heading of two hashes, a table of another header, an escape sequence and a count of one, on a declaration of the test's own`, () => {
  const project = makeRepo({ "README.md": "x\n" });
  const esc = String.fromCharCode(27);
  const qa = [
    declaration(
      [`## Two ${esc}[31mhashes`, row(`Red${esc}[0m`, "https://a.test/one", READY)],
      ["### Three hashes", row("Hosted", "https://a.test/two", READY, "a server, hosted")],
    ),
    "### Another table",
    "",
    "| Tool | Read at | Line |",
    "| :- | :- | :- |",
    "| Not printed | https://a.test/three | `npx skills add c/d` |",
    "",
  ].join("\n");
  const root = ownRoot({ qa });
  const answer = form(root, "qa", project);
  expect(answer.code).toBe(0);
  expect(linesOf(answer)).toEqual([
    join(root, "teams", "qa.md"),
    "Two [31mhashes:",
    row("Red[0m", "https://a.test/one", READY),
    "  install: ready",
    SKILLS_NOTE,
    NO_ENTRY,
    "Three hashes:",
    row("Hosted", "https://a.test/two", READY, "a server, hosted"),
    heldLine(HOSTED),
    // 2026-11-26-001: a hosted row a consent would lift says how the consent is given.
    "    a person's consent for this project lifts this hold: crew sources qa --consented https://a.test/two",
    "ready: 1 row; held: 1 row",
    NOT_TOLD,
    LAST_LINE,
  ]);
  const two = ownRoot({
    qa: declaration([
      "### Rows",
      row("A", "https://a.test/1", READY),
      row("B", "https://a.test/2", READY),
    ]),
  });
  expect(linesOf(form(two, "qa", project)).at(-3)).toBe("ready: 2 rows; held: 0 rows");
  // A record that cannot be read is said, after the not told line, and no row takes a state from it.
  const unread = makeRepo({ "README.md": "x\n" });
  mkdirSync(join(unread, ".crew", "local"), { recursive: true });
  writeFileSync(join(unread, ".crew", "local", "sources.json"), "not a record\n");
  expect(linesOf(form(two, "qa", unread)).slice(-4)).toEqual([
    "ready: 2 rows; held: 0 rows",
    NOT_TOLD,
    "the record of installs (.crew/local/sources.json) could not be read as the engine writes it and was not read",
    LAST_LINE,
  ]);
});

test(`${ITEM} AC-12: a row that names beta, preview, pre-release or alpha as a whole word is not stable, and a last cell that says more than its lines is held after the five holds and before the form`, () => {
  const line = "`composer require a/b`";
  const ready = {
    state: "ready" as const,
    forms: [expect.objectContaining({ form: "composer require" })],
  };
  for (const word of ["beta", "preview", "pre-release", "alpha"]) {
    const capital = `${word[0]?.toUpperCase()}${word.slice(1)}`;
    for (const said of [
      word,
      capital,
      word.toUpperCase(),
      `${capital}:`,
      `v1-${word}`,
      `${word}-2`,
    ]) {
      expect({ said, is: reasonOf(state(line, { second: `a server, ${said} of it` })) }).toEqual({
        said,
        is: NOT_STABLE,
      });
      expect({ said, is: reasonOf(state(line, { third: said })) }).toEqual({
        said,
        is: NOT_STABLE,
      });
    }
    // In a span of the last cell, as the two phrases that stood are read.
    expect({ word, is: reasonOf(state(`\`composer require a/${word}\``)) }).toEqual({
      word,
      is: NOT_STABLE,
    });
    // Inside a longer word it is not the word.
    for (const longer of [`${word}s`, `un${word}`, `${word}bet`])
      expect({ longer, is: state(line, { second: `a server, ${longer}` }) }).toEqual({
        longer,
        is: ready,
      });
  }
  expect(state(line, { second: "an alphabet of previewers" })).toEqual(ready);
  // A last cell that says more than its lines.
  for (const last of [
    `${line}, hosted`,
    `${line} which takes all nine`,
    `${line}. Then ${line}`,
    `${line}, And ${line}`,
    `${line} Or ${line}`,
    `${line}: the line that keeps the two out was not read`,
    `not installed; the page's command is ${line}`,
    `${line} (once)`,
    `${line} after ${line}`,
  ])
    expect({ last, is: reasonOf(state(last)) }).toEqual({ last, is: WORDY });
  // Lines joined by the three words and punctuation alone.
  for (const last of [
    line,
    `${line}, then ${line}`,
    `${line}; and ${line}.`,
    `${line} or ${line}`,
    `${line}:  ${line} , then  ${line}`,
  ])
    expect({ last, is: state(last) }).toEqual({ last, is: ready });
  // After the five that stand: each of them decides before it.
  expect(reasonOf(state("no command, in words"))).toBe(NO_COMMAND);
  expect(reasonOf(state(`${line}, experimental`))).toBe(NOT_STABLE);
  expect(reasonOf(state(`${line}, in words`, { second: "a server, hosted" }))).toBe(HOSTED);
  expect(reasonOf(state("`composer require a/b --token x`, in words"))).toBe(
    "its line takes a value of the machine, a token or a key",
  );
  expect(reasonOf(state("`/plugin install a@b`, in words"))).toBe(
    "its line is typed at Claude Code's prompt, which a session cannot do",
  );
  // Before the form is asked: a wordy row whose line is no form is wordy.
  expect(reasonOf(state("`gh skills install a/b`"))).toBe(
    "its line is not one of the engine's install forms",
  );
  expect(reasonOf(state("`gh skills install a/b`, in words"))).toBe(WORDY);
});

test(`${ITEM} AC-13: the real rows held by what they say is owed, by another team's row at their page, and the researchers' four rows that say not installed`, () => {
  const project = makeRepo({ "README.md": "x\n" });
  const of = (team: Team) => linesOf(form(pluginRoot(), team, project));
  const agentic = of("agentic-os");
  for (const page of ["langfuse/skills", "comet-ml/opik-skills", "weaviate/agent-skills"])
    expect({ page, is: stateOf(agentic, `| https://github.com/${page} |`) }).toEqual({
      page,
      is: heldLine(OWED),
    });
  const statesAt = (lines: string[], page: string) =>
    lines.flatMap((line, at) =>
      line.startsWith("| ") && cells(line)[2] === page ? [lines[at + 1]] : [],
    );
  expect(statesAt(of("etl"), "https://github.com/supabase/agent-skills")).toEqual([
    heldLine(OTHER_TEAM),
    heldLine(OTHER_TEAM),
  ]);
  expect(statesAt(of("architects"), "https://github.com/google/skills")).toEqual([
    heldLine(OTHER_TEAM),
  ]);
  expect(statesAt(of("qa"), "https://github.com/laravel/boost")).toEqual([heldLine(OTHER_TEAM)]);
  const researchers = of("researchers");
  const notInstalled = researchers.flatMap((line, at) =>
    line.startsWith("| ") &&
    (cells(line).at(-1) ?? "").startsWith("not installed; the page's command is")
      ? [researchers[at + 1]]
      : [],
  );
  expect(notInstalled.slice().sort()).toEqual([
    heldLine(WORDY),
    heldLine(WORDY),
    heldLine(WORDY),
    heldLine(NOT_STABLE),
  ]);
});

test(`${ITEM} AC-13: the order of a row's state on a declaration of the test's own: its heading, what it says is owed, its own cells, another team's row at its page`, () => {
  const project = makeRepo({ "README.md": "x\n" });
  const qa = declaration(
    ["### Left out: named and not installed", row("Out", "https://a.test/out", READY)],
    [
      "### Held until the building item shows the reading",
      row("Held", "https://a.test/held", READY, "Still owed: a full read"),
    ],
    [
      "### Holdings, not ### Held and not ### Left out",
      row("Named", "https://a.test/named", READY),
    ],
    ["## Held, at two hashes", row("Two", "https://a.test/twohashes", READY)],
    [
      "### Installed",
      row("Owed", "https://a.test/owed", READY, "Still owed: a full read"),
      row("Owed, lower", "https://a.test/owed2", READY, "its skills, still owed"),
      row("Checked", "https://a.test/check", READY, "its licence is To Be Checked"),
      row("Owed and hosted", "https://a.test/both", READY, "a server, hosted, to be checked"),
      row("Not the phrase", "https://a.test/not", READY, "nothing is owed still; checked"),
      row("Shared", "https://a.test/shared", READY),
      row("Shared with a ready row", "https://a.test/ready", READY),
      row("Shared with another header", "https://a.test/header", READY),
      row("Own held", "https://a.test/own", READY, "a server, hosted"),
      row("Own ready", "https://a.test/own", READY),
      row("No page", "", READY),
    ],
  );
  const etl = [
    declaration(
      ["### Held by its heading", row("Holder", "https://a.test/out", READY)],
      [
        "### Installed",
        row("Holder", "https://a.test/shared", READY, "a server, hosted"),
        row("Ready too", "https://a.test/ready", READY),
        row("No page, held", "", READY, "a server, hosted"),
      ],
    ),
    "### Another table",
    "",
    "| Tool | Server | Read at | Line |",
    "| :- | :- | :- | :- |",
    "| Holder | a server, hosted | https://a.test/header | `npx skills add c/d` |",
    "",
  ].join("\n");
  const lines = linesOf(form(ownRoot({ qa, etl }), "qa", project));
  const is = (name: string) => stateOf(lines, `| ${name} |`);
  expect(is("Out")).toBe(heldLine(BY_HEADING));
  // The heading decides before what the row says is owed.
  expect(is("Held")).toBe(heldLine(BY_HEADING));
  expect(is("Named")).toBe("  install: ready");
  expect(is("Two")).toBe("  install: ready");
  expect(is("Owed")).toBe(heldLine(OWED));
  expect(is("Owed, lower")).toBe(heldLine(OWED));
  expect(is("Checked")).toBe(heldLine(OWED));
  // What is owed decides before the row's own cells.
  expect(is("Owed and hosted")).toBe(heldLine(OWED));
  expect(is("Not the phrase")).toBe("  install: ready");
  expect(is("Shared")).toBe(heldLine(OTHER_TEAM));
  // A ready row of another team holds nothing, and neither does a row of a table of another header.
  expect(is("Shared with a ready row")).toBe("  install: ready");
  expect(is("Shared with another header")).toBe("  install: ready");
  // A held row of the team's own does not hold its neighbour.
  expect(is("Own held")).toBe(heldLine(HOSTED));
  expect(is("Own ready")).toBe("  install: ready");
  expect(is("No page")).toBe("  install: ready");
  expect(lines.at(-3)).toBe("ready: 7 rows; held: 8 rows");
  // The other team's form holds its own row by its own heading.
  const other = linesOf(form(ownRoot({ qa, etl }), "etl", project));
  expect(stateOf(other, "| Ready too |")).toBe("  install: ready");
  expect(stateOf(other, "| Holder | its skills | https://a.test/out |")).toBe(heldLine(BY_HEADING));
});

test(`${ITEM} AC-17: an absent declaration of the other seven refuses the form and the record, and two rows with no page do not hold each other`, () => {
  const project = makeRepo({ "README.md": "x\n" });
  const qa = declaration(["### Installed", row("Mine", "https://a.test/mine", READY)]);
  const root = ownRoot({ qa }, ["devops"]);
  const refusal = `${join(root, "teams", "devops.md")}: absent or not a regular file`;
  expect(form(root, "qa", project)).toEqual({ code: 1, text: refusal });
  expect(
    recordSourcesCommand(
      root,
      ["qa"],
      { installed: "https://a.test/mine" },
      project,
      "2026-11-24T10:00:00.000Z",
    ),
  ).toEqual({ code: 1, text: refusal });
  expect(readSourcesRecord(project)).toEqual({ entries: [], unread: false });
  // With every file of the eight there the same row is ready; the backend's is none of them and is not there.
  expect(stateOf(linesOf(form(ownRoot({ qa }), "qa", project)), "| Mine |")).toBe(
    "  install: ready",
  );
  const noPage = ownRoot({
    qa: declaration(["### Installed", row("No page", "", READY)]),
    etl: declaration(["### Installed", row("No page, held", "", READY, "a server, hosted")]),
  });
  expect(stateOf(linesOf(form(noPage, "qa", project)), "| No page |")).toBe("  install: ready");
});

test(`${ITEM} AC-14: a ready row of any team is recorded by its page, and the record's state is the form's`, () => {
  const project = makeRepo({ "README.md": "x\n" });
  const at = "2026-11-24T10:00:00.000Z";
  const mine = row("Mine", "https://a.test/mine", READY);
  const qa = declaration(
    ["### Held by its heading", row("By heading", "https://a.test/heading", READY)],
    [
      "### Installed",
      mine,
      row("Owed", "https://a.test/owed", READY, "Still owed: a full read"),
      row("Other team's", "https://a.test/other", READY),
      row("Twice, held", "https://a.test/twice", READY, "a server, hosted"),
      row("Twice, ready", "https://a.test/twice", READY),
    ],
  );
  const etl = declaration([
    "### Installed",
    row("Theirs", "https://a.test/mine", READY),
    row("Holder", "https://a.test/other", READY, "a server, hosted"),
  ]);
  const root = ownRoot({ qa, etl });
  const record = (team: string, flags: Record<string, string>) =>
    recordSourcesCommand(root, [team], flags, project, at);
  const refused = (text: string) => ({ code: 1, text });
  const before = linesOf(form(root, "qa", project));
  expect(before.at(-3)).toBe("ready: 2 rows; held: 4 rows");
  // The refusals, by the first that holds.
  expect(record("qa", { installed: "https://a.test/no-row" })).toEqual(refused(noRow("qa")));
  expect(record("etl", { declined: "https://a.test/owed" })).toEqual(refused(noRow("etl")));
  expect(record("qa", { installed: "https://a.test/twice" })).toEqual(refused(MORE));
  for (const [page, reason] of [
    ["https://a.test/heading", BY_HEADING],
    ["https://a.test/owed", OWED],
    ["https://a.test/other", OTHER_TEAM],
  ] as const)
    for (const decision of ["installed", "declined"])
      expect({ page, is: record("qa", { [decision]: page }) }).toEqual({
        page,
        is: refused(`not recorded: the row is held, ${reason}`),
      });
  expect(readSourcesRecord(project).entries).toEqual([]);
  // A ready row is recorded with its team.
  expect(record("qa", { installed: "https://a.test/mine" })).toEqual({
    code: 0,
    text: [mine, "recorded: installed on 2026-11-24", LAST_LINE].join("\n"),
  });
  expect(readSourcesRecord(project).entries).toEqual([
    {
      team: "qa",
      page: "https://a.test/mine",
      decision: "installed",
      at,
      lines: ["npx skills add a/b"],
    },
  ]);
  // The form prints the decision and its day in place of ready and its note, and its counts do not move.
  const after = linesOf(form(root, "qa", project));
  expect(stateOf(after, "| Mine |")).toBe("  install: installed, recorded on 2026-11-24");
  expect(after.at(-3)).toBe("ready: 2 rows; held: 4 rows");
  // 2026-11-24-002: the lines under the recorded row, where a comparison of lengths stood.
  const underMine = after.slice(after.indexOf(mine) + 1, after.indexOf(mine) + 3);
  expect(underMine).toEqual(["  install: installed, recorded on 2026-11-24", NO_ENTRY]);
  expect(before.slice(before.indexOf(mine) + 1, before.indexOf(mine) + 4)).toEqual([
    "  install: ready",
    SKILLS_NOTE,
    NO_ENTRY,
  ]);
  // Another team's row at the same page is not shown the entry.
  expect(stateOf(linesOf(form(root, "etl", project)), "| Theirs |")).toBe("  install: ready");
  // A changed line prints ready again, said.
  const changed = ownRoot({
    qa: declaration(["### Installed", row("Mine", "https://a.test/mine", "`npx skills add a/c`")]),
  });
  expect(stateOf(linesOf(form(changed, "qa", project)), "| Mine |")).toBe(
    "  install: ready, its line changed since it was recorded as installed on 2026-11-24",
  );
  expect(record("etl", { declined: "https://a.test/mine" }).text.split("\n")[1]).toBe(
    "recorded: declined on 2026-11-24",
  );
  expect(readSourcesRecord(project).entries.map((entry) => [entry.team, entry.decision])).toEqual([
    ["qa", "installed"],
    ["etl", "declined"],
  ]);
});

test(`${ITEM} AC-14: the hook answers a recording command of another team as the backend's (it passes before the build)`, () => {
  const root = makeRepo({ "README.md": "x\n" });
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(
    join(root, ".crew", "policy.json"),
    JSON.stringify({ attendedDecisions: "prompt" }),
  );
  const answer = (command: string, permission_mode: string) => {
    const ctx = hookContext({ session_id: "s", cwd: root }, testEnv());
    const out = onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode })
      .hookSpecificOutput as
      | { permissionDecision?: string; permissionDecisionReason?: string }
      | undefined;
    return out ? [out.permissionDecision, out.permissionDecisionReason] : null;
  };
  for (const mode of ["default", "dontAsk", "bypassPermissions"])
    for (const flag of ["--installed", "--declined"]) {
      const backend = answer(`crew sources backend ${flag} https://example.test/a`, mode);
      expect(backend).not.toBeNull();
      expect({
        mode,
        flag,
        is: answer(`crew sources qa ${flag} https://example.test/a`, mode),
      }).toEqual({ mode, flag, is: backend });
    }
  expect(answer("crew sources qa --installed https://example.test/a", "default")).toEqual([
    "ask",
    "Crew: this command records the person's own yes or no to an install",
  ]);
});

test(`${ITEM} AC-15: the usage line, the last line, the help's three lines, the reference's bullet and the ADR's amendment name every team`, async () => {
  const run = cliIo(makeRepo({ "README.md": "x\n" }), testEnv());
  const usage = await run("sources", "backend", "1", "2");
  expect(`${usage.out}${usage.err}`.trim()).toBe(USAGE);
  expect(LAST_LINE).toContain("only a row that crew sources <team> --project calls ready");
  expect(LAST_LINE).not.toContain("crew sources backend");
  const help = (await run("help")).out.split("\n").filter((l) => l.startsWith("  sources "));
  expect(help.map((l) => l.trimStart().split("  ")[0])).toEqual([
    "sources [<team> [<n>]]",
    "sources <team> --project",
    "sources <team> --installed <page>",
    "sources <team> --declined <page>",
    // 2026-11-26-001: the form that records a consent.
    "sources <team> --consented <page>",
  ]);
  expect(help[1]).toContain("for another team, every row of its install tables with its state");
  const reference = readFileSync(
    join(pluginRoot(), "skills", "crew", "references", "understand.md"),
    "utf8",
  )
    .split("\n")
    .filter((line) => line.includes("crew sources"));
  expect(reference).toHaveLength(1);
  // 2026-11-24-002: the sentence says what the line under a ready row is.
  expect(reference[0]).toContain(
    "For another team, crew sources <team> --project prints every row of its install tables with its state, and under a ready row whether the project's manifests and files show its tool; present a ready row the project does not show only where the person asked for it.",
  );
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
  const parts = adr.split("\n## Amendment of 2026-11-24 (item 2026-11-24-001)\n");
  expect(parts).toHaveLength(2);
  // 2026-11-24-002: this amendment runs to the next item's heading and to no other.
  const [amendment = "", ...later] = (parts[1] ?? "").split("\n## ");
  expect(later.map((part) => part.split("\n")[0])).toEqual([
    "Amendment of 2026-11-24 (item 2026-11-24-002)",
    "Amendment of 2026-11-26 (item 2026-11-26-001)",
    "Amendment of 2026-11-26 (item 2026-11-26-002)",
    "Amendment of 2026-11-26 (item 2026-11-26-005)",
  ]);
  for (const phrase of [
    "every team",
    "--project",
    WORDY,
    "left out or held",
    "still owed",
    "another team's declaration",
    "wizardingcode-mem",
    "one file",
    "the other seven",
  ])
    expect(amendment, phrase).toContain(phrase);
});
