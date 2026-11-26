import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import { pluginRoot } from "../src/runtimes.ts";
import {
  readSourcesRecord,
  recordSourceRow,
  type SourceEntry,
  sourcesRecordFile,
} from "../src/sources-record.ts";
import { LAST_LINE, recordSourcesCommand } from "../src/team-sources.ts";
import { cliIo, git, hookContext, makeRepo, tempDir, testEnv, write } from "./helpers.ts";

const ITEM = "2026-11-21-007";
const BACKEND = join(pluginRoot(), "teams", "backend.md");
const NAME = ".crew/local/sources.json";
const USAGE =
  "usage: crew sources [<team> [<n>]] | crew sources <team> --project | crew sources <team> --installed <page> | crew sources <team> --declined <page> | crew sources <team> --consented <page>";
const NO_MODE =
  "an install is recorded on a person's own yes or no: crew sources takes no --mode or --validator";
// 2026-11-24-001: every team has a project form, so another team is refused by its own rows, and a name that is no team as crew sources refuses one.
const NO_ROW_FRONTEND =
  "no row of this project is read at that page: crew sources frontend --project prints the rows and their pages";
const NOT_A_TEAM =
  "not a team: the teams are researchers, qa, security, architects, etl, devops, backend, frontend, agentic-os";
const NO_PLACE = "not recorded: .crew/local is not a folder of this project";
const NO_ROW =
  "no row of this project is read at that page: crew sources backend --project prints the rows and their pages";
const HELD_VALUE =
  "not recorded: the row is held, its line takes a value of the machine, a token or a key";
const ALREADY = "not recorded: the row is in the project already";
const NO_FIT = "not recorded: the row does not fit the record's bounds";
const UNREAD = `the record of installs (${NAME}) could not be read as the engine writes it and was not read`;
const NOT_KEPT = `the record that stood (${NAME}) could not be read as the engine writes it and was not kept`;

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
const pageOf = (opens: string) => rowLine(opens).slice(2).split(" | ")[2] ?? "";
const FASTAPI = pageOf("FastAPI's skill");
const FASTAPI_LINE = "uvx library-skills install --skill fastapi --yes --claude";
const FASTAPI_NOTE =
  "    uvx library-skills install: downloads and runs the PyPI package `library-skills` first, which the row does not say is its publisher's";

/** A Laravel application that reports to Sentry, with a FastAPI service on uv beside it. */
function repo(more: Record<string, string> = {}): string {
  return makeRepo({
    "composer.json": JSON.stringify({
      require: { "laravel/framework": "^13", "sentry/sentry-laravel": "^4", ...more },
    }),
    "services/ml/requirements.txt": "fastapi[standard]\n",
    "services/ml/uv.lock": "",
    "services/ml/app.py": "x = 1\n",
  });
}

const file = (root: string) => join(root, ".crew", "local", "sources.json");
const held = (root: string) => readFileSync(file(root), "utf8");
const entriesOf = (root: string) =>
  (JSON.parse(held(root)) as { version: number; rows: SourceEntry[] }).rows;
const entry = (over: Partial<SourceEntry> = {}): SourceEntry => ({
  team: "backend",
  page: FASTAPI,
  decision: "installed",
  at: "2026-11-21T18:04:05.123Z",
  lines: [FASTAPI_LINE],
  ...over,
});
/** A record's file written as a fixture, by the test and not by the engine. */
function plant(root: string, text: string | { version: unknown; rows: unknown }): void {
  mkdirSync(join(root, ".crew", "local"), { recursive: true });
  writeFileSync(file(root), typeof text === "string" ? text : `${JSON.stringify(text, null, 2)}\n`);
}
const record = (root: string, over: Partial<SourceEntry> = {}, at = "2026-11-21T18:04:05.123Z") => {
  const row = entry(over);
  return recordSourceRow(
    root,
    { team: row.team, page: row.page, decision: row.decision, lines: row.lines },
    at,
  );
};
const listing = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .map((e) => join(e.parentPath, e.name).slice(dir.length))
        .sort()
    : [];

test(`${ITEM} AC-9: the record holds one entry a row in the engine's shape, and a file over the cap, not regular or misfitting in anything reads as none`, () => {
  const root = repo();
  expect(sourcesRecordFile(root)).toBe(file(root));
  expect(readSourcesRecord(root)).toEqual({ entries: [], unread: false });
  // The first record makes the folder; the file holds the shape and nothing else.
  expect(existsSync(join(root, ".crew", "local"))).toBe(false);
  expect(record(root)).toEqual({ ok: true, entry: entry(), replaced: null, notKept: false });
  expect(JSON.parse(held(root))).toEqual({ version: 1, rows: [entry()] });
  expect(held(root).endsWith("}\n")).toBe(true);
  expect(readSourcesRecord(root)).toEqual({ entries: [entry()], unread: false });
  // A second row is added after; the first recorded again is replaced in its place.
  const other = { page: "https://example.test/other", lines: ["npx skills add a/b", "x"] };
  expect(record(root, { ...other, decision: "declined" }, "2026-11-22T00:00:00.000Z")).toEqual({
    ok: true,
    entry: entry({ ...other, decision: "declined", at: "2026-11-22T00:00:00.000Z" }),
    replaced: null,
    notKept: false,
  });
  const again = record(root, { decision: "declined" }, "2026-11-23T01:02:03.004Z");
  expect(again).toEqual({
    ok: true,
    entry: entry({ decision: "declined", at: "2026-11-23T01:02:03.004Z" }),
    replaced: entry(),
    notKept: false,
  });
  expect(entriesOf(root)).toEqual([
    entry({ decision: "declined", at: "2026-11-23T01:02:03.004Z" }),
    entry({ ...other, decision: "declined", at: "2026-11-22T00:00:00.000Z" }),
  ]);
  // The same page under another team is another row.
  expect(record(root, { team: "frontend" })).toMatchObject({ ok: true, replaced: null });
  expect(entriesOf(root)).toHaveLength(3);
  // What reads as none, marked unread.
  const unread = (text: string | { version: unknown; rows: unknown }, why: string) => {
    const made = repo();
    plant(made, text);
    expect({ why, read: readSourcesRecord(made) }).toEqual({
      why,
      read: { entries: [], unread: true },
    });
  };
  const fits = repo();
  plant(fits, { version: 1, rows: [entry()] });
  expect(readSourcesRecord(fits)).toEqual({ entries: [entry()], unread: false });
  const empty = repo();
  plant(empty, { version: 1, rows: [] });
  expect(readSourcesRecord(empty)).toEqual({ entries: [], unread: false });
  const rows = (...made: unknown[]) => ({ version: 1, rows: made });
  const without = (key: keyof SourceEntry) => {
    const { [key]: _gone, ...rest } = entry();
    return rest;
  };
  unread("not json", "text that is no JSON");
  unread("[]", "a list at the top");
  unread("null", "null at the top");
  // Over the cap by its leading blanks alone: read whole, it would fit the shape.
  const fitting = JSON.stringify({ version: 1, rows: [entry()] });
  unread(`${" ".repeat(256 * 1024)}${fitting}`, "over the cap");
  const under = repo();
  plant(under, `${" ".repeat(256 * 1024 - fitting.length)}${fitting}`);
  expect(readSourcesRecord(under)).toEqual({ entries: [entry()], unread: false });
  unread({ ...rows(entry()), more: 1 } as never, "a third top key");
  unread(rows({ ...entry(), more: 1 }), "a sixth key of an entry");
  for (const key of ["team", "page", "decision", "at", "lines"] as const)
    unread(rows(without(key)), `no ${key}`);
  unread({ version: 2, rows: [entry()] }, "version 2");
  unread({ version: "1", rows: [entry()] }, "a version that is a string");
  unread({ version: 1, rows: { 0: entry() } }, "rows that are no list");
  unread(rows("x"), "an entry that is no object");
  unread(rows(null), "an entry that is null");
  unread(
    rows(...Array.from({ length: 501 }, (_, i) => entry({ page: `https://example.test/${i}` }))),
    "501 rows",
  );
  unread(rows(entry({ team: "nothing" })), "a team that is no team");
  unread(rows(entry({ team: "__proto__" })), "__proto__ as a team");
  unread(rows(entry({ team: "constructor" })), "constructor as a team");
  unread(rows(entry({ page: "" })), "an empty page");
  unread(rows(entry({ page: "p".repeat(2001) })), "a page of 2001 characters");
  unread(rows({ ...entry(), page: 7 }), "a page that is no string");
  unread(rows({ ...entry(), decision: "ready" }), "a decision that is neither word");
  unread(rows(entry({ at: "2026-11-21" })), "a date with no time");
  unread(rows(entry({ at: "2026-02-30T10:00:00.000Z" })), "a day that does not exist");
  unread(rows(entry({ at: "2026-11-21T18:04:05Z" })), "a time with no milliseconds");
  // A year of six digits is a time JavaScript writes back as it reads it: the form refuses it.
  unread(rows(entry({ at: "+010000-01-01T00:00:00.000Z" })), "a year of six digits");
  unread(rows(entry({ at: "2026-11-21T18:04:05.123+01:00" })), "a time with an offset");
  unread(rows({ ...entry(), at: 1795280000000 }), "an at that is no string");
  unread(rows(entry({ lines: [] })), "empty lines");
  unread(rows(entry({ lines: Array.from({ length: 21 }, () => "x") })), "21 lines");
  unread(rows(entry({ lines: [""] })), "an empty line");
  unread(rows(entry({ lines: ["l".repeat(2001)] })), "a line of 2001 characters");
  unread(rows({ ...entry(), lines: ["x", 7] }), "a line that is no string");
  unread(rows({ ...entry(), lines: "x" }), "lines that are no list");
  unread(rows(entry(), entry({ decision: "declined" })), "two entries of one team and page");
  // The bounds themselves fit.
  const edge = repo();
  plant(
    edge,
    rows(
      entry({
        page: "p".repeat(2000),
        lines: Array.from({ length: 20 }, () => "l".repeat(2000)),
      }),
    ),
  );
  expect(readSourcesRecord(edge).unread).toBe(false);
  // A folder at the path, and a link at the path to a file that fits.
  const folder = repo();
  mkdirSync(file(folder), { recursive: true });
  expect(readSourcesRecord(folder)).toEqual({ entries: [], unread: true });
  // A folder at the file's own name cannot be replaced: nothing is recorded there.
  expect(record(folder)).toEqual({ ok: false, why: "place" });
  expect(readdirSync(sourcesRecordFile(folder))).toEqual([]);
  const linked = repo();
  const outside = tempDir("crew-record-outside-");
  const target = join(outside, "kept.json");
  writeFileSync(target, `${JSON.stringify({ version: 1, rows: [entry()] })}\n`);
  mkdirSync(join(linked, ".crew", "local"), { recursive: true });
  symlinkSync(target, file(linked));
  expect(readSourcesRecord(linked)).toEqual({ entries: [], unread: true });
  // A record over the link replaces the link and leaves what it pointed at as it was.
  const before = readFileSync(target, "utf8");
  expect(record(linked, { decision: "declined" })).toEqual({
    ok: true,
    entry: entry({ decision: "declined" }),
    replaced: null,
    notKept: true,
  });
  expect(readFileSync(target, "utf8")).toBe(before);
  expect(readSourcesRecord(linked)).toEqual({
    entries: [entry({ decision: "declined" })],
    unread: false,
  });
});

test(`${ITEM} AC-10: only the engine writes the record, and git does not see it`, async () => {
  const root = repo();
  const ctx = hookContext({ session_id: "s", cwd: root }, testEnv());
  const decided = (payload: { tool_name: string; tool_input: Record<string, unknown> }) =>
    (onPreToolUse(ctx, payload).hookSpecificOutput as { permissionDecision?: string } | undefined)
      ?.permissionDecision;
  expect(
    decided({ tool_name: "Write", tool_input: { file_path: file(root), content: "{}" } }),
  ).toBe("deny");
  expect(
    decided({
      tool_name: "Edit",
      tool_input: { file_path: NAME, old_string: "a", new_string: "b" },
    }),
  ).toBe("deny");
  expect(decided({ tool_name: "Bash", tool_input: { command: `echo '{}' > ${NAME}` } })).toBe(
    "deny",
  );
  expect(decided({ tool_name: "Bash", tool_input: { command: `cat ${NAME}` } })).toBeUndefined();
  const run = await cliIo(root, testEnv())("sources", "backend", "--installed", FASTAPI);
  expect(run.code).toBe(0);
  expect(existsSync(file(root))).toBe(true);
  expect(
    git(root, "status", "--porcelain")
      .split("\n")
      .filter((l) => l.includes("sources.json")),
  ).toEqual([]);
  expect(git(root, "check-ignore", NAME)).toBe(NAME);
  // Asked file by file, so a folder git does not know is not printed as one line that hides it.
  const untracked = git(root, "status", "--porcelain", "--untracked-files=all").split("\n");
  expect(untracked.filter((l) => l.includes("sources.json"))).toEqual([]);
});

test(`${ITEM} AC-11: the form records a ready row of the project by its page, and each refusal holds its text, writes nothing and prints no row`, async () => {
  const root = repo();
  const run = cliIo(root, testEnv());
  const first = await run("sources", "backend", "--installed", FASTAPI);
  expect({ code: first.code, err: first.err }).toEqual({ code: 0, err: "" });
  const [made] = entriesOf(root);
  if (!made) throw new Error("no entry");
  expect(made).toEqual(entry({ at: made.at }));
  expect(made.at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const day = made.at.slice(0, 10);
  expect(first.out.trimEnd().split("\n")).toEqual([
    rowLine("FastAPI's skill"),
    `recorded: installed on ${day}`,
    LAST_LINE,
  ]);
  const second = await run("sources", "backend", "--declined", FASTAPI);
  const [replaced] = entriesOf(root);
  if (!replaced) throw new Error("no entry");
  expect(entriesOf(root)).toEqual([entry({ decision: "declined", at: replaced.at })]);
  expect(second.out.trimEnd().split("\n")).toEqual([
    rowLine("FastAPI's skill"),
    `recorded: declined on ${replaced.at.slice(0, 10)}`,
    `it replaces: installed on ${day}`,
    LAST_LINE,
  ]);
  // The refusals: exit 1, the exact text, the file as it was, no row printed.
  const before = held(root);
  const refused = async (text: string, ...args: string[]) => {
    const answer = await run("sources", ...args);
    const said = `${answer.out}${answer.err}`;
    expect({ args, code: answer.code, said: said.trim() }).toEqual({ args, code: 1, said: text });
    expect({ args, rows: said.split("\n").filter((l) => l.startsWith("| ")) }).toEqual({
      args,
      rows: [],
    });
    expect({ args, file: held(root) }).toEqual({ args, file: before });
  };
  await refused(NO_MODE, "backend", "--installed", FASTAPI, "--mode", "auto");
  await refused(NO_MODE, "backend", "--declined", FASTAPI, "--validator", "x");
  await refused(NO_MODE, "backend", "--installed", FASTAPI, "--validator");
  await refused(NO_MODE, "backend", "--project", "--mode", "auto");
  await refused(NO_MODE, "backend", "--project", "--validator", "x");
  await refused(NO_MODE, "--validator");
  await refused(USAGE, "backend", "--installed", FASTAPI, "--declined", FASTAPI);
  await refused(USAGE, "backend", "--installed");
  await refused(USAGE, "backend", "--declined");
  await refused(USAGE, "backend", "--installed", "");
  await refused(USAGE, "--installed", FASTAPI);
  await refused(USAGE, "backend", "1", "--installed", FASTAPI);
  await refused(USAGE, "backend", "--project", "--installed", FASTAPI);
  await refused(NO_ROW_FRONTEND, "frontend", "--installed", FASTAPI);
  await refused(NOT_A_TEAM, "nothing", "--declined", FASTAPI);
  await refused(NO_ROW, "backend", "--installed", "https://example.test/no-row");
  await refused(NO_ROW, "backend", "--installed", pageOf("gopls's built-in"));
  await refused(NO_ROW, "backend", "--installed", pageOf("Litestar's skills"));
  await refused(NO_ROW, "backend", "--installed", pageOf("Errors in production: Sentry"));
  await refused(NO_ROW, "backend", "--installed", FASTAPI.slice(0, -1));
  await refused(HELD_VALUE, "backend", "--installed", pageOf("Laravel Herd's"));
  await refused(HELD_VALUE, "backend", "--declined", pageOf("Laravel Herd's"));
  // Where two hold, the lower order decides.
  await refused(
    NO_MODE,
    "backend",
    "--installed",
    FASTAPI,
    "--declined",
    FASTAPI,
    "--mode",
    "auto",
  );
  await refused(NO_ROW_FRONTEND, "frontend", "--installed", "https://example.test/no-row");
  // A flag written with an equals sign is no flag of the command, and neither is another.
  for (const flag of ["--mode=auto", "--first"]) {
    const unknown = await run("sources", "backend", "--installed", FASTAPI, flag);
    expect(unknown.code).toBe(1);
    // The refusal names the flags the command takes, the two that record among them.
    expect(`${unknown.out}${unknown.err}`.trim()).toBe(
      `unknown flag ${flag} for sources (it takes --project, --installed, --declined, --consented, --mode, --validator, --json)`,
    );
    expect(held(root)).toBe(before);
  }
  // No character of the page given is printed back.
  const marked = await run("sources", "backend", "--installed", "QZQZQZ-the-page-given");
  expect(`${marked.out}${marked.err}`).not.toContain("QZ");
  // In the project already.
  const withBoost = repo({ "laravel/boost": "^2" });
  const boost = await cliIo(withBoost, testEnv())(
    "sources",
    "backend",
    "--installed",
    pageOf("Laravel Boost:"),
  );
  expect({ code: boost.code, said: `${boost.out}${boost.err}`.trim() }).toEqual({
    code: 1,
    said: ALREADY,
  });
  expect(existsSync(file(withBoost))).toBe(false);
  // Boost's row, ready where it is not required, is recorded with its two lines.
  const laravel = await run("sources", "backend", "--installed", pageOf("Laravel Boost:"));
  expect(laravel.code).toBe(0);
  expect(entriesOf(root)[1]?.lines).toEqual([
    "composer require laravel/boost --dev",
    "php artisan boost:install",
  ]);
  // On a made declaration: a row of 21 lines, and a page of 2001 characters.
  const table = (page: string, last: string) =>
    [
      "<!-- made -->",
      "### Per stack, from the framework's or the tool's own team",
      "",
      "| Stack | Server or skills | Read at | How it is installed |",
      "| :- | :- | :- | :- |",
      `| PHP | Laravel's own package | ${page} | ${last} |`,
      "",
    ].join("\n");
  const madeRoot = (text: string) => {
    const made = tempDir("crew-teams-root-");
    write(made, "teams/backend.md", text);
    return made;
  };
  const at = "2026-11-21T18:04:05.123Z";
  const many = Array.from({ length: 21 }, (_, i) => `\`composer require a/b${i}\``).join(", ");
  const bounded = repo();
  for (const [page, last] of [
    ["https://example.test/many", many],
    [`https://example.test/${"p".repeat(2001)}`, "`composer require a/b`"],
  ] as const) {
    const answer = recordSourcesCommand(
      madeRoot(table(page, last)),
      ["backend"],
      { installed: page },
      bounded,
      at,
    );
    expect({ last: last.length, answer }).toEqual({
      last: last.length,
      answer: { code: 1, text: NO_FIT },
    });
    expect(existsSync(file(bounded))).toBe(false);
  }
  // Twenty lines fit.
  const twenty = Array.from({ length: 20 }, (_, i) => `\`composer require a/b${i}\``).join(", ");
  expect(
    recordSourcesCommand(
      madeRoot(table("https://example.test/twenty", twenty)),
      ["backend"],
      { declined: "https://example.test/twenty" },
      bounded,
      at,
    ).code,
  ).toBe(0);
  expect(entriesOf(bounded)[0]?.lines).toHaveLength(20);
  // Outside a project the form answers as a writing command does there, and makes no .crew.
  const nowhere = tempDir("crew-no-project-");
  write(nowhere, "requirements.txt", "fastapi\n");
  const outside = await cliIo(nowhere, testEnv())("sources", "backend", "--installed", FASTAPI);
  const status = await cliIo(nowhere, testEnv())("criteria", "x", "add", "y");
  expect(outside.code).toBe(1);
  expect(`${outside.out}${outside.err}`).toBe(`${status.out}${status.err}`);
  expect(existsSync(join(nowhere, ".crew"))).toBe(false);
});

test(`${ITEM} AC-12: the hook reads a recording sources command as a person's own, with no unattended form, and lets the forms that print through`, () => {
  const made = (policy: string) => {
    const root = repo();
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
    `Crew: no person is watching this session (${where}) and an install is recorded on a person's own yes or no: run it in a session a person watches; nothing is recorded until then.`,
  ];
  const withMode = (mode: string) => [
    "deny",
    `Crew: a person is present (${mode} mode) and an install is recorded on their own yes or no: run the command without --mode`,
  ];
  const ASK = ["ask", "Crew: this command records the person's own yes or no to an install"];
  const CONSENT_ASK = [
    "ask",
    "Crew: this command records the person's own consent that a hosted server may receive what a session asks in this project",
  ];
  // 2026-11-26-001: a word the hook cannot read may be the consent's flag, so such a command takes
  // the consent's rule (its texts, and asked under relay too), save where the one such word is the
  // value of a readable --installed or --declined.
  const rules = [
    {
      commands: [
        "crew sources backend --installed https://example.test/a",
        "crew sources backend --declined https://example.test/a",
        "crew sources backend --installed $P",
      ],
      unwatched,
      withMode,
      asked: ASK,
      relayed: null,
    },
    {
      commands: [
        "crew sources backend --x $F",
        'crew sources backend --"$K" page',
        "crew sources $T --project",
        "crew sources backend --project --x *",
      ],
      unwatched: (where: string) => [
        "deny",
        `Crew: no person is watching this session (${where}) and a hosted server receives a project's data on a person's own consent: run it in a session a person watches; nothing is recorded until then.`,
      ],
      withMode: (mode: string) => [
        "deny",
        `Crew: a person is present (${mode} mode) and a hosted server receives a project's data on their own consent: run the command without --mode`,
      ],
      asked: CONSENT_ASK,
      relayed: CONSENT_ASK,
    },
  ];
  for (const rule of rules)
    for (const command of rule.commands) {
      // Nobody watching: denied whatever the flags.
      for (const root of [prompt, relay]) {
        for (const mode of ["dontAsk", "bypassPermissions"]) {
          for (const tail of ["", ` --mode ${mode}`, " --validator x"])
            expect({ command, mode, tail, is: answer(root, `${command}${tail}`, mode) }).toEqual({
              command,
              mode,
              tail,
              is: rule.unwatched(`${mode} mode`),
            });
        }
        expect({ command, is: answer(root, command, "auto", true) }).toEqual({
          command,
          is: rule.unwatched("a headless session in auto mode"),
        });
        expect({ command, is: answer(root, `${command} --mode auto`, "auto", true) }).toEqual({
          command,
          is: rule.unwatched("a headless session in auto mode"),
        });
        // A person present, with --mode: denied.
        expect({ command, is: answer(root, `${command} --mode auto`, "auto") }).toEqual({
          command,
          is: rule.withMode("auto"),
        });
      }
      // A person present: relayed, or asked, --validator or not.
      expect({ command, is: answer(relay, command, "default") }).toEqual({
        command,
        is: rule.relayed,
      });
      expect({ command, is: answer(relay, `${command} --validator x`, "auto") }).toEqual({
        command,
        is: rule.relayed,
      });
      expect({ command, is: answer(prompt, command, "default") }).toEqual({
        command,
        is: rule.asked,
      });
      expect({ command, is: answer(prompt, `${command} --validator x`, "auto") }).toEqual({
        command,
        is: rule.asked,
      });
    }
  // The forms that print are let through in all three.
  for (const command of [
    "crew sources",
    "crew sources backend",
    "crew sources backend 1",
    "crew sources backend --project",
    "crew --json sources backend --project",
  ])
    for (const root of [prompt, relay]) {
      expect({ command, is: answer(root, command, "default") }).toEqual({ command, is: null });
      expect({ command, is: answer(root, command, "dontAsk") }).toEqual({ command, is: null });
      expect({ command, is: answer(root, command, "auto", true) }).toEqual({ command, is: null });
    }
});

const BOOST_READY = [
  "  install: ready",
  "    composer require: adds a dependency to the project's `composer.json`",
  "    php artisan boost:install: runs Boost's installer in the project; it may add Laravel Herd's server, a held row: that part is declined",
];
const HELD_HERD = "  install: held, its line takes a value of the machine, a token or a key";
const HELD_PROMPT =
  "  install: held, its line is typed at Claude Code's prompt, which a session cannot do";
const HELD_CREDENTIAL = "  install: held, it reaches production data with a credential";

/** The whole output of the project form for the repository, with what follows FastAPI's row and what stands before the last line. */
function expected(fastapi: string[], tail: string[] = [], boost: string[] = BOOST_READY): string[] {
  return [
    BACKEND,
    "this project: php (laravel); python (fastapi)",
    "tools: php (sentry); python (uv)",
    "rows for this project's frameworks:",
    rowLine("Laravel Boost:"),
    ...boost,
    rowLine("Laravel Herd's"),
    HELD_HERD,
    rowLine("FastAPI's skill"),
    ...fastapi,
    "rows for the tools this project shows:",
    rowLine("Astral's plugin"),
    HELD_PROMPT,
    "rows by stack:",
    "  none",
    "error services this project shows:",
    "  a row here adds a server that reaches the service's production data with a credential, and a hosted one sends what a session asks off the machine; where the credential is held and with what scope is not decided: run no line of this section before it is",
    rowLine("Errors in production: Sentry"),
    HELD_CREDENTIAL,
    "left out: 7 rows of another stack, 6 rows of a framework, a tool or a product this project does not show",
    "not told: the rows of the table Common to every stack for source hosting and databases, which depend on a service nothing detects",
    ...tail,
    LAST_LINE,
  ];
}

test(`${ITEM} AC-13: the project form prints a recorded row's state in place of ready, never over a hold, and writes nothing`, async () => {
  const root = repo();
  const env = testEnv();
  const printed = async (at: string = root) =>
    (await cliIo(at, env)("sources", "backend", "--project")).out.trimEnd().split("\n");
  const READY = ["  install: ready", FASTAPI_NOTE];
  expect(await printed()).toEqual(expected(READY));
  // An entry whose lines are the row's: the day is the first ten characters of its time.
  plant(root, { version: 1, rows: [entry({ at: "2026-01-02T23:59:59.000Z" })] });
  expect(await printed()).toEqual(expected(["  install: installed, recorded on 2026-01-02"]));
  plant(root, {
    version: 1,
    rows: [entry({ decision: "declined", at: "2026-12-31T00:00:00.000Z" })],
  });
  expect(await printed()).toEqual(expected(["  install: declined, recorded on 2026-12-31"]));
  // An entry whose lines differ: ready again, said, with the notes; nothing of the entry is printed.
  for (const lines of [
    ["QZQZ-another-line"],
    [FASTAPI_LINE, "QZQZ-one-more"],
    [`${FASTAPI_LINE} `],
  ]) {
    plant(root, { version: 1, rows: [entry({ lines, at: "2026-01-02T23:59:59.000Z" })] });
    const out = await printed();
    expect(out).toEqual(
      expected([
        "  install: ready, its line changed since it was recorded as installed on 2026-01-02",
        FASTAPI_NOTE,
      ]),
    );
    expect(out.join("\n")).not.toContain("QZQZ");
  }
  plant(root, {
    version: 1,
    rows: [entry({ decision: "declined", lines: ["x"], at: "2026-03-04T00:00:00.000Z" })],
  });
  expect((await printed())[11]).toBe(
    "  install: ready, its line changed since it was recorded as declined on 2026-03-04",
  );
  // An entry of another team for the same page is not the row's.
  plant(root, { version: 1, rows: [entry({ team: "frontend" })] });
  expect(await printed()).toEqual(expected(READY));
  // A held row and a row in the project already print what they printed, whatever the record holds.
  const herd = pageOf("Laravel Herd's");
  const sentry = pageOf("Errors in production: Sentry");
  plant(root, {
    version: 1,
    rows: [
      entry({
        page: herd,
        lines: [
          'claude mcp add herd php /Applications/Herd.app/Contents/Resources/herd-mcp.phar -e SITE_PATH="$(pwd)"',
        ],
      }),
      entry({ page: sentry, lines: ["x"] }),
      entry({ page: pageOf("Astral's plugin"), lines: ["x"] }),
    ],
  });
  expect(await printed()).toEqual(expected(READY));
  const withBoost = repo({ "laravel/boost": "^2" });
  plant(withBoost, {
    version: 1,
    rows: [
      entry({
        page: pageOf("Laravel Boost:"),
        lines: ["composer require laravel/boost --dev", "php artisan boost:install"],
      }),
    ],
  });
  const already = await printed(withBoost);
  expect(already.slice(4, 6)).toEqual([
    rowLine("Laravel Boost:"),
    "  install: in the project already",
  ]);
  // Boost's row, ready and recorded with its two lines, prints the record and no note.
  plant(root, {
    version: 1,
    rows: [
      entry({
        page: pageOf("Laravel Boost:"),
        decision: "declined",
        lines: ["composer require laravel/boost --dev", "php artisan boost:install"],
      }),
    ],
  });
  expect(await printed()).toEqual(
    expected(READY, [], ["  install: declined, recorded on 2026-11-21"]),
  );
  // The form writes nothing: the project and the user's folder list the same, the record's bytes too.
  const user = env.WIZARDINGCODE_HOME ?? "";
  expect(user).not.toBe("");
  const before = [listing(root), listing(user), held(root)];
  await printed();
  await printed(join(root, "services", "ml"));
  expect([listing(root), listing(user), held(root)]).toEqual(before);
  // A file that misfits: the rows as with no record, and the line before the last.
  plant(root, { version: 1, rows: [entry({ at: "yesterday" })] });
  expect(await printed()).toEqual(expected(READY, [UNREAD]));
  plant(root, "not json");
  const misfit = held(root);
  expect(await printed()).toEqual(expected(READY, [UNREAD]));
  expect(held(root)).toBe(misfit);
  // A new record over it starts the file again and says so.
  const over = await cliIo(root, env)("sources", "backend", "--declined", FASTAPI);
  const [fresh] = entriesOf(root);
  if (!fresh) throw new Error("no entry");
  expect(entriesOf(root)).toEqual([entry({ decision: "declined", at: fresh.at })]);
  expect(over.out.trimEnd().split("\n")).toEqual([
    rowLine("FastAPI's skill"),
    `recorded: declined on ${fresh.at.slice(0, 10)}`,
    NOT_KEPT,
    LAST_LINE,
  ]);
  // No target of a row's stack, and a file that misfits: the standing three lines.
  const bare = makeRepo({ "notes.txt": "x\n" });
  plant(bare, "not json");
  expect((await printed(bare)).slice(1)).toEqual([
    "this project: no target of a stack the declaration has rows for (php, node, python, go, rust)",
    LAST_LINE,
  ]);
});

test(`${ITEM} AC-14: the reference, the ADR's amendment, the help and the usage name the record and its two forms`, async () => {
  const bullets = readFileSync(
    join(pluginRoot(), "skills", "crew", "references", "understand.md"),
    "utf8",
  )
    .split("\n")
    .filter((line) => line.includes("crew sources"));
  expect(bullets).toHaveLength(1);
  for (const phrase of [
    "record it with crew sources backend --installed <page>",
    "with crew sources backend --declined <page>",
    "A recorded row is not presented again",
  ])
    expect(bullets[0], phrase).toContain(phrase);
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
  const parts = adr.split("\n## Amendment: the record (2026-11-21)\n");
  expect(parts).toHaveLength(2);
  // 2026-11-24-001: the record's amendment runs to the next amendment's heading and to no other.
  const [recordPart = "", ...later] = (parts[1] ?? "").split("\n## ");
  expect(later.map((part) => part.split("\n")[0])).toEqual([
    "Amendment of 2026-11-24 (item 2026-11-24-001)",
    "Amendment of 2026-11-24 (item 2026-11-24-002)",
    "Amendment of 2026-11-26 (item 2026-11-26-001)",
  ]);
  for (const phrase of [
    NAME,
    "not committed",
    "a colleague is asked on their own machine",
    "a record says what a session recorded and not that a line ran",
    "no proof the person was asked",
    "A record is not a yes",
    "lets no session run a line",
    "the command refuses --mode",
    "The hook fails open",
    "crew sources backend --installed <page>",
    "crew sources backend --declined <page>",
  ])
    expect(recordPart, phrase).toContain(phrase);
  const run = cliIo(repo(), testEnv());
  const help = (await run("help")).out.split("\n").filter((l) => l.startsWith("  sources "));
  expect(help.some((l) => l.includes("sources <team> --installed <page>"))).toBe(true);
  expect(help.some((l) => l.includes("sources <team> --declined <page>"))).toBe(true);
  const usage = await run("sources", "backend", "1", "2");
  expect(`${usage.out}${usage.err}`.trim()).toBe(USAGE);
});

test(`${ITEM} AC-15: from the bundle under Node the form records, and the project form then prints the recorded state`, () => {
  const root = repo();
  const crew = (...args: string[]) =>
    spawnSync("node", [join(pluginRoot(), "dist", "crew.mjs"), ...args], {
      cwd: root,
      encoding: "utf8",
      env: testEnv(),
    });
  const recorded = crew("sources", "backend", "--installed", FASTAPI);
  expect({ status: recorded.status, err: recorded.stderr }).toEqual({ status: 0, err: "" });
  const [made] = entriesOf(root);
  if (!made) throw new Error("no entry");
  expect(recorded.stdout.trimEnd().split("\n")).toEqual([
    rowLine("FastAPI's skill"),
    `recorded: installed on ${made.at.slice(0, 10)}`,
    LAST_LINE,
  ]);
  const printed = crew("sources", "backend", "--project");
  expect({ status: printed.status, err: printed.stderr }).toEqual({ status: 0, err: "" });
  expect(printed.stdout.trimEnd().split("\n")).toEqual(
    expected([`  install: installed, recorded on ${made.at.slice(0, 10)}`]),
  );
});

test(`${ITEM} AC-17: the writer refuses what the reader would reject, nothing is read or written behind a folder that is a link, and the amendment says the file is under no hash`, async () => {
  const at = "2026-11-21T18:04:05.123Z";
  // A line of 2001 characters, on a made declaration.
  const long = `composer require a/${"b".repeat(2001)}`;
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
      `| PHP | Laravel's own package | https://example.test/long | \`${long}\` |`,
      "",
    ].join("\n"),
  );
  const bounded = repo();
  expect(
    recordSourcesCommand(
      made,
      ["backend"],
      { installed: "https://example.test/long" },
      bounded,
      at,
    ),
  ).toEqual({ code: 1, text: NO_FIT });
  expect(existsSync(file(bounded))).toBe(false);
  // A full file: a row not among the 500 is refused and the file stays; a row among them is replaced.
  const full = repo();
  const others = Array.from({ length: 500 }, (_, i) =>
    entry({ page: `https://example.test/${i}` }),
  );
  plant(full, { version: 1, rows: others });
  const before = held(full);
  const refused = await cliIo(full, testEnv())("sources", "backend", "--installed", FASTAPI);
  expect({ code: refused.code, said: `${refused.out}${refused.err}`.trim() }).toEqual({
    code: 1,
    said: NO_FIT,
  });
  expect(held(full)).toBe(before);
  plant(full, { version: 1, rows: [...others.slice(0, 499), entry()] });
  const replaced = await cliIo(full, testEnv())("sources", "backend", "--declined", FASTAPI);
  expect(replaced.code).toBe(0);
  expect(entriesOf(full)).toHaveLength(500);
  expect(entriesOf(full)[499]?.decision).toBe("declined");
  expect(entriesOf(full).slice(0, 499)).toEqual(others.slice(0, 499));
  // Entries that each fit, and together stand just under the reader's cap: one more would pass it.
  const CAP = 256 * 1024;
  const written = (made: SourceEntry[]) =>
    `${JSON.stringify({ version: 1, rows: made }, null, 2)}\n`;
  const big = (i: number, lines: string[]) =>
    entry({ page: `https://example.test/big/${i}`, lines });
  const heavy = Array.from({ length: 6 }, (_, i) =>
    big(
      i,
      Array.from({ length: 20 }, () => "l".repeat(2000)),
    ),
  );
  // The last entry's one line is cut so that the whole text is the cap less forty bytes.
  const room = CAP - 40 - written([...heavy, big(6, ["l"])]).length + 1;
  const filler: string[] = [];
  for (let left = room; left > 0; left -= 2000) filler.push("l".repeat(Math.min(left, 2000)));
  // Each further line of the filler costs its own quotes, comma and indent, so the text is cut again to the mark.
  const over = written([...heavy, big(6, filler)]).length - (CAP - 40);
  filler[filler.length - 1] = (filler.at(-1) ?? "").slice(over);
  const brim = repo();
  plant(brim, written([...heavy, big(6, filler)]));
  expect(held(brim).length).toBe(CAP - 40);
  expect(readSourcesRecord(brim).entries).toHaveLength(7);
  const full256 = held(brim);
  const past = await cliIo(brim, testEnv())("sources", "backend", "--installed", FASTAPI);
  expect({ code: past.code, said: `${past.out}${past.err}`.trim() }).toEqual({
    code: 1,
    said: NO_FIT,
  });
  expect(held(brim)).toBe(full256);
  // The record's folder a link to a folder that holds a fitting file with FastAPI's entry.
  const linked = repo();
  const outside = tempDir("crew-record-outside-");
  writeFileSync(
    join(outside, "sources.json"),
    `${JSON.stringify({ version: 1, rows: [entry()] }, null, 2)}\n`,
  );
  mkdirSync(join(linked, ".crew"), { recursive: true });
  symlinkSync(outside, join(linked, ".crew", "local"));
  const there = [listing(outside), readFileSync(join(outside, "sources.json"), "utf8")];
  expect(readSourcesRecord(linked)).toEqual({ entries: [], unread: true });
  const printed = (await cliIo(linked, testEnv())("sources", "backend", "--project")).out
    .trimEnd()
    .split("\n");
  expect(printed).toEqual(expected(["  install: ready", FASTAPI_NOTE], [UNREAD]));
  expect(
    recordSourcesCommand(pluginRoot(), ["backend"], { declined: FASTAPI }, linked, at),
  ).toEqual({ code: 1, text: NO_PLACE });
  expect(record(linked)).toEqual({ ok: false, why: "place" });
  // Through the command: exit 1, the refusal alone, the folder behind the link as it was.
  const through = await cliIo(linked, testEnv())("sources", "backend", "--installed", FASTAPI);
  expect({ code: through.code, said: `${through.out}${through.err}`.trim() }).toEqual({
    code: 1,
    said: NO_PLACE,
  });
  expect([listing(outside), readFileSync(join(outside, "sources.json"), "utf8")]).toEqual(there);
  // The folders are asked before the page: a page of no row is answered by the folder all the same.
  expect(
    recordSourcesCommand(
      pluginRoot(),
      ["backend"],
      { installed: "https://example.test/no-row" },
      linked,
      at,
    ),
  ).toEqual({ code: 1, text: NO_PLACE });
  expect([listing(outside), readFileSync(join(outside, "sources.json"), "utf8")]).toEqual(there);
  // A folder in no project is told so, and nothing is made in it.
  const nowhere = tempDir("crew-no-project-");
  expect(
    recordSourcesCommand(pluginRoot(), ["backend"], { installed: FASTAPI }, nowhere, at),
  ).toEqual({
    code: 1,
    text: "this folder is in no project (no .git at or above it, no .crew in it): nothing was read of it",
  });
  expect(readdirSync(nowhere)).toEqual([]);
  // The folder a regular file.
  const blocked = repo();
  mkdirSync(join(blocked, ".crew"), { recursive: true });
  writeFileSync(join(blocked, ".crew", "local"), "x");
  expect(readSourcesRecord(blocked)).toEqual({ entries: [], unread: true });
  expect(
    recordSourcesCommand(pluginRoot(), ["backend"], { installed: FASTAPI }, blocked, at),
  ).toEqual({ code: 1, text: NO_PLACE });
  expect(readFileSync(join(blocked, ".crew", "local"), "utf8")).toBe("x");
  // The engine's own folder a link: the same, on the functions.
  const whole = makeRepo({ "requirements.txt": "fastapi\n" });
  const elsewhere = tempDir("crew-record-outside-");
  mkdirSync(join(elsewhere, "local"));
  writeFileSync(
    join(elsewhere, "local", "sources.json"),
    `${JSON.stringify({ version: 1, rows: [entry()] })}\n`,
  );
  symlinkSync(elsewhere, join(whole, ".crew"));
  const kept = listing(elsewhere);
  expect(readSourcesRecord(whole)).toEqual({ entries: [], unread: true });
  expect(record(whole)).toEqual({ ok: false, why: "place" });
  expect(listing(elsewhere)).toEqual(kept);
  // The amendment's two phrases.
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
  const amendment = adr.split("\n## Amendment: the record (2026-11-21)\n")[1] ?? "";
  expect(amendment).toContain("under no hash");
  expect(amendment).toContain("can only stop a ready row from being presented");
});
