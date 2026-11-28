import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pluginRoot } from "../src/runtimes.ts";
import { cells, installLines, rowInstall } from "../src/team-sources.ts";
import { makeRepo, testEnv } from "./helpers.ts";

const ITEM = "2026-11-28-001";
const HOSTED = "hosted, so what a session asks leaves the machine";
const VALUE = "its line takes a value of the machine, a token or a key";
const PROMPT = "its line is typed at Claude Code's prompt, which a session cannot do";
const WORDY = "its last cell says more than its lines";
const MARKETPLACE_NOTE =
  "its page gives the line as typed at Claude Code's prompt; the session runs the command-line form under `runs`, which declares the marketplace in the project's `.claude/settings.json`, a file that a commit shares with everyone who opens the project";
const INSTALL_NOTE =
  "its page gives the line as typed at Claude Code's prompt, where a panel shows the plugin and asks its scope; the session runs the command-line form under `runs`, which opens no panel and installs the plugin, with any hooks and servers it carries, for this project, in the project's `.claude/settings.json`, a file that a commit shares with everyone who opens the project";
const MARKETPLACE = { form: "claude plugin marketplace add", note: MARKETPLACE_NOTE };
const INSTALL = { form: "claude plugin install", note: INSTALL_NOTE };
const TEAMS = [
  "backend",
  "security",
  "etl",
  "researchers",
  "qa",
  "architects",
  "devops",
  "agentic-os",
  "frontend",
] as const;

/** The state of a row of the test's own, its last cell as given. */
const state = (last: string) =>
  rowInstall(["A tool", "its skills", "https://a.test/page", last], new Set());
/** One line as a last cell holds it. */
const line = (text: string) => `\`${text}\``;
const held = (reason: string) => ({ state: "held" as const, reason });

test(`${ITEM} AC-6: the two shapes of a plugin line typed at the prompt are read as their command-line forms, and nothing near them is`, () => {
  expect(state(line("/plugin install a@b"))).toEqual({
    state: "ready",
    forms: [INSTALL],
    runs: ["claude plugin install a@b --scope project"],
  });
  expect(state(line("/plugin marketplace add a/b"))).toEqual({
    state: "ready",
    forms: [MARKETPLACE],
    runs: ["claude plugin marketplace add a/b --scope project"],
  });
  expect(state(line("/plugin marketplace add https://github.com/a/b"))).toEqual({
    state: "ready",
    forms: [MARKETPLACE],
    runs: ["claude plugin marketplace add https://github.com/a/b --scope project"],
  });
  // Every character of the name class, on each name.
  expect(state(line("/plugin install A9._-z@b.C_-0"))).toEqual({
    state: "ready",
    forms: [INSTALL],
    runs: ["claude plugin install A9._-z@b.C_-0 --scope project"],
  });
  expect(state(line("/plugin marketplace add A9._-z/b.C_-0"))).toEqual({
    state: "ready",
    forms: [MARKETPLACE],
    runs: ["claude plugin marketplace add A9._-z/b.C_-0 --scope project"],
  });
  expect(
    state(`${line("/plugin marketplace add a/b")}, then ${line("/plugin install c@d")}`),
  ).toEqual({
    state: "ready",
    forms: [MARKETPLACE, INSTALL],
    runs: [
      "claude plugin marketplace add a/b --scope project",
      "claude plugin install c@d --scope project",
    ],
  });
  // A line of another form beside a prompt line: every line of the row, the first as the row holds it.
  const mixed = state(`${line("composer require a/b")}, then ${line("/plugin install a@b")}`);
  expect(mixed).toMatchObject({
    state: "ready",
    runs: ["composer require a/b", "claude plugin install a@b --scope project"],
  });
  expect(mixed.state === "ready" ? mixed.forms.map(({ form }) => form) : mixed).toEqual([
    "composer require",
    "claude plugin install",
  ]);
  // A ready row with no prompt line has no runs, and its command-line form keeps its own note.
  const typed = state(line("claude plugin install a@b"));
  expect(typed.state).toBe("ready");
  expect(Object.hasOwn(typed, "runs")).toBe(false);
  expect(typed.state === "ready" ? typed.forms[0]?.note : typed).toBe(
    "installs a plugin, with any hooks it carries, into the person's Claude Code, for every project of theirs unless a scope is given",
  );
  // Held as typed at the prompt, each alone in an otherwise ready row.
  for (const typedAtThePrompt of [
    "/plugin install a",
    "/plugin install @b",
    "/plugin install a@",
    "/plugin install a@b@c",
    "/plugin install -y@b",
    "/plugin install a@--yes",
    "/plugin install .a@b",
    "/plugin install a@.b",
    "/plugin install a@b c",
    "/plugin install a@b --scope user",
    "/plugin install a@b -y",
    "/plugin  install a@b",
    "/plugin install  a@b",
    "/plugin install a@b ",
    "/Plugin install a@b",
    "/plugin Install a@b",
    "/plugin install\ta@b",
    "/plugin\tinstall a@b",
    "/plugin install а@b",
    "/plugin install a@а",
    "/plugin marketplace add a",
    "/plugin marketplace add a/b/c",
    "/plugin marketplace add ./a",
    "/plugin marketplace add ../a/b",
    "/plugin marketplace add --sparse/b",
    "/plugin marketplace add a/-b",
    "/plugin marketplace add a/.b",
    "/plugin marketplace add .a/b",
    "/plugin marketplace add https://github.com/-a/b",
    "/plugin marketplace add https://github.com/a/-b",
    "/plugin marketplace add https://github.com/a/.b",
    "/plugin marketplace add https://github.com/.a/b",
    "/plugin marketplace add a/b#c",
    "/plugin marketplace add a/b@c",
    "/plugin marketplace add a/b --sparse x",
    "/plugin marketplace add a/b --scope user",
    "/plugin marketplace add\ta/b",
    "/plugin marketplace  add a/b",
    "/plugin marketplace add a/b ",
    "/plugin marketplace add git@github.com:a/b",
    "/plugin marketplace remove a/b",
    "/plugin marketplace update a/b",
    "/plugin uninstall a@b",
    "/plugin update a@b",
    "/plugin menu",
    "/plugin",
    "/reload-plugins",
    "/mcp",
    "/plugin install a@b; c",
    " /plugin install a@b",
    "x/plugin install a@b",
    " /plugin marketplace add a/b",
    "x/plugin marketplace add a/b",
  ])
    expect({ typedAtThePrompt, is: state(line(typedAtThePrompt)) }).toEqual({
      typedAtThePrompt,
      is: typedAtThePrompt.startsWith("/")
        ? held(PROMPT)
        : held("its line is not one of the engine's install forms"),
    });
  // One line that is read and one that is not.
  expect(
    state(`${line("/plugin marketplace add a/b")}, then ${line("/plugin install c")}`),
  ).toEqual(held(PROMPT));
  expect(state(`${line("/plugin install a@b")}, then ${line("/reload-plugins")}`)).toEqual(
    held(PROMPT),
  );
  // The earlier orders read the line as the row holds it.
  expect(state(line("/plugin install <name>@b"))).toEqual(held(VALUE));
  expect(state(line("/plugin install {plugin-name}@b"))).toEqual(held(VALUE));
  for (const hosted of [
    "/plugin marketplace add https://gitlab.com/a/b",
    "/plugin marketplace add http://github.com/a/b",
    "/plugin marketplace add https://github.com/a/b/",
  ])
    expect({ hosted, is: state(line(hosted)) }).toEqual({ hosted, is: held(HOSTED) });
  // With the hosted hold lifted by a consent, another host's address is still no shape of the prompt's.
  for (const lifted of [
    "/plugin marketplace add https://gitlab.com/a/b",
    "/plugin marketplace add http://github.com/a/b",
    "/plugin marketplace add https://github.com/a/b/",
  ])
    expect({
      lifted,
      is: rowInstall(
        ["A tool", "its skills", "https://a.test/page", line(lifted)],
        new Set(),
        true,
      ),
    }).toEqual({ lifted, is: held(PROMPT) });
  // The later order, the words beside the lines.
  expect(state(`${line("/plugin install a@b")}, in words`)).toEqual(held(WORDY));
});

test(`${ITEM} AC-7: a ready row with a prompt line prints its forms' notes and then every line the session runs`, () => {
  const both = state(`${line("/plugin marketplace add a/b")}, then ${line("/plugin install c@d")}`);
  expect(installLines(both)).toEqual([
    "  install: ready",
    `    claude plugin marketplace add: ${MARKETPLACE_NOTE}`,
    `    claude plugin install: ${INSTALL_NOTE}`,
    "    runs: claude plugin marketplace add a/b --scope project",
    "    runs: claude plugin install c@d --scope project",
  ]);
  const mixed = state(`${line("composer require a/b")}, then ${line("/plugin install a@b")}`);
  expect(installLines(mixed)).toEqual([
    "  install: ready",
    "    composer require: adds a dependency to the project's `composer.json`",
    `    claude plugin install: ${INSTALL_NOTE}`,
    "    runs: composer require a/b",
    "    runs: claude plugin install a@b --scope project",
  ]);
  // No prompt line: what it printed before, with no runs line.
  const typed = state(
    `${line("claude plugin marketplace add a/b")}, then ${line("claude plugin install c@d")}`,
  );
  expect(installLines(typed)).toEqual([
    "  install: ready",
    "    claude plugin marketplace add: adds a marketplace to the person's Claude Code",
    "    claude plugin install: installs a plugin, with any hooks it carries, into the person's Claude Code, for every project of theirs unless a scope is given",
  ]);
});

/** The form of a team's rows for a project, by the bundle. */
function formOf(team: string, cwd: string): string[] {
  const run = spawnSync(
    "node",
    [join(pluginRoot(), "dist", "crew.mjs"), "sources", team, "--project"],
    { cwd, env: testEnv(), encoding: "utf8" },
  );
  expect({ team, code: run.status, err: run.stderr }).toEqual({ team, code: 0, err: "" });
  return run.stdout.split("\n");
}

/** The lines printed under the one row that a test finds, to the next line that is not indented. */
function under(lines: readonly string[], finds: (row: string[]) => boolean): string[] {
  const rows = lines.flatMap((l, at) => (l.startsWith("| ") && finds(cells(l)) ? [at] : []));
  expect(rows).toHaveLength(1);
  const out: string[] = [];
  for (const l of lines.slice((rows[0] ?? 0) + 1)) {
    if (!l.startsWith("  ")) break;
    out.push(l);
  }
  return out;
}

const PAGES: readonly (readonly [string, string])[] = [
  ["security", "https://code.claude.com/docs/en/claude-security"],
  ["security", "https://code.claude.com/docs/en/security-guidance"],
  ["etl", "https://github.com/redis/agent-skills"],
  ["etl", "https://github.com/neondatabase/agent-skills"],
  ["etl", "https://github.com/cockroachdb/claude-plugin"],
  ["etl", "https://github.com/dbt-labs/dbt-agent-skills"],
  ["etl", "https://github.com/dagster-io/skills"],
  ["etl", "https://github.com/airbytehq/airbyte-agent-sdk"],
  ["etl", "https://github.com/meltano/agent-skills"],
  ["etl", "https://github.com/confluentinc/agent-skills"],
  ["etl", "https://github.com/microsoft/skills-for-fabric"],
  ["etl", "https://github.com/databricks/databricks-agent-skills"],
  ["qa", "https://github.com/testcontainers/claude-skills"],
  [
    "architects",
    "https://github.com/anthropics/claude-plugins-official/tree/main/plugins/feature-dev",
  ],
  ["architects", "https://github.com/bufbuild/claude-plugins"],
];

test(`${ITEM} AC-11: the bundle prints the fifteen rows and the backend's two as ready with the lines the session runs`, () => {
  const bare = makeRepo({ "README.md": "x\n" });
  const forms = new Map(TEAMS.map((team) => [team as string, formOf(team, bare)]));
  const spansOf = (row: readonly string[]) =>
    [...(row.at(-1) ?? "").matchAll(/`([^`]*)`/g)].map((m) => m[1] ?? "");
  for (const [team, page] of PAGES) {
    const lines = forms.get(team) ?? [];
    const row = lines.filter((l) => l.startsWith("| ")).find((l) => cells(l)[2] === page);
    const printed = under(lines, (r) => r[2] === page);
    expect({ page, state: printed[0] }).toEqual({ page, state: "  install: ready" });
    // Under it, one runs line for each line of its row, the prompt's words become the command line's.
    const runs = spansOf(cells(row ?? "")).map(
      (span) => `    runs: ${span.replace(/^\/plugin /, "claude plugin ")} --scope project`,
    );
    expect(runs.length).toBeGreaterThan(0);
    expect({ page, runs: printed.filter((l) => l.startsWith("    runs: ")) }).toEqual({
      page,
      runs,
    });
  }
  expect(
    under(forms.get("etl") ?? [], (r) => r[2] === "https://github.com/neondatabase/agent-skills"),
  ).toEqual(
    expect.arrayContaining([
      "    runs: claude plugin marketplace add neondatabase/agent-skills --scope project",
      "    runs: claude plugin install neon-postgres@neon --scope project",
    ]),
  );
  // Over the nine forms, in a project with no manifest.
  const all = [...forms.values()].flat();
  expect(all.filter((l) => l === "  install: ready")).toHaveLength(30);
  const atThePrompt = all.flatMap((l, at) =>
    l === `  install: held, ${PROMPT}` ? [spansOf(cells(all[at - 1] ?? ""))] : [],
  );
  expect(atThePrompt.map((spans) => spans.filter((span) => span.startsWith("/")))).toEqual([
    ["/plugin marketplace add trailofbits/skills", "/plugin menu"],
    ["/plugin install mongodb-atlas", "/reload-plugins"],
    ["/plugin marketplace add thedotmack/claude-mem", "/plugin install claude-mem"],
  ]);
  const withUv = makeRepo({
    "composer.json": JSON.stringify({ require: { "laravel/framework": "^13" } }),
    "services/ml/requirements.txt": "fastapi\n",
    "services/ml/uv.lock": "",
  });
  expect(
    under(formOf("backend", withUv), (r) => (r[1] ?? "").startsWith("Astral's plugin")),
  ).toEqual([
    "  install: ready",
    `    claude plugin marketplace add: ${MARKETPLACE_NOTE}`,
    `    claude plugin install: ${INSTALL_NOTE}`,
    "    runs: claude plugin marketplace add astral-sh/agent-plugins --scope project",
    "    runs: claude plugin install astral@astral-sh --scope project",
  ]);
});

test(`${ITEM} AC-9: the reference tells the session what to say and never to add, and ADR 0025 ends with the amendment`, () => {
  const reference = readFileSync(
    join(pluginRoot(), "skills", "crew", "references", "understand.md"),
    "utf8",
  );
  const sentence =
    "A ready row whose page gives a line typed at Claude Code's prompt prints, under `runs`, the lines the session runs in its place: the ask says that no panel opens for the person to read the plugin and that it is installed for this project, in `.claude/settings.json`; the page, read again, must still give the prompt line the row holds; and the session runs each line as printed, from the project's root, never with `-y` or `--accept-command`, so a plugin that the command refuses for want of one is said and stays not installed.";
  expect(reference).toContain(`is not run and is said. ${sentence} `);
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
  const parts = adr.split("\n## Amendment of 2026-11-28 (item 2026-11-28-001)\n");
  expect(parts).toHaveLength(2);
  const amendment = parts[1] ?? "";
  // It is the last: no heading follows it.
  expect(amendment.includes("\n## ")).toBe(false);
  for (const said of [
    "`/plugin install <name>@<name>`",
    "`claude plugin install <name>@<name> --scope project`",
    "`/plugin marketplace add <name>/<name>`",
    "`/plugin marketplace add https://github.com/<name>/<name>`",
    "`claude plugin marketplace add <the same source> --scope project`",
    "no panel",
    "D-1",
    "2026-11-28",
    "`extraKnownMarketplaces`",
    "`enabledPlugins`",
    "never adds `-y` or `--accept-command`",
    "departs from the last sentence of D-1's answer",
    "rests on the help's words",
    "on no run",
    "no marketplace named",
    "`/reload-plugins`",
    "any other line typed at the prompt",
    "in a project that shows no stack",
    "26 rows",
    "15 are ready",
    "5 by the words beside their lines",
    "2 by another team's row at their page",
    "1 by a line of no form",
    "3 stay held by the prompt order",
    "15 to 30",
    "API Platform's",
    "Astral's",
  ])
    expect({ said, held: amendment.includes(said) }).toEqual({ said, held: true });
});
