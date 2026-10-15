import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, saveConfig, setConfigValue } from "../src/config.ts";
import {
  DEFAULT_MAIL_POLICY,
  DEFAULT_POLICY,
  decisionCounts,
  loadPolicy,
  setPolicyValue,
  skipAllowed,
} from "../src/policy.ts";
import { ensureCrewDir, loadState, saveState, sessionState } from "../src/state.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

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

test("gates are mandatory: allowSkips defaults to tdd, so a tdd step may be skipped and a gate only when listed", () => {
  expect(DEFAULT_POLICY.allowSkips).toEqual(["tdd"]);
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
  });
  mkdirSync(paths.crewDir, { recursive: true });
  const file = join(paths.crewDir, "policy.json");
  writeFileSync(
    file,
    JSON.stringify({
      mail: {
        workspace: "clubefashion",
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
    workspace: "clubefashion",
    name: "crm",
    accept: ["question", "change-request"],
    open: "branch",
    maxConcurrent: 3,
    maxHops: 2,
    maxTurns: 40,
    maxMinutes: 30,
    worktrees: ".crew/worktrees",
  });
  writeFileSync(file, JSON.stringify({ mail: { worktrees: "/abs/olute" } }));
  expect(loadPolicy(paths).policy.mail.worktrees).toBe("..");
  // A name the mailbox folder cannot take is dropped, not folded.
  writeFileSync(
    file,
    JSON.stringify({ mail: { workspace: "Club Fashion", name: "../x", open: "yes" } }),
  );
  expect(loadPolicy(paths).policy.mail).toMatchObject({
    workspace: null,
    name: null,
    open: "read-only",
  });
});

test("SP2c: crew policy set writes the scalar mail keys, each value checked, and leaves the lists to a hand edit", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  expect(setPolicyValue(paths, "mail.workspace", "clubefashion")).toEqual({
    key: "mail.workspace",
    value: "clubefashion",
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
    mail: { workspace: "clubefashion", name: "crm", open: "branch", maxConcurrent: 3 },
  });
  expect(loadPolicy(paths).policy.mail).toMatchObject({
    workspace: "clubefashion",
    name: "crm",
    open: "branch",
    maxConcurrent: 3,
  });
  expect(setPolicyValue(paths, "mail.workspace", "Club Fashion")).toEqual({
    refused:
      "mail.workspace is a lowercase name of letters, digits, dot, dash and underscore, up to 64 characters, not Club Fashion",
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
      "unknown policy key: mail.accept (crew policy set writes attendedDecisions, unattendedDecisions, mail.workspace, mail.name, mail.open, mail.maxConcurrent, mail.maxHops, mail.maxTurns, mail.maxMinutes, mail.worktrees)",
  });
});
