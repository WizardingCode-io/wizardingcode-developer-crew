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
};
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
  const last = argv.at(-1) ?? [];
  expect(last[0]).toBe("node");
  // The test host loads the real plugin folder, so the root is the checkout's, not a stub
  expect(last[1]).toMatch(/\/plugins\/core\/dist\/crew\.mjs$/);
  expect(last.slice(2)).toEqual(["mode", "pilot", "--json"]);
});

// What Claude Code passes to a ui.render hook for the strip above the prompt
const STRIP = {
  plugin: "shibaox-developer-crew",
  component: "AbovePrompt",
  requestId: "above-prompt",
  viewport: { columns: 120, rows: 40 },
  props: { hasSurvey: false, isWorking: false, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const;

test("the strip shows the item, phase, route, gates and verdict, and keeps other mods' content", async ($, on) => {
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(PROVEN), stderr: "" }));
  on("ui.render", () => ({ type: "Text", props: {}, children: ["drawn by Claude Code"] }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const ui = await $.ui.mount({ ...STRIP, surface: "terminal" });
  expect(await ui.find({ type: "Text", text: "crew 2026-10-07-001-fix-total · deliver · fast · secrets ✓ test ✓ · proven" })).toBeDefined();
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
  expect(await ui.find({ type: "Text", text: "crew 2026-10-07-001-fix-total · build · fast · not proven" })).toBeDefined();
  await ui.unmount();
  const line = await $.turn.complete({ turnId: "t1", answer: "done", durationMs: 10, isAborted: false, usage: null });
  expect(line.text).toBe("Not proven: gates have not run");
});

test("the line under a proven answer names the gates, and no item means no line", async ($, on) => {
  let proven = true;
  stubs(on, () => ({ exitCode: 0, stdout: JSON.stringify(proven ? PROVEN : NONE), stderr: "" }));
  on("turn.complete", () => ({ text: "" }));
  await $.session.start({ surface: "terminal", isInteractive: true, cwd: "/work" });
  const line = await $.turn.complete({ turnId: "t1", answer: "done", durationMs: 10, isAborted: false, usage: null });
  expect(line.text).toBe("Proven: secrets, test");
  proven = false;
  const none = await $.turn.complete({ turnId: "t2", answer: "done", durationMs: 10, isAborted: false, usage: null });
  expect(none.text).toBe("");
});
