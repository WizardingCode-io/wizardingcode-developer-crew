import { expect, test } from "bun:test";
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

test("SP7b-T4 AC-4: the Playwright module's page fixture records the console and the page errors into the gate's file when it is named, nothing otherwise; test and expect are undefined without the project's @playwright/test", async () => {
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
  const other = tempDir();
  try {
    delete process.env.WIZARDINGCODE_CREW_CONSOLE_FILE;
    await fixtures.page({ page: unnamed.page }, async () => {});
  } finally {
    if (previous !== undefined) process.env.WIZARDINGCODE_CREW_CONSOLE_FILE = previous;
  }
  expect(unnamed.handlers.size).toBe(0);
  expect(existsSync(join(other, "console.jsonl"))).toBe(false);
  expect(readFileSync(join(dir, "console.jsonl"), "utf8").trim().split("\n").length).toBe(2);
  expect(mod.test).toBeUndefined();
  expect(mod.expect).toBeUndefined();
});
