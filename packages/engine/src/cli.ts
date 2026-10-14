import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { AnswerError, type Answers, computeRoute, validateAnswers } from "./classify.ts";
import { loadConfig, saveConfig, setConfigValue } from "./config.ts";
import { detectProfile, missingTestCommands } from "./detect/index.ts";
import {
  countedNote,
  decidedBy,
  loadEvidence,
  renderReport,
  saveEvidence,
  tddSummary,
} from "./evidence.ts";
import { changedWatchedPaths, hashPaths, isGitRepo } from "./fingerprint.ts";
import { ensureDir, nowIso, readText, writeText } from "./fs.ts";
import { assess, runGates } from "./gates.ts";
import { handleHook } from "./hooks/index.ts";
import type { HookPayload } from "./hooks/types.ts";
import {
  addObjection,
  bindObjection,
  loadLedger,
  objectionStatus,
  saveLedger,
  waiveObjection,
} from "./objections.ts";
import { type CrewPaths, resolvePaths, userDirOf, workDir } from "./paths.ts";
import { loadPolicy, SETTABLE_POLICY_KEYS, setPolicyValue, skipAllowed } from "./policy.ts";
import { ensureProfile, loadProfile, refreshProfile, saveProfile } from "./profile.ts";
import { ensureCrewDir } from "./state.ts";
import { integrityOf, recordIntegrity, writeProtectedText } from "./store.ts";
import { recordTdd, type TddStep } from "./tdd.ts";
import type {
  Decision,
  GateName,
  Phase,
  Policy,
  Profile,
  Stack,
  UserConfig,
  WorkItem,
} from "./types.ts";
import {
  GATE_NAMES,
  isPermissionMode,
  isValidatorRule,
  PERMISSION_MODES,
  PHASE_ORDER,
  VALIDATOR_RULES,
} from "./types.ts";
import { VERSION } from "./version.ts";
import {
  activeWork,
  addCriterion,
  addDecision,
  addSkip,
  advancePhase,
  answerDecision,
  applyClassification,
  approve,
  createWork,
  type GuardContext,
  loadWork,
  nextPhaseOf,
  openItems,
  PHASES_BY_ROUTE,
  removeCriterion,
  saveWork,
  validatorPreconditions,
} from "./work.ts";

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  stdin(): Promise<string>;
  env: NodeJS.ProcessEnv;
  cwd: string;
}

interface Parsed {
  positional: string[];
  flags: Record<string, string | true>;
  /** Every value a flag was given, in order, for flags that may repeat (`--criterion a --criterion b`). */
  multi: Record<string, string[]>;
  /** Every valued flag in command-line order, so two repeatable flags keep their relative order. */
  ordered: { key: string; value: string }[];
  rest: string[];
}

// Flags that never take a value, so a word after them stays a positional argument.
const BOOLEAN_FLAGS = new Set(["json", "refresh", "force"]);

// The flags each command knows, besides the global --json. A flag outside the list is refused, so
// a misspelt or misplaced one never passes in silence (finding 7: `start --kind` created
// behaviour criteria). `hook` is not here: Claude Code calls it, and its payload is on stdin.
const KNOWN_FLAGS: Record<string, readonly string[]> = {
  detect: ["refresh"],
  profile: ["target", "stack", "force", "timeout"],
  policy: [],
  accept: [],
  start: ["answers", "criterion", "preserve"],
  classify: ["answers"],
  criteria: ["kind"],
  decision: ["default"],
  decide: ["mode", "validator"],
  objection: ["by", "severity", "criterion", "reason", "mode"],
  approve: ["mode", "validator"],
  phase: [],
  await: [],
  resume: [],
  tdd: ["reason"],
  gate: ["only"],
  skip: ["reason", "mode"],
  evidence: [],
  status: [],
  mode: [],
  config: [],
  version: [],
  help: [],
};

function parse(argv: string[]): Parsed {
  const parsed: Parsed = { positional: [], flags: {}, multi: {}, ordered: [], rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      parsed.rest = argv.slice(i + 1);
      break;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--") && !BOOLEAN_FLAGS.has(key)) {
        parsed.flags[key] = next;
        const values = parsed.multi[key] ?? [];
        values.push(next);
        parsed.multi[key] = values;
        parsed.ordered.push({ key, value: next });
        i++;
      } else parsed.flags[key] = true;
    } else parsed.positional.push(arg);
  }
  return parsed;
}

/** The first flag the command does not know, as a refusal, or null when every flag is known. */
function unknownFlag(command: string, parsed: Parsed): Outcome | null {
  const known = KNOWN_FLAGS[command];
  if (!known) return null;
  const unknown = Object.keys(parsed.flags).find((k) => k !== "json" && !known.includes(k));
  if (unknown === undefined) return null;
  const takes = [...known, "json"].map((k) => `--${k}`).join(", ");
  const hint =
    command === "start" && unknown === "kind"
      ? '; for a criterion that existing tests keep green use --preserve "<text>"'
      : "";
  return refuse(`unknown flag --${unknown} for ${command} (it takes ${takes})${hint}`);
}

/** `stdout` prints the text on stdout even when the code is not 0: the text is a result, not an error. */
type Outcome = { code: number; text: string; data?: Record<string, unknown>; stdout?: boolean };
const ok = (text: string, data: Record<string, unknown> = {}): Outcome => ({ code: 0, text, data });
const refuse = (text: string, data: Record<string, unknown> = {}): Outcome => ({
  code: 1,
  text,
  data,
});

interface Env {
  paths: CrewPaths;
  profile: Profile;
  policy: Policy;
  config: UserConfig;
  tampered: boolean;
  /** Protected files changed outside the engine, each with the `crew accept` target that trusts it again. */
  tamperedFiles: TamperedFile[];
}

interface TamperedFile {
  file: string;
  accept: string;
}

interface Opened {
  work: WorkItem;
  tampered: boolean;
}

const INACTIVE =
  "crew is inactive here: not a git repository and no .crew/ folder; run crew detect in the project root to activate it";

function tamperMessage({ file, accept }: TamperedFile): string {
  return `state changed outside the engine: ${file}; the user can accept it with crew accept ${accept}`;
}

function load(paths: CrewPaths): Env {
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  ensureCrewDir(paths, policy.policy);
  const tamperedFiles: TamperedFile[] = [];
  if (profile.tampered) tamperedFiles.push({ file: ".crew/profile.json", accept: "profile" });
  if (policy.tampered) tamperedFiles.push({ file: ".crew/policy.json", accept: "policy" });
  return {
    paths,
    profile: profile.profile,
    policy: policy.policy,
    config: loadConfig(paths),
    tampered: tamperedFiles.length > 0,
    tamperedFiles,
  };
}

function openWork(env: Env, id: string | undefined): Opened | Outcome {
  if (!id) return refuse("a work item id is required");
  const read = loadWork(env.paths, id);
  if (!read.work) {
    return read.tampered
      ? refuse(tamperMessage({ file: `.crew/work/${id}/work.json`, accept: id }))
      : refuse(`unknown work item: ${id}`);
  }
  return { work: read.work, tampered: read.tampered };
}

/**
 * Every command that saves state refuses while any state it would build on was changed outside
 * the engine: saving would record new hashes and pass the change off as the engine's own work.
 */
function tamperRefusal(env: Env, opened?: Opened): Outcome | null {
  const found = [...env.tamperedFiles];
  if (opened) {
    const base = `.crew/work/${opened.work.id}`;
    if (opened.tampered) found.push({ file: `${base}/work.json`, accept: opened.work.id });
    if (loadEvidence(env.paths, opened.work.id).tampered)
      found.push({ file: `${base}/evidence.json`, accept: opened.work.id });
    if (loadLedger(env.paths, opened.work.id).tampered)
      found.push({ file: `${base}/objections.json`, accept: opened.work.id });
  }
  const first = found[0];
  return first ? refuse(tamperMessage(first)) : null;
}

/**
 * The step names a skip can carry, so the report and the verdict agree on what was skipped:
 * `lint` is `gate:lint`, `AC-1` is `tdd:AC-1`, and a phase is its own name. A bare `build` is the
 * build gate, since skipping the build phase itself is not a thing.
 */
function skipStep(work: WorkItem, raw: string): string | null {
  const isGate = (name: string) => GATE_NAMES.includes(name as GateName);
  const isCriterion = (id: string) => work.criteria.some((c) => c.id === id);
  if (isGate(raw)) return `gate:${raw}`;
  if (isCriterion(raw)) return `tdd:${raw}`;
  if (raw.startsWith("gate:") && isGate(raw.slice(5))) return raw;
  if (raw.startsWith("tdd:") && isCriterion(raw.slice(4))) return raw;
  if (PHASE_ORDER.includes(raw as Phase)) return raw;
  return null;
}

/** The user trusts the current content of a target's protected files again. Asks the user (PreToolUse). */
function accept(env: Env, target: string): Outcome {
  if (target === "profile" || target === "policy") {
    if (!recordIntegrity(env.paths, join(env.paths.crewDir, `${target}.json`)))
      return refuse(`no .crew/${target}.json to accept`);
    return ok(`${target} accepted: its current content is now the trusted version`, {
      accepted: target,
    });
  }
  const dir = workDir(env.paths, target);
  if (!/^[\w.-]+$/.test(target) || target.includes("..") || !existsSync(join(dir, "work.json")))
    return refuse(`unknown work item: ${target}`);
  const files = ["work.json", "evidence.json", "report.md", "objections.json"].filter((name) =>
    recordIntegrity(env.paths, join(dir, name)),
  );
  return ok(`${target} accepted: ${files.join(", ")} now trusted as they are`, {
    accepted: target,
    files,
  });
}

/** Opens a work item for a command that saves it; refuses when its state cannot be trusted. */
function openForChange(env: Env, id: string | undefined): Opened | Outcome {
  const opened = openWork(env, id);
  if (isOutcome(opened)) return opened;
  return tamperRefusal(env, opened) ?? opened;
}

function isOutcome(value: unknown): value is Outcome {
  return typeof value === "object" && value !== null && "code" in value && "text" in value;
}

/**
 * Who takes a user-only decision. Without `--mode` a person decided: through the prompt, or, under
 * the policy's `attendedDecisions: relay`, in the conversation with the agent relaying it (the hook
 * let the command through with no prompt, reading the same policy). With `--mode`, the hook found no
 * person watching (a headless session, or a mode that shows no prompt) and the agent decided in
 * that mode.
 */
function decisionFlag(parsed: Parsed, policy: Policy): Decision | Outcome {
  const mode = parsed.flags.mode;
  if (mode === undefined)
    return policy.attendedDecisions === "relay" ? { by: "user", relayed: true } : { by: "user" };
  if (!isPermissionMode(mode)) {
    return refuse(
      `--mode names the permission mode of a session with no person watching: ${PERMISSION_MODES.slice(0, -1).join(", ")} or ${PERMISSION_MODES.at(-1)}`,
    );
  }
  return { by: "agent", mode };
}

/**
 * A decision the validator takes: only with `--mode` (no person watching) and a known rule. Without
 * `--validator` the flag logic of `decisionFlag` applies unchanged.
 */
function validatorFlag(parsed: Parsed, policy: Policy): Decision | Outcome {
  const rule = parsed.flags.validator;
  if (rule === undefined) return decisionFlag(parsed, policy);
  if (!isValidatorRule(rule))
    return refuse(`unknown validator rule: ${String(rule)} (${VALIDATOR_RULES.join(", ")})`);
  if (parsed.flags.mode === undefined) {
    // With a person present only the mechanical rule applies, and the engine checks it: when the gap
    // round is complete there is no question to ask (0.3.0). Everything else, the person answers.
    if (rule !== "complete-gap-round") {
      return refuse(
        "with a person present, a person answers: the validator takes a stated default only where no person is watching (add --mode <mode>)",
      );
    }
    return { by: "validator", rule };
  }
  const base = decisionFlag(parsed, policy);
  if (isOutcome(base)) return base;
  return { by: "validator", mode: base.mode, rule };
}

/** The decision as the report will show it: who, and whether the policy counts it. */
function decisionText(policy: Policy, decision: Decision): string {
  const note = countedNote(policy, decision);
  return `${decidedBy(decision)}${note ? ` (${note.slice(2)})` : ""}`;
}

function guardContext(env: Env, work: WorkItem, tampered: boolean): GuardContext {
  const dir = workDir(env.paths, work.id);
  const result = assess(env.paths, work, env.profile, env.policy, env.tampered || tampered);
  return {
    specText: readText(join(dir, "spec.md")),
    conclaveText: readText(join(dir, "conclave.md")),
    ledger: loadLedger(env.paths, work.id).ledger,
    planExists: existsSync(join(dir, "plan.md")),
    evidence: result.evidence,
    proven: result.verdict === "proven",
    unproven: result.unproven,
    policy: env.policy,
  };
}

function logDecision(env: Env, work: WorkItem, answers: Answers): void {
  if (!env.config.decisions.log) return;
  const line = JSON.stringify({
    at: nowIso(),
    work: work.id,
    input: work.input.slice(0, 500),
    answers,
    route: work.route,
    reasons: work.routeReasons,
  });
  const file = join(env.paths.localDir, "decisions.jsonl");
  writeText(file, `${readText(file) ?? ""}${line}\n`);
}

function parseAnswers(raw: string): Answers | Outcome {
  try {
    return validateAnswers(JSON.parse(raw));
  } catch (error) {
    if (error instanceof AnswerError) return refuse(`invalid answers: ${error.message}`);
    return refuse("answers must be valid JSON");
  }
}

function classify(env: Env, work: WorkItem, answers: Answers): void {
  const decision = computeRoute(answers, [], env.policy);
  applyClassification(work, answers.work_type, decision);
  logDecision(env, work, answers);
}

function gateSummary(
  work: WorkItem,
  verdict: string,
  unproven: string[],
  runs: { gate: string; target: string; stack?: string; status: string; durationMs: number }[],
): string {
  const lines = runs.map(
    (r) =>
      `  ${r.gate} (${r.target}${r.stack ? `, ${r.stack}` : ""}): ${r.status} in ${(r.durationMs / 1000).toFixed(1)}s`,
  );
  lines.push(verdict === "proven" ? `Proven: ${work.id}` : `Not proven: ${unproven.join("; ")}`);
  return lines.join("\n");
}

async function dispatch(parsed: Parsed, io: CliIo): Promise<Outcome> {
  const [command, ...args] = parsed.positional;
  if (parsed.flags.version || command === "version") return ok(VERSION, { version: VERSION });
  if (command === "hook") {
    const event = args[0] ?? "";
    let payload: Record<string, unknown> = {};
    try {
      const raw = await io.stdin();
      payload = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }
    if (typeof payload.cwd !== "string") payload.cwd = io.cwd;
    return ok(JSON.stringify(handleHook(event, payload as HookPayload, io.env)), {
      hookEvent: event,
    });
  }
  const badFlag = unknownFlag(command ?? "help", parsed);
  if (badFlag) return badFlag;
  if (!command || command === "help") return ok(HELP);
  if (command === "mode" || command === "config")
    return settings(command, args, { userDir: userDirOf(io.env) });
  let paths = resolvePaths(io.cwd, io.env);
  if (!paths && command === "detect") {
    // `crew detect` is how a folder without git becomes a crew project.
    ensureDir(join(resolve(io.cwd), ".crew"));
    paths = resolvePaths(io.cwd, io.env);
  }
  if (!paths) return refuse(INACTIVE);
  const env = load(paths);

  switch (command) {
    case "detect": {
      if (parsed.flags.refresh) {
        const refused = tamperRefusal(env);
        if (refused) return refused;
      }
      const previous = parsed.flags.refresh ? loadProfile(env.paths).profile : null;
      const profile = parsed.flags.refresh ? detectProfile(env.paths.root, previous) : env.profile;
      if (parsed.flags.refresh) {
        saveProfile(env.paths, profile);
        // Only bless a policy that has no recorded hash yet: re-recording here would let a tampered policy
        // pass as trusted. `crew policy accept` is the user-approved way to accept a hand edit.
        if (integrityOf(env.paths)[".crew/policy.json"] === undefined) {
          recordIntegrity(env.paths, join(env.paths.crewDir, "policy.json"));
        }
      }
      const missing = missingTestCommands(profile);
      const lines = profile.targets.map(
        (t) =>
          `  ${t.path} (${t.stack}, ${t.packageManager}${t.workspaceOf ? `, workspace of ${t.workspaceOf}` : ""}): ${
            Object.entries(t.gates)
              .map(([g, c]) => `${g}=${c.command}${c.source === "proposed" ? " [proposed]" : ""}`)
              .join(", ") || "no commands"
          }`,
      );
      if (missing.length)
        lines.push(
          `No test command for: ${missing.map((m) => m.target).join(", ")}. Propose one: crew profile set test "<cmd>" [--target <path>]`,
        );
      return ok(lines.join("\n"), { profile, missing });
    }
    case "profile": {
      const [sub, gate, cmd] = args;
      if (sub === "set" || sub === "confirm") {
        const refused = tamperRefusal(env);
        if (refused) return refused;
      }
      if (sub === "set") {
        if (!GATE_NAMES.includes(gate as GateName) || gate === "secrets" || !cmd)
          return refuse(
            'usage: crew profile set <build|test|lint|typecheck|deps> "<cmd>" [--target <path>]',
          );
        const targetPath = typeof parsed.flags.target === "string" ? parsed.flags.target : ".";
        const stackFlag = parsed.flags.stack;
        if (stackFlag !== undefined && !STACKS.includes(stackFlag as Stack))
          return refuse(`usage: crew profile set <gate> "<cmd>" --stack <${STACKS.join("|")}>`);
        const stack = stackFlag as Stack | undefined;
        // The person says minutes; the profile keeps milliseconds (finding 23: a flow may take twenty).
        const timeoutFlag = parsed.flags.timeout;
        const minutes = typeof timeoutFlag === "string" ? Number(timeoutFlag) : undefined;
        if (
          timeoutFlag !== undefined &&
          !(minutes !== undefined && minutes > 0 && Number.isFinite(minutes))
        )
          return refuse(
            'usage: crew profile set <gate> "<cmd>" --timeout <minutes> (a positive number)',
          );
        // Two manifests in one folder are two targets at one path; the stack says which one is meant.
        const atPath = env.profile.targets.filter((t) => t.path === targetPath);
        if (stack === undefined && atPath.length > 1) {
          const stacks = atPath.map((t) => t.stack);
          return refuse(
            `two targets at ${targetPath} (${stacks.join(", ")}): say which one with --stack <${stacks.join("|")}>`,
          );
        }
        let target = stack === undefined ? atPath[0] : atPath.find((t) => t.stack === stack);
        if (!target) {
          target = {
            path: targetPath,
            stack: stack ?? "other",
            packageManager: "unknown",
            gates: {},
            timeoutMs: 10 * 60 * 1000,
          };
          env.profile.targets.push(target);
        }
        const where = stack === undefined ? targetPath : `${targetPath} (${stack})`;
        const current = target.gates[gate as GateName];
        // One step, one decision (0.3.0): the command is the user's and confirmed as it is set. A
        // command a person already confirmed is replaced only on purpose.
        if (current?.source === "confirmed" && !parsed.flags.force)
          return refuse(
            `${gate} for ${where} already has a confirmed command (${current.command}); replacing it needs --force: crew profile set ${gate} "<cmd>" --force`,
          );
        target.gates[gate as GateName] = {
          command: cmd,
          source: "confirmed",
          ...(minutes ? { timeoutMs: Math.round(minutes * 60 * 1000) } : {}),
        };
        saveProfile(env.paths, env.profile);
        return ok(`${gate} for ${where} set and confirmed: ${cmd}`, {
          target: targetPath,
          ...(stack ? { stack } : {}),
          gate,
          command: cmd,
        });
      }
      if (sub === "confirm") {
        if (gate !== undefined && !GATE_NAMES.includes(gate as GateName))
          return refuse("usage: crew profile confirm [<gate>]");
        // The user sees exactly what they are trusting.
        const confirmed: string[] = [];
        for (const target of env.profile.targets)
          for (const [name, command] of Object.entries(target.gates))
            if (command.source === "proposed" && (gate === undefined || name === gate)) {
              command.source = "confirmed";
              confirmed.push(`${name}: ${command.command}`);
            }
        saveProfile(env.paths, env.profile);
        return ok([`confirmed ${confirmed.length} command(s)`, ...confirmed].join("\n  "), {
          confirmed: confirmed.length,
          commands: confirmed,
        });
      }
      return refuse("usage: crew profile set|confirm");
    }
    case "policy": {
      if (args[0] === "accept") return accept(env, "policy");
      if (args[0] === "set") {
        const [, key, value] = args;
        if (!key || value === undefined) {
          return refuse(
            `usage: crew policy set <${Object.keys(SETTABLE_POLICY_KEYS).join("|")}> <value>`,
          );
        }
        // Asked even under relay (PreToolUse): the policy that governs signatures is signed by a prompt.
        const result = setPolicyValue(env.paths, key, value);
        if ("refused" in result) return refuse(result.refused);
        return ok(`policy ${key}: ${value}`, result);
      }
      return refuse("usage: crew policy accept | crew policy set <key> <value>");
    }
    case "accept": {
      if (!args[0]) return refuse("usage: crew accept <id|profile|policy>");
      return accept(env, args[0]);
    }
    case "start": {
      const input = args.join(" ").trim();
      if (!input) return refuse(`usage: crew start "<request>" --answers '<json>'`);
      // The route comes from the typed answers; without them every item would sit on a default route.
      if (typeof parsed.flags.answers !== "string")
        return refuse(
          "answers are required: answer the nine typed questions from the crew skill (references/receive.md) and pass them with --answers",
        );
      // Validate before creating anything, so a bad answer set leaves no half-made work item behind.
      const answers = parseAnswers(parsed.flags.answers);
      if (isOutcome(answers)) return answers;
      if (answers.work_type === "question")
        return ok("question: answer the user; no work item is created", { id: null });
      const previous = activeWork(env.paths);
      const previousProven =
        !!previous?.work &&
        assess(env.paths, previous.work, env.profile, env.policy, env.tampered || previous.tampered)
          .verdict === "proven";
      const warning =
        previous?.work && !previousProven
          ? `warning: ${previous.work.id} is not proven and is no longer the active work item\n`
          : "";
      // The change is measured from HEAD, so whatever is uncommitted now is measured with it,
      // unless an earlier item proved it: then the new item starts from that proven state.
      const uncommitted = isGitRepo(env.paths.root)
        ? changedWatchedPaths(env.paths.root, env.profile)
        : [];
      const baseFiles = previousProven ? hashPaths(env.paths.root, uncommitted) : {};
      const inherited = previousProven ? [] : uncommitted;
      const inheritedWarning = inherited.length
        ? `warning: uncommitted changes in ${inherited.join(", ")} count as this item's change; commit them first if they are not\n`
        : "";
      const provenNote =
        previousProven && uncommitted.length && previous?.work
          ? `note: uncommitted changes in ${uncommitted.join(", ")} are ${previous.work.id}'s proven work and not this item's\n`
          : "";
      // Other items still being worked on, while the tree holds uncommitted changes: a second
      // session on one checkout (finding 9). The proof covers the whole tree, so the record says so.
      const neighbours = uncommitted.length ? openItems(env.paths).map((w) => w.id) : [];
      const work = createWork(env.paths, input, baseFiles);
      if (neighbours.length)
        work.sharedCheckout = { with: neighbours, paths: uncommitted, at: work.createdAt };
      const sharedWarning = neighbours.length
        ? `warning: this checkout is shared with ${neighbours.join(", ")}, which ${neighbours.length === 1 ? "is" : "are"} open with uncommitted changes in ${uncommitted.join(", ")}; a second session on one checkout blocks turn ends and proves half-written code: work in a worktree (git worktree add ../<name> -b <branch>)\n`
        : "";
      classify(env, work, answers);
      // Both flags repeat and keep their command-line order, so the numbers read as typed.
      const criteria = parsed.ordered
        .filter((f) => f.key === "criterion" || f.key === "preserve")
        .map((f) => addCriterion(work, f.value, f.key === "preserve" ? "preserve" : "behavior"));
      // On the fast route the criteria are all that stands before build; with them given, go there.
      if (work.route === "fast" && criteria.length > 0)
        advancePhase(work, guardContext(env, work, false));
      saveWork(env.paths, work);
      const lines = criteria.map((c) => `\n  ${c.id} (${c.kind}): ${c.text}`).join("");
      return ok(
        `${warning}${sharedWarning}${inheritedWarning}${provenNote}started ${work.id} (route ${work.route}: ${work.routeReasons.join("; ")})${lines}`,
        {
          id: work.id,
          route: work.route,
          phase: work.phase,
          routeReasons: work.routeReasons,
          replaced: warning ? previous?.work?.id : null,
          criteria,
          inherited,
          shared: work.sharedCheckout ?? null,
          proven:
            previousProven && previous?.work ? { of: previous.work.id, paths: uncommitted } : null,
        },
      );
    }
    case "classify": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (typeof parsed.flags.answers !== "string")
        return refuse("usage: crew classify <id> --answers <json>");
      const answers = parseAnswers(parsed.flags.answers);
      if (isOutcome(answers)) return answers;
      classify(env, opened.work, answers);
      saveWork(env.paths, opened.work);
      return ok(
        `${opened.work.id}: route ${opened.work.route} (${opened.work.routeReasons.join("; ")})`,
        { id: opened.work.id, route: opened.work.route, riskAreas: opened.work.riskAreas },
      );
    }
    case "criteria": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (args[1] === "remove" && args[2]) {
        const { evidence } = loadEvidence(env.paths, opened.work.id);
        const outcome = removeCriterion(
          opened.work,
          evidence,
          args[2],
          loadLedger(env.paths, opened.work.id).ledger,
        );
        if ("refused" in outcome) return refuse(outcome.refused);
        saveWork(env.paths, opened.work);
        const { removed } = outcome;
        return ok(`${removed.id} (${removed.kind}) removed: ${removed.text}`, { removed });
      }
      const text = args.slice(2).join(" ").trim();
      if (args[1] !== "add" || !text)
        return refuse(
          'usage: crew criteria <id> add "<criterion>" [--kind preserve|observed] | crew criteria <id> remove <AC-n>',
        );
      const kind =
        parsed.flags.kind === "preserve" || parsed.flags.kind === "observed"
          ? parsed.flags.kind
          : "behavior";
      const criterion = addCriterion(opened.work, text, kind);
      saveWork(env.paths, opened.work);
      return ok(`${criterion.id} (${kind}): ${criterion.text}`, { criterion });
    }
    case "objection": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const { ledger } = loadLedger(env.paths, opened.work.id);
      const usage =
        'usage: crew objection <id> add "<text>" --by <role> --severity blocking|advisory | resolve O-n --criterion AC-k | waive O-n --reason "<why>" [--mode <mode>]';
      if (args[1] === "add") {
        const text = args.slice(2).join(" ").trim();
        const by = typeof parsed.flags.by === "string" ? parsed.flags.by.trim() : "";
        const severity = parsed.flags.severity;
        if (!text || !by) return refuse(usage);
        if (severity !== "blocking" && severity !== "advisory")
          return refuse("severity is blocking or advisory");
        const objection = addObjection(ledger, text, by, severity);
        saveLedger(env.paths, opened.work.id, ledger);
        return ok(`${objection.id} (${severity}, raised by ${by}): ${objection.text}`, {
          objection,
        });
      }
      if (args[1] === "resolve" && args[2]) {
        if (typeof parsed.flags.criterion !== "string") return refuse(usage);
        const result = bindObjection(ledger, opened.work, args[2], parsed.flags.criterion);
        if ("refused" in result) return refuse(result.refused);
        saveLedger(env.paths, opened.work.id, ledger);
        return ok(`${result.id} is resolved when ${result.criterion} is proven`, {
          objection: result,
        });
      }
      if (args[1] === "waive" && args[2]) {
        const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
        if (!reason) return refuse(usage);
        const decision = decisionFlag(parsed, env.policy);
        if (isOutcome(decision)) return decision;
        const result = waiveObjection(ledger, args[2], reason, decision);
        if ("refused" in result) return refuse(result.refused);
        saveLedger(env.paths, opened.work.id, ledger);
        const waiver = result.waived ?? { by: "user" as const };
        return ok(
          `${result.id} waived ${decidedBy(waiver)}${countedNote(env.policy, waiver)}: ${reason}`,
          { objection: result },
        );
      }
      return refuse(usage);
    }
    case "decision": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const question = args.slice(2).join(" ").trim();
      if (args[1] !== "add" || !question)
        return refuse('usage: crew decision <id> add "<question>" [--default "<answer>"]');
      const dflt = typeof parsed.flags.default === "string" ? parsed.flags.default : undefined;
      const decision = addDecision(opened.work, question, dflt);
      saveWork(env.paths, opened.work);
      return ok(`${decision.id}: ${decision.question}${dflt ? ` (default: ${dflt})` : ""}`, {
        decision,
      });
    }
    case "decide": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const id = args[1];
      if (!id)
        return refuse(
          'usage: crew decide <id> D-n "<answer>" [--mode <mode> --validator stated-default]',
        );
      const who = validatorFlag(parsed, env.policy);
      if (isOutcome(who)) return who;
      if (who.by === "validator" && who.rule !== "stated-default")
        return refuse(
          "a decision's default is taken by the validator under the stated-default rule",
        );
      const answer = args.slice(2).join(" ").trim() || undefined;
      const result = answerDecision(opened.work, id, answer, who);
      if ("refused" in result) return refuse(result.refused);
      saveWork(env.paths, opened.work);
      return ok(`${result.id} answered ${decidedBy(result)}: ${result.answer}`, {
        decision: result,
      });
    }
    case "approve": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (args[1] !== "spec")
        return refuse(
          "usage: crew approve <id> spec [--mode <mode> [--validator complete-gap-round]]",
        );
      const decision = validatorFlag(parsed, env.policy);
      if (isOutcome(decision)) return decision;
      if (decision.by === "validator") {
        // The engine checks the rule's mechanical part before anything is recorded (SP2 §9).
        if (decision.rule !== "complete-gap-round")
          return refuse("a spec is approved by the validator under the complete-gap-round rule");
        const missing = validatorPreconditions(
          decision.rule,
          opened.work,
          guardContext(env, opened.work, opened.tampered),
        );
        if (missing.length)
          return refuse(
            `the complete-gap-round rule does not hold; missing:\n  ${missing.join("\n  ")}`,
            { missing },
          );
      }
      approve(opened.work, "spec", decision);
      saveWork(env.paths, opened.work);
      return ok(`spec approved for ${opened.work.id} ${decisionText(env.policy, decision)}`, {
        approvals: opened.work.approvals,
      });
    }
    case "phase": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (args[1] !== "next") return refuse("usage: crew phase <id> next");
      const result = advancePhase(opened.work, guardContext(env, opened.work, opened.tampered));
      if (!result.ok)
        return refuse(`cannot enter the next phase; missing:\n  ${result.missing.join("\n  ")}`, {
          missing: result.missing,
          phase: opened.work.phase,
        });
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: phase ${result.phase}`, { phase: result.phase });
    }
    case "await":
    case "resume": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      opened.work.awaiting = command === "await" ? "user" : null;
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: ${command === "await" ? "waiting for the user" : "resumed"}`, {
        awaiting: opened.work.awaiting,
      });
    }
    case "tdd": {
      const [step, id, criterion] = args;
      const opened = openForChange(env, id);
      if (isOutcome(opened)) return opened;
      if (!["red", "green", "before", "after", "observed"].includes(step ?? "") || !criterion)
        return refuse(
          'usage: crew tdd <red|green|before|after|observed> <id> <criterion> [--reason "<why>"] [-- <cmd>]',
        );
      const { evidence } = loadEvidence(env.paths, opened.work.id);
      const override = parsed.rest.length ? parsed.rest.join(" ") : undefined;
      const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason : undefined;
      const outcome = await recordTdd(
        env.paths,
        opened.work,
        evidence,
        env.profile,
        criterion,
        step as TddStep,
        override,
        reason,
      );
      if (outcome.ok) saveEvidence(env.paths, opened.work.id, evidence);
      const tail = outcome.record?.tail ? `\n${outcome.record.tail}` : "";
      return outcome.ok
        ? ok(outcome.message, { record: outcome.record })
        : refuse(`${outcome.message}${tail}`, { record: outcome.record });
    }
    case "gate": {
      const opened = openForChange(env, args[1]);
      if (isOutcome(opened)) return opened;
      if (args[0] !== "run") return refuse("usage: crew gate run <id> [--only a,b]");
      const only =
        typeof parsed.flags.only === "string"
          ? parsed.flags.only
              .split(",")
              .map((g) => g.trim())
              .filter(Boolean)
          : undefined;
      const unknown = only?.find((g) => !GATE_NAMES.includes(g as GateName));
      if (unknown !== undefined) return refuse(`unknown gate: ${unknown}`);
      // The profile follows the manifests before the gates are planned: a script or a lockfile the
      // work added is picked up here, with no detect --refresh and no profile set (finding 23).
      const refreshed = refreshProfile(env.paths, env.profile, env.tampered);
      env.profile = refreshed.profile;
      const outcome = await runGates(env.paths, opened.work, env.profile, env.policy, {
        only: only as GateName[] | undefined,
        tampered: env.tampered || opened.tampered,
      });
      // A gate run is the work entering its gate phase, and its delivery when it proves the work;
      // the guards still decide, so a missing record or document keeps the phase where it is. An
      // item already in gate (the usual case after a build gate rewrote a watched file, finding 18)
      // is delivered by the run that proves it, so a phase that is not the next one is passed over.
      for (const target of ["gate", "deliver"] as const) {
        if (nextPhaseOf(opened.work) !== target) continue;
        if (!advancePhase(opened.work, guardContext(env, opened.work, opened.tampered)).ok) break;
      }
      saveWork(env.paths, opened.work);
      // The report is written here too, so a gate run that proves the work is also its delivery.
      writeProtectedText(
        env.paths,
        join(workDir(env.paths, opened.work.id), "report.md"),
        renderReport(
          opened.work,
          outcome.evidence,
          env.policy,
          loadLedger(env.paths, opened.work.id).ledger,
        ),
      );
      const raised = outcome.raised
        ? `Route raised to ${outcome.raised}: ${opened.work.routeReasons.at(-1)}\n`
        : "";
      // The summary is the result either way; the exit code says whether the work is proven, so a
      // command chain stops at "Not proven" instead of going on to commit (finding 18).
      const picked = refreshed.changed.length
        ? `profile refreshed: ${refreshed.changed.join("; ")}\n`
        : "";
      return {
        code: outcome.verdict === "proven" ? 0 : 1,
        stdout: true,
        text:
          picked +
          raised +
          gateSummary(opened.work, outcome.verdict, outcome.unproven, outcome.evidence.runs),
        data: {
          verdict: outcome.verdict,
          unproven: outcome.unproven,
          runs: outcome.evidence.runs,
          raised: outcome.raised,
          route: opened.work.route,
          refreshed: refreshed.changed,
        },
      };
    }
    case "skip": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const raw = args[1];
      const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
      if (!raw || !reason) return refuse('usage: crew skip <id> <step> --reason "<text>"');
      const step = skipStep(opened.work, raw);
      if (!step) return refuse(`unknown step: ${raw}`);
      if (!skipAllowed(env.policy, step)) {
        return refuse(
          step.startsWith("gate:")
            ? `the team policy does not allow skipping ${step}: gates are mandatory. Fix what fails, set the gate's command to the team's own flow (crew profile set ${step.slice(5)} "<cmd>"), or have a person list the gate in policy.json allowSkips.`
            : `the team policy does not allow skipping ${step}`,
        );
      }
      if (env.config.mode === "pilot" && (step === "gate:secrets" || step === "gate:deps"))
        return refuse(`in pilot mode the ${step.slice(5)} gate cannot be skipped`);
      const decision = decisionFlag(parsed, env.policy);
      if (isOutcome(decision)) return decision;
      addSkip(opened.work, step, reason, decision);
      saveWork(env.paths, opened.work);
      return ok(
        `skipped ${step} on ${opened.work.id} ${decisionText(env.policy, decision)}: ${reason}`,
        {
          skips: opened.work.skips,
        },
      );
    }
    case "evidence": {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened)) return opened;
      const refused = tamperRefusal(env, opened);
      const result = assess(
        env.paths,
        opened.work,
        env.profile,
        env.policy,
        env.tampered || opened.tampered,
      );
      result.evidence.verdict = result.verdict;
      result.evidence.unproven = result.unproven;
      const report = renderReport(
        opened.work,
        result.evidence,
        env.policy,
        loadLedger(env.paths, opened.work.id).ledger,
      );
      // Tampered state is still shown, but never saved: saving would record it as the engine's own.
      if (refused)
        return refuse(`${refused.text}\n\n${report}`, {
          verdict: result.verdict,
          unproven: result.unproven,
        });
      saveEvidence(env.paths, opened.work.id, result.evidence);
      writeProtectedText(env.paths, join(workDir(env.paths, opened.work.id), "report.md"), report);
      return ok(report, { verdict: result.verdict, unproven: result.unproven });
    }
    case "status": {
      const active = activeWork(env.paths);
      if (!active?.work) return ok("no active work item", { active: null });
      const result = assess(
        env.paths,
        active.work,
        env.profile,
        env.policy,
        env.tampered || active.tampered,
      );
      const text = `${active.work.id} "${active.work.title}"\n  phase ${active.work.phase}, route ${active.work.route}${active.work.awaiting ? ", waiting for the user" : ""}\n${gateSummary(active.work, result.verdict, result.unproven, result.evidence.runs)}`;
      const work = active.work;
      return ok(text, {
        active: work.id,
        title: work.title,
        type: work.type,
        phase: work.phase,
        route: work.route,
        awaiting: work.awaiting,
        baseCommit: work.baseCommit,
        phases: PHASES_BY_ROUTE[work.route],
        verdict: result.verdict,
        unproven: result.unproven,
        // One name per gate, so the strip can draw a planned gate that has not run yet.
        expected: [...new Set(result.expected.map((p) => p.gate))],
        criteria: work.criteria.map((c) => ({
          id: c.id,
          kind: c.kind,
          text: c.text,
          tdd: tddSummary(work, result.evidence, c.id, c.kind, env.policy),
        })),
        runs: result.evidence.runs.map((r) => ({
          gate: r.gate,
          target: r.target,
          ...(r.stack ? { stack: r.stack } : {}),
          status: r.status,
          durationMs: r.durationMs,
          ...(r.reason ? { reason: r.reason } : {}),
        })),
        skips: work.skips.map((s) => ({ step: s.step, reason: s.reason })),
        objections: loadLedger(env.paths, work.id).ledger.objections.map((o) => ({
          id: o.id,
          severity: o.severity,
          status: objectionStatus(o, work, result.evidence, env.policy),
        })),
      });
    }
    default:
      return refuse(`unknown command: ${command}\n${HELP}`);
  }
}

/** The user's settings live in their home folder, so these work in any folder. */
function settings(command: "mode" | "config", args: string[], user: { userDir: string }): Outcome {
  const config = loadConfig(user);
  if (command === "mode") {
    if (!args[0]) return ok(config.mode, { mode: config.mode });
    try {
      saveConfig(user, setConfigValue(config, "mode", args[0]));
    } catch (error) {
      return refuse((error as Error).message);
    }
    return ok(`mode: ${args[0]}`, { mode: args[0] });
  }
  const [key, value] = args;
  if (!key) return ok(JSON.stringify(config), { config });
  if (value === undefined) {
    const current =
      key === "mode" ? config.mode : key === "decisions.log" ? config.decisions.log : undefined;
    return current === undefined
      ? refuse(`unknown setting: ${key}`)
      : ok(String(current), { key, value: current });
  }
  try {
    saveConfig(user, setConfigValue(config, key, value));
  } catch (error) {
    return refuse((error as Error).message);
  }
  return ok(`${key}: ${value}`, {
    key,
    value: key === "decisions.log" ? value === "true" : value,
  });
}

const STACKS: readonly Stack[] = ["node", "php", "python", "other"];

const HELP = `crew ${VERSION}
  detect [--refresh]                    build or refresh the project profile
  profile set <gate> "<cmd>" [--target p] [--stack s] [--timeout m]  set a gate command, confirmed in one step (asks the user); m minutes
  profile set <gate> "<cmd>" --force    replace a command a person already confirmed (asks the user)
  profile confirm [<gate>]              confirm commands the detector only guessed (asks the user)
  policy accept                         trust the current policy.json after a hand edit (asks the user)
  policy set <key> <value>              attendedDecisions prompt|relay, unattendedDecisions wait|count|validator (asks the user)
  accept <id|profile|policy>            trust state changed outside the engine (asks the user)
  start "<request>" --answers <json>    create a work item from the typed answers
      [--criterion "<text>"] [--preserve "<text>"]   criteria, repeatable; preserve: existing tests stay green
  classify <id> --answers <json>        record typed answers and compute the route
  criteria <id> add "<text>" [--kind preserve|observed]
  criteria <id> remove <AC-n>           take out a criterion no test-first record or skip names
  decision <id> add "<question>" [--default "<answer>"]   a decision only the user can make (gap round)
  decide <id> D-n "<answer>"            record the user's answer (asks the user)
      --mode <mode> --validator stated-default   no person watching: the validator takes the default
  objection <id> add "<text>" --by <role> --severity blocking|advisory   file an objection (ledger)
  objection <id> resolve O-n --criterion AC-k   resolved when that criterion is proven
  objection <id> waive O-n --reason "<why>"     the user decides against it (asks the user)
  approve <id> spec                     record the user's approval (asks the user)
      --mode auto|bypassPermissions|dontAsk   no person watching: recorded as the agent's decision
  phase <id> next                       advance when the guard holds
  await <id> user | resume <id>         mark or clear waiting for the user
  tdd <red|green|before|after|observed> <id> <criterion> [--reason "<why>"] [-- <cmd>]
  gate run <id> [--only a,b]            run the gates the route requires
  skip <id> <step> --reason "<text>"    record a skip (asks the user; --mode as for approve)
  evidence <id>                         write and print the report
  status | mode [m] | config <key> [v]  state and settings
  --json on any command prints the machine form`;

export async function main(argv: string[], io: CliIo): Promise<number> {
  const parsed = parse(argv);
  let outcome: Outcome;
  try {
    // The PreToolUse hook recognises user-only verbs by `crew <verb>`; a flag ahead of the command
    // (or ahead of the verb of profile/policy) would run them without the hook asking.
    const first = argv[0] ?? "";
    const leadingFlag =
      (first.startsWith("--") && first !== "--version") ||
      ((first === "profile" || first === "policy") && (argv[1] ?? "").startsWith("--"));
    outcome = leadingFlag
      ? refuse("the command comes first: crew <command> [arguments] [--flags]")
      : await dispatch(parsed, io);
  } catch (error) {
    if (parsed.positional[0] === "hook") {
      io.stdout("{}\n");
      return 0;
    }
    io.stderr(`crew: ${(error as Error).message}\n`);
    return 2;
  }
  if (parsed.positional[0] === "hook") {
    io.stdout(`${outcome.text}\n`);
    return 0;
  }
  if (parsed.flags.json)
    io.stdout(
      `${JSON.stringify({ ok: outcome.code === 0, message: outcome.text, ...outcome.data })}\n`,
    );
  else if (outcome.code === 0 || outcome.stdout) io.stdout(`${outcome.text}\n`);
  else io.stderr(`${outcome.text}\n`);
  return outcome.code;
}
