// Whether a whole-tag run of the eval suite passed, from its aggregates (2026-10-30-003 AC-4): the proof a release
// reads, since a kit run outlasts `crew tdd observed`'s limit. Usage:
//   bun scripts/tag-run-check.ts --since <commit> --tag ui --tag packs <aggregate-result.json>...
// Exit 0: every case of the tags has its latest run at 1.00, at or after the commit. Exit 1: it names what did not.
// Exit 2: the usage.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Aggregate {
  startedAt: string;
  cases: { name: string; aggregates: { score: number } }[];
}

/** What keeps the run from passing, one line each; empty when it passed. An unreadable aggregate may hold the run that decides, so it fails. */
export function checkTagRun(run: {
  cases: readonly string[];
  since: string;
  aggregates: readonly (Aggregate | null)[];
}): string[] {
  if (run.cases.length === 0) return ["no case carries the tags"];
  if (run.aggregates.includes(null)) return ["an aggregate could not be read"];
  const latest = new Map<string, { at: number; score: number }>();
  const since = Date.parse(run.since);
  for (const aggregate of run.aggregates as readonly Aggregate[]) {
    const at = Date.parse(aggregate.startedAt);
    if (at < since) continue;
    for (const { name, aggregates } of aggregate.cases) {
      const known = latest.get(name);
      if (!known || at > known.at) latest.set(name, { at, score: aggregates.score });
    }
  }
  return run.cases.flatMap((name) => {
    const found = latest.get(name);
    if (!found) return [`${name}: no run`];
    return found.score === 1 ? [] : [`${name}: ${found.score.toFixed(2)} in the latest run`];
  });
}

/** The eval cases whose `case.yaml` carries one of the tags. */
export function casesOfTags(evals: string, tags: readonly string[]): string[] {
  return readdirSync(evals, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => {
      let text: string;
      try {
        text = readFileSync(join(evals, name, "case.yaml"), "utf8");
      } catch {
        return false;
      }
      const carried =
        /^tags:\s*\[([^\]]*)\]/m
          .exec(text)?.[1]
          ?.split(",")
          .map((t) => t.trim()) ?? [];
      return carried.some((tag) => tags.includes(tag));
    })
    .sort();
}

function readAggregate(path: string): Aggregate | null {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Aggregate;
    return typeof parsed.startedAt === "string" && Array.isArray(parsed.cases) ? parsed : null;
  } catch {
    return null;
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const tags: string[] = [];
  const paths: string[] = [];
  let commit = "";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] as string;
    if (arg === "--tag" || arg === "--since") {
      i += 1;
      if (arg === "--tag") tags.push(args[i] ?? "");
      else commit = args[i] ?? "";
    } else paths.push(arg);
  }
  if (!commit || tags.length === 0 || paths.length === 0) {
    console.error(
      "usage: bun scripts/tag-run-check.ts --since <commit> --tag <tag>... <aggregate-result.json>...",
    );
    process.exit(2);
  }
  const log = spawnSync("git", ["log", "-1", "--format=%cI", commit], { encoding: "utf8" });
  const since = log.stdout.trim();
  if (log.status !== 0 || !since) {
    console.error(`no such commit: ${commit}`);
    process.exit(2);
  }
  const cases = casesOfTags("plugins/core/evals", tags);
  const problems = checkTagRun({ cases, since, aggregates: paths.map(readAggregate) });
  for (const problem of problems) console.log(problem);
  if (problems.length) process.exit(1);
  console.log(`${cases.length} cases at 1.00 since ${commit}`);
}
