import { expect, test } from "bun:test";
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  bumpVersion,
  type CommandRunner,
  failureLines,
  gitEnv,
  journalPaths,
  leftCommand,
  leftCommandOf,
  nextVersion,
  notificationCommand,
  plannedBump,
  type ReleaseRecord,
  recordedProcess,
  release,
  releaseFiles,
  spawnRunner,
  staleReleaseFiles,
  statusLine,
  stdioFor,
  writePlan,
} from "../../../scripts/release.ts";
import { sha256 } from "../src/fs.ts";
import { processGone, processStart } from "../src/open.ts";
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
  /** A release GitHub holds half made (2026-11-13-004): a draft, or one with no archive. */
  unfinished?: Map<string, "draft" | "no-archive" | "uploading">;
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
    /** What its `crew projects update --dry-run` answers (item 2026-11-09-003); status 0 with no output otherwise. */
    projectsDryRun?: ReturnType<CommandRunner>;
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
  /** The token `gh auth token -u` handed out: every GitHub call must carry that one (2026-11-13-004). */
  const handedToken = () => (world.tokenOutput ?? "ghp_SECRET\n").trim();
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
      expect(opts.env?.GH_TOKEN).toBe(handedToken());
      const viewed = cmd[3] as string;
      if (!world.released.has(viewed))
        return { status: 1, exit: 1, stdout: "", stderr: "release not found" };
      const state = world.unfinished?.get(viewed);
      return ok(
        JSON.stringify({
          isDraft: state === "draft",
          assets:
            state === "no-archive"
              ? []
              : [
                  {
                    name: `wizardingcode-developer-crew-${viewed.slice(1)}.tar.gz`,
                    state: state === "uploading" ? "new" : "uploaded",
                  },
                ],
        }),
      );
    }
    if (cmd[0] === "gh" && cmd[1] === "release" && cmd[2] === "delete") {
      expect(opts.env?.GH_TOKEN).toBe(handedToken());
      world.released.delete(cmd[3] as string);
      world.unfinished?.delete(cmd[3] as string);
      return ok();
    }
    if (cmd[0] === "gh" && cmd[1] === "release" && cmd[2] === "create") {
      expect(opts.env?.GH_TOKEN).toBe(handedToken());
      world.released.add(cmd[3] as string);
      return ok();
    }
    if (cmd[0] === "gh" && cmd[1] === "api" && !cmd.includes("PUT")) {
      expect(opts.env?.GH_TOKEN).toBe(handedToken());
      const content = Buffer.from(`${JSON.stringify(world.marketplace, null, 2)}\n`).toString(
        "base64",
      );
      return ok(JSON.stringify({ sha: "abc123", content }));
    }
    if (cmd[0] === "gh" && cmd[1] === "api" && cmd.includes("PUT")) {
      expect(opts.env?.GH_TOKEN).toBe(handedToken());
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
    if (cmd[0] === "node" && cmd.includes("projects"))
      return (cmd.includes("--dry-run") ? extra.projectsDryRun : extra.projectsUpdate) ?? ok();
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

test("2026-10-31-002 AC-2: with no token for the account, the release stops before step 1, names the account and creates nothing under the active account", async () => {
  const { root, origin, home } = fixture();
  const { run, seen, world } = runner(root, (cmd) => cmd.join(" ").startsWith("gh auth token"));
  const log: string[] = [];
  const code = await release(
    { root, bump: "patch", reason: "x", home, githubAccount: "personal" },
    { run, log: (l) => log.push(l) },
  );
  expect(code).toBe(1);
  const said = log.join("\n");
  expect(said).toContain("gh auth token -u personal gave no token");
  expect(said).not.toContain("step 8");
  expect(seen.filter((c) => c[0] === "gh" && c[1] === "release")).toEqual([]);
  expect(world.released.size).toBe(0);
  // The token is read before step 1 (2026-11-13-004): nothing was pushed.
  expect(sh(origin, "tag", "--list").trim()).toBe("");
});

test("2026-10-31-002 AC-4: a zero exit with empty output is no token: the release stops before step 1 and calls no gh release", async () => {
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
    "gh auth token",
    "bun run build",
    "bun run check",
    "bun run plugin:check",
    "bun scripts/build.ts --tarball",
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
  expect(programs(atCheck.seen)).toEqual([
    "gh auth token",
    "bun run build",
    "bun run check",
    "osascript -e",
  ]);
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
    { run, log: (l) => log.push(l), pushSettleMs: 0 },
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
    { run: at.run, log: (l) => log.push(l), record: at.record, pushSettleMs: 0 },
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
    "gh auth token",
    "bun run build",
    "bun run check",
    "bun run plugin:check",
    "bun scripts/build.ts --tarball",
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
  // The bundle, tracked and rewritten after the build step recorded it, is named (2026-11-13-004 AC-40, finding 221).
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
  expect(sixth.lines).toContain(`  discarded by the rollback: ${bundle}`);
  expect(sh(tracked.root, "status", "--porcelain").trim()).toBe("");
});

/**
 * One patch release whose install answers `crew projects update` as given (step 12): the exit, the
 * log, the notification, and the command and options step 12 ran with.
 */
async function projectUpdateAnswers(
  update: ReturnType<CommandRunner> | undefined,
  tar: { installBundle?: boolean } = { installBundle: true },
  dry?: ReturnType<CommandRunner>,
) {
  const { root, home } = fixture();
  const at = runner(
    root,
    undefined,
    undefined,
    {},
    { ...tar, projectsUpdate: update, projectsDryRun: dry },
  );
  const log: string[] = [];
  const code = await release(
    { root, bump: "patch", reason: "x", home, githubAccount: "andreagroferreira" },
    { run: at.run, log: (l) => log.push(l) },
  );
  const notify = (at.seen.find((c) => c[0] === "osascript") ?? []).join(" ");
  // Step 12 runs the fleet twice: its dry run, then the update (item 2026-11-09-003).
  const fleet = (dryRun: boolean) => (c: string[]) =>
    c[0] === "node" && c.includes("projects") && c.includes("--dry-run") === dryRun;
  const update12 = at.seen.find(fleet(false));
  const opts12 = at.seenOpts[at.seen.findIndex(fleet(false))];
  const dry12 = at.seen.find(fleet(true));
  const dryOpts12 = at.seenOpts[at.seen.findIndex(fleet(true))];
  return { code, log, notify, update12, opts12, dry12, dryOpts12, home, seen: at.seen };
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
  expect(steps[11]).toContain("/dist/crew.mjs projects update --dry-run, then node ");
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
  // What is left of the 300 s after the dry run.
  expect(ok.opts12?.timeoutMs).toBeLessThanOrEqual(300_000);
  expect(ok.opts12?.timeoutMs).toBeGreaterThan(299_000);
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
    'projects: cut at the bound (killed by SIGTERM after 2 project lines, the last one \\"b /y: up to date\\"; any project listed after it by crew projects update --dry-run may be written in part or not updated; each updated project\'s sessions print its commit command; a project left unfinished says what to run at its session start)',
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
  // The fleet's dry run, then its update (item 2026-11-09-003).
  expect(programs(from12.seen)).toEqual([
    `node ${join(home, ".local/share/wizardingcode-developer-crew/dist/crew.mjs")} projects`,
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
    "projects: cut at the bound (killed by SIGTERM before any project line; the first project listed by crew projects update --dry-run may be written in part and no other is updated; a project left unfinished says what to run at its session start)",
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

// Item 2026-11-09-003, Task 4: step 11 sweeps the staging folders a kill left, and step 12 logs the fleet's dry run first (AC-24, AC-25, AC-26, AC-35, AC-36).

const FLEET_COUNT =
  "1 updated, 0 would update, 2 up to date, 0 stale, 0 refused, 0 failed, 0 other root, 0 no adapter, 0 left out, 0 gone";
const answered = (stdout: string) => ({ status: 0, exit: 0, stdout, stderr: "" });
const STAGING = ".wizardingcode-developer-crew-next-";
const swept = (name: string) => `  11. removed a staging folder an earlier swap left: ${name}`;

test("2026-11-09-003 AC-24: step 12 logs the fleet's dry run before the real update, and never waits on it", async () => {
  const dryCount =
    "0 updated, 1 would update, 1 up to date, 0 stale, 0 refused, 0 failed, 0 other root, 0 no adapter, 0 left out, 0 gone";
  const ran = await projectUpdateAnswers(
    answered(`${FLEET_COUNT}\n`),
    { installBundle: true },
    answered(
      `a /x: copilot would update\nb /y: up to date\nuser scope: no adapter on this root\n${dryCount}\n`,
    ),
  );
  expect(ran.code, ran.log.join("\n")).toBe(0);
  // Each line once: the project that would update, then the count line; the project up to date is not logged.
  const logged = ran.log.filter((l) => l.startsWith("  12. dry run: "));
  expect(logged).toEqual([
    "  12. dry run: a /x: copilot would update",
    `  12. dry run: ${dryCount}`,
  ]);
  expect(ran.log.indexOf(`  12. dry run: ${dryCount}`)).toBeLessThan(
    ran.log.indexOf("  12. the project update: ok"),
  );
  const bundle = join(ran.home, ".local/share/wizardingcode-developer-crew/dist/crew.mjs");
  expect(ran.dry12).toEqual(["node", bundle, "projects", "update", "--dry-run"]);
  expect(ran.dryOpts12?.timeoutMs).toBe(60_000);
  expect(ran.seen.indexOf(ran.dry12 as string[])).toBeLessThan(
    ran.seen.indexOf(ran.update12 as string[]),
  );
  expect(ran.notify).toContain(`projects: ${FLEET_COUNT}`);
  // A dry run killed at its bound, and one that prints no count line: said, and the update runs all the same.
  const killed = await projectUpdateAnswers(
    answered(`${FLEET_COUNT}\n`),
    { installBundle: true },
    { status: 1, exit: null, stdout: "", stderr: "", signal: "SIGTERM" },
  );
  expect(killed.log).toContain("  12. dry run: killed by SIGTERM");
  expect(killed.update12).toBeDefined();
  expect(killed.notify).toContain(`projects: ${FLEET_COUNT}`);
  const silent = await projectUpdateAnswers(
    answered(`${FLEET_COUNT}\n`),
    { installBundle: true },
    { status: 1, exit: 1, stdout: "", stderr: "boom\n" },
  );
  expect(silent.log).toContain("  12. dry run: no count line (exit 1)");
  expect(silent.update12).toBeDefined();
  expect(silent.notify).toContain(`projects: ${FLEET_COUNT}`);
});

test("2026-11-09-003 AC-25: a killed update that may leave a project written in part says where that is told", async () => {
  const killedBy = (stdout: string) =>
    projectUpdateAnswers({ status: 1, exit: null, stdout, stderr: "", signal: "SIGTERM" });
  const clause = "; a project left unfinished says what to run at its session start)";
  const none = await killedBy("");
  expect(none.notify).toContain(`may be written in part and no other is updated${clause}`);
  const between = await killedBy("a /x: copilot updated (1 differed, 0 removed)\n");
  expect(between.notify).toContain(
    `may be written in part or not updated; each updated project's sessions print its commit command${clause}`,
  );
  // After every project's line no install is in flight: the clause is not said.
  const after = await killedBy("a /x: up to date\nuser scope: no adapter on this root\n");
  expect(after.notify).toContain("after every project's line");
  expect(after.notify).not.toContain("left unfinished");
});

test("2026-11-09-003 AC-35: the release's listing names both commands of step 12", async () => {
  const planned = fixture();
  const listing = runner(planned.root);
  const log: string[] = [];
  expect(
    await release(
      { root: planned.root, bump: "patch", reason: "x", home: planned.home, dryRun: true },
      { run: listing.run, log: (l) => log.push(l) },
    ),
  ).toBe(0);
  const step = log.find((l) => /^\s*12\. /.test(l)) ?? "";
  expect(step).toContain("/dist/crew.mjs projects update --dry-run, then node ");
  expect(step.endsWith("/dist/crew.mjs projects update (skipped when absent; 300 s bound)")).toBe(
    true,
  );
});

test("2026-11-09-003 AC-26: step 11 removes the staging folders an earlier swap left, and nothing else", async () => {
  const { root, home } = fixture();
  const install = join(home, LOCAL_INSTALL);
  const beside = dirname(install);
  mkdirSync(join(beside, `${STAGING}old`));
  writeFileSync(join(beside, `${STAGING}old`, "file"), "x");
  writeFileSync(join(beside, `${STAGING}file`), "x");
  // Names that only resemble the prefix, and a folder of the person's.
  mkdirSync(join(beside, ".wizardingcode-developer-crew-nextdoor"));
  mkdirSync(join(beside, "keep"));
  const log: string[] = [];
  const at = runner(root);
  expect(await release(fullRelease(root, home), { run: at.run, log: (l) => log.push(l) })).toBe(0);
  expect(log.filter((l) => l.includes("removed a staging folder"))).toEqual([
    swept(`${STAGING}file`),
    swept(`${STAGING}old`),
  ]);
  expect(readdirSync(beside).filter((name) => name.startsWith(STAGING))).toEqual([]);
  expect(existsSync(join(beside, ".wizardingcode-developer-crew-nextdoor"))).toBe(true);
  expect(existsSync(join(beside, "keep"))).toBe(true);
  expect(readFileSync(join(install, "bin", "crew"), "utf8")).toBe("new");
  expect(readFileSync(join(`${install}.previous`, "bin", "crew"), "utf8")).toBe("old");
});

test("2026-11-09-003 AC-36: the sweep never follows a link, and a skipped step sweeps nothing", async () => {
  const { root, home } = fixture();
  const beside = dirname(join(home, LOCAL_INSTALL));
  const outside = mkdtempSync(join(tmpdir(), "release-outside-"));
  writeFileSync(join(outside, "kept"), "x");
  const link = join(beside, `${STAGING}link`);
  symlinkSync(outside, link);
  const log: string[] = [];
  const at = runner(root);
  expect(await release(fullRelease(root, home), { run: at.run, log: (l) => log.push(l) })).toBe(0);
  expect(log).toContain(swept(`${STAGING}link`));
  expect(() => lstatSync(link)).toThrow();
  expect(readFileSync(join(outside, "kept"), "utf8")).toBe("x");
  // No local install: the step is skipped before the sweep.
  const bare = fixture();
  const bareInstall = join(bare.home, LOCAL_INSTALL);
  rmSync(bareInstall, { recursive: true, force: true });
  const left = join(dirname(bareInstall), `${STAGING}old`);
  mkdirSync(left, { recursive: true });
  const bareLog: string[] = [];
  const skipped = runner(bare.root);
  expect(
    await release(fullRelease(bare.root, bare.home), {
      run: skipped.run,
      log: (l) => bareLog.push(l),
    }),
  ).toBe(0);
  expect(existsSync(left)).toBe(true);
  expect(bareLog.some((l) => l.includes("removed a staging folder"))).toBe(false);
});

test("2026-11-09-003 AC-52: a staging folder the sweep cannot remove is said, and the swap goes on", async () => {
  const { root, home } = fixture();
  const install = join(home, LOCAL_INSTALL);
  const stuck = join(dirname(install), `${STAGING}stuck`);
  mkdirSync(stuck);
  writeFileSync(join(stuck, "file"), "x");
  // A folder whose entries cannot be unlinked: the removal fails on its file.
  chmodSync(stuck, 0o555);
  const log: string[] = [];
  try {
    const at = runner(root);
    expect(await release(fullRelease(root, home), { run: at.run, log: (l) => log.push(l) })).toBe(
      0,
    );
  } finally {
    chmodSync(stuck, 0o755);
  }
  const said = log.find((l) => l.startsWith("  11. a staging folder could not be removed: ")) ?? "";
  expect(said).toContain(`${STAGING}stuck (`);
  expect(log.some((l) => l.includes("removed a staging folder"))).toBe(false);
  expect(existsSync(join(stuck, "file"))).toBe(true);
  expect(readFileSync(join(install, "bin", "crew"), "utf8")).toBe("new");
  expect(readFileSync(join(`${install}.previous`, "bin", "crew"), "utf8")).toBe("old");
});

const treeBytes = (root: string, rels: readonly string[]) =>
  Object.fromEntries(rels.map((rel) => [rel, readFileSync(join(root, rel), "utf8")]));

test("2026-11-13-004 AC-44: the bump is a plan and a write: the plan gives each file's text and writes nothing, and writing it leaves the tree as bumpVersion does", () => {
  const planned = fixture();
  const bumped = fixture();
  const paths = journalPaths(planned.root);
  expect(paths).toEqual([
    ...releaseFiles(planned.root),
    "packages/engine/tests/version.test.ts",
    "packages/engine/tests/cli.test.ts",
  ]);
  const before = treeBytes(planned.root, paths);
  const plan = plannedBump(planned.root, OLD, NEW);
  // The plan alone writes nothing.
  expect(treeBytes(planned.root, paths)).toEqual(before);
  expect(sh(planned.root, "status", "--porcelain")).toBe("");
  expect(plan.map((f) => f.rel)).toEqual(paths);
  for (const { rel, text } of plan)
    expect(text, rel).toBe((before[rel] as string).replaceAll(OLD, NEW));
  const written = writePlan(planned.root, plan);
  expect(written).toEqual(bumpVersion(bumped.root, OLD, NEW));
  expect(written).toEqual(paths);
  expect(treeBytes(planned.root, paths)).toEqual(treeBytes(bumped.root, paths));
  // A test literal whose text would not change, and one whose file is absent, are left out of the plan.
  const partial = fixture({
    "packages/engine/tests/version.test.ts": 'test("v", () => {});\n',
  });
  rmSync(join(partial.root, "packages/engine/tests/cli.test.ts"));
  expect(plannedBump(partial.root, OLD, NEW).map((f) => f.rel)).toEqual(releaseFiles(partial.root));
});

const alive = (pid: number) => !processGone(pid);
/** Whether a process is gone within a moment: a kill is delivered at once and the process ends just after. */
const goneSoon = (pid: number, withinMs = 2000) => {
  for (const until = Date.now() + withinMs; alive(pid) && Date.now() < until; )
    spawnSync("sleep", ["0.05"]);
  return !alive(pid);
};
const endProcess = (pid: number | undefined) => {
  if (!pid) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // gone already
  }
};

test("2026-11-13-004 AC-34: the real runner kills a timed-out command with the processes of its own group, and nothing outside it", () => {
  // A process of the row's own group, started before the command: the kill must not reach it.
  const bystander = spawn("sleep", ["60"], { stdio: "ignore" });
  let child = 0;
  try {
    const started = Date.now();
    const r = spawnRunner(false)(["sh", "-c", "sleep 60 & echo $!; sleep 60"], {
      cwd: tmpdir(),
      timeoutMs: 1500,
    });
    const elapsed = Date.now() - started;
    child = Number(r.stdout.trim());
    expect(child).toBeGreaterThan(1);
    expect(r.timedOut).toBe(true);
    expect(r.status).not.toBe(0);
    expect(elapsed).toBeLessThan(6500);
    expect(goneSoon(child)).toBe(true);
    expect(alive(bystander.pid as number)).toBe(true);
    const quick = spawnRunner(false)(["true"], { cwd: tmpdir(), timeoutMs: 1500 });
    expect(quick.status).toBe(0);
    expect(quick.timedOut).toBeUndefined();
  } finally {
    endProcess(bystander.pid);
    endProcess(child);
  }
});

const LOCAL = 120_000;
const REMOTE = 300_000;
const CHECK = 2_700_000;
/** The bound each command of a release must carry, by what it is; null for a command the rows pin elsewhere (the fleet's two). */
const expectedBound = (cmd: readonly string[]): number | null => {
  const line = cmd.join(" ");
  if (cmd[0] === "node" && cmd.includes("projects")) return null;
  if (line === "bun run check") return CHECK;
  if (line.startsWith("gh auth token")) return LOCAL;
  if (cmd[0] === "git")
    return ["fetch", "ls-remote", "push"].includes(cmd[1] as string) ? REMOTE : LOCAL;
  if (["gh", "claude", "tar"].includes(cmd[0] as string)) return REMOTE;
  if (cmd[0] === "bun") return REMOTE;
  return LOCAL;
};

test("2026-11-13-004 AC-51: every command of a release and of a resume carries its bound and the command file, and every git command asks nothing of a terminal", async () => {
  const { root, home } = fixture();
  const at = runner(
    root,
    () => false,
    () => {},
    {},
    { installBundle: true },
  );
  expect(
    await release(
      { root, bump: "patch", reason: "x", home },
      { run: at.run, log: () => {}, env: {} },
    ),
  ).toBe(0);
  const resumed = runner(root);
  resumed.world.released.add(`v${NEW}`);
  expect(
    await release(
      { root, resume: NEW, fromStep: 7, reason: "x", home },
      { run: resumed.run, log: () => {}, env: { GIT_SSH_COMMAND: "ssh -i key" } },
    ),
  ).toBe(0);
  const kinds = new Set<string>();
  for (const run of [at, resumed])
    run.seen.forEach((cmd, i) => {
      const opts = run.seenOpts[i] as Parameters<CommandRunner>[1];
      expect(opts.timeoutMs, cmd.join(" ")).toBeGreaterThan(0);
      // A notification is no command of the release's work: it never writes the command file.
      expect(opts.commandFile, cmd.join(" ")).toBe(
        cmd[0] === "osascript" ? undefined : join(root, "dist/release-in-progress.command"),
      );
      const bound = expectedBound(cmd);
      if (bound !== null) expect(opts.timeoutMs, cmd.join(" ")).toBe(bound);
      kinds.add(`${cmd[0]} ${cmd[1]}:${opts.timeoutMs}`);
      if (cmd[0] !== "git") return;
      expect(opts.env?.GIT_TERMINAL_PROMPT, cmd.join(" ")).toBe("0");
      // The one read of git's configured ssh command comes before the environment it decides.
      if (cmd[1] === "config") return;
      expect(opts.env?.GIT_SSH_COMMAND, cmd.join(" ")).toBe(
        run === at ? "ssh -o BatchMode=yes" : undefined,
      );
    });
  // One of each kind ran, so the loop above asserted each.
  for (const kind of [
    `git status:${LOCAL}`,
    `git fetch:${REMOTE}`,
    `git push:${REMOTE}`,
    `git ls-remote:${REMOTE}`,
    `bun run:${REMOTE}`,
    `bun run:${CHECK}`,
    `bun scripts/build.ts:${REMOTE}`,
    `gh auth:${LOCAL}`,
    `gh api:${REMOTE}`,
    `gh release:${REMOTE}`,
    `claude plugin:${REMOTE}`,
    `tar xzf:${REMOTE}`,
    `osascript -e:${LOCAL}`,
    "node " + join(home, ".local/share/wizardingcode-developer-crew/dist/crew.mjs") + ":60000",
  ])
    expect([...kinds], kind).toContain(kind);
  expect(gitEnv({})).toEqual({ GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes" });
  expect(gitEnv({ GIT_SSH_COMMAND: "ssh -i key" })).toEqual({ GIT_TERMINAL_PROMPT: "0" });
});

test("2026-11-13-004 AC-51: a bounded command of the real runner reads the null device, and a command with no bound is run as before", () => {
  expect(stdioFor({ cwd: "/", input: "x", timeoutMs: 5 })).toEqual(["pipe", "pipe", "pipe"]);
  expect(stdioFor({ cwd: "/", timeoutMs: 5 })).toEqual(["ignore", "pipe", "pipe"]);
  expect(stdioFor({ cwd: "/" })).toEqual(["inherit", "pipe", "pipe"]);
  const probe = ["sh", "-c", "[ /dev/stdin -ef /dev/null ] && echo null; true"];
  expect(spawnRunner(false)(probe, { cwd: tmpdir(), timeoutMs: 5000 }).stdout.trim()).toBe("null");
  expect(spawnRunner(false)(probe, { cwd: tmpdir(), input: "x" }).stdout.trim()).toBe("");
  const free = spawnRunner(false)(["true"], { cwd: tmpdir() });
  expect(free.status).toBe(0);
  expect(free.timedOut).toBeUndefined();
});

test("2026-11-13-004 AC-51: a command the runner says timed out fails its step with the bound in the first line, the present line second, its output kept, and the tree put back; a precondition's says its own line", async () => {
  const { root, home } = fixture();
  const head = sh(root, "rev-parse", "HEAD").trim();
  const timedOut = {
    status: 1,
    exit: null,
    stdout: "half a check\n",
    stderr: "",
    signal: "SIGTERM",
    timedOut: true,
  };
  const at = runner(root, failing("bun run check", timedOut));
  const { code, lines } = await releaseLog(root, home, at.run);
  expect(code).toBe(1);
  const failed = lines.findIndex((l) => l.startsWith("step 3 (bun run check) failed: "));
  expect(lines[failed]).toBe(
    `step 3 (bun run check) failed: the check timed out after 2700 s; the tree is back at ${head.slice(0, 7)}, nothing released`,
  );
  expect(lines[failed + 1]).toMatch(
    new RegExp(
      `^  the check \\(exit null, signal SIGTERM\\): .* \\(the whole output in dist/release-${NEW}-step-3\\.log\\)$`,
    ),
  );
  expect(lines[failed + 2]).toBe("  processes that left the command's group may still be running");
  expect(readFileSync(stepLog(root, 3), "utf8")).toContain("half a check");
  expect(sh(root, "status", "--porcelain").trim()).toBe("");
  expect(sh(root, "rev-parse", "HEAD").trim()).toBe(head);
  expect((at.seen.find((c) => c[0] === "osascript") as string[]).join(" ")).toContain(
    "the check timed out after 2700 s",
  );
  const slow = runner(root, (cmd) =>
    cmd[0] === "git" && cmd[1] === "fetch"
      ? { status: 1, exit: null, stdout: "", stderr: "", signal: "SIGTERM", timedOut: true }
      : false,
  );
  const stopped = await releaseLog(root, home, slow.run);
  expect(stopped.code).toBe(1);
  expect(stopped.lines).toEqual(["origin is not reachable: timed out after 300 s"]);
});

test("2026-11-13-004 AC-52: a bounded command of the real runner writes its own pid and start and its starter's to the command file, and the file is gone when it returns", () => {
  const dir = mkdtempSync(join(tmpdir(), "command-"));
  const file = join(dir, "dist", "release-in-progress.command");
  const r = spawnRunner(false)(["cat", file], { cwd: dir, timeoutMs: 5000, commandFile: file });
  expect(r.status).toBe(0);
  const lines = r.stdout.split("\n").map((l) => l.trim());
  expect(lines.length).toBe(5);
  expect(lines[0]).toMatch(/^[0-9]+$/);
  expect(Number(lines[0])).toBeGreaterThan(1);
  expect(lines[1]).toMatch(/^\w{3} \w{3} [ 0-9]\d \d\d:\d\d:\d\d \d{4}$/);
  expect(lines[2]).toBe(String(process.pid));
  expect(lines[3]).toBe(processStart(process.pid));
  expect(lines[4]).toBe("");
  expect(readdirSync(join(dir, "dist"))).toEqual([]);
  // A command with spaces, quotes and a dollar in a word reaches the command as that word.
  const word = 'it\'s "q" $HOME';
  const echoed = spawnRunner(false)(["printf", "%s", word], {
    cwd: dir,
    timeoutMs: 5000,
    commandFile: file,
  });
  expect(echoed.stdout).toBe(word);
  const cut = spawnRunner(false)(["sleep", "30"], { cwd: dir, timeoutMs: 300, commandFile: file });
  expect(cut.timedOut).toBe(true);
  expect(readdirSync(join(dir, "dist"))).toEqual([]);
});

const NO_TOKEN = (account: string) =>
  `gh auth token -u ${account} gave no token: nothing written, nothing pushed by this release; log in to that account with gh auth login`;
const noToken = (cmd: readonly string[]) => cmd.join(" ").startsWith("gh auth token");
/** The script of each notification sent, and the script a line gives under a title. */
const notified = (seen: string[][]): string[] =>
  seen.filter((c) => c[0] === "osascript").map((c) => c[2] as string);
const notice = (line: string, title = `crew ${NEW}`) =>
  notificationCommand(title, line)[2] as string;
const JOURNAL_FILE = "dist/release-in-progress.journal";
/** Every file under a folder, by its path. */
const filesUnder = (dir: string): string[] =>
  existsSync(dir)
    ? readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? filesUnder(join(dir, e.name)) : [join(dir, e.name)],
      )
    : [];
type Outcome = Parameters<NonNullable<Parameters<typeof release>[1]["report"]>>[0];

test("2026-11-13-004 AC-56: a new release whose account gives no token stops before step 1 with nothing written, pushed or reported as a failed step", async () => {
  const { root, origin, home } = fixture();
  const at = runner(root, noToken);
  const log: string[] = [];
  const reports: Outcome[] = [];
  const code = await release(
    { root, bump: "patch", reason: "x", home, githubAccount: "personal" },
    { run: at.run, log: (l) => log.push(l), report: (o) => reports.push(o) },
  );
  expect(code).toBe(1);
  expect(log).toEqual([NO_TOKEN("personal")]);
  expect(sh(root, "status", "--porcelain")).toBe("");
  expect(sh(root, "tag", "--list").trim()).toBe("");
  expect(sh(origin, "tag", "--list").trim()).toBe("");
  expect(existsSync(join(root, JOURNAL_FILE))).toBe(false);
  // The stop's line is reported with it since 2026-11-13-005.
  expect(reports).toEqual([
    { version: NEW, code: 1, failedStep: null, pending: false, stopped: NO_TOKEN("personal") },
  ]);
  // The one command after the token's read is the notification, with the same line.
  expect(at.seen.at(-2)).toEqual(["gh", "auth", "token", "-u", "personal"]);
  expect(notified(at.seen)).toEqual([notice(NO_TOKEN("personal"))]);
  expect(at.seen.at(-1)?.[0]).toBe("osascript");
  // A dry run reads no token, and a release with one reads it once, before step 1's first command.
  const dry = runner(root, noToken);
  expect(
    await release(
      { root, bump: "patch", reason: "x", home, dryRun: true },
      { run: dry.run, log: () => {} },
    ),
  ).toBe(0);
  expect(dry.seen.filter((c) => c[0] === "gh" || c[0] === "osascript")).toEqual([]);
  const whole = runner(root);
  expect(
    await release({ root, bump: "patch", reason: "x", home }, { run: whole.run, log: () => {} }),
  ).toBe(0);
  expect(whole.seen.filter(noToken).length).toBe(1);
  expect(programs(whole.seen)[0]).toBe("gh auth token");
});

test("2026-11-13-004 AC-56: a resume with no token stops before its first step and reports the step it resumes from, and a resume from step 10 needs none", async () => {
  const { root, home } = fixture();
  expect(
    await release(
      { root, bump: "patch", reason: "x", home },
      { run: runner(root).run, log: () => {} },
    ),
  ).toBe(0);
  for (const from of [9, 7]) {
    const at = runner(root, noToken);
    at.world.released.add(`v${NEW}`);
    const log: string[] = [];
    const reports: Outcome[] = [];
    expect(
      await release(
        { root, resume: NEW, fromStep: from, reason: "x", home, githubAccount: "personal" },
        { run: at.run, log: (l) => log.push(l), report: (o) => reports.push(o) },
      ),
    ).toBe(1);
    expect(log).toEqual([
      "gh auth token -u personal gave no token: nothing resumed; log in to that account with gh auth login",
    ]);
    expect(reports).toEqual([{ version: NEW, code: 1, failedStep: from, pending: true }]);
    expect(programs(at.seen)).toEqual(["gh auth token", "osascript -e"]);
    expect(notified(at.seen)).toEqual([
      notice(
        "gh auth token -u personal gave no token: nothing resumed; log in to that account with gh auth login",
      ),
    ]);
  }
  const late = runner(root, noToken);
  const log: string[] = [];
  expect(
    await release(
      { root, resume: NEW, fromStep: 10, reason: "x", home },
      { run: late.run, log: (l) => log.push(l) },
    ),
  ).toBe(0);
  expect(late.seen.filter(noToken)).toEqual([]);
  expect(log.at(-1)).toBe(`released ${NEW}`);
});

test("2026-11-13-004 AC-56: the token's output reaches no log line, no file under dist and no notification, found, failed or timed out", async () => {
  const MARK = "ghp_SENTINEL_7f3a";
  const cases: { fail?: ReturnType<CommandRunner>; code: number; line?: string }[] = [
    { code: 0 },
    {
      fail: { status: 1, exit: 1, stdout: `${MARK}\n`, stderr: `${MARK} denied\n` },
      code: 1,
      line: NO_TOKEN("andreagroferreira"),
    },
    {
      fail: {
        status: 1,
        exit: null,
        stdout: `${MARK}\n`,
        stderr: "",
        signal: "SIGTERM",
        timedOut: true,
      },
      code: 1,
      line: "gh auth token -u andreagroferreira timed out after 120 s: nothing written, nothing pushed by this release; log in to that account with gh auth login",
    },
  ];
  for (const c of cases) {
    const { root, home } = fixture();
    const at = runner(root, (cmd) => (noToken(cmd) && c.fail ? c.fail : false));
    at.world.tokenOutput = `${MARK}\n`;
    const { code, lines } = await releaseLog(root, home, at.run);
    expect(code).toBe(c.code);
    if (c.line) expect(lines).toEqual([c.line]);
    expect(lines.join("\n")).not.toContain(MARK);
    for (const file of filesUnder(join(root, "dist")))
      expect(readFileSync(file, "utf8"), file).not.toContain(MARK);
    for (const cmd of at.seen.filter((s) => s[0] === "osascript"))
      expect(cmd.join(" ")).not.toContain(MARK);
    // The found case went to its end with the sentinel as the token of every GitHub call.
    if (c.code === 0) expect(at.world.tokened.length).toBeGreaterThan(2);
  }
});

const BUNDLE_FILE = "plugins/core/dist/crew.mjs";
/** A fixture whose bundle is committed, as the repository's is: an untracked one would hide every row on putting it back. */
const bundled = () => fixture({ [BUNDLE_FILE]: "bundle at the start\n" });
/** The fake build writes the bundle, as the real one does. */
const building =
  (root: string, then: (cmd: readonly string[]) => void = () => {}) =>
  (cmd: readonly string[]) => {
    if (cmd.join(" ") === "bun run build") writeFileSync(join(root, BUNDLE_FILE), "built\n");
    then(cmd);
  };
const readJournalFile = (root: string) =>
  JSON.parse(readFileSync(join(root, JOURNAL_FILE), "utf8")) as Record<string, unknown>;
/** What a release left of its journal and its command file under dist: the two files, and any file written beside one. */
const inProgress = (root: string) =>
  existsSync(join(root, "dist"))
    ? readdirSync(join(root, "dist")).filter(
        (n) => n.startsWith("release-in-progress") || n.endsWith(".tmp"),
      )
    : [];

test("2026-11-13-004 AC-44: the journal is written before step 1 writes anything, gains the bundle's hash after the build, and is gone after the push and after a rollback", async () => {
  const { root, home } = bundled();
  const head = sh(root, "rev-parse", "HEAD").trim();
  const plan = plannedBump(root, OLD, NEW);
  let atStart: Record<string, unknown> | null = null;
  let versionAtStart = "";
  let atCheck: Record<string, unknown> | null = null;
  const at = runner(
    root,
    () => false,
    building(root, (cmd) => {
      if (cmd.join(" ") === "bun run check") atCheck = readJournalFile(root);
    }),
    {
      start: () => {
        atStart = readJournalFile(root);
        versionAtStart = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
        return { recorded: true, text: "recorded" };
      },
    },
  );
  const { code } = await recordedRelease(root, home, at);
  expect(code).toBe(0);
  expect(versionAtStart).toBe(OLD);
  const journal = atStart as unknown as Record<string, unknown>;
  expect(journal).toEqual({
    version: NEW,
    tag: `v${NEW}`,
    title: `Release ${NEW}: x`,
    head,
    pid: process.pid,
    processStart: processStart(process.pid),
    writtenAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/),
    files: Object.fromEntries(plan.map((f) => [f.rel, sha256(f.text)])),
  });
  expect(atCheck as unknown).toEqual({ ...journal, bundle: sha256("built\n") });
  // Gone after the push, with nothing left beside it.
  expect(inProgress(root)).toEqual([]);
});

test("2026-11-13-004 AC-44: a failed or timed-out step before the push leaves no journal, a dry run writes none, and a journal that cannot be written stops the release with nothing changed", async () => {
  for (const result of [
    { status: 1, exit: 1, stdout: "", stderr: "red" },
    { status: 1, exit: null, stdout: "", stderr: "", signal: "SIGTERM", timedOut: true },
  ]) {
    const { root, home } = bundled();
    let seen = false;
    const at = runner(
      root,
      failing("bun run check", result),
      building(root, (cmd) => {
        if (cmd.join(" ") === "bun run check") seen = existsSync(join(root, JOURNAL_FILE));
      }),
    );
    expect((await releaseLog(root, home, at.run)).code).toBe(1);
    expect(seen).toBe(true);
    expect(inProgress(root)).toEqual([]);
    expect(sh(root, "status", "--porcelain")).toBe("");
  }
  const dry = bundled();
  expect(
    await release(
      { root: dry.root, bump: "patch", reason: "x", home: dry.home, dryRun: true },
      { run: runner(dry.root).run, log: () => {} },
    ),
  ).toBe(0);
  expect(existsSync(join(dry.root, "dist"))).toBe(false);
  // A dist that cannot be written: the release stops before step 1.
  if (process.getuid?.() === 0) return;
  const { root, home } = bundled();
  mkdirSync(join(root, "dist"));
  chmodSync(join(root, "dist"), 0o555);
  try {
    const reports: Outcome[] = [];
    const log: string[] = [];
    const code = await release(
      { root, bump: "patch", reason: "x", home },
      { run: runner(root).run, log: (l) => log.push(l), report: (o) => reports.push(o) },
    );
    expect(code).toBe(1);
    expect(log.length).toBe(1);
    expect(log[0]).toMatch(/^the release's journal could not be written \(.+\): nothing written$/);
    // The stop's line is reported with it since 2026-11-13-005.
    expect(reports).toEqual([
      {
        version: NEW,
        code: 1,
        failedStep: null,
        pending: false,
        stopped: expect.stringMatching(/^the release's journal could not be written/),
      },
    ]);
    expect(sh(root, "status", "--porcelain")).toBe("");
    expect(sh(root, "tag", "--list").trim()).toBe("");
  } finally {
    chmodSync(join(root, "dist"), 0o755);
  }
});

test("2026-11-13-004 AC-44: a resume whose tag is on origin removes a journal of its own version and leaves one of another", async () => {
  const { root, home } = bundled();
  expect((await releaseLog(root, home, runner(root, () => false, building(root)).run)).code).toBe(
    0,
  );
  const journal = (version: string) =>
    writeFileSync(join(root, JOURNAL_FILE), JSON.stringify({ version, tag: `v${version}` }));
  for (const [version, left] of [
    [NEW, false],
    ["9.9.9", true],
  ] as const) {
    journal(version);
    const at = runner(root);
    at.world.released.add(`v${NEW}`);
    expect(
      await release(
        { root, resume: NEW, fromStep: 10, reason: "x", home },
        { run: at.run, log: () => {} },
      ),
    ).toBe(0);
    expect(existsSync(join(root, JOURNAL_FILE))).toBe(left);
  }
});

const isPush = (cmd: readonly string[]) => cmd[0] === "git" && cmd[1] === "push";
const TIMED_OUT = {
  status: 1,
  exit: null,
  stdout: "",
  stderr: "",
  signal: "SIGTERM",
  timedOut: true,
};
const FAILED = { status: 1, exit: 1, stdout: "", stderr: "fatal: the remote end hung up\n" };
/** The push done for real, whatever the runner then says of it: the tag and main reach origin. */
const pushesAnyway = (root: string) => (cmd: readonly string[]) => {
  if (isPush(cmd)) sh(root, ...cmd.slice(1));
};
const UNKNOWN_PUSH = `step 6 (the push) failed: the push's outcome is unknown: origin could not be asked; nothing was reset; run bun scripts/release.ts --resume v${NEW} when origin answers: it goes on if the tag is there; if it says there is nothing to resume, the next new release puts the tree back`;

test("2026-11-13-004 AC-36: a push that failed or timed out and is on origin counts as done, and the release goes on from step 7 with one end record", async () => {
  for (const result of [FAILED, TIMED_OUT]) {
    const { root, origin, home } = bundled();
    const at = runner(
      root,
      (cmd) => (isPush(cmd) ? result : false),
      building(root, pushesAnyway(root)),
    );
    const { code, lines } = await recordedRelease(root, home, at);
    expect(code, lines.join("\n")).toBe(0);
    expect(lines).toContain("  6. the push: ok (found on origin after the push command failed)");
    expect(lines.at(-1)).toBe(`released ${NEW}`);
    expect(sh(origin, "tag", "--list").trim()).toBe(`v${NEW}`);
    const push = at.events.findIndex((e) => e.startsWith("git push"));
    const tarball = at.events.indexOf("bun scripts/build.ts --tarball");
    const done = at.events.flatMap((e, i) => (e === "record:done" ? [i] : []));
    expect(done.length).toBe(1);
    expect(done[0]).toBeGreaterThan(push);
    expect(done[0]).toBeLessThan(tarball);
    expect(inProgress(root)).toEqual([]);
  }
});

test("2026-11-13-004 AC-36: a timed-out push that is not on origin puts the tree back, and one whose origin cannot be asked resets nothing and is held pending at step 7", async () => {
  const absent = bundled();
  const head = sh(absent.root, "rev-parse", "HEAD").trim();
  const cut = runner(
    absent.root,
    (cmd) => (isPush(cmd) ? TIMED_OUT : false),
    building(absent.root),
  );
  const back = await releaseLog(absent.root, absent.home, cut.run);
  expect(back.code).toBe(1);
  expect(back.lines.join("\n")).toContain(
    `step 6 (the push) failed: git push timed out after 300 s; the tree is back at ${head.slice(0, 7)}, nothing released`,
  );
  expect(sh(absent.root, "rev-parse", "HEAD").trim()).toBe(head);
  expect(sh(absent.root, "status", "--porcelain")).toBe("");
  expect(sh(absent.root, "tag", "--list").trim()).toBe("");
  expect(inProgress(absent.root)).toEqual([]);

  const { root, origin, home } = bundled();
  const start = sh(root, "rev-parse", "HEAD").trim();
  const unknown = runner(
    root,
    (cmd) => (isPush(cmd) ? TIMED_OUT : cmd[1] === "ls-remote" ? FAILED : false),
    building(root),
  );
  const reports: Outcome[] = [];
  const log: string[] = [];
  const code = await release(
    { root, bump: "patch", reason: "x", home },
    { run: unknown.run, log: (l) => log.push(l), report: (o) => reports.push(o), pushSettleMs: 0 },
  );
  expect(code).toBe(1);
  expect(log).toContain(UNKNOWN_PUSH);
  expect(log.join("\n")).not.toContain("the tree is back");
  expect(reports).toEqual([
    { version: NEW, code: 1, failedStep: 7, pending: true, localUnconfirmed: true },
  ]);
  expect((unknown.seen.find((c) => c[0] === "osascript") as string[]).join(" ")).toContain(
    "the push's outcome is unknown",
  );
  // Nothing was reset: the release's commit and tag are still here, with the journal.
  expect(sh(root, "rev-parse", "HEAD~1").trim()).toBe(start);
  expect(sh(root, "log", "-1", "--format=%s").trim()).toBe(`Release ${NEW}: x`);
  expect(sh(root, "tag", "--list").trim()).toBe(`v${NEW}`);
  expect(sh(root, "status", "--porcelain")).toBe("");
  expect(readJournalFile(root).version).toBe(NEW);
  // Origin answers and has the tag: the resume removes the journal and runs steps 7 to 13.
  sh(root, "push", "-q", "origin", "main", `v${NEW}`);
  expect(sh(origin, "tag", "--list").trim()).toBe(`v${NEW}`);
  const resumed = runner(root);
  const logR: string[] = [];
  expect(
    await release(
      { root, resume: NEW, reason: "x", home },
      { run: resumed.run, log: (l) => logR.push(l) },
    ),
  ).toBe(0);
  expect(logR[0]).toBe(`resuming release ${NEW} from step 7`);
  expect(logR).toContain("  7. the tarball: ok");
  expect(logR.at(-1)).toBe(`released ${NEW}`);
  expect(inProgress(root)).toEqual([]);
});

test("2026-11-13-004 AC-36: a tarball step that fails or times out leaves no archive, and the resume builds it again", async () => {
  for (const result of [FAILED, TIMED_OUT]) {
    const { root, home } = bundled();
    const archive = join(root, "dist", `wizardingcode-developer-crew-${NEW}.tar.gz`);
    const at = runner(
      root,
      (cmd) => (cmd.includes("--tarball") ? result : false),
      building(root, (cmd) => {
        if (cmd.includes("--tarball")) writeFileSync(archive, "half an archive");
      }),
    );
    const failed = await releaseLog(root, home, at.run);
    expect(failed.code).toBe(1);
    expect(failed.lines.join("\n")).toContain(
      `resume with: bun scripts/release.ts --resume v${NEW} --from-step 7`,
    );
    expect(existsSync(archive)).toBe(false);
    // The push went through: the journal went with it, whatever fails afterwards (AC-44).
    expect(inProgress(root)).toEqual([]);
    const resumed = runner(root);
    const log: string[] = [];
    expect(
      await release(
        { root, resume: NEW, fromStep: 7, reason: "x", home },
        { run: resumed.run, log: (l) => log.push(l) },
      ),
    ).toBe(0);
    expect(programs(resumed.seen)).toContain("bun scripts/build.ts --tarball");
    expect(log).toContain("  7. the tarball: ok");
    expect(readFileSync(archive, "utf8")).toBe("tgz");
  }
});

const LOCK_LINE =
  "if no git command is running, remove the lock file git names and run the release again";

test("2026-11-13-004 AC-50: the lock a timed-out index write of the release left is removed and the tree put back; a lock with no such command is never removed, and a rollback that cannot reset says so and keeps the journal", async () => {
  // A timed-out git commit that left its lock: removed, then the rollback.
  const left = bundled();
  const lockOf = (root: string) => join(root, ".git", "index.lock");
  const head = sh(left.root, "rev-parse", "HEAD").trim();
  const atCommit = runner(
    left.root,
    (cmd) => (cmd[1] === "commit" ? TIMED_OUT : false),
    building(left.root, (cmd) => {
      if (cmd[1] === "commit") writeFileSync(lockOf(left.root), "");
    }),
  );
  const cut = await releaseLog(left.root, left.home, atCommit.run);
  expect(cut.code).toBe(1);
  expect(existsSync(lockOf(left.root))).toBe(false);
  expect(cut.lines.join("\n")).toContain(
    `step 5 (the commit and the tag) failed: git commit timed out after 120 s; the tree is back at ${head.slice(0, 7)}, nothing released`,
  );
  expect(sh(left.root, "status", "--porcelain")).toBe("");
  expect(inProgress(left.root)).toEqual([]);

  // A second index-writing verb, git add: its lock goes the same way.
  const added = bundled();
  const atAdd = runner(
    added.root,
    (cmd) => (cmd[1] === "add" ? TIMED_OUT : false),
    building(added.root, (cmd) => {
      if (cmd[1] === "add") writeFileSync(lockOf(added.root), "");
    }),
  );
  expect((await releaseLog(added.root, added.home, atAdd.run)).code).toBe(1);
  expect(existsSync(lockOf(added.root))).toBe(false);
  expect(sh(added.root, "status", "--porcelain")).toBe("");

  // A timed-out push takes no index lock: a lock present then is somebody else's, and stays.
  const pushed = bundled();
  const atPush = runner(
    pushed.root,
    (cmd) => (isPush(cmd) ? TIMED_OUT : false),
    building(pushed.root, (cmd) => {
      if (isPush(cmd)) writeFileSync(lockOf(pushed.root), "");
    }),
  );
  try {
    const stuck = await releaseLog(pushed.root, pushed.home, atPush.run);
    expect(stuck.code).toBe(1);
    expect(existsSync(lockOf(pushed.root))).toBe(true);
    const said = stuck.lines.join("\n");
    expect(stuck.lines).toContain("step 6 (the push) failed: git push timed out after 300 s");
    expect(said).toMatch(
      new RegExp(`the rollback could not put the tree back: .*index\\.lock.*; ${LOCK_LINE}`),
    );
    expect(said).not.toContain("the tree is back");
    // Nothing further changed: the tag, the commit and the journal are still there.
    expect(readJournalFile(pushed.root).version).toBe(NEW);
    expect(existsSync(join(pushed.root, ".git", "refs", "tags", `v${NEW}`))).toBe(true);
    expect((atPush.seen.find((c) => c[0] === "osascript") as string[]).join(" ")).toContain(
      "the rollback could not put the tree back",
    );
  } finally {
    rmSync(lockOf(pushed.root), { force: true });
  }

  // A failed check with a lock the release did not leave: the lock stays.
  const foreign = bundled();
  writeFileSync(lockOf(foreign.root), "");
  try {
    const at = runner(foreign.root, failing("bun run check", FAILED), building(foreign.root));
    const stopped = await releaseLog(foreign.root, foreign.home, at.run);
    expect(stopped.code).toBe(1);
    expect(existsSync(lockOf(foreign.root))).toBe(true);
    expect(stopped.lines.join("\n")).toContain(LOCK_LINE);
    expect(readJournalFile(foreign.root).version).toBe(NEW);
  } finally {
    rmSync(lockOf(foreign.root), { force: true });
  }
});

test("2026-11-13-004 AC-40: the rollback's log names the bundle when it was rebuilt after the build step, and not otherwise", async () => {
  const discardedLine = (lines: string[]) =>
    lines.find((l) => l.startsWith("  discarded by the rollback: ")) ?? "";
  // Rebuilt during the check, then the plugin check fails.
  const rebuilt = bundled();
  const again = runner(
    rebuilt.root,
    failing("bun run plugin:check", FAILED),
    building(rebuilt.root, (cmd) => {
      if (cmd.join(" ") === "bun run check")
        writeFileSync(join(rebuilt.root, BUNDLE_FILE), "rebuilt by a session\n");
    }),
  );
  const named = await releaseLog(rebuilt.root, rebuilt.home, again.run);
  expect(named.code).toBe(1);
  expect(discardedLine(named.lines)).toBe(`  discarded by the rollback: ${BUNDLE_FILE}`);
  // The bundle as the build left it: not named.
  const same = bundled();
  const kept = await releaseLog(
    same.root,
    same.home,
    runner(same.root, failing("bun run plugin:check", FAILED), building(same.root)).run,
  );
  expect(kept.code).toBe(1);
  expect(discardedLine(kept.lines)).toBe("");
  // A failure at the build step itself, the bundle half written: not named.
  const early = bundled();
  const atBuild = await releaseLog(
    early.root,
    early.home,
    runner(early.root, failing("bun run build", FAILED), building(early.root)).run,
  );
  expect(atBuild.code).toBe(1);
  expect(discardedLine(atBuild.lines)).toBe("");
});

const DRIVER = `
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
const [releasePath, root, home, at, from, to] = process.argv.slice(2);
const { release, plannedBump } = await import(releasePath);
const ok = (stdout = "") => ({ status: 0, exit: 0, stdout, stderr: "" });
const run = (cmd, opts) => {
  const line = cmd.join(" ");
  const hit =
    (at === "check" && line === "bun run check") ||
    (at === "tag" && cmd[0] === "git" && cmd[1] === "tag") ||
    (at === "push" && cmd[0] === "git" && cmd[1] === "push");
  // The kill: the process ends here, mid-step, with no rollback.
  if (hit) process.exit(137);
  if (cmd[0] === "git") {
    // The driver's own environment, which the row made (the test identity included), is git's.
    const r = spawnSync("git", cmd.slice(1), { cwd: opts.cwd, encoding: "utf8" });
    return { status: r.status ?? 1, exit: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  }
  if (line.startsWith("gh auth token")) return ok("ghp_SECRET\\n");
  if (line === "bun run build") writeFileSync(join(root, "plugins/core/dist/crew.mjs"), "built\\n");
  return ok();
};
const record =
  at === "step-1"
    ? {
        start: () => {
          for (const f of plannedBump(root, from, to).slice(0, 2)) writeFileSync(join(root, f.rel), f.text);
          process.exit(137);
        },
        done: () => ({ recorded: false, text: "" }),
      }
    : undefined;
await release({ root, bump: "patch", reason: "x", home }, { run, log: () => {}, record });
process.exit(3);
`;

/**
 * A release killed for real (2026-11-13-004): a process of its own runs the release on the fixture
 * and exits mid-step, at the check, at the tag (right after the commit), at the push (after the
 * tag) or inside step 1 with two files written. It dies with its journal on disk and no rollback,
 * and the journal's pid is a dead process. Returns the journal it left.
 */
function killedRelease(
  fix: { root: string; home: string },
  at: "check" | "tag" | "push" | "step-1",
): Record<string, unknown> {
  const dir = mkdtempSync(join(tmpdir(), "killed-"));
  const driver = join(dir, "driver.ts");
  writeFileSync(driver, DRIVER);
  const r = spawnSync(
    "bun",
    [
      driver,
      join(import.meta.dir, "../../../scripts/release.ts"),
      fix.root,
      fix.home,
      at,
      OLD,
      NEW,
    ],
    {
      encoding: "utf8",
      env: childEnv({
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      }),
    },
  );
  if (r.status !== 137) throw new Error(`the driver did not die at ${at}: ${r.status} ${r.stderr}`);
  return readJournalFile(fix.root);
}

/** The next new release after a kill, stopped at its token's read: the recovery and the preconditions ran, no step did. */
const afterKill = async (fix: { root: string; home: string }) =>
  releaseLog(fix.root, fix.home, runner(fix.root, noToken, building(fix.root)).run);
const KILLED = (journal: Record<string, unknown>, list: string) =>
  `release ${NEW} was killed before its push (written ${journal.writtenAt}): put back: ${list}`;
const LEFT = (list: string) => `left as they are, changed since the release wrote them: ${list}`;

test("2026-11-13-004 AC-46: a release killed during the checks is put back by the next new release, which then goes on", async () => {
  const fix = bundled();
  const head = sh(fix.root, "rev-parse", "HEAD").trim();
  const journal = killedRelease(fix, "check");
  expect(sh(fix.root, "status", "--porcelain")).not.toBe("");
  const files = Object.keys(journal.files as object);
  expect(files).toEqual(journalPaths(fix.root));
  const stateAtFirstStep: string[] = [];
  const at = runner(
    fix.root,
    () => false,
    building(fix.root, (cmd) => {
      if (cmd.join(" ").startsWith("gh auth token"))
        stateAtFirstStep.push(
          sh(fix.root, "status", "--porcelain"),
          String(existsSync(join(fix.root, JOURNAL_FILE))),
        );
    }),
  );
  const { code, lines } = await releaseLog(fix.root, fix.home, at.run);
  expect(code, lines.join("\n")).toBe(0);
  expect(lines[0]).toBe(KILLED(journal, [...files, BUNDLE_FILE].join(", ")));
  expect(lines[1]).toBe(`Release ${NEW}: x`);
  expect(lines.join("\n")).not.toContain("left as they are");
  // Before the release's own steps: the tree clean at the head it started from, the journal gone.
  expect(stateAtFirstStep).toEqual(["", "false"]);
  expect(sh(fix.root, "rev-parse", "HEAD~1").trim()).toBe(head);
  // With no journal and no command file the recovery runs no command: the first is the precondition's.
  const clean = bundled();
  const first = runner(clean.root, noToken);
  await releaseLog(clean.root, clean.home, first.run);
  expect(first.seen.slice(0, 2)).toEqual([
    ["git", "config", "--get", "core.sshCommand"],
    ["git", "rev-parse", "--abbrev-ref", "HEAD"],
  ]);
});

test("2026-11-13-004 AC-46: a file already at its starting content is left unnamed, one changed since is left and named, and a rebuilt bundle is put back and said", async () => {
  // Killed inside step 1, two files written: only those two are put back, none is named as left.
  const partial = bundled();
  const j1 = killedRelease(partial, "step-1");
  const two = Object.keys(j1.files as object).slice(0, 2);
  expect(sh(partial.root, "status", "--porcelain").trim().split("\n").length).toBe(2);
  const r1 = await afterKill(partial);
  expect(r1.lines).toEqual([KILLED(j1, two.join(", ")), NO_TOKEN("andreagroferreira")]);
  expect(sh(partial.root, "status", "--porcelain")).toBe("");
  expect(inProgress(partial.root)).toEqual([]);

  // A file edited after the kill is left and named, and the unclean-tree precondition stops the release on it.
  const edited = bundled();
  const j2 = killedRelease(edited, "check");
  const pkg = join(edited.root, "package.json");
  writeFileSync(pkg, `${readFileSync(pkg, "utf8")}\n`);
  const r2 = await afterKill(edited);
  const others = [
    ...Object.keys(j2.files as object).filter((f) => f !== "package.json"),
    BUNDLE_FILE,
  ];
  expect(r2.code).toBe(1);
  expect(r2.lines).toEqual([
    KILLED(j2, others.join(", ")),
    LEFT("package.json"),
    "the tree has uncommitted changes (package.json): commit or stash them first",
  ]);
  expect(sh(edited.root, "status", "--porcelain").trim()).toBe("M package.json");
  expect(inProgress(edited.root)).toEqual([]);

  // The bundle rebuilt by a session after the kill: put back all the same, and said.
  const rebuilt = bundled();
  const j3 = killedRelease(rebuilt, "check");
  writeFileSync(join(rebuilt.root, BUNDLE_FILE), "rebuilt by a session\n");
  const r3 = await afterKill(rebuilt);
  expect(r3.lines[0]).toBe(
    KILLED(
      j3,
      [
        ...Object.keys(j3.files as object),
        `${BUNDLE_FILE} (rebuilt since the release's build)`,
      ].join(", "),
    ),
  );
  expect(readFileSync(join(rebuilt.root, BUNDLE_FILE), "utf8")).toBe("bundle at the start\n");
  expect(sh(rebuilt.root, "status", "--porcelain")).toBe("");
});

test("2026-11-13-004 AC-46: a release killed after its commit has the commit taken off main and its tag deleted; a tag pointing elsewhere is left and named", async () => {
  for (const at of ["tag", "push"] as const) {
    const fix = bundled();
    const head = sh(fix.root, "rev-parse", "HEAD").trim();
    const journal = killedRelease(fix, at);
    const commit = sh(fix.root, "rev-parse", "HEAD").trim();
    expect(commit).not.toBe(head);
    expect(sh(fix.root, "tag", "--list").trim()).toBe(at === "push" ? `v${NEW}` : "");
    const { lines } = await afterKill(fix);
    expect(lines).toEqual([
      `the commit ${commit.slice(0, 7)} of release ${NEW} is off main, kept in the reflog`,
      KILLED(journal, [...Object.keys(journal.files as object), BUNDLE_FILE].join(", ")),
      NO_TOKEN("andreagroferreira"),
    ]);
    expect(sh(fix.root, "rev-parse", "HEAD").trim()).toBe(head);
    expect(sh(fix.root, "status", "--porcelain")).toBe("");
    expect(sh(fix.root, "tag", "--list").trim()).toBe("");
    expect(sh(fix.root, "reflog", "--format=%H")).toContain(commit);
    expect(inProgress(fix.root)).toEqual([]);
  }
  const moved = bundled();
  const head = sh(moved.root, "rev-parse", "HEAD").trim();
  killedRelease(moved, "push");
  sh(moved.root, "tag", "-f", `v${NEW}`, head);
  const { lines } = await afterKill(moved);
  expect(lines).toContain(
    `the tag v${NEW} points at ${head.slice(0, 7)}, not at the killed release's commit: left`,
  );
  expect(sh(moved.root, "rev-parse", `v${NEW}^{commit}`).trim()).toBe(head);
  expect(sh(moved.root, "rev-parse", "HEAD").trim()).toBe(head);
});

/** The loop's clone before its release: a merge and a ruling committed on main and not pushed, so the release starts ahead of origin. */
const adoptedLocally = (root: string) => {
  writeFileSync(join(root, "ADOPTED.md"), "the adoption\n");
  sh(root, "add", "--", "ADOPTED.md");
  sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "Adopt");
};

test("2026-11-13-004 AC-46: in a clone reset to origin after the kill, the recovery deletes the killed release's tag, removes the journal and the release goes on", async () => {
  for (const tagLeft of [true, false]) {
    const fix = bundled();
    adoptedLocally(fix.root);
    killedRelease(fix, "push");
    sh(fix.root, "reset", "-q", "--hard", "origin/main");
    if (!tagLeft) sh(fix.root, "tag", "-d", `v${NEW}`);
    const at = runner(fix.root, () => false, building(fix.root));
    const { code, lines } = await releaseLog(fix.root, fix.home, at.run);
    expect(code, lines.join("\n")).toBe(0);
    expect(lines.slice(0, 2)).toEqual([
      `release ${NEW} was killed before its push and nothing of it is left: its journal is removed`,
      `Release ${NEW}: x`,
    ]);
    // The tag the new release made is its own: the killed one's was deleted before step 5 made it again.
    expect(sh(fix.root, "rev-parse", `v${NEW}^{commit}`).trim()).toBe(
      sh(fix.root, "rev-parse", "HEAD").trim(),
    );
    expect(inProgress(fix.root)).toEqual([]);
  }
});

/** A journal of the row's own, valid for the fixture as it stands: a release whose process is gone. */
const journalOf = (root: string, over: Record<string, unknown> = {}) => {
  const journal = {
    version: NEW,
    tag: `v${NEW}`,
    title: `Release ${NEW}: x`,
    head: sh(root, "rev-parse", "HEAD").trim(),
    pid: 4_000_000,
    processStart: "Fri Nov 13 10:00:00 2026",
    writtenAt: "2026-11-13T10:00:00.000Z",
    files: Object.fromEntries(plannedBump(root, OLD, NEW).map((f) => [f.rel, sha256(f.text)])),
    ...over,
  };
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, JOURNAL_FILE), JSON.stringify(journal));
  return journal;
};
/** What a recovery that stops must leave as it found it. */
const stateOf = (root: string) => ({
  status: sh(root, "status", "--porcelain"),
  head: sh(root, "rev-parse", "HEAD").trim(),
  branch: sh(root, "rev-parse", "--abbrev-ref", "HEAD").trim(),
  tags: sh(root, "tag", "--list"),
  journal: readFileSync(join(root, JOURNAL_FILE), "utf8"),
});
/** A new release over the fixture's journal: its log, its reports, and whether anything changed. */
const stopped = async (
  fix: { root: string; home: string },
  deps: Partial<Parameters<typeof release>[1]> = {},
  fail: (cmd: readonly string[]) => Scripted = noToken,
  options: Partial<Parameters<typeof release>[0]> = {},
) => {
  const before = stateOf(fix.root);
  const at = runner(fix.root, fail, building(fix.root));
  const log: string[] = [];
  const reports: Outcome[] = [];
  const code = await release(
    { root: fix.root, bump: "patch", reason: "x", home: fix.home, ...options },
    {
      run: at.run,
      log: (l) => log.push(l),
      report: (o) => reports.push(o),
      pushSettleMs: 0,
      ...deps,
    },
  );
  const after = existsSync(join(fix.root, JOURNAL_FILE)) ? stateOf(fix.root) : null;
  return {
    code,
    log,
    reports,
    unchanged: JSON.stringify(after) === JSON.stringify(before),
    seen: at.seen,
  };
};
const JOURNAL_STOP = (field: string) => `${JOURNAL_FILE} has no valid ${field}: nothing put back`;

test("2026-11-13-004 AC-53: the recovery stops with nothing changed while the journal's release runs, on another branch, and when origin has the tag or cannot be asked", async () => {
  // Rule 1: the same process, by its start time, and with no start time on record.
  for (const recorded of ["Fri Nov 13 10:00:00 2026", ""]) {
    const fix = bundled();
    const journal = journalOf(fix.root, { processStart: recorded });
    const r = await stopped(fix, {
      processGone: () => false,
      processStart: () => "Fri Nov 13 10:00:00 2026",
    });
    expect(r.code).toBe(1);
    expect(r.log).toEqual([
      `release ${NEW} is running (pid ${journal.pid}, written ${journal.writtenAt}): wait for it; if no release is running, delete ${JOURNAL_FILE}`,
    ]);
    expect(r.unchanged).toBe(true);
    // A recovery's stop reports its line since 2026-11-13-005, where it reported nothing.
    expect(r.reports).toEqual([
      { version: "", code: 1, failedStep: null, pending: false, stopped: r.log[0] },
    ]);
  }
  // A living process with another start time, and one that is gone, are a dead release's: the recovery runs.
  for (const deps of [
    { processGone: () => false, processStart: () => "Sat Nov 14 11:11:11 2026" },
    { processGone: () => true, processStart: () => "Fri Nov 13 10:00:00 2026" },
  ]) {
    const fix = bundled();
    const journal = journalOf(fix.root);
    const r = await stopped(fix, deps);
    expect(r.log).toEqual([KILLED(journal, "none"), NO_TOKEN("andreagroferreira")]);
    expect(existsSync(join(fix.root, JOURNAL_FILE))).toBe(false);
  }
  // Rule 2: another branch.
  const branch = bundled();
  journalOf(branch.root);
  sh(branch.root, "checkout", "-q", "-b", "side");
  const r2 = await stopped(branch);
  expect(r2.log).toEqual([
    `a release ${NEW} was killed before its push: check out main and run the release again; nothing put back on side`,
  ]);
  expect(r2.unchanged).toBe(true);
  // Rule 3: origin cannot be asked, and nothing is reported.
  const deaf = bundled();
  journalOf(deaf.root);
  const r3 = await stopped(deaf, {}, (cmd) => (cmd[1] === "ls-remote" ? FAILED : false));
  expect(r3.log).toEqual([
    `origin could not be asked whether release ${NEW} was pushed: nothing put back`,
  ]);
  expect(r3.unchanged).toBe(true);
  // A recovery's stop reports its line since 2026-11-13-005, where it reported nothing.
  expect(r3.reports).toEqual([
    { version: "", code: 1, failedStep: null, pending: false, stopped: r3.log.at(-1) },
  ]);
  // Rule 3: the release's own tag is on origin: the journal's version is reported pending at step 7, not confirmed.
  const out = bundled();
  killedRelease(out, "push");
  sh(out.root, "push", "-q", "origin", "main", `v${NEW}`);
  const r4 = await stopped(out, { processGone: () => true });
  expect(r4.log).toEqual([
    `release ${NEW} is on origin and was not finished: resume it with bun scripts/release.ts --resume v${NEW} --from-step 7`,
  ]);
  expect(r4.unchanged).toBe(true);
  expect(r4.reports).toEqual([
    { version: NEW, code: 1, failedStep: 7, pending: true, localUnconfirmed: true },
  ]);
});

test("2026-11-13-004 AC-53: the recovery stops with nothing changed when HEAD moved, when a commit only looks like the release's, and when the journal does not parse or is off its shape", async () => {
  const commit = (root: string, message: string, file: string) => {
    writeFileSync(join(root, file), `${message}\n`);
    sh(root, "add", "--", file);
    sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", message);
  };
  const bump = (root: string) => writePlan(root, plannedBump(root, OLD, NEW).slice(0, 1));
  const moved = (journal: { head: string }, root: string) =>
    `a release ${NEW} was killed before its push and HEAD moved since (${sh(root, "rev-parse", "HEAD").trim().slice(0, 7)}): nothing put back; put back by hand: git checkout ${journal.head} -- ${Object.keys((journal as unknown as { files: object }).files).join(" ")}, then delete ${JOURNAL_FILE}`;
  // Rule 4c: a commit of somebody's since, and a version file still bumped.
  const since = bundled();
  const j1 = journalOf(since.root);
  commit(since.root, "another change", "NOTES.md");
  bump(since.root);
  const r1 = await stopped(since);
  expect(r1.log).toEqual([moved(j1, since.root)]);
  expect(r1.unchanged).toBe(true);
  // Rule 4a: a commit with the release's subject that changes a path outside the journal's.
  const outside = bundled();
  const j2 = journalOf(outside.root);
  commit(outside.root, `Release ${NEW}: x`, "NOTES.md");
  bump(outside.root);
  const r2 = await stopped(outside);
  expect(r2.log).toEqual([moved(j2, outside.root)]);
  expect(r2.unchanged).toBe(true);
  // Rule 4a: a commit on the journal's head that changes a journaled path alone, under another subject.
  const subject = bundled();
  const j2b = journalOf(subject.root);
  commit(subject.root, "somebody's edit", "packs/laravel/pack.json");
  bump(subject.root);
  const r2b = await stopped(subject);
  expect(r2b.log).toEqual([moved(j2b, subject.root)]);
  expect(r2b.unchanged).toBe(true);
  // Rule 4a: the subject on a commit whose parent is not the journal's head.
  const parent = bundled();
  const j3 = journalOf(parent.root);
  // Every path either commit changes is one the journal names: the parent alone gives it away.
  commit(parent.root, "in between", "packs/laravel/pack.json");
  writePlan(parent.root, plannedBump(parent.root, OLD, NEW).slice(1, 2));
  sh(
    parent.root,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "commit",
    "-q",
    "-am",
    `Release ${NEW}: x`,
  );
  bump(parent.root);
  const r3 = await stopped(parent);
  expect(r3.log).toEqual([moved(j3, parent.root)]);
  expect(r3.unchanged).toBe(true);
  // Rule 4a: the subject on a commit with two parents.
  const merged = bundled();
  const j4 = journalOf(merged.root);
  sh(merged.root, "checkout", "-q", "-b", "side");
  // The side branch changes a journaled path alone: only the second parent gives the merge away.
  commit(merged.root, "on the side", "packs/laravel/pack.json");
  sh(merged.root, "checkout", "-q", "main");
  sh(
    merged.root,
    "-c",
    "user.name=t",
    "-c",
    "user.email=t@t",
    "merge",
    "-q",
    "--no-ff",
    "-m",
    `Release ${NEW}: x`,
    "side",
  );
  bump(merged.root);
  const r4 = await stopped(merged);
  expect(r4.log).toEqual([moved(j4, merged.root)]);
  expect(r4.unchanged).toBe(true);
  // A journal that does not parse.
  const broken = bundled();
  mkdirSync(join(broken.root, "dist"));
  writeFileSync(join(broken.root, JOURNAL_FILE), "{not json");
  const r5 = await stopped(broken);
  expect(r5.log).toEqual([
    `${JOURNAL_FILE} does not parse: nothing put back; read it, and delete it if it is not a release's`,
  ]);
  expect(r5.unchanged).toBe(true);
  // One journal per value off its shape; none reaches git.
  const files = (root: string) => journalOf(root).files;
  for (const [field, over] of [
    ["version", () => ({ version: "1.2" })],
    ["tag", () => ({ tag: "v9.9.9" })],
    ["tag", () => ({ tag: "--force" })],
    ["head", () => ({ head: "abc1234" })],
    ["head", () => ({ head: "0".repeat(40) })],
    ["pid", () => ({ pid: 0 })],
    ["files", (root: string) => ({ files: { ...files(root), "README.md": "x" } })],
    ["files", (root: string) => ({ files: { ...files(root), "../x": "x" } })],
    ["title", () => ({ title: "--amend" })],
    ["writtenAt", () => ({ writtenAt: undefined })],
  ] as const) {
    const fix = bundled();
    journalOf(fix.root, over(fix.root));
    const r = await stopped(fix);
    expect(r.log, JSON.stringify(over(fix.root))).toEqual([JOURNAL_STOP(field)]);
    expect(r.unchanged).toBe(true);
    expect(r.seen.filter((c) => c[1] === "reset" || c[1] === "checkout" || c[1] === "tag")).toEqual(
      [],
    );
  }
  // A tracked file outside the release's set, named with its present hash: nothing changes.
  const named = fixture({ [BUNDLE_FILE]: "b\n", "README.md": "read me\n" });
  writeFileSync(join(named.root, "README.md"), "edited\n");
  journalOf(named.root, { files: { "README.md": sha256("edited\n") } });
  const r6 = await stopped(named);
  expect(r6.log).toEqual([JOURNAL_STOP("files")]);
  expect(readFileSync(join(named.root, "README.md"), "utf8")).toBe("edited\n");
  // A resume runs no recovery: it goes by a journal that would stop a new release.
  const resumed = bundled();
  expect(
    (
      await releaseLog(
        resumed.root,
        resumed.home,
        runner(resumed.root, () => false, building(resumed.root)).run,
      )
    ).code,
  ).toBe(0);
  writeFileSync(join(resumed.root, JOURNAL_FILE), "{not json");
  expect(
    await release(
      { root: resumed.root, resume: NEW, fromStep: 10, reason: "x", home: resumed.home },
      { run: runner(resumed.root).run, log: () => {} },
    ),
  ).toBe(0);
  expect(readFileSync(join(resumed.root, JOURNAL_FILE), "utf8")).toBe("{not json");
});

test("2026-11-13-004 AC-53: a dry run with a journal present prints what the next new release would do and changes nothing", async () => {
  const dry = (fix: { root: string; home: string }) =>
    stopped(fix, {}, () => false, { dryRun: true });
  // A stop: said as what the next release would do; the tree is clean, so the plan follows.
  const branch = bundled();
  journalOf(branch.root);
  sh(branch.root, "checkout", "-q", "-b", "side");
  const r1 = await dry(branch);
  expect(r1.log[0]).toBe(
    `the next new release would stop: a release ${NEW} was killed before its push: check out main and run the release again; nothing put back on side`,
  );
  expect(r1.unchanged).toBe(true);
  // The files of a release killed at the check: the two lists, then the unclean tree stops the dry run.
  const killed = bundled();
  const j2 = killedRelease(killed, "check");
  const pkg = join(killed.root, "package.json");
  writeFileSync(pkg, `${readFileSync(pkg, "utf8")}\n`);
  const r2 = await dry(killed);
  expect(r2.code).toBe(1);
  expect(r2.log).toEqual([
    `would put back: ${[...Object.keys(j2.files as object).filter((f) => f !== "package.json"), BUNDLE_FILE].join(", ")}`,
    "would leave: package.json",
    expect.stringMatching(/^the tree has uncommitted changes \(/),
  ]);
  expect(r2.unchanged).toBe(true);
  // The commit of a release killed at its push: said, nothing taken off.
  const pushed = bundled();
  killedRelease(pushed, "push");
  const commit = sh(pushed.root, "rev-parse", "HEAD").trim();
  const r3 = await dry(pushed);
  expect(r3.log[0]).toBe(`would take the commit ${commit.slice(0, 7)} off main`);
  expect(r3.log[1]).toMatch(/^would put back: /);
  expect(r3.log[2]).toBe("would leave: none");
  expect(r3.unchanged).toBe(true);
  // The clone's case: nothing left, the plan printed, exit 0.
  const clone = bundled();
  adoptedLocally(clone.root);
  killedRelease(clone, "push");
  sh(clone.root, "reset", "-q", "--hard", "origin/main");
  const r4 = await dry(clone);
  expect(r4.code).toBe(0);
  expect(r4.log.slice(0, 2)).toEqual([
    "would remove the journal: nothing of the killed release is left",
    `dry run: Release ${NEW}: x`,
  ]);
  expect(r4.log.slice(2).map((l) => /^ {2}(\d+)\. /.exec(l)?.[1])).toEqual(
    Array.from({ length: 13 }, (_, i) => String(i + 1)),
  );
  expect(r4.unchanged).toBe(true);
});

test("2026-11-13-004 AC-56: with a killed release's journal present and no token, the recovery's lines come before the no-token line and name what changed", async () => {
  const fix = bundled();
  const journal = killedRelease(fix, "check");
  const { code, lines } = await afterKill(fix);
  expect(code).toBe(1);
  expect(lines).toEqual([
    KILLED(journal, [...Object.keys(journal.files as object), BUNDLE_FILE].join(", ")),
    NO_TOKEN("andreagroferreira"),
  ]);
  // What changed is what the recovery named: the tree is clean at the head, nothing else moved.
  expect(sh(fix.root, "status", "--porcelain")).toBe("");
  expect(sh(fix.root, "tag", "--list").trim()).toBe("");
});

test("2026-11-13-004 AC-36: after a push of unknown outcome, a resume whose tag is absent leaves the journal, and the next new release takes the commit off main and deletes the tag", async () => {
  const { root, home } = bundled();
  const head = sh(root, "rev-parse", "HEAD").trim();
  const unknown = runner(
    root,
    (cmd) => (isPush(cmd) ? TIMED_OUT : cmd[1] === "ls-remote" ? FAILED : false),
    building(root),
  );
  expect((await releaseLog(root, home, unknown.run)).code).toBe(1);
  const commit = sh(root, "rev-parse", "HEAD").trim();
  const journal = readJournalFile(root);
  // Origin answers now, and the push never landed.
  const log: string[] = [];
  expect(
    await release(
      { root, resume: NEW, reason: "x", home },
      { run: runner(root).run, log: (l) => log.push(l) },
    ),
  ).toBe(1);
  expect(log).toEqual([`v${NEW} is not on origin; nothing to resume`]);
  expect(readJournalFile(root)).toEqual(journal);
  // The release that wrote the journal was this process: gone, for the next release.
  const next = await stopped({ root, home }, { processGone: () => true });
  expect(next.log).toEqual([
    `the commit ${commit.slice(0, 7)} of release ${NEW} is off main, kept in the reflog`,
    KILLED(journal, [...Object.keys(journal.files as object), BUNDLE_FILE].join(", ")),
    NO_TOKEN("andreagroferreira"),
  ]);
  expect(sh(root, "rev-parse", "HEAD").trim()).toBe(head);
  expect(sh(root, "tag", "--list").trim()).toBe("");
  expect(sh(root, "status", "--porcelain")).toBe("");
});

test("2026-11-13-004 AC-50: after a rollback or a recovery that a failed git write stopped, the next run puts the tree back", async () => {
  // A rollback whose reset fails: the journal is kept, and the next release puts the tree back.
  const fix = bundled();
  const head = sh(fix.root, "rev-parse", "HEAD").trim();
  const atReset = runner(
    fix.root,
    (cmd) =>
      cmd.join(" ") === "bun run check"
        ? FAILED
        : cmd[1] === "reset"
          ? {
              status: 128,
              exit: 128,
              stdout: "",
              stderr: "fatal: Unable to create '.git/index.lock': File exists.\n",
            }
          : false,
    building(fix.root),
  );
  const first = await releaseLog(fix.root, fix.home, atReset.run);
  expect(first.code).toBe(1);
  expect(first.lines).toContain(
    `the rollback could not put the tree back: fatal: Unable to create '.git/index.lock': File exists.; ${LOCK_LINE}`,
  );
  expect(first.lines.join("\n")).not.toContain("the tree is back");
  expect(sh(fix.root, "status", "--porcelain")).not.toBe("");
  const journal = readJournalFile(fix.root);
  const again = await stopped(fix, { processGone: () => true });
  expect(again.log).toEqual([
    KILLED(journal, [...Object.keys(journal.files as object), BUNDLE_FILE].join(", ")),
    NO_TOKEN("andreagroferreira"),
  ]);
  expect(sh(fix.root, "status", "--porcelain")).toBe("");
  expect(sh(fix.root, "rev-parse", "HEAD").trim()).toBe(head);

  // A recovery whose checkout fails stops with git's line and keeps the journal; the cause gone, the next run puts back.
  const stuck = bundled();
  const j = killedRelease(stuck, "check");
  const lockFailure = {
    status: 128,
    exit: 128,
    stdout: "",
    stderr: "fatal: Unable to create '.git/index.lock': File exists.\n",
  };
  const r = await stopped(stuck, {}, (cmd) => (cmd[1] === "checkout" ? lockFailure : false));
  expect(r.code).toBe(1);
  expect(r.log).toEqual([
    `the recovery could not put ${Object.keys(j.files as object)[0]} back: fatal: Unable to create '.git/index.lock': File exists.; ${LOCK_LINE}`,
  ]);
  expect(r.unchanged).toBe(true);
  const healed = await afterKill(stuck);
  expect(healed.lines[0]).toBe(
    KILLED(j, [...Object.keys(j.files as object), BUNDLE_FILE].join(", ")),
  );
  expect(sh(stuck.root, "status", "--porcelain")).toBe("");
});

/** A process that sleeps in a group of its own, as a bounded command of a release does. */
const sleeper = () => spawn("sleep", ["60"], { stdio: "ignore", detached: true });
const COMMAND = "dist/release-in-progress.command";
const commandFileOf = (root: string, lines: (string | number)[]) => {
  mkdirSync(join(root, "dist"), { recursive: true });
  writeFileSync(join(root, COMMAND), `${lines.join("\n")}\n`);
};
const KILLED_COMMAND = (pid: number) =>
  `the command a killed release left running was killed (pid ${pid})`;
const RUNNING = (pid: number) =>
  `a release is running (pid ${pid}): wait for it; if no release is running, delete ${COMMAND}`;
const RUNNER_DRIVER = `
const [releasePath, file] = process.argv.slice(2);
const { spawnRunner } = await import(releasePath);
spawnRunner(false)(["sleep", "60"], { cwd: process.cwd(), timeoutMs: 60000, commandFile: file });
`;

test("2026-11-13-004 AC-52: the command a killed release left running, written by the real runner, is ended by the next new release and by a resume before their first command", async () => {
  for (const kind of ["new", "resume"] as const) {
    const { root, home } = bundled();
    if (kind === "resume")
      expect(
        (await releaseLog(root, home, runner(root, () => false, building(root)).run)).code,
      ).toBe(0);
    // A release's process, here the real runner alone, waits on a command and is killed.
    const dir = mkdtempSync(join(tmpdir(), "runner-"));
    writeFileSync(join(dir, "driver.ts"), RUNNER_DRIVER);
    const file = join(root, COMMAND);
    const driver = spawn(
      "bun",
      [join(dir, "driver.ts"), join(import.meta.dir, "../../../scripts/release.ts"), file],
      { stdio: "ignore", env: childEnv() },
    );
    let command = 0;
    try {
      for (const until = Date.now() + 10_000; !existsSync(file) && Date.now() < until; )
        await new Promise((r) => setTimeout(r, 50));
      const driverStart = processStart(driver.pid as number);
      const [pid, start, releasePid, releaseStart] = readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .map((l) => l.trim());
      command = Number(pid);
      // The two halves meet: what the wrapper wrote is what the engine reads of that process.
      expect(alive(command)).toBe(true);
      expect(
        spawnSync("ps", ["-o", "pgid=", "-p", String(command)], { encoding: "utf8" }).stdout.trim(),
      ).toBe(String(command));
      expect(start).toBe(processStart(command));
      expect(releasePid).toBe(String(driver.pid));
      expect(releaseStart).toBe(driverStart);
      // While its release lives, another release stops and signals nothing.
      const beside = runner(root, noToken);
      const stoppedLog: string[] = [];
      expect(
        await release(
          { root, bump: "patch", reason: "x", home },
          { run: beside.run, log: (l) => stoppedLog.push(l) },
        ),
      ).toBe(1);
      expect(stoppedLog).toEqual([RUNNING(driver.pid as number)]);
      expect(beside.seen.filter((c) => c[0] !== "osascript")).toEqual([]);
      expect(alive(command)).toBe(true);
      // The release is killed: its command goes on, in its own group.
      driver.kill("SIGKILL");
      await new Promise((r) => driver.once("exit", r));
      expect(alive(command)).toBe(true);
      const archive = join(root, "dist", `wizardingcode-developer-crew-${NEW}.tar.gz`);
      if (kind === "resume") writeFileSync(archive, "half an archive");
      let goneAtFirstCommand: boolean | null = null;
      const at = runner(root, kind === "new" ? noToken : () => false, (cmd) => {
        goneAtFirstCommand ??= !alive(command) && cmd.length > 0;
      });
      if (kind === "resume") at.world.released.add(`v${NEW}`);
      const log: string[] = [];
      await release(
        kind === "new"
          ? { root, bump: "patch", reason: "x", home }
          : { root, resume: NEW, fromStep: 8, reason: "x", home },
        { run: at.run, log: (l) => log.push(l) },
      );
      expect(log[0]).toBe(KILLED_COMMAND(command));
      expect(goneAtFirstCommand as boolean | null).toBe(true);
      expect(existsSync(file)).toBe(false);
      // A resume builds its archive again after such a kill.
      if (kind === "resume") expect(existsSync(archive)).toBe(false);
    } finally {
      endProcess(driver.pid);
      if (command > 1)
        try {
          process.kill(-command, "SIGKILL");
        } catch {
          // gone already
        }
    }
  }
});

test("2026-11-13-004 AC-52: a release that still runs stops the next one with nothing killed; a command that is gone, is another process, cannot be told or leads no group is never killed; a file off its shape reaches no signal", async () => {
  const command = sleeper();
  const starter = sleeper();
  const pid = command.pid as number;
  const start = processStart(pid);
  const starterPid = starter.pid as number;
  const starterStart = processStart(starterPid);
  const killed: number[] = [];
  const deps = { killGroup: (p: number) => void killed.push(p) };
  const run = async (
    lines: (string | number)[],
    more: Partial<Parameters<typeof release>[1]> = {},
    journal = false,
  ) => {
    const fix = bundled();
    if (journal) journalOf(fix.root);
    commandFileOf(fix.root, lines);
    const bytes = readFileSync(join(fix.root, COMMAND), "utf8");
    const at = runner(fix.root, noToken);
    const log: string[] = [];
    const code = await release(
      { root: fix.root, bump: "patch", reason: "x", home: fix.home },
      { run: at.run, log: (l) => log.push(l), ...deps, ...more },
    );
    const file = join(fix.root, COMMAND);
    return {
      code,
      log,
      kept: existsSync(file) && readFileSync(file, "utf8") === bytes,
      seen: at.seen,
      fix,
    };
  };
  try {
    // The release that started the command is alive: with its start time, and with one that cannot be read; with a journal and with none.
    for (const journal of [false, true])
      for (const more of [{}, { processStart: () => "" }]) {
        const r = await run([pid, start, starterPid, starterStart], more, journal);
        expect(r.log).toEqual([RUNNING(starterPid)]);
        expect(r.code).toBe(1);
        expect(r.kept).toBe(true);
        expect(r.seen.filter((c) => c[0] !== "osascript")).toEqual([]);
      }
    // A resume beside a release that still runs stops the same way, before its first command.
    const beside = bundled();
    commandFileOf(beside.root, [pid, start, starterPid, starterStart]);
    const atResume = runner(beside.root);
    const resumeLog: string[] = [];
    expect(
      await release(
        { root: beside.root, resume: NEW, reason: "x", home: beside.home },
        { run: atResume.run, log: (l) => resumeLog.push(l), ...deps },
      ),
    ).toBe(1);
    expect(resumeLog).toEqual([RUNNING(starterPid)]);
    expect(atResume.seen.filter((c) => c[0] !== "osascript")).toEqual([]);
    expect(existsSync(join(beside.root, COMMAND))).toBe(true);
    // The starting release is gone (a pid no process has), and the command is not one to kill.
    const GONE = 4_000_000;
    for (const [lines, more] of [
      [[GONE - 1, start, GONE, starterStart], {}],
      [[pid, "Thu Jan  1 00:00:00 1970", GONE, starterStart], {}],
      [[pid, start, GONE, starterStart], { processStart: () => "" }],
      [[pid, start, GONE, starterStart], { groupLeader: () => false }],
    ] as const) {
      const r = await run([...lines], more);
      expect(r.log).toEqual([NO_TOKEN("andreagroferreira")]);
      expect(r.kept).toBe(false);
      expect(existsSync(join(r.fix.root, COMMAND))).toBe(false);
    }
    // Off its shape: removed with its line, never a signal.
    for (const lines of [
      [pid, start, GONE],
      [pid, "", GONE, starterStart],
      [0, start, GONE, starterStart],
      [1, start, GONE, starterStart],
      [`-${pid}`, start, GONE, starterStart],
      [pid, start, `-${starterPid}`, starterStart],
    ]) {
      const r = await run(lines);
      expect(r.log, JSON.stringify(lines)).toEqual([
        `${COMMAND} is not a release's: removed, nothing killed`,
        NO_TOKEN("andreagroferreira"),
      ]);
      expect(existsSync(join(r.fix.root, COMMAND))).toBe(false);
    }
    expect(killed).toEqual([]);
    expect(alive(pid)).toBe(true);
    expect(alive(starterPid)).toBe(true);
    // A dry run says what the next new release would kill, kills nothing and keeps the file.
    const dry = bundled();
    commandFileOf(dry.root, [pid, start, GONE, starterStart]);
    const dryLog: string[] = [];
    expect(
      await release(
        { root: dry.root, bump: "patch", reason: "x", home: dry.home, dryRun: true },
        { run: runner(dry.root).run, log: (l) => dryLog.push(l), ...deps },
      ),
    ).toBe(0);
    expect(dryLog[0]).toBe(`would kill the command a killed release left running (pid ${pid})`);
    expect(existsSync(join(dry.root, COMMAND))).toBe(true);
    expect(killed).toEqual([]);
    // A command that does not end stops the release, with a line naming it.
    const stubborn = await run([pid, start, GONE, starterStart], { leftRunningWaitMs: 300 });
    expect(killed).toEqual([pid]);
    expect(stubborn.code).toBe(1);
    expect(stubborn.log).toEqual([
      `the command a killed release left running (pid ${pid}) did not end: nothing put back; end it and run the release again`,
    ]);
    expect(stubborn.seen.filter((c) => c[0] !== "osascript")).toEqual([]);
    // What the loop's stop asks: the command of that very release, or nothing.
    commandFileOf(dry.root, [pid, start, starterPid, starterStart]);
    expect(leftCommand(dry.root, {}, starterPid)).toBe(pid);
    expect(leftCommand(dry.root, {}, starterPid + 1)).toBeNull();
    expect(leftCommand(dry.root)).toBe(pid);
  } finally {
    for (const p of [command, starter])
      try {
        process.kill(-(p.pid as number), "SIGKILL");
      } catch {
        // gone already
      }
  }
});

test("2026-11-13-004 AC-40: the script run as a program prints the title and the thirteen steps on a dry run, and the usage when it is given no reason", () => {
  const { root, home } = bundled();
  const script = join(import.meta.dir, "../../../scripts/release.ts");
  const program = (...args: string[]) =>
    spawnSync("bun", [script, ...args, "--root", root], {
      encoding: "utf8",
      env: childEnv({ WIZARDINGCODE_HOME: join(home, ".wizardingcode"), HOME: home }),
    });
  const dry = program("--patch", "--reason", "x", "--dry-run");
  expect(dry.status, dry.stderr).toBe(0);
  // A run by hand shows its commands' output as it comes: the preconditions' git answers come first.
  const all = dry.stdout.trim().split("\n");
  const lines = all.slice(all.indexOf(`dry run: Release ${NEW}: x`));
  expect(lines[0]).toBe(`dry run: Release ${NEW}: x`);
  expect(lines.slice(1).map((l) => /^ {2}(\d+)\. /.exec(l)?.[1])).toEqual(
    Array.from({ length: 13 }, (_, i) => String(i + 1)),
  );
  expect(sh(root, "status", "--porcelain")).toBe("");
  expect(existsSync(join(root, "dist"))).toBe(false);
  const bare = program("--patch");
  expect(bare.status).toBe(1);
  expect(bare.stdout).toBe("");
  expect(bare.stderr).toContain(
    "usage: bun scripts/release.ts --patch|--minor|--major|--version X.Y.Z",
  );
});

const REPO = join(import.meta.dir, "../../..");

test("2026-11-13-004 AC-54: the Releasing section and ADR 0015 say what changed, and the release's list of version files is what it was", () => {
  const claude = readFileSync(join(REPO, "CLAUDE.md"), "utf8");
  const releasing = claude.slice(claude.indexOf("## Releasing"), claude.indexOf("## Conventions"));
  for (const phrase of [
    "reads the personal account's token before step 1",
    "every command it runs has a time bound",
    "process group",
    "no terminal",
    "credentials that ask nothing",
    "`dist/release-in-progress.journal`",
    "`dist/release-in-progress.command`",
    "put back by the next new release",
  ])
    expect(releasing, phrase).toContain(phrase);
  // The two paths end in no .json, so the section's own list of version files is untouched by naming them.
  const files = releaseFiles(REPO);
  expect(files.every((f) => f.endsWith(".json") || f.endsWith("/version.ts"))).toBe(true);
  expect(files).toContain("package.json");
  expect(files.filter((f) => f.startsWith("dist/"))).toEqual([]);
  expect(
    staleReleaseFiles(REPO, JSON.parse(readFileSync(join(REPO, "package.json"), "utf8")).version),
  ).toEqual([]);
  const adr = readFileSync(
    join(REPO, "docs/adr/0015-the-loop-runs-always-and-releases-what-it-proves.md"),
    "utf8",
  );
  const note = adr.slice(adr.indexOf("## Note of 2026-11-13 (item 2026-11-13-004)"));
  expect(note.startsWith("## Note of 2026-11-13")).toBe(true);
  for (const phrase of [
    "D-1",
    "D-2",
    "signal handlers",
    "a list of the release's own process group",
    "`dist/release-in-progress.journal`",
    "`dist/release-in-progress.command`",
    "before step 1",
    "2 minutes",
    "5 minutes",
    "45 minutes",
    "`stop`",
    "note of 2026-10-28",
    "goes on from step 7",
  ])
    expect(note, phrase).toContain(phrase);
});

const OWN = process.pid;

test("2026-11-13-004 AC-57: a resume makes the GitHub release again when GitHub holds it as a draft or with no archive, and leaves a published one", async () => {
  for (const state of ["draft", "no-archive", "uploading", null] as const) {
    const { root, home } = bundled();
    expect((await releaseLog(root, home, runner(root, () => false, building(root)).run)).code).toBe(
      0,
    );
    const at = runner(root);
    at.world.released.add(`v${NEW}`);
    if (state) at.world.unfinished = new Map([[`v${NEW}`, state]]);
    const log: string[] = [];
    expect(
      await release(
        { root, resume: NEW, fromStep: 8, reason: "x", home },
        { run: at.run, log: (l) => log.push(l) },
      ),
    ).toBe(0);
    const gh = programs(at.seen).filter((c) => c.startsWith("gh release"));
    if (state) {
      expect(gh).toEqual(["gh release view", "gh release delete", "gh release create"]);
      expect(at.seen.find((c) => c[2] === "delete")).toEqual([
        "gh",
        "release",
        "delete",
        `v${NEW}`,
        "--yes",
      ]);
      expect(log).toContain(
        `  the GitHub release of v${NEW} was left unfinished: deleted and created again, with this run's notes`,
      );
      expect(log).toContain("  8. the GitHub release: ok");
      expect(at.world.released.has(`v${NEW}`)).toBe(true);
    } else {
      expect(gh).toEqual(["gh release view"]);
      expect(log).toContain("  8. the GitHub release: done already");
    }
  }
  // An answer that cannot be read deletes nothing: the step fails, and is resumed.
  for (const answer of [
    { status: 0, exit: 0, stdout: "not json", stderr: "" },
    { status: 0, exit: 0, stdout: "{}", stderr: "" },
    { status: 1, exit: 1, stdout: "", stderr: "HTTP 502: Bad Gateway" },
    { ...TIMED_OUT },
  ]) {
    const { root, home } = bundled();
    expect((await releaseLog(root, home, runner(root, () => false, building(root)).run)).code).toBe(
      0,
    );
    const at = runner(root, (cmd) => (cmd[1] === "release" && cmd[2] === "view" ? answer : false));
    at.world.released.add(`v${NEW}`);
    const log: string[] = [];
    expect(
      await release(
        { root, resume: NEW, fromStep: 8, reason: "x", home },
        { run: at.run, log: (l) => log.push(l) },
      ),
    ).toBe(1);
    expect(programs(at.seen).filter((c) => c.startsWith("gh release"))).toEqual([
      "gh release view",
    ]);
    expect(log.join("\n")).toContain(
      `step 8 (the GitHub release) failed: the GitHub release of v${NEW} could not be read`,
    );
    expect(log).toContain(`resume with: bun scripts/release.ts --resume v${NEW} --from-step 8`);
  }
  // A step to resume from that is no step of a resume is refused before any command.
  const fix = bundled();
  for (const fromStep of [Number.NaN, 0, 14, 7.5, 3]) {
    const at = runner(fix.root);
    const said: string[] = [];
    expect(
      await release(
        { root: fix.root, resume: NEW, fromStep, reason: "x", home: fix.home },
        { run: at.run, log: (l) => said.push(l) },
      ),
    ).toBe(1);
    expect(said).toEqual([`--from-step names a step from 7 to 13, not ${fromStep}`]);
    expect(at.seen).toEqual([]);
  }
  // The runner's own cleanup of the command file never throws, whatever sits at its path.
  const dir = mkdtempSync(join(tmpdir(), "cleanup-"));
  mkdirSync(join(dir, "command", "inside"), { recursive: true });
  const ran = spawnRunner(false)(["true"], {
    cwd: dir,
    timeoutMs: 5000,
    commandFile: join(dir, "command"),
  });
  expect(ran.status).toBe(0);
});

test("2026-11-13-004 AC-57: a command whose leader ignores a request to end is killed at its bound, and a timed-out fleet step carries no other command's bound", async () => {
  const started = Date.now();
  const r = spawnRunner(false)(["sh", "-c", 'trap "" TERM; sleep 60 & wait'], {
    cwd: tmpdir(),
    timeoutMs: 1500,
  });
  expect(r.timedOut).toBe(true);
  expect(Date.now() - started).toBeLessThan(6500);
  // The fleet's update, killed at its own bound: its step words its own line.
  const { root, home } = bundled();
  const at = runner(
    root,
    () => false,
    building(root),
    {},
    {
      installBundle: true,
      projectsUpdate: { ...TIMED_OUT, signal: "SIGKILL" },
    },
  );
  const { code, lines } = await releaseLog(root, home, at.run);
  expect(code).toBe(0);
  const said = lines.filter((l) => l.includes("step 12"));
  expect(said.length).toBe(1);
  expect(lines.join("\n")).not.toContain("the project update timed out after");
  expect(said[0]).toContain("the project update (");
});

test("2026-11-13-004 AC-57: a push killed at its bound is asked of origin twice before the tree is put back, one that failed by itself once, and a tag on another commit is not the release's", async () => {
  const asks = (seen: string[][]) => seen.filter((c) => c[1] === "ls-remote").length;
  // Killed, absent at the first ask, landed by the second: the release goes on from step 7.
  const late = bundled();
  let asked = 0;
  const atLate = runner(
    late.root,
    (cmd) => (isPush(cmd) ? TIMED_OUT : false),
    building(late.root, (cmd) => {
      if (cmd[1] === "ls-remote" && ++asked === 2)
        sh(late.root, "push", "-q", "origin", "main", `v${NEW}`);
    }),
  );
  const log: string[] = [];
  expect(
    await release(
      { root: late.root, bump: "patch", reason: "x", home: late.home },
      { run: atLate.run, log: (l) => log.push(l), pushSettleMs: 0 },
    ),
  ).toBe(0);
  expect(asks(atLate.seen)).toBe(2);
  expect(log).toContain("  6. the push: ok (found on origin after the push command failed)");
  // Killed and absent both times: two asks, then the tree is put back.
  const never = bundled();
  const atNever = runner(
    never.root,
    (cmd) => (isPush(cmd) ? TIMED_OUT : false),
    building(never.root),
  );
  expect(
    await release(
      { root: never.root, bump: "patch", reason: "x", home: never.home },
      { run: atNever.run, log: () => {}, pushSettleMs: 0 },
    ),
  ).toBe(1);
  expect(asks(atNever.seen)).toBe(2);
  expect(sh(never.root, "status", "--porcelain")).toBe("");
  // Failed by itself: origin answered the push, and is asked once.
  const refused = bundled();
  const atRefused = runner(
    refused.root,
    (cmd) => (isPush(cmd) ? FAILED : false),
    building(refused.root),
  );
  expect((await releaseLog(refused.root, refused.home, atRefused.run)).code).toBe(1);
  expect(asks(atRefused.seen)).toBe(1);
  // A tag of that name on another commit of origin's: not this release's push, so the tree is put back.
  const foreign = bundled();
  const head = sh(foreign.root, "rev-parse", "HEAD").trim();
  const atForeign = runner(
    foreign.root,
    (cmd) => (isPush(cmd) ? FAILED : false),
    building(foreign.root, (cmd) => {
      if (isPush(cmd)) sh(foreign.root, "push", "-q", "origin", `${head}:refs/tags/v${NEW}`);
    }),
  );
  const back = await releaseLog(foreign.root, foreign.home, atForeign.run);
  expect(back.code).toBe(1);
  expect(back.lines.join("\n")).toContain(
    `the tree is back at ${head.slice(0, 7)}, nothing released`,
  );
  expect(back.lines.join("\n")).not.toContain("found on origin");
  expect(sh(foreign.root, "rev-parse", "HEAD").trim()).toBe(head);
});

test("2026-11-13-004 AC-57: the recovery stops over a tag on origin that is another commit's, and over a commit of the release's shape that origin/main holds", async () => {
  // A tag of the journal's name on origin, on a commit that is not the killed release's.
  const foreign = bundled();
  journalOf(foreign.root);
  sh(foreign.root, "tag", `v${NEW}`);
  sh(foreign.root, "push", "-q", "origin", `v${NEW}`);
  sh(foreign.root, "tag", "-d", `v${NEW}`);
  const r1 = await stopped(foreign);
  expect(r1.log).toEqual([
    `the tag v${NEW} on origin is not the killed release's commit: nothing put back; delete ${JOURNAL_FILE} if that release is another's`,
  ]);
  expect(r1.unchanged).toBe(true);
  // A recovery's stop reports its line since 2026-11-13-005, where it reported nothing.
  expect(r1.reports).toEqual([
    { version: "", code: 1, failedStep: null, pending: false, stopped: r1.log.at(-1) },
  ]);
  // A release that went out whole, its tag since removed from origin, and a journal that names its commit's parent.
  const done = bundled();
  const start = sh(done.root, "rev-parse", "HEAD").trim();
  expect(
    (
      await releaseLog(
        done.root,
        done.home,
        runner(done.root, () => false, building(done.root)).run,
      )
    ).code,
  ).toBe(0);
  const commit = sh(done.root, "rev-parse", "HEAD").trim();
  sh(done.root, "push", "-q", "origin", `:refs/tags/v${NEW}`);
  sh(done.root, "tag", "-d", `v${NEW}`);
  mkdirSync(join(done.root, "dist"), { recursive: true });
  writeFileSync(
    join(done.root, JOURNAL_FILE),
    JSON.stringify({ ...journalOf(bundled().root), head: start }),
  );
  const r2 = await stopped(done);
  expect(r2.log).toEqual([
    `the commit ${commit.slice(0, 7)} has the shape of release ${NEW}'s and is on origin/main: nothing put back; delete ${JOURNAL_FILE} if that release is finished`,
  ]);
  expect(r2.unchanged).toBe(true);
  expect(sh(done.root, "rev-parse", "HEAD").trim()).toBe(commit);
});

test("2026-11-13-004 AC-57: a command file naming this process's own group, or a directory at its path, kills nothing and is removed; a resume's version is checked, and a resume's dry run keeps the journal", async () => {
  const killed: number[] = [];
  const deps = { killGroup: (p: number) => void killed.push(p) };
  // This process's own group: its leader is alive and leads its group, and must never be ended.
  const leader = Number(
    spawnSync("ps", ["-o", "pgid=", "-p", String(OWN)], { encoding: "utf8" }).stdout.trim(),
  );
  const own = bundled();
  commandFileOf(own.root, [leader, processStart(leader), 4_000_000, "Fri Nov 13 10:00:00 2026"]);
  const log: string[] = [];
  await release(
    { root: own.root, bump: "patch", reason: "x", home: own.home },
    { run: runner(own.root, noToken).run, log: (l) => log.push(l), ...deps },
  );
  expect(killed).toEqual([]);
  expect(log).toEqual([NO_TOKEN("andreagroferreira")]);
  expect(existsSync(join(own.root, COMMAND))).toBe(false);
  // A directory where the file belongs.
  const dir = bundled();
  mkdirSync(join(dir.root, COMMAND, "inside"), { recursive: true });
  const dirLog: string[] = [];
  await release(
    { root: dir.root, bump: "patch", reason: "x", home: dir.home },
    { run: runner(dir.root, noToken).run, log: (l) => dirLog.push(l), ...deps },
  );
  expect(dirLog).toEqual([
    `${COMMAND} is not a release's: removed, nothing killed`,
    NO_TOKEN("andreagroferreira"),
  ]);
  expect(existsSync(join(dir.root, COMMAND))).toBe(false);
  // A resume's version names files under dist: only the version form passes.
  const fix = bundled();
  for (const version of ["../../x", "1.2", "v1.2.3", "--force"]) {
    const at = runner(fix.root);
    const said: string[] = [];
    expect(
      await release(
        { root: fix.root, resume: version, reason: "x", home: fix.home },
        { run: at.run, log: (l) => said.push(l) },
      ),
    ).toBe(1);
    expect(said).toEqual([`--resume names a version as X.Y.Z, not ${version}`]);
    expect(at.seen).toEqual([]);
  }
  // A resume's dry run leaves the journal of its version.
  expect(
    (await releaseLog(fix.root, fix.home, runner(fix.root, () => false, building(fix.root)).run))
      .code,
  ).toBe(0);
  writeFileSync(join(fix.root, JOURNAL_FILE), JSON.stringify({ version: NEW }));
  expect(
    await release(
      { root: fix.root, resume: NEW, reason: "x", home: fix.home, dryRun: true },
      { run: runner(fix.root).run, log: () => {} },
    ),
  ).toBe(0);
  expect(existsSync(join(fix.root, JOURNAL_FILE))).toBe(true);
});

test("2026-11-13-004 AC-57: git keeps the ssh command its configuration names, with batch mode added, and a stop before step 1 is notified with its line unless the run is a dry run", async () => {
  const configured = bundled();
  sh(configured.root, "config", "core.sshCommand", "ssh -i ~/.ssh/work");
  const at = runner(configured.root, noToken);
  await release(
    { root: configured.root, bump: "patch", reason: "x", home: configured.home },
    { run: at.run, log: () => {}, env: {} },
  );
  const gits = at.seen.flatMap((cmd, i) =>
    cmd[0] === "git" && cmd[1] !== "config" ? [at.seenOpts[i]] : [],
  );
  expect(gits.length).toBeGreaterThan(3);
  for (const opts of gits)
    expect(opts?.env?.GIT_SSH_COMMAND).toBe("ssh -i ~/.ssh/work -o BatchMode=yes");
  // The caller's own environment still wins over both.
  const own = runner(configured.root, noToken);
  await release(
    { root: configured.root, bump: "patch", reason: "x", home: configured.home },
    { run: own.run, log: () => {}, env: { GIT_SSH_COMMAND: "ssh -i mine" } },
  );
  expect(own.seenOpts.every((o) => o.env?.GIT_SSH_COMMAND === undefined)).toBe(true);
  // Stops before step 1: each sends its line; the title has no version when none is known yet.
  const branch = bundled();
  journalOf(branch.root);
  sh(branch.root, "checkout", "-q", "-b", "side");
  const r1 = await stopped(branch);
  expect(notified(r1.seen)).toEqual([notice(r1.log[0] as string, "crew release")]);
  const running = bundled();
  const starter = sleeper();
  try {
    commandFileOf(running.root, [
      4_000_000,
      "x",
      starter.pid as number,
      processStart(starter.pid as number),
    ]);
    const atRunning = runner(running.root, noToken);
    const log: string[] = [];
    await release(
      { root: running.root, bump: "patch", reason: "x", home: running.home },
      { run: atRunning.run, log: (l) => log.push(l) },
    );
    expect(log).toEqual([RUNNING(starter.pid as number)]);
    expect(notified(atRunning.seen)).toEqual([notice(log[0] as string, "crew release")]);
    // The notification carries no command file: through the real runner it would replace, then
    // remove, the file of the release that is running.
    const sent = atRunning.seenOpts[atRunning.seen.findIndex((c) => c[0] === "osascript")];
    expect(sent?.commandFile).toBeUndefined();
    expect(sent?.timeoutMs).toBe(LOCAL);
  } finally {
    endProcess(starter.pid);
  }
  if (process.getuid?.() !== 0) {
    const locked = bundled();
    mkdirSync(join(locked.root, "dist"));
    chmodSync(join(locked.root, "dist"), 0o555);
    try {
      const atLocked = runner(locked.root);
      const { lines } = await releaseLog(locked.root, locked.home, atLocked.run);
      expect(notified(atLocked.seen)).toEqual([notice(lines[0] as string)]);
    } finally {
      chmodSync(join(locked.root, "dist"), 0o755);
    }
  }
  // A dry run that would stop notifies nothing.
  const dry = bundled();
  journalOf(dry.root);
  sh(dry.root, "checkout", "-q", "-b", "side");
  const r2 = await stopped(dry, {}, () => false, { dryRun: true });
  expect(notified(r2.seen)).toEqual([]);
});

test.skipIf(process.getuid?.() === 0)(
  "2026-11-13-004 AC-57: a journal that cannot be removed after the push does not stop the release, and the next new release names the resume that clears it",
  async () => {
    // The journal's removal right after the push goes through removeLeft, as the archive's and the
    // lock's do: one row on the one helper, at the place a throw would cost most, a release that is
    // already out and would end with no resume line.
    const { root, home } = bundled();
    const dist = join(root, "dist");
    const at = runner(
      root,
      () => false,
      building(root, (cmd) => {
        // dist cannot be written from the push until the tarball's command: the removal fails there.
        if (isPush(cmd)) chmodSync(dist, 0o555);
        if (cmd.includes("--tarball")) chmodSync(dist, 0o755);
      }),
    );
    try {
      const { code, lines } = await recordedRelease(root, home, at);
      expect(code, lines.join("\n")).toBe(0);
      expect(lines).toContain("  6. the push: ok");
      expect(lines.at(-1)).toBe(`released ${NEW}`);
      // The end record was made all the same, once.
      expect(at.events.filter((e) => e === "record:done").length).toBe(1);
      expect(readJournalFile(root).version).toBe(NEW);
    } finally {
      chmodSync(dist, 0o755);
    }
    // The journal left behind names a release that is on origin: the next new release stops and
    // names the resume, which finds every step done and removes the journal.
    const next = await stopped({ root, home }, { processGone: () => true });
    expect(next.log).toEqual([
      `release ${NEW} is on origin and was not finished: resume it with bun scripts/release.ts --resume v${NEW} --from-step 7`,
    ]);
    expect(next.unchanged).toBe(true);
    const resumed = runner(root);
    resumed.world.released.add(`v${NEW}`);
    const log: string[] = [];
    expect(
      await release(
        { root, resume: NEW, fromStep: 7, reason: "x", home },
        { run: resumed.run, log: (l) => log.push(l) },
      ),
    ).toBe(0);
    expect(log).toContain("  7. the tarball: done already");
    expect(inProgress(root)).toEqual([]);
  },
);

test("2026-11-13-005 AC-51: a new release that stops before step 1, after its arguments' check, reports the stop's line once; an argument's stop, a resume with nothing to resume and a dry run report nothing", async () => {
  const stopOf = async (
    prepare: (at: ReturnType<typeof fixture>) => void,
    options: Partial<Parameters<typeof release>[0]> = {},
    answer?: Parameters<typeof runner>[1],
  ) => {
    const at = fixture();
    prepare(at);
    const reports: Outcome[] = [];
    const log: string[] = [];
    const code = await release(
      { root: at.root, bump: "patch", reason: "x", home: at.home, ...options },
      { run: runner(at.root, answer).run, log: (l) => log.push(l), report: (o) => reports.push(o) },
    );
    return { code, reports, log };
  };
  const stoppedWith = (line: string | RegExp) => [
    {
      version: "",
      code: 1,
      failedStep: null,
      pending: false,
      stopped: typeof line === "string" ? line : expect.stringMatching(line),
    },
  ];
  // A release pending, to be resumed first.
  const pending = await stopOf(() => {}, { pending: { version: NEW, failedStep: 9 } });
  expect(pending.code).toBe(1);
  expect(pending.reports).toEqual(stoppedWith(/^release .* is pending at step 9: resume it first/));
  // Not on main, and an unclean tree.
  const branch = await stopOf((at) => sh(at.root, "checkout", "-q", "-b", "topic"));
  expect(branch.reports).toEqual(stoppedWith("the release runs on main, not topic"));
  const dirty = await stopOf((at) => writeFileSync(join(at.root, "stray.md"), "x"));
  expect(dirty.reports).toEqual(stoppedWith(/^the tree has uncommitted changes \(stray\.md\)/));
  // Origin not reachable, and origin ahead.
  const away = await stopOf(
    () => {},
    {},
    (cmd) =>
      cmd[0] === "git" && cmd[1] === "fetch"
        ? { status: 1, exit: null, stdout: "", stderr: "", signal: "SIGTERM", timedOut: true }
        : false,
  );
  expect(away.reports).toEqual(stoppedWith("origin is not reachable: timed out after 300 s"));
  const ahead = await stopOf((at) => {
    const other = mkdtempSync(join(tmpdir(), "crew-ahead-"));
    sh(other, "clone", "-q", at.origin, "c");
    writeFileSync(join(other, "c", "more.md"), "x");
    sh(join(other, "c"), "add", "-A");
    sh(join(other, "c"), "commit", "-q", "-m", "more");
    sh(join(other, "c"), "push", "-q", "origin", "main");
  });
  expect(ahead.reports).toEqual(stoppedWith(/^origin\/main is ahead by 1 commit\(s\): pull first/));
  // A version that cannot be bumped.
  const low = await stopOf(() => {}, { bump: { version: "0.0.1" } });
  expect(low.reports).toEqual(stoppedWith(/^0\.0\.1 is not above /));
  // An argument's stop, a resume with nothing to resume, and a dry run of a stop: no report.
  const noBump = await stopOf(() => {}, { bump: undefined });
  expect(noBump.code).toBe(1);
  expect(noBump.reports).toEqual([]);
  const nothing = await stopOf(() => {}, { bump: undefined, resume: "0.15.2", fromStep: 7 });
  expect(nothing.log.join("\n")).toContain("is not on origin; nothing to resume");
  expect(nothing.reports).toEqual([]);
  const dry = await stopOf((at) => sh(at.root, "checkout", "-q", "-b", "topic"), {
    dryRun: true,
  });
  expect(dry.reports).toEqual([]);
});

test("2026-11-13-005 AC-50: a recorded process is gone, the same or another, and a command file its caller read is judged by the check a kill needs", () => {
  const at = (gone: boolean, start: string) => ({
    processGone: () => gone,
    processStart: () => start,
    groupLeader: () => true,
  });
  expect(recordedProcess(4000, "Fri Nov 13 10:00:00 2026", at(true, ""))).toBe("gone");
  expect(
    recordedProcess(4000, "Fri Nov 13 10:00:00 2026", at(false, "Fri Nov 13 10:00:00 2026")),
  ).toBe("same");
  expect(recordedProcess(4000, "Fri Nov 13 10:00:00 2026", at(false, ""))).toBe("same");
  expect(
    recordedProcess(4000, "Fri Nov 13 10:00:00 2026", at(false, "Fri Nov 13 11:00:00 2026")),
  ).toBe("another");
  const file = { pid: 4001, start: "s", releasePid: 4000, releaseStart: "r" };
  expect(leftCommandOf(file, at(false, "s"))).toBe(4001);
  expect(leftCommandOf(file, at(false, "s"), 4000)).toBe(4001);
  expect(leftCommandOf(file, at(false, "s"), 4999)).toBeNull();
  expect(leftCommandOf(file, at(false, "another start"))).toBeNull();
  expect(leftCommandOf(file, at(true, "s"))).toBeNull();
  expect(leftCommandOf({ ...file, pid: process.pid }, at(false, "s"))).toBeNull();
  expect(leftCommandOf(file, { ...at(false, "s"), groupLeader: () => false })).toBeNull();
});

test("2026-11-13-005 AC-51: the command file's two stops report their line once, on a new release and on a resume; a resume that could not ask origin for its tag reports a stop, and one whose tag is not there reports nothing", async () => {
  const go = async (
    fix: { root: string; home: string },
    deps: Partial<Parameters<typeof release>[1]>,
    answer: Parameters<typeof runner>[1],
    options: Partial<Parameters<typeof release>[0]>,
  ) => {
    const log: string[] = [];
    const reports: Outcome[] = [];
    const code = await release(
      { root: fix.root, bump: "patch", reason: "x", home: fix.home, ...options },
      {
        run: runner(fix.root, answer).run,
        log: (l) => log.push(l),
        report: (o) => reports.push(o),
        ...deps,
      },
    );
    return { code, log, reports };
  };
  const command = sleeper();
  const starter = sleeper();
  const pid = command.pid as number;
  const starterPid = starter.pid as number;
  const ended = spawnSync("true", [], { env: childEnv() }).pid as number;
  const resume = { bump: undefined, resume: "0.15.2", fromStep: 9 };
  const one = (version: string, line: string | RegExp) => [
    {
      version,
      code: 1,
      failedStep: null,
      pending: false,
      stopped: typeof line === "string" ? line : expect.stringMatching(line),
    },
  ];
  try {
    // A release that still runs: a new release and a resume each stop with one report.
    for (const [options, version] of [
      [{}, ""],
      [resume, "0.15.2"],
    ] as const) {
      const fix = bundled();
      commandFileOf(fix.root, [pid, processStart(pid), starterPid, processStart(starterPid)]);
      const r = await go(fix, {}, noToken, options);
      expect(r.code).toBe(1);
      expect(r.reports).toEqual(one(version, RUNNING(starterPid)));
    }
    // A command a killed release left that does not end: the same, for each.
    for (const [options, version] of [
      [{}, ""],
      [resume, "0.15.2"],
    ] as const) {
      const fix = bundled();
      commandFileOf(fix.root, [pid, processStart(pid), ended, "Thu Jan  1 00:00:00 2026"]);
      const r = await go(
        fix,
        { killGroup: () => {}, groupLeader: () => true, leftRunningWaitMs: 0 },
        noToken,
        options,
      );
      expect(r.code).toBe(1);
      expect(r.reports).toEqual(one(version, /did not end/));
    }
  } finally {
    for (const p of [command, starter]) p.kill("SIGKILL");
  }
  // A resume that could not ask origin: a stop, so the caller keeps the release to resume.
  const away = bundled();
  const unasked = await go(
    away,
    {},
    (cmd) =>
      cmd[0] === "git" && cmd[1] === "ls-remote"
        ? { status: 128, exit: 128, stdout: "", stderr: "fatal: unable to access origin\nmore" }
        : false,
    resume,
  );
  expect(unasked.code).toBe(1);
  expect(unasked.reports).toEqual(
    one("0.15.2", "origin could not be asked for v0.15.2: fatal: unable to access origin"),
  );
  // Origin answered, and the tag is not there: nothing to resume, and no report.
  const absent = await go(bundled(), {}, () => false, resume);
  expect(absent.log.join("\n")).toContain("v0.15.2 is not on origin; nothing to resume");
  expect(absent.reports).toEqual([]);
});

test("2026-11-13-005 AC-51: the refusal for a release pending comes after a left command is ended", async () => {
  const command = sleeper();
  const pid = command.pid as number;
  const ended = spawnSync("true", [], { env: childEnv() }).pid as number;
  try {
    const fix = bundled();
    commandFileOf(fix.root, [pid, processStart(pid), ended, "Thu Jan  1 00:00:00 2026"]);
    const order: string[] = [];
    const reports: Outcome[] = [];
    const code = await release(
      {
        root: fix.root,
        bump: "patch",
        reason: "x",
        home: fix.home,
        pending: { version: NEW, failedStep: 9 },
      },
      {
        run: runner(fix.root).run,
        log: (l) => order.push(l.includes("is pending at step 9") ? "refused" : `log: ${l}`),
        report: (o) => reports.push(o),
        killGroup: (p) => {
          order.push(`killed ${p}`);
          process.kill(p, "SIGKILL");
        },
        groupLeader: () => true,
      },
    );
    expect(code).toBe(1);
    expect(order.indexOf(`killed ${pid}`)).toBeGreaterThanOrEqual(0);
    expect(order.indexOf(`killed ${pid}`)).toBeLessThan(order.indexOf("refused"));
    expect(existsSync(join(fix.root, COMMAND))).toBe(false);
    expect(reports.length).toBe(1);
    expect(reports[0]?.stopped).toContain("is pending at step 9: resume it first");
  } finally {
    command.kill("SIGKILL");
  }
});
