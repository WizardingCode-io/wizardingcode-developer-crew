import { isAbsolute, join, relative } from "node:path";
import { isWatched } from "../fingerprint.ts";
import { canonical, isProtectedPath } from "../paths.ts";
import { activeWork, isBeforeBuild } from "../work.ts";
import { simpleCommands } from "./shell.ts";
import type { HookContext, HookPayload, HookResponse } from "./types.ts";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
// The Bash rules read one simple command at a time (`simpleCommands`). This one is matched after
// quotes and backslashes are removed, after any token ending in `crew` or `crew.mjs` (the bundle
// run through node), so quoting a word or calling the bundle by path changes nothing.
const USER_ONLY =
  /(?:^|[\s/;&|(])crew(?:\.mjs)?\s+(?:skip|approve|accept|profile\s+confirm|policy\s+accept|profile\s+set\b[^;&|]*--force)\b/;
const ENGINE_FILES =
  /\.crew\/(?:profile\.json|policy\.json|\.gitignore|local\b|work\/[^\s/]+\/(?:work\.json|evidence\.json|report\.md|logs\b))|\.wizardingcode\/crew\b/;
// A verb may follow a quote (`bash -c "rm ..."`). A redirect is a write only when its target is an
// engine file (the `2>` of `2>/dev/null` after a read is not).
const WRITE_SHAPE =
  /(?:^|[\s;&|("'])(?:rm|mv|cp|tee|truncate|chmod|touch|dd|install)\b|sed\s+-i|>{1,2}\|?\s*["']?\S*(?:\.crew\/|\.wizardingcode\/crew\b)/;
// A redirect whose target cannot be read from the text (`$F`, `$(...)`, a backtick) may reach an
// engine file through a variable set in another simple command: a deny rule fails closed on it
// whenever the whole command names one.
const OPAQUE_REDIRECT = />{1,2}\|?\s*["']?[$`]/;

// Modes in which Claude Code shows no prompt a person answers, so a hook's "ask" is no signature.
const UNATTENDED_MODES = new Set(["auto", "bypassPermissions", "dontAsk"]);
const MODE_FLAG = /--mode(?:=|\s+)(\S+)/;

type Decision = ["deny" | "ask", string];

/**
 * A user-only command in a session with no person watching must say so with `--mode <mode>`, so
 * the engine records the agent's decision as the agent's. The flag is read from the same simple
 * command as the crew command, never from another. Null means the command may go on to the
 * write rule and, with a person present, to the prompt.
 */
function userOnlyDecision(cleaned: string, permissionMode: string | undefined): Decision | null {
  const flagged = MODE_FLAG.exec(cleaned)?.[1];
  if (permissionMode !== undefined && UNATTENDED_MODES.has(permissionMode)) {
    if (flagged === permissionMode) return null;
    if (flagged === undefined) {
      return [
        "deny",
        `Crew: no person is watching this session (${permissionMode} mode) and this command records a decision that only the user can take. Run it again with --mode ${permissionMode}, so the record says the agent decided and in which mode.`,
      ];
    }
    return [
      "deny",
      `Crew: this session is in ${permissionMode} mode, not ${flagged}; run the command with --mode ${permissionMode}`,
    ];
  }
  if (flagged !== undefined) {
    return [
      "deny",
      `Crew: a person is present (${permissionMode ?? "default"} mode); run the command without --mode so they are asked`,
    ];
  }
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
      if (USER_ONLY.test(cleaned)) {
        const decided = userOnlyDecision(cleaned, payload.permission_mode);
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
