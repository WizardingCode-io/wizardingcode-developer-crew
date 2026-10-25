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
// two-writer test flaky under load (168), for the item after 2026-10-25-007.
const OPEN = [77, 114, 168];

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
