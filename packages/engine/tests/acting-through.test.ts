import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { actingAsk, actingDeny, actingOf } from "../src/hooks/acting.ts";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import type { HookContext } from "../src/hooks/types.ts";
import { git, hookContext, makeRepo, testEnv } from "./helpers.ts";

const ITEM = "2026-11-27-003";
const REPO = join(import.meta.dir, "..", "..", "..");
const words = (line: string) => line.split(" ").filter(Boolean);
const acts = (lines: [string, string][]) => {
  for (const [line, text] of lines) expect([line, actingOf(words(line))]).toEqual([line, text]);
};
const passes = (lines: string[]) => {
  for (const line of lines) expect([line, actingOf(words(line))]).toEqual([line, null]);
};

test(`${ITEM} AC-7: Artisan's migrations, seeds and wipe act, through php and Sail too`, () => {
  acts([
    ["artisan migrate", "artisan migrate"],
    ["./artisan migrate:fresh --seed", "artisan migrate:fresh"],
    ["php artisan migrate:refresh", "artisan migrate:refresh"],
    ["php artisan migrate:reset", "artisan migrate:reset"],
    ["php artisan migrate:rollback --step=5", "artisan migrate:rollback"],
    ["php artisan migrate:install", "artisan migrate:install"],
    ["php artisan db:seed --class=UserSeeder", "artisan db:seed"],
    ["php artisan db:wipe", "artisan db:wipe"],
    ["php artisan migrate --pretend", "artisan migrate"],
    ["php artisan --env=testing migrate", "artisan migrate"],
    ["php -d memory_limit=-1 artisan migrate", "artisan migrate"],
    ["php -dmemory_limit=-1 artisan migrate", "artisan migrate"],
    ["php -c /etc/php artisan migrate", "artisan migrate"],
    ["php -n -f artisan migrate", "artisan migrate"],
    ["php /app/artisan migrate", "artisan migrate"],
    ["php8.3 artisan migrate", "artisan migrate"],
    ["php -t public artisan migrate", "artisan migrate"],
    ["sail artisan migrate", "artisan migrate"],
    ["./vendor/bin/sail artisan migrate:fresh", "artisan migrate:fresh"],
    ["sail debug migrate", "artisan migrate"],
    ["sail php artisan migrate", "artisan migrate"],
  ]);
  passes([
    "php artisan migrate:status",
    "php artisan db:show",
    "php artisan db:table users",
    "php artisan db",
    "php artisan db:monitor",
    "php artisan schema:dump --prune",
    "php artisan make:migration x",
    "php artisan help migrate",
    "php artisan tinker",
    "php artisan test",
    "php artisan backup:run",
    "php artisan migr",
    "php artisan --env testing migrate",
    "php -r migrate artisan",
    "php -S localhost:8000 artisan migrate",
    "php -- artisan migrate",
    "php script.php migrate",
    "php",
    "php --rf strlen artisan migrate",
    "php -z x.so artisan migrate",
    "php artisan model:prune",
    "php artisan queue:clear",
    "sail up -d",
    "sail composer install",
    "sail shell",
    "sail tinker",
    "sail exec app php artisan migrate",
    "sail mysql",
    "sail constructor migrate",
    "herd php artisan migrate",
    "composer exec artisan migrate",
    "docker compose exec app php artisan migrate",
  ]);
  // every option with which php is given no script the guard reads
  for (const option of "-r --run -B --process-begin -R --process-code -F --process-file -E --process-end -S --server -a --interactive --rf --rfunction --rc --rclass --re --rextension --rz --rzendextension --ri --rextinfo --".split(
    " ",
  ))
    expect([option, actingOf(["php", option, "artisan", "migrate"])]).toEqual([option, null]);
});

test(`${ITEM} AC-8: Django's commands that change a database act, through python too`, () => {
  acts([
    ["python manage.py migrate", "manage.py migrate"],
    ["manage.py migrate", "manage.py migrate"],
    ["django migrate", "django migrate"],
    ["./manage.py flush --no-input", "manage.py flush"],
    ["python3 manage.py loaddata users.json", "manage.py loaddata"],
    ["python3.13 manage.py createcachetable", "manage.py createcachetable"],
    ["python manage.py createsuperuser", "manage.py createsuperuser"],
    ["python manage.py changepassword ana", "manage.py changepassword"],
    ["python manage.py clearsessions", "manage.py clearsessions"],
    ["python manage.py remove_stale_contenttypes", "manage.py remove_stale_contenttypes"],
    ["python manage.py migrate --plan", "manage.py migrate"],
    ["python manage.py migrate shop zero", "manage.py migrate"],
    ["django-admin migrate --settings=shop.settings", "django-admin migrate"],
    ["python -m django migrate", "django migrate"],
    ["py -m django flush", "django flush"],
    ["python -W ignore manage.py migrate", "manage.py migrate"],
    ["python -X dev -B manage.py migrate", "manage.py migrate"],
    ["python --check-hash-based-pycs never manage.py migrate", "manage.py migrate"],
    ["python src/manage.py migrate", "manage.py migrate"],
    ["python -Im django migrate", "django migrate"],
  ]);
  passes([
    "python manage.py showmigrations",
    "python manage.py sqlmigrate shop 0001",
    "python manage.py makemigrations --check",
    "python manage.py squashmigrations shop 0004",
    "python manage.py sqlflush",
    "python manage.py dumpdata -o data.json",
    "python manage.py inspectdb",
    "python manage.py check --deploy",
    "python manage.py test",
    "python manage.py testserver fixture.json",
    "python manage.py dbshell",
    "python manage.py shell",
    "python manage.py runserver",
    "django-admin --settings x migrate",
    "python -c migrate manage.py",
    "python -c manage.py migrate",
    "python - manage.py migrate",
    "python script.py migrate",
    "python",
    "pypy manage.py migrate",
    "pymanager manage.py migrate",
    "python -BW ignore manage.py migrate",
    "py exec manage.py migrate",
  ]);
});

test(`${ITEM} AC-9: a command is read through an interpreter's module and through a runner, against every row`, () => {
  acts([
    ["python -m alembic upgrade head", "alembic upgrade"],
    ["python3 -malembic downgrade -1", "alembic downgrade"],
    ["python -m airflow db migrate", "airflow db migrate"],
    ["python -m prefect deployment run a/b", "prefect deployment run"],
    ["python -m dbt run", "dbt run"],
    ["python -m twine upload dist/x.whl", "twine upload"],
    ["python sqlmap.py -u http://x", "sqlmap.py"],
    ["uvx dbt run", "dbt run"],
    ["uvx schemathesis run http://x", "schemathesis run"],
    ["uv run npx prisma migrate deploy", "prisma migrate deploy"],
    ["pdm run migrate up", "migrate up"],
    ["uv run alembic upgrade head", "alembic upgrade"],
    ["uv run --with psycopg -- alembic upgrade head", "alembic upgrade"],
    ["uv run -p 3.13 --env-file .env dbt run", "dbt run"],
    ["uv run --with=psycopg alembic stamp head", "alembic stamp"],
    ["uv --directory api run alembic upgrade head", "alembic upgrade"],
    ["uv run python manage.py migrate", "manage.py migrate"],
    ["uv run manage.py migrate", "manage.py migrate"],
    ["uv run python -m alembic upgrade head", "alembic upgrade"],
    ["uv run -m alembic upgrade head", "alembic upgrade"],
    ["uv run --module django migrate", "django migrate"],
    ["uv tool run alembic@1.20 upgrade head", "alembic upgrade"],
    ["uvx --from dbt-core dbt seed", "dbt seed"],
    ["uvx alembic@1.20.1 upgrade head", "alembic upgrade"],
    ["uvx twine upload dist/x.whl", "twine upload"],
    ["poetry run alembic upgrade head", "alembic upgrade"],
    ["poetry -C api run python manage.py migrate", "manage.py migrate"],
    ["poetry run .venv/bin/dbt build", "dbt build"],
    ["pipenv run python manage.py flush", "manage.py flush"],
    ["pipenv --python 3.13 run alembic upgrade head", "alembic upgrade"],
    ["pdm run alembic upgrade head", "alembic upgrade"],
    ["pdm run -p api --venv test dbt run", "dbt run"],
    ["hatch run alembic upgrade head", "alembic upgrade"],
    ["hatch run test:alembic upgrade head", "alembic upgrade"],
    ["hatch -e test run alembic upgrade head", "alembic upgrade"],
    ["hatch run +py=3.13 -version=1 test:dbt run", "dbt run"],
    ["pipx run --spec dbt-core dbt run", "dbt run"],
    ["pipx run --python 3.13 alembic upgrade head", "alembic upgrade"],
    ["poetry run uv run python -m alembic upgrade head", "alembic upgrade"],
    ["uv publish", "uv publish"],
    ["poetry publish", "poetry publish"],
    // four programs gone through are read, a fifth is not
    ["poetry run uv run sail php artisan migrate", "artisan migrate"],
    [
      "poetry run pipenv run uv run sail php artisan migrate",
      "poetry with a command the guard cannot read",
    ],
  ]);
  passes([
    "uv run pytest",
    "uv run alembic current",
    "uv run alembic",
    "uv run",
    "uv sync",
    "uv tool install alembic",
    "uv run $TOOL upgrade head",
    "uv run --script migrate.py",
    "uvx ruff check",
    "poetry run pytest",
    "poetry install",
    "pipenv install",
    "pdm run migrate",
    "hatch env run -e test alembic upgrade head",
    "pipx exec env alembic upgrade head",
    "python -m dbt.cli.main run",
    "python -m meltano.cli run",
    "python -m myalembic upgrade head",
    "python -m pytest",
    "npx uv run alembic upgrade head",
  ]);
  expect(actingOf(["uv", "run"], true)).toBe("uv run with a command the guard cannot read");
  expect(actingOf(["php", "-l"], true)).toBeNull();
  expect(actingOf(["python"], true)).toBeNull();
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
const BRANCH = "crew/2026-11-27-003/T-1";
function opened(kind: "mail" | "journey", on: boolean) {
  const { root } = project();
  git(root, "checkout", "-q", "-b", BRANCH);
  const ctx = hookContext(
    { session_id: "s", cwd: root },
    {
      ...testEnv(),
      WIZARDINGCODE_CREW_MAIL_ID: "M-2026-11-27-002-migrate",
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
const FIVE = "poetry run pipenv run uv run sail php artisan migrate";
const THROUGH: [string, string][] = [
  ["php artisan migrate", "artisan migrate"],
  ["uv run alembic upgrade head", "alembic upgrade"],
];

test(`${ITEM} AC-10: with a person the hook asks for a command read through, and with nobody it denies it`, () => {
  for (const [line, text] of THROUGH) {
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
});

test(`${ITEM} AC-10: an opened session is denied a data command read through only where the key is on, and another row whatever the key`, () => {
  const DATA: [string, string][] = [
    ["php artisan migrate", "artisan migrate"],
    ["poetry run python manage.py migrate", "manage.py migrate"],
  ];
  const denied = (ctx: HookContext, kind: string, line: string, text: string) => {
    const answer = bash(ctx, line, "dontAsk");
    expect([kind, line, decision(answer)]).toEqual([kind, line, "deny"]);
    expect([kind, line, (reason(answer) ?? "").includes(`: ${text} is denied; `)]).toEqual([
      kind,
      line,
      true,
    ]);
  };
  for (const kind of ["mail", "journey"] as const) {
    const off = opened(kind, false);
    for (const [line] of DATA)
      expect([kind, line, bash(off, line, "dontAsk")]).toEqual([kind, line, {}]);
    denied(off, kind, "uvx twine upload dist/x.whl", "twine upload");
    // a text of no row is denied whatever the key
    denied(off, kind, FIVE, "poetry with a command the guard cannot read");
    denied(off, kind, "echo x | xargs uv run", "uv run with a command the guard cannot read");
    const on = opened(kind, true);
    for (const [line, text] of DATA) denied(on, kind, line, text);
    denied(on, kind, "uvx twine upload dist/x.whl", "twine upload");
  }
});

const UV_VALUED =
  "--allow-insecure-host, --trusted-host, --cache-dir, --color, --config-file, --config-setting, --config-settings, -C, --config-settings-package, --default-index, --directory, --env-file, --exclude-newer, --exclude-newer-package, --extra, --extra-index-url, --find-links, -f, --fork-strategy, --group, --index, --index-strategy, --index-url, -i, --keyring-provider, --link-mode, --no-binary-package, --no-build-isolation-package, --no-build-package, --no-editable-package, --no-extra, --no-group, --no-sources-package, --only-group, --package, --prerelease, --prerelease-package, --project, --python, -p, --python-platform, --refresh-package, --reinstall-package, --resolution, --upgrade-group, --upgrade-package, -P, --with, -w, --with-editable, --with-requirements, --build-constraints, --build-constraint, -b, --constraints, --constraint, -c, --from, --overrides, --override, --torch-backend";

test(`${ITEM} AC-9: every valued option of uv the design lists is passed over with its next word`, () => {
  for (const option of UV_VALUED.split(", ")) {
    expect([option, actingOf(["uv", "run", option, "x", "alembic", "upgrade", "head"])]).toEqual([
      option,
      "alembic upgrade",
    ]);
    expect([option, actingOf(["uvx", option, "x", "alembic", "upgrade", "head"])]).toEqual([
      option,
      "alembic upgrade",
    ]);
  }
});

test(`${ITEM} AC-11: ADR 0026 ends with this item's amendment, and the reader's comment says what it goes through`, () => {
  const adr = readFileSync(
    join(REPO, "docs", "adr", "0026-an-acting-command-is-asked-where-a-project-says-so.md"),
    "utf8",
  );
  const heading = "## Amendment of 2026-11-27 (item 2026-11-27-003)";
  expect(adr.match(/^## .*$/gm)?.at(-1)).toBe(heading);
  const part = adr.slice(adr.indexOf(heading));
  for (const said of [
    // the two rows and what acts in each
    "`artisan`",
    "`migrate:fresh`",
    "`migrate:refresh`",
    "`migrate:reset`",
    "`migrate:rollback`",
    "`migrate:install`",
    "`db:seed`",
    "`db:wipe`",
    "`manage.py`",
    "`django-admin`",
    "`django`",
    "`flush`",
    "`loaddata`",
    "`createcachetable`",
    "`createsuperuser`",
    "`changepassword`",
    "`clearsessions`",
    "`remove_stale_contenttypes`",
    // the programs a command is read through, and what is left of each
    "`php<n>.<m>`",
    "`--docroot`",
    "`--rextinfo`",
    "`python<n>.<m>`",
    "`py`",
    "`-malembic`",
    "`--check-hash-based-pycs`",
    "`sail debug <words>`",
    "`uv tool run`",
    "`uvx`",
    "`--module`",
    "`poetry`",
    "`pipenv`",
    "`pdm`",
    "`pipx`",
    "`hatch`",
    "`test:alembic`",
    "`alembic@1.20`",
    "four programs",
    "`<first program> with a command the guard cannot read`",
    "once and last",
    "`uv run npx prisma migrate deploy`",
    // a row that is not a data row, and a text of no row, in an opened session
    "`uvx twine upload`",
    "`python sqlmap.py`",
    "whatever the key",
    "a text of no row",
    // a rehearsal flag
    "`--pretend`",
    "`--plan`",
    // the session's knowledge
    "the session's knowledge",
    "`php8.3`",
    "`python3.13`",
    "`-dmemory_limit=-1`",
    // the limits that no longer hold
    "`python -m twine`, `uvx` and `pipx run`",
    "a runner inside a runner",
    "`python sqlmap.py`, `uvx` and `pipx run`",
    "`php artisan migrate`, `python manage.py migrate`, `python -m` and `uvx`",
    // what passes
    "`migrate:status`",
    "`schema:dump`",
    "`db:monitor`",
    "`artisan db`",
    "`manage.py dbshell`",
    "`php -r`",
    "`python -c`",
    "`model:prune`",
    "`queue:work`",
    "`schedule:run`",
    "`sail exec <service> php artisan migrate`",
    "`sail mysql`",
    "`artisan migr`",
    "`artisan --env testing migrate`",
    "`django-admin --settings x migrate`",
    "`python -m dbt.cli.main run`",
    "`python -m meltano.cli run`",
    "`python -m myalembic`",
    "`python migrate_all.py`",
    "`py exec`",
    "`pypy`",
    "`pymanager`",
    "`xargs php -l`",
    "`pdm run <script>`",
    "`hatch env run`",
    "`pipx exec`",
    "`uv run --script file`",
    "`-z`",
    "`python -BW ignore manage.py migrate`",
    "`uv run $TOOL upgrade head`",
    "`npx uv run alembic upgrade head`",
    "`docker compose exec app php artisan migrate`",
    "`herd php artisan migrate`",
    "`composer exec`",
    "`make migrate`",
    "`npm run migrate`",
    "`bin/console`",
    "`rake`",
    "Knex",
    "Phinx",
    "`psql`",
    // uv's valued options, in full
    ...UV_VALUED.split(", ").map((option) => `\`${option}\``),
  ])
    expect([said, part.includes(said)]).toEqual([said, true]);
  const source = readFileSync(
    join(REPO, "packages", "engine", "src", "hooks", "acting.ts"),
    "utf8",
  );
  expect(source).toContain("read through an interpreter or a runner, four at most");
});
