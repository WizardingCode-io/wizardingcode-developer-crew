import type { JudgementGateName, PlannedJudgement, Policy, RiskArea, Route } from "./types.ts";

const INTERFACE_EXTENSIONS = [
  ".vue",
  ".svelte",
  ".tsx",
  ".jsx",
  ".astro",
  ".blade.php",
  ".html",
  ".css",
  ".scss",
  ".less",
];

/** A file the user sees: a component, a template, a stylesheet, or anything under resources/views/. */
export function isInterfacePath(rel: string): boolean {
  const lower = rel.toLowerCase();
  if (/(?:^|\/)resources\/views\//.test(lower)) return true;
  return INTERFACE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * The judgement gates an item needs, from the route, the risk areas and the diff (SP2 §10): code and
 * test quality on standard and full; security on full, or on standard when a risk area is touched;
 * UI/UX on any route when the change touches an interface file; risk on full; and whatever the team
 * policy requires. A fast item with no interface file plans none, so the fast route costs nothing more.
 */
export function plannedJudgementGates(
  route: Route,
  riskAreas: readonly RiskArea[],
  changed: readonly string[],
  policy: Policy,
): PlannedJudgement[] {
  const planned: PlannedJudgement[] = [];
  const plan = (gate: JudgementGateName, reason: string): void => {
    if (!planned.some((p) => p.gate === gate)) planned.push({ gate, reason });
  };
  if (route !== "fast") {
    plan("code-quality", `${route} route`);
    plan("test-quality", `${route} route`);
  }
  if (route === "full") plan("security", "full route");
  else if (route === "standard" && riskAreas.length)
    plan("security", `risk area${riskAreas.length === 1 ? "" : "s"} ${riskAreas.join(", ")}`);
  const interfaces = changed.filter(isInterfacePath);
  if (interfaces.length) {
    const shown = interfaces.slice(0, 3).join(", ");
    const more = interfaces.length > 3 ? `, +${interfaces.length - 3} more` : "";
    plan("ui-ux", `interface files: ${shown}${more}`);
  }
  if (route === "full") plan("risk", "full route");
  for (const gate of policy.judgementGates) plan(gate, "policy");
  return planned;
}
