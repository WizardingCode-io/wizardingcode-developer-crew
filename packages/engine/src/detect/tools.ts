// Which of the definition's tools a target shows. A closed table of the tools the backend team's
// declaration names and a project's own files can show, each with the dependency, the file or the
// `pyproject.toml` table its own documentation names, per stack. A tool is looked up among the
// names a manifest declares, by the reads and bounds of `frameworks.ts`, and among the files of the
// target's folder, which are only seen and never read. The answer holds ids of the table alone.

import { join } from "node:path";
import { isRegularFile } from "../fs.ts";
import type { Target } from "../types.ts";
import { frameworksIn, type ManifestFacts, manifestFacts } from "./frameworks.ts";

/** What shows a tool in one stack. */
export interface ToolSigns {
  /** Names the stack's manifest declares, as `manifestFacts` gives them. */
  dependencies?: readonly string[];
  /** Regular files in the target's folder. */
  files?: readonly string[];
  /** Tables of `pyproject.toml`: the table itself, a table under it or an array of tables under it. */
  tables?: readonly string[];
}

export interface Tool {
  id: string;
  /** The name the declaration's rows write it by. */
  name: string;
  /** A tool's signs are a stack's: `sentry` is Rust's crate and no sign of Sentry elsewhere. */
  stacks: Readonly<Record<string, ToolSigns>>;
}

/**
 * The tools a project's own files can show, in the order the declaration meets them. Each sign was
 * read on 2026-11-21 on the page named beside it. Left out, and so never shown: Datadog for PHP
 * (an extension a script installs, no Composer dependency on its documented path); Rollbar and
 * Bugsnag for Rust (no SDK of the service's own was found); the other `@sentry/*` packages,
 * `@bugsnag/node`, `bugsnag/bugsnag-symfony` and Datadog's older Go path under gopkg.in (the page
 * of none was opened); Datadog's Orchestrion, Prisma's schema and configuration files and Symfony
 * AI Mate's `mate/` folder (a second sign of a tool its dependency already shows); gopls (every Go
 * project has it by its stack).
 */
export const TOOLS: readonly Tool[] = [
  // github.com/laravel/docs, boost.md: `composer require laravel/boost --dev`.
  {
    id: "laravel-boost",
    name: "Laravel Boost",
    stacks: { php: { dependencies: ["laravel/boost"] } },
  },
  // github.com/symfony/ai, docs/components/mate.rst.
  {
    id: "symfony-ai-mate",
    name: "Symfony AI Mate",
    stacks: { php: { dependencies: ["symfony/ai-mate"] } },
  },
  // orm.drizzle.team/docs/get-started/postgresql-new, /docs/kit-overview, /docs/drizzle-config-file.
  {
    id: "drizzle",
    name: "Drizzle",
    stacks: {
      node: {
        dependencies: ["drizzle-orm", "drizzle-kit"],
        files: ["drizzle.config.ts", "drizzle.config.js"],
      },
    },
  },
  // prisma.io/docs/orm/overview/introduction/what-is-prisma.
  {
    id: "prisma",
    name: "Prisma",
    stacks: { node: { dependencies: ["prisma", "@prisma/client"] } },
  },
  // docs.deno.com/runtime/fundamentals/configuration/.
  { id: "deno", name: "Deno", stacks: { node: { files: ["deno.json", "deno.jsonc"] } } },
  // docs.pydantic.dev/latest/install/.
  { id: "pydantic", name: "Pydantic", stacks: { python: { dependencies: ["pydantic"] } } },
  // docs.astral.sh/uv/concepts/projects/layout/ and /concepts/configuration-files/.
  {
    id: "uv",
    name: "uv",
    stacks: { python: { files: ["uv.lock", "uv.toml"], tables: ["tool.uv"] } },
  },
  // docs.astral.sh/ruff/configuration/ and /installation/.
  {
    id: "ruff",
    name: "ruff",
    stacks: {
      python: { dependencies: ["ruff"], files: ["ruff.toml", ".ruff.toml"], tables: ["tool.ruff"] },
    },
  },
  // docs.astral.sh/ty/configuration/ and /installation/.
  {
    id: "ty",
    name: "ty",
    stacks: { python: { dependencies: ["ty"], files: ["ty.toml"], tables: ["tool.ty"] } },
  },
  // docs.sentry.io/platforms/: php, php/guides/laravel, php/guides/symfony, javascript/guides/node, python, go, rust.
  {
    id: "sentry",
    name: "Sentry",
    stacks: {
      php: { dependencies: ["sentry/sentry", "sentry/sentry-laravel", "sentry/sentry-symfony"] },
      node: { dependencies: ["@sentry/node"] },
      python: { dependencies: ["sentry-sdk"] },
      go: { dependencies: ["github.com/getsentry/sentry-go"] },
      rust: { dependencies: ["sentry"] },
    },
  },
  // docs.rollbar.com/docs/: basic-php-installation-setup, laravel, nodejs, python, go.
  {
    id: "rollbar",
    name: "Rollbar",
    stacks: {
      php: { dependencies: ["rollbar/rollbar", "rollbar/rollbar-laravel"] },
      node: { dependencies: ["rollbar"] },
      python: { dependencies: ["rollbar"] },
      go: { dependencies: ["github.com/rollbar/rollbar-go"] },
    },
  },
  // docs.datadoghq.com/tracing/trace_collection/: the nodejs, python and go libraries, and custom_instrumentation/rust.
  {
    id: "datadog",
    name: "Datadog",
    stacks: {
      node: { dependencies: ["dd-trace"] },
      python: { dependencies: ["ddtrace"] },
      go: { dependencies: ["github.com/DataDog/dd-trace-go"] },
      rust: { dependencies: ["datadog-opentelemetry"] },
    },
  },
  // docs.bugsnag.com/platforms/: php/other, php/laravel, javascript/express, python/other, go/net-http.
  {
    id: "bugsnag",
    name: "Bugsnag",
    stacks: {
      php: { dependencies: ["bugsnag/bugsnag", "bugsnag/bugsnag-laravel"] },
      node: { dependencies: ["@bugsnag/js"] },
      python: { dependencies: ["bugsnag"] },
      go: { dependencies: ["github.com/bugsnag/bugsnag-go"] },
    },
  },
];

const IDS: ReadonlySet<string> = new Set(TOOLS.map((tool) => tool.id));

/** Whether a table of `pyproject.toml` is the one named or stands under it. */
const tableShows = (found: string, named: string) =>
  found === named || found.startsWith(`${named}.`);

/** The tools a stack's facts and a folder's files show, in the table's order. */
function toolsIn(dir: string, stack: string, facts: ManifestFacts): string[] {
  const declared = new Set(facts.names);
  return TOOLS.filter((tool) => {
    const signs = Object.hasOwn(tool.stacks, stack) ? tool.stacks[stack] : undefined;
    if (!signs) return false;
    return (
      (signs.dependencies ?? []).some((name) => declared.has(name)) ||
      (signs.tables ?? []).some((named) =>
        facts.tables.some((found) => tableShows(found, named)),
      ) ||
      (signs.files ?? []).some((file) => isRegularFile(join(dir, file)))
    );
  }).map((tool) => tool.id);
}

/** The tools a stack's manifest and a folder's files show, ids of `TOOLS` in its order. */
export function toolsOf(dir: string, stack: string): string[] {
  return toolsIn(dir, stack, manifestFacts(dir, stack));
}

/** The frameworks and the tools of a stack in a folder, from one reading of its manifests. */
export function shownOf(dir: string, stack: string): { frameworks: string[]; tools: string[] } {
  const facts = manifestFacts(dir, stack);
  return { frameworks: frameworksIn(stack, facts.names), tools: toolsIn(dir, stack, facts) };
}

/** The ids of the table a list holds, in the list's order; none for a value that is no list. */
export function toolIds(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && IDS.has(id))
    : [];
}

/** The line a profile's view prints under a target that shows a tool: ids of the table alone. */
export function toolsLine(target: Pick<Target, "tools">): string {
  const ids = toolIds(target.tools);
  return ids.length ? `\n    tools: ${ids.join(", ")}` : "";
}
