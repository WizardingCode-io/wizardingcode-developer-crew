import { expect, test } from "bun:test";
import {
  AnswerError,
  type Answers,
  computeRoute,
  excludedRiskPaths,
  kindOf,
  PRIORITY_LEVELS,
  personalDataTerms,
  riskAreasForPaths,
  validateAnswers,
} from "../src/classify.ts";
import { isTestPath } from "../src/paths-kind.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";

const calm: Answers = {
  work_type: "fix",
  is_vague: 0.1,
  scope: 0,
  touches_auth: 0.05,
  touches_payments: 0,
  touches_personal_data: 0,
  touches_data_migration: 0,
  touches_infra: 0,
  touches_public_api: 0,
};

test("validateAnswers accepts a complete answer set and rejects bad values", () => {
  expect(validateAnswers(calm)).toEqual(calm);
  expect(() => validateAnswers({ ...calm, work_type: "bug" })).toThrow(AnswerError);
  expect(() => validateAnswers({ ...calm, scope: 7 })).toThrow(/scope/);
  expect(() => validateAnswers({ ...calm, touches_auth: 2 })).toThrow(/touches_auth/);
  expect(() => validateAnswers("nope")).toThrow(AnswerError);
});

test("a clear one-spot fix is fast; a feature is standard; risk or a new product is full", () => {
  expect(computeRoute(calm, [], DEFAULT_POLICY).route).toBe("fast");
  expect(computeRoute({ ...calm, work_type: "feature" }, [], DEFAULT_POLICY).route).toBe(
    "standard",
  );
  expect(computeRoute({ ...calm, is_vague: 0.8 }, [], DEFAULT_POLICY).route).toBe("standard");
  const risky = computeRoute({ ...calm, touches_auth: 0.4 }, [], DEFAULT_POLICY);
  expect(risky.route).toBe("full");
  expect(risky.riskAreas).toEqual(["auth"]);
  expect(computeRoute({ ...calm, work_type: "new-product" }, [], DEFAULT_POLICY).route).toBe(
    "full",
  );
  expect(computeRoute(calm, ["payments"], DEFAULT_POLICY)).toMatchObject({
    route: "full",
    riskAreas: ["payments"],
  });
});

test("the team policy can only raise the route", () => {
  const decision = computeRoute(calm, [], { ...DEFAULT_POLICY, minimumRoute: "standard" });
  expect(decision.route).toBe("standard");
  expect(decision.reasons.at(-1)).toBe("team policy minimum: standard");
});

test("risk paths come from the defaults and the policy", () => {
  expect(riskAreasForPaths(["app/Http/Middleware/Authenticate.php"], DEFAULT_POLICY)).toEqual([
    "auth",
  ]);
  expect(riskAreasForPaths(["database/migrations/2026_01_01_x.php"], DEFAULT_POLICY)).toEqual([
    "data-migration",
  ]);
  expect(riskAreasForPaths(["src/cart/total.ts"], DEFAULT_POLICY)).toEqual([]);
  const policy = { ...DEFAULT_POLICY, riskPaths: { payments: ["app/Billing/**"] } };
  expect(riskAreasForPaths(["app/Billing/Invoice.php"], policy)).toEqual(["payments"]);
});

test("findings 1 and 14: a path the policy excludes raises nothing, and the exclusion is named", () => {
  const policy = {
    ...DEFAULT_POLICY,
    riskPaths: { payments: ["app/Billing/**"] },
    riskPathExclusions: ["src/legacy/session-*.ts", "app/Billing/Invoice.php"],
  };
  // A default pattern (`**/session*`) and an added one, both kept out by the exclusions.
  expect(riskAreasForPaths(["src/legacy/session-store.ts"], policy)).toEqual([]);
  expect(riskAreasForPaths(["app/Billing/Invoice.php"], policy)).toEqual([]);
  // Other paths keep raising, with or without an excluded neighbour in the change.
  expect(riskAreasForPaths(["src/legacy/session-store.ts", "app/Auth/Guard.ts"], policy)).toEqual([
    "auth",
  ]);
  expect(riskAreasForPaths(["src/legacy/session-store.ts"], DEFAULT_POLICY)).toEqual(["auth"]);
  // A Claude Code event hook raises nothing by the engine's own rule, with no exclusion (AC-14).
  expect(riskAreasForPaths(["plugins/core/hooks/session-start.ts"], DEFAULT_POLICY)).toEqual([]);
  // The paths an exclusion kept from raising, so the record can say so; a path that would not
  // have raised anything is not one of them.
  expect(
    excludedRiskPaths(
      ["src/legacy/session-store.ts", "app/Billing/Invoice.php", "src/cart/total.ts"],
      { ...policy, riskPathExclusions: [...policy.riskPathExclusions, "src/**"] },
    ),
  ).toEqual(["src/legacy/session-store.ts", "app/Billing/Invoice.php"]);
  expect(excludedRiskPaths(["app/Auth/Guard.ts"], policy)).toEqual([]);
});

test("SP3-T2 AC-1: the optional kind and priority answers are validated when present, and a kind never lowers a fix or a new product", () => {
  expect(validateAnswers({ ...calm, kind: "issue", priority: 2 })).toEqual({
    ...calm,
    kind: "issue",
    priority: 2,
  });
  expect(() => validateAnswers({ ...calm, kind: "chore" })).toThrow(
    /kind: expected one of client-request, cross-project, new-project, feature, issue, audit/,
  );
  expect(() => validateAnswers({ ...calm, priority: 4 })).toThrow(
    /priority: expected an integer level from 0 to 3/,
  );
  expect(() => validateAnswers({ ...calm, kind: "feature" })).toThrow(/kind: a fix is an issue/);
  expect(() => validateAnswers({ ...calm, work_type: "new-product", kind: "feature" })).toThrow(
    /kind: a new product is a new project/,
  );
});

test("SP3-T2 AC-1: the kind is derived in order (the type's kinds first, then the origin, the source, feature) and an answer is taken where the type leaves it open", () => {
  const none = { origin: false, sourceChannel: null } as const;
  expect(kindOf(calm, none)).toEqual({ kind: "issue", from: "work_type fix" });
  expect(kindOf(calm, { origin: true, sourceChannel: "task-manager" })).toEqual({
    kind: "issue",
    from: "work_type fix",
  });
  expect(kindOf({ ...calm, work_type: "new-product" }, none)).toEqual({
    kind: "new-project",
    from: "work_type new-product",
  });
  const feature: Answers = { ...calm, work_type: "feature" };
  expect(kindOf(feature, { origin: true, sourceChannel: null })).toEqual({
    kind: "cross-project",
    from: "origin",
  });
  expect(kindOf(feature, { origin: false, sourceChannel: "task-manager" })).toEqual({
    kind: "client-request",
    from: "source: task-manager",
  });
  expect(kindOf(feature, { origin: false, sourceChannel: "document" })).toEqual({
    kind: "client-request",
    from: "source: document",
  });
  expect(kindOf(feature, none)).toEqual({ kind: "feature", from: "work_type feature" });
  expect(kindOf({ ...calm, work_type: "chore" }, none)).toEqual({
    kind: "feature",
    from: "work_type chore",
  });
  expect(
    kindOf({ ...feature, kind: "client-request" }, { origin: true, sourceChannel: null }),
  ).toEqual({ kind: "client-request", from: "answer" });
  expect(PRIORITY_LEVELS).toEqual(["low", "normal", "high", "blocker"]);
});

test("SP8-T2 AC-1: audit is a work type and a kind derived from it alone; an answered kind audit on another type is refused", () => {
  expect(validateAnswers({ ...calm, work_type: "audit" })).toMatchObject({ work_type: "audit" });
  expect(kindOf({ ...calm, work_type: "audit" }, { origin: false, sourceChannel: null })).toEqual({
    kind: "audit",
    from: "work_type audit",
  });
  expect(() => validateAnswers({ ...calm, work_type: "feature", kind: "audit" })).toThrow(
    /an audit is work_type audit/,
  );
  expect(() => validateAnswers({ ...calm, work_type: "audit", kind: "feature" })).toThrow(
    /kind: an audit is an audit/,
  );
  expect(validateAnswers({ ...calm, work_type: "audit", kind: "audit" })).toMatchObject({
    kind: "audit",
  });
});

// A unified diff of one file whose added lines are `added`, with a removed line and a context line
function patchOf(file: string, added: string[], header = `+++ b/${file}`): string {
  return [
    `diff --git a/${file} b/${file}`,
    `--- a/${file}`,
    header,
    "@@ -1,2 +1,3 @@",
    " const kept = email;",
    "-const gone = password;",
    ...added.map((l) => `+${l}`),
    "",
  ].join("\n");
}
const termsOf = (patch: string) => personalDataTerms(patch).map((h) => h.term);

test("AC-5 (finding 149): the personal-data identifiers an added line names, with their files", () => {
  const hits: [string, string][] = [
    ["log(user.email)", "email"],
    ["const e_mail = x", "email"],
    ["data['e-mail']", "email"],
    ["account.userEmail = x", "email"],
    ["const passwd = x", "password"],
    ["user.passwordHash = h", "password"],
    ["PASSWORD: x", "password"],
    ["const phoneNumber = x", "phone"],
    ["phone_number: x", "phone"],
    ["telephone = x", "phone"],
    ["mobileNumber = x", "phone"],
    ["mobile_phone = x", "phone"],
    ["const iPhone = x", "phone"],
    ["dateOfBirth: x", "birth date"],
    ["birth_date = x", "birth date"],
    ["birthday: x", "birth date"],
    ["const dob = x", "birth date"],
    ["iban: x", "iban"],
    ["bic = x", "iban"],
    ["swiftCode = x", "iban"],
    ["swift_code = x", "iban"],
    ["cardNumber = x", "card"],
    ["credit_card = x", "card"],
    ["cvv = x", "card"],
    ["CVC: x", "card"],
    ["nationalId = x", "national id"],
    ["national_id = x", "national id"],
    ["taxId = x", "tax id"],
    ["tax-id: x", "tax id"],
    ["passport = x", "passport"],
    ["ssn = x", "ssn"],
    ["socialSecurity = x", "ssn"],
  ];
  for (const [line, term] of hits) expect(termsOf(patchOf("src/a.ts", [line]))).toEqual([term]);
  const misses = [
    "was emailed",
    "microphone.on()",
    "address = x",
    "name = x",
    "id = 1",
    "import SwiftUI",
    "let swift = 5",
    "bicycle = x",
    "passports_of_ships_count",
  ];
  for (const line of misses) expect(termsOf(patchOf("src/a.ts", [line]))).toEqual([]);
  // Removed and context lines and the +++ header are never read: the patch above holds both terms there
  expect(personalDataTerms(patchOf("src/email/password.ts", ["const total = 1"]))).toEqual([]);
  // Once per term and file, the files kept apart
  const two =
    patchOf("src/a.ts", ["a.email", "b.email", "c.phone"]) + patchOf("src/b.ts", ["d.email"]);
  expect(personalDataTerms(two)).toEqual([
    { term: "email", file: "src/a.ts" },
    { term: "phone", file: "src/a.ts" },
    { term: "email", file: "src/b.ts" },
  ]);
  // A new file's addition patch, and a quoted header
  const added =
    "diff --git a/src/n.ts b/src/n.ts\nnew file mode 100644\n--- /dev/null\n+++ b/src/n.ts\n@@ -0,0 +1 @@\n+x.email\n";
  expect(personalDataTerms(added)).toEqual([{ term: "email", file: "src/n.ts" }]);
  expect(
    personalDataTerms(patchOf("src/my file.ts", ["x.email"], '+++ "b/src/my file.ts"')),
  ).toEqual([{ term: "email", file: "src/my file.ts" }]);
  // An added line that reads `++ b/tests/x` is a line, not a header: its file stays the real one
  expect(personalDataTerms(patchOf("src/a.ts", ["++ b/tests/x.test.ts", "user.email"]))).toEqual([
    { term: "email", file: "src/a.ts" },
  ]);
  // A removed `-- x` line (`--- x` in the patch) before it does not make it a header either
  const forged = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1,1 +1,2 @@",
    "--- x",
    "+++ b/tests/x.test.ts",
    "+user.email",
    "",
  ].join("\n");
  expect(personalDataTerms(forged)).toEqual([{ term: "email", file: "src/a.ts" }]);
  // A file section with no +++ header (a binary file) ends the previous file: its lines are no hit
  const binary = `${patchOf("src/a.ts", ["const total = 1"])}diff --git a/logo.png b/logo.png\nBinary files differ\n+user.email\n`;
  expect(personalDataTerms(binary)).toEqual([]);
  // A note line and an empty patch: no hit, no throw
  expect(personalDataTerms("# outside git, no diff can be cut\n")).toEqual([]);
  expect(
    personalDataTerms("# no base commit: 2 tracked files not shown, untracked ones as additions\n"),
  ).toEqual([]);
  expect(personalDataTerms("")).toEqual([]);
});

test("AC-6 (finding 149): a test file is told by its path alone, narrowly", () => {
  for (const path of [
    "tests/a.test.ts",
    "tests/accounts.mjs",
    "test/helper.js",
    "spec/models/user_spec.rb",
    "packages/engine/tests/gates.test.ts",
    "apps/web/test/a.ts",
    "src/test/java/AccountTest.java",
    "src/components/__tests__/Button.tsx",
    "src/a.test.ts",
    "src/a.spec.js",
    "pkg/a_test.go",
    "app/Models/UserTest.php",
    "Accounts/AccountTests.cs",
  ])
    expect(isTestPath(path)).toBe(true);
  for (const path of [
    "src/spec/a.ts",
    "app/test/a.php",
    "src/latest/a.ts",
    "src/contest.ts",
    "src/attest.php",
    "protest/a.ts",
    "src/accounts.mjs",
    "packages/engine/src/gates.ts",
  ])
    expect(isTestPath(path)).toBe(false);
});

test("AC-15 (findings 1, 14): the session patterns keep every session store and let go only the Claude Code event hooks in a hooks/ folder", () => {
  const areas = (path: string, policy = DEFAULT_POLICY) => riskAreasForPaths([path], policy);
  for (const path of [
    "src/session-store.ts",
    "src/session-manager.ts",
    "src/sessionStore.ts",
    "app/SessionStore.php",
    "app/Http/SessionHandler.php",
    "src/session-store/a.ts",
    "src/session/a.ts",
    "app/Http/Middleware/StartSession.php",
    "src/auth/session-start.ts",
    // An event hook's name inside a session folder: the folder pattern still counts
    "src/session/hooks/session-start.ts",
    "app/Auth/SessionStart.php",
    // Near-misses in a hooks/ folder: not the event names
    "src/hooks/session.ts",
    "src/hooks/session-start-helper.ts",
    // The old pattern's corpus: every one still matched
    "lib/session_store.rb",
    "src/session-token.ts",
    "src/session-cookie.ts",
    "src/sessionMiddleware.ts",
    "app/Http/Controllers/SessionController.php",
  ])
    expect(areas(path), path).toContain("auth");
  // Every other pattern still applies to an event hook: an auth folder raises auth, and a payments
  // pattern the policy adds raises payments
  expect(areas("src/auth/hooks/session-end.ts")).toContain("auth");
  const billing = { ...DEFAULT_POLICY, riskPaths: { payments: ["src/billing/**"] } };
  expect(areas("src/billing/hooks/session-end.ts", billing)).toEqual(["payments"]);
  for (const path of [
    "packages/engine/src/hooks/session-start.ts",
    ".claude/hooks/sessionStart.js",
    "src/hooks/session_end.py",
    "hooks/SessionEnd.ts",
  ])
    expect(areas(path), path).toEqual([]);
  // The rule is the engine's: a policy exclusion list neither undoes it nor is needed for it
  const policy = { ...DEFAULT_POLICY, riskPathExclusions: ["src/other/**"] };
  expect(areas("packages/engine/src/hooks/session-start.ts", policy)).toEqual([]);
  expect(areas("src/session-store.ts", policy)).toContain("auth");
});
