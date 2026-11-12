import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkItem } from "../src/types.ts";
import { loadWork, saveWork } from "../src/work.ts";
import { cliIo, makeRepo, repoPaths, testEnv } from "./helpers.ts";

const ANSWERS = JSON.stringify({
  work_type: "chore",
  is_vague: 0.1,
  scope: 0,
  touches_auth: 0,
  touches_payments: 0,
  touches_personal_data: 0,
  touches_data_migration: 0,
  touches_infra: 0,
  touches_public_api: 0,
});

export const GRANTED_TAIL =
  "team.continuations is granted: a round past a cap needs no crew continue";

/** A repository with one fast item started under the policy given, and the command run against it. */
export async function item(policy?: Record<string, unknown>) {
  const root = makeRepo({ "package.json": JSON.stringify({ scripts: { test: "exit 0" } }) });
  const env = testEnv();
  if (policy) {
    mkdirSync(join(root, ".crew"), { recursive: true });
    writeFileSync(join(root, ".crew", "policy.json"), JSON.stringify(policy));
  }
  const run = cliIo(root, env);
  const started = await run("start", "Tidy the docs", "--answers", ANSWERS, "--criterion", "x");
  const id = /started (\S+)/.exec(started.out)?.[1] ?? "";
  const paths = repoPaths(root, env);
  const work = (): WorkItem => loadWork(paths, id).work as WorkItem;
  /** Entries put on the record as the engine's own writer saves them, for the shapes no command of one row reaches. */
  const record = (entries: NonNullable<WorkItem["continued"]>): void => {
    const current = work();
    current.continued = [...(current.continued ?? []), ...entries];
    saveWork(paths, current);
  };
  const line = async (): Promise<string | undefined> =>
    (await run("status")).out.split("\n").find((l) => l.startsWith("  continuations:"));
  const json = async (): Promise<Record<string, unknown>> =>
    JSON.parse((await run("status", "--json")).out) as Record<string, unknown>;
  return { root, env, run, id, paths, work, record, line, json };
}
