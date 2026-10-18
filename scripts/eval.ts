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

const ALLOW_TOOLS = [
  "Write",
  "Edit",
  "Bash(crew *)",
  "Bash(node *)",
  "Bash(npm *)",
  "Bash(git *)",
  "Bash(cat *)",
  "Bash(ls *)",
  "Bash(sh *)",
  "Bash(make *)",
  "Bash(sed *)",
  "Bash(head *)",
  "Bash(echo *)",
  "Bash(which *)",
  // SP2c: a case may change into peer/b, and the opener runs claude with its environment
  "Bash(cd *)",
  "Bash(env *)",
  "Bash(claude *)",
];
// The tags the sandbox can run: the three mail cases are tagged needs-real-opener (spike A6, the
// sandbox's temporary config holds no login) and are recorded from an end-to-end run instead.
const SANDBOX_TAGS = [
  "cost",
  "enforcement",
  "method",
  "risk",
  "stacks",
  "gap",
  "kind",
  "validator",
  "judgement",
  "team",
  // SP7b: the four cases need no opener (a change request to a read-only project is queued in its inbox).
  "environment",
  "priority",
  "contracts",
];
const COMMON = [
  "plugin",
  "eval",
  "plugins/core",
  "--scaffold",
  "--trust-plugin",
  "--no-publish",
  "--model",
  "claude-sonnet-5-5",
];

export function evalInvocation(options: EvalOptions): { path: string; args: string[] } {
  const entries = [join(options.root, "plugins/core/bin")];
  if (options.realGitDir) entries.push(options.realGitDir);
  if (options.path) entries.push(options.path);
  const args = options.caseName
    ? [
        ...COMMON,
        "--case",
        options.caseName,
        "--runs",
        "1",
        "--ablation",
        "none",
        "--max-cost-usd",
        "5",
      ]
    : [
        ...COMMON,
        "--tag",
        ...SANDBOX_TAGS,
        "--keep-temp",
        "--judge-model",
        "claude-fable-5-1",
        "--max-cost-usd",
        "40",
        "--concurrency",
        "3",
        "--report",
        "plugins/core/evals/results/report.html",
        "--json",
        "plugins/core/evals/results/last.json",
      ];
  return { path: entries.join(delimiter), args: [...args, "--allow-tools", ...ALLOW_TOOLS] };
}

/** Where the real git lives on macOS, as xcrun reports it; null elsewhere. Fails rather than run the suite on the shim. */
export function realGitDir(platform: NodeJS.Platform): string | null {
  if (platform !== "darwin") return null;
  const found = spawnSync("xcrun", ["--find", "git"], { encoding: "utf8" });
  const file = found.stdout?.trim();
  if (found.status !== 0 || !file) {
    throw new Error(`xcrun --find git failed: ${found.stderr?.trim() ?? ""}`);
  }
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
