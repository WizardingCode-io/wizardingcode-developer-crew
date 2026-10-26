import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import {
  adoptionGate,
  adoptRun,
  backoffHours,
  dailyReport,
  dueRun,
  type InstallDeps,
  install,
  LABEL,
  type LoopConfig,
  launchdPlist,
  launcherScript,
  parseRuling,
  pickTargets,
  providerEnv,
  redact,
  redactingLogger,
  runProbe,
  secretReadCommand,
  secretSetCommand,
  statusText,
  type TickDeps,
  tick,
  tickNotification,
  uninstall,
  writeRedacted,
} from "../../../scripts/improve-loop.ts";
import { notificationCommand } from "../../../scripts/release.ts";
import { tempDir } from "./helpers.ts";

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
    judgeModel: "claude-fable-5-1",
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
      ...process.env,
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
  judgeModel: "claude-fable-5-1",
  claudeModels: true,
  secrets: [],
};

/** The adoption's deps: real git, a judge that answers as told, a release that records its call. */
function adoptDeps(answer: string | (() => string)) {
  const seen = {
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
            ...process.env,
            GIT_AUTHOR_NAME: "t",
            GIT_AUTHOR_EMAIL: "t@t",
            GIT_COMMITTER_NAME: "t",
            GIT_COMMITTER_EMAIL: "t@t",
          },
        });
        return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
      },
      judge: (call: { cwd: string; args: string[]; env: Record<string, string> }) => {
        seen.judge.push({ args: call.args, env: call.env });
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
    adoptionGate(keptRecord("2026-10-25-1", 0.55), ["plugins/core/agents/judge.md"]).clause,
  ).toBe("the figures are not a win: t did not rise: 0.55 against 0.50 (spread 0.10)");
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
      notes: ["- t: 0.50 → 0.90 (spread 0.10)", "- kept: P-1"],
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
  improve: { cases: string[]; provider: string }[];
  judge: number;
  release: string[];
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
    /** Origin refuses every push: the one failure the loop cannot heal (the back-off, AC-16). */
    refusePush?: boolean;
    /** The base's harness lessons during the run (finding 174): what the record lists (written as given, absent for `undefined`) and how many the base gains; by default the run's own lesson, listed and gained. */
    lessons?: { listed: unknown; gained: number };
    secret?: string;
  } = {},
): { deps: TickDeps; seen: Seen } {
  const seen: Seen = { sh: [], improve: [], judge: 0, release: [], log: [] };
  const now = new Date(options.now ?? "2026-10-25T20:00:00.000Z");
  const deps: TickDeps = {
    home: world.home,
    originUrl: world.origin,
    env: { PATH: process.env.PATH ?? "" },
    now: () => now,
    pid: 4242,
    boot: () => "boot-1",
    alive: () => options.alive ?? false,
    git: (args, cwd) => {
      if (options.refusePush && args[0] === "push")
        return { status: 1, stdout: "", stderr: "! [remote rejected] main (refused)" };
      const r = spawnSync("git", args, {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@t",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@t",
        },
      });
      return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    },
    sh: (cmd) => {
      seen.sh.push([...cmd]);
      return { status: 0, stdout: "", stderr: "" };
    },
    improve: async (opts, repo) => {
      seen.improve.push({ cases: opts.cases, provider: opts.provider?.name ?? "none" });
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
        baseline: Object.fromEntries(opts.cases.map((c) => [c, figures(0.5)])),
        proposals: [
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
        exit: 0,
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
        git(repo, "commit", "-q", "-am", `Improvement run ${record.run}: P-1`);
        git(repo, "checkout", "-q", "main");
      }
      return 0;
    },
    judge: () => {
      seen.judge += 1;
      return { status: 0, output: options.judge ?? holdsJson };
    },
    release: async (opts) => {
      seen.release.push(opts.reason);
      const version = "0.15.1";
      if (opts.resume) return { version, code: 0, failedStep: null, pending: false };
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
  expect(state.pendingRelease).toEqual({ version: "0.15.1", failedStep: 9 });
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
    env: { ...process.env, BUN_EXIT: "3" },
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
  expect(healed.seen.filter((c) => c[0] !== "git").slice(0, 2)).toEqual([
    ["bun", "install", "--frozen-lockfile"],
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
