import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { frameworkIds, frameworksOf } from "../src/detect/frameworks.ts";
import { profileChanges } from "../src/detect/index.ts";
import { ensureProfile, loadProfile, refreshProfile, saveProfile } from "../src/profile.ts";
import { pluginRoot } from "../src/runtimes.ts";
import {
  LAST_LINE,
  projectRows,
  type RowMark,
  readTeamDeclaration,
  sourcesCommand,
} from "../src/team-sources.ts";
import type { Profile, Target } from "../src/types.ts";
import { cliIo, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

const ITEM = "2026-11-21-004";
// 2026-11-21-007 edits this literal: the usage gained the two forms that record a row.
const USAGE =
  "usage: crew sources [<team> [<n>]] | crew sources <team> --project | crew sources <team> --installed <page> | crew sources <team> --declined <page>";
const NO_PROJECT =
  "this folder is in no project (no .git at or above it, no .crew in it): nothing was read of it";
const NO_TARGET =
  "this project: no target of a stack the declaration has rows for (php, node, python, go, rust)";
const FOR_FRAMEWORKS = "rows for this project's frameworks:";
// 2026-11-21-005 edits these constants and the whole outputs below: the form gained the rows of
// the tools a project shows, the error services' section, the count line's words and a last note.
// 2026-11-21-006 edits the expected outputs below: each row is followed by its state (ADR 0025).
const BOOST_STATE = [
  "  install: ready",
  "    composer require: adds a dependency to the project's `composer.json`",
  "    php artisan boost:install: runs Boost's installer in the project; it may add Laravel Herd's server, a held row: that part is declined",
];
const FASTAPI_STATE = [
  "  install: ready",
  "    uvx library-skills install: downloads and runs the PyPI package `library-skills` first, which the row does not say is its publisher's",
];
const HELD_VALUE = "  install: held, its line takes a value of the machine, a token or a key";
const HELD_PROMPT =
  "  install: held, its line is typed at Claude Code's prompt, which a session cannot do";
const HELD_NO_FORM = "  install: held, its line is not one of the engine's install forms";
const FOR_TOOLS = "rows for the tools this project shows:";
const BY_STACK = "rows by stack:";
const ERRORS = "error services this project shows:";
const ERRORS_NOTE =
  "  a row here adds a server that reaches the service's production data with a credential, and a hosted one sends what a session asks off the machine; where the credential is held and with what scope is not decided: run no line of this section before it is";
const NOT_TOLD =
  "not told: the rows of the table Common to every stack for source hosting and databases, which depend on a service nothing detects";
const leftOut = (other: string, not: string) =>
  `left out: ${other} of another stack, ${not} of a framework, a tool or a product this project does not show`;
const BACKEND = join(pluginRoot(), "teams", "backend.md");

function backend(): string {
  const read = readTeamDeclaration(pluginRoot(), "backend");
  if ("refused" in read) throw new Error(read.refused);
  return read.text;
}

const target = (stack: string, ...frameworks: string[]) => ({ stack, frameworks });

/** The marks of the declaration's rows, each beside the words its second cell opens with. */
function marks(targets: { stack: string; frameworks: string[] }[], text = backend()) {
  return projectRows(text, targets).map((row): [string, string, RowMark] => [
    row.cells[0] ?? "",
    (row.cells[1] ?? "").slice(0, 14),
    row.mark,
  ]);
}

const PHP_ROWS = [
  "Laravel Boost:",
  "Laravel Herd's",
  "Symfony AI Mat",
  "API Platform's",
  "WordPress Agen",
  "WordPress MCP ",
];
const NODE_ROWS = [
  "Drizzle Kit's ",
  "Drizzle's skil",
  "Prisma's MCP s",
  "Prisma's skill",
  "Deno's skills.",
];
const PYTHON_ROWS = ["FastAPI's skil", "Litestar's ski", "Astral's plugi", "Pydantic's ski"];

test(`${ITEM} AC-1: a PHP target's frameworks decide which of the six PHP rows are the project's, and every row of another stack is another stack's`, () => {
  const all = (mark: RowMark, stack: string, rows: string[]) =>
    rows.map((opens): [string, string, RowMark] => [stack, opens, mark]);
  const others: [string, string, RowMark][] = [
    ...all("other stack", "Node / TypeScript", NODE_ROWS),
    ...all("other stack", "Python", PYTHON_ROWS),
    ["Go", "gopls's built-", "other stack"],
    ["Rust", "none found", "other stack"],
  ];
  const php = (m: RowMark[]) =>
    PHP_ROWS.map((opens, i): [string, string, RowMark] => ["PHP", opens, m[i] as RowMark]);
  const F: RowMark = "framework";
  const N: RowMark = "not this project's";
  expect(marks([target("php", "laravel")])).toEqual([...php([F, F, N, N, N, N]), ...others]);
  expect(marks([target("php", "symfony", "api-platform")])).toEqual([
    ...php([N, N, F, F, N, N]),
    ...others,
  ]);
  expect(marks([target("php")])).toEqual([...php([N, N, N, N, N, N]), ...others]);
  // A target with no frameworks field at all, as a profile of an earlier engine holds it.
  expect(projectRows(backend(), [{ stack: "php" }]).map((r) => r.mark)).toEqual(
    [...php([N, N, N, N, N, N]), ...others].map((r) => r[2]),
  );
  // No target: every row is another stack's.
  expect(new Set(projectRows(backend(), []).map((r) => r.mark))).toEqual(new Set(["other stack"]));
});

test(`${ITEM} AC-2: a row that names no framework is the project's by its stack, in the declaration's order and with the declaration's cells`, () => {
  const rows = projectRows(backend(), [
    target("node", "nestjs"),
    target("python", "fastapi"),
    target("go", "gin"),
    target("rust", "axum", "tokio"),
  ]);
  expect(rows.map((r) => [(r.cells[1] ?? "").slice(0, 14), r.mark])).toEqual([
    ...PHP_ROWS.map((opens) => [opens, "other stack"]),
    ...NODE_ROWS.map((opens) => [opens, "not this project's"]),
    ["FastAPI's skil", "framework"],
    ["Litestar's ski", "not this project's"],
    ["Astral's plugi", "not this project's"],
    ["Pydantic's ski", "not this project's"],
    ["gopls's built-", "by stack"],
    ["none found", "by stack"],
  ]);
  expect(rows).toHaveLength(17);
  // Each row is the declaration's own: its line stands in the file, and its cells are that line's.
  const lines = readFileSync(BACKEND, "utf8").split("\n");
  for (const row of rows) {
    expect(lines).toContain(row.line);
    expect(row.cells).toHaveLength(4);
    expect(row.line.startsWith(`| ${row.cells[0]} | ${row.cells[1]}`)).toBe(true);
  }
  expect(rows[16]?.cells).toEqual(["Rust", "none found", "", ""]);
  // Two targets of one stack: a framework of either makes its row the project's.
  expect(
    projectRows(backend(), [target("python"), target("python", "litestar")])
      .filter((r) => r.cells[0] === "Python")
      .map((r) => r.mark),
  ).toEqual(["not this project's", "framework", "not this project's", "not this project's"]);
});

test(`${ITEM} AC-15: a name is matched as a whole phrase and a framework decides over WordPress, on a made table`, () => {
  const made = (rows: string[]) =>
    [
      "<!-- made -->",
      "### Per stack, from the framework's or the tool's own team",
      "",
      "| Stack | Server or skills | Read at | How it is installed |",
      "| :- | :- | :- | :- |",
      ...rows,
      "",
    ].join("\n");
  const mark = (row: string, ...targets: { stack: string; frameworks: string[] }[]) =>
    projectRows(made([row]), targets).map((r) => r.mark);
  const go = target("go", "gin", "echo");
  expect(mark("| Go | a plugin for Ginkgo and Echoes | | |", go)).toEqual(["by stack"]);
  expect(mark("| Go | Gin's own server | | |", go)).toEqual(["framework"]);
  expect(mark("| Go | the Gin, with Echo beside it | | |", target("go", "echo"))).toEqual([
    "framework",
  ]);
  expect(mark("| Go | Gin's own server | | |", target("go", "chi"))).toEqual([
    "not this project's",
  ]);
  expect(mark("| Go | origin and imagine | | |", go)).toEqual(["by stack"]);
  const both = "| PHP | Laravel's bridge to WordPress | | |";
  expect(mark(both, target("php", "laravel"))).toEqual(["framework"]);
  expect(mark(both, target("php"))).toEqual(["not this project's"]);
  expect(mark("| PHP | WordPress alone | | |", target("php", "laravel"))).toEqual([
    "not this project's",
  ]);
  const drf = "| Python | Django REST Framework's own skills | | |";
  expect(mark(drf, target("python", "django-rest-framework"))).toEqual(["framework"]);
  expect(mark(drf, target("python", "django"))).toEqual(["framework"]);
  expect(mark(drf, target("python", "flask"))).toEqual(["not this project's"]);
  // A framework of another stack named in a row is no framework of the row's.
  expect(
    mark("| Go | built like Laravel | | |", target("go", "gin"), target("php", "laravel")),
  ).toEqual(["by stack"]);
  expect(mark("| Elixir | Phoenix's own server | | |", go, target("elixir"))).toEqual([
    "other stack",
  ]);
  expect(mark("| php | Laravel Boost | | |", target("php", "laravel"))).toEqual(["other stack"]);
  // A text with no such table answers no row.
  expect(
    projectRows("<!-- x -->\n## 3. Stacks\n\n| Stack | A |\n| :- | :- |\n| PHP | x |\n", [go]),
  ).toEqual([]);
});

/** A repository with a Laravel application at the root and a FastAPI service beside it; no package.json. */
function laravelAndFastapi(): string {
  return makeRepo({
    "composer.json": JSON.stringify({ require: { "laravel/framework": "^13" } }),
    "services/ml/requirements.txt": "fastapi[standard]\n",
    "services/ml/app.py": "x = 1\n",
  });
}

const rowLine = (opens: string) => {
  const line = readFileSync(BACKEND, "utf8")
    .split("\n")
    .find((l) => l.startsWith("| ") && l.split(" | ")[1]?.startsWith(opens));
  if (!line) throw new Error(`no row opens with ${opens}`);
  return line;
};

test(`${ITEM} AC-11: crew sources backend --project prints the project's stacks and frameworks, its rows whole under two headings, what was left out and the fixed last line`, async () => {
  const root = laravelAndFastapi();
  const expected = [
    BACKEND,
    "this project: php (laravel); python (fastapi)",
    FOR_FRAMEWORKS,
    rowLine("Laravel Boost:"),
    ...BOOST_STATE,
    rowLine("Laravel Herd's"),
    HELD_VALUE,
    rowLine("FastAPI's skill"),
    ...FASTAPI_STATE,
    FOR_TOOLS,
    "  none",
    BY_STACK,
    "  none",
    ERRORS,
    ERRORS_NOTE,
    "  none",
    leftOut("7 rows", "7 rows"),
    NOT_TOLD,
    LAST_LINE,
  ];
  const run = await cliIo(root, testEnv())("sources", "backend", "--project");
  expect(run.code).toBe(0);
  expect(run.out.trimEnd().split("\n")).toEqual(expected);
  expect(
    rowLine("Laravel Boost:").endsWith(
      "`composer require laravel/boost --dev`, then `php artisan boost:install` |",
    ),
  ).toBe(true);
  // Two targets of one stack: their frameworks are one list, in the table's order whatever the folders'.
  const two = makeRepo({
    "composer.json": JSON.stringify({ require: { "slim/slim": "^4" } }),
    "apps/api/composer.json": JSON.stringify({
      require: { "api-platform/laravel": "*", "laravel/framework": "^13" },
    }),
    "apps/web/package.json": JSON.stringify({
      dependencies: { hono: "^4", "@nestjs/core": "^12" },
    }),
  });
  const merged = await cliIo(two, testEnv())("sources", "backend", "--project");
  expect(merged.out.split("\n")[1]).toBe(
    "this project: node (nestjs, hono); php (laravel, api-platform, slim)",
  );
  expect(merged.out.split("\n").slice(2, 11)).toEqual([
    FOR_FRAMEWORKS,
    rowLine("Laravel Boost:"),
    ...BOOST_STATE,
    rowLine("Laravel Herd's"),
    HELD_VALUE,
    rowLine("API Platform's skills"),
    HELD_PROMPT,
  ]);
  // From a folder below the root the project is the same.
  const below = await cliIo(join(root, "services", "ml"), testEnv())(
    "sources",
    "backend",
    "--project",
  );
  expect(below.out).toBe(run.out);
  // The plain forms answer as before.
  const index = await cliIo(root, testEnv())("sources", "backend");
  expect(index.out).not.toContain("this project");
  expect(index.out.split("\n")[1]).toBe(
    "1. 3. Stacks and where their information comes from (5 rows)",
  );
});

test(`${ITEM} AC-16: a project with no target says so, a heading with no row says none, and a folder in no project is not read`, async () => {
  const empty = makeRepo({ "notes.txt": "x\n" });
  const none = await cliIo(empty, testEnv())("sources", "backend", "--project");
  expect(none.code).toBe(0);
  expect(none.out.trimEnd().split("\n")).toEqual([BACKEND, NO_TARGET, LAST_LINE]);
  const node = makeRepo({ "package.json": JSON.stringify({ dependencies: { commander: "^12" } }) });
  const plain = await cliIo(node, testEnv())("sources", "backend", "--project");
  expect(plain.out.trimEnd().split("\n")).toEqual([
    BACKEND,
    "this project: node (no framework of the table)",
    FOR_FRAMEWORKS,
    "  none",
    FOR_TOOLS,
    "  none",
    BY_STACK,
    "  none",
    ERRORS,
    ERRORS_NOTE,
    "  none",
    leftOut("12 rows", "5 rows"),
    NOT_TOLD,
    LAST_LINE,
  ]);
  // A folder in no project that holds a Laravel manifest: nothing of it is read.
  const nowhere = tempDir("crew-no-project-");
  write(nowhere, "composer.json", JSON.stringify({ require: { "laravel/framework": "^13" } }));
  const outside = await cliIo(nowhere, testEnv())("sources", "backend", "--project");
  expect(outside.code).toBe(0);
  expect(outside.out.trimEnd().split("\n")).toEqual([BACKEND, NO_PROJECT, LAST_LINE]);
  // A subfolder of a folder that holds .crew, with no .git above: the same line, since .crew is looked for in the folder alone.
  const crewOnly = tempDir("crew-only-");
  mkdirSync(join(crewOnly, ".crew"));
  write(crewOnly, "composer.json", JSON.stringify({ require: { "laravel/framework": "^13" } }));
  write(crewOnly, "sub/keep.txt", "x\n");
  const sub = await cliIo(join(crewOnly, "sub"), testEnv())("sources", "backend", "--project");
  expect(sub.out.trimEnd().split("\n")).toEqual([BACKEND, NO_PROJECT, LAST_LINE]);
  // In the folder that holds .crew itself the project is read.
  const atCrew = sourcesCommand(pluginRoot(), ["backend"], { project: { cwd: crewOnly } });
  expect(atCrew.text.split("\n")[1]).toBe("this project: php (laravel)");
});

test(`${ITEM} AC-13: --project takes a team, no value and no section number (2026-11-24-001: every team has the form)`, async () => {
  const run = cliIo(laravelAndFastapi(), testEnv());
  const said = (answer: { out: string; err: string }) => `${answer.out}${answer.err}`.trim();
  const qa = await run("sources", "qa", "--project");
  // 2026-11-24-001: the QA team's form, where a refusal stood.
  expect(qa.code).toBe(0);
  expect(qa.out.split("\n")[0]).toBe(join(pluginRoot(), "teams", "qa.md"));
  expect(qa.out).toContain("\nready: 1 row; held: 26 rows\n");
  for (const args of [
    ["sources", "backend", "5", "--project"],
    ["sources", "backend", "--project", "5"],
    ["sources", "--project"],
    ["sources", "backend", "1", "2"],
  ]) {
    const answer = await run(...args);
    expect({ args, code: answer.code, said: said(answer) }).toEqual({ args, code: 1, said: USAGE });
  }
  const flagFirst = await run("sources", "--project", "backend");
  const flagLast = await run("sources", "backend", "--project");
  expect(flagFirst.code).toBe(0);
  expect(flagFirst.out).toBe(flagLast.out);
  expect(flagLast.out).toContain(FOR_FRAMEWORKS);
  const unknown = await run("sources", "backend", "--first");
  expect(unknown.code).toBe(1);
  expect(said(unknown)).toContain("unknown flag --first for sources");
  const notATeam = await run("sources", "cobol", "--project");
  expect(notATeam.code).toBe(1);
  expect(said(notATeam)).toContain("not a team:");
  for (const answer of [unknown, notATeam]) expect(said(answer)).not.toContain("| ");
});

const listing = (dir: string): string[] =>
  existsSync(dir)
    ? (readdirSync(dir, { recursive: true }) as string[]).map(String).sort()
    : ["<absent>"];

test(`${ITEM} AC-6: crew sources backend --project writes nothing, with no .crew folder and with a record changed by hand, and prints a row without an escape sequence it holds`, async () => {
  const env = testEnv();
  const root = laravelAndFastapi();
  const run = cliIo(root, env);
  const userDir = repoPaths(root, env).userDir;
  const before = [listing(root), listing(userDir)];
  const first = await run("sources", "backend", "--project");
  expect(first.code).toBe(0);
  expect([listing(root), listing(userDir)]).toEqual(before);
  expect(existsSync(join(root, ".crew"))).toBe(false);
  const started = await run(
    "start",
    "a change",
    "--answers",
    '{"work_type":"chore","is_vague":0,"scope":0,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}',
    "--preserve",
    "the tests keep passing",
    "--json",
  );
  const id = (JSON.parse(started.out) as { id: string }).id;
  const record = join(root, ".crew", "work", id, "work.json");
  writeFileSync(record, readFileSync(record, "utf8").replace('"a change"', '"another change"'));
  expect((await run("criteria", id, "add", "one more")).code).toBe(1);
  const profileBefore = readFileSync(join(root, ".crew", "profile.json"), "utf8");
  const snapshot = [listing(root), listing(userDir)];
  const tampered = await run("sources", "backend", "--project");
  expect(tampered).toEqual(first);
  expect([listing(root), listing(userDir)]).toEqual(snapshot);
  expect(readFileSync(join(root, ".crew", "profile.json"), "utf8")).toBe(profileBefore);
  // A made plugin root whose row holds an escape sequence, a C1 control and a bidi override.
  const bad = `${String.fromCodePoint(0x1b)}[31m${String.fromCodePoint(0x9b, 0x202e)}`;
  const made = tempDir("crew-teams-root-");
  write(
    made,
    "teams/backend.md",
    [
      "<!-- made -->",
      "### Per stack, from the framework's or the tool's own team",
      "",
      "| Stack | Server or skills | Read at | How it is installed |",
      "| :- | :- | :- | :- |",
      `| PHP | Laravel Boost | https://example.test | \`composer ${bad}require x\` |`,
      "",
    ].join("\n"),
  );
  const answer = sourcesCommand(made, ["backend"], { project: { cwd: root } });
  expect(answer.code).toBe(0);
  expect(answer.text.split("\n")).toEqual([
    join(made, "teams", "backend.md"),
    "this project: php (laravel); python (fastapi)",
    FOR_FRAMEWORKS,
    "| PHP | Laravel Boost | https://example.test | `composer [31mrequire x` |",
    // The escape stands between the form's two words in the file, so the line opens with no form.
    HELD_NO_FORM,
    FOR_TOOLS,
    "  none",
    BY_STACK,
    "  none",
    ERRORS,
    ERRORS_NOTE,
    "  none",
    leftOut("0 rows", "0 rows"),
    NOT_TOLD,
    LAST_LINE,
  ]);
});

test(`${ITEM} AC-7: understand.md sends a change to backend code to crew sources backend --project, and crew help shows the form`, async () => {
  const bullet =
    readFileSync(join(pluginRoot(), "skills", "crew", "references", "understand.md"), "utf8")
      .split("\n")
      .find((l) => l.startsWith("- ") && l.includes("`crew sources`")) ?? "";
  expect(bullet).toContain("on a change to backend code, `crew sources backend --project`");
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
  const help = await cliIo(makeRepo(), testEnv())("help");
  const line = help.out.split("\n").find((l) => l.startsWith("  sources ")) ?? "";
  expect(line).toContain("sources [<team> [<n>]]");
  expect(help.out).toContain("sources <team> --project");
});

test(`${ITEM} AC-8: a pyproject.toml array that closes on a line past the reader's length ends there, and nothing after it is taken for an entry`, () => {
  const long = "x".repeat(5000);
  const dir = (text: string) => {
    const d = tempDir("crew-fw-");
    write(d, "pyproject.toml", text);
    return d;
  };
  expect(
    frameworksOf(
      dir(
        `[project]\ndependencies = [\n  "requests",\n  "${long}"]\nkeywords = ["flask"]\n\n[tool.poetry.dependencies]\ndjango = "*"\n`,
      ),
      "python",
    ),
  ).toEqual(["django"]);
  // The array opened and closed on one long line: the same.
  expect(
    frameworksOf(dir(`[project]\ndependencies = ["${long}"]\nkeywords = ["flask"]\n`), "python"),
  ).toEqual([]);
  // An entry before the passed-over line is read; one after it is not.
  expect(
    frameworksOf(
      dir(
        `[project]\ndependencies = [\n  "litestar",\n  "${long}",\n  "flask",\n]\nname = "django"\n`,
      ),
      "python",
    ),
  ).toEqual(["litestar"]);
  // With no long line the array is read to its end, as before.
  expect(
    frameworksOf(
      dir('[project]\ndependencies = [\n  "litestar",\n  "flask",\n]\nkeywords = ["django"]\n'),
      "python",
    ),
  ).toEqual(["flask", "litestar"]);
});

test(`${ITEM} AC-14: a saved frameworks that is not exactly the fresh list is a change, said with the fresh ids, and no value of it makes the comparison throw`, () => {
  const base = (frameworks?: unknown): Profile => ({
    version: 1,
    detectedAt: "",
    targets: [
      {
        path: ".",
        stack: "php",
        packageManager: "composer",
        gates: {},
        timeoutMs: 1,
        ...(frameworks === undefined ? {} : { frameworks: frameworks as string[] }),
      } as Target,
    ],
    watch: { exclude: [] },
  });
  const line = (saved: unknown, fresh?: string[]) => profileChanges(base(saved), base(fresh));
  for (const saved of [
    "laravel",
    7,
    { 0: "laravel" },
    ["a word"],
    ["laravel", "a word"],
    [],
    null,
    [["laravel"]],
  ])
    expect({ saved, lines: line(saved, ["laravel"]) }).toEqual({
      saved,
      lines: ["frameworks of .: laravel"],
    });
  expect(line(["api-platform", "laravel"], ["laravel", "api-platform"])).toEqual([
    "frameworks of .: laravel, api-platform",
  ]);
  // A value that is no list and has the fresh list's length: the comparison must not walk it.
  for (const saved of ["l", { length: 1, 0: "laravel" }, { length: 1 }, [undefined], [null]])
    expect({ saved, lines: line(saved, ["laravel"]) }).toEqual({
      saved,
      lines: ["frameworks of .: laravel"],
    });
  for (const saved of ["laravel", ["a word"], 0, { length: 0 }])
    expect({ saved, lines: line(saved) }).toEqual({ saved, lines: ["frameworks of .: none"] });
  // Level: exactly the fresh list, an absent field against none, an empty list against none.
  expect(line(["laravel", "api-platform"], ["laravel", "api-platform"])).toEqual([]);
  expect(line(undefined)).toEqual([]);
  expect(line([])).toEqual([]);
  expect(line(undefined, ["laravel"])).toEqual(["frameworks of .: laravel"]);
  // Through a refresh: the fresh list is saved over each hand-made value, or the field leaves.
  const env = testEnv();
  const root = makeRepo({
    "composer.json": JSON.stringify({ require: { "laravel/framework": "^13" } }),
  });
  const paths = repoPaths(root, env);
  const { profile } = ensureProfile(paths);
  for (const saved of ["laravel", 7, { a: 1 }, ["laravel", "a word"]]) {
    const forged = {
      ...profile,
      targets: profile.targets.map((t) => ({ ...t, frameworks: saved as string[] })),
    };
    saveProfile(paths, forged);
    expect({ saved, changed: refreshProfile(paths, forged).changed }).toEqual({
      saved,
      changed: ["frameworks of .: laravel"],
    });
    expect(loadProfile(paths).profile?.targets[0]?.frameworks).toEqual(["laravel"]);
  }
  write(root, "composer.json", JSON.stringify({ require: { php: "^8.3" } }));
  const forged = {
    ...profile,
    targets: profile.targets.map((t) => ({ ...t, frameworks: "laravel" as unknown as string[] })),
  };
  saveProfile(paths, forged);
  expect(refreshProfile(paths, forged).changed).toEqual(["frameworks of .: none"]);
  const saved = loadProfile(paths).profile?.targets[0];
  expect(saved && "frameworks" in saved).toBe(false);
  // frameworkIds: the ids of the table a list holds, in its order; none for what is no list.
  expect(frameworkIds(["tokio", "not-an-id", "axum", 7, null, "__proto__"])).toEqual([
    "tokio",
    "axum",
  ]);
  expect(frameworkIds(["laravel", "laravel"])).toEqual(["laravel", "laravel"]);
  for (const value of ["laravel", 7, { 0: "laravel", length: 1 }, null, undefined])
    expect(frameworkIds(value)).toEqual([]);
});
