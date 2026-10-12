import { join } from "node:path";
import type { CrewPaths } from "./paths.ts";
import { readProtectedJson } from "./store.ts";
import type { DecidedBy, GateName, Policy, RiskArea, Route } from "./types.ts";
import { GATE_NAMES, ROUTE_ORDER } from "./types.ts";

export const DEFAULT_POLICY: Policy = {
  requiredGates: [],
  riskPaths: {},
  minimumRoute: "fast",
  allowSkips: ["*"],
  artifacts: "commit",
  unattendedDecisions: "wait",
};

/** Whether a recorded decision counts: a person's always does, the agent's only when the policy says so. */
export function decisionCounts(policy: Policy, decision: { by?: DecidedBy }): boolean {
  return decision.by !== "agent" || policy.unattendedDecisions === "count";
}

const RISK_AREAS: RiskArea[] = [
  "auth",
  "payments",
  "personal-data",
  "data-migration",
  "infra",
  "public-api",
  "secrets",
];

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** A policy can only tighten; anything it does not say falls back to the default. */
export function loadPolicy(paths: CrewPaths): { policy: Policy; tampered: boolean } {
  const read = readProtectedJson<Record<string, unknown>>(
    paths,
    join(paths.crewDir, "policy.json"),
  );
  const raw = read.data ?? {};
  const riskPaths: Policy["riskPaths"] = {};
  const rawRisk = (raw.riskPaths ?? {}) as Record<string, unknown>;
  for (const area of RISK_AREAS) {
    const patterns = strings(rawRisk[area]);
    if (patterns.length) riskPaths[area] = patterns;
  }
  const minimumRoute = ROUTE_ORDER.includes(raw.minimumRoute as Route)
    ? (raw.minimumRoute as Route)
    : DEFAULT_POLICY.minimumRoute;
  const allowSkips = Array.isArray(raw.allowSkips)
    ? strings(raw.allowSkips)
    : DEFAULT_POLICY.allowSkips;
  return {
    policy: {
      requiredGates: strings(raw.requiredGates).filter((g): g is GateName =>
        GATE_NAMES.includes(g as GateName),
      ),
      riskPaths,
      minimumRoute,
      allowSkips,
      artifacts: raw.artifacts === "local" ? "local" : "commit",
      unattendedDecisions: raw.unattendedDecisions === "count" ? "count" : "wait",
    },
    tampered: read.tampered,
  };
}

export function skipAllowed(policy: Policy, step: string): boolean {
  const bare = step.replace(/^(gate|tdd):/, "");
  return policy.allowSkips.some((s) => s === "*" || s === step || s === bare);
}
