// plugins/core/tests/crew-mod.test.ts
import { expect, test } from "claude-code/testing";

// What `crew status --json` prints for a proven fast-route item
const PROVEN = {
  ok: true,
  message: "ok",
  active: "2026-10-07-001-fix-total",
  title: "Fix total",
  type: "fix",
  phase: "deliver",
  route: "fast",
  awaiting: null,
  baseCommit: "abc1234",
  phases: ["receive", "recognize", "build", "gate", "deliver"],
  verdict: "proven",
  unproven: [],
  criteria: [{ id: "AC-1", kind: "behavior", text: "The total subtracts the discount.", tdd: "red then green" }],
  runs: [
    { gate: "secrets", target: ".", status: "pass", durationMs: 12 },
    { gate: "test", target: ".", status: "pass", durationMs: 812 },
  ],
  skips: [],
  expected: ["secrets", "test"],
};
// An item in build whose planned gates have not run, with no reason given yet
const PENDING = { ...PROVEN, phase: "build", verdict: "unproven", unproven: [], runs: [], expected: ["secrets", "test"] };
const NONE = { ok: true, message: "no active work item", active: null };

// The stubs every test needs: where the plugin lives, the session folder, and the CLI's answer
function stubs(on, answer: () => { exitCode: number; stdout: string; stderr: string }) {
  on("session.cwd", () => ({ value: "/work" }));
  on("process.run", () => ({ value: answer() }));
  on("command.register", () => ({ value: undefined }));
  on("session.start", () => ({ cwd: "/work" }));
}

test("/crew status prints the engine's view of the active item", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(PROVEN), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "crew", args: "status" });
  expect(answer.text).toContain("2026-10-07-001-fix-total");
  expect(answer.text).toContain("phase deliver, route fast");
  expect(answer.text).toContain("Proven: secrets, test");
});

test("/crew with no active item says so", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(NONE), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "crew", args: "" });
  expect(answer.text).toBe("Crew: no active work item. A change starts with the crew skill.");
});

test("a CLI that refuses or prints no JSON leaves the mod quiet and the session running", async ($, on) => {
  // session.start refreshes once (call 1), then each /crew status refreshes again (calls 2 and 3)
  let calls = 0;
  stubs(on, () => {
    calls += 1;
    return calls <= 2
      ? { exitCode: 1, stdout: JSON.stringify({ ok: false, message: "crew is inactive here: not a git repository and no .crew/ folder" }), stderr: "" }
      : { exitCode: 2, stdout: "", stderr: "boom" };
  });
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const first = await $.command.run({ command: "crew", args: "status" });
  expect(first.text).toBe("Crew: crew is inactive here: not a git repository and no .crew/ folder");
  const second = await $.command.run({ command: "crew", args: "status" });
  expect(second.text).toBe("Crew: boom");
});

test("a node that cannot start does not break session.start", async ($, on) => {
  on("session.cwd", () => ({ value: "/work" }));
  on("process.run", () => ({ deny: "spawn node ENOENT" }));
  on("command.register", () => ({ value: undefined }));
  on("session.start", () => ({ cwd: "/work" }));
  const started = await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  expect(started).toBeDefined();
  const answer = await $.command.run({ command: "crew", args: "status" });
  expect(answer.text).toContain("crew could not run");
});

test("a taken /crew name does not stop the rest of session.start", async ($, on) => {
  const logs: string[] = [];
  on("session.cwd", () => ({ value: "/work" }));
  on("process.run", () => ({ value: { exitCode: 0, stdout: JSON.stringify(NONE), stderr: "" } }));
  on("command.register", () => ({ deny: '"/crew" refused: it is taken' }));
  on("ui.log", ($, e) => {
    logs.push(e.text);
    return { value: undefined };
  });
  on("session.start", () => ({ cwd: "/work" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  expect(logs).toEqual(["could not register /crew: it is taken by another plugin"]);
});

test("/crew mode forwards to the engine", async ($, on) => {
  const argv: string[][] = [];
  on("session.cwd", () => ({ value: "/work" }));
  on("process.run", ($, e) => {
    argv.push(e.argv);
    return { value: { exitCode: 0, stdout: JSON.stringify({ ok: true, message: "mode: pilot", mode: "pilot" }), stderr: "" } };
  });
  on("command.register", () => ({ value: undefined }));
  on("session.start", () => ({ cwd: "/work" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "crew", args: "mode pilot" });
  expect(answer.text).toBe("Crew: mode: pilot");
  // session.start refreshed first, through the same bundled CLI
  const first = argv[0] ?? [];
  expect(first[0]).toBe("node");
  expect(first[1]).toMatch(/\/plugins\/core\/dist\/crew\.mjs$/);
  expect(first.slice(2)).toEqual(["status", "--json"]);
  const last = argv.at(-1) ?? [];
  expect(last[0]).toBe("node");
  // The test host loads the real plugin folder, so the root is the checkout's, not a stub
  expect(last[1]).toMatch(/\/plugins\/core\/dist\/crew\.mjs$/);
  expect(last.slice(2)).toEqual(["mode", "pilot", "--json"]);
});

test("/crew with an unknown verb says how to use it", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(PROVEN), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "crew", args: "frobnicate" });
  expect(answer.text).toBe("Crew: unknown verb; use /crew [status|panel|mail|todo|team|workspace|thread <id>|brief T-n|questions|mode <partner|guide|pilot>]");
});

// What Claude Code passes to a ui.render hook for the strip above the prompt
const STRIP = {
  plugin: "wizardingcode-developer-crew",
  component: "AbovePrompt",
  requestId: "above-prompt",
  viewport: { columns: 120, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const;

test("the strip shows the item, phase, route, verdict and gates, and keeps other mods' content", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(PROVEN), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: ["drawn by Claude Code"] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "crew 2026-10-07-001-fix-total · deliver · fast · proven · secrets ✓ test ✓" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "drawn by Claude Code" })).toBeDefined();
  await ui.unmount();
});

test("the strip stays out of the way without an active item", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(NONE), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: ["drawn by Claude Code"] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: /^crew / })).toBeUndefined();
  expect(await ui.find({ type: "Text", text: "drawn by Claude Code" })).toBeDefined();
  await ui.unmount();
});

test("an item whose gates have not run reads as not proven, not as success", async ($, on) => {
  const fresh = { ...PROVEN, phase: "build", verdict: "unproven", unproven: ["gates have not run", "test-first record missing for AC-1"], runs: [], criteria: [{ ...PROVEN.criteria[0], tdd: "missing" }] };
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(fresh), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: [] }));
  on("turn.complete", () => ({ text: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "crew 2026-10-07-001-fix-total · build · fast · not proven (gates have not run) · secrets … test …" })).toBeDefined();
  await ui.unmount();
  const line = await $.turn.complete({ turnId: "t1", answer: "done", durationMs: 10, isAborted: false, usage: null });
  expect(line.text).toBe("Not proven: gates have not run");
});

test("the strip draws planned gates that have not run and the first unproven reason", async ($, on) => {
  let answer: Record<string, unknown> = PENDING;
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(answer), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: [] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const pending = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(await pending.find({ type: "Text", text: "crew 2026-10-07-001-fix-total · build · fast · not proven (gates have not run) · secrets … test …" })).toBeDefined();
  await pending.unmount();
  answer = { ...PENDING, phase: "gate", unproven: ["gate test failing"], runs: [{ gate: "secrets", target: ".", status: "pass", durationMs: 12 }, { gate: "test", target: ".", status: "fail", durationMs: 812 }], awaiting: "user" };
  await $.command.run({ command: "crew", args: "status" });
  const failing = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(await failing.find({ type: "Text", text: "crew 2026-10-07-001-fix-total · gate · fast · not proven (gate test failing) · secrets ✓ test ✗ · waiting for the user" })).toBeDefined();
  await failing.unmount();
});

test("the line under a proven answer names the gates, and no item means no line", async ($, on) => {
  let proven = true;
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(proven ? PROVEN : NONE), stderr: "" }));
  // A sentinel, so the test tells next(e) apart from an empty line of the mod's own
  on("turn.complete", () => ({ text: "theirs" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const line = await $.turn.complete({ turnId: "t1", answer: "done", durationMs: 10, isAborted: false, usage: null });
  expect(line.text).toBe("Proven: secrets, test");
  proven = false;
  const none = await $.turn.complete({ turnId: "t2", answer: "done", durationMs: 10, isAborted: false, usage: null });
  expect(none.text).toBe("theirs");
});

const PANE = {
  plugin: "wizardingcode-developer-crew",
  component: "Pane",
  requestId: "crew",
  viewport: { columns: 120, rows: 40 },
  props: { title: "Crew", isFocused: true, bodyColumns: 80, placement: "inline", scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const;

// A standard-route item in its gate phase: the deterministic gates passed, the judgement gates in every state
const JUDGED = {
  ...PROVEN,
  active: "2026-10-15-002-delete-accounts",
  title: "Delete accounts",
  phase: "gate",
  route: "standard",
  phases: ["receive", "recognize", "understand", "specify", "conclave", "plan", "build", "gate", "deliver"],
  verdict: "unproven",
  unproven: ["judgement gate test-quality not proven"],
  decisions: [
    { id: "D-1", question: "Erasure or deactivation?", answer: "deactivation", by: "user" },
    { id: "D-2", question: "Who holds the delete permission?" },
  ],
  objections: [{ id: "O-1", severity: "blocking", status: "open", text: "A support ticket's delete may be an erasure request" }],
  judgement: [
    { gate: "code-quality", status: "proven", planned: "standard route", findings: 1 },
    { gate: "test-quality", status: "not-proven", planned: "standard route", findings: 3 },
    { gate: "ui-ux", status: "not-run", planned: "interface files: resources/views/account.blade.php", findings: 0, reason: "no browser" },
    { gate: "security", status: "planned", planned: "risk area personal-data", findings: 0 },
    { gate: "risk", status: "skipped", planned: "policy", findings: 0, reason: "no production yet" },
  ],
  debate: "open",
};

test("the strip appends one mark per judgement gate after the gate marks", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(JUDGED), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: [] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(
    await ui.find({
      type: "Text",
      text: "crew 2026-10-15-002-delete-accounts · gate · standard · not proven (judgement gate test-quality not proven) · secrets ✓ test ✓ code-quality ✓ test-quality ✗ ui-ux ? security … risk –",
    }),
  ).toBeDefined();
  await ui.unmount();
});

test("the panel lists decisions with their answers, objections with their text, the debate and the judgement gates", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(JUDGED), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "receive › recognize › understand › specify › conclave › plan › build › [gate] › deliver" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "D-1 Erasure or deactivation? → deactivation (by user)" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "D-2 Who holds the delete permission? → unanswered" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "O-1 blocking open · A support ticket's delete may be an erasure request" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "debate open" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "code-quality: proven (1 finding)" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "test-quality: not proven (3 findings)" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "ui-ux: not run (no browser)" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "security: planned" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "risk: skipped (no production yet)" })).toBeDefined();
  await ui.unmount();
});

test("/crew status prints the conclave's counts and one row per judgement gate", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(JUDGED), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "crew", args: "status" });
  expect(answer.text).toContain("  decisions 2 (1 unanswered) · objections 1 (1 blocking open) · debate open");
  expect(answer.text).toContain("  code-quality: proven (1 finding)");
  expect(answer.text).toContain("  test-quality: not proven (3 findings)");
  expect(answer.text).toContain("  ui-ux: not run (no browser)");
  expect(answer.text).toContain("  security: planned");
  expect(answer.text).toContain("  risk: skipped (no production yet)");
  expect(answer.text).toContain("Not proven: judgement gate test-quality not proven");
});

test("the panel and /crew status print a stale ruling with its reason (AC-10 of the SP2b minors)", async ($, on) => {
  const stale = { ...JUDGED, judgement: [{ gate: "code-quality", status: "stale", planned: "standard route", findings: 0, reason: "ruling on earlier code" }] };
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(stale), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "code-quality: stale (ruling on earlier code)" })).toBeDefined();
  await ui.unmount();
  const answer = await $.command.run({ command: "crew", args: "status" });
  expect(answer.text).toContain("  code-quality: stale (ruling on earlier code)");
});

test("a proven item's verdict line names the judgement gates it proved", async ($, on) => {
  const judged = { ...PROVEN, judgement: [{ gate: "code-quality", status: "proven", planned: "policy", findings: 0 }], decisions: [], objections: [], debate: "none" };
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(judged), stderr: "" }));
  on("turn.complete", () => ({ text: "theirs" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const line = await $.turn.complete({ turnId: "t1", answer: "done", durationMs: 10, isAborted: false, usage: null });
  expect(line.text).toBe("Proven: secrets, test, code-quality");
});

test("the panel lists phases, criteria, gates and the verdict, and its buttons work", async ($, on) => {
  let runs = 0;
  const closed: string[] = [];
  stubs(on, () => {
    runs += 1;
    return { exitCode: 0, stdout: JSON.stringify(PROVEN), stderr: "" };
  });
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.close", ($, e) => {
    closed.push(e.id);
    return { value: undefined };
  });
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const opened = await $.command.run({ command: "crew", args: "panel" });
  expect(opened.text).toBeUndefined();
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: '2026-10-07-001-fix-total "Fix total"' })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "receive › recognize › build › gate › [deliver]" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "AC-1 behavior · red then green · The total subtracts the discount." })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "test (.): pass in 0.8s" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "Proven: secrets, test" })).toBeDefined();
  const before = runs;
  await ui.press({ key: "refresh" });
  // the status, then the workspace for the panel (SP7b Task 6; no inbox for an item without mail)
  expect(runs).toBe(before + 2);
  await ui.press({ key: "close" });
  expect(closed).toEqual(["crew"]);
  await ui.unmount();
});

test("a pane that cannot open is a toast, not a failure", async ($, on) => {
  const toasts: string[] = [];
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(PROVEN), stderr: "" }));
  on("ui.open", () => ({ deny: "no pane here" }));
  on("ui.toast", ($, e) => {
    toasts.push(e.text);
    return { value: undefined };
  });
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "crew", args: "panel" });
  expect(answer.text).toBeUndefined();
  // A denied call rejects with the host's message, which prefixes the plugin and the call
  expect(toasts).toEqual(["Crew: the panel could not open: wizardingcode-developer-crew: $.ui.open: no pane here"]);
});

test("a pane that is not placed says it waits for a wider terminal", async ($, on) => {
  const toasts: string[] = [];
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(PROVEN), stderr: "" }));
  on("ui.open", () => ({ value: { isPlaced: false, reason: "too narrow" } }));
  on("ui.toast", ($, e) => {
    toasts.push(e.text);
    return { value: undefined };
  });
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.command.run({ command: "crew", args: "panel" });
  expect(toasts).toEqual(["Crew: the panel waits for a wider terminal: too narrow"]);
});

test("/crew mode with an answer that has no message still says something", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify({ ok: true }), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "crew", args: "mode pilot" });
  expect(answer.text).toBe("Crew: crew gave no answer");
});

test("the panel explains an inactive engine instead of drawing an empty view", async ($, on) => {
  stubs(on, () => ({ exitCode: 1, stdout: JSON.stringify({ ok: false, message: "crew is inactive here: not a git repository and no .crew/ folder" }), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "crew is inactive here: not a git repository and no .crew/ folder" })).toBeDefined();
  await ui.unmount();
});

test("the panel lists what is not proven and the user's skips", async ($, on) => {
  const partial = { ...PROVEN, phase: "gate", verdict: "unproven", unproven: ["gate lint failing"], runs: [...PROVEN.runs, { gate: "lint", target: ".", status: "fail", durationMs: 300 }], skips: [{ step: "tdd:AC-1", reason: "manual check" }] };
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(partial), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "✗ gate lint failing" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "skipped tdd:AC-1: manual check" })).toBeDefined();
  await ui.unmount();
});

// A status from a 0.5.0 engine: an item waiting for a reply, two unread messages, two tasks
const MAILED = {
  ...PROVEN,
  awaiting: "mail",
  awaitingMessage: "M-2026-10-15-001-storefront",
  mail: { unread: 2, answered: 1, waiting: 0 },
  tasks: [
    {
      task: { task: "T-2", criteria: ["AC-2"], branch: "crew/2026-10-15-042/T-2", child: "2026-10-15-001-t-2", verdict: "proven", mergedAt: "2026-10-15T15:00:00.000Z", mergeCommit: "abc1234def" },
      status: "answered",
      verdict: "proven",
    },
    { task: { task: "T-3", criteria: ["AC-3"], branch: "crew/2026-10-15-042/T-3" }, status: "sent", verdict: "no reply yet" },
  ],
};
// What `crew mail inbox --json` prints for that item
const INBOX = {
  ok: true,
  message: "Mail (w/crm, as session): 2 unread, 1 answered\n  M-2026-10-15-001-storefront · question · from storefront · loyalty_tier on POST /customers · sent\n  M-2026-10-15-002-storefront · blocker · from storefront · Checkout is down · sent",
  messages: [],
  unread: 2,
  answered: 1,
  waiting: 0,
};

test("SP2c: the strip shows unread mail and which wait the item is in", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(MAILED), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: [] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: / · mail 2 unread · waiting for a reply to M-2026-10-15-001-storefront$/ })).toBeDefined();
  await ui.unmount();
});

test("SP2c: the strip says waiting for the roles, and nothing about mail when the inbox is clean", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify({ ...PROVEN, awaiting: "role", mail: { unread: 0, answered: 0, waiting: 0 } }), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: [] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: /^crew .* · waiting for the roles$/ })).toBeDefined();
  expect(await ui.find({ type: "Text", text: /mail/ })).toBeUndefined();
  await ui.unmount();
});

test("SP2c: the panel lists the inbox and the tasks", async ($, on) => {
  let calls = 0;
  stubs(on, () => {
    calls += 1;
    // the status at the session's start, the status when the panel opens, then the inbox for it
    return { exitCode: 0, stdout: JSON.stringify(calls === 3 ? INBOX : MAILED), stderr: "" };
  });
  on("ui.open", () => ({ value: { isPlaced: true } }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.command.run({ command: "crew", args: "panel" });
  // the status at the start, the status for the panel, the inbox and the workspace for it (SP7b Task 6)
  expect(calls).toBe(4);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "Tasks" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "T-2 · AC-2 · crew/2026-10-15-042/T-2 · 2026-10-15-001-t-2 · proven · merged abc1234" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "T-3 · AC-3 · crew/2026-10-15-042/T-3 · no child yet · no reply yet" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "Mail: 2 unread, 1 answered" })).toBeDefined();
  expect(await ui.find({ type: "Text", text: "M-2026-10-15-002-storefront · blocker · from storefront · Checkout is down · sent" })).toBeDefined();
  await ui.unmount();
});

test("SP2c: the panel renders for an engine before 0.5.0 (no mail, no tasks, awaiting user)", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify({ ...PROVEN, awaiting: "user" }), stderr: "" }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  on("ui.render", () => ({ type: "Text", props: {}, children: [] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.command.run({ command: "crew", args: "panel" });
  const pane = await $.ui.mount({ ...PANE, surface: "terminal" });
  expect(await pane.find({ type: "Text", text: "Proven: secrets, test" })).toBeDefined();
  expect(await pane.find({ type: "Text", text: "Tasks" })).toBeUndefined();
  expect(await pane.find({ type: "Text", text: /^Mail:/ })).toBeUndefined();
  await pane.unmount();
  const strip = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(await strip.find({ type: "Text", text: /^crew .* · waiting for the user$/ })).toBeDefined();
  await strip.unmount();
});

test("SP2c: /crew mail prints the inbox; an unknown verb names it", async ($, on) => {
  let calls = 0;
  stubs(on, () => {
    calls += 1;
    return { exitCode: 0, stdout: JSON.stringify(calls === 1 ? MAILED : INBOX), stderr: "" };
  });
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "crew", args: "mail" });
  expect(answer.text).toBe(`Crew: ${INBOX.message}`);
  const unknown = await $.command.run({ command: "crew", args: "fly" });
  expect(unknown.text).toBe("Crew: unknown verb; use /crew [status|panel|mail|todo|team|workspace|thread <id>|brief T-n|questions|mode <partner|guide|pilot>]");
});

test("SP2c (advisory of 2026-10-15-001): a proven row with no findings reads (0 findings)", async ($, on) => {
  const zero = { ...JUDGED, judgement: [{ gate: "test-quality", status: "proven", planned: "standard route", findings: 0 }] };
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(zero), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const answer = await $.command.run({ command: "crew", args: "status" });
  expect(answer.text).toContain("  test-quality: proven (0 findings)");
});

test("SP2c: /crew status says which wait the item is in and how much mail is unread", async ($, on) => {
  let answer: Record<string, unknown> = { ...MAILED };
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(answer), stderr: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const mailed = await $.command.run({ command: "crew", args: "status" });
  expect(mailed.text).toContain("  phase deliver, route fast, waiting for a reply to M-2026-10-15-001-storefront");
  expect(mailed.text).toContain("\n  mail: 2 unread\n");
  answer = { ...PROVEN, awaiting: "role", mail: { unread: 0, answered: 0, waiting: 0 } };
  const roles = await $.command.run({ command: "crew", args: "status" });
  expect(roles.text).toContain("  phase deliver, route fast, waiting for the roles");
  expect(roles.text).not.toContain("mail:");
  answer = { ...PROVEN, awaiting: "user" };
  const user = await $.command.run({ command: "crew", args: "status" });
  expect(user.text).toContain("  phase deliver, route fast, waiting for the user");
  answer = { ...PROVEN };
  const none = await $.command.run({ command: "crew", args: "status" });
  expect(none.text).toContain("  phase deliver, route fast\n");
});

test("SP2c: /crew mail and the panel run crew mail inbox --json, once each", async ($, on) => {
  const argv: string[][] = [];
  on("session.cwd", () => ({ value: "/work" }));
  on("process.run", ($, e) => {
    argv.push(e.argv);
    const inbox = e.argv[2] === "mail";
    return { value: { exitCode: 0, stdout: JSON.stringify(inbox ? INBOX : MAILED), stderr: "" } };
  });
  on("command.register", () => ({ value: undefined }));
  on("session.start", () => ({ cwd: "/work" }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const before = argv.length;
  const answer = await $.command.run({ command: "crew", args: "mail" });
  expect(answer.text).toBe(`Crew: ${INBOX.message}`);
  expect(argv.length).toBe(before + 1);
  expect((argv.at(-1) ?? []).slice(2)).toEqual(["mail", "inbox", "--json"]);
  await $.command.run({ command: "crew", args: "panel" });
  // the status for the panel, then the inbox and the workspace for it (SP7b Task 6)
  expect(argv.slice(before + 1).map((a) => a.slice(2))).toEqual([
    ["status", "--json"],
    ["mail", "inbox", "--json"],
    ["workspace", "status", "--json"],
  ]);
});

// A standard-route item under 0.6.0: the team, the todo, the roles working and the branch (SP7a Task 7)
const TEAMED = {
  ...JUDGED,
  branch: "main",
  primaryTeam: "backend",
  team: [
    { role: "lead-qa", team: "qa", kind: "lead", reason: "standard route" },
    { role: "review-code-quality", team: null, kind: "gate", gate: "code-quality", reason: "standard route" },
    { role: "judge", team: null, kind: "gate", reason: "standard route" },
  ],
  todo: {
    done: 1,
    total: 2,
    items: [
      { task: "T-1", criteria: ["AC-1"], state: "briefed", inline: true },
      { task: "T-2", criteria: ["AC-2"], state: "handed", inline: false },
    ],
  },
  working: [
    { agent: "review-code-quality", team: null, since: "2026-10-17T10:00:00.000Z", description: "Review the diff" },
    { agent: "judge", team: null, since: "2026-10-17T10:01:00.000Z" },
  ],
  tasks: [{ task: { task: "T-2", criteria: ["AC-2"], branch: "crew/2026-10-15-002/T-2" }, status: "sent", verdict: "no reply yet" }],
};

test("SP7a AC-7 (Task 7): the strip shows the todo count and the roles working after the gates, before the mail and the wait", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify({ ...TEAMED, awaiting: "role", mail: { unread: 1, answered: 0, waiting: 0 } }), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: [] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(
    await ui.find({
      type: "Text",
      text: "crew 2026-10-15-002-delete-accounts · gate · standard · not proven (judgement gate test-quality not proven) · secrets ✓ test ✓ code-quality ✓ test-quality ✗ ui-ux ? security … risk – · todo 1/2 · working review-code-quality, judge · mail 1 unread · waiting for the roles",
    }),
  ).toBeDefined();
  await ui.unmount();
});

test("SP7a AC-7 (Task 7): the panel shows the branch after the phases, then the team, the todo with its checks and the roles working after the judgement rows, in that order", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(TEAMED), stderr: "" }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.command.run({ command: "crew", args: "panel" });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text);
  const phases = texts.indexOf("receive › recognize › understand › specify › conclave › plan › build › [gate] › deliver");
  expect(phases).toBeGreaterThan(0);
  expect(texts[phases + 1]).toBe("Branch: main");
  const lastJudgement = texts.indexOf("risk: skipped (no production yet)");
  expect(lastJudgement).toBeGreaterThan(phases);
  expect(texts.slice(lastJudgement + 1, lastJudgement + 9)).toEqual([
    "Team (primary backend)",
    "lead-qa · standard route",
    "review-code-quality · standard route",
    "judge · standard route",
    "Todo 1/2",
    "✓ T-1 · AC-1 · briefed · inline",
    "○ T-2 · AC-2 · handed",
    "Working: review-code-quality (Review the diff), judge",
  ]);
  // The Tasks block comes right after the Working row.
  expect(texts.indexOf("Tasks")).toBe(lastJudgement + 9);
  await ui.unmount();
});

test("SP7a AC-7 (Task 7): /crew todo and /crew team print the lists, /crew status names the branch, the team and the todo; the command's hint names the verbs; an engine before 0.6.0 is told it prints neither", async ($, on) => {
  let teamed = true;
  let registered: { argumentHint?: string } | null = null;
  on("session.cwd", () => ({ value: "/work" }));
  on("process.run", () => ({ value: { exitCode: 0, stdout: JSON.stringify(teamed ? TEAMED : JUDGED), stderr: "" } }));
  on("command.register", ($, e) => {
    registered = e as { argumentHint?: string };
    return { value: undefined };
  });
  on("session.start", () => ({ cwd: "/work" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  expect(registered?.argumentHint).toBe("[status|panel|mail|todo|team|mode <partner|guide|pilot>]");
  const todo = await $.command.run({ command: "crew", args: "todo" });
  expect(todo.text).toBe("Crew: todo 1/2 of 2026-10-15-002-delete-accounts\n  ✓ T-1 · AC-1 · briefed · inline\n  ○ T-2 · AC-2 · handed");
  const team = await $.command.run({ command: "crew", args: "team" });
  expect(team.text).toBe("Crew: team of 2026-10-15-002-delete-accounts (primary backend): lead-qa (standard route), review-code-quality (standard route), judge (standard route)");
  const status = await $.command.run({ command: "crew", args: "status" });
  expect(status.text).toContain("  branch main");
  expect(status.text).toContain("  team: lead-qa, review-code-quality, judge (primary backend)");
  expect(status.text).toContain("  todo 1/2 · working: review-code-quality, judge");
  teamed = false;
  expect((await $.command.run({ command: "crew", args: "todo" })).text).toBe("Crew: this engine prints no todo (0.6.0 or later does)");
  expect((await $.command.run({ command: "crew", args: "team" })).text).toBe("Crew: this engine prints no team (0.6.0 or later does)");
});

// A project's threads and the workspace, as the engine prints them since SP7b Task 6
const THREADS = [
  { root: "M-1", subject: "loyalty_tier", messages: 2, unread: 1, open: true },
  { root: "M-2", subject: "checkout", messages: 1, unread: 0, open: false },
];
const WORKSPACE = {
  ok: true,
  message:
    "Workspace shop: 2 projects\n  crm (/w/crm): live · items 1 · unread 0 · threads 1 open · priorities 0 unconfirmed · environment up\n  storefront (/w/storefront): not live · items 0 · unread 1 · threads 1 open · priorities 1 unconfirmed · environment none",
  workspace: "shop",
  projects: [],
};

test("SP7b-T6 AC-3: the strip shows a priority that is not normal after the route", async ($, on) => {
  let answer: Record<string, unknown> = { ...TEAMED, priority: "high" };
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(answer), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: ["drawn by Claude Code"] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text);
  // right after the route (standard for TEAMED), before the verdict
  expect(texts.some((t) => / · standard · priority high · /.test(t))).toBe(true);
  await ui.unmount();
  answer = { ...TEAMED, priority: "normal" };
  await $.command.run({ command: "crew", args: "status" });
  const again = await $.ui.mount({ ...STRIP, surface: "terminal" });
  const plain = (await again.findAll({ type: "Text" })).map((t) => t.text);
  expect(plain.some((t) => t.includes("priority"))).toBe(false);
  await again.unmount();
});

test("SP3-T3 AC-3: the strip marks a priority whose triage is unconfirmed", async ($, on) => {
  const answer: Record<string, unknown> = {
    ...TEAMED,
    priority: "high",
    triage: { proposed: "high", confirmed: null, against: "none" },
  };
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(answer), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: ["drawn by Claude Code"] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text);
  expect(texts.some((t) => / · standard · priority high \(unconfirmed\) · /.test(t))).toBe(true);
  await ui.unmount();
});

test("SP7b-T6 AC-3: /crew status and the panel show the mail as threads, and the panel shows the workspace", async ($, on) => {
  const argv: string[][] = [];
  on("session.cwd", () => ({ value: "/work" }));
  on("process.run", ($, e) => {
    argv.push(e.argv);
    const answer =
      e.argv[2] === "workspace"
        ? WORKSPACE
        : e.argv[2] === "mail"
          ? INBOX
          : { ...TEAMED, mail: { unread: 1, answered: 0, waiting: 0 }, threads: THREADS };
    return { value: { exitCode: 0, stdout: JSON.stringify(answer), stderr: "" } };
  });
  on("command.register", () => ({ value: undefined }));
  on("session.start", () => ({ cwd: "/work" }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const status = await $.command.run({ command: "crew", args: "status" });
  expect(status.text).toContain("\n  mail: 2 threads (1 open, 1 unread)\n");
  expect(status.text).not.toContain("unread\n  mail:");
  await $.command.run({ command: "crew", args: "panel" });
  expect(argv.slice(-3).map((a) => a.slice(2))).toEqual([
    ["status", "--json"],
    ["mail", "inbox", "--json"],
    ["workspace", "status", "--json"],
  ]);
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text);
  const mail = texts.indexOf("Mail: 2 threads (1 open, 1 unread)");
  expect(mail).toBeGreaterThan(0);
  expect(texts.slice(mail + 1, mail + 3)).toEqual([
    "M-1 · loyalty_tier · 2 messages · 1 unread · open",
    "M-2 · checkout · 1 message · 0 unread · closed",
  ]);
  const workspace = texts.indexOf("Workspace shop");
  expect(workspace).toBe(mail + 3);
  expect(texts.slice(workspace + 1, workspace + 3)).toEqual([
    "crm (/w/crm): live · items 1 · unread 0 · threads 1 open · priorities 0 unconfirmed · environment up",
    "storefront (/w/storefront): not live · items 0 · unread 1 · threads 1 open · priorities 1 unconfirmed · environment none",
  ]);
  await ui.unmount();
});

test("SP7b-T6 AC-3: an engine without the workspace command draws no Workspace block, and empty threads print no mail line", async ($, on) => {
  on("session.cwd", () => ({ value: "/work" }));
  on("process.run", ($, e) => {
    const answer =
      e.argv[2] === "workspace"
        ? { ok: false, message: "unknown command: workspace" }
        : e.argv[2] === "mail"
          ? INBOX
          : { ...TEAMED, mail: { unread: 0, answered: 0, waiting: 0 }, threads: [] };
    return { value: { exitCode: 0, stdout: JSON.stringify(answer), stderr: "" } };
  });
  on("command.register", () => ({ value: undefined }));
  on("session.start", () => ({ cwd: "/work" }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const status = await $.command.run({ command: "crew", args: "status" });
  expect(status.text).not.toContain("mail:");
  await $.command.run({ command: "crew", args: "panel" });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text);
  expect(texts).toContain("Mail: 0 threads (0 open, 0 unread)");
  expect(texts.some((t) => t.startsWith("Workspace"))).toBe(false);
  await ui.unmount();
});

test("SP7b-T6 AC-3: /crew workspace, /crew thread <id> and /crew brief T-n run the engine's commands and print their message; the hint names the verbs", async ($, on) => {
  const argv: string[][] = [];
  let active: Record<string, unknown> = { ...TEAMED };
  on("session.cwd", () => ({ value: "/work" }));
  on("process.run", ($, e) => {
    argv.push(e.argv);
    const sub = e.argv[2];
    const answer =
      sub === "workspace"
        ? WORKSPACE
        : sub === "mail"
          ? { ok: true, message: "Thread M-1: 2 messages, 2 parties (crm, storefront)\n  M-1 · [high] · question · crm → storefront · loyalty_tier · done" }
          : sub === "task"
            ? { ok: true, message: "# Brief: T-2 of 2026-10-15-002-delete-accounts\n\n## Changed\n- src/b.ts", task: "T-2", brief: "# Brief" }
            : active;
    return { value: { exitCode: 0, stdout: JSON.stringify(answer), stderr: "" } };
  });
  on("command.register", () => ({ value: undefined }));
  on("session.start", () => ({ cwd: "/work" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const workspace = await $.command.run({ command: "crew", args: "workspace" });
  expect(workspace.text).toBe(`Crew: ${WORKSPACE.message}`);
  expect((argv.at(-1) ?? []).slice(2)).toEqual(["workspace", "status", "--json"]);
  const thread = await $.command.run({ command: "crew", args: "thread M-1" });
  expect(thread.text).toBe("Crew: Thread M-1: 2 messages, 2 parties (crm, storefront)\n  M-1 · [high] · question · crm → storefront · loyalty_tier · done");
  expect((argv.at(-1) ?? []).slice(2)).toEqual(["mail", "thread", "M-1", "--json"]);
  expect((await $.command.run({ command: "crew", args: "thread" })).text).toBe("Crew: /crew thread needs a message id");
  const brief = await $.command.run({ command: "crew", args: "brief T-2" });
  expect(brief.text).toBe("Crew: # Brief: T-2 of 2026-10-15-002-delete-accounts\n\n## Changed\n- src/b.ts");
  expect((argv.at(-1) ?? []).slice(2)).toEqual(["task", "2026-10-15-002-delete-accounts", "brief", "T-2", "--print", "--json"]);
  expect((await $.command.run({ command: "crew", args: "brief" })).text).toBe("Crew: /crew brief needs a task (T-n)");
  active = NONE;
  expect((await $.command.run({ command: "crew", args: "brief T-2" })).text).toBe("Crew: no active work item. A change starts with the crew skill.");
  expect((await $.command.run({ command: "crew", args: "fly" })).text).toBe(
    "Crew: unknown verb; use /crew [status|panel|mail|todo|team|workspace|thread <id>|brief T-n|questions|mode <partner|guide|pilot>]",
  );
});

test("SP3-T4 AC-3: the panel shows the questions first, open before answered, right after the branch line; /crew questions prints the engine's list; an engine without the field draws no block", async ($, on) => {
  const argv: string[][] = [];
  const LIST = "Q-2 · open · And the colour? · posted: cli; to post: ticket (86c1)\nQ-1 · answered by the user (2026-10-19T09:30:00.000Z) · Gold or silver first? → Gold";
  let active: Record<string, unknown> = {
    ...TEAMED,
    questions: [
      { id: "Q-2", text: "And the colour?", askedAt: "2026-10-19T10:00:00.000Z", open: true, channels: [{ kind: "cli", posted: true, ref: null }, { kind: "ticket", posted: false, ref: "86c1" }], answer: null, by: null, answeredAt: null },
      { id: "Q-1", text: "Gold or silver first?", askedAt: "2026-10-19T09:00:00.000Z", open: false, channels: [{ kind: "cli", posted: true, ref: null }], answer: "Gold", by: "the user", answeredAt: "2026-10-19T09:30:00.000Z" },
    ],
  };
  on("session.cwd", () => ({ value: "/work" }));
  on("process.run", ($, e) => {
    argv.push(e.argv);
    const sub = e.argv[2];
    const answer =
      sub === "question"
        ? { ok: true, message: LIST, questions: [] }
        : sub === "workspace"
          ? WORKSPACE
          : sub === "mail"
            ? INBOX
            : active;
    return { value: { exitCode: 0, stdout: JSON.stringify(answer), stderr: "" } };
  });
  on("command.register", () => ({ value: undefined }));
  on("session.start", () => ({ cwd: "/work" }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.command.run({ command: "crew", args: "panel" });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text);
  const branch = texts.indexOf("Branch: main");
  expect(branch).toBeGreaterThan(0);
  expect(texts.slice(branch + 1, branch + 6)).toEqual([
    "Questions",
    "? Q-2 · And the colour? · to post: ticket (86c1)",
    "✓ Q-1 · Gold or silver first? → Gold",
    " ",
    "AC-1 behavior · red then green · The total subtracts the discount.",
  ]);
  await ui.unmount();
  const list = await $.command.run({ command: "crew", args: "questions" });
  expect(list.text).toBe(`Crew: ${LIST}`);
  expect((argv.at(-1) ?? []).slice(2)).toEqual(["question", "2026-10-15-002-delete-accounts", "list", "--json"]);
  active = { ...TEAMED };
  await $.command.run({ command: "crew", args: "panel" });
  const plain = await $.ui.mount({ ...PANE, surface: "terminal" });
  const texts2 = (await plain.findAll({ type: "Text" })).map((t) => t.text);
  expect(texts2.includes("Questions")).toBe(false);
  expect(texts2[texts2.indexOf("Branch: main") + 1]).toBe(" ");
  await plain.unmount();
  active = NONE;
  expect((await $.command.run({ command: "crew", args: "questions" })).text).toBe("Crew: no active work item. A change starts with the crew skill.");
});

test("SP8-T1 AC-5 (finding 84): the strip shows a confirmed priority with no mark", async ($, on) => {
  const answer: Record<string, unknown> = {
    ...TEAMED,
    priority: "high",
    triage: { proposed: "high", confirmed: "high", against: "signed", reason: null },
  };
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(answer), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: ["drawn by Claude Code"] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text);
  expect(texts.some((t) => / · standard · priority high · /.test(t))).toBe(true);
  expect(texts.some((t) => /unconfirmed/.test(t))).toBe(false);
  await ui.unmount();
});

// An audit item (SP8): the run recorded, two findings files in, the report rendered without a PDF, unsigned
const AUDITED = {
  ...PROVEN,
  active: "2026-10-19-020-audit-this-project",
  title: "Audit this project",
  type: "audit",
  phase: "audit",
  route: "full",
  verdict: "unproven",
  unproven: ["the audit's signature (crew approve <id> audit)"],
  phases: ["receive", "recognize", "audit", "deliver"],
  criteria: [],
  runs: [],
  expected: [],
  branch: "main",
  audit: {
    run: { at: "2026-10-19T10:00:00.000Z", head: "abc1234", summary: "1 pass, 2 fail (secrets, test), 2 unavailable (deps, e2e)" },
    runAtHead: true,
    // The lines the roles filed, under the engine's own key (finding 102); the pane still reads "findings".
    filed: { security: 2, business: 1 },
    report: { at: "2026-10-19T10:05:00.000Z", md: "audit/report.md", html: "audit/report.html", pdf: null, pdfReason: "PDF not produced: no Playwright in the project and no browser found (set WIZARDINGCODE_CREW_BROWSER)", verdict: "critical", current: true },
    signed: false,
  },
};

test("SP8-T5 AC-3: the panel draws the Audit block with the checks and /crew status prints the audit line", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(AUDITED), stderr: "" }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const status = await $.command.run({ command: "crew", args: "status" });
  expect(status.text).toContain("  audit: run ✓ 1 pass, 2 fail (secrets, test), 2 unavailable (deps, e2e) · findings security 2, business 1 · report md, html (pdf not produced) · unsigned");
  await $.command.run({ command: "crew", args: "panel" });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text);
  const branch = texts.indexOf("Branch: main");
  expect(branch).toBeGreaterThan(0);
  expect(texts.slice(branch + 1, branch + 6)).toEqual([
    "Audit",
    "run ✓ 1 pass, 2 fail (secrets, test), 2 unavailable (deps, e2e)",
    "findings security 2 · business 1",
    "report ✓ md, html · pdf not produced (PDF not produced: no Playwright in the project and no browser found (set WIZARDINGCODE_CREW_BROWSER))",
    "signed … (crew approve 2026-10-19-020-audit-this-project audit)",
  ]);
  await ui.unmount();
});

test("SP8-T5 AC-3: the panel of an item without the audit field draws no Audit block", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(PROVEN), stderr: "" }));
  on("ui.open", () => ({ value: { isPlaced: true } }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  await $.command.run({ command: "crew", args: "panel" });
  const ui = await $.ui.mount({ ...PANE, surface: "terminal" });
  const texts = (await ui.findAll({ type: "Text" })).map((t) => t.text);
  expect(texts.includes("Audit")).toBe(false);
  await ui.unmount();
});
