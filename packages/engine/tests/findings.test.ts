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
// 228 (a commit's detached maintenance repacking a fixture under the next git command) fixed by 2026-11-10-003,
// which recorded 235 (a test-first run of the suite is cut at the target's ten minutes).
// 235 fixed by 2026-11-11-001, which settled eight of 233's ten advisories.
// 233 fixed by 2026-11-11-002 with the user's two decisions (the class of a not-judged cause; a run not ruled named for a person).
// 236 (a document reviewer's whole answer refused for one off-shape line) and 237 (what 2026-11-11-002's delivery left) recorded by 2026-11-11-003,
// with 238 (the mail lock row's one failure in a whole-suite run).
// 238 fixed by 2026-11-11-004 (a read of a box with no lock between a writer's two writes), which recorded 239 (the same window in the repository's own store).
// 239 fixed by 2026-11-11-005 (the store's write under its lock over the file and its hash, a read confirmed under it).
// 182 (crew decision add took none as a question) and 216 (crew status printed no continuation) fixed by 2026-11-12-003,
// the first item of the consolidation the user approved on 2026-11-12 from the inventory of the eighteen open findings.
// 209 (Proven on a route with leads before a lead read anything) fixed by 2026-11-12-004, which recorded 241
// (what the leads of 2026-11-12-003 left on the continuations line) and 242 (crew validation record takes a
// lead's file no role filed), both for the next item of the consolidation.
const OPEN = [77, 114, 177, 178, 181, 183, 206, 210, 212, 213, 214, 215, 221, 222, 224, 241, 242];

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

test("2026-11-10-001 AC-5: finding 220 reads fixed by the item with its cause and what the word rests on, and 233 and 234 are recorded", () => {
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

test("2026-11-10-003 AC-7: finding 228 reads fixed by the item, with the maintenance a commit starts as its cause and the note that ruled it out corrected", () => {
  const text = readFileSync(FINDINGS, "utf8");
  const sectionOf = (n: number) =>
    text.split(/\n(?=### \d+\. )/).find((s) => s.startsWith(`### ${n}. `)) ?? "";
  const outcomeOf = (n: number) => /\n- Outcome:(.*)/.exec(sectionOf(n))?.[1]?.trim() ?? "";
  expect(outcomeOf(228)).toStartWith("fixed in 2026-11-10-003");
  // The cause and the measures it rests on.
  expect(outcomeOf(228)).toContain("git maintenance run --auto");
  expect(outcomeOf(228)).toContain("objects/17");
  expect(outcomeOf(228)).toContain("one commit in 256");
  expect(outcomeOf(228)).toContain("GIT_CONFIG_PARAMETERS");
  expect(sectionOf(228)).toContain("46 `git repack -d -l` among 11172");
  // The note of 2026-11-10 measured the 255 cases: the record says so where the note stands.
  expect(sectionOf(228)).toContain("Corrected on 2026-11-11");
  expect(openFindings(text)).not.toContain(228);
  expect(sectionOf(235)).toContain("2026-11-10-003");
  expect(sectionOf(235)).toContain("tdd.ts");
});

test("2026-11-11-001 AC-10: finding 235 reads fixed by the item, and 233 marks each of its ten advisories taken, refused with a reason or waiting for the user's decision", () => {
  const text = readFileSync(FINDINGS, "utf8");
  const sectionOf = (n: number) =>
    text.split(/\n(?=### \d+\. )/).find((s) => s.startsWith(`### ${n}. `)) ?? "";
  const outcomeOf = (n: number) => /\n- Outcome:(.*)/.exec(sectionOf(n))?.[1]?.trim() ?? "";
  expect(outcomeOf(235)).toStartWith("fixed in 2026-11-11-001");
  expect(outcomeOf(235)).toContain("gateTimeoutMs");
  const settled =
    sectionOf(233)
      .split("\n")
      .find((line) => line.startsWith("- Settled on 2026-11-11 by item `2026-11-11-001`")) ?? "";
  const [first = "", second = ""] = settled.split(" Second batch: ");
  const marks = (batch: string) =>
    [...batch.matchAll(/\((\d)\) (taken|refused|waits for the user's decision)/g)].map(
      (m) => `${m[1]} ${m[2]}`,
    );
  expect(first).toContain("First batch: ");
  expect(marks(first)).toEqual([
    "1 taken",
    "2 taken",
    "3 waits for the user's decision",
    "4 waits for the user's decision",
    "5 refused",
  ]);
  expect(marks(second)).toEqual(["1 taken", "2 taken", "3 taken", "4 refused", "5 refused"]);
  // Each refusal carries its reason.
  expect([...settled.matchAll(/refused: /g)].length).toBe(3);
  expect(outcomeOf(233)).toContain("2026-11-11-001");
  expect(openFindings(text)).not.toContain(235);
});

test("2026-11-11-002 AC-33: finding 233 reads fixed by the item with what was done with the decisions and the advisories, the loop's README names the class words and the hand adoption with its preconditions, and ADR 0024 records the decision and what was weighed", () => {
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(`../../../${rel}`, import.meta.url)), "utf8");
  const text = readFileSync(FINDINGS, "utf8");
  const section = text.split(/\n(?=### \d+\. )/).find((s) => s.startsWith("### 233. ")) ?? "";
  const outcome = /\n- Outcome:(.*)/.exec(section)?.[1]?.trim() ?? "";
  expect(outcome).toStartWith("fixed in 2026-11-11-002");
  expect(outcome).toContain("2026-11-11-001");
  expect(openFindings(text)).not.toContain(233);
  const closed =
    section
      .split("\n")
      .find((l) => l.startsWith("- Closed on 2026-11-11 by item `2026-11-11-002`")) ?? "";
  for (const said of [
    "D-1",
    "`limited`, `overloaded`, `failed`",
    "D-2",
    "D-3",
    "28 of the last 30 days",
    "(a) taken",
    "(b) taken",
    "(c) refused: ",
    "(d) taken in part",
  ])
    expect(closed, said).toContain(said);
  const readme = read("docs/improve/README.md");
  for (const said of [
    '"unjudged": "limited"',
    "`overloaded`",
    "`failed`",
    "## Adopting a kept run by hand",
    "bun scripts/improve-loop.ts stop",
    "no pending release",
    "outside `docs/`",
    "measured on Claude models",
    "git push origin --delete",
    "bun scripts/improve-loop.ts resume",
  ])
    expect(readme, said).toContain(said);
  // The preconditions sit inside the section, before its steps.
  const hand = readme.slice(readme.indexOf("## Adopting a kept run by hand"));
  expect(hand.indexOf("bun scripts/improve-loop.ts stop")).toBeLessThan(
    hand.indexOf("bun scripts/release.ts --patch"),
  );
  const adr = read("docs/adr/0024-a-run-not-ruled-is-named-for-a-person.md");
  for (const said of [
    "ADR 0015",
    "decision 3",
    "second offer",
    "28 of the last 30 days",
    "adopt it by hand",
    "not Claude models",
  ])
    expect(adr, said).toContain(said);
});

/** A finding's section of the record, from its heading to the next one; empty when it is not there. */
const sectionIn = (text: string, n: number): string =>
  text.split(/\n(?=### \d+\. )/).find((s) => s.startsWith(`### ${n}. `)) ?? "";

test("2026-11-11-003 AC-1: findings 236 and 237 are recorded with their date, what happened, what is expected and an outcome that reads open", () => {
  const text = readFileSync(FINDINGS, "utf8");
  for (const n of [236, 237]) {
    const section = sectionIn(text, n);
    expect(section, String(n)).toContain("- Date: 2026-11-11.");
    // Each part holds text of its own, not its label alone.
    for (const part of ["What happened", "Expected", "Evidence", "Outcome"])
      expect(section, `${n} ${part}`).toMatch(new RegExp(`\\n- ${part}: \\S.{20,}`));
    expect(section, String(n)).toContain("2026-11-11-002");
    // Whether the two read open is the row of 2026-11-12-001 AC-11's to say: an outcome changes, the sections' parts do not.
  }
  expect(sectionIn(text, 236)).toContain("parseSpecAnswer");
  expect(sectionIn(text, 236)).toContain("packages/engine/src/spec-review.ts");
  expect(sectionIn(text, 237)).toContain("crew tdd green");
  expect(sectionIn(text, 237)).toContain("docs/improve/README.md");
});

test("2026-11-11-003 AC-2: finding 238 records the one failure of the mail lock row with its words, the run it failed in and the runs it passed in", () => {
  const text = readFileSync(FINDINGS, "utf8");
  const section = sectionIn(text, 238);
  for (const said of [
    "- Date: 2026-11-11.",
    "SP2c AC-6",
    "mail.test.ts",
    "crm's inbox changed outside the engine",
    "logs/tdd-AC-13-green-1794413833550.txt",
    "passed in the four gate runs",
    "Finding 168",
    "- Expected:",
  ])
    expect(section, said).toContain(said);
  // Whether 238 reads open or fixed is not this row's to say: the row of the item that fixed it asserts the outcome.
});

test("2026-11-11-004 AC-4: finding 238 reads fixed with its cause and the measure, and finding 239 records the same window in the repository's own store", () => {
  const text = readFileSync(FINDINGS, "utf8");
  const outcomeOf = (n: number) => /\n- Outcome:(.*)/.exec(sectionIn(text, n))?.[1]?.trim() ?? "";
  expect(outcomeOf(238)).toStartWith("fixed in 2026-11-11-004");
  for (const said of [
    "no lock",
    "its hash",
    "readBoxHeld",
    "five",
    "10 800",
    "probes/window.md",
    "probes/after.md",
  ])
    expect(outcomeOf(238), said).toContain(said);
  expect(openFindings(text)).not.toContain(238);
  const store = sectionIn(text, 239);
  for (const said of [
    "- Date: 2026-11-11.",
    "2026-11-11-004",
    "state changed outside the engine",
    "writeProtectedText",
    "packages/engine/src/store.ts",
    "- Expected:",
  ])
    expect(store, said).toContain(said);
  expect(store).toMatch(/\n- What happened: \S.{20,}/);
  // Whether 239 reads open or fixed is the row's of the item that fixed it.
});

test("2026-11-11-005 AC-6: finding 239 reads fixed with its two causes, the measures before and after, and what is not fixed", () => {
  const text = readFileSync(FINDINGS, "utf8");
  const outcome = /\n- Outcome:(.*)/.exec(sectionIn(text, 239))?.[1]?.trim() ?? "";
  expect(outcome).toStartWith("fixed in 2026-11-11-005");
  for (const said of [
    // the two causes
    "between its two writes",
    "crossed",
    // the measures
    "3778 of 8000",
    "one run of eight",
    "none in 18 000",
    "probes/window.md",
    "probes/after.md",
    // the fix
    "writeProtectedText",
    "readUnderLock",
    "breakStale",
    // what is not fixed
    "older engine",
    "crew accept",
  ])
    expect(outcome, said).toContain(said);
  expect(openFindings(text)).not.toContain(239);
});

test("2026-11-12-001 AC-16: the hand adoption reads the patch, checks origin's commit against adoption/commit, merges that commit, then releases, and its last two steps stay", () => {
  const readme = readFileSync(
    fileURLToPath(new URL("../../../docs/improve/README.md", import.meta.url)),
    "utf8",
  );
  const hand = readme.slice(readme.indexOf("## Adopting a kept run by hand"));
  const steps = hand.slice(hand.indexOf("\nThen:"));
  const order = [
    "1. Read `adoption/gate.md` and `adoption/diff.patch`",
    "2. Check that origin's branch is still the commit you read",
    "`git rev-parse origin/<branch>`",
    "`adoption/commit`",
    "3. On a main brought to origin's",
    "`git merge --no-ff <commit>`",
    "4. Release: `bun scripts/release.ts --patch",
    "5. ",
    "git push origin --delete",
    "6. ",
    "bun scripts/improve-loop.ts resume",
  ];
  let at = -1;
  for (const said of order) {
    const next = steps.indexOf(said, at + 1);
    expect(next, said).toBeGreaterThan(at);
    at = next;
  }
  // The merge takes the commit that was checked, never the branch's name.
  expect(steps).not.toContain("git merge --no-ff origin/<branch>");
});

test("2026-11-12-001 AC-11: findings 236 and 237 read fixed, with what was done for each point and under which decision, and point (5) said to stay", () => {
  const text = readFileSync(FINDINGS, "utf8");
  const outcome = (n: number) =>
    sectionIn(text, n)
      .split("\n")
      .find((l) => l.startsWith("- Outcome: ")) ?? "";
  for (const n of [236, 237]) {
    expect(outcome(n), String(n)).toStartWith("- Outcome: fixed in 2026-11-12-001");
    expect(openFindings(text)).not.toContain(n);
    expect(outcome(n), String(n)).toContain("Recorded by `2026-11-11-003`.");
  }
  for (const said of [
    "D-1",
    "`not given`",
    "joins that finding",
    "names each such line by its number and its text",
    "`settled`",
    "seven reviewers",
  ])
    expect(outcome(236), said).toContain(said);
  for (const said of [
    "(1)",
    "D-2",
    "the command its red ran",
    "(2)",
    "D-3",
    "`--supersedes D-n`",
    "(3)",
    "`adoption/commit`",
    "(4)",
    "`keptNote`",
    "(5) stays as recorded",
  ])
    expect(outcome(237), said).toContain(said);
});

test("2026-11-12-002 AC-3: finding 240 is recorded with its four points and reads fixed, each point with what was done or why nothing was", () => {
  const text = readFileSync(FINDINGS, "utf8");
  const section = sectionIn(text, 240);
  expect(section).toContain("- Date: 2026-11-12.");
  expect(section).toContain("2026-11-12-001");
  for (const part of ["What happened", "Expected", "Evidence", "Outcome"])
    expect(section, part).toMatch(new RegExp(`\\n- ${part}: \\S.{20,}`));
  const happened = section.split("\n").find((l) => l.startsWith("- What happened: ")) ?? "";
  for (const point of ["(1)", "(2)", "(3)", "(4)"]) expect(happened, point).toContain(point);
  const outcome = section.split("\n").find((l) => l.startsWith("- Outcome: ")) ?? "";
  expect(outcome).toStartWith("- Outcome: fixed in 2026-11-12-002");
  // The parser reads the words after the last semicolon: the outcome holds none.
  expect(outcome).not.toContain(";");
  expect(openFindings(text)).not.toContain(240);
  for (const said of [
    // (1) one commit, read before the gate.
    "(1)",
    "`adoption/commit`",
    "before its gate",
    "does not resolve to a commit",
    // (2) the rule by class, and the limit it has by its own definition.
    "(2)",
    "every leading character that is not a letter",
    "refuses the answer",
    "a line whose first word is another word",
    "`- Finding F-2 · …`",
    // (3) nothing to tell apart, no word lost, and what the settled guard sees.
    "(3)",
    "the shape of a line of four fields",
    "no word is lost",
    "scope is the text's first words and not `not given`",
    "`settled` still needs an equal scope on an earlier closed finding",
    // (4) the closed item's text stands.
    "(4)",
    "seven reviewers",
    "stays as answered",
  ])
    expect(outcome, said).toContain(said);
});

test("2026-11-12-003 AC-5: findings 182 and 216 read fixed by the item, each naming what the engine now does", () => {
  const text = readFileSync(FINDINGS, "utf8");
  const sectionOf = (n: number) =>
    text.split(/\n(?=### \d+\. )/).find((s) => s.startsWith(`### ${n}. `)) ?? "";
  const outcomeOf = (n: number) => /\n- Outcome:(.*)/.exec(sectionOf(n))?.[1]?.trim() ?? "";
  expect(outcomeOf(182)).toStartWith("fixed in 2026-11-12-003");
  expect(outcomeOf(182)).toContain("refuses");
  expect(outcomeOf(216)).toStartWith("fixed in 2026-11-12-003");
  expect(outcomeOf(216)).toContain("`continuations`");
  expect(openFindings(text)).not.toContain(182);
  expect(openFindings(text)).not.toContain(216);
});

test("2026-11-12-004 AC-12: finding 209 reads fixed by the item, and findings 241 and 242 are recorded open", () => {
  const text = readFileSync(FINDINGS, "utf8");
  const sectionOf = (n: number) =>
    text.split(/\n(?=### \d+\. )/).find((s) => s.startsWith(`### ${n}. `)) ?? "";
  const outcomeOf = (n: number) => /\n- Outcome:(.*)/.exec(sectionOf(n))?.[1]?.trim() ?? "";
  expect(outcomeOf(209)).toStartWith("fixed in 2026-11-12-004");
  expect(outcomeOf(209)).toContain("`leadsMissing`");
  expect(openFindings(text)).not.toContain(209);
  expect(sectionOf(241)).toContain("2026-11-12-003");
  expect(sectionOf(242)).toContain("`crew validation record`");
  expect(openFindings(text)).toContain(241);
  expect(openFindings(text)).toContain(242);
});
