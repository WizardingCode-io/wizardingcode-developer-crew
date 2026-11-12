import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
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
  dailyReport,
  dayCostOf,
  dueRun,
  type InstallDeps,
  install,
  judgeArgs,
  keptNote,
  LABEL,
  type LoopConfig,
  lastMeasuredOf,
  launchdPlist,
  launcherScript,
  parseRuling,
  pauseLoop,
  pickTargets,
  providerEnv,
  providerUnpriced,
  readConfig,
  redact,
  redactingLogger,
  relaunchCommand,
  resumeLoop,
  runProbe,
  secretReadCommand,
  secretSetCommand,
  statusText,
  stopLoop,
  type TickDeps,
  tick,
  tickNotification,
  uninstall,
  unjudgedAtLimit,
  validLock,
  verdictText,
  writeRedacted,
} from "../../../scripts/improve-loop.ts";
import { notificationCommand } from "../../../scripts/release.ts";
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
  } = {},
): { deps: TickDeps; seen: Seen } {
  const seen: Seen = {
    sh: [],
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
  };
  const now = new Date(options.now ?? "2026-10-25T20:00:00.000Z");
  const deps: TickDeps = {
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
              ? figures(0.5)
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
        return options.resumeFails === undefined
          ? { version, code: 0, failedStep: null, pending: false }
          : { version, code: 1, failedStep: options.resumeFails, pending: true };
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
  expect(second.seen.sh.filter((c) => c[0] === "bun")).toEqual([]);
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
  } = {},
) {
  const seen: string[][] = [];
  const log: string[] = [];
  const deps: InstallDeps = {
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
      const r = spawnSync("git", args, { cwd, encoding: "utf8" });
      return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
    sh: (cmd) => {
      seen.push([...cmd]);
      if (cmd[0] === "launchctl" && cmd[1] === "bootout")
        return {
          status: options.bootoutStatus ?? 0,
          stdout: "",
          stderr: "Boot-out failed: 3: No such process",
        };
      if (cmd[0] === "launchctl" && cmd[1] === "kickstart" && probe) {
        mkdirSync(home, { recursive: true });
        writeFileSync(join(home, "probe.json"), JSON.stringify(probe));
      }
      if (cmd[0] === "launchctl" && cmd[1] === "print")
        return { status: 0, stdout: `${LABEL} = {\n\tstate = waiting\n}\n`, stderr: "" };
      return { status: 0, stdout: "", stderr: "" };
    },
    wait: async () => {},
    now: () => new Date("2026-10-25T20:00:00.000Z"),
    log: (line) => log.push(line),
  };
  return { deps, seen, log };
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
  expect(ok.seen.filter((c) => c[0] !== "git")).toEqual([
    ["bun", "install", "--frozen-lockfile"],
    CLONE_SHELL_INSTALL,
    ["launchctl", "bootout", `gui/501/${LABEL}`],
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
  expect(bare.seen.filter((c) => c[0] === "launchctl")).toEqual([]);
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
  expect(healed.seen.filter((c) => c[0] !== "git").slice(0, 3)).toEqual([
    ["bun", "install", "--frozen-lockfile"],
    CLONE_SHELL_INSTALL,
    ["launchctl", "bootout", `gui/501/${LABEL}`],
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
  expect(bare.seen.filter((c) => c[0] === "launchctl")).toEqual([]);
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
  } = {},
) {
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
    kill: (pid: number, signal: "SIGTERM") => {
      kills.push({ pid, signal });
    },
    wait: async () => {
      waited += 1;
      if (options.ends ?? true) rmSync(join(world.home, "lock.json"), { force: true });
    },
    now: () => new Date("2026-10-28T03:00:00.000Z"),
  };
  return { deps, kills, ps, waited: () => waited };
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
  expect(idle.seen.sh.filter((c) => c[0] === "bun")).toEqual([]);
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
  // With the shell in place a due tick installs nothing.
  moveText();
  const settled = tickDeps(world, { now: "2026-10-26T13:00:00.000Z" });
  expect(await tick({}, settled.deps)).toBe(0);
  expect(installs(settled.seen)).toBe(0);
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
