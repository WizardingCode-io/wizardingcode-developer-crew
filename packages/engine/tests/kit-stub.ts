// A stub of the eval kit and the kit's own trace shapes, for the tests that spawn scripts/eval.ts
// and scripts/benchmark.ts (SP6 Task 5; the hardening of finding 118). The stub is first on the
// spawned PATH: it reads the --output-dir the script gives it, copies the aggregate the environment
// names into that folder when the folder exists (never creating it: the folder is the script's to
// create, under the kit's cwd), writes a decoy folder beside it when asked, logs its cwd and its
// arguments, and exits as told. No key, no session, no spend.
import { chmodSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { evalInvocation, realGitDir } from "../../../scripts/eval.ts";

/**
 * Writes the stub as `<dir>/bin/claude` and returns the bin folder. The environment drives it:
 * `STUB_AGGREGATE` the file copied as `aggregate-result.json` into the `--output-dir` folder;
 * `STUB_EXIT` the status; `STUB_LOG` a file that receives the cwd on its first line and the
 * arguments on the second; `STUB_ENV` a file that receives the kit's environment, `env`'s lines; `STUB_DECOY` a folder created (with its parents) during the run holding
 * `STUB_DECOY_AGGREGATE` as its aggregate, the "newer folder written beside it" of AC-3 and AC-4.
 */
export const stubKit = (dir: string): string => {
  const bin = join(dir, "bin");
  mkdirSync(bin, { recursive: true });
  const stub = join(bin, "claude");
  writeFileSync(
    stub,
    [
      "#!/bin/sh",
      'out=""',
      'if [ -n "$STUB_LOG" ]; then pwd > "$STUB_LOG"; echo "$@" >> "$STUB_LOG"; fi',
      'if [ -n "$STUB_ENV" ]; then env > "$STUB_ENV"; fi',
      'while [ $# -gt 0 ]; do [ "$1" = "--output-dir" ] && out="$2"; shift; done',
      'if [ -n "$STUB_DECOY" ]; then mkdir -p "$STUB_DECOY"; cp "$STUB_DECOY_AGGREGATE" "$STUB_DECOY/aggregate-result.json"; fi',
      'if [ -n "$out" ] && [ -d "$out" ] && [ -f "$STUB_AGGREGATE" ]; then cp "$STUB_AGGREGATE" "$out/aggregate-result.json"; fi',
      'if [ -n "$STUB_EXIT" ]; then exit "$STUB_EXIT"; fi; exit 0',
      "",
    ].join("\n"),
  );
  chmodSync(stub, 0o755);
  return bin;
};

/** The PATH the script composes for the kit (the plugin's bin and the real git ahead of the given one). */
export const composedPath = (root: string, path: string): string =>
  evalInvocation({
    root,
    platform: process.platform,
    path,
    realGitDir: realGitDir(process.platform),
  }).path;

/** The first directory of a PATH holding a `claude`: a spawned row asserts it is the stub's, never the real kit. */
export const firstClaudeOn = (path: string): string | undefined =>
  path.split(delimiter).find((dir) => dir !== "" && existsSync(join(dir, "claude")));

/** The folders under a results directory, none when it does not exist. */
export const listResults = (results: string): string[] =>
  existsSync(results) ? readdirSync(results) : [];

/** The folders under a results directory a spawned run added since `before`, for the row's finally. */
export const foldersSince = (results: string, before: readonly string[]): string[] =>
  listResults(results).filter((f) => !before.includes(f));

/** The folder name shape the scripts give the kit: the kit's own UTC stamp and the run's suffix. */
export const RUN_FOLDER =
  /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-(benchmark|suite|case-[\w-]+)$/;

// The kit's trace, line by line, as the kept traces of 2026-10-21 write it (finding 118).

/** The plugin's root inside a sandbox, where the references live. */
export const PLUGIN_ROOT = "/private/tmp/e-stub/plugins/wizardingcode-developer-crew";
/** The absolute path of a reference inside the sandbox. */
export const reference = (file: string): string => `${PLUGIN_ROOT}/skills/crew/references/${file}`;

/** An `assistant` line holding one `tool_use`. */
export const toolUse = (id: string, name: string, input: Record<string, unknown>): string =>
  JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "tool_use", id, name, input }] },
  });

/** An `assistant` line holding the agent's own words. */
export const agentText = (text: string): string =>
  JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content: [{ type: "text", text }] },
  });

/**
 * A `user` line holding one `tool_result` and the line's `tool_result_meta` entry for it: accepted
 * by default, `is_error` and `reject` on request, no metadata entry with `meta: false`, and the
 * Read tool's `tool_use_result` naming the file when `filePath` is given (what put the path on the
 * accepted result's line and tripped the old reading).
 */
export const toolResult = (
  id: string,
  content: string,
  options: {
    isError?: boolean;
    decision?: "accept" | "reject";
    meta?: boolean;
    filePath?: string;
  } = {},
): string =>
  JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: id,
          content,
          ...(options.isError ? { is_error: true } : {}),
        },
      ],
    },
    ...(options.filePath
      ? { tool_use_result: { type: "text", file: { filePath: options.filePath, content } } }
      : {}),
    ...(options.meta === false
      ? {}
      : {
          tool_result_meta: [
            {
              id,
              permission_decision: {
                decision: options.decision ?? "accept",
                source: "config",
                reason_type: "rule",
              },
            },
          ],
        }),
  });

/** The method's own words about permissions, as a reference's text holds them. */
export const REFERENCE_TEXT =
  "With nobody present (headless, bypassPermissions or dontAsk) the hook asks for --mode; auth is a login or a permission.";

/** The two lines of an accepted Read of a reference whose text holds the denial words (the false flag of finding 118). */
export const acceptedRead = (id: string, file: string): string[] => [
  toolUse(id, "Read", { file_path: reference(file) }),
  toolResult(id, `1\t# ${file}\n2\t${REFERENCE_TEXT}`, { filePath: reference(file) }),
];

/** The two lines of a Read of a reference the kit denied: an error result, rejected in its metadata. */
export const deniedRead = (id: string, file: string): string[] => [
  toolUse(id, "Read", { file_path: reference(file) }),
  toolResult(
    id,
    "Permission to use Read has been denied because Claude Code is running in don't ask mode.",
    { isError: true, decision: "reject" },
  ),
];

/** Writes a trace of the given lines and returns its path, the one an aggregate names as `tracePath`. */
export const writeTrace = (path: string, lines: readonly string[]): string => {
  writeFileSync(path, `${lines.join("\n")}\n`);
  return path;
};

/** The smallest aggregate `scanResults` reads: one case per entry, each run named by its trace path. */
export const scanAggregate = (cases: Record<string, string[]>): string =>
  JSON.stringify({
    cases: Object.entries(cases).map(([name, traces]) => ({
      name,
      arms: { with: traces.map((tracePath) => ({ tracePath })) },
    })),
  });
