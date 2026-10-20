import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_CONFIG, loadConfig, saveConfig, setConfigValue } from "../src/config.ts";
import {
  DEFAULT_MAIL_POLICY,
  DEFAULT_POLICY,
  decisionCounts,
  loadPolicy,
  setPolicyValue,
  skipAllowed,
} from "../src/policy.ts";
import {
  ensureCrewDir,
  loadState,
  saveState,
  sessionState,
  WORKING_MAX,
  workingRoles,
} from "../src/state.ts";
import { makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

test("SP2b: judgementGates lists the judgement gates a team requires, empty by default, unknown names dropped", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(DEFAULT_POLICY.judgementGates).toEqual([]);
  expect(loadPolicy(paths).policy.judgementGates).toEqual([]);
  mkdirSync(paths.crewDir, { recursive: true });
  const file = join(paths.crewDir, "policy.json");
  writeFileSync(file, JSON.stringify({ judgementGates: ["security", "lint", "ui-ux", 3] }));
  expect(loadPolicy(paths).policy.judgementGates).toEqual(["security", "ui-ux"]);
  writeFileSync(file, JSON.stringify({ judgementGates: "security" }));
  expect(loadPolicy(paths).policy.judgementGates).toEqual([]);
});

test("policy: defaults when absent, validated when present, unknown values ignored", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(loadPolicy(paths)).toEqual({ policy: DEFAULT_POLICY, tampered: false });
  mkdirSync(paths.crewDir, { recursive: true });
  writeFileSync(
    join(paths.crewDir, "policy.json"),
    JSON.stringify({
      requiredGates: ["lint", "bogus"],
      minimumRoute: "standard",
      allowSkips: ["lint"],
      artifacts: "local",
      riskPaths: { payments: ["app/Billing/**"] },
    }),
  );
  const { policy } = loadPolicy(paths);
  expect(policy.requiredGates).toEqual(["lint"]);
  expect(policy.minimumRoute).toBe("standard");
  expect(policy.artifacts).toBe("local");
  expect(skipAllowed(policy, "gate:lint")).toBe(true);
  expect(skipAllowed(policy, "gate:test")).toBe(false);
  expect(skipAllowed({ ...DEFAULT_POLICY, allowSkips: ["*"] }, "anything")).toBe(true);
});

test("policy: riskPathExclusions is a list of globs, empty by default, non-strings ignored", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(DEFAULT_POLICY.riskPathExclusions).toEqual([]);
  expect(loadPolicy(paths).policy.riskPathExclusions).toEqual([]);
  mkdirSync(paths.crewDir, { recursive: true });
  writeFileSync(
    join(paths.crewDir, "policy.json"),
    JSON.stringify({ riskPathExclusions: ["plugins/core/hooks/session-*.ts", 7, null, "docs/**"] }),
  );
  expect(loadPolicy(paths).policy.riskPathExclusions).toEqual([
    "plugins/core/hooks/session-*.ts",
    "docs/**",
  ]);
  writeFileSync(join(paths.crewDir, "policy.json"), JSON.stringify({ riskPathExclusions: "x" }));
  expect(loadPolicy(paths).policy.riskPathExclusions).toEqual([]);
});

test("policy: unattendedDecisions accepts validator, and decisionCounts follows the policy per decider", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  mkdirSync(paths.crewDir, { recursive: true });
  const file = join(paths.crewDir, "policy.json");
  writeFileSync(file, JSON.stringify({ unattendedDecisions: "validator" }));
  expect(loadPolicy(paths).policy.unattendedDecisions).toBe("validator");
  writeFileSync(file, JSON.stringify({ unattendedDecisions: "judge" }));
  expect(loadPolicy(paths).policy.unattendedDecisions).toBe("wait");

  const wait = { ...DEFAULT_POLICY, unattendedDecisions: "wait" as const };
  const count = { ...DEFAULT_POLICY, unattendedDecisions: "count" as const };
  const validator = { ...DEFAULT_POLICY, unattendedDecisions: "validator" as const };
  const person = { by: "user" as const };
  const agent = { by: "agent" as const, mode: "dontAsk" as const };
  const judge = {
    by: "validator" as const,
    mode: "dontAsk" as const,
    rule: "complete-gap-round" as const,
  };
  expect([wait, count, validator].map((p) => decisionCounts(p, person))).toEqual([
    true,
    true,
    true,
  ]);
  expect([wait, count, validator].map((p) => decisionCounts(p, agent))).toEqual([
    false,
    true,
    false,
  ]);
  expect([wait, count, validator].map((p) => decisionCounts(p, judge))).toEqual([
    false,
    false,
    true,
  ]);
});

test("ADR 0005 (0.3.0): attendedDecisions is relay by default, prompt is the opt-in, anything else reads as relay", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(DEFAULT_POLICY.attendedDecisions).toBe("relay");
  expect(loadPolicy(paths).policy.attendedDecisions).toBe("relay");
  mkdirSync(paths.crewDir, { recursive: true });
  const file = join(paths.crewDir, "policy.json");
  writeFileSync(file, JSON.stringify({ attendedDecisions: "prompt" }));
  expect(loadPolicy(paths).policy.attendedDecisions).toBe("prompt");
  writeFileSync(file, JSON.stringify({ attendedDecisions: "trust" }));
  expect(loadPolicy(paths).policy.attendedDecisions).toBe("relay");
  // A relayed decision is a person's: it counts under every unattended setting.
  const relayed = { by: "user" as const, relayed: true };
  for (const u of ["wait", "count", "validator"] as const)
    expect(decisionCounts({ ...DEFAULT_POLICY, unattendedDecisions: u }, relayed)).toBe(true);
});

test("gates are mandatory: allowSkips defaults to tdd and e2e, so a tdd step may be skipped and a gate only when listed", () => {
  expect(DEFAULT_POLICY.allowSkips).toEqual(["tdd", "e2e"]);
  expect(skipAllowed(DEFAULT_POLICY, "tdd:AC-1")).toBe(true);
  expect(skipAllowed(DEFAULT_POLICY, "gate:lint")).toBe(false);
  expect(skipAllowed(DEFAULT_POLICY, "gate:test")).toBe(false);
  expect(skipAllowed({ ...DEFAULT_POLICY, allowSkips: ["gate:lint"] }, "gate:lint")).toBe(true);
  expect(skipAllowed({ ...DEFAULT_POLICY, allowSkips: ["lint"] }, "gate:lint")).toBe(true);
  expect(skipAllowed({ ...DEFAULT_POLICY, allowSkips: ["lint"] }, "gate:test")).toBe(false);
  expect(skipAllowed({ ...DEFAULT_POLICY, allowSkips: ["*"] }, "gate:test")).toBe(true);
  expect(skipAllowed({ ...DEFAULT_POLICY, allowSkips: [] }, "tdd:AC-1")).toBe(false);
  // A validator decision with no mode was taken with a person present: it counts under every policy.
  const attended = { by: "validator" as const, rule: "complete-gap-round" as const };
  for (const u of ["wait", "count", "validator"] as const)
    expect(decisionCounts({ ...DEFAULT_POLICY, unattendedDecisions: u }, attended)).toBe(true);
  const unattended = { ...attended, mode: "dontAsk" as const };
  expect(decisionCounts({ ...DEFAULT_POLICY, unattendedDecisions: "wait" }, unattended)).toBe(
    false,
  );
});

test("config: defaults, set values, reject unknown keys and values", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(loadConfig(paths)).toEqual({ mode: "partner", decisions: { log: true } });
  const next = setConfigValue(loadConfig(paths), "decisions.log", "false");
  saveConfig(paths, setConfigValue(next, "mode", "pilot"));
  expect(loadConfig(paths)).toEqual({ mode: "pilot", decisions: { log: false } });
  expect(() => setConfigValue(next, "mode", "captain")).toThrow(/mode/);
  expect(() => setConfigValue(next, "colour", "red")).toThrow(/unknown/);
});

test("state: per-session entries and the .crew/.gitignore", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  ensureCrewDir(paths, DEFAULT_POLICY);
  expect(readFileSync(join(paths.crewDir, ".gitignore"), "utf8")).toBe(
    "local/\nwork/*/logs/\nwork/*/review/ui/\nworktrees/\n",
  );
  ensureCrewDir(paths, { ...DEFAULT_POLICY, artifacts: "local" });
  expect(readFileSync(join(paths.crewDir, ".gitignore"), "utf8")).toBe(
    "local/\nwork/*/logs/\nwork/*/review/ui/\nworktrees/\nwork/\n",
  );
  const state = loadState(paths);
  expect(state).toEqual({ active: null, sessions: {} });
  const session = sessionState(state, "s1");
  session.baseline = "sha256:abc";
  session.stopBlocks = 2;
  state.active = "w1";
  saveState(paths, state);
  expect(loadState(paths)).toEqual({
    active: "w1",
    sessions: { s1: { baseline: "sha256:abc", stopBlocks: 2 } },
  });
});

test("SP2c: policy.mail has its defaults when absent and its values validated when present", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(DEFAULT_POLICY.mail).toEqual(DEFAULT_MAIL_POLICY);
  expect(loadPolicy(paths).policy.mail).toEqual({
    workspace: null,
    name: null,
    accept: ["question", "notice"],
    open: "read-only",
    maxConcurrent: 2,
    maxHops: 2,
    maxTurns: 40,
    maxMinutes: 30,
    worktrees: "..",
    maxParties: 4,
  });
  mkdirSync(paths.crewDir, { recursive: true });
  const file = join(paths.crewDir, "policy.json");
  writeFileSync(
    file,
    JSON.stringify({
      mail: {
        workspace: "shop",
        name: "crm",
        accept: ["question", "change-request", "bogus", 3],
        open: "branch",
        maxConcurrent: 3,
        maxHops: "4",
        maxTurns: 0,
        maxMinutes: 45.5,
        worktrees: ".crew/worktrees",
      },
    }),
  );
  expect(loadPolicy(paths).policy.mail).toEqual({
    workspace: "shop",
    name: "crm",
    accept: ["question", "change-request"],
    open: "branch",
    maxConcurrent: 3,
    maxHops: 2,
    maxTurns: 40,
    maxMinutes: 30,
    worktrees: ".crew/worktrees",
    maxParties: 4,
  });
  writeFileSync(file, JSON.stringify({ mail: { worktrees: "/abs/olute" } }));
  expect(loadPolicy(paths).policy.mail.worktrees).toBe("..");
  // A name the mailbox folder cannot take is dropped, not folded.
  writeFileSync(
    file,
    JSON.stringify({ mail: { workspace: "Shop Floor", name: "../x", open: "yes" } }),
  );
  expect(loadPolicy(paths).policy.mail).toMatchObject({
    workspace: null,
    name: null,
    open: "read-only",
  });
});

test("SP2c: crew policy set writes the scalar mail keys, each value checked, and leaves the lists to a hand edit", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(setPolicyValue(paths, "mail.workspace", "shop")).toEqual({
    key: "mail.workspace",
    value: "shop",
  });
  expect(setPolicyValue(paths, "mail.name", "crm")).toEqual({ key: "mail.name", value: "crm" });
  expect(setPolicyValue(paths, "mail.open", "branch")).toEqual({
    key: "mail.open",
    value: "branch",
  });
  expect(setPolicyValue(paths, "mail.maxConcurrent", "3")).toEqual({
    key: "mail.maxConcurrent",
    value: "3",
  });
  expect(setPolicyValue(paths, "attendedDecisions", "prompt")).toEqual({
    key: "attendedDecisions",
    value: "prompt",
  });
  const written = JSON.parse(readFileSync(join(paths.crewDir, "policy.json"), "utf8"));
  expect(written).toEqual({
    attendedDecisions: "prompt",
    mail: { workspace: "shop", name: "crm", open: "branch", maxConcurrent: 3 },
  });
  expect(loadPolicy(paths).policy.mail).toMatchObject({
    workspace: "shop",
    name: "crm",
    open: "branch",
    maxConcurrent: 3,
  });
  expect(setPolicyValue(paths, "mail.workspace", "Shop Floor")).toEqual({
    refused:
      "mail.workspace is a lowercase name of letters, digits, dot, dash and underscore, up to 64 characters, not Shop Floor",
  });
  expect(setPolicyValue(paths, "mail.open", "yes")).toEqual({
    refused: "mail.open is one of read-only, branch, not yes",
  });
  expect(setPolicyValue(paths, "mail.maxHops", "0")).toEqual({
    refused: "mail.maxHops is a whole number from 1 to 10, not 0",
  });
  expect(setPolicyValue(paths, "mail.maxMinutes", "lots")).toEqual({
    refused: "mail.maxMinutes is a whole number from 1 to 600, not lots",
  });
  expect(setPolicyValue(paths, "mail.worktrees", ".crew/worktrees")).toEqual({
    key: "mail.worktrees",
    value: ".crew/worktrees",
  });
  // Each range accepts a value inside it and refuses one past it; the read gives the numbers back.
  expect(setPolicyValue(paths, "mail.maxHops", "3")).toEqual({ key: "mail.maxHops", value: "3" });
  expect(setPolicyValue(paths, "mail.maxTurns", "120")).toEqual({
    key: "mail.maxTurns",
    value: "120",
  });
  expect(setPolicyValue(paths, "mail.maxMinutes", "90")).toEqual({
    key: "mail.maxMinutes",
    value: "90",
  });
  expect(setPolicyValue(paths, "mail.maxTurns", "501")).toEqual({
    refused: "mail.maxTurns is a whole number from 1 to 500, not 501",
  });
  expect(loadPolicy(paths).policy.mail).toMatchObject({
    maxHops: 3,
    maxTurns: 120,
    maxMinutes: 90,
    worktrees: ".crew/worktrees",
  });
  expect(setPolicyValue(paths, "mail.worktrees", "/tmp/x")).toEqual({
    refused:
      "mail.worktrees is a relative path with no spaces (.. for the folder beside the root), not /tmp/x",
  });
  expect(setPolicyValue(paths, "mail.accept", "question")).toEqual({
    refused:
      "unknown policy key: mail.accept (crew policy set writes attendedDecisions, unattendedDecisions, mail.workspace, mail.name, mail.open, mail.maxConcurrent, mail.maxHops, mail.maxTurns, mail.maxMinutes, mail.maxParties, mail.worktrees, team.template, team.maxExperts, team.maxValidationRounds, team.maxJudgementRounds, team.maxGateRounds, team.continuations, verify.send, verify.maxClaimsPerItem, verify.threshold, verify.asks)",
  });
});

test("SP7a AC-3: policy.team has its defaults when absent, only tightens when present, and its scalar keys are settable", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(DEFAULT_POLICY.team).toEqual({
    template: "core",
    always: [],
    specialists: [],
    maxExperts: 3,
    maxValidationRounds: 2,
    maxJudgementRounds: 2,
    maxGateRounds: 2,
    continuations: "ask",
  });
  expect(loadPolicy(paths).policy.team).toEqual(DEFAULT_POLICY.team);
  mkdirSync(paths.crewDir, { recursive: true });
  writeFileSync(
    join(paths.crewDir, "policy.json"),
    JSON.stringify({
      team: {
        template: "packs",
        always: ["etl", "sales", 3],
        specialists: ["laravel", 7],
        maxExperts: 2,
        maxValidationRounds: 1,
        maxJudgementRounds: 3,
        maxGateRounds: 0,
      },
    }),
  );
  // A cap above its default, or below one, falls back to the default: a policy only tightens. The
  // template is read as written (SP6 Task 2): an unregistered name applies nothing where it is read.
  expect(loadPolicy(paths).policy.team).toEqual({
    template: "packs",
    always: ["etl"],
    specialists: ["laravel"],
    maxExperts: 2,
    maxValidationRounds: 1,
    maxJudgementRounds: 2,
    maxGateRounds: 2,
    continuations: "ask",
  });
  const fresh = repoPaths(makeRepo(), testEnv());
  expect(setPolicyValue(fresh, "team.maxJudgementRounds", "1")).toEqual({
    key: "team.maxJudgementRounds",
    value: "1",
  });
  expect(setPolicyValue(fresh, "team.maxExperts", "2")).toEqual({
    key: "team.maxExperts",
    value: "2",
  });
  expect(loadPolicy(fresh).policy.team).toMatchObject({ maxJudgementRounds: 1, maxExperts: 2 });
  expect(setPolicyValue(fresh, "team.maxJudgementRounds", "3")).toHaveProperty("refused");
  // A template is any lowercase word since SP6 Task 2 (checked where it is read); a bad name is refused.
  expect(setPolicyValue(fresh, "team.template", "packs")).toEqual({
    key: "team.template",
    value: "packs",
  });
  expect(setPolicyValue(fresh, "team.template", "Bad Name")).toHaveProperty("refused");
  expect(setPolicyValue(fresh, "team.template", "core")).toEqual({
    key: "team.template",
    value: "core",
  });
  expect(setPolicyValue(fresh, "team.always", "etl")).toHaveProperty("refused");
});

test("SP7a AC-7 (Task 7): the working list keeps the newest WORKING_MAX well-shaped entries; a null or malformed element is dropped, never thrown on", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  mkdirSync(paths.localDir, { recursive: true });
  const since = (i: number) => new Date(Date.UTC(2026, 9, 17, 10, 0, i)).toISOString();
  const entries: unknown[] = [
    null,
    { agent: 1 },
    { agent: "judge" },
    { agent: "x", since: since(0), team: "nope", sessionId: "s" },
  ];
  for (let i = 0; i < 60; i++)
    entries.push({
      agent: `role-${i}`,
      team: i % 2 ? "qa" : null,
      since: since(i),
      sessionId: "s",
    });
  // A prototype key is not a team name: `in` would admit it as the newest entry; `Object.hasOwn` does not.
  entries.push({ agent: "proto", since: since(60), team: "constructor", sessionId: "s" });
  writeFileSync(
    join(paths.localDir, "state.json"),
    JSON.stringify({ active: null, sessions: {}, working: entries }),
  );
  expect(WORKING_MAX).toBe(50);
  const kept = loadState(paths).working ?? [];
  expect(kept).toHaveLength(50);
  expect(kept[0]?.agent).toBe("role-10");
  expect(kept.at(-1)?.agent).toBe("role-59");
  expect(workingRoles(paths, Date.parse(since(59))).map((w) => w.agent)).toEqual(
    kept.map((w) => w.agent),
  );
});

test("SP7b-T2 AC-1: mail.maxParties defaults to 4 and only tightens, to 2 at the least", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(loadPolicy(paths).policy.mail.maxParties).toBe(4);
  setPolicyValue(paths, "mail.maxParties", "3");
  expect(loadPolicy(paths).policy.mail.maxParties).toBe(3);
  expect(setPolicyValue(paths, "mail.maxParties", "5")).toEqual({
    refused: "mail.maxParties is a whole number from 2 to 4, not 5",
  });
  expect(loadPolicy(paths).policy.mail.maxParties).toBe(3);
});

test("SP7b-T4 AC-1: allowSkips defaults to tdd and e2e: the user may skip the e2e gate by default, never the test gate", () => {
  expect(DEFAULT_POLICY.allowSkips).toEqual(["tdd", "e2e"]);
  expect(skipAllowed(DEFAULT_POLICY, "gate:e2e")).toBe(true);
  expect(skipAllowed(DEFAULT_POLICY, "gate:test")).toBe(false);
});

test("SP7b-T5 AC-2: team.continuations defaults to ask, reads granted or ask only, and is settable", () => {
  expect(DEFAULT_POLICY.team.continuations).toBe("ask");
  const root = makeRepo();
  const paths = repoPaths(root, testEnv());
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(
    join(root, ".crew", "policy.json"),
    JSON.stringify({ team: { continuations: "granted" } }),
  );
  expect(loadPolicy(paths).policy.team.continuations).toBe("granted");
  writeFileSync(
    join(root, ".crew", "policy.json"),
    JSON.stringify({ team: { continuations: "maybe" } }),
  );
  expect(loadPolicy(paths).policy.team.continuations).toBe("ask");
  const fresh = repoPaths(makeRepo(), testEnv());
  expect(setPolicyValue(fresh, "team.continuations", "granted")).toEqual({
    key: "team.continuations",
    value: "granted",
  });
  expect(setPolicyValue(fresh, "team.continuations", "yes")).toHaveProperty("refused");
  expect(loadPolicy(fresh).policy.team.continuations).toBe("granted");
});

test("SP3-T6 AC-4: policy.verify has its defaults when absent, falls back key by key when present, and its keys are settable within their ranges; crew config jev.endpoint and jev.model are validated and read back", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(DEFAULT_POLICY.verify).toEqual({
    send: "claims",
    maxClaimsPerItem: 50,
    threshold: 0.8,
    asks: ["defect", "validator", "fact", "triage", "knowledge"],
  });
  expect(loadPolicy(paths).policy.verify).toEqual(DEFAULT_POLICY.verify);
  mkdirSync(paths.crewDir, { recursive: true });
  writeFileSync(
    join(paths.crewDir, "policy.json"),
    JSON.stringify({
      verify: {
        send: "claims-and-snippets",
        maxClaimsPerItem: 500,
        threshold: 1.2,
        asks: ["defect", "nope"],
      },
    }),
  );
  expect(loadPolicy(paths).policy.verify).toEqual({
    send: "claims-and-snippets",
    maxClaimsPerItem: 50,
    threshold: 0.8,
    asks: ["defect"],
  });
  writeFileSync(join(paths.crewDir, "policy.json"), JSON.stringify({ verify: { asks: [] } }));
  expect(loadPolicy(paths).policy.verify.asks).toEqual([
    "defect",
    "validator",
    "fact",
    "triage",
    "knowledge",
  ]);
  writeFileSync(join(paths.crewDir, "policy.json"), "{}");
  expect(setPolicyValue(paths, "verify.threshold", "0.4")).toEqual({
    refused: "verify.threshold is a number from 0.5 to 0.99 with at most two decimals, not 0.4",
  });
  for (const bad of ["0.49", "1", "0.855", "x"])
    expect("refused" in setPolicyValue(paths, "verify.threshold", bad)).toBe(true);
  for (const good of ["0.5", "0.9", "0.99"]) {
    expect(setPolicyValue(paths, "verify.threshold", good)).toEqual({
      key: "verify.threshold",
      value: good,
    });
    expect(loadPolicy(paths).policy.verify.threshold).toBe(Number(good));
  }
  expect(setPolicyValue(paths, "verify.send", "claims-and-snippets")).toEqual({
    key: "verify.send",
    value: "claims-and-snippets",
  });
  expect(loadPolicy(paths).policy.verify.send).toBe("claims-and-snippets");
  for (const bad of ["0", "201", "1.5"])
    expect("refused" in setPolicyValue(paths, "verify.maxClaimsPerItem", bad)).toBe(true);
  for (const good of ["1", "200"]) {
    expect("refused" in setPolicyValue(paths, "verify.maxClaimsPerItem", good)).toBe(false);
    expect(loadPolicy(paths).policy.verify.maxClaimsPerItem).toBe(Number(good));
  }
  expect(setPolicyValue(paths, "verify.asks", "defect,triage")).toEqual({
    key: "verify.asks",
    value: "defect,triage",
  });
  expect(loadPolicy(paths).policy.verify.asks).toEqual(["defect", "triage"]);
  expect(setPolicyValue(paths, "verify.asks", "defect,x")).toEqual({
    refused:
      "verify.asks is a comma-separated subset of defect, validator, fact, triage, knowledge, not defect,x",
  });
  expect("refused" in setPolicyValue(paths, "verify.asks", "")).toBe(true);
  // The config: where Jev is reached, never its key.
  let config = DEFAULT_CONFIG;
  for (const bad of ["ftp://x", "http://api.invalid/x", "https://u:p@api.invalid/x"])
    expect(() => setConfigValue(config, "jev.endpoint", bad)).toThrow(
      /jev\.endpoint is an https URL/,
    );
  for (const good of [
    "file:///tmp/answers.json",
    "https://proxy.invalid/v1",
    "http://127.0.0.1:1/v1",
  ]) {
    config = setConfigValue(config, "jev.endpoint", good);
    expect(config.jev?.endpoint).toBe(good);
  }
  config = setConfigValue(config, "jev.model", "jev-1.13.0");
  expect(config.jev).toEqual({ endpoint: "http://127.0.0.1:1/v1", model: "jev-1.13.0" });
  expect(() => setConfigValue(config, "jev.model", "")).toThrow(/jev\.model/);
  saveConfig(paths, config);
  expect(loadConfig(paths).jev).toEqual({ endpoint: "http://127.0.0.1:1/v1", model: "jev-1.13.0" });
  saveConfig(paths, { ...config, jev: { endpoint: "http://api.invalid/x" } });
  expect(loadConfig(paths).jev).toBeUndefined();
});

test("SP6-T2 AC-4: team.template is read as written when a lowercase word and core otherwise; crew policy set takes a word and refuses a bad name", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  write(paths.root, ".crew/policy.json", JSON.stringify({ team: { template: "agentic-os" } }));
  expect(loadPolicy(paths).policy.team.template).toBe("agentic-os");
  write(paths.root, ".crew/policy.json", JSON.stringify({ team: { template: "Bad Name" } }));
  expect(loadPolicy(paths).policy.team.template).toBe("core");
  write(paths.root, ".crew/policy.json", "{}");
  expect(loadPolicy(paths).policy.team.template).toBe("core");
  expect(setPolicyValue(paths, "team.template", "laravel")).toEqual({
    key: "team.template",
    value: "laravel",
  });
  expect(loadPolicy(paths).policy.team.template).toBe("laravel");
  expect(setPolicyValue(paths, "team.template", "Bad Name")).toEqual({
    refused: "team.template is core or a pack's template name (a lowercase word), not Bad Name",
  });
});
