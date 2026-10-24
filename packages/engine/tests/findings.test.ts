import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const FINDINGS = fileURLToPath(new URL("../../../docs/real-use/findings.md", import.meta.url));

/**
 * The findings whose record still reads open, by the last clause of their `- Outcome:` line (the
 * text after its final `;`, the whole line when it has none): one that starts with open, deferred
 * or waits, or ends with "Open.". Earlier clauses are history and are not read.
 */
function openFindings(text: string): number[] {
  const open: number[] = [];
  const sections = text.split(/\n(?=### \d+\. )/);
  for (const section of sections) {
    const n = /^### (\d+)\. /.exec(section)?.[1];
    if (!n) continue;
    const line = /\n- Outcome:(.*)/.exec(section)?.[1] ?? "";
    const last = (line.split(";").at(-1) ?? "").trim();
    if (/^(?:open|deferred|waits)\b/i.test(last) || /\bOpen\.$/.test(last)) open.push(Number(n));
  }
  return open;
}

// What this release leaves open, each with its reason: the eval sandbox's three (64, 77, 95), the
// packs' re-verification (112) and the red that ran no test (153), all for the next item of the
// consolidation; and the PowerShell layer, which waits for Windows users' issues (114, the user's
// decision of 2026-10-24).
const OPEN = [64, 77, 95, 112, 114, 153];

test("AC-9 (consolidation of 2026-10-24): the findings that read open are the named ones, and the thirteen closed by the consolidation read closed", () => {
  const open = openFindings(readFileSync(FINDINGS, "utf8"));
  expect(open).toEqual(OPEN);
  for (const n of [3, 11, 15, 17, 28, 40, 47, 49, 60, 71, 113, 140, 142])
    expect(open, String(n)).not.toContain(n);
});
