// Reads an aggregate-result.json from `claude plugin eval` and prints, per case, the cost with
// and without the plugin and their ratio. The documented schema puts runs under cases[].arms;
// the cost field name is read defensively because the schema says to ignore unknown fields.
import { readFileSync } from "node:fs";

interface Row {
  name: string;
  withUsd: number | null;
  withoutUsd: number | null;
  ratio: number | null;
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

export function overheadByCase(result: unknown): Row[] {
  const cases = (result as { cases?: unknown[] })?.cases ?? [];
  return cases.map((c) => {
    const entry = c as { name?: string; arms?: { with?: unknown; without?: unknown } };
    const withUsd = sum(entry.arms?.with);
    const withoutUsd = sum(entry.arms?.without);
    const ratio =
      withUsd !== null && withoutUsd !== null && withoutUsd > 0
        ? Number((withUsd / withoutUsd).toFixed(2))
        : null;
    return { name: entry.name ?? "?", withUsd, withoutUsd, ratio };
  });
}

if (import.meta.main) {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: bun scripts/eval-overhead.ts <aggregate-result.json>");
    process.exit(1);
  }
  const rows = overheadByCase(JSON.parse(readFileSync(path, "utf8")));
  for (const row of rows) {
    const ratio = row.ratio === null ? "n/a" : `${row.ratio}x`;
    console.log(
      `${row.name}: with ${row.withUsd ?? "n/a"} USD · without ${row.withoutUsd ?? "n/a"} USD · ${ratio}`,
    );
  }
}
