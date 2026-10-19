import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_POLICY } from "../src/policy.ts";
import {
  auditSeats,
  EXPERT_PERSONALITIES,
  PERSONALITIES,
  plannedSeats,
  primaryTeam,
  ROLE_NAMES,
  rolePattern,
  subagentStopMatcher,
  TEAMS,
} from "../src/team.ts";
import { JUDGEMENT_GATES } from "../src/types.ts";

const roles = (seats: { role: string }[]) => seats.map((s) => s.role);

test("SP7a AC-1: the registry names nine teams, their leads, their members and their mandatory rules", () => {
  expect(Object.keys(TEAMS).sort()).toEqual([
    "agentic-os",
    "architects",
    "backend",
    "devops",
    "etl",
    "frontend",
    "qa",
    "researchers",
    "security",
  ]);
  expect(TEAMS.qa).toMatchObject({
    lead: "lead-qa",
    members: ["review-test-quality", "review-ui-ux"],
    mandatory: { kind: "always" },
  });
  expect(TEAMS.etl).toMatchObject({
    lead: "lead-etl",
    mandatory: { kind: "risk-area", area: "data-migration" },
  });
  expect(TEAMS.devops).toMatchObject({
    lead: "lead-devops",
    mandatory: { kind: "risk-area", area: "infra" },
  });
  expect(TEAMS.architects).toMatchObject({
    lead: "lead-architects",
    mandatory: { kind: "route", route: "full" },
  });
  expect(JUDGEMENT_GATES).toEqual([
    "code-quality",
    "test-quality",
    "security",
    "ui-ux",
    "risk",
    "architecture",
    "data",
    "infra",
    "strategy",
  ]);
  expect(EXPERT_PERSONALITIES).toEqual(["conservative", "creative", "adventurous"]);
  expect(PERSONALITIES).toEqual([
    "adventurous",
    "creative",
    "conservative",
    "sceptical",
    "professional",
  ]);
});

test("SP7a AC-1: the route decides the seats; the fast route plans no role", () => {
  expect(plannedSeats("fast", [], ["src/a.ts"], DEFAULT_POLICY)).toEqual([]);
  // Fast with an interface file keeps SP2's one judgement gate: ui-ux is QA's seat, and the judge
  // who rules it sits with it (a gate is never recorded without the judge).
  expect(roles(plannedSeats("fast", [], ["src/App.vue"], DEFAULT_POLICY))).toEqual([
    "review-ui-ux",
    "judge",
  ]);
  const standard = plannedSeats("standard", [], ["src/a.ts"], DEFAULT_POLICY);
  expect(roles(standard)).toEqual([
    "researcher",
    "review-code-quality",
    "review-test-quality",
    "lead-qa",
    "lead-security",
    "judge",
  ]);
  expect(standard.find((s) => s.role === "researcher")).toEqual({
    role: "researcher",
    team: "researchers",
    kind: "debate",
    reason: "standard route",
  });
  expect(standard.find((s) => s.role === "lead-qa")).toEqual({
    role: "lead-qa",
    team: "qa",
    kind: "lead",
    reason: "standard route",
  });
  // A risk area on standard seats the security reviewer, as SP2 did.
  expect(roles(plannedSeats("standard", ["auth"], ["src/a.ts"], DEFAULT_POLICY))).toContain(
    "review-security",
  );
  const full = plannedSeats("full", ["data-migration", "infra"], ["src/a.ts"], DEFAULT_POLICY);
  expect(roles(full)).toEqual([
    "researcher",
    "review-code-quality",
    "review-test-quality",
    "review-security",
    "review-risk",
    "review-architecture",
    "review-data",
    "review-infra",
    "lead-qa",
    "lead-security",
    "lead-architects",
    "lead-etl",
    "lead-devops",
    "judge",
  ]);
  expect(full.find((s) => s.role === "review-data")).toEqual({
    role: "review-data",
    team: "etl",
    kind: "gate",
    gate: "data",
    reason: "risk area data-migration",
  });
  // team.always adds a team the route would not seat; nothing removes one.
  const always = { ...DEFAULT_POLICY, team: { ...DEFAULT_POLICY.team, always: ["etl" as const] } };
  expect(roles(plannedSeats("standard", [], ["src/a.ts"], always))).toContain("review-data");
  expect(
    plannedSeats("standard", [], ["src/a.ts"], always).find((s) => s.role === "review-data")
      ?.reason,
  ).toBe("policy team.always");
});

test("SP7a AC-1: the primary team follows the paths; the roles' names have one source", () => {
  expect(primaryTeam(["src/a.ts"])).toBe("backend");
  expect(primaryTeam(["src/App.vue", "src/a.ts"])).toBe("frontend");
  expect(ROLE_NAMES).toContain("lead-qa");
  expect(ROLE_NAMES).toContain("cto");
  expect(ROLE_NAMES).toContain("review-architecture");
  expect(rolePattern().test("lead-devops")).toBe(true);
  expect(rolePattern().test("expert-2")).toBe(true);
  expect(rolePattern().test("lead-sales")).toBe(false);
  // hooks.json carries the matcher the registry generates: a drift fails here, never ships.
  const hooks = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("../../../plugins/core/hooks/hooks.json", import.meta.url)),
      "utf8",
    ),
  ) as { hooks: { SubagentStop: { matcher: string }[] } };
  expect(hooks.hooks.SubagentStop[0]?.matcher).toBe(subagentStopMatcher());
});

test("SP7a AC-1 (round 2): ETL and DevOps sit on the full route only; team.always seats a team's reviewers and lead on any route", () => {
  // A data-migration or infra risk area on standard seats the security reviewer, as SP2 did, and
  // nothing of ETL or DevOps: their rule fires on full (the design's §6.2 table, plan decision 2).
  const standard = roles(
    plannedSeats("standard", ["data-migration", "infra"], ["src/a.ts"], DEFAULT_POLICY),
  );
  expect(standard).toContain("review-security");
  for (const role of ["review-data", "review-infra", "lead-etl", "lead-devops"])
    expect(standard).not.toContain(role);
  // team.always adds the whole team beyond the route: its reviewers, from the registry's gates, and
  // its validating lead, each with the policy's reason.
  const withTeams = (always: ("architects" | "security" | "etl")[]) => ({
    ...DEFAULT_POLICY,
    team: { ...DEFAULT_POLICY.team, always },
  });
  const architects = plannedSeats("standard", [], ["src/a.ts"], withTeams(["architects"]));
  expect(architects.find((s) => s.role === "review-architecture")).toEqual({
    role: "review-architecture",
    team: "architects",
    kind: "gate",
    gate: "architecture",
    reason: "policy team.always",
  });
  expect(architects.find((s) => s.role === "lead-architects")?.reason).toBe("policy team.always");
  // A team the route already seats keeps its route's reason; its reviewer the route did not plan
  // comes with the policy's.
  const security = plannedSeats("standard", [], ["src/a.ts"], withTeams(["security"]));
  expect(security.find((s) => s.role === "review-security")?.reason).toBe("policy team.always");
  expect(security.find((s) => s.role === "lead-security")?.reason).toBe("policy team.always");
  // On the fast route too: the reviewer, the lead and the judge who rules the gate.
  expect(roles(plannedSeats("fast", [], ["src/a.ts"], withTeams(["etl"])))).toEqual([
    "review-data",
    "lead-etl",
    "judge",
  ]);
});

test("SP7b-T5 AC-1: a todo's scope plans only the seats its files ask for: ui-ux for interface files, security for a risk path, the judge with them, nothing of the route or the policy", () => {
  const scoped = (scope: string[], policy = DEFAULT_POLICY) =>
    plannedSeats("standard", [], ["src/a.ts"], policy, scope);
  expect(roles(scoped(["src/App.vue"]))).toEqual(["review-ui-ux", "judge"]);
  expect(scoped(["src/App.vue"])[0]).toEqual({
    role: "review-ui-ux",
    team: "qa",
    kind: "gate",
    gate: "ui-ux",
    reason: "interface files: src/App.vue",
  });
  expect(roles(scoped(["src/auth/login.ts"]))).toEqual(["review-security", "judge"]);
  expect(scoped(["src/auth/login.ts"])[0]?.reason).toBe("risk area auth");
  expect(scoped(["src/auth/login.ts", "src/payment.ts"])[0]?.reason).toBe(
    "risk areas auth, payments",
  );
  expect(scoped(["src/A.vue", "src/B.vue", "src/C.vue", "src/D.vue"])[0]?.reason).toBe(
    "interface files: src/A.vue, src/B.vue, src/C.vue, +1 more",
  );
  expect(scoped(["src/a.ts"])).toEqual([]);
  expect(scoped([])).toEqual([]);
  const loaded = {
    ...DEFAULT_POLICY,
    judgementGates: ["code-quality" as const],
    team: { ...DEFAULT_POLICY.team, always: ["etl" as const] },
  };
  expect(roles(scoped(["src/App.vue"], loaded))).toEqual(["review-ui-ux", "judge"]);
});

test("SP8-T3 AC-3: the CTO sits as the strategy's reviewer on the full route alone, and only when the item has a strategy", () => {
  const cto = (seats: ReturnType<typeof plannedSeats>) => seats.find((s) => s.role === "cto");
  expect(
    cto(plannedSeats("full", [], ["src/a.ts"], DEFAULT_POLICY, undefined, { strategy: true })),
  ).toEqual({
    role: "cto",
    team: null,
    kind: "cto",
    gate: "strategy",
    reason: "reviewer of the strategy (full route)",
  });
  expect(
    cto(plannedSeats("standard", [], ["src/a.ts"], DEFAULT_POLICY, undefined, { strategy: true })),
  ).toBeUndefined();
  expect(cto(plannedSeats("full", [], ["src/a.ts"], DEFAULT_POLICY))).toBeUndefined();
  expect(
    cto(plannedSeats("full", [], ["src/a.ts"], DEFAULT_POLICY, undefined, { strategy: false })),
  ).toBeUndefined();
});

test("SP8-T4 AC-3: the audit's seats follow the scope: the researcher for the dependencies, the four reviewers always, data and infra by the risk areas, no CTO, lead or judge", () => {
  const roles = (seats: ReturnType<typeof auditSeats>) => seats.map((s) => s.role);
  const plain = auditSeats({ riskAreas: [] }, DEFAULT_POLICY);
  expect(roles(plain)).toEqual([
    "researcher",
    "review-security",
    "review-architecture",
    "review-code-quality",
    "review-test-quality",
  ]);
  expect(plain[0]).toEqual({
    role: "researcher",
    team: "researchers",
    kind: "debate",
    reason: "audit: dependencies",
  });
  expect(plain[1]).toEqual({
    role: "review-security",
    team: "security",
    kind: "gate",
    gate: "security",
    reason: "audit",
  });
  expect(plain.some((s) => s.kind === "cto" || s.kind === "lead" || s.role === "judge")).toBe(
    false,
  );
  const data = auditSeats({ riskAreas: ["data-migration"] }, DEFAULT_POLICY);
  expect(data.at(-1)).toEqual({
    role: "review-data",
    team: "etl",
    kind: "gate",
    gate: "data",
    reason: "audit: data-migration paths",
  });
  const both = auditSeats({ riskAreas: ["infra", "data-migration", "auth"] }, DEFAULT_POLICY);
  expect(roles(both).slice(5)).toEqual(["review-data", "review-infra"]);
  expect(both.at(-1)?.reason).toBe("audit: infra paths");
  // A team the policy always seats brings its reviewer to the audit too, once.
  const always = {
    ...DEFAULT_POLICY,
    team: { ...DEFAULT_POLICY.team, always: ["devops" as const] },
  };
  expect(
    roles(auditSeats({ riskAreas: ["infra"] }, always)).filter((r) => r === "review-infra"),
  ).toEqual(["review-infra"]);
});
