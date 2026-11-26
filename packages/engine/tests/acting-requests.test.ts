import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { actingAsk, actingDeny, actingOf } from "../src/hooks/acting.ts";
import { onPreToolUse } from "../src/hooks/pre-tool-use.ts";
import type { HookContext } from "../src/hooks/types.ts";
import { git, hookContext, makeRepo, testEnv } from "./helpers.ts";

const ITEM = "2026-11-26-006";
const REPO = join(import.meta.dir, "..", "..", "..");
const words = (line: string) => line.split(" ").filter(Boolean);
const ASK =
  "Crew: nuclei is a person's decision in this project (policy actingCommands): it can deploy, apply, destroy or publish outside this machine, or send requests to a running application, and the guard cannot tell an act from a read for it, nor production from a preview or from this machine's own environment. A yes here is that decision, for the whole line. Where nobody answers, stop, and do not run it in another form.";

test(`${ITEM} AC-7: the tools that send requests to a running application act, and their reads pass`, () => {
  const acting: [string, string][] = [
    ["nuclei -u https://a.test", "nuclei"],
    ["nuclei -l targets.txt", "nuclei"],
    ["nuclei", "nuclei"],
    ["nuclei -plan x", "nuclei"],
    ["zap-baseline.py -t http://localhost:8080", "zap-baseline.py"],
    ["zap-full-scan.py -t https://a.test", "zap-full-scan.py"],
    ["zap-api-scan.py -t api.yaml -f openapi", "zap-api-scan.py"],
    ["/zap/zap-baseline.py -t x", "zap-baseline.py"],
    ["zap.sh -cmd -autorun plan.yaml", "zap.sh"],
    ["zap-x.sh -daemon", "zap-x.sh"],
    ["schemathesis run http://localhost/openapi.json", "schemathesis run"],
    ["st run api.yaml --url https://a.test", "st run"],
    ["st fuzz x", "st fuzz"],
    ["st replay", "st replay"],
    ["schemathesis --config-file c.toml run x", "schemathesis run"],
    ["testssl.sh https://a.test", "testssl.sh"],
    ["testssl --file hosts.txt", "testssl"],
    ['sqlmap -u "https://a.test/?id=1"', "sqlmap"],
    ["sqlmap.py -r req.txt", "sqlmap.py"],
    ["k6 run load.js", "k6 run"],
    ["k6 run -", "k6 run"],
    ["k6 -v run x", "k6 run"],
    ["k6 -c cfg.json run x", "k6 run"],
    ["k6 --log-format raw run x", "k6 run"],
    ["k6 cloud run load.js", "k6 cloud run"],
    ["promptfoo redteam run", "promptfoo redteam run"],
    ["promptfoo redteam eval -c x.yaml", "promptfoo redteam eval"],
    ["promptfoo redteam discover", "promptfoo redteam discover"],
    ["npx promptfoo@latest redteam run", "promptfoo redteam run"],
    ["npx k6 run x", "k6 run"],
  ];
  for (const [line, text] of acting) expect([line, actingOf(words(line))]).toEqual([line, text]);
  for (const line of [
    "st explain",
    "schemathesis",
    "k6 cloud upload x",
    "k6 cloud login",
    "k6 cloud load.js",
    "k6 inspect x",
    "k6 version",
    "promptfoo redteam init",
    "promptfoo redteam generate",
    "promptfoo redteam plugins",
    "promptfoo redteam report",
    "promptfoo eval",
    "promptfoo eval -c redteam.yaml",
    "promptfoo validate target",
    "python sqlmap.py -u x",
    "uvx schemathesis run x",
  ])
    expect([line, actingOf(words(line))]).toEqual([line, null]);
});

test(`${ITEM} AC-13: a docker run of a listed image acts, read in every later word`, () => {
  const acting: [string, string][] = [
    [
      "docker run -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://a.test",
      "ghcr.io/zaproxy/zaproxy",
    ],
    [
      "docker run -v $(pwd):/zap/wrk/:rw -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t x",
      "ghcr.io/zaproxy/zaproxy",
    ],
    ["docker run --rm zaproxy/zap-stable zap-full-scan.py -t x", "zaproxy/zap-stable"],
    ["docker container run zaproxy/zap-weekly x", "zaproxy/zap-weekly"],
    ["docker run zaproxy/zap-nightly", "zaproxy/zap-nightly"],
    ["docker run zaproxy/zap-bare zap.sh -cmd -autorun plan.yaml", "zaproxy/zap-bare"],
    ["docker run docker.io/zaproxy/zap-stable x", "zaproxy/zap-stable"],
    ["docker run --rm -i grafana/k6 run -", "grafana/k6"],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the shell's own expansion, as k6's page writes it
    ["docker run --rm -i -v ${PWD}:/app -w /app grafana/k6 run x", "grafana/k6"],
    ["docker run index.docker.io/grafana/k6 run x", "grafana/k6"],
    ["docker run grafana/k6@sha256:abc run x", "grafana/k6"],
    ["docker run a b c d e f g grafana/k6", "grafana/k6"],
    ["docker --context x run grafana/k6 run -", "grafana/k6"],
    ["docker run --rm projectdiscovery/nuclei -u x", "projectdiscovery/nuclei"],
    ["docker run drwetter/testssl.sh x", "drwetter/testssl.sh"],
    ["docker run ghcr.io/testssl/testssl.sh:3.2 x", "ghcr.io/testssl/testssl.sh"],
    [
      "docker run ghcr.io/schemathesis/schemathesis:stable run x",
      "ghcr.io/schemathesis/schemathesis",
    ],
    ["docker run schemathesis/schemathesis run x", "schemathesis/schemathesis"],
    ["docker run ubuntu echo grafana/k6", "grafana/k6"],
  ];
  for (const [line, image] of acting)
    expect([line, actingOf(words(line))]).toEqual([line, `docker run ${image}`]);
  for (const line of [
    "docker run grafana/k6-extra",
    "docker run evil.test/grafana/k6",
    "docker run ubuntu nuclei",
    "docker pull grafana/k6",
    "docker images grafana/k6",
    "docker run $IMAGE",
    "docker create grafana/k6",
    "docker compose run grafana/k6",
  ])
    expect([line, actingOf(words(line))]).toEqual([line, null]);
  // The standing reads of the docker row are unchanged.
  expect(actingOf(words("docker push x"))).toBe("docker push");
  expect(actingOf(words("docker build --push ."))).toBe("docker build --push");
});

type Answer = {
  hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
};
const decision = (r: unknown) => (r as Answer).hookSpecificOutput?.permissionDecision;
const reason = (r: unknown) => (r as Answer).hookSpecificOutput?.permissionDecisionReason;
const bash = (ctx: HookContext, command: string, permission_mode = "default") =>
  onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode });
const turnOn = (ctx: HookContext) => {
  (ctx.policy as unknown as { actingCommands?: string }).actingCommands = "ask";
};
function project() {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  mkdirSync(join(root, ".crew"), { recursive: true });
  writeFileSync(join(root, ".crew", "policy.json"), "{}");
  return { root, ctx: hookContext({ session_id: "s", cwd: root }, testEnv()) };
}
const BRANCH = "crew/2026-11-26-006/T-1";
function opened(kind: "mail" | "journey", on: boolean) {
  const { root } = project();
  git(root, "checkout", "-q", "-b", BRANCH);
  const ctx = hookContext(
    { session_id: "s", cwd: root },
    {
      ...testEnv(),
      WIZARDINGCODE_CREW_MAIL_ID: "M-2026-11-26-001-scan",
      WIZARDINGCODE_CREW_MAIL_BRANCH: BRANCH,
      CLAUDE_CODE_SESSION_ATTENDED: "0",
    },
  );
  if (kind === "journey") {
    ctx.openedBy = "journey J-1";
    ctx.journeyId = "J-1";
    ctx.openedBranch = BRANCH;
  }
  if (on) turnOn(ctx);
  return ctx;
}

test(`${ITEM} AC-9: the hook asks for a scan with a person, denies it with nobody and in an opened session`, () => {
  const line = "nuclei -u https://a.test";
  const off = project();
  expect(bash(off.ctx, line)).toEqual({});
  const on = project();
  turnOn(on.ctx);
  const asked = bash(on.ctx, line);
  expect(decision(asked)).toBe("ask");
  expect(reason(asked)).toContain(ASK);
  const nobody = bash(on.ctx, line, "dontAsk");
  expect(decision(nobody)).toBe("deny");
  expect(reason(nobody)).toContain(actingDeny("nuclei", "dontAsk").slice(0, 60));
  const both = bash(on.ctx, "terraform apply && nuclei -u https://a.test");
  expect(decision(both)).toBe("ask");
  expect(reason(both)).toContain(actingAsk("terraform apply and nuclei"));
  for (const kind of ["mail", "journey"] as const)
    for (const key of [false, true]) {
      const answer = bash(opened(kind, key), line, "dontAsk");
      expect([kind, key, decision(answer)]).toEqual([kind, key, "deny"]);
      expect([kind, key, reason(answer)?.includes(": nuclei is denied; ")]).toEqual([
        kind,
        key,
        true,
      ]);
    }
});

test(`${ITEM} AC-10: the ask names requests to a running application, and so does rule 2`, () => {
  expect(actingAsk("nuclei")).toBe(ASK);
  const rules = readFileSync(
    join(REPO, "plugins", "core", "skills", "crew", "references", "rules.md"),
    "utf8",
  );
  const rule2 = rules.split("\n").find((l) => l.startsWith("2. ")) ?? "";
  expect(rule2).toContain(
    "a command that deploys, applies, destroys or publishes, or sends requests to a running application,",
  );
});

test(`${ITEM} AC-14: ADR 0026 ends with this item's amendment`, () => {
  const adr = readFileSync(
    join(REPO, "docs", "adr", "0026-an-acting-command-is-asked-where-a-project-says-so.md"),
    "utf8",
  );
  const heading = "## Amendment of 2026-11-26 (item 2026-11-26-006)";
  expect(adr.match(/^## .*$/gm)?.at(-1)).toBe(heading);
  const part = adr.slice(adr.indexOf(heading));
  for (const said of [
    "`zap-baseline.py`",
    "`zap.sh`",
    "`nuclei`",
    "`schemathesis`",
    "`testssl.sh`",
    "`sqlmap`",
    "`k6`",
    "`redteam run`",
    "`redteam eval`",
    "`redteam discover`",
    "`ghcr.io/zaproxy/zaproxy`",
    "`zaproxy/zap-bare`",
    "`projectdiscovery/nuclei`",
    "`drwetter/testssl.sh`",
    "`ghcr.io/testssl/testssl.sh`",
    "`schemathesis/schemathesis`",
    "`grafana/k6`",
    "`docker.io/`",
    "or send requests to a running application",
    "this machine's own environment",
    "`-plan`",
    "`-replay`",
    "`--help`",
    "never merges, pushes to another branch, releases or deploys",
    "`docker run <image> <command>`",
    "`python sqlmap.py`",
    "`uvx`",
    "`pipx run`",
    "`docker run $IMAGE`",
    "`docker create`",
    "`docker compose run`",
    "another registry",
    "`promptfoo eval`",
    "`promptfoo validate target`",
    "`mcp`",
    "`cloud`",
    "database clients",
    "browsers",
  ])
    expect([said, part.includes(said)]).toEqual([said, true]);
});
