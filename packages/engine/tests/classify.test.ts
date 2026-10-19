import { expect, test } from "bun:test";
import {
  AnswerError,
  type Answers,
  computeRoute,
  excludedRiskPaths,
  kindOf,
  PRIORITY_LEVELS,
  riskAreasForPaths,
  validateAnswers,
} from "../src/classify.ts";
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
    riskPathExclusions: ["plugins/core/hooks/session-*.ts", "app/Billing/Invoice.php"],
  };
  // A default pattern (`**/session*`) and an added one, both kept out by the exclusions.
  expect(riskAreasForPaths(["plugins/core/hooks/session-start.ts"], policy)).toEqual([]);
  expect(riskAreasForPaths(["app/Billing/Invoice.php"], policy)).toEqual([]);
  // Other paths keep raising, with or without an excluded neighbour in the change.
  expect(
    riskAreasForPaths(["plugins/core/hooks/session-start.ts", "app/Auth/Guard.ts"], policy),
  ).toEqual(["auth"]);
  expect(riskAreasForPaths(["plugins/core/hooks/session-start.ts"], DEFAULT_POLICY)).toEqual([
    "auth",
  ]);
  // The paths an exclusion kept from raising, so the record can say so; a path that would not
  // have raised anything is not one of them.
  expect(
    excludedRiskPaths(
      ["plugins/core/hooks/session-start.ts", "app/Billing/Invoice.php", "src/cart/total.ts"],
      { ...policy, riskPathExclusions: [...policy.riskPathExclusions, "src/**"] },
    ),
  ).toEqual(["plugins/core/hooks/session-start.ts", "app/Billing/Invoice.php"]);
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
