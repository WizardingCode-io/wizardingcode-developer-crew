import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { frameworksOf, MANIFEST_MAX_BYTES } from "../src/detect/frameworks.ts";
import { detectProfile } from "../src/detect/index.ts";
import { shownOf, TOOLS, toolIds, toolsLine, toolsOf } from "../src/detect/tools.ts";
import { ensureProfile, loadProfile, refreshProfile, saveProfile } from "../src/profile.ts";
import { pluginRoot } from "../src/runtimes.ts";
import {
  declarationSections,
  LAST_LINE,
  projectRows,
  type RowMark,
  readTeamDeclaration,
  sourcesCommand,
} from "../src/team-sources.ts";
import { cliIo, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

const ITEM = "2026-11-21-005";
const IDS = TOOLS.map((t) => t.id);
const BACKEND = join(pluginRoot(), "teams", "backend.md");
const FOR_FRAMEWORKS = "rows for this project's frameworks:";
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
const HELD_CREDENTIAL = "  install: held, it reaches production data with a credential";
const HELD_NOT_STABLE = "  install: held, not stable by its own row";
const HELD_NO_COMMAND = "  install: held, its row gives no command";
const FOR_TOOLS = "rows for the tools this project shows:";
const BY_STACK = "rows by stack:";
const ERRORS = "error services this project shows:";
const ERRORS_NOTE =
  "  a row here adds a server that reaches the service's production data with a credential, and a hosted one sends what a session asks off the machine; where the credential is held and with what scope is not decided: run no line of this section before it is";
const NOT_TOLD =
  "not told: the rows of the table Common to every stack for source hosting and databases, which depend on a service nothing detects";
const leftOut = (other: string, not: string) =>
  `left out: ${other} of another stack, ${not} of a framework, a tool or a product this project does not show`;

function folder(files: Record<string, string>): string {
  const dir = tempDir("crew-tools-");
  for (const [rel, text] of Object.entries(files)) write(dir, rel, text);
  return dir;
}

/** `toolsOf`, with the standing claim checked at every call: ids of the table, each once. */
function found(dir: string, stack: string): string[] {
  const answer = toolsOf(dir, stack);
  for (const id of answer) expect(IDS, `${id} is no id of TOOLS`).toContain(id);
  expect(new Set(answer).size).toBe(answer.length);
  return answer;
}

const backend = () => {
  const read = readTeamDeclaration(pluginRoot(), "backend");
  if ("refused" in read) throw new Error(read.refused);
  return read.text;
};

/** A manifest of a stack that declares the dependency given. */
function declaring(stack: string, dependency: string, dev = false): Record<string, string> {
  switch (stack) {
    case "php":
      return {
        "composer.json": JSON.stringify({
          [dev ? "require-dev" : "require"]: { [dependency]: "*" },
        }),
      };
    case "node":
      return {
        "package.json": JSON.stringify({
          [dev ? "devDependencies" : "dependencies"]: { [dependency]: "*" },
        }),
      };
    case "python":
      return dev
        ? { "pyproject.toml": `[project]\ndependencies = ["${dependency}>=1"]\n` }
        : { "requirements.txt": `${dependency}==1.0\n` };
    case "go":
      return { "go.mod": `module example.com/app\n\nrequire ${dependency} v1.0.0\n` };
    case "rust":
      return { "Cargo.toml": `[package]\nname = "app"\n\n[dependencies]\n${dependency} = "1"\n` };
    default:
      throw new Error(stack);
  }
}

test(`${ITEM} AC-10: the table holds the thirteen tools with what shows each in each stack, and each is named where the backend's declaration names it`, () => {
  const shown = TOOLS.map((tool) => [
    tool.id,
    tool.name,
    Object.fromEntries(
      Object.entries(tool.stacks).map(([stack, signs]) => [
        stack,
        [[...(signs.dependencies ?? [])], [...(signs.files ?? [])], [...(signs.tables ?? [])]],
      ]),
    ),
  ]);
  expect(shown).toEqual([
    ["laravel-boost", "Laravel Boost", { php: [["laravel/boost"], [], []] }],
    ["symfony-ai-mate", "Symfony AI Mate", { php: [["symfony/ai-mate"], [], []] }],
    [
      "drizzle",
      "Drizzle",
      { node: [["drizzle-orm", "drizzle-kit"], ["drizzle.config.ts", "drizzle.config.js"], []] },
    ],
    ["prisma", "Prisma", { node: [["prisma", "@prisma/client"], [], []] }],
    ["deno", "Deno", { node: [[], ["deno.json", "deno.jsonc"], []] }],
    ["pydantic", "Pydantic", { python: [["pydantic"], [], []] }],
    ["uv", "uv", { python: [[], ["uv.lock", "uv.toml"], ["tool.uv"]] }],
    ["ruff", "ruff", { python: [["ruff"], ["ruff.toml", ".ruff.toml"], ["tool.ruff"]] }],
    ["ty", "ty", { python: [["ty"], ["ty.toml"], ["tool.ty"]] }],
    [
      "sentry",
      "Sentry",
      {
        php: [["sentry/sentry", "sentry/sentry-laravel", "sentry/sentry-symfony"], [], []],
        node: [["@sentry/node"], [], []],
        python: [["sentry-sdk"], [], []],
        go: [["github.com/getsentry/sentry-go"], [], []],
        rust: [["sentry"], [], []],
      },
    ],
    [
      "rollbar",
      "Rollbar",
      {
        php: [["rollbar/rollbar", "rollbar/rollbar-laravel"], [], []],
        node: [["rollbar"], [], []],
        python: [["rollbar"], [], []],
        go: [["github.com/rollbar/rollbar-go"], [], []],
      },
    ],
    [
      "datadog",
      "Datadog",
      {
        node: [["dd-trace"], [], []],
        python: [["ddtrace"], [], []],
        go: [["github.com/DataDog/dd-trace-go"], [], []],
        rust: [["datadog-opentelemetry"], [], []],
      },
    ],
    [
      "bugsnag",
      "Bugsnag",
      {
        php: [["bugsnag/bugsnag", "bugsnag/bugsnag-laravel"], [], []],
        node: [["@bugsnag/js"], [], []],
        python: [["bugsnag"], [], []],
        go: [["github.com/bugsnag/bugsnag-go"], [], []],
      },
    ],
  ]);
  // Where the declaration names each: the per-stack table for a tool a row is decided by, the
  // common table's first cell for an error service.
  const sections = declarationSections(backend());
  const rowsOf = (heading: string) =>
    sections.find((s) => s.heading === heading)?.tables[0]?.rows ?? [];
  const perStack = rowsOf("### Per stack, from the framework's or the tool's own team");
  const common = rowsOf("### Common to every stack");
  const STACK: Record<string, string> = {
    PHP: "php",
    "Node / TypeScript": "node",
    Python: "python",
    Go: "go",
    Rust: "rust",
  };
  const whole = (text: string, phrase: string) =>
    new RegExp(`(?:^|[^A-Za-z])${phrase}(?:$|[^A-Za-z])`).test(text);
  const services = ["sentry", "rollbar", "datadog", "bugsnag"];
  const installed = ["laravel-boost", "symfony-ai-mate"];
  for (const tool of TOOLS) {
    if (services.includes(tool.id)) {
      expect(
        common.filter((row) => row[0] === `Errors in production: ${tool.name}`),
        tool.name,
      ).toHaveLength(1);
      continue;
    }
    const naming = perStack.filter(
      (row) =>
        Object.hasOwn(tool.stacks, STACK[row[0] ?? ""] ?? "") && whole(row[1] ?? "", tool.name),
    );
    if (!installed.includes(tool.id)) expect(naming.length, tool.name).toBeGreaterThan(0);
  }
  expect(common.filter((row) => (row[0] ?? "").startsWith("Errors in production: "))).toHaveLength(
    4,
  );
});

test(`${ITEM} AC-11: a tool is shown by each dependency of each of its stacks, by each of its files and by its table, and by nothing that only resembles one`, () => {
  for (const tool of TOOLS)
    for (const [stack, signs] of Object.entries(tool.stacks)) {
      for (const dependency of signs.dependencies ?? []) {
        const what = `${tool.id} ${stack} ${dependency}`;
        expect({ what, in: found(folder(declaring(stack, dependency)), stack) }).toEqual({
          what,
          in: [tool.id],
        });
      }
      for (const file of signs.files ?? []) {
        const what = `${tool.id} ${stack} ${file}`;
        expect({ what, in: found(folder({ [file]: "" }), stack) }).toEqual({ what, in: [tool.id] });
        const asFolder = folder({ [`${file}/inside`]: "x" });
        expect({ what, at: "a folder", in: found(asFolder, stack) }).toEqual({
          what,
          at: "a folder",
          in: [],
        });
        const linked = folder({ "elsewhere.txt": "x" });
        symlinkSync(join(linked, "elsewhere.txt"), join(linked, file));
        expect({ what, at: "a link", in: found(linked, stack) }).toEqual({
          what,
          at: "a link",
          in: [],
        });
      }
      for (const table of signs.tables ?? []) {
        const what = `${tool.id} ${stack} [${table}]`;
        const shows = (text: string) => found(folder({ "pyproject.toml": text }), stack);
        expect({ what, in: shows(`[${table}]\nx = 1\n`) }).toEqual({ what, in: [tool.id] });
        expect({ what, in: shows(`[project]\nname = "a"\n\n[${table}.lint]\nx = 1\n`) }).toEqual({
          what,
          in: [tool.id],
        });
        expect({ what, in: shows(`[[${table}.index]]\nname = "a"\n`) }).toEqual({
          what,
          in: [tool.id],
        });
        expect({ what, in: shows(`[ ${table} ] # set\n`) }).toEqual({ what, in: [tool.id] });
      }
    }
  // Under the development field, a normalised Python name, a Go path at a major suffix.
  expect(found(folder(declaring("php", "laravel/boost", true)), "php")).toEqual(["laravel-boost"]);
  expect(found(folder(declaring("node", "drizzle-kit", true)), "node")).toEqual(["drizzle"]);
  expect(found(folder(declaring("python", "ruff", true)), "python")).toEqual(["ruff"]);
  expect(
    found(folder({ "requirements.txt": "Sentry_SDK[fastapi]>=2\nPyDantic\n" }), "python"),
  ).toEqual(["pydantic", "sentry"]);
  expect(
    found(
      folder({
        "go.mod":
          "module x\n\nrequire (\n\tgithub.com/DataDog/dd-trace-go/v2 v2.0.0\n\tgithub.com/bugsnag/bugsnag-go/v2 v2.6.0\n)\n",
      }),
      "go",
    ),
  ).toEqual(["datadog", "bugsnag"]);
  // Several at once, in the table's order.
  expect(
    found(
      folder({
        "package.json": JSON.stringify({
          dependencies: { "@bugsnag/js": "*", "@prisma/client": "*", "drizzle-orm": "*" },
          devDependencies: { prisma: "*" },
        }),
        "deno.json": "{}",
      }),
      "node",
    ),
  ).toEqual(["drizzle", "prisma", "deno", "bugsnag"]);
  expect(
    found(
      folder({
        "uv.lock": "",
        "pyproject.toml": "[tool.ty]\n[tool.ruff.lint]\n",
        "requirements.txt": "pydantic\n",
      }),
      "python",
    ),
  ).toEqual(["pydantic", "uv", "ruff", "ty"]);
  // What only resembles a tool, or is another stack's, or is left out of the table.
  const none: [string, Record<string, string>][] = [
    ["node", declaring("node", "drizzle-orm-extra")],
    ["node", declaring("node", "@prisma/clientx")],
    ["node", declaring("node", "@sentry/browser")],
    ["node", declaring("node", "@sentry/nestjs")],
    ["node", declaring("node", "pydantic")],
    ["node", declaring("node", "sentry")],
    ["node", declaring("node", "ddtrace")],
    ["python", declaring("python", "pydantic-core")],
    ["python", declaring("python", "sentry-sdk-extras")],
    ["python", declaring("python", "sentry")],
    ["python", { "pyproject.toml": "[tool.rufflike]\nx = 1\n" }],
    ["python", { "pyproject.toml": "[tools.ruff]\nx = 1\n" }],
    ["python", { "pyproject.toml": "[[tool.rufflike]]\nx = 1\n" }],
    ["python", { "pyproject.toml": '[project]\nname = "tool.ruff"\n# [tool.ruff]\n' }],
    ["python", { "pyproject.toml": '[project]\nkeywords = [\n  "[tool.uv]",\n]\n' }],
    ["python", { "ruff.toml.bak": "", "uv.lock.old": "", "Ruff.toml.x": "" }],
    ["go", declaring("go", "github.com/getsentry/sentry-go-extra")],
    ["go", declaring("go", "gopkg.in/DataDog/dd-trace-go.v1")],
    ["rust", declaring("rust", "rollbar")],
    ["rust", declaring("rust", "bugsnag")],
    ["rust", declaring("rust", "sentry-core")],
    ["php", declaring("php", "datadog/dd-trace")],
    ["php", declaring("php", "laravel/boost-extra")],
    ["php", { "deno.json": "{}", "uv.lock": "", "composer.json": "{}" }],
    ["rust", { "deno.json": "{}", "uv.lock": "", "ruff.toml": "" }],
    ["other", declaring("node", "drizzle-orm")],
    ["elixir", { "uv.lock": "" }],
  ];
  for (const [stack, files] of none)
    expect({ stack, files, in: found(folder(files), stack) }).toEqual({ stack, files, in: [] });
});

test(`${ITEM} AC-12: one reading gives the frameworks and the tools that two give apart, under the bounds that stand, and no name of a manifest reaches the answer`, () => {
  const projects: [string, Record<string, string>][] = [
    [
      "php",
      {
        "composer.json": JSON.stringify({
          require: { "laravel/framework": "*", "sentry/sentry-laravel": "*" },
          "require-dev": { "laravel/boost": "*" },
        }),
      },
    ],
    [
      "node",
      {
        "package.json": JSON.stringify({
          dependencies: { "@nestjs/core": "*", express: "*", "drizzle-orm": "*" },
        }),
        "deno.jsonc": "{}",
      },
    ],
    [
      "python",
      {
        "requirements.txt": "fastapi\npydantic\n",
        "pyproject.toml": '[project]\ndependencies = ["django"]\n\n[tool.ruff]\n',
        "uv.lock": "",
      },
    ],
    [
      "go",
      {
        "go.mod":
          "module x\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.12.0\n\tgithub.com/getsentry/sentry-go v0.50.0\n)\n",
      },
    ],
    ["rust", { "Cargo.toml": '[dependencies]\naxum = "0.8"\nsentry = "0.49"\n' }],
    ["php", {}],
    ["other", { "package.json": "{}" }],
  ];
  for (const [stack, files] of projects) {
    const dir = folder(files);
    expect({ stack, shown: shownOf(dir, stack) }).toEqual({
      stack,
      shown: { frameworks: frameworksOf(dir, stack), tools: toolsOf(dir, stack) },
    });
  }
  expect(shownOf(folder(projects[2]?.[1] ?? {}), "python")).toEqual({
    frameworks: ["fastapi", "django"],
    tools: ["pydantic", "uv", "ruff"],
  });
  // A manifest past the cap, a link or a folder shows no tool by a dependency; a tool's own file beside it still does.
  const big = `fastapi\npydantic\n${"#".repeat(MANIFEST_MAX_BYTES)}`;
  expect(found(folder({ "requirements.txt": big, "uv.lock": "" }), "python")).toEqual(["uv"]);
  const linked = folder({
    "real.json": JSON.stringify({ dependencies: { "drizzle-orm": "*" } }),
    "deno.json": "{}",
  });
  symlinkSync(join(linked, "real.json"), join(linked, "package.json"));
  expect(found(linked, "node")).toEqual(["deno"]);
  const asFolder = folder({ "ruff.toml": "" });
  mkdirSync(join(asFolder, "pyproject.toml"));
  expect(found(asFolder, "python")).toEqual(["ruff"]);
  // Hostile names find nothing in any stack.
  for (const stack of ["php", "node", "python", "go", "rust"])
    for (const name of ["__proto__", "constructor", "toString", "hasOwnProperty"])
      expect({ stack, name, in: found(folder(declaring(stack, name)), stack) }).toEqual({
        stack,
        name,
        in: [],
      });
  expect(
    found(folder({ "pyproject.toml": "[__proto__]\n[constructor]\n[tool.__proto__]\n" }), "python"),
  ).toEqual([]);
});

test(`${ITEM} AC-13: the profile holds each target's tools by the rules of its frameworks, a refresh brings them level and says so, and crew detect prints ids of the table alone`, async () => {
  const env = testEnv();
  const composer = (require: Record<string, string>) =>
    JSON.stringify({ require: { "laravel/framework": "^13", ...require } });
  const root = makeRepo({
    "composer.json": composer({ "sentry/sentry-laravel": "*" }),
    "services/ml/requirements.txt": "fastapi\n",
    "services/ml/uv.lock": "",
    "tools/cli/package.json": JSON.stringify({ dependencies: { commander: "^12" } }),
  });
  const first = detectProfile(root);
  expect(first.targets.map((t) => [t.path, t.stack, t.frameworks, t.tools])).toEqual([
    [".", "php", ["laravel"], ["sentry"]],
    ["services/ml", "python", ["fastapi"], ["uv"]],
    ["tools/cli", "node", undefined, undefined],
  ]);
  const bare = first.targets[2];
  expect(bare && "tools" in bare).toBe(false);
  // A fresh detection replaces the list; a kept target loses it.
  write(root, "composer.json", composer({ "bugsnag/bugsnag": "*", "laravel/boost": "*" }));
  const second = detectProfile(root, first);
  expect(second.targets[0]?.tools).toEqual(["laravel-boost", "bugsnag"]);
  const php = second.targets[0];
  if (!php) throw new Error("no target");
  php.gates.test = { command: "make test", source: "confirmed" };
  rmSync(join(root, "composer.json"));
  const kept = detectProfile(root, second).targets.find((t) => t.stack === "php");
  expect(kept?.gates.test?.command).toBe("make test");
  expect(kept && "tools" in kept).toBe(false);
  expect(kept && "frameworks" in kept).toBe(false);
  // A saved profile follows at a refresh.
  write(root, "composer.json", composer({ "sentry/sentry-laravel": "*" }));
  const paths = repoPaths(root, env);
  const { profile } = ensureProfile(paths);
  const withTools = (tools: unknown, frameworks?: unknown) => ({
    ...profile,
    targets: profile.targets.map((t) => {
      const { tools: _t, ...rest } = t;
      return t.stack === "php"
        ? {
            ...rest,
            ...(tools === undefined ? {} : { tools: tools as string[] }),
            ...(frameworks === undefined ? {} : { frameworks: frameworks as string[] }),
          }
        : t;
    }),
  });
  const savedTools = () =>
    loadProfile(paths).profile?.targets.find((t) => t.stack === "php")?.tools;
  for (const saved of [
    undefined,
    ["sentry", "a word"],
    ["bugsnag"],
    "sentry",
    7,
    { length: 1, 0: "sentry" },
  ]) {
    const old = withTools(saved);
    saveProfile(paths, old);
    expect({ saved, changed: refreshProfile(paths, old).changed }).toEqual({
      saved,
      changed: ["tools of .: sentry"],
    });
    expect(savedTools()).toEqual(["sentry"]);
  }
  const level = loadProfile(paths).profile;
  if (!level) throw new Error("no profile");
  expect(refreshProfile(paths, level).changed).toEqual([]);
  // Both lists changed in one refresh: the frameworks' line, then the tools'.
  const both = withTools(["bugsnag"], ["slim"]);
  saveProfile(paths, both);
  expect(refreshProfile(paths, both).changed).toEqual([
    "frameworks of .: laravel",
    "tools of .: sentry",
  ]);
  write(root, "composer.json", composer({}));
  const gone = withTools(["sentry"]);
  saveProfile(paths, gone);
  expect(refreshProfile(paths, gone).changed).toEqual(["tools of .: none"]);
  const after = loadProfile(paths).profile?.targets.find((t) => t.stack === "php");
  expect(after && "tools" in after).toBe(false);
  // The printed line: after the frameworks' line, ids of the table alone.
  write(root, "composer.json", composer({ "sentry/sentry-laravel": "*", "laravel/boost": "*" }));
  const detected = await cliIo(root, env)("detect", "--refresh");
  const lines = detected.out.split("\n");
  const at = lines.findIndex((l) => l.startsWith("  . (php, composer)"));
  expect(lines.slice(at + 1, at + 3)).toEqual([
    "    frameworks: laravel",
    "    tools: laravel-boost, sentry",
  ]);
  const ml = lines.findIndex((l) => l.startsWith("  services/ml (python"));
  expect(lines.slice(ml + 1, ml + 3)).toEqual(["    frameworks: fastapi", "    tools: uv"]);
  expect(lines.filter((l) => l.startsWith("    tools:"))).toHaveLength(2);
  expect(toolsLine({ tools: ["sentry", "a-word", "uv", "__proto__"] })).toBe(
    "\n    tools: sentry, uv",
  );
  expect(toolsLine({ tools: ["a-word"] })).toBe("");
  expect(toolsLine({})).toBe("");
  expect(toolsLine({ tools: "sentry" as unknown as string[] })).toBe("");
  expect(toolIds(["uv", "laravel", 7, null, "ruff"])).toEqual(["uv", "ruff"]);
  expect(toolIds({ length: 1, 0: "uv" })).toEqual([]);
  // Through the command: a saved list holding a word that is no id prints the ids alone.
  const held = loadProfile(paths).profile;
  if (!held) throw new Error("no profile");
  saveProfile(paths, {
    ...held,
    targets: held.targets.map((t) =>
      t.stack === "php" ? { ...t, tools: ["a-word", "sentry", "__proto__"] } : t,
    ),
  });
  const again = await cliIo(root, env)("detect");
  expect(again.out).not.toContain("a-word");
  expect(again.out).not.toContain("__proto__");
  expect(again.out).toContain("\n    frameworks: laravel\n    tools: sentry\n");
});

const target = (stack: string, frameworks: string[], tools: string[]) => ({
  stack,
  frameworks,
  tools,
});
const marksOf = (
  text: string,
  ...targets: { stack: string; frameworks: string[]; tools: string[] }[]
) =>
  projectRows(text, targets).map((row): [string, RowMark] => [
    (row.cells[1] ?? "").slice(0, 14),
    row.mark,
  ]);

test(`${ITEM} AC-14: a row that names a tool is the project's where a target of its stack shows the tool, and a framework's row is the project's whether or not its tool is installed`, () => {
  const of = (mark: RowMark, ...rows: string[]) =>
    rows.map((opens): [string, RowMark] => [opens, mark]);
  const PHP = [
    "Laravel Boost:",
    "Laravel Herd's",
    "Symfony AI Mat",
    "API Platform's",
    "WordPress Agen",
    "WordPress MCP ",
  ];
  const NODE = [
    "Drizzle Kit's ",
    "Drizzle's skil",
    "Prisma's MCP s",
    "Prisma's skill",
    "Deno's skills.",
  ];
  expect(
    marksOf(backend(), target("node", [], ["drizzle"]), target("python", ["fastapi"], ["ruff"])),
  ).toEqual([
    ...of("other stack", ...PHP),
    ...of("tool", "Drizzle Kit's ", "Drizzle's skil"),
    ...of("not this project's", "Prisma's MCP s", "Prisma's skill", "Deno's skills."),
    ["FastAPI's skil", "framework"],
    ["Litestar's ski", "not this project's"],
    ["Astral's plugi", "tool"],
    ["Pydantic's ski", "not this project's"],
    ["gopls's built-", "other stack"],
    ["none found", "other stack"],
  ]);
  // Laravel Boost's row is a Laravel project's with Boost installed and without it.
  for (const tools of [["laravel-boost"], []])
    expect(marksOf(backend(), target("php", ["laravel"], tools)).slice(0, 6)).toEqual([
      ...of("framework", "Laravel Boost:", "Laravel Herd's"),
      ...of(
        "not this project's",
        "Symfony AI Mat",
        "API Platform's",
        "WordPress Agen",
        "WordPress MCP ",
      ),
    ]);
  // Symfony AI Mate installed in a project that shows no Symfony: the framework still decides.
  expect(marksOf(backend(), target("php", [], ["symfony-ai-mate"]))[2]).toEqual([
    "Symfony AI Mat",
    "not this project's",
  ]);
  expect(
    marksOf(backend(), target("go", ["gin"], []), target("rust", [], ["sentry"])).slice(15),
  ).toEqual([
    ["gopls's built-", "by stack"],
    ["none found", "by stack"],
  ]);
  expect(marksOf(backend(), target("node", ["nestjs"], [])).slice(6, 11)).toEqual(
    of("not this project's", ...NODE),
  );
  // Each of Astral's three tools alone makes its row the project's; each Node tool its own rows.
  for (const tool of ["uv", "ruff", "ty"])
    expect({ tool, mark: marksOf(backend(), target("python", [], [tool]))[13] }).toEqual({
      tool,
      mark: ["Astral's plugi", "tool"],
    });
  expect(marksOf(backend(), target("node", [], ["prisma", "deno"])).slice(6, 11)).toEqual([
    ...of("not this project's", "Drizzle Kit's ", "Drizzle's skil"),
    ...of("tool", "Prisma's MCP s", "Prisma's skill", "Deno's skills."),
  ]);
  expect(marksOf(backend(), target("python", [], ["pydantic"]))[14]).toEqual([
    "Pydantic's ski",
    "tool",
  ]);
  // A target with no tools field, and one whose field is no list.
  expect(
    projectRows(backend(), [{ stack: "node" }])
      .slice(6, 11)
      .map((r) => r.mark),
  ).toEqual(NODE.map(() => "not this project's"));
  expect(
    projectRows(backend(), [{ stack: "node", tools: "drizzle" as unknown as string[] }])[6]?.mark,
  ).toBe("not this project's");
});

test(`${ITEM} AC-15: on a made table a tool is named as a whole phrase, a framework decides over a tool and a tool over WordPress, and a tool of another stack decides nothing`, () => {
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
  const mark = (
    row: string,
    ...targets: { stack: string; frameworks: string[]; tools: string[] }[]
  ) => projectRows(made(row), targets).map((r) => r.mark);
  const prisma = target("node", [], ["prisma"]);
  expect(mark("| Node / TypeScript | a Prismatic server | | |", prisma)).toEqual(["by stack"]);
  expect(mark("| Node / TypeScript | Prisma's server | | |", prisma)).toEqual(["tool"]);
  expect(
    mark("| Node / TypeScript | Prisma's server | | |", target("node", [], ["drizzle"])),
  ).toEqual(["not this project's"]);
  expect(
    mark("| Python | built with truffle and duvet | | |", target("python", [], ["ruff", "uv"])),
  ).toEqual(["by stack"]);
  expect(mark("| Python | uv's own skills | | |", target("python", [], ["uv"]))).toEqual(["tool"]);
  const both = "| PHP | Laravel's bridge to Sentry | | |";
  expect(mark(both, target("php", ["laravel"], []))).toEqual(["framework"]);
  expect(mark(both, target("php", [], ["sentry"]))).toEqual(["not this project's"]);
  const product = "| PHP | Sentry for WordPress | | |";
  expect(mark(product, target("php", [], ["sentry"]))).toEqual(["tool"]);
  expect(mark(product, target("php", [], []))).toEqual(["not this project's"]);
  // A tool of another stack named in a row is no tool of the row's: Pydantic is Python's.
  expect(
    mark(
      "| Go | typed like Pydantic | | |",
      target("go", [], []),
      target("python", [], ["pydantic"]),
    ),
  ).toEqual(["by stack"]);
  // A tool shown by a target of another stack than the row's does not make the row the project's.
  expect(
    mark(
      "| PHP | Sentry's PHP skills | | |",
      target("php", [], []),
      target("node", [], ["sentry"]),
    ),
  ).toEqual(["not this project's"]);
});

/** A Laravel application that reports to Sentry, with a FastAPI service on uv beside it. */
function laravelSentryAndFastapi(): string {
  return makeRepo({
    "composer.json": JSON.stringify({
      require: { "laravel/framework": "^13", "sentry/sentry-laravel": "^4" },
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

function expectedForLaravel(): string[] {
  return [
    BACKEND,
    "this project: php (laravel); python (fastapi)",
    "tools: php (sentry); python (uv)",
    FOR_FRAMEWORKS,
    rowLine("Laravel Boost:"),
    ...BOOST_STATE,
    rowLine("Laravel Herd's"),
    HELD_VALUE,
    rowLine("FastAPI's skill"),
    ...FASTAPI_STATE,
    FOR_TOOLS,
    rowLine("Astral's plugin"),
    HELD_PROMPT,
    BY_STACK,
    "  none",
    ERRORS,
    ERRORS_NOTE,
    rowLine("Errors in production: Sentry"),
    HELD_CREDENTIAL,
    leftOut("7 rows", "6 rows"),
    NOT_TOLD,
    LAST_LINE,
  ];
}

test(`${ITEM} AC-16: crew sources backend --project prints the project's tools, its rows under three headings, its error service under the engine's own warning, the count in its numbers' words and what it cannot tell`, async () => {
  const run = await cliIo(laravelSentryAndFastapi(), testEnv())("sources", "backend", "--project");
  expect(run.code).toBe(0);
  expect(run.out.trimEnd().split("\n")).toEqual(expectedForLaravel());
  expect(rowLine("Errors in production: Sentry")).toContain(
    "`claude mcp add --transport http sentry https://mcp.sentry.dev/mcp/{organizationSlug}/{projectSlug}`",
  );
  // A Node project that shows no tool: no tools line, every heading with none, the warning still there.
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
  // Two error services at once, in the declaration's order, whichever stack shows each.
  const two = makeRepo({
    "go.mod": "module x\n\nrequire github.com/bugsnag/bugsnag-go/v2 v2.6.0\n",
    "web/package.json": JSON.stringify({ dependencies: { rollbar: "*", "drizzle-orm": "*" } }),
  });
  const errors = (await cliIo(two, testEnv())("sources", "backend", "--project")).out.split("\n");
  expect(errors[1]).toBe(
    "this project: node (no framework of the table); go (no framework of the table)",
  );
  expect(errors[2]).toBe("tools: node (drizzle, rollbar); go (bugsnag)");
  const from = errors.indexOf(ERRORS);
  expect(errors.slice(from, from + 6)).toEqual([
    ERRORS,
    ERRORS_NOTE,
    rowLine("Errors in production: Rollbar"),
    HELD_CREDENTIAL,
    rowLine("Errors in production: Bugsnag"),
    HELD_CREDENTIAL,
  ]);
  expect(errors.slice(errors.indexOf(BY_STACK), errors.indexOf(BY_STACK) + 3)).toEqual([
    BY_STACK,
    rowLine("gopls's built-in"),
    HELD_NOT_STABLE,
  ]);
  // The count's words follow its numbers, on made tables: one of each, and none.
  const table = (rows: string[], common: string[] = []) =>
    [
      "<!-- made -->",
      "### Common to every stack",
      "",
      "| Use | Server | Read at | How it is added |",
      "| :- | :- | :- | :- |",
      ...common,
      "",
      "### Per stack, from the framework's or the tool's own team",
      "",
      "| Stack | Server or skills | Read at | How it is installed |",
      "| :- | :- | :- | :- |",
      ...rows,
      "",
    ].join("\n");
  const bad = `${String.fromCodePoint(0x1b)}[31m${String.fromCodePoint(0x202e)}`;
  const madeRoot = (text: string) => {
    const root = tempDir("crew-teams-root-");
    write(root, "teams/backend.md", text);
    return root;
  };
  const cwd = laravelSentryAndFastapi();
  const one = sourcesCommand(
    madeRoot(
      table(
        ["| PHP | Laravel Boost | | |", "| PHP | Symfony's own | | |", "| Go | gopls | | |"],
        [
          `| Errors in production: Sentry | hosted | https://example.test | \`claude ${bad}mcp add x\` |`,
          "| Errors in production: Rollbar | x | | |",
          "| Database: a | x | | |",
        ],
      ),
    ),
    ["backend"],
    { project: { cwd } },
  ).text.split("\n");
  expect(one.slice(3)).toEqual([
    FOR_FRAMEWORKS,
    "| PHP | Laravel Boost | | |",
    HELD_NO_COMMAND,
    FOR_TOOLS,
    "  none",
    BY_STACK,
    "  none",
    ERRORS,
    ERRORS_NOTE,
    "| Errors in production: Sentry | hosted | https://example.test | `claude [31mmcp add x` |",
    HELD_CREDENTIAL,
    leftOut("1 row", "1 row"),
    NOT_TOLD,
    LAST_LINE,
  ]);
  const zero = sourcesCommand(madeRoot(table(["| PHP | Laravel Boost | | |"])), ["backend"], {
    project: { cwd },
  }).text.split("\n");
  expect(zero.slice(-3)).toEqual([leftOut("0 rows", "0 rows"), NOT_TOLD, LAST_LINE]);
  const two2 = sourcesCommand(
    madeRoot(
      table(["| Go | a | | |", "| Rust | b | | |", "| PHP | Symfony | | |", "| PHP | Slim | | |"]),
    ),
    ["backend"],
    { project: { cwd } },
  ).text.split("\n");
  expect(two2.slice(-3)).toEqual([leftOut("2 rows", "2 rows"), NOT_TOLD, LAST_LINE]);
  // The two short answers print what they printed before this item.
  const empty = await cliIo(makeRepo({ "notes.txt": "x\n" }), testEnv())(
    "sources",
    "backend",
    "--project",
  );
  expect(empty.out.trimEnd().split("\n")).toEqual([
    BACKEND,
    "this project: no target of a stack the declaration has rows for (php, node, python, go, rust)",
    LAST_LINE,
  ]);
  const nowhere = tempDir("crew-no-project-");
  write(nowhere, "package.json", JSON.stringify({ dependencies: { "@sentry/node": "*" } }));
  const outside = await cliIo(nowhere, testEnv())("sources", "backend", "--project");
  expect(outside.out.trimEnd().split("\n")).toEqual([
    BACKEND,
    "this folder is in no project (no .git at or above it, no .crew in it): nothing was read of it",
    LAST_LINE,
  ]);
});

test(`${ITEM} AC-17: the form run from the bundle under Node prints what the engine's own process prints, with nothing on its error output`, () => {
  const root = laravelSentryAndFastapi();
  const run = spawnSync(
    "node",
    [join(pluginRoot(), "dist", "crew.mjs"), "sources", "backend", "--project"],
    {
      cwd: root,
      encoding: "utf8",
      env: testEnv(),
    },
  );
  expect({ status: run.status, err: run.stderr }).toEqual({ status: 0, err: "" });
  expect(run.stdout.trimEnd().split("\n")).toEqual(expectedForLaravel());
  const below = spawnSync(
    "node",
    [join(pluginRoot(), "dist", "crew.mjs"), "sources", "backend", "--project"],
    { cwd: join(root, "services", "ml"), encoding: "utf8", env: testEnv() },
  );
  expect(below.stdout).toBe(run.stdout);
  const detect = spawnSync("node", [join(pluginRoot(), "dist", "crew.mjs"), "detect"], {
    cwd: root,
    encoding: "utf8",
    env: testEnv(),
  });
  expect(detect.status).toBe(0);
  expect(detect.stdout).toContain("\n    frameworks: laravel\n    tools: sentry\n");
});
