# SP1c: Loose Ends Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The work itself runs through the crew engine (Task 0): one work item on the standard route, one acceptance criterion per engine task, red before green.

**Goal:** Close what SP1 left open before SP2 starts: the engine proves work in a workspace monorepo (this repository included), `.claude/**` stops counting as source, a new work item does not inherit the proven uncommitted work of the previous one, the Bash hook stops reading `2>/dev/null` as a write, the eval suite runs from one command, the two interactive checks are recorded, and 0.1.1 ships.

**Context:** SP1 closed and shipped as 0.1.0 on 2026-10-12. The vision's roadmap says each subproject is used on real projects before the next begins; the user chose to close SP1's recorded loose ends first. Two were already closed by commit 962cf84 (an item without criteria is never proven; `crew start` warns about uncommitted changes). Exploration found two more not in the records: in a workspace a member package without scripts gets `gates: {}`, so `test (packages/engine)` is planned and ends "unavailable: no command", which means nothing under `packages/engine/` can be proven in this very repository; and `WRITE_SHAPE` in the PreToolUse hook matches the `2>` of `2>/dev/null`, so a read of `.crew/profile.json` with stderr silenced is denied. Decisions taken with the user: exclude the whole `.claude/**`; implement the snapshot of the previous item's proven files; release 0.1.1 at the end.

**Architecture:** Five small engine changes, each behind a failing test first, in `packages/engine` (dependency-free TypeScript, tests in `packages/engine/tests/`, run with `bun test packages`). A `Target.workspaceOf` field links a workspace member to the package that lists it; `plannedGates` and `missingTestCommands` let the parent's gates cover the member's. A `WorkItem.baseFiles` map (path → content hash) recorded by `crew start` narrows an item's change to what differs from the proven state it started on. The eval runner is a Bun script beside `scripts/eval-overhead.ts`, with a pure, tested function that builds PATH and arguments. The bundle is rebuilt (`bun run build`) whenever the engine changes; the hooks run the bundle, not the source.

**Tech Stack:** TypeScript, Bun (tests, bundling, scripts), Biome; Node 20+ runs the bundle. `claude plugin eval` for the suite, `claude plugin validate --strict` and `claude plugin test` for the plugin.

**Spec:** `docs/specs/2026-10-06-sp1-engine-and-base-method-design.md` (sections 6, 8, 12), the open items in `docs/plans/2026-10-07-sp1a-e2e-results.md` (lines 178, 258, 280-284) and `docs/evals/2026-10-12-sp1b-results.md` (Follow-ups 4).

## Global Constraints

- Imports carry an explicit `.ts` extension; lint and format with Biome (`bun run format`); `bun run check` green before every commit.
- Files under `.crew/` and `~/.wizardingcode/crew` are written only by the `crew` command. Never edit them; the hook denies it.
- Hooks fail open: a hook that cannot decide answers `{}`.
- Repository documents in English. Comments explain why, not what.
- Commit messages: subject and optional body, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- The plugin folder keeps built files only; `plugins/core/dist/crew.mjs` is committed and must be rebuilt after every engine change (`bun run build`).
- Never reintroduce the old brand names.

## Review Focus

1. **A workspace member that defines its own test script** must still plan and run its own `test`; only the gates it does not define are covered by the parent. Pinned in Task 1's gates test.
2. **A workspace root with no test script of its own** is still reported as missing a test command (the member's script does not cover the root). Pinned in Task 1's detect test.
3. **A user who changed the watch list** must keep it on `crew detect --refresh`; only a list identical to the earlier default is upgraded. Pinned in Task 2.
4. **A file in `baseFiles` that is edited again or deleted** becomes the new item's change (its hash no longer matches). Pinned in Task 3's fingerprint test.
5. **A redirect into an engine file that also silences stderr** (`echo x > .crew/profile.json 2>/dev/null`) stays denied. Pinned in Task 4.

---

## File structure

```
packages/engine/src/types.ts                 Modify: Target.workspaceOf, WorkItem.baseFiles
packages/engine/src/detect/types.ts          Modify: DetectedTarget.workspaces
packages/engine/src/detect/node.ts           Modify: read package.json "workspaces"
packages/engine/src/detect/index.ts          Modify: link members to their parent; .claude/** default; upgrade of a former default list; coverage in missingTestCommands
packages/engine/src/gates.ts                 Modify: plannedGates skips a member's undefined gates; ChangeBase at the call sites
packages/engine/src/fingerprint.ts           Modify: ChangeBase, ownChanges, hashPaths
packages/engine/src/work.ts                  Modify: createWork takes baseFiles
packages/engine/src/tdd.ts                   Modify: pass the work item as base
packages/engine/src/hooks/session-start.ts   Modify: pass the work item as base
packages/engine/src/hooks/stop.ts            Modify: pass the work item as base
packages/engine/src/hooks/pre-tool-use.ts    Modify: WRITE_SHAPE redirect targets an engine file
packages/engine/src/cli.ts                   Modify: start snapshots the previous proven item; detect prints "workspace of"
packages/engine/tests/detect-profile.test.ts Modify: workspace coverage, .claude default, upgrade of a former default
packages/engine/tests/gates.test.ts          Modify: a member plans only what it defines
packages/engine/tests/fingerprint.test.ts    Modify: base objects; base files; .claude not watched
packages/engine/tests/cli.test.ts            Modify: a new item after a proven uncommitted one
packages/engine/tests/hooks-pre-tool-use.test.ts  Modify: 2>/dev/null allowed, redirect into engine file denied
packages/engine/tests/eval-runner.test.ts    Create: PATH and arguments of the eval runner
scripts/eval.ts                              Create: the eval runner
package.json                                 Modify: "eval" script
plugins/core/evals/README.md                 Modify: run with the script
plugins/core/dist/crew.mjs                   Rebuilt
docs/specs/2026-10-06-sp1-engine-and-base-method-design.md  Modify: watch default, base files (section 6)
docs/plans/2026-10-07-sp1a-e2e-results.md    Modify: interactive check section; items closed
docs/evals/2026-10-12-sp1b-results.md        Modify: follow-up 4 closed
docs/plans/2026-10-12-sp1c-loose-ends.md     Create: this plan
CLAUDE.md, README.md                         Modify: the eval command; what 0.1.1 changed
```

---

### Task 0: Open the work item and make `packages/engine` provable now

The engine cannot prove a change under `packages/engine/` until Task 1 ships, because `test (packages/engine)` has no command. A proposed and confirmed command bridges the gap; after Task 1, `crew detect --refresh` keeps it (confirmed commands survive re-detection), so `bun test` also runs inside the package, a few seconds more per gate run.

- [ ] **Step 1: Save this plan in the repository**

Copy this file to `docs/plans/2026-10-12-sp1c-loose-ends.md` (docs are not watched; no work item needed).

- [ ] **Step 2: Propose the member's test command; the user confirms**

```bash
node plugins/core/dist/crew.mjs profile set test "bun test" --target packages/engine
node plugins/core/dist/crew.mjs profile confirm test   # raises the permission prompt: the user's signature
```

- [ ] **Step 3: Start the work item (standard route: scope 2, clear request, no risk area)**

```bash
node plugins/core/dist/crew.mjs start "Close the SP1 loose ends: workspace coverage, .claude/** unwatched, base from the previous proven item, hook redirect false positive, eval runner" --answers '{"work_type":"fix","is_vague":0.1,"scope":2,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}'
```

Then, following the crew skill's references for Understand and Specify: state the assumptions (this plan's Context) and ask the user to confirm them (`crew await <id> user`), write `spec.md` from this plan, and add the criteria:

```bash
crew criteria <id> add "In a workspace, a member package without a test script is covered by the package that lists it: crew detect reports no missing test command for it and its undefined gates are not planned separately"
crew criteria <id> add ".claude/** is excluded from the watch list by default, and crew detect --refresh upgrades a profile whose list is still the earlier default while keeping a list the user changed"
crew criteria <id> add "A work item started after a proven, uncommitted item has no change of its own until one of those files changes again"
crew criteria <id> add "A Bash read of an engine file with stderr redirected (2>/dev/null, 2>&1) is allowed; a redirect into an engine file is still denied"
crew criteria <id> add "bun scripts/eval.ts [--case <name>] runs the eval suite with the plugin's bin and, on macOS, the real git first on PATH"
crew phase <id> next   # through plan into build
```

Every engine task below records its red and green: `crew tdd red <id> AC-n -- "bun test <test file>"` with the test written and the code absent, then `crew tdd green <id> AC-n -- "bun test <test file>"`.

---

### Task 1: A workspace member is covered by the package that lists it (AC-1)

**Files:**
- Modify: `packages/engine/src/types.ts` (`Target`), `packages/engine/src/detect/types.ts`, `packages/engine/src/detect/node.ts`, `packages/engine/src/detect/index.ts`, `packages/engine/src/gates.ts:137-160`, `packages/engine/src/cli.ts:305-312`
- Test: `packages/engine/tests/detect-profile.test.ts`, `packages/engine/tests/gates.test.ts`

**Interfaces:**
- Produces: `Target.workspaceOf?: string` (the path of the target whose manifest lists this folder); `DetectedTarget.workspaces?: string[]` (globs relative to the manifest's folder); `missingTestCommands` treats a member as covered when its parent has `test`; `plannedGates` plans, for a member, only the gates the member defines itself.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/tests/detect-profile.test.ts`:

```ts
test("a workspace member without scripts is covered by the package that lists it", () => {
  const dir = tempDir();
  write(
    dir,
    "package.json",
    JSON.stringify({ workspaces: ["packages/*"], scripts: { test: "bun test packages" } }),
  );
  write(dir, "bun.lock", "");
  write(dir, "packages/engine/package.json", JSON.stringify({ name: "engine" }));
  write(dir, "packages/web/package.json", JSON.stringify({ scripts: { test: "vitest" } }));
  const profile = detectProfile(dir);
  const byPath = Object.fromEntries(profile.targets.map((t) => [t.path, t]));
  expect(byPath["packages/engine"]?.workspaceOf).toBe(".");
  expect(byPath["packages/web"]?.workspaceOf).toBe(".");
  expect(byPath["."]?.workspaceOf).toBeUndefined();
  expect(missingTestCommands(profile)).toEqual([]);
});

test("a workspace root without a test script is still missing one; its members do not cover it", () => {
  const dir = tempDir();
  write(dir, "package.json", JSON.stringify({ workspaces: { packages: ["packages/*"] } }));
  write(dir, "packages/web/package.json", JSON.stringify({ scripts: { test: "vitest" } }));
  expect(missingTestCommands(detectProfile(dir))).toEqual([{ target: ".", gate: "test" }]);
});
```

In `packages/engine/tests/gates.test.ts`, after "planned gates follow the route table":

```ts
test("a workspace member plans only the gates it defines; the rest run once, at the package that lists it", () => {
  const rootTarget: Target = {
    ...target,
    gates: { test: { command: "bun test packages", source: "detected" }, lint: { command: "l", source: "detected" } },
  };
  const profile = {
    version: 1 as const,
    detectedAt: "",
    targets: [
      rootTarget,
      { ...target, path: "packages/engine", gates: {}, workspaceOf: "." },
      { ...target, path: "packages/web", gates: { test: { command: "vitest", source: "detected" } }, workspaceOf: "." },
    ],
    watch: { exclude: [] },
  };
  const changed = ["packages/engine/src/a.ts", "packages/web/src/b.ts"];
  expect(plannedGates("fast", profile, DEFAULT_POLICY, changed, tempDir())).toEqual([
    { gate: "secrets", target: "." },
    { gate: "test", target: "." },
    { gate: "lint", target: "." },
    { gate: "test", target: "packages/web" },
  ]);
});
```

- [ ] **Step 2: Run them, see them fail**

Run: `crew tdd red <id> AC-1 -- "bun test packages/engine/tests/detect-profile.test.ts packages/engine/tests/gates.test.ts"`
Expected: FAIL (`workspaceOf` undefined; `missingTestCommands` reports `packages/engine`; `test@packages/engine` planned).

- [ ] **Step 3: Implement**

`packages/engine/src/types.ts`, in `Target`:

```ts
  timeoutMs: number;
  /** The target whose manifest lists this folder as a workspace; its gates cover the ones this target does not define. */
  workspaceOf?: string;
```

`packages/engine/src/detect/types.ts`:

```ts
export interface DetectedTarget {
  stack: Stack;
  packageManager: string;
  gates: Partial<Record<GateName, string>>;
  /** Globs of the folders this manifest lists as workspaces, relative to its folder. */
  workspaces?: string[];
}
```

`packages/engine/src/detect/node.ts`:

```ts
interface PackageJson {
  scripts?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
}

/** npm, yarn and bun list workspaces as an array; yarn also accepts an object with `packages`. */
function workspaceGlobs(pkg: PackageJson): string[] {
  const raw = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
  return (raw ?? [])
    .filter((glob): glob is string => typeof glob === "string")
    .map((glob) => glob.replace(/^\.\//, "").replace(/\/$/, ""));
}
```

and at the end of `detect`:

```ts
    const workspaces = workspaceGlobs(pkg);
    return { stack: "node", packageManager: manager, gates, ...(workspaces.length ? { workspaces } : {}) };
```

`packages/engine/src/detect/index.ts`, `detectTargets`: keep each target's globs while looping, then link:

```ts
export function detectTargets(root: string): Target[] {
  const targets: Target[] = [];
  const workspaces = new Map<Target, string[]>();
  for (const dir of folders(root)) {
    for (const detector of DETECTORS) {
      const found = detector.detect(dir);
      if (!found) continue;
      const gates: Target["gates"] = {};
      for (const [gate, command] of Object.entries(found.gates) as [GateName, string][]) {
        gates[gate] = { command, source: "detected" };
      }
      const rel = relative(root, dir).replace(/\\/g, "/");
      const target: Target = {
        path: rel === "" ? "." : rel,
        stack: found.stack,
        packageManager: found.packageManager,
        gates,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      };
      targets.push(target);
      if (found.workspaces) workspaces.set(target, found.workspaces);
    }
  }
  // A member runs under the package that lists it, so that package's gates cover what the member leaves undefined.
  for (const [parent, globs] of workspaces) {
    const prefix = parent.path === "." ? "" : `${parent.path}/`;
    for (const child of targets) {
      if (child === parent || child.stack !== parent.stack || !child.path.startsWith(prefix)) continue;
      if (matchesAny(child.path.slice(prefix.length), globs)) child.workspaceOf = parent.path;
    }
  }
  return targets;
}
```

(import `matchesAny` from `../glob.ts`.) `missingTestCommands`:

```ts
export function missingTestCommands(profile: Profile): MissingCommand[] {
  if (profile.targets.length === 0) return [{ target: ".", gate: "test" }];
  const byPath = new Map(profile.targets.map((t) => [t.path, t]));
  const hasTest = (t: Target): boolean =>
    !!t.gates.test || (t.workspaceOf !== undefined && !!byPath.get(t.workspaceOf)?.gates.test);
  const covered = new Set(profile.targets.filter(hasTest).map((t) => t.path));
  const paths = [...new Set(profile.targets.map((t) => t.path))];
  return paths.filter((p) => !covered.has(p)).map((target) => ({ target, gate: "test" }));
}
```

`packages/engine/src/gates.ts`, `plannedGates`, inside the `touched` loop:

```ts
  for (const target of touched) {
    const member =
      target.workspaceOf !== undefined && profile.targets.some((t) => t.path === target.workspaceOf);
    for (const gate of gatesForTarget(route, target, policy, changed)) {
      // A workspace member runs only the gates it defines; the package that lists it runs the rest once.
      if (member && !target.gates[gate]) continue;
      if (gate === "deps" && route === "standard" && "reason" in depsAuditCommand(target, root))
        continue;
      planned.push({ gate, target: target.path });
    }
  }
```

`packages/engine/src/cli.ts`, the `detect` line: `${t.path} (${t.stack}, ${t.packageManager}${t.workspaceOf ? `, workspace of ${t.workspaceOf}` : ""}): …`.

- [ ] **Step 4: Run the tests, see them pass; the whole suite too**

Run: `crew tdd green <id> AC-1 -- "bun test packages/engine/tests/detect-profile.test.ts packages/engine/tests/gates.test.ts"`, then `bun run check`.

- [ ] **Step 5: Rebuild, refresh this repository's profile, commit**

```bash
bun run build
node plugins/core/dist/crew.mjs detect --refresh   # packages/engine now shows "workspace of ."
git add -A && git commit -m "A workspace member is covered by the package that lists it"
```

---

### Task 2: `.claude/**` is not watched by default; a former default list is upgraded (AC-2)

**Files:**
- Modify: `packages/engine/src/detect/index.ts:12,77`, `docs/specs/2026-10-06-sp1-engine-and-base-method-design.md:168`
- Test: `packages/engine/tests/detect-profile.test.ts:24`, `packages/engine/tests/fingerprint.test.ts:27-37`

- [ ] **Step 1: Write the failing tests**

Change the expectation at `detect-profile.test.ts:24` to `["**/*.md", "docs/**", ".crew/**", ".claude/**"]` and add:

```ts
test("re-detection upgrades a watch list that is still an earlier default and keeps one the user changed", () => {
  const dir = monorepo();
  const stale: Profile = { ...detectProfile(dir), watch: { exclude: ["**/*.md", "docs/**", ".crew/**"] } };
  expect(detectProfile(dir, stale).watch.exclude).toEqual(DEFAULT_WATCH_EXCLUDE);
  const custom: Profile = { ...detectProfile(dir), watch: { exclude: ["**/*.md", "generated/**"] } };
  expect(detectProfile(dir, custom).watch.exclude).toEqual(["**/*.md", "generated/**"]);
});
```

In `fingerprint.test.ts`, in "markdown and docs are not watched; untracked source files are", after `write(root, "docs/guide.txt", "notes");` add `write(root, ".claude/settings.json", "{}");` (the two `toEqual([])` / `toBe(before)` assertions then cover it). `detect-profile.test.ts` imports `DEFAULT_WATCH_EXCLUDE` from `../src/detect/index.ts`.

- [ ] **Step 2: See them fail**

Run: `crew tdd red <id> AC-2 -- "bun test packages/engine/tests/detect-profile.test.ts packages/engine/tests/fingerprint.test.ts"`

- [ ] **Step 3: Implement**

```ts
export const DEFAULT_WATCH_EXCLUDE = ["**/*.md", "docs/**", ".crew/**", ".claude/**"];
/** Defaults of earlier releases. A saved list equal to one of them was never the user's choice, so it follows the current default. */
const FORMER_WATCH_EXCLUDES: readonly string[][] = [["**/*.md", "docs/**", ".crew/**"]];

function watchOf(previous: Profile | null): Profile["watch"] {
  if (!previous) return { exclude: [...DEFAULT_WATCH_EXCLUDE] };
  const saved = JSON.stringify(previous.watch.exclude);
  const former = FORMER_WATCH_EXCLUDES.some((list) => JSON.stringify(list) === saved);
  return former ? { exclude: [...DEFAULT_WATCH_EXCLUDE] } : previous.watch;
}
```

and in `mergeProfile`: `watch: watchOf(previous),`. Spec line 168: add `.claude/**` to the list and one sentence: "A profile whose list is still an earlier default follows the current one on `crew detect --refresh`."

- [ ] **Step 4: Green, check, build, refresh, commit**

`crew tdd green <id> AC-2 -- "…"`, `bun run check`, `bun run build`, `node plugins/core/dist/crew.mjs detect --refresh` (this repository's profile still has the old default and is upgraded), commit: "The agent's own configuration is not source: .claude/** unwatched by default".

---

### Task 3: A Bash read with stderr redirected is not a write (AC-4)

**Files:**
- Modify: `packages/engine/src/hooks/pre-tool-use.ts:14-15`
- Test: `packages/engine/tests/hooks-pre-tool-use.test.ts:59-88`

- [ ] **Step 1: Write the failing assertions** (in the existing "bash:" test, next to `cat .crew/profile.json`)

```ts
  expect(bash("cat .crew/profile.json 2>/dev/null")).toEqual({});
  expect(bash("cat .crew/profile.json 2>&1")).toEqual({});
  expect(bash("cat .crew/work/w1/report.md > /tmp/report.md")).toEqual({});
  expect(decision(bash("echo x > .crew/profile.json 2>/dev/null"))).toBe("deny");
  expect(decision(bash('cat x >> ".crew/work/w1/work.json"'))).toBe("deny");
  expect(decision(bash("echo x > ~/.wizardingcode/crew/integrity/x"))).toBe("deny");
```

- [ ] **Step 2: See them fail**: `crew tdd red <id> AC-4 -- "bun test packages/engine/tests/hooks-pre-tool-use.test.ts"`

- [ ] **Step 3: Implement**

```ts
// A redirect is a write only when its target is an engine file: the `2>` of `2>/dev/null` after a read is not.
const WRITE_SHAPE =
  /(?:^|[\s;&|(])(?:rm|mv|cp|tee|truncate|chmod|touch|dd|install)\b|sed\s+-i|>{1,2}\s*["']?\S*(?:\.crew\/|\.wizardingcode\/crew\b)/;
```

- [ ] **Step 4: Green, check, build, commit**: "A read of an engine file with stderr silenced is not a write".

---

### Task 4: A new item starts from the previous item's proven state (AC-3)

**Files:**
- Modify: `packages/engine/src/types.ts` (`WorkItem`), `packages/engine/src/fingerprint.ts:125-184`, `packages/engine/src/work.ts:54-83`, `packages/engine/src/gates.ts:249-263,325-341`, `packages/engine/src/tdd.ts:106`, `packages/engine/src/hooks/session-start.ts:22-28`, `packages/engine/src/hooks/stop.ts:19`, `packages/engine/src/cli.ts:395-426`, spec section 6
- Test: `packages/engine/tests/fingerprint.test.ts`, `packages/engine/tests/cli.test.ts`

**Interfaces:**
- Produces: `WorkItem.baseFiles?: Record<string, string>`; `export type ChangeBase = Pick<WorkItem, "baseCommit" | "baseFiles">`; `changedWatchedPaths(root, profile, base?: ChangeBase | null, maxFiles?)`; `computeFingerprint(root, profile, base?: ChangeBase | null, maxFiles?, method?)`; `hashPaths(root, paths): Record<string, string>`; `createWork(paths, input, baseFiles?)`.
- Consumes nothing from the other tasks.

- [ ] **Step 1: Write the failing tests**

`fingerprint.test.ts`: in "I1: from a base commit…", `base` becomes `{ baseCommit: git(root, "rev-parse", "HEAD") }` (four call sites); add:

```ts
test("the proven files of an earlier item are not the next item's change until they change again", () => {
  const root = makeRepo({ "src/a.ts": "x", "src/b.ts": "y" });
  const profile = detectProfile(root);
  const baseCommit = git(root, "rev-parse", "HEAD");
  write(root, "src/a.ts", "proven by the first item");
  const base = { baseCommit, baseFiles: hashPaths(root, ["src/a.ts"]) };
  expect(changedWatchedPaths(root, profile, base)).toEqual([]);
  const clean = computeFingerprint(root, profile, base);
  write(root, "src/b.ts", "the second item's work");
  expect(changedWatchedPaths(root, profile, base)).toEqual(["src/b.ts"]);
  expect(computeFingerprint(root, profile, base)).not.toBe(clean);
  write(root, "src/a.ts", "touched again by the second item");
  expect(changedWatchedPaths(root, profile, base)).toEqual(["src/a.ts", "src/b.ts"]);
  rmSync(join(root, "src/a.ts"));
  expect(changedWatchedPaths(root, profile, base)).toEqual(["src/a.ts", "src/b.ts"]);
});
```

`cli.test.ts`:

```ts
test("a new item after a proven, uncommitted one starts with no change of its own", async () => {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  const c = io(root);
  const first = (await c.json("start", "First", "--answers", answers, "--criterion", "a")).data
    .id as string;
  write(root, "src/a.ts", "the first item's work");
  expect((await c.run("tdd", "red", first, "AC-1", "--", "exit 1")).code).toBe(0);
  expect((await c.run("tdd", "green", first, "AC-1", "--", "exit 0")).code).toBe(0);
  expect((await c.json("gate", "run", first)).data.verdict).toBe("proven");
  const second = await c.json("start", "Second", "--answers", answers, "--criterion", "b");
  expect(second.data.replaced).toBeNull();
  expect(second.data.inherited).toEqual([]);
  expect(second.data.proven).toEqual({ of: first, paths: ["src/a.ts"] });
  const status = await c.json("status");
  // Nothing of the second item's own has changed: only its own gates stand between it and proven.
  expect(status.data.unproven).toEqual([
    "gates have not run",
    "test-first record missing for AC-1",
  ]);
  write(root, "src/a.ts", "the second item touches it too");
  expect((await c.json("status")).data.unproven).toContain("gates have not run");
});
```

Check the exact `unproven` list in the existing fast-route test and mirror its wording if it differs. New imports: `rmSync` from `node:fs` and `hashPaths` from `../src/fingerprint.ts` in `fingerprint.test.ts`.

- [ ] **Step 2: See them fail**: `crew tdd red <id> AC-3 -- "bun test packages/engine/tests/fingerprint.test.ts packages/engine/tests/cli.test.ts"`

- [ ] **Step 3: Implement**

`types.ts`, `WorkItem`:

```ts
  baseCommit: string | null;
  /** Content hashes of the watched paths that already differed from baseCommit when the item started, the proven work of an earlier item left uncommitted. A path whose content still matches is not this item's change. */
  baseFiles?: Record<string, string>;
```

`fingerprint.ts`:

```ts
/** What a work item's change is measured from: a commit, and the proven files of an earlier item that were still uncommitted. */
export type ChangeBase = Pick<WorkItem, "baseCommit" | "baseFiles">;

/** The content hashes of these paths now; a missing file hashes as DELETED. */
export function hashPaths(root: string, paths: string[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const path of paths) hashes[path] = hashFile(join(root, path));
  return hashes;
}

/** Drops the paths whose content is still what an earlier item proved. */
function ownChanges(root: string, paths: string[], base?: ChangeBase | null): string[] {
  const files = base?.baseFiles;
  if (!files) return paths;
  return paths.filter((path) => files[path] === undefined || hashFile(join(root, path)) !== files[path]);
}
```

`changedWatchedPaths` and `computeFingerprint` take `base?: ChangeBase | null`; `const commit = base?.baseCommit ?? null;` replaces the string `base` in both; the git branch of each filters through `ownChanges(root, …, base)`; the `base:` part of the fingerprint uses `commit ?? gitHead(root)`. (`hashFile` moves above its first use.)

`work.ts`: `createWork(paths, input, baseFiles?: Record<string, string>)` sets `...(baseFiles && Object.keys(baseFiles).length > 0 ? { baseFiles } : {})` after `baseCommit`.

Call sites: `gates.ts` drops `const base = …` and passes `work` to `changedWatchedPaths` and `computeFingerprint` (secrets keep `work.baseCommit`); `tdd.ts:106` passes `work`; `session-start.ts` passes `work` (nullable) instead of `base`; `stop.ts` passes `work`.

`cli.ts`, `start`:

```ts
      const previous = activeWork(env.paths);
      const previousProven =
        !!previous?.work &&
        assess(env.paths, previous.work, env.profile, env.policy, env.tampered || previous.tampered)
          .verdict === "proven";
      const warning =
        previous?.work && !previousProven
          ? `warning: ${previous.work.id} is not proven and is no longer the active work item\n`
          : "";
      // The change is measured from HEAD; what is uncommitted now is measured with it, unless an
      // earlier item proved it, in which case the new item starts from that proven state.
      const uncommitted = isGitRepo(env.paths.root)
        ? changedWatchedPaths(env.paths.root, env.profile)
        : [];
      const baseFiles = previousProven ? hashPaths(env.paths.root, uncommitted) : {};
      const inherited = previousProven ? [] : uncommitted;
      const inheritedWarning = inherited.length
        ? `warning: uncommitted changes in ${inherited.join(", ")} count as this item's change; commit them first if they are not\n`
        : "";
      const provenNote =
        previousProven && uncommitted.length && previous?.work
          ? `note: uncommitted changes in ${uncommitted.join(", ")} are ${previous.work.id}'s proven work and not this item's\n`
          : "";
      const work = createWork(env.paths, input, baseFiles);
```

The message prefixes become `${warning}${inheritedWarning}${provenNote}started …`, and the JSON gains `proven: previousProven && previous?.work ? { of: previous.work.id, paths: uncommitted } : null`. `cli.ts` imports `hashPaths` and `isGitRepo` from `./fingerprint.ts`.

Spec section 6, after the fingerprint paragraph (line 170): "When an item starts while the previous item is proven and its work uncommitted, the new item records the content hashes of those paths (`baseFiles`); a path whose content still matches is not the new item's change. An unproven previous item gets no such courtesy: its changes are measured as the new item's, with a warning."

- [ ] **Step 4: Green, check, build, commit**: "A new item starts from the previous item's proven state".

---

### Task 5: The eval suite runs from one command (AC-5)

**Files:**
- Create: `scripts/eval.ts`, `packages/engine/tests/eval-runner.test.ts`
- Modify: `package.json` (scripts), `plugins/core/evals/README.md:10-31`, `CLAUDE.md` (Commands), `docs/evals/2026-10-12-sp1b-results.md:89`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "bun:test";
import { delimiter } from "node:path";
import { evalInvocation } from "../../../scripts/eval.ts";

const base = { root: "/r", path: "/usr/bin", realGitDir: null, platform: "linux" as const };

test("the eval PATH puts the plugin's bin first and, on macOS, the real git next", () => {
  const mac = evalInvocation({ ...base, platform: "darwin", realGitDir: "/Library/Developer/CommandLineTools/usr/bin" });
  expect(mac.path.split(delimiter)).toEqual([
    "/r/plugins/core/bin",
    "/Library/Developer/CommandLineTools/usr/bin",
    "/usr/bin",
  ]);
  expect(evalInvocation(base).path.split(delimiter)).toEqual(["/r/plugins/core/bin", "/usr/bin"]);
});

test("the suite runs with the judge and the reports; one case runs once, without a baseline or judge", () => {
  const suite = evalInvocation(base).args;
  expect(suite.slice(0, 3)).toEqual(["plugin", "eval", "plugins/core"]);
  expect(suite.join(" ")).toContain("--judge-model claude-fable-5-1");
  expect(suite.join(" ")).toContain("--json plugins/core/evals/results/last.json");
  const one = evalInvocation({ ...base, caseName: "false-done" }).args;
  expect(one.join(" ")).toContain("--case false-done --runs 1 --ablation none");
  expect(one).not.toContain("--judge-model");
  expect(one.slice(one.indexOf("--allow-tools"))).toContain("Bash(crew *)");
});
```

- [ ] **Step 2: See it fail**: `crew tdd red <id> AC-5 -- "bun test packages/engine/tests/eval-runner.test.ts"` (module not found).

- [ ] **Step 3: Implement `scripts/eval.ts`**

```ts
// Runs the plugin's eval suite with the PATH an eval needs (plugins/core/evals/README.md): the plugin's
// bin/ first, because `crew` is not on the Bash tool's PATH inside an eval, and on macOS the real git,
// because the /usr/bin shim cannot write its xcrun cache inside the eval sandbox.
import { spawnSync } from "node:child_process";
import { delimiter, dirname, join } from "node:path";

export interface EvalOptions {
  root: string;
  platform: NodeJS.Platform;
  path: string;
  realGitDir: string | null;
  caseName?: string;
}

const ALLOW_TOOLS = ["Write", "Edit", "Bash(crew *)", "Bash(node *)", "Bash(npm *)", "Bash(git *)", "Bash(cat *)", "Bash(ls *)", "Bash(sh *)", "Bash(make *)", "Bash(sed *)", "Bash(head *)", "Bash(echo *)", "Bash(which *)"];
const COMMON = ["plugin", "eval", "plugins/core", "--scaffold", "--trust-plugin", "--no-publish", "--model", "claude-sonnet-5-5"];

export function evalInvocation(options: EvalOptions): { path: string; args: string[] } {
  const entries = [join(options.root, "plugins/core/bin")];
  if (options.realGitDir) entries.push(options.realGitDir);
  if (options.path) entries.push(options.path);
  const args = options.caseName
    ? [...COMMON, "--case", options.caseName, "--runs", "1", "--ablation", "none", "--max-cost-usd", "5"]
    : [...COMMON, "--keep-temp", "--judge-model", "claude-fable-5-1", "--max-cost-usd", "40", "--concurrency", "3", "--report", "plugins/core/evals/results/report.html", "--json", "plugins/core/evals/results/last.json"];
  return { path: entries.join(delimiter), args: [...args, "--allow-tools", ...ALLOW_TOOLS] };
}

/** Where the real git lives on macOS, as xcrun reports it; null elsewhere. Fails rather than run the suite on the shim. */
export function realGitDir(platform: NodeJS.Platform): string | null {
  if (platform !== "darwin") return null;
  const found = spawnSync("xcrun", ["--find", "git"], { encoding: "utf8" });
  const file = found.stdout?.trim();
  if (found.status !== 0 || !file) throw new Error(`xcrun --find git failed: ${found.stderr?.trim() ?? ""}`);
  return dirname(file);
}

if (import.meta.main) {
  const [flag, name] = process.argv.slice(2);
  if ((flag !== undefined && flag !== "--case") || (flag === "--case" && !name)) {
    console.error("usage: bun scripts/eval.ts [--case <name>]");
    process.exit(1);
  }
  const { path, args } = evalInvocation({
    root: join(import.meta.dir, ".."),
    platform: process.platform,
    path: process.env.PATH ?? "",
    realGitDir: realGitDir(process.platform),
    caseName: name,
  });
  console.log(`claude ${args.join(" ")}`);
  const run = spawnSync("claude", args, { stdio: "inherit", env: { ...process.env, PATH: path } });
  process.exit(run.status ?? 1);
}
```

`package.json`: `"eval": "bun scripts/eval.ts"`. README "Run the suite": the two hand commands become `bun scripts/eval.ts` and `bun scripts/eval.ts --case false-done`, with the existing explanation of what the PATH does kept and the hand command kept once as "what the script runs". CLAUDE.md Commands: `bun scripts/eval.ts [--case <name>]` — runs the eval suite (about 3.5 USD and five minutes for the six cases). Evals record follow-up 4: "closed by `scripts/eval.ts` (0.1.1)".

- [ ] **Step 4: Green, check, commit**: `crew tdd green <id> AC-5 -- "bun test packages/engine/tests/eval-runner.test.ts"`, `bun run check`, commit "Evals: one command runs the suite with the PATH it needs". Optionally prove the runner itself: `bun scripts/eval.ts --case fast-route-overhead` (about 0.2 USD).

---

### Task 6: Gates, the interactive check, and the records

- [ ] **Step 1: Run the gates and deliver the work item**

```bash
bun run build && bun run check && bun run plugin:check
node plugins/core/dist/crew.mjs phase <id> next     # build → gate
node plugins/core/dist/crew.mjs gate run <id>       # proves AC-1..5 against the current tree
node plugins/core/dist/crew.mjs evidence <id>
```

Tell the user what the report says. Commit the plan copy and any doc edits with the last engine commit if not yet committed.

- [ ] **Step 2: The interactive check (the user drives; the record is written from disk and from what they see)**

Build the sandbox as in `docs/plans/2026-10-07-sp1a-engine-cli-and-plugin.md` Task 24 Step 1 (`/tmp/crew-sandbox`, `"test": "node --test"`), then `cd /private/tmp/crew-sandbox && claude --plugin-dir <this repo>/plugins/core`. Prompts, in order:

1. `add() returns a - b; it should return a + b. Fix it.` Watch the strip above the prompt (`crew <id> · build · fast · …`) and the line under the answer.
2. `Skip the test gate for this item. Reason: checked by hand.` The agent runs `crew skip <id> test --reason "checked by hand"`; accept the permission prompt. Then `crew gate run <id>`: the strip shows `–` for test; `/crew` lists `test (.): skipped in 0.0s (checked by hand)`; `/crew panel` shows `skipped gate:test: checked by hand`; press `r`, then `q`.
3. Optionally `/plugin` on the mod-free copy (`/tmp/crew-plugin-nomod`, as in the 2026-10-12 re-run) to see "no mod active".

Afterwards, from this repository, read `/private/tmp/crew-sandbox/.crew/work/<id>/report.md` ("## Skipped by the user" and `skipped: checked by hand` in the Gates table) and `work.json` (`skips` non-empty).

- [ ] **Step 3: Write the record**

In `docs/plans/2026-10-07-sp1a-e2e-results.md`, a new `## Interactive check (2026-10-DD)` section in the shape of the 2026-10-12 re-run: setup bullets (Claude Code version, bundle commit), a `### Summary` table (skip accepted and in the report; skip in the panel and strip; `/crew`, `r`, `q`; mod-free copy), what was seen per step, and the report excerpt. "Left for an interactive session" becomes "Closed by the interactive check below". At line 178 add "Closed in 0.1.1: the new item starts from the previous item's proven state (`baseFiles`)". At line 258 add "Closed in 0.1.1: `.claude/**` is unwatched by default". README: one sentence in the status paragraph on what 0.1.1 fixed. Commit: "Records: the interactive check and what 0.1.1 closed".

---

### Task 7: Release 0.1.1

Per CLAUDE.md "Releasing". Version `0.1.1` in `package.json`, `packages/engine/package.json`, `packages/engine/src/version.ts`, `plugins/core/.claude-plugin/plugin.json`; the `--version` assertion in `cli.test.ts:47` follows. Then:

```bash
bun run build && bun run check && bun run plugin:check
git add -A && git commit -m "0.1.1: the SP1 loose ends closed"
git tag -a v0.1.1 -m "0.1.1" && git push && git push --tags      # when the user says so
gh release create v0.1.1 --title "0.1.1" --notes "<the five changes, one line each>"
```

In the marketplace repository `WizardingCode-io/wizardingcode-plugins`: the entry's `version` and `ref: v0.1.1` and `metadata.version`, committed as `wizardingcode-developer-crew 0.1.1`. Then `claude plugin update wizardingcode-developer-crew` at user scope and a `crew --version` check.

---

## Verification

- `bun run check` green after every task; `bun run plugin:check` after the build.
- The work item's report (`crew evidence <id>`) says proven, with AC-1 to AC-5 "red then green" and every gate passed on the current fingerprint.
- In this repository after Task 1: `node plugins/core/dist/crew.mjs detect` prints `packages/engine (node, npm, workspace of .)` and no "No test command" line; a session start no longer carries the "No test command is known for: packages/engine" notice.
- After Task 2: `.crew/profile.json` (read through `crew detect --json`) lists `.claude/**`; creating `.claude/settings.json` in the sandbox does not make a proven item unproven.
- After Task 4, in the sandbox: a proven fast-route item, then `crew start` of a second item prints the `note:` line and `crew status --json` has no "code changed since the last gate run".
- After Task 5: `bun scripts/eval.ts --case fast-route-overhead` runs and scores (optional, about 0.2 USD).
- The E2E record's "Left for an interactive session" is closed by the new section.

## Out of scope, on purpose

- The fast-route overhead (1.7–1.9×): what is left to take out is the skill's own load; a method question for SP2's iteration.
- A CLI to edit the watch list (`crew profile watch …`): the default change plus the upgrade rule cover the known need; a hand edit followed by `crew accept profile` remains the way.
- A workspace root without a test script whose members all have one: still reported as missing; the user proposes a root command.
