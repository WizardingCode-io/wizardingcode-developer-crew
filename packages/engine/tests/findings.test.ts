import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FINDINGS = fileURLToPath(new URL("../../../docs/real-use/findings.md", import.meta.url));

/**
 * The findings whose record still reads open, by the last clause of their `- Outcome:` line (the
 * text after its final `;`, the whole line when it has none): one that starts with open, deferred,
 * waits or measured (an eval's measure states no outcome), or ends with "Open.". Earlier clauses
 * are history and are not read.
 */
function openFindings(text: string): number[] {
  const open: number[] = [];
  const sections = text.split(/\n(?=### \d+\. )/);
  for (const section of sections) {
    const n = /^### (\d+)\. /.exec(section)?.[1];
    if (!n) continue;
    const line = /\n- Outcome:(.*)/.exec(section)?.[1] ?? "";
    const last = (line.split(";").at(-1) ?? "").trim();
    if (/^(?:open|deferred|waits|measured)\b/i.test(last) || /\bOpen\.$/.test(last))
      open.push(Number(n));
  }
  return open;
}

// What this release leaves open, each with its reason: git inside the eval kit's sandbox on macOS,
// which waits for the upstream fix (77, measured by docs/evals/2026-10-24-sandbox-probe.md), and the
// PowerShell layer, which waits for Windows users' issues (114, the user's decision of 2026-10-24).
// After 0.15.0: 163 and 164 closed by 2026-10-25-005 and 2026-10-25-004; the mailbox lock's
// two-writer test flaky under load (168), for the item after 2026-10-25-007. After 0.15.1: 174 (the tick's
// own lessons made the next tick due) closed by 2026-10-26-003, 175 (the eval kit's kept sandboxes) and
// 176 (the real deps' empty temporary folder) closed by 2026-10-26-005; 177 holds the advisories that
// item's round 2 left (the default temp roots untested, the guards without a failing case), for the next
// touch of those files.
// 178 holds the advisories SP9 Task 2's batched round left (2026-10-26-009).
// 179 (the preserve pair's history, its counts and the one-command rule) closed by 2026-10-27-001.
// 180 (the personal-data scan reading a moved line of the bundle) closed by 2026-10-27-002; 181 holds
// the advisories 2026-10-27-001's round 2 left (recordTdd's guards, the command in a message, the
// pytest pattern's bound), for the next touch of tdd.ts.
// 182 (crew decision add accepts `none`, the gap round's word, as a question) recorded open by SP9 Task 10
// (2026-10-27-005) from the seat case's first run, for the next touch of the decision command; 183 (a role
// wait lets the turn end where nobody watches, so a single-turn session ends with the roles unanswered)
// recorded open by the same item from the seat case's third run, for the next touch of the Stop hook.
// 184 (the six advisories of 2026-10-27-005 and -006), 185 (rule 17 refusing crew learn on a hub file) and
// 186 (the gate run saving the work it loaded at its start) closed by 2026-10-27-008; 187 (the loop has no
// stop or pause command) and 188 (a pushed fix enters the loop one tick late) recorded open by the same item
// for the loop's own item.
const OPEN = [77, 114, 177, 178, 181, 182, 183, 187, 188];

test("AC-9 (consolidation of 2026-10-24): the findings that read open are the named ones, and the thirteen closed by the consolidation read closed", () => {
  const open = openFindings(readFileSync(FINDINGS, "utf8"));
  expect(open).toEqual(OPEN);
  for (const n of [3, 11, 15, 17, 28, 40, 47, 49, 60, 71, 113, 140, 142])
    expect(open, String(n)).not.toContain(n);
});

test("AC-23 (the QA lead's delivery return R-1): a last clause that starts with measured reads as not closed, so an eval's measure never closes a finding by omission", () => {
  const record = (outcome: string) => `### 9. A finding\n- Date: x.\n- Outcome: ${outcome}\n`;
  expect(openFindings(record("closed in x; measured by the eval run: 0.80."))).toEqual([9]);
  expect(openFindings(record("measured by the eval run; closed: the briefs are there."))).toEqual(
    [],
  );
  // The findings the consolidation's last item and its eval run touched end in a stated outcome.
  const text = readFileSync(FINDINGS, "utf8");
  for (const n of [61, 62, 64, 77, 95, 112, 149, 153, 154, 155, 156, 157, 158, 159]) {
    const section = text.split(/\n(?=### \d+\. )/).find((s) => s.startsWith(`### ${n}. `)) ?? "";
    const line = /\n- Outcome:(.*)/.exec(section)?.[1] ?? "";
    expect((line.split(";").at(-1) ?? "").trim(), String(n)).toMatch(/^(?:closed|open|waits)\b/);
  }
});
