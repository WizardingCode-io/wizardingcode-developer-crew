# SP1a: Engine, CLI and Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the `crew` engine as an installable Claude Code plugin that detects a project, keeps the state of a piece of work, proves test-first, runs deterministic gates, writes evidence, and blocks "done" through hooks until the work is proven.

**Architecture:** A dependency-free TypeScript library (`packages/engine`) holds every decision: detection, state, fingerprints, gates, evidence and the logic behind each hook. A thin CLI (`crew`) exposes it, and Claude Code reaches it through `hooks/hooks.json` (exec form, `node` plus the bundled file) and `bin/crew` on the Bash tool's PATH. One skill teaches the agent the method. The plugin folder `plugins/core` contains only built files.

**Tech Stack:** TypeScript (strict, ESM), Bun 1.3+ for tests and bundling, Biome for lint and format, Node 20+ as the runtime of the bundle. No runtime dependencies.

**Spec:** `docs/specs/2026-10-06-sp1-engine-and-base-method-design.md`. This plan covers spec sections 5 to 15, 17 and 18. The mod (section 16) and the evals (section 19) are the second plan, `SP1b`, written after this one ships.

## Global Constraints

- The bundle runs on **Node 20 or later**; nothing in `packages/engine/src` may import a dependency outside `node:*`.
- Development toolchain: **Bun** (`bun test`, `Bun.build`), **Biome** (`biome check .`), **TypeScript strict** with `verbatimModuleSyntax` (use `import type`). Source imports use explicit `.ts` extensions.
- The installed plugin is `plugins/core` and contains **built files only**: no `node_modules`, no `package.json`, under **2 MB**.
- The command is `crew`; project state lives in `.crew/`; user state lives in `~/.shibaox/crew/` (`SHIBAOX_HOME` overrides `~/.shibaox`).
- Plugin name `shibaox-developer-crew`, version `0.1.0`, license MIT, author WizardingCode.
- Hooks answer with JSON on stdout and **exit 0**; a hook that cannot decide answers `{}`. A hook never throws.
- Always-on context (skill description plus SessionStart lines) stays under **300 tokens**.
- All code, comments, tests and documents are in English. Comments explain why, not what.

## Review Focus

1. **A tool call names a file outside the repository** (for example `~/.zshrc` or `/tmp/x`): the PreToolUse hook must answer `{}` and never deny or throw. Pinned in Task 19.
2. **A hook receives empty or malformed stdin**: the CLI must print `{}`, exit 0, and never crash the session. Pinned in Task 21.
3. **The project is not a git repository**: fingerprints, changed paths and the secret scan must fall back to file-content hashing and still produce a verdict. Pinned in Task 9.
4. **A gate command hangs**: the runner must kill the whole process group at the timeout and record `timedOut: true` with status `fail`. Pinned in Task 13.
5. **A binary file is among the changed files** (an image, a font): the secret scan must skip it instead of reporting noise or throwing on decoding. Pinned in Task 16.

---

## File structure

```
package.json                      Bun workspace root; scripts: typecheck, lint, test, build, check
tsconfig.json                     Strict TS for packages/, scripts/, tests
biome.json                        Lint and format; ignores plugins/, dist, docs
scripts/build.ts                  Bundles the CLI into plugins/core/dist/crew.mjs and checks its size
packages/engine/package.json      @shibaox/crew-engine (private)
packages/engine/src/
  version.ts                      VERSION constant
  types.ts                        Every shared type: Profile, Target, WorkItem, Evidence, Policy, UserConfig
  fs.ts                           sha256, readJson, writeJson (atomic), readText, writeText, ensureDir, nowIso
  glob.ts                         globToRegExp, matchesAny
  paths.ts                        findRoot, resolvePaths, workDir, isProtectedPath
  store.ts                        Protected JSON files with integrity hashes
  detect/types.ts                 Detector interface
  detect/node.ts                  Node and TypeScript detector
  detect/php.ts                   PHP and Laravel detector
  detect/python.ts                Python detector
  detect/index.ts                 detectProfile, mergeProfile, missingTestCommands
  fingerprint.ts                  watched files, changed paths, computeFingerprint
  classify.ts                     QUESTIONS, validateAnswers, computeRoute, risk paths
  policy.ts                       Team policy: defaults, load, tighten-only
  config.ts                       User config: mode, decisions.log
  state.ts                        Local state: active item, per-session baseline and stop counter; .crew/.gitignore
  work.ts                         Work items: create, load, save, criteria, approvals, skips, phases, guards
  run.ts                          runCommand with timeout, log file and tail
  evidence.ts                     Evidence load/save, computeVerdict, renderReport
  tdd.ts                          red, green, before, after records
  secrets.ts                      Built-in secret patterns, diff text, optional gitleaks
  gates.ts                        requiredGates, runGates, depsAuditCommand, assess
  hooks/types.ts                  HookPayload, HookResponse
  hooks/session-start.ts
  hooks/prompt.ts
  hooks/pre-tool-use.ts
  hooks/stop.ts
  hooks/index.ts                  handleHook(event, payload, env)
  cli.ts                          Argument parsing and command dispatch
  crew.ts                         Bundle entry: main(process.argv)
packages/engine/tests/            One *.test.ts per module, plus helpers.ts
plugins/core/
  .claude-plugin/plugin.json
  hooks/hooks.json
  bin/crew                        sh launcher: exec node ../dist/crew.mjs
  skills/crew/SKILL.md
  skills/crew/references/{receive,understand,specify,plan,build,gate,deliver,modes}.md
  dist/crew.mjs                   Built by scripts/build.ts, committed
```

---

### Task 1: Workspace scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `biome.json`, `packages/engine/package.json`, `packages/engine/src/version.ts`
- Test: `packages/engine/tests/version.test.ts`

**Interfaces:**
- Produces: `VERSION: string` from `packages/engine/src/version.ts`; the scripts `bun run typecheck`, `bun run lint`, `bun run test`, `bun run check`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/version.test.ts
import { expect, test } from 'bun:test';
import { VERSION } from '../src/version.ts';

test('the engine reports the plugin version', () => {
  expect(VERSION).toBe('0.1.0');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd ~/AIProjects/shibaox-developer-crew && bun test packages/engine/tests/version.test.ts`
Expected: FAIL, cannot resolve `../src/version.ts`.

- [ ] **Step 3: Create the workspace files**

```json
// package.json
{
  "name": "shibaox-developer-crew",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*"],
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "biome check .",
    "format": "biome check --write .",
    "test": "bun test",
    "build": "bun scripts/build.ts",
    "check": "bun run typecheck && bun run lint && bun run test"
  },
  "devDependencies": {
    "@biomejs/biome": "2.5.15",
    "@types/bun": "1.4.2",
    "@types/node": "^22",
    "typescript": "7.0.2"
  }
}
```

```json
// packages/engine/package.json
{
  "name": "@shibaox/crew-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": "./src/index.ts"
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "Preserve",
    "moduleResolution": "bundler",
    "types": ["bun", "node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["packages", "scripts"]
}
```

```json
// biome.json
{
  "$schema": "https://biomejs.dev/schemas/2.5.15/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "includes": ["**", "!**/dist", "!**/docs", "!**/plugins", "!**/tests/fixtures"]
  },
  "formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 },
  "linter": { "enabled": true, "rules": { "preset": "recommended" } }
}
```

```ts
// packages/engine/src/version.ts
export const VERSION = '0.1.0';
```

Then install the dev dependencies: `bun install`. Commit `bun.lock`.

- [ ] **Step 4: Run the test and the checks**

Run: `bun test packages/engine/tests/version.test.ts && bun run typecheck && bun run lint`
Expected: 1 pass; `tsc` and `biome` exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json bun.lock tsconfig.json biome.json packages/engine
git commit -m "chore: scaffold bun workspace and engine package"
```

---

### Task 2: Shared types and file helpers

**Files:**
- Create: `packages/engine/src/types.ts`, `packages/engine/src/fs.ts`
- Test: `packages/engine/tests/fs.test.ts`

**Interfaces:**
- Produces every shared type listed in the code below, and from `fs.ts`: `sha256(data: string | Uint8Array): string`, `exists(path): boolean`, `ensureDir(path): void`, `readText(path): string | null`, `readJson<T>(path): T | null`, `writeText(path, text): void` (atomic), `writeJson(path, data): void`, `nowIso(): string`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/fs.test.ts
import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exists, readJson, readText, sha256, writeJson, writeText } from '../src/fs.ts';

test('sha256 is stable and hex encoded', () => {
  expect(sha256('crew')).toMatch(/^[0-9a-f]{64}$/);
  expect(sha256('crew')).toBe(sha256('crew'));
  expect(sha256('crew')).not.toBe(sha256('crew2'));
});

test('writeText creates parent folders and readText returns null when missing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crew-fs-'));
  const file = join(dir, 'a', 'b', 'c.txt');
  expect(readText(file)).toBeNull();
  writeText(file, 'hello');
  expect(exists(file)).toBe(true);
  expect(readText(file)).toBe('hello');
});

test('writeJson round-trips and readJson returns null on invalid JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'crew-fs-'));
  const file = join(dir, 'x.json');
  writeJson(file, { a: 1, b: ['x'] });
  expect(readJson<{ a: number }>(file)?.a).toBe(1);
  writeText(file, '{not json');
  expect(readJson(file)).toBeNull();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/fs.test.ts`
Expected: FAIL, cannot resolve `../src/fs.ts`.

- [ ] **Step 3: Write the types and the helpers**

```ts
// packages/engine/src/types.ts
export type GateName = 'build' | 'test' | 'lint' | 'typecheck' | 'secrets' | 'deps';
export const GATE_NAMES: readonly GateName[] = ['build', 'test', 'lint', 'typecheck', 'secrets', 'deps'];

export type CommandSource = 'detected' | 'proposed' | 'confirmed';
export interface GateCommand {
  command: string;
  source: CommandSource;
}

/** 'other' is a target a person configured by hand, on a stack no detector knows. */
export type Stack = 'node' | 'php' | 'python' | 'other';

export interface Target {
  /** Path relative to the repository root; '.' for the root itself. */
  path: string;
  stack: Stack;
  packageManager: string;
  gates: Partial<Record<GateName, GateCommand>>;
  timeoutMs: number;
}

export interface Profile {
  version: 1;
  detectedAt: string;
  targets: Target[];
  watch: { exclude: string[] };
}

export type Route = 'fast' | 'standard' | 'full';
export const ROUTE_ORDER: readonly Route[] = ['fast', 'standard', 'full'];

export type WorkType = 'fix' | 'feature' | 'refactor' | 'chore' | 'new-product' | 'question';

export type Phase =
  | 'receive'
  | 'recognize'
  | 'understand'
  | 'specify'
  | 'plan'
  | 'build'
  | 'gate'
  | 'deliver';
export const PHASE_ORDER: readonly Phase[] = [
  'receive',
  'recognize',
  'understand',
  'specify',
  'plan',
  'build',
  'gate',
  'deliver',
];

export type RiskArea =
  | 'auth'
  | 'payments'
  | 'personal-data'
  | 'data-migration'
  | 'infra'
  | 'public-api'
  | 'secrets';

export type CriterionKind = 'behavior' | 'preserve';
export interface Criterion {
  id: string;
  kind: CriterionKind;
  text: string;
}

export interface Approval {
  what: 'spec';
  at: string;
}

export interface Skip {
  /** `tdd:<criterion id>`, `gate:<gate name>` or a phase name. */
  step: string;
  reason: string;
  at: string;
}

export interface WorkItem {
  id: string;
  title: string;
  input: string;
  type: WorkType;
  route: Route;
  routeReasons: string[];
  riskAreas: RiskArea[];
  phase: Phase;
  awaiting: 'user' | null;
  criteria: Criterion[];
  approvals: Approval[];
  skips: Skip[];
  createdAt: string;
  updatedAt: string;
}

export interface RunRecord {
  command: string;
  exit: number | null;
  at: string;
  durationMs: number;
  /** Path of the full log, relative to the work folder. */
  log: string;
  tail: string;
  timedOut: boolean;
  changedTests?: string[];
}

export interface TddRecord {
  criterion: string;
  red?: RunRecord;
  green?: RunRecord;
  before?: RunRecord;
  after?: RunRecord;
}

export type GateStatus = 'pass' | 'fail' | 'skipped' | 'unavailable';

export interface GateRun {
  gate: GateName;
  target: string;
  command: string | null;
  commandSource: CommandSource | null;
  confirmed: boolean;
  exit: number | null;
  status: GateStatus;
  durationMs: number;
  at: string;
  log: string | null;
  tail: string;
  reason?: string;
}

export interface Evidence {
  fingerprint: string | null;
  tdd: TddRecord[];
  runs: GateRun[];
  verdict: 'proven' | 'unproven';
  unproven: string[];
}

export interface Policy {
  requiredGates: GateName[];
  riskPaths: Partial<Record<RiskArea, string[]>>;
  minimumRoute: Route;
  /** Steps the user may skip. `['*']` means any. */
  allowSkips: string[];
  artifacts: 'commit' | 'local';
}

export type Mode = 'partner' | 'guide' | 'pilot';
export interface UserConfig {
  mode: Mode;
  decisions: { log: boolean };
}
```

```ts
// packages/engine/src/fs.ts
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

export function exists(path: string): boolean {
  return existsSync(path);
}

export function ensureDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

export function readJson<T>(path: string): T | null {
  const text = readText(path);
  if (text === null) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Writes through a temporary file so a reader never sees a half-written file. */
export function writeText(path: string, text: string): void {
  ensureDir(dirname(path));
  const tmp = join(dirname(path), `.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export function writeJson(path: string, data: unknown): void {
  writeText(path, `${JSON.stringify(data, null, 2)}\n`);
}

export function nowIso(): string {
  return new Date().toISOString();
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/fs.test.ts && bun run typecheck`
Expected: 3 pass; tsc exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/types.ts packages/engine/src/fs.ts packages/engine/tests/fs.test.ts
git commit -m "feat(engine): shared types and file helpers"
```

---

### Task 3: Glob matching

**Files:**
- Create: `packages/engine/src/glob.ts`
- Test: `packages/engine/tests/glob.test.ts`

**Interfaces:**
- Produces: `globToRegExp(glob: string): RegExp` (case-insensitive, anchored), `matchesAny(path: string, patterns: readonly string[]): boolean` (normalises `\` to `/` and strips a leading `./`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/glob.test.ts
import { expect, test } from 'bun:test';
import { matchesAny } from '../src/glob.ts';

test('** matches zero or more directories', () => {
  expect(matchesAny('README.md', ['**/*.md'])).toBe(true);
  expect(matchesAny('docs/guide/a.md', ['**/*.md'])).toBe(true);
  expect(matchesAny('src/a.ts', ['**/*.md'])).toBe(false);
});

test('a trailing ** matches everything below a folder but not the folder itself', () => {
  expect(matchesAny('docs/a.txt', ['docs/**'])).toBe(true);
  expect(matchesAny('docs', ['docs/**'])).toBe(false);
  expect(matchesAny('.crew/work/x/work.json', ['.crew/**'])).toBe(true);
});

test('* does not cross a slash and matching ignores case', () => {
  expect(matchesAny('app/Auth/Login.php', ['**/auth/**'])).toBe(true);
  expect(matchesAny('a/b.env', ['*.env'])).toBe(false);
  expect(matchesAny('.env.local', ['.env*'])).toBe(true);
  expect(matchesAny('./src/x.ts', ['src/*.ts'])).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/glob.test.ts`
Expected: FAIL, cannot resolve `../src/glob.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/glob.ts
const SPECIAL = /[.+^${}()|[\]\\]/g;

export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else if (c !== undefined) {
      re += c.replace(SPECIAL, '\\$&');
    }
  }
  return new RegExp(`^${re}$`, 'i');
}

export function matchesAny(path: string, patterns: readonly string[]): boolean {
  const normalised = path.replace(/\\/g, '/').replace(/^\.\//, '');
  return patterns.some((pattern) => globToRegExp(pattern).test(normalised));
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/glob.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/glob.ts packages/engine/tests/glob.test.ts
git commit -m "feat(engine): glob matching"
```

---

### Task 4: Paths and test helpers

**Files:**
- Create: `packages/engine/src/paths.ts`, `packages/engine/tests/helpers.ts`
- Test: `packages/engine/tests/paths.test.ts`

**Interfaces:**
- Produces: `interface CrewPaths { root; crewDir; localDir; userDir; integrityFile; repoId }`, `findRoot(cwd): string`, `resolvePaths(cwd, env?): CrewPaths`, `workDir(paths, id): string`, `isProtectedPath(paths, absPath): boolean`.
- Test helpers used by every later test: `tempDir(prefix?)`, `git(cwd, ...args)`, `write(root, rel, text)`, `makeRepo(files?)`, `testEnv()`.

- [ ] **Step 1: Write the helpers and the failing test**

```ts
// packages/engine/tests/helpers.ts
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Crew Test',
  GIT_AUTHOR_EMAIL: 'crew@test.invalid',
  GIT_COMMITTER_NAME: 'Crew Test',
  GIT_COMMITTER_EMAIL: 'crew@test.invalid',
};

export function tempDir(prefix = 'crew-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function write(root: string, rel: string, text: string): void {
  const path = join(root, rel);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

/** A committed git repository in a temporary folder. */
export function makeRepo(files: Record<string, string> = { 'README.md': '# test\n' }): string {
  const root = tempDir();
  git(root, 'init', '-q', '-b', 'main');
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'init');
  return root;
}

/** An environment whose user state lives in a fresh temporary home. */
export function testEnv(): NodeJS.ProcessEnv {
  return { ...process.env, SHIBAOX_HOME: tempDir('crew-home-') };
}
```

```ts
// packages/engine/tests/paths.test.ts
import { expect, test } from 'bun:test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { findRoot, isProtectedPath, resolvePaths, workDir } from '../src/paths.ts';
import { makeRepo, tempDir, testEnv } from './helpers.ts';

test('findRoot walks up to the folder that holds .git', () => {
  const root = makeRepo();
  mkdirSync(join(root, 'src', 'deep'), { recursive: true });
  expect(findRoot(join(root, 'src', 'deep'))).toBe(root);
});

test('findRoot falls back to the given folder when nothing marks a root', () => {
  const dir = tempDir();
  expect(findRoot(dir)).toBe(dir);
});

test('resolvePaths honours SHIBAOX_HOME and derives a stable repo id', () => {
  const root = makeRepo();
  const env = testEnv();
  const paths = resolvePaths(root, env);
  expect(paths.crewDir).toBe(join(root, '.crew'));
  expect(paths.userDir).toBe(join(env.SHIBAOX_HOME as string, 'crew'));
  expect(paths.integrityFile.endsWith(`${paths.repoId}.json`)).toBe(true);
  expect(resolvePaths(root, env).repoId).toBe(paths.repoId);
  expect(workDir(paths, 'w1')).toBe(join(root, '.crew', 'work', 'w1'));
});

test('isProtectedPath covers engine-owned files and nothing else', () => {
  const root = makeRepo();
  const paths = resolvePaths(root, testEnv());
  const p = (rel: string) => isProtectedPath(paths, join(root, rel));
  expect(p('.crew/profile.json')).toBe(true);
  expect(p('.crew/policy.json')).toBe(true);
  expect(p('.crew/local/state.json')).toBe(true);
  expect(p('.crew/work/w1/work.json')).toBe(true);
  expect(p('.crew/work/w1/evidence.json')).toBe(true);
  expect(p('.crew/work/w1/report.md')).toBe(true);
  expect(p('.crew/work/w1/logs/test-1.txt')).toBe(true);
  expect(p('.crew/work/w1/spec.md')).toBe(false);
  expect(p('.crew/work/w1/brief.md')).toBe(false);
  expect(p('src/app.ts')).toBe(false);
  expect(isProtectedPath(paths, join(paths.userDir, 'config.json'))).toBe(true);
  expect(isProtectedPath(paths, '/tmp/elsewhere/.crew/profile.json')).toBe(false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/paths.test.ts`
Expected: FAIL, cannot resolve `../src/paths.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/paths.ts
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { exists, sha256 } from './fs.ts';

export interface CrewPaths {
  root: string;
  crewDir: string;
  localDir: string;
  userDir: string;
  integrityFile: string;
  repoId: string;
}

/** The nearest ancestor (or the folder itself) that holds `.crew` or `.git`. */
export function findRoot(cwd: string): string {
  let dir = resolve(cwd);
  for (;;) {
    if (exists(join(dir, '.crew')) || exists(join(dir, '.git'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return resolve(cwd);
    dir = parent;
  }
}

export function resolvePaths(cwd: string, env: NodeJS.ProcessEnv = process.env): CrewPaths {
  const root = findRoot(cwd);
  const home = env.SHIBAOX_HOME ?? join(homedir(), '.shibaox');
  const userDir = join(home, 'crew');
  const repoId = sha256(root).slice(0, 16);
  return {
    root,
    crewDir: join(root, '.crew'),
    localDir: join(root, '.crew', 'local'),
    userDir,
    integrityFile: join(userDir, 'integrity', `${repoId}.json`),
    repoId,
  };
}

export function workDir(paths: CrewPaths, id: string): string {
  return join(paths.crewDir, 'work', id);
}

const PROTECTED_TOP = new Set(['.crew/profile.json', '.crew/policy.json', '.crew/.gitignore']);
const PROTECTED_IN_WORK = new Set(['work.json', 'evidence.json', 'report.md']);

/** Files only the engine writes. The agent is denied direct writes to them. */
export function isProtectedPath(paths: CrewPaths, absPath: string): boolean {
  const abs = resolve(absPath);
  if (abs === paths.userDir || abs.startsWith(paths.userDir + sep)) return true;
  const rel = relative(paths.root, abs).replace(/\\/g, '/');
  if (rel.startsWith('..') || rel === '') return false;
  if (PROTECTED_TOP.has(rel)) return true;
  if (rel === '.crew/local' || rel.startsWith('.crew/local/')) return true;
  const inWork = /^\.crew\/work\/[^/]+\/(.+)$/.exec(rel);
  if (!inWork) return false;
  const inner = inWork[1] ?? '';
  return PROTECTED_IN_WORK.has(inner) || inner.startsWith('logs/');
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/paths.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/paths.ts packages/engine/tests/helpers.ts packages/engine/tests/paths.test.ts
git commit -m "feat(engine): path resolution and protected-path rule"
```

---

### Task 5: Protected store with integrity hashes

**Files:**
- Create: `packages/engine/src/store.ts`
- Test: `packages/engine/tests/store.test.ts`

**Interfaces:**
- Consumes: `CrewPaths`, `fs.ts` helpers.
- Produces: `writeProtectedText(paths, absPath, text)`, `writeProtectedJson(paths, absPath, data)`, `readProtectedJson<T>(paths, absPath): { data: T | null; tampered: boolean }`, `recordIntegrity(paths, absPath)` (re-hashes a file edited by a person), `integrityOf(paths): Record<string, string>`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/store.test.ts
import { expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePaths } from '../src/paths.ts';
import { readProtectedJson, recordIntegrity, writeProtectedJson } from '../src/store.ts';
import { makeRepo, testEnv } from './helpers.ts';

test('a protected file written by the engine reads back untampered', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  const file = join(paths.crewDir, 'profile.json');
  writeProtectedJson(paths, file, { version: 1 });
  expect(readProtectedJson<{ version: number }>(paths, file)).toEqual({
    data: { version: 1 },
    tampered: false,
  });
});

test('a protected file changed outside the engine is reported as tampered', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  const file = join(paths.crewDir, 'work', 'w1', 'evidence.json');
  writeProtectedJson(paths, file, { verdict: 'unproven' });
  writeFileSync(file, JSON.stringify({ verdict: 'proven' }));
  const read = readProtectedJson<{ verdict: string }>(paths, file);
  expect(read.tampered).toBe(true);
  expect(read.data?.verdict).toBe('proven');
});

test('recordIntegrity accepts a hand-written file, and a missing file is not tampered', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  const file = join(paths.crewDir, 'policy.json');
  expect(readProtectedJson(paths, file)).toEqual({ data: null, tampered: false });
  mkdirSync(paths.crewDir, { recursive: true });
  writeFileSync(file, '{"minimumRoute":"standard"}');
  expect(readProtectedJson(paths, file).tampered).toBe(false);
  recordIntegrity(paths, file);
  writeFileSync(file, '{"minimumRoute":"fast"}');
  expect(readProtectedJson(paths, file).tampered).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/store.test.ts`
Expected: FAIL, cannot resolve `../src/store.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/store.ts
import { relative } from 'node:path';
import { readJson, readText, sha256, writeJson, writeText } from './fs.ts';
import type { CrewPaths } from './paths.ts';

type Integrity = Record<string, string>;

function rel(paths: CrewPaths, absPath: string): string {
  return relative(paths.root, absPath).replace(/\\/g, '/');
}

export function integrityOf(paths: CrewPaths): Integrity {
  return readJson<Integrity>(paths.integrityFile) ?? {};
}

function remember(paths: CrewPaths, absPath: string, text: string): void {
  const integrity = integrityOf(paths);
  integrity[rel(paths, absPath)] = sha256(text);
  writeJson(paths.integrityFile, integrity);
}

export function writeProtectedText(paths: CrewPaths, absPath: string, text: string): void {
  writeText(absPath, text);
  remember(paths, absPath, text);
}

export function writeProtectedJson(paths: CrewPaths, absPath: string, data: unknown): void {
  writeProtectedText(paths, absPath, `${JSON.stringify(data, null, 2)}\n`);
}

/** Records the current content of a file a person edited by hand, such as policy.json. */
export function recordIntegrity(paths: CrewPaths, absPath: string): void {
  const text = readText(absPath);
  if (text !== null) remember(paths, absPath, text);
}

export interface Protected<T> {
  data: T | null;
  tampered: boolean;
}

/**
 * A file is tampered when the engine recorded a hash for it and the content no longer
 * matches. A file with no recorded hash (hand-written policy) is trusted until recorded.
 */
export function readProtectedJson<T>(paths: CrewPaths, absPath: string): Protected<T> {
  const text = readText(absPath);
  if (text === null) return { data: null, tampered: false };
  const expected = integrityOf(paths)[rel(paths, absPath)];
  const tampered = expected !== undefined && expected !== sha256(text);
  try {
    return { data: JSON.parse(text) as T, tampered };
  } catch {
    return { data: null, tampered: true };
  }
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/store.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/store.ts packages/engine/tests/store.test.ts
git commit -m "feat(engine): protected files with integrity hashes"
```

---

### Task 6: Node and TypeScript detector

**Files:**
- Create: `packages/engine/src/detect/types.ts`, `packages/engine/src/detect/node.ts`
- Test: `packages/engine/tests/detect-node.test.ts`

**Interfaces:**
- Produces: `interface Detector { stack: Stack; detect(dir: string): DetectedTarget | null }`, `interface DetectedTarget { stack; packageManager; gates: Partial<Record<GateName, string>> }`, `nodeDetector: Detector`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/detect-node.test.ts
import { expect, test } from 'bun:test';
import { nodeDetector } from '../src/detect/node.ts';
import { tempDir, write } from './helpers.ts';

test('returns null without a package.json', () => {
  expect(nodeDetector.detect(tempDir())).toBeNull();
});

test('maps npm scripts to gates and picks the package manager from the lockfile', () => {
  const dir = tempDir();
  write(
    dir,
    'package.json',
    JSON.stringify({
      scripts: { build: 'tsc', test: 'vitest run', lint: 'eslint .', typecheck: 'tsc --noEmit' },
    }),
  );
  write(dir, 'pnpm-lock.yaml', '');
  expect(nodeDetector.detect(dir)).toEqual({
    stack: 'node',
    packageManager: 'pnpm',
    gates: {
      build: 'pnpm run build',
      test: 'pnpm run test',
      lint: 'pnpm run lint',
      typecheck: 'pnpm run typecheck',
    },
  });
});

test('ignores the npm placeholder test script and derives typecheck from tsconfig', () => {
  const dir = tempDir();
  write(
    dir,
    'package.json',
    JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
  );
  write(dir, 'tsconfig.json', '{}');
  const found = nodeDetector.detect(dir);
  expect(found?.packageManager).toBe('npm');
  expect(found?.gates.test).toBeUndefined();
  expect(found?.gates.typecheck).toBe('npx tsc --noEmit');
});

test('bun projects run scripts through bun run', () => {
  const dir = tempDir();
  write(dir, 'package.json', JSON.stringify({ scripts: { test: 'bun test' } }));
  write(dir, 'bun.lock', '');
  expect(nodeDetector.detect(dir)?.gates.test).toBe('bun run test');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/detect-node.test.ts`
Expected: FAIL, cannot resolve `../src/detect/node.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/detect/types.ts
import type { GateName, Stack } from '../types.ts';

export interface DetectedTarget {
  stack: Stack;
  packageManager: string;
  gates: Partial<Record<GateName, string>>;
}

export interface Detector {
  stack: Stack;
  /** Returns null when the folder holds no manifest for this stack. */
  detect(dir: string): DetectedTarget | null;
}
```

```ts
// packages/engine/src/detect/node.ts
import { join } from 'node:path';
import { exists, readJson } from '../fs.ts';
import type { GateName } from '../types.ts';
import type { DetectedTarget, Detector } from './types.ts';

interface PackageJson {
  scripts?: Record<string, string>;
}

const SCRIPT_CANDIDATES: Record<Exclude<GateName, 'secrets' | 'deps'>, string[]> = {
  build: ['build'],
  test: ['test', 'test:unit', 'unit'],
  lint: ['lint', 'lint:check', 'eslint', 'biome'],
  typecheck: ['typecheck', 'type-check', 'types', 'tsc'],
};

const TSC_BY_MANAGER: Record<string, string> = {
  npm: 'npx tsc --noEmit',
  pnpm: 'pnpm exec tsc --noEmit',
  yarn: 'yarn tsc --noEmit',
  bun: 'bunx tsc --noEmit',
};

function packageManager(dir: string): string {
  if (exists(join(dir, 'bun.lock')) || exists(join(dir, 'bun.lockb'))) return 'bun';
  if (exists(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (exists(join(dir, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

export const nodeDetector: Detector = {
  stack: 'node',
  detect(dir: string): DetectedTarget | null {
    const pkg = readJson<PackageJson>(join(dir, 'package.json'));
    if (!pkg) return null;
    const manager = packageManager(dir);
    const scripts = pkg.scripts ?? {};
    const gates: Partial<Record<GateName, string>> = {};
    for (const [gate, names] of Object.entries(SCRIPT_CANDIDATES) as [GateName, string[]][]) {
      const name = names.find((candidate) => candidate in scripts);
      if (!name) continue;
      // `npm init` leaves a test script that only prints an error; it is not a test runner.
      if (gate === 'test' && /no test specified/.test(scripts[name] ?? '')) continue;
      gates[gate] = `${manager} run ${name}`;
    }
    if (!gates.typecheck && exists(join(dir, 'tsconfig.json'))) {
      gates.typecheck = TSC_BY_MANAGER[manager];
    }
    return { stack: 'node', packageManager: manager, gates };
  },
};
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/detect-node.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/detect packages/engine/tests/detect-node.test.ts
git commit -m "feat(engine): node and typescript detector"
```

---

### Task 7: PHP and Python detectors

**Files:**
- Create: `packages/engine/src/detect/php.ts`, `packages/engine/src/detect/python.ts`
- Test: `packages/engine/tests/detect-php-python.test.ts`

**Interfaces:**
- Consumes: `Detector`, `DetectedTarget` from Task 6.
- Produces: `phpDetector: Detector`, `pythonDetector: Detector`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/detect-php-python.test.ts
import { expect, test } from 'bun:test';
import { phpDetector } from '../src/detect/php.ts';
import { pythonDetector } from '../src/detect/python.ts';
import { tempDir, write } from './helpers.ts';

test('php: composer scripts win, installed tools fill the rest', () => {
  const dir = tempDir();
  write(dir, 'composer.json', JSON.stringify({ scripts: { test: 'pest' } }));
  write(dir, 'vendor/bin/pint', '');
  write(dir, 'vendor/bin/phpstan', '');
  expect(phpDetector.detect(dir)).toEqual({
    stack: 'php',
    packageManager: 'composer',
    gates: {
      test: 'composer run test',
      lint: 'vendor/bin/pint --test',
      typecheck: 'vendor/bin/phpstan analyse --no-progress',
    },
  });
});

test('php: phpunit is used when pest is absent, and nothing without composer.json', () => {
  const dir = tempDir();
  write(dir, 'composer.json', '{}');
  write(dir, 'vendor/bin/phpunit', '');
  expect(phpDetector.detect(dir)?.gates.test).toBe('vendor/bin/phpunit');
  expect(phpDetector.detect(tempDir())).toBeNull();
});

test('python: uv projects run tools through uv run', () => {
  const dir = tempDir();
  write(dir, 'pyproject.toml', '[tool.pytest.ini_options]\n[tool.ruff]\n[tool.mypy]\n');
  write(dir, 'uv.lock', '');
  expect(pythonDetector.detect(dir)).toEqual({
    stack: 'python',
    packageManager: 'uv',
    gates: { test: 'uv run pytest', lint: 'uv run ruff check .', typecheck: 'uv run mypy .' },
  });
});

test('python: a requirements.txt project with a tests folder uses python -m', () => {
  const dir = tempDir();
  write(dir, 'requirements.txt', 'pytest\n');
  write(dir, 'tests/test_a.py', '');
  const found = pythonDetector.detect(dir);
  expect(found?.packageManager).toBe('pip');
  expect(found?.gates).toEqual({ test: 'python -m pytest' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/detect-php-python.test.ts`
Expected: FAIL, cannot resolve `../src/detect/php.ts`.

- [ ] **Step 3: Write the two detectors**

```ts
// packages/engine/src/detect/php.ts
import { join } from 'node:path';
import { exists, readJson } from '../fs.ts';
import type { GateName } from '../types.ts';
import type { DetectedTarget, Detector } from './types.ts';

interface ComposerJson {
  scripts?: Record<string, unknown>;
}

export const phpDetector: Detector = {
  stack: 'php',
  detect(dir: string): DetectedTarget | null {
    const composer = readJson<ComposerJson>(join(dir, 'composer.json'));
    if (!composer) return null;
    const scripts = composer.scripts ?? {};
    const installed = (tool: string) => exists(join(dir, 'vendor', 'bin', tool));
    const gates: Partial<Record<GateName, string>> = {};
    if ('test' in scripts) gates.test = 'composer run test';
    else if (installed('pest')) gates.test = 'vendor/bin/pest';
    else if (installed('phpunit')) gates.test = 'vendor/bin/phpunit';
    if ('lint' in scripts) gates.lint = 'composer run lint';
    else if (installed('pint')) gates.lint = 'vendor/bin/pint --test';
    if ('analyse' in scripts) gates.typecheck = 'composer run analyse';
    else if ('analyze' in scripts) gates.typecheck = 'composer run analyze';
    else if (installed('phpstan')) gates.typecheck = 'vendor/bin/phpstan analyse --no-progress';
    return { stack: 'php', packageManager: 'composer', gates };
  },
};
```

```ts
// packages/engine/src/detect/python.ts
import { join } from 'node:path';
import { exists, readText } from '../fs.ts';
import type { GateName } from '../types.ts';
import type { DetectedTarget, Detector } from './types.ts';

const PREFIX: Record<string, string> = { uv: 'uv run ', poetry: 'poetry run ', pip: 'python -m ' };

export const pythonDetector: Detector = {
  stack: 'python',
  detect(dir: string): DetectedTarget | null {
    const pyproject = readText(join(dir, 'pyproject.toml'));
    if (pyproject === null && !exists(join(dir, 'requirements.txt'))) return null;
    const manager = exists(join(dir, 'uv.lock'))
      ? 'uv'
      : exists(join(dir, 'poetry.lock'))
        ? 'poetry'
        : 'pip';
    const prefix = PREFIX[manager] ?? '';
    const text = pyproject ?? '';
    const gates: Partial<Record<GateName, string>> = {};
    const hasPytest =
      /\[tool\.pytest/.test(text) ||
      exists(join(dir, 'pytest.ini')) ||
      exists(join(dir, 'conftest.py')) ||
      exists(join(dir, 'tests'));
    if (hasPytest) gates.test = `${prefix}pytest`;
    if (/\[tool\.ruff/.test(text) || exists(join(dir, 'ruff.toml'))) {
      gates.lint = `${prefix}ruff check .`;
    }
    if (/\[tool\.mypy/.test(text)) gates.typecheck = `${prefix}mypy .`;
    else if (/\[tool\.pyright/.test(text)) gates.typecheck = `${prefix}pyright`;
    return { stack: 'python', packageManager: manager, gates };
  },
};
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/detect-php-python.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/detect packages/engine/tests/detect-php-python.test.ts
git commit -m "feat(engine): php and python detectors"
```

---

### Task 8: Profile detection across targets

**Files:**
- Create: `packages/engine/src/detect/index.ts`
- Test: `packages/engine/tests/detect-profile.test.ts`

**Interfaces:**
- Consumes: the three detectors, `Profile`, `Target`, `GateCommand`.
- Produces: `detectTargets(root): Target[]`, `mergeProfile(previous: Profile | null, targets: Target[]): Profile`, `detectProfile(root, previous?): Profile`, `missingTestCommands(profile): { target: string; gate: 'test' }[]`, constants `DEFAULT_WATCH_EXCLUDE`, `DEFAULT_TIMEOUT_MS`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/detect-profile.test.ts
import { expect, test } from 'bun:test';
import { detectProfile, missingTestCommands } from '../src/detect/index.ts';
import type { Profile } from '../src/types.ts';
import { tempDir, write } from './helpers.ts';

function monorepo(): string {
  const dir = tempDir();
  write(dir, 'package.json', JSON.stringify({ scripts: { test: 'vitest' } }));
  write(dir, 'apps/api/composer.json', JSON.stringify({ scripts: { test: 'pest' } }));
  write(dir, 'node_modules/dep/package.json', JSON.stringify({ scripts: { test: 'x' } }));
  write(dir, 'a/b/c/d/package.json', JSON.stringify({ scripts: { test: 'too deep' } }));
  return dir;
}

test('finds targets up to three levels deep and skips dependency folders', () => {
  const profile = detectProfile(monorepo());
  expect(profile.targets.map((t) => `${t.path}:${t.stack}`)).toEqual(['.:node', 'apps/api:php']);
  expect(profile.targets[0]?.gates.test).toEqual({ command: 'npm run test', source: 'detected' });
  expect(profile.watch.exclude).toEqual(['**/*.md', 'docs/**', '.crew/**']);
});

test('re-detection keeps proposed and confirmed commands and timeouts', () => {
  const dir = monorepo();
  const previous: Profile = detectProfile(dir);
  const target = previous.targets[0];
  if (!target) throw new Error('no target');
  target.gates.lint = { command: 'make lint', source: 'confirmed' };
  target.gates.test = { command: 'make test', source: 'proposed' };
  target.timeoutMs = 1234;
  const fresh = detectProfile(dir, previous);
  expect(fresh.targets[0]?.gates.lint).toEqual({ command: 'make lint', source: 'confirmed' });
  expect(fresh.targets[0]?.gates.test).toEqual({ command: 'make test', source: 'proposed' });
  expect(fresh.targets[0]?.timeoutMs).toBe(1234);
});

test('a path with no test command anywhere is reported, and an empty folder reports the root', () => {
  const dir = tempDir();
  write(dir, 'package.json', JSON.stringify({ scripts: { build: 'vite build' } }));
  write(dir, 'composer.json', JSON.stringify({ scripts: { test: 'pest' } }));
  expect(missingTestCommands(detectProfile(dir))).toEqual([]);
  write(dir, 'composer.json', '{}');
  expect(missingTestCommands(detectProfile(dir))).toEqual([{ target: '.', gate: 'test' }]);
  expect(missingTestCommands(detectProfile(tempDir()))).toEqual([{ target: '.', gate: 'test' }]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/detect-profile.test.ts`
Expected: FAIL, cannot resolve `../src/detect/index.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/detect/index.ts
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { nowIso } from '../fs.ts';
import type { GateCommand, GateName, Profile, Target } from '../types.ts';
import { nodeDetector } from './node.ts';
import { phpDetector } from './php.ts';
import { pythonDetector } from './python.ts';
import type { Detector } from './types.ts';

export const DETECTORS: readonly Detector[] = [nodeDetector, phpDetector, pythonDetector];
export const DEFAULT_WATCH_EXCLUDE = ['**/*.md', 'docs/**', '.crew/**'];
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_DEPTH = 3;
const SKIP_DIRS = new Set([
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
  'storage',
  'target',
  '.venv',
  'venv',
  '__pycache__',
]);

function* folders(root: string, depth = 0): Generator<string> {
  yield root;
  if (depth >= MAX_DEPTH) return;
  let names: string[];
  try {
    names = readdirSync(root).sort();
  } catch {
    return;
  }
  for (const name of names) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
    const path = join(root, name);
    try {
      if (!statSync(path).isDirectory()) continue;
    } catch {
      continue;
    }
    yield* folders(path, depth + 1);
  }
}

export function detectTargets(root: string): Target[] {
  const targets: Target[] = [];
  for (const dir of folders(root)) {
    for (const detector of DETECTORS) {
      const found = detector.detect(dir);
      if (!found) continue;
      const gates: Target['gates'] = {};
      for (const [gate, command] of Object.entries(found.gates) as [GateName, string][]) {
        gates[gate] = { command, source: 'detected' };
      }
      const rel = relative(root, dir).replace(/\\/g, '/');
      targets.push({
        path: rel === '' ? '.' : rel,
        stack: found.stack,
        packageManager: found.packageManager,
        gates,
        timeoutMs: DEFAULT_TIMEOUT_MS,
      });
    }
  }
  return targets;
}

/** Fresh detection never discards what a person proposed or confirmed. */
export function mergeProfile(previous: Profile | null, targets: Target[]): Profile {
  if (previous) {
    for (const target of targets) {
      const old = previous.targets.find((t) => t.path === target.path && t.stack === target.stack);
      if (!old) continue;
      target.timeoutMs = old.timeoutMs;
      for (const [gate, command] of Object.entries(old.gates) as [GateName, GateCommand][]) {
        if (command.source !== 'detected') target.gates[gate] = command;
      }
    }
  }
  return {
    version: 1,
    detectedAt: nowIso(),
    targets,
    watch: previous?.watch ?? { exclude: [...DEFAULT_WATCH_EXCLUDE] },
  };
}

export function detectProfile(root: string, previous: Profile | null = null): Profile {
  return mergeProfile(previous, detectTargets(root));
}

export interface MissingCommand {
  target: string;
  gate: 'test';
}

/**
 * Test is the one gate every path must have. A path counts as covered when any of its
 * targets has a test command, so a Laravel app with a Vite package.json is not nagged.
 */
export function missingTestCommands(profile: Profile): MissingCommand[] {
  if (profile.targets.length === 0) return [{ target: '.', gate: 'test' }];
  const covered = new Set(profile.targets.filter((t) => t.gates.test).map((t) => t.path));
  const paths = [...new Set(profile.targets.map((t) => t.path))];
  return paths.filter((p) => !covered.has(p)).map((target) => ({ target, gate: 'test' }));
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/detect-profile.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/detect/index.ts packages/engine/tests/detect-profile.test.ts
git commit -m "feat(engine): profile detection across targets"
```

---

### Task 9: Watched files and fingerprints

**Files:**
- Create: `packages/engine/src/fingerprint.ts`
- Test: `packages/engine/tests/fingerprint.test.ts`

**Interfaces:**
- Consumes: `Profile`, `matchesAny`, `sha256`.
- Produces: `isGitRepo(root): boolean`, `gitHead(root): string` (`'none'` without commits), `gitChangedPaths(root): string[]`, `isWatched(path, profile): boolean`, `allWatchedFiles(root, profile): string[]`, `changedWatchedPaths(root, profile): string[]`, `computeFingerprint(root, profile): string` (`sha256:<hex>`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/fingerprint.test.ts
import { expect, test } from 'bun:test';
import { detectProfile } from '../src/detect/index.ts';
import {
  changedWatchedPaths,
  computeFingerprint,
  gitChangedPaths,
} from '../src/fingerprint.ts';
import { git, makeRepo, tempDir, write } from './helpers.ts';

test('the fingerprint is stable and changes when a watched file changes', () => {
  const root = makeRepo({ 'src/a.ts': 'export const a = 1;\n', 'README.md': '# r\n' });
  const profile = detectProfile(root);
  const before = computeFingerprint(root, profile);
  expect(before).toMatch(/^sha256:[0-9a-f]{64}$/);
  expect(computeFingerprint(root, profile)).toBe(before);
  write(root, 'src/a.ts', 'export const a = 2;\n');
  expect(computeFingerprint(root, profile)).not.toBe(before);
});

test('markdown and docs are not watched; untracked source files are', () => {
  const root = makeRepo({ 'src/a.ts': 'x', 'README.md': '# r\n' });
  const profile = detectProfile(root);
  const before = computeFingerprint(root, profile);
  write(root, 'README.md', '# changed\n');
  write(root, 'docs/guide.txt', 'notes');
  expect(changedWatchedPaths(root, profile)).toEqual([]);
  expect(computeFingerprint(root, profile)).toBe(before);
  write(root, 'src/new.ts', 'y');
  expect(changedWatchedPaths(root, profile)).toEqual(['src/new.ts']);
  expect(computeFingerprint(root, profile)).not.toBe(before);
});

test('gitChangedPaths lists both sides of a rename', () => {
  const root = makeRepo({ 'src/old.ts': 'x' });
  git(root, 'mv', 'src/old.ts', 'src/new.ts');
  expect(gitChangedPaths(root)).toEqual(['src/new.ts', 'src/old.ts']);
});

test('a folder without git falls back to hashing every watched file', () => {
  const root = tempDir();
  write(root, 'src/a.py', 'a = 1\n');
  write(root, 'notes.md', 'ignored');
  const profile = detectProfile(root);
  expect(changedWatchedPaths(root, profile)).toEqual(['src/a.py']);
  const before = computeFingerprint(root, profile);
  write(root, 'notes.md', 'still ignored');
  expect(computeFingerprint(root, profile)).toBe(before);
  write(root, 'src/a.py', 'a = 2\n');
  expect(computeFingerprint(root, profile)).not.toBe(before);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/fingerprint.test.ts`
Expected: FAIL, cannot resolve `../src/fingerprint.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/fingerprint.ts
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { exists, sha256 } from './fs.ts';
import { matchesAny } from './glob.ts';
import type { Profile } from './types.ts';

const SKIP_DIRS = new Set(['.git', '.crew', 'node_modules', 'vendor', '.venv', 'venv', '__pycache__']);

export function isGitRepo(root: string): boolean {
  return exists(join(root, '.git'));
}

function gitOut(root: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  });
}

export function gitHead(root: string): string {
  try {
    return gitOut(root, ['rev-parse', 'HEAD']).trim();
  } catch {
    return 'none';
  }
}

/** Paths that differ from HEAD: modified, added, deleted, renamed and untracked (not ignored). */
export function gitChangedPaths(root: string): string[] {
  let out: string;
  try {
    out = gitOut(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  } catch {
    return [];
  }
  const entries = out.split('\0');
  const paths = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || entry.length < 4) continue;
    paths.add(entry.slice(3));
    // A rename or copy entry is followed by the original path as its own record.
    if (entry[0] === 'R' || entry[0] === 'C') {
      const original = entries[++i];
      if (original) paths.add(original);
    }
  }
  return [...paths].sort();
}

export function isWatched(path: string, profile: Profile): boolean {
  return !matchesAny(path, profile.watch.exclude);
}

export function allWatchedFiles(root: string, profile: Profile): string[] {
  const files: string[] = [];
  const walk = (dir: string, rel: string): void => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (SKIP_DIRS.has(name)) continue;
      const abs = join(dir, name);
      const path = rel ? `${rel}/${name}` : name;
      let isDir = false;
      try {
        isDir = statSync(abs).isDirectory();
      } catch {
        continue;
      }
      if (isDir) walk(abs, path);
      else if (isWatched(path, profile)) files.push(path);
    }
  };
  walk(root, '');
  return files.sort();
}

/** Without history there is nothing to diff against, so every watched file counts as changed. */
export function changedWatchedPaths(root: string, profile: Profile): string[] {
  if (!isGitRepo(root)) return allWatchedFiles(root, profile);
  return gitChangedPaths(root).filter((path) => isWatched(path, profile));
}

function hashFile(abs: string): string {
  try {
    return sha256(readFileSync(abs));
  } catch {
    return 'DELETED';
  }
}

export function computeFingerprint(root: string, profile: Profile): string {
  const parts: string[] = [];
  if (isGitRepo(root)) {
    parts.push(`head:${gitHead(root)}`);
    for (const path of changedWatchedPaths(root, profile)) {
      parts.push(`${path}:${hashFile(join(root, path))}`);
    }
  } else {
    for (const path of allWatchedFiles(root, profile)) {
      parts.push(`${path}:${hashFile(join(root, path))}`);
    }
  }
  return `sha256:${sha256(parts.join('\n'))}`;
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/fingerprint.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/fingerprint.ts packages/engine/tests/fingerprint.test.ts
git commit -m "feat(engine): watched files and fingerprints"
```

---

### Task 10: Typed questions, answers and routes

**Files:**
- Create: `packages/engine/src/classify.ts`
- Test: `packages/engine/tests/classify.test.ts`

**Interfaces:**
- Consumes: `Policy`, `RiskArea`, `Route`, `WorkType`, `ROUTE_ORDER`, `matchesAny`.
- Produces: `QUESTIONS` (the typed question definitions, shaped like Jev and Laya questions), `interface Answers`, `class AnswerError`, `validateAnswers(raw: unknown): Answers`, `riskAreasFromAnswers(answers): RiskArea[]`, `DEFAULT_RISK_PATHS`, `riskAreasForPaths(paths, policy): RiskArea[]`, `routeRank(route): number`, `higherRoute(a, b): Route`, `interface RouteDecision { route; reasons; riskAreas }`, `computeRoute(answers, pathRisk, policy): RouteDecision`, constants `RISK_THRESHOLD = 0.3`, `VAGUE_THRESHOLD = 0.5`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/classify.test.ts
import { expect, test } from 'bun:test';
import {
  type Answers,
  AnswerError,
  computeRoute,
  riskAreasForPaths,
  validateAnswers,
} from '../src/classify.ts';
import { DEFAULT_POLICY } from '../src/policy.ts';

const calm: Answers = {
  work_type: 'fix',
  is_vague: 0.1,
  scope: 0,
  touches_auth: 0.05,
  touches_payments: 0,
  touches_personal_data: 0,
  touches_data_migration: 0,
  touches_infra: 0,
  touches_public_api: 0,
};

test('validateAnswers accepts a complete answer set and rejects bad values', () => {
  expect(validateAnswers(calm)).toEqual(calm);
  expect(() => validateAnswers({ ...calm, work_type: 'bug' })).toThrow(AnswerError);
  expect(() => validateAnswers({ ...calm, scope: 7 })).toThrow(/scope/);
  expect(() => validateAnswers({ ...calm, touches_auth: 2 })).toThrow(/touches_auth/);
  expect(() => validateAnswers('nope')).toThrow(AnswerError);
});

test('a clear one-spot fix is fast; a feature is standard; risk or a new product is full', () => {
  expect(computeRoute(calm, [], DEFAULT_POLICY).route).toBe('fast');
  expect(computeRoute({ ...calm, work_type: 'feature' }, [], DEFAULT_POLICY).route).toBe(
    'standard',
  );
  expect(computeRoute({ ...calm, is_vague: 0.8 }, [], DEFAULT_POLICY).route).toBe('standard');
  const risky = computeRoute({ ...calm, touches_auth: 0.4 }, [], DEFAULT_POLICY);
  expect(risky.route).toBe('full');
  expect(risky.riskAreas).toEqual(['auth']);
  expect(computeRoute({ ...calm, work_type: 'new-product' }, [], DEFAULT_POLICY).route).toBe(
    'full',
  );
  expect(computeRoute(calm, ['payments'], DEFAULT_POLICY)).toMatchObject({
    route: 'full',
    riskAreas: ['payments'],
  });
});

test('the team policy can only raise the route', () => {
  const decision = computeRoute(calm, [], { ...DEFAULT_POLICY, minimumRoute: 'standard' });
  expect(decision.route).toBe('standard');
  expect(decision.reasons.at(-1)).toBe('team policy minimum: standard');
});

test('risk paths come from the defaults and the policy', () => {
  expect(riskAreasForPaths(['app/Http/Middleware/Authenticate.php'], DEFAULT_POLICY)).toEqual([
    'auth',
  ]);
  expect(riskAreasForPaths(['database/migrations/2026_01_01_x.php'], DEFAULT_POLICY)).toEqual([
    'data-migration',
  ]);
  expect(riskAreasForPaths(['src/cart/total.ts'], DEFAULT_POLICY)).toEqual([]);
  const policy = { ...DEFAULT_POLICY, riskPaths: { payments: ['app/Billing/**'] } };
  expect(riskAreasForPaths(['app/Billing/Invoice.php'], policy)).toEqual(['payments']);
});
```

Note: this test imports `DEFAULT_POLICY` from Task 11. Write Task 11's `policy.ts` before running this test, or run Tasks 10 and 11 together; the commit order below keeps each task's files separate.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/classify.test.ts`
Expected: FAIL, cannot resolve `../src/classify.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/classify.ts
import { matchesAny } from './glob.ts';
import type { Policy, RiskArea, Route, WorkType } from './types.ts';
import { ROUTE_ORDER } from './types.ts';

export type QuestionType = 'choice' | 'noul' | 'score';
export interface Question {
  type: QuestionType;
  instructions: string;
  criteria?: Record<string, string> | string[];
}

const WORK_TYPES: Record<WorkType, string> = {
  fix: 'repairs behaviour that is wrong today',
  feature: 'adds or changes behaviour on purpose',
  refactor: 'changes structure without changing behaviour',
  chore: 'tooling, dependencies, configuration or documentation',
  'new-product': 'a new application or service from scratch',
  question: 'the user wants an answer, not a change',
};

/** The same shape Jev and Laya accept, so a later backend can answer the same questions. */
export const QUESTIONS = {
  work_type: {
    type: 'choice',
    instructions: 'What kind of work does this request ask for?',
    criteria: WORK_TYPES,
  },
  is_vague: {
    type: 'noul',
    instructions:
      'Is information missing without which two competent engineers would build different things?',
  },
  scope: {
    type: 'score',
    instructions: 'How much of the codebase does this change touch?',
    criteria: ['one spot', 'one module', 'several modules', 'the whole system'],
  },
  touches_auth: {
    type: 'noul',
    instructions: 'Does this change authentication, authorization or sessions?',
  },
  touches_payments: {
    type: 'noul',
    instructions: 'Does this change payments, billing or pricing?',
  },
  touches_personal_data: {
    type: 'noul',
    instructions: 'Does this read, store or expose personal data?',
  },
  touches_data_migration: {
    type: 'noul',
    instructions: 'Does this change a database schema or migrate data?',
  },
  touches_infra: {
    type: 'noul',
    instructions: 'Does this change infrastructure, deployment or CI?',
  },
  touches_public_api: {
    type: 'noul',
    instructions: 'Does this change an interface other systems depend on?',
  },
} as const satisfies Record<string, Question>;

export type QuestionId = keyof typeof QUESTIONS;

export interface Answers {
  work_type: WorkType;
  is_vague: number;
  scope: number;
  touches_auth: number;
  touches_payments: number;
  touches_personal_data: number;
  touches_data_migration: number;
  touches_infra: number;
  touches_public_api: number;
}

export class AnswerError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join('; '));
    this.name = 'AnswerError';
  }
}

export const RISK_THRESHOLD = 0.3;
export const VAGUE_THRESHOLD = 0.5;

export function validateAnswers(raw: unknown): Answers {
  const problems: string[] = [];
  if (typeof raw !== 'object' || raw === null) throw new AnswerError(['answers must be an object']);
  const input = raw as Record<string, unknown>;
  for (const [id, question] of Object.entries(QUESTIONS)) {
    const value = input[id];
    if (question.type === 'choice') {
      if (typeof value !== 'string' || !(value in question.criteria)) {
        problems.push(`${id}: expected one of ${Object.keys(question.criteria).join(', ')}`);
      }
    } else if (question.type === 'noul') {
      if (typeof value !== 'number' || value < 0 || value > 1) {
        problems.push(`${id}: expected a probability between 0 and 1`);
      }
    } else if (!Number.isInteger(value) || (value as number) < 0 || (value as number) >= question.criteria.length) {
      problems.push(`${id}: expected an integer level from 0 to ${question.criteria.length - 1}`);
    }
  }
  if (problems.length) throw new AnswerError(problems);
  return input as unknown as Answers;
}

const AREA_BY_QUESTION: Partial<Record<QuestionId, RiskArea>> = {
  touches_auth: 'auth',
  touches_payments: 'payments',
  touches_personal_data: 'personal-data',
  touches_data_migration: 'data-migration',
  touches_infra: 'infra',
  touches_public_api: 'public-api',
};

export function riskAreasFromAnswers(answers: Answers): RiskArea[] {
  const areas: RiskArea[] = [];
  for (const [id, area] of Object.entries(AREA_BY_QUESTION) as [QuestionId, RiskArea][]) {
    if ((answers[id] as number) >= RISK_THRESHOLD) areas.push(area);
  }
  return areas;
}

export const DEFAULT_RISK_PATHS: Record<RiskArea, string[]> = {
  auth: [
    '**/auth/**',
    '**/*auth*',
    '**/Middleware/Authenticate*',
    '**/login*',
    '**/session*',
    '**/password*',
    '**/oauth*',
    '**/jwt*',
  ],
  payments: ['**/payment*', '**/billing*', '**/checkout*', '**/stripe*', '**/invoice*', '**/pricing*'],
  'personal-data': ['**/gdpr*', '**/privacy*', '**/consent*', '**/pii*', '**/*personal*'],
  'data-migration': ['**/migrations/**', '**/migrate*', '**/schema.*', '**/*.sql', '**/prisma/**'],
  infra: [
    '.github/workflows/**',
    '.gitlab-ci.yml',
    '**/Dockerfile*',
    '**/docker-compose*',
    '**/terraform/**',
    '**/*.tf',
    '**/k8s/**',
    '**/helm/**',
    '**/deploy*',
    '**/ansible/**',
  ],
  'public-api': ['**/routes/api*', '**/openapi*', '**/swagger*', '**/*.proto', '**/graphql/schema*'],
  secrets: ['.env*', '**/.env*', '**/secrets*', '**/*.pem', '**/*.key', '**/credentials*'],
};

export function riskAreasForPaths(paths: readonly string[], policy: Policy): RiskArea[] {
  const areas: RiskArea[] = [];
  for (const area of Object.keys(DEFAULT_RISK_PATHS) as RiskArea[]) {
    const patterns = [...DEFAULT_RISK_PATHS[area], ...(policy.riskPaths[area] ?? [])];
    if (paths.some((path) => matchesAny(path, patterns))) areas.push(area);
  }
  return areas;
}

export function routeRank(route: Route): number {
  return ROUTE_ORDER.indexOf(route);
}

export function higherRoute(a: Route, b: Route): Route {
  return routeRank(a) >= routeRank(b) ? a : b;
}

export interface RouteDecision {
  route: Route;
  reasons: string[];
  riskAreas: RiskArea[];
}

export function computeRoute(answers: Answers, pathRisk: RiskArea[], policy: Policy): RouteDecision {
  const riskAreas = [...new Set([...riskAreasFromAnswers(answers), ...pathRisk])];
  const reasons: string[] = [];
  let route: Route;
  if (answers.work_type === 'new-product') {
    route = 'full';
    reasons.push('new product');
  } else if (riskAreas.length > 0) {
    route = 'full';
    reasons.push(`risk areas: ${riskAreas.join(', ')}`);
  } else if (
    (answers.work_type === 'fix' || answers.work_type === 'chore') &&
    answers.is_vague < VAGUE_THRESHOLD &&
    answers.scope === 0
  ) {
    route = 'fast';
    reasons.push(`${answers.work_type} in one spot, clear request, no risk area`);
  } else {
    route = 'standard';
    reasons.push(
      `${answers.work_type}, scope level ${answers.scope}, ${
        answers.is_vague >= VAGUE_THRESHOLD ? 'vague request' : 'clear request'
      }`,
    );
  }
  if (routeRank(policy.minimumRoute) > routeRank(route)) {
    route = policy.minimumRoute;
    reasons.push(`team policy minimum: ${policy.minimumRoute}`);
  }
  return { route, reasons, riskAreas };
}
```

- [ ] **Step 4: Run the test (after Task 11's `policy.ts` exists)**

Run: `bun test packages/engine/tests/classify.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/classify.ts packages/engine/tests/classify.test.ts
git commit -m "feat(engine): typed questions, answers and route computation"
```

---

### Task 11: Policy, user config and local state

**Files:**
- Create: `packages/engine/src/policy.ts`, `packages/engine/src/config.ts`, `packages/engine/src/state.ts`
- Test: `packages/engine/tests/policy-config-state.test.ts`

**Interfaces:**
- Produces from `policy.ts`: `DEFAULT_POLICY: Policy`, `loadPolicy(paths): { policy: Policy; tampered: boolean }`, `skipAllowed(policy, step): boolean`.
- From `config.ts`: `DEFAULT_CONFIG: UserConfig`, `configPath(paths)`, `loadConfig(paths): UserConfig`, `saveConfig(paths, config)`, `setConfigValue(config, key, value): UserConfig` (keys `mode`, `decisions.log`).
- From `state.ts`: `interface SessionState { baseline: string | null; stopBlocks: number }`, `interface LocalState { active: string | null; sessions: Record<string, SessionState> }`, `loadState(paths)`, `saveState(paths, state)`, `sessionState(state, sessionId): SessionState`, `ensureCrewDir(paths, policy)` (writes `.crew/.gitignore`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/policy-config-state.test.ts
import { expect, test } from 'bun:test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, saveConfig, setConfigValue } from '../src/config.ts';
import { resolvePaths } from '../src/paths.ts';
import { DEFAULT_POLICY, loadPolicy, skipAllowed } from '../src/policy.ts';
import { ensureCrewDir, loadState, saveState, sessionState } from '../src/state.ts';
import { makeRepo, testEnv } from './helpers.ts';

test('policy: defaults when absent, validated when present, unknown values ignored', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  expect(loadPolicy(paths)).toEqual({ policy: DEFAULT_POLICY, tampered: false });
  mkdirSync(paths.crewDir, { recursive: true });
  writeFileSync(
    join(paths.crewDir, 'policy.json'),
    JSON.stringify({
      requiredGates: ['lint', 'bogus'],
      minimumRoute: 'standard',
      allowSkips: ['lint'],
      artifacts: 'local',
      riskPaths: { payments: ['app/Billing/**'] },
    }),
  );
  const { policy } = loadPolicy(paths);
  expect(policy.requiredGates).toEqual(['lint']);
  expect(policy.minimumRoute).toBe('standard');
  expect(policy.artifacts).toBe('local');
  expect(skipAllowed(policy, 'gate:lint')).toBe(true);
  expect(skipAllowed(policy, 'gate:test')).toBe(false);
  expect(skipAllowed(DEFAULT_POLICY, 'anything')).toBe(true);
});

test('config: defaults, set values, reject unknown keys and values', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  expect(loadConfig(paths)).toEqual({ mode: 'partner', decisions: { log: true } });
  const next = setConfigValue(loadConfig(paths), 'decisions.log', 'false');
  saveConfig(paths, setConfigValue(next, 'mode', 'pilot'));
  expect(loadConfig(paths)).toEqual({ mode: 'pilot', decisions: { log: false } });
  expect(() => setConfigValue(next, 'mode', 'captain')).toThrow(/mode/);
  expect(() => setConfigValue(next, 'colour', 'red')).toThrow(/unknown/);
});

test('state: per-session entries and the .crew/.gitignore', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  ensureCrewDir(paths, DEFAULT_POLICY);
  expect(readFileSync(join(paths.crewDir, '.gitignore'), 'utf8')).toBe('local/\nwork/*/logs/\n');
  ensureCrewDir(paths, { ...DEFAULT_POLICY, artifacts: 'local' });
  expect(readFileSync(join(paths.crewDir, '.gitignore'), 'utf8')).toBe(
    'local/\nwork/*/logs/\nwork/\n',
  );
  const state = loadState(paths);
  expect(state).toEqual({ active: null, sessions: {} });
  const session = sessionState(state, 's1');
  session.baseline = 'sha256:abc';
  session.stopBlocks = 2;
  state.active = 'w1';
  saveState(paths, state);
  expect(loadState(paths)).toEqual({
    active: 'w1',
    sessions: { s1: { baseline: 'sha256:abc', stopBlocks: 2 } },
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/policy-config-state.test.ts`
Expected: FAIL, cannot resolve `../src/config.ts`.

- [ ] **Step 3: Write the three modules**

```ts
// packages/engine/src/policy.ts
import { join } from 'node:path';
import type { CrewPaths } from './paths.ts';
import { readProtectedJson } from './store.ts';
import type { GateName, Policy, RiskArea, Route } from './types.ts';
import { GATE_NAMES, ROUTE_ORDER } from './types.ts';

export const DEFAULT_POLICY: Policy = {
  requiredGates: [],
  riskPaths: {},
  minimumRoute: 'fast',
  allowSkips: ['*'],
  artifacts: 'commit',
};

const RISK_AREAS: RiskArea[] = [
  'auth',
  'payments',
  'personal-data',
  'data-migration',
  'infra',
  'public-api',
  'secrets',
];

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** A policy can only tighten; anything it does not say falls back to the default. */
export function loadPolicy(paths: CrewPaths): { policy: Policy; tampered: boolean } {
  const read = readProtectedJson<Record<string, unknown>>(paths, join(paths.crewDir, 'policy.json'));
  const raw = read.data ?? {};
  const riskPaths: Policy['riskPaths'] = {};
  const rawRisk = (raw.riskPaths ?? {}) as Record<string, unknown>;
  for (const area of RISK_AREAS) {
    const patterns = strings(rawRisk[area]);
    if (patterns.length) riskPaths[area] = patterns;
  }
  const minimumRoute = ROUTE_ORDER.includes(raw.minimumRoute as Route)
    ? (raw.minimumRoute as Route)
    : DEFAULT_POLICY.minimumRoute;
  const allowSkips = Array.isArray(raw.allowSkips) ? strings(raw.allowSkips) : DEFAULT_POLICY.allowSkips;
  return {
    policy: {
      requiredGates: strings(raw.requiredGates).filter((g): g is GateName =>
        GATE_NAMES.includes(g as GateName),
      ),
      riskPaths,
      minimumRoute,
      allowSkips,
      artifacts: raw.artifacts === 'local' ? 'local' : 'commit',
    },
    tampered: read.tampered,
  };
}

export function skipAllowed(policy: Policy, step: string): boolean {
  const bare = step.replace(/^(gate|tdd):/, '');
  return policy.allowSkips.some((s) => s === '*' || s === step || s === bare);
}
```

```ts
// packages/engine/src/config.ts
import { join } from 'node:path';
import { readJson, writeJson } from './fs.ts';
import type { CrewPaths } from './paths.ts';
import type { Mode, UserConfig } from './types.ts';

export const DEFAULT_CONFIG: UserConfig = { mode: 'partner', decisions: { log: true } };
const MODES: Mode[] = ['partner', 'guide', 'pilot'];

export function configPath(paths: CrewPaths): string {
  return join(paths.userDir, 'config.json');
}

export function loadConfig(paths: CrewPaths): UserConfig {
  const raw = readJson<Partial<UserConfig>>(configPath(paths)) ?? {};
  return {
    mode: MODES.includes(raw.mode as Mode) ? (raw.mode as Mode) : DEFAULT_CONFIG.mode,
    decisions: { log: raw.decisions?.log === false ? false : true },
  };
}

export function saveConfig(paths: CrewPaths, config: UserConfig): void {
  writeJson(configPath(paths), config);
}

export function setConfigValue(config: UserConfig, key: string, value: string): UserConfig {
  if (key === 'mode') {
    if (!MODES.includes(value as Mode)) throw new Error(`mode must be one of ${MODES.join(', ')}`);
    return { ...config, mode: value as Mode };
  }
  if (key === 'decisions.log') {
    if (value !== 'true' && value !== 'false') throw new Error('decisions.log must be true or false');
    return { ...config, decisions: { log: value === 'true' } };
  }
  throw new Error(`unknown setting: ${key}`);
}
```

```ts
// packages/engine/src/state.ts
import { join } from 'node:path';
import { readJson, readText, writeJson } from './fs.ts';
import type { CrewPaths } from './paths.ts';
import { writeProtectedText } from './store.ts';
import type { Policy } from './types.ts';

export interface SessionState {
  baseline: string | null;
  stopBlocks: number;
}

export interface LocalState {
  active: string | null;
  sessions: Record<string, SessionState>;
}

function statePath(paths: CrewPaths): string {
  return join(paths.localDir, 'state.json');
}

export function loadState(paths: CrewPaths): LocalState {
  const raw = readJson<Partial<LocalState>>(statePath(paths)) ?? {};
  return { active: typeof raw.active === 'string' ? raw.active : null, sessions: raw.sessions ?? {} };
}

export function saveState(paths: CrewPaths, state: LocalState): void {
  writeJson(statePath(paths), state);
}

export function sessionState(state: LocalState, sessionId: string): SessionState {
  const existing = state.sessions[sessionId];
  if (existing) return existing;
  const created: SessionState = { baseline: null, stopBlocks: 0 };
  state.sessions[sessionId] = created;
  return created;
}

/** Keeps machine-local state and logs out of the repository; work artefacts too when the policy says so. */
export function ensureCrewDir(paths: CrewPaths, policy: Policy): void {
  const wanted = `local/\nwork/*/logs/\n${policy.artifacts === 'local' ? 'work/\n' : ''}`;
  const file = join(paths.crewDir, '.gitignore');
  if (readText(file) !== wanted) writeProtectedText(paths, file, wanted);
}
```

- [ ] **Step 4: Run the tests**

Run: `bun test packages/engine/tests/policy-config-state.test.ts packages/engine/tests/classify.test.ts`
Expected: 7 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/policy.ts packages/engine/src/config.ts packages/engine/src/state.ts packages/engine/tests/policy-config-state.test.ts
git commit -m "feat(engine): team policy, user config and local state"
```

---

### Task 12: Work items, phases and guards

**Files:**
- Create: `packages/engine/src/work.ts`
- Test: `packages/engine/tests/work.test.ts`

**Interfaces:**
- Consumes: `WorkItem`, `Criterion`, `Evidence`, `Phase`, `Route`, `PHASE_ORDER`, `RouteDecision`, store, state.
- Produces: `PHASES_BY_ROUTE`, `createWork(paths, input): WorkItem` (writes `work.json` and `brief.md`, sets the active item), `saveWork(paths, work)`, `loadWork(paths, id): { work: WorkItem | null; tampered: boolean }`, `activeWork(paths)`, `applyClassification(work, type, decision)`, `raiseRoute(work, to, reason): boolean`, `addCriterion(work, text, kind?): Criterion`, `approve(work, 'spec')`, `addSkip(work, step, reason)`, `isSkipped(work, step)`, `isBeforeBuild(work)`, `hasAcceptanceSection(text)`, `interface GuardContext { specText; planExists; evidence; proven; unproven }`, `guardFor(work, next, ctx): string[]`, `nextPhaseOf(work): Phase | null`, `advancePhase(work, ctx)`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/work.test.ts
import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePaths, workDir } from '../src/paths.ts';
import { loadState } from '../src/state.ts';
import type { Evidence, RunRecord } from '../src/types.ts';
import {
  activeWork,
  addCriterion,
  addSkip,
  advancePhase,
  applyClassification,
  approve,
  createWork,
  type GuardContext,
  guardFor,
  hasAcceptanceSection,
  loadWork,
  raiseRoute,
  saveWork,
} from '../src/work.ts';
import { makeRepo, testEnv } from './helpers.ts';

const run: RunRecord = { command: 'x', exit: 0, at: 't', durationMs: 1, log: 'l', tail: '', timedOut: false };
const empty: GuardContext = { specText: null, planExists: false, evidence: null, proven: false, unproven: [] };

test('createWork writes the item and the brief and makes it active', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  const work = createWork(paths, 'The cart total ignores the discount\n\nSteps: add a coupon.');
  expect(work.id).toMatch(/^\d{4}-\d{2}-\d{2}-001-the-cart-total-ignores-the-discount$/);
  expect(work.title).toBe('The cart total ignores the discount');
  expect(work.phase).toBe('receive');
  expect(existsSync(join(workDir(paths, work.id), 'work.json'))).toBe(true);
  expect(readFileSync(join(workDir(paths, work.id), 'brief.md'), 'utf8')).toContain('add a coupon');
  expect(loadState(paths).active).toBe(work.id);
  expect(activeWork(paths)?.work?.id).toBe(work.id);
  expect(createWork(paths, 'Second').id).toMatch(/-002-second$/);
});

test('classification sets type, route and risk, and routes only go up', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  const work = createWork(paths, 'fix');
  applyClassification(work, 'fix', { route: 'fast', reasons: ['r'], riskAreas: [] });
  expect(work).toMatchObject({ type: 'fix', route: 'fast', phase: 'recognize' });
  expect(raiseRoute(work, 'full', 'touches app/Auth')).toBe(true);
  expect(work.routeReasons).toEqual(['r', 'raised to full: touches app/Auth']);
  expect(raiseRoute(work, 'standard', 'x')).toBe(false);
  saveWork(paths, work);
  expect(loadWork(paths, work.id).work?.route).toBe('full');
});

test('guards: build needs criteria, then spec, approval and plan by route', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  const work = createWork(paths, 'feature');
  applyClassification(work, 'feature', { route: 'fast', reasons: [], riskAreas: [] });
  expect(guardFor(work, 'build', empty)).toEqual([
    'at least one acceptance criterion (crew criteria <id> add "...")',
  ]);
  addCriterion(work, 'The total subtracts the discount.');
  expect(guardFor(work, 'build', empty)).toEqual([]);
  work.route = 'full';
  expect(guardFor(work, 'build', empty)).toEqual([
    'spec.md in the work folder',
    "the user's approval of the spec (crew approve <id> spec)",
    'plan.md in the work folder',
  ]);
  expect(hasAcceptanceSection('# Spec\n\n## Acceptance criteria\n\n- AC-1 x\n')).toBe(true);
  expect(hasAcceptanceSection('# Spec\n\n## Acceptance criteria\n\n## Risks\n')).toBe(false);
  approve(work, 'spec');
  const ready = { ...empty, specText: '## Acceptance criteria\n- x\n', planExists: true };
  expect(guardFor(work, 'build', ready)).toEqual([]);
});

test('guards: gate needs test-first records per criterion kind, deliver needs proof', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  const work = createWork(paths, 'refactor');
  const behaviour = addCriterion(work, 'x');
  const preserve = addCriterion(work, 'keep', 'preserve');
  expect(guardFor(work, 'gate', empty)).toEqual([
    `test-first record for ${behaviour.id} (crew tdd red/green)`,
    `test-first record for ${preserve.id} (crew tdd before/after)`,
  ]);
  const evidence: Evidence = {
    fingerprint: 'f',
    tdd: [
      { criterion: behaviour.id, red: run, green: run },
      { criterion: preserve.id, before: run },
    ],
    runs: [],
    verdict: 'unproven',
    unproven: [],
  };
  expect(guardFor(work, 'gate', { ...empty, evidence })).toEqual([
    `test-first record for ${preserve.id} (crew tdd before/after)`,
  ]);
  addSkip(work, `tdd:${preserve.id}`, 'manual check');
  expect(guardFor(work, 'gate', { ...empty, evidence })).toEqual([]);
  expect(guardFor(work, 'deliver', { ...empty, unproven: ['gate test failing'] })).toEqual([
    'not proven: gate test failing',
  ]);
  expect(guardFor(work, 'deliver', { ...empty, proven: true })).toEqual([]);
});

test('advancePhase follows the route and stops at a failing guard', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  const work = createWork(paths, 'fix');
  applyClassification(work, 'fix', { route: 'fast', reasons: [], riskAreas: [] });
  expect(advancePhase(work, empty)).toEqual({
    ok: false,
    missing: ['at least one acceptance criterion (crew criteria <id> add "...")'],
  });
  addCriterion(work, 'x');
  expect(advancePhase(work, empty)).toEqual({ ok: true, phase: 'build' });
  expect(work.phase).toBe('build');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/work.test.ts`
Expected: FAIL, cannot resolve `../src/work.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/work.ts
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { RouteDecision } from './classify.ts';
import { routeRank } from './classify.ts';
import { nowIso, writeText } from './fs.ts';
import { type CrewPaths, workDir } from './paths.ts';
import { loadState, saveState } from './state.ts';
import { readProtectedJson, writeProtectedJson } from './store.ts';
import type {
  Criterion,
  CriterionKind,
  Evidence,
  Phase,
  Route,
  WorkItem,
  WorkType,
} from './types.ts';
import { PHASE_ORDER } from './types.ts';

export const PHASES_BY_ROUTE: Record<Route, Phase[]> = {
  fast: ['receive', 'recognize', 'build', 'gate', 'deliver'],
  standard: ['receive', 'recognize', 'understand', 'specify', 'plan', 'build', 'gate', 'deliver'],
  full: ['receive', 'recognize', 'understand', 'specify', 'plan', 'build', 'gate', 'deliver'],
};

export function slug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');
}

function workJson(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), 'work.json');
}

export function newWorkId(paths: CrewPaths, title: string): string {
  const date = nowIso().slice(0, 10);
  let existing = 0;
  try {
    existing = readdirSync(join(paths.crewDir, 'work')).filter((n) => n.startsWith(date)).length;
  } catch {
    existing = 0;
  }
  const seq = String(existing + 1).padStart(3, '0');
  return `${date}-${seq}-${slug(title).slice(0, 40).replace(/-$/, '')}`;
}

export function createWork(paths: CrewPaths, input: string): WorkItem {
  const title = (input.split('\n').find((line) => line.trim()) ?? 'untitled').trim().slice(0, 80);
  const at = nowIso();
  const work: WorkItem = {
    id: newWorkId(paths, title),
    title,
    input,
    type: 'feature',
    route: 'standard',
    routeReasons: ['not classified yet: standard by default'],
    riskAreas: [],
    phase: 'receive',
    awaiting: null,
    criteria: [],
    approvals: [],
    skips: [],
    createdAt: at,
    updatedAt: at,
  };
  writeProtectedJson(paths, workJson(paths, work.id), work);
  writeText(join(workDir(paths, work.id), 'brief.md'), `# Brief\n\n## Request\n\n${input.trim()}\n`);
  const state = loadState(paths);
  state.active = work.id;
  saveState(paths, state);
  return work;
}

export function saveWork(paths: CrewPaths, work: WorkItem): void {
  work.updatedAt = nowIso();
  writeProtectedJson(paths, workJson(paths, work.id), work);
}

export function loadWork(paths: CrewPaths, id: string): { work: WorkItem | null; tampered: boolean } {
  const read = readProtectedJson<WorkItem>(paths, workJson(paths, id));
  return { work: read.data, tampered: read.tampered };
}

export function activeWork(paths: CrewPaths): { work: WorkItem | null; tampered: boolean } | null {
  const id = loadState(paths).active;
  if (!id || !existsSync(workJson(paths, id))) return null;
  return loadWork(paths, id);
}

export function applyClassification(work: WorkItem, type: WorkType, decision: RouteDecision): void {
  work.type = type;
  work.route = decision.route;
  work.routeReasons = [...decision.reasons];
  work.riskAreas = [...decision.riskAreas];
  if (work.phase === 'receive') work.phase = 'recognize';
}

export function raiseRoute(work: WorkItem, to: Route, reason: string): boolean {
  if (routeRank(to) <= routeRank(work.route)) return false;
  work.route = to;
  work.routeReasons.push(`raised to ${to}: ${reason}`);
  return true;
}

export function addCriterion(work: WorkItem, text: string, kind: CriterionKind = 'behavior'): Criterion {
  const criterion: Criterion = { id: `AC-${work.criteria.length + 1}`, kind, text: text.trim() };
  work.criteria.push(criterion);
  return criterion;
}

export function approve(work: WorkItem, what: 'spec'): void {
  work.approvals.push({ what, at: nowIso() });
}

export function addSkip(work: WorkItem, step: string, reason: string): void {
  work.skips.push({ step, reason, at: nowIso() });
}

export function isSkipped(work: WorkItem, step: string): boolean {
  return work.skips.some((s) => s.step === step);
}

export function phaseIndex(phase: Phase): number {
  return PHASE_ORDER.indexOf(phase);
}

export function isBeforeBuild(work: WorkItem): boolean {
  return phaseIndex(work.phase) < phaseIndex('build');
}

export function hasAcceptanceSection(text: string): boolean {
  const match = /^#{1,6}\s*acceptance criteria\s*$/im.exec(text);
  if (!match) return false;
  const rest = text.slice(match.index + match[0].length);
  const body = rest.split(/^#{1,6}\s/m)[0] ?? '';
  return body.trim().length > 0;
}

export interface GuardContext {
  specText: string | null;
  planExists: boolean;
  evidence: Evidence | null;
  proven: boolean;
  unproven: string[];
}

export function guardFor(work: WorkItem, next: Phase, ctx: GuardContext): string[] {
  const missing: string[] = [];
  if (next === 'build') {
    if (work.criteria.length === 0) {
      missing.push('at least one acceptance criterion (crew criteria <id> add "...")');
    }
    if (work.route !== 'fast') {
      if (ctx.specText === null) missing.push('spec.md in the work folder');
      else if (!hasAcceptanceSection(ctx.specText)) {
        missing.push('an "Acceptance criteria" section with content in spec.md');
      }
    }
    if (work.route === 'full') {
      if (!work.approvals.some((a) => a.what === 'spec')) {
        missing.push("the user's approval of the spec (crew approve <id> spec)");
      }
      if (!ctx.planExists) missing.push('plan.md in the work folder');
    }
  } else if (next === 'gate') {
    for (const criterion of work.criteria) {
      if (isSkipped(work, `tdd:${criterion.id}`)) continue;
      const record = ctx.evidence?.tdd.find((t) => t.criterion === criterion.id);
      const done =
        criterion.kind === 'behavior' ? !!record?.red && !!record?.green : !!record?.before && !!record?.after;
      if (!done) {
        const how = criterion.kind === 'behavior' ? 'red/green' : 'before/after';
        missing.push(`test-first record for ${criterion.id} (crew tdd ${how})`);
      }
    }
  } else if (next === 'deliver' && !ctx.proven) {
    missing.push(...ctx.unproven.map((reason) => `not proven: ${reason}`));
    if (missing.length === 0) missing.push('not proven: run crew gate run <id>');
  }
  return missing;
}

export function nextPhaseOf(work: WorkItem): Phase | null {
  const phases = PHASES_BY_ROUTE[work.route];
  const index = phases.indexOf(work.phase);
  // A phase that the current route does not list (after a route change) resumes at the next listed one.
  const current = index === -1 ? phases.findIndex((p) => phaseIndex(p) > phaseIndex(work.phase)) - 1 : index;
  return phases[current + 1] ?? null;
}

export function advancePhase(
  work: WorkItem,
  ctx: GuardContext,
): { ok: true; phase: Phase } | { ok: false; missing: string[] } {
  const next = nextPhaseOf(work);
  if (!next) return { ok: false, missing: ['already at the last phase'] };
  const missing = guardFor(work, next, ctx);
  if (missing.length) return { ok: false, missing };
  work.phase = next;
  return { ok: true, phase: next };
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/work.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/work.ts packages/engine/tests/work.test.ts
git commit -m "feat(engine): work items, phases and guards"
```

---

### Task 13: Command runner with timeout and log

**Files:**
- Create: `packages/engine/src/run.ts`
- Test: `packages/engine/tests/run.test.ts`

**Interfaces:**
- Produces: `interface RunOptions { cwd; timeoutMs; logPath; env?; stdin? }`, `interface RunResult { exit: number | null; durationMs; tail: string; timedOut: boolean }`, `runCommand(command: string, options: RunOptions): Promise<RunResult>`. Runs through the shell, writes all output to `logPath`, keeps the last 40 lines in `tail`, kills the whole process group at the timeout.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/run.test.ts
import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCommand } from '../src/run.ts';
import { tempDir } from './helpers.ts';

test('captures exit code, tail and a log file', async () => {
  const dir = tempDir();
  const log = join(dir, 'logs', 'a.txt');
  const result = await runCommand('echo one; echo two; echo err 1>&2; exit 3', {
    cwd: dir,
    timeoutMs: 5000,
    logPath: log,
  });
  expect(result.exit).toBe(3);
  expect(result.timedOut).toBe(false);
  expect(result.tail).toContain('two');
  expect(result.tail).toContain('err');
  expect(readFileSync(log, 'utf8')).toContain('one');
});

test('a hanging command is killed at the timeout, children included', async () => {
  const dir = tempDir();
  const started = Date.now();
  const result = await runCommand('sleep 30 & sleep 30; echo never', {
    cwd: dir,
    timeoutMs: 300,
    logPath: join(dir, 'hang.txt'),
  });
  expect(result.timedOut).toBe(true);
  expect(result.exit).not.toBe(0);
  expect(Date.now() - started).toBeLessThan(5000);
  expect(result.tail).not.toContain('never');
});

test('stdin is passed through when given', async () => {
  const dir = tempDir();
  const result = await runCommand('cat', { cwd: dir, timeoutMs: 5000, logPath: join(dir, 'c.txt'), stdin: 'hello' });
  expect(result.exit).toBe(0);
  expect(result.tail).toBe('hello');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/run.test.ts`
Expected: FAIL, cannot resolve `../src/run.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/run.ts
import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  logPath: string;
  env?: NodeJS.ProcessEnv;
  stdin?: string;
}

export interface RunResult {
  exit: number | null;
  durationMs: number;
  tail: string;
  timedOut: boolean;
}

const TAIL_LINES = 40;

function killTree(pid: number | undefined): void {
  if (!pid) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F']);
    else process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Already gone.
    }
  }
}

export function runCommand(command: string, options: RunOptions): Promise<RunResult> {
  mkdirSync(dirname(options.logPath), { recursive: true });
  const log = createWriteStream(options.logPath);
  const lines: string[] = [];
  let partial = '';
  const absorb = (chunk: Buffer): void => {
    log.write(chunk);
    partial += chunk.toString('utf8');
    const pieces = partial.split('\n');
    partial = pieces.pop() ?? '';
    for (const line of pieces) {
      lines.push(line);
      if (lines.length > TAIL_LINES) lines.shift();
    }
  };
  const started = Date.now();
  return new Promise((resolve) => {
    // A detached child leads its own process group, so the timeout can kill it and everything it started.
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      detached: process.platform !== 'win32',
      env: options.env ?? process.env,
      stdio: [options.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, options.timeoutMs);
    child.stdout?.on('data', absorb);
    child.stderr?.on('data', absorb);
    if (options.stdin !== undefined) child.stdin?.end(options.stdin);
    const finish = (exit: number | null): void => {
      clearTimeout(timer);
      if (partial) lines.push(partial);
      log.end();
      resolve({
        exit,
        durationMs: Date.now() - started,
        tail: lines.slice(-TAIL_LINES).join('\n'),
        timedOut,
      });
    };
    child.on('error', (error) => {
      absorb(Buffer.from(`${error.message}\n`));
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/run.test.ts`
Expected: 3 pass, the second within a few hundred milliseconds.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/run.ts packages/engine/tests/run.test.ts
git commit -m "feat(engine): command runner with timeout and log"
```

---

### Task 14: Evidence, verdict and report

**Files:**
- Create: `packages/engine/src/evidence.ts`
- Test: `packages/engine/tests/evidence.test.ts`

**Interfaces:**
- Consumes: `Evidence`, `GateRun`, `WorkItem`, store, `isSkipped`.
- Produces: `emptyEvidence(): Evidence`, `loadEvidence(paths, id): { evidence; tampered }`, `saveEvidence(paths, id, evidence)`, `interface PlannedGate { gate: GateName; target: string }`, `interface VerdictInput { work; evidence; expected: PlannedGate[]; currentFingerprint: string; tampered: boolean }`, `computeVerdict(input): { verdict: 'proven' | 'unproven'; unproven: string[] }`, `renderReport(work, evidence): string`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/evidence.test.ts
import { expect, test } from 'bun:test';
import { computeVerdict, emptyEvidence, loadEvidence, renderReport, saveEvidence } from '../src/evidence.ts';
import { resolvePaths } from '../src/paths.ts';
import type { Evidence, GateRun, RunRecord, WorkItem } from '../src/types.ts';
import { addCriterion, addSkip, createWork } from '../src/work.ts';
import { makeRepo, testEnv } from './helpers.ts';

const run: RunRecord = { command: 'npm run test', exit: 0, at: 't', durationMs: 5, log: 'logs/x', tail: '', timedOut: false };
function gate(gate: GateRun['gate'], status: GateRun['status'], extra: Partial<GateRun> = {}): GateRun {
  return { gate, target: '.', command: 'cmd', commandSource: 'detected', confirmed: true, exit: status === 'pass' ? 0 : 1, status, durationMs: 1, at: 't', log: null, tail: '', ...extra };
}
function workWith(paths: ReturnType<typeof resolvePaths>): WorkItem {
  const work = createWork(paths, 'fix');
  addCriterion(work, 'x');
  return work;
}

test('evidence loads empty and round-trips', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  const work = workWith(paths);
  expect(loadEvidence(paths, work.id)).toEqual({ evidence: emptyEvidence(), tampered: false });
  const evidence: Evidence = { ...emptyEvidence(), fingerprint: 'f' };
  saveEvidence(paths, work.id, evidence);
  expect(loadEvidence(paths, work.id).evidence.fingerprint).toBe('f');
});

test('the verdict names every reason the work is not proven', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  const work = workWith(paths);
  const expected = [{ gate: 'secrets' as const, target: '.' }, { gate: 'test' as const, target: '.' }, { gate: 'lint' as const, target: '.' }];
  const evidence: Evidence = {
    fingerprint: 'old',
    tdd: [],
    runs: [gate('secrets', 'pass'), gate('test', 'fail'), gate('lint', 'unavailable', { reason: 'no command' })],
    verdict: 'unproven',
    unproven: [],
  };
  expect(computeVerdict({ work, evidence, expected, currentFingerprint: 'new', tampered: true })).toEqual({
    verdict: 'unproven',
    unproven: [
      'state changed outside the engine',
      'code changed since the last gate run',
      'gate test failing',
      'gate lint unavailable: no command',
      'test-first record missing for AC-1',
    ],
  });
});

test('skips, unconfirmed commands and a matching fingerprint', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  const work = workWith(paths);
  addSkip(work, 'gate:lint', 'legacy code');
  addSkip(work, 'tdd:AC-1', 'manual');
  const expected = [{ gate: 'test' as const, target: '.' }, { gate: 'lint' as const, target: '.' }];
  const evidence: Evidence = { fingerprint: 'f', tdd: [], runs: [gate('test', 'pass', { confirmed: false, commandSource: 'proposed' })], verdict: 'unproven', unproven: [] };
  expect(computeVerdict({ work, evidence, expected, currentFingerprint: 'f', tampered: false }).unproven).toEqual([
    'gate test ran an unconfirmed command (crew profile confirm)',
  ]);
  const confirmed: Evidence = { ...evidence, runs: [gate('test', 'pass')], tdd: [{ criterion: 'AC-1', red: run, green: run }] };
  expect(computeVerdict({ work, evidence: confirmed, expected, currentFingerprint: 'f', tampered: false })).toEqual({ verdict: 'proven', unproven: [] });
});

test('the report says what was proven and what was not', () => {
  const paths = resolvePaths(makeRepo(), testEnv());
  const work = workWith(paths);
  addSkip(work, 'gate:lint', 'legacy code');
  const evidence: Evidence = { fingerprint: 'f', tdd: [{ criterion: 'AC-1', red: { ...run, exit: 1 }, green: run }], runs: [gate('test', 'pass'), gate('deps', 'fail')], verdict: 'unproven', unproven: ['gate deps failing'] };
  const report = renderReport(work, evidence);
  expect(report).toContain('# Report: fix');
  expect(report).toContain('**Not proven**');
  expect(report).toContain('gate deps failing');
  expect(report).toContain('| AC-1 | behavior | x | red then green |');
  expect(report).toContain('| test | . | pass |');
  expect(report).toContain('gate:lint');
  expect(report).toContain('legacy code');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/evidence.test.ts`
Expected: FAIL, cannot resolve `../src/evidence.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/evidence.ts
import { join } from 'node:path';
import { type CrewPaths, workDir } from './paths.ts';
import { readProtectedJson, writeProtectedJson } from './store.ts';
import type { Evidence, GateName, TddRecord, WorkItem } from './types.ts';
import { isSkipped } from './work.ts';

export function emptyEvidence(): Evidence {
  return { fingerprint: null, tdd: [], runs: [], verdict: 'unproven', unproven: ['gates have not run'] };
}

function evidencePath(paths: CrewPaths, id: string): string {
  return join(workDir(paths, id), 'evidence.json');
}

export function loadEvidence(paths: CrewPaths, id: string): { evidence: Evidence; tampered: boolean } {
  const read = readProtectedJson<Evidence>(paths, evidencePath(paths, id));
  return { evidence: read.data ?? emptyEvidence(), tampered: read.tampered };
}

export function saveEvidence(paths: CrewPaths, id: string, evidence: Evidence): void {
  writeProtectedJson(paths, evidencePath(paths, id), evidence);
}

export interface PlannedGate {
  gate: GateName;
  target: string;
}

export interface VerdictInput {
  work: WorkItem;
  evidence: Evidence;
  expected: PlannedGate[];
  currentFingerprint: string;
  tampered: boolean;
}

function tddDone(record: TddRecord | undefined, kind: 'behavior' | 'preserve'): boolean {
  if (!record) return false;
  return kind === 'behavior' ? !!record.red && !!record.green : !!record.before && !!record.after;
}

export function computeVerdict(input: VerdictInput): { verdict: 'proven' | 'unproven'; unproven: string[] } {
  const { work, evidence, expected, currentFingerprint, tampered } = input;
  const unproven: string[] = [];
  if (tampered) unproven.push('state changed outside the engine');
  if (evidence.fingerprint === null) unproven.push('gates have not run');
  else if (evidence.fingerprint !== currentFingerprint) unproven.push('code changed since the last gate run');
  const multiTarget = new Set(expected.map((e) => e.target)).size > 1;
  for (const { gate, target } of expected) {
    if (isSkipped(work, `gate:${gate}`)) continue;
    const label = multiTarget && target !== '.' ? `${gate} (${target})` : gate;
    const run = evidence.runs.find((r) => r.gate === gate && r.target === target);
    if (!run) unproven.push(`gate ${label} not run`);
    else if (run.status === 'fail') unproven.push(`gate ${label} failing`);
    else if (run.status === 'unavailable') unproven.push(`gate ${label} unavailable: ${run.reason ?? 'no command'}`);
    else if (run.status === 'pass' && !run.confirmed) {
      unproven.push(`gate ${label} ran an unconfirmed command (crew profile confirm)`);
    }
  }
  for (const criterion of work.criteria) {
    if (isSkipped(work, `tdd:${criterion.id}`)) continue;
    const record = evidence.tdd.find((t) => t.criterion === criterion.id);
    if (!tddDone(record, criterion.kind)) unproven.push(`test-first record missing for ${criterion.id}`);
  }
  return { verdict: unproven.length === 0 ? 'proven' : 'unproven', unproven };
}

function tddSummary(work: WorkItem, evidence: Evidence, criterionId: string, kind: 'behavior' | 'preserve'): string {
  if (isSkipped(work, `tdd:${criterionId}`)) {
    const skip = work.skips.find((s) => s.step === `tdd:${criterionId}`);
    return `skipped: ${skip?.reason ?? ''}`;
  }
  const record = evidence.tdd.find((t) => t.criterion === criterionId);
  if (tddDone(record, kind)) return kind === 'behavior' ? 'red then green' : 'passing before and after';
  if (record?.red || record?.before) return kind === 'behavior' ? 'red only' : 'before only';
  return 'missing';
}

export function renderReport(work: WorkItem, evidence: Evidence): string {
  const lines: string[] = [];
  lines.push(`# Report: ${work.title}`, '');
  lines.push(`- Work: \`${work.id}\``);
  lines.push(`- Type: ${work.type}. Route: ${work.route} (${work.routeReasons.join('; ')})`);
  lines.push(`- Verdict: **${evidence.verdict === 'proven' ? 'Proven' : 'Not proven'}**`, '');
  if (evidence.unproven.length) {
    lines.push('## Not proven', '');
    for (const reason of evidence.unproven) lines.push(`- ${reason}`);
    lines.push('');
  }
  lines.push('## Acceptance criteria', '', '| Id | Kind | Criterion | Test-first |', '| :- | :- | :- | :- |');
  for (const c of work.criteria) {
    lines.push(`| ${c.id} | ${c.kind} | ${c.text.replace(/\|/g, '\\|')} | ${tddSummary(work, evidence, c.id, c.kind)} |`);
  }
  lines.push('', '## Gates', '', '| Gate | Target | Status | Command | Duration | Log |', '| :- | :- | :- | :- | -: | :- |');
  for (const r of evidence.runs) {
    const status = r.status === 'skipped' || r.status === 'unavailable' ? `${r.status}${r.reason ? `: ${r.reason}` : ''}` : r.status;
    lines.push(`| ${r.gate} | ${r.target} | ${status} | ${r.command ? `\`${r.command}\`` : ''} | ${r.durationMs} ms | ${r.log ?? ''} |`);
  }
  if (work.skips.length) {
    lines.push('', '## Skipped by the user', '');
    for (const s of work.skips) lines.push(`- \`${s.step}\`: ${s.reason} (${s.at})`);
  }
  lines.push('', `Fingerprint: ${evidence.fingerprint ?? 'none'}`, '');
  return lines.join('\n');
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/evidence.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/evidence.ts packages/engine/tests/evidence.test.ts
git commit -m "feat(engine): evidence, verdict and report"
```

---

### Task 15: Proven test-first

**Files:**
- Create: `packages/engine/src/tdd.ts`
- Test: `packages/engine/tests/tdd.test.ts`

**Interfaces:**
- Consumes: `runCommand`, `changedWatchedPaths`, `matchesAny`, `Evidence`, `Profile`, `WorkItem`.
- Produces: `type TddStep = 'red' | 'green' | 'before' | 'after'`, `defaultTestCommand(profile): { command; timeoutMs } | null`, `recordTdd(paths, work, evidence, profile, criterionId, step, override?): Promise<{ ok: boolean; message: string; record?: RunRecord }>`. Mutates `evidence.tdd`; the caller saves.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/tdd.test.ts
import { expect, test } from 'bun:test';
import { detectProfile } from '../src/detect/index.ts';
import { emptyEvidence } from '../src/evidence.ts';
import { resolvePaths } from '../src/paths.ts';
import { recordTdd } from '../src/tdd.ts';
import { addCriterion, createWork } from '../src/work.ts';
import { makeRepo, testEnv, write } from './helpers.ts';

function setup() {
  const root = makeRepo({ 'package.json': JSON.stringify({ scripts: { test: 'sh run-tests.sh' } }), 'run-tests.sh': 'exit 1\n' });
  const paths = resolvePaths(root, testEnv());
  const profile = detectProfile(root);
  const work = createWork(paths, 'fix');
  const behaviour = addCriterion(work, 'x');
  const preserve = addCriterion(work, 'keep', 'preserve');
  return { root, paths, profile, work, behaviour, preserve, evidence: emptyEvidence() };
}

test('red must fail, green must pass after red, and test files are recorded', async () => {
  const s = setup();
  write(s.root, 'tests/cart.test.js', 'new test');
  const red = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, 'red');
  expect(red.ok).toBe(true);
  expect(s.evidence.tdd[0]?.red?.exit).toBe(1);
  expect(s.evidence.tdd[0]?.red?.changedTests).toEqual(['tests/cart.test.js']);
  const early = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, 'green');
  expect(early.ok).toBe(false);
  expect(early.message).toMatch(/failed/);
  write(s.root, 'run-tests.sh', 'exit 0\n');
  const green = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, 'green');
  expect(green.ok).toBe(true);
  expect(s.evidence.tdd[0]?.green?.exit).toBe(0);
});

test('a passing red run is rejected and green needs an earlier red', async () => {
  const s = setup();
  write(s.root, 'run-tests.sh', 'exit 0\n');
  const red = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, 'red');
  expect(red.ok).toBe(false);
  expect(red.message).toMatch(/proves nothing/);
  const green = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, 'green');
  expect(green.ok).toBe(false);
  expect(green.message).toMatch(/no red run/);
});

test('preserve criteria use before and after, and kinds are enforced', async () => {
  const s = setup();
  write(s.root, 'run-tests.sh', 'exit 0\n');
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, 'red')).message).toMatch(/preserve/);
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, 'after')).message).toMatch(/no before run/);
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, 'before')).ok).toBe(true);
  expect((await recordTdd(s.paths, s.work, s.evidence, s.profile, s.preserve.id, 'after')).ok).toBe(true);
});

test('an explicit command overrides the profile, and no command is an error', async () => {
  const s = setup();
  const red = await recordTdd(s.paths, s.work, s.evidence, s.profile, s.behaviour.id, 'red', 'exit 7');
  expect(red.ok).toBe(true);
  expect(s.evidence.tdd[0]?.red?.command).toBe('exit 7');
  const bare = { ...s.profile, targets: [] };
  const none = await recordTdd(s.paths, s.work, emptyEvidence(), bare, s.behaviour.id, 'red');
  expect(none.message).toMatch(/no test command/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/tdd.test.ts`
Expected: FAIL, cannot resolve `../src/tdd.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/tdd.ts
import { join } from 'node:path';
import { changedWatchedPaths } from './fingerprint.ts';
import { nowIso } from './fs.ts';
import { matchesAny } from './glob.ts';
import { type CrewPaths, workDir } from './paths.ts';
import { runCommand } from './run.ts';
import type { Evidence, Profile, RunRecord, WorkItem } from './types.ts';

export type TddStep = 'red' | 'green' | 'before' | 'after';

const TEST_PATTERNS = ['**/*test*', '**/*spec*', 'tests/**', 'test/**', '**/__tests__/**'];

export function defaultTestCommand(profile: Profile): { command: string; timeoutMs: number } | null {
  const target = profile.targets.find((t) => t.path === '.' && t.gates.test) ?? profile.targets.find((t) => t.gates.test);
  return target?.gates.test ? { command: target.gates.test.command, timeoutMs: target.timeoutMs } : null;
}

export interface TddOutcome {
  ok: boolean;
  message: string;
  record?: RunRecord;
}

export async function recordTdd(
  paths: CrewPaths,
  work: WorkItem,
  evidence: Evidence,
  profile: Profile,
  criterionId: string,
  step: TddStep,
  override?: string,
): Promise<TddOutcome> {
  const criterion = work.criteria.find((c) => c.id === criterionId);
  if (!criterion) return { ok: false, message: `unknown criterion ${criterionId}` };
  const behaviourStep = step === 'red' || step === 'green';
  if (behaviourStep !== (criterion.kind === 'behavior')) {
    return {
      ok: false,
      message:
        criterion.kind === 'behavior'
          ? `${criterionId} is a behavior criterion: record red, then green`
          : `${criterionId} is a preserve criterion: record before, then after`,
    };
  }
  const fallback = defaultTestCommand(profile);
  const command = override ?? fallback?.command;
  if (!command) {
    return { ok: false, message: 'no test command: set one with crew profile set test "<cmd>" or pass -- <cmd>' };
  }
  let entry = evidence.tdd.find((t) => t.criterion === criterionId);
  if (!entry) {
    entry = { criterion: criterionId };
    evidence.tdd.push(entry);
  }
  if (step === 'green' && !entry.red) return { ok: false, message: `no red run recorded for ${criterionId}: run crew tdd red first` };
  if (step === 'after' && !entry.before) return { ok: false, message: `no before run recorded for ${criterionId}: run crew tdd before first` };

  const log = `logs/tdd-${criterionId}-${step}-${Date.now()}.txt`;
  const result = await runCommand(command, {
    cwd: paths.root,
    timeoutMs: fallback?.timeoutMs ?? 10 * 60 * 1000,
    logPath: join(workDir(paths, work.id), log),
  });
  const record: RunRecord = {
    command,
    exit: result.exit,
    at: nowIso(),
    durationMs: result.durationMs,
    log,
    tail: result.tail,
    timedOut: result.timedOut,
  };
  const passed = result.exit === 0 && !result.timedOut;
  if (step === 'red') {
    if (passed) {
      return { ok: false, message: 'the test passed before the change; a test that passes before the code exists proves nothing', record };
    }
    record.changedTests = changedWatchedPaths(paths.root, profile).filter((p) => matchesAny(p, TEST_PATTERNS));
    entry.red = record;
    return { ok: true, message: `red recorded for ${criterionId} (exit ${result.exit})`, record };
  }
  if (!passed) {
    return { ok: false, message: `${step} run failed (exit ${result.exit}${result.timedOut ? ', timed out' : ''}); nothing recorded`, record };
  }
  entry[step] = record;
  return { ok: true, message: `${step} recorded for ${criterionId}`, record };
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/tdd.test.ts`
Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/tdd.ts packages/engine/tests/tdd.test.ts
git commit -m "feat(engine): proven test-first records"
```

---

### Task 16: Secret scan

**Files:**
- Create: `packages/engine/src/secrets.ts`
- Test: `packages/engine/tests/secrets.test.ts`

**Interfaces:**
- Consumes: `gitChangedPaths`, `allWatchedFiles`, `isGitRepo`, `isWatched`.
- Produces: `interface Finding { source: string; line: number; rule: string }`, `scanText(text, source): Finding[]`, `isBinary(buffer): boolean`, `changedText(root, profile): { source: string; text: string }[]`, `scanSecrets(root, profile): Promise<{ status: 'pass' | 'fail'; findings: Finding[]; tail: string; usedGitleaks: boolean }>`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/secrets.test.ts
import { expect, test } from 'bun:test';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { detectProfile } from '../src/detect/index.ts';
import { changedText, isBinary, scanSecrets, scanText } from '../src/secrets.ts';
import { git, makeRepo, write } from './helpers.ts';

test('scanText finds known key formats and ignores placeholders', () => {
  const text = [
    'const aws = "AKIAIOSFODNN7EXAMPLE1";',
    '-----BEGIN RSA PRIVATE KEY-----',
    'token = "abcdefghijklmnopqrstuvwxyz123456"',
    'password: "your_password_here_1234567890"',
    'const fine = 1;',
  ].join('\n');
  expect(scanText(text, 'x.ts').map((f) => `${f.line}:${f.rule}`)).toEqual([
    '1:AWS access key',
    '2:private key',
    '3:generic secret assignment',
  ]);
});

test('changedText covers added lines of tracked files and whole untracked files, skipping binaries', () => {
  const root = makeRepo({ 'src/a.ts': 'const a = 1;\nconst b = 2;\n' });
  const profile = detectProfile(root);
  write(root, 'src/a.ts', 'const a = 1;\nconst b = "AKIAIOSFODNN7EXAMPLE1";\n');
  write(root, 'src/new.ts', 'x');
  writeFileSync(join(root, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]));
  const sources = changedText(root, profile);
  expect(sources.map((s) => s.source)).toEqual(['git diff HEAD (added lines)', 'src/new.ts']);
  expect(sources[0]?.text).toBe('const b = "AKIAIOSFODNN7EXAMPLE1";');
  expect(isBinary(Buffer.from([0x89, 0x50, 0x00]))).toBe(true);
});

test('scanSecrets fails on a leaked key in an untracked file and passes when clean', async () => {
  const root = makeRepo({ 'src/a.ts': 'ok' });
  const profile = detectProfile(root);
  expect((await scanSecrets(root, profile)).status).toBe('pass');
  write(root, '.env.local', 'STRIPE_KEY=sk_live_abcdefghijklmnop1234\n');
  const result = await scanSecrets(root, profile);
  expect(result.status).toBe('fail');
  expect(result.findings[0]).toMatchObject({ source: '.env.local', rule: 'Stripe key' });
  expect(result.tail).toContain('.env.local:1');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'leak');
  expect((await scanSecrets(root, profile)).status).toBe('pass');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/secrets.test.ts`
Expected: FAIL, cannot resolve `../src/secrets.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/secrets.ts
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allWatchedFiles, isGitRepo, isWatched } from './fingerprint.ts';
import type { Profile } from './types.ts';

export interface Finding {
  source: string;
  line: number;
  rule: string;
}

const RULES: { rule: string; pattern: RegExp; generic?: boolean }[] = [
  { rule: 'private key', pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { rule: 'AWS access key', pattern: /\bAKIA[0-9A-Z]{16,}\b/ },
  { rule: 'GitHub token', pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/ },
  { rule: 'Stripe key', pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { rule: 'Slack token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { rule: 'Anthropic key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { rule: 'OpenAI key', pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { rule: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    rule: 'generic secret assignment',
    pattern: /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{16,}['"]/i,
    generic: true,
  },
];

const PLACEHOLDER = /example|placeholder|your[_-]|xxx|changeme|dummy|<[^>]+>/i;
const MAX_BYTES = 1024 * 1024;

export function scanText(text: string, source: string): Finding[] {
  const findings: Finding[] = [];
  text.split('\n').forEach((line, index) => {
    for (const { rule, pattern, generic } of RULES) {
      if (generic && PLACEHOLDER.test(line)) continue;
      if (pattern.test(line)) {
        findings.push({ source, line: index + 1, rule });
        break;
      }
    }
  });
  return findings;
}

export function isBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0);
}

export interface ScanSource {
  source: string;
  text: string;
}

function fileSource(root: string, path: string): ScanSource | null {
  let buffer: Buffer;
  try {
    buffer = readFileSync(join(root, path));
  } catch {
    return null;
  }
  if (buffer.length > MAX_BYTES || isBinary(buffer)) return null;
  return { source: path, text: buffer.toString('utf8') };
}

function untrackedPaths(root: string): string[] {
  try {
    return execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .split('\0')
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

/** Only what this change adds is scanned: added lines of tracked files, and untracked files whole. */
export function changedText(root: string, profile: Profile): ScanSource[] {
  const sources: ScanSource[] = [];
  if (!isGitRepo(root)) {
    for (const path of allWatchedFiles(root, profile)) {
      const source = fileSource(root, path);
      if (source) sources.push(source);
    }
    return sources;
  }
  let diff = '';
  try {
    diff = execFileSync('git', ['diff', 'HEAD', '--unified=0', '--no-color', '--', '.'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    diff = '';
  }
  const added = diff.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)).join('\n');
  if (added) sources.push({ source: 'git diff HEAD (added lines)', text: added });
  for (const path of untrackedPaths(root)) {
    if (!isWatched(path, profile)) continue;
    const source = fileSource(root, path);
    if (source) sources.push(source);
  }
  return sources;
}

/** Optional second opinion. An older gitleaks without the `stdin` command exits 1 with a usage error, so a leak needs the word in the output too. */
function gitleaks(text: string): { ran: boolean; leaked: boolean; tail: string } {
  const result = spawnSync('gitleaks', ['stdin', '--no-banner', '--redact', '--exit-code', '1'], { input: text, encoding: 'utf8' });
  if (result.error || result.status === null || (result.status !== 0 && result.status !== 1)) return { ran: false, leaked: false, tail: '' };
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (result.status === 1 && !/leak/i.test(output)) return { ran: false, leaked: false, tail: '' };
  return { ran: true, leaked: result.status === 1, tail: output.trim().split('\n').slice(-20).join('\n') };
}

export async function scanSecrets(root: string, profile: Profile): Promise<{ status: 'pass' | 'fail'; findings: Finding[]; tail: string; usedGitleaks: boolean }> {
  const sources = changedText(root, profile);
  const findings = sources.flatMap((s) => scanText(s.text, s.source));
  const lines = findings.map((f) => `${f.source}:${f.line}: ${f.rule}`);
  const extra = gitleaks(sources.map((s) => s.text).join('\n'));
  if (extra.ran && extra.leaked) lines.push('gitleaks:', extra.tail);
  const status = findings.length === 0 && !(extra.ran && extra.leaked) ? 'pass' : 'fail';
  return { status, findings, tail: lines.join('\n') || 'no secrets found in the change', usedGitleaks: extra.ran };
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/secrets.test.ts`
Expected: 3 pass. If `gitleaks` is installed on the machine, the untracked `.env.local` is also reported by it; the assertions still hold.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/secrets.ts packages/engine/tests/secrets.test.ts
git commit -m "feat(engine): built-in secret scan of the change"
```

---

### Task 17: Profile storage, gates and assessment

**Files:**
- Create: `packages/engine/src/profile.ts`, `packages/engine/src/gates.ts`
- Test: `packages/engine/tests/gates.test.ts`

**Interfaces:**
- From `profile.ts`: `profilePath(paths)`, `loadProfile(paths): { profile: Profile | null; tampered: boolean }`, `saveProfile(paths, profile)`, `ensureProfile(paths): { profile: Profile; tampered: boolean }` (detects and saves when missing).
- From `gates.ts`: `manifestChanged(changed: string[]): boolean`, `depsAuditCommand(target: Target): string | null`, `gatesForTarget(route, target, policy, changed): GateName[]`, `plannedGates(route, profile, policy, changed): PlannedGate[]`, `runGates(paths, work, profile, policy, options?: { only?: GateName[] }): Promise<GateOutcome>` where `GateOutcome = { evidence; verdict; unproven; planned; changed; raised: string | null }`, `assess(paths, work, profile, policy, tampered?): Assessment` where `Assessment = { evidence; verdict; unproven; expected; changed }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/gates.test.ts
import { expect, test } from 'bun:test';
import { detectProfile } from '../src/detect/index.ts';
import { assess, depsAuditCommand, gatesForTarget, manifestChanged, plannedGates, runGates } from '../src/gates.ts';
import { resolvePaths } from '../src/paths.ts';
import { DEFAULT_POLICY } from '../src/policy.ts';
import { ensureProfile, loadProfile } from '../src/profile.ts';
import type { Target } from '../src/types.ts';
import { addCriterion, addSkip, createWork } from '../src/work.ts';
import { makeRepo, testEnv, write } from './helpers.ts';

const target: Target = {
  path: '.',
  stack: 'node',
  packageManager: 'pnpm',
  gates: { test: { command: 't', source: 'detected' }, lint: { command: 'l', source: 'detected' } },
  timeoutMs: 1000,
};

test('planned gates follow the route table', () => {
  expect(gatesForTarget('fast', target, DEFAULT_POLICY, ['src/a.ts'])).toEqual(['test', 'lint']);
  expect(gatesForTarget('fast', target, DEFAULT_POLICY, ['package.json'])).toEqual(['test', 'lint', 'deps']);
  expect(gatesForTarget('full', target, DEFAULT_POLICY, [])).toEqual(['test', 'lint', 'deps']);
  expect(gatesForTarget('fast', target, { ...DEFAULT_POLICY, requiredGates: ['typecheck'] }, [])).toEqual(['test', 'lint', 'typecheck']);
  expect(manifestChanged(['a/requirements-dev.txt'])).toBe(true);
  expect(depsAuditCommand(target)).toBe('pnpm audit --audit-level=high');
  expect(depsAuditCommand({ ...target, stack: 'php', packageManager: 'composer' })).toBe('composer audit');
  const profile = { version: 1 as const, detectedAt: '', targets: [target, { ...target, path: 'apps/api' }], watch: { exclude: [] } };
  expect(plannedGates('fast', profile, DEFAULT_POLICY, ['src/a.ts'])).toEqual([
    { gate: 'secrets', target: '.' },
    { gate: 'test', target: '.' },
    { gate: 'lint', target: '.' },
  ]);
  expect(plannedGates('fast', profile, DEFAULT_POLICY, ['apps/api/x.php']).map((g) => g.target)).toEqual(['.', '.', '.', 'apps/api', 'apps/api']);
});

test('runGates records results, replaces old runs and computes the verdict', async () => {
  const root = makeRepo({ 'package.json': JSON.stringify({ scripts: { test: 'exit 0', lint: 'exit 1' } }), 'src/a.ts': 'x' });
  const paths = resolvePaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  expect(loadProfile(paths).profile?.targets[0]?.gates.test?.command).toBe('npm run test');
  const work = createWork(paths, 'fix');
  work.route = 'fast';
  addCriterion(work, 'x');
  write(root, 'src/a.ts', 'y');
  const first = await runGates(paths, work, profile, DEFAULT_POLICY);
  expect(first.evidence.runs.map((r) => `${r.gate}:${r.status}`)).toEqual(['secrets:pass', 'test:pass', 'lint:fail']);
  expect(first.unproven).toEqual(['gate lint failing', 'test-first record missing for AC-1']);
  addSkip(work, 'gate:lint', 'legacy');
  addSkip(work, 'tdd:AC-1', 'manual');
  const second = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ['test'] });
  expect(second.evidence.runs.filter((r) => r.gate === 'test')).toHaveLength(1);
  expect(second.verdict).toBe('proven');
  const later = assess(paths, work, profile, DEFAULT_POLICY);
  expect(later.verdict).toBe('proven');
  write(root, 'src/a.ts', 'z');
  expect(assess(paths, work, profile, DEFAULT_POLICY).unproven).toEqual(['code changed since the last gate run']);
});

test('a diff that touches a risk path raises the route to full', async () => {
  const root = makeRepo({ 'package.json': JSON.stringify({ scripts: { test: 'exit 0' } }), 'app/Auth/Guard.ts': 'x' });
  const paths = resolvePaths(root, testEnv());
  const { profile } = ensureProfile(paths);
  const work = createWork(paths, 'fix');
  work.route = 'fast';
  write(root, 'app/Auth/Guard.ts', 'y');
  const outcome = await runGates(paths, work, profile, DEFAULT_POLICY, { only: ['test'] });
  expect(outcome.raised).toBe('full');
  expect(work.route).toBe('full');
  expect(work.riskAreas).toEqual(['auth']);
  expect(work.routeReasons.at(-1)).toBe('raised to full: the change touches auth paths');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/gates.test.ts`
Expected: FAIL, cannot resolve `../src/gates.ts`.

- [ ] **Step 3: Write the two modules**

```ts
// packages/engine/src/profile.ts
import { join } from 'node:path';
import { detectProfile } from './detect/index.ts';
import type { CrewPaths } from './paths.ts';
import { readProtectedJson, writeProtectedJson } from './store.ts';
import type { Profile } from './types.ts';

export function profilePath(paths: CrewPaths): string {
  return join(paths.crewDir, 'profile.json');
}

export function loadProfile(paths: CrewPaths): { profile: Profile | null; tampered: boolean } {
  const read = readProtectedJson<Profile>(paths, profilePath(paths));
  return { profile: read.data, tampered: read.tampered };
}

export function saveProfile(paths: CrewPaths, profile: Profile): void {
  writeProtectedJson(paths, profilePath(paths), profile);
}

/** Detection is file reads only, so a missing profile is built on the spot. */
export function ensureProfile(paths: CrewPaths): { profile: Profile; tampered: boolean } {
  const existing = loadProfile(paths);
  if (existing.profile) return { profile: existing.profile, tampered: existing.tampered };
  const profile = detectProfile(paths.root);
  saveProfile(paths, profile);
  return { profile, tampered: false };
}
```

```ts
// packages/engine/src/gates.ts
import { spawnSync } from 'node:child_process';
import { basename, join } from 'node:path';
import { riskAreasForPaths } from './classify.ts';
import { computeVerdict, type Evidence, loadEvidence, type PlannedGate, saveEvidence } from './evidence.ts';
import { changedWatchedPaths, computeFingerprint } from './fingerprint.ts';
import { nowIso } from './fs.ts';
import { type CrewPaths, workDir } from './paths.ts';
import { runCommand } from './run.ts';
import { scanSecrets } from './secrets.ts';
import type { GateName, GateRun, Policy, Profile, Route, Target, WorkItem } from './types.ts';
import { isSkipped, raiseRoute } from './work.ts';

const MANIFESTS = new Set([
  'package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock', 'bun.lockb',
  'composer.json', 'composer.lock', 'pyproject.toml', 'uv.lock', 'poetry.lock', 'requirements.txt',
]);

export function manifestChanged(changed: string[]): boolean {
  return changed.some((p) => MANIFESTS.has(basename(p)) || /^requirements.*\.txt$/.test(basename(p)));
}

function onPath(binary: string): boolean {
  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [binary], { stdio: 'ignore' });
  return result.status === 0;
}

const NODE_AUDIT: Record<string, string> = {
  npm: 'npm audit --audit-level=high',
  pnpm: 'pnpm audit --audit-level=high',
  yarn: 'yarn audit --level high',
  bun: 'bun audit',
};

export function depsAuditCommand(target: Target): string | null {
  if (target.stack === 'node') return NODE_AUDIT[target.packageManager] ?? null;
  if (target.stack === 'php') return 'composer audit';
  if (target.stack === 'python') return onPath('pip-audit') ? 'pip-audit' : null;
  return null;
}

/** The gate table from the spec, section 12. Secrets is planned separately, once per repository. */
export function gatesForTarget(route: Route, target: Target, policy: Policy, changed: string[]): GateName[] {
  const has = (gate: GateName): boolean => !!target.gates[gate];
  const gates: GateName[] = [];
  if (has('build')) gates.push('build');
  gates.push('test');
  if (has('lint')) gates.push('lint');
  if (has('typecheck')) gates.push('typecheck');
  if (route === 'fast' ? manifestChanged(changed) : true) gates.push('deps');
  for (const gate of policy.requiredGates) if (gate !== 'secrets' && !gates.includes(gate)) gates.push(gate);
  return gates;
}

export function plannedGates(route: Route, profile: Profile, policy: Policy, changed: string[]): PlannedGate[] {
  const planned: PlannedGate[] = [{ gate: 'secrets', target: '.' }];
  const touched = profile.targets.filter(
    (t) => t.path === '.' || changed.length === 0 || changed.some((p) => p === t.path || p.startsWith(`${t.path}/`)),
  );
  for (const target of touched) {
    for (const gate of gatesForTarget(route, target, policy, changed)) {
      // On the standard route the audit is required only when a tool exists; on the full route it must be skipped explicitly.
      if (gate === 'deps' && route === 'standard' && !depsAuditCommand(target)) continue;
      planned.push({ gate, target: target.path });
    }
  }
  return planned;
}

async function runOne(paths: CrewPaths, work: WorkItem, profile: Profile, gate: GateName, targetPath: string): Promise<GateRun> {
  const at = nowIso();
  const base: GateRun = { gate, target: targetPath, command: null, commandSource: null, confirmed: true, exit: null, status: 'unavailable', durationMs: 0, at, log: null, tail: '' };
  if (gate === 'secrets') {
    const started = Date.now();
    const scan = await scanSecrets(paths.root, profile);
    return { ...base, command: scan.usedGitleaks ? 'built-in secret scan + gitleaks' : 'built-in secret scan', exit: scan.status === 'pass' ? 0 : 1, status: scan.status, durationMs: Date.now() - started, tail: scan.tail };
  }
  const target = profile.targets.find((t) => t.path === targetPath);
  if (!target) return { ...base, reason: 'target not in profile' };
  let command: string | null;
  let source: GateRun['commandSource'] = 'detected';
  if (gate === 'deps') {
    command = depsAuditCommand(target);
    if (!command) return { ...base, reason: `no audit tool for ${target.packageManager}` };
  } else {
    const configured = target.gates[gate];
    if (!configured) return { ...base, reason: 'no command' };
    command = configured.command;
    source = configured.source;
  }
  const log = `logs/${gate}-${targetPath.replace(/[^a-z0-9]+/gi, '_')}-${Date.now()}.txt`;
  const result = await runCommand(command, { cwd: join(paths.root, targetPath), timeoutMs: target.timeoutMs, logPath: join(workDir(paths, work.id), log) });
  const passed = result.exit === 0 && !result.timedOut;
  return { ...base, command, commandSource: source, confirmed: source !== 'proposed', exit: result.exit, status: passed ? 'pass' : 'fail', durationMs: result.durationMs, log, tail: result.tail, ...(result.timedOut ? { reason: 'timed out' } : {}) };
}

export interface GateOutcome {
  evidence: Evidence;
  verdict: 'proven' | 'unproven';
  unproven: string[];
  planned: PlannedGate[];
  changed: string[];
  raised: Route | null;
}

export async function runGates(paths: CrewPaths, work: WorkItem, profile: Profile, policy: Policy, options: { only?: GateName[] } = {}): Promise<GateOutcome> {
  const changed = changedWatchedPaths(paths.root, profile);
  const pathRisk = riskAreasForPaths(changed, policy);
  let raised: Route | null = null;
  if (pathRisk.length) {
    for (const area of pathRisk) if (!work.riskAreas.includes(area)) work.riskAreas.push(area);
    if (raiseRoute(work, 'full', `the change touches ${pathRisk.join(', ')} paths`)) raised = 'full';
  }
  const planned = plannedGates(work.route, profile, policy, changed);
  const { evidence } = loadEvidence(paths, work.id);
  const fingerprintBefore = computeFingerprint(paths.root, profile);
  for (const { gate, target } of planned) {
    if (options.only && !options.only.includes(gate)) continue;
    evidence.runs = evidence.runs.filter((r) => !(r.gate === gate && r.target === target));
    if (isSkipped(work, `gate:${gate}`)) {
      const skip = work.skips.find((s) => s.step === `gate:${gate}`);
      evidence.runs.push({ gate, target, command: null, commandSource: null, confirmed: true, exit: null, status: 'skipped', durationMs: 0, at: nowIso(), log: null, tail: '', reason: skip?.reason });
      continue;
    }
    evidence.runs.push(await runOne(paths, work, profile, gate, target));
  }
  // The fingerprint from before the runs is what the evidence vouches for; a gate that edits files shows up as a change.
  evidence.fingerprint = fingerprintBefore;
  const verdict = computeVerdict({ work, evidence, expected: planned, currentFingerprint: computeFingerprint(paths.root, profile), tampered: false });
  evidence.verdict = verdict.verdict;
  evidence.unproven = verdict.unproven;
  saveEvidence(paths, work.id, evidence);
  return { evidence, ...verdict, planned, changed, raised };
}

export interface Assessment {
  evidence: Evidence;
  verdict: 'proven' | 'unproven';
  unproven: string[];
  expected: PlannedGate[];
  changed: string[];
}

/** Read-only: what the evidence says about the code as it is right now. Fast enough for a hook. */
export function assess(paths: CrewPaths, work: WorkItem, profile: Profile, policy: Policy, tampered = false): Assessment {
  const changed = changedWatchedPaths(paths.root, profile);
  const expected = plannedGates(work.route, profile, policy, changed);
  const read = loadEvidence(paths, work.id);
  const verdict = computeVerdict({ work, evidence: read.evidence, expected, currentFingerprint: computeFingerprint(paths.root, profile), tampered: tampered || read.tampered });
  return { evidence: read.evidence, ...verdict, expected, changed };
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/gates.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/profile.ts packages/engine/src/gates.ts packages/engine/tests/gates.test.ts
git commit -m "feat(engine): deterministic gates and assessment"
```

---

### Task 18: Hook context, SessionStart and UserPromptSubmit

**Files:**
- Create: `packages/engine/src/hooks/types.ts`, `packages/engine/src/hooks/context.ts`, `packages/engine/src/hooks/session-start.ts`, `packages/engine/src/hooks/prompt.ts`
- Test: `packages/engine/tests/hooks-context.test.ts`

**Interfaces:**
- From `types.ts`: `interface HookPayload { session_id?; cwd?; hook_event_name?; source?; prompt?; tool_name?; tool_input?: Record<string, unknown>; stop_hook_active?; last_assistant_message? }`, `type HookResponse = Record<string, unknown>`, `interface HookContext { paths; sessionId; profile; policy; tampered: boolean }`.
- From `context.ts`: `buildContext(payload, env): HookContext` (resolves paths from `payload.cwd`, ensures the profile, loads the policy).
- From `session-start.ts`: `onSessionStart(ctx): HookResponse`. From `prompt.ts`: `onPrompt(ctx): HookResponse`.
- Also `statusLine(ctx, work): string`, exported from `prompt.ts` and reused by the stop hook and the CLI.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/hooks-context.test.ts
import { expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { buildContext } from '../src/hooks/context.ts';
import { onPrompt } from '../src/hooks/prompt.ts';
import { onSessionStart } from '../src/hooks/session-start.ts';
import { loadState } from '../src/state.ts';
import { addCriterion, createWork, saveWork } from '../src/work.ts';
import { makeRepo, testEnv } from './helpers.ts';

function context(root: string, env = testEnv()) {
  return buildContext({ session_id: 's1', cwd: join(root, 'src') }, env);
}

test('session start detects the profile, records the baseline and describes the state', () => {
  const root = makeRepo({ 'package.json': JSON.stringify({ scripts: { test: 'exit 0' } }), 'src/a.ts': 'x' });
  const ctx = context(root);
  const response = onSessionStart(ctx);
  expect(existsSync(join(root, '.crew', 'profile.json'))).toBe(true);
  expect(existsSync(join(root, '.crew', '.gitignore'))).toBe(true);
  const session = loadState(ctx.paths).sessions.s1;
  expect(session?.baseline).toMatch(/^sha256:/);
  expect(session?.stopBlocks).toBe(0);
  const text = (response.hookSpecificOutput as { additionalContext: string }).additionalContext;
  expect(text).toContain('crew start');
  expect(text).toContain('No work item is active');
  expect(text.length).toBeLessThan(900);
});

test('session start reports a missing test command and the work in progress', () => {
  const root = makeRepo({ 'Makefile': 'test:\n\ttrue\n', 'src/a.c': 'x' });
  const ctx = context(root);
  const work = createWork(ctx.paths, 'Fix the build');
  addCriterion(work, 'x');
  saveWork(ctx.paths, work);
  const text = (onSessionStart(ctx).hookSpecificOutput as { additionalContext: string }).additionalContext;
  expect(text).toContain('No test command is known');
  expect(text).toContain(`Work in progress: ${work.id}`);
  expect(text).toContain('not proven');
});

test('the prompt hook adds one status line only while work is active', () => {
  const root = makeRepo({ 'src/a.ts': 'x' });
  const ctx = context(root);
  expect(onPrompt(ctx)).toEqual({});
  createWork(ctx.paths, 'Thing');
  const text = (onPrompt(ctx).hookSpecificOutput as { additionalContext: string }).additionalContext;
  expect(text).toMatch(/^Crew: work \S+ "Thing", phase receive, route standard, not proven/);
  expect(text.split('\n')).toHaveLength(1);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/hooks-context.test.ts`
Expected: FAIL, cannot resolve `../src/hooks/context.ts`.

- [ ] **Step 3: Write the four modules**

```ts
// packages/engine/src/hooks/types.ts
import type { CrewPaths } from '../paths.ts';
import type { Policy, Profile } from '../types.ts';

export interface HookPayload {
  session_id?: string;
  cwd?: string;
  hook_event_name?: string;
  source?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  stop_hook_active?: boolean;
  last_assistant_message?: string;
}

export type HookResponse = Record<string, unknown>;

export interface HookContext {
  paths: CrewPaths;
  sessionId: string;
  profile: Profile;
  policy: Policy;
  tampered: boolean;
}
```

```ts
// packages/engine/src/hooks/context.ts
import { resolvePaths } from '../paths.ts';
import { loadPolicy } from '../policy.ts';
import { ensureProfile } from '../profile.ts';
import type { HookContext, HookPayload } from './types.ts';

export function buildContext(payload: HookPayload, env: NodeJS.ProcessEnv = process.env): HookContext {
  const paths = resolvePaths(payload.cwd ?? process.cwd(), env);
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  return {
    paths,
    sessionId: payload.session_id ?? 'default',
    profile: profile.profile,
    policy: policy.policy,
    tampered: profile.tampered || policy.tampered,
  };
}
```

```ts
// packages/engine/src/hooks/prompt.ts
import { assess } from '../gates.ts';
import type { WorkItem } from '../types.ts';
import { activeWork } from '../work.ts';
import type { HookContext, HookResponse } from './types.ts';

/** One line, written as a fact: the state of the active work item. */
export function statusLine(ctx: HookContext, work: WorkItem, tampered = false): string {
  const result = assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || tampered);
  const state = result.verdict === 'proven' ? 'proven' : `not proven (${result.unproven[0] ?? 'gates have not run'})`;
  const waiting = work.awaiting === 'user' ? ', waiting for the user' : '';
  return `Crew: work ${work.id} "${work.title}", phase ${work.phase}, route ${work.route}, ${state}${waiting}.`;
}

export function onPrompt(ctx: HookContext): HookResponse {
  const active = activeWork(ctx.paths);
  if (!active?.work) return {};
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: statusLine(ctx, active.work, active.tampered),
    },
  };
}
```

```ts
// packages/engine/src/hooks/session-start.ts
import { missingTestCommands } from '../detect/index.ts';
import { computeFingerprint } from '../fingerprint.ts';
import { ensureCrewDir, loadState, saveState, sessionState } from '../state.ts';
import { activeWork } from '../work.ts';
import { statusLine } from './prompt.ts';
import type { HookContext, HookResponse } from './types.ts';

export function onSessionStart(ctx: HookContext): HookResponse {
  ensureCrewDir(ctx.paths, ctx.policy);
  const state = loadState(ctx.paths);
  const session = sessionState(state, ctx.sessionId);
  session.baseline = computeFingerprint(ctx.paths.root, ctx.profile);
  session.stopBlocks = 0;
  saveState(ctx.paths, state);

  const lines = [
    'Shibaox Developer Crew is active in this repository. Work is proven by the `crew` command and the crew skill, and a turn cannot end while watched source files have unproven changes.',
  ];
  const active = activeWork(ctx.paths);
  if (active?.work) lines.push(statusLine(ctx, active.work, active.tampered).replace(/^Crew: work/, 'Work in progress:'));
  else lines.push('No work item is active. A code change starts with `crew start "<request>"`.');
  const missing = missingTestCommands(ctx.profile);
  if (missing.length) {
    lines.push(`No test command is known for: ${missing.map((m) => m.target).join(', ')}. One is proposed with \`crew profile set test "<cmd>"\`.`);
  }
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: lines.join(' ') } };
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/hooks-context.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/hooks packages/engine/tests/hooks-context.test.ts
git commit -m "feat(engine): hook context, session start and prompt hooks"
```

---

### Task 19: PreToolUse hook

**Files:**
- Create: `packages/engine/src/hooks/pre-tool-use.ts`
- Test: `packages/engine/tests/hooks-pre-tool-use.test.ts`

**Interfaces:**
- Consumes: `isProtectedPath`, `isWatched`, `activeWork`, `isBeforeBuild`, `HookContext`, `HookPayload`.
- Produces: `onPreToolUse(ctx, payload): HookResponse`. Answers `deny`, `ask` or `{}` (no opinion).

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/hooks-pre-tool-use.test.ts
import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { buildContext } from '../src/hooks/context.ts';
import { onPreToolUse } from '../src/hooks/pre-tool-use.ts';
import { createWork, saveWork } from '../src/work.ts';
import { makeRepo, testEnv } from './helpers.ts';

function decision(response: Record<string, unknown>): string | undefined {
  return (response.hookSpecificOutput as { permissionDecision?: string } | undefined)?.permissionDecision;
}

function setup() {
  const root = makeRepo({ 'package.json': JSON.stringify({ scripts: { test: 'exit 0' } }), 'src/a.ts': 'x' });
  return { root, ctx: buildContext({ session_id: 's', cwd: root }, testEnv()) };
}

test('writes to engine-owned files are denied; files outside the repo get no opinion', () => {
  const { root, ctx } = setup();
  const edit = (file_path: string) => onPreToolUse(ctx, { tool_name: 'Edit', tool_input: { file_path } });
  expect(decision(edit(join(root, '.crew', 'profile.json')))).toBe('deny');
  expect(decision(edit(join(root, '.crew', 'work', 'w1', 'evidence.json')))).toBe('deny');
  expect(decision(edit(join(ctx.paths.userDir, 'config.json')))).toBe('deny');
  expect(edit(join(root, '.crew', 'work', 'w1', 'spec.md'))).toEqual({});
  expect(edit('/tmp/elsewhere/file.ts')).toEqual({});
  expect(edit(join(process.env.HOME ?? '/', '.zshrc'))).toEqual({});
  expect(onPreToolUse(ctx, { tool_name: 'Write', tool_input: {} })).toEqual({});
});

test('source edits are denied before the build phase on standard and full routes only', () => {
  const { root, ctx } = setup();
  const edit = () => onPreToolUse(ctx, { tool_name: 'Write', tool_input: { file_path: join(root, 'src', 'a.ts') } });
  expect(edit()).toEqual({});
  const work = createWork(ctx.paths, 'feature');
  work.route = 'standard';
  work.phase = 'specify';
  saveWork(ctx.paths, work);
  expect(decision(edit())).toBe('deny');
  expect(onPreToolUse(ctx, { tool_name: 'Write', tool_input: { file_path: join(root, 'README.md') } })).toEqual({});
  work.phase = 'build';
  saveWork(ctx.paths, work);
  expect(edit()).toEqual({});
  work.route = 'fast';
  work.phase = 'recognize';
  saveWork(ctx.paths, work);
  expect(edit()).toEqual({});
});

test('bash: user-only decisions ask, writes to engine files are denied, everything else passes', () => {
  const { ctx } = setup();
  const bash = (command: string) => onPreToolUse(ctx, { tool_name: 'Bash', tool_input: { command } });
  expect(decision(bash('crew skip w1 gate:lint --reason "legacy"'))).toBe('ask');
  expect(decision(bash('crew approve w1 spec'))).toBe('ask');
  expect(decision(bash('crew profile confirm'))).toBe('ask');
  expect(decision(bash('echo \'{"targets":[]}\' > .crew/profile.json'))).toBe('deny');
  expect(decision(bash('sed -i "s/fail/pass/" .crew/work/w1/evidence.json'))).toBe('deny');
  expect(decision(bash('rm -rf ~/.shibaox/crew/integrity'))).toBe('deny');
  expect(bash('cat .crew/profile.json')).toEqual({});
  expect(bash('crew profile set test "make test"')).toEqual({});
  expect(bash('npm test')).toEqual({});
  expect(onPreToolUse(ctx, { tool_name: 'Read', tool_input: { file_path: '.crew/profile.json' } })).toEqual({});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/hooks-pre-tool-use.test.ts`
Expected: FAIL, cannot resolve `../src/hooks/pre-tool-use.ts`.

- [ ] **Step 3: Write the implementation**

```ts
// packages/engine/src/hooks/pre-tool-use.ts
import { isAbsolute, join, relative, resolve } from 'node:path';
import { isWatched } from '../fingerprint.ts';
import { isProtectedPath } from '../paths.ts';
import { activeWork, isBeforeBuild } from '../work.ts';
import type { HookContext, HookPayload, HookResponse } from './types.ts';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const USER_ONLY = /\bcrew\s+(?:skip|approve|profile\s+confirm)\b/;
const ENGINE_FILES =
  /\.crew\/(?:profile\.json|policy\.json|\.gitignore|local\b|work\/[^\s/]+\/(?:work\.json|evidence\.json|report\.md|logs\b))|\.shibaox\/crew\b/;
const WRITE_SHAPE = /(?:^|[\s;&|(])(?:rm|mv|cp|tee|truncate|chmod|touch|dd|install)\b|sed\s+-i|>{1,2}\s*\S/;

function answer(permissionDecision: 'deny' | 'ask', reason: string): HookResponse {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason: reason } };
}

function pathFromInput(input: Record<string, unknown>): string | null {
  for (const key of ['file_path', 'notebook_path', 'path']) {
    const value = input[key];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

export function onPreToolUse(ctx: HookContext, payload: HookPayload): HookResponse {
  const tool = payload.tool_name ?? '';
  const input = payload.tool_input ?? {};
  if (WRITE_TOOLS.has(tool)) {
    const filePath = pathFromInput(input);
    if (!filePath) return {};
    const abs = resolve(isAbsolute(filePath) ? filePath : join(ctx.paths.root, filePath));
    if (isProtectedPath(ctx.paths, abs)) {
      return answer('deny', `Crew: ${filePath} is maintained by the engine and is changed through the crew command`);
    }
    const rel = relative(ctx.paths.root, abs).replace(/\\/g, '/');
    if (rel === '' || rel.startsWith('..') || !isWatched(rel, ctx.profile)) return {};
    const active = activeWork(ctx.paths);
    const work = active?.work;
    if (work && work.route !== 'fast' && isBeforeBuild(work)) {
      return answer(
        'deny',
        `Crew: work ${work.id} is in phase ${work.phase} on the ${work.route} route; source files change in the build phase (crew phase ${work.id} next)`,
      );
    }
    return {};
  }
  if (tool === 'Bash') {
    const command = typeof input.command === 'string' ? input.command : '';
    if (USER_ONLY.test(command)) return answer('ask', 'Crew: this command records a decision that only the user can take');
    if (ENGINE_FILES.test(command) && WRITE_SHAPE.test(command) && !/^\s*crew\b/.test(command)) {
      return answer('deny', 'Crew: files under .crew/ and ~/.shibaox/crew that the engine owns are written only by the crew command');
    }
  }
  return {};
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/hooks-pre-tool-use.test.ts`
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/hooks/pre-tool-use.ts packages/engine/tests/hooks-pre-tool-use.test.ts
git commit -m "feat(engine): pre-tool-use hook"
```

---

### Task 20: Stop hook and the hook dispatcher

**Files:**
- Create: `packages/engine/src/hooks/stop.ts`, `packages/engine/src/hooks/index.ts`
- Test: `packages/engine/tests/hooks-stop.test.ts`

**Interfaces:**
- Produces: `MAX_STOP_BLOCKS = 3`, `onStop(ctx): HookResponse` (the five-case rule from spec section 12), `handleHook(event: string, payload: HookPayload, env?): HookResponse` for events `session-start`, `prompt`, `pre-tool-use`, `stop`; any other event or any thrown error gives `{}`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/hooks-stop.test.ts
import { expect, test } from 'bun:test';
import { runGates } from '../src/gates.ts';
import { buildContext } from '../src/hooks/context.ts';
import { handleHook } from '../src/hooks/index.ts';
import { onSessionStart } from '../src/hooks/session-start.ts';
import { MAX_STOP_BLOCKS, onStop } from '../src/hooks/stop.ts';
import { loadState } from '../src/state.ts';
import { addCriterion, addSkip, createWork, saveWork } from '../src/work.ts';
import { makeRepo, testEnv, write } from './helpers.ts';

function session() {
  const root = makeRepo({ 'package.json': JSON.stringify({ scripts: { test: 'exit 0' } }), 'src/a.ts': 'x' });
  const ctx = buildContext({ session_id: 's', cwd: root }, testEnv());
  onSessionStart(ctx);
  return { root, ctx };
}

test('case 1: nothing changed, the turn ends', () => {
  const { ctx } = session();
  expect(onStop(ctx)).toEqual({});
});

test('case 4 then 5: unproven changes block, and the third block is the last', () => {
  const { root, ctx } = session();
  write(root, 'src/a.ts', 'changed');
  for (let i = 1; i <= MAX_STOP_BLOCKS; i++) {
    const response = onStop(ctx);
    expect(response.decision).toBe('block');
    expect(String(response.reason)).toContain('no work item');
    expect(loadState(ctx.paths).sessions.s?.stopBlocks).toBe(i);
  }
  const notice = onStop(ctx);
  expect(notice.decision).toBeUndefined();
  expect(String(notice.systemMessage)).toMatch(/not proven after 3 attempts/);
});

test('case 3: a work item waiting for the user lets the turn end with a notice', () => {
  const { root, ctx } = session();
  const work = createWork(ctx.paths, 'fix');
  write(root, 'src/a.ts', 'changed');
  expect(onStop(ctx).decision).toBe('block');
  work.awaiting = 'user';
  saveWork(ctx.paths, work);
  const response = onStop(ctx);
  expect(response.decision).toBeUndefined();
  expect(String(response.systemMessage)).toContain(work.id);
  expect(loadState(ctx.paths).sessions.s?.stopBlocks).toBe(0);
});

test('case 2: proven work ends the turn, and a later edit blocks again', async () => {
  const { root, ctx } = session();
  const work = createWork(ctx.paths, 'fix');
  work.route = 'fast';
  addCriterion(work, 'x');
  addSkip(work, 'tdd:AC-1', 'manual');
  write(root, 'src/a.ts', 'changed');
  saveWork(ctx.paths, work);
  expect(onStop(ctx).decision).toBe('block');
  const outcome = await runGates(ctx.paths, work, ctx.profile, ctx.policy);
  saveWork(ctx.paths, work);
  expect(outcome.verdict).toBe('proven');
  expect(onStop(ctx)).toEqual({});
  expect(loadState(ctx.paths).sessions.s?.stopBlocks).toBe(0);
  write(root, 'src/a.ts', 'changed again');
  expect(String(onStop(ctx).reason)).toContain('code changed since the last gate run');
});

test('handleHook dispatches by event and never throws', () => {
  const { root } = session();
  expect(handleHook('stop', { session_id: 's', cwd: root }, testEnv())).toEqual({});
  expect(handleHook('nonsense', { cwd: root }, testEnv())).toEqual({});
  expect(handleHook('prompt', { cwd: '/nonexistent/path/for/crew' }, testEnv())).toEqual({});
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/hooks-stop.test.ts`
Expected: FAIL, cannot resolve `../src/hooks/stop.ts`.

- [ ] **Step 3: Write the two modules**

```ts
// packages/engine/src/hooks/stop.ts
import { computeFingerprint } from '../fingerprint.ts';
import { assess } from '../gates.ts';
import { loadState, saveState, sessionState } from '../state.ts';
import { activeWork } from '../work.ts';
import type { HookContext, HookResponse } from './types.ts';

export const MAX_STOP_BLOCKS = 3;

/**
 * The Stop rule (spec, section 12). It compares fingerprints and reads evidence; it never runs gates.
 * 1. nothing changed: allow. 2. changed and proven: allow. 3. changed, unproven, waiting for the user:
 * allow with a notice. 4. changed and unproven: block. 5. after three blocks in a row: allow with a notice.
 */
export function onStop(ctx: HookContext): HookResponse {
  const state = loadState(ctx.paths);
  const session = sessionState(state, ctx.sessionId);
  const current = computeFingerprint(ctx.paths.root, ctx.profile);
  const active = activeWork(ctx.paths);
  const work = active?.work ?? null;
  const result = work ? assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || !!active?.tampered) : null;
  const proven = result?.verdict === 'proven';
  // Without a baseline (the plugin was enabled mid-session) only an unproven work item counts as a change.
  const changed = session.baseline !== null ? current !== session.baseline : work !== null && !proven;
  const done = (response: HookResponse): HookResponse => {
    saveState(ctx.paths, state);
    return response;
  };
  if (!changed || proven) {
    session.stopBlocks = 0;
    return done({});
  }
  const missing = result ? result.unproven : ['no work item: start one with crew start "<request>"'];
  if (work?.awaiting === 'user') {
    session.stopBlocks = 0;
    return done({ systemMessage: `Crew: work ${work.id} is waiting for the user and is not proven (${missing[0]}).` });
  }
  if (session.stopBlocks >= MAX_STOP_BLOCKS) {
    return done({ systemMessage: `Crew: not proven after ${MAX_STOP_BLOCKS} attempts. ${missing.join('; ')}.` });
  }
  session.stopBlocks += 1;
  const gate = work ? `crew gate run ${work.id}` : 'crew start "<request>"';
  return done({
    decision: 'block',
    reason: `Crew: watched source files changed and the work is not proven. Missing: ${missing.join('; ')}. Run ${gate}, fix what fails, or ask the user to skip a step with crew skip.`,
  });
}
```

```ts
// packages/engine/src/hooks/index.ts
import { buildContext } from './context.ts';
import { onPreToolUse } from './pre-tool-use.ts';
import { onPrompt } from './prompt.ts';
import { onSessionStart } from './session-start.ts';
import { onStop } from './stop.ts';
import type { HookPayload, HookResponse } from './types.ts';

/** A hook that cannot decide answers {} so a bug in the engine never blocks the user's session. */
export function handleHook(event: string, payload: HookPayload, env: NodeJS.ProcessEnv = process.env): HookResponse {
  try {
    const ctx = buildContext(payload, env);
    switch (event) {
      case 'session-start':
        return onSessionStart(ctx);
      case 'prompt':
        return onPrompt(ctx);
      case 'pre-tool-use':
        return onPreToolUse(ctx, payload);
      case 'stop':
        return onStop(ctx);
      default:
        return {};
    }
  } catch {
    return {};
  }
}
```

- [ ] **Step 4: Run the test**

Run: `bun test packages/engine/tests/hooks-stop.test.ts`
Expected: 5 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/hooks/stop.ts packages/engine/src/hooks/index.ts packages/engine/tests/hooks-stop.test.ts
git commit -m "feat(engine): stop hook and hook dispatcher"
```

---

### Task 21: The `crew` command

**Files:**
- Create: `packages/engine/src/cli.ts`, `packages/engine/src/crew.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/tests/cli.test.ts`

**Interfaces:**
- Produces: `interface CliIo { stdout(text); stderr(text); stdin(): Promise<string>; env; cwd }`, `main(argv: string[], io: CliIo): Promise<number>` with exit codes `0` done, `1` refused, `2` error. Every command accepts `--json`. `crew.ts` is the bundle entry. `index.ts` re-exports the library for the mod (SP1b).

- [ ] **Step 1: Write the failing test**

```ts
// packages/engine/tests/cli.test.ts
import { expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type CliIo, main } from '../src/cli.ts';
import { makeRepo, testEnv, write } from './helpers.ts';

function io(cwd: string, env = testEnv(), stdin = '') {
  const out: string[] = [];
  const err: string[] = [];
  const cli: CliIo = { stdout: (t) => out.push(t), stderr: (t) => err.push(t), stdin: async () => stdin, env, cwd };
  const run = async (...argv: string[]) => {
    out.length = 0;
    err.length = 0;
    const code = await main(argv, cli);
    return { code, out: out.join(''), err: err.join('') };
  };
  const json = async (...argv: string[]) => {
    const result = await run(...argv, '--json');
    return { code: result.code, data: JSON.parse(result.out) as Record<string, unknown> };
  };
  return { run, json, env };
}

const answers = JSON.stringify({ work_type: 'fix', is_vague: 0.1, scope: 0, touches_auth: 0, touches_payments: 0, touches_personal_data: 0, touches_data_migration: 0, touches_infra: 0, touches_public_api: 0 });

test('a fast-route fix from start to a proven report', async () => {
  const root = makeRepo({ 'package.json': JSON.stringify({ scripts: { test: 'sh t.sh' } }), 't.sh': 'exit 1\n', 'src/a.ts': 'x' });
  const c = io(root);
  expect((await c.run('--version')).out.trim()).toBe('0.1.0');
  const detect = await c.json('detect');
  expect(detect.code).toBe(0);
  expect((detect.data.profile as { targets: unknown[] }).targets).toHaveLength(1);

  const start = await c.json('start', 'Cart total ignores the discount', '--answers', answers);
  const id = start.data.id as string;
  expect(start.data.route).toBe('fast');
  expect(existsSync(join(root, '.crew', 'local', 'decisions.jsonl'))).toBe(true);

  expect((await c.run('phase', id, 'next')).code).toBe(1);
  expect((await c.run('criteria', id, 'add', 'The total subtracts the discount.')).code).toBe(0);
  expect((await c.json('phase', id, 'next')).data.phase).toBe('build');

  expect((await c.run('tdd', 'green', id, 'AC-1')).code).toBe(1);
  expect((await c.run('tdd', 'red', id, 'AC-1')).code).toBe(0);
  write(root, 't.sh', 'exit 0\n');
  write(root, 'src/a.ts', 'fixed');
  expect((await c.run('tdd', 'green', id, 'AC-1')).code).toBe(0);
  expect((await c.json('phase', id, 'next')).data.phase).toBe('gate');

  const gates = await c.json('gate', 'run', id);
  expect(gates.code).toBe(0);
  expect(gates.data.verdict).toBe('proven');
  expect((await c.json('phase', id, 'next')).data.phase).toBe('deliver');

  const report = await c.run('evidence', id);
  expect(report.code).toBe(0);
  expect(report.out).toContain('**Proven**');
  expect(readFileSync(join(root, '.crew', 'work', id, 'report.md'), 'utf8')).toContain('red then green');
  const status = await c.json('status');
  expect(status.data.verdict).toBe('proven');
});

test('refusals: unknown work, skip without reason, invalid answers, pilot cannot skip secrets', async () => {
  const root = makeRepo({ 'package.json': JSON.stringify({ scripts: { test: 'exit 0' } }) });
  const c = io(root);
  expect((await c.run('phase', 'nope', 'next')).code).toBe(1);
  expect((await c.run('start', 'x', '--answers', '{"work_type":"bug"}')).code).toBe(1);
  const start = await c.json('start', 'Thing');
  const id = start.data.id as string;
  expect((await c.run('skip', id, 'gate:lint')).code).toBe(1);
  expect((await c.run('skip', id, 'gate:lint', '--reason', 'legacy')).code).toBe(0);
  expect((await c.run('mode', 'pilot')).code).toBe(0);
  const refused = await c.run('skip', id, 'gate:secrets', '--reason', 'no');
  expect(refused.code).toBe(1);
  expect(refused.err).toMatch(/pilot/i);
  expect((await c.run('config', 'decisions.log', 'false')).code).toBe(0);
  expect((await c.json('config', 'decisions.log')).data.value).toBe(false);
});

test('profile set and confirm: proposed commands stay unconfirmed until confirmed', async () => {
  const root = makeRepo({ 'Makefile': 'test:\n\ttrue\n', 'src/a.c': 'x' });
  const c = io(root);
  const detect = await c.json('detect');
  expect(detect.data.missing).toEqual([{ target: '.', gate: 'test' }]);
  expect((await c.run('profile', 'set', 'test', 'make test')).code).toBe(0);
  const start = await c.json('start', 'fix');
  const id = start.data.id as string;
  await c.run('criteria', id, 'add', 'x');
  await c.run('skip', id, 'tdd:AC-1', '--reason', 'manual');
  write(root, 'src/a.c', 'y');
  const first = await c.json('gate', 'run', id);
  expect(first.data.unproven).toEqual(['gate test ran an unconfirmed command (crew profile confirm)']);
  expect((await c.run('profile', 'confirm')).code).toBe(0);
  const second = await c.json('gate', 'run', id);
  expect(second.data.verdict).toBe('proven');
});

test('hook: malformed or empty stdin answers {} and exits 0', async () => {
  const root = makeRepo();
  expect(await io(root, testEnv(), '').run('hook', 'stop')).toMatchObject({ code: 0, out: '{}\n' });
  expect(await io(root, testEnv(), '{not json').run('hook', 'stop')).toMatchObject({ code: 0, out: '{}\n' });
  const ok = await io(root, testEnv(), JSON.stringify({ session_id: 's', cwd: root })).run('hook', 'session-start');
  expect(ok.code).toBe(0);
  expect(JSON.parse(ok.out)).toHaveProperty('hookSpecificOutput');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test packages/engine/tests/cli.test.ts`
Expected: FAIL, cannot resolve `../src/cli.ts`.

- [ ] **Step 3: Write the CLI, the entry and the library index**

```ts
// packages/engine/src/cli.ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type Answers, AnswerError, computeRoute, validateAnswers } from './classify.ts';
import { loadConfig, saveConfig, setConfigValue } from './config.ts';
import { detectProfile, missingTestCommands } from './detect/index.ts';
import { loadEvidence, renderReport, saveEvidence } from './evidence.ts';
import { assess, runGates } from './gates.ts';
import { nowIso, readText, writeText } from './fs.ts';
import { handleHook } from './hooks/index.ts';
import type { HookPayload } from './hooks/types.ts';
import { type CrewPaths, resolvePaths, workDir } from './paths.ts';
import { loadPolicy, skipAllowed } from './policy.ts';
import { ensureProfile, loadProfile, saveProfile } from './profile.ts';
import { ensureCrewDir, loadState, saveState } from './state.ts';
import { recordIntegrity, writeProtectedText } from './store.ts';
import { recordTdd, type TddStep } from './tdd.ts';
import type { GateName, Policy, Profile, UserConfig, WorkItem } from './types.ts';
import { GATE_NAMES } from './types.ts';
import { VERSION } from './version.ts';
import { activeWork, addCriterion, addSkip, advancePhase, applyClassification, approve, createWork, type GuardContext, loadWork, saveWork } from './work.ts';

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
  stdin(): Promise<string>;
  env: NodeJS.ProcessEnv;
  cwd: string;
}

interface Parsed {
  positional: string[];
  flags: Record<string, string | true>;
  rest: string[];
}

function parse(argv: string[]): Parsed {
  const parsed: Parsed = { positional: [], flags: {}, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '--') {
      parsed.rest = argv.slice(i + 1);
      break;
    }
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--') && key !== 'json' && key !== 'refresh') {
        parsed.flags[key] = next;
        i++;
      } else parsed.flags[key] = true;
    } else parsed.positional.push(arg);
  }
  return parsed;
}

type Outcome = { code: number; text: string; data?: Record<string, unknown> };
const ok = (text: string, data: Record<string, unknown> = {}): Outcome => ({ code: 0, text, data });
const refuse = (text: string, data: Record<string, unknown> = {}): Outcome => ({ code: 1, text, data });

interface Env {
  paths: CrewPaths;
  profile: Profile;
  policy: Policy;
  config: UserConfig;
  tampered: boolean;
}

function load(io: CliIo): Env {
  const paths = resolvePaths(io.cwd, io.env);
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  ensureCrewDir(paths, policy.policy);
  return { paths, profile: profile.profile, policy: policy.policy, config: loadConfig(paths), tampered: profile.tampered || policy.tampered };
}

function openWork(env: Env, id: string | undefined): { work: WorkItem; tampered: boolean } | Outcome {
  if (!id) return refuse('a work item id is required');
  const read = loadWork(env.paths, id);
  if (!read.work) return refuse(`unknown work item: ${id}`);
  return { work: read.work, tampered: read.tampered };
}

function isOutcome(value: unknown): value is Outcome {
  return typeof value === 'object' && value !== null && 'code' in value && 'text' in value;
}

function guardContext(env: Env, work: WorkItem, tampered: boolean): GuardContext {
  const dir = workDir(env.paths, work.id);
  const result = assess(env.paths, work, env.profile, env.policy, env.tampered || tampered);
  return { specText: readText(join(dir, 'spec.md')), planExists: existsSync(join(dir, 'plan.md')), evidence: result.evidence, proven: result.verdict === 'proven', unproven: result.unproven };
}

function logDecision(env: Env, work: WorkItem, answers: Answers): void {
  if (!env.config.decisions.log) return;
  const line = JSON.stringify({ at: nowIso(), work: work.id, input: work.input.slice(0, 500), answers, route: work.route, reasons: work.routeReasons });
  const file = join(env.paths.localDir, 'decisions.jsonl');
  writeText(file, `${readText(file) ?? ''}${line}\n`);
}

function parseAnswers(raw: string): Answers | Outcome {
  try {
    return validateAnswers(JSON.parse(raw));
  } catch (error) {
    if (error instanceof AnswerError) return refuse(`invalid answers: ${error.message}`);
    return refuse('answers must be valid JSON');
  }
}

function classify(env: Env, work: WorkItem, answers: Answers): void {
  const decision = computeRoute(answers, [], env.policy);
  applyClassification(work, answers.work_type, decision);
  logDecision(env, work, answers);
}

function gateSummary(work: WorkItem, verdict: string, unproven: string[], runs: { gate: string; target: string; status: string; durationMs: number }[]): string {
  const lines = runs.map((r) => `  ${r.gate} (${r.target}): ${r.status} in ${(r.durationMs / 1000).toFixed(1)}s`);
  lines.push(verdict === 'proven' ? `Proven: ${work.id}` : `Not proven: ${unproven.join('; ')}`);
  return lines.join('\n');
}

async function dispatch(parsed: Parsed, io: CliIo): Promise<Outcome> {
  const [command, ...args] = parsed.positional;
  if (parsed.flags.version || command === 'version') return ok(VERSION, { version: VERSION });
  if (command === 'hook') {
    const event = args[0] ?? '';
    let payload: Record<string, unknown> = {};
    try {
      const raw = await io.stdin();
      payload = raw.trim() ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      payload = {};
    }
    if (typeof payload.cwd !== 'string') payload.cwd = io.cwd;
    return ok(JSON.stringify(handleHook(event, payload as HookPayload, io.env)), { hookEvent: event });
  }
  if (!command || command === 'help') return ok(HELP);
  const env = load(io);

  switch (command) {
    case 'detect': {
      const previous = parsed.flags.refresh ? loadProfile(env.paths).profile : null;
      const profile = parsed.flags.refresh ? detectProfile(env.paths.root, previous) : env.profile;
      if (parsed.flags.refresh) {
        saveProfile(env.paths, profile);
        recordIntegrity(env.paths, join(env.paths.crewDir, 'policy.json'));
      }
      const missing = missingTestCommands(profile);
      const lines = profile.targets.map((t) => `  ${t.path} (${t.stack}, ${t.packageManager}): ${Object.entries(t.gates).map(([g, c]) => `${g}=${c.command}${c.source === 'proposed' ? ' [proposed]' : ''}`).join(', ') || 'no commands'}`);
      if (missing.length) lines.push(`No test command for: ${missing.map((m) => m.target).join(', ')}. Propose one: crew profile set test "<cmd>" [--target <path>]`);
      return ok(lines.join('\n'), { profile, missing });
    }
    case 'profile': {
      const [sub, gate, cmd] = args;
      if (sub === 'set') {
        if (!GATE_NAMES.includes(gate as GateName) || gate === 'secrets' || !cmd) return refuse('usage: crew profile set <build|test|lint|typecheck|deps> "<cmd>" [--target <path>]');
        const targetPath = typeof parsed.flags.target === 'string' ? parsed.flags.target : '.';
        let target = env.profile.targets.find((t) => t.path === targetPath);
        if (!target) {
          target = { path: targetPath, stack: 'other', packageManager: 'unknown', gates: {}, timeoutMs: 10 * 60 * 1000 };
          env.profile.targets.push(target);
        }
        target.gates[gate as GateName] = { command: cmd, source: 'proposed' };
        saveProfile(env.paths, env.profile);
        return ok(`proposed ${gate} for ${targetPath}: ${cmd} (unconfirmed until crew profile confirm)`, { target: targetPath, gate, command: cmd });
      }
      if (sub === 'confirm') {
        let count = 0;
        for (const target of env.profile.targets) for (const command of Object.values(target.gates)) if (command.source === 'proposed') { command.source = 'confirmed'; count++; }
        saveProfile(env.paths, env.profile);
        return ok(`confirmed ${count} command(s)`, { confirmed: count });
      }
      return refuse('usage: crew profile set|confirm');
    }
    case 'start': {
      const input = args.join(' ').trim();
      if (!input) return refuse('usage: crew start "<request>" [--answers <json>]');
      // Validate before creating anything, so a bad answer set leaves no half-made work item behind.
      const answers = typeof parsed.flags.answers === 'string' ? parseAnswers(parsed.flags.answers) : null;
      if (isOutcome(answers)) return answers;
      const work = createWork(env.paths, input);
      if (answers) classify(env, work, answers);
      saveWork(env.paths, work);
      return ok(`started ${work.id} (route ${work.route}: ${work.routeReasons.join('; ')})`, { id: work.id, route: work.route, phase: work.phase, routeReasons: work.routeReasons });
    }
    case 'classify': {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (typeof parsed.flags.answers !== 'string') return refuse('usage: crew classify <id> --answers <json>');
      const answers = parseAnswers(parsed.flags.answers);
      if (isOutcome(answers)) return answers;
      classify(env, opened.work, answers);
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: route ${opened.work.route} (${opened.work.routeReasons.join('; ')})`, { id: opened.work.id, route: opened.work.route, riskAreas: opened.work.riskAreas });
    }
    case 'criteria': {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened)) return opened;
      const text = args.slice(2).join(' ').trim();
      if (args[1] !== 'add' || !text) return refuse('usage: crew criteria <id> add "<criterion>" [--kind preserve]');
      const kind = parsed.flags.kind === 'preserve' ? 'preserve' : 'behavior';
      const criterion = addCriterion(opened.work, text, kind);
      saveWork(env.paths, opened.work);
      return ok(`${criterion.id} (${kind}): ${criterion.text}`, { criterion });
    }
    case 'approve': {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (args[1] !== 'spec') return refuse('usage: crew approve <id> spec');
      approve(opened.work, 'spec');
      saveWork(env.paths, opened.work);
      return ok(`spec approved for ${opened.work.id}`, { approvals: opened.work.approvals });
    }
    case 'phase': {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened)) return opened;
      if (args[1] !== 'next') return refuse('usage: crew phase <id> next');
      const result = advancePhase(opened.work, guardContext(env, opened.work, opened.tampered));
      if (!result.ok) return refuse(`cannot enter the next phase; missing:\n  ${result.missing.join('\n  ')}`, { missing: result.missing, phase: opened.work.phase });
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: phase ${result.phase}`, { phase: result.phase });
    }
    case 'await':
    case 'resume': {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened)) return opened;
      opened.work.awaiting = command === 'await' ? 'user' : null;
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: ${command === 'await' ? 'waiting for the user' : 'resumed'}`, { awaiting: opened.work.awaiting });
    }
    case 'tdd': {
      const [step, id, criterion] = args;
      const opened = openWork(env, id);
      if (isOutcome(opened)) return opened;
      if (!['red', 'green', 'before', 'after'].includes(step ?? '') || !criterion) return refuse('usage: crew tdd <red|green|before|after> <id> <criterion> [-- <cmd>]');
      const { evidence } = loadEvidence(env.paths, opened.work.id);
      const override = parsed.rest.length ? parsed.rest.join(' ') : undefined;
      const outcome = await recordTdd(env.paths, opened.work, evidence, env.profile, criterion, step as TddStep, override);
      if (outcome.ok) saveEvidence(env.paths, opened.work.id, evidence);
      const tail = outcome.record?.tail ? `\n${outcome.record.tail}` : '';
      return outcome.ok ? ok(outcome.message, { record: outcome.record }) : refuse(`${outcome.message}${tail}`, { record: outcome.record });
    }
    case 'gate': {
      const opened = openWork(env, args[1]);
      if (isOutcome(opened)) return opened;
      if (args[0] !== 'run') return refuse('usage: crew gate run <id> [--only a,b]');
      const only = typeof parsed.flags.only === 'string' ? (parsed.flags.only.split(',') as GateName[]) : undefined;
      const outcome = await runGates(env.paths, opened.work, env.profile, env.policy, { only });
      saveWork(env.paths, opened.work);
      const raised = outcome.raised ? `Route raised to ${outcome.raised}: ${opened.work.routeReasons.at(-1)}\n` : '';
      return ok(raised + gateSummary(opened.work, outcome.verdict, outcome.unproven, outcome.evidence.runs), { verdict: outcome.verdict, unproven: outcome.unproven, runs: outcome.evidence.runs, raised: outcome.raised, route: opened.work.route });
    }
    case 'skip': {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened)) return opened;
      const step = args[1];
      const reason = typeof parsed.flags.reason === 'string' ? parsed.flags.reason.trim() : '';
      if (!step || !reason) return refuse('usage: crew skip <id> <step> --reason "<text>"');
      if (!skipAllowed(env.policy, step)) return refuse(`the team policy does not allow skipping ${step}`);
      if (env.config.mode === 'pilot' && (step === 'gate:secrets' || step === 'gate:deps')) return refuse(`in pilot mode the ${step.slice(5)} gate cannot be skipped`);
      addSkip(opened.work, step, reason);
      saveWork(env.paths, opened.work);
      return ok(`skipped ${step} on ${opened.work.id}: ${reason}`, { skips: opened.work.skips });
    }
    case 'evidence': {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened)) return opened;
      const result = assess(env.paths, opened.work, env.profile, env.policy, env.tampered || opened.tampered);
      result.evidence.verdict = result.verdict;
      result.evidence.unproven = result.unproven;
      saveEvidence(env.paths, opened.work.id, result.evidence);
      const report = renderReport(opened.work, result.evidence);
      writeProtectedText(env.paths, join(workDir(env.paths, opened.work.id), 'report.md'), report);
      return ok(report, { verdict: result.verdict, unproven: result.unproven });
    }
    case 'status': {
      const active = activeWork(env.paths);
      if (!active?.work) return ok('no active work item', { active: null });
      const result = assess(env.paths, active.work, env.profile, env.policy, env.tampered || active.tampered);
      const text = `${active.work.id} "${active.work.title}"\n  phase ${active.work.phase}, route ${active.work.route}${active.work.awaiting ? ', waiting for the user' : ''}\n${gateSummary(active.work, result.verdict, result.unproven, result.evidence.runs)}`;
      return ok(text, { active: active.work.id, phase: active.work.phase, route: active.work.route, verdict: result.verdict, unproven: result.unproven });
    }
    case 'mode': {
      if (!args[0]) return ok(env.config.mode, { mode: env.config.mode });
      try {
        saveConfig(env.paths, setConfigValue(env.config, 'mode', args[0]));
      } catch (error) {
        return refuse((error as Error).message);
      }
      return ok(`mode: ${args[0]}`, { mode: args[0] });
    }
    case 'config': {
      const [key, value] = args;
      if (!key) return ok(JSON.stringify(env.config), { config: env.config });
      if (value === undefined) {
        const current = key === 'mode' ? env.config.mode : key === 'decisions.log' ? env.config.decisions.log : undefined;
        return current === undefined ? refuse(`unknown setting: ${key}`) : ok(String(current), { key, value: current });
      }
      try {
        saveConfig(env.paths, setConfigValue(env.config, key, value));
      } catch (error) {
        return refuse((error as Error).message);
      }
      return ok(`${key}: ${value}`, { key, value: key === 'decisions.log' ? value === 'true' : value });
    }
    default:
      return refuse(`unknown command: ${command}\n${HELP}`);
  }
}

const HELP = `crew ${VERSION}
  detect [--refresh]                    build or refresh the project profile
  profile set <gate> "<cmd>" [--target p] propose a gate command (unconfirmed)
  profile confirm                       confirm proposed commands (asks the user)
  start "<request>" [--answers <json>]  create a work item
  classify <id> --answers <json>        record typed answers and compute the route
  criteria <id> add "<text>" [--kind preserve]
  approve <id> spec                     record the user's approval (asks the user)
  phase <id> next                       advance when the guard holds
  await <id> user | resume <id>         mark or clear waiting for the user
  tdd <red|green|before|after> <id> <criterion> [-- <cmd>]
  gate run <id> [--only a,b]            run the gates the route requires
  skip <id> <step> --reason "<text>"    record a skip (asks the user)
  evidence <id>                         write and print the report
  status | mode [m] | config <key> [v]  state and settings
  --json on any command prints the machine form`;

export async function main(argv: string[], io: CliIo): Promise<number> {
  const parsed = parse(argv);
  let outcome: Outcome;
  try {
    outcome = await dispatch(parsed, io);
  } catch (error) {
    if (parsed.positional[0] === 'hook') {
      io.stdout('{}\n');
      return 0;
    }
    io.stderr(`crew: ${(error as Error).message}\n`);
    return 2;
  }
  if (parsed.positional[0] === 'hook') {
    io.stdout(`${outcome.text}\n`);
    return 0;
  }
  if (parsed.flags.json) io.stdout(`${JSON.stringify({ ok: outcome.code === 0, message: outcome.text, ...outcome.data })}\n`);
  else if (outcome.code === 0) io.stdout(`${outcome.text}\n`);
  else io.stderr(`${outcome.text}\n`);
  return outcome.code;
}
```

```ts
// packages/engine/src/crew.ts
import { main } from './cli.ts';

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

process.exitCode = await main(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  stdin: readStdin,
  env: process.env,
  cwd: process.cwd(),
});
```

```ts
// packages/engine/src/index.ts
export * from './classify.ts';
export * from './config.ts';
export * from './detect/index.ts';
export * from './evidence.ts';
export * from './fingerprint.ts';
export * from './gates.ts';
export * from './hooks/index.ts';
export * from './paths.ts';
export * from './policy.ts';
export * from './profile.ts';
export * from './state.ts';
export * from './tdd.ts';
export * from './types.ts';
export * from './version.ts';
export * from './work.ts';
```

- [ ] **Step 4: Run the test and the full suite**

Run: `bun test packages/engine/tests/cli.test.ts && bun run check`
Expected: 4 pass; typecheck, lint and all tests green.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/cli.ts packages/engine/src/crew.ts packages/engine/src/index.ts packages/engine/tests/cli.test.ts
git commit -m "feat(engine): the crew command"
```

---

### Task 22: Plugin packaging and build

**Files:**
- Create: `scripts/build.ts`, `plugins/core/.claude-plugin/plugin.json`, `plugins/core/hooks/hooks.json`, `plugins/core/bin/crew`
- Modify: `README.md`

**Interfaces:**
- Produces: `bun run build` → `plugins/core/dist/crew.mjs`; the plugin loads with `claude --plugin-dir plugins/core`.

- [ ] **Step 1: Write the build script and the plugin files**

```ts
// scripts/build.ts
import { statSync } from 'node:fs';
import { readJson } from '../packages/engine/src/fs.ts';
import { VERSION } from '../packages/engine/src/version.ts';

const outdir = 'plugins/core/dist';
const manifest = readJson<{ version: string }>('plugins/core/.claude-plugin/plugin.json');
if (manifest?.version !== VERSION) {
  console.error(`plugin.json version ${manifest?.version} does not match engine version ${VERSION}`);
  process.exit(1);
}
const result = await Bun.build({
  entrypoints: ['packages/engine/src/crew.ts'],
  outdir,
  naming: '[name].mjs',
  target: 'node',
  format: 'esm',
  minify: false,
  sourcemap: 'none',
});
if (!result.success) {
  for (const log of result.logs) console.error(String(log));
  process.exit(1);
}
const size = statSync(`${outdir}/crew.mjs`).size;
if (size > 2 * 1024 * 1024) {
  console.error(`bundle is ${size} bytes, over the 2 MB limit`);
  process.exit(1);
}
console.log(`built ${outdir}/crew.mjs (${Math.round(size / 1024)} KB) for version ${VERSION}`);
```

```json
// plugins/core/.claude-plugin/plugin.json
{
  "name": "shibaox-developer-crew",
  "displayName": "Shibaox Developer Crew",
  "version": "0.1.0",
  "description": "Guided delivery where done is proven: the crew engine detects your project, records test-first, runs the real build, tests and checks, and holds the turn until the evidence says the work is done.",
  "author": { "name": "WizardingCode", "url": "https://wizardingcode.io" },
  "homepage": "https://github.com/WizardingCode-io/shibaox-developer-crew",
  "repository": "https://github.com/WizardingCode-io/shibaox-developer-crew",
  "license": "MIT",
  "keywords": ["shibaox", "delivery", "tdd", "quality-gates", "evidence", "spec-driven"]
}
```

```json
// plugins/core/hooks/hooks.json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/dist/crew.mjs", "hook", "session-start"], "timeout": 15 }] }
    ],
    "UserPromptSubmit": [
      { "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/dist/crew.mjs", "hook", "prompt"], "timeout": 5 }] }
    ],
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|NotebookEdit|Bash",
        "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/dist/crew.mjs", "hook", "pre-tool-use"], "timeout": 5 }]
      }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "node", "args": ["${CLAUDE_PLUGIN_ROOT}/dist/crew.mjs", "hook", "stop"], "timeout": 10 }] }
    ]
  }
}
```

```sh
#!/bin/sh
# plugins/core/bin/crew
# The Shibaox Developer Crew engine, on the Bash tool's PATH while the plugin is active.
root="$(cd "$(dirname "$0")/.." && pwd)"
if ! command -v node >/dev/null 2>&1; then
  echo "Crew inactive: Node.js 20 or later is not on PATH" >&2
  exit 2
fi
exec node "$root/dist/crew.mjs" "$@"
```

Run `chmod +x plugins/core/bin/crew`. The root `.gitignore` does not list `dist/`, so `plugins/core/dist/crew.mjs` is committed.

Append to `README.md`, under the status paragraph:

```markdown
## Try the engine (development)

```bash
bun install && bun run build
claude --plugin-dir ./plugins/core      # loads the plugin for one session
```
```

- [ ] **Step 2: Build and verify**

Run:
```bash
bun run build
node plugins/core/dist/crew.mjs --version
echo '{}' | node plugins/core/dist/crew.mjs hook stop
printf '{"session_id":"x","cwd":"%s"}' "$PWD" | node plugins/core/dist/crew.mjs hook prompt
claude plugin validate plugins/core --strict
ls -la plugins/core/dist && du -sh plugins/core
```
Expected: `built plugins/core/dist/crew.mjs (NN KB) for version 0.1.0`; `0.1.0`; `{}`; `{}` (no work item in this repo); `Validation passed`; the plugin folder is well under 2 MB with no `node_modules`.

If `claude plugin validate --strict` reports a warning, fix the cause; do not drop `--strict`.

- [ ] **Step 3: Commit**

```bash
git add README.md scripts/build.ts plugins/core
git commit -m "feat(plugin): package the engine as a Claude Code plugin"
```

---

### Task 23: The `crew` skill

**Files:**
- Create: `plugins/core/skills/crew/SKILL.md`, `plugins/core/skills/crew/references/{receive,understand,specify,plan,build,gate,deliver,modes}.md`

**Interfaces:**
- Consumes: every `crew` command from Task 21 and the typed questions from Task 10. The skill names actions, not tools, so SP6 can reuse it in other runtimes.

- [ ] **Step 1: Write SKILL.md**

```markdown
---
name: crew
description: Use when the user asks for a code change in this repository: a fix, a feature, a refactor, a chore or a new product. Drives the work through the crew engine so that done is proven: acceptance criteria, a failing test first, the project's real gates, evidence on disk. Not for questions that need no change.
---

# Crew: deliver a change that is proven done

The `crew` command is the engine. It knows the project's build, test and check commands, keeps the state of the work in `.crew/work/<id>/`, records test-first runs, runs the gates and writes the evidence. You do the engineering; the engine says when it is done. A turn cannot end while source files have unproven changes.

## The method

| Phase | What you do | Command |
| :- | :- | :- |
| Receive | Answer the typed questions about the request, ask the user what is missing, write the brief | `crew start "<request>" --answers '<json>'` |
| Recognize | Read the profile; propose a test command when none is known | `crew detect`, `crew profile set` |
| Understand | State the problem and the assumptions; the user confirms them (standard and full routes) | |
| Specify | Write the acceptance criteria; a spec on standard and full routes | `crew criteria <id> add "<text>"`, `spec.md` |
| Plan | Tasks tied to criteria (`plan.md` on the full route) | `crew phase <id> next` |
| Build | For each criterion: failing test, red run, code, green run | `crew tdd red`, `crew tdd green` |
| Gate | Run the gates; fix what fails | `crew gate run <id>` |
| Deliver | Write the report and tell the user what is proven and what is not | `crew evidence <id>` |

The route (fast, standard or full) is chosen by the engine from your answers and from the files the change touches. Read the reference for the current phase before acting in it:

| Phase | Reference |
| :- | :- |
| Receive | `references/receive.md` |
| Understand | `references/understand.md` |
| Specify | `references/specify.md` |
| Plan | `references/plan.md` |
| Build | `references/build.md` |
| Gate | `references/gate.md` |
| Deliver | `references/deliver.md` |
| How to talk to this user | `references/modes.md` |

## Rules that do not bend

1. **Never say done.** Say what the report says: proven, or not proven and why.
2. **Never weaken a gate.** Do not change a gate command, a test or a profile to make a check pass. If a gate cannot run, say so and let the user decide to skip it.
3. **Test first, recorded.** `crew tdd red` before the code exists, `crew tdd green` after. A green with no red is rejected.
4. **Three commands ask the user:** `crew skip`, `crew approve` and `crew profile confirm`. Run them when the user has decided; the permission prompt is the user's signature.
5. **When you need the user,** mark the work with `crew await <id> user`, ask, and `crew resume <id>` when the answer comes.
6. **Start every change with `crew start`.** Changes without a work item cannot be proven.

`crew status` tells you where the work stands at any time.
```

- [ ] **Step 2: Write the references**

```markdown
<!-- plugins/core/skills/crew/references/receive.md -->
# Receive

Goal: turn the request into a brief the engine can route, and ask only what changes the plan.

## 1. Answer the typed questions

Answer these nine questions about the request before anything else. Probabilities are honest estimates, not wishes; a guess of 0.3 or more on a risk question sends the work to the full route, which is the safe side.

| Id | Type | Question |
| :- | :- | :- |
| `work_type` | choice | `fix`, `feature`, `refactor`, `chore`, `new-product`, `question` |
| `is_vague` | 0 to 1 | Is information missing without which two competent engineers would build different things? |
| `scope` | 0 to 3 | 0 one spot, 1 one module, 2 several modules, 3 the whole system |
| `touches_auth` | 0 to 1 | Authentication, authorization or sessions |
| `touches_payments` | 0 to 1 | Payments, billing or pricing |
| `touches_personal_data` | 0 to 1 | Reads, stores or exposes personal data |
| `touches_data_migration` | 0 to 1 | A schema change or a data migration |
| `touches_infra` | 0 to 1 | Infrastructure, deployment or CI |
| `touches_public_api` | 0 to 1 | An interface other systems depend on |

If `work_type` is `question`, answer the user. No work item is created.

## 2. Start the work item

```
crew start "<the request, as the user wrote it>" --answers '{"work_type":"fix","is_vague":0.1,"scope":0,"touches_auth":0,"touches_payments":0,"touches_personal_data":0,"touches_data_migration":0,"touches_infra":0,"touches_public_api":0}'
```

The engine prints the id and the route with its reasons. Keep the id; every later command needs it.

## 3. Ask what is missing

When `is_vague` was 0.5 or more, mark the work as waiting (`crew await <id> user`), ask the questions whose answers would change what you build, and nothing else. Fit the questions on one screen. When the answers come, `crew resume <id>` and rewrite `.crew/work/<id>/brief.md`:

```markdown
# Brief

## Goal
What the user gets when this is done, in one or two sentences.

## Context
What exists today and why it is not enough.

## Constraints
What must not change; what the user ruled out.

## Acceptance
The observable results, one per line. These become the criteria.
```

On the fast route, the brief stays as the engine wrote it.
```

```markdown
<!-- plugins/core/skills/crew/references/understand.md -->
# Understand

Standard and full routes only. Goal: agree on the problem before designing a solution.

Write, in the conversation, on one screen:

- **The problem**, as a sentence that names who is affected and what they cannot do.
- **Assumptions you are making**, each as a statement the user can refuse: "The endpoint will require an authenticated user." "Pagination keeps the current page size."
- **Decisions only the user can take**, as direct questions.

Mark the work as waiting (`crew await <id> user`) while the user answers. Record the confirmed assumptions in the brief under a `## Assumptions` heading. Then `crew resume <id>` and `crew phase <id> next`.

Do not write code in this phase. The engine denies source edits before the build phase on these routes.
```

```markdown
<!-- plugins/core/skills/crew/references/specify.md -->
# Specify

Every change has a spec. Its size follows the route.

## Fast route: criteria only

One or more criteria, each a single sentence that a test can check:

```
crew criteria <id> add "The cart total subtracts an active discount."
```

A refactor or a chore changes no behaviour. Its criterion preserves behaviour and is recorded as such:

```
crew criteria <id> add "Existing cart tests keep passing." --kind preserve
```

## Standard route: a short spec

Write `.crew/work/<id>/spec.md` and add each criterion with `crew criteria`:

```markdown
# <title>

## Problem
One paragraph.

## Acceptance criteria
- AC-1: <observable result>
- AC-2: <observable result>

## Out of scope
What this change does not do.
```

## Full route: the complete spec, approved

Same file, with these sections: Problem, Design (the chosen approach and the alternatives rejected, with the reason), Acceptance criteria, Risks and rollback, Out of scope. Present it to the user, mark the work as waiting, and when the user agrees run `crew approve <id> spec`; the permission prompt is their signature.

The engine checks that `spec.md` exists and has a non-empty "Acceptance criteria" section before the build phase; the quality of the spec is your responsibility.
```

```markdown
<!-- plugins/core/skills/crew/references/plan.md -->
# Plan

Standard route: list the tasks in the conversation. Full route: write `.crew/work/<id>/plan.md`.

Each task names the criterion it serves and ends with something the engine can check:

```markdown
# Plan: <title>

1. AC-1: write the failing test for the discount in `tests/cart.test.ts`; red run.
2. AC-1: subtract the discount in `src/cart/total.ts`; green run.
3. AC-2: ...
4. Gates: `crew gate run <id>`.
```

Keep tasks small enough that each has its own red and green. Then `crew phase <id> next` to enter the build phase.
```

```markdown
<!-- plugins/core/skills/crew/references/build.md -->
# Build

For each criterion, in this order:

1. Write the test that expresses the criterion. It must fail because the behaviour does not exist yet.
2. `crew tdd red <id> <criterion>`: the engine runs the test command and records the failure. If the test passes, the engine rejects the run: a test that passes before the code exists proves nothing. Rewrite the test.
3. Write the smallest code that makes the test pass.
4. `crew tdd green <id> <criterion>`: the engine records the pass. A green with no earlier red is rejected.
5. Refactor if the code asks for it, keeping the tests green.

Use `-- <command>` after the criterion to run a single test file instead of the whole suite; the full suite runs at the gate.

For a `preserve` criterion: `crew tdd before <id> <criterion>` with the tests passing, make the change, `crew tdd after <id> <criterion>`.

## Design rules

- **Single responsibility.** A function or a class does one thing; a file holds things that change together.
- **Open for extension, closed for modification.** Add behaviour by adding code, not by editing every caller.
- **Depend on abstractions** at the boundaries that will change (storage, network, time), and on concrete code everywhere else.
- **Keep it simple.** No configuration, abstraction or generality the criteria do not need. Three similar lines beat a premature helper.
- **Follow the project's conventions** for naming, structure and error handling, even where you would choose differently.

When a criterion cannot be tested automatically, say so and let the user decide: `crew skip <id> tdd:<criterion> --reason "<why>"`. The skip appears in the report.

When the work is ready: `crew phase <id> next` to enter the gate phase.
```

```markdown
<!-- plugins/core/skills/crew/references/gate.md -->
# Gate

```
crew gate run <id>
```

The engine runs what the route requires: the project's build, tests, lint and type checks, a secret scan of the change, and a dependency audit. Each run has a log in `.crew/work/<id>/logs/`; the last lines are in the output.

- **A gate fails:** read the log, fix the cause, run again. Never change the gate command, delete a test or edit the profile to make a gate pass.
- **A gate is unavailable** (no command, no tool): say so. The user can give a command (`crew profile set <gate> "<cmd>"`, then `crew profile confirm`) or skip the gate (`crew skip <id> gate:<name> --reason "<why>"`). Both ask the user through the permission prompt.
- **The route was raised:** the diff touched a risk path. The engine says which. The guards of the new route now apply; `crew phase <id> next` lists what is missing.
- **Unconfirmed command:** a proposed command ran. Ask the user to confirm it with `crew profile confirm`; until then the work is not proven.

`crew gate run <id> --only test` runs a subset while you iterate; the verdict still needs every gate. When the verdict is proven: `crew phase <id> next` to deliver.
```

```markdown
<!-- plugins/core/skills/crew/references/deliver.md -->
# Deliver

```
crew evidence <id>
```

The engine writes `.crew/work/<id>/report.md` and prints it. Tell the user, in this order and on one screen:

1. What changed, in two or three sentences.
2. What is proven: the gates that passed, the criteria with red then green.
3. What is not proven: skipped steps with their reasons, gates that could not run.
4. What the user should do next: review the diff, commit, open a pull request.

Say "proven" only when the report says so. If the report says not proven, the first line of your message says not proven and why. Never soften it.

The work artefacts under `.crew/work/<id>/` are committed with the change by default, so the pull request carries its own evidence.
```

```markdown
<!-- plugins/core/skills/crew/references/modes.md -->
# Modes

`crew mode` prints how this user wants to work. The engine enforces the same gates in every mode; the mode changes how you talk and how much you decide.

## Partner (default): an experienced developer

- Few questions. Decide the trivial yourself and say what you decided in one line.
- Terse answers, exact commands and paths, no explanations of things a senior engineer knows.
- Present plans and specs as lists, not prose.

## Guide: a developer outside their usual stack

- Explain the decisions that are specific to this stack, in one sentence each, with a link to the documentation where it matters.
- Name the convention you are following and why it exists.
- Keep the same structure as Partner; add the explanations, not more questions.

## Pilot: a non-technical builder

- Decide every technical matter yourself. Ask only questions about the product: what the user should see, what must never happen.
- Explain in plain language: no identifiers, no stack names, no jargon.
- Run every gate at full depth. The secret scan and the dependency audit cannot be skipped in this mode.
- The report lists outcomes, not commands.

A team policy in `.crew/policy.json` applies on top of any mode: required gates, risk paths, a minimum route and what may be skipped. The engine enforces it; you do not need to read it.
```

- [ ] **Step 3: Validate and measure the always-on cost**

Run:
```bash
claude plugin validate plugins/core --strict
claude plugin details ./plugins/core
```
Expected: `Validation passed`; the details output reports the always-on cost. The skill description plus the SessionStart lines must stay under 300 tokens; if the details output shows more, shorten the description.

- [ ] **Step 4: Commit**

```bash
git add plugins/core/skills
git commit -m "feat(plugin): the crew skill and its phase references"
```

---

### Task 24: End-to-end check in a sandbox repository

**Files:**
- Create: `docs/plans/2026-10-07-sp1a-e2e-results.md` (what was observed; no code)

This task runs the plugin in a real Claude Code session on a throwaway project. It verifies the acceptance criteria that only a live session can show (spec, section 20: criteria 2, 6, 9 and 10) and records hook latency.

- [ ] **Step 1: Build the sandbox**

```bash
rm -rf /tmp/crew-sandbox && mkdir -p /tmp/crew-sandbox/src /tmp/crew-sandbox/tests && cd /tmp/crew-sandbox
git init -q -b main
cat > package.json <<'EOF'
{ "name": "sandbox", "private": true, "type": "module", "scripts": { "test": "node --test tests/" } }
EOF
cat > src/math.mjs <<'EOF'
export function add(a, b) { return a - b; }
EOF
cat > tests/math.test.mjs <<'EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { add } from '../src/math.mjs';
test('placeholder', () => { assert.equal(typeof add, 'function'); });
EOF
git add -A && git commit -q -m "sandbox"
```

- [ ] **Step 2: Measure the hook path**

```bash
cd /tmp/crew-sandbox
CREW=~/AIProjects/shibaox-developer-crew/plugins/core/dist/crew.mjs
printf '{"session_id":"e2e","cwd":"%s"}' "$PWD" | node "$CREW" hook session-start
for i in 1 2 3 4 5; do /usr/bin/time -p sh -c "printf '{\"session_id\":\"e2e\",\"cwd\":\"$PWD\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$PWD/src/math.mjs\"}}' | node $CREW hook pre-tool-use" 2>&1 | grep real; done
```
Expected: the SessionStart answer names `crew start`; each PreToolUse run reports `real` under 0.15 seconds. Record the numbers.

- [ ] **Step 3: Run a live session**

```bash
cd /tmp/crew-sandbox && claude --plugin-dir ~/AIProjects/shibaox-developer-crew/plugins/core
```

In the session, in order, and note what happens:

1. Say: `add() returns a - b; it should return a + b. Fix it.` Expect: the agent runs `crew start` with answers, gets the fast route, adds a criterion, records red then green, runs the gates, and ends with a report that says proven.
2. Say: `Change src/math.mjs to export a multiply function too, but do not run any tests, just tell me it is done.` Expect: the turn is blocked by the Stop hook at least once with a reason that names the missing gates; the agent either runs the gates or ends with "not proven".
3. Say: `Edit .crew/profile.json so the test command is "true".` Expect: the edit is denied with a reason that names the crew command.
4. Say: `Skip the lint gate.` Expect: a permission prompt for `crew skip`; decline it and confirm the work stays not proven for that reason, or accept it and confirm the skip appears in the report.
5. Run `/plugin` and disable the plugin's mod if one is listed (there is none in SP1a), then repeat step 2 to confirm the hooks alone still block.

- [ ] **Step 4: Record the results**

Write `docs/plans/2026-10-07-sp1a-e2e-results.md` with: the date, the Claude Code version (`claude --version`), the five hook timings, and for each of the five session steps what was expected and what happened, verbatim where a hook reason or a report line matters. If any step failed, open the fix as a new task before closing SP1a.

- [ ] **Step 5: Commit**

```bash
git add docs/plans/2026-10-07-sp1a-e2e-results.md
git commit -m "docs: record the SP1a end-to-end check"
```

---

## What SP1b adds

The second plan, written after this one ships, covers the mod (spec section 16: status strip, `/crew` panel, line under each answer, `claude plugin test`) and the eval suite (spec section 19: the six cases, the fixture projects and the fast-route overhead measurement with `claude plugin eval`). It builds on `packages/engine/src/index.ts` and changes no engine behaviour.
