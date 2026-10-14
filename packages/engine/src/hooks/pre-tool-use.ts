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
const RUNNER = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*=\S*|-\S*|node|bun|bunx|npx|sh|bash|zsh|eval|exec|env|time|nohup|xargs|sudo|command)`;
// Options may sit before the verb (`crew --json approve …`) or between the words of a two-word
// verb (`profile --json confirm`); `objection … waive` tolerates anything but a command separator in
// between, since the id and the flags may come in any order (SP2a review, finding C1).
const OPTS = String.raw`(?:--[\w-]+(?:[= ]\S+)?\s+)*`;
const USER_ONLY = new RegExp(
  String.raw`^[\s({]*(?:${RUNNER}\s+)*(?:\S*/)?crew(?:\.mjs)?\s+${OPTS}(?:skip|approve|accept|decide|objection\b[^;&|]*\bwaive\b|profile\s+${OPTS}confirm|policy\s+${OPTS}(?:accept|set)|profile\s+set\b[^;&|]*--force)\b`,
);
// The commands that change or accept the policy: asked even where the policy relays the rest, since
// the policy that governs signatures is itself signed by a prompt (ADR 0005).
const POLICY_COMMAND = new RegExp(
  String.raw`^[\s({]*(?:${RUNNER}\s+)*(?:\S*/)?crew(?:\.mjs)?\s+${OPTS}(?:policy\b|accept\s+${OPTS}policy\b)`,
);
const ENGINE_FILES =
  /\.crew\/(?:profile\.json|policy\.json|\.gitignore|local\b|work\/[^\s/]+\/(?:work\.json|evidence\.json|objections\.json|report\.md|logs\b))|\.wizardingcode\/crew\b/;
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
