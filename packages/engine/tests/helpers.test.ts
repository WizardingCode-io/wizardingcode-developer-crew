import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import {
  childEnv,
  enterRun,
  gitTraceOf,
  NO_GIT_MAINTENANCE,
  removeTempDirs,
  runsHome,
  sweepDeadRuns,
  TEMP_DIRS,
  tempDir,
} from "./helpers.ts";

const ROOT = resolve(import.meta.dir, "../../..");

test("SP3-T1 AC-1 (finding 74): tempDir registers each folder; removeTempDirs removes the registered ones, none with WIZARDINGCODE_CREW_KEEP_FIXTURES=1, and never a path outside the temp folder", () => {
  const a = tempDir();
  const b = tempDir("crew-home-");
  expect(TEMP_DIRS.has(a) && TEMP_DIRS.has(b)).toBe(true);
  const previous = process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES;
  try {
    process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES = "1";
    expect(removeTempDirs()).toBe(0);
    expect(existsSync(a) && existsSync(b)).toBe(true);
  } finally {
    if (previous === undefined) delete process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES;
    else process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES = previous;
  }
  // A registered path outside the temp folder is skipped: it stays registered and untouched (defence in depth).
  const outside = join(ROOT, "packages", "engine", "tests", "fixtures");
  TEMP_DIRS.add(outside);
  expect(removeTempDirs()).toBeGreaterThanOrEqual(2);
  expect(existsSync(a) || existsSync(b)).toBe(false);
  expect(TEMP_DIRS.has(a) || TEMP_DIRS.has(b)).toBe(false);
  expect(existsSync(outside)).toBe(true);
  expect(TEMP_DIRS.has(outside)).toBe(true);
  TEMP_DIRS.delete(outside);
});

test("SP3-T1 AC-1 (finding 74): both bun test forms name the preload that removes the fixtures when the run ends, and the root script carries the 30 s timeout", () => {
  const root = readFileSync(join(ROOT, "bunfig.toml"), "utf8");
  const engine = readFileSync(join(ROOT, "packages", "engine", "bunfig.toml"), "utf8");
  expect(root).toContain('preload = ["./packages/engine/tests/preload.ts"]');
  expect(engine).toContain('preload = ["./tests/preload.ts"]');
  const preload = readFileSync(join(ROOT, "packages", "engine", "tests", "preload.ts"), "utf8");
  expect(preload).toContain("afterAll(");
  expect(preload).toContain("removeTempDirs()");
  // bun 1.3.9 reads no timeout key from bunfig.toml: the root script's flag is the limit of that form.
  const scripts = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  expect(scripts.scripts.test).toContain("--timeout 30000");
});

/** A fixture with a temporary folder `T` inside it, as the system's sits inside its per-user folder. */
function withTemp(): { fixture: string; tmp: string } {
  const fixture = tempDir();
  const tmp = join(fixture, "T");
  mkdirSync(tmp);
  return { fixture, tmp };
}

/** A pid no process can hold: past every system's largest, so signal 0 always answers no such process. */
const DEAD_PID = 2147483646;

test("2026-11-10-002 AC-1: runsHome answers crew-tests beside the temporary folder, owner-only, and the temporary folder itself where that home is not the user's alone; enterRun points TMPDIR at a run folder in the home", () => {
  const { fixture, tmp } = withTemp();
  const home = runsHome(tmp);
  expect(home).toBe(join(fixture, "crew-tests"));
  expect(statSync(home).mode & 0o777).toBe(0o700);
  // An existing home of the user's is taken as it is.
  expect(runsHome(tmp)).toBe(home);
  // For another owner neither the parent nor the home is theirs: no home there, nothing made.
  const foreign = withTemp();
  expect(runsHome(foreign.tmp, (process.getuid?.() ?? 0) + 1)).toBe(foreign.tmp);
  expect(existsSync(join(foreign.fixture, "crew-tests"))).toBe(false);
  // A link at the home's name is never followed.
  const linked = withTemp();
  const target = tempDir();
  symlinkSync(target, join(linked.fixture, "crew-tests"));
  expect(runsHome(linked.tmp)).toBe(linked.tmp);
  expect(lstatSync(join(linked.fixture, "crew-tests")).isSymbolicLink()).toBe(true);
  expect(readdirSync(target)).toEqual([]);
  // A home others can write is left as found.
  const open = withTemp();
  mkdirSync(join(open.fixture, "crew-tests"));
  chmodSync(join(open.fixture, "crew-tests"), 0o777);
  expect(runsHome(open.tmp)).toBe(open.tmp);
  expect(statSync(join(open.fixture, "crew-tests")).mode & 0o777).toBe(0o777);
  // A parent others can write holds no home: someone else could make it first.
  const shared = withTemp();
  chmodSync(shared.fixture, 0o777);
  try {
    expect(runsHome(shared.tmp)).toBe(shared.tmp);
    expect(existsSync(join(shared.fixture, "crew-tests"))).toBe(false);
  } finally {
    chmodSync(shared.fixture, 0o700);
  }
  const before = process.env.TMPDIR;
  const run = enterRun(home);
  try {
    expect(dirname(run.folder)).toBe(home);
    expect(basename(run.folder)).toMatch(new RegExp(`^crew-run-${process.pid}-`));
    expect(process.env.TMPDIR).toBe(run.folder);
    expect(realpathSync(tmpdir())).toBe(run.folder);
    const inside = tempDir();
    TEMP_DIRS.delete(inside);
    expect(dirname(inside)).toBe(run.folder);
    // A run started inside a run shares its home: no home is made inside a home.
    expect(runsHome(run.folder)).toBe(home);
    // The same checks come first: a home that is not the owner's is no home for a nested run either.
    expect(runsHome(run.folder, (process.getuid?.() ?? 0) + 1)).toBe(run.folder);
  } finally {
    run.leave();
  }
  expect(process.env.TMPDIR).toBe(before);
});

test("2026-11-10-002 AC-2: a run's leave puts TMPDIR back and removes the folder its entry made and nothing else, once; the keep switch keeps it and marks it; an inner run leaves the outer one as it was", () => {
  const home = tempDir();
  const before = process.env.TMPDIR;
  const outer = enterRun(home);
  let registered = "";
  let loose = "";
  let inner: ReturnType<typeof enterRun> | undefined;
  try {
    registered = tempDir();
    TEMP_DIRS.delete(registered);
    loose = mkdtempSync(join(tmpdir(), "loose-"));
    writeFileSync(join(loose, "f"), "x");
    expect(dirname(loose)).toBe(outer.folder);
    inner = enterRun(home);
    expect(process.env.TMPDIR).toBe(inner.folder);
    mkdtempSync(join(tmpdir(), "in-"));
    inner.leave();
    expect(process.env.TMPDIR).toBe(outer.folder);
    expect(existsSync(inner.folder)).toBe(false);
    expect(existsSync(registered)).toBe(true);
    expect(existsSync(join(loose, "f"))).toBe(true);
    // A second call does nothing: TMPDIR is not moved again, the outer run stays.
    inner.leave();
    expect(process.env.TMPDIR).toBe(outer.folder);
    expect(existsSync(outer.folder)).toBe(true);
  } finally {
    // A failed assertion above must not leave TMPDIR in a nested folder for the rows after this one.
    inner?.leave();
    outer.leave();
  }
  expect(process.env.TMPDIR).toBe(before);
  expect(existsSync(outer.folder)).toBe(false);
  expect(existsSync(home)).toBe(true);
  expect(readdirSync(home)).toEqual([]);
  // Once: a leave called again after the outer run left does not point TMPDIR at a folder that is gone.
  inner?.leave();
  expect(process.env.TMPDIR).toBe(before);
  // The post-mortem switch: nothing removed, the folder marked.
  const kept = enterRun(home);
  const fixture = mkdtempSync(join(tmpdir(), "kept-"));
  const previous = process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES;
  try {
    process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES = "1";
    kept.leave();
  } finally {
    if (previous === undefined) delete process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES;
    else process.env.WIZARDINGCODE_CREW_KEEP_FIXTURES = previous;
  }
  expect(process.env.TMPDIR).toBe(before);
  expect(existsSync(fixture)).toBe(true);
  expect(readFileSync(join(kept.folder, ".keep"), "utf8")).toBe("");
  // A folder that cannot be removed throws nothing, and TMPDIR is back all the same.
  const stuck = enterRun(home);
  const readOnly = join(stuck.folder, "ro");
  mkdirSync(readOnly);
  writeFileSync(join(readOnly, "f"), "x");
  chmodSync(readOnly, 0o500);
  try {
    expect(() => stuck.leave()).not.toThrow();
    expect(process.env.TMPDIR).toBe(before);
  } finally {
    if (existsSync(readOnly)) chmodSync(readOnly, 0o700);
  }
});

const PARAMETERS = "GIT_CONFIG_PARAMETERS";

/**
 * How many `git maintenance` children a commit in a fresh repository starts under `env`, by git's
 * own trace of that commit. The repository is left alone afterwards and leaves with the run: a
 * maintenance the commit did start may still be writing in it.
 */
function maintenanceStarted(env: NodeJS.ProcessEnv): number {
  const repo = tempDir();
  const trace = join(tempDir(), "trace");
  const git = (...args: string[]) => {
    const r = spawnSync("git", args, {
      cwd: repo,
      encoding: "utf8",
      env: {
        ...env,
        GIT_TRACE2_EVENT: trace,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t.invalid",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t.invalid",
      },
    });
    if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  };
  git("init", "-q", "-b", "main");
  writeFileSync(join(repo, "f"), "x\n");
  git("add", "f");
  git("commit", "-q", "-m", "m");
  const read = gitTraceOf(trace);
  expect(read.committed).toBe(true);
  return read.maintenance;
}

test("2026-11-10-003 AC-4 (finding 228): in the tests' run a git commit starts no git maintenance, also under a global configuration that turns it on and with the system configuration skipped; with the run's variable taken away and git's defaults alone it starts one", () => {
  expect(process.env[PARAMETERS]).toContain(NO_GIT_MAINTENANCE);
  expect(maintenanceStarted(childEnv())).toBe(0);
  const global = join(tempDir(), "gitconfig");
  writeFileSync(global, "[maintenance]\n\tauto = true\n");
  expect(
    maintenanceStarted(childEnv({ GIT_CONFIG_GLOBAL: global, GIT_CONFIG_NOSYSTEM: "1" })),
  ).toBe(0);
  // The control: what git does by default, the developer's and the machine's configuration out of the way.
  const bare = childEnv({ GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" });
  delete bare[PARAMETERS];
  delete bare.GIT_CONFIG_COUNT;
  delete bare.GIT_CONFIG_NOSYSTEM;
  expect(maintenanceStarted(bare)).toBe(1);
});

test("2026-11-10-003 AC-5: a run's entry adds maintenance.auto=false to GIT_CONFIG_PARAMETERS after what the variable held, and its leave puts the variable back as found, unset or set; an inner run's leave gives back the outer run's value", () => {
  const home = tempDir();
  const found = process.env[PARAMETERS];
  try {
    delete process.env[PARAMETERS];
    const fromUnset = enterRun(home);
    try {
      expect(process.env[PARAMETERS]).toBe(NO_GIT_MAINTENANCE);
    } finally {
      fromUnset.leave();
    }
    expect(process.env[PARAMETERS]).toBeUndefined();
    const own = "'alias.zz=status'";
    process.env[PARAMETERS] = own;
    const outer = enterRun(home);
    let inner: ReturnType<typeof enterRun> | undefined;
    try {
      const outerValue = `${own} ${NO_GIT_MAINTENANCE}`;
      expect(process.env[PARAMETERS]).toBe(outerValue);
      // git reads both: the value that was there and the run's.
      const read = (key: string) =>
        spawnSync("git", ["config", "--get", key], { encoding: "utf8", env: childEnv() }).stdout;
      expect(read("alias.zz").trim()).toBe("status");
      expect(read("maintenance.auto").trim()).toBe("false");
      inner = enterRun(home);
      expect(process.env[PARAMETERS]).toBe(`${outerValue} ${NO_GIT_MAINTENANCE}`);
      inner.leave();
      expect(process.env[PARAMETERS]).toBe(outerValue);
      // Once: a second leave of the inner run does not move the outer run's value.
      inner.leave();
      expect(process.env[PARAMETERS]).toBe(outerValue);
    } finally {
      inner?.leave();
      outer.leave();
    }
    expect(process.env[PARAMETERS]).toBe(own);
  } finally {
    if (found === undefined) delete process.env[PARAMETERS];
    else process.env[PARAMETERS] = found;
  }
});

test("2026-11-10-002 AC-3: sweepDeadRuns removes the user's own run folders of dead pids and counts them; a live pid's, a kept one, another owner's, a link and its target, any other name and a folder it cannot remove all stay, and nothing is thrown", () => {
  const home = tempDir();
  const make = (name: string): string => {
    const path = join(home, name);
    mkdirSync(path);
    writeFileSync(join(path, "f"), "x");
    return path;
  };
  const gone = [make(`crew-run-${DEAD_PID}-aaaaaa`), make(`crew-run-${DEAD_PID}-bbbbbb`)];
  const live = make(`crew-run-${process.pid}-aaaaaa`);
  const kept = make(`crew-run-${DEAD_PID}-kept00`);
  writeFileSync(join(kept, ".keep"), "");
  const others = [
    make(`crew-${DEAD_PID}-aaaaaa`),
    make("release-aaaaaa"),
    make("crew-run-x-aaaaaa"),
  ];
  const outside = tempDir();
  writeFileSync(join(outside, "precious"), "x");
  const link = join(home, `crew-run-${DEAD_PID}-linked`);
  symlinkSync(outside, link);
  const stuck = make(`crew-run-${DEAD_PID}-stuck0`);
  const readOnly = join(stuck, "ro");
  mkdirSync(readOnly);
  writeFileSync(join(readOnly, "f"), "x");
  chmodSync(readOnly, 0o500);
  try {
    // Every folder here is this user's: for another owner the sweep takes none and walks none.
    const me = process.getuid?.() ?? 0;
    expect(sweepDeadRuns(home, me + 1)).toBe(0);
    for (const path of gone) expect(readFileSync(join(path, "f"), "utf8")).toBe("x");
    let removed = -1;
    expect(() => {
      removed = sweepDeadRuns(home);
    }).not.toThrow();
    expect(removed).toBe(2);
    for (const path of gone) expect(existsSync(path)).toBe(false);
    for (const path of [live, kept, ...others])
      expect(readFileSync(join(path, "f"), "utf8")).toBe("x");
    expect(existsSync(join(kept, ".keep"))).toBe(true);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readFileSync(join(outside, "precious"), "utf8")).toBe("x");
    expect(existsSync(join(readOnly, "f"))).toBe(true);
  } finally {
    chmodSync(readOnly, 0o700);
  }
  expect(sweepDeadRuns(join(home, "absent"))).toBe(0);
});

test("2026-11-10-002 AC-4: a bun test run of this repository on a file whose fixtures are made by mkdtempSync alone leaves no run folder beside its temporary folder and nothing in it, and the preload sweeps, enters and leaves", () => {
  const { fixture, tmp } = withTemp();
  const env = childEnv({ TMPDIR: tmp });
  delete env.WIZARDINGCODE_CREW_KEEP_FIXTURES;
  const run = spawnSync("bun", ["test", "--timeout", "30000", "packages/engine/tests/fs.test.ts"], {
    cwd: ROOT,
    env,
    encoding: "utf8",
  });
  expect(run.status, run.stderr).toBe(0);
  expect(run.stderr).toContain(" 0 fail");
  expect(readdirSync(join(fixture, "crew-tests"))).toEqual([]);
  expect(readdirSync(tmp)).toEqual([]);
  const preload = readFileSync(join(ROOT, "packages", "engine", "tests", "preload.ts"), "utf8");
  expect(preload).toContain("sweepDeadRuns(home)");
  expect(preload).toContain("enterRun(home)");
  expect(preload).toContain("run.leave()");
}, 60_000);

test("2026-11-11-001 AC-11 (finding 233): the tests spell git's maintenance setting and read a commit's trace in helpers.ts alone, and the preload enters the run through enterRun", () => {
  const dir = join(ROOT, "packages/engine/tests");
  // Built from parts, so this row's own source holds neither text.
  const setting = ["'maintenance", "auto=false'"].join(".");
  const reading = ["child", "start"].join("_");
  const holders = (text: string) =>
    readdirSync(dir)
      .filter(
        (name) => name.endsWith(".ts") && readFileSync(join(dir, name), "utf8").includes(text),
      )
      .sort();
  expect(holders(setting)).toEqual(["helpers.ts"]);
  expect(holders(reading)).toEqual(["helpers.ts"]);
  expect(readFileSync(join(dir, "preload.ts"), "utf8")).toContain("enterRun(home)");
});
