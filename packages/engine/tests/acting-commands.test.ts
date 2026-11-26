import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as actingModule from "../src/hooks/acting.ts";
import { onPreToolUse, openedSessionDenial } from "../src/hooks/pre-tool-use.ts";
import type { HookContext } from "../src/hooks/types.ts";
import { DEFAULT_POLICY, loadPolicy, setPolicyValue } from "../src/policy.ts";
import { createWork, saveWork } from "../src/work.ts";
import { cliIo, git, hookContext, makeRepo, repoPaths, testEnv } from "./helpers.ts";

/** What this item adds to the module, reached so that the file loads before it exists. */
interface Row {
  names: string[];
  valued: string[];
  acts?: string[][];
  anyWord?: string[];
  reads?: string[];
  whole?: true;
  flagged?: { path: string[]; flags: string[] }[];
}
const m = actingModule as unknown as {
  ACTING_TOOLS: readonly Row[];
  actingOf(words: readonly string[], viaXargs?: boolean): string | null;
  actingAsk(list: string): string;
  actingDeny(list: string, nobody: string): string;
  acting: { of(words: readonly string[], viaXargs?: boolean): string | null };
};
/** The policy's key, read and set before the type holds it. */
const keyOf = (policy: unknown) => (policy as { actingCommands?: string }).actingCommands;
const turnOn = (ctx: HookContext) => {
  (ctx.policy as unknown as { actingCommands?: string }).actingCommands = "ask";
};
const REPO = join(import.meta.dir, "..", "..", "..");
const CANNOT = "with a verb the guard cannot read";

/** Every acting form of every row: the command line and the text it gives. */
const ACTING: [string, string][] = [
  ["terraform apply", "terraform apply"],
  ["terraform destroy", "terraform destroy"],
  ["tofu apply", "tofu apply"],
  ["tofu destroy", "tofu destroy"],
  ["pulumi up", "pulumi up"],
  ["pulumi update", "pulumi update"],
  ["pulumi destroy", "pulumi destroy"],
  ["kubectl apply -f x", "kubectl apply"],
  ["kubectl delete pod x", "kubectl delete"],
  ["kubectl replace -f x", "kubectl replace"],
  ["kubectl patch deploy x", "kubectl patch"],
  ["kubectl scale deploy x", "kubectl scale"],
  ["kubectl create ns x", "kubectl create"],
  ["kubectl set image deploy/x a=b", "kubectl set"],
  ["kubectl rollout restart deploy/x", "kubectl rollout restart"],
  ["kubectl rollout undo deploy/x", "kubectl rollout undo"],
  ["helm install x y", "helm install"],
  ["helm upgrade x y", "helm upgrade"],
  ["helm uninstall x", "helm uninstall"],
  ["helm delete x", "helm delete"],
  ["helm rollback x", "helm rollback"],
  ["helm push x y", "helm push"],
  ["aws cloudformation deploy --stack-name x", "aws cloudformation deploy"],
  ["aws cloudformation create-stack", "aws cloudformation create-stack"],
  ["aws cloudformation update-stack", "aws cloudformation update-stack"],
  ["aws cloudformation delete-stack", "aws cloudformation delete-stack"],
  ["aws cloudformation execute-change-set", "aws cloudformation execute-change-set"],
  ["aws deploy create-deployment", "aws deploy create-deployment"],
  ["aws deploy stop-deployment", "aws deploy stop-deployment"],
  ["cdk deploy", "cdk deploy"],
  ["cdk destroy", "cdk destroy"],
  ["az deployment group create -g x", "az deployment create"],
  ["az deployment sub delete", "az deployment delete"],
  ["gcloud run deploy svc", "gcloud deploy"],
  ["gcloud a b c d e deploy", "gcloud deploy"],
  ["ansible-playbook site.yml", "ansible-playbook"],
  ["ansible-playbook --check site.yml", "ansible-playbook"],
  ["wrangler deploy", "wrangler deploy"],
  ["wrangler publish", "wrangler publish"],
  ["wrangler rollback", "wrangler rollback"],
  ["wrangler delete", "wrangler delete"],
  ["wrangler versions deploy", "wrangler versions deploy"],
  ["wrangler pages deploy dist", "wrangler pages deploy"],
  ["vercel", "vercel"],
  ["vercel --prod", "vercel"],
  ["vc --prod", "vc"],
  ["vercel promote x", "vercel"],
  ["vercel ./dist --prod", "vercel"],
  ["vercel -e API_KEY=secret-of-the-test --prod", "vercel"],
  ["vercel env ls", "vercel"],
  ["netlify deploy", "netlify deploy"],
  ["ntl deploy", "ntl deploy"],
  ["fly deploy", "fly deploy"],
  ["flyctl deploy", "flyctl deploy"],
  ["kamal deploy", "kamal deploy"],
  ["kamal redeploy", "kamal redeploy"],
  ["kamal rollback v1", "kamal rollback"],
  ["kamal remove", "kamal remove"],
  ["kamal setup", "kamal setup"],
  ["docker push x", "docker push"],
  ["docker image push x", "docker image push"],
  ["docker compose push", "docker compose push"],
  ["docker manifest push x", "docker manifest push"],
  ["docker build --push .", "docker build --push"],
  ["docker buildx build --push .", "docker buildx build --push"],
  ["npm publish", "npm publish"],
  ["npm unpublish x", "npm unpublish"],
  ["pnpm publish", "pnpm publish"],
  ["yarn publish", "yarn publish"],
  ["yarn npm publish", "yarn npm publish"],
  ["bun publish", "bun publish"],
  ["cargo publish", "cargo publish"],
  ["cargo yank", "cargo yank"],
  ["twine upload dist/*", "twine upload"],
  ["uv publish", "uv publish"],
  ["poetry publish", "poetry publish"],
  ["gem push x", "gem push"],
  ["gem yank x", "gem yank"],
  ["gh release create v1", "gh release create"],
  ["gh release delete v1", "gh release delete"],
  ["gh workflow run x", "gh workflow run"],
  ["gh run rerun 1", "gh run rerun"],
  ["eas submit", "eas submit"],
  ["eas update", "eas update"],
  ["eas deploy", "eas deploy"],
  ["eas build --auto-submit", "eas build --auto-submit"],
  ["promptfoo share", "promptfoo share"],
  ["promptfoo eval --share", "promptfoo eval --share"],
  ["promptfoo eval --remote", "promptfoo eval --remote"],
  ["promptfoo eval --share=true", "promptfoo eval --share"],
  ["az deployment $S create -g x", "az deployment create"],
];

/** Command lines that give null. */
const READING: string[] = [
  "terraform plan",
  "terraform -chdir=infra plan",
  "terraform plan -var x=$Y",
  "terraform frobnicate",
  "tofu validate",
  "pulumi preview",
  "kubectl get pods",
  "kubectl get pods $POD",
  "kubectl diff -f x",
  "kubectl logs -l app=deploy",
  "kubectl -n apply get pods",
  "kubectl rollout status deploy/x",
  "kubectl expose deploy x60",
  "helm template x",
  "helm lint charts/*",
  "aws s3 ls",
  "aws deploy get-deployment",
  "aws s3 cp ./dist/* s3://b",
  "cdk diff",
  "az deployment group what-if",
  "gcloud run services list",
  "gcloud a b c d e f deploy",
  "wrangler dev",
  "wrangler pages dev",
  "vercel dev",
  "vercel --version",
  "vercel -v",
  "vercel --help",
  "vercel -h",
  "vercel logs x",
  "netlify build",
  "fly status",
  "docker build .",
  "docker build -t app:$TAG .",
  "docker buildx build .",
  "npm install",
  "npm install $PKG",
  "npm run deploy",
  "pnpm install",
  "pnpm exec eslint .",
  "yarn install",
  "bun test tests/*.test.ts",
  "cargo build",
  "uv run pytest tests/test_*.py",
  "gh release list",
  "gh pr merge 1",
  "gh pr view $N",
  "gh api repos/{owner}/{repo}/pulls",
  "eas build",
  "promptfoo eval",
  "git push origin main",
  "ls",
];

const words = (line: string) => line.split(" ").filter(Boolean);

test("AC-10: every acting form of every row gives its text, and every reading form null", () => {
  for (const [line, text] of ACTING) expect([line, m.actingOf(words(line))]).toEqual([line, text]);
  for (const line of READING) expect([line, m.actingOf(words(line))]).toEqual([line, null]);
  expect(m.actingOf([])).toBeNull();
  // A flag of an acting verb changes nothing.
  expect(m.actingOf(words("npm publish --dry-run"))).toBe("npm publish");
  expect(m.actingOf(words("kubectl apply --dry-run=server -f x"))).toBe("kubectl apply");
  expect(m.actingOf(words("terraform apply -auto-approve"))).toBe("terraform apply");
});

test("AC-10: an option before the verb, plain and valued, attached and apart", () => {
  const cases: [string, string][] = [
    ["terraform -chdir=infra apply", "terraform apply"],
    ["kubectl -n prod apply -f x", "kubectl apply"],
    ["kubectl --context=prod apply", "kubectl apply"],
    ["kubectl --context prod --namespace x delete pod y", "kubectl delete"],
    ["kubectl --insecure-skip-tls-verify apply -f x", "kubectl apply"],
    ["aws --profile p --region r cloudformation deploy", "aws cloudformation deploy"],
    ["npm --workspace web publish", "npm publish"],
    ["npm --silent publish", "npm publish"],
    ["helm --kube-context prod upgrade x y", "helm upgrade"],
    ["/usr/local/bin/terraform apply", "terraform apply"],
    ["TERRAFORM.EXE apply", "terraform apply"],
  ];
  for (const [line, text] of cases) expect([line, m.actingOf(words(line))]).toEqual([line, text]);
});

test("AC-10: every valued option of every row takes its value with it", () => {
  // Written here and not read from the table: an option dropped from a row is a red.
  const VALUED: Record<string, string> = {
    pulumi: "-s --stack -C --cwd --color -v",
    kubectl:
      "-n --namespace --context --kubeconfig --cluster --user -s --server --as --as-group --as-uid --token --request-timeout --certificate-authority --client-certificate --client-key --tls-server-name --cache-dir -v",
    helm: "-n --namespace --kube-context --kubeconfig --kube-apiserver --kube-token --kube-as-user --registry-config --repository-config",
    aws: "--profile --region --endpoint-url --output --query --color --ca-bundle --cli-read-timeout --cli-connect-timeout",
    cdk: "--profile -a --app -c --context -o --output",
    az: "--subscription -o --output --query",
    gcloud:
      "--project --account --configuration --region --zone --format --impersonate-service-account --verbosity --billing-project",
    wrangler: "-c --config -e --env --cwd",
    vercel: "--cwd -t --token -S --scope -T --team -A --local-config -Q --global-config",
    netlify: "--auth --filter",
    fly: "-a --app -c --config -t --access-token",
    kamal: "-c --config-file -d --destination -h --hosts -r --roles",
    docker: "--context -c --config -H --host -l --log-level",
    npm: "-w --workspace --prefix --registry --userconfig",
    pnpm: "-C --dir --filter -F",
    yarn: "--cwd",
    bun: "--cwd",
    cargo: "--manifest-path --color --config -Z",
    uv: "--directory --project",
    poetry: "-C --directory -P --project",
    gh: "-R --repo",
  };
  expect(m.ACTING_TOOLS.filter((row) => row.valued.length).map((row) => row.names[0])).toEqual(
    Object.keys(VALUED),
  );
  for (const row of m.ACTING_TOOLS) {
    const [name] = row.names;
    for (const option of (VALUED[name ?? ""] ?? "").split(" ").filter(Boolean)) {
      const line = (rest: string) => [name ?? "", option, ...rest.split(" ")];
      const said = [name, option];
      if (row.acts) {
        // The value would be the first positional word and break the path.
        const path = (row.acts[0] ?? []).map((part) => (part === "*" ? "x" : part));
        const text = `${name} ${(row.acts[0] ?? []).filter((part) => part !== "*").join(" ")}`;
        expect([said, m.actingOf(line(`zzz ${path.join(" ")}`))]).toEqual([said, text]);
      } else if (row.anyWord) {
        // The value would be read as the acting word.
        expect([said, m.actingOf(line(`${row.anyWord[0]} x`))]).toEqual([said, null]);
      } else if (row.reads) {
        // The value would be the first word, which is no read.
        expect([said, m.actingOf(line(`zzz ${row.reads[0]}`))]).toEqual([said, null]);
      }
    }
  }
  // A command word that is a name every object has is no runner and no tool.
  for (const word of ["constructor", "toString", "valueOf", "__proto__"])
    expect([word, m.actingOf([word, "exec", "x"])]).toEqual([word, null]);
});

test("AC-10: a runner is read through to the tool it runs", () => {
  expect(m.actingOf(words("npx vercel --prod"))).toBe("vercel");
  for (const line of [
    "npx -y wrangler@latest deploy",
    "npx --package wrangler wrangler deploy",
    "npx -- wrangler deploy",
    "npx.cmd wrangler deploy",
    "bunx wrangler deploy",
    "pnpx wrangler deploy",
    "pnpm dlx wrangler deploy",
    "pnpm exec wrangler deploy",
    "pnpm --filter web exec wrangler deploy",
    "pnpm -C app dlx wrangler deploy",
    "yarn dlx wrangler deploy",
    "npm exec wrangler deploy",
    "npm exec -- wrangler deploy",
    "npm exec --yes -- wrangler deploy",
    "npm exec --package=wrangler -- wrangler deploy",
    "npm x wrangler deploy",
    "bun x wrangler deploy",
    "npx @scope/wrangler@4 deploy",
  ])
    expect([line, m.actingOf(words(line))]).toEqual([line, "wrangler deploy"]);
  // A runner with no package word runs nothing the table names.
  expect(m.actingOf(["npx"])).toBeNull();
  expect(m.actingOf(["npm", "exec"])).toBeNull();
  // npx's own line is handed on by the hook's walk and read there.
  expect(m.actingOf(["npx", "-c", "wrangler deploy"])).toBeNull();
  // A line the walk does not hand on cannot be read, whatever stands after it.
  const line = "with a command the guard cannot read";
  expect(m.actingOf(["pnpx", "-c", "wrangler deploy"])).toBe(`pnpx ${line}`);
  expect(m.actingOf(["npm", "exec", "-c", "npm publish"])).toBe(`npm exec ${line}`);
  expect(m.actingOf(["npm", "exec", "-c", "npm publish", "x"])).toBe(`npm exec ${line}`);
  expect(m.actingOf(["pnpm", "dlx", "--call", "x"])).toBe(`pnpm dlx ${line}`);
  expect(m.actingOf(["/opt/bin/pnpx", "--call=x"])).toBe(`pnpx ${line}`);
  expect(m.actingOf(["npx"], true)).toBe(`npx ${line}`);
});

test("AC-10: the table's rows are well formed, and each name has an acting line", () => {
  const seen = new Set<string>();
  for (const row of m.ACTING_TOOLS) {
    expect(row.names.length).toBeGreaterThan(0);
    const forms = [row.acts, row.anyWord, row.reads, row.whole].filter((f) => f !== undefined);
    expect([row.names[0], forms.length <= 1]).toEqual([row.names[0], true]);
    expect([row.names[0], forms.length + (row.flagged ? 1 : 0) > 0]).toEqual([row.names[0], true]);
    for (const name of row.names) {
      expect([name, seen.has(name)]).toEqual([name, false]);
      seen.add(name);
      expect([name, ACTING.some(([line]) => words(line)[0] === name)]).toEqual([name, true]);
    }
  }
  expect(m.ACTING_TOOLS).toHaveLength(27);
});

test("AC-14: a verb that cannot be read, at a position the row reads", () => {
  for (const [line, program] of [
    ["terraform $CMD", "terraform"],
    ["kubectl {apply,get} -f x", "kubectl"],
    ["kubectl @(apply|get) -f x", "kubectl"],
    ["kubectl `echo apply` -f x", "kubectl"],
    ["kubectl rollout $V", "kubectl"],
    ["terraform [a]pply", "terraform"],
    ["kubectl app*", "kubectl"],
    ["kubectl appl?", "kubectl"],
    ["tofu *", "tofu"],
    ["aws cloudformation $V", "aws"],
    ["az deployment group $V", "az"],
    ["gcloud run $X", "gcloud"],
    ["vercel $X", "vercel"],
  ] as const)
    expect([line, m.actingOf(words(line))]).toEqual([line, `${program} ${CANNOT}`]);
  // Words through xargs stand after the last word given.
  expect(m.actingOf(["terraform"], true)).toBe(`terraform ${CANNOT}`);
  expect(m.actingOf(["kubectl", "rollout"], true)).toBe(`kubectl ${CANNOT}`);
  expect(m.actingOf(["vercel"], true)).toBe(`vercel ${CANNOT}`);
  expect(m.actingOf(["ansible-playbook"], true)).toBe("ansible-playbook");
  expect(m.actingOf(["gcloud", "run"], true)).toBe(`gcloud ${CANNOT}`);
  expect(m.actingOf(["gcloud", "a", "b", "c", "d", "e", "f"], true)).toBeNull();
  expect(m.actingOf(["terraform", "fmt"], true)).toBeNull();
  expect(m.actingOf(["npm", "install"], true)).toBeNull();
  expect(m.actingOf(["npm", "publish"], true)).toBe("npm publish");
});

/** A repository with crew active and an item in build, so that source edits pass. */
function project(policy: Record<string, unknown> | null = null, env = testEnv()) {
  const root = makeRepo({
    "package.json": JSON.stringify({ scripts: { test: "exit 0" } }),
    "src/a.ts": "x",
  });
  mkdirSync(join(root, ".crew"), { recursive: true });
  if (policy) writeFileSync(join(root, ".crew", "policy.json"), JSON.stringify(policy));
  return { root, ctx: hookContext({ session_id: "s", cwd: root }, env) };
}
type Answer = {
  hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string };
};
const decision = (r: unknown) => (r as Answer).hookSpecificOutput?.permissionDecision;
const reason = (r: unknown) => (r as Answer).hookSpecificOutput?.permissionDecisionReason;
const bash = (ctx: HookContext, command: string, permission_mode = "default") =>
  onPreToolUse(ctx, { tool_name: "Bash", tool_input: { command }, permission_mode });

const powershell = (ctx: HookContext, command: string, permission_mode = "default") =>
  onPreToolUse(ctx, {
    tool_name: "Bash",
    tool_input: { command, shell: "powershell" },
    permission_mode,
  });
/** A PowerShell line whose text the hook cannot read, with an acting command in what it can. */
const HIDDEN = "terraform apply; iex $cmd";

const ASK_TERRAFORM =
  "Crew: terraform apply is a person's decision in this project (policy actingCommands): it can deploy, apply, destroy or publish outside this machine, and the guard cannot tell an act from a read for it, nor production from a preview. A yes here is that decision, for the whole line. Where nobody answers, stop, and do not run it in another form.";

test("AC-19: the key is off by default, loads as off for any other word, and is the person's to set", async () => {
  expect(keyOf(DEFAULT_POLICY)).toBe("off");
  const odd = project({ actingCommands: "always" });
  expect(keyOf(loadPolicy(repoPaths(odd.root, testEnv())).policy)).toBe("off");
  const on = project({ actingCommands: "ask" });
  expect(keyOf(loadPolicy(repoPaths(on.root, testEnv())).policy)).toBe("ask");
  const set = project();
  const paths = repoPaths(set.root, testEnv());
  expect("refused" in setPolicyValue(paths, "actingCommands", "ask")).toBe(false);
  expect(keyOf(loadPolicy(paths).policy)).toBe("ask");
  expect("refused" in setPolicyValue(paths, "actingCommands", "always")).toBe(true);
  // A value that is a name every object has is refused and records nothing.
  const odd2 = project();
  const o = cliIo(odd2.root, testEnv());
  for (const value of ["toString", "constructor"])
    expect((await o("policy", "set", "actingCommands", value)).code).toBe(1);
  expect(existsSync(join(odd2.root, ".crew", "decisions.json"))).toBe(false);
  // A write that is refused after the entry (the file changed outside the engine) is recorded as not written.
  const tampered = project({ actingCommands: "off" });
  const t = cliIo(tampered.root, testEnv());
  expect((await t("policy", "set", "actingCommands", "ask")).code).toBe(0);
  writeFileSync(join(tampered.root, ".crew", "policy.json"), '{"actingCommands":"ask","x":1}');
  expect((await t("policy", "set", "actingCommands", "off")).code).toBe(1);
  // The register cannot be listed while the policy file stands changed; its file holds the entry.
  const register = readFileSync(join(tampered.root, ".crew", "decisions.json"), "utf8");
  expect(register).toContain("actingCommands set to off");
  expect(register).toContain("actingCommands: not written, ");
  // Through the command: each change is on the project's decision register as the user's.
  const cli = project();
  const c = cliIo(cli.root, testEnv());
  expect((await c("policy", "set", "actingCommands", "ask")).code).toBe(0);
  expect((await c("policy", "set", "actingCommands", "off")).code).toBe(0);
  const listed = (await c("decisions", "--grep", "actingCommands")).out;
  expect(listed).toContain("actingCommands set to ask");
  expect(listed).toContain("actingCommands set to off");
  expect(listed.match(/the user/g)?.length).toBeGreaterThanOrEqual(2);
  expect((await c("policy", "set", "actingCommands", "always")).code).toBe(1);
  expect((await c("decisions", "--grep", "actingCommands")).out.match(/set to/g)).toHaveLength(2);
});

test("AC-19: turning the key is asked of the person in every policy, and with the key off nothing is asked", () => {
  for (const policy of [{ attendedDecisions: "prompt" }, { attendedDecisions: "relay" }]) {
    const { ctx } = project(policy);
    expect(decision(bash(ctx, "crew policy set actingCommands off"))).toBe("ask");
    expect(decision(bash(ctx, "crew policy set actingCommands off", "dontAsk"))).toBe("deny");
  }
  const { ctx } = project();
  for (const mode of ["default", "dontAsk"]) {
    expect(bash(ctx, "terraform apply", mode)).toEqual({});
    expect(bash(ctx, "npm publish", mode)).toEqual({});
  }
});

test("AC-12: with the key on and a person present, an acting line is asked, once, with every command named", () => {
  const { ctx } = project();
  turnOn(ctx);
  for (const mode of ["default", "acceptEdits", "plan", "auto"]) {
    const answer = bash(ctx, "terraform apply -auto-approve", mode);
    expect([mode, decision(answer)]).toEqual([mode, "ask"]);
    expect(reason(answer)).toBe(ASK_TERRAFORM);
  }
  expect(m.actingAsk("terraform apply")).toBe(ASK_TERRAFORM);
  const named = (command: string) => {
    const answer = bash(ctx, command);
    expect([command, decision(answer)]).toEqual([command, "ask"]);
    return reason(answer) ?? "";
  };
  expect(named("kubectl -n prod apply -f k8s/ && npm publish")).toStartWith(
    "Crew: kubectl apply and npm publish is a person's decision",
  );
  expect(named("terraform apply; npm publish; gh release create v1")).toStartWith(
    "Crew: terraform apply, npm publish, and gh release create is a person's decision",
  );
  expect(named("sudo terraform apply")).toBe(ASK_TERRAFORM);
  expect(named("out=$(npm publish)")).toBe(m.actingAsk("npm publish"));
  expect(named('sh -c "npm publish"')).toBe(m.actingAsk("npm publish"));
  expect(named("npm publish; npm publish")).toBe(m.actingAsk("npm publish"));
  expect(named("echo apply | xargs terraform")).toBe(m.actingAsk(`terraform ${CANNOT}`));
  expect(named("kubectl rollout $V")).toBe(m.actingAsk(`kubectl ${CANNOT}`));
  expect(bash(ctx, "ls && terraform plan")).toEqual({});
  expect(bash(ctx, "find . | xargs terraform fmt")).toEqual({});
  for (const line of READING.filter((l) => /[$`{[(*?]/.test(l)))
    expect([line, bash(ctx, line)]).toEqual([line, {}]);
});

test("AC-12: relay does not silence the ask, a deny wins over it, and a crew command's ask is joined to it", () => {
  const relay = project({ attendedDecisions: "relay" });
  turnOn(relay.ctx);
  expect(reason(bash(relay.ctx, "terraform apply"))).toBe(ASK_TERRAFORM);
  // A line that also earns a deny is denied, with the reason it has with the key off.
  const off = project({ attendedDecisions: "prompt" });
  const work = createWork(off.ctx.paths, "feature");
  work.phase = "build";
  saveWork(off.ctx.paths, work);
  const write = `terraform apply > .crew/work/${work.id}/work.json`;
  const before = bash(off.ctx, write);
  expect(decision(before)).toBe("deny");
  turnOn(off.ctx);
  expect(bash(off.ctx, write)).toEqual(before);
  // One ask that holds the crew command's reason and then the acting one.
  const crewAsk = reason(bash(off.ctx, `crew approve ${work.id} spec`));
  expect(crewAsk).toBeDefined();
  const both = bash(off.ctx, `crew approve ${work.id} spec && npm publish`);
  expect(decision(both)).toBe("ask");
  expect(reason(both)).toBe(`${crewAsk} ${m.actingAsk("npm publish")}`);
  // A line the reader could not close, and a PowerShell line the hook cannot read, are answered
  // as they are with the key off.
  const plain = project({ attendedDecisions: "prompt" });
  const unclosed = bash(plain.ctx, "terraform apply 'x");
  const hidden = powershell(plain.ctx, HIDDEN);
  expect(decision(hidden)).toBe("ask");
  turnOn(plain.ctx);
  expect(bash(plain.ctx, "terraform apply 'x")).toEqual(unclosed);
  expect(powershell(plain.ctx, HIDDEN)).toEqual(hidden);
  expect(reason(powershell(plain.ctx, "terraform apply"))).toBe(ASK_TERRAFORM);
});

test("AC-13: with the key on and nobody present, an acting line is denied and says what to do", () => {
  const deny = (nobody: string) =>
    `Crew: wrangler deploy is a person's decision in this project (policy actingCommands) and nobody is here to give it (${nobody}): stop, and do not run it in another form (a script, a package's script, another runner); say so to the user, who runs it themselves or asks again from a session that can be asked`;
  const { ctx } = project();
  turnOn(ctx);
  for (const mode of ["bypassPermissions", "dontAsk"]) {
    const answer = bash(ctx, "npx wrangler@latest deploy", mode);
    expect([mode, decision(answer)]).toEqual([mode, "deny"]);
    expect(reason(answer)).toBe(deny(`${mode} mode`));
  }
  expect(m.actingDeny("wrangler deploy", "dontAsk mode")).toBe(deny("dontAsk mode"));
  const headless = project(null, { ...testEnv(), CLAUDE_CODE_SESSION_ATTENDED: "0" });
  turnOn(headless.ctx);
  const answer = bash(headless.ctx, "npx wrangler@latest deploy");
  expect(decision(answer)).toBe("deny");
  expect(reason(answer)).toBe(deny("a headless session in default mode"));
  expect(decision(bash(ctx, "terraform $CMD", "dontAsk"))).toBe("deny");
  expect(reason(bash(ctx, "terraform $CMD", "dontAsk"))).toContain(`terraform ${CANNOT}`);
  expect(bash(ctx, "terraform plan -var x=$Y", "dontAsk")).toEqual({});
  // A line the reader could not close, and a PowerShell line the hook cannot read, are answered
  // as they are with the key off.
  const plain = project();
  const unclosed = bash(plain.ctx, "terraform apply 'x", "dontAsk");
  const hidden = powershell(plain.ctx, HIDDEN, "dontAsk");
  expect(decision(hidden)).toBe("deny");
  turnOn(plain.ctx);
  expect(bash(plain.ctx, "terraform apply 'x", "dontAsk")).toEqual(unclosed);
  expect(powershell(plain.ctx, HIDDEN, "dontAsk")).toEqual(hidden);
  // A crew word the reader cannot place: the line's own deny, not the table's.
  const unplaced = project();
  const crewWord = powershell(unplaced.ctx, "terraform apply; echo crew", "dontAsk");
  expect(decision(crewWord)).toBe("deny");
  turnOn(unplaced.ctx);
  expect(powershell(unplaced.ctx, "terraform apply; echo crew", "dontAsk")).toEqual(crewWord);
});

const BRANCH = "crew/2026-10-15-042/T-2";
/** A session opened by mail, and the same checkout as a journey's session. */
function opened(kind: "mail" | "journey", on: boolean) {
  const { root } = project();
  git(root, "checkout", "-q", "-b", BRANCH);
  const ctx = hookContext(
    { session_id: "s", cwd: root },
    {
      ...testEnv(),
      WIZARDINGCODE_CREW_MAIL_ID: "M-2026-10-15-001-storefront",
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
  const ending = kind === "journey" ? "crew journey part <id> wait P-n" : "crew mail reply";
  return { root, ctx, ending };
}

test("AC-20: an opened session is denied every acting line of the table, whatever the key, and no reading line", () => {
  for (const kind of ["mail", "journey"] as const)
    for (const on of [false, true]) {
      const { ctx, ending } = opened(kind, on);
      for (const [line, text] of ACTING) {
        const answer = bash(ctx, line, "dontAsk");
        expect([kind, on, line, decision(answer)]).toEqual([kind, on, line, "deny"]);
        const said = reason(answer) ?? "";
        expect(said).toContain("never merges, pushes to another branch, releases or deploys: ");
        expect(said).toContain(ending);
        if (openedSessionDenial(line, BRANCH) === null)
          expect([line, said.includes(`: ${text} is denied; `)]).toEqual([line, true]);
      }
      for (const line of READING.filter((l) => openedSessionDenial(l, BRANCH) === null))
        expect([kind, on, line, bash(ctx, line, "dontAsk")]).toEqual([kind, on, line, {}]);
      expect(decision(bash(ctx, "echo apply | xargs tofu", "dontAsk"))).toBe("deny");
    }
});

test("AC-20: a throw of the function the hook calls loses its answer and no standing rule", () => {
  const real = m.acting.of;
  let calls = 0;
  m.acting.of = () => {
    calls++;
    throw new Error("the table broke");
  };
  try {
    const { root, ctx } = opened("mail", true);
    expect(decision(bash(ctx, "cd ..", "dontAsk"))).toBe("deny");
    expect(decision(bash(ctx, "git push origin main", "dontAsk"))).toBe("deny");
    const file = join(root, ".crew", "work", "w1", "work.json");
    expect(decision(bash(ctx, `echo x > ${file}`, "dontAsk"))).toBe("deny");
    const before = calls;
    expect(bash(ctx, "tofu destroy", "dontAsk")).toEqual({});
    expect(calls).toBeGreaterThan(before);
    const plain = project();
    turnOn(plain.ctx);
    const seen = calls;
    expect(bash(plain.ctx, "terraform apply")).toEqual({});
    expect(calls).toBeGreaterThan(seen);
    expect(decision(bash(plain.ctx, "echo x > .crew/work/w1/work.json"))).toBe("deny");
  } finally {
    m.acting.of = real;
  }
});

test("AC-16: a command of 20,000 option words before its verb is read in under a second", () => {
  const line = ["kubectl", ...Array<string>(20_000).fill("--insecure-skip-tls-verify"), "apply"];
  const started = performance.now();
  expect(m.actingOf(line)).toBe("kubectl apply");
  expect(performance.now() - started).toBeLessThan(1000);
});

const RULE_2 =
  "; where a project's policy sets `actingCommands` to `ask`, the hook asks the person before a command that deploys, applies, destroys or publishes, and denies it where nobody is present, a reminder and not a boundary (ADR 0026)";
const LIMITS = [
  "reminder",
  "yarn <bin>",
  "other changing verbs",
  "unknown subcommand",
  "asks on reads",
  "valued",
  "no record",
  "bypassPermissions",
  "program",
  "allow rule",
  "serverless deploy",
  "scripts/release.ts",
];

test("AC-21: the ADR says the rule and its twelve limits, and rule 2 names the key", () => {
  const file = join(
    REPO,
    "docs",
    "adr",
    "0026-an-acting-command-is-asked-where-a-project-says-so.md",
  );
  expect(existsSync(file)).toBe(true);
  const adr = readFileSync(file, "utf8");
  expect(adr.split("\n")[0]).toBe("# 0026. An acting command is asked where a project says so");
  expect(adr.match(/^## .*$/gm)).toEqual([
    "## Context",
    "## Decision",
    "## What the rule does not hold",
    "## Consequences",
  ]);
  const section = (heading: string) => (adr.split(`${heading}\n`)[1] ?? "").split("\n## ")[0] ?? "";
  expect(section("## Decision")).toContain("not read on a page");
  const bullets = section("## What the rule does not hold")
    .split("\n")
    .filter((l) => l.startsWith("- "));
  expect(bullets).toHaveLength(LIMITS.length);
  LIMITS.forEach((word, i) => {
    expect([word, bullets[i]?.includes(word)]).toEqual([word, true]);
  });
  const rules = readFileSync(
    join(REPO, "plugins", "core", "skills", "crew", "references", "rules.md"),
    "utf8",
  );
  const rule2 = rules.split("\n").find((l) => l.startsWith("2. ")) ?? "";
  expect(rule2).toContain(`and rule 20 today${RULE_2}; the e2e gate`);
});
