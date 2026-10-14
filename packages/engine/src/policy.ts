import { join } from "node:path";
import type { CrewPaths } from "./paths.ts";
import { readProtectedJson, writeProtectedJson } from "./store.ts";
import type { DecidedBy, GateName, PermissionMode, Policy, RiskArea, Route } from "./types.ts";
import { GATE_NAMES, isJudgementGateName, ROUTE_ORDER } from "./types.ts";

export const DEFAULT_POLICY: Policy = {
  requiredGates: [],
  judgementGates: [],
  riskPaths: {},
  riskPathExclusions: [],
  minimumRoute: "fast",
  // Gates are mandatory: a tdd step may be skipped (the observed kind is the better path), a gate
  // only when a person lists it here (0.3.0; finding 20).
  allowSkips: ["tdd"],
  artifacts: "commit",
  unattendedDecisions: "wait",
  attendedDecisions: "relay",
};

/** The scalar keys `crew policy set` writes, with their values; the rest of the policy is hand-written. */
export const SETTABLE_POLICY_KEYS = {
  attendedDecisions: ["prompt", "relay"],
  unattendedDecisions: ["wait", "count", "validator"],
} as const satisfies Partial<Record<keyof Policy, readonly string[]>>;

function policyPath(paths: CrewPaths): string {
  return join(paths.crewDir, "policy.json");
}

/**
 * Writes one settable key of `policy.json` through the engine: the file keeps everything else as
 * written and stays trusted. A file changed outside the engine is refused until a person accepts it.
 */
export function setPolicyValue(
  paths: CrewPaths,
  key: string,
  value: string,
): { key: string; value: string } | { refused: string } {
  const keys = Object.keys(SETTABLE_POLICY_KEYS);
  if (!(key in SETTABLE_POLICY_KEYS))
    return { refused: `unknown policy key: ${key} (crew policy set writes ${keys.join(", ")})` };
  const allowed: readonly string[] = SETTABLE_POLICY_KEYS[key as keyof typeof SETTABLE_POLICY_KEYS];
  if (!allowed.includes(value))
    return { refused: `${key} is one of ${allowed.join(", ")}, not ${value}` };
  const read = readProtectedJson<Record<string, unknown>>(paths, policyPath(paths));
  if (read.tampered) {
    return {
      refused:
        "state changed outside the engine: .crew/policy.json; the user can accept it with crew policy accept",
    };
  }
  writeProtectedJson(paths, policyPath(paths), { ...(read.data ?? {}), [key]: value });
  return { key, value };
}

/**
 * Whether a recorded decision counts: a person's always; the validator's when a person was present
 * (no mode: the person was there to object) or, with no person watching, as the policy says; the
 * agent's as the policy says.
 */
export function decisionCounts(
  policy: Policy,
  decision: { by?: DecidedBy; mode?: PermissionMode },
): boolean {
  if (decision.by === "validator")
    return decision.mode === undefined || policy.unattendedDecisions === "validator";
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

/**
 * A policy can only tighten, with one exception: `riskPathExclusions` takes paths out of the risk
 * patterns (ADR 0003). Anything it does not say falls back to the default.
 */
export function loadPolicy(paths: CrewPaths): { policy: Policy; tampered: boolean } {
  const read = readProtectedJson<Record<string, unknown>>(paths, policyPath(paths));
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
      judgementGates: strings(raw.judgementGates).filter(isJudgementGateName),
      riskPaths,
      riskPathExclusions: strings(raw.riskPathExclusions),
      minimumRoute,
      allowSkips,
      artifacts: raw.artifacts === "local" ? "local" : "commit",
      unattendedDecisions:
        raw.unattendedDecisions === "count" || raw.unattendedDecisions === "validator"
          ? raw.unattendedDecisions
          : "wait",
      attendedDecisions: raw.attendedDecisions === "prompt" ? "prompt" : "relay",
    },
    tampered: read.tampered,
  };
}

/** `*` any step; `tdd` any test-first step; otherwise the step itself (`gate:lint`) or its bare name (`lint`). */
export function skipAllowed(policy: Policy, step: string): boolean {
  const bare = step.replace(/^(gate|tdd):/, "");
  return policy.allowSkips.some(
    (s) => s === "*" || s === step || s === bare || (s === "tdd" && step.startsWith("tdd:")),
  );
}
