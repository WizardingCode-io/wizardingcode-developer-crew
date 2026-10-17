import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_POLICY } from "../src/policy.ts";
import {
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
