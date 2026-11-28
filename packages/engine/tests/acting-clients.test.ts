import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { actingAsk, actingDeny, actingOf } from "../src/hooks/acting.ts";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import type { HookContext } from "../src/hooks/types.ts";
import { git, hookContext, makeRepo, testEnv } from "./helpers.ts";

const ITEM = "2026-11-27-004";
const REPO = join(import.meta.dir, "..", "..", "..");

/** A line's words as the hook's walk gives them: a double-quoted run is part of its word, its quotes gone. */
function words(line: string): string[] {
  const out: string[] = [];
  let word: string | null = null;
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      word ??= "";
    } else if (char === " " && !quoted) {
      if (word !== null) out.push(word);
      word = null;
    } else word = (word ?? "") + char;
  }
  if (word !== null) out.push(word);
  return out;
}
const acts = (lines: [string, string][]) => {
  for (const [line, text] of lines) expect([line, actingOf(words(line))]).toEqual([line, text]);
};
const passes = (lines: string[]) => {
  for (const line of lines) expect([line, actingOf(words(line))]).toEqual([line, null]);
};

test(`${ITEM}: the test's own reader gives a quoted statement as one word`, () => {
  expect(words('psql shop -c "select 1; drop table t"')).toEqual([
    "psql",
    "shop",
    "-c",
    "select 1; drop table t",
  ]);
  expect(words('mysql -e"show tables" -c ""')).toEqual(["mysql", "-eshow tables", "-c", ""]);
});

test(`${ITEM} AC-8: psql acts unless the line shows a read`, () => {
  acts([
    ["psql", "psql"],
    ["psql shop", "psql"],
    ["psql -d shop -U ana", "psql"],
    ["psql -f migration.sql", "psql -f"],
    ["psql -f a.sql --file=b.sql", "psql -f"],
    ["psql shop --file=migration.sql", "psql --file"],
    ["psql --file migration.sql", "psql --file"],
    ['psql -c "select 1" -f x.sql', "psql -f"],
    ['psql -c "drop table orders"', "psql -c"],
    ['psql shop -c "delete from t"', "psql -c"],
    ['psql --command="truncate t"', "psql --command"],
    ['psql --command "update t set a = 1"', "psql --command"],
    ['psql -c "select 1" -c "insert into t values (1)"', "psql -c"],
    ['psql -c"select 1"', "psql"],
    ['psql -Atc "select 1"', "psql"],
    ["psql -X -q shop", "psql"],
  ]);
  expect(actingOf(words('psql -c "select 1"'), true)).toBe(
    "psql with a verb the guard cannot read",
  );
  passes([
    'psql -c "select count(*) from orders"',
    'psql shop -c "SELECT 1"',
    'psql --command="show server_version"',
    'psql -c "select 1" -c "\\dt"',
    'psql -c "\\d+ orders"',
    'psql -c "\\l"',
    "psql -l",
    "psql --list",
    "psql --version",
    "psql -V",
    "psql --help",
    "psql -?",
    "psql -f x.sql --help",
    "pg_dump shop",
    "pgcli shop",
    // a limit the design names: a statement behind short options written as one word is not found
    'psql -c "select 1" -Atc "drop table t"',
  ]);
});

test(`${ITEM} AC-9: mysql and mariadb act unless the line shows a read`, () => {
  acts([
    ["mysql", "mysql"],
    ["mysql shop", "mysql"],
    ["mysql -u ana -psecret shop", "mysql"],
    ['mysql shop -e "drop table orders"', "mysql -e"],
    ['mysql -e"delete from t"', "mysql -e"],
    ['mysql --execute="update t set a = 1"', "mysql --execute"],
    ['mysql -e "source dump.sql"', "mysql -e"],
    ["mysql -e \"select 1 into outfile 'x'\"", "mysql -e"],
    ['mysql -e "\\d"', "mysql -e"],
    ['mysql -e ".tables"', "mysql -e"],
    ['mysql --delimiter=// -e "select 1 // drop table t"', "mysql --delimiter"],
    ['mysql --delimiter // -e "select 1"', "mysql --delimiter"],
    ['mysql -Nse "select 1"', "mysql"],
    ["mariadb shop", "mariadb"],
    ['mariadb -e "truncate t"', "mariadb -e"],
  ]);
  passes([
    'mysql shop -e "select count(*) from orders"',
    'mysql -e"show tables"',
    'mysql --execute="describe orders"',
    'mysql -e "desc orders"',
    'mysql -e "explain select 1"',
    'mariadb -e "show databases"',
    "mysql --version",
    "mysql -V",
    "mysql --help",
    "mariadb --version",
    "mysqldump shop",
    "mysqlsh",
    "mycli shop",
  ]);
});

test(`${ITEM} AC-10: sqlite3 and duckdb act unless the line shows a read`, () => {
  acts([
    ["sqlite3", "sqlite3"],
    ["sqlite3 app.db", "sqlite3"],
    ['sqlite3 app.db "delete from users"', "sqlite3"],
    ['sqlite3 app.db "select 1" "drop table t"', "sqlite3"],
    ['sqlite3 app.db ".read load.sql"', "sqlite3"],
    ['sqlite3 app.db ".import users.csv users"', "sqlite3"],
    ['sqlite3 app.db "\\dt"', "sqlite3"],
    ['sqlite3 -cmd "pragma journal_mode=wal" app.db "select 1"', "sqlite3 -cmd"],
    ['sqlite3 --cmd "delete from t" app.db "select 1"', "sqlite3 -cmd"],
    ['sqlite3 -cmd ".tables" app.db', "sqlite3"],
    ["sqlite3 -init load.sql app.db", "sqlite3 -init"],
    ["sqlite3 app.zip -A -x", "sqlite3 -A"],
    ['sqlite3 -- app.db "-- a comment"', "sqlite3"],
    ["duckdb", "duckdb"],
    ["duckdb data.db", "duckdb"],
    ["duckdb data.db \"copy t to 'x.csv'\"", "duckdb"],
    ['duckdb -c "create table t as select 1"', "duckdb -c"],
    ['duckdb -s "install httpfs"', "duckdb -s"],
    ["duckdb -f load.sql", "duckdb -f"],
    ["duckdb --init x.sql", "duckdb -init"],
    ['duckdb -cmd "attach \'x.db\'" -c "select 1"', "duckdb -cmd"],
    ['duckdb -cmd "select 1" data.db', "duckdb"],
    ['duckdb data.db -serve -c "select 1"', "duckdb -serve"],
    ['duckdb -connect -c "select 1"', "duckdb -connect"],
    ['duckdb -ui -c "select 1"', "duckdb -ui"],
  ]);
  passes([
    'sqlite3 app.db "select count(*) from users"',
    'sqlite3 app.db ".tables"',
    'sqlite3 app.db ".schema users" "select 1"',
    'sqlite3 -separator , -lookaside 64 8 app.db "select 1"',
    'sqlite3 -readonly -json app.db "select 1"',
    'sqlite3 -cmd ".tables" app.db "select 1"',
    "sqlite3 -version",
    "sqlite3 --help",
    'duckdb data.db "select 42"',
    'duckdb :memory: "describe select 1"',
    'duckdb -c "select 1" -c "show tables"',
    'duckdb -cmd ".tables" -c "select 1"',
    'duckdb -separator , data.db "select 1"',
    "duckdb -version",
    "duckdb -h",
    "duckdb -manual read_csv",
    "duckdb -format",
    "duckdb -format-file x.sql",
    "litecli app.db",
    // after `--` a word that starts with a dash is the file
    'sqlite3 -- -app.db "select 1"',
  ]);
  // Every other valued option is passed over with its value: without it the value would be the
  // file and the file a statement that is no read.
  const VALUED: Record<string, string> = {
    sqlite3: "-escape -heap -maxsize -mmap -newline -nonce -nullvalue -separator -vfs",
    duckdb: "-newline -nullvalue -separator -storage-version",
  };
  for (const [client, options] of Object.entries(VALUED))
    for (const option of options.split(" "))
      expect([client, option, actingOf([client, option, "v", "app.db", "select 1"])]).toEqual([
        client,
        option,
        null,
      ]);
  for (const option of ["-lookaside", "-pagecache"])
    expect([option, actingOf(["sqlite3", option, "64", "8", "app.db", "select 1"])]).toEqual([
      option,
      null,
    ]);
});

test(`${ITEM} AC-11: a statement is a read only where it starts as one and holds no held word`, () => {
  const read = (statement: string) => actingOf(["psql", "-c", statement]);
  for (const statement of [
    "select 1",
    "  SELECT 1 ;",
    "select 1; select 2",
    "show all",
    "explain select 1",
    "values (1)",
    "with a as (select 1) select * from a",
    "\\d",
    "\\dt public.*",
    "\\l",
    "\\z",
    "\\conninfo",
    // a held word inside a longer name
    "select updated_at, deleted, into_stock from t",
    "select last_update, soft_delete from t",
  ])
    expect([statement, read(statement)]).toEqual([statement, null]);
  for (const statement of [
    "",
    ";",
    "select 1; drop table t",
    "select 1 into t2",
    "select * into outfile 'x' from t",
    "with d as (delete from t returning *) select * from d",
    "with u as (update t set a = 1 returning *) select 1",
    "with i as (insert into t values (1) returning *) select 1",
    "with m as (merge into t using s on true when matched then do nothing) select 1",
    "with m as (merge t using s on true when matched then do nothing) select 1",
    "explain analyze select 1",
    "explain analyse create table t2 as select 1",
    "select nextval('s')",
    "select setval('s', 1)",
    "select pg_terminate_backend(1)",
    "select pg_cancel_backend(1)",
    "select lo_import('/etc/passwd')",
    "select lo_export(1, '/tmp/x')",
    "select lo_unlink(1)",
    "select * from t for update",
    "select 1 \\gexec",
    "select 1 \\g out.txt",
    "select 1 \\watch",
    "\\copy t from 'x.csv'",
    "\\i load.sql",
    "\\! rm x",
    "\\o out.txt",
    "\\x",
    "\\lo_import x.bin",
    "\\lx",
    ".tables",
    "select $1",
    `select ${String.fromCharCode(96)}date${String.fromCharCode(96)}`,
    "insert into t values (1)",
    "update t set a = 1",
    "delete from t",
    "drop table t",
    "truncate t",
    "alter table t add c int",
    "create table t (a int)",
    "call p()",
    "do $$ begin end $$",
    "copy t to stdout",
    "vacuum",
    "set role admin",
    "pragma user_version = 2",
    "table orders",
    "selects",
    "selection",
  ])
    expect([statement, read(statement)]).toEqual([statement, "psql -c"]);
});

type Answer = {
  hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
};
const decision = (r: unknown) => (r as Answer).hookSpecificOutput?.permissionDecision;
const reason = (r: unknown) => (r as Answer).hookSpecificOutput?.permissionDecisionReason;
const bash = (ctx: HookContext, command: string, permission_mode = "default") =>
  onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode });
const turnOn = (ctx: HookContext) => {
  (ctx.policy as unknown as { actingCommands?: string }).actingCommands = "ask";
};
function project() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(join(root, ".crew", "policy.json"), "{}");
  return { root, ctx: hookContext({ session_id: "s", cwd: root }, testEnv()) };
}
const BRANCH = "crew/2026-11-27-004/T-1";
function opened(kind: "mail" | "journey", on: boolean) {
  const { root } = project();
  git(root, "checkout", "-q", "-b", BRANCH);
  const ctx = hookContext(
    { session_id: "s", cwd: root },
    {
      ...testEnv(),
      WIZARDINGCODE_CREW_MAIL_ID: "M-2026-11-27-003-clients",
      WIZARDINGCODE_CREW_MAIL_BRANCH: BRANCH,
      CLAUDE_CODE_SESSION_ATTENDED: "0",
    },
  );
  if (kind === "journey") {
    ctx.openedBy = "journey J-1";
    ctx.journeyId = "J-1";
    ctx.openedBranch = BRANCH;
  }
  if (on) turnOn(ctx);
  return ctx;
}
const ASKED: [string, string][] = [
  ['psql -c "drop table orders"', "psql -c"],
  ["mysql shop < dump.sql", "mysql"],
  // the statement reaches the reader as one word: its second part is read
  ['psql -c "select count(*) from orders; drop table orders"', "psql -c"],
  ['sqlite3 app.db "select 1; delete from users"', "sqlite3"],
  // behind a lead and through a runner
  ['sudo -u postgres psql -c "drop table t"', "psql -c"],
  ["uv run psql -f x.sql", "psql -f"],
];
const READS = ['psql -c "select count(*) from orders"', 'sqlite3 app.db "select 1"'];

test(`${ITEM} AC-12: with a person the hook asks for a client's use that is no read, and with nobody it denies it`, () => {
  for (const [line, text] of ASKED) {
    expect([line, bash(project().ctx, line)]).toEqual([line, {}]);
    const on = project();
    turnOn(on.ctx);
    const asked = bash(on.ctx, line);
    expect([line, decision(asked)]).toEqual([line, "ask"]);
    expect(reason(asked)).toContain(actingAsk(text));
    const nobody = bash(on.ctx, line, "dontAsk");
    expect([line, decision(nobody)]).toEqual([line, "deny"]);
    expect(reason(nobody)).toContain(actingDeny(text, "dontAsk").slice(0, 60));
  }
  for (const line of READS) {
    expect([line, bash(project().ctx, line)]).toEqual([line, {}]);
    const on = project();
    turnOn(on.ctx);
    expect([line, bash(on.ctx, line)]).toEqual([line, {}]);
    expect([line, bash(on.ctx, line, "dontAsk")]).toEqual([line, {}]);
  }
});

test(`${ITEM} AC-12: an opened session is denied a client's use that is no read only where the key is on`, () => {
  const DATA: [string, string][] = [
    ['psql -c "drop table orders"', "psql -c"],
    ['sqlite3 app.db "delete from users"', "sqlite3"],
  ];
  for (const kind of ["mail", "journey"] as const) {
    const off = opened(kind, false);
    for (const [line] of DATA)
      expect([kind, line, bash(off, line, "dontAsk")]).toEqual([kind, line, {}]);
    expect([kind, bash(off, 'psql -c "select 1"', "dontAsk")]).toEqual([kind, {}]);
    const on = opened(kind, true);
    for (const [line, text] of DATA) {
      const answer = bash(on, line, "dontAsk");
      expect([kind, line, decision(answer)]).toEqual([kind, line, "deny"]);
      expect([kind, line, (reason(answer) ?? "").includes(`: ${text} is denied; `)]).toEqual([
        kind,
        line,
        true,
      ]);
    }
    expect([kind, bash(on, 'psql -c "select 1"', "dontAsk")]).toEqual([kind, {}]);
  }
});

test(`${ITEM} AC-13: ADR 0026 ends with this item's amendment, and the table's comment says what a client row is`, () => {
  const adr = readFileSync(
    join(REPO, "docs", "adr", "0026-an-acting-command-is-asked-where-a-project-says-so.md"),
    "utf8",
  );
  const heading = "## Amendment of 2026-11-27 (item 2026-11-27-004)";
  expect(adr.match(/^## .*$/gm)?.at(-1)).toBe(heading);
  const part = adr.slice(adr.indexOf(heading));
  for (const said of [
    // the four rows and every option of the table
    "`psql`",
    "`mysql`",
    "`mariadb`",
    "`sqlite3`",
    "`duckdb`",
    "`-c`",
    "`--command`",
    "`-f`",
    "`--file`",
    "`-l`",
    "`--list`",
    "`-V`",
    "`--version`",
    "`-?`",
    "`--help`",
    "`-e`",
    "`--execute`",
    "`--delimiter`",
    "`-I`",
    "`-cmd`",
    "`-init`",
    "`-A`",
    "`-version`",
    "`-help`",
    "`-escape`",
    "`-heap`",
    "`-maxsize`",
    "`-mmap`",
    "`-newline`",
    "`-nonce`",
    "`-nullvalue`",
    "`-separator`",
    "`-vfs`",
    "`-lookaside`",
    "`-pagecache`",
    "`-s`",
    "`-serve`",
    "`-connect`",
    "`-ui`",
    "`-h`",
    "`-manual`",
    "`-format`",
    "`-format-file`",
    "`-storage-version`",
    // the five steps
    "before reading stdin",
    "in the place of standard input",
    "`<client> <option>`",
    "`<client> with a verb the guard cannot read`",
    // a read: the starting words, the listing commands by their row, the held words
    "`select`",
    "`show`",
    "`explain`",
    "`describe`",
    "`desc`",
    "`values`",
    "`with`",
    "`\\d`",
    "`\\l`",
    "`\\z`",
    "`\\conninfo`",
    "`.tables`",
    "`.schema`",
    "`.indexes`",
    "`.databases`",
    "for `psql` alone",
    "for `sqlite3` and `duckdb` alone",
    "its delimiter command",
    "`into`",
    "`insert`",
    "`update`",
    "`delete`",
    "`merge`",
    "`analyze`",
    "`analyse`",
    "`nextval`",
    "`setval`",
    "`pg_terminate_backend`",
    "`pg_cancel_backend`",
    "`lo_import`",
    "`lo_export`",
    "`lo_unlink`",
    "letters, digits and `_`",
    "no backslash after its first character",
    "no `$` and no backquote",
    // the session's knowledge, and the earlier sentences
    "the session's knowledge",
    "`ANALYSE`",
    "items 2026-11-27-002 and 2026-11-27-003",
    "for `mongosh` and `redis-cli` alone",
    // what a row asks on
    '`echo "select 1" | psql`',
    "`psql shop <<EOF`",
    '`psql -Atc "select 1"`',
    '`mysql -Nse "select 1"`',
    "`pragma table_info(users)`",
    "`table orders`",
    "`\\timing`",
    "`select 'update'`",
    "`select * from t for update`",
    "a file that only reads",
    // what passes
    '`psql -c "select 1" -Atc "drop table t"`',
    "`-fx.sql`",
    "`--comm=`",
    "`--exec=`",
    "`dblink_exec`",
    "`set_config`",
    "`pg_reload_conf`",
    "`pg_advisory_lock`",
    "`pg_read_file`",
    "`get_lock`",
    "`writefile()`",
    "`edit()`",
    "`load_extension()`",
    "downloads an extension",
    "`~/.psqlrc`",
    "`~/.my.cnf`",
    "`~/.sqliterc`",
    "`~/.duckdbrc`",
    "`--defaults-file`",
    "`--defaults-extra-file`",
    "`--init-command`",
    "`--init-command-add`",
    "`psql -o`",
    "`-L`",
    '`sqlite3 app.db -cmd "delete from users" -version`',
    '`psql -c "drop table t" -U -l`',
    "`clickhouse-client`",
    "`cqlsh`",
    "`sqlcmd`",
    "`bq`",
    "`snowsql`",
    "`mysqlsh`",
    "`pgcli`",
    "`mycli`",
    "`usql`",
    "`litecli`",
    "`artisan db`",
    "`manage.py dbshell`",
    "`sail mysql`",
    "`docker exec db psql`",
    "`docker compose exec`",
    "`kubectl exec`",
    "`ssh host psql`",
    "`pg_dump`",
    "`mysqldump`",
    "`mongodump`",
  ])
    expect([said, part.includes(said)]).toEqual([said, true]);
  const source = readFileSync(
    join(REPO, "packages", "engine", "src", "hooks", "acting.ts"),
    "utf8",
  );
  const comment = source.slice(0, source.indexOf("export interface ActingTool"));
  expect(comment).toContain("`client` is a database client's row");
});
