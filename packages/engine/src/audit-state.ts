/**
 * An audit's records as they stand (SP7 §7.5, SP8 Task 5): the run and whether it is at HEAD,
 * the findings files and their counts, the report and whether it is current against its inputs,
 * the signature. Read by the verdict, the status and the report; written by nothing here.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { AuditRuns } from "./audit-run.ts";
import { gitHead } from "./fingerprint.ts";
import { readJson, readText } from "./fs.ts";
import { type CrewPaths, workDir } from "./paths.ts";
import type { Approval, WorkItem } from "./types.ts";

/** The sections of the report that hold findings, in the order the report lists them. */
export const AUDIT_SECTIONS = [
  "business",
  "security",
  "architecture",
  "code-quality",
  "test-quality",
  "data",
  "infra",
] as const;
export type AuditSection = (typeof AUDIT_SECTIONS)[number];

/** What the report reads, and so what its hash covers; a missing file hashes as its name and "missing". */
export const REPORT_INPUT_FILES: readonly string[] = [
  ...AUDIT_SECTIONS.map((s) => `${s}.findings.md`),
  "dependencies.findings.md",
  "runs.json",
  "summary.md",
  "recommendations.md",
];

export type AuditVerdictWord = "critical" | "attention" | "sound";

export interface LeftOut {
  section: string;
  id: string;
  why: string;
}

export interface ReportSignature {
  at: string;
  by: string;
  relayed: boolean;
}

/** `audit/report.json`, engine-owned: what was rendered, from what, and whether a person signed. */
export interface ReportRecord {
  at: string;
  hash: string;
  md: string;
  html: string;
  pdf: string | null;
  pdfReason: string | null;
  leftOut: LeftOut[];
  counts: Record<string, { defects: number; advisories: number }>;
  verdict: AuditVerdictWord;
  signed: ReportSignature | null;
}

export interface AuditState {
  run: AuditRuns | null;
  runAtHead: boolean;
  findings: Record<string, number>;
  report: ReportRecord | null;
  reportCurrent: boolean;
  signed: Approval | null;
}

/** The hash over the report's inputs as they are now. */
export function reportHash(auditDir: string): string {
  const hash = createHash("sha256");
  for (const name of REPORT_INPUT_FILES) {
    const text = readText(join(auditDir, name));
    hash.update(`${name}\n${text ?? "missing"}\n---\n`);
  }
  return hash.digest("hex");
}

const FINDING_LINE = /^- F-\d+ · (?:defect|advisory) · /gm;

export function auditState(paths: CrewPaths, work: WorkItem): AuditState {
  const dir = join(workDir(paths, work.id), "audit");
  const run = readJson<AuditRuns>(join(dir, "runs.json"));
  const head = gitHead(paths.root);
  const runAtHead = run !== null && (run.head === null ? head === "none" : run.head === head);
  const findings: Record<string, number> = {};
  for (const section of AUDIT_SECTIONS) {
    const text = readText(join(dir, `${section}.findings.md`));
    if (text !== null) findings[section] = (text.match(FINDING_LINE) ?? []).length;
  }
  const report = readJson<ReportRecord>(join(dir, "report.json"));
  const reportCurrent = report !== null && report.hash === reportHash(dir);
  const signed = work.approvals.find((a) => a.what === "audit") ?? null;
  return { run, runAtHead, findings, report, reportCurrent, signed };
}
