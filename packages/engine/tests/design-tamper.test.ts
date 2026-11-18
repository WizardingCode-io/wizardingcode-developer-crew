// A design record changed or removed by hand stops the commands that save on its item and leaves
// its verdict not proven, until the user accepts the file (item 2026-11-18-012).
import { expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type CliIo, main } from "../src/cli.ts";
import { PROTECTED_WORK_FILES } from "../src/paths.ts";
import { changedDesignRecords, writeProtectedJson } from "../src/store.ts";
import { trustChildRecords } from "../src/tasks.ts";
import { makeRepo, repoPaths, testEnv } from "./helpers.ts";

const DESIGN_RECORDS = PROTECTED_WORK_FILES.filter((name) => name.startsWith("design/"));

/** An item of a new site, its surface recorded by the engine, and the commands to drive it. */
async function site(request = "a site") {
  const root = makeRepo({ "README.md": "# t\n", "package.json": '{"name":"t"}\n' });
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
  const started = await run("start", request, "--answers", answers, "--json");
  const id = /(\d{4}-\d{2}-\d{2}-\d{3}-[a-z0-9-]+)/.exec(started.text)?.[1] ?? "";
  const paths = repoPaths(root, env);
  const folder = join(root, ".crew", "work", id);
  const surface = async () => {
    const recorded = await run("design", id, "surface", "persuade", "--invention", "world");
    if (recorded.code !== 0) throw new Error(recorded.text);
  };
  return { run, id, root, paths, folder, surface };
}
type Site = Awaited<ReturnType<typeof site>>;

/** What the two saving commands and the status answer on an item whose `name` is changed or gone. */
async function refused(a: Site, name: string, what: string): Promise<void> {
  const before = readFileSync(join(a.folder, "work.json"), "utf8");
  for (const command of [
    ["design", a.id, "score"],
    ["gate", "run", a.id],
  ]) {
    const got = await a.run(...command);
    expect(got.code, `${what}: ${command.join(" ")}`).not.toBe(0);
    expect(got.text, `${what}: ${command.join(" ")}`).toContain(
      `state changed outside the engine: .crew/work/${a.id}/${name}; the user can accept it with crew accept ${a.id}`,
    );
  }
  expect(readFileSync(join(a.folder, "work.json"), "utf8"), what).toBe(before);
  expect(
    existsSync(join(a.folder, "design", "score.json")) && name !== "design/score.json",
    what,
  ).toBe(false);
  const status = await a.run("status", a.id);
  expect(status.text, what).toContain("Not proven");
  expect(status.text, what).toContain(
    `design record changed outside the engine: ${name} (the user accepts it with crew accept ${a.id})`,
  );
}
const namesNoRecord = (text: string): boolean =>
  !text.includes("design record changed outside the engine");

test("tamper AC-8: a design record changed or removed by hand refuses the saving commands and is named by the status, until the user accepts it", async () => {
  expect(DESIGN_RECORDS.length).toBeGreaterThanOrEqual(8);
  expect(DESIGN_RECORDS).toContain("design/surface.json");

  // The surface changed by hand to `extend`, the edit that turned the design gate off.
  const a = await site();
  await a.surface();
  const file = join(a.folder, "design", "surface.json");
  expect(namesNoRecord((await a.run("status", a.id)).text)).toBe(true);
  writeFileSync(file, readFileSync(file, "utf8").replace('"world"', '"extend"'));
  await refused(a, "design/surface.json", "the surface changed to extend");
  const accepted = await a.run("accept", a.id);
  expect(accepted.code).toBe(0);
  expect(accepted.text).not.toContain("taken as gone");
  expect(namesNoRecord((await a.run("status", a.id)).text)).toBe(true);
  expect((await a.run("design", a.id, "score")).text).not.toContain(
    "state changed outside the engine",
  );

  // Every design record the engine protects, written by the engine and then changed by hand.
  for (const name of DESIGN_RECORDS) {
    const b = await site();
    await b.surface();
    const path = join(b.folder, name);
    if (name !== "design/surface.json") writeProtectedJson(b.paths, path, { planted: name });
    expect(namesNoRecord((await b.run("status", b.id)).text), name).toBe(true);
    writeFileSync(path, `${readFileSync(path, "utf8")} `);
    await refused(b, name, `${name} changed`);
    expect((await b.run("accept", b.id)).code, name).toBe(0);
    expect(namesNoRecord((await b.run("status", b.id)).text), name).toBe(true);
  }

  // A record removed by hand is a record changed: the surface, and one other.
  for (const name of ["design/surface.json", "design/deal.json"]) {
    const c = await site();
    await c.surface();
    const path = join(c.folder, name);
    if (name !== "design/surface.json") writeProtectedJson(c.paths, path, { planted: name });
    unlinkSync(path);
    await refused(c, name, `${name} removed`);
    const lifted = await c.run("accept", c.id);
    expect(lifted.code, name).toBe(0);
    expect(lifted.text, name).toContain(`taken as gone: ${name}`);
    expect(
      lifted.text.includes("the item has no design gate until a surface is recorded again"),
      name,
    ).toBe(name === "design/surface.json");
    expect(namesNoRecord((await c.run("status", c.id)).text), name).toBe(true);
    expect((await c.run("design", c.id, "score")).text, name).not.toContain(
      "state changed outside the engine",
    );
  }

  // An item that never had a design record refuses nothing and adds no reason.
  const d = await site();
  expect(namesNoRecord((await d.run("status", d.id)).text)).toBe(true);
  const plain = await d.run("design", d.id, "score");
  expect(plain.text).not.toContain("state changed outside the engine");
  expect(plain.text).toContain("no ui-ux findings yet");
});

test("tamper AC-11: a design record created by hand is refused, and a merged child's design records are trusted only as the child's store held them", async () => {
  // A record the engine never wrote, on an item it recorded a surface for: the forged bar or score.
  for (const name of ["design/bar.json", "design/score.json"]) {
    const a = await site();
    await a.surface();
    writeFileSync(
      join(a.folder, name),
      JSON.stringify({ score: 9.9, caps: [], disposition: "ship" }),
    );
    await refused(a, name, `${name} created by hand`);
  }

  // A surface created by hand on an item that has none: it would turn the design gate on by nobody's decision.
  const bare = await site();
  mkdirSync(join(bare.folder, "design"), { recursive: true });
  writeFileSync(
    join(bare.folder, "design", "surface.json"),
    JSON.stringify({ surface: "persuade", invention: "world", at: "x" }),
  );
  await refused(bare, "design/surface.json", "a surface created by hand");

  // A child's folder copied into its parent's repository, as a task's merge copies it.
  const copied = async (spoil: boolean) => {
    const child = await site("the child's part of a site");
    await child.surface();
    writeProtectedJson(child.paths, join(child.folder, "design", "deal.json"), { planted: "deal" });
    if (spoil) {
      const file = join(child.folder, "design", "surface.json");
      writeFileSync(file, readFileSync(file, "utf8").replace('"world"', '"extend"'));
    }
    const parent = await site("the parent's site");
    await parent.surface();
    expect(parent.id).not.toBe(child.id);
    const here = join(parent.root, ".crew", "work", child.id);
    cpSync(child.folder, here, { recursive: true });
    return { child, parent, here };
  };
  const whole = await copied(false);
  // Copied and not yet trusted, every design record of the child reads as changed in the parent: the fault the merge had.
  expect(changedDesignRecords(whole.parent.paths, whole.here).sort()).toEqual([
    "design/deal.json",
    "design/surface.json",
  ]);
  trustChildRecords(whole.parent.paths, whole.child.paths, whole.child.id);
  expect(changedDesignRecords(whole.parent.paths, whole.here)).toEqual([]);
  expect((await whole.parent.run("design", whole.child.id, "score")).text).not.toContain(
    "state changed outside the engine",
  );

  // A record changed by hand in the child stays changed in the parent; the one the child held whole is trusted.
  const spoiled = await copied(true);
  trustChildRecords(spoiled.parent.paths, spoiled.child.paths, spoiled.child.id);
  expect(changedDesignRecords(spoiled.parent.paths, spoiled.here)).toEqual(["design/surface.json"]);
  expect((await spoiled.parent.run("design", spoiled.child.id, "score")).text).toContain(
    `design/surface.json; the user can accept it with crew accept ${spoiled.child.id}`,
  );

  // A record created by hand in the child, with no hash in the child's store, is trusted by nobody.
  const forged = await copied(false);
  writeFileSync(
    join(forged.child.folder, "design", "bar.json"),
    JSON.stringify({ decision: "D-1", shots: [] }),
  );
  cpSync(join(forged.child.folder, "design", "bar.json"), join(forged.here, "design", "bar.json"));
  trustChildRecords(forged.parent.paths, forged.child.paths, forged.child.id);
  expect(changedDesignRecords(forged.parent.paths, forged.here)).toEqual(["design/bar.json"]);

  // A copy whose bytes are not the child's is not trusted on the child's word.
  const swapped = await copied(false);
  writeFileSync(join(swapped.here, "design", "deal.json"), JSON.stringify({ planted: "another" }));
  trustChildRecords(swapped.parent.paths, swapped.child.paths, swapped.child.id);
  expect(changedDesignRecords(swapped.parent.paths, swapped.here)).toEqual(["design/deal.json"]);
});
