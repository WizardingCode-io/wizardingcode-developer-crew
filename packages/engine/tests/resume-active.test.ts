// The active slot given back (item 2026-11-18-020): only `crew start` wrote the checkout's active
// item, so an open item that lost the slot to a later start had no way to be worked on again once
// the later one was learned. `crew resume <id>` makes an item that is not learned the active one.
import { expect, test } from "bun:test";
import { type CliIo, main } from "../src/cli.ts";
import { loadState, updateState } from "../src/state.ts";
import { loadWork, saveWork } from "../src/work.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

const NOW_ACTIVE = "now the active item";

async function project() {
  const root = makeRepo({ "README.md": "# t\n", "package.json": '{"name":"t"}\n' });
  const env = testEnv();
  const paths = repoPaths(root, env);
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
  /** A new item, by the id of the command's own answer: its message may name an earlier item. */
  const start = async (request: string): Promise<string> => {
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
    const started = await run("start", request, "--answers", answers, "--json");
    const id = (JSON.parse(started.text) as { id?: string }).id;
    if (!id) throw new Error(`no item was started: ${started.text}`);
    return id;
  };
  /** The item as learned, as `crew learn` leaves it: the mark on the item and the slot given up. */
  const learned = (id: string) => {
    const { work } = loadWork(paths, id);
    if (!work) throw new Error(`no item ${id}`);
    work.phase = "learn";
    work.learned = { at: "2026-11-18T10:00:00.000Z" } as NonNullable<typeof work.learned>;
    saveWork(paths, work);
    updateState(paths, (state) => {
      if (state.active === id) state.active = null;
    });
  };
  const active = () => loadState(paths).active;
  return { run, start, learned, active, paths };
}

test("active AC-3: crew resume gives an item that is not learned the active slot", async () => {
  const p = await project();
  const first = await p.start("the first page");
  const second = await p.start("the second page");
  expect(first).not.toBe(second);
  expect(p.active(), "a later start takes the slot").toBe(second);

  // The defect as it was seen: the later item is learned and the earlier one is nobody's.
  p.learned(second);
  expect(p.active(), "a learned item gives the slot up").toBeNull();
  expect((await p.run("status")).text).toContain("no active work item");

  const back = await p.run("resume", first);
  expect(back.code, back.text).toBe(0);
  expect(back.text).toContain(`${first}: resumed`);
  expect(back.text, "an empty slot: said, and nothing displaced").toContain(NOW_ACTIVE);
  expect(back.text).not.toContain("in place of");
  expect(p.active()).toBe(first);
  const status = await p.run("status");
  expect(status.text).not.toContain("no active work item");
  expect(status.text, "status names the item").toContain(first);

  // The item that already holds the slot: resumed as before, and nothing new is said.
  const again = await p.run("resume", first);
  expect(again.code, again.text).toBe(0);
  expect(again.text).not.toContain(NOW_ACTIVE);
  expect(p.active()).toBe(first);

  // A learned item is closed: its resume leaves the slot where it was.
  const closed = await p.run("resume", second);
  expect(closed.text, "a learned item never takes the slot").not.toContain(NOW_ACTIVE);
  expect(p.active()).toBe(first);

  // Another open item holds the slot: the answer names the item it displaced, and that one can
  // take it back the same way.
  const third = await p.start("the third page");
  expect(p.active()).toBe(third);
  const displaced = await p.run("resume", first);
  expect(displaced.code, displaced.text).toBe(0);
  expect(displaced.text).toContain(`${NOW_ACTIVE}, in place of ${third}`);
  expect(p.active()).toBe(first);
  const returned = await p.run("resume", third);
  expect(returned.text).toContain(`${NOW_ACTIVE}, in place of ${first}`);
  expect(p.active()).toBe(third);

  // An abandoned item is refused as before, and the slot is as it was.
  const dropped = await p.run("abandon", first, "--reason", "not wanted");
  expect(dropped.code, dropped.text).toBe(0);
  expect(p.active(), "abandoning an item that is not the active one").toBe(third);
  const refused = await p.run("resume", first);
  expect(refused.code).not.toBe(0);
  expect(refused.text).toContain("was abandoned");
  expect(p.active()).toBe(third);

  // The slot naming a learned item (a state nothing cleared): a closed item is not displaced.
  updateState(p.paths, (state) => {
    state.active = second;
  });
  const overClosed = await p.run("resume", third);
  expect(overClosed.text).toContain(NOW_ACTIVE);
  expect(overClosed.text, "a learned holder is no item displaced").not.toContain("in place of");
  expect(p.active()).toBe(third);

  // The slot held by an item since abandoned (an id nothing cleared): no item is displaced.
  const fourth = await p.start("the fourth page");
  const fifth = await p.start("the fifth page");
  expect(p.active()).toBe(fifth);
  expect((await p.run("abandon", fifth, "--reason", "not wanted")).code).toBe(0);
  expect(p.active(), "abandoning the active item empties the slot").toBeNull();
  const taken = await p.run("resume", fourth);
  expect(taken.text).toContain(NOW_ACTIVE);
  expect(taken.text).not.toContain("in place of");
  expect(p.active()).toBe(fourth);
}, 60_000);
