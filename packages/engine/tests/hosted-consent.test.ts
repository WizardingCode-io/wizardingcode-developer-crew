import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import { pluginRoot } from "../src/runtimes.ts";
import { readSourcesRecord, recordSourceRow } from "../src/sources-record.ts";
import { LAST_LINE, recordSourcesCommand, sourcesCommand } from "../src/team-sources.ts";
import { cliIo, hookContext, makeRepo, tempDir, testEnv } from "./helpers.ts";

const ITEM = "2026-11-26-001";
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
type Team = (typeof TEAMS)[number];
const HEADER = "| Tool or service | Server or skills | Read at | How it is installed |";
const RULE = "| :- | :- | :- | :- |";
const USAGE =
  "usage: crew sources [<team> [<n>]] | crew sources <team> --project | crew sources <team> --installed <page> | crew sources <team> --declined <page> | crew sources <team> --consented <page>";
const HOSTED = "  install: held, hosted, so what a session asks leaves the machine";
const TOKEN = "its line takes a value of the machine, a token or a key";
const NO_FORM = "its line is not one of the engine's install forms";
const NOT_STABLE = "not stable by its own row";
const BY_HEADING = "its table is left out or held by the definition";
const OTHER_TEAM = "another team's declaration holds a row at its page";
const NOT_HOSTED = "not recorded: the row is not held for being hosted";
const stillHeld = (reason: string) =>
  `not recorded: with the hosted hold lifted the row is still held, ${reason}`;
const offer = (team: string, page: string) =>
  `    a person's consent for this project lifts this hold: crew sources ${team} --consented ${page}`;
const consentedOn = (day: string) =>
  `    hosted: consented on ${day}; what a session asks of this server leaves the machine`;
const SKILLS_NOTE =
  "    npx skills add: downloads and runs the npm package `skills` first, which the row does not say is its publisher's";
const NO_ENTRY = "  project: not told, nothing in a manifest or a file shows what this row is for";
const AT = "2026-11-26T10:00:00.000Z";
const LATER = "2026-11-27T10:00:00.000Z";

const declaration = (...sections: [heading: string, ...rows: string[]][]) =>
  sections
    .map(([heading, ...rows]) => [heading, "", HEADER, RULE, ...rows, ""].join("\n"))
    .join("\n");
const row = (name: string, page: string, last: string, second = "its skills") =>
  `| ${name} | ${second} | ${page} | ${last} |`;
const READY = "`npx skills add a/b`";
const READY_LINES = ["npx skills add a/b"];
const A_SERVER = "a server, hosted";

function ownRoot(given: Partial<Record<Team, string>>): string {
  const root = tempDir("crew-consent-root-");
  mkdirSync(join(root, "teams"));
  for (const team of TEAMS)
    writeFileSync(join(root, "teams", `${team}.md`), given[team] ?? "## 3. Nothing\n");
  return root;
}
const project = () => makeRepo({ "README.md": "x\n" });
const linesOf = (answer: { text: string }) => answer.text.split("\n");
const form = (root: string, team: string, cwd: string) =>
  linesOf(sourcesCommand(root, [team], { project: { cwd } }));
/** The lines printed under the row that holds a text, to the next row, heading or count. */
function under(lines: readonly string[], holds: string): string[] {
  const at = lines.findIndex((line) => line.startsWith("| ") && line.includes(holds));
  if (at < 0) throw new Error(`no row holds ${holds}`);
  const out: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (!line.startsWith("  ")) break;
    out.push(line);
  }
  return out;
}
const counts = (lines: readonly string[]) => lines.find((line) => line.startsWith("ready: "));
const refused = (text: string) => ({ code: 1, text });
/** An entry written as the engine writes it, whatever the row's state. */
const plant = (
  cwd: string,
  team: string,
  page: string,
  decision: "consented" | "installed" | "declined",
  lines: readonly string[] = READY_LINES,
) => expect(recordSourceRow(cwd, { team, page, decision, lines }, AT).ok).toBe(true);

const ONE = "https://a.test/one";
const QA = declaration(
  ["### Held by its heading", row("By heading", "https://a.test/heading", READY, A_SERVER)],
  [
    "### Installed",
    row("Hosted one", ONE, READY, A_SERVER),
    row("Plain", "https://a.test/plain", READY),
    row("Takes a token", "https://a.test/token", "`npx skills add a/b --token x`", A_SERVER),
    row("No form", "https://a.test/noform", "`claude mcp add x`", A_SERVER),
    row("By its line", "https://a.test/url", "`npx skills add https://a.test/skills`"),
    row("Not stable", "https://a.test/beta", READY, "a server, hosted, beta"),
    row("No page", "", READY, A_SERVER),
  ],
);

test(`${ITEM} AC-7: a consent is recorded for a row held only for being hosted, and refused for every other`, async () => {
  const cwd = project();
  const root = ownRoot({ qa: QA });
  const record = (flags: Record<string, string>, at = AT) =>
    recordSourcesCommand(root, ["qa"], flags, cwd, at);
  // The refusals of its own, before anything is recorded.
  expect(record({ consented: "https://a.test/plain" })).toEqual(refused(NOT_HOSTED));
  expect(record({ consented: "https://a.test/beta" })).toEqual(refused(NOT_HOSTED));
  expect(record({ consented: "https://a.test/heading" })).toEqual(refused(NOT_HOSTED));
  expect(record({ consented: "https://a.test/token" })).toEqual(refused(stillHeld(TOKEN)));
  expect(record({ consented: "https://a.test/noform" })).toEqual(refused(stillHeld(NO_FORM)));
  // The standing cases hold for the third flag.
  expect(record({ consented: "https://a.test/no-row" })).toEqual(
    refused(
      "no row of this project is read at that page: crew sources qa --project prints the rows and their pages",
    ),
  );
  expect(record({ consented: "" })).toEqual(refused(USAGE));
  expect(record({ consented: ONE, installed: ONE })).toEqual(refused(USAGE));
  expect(record({ consented: ONE, declined: ONE })).toEqual(refused(USAGE));
  expect(record({ installed: ONE, declined: ONE })).toEqual(refused(USAGE));
  expect(readSourcesRecord(cwd).entries).toEqual([]);
  // The row itself, by its cell and by its line.
  const first = record({ consented: ONE });
  expect(first).toEqual({
    code: 0,
    text: [
      row("Hosted one", ONE, READY, A_SERVER),
      "recorded: consented on 2026-11-26",
      LAST_LINE,
    ].join("\n"),
  });
  expect(readSourcesRecord(cwd).entries).toEqual([
    { team: "qa", page: ONE, decision: "consented", at: AT, lines: READY_LINES },
  ]);
  expect(record({ consented: "https://a.test/url" }).code).toBe(0);
  // A second consent replaces the first, and one over an install replaces it, each said.
  expect(linesOf(record({ consented: ONE }, LATER)).slice(1, 3)).toEqual([
    "recorded: consented on 2026-11-27",
    "it replaces: consented on 2026-11-26",
  ]);
  plant(cwd, "qa", ONE, "installed");
  expect(linesOf(record({ consented: ONE }, LATER)).slice(1, 3)).toEqual([
    "recorded: consented on 2026-11-27",
    "it replaces: installed on 2026-11-26",
  ]);
  // Through the CLI the flag is known and reaches the command: its own refusal, not an unknown flag's.
  const run = cliIo(cwd, testEnv());
  const answer = await run("sources", "qa", "--consented", "https://a.test/no-row");
  expect(answer.code).toBe(1);
  expect(`${answer.out}${answer.err}`).toContain("no row of this project is read at that page");
  const moded = await run("sources", "qa", "--consented", "x", "--mode", "auto");
  expect(`${moded.out}${moded.err}`).toContain("crew sources takes no --mode or --validator");
  const two = await run("sources", "qa", "--consented", "x", "--installed", "x");
  expect(`${two.out}${two.err}`).toContain(USAGE);
});

test(`${ITEM} AC-8: a consent of the row's own team lifts the hosted hold and no other`, () => {
  const cwd = project();
  const root = ownRoot({
    qa: QA,
    etl: declaration(["### Installed", row("Theirs", ONE, READY, A_SERVER)]),
  });
  // With no entry: the offer under a row a consent would lift, and under no other.
  const before = form(root, "qa", cwd);
  expect(under(before, "| Hosted one |")).toEqual([HOSTED, offer("qa", ONE)]);
  expect(under(before, "| By its line |")).toEqual([HOSTED, offer("qa", "https://a.test/url")]);
  expect(under(before, "| Takes a token |")).toEqual([HOSTED]);
  expect(under(before, "| No form |")).toEqual([HOSTED]);
  expect(under(before, "| Not stable |")).toEqual([`  install: held, ${NOT_STABLE}`]);
  expect(under(before, "| By heading |")).toEqual([`  install: held, ${BY_HEADING}`]);
  // A row with no page cannot be named to the command, so nothing is offered under it.
  expect(under(before, "| No page |")).toEqual([HOSTED]);
  expect(counts(before)).toBe("ready: 1 row; held: 7 rows");
  // A declined entry, other lines, and another team's entry lift nothing.
  plant(cwd, "qa", ONE, "declined");
  expect(under(form(root, "qa", cwd), "| Hosted one |")).toEqual([HOSTED, offer("qa", ONE)]);
  plant(cwd, "qa", ONE, "consented", ["npx skills add a/c"]);
  expect(under(form(root, "qa", cwd), "| Hosted one |")).toEqual([HOSTED, offer("qa", ONE)]);
  plant(cwd, "qa", ONE, "declined");
  plant(cwd, "etl", ONE, "consented");
  expect(under(form(root, "qa", cwd), "| Hosted one |")).toEqual([HOSTED, offer("qa", ONE)]);
  // A consent whose lines are the row's: ready, with its forms and the day.
  const alone = project();
  const only = ownRoot({ qa: QA });
  plant(alone, "qa", ONE, "consented");
  const lifted = form(only, "qa", alone);
  expect(under(lifted, "| Hosted one |")).toEqual([
    "  install: ready",
    SKILLS_NOTE,
    consentedOn("2026-11-26"),
    NO_ENTRY,
  ]);
  expect(counts(lifted)).toBe("ready: 2 rows; held: 6 rows");
  // A consent at a row that is not hosted is no decision on its install: the row prints as ready.
  plant(alone, "qa", "https://a.test/plain", "consented");
  expect(under(form(only, "qa", alone), "| Plain |")).toEqual([
    "  install: ready",
    SKILLS_NOTE,
    NO_ENTRY,
  ]);
  // An install whose lines are the row's prints as an installed row does.
  plant(alone, "qa", ONE, "installed");
  expect(under(form(only, "qa", alone), "| Hosted one |")).toEqual([
    "  install: installed, recorded on 2026-11-26",
    NO_ENTRY,
  ]);
  expect(counts(form(only, "qa", alone))).toBe("ready: 2 rows; held: 6 rows");
  // A consent that stands at a row with another hold leaves it held, by its own reason.
  plant(alone, "qa", "https://a.test/token", "consented", ["npx skills add a/b --token x"]);
  plant(alone, "qa", "https://a.test/noform", "consented", ["claude mcp add x"]);
  plant(alone, "qa", "https://a.test/beta", "consented");
  plant(alone, "qa", "https://a.test/heading", "consented");
  const held = form(only, "qa", alone);
  expect(under(held, "| Takes a token |")).toEqual([`  install: held, ${TOKEN}`]);
  expect(under(held, "| No form |")).toEqual([`  install: held, ${NO_FORM}`]);
  expect(under(held, "| Not stable |")).toEqual([`  install: held, ${NOT_STABLE}`]);
  expect(under(held, "| By heading |")).toEqual([`  install: held, ${BY_HEADING}`]);
  expect(counts(held)).toBe("ready: 2 rows; held: 6 rows");
});

/** A plugin root whose backend declaration is the test's own per-stack table and one error service. */
function backendRoot(last: string, second: string): string {
  const root = tempDir("crew-consent-backend-");
  mkdirSync(join(root, "teams"));
  for (const team of TEAMS) writeFileSync(join(root, "teams", `${team}.md`), "## 3. Nothing\n");
  writeFileSync(
    join(root, "teams", "backend.md"),
    [
      "### Per stack, from the framework's or the tool's own team",
      "",
      "| Stack | Server or skills | Read at | How it is installed |",
      "| :- | :- | :- | :- |",
      `| PHP | ${second} | https://b.test/php | ${last} |`,
      "",
      "### Common to every stack",
      "",
      "| Use | Server or skills | Read at | How it is installed |",
      "| :- | :- | :- | :- |",
      "| Errors in production: Sentry | Sentry's server, hosted | https://b.test/sentry | `npx skills add a/b` |",
      "",
    ].join("\n"),
  );
  return root;
}
const laravel = () =>
  makeRepo({
    "composer.json": JSON.stringify({
      require: { "laravel/framework": "^13", "sentry/sentry-laravel": "^4" },
    }),
  });

test(`${ITEM} AC-8: the backend's form lifts its own row by a consent, and never an error service`, () => {
  const cwd = laravel();
  const root = backendRoot(READY, "a server of the stack, hosted");
  const record = (flags: Record<string, string>) =>
    recordSourcesCommand(root, ["backend"], flags, cwd, AT);
  const PAGE = "https://b.test/php";
  expect(under(form(root, "backend", cwd), "| PHP |")).toEqual([HOSTED, offer("backend", PAGE)]);
  expect(under(form(root, "backend", cwd), "| Errors in production: Sentry |")).toEqual([
    "  install: held, it reaches production data with a credential",
  ]);
  expect(record({ consented: PAGE }).code).toBe(0);
  expect(under(form(root, "backend", cwd), "| PHP |")).toEqual([
    "  install: ready",
    SKILLS_NOTE,
    consentedOn("2026-11-26"),
  ]);
  // An error service is no row of the form's, and an entry at its page changes nothing.
  expect(record({ consented: "https://b.test/sentry" }).code).toBe(1);
  plant(cwd, "backend", "https://b.test/sentry", "consented");
  expect(under(form(root, "backend", cwd), "| Errors in production: Sentry |")).toEqual([
    "  install: held, it reaches production data with a credential",
  ]);
  // A token in the line: no offer, a refusal, and held by the token with an entry that stands.
  const tokened = backendRoot("`npx skills add a/b --token x`", "a server of the stack, hosted");
  const other = laravel();
  expect(under(form(tokened, "backend", other), "| PHP |")).toEqual([HOSTED]);
  expect(recordSourcesCommand(tokened, ["backend"], { consented: PAGE }, other, AT)).toEqual(
    refused(stillHeld(TOKEN)),
  );
  plant(other, "backend", PAGE, "consented", ["npx skills add a/b --token x"]);
  expect(under(form(tokened, "backend", other), "| PHP |")).toEqual([`  install: held, ${TOKEN}`]);
});

test(`${ITEM} AC-9: each team's row takes its own consent, and a lifted row is recorded as installed`, () => {
  const cwd = project();
  const SHARED = "https://a.test/shared";
  const root = ownRoot({
    qa: declaration([
      "### Installed",
      row("Ours", SHARED, READY, A_SERVER),
      row("Ready by itself", "https://a.test/theirs", READY),
    ]),
    etl: declaration([
      "### Installed",
      row("Theirs", SHARED, READY, A_SERVER),
      row("Their hosted", "https://a.test/theirs", READY, A_SERVER),
    ]),
  });
  const record = (team: string, flags: Record<string, string>, at = AT) =>
    recordSourcesCommand(root, [team], flags, cwd, at);
  const held = `  install: held, ${OTHER_TEAM}`;
  // A row ready by its own cells is held by the other team's hosted row at its page.
  expect(under(form(root, "qa", cwd), "| Ready by itself |")).toEqual([held]);
  expect(counts(form(root, "qa", cwd))).toBe("ready: 0 rows; held: 2 rows");
  // One consent: that team's row is held by the other team's row.
  expect(record("qa", { consented: SHARED }).code).toBe(0);
  expect(under(form(root, "qa", cwd), "| Ours |")).toEqual([held]);
  expect(under(form(root, "etl", cwd), "| Theirs |")).toEqual([HOSTED, offer("etl", SHARED)]);
  // A consent in each: both ready.
  expect(record("etl", { consented: SHARED }).code).toBe(0);
  for (const [team, name] of [
    ["qa", "| Ours |"],
    ["etl", "| Theirs |"],
  ] as const)
    expect(under(form(root, team, cwd), name)).toEqual([
      "  install: ready",
      SKILLS_NOTE,
      consentedOn("2026-11-26"),
      NO_ENTRY,
    ]);
  // The other team's hosted row lifted: the row it held is ready, and counted.
  expect(record("etl", { consented: "https://a.test/theirs" }).code).toBe(0);
  expect(under(form(root, "qa", cwd), "| Ready by itself |")).toEqual([
    "  install: ready",
    SKILLS_NOTE,
    NO_ENTRY,
  ]);
  expect(counts(form(root, "qa", cwd))).toBe("ready: 2 rows; held: 0 rows");
  // A row made ready by a consent is recorded as installed, which replaces the consent.
  expect(linesOf(record("qa", { installed: SHARED }, LATER)).slice(1, 3)).toEqual([
    "recorded: installed on 2026-11-27",
    "it replaces: consented on 2026-11-26",
  ]);
  expect(under(form(root, "qa", cwd), "| Ours |")).toEqual([
    "  install: installed, recorded on 2026-11-27",
    NO_ENTRY,
  ]);
  // With no consent, a hosted row is not recorded as installed.
  const fresh = project();
  expect(recordSourcesCommand(root, ["qa"], { installed: SHARED }, fresh, AT)).toEqual(
    refused("not recorded: the row is held, hosted, so what a session asks leaves the machine"),
  );
});

test(`${ITEM} AC-13: the hook asks for a consent in every policy, a word it cannot read included`, () => {
  const made = (policy: string) => {
    const root = project();
    mkdirSync(join(root, ".crew"), { recursive: true });
    writeFileSync(
      join(root, ".crew", "policy.json"),
      JSON.stringify({ attendedDecisions: policy }),
    );
    return root;
  };
  const prompt = made("prompt");
  const relay = made("relay");
  const answer = (root: string, command: string, permission_mode: string, headless = false) => {
    const env = headless ? { ...testEnv(), CLAUDE_CODE_SESSION_ATTENDED: "0" } : testEnv();
    const ctx = hookContext({ session_id: "s", cwd: root }, env);
    const out = onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode })
      .hookSpecificOutput as
      | { permissionDecision?: string; permissionDecisionReason?: string }
      | undefined;
    return out ? [out.permissionDecision, out.permissionDecisionReason] : null;
  };
  const unwatched = (where: string) => [
    "deny",
    `Crew: no person is watching this session (${where}) and a hosted server receives a project's data on a person's own consent: run it in a session a person watches; nothing is recorded until then.`,
  ];
  const withMode = (mode: string) => [
    "deny",
    `Crew: a person is present (${mode} mode) and a hosted server receives a project's data on their own consent: run the command without --mode`,
  ];
  const ASK = [
    "ask",
    "Crew: this command records the person's own consent that a hosted server may receive what a session asks in this project",
  ];
  const INSTALL_ASK = [
    "ask",
    "Crew: this command records the person's own yes or no to an install",
  ];
  const consenting = [
    "crew sources qa --consented https://example.test/a",
    "crew sources qa --consented $P",
    "crew sources qa --consented https://example.test/a --installed $P",
    "crew sources backend --x $F",
    'crew sources backend --"$K" page',
    "crew sources $T --project",
    "crew sources backend --project --x *",
    "crew sources backend --installed $P --declined $Q",
    "crew sources backend --installed page $EXTRA",
  ];
  for (const command of consenting) {
    for (const root of [prompt, relay]) {
      for (const mode of ["dontAsk", "bypassPermissions"])
        for (const tail of ["", ` --mode ${mode}`, " --validator x"])
          expect({ command, mode, tail, is: answer(root, `${command}${tail}`, mode) }).toEqual({
            command,
            mode,
            tail,
            is: unwatched(`${mode} mode`),
          });
      expect({ command, is: answer(root, command, "auto", true) }).toEqual({
        command,
        is: unwatched("a headless session in auto mode"),
      });
      expect({ command, is: answer(root, `${command} --mode auto`, "auto") }).toEqual({
        command,
        is: withMode("auto"),
      });
      // A person present: asked in both policies, --validator or not.
      expect({ command, root, is: answer(root, command, "default") }).toEqual({
        command,
        root,
        is: ASK,
      });
      expect({ command, root, is: answer(root, `${command} --validator x`, "auto") }).toEqual({
        command,
        root,
        is: ASK,
      });
    }
  }
  // The install's rule stands: readable, or with the one flag's value alone unreadable.
  for (const command of [
    "crew sources backend --installed https://example.test/a",
    "crew sources backend --declined https://example.test/a",
    "crew sources backend --installed $P",
    "crew sources backend --declined $P",
    // The one unreadable word is the value of a readable flag of the two, whichever it is.
    "crew sources backend --installed page --declined $Q",
  ]) {
    expect({ command, is: answer(relay, command, "default") }).toEqual({ command, is: null });
    expect({ command, is: answer(prompt, command, "default") }).toEqual({
      command,
      is: INSTALL_ASK,
    });
  }
  // The forms that print are let through.
  for (const command of ["crew sources", "crew sources qa", "crew sources qa --project"])
    expect({ command, is: answer(relay, command, "default") }).toEqual({ command, is: null });
});

test(`${ITEM} AC-11: the usage, the last line, the help, the reference and the ADR say the third flag`, async () => {
  expect(recordSourcesCommand(pluginRoot(), ["qa"], {}, project(), AT)).toEqual(refused(USAGE));
  expect(LAST_LINE).toBe(
    "Nothing is installed by this command. A row's install line is what its page gave on the day its definition names. The session installs, a row at a time: only a row that crew sources <team> --project calls ready, after the person's own yes in that session, where its page read again still gives the same line; a row held for being hosted, after the person's own consent recorded with crew sources <team> --consented <page>; with nobody present, nothing (ADR 0025).",
  );
  const help = await cliIo(project(), testEnv())("help");
  const helpLines = help.out.split("\n").filter((line) => line.startsWith("  sources "));
  expect(helpLines).toHaveLength(5);
  expect(helpLines[4]).toContain("sources <team> --consented <page>");
  expect(helpLines[4]).toContain("asks the user in every policy");
  const reference = readFileSync(
    join(pluginRoot(), "skills", "crew", "references", "understand.md"),
    "utf8",
  )
    .split("\n")
    .filter((line) => line.includes("crew sources"));
  expect(reference).toHaveLength(1);
  expect(reference[0]).toContain(
    "A row held for being hosted is presented with the line the form prints under it, and its consent is recorded with crew sources <team> --consented <page> only on the person's own word for that row, never on a guess.",
  );
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
  const [, rest] = adr.split("\n## Amendment of 2026-11-26 (item 2026-11-26-001)\n");
  expect(rest).toBeDefined();
  // 2026-11-26-002: this amendment runs to the next item's heading and to no other.
  const [amendment, ...later] = (rest ?? "").split("\n## ");
  expect(later.map((part) => part.split("\n")[0])).toEqual([
    "Amendment of 2026-11-26 (item 2026-11-26-002)",
  ]);
  for (const said of [
    "--consented <page>",
    "the row's own team",
    "`--declined` withdraws",
    "asked in every policy",
    "An `installed` entry lifts as well",
    "relayed under `relay`",
    "it never shows a held row as installed and is never a yes",
    "no longer holds for the hosted hold",
    "written outside the engine",
    "reads such a record as none",
  ])
    expect({ said, held: (amendment ?? "").includes(said) }).toEqual({ said, held: true });
});
