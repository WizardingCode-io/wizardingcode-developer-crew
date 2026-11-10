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
// and closed by 2026-10-28-001, which also recorded and closed 189 (a probe set the ceiling could not pay,
// probed until the ceiling and called errored) and 190 (a dead tick leaving no trace).
// 2026-10-28-004 edits this list: findings 191 and 192 closed by it. 194 (a standard-route session wrote
// the gap round without reading a checklist, the engine accepting the four headings) recorded open by
// SP9 Task 13 (2026-10-28-006) from the Blade case's first run, for the next touch of crew pack files.
// 194 to 197 recorded and closed by the same item (the gap round's read, the uncounted note's way, the
// account after a blocked turn end, the unattended case's standing grant).
// 198 (the Stop hook counting a learned item's committed change against the next item) recorded and
// closed by 2026-10-29-001 (AC-1).
// 199 to 205 recorded and closed by 2026-10-30-001; 207 by 2026-10-30-002; 208 by 2026-10-30-004. 206 (four paths
// around the loop's headless shell) recorded, for the next touch of the loop. 209 (Proven on the standard route before the leads) recorded, for the next touch of the verdict.
// 211 recorded and closed by 2026-10-31-002; 212 (a release finds out that its account has no token after the push) recorded, for the next touch of the release script or the loop's probe.
// 213 (a granted command can still write outside the checkout) recorded by 2026-10-31-008, for a sandbox of its own.
// 214 (the document review of a small feature did not converge in four rounds) recorded by 2026-10-31-009, the user's calibration.
// 215 (another plugin's daemon outlives a journey's session) recorded by 2026-10-31-009.
// 216 (a resumed session keeps refusing a round the record grants) recorded by 2026-11-01-002.
// 217 to 219 recorded by the 0.18.1 release and closed by 2026-11-01-003, which recorded 220 (the preserve
// pair's row failing once under the whole suite with its cause lost; the row now names the refusal and the
// tail, for the next occurrence) and 221 (the advisories its judgement's round 3 left), for the next hardening item.
// 222 (a task gate row failing once under the whole suite with its output lost) recorded by 2026-11-02-002.
// 223 (every project asks about the e2e gate on every item) fixed in 2026-11-04-001.
// 224 (no e2e suite, no ui-ux ruling; a hand edit of allowSkips asked): its texts fixed in 2026-11-04-001, the crew's own capture open.
// 225 (a commit with no watched change blocks a no-item turn) fixed in 2026-11-05-001.
// 226 (a release never reaches the runtime adapters of a project) fixed in 2026-11-08-002.
// 227 (the spec review runs to its cap and never converges) fixed in 2026-11-08-001.
// 228 (a release fixture's clone fails once under the whole suite) recorded by 2026-11-08-002.
// 229 (the commit command of refreshed adapters never reaches the person) fixed in 2026-11-09-001.
// 230 (a task's gate run writes no run marker, so the Stop hook holds the turn) and 231 (the advisories the
// judgement left on 2026-11-09-001) closed by 2026-11-09-003, which also recorded and closed 232 (a removal
// deleted the skill folder every runtime shares).
// 208's cause (a grader whose judge call failed scored as failed) answered by 2026-11-09-004, which put the eval judge back on Fable.
// 220 (a child's end lost under the whole suite) fixed by 2026-11-10-001, which recorded 233 (the
// advisories the judgement left on 2026-11-09-004) and 234 (the lock row's 20 seconds of its 30).
// 234 (the fixtures the tests left in the temporary folder) fixed by 2026-11-10-002.
const OPEN = [
  77, 114, 177, 178, 181, 182, 183, 206, 209, 210, 212, 213, 214, 215, 216, 221, 222, 224, 228, 233,
];

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

test("2026-10-28-004 AC-12: finding 193's residual sentence reads closed by the item", () => {
  expect(readFileSync(FINDINGS, "utf8")).toContain(
    "The residual the security lead named at the spec's round 4 (the tests' own child processes) is closed by `2026-10-28-004`",
  );
});

test("2026-10-29-001 AC-12 (the test-quality advisory at round 1): finding 198's outcome names the item and the criterion that closed it", () => {
  const section =
    readFileSync(FINDINGS, "utf8")
      .split(/\n(?=### \d+\. )/)
      .find((s) => s.startsWith("### 198. ")) ?? "";
  expect(section).toContain("- Outcome: closed by `2026-10-29-001` (AC-1)");
});

test("2026-11-09-003 AC-27: findings 230 and 231 read fixed by the item, 231 with its two refusals, and 232 is recorded closed", () => {
  const text = readFileSync(FINDINGS, "utf8");
  const sectionOf = (n: number) =>
    text.split(/\n(?=### \d+\. )/).find((s) => s.startsWith(`### ${n}. `)) ?? "";
  const outcomeOf = (n: number) => /\n- Outcome:(.*)/.exec(sectionOf(n))?.[1]?.trim() ?? "";
  expect(outcomeOf(230)).toStartWith("fixed in 2026-11-09-003");
  expect(outcomeOf(231)).toStartWith("fixed in 2026-11-09-003");
  expect(outcomeOf(231)).toContain("(1) refused");
  expect(outcomeOf(231)).toContain("(b) refused");
  expect(outcomeOf(232)).toStartWith("fixed in 2026-11-09-003");
  expect(openFindings(text)).not.toContain(230);
  expect(openFindings(text)).not.toContain(231);
  expect(openFindings(text)).not.toContain(232);
});

test("2026-11-10-001 AC-5: finding 220 reads fixed by the item with its cause and what the word rests on, and 233 and 234 are recorded open", () => {
  const text = readFileSync(FINDINGS, "utf8");
  const sectionOf = (n: number) =>
    text.split(/\n(?=### \d+\. )/).find((s) => s.startsWith(`### ${n}. `)) ?? "";
  const outcomeOf = (n: number) => /\n- Outcome:(.*)/.exec(sectionOf(n))?.[1]?.trim() ?? "";
  expect(outcomeOf(220)).toStartWith("fixed in 2026-11-10-001");
  // The cause, and the two proofs the word rests on.
  expect(sectionOf(220)).toContain("Twelfth occurrence");
  expect(outcomeOf(220)).toContain("before it returns");
  expect(outcomeOf(220)).toContain("AC-1");
  expect(outcomeOf(220)).toContain("AC-11");
  // AC-12 replaced AC-11: the record names the proof the word rests on now, and where its runs are.
  expect(outcomeOf(220)).toContain("AC-12");
  expect(outcomeOf(220)).toContain("probes/ac11.md");
  expect(openFindings(text)).not.toContain(220);
  expect(sectionOf(233)).toContain("2026-11-09-004");
  expect(sectionOf(233)).toContain("probeJudge");
  expect(sectionOf(234)).toContain("lock.test.ts");
  expect(openFindings(text)).toContain(233);
});

test("2026-11-10-002 AC-6: finding 234 reads fixed by the item, with the fixtures left in the temporary folder as its cause, what was measured and what was inferred, and the limit of the fix", () => {
  const text = readFileSync(FINDINGS, "utf8");
  const section = text.split(/\n(?=### \d+\. )/).find((s) => s.startsWith("### 234. ")) ?? "";
  const outcome = /\n- Outcome:(.*)/.exec(section)?.[1]?.trim() ?? "";
  expect(outcome).toStartWith("fixed in 2026-11-10-002");
  // The cause in place of the machine's load: the folder's size and the measured starts.
  expect(section).toContain("83 807 entries");
  expect(outcome).toContain("mkdtempSync");
  expect(outcome).toContain("beside the system temporary folder");
  expect(outcome).toContain("57 ms");
  // What was measured, what is tied by inference, and where the fix does not reach.
  expect(outcome).toContain("by inference alone");
  expect(outcome).toContain("shared");
  expect(openFindings(text)).not.toContain(234);
});
