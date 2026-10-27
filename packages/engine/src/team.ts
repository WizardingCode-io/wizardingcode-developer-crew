import { riskAreasForPaths } from "./classify.ts";
import { matchesAny } from "./glob.ts";
import { isDesignContractPath, isFrontendPath, isInterfacePath } from "./paths-kind.ts";
import type {
  JudgementGateName,
  Personality,
  Policy,
  RiskArea,
  Route,
  Seat,
  TeamName,
} from "./types.ts";

/** When a team sits at the table: always from standard up, on a risk area, on the full route, or on named paths (a pack's template gives the globs, SP6 Task 2; `interface` seats the team on a frontend change, SP9 Task 5). */
export type MandatoryRule =
  | { kind: "always" }
  | { kind: "risk-area"; area: RiskArea }
  | { kind: "route"; route: "full" }
  | { kind: "paths"; globs?: string[]; pack?: string; interface?: boolean };

export interface TeamDef {
  lead: string;
  /** The reviewer roles of the team; the implementers' teams have none (the session and the task children are their members). */
  members: string[];
  /** The judgement gates the team's reviewers rule, in the order they are planned. */
  gates: JudgementGateName[];
  mandatory: MandatoryRule;
  /** Whether the team's lead validates the spec and the brief when the team is seated. */
  validates: boolean;
}

/** The registry (SP7 §6.1): the one source of the teams, their leads, their members and their rules. */
export const TEAMS: Record<TeamName, TeamDef> = {
  researchers: {
    lead: "lead-researchers",
    members: ["researcher"],
    gates: [],
    mandatory: { kind: "always" },
    validates: false,
  },
  qa: {
    lead: "lead-qa",
    members: ["review-test-quality"],
    gates: ["test-quality"],
    mandatory: { kind: "always" },
    validates: true,
  },
  security: {
    lead: "lead-security",
    members: ["review-security"],
    gates: ["security"],
    mandatory: { kind: "always" },
    validates: true,
  },
  architects: {
    lead: "lead-architects",
    members: ["review-architecture"],
    gates: ["architecture"],
    mandatory: { kind: "route", route: "full" },
    validates: true,
  },
  etl: {
    lead: "lead-etl",
    members: ["review-data"],
    gates: ["data"],
    mandatory: { kind: "risk-area", area: "data-migration" },
    validates: true,
  },
  devops: {
    lead: "lead-devops",
    members: ["review-infra"],
    gates: ["infra"],
    mandatory: { kind: "risk-area", area: "infra" },
    validates: true,
  },
  backend: {
    lead: "lead-backend",
    members: ["review-code-quality"],
    gates: ["code-quality"],
    mandatory: { kind: "always" },
    validates: false,
  },
  // The frontend owns the page review (SP9 Task 5): seated by a frontend change (an interface file
  // or a design contract) on standard and full, where its lead validates the session's work as a
  // stranger; a pack's template adds globs to the same rule.
  frontend: {
    lead: "lead-frontend",
    members: ["review-ui-ux"],
    gates: ["ui-ux"],
    mandatory: { kind: "paths", interface: true },
    validates: true,
  },
  "agentic-os": {
    lead: "lead-agentic-os",
    members: [],
    gates: [],
    mandatory: { kind: "paths" },
    validates: false,
  },
};

/** A pack's team template (SP6 Task 2): its name and the globs it gives each `paths` team. */
export interface TeamTemplate {
  template: string;
  teams: Partial<Record<TeamName, { mandatory: { kind: "paths"; globs: string[] } }>>;
}

/** A pack's team template as the registry reads it (SP6 Task 2): globs for a `paths` team, nothing else. */
export interface RegistryTemplate {
  pack: string;
  template: TeamTemplate;
}

/**
 * The registry an item is planned from (SP6 Task 2 AC-4): the core's, or the core's with the globs
 * of the registered template `policy.team.template` names on its `paths` teams. A template adds
 * globs and nothing else; an unregistered name applies nothing and is said.
 */
export function teamsFor(
  policy: Policy,
  templates: readonly RegistryTemplate[],
): { teams: Record<TeamName, TeamDef>; warning: string | null } {
  const teams = Object.fromEntries(
    (Object.entries(TEAMS) as [TeamName, TeamDef][]).map(([name, def]) => [
      name,
      { ...def, members: [...def.members], gates: [...def.gates], mandatory: { ...def.mandatory } },
    ]),
  ) as Record<TeamName, TeamDef>;
  const wanted = policy.team.template;
  if (wanted === "core") return { teams, warning: null };
  const found = templates.find((t) => t.template.template === wanted);
  if (!found)
    return {
      teams,
      warning: `team.template ${wanted} is not a registered pack's template: the core registry applies`,
    };
  for (const [name, def] of Object.entries(found.template.teams) as [
    TeamName,
    { mandatory: { kind: "paths"; globs: string[] } },
  ][]) {
    const team = teams[name];
    if (team?.mandatory.kind !== "paths") continue;
    // The core rule first, so its `interface` flag survives: a template adds globs and nothing else.
    team.mandatory = { ...team.mandatory, globs: [...def.mandatory.globs], pack: found.pack };
  }
  return { teams, warning: null };
}

export const PERSONALITIES: readonly Personality[] = [
  "adventurous",
  "creative",
  "conservative",
  "sceptical",
  "professional",
];
/** The experts' rotation, so three proposals are never the same lens (SP7 §6.3). */
export const EXPERT_PERSONALITIES = ["conservative", "creative", "adventurous"] as const;

const DEBATE_ROLES = ["researcher", "expert", "devils-advocate", "fault-finder"] as const;
const REVIEW_ROLES = [
  "review-code-quality",
  "review-test-quality",
  "review-security",
  "review-ui-ux",
  "review-risk",
  "review-architecture",
  "review-data",
  "review-infra",
] as const;
const LEAD_ROLES = Object.values(TEAMS).map((t) => t.lead);

/** Every role the hook records and the mail addresses, `expert` bare (the mail numbers it). */
export const ROLE_NAMES: readonly string[] = [
  "judge",
  "cto",
  // One agent for the five validating teams; the team is read from its answer's first line.
  "tech-lead",
  ...DEBATE_ROLES,
  ...REVIEW_ROLES,
  ...LEAD_ROLES,
];

/** The anchored pattern of a role's name as the mail knows it: `expert-<n>` numbered, every other role as is. */
export function rolePattern(): RegExp {
  const names = ROLE_NAMES.map((n) => (n === "expert" ? "expert-\\d+" : n.replace(/-/g, "\\-")));
  return new RegExp(`^(${names.join("|")})$`);
}

/** The SubagentStop matcher `plugins/core/hooks/hooks.json` must carry (spike A4 of SP2c; a test checks the two agree). */
export function subagentStopMatcher(): string {
  return `^wizardingcode-developer-crew:(${ROLE_NAMES.join("|")})$`;
}

/** The team whose lead the session is: frontend when the change touches a frontend path (an interface file or a design contract), backend otherwise. */
export function primaryTeam(changed: readonly string[]): "backend" | "frontend" {
  return changed.some(isFrontendPath) ? "frontend" : "backend";
}

function seated(
  team: TeamName,
  def: TeamDef,
  route: Route,
  riskAreas: readonly RiskArea[],
  changed: readonly string[],
  policy: Policy,
): string | null {
  if (policy.team.always.includes(team)) return "policy team.always";
  if (route === "fast") return null;
  const rule = def.mandatory;
  if (rule.kind === "always") return `${route} route`;
  if (rule.kind === "route") return route === rule.route ? `${route} route` : null;
  // A risk-area team (ETL, DevOps) sits on the full route only (the design's §6.2 table): on
  // standard a risk area seats the security reviewer, as SP2 did, and nothing more.
  if (rule.kind === "risk-area")
    return route === "full" && riskAreas.includes(rule.area) ? `risk area ${rule.area}` : null;
  // The frontend (SP9 Task 5): a frontend change seats it on standard and full; a template's globs
  // seat its expert elsewhere and never its lead.
  if (rule.kind === "paths" && rule.interface) return frontendReason(changed);
  return null;
}

/**
 * The team line as `crew team` prints it and as the gate run prints it before the judgement gates
 * (SP9 Task 10 AC-8): one formatter, so the two never drift.
 */
export function teamLine(id: string, seats: readonly Seat[], primary: TeamName): string {
  return `Team of ${id} (primary ${primary}): ${seats.map((s) => `${s.role} (${s.reason})`).join("; ")}`;
}

/** The first three paths, then how many more. */
function firstThree(paths: readonly string[]): string {
  const shown = paths.slice(0, 3).join(", ");
  const more = paths.length > 3 ? `, +${paths.length - 3} more` : "";
  return `${shown}${more}`;
}

/**
 * The reason a frontend change gives the page reviewer and the frontend lead: the interface files
 * when any changed, else the design contracts; null when the change touches neither.
 */
function frontendReason(changed: readonly string[]): string | null {
  const interfaces = changed.filter(isInterfacePath);
  if (interfaces.length) return `interface files: ${firstThree(interfaces)}`;
  const contracts = changed.filter(isDesignContractPath);
  return contracts.length ? `design contract: ${firstThree(contracts)}` : null;
}

/**
 * The seats a todo's files ask for (SP7 §8.1, SP7b decision 14): the page reviewer for its
 * interface files, the security reviewer for its risk paths, and the judge with them; nothing of
 * the route or the policy, which are the item's and run once on the whole change.
 */
export function taskSeats(scope: readonly string[], policy: Policy): Seat[] {
  const seats: Seat[] = [];
  const frontend = frontendReason(scope);
  if (frontend)
    seats.push({
      role: "review-ui-ux",
      team: "frontend",
      kind: "gate",
      gate: "ui-ux",
      reason: frontend,
    });
  const areas = riskAreasForPaths(scope, policy);
  if (areas.length)
    seats.push({
      role: "review-security",
      team: "security",
      kind: "gate",
      gate: "security",
      reason: `risk area${areas.length === 1 ? "" : "s"} ${areas.join(", ")}`,
    });
  if (seats.length)
    seats.push({ role: "judge", team: null, kind: "debate", reason: "a gate is planned" });
  return seats;
}

/** What `plannedSeats` is given beside the route and the change, each with its default. */
export interface SeatOptions {
  /** A todo's scope: the todo's seats and nothing else (SP7b decision 14). */
  scope?: readonly string[];
  /** Whether the item has a strategy for the CTO to review. */
  strategy?: boolean;
  /** The registry the seats are planned from: the core's by default, or `teamsFor`'s with a pack's template. */
  registry?: Record<TeamName, TeamDef>;
  /**
   * The paths a pack template's globs are matched against: the change's paths before the watch's
   * exclusions (SP6 Task 6), since an agent's Markdown is what such a template names.
   */
  templatePaths?: readonly string[];
}

/**
 * Every seat of an item (SP7 §6.2): the researcher from standard up; the reviewers of the seated
 * teams (code and test quality from standard up; security on full or on a risk area; UI/UX on any
 * route when the change touches a frontend path, an interface file or a design contract; risk,
 * architecture on full; data and infra on full when their risk area is touched); every reviewer of
 * a team the policy always seats; the validating leads of the seated teams, the frontend's on
 * standard and full when a frontend path changed (SP9 Task 5); the judge whenever a gate is
 * planned. The fast route seats nothing but the frontend's UI/UX reviewer when a frontend path
 * changed (and the judge who rules it), so it costs no more than it did. The reasons are the
 * report's strings.
 */
export function plannedSeats(
  route: Route,
  riskAreas: readonly RiskArea[],
  changed: readonly string[],
  policy: Policy,
  options: SeatOptions = {},
): Seat[] {
  const { scope, strategy, registry = TEAMS, templatePaths = changed } = options;
  // A todo's scope plans the todo's seats and nothing else (SP7b decision 14).
  if (scope !== undefined) return taskSeats(scope, policy);
  const seats: Seat[] = [];
  const plan = (seat: Seat): void => {
    if (!seats.some((s) => s.role === seat.role)) seats.push(seat);
  };
  if (route !== "fast")
    plan({ role: "researcher", team: "researchers", kind: "debate", reason: `${route} route` });
  // A gate's reviewer sits in the team whose registry entry rules that gate; the risk review is
  // ruled by no team's reviewers and sits with the architects, who own the full route.
  const owner = (name: JudgementGateName): TeamName | null =>
    (Object.entries(registry) as [TeamName, TeamDef][]).find(([, t]) =>
      t.gates.includes(name),
    )?.[0] ?? null;
  const gate = (name: JudgementGateName, reason: string, team = owner(name)) =>
    plan({ role: `review-${name}`, team, kind: "gate", gate: name, reason });
  if (route !== "fast") {
    gate("code-quality", `${route} route`);
    gate("test-quality", `${route} route`);
  }
  if (route === "full") gate("security", "full route");
  else if (route === "standard" && riskAreas.length)
    gate("security", `risk area${riskAreas.length === 1 ? "" : "s"} ${riskAreas.join(", ")}`);
  // The page review on any route when a frontend path changed (SP9 Task 5): its reviewer sits in
  // the team that rules the gate, the frontend.
  const frontend = frontendReason(changed);
  if (frontend) gate("ui-ux", frontend);
  if (route === "full") {
    gate("risk", "full route", "architects");
    gate("architecture", "full route");
  }
  // The CTO reviews a new project's strategy on the full route (SP7 §6.2, §7.3); on standard the
  // judge rules it from the files and nobody sits for it.
  if (route === "full" && strategy)
    plan({
      role: "cto",
      team: null,
      kind: "cto",
      gate: "strategy",
      reason: "reviewer of the strategy (full route)",
    });
  // A team the policy always seats brings every reviewer the registry gives it, on any route,
  // beyond what the route planned (SP7 §6.1); a seat the route already planned keeps its reason.
  for (const team of policy.team.always)
    for (const g of registry[team].gates) gate(g, "policy team.always", team);
  for (const team of ["etl", "devops"] as const) {
    const reason = seated(team, registry[team], route, riskAreas, changed, policy);
    if (reason) for (const g of registry[team].gates) gate(g, reason, team);
  }
  for (const g of policy.judgementGates) gate(g, "policy");
  // A pack team's paths (SP6 Task 2 AC-4): a changed file under a template's glob seats the team as
  // the expert's knowledge seat (SP7 §6.3), on standard and full; the fast route stays as it is.
  if (route !== "fast")
    for (const [name, def] of Object.entries(registry) as [TeamName, TeamDef][]) {
      const rule = def.mandatory;
      if (rule.kind !== "paths" || !rule.globs?.length) continue;
      const glob = rule.globs.find((g) => templatePaths.some((p) => matchesAny(p, [g])));
      if (glob)
        plan({
          role: "expert",
          team: name,
          kind: "debate",
          reason: `pack ${rule.pack ?? name} (${glob})`,
        });
    }
  // The validating leads of the seated teams; on the fast route only a team the policy always seats.
  for (const [name, def] of Object.entries(registry) as [TeamName, TeamDef][]) {
    if (!def.validates) continue;
    const reason = seated(name, def, route, riskAreas, changed, policy);
    if (reason) plan({ role: def.lead, team: name, kind: "lead", reason });
  }
  if (seats.some((s) => s.kind === "gate"))
    plan({ role: "judge", team: null, kind: "debate", reason: "a gate is planned" });
  return seats;
}

/**
 * The audit's seats (SP7 §7.5, SP8 decision 7): the researcher for the dependencies, security,
 * architecture, code quality and test quality always, data and infra when the scope's risk areas
 * name their paths, a team the policy always seats with its reviewers; no CTO, no lead, no judge:
 * the report is the deliverable and a person signs it.
 */
export function auditSeats(scope: { riskAreas: readonly RiskArea[] }, policy: Policy): Seat[] {
  const seats: Seat[] = [];
  const plan = (seat: Seat): void => {
    if (!seats.some((s) => s.role === seat.role)) seats.push(seat);
  };
  plan({ role: "researcher", team: "researchers", kind: "debate", reason: "audit: dependencies" });
  const gate = (name: JudgementGateName, team: TeamName, reason: string) =>
    plan({ role: `review-${name}`, team, kind: "gate", gate: name, reason });
  gate("security", "security", "audit");
  gate("architecture", "architects", "audit");
  gate("code-quality", "backend", "audit");
  gate("test-quality", "qa", "audit");
  if (scope.riskAreas.includes("data-migration"))
    gate("data", "etl", "audit: data-migration paths");
  if (scope.riskAreas.includes("infra")) gate("infra", "devops", "audit: infra paths");
  for (const team of policy.team.always)
    for (const g of TEAMS[team].gates) gate(g, team, "policy team.always");
  return seats;
}
