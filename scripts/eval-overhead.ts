// Reads an aggregate-result.json from `claude plugin eval` and prints, per case, the cost with
// and without the plugin and their ratio. The documented schema puts runs under cases[].arms;
// the cost field name is read defensively because the schema says to ignore unknown fields.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

interface Row {
  name: string;
  withUsd: number | null;
  withoutUsd: number | null;
  ratio: number | null;
  /** The case's acceptance (`overhead_ceiling` in its prompt's front matter), null when it names none. */
  ceiling: number | null;
  verdict: "under" | "over" | null;
}

/**
 * The acceptance per case (SP8 decision 11, finding 93): the fast route's floor measured on a
 * one-spot feature, the issue's cost on its own. The eval kit refuses unknown keys in a case's
 * front matter, so the ceilings live here, keyed by case name.
 */
export const CEILINGS: Readonly<Record<string, number>> = {
  "fast-route-overhead": 2.03,
  "issue-fast-overhead": 3.5,
};

/** The ceilings of the cases that exist under `evalsDir`; every ceiling when no folder is given. */
export function readCeilings(evalsDir?: string): Record<string, number> {
  const ceilings: Record<string, number> = {};
  for (const [name, ceiling] of Object.entries(CEILINGS))
    if (evalsDir === undefined || existsSync(join(evalsDir, name, "case.yaml")))
      ceilings[name] = ceiling;
  return ceilings;
}

function costOf(run: unknown): number | null {
  if (typeof run !== "object" || run === null) return null;
  const r = run as Record<string, unknown>;
  for (const key of ["costUsd", "cost_usd", "estimatedCostUsd"]) {
    if (typeof r[key] === "number") return r[key] as number;
  }
  return null;
}

function sum(runs: unknown): number | null {
  if (!Array.isArray(runs) || runs.length === 0) return null;
  const costs = runs.map(costOf);
  if (costs.some((c) => c === null)) return null;
  return Number((costs as number[]).reduce((a, b) => a + b, 0).toFixed(4));
}

export function overheadByCase(result: unknown, ceilings: Record<string, number> = {}): Row[] {
  const cases = (result as { cases?: unknown[] })?.cases ?? [];
  return cases.map((c) => {
    const entry = c as { name?: string; arms?: { with?: unknown; without?: unknown } };
    const name = entry.name ?? "?";
    const withUsd = sum(entry.arms?.with);
    const withoutUsd = sum(entry.arms?.without);
    const ratio =
      withUsd !== null && withoutUsd !== null && withoutUsd > 0
        ? Number((withUsd / withoutUsd).toFixed(2))
        : null;
    const ceiling = ceilings[name] ?? null;
    // A ratio against its case's ceiling: at or under it is under; no ratio or no ceiling says nothing.
    const verdict =
      ratio !== null && ceiling !== null ? (ratio <= ceiling ? "under" : "over") : null;
    return { name, withUsd, withoutUsd, ratio, ceiling, verdict };
  });
}

/** One row as the script prints it: the costs, the ratio, and under or over the case's ceiling when both are known. */
export function rowLine(row: Row): string {
  const ratio = row.ratio === null ? "n/a" : `${row.ratio}x`;
  const against =
    row.verdict !== null && row.ceiling !== null
      ? ` · ${row.verdict} the ${row.ceiling}x ceiling`
      : "";
  return `${row.name}: with ${row.withUsd ?? "n/a"} USD · without ${row.withoutUsd ?? "n/a"} USD · ${ratio}${against}`;
}

/** False when no case has a cost on either arm: the result's cost field is not one we read. */
export function hasAnyCost(rows: Row[]): boolean {
  return rows.some((row) => row.withUsd !== null || row.withoutUsd !== null);
}

function firstRunKeys(result: unknown): string[] {
  const first = (result as { cases?: { arms?: { with?: unknown; without?: unknown } }[] })
    ?.cases?.[0]?.arms;
  const runs = Array.isArray(first?.with) ? first.with : first?.without;
  const run = Array.isArray(runs) ? runs[0] : undefined;
  return typeof run === "object" && run !== null ? Object.keys(run) : [];
}

if (import.meta.main) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: bun scripts/eval-overhead.ts <aggregate-result.json>");
    process.exit(1);
  }
  const result: unknown = JSON.parse(readFileSync(path, "utf8"));
  const rows = overheadByCase(
    result,
    readCeilings(join(import.meta.dir, "..", "plugins", "core", "evals")),
  );
  // A schema change would otherwise print a quiet column of n/a
  if (!hasAnyCost(rows)) {
    console.error(
      `no per-run cost field found (looked for costUsd, cost_usd, estimatedCostUsd); top-level keys of the first run: ${firstRunKeys(result).join(", ")}`,
    );
    process.exit(2);
  }
  for (const row of rows) console.log(rowLine(row));
}
