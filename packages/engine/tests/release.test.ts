import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  type CommandRunner,
  nextVersion,
  release,
  releaseFiles,
  staleReleaseFiles,
} from "../../../scripts/release.ts";

const OLD = "0.15.0";
const NEW = "0.15.1";

function sh(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

/** A repository with the release's files at OLD, committed on main and pushed to a bare origin beside it. */
function fixture(): { root: string; origin: string; home: string } {
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
    "packs/laravel/pack.json": `${JSON.stringify({ name: "l", version: OLD, core: `>=${OLD}` }, null, 2)}\n`,
    "packs/laravel/.claude-plugin/plugin.json": `${JSON.stringify({ name: "l", version: OLD }, null, 2)}\n`,
    "packs/agentic-os/pack.json": `${JSON.stringify({ name: "a", version: OLD, core: `>=${OLD}` }, null, 2)}\n`,
    "packs/agentic-os/.claude-plugin/plugin.json": `${JSON.stringify({ name: "a", version: OLD }, null, 2)}\n`,
    "packages/engine/tests/version.test.ts": `test("v", () => {\n  expect(VERSION).toBe("${OLD}");\n});\n`,
    "packages/engine/tests/cli.test.ts": `test("c", async () => {\n  expect((await c.run("--version")).out.trim()).toBe("${OLD}");\n});\n`,
    ".gitignore": "dist/\n",
  };
  for (const [rel, text] of Object.entries(files)) {
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
  puts: { message: string; version: string; ref: string; meta: string }[];
}

/** A runner that runs git for real and plays every other command: bun, gh, claude, tar and osascript are recorded, and a failing step is scripted. */
function runner(
  root: string,
  fail: (cmd: readonly string[]) => boolean = () => false,
): { run: CommandRunner; seen: string[][]; world: World } {
  const seen: string[][] = [];
  const world: World = {
    released: new Set(),
    marketplace: {
      metadata: { version: "2.15.0" },
      plugins: [
        { name: "wizardingcode-mem", version: "0.5.0", source: { ref: "v0.5.0" } },
        { name: "wizardingcode-developer-crew", version: OLD, source: { ref: `v${OLD}` } },
      ],
    },
    puts: [],
  };
  const ok = (stdout = "") => ({ status: 0, stdout, stderr: "" });
  const run: CommandRunner = (cmd, opts) => {
    seen.push([...cmd]);
    if (cmd[0] === "git") {
      const r = spawnSync("git", cmd.slice(1), {
        cwd: opts.cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          ...opts.env,
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@t",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@t",
        },
      });
      return { status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
    }
    if (fail(cmd)) return { status: 1, stdout: "", stderr: `${cmd.join(" ")} failed` };
    if (cmd[0] === "bun" && cmd.includes("--tarball")) {
      mkdirSync(join(root, "dist"), { recursive: true });
      writeFileSync(join(root, "dist", `wizardingcode-developer-crew-${NEW}.tar.gz`), "tgz");
      return ok();
    }
    if (cmd[0] === "gh" && cmd[1] === "auth" && cmd[2] === "token") return ok("ghp_SECRET\n");
    if (cmd[0] === "gh" && cmd[1] === "release" && cmd[2] === "view")
      return world.released.has(cmd[3] as string)
        ? ok("ok")
        : { status: 1, stdout: "", stderr: "release not found" };
    if (cmd[0] === "gh" && cmd[1] === "release" && cmd[2] === "create") {
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
      const entry = next.plugins.find(
        (p) => p.name === "wizardingcode-developer-crew",
      ) as World["marketplace"]["plugins"][number];
      world.puts.push({
        message: body.message,
        version: entry.version,
        ref: entry.source.ref,
        meta: next.metadata.version,
      });
      world.marketplace = next;
      return ok("{}");
    }
    if (cmd[0] === "tar") {
      // The archive extracted: its top folder with the new bin.
      const dest = cmd[cmd.indexOf("-C") + 1] as string;
      mkdirSync(join(dest, "wizardingcode-developer-crew", "bin"), { recursive: true });
      writeFileSync(join(dest, "wizardingcode-developer-crew", "bin", "crew"), "new");
      return ok();
    }
    return ok();
  };
  return { run, seen, world };
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

test("2026-10-25-005 AC-7: a patch release writes the version into every release file, the two test literals and the packs' bound, runs the twelve steps in order, and the marketplace, the tag and the local install follow", async () => {
  const { root, origin, home } = fixture();
  const { run, seen, world } = runner(root);
  const log: string[] = [];
  const code = await release(
    {
      root,
      bump: "patch",
      reason: "improvement run 2026-10-25-1: false-done 0.60 → 0.90",
      home,
      marketplaceAccount: "andreagroferreira",
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
  // Steps 2 to 12 in order, by their commands.
  expect(programs(seen)).toEqual([
    "bun run build",
    "bun run check",
    "bun run plugin:check",
    "bun scripts/build.ts --tarball",
    "gh release view",
    "gh release create",
    "gh auth token",
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
  expect(world.puts).toEqual([
    {
      message: `wizardingcode-developer-crew ${NEW}`,
      version: NEW,
      ref: `v${NEW}`,
      meta: "2.15.1",
    },
  ]);
  // The token reaches the marketplace calls alone.
  for (const c of seen)
    if (!(c[0] === "gh" && c[1] === "api")) expect(JSON.stringify(c)).not.toContain("ghp_SECRET");
  // Step 11: the local install swapped by rename, nothing of the old left beside it.
  expect(
    readFileSync(join(home, ".local/share/wizardingcode-developer-crew/bin/crew"), "utf8"),
  ).toBe("new");
  expect(existsSync(join(home, ".local/share/wizardingcode-developer-crew.previous"))).toBe(false);
  // Step 12: the notification names the version.
  const notify = seen.find((c) => c[0] === "osascript") as string[];
  expect(notify.join(" ")).toContain(`crew ${NEW}`);
});

test("2026-10-25-005 AC-7: --dry-run prints the twelve steps and changes nothing; a dirty tree or another branch is refused before anything is written", async () => {
  const { root, home } = fixture();
  const dry = runner(root);
  const log: string[] = [];
  expect(
    await release(
      { root, bump: "patch", reason: "x", home, dryRun: true },
      { run: dry.run, log: (l) => log.push(l) },
    ),
  ).toBe(0);
  expect(log.filter((l) => /^\s*\d+\. /.test(l))).toHaveLength(12);
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
        marketplaceAccount: "andreagroferreira",
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
  expect(resumed.world.puts.map((p) => p.version)).toEqual([NEW]);
  // A resume from a step whose result exists skips it: the entry already at the version, nothing is put again.
  const again = runner(root);
  again.world.released.add(`v${NEW}`);
  again.world.marketplace.plugins[1] = {
    name: "wizardingcode-developer-crew",
    version: NEW,
    source: { ref: `v${NEW}` },
  };
  expect(
    await release(
      { root, resume: NEW, fromStep: 7, reason: "x", home },
      { run: again.run, log: () => {} },
    ),
  ).toBe(0);
  expect(again.world.puts).toEqual([]);
  expect(programs(again.seen)).toEqual([
    "gh release view",
    "gh auth token",
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
