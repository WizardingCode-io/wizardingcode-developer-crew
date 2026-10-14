import { join } from "node:path";
import { tddDone } from "./criteria.ts";
import { nowIso } from "./fs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import { decisionCounts } from "./policy.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type {
  Decision,
  Evidence,
  Objection,
  ObjectionLedger,
  ObjectionSeverity,
  Policy,
  WorkItem,
} from "./types.ts";

export function ledgerPath(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), "objections.json");
}

export function emptyLedger(): ObjectionLedger {
  return { objections: [] };
}

export function loadLedger(
  paths: CrewPaths,
  id: string,
): { ledger: ObjectionLedger; tampered: boolean } {
  const read = readProtectedJson<ObjectionLedger>(paths, ledgerPath(paths, id));
  return { ledger: read.data ?? emptyLedger(), tampered: read.tampered };
}

export function saveLedger(paths: CrewPaths, id: string, ledger: ObjectionLedger): void {
  writeProtectedJson(paths, ledgerPath(paths, id), ledger);
}

/** A number is taken for good, so an id names one objection for the life of the item. */
export function addObjection(
  ledger: ObjectionLedger,
  text: string,
  raisedBy: string,
  severity: ObjectionSeverity,
): Objection {
  const taken = ledger.objections
    .map((o) => Number(o.id.slice("O-".length)))
    .filter(Number.isFinite);
  const next = taken.length ? Math.max(...taken) + 1 : 1;
  const objection: Objection = {
    id: `O-${next}`,
    raisedBy,
    severity,
    text: text.trim(),
    raisedAt: nowIso(),
  };
  ledger.objections.push(objection);
  return objection;
}

/** Binds the objection to the criterion whose proof resolves it; the binding is the plan's answer. */
export function bindObjection(
  ledger: ObjectionLedger,
  work: WorkItem,
  id: string,
  criterion: string,
): Objection | { refused: string } {
  const objection = ledger.objections.find((o) => o.id === id);
  if (!objection) return { refused: `unknown objection: ${id}` };
  if (objection.waived) return { refused: `${id} is waived; it stays waived` };
  if (!work.criteria.some((c) => c.id === criterion)) {
    return { refused: `unknown criterion: ${criterion}` };
  }
  objection.criterion = criterion;
  return objection;
}

/** A person decides against an objection; the record keeps the reason. The validator never does (SP2 §9). */
export function waiveObjection(
  ledger: ObjectionLedger,
  id: string,
  reason: string,
  decision: Decision,
): Objection | { refused: string } {
  const objection = ledger.objections.find((o) => o.id === id);
  if (!objection) return { refused: `unknown objection: ${id}` };
  if (decision.by === "validator") {
    return {
      refused:
        "the validator never waives an objection; a person does, or it is bound to a criterion",
    };
  }
  objection.waived = {
    reason: reason.trim(),
    at: nowIso(),
    by: decision.by,
    ...(decision.mode ? { mode: decision.mode } : {}),
  };
  return objection;
}

export type ObjectionStatus = "open" | "bound" | "resolved" | "waived";

/** Derived, never stored: a waiver counts per the policy; a binding resolves when the criterion's record is complete. */
export function objectionStatus(
  objection: Objection,
  work: WorkItem,
  evidence: Evidence | null,
  policy: Policy,
): ObjectionStatus {
  if (objection.waived && decisionCounts(policy, objection.waived)) return "waived";
  if (objection.criterion) {
    const criterion = work.criteria.find((c) => c.id === objection.criterion);
    const record = evidence?.tdd.find((t) => t.criterion === objection.criterion);
    return criterion && tddDone(record, criterion.kind) ? "resolved" : "bound";
  }
  return "open";
}

export function blockingObjections(
  ledger: ObjectionLedger,
  work: WorkItem,
  evidence: Evidence | null,
  policy: Policy,
  statuses: ObjectionStatus[],
): Objection[] {
  return ledger.objections.filter(
    (o) =>
      o.severity === "blocking" && statuses.includes(objectionStatus(o, work, evidence, policy)),
  );
}
