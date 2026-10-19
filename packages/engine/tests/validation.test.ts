import { expect, test } from "bun:test";
import { parseValidation, validationHash } from "../src/validation.ts";

const VALIDATED = `# qa lead's validation of w1: spec
verdict: validated
## Returns
- none
## Notes
- AC-1 to AC-3 are observable and the test gate covers them (spec.md:12-18).
`;
const RETURNED = `# qa lead's validation of w1: spec
verdict: returned
## Returns
- R-1 · spec.md:14 · AC-2 names no observable result: "the page is faster" has no number; give the budget in ms and the page.
- R-2 · spec.md:22 · the Design says the test runs in the browser but no environment is described in the profile.
## Notes
- none
`;

test("SP7a AC-1: a lead's validation is parsed from its verdict line and its returns; a contradiction is refused", () => {
  expect(parseValidation(VALIDATED)).toEqual({ verdict: "validated", returns: 0 });
  expect(parseValidation(RETURNED)).toEqual({ verdict: "returned", returns: 2 });
  expect(parseValidation(VALIDATED.replace("- none", "- R-1 · spec.md:3 · a return"))).toEqual({
    refused:
      "validated with 1 open return under ## Returns: the lead returns the spec, or closes the return in its file; the engine records neither as validated",
  });
  expect(parseValidation(RETURNED.replace(/- R-\d[^\n]*\n/g, ""))).toEqual({
    refused:
      "returned with no return under ## Returns: a return names what must change at a file and a line",
  });
  expect(parseValidation("hello")).toEqual({
    refused: "no verdict line: the second line is `verdict: validated` or `verdict: returned`",
  });
  // A personality header before the verdict line is allowed: the verdict is read in the first four lines.
  expect(
    parseValidation(VALIDATED.replace("\nverdict:", "\npersonality: professional\nverdict:")),
  ).toEqual({
    verdict: "validated",
    returns: 0,
  });
});

test("SP7a AC-1: a validation is hashed to what it is about: the spec or plan text, or the delivery's evidence fingerprint", () => {
  expect(validationHash("spec", "# spec\n", null, "sha256:abc")).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(validationHash("spec", "# spec\n", null, "x")).toBe(
    validationHash("spec", "# spec\n", null, "y"),
  );
  expect(validationHash("spec", "# spec\n", null, "x")).not.toBe(
    validationHash("spec", "# spec v2\n", null, "x"),
  );
  expect(validationHash("plan", null, "# plan\n", "x")).toBe(
    validationHash("plan", "other", "# plan\n", "y"),
  );
  expect(validationHash("delivery", "# spec\n", null, "sha256:abc")).toBe("sha256:abc");
});

test("SP3-T1 AC-4 (finding 78): a file holding several validation blocks (a resumed lead's rounds) is parsed from its last block", () => {
  expect(parseValidation(`${RETURNED}\n${VALIDATED}`)).toEqual({
    verdict: "validated",
    returns: 0,
  });
  expect(parseValidation(`${VALIDATED}\n${RETURNED}`)).toEqual({ verdict: "returned", returns: 2 });
});
