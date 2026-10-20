import { expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { writeOrigin } from "../src/analysis.ts";
import { addEntry, readBase, scopeOf, updateEntry } from "../src/knowledge.ts";
import { draftsOf, learnItem, sameRootCause } from "../src/learn.ts";
import { mailbox, mailContext, readBox, registerProject } from "../src/mail.ts";
import { workDir } from "../src/paths.ts";
import { loadPolicy } from "../src/policy.ts";
import { ensureProfile } from "../src/profile.ts";
import type {
  KnowledgeBase,
  KnowledgeDraft,
  KnowledgeEntry,
  Target,
  WorkItem,
} from "../src/types.ts";
import { addCriterion, createWork, loadWork, saveWork } from "../src/work.ts";
import { makeRepo, repoPaths, testEnv, write } from "./helpers.ts";

const KEY = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");

/** A project in a workspace, registered, with a proven item at `learn` whose records are written by the caller. */
function project(
  env: NodeJS.ProcessEnv,
  workspace: string | null,
  name: string,
  accept?: string[],
) {
  const root = makeRepo({
    "package.json": JSON.stringify({ name, scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  if (workspace !== null)
    write(root, ".crew/policy.json", JSON.stringify({ mail: { workspace, name, accept } }));
  const paths = repoPaths(root, env);
  const policy = loadPolicy(paths).policy;
  const profile = ensureProfile(paths).profile;
  const mail = mailContext(paths, policy, env);
  registerProject(mail, `session-${name}`, { hook: true });
  return { root, paths, policy, profile, mail, env };
}

function item(p: ReturnType<typeof project>, title = "Login sessions expire too early"): WorkItem {
  const work = createWork(p.paths, title);
  work.route = "standard";
  addCriterion(work, "a session lasts an hour");
  addCriterion(work, "a logout drops the cookie");
  work.phase = "learn";
  saveWork(p.paths, work);
  const dir = workDir(p.paths, work.id);
  write(p.root, "src/auth/session.ts", "export const ttl = 3600;\n");
  writeFileSync(
    join(dir, "spec.md"),
    "# Login sessions\n\n## Problem\n\nSessions expire after ten minutes and the cookie survives a logout.\n\n## Acceptance criteria\n\n- AC-1: a session lasts an hour\n",
  );
  return work;
}

function learn(
  p: ReturnType<typeof project>,
  work: WorkItem,
  options: { confirm?: string; proven?: boolean } = {},
) {
  const out = learnItem(p.paths, work, p.profile, p.policy, p.mail, options.proven ?? true, {
    confirm: options.confirm,
  });
  // The command saves the item after a learn that wrote; the unit does the same here.
  if (!("refused" in out)) saveWork(p.paths, work);
  return out;
}

function entries(env: NodeJS.ProcessEnv): KnowledgeEntry[] {
  return (
    (readBase(join(env.WIZARDINGCODE_HOME ?? "", "crew")).base as KnowledgeBase)?.entries ?? []
  );
}

test("SP4-T4 AC-2: crew learn writes the validated solution from the item's records, the documentation facts with a URL source and the workspace's stack preference, records work.learned, and refuses a second run, an unproven item and an audit", () => {
  const env = testEnv();
  const p = project(env, "acme", "shop");
  const work = item(p);
  const dir = workDir(p.paths, work.id);
  mkdirSync(join(dir, "conclave"), { recursive: true });
  writeFileSync(
    join(dir, "conclave", "researcher.md"),
    [
      "# Research",
      "## What the code does today",
      "- src/auth/session.ts:1 · the ttl is a constant",
      "## What the documentation says",
      '- https://docs.example/sessions?tab=1#ttl · "A session cookie lives until the browser closes unless an age is set" · D-1 keeps the age',
      '- https://docs.example/logout · "Logout must clear the cookie server side" · the logout path',
      '- https://docs.example/old · "An old sentence" · disputed',
      '- https://user:pw@docs.example/secret · "A quote behind a login" · skipped for its userinfo',
      '- The team wiki page · "Not a URL" · a document',
      "## Prior solutions",
      "- none",
    ].join("\n"),
  );
  writeFileSync(
    join(dir, "conclave", "researcher.verification.json"),
    JSON.stringify({
      at: "2026-10-20T00:00:00.000Z",
      hash: "x",
      facts: [
        { id: "F-1", status: "verified" },
        { id: "F-2", status: "unverified" },
        { id: "F-3", status: "disputed" },
        { id: "F-4", status: "unverified" },
      ],
    }),
  );
  const outcome = learn(p, work);
  if ("refused" in outcome) throw new Error(outcome.refused);
  const kinds = outcome.entries.map((e) => [e.id, e.kind]);
  expect(kinds).toEqual([
    ["K-1", "validated-solution"],
    ["K-2", "documentation"],
    ["K-3", "documentation"],
    ["K-4", "stack-preference"],
  ]);
  const solution = outcome.entries[0] as KnowledgeEntry;
  expect(solution).toMatchObject({
    title: "Login sessions expire too early",
    workspace: "acme",
    project: "shop",
    confidential: true,
    item: work.id,
    stacks: ["node"],
    paths: ["src/auth/session.ts"],
    source: null,
  });
  expect(solution.text).toBe(
    "Sessions expire after ten minutes and the cookie survives a logout.\nAC-1: a session lasts an hour\nAC-2: a logout drops the cookie",
  );
  expect(solution.commit).toMatch(/^[0-9a-f]{40}$/);
  expect(solution.words).toContain("session");
  const doc = outcome.entries[1] as KnowledgeEntry;
  expect(doc).toMatchObject({
    kind: "documentation",
    confidential: false,
    source: "https://docs.example/sessions",
    title:
      "https://docs.example/sessions · A session cookie lives until the browser closes unless an ag",
    text: "A session cookie lives until the browser closes unless an age is set · D-1 keeps the age",
    item: work.id,
  });
  expect(outcome.entries[2]?.source).toBe("https://docs.example/logout");
  expect(outcome.skipped).toEqual(["F-4: https://user:pw@docs.example/secret carries userinfo"]);
  const stack = outcome.entries[3] as KnowledgeEntry;
  expect(stack).toMatchObject({
    title: "Stack preference of acme",
    text: "node: 1 project",
    confidential: true,
    item: null,
    workspace: "acme",
  });
  expect(loadWork(p.paths, work.id).work?.learned).toMatchObject({
    entries: ["K-1", "K-2", "K-3", "K-4"],
    confirmed: [],
  });
  expect(learn(p, loadWork(p.paths, work.id).work as WorkItem)).toEqual({
    refused: "already learned: K-1, K-2, K-3, K-4",
  });
  // The ticket is the proof as it stands now, and an audit learns nothing.
  const stale = item(p, "Another change");
  expect(learn(p, stale, { proven: false })).toEqual({
    refused: `not proven: the proof is on earlier code (crew gate run ${stale.id})`,
  });
  const audit = item(p, "Audit this project");
  audit.kind = "audit";
  expect(learn(p, audit)).toEqual({ refused: "an audit learns nothing in this release" });
  const early = item(p, "Early");
  early.phase = "deliver";
  expect(learn(p, early)).toEqual({
    refused: `crew learn runs in the learn phase: crew phase ${early.id} next first`,
  });
  // The local-artifacts policy records no commit.
  const local = project(env, "acme", "local-shop");
  const localWork = item(local);
  const localOut = learn({ ...local, policy: { ...local.policy, artifacts: "local" } }, localWork);
  if ("refused" in localOut) throw new Error(localOut.refused);
  expect(localOut.entries[0]?.commit).toBeNull();
});

test("SP4-T4 AC-2: the stack preference is one entry per workspace, rewritten in place by the next item, from the registered projects' readable profiles alone, and skipped with none", () => {
  const env = testEnv();
  const shop = project(env, "acme", "shop");
  const crm = project(env, "acme", "crm");
  write(crm.root, ".crew/profile.json", "{not json");
  const first = learn(shop, item(shop, "First"));
  if ("refused" in first) throw new Error(first.refused);
  const stack = first.entries.find((e) => e.kind === "stack-preference") as KnowledgeEntry;
  expect(stack.text).toBe("node: 1 project");
  const before = entries(env).length;
  // A person unmarked the preference meanwhile: the rewrite keeps the mark as it is.
  const unmarked = updateEntry(join(env.WIZARDINGCODE_HOME ?? "", "crew"), stack.id, (e) => {
    e.confidential = false;
  });
  expect("refused" in unmarked).toBe(false);
  const second = learn(shop, item(shop, "Second"));
  if ("refused" in second) throw new Error(second.refused);
  const again = second.entries.find((e) => e.kind === "stack-preference") as KnowledgeEntry;
  expect(again.id).toBe(stack.id);
  expect(again.createdAt).toBe(stack.createdAt);
  expect(again.confidential).toBe(false);
  expect(again.text).toBe("node: 1 project");
  expect(entries(env).length).toBe(before + 1);
  // No profile anywhere: the draft is skipped; no workspace: no preference at all.
  const alone = project(env, null, "alone");
  const out = learn(alone, item(alone, "Alone"));
  if ("refused" in out) throw new Error(out.refused);
  expect(out.entries.map((e) => e.kind)).toEqual(["validated-solution"]);
  expect(out.notices).toEqual([]);
});

test("SP4-T4 AC-2: a secret in a criterion, a cause, a quote or a claim refuses the whole learn naming the source and the field, and nothing is written", () => {
  const env = testEnv();
  const p = project(env, "acme", "shop");
  const cases: [string, (dir: string, work: WorkItem) => void, string][] = [
    [
      "criterion",
      (_dir, work) => {
        addCriterion(work, `rotate ${KEY}`);
        saveWork(p.paths, work);
      },
      "spec.md: AWS access key found in the text of the validated-solution entry; nothing was written",
    ],
    [
      "cause",
      (dir, work) => {
        work.kind = "issue";
        saveWork(p.paths, work);
        writeFileSync(
          join(dir, "analysis.md"),
          `# Analysis\n\n## Origin\n\nnone\n\n## Cause\n\nThe key ${KEY} leaked.\n\n## Blast radius\n\nnone\n`,
        );
        writeOrigin(p.paths, work.id, {
          at: "t",
          paths: [{ path: "src/a.ts", commits: [] }],
          items: [],
        });
      },
      "analysis.md: AWS access key found in the text of the root-cause entry; nothing was written",
    ],
    [
      "quote",
      (dir) => {
        mkdirSync(join(dir, "conclave"), { recursive: true });
        writeFileSync(
          join(dir, "conclave", "researcher.md"),
          `## What the documentation says\n- https://docs.example/x · "use ${KEY}" · a claim\n`,
        );
      },
      "conclave/researcher.md: AWS access key found in the title of the documentation entry; nothing was written",
    ],
    [
      "claim",
      (dir) => {
        mkdirSync(join(dir, "conclave"), { recursive: true });
        writeFileSync(
          join(dir, "conclave", "researcher.md"),
          `## What the documentation says\n- https://docs.example/x · "a quote" · set ${KEY}\n`,
        );
      },
      "conclave/researcher.md: AWS access key found in the text of the documentation entry; nothing was written",
    ],
  ];
  for (const [name, plant, refused] of cases) {
    const work = item(p, `Case ${name}`);
    plant(workDir(p.paths, work.id), work);
    const before = entries(env).length;
    expect(learn(p, loadWork(p.paths, work.id).work as WorkItem), name).toEqual({ refused });
    expect(entries(env).length, name).toBe(before);
    expect(loadWork(p.paths, work.id).work?.learned, name).toBeUndefined();
  }
});

test("SP4-T4 AC-3: crew learn confirms the listed entries the records cite, refuses a cited id the project no longer reads, and writes a root cause once: the duplicate refused with its two ways out, --confirm confirming it instead", () => {
  const env = testEnv();
  const p = project(env, "acme", "shop");
  const scope = scopeOf(p.paths, p.mail.self);
  const userDir = join(env.WIZARDINGCODE_HOME ?? "", "crew");
  const base = (over: Partial<KnowledgeDraft>): KnowledgeEntry => {
    const added = addEntry(userDir, {
      kind: "general",
      title: "Listed",
      workspace: scope.workspace,
      project: scope.project,
      projectRoot: scope.projectRoot,
      confidential: true,
      item: null,
      commit: null,
      stacks: [],
      paths: [],
      words: [],
      text: "x",
      source: null,
      ...over,
    });
    if ("refused" in added) throw new Error(added.refused);
    return added;
  };
  const cited = base({ title: "Cited and listed" });
  const listedOnly = base({ title: "Listed, not cited" });
  const citedOnly = base({ title: "Cited, not listed" });
  const hidden = base({ title: "Of another workspace", workspace: "globex", projectRoot: "/x" });
  const work = item(p);
  work.knowledge = { readAt: "t", listed: [cited.id, listedOnly.id] };
  saveWork(p.paths, work);
  const dir = workDir(p.paths, work.id);
  writeFileSync(
    join(dir, "spec.md"),
    `# Spec\n\n## Problem\n\nAs the base says [K:${cited.id}], [K:${citedOnly.id}], [K:K-99] and [K:${hidden.id}].\n\n## Acceptance criteria\n\n- AC-1: x\n`,
  );
  // A cited id the project cannot read refuses the learn as an unknown id would.
  work.knowledge = { readAt: "t", listed: [cited.id, listedOnly.id, hidden.id] };
  saveWork(p.paths, work);
  expect(learn(p, work)).toEqual({ refused: `no entry ${hidden.id} visible to this project` });
  expect(entries(env).length).toBe(4);
  work.knowledge = { readAt: "t", listed: [cited.id, listedOnly.id] };
  saveWork(p.paths, work);
  const out = learn(p, work);
  if ("refused" in out) throw new Error(out.refused);
  expect(out.confirmed).toEqual([cited.id]);
  const confirmed = entries(env).find((e) => e.id === cited.id) as KnowledgeEntry;
  expect(confirmed.confirmedBy).toMatchObject([{ item: work.id, project: "shop" }]);
  expect(typeof confirmed.confirmedBy[0]?.at).toBe("string");
  expect(entries(env).find((e) => e.id === listedOnly.id)?.confirmedBy).toEqual([]);
  // A visible entry cited but never listed for the item is not confirmed: the lookup's list is the ticket.
  expect(entries(env).find((e) => e.id === citedOnly.id)?.confirmedBy).toEqual([]);
  // The root cause: written once.
  const cause = (title: string, text: string, paths: string[]) => {
    const w = item(p, title);
    w.kind = "issue";
    saveWork(p.paths, w);
    const d = workDir(p.paths, w.id);
    writeFileSync(
      join(d, "analysis.md"),
      `# Analysis\n\n## Origin\n\nnone\n\n## Cause\n\n${text}\n\n## Blast radius\n\nnone\n`,
    );
    writeOrigin(p.paths, w.id, {
      at: "t",
      paths: paths.map((path) => ({ path, commits: [] })),
      items: [],
    });
    return loadWork(p.paths, w.id).work as WorkItem;
  };
  const firstIssue = cause(
    "Listing shows deactivated accounts",
    "The listing query forgets the active filter after the status column moved.",
    ["src/accounts.mjs"],
  );
  const first = learn(p, firstIssue);
  if ("refused" in first) throw new Error(first.refused);
  const root = first.entries.find((e) => e.kind === "root-cause") as KnowledgeEntry;
  expect(root).toMatchObject({
    title: "Root cause: Listing shows deactivated accounts",
    text: "The listing query forgets the active filter after the status column moved.",
    paths: ["src/accounts.mjs"],
    confidential: true,
  });
  // Three shared words and a shared path: the same cause.
  const again = cause(
    "Deactivated accounts listed again",
    "The listing query forgets the active filter on the status column.",
    ["src/accounts.mjs"],
  );
  expect(learn(p, again)).toEqual({
    refused: `${root.id} already records this root cause (item ${firstIssue.id}, commit ${root.commit}): crew learn ${again.id} --confirm ${root.id} confirms it, crew knowledge contradict ${root.id} --reason "<why>" --item ${again.id} disputes it`,
  });
  expect(loadWork(p.paths, again.id).work?.learned).toBeUndefined();
  expect(learn(p, again, { confirm: "K-77" })).toEqual({
    refused: "no entry K-77 visible to this project",
  });
  expect(learn(p, again, { confirm: cited.id })).toEqual({
    refused: `--confirm names ${cited.id}, which is not a root cause this project reads`,
  });
  const confirmedOut = learn(p, again, { confirm: root.id });
  if ("refused" in confirmedOut) throw new Error(confirmedOut.refused);
  expect(confirmedOut.entries.map((e) => e.kind)).toEqual([
    "validated-solution",
    "stack-preference",
  ]);
  expect(confirmedOut.confirmed).toEqual([root.id]);
  expect(entries(env).find((e) => e.id === root.id)?.confirmedBy).toMatchObject([
    { item: again.id },
  ]);
  expect(loadWork(p.paths, again.id).work?.learned?.confirmed).toEqual([root.id]);
  // Two shared words, or a shared path alone: another cause.
  const two = cause("Totals off", "The listing query rounds the grand total.", [
    "src/accounts.mjs",
  ]);
  const twoOut = learn(p, two);
  if ("refused" in twoOut) throw new Error(twoOut.refused);
  expect(twoOut.entries.some((e) => e.kind === "root-cause")).toBe(true);
  const pathOnly = cause("Another file", "Nothing in common here at all.", ["src/accounts.mjs"]);
  const pathOut = learn(p, pathOnly);
  if ("refused" in pathOut) throw new Error(pathOut.refused);
  expect(pathOut.entries.some((e) => e.kind === "root-cause")).toBe(true);
  expect(
    sameRootCause(root, {
      ...root,
      words: ["listing", "query", "forgets"],
      paths: ["src/other.ts"],
    }),
  ).toBe(false);
});

test("SP4-T4 AC-4: crew learn tells each other registered project of the workspace, none of another workspace and none without one", () => {
  const env = testEnv();
  const shop = project(env, "acme", "shop");
  project(env, "acme", "crm");
  // A sibling whose policy accepts no notice refuses it: noted, never a failure of the learn.
  project(env, "acme", "warehouse", ["question"]);
  project(env, "globex", "other");
  const out = learn(shop, item(shop));
  if ("refused" in out) throw new Error(out.refused);
  expect(out.entries.map((e) => e.id)).toEqual(["K-1", "K-2"]);
  expect(out.notices).toEqual([
    { to: "crm", id: expect.stringMatching(/^M-/) },
    {
      to: "warehouse",
      id: null,
      refused: "warehouse does not accept notice (its policy accepts question)",
    },
    { to: "crm", id: expect.stringMatching(/^M-/) },
    {
      to: "warehouse",
      id: null,
      refused: "warehouse does not accept notice (its policy accepts question)",
    },
  ]);
  const inbox = readBox(
    mailbox(join(env.WIZARDINGCODE_HOME ?? "", "crew"), "acme", "crm").dir,
    "inbox",
  ).box;
  const notices = inbox.messages.filter((m) => m.type === "notice");
  expect(notices.map((m) => m.subject)).toEqual(["K-1 entered the base", "K-2 entered the base"]);
  expect(notices[0]?.body).toBe(
    "K-1 entered the base: Login sessions expire too early (validated-solution, from shop)",
  );
  const otherBox = readBox(
    mailbox(join(env.WIZARDINGCODE_HOME ?? "", "crew"), "globex", "other").dir,
    "inbox",
  ).box;
  expect(otherBox.messages.length).toBe(0);
  const alone = project(env, null, "alone");
  const aloneOut = learn(alone, item(alone));
  if ("refused" in aloneOut) throw new Error(aloneOut.refused);
  expect(aloneOut.notices).toEqual([]);
});

test("SP4-T4 AC-2: draftsOf is pure over the records and cuts the solution's text at the limit", () => {
  const env = testEnv();
  const p = project(env, "acme", "shop");
  const work = item(p);
  const dir = workDir(p.paths, work.id);
  writeFileSync(
    join(dir, "spec.md"),
    `# S\n\n## Problem\n\n${"x".repeat(5000)}\n\n## Acceptance criteria\n\n- AC-1: y\n`,
  );
  const { drafts } = draftsOf(p.paths, work, p.profile, p.policy, scopeOf(p.paths, p.mail.self));
  expect(drafts[0]?.text.length).toBe(4000);
  expect(drafts[0]?.kind).toBe("validated-solution");
  // The targets' stacks are the ones whose path holds a changed file: a second target with none is left out.
  const php = { ...(p.profile.targets[0] as Target), path: "api", stack: "php" as const };
  const two = { ...p.profile, targets: [...p.profile.targets, php] };
  expect(
    draftsOf(p.paths, work, two, p.policy, scopeOf(p.paths, p.mail.self)).drafts[0]?.stacks,
  ).toEqual(["node"]);
  write(p.root, "api/index.php", "<?php\n");
  expect(
    draftsOf(p.paths, work, two, p.policy, scopeOf(p.paths, p.mail.self)).drafts[0]?.stacks,
  ).toEqual(["node", "php"]);
});

test("SP4-T4 AC-2: with no verification file every fact with a URL source is written, the engine having asked nothing", () => {
  const env = testEnv();
  const p = project(env, "acme", "shop");
  const work = item(p);
  const dir = workDir(p.paths, work.id);
  mkdirSync(join(dir, "conclave"), { recursive: true });
  writeFileSync(
    join(dir, "conclave", "researcher.md"),
    '## What the documentation says\n- https://docs.example/a · "Quote a" · claim a\n- https://docs.example/b · "Quote b" · claim b\n- A wiki page · "Not a URL" · a document\n',
  );
  const out = learn(p, work);
  if ("refused" in out) throw new Error(out.refused);
  expect(out.entries.filter((e) => e.kind === "documentation").map((e) => e.source)).toEqual([
    "https://docs.example/a",
    "https://docs.example/b",
  ]);
});
