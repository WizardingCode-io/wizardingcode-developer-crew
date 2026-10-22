import { createHash } from "node:crypto";
import type { Seat, Validation, WorkItem } from "./types.ts";
import type { GuardContext } from "./work.ts";

/** The teams a tech lead answers for, as its first line names them (`# <team> lead's validation of <id>: <what>`); the hook and the parser read the same list. */
export const LEAD_TEAMS = "qa|security|architects|etl|devops";
/** The opening of a lead's heading line, before the item and the subject. */
const LEAD_OPENING = `# (${LEAD_TEAMS}) lead's validation of `;
/** Where a lead's answer starts: a split point, the line kept with its block. */
const LEAD_HEADING = new RegExp(`^(?=${LEAD_OPENING})`, "m");
/** A lead's heading line, its team, item and subject captured: the record's and the hook's one pattern (item D). */
export const LEAD_LINE = `^${LEAD_OPENING}(\\S+): (spec|plan|delivery)\\b`;

/**
 * The team, the item and the subject the last lead heading of a file names: the heading of the
 * block `parseValidation` reads the verdict from (item D, finding 132). Null when the file has none.
 */
export function leadHeading(
  text: string,
): { team: string; item: string; what: "spec" | "plan" | "delivery" } | null {
  const last = [...text.matchAll(new RegExp(LEAD_LINE, "gm"))].pop();
  if (!last) return null;
  return {
    team: last[1] as string,
    item: last[2] as string,
    what: last[3] as "spec" | "plan" | "delivery",
  };
}

/**
 * The verdict line and the returns of a lead's file (SP7 §6.4): `verdict: validated|returned` in the
 * first four lines (a personality header may precede it), the `- R-n ·` lines under `## Returns`.
 * A verdict its returns contradict is refused (rule 14): the engine records what the file shows.
 */
export function parseValidation(
  text: string,
): { verdict: "validated" | "returned"; returns: number } | { refused: string } {
  // A resumed lead's reply file holds its rounds one after the other (finding 78): the last block,
  // headed by the lead's own first line, is the verdict; a file with no such line is read whole.
  const blocks = text.split(LEAD_HEADING);
  const lines = (blocks.length > 1 ? (blocks[blocks.length - 1] ?? text) : text).split("\n");
  const verdictLine = lines
    .slice(0, 4)
    .find((l) => /^verdict:\s*(validated|returned)\s*$/.test(l.trim()));
  if (!verdictLine)
    return {
      refused: "no verdict line: the second line is `verdict: validated` or `verdict: returned`",
    };
  const verdict = verdictLine.trim().endsWith("validated") ? "validated" : "returned";
  const start = lines.findIndex((l) => l.trim() === "## Returns");
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  const section = start === -1 ? [] : lines.slice(start + 1, end === -1 ? undefined : end);
  const returns = section.filter((l) => /^- R-\d+\s*·/.test(l.trim())).length;
  if (verdict === "validated" && returns > 0)
    return {
      refused: `validated with ${returns} open return${returns === 1 ? "" : "s"} under ## Returns: the lead returns the spec, or closes the return in its file; the engine records neither as validated`,
    };
  if (verdict === "returned" && returns === 0)
    return {
      refused:
        "returned with no return under ## Returns: a return names what must change at a file and a line",
    };
  return { verdict, returns };
}

/**
 * The sha256 of a lead's file as read, kept on its validation record (finding 119): a file whose
 * content the record already holds for that lead is an earlier round's answer, not a new one.
 */
export function fileHash(text: string): string {
  return `sha256:${createHash("sha256").update(text).digest("hex")}`;
}

/**
 * What a lead's file name carries for its subject: nothing for the spec, `.plan` for a plan
 * (finding 53, so a plan's validation never lands on the spec's file), `.delivery` for a delivery.
 */
export function leadSuffix(what: string): string {
  return what === "plan" || what === "delivery" ? `.${what}` : "";
}

/**
 * The file a resumed role's answer lands in (SP3-T1, finding 78): the role's own reply file, a
 * lead's by its team with its subject's suffix (`leadSuffix`), any other role's by its name. One
 * spelling for the hook that writes it and the command that names it.
 */
export function replyFile(name: string, what: string): string {
  return `conclave/${name}${leadSuffix(what)}-reply.md`;
}

/** What a validation is about: the spec's text, the plan's text, or the evidence fingerprint of a delivery. */
export function validationHash(
  what: Validation["what"],
  specText: string | null,
  planText: string | null,
  evidenceFingerprint: string,
): string {
  if (what === "delivery") return evidenceFingerprint;
  const text = what === "spec" ? specText : planText;
  return `sha256:${createHash("sha256")
    .update(text ?? "")
    .digest("hex")}`;
}

/**
 * The round a lead's record counts in, one counter per subject (findings 27, 106). A spec round is
 * counted per lead and per revision that lead read: a lead's first record is its round 1, a record
 * on the hash of its last record keeps that round, any other hash opens the lead's next one; it is
 * a new round of the item past the rounds already spent (`spentSpecRounds`), so a spec revised
 * between one lead's record and another lead's first never costs a round. The plan's and the
 * delivery's records carry their own count by hash and spend no round (the gate rounds bound a
 * delivery): a hash other than the last record's opens the next.
 */
export function validationRound(
  validations: readonly Validation[],
  what: Validation["what"],
  by: string,
  hash: string,
  spentSpecRounds: number,
): { round: number; newRound: boolean } {
  const same = validations.filter((v) => v.what === what);
  if (what === "spec") {
    const lastMine = same.filter((v) => v.by === by).at(-1);
    const round = !lastMine ? 1 : lastMine.hash === hash ? lastMine.round : lastMine.round + 1;
    return { round, newRound: round > spentSpecRounds };
  }
  const last = same.at(-1);
  const newRound = !last || last.hash !== hash;
  return { round: newRound ? (last?.round ?? 0) + 1 : (last?.round ?? 1), newRound };
}

/** The lead seats of the item, from its recorded seats. */
export function leadSeats(work: WorkItem): Seat[] {
  return (work.seats ?? []).filter((s) => s.kind === "lead");
}

/**
 * The guard's lines for a validation the leads must give (SP7 §6.4): one per lead seat without a
 * current `validated` for `what`; a `returned` says how many returns; a verdict on other content is
 * stale. On the fast route, or with no lead seated, nothing is asked.
 */
export function leadsMissing(
  work: WorkItem,
  ctx: GuardContext,
  what: "spec" | "delivery",
): string[] {
  if (work.route === "fast") return [];
  const hash = validationHash(what, ctx.specText, null, ctx.evidence?.fingerprint ?? "");
  const missing: string[] = [];
  for (const seat of leadSeats(work)) {
    const mine = (work.validations ?? []).filter((v) => v.what === what && v.by === seat.role);
    const latest = mine[mine.length - 1];
    const file = `conclave/${seat.role}${what === "delivery" ? ".delivery" : ""}.md`;
    if (!latest) {
      missing.push(
        `validation of ${what} by ${seat.role} (crew validation <id> record --what ${what} --by ${seat.role} --file ${file})`,
      );
    } else if (latest.hash !== hash) {
      missing.push(
        `validation of ${what} by ${seat.role}: stale (${what === "spec" ? "spec" : "the evidence"} changed); record the lead again`,
      );
    } else if (latest.verdict === "returned") {
      missing.push(
        `validation of ${what} by ${seat.role}: returned ${latest.returns} return${latest.returns === 1 ? "" : "s"} (${latest.file}); revise the ${what === "spec" ? "spec" : "delivery"} and record the lead again (a resumed lead's answer: its -reply.md file)`,
      );
    }
  }
  return missing;
}
