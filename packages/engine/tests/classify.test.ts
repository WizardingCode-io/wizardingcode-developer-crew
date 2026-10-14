import { expect, test } from "bun:test";
import {
  AnswerError,
  type Answers,
  computeRoute,
  excludedRiskPaths,
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
