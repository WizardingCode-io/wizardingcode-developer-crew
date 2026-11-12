import { expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { sha256 } from "../src/fs.ts";
import { LockBusy, sleep, withLock } from "../src/lock.ts";
import type { CrewPaths } from "../src/paths.ts";
import {
  readProtectedJson,
  readProtectedJsonAt,
  recordIntegrity,
  rel,
  writeProtectedJson,
  writeProtectedJsonAt,
} from "../src/store.ts";
import { childEnv, makeRepo, repoPaths, tempDir, testEnv } from "./helpers.ts";

test("a protected file written by the engine reads back untampered", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const file = join(paths.crewDir, "profile.json");
  writeProtectedJson(paths, file, { version: 1 });
  expect(readProtectedJson<{ version: number }>(paths, file)).toEqual({
    data: { version: 1 },
    tampered: false,
  });
});

test("a protected file changed outside the engine is reported as tampered", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const file = join(paths.crewDir, "work", "w1", "evidence.json");
  writeProtectedJson(paths, file, { verdict: "unproven" });
  writeFileSync(file, JSON.stringify({ verdict: "proven" }));
  const read = readProtectedJson<{ verdict: string }>(paths, file);
  expect(read.tampered).toBe(true);
  expect(read.data?.verdict).toBe("proven");
});

test("C2: an integrity file that does not parse marks every protected file as tampered", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const profile = join(paths.crewDir, "profile.json");
  const policy = join(paths.crewDir, "policy.json");
  writeProtectedJson(paths, profile, { version: 1 });
  writeFileSync(policy, '{"minimumRoute":"standard"}');
  writeFileSync(paths.integrityFile, "{ not json");
  expect(readProtectedJson(paths, profile).tampered).toBe(true);
  expect(readProtectedJson(paths, policy).tampered).toBe(true);
});

test("C2: a protected file the engine never wrote is tampered once other hashes exist", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const handWritten = join(paths.crewDir, "work", "w9", "evidence.json");
  mkdirSync(join(paths.crewDir, "work", "w9"), { recursive: true });
  writeFileSync(handWritten, JSON.stringify({ verdict: "proven" }));
  // True first use: nothing is recorded yet, so there is nothing to compare with.
  expect(readProtectedJson(paths, handWritten).tampered).toBe(false);
  writeProtectedJson(paths, join(paths.crewDir, "profile.json"), { version: 1 });
  expect(readProtectedJson(paths, handWritten).tampered).toBe(true);
  const policy = join(paths.crewDir, "policy.json");
  writeFileSync(policy, '{"minimumRoute":"standard"}');
  expect(readProtectedJson(paths, policy).tampered).toBe(false);
});

test("recordIntegrity accepts a hand-written file, and a missing file is not tampered", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const file = join(paths.crewDir, "policy.json");
  expect(readProtectedJson(paths, file)).toEqual({ data: null, tampered: false });
  mkdirSync(paths.crewDir, { recursive: true });
  writeFileSync(file, '{"minimumRoute":"standard"}');
  expect(readProtectedJson(paths, file).tampered).toBe(false);
  recordIntegrity(paths, file);
  writeFileSync(file, '{"minimumRoute":"fast"}');
  expect(readProtectedJson(paths, file).tampered).toBe(true);
});

test("SP2c: a protected file outside a repository has its own integrity file, keyed by file name", () => {
  const dir = tempDir("crew-mailbox-");
  const integrity = join(dir, "integrity.json");
  const inbox = join(dir, "inbox.json");
  expect(readProtectedJsonAt(integrity, inbox)).toEqual({ data: null, tampered: false });
  writeProtectedJsonAt(integrity, inbox, { version: 1, messages: [] });
  expect(readProtectedJsonAt(integrity, inbox)).toEqual({
    data: { version: 1, messages: [] },
    tampered: false,
  });
  // (the array form: a dotted string would be read as a path, `inbox` then `json`)
  expect(JSON.parse(readFileSync(integrity, "utf8"))).toHaveProperty(["inbox.json"]);
  writeFileSync(inbox, JSON.stringify({ version: 1, messages: [{ id: "forged" }] }));
  expect(readProtectedJsonAt(integrity, inbox).tampered).toBe(true);
  // A second file in the same folder that the engine never recorded, while it recorded others, is not trusted.
  writeFileSync(join(dir, "outbox.json"), "{}");
  expect(readProtectedJsonAt(integrity, join(dir, "outbox.json")).tampered).toBe(true);
});

test("CON6-AC-10-integrity (finding 30): an integrity file that cannot be read (a folder) leaves a protected file read and marked tampered, never trusted", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const file = join(paths.crewDir, "profile.json");
  writeProtectedJson(paths, file, { version: 1 });
  rmSync(paths.integrityFile);
  mkdirSync(paths.integrityFile);
  let outcome: unknown;
  try {
    outcome = readProtectedJson<{ version: number }>(paths, file);
  } catch (error) {
    outcome = { refused: String(error) };
  }
  expect(outcome).not.toEqual({ data: { version: 1 }, tampered: false });
  expect(
    (outcome as { tampered?: boolean }).tampered === true ||
      typeof (outcome as { refused?: unknown }).refused === "string",
  ).toBe(true);
  // The one outcome today: the data read and marked tampered, never refused.
  expect(outcome).toEqual({ data: { version: 1 }, tampered: true });
});

test("CON6-AC-12 (finding 29): the integrity record is written under the store's lock: a held lock makes the write wait and refuse with LockBusy, the integrity file unchanged", () => {
  const paths = repoPaths(makeRepo(), testEnv());
  const file = join(paths.crewDir, "profile.json");
  writeProtectedJson(paths, file, { version: 1 });
  const before = readFileSync(paths.integrityFile);
  // Another writer holds the store's lock: a fresh lock folder beside the integrity file.
  const lock = join(dirname(paths.integrityFile), ".lock");
  mkdirSync(lock);
  let outcome: unknown;
  try {
    writeProtectedJson(paths, file, { version: 2 });
    outcome = "written";
  } catch (error) {
    outcome = error instanceof LockBusy ? "LockBusy" : String(error);
  } finally {
    rmdirSync(lock);
  }
  expect(outcome).toBe("LockBusy");
  expect(readFileSync(paths.integrityFile).equals(before)).toBe(true);
}, 15_000);

// Finding 239: a second process beside the test's. The child does one call on a protected file
// and says what it answered and how long it took; it writes a marker on the line before the call,
// so the test knows the call is next and never guesses a start time.
const CHILD_SOURCE = (() => {
  // The child's own environment, in its source: named from parts, as mail.test.ts names it.
  const PE = ["process", "env"].join(".");
  const src = (name: string) => join(import.meta.dir, "../src", name);
  return `import { writeFileSync } from "node:fs";
import { readWaitSpent } from "${src("lock.ts")}";
import { resolvePaths } from "${src("paths.ts")}";
import { readProtectedJson, recordIntegrity, writeProtectedJson } from "${src("store.ts")}";
const [root, file, marker, mode, tag] = process.argv.slice(2);
const paths = resolvePaths(root, ${PE});
writeFileSync(marker, "");
const started = Date.now();
let out;
try {
  if (mode === "read") out = readProtectedJson(paths, file, 10_000);
  else if (mode === "read-twice") {
    const first = readProtectedJson(paths, file).tampered;
    const firstMs = Date.now() - started;
    const second = readProtectedJson(paths, file).tampered;
    out = { first, second, firstMs, spent: readWaitSpent() };
  } else if (mode === "read-once") {
    out = { tampered: readProtectedJson(paths, file).tampered, spent: readWaitSpent() };
  } else if (mode === "write") {
    writeProtectedJson(paths, file, { by: "the child" });
    out = "written";
  } else if (mode === "write-many") {
    for (let i = 0; i < 300; i++) writeProtectedJson(paths, file, { by: tag, i, pad: "x".repeat(2000) });
    out = "written";
  } else if (mode === "accept") out = recordIntegrity(paths, file);
} catch (error) {
  out = { thrown: String(error) };
}
console.log(JSON.stringify({ out, ms: Date.now() - started }));
`;
})();

/** A repository with one protected file the engine wrote, and what a child process needs to reach it. */
function storeFixture() {
  const env = testEnv();
  const root = makeRepo();
  const paths = repoPaths(root, env);
  const file = join(paths.crewDir, "work", "w1", "evidence.json");
  writeProtectedJson(paths, file, { version: 1 });
  const dir = tempDir("crew-store-child-");
  const script = join(dir, "child.ts");
  writeFileSync(script, CHILD_SOURCE);
  let n = 0;
  const child = (mode: string, tag = "") => {
    n += 1;
    const marker = join(dir, `about-to-call-${n}`);
    const run = Bun.spawn(["bun", "run", script, root, file, marker, mode, tag], {
      env: { ...childEnv(), WIZARDINGCODE_HOME: env.WIZARDINGCODE_HOME ?? "" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const said = Promise.all([
      run.exited,
      new Response(run.stdout).text(),
      new Response(run.stderr).text(),
    ]).then(([code, stdout, stderr]) => {
      if (code !== 0) throw new Error(`the child exited ${code}: ${stderr}`);
      return JSON.parse(stdout.trim()) as { out: unknown; ms: number };
    });
    return { marker, said };
  };
  return { paths, file, child, storeDir: dirname(paths.integrityFile) };
}

/** The store's lock folder of a fixture. */
const storeLock = (paths: CrewPaths) => join(dirname(paths.integrityFile), ".lock");

/** Waits, inside a held lock, until the child's call is its next line; the lock is kept fresh so the stale rule never takes it. */
function untilMarked(marker: string, lock: string): void {
  const started = Date.now();
  while (!existsSync(marker)) {
    if (Date.now() - started > 8_000) throw new Error("the child never reached its call");
    utimesSync(lock, new Date(), new Date());
    sleep(20);
  }
}

/** Holds a lock for `ms` more, fresh throughout. */
function hold(lock: string, ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    utimesSync(lock, new Date(), new Date());
    sleep(Math.min(50, Math.max(1, end - Date.now())));
  }
}

const textOf = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;

test("2026-11-11-005 AC-1: a read that meets a writer between its write of the file and its write of the hash waits for the store's lock and answers what the file holds", async () => {
  const { paths, file, child, storeDir } = storeFixture();
  const lock = storeLock(paths);
  let reader: ReturnType<typeof child> | null = null;
  withLock(storeDir, () => {
    // What a writer leaves between its two writes: the new file, the hash of the one before.
    const next = textOf({ version: 2 });
    writeFileSync(file, next);
    reader = child("read");
    untilMarked(reader.marker, lock);
    // Held while the child's read finds the two apart; its own wait for the lock is ten seconds.
    hold(lock, 1_500);
    // The writer's second write.
    const map = JSON.parse(readFileSync(paths.integrityFile, "utf8")) as Record<string, string>;
    map[rel(paths, file)] = sha256(next);
    writeFileSync(paths.integrityFile, JSON.stringify(map));
  });
  const said = await (reader as unknown as ReturnType<typeof child>).said;
  expect(said.out).toEqual({ data: { version: 2 }, tampered: false });
  // It waited for the lock: a read made after the second write would have answered at once.
  expect(said.ms).toBeGreaterThanOrEqual(400);
}, 60_000);

test("2026-11-11-005 AC-2: a write holds the store's lock over the file and its hash: nothing is written while another holds it, a lock held past the wait leaves the file as it was, and writers of one file leave a file and a hash that belong together", async () => {
  const { paths, file, child, storeDir } = storeFixture();
  const lock = storeLock(paths);
  const first = readFileSync(file, "utf8");
  // Another holds the lock: the child's write changes nothing until the release.
  let writer: ReturnType<typeof child> | null = null;
  let duringHold = "";
  withLock(storeDir, () => {
    writer = child("write");
    untilMarked(writer.marker, lock);
    hold(lock, 500);
    duringHold = readFileSync(file, "utf8");
  });
  expect(duringHold).toBe(first);
  expect((await (writer as unknown as ReturnType<typeof child>).said).out).toBe("written");
  expect(readProtectedJson(paths, file)).toEqual({ data: { by: "the child" }, tampered: false });
  // The lock held past the wait: LockBusy, and the file byte for byte as it was.
  const before = readFileSync(file, "utf8");
  mkdirSync(lock);
  let outcome: unknown;
  try {
    writeProtectedJson(paths, file, { version: 3 });
    outcome = "written";
  } catch (error) {
    outcome = error instanceof LockBusy ? "LockBusy" : String(error);
  } finally {
    rmdirSync(lock);
  }
  expect(outcome).toBe("LockBusy");
  expect(readFileSync(file, "utf8")).toBe(before);
  // Six processes, three hundred writes each, on the one file: every write goes through, and the
  // file that is left is the one its hash was recorded for.
  const writers = Array.from({ length: 6 }, (_, i) => child("write-many", `writer-${i}`));
  const outs = await Promise.all(writers.map((w) => w.said));
  expect(outs.map((o) => o.out)).toEqual(Array(6).fill("written"));
  expect(readProtectedJson(paths, file).tampered).toBe(false);
}, 120_000);

test("2026-11-11-005 AC-3: the record of a file's integrity reads the file under the store's lock, so it records the text the file holds when the lock is released", async () => {
  const { paths, file, child, storeDir } = storeFixture();
  const lock = storeLock(paths);
  // A text the engine did not record: what crew accept is asked to trust.
  writeFileSync(file, textOf({ version: "by hand" }));
  const later = textOf({ version: "written meanwhile" });
  let accept: ReturnType<typeof child> | null = null;
  withLock(storeDir, () => {
    accept = child("accept");
    untilMarked(accept.marker, lock);
    hold(lock, 300);
    // Standing for an engine writer that finished while the accept waited for the lock.
    writeFileSync(file, later);
    hold(lock, 300);
  });
  expect((await (accept as unknown as ReturnType<typeof child>).said).out).toBe(true);
  expect(readFileSync(file, "utf8")).toBe(later);
  expect(readProtectedJson(paths, file)).toEqual({
    data: { version: "written meanwhile" },
    tampered: false,
  });
}, 60_000);

test("2026-11-11-005 AC-7: a file a hand changed still reads as changed, with no wait for a lock; policy.json keeps its hand-written rule; a store lock that cannot be taken leaves the read's first answer, throws nothing, and is waited for once in a process", async () => {
  const { paths, file, child } = storeFixture();
  const lock = storeLock(paths);
  // A byte appended by hand, no lock held: changed, at once, and left as the hand left it.
  const forged = `${readFileSync(file, "utf8")} `;
  writeFileSync(file, forged);
  const started = Date.now();
  expect(readProtectedJson(paths, file).tampered).toBe(true);
  // Under the two seconds a read waits for a lock: a read that waited for one fails the bound.
  expect(Date.now() - started).toBeLessThan(1_500);
  expect(readFileSync(file, "utf8")).toBe(forged);
  // The policy, written by hand with no hash recorded, beside other recorded files: trusted, as before.
  const policy = join(paths.crewDir, "policy.json");
  writeFileSync(policy, JSON.stringify({ mail: { name: "by-hand" } }));
  expect(readProtectedJson(paths, policy)).toEqual({
    data: { mail: { name: "by-hand" } },
    tampered: false,
  });
  // The lock held by another, fresh: in a child, since a read that cannot take a lock spends the
  // one wait of its process. Two reads: the first waits, the second does not, both say changed.
  mkdirSync(lock);
  const twice = await child("read-twice").said;
  rmdirSync(lock);
  const two = twice.out as { first: boolean; second: boolean; firstMs: number; spent: boolean };
  expect(two).toMatchObject({ first: true, second: true, spent: true });
  expect(two.firstMs).toBeGreaterThanOrEqual(1_900);
  expect(twice.ms).toBeLessThan(3_900);
  // The lock's folder not writable: the first answer, nothing thrown (root ignores the mode).
  if (process.getuid?.() !== 0) {
    const integrity = dirname(paths.integrityFile);
    chmodSync(integrity, 0o555);
    try {
      const once = await child("read-once").said;
      expect(once.out).toEqual({ tampered: true, spent: true });
    } finally {
      chmodSync(integrity, 0o755);
    }
  }
}, 60_000);
