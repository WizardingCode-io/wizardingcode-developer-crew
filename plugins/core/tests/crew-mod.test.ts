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
  expect(answer.text).toBe("Crew: unknown verb; use /crew [status|panel|mode <partner|guide|pilot>]");
});

// What Claude Code passes to a ui.render hook for the strip above the prompt
const STRIP = {
  plugin: "shibaox-developer-crew",
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
  plugin: "shibaox-developer-crew",
  component: "Pane",
  requestId: "crew",
  viewport: { columns: 120, rows: 40 },
  props: { title: "Crew", isFocused: true, bodyColumns: 80, placement: "inline", scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const;

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
  expect(runs).toBe(before + 1);
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
  expect(toasts).toEqual(["Crew: the panel could not open: shibaox-developer-crew: $.ui.open: no pane here"]);
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
