/**
 * The JavaScript module `crew runtime install opencode` writes under `.opencode/plugins/` (SP6 Task 4
 * AC-4; ADR 0011): OpenCode's plugin API gives `tool.execute.before`, `tool.execute.after` and an
 * `event` hook and no stdout contract, so the plugin runs the engine's hook through the shell the
 * runtime injects (`$`, Bun's shell, stdin by redirection from a Response) and throws the engine's
 * reason on a deny or an ask; anything else, a hook that cannot run included, holds nothing (the
 * engine fails open). `makePlugin` is exported so a test can hand it a stubbed `$`.
 */
export function opencodePlugin(root: string): string {
  return `// WizardingCode Developer Crew: the OpenCode plugin the crew engine wrote (crew runtime install opencode).
// It runs the engine's hooks through the runtime's shell; a denied tool call throws the engine's reason.
const ROOT = ${JSON.stringify(root)};
const RUNTIME = "opencode";

export function makePlugin($, directory, root = ROOT) {
  const run = async (event, payload, mayThrow) => {
    let text;
    try {
      text = await $\`node \${root}/dist/crew.mjs hook \${event} --runtime \${RUNTIME} < \${new Response(JSON.stringify(payload))}\`.quiet().text();
    } catch {
      return; // the engine fails open: a hook that cannot run holds nothing
    }
    let answer;
    try {
      answer = JSON.parse(text);
    } catch {
      return;
    }
    const output = answer && typeof answer === "object" ? answer.hookSpecificOutput : undefined;
    const decision = output && typeof output === "object" ? output.permissionDecision : undefined;
    if (mayThrow && (decision === "deny" || decision === "ask")) {
      throw new Error(typeof output.permissionDecisionReason === "string" ? output.permissionDecisionReason : "Crew: denied");
    }
  };
  const call = (input, output) => ({
    session_id: input && typeof input === "object" ? input.sessionID : undefined,
    cwd: directory,
    tool_name: input && typeof input === "object" ? input.tool : undefined,
    tool_input: output && typeof output === "object" ? output.args : undefined,
  });
  return {
    "tool.execute.before": async (input, output) => run("pre-tool-use", call(input, output), true),
    "tool.execute.after": async (input, output) => run("post-tool-use", call(input, output), false),
    event: async ({ event }) => {
      if (!event || event.type !== "session.created") return;
      const info = event.properties && typeof event.properties === "object" ? event.properties.info : undefined;
      await run("session-start", { session_id: info && typeof info === "object" ? info.id : undefined, cwd: directory }, false);
    },
  };
}

export const WizardingCodeCrew = async ({ $, directory }) => makePlugin($, directory);
`;
}
