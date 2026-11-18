// The tamper rule is written once (item 2026-11-18-014): `protectedTextChanged` is the rule's own
// answer on the hash; and two behaviours of `crew accept` that item 2026-11-18-013 left to reading:
// the decision before the trust, and the text rule for every protected file that is no JSON.
import { expect, test } from "bun:test";
import { chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runGates } from "../src/gates.ts";
import { onSessionStart } from "../src/hooks/session-start.ts";
import { addObjection, loadLedger, saveLedger } from "../src/objections.ts";
import { PROTECTED_WORK_FILES } from "../src/paths.ts";
import {
  integrityOf,
  protectedTextChanged,
  readProtectedJson,
  writeProtectedText,
} from "../src/store.ts";
import { addCriterion, addSkip, createWork, saveWork } from "../src/work.ts";
import { childEnv, cliIo, hookContext, makeRepo, tempDir, testEnv, write } from "./helpers.ts";

/** A proven item with one open blocking objection, and the commands to drive it. */
async function item() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const ctx = hookContext({ session_id: "s", cwd: root }, env);
  onSessionStart(ctx);
  const work = createWork(ctx.paths, "fix");
  work.route = "fast";
  addCriterion(work, "x");
  addSkip(work, "tdd:AC-1", "manual");
  saveWork(ctx.paths, work);
  write(root, "src/a.ts", "changed");
  const outcome = await runGates(ctx.paths, work, ctx.profile, ctx.policy);
  if (outcome.verdict !== "proven")
    throw new Error(`the fixture's gates did not prove: ${outcome.verdict}`);
  const { ledger } = loadLedger(ctx.paths, work.id);
  addObjection(ledger, "the page leaks a key", "gap-round", "blocking");
  saveLedger(ctx.paths, work.id, ledger);
  const folder = join(root, ".crew", "work", work.id);
  const run = cliIo(root, env);
  /** A command's answer; what it throws is an answer too, with the line it was thrown on. */
  const said = async (...argv: string[]) => {
    try {
      const got = await run(...argv);
      return { code: got.code, text: `${got.out}${got.err}` };
    } catch (error) {
      return { code: 1, text: error instanceof Error ? `${error.stack}` : String(error) };
    }
  };
  const register = (): { text: string }[] => {
    const file = join(root, ".crew", "decisions.json");
    return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")).entries : [];
  };
  return { root, ctx, id: work.id, folder, said, register };
}

test("rule AC-4: the hash's answer is the one rule's: a hand-written policy with no hash is not changed, and a whole text that is no JSON takes no lock", async () => {
  const a = await item();
  const paths = a.ctx.paths;
  // The engine recorded other files; the policy is written by hand and has no hash.
  expect(Object.keys(integrityOf(paths)).length).toBeGreaterThan(0);
  const policy = join(a.root, ".crew", "policy.json");
  writeFileSync(policy, `${JSON.stringify({ attendedDecisions: "relay" })}\n`);
  expect(integrityOf(paths)[".crew/policy.json"]).toBeUndefined();
  expect(readProtectedJson<unknown>(paths, policy).tampered).toBe(false);
  expect(protectedTextChanged(paths, policy)).toBe(false);
  // Any other protected file with no hash, beside recorded ones, is changed.
  const stray = join(a.folder, "mail.json");
  writeFileSync(stray, "{}\n");
  expect(protectedTextChanged(paths, stray)).toBe(true);

  // A whole report, no JSON, asked while the store's lock is held, in a process of its own (a
  // process spends its wait for a lock on a read once): not changed, and the wait not spent.
  const report = join(a.folder, "report.md");
  writeProtectedText(paths, report, "# Report\n\nProven.\n");
  const script = join(tempDir("crew-rule-"), "asks.ts");
  writeFileSync(
    script,
    `import { mkdirSync, rmdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { readWaitSpent } from "${join(import.meta.dir, "../src/lock.ts")}";
import { protectedTextChanged } from "${join(import.meta.dir, "../src/store.ts")}";
const paths = JSON.parse(process.argv[2]);
const before = readWaitSpent();
// Planted fresh: a lock older than the stale age would be broken and taken.
const lock = join(dirname(paths.integrityFile), ".lock");
mkdirSync(lock);
const changed = protectedTextChanged(paths, process.argv[3]);
rmdirSync(lock);
console.log(JSON.stringify({ before, changed, after: readWaitSpent() }));
`,
  );
  const child = Bun.spawnSync(["bun", script, JSON.stringify(paths), report], {
    env: childEnv(),
    timeout: 30_000,
  });
  expect(`${child.stderr}`).toBe("");
  expect(JSON.parse(`${child.stdout}`)).toEqual({ before: false, changed: false, after: false });

  // Changed by hand, it is changed; gone, it is not.
  writeFileSync(report, `${readFileSync(report, "utf8")} `);
  expect(protectedTextChanged(paths, report)).toBe(true);
  unlinkSync(report);
  expect(protectedTextChanged(paths, report)).toBe(false);
}, 60_000);

test("rule AC-3: crew accept writes its decision before it trusts anything", async () => {
  if (process.getuid?.() === 0) {
    console.log("skipped: an administrator's process ignores file modes");
    return;
  }
  const a = await item();
  const ledger = join(a.folder, "objections.json");
  const key = `.crew/work/${a.id}/objections.json`;
  // A register on record first, so that the write that fails is the decision's and no other.
  writeFileSync(ledger, `${readFileSync(ledger, "utf8")} `);
  expect((await a.said("accept", a.id)).code).toBe(0);
  const entries = a.register().length;
  expect(entries).toBe(1);
  unlinkSync(ledger);
  expect(integrityOf(a.ctx.paths)[key]).toBeDefined();
  const crew = join(a.root, ".crew");
  chmodSync(crew, 0o555);
  let failed: { code: number; text: string };
  try {
    failed = await a.said("accept", a.id);
  } finally {
    chmodSync(crew, 0o755);
  }
  expect(failed.code).not.toBe(0);
  // The write that failed is of a file of `.crew/` itself, where the register is, written through
  // a temporary file beside it; the mutant on the order shows it is the decision's.
  expect(failed.text).toMatch(/EACCES.*\/\.crew\/\.[^/]+\.tmp/);
  expect(a.register().length, "no decision written").toBe(entries);
  expect(integrityOf(a.ctx.paths)[key], "no hash forgotten").toBeDefined();
  expect((await a.said("status", a.id)).text).toContain(
    `record removed outside the engine: objections.json (the user accepts it with crew accept ${a.id})`,
  );
  // With the register writable again the accept goes through, on record.
  expect((await a.said("accept", a.id)).code).toBe(0);
  expect(a.register().length).toBe(entries + 1);
}, 60_000);

test("rule AC-3: every protected file of an item that is no JSON, whole, is not a changed file, and each changed by hand is", async () => {
  const a = await item();
  const texts = PROTECTED_WORK_FILES.filter((name) => !name.endsWith(".json"));
  expect(texts).toContain("report.md");
  expect(texts).toContain("knowledge.md");
  for (const name of texts)
    writeProtectedText(a.ctx.paths, join(a.folder, name), `# ${name}\n\nnot JSON\n`);
  const before = a.register().length;
  const clean = await a.said("accept", a.id, "--json");
  expect(clean.code).toBe(0);
  expect(JSON.parse(clean.text).changed).toEqual([]);
  expect(a.register().length).toBe(before);
  for (const name of texts) {
    const file = join(a.folder, name);
    writeFileSync(file, `${readFileSync(file, "utf8")} `);
    const got = await a.said("accept", a.id, "--json");
    expect(JSON.parse(got.text).changed, name).toEqual([name]);
    expect(a.register().at(-1)?.text, name).toBe(
      `files accepted after a change outside the engine; changed: ${name}; gone: none`,
    );
  }
}, 60_000);
