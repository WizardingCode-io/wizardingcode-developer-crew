import { expect, test } from "bun:test";
import { hunkLines } from "../src/judgement.ts";

test("SP8-T1 AC-5 (finding 90): hunkLines clips its five-line window to the hunk's own rows, and answers null off the hunk", () => {
  const patch = [
    "diff --git a/src/f.ts b/src/f.ts",
    "--- a/src/f.ts",
    "+++ b/src/f.ts",
    "@@ -1,3 +1,4 @@",
    " a",
    "+b",
    " c",
    " d",
    "",
  ].join("\n");
  expect(hunkLines(patch, "src/f.ts", 2)).toEqual({
    from: 1,
    to: 4,
    text: "1: a\n2: b\n3: c\n4: d",
  });
  expect(hunkLines(patch, "src/f.ts", 9)).toBeNull();
  expect(hunkLines(patch, "src/g.ts", 2)).toBeNull();
});
