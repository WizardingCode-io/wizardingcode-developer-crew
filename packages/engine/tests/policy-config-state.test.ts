import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, saveConfig, setConfigValue } from "../src/config.ts";
import { DEFAULT_POLICY, decisionCounts, loadPolicy, skipAllowed } from "../src/policy.ts";
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
    "local/\nwork/*/logs/\nwork/*/review/ui/\n",
  );
  ensureCrewDir(paths, { ...DEFAULT_POLICY, artifacts: "local" });
  expect(readFileSync(join(paths.crewDir, ".gitignore"), "utf8")).toBe(
    "local/\nwork/*/logs/\nwork/*/review/ui/\nwork/\n",
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
