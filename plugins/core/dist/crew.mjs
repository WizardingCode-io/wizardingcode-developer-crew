// packages/engine/src/cli.ts
import { existsSync as existsSync3 } from "node:fs";
import { join as join18 } from "node:path";

// packages/engine/src/glob.ts
var SPECIAL = /[.+^${}()|[\]\\]/g;
function globToRegExp(glob) {
  let re = "";
  for (let i = 0;i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:.*/)?";
          i += 2;
        } else {
          re += ".*";
          i += 1;
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c !== undefined) {
      re += c.replace(SPECIAL, "\\$&");
    }
  }
  return new RegExp(`^${re}$`, "i");
}
function matchesAny(path, patterns) {
  const normalised = path.replace(/\\/g, "/").replace(/^\.\//, "");
  return patterns.some((pattern) => globToRegExp(pattern).test(normalised));
}

// packages/engine/src/types.ts
var GATE_NAMES = [
  "build",
  "test",
  "lint",
  "typecheck",
  "secrets",
  "deps"
];
var ROUTE_ORDER = ["fast", "standard", "full"];
var PHASE_ORDER = [
  "receive",
  "recognize",
  "understand",
  "specify",
  "plan",
  "build",
  "gate",
  "deliver"
];

// packages/engine/src/classify.ts
var WORK_TYPES = {
  fix: "repairs behaviour that is wrong today",
  feature: "adds or changes behaviour on purpose",
  refactor: "changes structure without changing behaviour",
  chore: "tooling, dependencies, configuration or documentation",
  "new-product": "a new application or service from scratch",
  question: "the user wants an answer, not a change"
};
var QUESTIONS = {
  work_type: {
    type: "choice",
    instructions: "What kind of work does this request ask for?",
    criteria: WORK_TYPES
  },
  is_vague: {
    type: "noul",
    instructions: "Is information missing without which two competent engineers would build different things?"
  },
  scope: {
    type: "score",
    instructions: "How much of the codebase does this change touch?",
    criteria: ["one spot", "one module", "several modules", "the whole system"]
  },
  touches_auth: {
    type: "noul",
    instructions: "Does this change authentication, authorization or sessions?"
  },
  touches_payments: {
    type: "noul",
    instructions: "Does this change payments, billing or pricing?"
  },
  touches_personal_data: {
    type: "noul",
    instructions: "Does this read, store or expose personal data?"
  },
  touches_data_migration: {
    type: "noul",
    instructions: "Does this change a database schema or migrate data?"
  },
  touches_infra: {
    type: "noul",
    instructions: "Does this change infrastructure, deployment or CI?"
  },
  touches_public_api: {
    type: "noul",
    instructions: "Does this change an interface other systems depend on?"
  }
};

class AnswerError extends Error {
  problems;
  constructor(problems) {
    super(problems.join("; "));
    this.problems = problems;
    this.name = "AnswerError";
  }
}
var RISK_THRESHOLD = 0.3;
var VAGUE_THRESHOLD = 0.5;
function validateAnswers(raw) {
  const problems = [];
  if (typeof raw !== "object" || raw === null)
    throw new AnswerError(["answers must be an object"]);
  const input = raw;
  for (const [id, question] of Object.entries(QUESTIONS)) {
    const value = input[id];
    if (question.type === "choice") {
      if (typeof value !== "string" || !(value in question.criteria)) {
        problems.push(`${id}: expected one of ${Object.keys(question.criteria).join(", ")}`);
      }
    } else if (question.type === "noul") {
      if (typeof value !== "number" || value < 0 || value > 1) {
        problems.push(`${id}: expected a probability between 0 and 1`);
      }
    } else if (!Number.isInteger(value) || value < 0 || value >= question.criteria.length) {
      problems.push(`${id}: expected an integer level from 0 to ${question.criteria.length - 1}`);
    }
  }
  if (problems.length)
    throw new AnswerError(problems);
  return input;
}
var AREA_BY_QUESTION = {
  touches_auth: "auth",
  touches_payments: "payments",
  touches_personal_data: "personal-data",
  touches_data_migration: "data-migration",
  touches_infra: "infra",
  touches_public_api: "public-api"
};
function riskAreasFromAnswers(answers) {
  const areas = [];
  for (const [id, area] of Object.entries(AREA_BY_QUESTION)) {
    if (answers[id] >= RISK_THRESHOLD)
      areas.push(area);
  }
  return areas;
}
var DEFAULT_RISK_PATHS = {
  auth: [
    "**/auth/**",
    "**/*auth*",
    "**/Middleware/Authenticate*",
    "**/login*",
    "**/session*",
    "**/password*",
    "**/oauth*",
    "**/jwt*"
  ],
  payments: [
    "**/payment*",
    "**/billing*",
    "**/checkout*",
    "**/stripe*",
    "**/invoice*",
    "**/pricing*"
  ],
  "personal-data": ["**/gdpr*", "**/privacy*", "**/consent*", "**/pii*", "**/*personal*"],
  "data-migration": ["**/migrations/**", "**/migrate*", "**/schema.*", "**/*.sql", "**/prisma/**"],
  infra: [
    ".github/workflows/**",
    ".gitlab-ci.yml",
    "**/Dockerfile*",
    "**/docker-compose*",
    "**/terraform/**",
    "**/*.tf",
    "**/k8s/**",
    "**/helm/**",
    "**/deploy*",
    "**/ansible/**"
  ],
  "public-api": [
    "**/routes/api*",
    "**/openapi*",
    "**/swagger*",
    "**/*.proto",
    "**/graphql/schema*"
  ],
  secrets: [".env*", "**/.env*", "**/secrets*", "**/*.pem", "**/*.key", "**/credentials*"]
};
function riskAreasForPaths(paths, policy) {
  const areas = [];
  for (const area of Object.keys(DEFAULT_RISK_PATHS)) {
    const patterns = [...DEFAULT_RISK_PATHS[area], ...policy.riskPaths[area] ?? []];
    if (paths.some((path) => matchesAny(path, patterns)))
      areas.push(area);
  }
  return areas;
}
function routeRank(route) {
  return ROUTE_ORDER.indexOf(route);
}
function computeRoute(answers, pathRisk, policy) {
  const riskAreas = [...new Set([...riskAreasFromAnswers(answers), ...pathRisk])];
  const reasons = [];
  let route;
  if (answers.work_type === "new-product") {
    route = "full";
    reasons.push("new product");
  } else if (riskAreas.length > 0) {
    route = "full";
    reasons.push(`risk areas: ${riskAreas.join(", ")}`);
  } else if ((answers.work_type === "fix" || answers.work_type === "chore") && answers.is_vague < VAGUE_THRESHOLD && answers.scope === 0) {
    route = "fast";
    reasons.push(`${answers.work_type} in one spot, clear request, no risk area`);
  } else {
    route = "standard";
    reasons.push(`${answers.work_type}, scope level ${answers.scope}, ${answers.is_vague >= VAGUE_THRESHOLD ? "vague request" : "clear request"}`);
  }
  if (routeRank(policy.minimumRoute) > routeRank(route)) {
    route = policy.minimumRoute;
    reasons.push(`team policy minimum: ${policy.minimumRoute}`);
  }
  return { route, reasons, riskAreas };
}

// packages/engine/src/config.ts
import { join as join2 } from "node:path";

// packages/engine/src/fs.ts
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}
function exists(path) {
  return existsSync(path);
}
function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}
function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}
function readJson(path) {
  const text = readText(path);
  if (text === null)
    return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function writeText(path, text) {
  ensureDir(dirname(path));
  const tmp = join(dirname(path), `.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}
function writeJson(path, data) {
  writeText(path, `${JSON.stringify(data, null, 2)}
`);
}
function nowIso() {
  return new Date().toISOString();
}

// packages/engine/src/config.ts
var DEFAULT_CONFIG = { mode: "partner", decisions: { log: true } };
var MODES = ["partner", "guide", "pilot"];
function configPath(paths) {
  return join2(paths.userDir, "config.json");
}
function loadConfig(paths) {
  const raw = readJson(configPath(paths)) ?? {};
  return {
    mode: MODES.includes(raw.mode) ? raw.mode : DEFAULT_CONFIG.mode,
    decisions: { log: raw.decisions?.log !== false }
  };
}
function saveConfig(paths, config) {
  writeJson(configPath(paths), config);
}
function setConfigValue(config, key, value) {
  if (key === "mode") {
    if (!MODES.includes(value))
      throw new Error(`mode must be one of ${MODES.join(", ")}`);
    return { ...config, mode: value };
  }
  if (key === "decisions.log") {
    if (value !== "true" && value !== "false")
      throw new Error("decisions.log must be true or false");
    return { ...config, decisions: { log: value === "true" } };
  }
  throw new Error(`unknown setting: ${key}`);
}

// packages/engine/src/detect/index.ts
import { readdirSync, statSync } from "node:fs";
import { join as join6, relative } from "node:path";

// packages/engine/src/detect/node.ts
import { join as join3 } from "node:path";
var SCRIPT_CANDIDATES = {
  build: ["build"],
  test: ["test", "test:unit", "unit"],
  lint: ["lint", "lint:check", "eslint", "biome"],
  typecheck: ["typecheck", "type-check", "types", "tsc"]
};
var TSC_BY_MANAGER = {
  npm: "npx tsc --noEmit",
  pnpm: "pnpm exec tsc --noEmit",
  yarn: "yarn tsc --noEmit",
  bun: "bunx tsc --noEmit"
};
function packageManager(dir) {
  if (exists(join3(dir, "bun.lock")) || exists(join3(dir, "bun.lockb")))
    return "bun";
  if (exists(join3(dir, "pnpm-lock.yaml")))
    return "pnpm";
  if (exists(join3(dir, "yarn.lock")))
    return "yarn";
  return "npm";
}
var nodeDetector = {
  stack: "node",
  detect(dir) {
    const pkg = readJson(join3(dir, "package.json"));
    if (!pkg)
      return null;
    const manager = packageManager(dir);
    const scripts = pkg.scripts ?? {};
    const gates = {};
    for (const [gate, names] of Object.entries(SCRIPT_CANDIDATES)) {
      const name = names.find((candidate) => (candidate in scripts));
      if (!name)
        continue;
      if (gate === "test" && /no test specified/.test(scripts[name] ?? ""))
        continue;
      gates[gate] = `${manager} run ${name}`;
    }
    if (!gates.typecheck && exists(join3(dir, "tsconfig.json"))) {
      gates.typecheck = TSC_BY_MANAGER[manager];
    }
    return { stack: "node", packageManager: manager, gates };
  }
};

// packages/engine/src/detect/php.ts
import { join as join4 } from "node:path";
var phpDetector = {
  stack: "php",
  detect(dir) {
    const composer = readJson(join4(dir, "composer.json"));
    if (!composer)
      return null;
    const scripts = composer.scripts ?? {};
    const installed = (tool) => exists(join4(dir, "vendor", "bin", tool));
    const gates = {};
    if ("test" in scripts)
      gates.test = "composer run test";
    else if (installed("pest"))
      gates.test = "vendor/bin/pest";
    else if (installed("phpunit"))
      gates.test = "vendor/bin/phpunit";
    if ("lint" in scripts)
      gates.lint = "composer run lint";
    else if (installed("pint"))
      gates.lint = "vendor/bin/pint --test";
    if ("analyse" in scripts)
      gates.typecheck = "composer run analyse";
    else if ("analyze" in scripts)
      gates.typecheck = "composer run analyze";
    else if (installed("phpstan"))
      gates.typecheck = "vendor/bin/phpstan analyse --no-progress";
    return { stack: "php", packageManager: "composer", gates };
  }
};

// packages/engine/src/detect/python.ts
import { join as join5 } from "node:path";
var PREFIX = {
  uv: "uv run ",
  poetry: "poetry run ",
  pip: "python -m "
};
var pythonDetector = {
  stack: "python",
  detect(dir) {
    const pyproject = readText(join5(dir, "pyproject.toml"));
    if (pyproject === null && !exists(join5(dir, "requirements.txt")))
      return null;
    const manager = exists(join5(dir, "uv.lock")) ? "uv" : exists(join5(dir, "poetry.lock")) ? "poetry" : "pip";
    const prefix = PREFIX[manager] ?? "";
    const text = pyproject ?? "";
    const gates = {};
    const hasPytest = /\[tool\.pytest/.test(text) || exists(join5(dir, "pytest.ini")) || exists(join5(dir, "conftest.py")) || exists(join5(dir, "tests"));
    if (hasPytest)
      gates.test = `${prefix}pytest`;
    if (/\[tool\.ruff/.test(text) || exists(join5(dir, "ruff.toml"))) {
      gates.lint = `${prefix}ruff check .`;
    }
    if (/\[tool\.mypy/.test(text))
      gates.typecheck = `${prefix}mypy .`;
    else if (/\[tool\.pyright/.test(text))
      gates.typecheck = `${prefix}pyright`;
    return { stack: "python", packageManager: manager, gates };
  }
};

// packages/engine/src/detect/index.ts
var DETECTORS = [nodeDetector, phpDetector, pythonDetector];
var DEFAULT_WATCH_EXCLUDE = ["**/*.md", "docs/**", ".crew/**"];
var DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
var MAX_DEPTH = 3;
var SKIP_DIRS = new Set([
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage",
  "storage",
  "target",
  ".venv",
  "venv",
  "__pycache__"
]);
function* folders(root, depth = 0) {
  yield root;
  if (depth >= MAX_DEPTH)
    return;
  let names;
  try {
    names = readdirSync(root).sort();
  } catch {
    return;
  }
  for (const name of names) {
    if (name.startsWith(".") || SKIP_DIRS.has(name))
      continue;
    const path = join6(root, name);
    try {
      if (!statSync(path).isDirectory())
        continue;
    } catch {
      continue;
    }
    yield* folders(path, depth + 1);
  }
}
function detectTargets(root) {
  const targets = [];
  for (const dir of folders(root)) {
    for (const detector of DETECTORS) {
      const found = detector.detect(dir);
      if (!found)
        continue;
      const gates = {};
      for (const [gate, command] of Object.entries(found.gates)) {
        gates[gate] = { command, source: "detected" };
      }
      const rel = relative(root, dir).replace(/\\/g, "/");
      targets.push({
        path: rel === "" ? "." : rel,
        stack: found.stack,
        packageManager: found.packageManager,
        gates,
        timeoutMs: DEFAULT_TIMEOUT_MS
      });
    }
  }
  return targets;
}
function mergeProfile(previous, targets) {
  if (previous) {
    for (const target of targets) {
      const old = previous.targets.find((t) => t.path === target.path && t.stack === target.stack);
      if (!old)
        continue;
      target.timeoutMs = old.timeoutMs;
      for (const [gate, command] of Object.entries(old.gates)) {
        if (command.source !== "detected")
          target.gates[gate] = command;
      }
    }
  }
  return {
    version: 1,
    detectedAt: nowIso(),
    targets,
    watch: previous?.watch ?? { exclude: [...DEFAULT_WATCH_EXCLUDE] }
  };
}
function detectProfile(root, previous = null) {
  return mergeProfile(previous, detectTargets(root));
}
function missingTestCommands(profile) {
  if (profile.targets.length === 0)
    return [{ target: ".", gate: "test" }];
  const covered = new Set(profile.targets.filter((t) => t.gates.test).map((t) => t.path));
  const paths = [...new Set(profile.targets.map((t) => t.path))];
  return paths.filter((p) => !covered.has(p)).map((target) => ({ target, gate: "test" }));
}

// packages/engine/src/evidence.ts
import { join as join10 } from "node:path";

// packages/engine/src/paths.ts
import { homedir } from "node:os";
import { dirname as dirname2, join as join7, relative as relative2, resolve, sep } from "node:path";
function findRoot(cwd) {
  let dir = resolve(cwd);
  for (;; ) {
    if (exists(join7(dir, ".crew")) || exists(join7(dir, ".git")))
      return dir;
    const parent = dirname2(dir);
    if (parent === dir)
      return resolve(cwd);
    dir = parent;
  }
}
function resolvePaths(cwd, env = process.env) {
  const root = findRoot(cwd);
  const home = env.SHIBAOX_HOME ?? join7(homedir(), ".shibaox");
  const userDir = join7(home, "crew");
  const repoId = sha256(root).slice(0, 16);
  return {
    root,
    crewDir: join7(root, ".crew"),
    localDir: join7(root, ".crew", "local"),
    userDir,
    integrityFile: join7(userDir, "integrity", `${repoId}.json`),
    repoId
  };
}
function workDir(paths, id) {
  return join7(paths.crewDir, "work", id);
}
var PROTECTED_TOP = new Set([".crew/profile.json", ".crew/policy.json", ".crew/.gitignore"]);
var PROTECTED_IN_WORK = new Set(["work.json", "evidence.json", "report.md"]);
function isProtectedPath(paths, absPath) {
  const abs = resolve(absPath);
  if (abs === paths.userDir || abs.startsWith(paths.userDir + sep))
    return true;
  const rel = relative2(paths.root, abs).replace(/\\/g, "/");
  if (rel.startsWith("..") || rel === "")
    return false;
  if (PROTECTED_TOP.has(rel))
    return true;
  if (rel === ".crew/local" || rel.startsWith(".crew/local/"))
    return true;
  const inWork = /^\.crew\/work\/[^/]+\/(.+)$/.exec(rel);
  if (!inWork)
    return false;
  const inner = inWork[1] ?? "";
  return PROTECTED_IN_WORK.has(inner) || inner.startsWith("logs/");
}

// packages/engine/src/store.ts
import { relative as relative3 } from "node:path";
function rel(paths, absPath) {
  return relative3(paths.root, absPath).replace(/\\/g, "/");
}
function integrityOf(paths) {
  return readJson(paths.integrityFile) ?? {};
}
function remember(paths, absPath, text) {
  const integrity = integrityOf(paths);
  integrity[rel(paths, absPath)] = sha256(text);
  writeJson(paths.integrityFile, integrity);
}
function writeProtectedText(paths, absPath, text) {
  writeText(absPath, text);
  remember(paths, absPath, text);
}
function writeProtectedJson(paths, absPath, data) {
  writeProtectedText(paths, absPath, `${JSON.stringify(data, null, 2)}
`);
}
function recordIntegrity(paths, absPath) {
  const text = readText(absPath);
  if (text !== null)
    remember(paths, absPath, text);
}
function readProtectedJson(paths, absPath) {
  const text = readText(absPath);
  if (text === null)
    return { data: null, tampered: false };
  const expected = integrityOf(paths)[rel(paths, absPath)];
  const tampered = expected !== undefined && expected !== sha256(text);
  try {
    return { data: JSON.parse(text), tampered };
  } catch {
    return { data: null, tampered: true };
  }
}

// packages/engine/src/work.ts
import { existsSync as existsSync2, readdirSync as readdirSync2 } from "node:fs";
import { join as join9 } from "node:path";

// packages/engine/src/state.ts
import { join as join8 } from "node:path";
function statePath(paths) {
  return join8(paths.localDir, "state.json");
}
function loadState(paths) {
  const raw = readJson(statePath(paths)) ?? {};
  return {
    active: typeof raw.active === "string" ? raw.active : null,
    sessions: raw.sessions ?? {}
  };
}
function saveState(paths, state) {
  writeJson(statePath(paths), state);
}
function sessionState(state, sessionId) {
  const existing = state.sessions[sessionId];
  if (existing)
    return existing;
  const created = { baseline: null, stopBlocks: 0 };
  state.sessions[sessionId] = created;
  return created;
}
function ensureCrewDir(paths, policy) {
  const wanted = `local/
work/*/logs/
${policy.artifacts === "local" ? `work/
` : ""}`;
  const file = join8(paths.crewDir, ".gitignore");
  if (readText(file) !== wanted)
    writeProtectedText(paths, file, wanted);
}

// packages/engine/src/work.ts
var PHASES_BY_ROUTE = {
  fast: ["receive", "recognize", "build", "gate", "deliver"],
  standard: ["receive", "recognize", "understand", "specify", "plan", "build", "gate", "deliver"],
  full: ["receive", "recognize", "understand", "specify", "plan", "build", "gate", "deliver"]
};
function slug(text) {
  return text.toLowerCase().normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
}
function workJson(paths, id) {
  return join9(workDir(paths, id), "work.json");
}
function newWorkId(paths, title) {
  const date = nowIso().slice(0, 10);
  let existing = 0;
  try {
    existing = readdirSync2(join9(paths.crewDir, "work")).filter((n) => n.startsWith(date)).length;
  } catch {
    existing = 0;
  }
  const seq = String(existing + 1).padStart(3, "0");
  return `${date}-${seq}-${slug(title).slice(0, 40).replace(/-$/, "")}`;
}
function createWork(paths, input) {
  const title = (input.split(`
`).find((line) => line.trim()) ?? "untitled").trim().slice(0, 80);
  const at = nowIso();
  const work = {
    id: newWorkId(paths, title),
    title,
    input,
    type: "feature",
    route: "standard",
    routeReasons: ["not classified yet: standard by default"],
    riskAreas: [],
    phase: "receive",
    awaiting: null,
    criteria: [],
    approvals: [],
    skips: [],
    createdAt: at,
    updatedAt: at
  };
  writeProtectedJson(paths, workJson(paths, work.id), work);
  writeText(join9(workDir(paths, work.id), "brief.md"), `# Brief

## Request

${input.trim()}
`);
  const state = loadState(paths);
  state.active = work.id;
  saveState(paths, state);
  return work;
}
function saveWork(paths, work) {
  work.updatedAt = nowIso();
  writeProtectedJson(paths, workJson(paths, work.id), work);
}
function loadWork(paths, id) {
  const read = readProtectedJson(paths, workJson(paths, id));
  return { work: read.data, tampered: read.tampered };
}
function activeWork(paths) {
  const id = loadState(paths).active;
  if (!id || !existsSync2(workJson(paths, id)))
    return null;
  return loadWork(paths, id);
}
function applyClassification(work, type, decision) {
  work.type = type;
  work.route = decision.route;
  work.routeReasons = [...decision.reasons];
  work.riskAreas = [...decision.riskAreas];
  if (work.phase === "receive")
    work.phase = "recognize";
}
function raiseRoute(work, to, reason) {
  if (routeRank(to) <= routeRank(work.route))
    return false;
  work.route = to;
  work.routeReasons.push(`raised to ${to}: ${reason}`);
  return true;
}
function addCriterion(work, text, kind = "behavior") {
  const criterion = { id: `AC-${work.criteria.length + 1}`, kind, text: text.trim() };
  work.criteria.push(criterion);
  return criterion;
}
function approve(work, what) {
  work.approvals.push({ what, at: nowIso() });
}
function addSkip(work, step, reason) {
  work.skips.push({ step, reason, at: nowIso() });
}
function isSkipped(work, step) {
  return work.skips.some((s) => s.step === step);
}
function phaseIndex(phase) {
  return PHASE_ORDER.indexOf(phase);
}
function isBeforeBuild(work) {
  return phaseIndex(work.phase) < phaseIndex("build");
}
function hasAcceptanceSection(text) {
  const match = /^#{1,6}\s*acceptance criteria\s*$/im.exec(text);
  if (!match)
    return false;
  const rest = text.slice(match.index + match[0].length);
  const body = rest.split(/^#{1,6}\s/m)[0] ?? "";
  return body.trim().length > 0;
}
function tddDone(record, kind) {
  if (!record)
    return false;
  return kind === "behavior" ? !!record.red && !!record.green : !!record.before && !!record.after;
}
function guardFor(work, next, ctx) {
  const missing = [];
  if (next === "build") {
    if (work.criteria.length === 0) {
      missing.push('at least one acceptance criterion (crew criteria <id> add "...")');
    }
    if (work.route !== "fast") {
      if (ctx.specText === null)
        missing.push("spec.md in the work folder");
      else if (!hasAcceptanceSection(ctx.specText)) {
        missing.push('an "Acceptance criteria" section with content in spec.md');
      }
    }
    if (work.route === "full") {
      if (!work.approvals.some((a) => a.what === "spec")) {
        missing.push("the user's approval of the spec (crew approve <id> spec)");
      }
      if (!ctx.planExists)
        missing.push("plan.md in the work folder");
    }
  } else if (next === "gate") {
    for (const criterion of work.criteria) {
      if (isSkipped(work, `tdd:${criterion.id}`))
        continue;
      const record = ctx.evidence?.tdd.find((t) => t.criterion === criterion.id);
      if (!tddDone(record, criterion.kind)) {
        const how = criterion.kind === "behavior" ? "red/green" : "before/after";
        missing.push(`test-first record for ${criterion.id} (crew tdd ${how})`);
      }
    }
  } else if (next === "deliver" && !ctx.proven) {
    missing.push(...ctx.unproven.map((reason) => `not proven: ${reason}`));
    if (missing.length === 0)
      missing.push("not proven: run crew gate run <id>");
  }
  return missing;
}
function nextPhaseOf(work) {
  const phases = PHASES_BY_ROUTE[work.route];
  const index = phases.indexOf(work.phase);
  const current = index === -1 ? phases.findIndex((p) => phaseIndex(p) > phaseIndex(work.phase)) - 1 : index;
  return phases[current + 1] ?? null;
}
function advancePhase(work, ctx) {
  const next = nextPhaseOf(work);
  if (!next)
    return { ok: false, missing: ["already at the last phase"] };
  const missing = guardFor(work, next, ctx);
  if (missing.length)
    return { ok: false, missing };
  work.phase = next;
  return { ok: true, phase: next };
}

// packages/engine/src/evidence.ts
function emptyEvidence() {
  return {
    fingerprint: null,
    tdd: [],
    runs: [],
    verdict: "unproven",
    unproven: ["gates have not run"]
  };
}
function evidencePath(paths, id) {
  return join10(workDir(paths, id), "evidence.json");
}
function loadEvidence(paths, id) {
  const read = readProtectedJson(paths, evidencePath(paths, id));
  return { evidence: read.data ?? emptyEvidence(), tampered: read.tampered };
}
function saveEvidence(paths, id, evidence) {
  writeProtectedJson(paths, evidencePath(paths, id), evidence);
}
function computeVerdict(input) {
  const { work, evidence, expected, currentFingerprint, tampered } = input;
  const unproven = [];
  if (tampered)
    unproven.push("state changed outside the engine");
  if (evidence.fingerprint === null)
    unproven.push("gates have not run");
  else if (evidence.fingerprint !== currentFingerprint)
    unproven.push("code changed since the last gate run");
  const multiTarget = new Set(expected.map((e) => e.target)).size > 1;
  for (const { gate, target } of expected) {
    if (isSkipped(work, `gate:${gate}`))
      continue;
    const label = multiTarget && target !== "." ? `${gate} (${target})` : gate;
    const run = evidence.runs.find((r) => r.gate === gate && r.target === target);
    if (!run)
      unproven.push(`gate ${label} not run`);
    else if (run.status === "fail")
      unproven.push(`gate ${label} failing`);
    else if (run.status === "unavailable")
      unproven.push(`gate ${label} unavailable: ${run.reason ?? "no command"}`);
    else if (run.status === "pass" && !run.confirmed) {
      unproven.push(`gate ${label} ran an unconfirmed command (crew profile confirm)`);
    }
  }
  for (const criterion of work.criteria) {
    if (isSkipped(work, `tdd:${criterion.id}`))
      continue;
    const record = evidence.tdd.find((t) => t.criterion === criterion.id);
    if (!tddDone(record, criterion.kind))
      unproven.push(`test-first record missing for ${criterion.id}`);
  }
  return { verdict: unproven.length === 0 ? "proven" : "unproven", unproven };
}
function tddSummary(work, evidence, criterionId, kind) {
  if (isSkipped(work, `tdd:${criterionId}`)) {
    const skip = work.skips.find((s) => s.step === `tdd:${criterionId}`);
    return `skipped: ${skip?.reason ?? ""}`;
  }
  const record = evidence.tdd.find((t) => t.criterion === criterionId);
  if (tddDone(record, kind))
    return kind === "behavior" ? "red then green" : "passing before and after";
  if (record?.red || record?.before)
    return kind === "behavior" ? "red only" : "before only";
  return "missing";
}
function renderReport(work, evidence) {
  const lines = [];
  lines.push(`# Report: ${work.title}`, "");
  lines.push(`- Work: \`${work.id}\``);
  lines.push(`- Type: ${work.type}. Route: ${work.route} (${work.routeReasons.join("; ")})`);
  lines.push(`- Verdict: **${evidence.verdict === "proven" ? "Proven" : "Not proven"}**`, "");
  if (evidence.unproven.length) {
    lines.push("## Not proven", "");
    for (const reason of evidence.unproven)
      lines.push(`- ${reason}`);
    lines.push("");
  }
  lines.push("## Acceptance criteria", "", "| Id | Kind | Criterion | Test-first |", "| :- | :- | :- | :- |");
  for (const c of work.criteria) {
    lines.push(`| ${c.id} | ${c.kind} | ${c.text.replace(/\|/g, "\\|")} | ${tddSummary(work, evidence, c.id, c.kind)} |`);
  }
  lines.push("", "## Gates", "", "| Gate | Target | Status | Command | Duration | Log |", "| :- | :- | :- | :- | -: | :- |");
  for (const r of evidence.runs) {
    const status = r.status === "skipped" || r.status === "unavailable" ? `${r.status}${r.reason ? `: ${r.reason}` : ""}` : r.status;
    lines.push(`| ${r.gate} | ${r.target} | ${status} | ${r.command ? `\`${r.command}\`` : ""} | ${r.durationMs} ms | ${r.log ?? ""} |`);
  }
  if (work.skips.length) {
    lines.push("", "## Skipped by the user", "");
    for (const s of work.skips)
      lines.push(`- \`${s.step}\`: ${s.reason} (${s.at})`);
  }
  lines.push("", `Fingerprint: ${evidence.fingerprint ?? "none"}`, "");
  return lines.join(`
`);
}

// packages/engine/src/gates.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { basename, join as join13 } from "node:path";

// packages/engine/src/fingerprint.ts
import { execFileSync } from "node:child_process";
import { readdirSync as readdirSync3, readFileSync as readFileSync2, statSync as statSync2 } from "node:fs";
import { join as join11 } from "node:path";
var SKIP_DIRS2 = new Set([
  ".git",
  ".crew",
  "node_modules",
  "vendor",
  ".venv",
  "venv",
  "__pycache__"
]);
function isGitRepo(root) {
  return exists(join11(root, ".git"));
}
function gitOut(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer: 64 * 1024 * 1024
  });
}
function gitHead(root) {
  try {
    return gitOut(root, ["rev-parse", "HEAD"]).trim();
  } catch {
    return "none";
  }
}
function gitChangedPaths(root) {
  let out;
  try {
    out = gitOut(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  } catch {
    return [];
  }
  const entries = out.split("\x00");
  const paths = new Set;
  for (let i = 0;i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || entry.length < 4)
      continue;
    paths.add(entry.slice(3));
    if (entry[0] === "R" || entry[0] === "C") {
      const original = entries[++i];
      if (original)
        paths.add(original);
    }
  }
  return [...paths].sort();
}
function isWatched(path, profile) {
  return !matchesAny(path, profile.watch.exclude);
}
function allWatchedFiles(root, profile) {
  const files = [];
  const walk = (dir, rel2) => {
    let names;
    try {
      names = readdirSync3(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (SKIP_DIRS2.has(name))
        continue;
      const abs = join11(dir, name);
      const path = rel2 ? `${rel2}/${name}` : name;
      let isDir = false;
      try {
        isDir = statSync2(abs).isDirectory();
      } catch {
        continue;
      }
      if (isDir)
        walk(abs, path);
      else if (isWatched(path, profile))
        files.push(path);
    }
  };
  walk(root, "");
  return files.sort();
}
function changedWatchedPaths(root, profile) {
  if (!isGitRepo(root))
    return allWatchedFiles(root, profile);
  return gitChangedPaths(root).filter((path) => isWatched(path, profile));
}
function hashFile(abs) {
  try {
    return sha256(readFileSync2(abs));
  } catch {
    return "DELETED";
  }
}
function computeFingerprint(root, profile) {
  const parts = [];
  if (isGitRepo(root)) {
    parts.push(`head:${gitHead(root)}`);
    for (const path of changedWatchedPaths(root, profile)) {
      parts.push(`${path}:${hashFile(join11(root, path))}`);
    }
  } else {
    for (const path of allWatchedFiles(root, profile)) {
      parts.push(`${path}:${hashFile(join11(root, path))}`);
    }
  }
  return `sha256:${sha256(parts.join(`
`))}`;
}

// packages/engine/src/run.ts
import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync as mkdirSync2 } from "node:fs";
import { dirname as dirname3 } from "node:path";
var TAIL_LINES = 40;
function killTree(pid) {
  if (!pid)
    return;
  try {
    if (process.platform === "win32")
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"]);
    else
      process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {}
  }
}
function runCommand(command, options) {
  mkdirSync2(dirname3(options.logPath), { recursive: true });
  const log = createWriteStream(options.logPath);
  const lines = [];
  let partial = "";
  const absorb = (chunk) => {
    log.write(chunk);
    partial += chunk.toString("utf8");
    const pieces = partial.split(`
`);
    partial = pieces.pop() ?? "";
    for (const line of pieces) {
      lines.push(line);
      if (lines.length > TAIL_LINES)
        lines.shift();
    }
  };
  const started = Date.now();
  return new Promise((resolve2) => {
    const child = spawn(command, {
      cwd: options.cwd,
      shell: true,
      detached: process.platform !== "win32",
      env: options.env ?? process.env,
      stdio: [options.stdin === undefined ? "ignore" : "pipe", "pipe", "pipe"]
    });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, options.timeoutMs);
    child.stdout?.on("data", absorb);
    child.stderr?.on("data", absorb);
    if (options.stdin !== undefined)
      child.stdin?.end(options.stdin);
    const finish = (exit) => {
      clearTimeout(timer);
      if (partial)
        lines.push(partial);
      log.end();
      resolve2({
        exit,
        durationMs: Date.now() - started,
        tail: lines.slice(-TAIL_LINES).join(`
`),
        timedOut
      });
    };
    child.on("error", (error) => {
      absorb(Buffer.from(`${error.message}
`));
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

// packages/engine/src/secrets.ts
import { execFileSync as execFileSync2, spawnSync } from "node:child_process";
import { readFileSync as readFileSync3 } from "node:fs";
import { join as join12 } from "node:path";
var RULES = [
  {
    rule: "private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----/
  },
  { rule: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16,}\b/ },
  {
    rule: "GitHub token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b/
  },
  { rule: "Stripe key", pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/ },
  { rule: "Slack token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { rule: "Anthropic key", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
  { rule: "OpenAI key", pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { rule: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  {
    rule: "generic secret assignment",
    pattern: /(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*['"][A-Za-z0-9_\-/+=]{16,}['"]/i,
    generic: true
  }
];
var PLACEHOLDER = /example|placeholder|your[_-]|xxx|changeme|dummy|<[^>]+>/i;
var MAX_BYTES = 1024 * 1024;
function scanText(text, source) {
  const findings = [];
  text.split(`
`).forEach((line, index) => {
    for (const { rule, pattern, generic } of RULES) {
      if (generic && PLACEHOLDER.test(line))
        continue;
      if (pattern.test(line)) {
        findings.push({ source, line: index + 1, rule });
        break;
      }
    }
  });
  return findings;
}
function isBinary(buffer) {
  return buffer.subarray(0, 8000).includes(0);
}
function fileSource(root, path) {
  let buffer;
  try {
    buffer = readFileSync3(join12(root, path));
  } catch {
    return null;
  }
  if (buffer.length > MAX_BYTES || isBinary(buffer))
    return null;
  return { source: path, text: buffer.toString("utf8") };
}
function untrackedPaths(root) {
  try {
    return execFileSync2("git", ["ls-files", "--others", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).split("\x00").filter(Boolean).sort();
  } catch {
    return [];
  }
}
function changedText(root, profile) {
  const sources = [];
  if (!isGitRepo(root)) {
    for (const path of allWatchedFiles(root, profile)) {
      const source = fileSource(root, path);
      if (source)
        sources.push(source);
    }
    return sources;
  }
  let diff = "";
  try {
    diff = execFileSync2("git", ["diff", "HEAD", "--unified=0", "--no-color", "--", "."], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024
    });
  } catch {
    diff = "";
  }
  const added = diff.split(`
`).filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1)).join(`
`);
  if (added)
    sources.push({ source: "git diff HEAD (added lines)", text: added });
  for (const path of untrackedPaths(root)) {
    if (!isWatched(path, profile))
      continue;
    const source = fileSource(root, path);
    if (source)
      sources.push(source);
  }
  return sources;
}
function gitleaks(text) {
  const result = spawnSync("gitleaks", ["stdin", "--no-banner", "--redact", "--exit-code", "1"], {
    input: text,
    encoding: "utf8"
  });
  if (result.error || result.status === null || result.status !== 0 && result.status !== 1)
    return { ran: false, leaked: false, tail: "" };
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.status === 1 && !/leak/i.test(output))
    return { ran: false, leaked: false, tail: "" };
  return {
    ran: true,
    leaked: result.status === 1,
    tail: output.trim().split(`
`).slice(-20).join(`
`)
  };
}
async function scanSecrets(root, profile) {
  const sources = changedText(root, profile);
  const findings = sources.flatMap((s) => scanText(s.text, s.source));
  const lines = findings.map((f) => `${f.source}:${f.line}: ${f.rule}`);
  const extra = gitleaks(sources.map((s) => s.text).join(`
`));
  if (extra.ran && extra.leaked)
    lines.push("gitleaks:", extra.tail);
  const status = findings.length === 0 && !(extra.ran && extra.leaked) ? "pass" : "fail";
  return {
    status,
    findings,
    tail: lines.join(`
`) || "no secrets found in the change",
    usedGitleaks: extra.ran
  };
}

// packages/engine/src/gates.ts
var MANIFESTS = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "composer.json",
  "composer.lock",
  "pyproject.toml",
  "uv.lock",
  "poetry.lock",
  "requirements.txt"
]);
function manifestChanged(changed) {
  return changed.some((p) => MANIFESTS.has(basename(p)) || /^requirements.*\.txt$/.test(basename(p)));
}
function onPath(binary) {
  const result = spawnSync2(process.platform === "win32" ? "where" : "which", [binary], {
    stdio: "ignore"
  });
  return result.status === 0;
}
var NODE_AUDIT = {
  npm: "npm audit --audit-level=high",
  pnpm: "pnpm audit --audit-level=high",
  yarn: "yarn audit --level high",
  bun: "bun audit"
};
function depsAuditCommand(target) {
  if (target.stack === "node")
    return NODE_AUDIT[target.packageManager] ?? null;
  if (target.stack === "php")
    return "composer audit";
  if (target.stack === "python")
    return onPath("pip-audit") ? "pip-audit" : null;
  return null;
}
function gatesForTarget(route, target, policy, changed) {
  const has = (gate) => !!target.gates[gate];
  const gates = [];
  if (has("build"))
    gates.push("build");
  gates.push("test");
  if (has("lint"))
    gates.push("lint");
  if (has("typecheck"))
    gates.push("typecheck");
  if (route === "fast" ? manifestChanged(changed) : true)
    gates.push("deps");
  for (const gate of policy.requiredGates)
    if (gate !== "secrets" && !gates.includes(gate))
      gates.push(gate);
  return gates;
}
function plannedGates(route, profile, policy, changed) {
  const planned = [{ gate: "secrets", target: "." }];
  const touched = profile.targets.filter((t) => t.path === "." || changed.length === 0 || changed.some((p) => p === t.path || p.startsWith(`${t.path}/`)));
  for (const target of touched) {
    for (const gate of gatesForTarget(route, target, policy, changed)) {
      if (gate === "deps" && route === "standard" && !depsAuditCommand(target))
        continue;
      planned.push({ gate, target: target.path });
    }
  }
  return planned;
}
async function runOne(paths, work, profile, gate, targetPath) {
  const at = nowIso();
  const base = {
    gate,
    target: targetPath,
    command: null,
    commandSource: null,
    confirmed: true,
    exit: null,
    status: "unavailable",
    durationMs: 0,
    at,
    log: null,
    tail: ""
  };
  if (gate === "secrets") {
    const started = Date.now();
    const scan = await scanSecrets(paths.root, profile);
    return {
      ...base,
      command: scan.usedGitleaks ? "built-in secret scan + gitleaks" : "built-in secret scan",
      exit: scan.status === "pass" ? 0 : 1,
      status: scan.status,
      durationMs: Date.now() - started,
      tail: scan.tail
    };
  }
  const target = profile.targets.find((t) => t.path === targetPath);
  if (!target)
    return { ...base, reason: "target not in profile" };
  let command;
  let source = "detected";
  if (gate === "deps") {
    command = depsAuditCommand(target);
    if (!command)
      return { ...base, reason: `no audit tool for ${target.packageManager}` };
  } else {
    const configured = target.gates[gate];
    if (!configured)
      return { ...base, reason: "no command" };
    command = configured.command;
    source = configured.source;
  }
  const log = `logs/${gate}-${targetPath.replace(/[^a-z0-9]+/gi, "_")}-${Date.now()}.txt`;
  const result = await runCommand(command, {
    cwd: join13(paths.root, targetPath),
    timeoutMs: target.timeoutMs,
    logPath: join13(workDir(paths, work.id), log)
  });
  const passed = result.exit === 0 && !result.timedOut;
  return {
    ...base,
    command,
    commandSource: source,
    confirmed: source !== "proposed",
    exit: result.exit,
    status: passed ? "pass" : "fail",
    durationMs: result.durationMs,
    log,
    tail: result.tail,
    ...result.timedOut ? { reason: "timed out" } : {}
  };
}
async function runGates(paths, work, profile, policy, options = {}) {
  const changed = changedWatchedPaths(paths.root, profile);
  const pathRisk = riskAreasForPaths(changed, policy);
  let raised = null;
  if (pathRisk.length) {
    for (const area of pathRisk)
      if (!work.riskAreas.includes(area))
        work.riskAreas.push(area);
    if (raiseRoute(work, "full", `the change touches ${pathRisk.join(", ")} paths`))
      raised = "full";
  }
  const planned = plannedGates(work.route, profile, policy, changed);
  const { evidence } = loadEvidence(paths, work.id);
  const fingerprintBefore = computeFingerprint(paths.root, profile);
  for (const { gate, target } of planned) {
    if (options.only && !options.only.includes(gate))
      continue;
    evidence.runs = evidence.runs.filter((r) => !(r.gate === gate && r.target === target));
    if (isSkipped(work, `gate:${gate}`)) {
      const skip = work.skips.find((s) => s.step === `gate:${gate}`);
      evidence.runs.push({
        gate,
        target,
        command: null,
        commandSource: null,
        confirmed: true,
        exit: null,
        status: "skipped",
        durationMs: 0,
        at: nowIso(),
        log: null,
        tail: "",
        reason: skip?.reason
      });
      continue;
    }
    evidence.runs.push(await runOne(paths, work, profile, gate, target));
  }
  evidence.fingerprint = fingerprintBefore;
  const verdict = computeVerdict({
    work,
    evidence,
    expected: planned,
    currentFingerprint: computeFingerprint(paths.root, profile),
    tampered: false
  });
  evidence.verdict = verdict.verdict;
  evidence.unproven = verdict.unproven;
  saveEvidence(paths, work.id, evidence);
  return { evidence, ...verdict, planned, changed, raised };
}
function assess(paths, work, profile, policy, tampered = false) {
  const changed = changedWatchedPaths(paths.root, profile);
  const expected = plannedGates(work.route, profile, policy, changed);
  const read = loadEvidence(paths, work.id);
  const verdict = computeVerdict({
    work,
    evidence: read.evidence,
    expected,
    currentFingerprint: computeFingerprint(paths.root, profile),
    tampered: tampered || read.tampered
  });
  return { evidence: read.evidence, ...verdict, expected, changed };
}

// packages/engine/src/policy.ts
import { join as join14 } from "node:path";
var DEFAULT_POLICY = {
  requiredGates: [],
  riskPaths: {},
  minimumRoute: "fast",
  allowSkips: ["*"],
  artifacts: "commit"
};
var RISK_AREAS = [
  "auth",
  "payments",
  "personal-data",
  "data-migration",
  "infra",
  "public-api",
  "secrets"
];
function strings(value) {
  return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}
function loadPolicy(paths) {
  const read = readProtectedJson(paths, join14(paths.crewDir, "policy.json"));
  const raw = read.data ?? {};
  const riskPaths = {};
  const rawRisk = raw.riskPaths ?? {};
  for (const area of RISK_AREAS) {
    const patterns = strings(rawRisk[area]);
    if (patterns.length)
      riskPaths[area] = patterns;
  }
  const minimumRoute = ROUTE_ORDER.includes(raw.minimumRoute) ? raw.minimumRoute : DEFAULT_POLICY.minimumRoute;
  const allowSkips = Array.isArray(raw.allowSkips) ? strings(raw.allowSkips) : DEFAULT_POLICY.allowSkips;
  return {
    policy: {
      requiredGates: strings(raw.requiredGates).filter((g) => GATE_NAMES.includes(g)),
      riskPaths,
      minimumRoute,
      allowSkips,
      artifacts: raw.artifacts === "local" ? "local" : "commit"
    },
    tampered: read.tampered
  };
}
function skipAllowed(policy, step) {
  const bare = step.replace(/^(gate|tdd):/, "");
  return policy.allowSkips.some((s) => s === "*" || s === step || s === bare);
}

// packages/engine/src/profile.ts
import { join as join15 } from "node:path";
function profilePath(paths) {
  return join15(paths.crewDir, "profile.json");
}
function loadProfile(paths) {
  const read = readProtectedJson(paths, profilePath(paths));
  return { profile: read.data, tampered: read.tampered };
}
function saveProfile(paths, profile) {
  writeProtectedJson(paths, profilePath(paths), profile);
}
function ensureProfile(paths) {
  const existing = loadProfile(paths);
  if (existing.profile)
    return { profile: existing.profile, tampered: existing.tampered };
  const profile = detectProfile(paths.root);
  saveProfile(paths, profile);
  return { profile, tampered: false };
}

// packages/engine/src/hooks/context.ts
function buildContext(payload, env = process.env) {
  const paths = resolvePaths(payload.cwd ?? process.cwd(), env);
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  return {
    paths,
    sessionId: payload.session_id ?? "default",
    profile: profile.profile,
    policy: policy.policy,
    tampered: profile.tampered || policy.tampered
  };
}

// packages/engine/src/hooks/pre-tool-use.ts
import { isAbsolute, join as join16, relative as relative4, resolve as resolve2 } from "node:path";
var WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
var USER_ONLY = /\bcrew\s+(?:skip|approve|profile\s+confirm|policy\s+accept)\b/;
var ENGINE_FILES = /\.crew\/(?:profile\.json|policy\.json|\.gitignore|local\b|work\/[^\s/]+\/(?:work\.json|evidence\.json|report\.md|logs\b))|\.shibaox\/crew\b/;
var WRITE_SHAPE = /(?:^|[\s;&|(])(?:rm|mv|cp|tee|truncate|chmod|touch|dd|install)\b|sed\s+-i|>{1,2}\s*\S/;
function answer(permissionDecision, reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision,
      permissionDecisionReason: reason
    }
  };
}
function pathFromInput(input) {
  for (const key of ["file_path", "notebook_path", "path"]) {
    const value = input[key];
    if (typeof value === "string" && value)
      return value;
  }
  return null;
}
function onPreToolUse(ctx, payload) {
  const tool = payload.tool_name ?? "";
  const input = payload.tool_input ?? {};
  if (WRITE_TOOLS.has(tool)) {
    const filePath = pathFromInput(input);
    if (!filePath)
      return {};
    const abs = resolve2(isAbsolute(filePath) ? filePath : join16(ctx.paths.root, filePath));
    if (isProtectedPath(ctx.paths, abs)) {
      return answer("deny", `Crew: ${filePath} is maintained by the engine and is changed through the crew command`);
    }
    const rel2 = relative4(ctx.paths.root, abs).replace(/\\/g, "/");
    if (rel2 === "" || rel2.startsWith("..") || !isWatched(rel2, ctx.profile))
      return {};
    const active = activeWork(ctx.paths);
    const work = active?.work;
    if (work && work.route !== "fast" && isBeforeBuild(work)) {
      return answer("deny", `Crew: work ${work.id} is in phase ${work.phase} on the ${work.route} route; source files change in the build phase (crew phase ${work.id} next)`);
    }
    return {};
  }
  if (tool === "Bash") {
    const command = typeof input.command === "string" ? input.command : "";
    if (USER_ONLY.test(command)) {
      return answer("ask", "Crew: this command records a decision that only the user can take");
    }
    if (ENGINE_FILES.test(command) && WRITE_SHAPE.test(command)) {
      return answer("deny", "Crew: files under .crew/ and ~/.shibaox/crew that the engine owns are written only by the crew command");
    }
  }
  return {};
}

// packages/engine/src/hooks/prompt.ts
function statusLine(ctx, work, tampered = false) {
  const result = assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || tampered);
  const state = result.verdict === "proven" ? "proven" : `not proven (${result.unproven[0] ?? "gates have not run"})`;
  const waiting = work.awaiting === "user" ? ", waiting for the user" : "";
  return `Crew: work ${work.id} "${work.title}", phase ${work.phase}, route ${work.route}, ${state}${waiting}.`;
}
function onPrompt(ctx) {
  const active = activeWork(ctx.paths);
  if (!active?.work)
    return {};
  return {
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: statusLine(ctx, active.work, active.tampered)
    }
  };
}

// packages/engine/src/hooks/session-start.ts
function onSessionStart(ctx) {
  ensureCrewDir(ctx.paths, ctx.policy);
  const state = loadState(ctx.paths);
  const session = sessionState(state, ctx.sessionId);
  session.baseline = computeFingerprint(ctx.paths.root, ctx.profile);
  session.stopBlocks = 0;
  saveState(ctx.paths, state);
  const lines = [
    "Shibaox Developer Crew is active in this repository. Work is proven by the `crew` command and the crew skill, and a turn cannot end while watched source files have unproven changes."
  ];
  const active = activeWork(ctx.paths);
  if (active?.work)
    lines.push(statusLine(ctx, active.work, active.tampered).replace(/^Crew: work/, "Work in progress:"));
  else
    lines.push('No work item is active. A code change starts with `crew start "<request>"`.');
  const missing = missingTestCommands(ctx.profile);
  if (missing.length) {
    lines.push(`No test command is known for: ${missing.map((m) => m.target).join(", ")}. One is proposed with \`crew profile set test "<cmd>"\`.`);
  }
  return {
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: lines.join(" ") }
  };
}

// packages/engine/src/hooks/stop.ts
var MAX_STOP_BLOCKS = 3;
function onStop(ctx) {
  const state = loadState(ctx.paths);
  const session = sessionState(state, ctx.sessionId);
  const current = computeFingerprint(ctx.paths.root, ctx.profile);
  const active = activeWork(ctx.paths);
  const work = active?.work ?? null;
  const result = work ? assess(ctx.paths, work, ctx.profile, ctx.policy, ctx.tampered || !!active?.tampered) : null;
  const proven = result?.verdict === "proven";
  const changed = session.baseline !== null ? current !== session.baseline : work !== null && !proven;
  const done = (response) => {
    saveState(ctx.paths, state);
    return response;
  };
  if (!changed || proven) {
    session.stopBlocks = 0;
    return done({});
  }
  const missing = result ? result.unproven : ['no work item: start one with crew start "<request>"'];
  if (work?.awaiting === "user") {
    session.stopBlocks = 0;
    return done({
      systemMessage: `Crew: work ${work.id} is waiting for the user and is not proven (${missing[0]}).`
    });
  }
  if (session.stopBlocks >= MAX_STOP_BLOCKS) {
    return done({
      systemMessage: `Crew: not proven after ${MAX_STOP_BLOCKS} attempts. ${missing.join("; ")}.`
    });
  }
  session.stopBlocks += 1;
  const gate = work ? `crew gate run ${work.id}` : 'crew start "<request>"';
  return done({
    decision: "block",
    reason: `Crew: watched source files changed and the work is not proven. Missing: ${missing.join("; ")}. Run ${gate}, fix what fails, or ask the user to skip a step with crew skip.`
  });
}

// packages/engine/src/hooks/index.ts
function handleHook(event, payload, env = process.env) {
  try {
    const ctx = buildContext(payload, env);
    switch (event) {
      case "session-start":
        return onSessionStart(ctx);
      case "prompt":
        return onPrompt(ctx);
      case "pre-tool-use":
        return onPreToolUse(ctx, payload);
      case "stop":
        return onStop(ctx);
      default:
        return {};
    }
  } catch {
    return {};
  }
}

// packages/engine/src/tdd.ts
import { join as join17 } from "node:path";
var TEST_PATTERNS = ["**/*test*", "**/*spec*", "tests/**", "test/**", "**/__tests__/**"];
function defaultTestCommand(profile) {
  const target = profile.targets.find((t) => t.path === "." && t.gates.test) ?? profile.targets.find((t) => t.gates.test);
  return target?.gates.test ? { command: target.gates.test.command, timeoutMs: target.timeoutMs } : null;
}
async function recordTdd(paths, work, evidence, profile, criterionId, step, override) {
  const criterion = work.criteria.find((c) => c.id === criterionId);
  if (!criterion)
    return { ok: false, message: `unknown criterion ${criterionId}` };
  const behaviourStep = step === "red" || step === "green";
  if (behaviourStep !== (criterion.kind === "behavior")) {
    return {
      ok: false,
      message: criterion.kind === "behavior" ? `${criterionId} is a behavior criterion: record red, then green` : `${criterionId} is a preserve criterion: record before, then after`
    };
  }
  const fallback = defaultTestCommand(profile);
  const command = override ?? fallback?.command;
  if (!command) {
    return {
      ok: false,
      message: 'no test command: set one with crew profile set test "<cmd>" or pass -- <cmd>'
    };
  }
  let entry = evidence.tdd.find((t) => t.criterion === criterionId);
  if (!entry) {
    entry = { criterion: criterionId };
    evidence.tdd.push(entry);
  }
  if (step === "green" && !entry.red)
    return { ok: false, message: `no red run recorded for ${criterionId}: run crew tdd red first` };
  if (step === "after" && !entry.before)
    return {
      ok: false,
      message: `no before run recorded for ${criterionId}: run crew tdd before first`
    };
  const log = `logs/tdd-${criterionId}-${step}-${Date.now()}.txt`;
  const result = await runCommand(command, {
    cwd: paths.root,
    timeoutMs: fallback?.timeoutMs ?? 10 * 60 * 1000,
    logPath: join17(workDir(paths, work.id), log)
  });
  const record = {
    command,
    exit: result.exit,
    at: nowIso(),
    durationMs: result.durationMs,
    log,
    tail: result.tail,
    timedOut: result.timedOut
  };
  const passed = result.exit === 0 && !result.timedOut;
  if (step === "red") {
    if (passed) {
      return {
        ok: false,
        message: "the test passed before the change; a test that passes before the code exists proves nothing",
        record
      };
    }
    record.changedTests = changedWatchedPaths(paths.root, profile).filter((p) => matchesAny(p, TEST_PATTERNS));
    entry.red = record;
    return { ok: true, message: `red recorded for ${criterionId} (exit ${result.exit})`, record };
  }
  if (!passed) {
    return {
      ok: false,
      message: `${step} run failed (exit ${result.exit}${result.timedOut ? ", timed out" : ""}); nothing recorded`,
      record
    };
  }
  entry[step] = record;
  return { ok: true, message: `${step} recorded for ${criterionId}`, record };
}

// packages/engine/src/version.ts
var VERSION = "0.1.0";

// packages/engine/src/cli.ts
function parse(argv) {
  const parsed = { positional: [], flags: {}, rest: [] };
  for (let i = 0;i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (arg === "--") {
      parsed.rest = argv.slice(i + 1);
      break;
    }
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--") && key !== "json" && key !== "refresh") {
        parsed.flags[key] = next;
        i++;
      } else
        parsed.flags[key] = true;
    } else
      parsed.positional.push(arg);
  }
  return parsed;
}
var ok = (text, data = {}) => ({ code: 0, text, data });
var refuse = (text, data = {}) => ({
  code: 1,
  text,
  data
});
function load(io) {
  const paths = resolvePaths(io.cwd, io.env);
  const profile = ensureProfile(paths);
  const policy = loadPolicy(paths);
  ensureCrewDir(paths, policy.policy);
  return {
    paths,
    profile: profile.profile,
    policy: policy.policy,
    config: loadConfig(paths),
    tampered: profile.tampered || policy.tampered
  };
}
function openWork(env, id) {
  if (!id)
    return refuse("a work item id is required");
  const read = loadWork(env.paths, id);
  if (!read.work)
    return refuse(`unknown work item: ${id}`);
  return { work: read.work, tampered: read.tampered };
}
function isOutcome(value) {
  return typeof value === "object" && value !== null && "code" in value && "text" in value;
}
function guardContext(env, work, tampered) {
  const dir = workDir(env.paths, work.id);
  const result = assess(env.paths, work, env.profile, env.policy, env.tampered || tampered);
  return {
    specText: readText(join18(dir, "spec.md")),
    planExists: existsSync3(join18(dir, "plan.md")),
    evidence: result.evidence,
    proven: result.verdict === "proven",
    unproven: result.unproven
  };
}
function logDecision(env, work, answers) {
  if (!env.config.decisions.log)
    return;
  const line = JSON.stringify({
    at: nowIso(),
    work: work.id,
    input: work.input.slice(0, 500),
    answers,
    route: work.route,
    reasons: work.routeReasons
  });
  const file = join18(env.paths.localDir, "decisions.jsonl");
  writeText(file, `${readText(file) ?? ""}${line}
`);
}
function parseAnswers(raw) {
  try {
    return validateAnswers(JSON.parse(raw));
  } catch (error) {
    if (error instanceof AnswerError)
      return refuse(`invalid answers: ${error.message}`);
    return refuse("answers must be valid JSON");
  }
}
function classify(env, work, answers) {
  const decision = computeRoute(answers, [], env.policy);
  applyClassification(work, answers.work_type, decision);
  logDecision(env, work, answers);
}
function gateSummary(work, verdict, unproven, runs) {
  const lines = runs.map((r) => `  ${r.gate} (${r.target}): ${r.status} in ${(r.durationMs / 1000).toFixed(1)}s`);
  lines.push(verdict === "proven" ? `Proven: ${work.id}` : `Not proven: ${unproven.join("; ")}`);
  return lines.join(`
`);
}
async function dispatch(parsed, io) {
  const [command, ...args] = parsed.positional;
  if (parsed.flags.version || command === "version")
    return ok(VERSION, { version: VERSION });
  if (command === "hook") {
    const event = args[0] ?? "";
    let payload = {};
    try {
      const raw = await io.stdin();
      payload = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }
    if (typeof payload.cwd !== "string")
      payload.cwd = io.cwd;
    return ok(JSON.stringify(handleHook(event, payload, io.env)), {
      hookEvent: event
    });
  }
  if (!command || command === "help")
    return ok(HELP);
  const env = load(io);
  switch (command) {
    case "detect": {
      const previous = parsed.flags.refresh ? loadProfile(env.paths).profile : null;
      const profile = parsed.flags.refresh ? detectProfile(env.paths.root, previous) : env.profile;
      if (parsed.flags.refresh) {
        saveProfile(env.paths, profile);
        if (integrityOf(env.paths)[".crew/policy.json"] === undefined) {
          recordIntegrity(env.paths, join18(env.paths.crewDir, "policy.json"));
        }
      }
      const missing = missingTestCommands(profile);
      const lines = profile.targets.map((t) => `  ${t.path} (${t.stack}, ${t.packageManager}): ${Object.entries(t.gates).map(([g, c]) => `${g}=${c.command}${c.source === "proposed" ? " [proposed]" : ""}`).join(", ") || "no commands"}`);
      if (missing.length)
        lines.push(`No test command for: ${missing.map((m) => m.target).join(", ")}. Propose one: crew profile set test "<cmd>" [--target <path>]`);
      return ok(lines.join(`
`), { profile, missing });
    }
    case "profile": {
      const [sub, gate, cmd] = args;
      if (sub === "set") {
        if (!GATE_NAMES.includes(gate) || gate === "secrets" || !cmd)
          return refuse('usage: crew profile set <build|test|lint|typecheck|deps> "<cmd>" [--target <path>]');
        const targetPath = typeof parsed.flags.target === "string" ? parsed.flags.target : ".";
        let target = env.profile.targets.find((t) => t.path === targetPath);
        if (!target) {
          target = {
            path: targetPath,
            stack: "other",
            packageManager: "unknown",
            gates: {},
            timeoutMs: 10 * 60 * 1000
          };
          env.profile.targets.push(target);
        }
        target.gates[gate] = { command: cmd, source: "proposed" };
        saveProfile(env.paths, env.profile);
        return ok(`proposed ${gate} for ${targetPath}: ${cmd} (unconfirmed until crew profile confirm)`, { target: targetPath, gate, command: cmd });
      }
      if (sub === "confirm") {
        let count = 0;
        for (const target of env.profile.targets)
          for (const command2 of Object.values(target.gates))
            if (command2.source === "proposed") {
              command2.source = "confirmed";
              count++;
            }
        saveProfile(env.paths, env.profile);
        return ok(`confirmed ${count} command(s)`, { confirmed: count });
      }
      return refuse("usage: crew profile set|confirm");
    }
    case "policy": {
      if (args[0] !== "accept")
        return refuse("usage: crew policy accept");
      const file = join18(env.paths.crewDir, "policy.json");
      if (readText(file) === null)
        return refuse("no .crew/policy.json to accept");
      recordIntegrity(env.paths, file);
      return ok("policy accepted: its current content is now the trusted version", {
        accepted: true
      });
    }
    case "start": {
      const input = args.join(" ").trim();
      if (!input)
        return refuse('usage: crew start "<request>" [--answers <json>]');
      const answers = typeof parsed.flags.answers === "string" ? parseAnswers(parsed.flags.answers) : null;
      if (isOutcome(answers))
        return answers;
      const work = createWork(env.paths, input);
      if (answers)
        classify(env, work, answers);
      saveWork(env.paths, work);
      return ok(`started ${work.id} (route ${work.route}: ${work.routeReasons.join("; ")})`, {
        id: work.id,
        route: work.route,
        phase: work.phase,
        routeReasons: work.routeReasons
      });
    }
    case "classify": {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened))
        return opened;
      if (typeof parsed.flags.answers !== "string")
        return refuse("usage: crew classify <id> --answers <json>");
      const answers = parseAnswers(parsed.flags.answers);
      if (isOutcome(answers))
        return answers;
      classify(env, opened.work, answers);
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: route ${opened.work.route} (${opened.work.routeReasons.join("; ")})`, { id: opened.work.id, route: opened.work.route, riskAreas: opened.work.riskAreas });
    }
    case "criteria": {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const text = args.slice(2).join(" ").trim();
      if (args[1] !== "add" || !text)
        return refuse('usage: crew criteria <id> add "<criterion>" [--kind preserve]');
      const kind = parsed.flags.kind === "preserve" ? "preserve" : "behavior";
      const criterion = addCriterion(opened.work, text, kind);
      saveWork(env.paths, opened.work);
      return ok(`${criterion.id} (${kind}): ${criterion.text}`, { criterion });
    }
    case "approve": {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened))
        return opened;
      if (args[1] !== "spec")
        return refuse("usage: crew approve <id> spec");
      approve(opened.work, "spec");
      saveWork(env.paths, opened.work);
      return ok(`spec approved for ${opened.work.id}`, { approvals: opened.work.approvals });
    }
    case "phase": {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened))
        return opened;
      if (args[1] !== "next")
        return refuse("usage: crew phase <id> next");
      const result = advancePhase(opened.work, guardContext(env, opened.work, opened.tampered));
      if (!result.ok)
        return refuse(`cannot enter the next phase; missing:
  ${result.missing.join(`
  `)}`, {
          missing: result.missing,
          phase: opened.work.phase
        });
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: phase ${result.phase}`, { phase: result.phase });
    }
    case "await":
    case "resume": {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened))
        return opened;
      opened.work.awaiting = command === "await" ? "user" : null;
      saveWork(env.paths, opened.work);
      return ok(`${opened.work.id}: ${command === "await" ? "waiting for the user" : "resumed"}`, {
        awaiting: opened.work.awaiting
      });
    }
    case "tdd": {
      const [step, id, criterion] = args;
      const opened = openWork(env, id);
      if (isOutcome(opened))
        return opened;
      if (!["red", "green", "before", "after"].includes(step ?? "") || !criterion)
        return refuse("usage: crew tdd <red|green|before|after> <id> <criterion> [-- <cmd>]");
      const { evidence } = loadEvidence(env.paths, opened.work.id);
      const override = parsed.rest.length ? parsed.rest.join(" ") : undefined;
      const outcome = await recordTdd(env.paths, opened.work, evidence, env.profile, criterion, step, override);
      if (outcome.ok)
        saveEvidence(env.paths, opened.work.id, evidence);
      const tail = outcome.record?.tail ? `
${outcome.record.tail}` : "";
      return outcome.ok ? ok(outcome.message, { record: outcome.record }) : refuse(`${outcome.message}${tail}`, { record: outcome.record });
    }
    case "gate": {
      const opened = openWork(env, args[1]);
      if (isOutcome(opened))
        return opened;
      if (args[0] !== "run")
        return refuse("usage: crew gate run <id> [--only a,b]");
      const only = typeof parsed.flags.only === "string" ? parsed.flags.only.split(",") : undefined;
      const outcome = await runGates(env.paths, opened.work, env.profile, env.policy, { only });
      saveWork(env.paths, opened.work);
      const raised = outcome.raised ? `Route raised to ${outcome.raised}: ${opened.work.routeReasons.at(-1)}
` : "";
      return ok(raised + gateSummary(opened.work, outcome.verdict, outcome.unproven, outcome.evidence.runs), {
        verdict: outcome.verdict,
        unproven: outcome.unproven,
        runs: outcome.evidence.runs,
        raised: outcome.raised,
        route: opened.work.route
      });
    }
    case "skip": {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const step = args[1];
      const reason = typeof parsed.flags.reason === "string" ? parsed.flags.reason.trim() : "";
      if (!step || !reason)
        return refuse('usage: crew skip <id> <step> --reason "<text>"');
      if (!skipAllowed(env.policy, step))
        return refuse(`the team policy does not allow skipping ${step}`);
      if (env.config.mode === "pilot" && (step === "gate:secrets" || step === "gate:deps"))
        return refuse(`in pilot mode the ${step.slice(5)} gate cannot be skipped`);
      addSkip(opened.work, step, reason);
      saveWork(env.paths, opened.work);
      return ok(`skipped ${step} on ${opened.work.id}: ${reason}`, { skips: opened.work.skips });
    }
    case "evidence": {
      const opened = openWork(env, args[0]);
      if (isOutcome(opened))
        return opened;
      const result = assess(env.paths, opened.work, env.profile, env.policy, env.tampered || opened.tampered);
      result.evidence.verdict = result.verdict;
      result.evidence.unproven = result.unproven;
      saveEvidence(env.paths, opened.work.id, result.evidence);
      const report = renderReport(opened.work, result.evidence);
      writeProtectedText(env.paths, join18(workDir(env.paths, opened.work.id), "report.md"), report);
      return ok(report, { verdict: result.verdict, unproven: result.unproven });
    }
    case "status": {
      const active = activeWork(env.paths);
      if (!active?.work)
        return ok("no active work item", { active: null });
      const result = assess(env.paths, active.work, env.profile, env.policy, env.tampered || active.tampered);
      const text = `${active.work.id} "${active.work.title}"
  phase ${active.work.phase}, route ${active.work.route}${active.work.awaiting ? ", waiting for the user" : ""}
${gateSummary(active.work, result.verdict, result.unproven, result.evidence.runs)}`;
      return ok(text, {
        active: active.work.id,
        phase: active.work.phase,
        route: active.work.route,
        verdict: result.verdict,
        unproven: result.unproven
      });
    }
    case "mode": {
      if (!args[0])
        return ok(env.config.mode, { mode: env.config.mode });
      try {
        saveConfig(env.paths, setConfigValue(env.config, "mode", args[0]));
      } catch (error) {
        return refuse(error.message);
      }
      return ok(`mode: ${args[0]}`, { mode: args[0] });
    }
    case "config": {
      const [key, value] = args;
      if (!key)
        return ok(JSON.stringify(env.config), { config: env.config });
      if (value === undefined) {
        const current = key === "mode" ? env.config.mode : key === "decisions.log" ? env.config.decisions.log : undefined;
        return current === undefined ? refuse(`unknown setting: ${key}`) : ok(String(current), { key, value: current });
      }
      try {
        saveConfig(env.paths, setConfigValue(env.config, key, value));
      } catch (error) {
        return refuse(error.message);
      }
      return ok(`${key}: ${value}`, {
        key,
        value: key === "decisions.log" ? value === "true" : value
      });
    }
    default:
      return refuse(`unknown command: ${command}
${HELP}`);
  }
}
var HELP = `crew ${VERSION}
  detect [--refresh]                    build or refresh the project profile
  profile set <gate> "<cmd>" [--target p] propose a gate command (unconfirmed)
  profile confirm                       confirm proposed commands (asks the user)
  policy accept                         trust the current policy.json after a hand edit (asks the user)
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
async function main(argv, io) {
  const parsed = parse(argv);
  let outcome;
  try {
    outcome = await dispatch(parsed, io);
  } catch (error) {
    if (parsed.positional[0] === "hook") {
      io.stdout(`{}
`);
      return 0;
    }
    io.stderr(`crew: ${error.message}
`);
    return 2;
  }
  if (parsed.positional[0] === "hook") {
    io.stdout(`${outcome.text}
`);
    return 0;
  }
  if (parsed.flags.json)
    io.stdout(`${JSON.stringify({ ok: outcome.code === 0, message: outcome.text, ...outcome.data })}
`);
  else if (outcome.code === 0)
    io.stdout(`${outcome.text}
`);
  else
    io.stderr(`${outcome.text}
`);
  return outcome.code;
}

// packages/engine/src/crew.ts
async function readStdin() {
  if (process.stdin.isTTY)
    return "";
  const chunks = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
process.exitCode = await main(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  stdin: readStdin,
  env: process.env,
  cwd: process.cwd()
});
