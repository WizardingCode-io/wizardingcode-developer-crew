import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tempDir } from "./helpers.ts";

const MODULE = new URL("../../../plugins/core/e2e/playwright.mjs", import.meta.url).href;

interface Fixtures {
  page: (deps: { page: unknown }, use: (page: unknown) => Promise<void>) => Promise<void>;
}
type Handler = (arg: unknown) => void;

/** A page as the fixture sees it: the handlers it registers, the url it reports. */
function fakePage(): {
  page: { on: (event: string, h: Handler) => void; url: () => string };
  handlers: Map<string, Handler>;
} {
  const handlers = new Map<string, Handler>();
  return {
    page: { on: (event, h) => handlers.set(event, h), url: () => "http://localhost:3000/home" },
    handlers,
  };
}

test("SP7b-T4 AC-4: the Playwright module's page fixture records the console and the page errors into the gate's file when it is named, nothing otherwise", async () => {
  const mod = (await import(MODULE)) as {
    withConsole: (base: unknown) => Fixtures;
    test: unknown;
    expect: unknown;
  };
  const base = { extend: (fixtures: Fixtures) => fixtures };
  const fixtures = mod.withConsole(base);
  const dir = tempDir();
  const previous = process.env.WIZARDINGCODE_CREW_CONSOLE_FILE;
  const named = fakePage();
  let handed: unknown = null;
  try {
    process.env.WIZARDINGCODE_CREW_CONSOLE_FILE = join(dir, "console.json");
    await fixtures.page({ page: named.page }, async (p) => {
      handed = p;
    });
  } finally {
    if (previous === undefined) delete process.env.WIZARDINGCODE_CREW_CONSOLE_FILE;
    else process.env.WIZARDINGCODE_CREW_CONSOLE_FILE = previous;
  }
  expect(handed).toBe(named.page);
  named.handlers.get("console")?.({ type: () => "warning", text: () => "deprecated" });
  named.handlers.get("pageerror")?.(new Error("boom"));
  const lines = readFileSync(join(dir, "console.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l) as Record<string, unknown>);
  expect(lines).toMatchObject([
    { page: "http://localhost:3000/home", type: "warning", text: "deprecated" },
    { page: "http://localhost:3000/home", type: "error", text: "boom" },
  ]);
  expect(typeof lines[0]?.at).toBe("string");
  expect(existsSync(join(dir, "console.json"))).toBe(false);
  // Outside a gate run nothing is written.
  const unnamed = fakePage();
  try {
    delete process.env.WIZARDINGCODE_CREW_CONSOLE_FILE;
    await fixtures.page({ page: unnamed.page }, async () => {});
  } finally {
    if (previous !== undefined) process.env.WIZARDINGCODE_CREW_CONSOLE_FILE = previous;
  }
  expect(unnamed.handlers.size).toBe(0);
  expect(readFileSync(join(dir, "console.jsonl"), "utf8").trim().split("\n").length).toBe(2);
});

test("SP3-T1 (finding 73): without the project's @playwright/test the module's test and expect throw a message that names the package, from a working directory with no node_modules above it", () => {
  // Under Node, the runtime the project's Playwright runs the fixture in: Bun resolves a bare
  // specifier from the repository's own node_modules whatever the working directory (SP9 Task 2
  // installed @playwright/test at the root), so the empty working directory is only empty for Node.
  const empty = tempDir("crew-no-playwright-");
  const script = [
    `const mod = await import(${JSON.stringify(`${MODULE}?no-playwright`)});`,
    "for (const name of ['test', 'expect']) {",
    "  try { mod[name](); console.log(name + ': no throw'); } catch (error) { console.log(name + ': ' + error.message); }",
    "}",
  ].join("\n");
  const run = spawnSync("node", ["--input-type=module", "-e", script], {
    cwd: empty,
    encoding: "utf8",
  });
  expect(run.status).toBe(0);
  const message =
    "@playwright/test is not installed in this project: install it, or write the console file yourself (references/gate.md)";
  expect(run.stdout.trim().split("\n")).toEqual([`test: ${message}`, `expect: ${message}`]);
});
