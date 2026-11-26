import { expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTarball } from "../../../scripts/tarball.ts";
import { pluginRoot } from "../src/runtimes.ts";
import { TEAMS } from "../src/team.ts";
import {
  cutDeclaration,
  DECLARATION_MAX_BYTES,
  declarationLine,
  declarationSections,
  LAST_LINE,
  readTeamDeclaration,
  sourcesCommand,
  TEAM_DEFINITION_FILES,
} from "../src/team-sources.ts";
import type { TeamName } from "../src/types.ts";
import { VERSION } from "../src/version.ts";
import { cliIo, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

const REPO = fileURLToPath(new URL("../../../", import.meta.url));
const ITEM = "2026-11-21-001";
const REGISTRY_ORDER = [
  "researchers",
  "qa",
  "security",
  "architects",
  "etl",
  "devops",
  "backend",
  "frontend",
  "agentic-os",
];
const NAMES_LINE = `the teams are ${REGISTRY_ORDER.join(", ")}`;
const LAST_HEADING = /^## \d+\. What the code needs, not decided here$/m;
const GENERATOR = join(REPO, "scripts", "build-team-declarations.ts");

const definitionOf = (team: string, root = REPO) =>
  readFileSync(join(root, "docs", "specs", TEAM_DEFINITION_FILES[team as TeamName]), "utf8");

/** The test's own cut of a definition: from `## 3. ` to the line before the last section's heading. */
function cutOf(definition: string): string {
  const from = definition.indexOf("\n## 3. ") + 1;
  const last = LAST_HEADING.exec(definition);
  if (from === 0 || !last) throw new Error("a definition lacks a heading");
  return definition.slice(from, last.index);
}

/** The test's own reading of the tables of a text: each maximal run of lines that open with a pipe. */
function tablesOf(text: string): { header: string[]; count: number }[] {
  const tables: { header: string[]; count: number }[] = [];
  let run: string[] = [];
  const close = () => {
    if (run.length >= 2) {
      const header = (run[0] ?? "")
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((cell) => cell.trim());
      tables.push({ header, count: run.length - 2 });
    }
    run = [];
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("|")) run.push(line);
    else close();
  }
  close();
  return tables;
}

/** A root with a `teams/` folder holding the files given. */
function rootWith(files: Record<string, string>): string {
  const root = tempDir("crew-teams-root-");
  mkdirSync(join(root, "teams"), { recursive: true });
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  return root;
}

const listing = (dir: string): string[] =>
  existsSync(dir)
    ? (readdirSync(dir, { recursive: true }) as string[]).map(String).sort()
    : ["<absent>"];

test(`${ITEM} AC-13: each team's declaration is its definition from "## 3. " to the line before "What the code needs", under one comment line that names the definition`, () => {
  expect(Object.keys(TEAM_DEFINITION_FILES).sort()).toEqual(Object.keys(TEAMS).sort());
  for (const team of Object.keys(TEAMS)) {
    const text = readFileSync(join(pluginRoot(), "teams", `${team}.md`), "utf8");
    const newline = text.indexOf("\n");
    const first = text.slice(0, newline);
    expect(first.startsWith("<!-- ")).toBe(true);
    expect(first.endsWith(" -->")).toBe(true);
    expect(first).toContain(`docs/specs/${TEAM_DEFINITION_FILES[team as TeamName]}`);
    expect(first).toContain("never edited by hand");
    expect(text.slice(newline + 1)).toBe(cutOf(definitionOf(team)));
  }
});

test(`${ITEM} AC-14: the generator writes the nine declarations from the definitions of the root it is given, and writes nothing where a definition lacks a heading`, () => {
  const copy = tempDir("crew-teams-copy-");
  mkdirSync(join(copy, "docs", "specs"), { recursive: true });
  mkdirSync(join(copy, "plugins", "core", "teams"), { recursive: true });
  for (const file of Object.values(TEAM_DEFINITION_FILES))
    cpSync(join(REPO, "docs", "specs", file), join(copy, "docs", "specs", file));
  const backend = join(copy, "docs", "specs", TEAM_DEFINITION_FILES.backend);
  const changed = readFileSync(backend, "utf8").replace(
    "| Rust | none found | | |",
    "| Rust | a server of the test's own | | |",
  );
  expect(changed).toContain("a server of the test's own");
  writeFileSync(backend, changed);
  writeFileSync(join(copy, "plugins", "core", "teams", "qa.md"), "");
  const run = spawnSync("bun", [GENERATOR, "--root", copy], { encoding: "utf8" });
  expect(run.status).toBe(0);
  for (const team of Object.keys(TEAMS)) {
    const text = readFileSync(join(copy, "plugins", "core", "teams", `${team}.md`), "utf8");
    expect(text.slice(text.indexOf("\n") + 1)).toBe(cutOf(definitionOf(team, copy)));
  }
  expect(readFileSync(join(copy, "plugins", "core", "teams", "backend.md"), "utf8")).toContain(
    "a server of the test's own",
  );
  // A refusal writes nothing, whichever heading is missing. The state on disk is made to differ from
  // what a run would write both before the broken definition in the registry's order (researchers'
  // definition changed, qa's file removed) and after it (backend's definition changed), so a
  // generator that wrote as it went would be seen.
  const teamsDir = join(copy, "plugins", "core", "teams");
  const onDisk = () =>
    readdirSync(teamsDir)
      .sort()
      .map((name) => [name, readFileSync(join(teamsDir, name), "utf8")]);
  const researchers = join(copy, "docs", "specs", TEAM_DEFINITION_FILES.researchers);
  writeFileSync(researchers, `${readFileSync(researchers, "utf8")}\nA line the test added.\n`);
  writeFileSync(
    researchers,
    readFileSync(researchers, "utf8").replace("\n## 3. ", "\n## 3. Changed by the test: "),
  );
  writeFileSync(backend, changed.replace("a server of the test's own", "another server"));
  rmSync(join(teamsDir, "qa.md"));
  const before = onDisk();
  expect(before.map(([name]) => name)).not.toContain("qa.md");
  const etl = join(copy, "docs", "specs", TEAM_DEFINITION_FILES.etl);
  const whole = readFileSync(etl, "utf8");
  const broken: [string, string][] = [
    ["no last section", whole.replace("What the code needs, not decided here", "What is left")],
    ["no third section", whole.replace("\n## 3. ", "\n## Three. ")],
    [
      "the last section before the third",
      whole
        .replace("What the code needs, not decided here", "What is left")
        .replace("\n## 3. ", "\n## 2. What the code needs, not decided here\n\n## 3. "),
    ],
  ];
  for (const [what, text] of broken) {
    writeFileSync(etl, text);
    const refused = spawnSync("bun", [GENERATOR, "--root", copy], { encoding: "utf8" });
    expect({ what, status: refused.status }).toEqual({ what, status: 1 });
    expect(refused.stderr).toContain(TEAM_DEFINITION_FILES.etl);
    expect(refused.stderr).toContain("nothing written");
    expect({ what, files: onDisk() }).toEqual({ what, files: before });
  }
  // With the definition whole again the same tree is written, the earlier refusals having left no mark.
  writeFileSync(etl, whole);
  expect(spawnSync("bun", [GENERATOR, "--root", copy], { encoding: "utf8" }).status).toBe(0);
  expect(readFileSync(join(teamsDir, "qa.md"), "utf8")).toContain(cutOf(definitionOf("qa", copy)));
  expect(readFileSync(join(teamsDir, "backend.md"), "utf8")).toContain("another server");
  expect(readFileSync(join(teamsDir, "researchers.md"), "utf8")).toContain(
    "## 3. Changed by the test: ",
  );
  // `--root` with nothing after it is refused: an empty root would read and write under the cwd.
  const elsewhere = tempDir("crew-teams-cwd-");
  const noRoot = spawnSync("bun", [GENERATOR, "--root"], { encoding: "utf8", cwd: elsewhere });
  expect(noRoot.status).toBe(1);
  expect(noRoot.stderr).toContain(
    "usage: bun scripts/build-team-declarations.ts [--root <repository>]",
  );
  expect(listing(elsewhere)).toEqual([]);
  // The cut itself: either heading missing, or the last one standing before the third section.
  expect(
    cutDeclaration(
      "# T\n\n## 3. A\n\ntext\n\n## 6. What the code needs, not decided here\n",
      "f.md",
    ),
  ).toBe(
    "<!-- Generated by scripts/build-team-declarations.ts from docs/specs/f.md: never edited by hand. -->\n## 3. A\n\ntext\n\n",
  );
  expect(
    cutDeclaration("# T\n\n## 6. What the code needs, not decided here\n\n## 3. A\n", "f.md"),
  ).toBeNull();
  expect(cutDeclaration("# T\n\n## 3. A\n", "f.md")).toBeNull();
  expect(cutDeclaration("# T\n\n## 6. What the code needs, not decided here\n", "f.md")).toBeNull();
});

test(`${ITEM} AC-15: declarationSections answers the backend's six headings numbered from 1 with their levels and their tables, a cell equal to the definition's`, () => {
  const read = readTeamDeclaration(pluginRoot(), "backend");
  if ("refused" in read) throw new Error(read.refused);
  const sections = declarationSections(read.text);
  expect(sections.map((s) => [s.number, s.level, s.heading])).toEqual([
    [1, 2, "## 3. Stacks and where their information comes from"],
    [2, 2, "## 4. Frameworks"],
    [3, 2, "## 5. MCP servers and skills"],
    [4, 3, "### The rules"],
    [5, 3, "### Common to every stack"],
    [6, 3, "### Per stack, from the framework's or the tool's own team"],
  ]);
  const shape = sections.map((s) =>
    s.tables.map((t) => [t.header.length, t.rows.length, ...new Set(t.rows.map((r) => r.length))]),
  );
  expect(shape).toEqual([[[5, 5, 5]], [[2, 5, 2]], [], [], [[4, 8, 4]], [[4, 17, 4]]]);
  const stacks = sections[0]?.tables[0];
  expect(stacks?.header).toEqual([
    "Stack",
    "Official documentation",
    "Source and changelogs",
    "Packages",
    "Practice and security",
  ]);
  expect(stacks?.rows.map((r) => r[0])).toEqual([
    "PHP",
    "Node / TypeScript",
    "Python",
    "Go",
    "Rust",
  ]);
  expect(stacks?.rows[3]?.[3]).toBe("https://pkg.go.dev");
  const definition = definitionOf("backend");
  const perStack = sections[5]?.tables[0];
  expect(perStack?.rows[16]).toEqual(["Rust", "none found", "", ""]);
  for (const row of perStack?.rows ?? [])
    for (const cell of row) if (cell) expect(definition).toContain(cell);
  // A section's own lines open with its heading and stop before the next heading.
  expect(sections[3]?.lines[0]).toBe("### The rules");
  expect(sections[3]?.lines.some((line) => line.startsWith("### Common"))).toBe(false);
  expect(sections[2]?.lines.filter((line) => line.trim())).toEqual([
    "## 5. MCP servers and skills",
  ]);
});

test(`${ITEM} AC-16: for each team the tables declarationSections answers are the tables its definition holds between the two headings, header for header and count for count`, () => {
  for (const team of Object.keys(TEAMS)) {
    const read = readTeamDeclaration(pluginRoot(), team);
    if ("refused" in read) throw new Error(read.refused);
    const answered = declarationSections(read.text).flatMap((s) =>
      s.tables.map((t) => ({ header: t.header, count: t.rows.length })),
    );
    const expected = tablesOf(cutOf(definitionOf(team)));
    expect(expected.length).toBeGreaterThan(2);
    expect({ team, tables: answered }).toEqual({ team, tables: expected });
  }
});

test(`${ITEM} AC-17: crew sources prints one line a team in the registry's order, with its count of sections and its file, then the fixed last line whole`, async () => {
  expect(Object.keys(TEAMS)).toEqual(REGISTRY_ORDER);
  const run = cliIo(makeRepo(), testEnv());
  const listed = await run("sources");
  expect(listed.code).toBe(0);
  const lines = listed.out.trimEnd().split("\n");
  expect(lines).toHaveLength(10);
  expect(lines[9]).toBe(LAST_LINE);
  expect(LAST_LINE).toBe(
    // 2026-11-21-006: the line says who installs and when (ADR 0025).
    "Nothing is installed by this command. A row's install line is what its page gave on the day its definition names. The session installs, a row at a time: only a row that crew sources <team> --project calls ready, after the person's own yes in that session, where its page read again still gives the same line; a row held for being hosted, after the person's own consent recorded with crew sources <team> --consented <page>; with nobody present, nothing (ADR 0025).",
  );
  REGISTRY_ORDER.forEach((team, index) => {
    const read = readTeamDeclaration(pluginRoot(), team);
    if ("refused" in read) throw new Error(read.refused);
    // The count is the test's own: the lines of the definition's cut that open a section.
    const count = cutOf(definitionOf(team))
      .split("\n")
      .filter((line) => line.startsWith("## ") || line.startsWith("### ")).length;
    expect({ team, sections: declarationSections(read.text).length }).toEqual({
      team,
      sections: count,
    });
    expect(lines[index]).toBe(
      `${team}: ${count} sections, ${join(pluginRoot(), "teams", `${team}.md`)}`,
    );
  });
});

test(`${ITEM} AC-18: crew sources backend prints the path and the index with each table's count of rows; crew sources backend 5 prints that section's lines whole and no other section's`, async () => {
  const run = cliIo(makeRepo(), testEnv());
  const index = await run("sources", "backend");
  expect(index.code).toBe(0);
  expect(index.out.trimEnd().split("\n")).toEqual([
    join(pluginRoot(), "teams", "backend.md"),
    "1. 3. Stacks and where their information comes from (5 rows)",
    "2. 4. Frameworks (5 rows)",
    "3. 5. MCP servers and skills",
    "4.   The rules",
    "5.   Common to every stack (8 rows)",
    "6.   Per stack, from the framework's or the tool's own team (17 rows)",
    LAST_LINE,
  ]);
  const section = await run("sources", "backend", "5");
  expect(section.code).toBe(0);
  const lines = section.out.trimEnd().split("\n");
  const definition = definitionOf("backend").split("\n");
  const from = definition.indexOf("### Common to every stack");
  const to = definition.indexOf("### Per stack, from the framework's or the tool's own team");
  expect(from).toBeGreaterThan(0);
  expect(lines.slice(0, -1).join("\n").trimEnd()).toBe(
    definition.slice(from, to).join("\n").trimEnd(),
  );
  expect(lines[lines.length - 1]).toBe(LAST_LINE);
  const rows = lines.filter((line) => line.startsWith("| ") && !line.startsWith("| :-"));
  expect(rows).toHaveLength(9);
  const github = rows.find((line) => line.includes("GitHub's official server")) ?? "";
  expect(github).toContain("is not installed until the building item shows the command");
  expect(github.endsWith("the building item shows the command |")).toBe(true);
  expect(github.length).toBeGreaterThan(1000);
  expect(section.out).not.toContain("Laravel Boost: an MCP server in the project");
  expect(section.out).not.toContain("### The rules");
});

test(`${ITEM} AC-19: a name that is no team, a number that is no section and a third argument are refused with exit 1 and no line of a declaration`, async () => {
  const run = cliIo(makeRepo(), testEnv());
  const said = (answer: { out: string; err: string }) => `${answer.out}${answer.err}`.trim();
  for (const name of ["cobol", "../agents/researcher", "constructor", "Backend", ""]) {
    const answer = await run("sources", name);
    expect({ name, code: answer.code }).toEqual({ name, code: 1 });
    expect(said(answer)).toBe(`not a team: ${NAMES_LINE}`);
  }
  for (const n of ["99", "0", "-1", "5x", "1.5", "x", "7", "05", " 5"]) {
    const answer = await run("sources", "backend", n);
    expect({ n, code: answer.code }).toEqual({ n, code: 1 });
    expect(said(answer)).toBe("backend has 6 sections: give a number from 1 to 6");
  }
  const third = await run("sources", "backend", "1", "2");
  expect(third.code).toBe(1);
  // 2026-11-21-004 edits this line: the usage gained the form of the project's rows.
  expect(said(third)).toBe(
    "usage: crew sources [<team> [<n>]] | crew sources <team> --project | crew sources <team> --installed <page> | crew sources <team> --declined <page> | crew sources <team> --consented <page>",
  );
  const flag = await run("sources", "backend", "--first", "PHP");
  expect(flag.code).toBe(1);
  expect(said(flag)).toContain("unknown flag --first for sources");
  // 2026-11-21-004 edits this line: the usage holds " | " between its two forms now, so "no row of
  // a declaration" is read as what it is, no line that opens as a table's row.
  for (const answer of [third, flag]) expect(said(answer)).not.toMatch(/^\| /m);
});

test(`${ITEM} AC-20: a declaration that is absent, a link, a folder or over the cap is refused by name with no text, and so is a name that is no team where a file stands at the path it would build`, () => {
  const good = "<!-- x -->\n## 3. A\n\ntext\n";
  const path = (root: string) => join(root, "teams", "backend.md");
  const absent = rootWith({});
  expect(readTeamDeclaration(absent, "backend")).toEqual({
    refused: `${path(absent)}: absent or not a regular file`,
  });
  const linked = rootWith({ "elsewhere.md": good });
  symlinkSync(join(linked, "elsewhere.md"), path(linked));
  expect(readTeamDeclaration(linked, "backend")).toEqual({
    refused: `${path(linked)}: absent or not a regular file`,
  });
  const folder = rootWith({ "teams/backend.md/inside.md": good });
  expect(readTeamDeclaration(folder, "backend")).toEqual({
    refused: `${path(folder)}: absent or not a regular file`,
  });
  expect(DECLARATION_MAX_BYTES).toBe(1024 * 1024);
  const large = rootWith({ "teams/backend.md": `${good}${"a".repeat(DECLARATION_MAX_BYTES)}` });
  expect(readTeamDeclaration(large, "backend")).toEqual({
    refused: `${path(large)}: over 1 MiB`,
  });
  const atCap = rootWith({
    "teams/backend.md": `${good}${"a".repeat(DECLARATION_MAX_BYTES - good.length)}`,
  });
  expect("text" in readTeamDeclaration(atCap, "backend")).toBe(true);
  // A name that is no own key of the registry never reaches the file system.
  const planted = rootWith({
    "agents/researcher.md": good,
    "teams/constructor.md": good,
    "teams/toString.md": good,
    "teams/backend.md": good,
  });
  for (const name of ["../agents/researcher", "constructor", "toString", "backend.md", ""])
    expect(readTeamDeclaration(planted, name)).toEqual({ refused: `not a team: ${NAMES_LINE}` });
  expect(readTeamDeclaration(planted, "backend")).toEqual({ path: path(planted), text: good });
  // The command's half, through a copy of the bundle whose plugin root is a temporary folder.
  const bundleRoot = tempDir("crew-bundle-root-");
  mkdirSync(join(bundleRoot, "dist"), { recursive: true });
  mkdirSync(join(bundleRoot, "teams"), { recursive: true });
  cpSync(join(pluginRoot(), "dist", "crew.mjs"), join(bundleRoot, "dist", "crew.mjs"));
  for (const team of REGISTRY_ORDER)
    if (team !== "backend" && team !== "researchers")
      cpSync(join(pluginRoot(), "teams", `${team}.md`), join(bundleRoot, "teams", `${team}.md`));
  const bundle = (...args: string[]) =>
    spawnSync("node", [join(bundleRoot, "dist", "crew.mjs"), ...args], {
      encoding: "utf8",
      cwd: tempDir("crew-elsewhere-"),
      env: testEnv(),
    });
  const one = bundle("sources", "backend");
  expect(one.status).toBe(1);
  expect(`${one.stdout}${one.stderr}`.trim()).toBe(
    `${join(bundleRoot, "teams", "backend.md")}: absent or not a regular file`,
  );
  const all = bundle("sources");
  expect(all.status).toBe(1);
  expect(`${all.stdout}${all.stderr}`.trim()).toBe(
    `${join(bundleRoot, "teams", "researchers.md")}: absent or not a regular file`,
  );
  const present = bundle("sources", "qa");
  expect(present.status).toBe(0);
  expect(present.stdout.split("\n")[0]).toBe(join(bundleRoot, "teams", "qa.md"));
});

test(`${ITEM} AC-21: an escape sequence, a C1 control and a bidi override leave a printed heading and a printed row, and nothing else of a line is cut or trimmed`, () => {
  // Every character under test is built from its code point: none stands in this file.
  const at = (...codes: number[]) => String.fromCodePoint(...codes);
  const REMOVED = [0x1b, 0x9b, 0x202e, 0x200b, 0x2066, 0x2069, 0x07];
  const bad = `${at(0x1b)}[31m${at(0x9b, 0x202e)}`;
  const long = `| Tool | ${"x".repeat(3000)} | https://example.test | npx ${bad}evil --flag |`;
  const fixture = [
    "<!-- x -->",
    `## 3. Sub${bad}jects`,
    "",
    "  - an indented line, kept as it is  ",
    "",
    "| Tool or service | Server or skills | Read at | How it is installed |",
    "| :- | :- | :- | :- |",
    long,
    `${at(0x200b, 0x2066)}zero width and isolate${at(0x2069, 0x07)}`,
    "",
  ].join("\n");
  const root = rootWith({ "teams/backend.md": fixture });
  const index = sourcesCommand(root, ["backend"]);
  expect(index.code).toBe(0);
  expect(index.text.split("\n")).toEqual([
    join(root, "teams", "backend.md"),
    "1. 3. Sub[31mjects (1 row)",
    LAST_LINE,
  ]);
  const section = sourcesCommand(root, ["backend", "1"]);
  expect(section.code).toBe(0);
  const strip = (line: string) =>
    [...line].filter((char) => !REMOVED.includes(char.codePointAt(0) ?? 0)).join("");
  expect(section.text.split("\n")).toEqual([...fixture.split("\n").slice(1).map(strip), LAST_LINE]);
  expect(section.text).toContain("  - an indented line, kept as it is  ");
  expect(section.text).toContain(`| ${"x".repeat(3000)} |`);
  expect(section.text).toContain("| npx [31mevil --flag |");
  for (const code of REMOVED) expect(`${section.text}${index.text}`.includes(at(code))).toBe(false);
  // The rule itself: both ends of each range of the Design leave, and their neighbours stay.
  const ends = [0x00, 0x1f, 0x7f, 0x80, 0x9f, 0x200b, 0x200f, 0x202a, 0x202e, 0x2066, 0x2069];
  expect(declarationLine(ends.map((code) => `${at(code)}a`).join(""))).toBe("a".repeat(11));
  const neighbours = at(0x20, 0x7e, 0xa0, 0x200a, 0x2010, 0x2029, 0x202f, 0x2065, 0x206a);
  expect(declarationLine(neighbours)).toBe(neighbours);
  const plain = `  ${at(0xe9, 0xf1, 0x65e5, 0x672c, 0x2014, 0x1f600)} \`code\` | cell |  `;
  expect(declarationLine(plain)).toBe(plain);
});

test(`${ITEM} AC-22: crew sources writes nothing under the project or the user's crew folder, with no item open, with an item's record changed by hand and outside any project`, async () => {
  const env = testEnv();
  const root = makeRepo();
  const run = cliIo(root, env);
  const userDir = repoPaths(root, env).userDir;
  const expected = await cliIo(makeRepo(), testEnv())("sources", "backend");
  expect(expected.code).toBe(0);
  const before = [listing(root), listing(userDir)];
  for (const args of [["sources"], ["sources", "backend"], ["sources", "backend", "5"]])
    expect((await run(...args)).code).toBe(0);
  expect([listing(root), listing(userDir)]).toEqual(before);
  expect(existsSync(join(root, ".crew"))).toBe(false);
  // An item whose record was changed by hand: a saving command is refused, this one answers the same.
  const started = await run(
    "start",
    "a change",
    "--answers",
    '{"work_type":"chore","is_vague":0,"scope":0,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}',
    "--preserve",
    "the tests keep passing",
    "--json",
  );
  expect(started.code).toBe(0);
  const id = (JSON.parse(started.out) as { id: string }).id;
  const record = join(root, ".crew", "work", id, "work.json");
  writeFileSync(record, readFileSync(record, "utf8").replace('"a change"', '"another change"'));
  expect((await run("criteria", id, "add", "one more")).code).toBe(1);
  const snapshot = [listing(root), listing(userDir)];
  const tampered = await run("sources", "backend");
  expect(tampered).toEqual(expected);
  expect([listing(root), listing(userDir)]).toEqual(snapshot);
  // A folder that is no project at all.
  const nowhere = tempDir("crew-no-project-");
  const nowhereEnv = testEnv();
  const nowhereUser = repoPaths(makeRepo(), nowhereEnv).userDir;
  const userBefore = listing(nowhereUser);
  expect(await cliIo(nowhere, nowhereEnv)("sources", "backend")).toEqual(expected);
  expect(listing(nowhere)).toEqual([]);
  expect(listing(nowhereUser)).toEqual(userBefore);
});

test(`${ITEM} AC-23: crew help lists sources, and the three texts a session meets name the command and say nothing is installed from it`, async () => {
  const help = await cliIo(makeRepo(), testEnv())("help");
  const line = help.out.split("\n").find((l) => l.startsWith("  sources ")) ?? "";
  expect(line).toContain("sources [<team> [<n>]]");
  const reference = (name: string) =>
    readFileSync(join(pluginRoot(), "skills", "crew", "references", name), "utf8");
  const bullet =
    reference("understand.md")
      .split("\n")
      .find((l) => l.startsWith("- ") && l.includes("`crew sources`")) ?? "";
  expect(bullet).toContain("`crew team <id>`");
  expect(bullet).toContain("before the web");
  // 2026-11-21-006: the bullet says who installs, when, and what is never run (ADR 0025).
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
  const leads = reference("conclave.md").split("\n## The leads' validation\n")[1] ?? "";
  expect((leads.split("\n## ")[0] ?? "").replace(/\s+/g, " ")).toContain(
    "the path `crew sources <team>` prints for its team",
  );
  const researcher = readFileSync(join(pluginRoot(), "agents", "researcher.md"), "utf8");
  const sentence = researcher.split("\n").find((l) => l.includes("`crew sources`")) ?? "";
  expect(sentence).toContain("before you search");
  expect(sentence).toContain("nothing is installed from a declaration");
});

test(`${ITEM} AC-25: the release's archive holds the nine declarations, and bin/crew sources from the extracted archive prints the nine teams`, () => {
  const out = tempDir("tarball-teams-");
  const archive = buildTarball(VERSION, out);
  const top = "wizardingcode-developer-crew";
  const paths = execFileSync("tar", ["-tzf", archive], { encoding: "utf8" }).trim().split("\n");
  expect(paths.filter((p) => p.startsWith(`${top}/teams/`) && !p.endsWith("/")).sort()).toEqual(
    REGISTRY_ORDER.map((team) => `${top}/teams/${team}.md`).sort(),
  );
  const extracted = tempDir("extracted-teams-");
  execFileSync("tar", ["-xzf", archive, "-C", extracted]);
  const answer = spawnSync(join(extracted, top, "bin", "crew"), ["sources"], {
    encoding: "utf8",
    cwd: tempDir("crew-elsewhere-"),
    env: testEnv(),
  });
  expect(answer.status).toBe(0);
  const lines = answer.stdout.trimEnd().split("\n");
  expect(lines).toHaveLength(10);
  expect(lines.slice(0, 9).map((l) => l.split(":")[0])).toEqual(REGISTRY_ORDER);
  for (const [index, team] of REGISTRY_ORDER.entries())
    expect(lines[index]?.endsWith(join(top, "teams", `${team}.md`))).toBe(true);
});
