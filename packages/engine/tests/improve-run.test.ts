import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  diffRefusal,
  EDITOR_TOOLS,
  type EditorCall,
  type ImproveDeps,
  type KitCall,
  keptSandboxes,
  probeEstimate,
  realDeps,
  realGit,
  removeKeptSandboxes,
  runImprove,
} from "../../../scripts/improve.ts";
import { toolResult, toolUse } from "./kit-stub.ts";

const PLUGIN = "/private/tmp/e-run/plugins/wizardingcode-developer-crew";
const GATE = "plugins/core/skills/crew/references/gate.md";
const JUDGE = "plugins/core/agents/judge.md";

function sh(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout;
}

/** A repository with the plugin's text, two eval cases (t reads gate.md, u reads judge.md), committed. */
function fixture(): { root: string; tmp: string } {
  const root = mkdtempSync(join(tmpdir(), "improve-run-"));
  const files: Record<string, string> = {
    [GATE]: "# Gate\n",
    [JUDGE]: "# Judge\n",
    "plugins/core/evals/t/case.yaml": "name: t\n",
    "plugins/core/evals/u/case.yaml": "name: u\n",
    "packages/engine/src/cli.ts": "export {};\n",
    ".gitignore": "*.secret\nplugins/core/evals/results/\n",
  };
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  sh(root, "init", "-q", "-b", "main");
  sh(root, "add", "-A");
  sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "init");
  return { root, tmp: mkdtempSync(join(tmpdir(), "improve-wt-")) };
}

/**
 * The kit's result for one case in a tree: three runs scored from the tree's gate.md (BETTER scores 1),
 * each with a trace of the case's read where the kit keeps it, `<sandbox>/out/trace.jsonl` (finding
 * 175): the with runs share two sandboxes, a without run has its own, and two more without runs
 * carry a path of another shape, which names no sandbox. `boxes` are the three made.
 */
function kitResult(call: KitCall, scores?: number[], error: string | null = null) {
  const better = readFileSync(join(call.tree, GATE), "utf8").includes("BETTER");
  const file = call.caseName === "u" ? "agents/judge.md" : "skills/crew/references/gate.md";
  const lines = `${[toolUse("a", "Read", { file_path: `${PLUGIN}/${file}` }), toolResult("a", "1\tx")].join("\n")}\n`;
  const box = () => {
    const dir = mkdtempSync(join(tmpdir(), "e-"));
    mkdirSync(join(dir, "out"));
    writeFileSync(join(dir, "out", "trace.jsonl"), lines);
    return dir;
  };
  const boxes = [box(), box(), box()];
  const traceOf = (dir: string) => join(dir, "out", "trace.jsonl");
  const traces = [boxes[0], boxes[0], boxes[1]].map((dir) => traceOf(dir as string));
  const s = scores ?? (call.caseName === "u" ? [1, 1, 1] : better ? [1, 1, 1] : [0.5, 0.5, 0.5]);
  return {
    status: 0,
    boxes,
    result: {
      costUsd: 0.6,
      plugins: [{ path: PLUGIN }],
      cases: [
        {
          name: call.caseName,
          arms: {
            with: s.map((score, i) => ({ score, error, tracePath: traces[i % 3], graders: [] })),
            without: [
              { score: 0, error: null, tracePath: traceOf(boxes[2] as string), graders: [] },
              { score: 0, error: null, tracePath: 7 as unknown, graders: [] },
              {
                score: 0,
                error: null,
                tracePath: join(boxes[2] as string, "other", "trace.jsonl"),
                graders: [],
              },
            ],
          },
        },
      ],
    },
  };
}

interface Seen {
  kit: KitCall[];
  editor: EditorCall[];
  git: { args: string[]; cwd: string; env: NodeJS.ProcessEnv }[];
  lessons: string[][];
  log: string[];
  /** The sandboxes each kit call made (finding 175), in call order. */
  boxes: string[][];
  /** The paths each removal asked for, in call order. */
  sandboxes: string[][];
}

/** The deps with the kit and the editor stubbed, real git recorded, lessons captured. */
function deps(
  root: string,
  tmp: string,
  options: {
    kit?: (call: KitCall, n: number) => { status: number | null; result: unknown };
    editor?: (call: EditorCall, n: number) => void;
    output?: (n: number) => string;
    env?: NodeJS.ProcessEnv;
    /** In place of the removal that deletes what it is given (finding 175). */
    removeSandboxes?: (paths: string[]) => void;
  } = {},
): { deps: ImproveDeps; seen: Seen } {
  const seen: Seen = {
    kit: [],
    editor: [],
    git: [],
    lessons: [],
    log: [],
    boxes: [],
    sandboxes: [],
  };
  let lessonId = 0;
  return {
    seen,
    deps: {
      root,
      tmp,
      env: options.env ?? { PATH: process.env.PATH, HOME: process.env.HOME },
      now: () => new Date("2026-10-24T22:00:00.000Z"),
      log: (line) => seen.log.push(line),
      git: (args, cwd, env, input) => {
        seen.git.push({ args, cwd, env });
        return realGit(args, cwd, env, input);
      },
      kit: (call) => {
        seen.kit.push(call);
        seen.log.push(`kit ${call.caseName}`);
        const r = options.kit ? options.kit(call, seen.kit.length) : kitResult(call);
        seen.boxes.push((r as { boxes?: string[] }).boxes ?? []);
        return { status: r.status, result: r.result };
      },
      removeSandboxes: (paths) => {
        seen.sandboxes.push(paths);
        (
          options.removeSandboxes ??
          ((asked: string[]) => {
            for (const dir of asked) rmSync(dir, { recursive: true, force: true });
          })
        )(paths);
      },
      editor: (call) => {
        seen.editor.push(call);
        (options.editor ?? ((c) => writeFileSync(join(c.cwd, GATE), "# Gate\nBETTER\n")))(
          call,
          seen.editor.length,
        );
        const n = seen.editor.length;
        return {
          status: 0,
          output: options.output ? options.output(n) : `P-${n}: name the gate first`,
        };
      },
      lessonAdd: (args) => {
        seen.lessons.push(args);
        lessonId += 1;
        return { status: 0, out: `K-${lessonId} added (harness-lesson)` };
      },
      lessons: () => [],
      ctoPlan: () => null,
    },
  };
}

const worktrees = (root: string): number =>
  sh(root, "worktree", "list", "--porcelain")
    .split("\n")
    .filter((l) => l.startsWith("worktree ")).length;
const recordOf = (root: string) => {
  const dir = join(root, "docs/improve");
  const [run] = readdirSync(dir);
  return JSON.parse(readFileSync(join(dir, run as string, "record.json"), "utf8"));
};

test("2026-10-24-012 AC-23: the estimate is printed before any spend; each refusal of step 0 exits 1, spends and writes nothing; the kit's ceiling exits 2 and a failure 3, each with the partial record", async () => {
  const { root, tmp } = fixture();
  const ok = deps(root, tmp);
  expect(await runImprove({ cases: ["t"], proposals: 1 }, ok.deps)).toBe(0);
  // AC-18: the baseline's kit call asks the kit for three runs.
  expect(ok.seen.kit[0]).toMatchObject({ tree: root, caseName: "t", runs: 3 });
  const estimate = ok.seen.log.findIndex((l) => l.startsWith("estimated cost:"));
  expect(estimate).toBeGreaterThan(-1);
  expect(estimate).toBeLessThan(ok.seen.log.indexOf("kit t"));
  rmSync(join(root, "docs"), { recursive: true });
  const refusals: [string[], number | undefined, string, () => void][] = [
    [[], undefined, "name at least one case: --case <a,b>", () => {}],
    [["nope"], undefined, "no eval case nope under plugins/core/evals/", () => {}],
    [["t"], 1, "--max-cost-usd 1 is below the baseline's estimate (4.20 USD)", () => {}],
    [
      ["t"],
      undefined,
      "the repository has uncommitted changes (stray.md): commit or stash them first",
      () => writeFileSync(join(root, "stray.md"), "x"),
    ],
  ];
  for (const [cases, cap, reason, arrange] of refusals) {
    arrange();
    const run = deps(root, tmp);
    expect(await runImprove({ cases, proposals: 1, maxCostUsd: cap }, run.deps), reason).toBe(1);
    expect(run.seen.log, reason).toContain(reason);
    expect(run.seen.kit, reason).toEqual([]);
    expect(existsSync(join(root, "docs")), reason).toBe(false);
  }
  rmSync(join(root, "stray.md"));
  const capped = deps(root, tmp, {
    kit: (call, n) => (n === 1 ? kitResult(call) : { status: 2, result: null }),
  });
  expect(await runImprove({ cases: ["t"], proposals: 1 }, capped.deps)).toBe(2);
  expect(recordOf(root).exit).toBe(2);
  expect(recordOf(root).proposals[0].status).toBe("inconclusive");
  rmSync(join(root, "docs"), { recursive: true });
  const failed = deps(root, tmp, { kit: () => ({ status: 3, result: null }) });
  expect(await runImprove({ cases: ["t"], proposals: 1 }, failed.deps)).toBe(3);
  expect(recordOf(root).exit).toBe(3);
});

test("2026-10-24-012 AC-14: every worktree a run makes is gone at its end, on a success, a refusal, the ceiling and a failure; only the kept branch remains", async () => {
  const { root, tmp } = fixture();
  expect(await runImprove({ cases: ["t"], proposals: 2 }, deps(root, tmp).deps)).toBe(0);
  expect(worktrees(root)).toBe(1);
  expect(sh(root, "branch", "--list", "improve/*").trim()).toBe("improve/2026-10-24-1");
  expect(readdirSync(tmp)).toEqual([]);
  // A refused proposal (exit 0), the ceiling (2) and a failure (3), each from a clean tree; a
  // refusal of step 0 (1) makes no worktree at all.
  const ends: [number, Parameters<typeof deps>[2]][] = [
    [0, { editor: () => {} }],
    [2, { kit: (call, n) => (n === 1 ? kitResult(call) : { status: 2, result: null }) }],
    [3, { kit: (call, n) => (n === 1 ? kitResult(call) : { status: 3, result: null }) }],
    [1, {}],
  ];
  for (const [exit, options] of ends) {
    rmSync(join(root, "docs"), { recursive: true, force: true });
    const cases = exit === 1 ? ["nope"] : ["t"];
    expect(
      await runImprove({ cases, proposals: 1 }, deps(root, tmp, options).deps),
      String(exit),
    ).toBe(exit);
    expect(worktrees(root), String(exit)).toBe(1);
    expect(readdirSync(tmp), String(exit)).toEqual([]);
  }
});

test("2026-10-24-012 AC-19: a proposal is refused and never probed when its staged diff holds a path outside the harness (a deletion, a rename out, an ignored file), a symlink, a mode change or nothing; diffRefusal reads a .. and a crewX sibling as outside", async () => {
  const cases: [string, (cwd: string) => void, string][] = [
    [
      "outside",
      (c) => writeFileSync(join(c, "packages/engine/src/cli.ts"), "x"),
      "packages/engine/src/cli.ts is outside the harness",
    ],
    [
      "deletion",
      (c) => rmSync(join(c, "packages/engine/src/cli.ts")),
      "packages/engine/src/cli.ts is outside the harness",
    ],
    ["rename", (c) => sh(c, "mv", JUDGE, "docs-judge.md"), "docs-judge.md is outside the harness"],
    [
      "ignored",
      (c) => writeFileSync(join(c, "notes.secret"), "x"),
      "notes.secret is outside the harness",
    ],
    [
      "eval",
      (c) => writeFileSync(join(c, "plugins/core/evals/t/case.yaml"), "x"),
      "plugins/core/evals/t/case.yaml is outside the harness",
    ],
    [
      "symlink",
      (c) => symlinkSync("/etc/hosts", join(c, "plugins/core/agents/x.md")),
      "plugins/core/agents/x.md is a symlink",
    ],
    ["mode", (c) => chmodSync(join(c, GATE), 0o755), `${GATE} changes its mode`],
    ["empty", () => {}, "the editor changed nothing"],
  ];
  for (const [name, edit, reason] of cases) {
    const { root, tmp } = fixture();
    const run = deps(root, tmp, { editor: (call) => edit(call.cwd) });
    await runImprove({ cases: ["t"], proposals: 1 }, run.deps);
    const p = recordOf(root).proposals[0];
    expect(p.status, name).toBe("refused");
    expect(p.refusal, name).toBe(reason);
    // The baseline alone ran: no probe of a refused proposal.
    expect(run.seen.kit.length, name).toBe(1);
  }
  expect(
    diffRefusal([
      {
        status: "A",
        path: "plugins/core/skills/crew/../../../x",
        oldMode: "000000",
        newMode: "100644",
      },
    ]),
  ).toBe("plugins/core/skills/crew/../../../x is outside the harness");
  expect(
    diffRefusal([
      { status: "A", path: "plugins/core/skills/crewX/a.md", oldMode: "000000", newMode: "100644" },
    ]),
  ).toBe("plugins/core/skills/crewX/a.md is outside the harness");
  expect(
    diffRefusal([{ status: "M", path: GATE, oldMode: "100644", newMode: "100644" }]),
  ).toBeNull();
});

test("2026-10-24-012 AC-20: the script commits the kept diff with the fixed identity on a valid improve/ branch; every git call carries the empty hooks path; no push, merge, rebase, reset or checkout; a change to the main checkout or the worktree's .git while the editor ran refuses the proposal", async () => {
  const { root, tmp } = fixture();
  const before = sh(root, "rev-parse", "HEAD").trim();
  const run = deps(root, tmp);
  expect(await runImprove({ cases: ["t"], proposals: 1 }, run.deps)).toBe(0);
  expect(sh(root, "log", "-1", "--format=%an <%ae>", "improve/2026-10-24-1").trim()).toBe(
    "wizardingcode-improve <noreply@wizardingcode.io>",
  );
  expect(sh(root, "show", "improve/2026-10-24-1:" + GATE)).toContain("BETTER");
  expect(sh(root, "rev-parse", "HEAD").trim()).toBe(before);
  expect(sh(root, "rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("main");
  // The run's own record is the one change it leaves in the main checkout.
  expect(sh(root, "status", "--porcelain").trim()).toBe("?? docs/");
  for (const call of run.seen.git) {
    expect(call.args.slice(0, 2)).toEqual(["-c", expect.stringMatching(/^core\.hooksPath=.+/)]);
    expect(call.args).toContain("credential.helper=");
    for (const verb of ["push", "merge", "rebase", "reset", "checkout"])
      expect(call.args, call.args.join(" ")).not.toContain(verb);
  }
  // Each change the editor might make outside its worktree's files refuses the proposal.
  const moved = "the main checkout changed while the editor ran";
  const commit = ["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty"];
  const outside: [string, (root: string, cwd: string) => void, string][] = [
    ["status", (r) => writeFileSync(join(r, "README.md"), "x"), moved],
    [
      "config",
      (r) =>
        writeFileSync(
          join(r, ".git/config"),
          `${readFileSync(join(r, ".git/config"), "utf8")}[x]\n`,
        ),
      moved,
    ],
    ["hooks", (r) => writeFileSync(join(r, ".git/hooks/pre-commit"), "#!/bin/sh\n"), moved],
    ["head", (r) => sh(r, ...commit, "-m", "x"), moved],
    ["branch", (r) => sh(r, "switch", "-q", "-c", "other"), moved],
    [
      "dotgit",
      (_r, c) => writeFileSync(join(c, ".git"), "gitdir: /elsewhere\n"),
      "the worktree's .git changed while the editor ran",
    ],
  ];
  for (const [name, edit, reason] of outside) {
    const fresh = fixture();
    const r = deps(fresh.root, fresh.tmp, { editor: (call) => edit(fresh.root, call.cwd) });
    await runImprove({ cases: ["t"], proposals: 1 }, r.deps);
    const record = JSON.parse(
      readFileSync(join(fresh.root, "docs/improve/2026-10-24-1/record.json"), "utf8"),
    );
    expect(record.proposals[0].refusal, name).toBe(reason);
  }
  // The branch name is the one git accepts, checked before it is made.
  const refs = run.seen.git.filter((c) => c.args.includes("check-ref-format"));
  expect(refs.map((c) => c.args.slice(-2))).toEqual([["--branch", "improve/2026-10-24-1"]]);
});

test("2026-10-24-012 AC-24: the editor runs in its worktree with Read, Grep, Glob, Edit and Write alone, acceptEdits, no MCP server, no session kept, and never Bash or a bypass", async () => {
  const { root, tmp } = fixture();
  const run = deps(root, tmp);
  await runImprove({ cases: ["t"], proposals: 1 }, run.deps);
  const call = run.seen.editor[0] as EditorCall;
  expect(call.cwd.startsWith(tmp)).toBe(true);
  expect(EDITOR_TOOLS).toBe("Read,Grep,Glob,Edit,Write");
  const args = call.args.join(" ");
  for (const part of [
    "--tools Read,Grep,Glob,Edit,Write",
    "--permission-mode acceptEdits",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--model fable",
  ])
    expect(args).toContain(part);
  expect(args).not.toMatch(/Bash|bypassPermissions|dangerously|skip-permissions/);
  expect(call.args[0]).toBe("-p");
});

test("2026-10-24-012 AC-25: the editor and every git process get the kit's environment: a GITHUB_TOKEN of the parent reaches neither, nor the record", async () => {
  const { root, tmp } = fixture();
  // Built at run time, as the other tests build their planted keys, so the secret scan never reads one.
  const token = ["ghp", "_parentsecret0123456789"].join("");
  const run = deps(root, tmp, {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GITHUB_TOKEN: token },
  });
  await runImprove({ cases: ["t"], proposals: 1 }, run.deps);
  expect(run.seen.editor[0]?.env.GITHUB_TOKEN).toBeUndefined();
  for (const call of run.seen.git) expect(call.env.GITHUB_TOKEN).toBeUndefined();
  const dir = join(root, "docs/improve/2026-10-24-1");
  for (const file of ["record.json", "record.md"])
    expect(readFileSync(join(dir, file), "utf8")).not.toContain(token);
});

test("2026-10-24-012 AC-27: an errored baseline run of a target stops the run before any proposal (exit 3, the partial record); of another case, the proposals that probe it are inconclusive; a proposal left at the ceiling is inconclusive", async () => {
  const target = fixture();
  const stopped = deps(target.root, target.tmp, {
    kit: (call) => kitResult(call, [1, 1, 0], "timeout"),
  });
  expect(await runImprove({ cases: ["t"], proposals: 1 }, stopped.deps)).toBe(3);
  expect(stopped.seen.editor).toEqual([]);
  expect(recordOf(target.root).proposals).toEqual([]);
  expect(recordOf(target.root).exit).toBe(3);
  // u read judge.md in an earlier run (D-8): an editor that edits judge.md brings u into the probe
  // set, and u's baseline in this run errored.
  const other = fixture();
  mkdirSync(join(other.root, "docs/improve/2026-10-23-1"), { recursive: true });
  writeFileSync(
    join(other.root, "docs/improve/2026-10-23-1/record.json"),
    JSON.stringify({ baseline: { u: { reads: [JUDGE] } } }),
  );
  sh(other.root, "add", "-A");
  sh(other.root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "earlier run");
  const run = deps(other.root, other.tmp, {
    kit: (call) =>
      call.caseName === "u" && call.tree === other.root
        ? kitResult(call, [1, 1, 1], "timeout")
        : kitResult(call),
    editor: (call) => {
      writeFileSync(join(call.cwd, GATE), "# Gate\nBETTER\n");
      writeFileSync(join(call.cwd, JUDGE), "# Judge\nmore\n");
    },
  });
  expect(await runImprove({ cases: ["t"], proposals: 1 }, run.deps)).toBe(0);
  const p = JSON.parse(
    readFileSync(join(other.root, "docs/improve/2026-10-24-1/record.json"), "utf8"),
  ).proposals[0];
  expect(p.probeSet).toEqual(["t", "u"]);
  expect(p.status).toBe("inconclusive");
  expect(p.verdict).toBe("inconclusive");
  expect(run.seen.lessons).toEqual([]);
});

test("2026-10-24-012 AC-21 (the run): a winning proposal enters its lesson through crew knowledge lesson add with the run's record as evidence", async () => {
  const { root, tmp } = fixture();
  const run = deps(root, tmp);
  expect(await runImprove({ cases: ["t"], proposals: 1 }, run.deps)).toBe(0);
  expect(run.seen.lessons).toHaveLength(1);
  const args = run.seen.lessons[0] as string[];
  expect(args.slice(args.indexOf("--evidence"), args.indexOf("--evidence") + 2)).toEqual([
    "--evidence",
    "docs/improve/2026-10-24-1/record.json",
  ]);
  expect(args.slice(args.indexOf("--confidence"), args.indexOf("--confidence") + 2)).toEqual([
    "--confidence",
    "medium",
  ]);
  expect(recordOf(root).lessons).toEqual(["K-1"]);
});

test("2026-10-24-012 AC-28: beyond its targets a proposal probes the cases an earlier run saw read a file it edits; a case no run measured is never probed and the record names it", async () => {
  const { root, tmp } = fixture();
  mkdirSync(join(root, "plugins/core/evals/v"), { recursive: true });
  writeFileSync(join(root, "plugins/core/evals/v/case.yaml"), "name: v\n");
  // Two earlier runs: the later one's reads of u stand (judge.md), the earlier one's (none) do not;
  // and t's earlier reads (judge.md) give way to this run's own baseline (gate.md).
  const earlier: [string, unknown][] = [
    ["2026-10-22-1", { baseline: { u: { reads: [] }, t: { reads: [JUDGE] } } }],
    ["2026-10-23-1", { baseline: { u: { reads: [JUDGE] } } }],
  ];
  for (const [name, record] of earlier) {
    mkdirSync(join(root, "docs/improve", name), { recursive: true });
    writeFileSync(join(root, "docs/improve", name, "record.json"), JSON.stringify(record));
  }
  sh(root, "add", "-A");
  sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "earlier runs");
  const run = deps(root, tmp, {
    editor: (call) => {
      writeFileSync(join(call.cwd, GATE), "# Gate\nBETTER\n");
      writeFileSync(join(call.cwd, JUDGE), "# Judge\nmore\n");
    },
  });
  expect(await runImprove({ cases: ["t"], proposals: 1 }, run.deps)).toBe(0);
  const dir = join(root, "docs/improve/2026-10-24-1");
  const record = JSON.parse(readFileSync(join(dir, "record.json"), "utf8"));
  expect(record.proposals[0].probeSet).toEqual(["t", "u"]);
  expect(record.unmeasured).toEqual(["v"]);
  expect(run.seen.kit.map((c) => c.caseName)).not.toContain("v");
  expect(readFileSync(join(dir, "record.md"), "utf8")).toContain(
    "- Cases no run has measured (never probed): v",
  );
});

test("2026-10-24-012 AC-7 (the run): two winners are composed in a worktree of their own and probed on the union of their probe sets; diffs that do not apply together leave the best single winner", async () => {
  // Both proposals rewrite gate.md the same way: they win alone and do not apply together.
  const clash = fixture();
  const run = deps(clash.root, clash.tmp);
  expect(await runImprove({ cases: ["t"], proposals: 2 }, run.deps)).toBe(0);
  const record = recordOf(clash.root);
  expect(record.proposals.map((p: { verdict: string }) => p.verdict)).toEqual(["win", "win"]);
  expect(record.composition).toMatchObject({ ids: ["P-1", "P-2"], applied: false, verdict: null });
  expect(record.kept).toEqual({ kind: "single", id: "P-1" });
  // Disjoint winners compose: P-1 rewrites gate.md; P-2 adds a reference beside it and edits
  // judge.md, which u read in an earlier run, so P-2 probes t and u and the composition the union.
  const disjoint = fixture();
  mkdirSync(join(disjoint.root, "docs/improve/2026-10-23-1"), { recursive: true });
  writeFileSync(
    join(disjoint.root, "docs/improve/2026-10-23-1/record.json"),
    JSON.stringify({ baseline: { u: { reads: [JUDGE] } } }),
  );
  sh(disjoint.root, "add", "-A");
  sh(disjoint.root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "u's reads");
  const extra = "plugins/core/skills/crew/references/extra.md";
  const both = deps(disjoint.root, disjoint.tmp, {
    editor: (call, n) => {
      if (n === 1) writeFileSync(join(call.cwd, GATE), "# Gate\nBETTER\n");
      else {
        writeFileSync(join(call.cwd, extra), "x\n");
        writeFileSync(join(call.cwd, JUDGE), "# Judge\nmore\n");
      }
    },
    kit: (call) => {
      const better =
        existsSync(join(call.tree, extra)) ||
        readFileSync(join(call.tree, GATE), "utf8").includes("BETTER");
      return kitResult(call, better ? [1, 1, 1] : [0.5, 0.5, 0.5]);
    },
  });
  expect(await runImprove({ cases: ["t"], proposals: 2 }, both.deps)).toBe(0);
  const composed = JSON.parse(
    readFileSync(join(disjoint.root, "docs/improve/2026-10-24-1/record.json"), "utf8"),
  );
  expect(composed.proposals.map((p: { probeSet: string[] }) => p.probeSet)).toEqual([
    ["t"],
    ["t", "u"],
  ]);
  expect(composed.composition).toMatchObject({
    ids: ["P-1", "P-2"],
    applied: true,
    verdict: "win",
    probeSet: ["t", "u"],
  });
  expect(composed.kept).toEqual({ kind: "composition", ids: ["P-1", "P-2"] });
  const kept = sh(disjoint.root, "ls-tree", "-r", "--name-only", "improve/2026-10-24-1");
  expect(kept).toContain(extra);
  expect(sh(disjoint.root, "show", `improve/2026-10-24-1:${GATE}`)).toContain("BETTER");
  // A kept composition's lessons are high.
  expect(both.seen.lessons.map((a) => a[a.indexOf("--confidence") + 1])).toEqual(["high", "high"]);
});

test("2026-10-24-012 AC-11 (the run): the record.json a run writes holds its targets, baseline, each proposal's diff stat, rationale, probe figures and verdict, the composition, the branch and the cost", async () => {
  const { root, tmp } = fixture();
  expect(await runImprove({ cases: ["t"], proposals: 1 }, deps(root, tmp).deps)).toBe(0);
  const record = recordOf(root);
  expect(record.run).toBe("2026-10-24-1");
  expect(record.targets).toEqual(["t"]);
  expect(record.baseline.t).toMatchObject({ mean: 0.5, spread: 0, reads: [GATE] });
  expect(record.proposals[0]).toMatchObject({
    id: "P-1",
    status: "probed",
    diffStat: [{ status: "M", path: GATE }],
    rationale: "P-1: name the gate first",
    probeSet: ["t"],
    verdict: "win",
  });
  expect(record.proposals[0].probe.t).toMatchObject({ mean: 1, spread: 0 });
  expect(record.composition).toBeNull();
  expect(record.branch).toBe("improve/2026-10-24-1");
  // Two kit calls at 0.6 USD each: the baseline and the probe.
  expect(record.costUsd).toBeCloseTo(1.2);
  const md = readFileSync(join(root, "docs/improve/2026-10-24-1/record.md"), "utf8");
  for (const text of [
    "- Targets: t",
    "## P-1: win",
    `- Diff: M ${GATE}`,
    "- Kept: P-1 on improve/2026-10-24-1",
    "- Cost: 1.20 USD",
  ])
    expect(md, text).toContain(text);
});

test("2026-10-24-012 AC-30: the editor's answer is scanned before the record is written; a rationale holding a secret is withheld, the record naming the rule alone", async () => {
  const { root, tmp } = fixture();
  const key = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
  const run = deps(root, tmp, { output: () => `I edited gate.md; the key is ${key}` });
  expect(await runImprove({ cases: ["t"], proposals: 1 }, run.deps)).toBe(0);
  const dir = join(root, "docs/improve/2026-10-24-1");
  expect(recordOf(root).proposals[0].rationale).toBe(
    "withheld: the editor's answer held a secret (AWS access key)",
  );
  for (const file of ["record.json", "record.md"])
    expect(readFileSync(join(dir, file), "utf8")).not.toContain(key);
  for (const args of run.seen.lessons) expect(args.join(" ")).not.toContain(key);
});

test("2026-10-24-012 AC-31: a diff that adds or changes a file to a mode other than 100644 is refused", async () => {
  const { root, tmp } = fixture();
  const script = "plugins/core/skills/crew/references/run.sh";
  const run = deps(root, tmp, {
    editor: (call) => {
      writeFileSync(join(call.cwd, script), "#!/bin/sh\n");
      chmodSync(join(call.cwd, script), 0o755);
    },
  });
  await runImprove({ cases: ["t"], proposals: 1 }, run.deps);
  expect(recordOf(root).proposals[0].refusal).toBe(`${script} has mode 100755, not 100644`);
  expect(diffRefusal([{ status: "A", path: GATE, oldMode: "000000", newMode: "100755" }])).toBe(
    `${GATE} has mode 100755, not 100644`,
  );
  expect(
    diffRefusal([{ status: "D", path: GATE, oldMode: "100644", newMode: "000000" }]),
  ).toBeNull();
});

test("2026-10-24-012 AC-33: the editor runs with an empty list of setting sources", async () => {
  const { root, tmp } = fixture();
  const run = deps(root, tmp);
  await runImprove({ cases: ["t"], proposals: 1 }, run.deps);
  const args = (run.seen.editor[0] as EditorCall).args;
  expect(args.indexOf("--setting-sources")).toBeGreaterThan(-1);
  expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
});

test("2026-10-25-005 AC-3: a run with a provider gives the kit and the editor the provider's environment and models, counts the editor's cost and records the provider; without one the run is what it was", async () => {
  const { root, tmp } = fixture();
  const provider = {
    name: "openrouter",
    env: {
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      ANTHROPIC_AUTH_TOKEN: "sk-or-SECRET",
      ANTHROPIC_API_KEY: "",
    },
    agentModel: "anthropic/claude-sonnet-5.5",
    judgeModel: "anthropic/claude-fable-5.1",
    claudeModels: true,
  };
  const withProvider = deps(root, tmp, {
    output: () => JSON.stringify({ result: "P-1: name the gate first", total_cost_usd: 0.25 }),
  });
  expect(
    await runImprove(
      { cases: ["t"], proposals: 1, judgeModel: provider.judgeModel, provider },
      withProvider.deps,
    ),
  ).toBe(0);
  expect(withProvider.seen.kit.length).toBeGreaterThan(0);
  for (const call of withProvider.seen.kit)
    expect(call).toMatchObject({
      model: "anthropic/claude-sonnet-5.5",
      judgeModel: "anthropic/claude-fable-5.1",
      env: provider.env,
    });
  const editor = withProvider.seen.editor[0] as EditorCall;
  expect(editor.env).toMatchObject(provider.env);
  const format = editor.args.indexOf("--output-format");
  expect(editor.args.slice(format, format + 2)).toEqual(["--output-format", "json"]);
  const record = recordOf(root);
  expect(record.provider).toEqual({
    name: "openrouter",
    agentModel: "anthropic/claude-sonnet-5.5",
    judgeModel: "anthropic/claude-fable-5.1",
    claudeModels: true,
  });
  expect(record.costUsd).toBeCloseTo(withProvider.seen.kit.length * 0.6 + 0.25, 5);
  expect(record.proposals[0].rationale).toBe("P-1: name the gate first");
  // A fresh repository for the run without a provider: the first run's kept branch stays in the other.
  const second = fixture();
  const plain = deps(second.root, second.tmp);
  expect(await runImprove({ cases: ["t"], proposals: 1 }, plain.deps)).toBe(0);
  expect(plain.seen.kit[0]?.model).toBeUndefined();
  expect(plain.seen.kit[0]?.env).toBeUndefined();
  const plainEditor = plain.seen.editor[0] as EditorCall;
  const plainFormat = plainEditor.args.indexOf("--output-format");
  expect(plainEditor.args.slice(plainFormat, plainFormat + 2)).toEqual(["--output-format", "text"]);
  expect(plainEditor.env.ANTHROPIC_BASE_URL).toBeUndefined();
  expect(recordOf(second.root).provider).toBeNull();
  expect(recordOf(second.root).costUsd).toBeCloseTo(plain.seen.kit.length * 0.6, 5);
});

test("2026-10-26-005 AC-1: after a measurement the run asks for exactly the sandboxes the kit kept for it, once the traces were read: the distinct parents of the out folders across arms, for the baseline and for a probe; a result without trace paths asks for nothing", async () => {
  const { root, tmp } = fixture();
  const run = deps(root, tmp);
  expect(await runImprove({ cases: ["t"], proposals: 1 }, run.deps)).toBe(0);
  // The baseline and the probe: each asked for its own three sandboxes (the two the with runs share and the without run's), once each, after the figures read the traces.
  expect(run.seen.kit).toHaveLength(2);
  expect(run.seen.boxes.map((b) => b.length)).toEqual([3, 3]);
  expect(run.seen.sandboxes).toEqual(run.seen.boxes);
  for (const box of run.seen.boxes.flat()) expect(existsSync(box)).toBe(false);
  const record = recordOf(root);
  // The traces were read before the sandboxes went: the case's read is in the figures.
  expect(record.baseline.t.reads).toContain("plugins/core/skills/crew/references/gate.md");
  expect(record.proposals[0].probe.t.reads).toContain(
    "plugins/core/skills/crew/references/gate.md",
  );
  // No trace paths in the result: nothing asked.
  const bare = fixture();
  const quiet = deps(bare.root, bare.tmp, {
    kit: (call) => {
      const r = kitResult(call);
      for (const runs of Object.values(r.result.cases[0]?.arms ?? {}))
        for (const x of runs) delete (x as { tracePath?: unknown }).tracePath;
      return r;
    },
  });
  expect(await runImprove({ cases: ["t"], proposals: 1 }, quiet.deps)).toBe(0);
  expect(quiet.seen.sandboxes.flat()).toEqual([]);
});

test("2026-10-26-005 AC-1 (keptSandboxes): the distinct parents of the out folders of the string trace paths across arms and both arm shapes, in order of first appearance; nothing for null, a number, an empty object, no cases or paths of another shape", () => {
  const box = (n: number) => `/private/tmp/e-${n}`;
  const trace = (n: number) => `${box(n)}/out/trace.jsonl`;
  const result = {
    cases: [
      {
        name: "t",
        arms: {
          with: [{ tracePath: trace(1) }, { tracePath: trace(1) }, { tracePath: trace(2) }],
          without: [
            { tracePath: 7 },
            { tracePath: `${box(3)}/other/trace.jsonl` },
            { tracePath: trace(4) },
          ],
        },
      },
      { name: "u", arms: [{ runs: [{ tracePath: trace(5) }, { tracePath: trace(1) }] }] },
    ],
  };
  expect(keptSandboxes(result)).toEqual([box(1), box(2), box(4), box(5)]);
  const others: unknown[] = [
    null,
    7,
    {},
    { cases: null },
    { cases: [{ arms: null }, { arms: { with: [{ tracePath: 3 }, {}] } }] },
  ];
  for (const other of others) expect(keptSandboxes(other)).toEqual([]);
});

test("2026-10-26-005 AC-6: a kit call that stops the run with a result still asks for its sandboxes, at the ceiling and for a result without the case; a null result asks for nothing; a removal that throws is logged and the figures stand", async () => {
  const capped = fixture();
  const atCeiling = deps(capped.root, capped.tmp, {
    kit: (call) => ({ ...kitResult(call), status: 2 }),
  });
  expect(await runImprove({ cases: ["t"], proposals: 1 }, atCeiling.deps)).toBe(2);
  expect(atCeiling.seen.boxes).toHaveLength(1);
  expect(atCeiling.seen.sandboxes).toEqual(atCeiling.seen.boxes);
  const elsewhere = fixture();
  const missing = deps(elsewhere.root, elsewhere.tmp, {
    kit: (call) => {
      const r = kitResult(call);
      const first = r.result.cases[0];
      if (first) first.name = "elsewhere";
      return r;
    },
  });
  expect(await runImprove({ cases: ["t"], proposals: 1 }, missing.deps)).toBe(3);
  expect(missing.seen.boxes).toHaveLength(1);
  expect(missing.seen.sandboxes).toEqual(missing.seen.boxes);
  const nothing = fixture();
  const silent = deps(nothing.root, nothing.tmp, { kit: () => ({ status: 3, result: null }) });
  expect(await runImprove({ cases: ["t"], proposals: 1 }, silent.deps)).toBe(3);
  expect(silent.seen.sandboxes.flat()).toEqual([]);
  const { root, tmp } = fixture();
  const stuck = deps(root, tmp, {
    removeSandboxes: () => {
      throw new Error("busy");
    },
  });
  expect(await runImprove({ cases: ["t"], proposals: 1 }, stuck.deps)).toBe(0);
  expect(recordOf(root).baseline.t.mean).toBe(0.5);
  expect(stuck.seen.log).toContain("sandboxes not removed: busy");
});

test("2026-10-26-005 AC-2: removeKeptSandboxes removes a kept sandbox (read-only, sealed at 000, a nested 000 folder with a file) and refuses, leaving untouched, a symlink named e-…, an e-… folder outside the roots, a folder without out, a path with .., and a folder of another name; a removal that fails is named and nothing throws", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "roots-")));
  const kept = join(root, "e-kept1");
  mkdirSync(join(kept, "out"), { recursive: true });
  writeFileSync(join(kept, "out", "trace.jsonl"), "");
  mkdirSync(join(kept, "sealed", "home", "deep"), { recursive: true });
  writeFileSync(join(kept, "sealed", "home", "deep", "f"), "x");
  chmodSync(join(kept, "sealed", "home", "deep"), 0o000);
  chmodSync(join(kept, "sealed"), 0o000);
  chmodSync(kept, 0o500);
  const target = join(root, "target");
  mkdirSync(join(target, "out"), { recursive: true });
  writeFileSync(join(target, "out", "keep.txt"), "keep");
  chmodSync(target, 0o755);
  const link = join(root, "e-link");
  symlinkSync(target, link);
  const outside = mkdtempSync(join(tmpdir(), "e-"));
  mkdirSync(join(outside, "out"));
  const noOut = join(root, "e-noout");
  mkdirSync(noOut);
  // An `out` that is a file or a symlink is no sandbox either (a folder of another owner cannot be staged without root).
  const outFile = join(root, "e-outfile");
  mkdirSync(outFile);
  writeFileSync(join(outFile, "out"), "");
  const outLink = join(root, "e-outlink");
  mkdirSync(outLink);
  symlinkSync(join(target, "out"), join(outLink, "out"));
  const dotted = join(root, "e-kept1", "..", "e-noout");
  const other = join(root, "other");
  mkdirSync(join(other, "out"), { recursive: true });
  const answer = removeKeptSandboxes(
    [kept, link, outside, noOut, outFile, outLink, dotted, other],
    [root],
  );
  expect(answer).toEqual({
    removed: [kept],
    refused: [link, outside, noOut, outFile, outLink, dotted, other],
    failed: [],
  });
  expect(existsSync(kept)).toBe(false);
  expect(existsSync(link)).toBe(true);
  expect(readFileSync(join(target, "out", "keep.txt"), "utf8")).toBe("keep");
  expect(statSync(target).mode & 0o777).toBe(0o755);
  for (const left of [outside, noOut, outFile, outLink, other]) expect(existsSync(left)).toBe(true);
  expect(existsSync(join(target, "out", "keep.txt"))).toBe(true);
  // A sandbox whose parent cannot be written: opened, emptied, but not unlinked; named, not thrown.
  const ro = realpathSync(mkdtempSync(join(tmpdir(), "ro-")));
  const stuck = join(ro, "e-stuck");
  mkdirSync(join(stuck, "out"), { recursive: true });
  chmodSync(ro, 0o500);
  try {
    const failed = removeKeptSandboxes([stuck], [ro]);
    // Root unlinks regardless, so the failure cannot be staged there.
    if (process.getuid?.() !== 0)
      expect(failed).toEqual({ removed: [], refused: [], failed: [stuck] });
  } finally {
    chmodSync(ro, 0o700);
  }
});

test("2026-10-26-005 AC-4: realDeps makes no improve-trees folder until tmp is read, one then (the same path on a second read), and dispose removes it; dispose without a read makes and removes nothing, and twice does not throw", () => {
  const { root } = fixture();
  const own = mkdtempSync(join(tmpdir(), "own-tmp-"));
  const before = process.env.TMPDIR;
  process.env.TMPDIR = own;
  try {
    expect(realpathSync(tmpdir())).toBe(realpathSync(own));
    const trees = () => readdirSync(own).filter((n) => n.startsWith("improve-trees-"));
    const idle = realDeps(root);
    idle.dispose();
    idle.dispose();
    expect(trees()).toEqual([]);
    const live = realDeps(root);
    expect(trees()).toEqual([]);
    const first = live.tmp;
    expect(live.tmp).toBe(first);
    expect(trees()).toEqual([basename(first)]);
    expect(realpathSync(dirname(first))).toBe(realpathSync(own));
    live.dispose();
    live.dispose();
    expect(trees()).toEqual([]);
  } finally {
    if (before === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = before;
  }
});

// 2026-10-28-001 AC-7 (finding 187): a stop the user asked for ends the run with 4 and a partial record.
test("2026-10-28-001 AC-7: stopRequested before a measure exits 4 with the partial record and no kit call; after a measure whose child ended by a signal, 4 in place of 3", async () => {
  const { root, tmp } = fixture();
  const early = deps(root, tmp);
  early.deps.stopRequested = () => true;
  expect(await runImprove({ cases: ["t"], proposals: 1 }, early.deps)).toBe(4);
  expect(early.seen.kit).toEqual([]);
  expect(recordOf(root).exit).toBe(4);
  rmSync(join(root, "docs"), { recursive: true });
  // The baseline runs; the first probe's child ends by a signal while the stop is requested: 4.
  let asked = false;
  const late = deps(root, tmp, {
    kit: (call, n) => {
      if (n === 1) return kitResult(call);
      asked = true;
      return { status: null, result: null };
    },
  });
  late.deps.stopRequested = () => asked;
  expect(await runImprove({ cases: ["t"], proposals: 1 }, late.deps)).toBe(4);
  const record = recordOf(root);
  expect(record.exit).toBe(4);
  expect(record.proposals[0].status).toBe("inconclusive");
  rmSync(join(root, "docs"), { recursive: true });
  // The same ended child with no stop requested: a failure, 3.
  const failed = deps(root, tmp, {
    kit: (call, n) => (n === 1 ? kitResult(call) : { status: null, result: null }),
  });
  expect(await runImprove({ cases: ["t"], proposals: 1 }, failed.deps)).toBe(3);
});

// 2026-10-28-001 AC-8 (finding 189): a probe set the ceiling cannot pay is not probed, and said.
test("2026-10-28-001 AC-8: a proposal whose probe set's estimate is above what the ceiling leaves is unprobed with the refusal's text, no kit call, the next proposal probed, the run ending 0 with nothing kept; within the ceiling the set is probed as before", async () => {
  const { root, tmp } = fixture();
  // An earlier record: six cases and u read the judge's page, each at 1.00 USD; their reads are known.
  const earlier = join(root, "docs", "improve", "2026-10-20-1");
  mkdirSync(earlier, { recursive: true });
  const seven = Object.fromEntries(
    ["c1", "c2", "c3", "c4", "c5", "c6", "u"].map((name) => [
      name,
      { name, runs: [], mean: 0.5, spread: 0, reads: [JUDGE], costUsd: 1, errored: false },
    ]),
  );
  writeFileSync(
    join(earlier, "record.json"),
    JSON.stringify({ run: "2026-10-20-1", at: "2026-10-20T10:00:00.000Z", baseline: seven }),
  );
  sh(root, "add", "-A");
  sh(root, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "earlier record");
  // The baseline of t costs 1.50 of the 4.20 the ceiling allows: 2.70 left. P-1 edits the gate's page
  // and the judge's: t (its own 1.50) and the seven readers of the judge's page (no baseline this run,
  // their earlier cost twice): 1.50 + 14.00 = 15.50, above 2.70. P-2 edits the gate's page alone: t, 1.50.
  const run = deps(root, tmp, {
    kit: (call, n) => {
      const r = kitResult(call);
      return n === 1 ? { ...r, result: { ...r.result, costUsd: 1.5 } } : r;
    },
    editor: (call, n) => {
      writeFileSync(join(call.cwd, GATE), "# Gate\nchanged\n");
      if (n === 1) writeFileSync(join(call.cwd, JUDGE), "# Judge\nchanged\n");
    },
  });
  expect(await runImprove({ cases: ["t"], proposals: 2, maxCostUsd: 4.2 }, run.deps)).toBe(0);
  // The newest record: the earlier one sits beside it.
  const latestRecord = () => {
    const dir = join(root, "docs/improve");
    const run = readdirSync(dir).sort().at(-1) as string;
    return JSON.parse(readFileSync(join(dir, run, "record.json"), "utf8"));
  };
  const record = latestRecord();
  expect(record.proposals[0]).toMatchObject({
    id: "P-1",
    status: "unprobed",
    refusal:
      "the probe set (8 cases, about 15.50 USD by the baseline's costs) is above what is left under the ceiling (2.70 USD); not probed",
    verdict: null,
    gain: 0,
    probe: {},
  });
  expect(record.proposals[0].probeSet).toEqual(["c1", "c2", "c3", "c4", "c5", "c6", "t", "u"]);
  expect(record.proposals[1]).toMatchObject({ id: "P-2", status: "probed", probeSet: ["t"] });
  expect(run.seen.kit.map((c) => c.caseName)).toEqual(["t", "t"]);
  expect(record.kept).toBe(null);
  expect(record.exit).toBe(0);
  const md = readFileSync(join(root, "docs/improve", record.run, "record.md"), "utf8");
  expect(md).toContain(
    "## P-1: unprobed (the probe set (8 cases, about 15.50 USD by the baseline's costs) is above what is left under the ceiling (2.70 USD); not probed)",
  );
  expect(md).toContain("## P-2: lose");
  rmSync(join(root, "docs", "improve", record.run), { recursive: true });
  // Within the ceiling: probed as before.
  const roomy = deps(root, tmp, {
    editor: (call) => writeFileSync(join(call.cwd, GATE), "# Gate\nBETTER\n"),
  });
  expect(await runImprove({ cases: ["t"], proposals: 1, maxCostUsd: 40 }, roomy.deps)).toBe(0);
  expect(latestRecord().proposals[0]).toMatchObject({
    id: "P-1",
    status: "probed",
    verdict: "win",
  });
  // probeEstimate itself: the three sources and the double count.
  expect(probeEstimate(["t", "c1", "u"], { t: { costUsd: 1.5 } }, { c1: { costUsd: 1 } })).toBe(
    6.5,
  );
  expect(probeEstimate(["u"], {}, {})).toBe(0);
  expect(probeEstimate(["t"], { t: { costUsd: 2 } }, { t: { costUsd: 9 } })).toBe(2);
});
