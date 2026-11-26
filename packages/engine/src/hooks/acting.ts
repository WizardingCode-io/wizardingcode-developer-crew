import { EXPANSION_CHARS, PATTERN_CHARS, runnerOptions } from "../shell-words.ts";

/**
 * One tool whose commands can change something outside the machine (ADR 0026): its names, its
 * options that take the next word as their value, and what acts. `acts` are paths of subcommand
 * words, `*` standing for any one word; `anyWord` acts at any position among the words read;
 * `reads` are the first words that do not act, for a tool that acts with no subcommand; `whole`
 * means every use acts; `flagged` is a path with the flags that make it act; `images` are the
 * container images whose `run` acts, read in every word after it (item 2026-11-26-006).
 */
export interface ActingTool {
  names: string[];
  valued: string[];
  acts?: string[][];
  anyWord?: string[];
  reads?: string[];
  whole?: true;
  flagged?: { path: string[]; flags: string[] }[];
  images?: string[];
}

/** Paths of one word each. */
const verbs = (...names: string[]): string[][] => names.map((name) => [name]);

/**
 * The table. A row lists the verbs that deploy, apply, destroy, delete, publish or push: a tool's
 * other changing verbs, and an unknown subcommand, pass (ADR 0026 says which). Part of the verbs
 * and every valued option were not read on the tool's own page; the ADR says which were.
 */
export const ACTING_TOOLS: readonly ActingTool[] = [
  { names: ["terraform", "tofu"], valued: [], acts: verbs("apply", "destroy") },
  {
    names: ["pulumi"],
    valued: ["-s", "--stack", "-C", "--cwd", "--color", "-v"],
    acts: verbs("up", "update", "destroy"),
  },
  {
    names: ["kubectl"],
    valued: [
      "-n",
      "--namespace",
      "--context",
      "--kubeconfig",
      "--cluster",
      "--user",
      "-s",
      "--server",
      "--as",
      "--as-group",
      "--as-uid",
      "--token",
      "--request-timeout",
      "--certificate-authority",
      "--client-certificate",
      "--client-key",
      "--tls-server-name",
      "--cache-dir",
      "-v",
    ],
    acts: [
      ...verbs("apply", "delete", "replace", "patch", "scale", "create", "set"),
      ["rollout", "restart"],
      ["rollout", "undo"],
    ],
  },
  {
    names: ["helm"],
    valued: [
      "-n",
      "--namespace",
      "--kube-context",
      "--kubeconfig",
      "--kube-apiserver",
      "--kube-token",
      "--kube-as-user",
      "--registry-config",
      "--repository-config",
    ],
    acts: verbs("install", "upgrade", "uninstall", "delete", "rollback", "push"),
  },
  {
    names: ["aws"],
    valued: [
      "--profile",
      "--region",
      "--endpoint-url",
      "--output",
      "--query",
      "--color",
      "--ca-bundle",
      "--cli-read-timeout",
      "--cli-connect-timeout",
    ],
    acts: [
      ["cloudformation", "deploy"],
      ["cloudformation", "create-stack"],
      ["cloudformation", "update-stack"],
      ["cloudformation", "delete-stack"],
      ["cloudformation", "execute-change-set"],
      ["deploy", "create-deployment"],
      ["deploy", "stop-deployment"],
    ],
  },
  {
    names: ["cdk"],
    valued: ["--profile", "-a", "--app", "-c", "--context", "-o", "--output"],
    acts: verbs("deploy", "destroy"),
  },
  {
    names: ["az"],
    valued: ["--subscription", "-o", "--output", "--query"],
    acts: [
      ["deployment", "*", "create"],
      ["deployment", "*", "delete"],
    ],
  },
  {
    names: ["gcloud"],
    valued: [
      "--project",
      "--account",
      "--configuration",
      "--region",
      "--zone",
      "--format",
      "--impersonate-service-account",
      "--verbosity",
      "--billing-project",
    ],
    anyWord: ["deploy"],
  },
  { names: ["ansible-playbook"], valued: [], whole: true },
  {
    names: ["wrangler"],
    valued: ["-c", "--config", "-e", "--env", "--cwd"],
    acts: [
      ...verbs("deploy", "publish", "rollback", "delete"),
      ["versions", "deploy"],
      ["pages", "deploy"],
    ],
  },
  {
    names: ["vercel", "vc"],
    valued: [
      "--cwd",
      "-t",
      "--token",
      "-S",
      "--scope",
      "-T",
      "--team",
      "-A",
      "--local-config",
      "-Q",
      "--global-config",
    ],
    reads: [
      "dev",
      "build",
      "pull",
      "link",
      "login",
      "logout",
      "whoami",
      "list",
      "ls",
      "inspect",
      "logs",
      "help",
      "switch",
    ],
  },
  { names: ["netlify", "ntl"], valued: ["--auth", "--filter"], acts: verbs("deploy") },
  {
    names: ["fly", "flyctl"],
    valued: ["-a", "--app", "-c", "--config", "-t", "--access-token"],
    acts: verbs("deploy"),
  },
  {
    names: ["kamal"],
    valued: ["-c", "--config-file", "-d", "--destination", "-h", "--hosts", "-r", "--roles"],
    acts: verbs("deploy", "redeploy", "rollback", "remove", "setup"),
  },
  {
    names: ["docker"],
    valued: ["--context", "-c", "--config", "-H", "--host", "-l", "--log-level"],
    acts: [["push"], ["image", "push"], ["compose", "push"], ["manifest", "push"]],
    // The images of the tools that send requests to a running application, as their pages name them (2026-11-26).
    images: [
      "ghcr.io/zaproxy/zaproxy",
      "zaproxy/zap-stable",
      "zaproxy/zap-weekly",
      "zaproxy/zap-nightly",
      "zaproxy/zap-bare",
      "projectdiscovery/nuclei",
      "drwetter/testssl.sh",
      "ghcr.io/testssl/testssl.sh",
      "ghcr.io/schemathesis/schemathesis",
      "schemathesis/schemathesis",
      "grafana/k6",
    ],
    flagged: [
      { path: ["build"], flags: ["--push"] },
      { path: ["buildx", "build"], flags: ["--push"] },
    ],
  },
  {
    names: ["npm"],
    valued: ["-w", "--workspace", "--prefix", "--registry", "--userconfig"],
    acts: verbs("publish", "unpublish"),
  },
  { names: ["pnpm"], valued: ["-C", "--dir", "--filter", "-F"], acts: verbs("publish") },
  { names: ["yarn"], valued: ["--cwd"], acts: [["publish"], ["npm", "publish"]] },
  { names: ["bun"], valued: ["--cwd"], acts: verbs("publish") },
  {
    names: ["cargo"],
    valued: ["--manifest-path", "--color", "--config", "-Z"],
    acts: verbs("publish", "yank"),
  },
  { names: ["twine"], valued: [], acts: verbs("upload") },
  { names: ["uv"], valued: ["--directory", "--project"], acts: verbs("publish") },
  {
    names: ["poetry"],
    valued: ["-C", "--directory", "-P", "--project"],
    acts: verbs("publish"),
  },
  { names: ["gem"], valued: [], acts: verbs("push", "yank") },
  {
    names: ["gh"],
    valued: ["-R", "--repo"],
    acts: [
      ["release", "create"],
      ["release", "delete"],
      ["workflow", "run"],
      ["run", "rerun"],
    ],
  },
  {
    names: ["eas"],
    valued: [],
    acts: verbs("submit", "update", "deploy"),
    flagged: [{ path: ["build"], flags: ["--auto-submit"] }],
  },
  {
    names: ["promptfoo"],
    valued: [],
    acts: [...verbs("share"), ["redteam", "run"], ["redteam", "eval"], ["redteam", "discover"]],
    flagged: [{ path: ["eval"], flags: ["--share", "--remote"] }],
  },
  // The tools that send requests to a running application (item 2026-11-26-006, pages read on 2026-11-26).
  { names: ["zap-baseline.py", "zap-full-scan.py", "zap-api-scan.py"], valued: [], whole: true },
  { names: ["zap.sh", "zap-x.sh"], valued: [], whole: true },
  { names: ["nuclei"], valued: [], whole: true },
  {
    names: ["schemathesis", "st"],
    valued: ["--config-file"],
    acts: verbs("run", "fuzz", "replay"),
  },
  { names: ["testssl.sh", "testssl"], valued: [], whole: true },
  { names: ["sqlmap", "sqlmap.py"], valued: [], whole: true },
  {
    names: ["k6"],
    valued: ["-c", "--config", "--log-output", "-f", "--log-format", "-a", "--address"],
    acts: [["run"], ["cloud", "run"]],
  },
];

const TOOL_BY_NAME = new Map(
  ACTING_TOOLS.flatMap((row) => row.names.map((name) => [name, row] as const)),
);
/** The runners that name a package in one word, and the managers that do it behind a second word. */
const ONE_WORD_RUNNERS = ["npx", "bunx", "pnpx"];
const TWO_WORD_RUNNERS: Record<string, string[]> = {
  pnpm: ["dlx", "exec"],
  yarn: ["dlx"],
  npm: ["exec", "x"],
  bun: ["x"],
};
/** The runners whose `-c`/`--call` line the hook's walk hands on and reads as commands of its own. */
const HANDED_ON = ["npx", "bunx"];
/** How many positional words a row reads at most. */
const MAX_READ = 6;
const CANNOT_BE_READ = new RegExp(`[${EXPANSION_CHARS}${PATTERN_CHARS}]`);
const HELP_OR_VERSION = ["--version", "-v", "--help", "-h"];

/** A command word as a program's name: its folder and a Windows suffix gone, in lower case. */
function programOf(word: string): string {
  const name = word.slice(Math.max(word.lastIndexOf("/"), word.lastIndexOf("\\")) + 1);
  return name.toLowerCase().replace(/\.(?:exe|cmd)$/, "");
}

/** A runner's package word as the tool it runs: its scope and its version gone. */
function packageOf(word: string): string {
  const name = word.slice(word.lastIndexOf("/") + 1);
  const at = name.indexOf("@", 1);
  return (at < 0 ? name : name.slice(0, at)).toLowerCase();
}

interface Positional {
  word: string;
  index: number;
}

/** The first positional words after the program: options dropped, a valued option's value with it. */
function positionals(words: readonly string[], valued: readonly string[]): Positional[] {
  const kept: Positional[] = [];
  for (let i = 1; i < words.length && kept.length < MAX_READ; i++) {
    const word = words[i] ?? "";
    if (!word.startsWith("-")) kept.push({ word, index: i });
    else if (valued.includes(word)) i++;
  }
  return kept;
}

/** What a runner runs: the words from its package word on, or that its command cannot be read, or nothing. */
function throughRunner(
  words: readonly string[],
  from: number,
  runner: string,
  viaXargs: boolean,
): { words: readonly string[] } | { cannot: string } | null {
  const { end, call } = runnerOptions(words, "npx", from);
  const cannot = { cannot: `${runner} with a command the guard cannot read` };
  if (call !== null) return HANDED_ON.includes(runner) ? null : cannot;
  // `runnerOptions` takes a `--` for an option, so `end` stands past it.
  if (end >= words.length) return viaXargs ? cannot : null;
  return { words: [packageOf(words[end] ?? ""), ...words.slice(end + 1)] };
}

/** A word as an image's name: its digest, its tag and a leading Docker Hub host left out. */
function imageName(word: string): string {
  let name = word.split("@")[0] ?? "";
  const colon = name.lastIndexOf(":");
  if (colon > name.lastIndexOf("/")) name = name.slice(0, colon);
  for (const hub of ["docker.io/", "index.docker.io/"])
    if (name.startsWith(hub)) return name.slice(hub.length);
  return name;
}

/** The listed image a `run` or `container run` of the row names in any word after it, or undefined. */
function imageRun(row: ActingTool, words: readonly string[]): string | undefined {
  const [first, second] = positionals(words, row.valued);
  const run =
    first?.word === "run"
      ? first
      : first?.word === "container" && second?.word === "run"
        ? second
        : undefined;
  if (run === undefined) return undefined;
  for (const word of words.slice(run.index + 1)) {
    const name = imageName(word);
    if (row.images?.includes(name)) return name;
  }
  return undefined;
}

/** One row read against a command's positional words. */
function readRow(
  program: string,
  row: ActingTool,
  words: readonly string[],
  viaXargs: boolean,
): string | null {
  const read = positionals(words, row.valued).map((p) => p.word);
  const cannot = `${program} with a verb the guard cannot read`;
  if (row.whole) return program;
  const image = row.images ? imageRun(row, words) : undefined;
  if (image !== undefined) return `${program} run ${image}`;
  if (row.reads) {
    const [first] = read;
    if (first === undefined) {
      if (viaXargs) return cannot;
      return words.some((w) => HELP_OR_VERSION.includes(w)) ? null : program;
    }
    if (CANNOT_BE_READ.test(first)) return cannot;
    return row.reads.includes(first) ? null : program;
  }
  if (row.anyWord) {
    const found = read.find((word) => row.anyWord?.includes(word));
    if (found !== undefined) return `${program} ${found}`;
    if (read.some((word) => CANNOT_BE_READ.test(word))) return cannot;
    return viaXargs && read.length < MAX_READ ? cannot : null;
  }
  const flagged = row.flagged ?? [];
  const flagOf = (flags: readonly string[]) =>
    flags.find((flag) => words.some((w) => w === flag || w.startsWith(`${flag}=`)));
  // The paths still alive after each word; a word is read only while a longer path can continue.
  let alive = [...(row.acts ?? []), ...flagged.map((f) => f.path)];
  for (let i = 0; i < MAX_READ; i++) {
    const longer = alive.filter((path) => path.length > i);
    if (longer.length === 0) return null;
    const word = read[i];
    if (word === undefined) return viaXargs ? cannot : null;
    const star = longer.some((path) => path[i] === "*");
    if (!star && CANNOT_BE_READ.test(word)) return cannot;
    alive = longer.filter((path) => path[i] === "*" || path[i] === word);
    for (const path of alive) {
      if (path.length !== i + 1) continue;
      const said = path.filter((part) => part !== "*").join(" ");
      if (row.acts?.includes(path)) return `${program} ${said}`;
      const flag = flagOf(flagged.find((f) => f.path === path)?.flags ?? []);
      if (flag) return `${program} ${said} ${flag}`;
    }
  }
  return null;
}

/**
 * What acts in one simple command, as a short text of the table's own words (`kubectl apply`,
 * `vercel`, `wrangler deploy`), or null. The words are a command's as the hook's walk gives them,
 * its lead gone. A runner is read through once to the tool it runs. A verb that is an expansion or
 * a pattern at a position the row reads, and words that would come through xargs there, give
 * `<program> with a verb the guard cannot read`. Each word is read once.
 */
export function actingOf(words: readonly string[], viaXargs = false): string | null {
  const [first] = words;
  if (first === undefined) return null;
  let program = programOf(first);
  let rest: readonly string[] = words;
  let through: ReturnType<typeof throughRunner> | undefined;
  if (ONE_WORD_RUNNERS.includes(program)) through = throughRunner(words, 1, program, viaXargs);
  else if (Object.hasOwn(TWO_WORD_RUNNERS, program)) {
    const [second] = positionals(words, TOOL_BY_NAME.get(program)?.valued ?? []);
    if (second && TWO_WORD_RUNNERS[program]?.includes(second.word))
      through = throughRunner(words, second.index + 1, `${program} ${second.word}`, viaXargs);
  }
  if (through !== undefined) {
    if (through === null) return null;
    if ("cannot" in through) return through.cannot;
    rest = through.words;
    program = rest[0] ?? "";
  }
  const row = TOOL_BY_NAME.get(program);
  return row ? readRow(program, row, rest, viaXargs) : null;
}

/** What the hook's helper calls: an object, so that a test can put a function that throws in its place. */
export const acting = { of: actingOf };

/** The acting texts of a line's commands, each once, in order. A throw for one command loses that command's text and nothing else. */
export function actingIn(found: readonly { words: string[]; viaXargs: boolean }[]): string[] {
  const texts: string[] = [];
  for (const { words, viaXargs } of found) {
    let text: string | null = null;
    try {
      text = acting.of(words, viaXargs);
    } catch {
      // a broken table decides nothing: the hook's standing rules still run
    }
    if (text !== null && !texts.includes(text)) texts.push(text);
  }
  return texts;
}

/** The texts as one list in a sentence. */
export function actingList(texts: readonly string[]): string {
  if (texts.length <= 2) return texts.join(" and ");
  return `${texts.slice(0, -1).join(", ")}, and ${texts.at(-1)}`;
}

/** The reason of the deny where nobody is present. */
export function actingDeny(list: string, nobody: string): string {
  return `Crew: ${list} is a person's decision in this project (policy actingCommands) and nobody is here to give it (${nobody}): stop, and do not run it in another form (a script, a package's script, another runner); say so to the user, who runs it themselves or asks again from a session that can be asked`;
}

/** The reason of the ask where a person is present. */
export function actingAsk(list: string): string {
  return `Crew: ${list} is a person's decision in this project (policy actingCommands): it can deploy, apply, destroy or publish outside this machine, or send requests to a running application, and the guard cannot tell an act from a read for it, nor production from a preview or from this machine's own environment. A yes here is that decision, for the whole line. Where nobody answers, stop, and do not run it in another form.`;
}
