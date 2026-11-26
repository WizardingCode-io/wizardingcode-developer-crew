import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pluginRoot } from "../src/runtimes.ts";
import {
  ERROR_SERVICE_HOLD,
  INSTALL_FORMS,
  installLines,
  LAST_LINE,
  projectRows,
  type RowInstall,
  readTeamDeclaration,
  rowInstall,
  sourcesCommand,
} from "../src/team-sources.ts";
import { cliIo, makeRepo, tempDir, testEnv, write } from "./helpers.ts";

const ITEM = "2026-11-21-006";
const REPO = join(import.meta.dir, "..", "..", "..");
const BACKEND = join(pluginRoot(), "teams", "backend.md");
const ADR = join(REPO, "docs", "adr", "0025-the-session-installs-a-row-at-the-persons-yes.md");

const NO_COMMAND = "its row gives no command";
const NOT_STABLE = "not stable by its own row";
const HOSTED = "hosted, so what a session asks leaves the machine";
const A_VALUE = "its line takes a value of the machine, a token or a key";
const AT_THE_PROMPT = "its line is typed at Claude Code's prompt, which a session cannot do";
const NO_FORM = "its line is not one of the engine's install forms";
const CREDENTIAL = "it reaches production data with a credential";
const LAST =
  "Nothing is installed by this command. A row's install line is what its page gave on the day its definition names. The session installs, a row at a time: only a row that crew sources <team> --project calls ready, after the person's own yes in that session, where its page read again still gives the same line; a row held for being hosted, after the person's own consent recorded with crew sources <team> --consented <page>; with nobody present, nothing (ADR 0025).";

/** The forms and their notes, as the spec's table gives them. */
const NOTES: Record<string, string> = {
  "composer require": "adds a dependency to the project's `composer.json`",
  "php artisan boost:install":
    "runs Boost's installer in the project; it may add Laravel Herd's server, a held row: that part is declined",
  "vendor/bin/mate": "runs the project's own Mate binary",
  "npx skills add":
    "downloads and runs the npm package `skills` first, which the row does not say is its publisher's",
  "npx --no-install drizzle-kit skills": "runs the project's own drizzle-kit",
  "uvx library-skills install":
    "downloads and runs the PyPI package `library-skills` first, which the row does not say is its publisher's",
  "claude plugin marketplace add": "adds a marketplace to the person's Claude Code",
  "claude plugin install":
    "installs a plugin, with any hooks it carries, into the person's Claude Code, for every project of theirs unless a scope is given",
};
const noteOf = (form: string) => {
  const note = NOTES[form];
  if (note === undefined) throw new Error(`no note for ${form}`);
  return note;
};
const ready = (...forms: string[]): RowInstall => ({
  state: "ready",
  forms: forms.map((form) => ({ form, note: noteOf(form) })),
});
const held = (reason: string): RowInstall => ({ state: "held", reason });
const ALREADY: RowInstall = { state: "in the project already" };
const readyLines = (...forms: string[]) => [
  "  install: ready",
  ...forms.map((form) => `    ${form}: ${noteOf(form)}`),
];
const heldLine = (reason: string) => `  install: held, ${reason}`;

/** The state of a made row: its last cell, then its second, its third, its stack and the tools shown. */
function state(
  last: string,
  made: { second?: string; third?: string; stack?: string; shown?: string[] } = {},
): RowInstall {
  return rowInstall(
    [
      made.stack ?? "PHP",
      made.second ?? "a server of the framework's own team",
      made.third ?? "a page",
      last,
    ],
    new Set(made.shown ?? []),
  );
}

const backend = () => {
  const read = readTeamDeclaration(pluginRoot(), "backend");
  if ("refused" in read) throw new Error(read.refused);
  return read.text;
};

test(`${ITEM} AC-9: ADR 0025 says who installs, when, what is never run, what it leaves undecided and what it leaves unprotected, and CLAUDE.md names it`, () => {
  const adr = readFileSync(ADR, "utf8");
  const lines = adr.split("\n");
  expect(lines[0]).toBe(
    "# 0025. The session installs a row of a team's declaration at the person's yes",
  );
  expect(lines).toContain(
    "- Status: accepted (the crew, 2026-11-21, under the user's standing rules; the user may replace it).",
  );
  const at = (heading: string) => lines.indexOf(heading);
  expect(at("## Context")).toBeGreaterThan(0);
  expect(at("## Decision")).toBeGreaterThan(at("## Context"));
  expect(at("## Consequences")).toBeGreaterThan(at("## Decision"));
  const decision = lines.slice(at("## Decision"), at("## Consequences")).join("\n");
  const consequences = lines.slice(at("## Consequences")).join("\n");
  for (const phrase of [
    "The session installs",
    "one row at a time",
    "only a row the engine calls ready",
    "after the person's own yes",
    "asked once for the ready rows together",
    "still gives that same line",
    "With nobody present no row is installed",
    "no validator, no default, no agent's message and no earlier session's answer is the yes",
    "The engine installs nothing",
    "A pack ships no skill and no server (ADR 0010 stands)",
    "stays the publisher's",
    "does not enter the core, so ADR 0017 is not touched",
    "A held row is never run by the session",
    "What lifts a hold is a later decision",
    "It is made as an item of its own",
  ])
    expect(decision, phrase).toContain(phrase);
  // What it leaves undecided, in the one sentence that says so.
  const undecided = decision.split("\n").filter((line) => line.includes("Not decided by it"));
  expect(undecided).toHaveLength(1);
  for (const phrase of [
    "the record of what was installed or declined in a project",
    "the credentials",
    "the other eight teams' rows",
    "the version",
  ])
    expect(undecided[0], phrase).toContain(phrase);
  for (const phrase of [
    "enforced by no hook and by no record",
    "no judgement that a publisher's code is safe",
    '"installed at once" is read as "proposed at once"',
    "that reading is the crew's",
    "A ready line pins no version",
  ])
    expect(consequences, phrase).toContain(phrase);
  const claude = readFileSync(join(REPO, "CLAUDE.md"), "utf8")
    .split("\n")
    .filter((line) => line.includes("plugins/core/teams/<team>.md"));
  expect(claude).toHaveLength(1);
  expect(claude[0]).toContain("ADR 0025");
});

test(`${ITEM} AC-10: a made row is ready only where no condition holds it, each condition holds by its own mark, and the lower order decides`, () => {
  expect(INSTALL_FORMS.map((entry) => [entry.form, entry.note])).toEqual(Object.entries(NOTES));
  // Order 1: no span between backticks.
  for (const last of ["", "the page read gave no command", "composer require a/b"])
    expect({ last, is: state(last) }).toEqual({ last, is: held(NO_COMMAND) });
  // Order 2: a phrase in any cell, whatever its case; a tag at a word's end.
  const line = "`composer require a/b`";
  for (const phrase of ["Experimental", "EXPERIMENTAL", "a Release Candidate of it"]) {
    expect({ phrase, is: state(line, { second: `a server, ${phrase}` }) }).toEqual({
      phrase,
      is: held(NOT_STABLE),
    });
    expect({ phrase, is: state(line, { third: phrase }) }).toEqual({
      phrase,
      is: held(NOT_STABLE),
    });
  }
  // In the first cell and in the last, outside a line, as in the two between.
  expect(state(line, { stack: "PHP, experimental" })).toEqual(held(NOT_STABLE));
  expect(state(`${line}, a release candidate`)).toEqual(held(NOT_STABLE));
  expect(state(line, { second: "an experimentally fast server" })).toEqual(
    ready("composer require"),
  );
  for (const tag of ["rc", "beta", "alpha", "next", "canary"]) {
    expect({ tag, is: state(`\`composer require a/b@${tag}\``) }).toEqual({
      tag,
      is: held(NOT_STABLE),
    });
    expect({ tag, is: state(`\`npx skills add @scope/pkg@${tag} --skill x\``) }).toEqual({
      tag,
      is: held(NOT_STABLE),
    });
  }
  expect(state("`npx skills add @next/mdx`")).toEqual(ready("npx skills add"));
  expect(state("`npx skills add x@nextgen`")).toEqual(ready("npx skills add"));
  expect(state("`npx skills add @rc`")).toEqual(ready("npx skills add"));
  // Order 3: an address in a line, or the word in the second cell; an address elsewhere holds nothing.
  for (const address of ["http://a.test/mcp", "https://a.test/mcp"])
    expect({ address, is: state(`\`claude plugin install x ${address}\``) }).toEqual({
      address,
      is: held(HOSTED),
    });
  expect(state(line, { second: "a server, hosted" })).toEqual(held(HOSTED));
  expect(state(line, { second: "a server, Hosted by its team" })).toEqual(held(HOSTED));
  expect(state(line, { second: "a self-hostedness note" })).toEqual(ready("composer require"));
  // The word is the second cell's: elsewhere it holds nothing.
  expect(state(line, { stack: "PHP, hosted", third: "hosted" })).toEqual(ready("composer require"));
  // 2026-11-24-001: a word beside the line holds the row, and not as hosted.
  expect(state(`${line}, hosted`)).toEqual(held("its last cell says more than its lines"));
  expect(state(line, { second: "see `https://a.test`", third: "https://a.test/page" })).toEqual(
    ready("composer require"),
  );
  // Order 4: each mark of a value.
  for (const mark of [
    "$HOME",
    "{slug}",
    "<ENDPOINT>",
    "x -e KEY",
    "x -H Key",
    "--env KEY",
    "--header Key",
    "--token",
    "--api-key",
    "--password",
  ])
    expect({ mark, is: state(`\`composer require a/b ${mark}\``) }).toEqual({
      mark,
      is: held(A_VALUE),
    });
  // Order 5: a line of the prompt.
  expect(state("`/plugin install a@b`")).toEqual(held(AT_THE_PROMPT));
  // Order 6: a mark of a shell, or no form.
  for (const mark of ["|", ";", "&", ">", "\n"])
    expect({ mark, is: state(`\`composer require a/b ${mark} sh\``) }).toEqual({
      mark,
      is: held(NO_FORM),
    });
  for (const other of [
    "claude mcp add x -- npx y",
    "npm i -g x",
    "npm i -D x",
    "php artisan migrate",
    "php artisan boost:installer",
    "npx --no-install x",
    "npx --no-install drizzle-kit mcp",
    "npx -y x",
    "composer requirement x",
    "composer",
    " composer require a/b",
    "sudo composer require a/b",
  ])
    expect({ other, is: state(`\`${other}\``) }).toEqual({ other, is: held(NO_FORM) });
  // Order 8: one line of each form, with the form's own note.
  const lineOf: Record<string, string> = {
    "composer require": "composer require --dev a/b",
    "php artisan boost:install": "php artisan boost:install",
    "vendor/bin/mate": "vendor/bin/mate init",
    "npx skills add": "npx skills add a/b --skill c",
    "npx --no-install drizzle-kit skills": "npx --no-install drizzle-kit skills",
    "uvx library-skills install": "uvx library-skills install --skill a --yes --claude",
    "claude plugin marketplace add": "claude plugin marketplace add a/b",
    "claude plugin install": "claude plugin install a@b",
  };
  expect(Object.keys(lineOf)).toEqual(Object.keys(NOTES));
  for (const [form, text] of Object.entries(lineOf)) {
    expect({ form, is: state(`\`${text}\``) }).toEqual({ form, is: ready(form) });
    expect(installLines(ready(form))).toEqual(readyLines(form));
  }
  // Where two conditions hold, the lower order decides.
  expect(state("no command", { second: "experimental" })).toEqual(held(NO_COMMAND));
  expect(state("`claude plugin install https://a.test`", { second: "experimental" })).toEqual(
    held(NOT_STABLE),
  );
  expect(state("`claude plugin install https://a.test/{slug}`")).toEqual(held(HOSTED));
  expect(state("`/plugin install <name>`")).toEqual(held(A_VALUE));
  expect(state("`/plugin install a; b`")).toEqual(held(AT_THE_PROMPT));
  expect(state("`composer require laravel/boost; x`", { shown: ["laravel-boost"] })).toEqual(
    held(NO_FORM),
  );
  // One line held holds the row, whatever the others are.
  expect(state("`composer require a/b`, then `npm i x`")).toEqual(held(NO_FORM));
  expect(state("`composer require a/b`, then `/plugin install a@b`")).toEqual(held(AT_THE_PROMPT));
  // Two lines of one form print its note once; two forms print both, in the order of the lines.
  expect(state("`vendor/bin/mate init` and `vendor/bin/mate discover`")).toEqual(
    ready("vendor/bin/mate"),
  );
  // 2026-11-24-001: the two lines are joined by `then`; `after` is a word beside them, and holds.
  const two = state("`claude plugin install a@b`, then `claude plugin marketplace add a/b`");
  expect(state("`claude plugin install a@b`, after `claude plugin marketplace add a/b`")).toEqual(
    held("its last cell says more than its lines"),
  );
  expect(two).toEqual(ready("claude plugin install", "claude plugin marketplace add"));
  expect(installLines(two)).toEqual(
    readyLines("claude plugin install", "claude plugin marketplace add"),
  );
  // The other two states' lines.
  expect(installLines(ALREADY)).toEqual(["  install: in the project already"]);
  expect(installLines(held(HOSTED))).toEqual([heldLine(HOSTED)]);
  expect(ERROR_SERVICE_HOLD).toBe(CREDENTIAL);
});

const target = (stack: string, tools: string[] = []) => ({ stack, frameworks: [], tools });
const EVERY_STACK = ["php", "node", "python", "go", "rust"].map((stack) => target(stack));

test(`${ITEM} AC-11: the seventeen rows of the backend's declaration take the states the spec lists, and a row is in the project already only by the one sign of a tool its own stack shows`, () => {
  const states = (...targets: { stack: string; frameworks: string[]; tools: string[] }[]) =>
    projectRows(backend(), targets).map((row): [string, RowInstall] => [
      (row.cells[1] ?? "").slice(0, 14),
      row.install,
    ]);
  const plugin = ready("claude plugin marketplace add", "claude plugin install");
  expect(states(...EVERY_STACK)).toEqual([
    ["Laravel Boost:", ready("composer require", "php artisan boost:install")],
    ["Laravel Herd's", held(A_VALUE)],
    ["Symfony AI Mat", ready("composer require", "vendor/bin/mate")],
    ["API Platform's", held(AT_THE_PROMPT)],
    ["WordPress Agen", ready("npx skills add")],
    ["WordPress MCP ", held(NO_COMMAND)],
    ["Drizzle Kit's ", held(NOT_STABLE)],
    ["Drizzle's skil", ready("npx --no-install drizzle-kit skills")],
    ["Prisma's MCP s", held(HOSTED)],
    ["Prisma's skill", ready("npx skills add")],
    ["Deno's skills.", ready("npx skills add")],
    ["FastAPI's skil", ready("uvx library-skills install")],
    ["Litestar's ski", plugin],
    ["Astral's plugi", held(AT_THE_PROMPT)],
    ["Pydantic's ski", plugin],
    ["gopls's built-", held(NOT_STABLE)],
    ["none found", held(NO_COMMAND)],
  ]);
  const boost = (...tools: string[]) => states(target("php", tools))[0]?.[1];
  const mate = (...tools: string[]) => states(target("php", tools))[2]?.[1];
  expect(boost("laravel-boost")).toEqual(ALREADY);
  expect(boost("sentry")).toEqual(ready("composer require", "php artisan boost:install"));
  expect(boost("symfony-ai-mate")).toEqual(ready("composer require", "php artisan boost:install"));
  expect(mate("symfony-ai-mate")).toEqual(ALREADY);
  expect(mate("laravel-boost")).toEqual(ready("composer require", "vendor/bin/mate"));
  expect(states(target("node", ["drizzle"]))[6]?.[1]).toEqual(held(NOT_STABLE));
  // A tool a target of another stack shows is not the row's.
  expect(states(target("php"), target("node", ["laravel-boost"]))[0]?.[1]).toEqual(
    ready("composer require", "php artisan boost:install"),
  );
  // On a made table: a tool with more than one sign never answers, and the package is found past a flag.
  const made = (row: string) =>
    [
      "<!-- made -->",
      "### Per stack, from the framework's or the tool's own team",
      "",
      "| Stack | Server or skills | Read at | How it is installed |",
      "| :- | :- | :- | :- |",
      row,
      "",
    ].join("\n");
  const of = (
    row: string,
    ...targets: { stack: string; frameworks: string[]; tools: string[] }[]
  ) => projectRows(made(row), targets)[0]?.install;
  const sentry = "| PHP | the service's own package | a page | `composer require sentry/sentry` |";
  expect(of(sentry, target("php", ["sentry"]))).toEqual(ready("composer require"));
  const flagged =
    "| PHP | the tool's own package | a page | `composer require --dev laravel/boost` |";
  expect(of(flagged, target("php", ["laravel-boost"]))).toEqual(ALREADY);
  expect(of(flagged, target("php", ["symfony-ai-mate"]))).toEqual(ready("composer require"));
  expect(of(flagged, target("php"), target("node", ["laravel-boost"]))).toEqual(
    ready("composer require"),
  );
  // A tool that a file or a table also shows never answers, though one package shows it too.
  const ruff = "| Python | the tool's own package | a page | `composer require ruff` |";
  expect(of(ruff, target("python", ["ruff"]))).toEqual(ready("composer require"));
  // The package is the line's own: a line that only mentions the tool's package further on is not it.
  const other = "| PHP | another package | a page | `composer require a/b laravel/boost` |";
  expect(of(other, target("php", ["laravel-boost"]))).toEqual(ready("composer require"));
  // A Node row naming a PHP tool's package by a line of Composer's: the stack is the row's.
  const crossed = "| Node / TypeScript | a package | a page | `composer require laravel/boost` |";
  expect(of(crossed, target("node", ["laravel-boost"]))).toEqual(ready("composer require"));
});

/** A Laravel application that reports to Sentry, with a FastAPI service on uv beside it. */
function laravelSentryAndFastapi(more: Record<string, string> = {}): string {
  return makeRepo({
    "composer.json": JSON.stringify({
      require: { "laravel/framework": "^13", "sentry/sentry-laravel": "^4", ...more },
    }),
    "services/ml/requirements.txt": "fastapi[standard]\n",
    "services/ml/uv.lock": "",
    "services/ml/app.py": "x = 1\n",
  });
}

const rowLine = (opens: string) => {
  const line = readFileSync(BACKEND, "utf8")
    .split("\n")
    .find(
      (l) =>
        l.startsWith("| ") &&
        l
          .slice(2)
          .split(" | ")
          .slice(0, 2)
          .some((cell) => cell.startsWith(opens)),
    );
  if (!line) throw new Error(`no row opens with ${opens}`);
  return line;
};

const WARNING =
  "  a row here adds a server that reaches the service's production data with a credential, and a hosted one sends what a session asks off the machine; where the credential is held and with what scope is not decided: run no line of this section before it is";
const NOT_TOLD =
  "not told: the rows of the table Common to every stack for source hosting and databases, which depend on a service nothing detects";

function expectedForLaravel(boost: string[], tools: string): string[] {
  return [
    BACKEND,
    "this project: php (laravel); python (fastapi)",
    tools,
    "rows for this project's frameworks:",
    rowLine("Laravel Boost:"),
    ...boost,
    rowLine("Laravel Herd's"),
    heldLine(A_VALUE),
    rowLine("FastAPI's skill"),
    ...readyLines("uvx library-skills install"),
    "rows for the tools this project shows:",
    rowLine("Astral's plugin"),
    heldLine(AT_THE_PROMPT),
    "rows by stack:",
    "  none",
    "error services this project shows:",
    WARNING,
    rowLine("Errors in production: Sentry"),
    heldLine(CREDENTIAL),
    "left out: 7 rows of another stack, 6 rows of a framework, a tool or a product this project does not show",
    NOT_TOLD,
    LAST,
  ];
}
const BOOST_READY = readyLines("composer require", "php artisan boost:install");
const TOOLS_LINE = "tools: php (sentry); python (uv)";

test(`${ITEM} AC-12: crew sources backend --project prints each row's state after it, the notes of a ready row's forms, and holds a row of the error services whatever its line`, async () => {
  const run = await cliIo(laravelSentryAndFastapi(), testEnv())("sources", "backend", "--project");
  expect(run.code).toBe(0);
  expect(run.out.trimEnd().split("\n")).toEqual(expectedForLaravel(BOOST_READY, TOOLS_LINE));
  // With Boost required, its row is in the project already, with no note line.
  const with_ = await cliIo(laravelSentryAndFastapi({ "laravel/boost": "^2" }), testEnv())(
    "sources",
    "backend",
    "--project",
  );
  expect(with_.out.trimEnd().split("\n")).toEqual(
    expectedForLaravel(
      ["  install: in the project already"],
      "tools: php (laravel-boost, sentry); python (uv)",
    ),
  );
  // A heading with no row prints none and no state line; the two short answers print no state line.
  const node = makeRepo({ "package.json": JSON.stringify({ dependencies: { commander: "^12" } }) });
  const plain = (await cliIo(node, testEnv())("sources", "backend", "--project")).out;
  expect(plain).toContain("\nrows by stack:\n  none\nerror services this project shows:\n");
  expect(plain).not.toContain("install:");
  const empty = await cliIo(makeRepo({ "notes.txt": "x\n" }), testEnv())(
    "sources",
    "backend",
    "--project",
  );
  expect(empty.out).not.toContain("install:");
  const nowhere = tempDir("crew-no-project-");
  write(nowhere, "composer.json", JSON.stringify({ require: { "laravel/framework": "*" } }));
  const outside = await cliIo(nowhere, testEnv())("sources", "backend", "--project");
  expect(outside.out).not.toContain("install:");
  // On a made declaration, an error service's row whose line is a ready form is held all the same.
  const root = tempDir("crew-teams-root-");
  write(
    root,
    "teams/backend.md",
    [
      "<!-- made -->",
      "### Common to every stack",
      "",
      "| Use | Server | Read at | How it is added |",
      "| :- | :- | :- | :- |",
      "| Errors in production: Sentry | the service's own | a page | `composer require x/y` |",
      "",
      "### Per stack, from the framework's or the tool's own team",
      "",
      "| Stack | Server or skills | Read at | How it is installed |",
      "| :- | :- | :- | :- |",
      "| PHP | Laravel's own package | a page | `composer require x/y` |",
      "",
    ].join("\n"),
  );
  const made = sourcesCommand(root, ["backend"], { project: { cwd: laravelSentryAndFastapi() } });
  expect(made.text.split("\n").slice(3, 13)).toEqual([
    "rows for this project's frameworks:",
    "| PHP | Laravel's own package | a page | `composer require x/y` |",
    ...readyLines("composer require"),
    "rows for the tools this project shows:",
    "  none",
    "rows by stack:",
    "  none",
    "error services this project shows:",
    WARNING,
  ]);
  expect(made.text.split("\n").slice(13, 15)).toEqual([
    "| Errors in production: Sentry | the service's own | a page | `composer require x/y` |",
    heldLine(CREDENTIAL),
  ]);
});

test(`${ITEM} AC-13: every form of crew sources ends on the last line, which says who installs and when`, async () => {
  expect(LAST_LINE).toBe(LAST);
  const repo = laravelSentryAndFastapi();
  const run = cliIo(repo, testEnv());
  const forms: string[][] = [
    ["sources"],
    ["sources", "backend"],
    ["sources", "backend", "1"],
    ["sources", "backend", "--project"],
  ];
  for (const form of forms) {
    const answer = await run(...form);
    expect({ form, code: answer.code }).toEqual({ form, code: 0 });
    expect({ form, last: answer.out.trimEnd().split("\n").at(-1) }).toEqual({ form, last: LAST });
  }
  const empty = await cliIo(makeRepo({ "notes.txt": "x\n" }), testEnv())(
    "sources",
    "backend",
    "--project",
  );
  expect(empty.out.trimEnd().split("\n").at(-1)).toBe(LAST);
  const outside = await cliIo(tempDir("crew-no-project-"), testEnv())(
    "sources",
    "backend",
    "--project",
  );
  expect(outside.out.trimEnd().split("\n").at(-1)).toBe(LAST);
});

test(`${ITEM} AC-14: the reference says when the session presents the ready rows, what the yes is and what is never run, and a researcher still installs nothing`, () => {
  const bullets = readFileSync(
    join(pluginRoot(), "skills", "crew", "references", "understand.md"),
    "utf8",
  )
    .split("\n")
    .filter((line) => line.startsWith("- ") && line.includes("`crew sources`"));
  expect(bullets).toHaveLength(1);
  const bullet = bullets[0] ?? "";
  for (const phrase of [
    "says of each row whether it is ready, in the project already or held",
    "present the ready rows once, in one message",
    "the notes printed under ready",
    "only after the person's own yes in this session",
    "still gives that same line",
    "is not run and is said",
    "Never run a held row, a line of a row the command did not print, or any line with nobody present",
    "no validator, default, agent's message or earlier session's answer is the yes",
    "it is an item of its own",
  ])
    expect(bullet, phrase).toContain(phrase);
  expect(bullet).not.toContain("nothing is installed from it");
  const researcher = readFileSync(join(pluginRoot(), "agents", "researcher.md"), "utf8");
  expect(researcher).toContain("nothing is installed from a declaration");
});

test(`${ITEM} AC-15: the form run from the bundle under Node prints what the engine's own process prints, with nothing on its error output`, () => {
  const run = spawnSync(
    "node",
    [join(pluginRoot(), "dist", "crew.mjs"), "sources", "backend", "--project"],
    { cwd: laravelSentryAndFastapi(), encoding: "utf8", env: testEnv() },
  );
  expect({ status: run.status, err: run.stderr }).toEqual({ status: 0, err: "" });
  expect(run.stdout.trimEnd().split("\n")).toEqual(expectedForLaravel(BOOST_READY, TOOLS_LINE));
});
