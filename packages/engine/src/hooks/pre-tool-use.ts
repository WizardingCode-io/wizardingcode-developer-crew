import { isAbsolute, join, relative, resolve } from "node:path";
import { isWatched } from "../fingerprint.ts";
import { isProtectedPath } from "../paths.ts";
import { activeWork, isBeforeBuild } from "../work.ts";
import type { HookContext, HookPayload, HookResponse } from "./types.ts";

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);
const USER_ONLY = /\bcrew\s+(?:skip|approve|accept|profile\s+confirm|policy\s+accept)\b/;
const ENGINE_FILES =
  /\.crew\/(?:profile\.json|policy\.json|\.gitignore|local\b|work\/[^\s/]+\/(?:work\.json|evidence\.json|report\.md|logs\b))|\.shibaox\/crew\b/;
const WRITE_SHAPE =
  /(?:^|[\s;&|(])(?:rm|mv|cp|tee|truncate|chmod|touch|dd|install)\b|sed\s+-i|>{1,2}\s*\S/;

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
    const abs = resolve(isAbsolute(filePath) ? filePath : join(ctx.paths.root, filePath));
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
    if (USER_ONLY.test(command)) {
      return answer("ask", "Crew: this command records a decision that only the user can take");
    }
    // No exemption for crew command lines: a crew prefix would let `crew x; echo > .crew/...` through, and no crew command names a protected path.
    if (ENGINE_FILES.test(command) && WRITE_SHAPE.test(command)) {
      return answer(
        "deny",
        "Crew: files under .crew/ and ~/.shibaox/crew that the engine owns are written only by the crew command",
      );
    }
  }
  return {};
}
