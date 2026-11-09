import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  bumpVersion,
  type CommandRunner,
  failureLines,
  nextVersion,
  type ReleaseRecord,
  release,
  releaseFiles,
  spawnRunner,
  staleReleaseFiles,
  statusLine,
} from "../../../scripts/release.ts";
import type { RecordResult } from "../src/release-record.ts";
import { childEnv } from "./helpers.ts";

const OLD = "0.15.0";
const NEW = "0.15.1";

function sh(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

/** A repository with the release's files at OLD, committed on main and pushed to a bare origin beside it. */
function fixture(extra: Record<string, string> = {}): {
  root: string;
  origin: string;
  home: string;
} {
  const base = mkdtempSync(join(tmpdir(), "release-"));
  const root = join(base, "repo");
  const files: Record<string, string> = {
    "CLAUDE.md": [
      "# Repo",
      "",
      "## Releasing",
      "",
      "A release is: the same version in `package.json`, `packages/engine/package.json`, `packages/engine/src/version.ts`, `plugins/core/.claude-plugin/plugin.json` and the two tests that assert it (`packages/engine/tests/version.test.ts`, the `--version` line in `cli.test.ts`), and the packs' versions with it (`packs/laravel/pack.json`, `packs/laravel/.claude-plugin/plugin.json`, `packs/agentic-os/pack.json`, `packs/agentic-os/.claude-plugin/plugin.json`).",
      "",
      "## Conventions",
      "",
      "- none",
      "",
    ].join("\n"),
    "package.json": `${JSON.stringify({ name: "r", version: OLD }, null, 2)}\n`,
    "packages/engine/package.json": `${JSON.stringify({ name: "e", version: OLD }, null, 2)}\n`,
    "packages/engine/src/version.ts": `export const VERSION = "${OLD}";\n`,
    "plugins/core/.claude-plugin/plugin.json": `${JSON.stringify({ name: "crew", version: OLD }, null, 2)}\n`,
    "packs/laravel/pack.json": `{\n  "name": "l",\n  "version": "${OLD}",\n  "core": ">=${OLD}",\n  "files": ["checklists/a.md", "knowledge/b.md"]\n}\n`,
    "packs/laravel/.claude-plugin/plugin.json": `${JSON.stringify({ name: "l", version: OLD }, null, 2)}\n`,
    "packs/agentic-os/pack.json": `${JSON.stringify({ name: "a", version: OLD, core: `>=${OLD}` }, null, 2)}\n`,
    "packs/agentic-os/.claude-plugin/plugin.json": `${JSON.stringify({ name: "a", version: OLD }, null, 2)}\n`,
    "packages/engine/tests/version.test.ts": `test("v", () => {\n  expect(VERSION).toBe("${OLD}");\n});\n`,
    "packages/engine/tests/cli.test.ts": `test("c", async () => {\n  expect((await c.run("--version")).out.trim()).toBe("${OLD}");\n});\n`,
    ".gitignore": "/dist/\n",
  };
  for (const [rel, text] of Object.entries({ ...files, ...extra })) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  sh(root, "init", "-q", "-b", "main");
  sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "add", "-A");
  sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
  const origin = join(base, "origin.git");
  sh(base, "clone", "-q", "--bare", root, origin);
  sh(root, "remote", "add", "origin", origin);
  sh(root, "fetch", "-q", "origin");
  sh(root, "branch", "-q", "--set-upstream-to=origin/main", "main");
  const home = join(base, "home");
  mkdirSync(join(home, ".local/share/wizardingcode-developer-crew/bin"), { recursive: true });
  writeFileSync(join(home, ".local/share/wizardingcode-developer-crew/bin/crew"), "old");
  return { root, origin, home };
}

interface World {
  released: Set<string>;
  marketplace: {
    metadata: { version: string };
    plugins: { name: string; version: string; source: { ref: string } }[];
  };
  puts: { message: string; entries: [string, string, string][]; meta: string }[];
  /** Each command that ran with a token in its environment. */
  tokened: string[][];
  /** What `gh auth token -u` prints, when not the token. */
  tokenOutput?: string;
}

/** What `fail` scripts for a command: today's failure line, or the whole result a step reads (2026-11-01-003). */
type Scripted = boolean | ReturnType<CommandRunner>;

/**
 * A runner that runs git for real and plays every other command: bun, gh, claude, tar and
 * osascript are recorded, and a failing step is scripted. `fail` is consulted before git runs, so a
 * scripted git failure is reached; `before` sees each command first, so a row can touch the tree
 * between two steps (2026-11-01-003).
 */
function runner(
  root: string,
  fail: (cmd: readonly string[]) => Scripted = () => false,
  before: (cmd: readonly string[]) => void = () => {},
  answers: Partial<Record<"start" | "done", (version: string) => RecordResult>> = {},
  extra: {
    /** The fake tar writes the install's bundle too, so step 12 has a command to run (item 2026-11-08-002). */
    installBundle?: boolean;
    /** What the install's `crew projects update` answers; status 0 with no output otherwise. */
    projectsUpdate?: ReturnType<CommandRunner>;
  } = {},
): {
  run: CommandRunner;
  seen: string[][];
  /** Each command's options, in `seen`'s order (item 2026-11-08-002: the bound and the home of step 12). */
  seenOpts: Parameters<CommandRunner>[1][];
  world: World;
  /** The commands and the record calls in one order, the records as `record:start` and `record:done`. */
  events: string[];
  recorded: [string, string][];
  record: ReleaseRecord;
} {
  const seen: string[][] = [];
  const seenOpts: Parameters<CommandRunner>[1][] = [];
  const events: string[] = [];
  const recorded: [string, string][] = [];
  const answer = (what: "start" | "done", version: string): RecordResult => {
    events.push(`record:${what}`);
    recorded.push([what, version]);
    const scripted = answers[what];
    if (scripted) return scripted(version);
    return what === "start"
      ? {
          recorded: true,
          text: `release ${version} recorded for session s: the turn may end while it runs`,
        }
      : {
          recorded: true,
          text: `release ${version} done: the session's baseline is now commit abc1234`,
        };
  };
  const record: ReleaseRecord = {
    start: (v) => answer("start", v),
    done: (v) => answer("done", v),
  };
  const world: World = {
    released: new Set(),
    marketplace: {
      metadata: { version: "2.15.0" },
      plugins: [
        { name: "wizardingcode-mem", version: "0.5.0", source: { ref: "v0.5.0" } },
        { name: "wizardingcode-developer-crew", version: OLD, source: { ref: `v${OLD}` } },
        { name: "wizardingcode-pack-laravel", version: OLD, source: { ref: `v${OLD}` } },
        { name: "wizardingcode-pack-agentic-os", version: OLD, source: { ref: `v${OLD}` } },
      ],
    },
    puts: [],
    tokened: [],
  };
  const ok = (stdout = "") => ({ status: 0, exit: 0, stdout, stderr: "" });
  const run: CommandRunner = (cmd, opts) => {
    seen.push([...cmd]);
    seenOpts.push(opts);
    events.push(cmd.join(" "));
    if (opts.env?.GH_TOKEN) world.tokened.push([...cmd]);
    before(cmd);
    const scripted = fail(cmd);
    if (scripted === true)
      return { status: 1, exit: 1, stdout: "", stderr: `${cmd.join(" ")} failed` };
    if (scripted !== false) return scripted;
    if (cmd[0] === "git") {
      const r = spawnSync("git", cmd.slice(1), {
        cwd: opts.cwd,
        encoding: "utf8",
        env: {
          ...childEnv(),
          ...opts.env,
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@t",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@t",
        },
      });
      return {
        status: r.status ?? 1,
        exit: r.status,
        stdout: r.stdout ?? "",
        stderr: r.stderr ?? "",
      };
    }
    if (cmd[0] === "bun" && cmd.includes("--tarball")) {
      mkdirSync(join(root, "dist"), { recursive: true });
      writeFileSync(join(root, "dist", `wizardingcode-developer-crew-${NEW}.tar.gz`), "tgz");
      return ok();
    }
    if (cmd[0] === "gh" && cmd[1] === "auth" && cmd[2] === "token") {
      // A real run prints a command's output unless it is quiet: the token never goes that way.
      expect(opts.quiet).toBe(true);
      // Only a call that names an account gets the token the calls below expect.
      return ok(cmd.includes("-u") ? (world.tokenOutput ?? "ghp_SECRET\n") : "ghp_ACTIVE\n");
    }
    if (cmd[0] === "gh" && cmd[1] === "release" && cmd[2] === "view") {
      expect(opts.env?.GH_TOKEN).toBe("ghp_SECRET");
      return world.released.has(cmd[3] as string)
        ? ok("ok")
        : { status: 1, exit: 1, stdout: "", stderr: "release not found" };
    }
    if (cmd[0] === "gh" && cmd[1] === "release" && cmd[2] === "create") {
      expect(opts.env?.GH_TOKEN).toBe("ghp_SECRET");
      world.released.add(cmd[3] as string);
      return ok();
    }
    if (cmd[0] === "gh" && cmd[1] === "api" && !cmd.includes("PUT")) {
      expect(opts.env?.GH_TOKEN).toBe("ghp_SECRET");
      const content = Buffer.from(`${JSON.stringify(world.marketplace, null, 2)}\n`).toString(
        "base64",
      );
      return ok(JSON.stringify({ sha: "abc123", content }));
    }
    if (cmd[0] === "gh" && cmd[1] === "api" && cmd.includes("PUT")) {
      expect(opts.env?.GH_TOKEN).toBe("ghp_SECRET");
      const body = JSON.parse(opts.input ?? "{}") as {
        message: string;
        content: string;
        sha: string;
      };
      expect(body.sha).toBe("abc123");
      const next = JSON.parse(
        Buffer.from(body.content, "base64").toString("utf8"),
      ) as World["marketplace"];
      world.puts.push({
        message: body.message,
        entries: next.plugins.map((p) => [p.name, p.version, p.source.ref]),
        meta: next.metadata.version,
      });
      world.marketplace = next;
      return ok("{}");
    }
    if (cmd[0] === "tar") {
      // The archive extracted: its top folder with the new bin, and the bundle when a row asks for it.
      const dest = cmd[cmd.indexOf("-C") + 1] as string;
      mkdirSync(join(dest, "wizardingcode-developer-crew", "bin"), { recursive: true });
      writeFileSync(join(dest, "wizardingcode-developer-crew", "bin", "crew"), "new");
      if (extra.installBundle) {
        mkdirSync(join(dest, "wizardingcode-developer-crew", "dist"), { recursive: true });
        writeFileSync(join(dest, "wizardingcode-developer-crew", "dist", "crew.mjs"), "bundle");
      }
      return ok();
    }
    if (cmd[0] === "node" && cmd.includes("projects")) return extra.projectsUpdate ?? ok();
    return ok();
  };
  return { run, seen, seenOpts, world, events, recorded, record };
}

const versionsIn = (root: string): string[] =>
  releaseFiles(root).map((rel) => readFileSync(join(root, rel), "utf8"));
/** The commands that are not git, by their first words (two for tar and osascript, whose third is a path or a script). */
const programs = (seen: string[][]): string[] =>
  seen
    .filter((c) => c[0] !== "git")
    .map((c) => c.slice(0, c[0] === "tar" || c[0] === "osascript" ? 2 : 3).join(" "));

test("2026-10-25-005 AC-7: nextVersion bumps patch, minor and major, or takes a version", () => {
  expect(nextVersion("0.15.0", "patch")).toBe("0.15.1");
  expect(nextVersion("0.15.9", "minor")).toBe("0.16.0");
  expect(nextVersion("0.15.9", "major")).toBe("1.0.0");
  expect(nextVersion("0.15.0", { version: "0.20.0" })).toBe("0.20.0");
  expect(() => nextVersion("0.15.0", { version: "0.14.9" })).toThrow("0.14.9 is not above 0.15.0");
});

test("2026-10-31-002 AC-1: with another account active in gh, the GitHub release is created with the named account's token", async () => {
  const { root, home } = fixture();
  const { run, seen, world } = runner(root);
  const log: string[] = [];
  const code = await release(
    { root, bump: "patch", reason: "x", home, githubAccount: "personal" },
    { run, log: (l) => log.push(l) },
  );
  expect(code, log.join("\n")).toBe(0);
  expect(world.released.has(`v${NEW}`)).toBe(true);
  // The runner refuses a gh release call without the token; here, the account it came from and the calls it reached.
  expect(seen).toContainEqual(["gh", "auth", "token", "-u", "personal"]);
  const steps = world.tokened.map((c) => c.slice(0, 3).join(" "));
  expect(steps).toContain("gh release view");
  expect(steps).toContain("gh release create");
});

test("2026-10-31-002 AC-2: with no token for the account, the release stops at the GitHub release step, names the account and creates nothing under the active account", async () => {
  const { root, origin, home } = fixture();
  const { run, seen, world } = runner(root, (cmd) => cmd.join(" ").startsWith("gh auth token"));
  const log: string[] = [];
  const code = await release(
    { root, bump: "patch", reason: "x", home, githubAccount: "personal" },
    { run, log: (l) => log.push(l) },
  );
  expect(code).toBe(1);
  const said = log.join("\n");
  expect(said).toContain("step 8");
  expect(said).toContain("gh auth token -u personal gave no token");
  expect(said).toContain(`resume with: bun scripts/release.ts --resume v${NEW} --from-step 8`);
  expect(seen.filter((c) => c[0] === "gh" && c[1] === "release")).toEqual([]);
  expect(world.released.size).toBe(0);
  // The push came first: the tag is out, so the resume above applies.
  expect(sh(origin, "tag", "--list").trim()).toBe(`v${NEW}`);
});

test("2026-10-31-002 AC-4: a zero exit with empty output is no token: the release stops at the GitHub release step and calls no gh release", async () => {
  const { root, home } = fixture();
  const { run, seen, world } = runner(root);
  world.tokenOutput = "\n";
  const log: string[] = [];
  const code = await release(
    { root, bump: "patch", reason: "x", home, githubAccount: "personal" },
    { run, log: (l) => log.push(l) },
  );
  expect(code).toBe(1);
  expect(log.join("\n")).toContain("gh auth token -u personal gave no token");
  expect(seen.filter((c) => c[0] === "gh" && c[1] === "release")).toEqual([]);
});

test("2026-10-25-005 AC-7: a patch release writes the version into every release file, the two test literals and the packs' bound, runs the thirteen steps in order, and the marketplace, the tag and the local install follow", async () => {
  const { root, origin, home } = fixture();
  const { run, seen, world } = runner(root);
  const log: string[] = [];
  const code = await release(
    {
      root,
      bump: "patch",
      reason: "improvement run 2026-10-25-1: false-done 0.60 → 0.90",
      home,
      githubAccount: "andreagroferreira",
    },
    { run, log: (l) => log.push(l) },
  );
  expect(code, log.join("\n")).toBe(0);
  // Step 1: every release file at the new version, the old one nowhere, the tests' literals and the packs' bound too.
  expect(staleReleaseFiles(root, NEW)).toEqual([]);
  expect(versionsIn(root).some((text) => text.includes(OLD))).toBe(false);
  expect(readFileSync(join(root, "packages/engine/tests/version.test.ts"), "utf8")).toContain(
    `toBe("${NEW}")`,
  );
  expect(readFileSync(join(root, "packages/engine/tests/cli.test.ts"), "utf8")).toContain(
    `toBe("${NEW}")`,
  );
  expect(JSON.parse(readFileSync(join(root, "packs/laravel/pack.json"), "utf8")).core).toBe(
    `>=${NEW}`,
  );
  // Steps 2 to 13 in order, by their commands (step 12 runs none: the fixture's install holds no bundle).
  expect(programs(seen)).toEqual([
    "bun run build",
    "bun run check",
    "bun run plugin:check",
    "bun scripts/build.ts --tarball",
    "gh auth token",
    "gh release view",
    "gh release create",
    "gh api repos/WizardingCode-io/wizardingcode-plugins/contents/.claude-plugin/marketplace.json",
    "gh api -X",
    "claude plugin marketplace",
    "claude plugin update",
    "tar xzf",
    "osascript -e",
  ]);
  // Step 5 and 6: the commit and the tag on origin.
  expect(sh(root, "log", "-1", "--format=%s").trim()).toBe(
    `Release ${NEW}: improvement run 2026-10-25-1: false-done 0.60 → 0.90`,
  );
  expect(sh(root, "status", "--porcelain").trim()).toBe("");
  expect(sh(origin, "tag", "--list").trim()).toBe(`v${NEW}`);
  expect(sh(origin, "log", "-1", "--format=%s", "main").trim()).toContain(`Release ${NEW}`);
  const push = seen.find((c) => c[0] === "git" && c[1] === "push") as string[];
  expect(push).toContain("--atomic");
  // Step 8: the release carries the tarball, verified against the tag.
  const create = seen.find((c) => c[0] === "gh" && c[2] === "create") as string[];
  expect(create).toContain(`dist/wizardingcode-developer-crew-${NEW}.tar.gz`);
  expect(create).toContain("--verify-tag");
  expect(create.indexOf("--notes-file")).toBeGreaterThan(-1);
  // Step 9: the entry and the marketplace's own version, in one PUT with the sha.
  // Every entry released from this repository moves (the core and the packs); another product's stays.
  expect(world.puts).toEqual([
    {
      message: `wizardingcode-developer-crew ${NEW}`,
      entries: [
        ["wizardingcode-mem", "0.5.0", "v0.5.0"],
        ["wizardingcode-developer-crew", NEW, `v${NEW}`],
        ["wizardingcode-pack-laravel", NEW, `v${NEW}`],
        ["wizardingcode-pack-agentic-os", NEW, `v${NEW}`],
      ],
      meta: "2.15.1",
    },
  ]);
  // The token reaches gh's calls alone, through the environment: never a command line or the log.
  for (const c of seen) expect(JSON.stringify(c)).not.toContain("ghp_SECRET");
  expect(log.join("\n")).not.toContain("ghp_SECRET");
  expect(world.tokened.length).toBeGreaterThan(0);
  for (const c of world.tokened) expect(c[0]).toBe("gh");
  // Step 11: the local install swapped by rename, the one it replaced kept beside it (item 2026-11-09-001, AC-20).
  expect(
    readFileSync(join(home, ".local/share/wizardingcode-developer-crew/bin/crew"), "utf8"),
  ).toBe("new");
  expect(
    readFileSync(join(home, ".local/share/wizardingcode-developer-crew.previous/bin/crew"), "utf8"),
  ).toBe("old");
  // Step 13: the notification names the version.
  const notify = seen.find((c) => c[0] === "osascript") as string[];
  expect(notify.join(" ")).toContain(`crew ${NEW}`);
});

test("2026-10-25-005 AC-7: --dry-run prints the thirteen steps and changes nothing; a dirty tree or another branch is refused before anything is written", async () => {
  const { root, home } = fixture();
  const dry = runner(root);
  const log: string[] = [];
  expect(
    await release(
      { root, bump: "patch", reason: "x", home, dryRun: true },
      { run: dry.run, log: (l) => log.push(l) },
    ),
  ).toBe(0);
  expect(log.filter((l) => /^\s*\d+\. /.test(l))).toHaveLength(13);
  expect(log.join("\n")).toContain(`Release ${NEW}: x`);
  expect(programs(dry.seen)).toEqual([]);
  expect(staleReleaseFiles(root, OLD)).toEqual([]);
  expect(sh(root, "status", "--porcelain").trim()).toBe("");
  writeFileSync(join(root, "stray.md"), "x");
  const dirty = runner(root);
  const dirtyLog: string[] = [];
  expect(
    await release(
      { root, bump: "patch", reason: "x", home },
      { run: dirty.run, log: (l) => dirtyLog.push(l) },
    ),
  ).toBe(1);
  expect(dirtyLog.join("\n")).toContain("the tree has uncommitted changes (stray.md)");
  expect(programs(dirty.seen)).toEqual([]);
  expect(staleReleaseFiles(root, OLD)).toEqual([]);
  sh(root, "checkout", "-q", "-b", "topic");
  const branch = runner(root);
  const branchLog: string[] = [];
  expect(
    await release(
      { root, bump: "patch", reason: "x", home },
      { run: branch.run, log: (l) => branchLog.push(l) },
    ),
  ).toBe(1);
  expect(branchLog.join("\n")).toContain("the release runs on main, not topic");
});

test("2026-10-25-005 AC-15: a failure before the push restores the tree, the commit and the tag, and names the step; a failure after the push is resumed from the failed step, and a resume with nothing pending changes nothing", async () => {
  const { root, origin, home } = fixture();
  const head = sh(root, "rev-parse", "HEAD").trim();
  sh(root, "branch", "improve/2026-10-25-1");
  // Step 3 fails: everything written is back, no commit, no tag, the kept branch untouched, the step named in the notification.
  const atCheck = runner(root, (cmd) => cmd.join(" ") === "bun run check");
  const log3: string[] = [];
  const failed = await release(
    { root, bump: "patch", reason: "x", home },
    { run: atCheck.run, log: (l) => log3.push(l) },
  );
  expect(failed).toBe(1);
  expect(log3.join("\n")).toContain("step 3 (bun run check) failed");
  expect(staleReleaseFiles(root, OLD)).toEqual([]);
  expect(sh(root, "rev-parse", "HEAD").trim()).toBe(head);
  expect(sh(root, "tag", "--list").trim()).toBe("");
  expect(sh(root, "status", "--porcelain").trim()).toBe("");
  expect(programs(atCheck.seen)).toEqual(["bun run build", "bun run check", "osascript -e"]);
  expect((atCheck.seen.find((c) => c[0] === "osascript") as string[]).join(" ")).toContain(
    "step 3 (bun run check) failed",
  );
  expect(sh(root, "branch", "--list", "improve/2026-10-25-1").trim()).toBe("improve/2026-10-25-1");
  // A merge made before the release (the loop's adoption) goes with the rollback when rollbackTo names the head before it.
  sh(root, "checkout", "-q", "-b", "improve/m");
  writeFileSync(
    join(root, "CLAUDE.md"),
    `${readFileSync(join(root, "CLAUDE.md"), "utf8")}\nmore\n`,
  );
  sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-am", "harness");
  sh(root, "checkout", "-q", "main");
  sh(
    root,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "merge",
    "--no-ff",
    "-q",
    "-m",
    "Adopt",
    "improve/m",
  );
  expect(sh(root, "rev-parse", "HEAD").trim()).not.toBe(head);
  const merged = runner(root, (cmd) => cmd.join(" ") === "bun run check");
  expect(
    await release(
      { root, bump: "patch", reason: "x", home, rollbackTo: head },
      { run: merged.run, log: () => {} },
    ),
  ).toBe(1);
  expect(sh(root, "rev-parse", "HEAD").trim()).toBe(head);
  expect(sh(root, "branch", "--list", "improve/m").trim()).toBe("improve/m");
  expect(sh(root, "status", "--porcelain").trim()).toBe("");
  // Step 9 fails after the push: the tag and the release are out, the marketplace is not.
  const atMarket = runner(root, (cmd) => cmd[0] === "gh" && cmd.includes("PUT"));
  const log9: string[] = [];
  const pending = await release(
    { root, bump: "patch", reason: "x", home },
    { run: atMarket.run, log: (l) => log9.push(l) },
  );
  expect(pending).toBe(1);
  expect(log9.join("\n")).toContain("step 9 (the marketplace entry) failed");
  expect(log9.join("\n")).toContain(
    `resume with: bun scripts/release.ts --resume v${NEW} --from-step 9`,
  );
  expect(sh(origin, "tag", "--list").trim()).toBe(`v${NEW}`);
  expect(atMarket.world.released.has(`v${NEW}`)).toBe(true);
  expect(atMarket.world.puts).toEqual([]);
  // The resume: the tag is on origin, the tarball and the release exist, so 1 to 8 are skipped; 9 to 12 run.
  const resumed = runner(root);
  resumed.world.released.add(`v${NEW}`);
  const logR: string[] = [];
  expect(
    await release(
      {
        root,
        resume: NEW,
        fromStep: 9,
        reason: "x",
        home,
        githubAccount: "andreagroferreira",
      },
      { run: resumed.run, log: (l) => logR.push(l) },
    ),
  ).toBe(0);
  expect(programs(resumed.seen)).toEqual([
    "gh auth token",
    "gh api repos/WizardingCode-io/wizardingcode-plugins/contents/.claude-plugin/marketplace.json",
    "gh api -X",
    "claude plugin marketplace",
    "claude plugin update",
    "tar xzf",
    "osascript -e",
  ]);
  expect(resumed.world.puts.map((p) => p.entries[1]?.[1])).toEqual([NEW]);
  // A resume from a step whose result exists skips it: the entry already at the version, nothing is put again.
  const again = runner(root);
  again.world.released.add(`v${NEW}`);
  // Every entry of ours already at the version: nothing to put.
  for (const entry of again.world.marketplace.plugins)
    if (entry.name !== "wizardingcode-mem") {
      entry.version = NEW;
      entry.source.ref = `v${NEW}`;
    }
  expect(
    await release(
      { root, resume: NEW, fromStep: 7, reason: "x", home },
      { run: again.run, log: () => {} },
    ),
  ).toBe(0);
  expect(again.world.puts).toEqual([]);
  expect(programs(again.seen)).toEqual([
    "gh auth token",
    "gh release view",
    "gh api repos/WizardingCode-io/wizardingcode-plugins/contents/.claude-plugin/marketplace.json",
    "claude plugin marketplace",
    "claude plugin update",
    "tar xzf",
    "osascript -e",
  ]);
  // A resume of a version whose tag is not on origin is refused; a bump while a release is pending is refused.
  const none = runner(root);
  const logN: string[] = [];
  expect(
    await release(
      { root, resume: "0.15.2", fromStep: 7, reason: "x", home },
      { run: none.run, log: (l) => logN.push(l) },
    ),
  ).toBe(1);
  expect(logN.join("\n")).toContain("v0.15.2 is not on origin; nothing to resume");
  const blocked = runner(root);
  const logB: string[] = [];
  expect(
    await release(
      { root, bump: "patch", reason: "x", home, pending: { version: NEW, failedStep: 9 } },
      { run: blocked.run, log: (l) => logB.push(l) },
    ),
  ).toBe(1);
  expect(logB.join("\n")).toContain(`release ${NEW} is pending at step 9: resume it first`);
  expect(programs(blocked.seen)).toEqual([]);
});

test("2026-10-25-006 AC-1 (finding 166): the bump replaces the version strings alone, every other byte of a release file kept, so a manifest in the repository's own shape stays formatted", () => {
  const { root } = fixture();
  const before = Object.fromEntries(
    releaseFiles(root).map((rel) => [rel, readFileSync(join(root, rel), "utf8")]),
  );
  expect(before["packs/laravel/pack.json"]).toContain(
    '"files": ["checklists/a.md", "knowledge/b.md"]',
  );
  bumpVersion(root, OLD, NEW);
  for (const [rel, text] of Object.entries(before))
    expect(readFileSync(join(root, rel), "utf8"), rel).toBe(text.replaceAll(OLD, NEW));
  expect(staleReleaseFiles(root, NEW)).toEqual([]);
});

const stepLog = (root: string, step: number) =>
  join(root, "dist", `release-${NEW}-step-${step}.log`);
const startSha = (root: string) => sh(root, "rev-parse", "HEAD").trim().slice(0, 7);
const failing =
  (program: string, result: ReturnType<CommandRunner>) =>
  (cmd: readonly string[]): Scripted =>
    cmd.join(" ") === program ? result : false;
const releaseLog = async (root: string, home: string, run: CommandRunner) => {
  const log: string[] = [];
  const code = await release(
    { root, bump: "patch", reason: "x", home },
    { run, log: (l) => log.push(l) },
  );
  return { code, lines: log.join("\n").split("\n") };
};

test("2026-11-01-003 AC-40, AC-37: a failed check logs the failure lines, the summary and the tail under a first line naming the step, the exit and the output file, kept after the rollback; the notification carries the first line alone", async () => {
  const { root, home } = fixture();
  const stdout = "src/x.ts(3,5): error TS2322: x\n";
  const stderr =
    "$ bun run typecheck && bun run lint && bun run test\n(pass) cli > an error path is refused\n(fail) hooks-stop > case 4 [0.11ms]\nerror: expect(received).toBe(expected)\n 1516 pass\n 1 fail\nRan 1517 tests across 90 files.\n";
  const at = runner(root, failing("bun run check", { status: 1, exit: 1, stdout, stderr }));
  const { code, lines } = await releaseLog(root, home, at.run);
  expect(code).toBe(1);
  const first = lines.findIndex((l) => l.startsWith("step 3 (bun run check) failed"));
  expect(lines[first]).toBe(
    `step 3 (bun run check) failed: the check (exit 1): lines that name a failure, then the output's last lines (the whole output in dist/release-${NEW}-step-3.log); the tree is back at ${startSha(root)}, nothing released`,
  );
  const tail = [...stdout.split("\n"), ...stderr.split("\n")]
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-10);
  expect(lines.slice(first + 1)).toEqual([
    "  (fail) hooks-stop > case 4 [0.11ms]",
    "  src/x.ts(3,5): error TS2322: x",
    "  error: expect(received).toBe(expected)",
    "  1 fail",
    "  last lines:",
    ...tail.map((l) => `  ${l}`),
  ]);
  expect(readFileSync(stepLog(root, 3), "utf8")).toBe(`exit 1\n${stdout}--- stderr ---\n${stderr}`);
  const body = (at.seen.find((c) => c[0] === "osascript") as string[]).join(" ");
  expect(body).toContain("step 3 (bun run check) failed");
  expect(body).toContain("nothing released");
  expect(body).not.toContain("(fail)");
});

test("2026-11-01-003 AC-37: biome's header leads the groups, a line is printed once, a (pass) line never, the cap cuts at 20 and the summary follows whatever the cap", async () => {
  const { root, home } = fixture();
  const fails = Array.from({ length: 25 }, (_, i) => `(fail) t${i + 1}`);
  const stderr = `✗ a cross line   \n(skip) t-skipped error TS1234\n.claude/settings.local.json format ━━━━   \n\n  × Formatter would have printed the following content:\n  × Formatter would have printed the following content:\n(pass) t0 > error TS9999 in a name\nFound 1 error.\n${fails.join("\n")}\n 25 fail\n`;
  const at = runner(root, failing("bun run check", { status: 1, exit: 1, stdout: "", stderr }));
  const { lines } = await releaseLog(root, home, at.run);
  const first = lines.findIndex((l) => l.startsWith("step 3 (bun run check) failed"));
  const body = lines.slice(first + 1);
  expect(body).toEqual([
    "  .claude/settings.local.json format ━━━━",
    ...fails.slice(0, 19).map((l) => `  ${l}`),
    "  … and 9 more",
    "  25 fail",
    "  last lines:",
    ...fails.slice(16).map((l) => `  ${l}`),
    "  25 fail",
  ]);
  const named = failureLines(stderr);
  expect(named.lines[0]).toBe(".claude/settings.local.json format ━━━━");
  expect(named.lines).toContain("✗ a cross line");
  expect(named.lines.some((l) => l.includes("(skip)"))).toBe(false);
});

test("2026-11-01-003 AC-40: the notification's failure is logged with its head and its body, not fatal, and the release is out", async () => {
  const { root, home } = fixture();
  const at = runner(root, (cmd) =>
    cmd[0] === "osascript"
      ? {
          status: 1,
          exit: 1,
          stdout: "",
          stderr: "execution error: no notification centre (-1708)\n",
        }
      : false,
  );
  const { code, lines } = await releaseLog(root, home, at.run);
  expect(code).toBe(0);
  const head = lines.findIndex((l) => l.startsWith("step 13 (the notification) failed: "));
  expect(head).toBeGreaterThan(0);
  expect(lines[head]).toContain(`dist/release-${NEW}-step-13.log`);
  expect(lines[head]?.endsWith(" (not fatal: the release is out)")).toBe(true);
  expect(lines.slice(head + 1, head + 3)).toEqual([
    "  last lines:",
    "  execution error: no notification centre (-1708)",
  ]);
  expect(lines[lines.length - 1]).toBe(`released ${NEW}`);
});

test("2026-11-01-003 AC-40: an output with no failure line prints its last lines alone, and an empty output prints no body", async () => {
  const cases: [string, string, string[]][] = [
    [
      "nothing special\n",
      "no line names a failure; the output's last lines",
      ["  last lines:", "  nothing special"],
    ],
    ["", "no output", []],
  ];
  for (const [stdout, head, bodyLines] of cases) {
    const { root, home } = fixture();
    const at = runner(root, failing("bun run check", { status: 1, exit: 1, stdout, stderr: "" }));
    const { lines } = await releaseLog(root, home, at.run);
    const first = lines.findIndex((l) => l.startsWith("step 3 (bun run check) failed"));
    expect(lines[first]).toBe(
      `step 3 (bun run check) failed: the check (exit 1): ${head} (the whole output in dist/release-${NEW}-step-3.log); the tree is back at ${startSha(root)}, nothing released`,
    );
    expect(lines.slice(first + 1)).toEqual(bodyLines);
  }
});

test("2026-11-01-003 AC-40, AC-41: a command ended by a signal names it with a null exit, in the log and in the file", async () => {
  const { root, home } = fixture();
  const at = runner(
    root,
    failing("git push -q --atomic origin main v0.15.1", {
      status: 1,
      exit: null,
      stdout: "",
      stderr: "",
      signal: "SIGKILL",
    }),
  );
  const { code, lines } = await releaseLog(root, home, at.run);
  expect(code).toBe(1);
  expect(lines).toContain(
    `step 6 (the push) failed: git push (exit null, signal SIGKILL): no output (the whole output in dist/release-${NEW}-step-6.log); the tree is back at ${startSha(root)}, nothing released`,
  );
  expect(readFileSync(stepLog(root, 6), "utf8")).toBe(
    "exit null, signal SIGKILL\n--- stderr ---\n",
  );
});

test("2026-11-01-003 AC-40, AC-41: after the push the resume line stays its own line, the notification carries the resume suffix, and the marketplace read of the run goes through the same helper", async () => {
  const { root, home } = fixture();
  const at = runner(root, (cmd) =>
    cmd[0] === "gh" && cmd.includes("PUT")
      ? { status: 1, exit: 1, stdout: "", stderr: "gh: HTTP 422\n" }
      : false,
  );
  const { code, lines } = await releaseLog(root, home, at.run);
  expect(code).toBe(1);
  const first = lines.findIndex((l) => l.startsWith("step 9 (the marketplace entry) failed"));
  expect(lines.slice(first, first + 4)).toEqual([
    `step 9 (the marketplace entry) failed: the marketplace PUT (exit 1): no line names a failure; the output's last lines (the whole output in dist/release-${NEW}-step-9.log)`,
    "  last lines:",
    "  gh: HTTP 422",
    `resume with: bun scripts/release.ts --resume v${NEW} --from-step 9`,
  ]);
  expect(readFileSync(stepLog(root, 9), "utf8")).toBe("exit 1\n--- stderr ---\ngh: HTTP 422\n");
  const body = (at.seen.find((c) => c[0] === "osascript") as string[]).join(" ");
  expect(body).toContain("step 9 (the marketplace entry) failed: the marketplace PUT (exit 1)");
  expect(body).toContain(`; resume with --resume v${NEW} --from-step 9`);
  // The read inside the step's run, failing: the same shape under its own label.
  const second = fixture();
  const atRead = runner(second.root, (cmd) =>
    cmd[0] === "gh" && cmd[1] === "api" && !cmd.includes("PUT")
      ? { status: 1, exit: 1, stdout: "", stderr: "gh: HTTP 500\n" }
      : false,
  );
  const read = await releaseLog(second.root, second.home, atRead.run);
  expect(read.code).toBe(1);
  expect(read.lines).toContain(
    `step 9 (the marketplace entry) failed: the marketplace read (exit 1): no line names a failure; the output's last lines (the whole output in dist/release-${NEW}-step-9.log)`,
  );
  expect(readFileSync(stepLog(second.root, 9), "utf8")).toBe(
    "exit 1\n--- stderr ---\ngh: HTTP 500\n",
  );
});

test("2026-11-01-003 AC-40: a green run leaves no step file", async () => {
  const { root, home } = fixture();
  const { run } = runner(root);
  expect(await release({ root, bump: "patch", reason: "x", home }, { run, log: () => {} })).toBe(0);
  for (let n = 1; n <= 13; n++) expect(existsSync(stepLog(root, n)), `step ${n}`).toBe(false);
});

test("2026-11-01-003 AC-41: the real runner captures 64 MiB per stream and names a signal with a null exit while the status stays a number", () => {
  const run = spawnRunner(false);
  const big = run(["sh", "-c", "head -c 3000000 /dev/zero | tr '\\0' x"], { cwd: tmpdir() });
  expect(big.exit).toBe(0);
  expect(big.status).toBe(0);
  expect(big.stdout.length).toBe(3_000_000);
  const killed = run(["sh", "-c", "kill -9 $$"], { cwd: tmpdir() });
  expect(killed.status).toBe(1);
  expect(killed.exit).toBeNull();
  expect(killed.signal).toBe("SIGKILL");
  const missing = run(["/nonexistent/2026-11-01-003/binary"], { cwd: tmpdir() });
  expect(missing.exit).toBeNull();
  expect(missing.status).toBe(1);
  expect(missing.signal).toBeUndefined();
  expect(missing.error).toContain("ENOENT");
  expect(statusLine(missing)).toBe(`exit null, ${missing.error}`);
  const overrun = run(["sh", "-c", "head -c 70000000 /dev/zero | tr '\\0' x"], { cwd: tmpdir() });
  expect(overrun.exit).toBeNull();
  expect(overrun.status).toBe(1);
  expect(overrun.error).toContain("ENOBUFS");
});

const recordedRelease = async (
  root: string,
  home: string,
  at: ReturnType<typeof runner>,
  options: Partial<Parameters<typeof release>[0]> = {},
) => {
  const log: string[] = [];
  const code = await release(
    { root, bump: "patch", reason: "x", home, ...options },
    { run: at.run, log: (l) => log.push(l), record: at.record },
  );
  return { code, lines: log.join("\n").split("\n") };
};

test("2026-11-01-003 AC-43: the script records the start after its title line and the end right after the push's ok line, and the pinned program lists are untouched", async () => {
  const { root, home } = fixture();
  const at = runner(root);
  const { code, lines } = await recordedRelease(root, home, at);
  expect(code).toBe(0);
  expect(at.recorded).toEqual([
    ["start", NEW],
    ["done", NEW],
  ]);
  expect(at.events.indexOf("record:start")).toBeLessThan(at.events.indexOf("bun run build"));
  const push = at.events.findIndex((e) => e.startsWith("git push"));
  expect(at.events[push + 1]).toBe("record:done");
  expect(lines.slice(0, 3)).toEqual([
    `Release ${NEW}: x`,
    `  release start: release ${NEW} recorded for session s: the turn may end while it runs`,
    "  1. the version files: ok",
  ]);
  const pushed = lines.indexOf("  6. the push: ok");
  expect(lines[pushed + 1]).toBe(
    `  release done: release ${NEW} done: the session's baseline is now commit abc1234`,
  );
  expect(programs(at.seen)).toEqual([
    "bun run build",
    "bun run check",
    "bun run plugin:check",
    "bun scripts/build.ts --tarball",
    "gh auth token",
    "gh release view",
    "gh release create",
    "gh api repos/WizardingCode-io/wizardingcode-plugins/contents/.claude-plugin/marketplace.json",
    "gh api -X",
    "claude plugin marketplace",
    "claude plugin update",
    "tar xzf",
    "osascript -e",
  ]);
});

test("2026-11-01-003 AC-43: a start that recorded nothing, refused or threw is logged, calls no end record and never fails the release; an end record that throws is logged and the release goes on", async () => {
  const cases: [
    Partial<Record<"start" | "done", (v: string) => RecordResult>>,
    string[],
    number,
  ][] = [
    [
      { start: (v) => ({ recorded: false, text: `release ${v}: no session, nothing recorded` }) },
      [`  release start: release ${NEW}: no session, nothing recorded`],
      1,
    ],
    [
      {
        start: (v) => ({
          recorded: false,
          text: `release ${v}: work item x is active; a release is recorded with no item open`,
        }),
      },
      [
        `  release start: release ${NEW}: work item x is active; a release is recorded with no item open`,
      ],
      1,
    ],
    [
      {
        start: () => {
          throw new Error("boom");
        },
      },
      ["  release start: failed: boom"],
      1,
    ],
    [
      {
        done: () => {
          throw new Error("boom");
        },
      },
      [
        `  release start: release ${NEW} recorded for session s: the turn may end while it runs`,
        "  release done: failed: boom",
      ],
      2,
    ],
  ];
  for (const [answers, logged, calls] of cases) {
    const { root, home } = fixture();
    const at = runner(root, undefined, undefined, answers);
    const { code, lines } = await recordedRelease(root, home, at);
    expect(code, lines.join("\n")).toBe(0);
    for (const line of logged) expect(lines).toContain(line);
    expect(at.recorded.length).toBe(calls);
    expect(lines).toContain("  13. the notification: ok");
  }
});

test("2026-11-01-003 AC-43: no record pair, a dry run and a resume call no record, and a failure before the push calls the start alone", async () => {
  const bare = fixture();
  const none = runner(bare.root);
  const log: string[] = [];
  expect(
    await release(
      { root: bare.root, bump: "patch", reason: "x", home: bare.home },
      { run: none.run, log: (l) => log.push(l) },
    ),
  ).toBe(0);
  expect(none.recorded).toEqual([]);
  expect(log.some((l) => l.startsWith("  release "))).toBe(false);
  const dry = fixture();
  const atDry = runner(dry.root);
  expect((await recordedRelease(dry.root, dry.home, atDry, { dryRun: true })).code).toBe(0);
  expect(atDry.recorded).toEqual([]);
  const { root, home } = fixture();
  const first = runner(root, (cmd) => cmd[0] === "gh" && cmd.includes("PUT"));
  expect((await recordedRelease(root, home, first)).code).toBe(1);
  const resumed = runner(root);
  resumed.world.released.add(`v${NEW}`);
  expect(
    (await recordedRelease(root, home, resumed, { bump: undefined, resume: NEW, fromStep: 7 }))
      .code,
  ).toBe(0);
  expect(resumed.recorded).toEqual([]);
  const failing = fixture();
  const atCheck = runner(failing.root, (cmd) => cmd.join(" ") === "bun run check");
  expect((await recordedRelease(failing.root, failing.home, atCheck)).code).toBe(1);
  expect(atCheck.recorded).toEqual([["start", NEW]]);
});

test("2026-11-01-003 AC-43: step 5 commits only what the release wrote on the commit it started from: a written file changed since step 1 or a commit made meanwhile fails the step before any commit, and the tree goes back", async () => {
  const { root, home } = fixture();
  const start = sh(root, "rev-parse", "HEAD").trim();
  const touched = runner(root, undefined, (cmd) => {
    if (cmd.join(" ") !== "bun run check") return;
    writeFileSync(join(root, "packages/engine/tests/version.test.ts"), "touched by the suite\n");
    writeFileSync(
      join(root, "CLAUDE.md"),
      `${readFileSync(join(root, "CLAUDE.md"), "utf8")}\nan edit under the permit\n`,
    );
  });
  const { code, lines } = await recordedRelease(root, home, touched);
  expect(code).toBe(1);
  expect(lines).toContain(
    `step 5 (the commit and the tag) failed: changed since the release wrote it: packages/engine/tests/version.test.ts; the tree is back at ${start.slice(0, 7)}, nothing released`,
  );
  expect(sh(root, "rev-parse", "HEAD").trim()).toBe(start);
  expect(sh(root, "status", "--porcelain").trim()).toBe("");
  expect(lines).toContain(
    "  discarded by the rollback: CLAUDE.md, packages/engine/tests/version.test.ts",
  );
  expect(touched.recorded).toEqual([["start", NEW]]);
  const other = fixture();
  const begun = sh(other.root, "rev-parse", "HEAD").trim();
  let moved = "";
  const committed = runner(other.root, undefined, (cmd) => {
    if (cmd.join(" ") !== "bun run check") return;
    writeFileSync(join(other.root, "docs-note.md"), "a note\n");
    sh(other.root, "add", "docs-note.md");
    sh(other.root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "note");
    moved = sh(other.root, "rev-parse", "HEAD").trim();
  });
  const second = await recordedRelease(other.root, other.home, committed);
  expect(second.code).toBe(1);
  expect(second.lines).toContain(
    `step 5 (the commit and the tag) failed: HEAD moved since the release started: ${moved.slice(0, 7)}; the tree is back at ${begun.slice(0, 7)}, nothing released`,
  );
  expect(sh(other.root, "rev-parse", "HEAD").trim()).toBe(begun);
  expect(sh(other.root, "reflog")).toContain(moved.slice(0, 7));
  expect(second.lines).toContain(
    `  the commit ${moved.slice(0, 7)} is off main, kept in the reflog`,
  );
  const bundle = "plugins/core/dist/crew.mjs";
  const bundleFailure = `step 5 (the commit and the tag) failed: changed since the release wrote it: ${bundle}; the tree is back at`;
  const rebuilt = fixture();
  const builtAt = join(rebuilt.root, bundle);
  const twice = runner(rebuilt.root, undefined, (cmd) => {
    const c = cmd.join(" ");
    if (c === "bun run build") {
      mkdirSync(dirname(builtAt), { recursive: true });
      writeFileSync(builtAt, "built\n");
    }
    if (c === "bun run check") writeFileSync(builtAt, "rebuilt by the check\n");
  });
  const third = await recordedRelease(rebuilt.root, rebuilt.home, twice);
  expect(third.code).toBe(1);
  expect(third.lines.some((l) => l.startsWith(bundleFailure))).toBe(true);
  const appeared = fixture();
  const lateAt = join(appeared.root, bundle);
  const late = runner(appeared.root, undefined, (cmd) => {
    if (cmd.join(" ") !== "bun run check") return;
    mkdirSync(dirname(lateAt), { recursive: true });
    writeFileSync(lateAt, "late\n");
  });
  const fourth = await recordedRelease(appeared.root, appeared.home, late);
  expect(fourth.code).toBe(1);
  expect(fourth.lines.some((l) => l.startsWith(bundleFailure))).toBe(true);
  // A version file the release wrote, edited under the permit, wiped by a failure before step 5: named.
  const edited = fixture();
  const versionTs = join(edited.root, "packages/engine/src/version.ts");
  const checkFails = runner(
    edited.root,
    (cmd) => cmd.join(" ") === "bun run check",
    (cmd) => {
      if (cmd.join(" ") === "bun run check")
        writeFileSync(versionTs, `${readFileSync(versionTs, "utf8")}// edited under the permit\n`);
    },
  );
  const fifth = await recordedRelease(edited.root, edited.home, checkFails);
  expect(fifth.code).toBe(1);
  expect(fifth.lines).toContain("  discarded by the rollback: packages/engine/src/version.ts");
  expect(sh(edited.root, "status", "--porcelain").trim()).toBe("");
  // The bundle, tracked and rewritten before a failing step, is the build's own output: never named.
  const tracked = fixture({ [bundle]: "the committed bundle\n" });
  const bundleAt = join(tracked.root, bundle);
  const rewritten = runner(
    tracked.root,
    (cmd) => cmd.join(" ") === "bun run check",
    (cmd) => {
      if (cmd.join(" ") === "bun run check") writeFileSync(bundleAt, "rebuilt under the permit\n");
    },
  );
  const sixth = await recordedRelease(tracked.root, tracked.home, rewritten);
  expect(sixth.code).toBe(1);
  expect(sixth.lines.some((l) => l.startsWith("  discarded by the rollback"))).toBe(false);
  expect(sh(tracked.root, "status", "--porcelain").trim()).toBe("");
});

/**
 * One patch release whose install answers `crew projects update` as given (step 12): the exit, the
 * log, the notification, and the command and options step 12 ran with.
 */
async function projectUpdateAnswers(
  update: ReturnType<CommandRunner> | undefined,
  tar: { installBundle?: boolean } = { installBundle: true },
) {
  const { root, home } = fixture();
  const at = runner(root, undefined, undefined, {}, { ...tar, projectsUpdate: update });
  const log: string[] = [];
  const code = await release(
    { root, bump: "patch", reason: "x", home, githubAccount: "andreagroferreira" },
    { run: at.run, log: (l) => log.push(l) },
  );
  const notify = (at.seen.find((c) => c[0] === "osascript") ?? []).join(" ");
  const update12 = at.seen.find((c) => c[0] === "node" && c.includes("projects"));
  const opts12 = at.seenOpts[at.seen.findIndex((c) => c[0] === "node" && c.includes("projects"))];
  return { code, log, notify, update12, opts12, home };
}

test("2026-11-08-002 AC-6: the project update runs before the notification, soft and bounded", async () => {
  // The plan: thirteen steps, the update twelfth, from the tarball install's bundle.
  const planned = fixture();
  const dry = runner(planned.root);
  const planLog: string[] = [];
  expect(
    await release(
      { root: planned.root, bump: "patch", reason: "x", home: planned.home, dryRun: true },
      { run: dry.run, log: (l) => planLog.push(l) },
    ),
  ).toBe(0);
  const steps = planLog.filter((l) => /^\s*\d+\. /.test(l));
  expect(steps).toHaveLength(13);
  expect(steps[11]).toContain("12. the project update: node ");
  expect(steps[11]).toContain("/dist/crew.mjs projects update (skipped when absent; 300 s bound)");
  expect(steps[12]).toContain("13. the notification: ");
  // The install holds a bundle: the step runs it with the bound and the release's home, and the
  // notification carries its count line.
  const count =
    "1 updated, 0 would update, 2 up to date, 0 stale, 0 refused, 0 failed, 0 other root, 0 no adapter, 0 left out, 0 gone";
  const answers = projectUpdateAnswers;
  const ok = await answers({ status: 0, exit: 0, stdout: `${count}\n`, stderr: "" });
  expect(ok.code, ok.log.join("\n")).toBe(0);
  expect(ok.update12).toEqual([
    "node",
    join(ok.home, ".local/share/wizardingcode-developer-crew/dist/crew.mjs"),
    "projects",
    "update",
  ]);
  expect(ok.opts12?.timeoutMs).toBe(300_000);
  expect(ok.opts12?.env?.HOME).toBe(ok.home);
  expect(ok.notify).toContain(`projects: ${count}`);
  expect(ok.log).toContain("  12. the project update: ok");
  expect(ok.log).toContain("  13. the notification: ok");
  // Exit 1 with a count line: the line and the exit, the release still 0.
  const refused = await answers({
    status: 1,
    exit: 1,
    stdout:
      "0 updated, 0 would update, 1 up to date, 0 stale, 1 refused, 0 failed, 0 other root, 0 no adapter, 0 left out, 0 gone\n",
    stderr: "",
  });
  expect(refused.code).toBe(0);
  expect(refused.notify).toContain(
    "projects: 0 updated, 0 would update, 1 up to date, 0 stale, 1 refused, 0 failed, 0 other root, 0 no adapter, 0 left out, 0 gone (exit 1)",
  );
  // A failure with no count line: not updated with the cause, logged soft, the release 0.
  const boom = await answers({ status: 1, exit: 1, stdout: "", stderr: "boom\n" });
  expect(boom.code).toBe(0);
  expect(boom.notify).toContain("projects: not updated (boom)");
  expect(
    boom.log.some(
      (l) =>
        l.startsWith("step 12 (the project update) failed: ") &&
        l.endsWith("(not fatal: the release is out)"),
    ),
  ).toBe(true);
  // Killed at the bound with two project lines out: the signal and the lines printed.
  const killed = await answers({
    status: 1,
    exit: null,
    stdout: "a /x: copilot updated (1 differed, 0 removed)\nb /y: up to date\n",
    stderr: "",
    signal: "SIGTERM",
  });
  expect(killed.code).toBe(0);
  expect(killed.notify).toContain(
    'projects: cut at the bound (killed by SIGTERM after 2 project lines, the last one \\"b /y: up to date\\"; any project listed after it by crew projects update --dry-run may be written in part or not updated; each updated project\'s sessions print its commit command)',
  );
  // Status 0 and no output at all: done.
  const silent = await answers({ status: 0, exit: 0, stdout: "", stderr: "" });
  expect(silent.notify).toContain("projects: done");
  // No bundle in the install (the fixture's tar writes bin/crew alone): the step runs no command.
  const absent = await answers(undefined, {});
  expect(absent.code).toBe(0);
  expect(absent.update12).toBeUndefined();
  expect(absent.notify).toContain("projects: skipped (no local install)");
  expect(absent.log).toContain("  12. the project update: ok");
  // A resume from the notification runs no update: not run; a resume from 12 runs both.
  const { root, home } = fixture();
  const first = runner(root);
  expect(
    await release(
      { root, bump: "patch", reason: "x", home, githubAccount: "andreagroferreira" },
      { run: first.run, log: () => {} },
    ),
  ).toBe(0);
  const from13 = runner(root, undefined, undefined, {}, { installBundle: true });
  from13.world.released.add(`v${NEW}`);
  expect(
    await release(
      { root, resume: NEW, fromStep: 13, reason: "x", home },
      { run: from13.run, log: () => {} },
    ),
  ).toBe(0);
  expect(from13.seen.some((c) => c[0] === "node" && c.includes("projects"))).toBe(false);
  expect((from13.seen.find((c) => c[0] === "osascript") ?? []).join(" ")).toContain(
    "projects: not run",
  );
  // A resume from 12 runs no step 11, so the install's bundle is already there.
  mkdirSync(join(home, ".local/share/wizardingcode-developer-crew/dist"), { recursive: true });
  writeFileSync(join(home, ".local/share/wizardingcode-developer-crew/dist/crew.mjs"), "bundle");
  const from12 = runner(
    root,
    undefined,
    undefined,
    {},
    {
      projectsUpdate: { status: 0, exit: 0, stdout: `${count}\n`, stderr: "" },
    },
  );
  from12.world.released.add(`v${NEW}`);
  expect(
    await release(
      { root, resume: NEW, fromStep: 12, reason: "x", home },
      { run: from12.run, log: () => {} },
    ),
  ).toBe(0);
  expect(programs(from12.seen)).toEqual([
    `node ${join(home, ".local/share/wizardingcode-developer-crew/dist/crew.mjs")} projects`,
    "osascript -e",
  ]);
  expect((from12.seen.find((c) => c[0] === "osascript") ?? []).join(" ")).toContain(
    `projects: ${count}`,
  );
});

// Item 2026-11-09-001, Task 5: the release keeps the install it replaced and says what a kill left (AC-17, AC-20, AC-23, AC-30).

const LOCAL_INSTALL = ".local/share/wizardingcode-developer-crew";
const fullRelease = (root: string, home: string) => ({
  root,
  bump: "patch" as const,
  reason: "x",
  home,
  githubAccount: "andreagroferreira",
});

test("2026-11-09-001 AC-17: a killed project update says what is certain", async () => {
  const killedBy = (stdout: string) =>
    projectUpdateAnswers({ status: 1, exit: null, stdout, stderr: "", signal: "SIGTERM" });
  // Killed before any project line.
  const none = await killedBy("");
  expect(none.code).toBe(0);
  expect(none.log).toContain("  13. the notification: ok");
  expect(none.notify).toContain(
    "projects: cut at the bound (killed by SIGTERM before any project line; the first project listed by crew projects update --dry-run may be written in part and no other is updated)",
  );
  // Killed after every project's line: the user scope line is out, the count line is not.
  const scoped = await killedBy("a /x: up to date\nuser scope: no adapter on this root\n");
  expect(scoped.code).toBe(0);
  expect(scoped.log).toContain("  13. the notification: ok");
  expect(scoped.notify).toContain(
    "projects: cut at the bound (killed by SIGTERM after every project's line, 1 of them; the count line was not printed; each updated project's sessions print its commit command)",
  );
  // Killed after the count line: the count stands.
  const count =
    "0 updated, 0 would update, 1 up to date, 0 stale, 0 refused, 0 failed, 0 other root, 0 no adapter, 0 left out, 0 gone";
  const counted = await killedBy(
    `a /x: up to date\nuser scope: no adapter on this root\n${count}\n`,
  );
  expect(counted.code).toBe(0);
  expect(counted.log).toContain("  13. the notification: ok");
  expect(counted.notify).toContain(`projects: ${count} (killed by SIGTERM after the count line)`);
  // A long project line is cut to 160 characters.
  const long = `p /${"x".repeat(300)}: up to date`;
  const cut = await killedBy(`${long}\n`);
  expect(cut.notify).toContain(
    `killed by SIGTERM after 1 project lines, the last one \\"${long.slice(0, 160)}\\"; any project listed after it`,
  );
  expect(cut.notify).not.toContain(long.slice(0, 161));
});

test("2026-11-09-001 AC-20: the replaced install is kept, and a failed swap puts it back", async () => {
  const { root, home } = fixture();
  const install = join(home, LOCAL_INSTALL);
  // What an earlier release left beside the install.
  mkdirSync(join(`${install}.previous`, "bin"), { recursive: true });
  writeFileSync(join(`${install}.previous`, "bin", "crew"), "older");
  const at = runner(root);
  expect(await release(fullRelease(root, home), { run: at.run, log: () => {} })).toBe(0);
  expect(readFileSync(join(install, "bin", "crew"), "utf8")).toBe("new");
  expect(readFileSync(join(`${install}.previous`, "bin", "crew"), "utf8")).toBe("old");
  // A tar that extracts nothing: the second rename fails and the earlier install is back.
  const failing = fixture();
  const log: string[] = [];
  const empty = runner(failing.root, (cmd) =>
    cmd[0] === "tar" ? { status: 0, exit: 0, stdout: "", stderr: "" } : false,
  );
  await release(fullRelease(failing.root, failing.home), {
    run: empty.run,
    log: (l) => log.push(l),
  });
  expect(log.some((l) => l.includes("the swap failed and the earlier install is back"))).toBe(true);
  expect(readFileSync(join(failing.home, LOCAL_INSTALL, "bin", "crew"), "utf8")).toBe("old");
});

test("2026-11-09-001 AC-23: a resumed step 11 leaves the rollback target", async () => {
  const { root, home } = fixture();
  const install = join(home, LOCAL_INSTALL);
  const first = runner(root, undefined, undefined, {}, { installBundle: true });
  expect(await release(fullRelease(root, home), { run: first.run, log: () => {} })).toBe(0);
  expect(readFileSync(join(`${install}.previous`, "bin", "crew"), "utf8")).toBe("old");
  // Step 11 again for the release already installed: the staged bundle equals the installed one.
  const again = runner(root, undefined, undefined, {}, { installBundle: true });
  again.world.released.add(`v${NEW}`);
  expect(
    await release(
      { root, resume: NEW, fromStep: 11, reason: "x", home },
      { run: again.run, log: () => {} },
    ),
  ).toBe(0);
  expect(readFileSync(join(install, "bin", "crew"), "utf8")).toBe("new");
  expect(readFileSync(join(`${install}.previous`, "bin", "crew"), "utf8")).toBe("old");
  expect(
    readdirSync(dirname(install)).filter((n) =>
      n.startsWith(".wizardingcode-developer-crew-next-"),
    ),
  ).toEqual([]);
});

test("2026-11-09-001 AC-30: a swap cut short is put back and finished", async () => {
  const { root, home } = fixture();
  const install = join(home, LOCAL_INSTALL);
  // What a kill between the two renames leaves: the previous install and no install.
  renameSync(install, `${install}.previous`);
  const log: string[] = [];
  const at = runner(root);
  expect(await release(fullRelease(root, home), { run: at.run, log: (l) => log.push(l) })).toBe(0);
  expect(log).toContain(
    "  11. the local install was missing and its previous one was put back (a swap cut short)",
  );
  expect(readFileSync(join(install, "bin", "crew"), "utf8")).toBe("new");
  expect(readFileSync(join(`${install}.previous`, "bin", "crew"), "utf8")).toBe("old");
  // Neither folder: no install to swap, and no tar runs.
  const none = fixture();
  rmSync(join(none.home, LOCAL_INSTALL), { recursive: true });
  const bare = runner(none.root);
  expect(await release(fullRelease(none.root, none.home), { run: bare.run, log: () => {} })).toBe(
    0,
  );
  expect(bare.seen.some((c) => c[0] === "tar")).toBe(false);
});
