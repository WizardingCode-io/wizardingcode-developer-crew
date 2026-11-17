import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { recordSurface } from "../src/design.ts";
import { runDesignLint } from "../src/design-lint.ts";
import {
  addChoice,
  CAPS,
  declareKind,
  KIND_METRICS,
  KIND_OTHER,
  KINDS,
  LABELS,
  readChoices,
  readKind,
} from "../src/design-proof.ts";
import { detectProfile } from "../src/detect/index.ts";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import { DEFAULT_POLICY } from "../src/policy.ts";
import { adoptMainFiles } from "../src/state.ts";
import { adoptFirstUse, writeProtectedJson } from "../src/store.ts";
import { createWork } from "../src/work.ts";
import { git, hookContext, makeRepo, repoPaths, tempDir, testEnv, write } from "./helpers.ts";

const AT = "2026-11-16T10:00:00.000Z";
const projectFile = (root: string) => join(root, ".crew", "design-project.json");
const choicesFile = (root: string, id: string) =>
  join(root, ".crew", "work", id, "design", "choices.json");
const json = (path: string) => JSON.parse(readFileSync(path, "utf8"));

/** One started item in a fresh repository, driven through the CLI in process. */
async function item(files: Record<string, string> = {}) {
  const root = makeRepo({ "README.md": "# t\n", "package.json": '{"name":"t"}\n', ...files });
  const env = testEnv();
  const run = async (...args: string[]) => {
    const lines: string[] = [];
    const io: CliIo = {
      cwd: root,
      env,
      stdout: (t: string) => void lines.push(t),
      stderr: (t: string) => void lines.push(t),
      stdin: async () => "",
    };
    const code = await main(args, io);
    return { code, text: lines.join("\n") };
  };
  await run("detect");
  const answers = JSON.stringify({
    work_type: "feature",
    is_vague: 0,
    scope: 1,
    touches_auth: 0,
    touches_payments: 0,
    touches_personal_data: 0,
    touches_data_migration: 0,
    touches_infra: 0,
    touches_public_api: 0,
  });
  const started = await run("start", "a shop", "--answers", answers, "--json");
  const id = /(\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+)/.exec(started.text)?.[1] ?? "";
  const design = (...args: string[]) => run("design", id, ...args);
  return { run, design, id, root, env, paths: repoPaths(root, env) };
}

/** A work item on a route, with the lint run over its files, with no CLI between. */
function started(route: "standard" | "full" | "fast", files: Record<string, string>) {
  const root = makeRepo({ "package.json": '{"name":"t"}\n', ...files });
  const paths = repoPaths(root, testEnv());
  const work = createWork(paths, "a shop");
  work.route = route;
  const lint = (names: string[] = Object.keys(files)) =>
    runDesignLint({
      paths,
      work,
      profile: detectProfile(root),
      files: names,
      policy: DEFAULT_POLICY,
      writes: false,
    });
  return { root, paths, work, lint };
}
const CSS = { "a.css": "a { color: red; }\n" };

test("AC-13: kind records the kind, the metric, the date and an empty earlier, and prints them", async () => {
  const a = await item();
  const ok = await a.design("kind", "e-commerce", "--metric", "conversion rate per session");
  expect(ok.code).toBe(0);
  expect(ok.text).toContain("e-commerce");
  expect(ok.text).toContain("conversion rate per session");
  const saved = json(projectFile(a.root));
  expect(saved.kind).toBe("e-commerce");
  expect(saved.metric).toBe("conversion rate per session");
  expect(typeof saved.at).toBe("string");
  expect(saved.earlier).toEqual([]);
  expect(KINDS).toHaveLength(10);
  expect(Object.keys(KIND_METRICS).sort()).toEqual([...KINDS].sort());
});

test("AC-13: kind refuses a word outside the eleven with the list, other without a name, a name beside one of the ten, and a metric that is empty, too long or not one line", async () => {
  const a = await item();
  const bad = await a.design("kind", "shop", "--metric", "orders");
  expect(bad.code).not.toBe(0);
  for (const kind of [...KINDS, KIND_OTHER]) expect(bad.text).toContain(kind);
  const refused = async (...args: string[]) => {
    const out = await a.design("kind", ...args);
    expect(out.code).not.toBe(0);
    return out.text;
  };
  expect(await refused("other", "--metric", "bookings")).toContain("--name");
  expect(await refused("e-commerce", "--name", "a shop", "--metric", "orders")).toContain("--name");
  expect(await refused("e-commerce", "--metric", "")).toContain("--metric");
  expect(await refused("e-commerce", "--metric", "m".repeat(CAPS.metric + 1))).toContain(
    String(CAPS.metric),
  );
  expect(
    await refused("other", "--name", "n".repeat(CAPS.name + 1), "--metric", "bookings"),
  ).toContain(String(CAPS.name));
  for (const text of ["orders\nper day", "orders\u0007", "orders\u202e"])
    expect(await refused("e-commerce", "--metric", text)).toContain(
      "one line, no control characters",
    );
  expect(readKind(a.paths).record).toBeNull();
  const other = await a.design("kind", "other", "--name", "marketplace", "--metric", "bookings");
  expect(other.code).toBe(0);
  expect(json(projectFile(a.root)).name).toBe("marketplace");
});

test("AC-14: over a trusted record a declaration needs --reason, the same one included, and earlier keeps every replaced declaration, newest last, at most 20", async () => {
  const a = await item();
  await a.design("kind", "e-commerce", "--metric", "conversion rate per session");
  const same = await a.design("kind", "e-commerce", "--metric", "conversion rate per session");
  expect(same.code).not.toBe(0);
  expect(same.text).toContain(
    "a kind is already recorded (e-commerce): give --reason to change it",
  );
  const long = await a.design(
    "kind",
    "brand",
    "--metric",
    "enquiries",
    "--reason",
    "r".repeat(CAPS.reason + 1),
  );
  expect(long.code).not.toBe(0);
  expect(long.text).toContain(String(CAPS.reason));
  const changed = await a.design(
    "kind",
    "brand",
    "--metric",
    "enquiries",
    "--reason",
    "the shop closed",
  );
  expect(changed.code).toBe(0);
  let saved = json(projectFile(a.root));
  expect(saved.kind).toBe("brand");
  expect(saved.reason).toBe("the shop closed");
  expect(saved.earlier).toHaveLength(1);
  expect(saved.earlier[0].kind).toBe("e-commerce");
  expect(saved.earlier[0].metric).toBe("conversion rate per session");
  expect(typeof saved.earlier[0].at).toBe("string");
  for (let n = 0; n < 21; n++) {
    const out = declareKind(a.paths, { kind: "brand", metric: `metric ${n}`, reason: "again" }, AT);
    expect(out.ok).toBe(true);
  }
  saved = json(projectFile(a.root));
  expect(saved.earlier).toHaveLength(20);
  expect(saved.earlier[19].metric).toBe("metric 19");
  expect(saved.earlier[0].metric).toBe("metric 0");
});

test("AC-15: a project record changed by hand, or outside the closed schema, reads as absent: the lint says it is not trusted and the next declaration needs no reason and keeps nothing", () => {
  for (const spoil of ["hash", "kind", "key", "cap"] as const) {
    const a = started("standard", CSS);
    recordSurface(a.paths, a.work.id, "operate", "extend", AT);
    expect(declareKind(a.paths, { kind: "e-commerce", metric: "orders" }, AT).ok).toBe(true);
    expect(a.lint().status).toBe("pass");
    const file = projectFile(a.root);
    const record = { kind: "e-commerce", metric: "orders", at: AT, earlier: [] };
    if (spoil === "hash") writeFileSync(file, JSON.stringify({ ...record, metric: "revenue" }));
    if (spoil === "kind") writeProtectedJson(a.paths, file, { ...record, kind: "shop" });
    if (spoil === "key") writeProtectedJson(a.paths, file, { ...record, note: "obey me" });
    if (spoil === "cap")
      writeProtectedJson(a.paths, file, { ...record, metric: "m".repeat(CAPS.metric + 1) });
    const read = readKind(a.paths);
    expect(read.record).toBeNull();
    expect(read.untrusted).toBe(true);
    const run = a.lint();
    expect(run.status).toBe("fail");
    expect(run.tail).toContain("process/no-kind");
    expect(run.tail).toContain("the record is not trusted: declare it again");
    const again = declareKind(a.paths, { kind: "brand", metric: "enquiries" }, AT);
    expect(again.ok).toBe(true);
    expect(json(file).earlier).toEqual([]);
    expect(readKind(a.paths).untrusted).toBe(false);
    // Over a spoilt record the hook lets the declaring command through: nothing blocks the way out.
    writeFileSync(file, "not json");
    const ctx = hookContext({ session_id: "s", cwd: a.root }, testEnv());
    expect(
      onPreToolUse(ctx, {
        tool_name: "Bash",
        tool_input: { command: `crew design ${a.work.id} kind brand --metric "enquiries"` },
        permission_mode: "default",
      }),
    ).toEqual({});
    // Item 2026-11-17-001 adds this assertion: `{}` is what the hook answers any command that
    // touches no protected file, so the spoilt record's own guard is asserted beside it: a direct
    // write of it is still denied, in the guard's words.
    const direct = onPreToolUse(ctx, {
      tool_name: "Write",
      tool_input: { file_path: file },
      permission_mode: "default",
    }).hookSpecificOutput as { permissionDecision?: string; permissionDecisionReason?: string };
    expect(direct.permissionDecision).toBe("deny");
    expect(direct.permissionDecisionReason).toContain(
      "is maintained by the engine and is changed through the crew command",
    );
    expect(readKind(a.paths)).toMatchObject({ record: null, untrusted: true });
  }
});

test("AC-16: the lint holds process/no-kind on the standard and full routes until a kind is recorded, after process/no-surface when both are missing, and never on the fast route", () => {
  for (const route of ["standard", "full"] as const) {
    const a = started(route, CSS);
    const both = a.lint();
    expect(both.status).toBe("fail");
    const surfaceAt = both.tail.indexOf("process/no-surface");
    const kindAt = both.tail.indexOf("process/no-kind");
    expect(surfaceAt).toBeGreaterThanOrEqual(0);
    expect(kindAt).toBeGreaterThan(surfaceAt);
    recordSurface(a.paths, a.work.id, "operate", "extend", AT);
    const noKind = a.lint();
    expect(noKind.status).toBe("fail");
    expect(noKind.tail).not.toContain("process/no-surface");
    expect(noKind.tail).toContain("process/no-kind");
    expect(noKind.tail).toContain(`crew design ${a.work.id} kind`);
    declareKind(a.paths, { kind: "e-commerce", metric: "orders" }, AT);
    const done = a.lint();
    expect(done.status).toBe("pass");
    expect(done.tail).not.toContain("process/no-kind");
  }
  const fast = started("fast", CSS);
  expect(fast.lint().status).toBe("pass");
  // A change with no frontend path holds none either.
  const plain = started("standard", { "src/a.ts": "export const a = 1;\n" });
  expect(plain.lint().tail).not.toContain("process/no-kind");
});

test("AC-17: choice add records DC-n with its label and what the label asks", async () => {
  const a = await item();
  const norm = await a.design(
    "choice",
    "add",
    "Body text holds 4.5:1 against its ground",
    "--label",
    "norm",
    "--source",
    "WCAG 2.2, 1.4.3",
  );
  expect(norm.code).toBe(0);
  expect(norm.text).toContain("DC-1");
  const study = await a.design(
    "choice",
    "add",
    "Guest checkout is the most prominent option",
    "--label",
    "published-study",
    "--source",
    "https://baymard.com/blog/current-state-of-checkout-ux",
    "--replication",
    "usability findings, not repeated by another group",
  );
  expect(study.text).toContain("DC-2");
  expect((await a.design("choice", "add", "A warm ground", "--label", "hypothesis")).code).toBe(0);
  const sourced = await a.design(
    "choice",
    "add",
    "Reviews above the fold",
    "--label",
    "hypothesis",
    "--source",
    "a vendor's case study",
  );
  expect(sourced.code).toBe(0);
  const saved = json(choicesFile(a.root, a.id));
  expect(saved.choices.map((c: { id: string }) => c.id)).toEqual(["DC-1", "DC-2", "DC-3", "DC-4"]);
  expect(saved.choices[3]).toMatchObject({ label: "hypothesis", source: "a vendor's case study" });
  expect(saved.choices[0]).toMatchObject({ label: "norm", source: "WCAG 2.2, 1.4.3", history: [] });
  expect(saved.choices[1].replication).toBe("usability findings, not repeated by another group");
  expect(saved.choices[2].label).toBe("hypothesis");
  expect(LABELS).toEqual([
    "norm",
    "platform-guidance",
    "published-study",
    "measured-here",
    "hypothesis",
  ]);
});

test("AC-17: choice add refuses a label outside the five, a missing source or replication note, a flag the label does not ask for, a text over its cap or not one line, and a 101st choice", async () => {
  const a = await item({ "docs/test.md": "# a measurement\n" });
  const refused = async (...args: string[]) => {
    const out = await a.design("choice", "add", ...args);
    expect(out.code).not.toBe(0);
    return out.text;
  };
  const five = await refused("A choice", "--label", "proven");
  for (const label of LABELS) expect(five).toContain(label);
  for (const label of ["norm", "platform-guidance", "published-study"])
    expect(await refused("A choice", "--label", label)).toContain("--source");
  expect(
    await refused("A choice", "--label", "published-study", "--source", "https://example.org/s"),
  ).toContain("--replication");
  expect(
    await refused("A choice", "--label", "norm", "--source", "WCAG", "--replication", "none"),
  ).toContain("--replication");
  expect(
    await refused("A choice", "--label", "hypothesis", "--evidence", "docs/test.md"),
  ).toContain("--evidence");
  expect(await refused("c".repeat(CAPS.choice + 1), "--label", "hypothesis")).toContain(
    String(CAPS.choice),
  );
  expect(
    await refused("A choice", "--label", "norm", "--source", "s".repeat(CAPS.source + 1)),
  ).toContain(String(CAPS.source));
  expect(
    await refused(
      "A choice",
      "--label",
      "published-study",
      "--source",
      "https://example.org/s",
      "--replication",
      "r".repeat(CAPS.replication + 1),
    ),
  ).toContain(String(CAPS.replication));
  expect(await refused("A choice\nin two lines", "--label", "hypothesis")).toContain(
    "one line, no control characters",
  );
  expect(await refused("A choice", "--label", "norm", "--source", "WCAG\u202e")).toContain(
    "one line, no control characters",
  );
  expect(readChoices(a.paths, a.id).choices).toEqual([]);
  for (let n = 0; n < 100; n++)
    expect(addChoice(a.paths, a.id, { text: `choice ${n}`, label: "hypothesis" }, AT).ok).toBe(
      true,
    );
  const over = addChoice(a.paths, a.id, { text: "one more", label: "hypothesis" }, AT);
  expect(over.ok).toBe(false);
  expect(readChoices(a.paths, a.id).choices).toHaveLength(100);
});

test("AC-18: measured-here needs --evidence naming a regular file inside the project, by real path, and the path is stored from the root with forward slashes", async () => {
  const a = await item({ "docs/measures/checkout.md": "# measured\n", "docs/a.md": "a\n" });
  const outside = tempDir();
  write(outside, "m.md", "# elsewhere\n");
  symlinkSync(join(a.root, "docs/a.md"), join(a.root, "docs/link.md"));
  symlinkSync(outside, join(a.root, "docs/linked"));
  write(a.root, ".crew/note.md", "x\n");
  const add = (evidence?: string) =>
    a.design(
      "choice",
      "add",
      "The delivery date above the fold",
      "--label",
      "measured-here",
      ...(evidence === undefined ? [] : ["--evidence", evidence]),
    );
  expect((await add()).text).toContain("--evidence");
  for (const path of [
    join(outside, "m.md"),
    "../m.md",
    "docs/../../m.md",
    "docs/missing.md",
    "docs",
    "docs/link.md",
    "docs/linked/m.md",
    ".crew/note.md",
    ".git/HEAD",
  ]) {
    const out = await add(path);
    expect(out.code).not.toBe(0);
    expect(out.text).toContain("--evidence");
  }
  const over = await add(`docs/${"p".repeat(CAPS.evidence)}.md`);
  expect(over.code).not.toBe(0);
  expect(over.text).toContain(`--evidence is over ${CAPS.evidence} characters`);
  expect(readChoices(a.paths, a.id).choices).toEqual([]);
  const ok = await add("./docs/measures/../measures/checkout.md");
  expect(ok.code).toBe(0);
  expect(json(choicesFile(a.root, a.id)).choices[0].evidence).toBe("docs/measures/checkout.md");
  const abs = await add(join(a.root, "docs", "measures", "checkout.md"));
  expect(abs.code).toBe(0);
  expect(json(choicesFile(a.root, a.id)).choices[1].evidence).toBe("docs/measures/checkout.md");
});

test("AC-19: relabel goes down to hypothesis with a reason and to measured-here with evidence, keeps the earlier label in the history, and refuses every other move", async () => {
  const a = await item({ "docs/m1.md": "one\n", "docs/m2.md": "two\n" });
  await a.design("choice", "add", "Guest checkout first", "--label", "norm", "--source", "WCAG");
  await a.design("choice", "add", "A warm ground", "--label", "hypothesis");
  const relabel = (id: string, ...args: string[]) => a.design("choice", "relabel", id, ...args);
  const refused = async (id: string, ...args: string[]) => {
    const out = await relabel(id, ...args);
    expect(out.code).not.toBe(0);
    return out.text;
  };
  for (const label of ["norm", "platform-guidance", "published-study"])
    expect(await refused("DC-2", "--label", label, "--source", "a page")).toContain(
      "a label never upgrades without a measurement",
    );
  expect(await refused("DC-1", "--label", "platform-guidance", "--source", "a page")).toContain(
    "a label never upgrades without a measurement",
  );
  expect(await refused("DC-1", "--label", "hypothesis")).toContain("give --reason");
  expect(
    await refused("DC-1", "--label", "hypothesis", "--reason", "r".repeat(CAPS.reason + 1)),
  ).toContain(String(CAPS.reason));
  expect(await refused("DC-1", "--label", "hypothesis", "--reason", "two\nlines")).toContain(
    "one line, no control characters",
  );
  expect(await refused("DC-2", "--label", "hypothesis", "--reason", "again")).toContain(
    "DC-2 is already a hypothesis",
  );
  expect(await refused("DC-9", "--label", "hypothesis", "--reason", "x")).toContain(
    "no choice DC-9",
  );
  expect(await refused("DC-2", "--label", "measured-here")).toContain("--evidence");
  expect(await refused("DC-2", "--label", "measured-here", "--evidence", "docs")).toContain(
    "--evidence",
  );
  expect(await refused("DC-2", "--label", "proven")).toContain("hypothesis");

  const down = await relabel("DC-1", "--label", "hypothesis", "--reason", "the clause is not this");
  expect(down.code).toBe(0);
  const up = await relabel("DC-2", "--label", "measured-here", "--evidence", "docs/m1.md");
  expect(up.code).toBe(0);
  const again = await relabel("DC-2", "--label", "measured-here", "--evidence", "docs/m2.md");
  expect(again.code).toBe(0);
  const saved = json(choicesFile(a.root, a.id)).choices;
  expect(saved[0].label).toBe("hypothesis");
  expect(saved[0].reason).toBe("the clause is not this");
  expect(saved[0].history).toHaveLength(1);
  expect(saved[0].history[0]).toMatchObject({ label: "norm", source: "WCAG" });
  expect(saved[1]).toMatchObject({ label: "measured-here", evidence: "docs/m2.md" });
  expect(saved[1].history.map((h: { label: string }) => h.label)).toEqual([
    "hypothesis",
    "measured-here",
  ]);
  expect(saved[1].history[1].evidence).toBe("docs/m1.md");
  // Ten history rows at most: the eleventh relabel of one choice is refused.
  for (let n = 0; n < 8; n++)
    expect(
      (await relabel("DC-2", "--label", "measured-here", "--evidence", "docs/m1.md")).code,
    ).toBe(0);
  const eleventh = await refused("DC-2", "--label", "measured-here", "--evidence", "docs/m2.md");
  expect(eleventh).toContain("10");
  expect(json(choicesFile(a.root, a.id)).choices[1].history).toHaveLength(10);
});

test("AC-20: choice list prints each choice with its id, label, source and note or evidence as quoted text, and says when there is none", async () => {
  const deep = `docs/${"d".repeat(150)}/m.md`;
  const a = await item({ "docs/m.md": "m\n", [deep]: "m\n" });
  const none = await a.design("choice", "list");
  expect(none.code).toBe(0);
  expect(none.text).toContain("no choice recorded");
  await a.design(
    "choice",
    "add",
    "Guest checkout first",
    "--label",
    "published-study",
    "--source",
    "https://baymard.com/blog/current-state-of-checkout-ux",
    "--replication",
    "not repeated",
  );
  await a.design(
    "choice",
    "add",
    "x".repeat(300),
    "--label",
    "measured-here",
    "--evidence",
    "docs/m.md",
  );
  const list = await a.design("choice", "list");
  for (const part of [
    "DC-1",
    "published-study",
    "Guest checkout first",
    "https://baymard.com/blog/current-state-of-checkout-ux",
    "not repeated",
    "DC-2",
    "measured-here",
    "docs/m.md",
  ])
    expect(list.text).toContain(part);
  // quotedText cuts a long text with an ellipsis: the 300 characters are never printed whole.
  expect(list.text).not.toContain("x".repeat(300));
  expect(list.text).toContain("…");
  // The source, the replication note and the evidence path are quoted by the same rule.
  const source = `https://example.org/${"s".repeat(200)}`;
  const note = `not repeated ${"n".repeat(200)}`;
  await a.design(
    "choice",
    "add",
    "Size as buttons",
    "--label",
    "published-study",
    "--source",
    source,
    "--replication",
    note,
  );
  await a.design("choice", "add", "A date", "--label", "measured-here", "--evidence", deep);
  const long = await a.design("choice", "list");
  expect(long.text).toContain("DC-3");
  expect(long.text).toContain("DC-4");
  for (const whole of [source, note, deep]) expect(long.text).not.toContain(whole);
  for (const cut of [source, note, deep]) expect(long.text).toContain(cut.slice(0, 100));
});

test("AC-21: the lint holds process/no-choice on a surface or world change with no choice, and on any change whose choices file is not trusted", () => {
  const world = started("standard", CSS);
  declareKind(world.paths, { kind: "e-commerce", metric: "orders" }, AT);
  recordSurface(world.paths, world.work.id, "persuade", "world", AT);
  expect(world.lint().tail).toContain("process/no-choice");
  addChoice(world.paths, world.work.id, { text: "A warm ground", label: "hypothesis" }, AT);
  expect(world.lint().tail).not.toContain("process/no-choice");

  const surface = started("full", CSS);
  declareKind(surface.paths, { kind: "e-commerce", metric: "orders" }, AT);
  recordSurface(surface.paths, surface.work.id, "persuade", "surface", AT);
  expect(surface.lint().tail).toContain("process/no-choice");

  const extend = started("standard", CSS);
  declareKind(extend.paths, { kind: "e-commerce", metric: "orders" }, AT);
  recordSurface(extend.paths, extend.work.id, "operate", "extend", AT);
  const clean = extend.lint();
  expect(clean.status).toBe("pass");
  expect(clean.tail).not.toContain("process/no-choice");
  expect(clean.tail).not.toContain("process/choice-evidence");
  // With no surface and no choices file, the rule is not held.
  const bare = started("standard", CSS);
  expect(bare.lint().tail).not.toContain("process/no-choice");

  for (const spoil of ["hash", "label"] as const) {
    const a = started("standard", CSS);
    declareKind(a.paths, { kind: "e-commerce", metric: "orders" }, AT);
    recordSurface(a.paths, a.work.id, "operate", "extend", AT);
    addChoice(a.paths, a.work.id, { text: "A warm ground", label: "hypothesis" }, AT);
    const file = choicesFile(a.root, a.work.id);
    const forged = { choices: [{ ...json(file).choices[0], label: "proven" }] };
    if (spoil === "hash") writeFileSync(file, JSON.stringify(json(file)).replace("warm", "cold"));
    else writeProtectedJson(a.paths, file, forged);
    expect(readChoices(a.paths, a.work.id)).toMatchObject({ choices: [], untrusted: true });
    const run = a.lint();
    expect(run.status).toBe("fail");
    expect(run.tail).toContain("process/no-choice");
    expect(run.tail).toContain("choices.json is not trusted");
  }
});

test("AC-21: the lint holds process/choice-evidence for a measured-here choice whose file is gone or replaced by a link or a folder, on extend and with no surface too, naming the choice and the stored path alone", () => {
  for (const state of ["gone", "link", "folder", "linked-folder"] as const) {
    for (const surface of [true, false]) {
      const a = started("standard", {
        ...CSS,
        "docs/m.md": "secret figure 42\n",
        "docs/b.md": "b\n",
      });
      declareKind(a.paths, { kind: "e-commerce", metric: "orders" }, AT);
      if (surface) recordSurface(a.paths, a.work.id, "operate", "extend", AT);
      const added = addChoice(
        a.paths,
        a.work.id,
        { text: "The delivery date above the fold", label: "measured-here", evidence: "docs/m.md" },
        AT,
      );
      expect(added.ok).toBe(true);
      if (surface) expect(a.lint().status).toBe("pass");
      const file = join(a.root, "docs/m.md");
      if (state === "linked-folder") {
        // The file is still read through the path, but its folder is now a link out of the project.
        const outside = tempDir();
        write(outside, "m.md", "secret figure 42\n");
        rmSync(join(a.root, "docs"), { recursive: true });
        symlinkSync(outside, join(a.root, "docs"));
      } else rmSync(file);
      if (state === "link") symlinkSync(join(a.root, "docs/b.md"), file);
      if (state === "folder") mkdirSync(file);
      const run = a.lint();
      expect(run.status).toBe("fail");
      expect(run.tail).toContain("process/choice-evidence");
      expect(run.tail).toContain("DC-1");
      expect(run.tail).toContain("docs/m.md");
      expect(run.tail).not.toContain("The delivery date above the fold");
      expect(run.tail).not.toContain("secret figure");
    }
  }
});

test("AC-22: the hook denies a Write, an Edit, a Bash redirect and a planted link at the two records", () => {
  const root = makeRepo({ "package.json": '{"name":"t"}\n', "src/a.ts": "x" });
  const ctx = hookContext({ session_id: "s", cwd: root }, testEnv());
  const work = createWork(ctx.paths, "a shop");
  const decision = (response: Record<string, unknown>) =>
    (response.hookSpecificOutput as { permissionDecision?: string } | undefined)
      ?.permissionDecision;
  const bash = (command: string) =>
    onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode: "default" });
  const project = ".crew/design-project.json";
  const choices = `.crew/work/${work.id}/design/choices.json`;
  for (const rel of [project, choices]) {
    for (const tool_name of ["Write", "Edit"])
      expect(
        decision(onPreToolUse(ctx, { tool_name, tool_input: { file_path: join(root, rel) } })),
      ).toBe("deny");
    expect(decision(bash(`echo '{}' > ${rel}`))).toBe("deny");
    expect(decision(bash(`ln -s /tmp/forged.json ${rel}`))).toBe("deny");
  }
  expect(bash(`crew design ${work.id} kind e-commerce --metric "orders"`)).toEqual({});
  expect(bash(`crew design ${work.id} choice list`)).toEqual({});
});

test("AC-22: a clone's first use adopts a committed project record, and a task's worktree takes it from the main checkout", () => {
  const record = { kind: "e-commerce", metric: "orders", at: AT, earlier: [] };
  const clone = makeRepo({
    "package.json": '{"name":"t"}\n',
    ".crew/design-project.json": `${JSON.stringify(record, null, 2)}\n`,
  });
  const clonePaths = repoPaths(clone, testEnv());
  expect(adoptFirstUse(clonePaths)).toContain(".crew/design-project.json");
  expect(readKind(clonePaths)).toMatchObject({ record: { kind: "e-commerce" }, untrusted: false });

  const main = makeRepo({ "package.json": '{"name":"t"}\n' });
  const env = testEnv();
  const mainPaths = repoPaths(main, env);
  expect(declareKind(mainPaths, { kind: "donations", metric: "donation conversion" }, AT).ok).toBe(
    true,
  );
  const lane = join(tempDir(), "lane");
  git(main, "worktree", "add", "-q", "-b", "lane", lane);
  const lanePaths = repoPaths(lane, env);
  expect(readKind(lanePaths).record).toBeNull();
  expect(adoptMainFiles(lanePaths)).toEqual([]);
  expect(readKind(lanePaths)).toMatchObject({ record: { kind: "donations" }, untrusted: false });
});
