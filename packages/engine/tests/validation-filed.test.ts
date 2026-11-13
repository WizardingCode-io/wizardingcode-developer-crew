import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadEvidence, saveEvidence } from "../src/evidence.ts";
import { workDir } from "../src/paths.ts";
import type { RoleRecord, WorkItem } from "../src/types.ts";
import { fileHash } from "../src/validation.ts";
import { loadWork, notProvenLines, saveWork } from "../src/work.ts";
import {
  cliIo,
  filedLead,
  leadAnswerText,
  makeRepo,
  repoPaths,
  testEnv,
  write,
} from "./helpers.ts";

const STANDARD = JSON.stringify({
  work_type: "feature",
  is_vague: 0.1,
  scope: 1,
  touches_auth: 0,
  touches_payments: 0,
  touches_personal_data: 0,
  touches_data_migration: 0,
  touches_infra: 0,
  touches_public_api: 0,
});

const notFiled = (id: string, name: string, by: string): string =>
  `${name} is not an answer a role filed for ${by}: resume or launch the lead so its answer is filed, or, where the runtime files none, crew answer file ${id} --role tech-lead --file <path>; nothing recorded`;

/** A standard item with its spec written: the two leads every such item has are seated. */
async function item() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const env = testEnv();
  const run = cliIo(root, env);
  const paths = repoPaths(root, env);
  const started = await run("start", "Add a thing", "--answers", STANDARD, "--criterion", "a");
  const id = /started (\S+)/.exec(started.out)?.[1] ?? "";
  write(root, `.crew/work/${id}/spec.md`, "# Spec\n\n## Acceptance criteria\n- AC-1: a\n");
  const work = (): WorkItem => loadWork(paths, id).work as WorkItem;
  const record = (by: string, file: string, what = "spec", ...flags: string[]) =>
    run("validation", id, "record", "--what", what, "--by", by, "--file", file, ...flags);
  const roles = (): RoleRecord[] => loadEvidence(paths, id).evidence.roles ?? [];
  /** The role records rewritten through the engine's own writer, for shapes only an older engine left. */
  const rewriteRoles = (change: (roles: RoleRecord[]) => RoleRecord[]): void => {
    const evidence = loadEvidence(paths, id).evidence;
    evidence.roles = change(evidence.roles ?? []);
    saveEvidence(paths, id, evidence);
  };
  const rel = (path: string): string => path.slice(join(root, ".crew", "work", id).length + 1);
  return { root, env, run, paths, id, work, record, roles, rewriteRoles, rel };
}

test("2026-11-12-005 AC-10 (finding 242): crew validation record refuses a file no role record names, and one whose latest record is another team's, and records nothing; a file with one of today's defects gets today's refusal", async () => {
  const { root, env, id, work, record, rel } = await item();
  // Written by hand in the lead's own place, with a heading and a verdict a parser takes.
  const name = "conclave/lead-qa.md";
  write(root, `.crew/work/${id}/${name}`, leadAnswerText(id, "lead-qa", "spec"));
  const byHand = await record("lead-qa", `.crew/work/${id}/${name}`);
  expect(byHand.code).toBe(1);
  expect(byHand.out).toBe("");
  expect(byHand.err.trim()).toBe(notFiled(id, name, "lead-qa"));
  expect(work().validations ?? []).toEqual([]);
  expect(work().rounds?.validation ?? 0).toBe(0);
  // The security lead's answer is filed by the hook; its file is then given a qa heading by hand
  // and offered as the qa lead's: the latest record that names it is the security team's.
  const filed = filedLead(env, root, id, leadAnswerText(id, "lead-security", "spec"));
  expect(rel(filed)).toBe("conclave/lead-security.md");
  writeFileSync(filed, leadAnswerText(id, "lead-qa", "spec", { note: "borrowed" }));
  const borrowed = await record("lead-qa", filed);
  expect(borrowed.code).toBe(1);
  expect(borrowed.err.trim()).toBe(notFiled(id, "conclave/lead-security.md", "lead-qa"));
  expect(work().validations ?? []).toEqual([]);
  // Today's refusals come first, in their order: a file with no lead heading is told so.
  write(root, `.crew/work/${id}/conclave/notes.md`, "verdict: validated\n## Returns\n- none\n");
  expect((await record("lead-qa", `.crew/work/${id}/conclave/notes.md`)).err.trim()).toBe(
    `conclave/notes.md has no lead heading (# <team> lead's validation of ${id}: <spec|plan|delivery>); asked: the spec by lead-qa for ${id}`,
  );
});

test("2026-11-12-005 AC-10 (finding 242): the latest record that names the file decides: a record of another role with the lead's team is no lead's answer, whatever an older record says", async () => {
  const { root, env, id, work, record, roles, rewriteRoles, rel } = await item();
  const text = leadAnswerText(id, "lead-qa", "spec");
  const filed = filedLead(env, root, id, text);
  const name = rel(filed);
  // A reviewer of the qa team is the latest to name the lead's file, the lead's own record under it.
  const hash = roles().at(-1)?.fileHash;
  rewriteRoles((all) => [
    ...all,
    {
      agent: "review-test-quality",
      agentId: "reviewer-1",
      team: "qa",
      at: "2026-11-12T10:00:00.000Z",
      tokens: 0,
      tokensFrom: "none",
      file: name,
      ...(hash ? { fileHash: hash } : {}),
    },
  ]);
  const notALead = await record("lead-qa", filed);
  expect(notALead.code).toBe(1);
  expect(notALead.err.trim()).toBe(notFiled(id, name, "lead-qa"));
  expect(work().validations ?? []).toEqual([]);
  // With the lead's record the latest again, the same file is taken.
  rewriteRoles((all) => all.filter((r) => r.agent !== "review-test-quality"));
  expect((await record("lead-qa", filed)).code).toBe(0);
});

test("2026-11-12-005 AC-10: today's refusals come before the new check, and evidence changed outside the engine is refused before any of them", async () => {
  const { root, env, id, work, record } = await item();
  const text = leadAnswerText(id, "lead-qa", "spec", {
    verdict: "returned",
    returns: "- R-1 · spec.md:4 · say what a is",
  });
  const filed = filedLead(env, root, id, text);
  expect((await record("lead-qa", filed)).code).toBe(0);
  // The recorded answer copied under a name no role record holds: it is an earlier answer first,
  // the refusal the command had before the new check.
  const copy = `.crew/work/${id}/conclave/lead-qa-copy.md`;
  write(root, copy, readFileSync(filed, "utf8"));
  const repeated = await record("lead-qa", copy);
  expect(repeated.code).toBe(1);
  expect(repeated.err.trim()).toStartWith(
    "already recorded: conclave/lead-qa.md is the answer recorded for round 1 of lead-qa (spec)",
  );
  // A lead that is no seat of the item is told so before its file is read at all.
  expect((await record("lead-etl", copy)).err.trim()).toBe(
    `lead-etl is not a seat of ${id} (crew team ${id} prints the seats)`,
  );
  // A role record added to the evidence by hand never reaches the check: the item is not opened.
  const evidenceFile = join(root, `.crew/work/${id}/evidence.json`);
  const edited = JSON.parse(readFileSync(evidenceFile, "utf8")) as { roles?: unknown[] };
  edited.roles = [
    ...(edited.roles ?? []),
    {
      agent: "tech-lead",
      team: "security",
      at: "x",
      tokens: 0,
      tokensFrom: "none",
      file: "conclave/lead-security.md",
    },
  ];
  writeFileSync(evidenceFile, JSON.stringify(edited));
  write(
    root,
    `.crew/work/${id}/conclave/lead-security.md`,
    leadAnswerText(id, "lead-security", "spec"),
  );
  const tampered = await record("lead-security", `.crew/work/${id}/conclave/lead-security.md`);
  expect(tampered.code).toBe(1);
  expect(tampered.err).toContain("changed outside the engine");
  expect(tampered.err).not.toContain("is not an answer a role filed");
  expect(work().validations?.length).toBe(1);
});

test("2026-11-12-005 AC-2 (finding 242): a role record keeps the hash of the content it filed, and a file changed after its filing is refused; with an older record that has no hash, the newer one is read", async () => {
  const { root, env, run, id, work, record, roles, rewriteRoles, rel } = await item();
  const text = leadAnswerText(id, "lead-qa", "spec");
  const filed = filedLead(env, root, id, text);
  expect(roles().at(-1)).toMatchObject({
    agent: "tech-lead",
    team: "qa",
    file: "conclave/lead-qa.md",
    fileHash: fileHash(readFileSync(filed, "utf8")),
  });
  // The same words with a kinder note, written over the hook's file.
  writeFileSync(filed, leadAnswerText(id, "lead-qa", "spec", { note: "holds, all of it" }));
  const changed = await record("lead-qa", filed);
  expect(changed.code).toBe(1);
  expect(changed.err.trim()).toBe(
    `${rel(filed)} changed after its filing: its content is not the one tech-lead filed; resume the lead for a new answer; nothing recorded`,
  );
  expect(work().validations ?? []).toEqual([]);
  // An older record with no hash still names the file; the newer one, with its hash, is the one read.
  rewriteRoles((all) => [
    {
      agent: "tech-lead",
      team: "qa",
      at: "2026-11-01T10:00:00.000Z",
      tokens: 0,
      tokensFrom: "none",
      file: "conclave/lead-qa.md",
    },
    ...all,
  ]);
  expect((await record("lead-qa", filed)).code).toBe(1);
  writeFileSync(filed, text);
  const taken = await record("lead-qa", filed);
  expect(taken.code, taken.err).toBe(0);
  expect(taken.out.split("\n")[0]).toBe("validation of spec by lead-qa: validated (round 1)");
  expect(taken.out).not.toContain("taken with no content check");
  // crew answer file writes the hash too, under a runtime that files no answer by hook.
  const gemini = work();
  gemini.runtimes = ["gemini"];
  saveWork(repoPaths(root, env), gemini);
  const source = join(root, "security.md");
  writeFileSync(source, leadAnswerText(id, "lead-security", "spec"));
  expect((await run("answer", "file", id, "--role", "tech-lead", "--file", source)).code).toBe(0);
  expect(roles().at(-1)).toMatchObject({
    filedBy: "session",
    file: "conclave/lead-security.md",
    fileHash: fileHash(
      readFileSync(join(root, `.crew/work/${id}/conclave/lead-security.md`), "utf8"),
    ),
  });
});

test("2026-11-12-005 AC-13: the answers a role filed are recorded as today: the hook's first filing, a resumed lead's reply, a session's filing under a runtime with no subagent event, and a record with no hash, which is named beside the verdict line", async () => {
  const { root, env, run, paths, id, work, record, rewriteRoles, rel } = await item();
  // The hook's first filing, returned; the same lead resumed answers into its reply file.
  const first = filedLead(
    env,
    root,
    id,
    leadAnswerText(id, "lead-qa", "spec", {
      verdict: "returned",
      returns: "- R-1 · spec.md:4 · say what a is",
    }),
    "lead-qa-agent",
  );
  const returned = await record("lead-qa", first);
  expect(returned.code, returned.err).toBe(0);
  expect(returned.out.split("\n")[0]).toBe(
    "validation of spec by lead-qa: returned, 1 return (round 1)",
  );
  const reply = filedLead(
    env,
    root,
    id,
    leadAnswerText(id, "lead-qa", "spec", { note: "now it does" }),
    "lead-qa-agent",
  );
  expect(rel(reply)).toBe("conclave/lead-qa-reply.md");
  const validated = await record("lead-qa", reply);
  expect(validated.code, validated.err).toBe(0);
  expect(validated.out.split("\n")[0]).toBe("validation of spec by lead-qa: validated (round 1)");
  expect(validated.out).not.toContain("taken with no content check");
  expect(JSON.parse((await run("status", id, "--json")).out).active).toBe(id);
  // A session's filing, where the runtime has no subagent event: taken, and named beside the verdict.
  const gemini = work();
  gemini.runtimes = ["gemini"];
  saveWork(paths, gemini);
  const source = join(root, "security.md");
  writeFileSync(source, leadAnswerText(id, "lead-security", "spec"));
  expect((await run("answer", "file", id, "--role", "tech-lead", "--file", source)).code).toBe(0);
  const bySession = await record("lead-security", `.crew/work/${id}/conclave/lead-security.md`);
  expect(bySession.code, bySession.err).toBe(0);
  expect(bySession.out.trim().split("\n")).toEqual([
    "validation of spec by lead-security: validated (round 1)",
    expect.stringMatching(/^Not proven: /),
    "answers filed by the session: tech-lead (security)",
    // The item also holds the hook's filings, none witnessed (finding 243).
    "no runtime witness on this item: its role filings rest on the hook's payload alone",
  ]);
  // A record from before the content hash: taken by its file name, and said.
  const delivery = filedLead(env, root, id, leadAnswerText(id, "lead-qa", "delivery"));
  rewriteRoles((all) =>
    all.map((r) => {
      if (r.file !== rel(delivery)) return r;
      const { fileHash: _dropped, ...older } = r;
      return older;
    }),
  );
  const unchecked = await run(
    "validation",
    id,
    "record",
    "--what",
    "delivery",
    "--by",
    "lead-qa",
    "--file",
    delivery,
    "--json",
  );
  expect(unchecked.code, unchecked.err).toBe(0);
  const answered = JSON.parse(unchecked.out) as { message: string; contentChecked: boolean };
  expect(answered.contentChecked).toBe(false);
  expect(answered.message.split("\n")).toContain(
    "taken with no content check (its record predates the content hash): lead-qa",
  );
});

test("2026-11-12-005 AC-11: when the save of the verdict is refused, crew validation record prints no verdict of its own reading and its data carries none", async () => {
  const { root, env, run, paths, id, work, rewriteRoles, rel } = await item();
  const filed = filedLead(env, root, id, leadAnswerText(id, "lead-qa", "spec"));
  const security = filedLead(env, root, id, leadAnswerText(id, "lead-security", "spec"));
  // The qa lead's record is one from before the content hash: that is said whether or not the verdict is written.
  rewriteRoles((all) =>
    all.map((r) => {
      if (r.file !== rel(filed)) return r;
      const { fileHash: _dropped, ...older } = r;
      return older;
    }),
  );
  // Another command holds the work folder: the validation is recorded, the verdict cannot be written.
  const lock = join(workDir(paths, id), ".lock");
  mkdirSync(lock);
  const refused = await run(
    "validation",
    id,
    "record",
    "--what",
    "spec",
    "--by",
    "lead-qa",
    "--file",
    filed,
    "--json",
  );
  rmdirSync(lock);
  expect(refused.code, refused.err).toBe(0);
  const data = JSON.parse(refused.out) as Record<string, unknown> & { message: string };
  expect(data.message.split("\n")).toEqual([
    "validation of spec by lead-qa: validated (round 1)",
    `the work folder of ${id} is busy (another crew command holds it); nothing recorded: run the command again`,
    `the verdict was not written: crew evidence ${id} reads it again`,
    "no runtime witness on this item: its role filings rest on the hook's payload alone",
    "taken with no content check (its record predates the content hash): lead-qa",
  ]);
  expect(data.contentChecked).toBe(false);
  expect(data.message).not.toContain("Proven");
  expect(data.verdictWritten).toBe(false);
  expect("verdict" in data).toBe(false);
  expect("unproven" in data).toBe(false);
  expect(work().validations?.length).toBe(1);
  // With the folder free the verdict is written, and the data says so with it.
  const written = JSON.parse(
    (
      await run(
        "validation",
        id,
        "record",
        "--what",
        "spec",
        "--by",
        "lead-security",
        "--file",
        security,
        "--json",
      )
    ).out,
  ) as Record<string, unknown>;
  expect(written.verdictWritten).toBe(true);
  expect(written.verdict).toBe("unproven");
  expect(Array.isArray(written.unproven)).toBe(true);
}, 60_000);

test("2026-11-12-005 AC-12: the guard into Learn and crew learn name what the verdict gives: the earlier-code line once for the code's reasons, then each other reason on its own line", () => {
  const id = "2026-11-12-001-x";
  const code = `not proven: the proof is on earlier code (crew gate run ${id})`;
  const stale = "validation of spec by lead-qa: stale (spec changed); record the lead again";
  expect(notProvenLines(id, ["code changed since the last gate run"])).toEqual([code]);
  expect(
    notProvenLines(id, [
      "gate prose not run on the current code",
      "gate test not run on the current code",
      "judgement gate code-quality not run on the current code",
      "gates have not run",
    ]),
  ).toEqual([code]);
  expect(notProvenLines(id, [stale])).toEqual([`not proven: ${stale}`]);
  expect(
    notProvenLines(id, [stale, "code changed since the last gate run", "gate lint failing"]),
  ).toEqual([code, `not proven: ${stale}`, "not proven: gate lint failing"]);
  expect(notProvenLines(id, [])).toEqual([code]);
});
