import type { CriterionKind, TddRecord } from "./types.ts";

/**
 * A complete test-first record for a criterion's kind: red then green for behaviour, passing before
 * and after for preservation. Shared by the guards, the verdict and the objection ledger so all
 * agree on what "proven" means for one criterion.
 */
export function tddDone(record: TddRecord | undefined, kind: CriterionKind): boolean {
  if (!record) return false;
  if (kind === "behavior") return !!record.red && !!record.green;
  if (kind === "preserve") return !!record.before && !!record.after;
  return !!record.observed;
}
