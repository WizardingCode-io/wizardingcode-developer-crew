import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { actingAsk, actingDeny, actingIn, actingOf } from "../src/hooks/acting.ts";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import type { HookContext } from "../src/hooks/types.ts";
import { git, hookContext, makeRepo, testEnv } from "./helpers.ts";

const ITEM = "2026-11-27-002";
const REPO = join(import.meta.dir, "..", "..", "..");
const words = (line: string) => line.split(" ").filter(Boolean);
const ASK =
  "Crew: dbt run is a person's decision in this project (policy actingCommands): it can deploy, apply, destroy or publish outside this machine, send requests to a running application, or restore, load or change a database's data, and the guard cannot tell an act from a read for it, nor production from a preview or from this machine's own environment. A yes here is that decision, for the whole line. Where nobody answers, stop, and do not run it in another form.";

test(`${ITEM} AC-8: the tools that restore a database or measure against it act, and their reads pass`, () => {
  const acting: [string, string][] = [
    ["pg_restore -d shop dump.tar", "pg_restore -d"],
    ["pg_restore --dbname=shop dump", "pg_restore --dbname"],
    ["pg_restore --dbname shop dump", "pg_restore --dbname"],
    ["pg_restore -dshop dump", "pg_restore -d"],
    ["pg_restore -C -d postgres db.dump", "pg_restore -d"],
    ["mongorestore", "mongorestore"],
    ["mongorestore --uri mongodb://h dump/", "mongorestore"],
    ["mongorestore --dryRun", "mongorestore"],
    ["myloader -d dir", "myloader"],
    ["pgbackrest --stanza=main restore", "pgbackrest restore"],
    ["pgbackrest expire", "pgbackrest expire"],
    ["pgbackrest stanza-delete", "pgbackrest stanza-delete"],
    ["barman restore pg latest /data", "barman restore"],
    ["barman -c b.conf recover pg latest /data", "barman recover"],
    ["barman delete pg old", "barman delete"],
    ["wal-g backup-fetch /data LATEST", "wal-g backup-fetch"],
    ["wal-g --config w.yaml catchup-fetch x", "wal-g catchup-fetch"],
    ["wal-g binlog-replay", "wal-g binlog-replay"],
    ["wal-g wal-restore a b", "wal-g wal-restore"],
    ["wal-g catchup-receive x", "wal-g catchup-receive"],
    ["wal-g pgbackrest backup-fetch d LATEST", "wal-g pgbackrest backup-fetch"],
    ["wal-g delete retain 5 --confirm", "wal-g delete --confirm"],
    ["xtrabackup --copy-back --target-dir=/b", "xtrabackup --copy-back"],
    ["xtrabackup --move-back", "xtrabackup --move-back"],
    ["litestream restore -o db x", "litestream restore"],
    ["pgbench -i shop", "pgbench"],
    ["pgbench -c 10 -T 60 shop", "pgbench"],
    ["pgbench -S shop", "pgbench"],
    ["sysbench oltp_read_write --threads=4 run", "sysbench run"],
    ["sysbench oltp_insert prepare", "sysbench prepare"],
    ["sysbench x cleanup", "sysbench cleanup"],
    ["pg_repack -t orders shop", "pg_repack"],
    ["pg_repack --dry-run", "pg_repack"],
  ];
  for (const [line, text] of acting) expect([line, actingOf(words(line))]).toEqual([line, text]);
  for (const line of [
    "pg_restore -l dump",
    "pg_restore dump.tar",
    "pg_restore -f out.sql dump",
    "pg_restore -cd shop dump",
    "pg_restore --dbn=shop dump",
    "pg_dump shop",
    "pg_basebackup -D /b",
    "mysqldump shop",
    "mongodump",
    "pgbackrest info",
    "pgbackrest backup",
    "pgbackrest archive-get x y",
    "barman check pg",
    "barman backup pg",
    "barman cron",
    "barman list-backups pg",
    "pgbackrest --stanza main restore",
    "wal-g backup-list",
    "wal-g backup-push /data",
    "wal-g delete retain 5",
    "wal-g wal-fetch a b",
    "wal-g pgbackrest backup-list",
    "xtrabackup --backup",
    "xtrabackup --prepare",
    "litestream databases",
    "litestream replicate",
    "sysbench oltp_read_write help",
    "sysbench --test=oltp run",
    "sysbench",
  ])
    expect([line, actingOf(words(line))]).toEqual([line, null]);
});

test(`${ITEM} AC-9: the pipeline tools' runs act, and their reads pass`, () => {
  const acting: [string, string][] = [
    ["uvx dbt run", "dbt run"],
    ["python -m dbt run", "dbt run"],
    ["dbt run", "dbt run"],
    ["dbt build --select orders", "dbt build"],
    ["dbt seed", "dbt seed"],
    ["dbt snapshot", "dbt snapshot"],
    ["dbt clone", "dbt clone"],
    ["dbt run-operation grant", "dbt run-operation"],
    ["dbt retry", "dbt retry"],
    ["dbt --target prod run", "dbt run"],
    ["dbt --project-dir d --profiles-dir p build", "dbt build"],
    ["sqlmesh plan", "sqlmesh plan"],
    ["sqlmesh plan --explain", "sqlmesh plan"],
    ["sqlmesh run", "sqlmesh run"],
    ["sqlmesh destroy", "sqlmesh destroy"],
    ["sqlmesh invalidate dev", "sqlmesh invalidate"],
    ["sqlmesh janitor", "sqlmesh janitor"],
    ["sqlmesh migrate", "sqlmesh migrate"],
    ["sqlmesh rollback", "sqlmesh rollback"],
    ["sqlmesh state import x", "sqlmesh state import"],
    ["sqlmesh --gateway prod -p . run", "sqlmesh run"],
    ["dlt pipeline orders drop", "dlt pipeline drop"],
    ["dlt pipeline orders sync", "dlt pipeline sync"],
    ["dlt pipeline orders abort-packages", "dlt pipeline abort-packages"],
    ["dlt pipeline orders drop-pending-packages", "dlt pipeline drop-pending-packages"],
    ["dlt pipeline orders load-package", "dlt pipeline load-package"],
    ["dlt pipeline --pipelines-dir d orders drop", "dlt pipeline drop"],
    ["meltano run tap target", "meltano run"],
    ["meltano el a b", "meltano el"],
    ["meltano elt a b", "meltano elt"],
    ["meltano invoke dbt run", "meltano invoke"],
    ["meltano state clear x", "meltano state clear"],
    ["meltano state set x y", "meltano state set"],
    ["meltano --environment prod run a b", "meltano run"],
    ["airflow dags trigger d", "airflow dags trigger"],
    ["airflow dags test d", "airflow dags test"],
    ["airflow dags clear d", "airflow dags clear"],
    ["airflow dags delete d", "airflow dags delete"],
    ["airflow tasks test d t", "airflow tasks test"],
    ["airflow tasks clear d", "airflow tasks clear"],
    ["airflow backfill create x", "airflow backfill create"],
    ["airflow assets materialize x", "airflow assets materialize"],
    ["airflow db migrate", "airflow db migrate"],
    ["airflow db downgrade", "airflow db downgrade"],
    ["airflow db reset", "airflow db reset"],
    ["airflow db clean", "airflow db clean"],
    ["airflow db drop-archived", "airflow db drop-archived"],
    ["airflow db-manager reset x", "airflow db-manager reset"],
    ["airflow db-manager migrate x", "airflow db-manager migrate"],
    ["airflow db-manager downgrade x", "airflow db-manager downgrade"],
    ["dagster asset materialize", "dagster asset materialize"],
    ["dagster asset wipe x", "dagster asset wipe"],
    ["dagster job execute", "dagster job execute"],
    ["dagster job launch", "dagster job launch"],
    ["dagster job backfill", "dagster job backfill"],
    ["dagster run delete x", "dagster run delete"],
    ["dagster run wipe", "dagster run wipe"],
    ["dagster instance migrate", "dagster instance migrate"],
    ["dg launch --assets x", "dg launch"],
    ["prefect deployment run a/b", "prefect deployment run"],
    ["prefect flow-run execute x", "prefect flow-run execute"],
    ["prefect flow-run retry x", "prefect flow-run retry"],
    ["prefect server database reset", "prefect server database reset"],
    ["prefect server database upgrade", "prefect server database upgrade"],
    ["prefect server database downgrade", "prefect server database downgrade"],
    ["prefect --profile p deployment run a/b", "prefect deployment run"],
    ["npx dbt run", "dbt run"],
  ];
  for (const [line, text] of acting) expect([line, actingOf(words(line))]).toEqual([line, text]);
  for (const line of [
    "dbt test",
    "dbt compile",
    "dbt parse",
    "dbt list",
    "dbt debug",
    "dbt deps",
    "dbt docs generate",
    "dbt show --select x",
    "dbt source freshness",
    "sqlmesh audit",
    "sqlmesh diff prod",
    "sqlmesh render x",
    "sqlmesh test",
    "sqlmesh fetchdf x",
    "sqlmesh state export",
    "dlt pipeline orders info",
    "dlt pipeline --list-pipelines",
    "dlt init a b",
    "meltano install",
    "meltano state list",
    "meltano state get x",
    "meltano test",
    "airflow dags list",
    "airflow db check",
    "airflow dags pause d",
    "airflow connections add x",
    "airflow db shell",
    "airflow version",
    "dagster asset list",
    "dagster job list",
    "dagster schedule start x",
    "dg check defs",
    "dg list defs",
    "prefect deployment ls",
    "prefect deploy",
    "prefect flow-run cancel x",
    "prefect server database stamp x",
  ])
    expect([line, actingOf(words(line))]).toEqual([line, null]);
});

test(`${ITEM} AC-10: the migration tools' applying verbs act, and their reads pass`, () => {
  const acting: [string, string][] = [
    ["php artisan migrate", "artisan migrate"],
    ["python manage.py migrate", "manage.py migrate"],
    ["alembic upgrade head", "alembic upgrade"],
    ["alembic downgrade -1", "alembic downgrade"],
    ["alembic stamp head", "alembic stamp"],
    ["alembic upgrade head --sql", "alembic upgrade"],
    ["alembic -c a.ini upgrade head", "alembic upgrade"],
    ["alembic -x tenant=a -n main upgrade head", "alembic upgrade"],
    ["prisma migrate dev", "prisma migrate dev"],
    ["prisma migrate deploy", "prisma migrate deploy"],
    ["prisma migrate reset", "prisma migrate reset"],
    ["prisma migrate resolve --applied x", "prisma migrate resolve"],
    ["prisma db push", "prisma db push"],
    ["prisma db execute --file x.sql", "prisma db execute"],
    ["prisma db seed", "prisma db seed"],
    ["prisma db init", "prisma db init"],
    ["prisma db migrate", "prisma db migrate"],
    ["prisma db update", "prisma db update"],
    ["prisma db sign", "prisma db sign"],
    ["npx prisma migrate deploy", "prisma migrate deploy"],
    ["bunx prisma db push", "prisma db push"],
    ["drizzle-kit migrate", "drizzle-kit migrate"],
    ["drizzle-kit push", "drizzle-kit push"],
    ["npx drizzle-kit push", "drizzle-kit push"],
    ["migrate -path db -database postgres://x up", "migrate up"],
    ["migrate down 1", "migrate down"],
    ["migrate goto 3", "migrate goto"],
    ["migrate drop", "migrate drop"],
    ["migrate force 3", "migrate force"],
    ["atlas migrate apply --url x", "atlas migrate apply"],
    ["atlas migrate apply --dry-run", "atlas migrate apply"],
    ["atlas migrate down", "atlas migrate down"],
    ["atlas migrate set 3", "atlas migrate set"],
    ["atlas schema apply --env local", "atlas schema apply"],
    ["atlas schema clean", "atlas schema clean"],
    ["atlas --env prod migrate apply", "atlas migrate apply"],
    ["sqlx migrate run", "sqlx migrate run"],
    ["sqlx migrate revert", "sqlx migrate revert"],
    ["sqlx database create", "sqlx database create"],
    ["sqlx database drop", "sqlx database drop"],
    ["sqlx --database-url x migrate run", "sqlx migrate run"],
    ["gh-ost --alter=x --execute", "gh-ost --execute"],
    [
      "pt-online-schema-change --alter x D=shop,t=orders --execute",
      "pt-online-schema-change --execute",
    ],
    ["pt-online-schema-change --alter x D=a,t=b --dry-run", "pt-online-schema-change --dry-run"],
    ["pgroll init", "pgroll init"],
    ["pgroll start m.json", "pgroll start"],
    ["pgroll complete", "pgroll complete"],
    ["pgroll rollback", "pgroll rollback"],
    ["pgroll baseline v1 m", "pgroll baseline"],
    ["pgroll --postgres-url x start m.json", "pgroll start"],
  ];
  for (const [line, text] of acting) expect([line, actingOf(words(line))]).toEqual([line, text]);
  for (const line of [
    "alembic check",
    "alembic current",
    "alembic history",
    "alembic revision -m x",
    "prisma migrate status",
    "prisma migrate diff",
    "prisma db pull",
    "prisma generate",
    "prisma validate",
    "drizzle-kit generate",
    "drizzle-kit check",
    "drizzle-kit pull",
    "drizzle-kit studio",
    "migrate version",
    "migrate create -ext sql x",
    "atlas migrate lint",
    "atlas migrate status",
    "atlas migrate diff x",
    "atlas schema inspect",
    "atlas migrate push app",
    "sqlx migrate info",
    "sqlx migrate add x",
    "sqlx prepare",
    "sqlx database reset",
    "sqlx database setup",
    "cargo sqlx migrate run",
    "gh-ost --alter=x",
    "gh-ost --alter=x -execute",
    "alembic ensure_version",
    "prisma deploy",
    "pt-online-schema-change --alter x D=a,t=b",
    "pgroll status",
    "squawk check m.sql",
    "sqlfluff lint x.sql",
    'psql -c "delete from t"',
  ])
    expect([line, actingOf(words(line))]).toEqual([line, null]);
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
const BRANCH = "crew/2026-11-27-002/T-1";
function opened(kind: "mail" | "journey", on: boolean) {
  const { root } = project();
  git(root, "checkout", "-q", "-b", BRANCH);
  const ctx = hookContext(
    { session_id: "s", cwd: root },
    {
      ...testEnv(),
      WIZARDINGCODE_CREW_MAIL_ID: "M-2026-11-27-001-migrate",
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
const CANNOT = "dbt with a verb the guard cannot read";
const NO_RUNNER = "npx with a command the guard cannot read";

test(`${ITEM} AC-11: with a person the hook asks for a data command, and with nobody it denies it`, () => {
  const off = project();
  expect(bash(off.ctx, "dbt run")).toEqual({});
  const on = project();
  turnOn(on.ctx);
  const asked = bash(on.ctx, "dbt run");
  expect(decision(asked)).toBe("ask");
  expect(reason(asked)).toContain(ASK);
  const nobody = bash(on.ctx, "dbt run", "dontAsk");
  expect(decision(nobody)).toBe("deny");
  expect(reason(nobody)).toContain(actingDeny("dbt run", "dontAsk").slice(0, 60));
  const both = bash(on.ctx, "terraform apply && prisma migrate reset");
  expect(decision(both)).toBe("ask");
  expect(reason(both)).toContain(actingAsk("terraform apply and prisma migrate reset"));
});

test(`${ITEM} AC-11: an opened session is denied a data command only where the key is on`, () => {
  const DATA: [string, string][] = [
    ["dbt run", "dbt run"],
    ["npx prisma migrate deploy", "prisma migrate deploy"],
    ["dbt $CMD", CANNOT],
  ];
  for (const kind of ["mail", "journey"] as const) {
    const off = opened(kind, false);
    for (const [line] of DATA)
      expect([kind, line, bash(off, line, "dontAsk")]).toEqual([kind, line, {}]);
    for (const line of ["terraform apply", "dbt run && terraform apply"]) {
      const answer = bash(off, line, "dontAsk");
      expect([kind, line, decision(answer)]).toEqual([kind, line, "deny"]);
      expect([kind, line, reason(answer)?.includes(": terraform apply is denied; ")]).toEqual([
        kind,
        line,
        true,
      ]);
    }
    const on = opened(kind, true);
    for (const [line, text] of DATA) {
      const answer = bash(on, line, "dontAsk");
      expect([kind, line, decision(answer)]).toEqual([kind, line, "deny"]);
      const said = reason(answer) ?? "";
      expect(said).toContain("never merges, pushes to another branch, releases or deploys: ");
      expect([kind, line, said.includes(`: ${text} is denied; `)]).toEqual([kind, line, true]);
    }
  }
});

test(`${ITEM} AC-11: actingIn leaves a data row's text out when told to, and keeps every other`, () => {
  const found = [
    { words: words("dbt run"), viaXargs: false },
    { words: words("npx prisma migrate deploy"), viaXargs: false },
    { words: words("dbt $CMD"), viaXargs: false },
    { words: words("terraform apply"), viaXargs: false },
    { words: ["npx"], viaXargs: true },
  ];
  const all = ["dbt run", "prisma migrate deploy", CANNOT, "terraform apply", NO_RUNNER];
  expect(actingIn(found)).toEqual(all);
  expect(actingIn(found, true)).toEqual(all);
  expect(actingIn(found, false)).toEqual(["terraform apply", NO_RUNNER]);
});

test(`${ITEM} AC-12: the ask names a database's data, and so does rule 2`, () => {
  expect(actingAsk("dbt run")).toBe(ASK);
  const rules = readFileSync(
    join(REPO, "plugins", "core", "skills", "crew", "references", "rules.md"),
    "utf8",
  );
  const rule2 = rules.split("\n").find((l) => l.startsWith("2. ")) ?? "";
  expect(rule2).toContain(
    "a command that deploys, applies, destroys or publishes, sends requests to a running application, or restores, loads or changes a database's data,",
  );
});

test(`${ITEM} AC-13: ADR 0026 ends with this item's amendment`, () => {
  const adr = readFileSync(
    join(REPO, "docs", "adr", "0026-an-acting-command-is-asked-where-a-project-says-so.md"),
    "utf8",
  );
  const heading = "## Amendment of 2026-11-27 (item 2026-11-27-002)";
  expect(adr.match(/^## .*$/gm)).toEqual([
    "## Context",
    "## Decision",
    "## What the rule does not hold",
    "## Consequences",
    "## Amendment of 2026-11-26 (item 2026-11-26-006)",
    heading,
    "## Amendment of 2026-11-27 (item 2026-11-27-003)",
  ]);
  const part = adr.slice(adr.indexOf(heading));
  for (const said of [
    // the 28 rows
    "`pg_restore`",
    "`mongorestore`",
    "`myloader`",
    "`pgbackrest`",
    "`barman`",
    "`wal-g`",
    "`xtrabackup`",
    "`litestream`",
    "`pgbench`",
    "`sysbench`",
    "`dbt`",
    "`sqlmesh`",
    "`dlt`",
    "`meltano`",
    "`airflow`",
    "`dagster`",
    "`dg`",
    "`prefect`",
    "`alembic`",
    "`prisma`",
    "`drizzle-kit`",
    "`migrate`",
    "`atlas`",
    "`sqlx`",
    "`gh-ost`",
    "`pt-online-schema-change`",
    "`pgroll`",
    "`pg_repack`",
    // what acts, one verb or flag a row
    "`--dbname`",
    "`stanza-delete`",
    "`recover`",
    "`pgbackrest backup-fetch`",
    "`--copy-back`",
    "`cleanup`",
    "`run-operation`",
    "`state import`",
    "`abort-packages`",
    "`invoke`",
    "`db-manager reset`",
    "`asset materialize`",
    "`launch`",
    "`server database reset`",
    "`stamp`",
    "`migrate resolve`",
    "`db sign`",
    "`push`",
    "`goto`",
    "`schema clean`",
    "`database drop`",
    "`--execute`",
    "`--dry-run`",
    "`baseline`",
    // the flag-only form and the attached short flag
    "a path of no word",
    "`-dshop`",
    // no target, and the opened session
    "No target is read",
    "`PGDATABASE`",
    "only where the project's policy has `actingCommands` at `ask`",
    "a production migration in an opened session of a project with the key off passes",
    "or restore, load or change a database's data",
    // what a whole row asks on
    "`--help`",
    "`--version`",
    "`-S`",
    "`--explain`",
    "`--sql`",
    "the session's knowledge of the tool",
    // what is not read
    "`psql`",
    "`mysql`",
    "`mongosh`",
    "`redis-cli`",
    "`sqlite3`",
    "`duckdb`",
    "`php artisan migrate`",
    "`python manage.py migrate`",
    "`rails db:migrate`",
    "`python -m`",
    "`uvx`",
    "take a backup",
    "`stanza-upgrade`",
    "`archive-push`",
    "`stanza-create`",
    "`--prepare`",
    "`litestream replicate`",
    "`wal-g wal-fetch`",
    "`pgbackrest archive-get`",
    "`dags pause`",
    "`asset wipe-partitions-status-cache`",
    "`flow-run cancel`",
    "`deployment delete`",
    "`deployment schedule`",
    "Meltano's `test` and `upgrade`",
    "`barman cron`",
    "`switch-wal`",
    "`backup-mark`",
    "`db shell`",
    "`rotate-fernet-key`",
    "`instance reindex`",
    "`dagster-daemon wipe`",
    "`server database stamp`",
    "`ensure_version`",
    "`--store-failures`",
    "`database reset`",
    "`database setup`",
    "`cargo sqlx`",
    "`pg_restore -cd`",
    "`--dbn=shop`",
    "`gh-ost -execute`",
    "`xargs`",
    "`pgbackrest --stanza main restore`",
    "`sysbench --test=oltp run`",
    "noop",
    "Airbyte",
    "Debezium",
    "Kafka Connect",
    "spatie/laravel-backup",
    "`.backup`",
    "the same short name",
    "`docker run`",
    "MCP servers",
  ])
    expect([said, part.includes(said)]).toEqual([said, true]);
});
