import { expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFAULT_AGENT_MODEL,
  JUDGE_FALLBACK,
  JUDGE_MODEL,
  type ProbeAnswer,
} from "../../../scripts/eval.ts";
import {
  ADOPT_BY_HAND,
  adoptionGate,
  adoptRun,
  backoffHours,
  bootstrapClone,
  CLONE_SHELL_INSTALL,
  ceilingOf,
  clearClone,
  dailyReport,
  dayCostOf,
  dueRun,
  INSTALL_COMMAND_FILE,
  INSTALL_LOCK,
  type InstallDeps,
  install,
  installCommandOf,
  installLockOf,
  judgeArgs,
  keptNote,
  LABEL,
  type LoopConfig,
  lastMeasuredOf,
  launchdPlist,
  launcherScript,
  loopCommands,
  parseRuling,
  pauseLoop,
  pickTargets,
  printProbe,
  providerEnv,
  providerUnpriced,
  readConfig,
  realInstallDeps,
  realStopDeps,
  realTickDeps,
  redact,
  redactingLogger,
  relaunchCommand,
  resumeLoop,
  runProbe,
  secretReadCommand,
  secretSetCommand,
  statusText,
  stopLoop,
  stopName,
  sweepLeftovers,
  TICK_COMMAND_FILE,
  type TickDeps,
  tick,
  tickNotification,
  uninstall,
  unjudgedAtLimit,
  validLock,
  verdictText,
  writeRedacted,
} from "../../../scripts/improve-loop.ts";
import {
  boundOf,
  leftCommand,
  notificationCommand,
  spawnRunner,
} from "../../../scripts/release.ts";
import { processStart } from "../src/open.ts";
import { childEnv, tempDir } from "./helpers.ts";

/** A keychain with two accounts, read by account name; anything else is absent. */
const keychain = (account: string): string | null =>
  ({ "or-token": "sk-or-SECRET", "anthropic-key": "sk-ant-SECRET" })[account] ?? null;

const models = {
  fable: "anthropic/claude-fable-5.1",
  opus: "anthropic/claude-opus-5.5",
  sonnet: "anthropic/claude-sonnet-5.5",
  haiku: "anthropic/claude-haiku-5.5",
  agent: "anthropic/claude-sonnet-5.5",
  judge: "anthropic/claude-fable-5.1",
};

test("2026-10-25-005 AC-1 (runtime): the runtime provider adds nothing to the environment, runs the suite's own models, and is Claude", () => {
  const resolved = providerEnv({ provider: "runtime" } as LoopConfig, keychain);
  expect(resolved).toEqual({
    name: "runtime",
    env: {},
    agentModel: "claude-sonnet-5-5",
    judgeModel: JUDGE_MODEL,
    claudeModels: true,
    secrets: [],
  });
  // D-8's fallback: the login's token from the keychain, as the one name Claude Code reads it under.
  const token = providerEnv(
    { provider: "runtime", oauthToken: { keychain: "or-token" } } as LoopConfig,
    keychain,
  );
  expect(token.env).toEqual({ CLAUDE_CODE_OAUTH_TOKEN: "sk-or-SECRET" });
  expect(token.secrets).toEqual(["sk-or-SECRET"]);
});

test("2026-10-25-005 AC-1 (a gateway): the base URL, the bearer token from the keychain, an empty API key, the aliases' models and the subagents' model; the models decide whether it is Claude", () => {
  const gateway: LoopConfig["provider"] = {
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api",
    authToken: { keychain: "or-token" },
    models,
  };
  const resolved = providerEnv({ provider: gateway } as LoopConfig, keychain);
  expect(resolved.name).toBe("openrouter");
  expect(resolved.env).toEqual({
    ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
    ANTHROPIC_AUTH_TOKEN: "sk-or-SECRET",
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_DEFAULT_FABLE_MODEL: "anthropic/claude-fable-5.1",
    ANTHROPIC_DEFAULT_OPUS_MODEL: "anthropic/claude-opus-5.5",
    ANTHROPIC_DEFAULT_SONNET_MODEL: "anthropic/claude-sonnet-5.5",
    ANTHROPIC_DEFAULT_HAIKU_MODEL: "anthropic/claude-haiku-5.5",
    CLAUDE_CODE_SUBAGENT_MODEL: "anthropic/claude-sonnet-5.5",
  });
  expect(resolved.agentModel).toBe("anthropic/claude-sonnet-5.5");
  expect(resolved.judgeModel).toBe("anthropic/claude-fable-5.1");
  expect(resolved.claudeModels).toBe(true);
  expect(resolved.secrets).toEqual(["sk-or-SECRET"]);
  // A local server's fixed public token is a placeholder, not a secret; one non-Claude model makes the run non-Claude.
  const local = providerEnv(
    {
      provider: {
        name: "ollama",
        baseUrl: "http://localhost:11434",
        authToken: { placeholder: "ollama" },
        models: { ...models, agent: "qwen3-coder" },
      },
    } as LoopConfig,
    keychain,
  );
  expect(local.env.ANTHROPIC_AUTH_TOKEN).toBe("ollama");
  expect(local.agentModel).toBe("qwen3-coder");
  expect(local.claudeModels).toBe(false);
  expect(local.secrets).toEqual([]);
});

test("2026-10-25-005 AC-1 (an API key, a missing item): the key provider sets ANTHROPIC_API_KEY alone; an account the keychain does not hold is a refusal that names it", () => {
  const key = providerEnv(
    { provider: { name: "anthropic", apiKey: { keychain: "anthropic-key" } } } as LoopConfig,
    keychain,
  );
  expect(key.env).toEqual({ ANTHROPIC_API_KEY: "sk-ant-SECRET" });
  expect(key.agentModel).toBe("claude-sonnet-5-5");
  expect(key.claudeModels).toBe(true);
  expect(() =>
    providerEnv(
      {
        provider: {
          name: "openrouter",
          baseUrl: "https://x",
          authToken: { keychain: "gone" },
          models,
        },
      } as LoopConfig,
      keychain,
    ),
  ).toThrow('no item for account "gone" under the service wizardingcode-crew-improve');
});

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12)).toISOString();

test("2026-10-25-005 AC-4 (dueRun): a run is due for new plugin text, a newer CTO plan, grown lessons or a stale case, never with a live lock, and not otherwise", () => {
  const config = { casesPerRun: 2, staleDays: 7 };
  const lastRun = { at: day(20), head: "abc", plan: day(10), lessons: 3 };
  const facts = {
    pluginHead: "abc",
    plan: day(10),
    lessons: 3,
    lastMeasured: { a: day(19), b: day(18) },
    lockAlive: false,
  };
  const now = new Date(day(21));
  expect(dueRun({ lastRun }, facts, config, now)).toEqual({
    due: false,
    reason: "nothing new since the last run and no case older than 7 days",
  });
  expect(dueRun({}, facts, config, now).due).toBe(true);
  expect(dueRun({ lastRun }, { ...facts, pluginHead: "def" }, config, now)).toEqual({
    due: true,
    reason: "the plugin's text changed on origin/main (def)",
  });
  expect(dueRun({ lastRun }, { ...facts, plan: day(21) }, config, now).reason).toBe(
    "a CTO plan newer than the last run",
  );
  expect(dueRun({ lastRun }, { ...facts, lessons: 4 }, config, now).reason).toBe(
    "the harness lessons grew (3 to 4)",
  );
  expect(
    dueRun({ lastRun }, { ...facts, lastMeasured: { a: day(19), b: day(13) } }, config, now).reason,
  ).toBe("case b unmeasured for 8 days");
  expect(
    dueRun({ lastRun }, { ...facts, lastMeasured: { a: day(19), b: null } }, config, now).reason,
  ).toBe("case b never measured");
  expect(
    dueRun({ lastRun }, { ...facts, pluginHead: "def", lockAlive: true }, config, now),
  ).toEqual({ due: false, reason: "another tick holds the lock" });
});

test("2026-10-25-005 AC-4 (pickTargets): never measured first, then the oldest, two by default, ties by name", () => {
  const measured = { d: day(20), b: null, a: day(15), c: day(15), e: null };
  expect(pickTargets(["a", "b", "c", "d", "e"], measured)).toEqual(["b", "e"]);
  expect(pickTargets(["a", "b", "c", "d", "e"], measured, 4)).toEqual(["b", "e", "a", "c"]);
  expect(pickTargets(["a", "d"], measured, 1)).toEqual(["a"]);
  expect(pickTargets([], measured)).toEqual([]);
});

test("2026-10-25-005 AC-10: the daily report lists the day's runs, the totals by provider with n/a where no list price exists, the releases and the failed steps; the notification is osascript with the title and body escaped", () => {
  const report = dailyReport(
    "2026-10-25",
    [
      {
        run: "2026-10-25-1",
        targets: ["false-done", "gate-tampering"],
        verdict: "kept P-1 (+0.30)",
        provider: { name: "runtime", claudeModels: true },
        costUsd: 3.2,
      },
      {
        run: "2026-10-25-2",
        targets: ["mail-refused-by-policy"],
        verdict: "nothing kept",
        provider: { name: "ollama", claudeModels: false },
        costUsd: null,
      },
    ],
    [{ version: "0.15.1", run: "2026-10-25-1" }],
    [{ run: "2026-10-25-2", step: 9, name: "the marketplace entry" }],
  );
  expect(report).toContain("# Improvement runs of 2026-10-25");
  expect(report).toContain(
    "| 2026-10-25-1 | false-done, gate-tampering | kept P-1 (+0.30) | runtime | 3.20 USD |",
  );
  expect(report).toContain(
    "| 2026-10-25-2 | mail-refused-by-policy | nothing kept | ollama (not Claude models) | n/a |",
  );
  expect(report).toContain("- runtime: 3.20 USD");
  expect(report).toContain("- ollama: n/a (no list price for its models)");
  expect(report).toContain("- 0.15.1 from run 2026-10-25-1");
  expect(report).toContain("- run 2026-10-25-2: step 9 (the marketplace entry) failed");
  const [title, body] = tickNotification({
    released: "0.15.1",
    improved: ["false-done 0.60 → 0.90"],
    reason: null,
    dayTotal: "3.20 USD",
  });
  expect(title).toBe("crew 0.15.1");
  expect(body).toBe("false-done 0.60 → 0.90. Today: 3.20 USD.");
  const [plainTitle, plainBody] = tickNotification({
    released: null,
    improved: [],
    reason: 'nothing released: the gate failed on "paths"',
    dayTotal: "n/a",
  });
  expect(plainTitle).toBe("crew improve");
  expect(plainBody).toBe('nothing released: the gate failed on "paths". Today: n/a.');
  expect(notificationCommand(plainTitle, plainBody)).toEqual([
    "osascript",
    "-e",
    'display notification "nothing released: the gate failed on \\"paths\\". Today: n/a." with title "crew improve"',
  ]);
});

test("2026-10-25-005 AC-14: every secret the provider resolved, and a base URL's userinfo, are redacted from what the loop writes; the secret command passes the token on stdin", () => {
  const secrets = ["sk-or-SECRET", "ghp_SECRET"];
  const text =
    "kit failed: ANTHROPIC_AUTH_TOKEN=sk-or-SECRET GH_TOKEN=ghp_SECRET at https://user:pw@gateway.example/api and plain https://gateway.example/api";
  expect(redact(text, secrets)).toBe(
    "kit failed: ANTHROPIC_AUTH_TOKEN=[redacted] GH_TOKEN=[redacted] at https://[redacted]@gateway.example/api and plain https://gateway.example/api",
  );
  const lines: string[] = [];
  const log = redactingLogger(secrets, (line) => lines.push(line));
  log(`the editor said ${secrets[0]}`);
  expect(lines).toEqual(["the editor said [redacted]"]);
  const dir = tempDir();
  writeRedacted(
    join(dir, "record.json"),
    JSON.stringify({ env: { ANTHROPIC_AUTH_TOKEN: "sk-or-SECRET" } }),
    secrets,
  );
  expect(readFileSync(join(dir, "record.json"), "utf8")).not.toContain("sk-or-SECRET");
  expect(readFileSync(join(dir, "record.json"), "utf8")).toContain("[redacted]");
  const set = secretSetCommand("oauth-token", "tok-SECRET");
  expect(set.cmd).toEqual(["security", "-i"]);
  expect(set.cmd.join(" ")).not.toContain("tok-SECRET");
  expect(set.input).toBe(
    'add-generic-password -U -s wizardingcode-crew-improve -a "oauth-token" -w "tok-SECRET"\n',
  );
  expect(secretReadCommand("oauth-token")).toEqual([
    "security",
    "find-generic-password",
    "-s",
    "wizardingcode-crew-improve",
    "-a",
    "oauth-token",
    "-w",
  ]);
});

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...childEnv(),
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@t",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@t",
    },
  });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

/** A repository on main with the harness's text and a script, and two kept branches: one that edits the skill, one that edits the script. */
function adoptionFixture(): { repo: string; folder: string } {
  const repo = tempDir("adopt-");
  const files: Record<string, string> = {
    "plugins/core/skills/crew/SKILL.md": "# Crew\n\nRule 1.\n",
    "plugins/core/agents/judge.md": "# Judge\n",
    "scripts/x.ts": "export {};\n",
    "docs/improve/README.md": "# Runs\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(repo, dirname(rel)), { recursive: true });
    writeFileSync(join(repo, rel), text);
  }
  git(repo, "init", "-q", "-b", "main");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "init");
  git(repo, "checkout", "-q", "-b", "improve/2026-10-25-1");
  writeFileSync(
    join(repo, "plugins/core/skills/crew/SKILL.md"),
    "# Crew\n\nRule 1, said better.\n",
  );
  git(repo, "commit", "-q", "-am", "Improvement run 2026-10-25-1: P-1");
  git(repo, "checkout", "-q", "main");
  git(repo, "checkout", "-q", "-b", "improve/2026-10-25-2");
  writeFileSync(join(repo, "scripts/x.ts"), "export const x = 1;\n");
  git(repo, "commit", "-q", "-am", "Improvement run 2026-10-25-2: P-1");
  git(repo, "checkout", "-q", "main");
  git(repo, "checkout", "-q", "-b", "improve/2026-10-25-3");
  git(repo, "mv", "scripts/x.ts", "plugins/core/agents/x.md");
  git(repo, "commit", "-q", "-m", "Improvement run 2026-10-25-3: P-1");
  git(repo, "checkout", "-q", "main");
  const folder = join(repo, "docs/improve/2026-10-25-1");
  mkdirSync(folder, { recursive: true });
  return { repo, folder };
}

const figures = (mean: number, spread = 0.1) => ({
  name: "t",
  runs: [],
  mean,
  spread,
  reads: null,
  errored: false,
});
const keptRecord = (run: string, probeMean = 0.9) => ({
  run,
  targets: ["t"],
  baseline: { t: figures(0.5) },
  proposals: [{ id: "P-1", probe: { t: figures(probeMean) } }],
  composition: null,
  kept: { kind: "single" as const, id: "P-1" },
  branch: `improve/${run}`,
});
const claude = {
  name: "runtime",
  env: {},
  agentModel: "claude-sonnet-5-5",
  judgeModel: "claude-opus-5-5",
  claudeModels: true,
  secrets: [],
};

/** The adoption's deps: real git, a judge that answers as told, a release that records its call. */
function adoptDeps(
  answer: string | (() => string),
  options: {
    /** The judge probe's answer for a model, in place of `ok` (2026-11-09-004). */
    probe?: (model: string) => ProbeAnswer;
    /** The judge call's own answer for its nth call, in place of status 0 with `answer`. */
    judgeAnswer?: (n: number) => { status: number; output: string; stderr?: string } | undefined;
  } = {},
) {
  const seen = {
    probes: [] as { model: string; cwd: string; env: Record<string, string> }[],
    judge: [] as { args: string[]; env: Record<string, string> }[],
    release: [] as { reason: string; notes: string[] }[],
    log: [] as string[],
  };
  return {
    seen,
    deps: {
      git: (args: string[], cwd: string) => {
        const r = spawnSync("git", args, {
          cwd,
          encoding: "utf8",
          env: {
            ...childEnv(),
            GIT_AUTHOR_NAME: "t",
            GIT_AUTHOR_EMAIL: "t@t",
            GIT_COMMITTER_NAME: "t",
            GIT_COMMITTER_EMAIL: "t@t",
          },
        });
        return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
      },
      probeJudge: (call: { model: string; cwd: string; env: Record<string, string> }) => {
        seen.probes.push(call);
        return options.probe?.(call.model) ?? { status: 0, output: "ok", timedOut: false };
      },
      judge: (call: { cwd: string; args: string[]; env: Record<string, string> }) => {
        seen.judge.push({ args: call.args, env: call.env });
        const own = options.judgeAnswer?.(seen.judge.length);
        if (own) return own;
        return { status: 0, output: typeof answer === "string" ? answer : answer() };
      },
      release: async (call: { reason: string; notes: string[] }) => {
        seen.release.push(call);
        return { code: 0, version: "0.15.1" };
      },
      log: (line: string) => seen.log.push(line),
    },
  };
}
const holdsJson = JSON.stringify({ result: "holds\n\nMissing: none.", total_cost_usd: 0.1 });

test("2026-10-25-005 AC-17: the adoption gate is code before the judge: paths outside the harness or figures without a win stop the adoption with no judge, no merge and no release, even when the judge would say holds; the ruling is parsed strictly", async () => {
  const good = keptRecord("2026-10-25-1");
  expect(adoptionGate(good, ["plugins/core/skills/crew/SKILL.md"])).toEqual({
    holds: true,
    clause: null,
  });
  expect(adoptionGate(good, ["plugins/core/skills/crew/SKILL.md", "scripts/x.ts"]).clause).toBe(
    "paths outside the harness: scripts/x.ts",
  );
  expect(
    adoptionGate(keptRecord("2026-10-25-1", 0.5), ["plugins/core/agents/judge.md"]).clause,
  ).toBe(
    "the figures are not a win: t did not rise: 0.50 against 0.50 (median 0.50, lowest run 0.50)",
  );
  expect(adoptionGate({ ...good, kept: null }, []).clause).toBe("nothing kept");
  expect(parseRuling(holdsJson)).toEqual({ holds: true, text: "holds\n\nMissing: none." });
  expect(
    parseRuling(JSON.stringify({ result: "does not hold\nMissing: rule 2 removed" })).holds,
  ).toBe(false);
  expect(parseRuling(JSON.stringify({ result: "Holds, I think" })).holds).toBe(false);
  expect(parseRuling(JSON.stringify({ is_error: true, result: "holds" })).holds).toBe(false);
  expect(parseRuling("not json").holds).toBe(false);
  expect(parseRuling("not json").text).toContain("unreadable answer");
  // The flow with paths outside the harness: the judge never runs, main does not move, nothing is released.
  const { repo, folder } = adoptionFixture();
  const head = git(repo, "rev-parse", "HEAD").trim();
  const { deps, seen } = adoptDeps(holdsJson);
  const out = await adoptRun(
    {
      repo,
      folder,
      record: keptRecord("2026-10-25-2"),
      provider: claude,
      judgeSystemPrompt: "# Judge",
    },
    deps,
  );
  expect(out.released).toBeNull();
  expect(out.reason).toBe("the gate failed: paths outside the harness: scripts/x.ts");
  expect(seen.judge).toEqual([]);
  expect(seen.release).toEqual([]);
  expect(git(repo, "rev-parse", "HEAD").trim()).toBe(head);
  expect(readFileSync(join(folder, "adoption/gate.md"), "utf8")).toContain(
    "does not hold: paths outside the harness: scripts/x.ts",
  );
  // A file moved into the harness roots: its old path is read too, so the gate fails on it.
  const moved = adoptDeps(holdsJson);
  const renamed = await adoptRun(
    {
      repo,
      folder,
      record: keptRecord("2026-10-25-3"),
      provider: claude,
      judgeSystemPrompt: "# Judge",
    },
    moved.deps,
  );
  expect(renamed.reason).toBe("the gate failed: paths outside the harness: scripts/x.ts");
  expect(moved.seen.judge).toEqual([]);
});

test("2026-10-25-005 AC-14 (through the tick): a gateway's token and a base URL's userinfo, echoed by the run and the judge, reach no file, no log line and no notification", async () => {
  const world = loopWorld();
  writeFileSync(
    join(world.home, "config.json"),
    JSON.stringify({
      provider: {
        name: "openrouter",
        baseUrl: "https://user:pw@gateway.example/api",
        authToken: { keychain: "or-token" },
        models,
      },
    }),
  );
  const echo = "leaked sk-or-SECRET at https://user:pw@gateway.example/api";
  const leaky = tickDeps(world, {
    kept: true,
    secret: "sk-or-SECRET",
    echo,
    judge: JSON.stringify({ result: `does not hold\n\nMissing: the diff prints ${echo}` }),
  });
  expect(await tick({}, leaky.deps)).toBe(0);
  expect(leaky.seen.improve[0]?.provider).toBe("openrouter");
  const repo = join(world.home, "repo");
  const texts: [string, string][] = [
    ["log", leaky.seen.log.join("\n")],
    ["record.json", readFileSync(join(repo, "docs/improve/2026-10-25-1/record.json"), "utf8")],
    ["record.md", readFileSync(join(repo, "docs/improve/2026-10-25-1/record.md"), "utf8")],
    ["report", readFileSync(join(repo, "docs/improve/daily/2026-10-25.md"), "utf8")],
    ["ruling", readFileSync(join(repo, "docs/improve/2026-10-25-1/adoption/ruling.md"), "utf8")],
    ["state", readFileSync(join(world.home, "state.json"), "utf8")],
    ["probe", readFileSync(join(world.home, "probe.json"), "utf8")],
    ["notification", (leaky.seen.sh.find((c) => c[0] === "osascript") as string[]).join(" ")],
    ["dated log", readFileSync(join(world.home, "log/2026-10-25.log"), "utf8")],
  ];
  for (const [what, text] of texts) {
    expect(text, what).not.toContain("sk-or-SECRET");
    expect(text, what).not.toContain("user:pw@");
  }
  expect(texts[1]?.[1]).toContain("[redacted]");
  expect(git(world.origin, "show", "main:docs/improve/2026-10-25-1/record.json")).not.toContain(
    "sk-or-SECRET",
  );
});

test("2026-10-25-005 AC-16 (the back-off): a tick that fails after the run keeps the run on record and waits before the next, doubling up to a day; a later tick runs again", async () => {
  const world = loopWorld();
  const raced = tickDeps(world, { refusePush: true });
  expect(await tick({}, raced.deps)).toBe(1);
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(state.lastRun.run).toBe("2026-10-25-1");
  expect(state.failures).toBe(1);
  expect(state.backoffUntil).toBe("2026-10-25T21:00:00.000Z");
  expect((raced.seen.sh.find((c) => c[0] === "osascript") as string[]).join(" ")).toContain(
    "waits 1 h",
  );
  const early = tickDeps(world, { now: "2026-10-25T20:30:00.000Z", refusePush: true });
  expect(await tick({}, early.deps)).toBe(0);
  expect(early.seen.log.join("\n")).toContain(
    "backing off until 2026-10-25T21:00:00.000Z after 1 failed tick(s)",
  );
  expect(early.seen.improve).toEqual([]);
  // The clone is brought to origin even while backing off: the unpushed record could not go (the push refused) and is dropped.
  expect(early.seen.log.join("\n")).toContain(
    "an earlier run's commits could not be pushed and are dropped",
  );
  const later = tickDeps(world, { now: "2026-10-25T22:00:00.000Z" });
  expect(await tick({}, later.deps)).toBe(0);
  expect(later.seen.improve).toHaveLength(1);
  expect(JSON.parse(readFileSync(join(world.home, "state.json"), "utf8")).failures).toBe(0);
  // A commit an interrupted adoption left on the clone's main (not a record): dropped, never pushed.
  const repo = join(world.home, "repo");
  writeFileSync(join(repo, "plugins/core/skills/crew/SKILL.md"), "# Crew\n\nUngated.\n");
  git(repo, "commit", "-q", "-am", "Adopt improvement run x: P-1 (ungated)");
  const cleaned = tickDeps(world, { now: "2026-10-25T23:00:00.000Z" });
  expect(await tick({}, cleaned.deps)).toBe(0);
  expect(cleaned.seen.log.join("\n")).toContain(
    "local commits beyond the records dropped (plugins/core/skills/crew/SKILL.md)",
  );
  expect(git(world.origin, "log", "--format=%s", "main")).not.toContain("ungated");
  // Records left unpushed (a tick that died after its commit) and a kept branch origin lacks: pushed at the next tick.
  const left = join(repo, "docs/improve/2026-10-25-9");
  mkdirSync(left, { recursive: true });
  writeFileSync(
    join(left, "record.json"),
    `${JSON.stringify({ run: "2026-10-25-9", at: "2026-10-25T23:30:00.000Z", targets: [], baseline: {}, proposals: [], composition: null, kept: null, branch: "improve/2026-10-25-9", provider: null, costUsd: 0, exit: 0 })}\n`,
  );
  git(repo, "add", "-A", "docs/improve");
  git(repo, "commit", "-q", "-m", "Improvement run 2026-10-25-9: nothing kept");
  git(repo, "branch", "improve/2026-10-25-9");
  const recovered = tickDeps(world, { now: "2026-10-26T01:00:00.000Z" });
  expect(await tick({}, recovered.deps)).toBe(0);
  expect(recovered.seen.log.join("\n")).toContain(
    "an earlier run's commits pushed (with improve/2026-10-25-9)",
  );
  expect(git(world.origin, "log", "--format=%s", "main")).toContain(
    "Improvement run 2026-10-25-9: nothing kept",
  );
  expect(git(world.origin, "branch", "--list", "improve/2026-10-25-9").trim()).toBe(
    "improve/2026-10-25-9",
  );
  // A pending release is resumed even while the loop backs off: the release is out, only its last steps wait.
  const pending = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  writeFileSync(
    join(world.home, "state.json"),
    JSON.stringify({
      ...pending,
      failures: 1,
      backoffUntil: "2026-10-26T12:00:00.000Z",
      pendingRelease: { version: "0.15.1", failedStep: 9 },
    }),
  );
  const resumed = tickDeps(world, { now: "2026-10-26T00:00:00.000Z" });
  expect(await tick({}, resumed.deps)).toBe(0);
  expect(resumed.seen.release).toEqual(["resumed release 0.15.1"]);
  expect(resumed.seen.accounts).toEqual(["andreagroferreira"]);
  expect(resumed.seen.log.join("\n")).toContain("backing off until 2026-10-26T12:00:00.000Z");
  expect(resumed.seen.improve).toEqual([]);
  expect(backoffHours(1)).toBe(1);
  expect(backoffHours(3)).toBe(4);
  expect(backoffHours(9)).toBe(24);
});

test("2026-10-25-005 AC-6: with the gate held the judge rules on the diff with the Design's arguments; holds with Claude models merges the branch and releases a patch; does not hold, or another provider's models, leaves the branch and says why", async () => {
  const { repo, folder } = adoptionFixture();
  const { deps, seen } = adoptDeps(holdsJson);
  const gateway = {
    ...claude,
    name: "openrouter",
    env: { ANTHROPIC_BASE_URL: "https://x", ANTHROPIC_AUTH_TOKEN: "t" },
  };
  const out = await adoptRun(
    {
      repo,
      folder,
      record: keptRecord("2026-10-25-1"),
      provider: gateway,
      judgeSystemPrompt: "# Judge\n\nYou decide on evidence.",
    },
    deps,
  );
  expect(out.released).toBe("0.15.1");
  expect(out.reason).toBeNull();
  expect(readFileSync(join(folder, "adoption/diff.patch"), "utf8")).toContain(
    "+Rule 1, said better.",
  );
  expect(readFileSync(join(folder, "adoption/ruling.md"), "utf8")).toContain("holds");
  const call = seen.judge[0] as { args: string[]; env: Record<string, string> };
  const at = (flag: string) => call.args[call.args.indexOf(flag) + 1];
  expect(call.args[0]).toBe("-p");
  expect(at("-p")).toContain("docs/improve/2026-10-25-1/adoption/diff.patch");
  expect(at("-p")).toContain("plugins/core/skills/crew/references/rules.md");
  expect(at("--append-system-prompt")).toContain("You decide on evidence.");
  expect(at("--append-system-prompt")).toContain("kept-harness-adoption");
  expect(at("--tools")).toBe("Read,Grep,Glob");
  expect(at("--output-format")).toBe("json");
  expect(at("--setting-sources")).toBe("");
  expect(at("--max-turns")).toBe("40");
  expect(call.args).toContain("--no-session-persistence");
  expect(call.env).toEqual(gateway.env);
  expect(git(repo, "log", "-1", "--format=%s").trim()).toBe(
    "Adopt improvement run 2026-10-25-1: P-1 (t 0.50 → 0.90)",
  );
  expect(git(repo, "log", "-1", "--format=%P").trim().split(" ")).toHaveLength(2);
  expect(seen.release).toEqual([
    {
      reason: "improvement run 2026-10-25-1: t 0.50 → 0.90",
      notes: ["- t: 0.50 → 0.90 (median 0.50)", "- kept: P-1"],
    },
  ]);
  // Does not hold: the branch stays, main stays, nothing released, the reason names the judge's answer.
  const second = adoptionFixture();
  const refused = adoptDeps(
    JSON.stringify({ result: "does not hold\n\nMissing: rule 1 lost its exception." }),
  );
  const head = git(second.repo, "rev-parse", "HEAD").trim();
  const no = await adoptRun(
    {
      repo: second.repo,
      folder: second.folder,
      record: keptRecord("2026-10-25-1"),
      provider: claude,
      judgeSystemPrompt: "# Judge",
    },
    refused.deps,
  );
  expect(no.released).toBeNull();
  expect(no.reason).toBe('the judge ruled "does not hold": rule 1 lost its exception.');
  expect(refused.seen.release).toEqual([]);
  expect(git(second.repo, "rev-parse", "HEAD").trim()).toBe(head);
  expect(git(second.repo, "branch", "--list", "improve/2026-10-25-1").trim()).toBe(
    "improve/2026-10-25-1",
  );
  // Another provider's models: the judge may hold, nothing is released (D-9).
  const third = adoptionFixture();
  const local = adoptDeps(holdsJson);
  const kept = await adoptRun(
    {
      repo: third.repo,
      folder: third.folder,
      record: keptRecord("2026-10-25-1"),
      provider: { ...claude, name: "ollama", claudeModels: false },
      judgeSystemPrompt: "# Judge",
    },
    local.deps,
  );
  expect(kept.released).toBeNull();
  expect(kept.reason).toBe(
    "measured on ollama, not Claude models: kept on its branch, not released (D-9)",
  );
  expect(local.seen.release).toEqual([]);
  expect(git(third.repo, "log", "-1", "--format=%s").trim()).toBe("init");
});

/** The loop's world: a bare origin with the repository's shape, the user's checkout of it, the loop's home, a temp dir. */
function loopWorld(options: { loop?: boolean } = {}): {
  origin: string;
  user: string;
  home: string;
  tmp: string;
  /** The base's harness lessons as the tick's `lessons` dep counts them; the improvement stub adds the run's own (finding 174). */
  lessons: { held: number };
} {
  const base = tempDir("loop-");
  const seed = join(base, "seed");
  const files: Record<string, string> = {
    "package.json": '{ "name": "r", "version": "0.15.0" }\n',
    "bun.lock": "lock 1\n",
    // The loop itself, as origin/main holds it (finding 169: a main without it is never synced to).
    ...(options.loop === false ? {} : { "scripts/improve-loop.ts": "export {};\n" }),
    "plugins/core/skills/crew/SKILL.md": "# Crew\n",
    "plugins/core/agents/judge.md": "# Judge\n\nYou decide on evidence.\n",
    "plugins/core/evals/t/case.yaml": "name: t\n",
    "plugins/core/evals/u/case.yaml": "name: u\n",
    "docs/improve/README.md": "# Runs\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(join(seed, dirname(rel)), { recursive: true });
    writeFileSync(join(seed, rel), text);
  }
  git(seed, "init", "-q", "-b", "main");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "init");
  const origin = join(base, "origin.git");
  git(base, "clone", "-q", "--bare", seed, origin);
  const user = join(base, "user");
  git(base, "clone", "-q", origin, user);
  const home = join(base, "home");
  mkdirSync(home, { recursive: true });
  const tmp = join(base, "tmp");
  mkdirSync(tmp, { recursive: true });
  return { origin, user, home, tmp, lessons: { held: 0 } };
}

type Seen = {
  sh: string[][];
  /** Each wait the tick made for a young git lock, in milliseconds (2026-11-13-005). */
  pauses: number[];
  /** The groups the tick killed, each with how many commands it had run by then (2026-11-13-005). */
  kills: { group: number; after: number }[];
  /** Each git command asked, before the real git runs (2026-11-13-005). */
  git: { args: string[]; cwd: string }[];
  /** Each played command with the bound it was given (2026-11-13-005). */
  shOptions: { cmd: string[]; timeoutMs?: number }[];
  /** The signal handler's installs and removals, in order (2026-10-28-001 AC-7), and the handler itself. */
  signals: string[];
  handler?: () => void;
  /** Each relaunch's arguments, and whether the lock was gone when it ran (2026-10-28-001 AC-2). */
  relaunch: { args: string[]; lockGone: boolean }[];
  improve: { cases: string[]; provider: string }[];
  /** The run ceiling each improvement received (2026-10-27-006 AC-2, AC-6). */
  ceilings: (number | undefined)[];
  judge: number;
  /** The models the adoption's judge probe asked. */
  probes: string[];
  release: string[];
  /** The step each resumed release was asked to start from, `undefined` when none was passed (2026-11-09-001 AC-19). */
  fromSteps: (number | undefined)[];
  accounts: (string | undefined)[];
  log: string[];
  /** The clone's commits when the release was called (2026-11-13-004): the head before the adoption's merge, the merge, the ruling on top of it, and the release's own commit and origin's head when the fake made or moved them. */
  heads: { before?: string; merge?: string; ruling?: string; release?: string; origin?: string };
};

/** The tick's deps: real git, every other command played, the improvement a stub that writes a record. */
function tickDeps(
  world: ReturnType<typeof loopWorld>,
  options: {
    kept?: boolean;
    alive?: boolean;
    now?: string;
    judge?: string;
    releaseCode?: number;
    /** The step the release fails at (9 when not given): before 7 it is a rollback, not a pending release. */
    releaseStep?: number;
    /** A text the run's record carries (a secret the editor echoed, for AC-14). */
    echo?: string;
    /** Origin moves during the run by a commit writing this path on the user's clone (finding 172). */
    raceTouching?: string;
    /** Origin moves again, by a commit writing this path, between the adoption's release and the report's push. */
    raceAfterAdoption?: string;
    /** The headless shell's install fails, as a download can (2026-10-30-001 AC-27). */
    shellInstallFails?: boolean;
    /** Origin refuses every push: the one failure the loop cannot heal (the back-off, AC-16). */
    refusePush?: boolean;
    /** The base's harness lessons during the run (finding 174): what the record lists (written as given, absent for `undefined`) and how many the base gains; by default the run's own lesson, listed and gained. */
    lessons?: { listed: unknown; gained: number };
    secret?: string;
    /** The exit status the run's record carries (2026-10-28-001 AC-7, AC-8): 0 when not given. */
    exit?: number;
    /** What a relaunch returns (2026-10-28-001 AC-2). */
    relaunchStatus?: number;
    /** The run receives the stop's SIGTERM: the improve stub invokes the tick's handler (2026-10-28-001 AC-7). */
    signalDuringRun?: boolean;
    /** A resumed release fails again at this step (2026-11-09-001 AC-19). */
    resumeFails?: number;
    /** No judge answered the run's probes (2026-11-09-004): the run makes no folder and returns 5. */
    noJudge?: boolean;
    /** The run stopped at a baseline not judged for this cause: its record carries it, exit 6. */
    unjudged?: string;
    /** The adoption's judge probe answers this for a model, in place of `ok` (2026-11-09-004 AC-36). */
    probe?: (model: string) => ProbeAnswer;
    /** A path the run's kept commit also writes (2026-11-11-002 AC-32): one outside the harness fails the adoption gate. */
    keptAlso?: string;
    /**
     * The release answers a version pending at step 7 that is not confirmed on origin (2026-11-13-004):
     * as the recovery's rule 3 reports it (`rule-3`, nothing committed), as a push of unknown outcome
     * does (`unknown`, the release's commit and tag in the clone), or as one that did land (`landed`,
     * that commit and tag on origin too).
     */
    unconfirmed?: "rule-3" | "unknown" | "landed";
    /** What `gh auth token -u` answers: a token when not given (2026-11-13-005, where a due tick reads it), none for `false`, a read killed at its bound for `"hangs"`. */
    releaseToken?: boolean | "hangs";
    /** A new release stops before step 1 with this line (2026-11-13-005 AC-51). */
    stopped?: string;
    /** A resume stops with this line. */
    resumeStopped?: string;
    /** The command a dead tick left, as the home's file names it (2026-11-13-005 AC-49). */
    tickCommand?: number | null;
    /** The command a dead tick's release left, as the clone's file names it (2026-11-13-005 AC-49). */
    leftCommand?: number | null;
    /** An install still runs, by this pid (2026-11-13-005 AC-50). */
    installRunning?: number;
    /** The stop's marker appears during the tick: at the packages' install, or at the shell's, which then fails (2026-11-13-005 AC-49). */
    stopMarker?: "during" | "at the install";
    /** A clone writes a file into its target and fails (2026-11-13-005 AC-41). */
    cloneFails?: boolean;
    /** The fast-forward's merge in the user's checkout is killed at its bound (2026-11-13-005 AC-41). */
    userMergeHangs?: boolean;
    /** `bun install` fails (2026-11-13-005 AC-37). */
    packagesFail?: boolean;
    /** The shell's install is killed at its bound (2026-11-13-005 AC-39). */
    shellInstall?: "hangs";
    /** The run's baseline for this case errored (2026-11-13-005 AC-48). */
    baselineErrored?: string;
  } = {},
): { deps: TickDeps; seen: Seen } {
  const seen: Seen = {
    sh: [],
    shOptions: [],
    git: [],
    kills: [],
    pauses: [],
    signals: [],
    relaunch: [],
    improve: [],
    ceilings: [],
    judge: 0,
    probes: [],
    release: [],
    fromSteps: [],
    accounts: [],
    log: [],
    heads: {},
  };
  const now = new Date(options.now ?? "2026-10-25T20:00:00.000Z");
  const deps: TickDeps = {
    tickCommand: () => options.tickCommand ?? null,
    leftCommand: () => options.leftCommand ?? null,
    killGroup: (group) => {
      seen.kills.push({ group, after: seen.sh.length + seen.git.length });
    },
    installRunning: () => options.installRunning ?? null,
    pause: (ms) => {
      seen.pauses.push(ms);
    },
    userHome: "/Users/someone",
    home: world.home,
    originUrl: world.origin,
    env: { PATH: process.env.PATH ?? "" },
    now: () => now,
    pid: 4242,
    boot: () => "boot-1",
    alive: () => options.alive ?? false,
    onSignal: (signal, handler) => {
      seen.signals.push(`on ${signal}`);
      seen.handler = handler;
      return () => seen.signals.push(`off ${signal}`);
    },
    relaunch: (args) => {
      seen.relaunch.push({ args, lockGone: !existsSync(join(world.home, "lock.json")) });
      return options.relaunchStatus ?? 0;
    },
    git: (args, cwd) => {
      seen.git.push({ args: [...args], cwd });
      if (options.cloneFails && args[0] === "clone") {
        const target = args[args.length - 1] as string;
        mkdirSync(target, { recursive: true });
        writeFileSync(join(target, "half"), "");
        return { status: 128, stdout: "", stderr: "fatal: the remote hung up\nmore" };
      }
      if (options.userMergeHangs && args[0] === "merge" && cwd === world.user)
        return { status: 1, stdout: "", stderr: "", timedOut: true };
      if (options.refusePush && args[0] === "push")
        return { status: 1, stdout: "", stderr: "! [remote rejected] main (refused)" };
      const r = spawnSync("git", args, {
        cwd,
        encoding: "utf8",
        env: {
          ...childEnv(),
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@t",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@t",
        },
      });
      return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
    sh: (cmd, shOptions) => {
      seen.sh.push([...cmd]);
      seen.shOptions.push({ cmd: [...cmd], timeoutMs: shOptions?.timeoutMs });
      const stopNow = () =>
        writeFileSync(join(world.home, "stop.json"), '{"at":"now","by":"stop"}\n');
      if (options.stopMarker === "during" && cmd[0] === "bun" && cmd[1] === "install") stopNow();
      if (options.stopMarker === "at the install" && cmd[0] === "env") {
        stopNow();
        return { status: 143, stdout: "", stderr: "terminated" };
      }
      if (options.packagesFail && cmd[0] === "bun" && cmd[1] === "install")
        return { status: 1, stdout: "", stderr: "the registry is away\nmore" };
      if (options.shellInstall === "hangs" && cmd[0] === "env" && cmd.includes("install"))
        return { status: 1, stdout: "", stderr: "", timedOut: true };
      if (cmd.join(" ").startsWith("gh auth token")) {
        if (options.releaseToken === "hangs")
          return { status: 1, stdout: "", stderr: "", timedOut: true };
        if (options.releaseToken !== false) return { status: 0, stdout: "a-token\n", stderr: "" };
      }
      if (cmd[0] === "env" && cmd.includes("install") && shOptions?.cwd) {
        if (options.shellInstallFails)
          return { status: 1, stdout: "", stderr: "the download failed\nmore" };
        const build = join(
          shOptions.cwd,
          "node_modules/.cache/ms-playwright/chromium_headless_shell-1",
        );
        mkdirSync(build, { recursive: true });
        writeFileSync(join(build, "INSTALLATION_COMPLETE"), "");
        // The real repository ignores node_modules; this world's has no .gitignore.
        appendFileSync(join(shOptions.cwd, ".git/info/exclude"), "node_modules/\n");
      }
      return { status: 0, stdout: "", stderr: "" };
    },
    improve: async (opts, repo) => {
      seen.improve.push({ cases: opts.cases, provider: opts.provider?.name ?? "none" });
      seen.ceilings.push(opts.maxCostUsd);
      if (options.noJudge) return 5;
      if (options.signalDuringRun) seen.handler?.();
      const date = now.toISOString().slice(0, 10);
      // The next free folder of the day, as createImproveFolder names it.
      const taken = existsSync(join(repo, "docs/improve"))
        ? readdirSync(join(repo, "docs/improve")).filter((n) => n.startsWith(`${date}-`)).length
        : 0;
      const run = `${date}-${taken + 1}`;
      const folder = join(repo, "docs/improve", run);
      mkdirSync(folder, { recursive: true });
      const { listed, gained } = options.lessons ?? {
        listed: [`K-${world.lessons.held + 1}`],
        gained: 1,
      };
      world.lessons.held += gained;
      const record = {
        run,
        at: now.toISOString(),
        targets: opts.cases,
        baseline: Object.fromEntries(
          opts.cases.map((c) => [
            c,
            options.unjudged === undefined
              ? { ...figures(0.5), ...(options.baselineErrored === c ? { errored: true } : {}) }
              : { ...figures(0), unjudged: true, runs: [{ score: 0, unjudged: options.unjudged }] },
          ]),
        ),
        proposals:
          options.unjudged !== undefined
            ? []
            : [
                {
                  id: "P-1",
                  probe: Object.fromEntries(opts.cases.map((c) => [c, figures(0.9)])),
                  verdict: options.kept ? "win" : "lose",
                  rationale: options.echo ?? "",
                },
              ],
        composition: null,
        kept: options.kept ? { kind: "single", id: "P-1" } : null,
        branch: options.kept ? `improve/${run}` : null,
        provider: opts.provider
          ? { name: opts.provider.name, claudeModels: opts.provider.claudeModels }
          : null,
        costUsd: 1.5,
        exit: options.unjudged === undefined ? (options.exit ?? 0) : 6,
        ...(listed === undefined ? {} : { lessons: listed }),
      };
      writeFileSync(join(folder, "record.json"), `${JSON.stringify(record, null, 2)}\n`);
      writeFileSync(join(folder, "record.md"), `# ${record.run}\n\n${options.echo ?? ""}\n`);
      if (options.raceTouching) {
        mkdirSync(join(world.user, dirname(options.raceTouching)), { recursive: true });
        writeFileSync(join(world.user, options.raceTouching), "moved during the run\n");
        git(world.user, "add", "-A");
        git(world.user, "commit", "-q", "-m", `race: ${options.raceTouching}`);
        git(world.user, "push", "-q", "origin", "main");
      }
      if (options.kept) {
        git(repo, "checkout", "-q", "-b", record.branch as string);
        writeFileSync(join(repo, "plugins/core/skills/crew/SKILL.md"), "# Crew\n\nBetter.\n");
        if (options.keptAlso) {
          mkdirSync(join(repo, dirname(options.keptAlso)), { recursive: true });
          writeFileSync(join(repo, options.keptAlso), "export {};\n");
          // That path alone: the run's record folder is not the branch's to carry.
          git(repo, "add", options.keptAlso);
        }
        git(repo, "commit", "-q", "-am", `Improvement run ${record.run}: P-1`);
        git(repo, "checkout", "-q", "main");
      }
      return options.unjudged === undefined ? 0 : 6;
    },
    probeJudge: (call) => {
      seen.probes.push(call.model);
      return options.probe?.(call.model) ?? { status: 0, output: "ok", timedOut: false };
    },
    judge: () => {
      seen.judge += 1;
      return { status: 0, output: options.judge ?? holdsJson };
    },
    release: async (opts) => {
      seen.release.push(opts.reason);
      seen.accounts.push(opts.githubAccount);
      const version = "0.15.1";
      if (opts.resume) {
        seen.fromSteps.push(opts.fromStep);
        if (options.resumeStopped !== undefined)
          return {
            version: opts.resume,
            code: 1,
            failedStep: null,
            pending: false,
            stopped: options.resumeStopped,
          };
        return options.resumeFails === undefined
          ? { version, code: 0, failedStep: null, pending: false }
          : { version, code: 1, failedStep: options.resumeFails, pending: true };
      }
      if (options.stopped !== undefined)
        return { version: "", code: 1, failedStep: null, pending: false, stopped: options.stopped };
      if (options.unconfirmed) {
        const at = (rev: string) => git(opts.root, "rev-parse", rev).trim();
        seen.heads = { ruling: at("HEAD"), merge: at("HEAD~1"), before: at("HEAD~1^1") };
        if (options.unconfirmed !== "rule-3") {
          writeFileSync(join(opts.root, "package.json"), '{ "name": "r", "version": "0.15.1" }\n');
          git(opts.root, "add", "-A");
          git(opts.root, "commit", "-q", "-m", `Release ${version}: ${opts.reason}`);
          git(opts.root, "tag", `v${version}`);
          seen.heads.release = at("HEAD");
        }
        if (options.unconfirmed === "landed") {
          git(opts.root, "push", "-q", "origin", "main", `v${version}`);
          seen.heads.origin = at("HEAD");
        }
        return { version, code: 1, failedStep: 7, pending: true, localUnconfirmed: true };
      }
      if ((options.releaseCode ?? 0) === 0) {
        // The release commits and pushes like the real one: the version file and the tag.
        writeFileSync(join(opts.root, "package.json"), '{ "name": "r", "version": "0.15.1" }\n');
        git(opts.root, "add", "-A");
        git(opts.root, "commit", "-q", "-m", `Release ${version}: ${opts.reason}`);
        git(opts.root, "tag", `v${version}`);
        git(opts.root, "push", "-q", "origin", "main", `v${version}`);
        if (options.raceAfterAdoption) {
          git(world.user, "pull", "-q", "--rebase", "origin", "main");
          writeFileSync(join(world.user, options.raceAfterAdoption), "moved after the adoption\n");
          git(world.user, "add", "-A");
          git(
            world.user,
            "commit",
            "-q",
            "-m",
            `race after the adoption: ${options.raceAfterAdoption}`,
          );
          git(world.user, "push", "-q", "origin", "main");
        }
        return { version, code: 0, failedStep: null, pending: false };
      }
      const step = options.releaseStep ?? 9;
      return { version, code: 1, failedStep: step, pending: step > 6 };
    },
    readSecret: () => options.secret ?? null,
    plan: () => null,
    lessons: () => world.lessons.held,
    userCheckout: world.user,
    tmpdir: world.tmp,
    log: (line) => seen.log.push(line),
  };
  return { deps, seen };
}

const originHead = (origin: string, what = "%s") =>
  git(origin, "log", "-1", `--format=${what}`, "main").trim();

test("2026-10-25-005 AC-5: a tick clones and bootstraps the loop's repository, runs the improvement on the picked targets, commits and pushes the record and the daily report, fast-forwards a clean user checkout and leaves a dirty one named; nothing is due twice; --dry-run runs nothing", async () => {
  const world = loopWorld();
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  const repo = join(world.home, "repo");
  expect(existsSync(join(repo, ".git"))).toBe(true);
  expect(first.seen.sh.filter((c) => c[0] === "bun")).toEqual([
    ["bun", "install", "--frozen-lockfile"],
  ]);
  expect(first.seen.improve).toEqual([{ cases: ["t", "u"], provider: "runtime" }]);
  expect(originHead(world.origin)).toBe("Improvement run 2026-10-25-1: nothing kept");
  const files = git(world.origin, "show", "--name-only", "--format=", "main");
  expect(files).toContain("docs/improve/2026-10-25-1/record.json");
  expect(files).toContain("docs/improve/daily/2026-10-25.md");
  expect(git(world.user, "rev-parse", "HEAD").trim()).toBe(originHead(world.origin, "%H"));
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(state.lastRun.run).toBe("2026-10-25-1");
  expect(existsSync(join(world.home, "lock.json"))).toBe(false);
  const notify = first.seen.sh.find((c) => c[0] === "osascript") as string[];
  expect(notify.join(" ")).toContain("crew improve");
  expect(notify.join(" ")).toContain("nothing kept");
  // The same facts: nothing due, nothing run, no install.
  const second = tickDeps(world);
  expect(await tick({}, second.deps)).toBe(0);
  expect(second.seen.improve).toEqual([]);
  // The packages are installed at every tick, a no-op when they are there (2026-11-13-005).
  expect(second.seen.sh.filter((c) => c[0] === "bun")).toEqual([
    ["bun", "install", "--frozen-lockfile"],
  ]);
  expect(second.seen.log.join("\n")).toContain(
    "not due: nothing new since the last run and no case older than 7 days",
  );
  // New plugin text and a new lockfile on origin, the user's checkout dirty: a run, an install, the checkout left and named.
  writeFileSync(join(world.user, "plugins/core/skills/crew/SKILL.md"), "# Crew\n\nRule 2.\n");
  writeFileSync(join(world.user, "bun.lock"), "lock 2\n");
  git(world.user, "commit", "-q", "-am", "rule 2");
  git(world.user, "push", "-q", "origin", "main");
  writeFileSync(join(world.user, "stray.md"), "x");
  const third = tickDeps(world, { now: "2026-10-25T21:00:00.000Z" });
  expect(await tick({}, third.deps)).toBe(0);
  expect(third.seen.log.join("\n")).toContain("due: the plugin's text changed on origin/main");
  expect(third.seen.sh.filter((c) => c[0] === "bun")).toEqual([
    ["bun", "install", "--frozen-lockfile"],
  ]);
  expect(third.seen.improve).toHaveLength(1);
  expect(originHead(world.origin)).toBe("Improvement run 2026-10-25-2: nothing kept");
  expect(git(world.user, "log", "-1", "--format=%s").trim()).toBe("rule 2");
  expect(third.seen.log.join("\n")).toContain(
    "the user's checkout has uncommitted changes: left as it is",
  );
  // Paused by the configuration: the tick leaves after its probe, nothing run.
  writeFileSync(join(world.home, "config.json"), JSON.stringify({ paused: true }));
  const paused = tickDeps(world, { now: "2026-10-25T21:30:00.000Z" });
  expect(await tick({}, paused.deps)).toBe(0);
  expect(paused.seen.log.join("\n")).toContain("paused by config.json; nothing run");
  expect(paused.seen.improve).toEqual([]);
  rmSync(join(world.home, "config.json"));
  // A dry run on a due tick: the decision and the targets, nothing run (the user's checkout first brought up to date).
  rmSync(join(world.user, "stray.md"));
  git(world.user, "pull", "-q", "--ff-only", "origin", "main");
  writeFileSync(join(world.user, "plugins/core/agents/judge.md"), "# Judge\n\nMore.\n");
  git(world.user, "commit", "-q", "-am", "judge");
  git(world.user, "push", "-q", "origin", "main");
  const dry = tickDeps(world, { now: "2026-10-25T22:00:00.000Z" });
  expect(await tick({ dryRun: true }, dry.deps)).toBe(0);
  expect(dry.seen.log.join("\n")).toContain(
    "dry run: due (the plugin's text changed on origin/main",
  );
  expect(dry.seen.log.join("\n")).toContain("targets: t, u");
  expect(dry.seen.improve).toEqual([]);
  expect(originHead(world.origin)).toBe("judge");
});

test("2026-10-25-005 AC-5 (adoption in the tick): a kept harness goes through the gate, the judge and the release, and the day's report and notification say so; a release that stops after the push leaves the pending step in the state", async () => {
  const world = loopWorld();
  const kept = tickDeps(world, { kept: true });
  expect(await tick({}, kept.deps)).toBe(0);
  expect(kept.seen.judge).toBe(1);
  expect(kept.seen.release).toEqual(["improvement run 2026-10-25-1: t 0.50 → 0.90, u 0.50 → 0.90"]);
  expect(kept.seen.accounts).toEqual(["andreagroferreira"]);
  // The release's commit is on origin, under the report that records it.
  expect(git(world.origin, "log", "--format=%s", "main")).toContain(
    "Release 0.15.1: improvement run 2026-10-25-1",
  );
  expect(originHead(world.origin)).toBe("Improvement run 2026-10-25-1: the day's report");
  expect(git(world.origin, "tag", "--list").trim()).toBe("v0.15.1");
  const report = readFileSync(join(world.home, "repo/docs/improve/daily/2026-10-25.md"), "utf8");
  expect(report).toContain("- 0.15.1 from run 2026-10-25-1");
  const notify = kept.seen.sh.find((c) => c[0] === "osascript") as string[];
  expect(notify.join(" ")).toContain("crew 0.15.1");
  expect(notify.join(" ")).toContain("t 0.50 → 0.90");
  // A release that fails after the push: the state remembers the step, the notification names it.
  const second = loopWorld();
  const failed = tickDeps(second, { kept: true, releaseCode: 1 });
  expect(await tick({}, failed.deps)).toBe(0);
  const state = JSON.parse(readFileSync(join(second.home, "state.json"), "utf8"));
  expect(state.pendingRelease).toEqual({
    version: "0.15.1",
    failedStep: 9,
    failedName: "the marketplace entry",
  });
  const notifyFailed = failed.seen.sh.find((c) => c[0] === "osascript") as string[];
  expect(notifyFailed.join(" ")).toContain("the release did not finish");
  expect(git(second.origin, "branch", "--list", "improve/2026-10-25-1").trim()).toBe(
    "improve/2026-10-25-1",
  );
  // A release that fails before its push: the merge is undone, nothing of it reaches origin, the ruling stays on record, the branch stays.
  const third = loopWorld();
  const rolled = tickDeps(third, { kept: true, releaseCode: 1, releaseStep: 3 });
  expect(await tick({}, rolled.deps)).toBe(0);
  const log = git(third.origin, "log", "--format=%s", "main");
  expect(log).not.toContain("Adopt improvement run");
  expect(log).not.toContain("Release ");
  expect(git(third.origin, "log", "-1", "--format=%P", "main").trim().split(" ")).toHaveLength(1);
  expect(git(third.origin, "ls-tree", "-r", "--name-only", "main")).toContain(
    "docs/improve/2026-10-25-1/adoption/ruling.md",
  );
  expect(git(third.origin, "branch", "--list", "improve/2026-10-25-1").trim()).toBe(
    "improve/2026-10-25-1",
  );
  expect(readFileSync(join(third.home, "repo/docs/improve/daily/2026-10-25.md"), "utf8")).toContain(
    "step 3 (bun run check) failed",
  );
  expect(
    JSON.parse(readFileSync(join(third.home, "state.json"), "utf8")).pendingRelease ?? null,
  ).toBeNull();
});

test("2026-10-25-005 AC-16: a live lock leaves the tick, a dead or foreign-boot lock is taken over; the logs rotate above 5 MB; a stale worktree and the stale temp folders are pruned at the start", async () => {
  const world = loopWorld();
  // A live lock from a live pid on this boot: the tick leaves with a line.
  mkdirSync(world.home, { recursive: true });
  writeFileSync(
    join(world.home, "lock.json"),
    JSON.stringify({ pid: 1, startedAt: "x", boot: "boot-1" }),
  );
  const held = tickDeps(world, { alive: true });
  expect(await tick({}, held.deps)).toBe(0);
  expect(held.seen.log.join("\n")).toContain("another tick holds the lock (pid 1)");
  expect(held.seen.improve).toEqual([]);
  // The same lock with its pid dead: taken over, the tick runs.
  const dead = tickDeps(world, { alive: false });
  expect(await tick({}, dead.deps)).toBe(0);
  expect(dead.seen.log.join("\n")).toContain("a stale lock (pid 1) is taken over");
  expect(dead.seen.improve).toHaveLength(1);
  // A lock from another boot, its pid alive by number: taken over too.
  writeFileSync(
    join(world.home, "lock.json"),
    JSON.stringify({ pid: 1, startedAt: "x", boot: "boot-0" }),
  );
  const rebooted = tickDeps(world, { alive: true });
  expect(await tick({}, rebooted.deps)).toBe(0);
  expect(rebooted.seen.log.join("\n")).toContain("a stale lock (pid 1) is taken over");
  // Rotation and pruning.
  const repo = join(world.home, "repo");
  mkdirSync(join(world.home, "log"), { recursive: true });
  writeFileSync(join(world.home, "log", "tick.out.log"), "x".repeat(6 * 1024 * 1024));
  writeFileSync(join(world.home, "log", "tick.err.log"), "small");
  const stale = join(world.tmp, "stale-tree");
  git(repo, "worktree", "add", "-q", "--detach", stale, "HEAD");
  rmSync(stale, { recursive: true, force: true });
  mkdirSync(join(world.tmp, "improve-trees-abc"), { recursive: true });
  mkdirSync(join(world.tmp, "improve-hooks-abc"), { recursive: true });
  // Old enough to be leftovers, not a run in progress by hand.
  utimesSync(join(world.tmp, "improve-trees-abc"), 1, 1);
  utimesSync(join(world.tmp, "improve-hooks-abc"), 1, 1);
  mkdirSync(join(world.tmp, "other-xyz"), { recursive: true });
  const pruned = tickDeps(world);
  expect(await tick({}, pruned.deps)).toBe(0);
  expect(existsSync(join(world.home, "log", "tick.out.log.1"))).toBe(true);
  expect(existsSync(join(world.home, "log", "tick.out.log"))).toBe(false);
  expect(readFileSync(join(world.home, "log", "tick.err.log"), "utf8")).toBe("small");
  expect(git(repo, "worktree", "list", "--porcelain").split("worktree ").length - 1).toBe(1);
  expect(existsSync(join(world.tmp, "improve-trees-abc"))).toBe(false);
  expect(existsSync(join(world.tmp, "improve-hooks-abc"))).toBe(false);
  expect(existsSync(join(world.tmp, "other-xyz"))).toBe(true);
});

/** A checkout with the loop's script, to clone from at install. */
function loopSeed(withScript = true): string {
  const seed = tempDir("seed-");
  mkdirSync(join(seed, "scripts"), { recursive: true });
  writeFileSync(join(seed, "bun.lock"), "lock\n");
  if (withScript) writeFileSync(join(seed, "scripts/improve-loop.ts"), "export {};\n");
  git(seed, "init", "-q", "-b", "main");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "init");
  return seed;
}

function installDeps(
  home: string,
  probe: Record<string, unknown> | null,
  options: {
    bootoutStatus?: number;
    which?: Record<string, string | null>;
    /** The origin a heal fetches from (finding 169): a local one, never GitHub, in a test. */
    originUrl?: string;
    /** The command the ended tick's release left running, by its pid (2026-11-13-004). */
    leftCommand?: number | null;
    /** A clone writes a file into its target and fails (2026-11-13-005 AC-41). */
    cloneFails?: boolean;
    /** The command the ended tick left, as the home's file names it (2026-11-13-005 AC-49). */
    tickCommand?: number | null;
    /** The install's two doors (2026-11-13-005 AC-50): the real ones when not given. */
    installLock?: ReturnType<typeof installLockOf>;
    installCommand?: ReturnType<typeof installCommandOf>;
    /** The tick's lock still names a living tick after the bootout. */
    liveTick?: boolean;
    packagesFail?: boolean;
    /** `bun install` throws, as a command that cannot be started does. */
    packagesThrow?: boolean;
    /** The agent's load fails. */
    loadFails?: boolean;
    /** The first tick's probe appears only after this many seconds of the install's wait (2026-11-13-005). */
    probeAfterSeconds?: number;
  } = {},
) {
  const seen: string[][] = [];
  /** Every command in order, git's among them, each with what `install.lock` held then. */
  const order: { cmd: string; lock: string | null }[] = [];
  const note = (cmd: string) =>
    order.push({
      cmd,
      lock: existsSync(join(home, INSTALL_LOCK))
        ? readFileSync(join(home, INSTALL_LOCK), "utf8")
        : null,
    });
  const gits: { args: string[]; cwd: string }[] = [];
  let waited = 0;
  const log: string[] = [];
  const asked: { root: string; startedBy: number }[] = [];
  const kills: number[] = [];
  const lockAnswer = options.installLock;
  const commandAnswer = options.installCommand;
  const deps: InstallDeps = {
    tickCommand: () => options.tickCommand ?? null,
    ...(lockAnswer === undefined ? {} : { installLock: () => lockAnswer }),
    ...(commandAnswer === undefined ? {} : { installCommand: () => commandAnswer }),
    alive: () => options.liveTick ?? false,
    leftCommand: (root, startedBy) => {
      asked.push({ root, startedBy });
      return options.leftCommand ?? null;
    },
    killGroup: (pid) => {
      kills.push(pid);
      // In the one list of what was run, so a row can say what came first.
      seen.push(["kill group", String(pid)]);
    },
    home,
    originUrl:
      options.originUrl ?? "git@github.com:WizardingCode-io/wizardingcode-developer-crew.git",
    userHome: join(home, "..", "user-home"),
    uid: 501,
    env: { PATH: "/usr/bin" },
    which: (tool) =>
      options.which && tool in options.which
        ? (options.which[tool] as string | null)
        : `/opt/tools/${tool}/bin/${tool}`,
    git: (args, cwd) => {
      gits.push({ args: [...args], cwd });
      note(`git ${args[0]}`);
      if (options.cloneFails && args[0] === "clone") {
        const target = args[args.length - 1] as string;
        mkdirSync(target, { recursive: true });
        writeFileSync(join(target, "half"), "");
        return { status: 128, stdout: "", stderr: "fatal: the remote hung up\nmore" };
      }
      const r = spawnSync("git", args, { cwd, encoding: "utf8" });
      return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
    sh: (cmd) => {
      seen.push([...cmd]);
      note(cmd.slice(0, 2).join(" "));
      if (options.packagesFail && cmd[0] === "bun")
        return { status: 1, stdout: "", stderr: "the registry is away" };
      if (options.packagesThrow && cmd[0] === "bun") throw new Error("spawn bun ENOENT");
      if (options.loadFails && cmd[0] === "launchctl" && cmd[1] === "bootstrap")
        return { status: 5, stdout: "", stderr: "Bootstrap failed: 5: Input/output error" };
      if (cmd[0] === "launchctl" && cmd[1] === "bootout")
        return {
          status: options.bootoutStatus ?? 0,
          stdout: "",
          stderr: "Boot-out failed: 3: No such process",
        };
      if (cmd[0] === "launchctl" && cmd[1] === "kickstart" && probe && !options.probeAfterSeconds) {
        mkdirSync(home, { recursive: true });
        writeFileSync(join(home, "probe.json"), JSON.stringify(probe));
      }
      if (cmd[0] === "launchctl" && cmd[1] === "print")
        return { status: 0, stdout: `${LABEL} = {\n\tstate = waiting\n}\n`, stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    },
    wait: async () => {
      waited += 1;
      if (probe && options.probeAfterSeconds && waited === options.probeAfterSeconds)
        writeFileSync(join(home, "probe.json"), JSON.stringify(probe));
    },
    now: () => new Date("2026-10-25T20:00:00.000Z"),
    log: (line) => log.push(line),
  };
  return { deps, seen, log, asked, kills, gits, order };
}

test("2026-10-25-005 AC-8: the plist names the agent, the hourly tick with catch-up on wake, the tools' PATH and the two logs; install clones, bootstraps, boots the agent and prints the probe; uninstall boots it out; status says where the loop stands", async () => {
  const plist = launchdPlist({
    launcher: "/h/.wizardingcode/crew-improve/tick.sh",
    home: "/h/.wizardingcode/crew-improve",
    path: [
      "/opt/tools/bun/bin",
      "/opt/tools/node/bin",
      "/opt/tools/claude/bin",
      "/opt/tools/gh/bin",
      "/opt/tools/php/bin",
      "/usr/bin",
    ],
    userHome: "/h",
    wizardingcodeHome: "/h/.wizardingcode",
  });
  expect(plist).toContain(`<string>${LABEL}</string>`);
  expect(plist).toContain(
    "<string>/bin/sh</string>\n\t\t<string>/h/.wizardingcode/crew-improve/tick.sh</string>\n\t</array>",
  );
  expect(plist).toContain(
    "<key>StartCalendarInterval</key>\n\t<dict>\n\t\t<key>Minute</key>\n\t\t<integer>0</integer>\n\t</dict>",
  );
  expect(plist).toContain("<key>RunAtLoad</key>\n\t<true/>");
  expect(plist).toContain(
    "<key>PATH</key>\n\t\t<string>/opt/tools/bun/bin:/opt/tools/node/bin:/opt/tools/claude/bin:/opt/tools/gh/bin:/opt/tools/php/bin:/usr/bin</string>",
  );
  expect(plist).toContain("<key>HOME</key>\n\t\t<string>/h</string>");
  expect(plist).toContain("<key>WIZARDINGCODE_HOME</key>\n\t\t<string>/h/.wizardingcode</string>");
  expect(plist).toContain(
    "<key>StandardOutPath</key>\n\t<string>/h/.wizardingcode/crew-improve/log/tick.out.log</string>",
  );
  expect(plist).toContain(
    "<key>StandardErrorPath</key>\n\t<string>/h/.wizardingcode/crew-improve/log/tick.err.log</string>",
  );
  expect(plist).toContain("<key>ProcessType</key>\n\t<string>Standard</string>");
  // Install from a checkout: the clone with origin reset to GitHub, the bootstrap, the agent booted (an earlier copy's bootout tolerated), the probe printed.
  const base = tempDir("install-");
  const home = join(base, "crew-improve");
  const seed = loopSeed();
  const ok = installDeps(
    home,
    {
      loggedIn: true,
      authMethod: "claude.ai",
      github: "andreagroferreira",
      remote: "ok",
      push: "ok",
      keychain: { "or-token": "found" },
    },
    { bootoutStatus: 3 },
  );
  expect(await install({ cloneFrom: seed }, ok.deps)).toBe(0);
  expect(existsSync(join(home, "repo/scripts/improve-loop.ts"))).toBe(true);
  // The launcher, freshly written, is the agent's alone to read and run.
  expect(statSync(join(home, "tick.sh")).mode & 0o777).toBe(0o700);
  expect(git(join(home, "repo"), "remote", "get-url", "origin").trim()).toBe(
    "git@github.com:WizardingCode-io/wizardingcode-developer-crew.git",
  );
  const plistPath = join(ok.deps.userHome, "Library/LaunchAgents", `${LABEL}.plist`);
  expect(existsSync(plistPath)).toBe(true);
  expect(readFileSync(plistPath, "utf8")).toContain(
    `<string>/bin/sh</string>\n\t\t<string>${join(home, "tick.sh")}</string>`,
  );
  const launcher = readFileSync(join(home, "tick.sh"), "utf8");
  expect(launcher).toContain("bun='/opt/tools/bun/bin/bun'");
  expect(launcher).toContain(`repo='${join(home, "repo")}'`);
  // The agent is booted out before the install writes in the clone (2026-11-13-005).
  expect(ok.seen.filter((c) => c[0] !== "git")).toEqual([
    ["launchctl", "bootout", `gui/501/${LABEL}`],
    ["bun", "install", "--frozen-lockfile"],
    CLONE_SHELL_INSTALL,
    ["launchctl", "bootstrap", "gui/501", plistPath],
    ["launchctl", "kickstart", "-k", `gui/501/${LABEL}`],
  ]);
  const printed = ok.log.join("\n");
  expect(printed).toContain("login: claude.ai (logged in)");
  expect(printed).toContain("github: andreagroferreira");
  expect(printed).toContain("remote: ok; push: ok");
  expect(printed).toContain("keychain: or-token found");
  expect(printed).not.toContain("claude setup-token");
  // Not logged in: the fallback's three steps.
  const out = installDeps(join(base, "crew-improve-2"), {
    loggedIn: false,
    authMethod: "none",
    github: null,
    remote: "ok",
    push: "ok",
    keychain: {},
  });
  expect(await install({ cloneFrom: seed }, out.deps)).toBe(0);
  const fallback = out.log.join("\n");
  expect(fallback).toContain("1. claude setup-token");
  expect(fallback).toContain("2. bun scripts/improve-loop.ts secret set oauth-token");
  expect(fallback).toContain('3. "oauthToken": { "keychain": "oauth-token" } in config.json');
  // No script in the clone nor on origin/main (a local origin: the heal fetches from it): refused, nothing booted.
  const bareOrigin = join(base, "origin-bare.git");
  git(base, "clone", "-q", "--bare", loopSeed(false), bareOrigin);
  const bare = installDeps(join(base, "crew-improve-3"), null, { originUrl: bareOrigin });
  expect(await install({ cloneFrom: loopSeed(false) }, bare.deps)).toBe(1);
  expect(bare.log.join("\n")).toContain("the clone has no scripts/improve-loop.ts");
  // Since 2026-11-13-005 the agent is booted out first; an install that then fails loads again the one that was loaded.
  expect(bare.seen.filter((c) => c[0] === "launchctl").map((c) => c[1])).toEqual([
    "bootout",
    "bootstrap",
  ]);
  expect(bare.log.join("\n")).toContain("the agent that was loaded is loaded again");
  // A tool missing from PATH is refused by name.
  const noPhp = installDeps(join(base, "crew-improve-4"), null, { which: { php: null } });
  expect(await install({ cloneFrom: seed }, noPhp.deps)).toBe(1);
  expect(noPhp.log.join("\n")).toContain("php is not on PATH");
  // Uninstall: booted out, the plist gone.
  const down = installDeps(home, null);
  expect(await uninstall(down.deps)).toBe(0);
  expect(down.seen).toEqual([["launchctl", "bootout", `gui/501/${LABEL}`]]);
  expect(existsSync(plistPath)).toBe(false);
  // Status: the job, the last tick, the pending release, the next due reason, the day's cost.
  writeFileSync(
    join(home, "state.json"),
    JSON.stringify({
      lastTick: "2026-10-25T19:00:00.000Z",
      lastRun: {
        at: "2026-10-25T19:00:00.000Z",
        head: "abc",
        plan: null,
        lessons: 0,
        run: "2026-10-25-1",
      },
      pendingRelease: { version: "0.15.1", failedStep: 9 },
      day: {
        date: "2026-10-25",
        releases: [],
        failures: [{ run: "2026-10-25-1", step: 9, name: "the marketplace entry" }],
      },
      lock: null,
    }),
  );
  const text = statusText(installDeps(home, null).deps);
  expect(text).toContain("job: state = waiting");
  expect(text).toContain("last tick: 2026-10-25T19:00:00.000Z");
  expect(text).toContain("last run: 2026-10-25-1 at 2026-10-25T19:00:00.000Z");
  expect(text).toContain("pending release: 0.15.1 at step 9 (the marketplace entry)");
  expect(text).toContain("next: ");
  expect(text).toContain("today: ");
  // The name stored with the pending release is the one printed, whatever the step list says of
  // that number now (2026-11-09-001 AC-19).
  const stored = JSON.parse(readFileSync(join(home, "state.json"), "utf8"));
  writeFileSync(
    join(home, "state.json"),
    JSON.stringify({
      ...stored,
      pendingRelease: { version: "0.15.1", failedStep: 12, failedName: "the notification" },
    }),
  );
  expect(statusText(installDeps(home, null).deps)).toContain(
    "pending release: 0.15.1 at step 12 (the notification)",
  );
});

test("2026-10-25-010 AC-1: a tick never removes the loop it runs from: origin/main without scripts/improve-loop.ts leaves the clone at its commit, and the sync proceeds once the loop is on main", async () => {
  const world = loopWorld({ loop: false });
  // The clone as `install --clone-from` makes it: a commit ahead of origin, with the loop.
  const repo = join(world.home, "repo");
  git(world.home, "clone", "-q", world.origin, repo);
  mkdirSync(join(repo, "scripts"), { recursive: true });
  writeFileSync(join(repo, "scripts/improve-loop.ts"), "export {};\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "the loop");
  const ahead = git(repo, "rev-parse", "HEAD").trim();
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  expect(first.seen.log.join("\n")).toContain(
    `origin/main has no scripts/improve-loop.ts: the clone stays at ${ahead.slice(0, 7)}; waiting for the loop's commit`,
  );
  expect(git(repo, "rev-parse", "HEAD").trim()).toBe(ahead);
  expect(existsSync(join(repo, "scripts/improve-loop.ts"))).toBe(true);
  expect(first.seen.improve).toEqual([]);
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(state.lastTick).toBe("2026-10-25T20:00:00.000Z");
  expect(state.backoffUntil).toBeUndefined();
  expect(state.failures).toBeUndefined();
  // The loop pushed to main: the next tick syncs the clone and runs.
  mkdirSync(join(world.user, "scripts"), { recursive: true });
  writeFileSync(join(world.user, "scripts/improve-loop.ts"), "export {};\n");
  git(world.user, "add", "-A");
  git(world.user, "commit", "-q", "-m", "the loop on main");
  git(world.user, "push", "-q", "origin", "main");
  const second = tickDeps(world, { now: "2026-10-25T21:00:00.000Z" });
  expect(await tick({}, second.deps)).toBe(0);
  expect(second.seen.log.join("\n")).not.toContain("has no scripts/improve-loop.ts");
  expect(second.seen.improve).toHaveLength(1);
  expect(git(repo, "branch", "--contains", ahead).trim()).toBe("");
});

test("2026-10-25-010 AC-2: the launcher brings a clone without the loop to origin/main before the tick, and launches a clone that has it as it is", () => {
  const base = tempDir("launcher-");
  // An origin whose first commit has no loop and whose main has it.
  const seed = loopSeed(false);
  writeFileSync(join(seed, "scripts/improve-loop.ts"), "export {};\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "the loop");
  const origin = join(base, "origin.git");
  git(base, "clone", "-q", "--bare", seed, origin);
  const repo = join(base, "repo");
  git(base, "clone", "-q", origin, repo);
  // The clone as a sync to the older main left it: without the loop.
  git(repo, "reset", "-q", "--hard", "HEAD~1");
  expect(existsSync(join(repo, "scripts/improve-loop.ts"))).toBe(false);
  // bun played by a script that records its calls.
  const calls = join(base, "bun-calls");
  const bun = join(base, "bun");
  writeFileSync(bun, `#!/bin/sh\necho "$@" >> '${calls}'\n`);
  chmodSync(bun, 0o755);
  const launcher = join(base, "tick.sh");
  writeFileSync(launcher, launcherScript({ bun, repo }));
  const healed = spawnSync("sh", [launcher], { encoding: "utf8" });
  expect(healed.status).toBe(0);
  expect(git(repo, "rev-parse", "HEAD").trim()).toBe(git(repo, "rev-parse", "origin/main").trim());
  expect(existsSync(join(repo, "scripts/improve-loop.ts"))).toBe(true);
  expect(readFileSync(calls, "utf8")).toBe(
    `install --frozen-lockfile\n${join(repo, "scripts/improve-loop.ts")} tick\n`,
  );
  // A clone that has the loop is launched as it is, origin ahead or not: the tick's own sync
  // keeps an interrupted run's records.
  git(seed, "commit", "-q", "--allow-empty", "-m", "ahead");
  git(seed, "push", "-q", origin, "main");
  const head = git(repo, "rev-parse", "HEAD").trim();
  rmSync(calls);
  expect(spawnSync("sh", [launcher], { encoding: "utf8" }).status).toBe(0);
  expect(git(repo, "rev-parse", "HEAD").trim()).toBe(head);
  expect(readFileSync(calls, "utf8")).toBe(`${join(repo, "scripts/improve-loop.ts")} tick\n`);
});

test("2026-10-25-010 AC-6: the launcher quotes its paths, runs no reset when the heal cannot complete, and ends with bun's status", () => {
  const base = tempDir("launcher-quoting-");
  // An origin whose main has no loop and moves ahead of the clone: a reset would move HEAD.
  const seed = loopSeed(false);
  const origin = join(base, "origin.git");
  git(base, "clone", "-q", "--bare", seed, origin);
  const repo = join(base, "it's $(x) repo");
  git(base, "clone", "-q", origin, repo);
  const head = git(repo, "rev-parse", "HEAD").trim();
  git(seed, "commit", "-q", "--allow-empty", "-m", "ahead, still no loop");
  git(seed, "push", "-q", origin, "main");
  const calls = join(base, "bun-calls");
  const bun = join(base, "bun");
  writeFileSync(bun, `#!/bin/sh\necho "$@" >> '${calls}'\nexit "\${BUN_EXIT:-0}"\n`);
  chmodSync(bun, 0o755);
  const launcher = join(base, "tick.sh");
  const script = launcherScript({ bun, repo });
  writeFileSync(launcher, script);
  expect(script).toContain(`repo='${join(base, "it'\\''s $(x) repo")}'`);
  const noLoop = spawnSync("sh", [launcher], {
    encoding: "utf8",
    env: { ...childEnv(), BUN_EXIT: "3" },
  });
  expect(noLoop.status).toBe(3);
  expect(git(repo, "rev-parse", "HEAD").trim()).toBe(head);
  expect(readFileSync(calls, "utf8")).toBe(`${join(repo, "scripts/improve-loop.ts")} tick\n`);
  // The fetch failing: no reset either, bun still run.
  git(repo, "remote", "set-url", "origin", join(base, "gone.git"));
  rmSync(calls);
  const noFetch = spawnSync("sh", [launcher], { encoding: "utf8" });
  expect(noFetch.status).toBe(0);
  expect(git(repo, "rev-parse", "HEAD").trim()).toBe(head);
  expect(readFileSync(calls, "utf8")).toBe(`${join(repo, "scripts/improve-loop.ts")} tick\n`);
});

test("2026-10-25-010 AC-3: install brings an existing clone without the loop to origin/main before its check and writes the launcher with mode 0700; an origin without the loop is still refused", async () => {
  const base = tempDir("install-heal-");
  const probe = {
    loggedIn: true,
    authMethod: "claude.ai",
    github: "andreagroferreira",
    remote: "ok",
    push: "ok",
    keychain: {},
  };
  // An origin whose main holds the loop, and a clone of it left at the commit before.
  const seed = loopSeed(false);
  writeFileSync(join(seed, "scripts/improve-loop.ts"), "export {};\n");
  git(seed, "add", "-A");
  git(seed, "commit", "-q", "-m", "the loop");
  const origin = join(base, "origin.git");
  git(base, "clone", "-q", "--bare", seed, origin);
  const home = join(base, "crew-improve");
  mkdirSync(home, { recursive: true });
  git(home, "clone", "-q", origin, join(home, "repo"));
  git(join(home, "repo"), "reset", "-q", "--hard", "HEAD~1");
  // An earlier launcher left looser than it should be (AC-6).
  writeFileSync(join(home, "tick.sh"), "stale\n");
  chmodSync(join(home, "tick.sh"), 0o644);
  const healed = installDeps(home, probe);
  expect(await install({}, healed.deps)).toBe(0);
  expect(existsSync(join(home, "repo/scripts/improve-loop.ts"))).toBe(true);
  expect(git(join(home, "repo"), "rev-parse", "HEAD").trim()).toBe(
    git(join(home, "repo"), "rev-parse", "origin/main").trim(),
  );
  expect(healed.log.join("\n")).toContain(
    "the clone had no scripts/improve-loop.ts: brought to origin/main",
  );
  // The agent is booted out before the install writes in the clone (2026-11-13-005).
  expect(healed.seen.filter((c) => c[0] !== "git").slice(0, 3)).toEqual([
    ["launchctl", "bootout", `gui/501/${LABEL}`],
    ["bun", "install", "--frozen-lockfile"],
    CLONE_SHELL_INSTALL,
  ]);
  expect(statSync(join(home, "tick.sh")).mode & 0o777).toBe(0o700);
  expect(readFileSync(join(home, "tick.sh"), "utf8")).toContain(`repo='${join(home, "repo")}'`);
  // An origin without the loop either: refused, nothing booted.
  const bareOrigin = join(base, "origin-bare.git");
  git(base, "clone", "-q", "--bare", loopSeed(false), bareOrigin);
  const bareHome = join(base, "crew-improve-bare");
  mkdirSync(bareHome, { recursive: true });
  git(bareHome, "clone", "-q", bareOrigin, join(bareHome, "repo"));
  const bare = installDeps(bareHome, null);
  expect(await install({}, bare.deps)).toBe(1);
  expect(bare.log.join("\n")).toContain(
    "the clone has no scripts/improve-loop.ts and origin/main has no scripts/improve-loop.ts either",
  );
  expect(bare.log.join("\n")).toContain(
    "the clone has no scripts/improve-loop.ts: push the loop's commit",
  );
  // Since 2026-11-13-005 the agent is booted out first; an install that then fails loads again the one that was loaded.
  expect(bare.seen.filter((c) => c[0] === "launchctl").map((c) => c[1])).toEqual([
    "bootout",
    "bootstrap",
  ]);
  expect(bare.log.join("\n")).toContain("the agent that was loaded is loaded again");
  // The fetch failing is named as such, not as a missing loop.
  git(join(bareHome, "repo"), "remote", "set-url", "origin", join(base, "gone.git"));
  const unreachable = installDeps(bareHome, null);
  expect(await install({}, unreachable.deps)).toBe(1);
  expect(unreachable.log.join("\n")).toContain(
    "the clone has no scripts/improve-loop.ts and origin could not be fetched: ",
  );
});

test("2026-10-25-010 AC-4: status reports the agent's stderr written after the last tick and nothing older; a paused tick records its time", async () => {
  const base = tempDir("status-");
  const home = join(base, "crew-improve");
  mkdirSync(join(home, "log"), { recursive: true });
  const errLog = join(home, "log", "tick.err.log");
  const line =
    'error: Module not found "/h/.wizardingcode/crew-improve/repo/scripts/improve-loop.ts"';
  writeFileSync(errLog, `${line}\n${line}\n`);
  // A last tick that recorded no size (a state from before finding 171): every line is after it.
  writeFileSync(join(home, "state.json"), JSON.stringify({ lastTick: "2026-10-25T19:00:00.000Z" }));
  expect(statusText(installDeps(home, null).deps)).toContain(
    `agent stderr: 2 line(s) after the last tick (log/tick.err.log); last: ${line}`,
  );
  // Nothing written since the tick ended (its recorded size is the file's): nothing to report.
  writeFileSync(
    join(home, "state.json"),
    JSON.stringify({ lastTick: "2026-10-25T19:00:00.000Z", stderrBytes: statSync(errLog).size }),
  );
  expect(statusText(installDeps(home, null).deps)).not.toContain("agent stderr");
  // No tick yet: whatever the log holds is reported.
  writeFileSync(join(home, "state.json"), "{}");
  expect(statusText(installDeps(home, null).deps)).toContain(
    "agent stderr: 2 line(s) with no tick yet (log/tick.err.log)",
  );
  // A paused tick is a tick: its time is recorded.
  const world = loopWorld();
  writeFileSync(join(world.home, "config.json"), JSON.stringify({ paused: true }));
  const paused = tickDeps(world);
  expect(await tick({}, paused.deps)).toBe(0);
  expect(paused.seen.log.join("\n")).toContain("paused by config.json; nothing run");
  expect(JSON.parse(readFileSync(join(world.home, "state.json"), "utf8")).lastTick).toBe(
    "2026-10-25T20:00:00.000Z",
  );
});

test("2026-10-25-010 AC-7: the status's stderr line is redacted, stripped of control characters and cut at 200 characters, in that order", () => {
  const base = tempDir("status-redact-");
  const home = join(base, "crew-improve");
  mkdirSync(join(home, "log"), { recursive: true });
  writeFileSync(join(home, "state.json"), "{}");
  const errLog = join(home, "log", "tick.err.log");
  // The URL's userinfo straddles the cut: redacted first, it never shows.
  const long = `${"x".repeat(185)} https://u:tok@host/path`;
  writeFileSync(errLog, `fatal: https://u:tok@host/repo \x1b[31mred\x1b[0m\n${long}\n`);
  const text = statusText(installDeps(home, null).deps);
  expect(text).toContain(`last: ${"x".repeat(185)} https://[redac\n`);
  expect(text).not.toContain("tok");
  writeFileSync(errLog, "fatal: https://u:tok@host/repo \x1b[31mred\x1b[0m\n");
  const short = statusText(installDeps(home, null).deps);
  expect(short).toContain("last: fatal: https://[redacted]@host/repo [31mred[0m");
  expect(short).not.toContain("\x1b");
});

test("2026-10-25-011 AC-1: status counts the agent's stderr from the size the tick recorded at its end: a tick's own lines are not reported, later ones are, a rotated log is read from its start", async () => {
  const world = loopWorld();
  mkdirSync(join(world.home, "log"), { recursive: true });
  const errLog = join(world.home, "log", "tick.err.log");
  // What the kit prints to stderr during a tick, before the tick ends.
  writeFileSync(
    errLog,
    "Note: --scaffold runs each case's scaffold_script as you.\nNote: a second line\n",
  );
  writeFileSync(join(world.home, "config.json"), JSON.stringify({ paused: true }));
  expect(await tick({}, tickDeps(world).deps)).toBe(0);
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(state.stderrBytes).toBe(statSync(errLog).size);
  const status = () => statusText(installDeps(world.home, null).deps);
  expect(status()).not.toContain("agent stderr");
  // A launch that never reached the loop, after the tick: counted exactly.
  const failed =
    'error: Module not found "/h/.wizardingcode/crew-improve/repo/scripts/improve-loop.ts"';
  appendFileSync(errLog, `${failed}\n${failed}\n${failed}\n`);
  expect(status()).toContain(
    `agent stderr: 3 line(s) after the last tick (log/tick.err.log); last: ${failed}`,
  );
  // The log rotated (shorter than the recorded size): read from its start.
  writeFileSync(errLog, `${failed}\n`);
  expect(status()).toContain("agent stderr: 1 line(s) after the last tick (log/tick.err.log)");
});

/** The record a tick that died after its commit leaves unpushed, committed on the clone's main. */
function leaveRecordUnpushed(repo: string, run: string): void {
  const left = join(repo, "docs/improve", run);
  mkdirSync(left, { recursive: true });
  writeFileSync(
    join(left, "record.json"),
    `${JSON.stringify({ run, at: "2026-10-25T23:30:00.000Z", targets: [], baseline: {}, proposals: [], composition: null, kept: null, branch: null, provider: null, costUsd: 0, exit: 0 })}\n`,
  );
  git(repo, "add", "-A", "docs/improve");
  git(repo, "commit", "-q", "-m", `Improvement run ${run}: nothing kept`);
}

test("2026-10-26-001 AC-5: main moved during the run inside docs/ alone: the records are rebased and pushed, the adoption proceeds on the new main, no back-off", async () => {
  const world = loopWorld();
  const raced = tickDeps(world, {
    kept: true,
    raceTouching: "docs/notes.md",
    raceAfterAdoption: "docs/notes-2.md",
  });
  expect(await tick({}, raced.deps)).toBe(0);
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(state.failures).toBe(0);
  expect(state.backoffUntil).toBeNull();
  const log = raced.seen.log.join("\n");
  expect(log).toMatch(
    /main moved during the run \([0-9a-f]{7}\.\.[0-9a-f]{7}\) in docs\/ alone: adopting on the new main/,
  );
  expect(raced.seen.judge).toBe(1);
  expect(raced.seen.release).toHaveLength(1);
  // Origin's main: the race commit, then the record on top of it.
  const subjects = git(world.origin, "log", "--format=%s", "main").split("\n");
  const record = subjects.findIndex((s) => s.startsWith("Improvement run 2026-10-25-1:"));
  expect(record).toBeGreaterThanOrEqual(0);
  expect(record).toBeLessThan(subjects.indexOf("race: docs/notes.md"));
  expect(existsSync(join(world.home, "repo/docs/notes.md"))).toBe(true);
  // The report's push after the adoption met a main that moved again: rebased onto it too.
  const report = subjects.indexOf("Improvement run 2026-10-25-1: the day's report");
  expect(report).toBeGreaterThanOrEqual(0);
  expect(report).toBeLessThan(subjects.indexOf("race after the adoption: docs/notes-2.md"));
  expect(existsSync(join(world.home, "repo/docs/notes-2.md"))).toBe(true);
});

test("2026-10-26-001 AC-5: main moved during the run beyond docs/: the records land, nothing is adopted, the branch is on origin, the next tick starts from the new main", async () => {
  const world = loopWorld();
  const raced = tickDeps(world, { kept: true, raceTouching: "scripts/x.ts" });
  expect(await tick({}, raced.deps)).toBe(0);
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(state.failures).toBe(0);
  expect(state.backoffUntil).toBeNull();
  const waiting =
    "beyond docs/ (scripts/x.ts): nothing adopted on the tree that was not measured; the next tick starts from the new main (branch improve/2026-10-25-1 kept)";
  expect(raced.seen.log.join("\n")).toContain(waiting);
  expect(raced.seen.judge).toBe(0);
  expect(raced.seen.release).toEqual([]);
  const notice = (raced.seen.sh.find((c) => c[0] === "osascript") as string[]).join(" ");
  expect(notice).toContain("main moved during the run");
  expect(notice).toContain(waiting);
  const subjects = git(world.origin, "log", "--format=%s", "main");
  expect(subjects).toContain("race: scripts/x.ts");
  expect(subjects).toContain("Improvement run 2026-10-25-1:");
  expect(git(world.origin, "branch", "--list", "improve/2026-10-25-1")).toContain(
    "improve/2026-10-25-1",
  );
});

test("2026-10-26-001 AC-7: a race on the day's report makes the records' rebase fail: aborted, the tick backs off naming the rebase, the clone stays on main; the next tick drops them naming the rebase too", async () => {
  const world = loopWorld();
  const raced = tickDeps(world, { raceTouching: "docs/improve/daily/2026-10-25.md" });
  expect(await tick({}, raced.deps)).toBe(1);
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(state.failures).toBe(1);
  expect(state.backoffUntil).toBe("2026-10-25T21:00:00.000Z");
  // The message carries git's own line.
  expect(raced.seen.log.join("\n")).toMatch(
    /the tick failed: the records could not be rebased onto origin\/main: error: could not apply [0-9a-f]+/,
  );
  expect((raced.seen.sh.find((c) => c[0] === "osascript") as string[]).join(" ")).toContain(
    "the tick failed: the records could not be rebased onto origin/main: error: could not apply",
  );
  const repo = join(world.home, "repo");
  expect(git(repo, "symbolic-ref", "--short", "HEAD").trim()).toBe("main");
  expect(existsSync(join(repo, ".git/rebase-merge"))).toBe(false);
  expect(existsSync(join(repo, ".git/rebase-apply"))).toBe(false);
  const lost = git(repo, "rev-parse", "HEAD").trim();
  // The next tick's recovery meets the same conflict: dropped, the rebase named (AC-2); the
  // cases are unmeasured again, so the tick runs anew on the moved main.
  const later = tickDeps(world, { now: "2026-10-25T22:00:00.000Z" });
  expect(await tick({}, later.deps)).toBe(0);
  expect(later.seen.log.join("\n")).toContain(
    "an earlier run's commits could not be rebased onto origin/main and are dropped: ",
  );
  expect(git(world.origin, "log", "--format=%H", "main")).not.toContain(lost);
  expect(later.seen.improve).toHaveLength(1);
});

test("2026-10-26-001 AC-6: records left unpushed behind an origin that moved on the harness are rebased and pushed; a local commit touching scripts/ is dropped", async () => {
  const world = loopWorld();
  expect(await tick({}, tickDeps(world).deps)).toBe(0);
  const repo = join(world.home, "repo");
  leaveRecordUnpushed(repo, "2026-10-25-9");
  git(world.user, "pull", "-q", "--rebase", "origin", "main");
  writeFileSync(
    join(world.user, "plugins/core/skills/crew/SKILL.md"),
    "# Crew\n\nMoved by a person.\n",
  );
  git(world.user, "commit", "-q", "-am", "a person's push");
  git(world.user, "push", "-q", "origin", "main");
  const recovered = tickDeps(world, { now: "2026-10-26T01:00:00.000Z" });
  expect(await tick({}, recovered.deps)).toBe(0);
  expect(recovered.seen.log.join("\n")).toContain("an earlier run's commits pushed");
  const subjects = git(world.origin, "log", "--format=%s", "main").split("\n");
  expect(subjects.indexOf("Improvement run 2026-10-25-9: nothing kept")).toBeGreaterThanOrEqual(0);
  expect(subjects.indexOf("Improvement run 2026-10-25-9: nothing kept")).toBeLessThan(
    subjects.indexOf("a person's push"),
  );
  // A local commit touching scripts/ is beyond the records: dropped, never on origin.
  writeFileSync(join(repo, "scripts/x.ts"), "export {};\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "not a record");
  const cleaned = tickDeps(world, { now: "2026-10-26T02:00:00.000Z" });
  expect(await tick({}, cleaned.deps)).toBe(0);
  expect(cleaned.seen.log.join("\n")).toContain(
    "local commits beyond the records dropped (scripts/x.ts)",
  );
  expect(git(world.origin, "log", "--format=%s", "main")).not.toContain("not a record");
});

test("2026-10-26-001 AC-2: the recovery drops records only when the rebase or the push fails, naming which", async () => {
  const world = loopWorld();
  expect(await tick({}, tickDeps(world).deps)).toBe(0);
  const repo = join(world.home, "repo");
  // A conflict: the record left unpushed writes the day's report, and origin moved on the same file.
  leaveRecordUnpushed(repo, "2026-10-25-9");
  writeFileSync(join(repo, "docs/improve/daily/2026-10-26.md"), "# the loop's report\n");
  git(repo, "add", "-A", "docs/improve");
  git(repo, "commit", "-q", "-m", "Improvement run 2026-10-25-9: the day's report");
  git(world.user, "pull", "-q", "--rebase", "origin", "main");
  mkdirSync(join(world.user, "docs/improve/daily"), { recursive: true });
  writeFileSync(join(world.user, "docs/improve/daily/2026-10-26.md"), "# a person's report\n");
  git(world.user, "add", "-A");
  git(world.user, "commit", "-q", "-m", "a person's report");
  git(world.user, "push", "-q", "origin", "main");
  const conflicted = tickDeps(world, { now: "2026-10-26T01:00:00.000Z" });
  expect(await tick({}, conflicted.deps)).toBe(0);
  expect(conflicted.seen.log.join("\n")).toContain(
    "an earlier run's commits could not be rebased onto origin/main and are dropped: ",
  );
  expect(git(world.origin, "log", "--format=%s", "main")).not.toContain("2026-10-25-9");
  expect(git(repo, "symbolic-ref", "--short", "HEAD").trim()).toBe("main");
  // A refused push: dropped, the refusal named.
  leaveRecordUnpushed(repo, "2026-10-26-8");
  const refused = tickDeps(world, { now: "2026-10-26T02:00:00.000Z", refusePush: true });
  expect(await tick({}, refused.deps)).toBe(0);
  expect(refused.seen.log.join("\n")).toContain(
    "an earlier run's commits could not be pushed and are dropped: ! [remote rejected] main (refused)",
  );
});

test("2026-10-26-001 AC-9: a refused push fails the tick naming the records' push, backs off as before, and on a moved origin leaves the records rebased for the next tick's recovery", async () => {
  const world = loopWorld();
  const refused = tickDeps(world, { raceTouching: "docs/notes.md", refusePush: true });
  expect(await tick({}, refused.deps)).toBe(1);
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(state.failures).toBe(1);
  expect(state.backoffUntil).toBe("2026-10-25T21:00:00.000Z");
  expect(refused.seen.log.join("\n")).toContain(
    "the tick failed: the records' push was refused: ! [remote rejected] main (refused); the next tick pushes them again; the next tick waits 1 h",
  );
  const repo = join(world.home, "repo");
  // The rebase came before the refused push: the records sit on top of the moved origin/main.
  expect(() => git(repo, "merge-base", "--is-ancestor", "origin/main", "HEAD")).not.toThrow();
  // The next tick's recovery pushes them as they are.
  const later = tickDeps(world, { now: "2026-10-25T22:00:00.000Z" });
  expect(await tick({}, later.deps)).toBe(0);
  expect(later.seen.log.join("\n")).toContain("an earlier run's commits pushed");
  const subjects = git(world.origin, "log", "--format=%s", "main").split("\n");
  const record = subjects.findIndex((s) => s.startsWith("Improvement run 2026-10-25-1:"));
  expect(record).toBeGreaterThanOrEqual(0);
  expect(record).toBeLessThan(subjects.indexOf("race: docs/notes.md"));
});

test("2026-10-25-005 AC-8 (the probe): the first tick records what the agent reaches, never a secret's value", () => {
  const sh: TickDeps["sh"] = (cmd) => {
    const line = cmd.join(" ");
    if (line === "claude auth status")
      return {
        status: 0,
        stdout: JSON.stringify({ loggedIn: true, authMethod: "claude.ai" }),
        stderr: "",
      };
    if (line === "gh auth status")
      return {
        status: 0,
        stdout: "",
        stderr: "github.com\n  ✓ Logged in to github.com account andreagroferreira (keyring)\n",
      };
    if (cmd[0] === "security")
      return { status: cmd.includes("or-token") ? 0 : 44, stdout: "", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  const gitStub: TickDeps["git"] = (args) => ({
    status: 0,
    stdout: args[0] === "ls-remote" ? "abc\tHEAD\n" : "",
    stderr: "",
  });
  const probe = runProbe(
    {
      provider: {
        name: "openrouter",
        baseUrl: "https://x",
        authToken: { keychain: "or-token" },
        models,
      },
      oauthToken: { keychain: "oauth-token" },
      casesPerRun: 2,
      staleDays: 7,
      proposals: 2,
      marketplace: { account: "a" },
    },
    "/repo",
    sh,
    gitStub,
  );
  expect(probe).toEqual({
    loggedIn: true,
    authMethod: "claude.ai",
    github: "andreagroferreira",
    remote: "ok",
    push: "ok",
    keychain: { "or-token": "found", "oauth-token": "missing" },
    releaseToken: "missing",
  });
});

const storedLessons = (home: string): number =>
  JSON.parse(readFileSync(join(home, "state.json"), "utf8")).lastRun.lessons;

test("2026-10-26-003 AC-1: a run's own lesson never makes the next tick due: the record lists it, the base holds it, the count stored is the base's, and the next tick with the same facts is not due and runs nothing", async () => {
  const world = loopWorld();
  // A base that already holds lessons, as a real loop's does: a count stored without the start's would be 1.
  world.lessons.held = 3;
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  expect(world.lessons.held).toBe(4);
  expect(storedLessons(world.home)).toBe(4);
  const second = tickDeps(world, { now: "2026-10-25T21:00:00.000Z" });
  expect(await tick({}, second.deps)).toBe(0);
  expect(second.seen.improve).toEqual([]);
  expect(second.seen.log.join("\n")).toContain(
    "not due: nothing new since the last run and no case older than 7 days",
  );
});

test("2026-10-26-003 AC-2: a lesson added from outside while the run was going still counts: the record lists one, the base gained two, the count stored is one, and the next tick is due for the growth of one", async () => {
  const world = loopWorld();
  const first = tickDeps(world, { lessons: { listed: ["K-1"], gained: 2 } });
  expect(await tick({}, first.deps)).toBe(0);
  expect(world.lessons.held).toBe(2);
  expect(storedLessons(world.home)).toBe(1);
  const second = tickDeps(world, { now: "2026-10-25T21:00:00.000Z" });
  expect(await tick({}, second.deps)).toBe(0);
  expect(second.seen.log.join("\n")).toContain("due: the harness lessons grew (1 to 2)");
  expect(second.seen.improve).toHaveLength(1);
});

test("2026-10-26-003 AC-3: the stored count never exceeds what the base holds: a record listing a lesson the base does not hold leaves the base's count, the next tick is not due, and a lesson from outside after the run makes it due", async () => {
  const world = loopWorld();
  const first = tickDeps(world, { lessons: { listed: ["K-1", "K-2"], gained: 1 } });
  expect(await tick({}, first.deps)).toBe(0);
  expect(world.lessons.held).toBe(1);
  expect(storedLessons(world.home)).toBe(1);
  const second = tickDeps(world, { now: "2026-10-25T21:00:00.000Z" });
  expect(await tick({}, second.deps)).toBe(0);
  expect(second.seen.improve).toEqual([]);
  expect(second.seen.log.join("\n")).toContain("not due: nothing new since the last run");
  world.lessons.held += 1;
  const third = tickDeps(world, { now: "2026-10-25T22:00:00.000Z" });
  expect(await tick({}, third.deps)).toBe(0);
  expect(third.seen.log.join("\n")).toContain("due: the harness lessons grew (1 to 2)");
});

test("2026-10-26-003 AC-5: a record without a lessons list, or with one that is not an array, leaves the tick at 0 with the base's count stored and discounts nothing; a padded list discounts its distinct string ids only", async () => {
  for (const listed of [undefined, "K-1", {}, null]) {
    // The base unchanged: the count stored is the base's, and the tick ended clean.
    const still = loopWorld();
    const run = tickDeps(still, { lessons: { listed, gained: 0 } });
    expect(await tick({}, run.deps)).toBe(0);
    expect(storedLessons(still.home)).toBe(0);
    expect(existsSync(join(still.home, "lock.json"))).toBe(false);
    // The base grown by two during the run: nothing listed is discounted, so the count stored stays at the
    // start's and the next tick is due for both (a string's length would store 2 and hide them).
    const grown = loopWorld();
    const first = tickDeps(grown, { lessons: { listed, gained: 2 } });
    expect(await tick({}, first.deps)).toBe(0);
    expect(storedLessons(grown.home)).toBe(0);
    const next = tickDeps(grown, { now: "2026-10-25T21:00:00.000Z" });
    expect(await tick({}, next.deps)).toBe(0);
    expect(next.seen.log.join("\n")).toContain("due: the harness lessons grew (0 to 2)");
  }
  const world = loopWorld();
  const padded = tickDeps(world, { lessons: { listed: ["K-1", "K-1", 7], gained: 2 } });
  expect(await tick({}, padded.deps)).toBe(0);
  expect(storedLessons(world.home)).toBe(1);
  const next = tickDeps(world, { now: "2026-10-25T21:00:00.000Z" });
  expect(await tick({}, next.deps)).toBe(0);
  expect(next.seen.log.join("\n")).toContain("due: the harness lessons grew (1 to 2)");
  // Nine worlds with real git: past bun's default 5 s when the file runs alone, as the project's long tests.
}, 30_000);

test("2026-10-26-005 AC-3: the tick removes the improvement runs' result folders older than 14 days from the clone's results directory and keeps a young one and an old one of another name", async () => {
  const world = loopWorld();
  expect(await tick({}, tickDeps(world).deps)).toBe(0);
  const results = join(world.home, "repo", "plugins", "core", "evals", "results");
  const old = join(results, "2026-09-01T00-00-00-000Z-improve-t");
  const young = join(results, "2026-10-25T00-00-00-000Z-improve-t");
  const other = join(results, "2026-09-01T00-00-00-000Z-suite");
  for (const folder of [old, young, other]) mkdirSync(folder, { recursive: true });
  utimesSync(old, 1, 1);
  utimesSync(other, 1, 1);
  // Thirteen days before the tick's clock: inside the bound, so the age check is what keeps it.
  const thirteenDaysBefore = Date.parse("2026-10-25T21:00:00.000Z") / 1000 - 13 * 86400;
  utimesSync(young, thirteenDaysBefore, thirteenDaysBefore);
  const second = tickDeps(world, { now: "2026-10-25T21:00:00.000Z" });
  expect(await tick({}, second.deps)).toBe(0);
  expect(second.seen.improve).toEqual([]);
  expect(existsSync(old)).toBe(false);
  expect(existsSync(young)).toBe(true);
  expect(existsSync(other)).toBe(true);
});

// 2026-10-27-006 (the loop keeps nothing and spends without a ceiling): the two ceilings.
test("2026-10-27-006 AC-2, AC-6: readConfig fills maxRunUsd 20 and maxDayUsd 60 for a config without the keys; ceilingOf reads 0 and a positive number as given, and a value that is not a finite number at or above 0 as the default with a note naming the key, the value and the default", () => {
  const home = tempDir();
  expect(readConfig(home).maxRunUsd).toBe(20);
  expect(readConfig(home).maxDayUsd).toBe(60);
  writeFileSync(join(home, "config.json"), JSON.stringify({ maxRunUsd: 0, maxDayUsd: 25 }));
  expect(readConfig(home).maxRunUsd).toBe(0);
  expect(readConfig(home).maxDayUsd).toBe(25);
  expect(ceilingOf({ maxDayUsd: 25 }, "maxDayUsd", 60)).toEqual({ value: 25, note: null });
  expect(ceilingOf({ maxDayUsd: 0 }, "maxDayUsd", 60)).toEqual({ value: 0, note: null });
  expect(ceilingOf({}, "maxDayUsd", 60)).toEqual({ value: 60, note: null });
  expect(ceilingOf({ maxDayUsd: "abc" as unknown as number }, "maxDayUsd", 60)).toEqual({
    value: 60,
    note: 'config: maxDayUsd "abc" is not a number at or above 0; the default 60 applies',
  });
  expect(ceilingOf({ maxRunUsd: -5 }, "maxRunUsd", 20)).toEqual({
    value: 20,
    note: "config: maxRunUsd -5 is not a number at or above 0; the default 20 applies",
  });
  expect(ceilingOf({ maxRunUsd: Number.NaN }, "maxRunUsd", 20).value).toBe(20);
  // The day's cost: finite costs at or above 0 summed, null and malformed ones counted as unpriced.
  const run = (costUsd: unknown) => ({
    run: "r",
    targets: [],
    verdict: "nothing kept",
    provider: { name: "runtime", claudeModels: true },
    costUsd: costUsd as number | null,
  });
  expect(dayCostOf([run(1.5), run(null), run("x"), run(Number.NaN), run(-1), run(2)])).toEqual({
    priced: 3.5,
    pricedRuns: 2,
    unpriced: 4,
  });
  expect(dayCostOf([])).toEqual({ priced: 0, pricedRuns: 0, unpriced: 0 });
});

test("2026-10-27-006 AC-2, AC-5, AC-6: the tick passes the run ceiling to the run (undefined for 0); a due tick with the day's priced cost at or above maxDayUsd runs nothing: the first skip of the day writes the report's Skipped ticks section, commits and pushes it, notifies once and saves state.day.budgetSkip; a later skip of the day only logs; no record folder and no lastRun; the skip's line counts the unpriced records", async () => {
  const world = loopWorld();
  // The default ceiling reaches the run; 0 reaches it as none; 7 as 7.
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  expect(first.seen.ceilings).toEqual([20]);
  const stateAfterRun = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(stateAfterRun.lastRun.run).toBe("2026-10-25-1");
  // Two records of the day the ceiling cannot price: a provider with no list price, a malformed cost.
  for (const [n, extra] of [
    [8, { provider: { name: "local", claudeModels: false }, costUsd: 9 }],
    [9, { provider: { name: "runtime", claudeModels: true }, costUsd: "x" }],
  ] as const) {
    const folder = join(world.user, "docs/improve", `2026-10-25-${n}`);
    mkdirSync(folder, { recursive: true });
    writeFileSync(
      join(folder, "record.json"),
      `${JSON.stringify({ run: `2026-10-25-${n}`, at: "2026-10-25T19:00:00.000Z", targets: ["t"], baseline: {}, proposals: [], composition: null, kept: null, branch: null, exit: 0, ...extra })}\n`,
    );
  }
  writeFileSync(join(world.user, "plugins/core/skills/crew/SKILL.md"), "# Crew\n\nRule 2.\n");
  git(world.user, "add", "-A");
  git(world.user, "commit", "-q", "-m", "rule 2 and two records");
  git(world.user, "push", "-q", "origin", "main");
  writeFileSync(join(world.home, "config.json"), JSON.stringify({ maxRunUsd: 0, maxDayUsd: 1 }));
  // Due (the plugin's text changed), the day's priced cost 1.50 at or above 1.00: the first skip.
  const second = tickDeps(world, { now: "2026-10-25T21:00:00.000Z" });
  expect(await tick({}, second.deps)).toBe(0);
  expect(second.seen.improve).toEqual([]);
  expect(second.seen.ceilings).toEqual([]);
  const skipLine =
    "skipped: the day's budget of 1.00 USD is spent (1.50 USD over 1 priced run(s); 2 unpriced)";
  expect(second.seen.log.join("\n")).toContain(
    `${skipLine}; every later tick of the day skips the same way`,
  );
  expect(originHead(world.origin)).toBe("Improvement tick 2026-10-25: the day's budget is spent");
  const report = git(world.origin, "show", "main:docs/improve/daily/2026-10-25.md");
  expect(report).toContain("## Skipped ticks");
  expect(report).toContain(
    "- 21:00 UTC: the day's budget of 1.00 USD is spent (1.50 USD over 1 priced run(s); 2 unpriced); every later tick of the day skips the same way until the budget or the day changes",
  );
  expect(report).toContain("| 2026-10-25-1 |");
  const notices = second.seen.sh.filter((c) => c[0] === "osascript");
  expect(notices).toHaveLength(1);
  expect(notices[0]?.join(" ")).toContain(
    `${skipLine}. Every later tick of the day skips the same way.`,
  );
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(state.day.budgetSkip).toEqual({
    at: "2026-10-25T21:00:00.000Z",
    costUsd: 1.5,
    reason: "the day's budget of 1.00 USD is spent (1.50 USD over 1 priced run(s); 2 unpriced)",
  });
  expect(state.lastRun.run).toBe("2026-10-25-1");
  // The report prices only what it can: the malformed cost is n/a, the total counts the priced run.
  expect(report).toContain("| 2026-10-25-9 | t | nothing kept | runtime | n/a |");
  expect(report).toContain("| 2026-10-25-8 | t | nothing kept | local (not Claude models) | n/a |");
  expect(report).toContain("- runtime: 1.50 USD");
  expect(
    readdirSync(join(world.home, "repo/docs/improve"))
      .filter((n) => n.startsWith("2026-10-25-"))
      .sort(),
  ).toEqual(["2026-10-25-1", "2026-10-25-8", "2026-10-25-9"]);
  // A later skip of the same day: the log alone, nothing committed, no second notice.
  const third = tickDeps(world, { now: "2026-10-25T22:00:00.000Z" });
  expect(await tick({}, third.deps)).toBe(0);
  expect(third.seen.improve).toEqual([]);
  expect(third.seen.log.join("\n")).toContain(`${skipLine}; reported at 21:00 UTC`);
  expect(third.seen.sh.filter((c) => c[0] === "osascript")).toEqual([]);
  expect(originHead(world.origin)).toBe("Improvement tick 2026-10-25: the day's budget is spent");
  // A run ceiling of 0 reaches the run as none, 7 as 7, once the day ceiling is off.
  writeFileSync(join(world.home, "config.json"), JSON.stringify({ maxRunUsd: 0, maxDayUsd: 0 }));
  const fourth = tickDeps(world, { now: "2026-10-25T23:00:00.000Z" });
  expect(await tick({}, fourth.deps)).toBe(0);
  expect(fourth.seen.ceilings).toEqual([undefined]);
  const rewritten = git(world.origin, "show", "main:docs/improve/daily/2026-10-25.md");
  // The run's folder is the day's next free number: three folders exist (1, 8, 9), so the run is -4.
  expect(rewritten).toContain("| 2026-10-25-4 |");
  expect(rewritten).toContain(
    "- 21:00 UTC: the day's budget of 1.00 USD is spent (1.50 USD over 1 priced run(s); 2 unpriced); every later tick of the day skips the same way until the budget or the day changes",
  );
  writeFileSync(join(world.home, "config.json"), JSON.stringify({ maxRunUsd: 7, maxDayUsd: 0 }));
  git(world.user, "pull", "-q", "--rebase", "origin", "main");
  writeFileSync(join(world.user, "plugins/core/agents/judge.md"), "# Judge\n\nMore.\n");
  git(world.user, "commit", "-q", "-am", "judge");
  git(world.user, "push", "-q", "origin", "main");
  const fifth = tickDeps(world, { now: "2026-10-25T23:30:00.000Z" });
  expect(await tick({}, fifth.deps)).toBe(0);
  expect(fifth.seen.ceilings).toEqual([7]);
});

test("2026-10-27-006 AC-6, AC-7: a config value the tick cannot trust, for either key, is read as the default and said through the tick's log, redacted like every line the tick writes: a provider's token written as maxDayUsd reaches no log line and no log file (the skip's notice itself carries numbers alone and goes through the same notify, as the AC-5 row shows)", async () => {
  const world = loopWorld();
  writeFileSync(
    join(world.home, "config.json"),
    JSON.stringify({
      provider: {
        name: "openrouter",
        baseUrl: "https://gateway.example/api",
        authToken: { keychain: "or-token" },
        models,
      },
      maxDayUsd: "sk-or-SECRET",
      maxRunUsd: -1,
    }),
  );
  const leaky = tickDeps(world, { secret: "sk-or-SECRET" });
  expect(await tick({}, leaky.deps)).toBe(0);
  const log = leaky.seen.log.join("\n");
  expect(log).toContain(
    'config: maxDayUsd "[redacted]" is not a number at or above 0; the default 60 applies',
  );
  expect(log).toContain(
    "config: maxRunUsd -1 is not a number at or above 0; the default 20 applies",
  );
  expect(log).not.toContain("sk-or-SECRET");
  expect(readFileSync(join(world.home, "log/2026-10-25.log"), "utf8")).not.toContain(
    "sk-or-SECRET",
  );
  // The run went ahead under the default day ceiling of 60 with the default run ceiling.
  expect(leaky.seen.ceilings).toEqual([20]);
});

// Round 1 of the judgement (test-quality F-1, a defect; F-2): the skip's place in the tick and the equal case.
test("2026-10-27-006 AC-5: the day ceiling is read after the due decision and the dry run: a not-due tick with a spent day logs not due, a dry run logs the dry run, and neither commits a skip or notifies; the same facts on a plain tick skip; a day's cost equal to the ceiling is spent", async () => {
  const world = loopWorld();
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  const spent = () => git(world.origin, "log", "-1", "--format=%s").trim();
  expect(spent()).toBe("Improvement run 2026-10-25-1: nothing kept");
  // 1.50 USD on record, the ceiling 1.50: at or above. Nothing new: not due, so no skip.
  writeFileSync(join(world.home, "config.json"), JSON.stringify({ maxDayUsd: 1.5 }));
  const notDue = tickDeps(world, { now: "2026-10-25T21:00:00.000Z" });
  expect(await tick({}, notDue.deps)).toBe(0);
  expect(notDue.seen.log.join("\n")).toContain("not due: nothing new since the last run");
  expect(notDue.seen.log.join("\n")).not.toContain("skipped:");
  expect(notDue.seen.sh.filter((c) => c[0] === "osascript")).toEqual([]);
  expect(spent()).toBe("Improvement run 2026-10-25-1: nothing kept");
  // Due by new plugin text, as a dry run: the decision and the targets, no skip.
  writeFileSync(join(world.user, "plugins/core/skills/crew/SKILL.md"), "# Crew\n\nRule 2.\n");
  git(world.user, "commit", "-q", "-am", "rule 2");
  git(world.user, "push", "-q", "origin", "main");
  const dry = tickDeps(world, { now: "2026-10-25T22:00:00.000Z" });
  expect(await tick({ dryRun: true }, dry.deps)).toBe(0);
  expect(dry.seen.log.join("\n")).toContain(
    "dry run: due (the plugin's text changed on origin/main",
  );
  expect(dry.seen.log.join("\n")).not.toContain("skipped:");
  expect(dry.seen.sh.filter((c) => c[0] === "osascript")).toEqual([]);
  expect(spent()).toBe("rule 2");
  expect(
    JSON.parse(readFileSync(join(world.home, "state.json"), "utf8")).day.budgetSkip,
  ).toBeUndefined();
  // The same facts on a plain tick: the skip, at the equal case.
  const plain = tickDeps(world, { now: "2026-10-25T23:00:00.000Z" });
  expect(await tick({}, plain.deps)).toBe(0);
  expect(plain.seen.improve).toEqual([]);
  expect(plain.seen.log.join("\n")).toContain(
    "skipped: the day's budget of 1.50 USD is spent (1.50 USD over 1 priced run(s); 0 unpriced); every later tick of the day skips the same way",
  );
  expect(spent()).toBe("Improvement tick 2026-10-25: the day's budget is spent");
  expect(plain.seen.sh.filter((c) => c[0] === "osascript")).toHaveLength(1);
});

// 2026-10-27-008 AC-1 (finding 184): the three advisories of 2026-10-27-006's round 2, pinned.
test("2026-10-27-008 AC-1: the loop calls writeDayReport by name, budgetReason's comment says what it is for, and the totals name the unpriced provider's rule", () => {
  const src = readFileSync(join(import.meta.dir, "../../../scripts/improve-loop.ts"), "utf8");
  expect(src).not.toContain("const report = writeDayReport");
  expect(src.match(/writeDayReport\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  const at = src.indexOf("export function budgetReason(");
  expect(at).toBeGreaterThan(0);
  const comment = src.slice(src.lastIndexOf("/**", at), at);
  expect(comment).toContain("The reason a day's budget skip gives");
  expect(comment).not.toMatch(/\bF-\d+\b|\bround \d+\b/);
  expect(src).toContain("providerUnpriced(run) || before === null");
  expect(src).not.toContain("run.costUsd === null || before === null");
});

// 2026-10-27-008 AC-1 (finding 184): the rule itself, and the daily report's total through it.
test("2026-10-27-008 AC-1: providerUnpriced is true of a run whose cost is null and of nothing else, and the daily report totals such a provider as n/a through it", () => {
  expect(providerUnpriced({ costUsd: null })).toBe(true);
  expect(providerUnpriced({ costUsd: 0 })).toBe(false);
  expect(providerUnpriced({ costUsd: 2.5 })).toBe(false);
  const run = (provider: string, costUsd: number | null) => ({
    run: `2026-10-28-${provider}`,
    targets: ["t"],
    verdict: "nothing kept",
    provider: { name: provider, claudeModels: provider === "runtime" },
    costUsd,
  });
  const report = dailyReport(
    "2026-10-28",
    [run("runtime", 1.25), run("ollama", null), run("runtime", 0.75)],
    [],
    [],
  );
  expect(report).toContain("- runtime: 2.00 USD");
  expect(report).toContain("- ollama: n/a (no list price for its models)");
});

// 2026-10-28-001 (the loop's own frictions). The stop deps of a test: the lock read from the world's
// home, `ps` answered by the stub, the kill seen, the wait ending the tick when asked.
function stopDeps(
  world: ReturnType<typeof loopWorld>,
  options: {
    alive?: boolean;
    boot?: string;
    /** What `ps -o command=` answers for the pid; the tick's own line when not given. */
    command?: string;
    /** What `ps -o pgid=` answers; the pid itself when not given. */
    pgid?: string;
    /** Whether the tick removes its lock while the stop waits (true when not given). */
    ends?: boolean;
    /** What the release's `leftCommand` answers on each call, in order, null once they run out (2026-11-13-004). */
    leftCommands?: (number | null)[];
    /** What the home's file answers for the tick's own command (2026-11-13-005 AC-49). */
    tickCommand?: number | null;
  } = {},
) {
  const asked: { root: string; startedBy: number }[] = [];
  let ownAsked = 0;
  const kills: { pid: number; signal: string }[] = [];
  const ps: string[][] = [];
  let waited = 0;
  const deps = {
    home: world.home,
    boot: () => options.boot ?? "boot-1",
    alive: () => options.alive ?? true,
    sh: (cmd: string[]) => {
      ps.push([...cmd]);
      if (cmd[0] === "ps" && cmd[2] === "pgid=")
        return { status: 0, stdout: `${options.pgid ?? cmd[4]}\n`, stderr: "" };
      if (cmd[0] === "ps" && cmd[2] === "command=")
        return {
          status: 0,
          stdout: `${options.command ?? "/Users/t/.bun/bin/bun /Users/t/.wizardingcode/crew-improve/repo/scripts/improve-loop.ts tick"}\n`,
          stderr: "",
        };
      return { status: 0, stdout: "", stderr: "" };
    },
    kill: (pid: number, signal: "SIGTERM" | "SIGKILL") => {
      kills.push({ pid, signal });
    },
    tickCommand: () => {
      ownAsked += 1;
      return options.tickCommand ?? null;
    },
    leftCommand: (root: string, startedBy: number) => {
      asked.push({ root, startedBy });
      return options.leftCommands?.[asked.length - 1] ?? null;
    },
    wait: async () => {
      waited += 1;
      if (options.ends ?? true) rmSync(join(world.home, "lock.json"), { force: true });
    },
    now: () => new Date("2026-10-28T03:00:00.000Z"),
  };
  return { deps, kills, ps, asked, waited: () => waited, ownAsked: () => ownAsked };
}

test("2026-10-28-001 AC-7: pause and resume write paused into the configuration, keep its other keys and say so; resume removes a stop marker", () => {
  const world = loopWorld();
  mkdirSync(world.home, { recursive: true });
  writeFileSync(
    join(world.home, "config.json"),
    JSON.stringify({ provider: "runtime", casesPerRun: 3 }),
  );
  expect(pauseLoop(world.home)).toBe(
    "paused: no tick runs until bun scripts/improve-loop.ts resume",
  );
  const paused = JSON.parse(readFileSync(join(world.home, "config.json"), "utf8"));
  expect(paused).toEqual({ provider: "runtime", casesPerRun: 3, paused: true });
  expect(statSync(join(world.home, "config.json")).mode & 0o777).toBe(0o600);
  writeFileSync(join(world.home, "stop.json"), JSON.stringify({ at: "x", by: "stop" }));
  expect(resumeLoop(world.home)).toBe("resumed");
  expect(JSON.parse(readFileSync(join(world.home, "config.json"), "utf8"))).toEqual({
    provider: "runtime",
    casesPerRun: 3,
    paused: false,
  });
  expect(existsSync(join(world.home, "stop.json"))).toBe(false);
});

test("2026-10-28-001 AC-7: stop pauses, writes the marker, signals the live tick's own group with SIGTERM and says it ended; the pid alone when the group is not its own; still ending when the wait runs out", async () => {
  const world = loopWorld();
  mkdirSync(world.home, { recursive: true });
  writeFileSync(join(world.home, "config.json"), JSON.stringify({ provider: "runtime" }));
  const lock = { pid: 4242, startedAt: "2026-10-28T02:00:00.000Z", boot: "boot-1" };
  writeFileSync(join(world.home, "lock.json"), JSON.stringify(lock));
  const own = stopDeps(world);
  expect(await stopLoop(own.deps)).toBe(
    "stopped: the tick (pid 4242) ended; the loop is paused (bun scripts/improve-loop.ts resume)",
  );
  expect(own.kills).toEqual([{ pid: -4242, signal: "SIGTERM" }]);
  expect(JSON.parse(readFileSync(join(world.home, "config.json"), "utf8")).paused).toBe(true);
  expect(JSON.parse(readFileSync(join(world.home, "stop.json"), "utf8"))).toEqual({
    at: "2026-10-28T03:00:00.000Z",
    by: "stop",
  });
  // The group is another's: the pid alone.
  writeFileSync(join(world.home, "lock.json"), JSON.stringify(lock));
  const shared = stopDeps(world, { pgid: "100" });
  expect(await stopLoop(shared.deps)).toContain("stopped: the tick (pid 4242) ended");
  expect(shared.kills).toEqual([{ pid: 4242, signal: "SIGTERM" }]);
  // The tick does not end within the wait: said, the loop paused all the same.
  writeFileSync(join(world.home, "lock.json"), JSON.stringify(lock));
  const slow = stopDeps(world, { ends: false });
  expect(await stopLoop(slow.deps)).toBe(
    "stop requested: the tick (pid 4242) is still ending; the loop is paused",
  );
  expect(slow.waited()).toBe(60);
  expect(existsSync(join(world.home, "lock.json"))).toBe(true);
});

test("2026-10-28-001 AC-7: a lock that fails a check signals nothing, stays as it is, and stop says no tick is running: pid 1, 0, a negative number or a string, another boot, a dead pid, a live pid whose command is not the tick's", async () => {
  const world = loopWorld();
  mkdirSync(world.home, { recursive: true });
  writeFileSync(join(world.home, "config.json"), JSON.stringify({ provider: "runtime" }));
  const cases: [string, Record<string, unknown>, Parameters<typeof stopDeps>[1]][] = [
    ["pid 1", { pid: 1, startedAt: "2026-10-28T02:00:00.000Z", boot: "boot-1" }, {}],
    ["pid 0", { pid: 0, startedAt: "2026-10-28T02:00:00.000Z", boot: "boot-1" }, {}],
    ["negative", { pid: -4242, startedAt: "2026-10-28T02:00:00.000Z", boot: "boot-1" }, {}],
    ["string", { pid: "4242", startedAt: "2026-10-28T02:00:00.000Z", boot: "boot-1" }, {}],
    ["no start", { pid: 4242, startedAt: "x", boot: "boot-1" }, {}],
    ["another boot", { pid: 4242, startedAt: "2026-10-28T02:00:00.000Z", boot: "boot-0" }, {}],
    [
      "dead",
      { pid: 4242, startedAt: "2026-10-28T02:00:00.000Z", boot: "boot-1" },
      { alive: false },
    ],
    [
      "not the tick",
      { pid: 4242, startedAt: "2026-10-28T02:00:00.000Z", boot: "boot-1" },
      { command: "node /Users/t/other/server.js" },
    ],
  ];
  for (const [name, lock, options] of cases) {
    const text = JSON.stringify(lock);
    writeFileSync(join(world.home, "lock.json"), text);
    const d = stopDeps(world, options);
    expect(await stopLoop(d.deps), name).toBe("no tick is running; the loop is paused");
    expect(d.kills, name).toEqual([]);
    expect(readFileSync(join(world.home, "lock.json"), "utf8"), name).toBe(text);
    expect(JSON.parse(readFileSync(join(world.home, "config.json"), "utf8")).paused, name).toBe(
      true,
    );
  }
  rmSync(join(world.home, "lock.json"));
  const none = stopDeps(world);
  expect(await stopLoop(none.deps)).toBe("no tick is running; the loop is paused");
  expect(none.kills).toEqual([]);
  // validLock on its own: what the lock must hold.
  expect(validLock({ pid: 4242, startedAt: "2026-10-28T02:00:00.000Z", boot: "b" }, "b")).toEqual({
    pid: 4242,
    startedAt: "2026-10-28T02:00:00.000Z",
    boot: "b",
  });
  expect(validLock({ pid: 4242.5, startedAt: "2026-10-28T02:00:00.000Z", boot: "b" }, "b")).toBe(
    null,
  );
  expect(validLock(null, "b")).toBe(null);
  expect(validLock("x", "b")).toBe(null);
});

test("2026-10-28-001 AC-7: a run the user stopped is recorded as stopped by the user in the commit, the day's report and the notification, with no failure and no back-off; the marker goes, state.stopped stays; the tick keeps a SIGTERM handler for its duration", async () => {
  const world = loopWorld();
  mkdirSync(world.home, { recursive: true });
  writeFileSync(
    join(world.home, "stop.json"),
    JSON.stringify({ at: "2026-10-25T19:59:00.000Z", by: "stop" }),
  );
  const stopped = tickDeps(world, { exit: 4, signalDuringRun: true });
  // The SIGTERM reaches the tick's handler while the run is in progress: the tick lives on to record.
  expect(await tick({}, stopped.deps)).toBe(0);
  expect(stopped.seen.log.join("\n")).toContain("stop requested: the run ends at its next step");
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(state.stopped).toEqual({ at: "2026-10-25T20:00:00.000Z", run: "2026-10-25-1" });
  expect(state.failures).toBe(0);
  expect(state.backoffUntil).toBe(null);
  expect(existsSync(join(world.home, "stop.json"))).toBe(false);
  const repo = join(world.home, "repo");
  expect(git(repo, "log", "-1", "--format=%s").trim()).toBe(
    "Improvement run 2026-10-25-1: stopped by the user",
  );
  const report = readFileSync(join(repo, "docs/improve/daily/2026-10-25.md"), "utf8");
  expect(report).toContain("| 2026-10-25-1 | t, u | stopped by the user |");
  const notice = stopped.seen.sh.find((c) => c[0] === "osascript")?.join(" ") ?? "";
  expect(notice).toContain("stopped by the user: run 2026-10-25-1");
  expect(stopped.seen.release).toEqual([]);
  expect(stopped.seen.signals).toEqual(["on SIGTERM", "off SIGTERM"]);
  // A marker present at the end of a run that ended on its own: recorded as stopped too, no adoption.
  writeFileSync(join(world.home, "stop.json"), JSON.stringify({ at: "x", by: "stop" }));
  moveOrigin(world, "plugins/core/skills/crew/SKILL.md", "# Crew\n\nv2\n");
  const late = tickDeps(world, { kept: true, now: "2026-10-25T21:00:00.000Z" });
  expect(await tick({}, late.deps)).toBe(0);
  expect(git(repo, "log", "-1", "--format=%s").trim()).toBe(
    "Improvement run 2026-10-25-2: stopped by the user",
  );
  expect(late.seen.release).toEqual([]);
  expect(existsSync(join(world.home, "stop.json"))).toBe(false);
});

/** Origin moves by a commit writing `path` on the user's checkout, before a tick (2026-10-28-001 AC-2). */
function moveOrigin(world: ReturnType<typeof loopWorld>, path: string, text: string): void {
  mkdirSync(join(world.user, dirname(path)), { recursive: true });
  writeFileSync(join(world.user, path), text);
  git(world.user, "add", "-A");
  git(world.user, "commit", "-q", "-m", `move: ${path}`);
  git(world.user, "push", "-q", "origin", "main");
}

test("2026-10-28-001 AC-2: a tick whose sync changed the loop's code releases its lock and relaunches itself once with --relaunched, returning the relaunch's status; a relaunched tick never relaunches; a move of docs/ alone runs on", async () => {
  const world = loopWorld();
  // A first tick makes the clone.
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  expect(first.seen.relaunch).toEqual([]);
  // The loop's code moves on origin: the next tick syncs, sees it, and relaunches instead of running.
  moveOrigin(world, "scripts/improve-loop.ts", "export {};\n// v2\n");
  const relaunching = tickDeps(world, { now: "2026-10-25T21:00:00.000Z", relaunchStatus: 7 });
  expect(await tick({}, relaunching.deps)).toBe(7);
  expect(relaunching.seen.relaunch).toEqual([{ args: ["tick", "--relaunched"], lockGone: true }]);
  // The command the real dep runs: this bun, this script, the arguments.
  expect(relaunchCommand(["tick", "--relaunched"])).toEqual({
    cmd: process.execPath,
    args: [process.argv[1] as string, "tick", "--relaunched"],
  });
  expect(relaunching.seen.improve).toEqual([]);
  expect(relaunching.seen.log.join("\n")).toMatch(
    /the loop's code changed at the sync \([0-9a-f]{7}\.\.[0-9a-f]{7}\); relaunched on the new code/,
  );
  // The same kind of move, with the plugin's text (so the tick is due), read by a relaunched tick: it runs.
  moveOrigin(world, "packages/engine/src/x.ts", "export const x = 1;\n");
  moveOrigin(world, "plugins/core/skills/crew/SKILL.md", "# Crew\n\nv2\n");
  const relaunched = tickDeps(world, { now: "2026-10-25T22:00:00.000Z" });
  expect(await tick({ relaunched: true }, relaunched.deps)).toBe(0);
  expect(relaunched.seen.relaunch).toEqual([]);
  expect(relaunched.seen.improve).toHaveLength(1);
  // A move outside the code the tick runs (docs/ and the plugin's text): no relaunch, the tick runs.
  moveOrigin(world, "docs/notes.md", "notes\n");
  moveOrigin(world, "plugins/core/skills/crew/SKILL.md", "# Crew\n\nv3\n");
  const docsOnly = tickDeps(world, { now: "2026-10-25T23:00:00.000Z" });
  expect(await tick({}, docsOnly.deps)).toBe(0);
  expect(docsOnly.seen.relaunch).toEqual([]);
  expect(docsOnly.seen.improve).toHaveLength(1);
});

test("2026-10-28-001 AC-8: verdictText names each exit by what runImprove documents it as, and the ceiling's stop reaches the commit message and the day's report", async () => {
  const record = (exit: number, kept = false) =>
    ({
      ...keptRecord("2026-10-28-1"),
      kept: kept ? { kind: "single", id: "P-1" } : null,
      exit,
      costUsd: 20.74,
    }) as unknown as Parameters<typeof verdictText>[0];
  expect(verdictText(record(0, true))).toMatch(/^kept P-1/);
  expect(verdictText(record(0))).toBe("nothing kept");
  expect(verdictText(record(2))).toBe("stopped at the ceiling (20.74 USD)");
  expect(verdictText(record(3))).toBe("failed (exit 3)");
  expect(verdictText(record(4))).toBe("stopped by the user");
  expect(verdictText(record(5))).toBe("ended with exit 5");
  const world = loopWorld();
  const capped = tickDeps(world, { exit: 2 });
  expect(await tick({}, capped.deps)).toBe(0);
  const repo = join(world.home, "repo");
  expect(git(repo, "log", "-1", "--format=%s").trim()).toBe(
    "Improvement run 2026-10-25-1: stopped at the ceiling (1.50 USD)",
  );
  expect(readFileSync(join(repo, "docs/improve/daily/2026-10-25.md"), "utf8")).toContain(
    "| 2026-10-25-1 | t, u | stopped at the ceiling (1.50 USD) |",
  );
});

test("2026-10-28-001 AC-9: a stale lock taken over records the dead tick (its checked pid and start, the dead run folder), removes that folder alone, notifies once, reports it, and the tick runs on with no failure; other-boot, symlink, pattern, record and token cases", async () => {
  const world = loopWorld();
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  const repo = join(world.home, "repo");
  const improve = join(repo, "docs/improve");
  // What dead ticks left: three empty run folders, the newest by number `-10` (which a string order
  // would put before `-7`); beside them a folder with a record, a symlink and a name outside the pattern.
  mkdirSync(join(improve, "2026-10-25-10"));
  mkdirSync(join(improve, "2026-10-25-7"));
  mkdirSync(join(improve, "2026-10-25-5"));
  mkdirSync(join(improve, "2026-10-25-6"));
  writeFileSync(join(improve, "2026-10-25-6", "record.json"), "{}");
  symlinkSync(join(improve, "2026-10-25-1"), join(improve, "2026-10-25-8"));
  mkdirSync(join(improve, "notes"));
  writeFileSync(
    join(world.home, "lock.json"),
    JSON.stringify({ pid: 849, startedAt: "2026-10-25T20:32:00.000Z", boot: "boot-1" }),
  );
  moveOrigin(world, "plugins/core/skills/crew/SKILL.md", "# Crew\n\nv2\n");
  const dead = tickDeps(world, { alive: false, now: "2026-10-25T21:00:00.000Z" });
  expect(await tick({}, dead.deps)).toBe(0);
  expect(dead.seen.improve).toHaveLength(1);
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(state.day.deadTicks).toEqual([
    { pid: 849, startedAt: "2026-10-25T20:32:00.000Z", run: "2026-10-25-10" },
  ]);
  expect(state.failures).toBe(0);
  expect(state.backoffUntil).toBe(null);
  // The newest dead folder alone is removed; the two older ones stay.
  expect(existsSync(join(improve, "2026-10-25-10"))).toBe(false);
  expect(existsSync(join(improve, "2026-10-25-7"))).toBe(true);
  expect(existsSync(join(improve, "2026-10-25-5"))).toBe(true);
  expect(existsSync(join(improve, "2026-10-25-6", "record.json"))).toBe(true);
  expect(lstatSync(join(improve, "2026-10-25-8")).isSymbolicLink()).toBe(true);
  expect(existsSync(join(improve, "notes"))).toBe(true);
  const notices = dead.seen.sh.filter((c) => c[0] === "osascript").map((c) => c.join(" "));
  expect(notices.filter((n) => n.includes("a tick died"))).toEqual([
    expect.stringContaining(
      "a tick died: pid 849 started at 20:32 UTC left run 2026-10-25-10 without a record",
    ),
  ]);
  const report = readFileSync(join(repo, "docs/improve/daily/2026-10-25.md"), "utf8");
  expect(report).toContain("## Dead ticks");
  expect(report).toContain(
    "- pid 849, started 20:32 UTC, run 2026-10-25-10 left without a record, folder removed",
  );
  // The two older dead folders cleared by hand, so the next takeovers find no run.
  rmSync(join(improve, "2026-10-25-7"), { recursive: true });
  rmSync(join(improve, "2026-10-25-5"), { recursive: true });
  // A lock from another boot with no dead folder, its start a token-shaped string: pid kept, start unknown, no run. The
  // guarantee that the string reaches no line is the validators' (an ISO date or null; the lines then carry no free text);
  // the redaction behind them has nothing left to redact, so this row pins the validators. Token-shaped by its prefix, as
  // the file's other fixtures are; never a real token's shape, so the secrets gate reads the diff as clean.
  const odd = "ghp_SECRET-not-a-date";
  writeFileSync(
    join(world.home, "lock.json"),
    JSON.stringify({ pid: 777, startedAt: odd, boot: "boot-0" }),
  );
  const rebooted = tickDeps(world, { alive: true, now: "2026-10-25T22:00:00.000Z" });
  expect(await tick({}, rebooted.deps)).toBe(0);
  const later = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(later.day.deadTicks[1]).toEqual({ pid: 777, startedAt: null, run: null });
  const everything = [
    rebooted.seen.log.join("\n"),
    rebooted.seen.sh.map((c) => c.join(" ")).join("\n"),
    readFileSync(join(repo, "docs/improve/daily/2026-10-25.md"), "utf8"),
  ].join("\n");
  expect(everything).not.toContain(odd);
  expect(everything).toContain("- pid 777, started at an unknown time, left no run");
  expect(everything).toContain("a tick died: pid 777 started at an unknown time left no run");
  // A lock whose pid is a string, on this boot: no pid to check alive, taken over; recorded as pid unknown with its start.
  writeFileSync(
    join(world.home, "lock.json"),
    JSON.stringify({ pid: "x", startedAt: "2026-10-25T20:40:00.000Z", boot: "boot-1" }),
  );
  const unknownPid = tickDeps(world, { alive: true, now: "2026-10-25T22:30:00.000Z" });
  expect(await tick({}, unknownPid.deps)).toBe(0);
  const third = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(third.day.deadTicks[2]).toEqual({
    pid: null,
    startedAt: "2026-10-25T20:40:00.000Z",
    run: null,
  });
  expect(readFileSync(join(repo, "docs/improve/daily/2026-10-25.md"), "utf8")).toContain(
    "- pid unknown, started 20:40 UTC, left no run",
  );
  // The report's own row, two dead ticks given.
  const text = dailyReport("2026-10-28", [], [], [], null, {
    deadTicks: [
      { pid: 849, startedAt: "2026-10-28T00:32:51.040Z", run: "2026-10-28-2" },
      { pid: null, startedAt: null, run: null },
    ],
  });
  expect(text).toContain("## Dead ticks");
  expect(text).toContain(
    "- pid 849, started 00:32 UTC, run 2026-10-28-2 left without a record, folder removed",
  );
  expect(text).toContain("- pid unknown, started at an unknown time, left no run");
  // The status: paused, the last stop, the dead ticks of the day.
  writeFileSync(
    join(world.home, "config.json"),
    JSON.stringify({ provider: "runtime", paused: true }),
  );
  const status = statusText({
    ...installDeps(world.home, null).deps,
    now: () => new Date("2026-10-25T23:00:00.000Z"),
  });
  expect(status).toContain("paused: yes (bun scripts/improve-loop.ts resume)");
  expect(status).toContain("dead ticks today: 3 (last pid unknown at 20:40 UTC)");
  writeFileSync(join(world.home, "config.json"), JSON.stringify({ provider: "runtime" }));
  const stopped = { ...later, stopped: { at: "2026-10-25T22:30:00.000Z", run: "2026-10-25-3" } };
  writeFileSync(join(world.home, "state.json"), JSON.stringify(stopped));
  const after = statusText({
    ...installDeps(world.home, null).deps,
    now: () => new Date("2026-10-25T23:00:00.000Z"),
  });
  expect(after).toContain("paused: no");
  expect(after).toContain("last stop: run 2026-10-25-3 at 2026-10-25T22:30:00.000Z");
});

test("2026-10-30-001 AC-26: the clone's bootstrap installs the headless shell in the clone's own folder after its packages, and a failed install is the tick's error", () => {
  const calls: { argv: string[]; cwd?: string }[] = [];
  const answers = (failing: string) => (argv: string[], options?: { cwd?: string }) => {
    calls.push({ argv, cwd: options?.cwd });
    return { status: argv[0] === failing ? 1 : 0, stdout: "", stderr: `${failing} broke\nmore` };
  };
  expect(bootstrapClone("/r", answers("none") as never)).toBeNull();
  // The literal command: the clone's own pinned bin, never a fetch through `bun x`, in the clone's folder.
  expect(calls).toEqual([
    { argv: ["bun", "install", "--frozen-lockfile"], cwd: "/r" },
    {
      argv: [
        "env",
        "PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/ms-playwright",
        "node_modules/.bin/playwright",
        "install",
        "chromium-headless-shell",
      ],
      cwd: "/r",
    },
  ]);
  expect(bootstrapClone("/r", answers("env") as never)).toBe(
    "the headless shell's install failed: env broke",
  );
  calls.length = 0;
  expect(bootstrapClone("/r", answers("bun") as never)).toBe("bun install failed: bun broke");
  expect(calls.map((c) => c.argv)).toEqual([["bun", "install", "--frozen-lockfile"]]);
});

test("2026-10-30-001 AC-28: a tick about to run bootstraps a clone with no installed shell; a tick not due, a dry run and a paused tick install nothing; a failed install fails the tick before the run and the next due tick tries again", async () => {
  const shellOf = (repo: string) => join(repo, "node_modules/.cache/ms-playwright");
  const installs = (seen: { sh: string[][] }) => seen.sh.filter((c) => c[0] === "env").length;
  const world = loopWorld();
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  const repo = join(world.home, "repo");
  expect(installs(first.seen)).toBe(1);
  expect(first.seen.improve.length).toBe(1);
  const removeShell = () => rmSync(shellOf(repo), { recursive: true, force: true });
  let edition = 1;
  const moveText = () => {
    edition += 1;
    moveOrigin(world, "plugins/core/skills/crew/SKILL.md", `# Crew\n\nRule ${edition}.\n`);
  };
  const at = (hour: number) => ({ now: `2026-10-25T${hour}:00:00.000Z` });

  // The clone deployed before this change: it exists, the lockfile is the same, the shell is not there.
  removeShell();
  // Not due: nothing is installed, so a download gates no tick that would not run.
  const idle = tickDeps(world, at(20));
  expect(await tick({}, idle.deps)).toBe(0);
  expect(idle.seen.log.join("\n")).toContain("not due:");
  expect(installs(idle.seen)).toBe(0);
  // The packages are installed at every tick (2026-11-13-005); the shell is not.
  expect(idle.seen.sh.filter((c) => c[0] === "bun")).toEqual([
    ["bun", "install", "--frozen-lockfile"],
  ]);
  // A dry run says what it would do and installs nothing.
  moveText();
  const dry = tickDeps(world, at(20));
  expect(await tick({ dryRun: true }, dry.deps)).toBe(0);
  expect(dry.seen.log.join("\n")).toContain("dry run: due");
  expect(installs(dry.seen)).toBe(0);
  // Paused: nothing.
  const config = join(world.home, "config.json");
  const unpaused = existsSync(config) ? readFileSync(config, "utf8") : null;
  writeFileSync(config, JSON.stringify({ paused: true }));
  const paused = tickDeps(world, at(20));
  expect(await tick({}, paused.deps)).toBe(0);
  expect(installs(paused.seen)).toBe(0);
  if (unpaused === null) rmSync(config);
  else writeFileSync(config, unpaused);

  // Due: the install fails, the tick fails and the run does not start.
  const failing = tickDeps(world, { ...at(21), shellInstallFails: true });
  expect(await tick({}, failing.deps)).toBe(1);
  expect(installs(failing.seen)).toBe(1);
  expect(failing.seen.improve).toEqual([]);
  expect(failing.seen.log.join("\n")).toContain(
    "the headless shell's install failed: the download failed",
  );
  // A folder with no finished build is no shell: an install killed midway is installed again.
  mkdirSync(join(shellOf(repo), "chromium_headless_shell-1"), { recursive: true });
  // The failed tick's back-off holds the next hour, with no install: the notice that it waits is true.
  const held = tickDeps(world, { now: "2026-10-25T21:30:00.000Z" });
  expect(await tick({}, held.deps)).toBe(0);
  expect(held.seen.log.join("\n")).toContain("backing off until");
  expect(installs(held.seen)).toBe(0);
  // Past it the next due tick tries again, and runs.
  const again = tickDeps(world, { now: "2026-10-26T12:00:00.000Z" });
  expect(await tick({}, again.deps)).toBe(0);
  expect(installs(again.seen)).toBe(1);
  expect(again.seen.improve.length).toBe(1);
  // With the shell in place a due tick still runs Playwright's install, which then does nothing
  // (2026-11-13-005: the loop keeps no check of its own, so a bumped Playwright gets its build).
  moveText();
  const settled = tickDeps(world, { now: "2026-10-26T13:00:00.000Z" });
  expect(await tick({}, settled.deps)).toBe(0);
  expect(installs(settled.seen)).toBe(1);
  expect(settled.seen.improve.length).toBe(1);
});

test("2026-10-30-001 AC-28: a pending release resumes whatever the shell's state, since the install comes after it", async () => {
  const world = loopWorld();
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  const repo = join(world.home, "repo");
  rmSync(join(repo, "node_modules/.cache/ms-playwright"), { recursive: true, force: true });
  const stateFile = join(world.home, "state.json");
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  writeFileSync(
    stateFile,
    JSON.stringify({ ...state, pendingRelease: { version: "9.9.9", failedStep: 3 } }),
  );
  const resumed = tickDeps(world, { now: "2026-10-25T21:00:00.000Z", shellInstallFails: true });
  await tick({}, resumed.deps);
  expect(resumed.seen.log.join("\n")).toContain("resuming release 9.9.9 from step 3");
});

// Item 2026-11-09-001, Task 5: a pending release resumes by the step's name (AC-19).

test("2026-11-09-001 AC-19: a pending release resumes by the step's name", async () => {
  const world = loopWorld();
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  const stateFile = join(world.home, "state.json");
  // Each tick an hour after the one before, from 21:00 on the day of the first.
  let hours = 0;
  /** One tick over a state that holds the pending release: what the release was asked, what was logged, the state left. */
  const resume = async (pending: Record<string, unknown>, resumeFails?: number) => {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    writeFileSync(
      stateFile,
      JSON.stringify({ ...state, pendingRelease: { version: "0.15.1", ...pending } }),
    );
    const at = tickDeps(world, {
      now: new Date(Date.UTC(2026, 9, 25, 21 + hours++)).toISOString(),
      ...(resumeFails === undefined ? {} : { resumeFails }),
    });
    await tick({}, at.deps);
    return {
      fromSteps: at.seen.fromSteps,
      log: at.seen.log.join("\n"),
      pending: JSON.parse(readFileSync(stateFile, "utf8")).pendingRelease ?? null,
    };
  };
  // The step moved: the notification was step 12 when the release failed and is step 13 now.
  const moved = await resume({ failedStep: 12, failedName: "the notification" });
  expect(moved.fromSteps).toEqual([13]);
  expect(moved.log).toContain('resuming release 0.15.1: step "the notification" is now step 13');
  expect(moved.log).not.toContain("from step 12");
  expect(moved.pending).toBeNull();
  // The name stands where the number says: resumed as before.
  const same = await resume({ failedStep: 9, failedName: "the marketplace entry" });
  expect(same.fromSteps).toEqual([9]);
  expect(same.log).toContain("resuming release 0.15.1 from step 9");
  // A state an older loop wrote, with no name: the number.
  const legacy = await resume({ failedStep: 9 });
  expect(legacy.fromSteps).toEqual([9]);
  expect(legacy.log).toContain("resuming release 0.15.1 from step 9");
  // The step is gone from the release: from the first step after the push.
  const gone = await resume({ failedStep: 9, failedName: "a step that is gone" });
  expect(gone.fromSteps).toEqual([undefined]);
  expect(gone.log).toContain(
    'resuming release 0.15.1: step "a step that is gone" is gone from the release; resumed from the first step after the push',
  );
  expect(gone.log).not.toContain("from step 9");
  // A resume that fails again keeps the new step with its name.
  const again = await resume({ failedStep: 9, failedName: "the marketplace entry" }, 11);
  expect(again.pending).toEqual({
    version: "0.15.1",
    failedStep: 11,
    failedName: "the local install",
  });
});

const FABLE_LIMIT_TEXT = "You've reached your Fable limit. Switch to another model.";
const limitedProbe: ProbeAnswer = { status: 1, output: FABLE_LIMIT_TEXT, timedOut: false };
/** The suite's own provider: the judge that gives way to the fallback. */
const suiteProvider = {
  ...claude,
  agentModel: DEFAULT_AGENT_MODEL,
  judgeModel: JUDGE_MODEL,
  env: { CLAUDE_CODE_OAUTH_TOKEN: "t" },
};
const adopt = (
  fixture: { repo: string; folder: string },
  deps: ReturnType<typeof adoptDeps>["deps"],
  provider: typeof claude = suiteProvider,
) =>
  adoptRun(
    { ...fixture, record: keptRecord("2026-10-25-1"), provider, judgeSystemPrompt: "# Judge" },
    deps,
  );
const rulingOf = (fixture: { folder: string }) =>
  readFileSync(join(fixture.folder, "adoption/ruling.md"), "utf8");
const modelOf = (call: { args: string[] } | undefined) =>
  call?.args[(call?.args.indexOf("--model") ?? -1) + 1];

test("2026-11-09-004 AC-36: the adoption judge is chosen by a probe in the provider's environment and named in the ruling; a judge call that fails is never a ruling: at a limit the next candidate rules, otherwise nothing is ruled or released", async () => {
  expect(judgeArgs("p", "s", "m")).toContain("--strict-mcp-config");
  const args = judgeArgs("p", "s", "m");
  expect(args[args.indexOf("--model") + 1]).toBe("m");
  // Fable answers its probe: it rules, and the ruling says so.
  const first = adoptionFixture();
  const fable = adoptDeps(holdsJson);
  expect((await adopt(first, fable.deps)).released).toBe("0.15.1");
  expect(fable.seen.probes).toEqual([
    { model: JUDGE_MODEL, cwd: first.repo, env: suiteProvider.env },
  ]);
  expect(modelOf(fable.seen.judge[0])).toBe(JUDGE_MODEL);
  expect(rulingOf(first)).toContain(`- judge: ${JUDGE_MODEL}\n- passed over: none\n\nholds`);
  // Fable limited at the probe: Opus rules (D-3), named with the model passed over.
  const second = adoptionFixture();
  const fell = adoptDeps(holdsJson, {
    probe: (model) =>
      model === JUDGE_MODEL ? limitedProbe : { status: 0, output: "ok", timedOut: false },
  });
  expect((await adopt(second, fell.deps)).released).toBe("0.15.1");
  expect(fell.seen.judge.map(modelOf)).toEqual([JUDGE_FALLBACK]);
  expect(rulingOf(second)).toContain(
    `- judge: ${JUDGE_FALLBACK}\n- passed over: ${JUDGE_MODEL} (limited)\n\nholds`,
  );
  // Neither answers: no judge is launched, nothing is released, fixed words alone.
  const third = adoptionFixture();
  const none = adoptDeps(holdsJson, { probe: () => limitedProbe });
  const unruled = await adopt(third, none.deps);
  const words = `no judge answered (${JUDGE_MODEL}: limited, ${JUDGE_FALLBACK}: limited)`;
  expect(unruled).toEqual({
    released: null,
    reason: words,
    notRuled: true,
    branch: "improve/2026-10-25-1",
  });
  expect(none.seen.judge).toEqual([]);
  expect(none.seen.release).toEqual([]);
  expect(rulingOf(third)).toContain(
    `- judge: none\n- passed over: ${JUDGE_MODEL} (limited), ${JUDGE_FALLBACK} (limited)\n\nnot ruled: ${words}`,
  );
  expect(none.seen.log.join("\n")).toContain(`adoption of 2026-10-25-1: not ruled: ${words}`);
  expect(rulingOf(third)).not.toContain("Switch to another model");
  expect(unruled.reason).not.toContain("Switch to another model");
  expect(git(third.repo, "log", "-1", "--format=%s").trim()).toBe("init");
  // The limit met during the ruling, in stderr alone: the next candidate rules, whole.
  const fourth = adoptionFixture();
  const midway = adoptDeps(holdsJson, {
    judgeAnswer: (n) => (n === 1 ? { status: 1, output: "", stderr: FABLE_LIMIT_TEXT } : undefined),
  });
  expect((await adopt(fourth, midway.deps)).released).toBe("0.15.1");
  expect(midway.seen.judge.map(modelOf)).toEqual([JUDGE_MODEL, JUDGE_FALLBACK]);
  expect(rulingOf(fourth)).toContain(
    `- judge: ${JUDGE_FALLBACK}\n- passed over: ${JUDGE_MODEL} (limited)\n\nholds`,
  );
  // Every candidate at its limit during the ruling: not ruled, never "does not hold".
  const fifth = adoptionFixture();
  const spent = adoptDeps(holdsJson, {
    judgeAnswer: () => ({ status: 1, output: FABLE_LIMIT_TEXT }),
  });
  const exhausted = await adopt(fifth, spent.deps);
  expect(exhausted).toEqual({
    released: null,
    reason: "not ruled: every judge was at its limit",
    notRuled: true,
    branch: "improve/2026-10-25-1",
  });
  expect(spent.seen.judge).toHaveLength(2);
  expect(rulingOf(fifth)).toContain(
    `- judge: none\n- passed over: ${JUDGE_MODEL} (limited), ${JUDGE_FALLBACK} (limited)\n\nnot ruled: every judge was at its limit`,
  );
  expect(rulingOf(fifth)).not.toContain("does not hold");
  // Another failure of the judge call: one call, not ruled, the status named.
  const sixth = adoptionFixture();
  const broken = adoptDeps(holdsJson, {
    judgeAnswer: () => ({ status: 1, output: "Invalid API key" }),
  });
  const failed = await adopt(sixth, broken.deps);
  expect(failed).toEqual({
    released: null,
    reason: "not ruled: the judge exited 1",
    notRuled: true,
    branch: "improve/2026-10-25-1",
  });
  expect(broken.seen.judge).toHaveLength(1);
  expect(rulingOf(sixth)).toContain(
    `- judge: none\n- passed over: ${JUDGE_MODEL} (failed)\n\nnot ruled: the judge exited 1`,
  );
  expect(rulingOf(sixth)).not.toContain("does not hold");
  expect(broken.seen.release).toEqual([]);
  // A pinned judge (the shared fixture's) is probed alone: limited gives not ruled.
  const seventh = adoptionFixture();
  const pinned = adoptDeps(holdsJson, { probe: () => limitedProbe });
  const alone = await adopt(seventh, pinned.deps, claude);
  expect(pinned.seen.probes.map((p) => p.model)).toEqual([claude.judgeModel]);
  expect(alone.reason).toBe(`no judge answered (${claude.judgeModel}: limited)`);
});

test("2026-11-09-004 AC-40: an answer of the adoption judge marked as an error is no ruling at any exit status: at a limit the next candidate rules, otherwise nothing is ruled", async () => {
  // The limit as an error answer of a call that exits 0: the status the CLI gives at a limit is recorded nowhere.
  const first = adoptionFixture();
  const quota = adoptDeps(holdsJson, {
    judgeAnswer: (n) =>
      n === 1
        ? { status: 0, output: JSON.stringify({ is_error: true, result: FABLE_LIMIT_TEXT }) }
        : undefined,
  });
  expect((await adopt(first, quota.deps)).released).toBe("0.15.1");
  expect(quota.seen.judge.map(modelOf)).toEqual([JUDGE_MODEL, JUDGE_FALLBACK]);
  expect(rulingOf(first)).toContain(
    `- judge: ${JUDGE_FALLBACK}\n- passed over: ${JUDGE_MODEL} (limited)\n\nholds`,
  );
  // Another error answer with status 0: one call, not ruled, never "does not hold".
  const second = adoptionFixture();
  const errored = adoptDeps(holdsJson, {
    judgeAnswer: () => ({
      status: 0,
      output: JSON.stringify({ is_error: true, result: "holds" }),
    }),
  });
  const out = await adopt(second, errored.deps);
  expect(out).toEqual({
    released: null,
    reason: "not ruled: the judge's answer was an error",
    notRuled: true,
    branch: "improve/2026-10-25-1",
  });
  expect(errored.seen.judge).toHaveLength(1);
  expect(rulingOf(second)).toContain(
    `- judge: none\n- passed over: ${JUDGE_MODEL} (failed)\n\nnot ruled: the judge's answer was an error`,
  );
  expect(rulingOf(second)).not.toContain("does not hold");
  expect(errored.seen.release).toEqual([]);
  // A ruling whose own words name a usage limit is still a ruling: only an error answer is read for it.
  const third = adoptionFixture();
  const wordy = adoptDeps(
    JSON.stringify({
      result: "does not hold\n\nMissing: the rule on the usage limit was softened.",
    }),
  );
  const ruled = await adopt(third, wordy.deps);
  expect(ruled.reason).toBe(
    'the judge ruled "does not hold": the rule on the usage limit was softened.',
  );
  expect(wordy.seen.judge).toHaveLength(1);
});

test("2026-11-09-004 AC-36 (through the tick): the adoption probes through the tick's own probe, and with no judge answering the kept run is not released", async () => {
  const world = loopWorld();
  const { deps, seen } = tickDeps(world, { kept: true, probe: () => limitedProbe });
  expect(await tick({}, deps)).toBe(0);
  expect(seen.probes).toEqual([JUDGE_MODEL, JUDGE_FALLBACK]);
  expect(seen.judge).toBe(0);
  expect(seen.release).toEqual([]);
  const notices = seen.sh.filter((c) => c[0] === "osascript");
  expect(notices.at(-1)?.join(" ")).toContain("no judge answered");
  // The person is told what to do with the kept branch (2026-11-11-002 AC-32).
  expect(notices.at(-1)?.join(" ")).toMatch(
    /no judge answered \(.*\); the run was not ruled and its branch improve\/2026-10-25-1 is kept: adopt it by hand \(docs\/improve\/README\.md\)/,
  );
});

test("2026-11-09-004 AC-41: a provider whose agent or judge model is no model name is refused before anything runs", () => {
  const gateway = (overrides: Record<string, string>): LoopConfig["provider"] => ({
    name: "openrouter",
    baseUrl: "https://openrouter.ai/api",
    authToken: { keychain: "or-token" },
    models: { ...models, ...overrides },
  });
  expect(() =>
    providerEnv({ provider: gateway({ judge: "--print" }) } as LoopConfig, keychain),
  ).toThrow('the provider\'s judge model "--print" is not a model name; nothing runs');
  expect(() =>
    providerEnv({ provider: gateway({ agent: "a b" }) } as LoopConfig, keychain),
  ).toThrow('the provider\'s agent model "a b" is not a model name; nothing runs');
  expect(providerEnv({ provider: gateway({}) } as LoopConfig, keychain).judgeModel).toBe(
    models.judge,
  );
});

test("2026-11-09-004 AC-37: a run with no judge is a skip of the tick, told once a day beside a budget skip, with no record, no lastRun and no failure; a run stopped at a limit leaves the tick due, one stopped by another cause does not; lastMeasuredOf follows", async () => {
  const world = loopWorld();
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  const stateOf = () => JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(stateOf().lastRun.run).toBe("2026-10-25-1");
  const pushRule = (n: number) => {
    git(world.user, "pull", "-q", "--rebase", "origin", "main");
    writeFileSync(join(world.user, "plugins/core/skills/crew/SKILL.md"), `# Crew\n\nRule ${n}.\n`);
    git(world.user, "add", "-A");
    git(world.user, "commit", "-q", "-m", `rule ${n}`);
    git(world.user, "push", "-q", "origin", "main");
  };
  const runsOf = () =>
    readdirSync(join(world.home, "repo/docs/improve"))
      .filter((n) => n.startsWith("2026-10-25-"))
      .sort();
  // Due (the plugin's text changed), and no judge answers: an earlier run's record is in the clone.
  pushRule(2);
  const second = tickDeps(world, { now: "2026-10-25T21:00:00.000Z", noJudge: true });
  expect(await tick({}, second.deps)).toBe(0);
  expect(second.seen.improve).toHaveLength(1);
  expect(runsOf()).toEqual(["2026-10-25-1"]);
  expect(stateOf().lastRun.run).toBe("2026-10-25-1");
  expect(stateOf().failures ?? 0).toBe(0);
  expect(stateOf().backoffUntil ?? null).toBeNull();
  expect(stateOf().day.judgeSkip).toEqual({ at: "2026-10-25T21:00:00.000Z" });
  expect(originHead(world.origin)).toBe("Improvement tick 2026-10-25: no judge answered");
  const report = () => git(world.origin, "show", "main:docs/improve/daily/2026-10-25.md");
  expect(report()).toContain("## Skipped ticks");
  expect(report()).toContain("- 21:00 UTC: no judge answered; a later due tick probes again");
  const notices = second.seen.sh.filter((c) => c[0] === "osascript");
  expect(notices).toHaveLength(1);
  expect(notices[0]?.join(" ")).toContain("skipped: no judge answered");
  // The same again that day: the log alone.
  const third = tickDeps(world, { now: "2026-10-25T22:00:00.000Z", noJudge: true });
  expect(await tick({}, third.deps)).toBe(0);
  expect(third.seen.sh.filter((c) => c[0] === "osascript")).toEqual([]);
  expect(third.seen.log.join("\n")).toContain("skipped: no judge answered; reported at 21:00 UTC");
  expect(originHead(world.origin)).toBe("Improvement tick 2026-10-25: no judge answered");
  // A run stopped at a baseline not judged at a limit: on record, the tick still due.
  const fourth = tickDeps(world, { now: "2026-10-25T22:30:00.000Z", unjudged: FABLE_LIMIT_TEXT });
  expect(await tick({}, fourth.deps)).toBe(0);
  expect(runsOf()).toEqual(["2026-10-25-1", "2026-10-25-2"]);
  expect(originHead(world.origin)).toBe(
    "Improvement run 2026-10-25-2: stopped: a run was not judged",
  );
  expect(stateOf().lastRun.run).toBe("2026-10-25-1");
  expect(stateOf().failures).toBe(0);
  expect(fourth.seen.judge).toBe(0);
  // The same stop for a cause that is no limit: the run is the last run, and the tick is not due again.
  const fifth = tickDeps(world, {
    now: "2026-10-25T23:00:00.000Z",
    unjudged: "API Error: Fable 5.2's safeguards flagged this message",
  });
  expect(await tick({}, fifth.deps)).toBe(0);
  expect(stateOf().lastRun.run).toBe("2026-10-25-3");
  const sixth = tickDeps(world, { now: "2026-10-25T23:30:00.000Z" });
  expect(await tick({}, sixth.deps)).toBe(0);
  expect(sixth.seen.improve).toEqual([]);
  // The day's budget spent on the same day: both skips stand in the report.
  pushRule(3);
  writeFileSync(join(world.home, "config.json"), JSON.stringify({ maxRunUsd: 0, maxDayUsd: 1 }));
  const seventh = tickDeps(world, { now: "2026-10-25T23:45:00.000Z" });
  expect(await tick({}, seventh.deps)).toBe(0);
  expect(report()).toContain("- 21:00 UTC: no judge answered; a later due tick probes again");
  expect(report()).toContain("every later tick of the day skips the same way");

  expect(verdictText({ exit: 6 } as Parameters<typeof verdictText>[0])).toBe(
    "stopped: a run was not judged",
  );
  const at = "2026-10-25T22:30:00.000Z";
  const stopped = (cause: string, where: "baseline" | "probe") => {
    const marked = { ...figures(0), unjudged: true, runs: [{ score: 0, unjudged: cause }] };
    return {
      run: "r",
      at,
      baseline: where === "baseline" ? { t: marked } : { t: figures(0.5) },
      proposals: where === "probe" ? [{ id: "P-1", probe: { u: marked } }] : [],
    } as unknown as Parameters<typeof lastMeasuredOf>[0][number];
  };
  const none = { t: null, u: null };
  expect(lastMeasuredOf([stopped(FABLE_LIMIT_TEXT, "baseline")], ["t", "u"])).toEqual(none);
  expect(lastMeasuredOf([stopped("API Error: 529 Overloaded", "baseline")], ["t", "u"])).toEqual(
    none,
  );
  expect(
    lastMeasuredOf([stopped("safeguards flagged this message", "baseline")], ["t", "u"]),
  ).toEqual({
    t: at,
    u: null,
  });
  // A proposal's probe not judged at a limit: its baseline's case counts, the probed one does not.
  expect(lastMeasuredOf([stopped(FABLE_LIMIT_TEXT, "probe")], ["t", "u"])).toEqual({
    t: at,
    u: null,
  });
  // A record written before the field: counted as it was.
  expect(
    lastMeasuredOf(
      [{ run: "r", at, baseline: { t: figures(0.5) }, proposals: [] } as never],
      ["t", "u"],
    ),
  ).toEqual({ t: at, u: null });
}, 120_000);

test("2026-11-09-004 AC-41 (through the tick): a tick whose provider names no model name fails before any probe, run or judge", async () => {
  const world = loopWorld();
  writeFileSync(
    join(world.home, "config.json"),
    JSON.stringify({
      provider: {
        name: "local",
        baseUrl: "http://127.0.0.1:1234",
        models: { ...models, judge: "--print" },
      },
    }),
  );
  const { deps, seen } = tickDeps(world);
  expect(await tick({}, deps)).toBe(1);
  expect(seen.improve).toEqual([]);
  expect(seen.probes).toEqual([]);
  expect(seen.judge).toBe(0);
  expect(seen.log.join("\n")).toContain(
    'the provider\'s judge model "--print" is not a model name; nothing runs',
  );
});

test("2026-11-11-002 AC-14: unjudgedAtLimit reads a cause as its class, limited and overloaded at a limit and failed not, and a text of an older record by the pattern", () => {
  const withCauses = (...causes: (string | undefined)[]) => ({
    unjudged: true,
    runs: causes.map((unjudged) => ({ score: 0, ...(unjudged === undefined ? {} : { unjudged }) })),
  });
  expect(unjudgedAtLimit(withCauses("limited", "limited"))).toBe(true);
  expect(unjudgedAtLimit(withCauses("overloaded"))).toBe(true);
  expect(unjudgedAtLimit(withCauses("limited", undefined, "overloaded"))).toBe(true);
  expect(unjudgedAtLimit(withCauses("limited", "failed"))).toBe(false);
  expect(unjudgedAtLimit(withCauses("failed"))).toBe(false);
  // A record written before the class: the CLI's text, read by the pattern.
  expect(unjudgedAtLimit(withCauses(FABLE_LIMIT_TEXT))).toBe(true);
  expect(unjudgedAtLimit(withCauses("529 Overloaded"))).toBe(true);
  expect(unjudgedAtLimit(withCauses("The model's safeguards flagged this request."))).toBe(false);
  // A class word inside a longer text is a text: "failed" in a limit's sentence is still a limit.
  expect(unjudgedAtLimit(withCauses("the call failed: rate limit exceeded"))).toBe(true);
  expect(unjudgedAtLimit(withCauses())).toBe(false);
  expect(unjudgedAtLimit({ runs: [{ unjudged: "limited" }] })).toBe(false);
});

test("2026-11-11-002 AC-26: adoptRun says notRuled on its not-ruled endings alone: a failed gate, a ruling of either kind, another provider, a failed merge and an unfinished release carry no such field", async () => {
  const input = (
    fixture: { repo: string; folder: string },
    more: Record<string, unknown> = {},
  ) => ({
    ...fixture,
    record: keptRecord("2026-10-25-1"),
    provider: claude,
    judgeSystemPrompt: "# Judge",
    ...more,
  });
  // The gate fails: the probe's figures are no win.
  const gate = await adoptRun(
    input(adoptionFixture(), { record: keptRecord("2026-10-25-1", 0.5) }),
    adoptDeps(holdsJson).deps,
  );
  expect(gate.reason).toStartWith("the gate failed");
  expect("notRuled" in gate).toBe(false);
  // The judge rules "does not hold".
  const refused = await adoptRun(
    input(adoptionFixture()),
    adoptDeps(JSON.stringify({ result: "does not hold\n\nMissing: rule 1." })).deps,
  );
  expect(refused.reason).toStartWith('the judge ruled "does not hold"');
  expect("notRuled" in refused).toBe(false);
  // Another provider's models.
  const other = await adoptRun(
    input(adoptionFixture(), { provider: { ...claude, name: "ollama", claudeModels: false } }),
    adoptDeps(holdsJson).deps,
  );
  expect(other.reason).toStartWith("measured on ollama, not Claude models");
  expect("notRuled" in other).toBe(false);
  // The merge fails.
  const real = adoptDeps(holdsJson).deps;
  const conflict = await adoptRun(input(adoptionFixture()), {
    ...real,
    git: (args: string[], cwd: string) =>
      args[0] === "merge" && args[1] !== "--abort"
        ? { status: 1, stdout: "", stderr: "CONFLICT (content): SKILL.md\n" }
        : real.git(args, cwd),
  });
  expect(conflict.reason).toStartWith("the merge of improve/2026-10-25-1 failed: CONFLICT");
  expect("notRuled" in conflict).toBe(false);
  // The release does not finish.
  const unfinished = await adoptRun(input(adoptionFixture()), {
    ...adoptDeps(holdsJson).deps,
    release: async () => ({ code: 1, version: null }),
  });
  expect(unfinished.reason).toStartWith("the release did not finish");
  expect("notRuled" in unfinished).toBe(false);
  // The ruling holds and the run is released.
  const released = await adoptRun(input(adoptionFixture()), adoptDeps(holdsJson).deps);
  expect(released).toEqual({ released: "0.15.1", reason: null });
  // The three not-ruled endings, each with the field.
  const none = await adopt(
    adoptionFixture(),
    adoptDeps(holdsJson, { probe: () => limitedProbe }).deps,
  );
  const limited = await adopt(
    adoptionFixture(),
    adoptDeps(holdsJson, { judgeAnswer: () => ({ status: 1, output: FABLE_LIMIT_TEXT }) }).deps,
  );
  const failed = await adopt(
    adoptionFixture(),
    adoptDeps(holdsJson, { judgeAnswer: () => ({ status: 1, output: "boom" }) }).deps,
  );
  expect([none.notRuled, limited.notRuled, failed.notRuled]).toEqual([true, true, true]);
  // Each names the branch the adoption read, for the tick to hand to a person.
  expect([none, limited, failed].map((a) => (a.notRuled ? a.branch : null))).toEqual(
    Array(3).fill("improve/2026-10-25-1"),
  );
  expect([none.released, limited.released, failed.released]).toEqual([null, null, null]);
});

test("2026-11-11-002 AC-32: a tick whose adoption was not ruled on Claude models names the kept branch for a person in its notification; another provider, a ruling of does not hold and a failed gate say no such words; the state and status gain nothing", async () => {
  const sentence =
    "the run was not ruled and its branch improve/2026-10-25-1 is kept: adopt it by hand (docs/improve/README.md)";
  expect(ADOPT_BY_HAND).toBe("adopt it by hand (docs/improve/README.md)");
  // 2026-11-12-001 AC-9: the sentence is one value; the reason built from it is read below, in the tick's notification.
  expect(keptNote("improve/2026-10-25-1", true)).toBe(sentence);
  expect(keptNote("improve/2026-10-25-1", false)).toBeNull();
  const lastNotice = (seen: { sh: string[][] }) =>
    seen.sh
      .filter((c) => c[0] === "osascript")
      .at(-1)
      ?.join(" ") ?? "";
  const keysOf = (home: string) =>
    Object.keys(JSON.parse(readFileSync(join(home, "state.json"), "utf8"))).sort();
  // Not ruled, on Claude models: the reason, then the sentence, in the notification and the log.
  const world = loopWorld();
  const unruled = tickDeps(world, { kept: true, probe: () => limitedProbe });
  expect(await tick({}, unruled.deps)).toBe(0);
  expect(lastNotice(unruled.seen)).toContain(
    `no judge answered (${JUDGE_MODEL}: limited, ${JUDGE_FALLBACK}: limited); ${sentence}`,
  );
  // The adoption logs why nothing was ruled; the tick logs the sentence for a person once, without the reason again.
  expect(unruled.seen.log.join("\n")).toContain(
    "adoption of 2026-10-25-1: not ruled: no judge answered",
  );
  const told = unruled.seen.log.filter((line) => line.includes(sentence));
  expect(told).toHaveLength(1);
  expect(told[0]).toEndWith(`adoption of 2026-10-25-1: ${sentence}`);
  expect(unruled.seen.release).toEqual([]);
  // A tick that ruled and released says no such words.
  const ruledWorld = loopWorld();
  const ruled = tickDeps(ruledWorld, { kept: true });
  expect(await tick({}, ruled.deps)).toBe(0);
  expect(ruled.seen.release).toHaveLength(1);
  expect(lastNotice(ruled.seen)).not.toContain("adopt it by hand");
  // In the home of the tick that was not ruled, status says nothing of the run.
  const status = statusText(installDeps(world.home, null).deps);
  expect(status).not.toContain("not ruled");
  expect(status).not.toContain("adopt it by hand");
  // Not ruled, on a provider that is not Claude models: the loop's rule never releases it, so no person is asked to.
  const localWorld = loopWorld();
  writeFileSync(
    join(localWorld.home, "config.json"),
    JSON.stringify({
      provider: {
        name: "ollama",
        baseUrl: "http://localhost:11434",
        authToken: { placeholder: "ollama" },
        models: { ...models, agent: "qwen3-coder" },
      },
    }),
  );
  const local = tickDeps(localWorld, { kept: true, probe: () => limitedProbe });
  expect(await tick({}, local.deps)).toBe(0);
  expect(lastNotice(local.seen)).toContain("no judge answered");
  expect(lastNotice(local.seen)).not.toContain("adopt it by hand");
  expect(local.seen.log.join("\n")).not.toContain("adopt it by hand");
  // The judge rules "does not hold": decided, so nothing is handed to a person.
  const refusedWorld = loopWorld();
  const refused = tickDeps(refusedWorld, {
    kept: true,
    judge: JSON.stringify({ result: "does not hold\n\nMissing: rule 1." }),
  });
  expect(await tick({}, refused.deps)).toBe(0);
  expect(lastNotice(refused.seen)).toContain("does not hold");
  expect(lastNotice(refused.seen)).not.toContain("adopt it by hand");
  // The state of the tick not ruled holds the keys of this one, which released nothing either: none more, none less.
  expect(keysOf(world.home)).toEqual(keysOf(refusedWorld.home));
  expect(keysOf(world.home)).not.toContain("unruled");
  // The gate fails on a path outside the harness: the same.
  const gateWorld = loopWorld();
  const gate = tickDeps(gateWorld, { kept: true, keptAlso: "scripts/x.ts" });
  expect(await tick({}, gate.deps)).toBe(0);
  expect(lastNotice(gate.seen)).toContain("the gate failed");
  expect(lastNotice(gate.seen)).not.toContain("adopt it by hand");
});

test("2026-11-12-001 AC-9: a run not ruled has one value, the sentence for a person or nothing, and the adoption step tests the provider's models once for the reason and the log line", async () => {
  expect(keptNote("improve/x", true)).toBe(
    "the run was not ruled and its branch improve/x is kept: adopt it by hand (docs/improve/README.md)",
  );
  expect(keptNote("improve/x", false)).toBeNull();
  const { fileURLToPath } = await import("node:url");
  const source = readFileSync(
    fileURLToPath(new URL("../../../scripts/improve-loop.ts", import.meta.url)),
    "utf8",
  );
  // The block of the tick that handles a run not ruled, alone: up to the line that closes it.
  const from = source.indexOf("      if (adopted.notRuled) {");
  expect(from).toBeGreaterThan(-1);
  const block = source.slice(from, source.indexOf("\n      }\n", from));
  expect(block).toContain("keptNote(adopted.branch, provider.claudeModels)");
  expect(block.split("provider.claudeModels").length - 1).toBe(1);
  expect(block).toContain("reason =");
  expect(block).toContain("log(");
  // The function the two were made from apart is gone.
  expect(source).not.toContain("notRuledReason");
});

test("2026-11-12-001 AC-16: the adoption writes the commit its patch is taken from, and the README's command prints that commit in another clone, and another after a push to the branch", async () => {
  const { repo, folder } = adoptionFixture();
  const { deps } = adoptDeps(holdsJson);
  const calls: string[][] = [];
  const branch = "improve/2026-10-25-1";
  await adoptRun(
    {
      repo,
      folder,
      record: keptRecord("2026-10-25-1"),
      provider: claude,
      judgeSystemPrompt: "# Judge\n\nYou decide on evidence.",
    },
    {
      ...deps,
      git: (args: string[], cwd: string) => {
        calls.push(args);
        return deps.git(args, cwd);
      },
    },
  );
  const commit = git(repo, "rev-parse", branch).trim();
  expect(commit).toMatch(/^[0-9a-f]{40}$/);
  expect(readFileSync(join(folder, "adoption/commit"), "utf8")).toBe(`${commit}\n`);
  // The patch is the diff of main to that commit, by its id, so the two cannot name two commits.
  expect(calls).toContainEqual(["diff", `main...${commit}`]);
  expect(calls).not.toContainEqual(["diff", `main...${branch}`]);

  // The step of the README, and its command read out of it.
  const { fileURLToPath } = await import("node:url");
  const readme = readFileSync(
    fileURLToPath(new URL("../../../docs/improve/README.md", import.meta.url)),
    "utf8",
  );
  const hand = readme.slice(readme.indexOf("## Adopting a kept run by hand"));
  const steps = hand.slice(hand.indexOf("\nThen:"));
  const step = steps.split("\n").find((l) => l.startsWith("2. ")) ?? "";
  for (const said of [
    "`adoption/commit`",
    "do not merge",
    "no `adoption/commit`",
    "`git diff origin/main...origin/<branch>`",
  ])
    expect(step, said).toContain(said);
  const command = /`(git rev-parse origin\/<branch>)`/.exec(step)?.[1] ?? "";
  expect(command).not.toBe("");
  // A person's checkout: another clone of origin, with another length of abbreviated ids.
  const origin = tempDir("adopt-origin-");
  git(origin, "clone", "-q", "--bare", repo, ".");
  const person = tempDir("adopt-person-");
  git(person, "clone", "-q", origin, ".");
  git(person, "config", "core.abbrev", "12");
  const printed = () => {
    git(person, "fetch", "-q", "origin");
    return git(person, ...command.replace("<branch>", branch).split(" ").slice(1)).trim();
  };
  expect(printed()).toBe(commit);
  // One more commit pushed to the branch after the run: the command prints another commit.
  git(repo, "checkout", "-q", branch);
  writeFileSync(join(repo, "plugins/core/agents/judge.md"), "# Judge\n\nPushed after the run.\n");
  git(repo, "commit", "-q", "-am", "pushed after the run");
  git(repo, "push", "-q", origin, branch);
  git(repo, "checkout", "-q", "main");
  const moved = printed();
  expect(moved).toMatch(/^[0-9a-f]{40}$/);
  expect(moved).not.toBe(commit);
});

test("2026-11-12-002 AC-5: the adoption reads its branch's commit once, before its gate, and names it by its id in the gate's paths, the patch and the merge; a branch that moved is merged at the commit read; a branch that does not resolve ends the adoption", async () => {
  const branch = "improve/2026-10-25-1";
  const input = (repo: string, folder: string, run = "2026-10-25-1") => ({
    repo,
    folder,
    record: keptRecord(run),
    provider: claude,
    judgeSystemPrompt: "# Judge\n\nYou decide on evidence.",
  });
  /** The fixture's git with its calls kept, and something done right after a call answers. */
  const recorded = (
    deps: ReturnType<typeof adoptDeps>["deps"],
    after?: (args: string[], cwd: string) => void,
    answer?: (args: string[]) => { status: number; stdout: string; stderr: string } | null,
  ) => {
    const calls: string[][] = [];
    return {
      calls,
      deps: {
        ...deps,
        git: (args: string[], cwd: string) => {
          calls.push(args);
          const out = answer?.(args) ?? deps.git(args, cwd);
          after?.(args, cwd);
          return out;
        },
      },
    };
  };
  const names = (calls: string[][]) => calls.filter((c) => c.some((w) => w.includes(branch)));

  // (a) One read of the branch, first; every call after names the commit that was written.
  const a = adoptionFixture();
  const first = recorded(adoptDeps(holdsJson).deps);
  const out = await adoptRun(input(a.repo, a.folder), first.deps);
  expect(out).toEqual({ released: "0.15.1", reason: null });
  const commit = readFileSync(join(a.folder, "adoption/commit"), "utf8").trim();
  expect(commit).toMatch(/^[0-9a-f]{40}$/);
  expect(first.calls[0]).toEqual(["rev-parse", branch]);
  // After it, the branch is named by the push that deletes it once the release has finished, alone.
  expect(names(first.calls.slice(1))).toEqual([["push", "-q", "origin", "--delete", branch]]);
  expect(first.calls).toContainEqual(["diff", "--name-only", "--no-renames", `main...${commit}`]);
  expect(first.calls).toContainEqual(["diff", `main...${commit}`]);
  expect(first.calls.filter((c) => c[0] === "merge")).toEqual([
    [
      "merge",
      "--no-ff",
      "-q",
      "-m",
      "Adopt improvement run 2026-10-25-1: P-1 (t 0.50 → 0.90)",
      commit,
    ],
  ]);

  // (b) The branch gains a commit right after it was read: what is merged is the commit read.
  const b = adoptionFixture();
  const moved = recorded(adoptDeps(holdsJson).deps, (args, cwd) => {
    if (args[0] !== "rev-parse") return;
    git(cwd, "checkout", "-q", branch);
    writeFileSync(join(cwd, "plugins/core/agents/judge.md"), "# Judge\n\nAfter the read.\n");
    git(cwd, "commit", "-q", "-am", "pushed after the read");
    git(cwd, "checkout", "-q", "main");
  });
  expect((await adoptRun(input(b.repo, b.folder), moved.deps)).released).toBe("0.15.1");
  const read = readFileSync(join(b.folder, "adoption/commit"), "utf8").trim();
  expect(git(b.repo, "rev-parse", branch).trim()).not.toBe(read);
  expect(git(b.repo, "rev-parse", "main^2").trim()).toBe(read);
  expect(readFileSync(join(b.repo, "plugins/core/agents/judge.md"), "utf8")).toBe("# Judge\n");

  // (c) A branch that does not resolve: nothing gated, judged or merged, no adoption file.
  const unresolved = async (
    run: string,
    answer?: (args: string[]) => { status: number; stdout: string; stderr: string } | null,
  ) => {
    const c = adoptionFixture();
    const inner = adoptDeps(holdsJson);
    const kept = recorded(inner.deps, undefined, answer);
    const folder = join(c.repo, "docs/improve", run);
    const ended = await adoptRun(input(c.repo, folder, run), kept.deps);
    expect(ended).toEqual({
      released: null,
      reason: `the branch improve/${run} does not resolve to a commit`,
    });
    expect(inner.seen.log.join("\n")).toContain(
      `adoption of ${run}: the branch improve/${run} does not resolve to a commit`,
    );
    expect(inner.seen.judge).toEqual([]);
    expect(inner.seen.probes).toEqual([]);
    expect(kept.calls.map((x) => x[0])).toEqual(["rev-parse"]);
    expect(existsSync(join(folder, "adoption"))).toBe(false);
  };
  await unresolved("2026-10-25-8");
  // An exit of 0 with a short id is no commit either.
  await unresolved("2026-10-25-1", (args) =>
    args[0] === "rev-parse" ? { status: 0, stdout: "abc1234\n", stderr: "" } : null,
  );
});

test("2026-11-13-002 AC-1 (finding 177): the results sweep leaves a file of a matching name past the age, and a symlink of a matching name that points at a real directory past the age, with its target and the target's content untouched", async () => {
  const world = loopWorld();
  expect(await tick({}, tickDeps(world).deps)).toBe(0);
  const results = join(world.home, "repo", "plugins", "core", "evals", "results");
  mkdirSync(results, { recursive: true });
  const file = join(results, "2026-09-01T00-00-00-000Z-improve-file");
  writeFileSync(file, "a file");
  utimesSync(file, 1, 1);
  // A real directory past the age, outside the results folder, and a link of a matching name to it.
  const target = join(world.home, "kept-elsewhere");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "keep.txt"), "keep");
  utimesSync(target, 1, 1);
  const link = join(results, "2026-09-01T00-00-00-000Z-improve-link");
  symlinkSync(target, link);
  const old = join(results, "2026-09-01T00-00-00-000Z-improve-old");
  mkdirSync(old, { recursive: true });
  utimesSync(old, 1, 1);
  expect(await tick({}, tickDeps(world, { now: "2026-10-25T21:00:00.000Z" }).deps)).toBe(0);
  expect(existsSync(old)).toBe(false);
  expect(readFileSync(file, "utf8")).toBe("a file");
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(readFileSync(join(target, "keep.txt"), "utf8")).toBe("keep");
});

test("2026-11-13-002 AC-3 (finding 177): the loop's two sweeps are one function; an entry whose stat throws is skipped and the sweep goes on, in the temp half (a dangling link on the real file system) and in the results half (a stat that throws for one entry)", () => {
  const tmp = tempDir();
  const results = tempDir();
  const now = new Date("2026-10-25T21:00:00.000Z");
  const oldDir = (dir: string, name: string): string => {
    const path = join(dir, name);
    mkdirSync(path, { recursive: true });
    utimesSync(path, 1, 1);
    return path;
  };
  // The temp half: an old folder on either side of a dangling link by name, whatever order the listing has.
  const before = oldDir(tmp, "improve-hooks-a");
  const dangling = join(tmp, "improve-trees-m");
  symlinkSync(join(tmp, "nowhere"), dangling);
  const after = oldDir(tmp, "improve-trees-z");
  const other = oldDir(tmp, "other-xyz");
  // The results half: three old folders, the middle one vanishing at its stat.
  const first = oldDir(results, "2026-09-01T00-00-00-000Z-improve-a");
  const vanished = oldDir(results, "2026-09-01T00-00-00-000Z-improve-m");
  const last = oldDir(results, "2026-09-01T00-00-00-000Z-improve-z");
  const suite = oldDir(results, "2026-09-01T00-00-00-000Z-suite");
  sweepLeftovers(tmp, results, now, {
    temp: statSync,
    results: (path) => {
      if (path === vanished) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return lstatSync(path);
    },
  });
  expect([before, after].map((p) => existsSync(p))).toEqual([false, false]);
  expect(lstatSync(dangling).isSymbolicLink()).toBe(true);
  expect(existsSync(other)).toBe(true);
  expect([first, last].map((p) => existsSync(p))).toEqual([false, false]);
  expect(existsSync(vanished)).toBe(true);
  expect(existsSync(suite)).toBe(true);
  // With its own stats and folders that do not exist, the sweep does nothing and does not throw.
  sweepLeftovers(join(tmp, "none"), join(results, "none"), now);
});

const probeConfig = {
  provider: "runtime",
  casesPerRun: 2,
  staleDays: 7,
  proposals: 2,
  marketplace: { account: "the-account" },
} as LoopConfig;
const gitOk: TickDeps["git"] = () => ({ status: 0, stdout: "", stderr: "" });

test("2026-11-13-004 AC-32: the probe says whether the release's account gave a token, by the word alone, and bounds its two gh calls", () => {
  const MARK = "ghp_SENTINEL_91c2";
  const probeWith = (token: ReturnType<TickDeps["sh"]>) => {
    const calls: { cmd: string[]; opts: Parameters<TickDeps["sh"]>[1] }[] = [];
    const sh: TickDeps["sh"] = (cmd, opts) => {
      calls.push({ cmd, opts });
      return cmd.join(" ") === "gh auth token -u the-account"
        ? token
        : { status: 0, stdout: "", stderr: "" };
    };
    return { probe: runProbe(probeConfig, "/repo", sh, gitOk), calls };
  };
  const found = probeWith({ status: 0, stdout: `${MARK}\n`, stderr: "" });
  expect(found.probe.releaseToken).toBe("found");
  expect(JSON.stringify(found.probe)).not.toContain("SENTINEL");
  const tokenCall = found.calls.find((c) => c.cmd[2] === "token");
  expect(tokenCall?.opts).toEqual({ cwd: "/repo", quiet: true, timeoutMs: 120_000 });
  expect(found.calls.find((c) => c.cmd.join(" ") === "gh auth status")?.opts.timeoutMs).toBe(
    120_000,
  );
  for (const none of [
    { status: 1, stdout: `${MARK}\n`, stderr: MARK },
    { status: 0, stdout: "\n", stderr: "" },
    { status: 1, stdout: MARK, stderr: "", timedOut: true },
  ]) {
    const { probe } = probeWith(none);
    expect(probe.releaseToken).toBe("missing");
    expect(JSON.stringify(probe)).not.toContain("SENTINEL");
  }
  const printed = (probe: Parameters<typeof printProbe>[0]) => {
    const lines: string[] = [];
    printProbe(probe, "the-account", (l) => lines.push(l));
    return lines;
  };
  expect(printed(found.probe)).toContain("release token (the-account): found");
  expect(printed(found.probe).join("\n")).not.toContain("SENTINEL");
  expect(printed({ ...found.probe, releaseToken: "missing" })).toContain(
    "release token (the-account): missing",
  );
  const { releaseToken: _, ...older } = found.probe;
  expect(printed(older)).toContain("release token (the-account): not probed");
});

test("2026-11-13-004 AC-32: a tick probes again when the probe file is absent, does not parse or has no release token, and runs no probe over a complete one", async () => {
  const world = loopWorld();
  const file = join(world.home, "probe.json");
  // Dry runs of a loop that is not paused: since 2026-11-13-005 a paused loop probes only when
  // it has no probe, and a dry run runs the probe and nothing after it.
  const probed = async (hour: number) => {
    const at = tickDeps(world, { now: `2026-10-25T${hour}:00:00.000Z`, releaseToken: true });
    expect(await tick({ dryRun: true }, at.deps)).toBe(0);
    return at.seen.sh.filter((c) => c[0] === "gh").map((c) => c.join(" "));
  };
  const both = ["gh auth status", "gh auth token -u andreagroferreira"];
  expect(await probed(10)).toEqual(both);
  const complete = JSON.parse(readFileSync(file, "utf8"));
  expect(complete.releaseToken).toBe("found");
  expect(readFileSync(file, "utf8")).not.toContain("a-token");
  // A complete file: no probe.
  expect(await probed(11)).toEqual([]);
  // A file an older loop wrote, with no field.
  const { releaseToken: _, ...older } = complete;
  writeFileSync(file, JSON.stringify(older));
  expect(await probed(12)).toEqual(both);
  expect(JSON.parse(readFileSync(file, "utf8")).releaseToken).toBe("found");
  // A file that does not parse.
  writeFileSync(file, "{not json");
  expect(await probed(13)).toEqual(both);
  expect(JSON.parse(readFileSync(file, "utf8")).releaseToken).toBe("found");
});

test("2026-11-13-004 AC-32: a resume that reports its own step, as one refused for a missing token does, stays pending at that step", async () => {
  // Green before this item's code: the loop's branch for a pending outcome is not changed for it.
  const world = loopWorld();
  expect(await tick({}, tickDeps(world).deps)).toBe(0);
  const stateFile = join(world.home, "state.json");
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  writeFileSync(
    stateFile,
    JSON.stringify({
      ...state,
      pendingRelease: { version: "0.15.1", failedStep: 9, failedName: "the marketplace entry" },
    }),
  );
  const at = tickDeps(world, { now: "2026-10-25T21:00:00.000Z", resumeFails: 9 });
  await tick({}, at.deps);
  expect(at.seen.fromSteps).toEqual([9]);
  expect(JSON.parse(readFileSync(stateFile, "utf8")).pendingRelease).toEqual({
    version: "0.15.1",
    failedStep: 9,
    failedName: "the marketplace entry",
  });
});

test("2026-11-13-004 AC-53: a pending release that is not confirmed on origin holds its version at step 7 and takes this run's adoption back, so nothing unreleased reaches origin", async () => {
  for (const unconfirmed of ["rule-3", "unknown"] as const) {
    const world = loopWorld();
    const at = tickDeps(world, { kept: true, unconfirmed });
    expect(await tick({}, at.deps)).toBe(0);
    const repo = join(world.home, "repo");
    const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
    expect(state.pendingRelease).toEqual({
      version: "0.15.1",
      failedStep: 7,
      failedName: "the tarball",
    });
    expect(state.day.failures).toEqual([{ run: "2026-10-25-1", step: 7, name: "the tarball" }]);
    expect(at.seen.log.join("\n")).toContain(
      "release 0.15.1 is held pending at step 7 and is not confirmed on origin: this run's adoption waits",
    );
    const { before, merge, ruling, release: released } = at.seen.heads;
    const reached = (hash: string | undefined, of: string, ref: string) =>
      spawnSync("git", ["merge-base", "--is-ancestor", hash as string, ref], { cwd: of }).status ===
      0;
    // The clone's main is back on the head before the merge, with the ruling committed again on it.
    expect(reached(before, repo, "main")).toBe(true);
    for (const hash of [merge, ruling, ...(unconfirmed === "unknown" ? [released] : [])]) {
      expect(hash).toMatch(/^[0-9a-f]{40}$/);
      expect(reached(hash, repo, "main")).toBe(false);
      expect(reached(hash, world.origin, "main")).toBe(false);
    }
    expect(git(world.origin, "ls-tree", "-r", "--name-only", "main")).toContain(
      "docs/improve/2026-10-25-1/adoption/ruling.md",
    );
    expect(git(world.origin, "log", "--format=%s", "main")).not.toContain("Release 0.15.1");
    expect(git(world.origin, "branch", "--list", "improve/2026-10-25-1").trim()).toBe(
      "improve/2026-10-25-1",
    );
    // The next tick resumes the pending version from step 7.
    const next = tickDeps(world, { now: "2026-10-25T21:00:00.000Z" });
    await tick({}, next.deps);
    expect(next.seen.fromSteps).toEqual([7]);
  }
});

test("2026-11-13-004 AC-53: when the unknown push did land, the tick's push adds the day's report alone, and a pending release that is confirmed keeps the merge as before", async () => {
  const world = loopWorld();
  const at = tickDeps(world, { kept: true, unconfirmed: "landed" });
  expect(await tick({}, at.deps)).toBe(0);
  const landed = at.seen.heads.origin as string;
  const head = git(world.origin, "rev-parse", "main").trim();
  expect(
    spawnSync("git", ["merge-base", "--is-ancestor", landed, "main"], { cwd: world.origin }).status,
  ).toBe(0);
  const added = git(world.origin, "diff", "--name-only", `${landed}..main`).trim().split("\n");
  expect(added.length).toBeGreaterThan(0);
  for (const path of added) expect(path).toStartWith("docs/improve/");
  expect(git(world.origin, "rev-list", "--count", `${landed}..main`).trim()).toBe("1");
  expect(git(world.origin, "log", "-1", "--format=%s", head).trim()).toBe(
    "Improvement run 2026-10-25-1: the day's report",
  );
  // The merge and the release's commit are in origin's history once, as the push left them.
  const subjects = git(world.origin, "log", "--format=%s", "main").split("\n");
  expect(subjects.filter((s) => s.startsWith("Release 0.15.1")).length).toBe(1);
  expect(subjects.filter((s) => s.startsWith("Adopt improvement run")).length).toBe(1);
  expect(JSON.parse(readFileSync(join(world.home, "state.json"), "utf8")).pendingRelease).toEqual({
    version: "0.15.1",
    failedStep: 7,
    failedName: "the tarball",
  });
  const next = tickDeps(world, { now: "2026-10-25T21:00:00.000Z" });
  await tick({}, next.deps);
  expect(next.seen.fromSteps).toEqual([7]);
  // A pending outcome that says nothing of origin: the merge went out with the release's push, and stays.
  const confirmed = loopWorld();
  const failed = tickDeps(confirmed, { kept: true, releaseCode: 1 });
  expect(await tick({}, failed.deps)).toBe(0);
  expect(git(join(confirmed.home, "repo"), "log", "--format=%s", "main")).toContain(
    "Adopt improvement run",
  );
  expect(failed.seen.log.join("\n")).not.toContain("is not confirmed on origin");
});

test("2026-11-13-004 AC-52: stop kills the command of the stopped tick's release after its signal to the tick, on each turn of its wait, and signals the tick alone when there is none", async () => {
  const world = loopWorld();
  mkdirSync(world.home, { recursive: true });
  writeFileSync(join(world.home, "config.json"), JSON.stringify({ provider: "runtime" }));
  const lock = { pid: 4242, startedAt: "2026-10-28T02:00:00.000Z", boot: "boot-1" };
  const stop = async (options: Parameters<typeof stopDeps>[1]) => {
    writeFileSync(join(world.home, "lock.json"), JSON.stringify(lock));
    const d = stopDeps(world, options);
    await stopLoop(d.deps);
    return d;
  };
  // The tick's release waits on a command: its group is killed, after the tick's own signal.
  const running = await stop({ leftCommands: [777] });
  expect(running.kills).toEqual([
    { pid: -4242, signal: "SIGTERM" },
    { pid: -777, signal: "SIGKILL" },
  ]);
  expect(running.asked[0]).toEqual({ root: join(world.home, "repo"), startedBy: 4242 });
  // No command of that tick's release: the tick alone.
  const idle = await stop({});
  expect(idle.kills).toEqual([{ pid: -4242, signal: "SIGTERM" }]);
  expect(idle.asked.length).toBeGreaterThan(0);
  // Caught between two commands: the next one is killed on a later turn of the wait.
  const between = await stop({ leftCommands: [null, null, 888], ends: false });
  expect(between.kills).toEqual([
    { pid: -4242, signal: "SIGTERM" },
    { pid: -888, signal: "SIGKILL" },
  ]);
  expect(between.asked.length).toBeGreaterThan(2);
});

test("2026-11-13-004 AC-57: a tick probes again while the probe says the release's token is missing, so the word follows a login", async () => {
  const world = loopWorld();
  const file = join(world.home, "probe.json");
  // Dry runs of a loop that is not paused: since 2026-11-13-005 a paused loop probes only when
  // it has no probe, and a dry run runs the probe and nothing after it.
  const probed = async (hour: number, releaseToken: boolean) => {
    const at = tickDeps(world, { now: `2026-10-25T${hour}:00:00.000Z`, releaseToken });
    expect(await tick({ dryRun: true }, at.deps)).toBe(0);
    return {
      gh: at.seen.sh.filter((c) => c[0] === "gh").length,
      word: JSON.parse(readFileSync(file, "utf8")).releaseToken,
    };
  };
  expect(await probed(10, false)).toEqual({ gh: 2, word: "missing" });
  // Still logged out: probed again, the word stays.
  expect(await probed(11, false)).toEqual({ gh: 2, word: "missing" });
  // Logged in since: the next tick's probe says so, and the one after runs none.
  expect(await probed(12, true)).toEqual({ gh: 2, word: "found" });
  expect(await probed(13, true)).toEqual({ gh: 0, word: "found" });
});

test("2026-11-13-004 AC-57: install and uninstall kill the command of the tick they end, after ending it, and nothing when no tick's release left one", async () => {
  const base = tempDir("ended-");
  const home = join(base, "crew-improve");
  mkdirSync(home, { recursive: true });
  const lock = { pid: 4242, startedAt: "2026-10-28T02:00:00.000Z", boot: "boot-1" };
  writeFileSync(join(home, "lock.json"), JSON.stringify(lock));
  const down = installDeps(home, null, { leftCommand: 777 });
  expect(await uninstall(down.deps)).toBe(0);
  expect(down.asked).toEqual([{ root: join(home, "repo"), startedBy: 4242 }]);
  expect(down.kills).toEqual([777]);
  // Afterwards: the tick is ended first, so it cannot start another command.
  expect(down.seen.map((c) => c.slice(0, 2).join(" "))).toEqual([
    "launchctl bootout",
    "kill group 777",
  ]);
  // No command left by that tick: nothing is signalled.
  const idle = installDeps(home, null);
  expect(await uninstall(idle.deps)).toBe(0);
  expect(idle.kills).toEqual([]);
  // No lock: no tick to have left one, so nothing is asked.
  rmSync(join(home, "lock.json"));
  const none = installDeps(home, null, { leftCommand: 777 });
  expect(await uninstall(none.deps)).toBe(0);
  expect(none.asked).toEqual([]);
  expect(none.kills).toEqual([]);
  // The install's kickstart ends a running tick too.
  const again = join(base, "crew-improve-2");
  mkdirSync(again, { recursive: true });
  writeFileSync(join(again, "lock.json"), JSON.stringify(lock));
  const up = installDeps(
    again,
    {
      loggedIn: true,
      authMethod: "claude.ai",
      github: "a",
      remote: "ok",
      push: "ok",
      keychain: {},
    },
    { leftCommand: 888 },
  );
  expect(await install({ cloneFrom: loopSeed() }, up.deps)).toBe(0);
  // Asked twice since 2026-11-13-005: after the bootout, before the install writes in the clone,
  // and after the kickstart, for a tick the load started.
  const askedOnce = { root: join(again, "repo"), startedBy: 4242 };
  expect(up.asked).toEqual([askedOnce, askedOnce]);
  expect(up.kills).toEqual([888, 888]);
  const order = up.seen.map((c) => c.slice(0, 2).join(" "));
  expect(order.indexOf("kill group 888")).toBeGreaterThan(order.indexOf("launchctl bootout"));
  expect(order.lastIndexOf("kill group 888")).toBeGreaterThan(order.indexOf("launchctl kickstart"));
});

test("2026-11-13-005 AC-48: a baseline that errored once is not measured, one that errors twice running is, and a probe's error changes nothing", async () => {
  type Rec = Parameters<typeof lastMeasuredOf>[0][number];
  const rec = (
    at: string,
    baseline: Record<string, unknown>,
    probe?: Record<string, unknown>,
  ): Rec =>
    ({
      run: at,
      at,
      baseline,
      proposals: probe ? [{ id: "P-1", probe }] : [],
    }) as unknown as Rec;
  const bad = { ...figures(0), errored: true };
  const good = figures(0.5);
  const [d1, d2, d3] = [
    "2026-10-25T10:00:00.000Z",
    "2026-10-26T10:00:00.000Z",
    "2026-10-27T10:00:00.000Z",
  ] as [string, string, string];
  // One error: the case is not measured, the one beside it is.
  expect(lastMeasuredOf([rec(d1, { t: bad, u: good })], ["t", "u"])).toEqual({ t: null, u: d1 });
  // Two errors running, given out of time order: measured at the second's time.
  expect(lastMeasuredOf([rec(d2, { t: bad }), rec(d1, { t: bad })], ["t"])).toEqual({ t: d2 });
  // An error after a good record is a first error again.
  expect(
    lastMeasuredOf([rec(d3, { t: bad }), rec(d1, { t: bad }), rec(d2, { t: good })], ["t"]),
  ).toEqual({ t: d2 });
  // A good baseline with an errored probe measures the case.
  expect(lastMeasuredOf([rec(d1, { t: good }, { t: bad })], ["t"])).toEqual({ t: d1 });
  // An errored baseline with a good probe, first error: nothing of that record counts for the case.
  expect(lastMeasuredOf([rec(d1, { t: bad }, { t: good })], ["t"])).toEqual({ t: null });
  // A record with no baseline for the case between two errors counts, and the second error is the second running.
  expect(lastMeasuredOf([rec(d1, { t: bad }), rec(d2, { u: good }, { t: good })], ["t"])).toEqual({
    t: d2,
  });
  expect(
    lastMeasuredOf(
      [rec(d1, { t: bad }), rec(d2, { u: good }, { t: good }), rec(d3, { t: bad })],
      ["t"],
    ),
  ).toEqual({ t: d3 });
  // A baseline with no errored field reads as not errored.
  expect(lastMeasuredOf([rec(d1, { t: { mean: 0.5, runs: [] } })], ["t"])).toEqual({ t: d1 });

  // A tick over a record whose baseline for t errored: t is still never measured, and due for it.
  const world = loopWorld();
  expect(await tick({}, tickDeps(world, { baselineErrored: "t" }).deps)).toBe(0);
  const next = tickDeps(world, { now: "2026-10-25T23:00:00.000Z" });
  expect(await tick({}, next.deps)).toBe(0);
  const log = next.seen.log.join("\n");
  expect(log).toContain("due: case t never measured");
  expect(next.seen.improve).toEqual([{ cases: ["t", "u"], provider: "runtime" }]);
});

const packagesOf = (seen: { sh: string[][] }) =>
  seen.sh.filter((c) => c[0] === "bun" && c[1] === "install").length;
const shellsOf = (seen: { sh: string[][] }) => seen.sh.filter((c) => c[0] === "env").length;

test("2026-11-13-005 AC-37: a tick installs the packages after its sync at every tick and never the shell there; a failed install is tried again by the next tick", async () => {
  const world = loopWorld();
  // The tick that makes the clone, as a dry run: the packages, no shell.
  const making = tickDeps(world);
  expect(await tick({ dryRun: true }, making.deps)).toBe(0);
  expect(packagesOf(making.seen)).toBe(1);
  expect(shellsOf(making.seen)).toBe(0);
  const ran = tickDeps(world);
  expect(await tick({}, ran.deps)).toBe(0);
  expect(packagesOf(ran.seen)).toBe(1);
  // Origin did not move and the tick is not due: the packages all the same, no shell.
  const idle = tickDeps(world);
  expect(await tick({}, idle.deps)).toBe(0);
  expect(idle.seen.log.join("\n")).toContain("not due:");
  expect(packagesOf(idle.seen)).toBe(1);
  expect(shellsOf(idle.seen)).toBe(0);
  // A new lockfile on origin and an install that fails: the tick fails.
  moveOrigin(world, "bun.lock", "lock 2\n");
  const failing = tickDeps(world, { packagesFail: true });
  expect(await tick({}, failing.deps)).toBe(1);
  expect(failing.seen.log.join("\n")).toContain("bun install failed: the registry is away");
  expect(shellsOf(failing.seen)).toBe(0);
  // The next tick sees no change of the lockfile, and installs again.
  const again = tickDeps(world, { now: "2026-10-25T20:30:00.000Z" });
  expect(await tick({}, again.deps)).toBe(0);
  expect(packagesOf(again.seen)).toBe(1);
  expect(shellsOf(again.seen)).toBe(0);
  // bootstrapClone, as the install runs it: the packages, then the shell.
  const calls: string[] = [];
  const fake = ((argv: string[]) => {
    calls.push(argv[0] as string);
    return { status: 0, stdout: "", stderr: "" };
  }) as never;
  expect(bootstrapClone("/r", fake)).toBeNull();
  expect(calls).toEqual(["bun", "env"]);
});

test("2026-11-13-005 AC-38: a due tick runs the shell's install before its run, with the build there or not; a failed install fails the tick before the run and the next due tick installs again", async () => {
  const world = loopWorld();
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  expect(shellsOf(first.seen)).toBe(1);
  const repo = join(world.home, "repo");
  expect(
    existsSync(
      join(
        repo,
        "node_modules/.cache/ms-playwright/chromium_headless_shell-1/INSTALLATION_COMPLETE",
      ),
    ),
  ).toBe(true);
  let edition = 1;
  const moveText = () => {
    edition += 1;
    moveOrigin(world, "plugins/core/skills/crew/SKILL.md", `# Crew\n\nRule ${edition}.\n`);
  };
  // Due again, the finished build there: the install runs all the same, and then the run.
  moveText();
  const second = tickDeps(world, { now: "2026-10-25T21:00:00.000Z" });
  expect(await tick({}, second.deps)).toBe(0);
  expect(shellsOf(second.seen)).toBe(1);
  expect(second.seen.improve.length).toBe(1);
  // A dry run installs no shell.
  moveText();
  const dry = tickDeps(world, { now: "2026-10-25T22:00:00.000Z" });
  expect(await tick({ dryRun: true }, dry.deps)).toBe(0);
  expect(shellsOf(dry.seen)).toBe(0);
  // The install fails: no run; the next due tick, past the back-off, installs again.
  const failing = tickDeps(world, { now: "2026-10-25T22:00:00.000Z", shellInstallFails: true });
  expect(await tick({}, failing.deps)).toBe(1);
  expect(failing.seen.improve).toEqual([]);
  const later = tickDeps(world, { now: "2026-10-26T02:00:00.000Z" });
  expect(await tick({}, later.deps)).toBe(0);
  expect(shellsOf(later.seen)).toBe(1);
  expect(later.seen.improve.length).toBe(1);
});

test("2026-11-13-005 AC-39: the packages' install carries 5 minutes and the shell's 15, and one killed at its bound is the bootstrap's error", async () => {
  const world = loopWorld();
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  const boundOfPlayed = (head: string) =>
    first.seen.shOptions.find((c) => c.cmd[0] === head && c.cmd.includes("install"))?.timeoutMs;
  expect(boundOfPlayed("bun")).toBe(300_000);
  expect(boundOfPlayed("env")).toBe(900_000);
  const hung = (head: string) =>
    ((argv: string[]) =>
      argv[0] === head
        ? { status: 1, stdout: "", stderr: "", timedOut: true }
        : { status: 0, stdout: "", stderr: "" }) as never;
  expect(bootstrapClone("/r", hung("bun"))).toBe("bun install timed out after 300 s");
  expect(bootstrapClone("/r", hung("env"))).toBe(
    "the headless shell's install timed out after 900 s",
  );
  moveOrigin(world, "plugins/core/skills/crew/SKILL.md", "# Crew\n\nRule 9.\n");
  const hanging = tickDeps(world, { now: "2026-10-25T21:00:00.000Z", shellInstall: "hangs" });
  expect(await tick({}, hanging.deps)).toBe(1);
  expect(hanging.seen.log.join("\n")).toContain(
    "the headless shell's install timed out after 900 s",
  );
  expect(hanging.seen.improve).toEqual([]);
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(typeof state.backoffUntil).toBe("string");
});

/** A runner that records what it is asked and answers by a rule. */
function recordingRunner(
  answer: (
    cmd: readonly string[],
    cwd: string,
  ) => Partial<ReturnType<ReturnType<typeof spawnRunner>>> = () => ({}),
) {
  const calls: {
    cmd: string[];
    cwd: string;
    timeoutMs?: number;
    env?: Record<string, string>;
    commandFile?: string;
  }[] = [];
  const run = ((cmd, opts) => {
    calls.push({
      cmd: [...cmd],
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs,
      env: opts.env,
      commandFile: opts.commandFile,
    });
    return { status: 0, exit: 0, stdout: "", stderr: "", ...answer(cmd, opts.cwd) };
  }) as ReturnType<typeof spawnRunner>;
  return { run, calls };
}

test("2026-11-13-005 AC-41: the loop's git carries the release's bounds and asks no terminal, its ssh command read per folder", () => {
  expect(boundOf(["git", "clone", "-q", "u", "r"])).toBe(300_000);
  expect(boundOf(["git", "status"])).toBe(120_000);
  const sshAsked = (c: { cmd: string[] }) => c.cmd.join(" ") === "git config --get core.sshCommand";
  // No ssh command anywhere: batch mode on plain ssh, read once for the folder.
  const plain = recordingRunner((cmd) => (cmd[1] === "config" ? { status: 1, exit: 1 } : {}));
  const bounded = loopCommands(plain.run, {}).git;
  for (const first of ["clone", "fetch", "ls-remote", "push"]) bounded([first, "x"], "/a");
  bounded(["rev-parse", "HEAD"], "/a");
  const asked = plain.calls.filter((c) => !sshAsked(c));
  expect(asked.map((c) => c.timeoutMs)).toEqual([300_000, 300_000, 300_000, 300_000, 120_000]);
  for (const c of asked)
    expect(c.env).toEqual({ GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes" });
  expect(plain.calls.filter(sshAsked).map((c) => [c.cwd, c.timeoutMs])).toEqual([["/a", 120_000]]);
  // Two folders whose configurations name different commands: each its own, each read once.
  const two = recordingRunner((cmd, cwd) =>
    cmd[1] === "config" ? { stdout: cwd === "/a" ? "ssh -i a\n" : "ssh -i b\n" } : {},
  );
  const perFolder = loopCommands(two.run, {}).git;
  for (const cwd of ["/a", "/b", "/a", "/b"]) perFolder(["fetch"], cwd);
  expect(two.calls.filter((c) => !sshAsked(c)).map((c) => c.env?.GIT_SSH_COMMAND)).toEqual([
    "ssh -i a -o BatchMode=yes",
    "ssh -i b -o BatchMode=yes",
    "ssh -i a -o BatchMode=yes",
    "ssh -i b -o BatchMode=yes",
  ]);
  expect(two.calls.filter(sshAsked).map((c) => c.cwd)).toEqual(["/a", "/b"]);
  // The environment names one: it is left, and no configuration is read.
  const own = recordingRunner();
  loopCommands(own.run, { GIT_SSH_COMMAND: "ssh -i mine" }).git(["fetch"], "/a");
  expect(own.calls.map((c) => c.cmd[1])).toEqual(["fetch"]);
  expect(own.calls[0]?.env).toEqual({ GIT_TERMINAL_PROMPT: "0" });
  // A command killed at its bound: a failed result that says so first.
  const hung = recordingRunner((cmd) =>
    cmd[1] === "fetch" ? { status: 1, exit: null, stderr: "partial", timedOut: true } : {},
  );
  const result = loopCommands(hung.run, { GIT_SSH_COMMAND: "x" }).git(["fetch"], "/a");
  expect(result.status).toBe(1);
  expect(result.stderr.startsWith("timed out after 300 s")).toBe(true);
  expect(result.stderr).toContain("partial");
  // The real deps of a tick, on a real git: no prompt of git's.
  const base = tempDir("real-git-");
  const repo = join(base, "r");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  const home = join(base, "home");
  mkdirSync(home);
  const real = realTickDeps(home, readConfig(home));
  const printed = real.git(["-c", "alias.p=!printenv GIT_TERMINAL_PROMPT", "p"], repo);
  expect(printed.stdout.trim()).toBe("0");
});

test("2026-11-13-005 AC-41: a clone is made beside its place and moved when whole, in the tick and in the install; a timed-out command of the fast-forward names its lock", async () => {
  const cloneOf = (gits: { args: string[] }[]) => gits.find((g) => g.args[0] === "clone")?.args;
  // The tick: the clone's target, and the finished clone at its place.
  const world = loopWorld();
  const repo = join(world.home, "repo");
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  expect(cloneOf(first.seen.git)?.at(-1)).toBe(`${repo}.cloning`);
  expect(existsSync(join(repo, ".git"))).toBe(true);
  expect(existsSync(`${repo}.cloning`)).toBe(false);
  // A clone that fails leaves neither folder.
  const failing = loopWorld();
  const failed = tickDeps(failing, { cloneFails: true });
  expect(await tick({}, failed.deps)).toBe(1);
  expect(failed.seen.log.join("\n")).toContain("git clone failed: fatal: the remote hung up");
  expect(existsSync(join(failing.home, "repo"))).toBe(false);
  expect(existsSync(join(failing.home, "repo.cloning"))).toBe(false);
  // A folder an earlier clone left is removed first.
  const stale = loopWorld();
  mkdirSync(join(stale.home, "repo.cloning"), { recursive: true });
  writeFileSync(join(stale.home, "repo.cloning", "old"), "");
  expect(await tick({}, tickDeps(stale).deps)).toBe(0);
  expect(existsSync(join(stale.home, "repo", "old"))).toBe(false);
  expect(existsSync(join(stale.home, "repo.cloning"))).toBe(false);
  // Something that is no clone at the clone's place stays, and the error names it.
  const blocked = loopWorld();
  mkdirSync(join(blocked.home, "repo"), { recursive: true });
  writeFileSync(join(blocked.home, "repo", "keep"), "mine");
  const inTheWay = tickDeps(blocked);
  expect(await tick({}, inTheWay.deps)).toBe(1);
  expect(inTheWay.seen.log.join("\n")).toContain(`${join(blocked.home, "repo")} is in the way`);
  expect(readFileSync(join(blocked.home, "repo", "keep"), "utf8")).toBe("mine");
  expect(existsSync(join(blocked.home, "repo.cloning"))).toBe(false);
  // The install: the same target, and a failed clone leaves neither folder.
  const base = tempDir("install-clone-");
  const home = join(base, "crew-improve");
  const ok = installDeps(home, {
    loggedIn: true,
    authMethod: "claude.ai",
    github: "someone",
    remote: "ok",
    push: "ok",
    keychain: {},
  });
  expect(await install({ cloneFrom: loopSeed() }, ok.deps)).toBe(0);
  expect(cloneOf(ok.gits)?.at(-1)).toBe(`${join(home, "repo")}.cloning`);
  expect(existsSync(join(home, "repo", ".git"))).toBe(true);
  const home2 = join(tempDir("install-clone-"), "crew-improve");
  const bad = installDeps(home2, null, { cloneFails: true });
  expect(await install({ cloneFrom: loopSeed() }, bad.deps)).toBe(1);
  expect(bad.log.join("\n")).toContain("the clone failed: fatal: the remote hung up");
  expect(existsSync(join(home2, "repo"))).toBe(false);
  expect(existsSync(join(home2, "repo.cloning"))).toBe(false);
  // The fast-forward of the user's checkout: a merge killed at its bound is said with the lock's path.
  const ff = loopWorld();
  const hanging = tickDeps(ff, { userMergeHangs: true });
  expect(await tick({}, hanging.deps)).toBe(0);
  expect(hanging.seen.log.join("\n")).toContain(
    `the user's checkout: git merge timed out after 120 s; if git then says a lock exists, remove ${join(ff.user, ".git", "index.lock")}`,
  );
});

test("2026-11-13-005 AC-42: every command of the loop's real deps has a bound: two minutes when its call names none", () => {
  const home = join(tempDir("bounds-"), "home");
  mkdirSync(home, { recursive: true });
  const boundsOf = (calls: { cmd: string[]; timeoutMs?: number }[]) =>
    calls.map((c) => [c.cmd[0], c.timeoutMs]);
  const t = recordingRunner();
  const tickReal = realTickDeps(home, readConfig(home), t.run);
  tickReal.sh(["claude", "auth", "status"], { cwd: home });
  tickReal.sh(["gh", "auth", "status"], { cwd: home, timeoutMs: 5000 });
  tickReal.readSecret("an-account");
  tickReal.boot();
  expect(boundsOf(t.calls)).toEqual([
    ["claude", 120_000],
    ["gh", 5000],
    [secretReadCommand("an-account")[0] as string, 120_000],
    ["/usr/sbin/sysctl", 120_000],
  ]);
  const i = recordingRunner();
  realInstallDeps(home, i.run).sh(["launchctl", "print", "x"], { cwd: home });
  expect(boundsOf(i.calls)).toEqual([["launchctl", 120_000]]);
  const st = recordingRunner();
  const stop = realStopDeps(home, st.run);
  stop.sh(["ps", "-o", "command=", "-p", "1"], { cwd: home });
  stop.boot();
  expect(boundsOf(st.calls)).toEqual([
    ["ps", 120_000],
    ["/usr/sbin/sysctl", 120_000],
  ]);
});

const sleepMs = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const lstartOf = (pid: number) => processStart(pid);
const alivePid = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

test("2026-11-13-005 AC-49: a tick's commands carry the home's command file, and the other commands of the loop none", async () => {
  const base = tempDir("tick-file-");
  const home = join(base, "home");
  mkdirSync(home, { recursive: true });
  const file = join(home, TICK_COMMAND_FILE);
  // The wrapper over a recording runner: the file on every command, the configuration's read among them.
  const withFile = recordingRunner();
  const filed = loopCommands(withFile.run, {}, file);
  filed.sh(["true"], { cwd: home });
  filed.git(["status"], home);
  expect(withFile.calls.map((c) => c.commandFile)).toEqual([file, file, file]);
  const without = recordingRunner();
  const bare = loopCommands(without.run, {});
  bare.sh(["true"], { cwd: home });
  bare.git(["status"], home);
  expect(without.calls.map((c) => c.commandFile)).toEqual([undefined, undefined, undefined]);
  // The real deps of a tick: a command reads its own file, four lines naming it and this process; the file goes with the command.
  const real = realTickDeps(home, readConfig(home));
  const lines = real.sh(["cat", file], { cwd: home }).stdout.trim().split("\n");
  expect(lines.length).toBe(4);
  expect(lines[2]).toBe(String(process.pid));
  expect(existsSync(file)).toBe(false);
  // The boot time's read, before the lock: a bound and no file.
  const boots = recordingRunner();
  realTickDeps(home, readConfig(home), boots.run).boot();
  expect(boots.calls.map((c) => [c.timeoutMs, c.commandFile])).toEqual([[120_000, undefined]]);
  // The install's, the uninstall's, the status's and the stop's: none, unless the install names its own.
  const i = recordingRunner();
  realInstallDeps(home, i.run).sh(["true"], { cwd: home });
  const st = recordingRunner();
  realStopDeps(home, st.run).sh(["true"], { cwd: home });
  expect([...i.calls, ...st.calls].map((c) => c.commandFile)).toEqual([undefined, undefined]);
  const named = recordingRunner();
  realInstallDeps(home, named.run, join(home, INSTALL_COMMAND_FILE)).sh(["true"], { cwd: home });
  expect(named.calls[0]?.commandFile).toBe(join(home, INSTALL_COMMAND_FILE));
  // A file that stands at the tick's place is left as it was by a command of the stop and of the status.
  writeFileSync(file, "a tick's record\n");
  realStopDeps(home, spawnRunner(false)).sh(["true"], { cwd: home });
  realInstallDeps(home, spawnRunner(false)).sh(["true"], { cwd: home });
  expect(readFileSync(file, "utf8")).toBe("a tick's record\n");
  rmSync(file);

  // A real command of a tick-like process, ended through the home's file by who is not its parent.
  const driver = join(base, "driver.ts");
  writeFileSync(
    driver,
    [
      `import { loopCommands } from ${JSON.stringify(join(import.meta.dir, "../../../scripts/improve-loop.ts"))};`,
      `import { spawnRunner } from ${JSON.stringify(join(import.meta.dir, "../../../scripts/release.ts"))};`,
      `const r = loopCommands(spawnRunner(false), {}, ${JSON.stringify(file)}).sh(["sleep", "30"], { cwd: ${JSON.stringify(home)} });`,
      'console.log("status " + r.status);',
    ].join("\n"),
  );
  const child = spawn("bun", [driver], { env: childEnv(), stdio: ["ignore", "pipe", "ignore"] });
  let out = "";
  child.stdout.on("data", (chunk) => {
    out += String(chunk);
  });
  const ended = new Promise<void>((resolve) => child.on("close", () => resolve()));
  for (let waited = 0; waited < 100 && !existsSync(file); waited++) await sleepMs(50);
  expect(existsSync(file)).toBe(true);
  expect(leftCommand(home, {}, 999_999, TICK_COMMAND_FILE)).toBeNull();
  const group = leftCommand(home, {}, child.pid as number, TICK_COMMAND_FILE) as number;
  expect(typeof group).toBe("number");
  process.kill(-group, "SIGTERM");
  await ended;
  expect(out).not.toContain("status 0");
  expect(out).toContain("status ");
  expect(alivePid(group)).toBe(false);
}, 30_000);

test("2026-11-13-005 AC-49: stop signals the tick's own command once; the install, the uninstall and a tick over a stale lock kill what the tick they end left; a stop that lands on a tick ends it with no failure", async () => {
  const world = loopWorld();
  mkdirSync(world.home, { recursive: true });
  const lock = { pid: 4242, startedAt: "2026-10-28T02:00:00.000Z", boot: "boot-1" };
  // stop: one SIGTERM to the tick's own command over several turns, the release's killed on each.
  writeFileSync(join(world.home, "lock.json"), JSON.stringify(lock));
  const stopping = stopDeps(world, { tickCommand: 777, leftCommands: [888, 888], ends: false });
  await stopLoop(stopping.deps);
  expect(stopping.kills.filter((k) => k.pid === -777)).toEqual([{ pid: -777, signal: "SIGTERM" }]);
  expect(stopping.kills.filter((k) => k.pid === -888)).toEqual([
    { pid: -888, signal: "SIGKILL" },
    { pid: -888, signal: "SIGKILL" },
  ]);
  expect(stopping.ownAsked()).toBe(1);
  writeFileSync(join(world.home, "lock.json"), JSON.stringify(lock));
  const idle = stopDeps(world, {});
  await stopLoop(idle.deps);
  expect(idle.kills).toEqual([{ pid: -4242, signal: "SIGTERM" }]);
  // The uninstall and the install's bootout: the command of the tick the lock named, by the home's file.
  writeFileSync(join(world.home, "lock.json"), JSON.stringify(lock));
  const down = installDeps(world.home, null, { tickCommand: 901 });
  expect(await uninstall(down.deps)).toBe(0);
  expect(down.kills).toContain(901);
  rmSync(join(world.home, "lock.json"), { force: true });
  const none = installDeps(world.home, null, { tickCommand: 901 });
  expect(await uninstall(none.deps)).toBe(0);
  expect(none.kills).toEqual([]);

  // A tick over a stale lock: the dead tick's command killed before any command of this tick.
  const stale = loopWorld();
  expect(await tick({}, tickDeps(stale).deps)).toBe(0);
  const dead = { pid: 31_337, startedAt: "2026-10-25T20:10:00.000Z", boot: "boot-1" };
  writeFileSync(join(stale.home, "lock.json"), JSON.stringify(dead));
  const own = tickDeps(stale, { now: "2026-10-25T20:30:00.000Z", tickCommand: 555 });
  expect(await tick({}, own.deps)).toBe(0);
  expect(own.seen.kills).toEqual([{ group: 555, after: 0 }]);
  expect(own.seen.log.join("\n")).toContain(
    "the command the dead tick left running was killed (pid 555)",
  );
  writeFileSync(join(stale.home, "lock.json"), JSON.stringify(dead));
  const release = tickDeps(stale, { now: "2026-10-25T20:40:00.000Z", leftCommand: 556 });
  expect(await tick({}, release.deps)).toBe(0);
  expect(release.seen.kills).toEqual([{ group: 556, after: 0 }]);

  // A stop that lands on a due tick before the shell's install: nothing run, the marker left.
  const stopped = loopWorld();
  const during = tickDeps(stopped, { stopMarker: "during" });
  expect(await tick({}, during.deps)).toBe(0);
  expect(shellsOf(during.seen)).toBe(0);
  expect(during.seen.improve).toEqual([]);
  expect(during.seen.log.join("\n")).toContain("stop requested: nothing run");
  expect(existsSync(join(stopped.home, "stop.json"))).toBe(true);
  // A stop that lands during the shell's install: the tick ends, and it is no failed tick.
  const landed = loopWorld();
  const atInstall = tickDeps(landed, { stopMarker: "at the install" });
  expect(await tick({}, atInstall.deps)).toBe(0);
  expect(atInstall.seen.improve).toEqual([]);
  expect(atInstall.seen.log.join("\n")).toContain("stop requested: the tick ends");
  const state = JSON.parse(readFileSync(join(landed.home, "state.json"), "utf8"));
  expect(state.backoffUntil ?? null).toBeNull();
  expect(state.failures ?? 0).toBe(0);
  expect(atInstall.seen.sh.filter((c) => c[0] === "osascript")).toEqual([]);
  expect(existsSync(join(landed.home, "lock.json"))).toBe(false);
});

test("2026-11-13-005 AC-49: a tick that holds the lock clears what a killed git left in the clone, before its first git command there", async () => {
  const world = loopWorld();
  expect(await tick({}, tickDeps(world).deps)).toBe(0);
  const repo = join(world.home, "repo");
  const locks = [".git/index.lock", ".git/refs/heads/main.lock", ".git/packed-refs.lock"];
  // Locks as a killed git leaves them: older than the minute the clearing leaves a living git.
  const leftLock = (path: string) => {
    writeFileSync(path, "");
    const longAgo = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(path, longAgo, longAgo);
  };
  for (const rel of locks) leftLock(join(repo, rel));
  const next = tickDeps(world, { now: "2026-10-25T20:30:00.000Z" });
  expect(await tick({}, next.deps)).toBe(0);
  for (const rel of locks) {
    expect(existsSync(join(repo, rel))).toBe(false);
    expect(next.seen.log.join("\n")).toContain(`a lock a killed git left was removed: ${rel}`);
  }
  expect(next.seen.log.join("\n")).toContain("not due:");
  // A rebase left in progress is aborted.
  writeFileSync(join(repo, "a.txt"), "one\n");
  git(repo, "add", "a.txt");
  git(repo, "commit", "-q", "-m", "one");
  git(repo, "checkout", "-q", "-b", "side", "HEAD~1");
  writeFileSync(join(repo, "a.txt"), "two\n");
  git(repo, "add", "a.txt");
  git(repo, "commit", "-q", "-m", "two");
  spawnSync("git", ["rebase", "-q", "main"], { cwd: repo, env: childEnv() });
  expect(
    existsSync(join(repo, ".git/rebase-merge")) || existsSync(join(repo, ".git/rebase-apply")),
  ).toBe(true);
  const rebasing = tickDeps(world, { now: "2026-10-25T20:40:00.000Z" });
  await tick({}, rebasing.deps);
  expect(rebasing.seen.log.join("\n")).toContain("a rebase left in progress was aborted");
  expect(
    existsSync(join(repo, ".git/rebase-merge")) || existsSync(join(repo, ".git/rebase-apply")),
  ).toBe(false);
  // A dead tick that left a lock file: this tick clears it, commits the dead tick's report and releases its own lock.
  const died = loopWorld();
  expect(await tick({}, tickDeps(died).deps)).toBe(0);
  // Made this instant, as by a git the kill of the dead tick took with it: the tick waits for
  // it to be a minute old, and then takes it.
  writeFileSync(join(died.home, "repo/.git/index.lock"), "");
  writeFileSync(
    join(died.home, "lock.json"),
    JSON.stringify({ pid: 31_337, startedAt: "2026-10-25T20:10:00.000Z", boot: "boot-1" }),
  );
  const after = tickDeps(died, { now: "2026-10-25T20:30:00.000Z" });
  expect(await tick({}, after.deps)).toBe(0);
  expect(existsSync(join(died.home, "repo/.git/index.lock"))).toBe(false);
  expect(existsSync(join(died.home, "lock.json"))).toBe(false);
  expect(after.seen.pauses.length).toBe(1);
  expect(readFileSync(join(died.home, "repo/docs/improve/daily/2026-10-25.md"), "utf8")).toContain(
    "## Dead ticks",
  );
});

const wholeProbe = {
  loggedIn: true,
  authMethod: "claude.ai",
  github: "someone",
  remote: "ok",
  push: "ok",
  keychain: {},
};

test("2026-11-13-005 AC-50: an install holds its lock while it works in the clone, stops beside another, ends what an interrupted one left, and never leaves a loaded agent unloaded", async () => {
  const freshHome = () => join(tempDir("install-lock-"), "crew-improve");
  const lockAt = (order: { cmd: string; lock: string | null }[], cmd: string) =>
    order.find((o) => o.cmd === cmd)?.lock ?? null;
  // The lock is there, this process's, from the first command through the bootstrap, and gone at the load.
  const home = freshHome();
  const ok = installDeps(home, wholeProbe);
  expect(await install({ cloneFrom: loopSeed() }, ok.deps)).toBe(0);
  const first = ok.order[0] as { cmd: string; lock: string | null };
  expect(JSON.parse(first.lock as string).pid).toBe(process.pid);
  expect(JSON.parse(first.lock as string).start).toBe(lstartOf(process.pid));
  expect(JSON.parse(lockAt(ok.order, "bun install") as string).pid).toBe(process.pid);
  expect(lockAt(ok.order, "launchctl bootstrap")).toBeNull();
  expect(existsSync(join(home, INSTALL_LOCK))).toBe(false);
  // The order: the agent booted out before the clone; the packages and the shell after it, before the load.
  const at = (cmd: string) => ok.order.findIndex((o) => o.cmd === cmd);
  expect(at("launchctl bootout")).toBeGreaterThanOrEqual(0);
  expect(at("launchctl bootout")).toBeLessThan(at("git clone"));
  expect(at("git clone")).toBeLessThan(at("bun install"));
  expect(at("bun install")).toBeLessThan(
    at("env PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/ms-playwright"),
  );
  expect(at("env PLAYWRIGHT_BROWSERS_PATH=node_modules/.cache/ms-playwright")).toBeLessThan(
    at("launchctl bootstrap"),
  );
  // An install over a clone that is there bootstraps it all the same.
  const again = installDeps(home, wholeProbe);
  expect(await install({}, again.deps)).toBe(0);
  expect(again.order.some((o) => o.cmd === "git clone")).toBe(false);
  expect(again.order.filter((o) => o.cmd === "bun install").length).toBe(1);

  // Another install still runs: this one stops before any command, whatever the command file says.
  for (const installCommand of ["absent", { left: 4321 }] as const) {
    const beside = installDeps(freshHome(), null, { installLock: { running: 77 }, installCommand });
    expect(await install({ cloneFrom: loopSeed() }, beside.deps)).toBe(1);
    expect(beside.log.join("\n")).toContain("another install is running (pid 77): wait for it");
    expect(beside.order).toEqual([]);
    expect(beside.kills).toEqual([]);
  }
  // A stale lock, or none, with a command file whose own starter still runs: the same stop, nothing killed.
  for (const installLock of ["stale", "absent"] as const) {
    const held = installDeps(freshHome(), null, { installLock, installCommand: { running: 78 } });
    expect(await install({ cloneFrom: loopSeed() }, held.deps)).toBe(1);
    expect(held.log.join("\n")).toContain("another install is running (pid 78): wait for it");
    expect(held.order).toEqual([]);
    expect(held.kills).toEqual([]);
  }
  // A stale lock and a command an interrupted install left: killed, said, and the install goes on.
  const left = installDeps(freshHome(), wholeProbe, {
    installLock: "stale",
    installCommand: { left: 4321 },
  });
  expect(await install({ cloneFrom: loopSeed() }, left.deps)).toBe(0);
  expect(left.kills).toContain(4321);
  expect(left.log.join("\n")).toContain(
    "the command an interrupted install left running was killed (pid 4321)",
  );
  const gone = installDeps(freshHome(), wholeProbe, {
    installLock: "stale",
    installCommand: { left: null },
  });
  expect(await install({ cloneFrom: loopSeed() }, gone.deps)).toBe(0);
  expect(gone.log.join("\n")).toContain("the file an interrupted install left was removed");
  const offShape = installDeps(freshHome(), wholeProbe, { installCommand: "off-shape" });
  expect(await install({ cloneFrom: loopSeed() }, offShape.deps)).toBe(0);
  expect(offShape.kills).toEqual([]);

  // A living tick after the bootout: the install stops, clones nothing, and loads again the agent it booted out.
  const busyHome = freshHome();
  mkdirSync(busyHome, { recursive: true });
  writeFileSync(join(busyHome, "lock.json"), JSON.stringify({ pid: 4242 }));
  const busy = installDeps(busyHome, null, { liveTick: true, bootoutStatus: 0 });
  const loadedPlist = (deps: InstallDeps) => {
    const path = join(deps.userHome, "Library/LaunchAgents", `${LABEL}.plist`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "<plist/>");
  };
  loadedPlist(busy.deps);
  expect(await install({ cloneFrom: loopSeed() }, busy.deps)).toBe(1);
  expect(busy.log.join("\n")).toContain("a tick is running (pid 4242): wait for it or stop it");
  expect(busy.order.some((o) => o.cmd === "git clone")).toBe(false);
  expect(lockAt(busy.order, "launchctl bootstrap")).toBeNull();
  expect(busy.order.some((o) => o.cmd === "launchctl bootstrap")).toBe(true);
  expect(busy.log.join("\n")).toContain("the agent that was loaded is loaded again");
  expect(existsSync(join(busyHome, INSTALL_LOCK))).toBe(false);
  // The packages fail: a loaded agent is loaded again, with the lock gone by then; with none loaded, none is.
  const wasLoaded = installDeps(freshHome(), null, { packagesFail: true, bootoutStatus: 0 });
  loadedPlist(wasLoaded.deps);
  expect(await install({ cloneFrom: loopSeed() }, wasLoaded.deps)).toBe(1);
  expect(wasLoaded.log.join("\n")).toContain("bun install failed: the registry is away");
  expect(wasLoaded.log.join("\n")).toContain("the agent that was loaded is loaded again");
  expect(wasLoaded.order.some((o) => o.cmd === "launchctl bootstrap")).toBe(true);
  expect(lockAt(wasLoaded.order, "launchctl bootstrap")).toBeNull();
  const notLoaded = installDeps(freshHome(), null, { packagesFail: true, bootoutStatus: 3 });
  expect(await install({ cloneFrom: loopSeed() }, notLoaded.deps)).toBe(1);
  expect(notLoaded.order.some((o) => o.cmd === "launchctl bootstrap")).toBe(false);
  expect(existsSync(join(notLoaded.deps.home, INSTALL_LOCK))).toBe(false);
});

test("2026-11-13-005 AC-50: the install's two doors read a lock and a command file as they are, and a tick leaves beside a running install", async () => {
  const home = join(tempDir("install-doors-"), "home");
  mkdirSync(home, { recursive: true });
  const lock = join(home, INSTALL_LOCK);
  const file = join(home, INSTALL_COMMAND_FILE);
  expect(installLockOf(home)).toBe("absent");
  expect(installCommandOf(home)).toBe("absent");
  // A process that has ended, another that lives, this one, and a lock that does not parse.
  const ended = spawnSync("true", [], { env: childEnv() }).pid as number;
  const other = spawn("sleep", ["30"], { env: childEnv(), stdio: "ignore", detached: true });
  const otherPid = other.pid as number;
  try {
    for (let waited = 0; waited < 40 && lstartOf(otherPid) === ""; waited++) await sleepMs(25);
    writeFileSync(lock, JSON.stringify({ pid: ended, start: "Thu Jan  1 00:00:00 2026" }));
    expect(installLockOf(home)).toBe("stale");
    writeFileSync(lock, JSON.stringify({ pid: otherPid, start: lstartOf(otherPid) }));
    expect(installLockOf(home)).toEqual({ running: otherPid });
    writeFileSync(lock, JSON.stringify({ pid: otherPid, start: "Thu Jan  1 00:00:00 2026" }));
    expect(installLockOf(home)).toBe("stale");
    writeFileSync(lock, JSON.stringify({ pid: process.pid, start: lstartOf(process.pid) }));
    expect(installLockOf(home)).toBe("stale");
    writeFileSync(lock, "not json");
    expect(installLockOf(home)).toBe("stale");
    // A command file: a living command whose starter has ended is left; one whose starter lives is running.
    const four = (starter: number, start: string) =>
      `${otherPid}\n${lstartOf(otherPid)}\n${starter}\n${start}\n`;
    writeFileSync(file, four(ended, "Thu Jan  1 00:00:00 2026"));
    expect(installCommandOf(home)).toEqual({ left: otherPid });
    const starter = spawn("sleep", ["30"], { env: childEnv(), stdio: "ignore" });
    try {
      const starterPid = starter.pid as number;
      for (let waited = 0; waited < 40 && lstartOf(starterPid) === ""; waited++) await sleepMs(25);
      writeFileSync(file, four(starterPid, lstartOf(starterPid)));
      expect(installCommandOf(home)).toEqual({ running: starterPid });
    } finally {
      starter.kill("SIGKILL");
    }
    writeFileSync(file, "one line\n");
    expect(installCommandOf(home)).toBe("off-shape");
  } finally {
    try {
      process.kill(-otherPid, "SIGKILL");
    } catch {
      // gone already
    }
  }

  // A tick beside a running install: it leaves before its own lock, the clearing and any command.
  const world = loopWorld();
  expect(await tick({}, tickDeps(world).deps)).toBe(0);
  writeFileSync(join(world.home, "repo/.git/index.lock"), "");
  const beside = tickDeps(world, { now: "2026-10-25T20:30:00.000Z", installRunning: 4321 });
  expect(await tick({}, beside.deps)).toBe(0);
  expect(beside.seen.log.join("\n")).toContain("an install is running (pid 4321); leaving");
  expect(beside.seen.sh).toEqual([]);
  expect(beside.seen.git).toEqual([]);
  expect(existsSync(join(world.home, "repo/.git/index.lock"))).toBe(true);
  expect(existsSync(join(world.home, "lock.json"))).toBe(false);
  const empty = loopWorld();
  mkdirSync(join(empty.home, "repo.cloning"), { recursive: true });
  const noClone = tickDeps(empty, { installRunning: 4321 });
  expect(await tick({}, noClone.deps)).toBe(0);
  expect(noClone.seen.git).toEqual([]);
  expect(existsSync(join(empty.home, "repo.cloning"))).toBe(true);
}, 30_000);

test("2026-11-13-005 AC-51: a release that stops before step 1 is a line of the day's report and of the notification, by a name safe for a public file", async () => {
  const world = loopWorld();
  const line = [
    `the journal cannot be written under ${join(world.home, "repo/dist/x")}`,
    "beside /Users/someone/elsewhere/y and https://user:secret@host/z",
    "x".repeat(300),
  ].join(" ");
  const stoppedTick = tickDeps(world, { kept: true, stopped: `${line}\na second line` });
  expect(await tick({}, stoppedTick.deps)).toBe(0);
  const state = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(state.day.failures.length).toBe(1);
  const failure = state.day.failures[0] as { run: string; step: number; name: string };
  expect(failure.run).toBe("2026-10-25-1");
  expect(failure.step).toBe(0);
  const report = readFileSync(join(world.home, "repo/docs/improve/daily/2026-10-25.md"), "utf8");
  const body = (stoppedTick.seen.sh.filter((c) => c[0] === "osascript").at(-1) as string[]).join(
    " ",
  );
  for (const text of [failure.name, report, body]) {
    expect(text).not.toContain(world.home);
    expect(text).not.toContain("/Users/someone");
    expect(text).not.toContain("user:secret");
    expect(text).not.toContain("a second line");
  }
  expect(failure.name).toContain("<loop home>/repo/dist/x");
  expect(failure.name).toContain("~/elsewhere/y");
  expect(failure.name.length).toBeLessThanOrEqual(200);
  expect(report).toContain(
    `- run 2026-10-25-1: the release stopped before step 1: ${failure.name}`,
  );
  expect(body).toContain("the release stopped before step 1: the journal cannot be written");
  // The full line is in the log, which stays on this machine.
  expect(stoppedTick.seen.log.join("\n")).toContain("x".repeat(300));
  // The merge is off main, as for any failure before the push.
  expect(git(world.origin, "log", "--format=%s", "main")).not.toContain("Adopt improvement run");
  expect(statusText(installDeps(world.home, null).deps)).toContain("1 failed step(s)");
  // A failed step prints as today.
  const other = loopWorld();
  expect(await tick({}, tickDeps(other, { kept: true, releaseCode: 1, releaseStep: 3 }).deps)).toBe(
    0,
  );
  expect(readFileSync(join(other.home, "repo/docs/improve/daily/2026-10-25.md"), "utf8")).toContain(
    "step 3 (bun run check) failed",
  );
  // The name, by itself: an empty home replaces nothing, and a short line is left whole.
  expect(stopName("a /h/x b", "", "", [])).toBe("a /h/x b");
  expect(stopName("at /h/loop/x and /h/y", "/h/loop", "/h", [])).toBe("at <loop home>/x and ~/y");
  expect(stopName(`${"y".repeat(250)}`, "/h/loop", "/h", []).length).toBe(200);
  expect(stopName("a token tok-1 here", "", "", ["tok-1"])).toBe("a token [redacted] here");
  expect(
    dailyReport(
      "2026-10-25",
      [],
      [],
      [
        { run: "r1", step: 0, name: "origin is not reachable" },
        { run: "r2", step: 3, name: "bun run check" },
      ],
    ),
  ).toContain("- run r1: the release stopped before step 1: origin is not reachable");
});

test("2026-11-13-005 AC-51: a resume that stops keeps its release pending, and a due tick with a release pending runs no improvement and says so once a day", async () => {
  const world = loopWorld();
  expect(await tick({}, tickDeps(world).deps)).toBe(0);
  const stateFile = join(world.home, "state.json");
  const pend = () => {
    const state = JSON.parse(readFileSync(stateFile, "utf8"));
    writeFileSync(
      stateFile,
      JSON.stringify({ ...state, pendingRelease: { version: "9.9.9", failedStep: 9 } }),
    );
  };
  const stateNow = () => JSON.parse(readFileSync(stateFile, "utf8"));
  const report = () =>
    readFileSync(join(world.home, "repo/docs/improve/daily/2026-10-25.md"), "utf8");
  let edition = 1;
  const moveText = () => {
    edition += 1;
    moveOrigin(world, "plugins/core/skills/crew/SKILL.md", `# Crew\n\nRule ${edition}.\n`);
  };
  pend();
  moveText();
  // A due tick whose resume stops: still pending at its step, the line in the log, no run, the skip in the report.
  const first = tickDeps(world, {
    now: "2026-10-25T21:00:00.000Z",
    resumeStopped: "a release is running (pid 5): wait for it",
  });
  expect(await tick({}, first.deps)).toBe(0);
  expect(stateNow().pendingRelease).toEqual({ version: "9.9.9", failedStep: 9 });
  expect(first.seen.log.join("\n")).toContain(
    "the resume of 9.9.9 stopped: a release is running (pid 5): wait for it",
  );
  expect(first.seen.improve).toEqual([]);
  const skipLine =
    "- 21:00 UTC: release 9.9.9 is pending at step 9; no improvement run until it is resumed";
  expect(report()).toContain(skipLine);
  expect(first.seen.sh.filter((c) => c[0] === "osascript").length).toBe(1);
  const resumedFailures = () =>
    (stateNow().day.failures as { run: string }[]).filter((f) => f.run === "resumed");
  expect(resumedFailures().length).toBe(1);
  // A second such tick of the day: the same failure once, the skip logged alone.
  const second = tickDeps(world, {
    now: "2026-10-25T22:00:00.000Z",
    resumeStopped: "a release is running (pid 5): wait for it",
  });
  expect(await tick({}, second.deps)).toBe(0);
  expect(resumedFailures().length).toBe(1);
  expect(second.seen.log.join("\n")).toContain("reported at 21:00 UTC");
  expect(second.seen.sh.filter((c) => c[0] === "osascript")).toEqual([]);
  // A resume that fails at a step holds the run back the same way.
  const third = tickDeps(world, { now: "2026-10-25T22:30:00.000Z", resumeFails: 10 });
  expect(await tick({}, third.deps)).toBe(0);
  expect(third.seen.improve).toEqual([]);
  expect(stateNow().pendingRelease).toMatchObject({ version: "9.9.9", failedStep: 10 });
  // The release resumed: the tick runs, and the report it writes again still says the skip in its words.
  const fourth = tickDeps(world, { now: "2026-10-25T23:00:00.000Z" });
  expect(await tick({}, fourth.deps)).toBe(0);
  expect(stateNow().pendingRelease ?? null).toBeNull();
  expect(fourth.seen.improve.length).toBe(1);
  expect(report()).toContain(skipLine);
});

test("2026-11-13-005 AC-46: a due tick reads the release's token itself and skips its run with none, said once a day; a read that hangs fails the tick; a paused loop probes only when it has no probe", async () => {
  const world = loopWorld();
  const probeFile = join(world.home, "probe.json");
  const word = () => JSON.parse(readFileSync(probeFile, "utf8")).releaseToken;
  const tokenReads = (seen: { sh: string[][] }) =>
    seen.sh.filter((c) => c.join(" ").startsWith("gh auth token")).length;
  const notices = (seen: { sh: string[][] }) => seen.sh.filter((c) => c[0] === "osascript");
  let edition = 1;
  const moveText = () => {
    edition += 1;
    moveOrigin(world, "plugins/core/skills/crew/SKILL.md", `# Crew\n\nRule ${edition}.\n`);
  };
  // A first tick with a token runs, and the probe says found.
  const first = tickDeps(world);
  expect(await tick({}, first.deps)).toBe(0);
  expect(first.seen.improve.length).toBe(1);
  expect(word()).toBe("found");
  const lastRun = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8")).lastRun;
  // Due again, the account logged out since: the file says found, the tick's own read says none.
  moveText();
  const skipped = tickDeps(world, { now: "2026-10-25T21:00:00.000Z", releaseToken: false });
  expect(await tick({}, skipped.deps)).toBe(0);
  expect(tokenReads(skipped.seen)).toBe(1);
  expect(skipped.seen.improve).toEqual([]);
  expect(word()).toBe("missing");
  const line =
    /skipped: the release's account \(\S+\) has no token: log in to it with gh auth login; a later tick probes again/;
  expect(skipped.seen.log.join("\n")).toMatch(line);
  expect(notices(skipped.seen).length).toBe(1);
  expect((notices(skipped.seen)[0] as string[]).join(" ")).toMatch(line);
  const repo = join(world.home, "repo");
  const report = () => readFileSync(join(repo, "docs/improve/daily/2026-10-25.md"), "utf8");
  expect(report()).toContain(
    "- 21:00 UTC: the release's account has no token; a later tick probes again",
  );
  expect(originHead(world.origin)).toBe(
    "Improvement tick 2026-10-25: the release's account has no token",
  );
  expect(
    readdirSync(join(repo, "docs/improve")).filter((n) => n.startsWith("2026-10-25-")),
  ).toEqual(["2026-10-25-1"]);
  const stateAfter = JSON.parse(readFileSync(join(world.home, "state.json"), "utf8"));
  expect(stateAfter.lastRun).toEqual(lastRun);
  expect(stateAfter.failures ?? 0).toBe(0);
  // A later due tick of the day: the skip logged with when it was reported, and nothing else.
  const later = tickDeps(world, { now: "2026-10-25T22:00:00.000Z", releaseToken: false });
  expect(await tick({}, later.deps)).toBe(0);
  expect(later.seen.log.join("\n")).toContain("reported at 21:00 UTC");
  expect(notices(later.seen)).toEqual([]);
  expect(later.seen.improve).toEqual([]);
  // A dry run reads no token at the skip's place (the probe's own read is the one call) and says what a real tick would do.
  const dry = tickDeps(world, { now: "2026-10-25T22:10:00.000Z", releaseToken: false });
  expect(await tick({ dryRun: true }, dry.deps)).toBe(0);
  expect(tokenReads(dry.seen)).toBe(1);
  expect(dry.seen.log.join("\n")).toContain(
    "; the release's account has no token: a real tick would skip",
  );
  // After a login the next due tick reads a token, writes found and runs.
  const back = tickDeps(world, { now: "2026-10-25T23:00:00.000Z" });
  expect(await tick({}, back.deps)).toBe(0);
  expect(word()).toBe("found");
  expect(back.seen.improve.length).toBe(1);

  // A pending release is resumed before the skip.
  const pending = loopWorld();
  expect(await tick({}, tickDeps(pending).deps)).toBe(0);
  const stateFile = join(pending.home, "state.json");
  writeFileSync(
    stateFile,
    JSON.stringify({
      ...JSON.parse(readFileSync(stateFile, "utf8")),
      pendingRelease: { version: "9.9.9", failedStep: 9 },
    }),
  );
  moveOrigin(pending, "plugins/core/skills/crew/SKILL.md", "# Crew\n\nRule 2.\n");
  const resumed = tickDeps(pending, { now: "2026-10-25T21:00:00.000Z", releaseToken: false });
  expect(await tick({}, resumed.deps)).toBe(0);
  expect(resumed.seen.fromSteps.length).toBe(1);
  expect(JSON.parse(readFileSync(stateFile, "utf8")).pendingRelease ?? null).toBeNull();
  expect(resumed.seen.log.join("\n")).toMatch(line);
  expect(resumed.seen.improve).toEqual([]);

  // A read killed at its bound is not a logged-out account: the tick fails, and the probe's word stays.
  const hanging = loopWorld();
  expect(await tick({}, tickDeps(hanging).deps)).toBe(0);
  moveOrigin(hanging, "plugins/core/skills/crew/SKILL.md", "# Crew\n\nRule 2.\n");
  const hung = tickDeps(hanging, { now: "2026-10-25T21:00:00.000Z", releaseToken: "hangs" });
  expect(await tick({}, hung.deps)).toBe(1);
  expect(hung.seen.log.join("\n")).toContain(
    "the release's token could not be read: gh auth token timed out after 120 s",
  );
  expect(hung.seen.improve).toEqual([]);
  expect(JSON.parse(readFileSync(join(hanging.home, "probe.json"), "utf8")).releaseToken).toBe(
    "found",
  );
  expect(
    typeof JSON.parse(readFileSync(join(hanging.home, "state.json"), "utf8")).backoffUntil,
  ).toBe("string");

  // A paused loop: a probe that says missing is not taken again; with no probe, one is written.
  const paused = loopWorld();
  mkdirSync(paused.home, { recursive: true });
  writeFileSync(join(paused.home, "config.json"), JSON.stringify({ paused: true }));
  const firstPaused = tickDeps(paused, { releaseToken: false });
  expect(await tick({}, firstPaused.deps)).toBe(0);
  expect(JSON.parse(readFileSync(join(paused.home, "probe.json"), "utf8")).releaseToken).toBe(
    "missing",
  );
  const secondPaused = tickDeps(paused, { now: "2026-10-25T21:00:00.000Z", releaseToken: false });
  expect(await tick({}, secondPaused.deps)).toBe(0);
  expect(secondPaused.seen.sh.filter((c) => c[0] === "gh")).toEqual([]);
  expect(secondPaused.seen.log.join("\n")).toContain("paused by config.json; nothing run");
});

test("2026-11-13-005 AC-50: the real deps carry the guards a tick and an install read: a running install, the user's home, a living tick", async () => {
  const home = join(tempDir("real-guards-"), "home");
  mkdirSync(home, { recursive: true });
  const real = realTickDeps(home, readConfig(home));
  expect(real.userHome).toBe(homedir());
  expect(real.installRunning?.()).toBeNull();
  const other = spawn("sleep", ["30"], { env: childEnv(), stdio: "ignore" });
  try {
    const pid = other.pid as number;
    for (let waited = 0; waited < 40 && lstartOf(pid) === ""; waited++) await sleepMs(25);
    writeFileSync(join(home, INSTALL_LOCK), JSON.stringify({ pid, start: lstartOf(pid) }));
    expect(real.installRunning?.()).toBe(pid);
    const installing = realInstallDeps(home);
    expect(installing.alive?.(pid)).toBe(true);
  } finally {
    other.kill("SIGKILL");
  }
  const ended = spawnSync("true", [], { env: childEnv() }).pid as number;
  expect(realInstallDeps(home).alive?.(ended)).toBe(false);
});

test("2026-11-13-005 AC-37: no shell's install before a pending release's resume nor on a tick in back-off", async () => {
  const world = loopWorld();
  expect(await tick({}, tickDeps(world).deps)).toBe(0);
  const stateFile = join(world.home, "state.json");
  const state = JSON.parse(readFileSync(stateFile, "utf8"));
  // A due tick with a pending release whose resume fails: the resume is tried, and no shell is installed.
  writeFileSync(
    stateFile,
    JSON.stringify({ ...state, pendingRelease: { version: "9.9.9", failedStep: 9 } }),
  );
  moveOrigin(world, "plugins/core/skills/crew/SKILL.md", "# Crew\n\nRule 2.\n");
  const resumed = tickDeps(world, { now: "2026-10-25T21:00:00.000Z", resumeFails: 9 });
  expect(await tick({}, resumed.deps)).toBe(0);
  expect(resumed.seen.fromSteps.length).toBe(1);
  expect(shellsOf(resumed.seen)).toBe(0);
  // A tick in back-off: the packages, and no shell.
  writeFileSync(
    stateFile,
    JSON.stringify({ ...state, failures: 1, backoffUntil: "2026-10-26T05:00:00.000Z" }),
  );
  const held = tickDeps(world, { now: "2026-10-25T22:00:00.000Z" });
  expect(await tick({}, held.deps)).toBe(0);
  expect(held.seen.log.join("\n")).toContain("backing off until");
  expect(packagesOf(held.seen)).toBe(1);
  expect(shellsOf(held.seen)).toBe(0);
});

test("2026-11-13-005 AC-49: the clearing waits for a lock made in the last minute before it takes it, leaves one a living git released meanwhile, and goes on when a removal fails", async () => {
  const world = loopWorld();
  expect(await tick({}, tickDeps(world).deps)).toBe(0);
  const repo = join(world.home, "repo");
  const fresh = join(repo, ".git/index.lock");
  const old = join(repo, ".git/packed-refs.lock");
  const aged = (path: string) => {
    writeFileSync(path, "");
    const longAgo = new Date(Date.now() - 10 * 60 * 1000);
    utimesSync(path, longAgo, longAgo);
  };
  const noGit = () => ({ status: 0, stdout: "", stderr: "" });
  // An old lock goes at once; a fresh one is waited for until it is a minute old, then taken.
  writeFileSync(fresh, "");
  aged(old);
  const logged: string[] = [];
  const waits: number[] = [];
  clearClone(
    repo,
    noGit,
    (l) => logged.push(l),
    (ms) => waits.push(ms),
  );
  expect(existsSync(old)).toBe(false);
  expect(existsSync(fresh)).toBe(false);
  expect(waits.length).toBe(1);
  expect(waits[0]).toBeGreaterThan(50_000);
  expect(waits[0]).toBeLessThanOrEqual(60_000);
  expect(logged.join("\n")).toContain(
    "a lock a killed git left was removed: .git/packed-refs.lock",
  );
  expect(logged.join("\n")).toContain(
    "a lock made in the last minute was waited for and removed: .git/index.lock",
  );
  // The wait is said before it starts, so a person at the terminal knows why nothing moves.
  const before = logged.findIndex((l) => l.includes("waiting") && l.includes(".git/index.lock"));
  expect(before).toBeGreaterThanOrEqual(0);
  expect(logged[before]).toMatch(
    /^a git lock made in the last minute: waiting \d+ s before it is taken: \.git\/index\.lock$/,
  );
  // A lock a living git releases during the wait is not this tick's to remove, and nothing is said of a removal.
  writeFileSync(fresh, "");
  const quiet: string[] = [];
  clearClone(
    repo,
    noGit,
    (l) => quiet.push(l),
    () => rmSync(fresh),
  );
  expect(quiet.join("\n")).not.toContain("removed");
  // A lock a living git took again during the wait (a new file, a new time) is left.
  writeFileSync(fresh, "");
  const retaken: string[] = [];
  clearClone(
    repo,
    noGit,
    (l) => retaken.push(l),
    () => {
      rmSync(fresh);
      writeFileSync(fresh, "again");
      const later = new Date(Date.now() + 5_000);
      utimesSync(fresh, later, later);
    },
  );
  expect(existsSync(fresh)).toBe(true);
  expect(retaken.join("\n")).toContain("a lock a git still holds is left: .git/index.lock");
  rmSync(fresh);
  // A removal that fails does not stop the clearing: the lock that can be removed still goes.
  if (process.getuid?.() !== 0) {
    const heads = join(repo, ".git/refs/heads");
    aged(join(heads, "main.lock"));
    aged(old);
    chmodSync(heads, 0o555);
    try {
      const said: string[] = [];
      expect(() =>
        clearClone(
          repo,
          noGit,
          (l) => said.push(l),
          () => {},
        ),
      ).not.toThrow();
      expect(existsSync(join(heads, "main.lock"))).toBe(true);
      expect(existsSync(old)).toBe(false);
    } finally {
      chmodSync(heads, 0o755);
      rmSync(join(heads, "main.lock"), { force: true });
    }
  }
});

test("2026-11-13-005 AC-41: an ssh command that could not be read for a folder is read again, and one that is not set is read once", () => {
  let reads = 0;
  const failing = recordingRunner((cmd) => {
    if (cmd[1] !== "config") return {};
    reads += 1;
    return reads === 1
      ? { status: 1, exit: null, error: "spawn git ENOENT" }
      : { stdout: "ssh -i later\n" };
  });
  const git = loopCommands(failing.run, {}).git;
  git(["fetch"], "/later");
  git(["fetch"], "/later");
  git(["fetch"], "/later");
  expect(
    failing.calls.filter((c) => c.cmd[1] === "fetch").map((c) => c.env?.GIT_SSH_COMMAND),
  ).toEqual([
    "ssh -o BatchMode=yes",
    "ssh -i later -o BatchMode=yes",
    "ssh -i later -o BatchMode=yes",
  ]);
  expect(reads).toBe(2);
});

test("2026-11-13-005 AC-50: an install that throws after the bootout, or whose load fails, loads again the agent it booted out and says nothing is loaded when it could not; its lock goes only while it is its own", async () => {
  const freshHome = () => join(tempDir("install-throw-"), "crew-improve");
  const loaded = (deps: InstallDeps) => {
    const path = join(deps.userHome, "Library/LaunchAgents", `${LABEL}.plist`);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "<plist/>");
  };
  const loads = (seen: string[][]) =>
    seen.filter((c) => c[0] === "launchctl" && c[1] === "bootstrap").length;
  // A step throws after the bootout: the agent that was loaded is loaded again, and the install fails.
  const thrown = installDeps(freshHome(), null, { packagesThrow: true, bootoutStatus: 0 });
  loaded(thrown.deps);
  expect(await install({ cloneFrom: loopSeed() }, thrown.deps)).toBe(1);
  expect(thrown.log.join("\n")).toContain("spawn bun ENOENT");
  expect(thrown.log.join("\n")).toContain("the agent that was loaded is loaded again");
  expect(loads(thrown.seen)).toBe(1);
  expect(existsSync(join(thrown.deps.home, INSTALL_LOCK))).toBe(false);
  // The load itself fails: the install says no agent is loaded.
  const unloaded = installDeps(freshHome(), null, { loadFails: true, bootoutStatus: 0 });
  expect(await install({ cloneFrom: loopSeed() }, unloaded.deps)).toBe(1);
  expect(unloaded.log.join("\n")).toContain(
    "launchctl bootstrap failed: Bootstrap failed: 5: Input/output error; no agent is loaded: run the install again",
  );
  // The reload itself fails: the install does not say an agent is loaded.
  const lost = installDeps(freshHome(), null, {
    packagesFail: true,
    loadFails: true,
    bootoutStatus: 0,
  });
  loaded(lost.deps);
  expect(await install({ cloneFrom: loopSeed() }, lost.deps)).toBe(1);
  expect(lost.log.join("\n")).not.toContain("is loaded again");
  expect(lost.log.join("\n")).toContain(
    "the agent that was loaded could not be loaded again (Bootstrap failed: 5: Input/output error): no agent is loaded: run the install again",
  );
  // The lock of another install, taken after this one freed its own, is left when this one ends.
  const home = freshHome();
  const racing = installDeps(home, wholeProbe);
  const sh = racing.deps.sh;
  racing.deps.sh = (cmd, opts) => {
    if (cmd[0] === "launchctl" && cmd[1] === "kickstart")
      writeFileSync(join(home, INSTALL_LOCK), JSON.stringify({ pid: 999_999, start: "another" }));
    return sh(cmd, opts);
  };
  expect(await install({ cloneFrom: loopSeed() }, racing.deps)).toBe(0);
  expect(JSON.parse(readFileSync(join(home, INSTALL_LOCK), "utf8")).pid).toBe(999_999);
});

test("2026-11-13-005 AC-50: the install's wait for the first tick's probe covers the minute that tick may wait for a young git lock", async () => {
  const freshHome = () => join(tempDir("install-wait-"), "crew-improve");
  // A probe that comes after 100 s, as from a tick that waited out a lock and then probed: the install passes.
  const slow = installDeps(freshHome(), wholeProbe, { probeAfterSeconds: 100 });
  expect(await install({ cloneFrom: loopSeed() }, slow.deps)).toBe(0);
  expect(slow.log.join("\n")).toContain("login: claude.ai (logged in)");
  // No probe at all: the install says how long it waited.
  const never = installDeps(freshHome(), null);
  expect(await install({ cloneFrom: loopSeed() }, never.deps)).toBe(1);
  expect(never.log.join("\n")).toContain("the agent wrote no probe in 150 s");
});
