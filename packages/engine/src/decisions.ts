import { join } from "node:path";
import type { CrewPaths } from "./paths.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";

/** One decision of the project, from any item: taken by a person, the validator or the agent, or recorded by the judge or a lead (SP7 §6.6, rule 8). */
export interface DecisionEntry {
  at: string;
  item: string;
  kind:
    | "decision"
    | "objection"
    | "approval"
    | "ruling"
    | "validation"
    | "continue"
    | "priorities"
    | "triage"
    | "question";
  id?: string;
  text: string;
  answer?: string;
  by: string;
  file?: string;
}

interface Register {
  version: 1;
  entries: DecisionEntry[];
}

export function registerPath(paths: CrewPaths): string {
  return join(paths.crewDir, "decisions.json");
}

function load(paths: CrewPaths): { register: Register; tampered: boolean } {
  const read = readProtectedJson<Register>(paths, registerPath(paths));
  const entries = Array.isArray(read.data?.entries) ? read.data.entries : [];
  return { register: { version: 1, entries }, tampered: read.tampered };
}

/** Appends one entry; the file is engine-owned and protected like the ledger. */
export function appendDecision(paths: CrewPaths, entry: DecisionEntry): void {
  const { register } = load(paths);
  register.entries.push(entry);
  writeProtectedJson(paths, registerPath(paths), register);
}

export function decisionsCount(paths: CrewPaths): number {
  return load(paths).register.entries.length;
}

/** Newest first; with `grep`, the entries whose id, text or answer carry it (case-insensitive). */
export function listDecisions(paths: CrewPaths, grep?: string): DecisionEntry[] {
  const entries = [...load(paths).register.entries].reverse();
  if (!grep) return entries;
  const needle = grep.toLowerCase();
  return entries.filter((e) =>
    `${e.id ?? ""} ${e.text} ${e.answer ?? ""}`.toLowerCase().includes(needle),
  );
}

/** Whether the register was changed outside the engine (`crew accept decisions` trusts it again). */
export function registerTampered(paths: CrewPaths): boolean {
  return load(paths).tampered;
}

/** "2026-10-17 · <item> · <kind> · <id> <text> → <answer> (by <who>)" */
export function decisionLine(e: DecisionEntry): string {
  const head = `${e.at.slice(0, 10)} · ${e.item} · ${e.kind} · ${e.id ? `${e.id} ` : ""}${e.text}`;
  return `${head}${e.answer ? ` → ${e.answer}` : ""} (by ${e.by})`;
}
