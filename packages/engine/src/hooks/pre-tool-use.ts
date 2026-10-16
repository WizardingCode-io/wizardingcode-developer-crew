import { isAbsolute, join, relative } from "node:path";
import { isWatched } from "../fingerprint.ts";
import { canonical, isProtectedPath } from "../paths.ts";
import type { Policy } from "../types.ts";
import { activeWork, isBeforeBuild } from "../work.ts";
import { simpleCommands } from "./shell.ts";
import type { HookContext, HookPayload, HookResponse } from "./types.ts";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
// The Bash rules read one simple command at a time (`simpleCommands`). This one is matched after
// quotes and backslashes are removed, at the command position only: `crew` or a path ending in
// `/crew.mjs` (the bundle run through node) as the first word, or after runners, wrappers, env
// assignments and options. Quoting a word or calling the bundle by path changes nothing; the same
// words inside another program's argument (`grep 'crew accept'`) are text, not the command
// (finding 16 of the real-use phase).
// The shells, apart: in an opened session a shell with its script on its input (`echo … | sh`,
// `bash -s < f`) is denied, so the strip before that check leaves them standing. `trap` runs its
// string as `eval` does, when the shell exits (security review of SP2c task 3, round 13).
const SHELLS = String.raw`(?:sh|bash|zsh|dash|ksh|fish)`;
const RUNNER_NO_SHELL = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=\S*|-\S*|node|bun|bunx|npx|eval|exec|env|time|nohup|xargs|sudo|command|trap)`;
const RUNNER = String.raw`(?:${RUNNER_NO_SHELL}|${SHELLS})`;
// Options may sit before the verb (`crew --json approve …`) or between the words of a two-word
// verb (`profile --json confirm`); `objection … waive` tolerates anything but a command separator in
// between, since the id and the flags may come in any order (SP2a review, finding C1).
const OPTS = String.raw`(?:--[\w-]+(?:[= ]\S+)?\s+)*`;
const USER_ONLY = new RegExp(
  String.raw`^[\s({]*(?:${RUNNER}\s+)*(?:\S*/)?crew(?:\.mjs)?\s+${OPTS}(?:skip|approve|accept|decide|objection\b[^;&|]*\bwaive\b|profile\s+${OPTS}(?:confirm|set)|policy\s+${OPTS}(?:accept|set))\b`,
);
// The commands that change or accept the policy: asked even where the policy relays the rest, since
// the policy that governs signatures is itself signed by a prompt (ADR 0005).
const POLICY_COMMAND = new RegExp(
  String.raw`^[\s({]*(?:${RUNNER}\s+)*(?:\S*/)?crew(?:\.mjs)?\s+${OPTS}(?:policy\b|accept\s+${OPTS}policy\b)`,
);
const ENGINE_FILES =
  /\.crew\/(?:profile\.json|policy\.json|\.gitignore|local\b|work\/[^\s/]+\/(?:work\.json|evidence\.json|objections\.json|mail\.json|report\.md|logs\b))|\.wizardingcode\/crew\b/;
// A verb may follow a quote (`bash -c "rm ..."`). A redirect is a write only when its target is an
// engine file (the `2>` of `2>/dev/null` after a read is not).
const WRITE_SHAPE =
  /(?:^|[\s;&|("'])(?:rm|mv|cp|tee|truncate|chmod|touch|dd|install)\b|sed\s+-i|>{1,2}\|?\s*["']?\S*(?:\.crew\/|\.wizardingcode\/crew\b)/;
// A redirect whose target cannot be read from the text (`$F`, `$(...)`, a backtick) may reach an
// engine file through a variable set in another simple command: a deny rule fails closed on it
// whenever the whole command names one.
const OPAQUE_REDIRECT = />{1,2}\|?\s*["']?[$`]/;

// Modes that show no prompt a person answers, even with a person present: `dontAsk` auto-denies
// anything that would prompt, and nothing documents that `bypassPermissions` shows a hook's "ask".
// Auto mode is not one of them: a hook's "ask" forces the prompt there and the classifier cannot
// approve the call in silence (finding 3 revisited, finding 19 of the real-use phase).
const PROMPTLESS_MODES = new Set(["bypassPermissions", "dontAsk"]);
const MODE_FLAG = /--mode(?:=|\s+)(\S+)/;
// A decision the validator takes under a rule: the engine checks the rule and refuses when it does
// not hold, so with a person present there is nothing for them to sign (0.3.0).
const VALIDATOR_FLAG = /--validator(?:=|\s+)\S+/;
// A help lookup records nothing (the command refuses the flag), so there is no decision to sign.
const HELP_FLAG = /(?:^|\s)(?:--help|-h)(?=\s|$)/;

// What a session opened by mail may never run (vision §10, SP2c §10): a merge, a push to any branch
// but its own, a release, a deploy. A fixed list the hook can read, not a rule a prompt asks for
// (plan decision 8). Each pattern is matched after the runners and options, like USER_ONLY.
// A tool by name or by path (`/opt/homebrew/bin/gh`), since LEADING strips runners, not paths.
const BIN = String.raw`^(?:\S*/)?`;
const verbEntry = (re: string, what: string): { re: RegExp; what: string } => ({
  re: new RegExp(`${BIN}${re}`),
  what,
});
// What the guard cannot read in a word: an expansion (`$`, a backtick) or a pattern the shell
// expands (a brace, a bracket, a paren, `*`, `?`). One set for the command word, the verbs and a
// push's remote (security review, rounds 13 and 14).
const EXPANSION_CHARS = String.raw`$\x60`;
const PATTERN_CHARS = String.raw`{[(*?`;
const UNREADABLE_WORD = String.raw`\S*[${EXPANSION_CHARS}${PATTERN_CHARS}]`;
// `git` by name or by path, then its `-c k=v` style options before the verb.
const GIT_CMD = String.raw`${BIN}git\s+`;
const GIT_OPTS = String.raw`(?:-\S+(?:\s+\S+)?\s+)`;
const GIT = `${GIT_CMD}${GIT_OPTS}*`;
// Settings that change what a later verb does: an alias names any verb, push.followTags adds the
// tags to a push, remote.<name>.push maps the own branch onto another and remote.<name>.mirror
// pushes everything (a remote's name may carry dots: the key is what follows the last one). None
// is set in an opened session, on the command line (`-c`, `git config`, or `--config-env`, which
// takes any key from a variable and is denied outright) or in the environment (`GIT_CONFIG_COUNT`/
// `_KEY_n`/`_VALUE_n`, `GIT_CONFIG_PARAMETERS`); git's keys are case-insensitive, so the patterns
// are too (security review of SP2c task 3).
const SETTING = String.raw`(?:alias\.|push\.followTags|remote\.[^\s=]+\.(?:push|mirror)|url\.[^\s=]+\.(?:push)?insteadOf)`;
const GIT_CONFIG_ENV = /(?:^|\s)GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+|PARAMETERS)=/;
const OPENED_VERBS: { re: RegExp; what: string }[] = [
  // Another repository by path, before any verb: the session works in its own checkout and nowhere else.
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?-C\\s`), what: "git -C" },
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?--git-dir(?:=|\\s)`), what: "git --git-dir" },
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?--work-tree(?:=|\\s)`), what: "git --work-tree" },
  // `merge` the verb, not `merge-base` or `merge-file`, which read; `pull` is a fetch and a merge.
  { re: new RegExp(`${GIT}merge(?![\\w-])`), what: "git merge" },
  { re: new RegExp(`${GIT}pull\\b`), what: "git pull" },
  // A verb that is an expansion or a pattern (`$V`, `{merge,}`, `mer[g]e`): what it expands to
  // cannot be read here. The same for the other tools named below, whose verbs the list reads.
  {
    re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?${UNREADABLE_WORD}`),
    what: "git with an expansion or a pattern as its verb",
  },
  verbEntry(
    String.raw`(?:gh|npm|docker|netlify|fly|kubectl|terraform|aws|gcloud|serverless|sam|cap|crew(?:\.mjs)?)\s+(?:-\S+\s+)*${UNREADABLE_WORD}`,
    "a verb that is an expansion or a pattern",
  ),
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?-c\\s*${SETTING}`, "i"), what: "git -c" },
  { re: new RegExp(`${GIT_CMD}${GIT_OPTS}*?--config-env\\b`), what: "git --config-env" },
  { re: new RegExp(`${GIT}config\\b.*\\b${SETTING}`, "i"), what: "git config" },
  // Git's other verbs that update a remote ref (security review, rounds 2 and 3).
  { re: new RegExp(`${GIT}subtree\\s+push\\b`), what: "git subtree push" },
  { re: new RegExp(`${GIT}send-pack\\b`), what: "git send-pack" },
  { re: new RegExp(`${GIT}http-push\\b`), what: "git http-push" },
  { re: new RegExp(`${GIT}svn\\s+dcommit\\b`), what: "git svn dcommit" },
  { re: new RegExp(`${GIT}p4\\s+submit\\b`), what: "git p4 submit" },
  verbEntry(String.raw`gh\s+release\b`, "gh release"),
  // The remote merge, by the verb; a fork synced to another branch; an alias, which could name any
  // verb; and any write through the API: a method other than GET, or a body (`-f`, `-F`, `--field`,
  // `--raw-field`, `--input` make the request a POST; pflag takes the value attached to a short
  // flag), which can merge, move a ref, cut a release or dispatch a workflow. A read passes.
  verbEntry(String.raw`gh\s+pr\s+merge\b`, "gh pr merge"),
  verbEntry(String.raw`gh\s+repo\s+sync\b`, "gh repo sync"),
  verbEntry(String.raw`gh\s+alias\s+(?:set|import|delete)\b`, "gh alias"),
  verbEntry(
    String.raw`gh\s+api\s(?:.*\s)?(?:(?:-X\s*|--method(?:=|\s+))(?!GET\b)\S|-[fF]|--(?:field|raw-field|input)(?:=|\s))`,
    "gh api write",
  ),
  verbEntry(String.raw`gh\s+workflow\s+run\b`, "gh workflow run"),
  verbEntry(String.raw`npm\s+publish\b`, "npm publish"),
  verbEntry(String.raw`docker\s+push\b`, "docker push"),
  verbEntry(String.raw`vercel\b`, "vercel"),
  verbEntry(String.raw`netlify\s+deploy\b`, "netlify deploy"),
  verbEntry(String.raw`fly\s+deploy\b`, "fly deploy"),
  verbEntry(String.raw`kubectl\s+(?:apply|rollout)\b`, "kubectl"),
  verbEntry(String.raw`terraform\s+apply\b`, "terraform apply"),
  verbEntry(String.raw`aws\s+deploy\b`, "aws deploy"),
  verbEntry(String.raw`gcloud\s+.*\bdeploy\b`, "gcloud deploy"),
  verbEntry(String.raw`heroku\b`, "heroku"),
  verbEntry(String.raw`ansible-playbook\b`, "ansible-playbook"),
  verbEntry(String.raw`cap\s+\S+\s+deploy\b`, "cap deploy"),
  verbEntry(String.raw`serverless\s+deploy\b`, "serverless deploy"),
  verbEntry(String.raw`sam\s+deploy\b`, "sam deploy"),
  verbEntry(String.raw`crew(?:\.mjs)?\s+${OPTS}task\s+\S+\s+${OPTS}merge\b`, "crew task merge"),
];
const PUSH = new RegExp(`${GIT}push\\b(.*)$`);
// Push options that reach more than the branch named: every branch, the mirror, a deletion, a
// prune, the tags, the submodules' remotes. Git takes any unique prefix of a long option (`--tag`,
// `--follow`, `--del`), so a prefix of one of these widens the push too, as does `-d` bundled with
// other short flags (`-fd`).
const PUSH_WIDE = [
  "--all",
  "--mirror",
  "--delete",
  "--prune",
  "--branches",
  "--tags",
  "--follow-tags",
  "--recurse-submodules",
];
function widensPush(word: string): boolean {
  if (!word.startsWith("--")) return /^-[A-Za-z]*d/.test(word);
  // The option's name, as a unique prefix or whole, with its `=value` set aside.
  const [name, value] = word.split("=", 2);
  if (!name || name.length <= 2 || !PUSH_WIDE.some((o) => o.startsWith(name))) return false;
  // `--recurse-submodules=no`, under any prefix of the name, is the one value that does not widen.
  return !("--recurse-submodules".startsWith(name) && value === "no");
}
// The shell's keywords and the common wrappers leave the command whole after the split on `;`,
// `&&` and `|`, so they are stripped with the runners before the verb is read, a wrapper's options
// with their values (`timeout -s KILL 5`, `sudo -u me`, `flock -w 1 f`, `env -u VAR`, `exec -a
// name`, `xargs -n 1`); `coproc` (with its name before a block) and zsh's `noglob` and `nocorrect`
// are keywords too (security review, rounds 6 to 13).
const SHELL_WORDS = String.raw`(?:if|then|else|elif|do|while|until|!|nice(?:\s+-n\s*\S+)?|timeout(?:\s+-[sk]\s+\S+|\s+-\S+)*\s+\S+|stdbuf(?:\s+-\S+)*|flock(?:\s+-w\s+\S+|\s+-[a-zA-Z]+)*\s+\S+|sudo(?:\s+-[ugpCh]\s+\S+|\s+-\S+)*|env(?:\s+-[uCS]\s+\S+|\s+-\S+|\s+\w+=\S*)*|exec(?:\s+-a\s+\S+|\s+-\S+)*|xargs(?:\s+-[nILPdEs]\s*\S+|\s+-\S+)*|doas|caffeinate(?:\s+-\S+)*|ionice(?:\s+-\S+(?:\s+\S+)?)*|coproc(?:\s+\w+(?=\s*\{))?|noglob|nocorrect)`;
// What else stands before a command in one piece: a function body's head (`f(){`, `function f {`),
// a case arm (`1)`, `case x in 1)`).
const SHELL_LEAD = String.raw`(?:\S+\s*\(\s*\)\s*\{|function\s+\S+\s*\{|case\s+\S+\s+in(?:\s+[^\s()$\x60]+\))?|[^\s()$\x60]+\))`;
// A separator left at the head (`|git …` once a redirect before it is gone) is not part of the
// command, nor is a subshell's `(` or a group's `{ `; a `{` glued to its word (`{git,merge}`) is a
// brace expansion, read with the command word (security review, round 13).
const LEAD_CHARS = String.raw`(?:[\s(|&;]|\{(?=\s))*`;
const LEADING = new RegExp(
  String.raw`^${LEAD_CHARS}(?:(?:${SHELL_LEAD}|${SHELL_WORDS}|${RUNNER})\s+)*`,
);
// The same strip with the shells left standing (`behindTheShell(text, BEFORE_INTERPRETER)`), and
// the shape of a shell with its script on its input: alone, or with options only (`sh`, `bash -s`,
// `zsh -`).
const BEFORE_INTERPRETER = new RegExp(
  String.raw`^${LEAD_CHARS}(?:(?:${SHELL_LEAD}|${SHELL_WORDS}|${RUNNER_NO_SHELL})\s+)*`,
);
const INTERPRETER_STDIN = new RegExp(String.raw`^(?:\S*/)?${SHELLS}(?:\s+-{1,2}[A-Za-z]*)*$`);
// A redirect, in any form (`>/dev/null`, `> /dev/null`, `2>&1`, `&>>log`, `>|file`, `<file`) and
// at any position, since the shell takes it from anywhere in a simple command; `<(` and `>(` are
// substitutions, not redirects, and a target ends where a substitution closes (`2>&1)`) or a
// separator follows (`2>/dev/null; git …`, `>x|git …`, `2>&1&&git …`), so the next command stays.
// A target that is itself a substitution (`< <(…)`, `>$(…)`, `>>$(…)`) is left whole for the
// unwrapping: the operator is read whole too, so `>>` is never read as `>` with `>$` for its
// target. A here-string (`<<<word`) is no redirect here: its word is read as the command's, since
// a shell runs it (`bash <<< "git merge main"`) (security review, rounds 12 and 13).
const REDIRECT =
  /(?:^|\s)(?:\d+|&)?[<>]{1,2}(?![<>(])(?:[&|]?(?![$<>]\()[^\s()\x60;&|]+|\s+(?![$<>]\()[^\s()\x60;&|]+)/g;
const HERE_STRING = /<<<\s*/g;
function stripRedirects(text: string): string {
  return text.replace(REDIRECT, " ");
}
// A command or process substitution, innermost first: `$(…)`, `<(…)`, `>(…)` or a pair of backticks
// (the quotes are gone by now); an arithmetic expansion `$((…))` is read the same way, since a
// command may stand inside it.
const SUBSTITUTION = /\$\(\(([^()]*)\)\)|[$<>]\(([^()]*)\)|`([^`]*)`/g;
// What opens a substitution. One still standing once the closed ones are unwrapped (a paren inside
// it, a function head, a cut at a `;` or a newline, a lone backtick), or parentheses that do not
// balance around one, is a substitution the guard cannot read, denied as such (security review,
// round 12).
const OPENER = /[$<>]\(|`/;
const UNREADABLE = "a substitution the guard cannot read";
// A `case` arm's `)` closes no parenthesis: the arm's head (`case x in a)`, `;; b)`, `;& (c|d)`) is
// read as such before the parentheses are counted and the substitutions unwrapped, in or out of a
// `$(…)`; `esac` is no arm.
const CASE_ARM =
  /(?:\bcase\s+\S+\s+in|;(?:;&?|&))\s*\(?(?!esac\b)[^\s()$\x60|]+(?:\|[^\s()$\x60|]+)*\)/g;
function withoutCaseArms(text: string): string {
  return text.replace(CASE_ARM, " ");
}
/** Whether a `)` closes nothing, a `(` stays open, or a backtick stands alone. */
function unbalanced(text: string): boolean {
  let depth = 0;
  for (const ch of text) {
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth < 0) return true;
    }
  }
  return depth !== 0 || (text.match(/`/g)?.length ?? 0) % 2 === 1;
}
// The command word must be readable: a tool's name or path. One holding an expansion (`$(…)`, a
// backtick, `${X}git`, `gi$X`) or a pattern the shell expands (`{git,merge}`, `gi[t]`, `gi?`, a
// function head `f()`) is denied as such, since what runs cannot be read here; a path whose root
// is a variable or a substitution (`$HOME/.bun/bin/bun`, `$(git --exec-path)/git-push`) is read
// by the name at its end. `[` and `[[` are the test builtins (security review, rounds 8 and 13).
const LEADING_SUBSTITUTION = /^(?:\$\([^()]*\)|`[^`]*`)\S*/;
const VAR_ROOT_PATH = new RegExp(
  String.raw`^(?:\$\([^()]*\)|\x60[^\x60]*\x60|\$\{[^}]*\}|\$\w+)(?:/[^\s${EXPANSION_CHARS}${PATTERN_CHARS}}\])]+)+$`,
);
const EXPANSION = new RegExp(`[${EXPANSION_CHARS}]`);
const PATTERN = new RegExp(`[${PATTERN_CHARS}]`);
function commandWordDenial(head: string): string | null {
  const word = (LEADING_SUBSTITUTION.exec(head) ?? /^\S*/.exec(head))?.[0] ?? "";
  if (!word || VAR_ROOT_PATH.test(word) || /^\[\[?$/.test(word)) return null;
  if (EXPANSION.test(word)) return "an expansion in the command position";
  if (PATTERN.test(word)) return "a pattern in the command position";
  return null;
}
// A remote that is not a plain name: a URL, a user@host, a folder, an expansion or a pattern.
const REMOTE_PATH = new RegExp(String.raw`[:/@${EXPANSION_CHARS}${PATTERN_CHARS}}\]]|^\.\.?$`);

/**
 * The tool's name as the patterns spell it: in lower case, since the platform's file system ignores
 * case, and git's dashed form by path (`…/git-core/git-merge`) as `git merge`.
 */
function normalizeTool(command: string): string {
  return command
    .replace(/^\S+/, (word) => word.toLowerCase())
    .replace(/^(\S*\/)?git-(?=[a-z])/, "$1git ");
}

/** The texts of a piece's substitutions, innermost first, and the piece with each replaced by a space. */
function unwrapSubstitutions(text: string): { inner: string[]; rest: string } {
  const inner: string[] = [];
  let rest = text;
  for (;;) {
    const found: string[] = [];
    const next = rest.replace(
      SUBSTITUTION,
      (_, a: string | undefined, b: string | undefined, c: string | undefined) => {
        found.push(a ?? b ?? c ?? "");
        return " ";
      },
    );
    if (!found.length) return { inner, rest };
    inner.push(...found);
    rest = next;
  }
}

/**
 * The command behind the shell's keywords, wrappers and runners (the shells too, unless `lead`
 * keeps them), and behind a separator a dropped redirect left at the head (`|git …`).
 */
function behindTheShell(text: string, lead: RegExp = LEADING): string {
  return text
    .replace(lead, "")
    .replace(/^[\s|&;]+/, "")
    .replace(lead, "")
    .trim();
}

/** The opened-session policy on one command with no shell syntax left in front of it. */
function judgeCommand(command: string, branch: string | null): string | null {
  for (const { re, what } of OPENED_VERBS) if (re.test(command)) return what;
  const push = PUSH.exec(command);
  if (!push) return null;
  if (!branch) return "git push";
  const words = (push[1] ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.some(widensPush)) return "git push";
  const [remote, ...refspecs] = words.filter((w) => !w.startsWith("-"));
  if (!remote || REMOTE_PATH.test(remote)) return "git push";
  const own = new Set([branch, `HEAD:${branch}`, `${branch}:${branch}`]);
  if (refspecs.length === 0 || refspecs.some((r) => !own.has(r))) return "git push";
  return null;
}

/**
 * The verb a session opened by mail may not run, or null. `branch` is the session's own, the one
 * branch it may push: `git push <remote> <own>` (or `HEAD:<own>`), the remote by name (a URL or a
 * path is a repository the opener did not choose), every refspec named being its own, with no
 * option that widens the push. The command line is read whole, and the shell syntax around a
 * command is unwrapped first: its redirects are dropped, a command or process substitution is
 * judged on its own, before the cut at `;` and newlines (so a script inside one is judged as a
 * script), and so is each command of a script a runner carries in its quotes (`bash -c "a; b"`)
 * or in a here-string (`bash <<< "a"`), since the hook's split stops at the quotes (security
 * review). What cannot be read is denied as such: a substitution the guard cannot read, a command
 * word or a verb that is an expansion or a pattern, a shell with its script on its input.
 */
export function openedSessionDenial(cleaned: string, branch: string | null): string | null {
  const bare = withoutCaseArms(cleaned.replace(HERE_STRING, " "));
  if (OPENER.test(bare) && unbalanced(bare)) return UNREADABLE;
  const text = stripRedirects(bare);
  // Before the substitutions are unwrapped: git's configuration through the environment, and the
  // command word itself, which must be readable.
  if (GIT_CONFIG_ENV.test(text)) return "GIT_CONFIG_* in the environment";
  const unreadableWord = commandWordDenial(behindTheShell(text));
  if (unreadableWord) return unreadableWord;
  const { inner, rest } = unwrapSubstitutions(text);
  if (OPENER.test(rest)) return UNREADABLE;
  for (const piece of inner) {
    const denied = openedSessionDenial(piece, branch);
    if (denied) return denied;
  }
  const head = behindTheShell(rest);
  const parts = simpleCommands(head);
  if (parts.length > 1) {
    for (const part of parts) {
      const denied = openedSessionDenial(part, branch);
      if (denied) return denied;
    }
    return null;
  }
  // A shell with its script on its input (`echo … | sh`, `A=x env | sh`, `bash -s < f`): the
  // script cannot be read. The verb's own strip, with the shells left standing.
  if (INTERPRETER_STDIN.test(normalizeTool(behindTheShell(rest, BEFORE_INTERPRETER))))
    return "an interpreter reading its script from its input";
  return judgeCommand(normalizeTool(head), branch);
}

type Decision = ["deny" | "ask", string];

/**
 * A user-only command in a session with no person watching (a headless session in any mode, or a
 * mode that shows no prompt) must say so with `--mode <mode>`, so the engine records the agent's
 * decision as the agent's. The flag is read from the same simple command as the crew command,
 * never from another. Null means the command may go on to the write rule and, with a person
 * present, to the prompt, which is the user's signature; or, under the policy's
 * `attendedDecisions: relay`, to run with no prompt, the agent relaying the user's yes (ADR 0005).
 */
function userOnlyDecision(
  cleaned: string,
  permissionMode: string | undefined,
  headless: boolean,
  policy: Policy,
): Decision | null {
  const flagged = MODE_FLAG.exec(cleaned)?.[1];
  const mode = permissionMode ?? "default";
  if (headless || PROMPTLESS_MODES.has(mode)) {
    if (flagged === mode) return null;
    const where = headless ? `a headless session in ${mode} mode` : `${mode} mode`;
    if (flagged === undefined) {
      return [
        "deny",
        `Crew: no person is watching this session (${where}) and this command records a decision that only the user can take. Run it again with --mode ${mode}, so the record says the agent decided and in which mode.`,
      ];
    }
    return [
      "deny",
      `Crew: this session is ${where}, not ${flagged}; run the command with --mode ${mode}`,
    ];
  }
  if (flagged !== undefined) {
    return [
      "deny",
      `Crew: a person is present (${mode} mode); run the command without --mode so they are asked`,
    ];
  }
  if (VALIDATOR_FLAG.test(cleaned)) return null;
  if (policy.attendedDecisions === "relay" && !POLICY_COMMAND.test(cleaned)) return null;
  return ["ask", "Crew: this command records a decision that only the user can take"];
}

function answer(permissionDecision: "deny" | "ask", reason: string): HookResponse {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision,
      permissionDecisionReason: reason,
    },
  };
}

function pathFromInput(input: Record<string, unknown>): string | null {
  for (const key of ["file_path", "notebook_path", "path"]) {
    const value = input[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export function onPreToolUse(ctx: HookContext, payload: HookPayload): HookResponse {
  const tool = payload.tool_name ?? "";
  const input = payload.tool_input ?? {};
  if (WRITE_TOOLS.has(tool)) {
    const filePath = pathFromInput(input);
    if (!filePath) return {};
    const abs = canonical(isAbsolute(filePath) ? filePath : join(ctx.paths.root, filePath));
    if (isProtectedPath(ctx.paths, abs)) {
      return answer(
        "deny",
        `Crew: ${filePath} is maintained by the engine and is changed through the crew command`,
      );
    }
    const rel = relative(ctx.paths.root, abs).replace(/\\/g, "/");
    if (rel === "" || rel.startsWith("..") || !isWatched(rel, ctx.profile)) return {};
    const active = activeWork(ctx.paths);
    const work = active?.work;
    if (work && work.route !== "fast" && isBeforeBuild(work)) {
      return answer(
        "deny",
        `Crew: work ${work.id} is in phase ${work.phase} on the ${work.route} route; source files change in the build phase (crew phase ${work.id} next)`,
      );
    }
    return {};
  }
  if (tool === "Bash") {
    const command = typeof input.command === "string" ? input.command : "";
    // A session opened by mail never merges or deploys (SP2c §10): the rule holds from the first
    // command, before any item exists, since the opener sets the variables. The branch it may
    // push is the one the opener pinned, never whatever HEAD says now (a checkout would choose
    // it); with none pinned, no push passes (security review, round 2). The command line goes
    // whole, its substitutions read before its cut (security review, round 12).
    if (ctx.openedBy) {
      const denied = openedSessionDenial(command.replace(/["'\\]/g, ""), ctx.openedBranch);
      if (denied)
        return answer(
          "deny",
          `Crew: this session was opened by mail (${ctx.openedBy}) and never merges, pushes to another branch, releases or deploys: ${denied} is denied; it ends with crew mail reply ${ctx.openedBy} --branch ${ctx.openedBranch ?? "<branch>"} --item <child id>`,
        );
    }
    // Each simple command is judged on its own: an engine file named in one and a write verb in
    // another are not a write (finding 2 of the real-use phase). A deny anywhere wins over an ask.
    let asked: Decision | null = null;
    for (const piece of simpleCommands(command)) {
      const cleaned = piece.replace(/["'\\]/g, "");
      if (USER_ONLY.test(cleaned) && !HELP_FLAG.test(cleaned)) {
        const decided = userOnlyDecision(
          cleaned,
          payload.permission_mode,
          ctx.headless,
          ctx.policy,
        );
        if (decided?.[0] === "deny") return answer(...decided);
        asked ??= decided;
      }
      // No exemption for crew command lines: `crew x; echo > .crew/...` is two simple commands, and no crew command names a protected path.
      if (
        (ENGINE_FILES.test(piece) && WRITE_SHAPE.test(piece)) ||
        (OPAQUE_REDIRECT.test(piece) && ENGINE_FILES.test(command))
      ) {
        return answer(
          "deny",
          "Crew: files under .crew/ and ~/.wizardingcode/crew that the engine owns are written only by the crew command",
        );
      }
    }
    if (asked) return answer(...asked);
  }
  return {};
}
