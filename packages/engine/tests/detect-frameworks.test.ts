import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  FRAMEWORKS,
  frameworksLine,
  frameworksOf,
  MANIFEST_LINE_MAX,
  MANIFEST_MAX_BYTES,
  NOT_IN_A_MANIFEST,
} from "../src/detect/frameworks.ts";
import { detectProfile } from "../src/detect/index.ts";
import { ensureProfile, loadProfile, refreshProfile, saveProfile } from "../src/profile.ts";
import { pluginRoot } from "../src/runtimes.ts";
import { declarationSections, readTeamDeclaration } from "../src/team-sources.ts";
import { cliIo, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

const ITEM = "2026-11-21-003";
const IDS = FRAMEWORKS.map((f) => f.id);

/** A folder holding the files given. */
function folder(files: Record<string, string>): string {
  const dir = tempDir("crew-fw-");
  for (const [rel, text] of Object.entries(files)) write(dir, rel, text);
  return dir;
}

/** `frameworksOf`, with the standing claim checked at every call: the answer is ids of the table, each once. */
function found(dir: string, stack: string): string[] {
  const answer = frameworksOf(dir, stack);
  for (const id of answer) expect(IDS, `${id} is no id of FRAMEWORKS`).toContain(id);
  expect(new Set(answer).size).toBe(answer.length);
  return answer;
}

const composer = (require: unknown, dev: unknown = {}) =>
  folder({ "composer.json": JSON.stringify({ require, "require-dev": dev }) });
const npm = (fields: Record<string, unknown>) => folder({ "package.json": JSON.stringify(fields) });
const requirements = (text: string, name = "requirements.txt") => folder({ [name]: text });
const pyproject = (text: string) => folder({ "pyproject.toml": text });
const gomod = (text: string) =>
  folder({ "go.mod": `module example.com/app\n\ngo 1.22\n\n${text}` });
const cargo = (text: string) =>
  folder({ "Cargo.toml": `[package]\nname = "app"\nversion = "0.1.0"\n\n${text}` });

test(`${ITEM} AC-11: the table holds the twenty-four frameworks a manifest can show, and with the three it cannot they are the backend declaration's twenty-six entries`, () => {
  expect(FRAMEWORKS.map((f) => [f.id, f.name, f.stack, [...f.identifiers]])).toEqual([
    ["laravel", "Laravel", "php", ["laravel/framework"]],
    ["symfony", "Symfony", "php", ["symfony/framework-bundle"]],
    [
      "api-platform",
      "API Platform",
      "php",
      ["api-platform/symfony", "api-platform/laravel", "api-platform/api-pack"],
    ],
    ["cakephp", "CakePHP", "php", ["cakephp/cakephp"]],
    ["codeigniter", "CodeIgniter", "php", ["codeigniter4/framework"]],
    ["yii", "Yii", "php", ["yiisoft/yii2", "yiisoft/yii-runner-http", "yiisoft/yii-http"]],
    ["slim", "Slim", "php", ["slim/slim"]],
    ["nestjs", "NestJS", "node", ["@nestjs/core"]],
    ["express", "Express", "node", ["express"]],
    ["fastify", "Fastify", "node", ["fastify"]],
    ["hono", "Hono", "node", ["hono"]],
    ["fastapi", "FastAPI", "python", ["fastapi"]],
    ["django", "Django", "python", ["django"]],
    ["django-rest-framework", "Django REST Framework", "python", ["djangorestframework"]],
    ["flask", "Flask", "python", ["flask"]],
    ["litestar", "Litestar", "python", ["litestar"]],
    ["gin", "Gin", "go", ["github.com/gin-gonic/gin"]],
    ["echo", "Echo", "go", ["github.com/labstack/echo"]],
    ["fiber", "Fiber", "go", ["github.com/gofiber/fiber"]],
    ["chi", "Chi", "go", ["github.com/go-chi/chi"]],
    ["axum", "Axum", "rust", ["axum"]],
    ["actix-web", "Actix Web", "rust", ["actix-web"]],
    ["rocket", "Rocket", "rust", ["rocket"]],
    ["tokio", "Tokio", "rust", ["tokio"]],
  ]);
  expect(NOT_IN_A_MANIFEST.map((n) => n.name)).toEqual([
    "WordPress",
    "PHP with no framework",
    "the standard library's net/http",
  ]);
  for (const outside of NOT_IN_A_MANIFEST) expect(outside.reason.length).toBeGreaterThan(20);
  // The declaration's own table, cut as the criterion says: a cell at "; ", a name before " (".
  const read = readTeamDeclaration(pluginRoot(), "backend");
  if ("refused" in read) throw new Error(read.refused);
  const table = declarationSections(read.text).find((s) => s.heading === "## 4. Frameworks")
    ?.tables[0];
  const STACK: Record<string, string> = {
    PHP: "php",
    "Node / TypeScript": "node",
    Python: "python",
    Go: "go",
    Rust: "rust",
  };
  const entries = (table?.rows ?? []).flatMap(([stack, cell]) =>
    (cell ?? "")
      .split("; ")
      .map((entry) => ({ stack: STACK[stack ?? ""] ?? "", name: entry.split(" (")[0] ?? "" })),
  );
  expect(entries).toHaveLength(26);
  expect(entries.every((e) => e.stack !== "")).toBe(true);
  const holds = (entry: string, name: string) =>
    new RegExp(`(?:^|[^A-Za-z])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[^A-Za-z])`).test(
      entry,
    );
  for (const framework of FRAMEWORKS)
    expect(
      entries.filter((e) => e.stack === framework.stack && holds(e.name, framework.name)).length,
      framework.name,
    ).toBeGreaterThan(0);
  const outside = NOT_IN_A_MANIFEST.map((n) => n.name);
  for (const entry of entries) {
    const named = FRAMEWORKS.filter((f) => f.stack === entry.stack && holds(entry.name, f.name));
    expect(named.length > 0 || outside.includes(entry.name), entry.name).toBe(true);
    if (outside.includes(entry.name)) expect(named, entry.name).toEqual([]);
  }
  const django = entries.find((e) => e.name === "Django, with Django REST Framework");
  expect(FRAMEWORKS.filter((f) => holds(django?.name ?? "", f.name)).map((f) => f.id)).toEqual([
    "django",
    "django-rest-framework",
  ]);
  expect(entries.filter((e) => outside.includes(e.name))).toHaveLength(3);
});

test(`${ITEM} AC-12: composer.json shows a PHP framework by each identifier under require and require-dev, and by nothing that only resembles one`, () => {
  for (const framework of FRAMEWORKS.filter((f) => f.stack === "php"))
    for (const identifier of framework.identifiers) {
      expect({
        identifier,
        in: found(composer({ php: "^8.3", [identifier]: "*" }), "php"),
      }).toEqual({
        identifier,
        in: [framework.id],
      });
      expect({ identifier, in: found(composer({}, { [identifier]: "*" }), "php") }).toEqual({
        identifier,
        in: [framework.id],
      });
    }
  // Several at once, in the table's order whatever the manifest's.
  expect(
    found(
      composer(
        { "slim/slim": "^4", "api-platform/laravel": "*", "laravel/framework": "^13" },
        { "yiisoft/yii2": "~2.0", "api-platform/symfony": "*" },
      ),
      "php",
    ),
  ).toEqual(["laravel", "api-platform", "yii", "slim"]);
  for (const near of [
    "symfony/console",
    "yiisoft/yii2-debug",
    "laravel/framework-extra",
    "Laravel/Framework",
    "laravel/framework ",
    "xlaravel/framework",
    "cakephp/migrations",
    "api-platform/core",
  ])
    expect({ near, in: found(composer({ [near]: "*" }), "php") }).toEqual({ near, in: [] });
  expect(found(composer(["laravel/framework"]), "php")).toEqual([]);
  expect(found(composer("laravel/framework"), "php")).toEqual([]);
  expect(found(composer(null, null), "php")).toEqual([]);
  expect(
    found(folder({ "composer.json": '{"require": {"laravel/framework": "*"}' }), "php"),
  ).toEqual([]);
  expect(found(folder({ "composer.json": '["laravel/framework"]' }), "php")).toEqual([]);
  expect(found(folder({ "composer.json": "null" }), "php")).toEqual([]);
  expect(found(folder({}), "php")).toEqual([]);
  // The name under another field, or as a value, shows nothing.
  expect(
    found(
      folder({
        "composer.json": JSON.stringify({
          name: "laravel/framework",
          suggest: { "laravel/framework": "x" },
          replace: { "symfony/framework-bundle": "*" },
          require: { php: "laravel/framework" },
        }),
      }),
      "php",
    ),
  ).toEqual([]);
  // Another stack's reader does not read this file.
  expect(found(composer({ "laravel/framework": "*" }), "node")).toEqual([]);
  expect(found(composer({ "laravel/framework": "*" }), "other")).toEqual([]);
});

test(`${ITEM} AC-13: package.json shows a Node framework under dependencies and devDependencies, and by nothing that only resembles one`, () => {
  for (const [name, id] of [
    ["@nestjs/core", "nestjs"],
    ["express", "express"],
    ["fastify", "fastify"],
    ["hono", "hono"],
  ]) {
    expect(found(npm({ dependencies: { [name ?? ""]: "^1" } }), "node")).toEqual([id ?? ""]);
    expect(found(npm({ devDependencies: { [name ?? ""]: "^1" } }), "node")).toEqual([id ?? ""]);
  }
  expect(
    found(
      npm({
        dependencies: { express: "^5", "@nestjs/platform-express": "^12", "@nestjs/core": "^12" },
        devDependencies: { hono: "^4" },
      }),
      "node",
    ),
  ).toEqual(["nestjs", "express", "hono"]);
  for (const near of [
    "express-session",
    "@nestjs/common",
    "@types/express",
    "Express",
    "fastify-plugin",
    "@fastify/cors",
    "@hono/node-server",
    "nestjs",
  ])
    expect({ near, in: found(npm({ dependencies: { [near]: "*" } }), "node") }).toEqual({
      near,
      in: [],
    });
  expect(
    found(
      npm({
        name: "express",
        peerDependencies: { express: "*" },
        optionalDependencies: { fastify: "*" },
        scripts: { hono: "hono" },
        dependencies: ["express"],
        devDependencies: "fastify",
      }),
      "node",
    ),
  ).toEqual([]);
  expect(found(folder({ "package.json": '{"dependencies": {"express": "*"}' }), "node")).toEqual(
    [],
  );
  expect(found(npm({ dependencies: { express: "*" } }), "php")).toEqual([]);
});

test(`${ITEM} AC-14: a requirements file and pyproject.toml show a Python framework by its normalised name, and by nothing that only resembles one`, () => {
  const lines: [string, string][] = [
    ["Django==5.0", "django"],
    ["fastapi[standard]>=0.115", "fastapi"],
    ['flask ; python_version > "3.9"', "flask"],
    ["LITESTAR", "litestar"],
    ["djangorestframework~=3.15", "django-rest-framework"],
    ["Flask  # the web layer", "flask"],
    ["  django", "django"],
    ["litestar[standard,pydantic]", "litestar"],
    ["flask<4,>=3", "flask"],
    ["Django_REST_Framework.x", "django"],
  ];
  for (const [line, id] of lines) {
    // A name normalised to another distribution's is that other distribution, and no framework.
    const expected = line === "Django_REST_Framework.x" ? [] : [id];
    expect({ line, in: found(requirements(`${line}\n`), "python") }).toEqual({
      line,
      in: expected,
    });
  }
  // Normalisation: case, and each run of ".", "-" and "_" as one "-".
  expect(found(requirements("FastAPI\nDJANGO\n"), "python")).toEqual(["fastapi", "django"]);
  expect(
    found(requirements("requests\nFlask\r\ndjango\n", "requirements-dev.txt"), "python"),
  ).toEqual(["django", "flask"]);
  // Both files of a folder are read, and a name in each is found once.
  expect(
    found(
      folder({
        "requirements.txt": "fastapi\nflask\n",
        "requirements-test.txt": "flask\nlitestar\n",
      }),
      "python",
    ),
  ).toEqual(["fastapi", "flask", "litestar"]);
  for (const line of [
    "-r flask.txt",
    "-e flask",
    "--index-url https://example.test/flask",
    "# flask",
    "git+https://example.test/pallets/flask.git#egg=flask",
    "https://example.test/django-5.0.tar.gz",
    "django-environ",
    "flask_sqlalchemy",
    "flask-login==0.6",
    "fastapi-users[sqlalchemy]",
    "litestar.plugins",
    "flask+local",
    "django:8000",
    "flask/requirements.txt",
    "flask(3.0)",
    "",
  ])
    expect({ line, in: found(requirements(`${line}\n`), "python") }).toEqual({ line, in: [] });
  for (const name of [
    "requirements_dev.txt",
    "requirements-Dev.txt",
    "requirements/base.txt",
    "dev-requirements.txt",
    "requirements-.txt",
    "requirements.txt.bak",
  ])
    expect({ name, in: found(folder({ [name]: "flask\n" }), "python") }).toEqual({ name, in: [] });
  // The first sixteen `requirements-<word>.txt` in name order, and no more.
  const many: Record<string, string> = {};
  for (let i = 1; i <= 17; i++)
    many[`requirements-${String(i).padStart(2, "0")}.txt`] = "requests\n";
  expect(found(folder({ ...many, "requirements-16.txt": "flask\n" }), "python")).toEqual(["flask"]);
  expect(found(folder({ ...many, "requirements-17.txt": "flask\n" }), "python")).toEqual([]);
  expect(
    found(
      folder({ ...many, "requirements-17.txt": "flask\n", "requirements.txt": "django\n" }),
      "python",
    ),
  ).toEqual(["django"]);
  // pyproject.toml: the [project] dependencies array, on one line and over several.
  expect(
    found(
      pyproject('[project]\nname = "app"\ndependencies = ["Django>=5", "fastapi[standard]"]\n'),
      "python",
    ),
  ).toEqual(["fastapi", "django"]);
  expect(
    found(
      pyproject(
        '[project]\nname = "app"\ndependencies = [\n  "requests",\n  # a comment\n  \'Flask>=3\',  # web\n  "litestar[standard] ; python_version > \\"3.9\\"",\n]\nreadme = "flask"\n',
      ),
      "python",
    ),
  ).toEqual(["flask", "litestar"]);
  expect(found(pyproject("[project]\ndependencies=['django']\n"), "python")).toEqual(["django"]);
  // Poetry's table: its keys.
  expect(
    found(
      pyproject(
        '[tool.poetry.dependencies]\npython = "^3.12"\nDjango = "^5"\ndjangorestframework = { version = "^3.15" }\n"flask" = "*"\n\n[tool.poetry.group.dev.dependencies]\nlitestar = "*"\n',
      ),
      "python",
    ),
  ).toEqual(["django", "django-rest-framework", "flask"]);
  for (const text of [
    '[project]\nname = "flask"\ndescription = "django"\nkeywords = ["fastapi"]\n',
    '[project.optional-dependencies]\nweb = ["flask"]\n',
    '[project.optional-dependencies]\ndependencies = ["flask"]\n',
    '[tool.other]\ndependencies = ["flask"]\n',
    '[dependency-groups]\ndev = ["flask"]\n',
    '[build-system]\nrequires = ["flask"]\n',
    'dependencies = ["flask"]\n',
    '[project]\ndependencies = [\n  "requests",\n]\nkeywords = [\n  "flask",\n]\n',
    '[tool.poetry.dev-dependencies]\nflask = "*"\n',
    '[project]\n# dependencies = ["flask"]\n',
    '[project]\ndependencies = [\n  "requests",\n  # "flask",\n  "httpx",  # "django"\n]\n',
    '[project]\ndependencies = ["requests"] # "flask"\n',
  ])
    expect({ text, in: found(pyproject(text), "python") }).toEqual({ text, in: [] });
  // Both kinds of file in one folder.
  expect(
    found(
      folder({
        "requirements.txt": "flask\n",
        "pyproject.toml": '[project]\ndependencies = ["django"]\n',
      }),
      "python",
    ),
  ).toEqual(["django", "flask"]);
});

test(`${ITEM} AC-15: go.mod shows a Go framework by its module path at any major version on a direct require line, and by nothing else`, () => {
  const direct: [string, string][] = [
    ["require github.com/gin-gonic/gin v1.12.0", "gin"],
    ["require (\n\tgithub.com/labstack/echo/v4 v4.16.6\n)", "echo"],
    ["require (\n\tgithub.com/labstack/echo/v5 v5.4.7\n)", "echo"],
    ["require github.com/labstack/echo v3.3.10+incompatible", "echo"],
    ["require (\n\tgithub.com/gofiber/fiber/v3 v3.7.0\n)", "fiber"],
    ["require (\n\tgithub.com/gofiber/fiber/v2 v2.52.16 // the web layer\n)", "fiber"],
    ["require (\n  github.com/go-chi/chi/v5 v5.2.0\n)", "chi"],
    ["require (\n\tgithub.com/go-chi/chi/v12 v12.0.0\n)", "chi"],
    ["require\tgithub.com/gin-gonic/gin\tv1.12.0", "gin"],
  ];
  for (const [text, id] of direct)
    expect({ text, in: found(gomod(`${text}\n`), "go") }).toEqual({ text, in: [id] });
  expect(
    found(
      gomod(
        "require (\n\tgithub.com/go-chi/chi/v5 v5.2.0\n\tgithub.com/gin-gonic/gin v1.12.0\n)\n\nrequire (\n\tgithub.com/labstack/echo/v4 v4.16.6 // indirect\n\tgithub.com/gofiber/fiber/v2 v2.52.16\n)\n",
      ),
      "go",
    ),
  ).toEqual(["gin", "fiber", "chi"]);
  for (const text of [
    "require github.com/gin-gonic/gin v1.12.0 // indirect",
    "require (\n\tgithub.com/gin-gonic/gin v1.12.0 // indirect\n)",
    "require (\n\tgithub.com/gin-gonic/gin-extra v1.0.0\n)",
    "require (\n\tgithub.com/gin-gonic/gin/render v1.0.0\n)",
    "require (\n\tgithub.com/go-chi/chi/vnext v1.0.0\n)",
    "require (\n\tgithub.com/go-chi/chi/v5/middleware v5.0.0\n)",
    "require (\n\tgithub.com/go-chi/chi/v v1.0.0\n)",
    "require (\n\texample.com/github.com/gin-gonic/gin v1.0.0\n)",
    "require (\n\tgithub.com/Gin-Gonic/gin v1.0.0\n)",
    "replace github.com/gin-gonic/gin => ../gin",
    "replace (\n\tgithub.com/gin-gonic/gin => ../gin\n)",
    "exclude github.com/gin-gonic/gin v1.0.0",
    "exclude (\n\tgithub.com/gin-gonic/gin v1.0.0\n)",
    "retract (\n\tgithub.com/gin-gonic/gin v1.0.0\n)",
    "// require github.com/gin-gonic/gin v1.12.0",
    "github.com/gin-gonic/gin v1.12.0",
    "tool github.com/gin-gonic/gin",
    "requires github.com/gin-gonic/gin v1.12.0",
    "requiregithub.com/gin-gonic/gin v1.12.0",
    "require_once github.com/gin-gonic/gin v1.12.0",
  ])
    expect({ text, in: found(gomod(`${text}\n`), "go") }).toEqual({ text, in: [] });
  // The framework's own repository: its module line is no dependency.
  expect(found(folder({ "go.mod": "module github.com/gin-gonic/gin\n\ngo 1.22\n" }), "go")).toEqual(
    [],
  );
  // A block closed and another directive opened: a line after the block is not a require.
  expect(
    found(
      gomod(
        "require (\n\tgolang.org/x/net v0.1.0\n)\n\nreplace (\n\tgithub.com/gin-gonic/gin v1.0.0 => ../gin\n)\n",
      ),
      "go",
    ),
  ).toEqual([]);
});

test(`${ITEM} AC-16: Cargo.toml shows a Rust crate declared under [dependencies] or [workspace.dependencies] in any of its forms, and by nothing else`, () => {
  const declared: [string, string][] = [
    ['[dependencies]\naxum = "0.8"\n', "axum"],
    ['[dependencies]\ntokio = { version = "1", features = ["full"] }\n', "tokio"],
    ["[dependencies]\nactix-web.workspace = true\n", "actix-web"],
    ['[dependencies.rocket]\nversion = "0.5"\n', "rocket"],
    ['[workspace.dependencies]\naxum = "0.8"\n', "axum"],
    ['[workspace.dependencies.tokio]\nversion = "1"\n', "tokio"],
    ['[ dependencies ]\n  axum="0.8"\n', "axum"],
    ['[dependencies]\n"rocket" = "0.5"\n', "rocket"],
    ['[dependencies] # the crates\nrocket = { git = "https://example.test/rocket" }\n', "rocket"],
  ];
  for (const [text, id] of declared)
    expect({ text, in: found(cargo(text), "rust") }).toEqual({ text, in: [id] });
  expect(
    found(
      cargo(
        '[dependencies]\ntower = "0.5"\ntokio = { version = "1" }\naxum = "0.8"\n\n[dev-dependencies]\nrocket = "0.5"\n',
      ),
      "rust",
    ),
  ).toEqual(["axum", "tokio"]);
  for (const text of [
    '[dev-dependencies]\naxum = "0.8"\n',
    '[build-dependencies]\naxum = "0.8"\n',
    "[target.'cfg(unix)'.dependencies]\naxum = \"0.8\"\n",
    '[dependencies]\ntokio-util = "0.7"\naxum-extra = "0.10"\nactix = "0.13"\nactix_web = "4"\n',
    '[dependencies]\nserde = { version = "1", features = ["tokio"] }\n',
    '[dependencies]\nweb = { package = "axum", version = "0.8" }\n',
    '[dependencies]\n# axum = "0.8"\n',
    '[features]\naxum = []\ntokio = ["dep:tokio"]\n',
    '[dependencies.serde]\nversion = "1"\naxum = "x"\n',
    '[dependencies-extra]\naxum = "0.8"\n',
    '[package.metadata.dependencies]\naxum = "0.8"\n',
    '[workspace]\nmembers = ["axum", "tokio"]\n',
    '[[dependencies]]\naxum = "0.8"\n',
    "[dependencies]\naxum\n",
    '[dependencies]\naxum "0.8"\n',
    '[dependencies]\naxum: "0.8"\n',
  ])
    expect({ text, in: found(cargo(text), "rust") }).toEqual({ text, in: [] });
  // The crate's own repository: its package name is no dependency.
  expect(
    found(folder({ "Cargo.toml": '[package]\nname = "axum"\nversion = "0.8.0"\n' }), "rust"),
  ).toEqual([]);
});

/** One manifest of each kind that shows a framework, with a way to pad it with text the reader skips. */
const KINDS: {
  file: string;
  stack: string;
  id: string;
  text: (padBytes: number) => string;
  hostile: string;
}[] = [
  {
    file: "composer.json",
    stack: "php",
    id: "laravel",
    text: (pad) => JSON.stringify({ require: { "laravel/framework": "*" }, x: "a".repeat(pad) }),
    hostile:
      '{"require": {"__proto__": "*", "constructor": "*", "toString": "*", "hasOwnProperty": "*"}}',
  },
  {
    file: "package.json",
    stack: "node",
    id: "express",
    text: (pad) => JSON.stringify({ dependencies: { express: "*" }, x: "a".repeat(pad) }),
    hostile:
      '{"dependencies": {"__proto__": "*", "constructor": "*", "toString": "*", "hasOwnProperty": "*"}}',
  },
  {
    file: "requirements.txt",
    stack: "python",
    id: "flask",
    text: (pad) => `flask\n${"#".repeat(pad)}`,
    hostile: "__proto__\nconstructor\ntoString\nhasOwnProperty\n",
  },
  {
    file: "requirements-dev.txt",
    stack: "python",
    id: "django",
    text: (pad) => `django\n${"#".repeat(pad)}`,
    hostile: "__proto__==1\nconstructor\ntoString[x]\nhasOwnProperty\n",
  },
  {
    file: "pyproject.toml",
    stack: "python",
    id: "fastapi",
    text: (pad) => `[project]\ndependencies = ["fastapi"]\n${"#".repeat(pad)}`,
    hostile:
      '[project]\ndependencies = ["__proto__", "constructor", "toString", "hasOwnProperty"]\n[tool.poetry.dependencies]\n__proto__ = "*"\nconstructor = "*"\n',
  },
  {
    file: "go.mod",
    stack: "go",
    id: "gin",
    text: (pad) =>
      `module example.com/app\n\nrequire github.com/gin-gonic/gin v1.12.0\n${"/".repeat(pad)}`,
    hostile:
      "module example.com/app\n\nrequire (\n\t__proto__ v1.0.0\n\tconstructor v1.0.0\n\ttoString/v2 v2.0.0\n\thasOwnProperty v1.0.0\n)\n",
  },
  {
    file: "Cargo.toml",
    stack: "rust",
    id: "axum",
    text: (pad) => `[dependencies]\naxum = "0.8"\n${"#".repeat(pad)}`,
    hostile:
      '[dependencies]\n__proto__ = "1"\nconstructor = "1"\ntoString = "1"\nhasOwnProperty = "1"\n[dependencies.__proto__]\n',
  },
];

/** The kind's manifest at exactly `bytes`: the padding is a comment or a string the reader passes over, in short lines. */
function sized(kind: (typeof KINDS)[number], bytes: number): string {
  const base = Buffer.byteLength(kind.text(0));
  if (kind.file.endsWith(".json")) return kind.text(bytes - base);
  // Text formats: comment lines of 100 characters, so no line is past the reader's length.
  const lead = kind.text(0);
  const mark = kind.file === "go.mod" ? "//" : "#";
  let pad = "";
  const line = `${mark}${"x".repeat(97)}\n`;
  while (Buffer.byteLength(lead) + pad.length + line.length <= bytes) pad += line;
  const rest = bytes - Buffer.byteLength(lead) - pad.length;
  return `${lead}${pad}${rest > 0 ? `${mark}${"x".repeat(rest)}`.slice(0, rest) : ""}`;
}

test(`${ITEM} AC-17: each kind of manifest is read as a regular file of at most 1 MiB, a link and a folder showing nothing, and no name of a manifest reaches the answer`, () => {
  expect(MANIFEST_MAX_BYTES).toBe(1024 * 1024);
  expect(KINDS.map((k) => k.file)).toEqual([
    "composer.json",
    "package.json",
    "requirements.txt",
    "requirements-dev.txt",
    "pyproject.toml",
    "go.mod",
    "Cargo.toml",
  ]);
  for (const kind of KINDS) {
    const what = kind.file;
    expect({ what, in: found(folder({ [kind.file]: kind.text(0) }), kind.stack) }).toEqual({
      what,
      in: [kind.id],
    });
    const atCap = sized(kind, MANIFEST_MAX_BYTES);
    expect({ what, bytes: Buffer.byteLength(atCap) }).toEqual({ what, bytes: MANIFEST_MAX_BYTES });
    expect({ what, at: "the cap", in: found(folder({ [kind.file]: atCap }), kind.stack) }).toEqual({
      what,
      at: "the cap",
      in: [kind.id],
    });
    const over = sized(kind, MANIFEST_MAX_BYTES + 1);
    expect(Buffer.byteLength(over)).toBe(MANIFEST_MAX_BYTES + 1);
    expect({ what, at: "over", in: found(folder({ [kind.file]: over }), kind.stack) }).toEqual({
      what,
      at: "over",
      in: [],
    });
    const linked = folder({ "elsewhere.txt": kind.text(0) });
    symlinkSync(join(linked, "elsewhere.txt"), join(linked, kind.file));
    expect({ what, at: "a link", in: found(linked, kind.stack) }).toEqual({
      what,
      at: "a link",
      in: [],
    });
    const asFolder = folder({ [`${kind.file}/inside`]: kind.text(0) });
    expect({ what, at: "a folder", in: found(asFolder, kind.stack) }).toEqual({
      what,
      at: "a folder",
      in: [],
    });
    expect({
      what,
      at: "hostile",
      in: found(folder({ [kind.file]: kind.hostile }), kind.stack),
    }).toEqual({ what, at: "hostile", in: [] });
  }
  // Brackets nested past what a parser may take: nothing shown, nothing thrown.
  const deep = `${"[".repeat(200_000)}${"]".repeat(200_000)}`;
  expect(Buffer.byteLength(deep)).toBeLessThan(MANIFEST_MAX_BYTES);
  for (const [file, stack, field] of [
    ["composer.json", "php", "require"],
    ["package.json", "node", "dependencies"],
  ] as const) {
    expect(found(folder({ [file]: `{"${field}": ${deep}}` }), stack)).toEqual([]);
    expect(found(folder({ [file]: `{"x": ${deep}, "${field}": {"express": "*"}` }), stack)).toEqual(
      [],
    );
  }
  // A manifest that is a link is still a target of the stack's own detector, with no frameworks.
  const php = folder({ "real.json": JSON.stringify({ require: { "laravel/framework": "*" } }) });
  symlinkSync(join(php, "real.json"), join(php, "composer.json"));
  const phpTarget = detectProfile(php).targets[0];
  expect(phpTarget?.stack).toBe("php");
  expect(phpTarget && "frameworks" in phpTarget).toBe(false);
  const python = folder({ "real.toml": '[project]\ndependencies = ["flask"]\n' });
  symlinkSync(join(python, "real.toml"), join(python, "pyproject.toml"));
  const pythonTarget = detectProfile(python).targets[0];
  expect(pythonTarget?.stack).toBe("python");
  expect(pythonTarget && "frameworks" in pythonTarget).toBe(false);
});

test(`${ITEM} AC-18: a text manifest's cost follows its size whatever its lines hold, and a line past 4096 characters is not read`, () => {
  expect(MANIFEST_LINE_MAX).toBe(4096);
  const BOUND_MS = 2000;
  const SIZE = MANIFEST_MAX_BYTES - 64;
  const timed = (dir: string, stack: string): { ids: string[]; ms: number } => {
    const from = performance.now();
    const ids = found(dir, stack);
    return { ids, ms: performance.now() - from };
  };
  const texts: { file: string; stack: string; lead: string; classes: string[]; near: string }[] = [
    {
      file: "requirements.txt",
      stack: "python",
      lead: "",
      classes: [" ", "a", "[", '"', "=", "-", "#", ";"],
      near: "flas\ndjang==1\nfastap[standard]\nlitesta ; x\n",
    },
    {
      file: "pyproject.toml",
      stack: "python",
      lead: "[project]\ndependencies = [\n",
      classes: [" ", "a", "[", '"', "=", "'", ",", "]"],
      near: '"flas",\n"djang>=1",\n\'fastap[standard]\',\n',
    },
    {
      file: "go.mod",
      stack: "go",
      lead: "module example.com/app\n\nrequire (\n",
      classes: [" ", "a", "/", "/v", "1", "\t", "(", "."],
      near: "\tgithub.com/gin-gonic/gi v1.0.0\n\tgithub.com/labstack/echo/v v1.0.0\n\tgithub.com/go-chi/chi/v5x v5.0.0\n",
    },
    {
      file: "Cargo.toml",
      stack: "rust",
      lead: "[dependencies]\n",
      classes: [" ", "a", "[", '"', "=", ".", "{", "-"],
      near: 'axu = "1"\ntoki = { version = "1" }\nactix-we.workspace = true\n[dependencies.rocke]\n',
    },
  ];
  const slow: string[] = [];
  for (const kind of texts) {
    for (const piece of kind.classes) {
      const line = piece.repeat(Math.floor((SIZE - kind.lead.length) / piece.length));
      const run = timed(folder({ [kind.file]: `${kind.lead}${line}` }), kind.stack);
      expect({ file: kind.file, piece, ids: run.ids }).toEqual({ file: kind.file, piece, ids: [] });
      if (run.ms >= BOUND_MS)
        slow.push(`${kind.file} one line of ${JSON.stringify(piece)}: ${run.ms}`);
    }
    const lines = kind.near.repeat(Math.floor((SIZE - kind.lead.length) / kind.near.length));
    const run = timed(folder({ [kind.file]: `${kind.lead}${lines}` }), kind.stack);
    expect({ file: kind.file, near: run.ids }).toEqual({ file: kind.file, near: [] });
    if (run.ms >= BOUND_MS) slow.push(`${kind.file} short lines: ${run.ms}`);
  }
  expect(slow).toEqual([]);
  // The edge: a line of exactly the length is read, one character more is not.
  const padded = (start: string, filler: string, length: number) =>
    `${start}${filler.repeat(length)}`.slice(0, length);
  const edges: {
    file: string;
    stack: string;
    id: string;
    lead: string;
    start: string;
    tail: string;
  }[] = [
    {
      file: "requirements.txt",
      stack: "python",
      id: "flask",
      lead: "",
      start: "flask # ",
      tail: "",
    },
    {
      file: "pyproject.toml",
      stack: "python",
      id: "flask",
      lead: "[project]\n",
      start: 'dependencies = ["flask"] # ',
      tail: "",
    },
    {
      file: "go.mod",
      stack: "go",
      id: "gin",
      lead: "module example.com/app\n\n",
      start: "require github.com/gin-gonic/gin v1.12.0 // ",
      tail: "",
    },
    {
      file: "Cargo.toml",
      stack: "rust",
      id: "axum",
      lead: "[dependencies]\n",
      start: 'axum = "0.8" # ',
      tail: "",
    },
  ];
  for (const edge of edges) {
    const at = (length: number) =>
      found(
        folder({ [edge.file]: `${edge.lead}${padded(edge.start, "x", length)}\n` }),
        edge.stack,
      );
    expect({ file: edge.file, length: 4096, in: at(4096) }).toEqual({
      file: edge.file,
      length: 4096,
      in: [edge.id],
    });
    expect({ file: edge.file, length: 4097, in: at(4097) }).toEqual({
      file: edge.file,
      length: 4097,
      in: [],
    });
    expect({ file: edge.file, length: 100, in: at(100) }).toEqual({
      file: edge.file,
      length: 100,
      in: [edge.id],
    });
  }
  // A line passed over inside a multi-line array leaves the array open: the entry after it is read.
  expect(
    found(
      pyproject(
        `[project]\ndependencies = [\n  "${"x".repeat(5000)}",\n  "flask",\n]\nname = "django"\n`,
      ),
      "python",
    ),
  ).toEqual(["flask"]);
  // A table header passed over closes the table that was open: what follows is under a table not known.
  expect(
    found(
      cargo(`[dependencies]\ntower = "1"\n[features] #${"x".repeat(5000)}\naxum = []\n`),
      "rust",
    ),
  ).toEqual([]);
  expect(
    found(
      pyproject(`[tool.poetry.dependencies]\n[tool.x] #${"x".repeat(5000)}\nflask = "*"\n`),
      "python",
    ),
  ).toEqual([]);
  // A block's end passed over ends the block.
  expect(
    found(
      gomod(
        `require (\n\tgolang.org/x/net v0.1.0\n) //${"x".repeat(5000)}\ngithub.com/gin-gonic/gin v1.0.0\n`,
      ),
      "go",
    ),
  ).toEqual([]);
});

test(`${ITEM} AC-19: the profile holds each target's frameworks from its own manifest, replaced at each detection and gone with the manifest`, () => {
  const root = tempDir("crew-fw-repo-");
  const laravel = (extra: Record<string, string> = {}) =>
    write(
      root,
      "composer.json",
      JSON.stringify({ require: { "laravel/framework": "^13", ...extra } }),
    );
  laravel();
  write(root, "apps/api/package.json", JSON.stringify({ dependencies: { "@nestjs/core": "^12" } }));
  write(root, "services/ml/requirements.txt", "fastapi[standard]\n");
  write(root, "tools/cli/package.json", JSON.stringify({ dependencies: { commander: "^12" } }));
  write(root, "cmd/go.mod", "module example.com/cmd\n\nrequire github.com/go-chi/chi/v5 v5.2.0\n");
  write(
    root,
    "crates/web/Cargo.toml",
    '[package]\nname = "web"\n\n[dependencies]\ntokio = "1"\naxum = "0.8"\n',
  );
  const first = detectProfile(root);
  expect(first.targets.map((t) => [t.path, t.stack, t.frameworks])).toEqual([
    [".", "php", ["laravel"]],
    ["apps/api", "node", ["nestjs"]],
    ["cmd", "go", ["chi"]],
    ["crates/web", "rust", ["axum", "tokio"]],
    ["services/ml", "python", ["fastapi"]],
    ["tools/cli", "node", undefined],
  ]);
  const bare = first.targets.find((t) => t.path === "tools/cli");
  expect(bare && "frameworks" in bare).toBe(false);
  // A second framework enters the manifest, then both leave.
  laravel({ "api-platform/laravel": "*" });
  const second = detectProfile(root, first);
  expect(second.targets[0]?.frameworks).toEqual(["laravel", "api-platform"]);
  write(root, "composer.json", JSON.stringify({ require: { php: "^8.3" } }));
  const third = detectProfile(root, second);
  expect(third.targets[0]?.stack).toBe("php");
  expect(third.targets[0] && "frameworks" in third.targets[0]).toBe(false);
  // A target a person's confirmed command keeps after its manifest is gone shows no framework.
  laravel();
  const withConfirmed = detectProfile(root, third);
  const php = withConfirmed.targets.find((t) => t.stack === "php");
  if (!php) throw new Error("no php target");
  expect(php.frameworks).toEqual(["laravel"]);
  php.gates.test = { command: "make test", source: "confirmed" };
  rmSync(join(root, "composer.json"));
  const kept = detectProfile(root, withConfirmed).targets.find((t) => t.stack === "php");
  expect(kept?.gates.test).toEqual({ command: "make test", source: "confirmed" });
  expect(kept && "frameworks" in kept).toBe(false);
  // The profile given is not changed by the detection that kept the target.
  expect(php.frameworks).toEqual(["laravel"]);
});

test(`${ITEM} AC-20: a saved profile follows the manifests at a refresh: the field is written where it was absent, changed and removed, and nothing is written when nothing changed`, () => {
  const env = testEnv();
  const root = makeRepo({
    "composer.json": JSON.stringify({ require: { "laravel/framework": "^13" } }),
  });
  const paths = repoPaths(root, env);
  const { profile } = ensureProfile(paths);
  // A profile as an engine before this item saved it: no field.
  const old = { ...profile, targets: profile.targets.map(({ frameworks: _f, ...t }) => t) };
  saveProfile(paths, old);
  expect(
    loadProfile(paths).profile?.targets[0] &&
      "frameworks" in (loadProfile(paths).profile?.targets[0] ?? {}),
  ).toBe(false);
  const first = refreshProfile(paths, old);
  expect(first.changed).toEqual(["frameworks of .: laravel"]);
  expect(loadProfile(paths).profile?.targets[0]?.frameworks).toEqual(["laravel"]);
  write(
    root,
    "composer.json",
    JSON.stringify({ require: { "api-platform/laravel": "*", "laravel/framework": "^13" } }),
  );
  const second = refreshProfile(paths, first.profile);
  expect(second.changed).toEqual(["frameworks of .: laravel, api-platform"]);
  expect(loadProfile(paths).profile?.targets[0]?.frameworks).toEqual(["laravel", "api-platform"]);
  // Nothing changed: no line, and the file on disk is the one it was.
  const file = join(root, ".crew", "profile.json");
  const before = readFileSync(file, "utf8");
  const same = refreshProfile(paths, second.profile);
  expect(same.changed).toEqual([]);
  expect(readFileSync(file, "utf8")).toBe(before);
  write(root, "composer.json", JSON.stringify({ require: { php: "^8.3" } }));
  const third = refreshProfile(paths, second.profile);
  expect(third.changed).toEqual(["frameworks of .: none"]);
  const saved = loadProfile(paths).profile?.targets[0];
  expect(saved?.stack).toBe("php");
  expect(saved && "frameworks" in saved).toBe(false);
  expect(refreshProfile(paths, third.profile).changed).toEqual([]);
  // A hand-changed list in the profile given is not echoed: the line holds the fresh detection's ids.
  write(root, "composer.json", JSON.stringify({ require: { "slim/slim": "^4" } }));
  const forged = {
    ...third.profile,
    targets: third.profile.targets.map((t) => ({
      ...t,
      frameworks: ["a word of the project's own"],
    })),
  };
  expect(refreshProfile(paths, forged).changed).toEqual(["frameworks of .: slim"]);
});

test(`${ITEM} AC-21: crew detect prints a target's frameworks under it, only ids of the table, and no line where there is none`, async () => {
  const env = testEnv();
  const root = makeRepo({
    "composer.json": JSON.stringify({
      require: { "laravel/framework": "^13", "api-platform/laravel": "*" },
    }),
    "tools/cli/package.json": JSON.stringify({ dependencies: { commander: "^12" } }),
  });
  const run = cliIo(root, env);
  const detected = await run("detect");
  expect(detected.code).toBe(0);
  const lines = detected.out.split("\n");
  const at = lines.findIndex((l) => l.startsWith("  . (php, composer)"));
  expect(at).toBeGreaterThanOrEqual(0);
  expect(lines[at + 1]).toBe("    frameworks: laravel, api-platform");
  expect(lines.filter((l) => l.includes("frameworks:"))).toHaveLength(1);
  // A project with no framework of the table: a profile with no field prints no such line.
  const plain = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const none = await cliIo(plain, testEnv())("detect");
  expect(none.code).toBe(0);
  expect(none.out).not.toContain("frameworks");
  // The line itself: ids of the table in the order given, and no other word of the profile.
  expect(frameworksLine({ frameworks: ["laravel", "api-platform"] })).toBe(
    "\n    frameworks: laravel, api-platform",
  );
  const coloured = `${String.fromCodePoint(0x1b)}[31mred`;
  expect(frameworksLine({ frameworks: ["not-an-id", "laravel", coloured, "__proto__"] })).toBe(
    "\n    frameworks: laravel",
  );
  expect(frameworksLine({ frameworks: ["not-an-id", "constructor"] })).toBe("");
  expect(frameworksLine({ frameworks: [] })).toBe("");
  expect(frameworksLine({})).toBe("");
  expect(frameworksLine({ frameworks: "laravel" as unknown as string[] })).toBe("");
  // Through the command: a saved list holding a word that is no id prints the id alone.
  const paths = repoPaths(root, env);
  const saved = loadProfile(paths).profile;
  if (!saved) throw new Error("no profile");
  saveProfile(paths, {
    ...saved,
    targets: saved.targets.map((t) =>
      t.frameworks ? { ...t, frameworks: ["a-word", "laravel"] } : t,
    ),
  });
  const again = await run("detect");
  expect(again.out).not.toContain("a-word");
  expect(again.out).toContain("\n    frameworks: laravel");
});

test(`${ITEM} AC-23: a manifest that opens with a byte order mark is decoded by it, and one with none is UTF-8`, () => {
  const UTF8_MARK = Buffer.from([0xef, 0xbb, 0xbf]);
  const LE_MARK = Buffer.from([0xff, 0xfe]);
  const BE_MARK = Buffer.from([0xfe, 0xff]);
  const utf16le = (text: string) => Buffer.from(text, "utf16le");
  const utf16be = (text: string) => Buffer.from(text, "utf16le").swap16();
  const bytes = (file: string, content: Buffer) => {
    const dir = tempDir("crew-fw-");
    writeFileSync(join(dir, file), content);
    return dir;
  };
  // As a Windows shell's redirect writes it: UTF-16 little-endian, a mark, CRLF.
  const frozen = "# pinned\r\nrequests==2.32.0\r\nfastapi\r\nfastapi[standard]\r\nDjango==5.0\r\n";
  expect(
    found(bytes("requirements.txt", Buffer.concat([LE_MARK, utf16le(frozen)])), "python"),
  ).toEqual(["fastapi", "django"]);
  expect(
    found(bytes("requirements.txt", Buffer.concat([BE_MARK, utf16be(frozen)])), "python"),
  ).toEqual(["fastapi", "django"]);
  // With no mark the bytes are UTF-8: UTF-16 text shows nothing.
  expect(found(bytes("requirements.txt", utf16le(frozen)), "python")).toEqual([]);
  expect(found(bytes("requirements.txt", utf16be(frozen)), "python")).toEqual([]);
  // UTF-8 with its mark: the first line, or the one object, is read as without it.
  const marked: [string, string, string, string][] = [
    ["composer.json", "php", '{"require": {"laravel/framework": "*"}}', "laravel"],
    ["package.json", "node", '{"dependencies": {"express": "*"}}', "express"],
    ["requirements.txt", "python", "flask\nrequests\n", "flask"],
    ["pyproject.toml", "python", '[project]\ndependencies = ["django"]\n', "django"],
    ["go.mod", "go", "require github.com/gin-gonic/gin v1.12.0\n", "gin"],
    ["Cargo.toml", "rust", '[dependencies]\naxum = "0.8"\n', "axum"],
  ];
  for (const [file, stack, text, id] of marked) {
    expect({
      file,
      in: found(bytes(file, Buffer.concat([UTF8_MARK, Buffer.from(text)])), stack),
    }).toEqual({
      file,
      in: [id],
    });
    expect({
      file,
      in: found(bytes(file, Buffer.concat([LE_MARK, utf16le(text)])), stack),
    }).toEqual({
      file,
      in: [id],
    });
  }
  // A mark and nothing, a mark and one odd byte, a mark and half a pair: nothing shown, nothing thrown.
  for (const content of [
    UTF8_MARK,
    LE_MARK,
    BE_MARK,
    Buffer.concat([LE_MARK, Buffer.from([0x66])]),
    Buffer.concat([BE_MARK, Buffer.from([0x00])]),
    Buffer.concat([LE_MARK, Buffer.from([0x00, 0xd8])]),
    Buffer.from([0xff]),
    Buffer.from([0xef, 0xbb]),
  ])
    for (const [file, stack] of marked) expect(found(bytes(file, content), stack)).toEqual([]);
  // The cap is on the bytes: UTF-16 text of a little over half the cap in characters is over it.
  const big = `fastapi\r\n${"#".repeat(99)}\r\n`
    .repeat(1)
    .concat(`${"#".repeat(98)}\r\n`.repeat(5300));
  const over = Buffer.concat([LE_MARK, utf16le(big)]);
  expect(over.length).toBeGreaterThan(MANIFEST_MAX_BYTES);
  expect(Buffer.byteLength(big)).toBeLessThan(MANIFEST_MAX_BYTES);
  expect(found(bytes("requirements.txt", over), "python")).toEqual([]);
  expect(found(bytes("requirements.txt", Buffer.from(big)), "python")).toEqual(["fastapi"]);
});

test(`${ITEM} AC-24: a manifest within the cap that declares as many names as fit shows the framework among them and throws nothing, under the runtime the hooks run on`, () => {
  // Shortest distinct names, base 36, none of them an identifier of the table.
  const taken = new Set(FRAMEWORKS.flatMap((f) => f.identifiers));
  const names = Array.from({ length: 400_000 }, (_, i) => i.toString(36)).filter(
    (n) => !taken.has(n),
  );
  const fill = (lead: string, line: (name: string) => string, tail: string, last: string) => {
    const room = MANIFEST_MAX_BYTES - 16 - lead.length - last.length - tail.length;
    const lines: string[] = [];
    let size = 0;
    for (const name of names) {
      const next = line(name);
      if (size + next.length > room) break;
      lines.push(next);
      size += next.length;
    }
    return { text: `${lead}${lines.join("")}${last}${tail}`, count: lines.length };
  };
  const many = [
    {
      what: "composer.json require",
      file: "composer.json",
      stack: "php",
      id: "laravel",
      ...fill('{"require":{', (n) => `"${n}":1,`, "}}", '"laravel/framework":1'),
    },
    {
      what: "package.json dependencies",
      file: "package.json",
      stack: "node",
      id: "express",
      ...fill('{"dependencies":{', (n) => `"${n}":1,`, "}}", '"express":1'),
    },
    {
      what: "pyproject.toml, Poetry's table",
      file: "pyproject.toml",
      stack: "python",
      id: "flask",
      ...fill("[tool.poetry.dependencies]\n", (n) => `${n}=1\n`, "", "flask=1\n"),
    },
    {
      what: "pyproject.toml, the project's array",
      file: "pyproject.toml",
      stack: "python",
      id: "django",
      ...fill("[project]\ndependencies=[\n", (n) => `"${n}",\n`, "]\n", '"django",\n'),
    },
    {
      what: "requirements.txt",
      file: "requirements.txt",
      stack: "python",
      id: "fastapi",
      ...fill("", (n) => `${n}\n`, "", "fastapi\n"),
    },
    {
      what: "go.mod",
      file: "go.mod",
      stack: "go",
      id: "gin",
      ...fill("require (\n", (n) => `${n} v1\n`, ")\n", "github.com/gin-gonic/gin v1.12.0\n"),
    },
    {
      what: "Cargo.toml",
      file: "Cargo.toml",
      stack: "rust",
      id: "axum",
      ...fill("[dependencies]\n", (n) => `${n}=1\n`, "", 'axum="0.8"\n'),
    },
  ];
  const bundle = join(pluginRoot(), "dist", "crew.mjs");
  for (const kind of many) {
    const what = kind.what;
    expect(Buffer.byteLength(kind.text)).toBeLessThanOrEqual(MANIFEST_MAX_BYTES);
    expect({ what, enough: kind.count > 100_000 }).toEqual({ what, enough: true });
    // In this process.
    expect({ what, in: found(folder({ [kind.file]: kind.text }), kind.stack) }).toEqual({
      what,
      in: [kind.id],
    });
    // And through the bundle under node, where an array spread into a call's arguments throws past
    // about a hundred and twenty thousand of them.
    const project = folder({ [kind.file]: kind.text });
    const run = spawnSync("node", [bundle, "detect"], {
      cwd: project,
      encoding: "utf8",
      env: testEnv(),
    });
    expect({ what, status: run.status, err: run.stderr.slice(0, 200) }).toEqual({
      what,
      status: 0,
      err: "",
    });
    expect({ what, line: run.stdout.includes(`\n    frameworks: ${kind.id}\n`) }).toEqual({
      what,
      line: true,
    });
  }
});
