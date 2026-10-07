import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { AnswerError, type Answers, computeRoute, validateAnswers } from "./classify.ts";
import { loadConfig, saveConfig, setConfigValue } from "./config.ts";
import { detectProfile, missingTestCommands } from "./detect/index.ts";
import { loadEvidence, renderReport, saveEvidence } from "./evidence.ts";
import { ensureDir, nowIso, readText, writeText } from "./fs.ts";
import { assess, runGates } from "./gates.ts";
import { handleHook } from "./hooks/index.ts";
import type { HookPayload } from "./hooks/types.ts";
import { type CrewPaths, resolvePaths, userDirOf, workDir } from "./paths.ts";
import { loadPolicy, skipAllowed } from "./policy.ts";
import { ensureProfile, loadProfile, saveProfile } from "./profile.ts";
import { ensureCrewDir } from "./state.ts";
import { integrityOf, recordIntegrity, writeProtectedText } from "./store.ts";
import { recordTdd, type TddStep } from "./tdd.ts";
import type { GateName, Policy, Profile, UserConfig, WorkItem } from "./types.ts";
import { GATE_NAMES } from "./types.ts";
import { VERSION } from "./version.ts";
import {
  activeWork,
  addCriterion,
  addSkip,
  advancePhase,
  applyClassification,
  approve,
  createWork,
  type GuardContext,
  loadWork,
  saveWork,
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
  rest: string[];
}

function parse(argv: string[]): Parsed {
  const parsed: Parsed = { positional: [], flags: {}, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      parsed.rest = argv.slice(i + 1);
      break;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--") && key !== "json" && key !== "refresh") {
        parsed.flags[key] = next;
        i++;
      } else parsed.flags[key] = true;
    } else parsed.positional.push(arg);
  }
  return parsed;
}

type Outcome = { code: number; text: string; data?: Record<string, unknown> };
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
  }
  const first = found[0];
  return first ? refuse(tamperMessage(first)) : null;
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
  const files = ["work.json", "evidence.json", "report.md"].filter((name) =>
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

function guardContext(env: Env, work: WorkItem, tampered: boolean): GuardContext {
  const dir = workDir(env.paths, work.id);
  const result = assess(env.paths, work, env.profile, env.policy, env.tampered || tampered);
  return {
    specText: readText(join(dir, "spec.md")),
    planExists: existsSync(join(dir, "plan.md")),
    evidence: result.evidence,
    proven: result.verdict === "proven",
    unproven: result.unproven,
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
  runs: { gate: string; target: string; status: string; durationMs: number }[],
): string {
  const lines = runs.map(
    (r) => `  ${r.gate} (${r.target}): ${r.status} in ${(r.durationMs / 1000).toFixed(1)}s`,
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
          `  ${t.path} (${t.stack}, ${t.packageManager}): ${
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
        let target = env.profile.targets.find((t) => t.path === targetPath);
        if (!target) {
          target = {
            path: targetPath,
            stack: "other",
            packageManager: "unknown",
            gates: {},
            timeoutMs: 10 * 60 * 1000,
          };
          env.profile.targets.push(target);
        }
        target.gates[gate as GateName] = { command: cmd, source: "proposed" };
        saveProfile(env.paths, env.profile);
        return ok(
          `proposed ${gate} for ${targetPath}: ${cmd} (unconfirmed until crew profile confirm)`,
          { target: targetPath, gate, command: cmd },
        );
      }
      if (sub === "confirm") {
        let count = 0;
        for (const target of env.profile.targets)
          for (const command of Object.values(target.gates))
            if (command.source === "proposed") {
              command.source = "confirmed";
              count++;
            }
        saveProfile(env.paths, env.profile);
        return ok(`confirmed ${count} command(s)`, { confirmed: count });
      }
      return refuse("usage: crew profile set|confirm");
    }
    case "policy": {
      if (args[0] !== "accept") return refuse("usage: crew policy accept");
      return accept(env, "policy");
    }
    case "accept": {
      if (!args[0]) return refuse("usage: crew accept <id|profile|policy>");
      return accept(env, args[0]);
    }
    case "start": {
      const input = args.join(" ").trim();
      if (!input) return refuse('usage: crew start "<request>" [--answers <json>]');
      // Validate before creating anything, so a bad answer set leaves no half-made work item behind.
      const answers =
        typeof parsed.flags.answers === "string" ? parseAnswers(parsed.flags.answers) : null;
      if (isOutcome(answers)) return answers;
      const work = createWork(env.paths, input);
      if (answers) classify(env, work, answers);
      saveWork(env.paths, work);
      return ok(`started ${work.id} (route ${work.route}: ${work.routeReasons.join("; ")})`, {
        id: work.id,
        route: work.route,
        phase: work.phase,
        routeReasons: work.routeReasons,
      });
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
      const text = args.slice(2).join(" ").trim();
      if (args[1] !== "add" || !text)
        return refuse('usage: crew criteria <id> add "<criterion>" [--kind preserve]');
      const kind = parsed.flags.kind === "preserve" ? "preserve" : "behavior";
      const criterion = addCriterion(opened.work, text, kind);
      saveWork(env.paths, opened.work);
      return ok(`${criterion.id} (${kind}): ${criterion.text}`, { criterion });
    }
    case "approve": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (args[1] !== "spec") return refuse("usage: crew approve <id> spec");
      approve(opened.work, "spec");
      saveWork(env.paths, opened.work);
      return ok(`spec approved for ${opened.work.id}`, { approvals: opened.work.approvals });
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
      if (!["red", "green", "before", "after"].includes(step ?? "") || !criterion)
        return refuse("usage: crew tdd <red|green|before|after> <id> <criterion> [-- <cmd>]");
      const { evidence } = loadEvidence(env.paths, opened.work.id);
      const override = parsed.rest.length ? parsed.rest.join(" ") : undefined;
      const outcome = await recordTdd(
        env.paths,
        opened.work,
        evidence,
        env.profile,
        criterion,
        step as TddStep,
        override,
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
      const outcome = await runGates(env.paths, opened.work, env.profile, env.policy, {
        only: only as GateName[] | undefined,
        tampered: env.tampered || opened.tampered,
      });
      saveWork(env.paths, opened.work);
      const raised = outcome.raised
        ? `Route raised to ${outcome.raised}: ${opened.work.routeReasons.at(-1)}\n`
        : "";
      return ok(
        raised + gateSummary(opened.work, outcome.verdict, outcome.unproven, outcome.evidence.runs),
        {
          verdict: outcome.verdict,
          unproven: outcome.unproven,
          runs: outcome.evidence.runs,
          raised: outcome.raised,
          route: opened.work.route,
        },
      );
    }
    case "skip": {
      const opened = openForChange(env, args[0]);
      if (isOutcome(opened)) return opened;
      const step = args[1];
      const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
      if (!step || !reason) return refuse('usage: crew skip <id> <step> --reason "<text>"');
      if (!skipAllowed(env.policy, step))
        return refuse(`the team policy does not allow skipping ${step}`);
      if (env.config.mode === "pilot" && (step === "gate:secrets" || step === "gate:deps"))
        return refuse(`in pilot mode the ${step.slice(5)} gate cannot be skipped`);
      addSkip(opened.work, step, reason);
      saveWork(env.paths, opened.work);
      return ok(`skipped ${step} on ${opened.work.id}: ${reason}`, { skips: opened.work.skips });
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
      const report = renderReport(opened.work, result.evidence);
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
      return ok(text, {
        active: active.work.id,
        phase: active.work.phase,
        route: active.work.route,
        verdict: result.verdict,
        unproven: result.unproven,
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

const HELP = `crew ${VERSION}
  detect [--refresh]                    build or refresh the project profile
  profile set <gate> "<cmd>" [--target p] propose a gate command (unconfirmed)
  profile confirm                       confirm proposed commands (asks the user)
  policy accept                         trust the current policy.json after a hand edit (asks the user)
  accept <id|profile|policy>            trust state changed outside the engine (asks the user)
  start "<request>" [--answers <json>]  create a work item
  classify <id> --answers <json>        record typed answers and compute the route
  criteria <id> add "<text>" [--kind preserve]
  approve <id> spec                     record the user's approval (asks the user)
  phase <id> next                       advance when the guard holds
  await <id> user | resume <id>         mark or clear waiting for the user
  tdd <red|green|before|after> <id> <criterion> [-- <cmd>]
  gate run <id> [--only a,b]            run the gates the route requires
  skip <id> <step> --reason "<text>"    record a skip (asks the user)
  evidence <id>                         write and print the report
  status | mode [m] | config <key> [v]  state and settings
  --json on any command prints the machine form`;

export async function main(argv: string[], io: CliIo): Promise<number> {
  const parsed = parse(argv);
  let outcome: Outcome;
  try {
    outcome = await dispatch(parsed, io);
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
  else if (outcome.code === 0) io.stdout(`${outcome.text}\n`);
  else io.stderr(`${outcome.text}\n`);
  return outcome.code;
}
